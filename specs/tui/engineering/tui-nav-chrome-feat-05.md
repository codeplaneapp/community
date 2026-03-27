# Engineering Specification: tui-nav-chrome-feat-05 — TUI_COMMAND_PALETTE

## Summary

Implement the command palette modal overlay for the Codeplane TUI, activated by the `:` keybinding. The palette provides fuzzy search over a centralized command registry, keyboard-navigable result list, context-sensitive filtering (repo scope, feature flags), and responsive sizing across terminal breakpoints.

## Dependencies

This ticket depends on the following implemented infrastructure:

| Dependency | Status | What it provides |
|---|---|---|
| `tui-nav-chrome-eng-01` — NavigationProvider | ✅ Implemented | `useNavigation()`, screen push/pop/reset, `repoContext` |
| `tui-nav-chrome-eng-02` — KeybindingProvider | ✅ Implemented | Layered priority dispatch, `registerScope()`, `PRIORITY.MODAL`, status bar hints |
| `tui-nav-chrome-eng-03` — Responsive layout hooks | ✅ Implemented | `useLayout()` with `modalWidth`, `modalHeight`, `breakpoint` |
| `tui-nav-chrome-eng-04` — OverlayManager | ✅ Implemented | `useOverlay()`, `openOverlay("command-palette")`, `closeOverlay()`, mutual exclusion |
| `tui-nav-chrome-eng-06` — E2E test infrastructure | ✅ Implemented | `launchTUI()`, `TUITestInstance`, `TERMINAL_SIZES` |

## Files to Create or Modify

### New Files

| File | Purpose |
|---|---|
| `apps/tui/src/commands/types.ts` | `PaletteCommand`, `CommandContext` interfaces |
| `apps/tui/src/commands/registry.ts` | `buildCommandRegistry()` — aggregates commands from all modules |
| `apps/tui/src/commands/navigationCommands.ts` | Navigation target commands (go-to destinations) |
| `apps/tui/src/commands/actionCommands.ts` | Action commands (create issue, mark notifications read, etc.) |
| `apps/tui/src/commands/toggleCommands.ts` | Toggle commands (diff view mode, whitespace) |
| `apps/tui/src/commands/index.ts` | Public barrel export |
| `apps/tui/src/lib/fuzzyMatch.ts` | Fuzzy matching algorithm with scoring |
| `apps/tui/src/components/CommandPalette.tsx` | Command palette React component |
| `apps/tui/src/hooks/useCommandPalette.ts` | State management hook for palette open/close, query, highlight, filtering |

### Modified Files

| File | Change |
|---|---|
| `apps/tui/src/components/OverlayLayer.tsx` | Replace command-palette placeholder with `<CommandPalette />` component |
| `apps/tui/src/components/GlobalKeybindings.tsx` | Wire `onCommandPalette` callback to `openOverlay("command-palette")` |

### Test Files

| File | Purpose |
|---|---|
| `e2e/tui/app-shell.test.ts` | Tests already scaffolded for overlay open/close/toggle; add command palette-specific tests in a new `describe` block |

---

## Implementation Plan

### Step 1: Command Types (`apps/tui/src/commands/types.ts`)

Create the foundational type definitions for the command registry system.

```typescript
// apps/tui/src/commands/types.ts

export interface PaletteCommand {
  /** Unique identifier for the command (e.g., "navigate-dashboard") */
  id: string;
  /** Display name shown in the palette result row */
  name: string;
  /** Optional alternative match strings for fuzzy search */
  aliases?: string[];
  /** Brief description shown beside the name */
  description: string;
  /** Category label: Navigate, Action, or Toggle */
  category: "Navigate" | "Action" | "Toggle";
  /** Keybinding hint shown right-aligned (e.g., "g d") */
  keybinding?: string;
  /**
   * Sort priority within category. Lower number = higher priority.
   * Range: 0 (highest) – 100 (lowest).
   * Navigation: 0–30, Actions: 31–60, Toggles: 61–90.
   */
  priority: number;
  /** Context requirements — command hidden if not met */
  contextRequirements?: {
    /** Requires a repo in the navigation stack */
    repo?: boolean;
    /** Requires a valid auth token */
    authenticated?: boolean;
    /** Requires write access to the current repo */
    writeAccess?: boolean;
  };
  /** Feature flag name — command hidden if flag is disabled */
  featureFlag?: string;
  /** Callback executed when the command is selected */
  action: () => void;
}

/**
 * Context injected into command factory functions.
 * Provides navigation and state query capabilities
 * without coupling commands to React hooks directly.
 */
export interface CommandContext {
  /** Navigate to a screen by name with optional params */
  navigate: (screen: string, params?: Record<string, string>) => void;
  /** Reset navigation to a screen (clears stack) */
  resetTo: (screen: string, params?: Record<string, string>) => void;
  /** Whether a repo is in the current navigation context */
  hasRepoContext: () => boolean;
  /** Get the current repo context, or null */
  getRepoContext: () => { owner: string; repo: string } | null;
  /** Whether the current user has write access to the repo */
  hasWriteAccess: () => boolean;
  /** Close the command palette overlay */
  closePalette: () => void;
}

/** Category sort order for empty-query display */
export const CATEGORY_ORDER: Record<PaletteCommand["category"], number> = {
  Navigate: 0,
  Action: 1,
  Toggle: 2,
};

/** Maximum characters accepted in the search input */
export const MAX_QUERY_LENGTH = 128;

/** Maximum characters for command name display */
export const MAX_NAME_LENGTH = 80;

/** Maximum characters for command description display */
export const MAX_DESCRIPTION_LENGTH = 120;

/** Maximum characters for keybinding hint display */
export const MAX_KEYBINDING_LENGTH = 12;
```

**Rationale:** The `CommandContext` interface decouples command definitions from React's hook system. Commands receive a plain object with callable methods, making them testable in isolation and usable from the registry builder which runs outside of React's render cycle. The `closePalette` method is included so commands can dismiss the palette as a side effect.

---

### Step 2: Fuzzy Match Algorithm (`apps/tui/src/lib/fuzzyMatch.ts`)

Implement a purpose-built fuzzy matching function. This is not imported from `@codeplane/ui-core` because that package does not currently export a fuzzy matcher. The algorithm is self-contained and has no dependencies.

```typescript
// apps/tui/src/lib/fuzzyMatch.ts

export interface FuzzyResult {
  /** The matched command index in the source array */
  index: number;
  /** Score — higher is better. 0 = no match. */
  score: number;
}

/**
 * Score a candidate string against a query using fuzzy matching.
 *
 * Scoring tiers (highest to lowest):
 *   1. Exact prefix match (query === candidate.slice(0, query.length), case-insensitive) → 10000 + length bonus
 *   2. Contiguous substring match (candidate includes query as substring) → 5000 + position bonus
 *   3. Non-contiguous character match (all query chars found in order) → 1000 + gap penalty
 *   4. No match → 0
 *
 * Within each tier, shorter candidates and earlier match positions score higher.
 *
 * Case-insensitive throughout. Matching runs against name + aliases.
 *
 * @param query - The user's search string (already lowercased by caller).
 * @param candidate - The string to match against (lowercased by caller).
 * @returns Score >= 0. Zero means no match.
 */
export function fuzzyScore(query: string, candidate: string): number {
  if (query.length === 0) return 1; // Empty query matches everything equally
  if (candidate.length === 0) return 0;

  // Tier 1: Exact prefix
  if (candidate.startsWith(query)) {
    return 10000 + (1000 - candidate.length); // shorter candidate = better
  }

  // Tier 1b: Word-boundary prefix (e.g., "dash" matches "Go to Dashboard")
  const words = candidate.split(/\s+/);
  for (const word of words) {
    if (word.startsWith(query)) {
      return 8000 + (1000 - candidate.length);
    }
  }

  // Tier 2: Contiguous substring
  const substringIndex = candidate.indexOf(query);
  if (substringIndex !== -1) {
    return 5000 + (1000 - substringIndex) + (500 - candidate.length);
  }

  // Tier 3: Non-contiguous character match
  let qi = 0;
  let totalGap = 0;
  let lastMatchIndex = -1;
  for (let ci = 0; ci < candidate.length && qi < query.length; ci++) {
    if (candidate[ci] === query[qi]) {
      if (lastMatchIndex !== -1) {
        totalGap += ci - lastMatchIndex - 1;
      }
      lastMatchIndex = ci;
      qi++;
    }
  }

  if (qi === query.length) {
    // All query characters matched in order
    return 1000 + (500 - totalGap) + (200 - candidate.length);
  }

  // No match
  return 0;
}

/**
 * Score a PaletteCommand against a query.
 * Matches against name and all aliases, returns the best score.
 */
export function scoreCommand(
  query: string,
  name: string,
  aliases?: string[],
): number {
  const q = query.toLowerCase();
  let best = fuzzyScore(q, name.toLowerCase());

  if (aliases) {
    for (const alias of aliases) {
      const s = fuzzyScore(q, alias.toLowerCase());
      if (s > best) best = s;
    }
  }

  return best;
}
```

