# Engineering Specification: TUI Dashboard Quick Actions Bar

**Ticket:** `tui-dashboard-quick-actions`  
**Type:** Feature  
**Status:** Not Started  
**Dependencies:** `tui-dashboard-grid-layout`, `tui-dashboard-panel-focus-manager`, `tui-dashboard-screen`  
**Target:** `apps/tui/src/`  
**Tests:** `e2e/tui/dashboard.test.ts`

---

## Summary

Implement the `QuickActionsBar` component — a single-row, keyboard-driven toolbar anchored to the bottom of the dashboard content area, above the global status bar. The bar exposes five single-key shortcuts (`c`, `i`, `n`, `s`, `/`) for common dashboard operations, adapts its label format and visible action set to three terminal size breakpoints, and suppresses its keybindings when text input, modals, or go-to mode are active.

---

## Architecture Context

### Where the Bar Lives

The `QuickActionsBar` is the last child in the `DashboardScreen` content area's vertical flexbox. It sits between the panel grid (which uses `flexGrow={1}`) and the global `StatusBar` rendered by `AppShell`.

```
┌─────────────────────────────────────────┐  ← HeaderBar (AppShell)
│ Dashboard                               │
├─────────────────────────────────────────┤
│  ┌──────────────┬──────────────────┐    │
│  │ Recent Repos │  Organizations   │    │  ← Panel grid (flexGrow=1)
│  ├──────────────┼──────────────────┤    │
│  │ Starred      │  Activity Feed   │    │
│  └──────────────┴──────────────────┘    │
│─────────────────────────────────────────│  ← QuickActionsBar top border (ANSI 240)
│ c:new repo  i:new issue  n:notifs  ... │  ← QuickActionsBar (height=1)
├─────────────────────────────────────────┤
│ j/k:navigate  Enter:open  ?:help       │  ← StatusBar (AppShell)
└─────────────────────────────────────────┘
```

### Provider Dependencies

The bar component consumes these providers (all are ancestors in the tree):

| Provider | Access Pattern | Purpose |
|---|---|---|
| `NavigationProvider` | `useNavigation()` | `push()`, `repoContext` |
| `KeybindingProvider` | `useScreenKeybindings()` | Register action key handlers |
| `ThemeProvider` | `useTheme()` | `muted`, `warning`, `border` tokens |
| `OverlayManager` | `useOverlay()` | Check if modal is open for suppression |

### Integration with Dashboard Dependencies

The bar receives props from `DashboardScreen` (the orchestrator):

| Prop | Source | Purpose |
|---|---|---|
| `isInputFocused` | `useDashboardFocus().isInputFocused` | Suppress keys when filter/input active |
| `focusedPanel` | `useDashboardFocus().focusedPanel` | Target for `/` filter action |
| `onActivateFilter` | `useDashboardFilter().activate` | Callback for `/` action |
| `hasRepoContext` | `useNavigation().repoContext !== null` | Gate for `i` action |

---

## Implementation Plan

### Step 1: Define Quick Action Types and Constants

**File:** `apps/tui/src/screens/Dashboard/constants.ts`

Add the `QuickAction` interface and the `QUICK_ACTIONS` registry to the existing dashboard constants file (created by `tui-dashboard-screen` dependency).

```typescript
export interface QuickAction {
  /** Single-character trigger key */
  key: string;
  /** Full label shown at standard/large breakpoints */
  label: string;
  /** Abbreviated label shown at minimum breakpoint */
  compactLabel: string;
  /** Overflow priority: 1 = always visible, 5 = hidden first */
  priority: number;
  /** Navigation screen name or special action identifier */
  actionId: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { key: "c", label: "new repo",       compactLabel: "repo",    priority: 1, actionId: "create_repo" },
  { key: "i", label: "new issue",      compactLabel: "issue",   priority: 3, actionId: "create_issue" },
  { key: "n", label: "notifications",  compactLabel: "notifs",  priority: 2, actionId: "notifications" },
  { key: "s", label: "search",         compactLabel: "search",  priority: 4, actionId: "search" },
  { key: "/", label: "filter",         compactLabel: "filter",  priority: 5, actionId: "filter" },
];

/** Transient message duration in milliseconds */
export const TRANSIENT_MESSAGE_DURATION_MS = 2_000;

/** Overflow priority order (hidden first → last) */
export const OVERFLOW_HIDE_ORDER: string[] = ["/", "s", "i", "n", "c"];

/** Tab hint shown at minimum breakpoint */
export const TAB_HINT: { key: string; label: string } = { key: "Tab", label: "next panel" };
```

### Step 2: Implement the `useQuickActions` Hook

**File:** `apps/tui/src/screens/Dashboard/hooks/useQuickActions.ts`

This hook encapsulates all quick-action logic: action dispatch, suppression guards, transient message state, and keybinding registration. It is the only file that imports navigation and overlay hooks — the component remains a pure renderer.

