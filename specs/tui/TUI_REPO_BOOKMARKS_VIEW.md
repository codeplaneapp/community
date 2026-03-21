# TUI_REPO_BOOKMARKS_VIEW

Specification for TUI_REPO_BOOKMARKS_VIEW.

## High-Level User POV

The bookmarks view is the default tab content within the repository detail screen. When a user opens a repository and lands on the Bookmarks tab (tab `1`), they see a list of all jj bookmarks in that repository. Bookmarks are the jj-native equivalent of branches — named pointers to specific changes in the repository's history. This view answers the developer's question: "what bookmarks exist in this repo, which one is the default, and what changes do they point to?"

The bookmark list is rendered as a vertically scrollable table within the tab content area. Each row displays the bookmark name, the short change ID it targets, the short commit ID, a tracking indicator showing whether the bookmark tracks a remote, and a badge marking the repository's default bookmark. The default bookmark — typically "main" — is displayed at the top of the list regardless of sort order, visually distinguished with a `★` prefix and `primary` color on its name. All other bookmarks are sorted alphabetically by name.

The focused bookmark row is highlighted with reverse-video styling. The user navigates the list with `j`/`k` (or arrow keys), and can press `Enter` to view the change that the focused bookmark points to, which pushes the change detail screen onto the navigation stack. Pressing `d` on a focused bookmark opens the diff view for that bookmark's target change. Pressing `c` copies the focused bookmark's name to the clipboard (with a brief "Copied!" confirmation in the status bar).

At the top of the bookmark list is a section header showing "Bookmarks (N)" where N is the total count. Below the header, the user can press `/` to activate an inline filter that narrows the list by bookmark name substring match (case-insensitive). Pressing `Esc` clears the filter and returns focus to the list.

For users with write access to the repository, pressing `n` opens a bookmark creation form. The form has two fields: bookmark name (text input) and target change ID (text input with optional autocomplete). Pressing `Ctrl+S` or `Enter` on the submit button creates the bookmark. Pressing `Esc` cancels. After successful creation, the new bookmark appears in the list and the focus moves to it. For deletion, pressing `x` on a focused bookmark shows a confirmation prompt: "Delete bookmark '{name}'? y/n". Pressing `y` deletes the bookmark optimistically (it disappears immediately, re-appears if the server rejects). Pressing `n` or `Esc` cancels the deletion. The default bookmark cannot be deleted — pressing `x` on the default bookmark shows a muted message: "Cannot delete the default bookmark."

Each bookmark row adapts its layout based on terminal width. At minimum size (80×24), only the bookmark name, the default badge, and the tracking indicator are shown. At standard size (120×40), the change ID and commit ID columns become visible. At large size (200×60+), all columns expand, and tracking labels show full text instead of icons.

If the repository has no bookmarks, the list area shows a centered, muted-color message: "No bookmarks. Create one with `n`." If the API request to fetch bookmarks fails, an inline error message replaces the list content with the error description and "Press `R` to retry." The bookmarks view does not use SSE streaming — bookmark data is fetched via REST on mount and can be refreshed manually by pressing `R`.

## Acceptance Criteria

### Definition of Done

