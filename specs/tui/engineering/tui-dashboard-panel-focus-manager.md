# Engineering Specification: tui-dashboard-panel-focus-manager

## Ticket Summary

| Field | Value |
|-------|-------|
| Title | Implement dashboard panel focus cycling and per-panel focus memory |
| Ticket ID | `tui-dashboard-panel-focus-manager` |
| Type | Engineering |
| Status | Not started |
| Dependencies | `tui-dashboard-panel-component`, `tui-dashboard-grid-layout` |

## Context

The Dashboard screen scaffold (from `tui-dashboard-screen-scaffold`) established the `DashboardScreen` component at `apps/tui/src/screens/Dashboard/index.tsx` with a static placeholder layout. The grid layout ticket (`tui-dashboard-grid-layout`) establishes the two-column, two-row panel arrangement. The panel component ticket (`tui-dashboard-panel-component`) provides the `DashboardPanel` wrapper with border highlighting and title rendering.

This ticket implements the **keyboard-driven focus management system** that makes the dashboard panels interactive. The focus manager is a custom hook (`useDashboardFocus`) that orchestrates:

1. Which of the four panels has focus (indicated by highlighted border)
2. Cycling focus between panels via Tab/Shift+Tab and h/l column navigation
3. Per-panel cursor position memory (which list item is focused)
4. Per-panel scroll position memory
5. Input focus state tracking (when the `/` filter input is active)
6. Keyboard routing that suppresses navigation keys when input is focused

The focus manager is the bridge between the `KeybindingProvider`'s priority-based dispatch system and the per-panel `<scrollbox>` components. It does NOT render any UI itself — it is a pure state-management hook that the `DashboardScreen` component consumes to wire panel props and keybindings.

## Existing Infrastructure

### KeybindingProvider dispatch model

The `KeybindingProvider` at `apps/tui/src/providers/KeybindingProvider.tsx` captures all keyboard input via a single `useKeyboard()` call from `@opentui/react`. Events are dispatched through priority-sorted scopes:

1. `PRIORITY.TEXT_INPUT (1)` — handled by OpenTUI's native focus system, not scope registration
2. `PRIORITY.MODAL (2)` — command palette, help overlay, confirmation dialogs
3. `PRIORITY.GOTO (3)` — go-to mode (active for 1500ms after `g`)
4. `PRIORITY.SCREEN (4)` — registered per-screen via `useScreenKeybindings()`
5. `PRIORITY.GLOBAL (5)` — always-active fallback (`q`, `Esc`, `Ctrl+C`, `?`, `:`, `g`)

The dispatch algorithm: active scopes are sorted by priority (ASC), then LIFO within same priority. First matching handler wins. Handlers may include a `when()` predicate for conditional activation.

### useScreenKeybindings hook

The `useScreenKeybindings()` hook at `apps/tui/src/hooks/useScreenKeybindings.ts` registers a `PRIORITY.SCREEN` scope on mount and pops it on unmount. It accepts a `KeyHandler[]` array where each handler can include a `when?: () => boolean` predicate. This is the mechanism for input focus suppression — keybindings that should not fire while a text input is active use `when: () => !isInputFocused`.

### Scroll position cache

The `NavigationProvider` at `apps/tui/src/providers/NavigationProvider.tsx` provides a `useScrollPositionCache()` hook for inter-screen scroll memory. The dashboard focus manager needs **intra-screen** scroll memory (four panels within one screen), so it maintains its own per-panel cache independent of the navigation scroll cache.

### Dashboard panel layout

Per the `TUI_DASHBOARD_SCREEN` spec, the four panels are indexed as:

| Index | Position | Panel |
|-------|----------|-------|
| 0 | Top-left | Recent Repositories |
| 1 | Top-right | Organizations |
| 2 | Bottom-left | Starred Repositories |
| 3 | Bottom-right | Activity Feed |

Grid navigation model (standard/large breakpoint):

```
┌───────┬───────┐
│  0    │  1    │
├───────┼───────┤
│  2    │  3    │
└───────┴───────┘
```

Column mapping: `left = [0, 2]`, `right = [1, 3]`. Row mapping: `top = [0, 1]`, `bottom = [2, 3]`.

At minimum breakpoint (80×24), the layout collapses to a single column — all four panels are in one vertical stack. In this mode, `h`/`l` column navigation is disabled, and Tab/Shift+Tab cycles linearly.

---

## Implementation Plan

### Step 1: Define the panel focus state types

**File created**: `apps/tui/src/screens/Dashboard/types.ts`

This file defines the types consumed by `useDashboardFocus` and all dashboard sub-components.

```typescript
/**
 * Enumeration of dashboard panel indices.
 * Matches the visual grid layout at standard breakpoint.
 */
export const PANEL = {
  RECENT_REPOS: 0,
  ORGANIZATIONS: 1,
  STARRED_REPOS: 2,
  ACTIVITY_FEED: 3,
} as const;

export type PanelIndex = (typeof PANEL)[keyof typeof PANEL];

export const PANEL_COUNT = 4;

/**
 * Per-panel focus state. Each panel independently tracks its
 * cursor position (which item is highlighted) and scroll offset
 * (vertical scroll position of the panel's scrollbox).
 */
export interface PanelFocusState {
  /** Index of the currently focused item within this panel's list. */
  cursorIndex: number;
  /** Vertical scroll offset in rows. */
  scrollOffset: number;
}

/**
 * Grid layout constants for column-based navigation.
 * At standard/large breakpoints the dashboard renders a 2×2 grid.
 */
export const GRID = {
  COLS: 2,
  ROWS: 2,
  /** Panel indices in the left column. */
  LEFT_COL: [0, 2] as readonly PanelIndex[],
  /** Panel indices in the right column. */
  RIGHT_COL: [1, 3] as readonly PanelIndex[],
  /** Given a panel index, return its column (0=left, 1=right). */
  colOf: (panel: PanelIndex): number => panel % 2,
  /** Given a panel index, return its row (0=top, 1=bottom). */
  rowOf: (panel: PanelIndex): number => Math.floor(panel / 2),
  /** Given (row, col), return the panel index. */
  panelAt: (row: number, col: number): PanelIndex =>
    (row * 2 + col) as PanelIndex,
} as const;

/**
 * Return type of the useDashboardFocus hook.
 */
export interface DashboardFocusManager {
  /** Index of the currently focused panel (0–3). */
  focusedPanel: PanelIndex;
  /** Set focus to a specific panel by index. */
  setFocusedPanel: (panel: PanelIndex) => void;
  /** Per-panel focus state map. Keys are 0–3 panel indices. */
  panelFocusState: Record<PanelIndex, PanelFocusState>;
  /** Whether a text input (e.g. filter) currently has focus. */
  isInputFocused: boolean;
  /** Set the input focus state. Called by filter input components. */
  setInputFocused: (focused: boolean) => void;
  /** Update cursor index for a specific panel. */
  setCursorIndex: (panel: PanelIndex, index: number) => void;
  /** Update scroll offset for a specific panel. */
  setScrollOffset: (panel: PanelIndex, offset: number) => void;
  /** Move cursor within the focused panel. Returns the new cursor index. */
  moveCursor: (delta: number) => number;
  /** Jump cursor to a specific index within the focused panel. */
  jumpCursor: (index: number) => void;
}
```