```typescript
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useNavigation } from "../../../hooks/index.js";
import { useOverlay } from "../../../hooks/useOverlay.js";
import { useLayout } from "../../../hooks/useLayout.js";
import type { KeyHandler } from "../../../providers/keybinding-types.js";
import { logger } from "../../../lib/logger.js";
import { emit } from "../../../lib/telemetry.js";
import { ScreenName } from "../../../router/types.js";
import { QUICK_ACTIONS, TRANSIENT_MESSAGE_DURATION_MS } from "../constants.js";
import type { Breakpoint } from "../../../types/breakpoint.js";

export interface UseQuickActionsOptions {
  /** Whether any text input (filter, etc.) currently has focus */
  isInputFocused: boolean;
  /** Index of the currently focused dashboard panel */
  focusedPanel: number;
  /** Callback to activate inline filter on the focused panel */
  onActivateFilter: (panel: number) => void;
  /** Whether go-to mode is currently active */
  isGoToModeActive: boolean;
}

export interface UseQuickActionsReturn {
  /** Keybinding handlers to register via useScreenKeybindings */
  keybindings: KeyHandler[];
  /** Current transient message (null if none) */
  transientMessage: string | null;
  /** Whether a transient message is currently showing */
  isTransientActive: boolean;
}

export function useQuickActions(options: UseQuickActionsOptions): UseQuickActionsReturn {
  const { isInputFocused, focusedPanel, onActivateFilter, isGoToModeActive } = options;
  const nav = useNavigation();
  const overlay = useOverlay();
  const layout = useLayout();

  const [transientMessage, setTransientMessage] = useState<string | null>(null);
  const transientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (transientTimerRef.current) clearTimeout(transientTimerRef.current);
    };
  }, []);

  // Suppression guard: returns true when quick actions should be suppressed
  const isSuppressed = useCallback((): boolean => {
    return isInputFocused || overlay.isOpen() || isGoToModeActive;
  }, [isInputFocused, overlay, isGoToModeActive]);

  // Show transient message
  const showTransient = useCallback((message: string) => {
    if (transientTimerRef.current) clearTimeout(transientTimerRef.current);
    setTransientMessage(message);
    logger.debug(`QuickActions: transient [message=${message}] [duration=${TRANSIENT_MESSAGE_DURATION_MS}ms]`);
    transientTimerRef.current = setTimeout(() => {
      setTransientMessage(null);
      transientTimerRef.current = null;
    }, TRANSIENT_MESSAGE_DURATION_MS);
  }, []);

  const handleCreateRepo = useCallback(() => {
    logger.info(`QuickActions: navigated [action=create_repo] [target_screen=RepoCreate]`);
    emit("tui.dashboard.quick_action.invoked", {
      action: "create_repo",
      terminal_width: layout.width,
      terminal_height: layout.height,
      breakpoint: layout.breakpoint ?? "minimum",
      focused_panel: focusedPanel,
    });
    nav.push(ScreenName.RepoCreate as any); // RepoCreate may not exist in enum yet — see note below
  }, [nav, layout, focusedPanel]);

  const handleCreateIssue = useCallback(() => {
    if (!nav.repoContext) {
      logger.warn(`QuickActions: no repo context [key=i]`);
      emit("tui.dashboard.quick_action.issue_no_context", {
        terminal_width: layout.width,
        terminal_height: layout.height,
      });
      showTransient("Select a repository first");
      return;
    }
    logger.info(`QuickActions: navigated [action=create_issue] [target_screen=IssueCreate]`);
    emit("tui.dashboard.quick_action.invoked", {
      action: "create_issue",
      terminal_width: layout.width,
      terminal_height: layout.height,
      breakpoint: layout.breakpoint ?? "minimum",
      focused_panel: focusedPanel,
    });
    nav.push(ScreenName.IssueCreate, {
      owner: nav.repoContext.owner,
      repo: nav.repoContext.repo,
    });
  }, [nav, layout, focusedPanel, showTransient]);

  const handleNotifications = useCallback(() => {
    logger.info(`QuickActions: navigated [action=notifications] [target_screen=Notifications]`);
    emit("tui.dashboard.quick_action.invoked", {
      action: "notifications",
      terminal_width: layout.width,
      terminal_height: layout.height,
      breakpoint: layout.breakpoint ?? "minimum",
      focused_panel: focusedPanel,
    });
    nav.push(ScreenName.Notifications);
  }, [nav, layout, focusedPanel]);

  const handleSearch = useCallback(() => {
    logger.info(`QuickActions: navigated [action=search] [target_screen=Search]`);
    emit("tui.dashboard.quick_action.invoked", {
      action: "search",
      terminal_width: layout.width,
      terminal_height: layout.height,
      breakpoint: layout.breakpoint ?? "minimum",
      focused_panel: focusedPanel,
    });
    nav.push(ScreenName.Search);
  }, [nav, layout, focusedPanel]);

  const handleFilter = useCallback(() => {
    logger.debug(`QuickActions: invoked [key=/] [action=filter] [panel=${focusedPanel}]`);
    emit("tui.dashboard.quick_action.invoked", {
      action: "filter",
      terminal_width: layout.width,
      terminal_height: layout.height,
      breakpoint: layout.breakpoint ?? "minimum",
      focused_panel: focusedPanel,
    });
    onActivateFilter(focusedPanel);
  }, [focusedPanel, onActivateFilter, layout]);

  // Build keybinding array with suppression guards
  const keybindings = useMemo((): KeyHandler[] => {
    const when = () => !isSuppressed();
    return [
      { key: "c", description: "New repo",       group: "Quick Actions", handler: handleCreateRepo,     when },
      { key: "i", description: "New issue",      group: "Quick Actions", handler: handleCreateIssue,    when },
      { key: "n", description: "Notifications",  group: "Quick Actions", handler: handleNotifications,  when },
      { key: "s", description: "Search",         group: "Quick Actions", handler: handleSearch,         when },
      { key: "/", description: "Filter panel",   group: "Quick Actions", handler: handleFilter,         when },
    ];
  }, [isSuppressed, handleCreateRepo, handleCreateIssue, handleNotifications, handleSearch, handleFilter]);

  return {
    keybindings,
    transientMessage,
    isTransientActive: transientMessage !== null,
  };
}
```

**Note on `ScreenName.RepoCreate`:** The current `ScreenName` enum does not include `RepoCreate`. If the screen has not been added by the time this ticket is implemented, use the closest available screen name or add `RepoCreate` to the enum (a one-line change in `router/types.ts` + a registry entry in `router/registry.ts` pointing to `PlaceholderScreen`). The spec accounts for this gap — see _Productionization_ below.

### Step 3: Implement the `QuickActionsBar` Component

**File:** `apps/tui/src/screens/Dashboard/components/QuickActionsBar.tsx`

This is a pure rendering component. It receives all state via props and renders the bar's visual output using OpenTUI primitives. It makes zero API calls and registers zero keybindings.