- [ ] The Bookmarks tab (tab `1`) renders a scrollable list of jj bookmarks for the current repository
- [ ] Bookmarks are fetched via `useBookmarks()` from `@codeplane/ui-core`, which calls `GET /api/repos/:owner/:repo/bookmarks`
- [ ] The default bookmark is displayed first in the list, regardless of alphabetical position, with a `★` prefix in `primary` color
- [ ] Non-default bookmarks are sorted alphabetically by name (ascending)
- [ ] Each row displays: bookmark name, target change ID (short, 12 chars), target commit ID (short, 12 chars), tracking indicator, and default badge
- [ ] `j`/`k` (and `Down`/`Up` arrow keys) move the focus cursor through the list
- [ ] `Enter` on a focused row pushes the change detail screen onto the navigation stack with the bookmark's `target_change_id` as context
- [ ] `d` on a focused row pushes the diff view for the bookmark's target change
- [ ] `c` on a focused row copies the bookmark name to the system clipboard and shows "Copied!" in the status bar for 2 seconds
- [ ] `/` activates an inline filter input that narrows the list client-side by bookmark name substring match (case-insensitive)
- [ ] `Esc` while the filter input is focused clears the filter text, returns focus to the list
- [ ] The section header shows "Bookmarks (N)" where N is the total count from the API response
- [ ] `n` opens the bookmark creation form (only for users with write access)
- [ ] The creation form has two fields: name (required, text input) and target change ID (optional, text input, defaults to working copy change)
- [ ] `Ctrl+S` or `Enter` on submit button creates the bookmark via `POST /api/repos/:owner/:repo/bookmarks`
- [ ] After successful creation, the new bookmark appears in the list and focus moves to it
- [ ] `x` on a non-default bookmark shows a confirmation prompt; `y` confirms deletion via `DELETE /api/repos/:owner/:repo/bookmarks/:name`
- [ ] `x` on the default bookmark shows "Cannot delete the default bookmark." in the status bar for 2 seconds
- [ ] Deletion is optimistic: bookmark removed from list immediately, re-appears on server error with error message
- [ ] `R` triggers a hard refresh of the bookmark list from the API (active in any state, not just error)
- [ ] Empty state shows "No bookmarks. Create one with `n`." in muted color centered in the content area
- [ ] Loading state shows a spinner with "Loading…" centered in the content area
- [ ] API errors display inline error message with "Press `R` to retry" hint
- [ ] Auth errors (401) propagate to the app-shell-level auth error screen
- [ ] Rate limit errors (429) display the retry-after period inline

### Keyboard Interactions

- `j` / `Down`: Move focus to next bookmark row
- `k` / `Up`: Move focus to previous bookmark row
- `Enter`: Open change detail for focused bookmark's target change
- `d`: Open diff view for focused bookmark's target change
- `c`: Copy focused bookmark name to clipboard
- `/`: Focus the filter input
- `Esc`: Clear filter input and return focus to list (if filter is focused); cancel creation form; dismiss confirmation prompt
- `G`: Jump to the last bookmark row
- `g g`: Jump to the first bookmark row
- `Ctrl+D`: Page down within the scrollbox
- `Ctrl+U`: Page up within the scrollbox
- `n`: Open bookmark creation form (write-access users only)
- `x`: Delete focused bookmark (with confirmation, write-access users only)
- `R`: Refresh bookmark list (hard re-fetch from API)
- `Ctrl+S`: Submit creation form (when form is open)
- `y`: Confirm deletion (when confirmation prompt is visible)
- `Tab` / `Shift+Tab`: Switch to next/previous repository tab (handled by parent tab navigation)

### Responsive Behavior

- Below 80×24: "Terminal too small" handled by router — bookmarks view not rendered
- 80×24 – 119×39 (minimum): Columns shown: name (up to 40 chars) │ ★ default │ tracking indicator. Change ID and commit ID hidden
- 120×40 – 199×59 (standard): All columns visible. Name (30ch) + change ID (14ch) + commit ID (14ch) + tracking (3ch) + default badge (3ch)
- 200×60+ (large): Expanded name (50ch), full change ID (14ch), full commit ID (14ch), tracking (10ch "tracking" / "local"), default badge

### Truncation and Boundary Constraints

- Bookmark `name`: truncated with trailing `…` when exceeding column width (40/30/50 chars at min/standard/large). Bookmark names limited to 200 characters by API
- Change ID display: always 12 characters (short form). Never truncated, hidden if insufficient width
- Commit ID display: always 12 characters (short form). Never truncated, hidden if insufficient width
- Tracking indicator: `↔` (tracking) or empty at minimum; "tracking" / "local" at large width
- Default badge: `★` at all sizes
- Filter input: max 100 characters
- Maximum loaded bookmarks in memory: 1000 items (pagination cap)
- Bookmark creation name input: max 200 characters, validated client-side (alphanumeric, hyphens, underscores, slashes, dots)
- Confirmation prompt text: max 80 characters, truncated if bookmark name is extremely long

### Edge Cases

- Terminal resize while scrolled: scroll position preserved relative to focused item
- Rapid `j` presses: processed sequentially, no debouncing
- Filter during loading: filter input is disabled until initial data load completes
- SSE disconnect: bookmarks view unaffected (uses REST)
- Unicode in bookmark names: truncation respects grapheme clusters
- Bookmark with very long name (200 chars): truncated in list view, full name shown in clipboard copy
- Repository with zero bookmarks: empty state rendered; `n` still works to create the first bookmark
- Repository with only a default bookmark: single-row list, default badge visible
- Deletion of last non-default bookmark: list shrinks to default only; no special handling
- Network error during creation: form remains open with error message; user can retry
- Network error during deletion: bookmark re-appears in list with error toast
- Bookmark name containing special characters (slashes, dots): displayed as-is, no escaping in list
- Protected bookmark: pressing `x` on a protected bookmark shows "Bookmark is protected. Cannot delete." in the status bar

