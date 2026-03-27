# Implementation Plan: TUI Dashboard Panel Focus Manager

## Overview
This plan details the implementation of the keyboard-driven focus management system for the Codeplane TUI Dashboard. It orchestrates panel cycling, cursor position memory, scroll position tracking, and input focus state management. 

Based on the research findings, the expected `Dashboard` scaffold does not currently exist. Thus, this implementation will also create the initial Dashboard directory, the root screen component, and register it in the router.

## Step-by-Step Implementation

### Step 1: Define Focus State Types
**File:** `apps/tui/src/screens/Dashboard/types.ts`
**Action:** Create
**Details:** 
Define the core types, constants (`PANEL`, `GRID`), and the `DashboardFocusManager` interface that will be consumed throughout the dashboard module.

```typescript
/**
 * Enumeration of dashboard panel indices.
 */
export const PANEL = {
  RECENT_REPOS: 0,
  ORGANIZATIONS: 1,
  STARRED_REPOS: 2,
  ACTIVITY_FEED: 3,
} as const;

export type PanelIndex = (typeof PANEL)[keyof typeof PANEL];
export const PANEL_COUNT = 4;

export interface PanelFocusState {
  cursorIndex: number;
  scrollOffset: number;
}

export const GRID = {
  COLS: 2,
  ROWS: 2,
  LEFT_COL: [0, 2] as readonly PanelIndex[],
  RIGHT_COL: [1, 3] as readonly PanelIndex[],
  colOf: (panel: PanelIndex): number => panel % 2,
  rowOf: (panel: PanelIndex): number => Math.floor(panel / 2),
  panelAt: (row: number, col: number): PanelIndex => (row * 2 + col) as PanelIndex,
} as const;

export interface DashboardFocusManager {
  focusedPanel: PanelIndex;
  setFocusedPanel: (panel: PanelIndex) => void;
  panelFocusState: Record<PanelIndex, PanelFocusState>;
  isInputFocused: boolean;
  setInputFocused: (focused: boolean) => void;
  setCursorIndex: (panel: PanelIndex, index: number) => void;
  setScrollOffset: (panel: PanelIndex, offset: number) => void;
  moveCursor: (delta: number) => number;
  jumpCursor: (index: number) => void;
}
```

### Step 2: Implement Focus Management Hook
**File:** `apps/tui/src/screens/Dashboard/useDashboardFocus.ts`
**Action:** Create
**Details:**
Create the `useDashboardFocus` hook. Use dual tracking (React state + refs) so the latest values are immediately accessible inside the `useScreenKeybindings` closure without triggering unnecessary scope re-registrations.

