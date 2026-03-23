# Engineering Specification: TUI Settings SSH Keys

## Title
Implement Settings SSH Keys tab with add/delete/detail actions

## Context
This specification details the implementation of the "SSH Keys" tab within the Codeplane TUI Settings screen. The TUI caters to terminal-native developers and provides full management capabilities for SSH keys used to authenticate git-over-SSH and workspace access. Following the architecture, the UI will be built with React 19 and OpenTUI, using an absolute-positioned modal for the add key form, inline and bottom-bar states for deletion confirmation, and responsive column layouts depending on terminal dimensions.

## Implementation Plan

### 1. Data Hooks & Types Integration
**Target:** `@codeplane/ui-core/src/hooks/useSSHKeys.ts` (or equivalent data layer file)
*   Ensure the `useSSHKeys` hook exists, returning an array of SSH keys (`id`, `title`, `fingerprint`, `key_type`, `created_at`).
*   Ensure `useCreateSSHKey` mutation hook exists (accepts `{ title, key }`, returns created key or throws standard API errors including 409 Conflict and 422 Validation).
*   Ensure `useDeleteSSHKey` mutation hook exists (accepts `keyId`).
*   Implement optimistic caching or ensure cache invalidation on successful mutations.

### 2. Implement the SSH Key Row Component
**Target:** `apps/tui/src/screens/settings/components/SSHKeyRow.tsx`
*   Create a component that renders a single SSH key row.
*   **Props:** `keyItem`, `isFocused`, `isExpanded`, `isConfirmingDelete`, `breakpoint`.
*   **Layout:**
    *   If `isConfirmingDelete`: Render a bottom bar/inline warning with yellow border (`warning` token) displaying: `Delete SSH key "{title}"? This will revoke SSH access for machines using this key. [y/N]`.
    *   Else: Render a flexbox row.
*   **Responsive Columns (based on `breakpoint`):**
    *   `minimum` (80x24): Show only `title` (truncated to max 20ch) and `fingerprint` (truncated to `SHA256:...`). Hide `key_type` and `created_at`.
    *   `standard` (120x40): Show `title` (max 30ch), `key_type` badge (abbreviated, e.g., "Ed" or "RSA"), full `fingerprint` (50ch), and relative `created_at`.
    *   `large` (200x60+): Show full `title` (max 50ch), full `key_type` badge ("Ed25519" in `primary` color, others in `muted`), full `fingerprint`, and relative `created_at`.
*   **Detail Panel:**
    *   If `isExpanded` is true, render an additional indented `<box>` directly below the row. Display the full exact ISO 8601 timestamp, the full `key_type`, and the un-truncated `fingerprint`.
*   **Styling:** Focused rows are highlighted with a `▸` cursor and `primary` ANSI 33 background/text inversion.

### 3. Implement the Add SSH Key Modal
**Target:** `apps/tui/src/screens/settings/components/AddSSHKeyModal.tsx`
*   Create a form modal using the `ModalSystem` (rendered via `OverlayLayer`).
*   **Props:** `onClose`, `onSuccess`.
*   **State:** `title` (string), `keyContent` (string), `errorMessage` (string | null), `isSubmitting` (boolean).
*   **Layout:**
    *   Responsive width: 90% for `minimum`, 60% for `standard`, 50% for `large`.
    *   Two inputs: Title `<input>` (single-line) and Key `<textarea>` (multi-line, 3-6 lines depending on height).
    *   Bottom row with `[ Add ]` and `[ Cancel ]` buttons.
    *   Character counter for the Title input (e.g., `{title.length}/255`).
*   **Keyboard Handling:**
    *   Trap focus within the modal.
    *   `Tab` / `Shift+Tab` to cycle: Title -> Key -> Add -> Cancel.
    *   `Esc` or `Enter` on Cancel closes the modal.
    *   `Ctrl+S` from any field, or `Enter` on Add, triggers submission.
*   **Submission Logic:**
    *   Clear previous errors.
    *   Call `useCreateSSHKey({ title, key: keyContent })`.
    *   Set `isSubmitting = true`, change Add button text to "Adding...".
    *   On success: call `onSuccess()`.
    *   On error: parse error. Handle 409 ("This key is already registered"), 422 ("Invalid SSH public key", "Title is required"), or network errors, and set `errorMessage` to display in a red banner at the top of the modal.

### 4. Implement the SSH Keys Tab Screen
**Target:** `apps/tui/src/screens/settings/tabs/SSHKeysTab.tsx`
*   Create the main tab component.
*   **State:**
    *   `focusedIndex` (number)
    *   `expandedKeyIds` (Set<string>)
    *   `isAddModalOpen` (boolean)
    *   `deleteCandidateId` (string | null)
    *   `toastMessage` (string | null) for success feedback.
