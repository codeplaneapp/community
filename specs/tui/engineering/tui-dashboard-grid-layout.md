# Engineering Specification: tui-dashboard-grid-layout

## Ticket Summary

| Field | Value |
|-------|-------|
| Title | Implement the responsive 2×2 grid / single-column stacked dashboard layout |
| Ticket ID | `tui-dashboard-grid-layout` |
| Type | Engineering |
| Status | Not started |
| Dependencies | `tui-dashboard-screen-scaffold`, `tui-dashboard-panel-component`, `tui-responsive-layout` |

## Context

The `tui-dashboard-screen-scaffold` ticket establishes the `DashboardScreen` component at `apps/tui/src/screens/Dashboard/index.tsx` with a minimal placeholder layout (a single `<box>` column with "Welcome to Codeplane" text). This ticket replaces that placeholder layout with the responsive grid system that arranges four dashboard panels and a quick-actions bar according to the current terminal breakpoint.

The dashboard displays four panels:
1. **Recent Repos** (top-left in grid mode)
2. **Organizations** (top-right in grid mode)
3. **Starred Repos** (bottom-left in grid mode)
4. **Activity Feed** (bottom-right in grid mode)

Plus a **Quick Actions** bar anchored at the bottom.

The layout has two modes:

- **Grid mode** (standard/large breakpoints, 120×40+): 2-column × 2-row grid with all four panels visible simultaneously, plus the quick-actions bar at the bottom.
- **Stacked mode** (minimum breakpoint, 80×24 – 119×39): Single panel visible at a time, cycled via Tab/Shift+Tab, with a quick-actions bar at the bottom.

The layout delegates to the global "Terminal too small" gate for terminals below 80×24 (this is already handled by `AppShell`).

### What Already Exists

From `tui-dashboard-screen-scaffold`:
- `apps/tui/src/screens/Dashboard/index.tsx` — `DashboardScreen` component with `useLayout()`, `useTheme()`, `useScreenKeybindings()`
- Registry entry: `screenRegistry[ScreenName.Dashboard].component = DashboardScreen`
- Barrel export: `apps/tui/src/screens/index.ts` re-exports `DashboardScreen`

From the responsive layout system:
- `useLayout()` — returns `LayoutContext` with `breakpoint`, `contentHeight`, `width`, `height`
- `useBreakpoint()` — returns `Breakpoint | null`
- `useResponsiveValue()` — returns a value based on the current breakpoint
- `getBreakpoint()` — classifies terminal dimensions into `null | "minimum" | "standard" | "large"`
- `useOnResize` from `@opentui/react` — fires synchronously on SIGWINCH

From `tui-dashboard-panel-component` (dependency):
- A `<DashboardPanel>` component that renders a bordered container with title, content slot, and focus styling. This spec assumes the panel component exists and accepts the props defined below. If it does not exist when this ticket is implemented, a minimal inline version is created using `<box border>` elements directly.

---

## Implementation Plan

### Step 1: Create the DashboardLayout component

**File created**: `apps/tui/src/screens/Dashboard/DashboardLayout.tsx`

This is the core of the ticket. `DashboardLayout` is a presentational component that receives the four panel content slots and the quick-actions bar, then arranges them according to the current breakpoint.

```tsx
import React from "react";
import { useLayout } from "../../hooks/useLayout.js";
import { useTheme } from "../../hooks/useTheme.js";
import type { Breakpoint } from "../../types/breakpoint.js";
import type { ThemeTokens } from "../../theme/tokens.js";

/**
 * Panel position identifiers.
 * Grid layout maps: 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right.
 * Stacked layout shows one panel at a time, indexed 0–3.
 */
export enum PanelPosition {
  RecentRepos = 0,
  Organizations = 1,
  StarredRepos = 2,
  ActivityFeed = 3,
}

export const PANEL_COUNT = 4;

export const PANEL_LABELS: Record<PanelPosition, string> = {
  [PanelPosition.RecentRepos]: "Recent Repos",
  [PanelPosition.Organizations]: "Organizations",
  [PanelPosition.StarredRepos]: "Starred Repos",
  [PanelPosition.ActivityFeed]: "Activity Feed",
};

export interface DashboardLayoutProps {
  panels: Record<PanelPosition, React.ReactNode>;
  quickActions: React.ReactNode;
  focusedPanel: PanelPosition;
  onFocusedPanelChange: (panel: PanelPosition) => void;
}

const QUICK_ACTIONS_HEIGHT = 1;

function getLayoutMode(breakpoint: Breakpoint | null): "grid" | "stacked" {
  if (breakpoint === "minimum") return "stacked";
  return "grid";
}

export function DashboardLayout({
  panels,
  quickActions,
  focusedPanel,
  onFocusedPanelChange,
}: DashboardLayoutProps) {
  const { breakpoint, contentHeight } = useLayout();
  const theme = useTheme();
  const layoutMode = getLayoutMode(breakpoint);
  const panelAreaHeight = Math.max(0, contentHeight - QUICK_ACTIONS_HEIGHT);

  if (layoutMode === "grid") {
    return (
      <GridLayout
        panels={panels}
        quickActions={quickActions}
        focusedPanel={focusedPanel}
        panelAreaHeight={panelAreaHeight}
        theme={theme}
      />
    );
  }

  return (
    <StackedLayout
      panels={panels}
      quickActions={quickActions}
      focusedPanel={focusedPanel}
      onFocusedPanelChange={onFocusedPanelChange}
      panelAreaHeight={panelAreaHeight}
      theme={theme}
    />
  );
}
```

