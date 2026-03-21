# JJ_BOOKMARKS_UI

Specification for JJ_BOOKMARKS_UI.

## High-Level User POV

When a developer navigates to any Codeplane repository—whether through the web application, the terminal UI, a VS Code sidebar, or a Neovim picker—they see a clear, organized view of all jj bookmarks in that repository. Bookmarks are the jj-native equivalent of git branches: named pointers to specific changes in the repository's history. Unlike git branches, jj bookmarks carry stable change IDs, can track remotes, and coexist naturally with jj's stacked-change and conflict-aware workflows.

The bookmarks view answers the most immediate question a developer has when opening a repository: "What named reference points exist, which one is the default, and what change does each point to?" The default bookmark—typically "main"—is always visually distinguished and pinned to the top of the list with a star badge, so the developer never has to scan for it. Every other bookmark is sorted alphabetically, making it easy to locate feature work, release lines, or experimental branches at a glance.

Each bookmark in the list shows its name, the short jj change ID it targets, the short git commit ID, and whether it tracks a remote. From any bookmark, the developer can navigate directly into the change detail view to inspect the commit, open the diff view to see what changed, or copy the bookmark name for use in a terminal command or landing request. The list supports client-side filtering for repositories with many bookmarks, and a manual refresh action for when the developer knows the repository has been updated.

Developers with write access can create new bookmarks from the list—specifying a name and an optional target change ID—and delete bookmarks they no longer need. The default bookmark and protected bookmarks are guarded: the default cannot be deleted by anyone, and protected bookmarks require administrator privileges to remove. These safeguards ensure that critical reference points are never accidentally destroyed.

The bookmarks view is consistent across every Codeplane client. The web UI provides a table with inline actions and a creation dialog. The TUI renders a keyboard-driven scrollable list with responsive column layouts that adapt to terminal size. The CLI offers `codeplane bookmark list`, `create`, and `delete` commands with both human-readable and JSON output. The VS Code extension shows a tree view in the Codeplane sidebar, and the Neovim plugin provides a Telescope picker. In every case, the underlying data, the sorting logic, and the permission model are identical—what changes is only the interaction style appropriate to the medium.

This feature is the foundation for deeper repository exploration. From the bookmark list, a user can navigate into change details, diffs, landing request creation flows, and workflow triggers. It is the entry point to the jj-native collaboration model that distinguishes Codeplane from git-only forges.

## Acceptance Criteria

## Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/bookmarks` returns a paginated list of bookmarks for the specified repository with response shape `{ items: BookmarkResponse[], next_cursor: string }`
- [ ] Each `BookmarkResponse` contains `name` (string), `target_change_id` (string), `target_commit_id` (string, 40-char hex SHA), and `is_tracking_remote` (boolean)
- [ ] The API endpoint `POST /api/repos/:owner/:repo/bookmarks` creates a new bookmark given `{ name: string, target_change_id: string }` and returns the created `BookmarkResponse`
- [ ] The API endpoint `DELETE /api/repos/:owner/:repo/bookmarks/:name` deletes a bookmark by name and returns 204 No Content
- [ ] The Web UI bookmarks page at `/:owner/:repo/bookmarks` renders a table of bookmarks with default-first sorting, inline actions, and creation/deletion workflows
- [ ] The TUI Bookmarks tab (tab `1`) renders a scrollable list with keyboard navigation (`j`/`k`, `Enter`, `d`, `c`, `/`, `G`, `gg`, `n`, `x`, `R`) and responsive column layouts
- [ ] The CLI command `codeplane bookmark list` returns bookmark data in both human-readable and `--json` formats, supporting both local jj repos and remote `--repo OWNER/REPO` targets
- [ ] The CLI command `codeplane bookmark create <name>` creates a bookmark (locally or remotely with `--repo`)
- [ ] The CLI command `codeplane bookmark delete <name>` deletes a bookmark (locally or remotely with `--repo`)
- [ ] The VS Code extension Bookmarks tree view lists bookmarks with star icon for default, click-to-navigate, and context menu actions
- [ ] The Neovim plugin `:Codeplane bookmarks` command lists bookmarks via Telescope picker with `<CR>` open, `<C-d>` diff, `<C-y>` yank
- [ ] All clients (API, Web, CLI, TUI, VS Code, Neovim) agree on the same bookmark shape and semantic meaning of fields
- [ ] Public repositories allow unauthenticated read access to the bookmark list
- [ ] Private repositories require authentication to read the bookmark list; unauthenticated requests return 404 (not 403)
- [ ] The default bookmark is identifiable via the repository metadata `default_bookmark` field, displayed first in all list views with a star (`★`) indicator
- [ ] Non-default bookmarks are sorted alphabetically by name (ascending, locale-aware)
- [ ] Shared `@codeplane/ui-core` hooks (`useBookmarks`, `useCreateBookmark`, `useDeleteBookmark`) are used by both Web UI and TUI
- [ ] The bookmark is removed from both the jj repository on disk (via `jj bookmark delete`) and the database record (via `deleteBookmarkByName`) on deletion
- [ ] Deleting a bookmark does not cascade to any other entities — changes, landing requests, and operation log entries remain intact
- [ ] The `is_tracking_remote` field on a newly created bookmark is always `false`
- [ ] Protected bookmark patterns are evaluated but do not block creation—they only restrict deletion

## Boundary Constraints

- **Bookmark names**: maximum 200 characters
- **Bookmark name character set**: alphanumeric, hyphens (`-`), underscores (`_`), slashes (`/`), and dots (`.`). Regex: `/^[a-zA-Z0-9._\/-]+$/`
- **Bookmark name must not** be empty or consist solely of whitespace
- **Bookmark name must not** start or end with a slash, dot, or hyphen
- **Bookmark name must not** contain consecutive slashes (`//`) or consecutive dots (`..`)
- **Bookmark names are case-sensitive**: `Feature` and `feature` are distinct bookmarks
- **Single-character names** (e.g., `a`, `1`) are valid
- **Change ID format**: hexadecimal string (jj change IDs)
- **Commit ID format**: 40-character hexadecimal SHA
- **Short display form**: change ID and commit ID truncated to 12 characters in all visual clients
- **Pagination**: cursor-based, default limit 30, maximum limit 100
- **Limit parameter**: must be a positive integer; non-numeric, zero, or negative values return 400
- **Limit exceeding 100**: clamped to 100 silently (no error)
- **Maximum bookmarks loaded client-side in a single session**: 1000 (pagination cap across all pages)
- **Client-side filter input** (TUI/Web): maximum 100 characters, never transmitted to the server
- **Empty repository** (no bookmarks): returns `{ items: [], next_cursor: "" }` — not an error
- **Target change ID** for creation: required in API path (never defaults); optional in CLI local mode (defaults to working copy `@`)
- **Request body** for creation: must be valid JSON with `Content-Type: application/json`
- **DELETE request body**: ignored if present (no 400 for unexpected body)
- **Bookmark name in DELETE path**: URL-decoded before validation (e.g., `feature%2Fauth` becomes `feature/auth`)
- **Owner parameter**: 1–39 characters, alphanumeric and hyphens, must not start or end with a hyphen
- **Repo parameter**: 1–100 characters, alphanumeric, hyphens, underscores, and dots

## Edge Cases

- Repository with zero bookmarks: returns empty array, not an error; empty state message displayed in all UI clients
- Repository with exactly one bookmark (the default): single-item list with star badge
- Bookmark name at exactly 200 characters: accepted in all operations
- Bookmark name at 201 characters: rejected with 400 for create; rejected with 400 for delete
- Bookmark name with Unicode characters outside the allowed set (e.g., `feature/日本語`): rejected with 400
- Bookmark name containing only allowed special characters (e.g., `feature/v1.2-beta_3`): accepted
- Bookmark name that is a single character (`a`): accepted
- Duplicate bookmark names within a single repository: creation returns 409 Conflict
- Request with `limit=0`: rejected with 400 `"invalid limit value"`
- Request with `limit=-1`: rejected with 400
- Request with `limit=abc`: rejected with 400
- Request with `limit=101`: clamped to 100 (no error)
- Request with empty cursor: treated as first page
- Request with invalid/expired cursor: returns 400
- Owner or repo parameter is empty or whitespace: returns 400
- Repository does not exist: returns 404
- Private repository accessed without auth: returns 404 (not 403, to avoid leaking existence)
- Bookmarks with tracking remotes and bookmarks without tracking remotes coexist in the same list
- Bookmark pointing to a rewritten/abandoned change: still listed with best available metadata
- Attempting to delete the default bookmark: returns 422 regardless of caller role
- Attempting to delete a protected bookmark without Admin/Owner role: returns 403
- Deletion of last non-default bookmark: list shrinks to default only; no special handling
- Concurrent bookmark creation of same name: one succeeds (201), other fails (409)
- Concurrent deletion of same bookmark: first returns 204, second returns 404
- Bookmark is the target of an open landing request: deletion succeeds; the landing request retains the bookmark name as metadata
- Network error during creation (TUI/Web): form remains open with error message; user can retry
- Network error during deletion (TUI/Web): bookmark re-appears in list with error toast
- Terminal resize while scrolled (TUI): scroll position preserved relative to focused item
- Rapid `j` presses (TUI): processed sequentially, no debouncing
- Filter during loading (TUI/Web): filter input is disabled until initial data load completes
- Unicode in bookmark names: truncation respects grapheme clusters
- Bookmark with very long name (200 chars): truncated with `…` in visual list views, full name used for clipboard copy
- Repository is archived: deletion returns 403 ("repository is archived")
- CLI without `--yes` in non-interactive terminal (piped stdin): returns error prompting for `--yes`
- jj subprocess failure: returns 500 with descriptive error message
- jj binary not found: returns 500 with descriptive error
- Disk full during jj write operation: returns 500

## Design

