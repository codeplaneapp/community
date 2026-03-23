# TUI_HEADER_BAR — Engineering Specification

## Overview

The `HeaderBar` is the persistent top-of-screen component that orients the user within the Codeplane TUI. It consumes exactly 1 row of terminal height and displays three distinct zones:
1. **Left:** A breadcrumb trail representing the navigation stack.
2. **Center:** The current repository context (when applicable and when space permits).
3. **Right:** System status indicators, including an SSE connection indicator and a real-time notification badge.

This specification details the implementation plan and test strategy for this component, adhering to the terminal constraints and React 19 + OpenTUI architecture.

## Implementation Plan

### Step 1: Implement Breadcrumb Utilities
**File:** `apps/tui/src/utils/breadcrumb.ts`

Create utility functions to handle the logic of formatting and truncating breadcrumb segments based on available terminal width.

1. **`formatSegment(label: string, isRepo: boolean): string`**
   - Truncate normal segments to a maximum of 24 characters.
   - Truncate repository segments (`owner/repo`) to a maximum of 30 characters.
   - Append `…` (U+2026) when truncating.

2. **`calculateTruncatedBreadcrumb(segments: string[], availableWidth: number): string[]`**
   - Accept an array of pre-formatted string segments.
   - If the total length of the joined segments (including the ` › ` separators) fits within `availableWidth`, return them unchanged.
   - If it exceeds `availableWidth`, iteratively remove the leftmost segments and replace the first removed segment position with a `…` token until the resulting string fits.
   - Ensure the current (deepest) segment and ideally its immediate parent are preserved if absolutely possible, prioritizing the current segment above all else.

### Step 2: Implement the HeaderBar Component
**File:** `apps/tui/src/components/HeaderBar.tsx`

Create the `<HeaderBar />` React component utilizing OpenTUI components and TUI context hooks.

1. **Imports:**
   - `<box>`, `<text>` from `@opentui/react`.
   - `useTerminalDimensions` from `@opentui/react`.
   - `useTheme` from `apps/tui/src/providers/ThemeProvider`.
   - `useNavigation` from `apps/tui/src/providers/NavigationProvider`.
   - `useNotifications` from `@codeplane/ui-core`.
   - `useSSE` from `apps/tui/src/providers/SSEProvider`.
   - Utility functions from `apps/tui/src/utils/breadcrumb.ts`.

2. **Data Fetching & State:**
   - Retrieve `{ width }` from `useTerminalDimensions()`.
   - Retrieve `{ stack, repoContext }` from `useNavigation()`.
   - Retrieve `{ unreadCount }` from `useNotifications()`.
   - Retrieve `{ connectionState }` from `useSSE()`.
   - Retrieve `theme` from `useTheme()`.

3. **Layout Logic:**
   - **Root container:** `<box flexDirection="row" height={1} width="100%">`.
   - **Right Zone Space Calculation:** `flexShrink={0}`. Needs approx 8-12 chars depending on notification count and connection status. Calculate actual text length to reserve space.
   - **Center Zone Visibility:** Only render if `width >= 120` and `repoContext` is not null. Space required is `repoContext.length`.
   - **Left Zone Width:** Available width for breadcrumbs = `width - rightZoneWidth - (centerZoneWidth + padding)`.

4. **Render - Left Zone (Breadcrumb):**
   - Process `stack.map(s => s.breadcrumb)` through `formatSegment` and `calculateTruncatedBreadcrumb`.
   - Render in a `<box flexGrow={1} flexShrink={1}>`.
   - Iterate the resulting truncated segments. Use `theme.border` for the ` › ` separators.
   - Render the last segment using `theme.primary` and all other segments using `theme.muted`.

5. **Render - Center Zone (Repo Context):**
   - Render conditionally (`width >= 120 && repoContext`).
   - Use a `<box flexShrink={0} justifyContent="center" paddingX={2}>`.
   - Render the text `owner/repo` using `theme.muted`.

6. **Render - Right Zone (Status):**
   - Use a `<box flexShrink={0} justifyContent="flex-end">`.
   - Render the connection indicator:
     - `connectionState === 'connected'` ? `●` (U+25CF) in `theme.success` (ANSI 34).
     - Otherwise ? `○` (U+25CB) in `theme.error` (ANSI 196).
   - Render the notification badge:
     - Only if `unreadCount > 0`.
     - Display as ` [N]` where N is `unreadCount > 99 ? '99+' : unreadCount`.
     - Use `theme.warning` (ANSI 178).

### Step 3: Integrate HeaderBar into AppShell
**File:** `apps/tui/src/components/AppShell.tsx`

1. Ensure `<HeaderBar />` is mounted as the first child of the root `<box>` within the `<AppShell>` component.
2. Verify that it sits above the main scrollable content area, enforcing its fixed `height={1}` so that it never scrolls out of view.

## Unit & Integration Tests

**File:** `e2e/tui/app-shell.test.ts`

Using `@microsoft/tui-test`, add the following scenarios to strictly validate the Header Bar's rendering and interactive behaviors.

1. **"header bar renders on initial launch at 120x40"**
   - Launch TUI with dimensions 120x40.
   - Wait for initial render.
   - **Assert:** Terminal line 0 matches expected full layout structure (`Dashboard`, space, `●`).
   - **Assert:** Snapshot matches expected golden file.

2. **"header bar renders on initial launch at 80x24"**
   - Launch TUI with dimensions 80x24.
   - Wait for initial render.
   - **Assert:** Terminal line 0 does NOT wrap to line 1.
   - **Assert:** Center zone (repo context) is entirely hidden.
   - **Assert:** Snapshot matches expected minimum-width golden file.

3. **"header bar shows deep breadcrumb trail and handles truncation at 80 columns"**
   - Launch TUI at 120x40.
   - Send key sequence to navigate 4 levels deep (e.g., Dashboard → Repo → Issues → Issue #42).
   - **Assert:** Full breadcrumb trail is visible on line 0.
   - Resize terminal to 80x24.
   - **Assert:** Breadcrumb starts with `… › ` on line 0.
   - **Assert:** The deepest segment (`#42`) remains clearly visible on line 0.

4. **"notification badge dynamically updates via SSE"**
   - Launch TUI at 120x40 with mocked `useNotifications` returning `0`.
   - **Assert:** Line 0 does NOT contain `[` or `]`.
   - Trigger backend/mock SSE notification update to set count to `3`.
   - **Assert:** Line 0 contains `[3]`.
   - Trigger SSE update to set count to `150`.
   - **Assert:** Line 0 contains `[99+]`.

5. **"connection indicator reflects SSE connectivity"**
   - Launch TUI at 120x40 with mocked successful SSE connection.
   - **Assert:** Line 0 contains the `●` character.
   - Force SSE mock to drop connection (`disconnected` state).
   - **Assert:** Line 0 contains the `○` character.

6. **"keyboard navigation updates header bar synchronously"**
   - Launch TUI at 120x40.
   - Send keys: `g`, `i` (navigate to Issues, assuming a repo context is mocked).
   - **Assert:** Line 0 updates immediately to include ` › Issues`.
   - Send key: `q` (pop stack).
   - **Assert:** Line 0 removes ` › Issues` immediately.
   - Send keys: `g`, `d` (reset to Dashboard).
   - **Assert:** Line 0 resets to `Dashboard` with no nested segments.