**Design decisions**:

1. **Controlled focus**: `focusedPanel` is controlled by the parent (`DashboardScreen`). This ensures focus state is preserved across layout mode transitions (grid↔stacked on resize).
2. **Layout mode is derived, not stored**: `getLayoutMode()` is a pure function of breakpoint. No `useState` for layout mode. Recalculation is synchronous on resize.
3. **Panel area height**: `contentHeight` (from `useLayout()`) is `terminalHeight - 2` (header + status bar). The quick-actions bar consumes 1 row. Panel area = `contentHeight - 1`.
4. **Enum for panel positions**: `PanelPosition` provides named positions instead of magic numbers.

### Step 2: Implement GridLayout sub-component

**File**: `apps/tui/src/screens/Dashboard/DashboardLayout.tsx` (same file, internal component)

```tsx
interface GridLayoutProps {
  panels: Record<PanelPosition, React.ReactNode>;
  quickActions: React.ReactNode;
  focusedPanel: PanelPosition;
  panelAreaHeight: number;
  theme: ThemeTokens;
}

function GridLayout({ panels, quickActions, focusedPanel, panelAreaHeight, theme }: GridLayoutProps) {
  const rowHeight = Math.floor(panelAreaHeight / 2);

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" width="100%" height={rowHeight}>
        <box width="50%" height="100%" border borderStyle="single"
          borderColor={focusedPanel === PanelPosition.RecentRepos ? theme.primary : theme.border}
          title={PANEL_LABELS[PanelPosition.RecentRepos]} titleAlignment="left">
          {panels[PanelPosition.RecentRepos]}
        </box>
        <box width="50%" height="100%" border borderStyle="single"
          borderColor={focusedPanel === PanelPosition.Organizations ? theme.primary : theme.border}
          title={PANEL_LABELS[PanelPosition.Organizations]} titleAlignment="left">
          {panels[PanelPosition.Organizations]}
        </box>
      </box>
      <box flexDirection="row" width="100%" height={rowHeight}>
        <box width="50%" height="100%" border borderStyle="single"
          borderColor={focusedPanel === PanelPosition.StarredRepos ? theme.primary : theme.border}
          title={PANEL_LABELS[PanelPosition.StarredRepos]} titleAlignment="left">
          {panels[PanelPosition.StarredRepos]}
        </box>
        <box width="50%" height="100%" border borderStyle="single"
          borderColor={focusedPanel === PanelPosition.ActivityFeed ? theme.primary : theme.border}
          title={PANEL_LABELS[PanelPosition.ActivityFeed]} titleAlignment="left">
          {panels[PanelPosition.ActivityFeed]}
        </box>
      </box>
      <box width="100%" height={1} border={["top"]} borderStyle="single" borderColor={theme.border}>
        {quickActions}
      </box>
    </box>
  );
}
```

**Design decisions**:
- **50%/50% split**: Both columns use `width="50%"` handled by OpenTUI's Yoga layout engine.
- **Row height**: `Math.floor(panelAreaHeight / 2)` per row. Remainder absorbed by flexbox.
- **Border color indicates focus**: Focused panel uses `theme.primary` (blue); others use `theme.border` (gray).
- **`borderStyle="single"`**: Uses single-line box-drawing characters (`┌─┐│└┘`) per design spec.
- **`title` prop**: OpenTUI `<box>` renders text in the top border. `titleAlignment="left"` places the label at the top-left.
- **Quick-actions bar**: `border={["top"]}` renders only the top border as a separator. Fixed height 1 row.

### Step 3: Implement StackedLayout sub-component

**File**: `apps/tui/src/screens/Dashboard/DashboardLayout.tsx` (same file, internal component)

```tsx
interface StackedLayoutProps {
  panels: Record<PanelPosition, React.ReactNode>;
  quickActions: React.ReactNode;
  focusedPanel: PanelPosition;
  onFocusedPanelChange: (panel: PanelPosition) => void;
  panelAreaHeight: number;
  theme: ThemeTokens;
}

function StackedLayout({ panels, quickActions, focusedPanel, panelAreaHeight, theme }: StackedLayoutProps) {
  const panelLabel = PANEL_LABELS[focusedPanel];
  const positionIndicator = `[${focusedPanel + 1}/${PANEL_COUNT}]`;
  const title = `${panelLabel} ${positionIndicator}`;

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box width="100%" height={panelAreaHeight} border borderStyle="single"
        borderColor={theme.primary} title={title} titleAlignment="left">
        {panels[focusedPanel]}
      </box>
      <box width="100%" height={1} border={["top"]} borderStyle="single" borderColor={theme.border}>
        {quickActions}
      </box>
    </box>
  );
}
```

**Design decisions**:
- **Single panel visible**: Only `panels[focusedPanel]` is rendered. Other panels are not mounted.
- **Position indicator**: Title includes `[N/4]` (e.g., `Recent Repos [1/4]`) per ticket description.
- **Always focused border**: Visible panel always uses `theme.primary` since it is the focused panel.

