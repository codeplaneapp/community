# TUI_REPO_SETTINGS_VIEW

Specification for TUI_REPO_SETTINGS_VIEW.

## High-Level User POV

The settings view is the sixth and final tab within the repository detail screen. When a user navigates to a repository and selects the Settings tab (tab `6`), they see the administrative configuration surface for that repository. This view answers the developer's question: "how is this repository configured, and what can I change about its name, description, visibility, default bookmark, topics, archive status, ownership, or existence?"

The settings view is organized as a vertically scrollable form-like layout divided into distinct sections. Each section groups related settings and presents them as editable fields or action buttons. The sections are: **General** (name, description, default bookmark, topics), **Visibility** (public/private toggle), **Archive** (archive/unarchive toggle), **Danger Zone** (transfer ownership, delete repository). The focused section or field is highlighted with reverse-video styling or a primary-color left border, and the user navigates between sections and fields with `j`/`k` or arrow keys.

Each editable field in the General section can be activated by pressing `Enter` on the focused field. This opens an inline edit mode: the current value becomes an `<input>` (or `<textarea>` for description), and the user types the new value. Pressing `Ctrl+S` or `Enter` saves the change via the API. Pressing `Esc` reverts to the previous value without saving. Saves are optimistic: the displayed value updates immediately, reverting with an error message if the API rejects the change.

The Visibility section shows the current state ("Public" or "Private") and a toggle action. Pressing `Enter` on this field shows a confirmation prompt: "Change visibility to {opposite}? y/n". Confirming sends the update to the API.

The Archive section shows whether the repository is currently archived. If not archived, the action is "Archive this repository" (yellow warning color). If already archived, the action is "Unarchive this repository" (green success color). Both require confirmation.

The Danger Zone is visually distinguished with a red border and red section header. Transfer ownership shows a prompt for the new owner username. Delete repository shows a two-step confirmation: first a prompt "Type the repository name to confirm deletion:", then verification that the typed text matches the repository name exactly before the DELETE request is sent.

Users without admin access see the settings view in read-only mode: all fields display current values but the `Enter` key to edit is suppressed, action buttons show "Admin access required" in muted text, and the Danger Zone section is entirely hidden. The status bar hints update accordingly, showing only navigation keys for read-only users.

The topics field allows managing a list of topic tags. The current topics are displayed as a comma-separated list. Pressing `Enter` activates a multi-value editor where the user can type comma-separated topics. The API enforces a maximum of 20 topics per repository, each topic being 1–35 lowercase alphanumeric characters or hyphens.

At minimum terminal size (80×24), the settings view renders in a single column with abbreviated section headers. Field labels and values stack vertically when insufficient width exists for side-by-side layout. At standard size (120×40), labels and values sit side by side. At large size (200×60+), the layout adds generous padding and shows full help text alongside each field.

If the API request to fetch repository metadata fails, the settings view displays an inline error with "Press `R` to retry." The settings view does not use SSE streaming — all data is fetched via REST on mount and refreshed after each mutation.

## Acceptance Criteria

### Definition of Done

- [ ] The Settings tab (tab `6`) renders a scrollable settings view for the current repository
- [ ] Repository metadata is fetched via `useRepo()` from `@codeplane/ui-core`, which calls `GET /api/repos/:owner/:repo`
- [ ] Settings are organized into four sections: General, Visibility, Archive, Danger Zone
- [ ] The General section displays editable fields for: name, description, default bookmark, topics
- [ ] Each General field shows a label (left) and current value (right) at standard width
- [ ] Pressing `Enter` on a focused editable field activates inline edit mode
- [ ] Inline edit mode replaces the display value with an `<input>` (or `<textarea>` for description)
- [ ] `Ctrl+S` or `Enter` (on single-line inputs) saves the change via `PATCH /api/repos/:owner/:repo`
- [ ] `Esc` cancels inline edit, reverting to the previous value
- [ ] Saves are optimistic: value updates immediately, reverts on server error with inline error message
- [ ] The Visibility section shows current state and a toggle action requiring `y/n` confirmation
- [ ] Visibility toggle calls `PATCH /api/repos/:owner/:repo` with `{ private: !current }`
- [ ] The Archive section shows archive/unarchive action with `y/n` confirmation
- [ ] Archive calls `POST /api/repos/:owner/:repo/archive`; unarchive calls `POST /api/repos/:owner/:repo/unarchive`
- [ ] The Danger Zone section has a red border and red section header
- [ ] Transfer ownership prompts for new owner username, calls `POST /api/repos/:owner/:repo/transfer`
- [ ] Delete repository requires typing the full repo name to confirm, calls `DELETE /api/repos/:owner/:repo`
- [ ] After successful transfer, user is redirected to the new owner's repo URL (navigation push)
- [ ] After successful deletion, user is navigated back to the repository list screen
- [ ] Users without admin access see read-only mode: fields display values, edits suppressed, Danger Zone hidden
- [ ] Read-only users pressing `Enter` on a field see "Admin access required" in the status bar for 2 seconds
- [ ] `j`/`k` (and `Down`/`Up` arrow keys) navigate between fields and sections
- [ ] `G` jumps to the last field; `g g` jumps to the first field
- [ ] `Ctrl+D` / `Ctrl+U` page down/up within the scrollbox
- [ ] `R` triggers a hard refresh of repository metadata from the API
- [ ] Loading state shows a spinner with "Loading…" centered in the content area
- [ ] API errors display inline error message with "Press `R` to retry" hint
- [ ] Auth errors (401) propagate to the app-shell-level auth error screen
- [ ] Rate limit errors (429) display the retry-after period inline
- [ ] Topics field enforces max 20 topics, each 1–35 lowercase alphanumeric or hyphens, validated client-side
- [ ] Description field supports multi-line input via `<textarea>` (up to 1024 characters)
- [ ] Repository name field validates: 1–100 characters, alphanumeric/hyphens/underscores/dots, no leading dots or trailing `.git`

