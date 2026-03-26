# Engineering Specification: tui-repo-tab-bar-component

## Horizontal Tab Bar Component for Repository Sub-Views

**Ticket**: `tui-repo-tab-bar-component`
**Dependencies**: `tui-responsive-layout` (✅ implemented — `useLayout`, `useBreakpoint`, `useResponsiveValue`), `tui-theme-tokens` (✅ implemented — `ThemeProvider`, `useTheme`, `TextAttributes`)
**Feature**: `TUI_REPO_TAB_NAVIGATION` (under `TUI_REPOSITORY` feature group in `specs/tui/features.ts`)
**Status**: Not yet implemented — greenfield

---

## Overview

This spec defines the implementation of a reusable `TabBar` component and its supporting context (`RepoTabContext`) for navigating between the six repository sub-views: Bookmarks, Changes, Code, Conflicts, Op Log, and Settings. The component renders a single-row horizontal bar of tabs with numeric prefixes, supports keyboard-driven tab switching with three input modes (cycle, direct jump, arrow), and persists active tab state across back-navigation.

---

## File Inventory

| File | Purpose | New/Modify |
|------|---------|------------|
| `apps/tui/src/components/TabBar.tsx` | Reusable TabBar component | **New** |
| `apps/tui/src/components/index.ts` | Export TabBar | **Modify** |
| `apps/tui/src/contexts/RepoTabContext.tsx` | Tab state context + provider | **New** |
| `apps/tui/src/contexts/index.ts` | Export RepoTabContext | **New** |
| `apps/tui/src/hooks/useRepoTab.ts` | Consumer hook for RepoTabContext | **New** |
| `apps/tui/src/hooks/useTabBarKeybindings.ts` | Tab keybinding registration with suppression logic | **New** |
| `apps/tui/src/hooks/index.ts` | Export new hooks | **Modify** |
| `apps/tui/src/types/tab.ts` | Tab definition types | **New** |
| `apps/tui/src/types/index.ts` | Export tab types | **Modify** |
| `apps/tui/src/constants/repo-tabs.ts` | Static REPO_TABS array | **New** |
| `apps/tui/src/constants/index.ts` | Export constants | **New** |
| `e2e/tui/repository.test.ts` | E2E tests for tab bar | **Modify** (add tests) |

---

## Implementation Plan

### Step 1: Define Tab Types

**File**: `apps/tui/src/types/tab.ts`

Define the data model for a single tab definition and the tab bar configuration.

```typescript
/**
 * A single tab definition in the tab bar.
 *
 * Tabs are defined statically — the set of tabs is fixed at compile time.
 * Tab content is rendered by the consuming screen, not by the TabBar component.
 */
export interface TabDefinition {
  /** Stable identifier for the tab (used as React key and persistence key) */
  readonly id: string;
  /** Full label displayed at standard+ terminal widths (e.g., "Bookmarks") */
  readonly label: string;
  /** Abbreviated label displayed at 80-99 column widths (e.g., "Bkmk") */
  readonly short: string;
  /** The 1-based number key that jumps to this tab (e.g., "1", "2") */
  readonly key: string;
}

/**
 * Props for the TabBar component.
 */
export interface TabBarProps {
  /** Ordered array of tab definitions. Length determines valid index range. */
  readonly tabs: readonly TabDefinition[];
  /** 0-based index of the currently active tab. Clamped to [0, tabs.length-1]. */
  readonly activeIndex: number;
  /** Called when the user switches tabs via any input method. */
  readonly onTabChange: (index: number) => void;
  /**
   * Whether tab keybindings should be suppressed.
   * When true, Tab/Shift+Tab/number keys/arrows do not switch tabs.
   * This is controlled externally by the consuming screen based on
   * focus state (text input focused, modal open, etc.).
   */
  readonly suppressInput?: boolean;
}

/** Method by which a tab switch occurred (for telemetry/logging). */
export type TabSwitchMethod = "cycle" | "number" | "arrow";
```

**Modify**: `apps/tui/src/types/index.ts` — add `export * from "./tab.js";`

---

### Step 2: Define Static Tab Constant Array

**File**: `apps/tui/src/constants/repo-tabs.ts`

```typescript
import type { TabDefinition } from "../types/tab.js";

/**
 * The 6 fixed repository tabs.
 *
 * Order matches the numeric prefix and the visual left-to-right order.
 * This array is the single source of truth for tab IDs, labels,
 * and abbreviations. It is never modified at runtime.
 */
export const REPO_TABS: readonly TabDefinition[] = Object.freeze([
  { id: "bookmarks",  label: "Bookmarks", short: "Bkmk", key: "1" },
  { id: "changes",    label: "Changes",   short: "Chng", key: "2" },
  { id: "code",       label: "Code",      short: "Code", key: "3" },
  { id: "conflicts",  label: "Conflicts", short: "Cnfl", key: "4" },
  { id: "oplog",      label: "Op Log",    short: "OpLg", key: "5" },
  { id: "settings",   label: "Settings",  short: "Sett", key: "6" },
]);

/** Number of repository tabs. Used for modular arithmetic in cycling. */
export const REPO_TAB_COUNT = REPO_TABS.length;

/** Default active tab index when entering a new repository. */
export const DEFAULT_TAB_INDEX = 0;
```

**File**: `apps/tui/src/constants/index.ts`

```typescript
export { REPO_TABS, REPO_TAB_COUNT, DEFAULT_TAB_INDEX } from "./repo-tabs.js";
```

---

### Step 3: Build the RepoTabContext

**File**: `apps/tui/src/contexts/RepoTabContext.tsx`

This context persists the active tab index per repository. It stores a `Map<string, number>` keyed by `owner/repo` string, so that navigating away and back restores the last-active tab. Navigating to a different repo returns to the default tab.

