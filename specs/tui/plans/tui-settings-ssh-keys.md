# Implementation Plan: TUI Settings SSH Keys

This document outlines the step-by-step implementation for the Codeplane TUI Settings SSH Keys tab, based on the engineering specifications and architectural constraints.

## 1. Data Hooks Implementation
**File:** `packages/ui-core/src/hooks/useSSHKeys.ts` (or `specs/tui/packages/ui-core/src/hooks/useSSHKeys.ts` per workspace setup)

*   **Action:** Create a new file to export React hooks for managing SSH keys.
*   **Details:**
    *   Implement `useSSHKeys()`: Uses `@codeplane/sdk` to fetch the list of SSH keys via `listSSHKeys()`. Should return `{ keys, isLoading, error, refetch }`.
    *   Implement `useCreateSSHKey()`: Uses `createSSHKey({ title, key })` from the SDK. Should return `{ createKey, isCreating, error }`. Must handle API errors like 409 and 422.
    *   Implement `useDeleteSSHKey()`: Uses `deleteSSHKey(id)` from the SDK. Should return `{ deleteKey, isDeleting, error }`.
    *   Ensure that successful creation or deletion invalidates the cache or triggers a `refetch` for the list.

## 2. Implement the SSH Key Row Component
**File:** `apps/tui/src/screens/settings/components/SSHKeyRow.tsx`

*   **Action:** Create the UI component for rendering a single SSH key in the list.
*   **Props:** `keyItem` (id, title, fingerprint, key_type, created_at), `isFocused` (boolean), `isExpanded` (boolean), `isConfirmingDelete` (boolean), `breakpoint` ('minimum' | 'standard' | 'large').
*   **Layout & Logic:**
    *   Return a `<box flexDirection="column">`.
    *   **Delete Confirmation:** If `isConfirmingDelete` is true, render a warning box with yellow border (`warning` token) displaying: `Delete SSH key "{title}"? This will revoke SSH access for machines using this key. [y/N]`.
    *   **Normal Row:** Render a `<box flexDirection="row">`.
        *   Apply `primary` background and text inversion if `isFocused` is true, along with a `▸` indicator.
        *   **Responsive Columns:**
            *   `minimum` (80x24): Title (truncate 20ch), Fingerprint (truncate `SHA256:...`).
            *   `standard` (120x40): Title (truncate 30ch), Key Type (abbreviated), Fingerprint (50ch), Created At (relative).
            *   `large` (200x60+): Full Title (50ch max), Full Key Type, Full Fingerprint, Created At (relative).
    *   **Detail Panel:** If `isExpanded` is true, render a nested indented `<box flexDirection="column">` showing the full exact ISO 8601 timestamp, the un-abbreviated `key_type`, and the complete `fingerprint`.

## 3. Implement the Add SSH Key Modal
**File:** `apps/tui/src/screens/settings/components/AddSSHKeyModal.tsx`

*   **Action:** Create a modal form for adding new SSH keys.
*   **Props:** `onClose: () => void`, `onSuccess: () => void`.
*   **State:** `title` (string), `keyContent` (string), `errorMessage` (string | null), `isSubmitting` (boolean).
*   **Layout & Logic:**
    *   Use an absolute positioned `<box position="absolute" top="center" left="center" zIndex={100} border="single">`.
    *   Responsive width: 90% (`minimum`), 60% (`standard`), 50% (`large`).
    *   Render an `<input>` for Title and a `<textarea>` for the Key.
    *   Render `[ Add ]` and `[ Cancel ]` buttons at the bottom.
    *   **Keyboard Handling:** Trap focus. Cycle with `Tab`/`Shift+Tab`. Close on `Esc`. Submit on `Ctrl+S` or `Enter` on the Add button.
    *   **Submission:** Call `useCreateSSHKey({ title, key: keyContent })`. Handle 409 (Duplicate) and 422 (Validation) errors by setting `errorMessage` to display in a red banner at the top. On success, call `onSuccess()`.

## 4. Implement the SSH Keys Tab Screen
**File:** `apps/tui/src/screens/settings/tabs/SSHKeysTab.tsx`

*   **Action:** Create the main tab component coordinating the list and modal.
*   **State:** `focusedIndex` (number), `expandedKeyIds` (Set<string>), `isAddModalOpen` (boolean), `deleteCandidateId` (string | null), `toastMessage` (string | null).
*   **Data:** Fetch keys via `useSSHKeys()`. Handle loading (`<text>Loading...</text>`) and error states (`Press R to retry`).
*   **Keyboard Bindings:**
    *   Use `useScreenKeybindings` (or equivalent hook).
    *   Navigation: `j`/`Down`, `k`/`Up`, `g g`, `G`, `Ctrl+D`, `Ctrl+U` to change `focusedIndex`.
    *   Detail: `Enter` toggles `expandedKeyIds` for the focused item.
    *   Add: `a` opens the `AddSSHKeyModal`.
    *   Delete: `d` sets `deleteCandidateId`. When active, intercept `y` to confirm deletion (calling `useDeleteSSHKey()`) or `n`/`Esc` to cancel.
*   **Layout:**
    *   Empty state: `<text align="center">No SSH keys registered. Press a to add your first SSH key.</text>` if `keys.length === 0`.
    *   List: Render `<scrollbox>` wrapping mapped `SSHKeyRow` components.
    *   Modal: Conditionally render `<AddSSHKeyModal>` if `isAddModalOpen` is true.

## 5. Integrate into the Settings Screen & Routing
**File:** `apps/tui/src/screens/settings/SettingsScreen.tsx`
*   **Action:** Create the main Settings screen shell.
*   **Logic:** Implement tab navigation. Include `SSHKeysTab` (e.g., at tab index 3). Render the breadcrumb as `Settings > SSH Keys`. Ensure global `1`-`7` and `Tab` bindings work when modals are closed.

**File:** `apps/tui/src/router/registry.ts`
*   **Action:** Update the routing registry.
*   **Logic:** Import `SettingsScreen` and replace the existing `PlaceholderScreen` for `ScreenName.Settings`.

## 6. E2E Testing
**File:** `e2e/tui/settings.test.ts`

*   **Action:** Create end-to-end tests using `@microsoft/tui-test`.
*   **Test Cases:**
    *   **Snapshots:**
        *   `TUI_SETTINGS_SSH_KEYS — renders key list at 120x40 with multiple keys showing title, type, fingerprint, date`.
        *   `TUI_SETTINGS_SSH_KEYS — renders key list at 80x24 minimum size`.
        *   `TUI_SETTINGS_SSH_KEYS — renders add SSH key modal overlay at standard size` (trigger with `a`).
        *   `TUI_SETTINGS_SSH_KEYS — renders delete confirmation bar` (trigger with `d`).
        *   `TUI_SETTINGS_SSH_KEYS — renders inline detail panel` (trigger with `Enter`).
        *   `TUI_SETTINGS_SSH_KEYS — renders empty state`.
    *   **Interactions:**
        *   Verify list navigation (`j`, `k`, `G`, `g g`).
        *   Verify detail toggle (`Enter` opens/closes details).
        *   Verify full Add Flow (`a` -> fill fields -> `Ctrl+S` -> assert API call and success message).
        *   Verify full Delete Flow (`d` -> `y` -> assert API call and key removal).
    *   **Error Handling:**
        *   Mock Add endpoint to return 409 -> assert "This key is already registered" banner.
        *   Mock Add endpoint to return 422 -> assert "Invalid SSH public key" banner.
        *   Submit empty fields -> assert "Title is required" validation.
        *   Mock List endpoint to fail -> assert "Failed to load SSH keys. Press R to retry."