## API Shape

### List Bookmarks

```
GET /api/repos/:owner/:repo/bookmarks
```

Query parameters:
- `cursor` (string, optional): opaque pagination cursor from a previous response's `next_cursor`
- `limit` (integer, optional): number of items per page. Default: 30. Maximum: 100.

Response `200 OK`:
```json
{
  "items": [
    {
      "name": "main",
      "target_change_id": "ksxypqvmruwn",
      "target_commit_id": "abc12345def067890123456789abcdef01234567",
      "is_tracking_remote": true
    },
    {
      "name": "feature/auth",
      "target_change_id": "mzrlnwopqrst",
      "target_commit_id": "def56789abc1234567890abcdef0123456789abc",
      "is_tracking_remote": false
    }
  ],
  "next_cursor": ""
}
```

Error responses:

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Missing or empty `owner` param | `{ "message": "owner is required" }` |
| 400 | Missing or empty `repo` param | `{ "message": "repository name is required" }` |
| 400 | Invalid `limit` value | `{ "message": "invalid limit value" }` |
| 400 | Invalid `cursor` value | `{ "message": "invalid cursor" }` |
| 404 | Repository not found | `{ "message": "repository not found" }` |
| 429 | Rate limited | `{ "message": "rate limit exceeded" }` with `Retry-After` header |
| 500 | jj subprocess failure | `{ "message": "failed to list bookmarks: <stderr>" }` |

### Create Bookmark

```
POST /api/repos/:owner/:repo/bookmarks
```

Request headers:
- `Content-Type: application/json` (required)
- `Authorization: Bearer <token>` or session cookie (required)

Request body:
```json
{
  "name": "feature/auth",
  "target_change_id": "ksxypqvmruwn"
}
```

Response `201 Created`:
```json
{
  "name": "feature/auth",
  "target_change_id": "ksxypqvmruwn",
  "target_commit_id": "abc12345def067890123456789abcdef01234567",
  "is_tracking_remote": false
}
```

Error responses:

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid or missing name/target_change_id | `{ "message": "bookmark name is required" }` / `{ "message": "target_change_id is required" }` / `{ "message": "invalid bookmark name" }` |
| 401 | Not authenticated | `{ "message": "authentication required" }` |
| 403 | Insufficient permissions (read-only) | `{ "message": "write access required to create bookmarks" }` |
| 404 | Repository not found / private repo no access | `{ "message": "not found" }` |
| 409 | Duplicate bookmark name | `{ "message": "bookmark already exists" }` |
| 422 | Target change ID does not exist | `{ "message": "target change not found" }` |
| 429 | Rate limited | `{ "message": "rate limit exceeded" }` with `Retry-After` header |
| 500 | jj subprocess failure | `{ "message": "internal server error" }` |

### Delete Bookmark

```
DELETE /api/repos/:owner/:repo/bookmarks/:name
```

Path parameters:
- `owner` (string, required): repository owner username or organization name
- `repo` (string, required): repository name
- `name` (string, required): bookmark name (URL-encoded if it contains slashes)

Headers:
- `Authorization: Bearer <token>` or session cookie (required)

Response `204 No Content`: empty body.

Error responses:

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Missing or invalid name | `{ "error": "bookmark name is required" }` |
| 401 | Not authenticated | `{ "error": "authentication required" }` |
| 403 | Insufficient permissions / protected bookmark / archived repo | `{ "error": "insufficient permissions" }` / `{ "error": "bookmark is protected; admin access required" }` / `{ "error": "repository is archived" }` |
| 404 | Repo not found / bookmark not found / private repo no access | `{ "error": "not found" }` |
| 422 | Attempt to delete default bookmark | `{ "error": "cannot delete the default bookmark" }` |
| 429 | Rate limited | `{ "error": "rate limit exceeded" }` with `Retry-After` header |
| 500 | Internal failure | `{ "error": "internal server error" }` |

## SDK Shape

The `RepoHostService` in `@codeplane/sdk` provides:

```typescript
interface Bookmark {
  name: string;
  target_change_id: string;
  target_commit_id: string;
  is_tracking_remote: boolean;
}

interface CreateBookmarkRequest {
  name: string;
  target_change_id: string;
}

interface BookmarkListResult {
  items: Bookmark[];
  nextCursor: string;
}

listBookmarks(owner: string, repo: string, cursor?: string, limit?: number): Promise<Result<BookmarkListResult, APIError>>
createBookmark(owner: string, repo: string, request: CreateBookmarkRequest): Promise<Result<Bookmark, APIError>>
deleteBookmark(owner: string, repo: string, name: string): Promise<Result<void, APIError>>
```

The database layer provides:
- `listBookmarksByRepo(sql, { repositoryId, pageOffset, pageSize })` — paginated list ordered by name ASC
- `upsertBookmark(sql, { id, repositoryId, name, targetChangeId, isDefault })` — insert or update
- `deleteBookmarkByName(sql, { repositoryId, name })` — remove DB record
- `setDefaultBookmark(sql, repositoryId, name)` — atomically set default
- `countBookmarksByRepo(sql, { repositoryId })` — total count

Protected bookmark queries:
- `listAllProtectedBookmarksByRepo(sql, { repositoryId })` — full list for pattern matching
- `upsertProtectedBookmark()` — configure protection rules
- `deleteProtectedBookmarkByPattern()` — remove protection

Shared UI hooks in `@codeplane/ui-core`:

```typescript
useBookmarks(): { items: Bookmark[]; totalCount: number; isLoading: boolean; error: Error | null; refresh: () => void }
useCreateBookmark(): { create: (name: string, targetChangeId: string) => Promise<Bookmark>; isCreating: boolean; error: Error | null }
useDeleteBookmark(): { delete: (name: string) => Promise<void>; isDeleting: boolean; error: Error | null }
```

## Web UI Design

The Web UI bookmarks page lives at `/:owner/:repo/bookmarks` within the repository workbench.

**Page Layout:**
- Page header: "Bookmarks" with total count badge and a "New bookmark" button (visible only to users with write access; hidden for read-only and anonymous users)
- Filter input: text field above the table for client-side substring filtering by bookmark name (max 100 chars, case-insensitive, never sent to server)
- Refresh button: icon button to re-fetch the list
- Bookmark table with columns: Star badge, Name (monospace, link), Change ID (short 12ch, monospace, clickable link to change detail), Commit ID (short 12ch, monospace, muted), Tracking status badge, Actions menu

**Table Behavior:**
- Default bookmark row: pinned to first position, name rendered in primary color with `★` prefix
- Non-default bookmarks: sorted alphabetically by name
- Clicking a bookmark name navigates to the change detail page at `/:owner/:repo/changes/:change_id`
- Clicking the change ID navigates to the change detail view
- Each row's action menu (kebab `⋮`) contains: "Copy name" (copies full name to clipboard), "View diff" (navigates to diff view), "Delete" (styled in destructive red, gated by permissions)
- Tracking status shown as a badge: "Tracking" (with cloud icon) or "Local"
- Long bookmark names (>40ch) truncated with `…` in table, with tooltip showing full name
- Copy button on each row copies the full change ID to clipboard

**Creation Dialog:**
- Modal dialog triggered by "New bookmark" button
- Fields:
  - **Name** (text input): placeholder "e.g., feature/auth", character counter showing `{current}/{200}`, inline validation on blur
  - **Target Change ID** (text input or picker): placeholder "e.g., ksxypqvmruwn", with optional change picker/autocomplete from recent changes
- Submit button: "Create Bookmark" (disabled until both fields are non-empty and pass client-side validation)
- Cancel button or Escape key dismisses the dialog
- Loading state: submit button shows spinner, fields become read-only during submission
- Success: dialog closes, bookmark list refreshes, toast notification "Bookmark '{name}' created", new row briefly highlighted
- Error: dialog stays open, error message shown inline above the submit button
- Pressing Enter in the form submits; pressing Escape or clicking backdrop closes
- Validation feedback:
  - Name too long: "Name must be 200 characters or fewer" (character count turns red)
  - Invalid characters: "Name may only contain letters, numbers, hyphens, underscores, slashes, and dots"
  - Starts/ends with invalid character: "Name must not start or end with a slash, dot, or hyphen"
  - Consecutive slashes or dots: "Name must not contain consecutive slashes or dots"
  - Empty name: "Bookmark name is required" (shown on blur or submit)
  - Empty change ID: "Target change ID is required" (shown on blur or submit)

**Deletion Flow:**
- Delete action in kebab menu triggers a confirmation modal
- Title: "Delete bookmark"
- Body: `Are you sure you want to delete the bookmark "{name}"? This will not delete any changes or history.`
- If bookmark is protected, additional warning: `This bookmark is protected. You must have admin access to delete it.`
- Two buttons: "Cancel" (secondary) and "Delete" (destructive red)
- Pressing Enter submits; pressing Escape dismisses
- While request is in flight, "Delete" button shows spinner and is disabled
- Success: modal closes, bookmark removed from list (optimistic update), toast "Bookmark '{name}' deleted"
- On 403: inline error "You do not have permission to delete this bookmark."
- On 404: inline error "Bookmark not found. It may have been deleted by another user." + list refresh
- On 422: inline error "Cannot delete the default bookmark."
- On 500: inline error "Something went wrong. Please try again."
- Default bookmark: delete action disabled with tooltip "Cannot delete the default bookmark"
- Protected bookmark (non-admin): delete action disabled with tooltip "Bookmark is protected"

**States:**
- Loading: skeleton rows in the table while data fetches
- Empty: centered illustration with "No bookmarks yet" and a "Create your first bookmark" call-to-action (if write access)
- Error: inline error banner with retry button
- Pagination: "Load more" button at bottom when `next_cursor` is non-empty, or infinite scroll

## CLI Command

### `codeplane bookmark list`