```typescript
import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_TAB_INDEX, REPO_TAB_COUNT } from "../constants/repo-tabs.js";

/** Unique key for a repository in the tab state map. */
function repoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

export interface RepoTabContextValue {
  /** The active tab index for the current repository. */
  activeIndex: number;
  /** Set the active tab index for the current repository. Clamped to [0, REPO_TAB_COUNT-1]. */
  setActiveIndex: (index: number) => void;
  /** The current repository key, or null if no repo context. */
  currentRepoKey: string | null;
}

export const RepoTabContext = createContext<RepoTabContextValue | null>(null);

export interface RepoTabProviderProps {
  /** owner from navigation repo context */
  owner: string | null;
  /** repo name from navigation repo context */
  repo: string | null;
  children: ReactNode;
}

/**
 * Provides per-repository tab state.
 *
 * Stores a Map<repoKey, tabIndex> in a ref so tab state
 * persists across re-renders and navigation events.
 * The active tab for the current repo is exposed via
 * React state so that changes trigger re-renders.
 *
 * When owner/repo changes, the active index is resolved:
 * - If the new repo has a previously stored index → use it
 * - Otherwise → DEFAULT_TAB_INDEX (0, Bookmarks)
 */
export function RepoTabProvider({ owner, repo, children }: RepoTabProviderProps) {
  const tabStateMap = useRef<Map<string, number>>(new Map());

  const key = owner && repo ? repoKey(owner, repo) : null;

  // Resolve initial index from map or default
  const storedIndex = key ? tabStateMap.current.get(key) ?? DEFAULT_TAB_INDEX : DEFAULT_TAB_INDEX;

  const [activeIndex, setActiveIndexState] = useState<number>(storedIndex);

  // Sync state when repo context changes
  const prevKeyRef = useRef<string | null>(key);
  if (key !== prevKeyRef.current) {
    prevKeyRef.current = key;
    const restored = key ? tabStateMap.current.get(key) ?? DEFAULT_TAB_INDEX : DEFAULT_TAB_INDEX;
    if (restored !== activeIndex) {
      setActiveIndexState(restored);
    }
  }

  const setActiveIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(REPO_TAB_COUNT - 1, index));
      setActiveIndexState(clamped);
      if (key) {
        tabStateMap.current.set(key, clamped);
      }
    },
    [key],
  );

  const value = useMemo<RepoTabContextValue>(
    () => ({ activeIndex, setActiveIndex, currentRepoKey: key }),
    [activeIndex, setActiveIndex, key],
  );

  return (
    <RepoTabContext.Provider value={value}>
      {children}
    </RepoTabContext.Provider>
  );
}
```

**File**: `apps/tui/src/contexts/index.ts`

```typescript
export { RepoTabContext, RepoTabProvider, type RepoTabContextValue, type RepoTabProviderProps } from "./RepoTabContext.js";
```

---

### Step 4: Build the `useRepoTab` Hook

**File**: `apps/tui/src/hooks/useRepoTab.ts`

```typescript
import { useContext } from "react";
import { RepoTabContext, type RepoTabContextValue } from "../contexts/RepoTabContext.js";

/**
 * Access the repository tab context.
 *
 * Must be used within a <RepoTabProvider>.
 * Returns the active tab index and setter for the current repository.
 *
 * @example
 * const { activeIndex, setActiveIndex } = useRepoTab();
 * setActiveIndex(2); // switch to Code tab
 */
export function useRepoTab(): RepoTabContextValue {
  const ctx = useContext(RepoTabContext);
  if (!ctx) {
    throw new Error(
      "useRepoTab() must be used within a <RepoTabProvider>. " +
      "Ensure RepoTabProvider wraps the repository overview screen."
    );
  }
  return ctx;
}
```

---

### Step 5: Build the `useTabBarKeybindings` Hook

**File**: `apps/tui/src/hooks/useTabBarKeybindings.ts`

This hook encapsulates all keyboard interaction logic for the tab bar. It registers keybindings via `useScreenKeybindings()` with `when` predicates that check suppression state.

