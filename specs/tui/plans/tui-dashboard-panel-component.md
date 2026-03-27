# Implementation Plan: tui-dashboard-panel-component

## 1. Context and Goals
This plan implements the `DashboardPanel` reusable wrapper component for the Codeplane TUI Dashboard screen. The dashboard contains four data-driven sections (Recent Repositories, Organizations, Starred Repositories, and Activity Feed). This component provides the consistent UI wrapper for these sections, including a themed title, focus-aware borders, an inline filter input, scrollable content area, and standard loading/empty/error states. It also includes a per-panel error boundary to ensure that a crash in one panel does not affect the rest of the dashboard.

## 2. Implementation Steps

### Step 1: Create the Panel Error Boundary
**File:** `apps/tui/src/screens/Dashboard/PanelErrorBoundary.tsx`

Create a lightweight React class component scoped to a single dashboard panel. It isolates render errors, logs them using the shared logger, and displays a safe, theme-independent inline error state.

```tsx
import React from "react";
import { normalizeError } from "../../lib/normalize-error.js";
import { logger } from "../../lib/logger.js";

interface PanelErrorBoundaryProps {
  panelTitle: string;
  onRetry: () => void;
  children: React.ReactNode;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class PanelErrorBoundary extends React.Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(thrown: unknown): Partial<PanelErrorBoundaryState> {
    const error = normalizeError(thrown);
    return { hasError: true, error };
  }

  componentDidCatch(thrown: unknown): void {
    const error = normalizeError(thrown);
    logger.error(
      `PanelErrorBoundary: panel "${this.props.panelTitle}" crashed: ${error.message}`,
    );
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry();
  };

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <box
          flexDirection="column"
          flexGrow={1}
          justifyContent="center"
          alignItems="center"
          width="100%"
          border={true}
        >
          <text attributes={1}>
            {this.props.panelTitle}: Error
          </text>
          <text>
            {this.state.error.message.slice(0, 60)}
          </text>
          <text>
            Press R to retry
          </text>
        </box>
      );
    }

    return this.props.children;
  }
}
```

### Step 2: Create the Dashboard Panel Component
**File:** `apps/tui/src/screens/Dashboard/DashboardPanel.tsx`

Implement the primary visual wrapper containing the `PanelTitle`, `FilterBar`, and conditional renderers for `PanelLoading`, `PanelEmpty`, and `PanelError`. Wrap the inner logic with `PanelErrorBoundary`.

