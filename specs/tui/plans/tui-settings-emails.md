# Implementation Plan: TUI_SETTINGS_EMAILS (Settings Emails Tab)

## 1. Overview
This plan details the steps to implement the Settings Emails tab within the Codeplane TUI. The implementation relies on React 19, OpenTUI components (`<box>`, `<scrollbox>`, `<text>`, `<input>`), and shared data hooks from `@codeplane/ui-core`. It introduces responsive layouts adapting to terminal width, keyboard-first navigation for the email list and add-email form, and optimistic UI updates for mutating email states.

## 2. File Operations

### Files to Create
- `apps/tui/src/screens/settings/SettingsScreen.tsx`: The main settings container with tabbed navigation.
- `apps/tui/src/screens/settings/EmailsTab.tsx`: The emails tab component.
- `e2e/tui/settings.test.ts`: The E2E tests for the Settings screen.

### Files to Modify
- `apps/tui/src/router/registry.ts`: Register the `SettingsScreen`.

## 3. Step-by-Step Implementation

### Step 3.1: Register the Settings Screen
**Target:** `apps/tui/src/router/registry.ts`
- Import `SettingsScreen` from `../screens/settings/SettingsScreen`.
- Update the registry for `ScreenName.Settings` to map to `SettingsScreen` instead of `PlaceholderScreen`.

### Step 3.2: Implement the Main Settings Screen Container
**Target:** `apps/tui/src/screens/settings/SettingsScreen.tsx`
- Create a functional component that manages a `activeTabIndex` state.
- Define tabs: `["Profile", "Emails", "SSH Keys", "Tokens", "Notifications", "Accounts"]`.
- Use `useScreenKeybindings` to register `Tab` and `Shift+Tab` to cycle `activeTabIndex`, and `1-9` keys to jump to specific tabs.
- Render a `<box flexDirection="column">`.
- Render the tab header using `<box flexDirection="row">` with active tab highlighting.
- Conditionally render `<EmailsTab />` when `activeTabIndex === 1`.
- Pass focus state down to the active tab.

### Step 3.3: Scaffold the Emails Tab Layout
**Target:** `apps/tui/src/screens/settings/EmailsTab.tsx`
- Setup basic layout with `<box flexDirection="column" height="100%">`.
- Split the layout into two main sections:
  1. **Add Email Form** (top)
  2. **Email List** wrapped in a `<scrollbox>` (bottom)

### Step 3.4: Integrate Data Hooks and Local State
**Target:** `apps/tui/src/screens/settings/EmailsTab.tsx`
- Import data hooks from `@codeplane/ui-core`: `useUserEmails`, `useAddEmail`, `useDeleteEmail`, `useSendVerification`, `useSetPrimaryEmail`.
- Define local state:
  ```typescript
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [isPrimaryChecked, setIsPrimaryChecked] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [verifyCooldowns, setVerifyCooldowns] = useState<Record<number, number>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  ```

### Step 3.5: Implement the Add Email Form
**Target:** `apps/tui/src/screens/settings/EmailsTab.tsx`
- Use `useTerminalDimensions()` or `useLayout()` to determine if the terminal is at minimum size (< 120 width). If so, use `flexDirection="column"`, else `flexDirection="row"`.
- Render the `<input>` component. Control it with `emailInput` and `setEmailInput`.
- Display `[x] Set as primary` or `[ ] Set as primary` toggle text.
- Below the input, render `validationError` in red (`theme.error`) if present.
- Handle maximum limit: if `emails.length >= 10`, disable input and display a warning message.

### Step 3.6: Implement the Email List & Responsive Rows
**Target:** `apps/tui/src/screens/settings/EmailsTab.tsx`
- Sort `emails` data: primary first, then by `created_at`.
- Map over the sorted emails inside the `<scrollbox>`.
- For each row:
  - Highlight if `focusedIndex === index`.
  - Render columns conditionally based on terminal width:
    - Width >= 120: Show Address, Status (Primary/Verified), Date.
    - Width < 120: Truncate Address strictly, hide Date.
  - If `deleteConfirmId === email.id`, render a prompt: `Remove {email.address}? [y/N]` directly below the row.

### Step 3.7: Implement Keyboard Navigation & Action Handlers
**Target:** `apps/tui/src/screens/settings/EmailsTab.tsx`
- Use `useScreenKeybindings` with high priority to override global keys when appropriate.
- **Input Mode (`isInputFocused === true`):**
  - `Esc`: Clear focus, set `isInputFocused = false`.
  - `Space`: Toggle `isPrimaryChecked`.
  - `Enter`: Validate input (len >= 3, contains `@`). If valid, call `addEmail`. If invalid, set `validationError`.
- **List Mode (`isInputFocused === false`):**
  - `j` / `Down`: Increment `focusedIndex` (clamp to max).
  - `k` / `Up`: Decrement `focusedIndex` (clamp to 0).
  - `g g` / `G`: Jump to top/bottom.
  - `a`: Set `isInputFocused = true`.
  - `d`: If the focused email is not primary, set `deleteConfirmId = focusedEmail.id`.
  - `p`: If verified and not primary, call `setPrimary(focusedEmail.id)`.
  - `v`: If unverified and cooldown expired, call `sendVerification(focusedEmail.id)` and update `verifyCooldowns`.
- **Delete Confirm Mode (`deleteConfirmId !== null`):**
  - `y`: Call `deleteEmail(deleteConfirmId)`, then reset `deleteConfirmId`.
  - `n` / `Esc`: Reset `deleteConfirmId`.

### Step 3.8: Status Bar Hints
**Target:** `apps/tui/src/screens/settings/EmailsTab.tsx`
- Use the TUI context (or global store) to update the status bar keybinding hints dynamically based on the `focusedIndex` email state (e.g., hide `[d] Delete` if it's the primary email).

## 4. Testing Plan

**Target:** `e2e/tui/settings.test.ts`
Create a new E2E test file using `@microsoft/tui-test` to validate the implementation.

### Snapshot Tests
- `TUI_SETTINGS_EMAILS — emails tab renders with email list at 120x40`
- `TUI_SETTINGS_EMAILS — emails tab renders at 80x24 minimum size` (assert date is hidden)
- `TUI_SETTINGS_EMAILS — emails tab renders at 200x60 large size`
- `TUI_SETTINGS_EMAILS — empty email list renders empty state`
- `TUI_SETTINGS_EMAILS — client-side validation error renders below input`
- `TUI_SETTINGS_EMAILS — max emails message renders when at limit`

### Interaction Tests
- `TUI_SETTINGS_EMAILS — j/k moves focus up and down the email row list`
- `TUI_SETTINGS_EMAILS — a focuses add-email input and Esc returns focus to list`
- `TUI_SETTINGS_EMAILS — Enter submits the add-email form`
- `TUI_SETTINGS_EMAILS — d then y deletes non-primary email with inline confirmation`
- `TUI_SETTINGS_EMAILS — d on primary email is inert`
- `TUI_SETTINGS_EMAILS — v on unverified email sends verification and enters cooldown`
- `TUI_SETTINGS_EMAILS — Space toggles the primary checkbox in the add form`

### Error & Edge Case Tests
- `TUI_SETTINGS_EMAILS — single email user cannot delete their only email`
- `TUI_SETTINGS_EMAILS — 500 on add preserves input value for retry`
- `TUI_SETTINGS_EMAILS — 500 on delete reverts optimistic removal from list`