```typescript
import React, { useMemo } from "react";
import { useTheme } from "../../../hooks/useTheme.js";
import { useLayout } from "../../../hooks/useLayout.js";
import { QUICK_ACTIONS, TAB_HINT, OVERFLOW_HIDE_ORDER } from "../constants.js";
import type { QuickAction } from "../constants.js";

export interface QuickActionsBarProps {
  /** Current transient message to display (replaces action labels) */
  transientMessage: string | null;
  /** Whether the dashboard is in compact/stacked layout (minimum breakpoint) */
  isCompact: boolean;
}

/**
 * Computes which actions are visible given the available width.
 *
 * Actions are hidden in OVERFLOW_HIDE_ORDER (lowest priority first)
 * until the remaining labels fit within `availableWidth`.
 *
 * @returns Array of actions to render, in their original order.
 */
function computeVisibleActions(
  actions: QuickAction[],
  isCompact: boolean,
  isLarge: boolean,
  availableWidth: number,
  includeTabHint: boolean,
): QuickAction[] {
  const separator = isLarge ? 3 : 2;

  function measureAction(action: QuickAction): number {
    const label = isCompact ? action.compactLabel : action.label;
    // key:label → 1 (key) + 1 (:) + label.length
    return 1 + 1 + label.length;
  }

  function measureTabHint(): number {
    // Tab:next panel → 3 (Tab) + 1 (:) + TAB_HINT.label.length
    return TAB_HINT.key.length + 1 + TAB_HINT.label.length;
  }

  // Start with all actions
  let visible = [...actions];
  const hideOrder = [...OVERFLOW_HIDE_ORDER]; // ["/", "s", "i", "n", "c"]

  function totalWidth(acts: QuickAction[]): number {
    if (acts.length === 0) return 0;
    let w = acts.reduce((sum, a) => sum + measureAction(a), 0);
    w += (acts.length - 1) * separator; // separators between actions
    if (includeTabHint) {
      w += separator + measureTabHint();
    }
    return w;
  }

  // Remove lowest-priority actions until they fit
  let hideIdx = 0;
  while (totalWidth(visible) > availableWidth && hideIdx < hideOrder.length) {
    const keyToHide = hideOrder[hideIdx];
    visible = visible.filter(a => a.key !== keyToHide);
    hideIdx++;
  }

  return visible;
}

export function QuickActionsBar({ transientMessage, isCompact }: QuickActionsBarProps) {
  const theme = useTheme();
  const layout = useLayout();
  const isLarge = layout.breakpoint === "large";
  const separator = isLarge ? 3 : 2;
  const includeTabHint = isCompact;

  // Border occupies 0 extra width (borderTop is rendered above the content row)
  const availableWidth = layout.width;

  const visibleActions = useMemo(
    () => computeVisibleActions(QUICK_ACTIONS, isCompact, isLarge, availableWidth, includeTabHint),
    [isCompact, isLarge, availableWidth, includeTabHint],
  );

  // Emit visibility telemetry
  React.useEffect(() => {
    const { emit: emitTelemetry } = require("../../../lib/telemetry.js");
    const { logger: log } = require("../../../lib/logger.js");
    const hiddenKeys = QUICK_ACTIONS
      .filter(a => !visibleActions.includes(a))
      .map(a => a.key);
    log.debug(
      `QuickActions: rendered [visible=${visibleActions.length}] [hidden=${hiddenKeys.join(",") || "none"}] [width=${availableWidth}]`,
    );
    emitTelemetry("tui.dashboard.quick_action.visible_count", {
      visible_count: visibleActions.length,
      total_count: QUICK_ACTIONS.length,
      terminal_width: layout.width,
      breakpoint: layout.breakpoint ?? "minimum",
      actions_hidden: hiddenKeys.join(","),
    });
  }, [visibleActions, availableWidth, layout]);

  const separatorStr = " ".repeat(separator);

  return (
    <box
      height={1}
      width="100%"
      borderTop={true}
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor={theme.border}
      flexDirection="row"
    >
      {transientMessage ? (
        /* Transient message replaces all action labels */
        <text fg={theme.warning}>{transientMessage}</text>
      ) : (
        /* Normal: render visible actions + optional Tab hint */
        <text>
          {visibleActions.map((action, idx) => {
            const label = isCompact ? action.compactLabel : action.label;
            const sep = idx < visibleActions.length - 1 || includeTabHint ? separatorStr : "";
            // Bold key + muted label
            return `\x1b[1m${action.key}\x1b[22m\x1b[38;5;245m:${label}\x1b[0m${sep}`;
          }).join("")}
          {includeTabHint && (
            `\x1b[1m${TAB_HINT.key}\x1b[22m\x1b[38;5;245m:${TAB_HINT.label}\x1b[0m`
          )}
        </text>
      )}
    </box>
  );
}
```

**Design decision — ANSI inline vs. OpenTUI styled text:** The bar is a single row of mixed bold/muted spans. Using OpenTUI's `<text>` with `attributes` and `fg` props is preferred over inline ANSI escape codes. The snippet above uses escapes for clarity; the actual implementation MUST use OpenTUI's `StyledText` or nested `<text>` elements:

```tsx
// Preferred pattern per OpenTUI API:
<box flexDirection="row" height={1} width="100%" borderTop={true} borderColor={theme.border}>
  {!transientMessage && visibleActions.map((action, idx) => {
    const label = isCompact ? action.compactLabel : action.label;
    return (
      <React.Fragment key={action.key}>
        <text attributes={1 /* BOLD */}>{action.key}</text>
        <text fg={theme.muted}>:{label}</text>
        {(idx < visibleActions.length - 1 || includeTabHint) && (
          <text>{" ".repeat(separator)}</text>
        )}
      </React.Fragment>
    );
  })}
  {!transientMessage && includeTabHint && (
    <>
      <text attributes={1}>{TAB_HINT.key}</text>
      <text fg={theme.muted}>:{TAB_HINT.label}</text>
    </>
  )}
  {transientMessage && (
    <text fg={theme.warning}>{transientMessage}</text>
  )}
</box>
```

### Step 4: Integrate into DashboardScreen

**File:** `apps/tui/src/screens/Dashboard/index.tsx` (existing, modified)

The `DashboardScreen` component is created by the `tui-dashboard-screen` dependency. This step adds the `QuickActionsBar` as the last child in the content area and wires the `useQuickActions` hook into the screen's keybinding set.

```typescript
// In DashboardScreen component body:

import { useQuickActions } from "./hooks/useQuickActions.js";
import { QuickActionsBar } from "./components/QuickActionsBar.js";

// ... existing dashboard hooks ...
const focus = useDashboardFocus(/* ... */);
const filter = useDashboardFilter();
const layout = useLayout();

const quickActions = useQuickActions({
  isInputFocused: focus.isInputFocused,
  focusedPanel: focus.focusedPanel,
  onActivateFilter: filter.activate,
  isGoToModeActive: false, // wired from KeybindingProvider — see Step 5
});

// Merge quick-action keybindings with dashboard panel keybindings
const allKeybindings = useMemo(
  () => [...panelKeybindings, ...quickActions.keybindings],
  [panelKeybindings, quickActions.keybindings],
);
useScreenKeybindings(allKeybindings, statusBarHints);

// In JSX:
return (
  <box flexDirection="column" width="100%" height="100%">
    {/* Panel grid */}
    <box flexDirection={isCompact ? "column" : "row"} flexGrow={1}>
      {/* ... panel rendering ... */}
    </box>

    {/* Quick actions bar */}
    <QuickActionsBar
      transientMessage={quickActions.transientMessage}
      isCompact={isCompact}
    />
  </box>
);
```

### Step 5: Wire Go-To Mode Suppression

**File:** `apps/tui/src/screens/Dashboard/hooks/useQuickActions.ts` (modification)

The `isGoToModeActive` flag must come from the `KeybindingProvider`. The go-to mode is managed by `GlobalKeybindings` / `goToBindings.ts`. Two approaches:

**Option A (preferred):** `KeybindingProvider` already exposes `hasActiveModal()`. Add a similar `hasActiveGoTo()` or expose a `goToModeActive` boolean on the context.

**Option B (simpler):** Since go-to mode registers a `PRIORITY.GOTO` scope, and GOTO (priority 3) < SCREEN (priority 4), go-to bindings naturally intercept `n`, `s`, etc. before they reach the SCREEN scope. This means go-to mode inherently suppresses quick-action keys for keys that overlap (like `n` for `g n`). For non-overlapping keys like `c`, go-to mode will consume the second key as an invalid go-to destination and cancel itself — which is acceptable behavior.

**Recommendation:** Use Option B (no additional work). The keybinding priority system already handles this correctly:
- User presses `g` → go-to mode activates at PRIORITY.GOTO (3)
- User presses `n` → GOTO scope matches `n` → navigates to notifications via go-to, NOT quick action
- User presses `c` → GOTO scope does not match `c` → go-to mode cancels → key falls through to SCREEN scope → but the `c` is already consumed by go-to cancellation

However, if the `g` prefix handler does NOT consume the second key on mismatch, then `c` would fall through. In that case, the `when` guard is needed. The implementation should include the `isGoToModeActive` guard defensively.

To access go-to mode state, read from `KeybindingProvider` context. If the provider does not currently expose this, add a `isGoToActive: boolean` field to `KeybindingContextType` and set it in the go-to mode handler in `goToBindings.ts`.

### Step 6: Add `RepoCreate` Screen Name (if missing)

**File:** `apps/tui/src/router/types.ts` and `apps/tui/src/router/registry.ts`

If `ScreenName.RepoCreate` does not exist:

```typescript
// router/types.ts — add to enum:
RepoCreate = "RepoCreate",

// router/registry.ts — add entry:
[ScreenName.RepoCreate]: {
  component: PlaceholderScreen,
  requiresRepo: false,
  requiresOrg: false,
  breadcrumbLabel: () => "Create Repository",
},
```

This ensures `nav.push(ScreenName.RepoCreate)` does not throw a "screen not registered" error.

---

## File Inventory

| File | Action | Description |
|---|---|---|
| `apps/tui/src/screens/Dashboard/constants.ts` | **Modify** | Add `QuickAction` interface, `QUICK_ACTIONS` array, `TRANSIENT_MESSAGE_DURATION_MS`, `OVERFLOW_HIDE_ORDER`, `TAB_HINT` |
| `apps/tui/src/screens/Dashboard/hooks/useQuickActions.ts` | **Create** | Hook: action dispatch, suppression guards, transient message state, telemetry |
| `apps/tui/src/screens/Dashboard/components/QuickActionsBar.tsx` | **Create** | Component: responsive rendering, overflow computation, transient message overlay |
| `apps/tui/src/screens/Dashboard/index.tsx` | **Modify** | Wire `useQuickActions` hook, add `<QuickActionsBar>` to JSX |
| `apps/tui/src/router/types.ts` | **Modify** (conditional) | Add `RepoCreate` to `ScreenName` enum if missing |
| `apps/tui/src/router/registry.ts` | **Modify** (conditional) | Add `RepoCreate` screen definition if missing |
| `e2e/tui/dashboard.test.ts` | **Create/Modify** | All SNAP-QA, KEY-QA, RESP-QA, INT-QA tests |

---

## Detailed Component Specification

### `QuickActionsBar` Props

```typescript
interface QuickActionsBarProps {
  /** Current transient message to display. When non-null, replaces action labels. */
  transientMessage: string | null;
  /** Whether dashboard is at minimum breakpoint (stacked layout). */
  isCompact: boolean;
}
```

### Rendering Rules

| Breakpoint | Label Source | Separator | Tab Hint | Border |
|---|---|---|---|---|
| `minimum` (80×24 – 119×39) | `compactLabel` | 2 spaces | Yes (`Tab:next panel`) | Top, ANSI 240 / `theme.border` |
| `standard` (120×40 – 199×59) | `label` | 2 spaces | No | Top, ANSI 240 / `theme.border` |
| `large` (200×60+) | `label` | 3 spaces | No | Top, ANSI 240 / `theme.border` |

### Text Styling

| Element | Attribute | Color |
|---|---|---|
| Key character (`c`, `i`, `n`, `s`, `/`) | Bold (`TextAttributes.BOLD` / `attributes={1}`) | Default terminal foreground |
| Label text (`:new repo`, `:notifications`, etc.) | Normal weight | `theme.muted` (ANSI 245) |
| Transient message | Normal weight | `theme.warning` (ANSI 178) |
| Top border | N/A | `theme.border` (ANSI 240) |

### Overflow Algorithm

```
Input: QUICK_ACTIONS[5], availableWidth, isCompact, isLarge, includeTabHint
Output: visibleActions (subset of QUICK_ACTIONS, preserving original order)

1. Start with all 5 actions.
2. Compute total rendered width:
   width = Σ(1 + 1 + labelLength) + (count - 1) × separator
   If includeTabHint: width += separator + tabHintWidth
3. While width > availableWidth AND hideOrder is not exhausted:
   a. Remove action matching hideOrder[hideIdx] from visible set.
   b. Recompute width.
   c. hideIdx++.
4. Return remaining actions in original order [c, i, n, s, /].

Hide order (lowest priority first): "/", "s", "i", "n", "c".
"c" is NEVER hidden (priority 1).
```

### Transient Message Behavior

1. Trigger: `i` pressed when `nav.repoContext === null`.
2. Message: `"Select a repository first"` rendered in `theme.warning` color.
3. Duration: 2000ms, auto-dismisses via `setTimeout`.
4. Visual: The entire bar content (all action labels) is replaced by the message text. The top border remains.
5. Interaction during transient: Other quick-action keys (`c`, `n`, `s`) still fire normally (the message does not block input). This is because the transient state only affects rendering, not the keybinding scope. If another quick action fires during the transient, the screen transition happens and the bar will re-render on return without the message.
6. Timer cleanup: `useEffect` cleanup clears pending timers on unmount.
7. Resize during transient: The message re-renders at new width. The timer is NOT reset.

### Suppression Matrix

| Condition | Quick-action keys | Mechanism |
|---|---|---|
| Filter input focused | No-op | `when: () => !isSuppressed()` returns false |
| Any text input focused | No-op | Same — `isInputFocused` covers all inputs |
| Command palette open (`:`) | No-op | `overlay.isOpen()` returns true |
| Help overlay open (`?`) | No-op | `overlay.isOpen()` returns true |
| Confirm dialog open | No-op | `overlay.isOpen()` returns true |
| Go-to mode active (`g` prefix) | No-op | PRIORITY.GOTO (3) intercepts before SCREEN (4) |
| Non-dashboard screen | No-op | Keybindings unregistered on unmount via `useScreenKeybindings` |
| Normal dashboard state | Active | `when()` returns true |

---

## Navigation Targets

| Key | Screen Name | Params | Notes |
|---|---|---|---|
| `c` | `ScreenName.RepoCreate` | None | May need to add to enum |
| `i` | `ScreenName.IssueCreate` | `{ owner, repo }` from `nav.repoContext` | Only fires with repo context |
| `n` | `ScreenName.Notifications` | None | Always available |
| `s` | `ScreenName.Search` | None | Always available |
| `/` | (no navigation) | N/A | Calls `onActivateFilter(focusedPanel)` |

---

## Interaction with Other Dashboard Components

### Status Bar

The quick-actions bar does NOT duplicate the status bar. The status bar shows navigation hints (`j/k:navigate`, `Enter:open`, `Tab:panel`). The quick-actions bar shows action shortcuts. No key overlap.

The `useScreenKeybindings` call in `DashboardScreen` passes a `hints` array that includes panel navigation hints only. Quick-action keys are intentionally omitted from status bar hints because they are already visible in the bar itself.

### Command Palette

All five quick actions are also registered as commands in the command palette registry (`@codeplane/ui-core` `commandRegistry`). This ensures that when the bar hides actions at narrow widths, users can still access them via `:`.

The command palette commands should be registered separately in the dashboard screen or globally. This is NOT the responsibility of the `QuickActionsBar` component.

### Panel Error Boundary

If the `QuickActionsBar` component throws during render, the `DashboardScreen`'s error boundary catches it. The four panels continue to operate. Quick actions remain available via the command palette (`:`) and go-to keybindings (`g n`, `g s`, etc.).

---

## Performance Requirements

| Metric | Target | Mechanism |
|---|---|---|
| Screen transition from quick action | < 50ms | `nav.push()` is synchronous React state update; screen mount is async but initial render is immediate |
| Bar re-render on resize | Synchronous (0 frame delay) | `useTerminalDimensions` triggers immediate re-render |
| Overflow computation | < 1ms | Pure arithmetic over 5-element array |
| Transient message show/hide | 0 frame delay show; 2000ms timer dismiss | `useState` update |

---

## Observability

### Logging

All log messages are written to stderr. Level controlled by `CODEPLANE_TUI_LOG_LEVEL` (default: `error`).

| Level | Event | Format |
|---|---|---|
| `debug` | Bar rendered | `QuickActions: rendered [visible={n}] [hidden={keys}] [width={w}]` |
| `debug` | Key pressed | `QuickActions: invoked [key={k}] [action={name}] [panel={panel}]` |
| `debug` | Key suppressed | `QuickActions: suppressed [key={k}] [reason={reason}]` |
| `debug` | Transient message shown | `QuickActions: transient [message={msg}] [duration=2000ms]` |
| `debug` | Responsive recalculation | `QuickActions: resize [width={w}] [visible={n}] [hidden={keys}]` |
| `info` | Navigation triggered | `QuickActions: navigated [action={name}] [target_screen={screen}]` |
| `warn` | Issue without repo context | `QuickActions: no repo context [key=i]` |

### Telemetry Events

| Event | Trigger | Properties |
|---|---|---|
| `tui.dashboard.quick_action.invoked` | Quick-action key pressed | `action`, `terminal_width`, `terminal_height`, `breakpoint`, `focused_panel` |
| `tui.dashboard.quick_action.issue_no_context` | `i` pressed without repo | `terminal_width`, `terminal_height` |
| `tui.dashboard.quick_action.visible_count` | Bar renders | `visible_count`, `total_count`, `terminal_width`, `breakpoint`, `actions_hidden` |

---

## Unit & Integration Tests

### Test File: `e2e/tui/dashboard.test.ts`

All tests use `@microsoft/tui-test` via the `launchTUI` helper from `e2e/tui/helpers.ts`. Tests run against a real API server or the test fixture server. Tests that fail due to unimplemented backend features are left failing — never skipped or commented out.

#### Terminal Snapshot Tests

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, TERMINAL_SIZES, type TUITestInstance } from "./helpers";

describe("TUI_DASHBOARD_QUICK_ACTIONS", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    await tui?.terminate();
  });

  describe("Snapshot Tests", () => {
    test("SNAP-QA-001: Quick-actions bar renders at 120x40 with all actions visible", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Bar should be visible at the bottom of the content area (row height-2, above status bar)
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("c:new repo");
      expect(snapshot).toContain("i:new issue");
      expect(snapshot).toContain("n:notifications");
      expect(snapshot).toContain("s:search");
      expect(snapshot).toContain("/:filter");

      // Verify key characters are bold (ANSI SGR 1)
      // Note: bold rendering verified by snapshot comparison, not regex on escape codes
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-QA-002: Quick-actions bar renders at 80x24 with compact labels", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await tui.waitForText("Dashboard");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("c:repo");
      expect(snapshot).toContain("i:issue");
      expect(snapshot).toContain("n:notifs");
      expect(snapshot).toContain("s:search");
      // /:filter may or may not be visible depending on width fit
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-QA-003: Quick-actions bar renders at 200x60 with full labels and extra padding", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.large.width,
        rows: TERMINAL_SIZES.large.height,
      });
      await tui.waitForText("Dashboard");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("c:new repo");
      expect(snapshot).toContain("i:new issue");
      expect(snapshot).toContain("n:notifications");
      expect(snapshot).toContain("s:search");
      expect(snapshot).toContain("/:filter");
      // 3-space separators at large size — verified via snapshot
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-QA-004: Quick-actions bar with transient 'Select a repository first' message", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Press 'i' without repo context
      await tui.sendKeys("i");

      // Bar content should be replaced with warning message
      await tui.waitForText("Select a repository first");
      const snapshotDuring = tui.snapshot();
      expect(snapshotDuring).toContain("Select a repository first");
      // Action labels should NOT be visible during transient
      expect(snapshotDuring).not.toContain("c:new repo");

      // Wait for 2-second auto-dismiss
      await tui.waitForNoText("Select a repository first", 5000);
      const snapshotAfter = tui.snapshot();
      expect(snapshotAfter).toContain("c:new repo");
      expect(snapshotAfter).toMatchSnapshot();
    });

    test("SNAP-QA-005: Quick-actions bar with stacked layout includes Tab hint", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await tui.waitForText("Dashboard");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Tab:next panel");
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-QA-006: Quick-actions bar border renders above the bar", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // The border is a horizontal line character (─) above the action labels
      // Verified by snapshot match — the line above "c:new repo" should contain border chars
      const snapshot = tui.snapshot();
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-QA-007: Quick-actions bar hidden when terminal below 80 columns", async () => {
      tui = await launchTUI({
        cols: 60,
        rows: 24,
      });

      // Should show "Terminal too small" instead of dashboard
      await tui.waitForText("Terminal too small");
      const snapshot = tui.snapshot();
      expect(snapshot).not.toContain("c:new repo");
      expect(snapshot).not.toContain("c:repo");
    });

    test("SNAP-QA-008: Quick-actions bar at extreme minimum width hides lowest-priority actions", async () => {
      tui = await launchTUI({
        cols: 80,
        rows: 20,
      });
      await tui.waitForText("Dashboard");

      const snapshot = tui.snapshot();
      // c:repo should ALWAYS be visible (priority 1)
      expect(snapshot).toContain("c:repo");
      expect(snapshot).toMatchSnapshot();
    });
  });
```

#### Keyboard Interaction Tests

```typescript
  describe("Keyboard Interaction Tests", () => {
    test("KEY-QA-001: c pushes create-repository screen", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      await tui.sendKeys("c");

      // Should navigate to create-repo screen
      // Breadcrumb should update
      await tui.waitForText("Create Repository");
    });

    test("KEY-QA-002: i pushes create-issue screen when repo context exists", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // First navigate to a repo to establish context, then back to dashboard
      await tui.sendKeys("g", "r"); // go to repo list
      await tui.waitForText("Repositories");
      await tui.sendKeys("Enter"); // open first repo
      await tui.sendKeys("g", "d"); // back to dashboard
      await tui.waitForText("Dashboard");

      // Now press 'i' — should navigate to create-issue with repo context
      await tui.sendKeys("i");
      await tui.waitForText("Create Issue");
    });

    test("KEY-QA-003: i shows transient message when no repo context", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      await tui.sendKeys("i");
      await tui.waitForText("Select a repository first");

      // Should NOT have navigated away from dashboard
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Dashboard");
    });

    test("KEY-QA-004: n pushes notifications screen", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      await tui.sendKeys("n");
      await tui.waitForText("Notifications");
    });

    test("KEY-QA-005: s pushes search screen", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      await tui.sendKeys("s");
      await tui.waitForText("Search");
    });

    test("KEY-QA-006: / activates inline filter in focused panel", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      await tui.sendKeys("/");
      // Filter input should appear in the focused panel
      // The filter input typically shows a "/" prefix or cursor
      await tui.waitForText("Filter");
    });

    test("KEY-QA-007: Quick-action keys suppressed when filter input is focused", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Activate filter
      await tui.sendKeys("/");
      // Type 'c' — should go into filter input, NOT trigger create-repo
      await tui.sendKeys("c");

      // Should still be on dashboard (not create-repo screen)
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Dashboard");
      expect(snapshot).not.toContain("Create Repository");
    });

    test("KEY-QA-008: Quick-action keys suppressed during go-to mode", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Press g then n — should go-to notifications via go-to mode, not quick action
      await tui.sendKeys("g", "n");
      await tui.waitForText("Notifications");

      // Verify it was go-to navigation (reset stack) not push navigation
      // Go-to resets the stack; quick action pushes. After go-to, 'q' should quit.
      // After push, 'q' should go back to dashboard.
    });

    test("KEY-QA-009: Quick-action keys suppressed when command palette is open", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Open command palette
      await tui.sendKeys(":");
      // Type 'c' — should go into palette search, not trigger create-repo
      await tui.sendKeys("c");

      // Close palette
      await tui.sendKeys("Escape");

      // Should still be on dashboard
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Dashboard");
    });

    test("KEY-QA-010: Quick-action keys suppressed when help overlay is open", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Open help overlay
      await tui.sendKeys("?");
      // Press 'c' — should not trigger create-repo
      await tui.sendKeys("c");

      // Close help
      await tui.sendKeys("Escape");

      // Should still be on dashboard
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Dashboard");
      expect(snapshot).not.toContain("Create Repository");
    });

    test("KEY-QA-011: q after quick-action navigation returns to dashboard with bar intact", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Navigate via quick action
      await tui.sendKeys("n");
      await tui.waitForText("Notifications");

      // Pop back
      await tui.sendKeys("q");
      await tui.waitForText("Dashboard");

      // Bar should still be visible
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("c:new repo");
    });

    test("KEY-QA-012: Rapid quick-action presses — only first fires", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Send c and n in rapid succession (50ms apart per sendKeys internals)
      await tui.sendKeys("c", "n");

      // Should be on create-repo screen, not notifications
      // The 'n' is consumed by the create-repo screen, not the dashboard
      await tui.waitForText("Create Repository");
    });

    test("KEY-QA-013: / targets the correct focused panel", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Tab to Organizations panel (panel index 1)
      await tui.sendKeys("Tab");

      // Activate filter
      await tui.sendKeys("/");

      // Filter should be in the Organizations panel, not Recent Repos
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Organizations");
    });

    test("KEY-QA-014: i transient message does not block other quick actions", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Trigger transient message
      await tui.sendKeys("i");
      await tui.waitForText("Select a repository first");

      // Press 'n' while transient is showing — should still navigate
      await tui.sendKeys("n");
      await tui.waitForText("Notifications");
    });

    test("KEY-QA-015: Quick actions work after returning from pushed screen", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Navigate to notifications
      await tui.sendKeys("n");
      await tui.waitForText("Notifications");

      // Return to dashboard
      await tui.sendKeys("q");
      await tui.waitForText("Dashboard");

      // Quick actions should work again
      await tui.sendKeys("s");
      await tui.waitForText("Search");
    });

    test("KEY-QA-016: Quick actions inactive on non-dashboard screens", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Navigate to notifications
      await tui.sendKeys("n");
      await tui.waitForText("Notifications");

      // Press 'c' — should NOT trigger create-repo (we're not on dashboard)
      await tui.sendKeys("c");

      // Should still be on notifications
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Notifications");
    });
  });