```
codeplane bookmark list [--repo OWNER/REPO] [--json]
```

Behavior:
- When `--repo` is omitted, operates against the local jj repository in the current working directory
- When `--repo` is provided, fetches from the Codeplane API
- Human-readable output: one line per bookmark, format `{name} {target_change_id}`
- JSON output: array of bookmark objects with `name`, `target_change_id`, and `target_commit_id`
- Exit code 0 on success (even if empty), non-zero on error
- "No bookmarks" message in human-readable mode when the list is empty
- `[]` in JSON mode when empty

### `codeplane bookmark create`

```
codeplane bookmark create <name> [--change <change_id>] [--repo OWNER/REPO] [--json]
```

Arguments:
- `name` (required, positional): the bookmark name to create

Options:
- `--change <id>` (optional): target change ID. When omitted in local mode, defaults to working copy (`@`). Required in API mode.
- `--repo OWNER/REPO` (optional): create via API instead of local jj
- `--json` (flag): output result as structured JSON

Behavior:
- Local mode: executes `jj bookmark create <name> [-r <changeId>]`, fetches details, prints result
- API mode: sends `POST /api/repos/:owner/:repo/bookmarks`
- Human-readable output: `Created bookmark {name} at {change_id}`
- JSON output: `{ "name": "...", "target_change_id": "...", "target_commit_id": "..." }`
- Exit code 0 on success, non-zero on error
- Error messages printed to stderr

### `codeplane bookmark delete`

```
codeplane bookmark delete <name> [--repo OWNER/REPO] [--yes] [--json]
```

Arguments:
- `name` (required, positional): the bookmark name to delete

Options:
- `--repo OWNER/REPO`: delete via API
- `--yes` / `-y`: skip interactive confirmation prompt
- `--json`: output as JSON

Behavior:
- Local mode: checks `hasLocalBookmark()`, prompts for confirmation (unless `--yes`), calls `deleteLocalBookmark()`
- Remote mode: calls `DELETE /api/repos/:owner/:repo/bookmarks/:name`
- Human-readable output: `Deleted bookmark {name}`
- JSON output: `{ "status": "deleted", "name": "..." }`
- Non-interactive terminal without `--yes`: `Error: Use --yes to confirm deletion in non-interactive mode` (exit code 1)
- Nonexistent bookmark: `Error: Bookmark {name} was not found` (exit code 1)

## TUI UI