```tsx
import React from "react";
import { useTheme } from "../../hooks/useTheme.js";
import { useSpinner } from "../../hooks/useSpinner.js";
import { TextAttributes } from "../../theme/tokens.js";
import { truncateRight } from "../../util/text.js";
import { PanelErrorBoundary } from "./PanelErrorBoundary.js";

export interface DashboardPanelProps {
  title: string;
  focused: boolean;
  index: number;
  total: number;
  isCompact: boolean;
  loading: boolean;
  error: Error | null;
  emptyMessage: string;
  onRetry: () => void;
  filterActive: boolean;
  filterQuery: string;
  onFilterChange: (query: string) => void;
  onFilterClose: () => void;
  onFilterSubmit: () => void;
  matchCount?: { matched: number; total: number };
  children: React.ReactNode;
}

const FILTER_INPUT_MIN_WIDTH = 10;
const FILTER_PLACEHOLDER = "Filter…";
const TITLE_BAR_HEIGHT = 1;
const FILTER_BAR_HEIGHT = 1;

function PanelTitle({ title, index, total, isCompact, maxWidth }: { title: string; index: number; total: number; isCompact: boolean; maxWidth: number; }) {
  const theme = useTheme();
  const positionSuffix = isCompact ? ` [${index + 1}/${total}]` : "";
  const fullTitle = title + positionSuffix;
  const displayTitle = truncateRight(fullTitle, Math.max(1, maxWidth));

  return (
    <box height={TITLE_BAR_HEIGHT} width="100%">
      <text fg={theme.primary} attributes={TextAttributes.BOLD}>
        {displayTitle}
      </text>
    </box>
  );
}

function FilterBar({ filterQuery, onFilterChange, onFilterSubmit, matchCount, focused }: { filterQuery: string; onFilterChange: (query: string) => void; onFilterSubmit: () => void; matchCount?: { matched: number; total: number }; focused: boolean; }) {
  const theme = useTheme();
  const matchText = matchCount ? ` ${matchCount.matched} of ${matchCount.total}` : "";

  return (
    <box height={FILTER_BAR_HEIGHT} width="100%" flexDirection="row" gap={1}>
      <text fg={theme.muted}>/</text>
      <box flexGrow={1} minWidth={FILTER_INPUT_MIN_WIDTH}>
        <input
          value={filterQuery}
          placeholder={FILTER_PLACEHOLDER}
          focused={focused}
          onInput={onFilterChange}
          onSubmit={onFilterSubmit}
        />
      </box>
      {matchCount ? <text fg={theme.muted}>{matchText}</text> : null}
    </box>
  );
}

function PanelLoading() {
  const theme = useTheme();
  const spinnerFrame = useSpinner(true);
  return (
    <box flexGrow={1} justifyContent="center" alignItems="center" width="100%">
      <text>
        <span fg={theme.primary}>{spinnerFrame}</span>
        <span fg={theme.muted}> Loading…</span>
      </text>
    </box>
  );
}

function PanelEmpty({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <box flexGrow={1} justifyContent="center" alignItems="center" width="100%">
      <text fg={theme.muted}>{message}</text>
    </box>
  );
}

function PanelError({ error }: { error: Error }) {
  const theme = useTheme();
  return (
    <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center" width="100%" gap={1}>
      <text fg={theme.error}>{truncateRight(error.message, 60)}</text>
      <text fg={theme.muted}>Press R to retry</text>
    </box>
  );
}

function DashboardPanelInner(props: DashboardPanelProps) {
  const theme = useTheme();
  const borderColor = props.focused ? theme.primary : theme.border;
  let body: React.ReactNode;

  if (props.loading) {
    body = <PanelLoading />;
  } else if (props.error) {
    body = <PanelError error={props.error} />;
  } else {
    const hasChildren = React.Children.count(props.children) > 0;
    if (!hasChildren) {
      body = <PanelEmpty message={props.emptyMessage} />;
    } else {
      body = <scrollbox flexGrow={1}>{props.children}</scrollbox>;
    }
  }

  const titleMaxWidth = 60;

  return (
    <box flexDirection="column" flexGrow={1} border={true} borderColor={borderColor} width="100%">
      <PanelTitle title={props.title} index={props.index} total={props.total} isCompact={props.isCompact} maxWidth={titleMaxWidth} />
      {props.filterActive ? (
        <FilterBar filterQuery={props.filterQuery} onFilterChange={props.onFilterChange} onFilterSubmit={props.onFilterSubmit} matchCount={props.matchCount} focused={props.focused} />
      ) : null}
      {body}
    </box>
  );
}

export function DashboardPanel(props: DashboardPanelProps) {
  return (
    <PanelErrorBoundary panelTitle={props.title} onRetry={props.onRetry}>
      <DashboardPanelInner {...props} />
    </PanelErrorBoundary>
  );
}
```

### Step 3: Create Barrel Export
**File:** `apps/tui/src/screens/Dashboard/components.ts`

```typescript
export { DashboardPanel } from "./DashboardPanel.js";
export type { DashboardPanelProps } from "./DashboardPanel.js";
export { PanelErrorBoundary } from "./PanelErrorBoundary.js";
```

### Step 4: Wire Panels into the Dashboard Screen
**File:** `apps/tui/src/screens/Dashboard/index.tsx`

Update the existing scaffolded screen to instantiate four `DashboardPanel` components. Include state for focus and filtering, keyboard navigation, and responsive layouts.

