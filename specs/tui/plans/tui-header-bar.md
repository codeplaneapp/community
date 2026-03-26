# Implementation Plan: TUI Header Bar

This plan outlines the steps to implement the `HeaderBar` component as specified in the `tui-header-bar` engineering spec.

## Step 1: Update SSEProvider Contract
**File:** `apps/tui/src/providers/SSEProvider.tsx`

1. Define the `ConnectionState` type (`"connecting" | "connected" | "reconnecting" | "disconnected"`).
2. Define the `SSEContextValue` interface to include `connectionState` and `unreadNotificationCount`.
3. Update `SSEContext` to use the new interface with default values (`connecting`, `0`).
4. Update the `SSEProvider` component to consume `useAuth()` from `../hooks/useAuth.js`.
5. Use a `useEffect` hook to derive `connectionState` from `auth.status`:
   - `"authenticated"` -> `"connected"`
   - `"offline" | "unauthenticated" | "expired"` -> `"disconnected"`
   - Other -> `"connecting"`
6. Expose `connectionState` and a stubbed `unreadNotificationCount` (default `0`) through the provider value.
7. Keep `useSSEChannel` stubbed but properly typed.

## Step 2: Create useHeaderBar Hook
**File:** `apps/tui/src/hooks/useHeaderBar.ts`

1. Create a new file for the hook.
2. Import `useNavigation`, `useSSE`, `useLayout`, and `useTheme`.
3. Import `truncateBreadcrumb` and `truncateRight` from `../util/text.js`.
4. Define `HeaderBarData` interface mapping all required UI properties.
5. Compute the data inside a `useMemo` block:
   - **Breadcrumb:** Map `nav.stack`, fallback to `["Codeplane"]` if empty.
   - **Right Zone Width:** Calculate reserved space for the connection symbol (3 chars) and notification badge (7 chars if count > 0).
   - **Center Zone Width:** Determine visibility based on `breakpoint !== "minimum"` and `nav.repoContext`. Use `truncateRight(repoContext, 30)` for long names.
   - **Left Zone Width:** Compute remaining available width (`Math.max(20, width - rightReserved - centerReserved - 2)`).
   - **Formatting:** Use `truncateBreadcrumb`, split into `breadcrumbPrefix` and `currentSegment`.
   - **Status:** Map `sse.connectionState` to symbol (`●` or `○`) and color token (`success`, `warning`, `error`).
   - **Badge:** Format `sse.unreadNotificationCount` as `[N]` or `[99+]`, or hide if 0.
6. Return the computed state.

## Step 3: Export Hook
**File:** `apps/tui/src/hooks/index.ts`

1. Add `export { useHeaderBar } from "./useHeaderBar.js";`
2. Add `export type { HeaderBarData } from "./useHeaderBar.js";`

## Step 4: Update HeaderBar Component
**File:** `apps/tui/src/components/HeaderBar.tsx`

1. Replace the existing implementation with the new hook consumption.
2. Import `useHeaderBar`, `TextAttributes` (from `../theme/tokens.js`), and `emit` (from `../lib/telemetry.js`).
3. Add `useEffect` blocks to handle telemetry emissions:
   - `tui.header_bar.rendered` on initial mount.
   - `tui.header_bar.breadcrumb_truncated` when truncation state changes.
   - `tui.header_bar.connection_lost` and `tui.header_bar.connection_restored` based on previous vs current connection state.
   - `tui.notification_badge.updated` when the unread count changes.
4. Render the layout using OpenTUI `<box>` and `<text>` components:
   - Main container: `<box flexDirection="row" height={1} width="100%" borderColor={theme.border} border={["bottom"]}>`
   - Left zone (`flexGrow={1}`): Display `breadcrumbPrefix` (muted) and `currentSegment` (primary, bold).
   - Center zone (conditional render): Display `repoContextLabel` (muted).
   - Right zone (`flexShrink={0}`): Display connection indicator (dynamic color) and notification badge (warning color, conditional render).

## Step 5: Add End-to-End Tests
**File:** `e2e/tui/app-shell.test.ts`

1. Append new test suites for `TUI_HEADER_BAR`:
   - `TUI_HEADER_BAR — Breadcrumb rendering`
   - `TUI_HEADER_BAR — Repository context`
   - `TUI_HEADER_BAR — Connection status indicator`
   - `TUI_HEADER_BAR — Notification badge` (Expect these to fail locally until SSE is fully implemented, do not skip).
   - `TUI_HEADER_BAR — Keyboard interaction`
   - `TUI_HEADER_BAR — Responsive resize`
   - `TUI_HEADER_BAR — SSE real-time` (Expect failures until SSE is implemented).
   - `TUI_HEADER_BAR — Edge cases`
   - `TUI_HEADER_BAR — Unit tests (truncation and formatting)`
   - `TUI_HEADER_BAR — SSEProvider connection state contract`
2. Ensure tests use `@microsoft/tui-test` APIs like `launchTUI`, `waitForText`, `sendKeys`, and `resize`.
3. Add snapshot assertions where necessary to track structural regressions.