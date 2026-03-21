# TUI_SETTINGS_SSH_KEYS

Specification for TUI_SETTINGS_SSH_KEYS.

## High-Level User POV

The SSH Keys tab in Settings is where a Codeplane terminal user manages the SSH public keys registered to their account. These keys authenticate git-over-SSH operations and workspace SSH access across all repositories the user has permission to use. The screen is accessible as the third tab within the Settings screen, reachable via `g s` then pressing `3`, or directly via `:settings ssh-keys` in the command palette.

When the SSH Keys tab is selected, the breadcrumb updates to "Settings > SSH Keys". The screen renders in two zones: a key list occupying the main content area, and an "Add SSH Key" action accessible via the `a` keybinding. The key list is a vertical scrollable list inside a `<scrollbox>`, with each row displaying the key's human-readable title, a badge showing the algorithm type (e.g., "Ed25519", "RSA", "ECDSA"), the SHA256 fingerprint in a monospace-style rendering that matches the output of `ssh-add -l`, and a relative timestamp showing when the key was added. Keys are ordered with the most recently added key at the top.

Each key row is navigable via `j`/`k` (or arrow keys). The currently focused row is highlighted with reverse video or the `primary` color (ANSI 33) background. Pressing `Enter` on a focused key expands an inline detail panel showing the full fingerprint (which at minimum terminal widths may be truncated in the list row), the exact creation timestamp (ISO 8601 UTC), and the key type. Pressing `Enter` again or `Esc` collapses the detail panel.

When the list is empty — the user has no registered SSH keys — the screen displays a centered empty state message: "No SSH keys registered. Press `a` to add your first SSH key." with a secondary line in muted text: "SSH keys authenticate git operations and workspace access over SSH." This empty state guides new users through the critical first-time setup step.

Pressing `a` opens the Add SSH Key form as a modal overlay. The form has two fields: Title (a single-line `<input>` for a human-readable name like "Work Laptop") and Key (a multi-line `<input>` for pasting the public key content from a `.pub` file). The Title field receives initial focus. Navigation between fields uses `Tab` and `Shift+Tab`. The tab order is: Title → Key → Add → Cancel. Pressing `Ctrl+S` or `Enter` on the Add button submits the form. The key content may include a trailing comment (e.g., `user@host`), which the server strips automatically.

During submission, the Add button shows "Adding…" and all inputs are disabled. On success, a green "SSH key added" confirmation appears for 3 seconds, the modal closes, and the key list refreshes with the new key appearing at the top. On failure, the modal remains open with a red error banner. Common errors include: invalid key format ("Invalid SSH public key"), unsupported algorithm ("Unsupported key type"), and duplicate fingerprint ("This key is already registered").

Deleting a key is initiated by pressing `d` or `Delete` while a key row is focused. A confirmation bar appears at the bottom of the content area: `Delete SSH key "<title>"? This will revoke SSH access for machines using this key. [y/N]`. Pressing `y` executes the deletion. On success, the key is removed from the list with a brief status message "SSH key deleted" in green for 2 seconds. On failure, the confirmation bar is replaced with a red error message. Pressing `n`, `N`, or `Esc` dismisses the confirmation without deleting. If the deleted key was the last one, the empty state appears.

The fingerprint displayed in each row uses a fixed-width rendering. At minimum terminal width (80 columns), the fingerprint is truncated to fit the available space, showing the `SHA256:` prefix and the first several characters followed by `…`. At standard width (120 columns) and above, the full 50-character fingerprint is shown. The key type badge uses semantic color tokens: `primary` for Ed25519 (the recommended type), `muted` for all others.

The screen supports rapid keyboard interaction. Pressing `j` and `k` rapidly scrolls through the list without lag. The add form handles pasted multi-line key content correctly. The delete confirmation captures only `y`/`n`/`Esc` and ignores other keypresses to prevent accidental actions.

At minimum terminal size (80×24), the key list collapses to show only the title and a truncated fingerprint on a single line per row, with the key type and date hidden. At standard size (120×40), each key row displays on a single line with all four fields visible. At large size (200×60+), key rows have additional padding and the detail panel shows more context.

## Acceptance Criteria

### Definition of Done