### Step 4: Create the useDashboardFocus hook

**File created**: `apps/tui/src/screens/Dashboard/useDashboardFocus.ts`

```tsx
import { useState, useCallback, useRef, useEffect } from "react";
import { PanelPosition, PANEL_COUNT } from "./DashboardLayout.js";
import type { Breakpoint } from "../../types/breakpoint.js";

export interface DashboardFocusState {
  focusedPanel: PanelPosition;
  setFocusedPanel: (panel: PanelPosition) => void;
  focusNextPanel: () => void;
  focusPrevPanel: () => void;
}

export function useDashboardFocus(breakpoint: Breakpoint | null): DashboardFocusState {
  const [focusedPanel, setFocusedPanel] = useState<PanelPosition>(PanelPosition.RecentRepos);

  const prevBreakpointRef = useRef<Breakpoint | null>(breakpoint);
  useEffect(() => {
    prevBreakpointRef.current = breakpoint;
  }, [breakpoint]);

  const focusNextPanel = useCallback(() => {
    setFocusedPanel((prev) => ((prev + 1) % PANEL_COUNT) as PanelPosition);
  }, []);

  const focusPrevPanel = useCallback(() => {
    setFocusedPanel((prev) => ((prev - 1 + PANEL_COUNT) % PANEL_COUNT) as PanelPosition);
  }, []);

  return { focusedPanel, setFocusedPanel, focusNextPanel, focusPrevPanel };
}
```

**Design decisions**:
- **Focus preserved on resize**: `useState` survives re-renders caused by breakpoint changes. No special logic needed.
- **Wrapping cycle**: Modular arithmetic ensures clean wrapping (3→0 forward, 0→3 backward).
- **No breakpoint-conditional logic**: The hook provides focus state only; layout components handle the visual difference.

### Step 5: Update DashboardScreen to use the new layout

**File modified**: `apps/tui/src/screens/Dashboard/index.tsx`

Replace placeholder content with `DashboardLayout` integration.

```tsx
import React, { useMemo } from "react";
import type { ScreenComponentProps } from "../../router/types.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { useLayout } from "../../hooks/useLayout.js";
import { useTheme } from "../../hooks/useTheme.js";
import type { KeyHandler } from "../../providers/keybinding-types.js";
import type { StatusBarHint } from "../../hooks/useStatusBarHints.js";
import { DashboardLayout, PanelPosition } from "./DashboardLayout.js";
import { useDashboardFocus } from "./useDashboardFocus.js";

export function DashboardScreen({ entry, params }: ScreenComponentProps) {
  const layout = useLayout();
  const theme = useTheme();
  const { focusedPanel, setFocusedPanel, focusNextPanel, focusPrevPanel } =
    useDashboardFocus(layout.breakpoint);

  const isStacked = layout.breakpoint === "minimum";

  const keybindings = useMemo((): KeyHandler[] => {
    const bindings: KeyHandler[] = [
      { key: "r", description: "Repositories", group: "Navigation",
        handler: () => { /* Placeholder — tui-dashboard-repos-list */ } },
    ];

    if (isStacked) {
      bindings.push(
        { key: "Tab", description: "Next panel", group: "Panels", handler: focusNextPanel },
        { key: "shift+Tab", description: "Previous panel", group: "Panels", handler: focusPrevPanel },
      );
    }

    if (!isStacked && layout.breakpoint) {
      bindings.push(
        { key: "h", description: "Focus left panel", group: "Panels",
          handler: () => {
            if (focusedPanel === PanelPosition.Organizations) setFocusedPanel(PanelPosition.RecentRepos);
            else if (focusedPanel === PanelPosition.ActivityFeed) setFocusedPanel(PanelPosition.StarredRepos);
          } },
        { key: "l", description: "Focus right panel", group: "Panels",
          handler: () => {
            if (focusedPanel === PanelPosition.RecentRepos) setFocusedPanel(PanelPosition.Organizations);
            else if (focusedPanel === PanelPosition.StarredRepos) setFocusedPanel(PanelPosition.ActivityFeed);
          } },
        { key: "j", description: "Focus panel below", group: "Panels",
          handler: () => {
            if (focusedPanel === PanelPosition.RecentRepos) setFocusedPanel(PanelPosition.StarredRepos);
            else if (focusedPanel === PanelPosition.Organizations) setFocusedPanel(PanelPosition.ActivityFeed);
          } },
        { key: "k", description: "Focus panel above", group: "Panels",
          handler: () => {
            if (focusedPanel === PanelPosition.StarredRepos) setFocusedPanel(PanelPosition.RecentRepos);
            else if (focusedPanel === PanelPosition.ActivityFeed) setFocusedPanel(PanelPosition.Organizations);
          } },
        { key: "Tab", description: "Next panel", group: "Panels", handler: focusNextPanel },
        { key: "shift+Tab", description: "Previous panel", group: "Panels", handler: focusPrevPanel },
      );
    }
    return bindings;
  }, [isStacked, layout.breakpoint, focusedPanel, setFocusedPanel, focusNextPanel, focusPrevPanel]);

  const statusBarHints = useMemo((): StatusBarHint[] => {
    const hints: StatusBarHint[] = [
      { keys: "g", label: "go-to", order: 0 },
      { keys: ":", label: "command", order: 10 },
      { keys: "?", label: "help", order: 20 },
    ];
    if (isStacked) {
      hints.unshift({ keys: "Tab", label: "next panel", order: -10 });
    } else {
      hints.unshift({ keys: "h/j/k/l", label: "focus panel", order: -10 });
    }
    return hints;
  }, [isStacked]);

  useScreenKeybindings(keybindings, statusBarHints);

  const panels = useMemo(() => ({
    [PanelPosition.RecentRepos]: <text fg={theme.muted}>Recent repositories will appear here</text>,
    [PanelPosition.Organizations]: <text fg={theme.muted}>Organizations will appear here</text>,
    [PanelPosition.StarredRepos]: <text fg={theme.muted}>Starred repositories will appear here</text>,
    [PanelPosition.ActivityFeed]: <text fg={theme.muted}>Activity feed will appear here</text>,
  }), [theme.muted]);

  const quickActionsContent = useMemo(() => {
    if (isStacked) {
      return <box flexDirection="row" width="100%"><text fg={theme.muted}>Tab:next panel  n:new issue  w:new workspace</text></box>;
    }
    return <box flexDirection="row" width="100%"><text fg={theme.muted}>n:new issue  w:new workspace  c:create repo</text></box>;
  }, [isStacked, theme.muted]);

  return (
    <DashboardLayout
      panels={panels}
      quickActions={quickActionsContent}
      focusedPanel={focusedPanel}
      onFocusedPanelChange={setFocusedPanel}
    />
  );
}
```