### Keyboard Interactions

- `j` / `Down`: Move focus to next field/action
- `k` / `Up`: Move focus to previous field/action
- `Enter`: Activate inline edit on focused field, or trigger focused action button
- `Esc`: Cancel inline edit (revert value); dismiss confirmation prompt
- `Ctrl+S`: Save current inline edit
- `G`: Jump to the last field
- `g g`: Jump to the first field
- `Ctrl+D`: Page down within the scrollbox
- `Ctrl+U`: Page up within the scrollbox
- `R`: Refresh repository metadata (hard re-fetch from API)
- `y`: Confirm action (when confirmation prompt is visible)
- `n`: Cancel action (when confirmation prompt is visible)
- `Tab` / `Shift+Tab`: Switch to next/previous repository tab (handled by parent tab navigation)

### Responsive Behavior

- Below 80×24: "Terminal too small" handled by router — settings view not rendered
- 80×24 – 119×39 (minimum): Single-column layout. Labels on one line, values on the next. Section headers abbreviated. Danger Zone actions stack vertically. Confirmation prompts use 90% width
- 120×40 – 199×59 (standard): Two-column layout (label left 30%, value right 70%). Section headers full text. Confirmation prompts use 60% width
- 200×60+ (large): Two-column with expanded padding. Inline help text shown below each field in muted color. Full section descriptions visible

### Truncation and Boundary Constraints

- Repository `name`: displayed up to column width (30ch min / 50ch standard / 70ch large); truncated with `…` in read-only display
- `description`: displayed up to 3 lines at standard size, 1 line at minimum, 5 lines at large. Truncated with `…` in read-only display. Edit mode: full `<textarea>` up to 1024 characters
- `default_bookmark`: displayed as-is (max 200 characters, truncated with `…` at column width)
- `topics`: comma-separated, wrapped to available width. Individual topics max 35 characters. Max 20 topics
- Owner name for transfer: max 40 characters in input
- Repository name for delete confirmation: max 100 characters in input
- Section headers: max 30 characters
- Maximum scrollbox content: ~30 focusable items (fields + actions). No pagination needed
- Confirmation prompt text: max 80 characters, truncated if entity names are long

### Edge Cases

- Terminal resize while in inline edit mode: input re-renders at new width, cursor position and text preserved
- Terminal resize during confirmation prompt: prompt re-centers and adjusts width
- Rapid `j`/`k` presses: processed sequentially, no debouncing
- Editing name to a name that already exists: 409 error displayed inline, field reverts
- Editing name successfully: header bar and breadcrumb update to reflect new name
- Transfer to self: API rejects with 400; error shown inline
- Transfer to non-existent user: API rejects with 404; error shown in transfer prompt
- Delete confirmation with wrong name typed: submit button disabled; hint "Name does not match"
- SSE disconnect: settings view unaffected (uses REST)
- Archived repository: General fields are read-only (name, description, default bookmark, topics cannot be changed while archived). Unarchive action is available
- Fork repository: some settings may be restricted (server-enforced; TUI surfaces any 403)
- Network error during save: field reverts, error message with "Press `R` to retry"
- Concurrent edit by another user: optimistic update succeeds locally but may conflict; refresh shows latest state
- Unicode in description and topics: truncation respects grapheme clusters
- Empty description: field shows muted placeholder "No description"
- Empty topics: field shows muted placeholder "No topics"