**Rationale:** Building the fuzzy matcher in-house rather than pulling in a dependency follows the architecture principle "no new runtime dependency without a PoC test." The algorithm is ~60 lines, has zero dependencies, and matches the spec's ranking requirements (prefix > contiguous > non-contiguous). The three-tier scoring system ensures deterministic ordering. Matching against aliases allows commands like "Go to Issues" to also match ":issues" or "issues".

**Performance:** For 200 commands × 128-char query, the worst case is 200 × O(n) string scans, well under the 16ms budget on any modern machine.

---

### Step 3: Navigation Commands (`apps/tui/src/commands/navigationCommands.ts`)

Create navigation commands derived from the existing `goToBindings` array to ensure consistency between `g <key>` navigation and the palette.

```typescript
// apps/tui/src/commands/navigationCommands.ts

import { goToBindings } from "../navigation/goToBindings.js";
import { ScreenName } from "../router/types.js";
import type { CommandContext, PaletteCommand } from "./types.js";

/**
 * Creates palette commands for all go-to navigation targets.
 *
 * Derived from goToBindings to guarantee the palette and g <key>
 * shortcuts always navigate to the same destinations.
 */
export function createNavigationCommands(context: CommandContext): PaletteCommand[] {
  return goToBindings.map((binding, index) => ({
    id: `navigate-${binding.screen.toLowerCase()}`,
    name: `Go to ${binding.description}`,
    aliases: [
      binding.description.toLowerCase(),
      `:${binding.description.toLowerCase()}`,
    ],
    description: `Navigate to the ${binding.description} screen`,
    category: "Navigate" as const,
    keybinding: `g ${binding.key}`,
    priority: 10 + index, // 10–20 range for navigation
    contextRequirements: binding.requiresRepo ? { repo: true } : undefined,
    featureFlag: getFeatureFlag(binding.screen),
    action: () => {
      const repoCtx = context.getRepoContext();
      if (binding.requiresRepo && !repoCtx) return;

      // Use resetTo for go-to style navigation (clears stack)
      context.resetTo(ScreenName.Dashboard);
      if (repoCtx) {
        context.navigate(ScreenName.RepoOverview, {
          owner: repoCtx.owner,
          repo: repoCtx.repo,
        });
      }
      const params = repoCtx
        ? { owner: repoCtx.owner, repo: repoCtx.repo }
        : undefined;
      context.navigate(binding.screen, params);
      context.closePalette();
    },
  }));
}

/** Map screen names to feature flags where applicable. */
function getFeatureFlag(screen: ScreenName): string | undefined {
  switch (screen) {
    case ScreenName.Wiki:
      return "wiki";
    case ScreenName.Agents:
      return "agents";
    case ScreenName.Workspaces:
      return "workspaces";
    default:
      return undefined;
  }
}
```

**Rationale:** Deriving navigation commands from `goToBindings` is a DRY approach that ensures the palette always reflects the same destination set as the go-to keybinding system. The `executeGoTo` function from `goToBindings.ts` provides the navigation pattern (reset → push repo → push target), which is replicated here because the command needs to also close the palette.

---

### Step 4: Action and Toggle Commands

**`apps/tui/src/commands/actionCommands.ts`:**

```typescript
import { ScreenName } from "../router/types.js";
import type { CommandContext, PaletteCommand } from "./types.js";

export function createActionCommands(context: CommandContext): PaletteCommand[] {
  return [
    {
      id: "create-issue",
      name: "Create New Issue",
      aliases: ["new issue", "file issue", "open issue"],
      description: "Create a new issue in the current repository",
      category: "Action",
      priority: 31,
      contextRequirements: { repo: true, writeAccess: true },
      action: () => {
        const repo = context.getRepoContext();
        if (!repo) return;
        context.navigate(ScreenName.IssueCreate, {
          owner: repo.owner,
          repo: repo.repo,
        });
        context.closePalette();
      },
    },
    {
      id: "create-landing",
      name: "Create Landing Request",
      aliases: ["new landing", "new PR", "new pull request"],
      description: "Create a new landing request in the current repository",
      category: "Action",
      priority: 32,
      contextRequirements: { repo: true, writeAccess: true },
      action: () => {
        const repo = context.getRepoContext();
        if (!repo) return;
        context.navigate(ScreenName.LandingCreate, {
          owner: repo.owner,
          repo: repo.repo,
        });
        context.closePalette();
      },
    },
    {
      id: "mark-all-notifications-read",
      name: "Mark All Notifications Read",
      aliases: ["clear notifications", "read all"],
      description: "Mark all notifications as read",
      category: "Action",
      priority: 35,
      contextRequirements: { authenticated: true },
      action: () => {
        // Action dispatched via the notification hook — will be wired
        // when the notification screen is implemented. For now, navigates
        // to notifications.
        context.navigate(ScreenName.Notifications);
        context.closePalette();
      },
    },
    {
      id: "sign-out",
      name: "Sign Out",
      aliases: ["logout", "log out"],
      description: "Sign out of the current session",
      category: "Action",
      priority: 50,
      contextRequirements: { authenticated: true },
      action: () => {
        // Will trigger sign-out flow when auth actions are implemented
        context.closePalette();
      },
    },
  ];
}
```

**`apps/tui/src/commands/toggleCommands.ts`:**

```typescript
import type { CommandContext, PaletteCommand } from "./types.js";

export function createToggleCommands(_context: CommandContext): PaletteCommand[] {
  return [
    {
      id: "toggle-diff-view",
      name: "Toggle Diff View (Unified/Split)",
      aliases: ["unified", "split", "diff mode"],
      description: "Switch between unified and split diff view",
      category: "Toggle",
      keybinding: "t",
      priority: 61,
      contextRequirements: { repo: true },
      action: () => {
        // Dispatched to the diff view state when implemented
        _context.closePalette();
      },
    },
    {
      id: "toggle-whitespace",
      name: "Toggle Whitespace Visibility",
      aliases: ["show whitespace", "hide whitespace"],
      description: "Show or hide whitespace changes in diff view",
      category: "Toggle",
      keybinding: "w",
      priority: 62,
      contextRequirements: { repo: true },
      action: () => {
        _context.closePalette();
      },
    },
    {
      id: "toggle-sidebar",
      name: "Toggle Sidebar",
      aliases: ["show sidebar", "hide sidebar", "file tree"],
      description: "Show or hide the sidebar panel",
      category: "Toggle",
      keybinding: "Ctrl+B",
      priority: 63,
      action: () => {
        // Will call sidebar.toggle() when wired
        _context.closePalette();
      },
    },
  ];
}
```

