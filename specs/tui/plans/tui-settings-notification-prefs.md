# Implementation Plan: TUI Settings - Notification Preferences

This plan outlines the steps to implement the Notification Preferences tab within the Codeplane TUI Settings screen, based on the engineering specification and research findings.

## Step 1: Scaffold Mock Data Hooks
Since `@codeplane/ui-core` is currently stubbed in the TUI, we need to create mock hooks for the settings data.

**File**: `apps/tui/src/hooks/mockSettingsHooks.ts`
- Create and export `useNotificationPreferences` to return a mocked initial state `{ email_notifications_enabled: true }`.
- Create and export `useUpdateNotificationPreferences` to return a mock `mutateAsync` function that simulates a network request (with an artificial delay) and resolves successfully.
- Create and export `useUser` to return mock user data including a `watched_repositories_count`.

## Step 2: Create the `NotificationPrefsTab` Component
**File**: `apps/tui/src/screens/settings/NotificationPrefsTab.tsx`
- Import `box`, `text`, `scrollbox` from `@opentui/react`.
- Import `useLayout` from `../hooks/useLayout.js` and `useTheme` from `../hooks/useTheme.js`.
- Import the mock hooks from `../hooks/mockSettingsHooks.js`.
- Implement local state for the toggle (`status`: 'idle' | 'saving' | 'saved' | 'error', `optimisticValue`: boolean).
- Build the layout hierarchy inside a `<scrollbox>` with vertical flexbox.
- Implement the Toggle Card, adapting its styling based on the current `status` (e.g., green for saved/on, yellow for saving, red for error) using `useTheme()` tokens.
- Implement responsive conditional rendering using `useLayout()`:
  - `minimum` (80x24): Hide notification type descriptions and subscription hints. Width 100%.
  - `standard` (120x40): Show truncated descriptions and CLI hint. Width 100%.
  - `large` (200x60+): Show full descriptions and web hints. Center the toggle card with `width="80%"`.
- Register keybindings (`Space`, `Enter`, `r`, `R`) using `useKeyboard` from `@opentui/react` to handle toggling and retrying.

## Step 3: Scaffold the `SettingsScreen` Component
**File**: `apps/tui/src/screens/SettingsScreen.tsx`
- Create the main `SettingsScreen` component.
- Implement a tab navigation system containing: Profile, Emails, SSH Keys, Tokens, Notifications, Connected Accounts.
- Use local state to track the active tab index.
- Render the `NotificationPrefsTab` conditionally when the "Notifications" tab (index 4) is active, passing down an `isActive` prop if necessary.
- Ensure the header breadcrumb displays `Dashboard > Settings > Notifications` when active.
- Handle `Tab` and `Shift+Tab` keybindings to cycle through the tabs.

## Step 4: Update the Router Registry
**File**: `apps/tui/src/router/registry.ts`
- Import the new `SettingsScreen`.
- Locate the mapping for `[ScreenName.Settings]`.
- Replace the existing `PlaceholderScreen` mapping with the newly created `SettingsScreen`.

## Step 5: Implement E2E Tests
**File**: `e2e/tui/settings.test.ts`
- Create a new test file using `@microsoft/tui-test` and `bun:test`.
- **Snapshot Tests**:
  - Write tests to capture the terminal output at `standard` (120x40), `minimum` (80x24), and `large` (200x60+) breakpoints, ensuring responsive elements (descriptions, hints, widths) render correctly.
  - Write tests capturing the different toggle states: `[ON]`, `[OFF]`, `[Saving...]`, `[Saved ✓]`, and `ERROR_UPDATE`.
- **Interaction Tests**:
  - Simulate pressing `Space` and `Enter` to verify the toggle state transitions and API invocation.
  - Simulate rapid `Space` presses to verify double-submit prevention.
  - Simulate pressing `r` to verify the retry mechanism after an error.
  - Simulate scrolling keys (`j`, `k`, `Ctrl+D`) to verify `<scrollbox>` integration.