## Design

### Layout Structure

The bookmarks view occupies the tab content area below the repository tab bar:

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

### Component Structure

```jsx
<box flexDirection="column" width="100%" flexGrow={1}>
  {/* Section header */}
  <box flexDirection="row" height={1}>
    <text bold color="primary">Bookmarks</text>
    <text color="muted"> ({totalCount})</text>
    <box flexGrow={1} />
    <text color="muted">/ filter  R refresh</text>
  </box>

  {/* Filter input — shown only when active */}
  {filterActive && (
    <box height={1}>
      <input value={filterText} onChange={setFilterText} placeholder="Filter bookmarks…" />
    </box>
  )}

  {/* Bookmark list */}
  <scrollbox flexGrow={1}>
    <box flexDirection="column">
      {sortedBookmarks.map(bookmark => (
        <box key={bookmark.name} flexDirection="row" height={1}
             backgroundColor={bookmark.name === focusedName ? "primary" : undefined}>
          <box width={3}>
            <text color="primary">{bookmark.isDefault ? "★ " : "  "}</text>
          </box>
          <box width={nameColumnWidth}>
            <text bold={bookmark.name === focusedName}
                  color={bookmark.isDefault ? "primary" : undefined}>
              {truncate(bookmark.name, nameColumnWidth)}
            </text>
          </box>
          {showChangeId && (
            <box width={14}>
              <text color="muted">{bookmark.target_change_id.slice(0, 12)}</text>
            </box>
          )}
          {showCommitId && (
            <box width={14}>
              <text color="muted">{bookmark.target_commit_id.slice(0, 12)}</text>
            </box>
          )}
          <box width={trackingColumnWidth}>
            <text color="muted">
              {bookmark.is_tracking_remote ? (isLarge ? "tracking" : "↔") : (isLarge ? "local" : "")}
            </text>
          </box>
        </box>
      ))}
      {!isLoading && sortedBookmarks.length === 0 && !error && (
        <box justifyContent="center" alignItems="center" flexGrow={1}>
          <text color="muted">{filterText ? "No matching bookmarks" : "No bookmarks. Create one with `n`."}</text>
        </box>
      )}
    </box>
  </scrollbox>

  {/* Creation form overlay */}
  {showCreateForm && (
    <box position="absolute" top="center" left="center" width="60%" height={8}
         border="single" borderColor="border" flexDirection="column" padding={1}>
      <text bold color="primary">Create Bookmark</text>
      <box height={1} />
      <input label="Name" value={newBookmarkName} onChange={setNewBookmarkName}
             placeholder="e.g., feature/my-feature" />
      <input label="Target change" value={newBookmarkTarget} onChange={setNewBookmarkTarget}
             placeholder="change ID (leave empty for working copy)" />
      <box flexDirection="row" gap={2}>
        <text color="muted">Ctrl+S: create  Esc: cancel</text>
      </box>
    </box>
  )}

  {/* Delete confirmation prompt */}
  {showDeleteConfirm && (
    <box position="absolute" top="center" left="center" width="50%" height={3}
         border="single" borderColor="warning" justifyContent="center" alignItems="center">
      <text>Delete bookmark '{deleteTargetName}'? y/n</text>
    </box>
  )}
</box>
```

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Move focus down | List focused, not in filter/form |
| `k` / `Up` | Move focus up | List focused, not in filter/form |
| `Enter` | Open change detail for focused bookmark | Bookmark row focused |
| `d` | Open diff view for focused bookmark's target change | Bookmark row focused |
| `c` | Copy bookmark name to clipboard | Bookmark row focused |
| `/` | Activate filter input | List focused |
| `Esc` | Clear filter / cancel form / dismiss confirmation | Context-dependent |
| `G` | Jump to last bookmark row | List focused |
| `g g` | Jump to first bookmark row | List focused |
| `Ctrl+D` | Page down | List focused |
| `Ctrl+U` | Page up | List focused |
| `n` | Open bookmark creation form | List focused, user has write access |
| `x` | Delete focused bookmark (with confirmation) | Bookmark row focused, user has write access, not default |
| `R` | Refresh bookmark list from API | Any state |
| `Ctrl+S` | Submit creation form | Creation form open |
| `y` | Confirm deletion | Confirmation prompt visible |

