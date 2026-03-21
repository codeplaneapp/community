# TUI_REPO_OPERATION_LOG

Specification for TUI_REPO_OPERATION_LOG.

## High-Level User POV

The operation log is the fifth tab within the repository detail screen in the Codeplane TUI. When a user presses `5` (or cycles to the Op Log tab with `Tab`/`Shift+Tab`), they see a chronological log of all jj operations that have been performed on the repository. This view answers the developer's fundamental question: "what has happened in this repo, who did it, and when?" It is the jj-native equivalent of an audit trail — every bookmark creation, change edit, workspace snapshot, merge, rebase, and import is recorded as a discrete operation.

The operation log is rendered as a vertically scrollable list of operation entries, ordered from newest to oldest (descending by timestamp). Each entry in the list is displayed as a single row showing four key pieces of information: the operation ID (a short 12-character identifier), the operation type (e.g., `snapshot`, `rebase`, `new`, `bookmark`, `import_git_refs`), a human-readable description of what the operation did, and a relative timestamp (e.g., "3 minutes ago", "2 hours ago", "yesterday"). The focused row is highlighted with reverse-video styling, making it immediately clear which operation the cursor is on.

The user navigates the list using `j`/`k` (or arrow keys) to move the cursor up and down through operations. Pressing `Enter` on a focused operation opens a detail pane that replaces the list, showing the full operation metadata: the complete operation ID, parent operation ID, operation type, full description text, the user who performed it, and the exact timestamp. This detail view is a read-only information display — jj operations are immutable historical records. The user presses `q` or `Esc` to return from the detail view to the operation list.

At the top of the list is a section header displaying "Operations (N)" where N is the total count of operations in the repository. Below the header, pressing `/` activates an inline filter that narrows the visible operations by substring match against the operation type or description (case-insensitive). This lets the user quickly find, for example, all `rebase` operations or all operations mentioning a specific bookmark name. Pressing `Esc` clears the filter and returns focus to the list.

The operation log supports cursor-based pagination. When the user scrolls near the bottom of the loaded entries (within 80% of the scrollbox height), the next page of operations is fetched automatically. A "Loading more…" indicator appears at the bottom of the list during pagination fetches. The initial page size is 50 operations.

Pressing `y` on a focused operation copies the full operation ID to the system clipboard, with a brief "Copied!" confirmation message in the status bar that auto-clears after 2 seconds. This is useful for referencing operations in CLI commands like `jj op restore` or `jj op diff`.

Pressing `R` at any time triggers a hard refresh of the operation log from the API, discarding any cached pages and reloading from the first page. This is useful after performing local jj operations that may have added new entries.

Each operation row adapts to the available terminal width. At minimum size (80×24), only the operation type, a truncated description, and relative timestamp are shown. At standard size (120×40), the short operation ID column becomes visible. At large size (200×60+), all columns expand — the description gets more room, the user who performed the operation appears as an additional column, and the parent operation ID is shown in a muted secondary column.

## Acceptance Criteria

### Definition of Done

- [ ] The Op Log tab (tab `5`) renders a scrollable list of jj operations for the current repository
- [ ] Operations are fetched via `useOperationLog()` from `@codeplane/ui-core`, which calls `GET /api/repos/:owner/:repo/operations`
- [ ] Operations are displayed in reverse chronological order (newest first, by `created_at DESC`)
- [ ] Each row displays: operation type, description, relative timestamp, and (at sufficient width) operation ID and user
- [ ] `j`/`k` (and `Down`/`Up` arrow keys) move the focus cursor through the list
- [ ] `Enter` on a focused row pushes an inline detail view showing full operation metadata
- [ ] `q` or `Esc` from detail view returns to the list with focus preserved on the previously selected row
- [ ] `y` on a focused row copies the full operation ID to the system clipboard and shows "Copied!" in the status bar for 2 seconds
- [ ] `/` activates an inline filter input that narrows the list client-side by substring match against operation type or description (case-insensitive)
- [ ] `Esc` while the filter input is focused clears the filter text and returns focus to the list
- [ ] The section header shows "Operations (N)" where N is the total count from the API response
- [ ] Cursor-based pagination loads the next page of 50 operations when scroll position reaches 80% of scrollbox content height
- [ ] "Loading more…" indicator appears at the bottom of the list during pagination fetches
- [ ] `R` triggers a hard refresh of the operation log from the API (resets to page 1, scroll to top)
- [ ] Empty state shows "No operations recorded." in muted color centered in the content area
- [ ] Loading state shows a spinner with "Loading…" centered in the content area
- [ ] API errors display inline error message with "Press `R` to retry" hint
- [ ] Auth errors (401) propagate to the app-shell-level auth error screen
- [ ] Rate limit errors (429) display the retry-after period inline