```typescript
import { useMemo, useCallback } from "react";
import { useScreenKeybindings } from "./useScreenKeybindings.js";
import { useOverlay } from "./useOverlay.js";
import { REPO_TAB_COUNT } from "../constants/repo-tabs.js";
import type { KeyHandler, StatusBarHint } from "../providers/keybinding-types.js";

interface UseTabBarKeybindingsOptions {
  /** Current active tab index */
  activeIndex: number;
  /** Setter for active tab index */
  setActiveIndex: (index: number) => void;
  /**
   * External suppression signal.
   * When true, all tab keybindings are no-ops.
   * Typically reflects whether a text input or child form has focus.
   */
  inputFocused: boolean;
}

/**
 * Register tab bar keybindings and status bar hints.
 *
 * Keybindings:
 * - Tab / Shift+Tab: cycle with wrap
 * - 1-6: direct jump
 * - h/l / Left/Right: arrow navigation without wrap
 *
 * All bindings are suppressed when:
 * - inputFocused is true (text input has focus)
 * - A modal/overlay is active (checked via useOverlay)
 *
 * This hook calls useScreenKeybindings internally, which registers
 * a PRIORITY.SCREEN scope. The `when` predicate on each binding
 * ensures suppression without scope removal/re-registration.
 */
export function useTabBarKeybindings({
  activeIndex,
  setActiveIndex,
  inputFocused,
}: UseTabBarKeybindingsOptions): void {
  const { activeOverlay } = useOverlay();

  // Suppression predicate: returns true when tab keys should be active
  const canSwitch = useCallback(
    (): boolean => !inputFocused && activeOverlay === null,
    [inputFocused, activeOverlay],
  );

  const cycleForward = useCallback(() => {
    setActiveIndex((activeIndex + 1) % REPO_TAB_COUNT);
  }, [activeIndex, setActiveIndex]);

  const cycleBackward = useCallback(() => {
    setActiveIndex((activeIndex + REPO_TAB_COUNT - 1) % REPO_TAB_COUNT);
  }, [activeIndex, setActiveIndex]);

  const arrowRight = useCallback(() => {
    if (activeIndex < REPO_TAB_COUNT - 1) {
      setActiveIndex(activeIndex + 1);
    }
  }, [activeIndex, setActiveIndex]);

  const arrowLeft = useCallback(() => {
    if (activeIndex > 0) {
      setActiveIndex(activeIndex - 1);
    }
  }, [activeIndex, setActiveIndex]);

  const jumpTo = useCallback(
    (index: number) => {
      if (index >= 0 && index < REPO_TAB_COUNT && index !== activeIndex) {
        setActiveIndex(index);
      }
    },
    [activeIndex, setActiveIndex],
  );

  const GROUP = "Repository Tabs";

  const bindings: KeyHandler[] = useMemo(
    () => [
      // Tab cycling (wraps)
      { key: "tab",       description: "Next tab",       group: GROUP, handler: cycleForward,  when: canSwitch },
      { key: "shift+tab", description: "Previous tab",   group: GROUP, handler: cycleBackward, when: canSwitch },

      // Direct number jumps
      { key: "1", description: "Bookmarks",  group: GROUP, handler: () => jumpTo(0), when: canSwitch },
      { key: "2", description: "Changes",    group: GROUP, handler: () => jumpTo(1), when: canSwitch },
      { key: "3", description: "Code",       group: GROUP, handler: () => jumpTo(2), when: canSwitch },
      { key: "4", description: "Conflicts",  group: GROUP, handler: () => jumpTo(3), when: canSwitch },
      { key: "5", description: "Op Log",     group: GROUP, handler: () => jumpTo(4), when: canSwitch },
      { key: "6", description: "Settings",   group: GROUP, handler: () => jumpTo(5), when: canSwitch },

      // Arrow / vim navigation (no wrap)
      { key: "l",     description: "Next tab",     group: GROUP, handler: arrowRight, when: canSwitch },
      { key: "right", description: "Next tab",     group: GROUP, handler: arrowRight, when: canSwitch },
      { key: "h",     description: "Previous tab", group: GROUP, handler: arrowLeft,  when: canSwitch },
      { key: "left",  description: "Previous tab", group: GROUP, handler: arrowLeft,  when: canSwitch },
    ],
    [cycleForward, cycleBackward, arrowRight, arrowLeft, jumpTo, canSwitch],
  );

  const hints: StatusBarHint[] = useMemo(
    () => [
      { keys: "Tab/S-Tab", label: "switch tab", order: 10 },
      { keys: "1-6",       label: "jump to tab", order: 11 },
    ],
    [],
  );

  useScreenKeybindings(bindings, hints);
}
```

---

### Step 6: Build the TabBar Component

**File**: `apps/tui/src/components/TabBar.tsx`

The visual component. It renders a single row of tab labels with responsive formatting and active-tab styling. It does **not** handle keyboard input — that is delegated to `useTabBarKeybindings` in the consuming screen. The TabBar is a pure presentational component.

```typescript
import { useMemo } from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useLayout } from "../hooks/useLayout.js";
import { TextAttributes } from "../theme/tokens.js";
import type { TabBarProps } from "../types/tab.js";

/**
 * Format a tab label based on terminal width.
 *
 * - < 100 columns: abbreviated (e.g., "1:Bkmk")
 * - >= 100 columns: full label (e.g., "1:Bookmarks")
 */
function formatTabLabel(
  tab: { label: string; short: string },
  index: number,
  terminalWidth: number,
): string {
  const num = index + 1;
  if (terminalWidth < 100) {
    return `${num}:${tab.short}`;
  }
  return `${num}:${tab.label}`;
}

/**
 * Determine inter-tab spacing based on terminal width.
 *
 * - < 200 columns: 2 spaces
 * - >= 200 columns: 4 spaces (expanded padding for large terminals)
 */
function getTabSpacing(terminalWidth: number): string {
  return terminalWidth >= 200 ? "    " : "  ";
}

/**
 * Horizontal tab bar component.
 *
 * Renders a fixed 1-row horizontal strip of tabs with:
 * - Numeric prefix labels ("1:Bookmarks")
 * - Reverse-video + underline on the active tab
 * - Muted color on inactive tabs
 * - Responsive label abbreviation at narrow widths
 * - Expanded spacing at large widths
 *
 * This component is purely presentational. Keyboard interaction
 * is handled by useTabBarKeybindings() in the consuming screen.
 *
 * @example
 * <TabBar
 *   tabs={REPO_TABS}
 *   activeIndex={activeIndex}
 *   onTabChange={setActiveIndex}
 * />
 */
export function TabBar({ tabs, activeIndex, onTabChange }: TabBarProps) {
  const theme = useTheme();
  const { width } = useLayout();

  const clampedIndex = Math.max(0, Math.min(tabs.length - 1, activeIndex));
  const spacing = getTabSpacing(width);

  // Build the formatted labels array
  const labels = useMemo(
    () => tabs.map((tab, i) => formatTabLabel(tab, i, width)),
    [tabs, width],
  );

  return (
    <box
      flexDirection="row"
      width="100%"
      height={1}
    >
      {labels.map((label, index) => {
        const isActive = index === clampedIndex;
        const isLast = index === labels.length - 1;

        return (
          <box key={tabs[index].id} flexDirection="row">
            <text
              fg={isActive ? theme.primary : theme.muted}
              attributes={
                isActive
                  ? TextAttributes.REVERSE | TextAttributes.UNDERLINE | TextAttributes.BOLD
                  : 0
              }
            >
              {isActive ? ` ${label} ` : label}
            </text>
            {!isLast && (
              <text fg={theme.muted}>{spacing}</text>
            )}
          </box>
        );
      })}
    </box>
  );
}
```

**Key design decisions:**