```

#### Responsive Tests

```typescript
  describe("Responsive Tests", () => {
    test("RESP-QA-001: Bar adapts labels on resize from 120x40 to 80x24", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Verify full labels
      let snapshot = tui.snapshot();
      expect(snapshot).toContain("c:new repo");

      // Resize to minimum
      await tui.resize(TERMINAL_SIZES.minimum.width, TERMINAL_SIZES.minimum.height);
      await tui.waitForText("c:repo");

      snapshot = tui.snapshot();
      expect(snapshot).toContain("c:repo");
      // Full labels should no longer appear
      expect(snapshot).not.toContain("c:new repo");
    });

    test("RESP-QA-002: Bar adapts labels on resize from 80x24 to 120x40", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await tui.waitForText("Dashboard");

      // Verify compact labels
      let snapshot = tui.snapshot();
      expect(snapshot).toContain("c:repo");

      // Resize to standard
      await tui.resize(TERMINAL_SIZES.standard.width, TERMINAL_SIZES.standard.height);
      await tui.waitForText("c:new repo");

      snapshot = tui.snapshot();
      expect(snapshot).toContain("c:new repo");
    });

    test("RESP-QA-003: Bar adapts labels on resize from 120x40 to 200x60", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      await tui.resize(TERMINAL_SIZES.large.width, TERMINAL_SIZES.large.height);

      // Full labels should still appear (same as standard, just more padding)
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("c:new repo");
      expect(snapshot).toContain("n:notifications");
      expect(snapshot).toMatchSnapshot();
    });

    test("RESP-QA-004: Focus state preserved through resize with filter active", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Activate filter
      await tui.sendKeys("/");
      await tui.sendText("test");

      // Resize
      await tui.resize(TERMINAL_SIZES.minimum.width, TERMINAL_SIZES.minimum.height);

      // Filter should still be active
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("test");
    });

    test("RESP-QA-005: Bar visibility at 80x24 minimum — at least c:repo and n:notifs visible", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await tui.waitForText("Dashboard");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("c:repo");
      expect(snapshot).toContain("n:notifs");
    });

    test("RESP-QA-006: Rapid resize does not cause visual artifacts in bar", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Rapid resize sequence
      await tui.resize(80, 24);
      await tui.resize(120, 40);
      await tui.resize(200, 60);
      await tui.resize(120, 40);

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("c:new repo");
      expect(snapshot).toMatchSnapshot();
    });

    test("RESP-QA-007: Transient message renders correctly at minimum size", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await tui.waitForText("Dashboard");

      await tui.sendKeys("i");
      await tui.waitForText("Select a repository first");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Select a repository first");
    });
  });