### Responsive Column Layout

**80×24 (minimum)**: `│ ★  name (40ch)  │ ↔ │` — 2 columns visible (badge+name, tracking indicator)

**120×40 (standard)**: `│ ★  name (30ch)  │ change_id (12ch) │ commit_id (12ch) │ ↔ │` — All columns visible

**200×60 (large)**: `│ ★  name (50ch)  │ change_id (12ch) │ commit_id (12ch) │ tracking │` — All columns plus expanded labels

### Data Hooks

| Hook | Source | Purpose |
|------|--------|--------|
| `useBookmarks()` | `@codeplane/ui-core` | Fetch bookmark list. Returns `{ items: Bookmark[], totalCount: number, isLoading: boolean, error: Error \| null, refresh: () => void }`. Calls `GET /api/repos/:owner/:repo/bookmarks` |
| `useCreateBookmark()` | `@codeplane/ui-core` | Mutation hook. Calls `POST /api/repos/:owner/:repo/bookmarks` with `{ name, target_change_id }` |
| `useDeleteBookmark()` | `@codeplane/ui-core` | Mutation hook. Calls `DELETE /api/repos/:owner/:repo/bookmarks/:name` |
| `useRepo()` | `@codeplane/ui-core` | Repository metadata (for `default_bookmark` field and permission check) |
| `useUser()` | `@codeplane/ui-core` | Current user profile (for write access determination) |
| `useKeyboard()` | `@opentui/react` | Keybinding registration for bookmark-specific keys |
| `useTerminalDimensions()` | `@opentui/react` | Responsive column layout breakpoints |
| `useOnResize()` | `@opentui/react` | Trigger synchronous re-layout on terminal resize |

### Navigation Context

When `Enter` is pressed on a focused bookmark, calls `push("change-detail", { repo: repoFullName, changeId: focused.target_change_id })`. Breadcrumb updates to "Dashboard > owner/repo > Bookmarks > {change_id}".

When `d` is pressed, calls `push("diff-view", { repo: repoFullName, changeId: focused.target_change_id })`. Breadcrumb updates to "Dashboard > owner/repo > Diff > {change_id}".

### Sorting Logic

```typescript
function sortBookmarks(bookmarks: Bookmark[], defaultBookmark: string): Bookmark[] {
  const defaultBm = bookmarks.find(b => b.name === defaultBookmark);
  const others = bookmarks
    .filter(b => b.name !== defaultBookmark)
    .sort((a, b) => a.name.localeCompare(b.name));
  return defaultBm ? [defaultBm, ...others] : others;
}
```

### Terminal Resize Behavior

- On resize, `useOnResize()` triggers synchronous re-layout
- Column widths recalculate based on new terminal dimensions
- Columns appear/disappear at breakpoint boundaries (change ID and commit ID at 120 cols)
- Focused row stays visible after resize
- Creation form re-centers and adjusts width (60% standard, 90% minimum)
- Delete confirmation prompt re-centers
- Filter input adjusts to full available width
- No animation or transition during resize

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View bookmarks list | ❌ (TUI requires auth) | ✅ | ✅ | ✅ |
| Copy bookmark name | ❌ | ✅ | ✅ | ✅ |
| View bookmark's change detail | ❌ | ✅ | ✅ | ✅ |
| Create bookmark | ❌ | ❌ | ✅ | ✅ |
| Delete bookmark | ❌ | ❌ | ✅ | ✅ |
| Delete protected bookmark | ❌ | ❌ | ❌ | ✅ |

- The TUI requires authentication at bootstrap; unauthenticated sessions never reach the bookmarks view
- Read-only collaborators see the full bookmark list but the `n` (create) and `x` (delete) keybindings are suppressed; pressing them shows "Insufficient permissions" in the status bar for 2 seconds
- Write-access users can create and delete non-protected, non-default bookmarks
- Admin users can delete protected bookmarks (the protection check is server-side; the TUI sends the DELETE request and surfaces any 403 error)
- The `default_bookmark` field comes from the repository metadata (`useRepo()`), not from the bookmarks list response

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to `@codeplane/ui-core` API client as Bearer token
- Token is never displayed in the TUI, never logged, never included in error messages
- 401 responses propagate to the app-shell auth error screen
- 403 responses on create/delete show "Permission denied" inline; the user stays on the bookmarks view