### Keyboard Interactions

- [ ] `j` / `Down`: Move focus to next operation row
- [ ] `k` / `Up`: Move focus to previous operation row
- [ ] `Enter`: Open operation detail view for focused operation
- [ ] `y`: Copy focused operation's full ID to clipboard
- [ ] `/`: Focus the filter input
- [ ] `Esc`: Clear filter input and return focus to list (if filter is focused); dismiss detail view (if in detail)
- [ ] `q`: Return from detail view to list; at list level, propagates to parent
- [ ] `G`: Jump to the last operation row in the loaded list
- [ ] `g g`: Jump to the first operation row
- [ ] `Ctrl+D`: Page down within the scrollbox
- [ ] `Ctrl+U`: Page up within the scrollbox
- [ ] `R`: Refresh operation log from API (hard re-fetch)
- [ ] `Tab` / `Shift+Tab`: Switch to next/previous repository tab (handled by parent)

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by router — operation log not rendered
- [ ] 80×24 – 119×39 (minimum): Columns: type (20ch) │ description (flex) │ timestamp (12ch). Op ID and user hidden.
- [ ] 120×40 – 199×59 (standard): Columns: op ID (14ch) │ type (20ch) │ description (flex) │ timestamp (14ch)
- [ ] 200×60+ (large): All columns: op ID (14ch) │ type (24ch) │ user (16ch) │ description (flex) │ parent ID (14ch) │ timestamp (16ch)

### Truncation and Boundary Constraints

- [ ] Operation ID display: 12 characters (short form). Hidden if insufficient width.
- [ ] Operation type: truncated with trailing `…` at column width. Max API length: 64 characters.
- [ ] Description: fills remaining space, truncated with `…`. Single-line, no wrapping. Max API length: 500 characters.
- [ ] User display: truncated at 16 characters. Only shown at large width.
- [ ] Parent operation ID: 12 characters, shown only at large width in muted color.
- [ ] Relative timestamp: max 16 characters.
- [ ] Filter input: max 100 characters.
- [ ] Maximum loaded operations in memory: 5000 items (pagination ceiling).
- [ ] Initial page size: 50 operations per page.

### Edge Cases

- [ ] Terminal resize while scrolled: scroll position preserved relative to focused item
- [ ] Terminal resize while in detail view: detail view re-layouts, content re-wraps
- [ ] Rapid `j` presses: processed sequentially, no debouncing
- [ ] Filter during loading: filter input disabled until initial data load completes
- [ ] SSE disconnect: operation log view unaffected (uses REST)
- [ ] Unicode in descriptions: truncation respects grapheme clusters
- [ ] Operation with very long description (500 chars): truncated in list, full text in detail with wrapping
- [ ] Network error during pagination: already-loaded operations remain visible; error at list bottom
- [ ] Detail view for operation with no parent: parent ID field shows "—"
- [ ] API returning 501: inline error "Operation log is not available. Backend not implemented."
- [ ] Copy to clipboard failure: status bar shows "Copy failed — clipboard not available" for 2 seconds

## Design

