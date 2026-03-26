# Engineering Specification: TUI Settings Connected Accounts

## Implementation Plan

1.  **Implement Data Layer Hooks (`@codeplane/ui-core`)**
    *   **File:** `packages/ui-core/src/hooks/useConnectedAccounts.ts` (or relevant data hook file)
    *   **Details:** Create and export `useConnectedAccounts()` which fetches `GET /api/user/connections` returning `ConnectedAccountResponse[]` (sorted by `id` ascending). Support caching and invalidation.
    *   **File:** `packages/ui-core/src/hooks/useDisconnectAccount.ts`
    *   **Details:** Create and export `useDisconnectAccount()` which executes `DELETE /api/user/connections/:id`. Ensure it invalidates the `useConnectedAccounts` cache on a 204 success.
    *   **File:** `packages/ui-core/src/hooks/useSSHKeys.ts`
    *   **Details:** Create and export `useSSHKeys()` mapping to `GET /api/user/keys` to support last-auth-method validation.

2.  **Update Settings Screen Routing and Navigation**
    *   **File:** `apps/tui/src/screens/settings/SettingsScreen.tsx`
    *   **Details:**
        *   Add a new tab entry for `[6:Connections]`.
        *   Register keyboard bindings for `6` to select the Connections tab.
        *   Update the rendering switch statement to mount `<ConnectionsTab />` when active.
        *   Ensure the header breadcrumb updates to `Settings > Connections`.
        *   Add command palette registry entries for `:settings connections` pointing to this tab.

3.  **Implement `ConnectionsTab` Component Structure**
    *   **File:** `apps/tui/src/screens/settings/ConnectionsTab.tsx`
    *   **Details:**
        *   Import `useConnectedAccounts`, `useSSHKeys`, `useDisconnectAccount`, `useTerminalDimensions`, and `useTheme`.
        *   Manage component state: `focusedIndex` (number), `showDetail` (boolean), `showConfirmDialog` (boolean), `disconnectError` (string | null), and `successMessage` (string | null).
        *   **Loading State:** Render a centered text "Loading connected accounts…" while data fetches.
        *   **Error State:** On fetch failure, render "Failed to load connected accounts. Press R to retry."
        *   **Empty State:** If `accounts.length === 0`, render the specified empty state layout with "No connected accounts" and the CLI helper hint.

4.  **Implement Responsive List Layout**
    *   **File:** `apps/tui/src/screens/settings/ConnectionsTab.tsx`
    *   **Details:**
        *   Calculate active layout constraints based on `useTerminalDimensions()` (minimum: 80x24, standard: 120x40, large: 200x60).
        *   Render a `scrollbox` containing the list of accounts.
        *   Render column headers (PROVIDER, EXTERNAL ID, CONNECTED, UPDATED) conditionally based on terminal width.
        *   Map over `accounts` and render rows. Apply title casing to `account.provider`. Formatter dates to `YYYY-MM-DD`.
        *   Apply `theme.primary` reverse video styling to the row matching `focusedIndex`, along with a `▸` cursor.
        *   Implement `isLastAuthMethod(account)`: returns true if `accounts.length === 1` and `sshKeys.length === 0`. If true, render a `🔒` indicator next to the row.

5.  **Implement Detail View & Confirmation Modal**
    *   **File:** `apps/tui/src/screens/settings/ConnectionsTab.tsx`
    *   **Details:**
        *   **Detail View:** Rendered conditionally when `showDetail === true`. At minimum size, it replaces the list container. At standard/large sizes, it renders below the list in a split pane. Displays full `provider_user_id` and formatted timestamps. Includes a `[Disconnect]` button hint (dimmed if last auth method).
        *   **Confirmation Modal:** Rendered via an absolute-positioned `<box>` centered on screen when `showConfirmDialog === true`. Uses `theme.surface` and `theme.warning` borders.
        *   Displays standard warning text. If `isDisconnecting` is true, displays "Disconnecting…", otherwise "Continue? [y/N]".

6.  **Wire Up Keyboard Handlers**
    *   **File:** `apps/tui/src/screens/settings/ConnectionsTab.tsx`
    *   **Details:**
        *   Utilize a local `useKeyboard` or screen-level keybinding registry for the active tab context.
        *   `j` / `Down`: Increment `focusedIndex` (capped at `accounts.length - 1`).
        *   `k` / `Up`: Decrement `focusedIndex` (floored at 0).
        *   `g g`: Set `focusedIndex` to 0.
        *   `G`: Set `focusedIndex` to `accounts.length - 1`.
        *   `Enter`: Toggle `showDetail` for the currently focused index.
        *   `d`: If not `showConfirmDialog` and not `isLastAuthMethod(focusedAccount)`, set `showConfirmDialog` to true. If it *is* last auth method, set a status bar warning.
        *   `y`: If `showConfirmDialog` is active, call `mutate(focusedAccount.id)`. Handle 204 success (clear dialog, show flash message) and error states (409, 429, 500).
        *   `n` / `Esc`: Close dialog or detail view.

## Unit & Integration Tests

1.  **Terminal Snapshot Tests (`e2e/tui/settings.test.ts`)**
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders account list at 120x40 with GitHub connected`: Validates standard layout with 3 columns.
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders account list at 80x24 minimum size with truncated external ID`: Validates column dropping and truncation.
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders account list at 200x60 large size with all four columns`: Validates expanded metadata columns.
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders empty state when user has zero connected accounts`: Validates empty UI and CLI connection hint.
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders disconnect confirmation dialog`: Validates absolute positioning and modal text.
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders detail view replacing list at minimum size`: Validates responsive rendering logic for details.
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — renders lock indicator on last-auth-method account`: Validates visual guard presence.

2.  **Keyboard Interaction Tests (`e2e/tui/settings.test.ts`)**
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — j/k moves focus to next/prev account row`: Verifies index tracking and boundary limits.
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — Enter opens detail view for focused account`: Verifies detail pane toggling.
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — d opens disconnect confirmation dialog`: Verifies modal triggering.
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — d on last-auth-method account shows warning in status bar`: Verifies guard logic prevents modal from opening.
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — y in confirmation dialog confirms disconnect`: Mocks the DELETE endpoint, presses `y`, and validates the success state/cache invalidation.
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — n/Esc in confirmation dialog cancels disconnect`: Verifies modal teardown.

3.  **Error Handling & Edge Case Tests (`e2e/tui/settings.test.ts`)**
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — 409 on disconnect shows last-auth-method error in dialog`: Mocks a 409 API response during deletion and verifies inline error message formatting.
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — 429 on disconnect shows rate limit message with countdown`: Validates rate limit string matching.
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — network timeout on load shows error with retry`: Mocks failed GET request and verifies the "Press R to retry" UI renders. Validates `R` refetches.
    *   `TUI_SETTINGS_CONNECTED_ACCOUNTS — resize below 80x24 shows too-small message`: Verifies app shell gracefully handles terminal shrinkage.