**Design decisions**:
- **Keybindings adapt to layout mode**: Grid mode registers `h/j/k/l` for spatial navigation plus `Tab`/`Shift+Tab`. Stacked mode registers only `Tab`/`Shift+Tab`.
- **Grid navigation is spatial**: `h` moves left within the same row, `l` right, `j` down, `k` up. Boundary keys are no-ops.
- **Status bar hints change with layout mode**: Minimum shows `Tab:next panel`; standard/large shows `h/j/k/l:focus panel`.
- **Placeholder panel content**: Muted text placeholders; real content comes from subsequent tickets.
- **Quick-actions bar varies by mode**: Stacked includes `Tab:next panel`; grid omits it.

### Step 6: Verify no regression in existing wiring

**No code changes needed.** Verify:
1. `screenRegistry[ScreenName.Dashboard].component` still points to `DashboardScreen`
2. `DashboardScreen` still accepts `ScreenComponentProps`
3. `useScreenKeybindings` is still called
4. Header breadcrumb still shows "Dashboard"
5. Status bar still shows hints

---

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/tui/src/screens/Dashboard/DashboardLayout.tsx` | **Create** | Responsive grid/stacked layout with GridLayout and StackedLayout sub-components |
| `apps/tui/src/screens/Dashboard/useDashboardFocus.ts` | **Create** | Panel focus state hook with cycling and focus preservation across breakpoint transitions |
| `apps/tui/src/screens/Dashboard/index.tsx` | **Modify** | Replace placeholder layout with DashboardLayout integration, add panel navigation keybindings |

## Files NOT Changed (Verified Correct)

| File | Reason |
|------|--------|
| `apps/tui/src/router/registry.ts` | Dashboard entry already points to DashboardScreen; import unchanged |
| `apps/tui/src/router/types.ts` | ScreenName.Dashboard and DEFAULT_ROOT_SCREEN unchanged |
| `apps/tui/src/hooks/useLayout.ts` | No new layout values needed |
| `apps/tui/src/hooks/useBreakpoint.ts` | Consumed but not modified |
| `apps/tui/src/components/AppShell.tsx` | Terminal-too-small gate already handled |
| `apps/tui/src/components/HeaderBar.tsx` | Breadcrumb rendering unchanged |
| `apps/tui/src/components/StatusBar.tsx` | Hint rendering unchanged |
| `apps/tui/src/screens/index.ts` | Barrel export already re-exports DashboardScreen |

---

## Detailed Component Contracts

### DashboardLayout Props

```typescript
export interface DashboardLayoutProps {
  panels: Record<PanelPosition, React.ReactNode>;
  quickActions: React.ReactNode;
  focusedPanel: PanelPosition;
  onFocusedPanelChange: (panel: PanelPosition) => void;
}
```

### PanelPosition Enum

```typescript
export enum PanelPosition {
  RecentRepos = 0,     // Grid: top-left
  Organizations = 1,   // Grid: top-right
  StarredRepos = 2,    // Grid: bottom-left
  ActivityFeed = 3,    // Grid: bottom-right
}
```

### useDashboardFocus Return Type

```typescript
export interface DashboardFocusState {
  focusedPanel: PanelPosition;
  setFocusedPanel: (panel: PanelPosition) => void;
  focusNextPanel: () => void;
  focusPrevPanel: () => void;
}
```

---

## Layout Geometry

### Grid Mode (120×40 terminal)

```
Terminal: 120 cols × 40 rows
Header:   1 row   (rendered by AppShell)
Status:   1 row   (rendered by AppShell)
Content:  38 rows  (contentHeight = 40 - 2)
  Panels: 37 rows  (contentHeight - 1 for quick actions)
  Quick:  1 row    (fixed, anchored at bottom)