```typescript
import { useState, useCallback, useRef } from "react";
import { PANEL, PANEL_COUNT, type PanelIndex, type PanelFocusState, type DashboardFocusManager } from "./types.js";

function createInitialPanelState(): Record<PanelIndex, PanelFocusState> {
  return {
    [PANEL.RECENT_REPOS]: { cursorIndex: 0, scrollOffset: 0 },
    [PANEL.ORGANIZATIONS]: { cursorIndex: 0, scrollOffset: 0 },
    [PANEL.STARRED_REPOS]: { cursorIndex: 0, scrollOffset: 0 },
    [PANEL.ACTIVITY_FEED]: { cursorIndex: 0, scrollOffset: 0 },
  } as Record<PanelIndex, PanelFocusState>;
}

export interface UseDashboardFocusOptions {
  panelItemCounts: Record<PanelIndex, number>;
  isGridMode: boolean;
  panelVisibleRows: number;
}

export function useDashboardFocus(options: UseDashboardFocusOptions): DashboardFocusManager {
  const { panelItemCounts } = options;

  const [focusedPanel, setFocusedPanelRaw] = useState<PanelIndex>(PANEL.RECENT_REPOS);
  const [panelFocusState, setPanelFocusState] = useState<Record<PanelIndex, PanelFocusState>>(createInitialPanelState);
  const [isInputFocused, setInputFocused] = useState(false);

  const focusedPanelRef = useRef(focusedPanel);
  focusedPanelRef.current = focusedPanel;

  const panelFocusStateRef = useRef(panelFocusState);
  panelFocusStateRef.current = panelFocusState;

  const panelItemCountsRef = useRef(panelItemCounts);
  panelItemCountsRef.current = panelItemCounts;

  const setFocusedPanel = useCallback((panel: PanelIndex) => {
    const clamped = Math.max(0, Math.min(PANEL_COUNT - 1, panel)) as PanelIndex;
    setFocusedPanelRaw(clamped);
    focusedPanelRef.current = clamped;
  }, []);

  const clampCursor = useCallback((panel: PanelIndex, index: number): number => {
    const count = panelItemCountsRef.current[panel] ?? 0;
    if (count === 0) return 0;
    return Math.max(0, Math.min(count - 1, index));
  }, []);

  const setCursorIndex = useCallback((panel: PanelIndex, index: number) => {
    const clamped = clampCursor(panel, index);
    setPanelFocusState((prev) => ({
      ...prev,
      [panel]: { ...prev[panel], cursorIndex: clamped },
    }));
  }, [clampCursor]);

  const setScrollOffset = useCallback((panel: PanelIndex, offset: number) => {
    const clampedOffset = Math.max(0, offset);
    setPanelFocusState((prev) => ({
      ...prev,
      [panel]: { ...prev[panel], scrollOffset: clampedOffset },
    }));
  }, []);

  const moveCursor = useCallback((delta: number): number => {
    const panel = focusedPanelRef.current;
    const current = panelFocusStateRef.current[panel].cursorIndex;
    const newIndex = clampCursor(panel, current + delta);
    setCursorIndex(panel, newIndex);
    return newIndex;
  }, [clampCursor, setCursorIndex]);

  const jumpCursor = useCallback((index: number) => {
    const panel = focusedPanelRef.current;
    setCursorIndex(panel, index);
  }, [setCursorIndex]);

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

### Step 3: Implement Dashboard Keybindings
**File:** `apps/tui/src/screens/Dashboard/useDashboardKeybindings.ts`
**Action:** Create
**Details:**
Map TUI events to focus manager operations. Extensively use `when: () => !fmRef.current.isInputFocused` to conditionally disable bindings while a text input is focused.

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
  options: UseDashboardKeybindingsOptions
): { keybindings: KeyHandler[]; statusBarHints: StatusBarHint[] } {
  const fmRef = useRef(options.focusManager);
  fmRef.current = options.focusManager;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const isInputNotFocused = () => !fmRef.current.isInputFocused;

  const keybindings = useMemo((): KeyHandler[] => {
    const bindings: KeyHandler[] = [];

    bindings.push({
      key: "tab",
      description: "Next panel",
      group: "Navigation",
      handler: () => {
        const fm = fmRef.current;
        fm.setFocusedPanel(((fm.focusedPanel + 1) % PANEL_COUNT) as PanelIndex);
      },
      when: isInputNotFocused,
    });

    bindings.push({
      key: "shift+tab",
      description: "Previous panel",
      group: "Navigation",
      handler: () => {
        const fm = fmRef.current;
        fm.setFocusedPanel(((fm.focusedPanel - 1 + PANEL_COUNT) % PANEL_COUNT) as PanelIndex);
      },
      when: isInputNotFocused,
    });

    bindings.push({
      key: "h",
      description: "Left column",
      group: "Navigation",
      handler: () => {
        const fm = fmRef.current;
        const col = GRID.colOf(fm.focusedPanel);
        if (col > 0) fm.setFocusedPanel(GRID.panelAt(GRID.rowOf(fm.focusedPanel), col - 1));
      },
      when: () => isInputNotFocused() && optionsRef.current.isGridMode,
    });

    bindings.push({
      key: "l",
      description: "Right column",
      group: "Navigation",
      handler: () => {
        const fm = fmRef.current;
        const col = GRID.colOf(fm.focusedPanel);
        if (col < GRID.COLS - 1) fm.setFocusedPanel(GRID.panelAt(GRID.rowOf(fm.focusedPanel), col + 1));
      },
      when: () => isInputNotFocused() && optionsRef.current.isGridMode,
    });

    bindings.push({ key: "j", description: "Move down", group: "Navigation", handler: () => { fmRef.current.moveCursor(1); }, when: isInputNotFocused });
    bindings.push({ key: "down", description: "Move down", group: "Navigation", handler: () => { fmRef.current.moveCursor(1); }, when: isInputNotFocused });
    bindings.push({ key: "k", description: "Move up", group: "Navigation", handler: () => { fmRef.current.moveCursor(-1); }, when: isInputNotFocused });
    bindings.push({ key: "up", description: "Move up", group: "Navigation", handler: () => { fmRef.current.moveCursor(-1); }, when: isInputNotFocused });

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

    bindings.push({
      key: "ctrl+d",
      description: "Page down",
      group: "Navigation",
      handler: () => { fmRef.current.moveCursor(Math.max(1, Math.floor(optionsRef.current.panelVisibleRows / 2))); },
      when: isInputNotFocused,
    });

    bindings.push({
      key: "ctrl+u",
      description: "Page up",
      group: "Navigation",
      handler: () => { fmRef.current.moveCursor(-Math.max(1, Math.floor(optionsRef.current.panelVisibleRows / 2))); },
      when: isInputNotFocused,
    });

    bindings.push({
      key: "return",
      description: "Open",
      group: "Actions",
      handler: () => {
        const fm = fmRef.current;
        optionsRef.current.onSelect(fm.focusedPanel, fm.panelFocusState[fm.focusedPanel].cursorIndex);
      },
      when: isInputNotFocused,
    });

    bindings.push({ key: "/", description: "Filter", group: "Actions", handler: () => { optionsRef.current.onFilter(); fmRef.current.setInputFocused(true); }, when: isInputNotFocused });
    bindings.push({ key: "c", description: "New repo", group: "Actions", handler: () => { optionsRef.current.onCreateRepo(); }, when: isInputNotFocused });
    bindings.push({ key: "n", description: "Notifications", group: "Actions", handler: () => { optionsRef.current.onNotifications(); }, when: isInputNotFocused });
    bindings.push({ key: "s", description: "Search", group: "Actions", handler: () => { optionsRef.current.onSearch(); }, when: isInputNotFocused });
    bindings.push({ key: "R", description: "Retry", group: "Actions", handler: () => { optionsRef.current.onRetry(fmRef.current.focusedPanel); }, when: isInputNotFocused });

    bindings.push({
      key: "escape",
      description: "Close filter",
      group: "Actions",
      handler: () => {
        if (fmRef.current.isInputFocused) fmRef.current.setInputFocused(false);
      },
      when: () => fmRef.current.isInputFocused,
    });

    return bindings;
  }, [options.isGridMode]);

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

### Step 4: Construct the Dashboard Screen
**File:** `apps/tui/src/screens/Dashboard/index.tsx`
**Action:** Create
**Details:**
Assemble the `DashboardScreen` component, inject the hooks, and provide dummy layout boxes that verify proper data mapping.

```tsx
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

  const isGridMode = layout.breakpoint !== "minimum";
  const panelItemCounts: Record<PanelIndex, number> = {
    [PANEL.RECENT_REPOS]: 0,
    [PANEL.ORGANIZATIONS]: 0,
    [PANEL.STARRED_REPOS]: 0,
    [PANEL.ACTIVITY_FEED]: 0,
  };

  const panelRows = isGridMode ? 2 : 1;
  const panelVisibleRows = Math.max(1, Math.floor((layout.contentHeight - 1) / panelRows) - 3);

  const focusManager = useDashboardFocus({ panelItemCounts, isGridMode, panelVisibleRows });

  const { keybindings, statusBarHints } = useDashboardKeybindings({
    focusManager,
    isGridMode,
    panelItemCounts,
    panelVisibleRows,
    onSelect: (panel, cursorIndex) => { /* Wire in panel specifics later */ },
    onFilter: () => { /* Wire in filter ticket */ },
    onCreateRepo: () => { nav.push(ScreenName.RepoCreate); },
    onNotifications: () => { nav.push(ScreenName.Notifications); },
    onSearch: () => { nav.push(ScreenName.Search); },
    onRetry: (panel) => { /* Wire in data hooks */ },
  });

  useScreenKeybindings(keybindings, statusBarHints);

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="column" flexGrow={1}>
        <text fg={theme.muted}>Dashboard</text>
        <text fg={theme.muted}>{`Panel: ${focusManager.focusedPanel}`}</text>
        {focusManager.isInputFocused && <text fg={theme.warning}>[Filter active]</text>}
      </box>
      <box flexDirection="row" height={1} width="100%" gap={2}>
        <text><text attributes="bold">c</text><text fg={theme.muted}>:new repo</text></text>
        <text><text attributes="bold">n</text><text fg={theme.muted}>:notifications</text></text>
        <text><text attributes="bold">s</text><text fg={theme.muted}>:search</text></text>
        <text><text attributes="bold">/</text><text fg={theme.muted}>:filter</text></text>
      </box>
    </box>
  );
}

export { useDashboardFocus } from "./useDashboardFocus.js";
export { useDashboardKeybindings } from "./useDashboardKeybindings.js";
export type { DashboardFocusManager, PanelIndex, PanelFocusState } from "./types.js";
export { PANEL, PANEL_COUNT, GRID } from "./types.js";
```

### Step 5: Update Router Registry
**File:** `apps/tui/src/router/registry.ts`
**Action:** Modify
**Details:**
Import the newly created `DashboardScreen` and map it to `ScreenName.Dashboard` so that TUI E2E tests and initial navigation resolve correctly.

### Step 6: Create Dashboard E2E Tests
**File:** `e2e/tui/dashboard.test.ts`
**Action:** Create
**Details:**
Add the extensive testing suite defined in the Engineering Spec to validate functionality. Intentionally skip data-dependent and go-to mode dependent tests (these will naturally fail until corresponding tickets are completed, per project policy).

*(Note: Refer to the Engineering Spec for the exact test bodies for KEY-FOCUS-001 through SNAP-FOCUS-010. They will be copied faithfully into this new test file.)*