1. **Active tab padding**: The active tab label is padded with 1 space on each side (`" ${label} "`) so the reverse-video highlight has visual breathing room and doesn't collide with adjacent tabs.

2. **No keyboard handling in component**: The TabBar is a dumb render component. This allows it to be reused (e.g., for Search tabs) without coupling to repo-specific keybinding logic.

3. **No border**: The tab bar does not draw its own border. The consuming screen layout handles separation between the tab bar row and content area.

4. **Height is always 1**: The tab bar never wraps. At 80 columns with abbreviated labels, the total width is `6 × 6 + 5 × 2 + 2 (active padding) = 48 chars`, well within budget.

---

### Step 7: Wire Into RepoOverview Screen

**File**: `apps/tui/src/screens/RepoOverview/RepoOverviewScreen.tsx` (new file, part of `TUI_REPO_OVERVIEW` ticket but the TabBar integration point is defined here)

The `RepoOverviewScreen` is the consuming screen. It wraps its content in `<RepoTabProvider>`, renders the `<TabBar>`, registers `useTabBarKeybindings`, and conditionally renders the active tab's content panel.

This is a sketch showing the integration pattern — the full `RepoOverviewScreen` implementation is a separate ticket (`TUI_REPO_OVERVIEW`), but the tab bar wiring is part of this ticket:

```typescript
import { useState, useCallback } from "react";
import { TabBar } from "../../components/TabBar.js";
import { RepoTabProvider } from "../../contexts/RepoTabContext.js";
import { useRepoTab } from "../../hooks/useRepoTab.js";
import { useTabBarKeybindings } from "../../hooks/useTabBarKeybindings.js";
import { useNavigation } from "../../providers/NavigationProvider.js";
import { REPO_TABS } from "../../constants/repo-tabs.js";
import type { ScreenComponentProps } from "../../router/types.js";

function RepoOverviewContent({ entry, params }: ScreenComponentProps) {
  const { activeIndex, setActiveIndex } = useRepoTab();
  const [inputFocused, setInputFocused] = useState(false);

  useTabBarKeybindings({ activeIndex, setActiveIndex, inputFocused });

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Repository header — separate ticket */}
      {/* <RepoHeader owner={params.owner} repo={params.repo} /> */}

      {/* Tab bar */}
      <TabBar
        tabs={REPO_TABS}
        activeIndex={activeIndex}
        onTabChange={setActiveIndex}
      />

      {/* Tab content area */}
      <box flexGrow={1}>
        {activeIndex === 0 && <text>Bookmarks content placeholder</text>}
        {activeIndex === 1 && <text>Changes content placeholder</text>}
        {activeIndex === 2 && <text>Code content placeholder</text>}
        {activeIndex === 3 && <text>Conflicts content placeholder</text>}
        {activeIndex === 4 && <text>Op Log content placeholder</text>}
        {activeIndex === 5 && <text>Settings content placeholder</text>}
      </box>
    </box>
  );
}

export function RepoOverviewScreen(props: ScreenComponentProps) {
  const nav = useNavigation();
  const repoCtx = nav.repoContext;

  return (
    <RepoTabProvider owner={repoCtx?.owner ?? null} repo={repoCtx?.repo ?? null}>
      <RepoOverviewContent {...props} />
    </RepoTabProvider>
  );
}
```

---

### Step 8: Register in Screen Registry

**File**: `apps/tui/src/router/registry.ts` — **Modify**

Update the `RepoOverview` entry in `screenRegistry` to point to the new `RepoOverviewScreen` instead of `PlaceholderScreen`.

```typescript
import { RepoOverviewScreen } from "../screens/RepoOverview/RepoOverviewScreen.js";

// In screenRegistry:
  [ScreenName.RepoOverview]: {
    component: RepoOverviewScreen,  // was PlaceholderScreen
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: (params) => params.repo ? `${params.owner}/${params.repo}` : "Repository",
  },
```

---

### Step 9: Update Component and Hook Exports

**File**: `apps/tui/src/components/index.ts` — **Modify**

```typescript
export { TabBar } from "./TabBar.js";
```

**File**: `apps/tui/src/hooks/index.ts` — **Modify**

```typescript
export { useRepoTab } from "./useRepoTab.js";
export { useTabBarKeybindings } from "./useTabBarKeybindings.js";
```

---

## Component API Reference

### `<TabBar>`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `tabs` | `readonly TabDefinition[]` | Required | Ordered tab definitions |
| `activeIndex` | `number` | Required | 0-based active tab index |
| `onTabChange` | `(index: number) => void` | Required | Called on tab switch |
| `suppressInput` | `boolean` | `false` | Externally suppress keyboard handling |

**Rendering behavior:**
- Always occupies exactly 1 row
- Never wraps to multiple lines
- Active tab: `theme.primary` foreground + `REVERSE | UNDERLINE | BOLD` attributes + 1-char padding
- Inactive tabs: `theme.muted` foreground, no attributes
- Tab spacing: 2 chars at <200 columns, 4 chars at ≥200 columns
- Label format: `"N:Short"` at <100 columns, `"N:Full"` at ≥100 columns

### `<RepoTabProvider>`

| Prop | Type | Description |
|------|------|-------------|
| `owner` | `string \| null` | Repository owner from nav context |
| `repo` | `string \| null` | Repository name from nav context |
| `children` | `ReactNode` | Child tree |

**State behavior:**
- Maintains a `Map<string, number>` mapping `"owner/repo"` → `activeTabIndex`
- On repo context change: restores stored index or resets to 0
- On `setActiveIndex`: clamps to `[0, REPO_TAB_COUNT-1]` and persists to map

### `useRepoTab()`

**Returns**: `RepoTabContextValue`
- `activeIndex: number` — current active tab (0-based)
- `setActiveIndex: (index: number) => void` — set active tab (auto-clamped)
- `currentRepoKey: string | null` — `"owner/repo"` or null

