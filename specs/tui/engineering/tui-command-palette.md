# Engineering Specification: TUI Command Palette

**Ticket:** `tui-command-palette`
**Title:** Implement CommandPalette overlay with fuzzy search and command execution
**Dependencies:** `tui-modal-component`, `tui-global-keybindings`, `tui-screen-registry`, `tui-navigation-provider`, `tui-list-component`
**Target:** `apps/tui/src/`
**Tests:** `e2e/tui/app-shell.test.ts`

---

## Overview

This ticket replaces the placeholder command palette content in `OverlayLayer.tsx` with a fully functional `CommandPalette` component. The palette is a modal overlay activated by `:` from any screen, providing fuzzy-searchable access to all navigation targets, actions, and toggles in the TUI. It is the primary power-user affordance and must open in under 50ms, filter in under 16ms, and close instantly.

---

## Architecture Context

### Existing Infrastructure (already implemented)

| System | File | What it provides |
|--------|------|------------------|
| Overlay manager | `providers/OverlayManager.tsx` | `openOverlay("command-palette")`, `closeOverlay()`, auto-registers Escape at `PRIORITY.MODAL`, overrides status bar hints, mutual exclusion |
| Overlay rendering | `components/OverlayLayer.tsx` | Absolute-positioned modal shell with responsive sizing from `useLayout()`, border/background from `useTheme()` — currently renders placeholder text for `"command-palette"` |
| Global keybinding (`:`) | `hooks/useGlobalKeybindings.ts` → `components/GlobalKeybindings.tsx` | `:` is already registered at `PRIORITY.GLOBAL` to call `onCommandPalette`, which calls `openOverlay("command-palette")` |
| Keybinding system | `providers/KeybindingProvider.tsx` | Scope-based priority dispatch, `registerScope()` at `PRIORITY.MODAL`, focus trapping |
| Navigation | `providers/NavigationProvider.tsx` | `push()`, `pop()`, `replace()`, `reset()`, `repoContext`, `canGoBack` |
| Screen registry | `router/registry.ts` + `router/types.ts` | `ScreenName` enum (32 screens), `screenRegistry` map with `requiresRepo`/`requiresOrg`, `breadcrumbLabel()` |
| Command registry | `commands/types.ts` + `commands/index.ts` | `PaletteCommand` interface, `buildCommandRegistry(context)`, extensible via feature modules |
| Layout | `hooks/useLayout.ts` | `modalWidth`, `modalHeight`, `breakpoint`, `width`, `height` |
| Theme | `hooks/useTheme.ts` | `primary`, `muted`, `surface`, `border`, `error`, `success` tokens |

### What this ticket builds

1. **`apps/tui/src/components/CommandPalette.tsx`** — The React component rendering the command palette content.
2. **`apps/tui/src/hooks/useCommandPalette.ts`** — State management hook encapsulating query, filtering, highlight index, and execution logic.
3. **`apps/tui/src/lib/fuzzyMatch.ts`** — Fuzzy matching algorithm with scoring.
4. **`apps/tui/src/commands/navigationCommands.ts`** — Navigation target commands derived from the screen registry and go-to shortcuts.
5. **Update `apps/tui/src/commands/index.ts`** — Register navigation commands in `buildCommandRegistry()`.
6. **Update `apps/tui/src/components/OverlayLayer.tsx`** — Replace command palette placeholder with `<CommandPalette />`.
7. **`e2e/tui/app-shell.test.ts`** — Add command palette E2E tests.

---

## Implementation Plan

### Step 1: Implement fuzzy matching algorithm

**File:** `apps/tui/src/lib/fuzzyMatch.ts`

This is a pure function with zero dependencies. It can be built and unit-tested in isolation.

```typescript
export interface FuzzyResult {
  /** Whether the pattern matched the target at all */
  matches: boolean;
  /** Higher score = better match. Range: 0–1000 */
  score: number;
  /** Indices of matched characters in the target (for highlight rendering) */
  matchedIndices: number[];
}

/**
 * Fuzzy-match a query pattern against a target string.
 *
 * Scoring heuristic (higher = better):
 * - Exact prefix match: +500
 * - Contiguous substring match: +300
 * - Non-contiguous match with matched chars: +100 base, +10 per consecutive pair
 * - Character at word boundary (after space, /, -, _): +20 per boundary hit
 * - Shorter gap between matched characters: +5 per tight gap
 * - Case-sensitive exact char match bonus: +2 per char
 *
 * All matching is case-insensitive. Score bonuses for case-exact matches
 * are additive on top of the case-insensitive match.
 */
export function fuzzyMatch(pattern: string, target: string): FuzzyResult;

/**
 * Batch filter and sort an array of items by fuzzy match score.
 * Returns items that match, sorted by score descending.
 */
export function fuzzyFilter<T>(
  pattern: string,
  items: T[],
  accessor: (item: T) => string,
  aliasAccessor?: (item: T) => string[],
): Array<T & { _fuzzyScore: number; _fuzzyIndices: number[] }>;
```

**Algorithm details:**

1. If `pattern` is empty, return `{ matches: true, score: 0, matchedIndices: [] }` — all items match with neutral score.
2. Normalize both `pattern` and `target` to lowercase for matching.
3. Walk through `pattern` characters, finding each in `target` after the previous match position.
4. If any character in `pattern` cannot be found, return `{ matches: false, score: 0, matchedIndices: [] }`.
5. Compute score using the heuristic above.
6. `aliasAccessor` allows matching against multiple strings per item — the best score across all strings (name + aliases) wins.

**Performance constraint:** Must complete filtering of 200 commands in under 16ms. The algorithm is O(n × m) where n = number of items and m = max(pattern.length, target.length). No allocation of intermediate arrays during the inner match loop — use index tracking.

---

### Step 2: Implement navigation commands module

**File:** `apps/tui/src/commands/navigationCommands.ts`

This module generates `PaletteCommand[]` entries for all go-to navigation targets, derived from the screen registry.