```tsx
import React, { useState, useCallback } from "react";
import type { ScreenComponentProps } from "../../router/types.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { useKeyboard } from "../../hooks/useKeyboard.js";
import { useLayout } from "../../hooks/useLayout.js";
import { DashboardPanel } from "./components.js";
import type { KeyHandler } from "../../providers/keybinding-types.js";
import type { StatusBarHint } from "../../hooks/useStatusBarHints.js";

const PANEL_TITLES = ["Recent Repositories", "Organizations", "Starred Repositories", "Activity Feed"] as const;
const PANEL_EMPTY_MESSAGES = ["No recent repositories", "No organizations", "No starred repositories", "No recent activity"] as const;
const TOTAL_PANELS = PANEL_TITLES.length;

const keybindings: KeyHandler[] = [
  { key: "r", description: "Repositories", group: "Navigation", handler: () => {} },
];

const statusBarHints: StatusBarHint[] = [
  { keys: "g", label: "go-to", order: 0 },
  { keys: "Tab", label: "panel", order: 5 },
  { keys: "/", label: "filter", order: 7 },
  { keys: ":", label: "command", order: 10 },
  { keys: "?", label: "help", order: 20 },
];

export function DashboardScreen({ entry, params }: ScreenComponentProps) {
  const layout = useLayout();
  const [focusedPanel, setFocusedPanel] = useState(0);
  const [filterStates, setFilterStates] = useState(PANEL_TITLES.map(() => ({ active: false, query: "" })));
  const isCompact = layout.breakpoint === "minimum";

  useScreenKeybindings(keybindings, statusBarHints);

  useKeyboard((event) => {
    if (event.key === "Tab" && !event.shift) {
      setFocusedPanel((prev) => (prev + 1) % TOTAL_PANELS);
      return;
    }
    if (event.key === "Tab" && event.shift) {
      setFocusedPanel((prev) => (prev - 1 + TOTAL_PANELS) % TOTAL_PANELS);
      return;
    }
    if (event.key === "/" && !filterStates[focusedPanel].active) {
      setFilterStates((prev) => prev.map((s, i) => (i === focusedPanel ? { ...s, active: true } : s)));
      return;
    }
    if (event.key === "Escape" && filterStates[focusedPanel].active) {
      setFilterStates((prev) => prev.map((s, i) => (i === focusedPanel ? { active: false, query: "" } : s)));
      return;
    }
  });

  const makeFilterChange = useCallback((index: number) => (query: string) => {
    setFilterStates((prev) => prev.map((s, i) => (i === index ? { ...s, query } : s)));
  }, []);

  const makeFilterClose = useCallback((index: number) => () => {
    setFilterStates((prev) => prev.map((s, i) => (i === index ? { active: false, query: "" } : s)));
  }, []);

  const makeFilterSubmit = useCallback((index: number) => () => {
    setFilterStates((prev) => prev.map((s, i) => (i === index ? { ...s, active: false } : s)));
  }, []);

  const renderPanel = (index: number) => (
    <DashboardPanel
      key={index}
      title={PANEL_TITLES[index]}
      focused={focusedPanel === index}
      index={index}
      total={TOTAL_PANELS}
      isCompact={isCompact}
      loading={false}
      error={null}
      emptyMessage={PANEL_EMPTY_MESSAGES[index]}
      onRetry={() => {}}
      filterActive={filterStates[index].active}
      filterQuery={filterStates[index].query}
      onFilterChange={makeFilterChange(index)}
      onFilterClose={makeFilterClose(index)}
      onFilterSubmit={makeFilterSubmit(index)}
    >
      {null}
    </DashboardPanel>
  );

  return (
    <box flexDirection="column" width="100%" height="100%">
      {isCompact ? (
        <box flexDirection="column" flexGrow={1}>
          {PANEL_TITLES.map((_, i) => renderPanel(i))}
        </box>
      ) : (
        <box flexDirection="column" flexGrow={1}>
          <box flexDirection="row" flexGrow={1}>
            {renderPanel(0)}
            {renderPanel(1)}
          </box>
          <box flexDirection="row" flexGrow={1}>
            {renderPanel(2)}
            {renderPanel(3)}
          </box>
        </box>
      )}
    </box>
  );
}
```

### Step 5: Implement E2E Tests
**File:** `e2e/tui/dashboard.test.ts`

Update existing tests and add integration/behavioral tests using `@microsoft/tui-test`. Ensure testing covers rendering, keyboard navigation, compact view behaviors, filters, and error boundaries.

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, type TUITestInstance, TERMINAL_SIZES, createMockAPIEnv } from "./helpers";

let terminal: TUITestInstance;

afterEach(async () => {
  if (terminal) {
    await terminal.terminate();
  }
});

describe("TUI_DASHBOARD — DashboardPanel component", () => {
  describe("panel rendering", () => {
    test("SNAP-PANEL-001: Dashboard renders four panel titles at 120x40", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repositories");
      await terminal.waitForText("Organizations");
      await terminal.waitForText("Starred Repositories");
      await terminal.waitForText("Activity Feed");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("SNAP-PANEL-004: Panels show empty state messages when no data", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
      await terminal.waitForText("No recent repositories");
      await terminal.waitForText("No organizations");
    });
  });

  describe("compact mode (minimum breakpoint)", () => {
    test("SNAP-PANEL-010: Compact mode shows position indicators in titles", async () => {
      terminal = await launchTUI({ cols: 80, rows: 24, env: createMockAPIEnv() });
      await terminal.waitForText("[1/4]");
      await terminal.waitForText("[2/4]");
    });
  });

  describe("panel focus navigation", () => {
    test("KEY-PANEL-001: Tab cycles focus to next panel", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repositories");
      const snap1 = terminal.snapshot();
      await terminal.sendKeys("Tab");
      const snap2 = terminal.snapshot();
      expect(snap1).not.toBe(snap2);
    });
  });

  describe("inline filter", () => {
    test("KEY-PANEL-010: / activates filter input on focused panel", async () => {
      terminal = await launchTUI({ cols: 120, rows: 40, env: createMockAPIEnv() });
      await terminal.waitForText("Recent Repositories");
      await terminal.sendKeys("/");
      await terminal.waitForText("Filter…");
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  describe("module structure", () => {
    test("INT-PANEL-001: Components export properly", async () => {
      const mod = await import("../../apps/tui/src/screens/Dashboard/components.js");
      expect(mod.DashboardPanel).toBeDefined();
      expect(mod.PanelErrorBoundary).toBeDefined();
    });
  });
});
```