Row height: floor(37 / 2) = 18 rows per row

┌──────────────────────────────┬──────────────────────────────┐
│ Recent Repos                 │ Organizations                │
│        (60 cols × 18 rows)   │        (60 cols × 18 rows)   │
├──────────────────────────────┼──────────────────────────────┤
│ Starred Repos                │ Activity Feed                │
│        (60 cols × 18 rows)   │        (60 cols × 18 rows)   │
├──────────────────────────────┴──────────────────────────────┤
│ n:new issue  w:new workspace  c:create repo                 │
└─────────────────────────────────────────────────────────────┘
```

### Stacked Mode (80×24 terminal)

```
Terminal: 80 cols × 24 rows
Header:  1 row
Status:  1 row
Content: 22 rows
  Panel: 21 rows
  Quick: 1 row

┌─ Recent Repos [1/4] ────────────────────────────────────────┐
│           (80 cols × 21 rows, single visible panel)          │
├──────────────────────────────────────────────────────────────┤
│ Tab:next panel  n:new issue  w:new workspace                 │
└──────────────────────────────────────────────────────────────┘
```

### Large Mode (200×60 terminal)

Same as grid but with more space: 58 content rows, 57 panel area, 28 rows/row, 100 cols/column.

---

## Keyboard Interaction Matrix

### Grid Mode (standard/large)

| Key | Action | Before | After |
|-----|--------|--------|-------|
| `h` | Focus left | Organizations (1) | RecentRepos (0) |
| `h` | Focus left | ActivityFeed (3) | StarredRepos (2) |
| `h` | No-op | RecentRepos (0) | RecentRepos (0) |
| `h` | No-op | StarredRepos (2) | StarredRepos (2) |
| `l` | Focus right | RecentRepos (0) | Organizations (1) |
| `l` | Focus right | StarredRepos (2) | ActivityFeed (3) |
| `l` | No-op | Organizations (1) | Organizations (1) |
| `l` | No-op | ActivityFeed (3) | ActivityFeed (3) |
| `j` | Focus below | RecentRepos (0) | StarredRepos (2) |
| `j` | Focus below | Organizations (1) | ActivityFeed (3) |
| `j` | No-op | StarredRepos (2) | StarredRepos (2) |
| `j` | No-op | ActivityFeed (3) | ActivityFeed (3) |
| `k` | Focus above | StarredRepos (2) | RecentRepos (0) |
| `k` | Focus above | ActivityFeed (3) | Organizations (1) |
| `k` | No-op | RecentRepos (0) | RecentRepos (0) |
| `k` | No-op | Organizations (1) | Organizations (1) |
| `Tab` | Cycle next | Any (N) | (N+1) % 4 |
| `Shift+Tab` | Cycle prev | Any (N) | (N-1+4) % 4 |

### Stacked Mode (minimum)

| Key | Action | Before | After |
|-----|--------|--------|-------|
| `Tab` | Next panel | RecentRepos (0) | Organizations (1) |
| `Tab` | Next (wrap) | ActivityFeed (3) | RecentRepos (0) |
| `Shift+Tab` | Prev panel | Organizations (1) | RecentRepos (0) |
| `Shift+Tab` | Prev (wrap) | RecentRepos (0) | ActivityFeed (3) |

---

## Resize Behavior

### Grid → Stacked (e.g., 120×40 → 80×24)

1. SIGWINCH → `useOnResize` → `useTerminalDimensions()` updates
2. `useLayout()` recalculates: breakpoint `"standard"` → `"minimum"`
3. `DashboardScreen` re-renders; `useDashboardFocus` state preserved (same useState)
4. `getLayoutMode()` → `"stacked"`; `StackedLayout` renders `panels[focusedPanel]`
5. Previously focused panel becomes the visible panel

### Stacked → Grid (e.g., 80×24 → 120×40)

1. Same chain; breakpoint changes to `"standard"`
2. `GridLayout` renders all four panels
3. Previously focused panel retains `theme.primary` border highlight

### No State Reset

`useDashboardFocus` does NOT reset `focusedPanel` on breakpoint change. The user's mental model is preserved.

---

## Unit & Integration Tests

**Test file**: `e2e/tui/dashboard.test.ts`

These tests extend the file established by `tui-dashboard-screen-scaffold`.

### Test ID Naming Convention

- `SNAP-DASH-*` — Terminal snapshot tests
- `KEY-DASH-*` — Keyboard interaction tests
- `RESP-DASH-*` — Responsive layout tests

### Test File: `e2e/tui/dashboard.test.ts` (additions)

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, type TUITestInstance, TERMINAL_SIZES, createMockAPIEnv } from "./helpers";

let terminal: TUITestInstance;

afterEach(async () => {
  if (terminal) await terminal.terminate();
});

describe("TUI_DASHBOARD — Grid/Stacked Layout", () => {

  describe("grid mode at 120x40 (standard)", () => {
    test("SNAP-DASH-100: renders 2x2 grid with all four panels visible", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      await terminal.waitForText("Organizations");
      await terminal.waitForText("Starred Repos");
      await terminal.waitForText("Activity Feed");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-DASH-101: grid panels use single-line box-drawing borders", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      expect(terminal.snapshot()).toMatch(/[┌┐└┘│─]/);
    });

    test("SNAP-DASH-102: quick-actions bar renders at the bottom of grid", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("n:new issue");
      await terminal.waitForText("w:new workspace");
    });

    test("SNAP-DASH-103: focused panel has primary border color", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  describe("grid mode at 200x60 (large)", () => {
    test("SNAP-DASH-110: renders 2x2 grid at large size", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.large.width, rows: TERMINAL_SIZES.large.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      await terminal.waitForText("Organizations");
      await terminal.waitForText("Starred Repos");
      await terminal.waitForText("Activity Feed");
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  describe("stacked mode at 80x24 (minimum)", () => {
    test("SNAP-DASH-120: renders single panel with position indicator", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.minimum.width, rows: TERMINAL_SIZES.minimum.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      await terminal.waitForText("[1/4]");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-DASH-121: only one panel visible in stacked mode", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.minimum.width, rows: TERMINAL_SIZES.minimum.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toContain("Organizations");
      expect(snapshot).not.toContain("Starred Repos");
      expect(snapshot).not.toContain("Activity Feed");
    });

    test("SNAP-DASH-122: quick-actions bar includes Tab hint in stacked mode", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.minimum.width, rows: TERMINAL_SIZES.minimum.height, env: createMockAPIEnv() });
      await terminal.waitForText("Tab:next panel");
    });
  });

  describe("keyboard: stacked mode panel cycling", () => {
    test("KEY-DASH-100: Tab cycles to next panel in stacked mode", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.minimum.width, rows: TERMINAL_SIZES.minimum.height, env: createMockAPIEnv() });
      await terminal.waitForText("[1/4]");
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Organizations");
      await terminal.waitForText("[2/4]");
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Starred Repos");
      await terminal.waitForText("[3/4]");
      await terminal.sendKeys("Tab");
      await terminal.waitForText("Activity Feed");
      await terminal.waitForText("[4/4]");
    });

    test("KEY-DASH-101: Tab wraps from last panel to first", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.minimum.width, rows: TERMINAL_SIZES.minimum.height, env: createMockAPIEnv() });
      await terminal.waitForText("[1/4]");
      await terminal.sendKeys("Tab", "Tab", "Tab", "Tab");
      await terminal.waitForText("Recent Repos");
      await terminal.waitForText("[1/4]");
    });

    test("KEY-DASH-102: Shift+Tab cycles to previous panel (wraps)", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.minimum.width, rows: TERMINAL_SIZES.minimum.height, env: createMockAPIEnv() });
      await terminal.waitForText("[1/4]");
      await terminal.sendKeys("shift+Tab");
      await terminal.waitForText("Activity Feed");
      await terminal.waitForText("[4/4]");
    });

    test("KEY-DASH-103: Shift+Tab from panel 2 goes to panel 1", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.minimum.width, rows: TERMINAL_SIZES.minimum.height, env: createMockAPIEnv() });
      await terminal.waitForText("[1/4]");
      await terminal.sendKeys("Tab");
      await terminal.waitForText("[2/4]");
      await terminal.sendKeys("shift+Tab");
      await terminal.waitForText("Recent Repos");
      await terminal.waitForText("[1/4]");
    });
  });

  describe("keyboard: grid mode panel focus", () => {
    test("KEY-DASH-110: h/l navigates between columns", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      await terminal.sendKeys("l");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.sendKeys("h");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-DASH-111: j/k navigates between rows", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      await terminal.sendKeys("j");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.sendKeys("k");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("KEY-DASH-112: h at left column is a no-op", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      const beforeSnap = terminal.snapshot();
      await terminal.sendKeys("h");
      expect(terminal.snapshot()).toBe(beforeSnap);
    });

    test("KEY-DASH-113: j at bottom row is a no-op", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      await terminal.sendKeys("j");
      const bottomSnap = terminal.snapshot();
      await terminal.sendKeys("j");
      expect(terminal.snapshot()).toBe(bottomSnap);
    });

    test("KEY-DASH-114: Tab cycles through all panels in grid mode", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      await terminal.sendKeys("Tab");
      const snap1 = terminal.snapshot();
      await terminal.sendKeys("Tab");
      const snap2 = terminal.snapshot();
      expect(snap2).not.toBe(snap1);
      await terminal.sendKeys("Tab");
      await terminal.sendKeys("Tab");
    });

    test("KEY-DASH-115: full grid traversal l→j→h→k returns home", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      await terminal.sendKeys("l", "j", "h", "k");
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  describe("resize transitions", () => {
    test("RESP-DASH-100: grid→stacked preserves focused panel", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      await terminal.sendKeys("l");
      await terminal.resize(TERMINAL_SIZES.minimum.width, TERMINAL_SIZES.minimum.height);
      await terminal.waitForText("Organizations");
      await terminal.waitForText("[2/4]");
    });

    test("RESP-DASH-101: stacked→grid preserves focused panel", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.minimum.width, rows: TERMINAL_SIZES.minimum.height, env: createMockAPIEnv() });
      await terminal.waitForText("[1/4]");
      await terminal.sendKeys("Tab", "Tab");
      await terminal.waitForText("[3/4]");
      await terminal.resize(TERMINAL_SIZES.standard.width, TERMINAL_SIZES.standard.height);
      await terminal.waitForText("Recent Repos");
      await terminal.waitForText("Organizations");
      await terminal.waitForText("Starred Repos");
      await terminal.waitForText("Activity Feed");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("RESP-DASH-102: rapid resize does not crash", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      await terminal.resize(80, 24);
      await terminal.resize(120, 40);
      await terminal.resize(80, 24);
      await terminal.resize(200, 60);
      await terminal.resize(80, 24);
      await terminal.resize(120, 40);
      await terminal.waitForText("Recent Repos");
    });

    test("RESP-DASH-103: below-minimum shows too-small, recovers on resize up", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      await terminal.resize(60, 20);
      await terminal.waitForText("Terminal too small");
      await terminal.resize(TERMINAL_SIZES.standard.width, TERMINAL_SIZES.standard.height);
      await terminal.waitForText("Recent Repos");
    });
  });

  describe("status bar hints by layout mode", () => {
    test("SNAP-DASH-130: grid mode shows h/j/k/l hint", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/h\/j\/k\/l.*focus panel|focus panel/);
    });

    test("SNAP-DASH-131: stacked mode shows Tab:next panel hint", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.minimum.width, rows: TERMINAL_SIZES.minimum.height, env: createMockAPIEnv() });
      await terminal.waitForText("[1/4]");
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/Tab.*next panel/);
    });

    test("SNAP-DASH-132: hint changes on resize grid→stacked", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      let lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/h\/j\/k\/l|focus panel/);
      await terminal.resize(TERMINAL_SIZES.minimum.width, TERMINAL_SIZES.minimum.height);
      await terminal.waitForText("[1/4]");
      lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/Tab.*next panel/);
    });
  });

  describe("quick-actions bar", () => {
    test("SNAP-DASH-140: visible in grid mode", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("n:new issue");
      await terminal.waitForText("w:new workspace");
    });

    test("SNAP-DASH-141: visible in stacked mode with Tab hint", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.minimum.width, rows: TERMINAL_SIZES.minimum.height, env: createMockAPIEnv() });
      await terminal.waitForText("Tab:next panel");
      await terminal.waitForText("n:new issue");
    });

    test("SNAP-DASH-142: anchored at bottom (second-to-last line)", async () => {
      terminal = await launchTUI({ cols: TERMINAL_SIZES.standard.width, rows: TERMINAL_SIZES.standard.height, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      const secondToLastLine = terminal.getLine(terminal.rows - 2);
      expect(secondToLastLine).toMatch(/n:new issue|w:new workspace/);
    });
  });

  describe("snapshot regression", () => {
    test("SNAP-DASH-150: full dashboard at 80x24", async () => {
      terminal = await launchTUI({ cols: 80, rows: 24, env: createMockAPIEnv() });
      await terminal.waitForText("[1/4]");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-DASH-151: full dashboard at 120x40", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-DASH-152: full dashboard at 200x60", async () => {
      terminal = await launchTUI({ cols: 200, rows: 60, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repos");
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });
});
```