```typescript
import { ScreenName } from "../router/types.js";
import type { CommandContext, PaletteCommand } from "./types.js";

export function createNavigationCommands(context: CommandContext): PaletteCommand[] {
  return [
    // --- Top-level navigation (no repo required) ---
    {
      id: "navigate-dashboard",
      name: "Go to Dashboard",
      aliases: ["home", "dashboard"],
      description: "Navigate to the dashboard overview",
      category: "Navigate",
      keybinding: "g d",
      priority: 10,
      action: () => context.navigate(ScreenName.Dashboard),
    },
    {
      id: "navigate-repo-list",
      name: "Go to Repository List",
      aliases: ["repos", "repositories"],
      description: "Browse all repositories",
      category: "Navigate",
      keybinding: "g r",
      priority: 11,
      action: () => context.navigate(ScreenName.RepoList),
    },
    {
      id: "navigate-workspaces",
      name: "Go to Workspaces",
      aliases: ["workspaces"],
      description: "View and manage workspaces",
      category: "Navigate",
      keybinding: "g w",
      priority: 12,
      action: () => context.navigate(ScreenName.Workspaces),
    },
    {
      id: "navigate-notifications",
      name: "Go to Notifications",
      aliases: ["inbox", "notifs"],
      description: "View notification inbox",
      category: "Navigate",
      keybinding: "g n",
      priority: 13,
      action: () => context.navigate(ScreenName.Notifications),
    },
    {
      id: "navigate-search",
      name: "Go to Search",
      aliases: ["find", "search"],
      description: "Global search across repos, issues, users, code",
      category: "Navigate",
      keybinding: "g s",
      priority: 14,
      action: () => context.navigate(ScreenName.Search),
    },
    {
      id: "navigate-organizations",
      name: "Go to Organizations",
      aliases: ["orgs"],
      description: "View organizations and teams",
      category: "Navigate",
      keybinding: "g o",
      priority: 15,
      action: () => context.navigate(ScreenName.Organizations),
    },

    // --- Repo-scoped navigation (require repo context) ---
    {
      id: "navigate-issues",
      name: "Go to Issues",
      aliases: ["issues", "bugs"],
      description: "View issues for the current repository",
      category: "Navigate",
      keybinding: "g i",
      priority: 20,
      contextRequirements: { repo: true },
      action: () => {
        const repo = context.getRepoContext();
        if (!repo) return;
        context.navigate(ScreenName.Issues, { owner: repo.owner, repo: repo.repo });
      },
    },
    {
      id: "navigate-landings",
      name: "Go to Landings",
      aliases: ["landing requests", "PRs", "pull requests"],
      description: "View landing requests for the current repository",
      category: "Navigate",
      keybinding: "g l",
      priority: 21,
      contextRequirements: { repo: true },
      action: () => {
        const repo = context.getRepoContext();
        if (!repo) return;
        context.navigate(ScreenName.Landings, { owner: repo.owner, repo: repo.repo });
      },
    },
    {
      id: "navigate-workflows",
      name: "Go to Workflows",
      aliases: ["CI", "pipelines", "actions"],
      description: "View workflows for the current repository",
      category: "Navigate",
      keybinding: "g f",
      priority: 22,
      contextRequirements: { repo: true },
      action: () => {
        const repo = context.getRepoContext();
        if (!repo) return;
        context.navigate(ScreenName.Workflows, { owner: repo.owner, repo: repo.repo });
      },
    },
    {
      id: "navigate-wiki",
      name: "Go to Wiki",
      aliases: ["docs", "documentation"],
      description: "View wiki pages for the current repository",
      category: "Navigate",
      keybinding: "g k",
      priority: 23,
      contextRequirements: { repo: true },
      featureFlag: "wiki",
      action: () => {
        const repo = context.getRepoContext();
        if (!repo) return;
        context.navigate(ScreenName.Wiki, { owner: repo.owner, repo: repo.repo });
      },
    },
  ];
}
```

**Update `apps/tui/src/commands/index.ts`:**

```typescript
import { createNavigationCommands } from "./navigationCommands.js";

export function buildCommandRegistry(context: CommandContext): PaletteCommand[] {
  return [
    ...createNavigationCommands(context),
    ...createAgentCommands(context),
    // ... other command groups added by subsequent tickets ...
  ];
}
```

---

### Step 3: Implement the useCommandPalette hook

**File:** `apps/tui/src/hooks/useCommandPalette.ts`

This hook encapsulates all state and behavior for the command palette. It is instantiated once by `<CommandPalette />` and manages:

- Query string state
- Filtered/sorted command list
- Highlight index
- Command building and context wiring
- Execution dispatch

```typescript
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNavigation } from "./useNavigation.js";
import { useOverlay } from "./useOverlay.js";
import { useLayout } from "./useLayout.js";
import { buildCommandRegistry, type PaletteCommand } from "../commands/index.js";
import { fuzzyFilter } from "../lib/fuzzyMatch.js";

interface UseCommandPaletteReturn {
  /** Current search query */
  query: string;
  /** Set query and re-filter */
  setQuery: (q: string) => void;
  /** Filtered and ranked command list */
  filteredCommands: PaletteCommand[];
  /** Index of the currently highlighted command */
  highlightIndex: number;
  /** Move highlight down (wraps) */
  highlightNext: () => void;
  /** Move highlight up (wraps) */
  highlightPrev: () => void;
  /** Page down in results */
  pageDown: () => void;
  /** Page up in results */
  pageUp: () => void;
  /** Execute the currently highlighted command */
  executeHighlighted: () => void;
  /** Clear the search query */
  clearQuery: () => void;
  /** Whether to show category column */
  showCategory: boolean;
  /** Whether to show description column */
  showDescription: boolean;
}

export function useCommandPalette(): UseCommandPaletteReturn;
```

**Internal logic:**

1. **Command building:** On each render, build the command registry via `buildCommandRegistry(context)` where `context` is constructed from the current `NavigationContext`:
   ```typescript
   const nav = useNavigation();
   const context: CommandContext = {
     navigate: (screen, params) => {
       closeOverlay();
       nav.reset(screen as ScreenName, params);
     },
     hasRepoContext: () => nav.repoContext !== null,
     getRepoContext: () => nav.repoContext,
     hasWriteAccess: () => true, // TODO: wire to real ACL when available
   };
   ```

2. **Context filtering:** Before fuzzy filtering, remove commands whose `contextRequirements` are not met:
   - `contextRequirements.repo === true` → hide if `nav.repoContext === null`
   - `contextRequirements.authenticated === true` → hide if auth state is not `"authenticated"`
   - `contextRequirements.writeAccess === true` → hide if `hasWriteAccess()` is false