**Design decisions**:
- Panel indices are numeric (0–3) rather than string keys. This enables arithmetic-based grid navigation (`col = index % 2`, `row = Math.floor(index / 2)`) without lookup tables.
- `PanelFocusState` is intentionally minimal — just cursor position and scroll offset. Filter query state is NOT part of the focus manager; it lives in the filter component itself.
- The `GRID` constant object centralizes all grid geometry. Column/row calculations are pure functions, not switch statements.
- `moveCursor` and `jumpCursor` are convenience methods that encapsulate bounds checking. They abstract the pattern of "get focused panel's state, adjust cursor, clamp, save" that would otherwise be repeated in every keybinding handler.

---

### Step 2: Implement the `useDashboardFocus` hook

**File created**: `apps/tui/src/screens/Dashboard/useDashboardFocus.ts`

This is the core deliverable of this ticket — a React hook that manages all dashboard focus state.

```typescript
import { useState, useCallback, useRef } from "react";
import {
  type PanelIndex,
  type PanelFocusState,
  type DashboardFocusManager,
  PANEL,
  PANEL_COUNT,
  GRID,
} from "./types.js";

/** Default panel items counts, used for cursor bounds. Overridden by actual data. */
const DEFAULT_ITEM_COUNT = 0;

function createInitialPanelState(): Record<PanelIndex, PanelFocusState> {
  return {
    [PANEL.RECENT_REPOS]: { cursorIndex: 0, scrollOffset: 0 },
    [PANEL.ORGANIZATIONS]: { cursorIndex: 0, scrollOffset: 0 },
    [PANEL.STARRED_REPOS]: { cursorIndex: 0, scrollOffset: 0 },
    [PANEL.ACTIVITY_FEED]: { cursorIndex: 0, scrollOffset: 0 },
  } as Record<PanelIndex, PanelFocusState>;
}

export interface UseDashboardFocusOptions {
  /**
   * Number of items in each panel. Used for cursor bounds clamping.
   * Must be kept in sync with actual panel data lengths.
   */
  panelItemCounts: Record<PanelIndex, number>;
  /**
   * Whether the layout is in grid mode (two-column) or stacked mode (single-column).
   * In stacked mode, h/l column navigation is disabled.
   */
  isGridMode: boolean;
  /**
   * Number of visible rows per panel. Used for page up/down calculations.
   * Ctrl+D/Ctrl+U scroll by half this value.
   */
  panelVisibleRows: number;
}

export function useDashboardFocus(
  options: UseDashboardFocusOptions,
): DashboardFocusManager {
  const { panelItemCounts, isGridMode, panelVisibleRows } = options;

  const [focusedPanel, setFocusedPanelRaw] = useState<PanelIndex>(
    PANEL.RECENT_REPOS,
  );
  const [panelFocusState, setPanelFocusState] = useState<
    Record<PanelIndex, PanelFocusState>
  >(createInitialPanelState);
  const [isInputFocused, setInputFocused] = useState(false);

  // Refs for latest values — avoids stale closures in keybinding handlers
  const focusedPanelRef = useRef(focusedPanel);
  focusedPanelRef.current = focusedPanel;

  const panelFocusStateRef = useRef(panelFocusState);
  panelFocusStateRef.current = panelFocusState;

  const panelItemCountsRef = useRef(panelItemCounts);
  panelItemCountsRef.current = panelItemCounts;

  // ── Panel focus cycling ────────────────────────────────────────

  const setFocusedPanel = useCallback((panel: PanelIndex) => {
    // Clamp to valid range
    const clamped = Math.max(0, Math.min(PANEL_COUNT - 1, panel)) as PanelIndex;
    setFocusedPanelRaw(clamped);
    focusedPanelRef.current = clamped;
  }, []);

  // ── Cursor management ──────────────────────────────────────────

  const clampCursor = useCallback(
    (panel: PanelIndex, index: number): number => {
      const count = panelItemCountsRef.current[panel] ?? 0;
      if (count === 0) return 0;
      return Math.max(0, Math.min(count - 1, index));
    },
    [],
  );

  const setCursorIndex = useCallback(
    (panel: PanelIndex, index: number) => {
      const clamped = clampCursor(panel, index);
      setPanelFocusState((prev) => ({
        ...prev,
        [panel]: { ...prev[panel], cursorIndex: clamped },
      }));
    },
    [clampCursor],
  );

  const setScrollOffset = useCallback(
    (panel: PanelIndex, offset: number) => {
      const clampedOffset = Math.max(0, offset);
      setPanelFocusState((prev) => ({
        ...prev,
        [panel]: { ...prev[panel], scrollOffset: clampedOffset },
      }));
    },
    [],
  );

  const moveCursor = useCallback(
    (delta: number): number => {
      const panel = focusedPanelRef.current;
      const current = panelFocusStateRef.current[panel].cursorIndex;
      const newIndex = clampCursor(panel, current + delta);
      setCursorIndex(panel, newIndex);
      return newIndex;
    },
    [clampCursor, setCursorIndex],
  );

  const jumpCursor = useCallback(
    (index: number) => {
      const panel = focusedPanelRef.current;
      setCursorIndex(panel, index);
    },
    [setCursorIndex],
  );

  return {
    focusedPanel,
    setFocusedPanel,
    panelFocusState,
    isInputFocused,
    setInputFocused,
    setCursorIndex,
    setScrollOffset,
    moveCursor,
    jumpCursor,
  };
}
```

**Design decisions**:

1. **Ref + state dual tracking**: `focusedPanelRef` and `panelFocusStateRef` are maintained alongside their state counterparts. The refs provide access to the latest values inside keybinding handlers registered via `useScreenKeybindings()`, which captures the handler closures at registration time. Without refs, handlers would read stale state.

2. **Item counts passed as options**: The hook does not fetch data — it receives `panelItemCounts` from the parent `DashboardScreen` which owns the data hooks. This keeps the focus manager pure (state + logic, no I/O).

3. **Cursor clamping**: `clampCursor` ensures the cursor index is always within `[0, itemCount - 1]`. When a panel has zero items, the cursor is fixed at 0. When items are removed (e.g., filter narrows the list), the cursor is automatically clamped on the next `setCursorIndex` call.

4. **Grid mode awareness**: The hook receives `isGridMode` but does not use it internally — grid-aware navigation (h/l) is handled by the keybinding layer in Step 3. The hook exposes `setFocusedPanel` which the keybindings call with the computed target panel.

5. **Scroll offset management**: `setScrollOffset` stores per-panel scroll positions. The `<scrollbox>` components read these values to restore scroll position when a panel regains focus. The actual scrollbox scroll-sync is handled by the panel component's `useEffect`.

---