### Screen Layout — List View

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo                 ● SYNCED 🔔 3│
├─────────────────────────────────────────────────────────────┤
│ owner/repo                          PUBLIC    ★ 42          │
│ Description text here...                                    │
├─────────────────────────────────────────────────────────────┤
│  1:Bookmarks  2:Changes  3:Code  4:Conflicts [5:OpLog] 6:S │
├─────────────────────────────────────────────────────────────┤
│ Operations (247)                            / filter  R ref │
│                                                             │
│  abc12345def0  snapshot  working copy update         3m ago │
│  xyz98765fed1  rebase    rebase -r ksxy onto mzrl    1h ago │
│  mno34567abc2  bookmark  create feature/auth         2h ago │
│  pqr56789def3  new       new change                  5h ago │
│  stu90123ghi4  import    import git refs           yest.    │
│  ...                                                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ j/k:navigate  Enter:detail  y:copy ID  R:refresh   ? help  │
└─────────────────────────────────────────────────────────────┘
```

### Screen Layout — Detail View

```
┌─────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo                 ● SYNCED 🔔 3│
├─────────────────────────────────────────────────────────────┤
│ owner/repo                          PUBLIC    ★ 42          │
├─────────────────────────────────────────────────────────────┤
│  1:Bookmarks  2:Changes  3:Code  4:Conflicts [5:OpLog] 6:S │
├─────────────────────────────────────────────────────────────┤
│ ◀ Operation Detail                                          │
│                                                             │
│ Operation ID    abc12345def0ba1234567890abcdef012345678      │
│ Parent Op ID    xyz98765fed1ba0987654321fedcba987654321      │
│ Type            snapshot                                    │
│ Description     working copy update                         │
│ User            alice                                       │
│ Timestamp       2026-03-21 14:32:07 UTC                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ q/Esc:back  y:copy ID                                ? help │
└─────────────────────────────────────────────────────────────┘
```

### Component Structure — List View

Uses OpenTUI components: `<box>` for layout, `<scrollbox>` for the scrollable list, `<text>` for operation fields, `<input>` for filter.

```jsx
<box flexDirection="column" width="100%" flexGrow={1}>
  <box flexDirection="row" height={1}>
    <text bold color="primary">Operations</text>
    <text color="muted"> ({totalCount})</text>
    <box flexGrow={1} />
    <text color="muted">/ filter  R refresh</text>
  </box>
  {filterActive && (
    <box height={1}>
      <input value={filterText} onChange={setFilterText} placeholder="Filter by type or description…" />
    </box>
  )}
  <scrollbox flexGrow={1} onScrollEnd={loadNextPage}>
    <box flexDirection="column">
      {filteredOperations.map(op => (
        <box key={op.operation_id} flexDirection="row" height={1}
             backgroundColor={op.operation_id === focusedId ? "primary" : undefined}>
          {showOpId && <box width={14}><text color="muted">{op.operation_id.slice(0, 12)}</text></box>}
          <box width={typeColumnWidth}>
            <text bold={op.operation_id === focusedId} color="success">
              {truncate(op.operation_type, typeColumnWidth)}
            </text>
          </box>
          {showUser && <box width={16}><text color="muted">{truncate(op.user, 14)}</text></box>}
          <box flexGrow={1}><text>{truncate(op.description, descriptionMaxWidth)}</text></box>
          {showParentId && <box width={14}><text color="muted">{op.parent_operation_id?.slice(0, 12) || "—"}</text></box>}
          <box width={timestampColumnWidth}><text color="muted">{formatRelativeTime(op.timestamp)}</text></box>
        </box>
      ))}
      {isPaginationLoading && <box height={1} justifyContent="center"><text color="muted">Loading more…</text></box>}
      {!isLoading && filteredOperations.length === 0 && !error && (
        <box justifyContent="center" alignItems="center" flexGrow={1}>
          <text color="muted">{filterText ? "No matching operations." : "No operations recorded."}</text>
        </box>
      )}
    </box>
  </scrollbox>
</box>
```

### Component Structure — Detail View

```jsx
<box flexDirection="column" width="100%" flexGrow={1}>
  <box height={1}><text color="primary">◀ </text><text bold color="primary">Operation Detail</text></box>
  <box height={1} />
  <scrollbox flexGrow={1}>
    <box flexDirection="column" gap={0}>
      <box flexDirection="row" height={1}><box width={18}><text color="muted">Operation ID</text></box><text>{operation.operation_id}</text></box>
      <box flexDirection="row" height={1}><box width={18}><text color="muted">Parent Op ID</text></box><text color="muted">{operation.parent_operation_id || "—"}</text></box>
      <box flexDirection="row" height={1}><box width={18}><text color="muted">Type</text></box><text color="success">{operation.operation_type}</text></box>
      <box flexDirection="row" height={1}><box width={18}><text color="muted">Description</text></box><text>{operation.description}</text></box>
      <box flexDirection="row" height={1}><box width={18}><text color="muted">User</text></box><text>{operation.user}</text></box>
      <box flexDirection="row" height={1}><box width={18}><text color="muted">Timestamp</text></box><text>{formatAbsoluteTime(operation.timestamp)}</text></box>
    </box>
  </scrollbox>