## Design

### Layout Structure

The settings view occupies the tab content area below the repository tab bar:

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo                 ● SYNCED 🔔 3│
├─────────────────────────────────────────────────────────────┤
│ owner/repo                          PUBLIC    ★ 42          │
│ Description text here...                                    │
├─────────────────────────────────────────────────────────────┤
│ 1:Bookmarks  2:Changes  3:Code  4:Conflicts  5:OpLog  [6:S]│
├─────────────────────────────────────────────────────────────┤
│ Settings                                        R refresh   │
│                                                             │
│ ── General ─────────────────────────────────────────────────│
│  Name            my-repo                                    │
│  Description     A jj-native forge for…                     │
│  Default bkmk    main                                       │
│  Topics          rust, jj, forge, cli                       │
│                                                             │
│ ── Visibility ──────────────────────────────────────────────│
│  Visibility      Public        [Toggle to Private]          │
│                                                             │
│ ── Archive ─────────────────────────────────────────────────│
│  Status          Active        [Archive this repository]    │
│                                                             │
│ ┌─── Danger Zone ─────────────────────────────── (red) ────┐│
│ │ Transfer ownership     [Transfer]                        ││
│ │ Delete repository      [Delete]                          ││
│ └──────────────────────────────────────────────────────────┘│
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ j/k:navigate  Enter:edit  Ctrl+S:save  Esc:cancel  ? help  │
└─────────────────────────────────────────────────────────────┘
```

### Component Structure

The view uses `<box>` for layout, `<scrollbox>` for scrollable content, `<text>` for labels/values, and `<input>` for edit mode. Confirmation prompts and edit overlays use absolutely-positioned `<box>` elements with `border="single"`. The Danger Zone uses `borderColor="error"`. Section headers use `<text bold color="muted">`. Focused fields use `inverse` styling.

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Move focus to next field/action | Not in edit/prompt mode |
| `k` / `Up` | Move focus to previous field/action | Not in edit/prompt mode |
| `Enter` | Activate inline edit or trigger action | Field/action focused, admin access |
| `Esc` | Cancel edit / dismiss prompt / revert | Edit active or prompt visible |
| `Ctrl+S` | Save current edit or confirm action | Edit active or prompt visible |
| `G` | Jump to last field | Not in edit/prompt mode |
| `g g` | Jump to first field | Not in edit/prompt mode |
| `Ctrl+D` | Page down | Not in edit/prompt mode |
| `Ctrl+U` | Page up | Not in edit/prompt mode |
| `R` | Refresh repository metadata from API | Not in edit/prompt mode |
| `y` | Confirm action | Confirmation prompt visible |
| `n` | Cancel action | Confirmation prompt visible |

### Responsive Column Layout

**80×24 (minimum)**: Single column. Label on row 1, value on row 2, stacked vertically. Section headers abbreviated (`General`, `Vis`, `Arch`, `Danger`). Danger Zone actions show abbreviated labels.

**120×40 (standard)**: Two-column. Label (30ch left-aligned) │ value (remaining width). Section headers full text with separator line. All actions visible with full labels.

**200×60 (large)**: Two-column with padding. Label (25ch left-aligned, 5ch padding) │ value (remaining). Help text below each field in muted color. Section descriptions visible.

### Data Hooks

| Hook | Source | Purpose |
|------|--------|--------|
| `useRepo()` | `@codeplane/ui-core` | Fetch repository metadata including name, description, visibility, default_bookmark, topics, is_archived. Returns `{ data: Repo \| null, isLoading: boolean, error: Error \| null, refresh: () => void }`. Calls `GET /api/repos/:owner/:repo` |
| `useUpdateRepo()` | `@codeplane/ui-core` | Mutation hook. Calls `PATCH /api/repos/:owner/:repo` with `UpdateRepoRequest` body (name, description, private, default_bookmark) |
| `useRepoTopics()` | `@codeplane/ui-core` | Fetch current topics. Calls `GET /api/repos/:owner/:repo/topics` |
| `useReplaceRepoTopics()` | `@codeplane/ui-core` | Mutation hook. Calls `PUT /api/repos/:owner/:repo/topics` with `{ topics: string[] }` |
| `useArchiveRepo()` | `@codeplane/ui-core` | Mutation hook. Calls `POST /api/repos/:owner/:repo/archive` |
| `useUnarchiveRepo()` | `@codeplane/ui-core` | Mutation hook. Calls `POST /api/repos/:owner/:repo/unarchive` |
| `useTransferRepo()` | `@codeplane/ui-core` | Mutation hook. Calls `POST /api/repos/:owner/:repo/transfer` with `{ new_owner: string }` |
| `useDeleteRepo()` | `@codeplane/ui-core` | Mutation hook. Calls `DELETE /api/repos/:owner/:repo` |
| `useUser()` | `@codeplane/ui-core` | Current user profile for admin permission check |
| `useKeyboard()` | `@opentui/react` | Keybinding registration for settings-specific keys |
| `useTerminalDimensions()` | `@opentui/react` | Responsive layout breakpoints |
| `useOnResize()` | `@opentui/react` | Trigger synchronous re-layout on terminal resize |

### Navigation Context

When transfer succeeds, calls `push("repo-detail", { repo: newOwner + "/" + repo.name })`. Breadcrumb updates to "Dashboard > newOwner/repo".

When delete succeeds, calls `popToRoot()` then `push("repo-list")`. Breadcrumb resets to "Dashboard > Repositories".

When name is changed successfully, the current navigation entry is updated in-place with the new full name. Breadcrumb and header bar reflect the new name.

### Terminal Resize Behavior

- On resize, `useOnResize()` triggers synchronous re-layout
- Label/value layout switches between single-column (below 120 cols) and two-column (120+ cols)
- Focused field stays visible after resize
- Edit overlay re-positions and adjusts width (60% standard, 90% minimum)
- Confirmation prompts re-center
- Danger Zone border redraws
- No animation or transition during resize

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin | Owner |
|--------|-----------|-----------|-------|-------|-------|
| View settings (read-only) | ❌ (TUI requires auth) | ✅ | ✅ | ✅ | ✅ |
| Edit name | ❌ | ❌ | ❌ | ✅ | ✅ |
| Edit description | ❌ | ❌ | ❌ | ✅ | ✅ |
| Edit default bookmark | ❌ | ❌ | ❌ | ✅ | ✅ |
| Edit topics | ❌ | ❌ | ❌ | ✅ | ✅ |
| Toggle visibility | ❌ | ❌ | ❌ | ✅ | ✅ |
| Archive / unarchive | ❌ | ❌ | ❌ | ✅ | ✅ |
| Transfer ownership | ❌ | ❌ | ❌ | ❌ | ✅ |
| Delete repository | ❌ | ❌ | ❌ | ❌ | ✅ |

- The TUI requires authentication at bootstrap; unauthenticated sessions never reach the settings view
- Read-only and write-access collaborators see all fields in read-only display; pressing `Enter` to edit shows "Admin access required" in the status bar for 2 seconds
- Admin users can edit all General fields, toggle visibility, and archive/unarchive
- Owner-level access is required for transfer and delete; admin users without owner status see those actions with "Owner access required" message
- The permission check uses the `permissions` field from the `useRepo()` response
- The Danger Zone section is entirely hidden for non-admin users (no visual indication it exists)

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to `@codeplane/ui-core` API client as Bearer token
- Token is never displayed in the TUI, never logged, never included in error messages
- 401 responses propagate to the app-shell auth error screen
- 403 responses on mutations show "Permission denied" inline; the user stays on the settings view

### Rate Limiting

- Authenticated users: 5,000 requests per hour (shared across all API endpoints)
- `GET /api/repos/:owner/:repo`: typically 1 request per view load
- `PATCH /api/repos/:owner/:repo`: mutative, subject to standard rate limits
- `POST /api/repos/:owner/:repo/archive` and `/unarchive`: mutative, standard rate limits
- `POST /api/repos/:owner/:repo/transfer`: mutative, standard rate limits
- `DELETE /api/repos/:owner/:repo`: mutative, standard rate limits
- `PUT /api/repos/:owner/:repo/topics`: mutative, standard rate limits
- If 429 is returned, the settings view displays "Rate limited. Retry in {Retry-After}s." inline
- No auto-retry on rate limit; user presses `R` after the retry-after period

### Input Sanitization

- Repository name: validated client-side with regex `/^[a-zA-Z0-9._-]+$/`, 1–100 characters, no leading `.`, no trailing `.git`
- Description: free text, max 1024 characters, rendered as plain text via `<text>` (no injection risk)
- Default bookmark: validated client-side with regex `/^[a-zA-Z0-9._\/-]+$/`, max 200 characters
- Topics: each validated as `/^[a-z0-9-]+$/`, 1–35 characters, max 20 topics total
- Transfer owner: validated as `/^[a-zA-Z0-9_-]+$/`, max 40 characters
- Delete confirmation: compared exactly against `repo.name` — no submission unless exact match
- All user input rendered as plain text via `<text>` or `<input>` components (no injection risk)

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.repo.settings.view` | Settings tab visible (initial load completes) | `repo_full_name`, `is_admin`, `is_owner`, `is_archived`, `is_private`, `topic_count`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms` |
| `tui.repo.settings.edit_start` | User activates inline edit on a field | `repo_full_name`, `field_name`, `current_value_length` |
| `tui.repo.settings.edit_save` | User saves an inline edit | `repo_full_name`, `field_name`, `old_value_length`, `new_value_length`, `save_time_ms` |
| `tui.repo.settings.edit_cancel` | User cancels an inline edit | `repo_full_name`, `field_name`, `had_changes` |
| `tui.repo.settings.edit_error` | Save API fails | `repo_full_name`, `field_name`, `error_type`, `http_status` |
| `tui.repo.settings.visibility_toggle` | User confirms visibility change | `repo_full_name`, `new_visibility` |
| `tui.repo.settings.visibility_cancel` | User cancels visibility prompt | `repo_full_name` |
| `tui.repo.settings.archive` | User confirms archive | `repo_full_name` |
| `tui.repo.settings.unarchive` | User confirms unarchive | `repo_full_name` |
| `tui.repo.settings.archive_cancel` | User cancels archive/unarchive | `repo_full_name`, `action` |
| `tui.repo.settings.transfer_start` | User opens transfer prompt | `repo_full_name` |
| `tui.repo.settings.transfer_submit` | User submits transfer | `repo_full_name`, `new_owner` |
| `tui.repo.settings.transfer_success` | Transfer API succeeds | `repo_full_name`, `new_owner`, `transfer_time_ms` |
| `tui.repo.settings.transfer_error` | Transfer API fails | `repo_full_name`, `error_type`, `http_status` |
| `tui.repo.settings.transfer_cancel` | User cancels transfer | `repo_full_name` |
| `tui.repo.settings.delete_start` | User opens delete confirmation | `repo_full_name` |
| `tui.repo.settings.delete_confirm` | User types correct name and submits | `repo_full_name` |
| `tui.repo.settings.delete_success` | Delete API succeeds | `repo_full_name`, `delete_time_ms` |
| `tui.repo.settings.delete_error` | Delete API fails | `repo_full_name`, `error_type`, `http_status` |
| `tui.repo.settings.delete_cancel` | User cancels delete | `repo_full_name` |
| `tui.repo.settings.topics_update` | User saves topic changes | `repo_full_name`, `old_count`, `new_count`, `added`, `removed` |
| `tui.repo.settings.refresh` | User presses `R` | `repo_full_name`, `was_error_state` |
| `tui.repo.settings.error` | API fails on initial load | `repo_full_name`, `error_type`, `http_status` |
| `tui.repo.settings.permission_denied` | Non-admin user attempts edit | `repo_full_name`, `action` |
| `tui.repo.settings.readonly_view` | Non-admin user views settings | `repo_full_name`, `user_role` |

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Settings view load rate | >98% | % of tab visits that successfully load data |
| Edit success rate | >90% | % of edit submissions that succeed on first attempt |
| Visibility toggle rate | Track | How often users change visibility |
| Archive/unarchive rate | Track | Frequency of archive operations |
| Transfer completion rate | Track | % of started transfers that complete |
| Delete completion rate | Track | % of started deletes that complete (expect high given confirmation friction) |
| Topics adoption | Track | % of repos with at least one topic set from TUI |
| Error rate | <2% | % of loads resulting in error state |
| Permission denial rate | Track | How often non-admin users attempt write actions |
| Time to first edit | Track p50 | Time from mount to first field activation |
| Read-only view rate | Track | % of settings views in read-only mode |

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|--------|
| `info` | Settings loaded | `repo_full_name`, `is_admin`, `is_owner`, `load_time_ms` |
| `info` | Field updated | `repo_full_name`, `field_name`, `save_time_ms` |
| `info` | Visibility toggled | `repo_full_name`, `new_visibility` |
| `info` | Repository archived | `repo_full_name` |
| `info` | Repository unarchived | `repo_full_name` |
| `info` | Repository transferred | `repo_full_name`, `new_owner` |
| `info` | Repository deleted | `repo_full_name` |
| `info` | Topics updated | `repo_full_name`, `topic_count` |
| `warn` | API error on settings fetch | `http_status`, `error_message` (no token) |
| `warn` | API error on field update | `http_status`, `error_message`, `field_name` |
| `warn` | API error on archive/unarchive | `http_status`, `error_message` |
| `warn` | API error on transfer | `http_status`, `error_message` |
| `warn` | API error on delete | `http_status`, `error_message` |
| `warn` | Rate limited on settings endpoint | `retry_after_seconds` |
| `warn` | Permission denied on mutation | `action`, `repo_full_name` |
| `debug` | Field focused | `focused_field` |
| `debug` | Inline edit activated | `field_name` |
| `debug` | Inline edit cancelled | `field_name`, `had_changes` |
| `debug` | Confirmation prompt shown | `action` |
| `debug` | Confirmation prompt dismissed | `action` |
| `debug` | Delete name verification | `matches` |
| `debug` | Hard refresh triggered | `was_error_state` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on initial fetch | Data hook timeout (30s) | Loading spinner replaced with error + "Press `R` to retry" |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen |
| Rate limited (429) | API returns 429 with Retry-After | Inline error: "Rate limited. Retry in Ns." `R` retries after waiting |
| Server error (500) on fetch | API returns 5xx | Inline error with generic message. `R` retries |
| Permission denied (403) on edit | API returns 403 | Field reverts to previous value. "Permission denied." in status bar |
| Conflict (409) on name change | API returns 409 | Field reverts. Error: "Repository name '{name}' already exists." |
| Bad request (400) on edit | API returns 400 | Field reverts. Server error message displayed inline |
| Not found (404) on repo | API returns 404 | Error state: "Repository not found. Press `q` to go back." |
| Permission denied (403) on transfer | API returns 403 | Transfer prompt stays open. Error: "Owner access required." |
| Not found (404) on transfer target | API returns 404 | Transfer prompt stays open. Error: "User '{name}' not found." |
| Bad request (400) on transfer to self | API returns 400 | Transfer prompt shows: "Cannot transfer to yourself." |
| Permission denied (403) on delete | API returns 403 | Delete prompt stays open. Error: "Owner access required." |
| Terminal resize during edit overlay | `useOnResize` fires | Overlay re-positions and resizes. Input text preserved |
| Terminal resize during confirmation prompt | `useOnResize` fires | Prompt re-positions to center |
| Terminal resize during scrolled settings | `useOnResize` fires | Layout recalculates. Focused field stays visible |
| SSE disconnect | Status bar shows disconnected | Settings view unaffected (uses REST) |
| Optimistic edit + server error | Server returns error on PATCH | Field reverts to previous value. Error in status bar |
| Malformed API response | JSON parse error | Error state with generic error message |
| React error boundary triggered | Error boundary catches | Error screen per app-shell error boundary |

### Failure Modes

- **Total fetch failure**: Error state in settings content area. Tab bar remains interactive. User can switch tabs or press `R`
- **Partial state after optimistic edit fails**: Field reverts to server value. Focus stays on the field. Error in status bar
- **Edit overlay open during resize**: Overlay re-centers and adjusts width. All input state preserved
- **Edit overlay open during auth expiry**: Save shows auth error. Overlay stays open
- **Delete succeeds but navigation fails**: Fallback: push to dashboard
- **Transfer succeeds but new URL unreachable**: Show success message with new URL. User navigates manually
- **Memory pressure**: Settings view is small (~30 items). No pagination or virtual scrolling needed
- **Multiple rapid edits**: Each edit queued and processed sequentially. Conflicting optimistic states resolve in order

## Verification

### Test File: `e2e/tui/repository.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