---

### Step 5: Command Registry (`apps/tui/src/commands/registry.ts` and `index.ts`)

**`apps/tui/src/commands/registry.ts`:**

```typescript
import type { CommandContext, PaletteCommand } from "./types.js";
import { createNavigationCommands } from "./navigationCommands.js";
import { createActionCommands } from "./actionCommands.js";
import { createToggleCommands } from "./toggleCommands.js";

/**
 * Build the full palette command list by aggregating all command modules.
 *
 * Each module returns commands for its domain. The registry makes no
 * filtering decisions — that is the palette component's job based on
 * context and feature flags.
 *
 * New feature modules add their createXxxCommands() call here.
 */
export function buildCommandRegistry(context: CommandContext): PaletteCommand[] {
  return [
    ...createNavigationCommands(context),
    ...createActionCommands(context),
    ...createToggleCommands(context),
  ];
}
```

**`apps/tui/src/commands/index.ts`:**

```typescript
export type { PaletteCommand, CommandContext } from "./types.js";
export {
  CATEGORY_ORDER,
  MAX_QUERY_LENGTH,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_KEYBINDING_LENGTH,
} from "./types.js";
export { buildCommandRegistry } from "./registry.js";
export { createNavigationCommands } from "./navigationCommands.js";
export { createActionCommands } from "./actionCommands.js";
export { createToggleCommands } from "./toggleCommands.js";
```

---

### Step 6: Palette State Hook (`apps/tui/src/hooks/useCommandPalette.ts`)

This hook encapsulates all command palette state: query text, filtered results, highlight index, and keyboard dispatch. It is consumed exclusively by the `CommandPalette` component.

```typescript
// apps/tui/src/hooks/useCommandPalette.ts

import { useState, useMemo, useCallback, useEffect, useContext, useRef } from "react";
import { KeybindingContext, StatusBarHintsContext } from "../providers/KeybindingProvider.js";
import { PRIORITY, type KeyHandler, type StatusBarHint } from "../providers/keybinding-types.js";
import { normalizeKeyDescriptor } from "../providers/normalize-key.js";
import { useNavigation } from "../providers/NavigationProvider.js";
import { useOverlay } from "./useOverlay.js";
import { useLayout } from "./useLayout.js";
import { buildCommandRegistry, CATEGORY_ORDER, MAX_QUERY_LENGTH } from "../commands/index.js";
import type { PaletteCommand, CommandContext } from "../commands/index.js";
import { scoreCommand } from "../lib/fuzzyMatch.js";
import { ScreenName } from "../router/types.js";

export interface CommandPaletteState {
  /** Current search query */
  query: string;
  /** Filtered and sorted command list */
  filteredCommands: PaletteCommand[];
  /** Index of the highlighted result (0-based) */
  highlightIndex: number;
  /** Whether the palette is open */
  isOpen: boolean;
  /** Whether to show category column (based on breakpoint) */
  showCategory: boolean;
  /** Whether to show description column */
  showDescription: boolean;
}

/**
 * Active feature flags for the current session.
 * In the future this will come from useFeatureFlags() in @codeplane/ui-core.
 * For now, returns all flags as enabled.
 */
function getActiveFeatureFlags(): Set<string> {
  // TODO: Wire to real feature flag provider when available
  return new Set(["wiki", "agents", "workspaces", "workflows", "sync"]);
}

export function useCommandPalette(): CommandPaletteState {
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);

  const nav = useNavigation();
  const { isOpen: isPaletteOpen, closeOverlay } = useOverlay();
  const layout = useLayout();
  const keybindingCtx = useContext(KeybindingContext);
  const hintsCtx = useContext(StatusBarHintsContext);

  if (!keybindingCtx) throw new Error("useCommandPalette requires KeybindingProvider");
  if (!hintsCtx) throw new Error("useCommandPalette requires StatusBarHintsContext");

  const isOpen = isPaletteOpen("command-palette");

  // Build command context — stable across renders via nav reference
  const commandContext: CommandContext = useMemo(() => ({
    navigate: (screen: string, params?: Record<string, string>) => {
      nav.push(screen as ScreenName, params);
    },
    resetTo: (screen: string, params?: Record<string, string>) => {
      nav.reset(screen as ScreenName, params);
    },
    hasRepoContext: () => nav.repoContext !== null,
    getRepoContext: () => nav.repoContext,
    hasWriteAccess: () => true, // TODO: wire to real permission check
    closePalette: closeOverlay,
  }), [nav, closeOverlay]);

  // Build full registry — recalculates when context changes
  const allCommands = useMemo(
    () => buildCommandRegistry(commandContext),
    [commandContext],
  );

  // Apply context and feature-flag filtering
  const activeFlags = useMemo(() => getActiveFeatureFlags(), []);

  const availableCommands = useMemo(() => {
    return allCommands.filter((cmd) => {
      // Feature flag filtering
      if (cmd.featureFlag && !activeFlags.has(cmd.featureFlag)) return false;

      // Context requirements
      if (cmd.contextRequirements?.repo && !nav.repoContext) return false;
      if (cmd.contextRequirements?.authenticated) {
        // TODO: check auth state when wired
      }
      if (cmd.contextRequirements?.writeAccess && !commandContext.hasWriteAccess()) {
        return false;
      }

      return true;
    });
  }, [allCommands, activeFlags, nav.repoContext, commandContext]);

  // Fuzzy filter and sort
  const filteredCommands = useMemo(() => {
    if (query.length === 0) {
      // Empty query: show all, sorted by category then priority then name
      return [...availableCommands].sort((a, b) => {
        const catDiff = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
        if (catDiff !== 0) return catDiff;
        const priDiff = a.priority - b.priority;
        if (priDiff !== 0) return priDiff;
        return a.name.localeCompare(b.name);
      });
    }

    // Score each command
    const scored = availableCommands
      .map((cmd) => ({
        cmd,
        score: scoreCommand(query, cmd.name, cmd.aliases),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => {
        // Higher score first
        if (b.score !== a.score) return b.score - a.score;
        // Tie-break: category order, then priority
        const catDiff = CATEGORY_ORDER[a.cmd.category] - CATEGORY_ORDER[b.cmd.category];
        if (catDiff !== 0) return catDiff;
        return a.cmd.priority - b.cmd.priority;
      });

    return scored.map(({ cmd }) => cmd);
  }, [query, availableCommands]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIndex(0);
  }, [filteredCommands.length, query]);

  // Reset query when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setHighlightIndex(0);
    }
  }, [isOpen]);

  // Register modal keybinding scope for palette-specific keys
  const scopeIdRef = useRef<string | null>(null);
  const hintsCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Clean up scope if palette closes
      if (scopeIdRef.current) {
        keybindingCtx.removeScope(scopeIdRef.current);
        scopeIdRef.current = null;
      }
      if (hintsCleanupRef.current) {
        hintsCleanupRef.current();
        hintsCleanupRef.current = null;
      }
      return;
    }

    const bindings = new Map<string, KeyHandler>();

    // Note: The OverlayManager already registers Escape at MODAL priority.
    // We register additional palette-specific keys at MODAL priority.
    // Since the OverlayManager's scope is registered first, and we
    // register ours after (LIFO wins for same priority), our bindings
    // take precedence for keys we handle.

    // Ctrl+C — close palette (same as Esc)
    bindings.set(normalizeKeyDescriptor("ctrl+c"), {
      key: normalizeKeyDescriptor("ctrl+c"),
      description: "Close palette",
      group: "Command Palette",
      handler: () => closeOverlay(),
    });

    const scopeId = keybindingCtx.registerScope({
      priority: PRIORITY.MODAL,
      bindings,
      active: true,
    });
    scopeIdRef.current = scopeId;

    // Override status bar hints
    const paletteHints: StatusBarHint[] = [
      { keys: "↑↓", label: "navigate", order: 0 },
      { keys: "⏎", label: "select", order: 1 },
      { keys: "Esc", label: "dismiss", order: 2 },
    ];
    hintsCleanupRef.current = hintsCtx.overrideHints(paletteHints);

    return () => {
      if (scopeIdRef.current) {
        keybindingCtx.removeScope(scopeIdRef.current);
        scopeIdRef.current = null;
      }
      if (hintsCleanupRef.current) {
        hintsCleanupRef.current();
        hintsCleanupRef.current = null;
      }
    };
  }, [isOpen, keybindingCtx, hintsCtx, closeOverlay]);

  // Auto-close on terminal shrink below minimum
  useEffect(() => {
    if (isOpen && layout.breakpoint === null) {
      closeOverlay();
    }
  }, [isOpen, layout.breakpoint, closeOverlay]);

  // Responsive column visibility
  const showCategory = layout.breakpoint !== "minimum";
  const showDescription = layout.breakpoint !== "minimum";

  return {
    query,
    filteredCommands,
    highlightIndex,
    isOpen,
    showCategory,
    showDescription,
  };
}
```