### `useTabBarKeybindings(options)`

| Option | Type | Description |
|--------|------|-------------|
| `activeIndex` | `number` | Current tab index |
| `setActiveIndex` | `(n: number) => void` | Tab index setter |
| `inputFocused` | `boolean` | Whether a text input/textarea has focus |

**Registered keybindings** (all with `when: canSwitch`):

| Key | Action | Wrap |
|-----|--------|------|
| `tab` | Next tab | ✅ wraps at end |
| `shift+tab` | Previous tab | ✅ wraps at start |
| `1`-`6` | Direct jump | N/A |
| `h` / `left` | Previous tab | ❌ no wrap |
| `l` / `right` | Next tab | ❌ no wrap |

**Suppression**: All bindings return early (no-op) when `inputFocused === true` OR `activeOverlay !== null`. The `when` predicate handles this without scope re-registration.

---

## Responsive Behavior Matrix

| Width Range | Label Format | Example | Inter-Tab Spacing | Total Bar Width |
|-------------|-------------|---------|-------------------|----------------|
| < 80 | N/A (unsupported) | N/A | N/A | N/A |
| 80-99 | Abbreviated | `1:Bkmk` | 2 spaces | ~48 chars |
| 100-199 | Full | `1:Bookmarks` | 2 spaces | ~82 chars |
| 200+ | Full | `1:Bookmarks` | 4 spaces | ~92 chars |

Note: The label format breakpoint is at 100 columns (based on `terminalWidth`), not tied to the layout breakpoint system (which breaks at 80/120/200). This provides a smoother transition — labels stay abbreviated in the 80-99 range where space is tight but switch to full at 100 where there's room.

---

## Input Suppression Architecture

Tab switching must be suppressed in three contexts. The suppression is implemented via the `when` predicate on each `KeyHandler`, which is evaluated at dispatch time by the `KeybindingProvider`.

### Suppression Sources

1. **Text input/textarea focus** (Priority 1 — TEXT_INPUT)
   - OpenTUI's native input focus system captures all printable keys when an `<input>` or `<textarea>` has `focused={true}`.
   - For `Tab`/`Shift+Tab`, the consuming screen tracks `inputFocused` state and passes it to `useTabBarKeybindings`. When `inputFocused === true`, the `when` predicate returns `false`, so the tab keybinding scope does not handle the event.
   - Tab/Shift+Tab in a focused form field navigates fields (handled by the form's own keybindings at a higher or equal priority).

2. **Modal/overlay open** (Priority 2 — MODAL)
   - The OverlayManager registers a PRIORITY.MODAL scope when an overlay opens.
   - The `when` predicate in `useTabBarKeybindings` checks `activeOverlay !== null` from `useOverlay()`. If an overlay is open, all tab keybindings return `false` and do not handle the key.
   - Additionally, the modal scope captures `Esc` at PRIORITY.MODAL, which is higher than PRIORITY.SCREEN, so the overlay handler wins.

3. **Go-to mode** (Priority 3 — GOTO)
   - Go-to mode is active for 1500ms after pressing `g`. During this time, the go-to scope has higher priority (3) than screen keybindings (4), so if the user presses `g` then `l`, it's handled by go-to mode, not by the tab bar's `l` handler.

### Priority Stack (for reference)

```
Priority 1: TEXT_INPUT — OpenTUI focus system
Priority 2: MODAL — Overlay/modal keybindings
Priority 3: GOTO — Go-to mode (g prefix)
Priority 4: SCREEN — Tab bar keybindings (this feature) + other screen bindings
Priority 5: GLOBAL — q, Esc, ?, :, Ctrl+C
```

Because tab bar keybindings are registered at PRIORITY.SCREEN (4), they are naturally suppressed by any higher-priority scope that handles the same key. The `when` predicate provides additional safety for the overlay case (since overlays may not register handlers for all keys like `1`-`6`).

---

## Tab State Persistence Flow

```
User on repo "alice/myapp", tab = Code (index 2)
  ├─ tabStateMap: { "alice/myapp": 2 }
  │
  ├─ User presses `q` (pop back to repo list)
  │   └─ RepoTabProvider stays mounted if using context at a higher level,
  │      OR tabStateMap ref persists in closure
  │
  ├─ User presses Enter on "alice/myapp" again
  │   └─ RepoTabProvider mounts with owner="alice", repo="myapp"
  │       └─ Reads tabStateMap.get("alice/myapp") → 2
  │       └─ activeIndex initializes to 2 (Code tab)
  │
  ├─ User navigates to different repo "bob/other"
  │   └─ RepoTabProvider updates with owner="bob", repo="other"
  │       └─ tabStateMap.get("bob/other") → undefined
  │       └─ activeIndex resets to 0 (Bookmarks, default)
```

**Important**: The `RepoTabProvider` must be placed within the `RepoOverviewScreen` component, NOT in the global provider stack. This ensures the tab state map ref is scoped to the screen lifecycle. However, for persistence across back-navigation, the tab state map should live in a ref that survives unmount/remount cycles. The cleanest approach: place the `Map` in a module-level variable (since TUI is a single-instance app) or use a context higher in the tree.

**Chosen approach**: Module-level `Map` in `RepoTabContext.tsx`. This is the simplest solution since the TUI is always a single instance. The `RepoTabProvider` reads from and writes to this module-level map. When the TUI quits, the map is garbage-collected. No serialization needed.

```typescript
// Module-level persistence (top of RepoTabContext.tsx)
const globalTabStateMap = new Map<string, number>();
```

The `RepoTabProvider` uses this instead of a `useRef` map, ensuring tab state survives component unmount/remount across navigation.

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Active index > tabs.length - 1 | Clamped to `tabs.length - 1` |
| Active index < 0 | Clamped to 0 |
| Keys `7`, `8`, `9`, `0` pressed | No-op — not registered as bindings, fall through to global handler |
| Jump to already-active tab (e.g., press `1` when on Bookmarks) | No-op — `jumpTo` checks `index !== activeIndex` |
| Terminal < 80×24 | AppShell renders `TerminalTooSmallScreen`. TabBar never mounts |
| Rapid key presses | Each key event dispatches synchronously. React batches state updates. Final state is the last key pressed |
| Resize during tab switch | `useLayout` recalculates synchronously on SIGWINCH. Tab bar re-renders with new label format. Active index preserved |
| No repo context (owner/repo null) | RepoTabProvider treats key as null. Active index defaults to 0. State not persisted |

---

## Productionization Checklist

1. **No POC code**: All code in this spec is production-quality. No code lives in `poc/` — the implementation goes directly into `apps/tui/src/`.

2. **Module-level Map for persistence**: The `globalTabStateMap` in `RepoTabContext.tsx` is acceptable for production because:
   - The TUI is a single-instance application (one process, one React tree)
   - The map is small (one entry per visited repo, each entry is a string key + number value)
   - No serialization to disk is needed (tab state is session-only)
   - Garbage collected on process exit

3. **Memory bound**: If a user visits 1000+ repos in a single session, the map grows to ~1000 entries. Each entry is ~50 bytes (string key + number). Total: ~50KB. No eviction needed.

4. **Type safety**: All types are exported from `types/tab.ts`. No `any` types. All indices are clamped. The `REPO_TABS` constant is `Object.freeze`'d and `as const`.

5. **Tree-shakeable**: The `TabBar` component, `useRepoTab` hook, and `useTabBarKeybindings` hook are independent exports. A screen that doesn't use tabs never imports them.

6. **No new dependencies**: Uses only existing packages: `react`, `@opentui/react`, existing TUI providers and hooks. No new npm packages.

---

## Unit & Integration Tests

### Test File: `e2e/tui/repository.test.ts`

All tests use `@microsoft/tui-test` via the `launchTUI` helper from `e2e/tui/helpers.ts`. Tests run against a real API server (or fail if the server is unavailable — they are never skipped). Snapshot tests capture the full terminal buffer.

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, TERMINAL_SIZES, type TUITestInstance } from "./helpers.ts";