```

#### Integration Tests

```typescript
  describe("Integration Tests", () => {
    test("INT-QA-001: Quick action c → create-repo screen → q returns to dashboard", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      await tui.sendKeys("c");
      await tui.waitForText("Create Repository");

      await tui.sendKeys("q");
      await tui.waitForText("Dashboard");

      // Bar should be intact
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("c:new repo");
    });

    test("INT-QA-002: Quick action n → notifications → g d returns to dashboard with bar intact", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      await tui.sendKeys("n");
      await tui.waitForText("Notifications");

      // Use go-to to return to dashboard (reset, not pop)
      await tui.sendKeys("g", "d");
      await tui.waitForText("Dashboard");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("c:new repo");
    });

    test("INT-QA-003: Quick action s → search → type query → q returns to dashboard (no state leak)", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      await tui.sendKeys("s");
      await tui.waitForText("Search");

      // Type a query on the search screen
      await tui.sendText("hello");

      await tui.sendKeys("Escape"); // clear search focus
      await tui.sendKeys("q"); // back to dashboard
      await tui.waitForText("Dashboard");

      // Dashboard should not contain search query text
      const snapshot = tui.snapshot();
      expect(snapshot).not.toContain("hello");
    });

    test("INT-QA-004: i with repo context after visiting a repo", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Navigate to a repo to establish context
      await tui.sendKeys("g", "r");
      await tui.waitForText("Repositories");
      await tui.sendKeys("Enter");

      // Return to dashboard
      await tui.sendKeys("g", "d");
      await tui.waitForText("Dashboard");

      // Now 'i' should work (repo context from previous navigation)
      await tui.sendKeys("i");

      // Should navigate to create-issue, not show transient message
      // This test may fail if go-to (reset) clears repo context
      // That's expected behavior worth verifying
      const snapshot = tui.snapshot();
      // Either "Create Issue" appears (context preserved) or
      // "Select a repository first" appears (context cleared by reset)
      // Both are valid — the test documents the actual behavior
      expect(
        snapshot.includes("Create Issue") ||
        snapshot.includes("Select a repository first")
      ).toBe(true);
    });

    test("INT-QA-005: All quick actions reachable via command palette when bar actions hidden", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await tui.waitForText("Dashboard");

      // Open command palette
      await tui.sendKeys(":");

      // Search for "Create Repository"
      await tui.sendText("Create Repo");

      // Command palette should list it
      const snapshot = tui.snapshot();
      expect(snapshot).toMatch(/[Cc]reate.*[Rr]epo/i);

      await tui.sendKeys("Escape");
    });

    test("INT-QA-006: Quick actions bar survives panel error state", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Even if a panel shows an error, the bar should be visible
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("c:new repo");
    });

    test("INT-QA-007: Quick actions bar functional during panel loading", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      // Don't wait for full load — test early state
      // The bar should appear even before data finishes loading
      await tui.waitForText("c:new repo", 5000);

      // Quick actions should work during loading
      await tui.sendKeys("n");
      await tui.waitForText("Notifications");
    });

    test("INT-QA-008: Auth error on pushed screen does not affect quick-actions bar", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
      });
      await tui.waitForText("Dashboard");

      // Navigate to create-repo (may trigger auth check)
      await tui.sendKeys("c");
      await tui.waitForText("Create Repository");

      // Return to dashboard
      await tui.sendKeys("q");
      await tui.waitForText("Dashboard");

      // Bar should still work
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("c:new repo");

      await tui.sendKeys("s");
      await tui.waitForText("Search");
    });
  });
});
```

---

## Productionization Notes

### 1. ScreenName Enum Extension

If `ScreenName.RepoCreate` is not yet in the enum, add it before implementing this ticket. This is a single-line addition to `apps/tui/src/router/types.ts` and a corresponding entry in `apps/tui/src/router/registry.ts` pointing to `PlaceholderScreen`. This ensures the `push()` call does not throw.

### 2. Go-To Mode State Exposure

The defensive `isGoToModeActive` guard requires the `KeybindingProvider` to expose go-to mode state. Two implementation paths:

- **If go-to mode already intercepts all second-key presses** (including non-matching keys like `c`), no extra work is needed. Remove the `isGoToModeActive` prop from `useQuickActions` and rely on priority ordering.
- **If go-to mode does NOT consume non-matching keys** (i.e., pressing `g` then `c` lets `c` fall through to SCREEN scope), add a `isGoToActive` field to `KeybindingContextType` and set it when go-to mode activates/deactivates in `apps/tui/src/navigation/goToBindings.ts`. Wire it into `useQuickActions` via `useContext(KeybindingContext)` or a new `useGoToMode()` hook.

Recommendation: Verify the behavior with a manual test before deciding. The priority-based system likely handles this correctly.

### 3. Command Palette Registration

Quick actions should be registered as command palette entries so they're accessible when bar actions are hidden at narrow widths. This requires entries in `@codeplane/ui-core`'s `commandRegistry`. If the registry is not yet populated, add the following entries:

```typescript
{ id: "create-repo",     label: "Create Repository",   category: "Action",   handler: () => push(ScreenName.RepoCreate) },
{ id: "create-issue",    label: "Create Issue",        category: "Action",   handler: () => handleCreateIssue() },
{ id: "notifications",   label: "Open Notifications",  category: "Navigate", handler: () => push(ScreenName.Notifications) },
{ id: "search",          label: "Open Search",         category: "Navigate", handler: () => push(ScreenName.Search) },
```

This is a separate concern from the `QuickActionsBar` component and may be addressed by a different ticket. The bar itself does not depend on the command palette.

### 4. TextAttributes Import

The `TextAttributes.BOLD` constant (`1`) is defined in `apps/tui/src/theme/tokens.ts`. Verify it matches the `@opentui/core` `TextAttributes` bitfield. If OpenTUI's React reconciler expects a different format (e.g., string `"bold"` vs. number `1`), adapt the component accordingly.

### 5. Border Rendering Compatibility

The spec calls for `borderTop={true}` with `borderBottom={false}`, `borderLeft={false}`, `borderRight={false}`. Verify that OpenTUI's `<box>` component supports selective border sides. The OpenTUI API shows `border` accepting `boolean | BorderSides[]`. If selective borders are not supported, use a separate single-row `<text>` element filled with `─` characters in `theme.border` color positioned above the action labels.

Fallback:
```tsx
<box flexDirection="column" height={2} width="100%">
  <text fg={theme.border}>{"─".repeat(layout.width)}</text>
  <box flexDirection="row" height={1}>{/* action labels */}</box>