#### Terminal Snapshot Tests

1. **`repo-settings-initial-load`** — Navigate to repo, switch to Settings tab at 120×40. Snapshot. Assert "Settings" header, General section with name/description/default_bookmark/topics fields, Visibility section, Archive section, Danger Zone with red border.
2. **`repo-settings-general-section`** — 120×40. Assert General section header, four fields (Name, Description, Default bookmark, Topics) with labels and current values.
3. **`repo-settings-visibility-section`** — 120×40. Assert Visibility section with current state ("Public" or "Private") and toggle action label.
4. **`repo-settings-archive-section`** — 120×40. Assert Archive section with "Active" status and "Archive this repository" action in warning color.
5. **`repo-settings-archive-section-archived`** — 120×40, archived repo. Assert "Archived" status in warning color and "Unarchive this repository" action in success color.
6. **`repo-settings-danger-zone`** — 120×40, admin user. Assert Danger Zone with red border, red header, Transfer and Delete actions.
7. **`repo-settings-danger-zone-hidden-non-admin`** — 120×40, read-only user. Assert Danger Zone section is not visible.
8. **`repo-settings-read-only-mode`** — 120×40, read-only user. Assert all fields displayed without edit affordances.
9. **`repo-settings-focused-field`** — 120×40. Assert first field (Name) highlighted with reverse-video.
10. **`repo-settings-loading-state`** — Slow API at 120×40. Assert "Loading…" spinner before data arrives.
11. **`repo-settings-error-state`** — Failing API at 120×40. Assert red error message with "Press `R` to retry".
12. **`repo-settings-edit-name-overlay`** — Admin, Enter on Name. Assert inline input with current name value.
13. **`repo-settings-edit-description-overlay`** — Admin, Enter on Description. Assert textarea overlay with title "Edit Description", current text, character count.
14. **`repo-settings-edit-topics-overlay`** — Admin, Enter on Topics. Assert input with comma-separated current topics.
15. **`repo-settings-visibility-confirm`** — Admin, Enter on Visibility. Assert confirmation prompt "Change visibility to Private? y/n" with warning border.
16. **`repo-settings-archive-confirm`** — Admin, Enter on Archive. Assert confirmation prompt "Archive this repository? y/n".
17. **`repo-settings-transfer-prompt`** — Owner, Enter on Transfer. Assert overlay with "Transfer Ownership" title, username input.
18. **`repo-settings-delete-prompt`** — Owner, Enter on Delete. Assert overlay with "Delete Repository" title, name input, mismatch warning.
19. **`repo-settings-delete-name-match`** — Owner, type correct name. Assert submit hint changes to "Ctrl+S: delete permanently".
20. **`repo-settings-delete-name-mismatch`** — Owner, type wrong name. Assert "Name does not match" in error color.
21. **`repo-settings-empty-description`** — Repo with no description. Assert muted "No description" placeholder.
22. **`repo-settings-empty-topics`** — Repo with no topics. Assert muted "No topics" placeholder.