The Bookmarks tab (tab `1`) within the repository detail screen:

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo                 ● SYNCED 🔔 3│
├─────────────────────────────────────────────────────────────┤
│ owner/repo                          PUBLIC    ★ 42          │
│ Description text here...                                    │
├─────────────────────────────────────────────────────────────┤
│ [1:Bookmarks]  2:Changes  3:Code  4:Conflicts  5:OpLog  6:S│
├─────────────────────────────────────────────────────────────┤
│ Bookmarks (12)                              / filter  R ref │
│                                                             │
│  ★ main          ksxypqvm1234  abc12345def0  ↔              │
│    feature/auth  mzrlnwop5678  def56789abc1                 │
│    fix/typo      qrst9012abcd  ghi90123def4  ↔              │
│    release/v2    uvwx3456efgh  jkl34567ghi8                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ j/k:navigate  Enter:view  d:diff  n:new  x:del   ? help    │
└─────────────────────────────────────────────────────────────┘
```

**Keyboard Interactions:**

| Key | Action |
|-----|--------|
| `j` / `↓` | Navigate down |
| `k` / `↑` | Navigate up |
| `Enter` | Open change detail for focused bookmark's target change |
| `d` | Open diff view for focused bookmark's target change |
| `c` | Copy bookmark name to clipboard (shows "Copied!" for 2 seconds) |
| `/` | Activate inline filter (case-insensitive substring match on name) |
| `Esc` | Clear filter / cancel form / dismiss prompt |
| `G` | Jump to last row |
| `g g` | Jump to first row |
| `Ctrl+D` / `Ctrl+U` | Page down / page up |
| `n` | Open bookmark creation form (write access only) |
| `x` | Delete focused bookmark with confirmation (write access only, not default, not protected) |
| `R` | Hard refresh from API |
| `Ctrl+S` | Submit creation form |
| `y` | Confirm deletion when prompt is visible |

**Responsive Behavior:**
- 80×24 (minimum): name (40ch) + default badge + tracking indicator only
- 120×40 (standard): all columns — name (30ch), change ID (12ch), commit ID (12ch), tracking, badge
- 200×60+ (large): expanded name (50ch), all columns, full tracking labels ("tracking" / "local")

**Creation Form:**
- Overlay with two fields: bookmark name (text input, max 200 chars, validated against name regex) and target change ID (text input, optional, defaults to working copy)
- `Ctrl+S` submits; `Esc` cancels
- On success: form closes, new bookmark appears in list (optimistic update), status bar shows "Bookmark '{name}' created"
- On error: form stays open, error message shown inline
- If user has read-only access, pressing `n` shows "Insufficient permissions to create bookmarks"

**Deletion Confirmation:**
- Overlay prompt: "Delete bookmark '{name}'? y/n"
- `y` confirms (optimistic deletion); `n`, `Esc`, or any other key cancels
- Default bookmark: `x` shows "Cannot delete the default bookmark."
- Protected bookmark (non-admin): `x` shows "Bookmark is protected. Cannot delete."
- Read-only user: `x` shows "Insufficient permissions"
- On success: bookmark removed from list, focus moves to next row (or previous if last), status message for 3 seconds
- On error: inline error message replaces the confirmation prompt for 3 seconds

**States:**
- Loading: centered spinner with "Loading…"
- Empty: centered muted message "No bookmarks. Create one with `n`."
- Error: inline error description with "Press `R` to retry"
- Rate limited: "Rate limited. Retry in {N}s."

## VS Code Extension

The VS Code extension provides a Bookmarks tree view in the Codeplane sidebar:

- Lists bookmarks from the connected repository
- Each tree item shows bookmark name as label and short change ID (12 chars) as description
- Default bookmark annotated with star icon (`★`) and displayed first
- Tracking bookmarks show a cloud icon (`☁`)
- Clicking a bookmark opens the change detail webview
- Refresh command (`Codeplane: Refresh Bookmarks`) to re-fetch the list
- Context menu actions: "Copy Bookmark Name", "View Diff", "Create Landing Request from Bookmark"
- For bookmark creation: `Codeplane: Create Bookmark` command palette action → input box for name → quick pick for target change → progress notification → success/error notification
- For bookmark deletion: context menu "Delete Bookmark" on non-default items → VS Code confirmation dialog → API call → tree refresh → success/error notification
- Status bar integration: shows current/default bookmark name

## Neovim Plugin

The Neovim plugin provides:

- `:Codeplane bookmarks` command to list bookmarks via Telescope picker
- Each entry shows `{name} ({change_id})`, default bookmark prefixed with `★`
- `<CR>` to open change detail in a split
- `<C-d>` to view diff in a split
- `<C-y>` to yank/copy bookmark name to register
- Fuzzy filtering by bookmark name in the Telescope UI
- `:Codeplane bookmark-create` command — input prompt for name, Telescope picker for target change, success/error echo
- `:Codeplane bookmark-delete <name>` command — `[y/N]` confirmation, echo message on result
- In Telescope picker, `<C-x>` triggers deletion with `[y/N]` confirmation
- Lua API: `require('codeplane').bookmark_create({ name = "...", change_id = "..." })`

## Documentation

The following end-user documentation should be written:

1. **CLI reference**: `codeplane bookmark list` — usage, flags (`--repo`, `--json`), examples of human and JSON output, behavior with and without `--repo`; `codeplane bookmark create` — arguments, options (`--change`, `--repo`, `--json`), examples of local and API-mode creation; `codeplane bookmark delete` — arguments, options (`--repo`, `--yes`, `--json`), examples, error messages, exit codes
2. **API reference**: `GET /api/repos/:owner/:repo/bookmarks` — query parameters, response schema, pagination examples, error codes; `POST /api/repos/:owner/:repo/bookmarks` — request body, response schema, validation rules, all error codes; `DELETE /api/repos/:owner/:repo/bookmarks/:name` — path parameters, response, protected/default restrictions, all error codes
3. **Web UI guide**: Bookmarks page — navigation, filtering, creation dialog workflow, deletion confirmation flow, permission indicators, error handling, pagination
4. **TUI guide**: Bookmarks tab — keyboard shortcuts table, responsive behavior, creation/deletion workflows, filtering, status messages
5. **Concepts guide**: "What are jj bookmarks?" — relationship to git branches, tracking vs. local bookmarks, default bookmark semantics, bookmark naming conventions and constraints, how bookmarks relate to landing requests and workflows
6. **VS Code guide**: Bookmarks tree view — usage, click behavior, context menu actions, creation/deletion, status bar indicator
7. **Neovim guide**: `:Codeplane bookmarks` — Telescope picker usage, keybindings, creation and deletion commands, Lua API

## Permissions & Security

## Authorization Roles

| Action | Anonymous | Read-only | Write (Member) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| List bookmarks (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| List bookmarks (private repo) | ❌ (404) | ✅ | ✅ | ✅ | ✅ |
| View bookmark change detail | Same as list | ✅ | ✅ | ✅ | ✅ |
| Copy bookmark name | Same as list | ✅ | ✅ | ✅ | ✅ |
| Create bookmark (public repo) | ❌ (401) | ❌ (403) | ✅ | ✅ | ✅ |
| Create bookmark (private repo) | ❌ (404) | ❌ (403) | ✅ | ✅ | ✅ |
| Delete non-protected, non-default bookmark | ❌ (401) | ❌ (403) | ✅ | ✅ | ✅ |
| Delete protected bookmark | ❌ (401) | ❌ (403) | ❌ (403) | ✅ | ✅ |
| Delete default bookmark | ❌ | ❌ | ❌ (422) | ❌ (422) | ❌ (422) |
| Delete bookmark on archived repo | ❌ (401) | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |

**Notes:**
- TUI requires authentication for all actions (no anonymous access in TUI context)
- Private repository existence is never leaked; unauthorized requests receive 404 not 403
- Write access is determined by repository membership (collaborator, team member, or org member with write permission)
- Admin is determined by repository admin role, organization admin role, or site admin
- Organization-level team permissions that grant write access also enable bookmark creation
- Protected bookmark patterns do **not** block bookmark creation — they only apply to deletion, direct push, and landing enforcement
- The default bookmark restriction is enforced at the application level regardless of role — no one can delete it via the API

## Rate Limiting

| Context | Limit | Window |
|---------|-------|--------|
| Authenticated user (all endpoints) | 5,000 requests | per hour |
| Unauthenticated user | 60 requests | per hour per IP |
| Authenticated user - read endpoints (`GET /bookmarks`) | Subject to hourly budget | — |
| Authenticated user - bookmark creates (`POST`) | 30 requests | per minute per user |
| Authenticated user - bookmark deletes (`DELETE`) | 30 requests | per minute per user |
| Per-repository cap for reads | 600 requests | per minute (across all users) |

- 429 responses include `Retry-After` header with seconds until retry is allowed
- No automatic retry on 429 in any client; user must manually retry or wait for the displayed countdown
- Rate limit counters are per-user for mutative endpoints, not per-repository
- Clients should display the retry-after duration to the user (TUI: inline message; Web: banner; CLI: stderr message)
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) must be present on all responses

## Data Privacy

- Bookmark names, change IDs, and commit IDs are not PII
- Private repository bookmarks must not be exposed to unauthenticated or unauthorized users (404 response, not 403, to prevent repository existence leakage)
- Auth tokens, session cookies, and API keys are never logged, displayed in error messages, included in telemetry events, or exposed in client-side error states
- Bookmark list requests for private repos must verify repository access before any data is returned (no timing side-channels — fail fast)
- Client-side filter text in TUI and Web is never transmitted to the server
- CLI `--json` output does not include auth tokens or session metadata
- Clipboard operations (copy bookmark name, copy change ID) are local-only and do not generate server-side events
- The `target_change_id` passed to jj subprocess must be sanitized to prevent command injection (validated as alphanumeric only, max length enforced)
- jj subprocess stderr output may contain filesystem paths; these must be sanitized or truncated before including in API error responses
- Client IP addresses in rate-limit logs must be hashed before storage
- Admin audit logs should capture who accessed bookmark lists on private repositories

## Telemetry & Product Analytics

## Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `bookmark.list.viewed` | Bookmark list successfully loaded and rendered | `repo_full_name`, `total_count`, `is_empty` (boolean), `client` (api/cli/tui/web/vscode/nvim), `load_time_ms`, `page_size`, `has_cursor` (boolean), `is_authenticated` |
| `bookmark.list.paginated` | User loads an additional page of bookmarks | `repo_full_name`, `page_number`, `items_on_page`, `client` |
| `bookmark.list.filtered` | User applies or modifies a client-side filter | `repo_full_name`, `filter_length`, `matched_count`, `total_count`, `client` |
| `bookmark.list.refreshed` | User manually refreshes the list | `repo_full_name`, `was_error_state` (boolean), `previous_count`, `new_count`, `client` |
| `bookmark.created` | Bookmark successfully created | `repo_full_name`, `bookmark_name`, `bookmark_name_length`, `target_change_id`, `has_explicit_change_id`, `client`, `latency_ms` |
| `bookmark.deleted` | Bookmark successfully deleted | `repo_full_name`, `bookmark_name`, `was_protected` (boolean), `was_tracking` (boolean), `actor_role`, `client`, `deletion_time_ms` |
| `bookmark.change_opened` | User navigates from bookmark to change detail | `repo_full_name`, `bookmark_name`, `bookmark_is_default` (boolean), `bookmark_is_tracking` (boolean), `client` |
| `bookmark.diff_opened` | User opens diff from bookmark row | `repo_full_name`, `bookmark_name`, `client` |
| `bookmark.name_copied` | User copies bookmark name to clipboard | `repo_full_name`, `bookmark_name`, `client` |
| `bookmark.list.error` | Bookmark list request fails | `repo_full_name`, `error_type` (auth/not_found/rate_limit/jj_failure/network/internal), `http_status`, `client` |
| `bookmark.list.empty` | Empty state rendered (zero bookmarks) | `repo_full_name`, `client` |
| `bookmark.create.error` | Bookmark creation fails | `repo_full_name`, `bookmark_name`, `error_type` (validation/conflict/auth/permission/not_found/server_error), `http_status`, `client` |
| `bookmark.create.form_opened` | User opened the create bookmark form/dialog | `repo_full_name`, `client` |
| `bookmark.create.form_cancelled` | User cancelled the create bookmark form/dialog | `repo_full_name`, `time_in_form_ms`, `had_input`, `client` |
| `bookmark.create.validation_error` | Client-side validation prevented submission | `repo_full_name`, `validation_field` (name/change_id), `validation_rule` (empty/too_long/invalid_chars/consecutive_dots/etc.), `client` |
| `bookmark.create.duplicate_attempted` | User attempted to create a bookmark with an existing name | `repo_full_name`, `client` |
| `bookmark.delete.error` | Bookmark deletion fails | `repo_full_name`, `bookmark_name`, `error_type` (not_found/protected/default/permission/archived/server_error), `http_status`, `client` |
| `bookmark.delete.confirmed` | User confirmed deletion in UI prompt | `repo_full_name`, `bookmark_name`, `client`, `time_to_confirm_ms` |
| `bookmark.delete.cancelled` | User cancelled deletion in UI prompt | `repo_full_name`, `bookmark_name`, `client` |
| `bookmark.default_delete_blocked` | User attempted to delete default bookmark | `repo_full_name`, `bookmark_name`, `actor_role`, `client` |
| `bookmark.protected_delete_blocked` | Non-admin attempted to delete protected bookmark | `repo_full_name`, `bookmark_name`, `protected_pattern`, `actor_role`, `client` |
| `bookmark.permission_denied` | User attempted action without sufficient permissions | `repo_full_name`, `attempted_action` (create/delete/delete_protected), `user_role`, `client` |

## Funnel Metrics and Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| List load success rate | >98% | Percentage of bookmark list requests returning 200 |
| Time to first bookmark display (p50) | <500ms | From request initiation to first item rendered in any client |
| Time to first bookmark display (p95) | <2000ms | Worst-case acceptable latency |
| Bookmark-to-change navigation rate | >40% | Percentage of bookmark list sessions where user opens at least one change detail |
| Diff shortcut adoption (TUI) | >20% | Percentage of TUI sessions using the `d` shortcut |
| Filter adoption (repos with >10 bookmarks) | >15% | Percentage of views where the filter is activated |
| Create bookmark adoption | Track | Number of bookmarks created per active repository per week |
| Delete bookmark adoption | Track | Number of bookmarks deleted per active repository per week |
| Error rate | <2% | Percentage of list loads resulting in error |
| Creation success rate | >95% | Percentage of bookmark creation attempts that succeed |
| Deletion success rate | >95% | Percentage of bookmark deletion attempts that succeed |
| Form-to-submit rate | >70% | Percentage of users who open the create form and actually submit it |
| Time-to-create (p50) | <1s | End-to-end latency from submit to success response |
| Duplicate name error rate | <5% | Percentage of creates that fail due to existing name |
| Default bookmark delete attempt rate | <5% | Percentage of delete attempts targeting the default bookmark (high rate = unclear UI) |
| CLI JSON output adoption | Track | Percentage of CLI bookmark list calls using `--json` |
| CLI `--yes` adoption | Track | Percentage of CLI deletes using `--yes` flag (indicates automation/scripting) |
| Cross-client coverage | Track | Distribution of list/create/delete requests across API, CLI, TUI, Web, VS Code, Neovim |
| Multi-client usage | Increasing | Unique users who view bookmarks from 2+ different clients in a 7-day window |
| Empty state rate | <20% | `BookmarkListViewed` with `total_count == 0` / total views (high = onboarding gap) |
| Post-create navigation rate | >60% | Percentage of users who view the created bookmark's change detail within 5 minutes |
| Programmatic vs. interactive create ratio | Track | Percentage of creates from automation (agent/workflow) vs. human-driven clients |

## Observability

## Logging

| Log Level | Event | Structured Context |
|-----------|-------|-----------------------|
| `info` | Bookmarks listed successfully | `repo_owner`, `repo_name`, `total_count`, `page_size`, `has_cursor`, `load_time_ms`, `request_id` |
| `info` | Bookmark created successfully | `repo_owner`, `repo_name`, `bookmark_name`, `target_change_id`, `actor_id`, `latency_ms`, `request_id` |
| `info` | Bookmark deleted successfully | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id`, `was_protected`, `deletion_time_ms`, `request_id` |
| `info` | Bookmark list empty for repository | `repo_owner`, `repo_name`, `request_id` |
| `warn` | Bookmark list request failed | `repo_owner`, `repo_name`, `http_status`, `error_message` (no tokens/secrets), `request_id` |
| `warn` | Bookmark creation failed | `repo_owner`, `repo_name`, `bookmark_name`, `error_type`, `http_status`, `request_id` |
| `warn` | Bookmark creation rejected (name validation) | `repo_owner`, `repo_name`, `bookmark_name_length`, `validation_error`, `request_id` |
| `warn` | Bookmark deletion failed | `repo_owner`, `repo_name`, `bookmark_name`, `error_type`, `http_status`, `request_id` |
| `warn` | Bookmark creation failed — duplicate name | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id` |
| `warn` | Bookmark deletion blocked — default bookmark | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id`, `actor_role` |
| `warn` | Bookmark deletion blocked — protected, insufficient role | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id`, `actor_role`, `protected_pattern` |
| `warn` | Bookmark deletion blocked — insufficient permissions | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id`, `actor_role` |
| `warn` | Bookmark deletion blocked — repository archived | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id` |
| `warn` | Rate limited on bookmark endpoint | `repo_owner`, `repo_name`, `retry_after_seconds`, `client_ip` (hashed), `endpoint`, `request_id` |
| `warn` | Unauthorized access attempt to private repo bookmarks | `repo_owner`, `repo_name`, `client_ip` (hashed), `request_id` |
| `warn` | jj subprocess failed during bookmark operation | `repo_owner`, `repo_name`, `operation` (list/create/delete), `exit_code`, `stderr` (truncated to 500 chars), `duration_ms`, `request_id` |
| `warn` | Attempt to delete default bookmark | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id`, `request_id` |
| `warn` | Attempt to delete protected bookmark by non-admin | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id`, `actor_role`, `request_id` |
| `warn` | Bookmark creation rate limited | `repo_owner`, `repo_name`, `actor_id`, `retry_after_seconds` |
| `error` | Unexpected error in bookmark handler | `repo_owner`, `repo_name`, `error_type`, `stack_trace`, `request_id` |
| `error` | Database delete failed after jj delete succeeded | `repo_owner`, `repo_name`, `bookmark_name`, `db_error` (indicates data inconsistency) |
| `debug` | Bookmark list request received | `repo_owner`, `repo_name`, `cursor`, `limit`, `user_id?`, `request_id` |
| `debug` | Bookmark create request received | `repo_owner`, `repo_name`, `bookmark_name_length`, `has_change_id`, `request_id` |
| `debug` | Bookmark delete request received | `repo_owner`, `repo_name`, `bookmark_name_raw` (before trim), `actor_id`, `request_id` |
| `debug` | Pagination parameters parsed | `cursor`, `limit`, `raw_limit`, `request_id` |
| `debug` | jj CLI command executed | `repo_path` (hashed), `args` (sanitized—no tokens), `exit_code`, `duration_ms`, `request_id` |
| `debug` | Bookmark records parsed from jj output | `raw_record_count`, `valid_bookmark_count`, `skipped_count`, `request_id` |
| `debug` | Protected bookmark check performed | `repo_owner`, `repo_name`, `bookmark_name`, `matching_patterns`, `is_protected` |
| `debug` | Bookmark details fetched after creation | `repo_owner`, `repo_name`, `commit_id`, `change_id`, `fetch_duration_ms` |

All logs must use structured JSON format. Sensitive data (tokens, full file paths with user directories, raw request bodies) must never appear in log output.

## Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_bookmark_list_requests_total` | Counter | `owner`, `repo`, `status_code` | Total bookmark list requests |
| `codeplane_bookmark_list_duration_seconds` | Histogram | `owner`, `repo` | End-to-end request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0) |
| `codeplane_bookmark_list_items_returned` | Histogram | — | Number of bookmarks returned per request (buckets: 0, 1, 5, 10, 25, 50, 100) |
| `codeplane_bookmark_create_requests_total` | Counter | `owner`, `repo`, `status_code` | Total bookmark creation requests |
| `codeplane_bookmark_create_duration_seconds` | Histogram | `owner`, `repo` | Bookmark creation end-to-end duration (buckets: 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_bookmark_create_errors_total` | Counter | `owner`, `repo`, `error_type` | Bookmark create errors by type (validation, conflict, auth, permission, jj_failure, internal) |
| `codeplane_bookmark_create_validation_failures_total` | Counter | `field`, `rule` | Client-reported validation failures by field and rule |
| `codeplane_bookmark_create_duplicate_total` | Counter | `owner`, `repo` | Duplicate bookmark name attempts |
| `codeplane_bookmark_delete_requests_total` | Counter | `owner`, `repo`, `status_code` | Total bookmark deletion requests |
| `codeplane_bookmark_delete_duration_seconds` | Histogram | `owner`, `repo` | Bookmark deletion end-to-end duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5) |
| `codeplane_bookmark_delete_errors_total` | Counter | `owner`, `repo`, `error_type` | Bookmark delete errors by type (not_found, protected, default, permission, archived, jj_failure, db_failure, internal) |
| `codeplane_bookmark_delete_blocked_total` | Counter | `owner`, `repo`, `reason` | Blocked deletion attempts (default, protected, permission, archived) |
| `codeplane_bookmark_delete_db_inconsistency_total` | Counter | `owner`, `repo` | Cases where jj delete succeeded but DB delete failed |
| `codeplane_bookmark_errors_total` | Counter | `owner`, `repo`, `operation` (list/create/delete), `error_type` | Bookmark operation errors by type (auth, not_found, rate_limit, jj_failure, validation, internal) |
| `codeplane_jj_subprocess_duration_seconds` | Histogram | `command` (bookmark_list/bookmark_create/bookmark_delete) | jj CLI subprocess execution time |
| `codeplane_jj_subprocess_failures_total` | Counter | `command`, `exit_code` | jj CLI subprocess failures |

## Alerts

### Alert: BookmarkListHighErrorRate
- **Condition:** `rate(codeplane_bookmark_errors_total{operation="list",error_type!="not_found"}[5m]) / rate(codeplane_bookmark_list_requests_total[5m]) > 0.05`
- **Severity:** Warning (>5%), Critical (>20%)
- **Runbook:**
  1. Check `codeplane_bookmark_errors_total` by `error_type` label to identify the dominant failure mode
  2. If `error_type=jj_failure`: verify `jj` binary is installed and accessible (`which jj` on the server); verify repository paths exist under `CODEPLANE_DATA_DIR/repos/`; check disk space (`df -h`); inspect jj stderr in structured logs (search for `jj subprocess failed`)
  3. If `error_type=internal`: check application logs for stack traces; look for OOM conditions or connection pool exhaustion; check if a recent deploy introduced a regression
  4. If `error_type=auth`: check auth middleware configuration; verify session/token handling is operational; check if an auth service dependency is degraded
  5. If concentrated on specific repos: check those repositories' health (`jj debug` against them)
  6. Escalate to the platform team if error rate exceeds 10% or persists beyond 15 minutes

### Alert: BookmarkMutationHighErrorRate
- **Condition:** `(rate(codeplane_bookmark_errors_total{operation=~"create|delete",error_type!~"not_found|validation"}[5m])) / (rate(codeplane_bookmark_create_requests_total[5m]) + rate(codeplane_bookmark_delete_requests_total[5m])) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_bookmark_errors_total` for `operation=create` vs `operation=delete` to isolate which mutation is failing
  2. If create failures: check jj subprocess logs for permission errors or corrupt repos; verify target change IDs exist
  3. If delete failures: check for filesystem permission issues; verify repo paths are writable
  4. Check disk space — jj operations require write access
  5. Verify no concurrent repository maintenance is running (gc, reindex)
  6. Escalate if mutation error rate exceeds 20% or persists beyond 10 minutes

### Alert: BookmarkListHighLatency
- **Condition:** `histogram_quantile(0.95, rate(codeplane_bookmark_list_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning (p95 > 2s), Critical (p95 > 5s)
- **Runbook:**
  1. Check `codeplane_jj_subprocess_duration_seconds` — if jj subprocess is slow, the bottleneck is repository I/O
  2. Check disk I/O metrics on the server; high iowait indicates storage saturation
  3. Check if a specific repository is causing outlier latency — correlate with `owner` and `repo` labels
  4. Large repos (thousands of bookmarks) may inherently be slow; consider implementing server-side caching
  5. Check system load (`uptime`, `top`) for resource contention
  6. Verify no repository corruption by running `jj debug` against slow repos
  7. Escalate if p95 exceeds 5 seconds or if multiple repos are affected simultaneously

### Alert: BookmarkCreateHighLatency
- **Condition:** `histogram_quantile(0.95, rate(codeplane_bookmark_create_duration_seconds_bucket[5m])) > 5`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_jj_subprocess_duration_seconds{command="bookmark_create"}` — if jj subprocess is slow, the bottleneck is repository I/O
  2. Check disk I/O metrics (`iowait`, `await`) on the server — high values indicate storage saturation
  3. Check if a specific large repository is causing outlier latency
  4. Verify no repository lock contention
  5. Escalate if p95 exceeds 10 seconds

### Alert: JjSubprocessFailureSpike
- **Condition:** `rate(codeplane_jj_subprocess_failures_total{command=~"bookmark_.*"}[5m]) > 1`
- **Severity:** Critical
- **Runbook:**
  1. Immediately check if `jj` binary is accessible: `which jj` on the server
  2. Check jj version: `jj --version` — ensure compatibility with expected version
  3. Check disk space: `df -h $CODEPLANE_DATA_DIR`
  4. Check repository integrity: look for jj stderr messages in structured logs filtered by `jj subprocess failed`
  5. If jj binary is missing or corrupt: redeploy from the latest known-good image or reinstall jj
  6. If repositories are corrupt: attempt `jj debug reindex` or restore from backup
  7. If jj template syntax changed between versions: compare template string in `repohost.ts` against installed jj docs
  8. If disk is full: clear temp files, old logs, or unused artifacts; consider expanding storage
  9. Escalate immediately if more than 10 repos are affected or if the binary itself is the problem

### Alert: BookmarkDeleteDBInconsistency
- **Condition:** `increase(codeplane_bookmark_delete_db_inconsistency_total[1h]) > 0`
- **Severity:** Critical
- **Runbook:**
  1. This alert means `jj bookmark delete` succeeded on disk but the corresponding DB record failed to delete — the system is now inconsistent
  2. Identify the affected repositories from the `owner` and `repo` labels
  3. Check database logs for the specific error (connection timeout, constraint violation, etc.)
  4. Manually verify the bookmark state: run `jj bookmark list` on the repo path and compare against the `bookmarks` DB table
  5. If the bookmark is gone from jj but present in DB, manually delete the DB record: `DELETE FROM bookmarks WHERE repository_id = ? AND name = ?`
  6. Investigate root cause — likely database connectivity issues or transaction isolation problems
  7. Escalate immediately as this affects data consistency

### Alert: BookmarkRateLimitSpike
- **Condition:** `rate(codeplane_bookmark_errors_total{error_type="rate_limit"}[5m]) > 5`
- **Severity:** Info
- **Runbook:**
  1. Check which IPs or users are hitting rate limits — inspect structured logs for `Rate limited on bookmark endpoint`
  2. Determine if the spike is from a misbehaving automation/script or a legitimate usage spike
  3. If automation: contact the user/team to fix their polling behavior
  4. If legitimate spike: consider temporarily increasing rate limits or adding a CDN cache for public repos
  5. No immediate escalation unless accompanied by other alerts

### Alert: BookmarkDeleteBurstAbuse
- **Condition:** `rate(codeplane_bookmark_delete_requests_total[1m]) > 50`
- **Severity:** Warning
- **Runbook:**
  1. Identify the source user/IP from structured logs
  2. Verify whether the traffic is legitimate automation (CI script, bulk cleanup) or abuse
  3. If abuse: temporarily block the source via rate limiter override
  4. If legitimate: consider whether the burst limit needs adjustment for scripted workflows
  5. Review whether the caller is using a PAT or session — PAT-based bulk operations may need a higher tier

### Alert: BookmarkDuplicateNameSpike
- **Condition:** `rate(codeplane_bookmark_create_duplicate_total[5m]) > 10`
- **Severity:** Info
- **Runbook:**
  1. Check if a single user or automation is repeatedly attempting the same bookmark name (may indicate a buggy script or agent loop)
  2. Review request logs to identify the pattern — is it the same bookmark name or many different duplicates?
  3. If a single user: check if their client is not handling 409 responses correctly (missing error handling → retry loop)
  4. If widespread: check if there's a UI bug causing double-submit
  5. No immediate action required unless accompanied by elevated error rates

## Error Cases and Failure Modes

| Error Case | Detection | Expected Behavior |
|------------|-----------|-------------------|
| Repository not found | 404 from repo lookup | Return 404, log at debug level |
| jj binary not installed | Subprocess spawn error | Return 500, log at error level, critical alert fires |
| jj subprocess timeout (>30s) | Process timeout | Kill subprocess, return 500, log at error level |
| jj subprocess returns unexpected output | Parse failure (missing field separators) | Skip malformed records, log at warn level, return partial results |
| jj template syntax error (version incompatibility) | Non-zero exit code with syntax error in stderr | Return 500, log at error, update template string |
| Extremely large repository (>10k bookmarks) | Response size / memory | Return paginated results, respect limit parameter, no special error |
| Database connection failure | DB query error | Return 500, log at error level |
| Repository path missing on disk | `access()` check fails | Return 500, log at error level |
| Concurrent repository deletion during list | Race condition | Return 404 or partial results depending on timing |
| Invalid UTF-8 in bookmark names from jj | Parse error | Skip invalid records, log at warn level |
| Disk full during jj write operation (create/delete) | jj stderr | Return 500, log at error level, disk alert fires |
| Bookmark name collision on create | jj error or pre-check | Return 409 Conflict with clear message |
| Target change ID does not exist | jj error on create | Return 422 with `"target change not found"` |
| Bookmark is protected on delete | Permission check | Return 403 with `"bookmark is protected; admin access required"` |
| Default bookmark on delete | Business rule check | Return 422 with `"cannot delete the default bookmark"` |
| Repository is archived | `archived_at` check | Return 403 with `"repository is archived"` |
| jj reports bookmark doesn't exist on delete | jj stderr | Return 404 |
| Database delete fails after jj succeeds | DB query error | Return 500, log at error with inconsistency flag, critical alert fires |
| Concurrent deletion by two clients | Race condition | First returns 204, second returns 404 |
| Request body too large (>1MB) | Middleware body size limit | Return 413, log at warn |
| Malformed JSON body on create | JSON parse error | Return 400 ("invalid request body") |
| Output parsing failure (unexpected jj format) | Bookmarks array empty despite repo having bookmarks | Silent data loss (empty list returned), log at warn |
| Process timeout on large repo | Server-side timeout | 504 or 500, kill jj process |

## Verification

## API Integration Tests (`e2e/api/bookmark-list.test.ts`)

1. **`api-bookmark-list-returns-bookmarks`** — Create repo, push commits with bookmarks, `GET /bookmarks` returns array with correct shape (`name`, `target_change_id`, `target_commit_id`, `is_tracking_remote`)
2. **`api-bookmark-list-empty-repo`** — Create repo with no commits, `GET /bookmarks` returns `{ items: [], next_cursor: "" }`
3. **`api-bookmark-list-default-limit`** — Repo with 40 bookmarks, `GET /bookmarks` (no limit param) returns 30 items and a non-empty `next_cursor`
4. **`api-bookmark-list-custom-limit`** — `GET /bookmarks?limit=5` returns exactly 5 items
5. **`api-bookmark-list-limit-1`** — `GET /bookmarks?limit=1` returns exactly 1 item
6. **`api-bookmark-list-limit-max-clamp`** — `GET /bookmarks?limit=200` returns at most 100 items (clamped, no error)
7. **`api-bookmark-list-limit-100-max`** — Repo with 150 bookmarks, `GET /bookmarks?limit=100` returns exactly 100 items
8. **`api-bookmark-list-limit-zero-error`** — `GET /bookmarks?limit=0` returns 400 with `"invalid limit value"`
9. **`api-bookmark-list-limit-negative-error`** — `GET /bookmarks?limit=-1` returns 400
10. **`api-bookmark-list-limit-non-numeric-error`** — `GET /bookmarks?limit=abc` returns 400
11. **`api-bookmark-list-pagination-cursor`** — Fetch first page, use `next_cursor` to fetch second page, verify no overlap and combined results equal full list
12. **`api-bookmark-list-pagination-all-pages`** — Create 10 bookmarks, fetch with `limit=3`, follow cursors until empty, verify all 10 returned exactly once
13. **`api-bookmark-list-invalid-cursor`** — `GET /bookmarks?cursor=invalid` returns 400
14. **`api-bookmark-list-public-repo-no-auth`** — Public repo, no auth header, returns 200 with bookmarks
15. **`api-bookmark-list-private-repo-no-auth`** — Private repo, no auth header, returns 404
16. **`api-bookmark-list-private-repo-with-auth`** — Private repo, valid auth, returns 200
17. **`api-bookmark-list-private-repo-wrong-user`** — Private repo, auth for non-collaborator, returns 404
18. **`api-bookmark-list-nonexistent-repo`** — `GET /api/repos/owner/nonexistent/bookmarks` returns 404
19. **`api-bookmark-list-missing-owner`** — Request with empty owner parameter returns 400 with `"owner is required"`
20. **`api-bookmark-list-missing-repo`** — Request with empty repo parameter returns 400 with `"repository name is required"`
21. **`api-bookmark-list-response-shape`** — Validate every field type: `name` is string, `target_change_id` is string, `target_commit_id` is 40-char hex string, `is_tracking_remote` is boolean
22. **`api-bookmark-list-alphabetical-order`** — Bookmarks named `zebra`, `alpha`, `middle` — response items sorted `alpha`, `middle`, `zebra`
23. **`api-bookmark-list-tracking-and-local`** — Repo with both tracking and local bookmarks, verify `is_tracking_remote` is correct for each
24. **`api-bookmark-list-bookmark-name-max-length`** — Create bookmark with exactly 200-character name, verify it appears in list without truncation
25. **`api-bookmark-list-bookmark-with-slashes`** — Create bookmark `release/v1.0`, verify it appears with full name
26. **`api-bookmark-list-rate-limit-429`** — Exhaust rate limit, verify 429 response with `Retry-After` header
27. **`api-bookmark-list-concurrent-requests`** — 10 concurrent list requests for the same repo all return consistent 200 results
28. **`api-bookmark-list-response-content-type`** — Verify `Content-Type` header is `application/json`
29. **`api-bookmark-list-request-id-header`** — Verify response includes `X-Request-ID` header
30. **`api-bookmark-list-rate-limit-headers`** — Verify `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers exist
31. **`api-bookmark-list-after-bookmark-create`** — Create bookmark, immediately list, new bookmark appears
32. **`api-bookmark-list-after-bookmark-delete`** — Delete bookmark, immediately list, deleted bookmark is absent

## API Create Bookmark Tests (`e2e/api/bookmark-create.test.ts`)

33. **`api-bookmark-create-success`** — POST with valid name and target_change_id returns 201 with BookmarkResponse
34. **`api-bookmark-create-response-shape`** — Validate `name` is string, `target_change_id` is string, `target_commit_id` is 40-char hex, `is_tracking_remote` is boolean (always `false`)
35. **`api-bookmark-create-appears-in-list`** — Created bookmark appears in subsequent GET /bookmarks
36. **`api-bookmark-create-name-max-length`** — Create bookmark with exactly 200-character valid name, returns 201
37. **`api-bookmark-create-name-too-long`** — 201-character name returns 400 with message about exceeding max length
38. **`api-bookmark-create-name-empty`** — `{ "name": "", ... }` returns 400 ("bookmark name is required")
39. **`api-bookmark-create-name-whitespace-only`** — `{ "name": "   ", ... }` returns 400
40. **`api-bookmark-create-missing-name-field`** — `{ "target_change_id": "..." }` returns 400
41. **`api-bookmark-create-empty-change-id`** — `{ "name": "test", "target_change_id": "" }` returns 400 ("target_change_id is required")
42. **`api-bookmark-create-missing-change-id-field`** — `{ "name": "test" }` returns 400
43. **`api-bookmark-create-name-invalid-chars-unicode`** — Name `feature/日本語` returns 400
44. **`api-bookmark-create-name-invalid-chars-spaces`** — Name `my bookmark` returns 400
45. **`api-bookmark-create-name-leading-slash`** — Name `/feature` returns 400
46. **`api-bookmark-create-name-trailing-dot`** — Name `feature.` returns 400
47. **`api-bookmark-create-name-leading-hyphen`** — Name `-feature` returns 400
48. **`api-bookmark-create-name-trailing-hyphen`** — Name `feature-` returns 400
49. **`api-bookmark-create-name-trailing-slash`** — Name `feature/` returns 400
50. **`api-bookmark-create-name-consecutive-slashes`** — Name `feature//auth` returns 400
51. **`api-bookmark-create-name-consecutive-dots`** — Name `feature..auth` returns 400
52. **`api-bookmark-create-single-char-name`** — Name `a` returns 201
53. **`api-bookmark-create-complex-valid-name`** — Name `feature/v1.2-beta_3` returns 201
54. **`api-bookmark-create-with-slashes-in-name`** — Name `feature/auth` returns 201
55. **`api-bookmark-create-with-dots-in-name`** — Name `release.v1.2` returns 201
56. **`api-bookmark-create-duplicate-name`** — Create then attempt same name, second returns 409
57. **`api-bookmark-create-nonexistent-change-id`** — Non-existent target_change_id returns 422
58. **`api-bookmark-create-unauthenticated`** — No auth header returns 401
59. **`api-bookmark-create-readonly-user`** — Read-only collaborator returns 403
60. **`api-bookmark-create-write-user`** — Write-access collaborator returns 201
61. **`api-bookmark-create-admin-user`** — Admin returns 201
62. **`api-bookmark-create-owner-user`** — Owner returns 201
63. **`api-bookmark-create-nonexistent-repo`** — Returns 404
64. **`api-bookmark-create-private-repo-non-collaborator`** — Returns 404
65. **`api-bookmark-create-missing-owner`** — Empty owner returns 400
66. **`api-bookmark-create-missing-repo`** — Empty repo returns 400
67. **`api-bookmark-create-invalid-json-body`** — Malformed JSON returns 400
68. **`api-bookmark-create-empty-json-body`** — `{}` returns 400
69. **`api-bookmark-create-is-tracking-remote-false`** — Newly created bookmark always has `is_tracking_remote: false`
70. **`api-bookmark-create-case-sensitive`** — Create `Feature`, then `feature`, both succeed (distinct)
71. **`api-bookmark-create-rate-limit`** — Exceed 30 creates/minute, verify 429 with `Retry-After`
72. **`api-bookmark-create-concurrent-same-name`** — 5 concurrent creates with same name, exactly 1 succeeds (201), others get 409
73. **`api-bookmark-create-concurrent-different-names`** — 5 concurrent creates with different names, all succeed (201)

## API Delete Bookmark Tests (`e2e/api/bookmark-delete.test.ts`)

74. **`api-bookmark-delete-success`** — DELETE existing bookmark returns 204 with empty body
75. **`api-bookmark-delete-absent-from-list`** — Deleted bookmark absent from subsequent GET /bookmarks
76. **`api-bookmark-delete-nonexistent`** — DELETE non-existent bookmark returns 404
77. **`api-bookmark-delete-already-deleted`** — Delete same bookmark twice: first 204, second 404
78. **`api-bookmark-delete-default-bookmark`** — DELETE default bookmark returns 422 ("cannot delete the default bookmark")
79. **`api-bookmark-delete-protected-bookmark-non-admin`** — DELETE protected bookmark as write-access user returns 403
80. **`api-bookmark-delete-protected-bookmark-admin`** — DELETE protected bookmark as admin returns 204
81. **`api-bookmark-delete-protected-bookmark-owner`** — DELETE protected bookmark as owner returns 204
82. **`api-bookmark-delete-unauthenticated`** — DELETE without auth returns 401
83. **`api-bookmark-delete-readonly-user`** — DELETE as read-only user returns 403
84. **`api-bookmark-delete-private-repo-no-auth`** — DELETE on private repo without auth returns 404
85. **`api-bookmark-delete-private-repo-non-collaborator`** — Returns 404
86. **`api-bookmark-delete-nonexistent-repo`** — Returns 404
87. **`api-bookmark-delete-missing-owner`** — Empty owner returns 400
88. **`api-bookmark-delete-missing-repo`** — Empty repo returns 400
89. **`api-bookmark-delete-empty-bookmark-name`** — `DELETE .../bookmarks/%20` returns 400
90. **`api-bookmark-delete-bookmark-with-slashes`** — Delete `feature/auth/v2` via URL-encoded path, returns 204
91. **`api-bookmark-delete-bookmark-with-dots`** — Delete `release.1.0`, returns 204
92. **`api-bookmark-delete-bookmark-name-max-length`** — Delete 200-char name bookmark, returns 204
93. **`api-bookmark-delete-bookmark-name-over-max-length`** — 201-char name returns 400
94. **`api-bookmark-delete-archived-repo`** — Archive repo, attempt delete, returns 403 ("repository is archived")
95. **`api-bookmark-delete-rate-limit`** — Exhaust burst limit, verify 429 with `Retry-After`
96. **`api-bookmark-delete-concurrent-same-bookmark`** — Two concurrent DELETEs: one 204, one 404
97. **`api-bookmark-delete-concurrent-different-bookmarks`** — Two concurrent DELETEs for different bookmarks, both 204
98. **`api-bookmark-delete-response-has-no-body`** — 204 response has empty body
99. **`api-bookmark-delete-with-request-body`** — DELETE with `{ "extra": "data" }` body is ignored, returns 204
100. **`api-bookmark-delete-tracking-bookmark`** — Delete tracking bookmark, returns 204
101. **`api-bookmark-delete-landing-request-reference`** — Delete bookmark referenced by landing request, LR still exists and retains name
102. **`api-bookmark-delete-preserves-changes`** — Delete bookmark, verify the change it pointed to is still accessible

## CLI Integration Tests (`e2e/cli/bookmark.test.ts`)

103. **`cli-bookmark-list-returns-bookmarks`** — `codeplane bookmark list` in repo with bookmarks returns exit 0 and lists them
104. **`cli-bookmark-list-json-output`** — `codeplane bookmark list --json` returns valid JSON array of bookmark objects
105. **`cli-bookmark-list-human-output`** — Human-readable lines `{name} {change_id}` format
106. **`cli-bookmark-list-empty-repo`** — Empty repo returns "No bookmarks" / `[]`
107. **`cli-bookmark-list-remote-repo`** — `codeplane bookmark list --repo OWNER/REPO` fetches from API
108. **`cli-bookmark-list-contains-main`** — After push, list contains "main" bookmark
109. **`cli-bookmark-list-handles-slashes`** — Bookmark `feature/my-feature` appears correctly
110. **`cli-bookmark-list-handles-special-chars`** — Bookmarks with `-`, `_`, `.` in names appear correctly
111. **`cli-bookmark-list-exit-code-0`** — Exit code 0 on success
112. **`cli-bookmark-list-public-repo-no-auth`** — Works without auth on public repo
113. **`cli-bookmark-list-nonexistent-repo-fails`** — Non-zero exit code with error
114. **`cli-bookmark-list-local-mode`** — Inside jj working copy without `--repo`, calls local jj
115. **`cli-bookmark-create-success`** — `codeplane bookmark create test-branch` exits 0 with success message
116. **`cli-bookmark-create-with-change`** — `--change <id>` creates at specified change
117. **`cli-bookmark-create-default-working-copy`** — Without `--change`, defaults to working copy
118. **`cli-bookmark-create-json-output`** — `--json` returns valid JSON with `name`, `target_change_id`, `target_commit_id`
119. **`cli-bookmark-create-human-output`** — Output matches "Created bookmark {name} at {change_id}"
120. **`cli-bookmark-create-appears-in-list`** — Create then list, new bookmark present
121. **`cli-bookmark-create-duplicate-fails`** — Same name twice, second fails with non-zero exit
122. **`cli-bookmark-create-name-too-long`** — 201-char name, non-zero exit with error
123. **`cli-bookmark-create-api-mode`** — `--repo OWNER/REPO --change <id>` creates via API
124. **`cli-bookmark-delete-success`** — Delete existing bookmark, exit 0, "Deleted bookmark {name}"
125. **`cli-bookmark-delete-nonexistent`** — Delete nonexistent, error "was not found", exit 1
126. **`cli-bookmark-delete-json-output`** — JSON output `{ status: "deleted", name: "..." }`
127. **`cli-bookmark-delete-remote`** — `--repo OWNER/REPO` deletes via API
128. **`cli-bookmark-delete-after-list-shows-absence`** — Delete then list, deleted bookmark absent
129. **`cli-bookmark-delete-special-chars`** — Delete `feature/v1.2-beta_3`, success
130. **`cli-bookmark-delete-max-length-name`** — 200-char name, success
131. **`cli-bookmark-delete-yes-flag`** — `--yes` skips confirmation
132. **`cli-bookmark-list-after-create`** — Create then list, appears
133. **`cli-bookmark-list-after-delete`** — Delete then list, absent

## TUI Snapshot and Interaction Tests (`e2e/tui/bookmark.test.ts`)

134. **`tui-bookmark-list-initial-load`** — Bookmarks tab active, shows "Bookmarks (N)" header and rows
135. **`tui-bookmark-list-default-first`** — Default bookmark "main" appears first with `★` prefix
136. **`tui-bookmark-list-alphabetical-sort`** — Non-default bookmarks sorted alphabetically
137. **`tui-bookmark-list-empty-state`** — Empty repo shows "No bookmarks. Create one with `n`."
138. **`tui-bookmark-list-loading-state`** — Slow API shows "Loading…" spinner
139. **`tui-bookmark-list-error-state`** — Failing API shows error with "Press `R` to retry"
140. **`tui-bookmark-list-j-navigates-down`** — `j` moves focus down
141. **`tui-bookmark-list-k-navigates-up`** — `k` moves focus up
142. **`tui-bookmark-list-k-at-top-stays`** — `k` on first row stays
143. **`tui-bookmark-list-j-at-bottom-stays`** — `j` on last row stays
144. **`tui-bookmark-list-enter-opens-change`** — `Enter` opens change detail screen
145. **`tui-bookmark-list-d-opens-diff`** — `d` opens diff view
146. **`tui-bookmark-list-c-copies-name`** — `c` shows "Copied!" in status bar
147. **`tui-bookmark-list-slash-activates-filter`** — `/` activates filter input
148. **`tui-bookmark-list-filter-narrows-list`** — Type in filter, only matching bookmarks visible
149. **`tui-bookmark-list-filter-case-insensitive`** — Filter "FIX" matches "fix/typo"
150. **`tui-bookmark-list-esc-clears-filter`** — Esc clears filter, full list restored
151. **`tui-bookmark-list-G-jumps-to-bottom`** — `G` moves focus to last row
152. **`tui-bookmark-list-gg-jumps-to-top`** — `g g` moves focus to first row
153. **`tui-bookmark-list-R-refreshes`** — `R` triggers re-fetch
154. **`tui-bookmark-list-n-opens-create-form`** — Write-access user, `n` opens creation form
155. **`tui-bookmark-list-n-blocked-readonly`** — Read-only user, `n` shows "Insufficient permissions"
156. **`tui-bookmark-list-create-submit`** — Fill form, `Ctrl+S`, bookmark created and appears in list
157. **`tui-bookmark-list-create-cancel`** — `Esc` dismisses form, no bookmark created
158. **`tui-bookmark-list-create-duplicate-error`** — Submit existing name, form stays open, error shown
159. **`tui-bookmark-list-create-empty-name-error`** — Empty name, inline error shown
160. **`tui-bookmark-list-create-empty-change-id-error`** — Empty change ID, inline error shown
161. **`tui-bookmark-list-create-tab-between-fields`** — Tab moves focus between Name and Change ID fields
162. **`tui-bookmark-list-create-server-error-keeps-form`** — 500 response, form stays open with error
163. **`tui-bookmark-list-x-delete-confirm`** — `x` then `y`, bookmark deleted
164. **`tui-bookmark-list-x-delete-cancel`** — `x` then `n`, deletion cancelled
165. **`tui-bookmark-list-x-blocked-readonly`** — Read-only user, `x` shows "Insufficient permissions"
166. **`tui-bookmark-list-x-on-default-blocked`** — Default bookmark, `x` shows "Cannot delete the default bookmark."
167. **`tui-bookmark-list-x-on-protected-blocked`** — Protected bookmark by non-admin, `x` shows "Bookmark is protected. Cannot delete."
168. **`tui-bookmark-list-delete-focus-moves`** — After deletion, focus moves to next row
169. **`tui-bookmark-list-delete-last-focus-moves-up`** — Delete last row, focus moves to previous
170. **`tui-bookmark-list-delete-success-message-timeout`** — Success message disappears after ~3 seconds
171. **`tui-bookmark-list-delete-error-displayed`** — API 500, error message shown inline
172. **`tui-bookmark-list-80x24-layout`** — 80×24 terminal, only name + badge + tracking visible
173. **`tui-bookmark-list-120x40-layout`** — 120×40 terminal, all columns visible
174. **`tui-bookmark-list-200x60-layout`** — 200×60 terminal, expanded labels
175. **`tui-bookmark-list-resize-preserves-focus`** — Resize terminal, focused row preserved
176. **`tui-bookmark-list-tracking-indicator`** — Tracking bookmarks show `↔`, local show empty
177. **`tui-bookmark-list-rapid-j-presses`** — 10 rapid `j` presses, focus moves 10 rows
178. **`tui-bookmark-list-long-name-truncation`** — 200-char name truncated with `…`
179. **`tui-bookmark-list-rate-limit-display`** — 429 response shows "Rate limited. Retry in {N}s."

## Web UI Playwright Tests (`e2e/web/bookmark.test.ts`)

180. **`web-bookmark-list-page-loads`** — Navigate to `/:owner/:repo/bookmarks`, page renders with bookmark table
181. **`web-bookmark-list-shows-bookmarks`** — Table contains rows with name, change ID, commit ID
182. **`web-bookmark-list-default-highlighted`** — Default bookmark row has star indicator, positioned first
183. **`web-bookmark-list-empty-state`** — Empty repo shows empty state message and illustration
184. **`web-bookmark-list-click-name-navigates-to-change`** — Click bookmark name → change detail page
185. **`web-bookmark-list-click-change-id-navigates`** — Click change ID → change detail view
186. **`web-bookmark-list-filter-by-name`** — Type in filter, table narrows
187. **`web-bookmark-list-filter-case-insensitive`** — Case insensitive filtering
188. **`web-bookmark-list-refresh-button`** — Click refresh, list re-fetches
189. **`web-bookmark-list-create-button-hidden-readonly`** — Read-only user, button not visible
190. **`web-bookmark-list-create-button-hidden-anonymous`** — Unauthenticated, button not visible
191. **`web-bookmark-list-create-button-visible-write`** — Write-access user, button visible
192. **`web-bookmark-list-create-dialog-opens`** — Click "New bookmark", dialog appears with Name and Change ID fields
193. **`web-bookmark-list-create-dialog-submit-success`** — Fill valid data, submit, dialog closes, bookmark in list, toast shown
194. **`web-bookmark-list-create-dialog-name-validation-empty`** — Empty name shows error on blur/submit
195. **`web-bookmark-list-create-dialog-name-validation-too-long`** — 201-char name, counter red, submit disabled
196. **`web-bookmark-list-create-dialog-name-validation-invalid-chars`** — Spaces in name, inline error
197. **`web-bookmark-list-create-dialog-change-id-validation-empty`** — Empty change ID shows error
198. **`web-bookmark-list-create-dialog-duplicate-name-error`** — Submit existing name, error in dialog
199. **`web-bookmark-list-create-dialog-cancel`** — Cancel/Escape closes dialog, no bookmark
200. **`web-bookmark-list-create-dialog-loading-state`** — Spinner on submit button during request
201. **`web-bookmark-list-create-dialog-server-error`** — 500 response, dialog stays open with error
202. **`web-bookmark-list-create-character-counter`** — Counter updates in real-time `{n}/200`
203. **`web-bookmark-list-create-submit-disabled-until-valid`** — Button disabled when fields empty
204. **`web-bookmark-list-create-keyboard-escape-closes`** — Escape closes dialog
205. **`web-bookmark-list-create-backdrop-click-closes`** — Click outside closes dialog
206. **`web-bookmark-list-delete-confirmation`** — Click delete → modal → confirm → bookmark deleted + toast
207. **`web-bookmark-list-delete-cancel`** — Click delete → modal → cancel → bookmark preserved
208. **`web-bookmark-list-delete-default-disabled`** — Default bookmark delete action disabled with tooltip
209. **`web-bookmark-list-delete-protected-disabled`** — Protected bookmark delete disabled for non-admin with tooltip
210. **`web-bookmark-list-delete-kebab-menu-visible`** — Write-access user, kebab menu with delete action
211. **`web-bookmark-list-delete-kebab-menu-hidden-readonly`** — Read-only user, no delete in menu
212. **`web-bookmark-list-delete-escape-dismisses-modal`** — Escape closes deletion modal
213. **`web-bookmark-list-delete-spinner-during-request`** — Spinner on Delete button during request
214. **`web-bookmark-list-delete-permission-error`** — 403 response, inline error in modal
215. **`web-bookmark-list-delete-not-found-error`** — 404 response, inline error + list refresh
216. **`web-bookmark-list-delete-server-error`** — 500 response, inline error "Something went wrong"
217. **`web-bookmark-list-delete-protected-warning`** — Protected bookmark shows additional warning in modal
218. **`web-bookmark-list-delete-list-refreshes`** — After successful delete, list reflects deletion
219. **`web-bookmark-list-delete-keyboard-enter-submits`** — Enter in modal triggers deletion
220. **`web-bookmark-list-delete-toast-notification`** — Toast appears and auto-dismisses
221. **`web-bookmark-list-error-state`** — API error shows error message with retry option
222. **`web-bookmark-list-pagination`** — Repo with >30 bookmarks, pagination controls visible and functional
223. **`web-bookmark-list-private-repo-requires-auth`** — Unauthenticated access to private repo redirects to login
224. **`web-bookmark-list-name-max-length-display`** — 200-char name displayed with truncation and tooltip
225. **`web-bookmark-list-tracking-badge`** — Tracking bookmarks show "Tracking" badge, local show "Local"
226. **`web-bookmark-list-copy-button`** — Copy button copies change ID to clipboard
227. **`web-bookmark-list-count-badge`** — Tab count badge matches number of bookmarks

## Cross-Client Consistency Tests (`e2e/cross-client/bookmark.test.ts`)

228. **`cross-client-api-and-cli-same-data`** — Same repo, API and CLI return identical bookmark names, change IDs, and commit IDs
229. **`cross-client-api-and-web-same-data`** — API JSON response matches bookmarks visible in Web UI
230. **`cross-client-cli-create-visible-in-web`** — Create bookmark via CLI, verify visible in Web UI
231. **`cross-client-web-delete-reflected-in-cli`** — Delete via Web UI, verify absent in CLI list