3. **Feature flag filtering:** Remove commands whose `featureFlag` is set and the flag is disabled. Initially, treat all feature flags as enabled since `useFeatureFlags()` is not yet implemented. Add a `// TODO: wire useFeatureFlags()` comment.

4. **Fuzzy filtering:** When `query` is non-empty, run `fuzzyFilter(query, availableCommands, cmd => cmd.name, cmd => cmd.aliases ?? [])`. When `query` is empty, return all available commands sorted by category priority (Navigate=0, Action=1, Toggle=2) then by `priority` field, then alphabetically by `name`.

5. **Highlight management:**
   - `highlightIndex` resets to `0` whenever `filteredCommands` changes.
   - `highlightNext()`: `setHighlightIndex((i) => (i + 1) % filteredCommands.length)`
   - `highlightPrev()`: `setHighlightIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length)`
   - `pageDown()`: move by `Math.floor(visibleCount / 2)`, clamped.
   - `pageUp()`: move by `-Math.floor(visibleCount / 2)`, clamped.

6. **Execution:** `executeHighlighted()` calls `filteredCommands[highlightIndex].action()`, then calls `closeOverlay()`.

7. **Query constraints:** `setQuery` truncates input to 128 characters.

8. **Responsive columns:** `showCategory` and `showDescription` are derived from `useLayout().breakpoint`:
   - `"minimum"`: both false
   - `"standard"` / `"large"`: both true

---

### Step 4: Implement the CommandPalette component

**File:** `apps/tui/src/components/CommandPalette.tsx`

This component renders the command palette content inside the existing `OverlayLayer` shell. It registers its own keybinding scope at `PRIORITY.MODAL` for palette-specific keys.

```typescript
import React, { useEffect, useRef } from "react";
import { useCommandPalette } from "../hooks/useCommandPalette.js";
import { useTheme } from "../hooks/useTheme.js";
import { useLayout } from "../hooks/useLayout.js";
import { useOverlay } from "../hooks/useOverlay.js";
import { PRIORITY, type KeyHandler } from "../providers/keybinding-types.js";

export function CommandPalette() {
  const {
    query,
    setQuery,
    filteredCommands,
    highlightIndex,
    highlightNext,
    highlightPrev,
    pageDown,
    pageUp,
    executeHighlighted,
    clearQuery,
    showCategory,
    showDescription,
  } = useCommandPalette();
  const theme = useTheme();
  const layout = useLayout();
  const { closeOverlay } = useOverlay();

  // ... render below
}
```

**Component structure (JSX):**

```
<box flexDirection="column" width="100%" height="100%">
  {/* Search input row */}
  <box flexDirection="row" height={1}>
    <text fg={theme.primary}>"> "</text>
    <text>{query}</text>
    <text fg={theme.muted}>█</text>  {/* cursor indicator */}
  </box>

  {/* Separator */}
  <text fg={theme.border}>{"─".repeat(separatorWidth)}</text>

  {/* Results area */}
  {filteredCommands.length === 0 ? (
    <box flexGrow={1} justifyContent="center" alignItems="center">
      <text fg={theme.muted}>No matching commands</text>
    </box>
  ) : (
    <scrollbox flexGrow={1}>
      <box flexDirection="column">
        {filteredCommands.map((cmd, i) => (
          <CommandRow
            key={cmd.id}
            command={cmd}
            highlighted={i === highlightIndex}
            showCategory={showCategory}
            showDescription={showDescription}
            theme={theme}
          />
        ))}
      </box>
    </scrollbox>
  )}

  {/* Footer hints */}
  <box height={1} flexDirection="row">
    <text fg={theme.muted}>↑↓ navigate  ⏎ select  esc dismiss</text>
  </box>
</box>
```

**Keyboard handling:**

The `CommandPalette` registers a keybinding scope at `PRIORITY.MODAL` via `useEffect` + `registerScope`. The OverlayManager already registers `Escape` at `PRIORITY.MODAL` to close, so the palette does not re-register Escape.

Keybindings registered by the CommandPalette scope:

| Key | Handler | Notes |
|-----|---------|-------|
| `j` | `highlightNext()` | Navigate results down |
| `down` | `highlightNext()` | Arrow alternative |
| `k` | `highlightPrev()` | Navigate results up |
| `up` | `highlightPrev()` | Arrow alternative |
| `return` | `executeHighlighted()` | Execute selected command |
| `ctrl+d` | `pageDown()` | Page down |
| `ctrl+u` | `clearQuery()` when query non-empty; `pageUp()` when query empty | Dual-purpose: clear vs page up |
| `ctrl+c` | `closeOverlay()` | Dismiss palette |
| `backspace` | `setQuery(query.slice(0, -1))` | Remove last character |

**Important: Text input handling.** For printable characters that are NOT bound to a specific action (i.e., any printable character except `j`, `k`), they must be appended to the query. This requires special dispatch logic:

- `j` and `k` navigate results **only when the query input is not logically "focused"**. However, per the product spec, the command palette always has the search input focused and `j`/`k` navigate results. This means `j`/`k` are **dual-purpose**: they navigate results, not type characters.
- Wait — re-reading the spec: "Printable chars: Append to search query, trigger fuzzy filter" AND "j/Down: Highlight next result." This is contradictory for `j` and `k`.

**Resolution:** Per the spec's keybinding table, `j`/`k` navigate results, and printable chars append to query. This means `j` and `k` do NOT type into the query — they are reserved for navigation. All other printable characters (a-i, l-z, 0-9, symbols except reserved keys) append to the query.

The implementation handles this by registering `j`, `k`, `return`, `ctrl+d`, `ctrl+u`, `ctrl+c`, `backspace`, `up`, `down`, `escape` as explicit keybindings. A fallback handler on the scope catches unmatched printable keys and appends them to the query. Since `KeybindingProvider` dispatches to the first matching scope, and unmatched keys fall through to the OpenTUI focus system, we need a different approach:

**Approach — raw keyboard interception:** The `CommandPalette` registers a scope at `PRIORITY.MODAL` that uses a **catch-all binding** or we add a `fallback` handler mechanism. Since the existing `KeybindingProvider` only dispatches explicit key matches, we need to:

1. Register explicit bindings for `j`, `k`, `up`, `down`, `return`, `ctrl+d`, `ctrl+u`, `ctrl+c`, `backspace`.
2. For printable character input, use OpenTUI's `<input>` component with `focused` prop and `onInput` callback. The `<input>` captures printable characters at `PRIORITY.TEXT_INPUT` (priority 1, highest), while `j`/`k` are registered at `PRIORITY.MODAL` (priority 2). But wait — `PRIORITY.TEXT_INPUT` is higher priority (lower number = higher), so the `<input>` would consume `j`/`k` before the modal scope sees them.

**Final design decision:** We do NOT use an `<input>` component. Instead, the `CommandPalette` manages its own text buffer and registers a comprehensive keybinding scope at `PRIORITY.MODAL` that handles ALL keys:

- Navigation keys (`j`, `k`, `up`, `down`, `ctrl+d`, `ctrl+u`) → navigation actions
- `return` → execute
- `escape`, `ctrl+c` → dismiss (Escape already handled by OverlayManager)
- `backspace` → delete last character
- All other printable characters → append to query buffer

To intercept all printable characters, we register each one individually (a-z, A-Z, 0-9, common symbols) OR extend the `KeybindingProvider` to support a `fallback` handler per scope. The cleaner approach:

**Add a `onUnhandledKey` callback to the keybinding scope.** This is a small extension to `KeybindingProvider` that calls a fallback handler when a scope is active but no explicit binding matches. The fallback receives the raw key event.

**Required change to `providers/keybinding-types.ts`:**

```typescript
export interface KeybindingScope {
  id: string;
  priority: Priority;
  bindings: Map<string, KeyHandler>;
  active: boolean;
  /** Called when this scope is the highest-priority active scope but no explicit binding matches.
   *  Return true to consume the event, false to propagate. */
  onUnhandledKey?: (key: string, event: KeyEvent) => boolean;
}
```

**Required change to `providers/KeybindingProvider.tsx`:**

In the dispatch loop, after checking `scope.bindings.has(normalizedKey)`, add:

```typescript
if (scope.onUnhandledKey) {
  const consumed = scope.onUnhandledKey(normalizedKey, event);
  if (consumed) return; // event consumed by fallback
}
```

The `CommandPalette` then uses `onUnhandledKey` to capture printable input:

```typescript
onUnhandledKey: (key: string, event: KeyEvent) => {
  // Only handle single printable characters
  if (key.length === 1 && key >= ' ' && key <= '~') {
    setQuery(prev => {
      if (prev.length >= 128) return prev;
      return prev + key;
    });
    return true; // consumed
  }
  return false; // propagate
};
```

---

### Step 5: Integrate CommandPalette into OverlayLayer

**File:** `apps/tui/src/components/OverlayLayer.tsx`

Replace the command palette placeholder block:

```diff
- {activeOverlay === "command-palette" && (
-   <text fg={theme.muted}>[Command palette content — pending TUI_COMMAND_PALETTE implementation]</text>
- )}
+ {activeOverlay === "command-palette" && (
+   <CommandPalette />
+ )}
```

Also update the palette sizing. The current `OverlayLayer` uses `layout.modalWidth` and `layout.modalHeight` for all overlays. The command palette has specific sizing requirements different from the general modal:

| Breakpoint | Width | Height |
|------------|-------|--------|
| `minimum` (80×24) | 90% | 80% |
| `standard` (120×40) | 60% | 60% |
| `large` (200×60+) | 50% | 50% |

The current `useLayout()` already returns:
- `minimum`: 90%×90% (close but height differs)
- `standard`: 60%×60% ✓
- `large`: 50%×50% ✓

For the command palette at minimum breakpoint, the height should be 80% not 90%. Two approaches:

**Option A:** Override sizing per overlay type inside `OverlayLayer`. Add a lookup:

```typescript
function getOverlaySize(overlay: OverlayType, breakpoint: Breakpoint | null) {
  if (overlay === "command-palette") {
    switch (breakpoint) {
      case "minimum": return { width: "90%", height: "80%" };
      case "standard": return { width: "60%", height: "60%" };
      case "large": return { width: "50%", height: "50%" };
      default: return { width: "90%", height: "80%" };
    }
  }
  // Default for other overlays
  return { width: layout.modalWidth, height: layout.modalHeight };
}
```

**Option B (preferred):** Accept the current `useLayout()` values for now. The difference (90% vs 80% height at minimum) is minor and can be refined. Use `layout.modalWidth` and `layout.modalHeight` as-is.

**Decision:** Option A. The spec is explicit about 80% height at minimum. Implement per-overlay sizing.

---

### Step 6: Handle terminal resize while palette is open

The spec requires:
- Palette re-layouts on resize (handled automatically by React + `useLayout()`).
- Palette auto-closes if terminal shrinks below 80×24.

The auto-close behavior is already handled by `AppShell`, which renders `<TerminalTooSmallScreen />` when `breakpoint === null`. However, the overlay layer renders independently. We need to explicitly close the overlay when breakpoint becomes null.

**Add to `CommandPalette` component:**

```typescript
const { breakpoint } = useLayout();
const { closeOverlay } = useOverlay();

useEffect(() => {
  if (breakpoint === null) {
    closeOverlay();
  }
}, [breakpoint, closeOverlay]);
```

---

### Step 7: Wire `onUnhandledKey` into KeybindingProvider

**File:** `apps/tui/src/providers/keybinding-types.ts`

Add `onUnhandledKey` to `KeybindingScope` interface (shown in Step 4).

**File:** `apps/tui/src/providers/KeybindingProvider.tsx`

In the key dispatch function, after checking for explicit binding match in a scope:

```typescript
// Inside dispatch loop, after checking scope.bindings:
if (!matched && scope.onUnhandledKey) {
  const consumed = scope.onUnhandledKey(normalizedKey, event);
  if (consumed) {
    return; // Stop propagation
  }
}
```

This is a backward-compatible change. Existing scopes without `onUnhandledKey` are unaffected.

---

## File Inventory