### Rate Limiting

- Authenticated users: 5,000 requests per hour (shared across all API endpoints)
- `GET /api/repos/:owner/:repo/bookmarks`: typically 1 request per view load
- `POST /api/repos/:owner/:repo/bookmarks`: mutative, subject to standard rate limits
- `DELETE /api/repos/:owner/:repo/bookmarks/:name`: mutative, subject to standard rate limits
- If 429 is returned, the bookmarks view displays "Rate limited. Retry in {Retry-After}s." inline
- No auto-retry on rate limit; user presses `R` after the retry-after period

### Input Sanitization

- Filter input is client-side only — never sent to the API
- Bookmark name input for creation validated client-side: alphanumeric, hyphens, underscores, slashes, dots. Regex: `/^[a-zA-Z0-9._\/-]+$/`
- Invalid characters rejected immediately with inline validation message
- Target change ID input accepts hexadecimal characters only, validated client-side
- Bookmark names and IDs rendered as plain text via `<text>` components (no injection risk)

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.repo.bookmarks.view` | Bookmarks tab visible (initial load completes) | `repo_full_name`, `total_count`, `has_default_bookmark`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms` |
| `tui.repo.bookmarks.open_change` | User presses Enter on a bookmark | `repo_full_name`, `bookmark_name`, `bookmark_is_default`, `bookmark_is_tracking`, `position_in_list`, `was_filtered` |
| `tui.repo.bookmarks.open_diff` | User presses `d` on a bookmark | `repo_full_name`, `bookmark_name`, `position_in_list` |
| `tui.repo.bookmarks.copy_name` | User presses `c` on a bookmark | `repo_full_name`, `bookmark_name` |
| `tui.repo.bookmarks.filter` | User activates filter (presses `/`) | `total_count` |
| `tui.repo.bookmarks.filter_results` | User types in filter | `filter_text_length`, `matched_count`, `total_count` |
| `tui.repo.bookmarks.create_start` | User opens creation form | `repo_full_name`, `total_count` |
| `tui.repo.bookmarks.create_submit` | User submits creation form | `repo_full_name`, `bookmark_name_length`, `has_target_change_id` |
| `tui.repo.bookmarks.create_success` | Creation API succeeds | `repo_full_name`, `bookmark_name`, `create_time_ms` |
| `tui.repo.bookmarks.create_error` | Creation API fails | `repo_full_name`, `error_type`, `http_status` |
| `tui.repo.bookmarks.create_cancel` | User cancels creation | `repo_full_name`, `had_partial_input` |
| `tui.repo.bookmarks.delete_prompt` | User presses `x` | `repo_full_name`, `bookmark_name`, `bookmark_is_tracking` |
| `tui.repo.bookmarks.delete_confirm` | User confirms deletion | `repo_full_name`, `bookmark_name` |
| `tui.repo.bookmarks.delete_cancel` | User cancels deletion | `repo_full_name`, `bookmark_name` |
| `tui.repo.bookmarks.delete_success` | Deletion API succeeds | `repo_full_name`, `bookmark_name`, `delete_time_ms` |
| `tui.repo.bookmarks.delete_error` | Deletion API fails | `repo_full_name`, `bookmark_name`, `error_type`, `http_status` |
| `tui.repo.bookmarks.refresh` | User presses `R` | `repo_full_name`, `was_error_state`, `previous_count` |
| `tui.repo.bookmarks.error` | API fails on initial load | `repo_full_name`, `error_type`, `http_status` |
| `tui.repo.bookmarks.empty` | Empty state rendered | `repo_full_name` |
| `tui.repo.bookmarks.permission_denied` | Read-only user presses `n` or `x` | `repo_full_name`, `action` |

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Bookmarks view load rate | >98% | % of tab visits that successfully load data |
| Bookmark open rate | >40% | % of sessions where user opens at least one change/diff |
| Diff shortcut adoption | >20% | % of interactions using `d` to view diff directly |
| Copy adoption | >10% | % of interactions using `c` to copy name |
| Filter adoption | >15% (repos with >10 bookmarks) | % of views where user activates filter |
| Create success rate | >90% | % of creation submissions that succeed |
| Delete success rate | >95% | % of confirmed deletions that succeed |
| Refresh frequency | Track | Average refreshes per session |
| Error rate | <2% | % of loads resulting in error state |
| Time to first interaction | Track p50 | Time from mount to first keypress |
| Permission denial rate | Track | How often read-only users attempt write actions |

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|---------|
| `info` | Bookmarks loaded | `repo_full_name`, `total_count`, `load_time_ms` |
| `info` | Bookmark created | `repo_full_name`, `bookmark_name` |
| `info` | Bookmark deleted | `repo_full_name`, `bookmark_name` |
| `info` | Change detail opened from bookmark | `repo_full_name`, `bookmark_name`, `target_change_id` |
| `warn` | API error on bookmarks fetch | `http_status`, `error_message` (no token) |
| `warn` | API error on bookmark create | `http_status`, `error_message`, `bookmark_name` |
| `warn` | API error on bookmark delete | `http_status`, `error_message`, `bookmark_name` |
| `warn` | Rate limited on bookmarks endpoint | `retry_after_seconds` |
| `warn` | Permission denied on create/delete | `action`, `repo_full_name` |
| `warn` | Filter returned zero results | `filter_text`, `total_count` |
| `debug` | Bookmark list focused | `focused_index`, `focused_name` |
| `debug` | Filter activated | `filter_text_length` |
| `debug` | Filter cleared | — |
| `debug` | Creation form opened | — |
| `debug` | Creation form cancelled | `had_partial_input` |
| `debug` | Delete confirmation shown | `bookmark_name` |
| `debug` | Delete confirmation cancelled | `bookmark_name` |
| `debug` | Clipboard copy attempted | `bookmark_name`, `success` |
| `debug` | Hard refresh triggered | `was_error_state` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on initial fetch | Data hook timeout (30s) | Loading spinner replaced with error + "Press `R` to retry" |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen |
| Rate limited (429) | API returns 429 with Retry-After | Inline error: "Rate limited. Retry in Ns." `R` retries after waiting |
| Server error (500) on fetch | API returns 5xx | Inline error with generic message. `R` retries |
| Permission denied (403) on create | API returns 403 | Creation form stays open. Error: "Permission denied." |
| Permission denied (403) on delete | API returns 403 | Bookmark re-appears in list. Error in status bar |
| Conflict (409) on create | API returns 409 | Form stays open. Error: "Bookmark '{name}' already exists." |
| Bad request (400) on create | API returns 400 | Form stays open. Server error message displayed |
| Not found (404) on delete | API returns 404 | Bookmark already gone. List refreshed. No error |
| Clipboard write failure | Clipboard API throws | Status bar shows "Copy failed" for 2 seconds |
| Terminal resize during creation form | `useOnResize` fires | Form re-positions to center. Width adjusts. Input preserved |
| Terminal resize during delete confirmation | `useOnResize` fires | Prompt re-positions to center |
| Terminal resize during scrolled list | `useOnResize` fires | Column widths recalculate. Focused row stays visible |
| SSE disconnect | Status bar shows disconnected | Bookmarks view unaffected (uses REST) |
| Optimistic delete + server error | Server returns error on DELETE | Bookmark re-inserted at correct sorted position. Error toast |
| Malformed API response | JSON parse error | Error state with generic error message |
| React error boundary triggered | Error boundary catches | Error screen per app-shell error boundary |