#### Keyboard Interaction Tests

23. **`repo-settings-j-moves-down`** — Press `j`. Focus moves from Name to Description.
24. **`repo-settings-k-moves-up`** — Press `j` then `k`. Focus returns to Name.
25. **`repo-settings-k-at-top-no-wrap`** — Press `k` on Name. Focus stays.
26. **`repo-settings-j-at-bottom-no-wrap`** — Navigate to last field, press `j`. Focus stays.
27. **`repo-settings-down-arrow-moves-down`** — Down arrow same as `j`.
28. **`repo-settings-up-arrow-moves-up`** — Up arrow same as `k`.
29. **`repo-settings-enter-activates-edit`** — Admin, Enter on Name. Inline edit mode activates.
30. **`repo-settings-esc-cancels-edit`** — Edit Name, type "changed", Esc. Value reverts to original.
31. **`repo-settings-ctrl-s-saves-edit`** — Edit Name, type "new-name", Ctrl+S. API called, value updates.
32. **`repo-settings-enter-on-description`** — Admin, Enter on Description. Textarea overlay opens.
33. **`repo-settings-enter-on-visibility`** — Admin, Enter on Visibility. Confirmation prompt appears.
34. **`repo-settings-y-confirms-visibility`** — Visibility prompt, `y`. API called, state toggles.
35. **`repo-settings-n-cancels-visibility`** — Visibility prompt, `n`. Prompt dismissed, no change.
36. **`repo-settings-enter-on-archive`** — Admin, Enter on Archive. Confirmation prompt appears.
37. **`repo-settings-y-confirms-archive`** — Archive prompt, `y`. API called, status changes.
38. **`repo-settings-enter-on-transfer`** — Owner, Enter on Transfer. Transfer prompt appears.
39. **`repo-settings-transfer-submit`** — Transfer prompt, type "newowner", Ctrl+S. API called.
40. **`repo-settings-transfer-esc-cancels`** — Transfer prompt, Esc. Prompt dismissed.
41. **`repo-settings-enter-on-delete`** — Owner, Enter on Delete. Delete prompt appears.
42. **`repo-settings-delete-correct-name-submit`** — Delete prompt, type correct name, Ctrl+S. API called.
43. **`repo-settings-delete-esc-cancels`** — Delete prompt, Esc. Prompt dismissed.
44. **`repo-settings-G-jumps-to-bottom`** — `G`. Focus on last field.
45. **`repo-settings-gg-jumps-to-top`** — `G` then `g g`. Focus on first field (Name).
46. **`repo-settings-ctrl-d-page-down`** — `Ctrl+D`. Focus moves down half visible height.
47. **`repo-settings-ctrl-u-page-up`** — `Ctrl+D` then `Ctrl+U`. Focus returns.
48. **`repo-settings-R-refreshes`** — `R`. Metadata re-fetched.
49. **`repo-settings-R-on-error-retries`** — Error state, `R`. Fetch retried.
50. **`repo-settings-enter-blocked-read-only`** — Read-only user, Enter on Name. Status bar shows "Admin access required".
51. **`repo-settings-j-in-edit-types-j`** — Edit mode active, press `j`. Types 'j' in input, not navigation.
52. **`repo-settings-enter-during-loading`** — Enter during load. No-op.
53. **`repo-settings-rapid-j-presses`** — 8× `j`. Focus moves 8 fields.
54. **`repo-settings-tab-switches-repo-tab`** — `Tab`. Switches to next repo tab (Bookmarks wraps from Settings).
55. **`repo-settings-6-activates-tab`** — From another tab, press `6`. Settings tab active.
56. **`repo-settings-topics-validation`** — Edit topics, enter "INVALID TOPIC!". Client-side validation error displayed.
57. **`repo-settings-name-validation`** — Edit name, enter "invalid name with spaces". Validation error displayed.
58. **`repo-settings-description-char-limit`** — Edit description, type 1025 chars. Input truncated at 1024. Counter shows "1024/1024".
59. **`repo-settings-transfer-navigates`** — Transfer succeeds. Navigation pushes to new owner's repo.
60. **`repo-settings-delete-navigates`** — Delete succeeds. Navigation pops to repo list.

