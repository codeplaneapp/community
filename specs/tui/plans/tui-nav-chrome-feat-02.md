# Implementation Plan: TUI Header Bar (`tui-nav-chrome-feat-02`)

This plan details the steps required to implement the TUI_HEADER_BAR feature, transforming the existing stub into a robust, responsive, and data-driven component. All work is scoped to the `apps/tui/` and `e2e/tui/` directories.

## Step 1: Create Breadcrumb Utilities

Extract and enhance breadcrumb truncation and width calculation logic into a new pure-function utility module.

**1a. Create `apps/tui/src/utils/breadcrumb.ts`**
- Implement `truncateSegmentLabel` to enforce `SEGMENT_MAX_LENGTH` (24) and `REPO_MAX_LENGTH` (30).
- Implement `computeBreadcrumbSegments` to handle left-side ellipsis truncation to fit the terminal width, always preserving the current and immediate parent segments if possible, and returning a "Codeplane" fallback for an empty stack.
- Implement `computeRenderedWidth` to measure strings joined by `SEPARATOR` (" › ").
- Implement `formatNotificationBadge` to cap counts at `[99+]`.
- Implement `computeRightZoneWidth` to calculate reserved width for the right zone.

**1b. Create barrel export `apps/tui/src/utils/index.ts`**
- Export all contents from `./breadcrumb.js`.

**1c. Write Unit Tests in `apps/tui/src/utils/__tests__/breadcrumb.test.ts`**
- Write pure unit tests using `bun:test` to verify all truncation logic, formatting rules, and edge cases (empty stack, exact lengths, long repo names).

## Step 2: Enhance SSEProvider

Upgrade the existing placeholder SSEProvider to expose a typed context. The real SSE connection lifecycle is deferred to a future ticket, but the provider must offer the correct state shape for the `HeaderBar` to consume.

**2a. Modify `apps/tui/src/providers/SSEProvider.tsx`**
- Define `ConnectionState` type (`"connecting" | "connected" | "reconnecting" | "disconnected"`).
- Define `SSEContextValue` interface including `connectionState`, `unreadCount`, and `subscribe`.
- Update `SSEProvider` to maintain state. It should start as `"connecting"` and transition to `"disconnected"` after a short timeout (simulating the current lack of a real connection).
- Export custom hooks: `useSSEContext`, `useConnectionState`, and `useUnreadCount`.
- Preserve a dummy `useSSE` hook for backward compatibility.

**2b. Update `apps/tui/src/providers/index.ts`**
- Export `useSSEContext`, `useConnectionState`, and `useUnreadCount`.

## Step 3: Rewrite `HeaderBar` Component

Completely overhaul the existing `HeaderBar.tsx` to meet design and responsiveness specifications.

**3a. Modify `apps/tui/src/components/HeaderBar.tsx`**
- Remove the `border={["bottom"]}` prop from the outer `<box>` to strictly conform to the 1-row height requirement.
- Consume layout and navigation state using `useLayout()`, `useTheme()`, and `useNavigation()`.
- Consume connection and notification state using `useSSEContext()`.
- Render the layout using a 3-zone row:
  - **Left (flexGrow=1):** Render `BreadcrumbSegment`s returned from `computeBreadcrumbSegments`. Use `theme.primary` + bold for the current segment, `theme.muted` for parents, and `theme.border` for the separator.
  - **Center (conditionally visible):** Only render the `owner/repo` string if `nav.repoContext` is present AND `width >= 120`.
  - **Right (fixed width based on content):** Render the connection indicator (`●` in `theme.success` or `○` in `theme.error`) and notification badge (`[N]` in `theme.warning`, hidden if 0).
- Integrate telemetry via `apps/tui/src/lib/telemetry.js`:
  - `tui.header_bar.rendered`
  - `tui.header_bar.breadcrumb_truncated`
  - `tui.header_bar.connection_lost`
  - `tui.header_bar.connection_restored`
  - `tui.notification_badge.updated`
- Integrate structured logging via `apps/tui/src/lib/logger.js` for stack changes, connection changes, and badge updates.

**3b. Verify Barrel Exports**
- Ensure `HeaderBar` is still exported from `apps/tui/src/components/index.ts`.

## Step 4: Add E2E Tests

Append TUI shell snapshot, responsive, and interaction tests.

**4a. Update `e2e/tui/app-shell.test.ts`**
- Add snapshot tests verifying the `HeaderBar` renders correctly at `120x40`, `80x24`, and `200x60`.
- Add interaction tests verifying navigation (`g r`, `g n`, `q`) correctly updates the breadcrumb trailing path.
- Add responsive tests ensuring center-zone hides at `80x24` and the breadcrumb gracefully truncates.
- Add real-time / SSE test stubs (which are expected to fail until the backend is fully wired) that test badge updates and connection recovery.
- Add edge-case tests (empty stack fallback, extremely long repo names).

## Final Verification
- Run unit tests: `bun test apps/tui/src/utils/__tests__/`
- Run E2E tests: `bun test e2e/tui/app-shell.test.ts`
- Expected: All unit tests pass. E2E visual and structural tests pass. SSE/Notification specific E2E tests fail (as designed, until backend implementation is complete).