### Failure Modes

- **Total fetch failure**: Error state in bookmarks content area. Tab bar remains interactive. User can switch tabs or press `R`
- **Partial state after optimistic delete fails**: Bookmark re-inserted at correct sorted position. Focus moves to re-inserted item. Error in status bar
- **Creation form open during resize**: Form re-centers and adjusts width. All input state preserved
- **Creation form open during auth expiry**: Submit shows auth error. Form stays open
- **Memory pressure**: Bookmark lists typically small (10–100 items). 1000-item cap as safety net. No virtual scrolling needed

## Verification

### Test File: `e2e/tui/repository.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

#### Terminal Snapshot Tests

1. **`repo-bookmarks-initial-load`** — Navigate to repo, land on Bookmarks tab at 120×40. Snapshot. Assert "Bookmarks (N)" header, list rows with names/IDs/tracking, default bookmark first with `★`, focused row highlighted.
2. **`repo-bookmarks-default-bookmark-highlight`** — Repo with default "main" at 120×40. Assert first row `★ main` in primary color.
3. **`repo-bookmarks-empty-state`** — Repo with zero bookmarks at 120×40. Assert centered "No bookmarks. Create one with `n`." in muted color.
4. **`repo-bookmarks-loading-state`** — Slow API at 120×40. Assert "Loading…" spinner before data arrives.
5. **`repo-bookmarks-error-state`** — Failing API at 120×40. Assert red error message with "Press `R` to retry".
6. **`repo-bookmarks-focused-row`** — Navigate to repo. Assert first bookmark highlighted with primary reverse-video.
7. **`repo-bookmarks-tracking-indicator`** — Mix of tracking/non-tracking at 120×40. Assert `↔` for tracking, empty for non-tracking.
8. **`repo-bookmarks-filter-active`** — Press `/`. Assert filter input with "Filter bookmarks…" placeholder.
9. **`repo-bookmarks-filter-results`** — Press `/`, type "feat". Assert only matching bookmarks visible.
10. **`repo-bookmarks-filter-no-results`** — Press `/`, type "zzzznonexistent". Assert "No matching bookmarks".
11. **`repo-bookmarks-create-form`** — Press `n`. Assert modal with "Create Bookmark" title, Name and Target fields.
12. **`repo-bookmarks-delete-confirmation`** — Focus non-default, press `x`. Assert "Delete bookmark '{name}'? y/n" with warning border.
13. **`repo-bookmarks-many-bookmarks`** — 50 bookmarks at 120×40. Assert scrollbox with visible portion and scrollbar.
14. **`repo-bookmarks-single-default-only`** — One bookmark (default). Assert single row with `★` badge.