- [ ] The SSH Keys tab renders as the third tab within the Settings screen
- [ ] The breadcrumb reads "Settings > SSH Keys" when the SSH Keys tab is active
- [ ] The screen is reachable via `g s` then `3`, or via `:settings ssh-keys` from the command palette
- [ ] Tab number `3` selects the SSH Keys tab when Settings screen has focus
- [ ] The key list is populated from `GET /api/user/keys` via `useSSHKeys()` hook
- [ ] Keys are displayed in descending `created_at` order (newest first)
- [ ] Each key row shows: title, key type badge, SHA256 fingerprint, and relative creation date
- [ ] The currently focused key row is highlighted with `primary` color (ANSI 33)
- [ ] `j`/`k` or `Down`/`Up` arrow keys navigate between key rows
- [ ] `Enter` on a focused key toggles an inline detail panel with full fingerprint, exact timestamp, and key type
- [ ] Empty state displays centered message with `a` hint when user has no keys
- [ ] A loading spinner is shown while the key list is initially fetching
- [ ] The key list scrolls within a `<scrollbox>` when keys exceed visible height

### Add Key Flow

- [ ] Pressing `a` opens the Add SSH Key modal overlay
- [ ] The modal has two fields: Title (single-line) and Key (multi-line)
- [ ] Title field receives initial focus when the modal opens
- [ ] Tab order: Title → Key → Add → Cancel
- [ ] `Ctrl+S` submits the form from any field position
- [ ] `Enter` on the Add button submits the form
- [ ] `Enter` on the Cancel button or `Esc` closes the modal
- [ ] The Add button shows "Adding…" and inputs are disabled during submission
- [ ] On success: green "SSH key added" confirmation for 3 seconds, modal closes, list refreshes
- [ ] On failure: red error banner in the modal with specific error message
- [ ] The new key appears at the top of the list after successful add
- [ ] Invalid key format returns "Invalid SSH public key" error
- [ ] Unsupported key type returns "Unsupported key type" error
- [ ] Duplicate fingerprint returns "This key is already registered" (409 Conflict)
- [ ] Title validation: 1–255 characters after trimming; empty title shows "Title is required"
- [ ] Key validation: non-empty; empty key field shows "Public key is required"
- [ ] Trailing comment on key string is accepted (server strips it)

### Delete Key Flow

- [ ] Pressing `d` or `Delete` on a focused key shows the delete confirmation bar
- [ ] Confirmation bar reads: `Delete SSH key "<title>"? This will revoke SSH access for machines using this key. [y/N]`
- [ ] `y` confirms deletion and calls `DELETE /api/user/keys/:id`
- [ ] `n`, `N`, or `Esc` dismisses the confirmation bar without deleting
- [ ] On successful deletion: key removed from list, green "SSH key deleted" message for 2 seconds
- [ ] On failed deletion: red error message replaces confirmation bar
- [ ] Deleting the last key transitions to the empty state
- [ ] Other keys during deletion confirmation: only `y`/`n`/`Esc` are processed

### Keyboard Interactions

- [ ] `j` / `Down`: Move focus to the next key row
- [ ] `k` / `Up`: Move focus to the previous key row
- [ ] `Enter`: Toggle inline detail panel for focused key
- [ ] `a`: Open Add SSH Key modal
- [ ] `d` / `Delete`: Initiate delete for focused key
- [ ] `G`: Jump to last key in list
- [ ] `g g`: Jump to first key in list
- [ ] `Ctrl+D`: Page down in key list
- [ ] `Ctrl+U`: Page up in key list
- [ ] `y`: Confirm deletion (only active during delete confirmation)
- [ ] `n` / `N`: Cancel deletion (only active during delete confirmation)
- [ ] `Esc`: Close modal, collapse detail panel, dismiss confirmation, or navigate back
- [ ] `Tab` / `Shift+Tab`: Navigate fields within the add form
- [ ] `Ctrl+S`: Submit add form from any field
- [ ] `R`: Retry on load or action error
- [ ] `?`: Toggle help overlay showing SSH Keys keybindings
- [ ] `1`–`7`: Switch between settings tabs
- [ ] `:`: Open command palette
- [ ] `Ctrl+C`: Quit TUI (global)

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the global router
- [ ] 80×24 – 119×39 (minimum): Single-line key rows with title and truncated fingerprint only. Key type badge and date hidden. Add modal uses 90% width. Detail panel shows on a new line below the key row
- [ ] 120×40 – 199×59 (standard): Single-line key rows with title, key type badge, full fingerprint, and relative date. Add modal uses 60% width. Detail panel shows inline
- [ ] 200×60+ (large): Key rows with additional padding. Wider input fields in add modal. Detail panel with extra metadata spacing

### Truncation and Boundary Constraints