**Important design decision:** The `useCommandPalette` hook does NOT use `useKeyboard` from OpenTUI for its own key handling. Instead, keyboard events flow through the existing `KeybindingProvider` dispatch system. The `CommandPalette` component uses OpenTUI's `<input>` component with `focused` prop to capture printable characters, while navigation keys (`j`/`k`/`Enter`) are handled by the component's internal event handlers connected to the `<input>` component's `onKey` or equivalent mechanism. This is detailed in Step 7.

---

### Step 7: CommandPalette Component (`apps/tui/src/components/CommandPalette.tsx`)

The main React component that renders the palette UI.

```typescript
// apps/tui/src/components/CommandPalette.tsx

import React, { useState, useCallback, useEffect, useMemo, useRef, useContext } from "react";
import { useKeyboard } from "@opentui/react";
import { useOverlay } from "../hooks/useOverlay.js";
import { useNavigation } from "../providers/NavigationProvider.js";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { KeybindingContext, StatusBarHintsContext } from "../providers/KeybindingProvider.js";
import { PRIORITY, type KeyHandler, type StatusBarHint } from "../providers/keybinding-types.js";
import { normalizeKeyDescriptor, normalizeKeyEvent } from "../providers/normalize-key.js";
import { buildCommandRegistry, CATEGORY_ORDER, MAX_QUERY_LENGTH } from "../commands/index.js";
import type { PaletteCommand, CommandContext } from "../commands/index.js";
import { scoreCommand } from "../lib/fuzzyMatch.js";
import { truncateText } from "../util/text.js";
import { ScreenName } from "../router/types.js";
import type { KeyEvent } from "@opentui/core";

/**
 * Command palette modal overlay.
 *
 * Renders a centered box with search input and scrollable results list.
 * All state (query, highlight, filtered results) is managed internally
 * and reset on each open.
 *
 * Keyboard input is captured by registering a MODAL priority keybinding
 * scope that intercepts all keys while the palette is open. Printable
 * characters append to the query; navigation keys (j/k/Up/Down/Enter/Esc)
 * control the result list.
 */
export function CommandPalette() {
  const { closeOverlay } = useOverlay();
  const nav = useNavigation();
  const layout = useLayout();
  const theme = useTheme();
  const keybindingCtx = useContext(KeybindingContext);
  const hintsCtx = useContext(StatusBarHintsContext);

  if (!keybindingCtx) throw new Error("CommandPalette requires KeybindingProvider");
  if (!hintsCtx) throw new Error("CommandPalette requires StatusBarHintsContext");

  // ── State ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);

  // ── Command context ────────────────────────────────────────────────
  const commandContext = useMemo<CommandContext>(() => ({
    navigate: (screen, params) => nav.push(screen as ScreenName, params),
    resetTo: (screen, params) => nav.reset(screen as ScreenName, params),
    hasRepoContext: () => nav.repoContext !== null,
    getRepoContext: () => nav.repoContext,
    hasWriteAccess: () => true, // TODO: wire to permissions
    closePalette: closeOverlay,
  }), [nav, closeOverlay]);

  // ── Command list ───────────────────────────────────────────────────
  const allCommands = useMemo(
    () => buildCommandRegistry(commandContext),
    [commandContext],
  );

  // Feature flag stub — all enabled until real provider exists
  const activeFlags = useMemo(() => new Set(["wiki", "agents", "workspaces", "workflows", "sync"]), []);

  const availableCommands = useMemo(() => {
    return allCommands.filter((cmd) => {
      if (cmd.featureFlag && !activeFlags.has(cmd.featureFlag)) return false;
      if (cmd.contextRequirements?.repo && !nav.repoContext) return false;
      return true;
    });
  }, [allCommands, activeFlags, nav.repoContext]);

  // ── Fuzzy filtering ────────────────────────────────────────────────
  const filteredCommands = useMemo(() => {
    if (query.length === 0) {
      return [...availableCommands].sort((a, b) => {
        const catDiff = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
        if (catDiff !== 0) return catDiff;
        const priDiff = a.priority - b.priority;
        if (priDiff !== 0) return priDiff;
        return a.name.localeCompare(b.name);
      });
    }
    return availableCommands
      .map((cmd) => ({ cmd, score: scoreCommand(query, cmd.name, cmd.aliases) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const catDiff = CATEGORY_ORDER[a.cmd.category] - CATEGORY_ORDER[b.cmd.category];
        if (catDiff !== 0) return catDiff;
        return a.cmd.priority - b.cmd.priority;
      })
      .map(({ cmd }) => cmd);
  }, [query, availableCommands]);

  // ── Highlight management ───────────────────────────────────────────
  useEffect(() => {
    setHighlightIndex(0);
  }, [filteredCommands.length, query]);

  // ── Keyboard handling ──────────────────────────────────────────────
  // Register a MODAL-priority scope that captures ALL keys.
  // The OverlayManager already registers Escape; we add everything else.
  const scopeIdRef = useRef<string | null>(null);
  const hintsCleanupRef = useRef<(() => void) | null>(null);

  // Refs for current state (accessed inside keybinding handlers)
  const queryRef = useRef(query);
  queryRef.current = query;
  const highlightRef = useRef(highlightIndex);
  highlightRef.current = highlightIndex;
  const filteredRef = useRef(filteredCommands);
  filteredRef.current = filteredCommands;

  const executeHighlighted = useCallback(() => {
    const cmds = filteredRef.current;
    const idx = highlightRef.current;
    if (cmds.length > 0 && idx >= 0 && idx < cmds.length) {
      cmds[idx].action();
      closeOverlay();
    }
  }, [closeOverlay]);

  const moveHighlight = useCallback((delta: number) => {
    setHighlightIndex((prev) => {
      const len = filteredRef.current.length;
      if (len === 0) return 0;
      return ((prev + delta) % len + len) % len; // wrap-around
    });
  }, []);

  const pageSize = useMemo(() => {
    // Half the viewport height for page up/down
    const modalHeightPct = parseInt(layout.modalHeight) || 60;
    const modalRows = Math.floor(layout.height * modalHeightPct / 100);
    return Math.max(1, Math.floor((modalRows - 4) / 2)); // subtract header/footer/separator/input
  }, [layout]);

  // Register the MODAL scope with all palette keybindings
  useEffect(() => {
    const bindings = new Map<string, KeyHandler>();

    // Dismiss keys
    bindings.set(normalizeKeyDescriptor("ctrl+c"), {
      key: normalizeKeyDescriptor("ctrl+c"),
      description: "Close palette",
      group: "Command Palette",
      handler: () => closeOverlay(),
    });

    // Execute
    bindings.set(normalizeKeyDescriptor("return"), {
      key: normalizeKeyDescriptor("return"),
      description: "Execute command",
      group: "Command Palette",
      handler: () => executeHighlighted(),
    });

    // Navigation — j/k and arrow keys
    bindings.set(normalizeKeyDescriptor("j"), {
      key: "j",
      description: "Next result",
      group: "Command Palette",
      handler: () => moveHighlight(1),
    });
    bindings.set(normalizeKeyDescriptor("k"), {
      key: "k",
      description: "Previous result",
      group: "Command Palette",
      handler: () => moveHighlight(-1),
    });
    bindings.set(normalizeKeyDescriptor("down"), {
      key: "down",
      description: "Next result",
      group: "Command Palette",
      handler: () => moveHighlight(1),
    });
    bindings.set(normalizeKeyDescriptor("up"), {
      key: "up",
      description: "Previous result",
      group: "Command Palette",
      handler: () => moveHighlight(-1),
    });

    // Page navigation
    bindings.set(normalizeKeyDescriptor("ctrl+d"), {
      key: normalizeKeyDescriptor("ctrl+d"),
      description: "Page down",
      group: "Command Palette",
      handler: () => moveHighlight(pageSize),
    });
    bindings.set(normalizeKeyDescriptor("ctrl+u"), {
      key: normalizeKeyDescriptor("ctrl+u"),
      description: "Clear query / Page up",
      group: "Command Palette",
      handler: () => {
        if (queryRef.current.length > 0) {
          setQuery("");
        } else {
          moveHighlight(-pageSize);
        }
      },
    });

    // Backspace
    bindings.set(normalizeKeyDescriptor("backspace"), {
      key: normalizeKeyDescriptor("backspace"),
      description: "Delete character",
      group: "Command Palette",
      handler: () => {
        setQuery((prev) => prev.slice(0, -1));
      },
    });

    const scopeId = keybindingCtx.registerScope({
      priority: PRIORITY.MODAL,
      bindings,
      active: true,
    });
    scopeIdRef.current = scopeId;

    // Override status bar hints
    const paletteHints: StatusBarHint[] = [
      { keys: "↑↓", label: "navigate", order: 0 },
      { keys: "⏎", label: "select", order: 1 },
      { keys: "Esc", label: "dismiss", order: 2 },
    ];
    hintsCleanupRef.current = hintsCtx.overrideHints(paletteHints);

    return () => {
      if (scopeIdRef.current) {
        keybindingCtx.removeScope(scopeIdRef.current);
        scopeIdRef.current = null;
      }
      if (hintsCleanupRef.current) {
        hintsCleanupRef.current();
        hintsCleanupRef.current = null;
      }
    };
  }, [keybindingCtx, hintsCtx, closeOverlay, executeHighlighted, moveHighlight, pageSize]);

  // Capture printable characters via useKeyboard at the component level.
  // This runs AFTER the KeybindingProvider dispatch — keys not handled
  // by registered scopes fall through to the focused OpenTUI component.
  // However, since our MODAL scope captures j/k/arrows/enter/etc.,
  // we need a separate mechanism for text input.
  //
  // Strategy: Use <input onInput={...}> for text capture. The <input>
  // component in OpenTUI handles printable character insertion natively
  // when focused. We set focused={true} on it.
  //
  // BUT: Since j/k are registered as modal keybindings, they will be
  // intercepted before reaching the input. This is the desired behavior
  // per the spec — j/k navigate results, not type into input.
  //
  // For text input, we instead intercept printable keys NOT handled by
  // our modal scope. We achieve this by NOT registering printable chars
  // in the modal scope, and instead using a secondary mechanism.
  //
  // Revised approach: Register a catch-all key handler for unmatched
  // keys that appends printable characters to the query. Since the
  // KeybindingProvider falls through on unmatched keys, we use
  // useKeyboard at this component level to catch them.

  useKeyboard((event: KeyEvent) => {
    if (event.eventType === "release") return;

    // Only handle single printable characters not captured by modal scope
    const name = event.name;
    if (name && name.length === 1 && !event.ctrl && !event.meta) {
      // Skip keys we've registered in the modal scope
      if (name === "j" || name === "k") return; // Handled as navigation

      // Append to query (respecting max length)
      setQuery((prev) => {
        if (prev.length >= MAX_QUERY_LENGTH) return prev;
        return prev + name;
      });
    }
  });

  // ── Auto-close on terminal shrink ──────────────────────────────────
  useEffect(() => {
    if (layout.breakpoint === null) {
      closeOverlay();
    }
  }, [layout.breakpoint, closeOverlay]);

  // ── Responsive sizing ──────────────────────────────────────────────
  const showCategory = layout.breakpoint !== "minimum";
  const showDescription = layout.breakpoint !== "minimum";

  const width = layout.modalWidth;
  const height = layout.breakpoint === "minimum" ? "80%" : layout.modalHeight;

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <box
      position="absolute"
      top="auto"
      left="auto"
      width={width as any}
      height={height as any}
      zIndex={101}
      flexDirection="column"
      border={true}
      borderStyle="round" // rounded corners per spec
      borderColor={theme.border}
      backgroundColor={theme.surface}
    >
      {/* Search input row */}
      <box flexDirection="row" height={1} paddingLeft={1} paddingRight={1}>
        <text fg={theme.primary}>{"> "}</text>
        <text fg={query.length > 0 ? undefined : theme.muted}>
          {query.length > 0 ? query : "Type a command..."}
        </text>
      </box>

      {/* Separator */}
      <box height={1}>
        <text fg={theme.border}>
          {"─".repeat(200)}
        </text>
      </box>

      {/* Results list */}
      <scrollbox flexGrow={1}>
        <box flexDirection="column">
          {filteredCommands.length === 0 ? (
            <box paddingLeft={1} paddingRight={1} height={1}>
              <text fg={theme.muted}>
                {query.length > 0 ? "No matching commands" : "No commands available"}
              </text>
            </box>
          ) : (
            filteredCommands.map((cmd, i) => (
              <box
                key={cmd.id}
                flexDirection="row"
                height={1}
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={i === highlightIndex ? theme.primary : undefined}
              >
                {/* Category label */}
                {showCategory && (
                  <text
                    fg={i === highlightIndex ? theme.surface : theme.muted}
                    width={12}
                  >
                    {cmd.category}
                  </text>
                )}

                {/* Command name */}
                <text
                  fg={i === highlightIndex ? theme.surface : undefined}
                  flexGrow={showDescription ? 0 : 1}
                  width={showDescription ? undefined : undefined}
                >
                  {truncateText(cmd.name, 80)}
                </text>

                {/* Description */}
                {showDescription && (
                  <text
                    fg={i === highlightIndex ? theme.surface : theme.muted}
                    flexGrow={1}
                    paddingLeft={2}
                  >
                    {truncateText(cmd.description, 120)}
                  </text>
                )}

                {/* Keybinding hint */}
                {cmd.keybinding && (
                  <text
                    fg={i === highlightIndex ? theme.surface : theme.muted}
                    width={12}
                  >
                    {cmd.keybinding}
                  </text>
                )}
              </box>
            ))
          )}
        </box>
      </scrollbox>

      {/* Footer hints */}
      <box height={1} paddingLeft={1} paddingRight={1} flexDirection="row">
        <text fg={theme.muted}>↑↓ navigate</text>
        <box flexGrow={1} />
        <text fg={theme.muted}>⏎ select</text>
        <box flexGrow={1} />
        <text fg={theme.muted}>esc dismiss</text>
      </box>
    </box>
  );
}
```