// ---------------------------------------------------------------------------
// TUI_REPO_TAB_NAVIGATION — Tab Bar Rendering
// ---------------------------------------------------------------------------

describe("TUI_REPO_TAB_NAVIGATION — Tab Bar Rendering", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    if (tui) await tui.terminate();
  });

  test("tab bar renders 6 tabs with Bookmarks active by default", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to a repository
    await tui.sendKeys("g", "r"); // go to repo list
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter"); // open first repo
    await tui.waitForText("1:Bookmarks");

    const snapshot = tui.snapshot();
    // All 6 tabs should be visible
    expect(snapshot).toContain("1:Bookmarks");
    expect(snapshot).toContain("2:Changes");
    expect(snapshot).toContain("3:Code");
    expect(snapshot).toContain("4:Conflicts");
    expect(snapshot).toContain("5:Op Log");
    expect(snapshot).toContain("6:Settings");
  });

  test("active tab shows reverse-video styling at 120x40", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    // Snapshot captures ANSI escape sequences including reverse video (SGR 7)
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("pressing 2 switches to Changes tab", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    await tui.sendKeys("2");
    // Snapshot should show Changes tab active
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("tab bar shows abbreviated labels at 80x24", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bkmk");

    const snapshot = tui.snapshot();
    expect(snapshot).toContain("1:Bkmk");
    expect(snapshot).toContain("2:Chng");
    expect(snapshot).toContain("3:Code");
    expect(snapshot).toContain("4:Cnfl");
    expect(snapshot).toContain("5:OpLg");
    expect(snapshot).toContain("6:Sett");
    // Full labels should NOT appear
    expect(snapshot).not.toContain("Bookmarks");
  });

  test("tab bar shows full labels at 120x40", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    const snapshot = tui.snapshot();
    expect(snapshot).toContain("1:Bookmarks");
    expect(snapshot).toContain("2:Changes");
  });

  test("tab bar shows expanded spacing at 200x60", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
    });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    // Snapshot captures wider spacing between tabs
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("each tab label starts with numeric prefix", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    const snapshot = tui.snapshot();
    for (let i = 1; i <= 6; i++) {
      expect(snapshot).toMatch(new RegExp(`${i}:\\w+`));
    }
  });
});

// ---------------------------------------------------------------------------
// TUI_REPO_TAB_NAVIGATION — Tab Cycling
// ---------------------------------------------------------------------------

describe("TUI_REPO_TAB_NAVIGATION — Tab Cycling", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    if (tui) await tui.terminate();
  });

  test("Tab cycles forward from Bookmarks to Changes", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    await tui.sendKeys("Tab");
    // Changes content should appear
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("Shift+Tab wraps backward from Bookmarks to Settings", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    await tui.sendKeys("shift+Tab");
    // Settings tab should be active
    const snapshot = tui.snapshot();
    // Verify Settings content is shown
    expect(snapshot).toMatchSnapshot();
  });

  test("Tab wraps forward from Settings to Bookmarks", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    await tui.sendKeys("6"); // jump to Settings
    await tui.sendKeys("Tab"); // should wrap to Bookmarks
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("full forward cycle returns to original tab", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    // Press Tab 6 times to cycle through all tabs back to start
    for (let i = 0; i < 6; i++) {
      await tui.sendKeys("Tab");
    }
    // Should be back on Bookmarks
    expect(tui.snapshot()).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// TUI_REPO_TAB_NAVIGATION — Number Key Direct Jump
// ---------------------------------------------------------------------------

describe("TUI_REPO_TAB_NAVIGATION — Number Key Direct Jump", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    if (tui) await tui.terminate();
  });

  test("number keys 1-6 jump to corresponding tabs", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    // Jump to each tab and verify
    for (const num of ["3", "5", "1", "4", "2", "6"]) {
      await tui.sendKeys(num);
      expect(tui.snapshot()).toMatchSnapshot();
    }
  });

  test("keys 7, 8, 9, 0 are no-ops", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    await tui.sendKeys("3"); // go to Code tab
    const beforeSnapshot = tui.snapshot();

    await tui.sendKeys("7");
    expect(tui.snapshot()).toBe(beforeSnapshot);

    await tui.sendKeys("8");
    expect(tui.snapshot()).toBe(beforeSnapshot);

    await tui.sendKeys("9");
    expect(tui.snapshot()).toBe(beforeSnapshot);

    await tui.sendKeys("0");
    expect(tui.snapshot()).toBe(beforeSnapshot);
  });

  test("jumping to already-active tab is a no-op", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    const initialSnapshot = tui.snapshot();
    await tui.sendKeys("1"); // already on Bookmarks
    expect(tui.snapshot()).toBe(initialSnapshot);
  });
});