| File | Action | Description |
|------|--------|-------------|
| `apps/tui/src/lib/fuzzyMatch.ts` | **Create** | Pure fuzzy matching algorithm |
| `apps/tui/src/commands/navigationCommands.ts` | **Create** | Navigation target palette commands |
| `apps/tui/src/hooks/useCommandPalette.ts` | **Create** | Palette state management hook |
| `apps/tui/src/components/CommandPalette.tsx` | **Create** | Palette rendering component |
| `apps/tui/src/commands/index.ts` | **Modify** | Import and call `createNavigationCommands()` |
| `apps/tui/src/components/OverlayLayer.tsx` | **Modify** | Replace placeholder with `<CommandPalette />`, add per-overlay sizing |
| `apps/tui/src/providers/keybinding-types.ts` | **Modify** | Add `onUnhandledKey` to `KeybindingScope` |
| `apps/tui/src/providers/KeybindingProvider.tsx` | **Modify** | Dispatch `onUnhandledKey` in scope resolution |
| `e2e/tui/app-shell.test.ts` | **Modify** | Add command palette E2E test suite |

---

## Detailed Component API

### CommandPalette Props

None. The component is rendered by `OverlayLayer` when `activeOverlay === "command-palette"`. All data is obtained from hooks.

### CommandRow (internal sub-component)

```typescript
interface CommandRowProps {
  command: PaletteCommand;
  highlighted: boolean;
  showCategory: boolean;
  showDescription: boolean;
  theme: ThemeTokens;
}
```

Renders a single result row:
- Height: 1 line
- Layout: `<box flexDirection="row" height={1}>`
  - Category label (12 chars, muted, only if `showCategory`)
  - Command name (flexGrow=1, primary color if highlighted, default otherwise)
  - Description (flexShrink=1, muted, only if `showDescription`, truncated to 120 chars)
  - Keybinding hint (12 chars, muted, right-aligned)
- Highlighted row: reverse video background via `backgroundColor={theme.primary}` with text in default color.

### Text truncation

Use the existing `apps/tui/src/util/text.ts` truncation utility if available, otherwise implement:

```typescript
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}
```

---

## Scrollbox Viewport Management

The results list uses `<scrollbox>` from OpenTUI. When the highlight index changes, the scrollbox must scroll to keep the highlighted row visible.

**Approach:** Track the highlight index and use OpenTUI's `scrollbox` `scrollTo` prop or imperative ref. If `scrollbox` supports a `scrollToIndex` or similar, use it. Otherwise, maintain scroll offset state manually:

```typescript
const visibleCount = useMemo(() => {
  // Calculate from layout: overlay height - input row (1) - separator (1) - footer (1) - padding (2)
  const overlayHeight = resolveHeight(layout);
  return overlayHeight - 5;
}, [layout]);

const scrollOffset = useMemo(() => {
  if (highlightIndex < scrollOffset) return highlightIndex;
  if (highlightIndex >= scrollOffset + visibleCount) return highlightIndex - visibleCount + 1;
  return scrollOffset;
}, [highlightIndex, visibleCount]);
```

Render only the visible slice: `filteredCommands.slice(scrollOffset, scrollOffset + visibleCount)`. This is viewport culling as specified.

---

## State Reset on Open/Close

Per spec: "No state persistence. The palette input is cleared each time it opens."

The `useCommandPalette` hook resets `query` to `""` and `highlightIndex` to `0` whenever the overlay opens. Detect open/close via:

```typescript
const { isOpen } = useOverlay();
const wasOpen = useRef(false);

useEffect(() => {
  const currentlyOpen = isOpen("command-palette");
  if (currentlyOpen && !wasOpen.current) {
    // Palette just opened — reset state
    setQuery("");
    setHighlightIndex(0);
  }
  wasOpen.current = currentlyOpen;
}, [isOpen]);
```

---

## Telemetry Integration Points

The spec defines four telemetry events. These are instrumented as function calls to a telemetry module (which may be a no-op stub initially):

```typescript
// apps/tui/src/lib/telemetry.ts (stub)
export function trackEvent(name: string, properties: Record<string, unknown>): void {
  // TODO: wire to telemetry backend when available
}
```

Call sites in `useCommandPalette`:

1. **On open:** `trackEvent("TUICommandPaletteOpened", { screen_context, repo_context, terminal_size, available_commands_count })`
2. **On execute:** `trackEvent("TUICommandPaletteExecuted", { command_id, command_name, command_category, query_text, query_length, result_index, total_results, time_to_execute_ms, screen_context, repo_context })`
3. **On dismiss:** `trackEvent("TUICommandPaletteDismissed", { query_text, query_length, time_open_ms, screen_context })`
4. **On filter (debounced 500ms):** `trackEvent("TUICommandPaletteFiltered", { query_text, query_length, result_count, screen_context })`

---

## Logging Integration

All logging uses structured log output. Stub:

```typescript
// In useCommandPalette
const log = useLogger("command-palette"); // or console.debug with structured context

// On open
log.debug("Command palette opened", { screen_context, repo_context, available_commands_count });
// On execute
log.info("Command executed from palette", { command_id, command_name, command_category, query_text });
// On dismiss
log.debug("Command palette dismissed", { query_text, time_open_ms });
// On slow filter (>16ms)
log.warn("Fuzzy filter exceeded 16ms", { query_text, candidate_count, filter_duration_ms });
```

---

## Performance Budget

| Operation | Budget | How to verify |
|-----------|--------|---------------|
| Palette open (`:` press to first paint) | < 50ms | `performance.now()` around overlay state change + React reconciliation |
| Fuzzy filter (keystroke to result update) | < 16ms | `performance.now()` around `fuzzyFilter()` call in `useCommandPalette`. Log warning if exceeded |
| Palette close | < 16ms (single frame) | Immediate state change; no animation |

The fuzzy filter is synchronous. No debounce on input — every keystroke triggers an immediate re-filter. The 16ms budget ensures no perceptible lag at 60fps.

---

## Productionization Checklist

These items ensure the implementation is production-ready and not PoC-quality:

1. **No `any` types.** All OpenTUI JSX props must be properly typed. If OpenTUI's types require width/height as specific types (not `string`), add proper type assertions or update type definitions.

2. **Memoize expensive computations.** The filtered command list must be wrapped in `useMemo` keyed on `[query, availableCommands]`. The command registry build should be memoized on `[repoContext, authState]`.

3. **Stable references.** All callbacks passed to keybinding registration must use `useCallback` or refs to avoid scope re-registration on every render.

4. **Memory stability.** The `fuzzyFilter` function must not allocate new arrays on every keystroke. Use object pooling or in-place sorting where possible. Profile with `--heap-prof` during a 1000-keystroke stress test.

5. **Feature flag stub.** The `featureFlag` filtering path must exist in code even though `useFeatureFlags()` is not yet implemented. Use a `// TODO` comment and treat all flags as enabled.