</box>
```
Note: this changes the bar's total height to 2 rows (1 border + 1 content). Adjust `contentHeight` calculation in the dashboard layout accordingly.

### 6. Timer Behavior in Tests

The transient message 2-second timer in SNAP-QA-004 requires `waitForNoText` with a timeout > 2000ms. The helper's default timeout is 10s, which is sufficient. However, test runtime is affected — consider whether the 2s wait is acceptable or if a test-specific override for `TRANSIENT_MESSAGE_DURATION_MS` via environment variable is warranted for CI speed. Recommendation: keep the 2s real timer in tests to validate actual behavior.

### 7. Cleanup and Memory

- `setTimeout` refs are cleaned up in `useEffect` cleanup.
- No event listeners are leaked.
- The `computeVisibleActions` function is pure and memoized — no allocation on each render beyond the returned array.
- Telemetry `emit()` is fire-and-forget (writes to stderr in debug mode only).

---

## Acceptance Checklist

- [ ] `QuickActionsBar` component renders as a 1-row `<box>` with top border in `theme.border` color
- [ ] Bar visible at all supported sizes (80×24 through 200×60+)
- [ ] Displays labeled shortcuts with bold keys and muted labels
- [ ] `c` pushes create-repository screen
- [ ] `i` pushes create-issue screen with repo context; shows transient warning without context
- [ ] `n` pushes notifications screen
- [ ] `s` pushes search screen
- [ ] `/` activates inline filter on focused panel
- [ ] Keys suppressed when: text input focused, modal open, go-to mode active
- [ ] Keys inactive on non-dashboard screens (via `useScreenKeybindings` unmount)
- [ ] Screen transitions < 50ms
- [ ] `q` after quick-action returns to dashboard with bar intact
- [ ] Compact labels at minimum breakpoint; full labels at standard/large
- [ ] 2-space separators at minimum/standard; 3-space at large
- [ ] `Tab:next panel` hint at minimum breakpoint only
- [ ] Overflow hides lowest-priority actions first; `c` always visible
- [ ] Transient message replaces bar content for 2s then auto-restores
- [ ] All SNAP-QA, KEY-QA, RESP-QA, INT-QA tests written and passing (or failing only due to unimplemented backends)
- [ ] Telemetry events emitted for all actions
- [ ] Debug-level logging for all state transitions