#### Responsive Tests

61. **`repo-settings-80x24-layout`** — 80×24. Single-column, labels and values stacked. Section headers abbreviated.
62. **`repo-settings-80x24-danger-zone`** — 80×24, admin. Danger Zone actions visible, stacked vertically.
63. **`repo-settings-80x24-edit-overlay`** — 80×24, edit description. Overlay uses 90% width.
64. **`repo-settings-80x24-confirmation-prompt`** — 80×24, visibility toggle. Prompt uses 90% width.
65. **`repo-settings-80x24-truncation`** — 80×24, long description. Truncated with `…` on single line.
66. **`repo-settings-120x40-layout`** — 120×40. Two-column, labels left, values right. Full section headers.
67. **`repo-settings-120x40-all-fields`** — 120×40. Snapshot all fields with labels and values side by side.
68. **`repo-settings-200x60-layout`** — 200×60. Expanded padding, help text below fields in muted color.
69. **`repo-settings-200x60-help-text`** — 200×60. Assert inline help text visible below Name field.
70. **`repo-settings-resize-120-to-80`** — 120→80. Layout switches to single column. Focus preserved.
71. **`repo-settings-resize-80-to-120`** — 80→120. Layout switches to two column. Focus preserved.
72. **`repo-settings-resize-preserves-focus`** — Resize at any breakpoint. Focused field preserved.
73. **`repo-settings-resize-during-edit`** — Resize with edit overlay open. Overlay re-centers, input preserved.
74. **`repo-settings-resize-during-confirmation`** — Resize with confirmation prompt. Prompt re-centers.

