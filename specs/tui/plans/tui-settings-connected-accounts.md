# Implementation Plan: TUI Settings Connected Accounts

This plan details the implementation of the Connected Accounts tab in the Codeplane TUI Settings screen, including the data fetching hooks, responsive UI components, keyboard navigation, and end-to-end testing.

## Phase 1: Data Layer Hooks (`@codeplane/ui-core`)

1. **Create `useConnectedAccounts` Hook**
   - **File:** `packages/ui-core/src/hooks/useConnectedAccounts.ts`
   - **Action:** Create a hook to fetch connected accounts via `GET /api/user/connections`.
   - **Details:** Return an array of `ConnectedAccountResponse` objects sorted by `id` ascending. Handle loading, error, and caching states using the existing `useAPIClient` and query patterns.

2. **Create `useSSHKeys` Hook**
   - **File:** `packages/ui-core/src/hooks/useSSHKeys.ts`
   - **Action:** Create a hook to fetch SSH keys via `GET /api/user/keys`.
   - **Details:** This is required to determine if a connected account is the last available authentication method.

3. **Create `useDisconnectAccount` Hook**
   - **File:** `packages/ui-core/src/hooks/useDisconnectAccount.ts`
   - **Action:** Create a mutation hook for `DELETE /api/user/connections/:id`.
   - **Details:** Ensure that on a `204 No Content` success response, the cache for `useConnectedAccounts` is invalidated to trigger a re-fetch.

## Phase 2: Settings Screen Routing

1. **Update `SettingsScreen`**
   - **File:** `apps/tui/src/screens/settings/SettingsScreen.tsx`
   - **Action:** Add the Connections tab to the settings navigation.
   - **Details:**
     - Add a new tab entry for `[6:Connections]`.
     - Register the `6` keybinding to select the Connections tab.
     - Update the rendering switch statement to mount the `<ConnectionsTab />` component.
     - Update the header breadcrumb to display `Settings > Connections`.
     - Add a command palette entry for `:settings connections` pointing to this tab.

## Phase 3: `ConnectionsTab` Component Implementation

1. **Component Structure & State**
   - **File:** `apps/tui/src/screens/settings/ConnectionsTab.tsx`
   - **Action:** Scaffold the `ConnectionsTab` component.
   - **Details:**
     - Import the newly created hooks (`useConnectedAccounts`, `useSSHKeys`, `useDisconnectAccount`), plus OpenTUI hooks (`useTerminalDimensions`, `useKeyboard`, `useTheme`).
     - Initialize state: `focusedIndex` (number), `showDetail` (boolean), `showConfirmDialog` (boolean), `disconnectError` (string | null), and `successMessage` (string | null).
     - Handle loading/error states: Render "Loading connected accounts…" or "Failed to load connected accounts. Press R to retry."
     - Handle empty state: If no accounts exist, render "No connected accounts" with a CLI helper hint.

2. **Responsive List Layout**
   - **File:** `apps/tui/src/screens/settings/ConnectionsTab.tsx`
   - **Action:** Implement the list of connected accounts.
   - **Details:**
     - Determine layout based on `useTerminalDimensions()` (minimum: 80x24, standard: 120x40, large: 200x60).
     - Render a `<scrollbox>` containing the accounts.
     - Conditionally render column headers (PROVIDER, EXTERNAL ID, CONNECTED, UPDATED) based on available width.
     - Style the focused row with `theme.primary` reverse video and a `▸` cursor.
     - Implement the `isLastAuthMethod` check: If `accounts.length === 1` and `sshKeys.length === 0`, render a `🔒` indicator next to the row.

3. **Detail View & Confirmation Modal**
   - **File:** `apps/tui/src/screens/settings/ConnectionsTab.tsx`
   - **Action:** Implement the detail pane and the disconnect confirmation dialog.
   - **Details:**
     - **Detail View:** When `showDetail` is true, render account details. Replace the list at minimum size, or use a split pane at standard/large sizes.
     - **Confirmation Modal:** When `showConfirmDialog` is true, render an absolute-positioned `<box>` centered on the screen using `theme.surface` and `theme.warning` borders. Show "Disconnecting…" if the mutation is pending, or "Continue? [y/N]".

4. **Keyboard Handlers**
   - **File:** `apps/tui/src/screens/settings/ConnectionsTab.tsx`
   - **Action:** Wire up keyboard navigation and actions.
   - **Details:**
     - `j` / `Down`: Increment `focusedIndex` (capped).
     - `k` / `Up`: Decrement `focusedIndex` (floored).
     - `g g`: Jump to top (index 0).
     - `G`: Jump to bottom (index `accounts.length - 1`).
     - `Enter`: Toggle `showDetail` for the focused account.
     - `d`: Trigger disconnect flow. Prevent if `isLastAuthMethod` (show status bar warning). Otherwise, set `showConfirmDialog` to true.
     - `y`: Confirm disconnect. Call the mutation hook. Handle success and error states (409, 429, 500).
     - `n` / `Esc`: Close detail view or modal.

## Phase 4: End-to-End Testing

1. **Terminal Snapshot Tests**
   - **File:** `e2e/tui/settings.test.ts`
   - **Action:** Add snapshot tests for the Connected Accounts tab.
   - **Details:**
     - Verify standard layout at 120x40.
     - Verify minimum size layout at 80x24 (columns dropped, external ID truncated).
     - Verify large size layout at 200x60 (all columns visible).
     - Verify empty state rendering.
     - Verify confirmation dialog modal positioning.
     - Verify detail view layout at different breakpoints.
     - Verify `🔒` lock indicator on the last-auth-method account.

2. **Keyboard Interaction Tests**
   - **File:** `e2e/tui/settings.test.ts`
   - **Action:** Add interaction tests for the list and modals.
   - **Details:**
     - Verify `j`/`k` movement and bounds.
     - Verify `Enter` toggles detail view.
     - Verify `d` opens the confirmation dialog.
     - Verify `d` is blocked on the last auth method and shows a warning.
     - Verify `y` inside the dialog executes the disconnect API and clears the dialog.
     - Verify `n`/`Esc` cancels the dialog.

3. **Error Handling & Edge Case Tests**
   - **File:** `e2e/tui/settings.test.ts`
   - **Action:** Add tests for API error states.
   - **Details:**
     - Mock a 409 response during deletion to verify the last-auth-method inline error.
     - Mock a 429 response to verify the rate limit message.
     - Mock a network timeout during initial load to verify the "Press R to retry" state.
     - Verify the application shell handles resizing below 80x24 by showing the too-small message.