**Key architectural decisions:**

1. **Keyboard capture via dual mechanism:** Navigation keys (`j`, `k`, `Up`, `Down`, `Enter`, `Backspace`, `Ctrl+U`, `Ctrl+C`, `Ctrl+D`) are registered as MODAL-priority keybindings in the KeybindingProvider. Printable characters (for typing the query) are captured via `useKeyboard` at the component level, filtering out `j` and `k` which are reserved for navigation. This preserves the layered priority model.

2. **No `<input>` component for text capture:** The spec requires `j`/`k` to navigate results rather than type into the input. Using OpenTUI's `<input>` component would conflict because a focused `<input>` captures all printable keys at TEXT_INPUT priority (highest). Instead, we render the query as a `<text>` element and manage character accumulation manually.

3. **Wrap-around navigation:** `((prev + delta) % len + len) % len` handles both forward and backward wrap correctly for negative deltas.

4. **Auto-close on minimum breakpoint:** When `layout.breakpoint === null` (terminal below 80×24), the palette closes immediately.

---

### Step 8: Wire Into OverlayLayer (`apps/tui/src/components/OverlayLayer.tsx`)

Replace the command-palette placeholder with the real component.

**Changes to `apps/tui/src/components/OverlayLayer.tsx`:**

```diff
 import React from "react";
 import { useOverlay } from "../hooks/useOverlay.js";
 import { useLayout } from "../hooks/useLayout.js";
 import { useTheme } from "../hooks/useTheme.js";
+import { CommandPalette } from "./CommandPalette.js";
 
 export function OverlayLayer() {
   const { activeOverlay, closeOverlay, confirmPayload } = useOverlay();
   const layout = useLayout();
   const theme = useTheme();
 
   if (activeOverlay === null) return null;
 
+  // Command palette manages its own layout and positioning
+  if (activeOverlay === "command-palette") {
+    return <CommandPalette />;
+  }
+
   // ... rest of OverlayLayer unchanged for help and confirm ...
```