- [ ] Key title display: truncated at available width with `…` if too long for the row
- [ ] Key title input: maximum 255 characters; input scrolls horizontally beyond visible width
- [ ] Key title input: character counter shown as `{current}/255` in muted text below the field
- [ ] Fingerprint display: full 50 characters at 120+ columns; truncated with `…` at 80 columns (minimum 20 characters visible including `SHA256:` prefix)
- [ ] Key input field: multi-line, scrollable, handles paste of full SSH public key lines (typically 400–800 characters for RSA, ~70 for Ed25519)
- [ ] Key type badge: abbreviated at minimum size ("Ed25519" → "Ed", "RSA" → "RSA", "ECDSA" → "EC")
- [ ] Relative date: abbreviated at minimum size ("3 days ago" → "3d")
- [ ] Error messages: truncated at terminal width minus 4 characters with `…`
- [ ] Confirmation bar text: truncated if title + prompt exceeds terminal width; title truncated first with `…`
- [ ] Maximum keys in list: no practical limit; `<scrollbox>` handles arbitrarily long lists with virtualized rendering
- [ ] Key list with 100+ keys: all keys rendered in a single scrollable list (no pagination required per API spec)

### Edge Cases

- [ ] Terminal resize while add modal is open: Modal repositions and resizes; field content and focus preserved
- [ ] Terminal resize while delete confirmation is active: Confirmation bar re-renders at new width; state preserved
- [ ] Terminal resize while detail panel is expanded: Panel re-renders with appropriate width; content preserved
- [ ] Add key during network disconnect: Red error banner with "Network error. Press R to retry."
- [ ] Delete key during network disconnect: Red error message replacing confirmation bar
- [ ] 401 on any request (token expired): "Session expired. Run `codeplane auth login` to re-authenticate."
- [ ] 409 on add (duplicate fingerprint): "This key is already registered" shown in modal error banner
- [ ] 422 on add (validation error): Server validation message shown in modal error banner
- [ ] 429 on any request (rate limit): "Rate limit exceeded. Try again in {retry-after} seconds."
- [ ] 500+ on any request (server error): "Server error" with request ID shown
- [ ] Initial key list fetch fails: Full-screen error with "Failed to load SSH keys. Press R to retry."
- [ ] Unicode characters in key title: Rendered correctly; wide characters consume 2 columns
- [ ] Very long key title (255 characters): Truncated in list view with `…`, full title visible in detail panel
- [ ] Pasting a private key: Server rejects with "Invalid SSH public key" (private keys don't parse as public keys)
- [ ] Pasting key with extra whitespace: Server accepts after trimming
- [ ] Rapid `j`/`k` presses: Processed sequentially, no focus skip, no lag
- [ ] Rapid `d` then `y` presses: Deletion confirmation processes correctly; no double-delete
- [ ] Add key, then immediately press `a` again: Previous success message dismissed, new modal opens
- [ ] Delete all keys one by one: Each deletion updates the list; final deletion shows empty state
- [ ] Key added via CLI or API appears on next list refresh or when returning to the SSH Keys tab
- [ ] Submitting add form with both fields empty: Both fields show validation errors simultaneously

## Design

### Layout Structure

The SSH Keys tab uses the Settings screen container with a vertical list layout. At standard (120×40) size:

```
┌──────────────────────────────────────────────────────────┐
│ Header: Settings > SSH Keys                               │
├──────────────────────────────────────────────────────────┤
│ [1:Profile] [2:Emails] [3:SSH Keys] [4:Tokens] ...       │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  SSH Keys                                    Press a:add  │
│  ─────────────────────────────────────────────────────    │
│                                                           │
│ ▸ Work Laptop    Ed25519  SHA256:uNiReF...7IwDcY  3d ago │
│   Home Desktop   RSA      SHA256:xK4mPq...9BzFhL  2w ago │
│   CI Runner      Ed25519  SHA256:pL8nWs...4TxGjM  1mo ago│
│                                                           │
├──────────────────────────────────────────────────────────┤
│ j/k:navigate  a:add  d:delete  Enter:details  ?:help     │
└──────────────────────────────────────────────────────────┘
```

At minimum (80×24): Single-line key rows with title and truncated fingerprint only. Key type badge and date hidden. Tab labels abbreviated.

Empty state: Centered message "No SSH keys registered. Press a to add your first SSH key." with muted explanation text.

Add SSH Key modal overlay: Centered modal with primary border, Title input (single-line, character counter), Key input (multi-line, 3-6 lines depending on terminal height), Add and Cancel buttons. Tab order: Title → Key → Add → Cancel.

Delete confirmation bar: Bottom bar with warning border showing key title and [y/N] prompt.

Inline detail panel: Bordered box below focused key row showing full fingerprint, key type, and exact ISO 8601 creation date.

### Component Tree

Uses OpenTUI components: `<box>` for flexbox layout, `<scrollbox>` for key list scrolling, `<text>` for labels/badges/fingerprints, `<input>` for form fields. Focused key row uses `▸` indicator and `primary` (ANSI 33) color. Key type badge: Ed25519 uses `primary`, others use `muted`. Delete confirmation uses `warning` (ANSI 178). Errors use `error` (ANSI 196). Success uses `success` (ANSI 34). Modal uses `primary` border with absolute positioning.

### Keybinding Reference

| Key | Context | Action |
|-----|---------|--------|
| `j` / `Down` | Key list | Move focus to next key |
| `k` / `Up` | Key list | Move focus to previous key |
| `Enter` | Key list, key focused | Toggle inline detail panel |
| `a` | Key list (no modal/confirmation) | Open Add SSH Key modal |
| `d` / `Delete` | Key list, key focused | Show delete confirmation |
| `G` | Key list | Jump to last key |
| `g g` | Key list | Jump to first key |
| `Ctrl+D` | Key list | Page down |
| `Ctrl+U` | Key list | Page up |
| `y` | Delete confirmation active | Confirm deletion |
| `n` / `N` / `Esc` | Delete confirmation active | Cancel deletion |
| `Tab` | Add modal | Next field |
| `Shift+Tab` | Add modal | Previous field |
| `Ctrl+S` | Add modal | Submit form |
| `Enter` | Add modal, Add button focused | Submit form |
| `Enter` | Add modal, Cancel button focused | Close modal |
| `Esc` | Add modal | Close modal |
| `Esc` | Detail panel expanded | Collapse detail panel |
| `Esc` | No modal/confirmation/detail | Navigate back |
| `R` | After load or action error | Retry operation |
| `1`–`7` | Settings tab bar | Switch settings tab |
| `?` | Any | Toggle help overlay |
| `:` | Any | Open command palette |

### Responsive Column Layout

| Breakpoint | Title Width | Key Type | Fingerprint | Date | Modal Width | Key Input Height |
|------------|-----------|----------|-------------|------|-------------|------------------|
| 80×24 | 20ch max | Hidden | Truncated (20ch) | Hidden | 90% | 3 lines |
| 120×40 | 30ch max | Badge (abbrev) | Full (50ch) | Relative | 60% | 4 lines |
| 200×60+ | 50ch max | Badge (full) | Full (50ch) | Relative | 50% | 6 lines |

### Data Hooks

- `useSSHKeys()` — Fetch the authenticated user's SSH key list (`GET /api/user/keys`). Returns `Array<{ id, name, fingerprint, key_type, created_at }>` sorted by `created_at` descending
- `useCreateSSHKey()` — Submit a new SSH key (`POST /api/user/keys`). Accepts `{ title: string, key: string }`. Returns created key summary. Invalidates `useSSHKeys()` cache on success
- `useDeleteSSHKey()` — Delete an SSH key (`DELETE /api/user/keys/:id`). Accepts `keyId: number`. Returns void. Invalidates `useSSHKeys()` cache on success
- `useTerminalDimensions()` — Current terminal size for responsive layout calculations
- `useOnResize(callback)` — Trigger re-layout on terminal resize
- `useKeyboard(handler)` — Register keybinding handler for list navigation, modal interaction, and shortcuts

### Navigation Context

The SSH Keys tab is part of the Settings screen, pushed via `g s` or `:settings`. Tab `3` selects it within the Settings tab bar. On add or delete success, the `useSSHKeys()` cache is invalidated and the list is refreshed from the server. The `a` keybinding is only active when no modal or confirmation bar is showing. The `d` keybinding is only active when a key row is focused and no modal or confirmation bar is showing. Navigating away from the SSH Keys tab preserves no form state (the add modal is always fresh).

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| Anonymous (no token) | Cannot access Settings. Auth error: "Run `codeplane auth login` to authenticate." |
| Authenticated user (read scope) | Can view SSH key list. Cannot add or delete keys (write scope required) |
| Authenticated user (write scope) | Full access: list, add, and delete own SSH keys |
| Admin | Full access to own keys. Admin management of other users' keys is web-only |

The SSH Keys screen only manages the authenticated user's own keys. There is no mechanism to view or manage another user's SSH keys from the TUI.

### Token Handling

- Auth via stored token from `codeplane auth login` or `CODEPLANE_TOKEN` environment variable
- Bearer token sent in `Authorization` header for all SSH key API calls
- `GET /api/user/keys` requires read scope (read-only PATs are sufficient)
- `POST /api/user/keys` and `DELETE /api/user/keys/:id` require write scope
- 401 on any request shows "Session expired. Run `codeplane auth login` to re-authenticate."
- 403 on add/delete with read-only token shows "Write access required. Use a write-capable token."
- No OAuth browser flow from TUI; authentication is fully delegated to CLI

### Rate Limiting

- All SSH key endpoints are subject to the standard API rate limit (60 requests/minute per user for reads, 30 requests/minute for mutations)
- 429 responses display "Rate limit exceeded. Try again in {retry-after} seconds."
- No automatic retry on rate limit; user must press `R` after the timer expires
- Key list data is cached in the `useSSHKeys()` hook; subsequent tab visits use cached data unless explicitly invalidated by add/delete operations

### Input Sanitization

- Title and key content are sent as-is; the server performs trimming and validation
- Key content is validated server-side: algorithm extraction, base64 decoding, fingerprint computation
- No client-side HTML stripping (terminal has no HTML interpreter; XSS is not applicable)
- Private keys pasted by mistake are rejected by the server's public key parser
- Title content supports arbitrary Unicode text

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.settings.ssh_keys.viewed` | SSH Keys tab rendered with data | `terminal_width`, `terminal_height`, `key_count`, `has_ed25519`, `has_rsa`, `has_ecdsa` |
| `tui.settings.ssh_keys.key_added` | Successful POST response | `key_type`, `title_length`, `duration_ms`, `terminal_width`, `terminal_height`, `resulting_key_count` |
| `tui.settings.ssh_keys.add_failed` | POST request fails | `error_code`, `error_message`, `key_type_attempted`, `duration_ms` |
| `tui.settings.ssh_keys.add_opened` | Add modal opened | `current_key_count`, `terminal_width`, `terminal_height` |
| `tui.settings.ssh_keys.add_cancelled` | Add modal cancelled | `had_title`, `had_key`, `duration_ms` |
| `tui.settings.ssh_keys.key_deleted` | Successful DELETE response | `key_id`, `key_type`, `key_age_days`, `remaining_key_count`, `duration_ms` |
| `tui.settings.ssh_keys.delete_failed` | DELETE request fails | `error_code`, `error_message`, `key_id`, `duration_ms` |
| `tui.settings.ssh_keys.delete_confirmed` | User presses `y` in confirmation | `key_id`, `time_to_confirm_ms` |
| `tui.settings.ssh_keys.delete_cancelled` | User presses `n`/`Esc` in confirmation | `key_id` |
| `tui.settings.ssh_keys.detail_expanded` | User expands inline detail panel | `key_id`, `key_type` |
| `tui.settings.ssh_keys.load_failed` | Initial GET request fails | `error_code`, `error_message` |
| `tui.settings.ssh_keys.duplicate_key_attempted` | 409 Conflict on add | `key_type` |

### Success Indicators

- Add completion rate: >80% of add modal opens result in successful key addition
- Delete completion rate: >80% of delete initiations result in successful deletion
- Time to add first key: <60s median from SSH Keys tab view to successful add (for users with 0 keys)
- Error recovery rate: >70% of add/delete failures result in successful retry within the same session
- Feature adoption: ratio of `ssh_keys.viewed` to total TUI sessions (indicates settings engagement)
- Load success rate: >99% of SSH Keys tab views load successfully on first attempt
- Zero-key-after-delete rate: <10% of deletions leave user with 0 remaining keys (indicates healthy credential hygiene, not accidental deletion)

## Observability

### Logging

| Level | Event | Details |
|-------|-------|--------|
| `info` | SSH Keys tab opened | `terminal_dimensions`, `key_count` |
| `info` | SSH key list loaded | `user_id`, `key_count`, `response_time_ms` |
| `info` | SSH key add submitted | `title_length`, `key_type` |
| `info` | SSH key added successfully | `key_id`, `key_type`, `response_time_ms` |
| `info` | SSH key delete submitted | `key_id` |
| `info` | SSH key deleted successfully | `key_id`, `response_time_ms` |
| `warn` | SSH key add failed (4xx) | `status_code`, `error_body` |
| `warn` | SSH key delete failed (4xx) | `status_code`, `error_body`, `key_id` |
| `error` | SSH key add failed (5xx) | `status_code`, `error_body`, `request_id` |
| `error` | SSH key delete failed (5xx) | `status_code`, `error_body`, `request_id`, `key_id` |
| `warn` | Token expired (401) | (none) |
| `warn` | Write scope required (403) | `operation` (`add` or `delete`) |
| `warn` | Rate limited (429) | `retry_after`, `operation` |
| `warn` | SSH key list load failed | `status_code`, `error_body` |
| `warn` | Duplicate key attempted (409) | `key_type` |
| `debug` | Key focus changed | `from_index`, `to_index`, `key_id` |
| `debug` | Detail panel toggled | `key_id`, `expanded` |
| `debug` | Add modal opened | `current_key_count` |
| `debug` | Add modal closed | `reason` (`submitted`, `cancelled`, `escaped`) |
| `debug` | Delete confirmation shown | `key_id`, `key_name` |
| `debug` | Terminal resize during SSH Keys | `old_dimensions`, `new_dimensions` |

### Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Network timeout on list load | Full-screen error: "Failed to load SSH keys" | Press `R` to retry |
| Network timeout on add | Error banner in modal with retry hint | Press `R` to retry (or resubmit) |
| Network timeout on delete | Error message replacing confirmation bar | Press `d` to re-initiate delete |
| 401 Unauthorized | "Session expired. Run `codeplane auth login` to re-authenticate." | Re-authenticate via CLI, relaunch TUI |
| 403 Forbidden (read-only token) | "Write access required. Use a write-capable token." | Re-authenticate with write-capable token |
| 409 Conflict (duplicate key) | "This key is already registered" in modal error banner | User should use existing key or provide different key |
| 422 Validation (invalid key format) | Server message shown in modal error banner (e.g., "Invalid SSH public key") | Correct input and resubmit |
| 422 Validation (empty title) | "Title is required" shown in modal error banner | Enter a title and resubmit |
| 422 Validation (title too long) | "Title must be 255 characters or fewer" in modal error banner | Shorten title and resubmit |
| 429 Rate Limited | "Rate limit exceeded. Try again in {N} seconds." | Wait and press `R` |
| 500+ Server Error | "Server error" with request ID | Press `R` to retry |
| SSE disconnect during operations | No impact (SSH key operations are REST, not SSE) | N/A |
| Resize below 80×24 during any state | "Terminal too small" message; all state preserved in memory | Resize back to 80×24+ |
| Resize during add modal | Modal repositions to center; field content preserved | Continue interaction |
| Resize during delete confirmation | Confirmation bar re-renders at new width; state preserved | Continue interaction |
| Token missing at startup | Settings screen shows auth error instead of tab content | Run `codeplane auth login` |

### Failure Modes

- Add key is atomic via a single `POST /api/user/keys`; no partial save state possible
- Delete key is atomic via a single `DELETE /api/user/keys/:id`; no partial delete state possible
- Network disconnection during add: If the request reached the server, the key is created. The TUI may show an error, but the key exists server-side. The next list load will reflect the addition
- Network disconnection during delete: If the request reached the server, the key is deleted. The TUI may show an error, but the key is gone server-side
- Long-running session: `useSSHKeys()` cache is invalidated on add/delete; stale data risk is minimal
- Memory: Key list is lightweight (5 fields per key × typically <20 keys); no memory growth concerns
- Terminal disconnect during add/delete: Server completes request; no cleanup needed client-side
- Concurrent add/delete from another client (CLI, web): TUI list becomes stale but refreshes on next tab visit or after any mutation

## Verification

### Terminal Snapshot Tests

- [ ] `TUI_SETTINGS_SSH_KEYS — renders key list at 120x40 with multiple keys showing title, type, fingerprint, date`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders key list at 80x24 minimum size with title and truncated fingerprint only`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders key list at 200x60 large size with full padding and metadata`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders focused key row with primary color and arrow indicator`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders second key focused after pressing j`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders empty state when user has no SSH keys`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders empty state with add hint text`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders add SSH key modal overlay at standard size`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders add SSH key modal at minimum size (90% width)`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders add modal with title field focused by default`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders add modal with key field focused after Tab`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders add modal with Add button focused after two Tabs`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders add modal with Cancel button focused after three Tabs`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders title character counter below title field`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders delete confirmation bar with key title`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders delete confirmation bar with truncated title at minimum width`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders inline detail panel when Enter pressed on focused key`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders detail panel with full fingerprint, key type, and exact date`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders error banner in add modal on validation failure`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders error banner for duplicate key (409)`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders green success message after key added`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders green success message after key deleted`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders adding state on Add button during submission`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders loading spinner during initial key list fetch`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders auth error when no token present`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders full-screen error when key list load fails`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders breadcrumb as Settings > SSH Keys`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders SSH Keys tab as selected in tab bar`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders Ed25519 key type badge with primary color`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders RSA key type badge with muted color`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders key type badge abbreviated at minimum size`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders relative date abbreviated at minimum size`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders error message for delete failure replacing confirmation bar`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders write scope required error (403)`
- [ ] `TUI_SETTINGS_SSH_KEYS — renders rate limit error with retry-after countdown`

### Keyboard Interaction Tests

- [ ] `TUI_SETTINGS_SSH_KEYS — j moves focus to next key in list`
- [ ] `TUI_SETTINGS_SSH_KEYS — k moves focus to previous key in list`
- [ ] `TUI_SETTINGS_SSH_KEYS — Down arrow moves focus to next key`
- [ ] `TUI_SETTINGS_SSH_KEYS — Up arrow moves focus to previous key`
- [ ] `TUI_SETTINGS_SSH_KEYS — first key is focused by default on load`
- [ ] `TUI_SETTINGS_SSH_KEYS — j on last key does not wrap or crash`
- [ ] `TUI_SETTINGS_SSH_KEYS — k on first key does not wrap or crash`
- [ ] `TUI_SETTINGS_SSH_KEYS — G jumps to last key in list`
- [ ] `TUI_SETTINGS_SSH_KEYS — g g jumps to first key in list`
- [ ] `TUI_SETTINGS_SSH_KEYS — Ctrl+D pages down in key list`
- [ ] `TUI_SETTINGS_SSH_KEYS — Ctrl+U pages up in key list`
- [ ] `TUI_SETTINGS_SSH_KEYS — Enter toggles detail panel on focused key`
- [ ] `TUI_SETTINGS_SSH_KEYS — Enter on expanded key collapses detail panel`
- [ ] `TUI_SETTINGS_SSH_KEYS — Esc collapses expanded detail panel`
- [ ] `TUI_SETTINGS_SSH_KEYS — a opens add SSH key modal`
- [ ] `TUI_SETTINGS_SSH_KEYS — a is ignored while add modal is open`
- [ ] `TUI_SETTINGS_SSH_KEYS — a is ignored while delete confirmation is active`
- [ ] `TUI_SETTINGS_SSH_KEYS — d shows delete confirmation for focused key`
- [ ] `TUI_SETTINGS_SSH_KEYS — Delete key shows delete confirmation for focused key`
- [ ] `TUI_SETTINGS_SSH_KEYS — d is ignored when no keys exist (empty state)`
- [ ] `TUI_SETTINGS_SSH_KEYS — y in delete confirmation triggers deletion`
- [ ] `TUI_SETTINGS_SSH_KEYS — n in delete confirmation dismisses confirmation`
- [ ] `TUI_SETTINGS_SSH_KEYS — N in delete confirmation dismisses confirmation`
- [ ] `TUI_SETTINGS_SSH_KEYS — Esc in delete confirmation dismisses confirmation`
- [ ] `TUI_SETTINGS_SSH_KEYS — other keys during delete confirmation are ignored`
- [ ] `TUI_SETTINGS_SSH_KEYS — Tab cycles through add modal fields in order`
- [ ] `TUI_SETTINGS_SSH_KEYS — Shift+Tab cycles backward through add modal fields`
- [ ] `TUI_SETTINGS_SSH_KEYS — Ctrl+S in add modal title field submits form`
- [ ] `TUI_SETTINGS_SSH_KEYS — Ctrl+S in add modal key field submits form`
- [ ] `TUI_SETTINGS_SSH_KEYS — Enter on Add button submits form`
- [ ] `TUI_SETTINGS_SSH_KEYS — Enter on Cancel button closes modal`
- [ ] `TUI_SETTINGS_SSH_KEYS — Esc closes add modal`
- [ ] `TUI_SETTINGS_SSH_KEYS — typing in title field updates value and character counter`
- [ ] `TUI_SETTINGS_SSH_KEYS — pasting key content into key field updates value`
- [ ] `TUI_SETTINGS_SSH_KEYS — R after load error retries key list fetch`
- [ ] `TUI_SETTINGS_SSH_KEYS — R after add error retries submission`
- [ ] `TUI_SETTINGS_SSH_KEYS — tab number 3 selects SSH Keys tab`
- [ ] `TUI_SETTINGS_SSH_KEYS — ? toggles help overlay`
- [ ] `TUI_SETTINGS_SSH_KEYS — Ctrl+S with empty title and key shows both validation errors`

### Responsive Resize Tests

- [ ] `TUI_SETTINGS_SSH_KEYS — resize from 120x40 to 80x24 hides key type and date columns`
- [ ] `TUI_SETTINGS_SSH_KEYS — resize from 80x24 to 120x40 shows key type and date columns`
- [ ] `TUI_SETTINGS_SSH_KEYS — resize from 120x40 to 200x60 expands layout with wider spacing`
- [ ] `TUI_SETTINGS_SSH_KEYS — resize from 200x60 to 80x24 compresses all columns`
- [ ] `TUI_SETTINGS_SSH_KEYS — resize during add modal repositions modal to center`
- [ ] `TUI_SETTINGS_SSH_KEYS — resize during add modal preserves field content and focus`
- [ ] `TUI_SETTINGS_SSH_KEYS — resize during delete confirmation re-renders bar at new width`
- [ ] `TUI_SETTINGS_SSH_KEYS — resize during expanded detail panel adjusts panel width`
- [ ] `TUI_SETTINGS_SSH_KEYS — resize below 80x24 shows too-small message`
- [ ] `TUI_SETTINGS_SSH_KEYS — resize from below 80x24 back to 120x40 restores key list`

### Error Handling Tests

- [ ] `TUI_SETTINGS_SSH_KEYS — 401 on key list load shows session expired message`
- [ ] `TUI_SETTINGS_SSH_KEYS — 401 on add shows session expired message`
- [ ] `TUI_SETTINGS_SSH_KEYS — 401 on delete shows session expired message`
- [ ] `TUI_SETTINGS_SSH_KEYS — 403 on add shows write scope required message`
- [ ] `TUI_SETTINGS_SSH_KEYS — 403 on delete shows write scope required message`
- [ ] `TUI_SETTINGS_SSH_KEYS — 409 on add shows duplicate key error in modal`
- [ ] `TUI_SETTINGS_SSH_KEYS — 422 on add shows validation error in modal`
- [ ] `TUI_SETTINGS_SSH_KEYS — 422 invalid key format shows specific error message`
- [ ] `TUI_SETTINGS_SSH_KEYS — 422 unsupported key type shows specific error message`
- [ ] `TUI_SETTINGS_SSH_KEYS — 422 empty title shows title required error`
- [ ] `TUI_SETTINGS_SSH_KEYS — 429 on list load shows rate limit message with retry-after`
- [ ] `TUI_SETTINGS_SSH_KEYS — 429 on add shows rate limit message`
- [ ] `TUI_SETTINGS_SSH_KEYS — 429 on delete shows rate limit message`
- [ ] `TUI_SETTINGS_SSH_KEYS — 500 on list load shows server error with request ID`
- [ ] `TUI_SETTINGS_SSH_KEYS — 500 on add shows server error in modal`
- [ ] `TUI_SETTINGS_SSH_KEYS — 500 on delete shows server error replacing confirmation`
- [ ] `TUI_SETTINGS_SSH_KEYS — network timeout on list load shows retry hint`
- [ ] `TUI_SETTINGS_SSH_KEYS — network timeout on add shows retry hint in modal`
- [ ] `TUI_SETTINGS_SSH_KEYS — network timeout on delete shows error message`

### Integration Tests

- [ ] `TUI_SETTINGS_SSH_KEYS — e2e add Ed25519 SSH key flow (open modal, fill fields, submit, verify in list)`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e add RSA SSH key flow`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e add ECDSA SSH key flow`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e add key with Unicode title`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e add key with maximum length title (255 characters)`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e add key with trailing comment in key content`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e add key then verify fingerprint matches expected`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e add duplicate key and verify 409 error`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e add key with invalid format and verify validation error`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e delete key flow (focus key, press d, confirm y, verify removed)`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e delete key flow with cancel (press d, press n, verify key remains)`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e delete last key transitions to empty state`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e navigate to SSH Keys via g s then 3`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e navigate to SSH Keys via command palette`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e cancel add modal via Esc`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e cancel add modal via Cancel button`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e expand and collapse detail panel`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e add key from empty state, verify list appears`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e add multiple keys, verify ordering (newest first)`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e delete middle key, verify remaining keys in correct order`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e key added via API appears in TUI key list`
- [ ] `TUI_SETTINGS_SSH_KEYS — e2e key deleted via API disappears from TUI key list on refresh`