</box>
```

### Keybindings

**List view:** `j`/`Down` (down), `k`/`Up` (up), `Enter` (detail), `y` (copy ID), `/` (filter), `Esc` (clear filter), `G` (bottom), `g g` (top), `Ctrl+D` (page down), `Ctrl+U` (page up), `R` (refresh).
**Detail view:** `q`/`Esc` (back to list), `y` (copy ID), `j`/`k` (scroll), `R` (refresh).

### Responsive Column Layout

| Width | Columns |
|-------|--------|
| 80–119 | type(20) │ description(flex) │ timestamp(12) |
| 120–199 | opID(14) │ type(20) │ description(flex) │ timestamp(14) |
| 200+ | opID(14) │ type(24) │ user(16) │ description(flex) │ parentID(14) │ timestamp(16) |

### Data Hooks

| Hook | Source | Purpose |
|------|--------|---------|
| `useOperationLog()` | `@codeplane/ui-core` | Fetch paginated operation list. Returns `{ data, totalCount, isLoading, error, loadNextPage, refresh }` |
| `useKeyboard()` | `@opentui/react` | Capture all keybindings |
| `useTerminalDimensions()` | `@opentui/react` | Determine column visibility and widths |
| `useOnResize()` | `@opentui/react` | Re-layout on terminal resize |
| `useNavigation()` | Local TUI | Push/pop detail view, preserve focus state |

## Permissions & Security

### Authorization

- All authenticated users with read access to the repository can view the operation log
- The operation log is a read-only view — there are no write, edit, or delete actions
- No additional role beyond repository read access is required
- Unauthenticated users can view the operation log for public repositories
- Private repository operation logs are visible only to collaborators with at least read permission
- Repository admin status is not required; the operation log exposes no admin-only data

### Token-Based Auth

- The TUI uses token-based auth from CLI keychain or `CODEPLANE_TOKEN` environment variable
- No OAuth browser flow is triggered by the operation log view
- The auth token is passed as a Bearer token in the `Authorization` header on the `GET /api/repos/:owner/:repo/operations` request
- If the auth token expires while viewing the operation log, subsequent fetches (pagination, refresh) return 401, and the content area shows: "Session expired. Run `codeplane auth login` to re-authenticate."
- The operation log does not read, transmit, display, or log the auth token itself
- Operation user IDs are displayed as usernames — they are not sensitive data

### Rate Limiting

- Operation log list endpoint is subject to standard API rate limits: 5,000 req/hr for authenticated users, 60 req/hr for unauthenticated users
- Each page fetch counts as one API request
- `R` (hard refresh) counts as one API request per invocation
- Rapid `R` presses are not client-side debounced — the user is trusted to manage their own request frequency
- Rate limit exhaustion (429 response) displays the `Retry-After` period inline: "Rate limited. Try again in {N} seconds."
- Scrollbox pagination does not trigger redundant requests — `loadNextPage` is guarded against concurrent calls

### Input Validation

- No user-provided text is submitted to the API (read-only view)
- Filter input is client-side only — not sent to the API
- Operation IDs are displayed from API responses — not used as input for further API calls within this view
- Clipboard operations write to the system clipboard only; they do not execute commands

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.repo.oplog.viewed` | Op Log tab becomes visible (after data load) | `repo_id`, `repo_full_name`, `operation_count`, `load_time_ms`, `terminal_width`, `terminal_height` |
| `tui.repo.oplog.operation_selected` | User presses `Enter` to view operation detail | `repo_id`, `repo_full_name`, `operation_id`, `operation_type`, `row_index` |
| `tui.repo.oplog.id_copied` | User presses `y` to copy operation ID | `repo_id`, `repo_full_name`, `operation_id`, `operation_type`, `from_view` (`list` or `detail`) |
| `tui.repo.oplog.filtered` | User submits a filter string | `repo_id`, `repo_full_name`, `filter_text_length`, `result_count`, `total_count` |
| `tui.repo.oplog.paginated` | Next page of operations loaded | `repo_id`, `repo_full_name`, `page_number`, `page_size`, `total_loaded`, `load_time_ms` |
| `tui.repo.oplog.refreshed` | User presses `R` to hard-refresh | `repo_id`, `repo_full_name`, `previous_count`, `new_count`, `load_time_ms` |
| `tui.repo.oplog.error` | Operation log fails to load or paginate | `repo_id`, `repo_full_name`, `error_code`, `error_message`, `action` (`initial_load`, `pagination`, `refresh`) |

