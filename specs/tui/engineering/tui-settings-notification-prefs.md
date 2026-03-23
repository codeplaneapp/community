# Engineering Specification: TUI Settings - Notification Preferences

## Overview
This specification details the implementation of the Notification Preferences tab within the Codeplane TUI Settings screen. It provides users with a keyboard-driven interface to toggle global email/in-app notifications, view read-only notification types, and see their repository subscription count. The implementation relies on React 19, OpenTUI primitives, and shared data hooks from `@codeplane/ui-core`.

## Architecture & Component Design

### 1. Component Structure
The feature is encapsulated within a new component, `NotificationPrefsTab`, which is rendered by the parent `SettingsScreen` when the 5th tab is active.

**File**: `apps/tui/src/screens/settings/NotificationPrefsTab.tsx`

**Layout Hierarchy**:
- Wrapped in a `<scrollbox>` to support smaller terminal dimensions.
- Uses `<box flexDirection="column">` for the main vertical flow.
- **Header Section**: Static `<text>` elements for the section title and description.
- **Toggle Card**: A `<box>` with `border="single"` acting as the interactive element. Its `borderColor` changes based on focus state. It uses flexbox to align the label ("Enable notifications") to the left and the state indicator (`[ON]`, `[OFF]`, `[Saving...]`, `[Saved ✓]`) to the right.
- **Notification Types**: A read-only list rendered as rows of `<box flexDirection="row">` containing the type name and an optional description (hidden at the minimum breakpoint).
- **Repository Subscriptions**: Displays the watched repository count retrieved from `useUser()` and a CLI hint (and web hint at the large breakpoint).

### 2. State Management & Hooks
The component orchestrates state using a combination of local React state and `@codeplane/ui-core` hooks.

**Data Hooks**:
- `useNotificationPreferences()`: Fetches the initial `{ email_notifications_enabled: boolean }` state.
- `useUpdateNotificationPreferences()`: Exposes a `mutateAsync` function to send the `PUT` request.
- `useUser()`: Retrieves the user's watched repository count.

**Local State Machine**:
- `loadStatus`: `'loading' | 'ready' | 'error_load'`
- `toggleStatus`: `'idle' | 'saving' | 'saved' | 'error_update'`
- `currentValue`: `boolean` (the current truth, optimistically updated).
- `savedTimer`: A `NodeJS.Timeout` reference to clear the `[Saved ✓]` state after 2 seconds.

### 3. Keybindings & Interactions
Keybindings are registered via the `useScreenKeybindings` hook (or equivalent abstraction in the TUI router) when the tab is active. 

- **`Space` / `Enter`**: Triggers the toggle action if `toggleStatus !== 'saving'`. Flips `currentValue` optimistically, sets `toggleStatus = 'saving'`, and invokes `mutateAsync`. On success, sets `toggleStatus = 'saved'` for 2s. On failure, reverts `currentValue` and sets `toggleStatus = 'error_update'`.
- **`r`**: Retries the `PUT` request if `toggleStatus === 'error_update'`.
- **`R`**: Calls `refetch()` on `useNotificationPreferences` if `loadStatus === 'error_load'`.
- **Scroll bindings (`j`, `k`, `Ctrl+D`, `Ctrl+U`, `g g`, `G`)**: Mapped to manipulate the `<scrollbox>` ref.

### 4. Responsive Adaptation
The layout adapts synchronously using the `useLayout()` hook (which wraps `useTerminalDimensions`).
- **`minimum` (80x24)**: Toggle card spans 100% width with 0 horizontal padding. Notification type descriptions are hidden (names only). Web and CLI hints in the subscription section are hidden/reduced.
- **`standard` (120x40)**: Toggle card spans 100% width with `paddingX={1}`. Type descriptions are visible but truncated. CLI hint is visible.
- **`large` (200x60+)**: Toggle card is centered with `width="80%"` and `paddingX={2}`. Full descriptions and web hints are visible.

## Implementation Plan

