# Implementation Plan: `tui-dashboard-grid-layout`

This document outlines the step-by-step implementation plan to build the responsive 2×2 grid and single-column stacked layout for the Dashboard screen in the Codeplane TUI.

## Overview

Based on research, the `tui-dashboard-screen-scaffold` has not been merged, meaning we must set up the `Dashboard` directory, update the router registry to point to `DashboardScreen` instead of `PlaceholderScreen`, and implement the grid/stacked layout logic from scratch. We will create three core files for the screen (`index.tsx`, `DashboardLayout.tsx`, `useDashboardFocus.ts`) and one test file (`e2e/tui/dashboard.test.ts`).

## Step-by-Step Execution

### Step 1: Create State Management Hook
**File:** `apps/tui/src/screens/Dashboard/useDashboardFocus.ts`

This hook manages the active/focused panel state and handles the circular cycling logic. 

```typescript
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

  // Ref to track breakpoint changes if needed in future logic
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

### Step 2: Implement Layout Components
**File:** `apps/tui/src/screens/Dashboard/DashboardLayout.tsx`

This presentational component takes panels and renders them in either a grid (standard/large) or a stacked layout (minimum).

```tsx
import React from "react";
import { useLayout } from "../../hooks/useLayout.js";
import { useTheme } from "../../hooks/useTheme.js";
import type { Breakpoint } from "../../types/breakpoint.js";
import type { ThemeTokens } from "../../theme/tokens.js";

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
      <box width="100%" height={QUICK_ACTIONS_HEIGHT} border={["top"]} borderStyle="single" borderColor={theme.border}>
        {quickActions}
      </box>
    </box>
  );
}

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
      <box width="100%" height={QUICK_ACTIONS_HEIGHT} border={["top"]} borderStyle="single" borderColor={theme.border}>
        {quickActions}
      </box>
    </box>
  );
}
```

### Step 3: Implement Main Dashboard Screen
**File:** `apps/tui/src/screens/Dashboard/index.tsx`

This ties together the layout, state, hooks, and static stubs.

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
  const { focusedPanel, setFocusedPanel, focusNextPanel, focusPrevPanel } = useDashboardFocus(layout.breakpoint);

  const isStacked = layout.breakpoint === "minimum";

  const keybindings = useMemo((): KeyHandler[] => {
    const bindings: KeyHandler[] = [
      { key: "r", description: "Repositories", group: "Navigation", handler: () => {} },
    ];

    if (isStacked) {
      bindings.push(
        { key: "Tab", description: "Next panel", group: "Panels", handler: focusNextPanel },
        { key: "shift+Tab", description: "Previous panel", group: "Panels", handler: focusPrevPanel },
      );
    }

    if (!isStacked && layout.breakpoint) {
      bindings.push(
        { key: "h", description: "Focus left panel", group: "Panels", handler: () => {
            if (focusedPanel === PanelPosition.Organizations) setFocusedPanel(PanelPosition.RecentRepos);
            else if (focusedPanel === PanelPosition.ActivityFeed) setFocusedPanel(PanelPosition.StarredRepos);
        } },
        { key: "l", description: "Focus right panel", group: "Panels", handler: () => {
            if (focusedPanel === PanelPosition.RecentRepos) setFocusedPanel(PanelPosition.Organizations);
            else if (focusedPanel === PanelPosition.StarredRepos) setFocusedPanel(PanelPosition.ActivityFeed);
        } },
        { key: "j", description: "Focus panel below", group: "Panels", handler: () => {
            if (focusedPanel === PanelPosition.RecentRepos) setFocusedPanel(PanelPosition.StarredRepos);
            else if (focusedPanel === PanelPosition.Organizations) setFocusedPanel(PanelPosition.ActivityFeed);
        } },
        { key: "k", description: "Focus panel above", group: "Panels", handler: () => {
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

### Step 4: Update Router/Registry Exports
**File:** `apps/tui/src/screens/index.ts`
Add the export:
```typescript
export { DashboardScreen } from "./Dashboard/index.js";
```

**File:** `apps/tui/src/router/registry.ts`
Replace `PlaceholderScreen` mapped to `ScreenName.Dashboard` with `DashboardScreen`.
```typescript
import { DashboardScreen } from "../screens/index.js";
// ... inside registry object
[ScreenName.Dashboard]: { component: DashboardScreen },
```

### Step 5: Implement E2E Tests
**File:** `e2e/tui/dashboard.test.ts`

Create a new E2E test file replicating the exact 31 tests defined in the engineering spec using `@microsoft/tui-test`. Ensure assertions test content, layout adjustments based on terminal resizes, and verify focus persistence when navigating with keyboard controls.

*Note*: The tests use `launchTUI`, `TERMINAL_SIZES`, and `createMockAPIEnv` helpers from `./helpers` which should be confirmed existing or stubbed out properly in the test directory context.

### Validation & Review
Run `tsc --noEmit` locally in `apps/tui` to verify type safety across the new React files and ensure `PanelPosition` enum, props, and theme usages conform strictly to existing definitions.
Run `bun test e2e/tui/dashboard.test.ts` to ensure assertions accurately validate grid snapping and focus cycling mechanics.