#### Integration Tests

75. **`repo-settings-auth-expiry`** — 401 → app-shell auth error screen.
76. **`repo-settings-rate-limit-429`** — 429 Retry-After: 30 → "Rate limited. Retry in 30s."
77. **`repo-settings-network-error`** — Timeout → "Press `R` to retry".
78. **`repo-settings-server-error-500`** — 500 → "Press `R` to retry".
79. **`repo-settings-edit-403`** — 403 on PATCH → field reverts, "Permission denied" in status bar.
80. **`repo-settings-name-conflict-409`** — 409 on name change → "Repository name already exists." inline error.
81. **`repo-settings-bad-request-400`** — 400 on edit → server error message shown inline.
82. **`repo-settings-transfer-403`** — 403 on transfer → "Owner access required." in prompt.
83. **`repo-settings-transfer-404`** — 404 on transfer target → "User '{name}' not found." in prompt.
84. **`repo-settings-transfer-400-self`** — 400 on transfer to self → "Cannot transfer to yourself."
85. **`repo-settings-delete-403`** — 403 on delete → "Owner access required." in prompt.
86. **`repo-settings-archive-error`** — 500 on archive → error inline, status unchanged.
87. **`repo-settings-unarchive-error`** — 500 on unarchive → error inline, status unchanged.
88. **`repo-settings-optimistic-edit-rollback`** — Edit, API error → field reverts, error in status bar.
89. **`repo-settings-tab-switch-and-back`** — `1` then `6` → settings re-fetched.
90. **`repo-settings-help-overlay`** — `?` → "Settings" keybinding group listed.
91. **`repo-settings-status-bar-hints`** — Assert status bar shows settings keybinding hints.
92. **`repo-settings-deep-link`** — Launch with `--screen repo --repo owner/repo --tab settings` → Settings tab active.
93. **`repo-settings-archived-fields-readonly`** — Archived repo, admin. General fields not editable. Unarchive action available.
94. **`repo-settings-not-found-404`** — Navigate to non-existent repo → "Repository not found. Press `q` to go back."