#### Keyboard Interaction Tests

15. **`repo-bookmarks-j-moves-down`** — Press `j`. Focus moves first → second row.
16. **`repo-bookmarks-k-moves-up`** — Press `j` then `k`. Focus returns to first row.
17. **`repo-bookmarks-k-at-top-no-wrap`** — Press `k` on first row. Focus stays.
18. **`repo-bookmarks-j-at-bottom-no-wrap`** — Last bookmark, press `j`. Focus stays.
19. **`repo-bookmarks-down-arrow-moves-down`** — Down arrow same as `j`.
20. **`repo-bookmarks-up-arrow-moves-up`** — Down then Up same as `k`.
21. **`repo-bookmarks-enter-opens-change`** — Enter pushes change detail. Breadcrumb updates.
22. **`repo-bookmarks-d-opens-diff`** — `d` pushes diff view. Breadcrumb updates.
23. **`repo-bookmarks-c-copies-name`** — `c` → status bar "Copied!". Clipboard has bookmark name.
24. **`repo-bookmarks-slash-activates-filter`** — `/` → filter input focused.
25. **`repo-bookmarks-filter-narrows-list`** — `/`, type "fix". Only matching bookmarks visible.
26. **`repo-bookmarks-filter-case-insensitive`** — `/`, type "FIX". Same results as lowercase.
27. **`repo-bookmarks-esc-clears-filter`** — `/`, type "test", Esc. Filter cleared, full list shown.
28. **`repo-bookmarks-G-jumps-to-bottom`** — `G` → focus on last row.
29. **`repo-bookmarks-gg-jumps-to-top`** — `G` then `g g` → focus on first row.
30. **`repo-bookmarks-ctrl-d-page-down`** — `Ctrl+D` → focus moves down half visible height.
31. **`repo-bookmarks-ctrl-u-page-up`** — `Ctrl+D` then `Ctrl+U` → focus returns.
32. **`repo-bookmarks-n-opens-create-form`** — `n` (write access) → creation form appears.
33. **`repo-bookmarks-create-form-submit`** — Form, type "new-feature", `Ctrl+S` → form closes, new bookmark in list.
34. **`repo-bookmarks-create-form-esc-cancels`** — Form, type partial, Esc → form closes, no creation.
35. **`repo-bookmarks-x-on-non-default`** — Focus non-default, `x` → confirmation prompt.
36. **`repo-bookmarks-delete-confirm-y`** — Confirmation, `y` → bookmark removed.
37. **`repo-bookmarks-delete-confirm-n`** — Confirmation, `n` → dismissed, bookmark remains.
38. **`repo-bookmarks-delete-confirm-esc`** — Confirmation, Esc → dismissed, bookmark remains.
39. **`repo-bookmarks-x-on-default-blocked`** — Default bookmark, `x` → status bar "Cannot delete the default bookmark."
40. **`repo-bookmarks-R-refreshes-list`** — `R` → list re-fetched.
41. **`repo-bookmarks-R-on-error-retries`** — Error state, `R` → fetch retried.
42. **`repo-bookmarks-n-blocked-read-only`** — Read-only, `n` → "Insufficient permissions".
43. **`repo-bookmarks-x-blocked-read-only`** — Read-only, `x` → "Insufficient permissions".
44. **`repo-bookmarks-j-in-filter-types-j`** — `/` then `j` → 'j' in filter, not navigation.
45. **`repo-bookmarks-enter-during-loading`** — Enter during load → no-op.
46. **`repo-bookmarks-rapid-j-presses`** — 10× `j` → focus moves 10 rows.
47. **`repo-bookmarks-default-always-first`** — Default not alphabetically first → still first row.
48. **`repo-bookmarks-create-invalid-name`** — Form, "invalid name with spaces" → validation error.
49. **`repo-bookmarks-create-duplicate-name`** — Form, existing name, submit → "already exists" error.
50. **`repo-bookmarks-optimistic-delete-rollback`** — Delete, API error → bookmark re-appears, error toast.