### Common Event Properties

All events include: `session_id`, `timestamp` (ISO 8601), `terminal_width`, `terminal_height`, `viewer_id`

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Op Log tab visit rate | >10% of repo sessions | % of repository sessions that visit the Op Log tab |
| Detail view usage | >30% of oplog visits | % of oplog visits where user opens at least one detail |
| Copy ID usage | >20% of oplog visits | % of oplog visits where user copies at least one ID |
| Filter usage | >15% of oplog visits | % of oplog visits where user uses the filter |
| Pagination depth | Track distribution | How many pages deep users scroll |
| Initial load time (p50) | <200ms | Time from tab switch to operation list visible |
| Pagination load time (p50) | <150ms | Time to load next page of operations |
| Error rate | <2% of page loads | % of operation log loads that result in an error |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Op Log tab mounted | `OpLog: mounted [repo={full_name}]` |
| `debug` | Filter activated | `OpLog: filter activated [repo={full_name}] [query={text}]` |
| `debug` | Detail view opened | `OpLog: detail opened [repo={full_name}] [op_id={operation_id}]` |
| `debug` | Clipboard copy | `OpLog: copied [repo={full_name}] [op_id={operation_id}]` |
| `info` | Operation list loaded | `OpLog: loaded [repo={full_name}] [count={count}] [load_time_ms={ms}]` |
| `info` | Page loaded | `OpLog: page loaded [repo={full_name}] [page={n}] [count={count}] [load_time_ms={ms}]` |
| `warn` | API fetch failed | `OpLog: fetch failed [repo={full_name}] [error_code={code}] [error={msg}]` |
| `warn` | Pagination fetch failed | `OpLog: pagination failed [repo={full_name}] [page={n}] [error_code={code}] [error={msg}]` |
| `warn` | Clipboard unavailable | `OpLog: clipboard unavailable [repo={full_name}]` |
| `error` | Render error | `OpLog: render error [repo={full_name}] [error={msg}] [stack={trace}]` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Terminal resize during list scroll | `useOnResize()` fires mid-scroll | Re-layout columns. Focused row preserved. Scroll position adjusted to keep focused row visible. |
| Terminal resize during detail view | `useOnResize()` fires | Detail view re-layouts. Text re-wraps. No data loss. |
| SSE disconnect | SSE provider emits disconnect | Op Log unaffected (uses REST). Sync indicator in status bar updates. |
| API 401 on initial fetch | Data hook returns 401 | Content area shows auth error. Tab bar interactive. User can switch tabs. |
| API 500 on initial fetch | Data hook returns 500 | Content area shows "Error loading operations. Press `R` to retry." Tab bar interactive. |
| API 501 on initial fetch | Data hook returns 501 | Content area shows "Operation log is not available. Backend not implemented." |
| API timeout (10s) | Data hook timeout | Content area shows timeout message. Press `R` to retry. |
| API 429 rate limit | Data hook returns 429 | Content area shows "Rate limited. Try again in {N} seconds." |
| Pagination fetch error | Data hook returns error on page N>1 | Already-loaded operations remain visible. Error at list bottom. |
| Clipboard access denied | Clipboard API throws | Status bar shows "Copy failed — clipboard not available" for 2 seconds. |
| Rapid key input during data load | Key events queued | Cursor movement processed immediately against current data. |
| Component unmount during fetch | AbortController cancellation | Fetch silently cancelled. No error displayed. |