### Step 1: Create `NotificationPrefsTab` Component
**File**: `apps/tui/src/screens/settings/NotificationPrefsTab.tsx`
1. Scaffold the component taking `isActive: boolean` as a prop (if required by the tab routing system).
2. Integrate `useLayout()`, `useTheme()`, `useNotificationPreferences()`, `useUpdateNotificationPreferences()`, and `useUser()`.
3. Implement the local state machine for the toggle (`status`, `optimisticValue`, `errorMessage`).
4. Implement the toggle handler `handleToggle` with double-submit prevention, optimistic updates, and error reversion.
5. Build the UI tree using OpenTUI primitives (`<scrollbox>`, `<box>`, `<text>`).
6. Apply dynamic styling to the Toggle Card based on `isActive` and `toggleStatus` (yellow for saving, green for saved/on, red for error, bold for 16-color fallback).
7. Implement the responsive conditional rendering for notification type descriptions and subscription hints based on `breakpoint`.

### Step 2: Register Keybindings
**File**: `apps/tui/src/screens/settings/NotificationPrefsTab.tsx`
1. Use `useKeyboard` or `useScreenKeybindings` to register `Space`, `Enter`, `r`, and `R`.
2. Ensure standard vim navigation keys (`j`, `k`, `Ctrl+D`, `Ctrl+U`, `G`, `g g`) are passed down to or handled by the `<scrollbox>`.

### Step 3: Integrate into Settings Screen
**File**: `apps/tui/src/screens/SettingsScreen.tsx`
1. Import `NotificationPrefsTab`.
2. Add "Notifications" to the tab list (index 4 / tab 5).
3. Conditionally render `<NotificationPrefsTab isActive={activeTab === 4} />` when the 5th tab is selected.
4. Ensure the breadcrumb dynamically updates to `Dashboard > Settings > Notifications` when active.

## Unit & Integration Tests

**File**: `e2e/tui/settings.test.ts`

The following E2E tests will be implemented using `@microsoft/tui-test` and `bun:test`.

### Terminal Snapshot Tests
- `SNAP-NOTIFPREFS-001`: Render tab at 120x40 with notifications `[ON]`, full layout, types, and subscriptions.
- `SNAP-NOTIFPREFS-002`: Render tab at 120x40 with notifications `[OFF]`.
- `SNAP-NOTIFPREFS-003`: Render tab at 80x24 (minimum breakpoint) showing collapsed descriptions.
- `SNAP-NOTIFPREFS-004`: Render tab at 200x60 (large breakpoint) showing centered card and full hints.
- `SNAP-NOTIFPREFS-005`: Render `[Saving...]` state in warning color.
- `SNAP-NOTIFPREFS-006`: Render `[Saved ✓]` state in success color.
- `SNAP-NOTIFPREFS-007`: Render `ERROR_UPDATE` state showing "Press r to retry".
- `SNAP-NOTIFPREFS-008`: Render `ERROR_LOAD` full screen error showing "Press R to retry".

### Keyboard Interaction Tests
- `KEY-NOTIFPREFS-001`: Pressing `Space` toggles `[ON]` to `[OFF]` and invokes API.
- `KEY-NOTIFPREFS-002`: Pressing `Enter` toggles `[OFF]` to `[ON]`.
- `KEY-NOTIFPREFS-003`: Rapidly pressing `Space` 5 times only triggers one inflight API call (state machine guard).
- `KEY-NOTIFPREFS-004`: Pressing `r` after a failed update re-triggers the mutation.
- `KEY-NOTIFPREFS-005`: Pressing `R` after an initial load failure re-fetches the preferences.
- `KEY-NOTIFPREFS-006`: `j`, `k`, `Ctrl+D`, `Ctrl+U`, `G`, `g g` correctly scrolls the content when overflowing.

### Integration & Edge Case Tests
- `INT-NOTIFPREFS-001`: Successful `PUT` returns 200, sets `[Saved ✓]`, and settles to new value.
- `INT-NOTIFPREFS-002`: Failed `PUT` (500) reverts the optimistic toggle and renders inline error.
- `INT-NOTIFPREFS-003`: `PUT` returning 429 rate limit displays "Rate limited. Retry in {N}s."
- `EDGE-NOTIFPREFS-001`: Resizing the terminal during a `[Saving...]` state recalculates layout without dropping the saving state.
- `EDGE-NOTIFPREFS-002`: Returning a null value for `email_notifications_enabled` defaults to `[ON]`.