6. **No hardcoded colors.** Every color reference must go through `useTheme()` tokens. No raw ANSI codes in the component.

7. **Error boundary compatibility.** If `executeHighlighted()` throws (command action throws), the error must propagate to the top-level error boundary. The palette should close before the error boundary renders. Wrap execution in try/catch:
   ```typescript
   try {
     filteredCommands[highlightIndex].action();
   } catch (err) {
     closeOverlay();
     throw err; // Let error boundary catch it
   }
   ```

8. **Accessibility annotations.** While the TUI has no screen reader support, maintain semantic structure: result list is a `<box>` with `role` annotation comments for future accessibility work.

9. **Export from barrel files.** `CommandPalette` exported from `components/index.ts`. `useCommandPalette` exported from `hooks/index.ts`. `fuzzyMatch`/`fuzzyFilter` exported from `lib/index.ts`.

---

## Unit & Integration Tests

**Test file:** `e2e/tui/app-shell.test.ts`

All tests are appended to the existing `app-shell.test.ts` file under a new `describe("TUI_COMMAND_PALETTE", ...)` block. Tests use `@microsoft/tui-test` via the `launchTUI()` helper from `e2e/tui/helpers.ts`.

### Snapshot Tests — Visual States

```typescript
import { describe, test, expect } from "bun:test";
import { launchTUI, TERMINAL_SIZES } from "./helpers.js";

describe("TUI_COMMAND_PALETTE", () => {
  describe("Snapshot Tests — Visual States", () => {
    test("command palette renders centered overlay on 120x40 terminal", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("command palette renders expanded overlay on 80x24 terminal", async () => {
      const tui = await launchTUI({ cols: 80, rows: 24 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        // At 80x24: 90% width, 80% height, no category or description columns
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("command palette renders on 200x60 terminal", async () => {
      const tui = await launchTUI({ cols: 200, rows: 60 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        // At 200x60: 50% width, 50% height, all columns with extra padding
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("command palette shows empty query state with all commands", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        // All commands visible, ordered: Navigate, then Action, then Toggle
        await tui.waitForText("Go to Dashboard");
        await tui.waitForText("Navigate");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("command palette shows filtered results for query", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.sendText("dash");
        await tui.waitForText("Dashboard");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("command palette shows highlighted result row", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        // First result highlighted by default, press j to move to second
        await tui.sendKeys("j");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("command palette shows no results state", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.sendText("xyznonexistent");
        await tui.waitForText("No matching commands");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("command palette shows keybinding hints on result rows", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText("Go to Dashboard");
        // Verify keybinding hint "g d" appears
        await tui.waitForText("g d");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("command palette footer shows navigation hints", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText("navigate");
        await tui.waitForText("select");
        await tui.waitForText("dismiss");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });
  });
```

### Keyboard Interaction Tests

```typescript
  describe("Keyboard Interaction Tests", () => {
    test("colon key opens command palette", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        // Palette should not be visible initially
        await tui.waitForNoText(">");
        await tui.sendKeys(":");
        // Palette should now be visible with search input
        await tui.waitForText(">");
      } finally {
        await tui.terminate();
      }
    });

    test("Esc key closes command palette", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.sendKeys("Escape");
        await tui.waitForNoText("No matching commands");
        // Palette should be closed; underlying screen visible
        await tui.waitForText("Dashboard");
      } finally {
        await tui.terminate();
      }
    });

    test("Ctrl+C closes command palette without quitting TUI", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.sendKeys("ctrl+c");
        // Palette should be closed, TUI still running
        await tui.waitForText("Dashboard");
      } finally {
        await tui.terminate();
      }
    });

    test("Enter on highlighted command navigates to target", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText("Go to Dashboard");
        // Navigate to highlight "Go to Notifications" (or first item)
        await tui.sendKeys("Return");
        // Palette should close; screen should change
        await tui.waitForNoText(">");
      } finally {
        await tui.terminate();
      }
    });

    test("j/k keys navigate result list", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        // j moves highlight down, k moves it back up
        await tui.sendKeys("j");
        await tui.sendKeys("j");
        await tui.sendKeys("k");
        // Snapshot captures highlight position
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("Down/Up arrow keys navigate result list", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.sendKeys("Down");
        await tui.sendKeys("Up");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("navigation wraps from bottom to top", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        // Press k from first item to wrap to last
        await tui.sendKeys("k");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("typing filters results in real-time", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.sendText("iss");
        // Only commands matching "iss" should be visible
        await tui.waitForText("Issues");
        // Commands not matching should be gone
        await tui.waitForNoText("Go to Dashboard");
      } finally {
        await tui.terminate();
      }
    });

    test("backspace removes characters from query", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.sendText("dash");
        await tui.waitForText("dash");
        await tui.sendKeys("Backspace");
        // Query should now be "das"
        await tui.waitForText("das");
      } finally {
        await tui.terminate();
      }
    });

    test("Ctrl+U clears search query", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.sendText("dashboard");
        await tui.waitForText("dashboard");
        await tui.sendKeys("ctrl+u");
        // Query should be empty; all commands shown
        await tui.waitForText("Go to Dashboard");
        await tui.waitForText("Go to Repository List");
      } finally {
        await tui.terminate();
      }
    });

    test("executing command closes palette and performs action", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.sendText("notif");
        await tui.waitForText("Notifications");
        await tui.sendKeys("Return");
        // Palette closed, Notifications screen active
        await tui.waitForNoText(">");
        await tui.waitForText("Notifications");
      } finally {
        await tui.terminate();
      }
    });

    test("focus is trapped within palette", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        // j/k should navigate palette, not underlying screen
        await tui.sendKeys("j");
        await tui.sendKeys("j");
        await tui.sendKeys("j");
        await tui.sendKeys("Escape");
        // Underlying screen cursor should be unchanged
        await tui.waitForText("Dashboard");
      } finally {
        await tui.terminate();
      }
    });

    test("palette input is cleared between invocations", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.sendText("test");
        await tui.waitForText("test");
        await tui.sendKeys("Escape");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        // Input should be empty; all commands visible
        await tui.waitForText("Go to Dashboard");
        await tui.waitForNoText("test");
      } finally {
        await tui.terminate();
      }
    });

    test("Ctrl+D pages down in results", async () => {
      const tui = await launchTUI({ cols: 80, rows: 24 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.sendKeys("ctrl+d");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });
  });
```