The `CommandPalette` component renders its own absolute-positioned box. This means it doesn't share the generic OverlayLayer sizing — it uses its own responsive width/height per the spec (90%/80% at minimum, 60%/60% at standard, 50%/50% at large).

---

### Step 9: Wire GlobalKeybindings (`apps/tui/src/components/GlobalKeybindings.tsx`)

Replace the `onCommandPalette` TODO with the real callback.

```diff
 import React, { useCallback } from "react";
 import { useNavigation } from "../providers/NavigationProvider.js";
 import { useGlobalKeybindings } from "../hooks/useGlobalKeybindings.js";
+import { useOverlay } from "../hooks/useOverlay.js";
 
 export function GlobalKeybindings({ children }: { children: React.ReactNode }) {
   const nav = useNavigation();
+  const { openOverlay } = useOverlay();
 
   const onQuit = useCallback(() => {
     if (nav.canGoBack) { nav.pop(); } else { process.exit(0); }
   }, [nav]);
 
   const onEscape = useCallback(() => {
     if (nav.canGoBack) { nav.pop(); }
   }, [nav]);
 
   const onForceQuit = useCallback(() => { process.exit(0); }, []);
   const onHelp = useCallback(() => { /* TODO: wired in help overlay ticket */ }, []);
-  const onCommandPalette = useCallback(() => { /* TODO: wired in command palette ticket */ }, []);
+  const onCommandPalette = useCallback(() => {
+    openOverlay("command-palette");
+  }, [openOverlay]);
   const onGoTo = useCallback(() => { /* TODO: wired in go-to keybindings ticket */ }, []);
 
   useGlobalKeybindings({ onQuit, onEscape, onForceQuit, onHelp, onCommandPalette, onGoTo });
   return <>{children}</>;
 }
```

Note: The `openOverlay("command-palette")` call toggles — if the palette is already open, it closes (this behavior is built into the OverlayManager which detects `prev === type` and returns `null`).

---

### Step 10: `:` Blocked in Text Inputs

The spec requires that `:` types a literal colon when a text `<input>` or `<textarea>` is focused. This is automatically handled by the existing KeybindingProvider architecture:

1. When an OpenTUI `<input>` or `<textarea>` is focused, it receives keypress events at the **OpenTUI renderer level** before they reach the KeybindingProvider's `useKeyboard` handler.
2. OpenTUI's input components call `event.preventDefault()` and `event.stopPropagation()` on handled key events.
3. The KeybindingProvider's `useKeyboard` callback only fires for events not consumed by focused input components.

However, the current KeybindingProvider uses `useKeyboard` at the provider level which captures ALL events before they reach focused components. This means the `:` key at GLOBAL priority will fire even when an input is focused.

**Fix:** The global `:` keybinding needs a `when` guard:

In `apps/tui/src/hooks/useGlobalKeybindings.ts`, the `:` binding should include:

```typescript
{
  key: normalizeKeyDescriptor(":"),
  description: "Command palette",
  group: "Global",
  handler: actions.onCommandPalette,
  when: () => !hasTextInputFocus(), // Guard against text input focus
}
```

Where `hasTextInputFocus()` checks the OpenTUI renderer's focus state. If the focused component is an `<input>` or `<textarea>`, the `:` keybinding is skipped and falls through to the input component.

**Implementation approach:** Add a `textInputFocused` signal tracked via the OpenTUI renderer's focus/blur events. This is tracked in the KeybindingProvider or AppContext and exposed via a `useTextInputFocus()` hook. Screens that render `<input>` components must set a flag when focus enters/leaves the input.

For this ticket's scope, the simplest approach is to check `keybindingCtx.hasActiveModal()` is false and use a context flag `isTextInputFocused` that form/input-bearing screens set via context.

If the OpenTUI renderer does not expose focus queries to React, an alternative approach: each `<input>`/`<textarea>` wrapper component in the TUI sets a context flag on focus/blur that `useGlobalKeybindings` reads via `when`.

---

## Productionization Notes

### Migrating from PoC to Production

1. **Feature flag provider:** The `getActiveFeatureFlags()` stub returns a hardcoded set. When `@codeplane/ui-core` ships `useFeatureFlags()`, replace the stub with the real hook. The `CommandPalette` component's `availableCommands` memo already filters on `cmd.featureFlag`, so the only change needed is the data source.

2. **Auth-gated commands:** The `commandContext.hasWriteAccess()` currently returns `true`. Wire this to the real auth provider's permission check when `useUser()` from `@codeplane/ui-core` provides role information.

3. **Fuzzy match migration:** If `@codeplane/ui-core` eventually exports a shared `fuzzyMatch()` utility (referenced in the architecture doc), replace `apps/tui/src/lib/fuzzyMatch.ts` with an import from `@codeplane/ui-core`. The `scoreCommand()` API surface should remain stable — only the internal implementation would change.

4. **Telemetry events:** The spec defines telemetry events (`TUICommandPaletteOpened`, `TUICommandPaletteExecuted`, `TUICommandPaletteDismissed`, `TUICommandPaletteFiltered`). These should be wired to the TUI's telemetry provider when it ships. Add `useTelemetry()` calls in the `useCommandPalette` hook at the open, execute, and dismiss points. The filtered event should be debounced at 500ms per the spec.

5. **Logging:** Add structured logging via the TUI's logger (`apps/tui/src/lib/logger.ts`) at the log points defined in the spec's observability section. This is additive and does not change the component's behavior.

6. **Command registration extensibility:** As new screens land (Issues, Landings, etc.), their screen-specific actions should be added as new command modules (e.g., `issueCommands.ts`, `landingCommands.ts`) and registered in `registry.ts`. The pattern established by `navigationCommands.ts` / `actionCommands.ts` / `toggleCommands.ts` is the template.