### Failure Modes

- **Stuck loading state**: 10-second timeout fires and shows error message. Tab bar remains interactive.
- **Pagination loop**: `loadNextPage` no-ops if a request is in flight or last page returned fewer items than page size.
- **Memory accumulation**: Pagination cap at 5000 loaded items. After cap, "End of loaded operations. Press `R` to reload from start." shown.
- **Blank list after refresh**: Brief loading spinner shown during refresh fetch.
- **Detail view for deleted operation**: "Operation not found." shown. User can press `q` to return to list.

## Verification

### Test File: `e2e/tui/repository.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

#### Terminal Snapshot Tests

1. **`repo-oplog-default-state-120x40`** — Navigate to a repo at 120×40. Press `5`. Snapshot. Assert operation list visible with section header "Operations (N)". First row focused. Columns: op ID, type, description, timestamp.
2. **`repo-oplog-default-state-80x24`** — Navigate to repo at 80×24. Press `5`. Snapshot. Assert only type, description, and timestamp columns. Op ID hidden.
3. **`repo-oplog-default-state-200x60`** — Navigate to repo at 200×60. Press `5`. Snapshot. Assert all columns: op ID, type, user, description, parent op ID, timestamp.
4. **`repo-oplog-detail-view-120x40`** — Press `5` then `Enter`. Snapshot. Assert detail view with all metadata fields.
5. **`repo-oplog-detail-view-80x24`** — At 80×24. Press `5` then `Enter`. Snapshot. Assert detail fits minimum terminal.
6. **`repo-oplog-filter-active`** — Press `5` then `/`. Snapshot. Assert filter input visible with placeholder.
7. **`repo-oplog-filter-results`** — Press `5`, `/`, type "snapshot". Snapshot. Assert filtered results.
8. **`repo-oplog-filter-no-results`** — Press `5`, `/`, type "zzzznonexistent". Snapshot. Assert "No matching operations."
9. **`repo-oplog-empty-state`** — Repo with no operations. Press `5`. Snapshot. Assert "No operations recorded."
10. **`repo-oplog-loading-state`** — Press `5`. Snapshot before data. Assert spinner with "Loading…".
11. **`repo-oplog-error-state`** — API returns 500. Press `5`. Snapshot. Assert error with retry hint.
12. **`repo-oplog-501-not-implemented`** — API returns 501. Press `5`. Snapshot. Assert not-implemented message.
13. **`repo-oplog-pagination-loading`** — >50 operations, scroll to bottom. Snapshot. Assert "Loading more…".
14. **`repo-oplog-focused-row-highlight`** — Press `5`, `j` twice. Snapshot. Assert third row highlighted.
15. **`repo-oplog-copied-status-bar`** — Press `5`, `y`. Snapshot. Assert "Copied!" in status bar.

#### Keyboard Interaction Tests — List Navigation

16. **`repo-oplog-navigate-down`** — Press `5`, `j`. Assert focus on row 2.
17. **`repo-oplog-navigate-up`** — Press `5`, `j`, `k`. Assert focus on row 1.
18. **`repo-oplog-navigate-down-arrow`** — Press `5`, `Down`. Assert focus on row 2.
19. **`repo-oplog-navigate-up-arrow`** — Press `5`, `j`, `Up`. Assert focus on row 1.
20. **`repo-oplog-navigate-bottom`** — Press `5`, `G`. Assert focus on last row.
21. **`repo-oplog-navigate-top`** — Press `5`, `G`, `g`, `g`. Assert focus on first row.
22. **`repo-oplog-page-down`** — Press `5`, `Ctrl+D`. Assert scroll advances one page.
23. **`repo-oplog-page-up`** — Press `5`, `Ctrl+D`, `Ctrl+U`. Assert scroll returns.
24. **`repo-oplog-navigate-at-top-boundary`** — Press `5`, `k`. Assert focus stays on row 1.
25. **`repo-oplog-navigate-at-bottom-boundary`** — Press `5`, `G`, `j`. Assert focus stays on last row.

#### Keyboard Interaction Tests — Detail View