### Test Inventory

| Test ID | Category | Description | Expected Status |
|---------|----------|-------------|----------------|
| SNAP-DASH-100 | Snapshot | 2×2 grid renders all four panels at 120×40 | ✅ Pass |
| SNAP-DASH-101 | Snapshot | Grid panels use single-line box-drawing borders | ✅ Pass |
| SNAP-DASH-102 | Content | Quick-actions bar renders at grid bottom | ✅ Pass |
| SNAP-DASH-103 | Snapshot | Focused panel has primary border color | ✅ Pass |
| SNAP-DASH-110 | Snapshot | 2×2 grid renders at 200×60 (large) | ✅ Pass |
| SNAP-DASH-120 | Snapshot | Single panel with [1/4] at 80×24 | ✅ Pass |
| SNAP-DASH-121 | Content | Only one panel visible in stacked mode | ✅ Pass |
| SNAP-DASH-122 | Content | Quick-actions includes Tab:next panel | ✅ Pass |
| KEY-DASH-100 | Keyboard | Tab cycles panels in stacked mode | ✅ Pass |
| KEY-DASH-101 | Keyboard | Tab wraps from last to first | ✅ Pass |
| KEY-DASH-102 | Keyboard | Shift+Tab cycles backwards (wraps) | ✅ Pass |
| KEY-DASH-103 | Keyboard | Shift+Tab from panel 2 to panel 1 | ✅ Pass |
| KEY-DASH-110 | Keyboard | h/l navigates between grid columns | ✅ Pass |
| KEY-DASH-111 | Keyboard | j/k navigates between grid rows | ✅ Pass |
| KEY-DASH-112 | Keyboard | h at left column is no-op | ✅ Pass |
| KEY-DASH-113 | Keyboard | j at bottom row is no-op | ✅ Pass |
| KEY-DASH-114 | Keyboard | Tab cycles through all grid panels | ✅ Pass |
| KEY-DASH-115 | Keyboard | Full traversal l→j→h→k returns home | ✅ Pass |
| RESP-DASH-100 | Resize | Grid→stacked preserves focused panel | ✅ Pass |
| RESP-DASH-101 | Resize | Stacked→grid preserves focused panel | ✅ Pass |
| RESP-DASH-102 | Resize | Rapid resize does not crash | ✅ Pass |
| RESP-DASH-103 | Resize | Below-minimum recovers on resize up | ✅ Pass |
| SNAP-DASH-130 | StatusBar | Grid mode shows h/j/k/l hint | ✅ Pass |
| SNAP-DASH-131 | StatusBar | Stacked mode shows Tab hint | ✅ Pass |
| SNAP-DASH-132 | StatusBar | Hint changes on resize | ✅ Pass |
| SNAP-DASH-140 | QuickActions | Visible in grid mode | ✅ Pass |
| SNAP-DASH-141 | QuickActions | Visible in stacked mode | ✅ Pass |
| SNAP-DASH-142 | QuickActions | Anchored at bottom | ✅ Pass |
| SNAP-DASH-150 | Regression | Full snapshot at 80×24 | ✅ Pass |
| SNAP-DASH-151 | Regression | Full snapshot at 120×40 | ✅ Pass |
| SNAP-DASH-152 | Regression | Full snapshot at 200×60 | ✅ Pass |