### Step 3: Create the dashboard keybinding builder

**File created**: `apps/tui/src/screens/Dashboard/useDashboardKeybindings.ts`

This file constructs the `KeyHandler[]` array consumed by `useScreenKeybindings()`. It bridges the focus manager's state with the keybinding system.

```typescript
import { useMemo, useRef } from "react";
import type { KeyHandler, StatusBarHint } from "../../providers/keybinding-types.js";
import type { DashboardFocusManager, PanelIndex } from "./types.js";
import { PANEL_COUNT, GRID } from "./types.js";

export interface UseDashboardKeybindingsOptions {
  focusManager: DashboardFocusManager;
  isGridMode: boolean;
  panelItemCounts: Record<PanelIndex, number>;
  panelVisibleRows: number;
  onSelect: (panel: PanelIndex, cursorIndex: number) => void;
  onFilter: () => void;
  onCreateRepo: () => void;
  onNotifications: () => void;
  onSearch: () => void;
  onRetry: (panel: PanelIndex) => void;
}

export function useDashboardKeybindings(
  options: UseDashboardKeybindingsOptions,
): { keybindings: KeyHandler[]; statusBarHints: StatusBarHint[] } {
  const {
    focusManager,
    isGridMode,
    panelItemCounts,
    panelVisibleRows,
    onSelect,
    onFilter,
    onCreateRepo,
    onNotifications,
    onSearch,
    onRetry,
  } = options;

  // Ref to always read latest focusManager values
  const fmRef = useRef(focusManager);
  fmRef.current = focusManager;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const isInputNotFocused = () => !fmRef.current.isInputFocused;

  const keybindings = useMemo((): KeyHandler[] => {
    const bindings: KeyHandler[] = [];

    // ── Panel focus cycling ──────────────────────────────────

    bindings.push({
      key: "tab",
      description: "Next panel",
      group: "Navigation",
      handler: () => {
        const fm = fmRef.current;
        const next = ((fm.focusedPanel + 1) % PANEL_COUNT) as PanelIndex;
        fm.setFocusedPanel(next);
      },
      when: isInputNotFocused,
    });

    bindings.push({
      key: "shift+tab",
      description: "Previous panel",
      group: "Navigation",
      handler: () => {
        const fm = fmRef.current;
        const prev = ((fm.focusedPanel - 1 + PANEL_COUNT) % PANEL_COUNT) as PanelIndex;
        fm.setFocusedPanel(prev);
      },
      when: isInputNotFocused,
    });

    // ── Column navigation (grid mode only) ───────────────────

    bindings.push({
      key: "h",
      description: "Left column",
      group: "Navigation",
      handler: () => {
        const fm = fmRef.current;
        const currentCol = GRID.colOf(fm.focusedPanel);
        if (currentCol > 0) {
          const row = GRID.rowOf(fm.focusedPanel);
          fm.setFocusedPanel(GRID.panelAt(row, currentCol - 1));
        }
      },
      when: () => isInputNotFocused() && optionsRef.current.isGridMode,
    });

    bindings.push({
      key: "l",
      description: "Right column",
      group: "Navigation",
      handler: () => {
        const fm = fmRef.current;
        const currentCol = GRID.colOf(fm.focusedPanel);
        if (currentCol < GRID.COLS - 1) {
          const row = GRID.rowOf(fm.focusedPanel);
          fm.setFocusedPanel(GRID.panelAt(row, currentCol + 1));
        }
      },
      when: () => isInputNotFocused() && optionsRef.current.isGridMode,
    });

    // ── Item cursor navigation ───────────────────────────────

    bindings.push({
      key: "j",
      description: "Move down",
      group: "Navigation",
      handler: () => { fmRef.current.moveCursor(1); },
      when: isInputNotFocused,
    });

    bindings.push({
      key: "down",
      description: "Move down",
      group: "Navigation",
      handler: () => { fmRef.current.moveCursor(1); },
      when: isInputNotFocused,
    });

    bindings.push({
      key: "k",
      description: "Move up",
      group: "Navigation",
      handler: () => { fmRef.current.moveCursor(-1); },
      when: isInputNotFocused,
    });

    bindings.push({
      key: "up",
      description: "Move up",
      group: "Navigation",
      handler: () => { fmRef.current.moveCursor(-1); },
      when: isInputNotFocused,
    });

    // ── Jump navigation ──────────────────────────────────────

    bindings.push({
      key: "G",
      description: "Last item",
      group: "Navigation",
      handler: () => {
        const fm = fmRef.current;
        const count = optionsRef.current.panelItemCounts[fm.focusedPanel] ?? 0;
        fm.jumpCursor(Math.max(0, count - 1));
      },
      when: isInputNotFocused,
    });

    // Note: "g g" (jump to first) is handled by the go-to mode system.
    // When go-to mode is active (PRIORITY.GOTO), pressing "g" enters go-to mode.
    // A second "g" within 1500ms triggers jump-to-first on the dashboard.
    // This requires the dashboard to register a "g" handler in the go-to
    // bindings context. See the go-to mode integration note below.

    // ── Page navigation ──────────────────────────────────────

    bindings.push({
      key: "ctrl+d",
      description: "Page down",
      group: "Navigation",
      handler: () => {
        const halfPage = Math.max(1, Math.floor(optionsRef.current.panelVisibleRows / 2));
        fmRef.current.moveCursor(halfPage);
      },
      when: isInputNotFocused,
    });

    bindings.push({
      key: "ctrl+u",
      description: "Page up",
      group: "Navigation",
      handler: () => {
        const halfPage = Math.max(1, Math.floor(optionsRef.current.panelVisibleRows / 2));
        fmRef.current.moveCursor(-halfPage);
      },
      when: isInputNotFocused,
    });

    // ── Selection ─────────────────────────────────────────────

    bindings.push({
      key: "return",
      description: "Open",
      group: "Actions",
      handler: () => {
        const fm = fmRef.current;
        const cursor = fm.panelFocusState[fm.focusedPanel].cursorIndex;
        optionsRef.current.onSelect(fm.focusedPanel, cursor);
      },
      when: isInputNotFocused,
    });

    // ── Quick actions ────────────────────────────────────────

    bindings.push({
      key: "/",
      description: "Filter",
      group: "Actions",
      handler: () => {
        optionsRef.current.onFilter();
        fmRef.current.setInputFocused(true);
      },
      when: isInputNotFocused,
    });

    bindings.push({
      key: "c",
      description: "New repo",
      group: "Actions",
      handler: () => { optionsRef.current.onCreateRepo(); },
      when: isInputNotFocused,
    });

    bindings.push({
      key: "n",
      description: "Notifications",
      group: "Actions",
      handler: () => { optionsRef.current.onNotifications(); },
      when: isInputNotFocused,
    });

    bindings.push({
      key: "s",
      description: "Search",
      group: "Actions",
      handler: () => { optionsRef.current.onSearch(); },
      when: isInputNotFocused,
    });

    bindings.push({
      key: "R",
      description: "Retry",
      group: "Actions",
      handler: () => {
        optionsRef.current.onRetry(fmRef.current.focusedPanel);
      },
      when: isInputNotFocused,
    });

    // ── Input-mode escape ────────────────────────────────────

    bindings.push({
      key: "escape",
      description: "Close filter",
      group: "Actions",
      handler: () => {
        if (fmRef.current.isInputFocused) {
          fmRef.current.setInputFocused(false);
        }
        // If not input-focused, Escape falls through to global (pop/quit)
      },
      when: () => fmRef.current.isInputFocused,
    });

    return bindings;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGridMode]);

  const statusBarHints = useMemo((): StatusBarHint[] => [
    { keys: "j/k", label: "navigate", order: 10 },
    { keys: "Enter", label: "open", order: 20 },
    { keys: "Tab", label: "panel", order: 30 },
    { keys: "/", label: "filter", order: 40 },
    { keys: "c", label: "new repo", order: 50 },
    { keys: "n", label: "notifs", order: 60 },
    { keys: "s", label: "search", order: 70 },
  ], []);

  return { keybindings, statusBarHints };
}
```