26. **`repo-oplog-enter-detail`** — Press `5`, `Enter`. Assert detail view shown.
27. **`repo-oplog-detail-back-q`** — Press `5`, `Enter`, `q`. Assert list restored, focus preserved.
28. **`repo-oplog-detail-back-esc`** — Press `5`, `Enter`, `Esc`. Assert list restored.
29. **`repo-oplog-detail-copy-id`** — Press `5`, `Enter`, `y`. Assert "Copied!" and clipboard has full ID.
30. **`repo-oplog-enter-detail-from-row-3`** — Press `5`, `j`, `j`, `Enter`. Assert detail for third operation.

#### Keyboard Interaction Tests — Filter

31. **`repo-oplog-filter-activate`** — Press `5`, `/`. Assert filter input focused.
32. **`repo-oplog-filter-type-text`** — Press `5`, `/`, type "rebase". Assert filtered list.
33. **`repo-oplog-filter-clear-esc`** — Press `5`, `/`, type "rebase", `Esc`. Assert filter cleared, full list.
34. **`repo-oplog-filter-case-insensitive`** — Press `5`, `/`, type "SNAPSHOT". Assert matches "snapshot".
35. **`repo-oplog-filter-matches-description`** — Press `5`, `/`, type "working copy". Assert description matches.

#### Keyboard Interaction Tests — Copy & Refresh

36. **`repo-oplog-copy-from-list`** — Press `5`, `y`. Assert clipboard has op ID, status bar shows "Copied!".
37. **`repo-oplog-copy-different-row`** — Press `5`, `j`, `j`, `y`. Assert clipboard has third row's ID.
38. **`repo-oplog-refresh`** — Press `5`, wait, `R`. Assert list reloads, scroll to top.
39. **`repo-oplog-refresh-after-error`** — API error, press `R`. Assert retry initiated.

#### Tab Integration Tests

40. **`repo-oplog-tab-switch-away-and-back`** — Press `5`, `j` twice, `1`, `5`. Assert Op Log reloads.
41. **`repo-oplog-tab-key-not-consumed`** — Press `5`, `Tab`. Assert switches to tab 6.

#### Responsive Tests

42. **`repo-oplog-columns-at-80x24`** — At 80×24. Assert type, description, timestamp only.
43. **`repo-oplog-columns-at-120x40`** — At 120×40. Assert op ID, type, description, timestamp.
44. **`repo-oplog-columns-at-200x60`** — At 200×60. Assert all columns.
45. **`repo-oplog-resize-120-to-80`** — Resize 120→80. Assert op ID disappears, focus preserved.
46. **`repo-oplog-resize-80-to-200`** — Resize 80→200. Assert all columns appear.
47. **`repo-oplog-resize-below-minimum`** — Resize to 60×20. Assert too-small message. Resize back. Assert restored.
48. **`repo-oplog-detail-resize`** — Detail view, resize 120→80. Assert re-layout.

#### Pagination Tests

49. **`repo-oplog-pagination-trigger`** — >50 ops, scroll to 80%. Assert next page fetch.
50. **`repo-oplog-pagination-appends`** — After pagination. Assert new ops appended, focus stable.
51. **`repo-oplog-pagination-error-preserves-data`** — Page 2 error. Assert page 1 data visible.

#### Rapid Input Tests

52. **`repo-oplog-rapid-j-keys`** — Press `j` 10× rapidly. Assert focus advanced exactly 10 rows.
53. **`repo-oplog-rapid-filter-typing`** — Press `/`, type "snap" rapidly. Assert correct filter.
54. **`repo-oplog-rapid-enter-back`** — Press `Enter` then `q` immediately. Assert clean list return.

#### Integration Tests

55. **`repo-oplog-help-overlay-includes-oplog`** — Press `?`. Assert "Op Log" group in help overlay.
56. **`repo-oplog-status-bar-hints-list`** — Assert list hints in status bar.
57. **`repo-oplog-status-bar-hints-detail`** — Assert detail hints in status bar.
58. **`repo-oplog-status-bar-hints-filter`** — Assert filter hints in status bar.
59. **`repo-oplog-auth-error-display`** — API 401. Assert auth error message.
60. **`repo-oplog-rate-limit-display`** — API 429. Assert rate limit message with retry-after.