All 31 tests should pass since this ticket only depends on layout infrastructure and panel focus state — no backend API calls are needed.

---

## Productionization Checklist

### From POC → Production (tracked by subsequent tickets)

| Concern | Current State | Production Target | Tracked By |
|---------|---------------|-------------------|------------|
| Recent repos panel content | Static placeholder text | `useRepos()` hook, ScrollableList, loading/error states | `tui-dashboard-repos-list` |
| Organizations panel content | Static placeholder text | `useOrgs()` hook, ScrollableList, member counts | `tui-dashboard-orgs-list` |
| Starred repos panel content | Static placeholder text | `useRepos({ starred: true })`, ScrollableList | `tui-dashboard-starred-repos` |
| Activity feed panel content | Static placeholder text | SSE-backed real-time activity stream | `tui-dashboard-activity-feed` |
| Quick-actions bar | Static text hints | Functional keybindings (n, w, c) | `tui-dashboard-quick-actions` |
| Panel Enter key | Not implemented | Enter on focused panel opens detail | Per-panel tickets |
| Panel scroll | Not needed (static content) | Scrollable with pagination | Per-panel tickets |
| Loading/skeleton states | Not applicable | Per-panel spinners and skeleton lists | Per-panel tickets |
| Error states | Not applicable | Per-panel inline error with retry | Per-panel tickets |