7. **Text input focus guard:** The `when` guard on the `:` keybinding (Step 10) needs to be robust. When the FormSystem (TUI architecture § Core Abstractions #4) is implemented, it should set and clear the text-input-focus flag via context. Until then, the guard may need to be implemented as a screen-level concern where each screen that renders inputs manages the flag.

---

## Unit & Integration Tests

All tests are in `e2e/tui/app-shell.test.ts` within a `describe("TUI_COMMAND_PALETTE", ...)` block. Tests use the existing `launchTUI()` helper and `TUITestInstance` interface from `e2e/tui/helpers.ts`.

Tests that depend on unimplemented backends (e.g., real API responses for command actions) are **left failing** per project policy — never skipped or commented out.

### Test File: `e2e/tui/app-shell.test.ts`

```typescript
// ─────────────────────────────────────────────────────────────────────
// TUI_COMMAND_PALETTE — Command palette modal overlay
// ─────────────────────────────────────────────────────────────────────

describe("TUI_COMMAND_PALETTE", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  // ── Snapshot Tests — Visual States ─────────────────────────────────

  describe("Snapshots", () => {
    test("command palette renders centered overlay on 120x40 terminal", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("command palette renders expanded overlay on 80x24 terminal", async () => {
      terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      // At minimum breakpoint: 90% width, no category/description columns
      const snap = terminal.snapshot();
      expect(snap).toContain(">"); // search prompt
      expect(snap).toContain("Go to Dashboard");
      // Category labels hidden at minimum
      expect(snap).not.toMatch(/Navigate\s+Go to/);
      expect(snap).toMatchSnapshot();
    });

    test("command palette renders on 200x60 terminal", async () => {
      terminal = await launchTUI({ cols: 200, rows: 60 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      // At large breakpoint: 50% width, all columns visible
      const snap = terminal.snapshot();
      expect(snap).toContain("Navigate");
      expect(snap).toContain("Go to Dashboard");
      expect(snap).toMatchSnapshot();
    });

    test("command palette shows empty query state with all commands", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      const snap = terminal.snapshot();
      // Navigate commands appear first, then Action, then Toggle
      expect(snap).toContain("Go to Dashboard");
      expect(snap).toContain("Go to Repositories");
      expect(snap).toMatchSnapshot();
    });

    test("command palette shows filtered results for query", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("dash");
      // Only matching commands visible
      await terminal.waitForText("Go to Dashboard");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("command palette shows highlighted result row", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendKeys("Down"); // move highlight to second row
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("command palette shows no results state", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("xyznonexistent");
      await terminal.waitForText("No matching commands");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("command palette shows keybinding hints on result rows", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      const snap = terminal.snapshot();
      // "Go to Dashboard" should show "g d" keybinding hint
      expect(snap).toMatch(/Go to Dashboard.*g d/);
      expect(snap).toMatchSnapshot();
    });

    test("command palette footer shows navigation hints", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      const snap = terminal.snapshot();
      expect(snap).toContain("navigate");
      expect(snap).toContain("select");
      expect(snap).toContain("dismiss");
    });
  });

  // ── Keyboard Interaction Tests ─────────────────────────────────────

  describe("Keyboard interactions", () => {
    test("colon key opens command palette", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      // Palette should not be visible initially
      expect(terminal.snapshot()).not.toContain(">");
      await terminal.sendKeys(":");
      // Palette visible with focused input
      await terminal.waitForText(">");
      expect(terminal.snapshot()).toContain("Go to Dashboard");
    });

    test("Esc key closes command palette", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendKeys("Escape");
      await terminal.waitForNoText("No matching commands");
      // Back to normal screen
      await terminal.waitForText("Dashboard");
    });

    test("Ctrl+C closes command palette without quitting TUI", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendKeys("ctrl+c");
      // Palette should be closed but TUI still running
      await terminal.waitForText("Dashboard");
    });

    test("Enter on highlighted command navigates to target", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText("Go to Dashboard");
      // First item should be highlighted by default
      await terminal.sendKeys("Enter");
      // Palette should close and Dashboard should be active
      await terminal.waitForText("Dashboard");
    });

    test("j/k keys navigate result list", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      // Move down
      await terminal.sendKeys("j");
      const snap1 = terminal.snapshot();
      // Move back up
      await terminal.sendKeys("k");
      const snap2 = terminal.snapshot();
      // Snapshots should differ (different highlight position)
      expect(snap1).not.toBe(snap2);
    });

    test("Down/Up arrow keys navigate result list", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendKeys("Down");
      const snap1 = terminal.snapshot();
      await terminal.sendKeys("Up");
      const snap2 = terminal.snapshot();
      expect(snap1).not.toBe(snap2);
    });

    test("navigation wraps from bottom to top", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      // Press k from first item — should wrap to last
      await terminal.sendKeys("k");
      // Take snapshot to verify wrap happened
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("navigation wraps from top to bottom", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      // Navigate to near-last, then past end
      // Since we don't know exact count, navigate down many times then one more
      for (let i = 0; i < 50; i++) {
        await terminal.sendKeys("j");
      }
      // Should have wrapped around; palette still open
      expect(terminal.snapshot()).toContain(">");
    });

    test("typing filters results in real-time", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("iss");
      // Only issue-related commands should be visible
      const snap = terminal.snapshot();
      // Non-matching commands should be hidden
      // (exact assertions depend on available commands)
      expect(snap).toContain(">");
    });

    test("backspace removes characters from query", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("dash");
      await terminal.waitForText("dash");
      await terminal.sendKeys("Backspace");
      await terminal.waitForText("das");
    });

    test("Ctrl+U clears search query", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("dashboard");
      await terminal.waitForText("dashboard");
      await terminal.sendKeys("ctrl+u");
      // Query should be cleared, all commands shown
      await terminal.waitForText("Go to Dashboard");
      await terminal.waitForText("Go to Repositories");
    });

    test("executing command closes palette and performs action", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("notif");
      await terminal.waitForText("Go to Notifications");
      await terminal.sendKeys("Enter");
      // Palette should close and Notifications screen active
      await terminal.waitForText("Notifications");
    });

    test("focus is trapped within palette", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      // Try keys that would normally navigate the underlying screen
      await terminal.sendKeys("j", "j", "j");
      await terminal.sendKeys("Escape");
      // Underlying screen cursor should be unchanged
      await terminal.waitForText("Dashboard");
    });

    test("colon does not open palette when input is focused", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      // Navigate to search screen and focus search input
      await terminal.sendKeys("g", "s");
      await terminal.waitForText("Search");
      await terminal.sendKeys("/"); // focus search input
      await terminal.sendText(":");
      // Palette should NOT open; colon should appear in search input
      expect(terminal.snapshot()).not.toContain("navigate"); // footer hint
    });

    test("palette input is cleared between invocations", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("test");
      await terminal.waitForText("test");
      await terminal.sendKeys("Escape");
      // Reopen palette
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      // Input should be empty, all commands visible
      const snap = terminal.snapshot();
      expect(snap).not.toContain("test");
      expect(snap).toContain("Go to Dashboard");
    });

    test("Ctrl+D pages down in results", async () => {
      terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      const before = terminal.snapshot();
      await terminal.sendKeys("ctrl+d");
      const after = terminal.snapshot();
      // Highlight should have moved down by multiple rows
      expect(before).not.toBe(after);
    });
  });

  // ── Context-Sensitive Command Tests ────────────────────────────────

  describe("Context-sensitive commands", () => {
    test("repo-scoped commands hidden when no repo context", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      const snap = terminal.snapshot();
      // Issues requires repo context — should NOT appear on Dashboard
      expect(snap).not.toContain("Go to Issues");
      // Dashboard should appear (no repo required)
      expect(snap).toContain("Go to Dashboard");
    });

    test("repo-scoped commands visible when repo is in context", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "repo", "--repo", "alice/test-repo"],
      });
      await terminal.waitForText("test-repo");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      const snap = terminal.snapshot();
      // Issues should appear when repo is in context
      expect(snap).toContain("Go to Issues");
    });

    test("feature-flag-disabled commands are hidden", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_DISABLE_FEATURE_WIKI: "1" },
      });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      const snap = terminal.snapshot();
      // Wiki should be hidden when wiki flag is disabled
      expect(snap).not.toContain("Go to Wiki");
    });

    test("all navigation go-to targets appear as palette commands", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "repo", "--repo", "alice/test-repo"],
      });
      await terminal.waitForText("test-repo");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      const snap = terminal.snapshot();
      // All go-to targets should be present in repo context
      const expectedTargets = [
        "Go to Dashboard",
        "Go to Repositories",
        "Go to Issues",
        "Go to Landings",
        "Go to Workspaces",
        "Go to Notifications",
        "Go to Search",
        "Go to Agents",
        "Go to Organizations",
        "Go to Workflows",
        "Go to Wiki",
      ];
      for (const target of expectedTargets) {
        expect(snap).toContain(target);
      }
    });
  });

  // ── Responsive Tests ───────────────────────────────────────────────

  describe("Responsive behavior", () => {
    test("palette resizes on terminal resize from 120x40 to 80x24", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.resize(80, 24);
      // Palette should still be open, resized to 90% × 80%
      await terminal.waitForText(">");
      const snap = terminal.snapshot();
      // Category labels should be hidden at minimum breakpoint
      expect(snap).not.toMatch(/Navigate\s+Go to/);
      expect(snap).toMatchSnapshot();
    });

    test("palette auto-closes when terminal shrinks below 80x24", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.resize(79, 23);
      // Palette should auto-close; terminal too small message shown
      await terminal.waitForNoText(">");
    });

    test("palette resizes on terminal resize from 80x24 to 200x60", async () => {
      terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.resize(200, 60);
      // Palette should resize to 50% × 50%, all columns visible
      const snap = terminal.snapshot();
      expect(snap).toContain("Navigate");
      expect(snap).toMatchSnapshot();
    });
  });

  // ── Fuzzy Search Tests ─────────────────────────────────────────────

  describe("Fuzzy search", () => {
    test("fuzzy match finds non-contiguous characters", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("gi");
      // "gi" should fuzzy match "Go to Issues" (g...i)
      await terminal.waitForText("Issues");
    });

    test("fuzzy match ranks exact prefix higher", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("Go");
      // All "Go to ..." commands should appear, ranked by prefix match
      const snap = terminal.snapshot();
      expect(snap).toContain("Go to Dashboard");
    });

    test("fuzzy match is case-insensitive", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("DASHBOARD");
      await terminal.waitForText("Go to Dashboard");
    });

    test("empty results for nonsense query", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      await terminal.sendText("zzzzzzzzz");
      await terminal.waitForText("No matching commands");
    });
  });

  // ── Edge Case Tests ────────────────────────────────────────────────

  describe("Edge cases", () => {
    test("palette handles maximum query length (128 chars)", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      // Type 130 characters
      const longInput = "a".repeat(130);
      await terminal.sendText(longInput);
      // Only 128 should be accepted
      const snap = terminal.snapshot();
      // Should not contain 130 a's but should contain some a's
      expect(snap).toContain(">");
    });

    test("rapid open/close does not cause errors", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      // Rapidly toggle palette 20 times
      for (let i = 0; i < 20; i++) {
        await terminal.sendKeys(":");
        await terminal.sendKeys("Escape");
      }
      // TUI should still be responsive
      await terminal.waitForText("Dashboard");
      expect(terminal.snapshot()).not.toContain("Something went wrong");
    });

    test("palette works after screen navigation", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40 });
      await terminal.waitForText("Dashboard");
      // Navigate through several screens
      await terminal.sendKeys("g", "r"); // go to repo list
      await terminal.waitForText("Repositories");
      await terminal.sendKeys(":");
      await terminal.waitForText(">");
      expect(terminal.snapshot()).toContain("Go to Dashboard");
    });
  });
});
```

### Test Dependencies and Assumptions

1. **Real process spawning:** All tests launch a real TUI process via `launchTUI()`. No mocks.
2. **Snapshot baselines:** First run creates golden snapshots. Subsequent runs compare against them. If the palette layout changes, snapshots must be updated with `--update-snapshots`.
3. **Failing tests:** Tests that require a real API server (e.g., the repo-context test with `--repo alice/test-repo`) will fail until the API server fixture is available. These are left failing per project policy.
4. **Feature flag test:** The `CODEPLANE_DISABLE_FEATURE_WIKI` env var test depends on the TUI reading this env var and disabling the wiki feature flag. Until that mechanism exists, the test will fail.
5. **Search input focus test:** The "colon does not open palette when input is focused" test depends on the search screen having a functional `/` → input focus flow. Until the search screen is implemented beyond a placeholder, this test will fail.

### Test Helpers — No New Helpers Required

All tests use the existing `launchTUI()`, `sendKeys()`, `sendText()`, `waitForText()`, `waitForNoText()`, `snapshot()`, `resize()`, and `terminate()` methods from `e2e/tui/helpers.ts`. No new test helpers are needed.

---

## File Inventory

| File | Status | Lines (est.) |
|---|---|---|
| `apps/tui/src/commands/types.ts` | **New** | ~55 |
| `apps/tui/src/commands/registry.ts` | **New** | ~25 |
| `apps/tui/src/commands/navigationCommands.ts` | **New** | ~65 |
| `apps/tui/src/commands/actionCommands.ts` | **New** | ~70 |
| `apps/tui/src/commands/toggleCommands.ts` | **New** | ~45 |
| `apps/tui/src/commands/index.ts` | **New** | ~15 |
| `apps/tui/src/lib/fuzzyMatch.ts` | **New** | ~75 |
| `apps/tui/src/components/CommandPalette.tsx` | **New** | ~250 |
| `apps/tui/src/components/OverlayLayer.tsx` | **Modified** | ~10 lines changed |
| `apps/tui/src/components/GlobalKeybindings.tsx` | **Modified** | ~5 lines changed |
| `apps/tui/src/hooks/useGlobalKeybindings.ts` | **Modified** | ~5 lines (when guard) |
| `e2e/tui/app-shell.test.ts` | **Modified** | ~350 lines added |

---

## Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| `j`/`k` captured by modal scope prevents typing those letters in query | Users cannot search for commands containing j or k | This is the spec-defined behavior (j/k = navigate). Users type other characters to filter. The fuzzy matcher handles non-contiguous matching. |
| OpenTUI's `<scrollbox>` may not support viewport culling for large result lists | Rendering lag with 200+ results | The maximum command count is 200 per spec. Even without culling, 200 single-line rows are trivial to render. |
| OverlayManager's Escape binding conflicts with palette's Ctrl+C binding at same MODAL priority | Double-close or missed close | OverlayManager's Escape binding is registered first; palette's scope is registered after (LIFO wins). Both close the overlay — no conflict. |
| `useKeyboard` at component level fires for ALL key events, not just unhandled ones | Printable chars double-processed | The handler filters: only single printable chars without ctrl/meta, and excludes j/k. Modal scope handles everything else first via KeybindingProvider. |
| No `@codeplane/ui-core` fuzzy matcher yet | Potential API mismatch when migrating | The `scoreCommand()` API is stable. Migration is a drop-in replacement of the scoring function internals. |