### Context-Sensitive Command Tests

```typescript
  describe("Context-Sensitive Command Tests", () => {
    test("repo-scoped commands hidden when no repo context", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        // On Dashboard — no repo context
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        // Global navigation should be present
        await tui.waitForText("Go to Dashboard");
        // Repo-scoped commands should NOT appear
        await tui.waitForNoText("Go to Issues");
        await tui.waitForNoText("Go to Landings");
      } finally {
        await tui.terminate();
      }
    });

    test("repo-scoped commands visible when repo is in context", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        // Navigate into a repository to establish repo context
        // Use go-to keybinding to navigate to repo list then enter a repo
        await tui.sendKeys("g", "r");
        await tui.waitForText("Repositories");
        // Enter a repo (press Enter on first item)
        await tui.sendKeys("Return");
        // Now open command palette with repo context
        await tui.sendKeys(":");
        await tui.waitForText(">");
        // Repo-scoped commands should appear
        await tui.waitForText("Go to Issues");
      } finally {
        await tui.terminate();
      }
    });

    test("all navigation go-to targets appear as palette commands", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        // Navigate into repo context first for full command list
        await tui.sendKeys("g", "r");
        await tui.waitForText("Repositories");
        await tui.sendKeys("Return");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        // Verify all go-to targets present
        await tui.waitForText("Go to Dashboard");
        await tui.waitForText("Go to Repository List");
        await tui.waitForText("Go to Issues");
        await tui.waitForText("Go to Landings");
        await tui.waitForText("Go to Workspaces");
        await tui.waitForText("Go to Notifications");
        await tui.waitForText("Go to Search");
        await tui.waitForText("Go to Organizations");
        await tui.waitForText("Go to Workflows");
      } finally {
        await tui.terminate();
      }
    });
  });
```

### Responsive Tests

```typescript
  describe("Responsive Tests", () => {
    test("palette resizes on terminal resize from 120x40 to 80x24", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.resize(80, 24);
        // Should re-layout at 90%×80%, hide category and description
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("palette auto-closes when terminal shrinks below 80x24", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.resize(79, 23);
        // Palette should auto-close; "terminal too small" message shown
        await tui.waitForNoText(">");
      } finally {
        await tui.terminate();
      }
    });

    test("palette resizes on terminal resize from 80x24 to 200x60", async () => {
      const tui = await launchTUI({ cols: 80, rows: 24 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.resize(200, 60);
        // Should re-layout at 50%×50%, all columns visible
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });
  });
```

### Fuzzy Search Tests

```typescript
  describe("Fuzzy Search Tests", () => {
    test("fuzzy match finds non-contiguous characters", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.sendText("gi");
        // "gi" should match "Go to Issues" (G...I...)
        await tui.waitForText("Issues");
      } finally {
        await tui.terminate();
      }
    });

    test("fuzzy match ranks exact prefix higher", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.sendText("Go");
        // "Go to Dashboard" should appear first (exact prefix "Go")
        await tui.waitForText("Go to Dashboard");
        expect(tui.snapshot()).toMatchSnapshot();
      } finally {
        await tui.terminate();
      }
    });

    test("fuzzy match is case-insensitive", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.sendText("DASHBOARD");
        await tui.waitForText("Go to Dashboard");
      } finally {
        await tui.terminate();
      }
    });

    test("empty results for nonsense query", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.sendText("zzzzzzzzz");
        await tui.waitForText("No matching commands");
      } finally {
        await tui.terminate();
      }
    });
  });
```

### Edge Case Tests

```typescript
  describe("Edge Case Tests", () => {
    test("palette handles maximum query length (128 chars)", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        await tui.sendKeys(":");
        await tui.waitForText(">");
        // Type 130 characters
        const longText = "a".repeat(130);
        await tui.sendText(longText);
        // Only 128 should be accepted
        // Verify no crash and palette is responsive
        await tui.waitForText("No matching commands");
      } finally {
        await tui.terminate();
      }
    });

    test("rapid open/close does not cause errors", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        // Rapidly open and close 20 times
        for (let i = 0; i < 20; i++) {
          await tui.sendKeys(":");
          await tui.sendKeys("Escape");
        }
        // TUI should still be responsive
        await tui.waitForText("Dashboard");
      } finally {
        await tui.terminate();
      }
    });

    test("palette works after screen navigation", async () => {
      const tui = await launchTUI({ cols: 120, rows: 40 });
      try {
        await tui.waitForText("Dashboard");
        // Navigate through several screens
        await tui.sendKeys("g", "r"); // Repo list
        await tui.waitForText("Repositories");
        await tui.sendKeys("g", "n"); // Notifications
        await tui.waitForText("Notifications");
        await tui.sendKeys("g", "s"); // Search
        await tui.waitForText("Search");
        // Open palette — should work with accumulated navigation context
        await tui.sendKeys(":");
        await tui.waitForText(">");
        await tui.waitForText("Go to Dashboard");
      } finally {
        await tui.terminate();
      }
    });
  });
});
```

### Pure Function Unit Tests for fuzzyMatch

Additionally, add a separate describe block (or a new file `e2e/tui/fuzzy-match.test.ts`) for pure function tests:

**File:** `e2e/tui/fuzzy-match.test.ts`