// ---------------------------------------------------------------------------
// TUI_REPO_TAB_NAVIGATION — Arrow Key Navigation
// ---------------------------------------------------------------------------

describe("TUI_REPO_TAB_NAVIGATION — Arrow Key Navigation", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    if (tui) await tui.terminate();
  });

  test("l/Right moves to next tab without wrap", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    await tui.sendKeys("l"); // Bookmarks → Changes
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("h/Left moves to previous tab without wrap", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    await tui.sendKeys("2"); // go to Changes
    await tui.sendKeys("h"); // Changes → Bookmarks
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("l/Right on last tab (Settings) is a no-op", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    await tui.sendKeys("6"); // go to Settings
    const snapshot = tui.snapshot();
    await tui.sendKeys("l"); // should be no-op
    expect(tui.snapshot()).toBe(snapshot);
  });

  test("h/Left on first tab (Bookmarks) is a no-op", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    const snapshot = tui.snapshot();
    await tui.sendKeys("h"); // already on first tab, no-op
    expect(tui.snapshot()).toBe(snapshot);
  });

  test("Right arrow key moves to next tab", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    await tui.sendKeys("Right"); // Bookmarks → Changes
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("Left arrow key moves to previous tab", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    await tui.sendKeys("2"); // Changes
    await tui.sendKeys("Left"); // Changes → Bookmarks
    expect(tui.snapshot()).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// TUI_REPO_TAB_NAVIGATION — Input Suppression
// ---------------------------------------------------------------------------

describe("TUI_REPO_TAB_NAVIGATION — Input Suppression", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    if (tui) await tui.terminate();
  });

  test("Tab key in help overlay does not switch tabs", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    await tui.sendKeys("?"); // open help overlay
    await tui.waitForText("Help");
    await tui.sendKeys("Tab"); // should not switch tabs
    await tui.sendKeys("Escape"); // close help
    // Should still be on Bookmarks tab
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("number key in command palette does not switch tabs", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    await tui.sendKeys(":"); // open command palette
    await tui.sendKeys("2"); // type "2" in palette search, not tab switch
    await tui.sendKeys("Escape"); // close palette
    // Should still be on Bookmarks tab
    expect(tui.snapshot()).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// TUI_REPO_TAB_NAVIGATION — Tab Persistence
// ---------------------------------------------------------------------------

describe("TUI_REPO_TAB_NAVIGATION — Tab Persistence", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    if (tui) await tui.terminate();
  });

  test("active tab persists across back-navigation", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    await tui.sendKeys("3"); // switch to Code tab
    await tui.sendKeys("q"); // back to repo list
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter"); // re-enter same repo
    // Code tab should be restored
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("active tab persists across terminal resize", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    await tui.sendKeys("3"); // Code tab
    await tui.resize(80, 24); // resize to minimum
    // Code tab should still be active (abbreviated label)
    const snapshot = tui.snapshot();
    expect(snapshot).toContain("3:Code");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("labels switch from abbreviated to full on resize 80→120", async () => {
    tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bkmk");

    await tui.sendKeys("4"); // Conflicts
    await tui.resize(120, 40);
    const snapshot = tui.snapshot();
    expect(snapshot).toContain("4:Conflicts");
    expect(snapshot).not.toContain("4:Cnfl");
  });
});

// ---------------------------------------------------------------------------
// TUI_REPO_TAB_NAVIGATION — Responsive Rendering
// ---------------------------------------------------------------------------

describe("TUI_REPO_TAB_NAVIGATION — Responsive Rendering", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    if (tui) await tui.terminate();
  });

  test("snapshot at 80x24 (minimum)", async () => {
    tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bkmk");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("snapshot at 120x40 (standard)", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("snapshot at 200x60 (large)", async () => {
    tui = await launchTUI({ cols: 200, rows: 60 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");
    expect(tui.snapshot()).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// TUI_REPO_TAB_NAVIGATION — Status Bar & Help Integration
// ---------------------------------------------------------------------------

describe("TUI_REPO_TAB_NAVIGATION — Status Bar & Help Integration", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    if (tui) await tui.terminate();
  });

  test("status bar shows tab keybinding hints", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    // Last line is status bar
    const statusBar = tui.getLine(tui.rows - 1);
    expect(statusBar).toMatch(/Tab\/S-Tab/);
    expect(statusBar).toMatch(/1-6/);
  });

  test("help overlay includes Repository Tabs group", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    await tui.sendKeys("?"); // open help
    await tui.waitForText("Repository Tabs");
    const snapshot = tui.snapshot();
    expect(snapshot).toContain("Repository Tabs");
    expect(snapshot).toContain("Next tab");
    expect(snapshot).toContain("Previous tab");
    expect(snapshot).toContain("Bookmarks");
    await tui.sendKeys("Escape");
  });
});