*   **Data Fetching:** Use `useSSHKeys()`. Handle loading (show `<text>Loading...</text>`) and error states (show retry hint `Press R to retry`).
*   **Keybindings (via `useScreenKeybindings`):**
    *   `j`/`Down`, `k`/`Up`, `g g`, `G`, `Ctrl+D`, `Ctrl+U` to update `focusedIndex`.
    *   `Enter`: Toggle the ID of `items[focusedIndex]` in `expandedKeyIds`.
    *   `a`: Set `isAddModalOpen = true` (ignored if modal or delete confirmation is open).
    *   `d` / `Delete`: Set `deleteCandidateId = items[focusedIndex].id` (ignored if empty state).
    *   *When `deleteCandidateId` is active:* Trap keys to only accept `y` (confirm delete), `n`/`N`/`Esc` (cancel delete).
*   **Delete Action:**
    *   On `y`, call `useDeleteSSHKey()`. On success, set toast message "SSH key deleted", reset `deleteCandidateId`, and ensure `focusedIndex` is clamped to the new array bounds.
*   **Rendering:**
    *   If `items.length === 0`: Render centered empty state "No SSH keys registered. Press a to add your first SSH key."
    *   Use `<scrollbox>` (or the shared `ScrollableList`) to render the list of `SSHKeyRow` components.
    *   Render `AddSSHKeyModal` conditionally if `isAddModalOpen`.

### 5. Integrate into the Settings Screen
**Target:** `apps/tui/src/screens/settings/SettingsScreen.tsx`
*   Import `SSHKeysTab`.
*   Add it to the settings tab registry (position 3).
*   When tab `3` is active:
    *   Update breadcrumb to `Settings > SSH Keys`.
    *   Render the `<SSHKeysTab />` component.
    *   Ensure settings-level tab keybindings (`1`-`7`, `Tab`) correctly route when no child modal is capturing focus.

## Unit & Integration Tests

**Target:** `e2e/tui/settings.test.ts`
Implement tests using `@microsoft/tui-test`.

### Snapshot Tests
*   `TUI_SETTINGS_SSH_KEYS — renders key list at 120x40 with multiple keys showing title, type, fingerprint, date`: Setup mock keys, assert standard layout snapshot.
*   `TUI_SETTINGS_SSH_KEYS — renders key list at 80x24 minimum size`: Assert truncated columns snapshot.
*   `TUI_SETTINGS_SSH_KEYS — renders add SSH key modal overlay at standard size`: Press `a`, assert modal UI snapshot including fields and buttons.
*   `TUI_SETTINGS_SSH_KEYS — renders delete confirmation bar`: Focus key, press `d`, assert confirmation warning snapshot.
*   `TUI_SETTINGS_SSH_KEYS — renders inline detail panel`: Focus key, press `Enter`, assert detail panel snapshot.
*   `TUI_SETTINGS_SSH_KEYS — renders empty state`: Return empty array from mock, assert empty state layout.

### Interaction & Keyboard Flow Tests
*   **List Navigation:** Verify `j`, `k`, `G`, `g g` correctly update the focused row indicator.
*   **Detail Toggle:** Verify `Enter` opens the detail view for the focused key, and `Esc` or `Enter` closes it.
*   **Add Flow:**
    *   Press `a` to open modal.
    *   Verify `Tab` cycles focus between Title, Key, Add, Cancel.
    *   Type text into fields, press `Ctrl+S`.
    *   Verify API mock is called with correct payload.
    *   Verify success message appears and list updates.
*   **Delete Flow:**
    *   Focus key, press `d`.
    *   Press `n` to cancel, verify confirmation closes and key remains.
    *   Press `d` again, press `y` to confirm.
    *   Verify API mock is called, key is removed from list, and "SSH key deleted" message appears.

### Error Handling Tests
*   **409 Duplicate Key:** Mock the add endpoint to return 409. Fill modal, submit, assert error banner displays "This key is already registered".
*   **422 Validation Error:** Mock the add endpoint to return 422. Fill modal with invalid key, submit, assert error banner displays "Invalid SSH public key".
*   **Empty Title Submission:** Press `Enter` on Add with empty fields, assert inline validation errors "Title is required" and "Public key is required".
*   **Load Failure:** Mock the list endpoint to fail or timeout. Assert the UI renders the full-screen error "Failed to load SSH keys. Press R to retry."