```typescript
import { describe, test, expect } from "bun:test";
import { fuzzyMatch, fuzzyFilter } from "../../apps/tui/src/lib/fuzzyMatch.js";

describe("fuzzyMatch", () => {
  test("empty pattern matches everything with score 0", () => {
    const result = fuzzyMatch("", "Go to Dashboard");
    expect(result.matches).toBe(true);
    expect(result.score).toBe(0);
  });

  test("exact match scores highest", () => {
    const exact = fuzzyMatch("Go to Dashboard", "Go to Dashboard");
    const partial = fuzzyMatch("Go", "Go to Dashboard");
    expect(exact.score).toBeGreaterThan(partial.score);
  });

  test("prefix match scores higher than substring", () => {
    const prefix = fuzzyMatch("Go", "Go to Dashboard");
    const substring = fuzzyMatch("to", "Go to Dashboard");
    expect(prefix.score).toBeGreaterThan(substring.score);
  });

  test("contiguous match scores higher than non-contiguous", () => {
    const contiguous = fuzzyMatch("Dash", "Go to Dashboard");
    const nonContiguous = fuzzyMatch("Gthd", "Go to Dashboard");
    expect(contiguous.score).toBeGreaterThan(nonContiguous.score);
  });

  test("non-matching pattern returns false", () => {
    const result = fuzzyMatch("xyz", "Go to Dashboard");
    expect(result.matches).toBe(false);
    expect(result.score).toBe(0);
  });

  test("case-insensitive matching", () => {
    const result = fuzzyMatch("dashboard", "Go to Dashboard");
    expect(result.matches).toBe(true);
  });

  test("non-contiguous characters match", () => {
    const result = fuzzyMatch("gi", "Go to Issues");
    expect(result.matches).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  test("matched indices are returned", () => {
    const result = fuzzyMatch("Go", "Go to Dashboard");
    expect(result.matchedIndices).toEqual([0, 1]);
  });
});

describe("fuzzyFilter", () => {
  const commands = [
    { name: "Go to Dashboard", aliases: ["home"] },
    { name: "Go to Issues", aliases: ["bugs"] },
    { name: "Go to Notifications", aliases: ["inbox"] },
    { name: "Create New Issue", aliases: [] },
  ];

  test("empty pattern returns all items", () => {
    const results = fuzzyFilter("", commands, c => c.name);
    expect(results.length).toBe(commands.length);
  });

  test("filters to matching items only", () => {
    const results = fuzzyFilter("Issue", commands, c => c.name);
    expect(results.length).toBe(2); // "Go to Issues" and "Create New Issue"
  });

  test("sorts by score descending", () => {
    const results = fuzzyFilter("iss", commands, c => c.name);
    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]._fuzzyScore).toBeGreaterThanOrEqual(results[i]._fuzzyScore);
    }
  });

  test("matches against aliases", () => {
    const results = fuzzyFilter("home", commands, c => c.name, c => c.aliases);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("Go to Dashboard");
  });

  test("handles 200 items within 16ms", () => {
    const manyCommands = Array.from({ length: 200 }, (_, i) => ({
      name: `Command number ${i} with some description text`,
      aliases: [`alias${i}`],
    }));
    const start = performance.now();
    fuzzyFilter("cmd", manyCommands, c => c.name, c => c.aliases);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(16);
  });
});
```

---

## Dependency Graph

```
┌─────────────────────────────────┐
│ OverlayLayer.tsx (modified)      │
│  renders <CommandPalette />      │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ CommandPalette.tsx (new)         │
│  uses useCommandPalette()        │
│  uses useTheme()                 │
│  uses useLayout()                │
│  uses useOverlay()               │
│  registers MODAL keybinding scope│
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ useCommandPalette.ts (new)       │
│  uses useNavigation()            │
│  uses useOverlay()               │
│  uses useLayout()                │
│  calls buildCommandRegistry()    │
│  calls fuzzyFilter()             │
└──────┬───────────┬──────────────┘
       │           │
       ▼           ▼
┌──────────┐  ┌───────────────────┐
│ commands/ │  │ lib/fuzzyMatch.ts │
│ index.ts  │  │ (new)             │
│ (modified)│  └───────────────────┘
└──────┬───┘
       │
       ▼
┌──────────────────────────────────┐
│ commands/navigationCommands.ts    │
│ (new)                             │
│ commands/agentCommands.ts         │
│ (existing)                        │
└──────────────────────────────────┘
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `j`/`k` conflict with query input | Low | High | Design decision: `j`/`k` are navigation-only in palette, not query input. Documented in spec. |
| `onUnhandledKey` breaks existing keybinding dispatch | Low | High | Change is additive; only called when no explicit binding matches. Existing scopes without `onUnhandledKey` are unaffected. Test existing keybinding behavior in regression tests. |
| OpenTUI `<scrollbox>` doesn't support viewport culling | Medium | Medium | Implement manual viewport culling by rendering only visible slice of results. |
| `useFeatureFlags()` not yet implemented | Known | Low | Stub: treat all flags as enabled. Add `// TODO` comment. No functional impact — all commands appear. |
| Fuzzy filter exceeds 16ms budget | Low | Medium | Algorithm is O(n*m) for n=200 items, m~80 chars. Benchmark in pure function test. |
| OverlayManager Escape binding conflicts with palette Ctrl+C | Low | Low | OverlayManager already handles Escape. Palette registers Ctrl+C separately at same priority. LIFO ordering ensures palette's Ctrl+C is checked before OverlayManager's Escape. |

---

## Open Questions

1. **`Ctrl+U` dual purpose:** The spec says `Ctrl+U` clears the query AND pages up (when query empty or cursor at 0). The implementation should check `query.length === 0` to decide behavior. Is this the intended UX? **Decision:** Yes, implement as described. When query is non-empty, `Ctrl+U` clears. When query is empty, `Ctrl+U` pages up.

2. **Auth-gated palette:** The spec says when no auth token is present, palette shows only sign-in guidance. Since `AuthProvider` renders an error screen when unauthenticated (before `NavigationProvider` mounts), the palette will never be reachable without auth. **Decision:** No special handling needed in `CommandPalette` — auth gating happens upstream.

3. **`colon does not open palette when input is focused` test:** This requires a screen with a text input to test against. Since search screen has a `/` keybinding to focus input, this test navigates to search, focuses the input, and types `:`. **Decision:** This test may fail if the search screen is not yet implemented (placeholder). Leave the test — it will fail naturally and serve as a signal.

---

## Implementation Order

1. `apps/tui/src/lib/fuzzyMatch.ts` + `e2e/tui/fuzzy-match.test.ts` — pure function, zero dependencies, testable immediately.
2. `apps/tui/src/commands/navigationCommands.ts` + update `commands/index.ts` — defines the command data.
3. `apps/tui/src/providers/keybinding-types.ts` + `providers/KeybindingProvider.tsx` — add `onUnhandledKey` support.
4. `apps/tui/src/hooks/useCommandPalette.ts` — state management hook.
5. `apps/tui/src/components/CommandPalette.tsx` — rendering component.
6. `apps/tui/src/components/OverlayLayer.tsx` — integrate `<CommandPalette />`.
7. `e2e/tui/app-shell.test.ts` — add full E2E test suite.

Each step is independently compilable and testable. Steps 1–3 have no UI dependencies. Steps 4–6 build on each other sequentially.