### Integration Points Established

| Integration | Status |
|-------------|--------|
| Grid/stacked layout switching | ✅ Complete |
| Panel focus state management | ✅ Complete |
| Keyboard navigation (grid h/j/k/l) | ✅ Complete |
| Keyboard navigation (stacked Tab/Shift+Tab) | ✅ Complete |
| Status bar hints (adaptive) | ✅ Complete |
| Quick-actions bar anchoring | ✅ Complete |
| Resize transition (focus preservation) | ✅ Complete |
| Content height calculation | ✅ Complete |

### What This Ticket Does NOT Do

1. **No DashboardPanel component abstraction**: Uses inline `<box border>` elements. When `DashboardPanel` is available, refactoring is internal; the external API remains unchanged.
2. **No data fetching**: All panel content is static placeholder text.
3. **No Enter-to-open behavior**: Pressing Enter on a focused panel does nothing.
4. **No panel-internal scroll**: Panels do not contain `<scrollbox>`.

---

## Acceptance Criteria

1. ✅ `apps/tui/src/screens/Dashboard/DashboardLayout.tsx` exists and exports `DashboardLayout`, `PanelPosition`, `PANEL_COUNT`, `PANEL_LABELS`
2. ✅ `apps/tui/src/screens/Dashboard/useDashboardFocus.ts` exists and exports `useDashboardFocus`
3. ✅ At 120×40+ (standard/large), Dashboard renders 2×2 grid with all four panels visible
4. ✅ At 80×24 – 119×39 (minimum), Dashboard renders single panel with `[N/4]` indicator
5. ✅ Grid panels have single-line box-drawing borders using `border` color token
6. ✅ Focused panel border uses `primary` color token; others use `border`
7. ✅ Quick-actions bar anchored at bottom with 1-row fixed height and top border
8. ✅ `h/j/k/l` navigates grid panels spatially; boundary keys are no-ops
9. ✅ `Tab`/`Shift+Tab` cycles panels in both modes, wrapping at boundaries
10. ✅ Stacked mode quick-actions bar includes `Tab:next panel` hint
11. ✅ Resize grid→stacked preserves focused panel
12. ✅ Resize stacked→grid shows all panels with preserved focus
13. ✅ Status bar hints adapt to layout mode
14. ✅ Layout recalculation is synchronous on SIGWINCH
15. ✅ `e2e/tui/dashboard.test.ts` contains 31 snapshot, keyboard, resize, and integration tests
16. ✅ TypeScript compiles with zero errors (`tsc --noEmit`)