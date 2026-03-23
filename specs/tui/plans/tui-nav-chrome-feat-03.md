# Implementation Plan: TUI Status Bar (tui-nav-chrome-feat-03)

This document outlines the step-by-step implementation plan for the `TUI_STATUS_BAR` feature, replacing the placeholder component with a fully specified three-section persistent footer. This plan strictly adheres to the engineering specification and the OpenTUI constraints.

## Phase 1: Context & Hooks

### Step 1.1: Create `useSyncState` Hook
**File:** `apps/tui/src/hooks/useSyncState.ts`
- Create the hook to bridge the `@codeplane/sdk` `SyncState` to React state.
- Define `SyncStateContext` and export `useSyncState()`.
- Implement a safe default state (`status: "offline"`, `conflictCount: 0`) to ensure the status bar renders without crashing when the daemon is unreachable.

### Step 1.2: Create `useSSEConnectionState` Hook
**File:** `apps/tui/src/hooks/useSSEConnectionState.ts`
- Create the hook to expose SSE connection health.
- Define `SSEConnectionStateContext` and export `useSSEConnectionState()`.
- Expose `{ connected, reconnecting, backoffMs }` defaulting to disconnected.

### Step 1.3: Create `useNotificationCount` Hook
**File:** `apps/tui/src/hooks/useNotificationCount.ts`
- Create the hook to provide unread notification counts.
- Define `NotificationCountContext` and export `useNotificationCount()`.
- Retain the "last known count" on disconnect to prevent UI flashing.

## Phase 2: UI Sub-components

### Step 2.1: Create `SyncStatusIndicator` Component
**File:** `apps/tui/src/components/SyncStatusIndicator.tsx`
- Build a standalone component utilizing `useTheme()`, `useSyncState()`, `useSSEConnectionState()`, `useSpinner()`, and `useLayout()`.
- Map the SDK `SyncStatus` to four display states: `connected`, `syncing`, `conflict`, and `disconnected`.
- Support responsive `compact` mode (icon-only for <120 columns).
- Emit telemetry on state transitions (`tui.status_bar.sync_state_changed`).

### Step 2.2: Create `NotificationBadge` Component
**File:** `apps/tui/src/components/NotificationBadge.tsx`
- Build a standalone component utilizing `useTheme()` and `useNotificationCount()`.
- Render the diamond icon (`◆`) and apply `TextAttributes.BOLD` for a 2000ms flash animation when the count increases.
- Implement a 99+ display cap.
- Emit telemetry for notification receipt (`tui.status_bar.notification_received`) and count overflow (`tui.status_bar.notification_overflow`).

## Phase 3: Status Bar & Layout Integration

### Step 3.1: Rewrite `StatusBar` Component
**File:** `apps/tui/src/components/StatusBar.tsx`
- Replace existing contents with a `<box flexDirection="row" justifyContent="space-between">` layout containing three main sections (left: hints, center: sync, right: notifications & help).
- Apply `backgroundColor={theme.surface}` to span the terminal width.
- Implement responsive width-aware keybinding hint truncation (`computeVisibleHints`) using the ellipsis (`…`) token.
- Utilize breakpoints (`minimum` vs `standard` vs `large`) to restrict maximum rendered hints to 4, 6, or Infinity.
- Emit initial render telemetry (`tui.status_bar.rendered`) and resize relayout telemetry (`tui.status_bar.resize_relayout`).

### Step 3.2: Export New Components
**File:** `apps/tui/src/components/index.ts`
- Export `SyncStatusIndicator` and `NotificationBadge` to maintain module boundaries.

### Step 3.3: Wire Context Providers in `SSEProvider`
**File:** `apps/tui/src/providers/SSEProvider.tsx`
- Update the existing stub to explicitly wrap its children in `SSEConnectionStateContext.Provider`, `NotificationCountContext.Provider`, and `SyncStateContext.Provider`.
- Supply the default safe values to enable correct degraded-mode rendering.

### Step 3.4: Add Error Boundary to `AppShell`
**File:** `apps/tui/src/components/AppShell.tsx`
- Wrap the rendered `<StatusBar />` component in an `<ErrorBoundary>` instance.
- Provide a lightweight fallback `<box>` mimicking the status bar dimensions with a prominent error text instructing the user to press `?` for help.

## Phase 4: E2E Testing

### Step 4.1: Create Status Bar Test Suite
**File:** `e2e/tui/status-bar.test.ts`
- Construct rigorous E2E tests using `@microsoft/tui-test`.
- Include snapshot matching (`SNAP-SB`) for default, compact, and large terminal sizes, verifying ANSI SGR code outputs for colors and background attributes.
- Write keyboard simulation (`KEY-SB`) assertions verifying `g` go-to mode hint overrides, and search/help overlay intersections.
- Implement terminal resize (`RESIZE-SB`) assertions handling column expansions and contractions using `tui.resize(cols, rows)`.
- Outline realtime stream tests (`RT-SB`) (intentionally failing where mocked backend endpoints are incomplete, avoiding skips or commented logic).
- Check edge cases (`EDGE-SB`) like missing auth tokens and layout behavior constraints at exactly 80 columns.