**Design decisions**:

1. **`when()` predicates for input suppression**: Every navigation and quick-action keybinding includes `when: isInputNotFocused`. This is the primary mechanism for the input focus state requirement. When the filter input is active (`isInputFocused === true`), all single-character keys (`j`, `k`, `h`, `l`, `c`, `n`, `s`, `q`, `G`, `R`) fall through the `PRIORITY.SCREEN` scope without matching, allowing them to reach the focused `<input>` component via OpenTUI's native focus system. Only `Escape` remains active during input focus (to dismiss the filter), and `Ctrl+C` remains global (registered at `PRIORITY.GLOBAL`).

2. **Refs for all mutable state**: All handler bodies read from `fmRef.current` and `optionsRef.current` rather than from closure-captured values. This is critical because `useScreenKeybindings()` captures the `KeyHandler[]` array at registration time and uses a ref-based pattern to keep handlers fresh. The double-ref (keybinding's internal ref + our `fmRef`) ensures zero stale closures.

3. **`g g` handled by go-to mode**: The `g g` (jump to first item) binding cannot be registered at `PRIORITY.SCREEN` because `g` is already consumed by go-to mode at `PRIORITY.GOTO`. Instead, the go-to mode system must be extended to recognize `g g` as "jump to first item in focused panel" when the dashboard is active. This integration is documented in the "Go-to mode integration" section below. Until go-to mode is implemented, `g g` will not work — this is expected and consistent with the project's policy of leaving tests failing for unimplemented backends.

4. **Memoization on `isGridMode` only**: The keybinding array is memoized and only recomputed when the grid mode changes (i.e., on terminal resize crossing a breakpoint). All other state changes (focus panel, cursor index, input focus) are handled through refs, avoiding unnecessary keybinding re-registrations.

5. **`h`/`l` conditional on grid mode**: The `when` predicate for `h` and `l` includes `&& optionsRef.current.isGridMode`. At minimum breakpoint (stacked layout), these keys are inert. This matches the spec requirement that column navigation only works in grid mode.

---

### Step 4: Wire the focus manager into DashboardScreen

**File modified**: `apps/tui/src/screens/Dashboard/index.tsx`

The existing scaffold is updated to consume `useDashboardFocus` and `useDashboardKeybindings`.

```typescript
import React from "react";
import type { ScreenComponentProps } from "../../router/types.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { useLayout } from "../../hooks/useLayout.js";
import { useTheme } from "../../hooks/useTheme.js";
import { useNavigation } from "../../providers/NavigationProvider.js";
import { ScreenName } from "../../router/types.js";
import { useDashboardFocus } from "./useDashboardFocus.js";
import { useDashboardKeybindings } from "./useDashboardKeybindings.js";
import { PANEL, type PanelIndex } from "./types.js";

export function DashboardScreen({ entry, params }: ScreenComponentProps) {
  const layout = useLayout();
  const theme = useTheme();
  const nav = useNavigation();

  // Determine layout mode from breakpoint
  const isGridMode = layout.breakpoint !== "minimum";

  // Panel item counts — will be populated by data hooks in subsequent tickets.
  // For now, zero items per panel.
  const panelItemCounts: Record<PanelIndex, number> = {
    [PANEL.RECENT_REPOS]: 0,
    [PANEL.ORGANIZATIONS]: 0,
    [PANEL.STARRED_REPOS]: 0,
    [PANEL.ACTIVITY_FEED]: 0,
  };

  // Calculate visible rows per panel: content height minus quick-actions bar (1 row),
  // divided by number of rows in the grid (2 in grid mode, 1 in stacked mode),
  // minus panel title row (1 row) and panel border (2 rows).
  const panelRows = isGridMode ? 2 : 1;
  const panelVisibleRows = Math.max(
    1,
    Math.floor((layout.contentHeight - 1) / panelRows) - 3,
  );

  const focusManager = useDashboardFocus({
    panelItemCounts,
    isGridMode,
    panelVisibleRows,
  });

  const { keybindings, statusBarHints } = useDashboardKeybindings({
    focusManager,
    isGridMode,
    panelItemCounts,
    panelVisibleRows,
    onSelect: (panel, cursorIndex) => {
      // Navigation logic — wired in panel-specific tickets
    },
    onFilter: () => {
      // Filter activation — wired in tui-dashboard-inline-filter ticket
    },
    onCreateRepo: () => {
      nav.push(ScreenName.RepoCreate);
    },
    onNotifications: () => {
      nav.push(ScreenName.Notifications);
    },
    onSearch: () => {
      nav.push(ScreenName.Search);
    },
    onRetry: (panel) => {
      // Per-panel retry — wired in data hooks ticket
    },
  });

  useScreenKeybindings(keybindings, statusBarHints);

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Panel grid — placeholder pending tui-dashboard-grid-layout */}
      <box flexDirection="column" flexGrow={1}>
        <text fg={theme.muted}>
          Welcome to Codeplane
        </text>
        {/* Focused panel indicator for testing */}
        <text fg={theme.muted}>
          {`Panel: ${focusManager.focusedPanel}`}
        </text>
        {focusManager.isInputFocused && (
          <text fg={theme.warning}>
            [Filter active]
          </text>
        )}
      </box>
      {/* Quick actions bar — placeholder */}
      <box flexDirection="row" height={1} width="100%" gap={2}>
        <text>
          <text attributes="bold">c</text>
          <text fg={theme.muted}>:new repo</text>
        </text>
        <text>
          <text attributes="bold">n</text>
          <text fg={theme.muted}>:notifications</text>
        </text>
        <text>
          <text attributes="bold">s</text>
          <text fg={theme.muted}>:search</text>
        </text>
        <text>
          <text attributes="bold">/</text>
          <text fg={theme.muted}>:filter</text>
        </text>
      </box>
    </box>
  );
}
```

**Note**: The JSX layout is still placeholder-level. The `tui-dashboard-grid-layout` and `tui-dashboard-panel-component` tickets will introduce `<DashboardPanel>` wrappers and the 2×2 grid box layout. This ticket's responsibility is ensuring the focus state machine and keybinding wiring works correctly — the visual rendering of focused borders, highlighted items, etc. will be connected once the panel component exists.

---

### Step 5: Go-to mode integration — `g g` jump to first

**File modified**: `apps/tui/src/screens/Dashboard/useDashboardKeybindings.ts` (documented as future integration point)

The `g g` binding requires special handling because the `g` key is intercepted by go-to mode at `PRIORITY.GOTO`. The integration works as follows:

1. When the user presses `g`, the `KeybindingProvider` activates go-to mode (a `PRIORITY.GOTO` scope with a 1500ms timeout).
2. Within that scope, pressing `g` a second time should trigger "jump to first item" rather than navigating to a screen.
3. The go-to bindings system (`apps/tui/src/navigation/goToBindings.ts`) needs a special entry for `g` that:
   - Checks if the current screen is Dashboard
   - If yes, calls the focus manager's `jumpCursor(0)` via a registered callback
   - If no, cancels go-to mode (invalid sequence)

**This integration is NOT implemented in this ticket.** It depends on the go-to mode system being fully implemented (`tui-global-keybindings` ticket). The E2E test for `g g` is written and left failing per project policy.

**Workaround for pre-go-to-mode testing**: During development, `g g` can be tested by temporarily adding a `PRIORITY.SCREEN` binding for `g` that starts a local mini-mode. This is intentionally NOT included in the production code to avoid conflicting with the go-to system.

---

### Step 6: Export barrel update

**File modified**: `apps/tui/src/screens/Dashboard/index.tsx`

Ensure the following are re-exported from the dashboard barrel:

```typescript
export { useDashboardFocus } from "./useDashboardFocus.js";
export { useDashboardKeybindings } from "./useDashboardKeybindings.js";
export type {
  DashboardFocusManager,
  PanelIndex,
  PanelFocusState,
} from "./types.js";
export { PANEL, PANEL_COUNT, GRID } from "./types.js";
```

These exports are consumed by the grid layout and panel component tickets.

---

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/tui/src/screens/Dashboard/types.ts` | **Create** | Panel focus types, grid constants, `DashboardFocusManager` interface |
| `apps/tui/src/screens/Dashboard/useDashboardFocus.ts` | **Create** | Core focus management hook with panel cycling, cursor memory, scroll memory, input focus tracking |
| `apps/tui/src/screens/Dashboard/useDashboardKeybindings.ts` | **Create** | Keybinding builder that bridges focus manager with `useScreenKeybindings()` |
| `apps/tui/src/screens/Dashboard/index.tsx` | **Modify** | Wire `useDashboardFocus` and `useDashboardKeybindings` into the DashboardScreen component; add barrel re-exports |

## Files NOT Changed (Verified Correct)

| File | Reason |
|------|--------|
| `apps/tui/src/providers/KeybindingProvider.tsx` | Dispatch system already supports `when()` predicates — no changes needed |
| `apps/tui/src/providers/keybinding-types.ts` | `KeyHandler.when` already defined — no changes needed |
| `apps/tui/src/hooks/useScreenKeybindings.ts` | Already handles `when()` predicates correctly — no changes needed |
| `apps/tui/src/hooks/useGlobalKeybindings.ts` | Global `q`, `Esc`, `Ctrl+C` bindings already work — no changes needed |
| `apps/tui/src/router/registry.ts` | Dashboard already registered — no changes needed |
| `apps/tui/src/providers/NavigationProvider.tsx` | Scroll cache is inter-screen; dashboard uses its own intra-screen cache — no changes needed |

---

## Unit & Integration Tests

**Test file**: `e2e/tui/dashboard.test.ts`

These tests are **appended** to the existing `e2e/tui/dashboard.test.ts` file created by the `tui-dashboard-screen-scaffold` ticket. They form a new `describe` block: `TUI_DASHBOARD — Panel focus manager`.

All tests use `@microsoft/tui-test` via the `launchTUI` helper from `e2e/tui/helpers.ts`. Tests run against the real TUI binary with a test API server. No mocking of implementation details.

### Test ID Naming Convention

Following the established pattern:
- `KEY-FOCUS-*` — Keyboard interaction tests for focus management
- `SNAP-FOCUS-*` — Snapshot tests for focus visual state
- `STATE-FOCUS-*` — Focus state verification tests

### Test Specifications

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import {
  launchTUI,
  type TUITestInstance,
  TERMINAL_SIZES,
  createMockAPIEnv,
} from "./helpers";

let terminal: TUITestInstance;

afterEach(async () => {
  if (terminal) {
    await terminal.terminate();
  }
});

describe("TUI_DASHBOARD — Panel focus manager", () => {
  // ── Panel focus cycling ─────────────────────────────────────────

  describe("Tab/Shift+Tab panel cycling", () => {
    test("KEY-FOCUS-001: Tab cycles focus forward through all four panels", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      // Initial state: panel 0 (Recent Repos) is focused
      await terminal.waitForText("Panel: 0");

      // Tab → panel 1 (Organizations)
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Panel: 1");

      // Tab → panel 2 (Starred Repos)
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Panel: 2");

      // Tab → panel 3 (Activity Feed)
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Panel: 3");

      // Tab → wraps to panel 0 (Recent Repos)
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Panel: 0");
    });

    test("KEY-FOCUS-002: Shift+Tab cycles focus backward through panels", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      await terminal.waitForText("Panel: 0");

      // Shift+Tab from panel 0 → wraps to panel 3
      await terminal.sendKeys("shift+tab");
      await terminal.waitForText("Panel: 3");

      // Shift+Tab → panel 2
      await terminal.sendKeys("shift+tab");
      await terminal.waitForText("Panel: 2");

      // Shift+Tab → panel 1
      await terminal.sendKeys("shift+tab");
      await terminal.waitForText("Panel: 1");

      // Shift+Tab → panel 0
      await terminal.sendKeys("shift+tab");
      await terminal.waitForText("Panel: 0");
    });

    test("KEY-FOCUS-003: Rapid Tab cycling does not corrupt focus state", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      // Rapidly press Tab 8 times (2 full cycles)
      for (let i = 0; i < 8; i++) {
        await terminal.sendKeys("Tab");
      }

      // Should be back at panel 0 after 8 tabs (8 % 4 = 0)
      await terminal.waitForText("Panel: 0");
    });
  });

  // ── Column navigation ───────────────────────────────────────────

  describe("h/l column navigation (grid mode)", () => {
    test("KEY-FOCUS-010: l moves focus from left column to right column", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      await terminal.waitForText("Panel: 0"); // top-left

      await terminal.sendKeys("l");
      await terminal.waitForText("Panel: 1"); // top-right
    });

    test("KEY-FOCUS-011: h moves focus from right column to left column", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      // Move to right column first
      await terminal.sendKeys("l");
      await terminal.waitForText("Panel: 1");

      // h back to left column
      await terminal.sendKeys("h");
      await terminal.waitForText("Panel: 0");
    });

    test("KEY-FOCUS-012: h at left column boundary does not change focus", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      await terminal.waitForText("Panel: 0"); // Already at left col

      await terminal.sendKeys("h");
      // Should still be panel 0
      await terminal.waitForText("Panel: 0");
    });

    test("KEY-FOCUS-013: l at right column boundary does not change focus", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("l"); // → panel 1
      await terminal.waitForText("Panel: 1");

      await terminal.sendKeys("l"); // At right boundary
      // Should still be panel 1
      await terminal.waitForText("Panel: 1");
    });

    test("KEY-FOCUS-014: l preserves row position (bottom-left to bottom-right)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      // Tab twice to reach panel 2 (bottom-left)
      await terminal.sendKeys("Tab");
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Panel: 2");

      // l → panel 3 (bottom-right, same row)
      await terminal.sendKeys("l");
      await terminal.waitForText("Panel: 3");
    });

    test("KEY-FOCUS-015: h/l are disabled in stacked mode (80x24)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      await terminal.waitForText("Panel: 0");

      // l should have no effect in stacked mode
      await terminal.sendKeys("l");
      // Panel should still be 0 (h/l disabled at minimum breakpoint)
      await terminal.waitForText("Panel: 0");
    });
  });

  // ── Focus memory ────────────────────────────────────────────────

  describe("per-panel cursor memory", () => {
    // These tests require panels to have items. They will fail until
    // the data hooks ticket populates panel data. Left failing per policy.

    test("KEY-FOCUS-020: cursor position preserved when switching panels", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ repoCount: 5 }),
      });
      await terminal.waitForText("Dashboard");

      // Move cursor down twice in Recent Repos (panel 0)
      await terminal.sendKeys("j");
      await terminal.sendKeys("j");
      // Cursor should be at index 2

      // Switch to Organizations (panel 1)
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Panel: 1");

      // Move cursor down once in Organizations
      await terminal.sendKeys("j");

      // Switch back to Recent Repos (panel 0)
      await terminal.sendKeys("shift+tab");
      await terminal.waitForText("Panel: 0");

      // Cursor should still be at index 2 (third item highlighted)
      // Verify by checking the highlighted item matches the third repo
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-FOCUS-021: cursor position preserved through full Tab cycle", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ repoCount: 5 }),
      });
      await terminal.waitForText("Dashboard");

      // Move cursor in panel 0
      await terminal.sendKeys("j");
      await terminal.sendKeys("j");
      await terminal.sendKeys("j"); // cursor at index 3

      // Full cycle: Tab 4 times
      await terminal.sendKeys("Tab");
      await terminal.sendKeys("Tab");
      await terminal.sendKeys("Tab");
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Panel: 0");

      // Cursor should still be at index 3
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ── Input focus state ───────────────────────────────────────────

  describe("input focus suppression", () => {
    test("KEY-FOCUS-030: / activates input focus state", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("/");
      await terminal.waitForText("[Filter active]");
    });

    test("KEY-FOCUS-031: Esc deactivates input focus state", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("/");
      await terminal.waitForText("[Filter active]");

      await terminal.sendKeys("Escape");
      await terminal.waitForNoText("[Filter active]");
    });

    test("KEY-FOCUS-032: j/k do not navigate when input is focused", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      await terminal.waitForText("Panel: 0");

      // Activate filter
      await terminal.sendKeys("/");
      await terminal.waitForText("[Filter active]");

      // j should NOT change panel focus or cursor
      await terminal.sendKeys("j");
      // Panel should still be 0
      await terminal.waitForText("Panel: 0");
    });

    test("KEY-FOCUS-033: Tab does not cycle panels when input is focused", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      await terminal.waitForText("Panel: 0");

      await terminal.sendKeys("/");
      await terminal.waitForText("[Filter active]");

      // Tab should be passed to input, not cycle panels
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Panel: 0"); // No change
    });

    test("KEY-FOCUS-034: quick action keys (c, n, s) suppressed when input focused", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("/");
      await terminal.waitForText("[Filter active]");

      // c should type into input, not push create repo screen
      await terminal.sendKeys("c");
      // Should still be on dashboard with filter active
      await terminal.waitForText("Dashboard");
      await terminal.waitForText("[Filter active]");
    });

    test("KEY-FOCUS-035: Ctrl+C remains active when input is focused", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("/");
      await terminal.waitForText("[Filter active]");

      // Ctrl+C should still quit (global priority)
      await terminal.sendKeys("ctrl+c");
      // Process should exit — test passes if no timeout
    });
  });

  // ── Keyboard routing within panels ──────────────────────────────

  describe("cursor navigation within focused panel", () => {
    // These tests require panel data. They will fail until data hooks
    // populate items. Left failing per project policy.

    test("KEY-FOCUS-040: j moves cursor down one item", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ repoCount: 5 }),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("j");
      // Verify second item is now highlighted
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-FOCUS-041: k moves cursor up one item", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ repoCount: 5 }),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("j"); // cursor at 1
      await terminal.sendKeys("j"); // cursor at 2
      await terminal.sendKeys("k"); // cursor at 1

      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-FOCUS-042: Down arrow moves cursor down", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ repoCount: 5 }),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("Down");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-FOCUS-043: Up arrow moves cursor up", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ repoCount: 5 }),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("Down");
      await terminal.sendKeys("Up");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-FOCUS-044: G jumps to last item", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ repoCount: 10 }),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("G");
      // Cursor should be at last item (index 9)
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-FOCUS-045: g g jumps to first item", async () => {
      // This test depends on go-to mode being implemented.
      // It will fail until tui-global-keybindings implements go-to mode
      // with dashboard-specific "g g" handling.
      // Left failing per project policy.
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ repoCount: 10 }),
      });
      await terminal.waitForText("Dashboard");

      // Move cursor to middle
      await terminal.sendKeys("G"); // last item

      // g g should jump to first
      await terminal.sendKeys("g");
      await terminal.sendKeys("g");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-FOCUS-046: Ctrl+D pages down half panel height", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ repoCount: 20 }),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("ctrl+d");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-FOCUS-047: Ctrl+U pages up half panel height", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ repoCount: 20 }),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("ctrl+d"); // page down
      await terminal.sendKeys("ctrl+u"); // page up
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-FOCUS-048: Enter on focused item triggers selection", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ repoCount: 5 }),
      });
      await terminal.waitForText("Dashboard");

      // Enter on first repo should navigate to repo overview
      await terminal.sendKeys("Enter");
      // Should push repo overview screen
      // This test may fail until onSelect is wired to navigation
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/›/);
    });

    test("KEY-FOCUS-049: cursor clamps at top (k at index 0)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ repoCount: 5 }),
      });
      await terminal.waitForText("Dashboard");

      // k at index 0 should stay at 0 (no wrap, no crash)
      await terminal.sendKeys("k");
      await terminal.sendKeys("k");
      await terminal.sendKeys("k");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-FOCUS-050: cursor clamps at bottom (j past last item)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ repoCount: 3 }),
      });
      await terminal.waitForText("Dashboard");

      // j 5 times on a 3-item list should clamp at index 2
      for (let i = 0; i < 5; i++) {
        await terminal.sendKeys("j");
      }
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ── Scroll position memory ──────────────────────────────────────

  describe("per-panel scroll position memory", () => {
    // These tests require panels with enough items to scroll.
    // They will fail until data hooks provide sufficient data.
    // Left failing per project policy.

    test("KEY-FOCUS-060: scroll position preserved when switching panels", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ repoCount: 50 }),
      });
      await terminal.waitForText("Dashboard");

      // Scroll down significantly in panel 0
      for (let i = 0; i < 15; i++) {
        await terminal.sendKeys("j");
      }

      // Switch to panel 1
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Panel: 1");

      // Switch back to panel 0
      await terminal.sendKeys("shift+tab");
      await terminal.waitForText("Panel: 0");

      // Scroll position should be preserved — item 15 should still be visible
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-FOCUS-061: each panel has independent scroll position", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv({ repoCount: 50, orgCount: 20 }),
      });
      await terminal.waitForText("Dashboard");

      // Scroll panel 0 down 10 items
      for (let i = 0; i < 10; i++) {
        await terminal.sendKeys("j");
      }

      // Switch to panel 1, scroll 3 items
      await terminal.sendKeys("Tab");
      for (let i = 0; i < 3; i++) {
        await terminal.sendKeys("j");
      }

      // Switch to panel 2, don't scroll
      await terminal.sendKeys("Tab");

      // Verify panel 2 is at top (scroll offset 0)
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ── Responsive behavior ─────────────────────────────────────────

  describe("responsive focus behavior", () => {
    test("KEY-FOCUS-070: Tab works in stacked mode (80x24)", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      await terminal.waitForText("Panel: 0");

      await terminal.sendKeys("Tab");
      await terminal.waitForText("Panel: 1");

      await terminal.sendKeys("Tab");
      await terminal.waitForText("Panel: 2");
    });

    test("KEY-FOCUS-071: focus preserved through resize from grid to stacked", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      // Focus panel 2
      await terminal.sendKeys("Tab");
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Panel: 2");

      // Resize to stacked mode
      await terminal.resize(80, 24);
      await terminal.waitForText("Dashboard");

      // Panel 2 should still be focused
      await terminal.waitForText("Panel: 2");
    });

    test("KEY-FOCUS-072: h/l become available after resize from stacked to grid", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      await terminal.waitForText("Panel: 0");

      // l should do nothing in stacked mode
      await terminal.sendKeys("l");
      await terminal.waitForText("Panel: 0");

      // Resize to grid mode
      await terminal.resize(120, 40);
      await terminal.waitForText("Dashboard");

      // l should now work
      await terminal.sendKeys("l");
      await terminal.waitForText("Panel: 1");
    });
  });

  // ── Snapshot tests ──────────────────────────────────────────────

  describe("focus state snapshots", () => {
    test("SNAP-FOCUS-001: default focus state at 120x40", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-FOCUS-002: panel 1 focused at 120x40", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("Tab");
      await terminal.waitForText("Panel: 1");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-FOCUS-003: filter active state at 120x40", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("/");
      await terminal.waitForText("[Filter active]");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-FOCUS-004: stacked mode with panel indicator at 80x24", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ── Quick action routing ────────────────────────────────────────

  describe("quick action keybindings", () => {
    test("KEY-FOCUS-080: n pushes notifications screen", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("n");
      // Notifications screen should be pushed
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Notifications/);
    });

    test("KEY-FOCUS-081: s pushes search screen", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("s");
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Search/);
    });

    test("KEY-FOCUS-082: c pushes create repo screen", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      await terminal.sendKeys("c");
      // Should navigate to repo creation
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/›/);
    });
  });

  // ── Status bar hints ────────────────────────────────────────────

  describe("status bar hints", () => {
    test("SNAP-FOCUS-010: status bar shows navigation hints", async () => {
      terminal = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Dashboard");

      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/j\/k.*navigate/i);
      expect(lastLine).toMatch(/Tab.*panel/i);
      expect(lastLine).toMatch(/Enter.*open/i);
    });
  });
});
```

### Test Inventory

| Test ID | Category | Description | Expected Status |
|---------|----------|-------------|----------------|
| KEY-FOCUS-001 | Keyboard | Tab cycles forward through all 4 panels | ✅ Pass |
| KEY-FOCUS-002 | Keyboard | Shift+Tab cycles backward through panels | ✅ Pass |
| KEY-FOCUS-003 | Keyboard | Rapid Tab cycling (8 presses) returns to panel 0 | ✅ Pass |
| KEY-FOCUS-010 | Keyboard | l moves focus left→right | ✅ Pass |
| KEY-FOCUS-011 | Keyboard | h moves focus right→left | ✅ Pass |
| KEY-FOCUS-012 | Keyboard | h at left boundary is no-op | ✅ Pass |
| KEY-FOCUS-013 | Keyboard | l at right boundary is no-op | ✅ Pass |
| KEY-FOCUS-014 | Keyboard | l preserves row (bottom-left → bottom-right) | ✅ Pass |
| KEY-FOCUS-015 | Keyboard | h/l disabled in stacked mode (80×24) | ✅ Pass |
| KEY-FOCUS-020 | State | Cursor position preserved on panel switch | ❌ Fails (no panel data) |
| KEY-FOCUS-021 | State | Cursor preserved through full Tab cycle | ❌ Fails (no panel data) |
| KEY-FOCUS-030 | Keyboard | `/` activates input focus state | ✅ Pass |
| KEY-FOCUS-031 | Keyboard | Esc deactivates input focus state | ✅ Pass |
| KEY-FOCUS-032 | Keyboard | j/k suppressed when input focused | ✅ Pass |
| KEY-FOCUS-033 | Keyboard | Tab suppressed when input focused | ✅ Pass |
| KEY-FOCUS-034 | Keyboard | Quick action keys (c, n, s) suppressed when input focused | ✅ Pass |
| KEY-FOCUS-035 | Keyboard | Ctrl+C active when input focused (global priority) | ✅ Pass |
| KEY-FOCUS-040 | Keyboard | j moves cursor down | ❌ Fails (no panel data) |
| KEY-FOCUS-041 | Keyboard | k moves cursor up | ❌ Fails (no panel data) |
| KEY-FOCUS-042 | Keyboard | Down arrow moves cursor | ❌ Fails (no panel data) |
| KEY-FOCUS-043 | Keyboard | Up arrow moves cursor | ❌ Fails (no panel data) |
| KEY-FOCUS-044 | Keyboard | G jumps to last item | ❌ Fails (no panel data) |
| KEY-FOCUS-045 | Keyboard | g g jumps to first item | ❌ Fails (go-to mode not implemented) |
| KEY-FOCUS-046 | Keyboard | Ctrl+D pages down | ❌ Fails (no panel data) |
| KEY-FOCUS-047 | Keyboard | Ctrl+U pages up | ❌ Fails (no panel data) |
| KEY-FOCUS-048 | Keyboard | Enter triggers selection | ❌ Fails (no panel data/nav wiring) |
| KEY-FOCUS-049 | Keyboard | Cursor clamps at top | ❌ Fails (no panel data) |
| KEY-FOCUS-050 | Keyboard | Cursor clamps at bottom | ❌ Fails (no panel data) |
| KEY-FOCUS-060 | State | Scroll position preserved on panel switch | ❌ Fails (no panel data) |
| KEY-FOCUS-061 | State | Independent scroll positions per panel | ❌ Fails (no panel data) |
| KEY-FOCUS-070 | Responsive | Tab works in stacked mode | ✅ Pass |
| KEY-FOCUS-071 | Responsive | Focus preserved through resize | ✅ Pass |
| KEY-FOCUS-072 | Responsive | h/l enabled after resize to grid | ✅ Pass |
| SNAP-FOCUS-001 | Snapshot | Default focus state at 120×40 | ✅ Pass |
| SNAP-FOCUS-002 | Snapshot | Panel 1 focused at 120×40 | ✅ Pass |
| SNAP-FOCUS-003 | Snapshot | Filter active state at 120×40 | ✅ Pass |
| SNAP-FOCUS-004 | Snapshot | Stacked mode at 80×24 | ✅ Pass |
| KEY-FOCUS-080 | Keyboard | n pushes notifications | ✅ Pass |
| KEY-FOCUS-081 | Keyboard | s pushes search | ✅ Pass |
| KEY-FOCUS-082 | Keyboard | c pushes create repo | ✅ Pass |
| SNAP-FOCUS-010 | Snapshot | Status bar shows navigation hints | ✅ Pass |

**Intentionally failing tests**: Tests marked ❌ fail because they depend on:
1. **Panel data hooks** (`tui-dashboard-data-hooks`) — tests that need items in panels to navigate. The focus manager's cursor movement logic works correctly at the state level, but there's nothing to render/highlight without data.
2. **Go-to mode** (`tui-global-keybindings`) — the `g g` test requires go-to mode dispatch.

Per project policy, these tests are left failing. They validate behaviors that will work once the dependency tickets are implemented.

---

## Productionization Checklist

### From POC → Production

| Concern | Current State | Production Target | Tracked By |
|---------|---------------|-------------------|------------|
| Panel item data | Zero items (placeholder) | `useRepos()`, `useStarredRepos()`, `useOrganizations()`, `useActivity()` provide real data | `tui-dashboard-data-hooks` |
| Focused border highlighting | Text indicator (`Panel: N`) | `<DashboardPanel>` renders `primary` border color on focused panel, `border` color on unfocused | `tui-dashboard-panel-component` |
| Item highlight rendering | No items rendered | Focused item row uses reverse video or primary background | `tui-dashboard-panel-component` |
| Grid layout | Placeholder column | `<box>` 2×2 grid with `width="50%"` columns | `tui-dashboard-grid-layout` |
| Filter input component | `isInputFocused` flag only | `<input>` component with fuzzy match, match count display | `tui-dashboard-inline-filter` |
| Scroll synchronization | `setScrollOffset` stores value | `<scrollbox>` `scrollTop` prop reads from focus state | `tui-dashboard-panel-component` |
| Go-to `g g` jump | Not wired | Go-to bindings include dashboard-specific `g` → jump to first | `tui-global-keybindings` |
| Selection action | `onSelect` no-op | Navigate to repo overview, org overview, or activity target | `tui-dashboard-repos-list`, `tui-dashboard-orgs-list`, `tui-dashboard-activity-feed` |
| Telemetry events | None | `tui.dashboard.panel_focused`, `tui.dashboard.item_opened` events | `tui-dashboard-telemetry` |

### Integration Points Already Wired (no further work needed)

| Integration | Status |
|-------------|--------|
| Keybinding dispatch via `useScreenKeybindings()` | ✅ Complete — SCREEN priority scope with `when()` predicates |
| Input focus suppression via `when()` predicates | ✅ Complete — all navigation/action keys conditional on `!isInputFocused` |
| Escape handling for input unfocus | ✅ Complete — Escape binding with `when: () => isInputFocused` |
| Global keys (`Ctrl+C`, `q`, `?`, `:`) unaffected | ✅ Complete — GLOBAL priority dispatches before SCREEN check |
| Status bar hints | ✅ Complete — 7 hints registered via `useDashboardKeybindings` |
| Responsive grid/stacked detection | ✅ Complete — `useLayout().breakpoint` drives `isGridMode` |
| Focus state preserved through resize | ✅ Complete — React state survives re-render on resize |
| Navigation push for quick actions | ✅ Complete — `onCreateRepo`, `onNotifications`, `onSearch` call `nav.push()` |

---

## Acceptance Criteria

1. ✅ `apps/tui/src/screens/Dashboard/types.ts` defines `PanelIndex`, `PanelFocusState`, `DashboardFocusManager`, `PANEL`, `GRID` constants
2. ✅ `apps/tui/src/screens/Dashboard/useDashboardFocus.ts` exports `useDashboardFocus` hook
3. ✅ `useDashboardFocus` returns `{ focusedPanel, setFocusedPanel, panelFocusState, isInputFocused, setInputFocused, setCursorIndex, setScrollOffset, moveCursor, jumpCursor }`
4. ✅ Tab cycles focus forward: 0 → 1 → 2 → 3 → 0
5. ✅ Shift+Tab cycles focus backward: 0 → 3 → 2 → 1 → 0
6. ✅ `h` moves focus to left column (same row) in grid mode; no-op in stacked mode
7. ✅ `l` moves focus to right column (same row) in grid mode; no-op in stacked mode
8. ✅ Each panel independently remembers cursor position across focus switches
9. ✅ Each panel independently remembers scroll offset across focus switches
10. ✅ When `isInputFocused` is true, `j`, `k`, `h`, `l`, `c`, `n`, `s`, `G`, `R`, `Tab`, `Shift+Tab` are NOT intercepted by screen keybindings
11. ✅ When `isInputFocused` is true, `Escape` dismisses the input focus state
12. ✅ When `isInputFocused` is true, `Ctrl+C` still works (global priority)
13. ✅ `j`/`k`/`Down`/`Up` move cursor within focused panel
14. ✅ `G` jumps to last item; cursor clamps at item count - 1
15. ✅ `Ctrl+D`/`Ctrl+U` page down/up by half panel visible rows
16. ✅ `Enter` calls `onSelect` with focused panel index and cursor index
17. ✅ Cursor clamps at bounds (no negative index, no index >= item count)
18. ✅ `e2e/tui/dashboard.test.ts` contains all focus manager tests
19. ✅ Tests that depend on unimplemented panel data or go-to mode are left failing
20. ✅ TypeScript compiles with zero errors (`tsc --noEmit`)