#### Responsive Tests

51. **`repo-bookmarks-80x24-layout`** — 80×24. Name + default badge + tracking only. No change/commit IDs.
52. **`repo-bookmarks-80x24-name-truncation`** — 80×24, long name → truncated with `…`.
53. **`repo-bookmarks-80x24-filter`** — 80×24, `/` → filter at full width.
54. **`repo-bookmarks-80x24-create-form`** — 80×24, `n` → form uses 90% width.
55. **`repo-bookmarks-120x40-layout`** — 120×40. All columns: name + change ID + commit ID + tracking.
56. **`repo-bookmarks-120x40-all-columns`** — 120×40. Snapshot each row with all columns.
57. **`repo-bookmarks-200x60-layout`** — 200×60. Expanded name, "tracking"/"local" labels.
58. **`repo-bookmarks-resize-120-to-80`** — 120→80. Change/commit ID columns disappear. Focus preserved.
59. **`repo-bookmarks-resize-80-to-120`** — 80→120. Change/commit ID columns appear.
60. **`repo-bookmarks-resize-preserves-focus`** — Resize at any breakpoint. Focused row preserved.
61. **`repo-bookmarks-resize-during-filter`** — Resize with filter. Filter stays, results re-rendered.
62. **`repo-bookmarks-resize-during-create-form`** — Resize with form. Form re-centers, input preserved.

#### Integration Tests

63. **`repo-bookmarks-auth-expiry`** — 401 → app-shell auth error screen.
64. **`repo-bookmarks-rate-limit-429`** — 429 Retry-After: 30 → "Rate limited. Retry in 30s."
65. **`repo-bookmarks-network-error`** — Timeout → "Press `R` to retry".
66. **`repo-bookmarks-server-error-500`** — 500 → "Press `R` to retry".
67. **`repo-bookmarks-create-403`** — 403 on create → form shows "Permission denied".
68. **`repo-bookmarks-create-409-conflict`** — 409 → "Bookmark '{name}' already exists."
69. **`repo-bookmarks-delete-403`** — 403 on delete → bookmark re-appears, "Permission denied".
70. **`repo-bookmarks-delete-404-graceful`** — 404 on delete → no error, list refreshed.
71. **`repo-bookmarks-enter-then-q-returns`** — Enter, then `q` → bookmarks view restored with focus.
72. **`repo-bookmarks-tab-switch-and-back`** — `2` then `1` → bookmarks re-fetched.
73. **`repo-bookmarks-help-overlay`** — `?` → "Bookmarks" keybinding group listed.
74. **`repo-bookmarks-status-bar-hints`** — Assert status bar shows bookmark keybinding hints.
75. **`repo-bookmarks-deep-link`** — Launch with `--screen repo --repo owner/repo --tab bookmarks` → Bookmarks active.