// ---------------------------------------------------------------------------
// TUI_REPO_TAB_NAVIGATION — Rapid Input
// ---------------------------------------------------------------------------

describe("TUI_REPO_TAB_NAVIGATION — Rapid Input", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    if (tui) await tui.terminate();
  });

  test("rapid number key presses land on last pressed", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    // Press 1, 3, 5 in rapid succession
    await tui.sendKeys("1", "3", "5");
    // Should land on Op Log (index 4)
    expect(tui.snapshot()).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// TUI_REPO_TAB_NAVIGATION — Content Area
// ---------------------------------------------------------------------------

describe("TUI_REPO_TAB_NAVIGATION — Content Area", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    if (tui) await tui.terminate();
  });

  test("switching tabs replaces content area", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    const bookmarksSnapshot = tui.snapshot();
    await tui.sendKeys("2"); // switch to Changes
    const changesSnapshot = tui.snapshot();

    // Content should be different
    expect(changesSnapshot).not.toBe(bookmarksSnapshot);
  });

  test("tab bar remains visible after switching all tabs", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("Enter");
    await tui.waitForText("1:Bookmarks");

    for (const num of ["2", "3", "4", "5", "6", "1"]) {
      await tui.sendKeys(num);
      const snapshot = tui.snapshot();
      // Tab bar should always be present
      expect(snapshot).toMatch(/[1-6]:\w+/);
    }
  });
});
```

### Test Coverage Summary

| Category | Test Count | What It Validates |
|----------|-----------|-------------------|
| Tab Bar Rendering | 7 | Visual output, labels, styling, numeric prefixes |
| Tab Cycling | 4 | Tab/Shift+Tab with wrap in both directions |
| Number Key Jump | 3 | Direct jump 1-6, no-op for 7-9/0, same-tab no-op |
| Arrow Navigation | 6 | h/l/Left/Right, no-wrap at boundaries |
| Input Suppression | 2 | Help overlay, command palette |
| Tab Persistence | 3 | Back-navigation, resize, label format switch |
| Responsive Rendering | 3 | Snapshots at 80x24, 120x40, 200x60 |
| Status Bar & Help | 2 | Status bar hints, help overlay group |
| Rapid Input | 1 | Rapid number keys land on last pressed |
| Content Area | 2 | Content replacement, tab bar persistence |
| **Total** | **33** | |

### Tests Left Intentionally Failing

Per project policy, tests that fail due to unimplemented backends or screens are **never skipped or commented out**. The following tests will fail until their backend dependencies are implemented:

- Tests navigating to repo list (`g r` → Enter) will fail if the repo list screen doesn't return repos from the API
- Tests asserting specific tab content (e.g., "Bookmarks content") will fail until the individual tab panel screens are implemented
- The tab bar rendering tests themselves should pass once the TabBar component is implemented, as they only assert on the tab bar labels (which are static)

---

## Dependency Graph

```
tui-theme-tokens (✅ done)
    └─> TabBar uses useTheme() for colors

tui-responsive-layout (✅ done)
    └─> TabBar uses useLayout() for width-based label formatting

tui-repo-tab-bar-component (this ticket)
    ├─> types/tab.ts
    ├─> constants/repo-tabs.ts
    ├─> contexts/RepoTabContext.tsx
    ├─> hooks/useRepoTab.ts
    ├─> hooks/useTabBarKeybindings.ts
    ├─> components/TabBar.tsx
    └─> screens/RepoOverview integration

Future dependents:
    ├─> tui-repo-bookmarks-view (uses tab index 0)
    ├─> tui-repo-changes-view (uses tab index 1)
    ├─> tui-repo-code-explorer (uses tab index 2)
    ├─> tui-repo-conflicts-view (uses tab index 3)
    ├─> tui-repo-oplog-view (uses tab index 4)
    └─> tui-repo-settings-view (uses tab index 5)
```

---

## Acceptance Criteria Traceability

| Acceptance Criterion | Implementation Location | Test |
|---------------------|------------------------|------|
| 6 tabs with correct labels | `constants/repo-tabs.ts` | "tab bar renders 6 tabs" |
| Numeric prefix in labels | `TabBar.tsx formatTabLabel()` | "each tab label starts with numeric prefix" |
| Active tab reverse-video + underline | `TabBar.tsx` REVERSE \| UNDERLINE attributes | "active tab shows reverse-video styling" |
| Inactive tabs muted color | `TabBar.tsx` `theme.muted` | "active tab shows reverse-video styling" (snapshot) |
| Tab bar is exactly 1 row | `TabBar.tsx` `height={1}` | All snapshot tests |
| Tab/Shift+Tab cycling with wrap | `useTabBarKeybindings.ts` modular arithmetic | Tab cycling tests |
| Number key direct jump 1-6 | `useTabBarKeybindings.ts` bindings | Number key tests |
| Keys 7-9,0 are no-ops | Not registered as bindings | "keys 7, 8, 9, 0 are no-ops" |
| h/l/Left/Right without wrap | `useTabBarKeybindings.ts` clamped arithmetic | Arrow key tests |
| Suppression during input/modal | `when: canSwitch` predicate | Suppression tests |
| Abbreviated labels at 80-99 cols | `formatTabLabel()` width < 100 | "abbreviated labels at 80x24" |
| Full labels at 100+ cols | `formatTabLabel()` width >= 100 | "full labels at 120x40" |
| Expanded spacing at 200+ cols | `getTabSpacing()` width >= 200 | "expanded spacing at 200x60" |
| Tab state persists across nav | Module-level `globalTabStateMap` | "persists across back-navigation" |
| Tab state persists across resize | React state unaffected by resize | "persists across terminal resize" |
| Status bar hints | `useTabBarKeybindings` `hints` array | "status bar shows tab keybinding hints" |
| Help overlay group | `useScreenKeybindings` `group: "Repository Tabs"` | "help overlay includes Repository Tabs group" |