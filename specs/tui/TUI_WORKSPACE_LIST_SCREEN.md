# TUI_WORKSPACE_LIST_SCREEN

Specification for TUI_WORKSPACE_LIST_SCREEN.

## High-Level User POV

The Workspace List screen is the primary workspace management surface in the Codeplane TUI. It presents a full-screen view of all workspaces associated with a repository, designed for developers who need to create, monitor, suspend, resume, and connect to container-backed development environments without leaving the terminal. The screen is reached via the `g w` go-to keybinding from any screen, by selecting "Workspaces" in the command palette, or by launching the TUI with `codeplane tui --screen workspaces --repo owner/repo`. The screen requires a repository context — if no repository is active when `g w` is pressed, the user is first prompted to select a repository from the repo list.

The screen occupies the entire content area between the header bar and status bar. At the top is a title row showing "Workspaces" in bold primary color, followed by the total workspace count in parentheses (e.g., "Workspaces (5)"). Below the title is a persistent filter toolbar that displays the current status filter and a text search input.

The main content area is a scrollable list of workspace rows. Each row occupies a single line and shows: a status icon (● green for running, ● yellow for pending/starting, ● gray for suspended, ● red for failed/stopped), the workspace name, the workspace ID (truncated UUID), the user who created it, an idle timeout indicator, and a relative timestamp for the last activity. The focused row is highlighted with the `primary` accent color using reverse video. Navigation uses the standard vim-style `j`/`k` keys and arrow keys. Pressing `Enter` on a focused workspace pushes the workspace detail view.

Status filtering is accessible via `f`, which cycles through: "All" (default), "Running", "Suspended", "Pending", "Failed", "Stopped". These filters apply to the locally loaded list. Text search via `/` focuses the search input for client-side substring matching on workspace name.

The list supports page-based pagination (page size 30, 200-item memory cap). Users can create new workspaces with `c`, suspend a running workspace with `p` (pause), resume a suspended workspace with `r`, and delete a workspace with `d` (with a confirmation prompt). The `S` key copies the SSH connection command for the focused workspace to the clipboard (only available when the workspace is running).

Workspace statuses update in real-time via SSE streaming. When a workspace transitions from `starting` to `running`, or from `running` to `suspended`, the status icon and label update inline without a full list refresh. The SSE connection is managed by the `<SSEProvider>` context and reconnects automatically with exponential backoff.

When the terminal is at minimum size (80×24), only the status icon, workspace name, and relative timestamp are shown. At standard size (120×40), the owner, status label, and idle timeout columns appear. At large size (200×60+), the full column set is rendered including workspace ID, suspended-at timestamp, and created-at timestamp. The layout recalculates immediately on terminal resize, preserving the focused row.

The breadcrumb in the header bar reads "Dashboard > owner/repo > Workspaces" since the workspace list is scoped to a repository. Pressing `q` returns to the repository overview or the previous screen in the stack. The screen's status bar hints show: `j/k:nav  Enter:open  /:filter  f:status  c:create  p:pause  r:resume  q:back`.

## Acceptance Criteria

### Definition of Done

- [ ] The Workspace List screen renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The screen is reachable via `g w` go-to navigation, `:workspaces` command palette entry, and `--screen workspaces --repo owner/repo` deep-link
- [ ] The breadcrumb reads "Dashboard > owner/repo > Workspaces"
- [ ] Pressing `q` pops the screen and returns to the repository overview (or previous screen)
- [ ] Workspaces are fetched via `useWorkspaces()` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/workspaces` with page-based pagination (default page size 30)
- [ ] The list defaults to showing all workspaces sorted by `created_at` descending
- [ ] Each row displays: status icon (● colored), workspace name, workspace ID (truncated), owner login, idle timeout, and relative `last_activity_at` timestamp
- [ ] The header shows "Workspaces (N)" where N is the `X-Total-Count` from the API response
- [ ] The filter toolbar is always visible below the title row
- [ ] Status filter changes apply client-side to the loaded workspace list (no API re-fetch)
- [ ] SSE streaming updates workspace statuses in real-time without full list re-fetch

### Keyboard Interactions

- [ ] `j` / `Down`: Move focus to next workspace row
- [ ] `k` / `Up`: Move focus to previous workspace row
- [ ] `Enter`: Open focused workspace (push workspace detail view)
- [ ] `/`: Focus search input in filter toolbar
- [ ] `Esc`: Close overlay; or clear search; or pop screen (context-dependent priority)
- [ ] `G`: Jump to last loaded workspace row
- [ ] `g g`: Jump to first workspace row
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up
- [ ] `R`: Retry failed API request (only in error state)
- [ ] `f`: Cycle status filter (All → Running → Suspended → Pending → Failed → Stopped → All)
- [ ] `c`: Push workspace create form
- [ ] `p`: Suspend the focused workspace (only when status is `running`; optimistic status update)
- [ ] `r`: Resume the focused workspace (only when status is `suspended`; optimistic status update)
- [ ] `d`: Delete the focused workspace (opens confirmation prompt: "Delete workspace 'name'? y/n")
- [ ] `S`: Copy SSH connection command for the focused workspace to clipboard (only when status is `running`)
- [ ] `Space`: Toggle row selection (for future batch actions; selected state shown with `✓` prefix)
- [ ] `q`: Pop screen (back to repository overview)
- [ ] `y`: Confirm delete action (only when delete confirmation overlay visible)
- [ ] `n`: Cancel delete action (only when delete confirmation overlay visible)

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the router
- [ ] 80×24 – 119×39 (minimum): Status icon (2ch), name (remaining, truncated with `…`), timestamp (4ch). Owner, ID, idle timeout columns hidden. Toolbar: search input only (status filter label hidden)
- [ ] 120×40 – 199×59 (standard): Full toolbar with status filter label. Columns: status icon (2ch), name (30ch), status label (12ch), owner (15ch), idle timeout (8ch), timestamp (4ch). Workspace ID hidden
- [ ] 200×60+ (large): Expanded layout. Columns: status icon (2ch), name (30ch), ID (12ch truncated), status label (12ch), owner (15ch), idle timeout (8ch), suspended_at (12ch), created_at (12ch), timestamp (4ch)

### Truncation and Boundary Constraints

- [ ] Workspace name: truncated with trailing `…` when exceeding column width (varies by breakpoint)
- [ ] Workspace ID: show first 8 characters of UUID followed by `…` (e.g., "a1b2c3d4…"). Hidden at minimum and standard breakpoints
- [ ] Owner login: truncated with trailing `…` at 15 chars. Hidden at minimum
- [ ] Idle timeout: displayed as human-readable duration (e.g., "30m", "1h", "2h"). Never exceeds 8 characters
- [ ] Relative timestamps: never exceed 4 characters (e.g., "3d", "1mo", "2y", "now")
- [ ] Suspended-at timestamp: relative format, max 12 characters (e.g., "3d ago"). Hidden at minimum and standard
- [ ] Created-at timestamp: relative format, max 12 characters. Hidden at minimum and standard
- [ ] Status label text: max 12 characters ("running", "suspended", "starting", "pending", "stopped", "failed")
- [ ] Filter/search input: max 120 characters
- [ ] Maximum loaded workspaces in memory: 200 items (pagination cap)
- [ ] Total count display: abbreviated above 9999 (e.g., "10k+")

### Edge Cases

- [ ] Terminal resize while scrolled: scroll position preserved relative to focused item; column layout recalculates immediately
- [ ] Rapid `j`/`k` presses: processed sequentially without debouncing, cursor moves one row per keypress
- [ ] Filter during pagination: client-side filter applied to all loaded items; new pages are filtered as they arrive
- [ ] SSE disconnect during workspace status transition: status bar shows disconnected indicator; reconnection re-fetches current workspace states
- [ ] Suspend action on non-running workspace: `p` keypress ignored; no API call, no error
- [ ] Resume action on non-suspended workspace: `r` keypress ignored; no API call, no error
- [ ] Delete action with confirmation dismissed: `d` followed by `n` or `Esc` cancels deletion; no API call
- [ ] Unicode in workspace names: truncation respects grapheme clusters, never splits a multi-byte character
- [ ] Workspace created server-side during view: does not appear until next full fetch or SSE event triggers refresh
- [ ] User has access to 200+ workspaces: pagination cap reached, footer shows "Showing first 200 of N" in muted text
- [ ] Concurrent navigation: if user presses `Enter` before initial load completes, the keypress is queued and processed after data arrives (or no-op if error)
- [ ] Suspend/resume fails with 409 (conflict): optimistic update reverted, status bar shows "Workspace state conflict. Press R to refresh."
- [ ] Workspace in `starting` status: row shows yellow spinner-style icon; suspend/resume/SSH actions disabled
- [ ] API returns workspace with null or empty name: rendered as `<unnamed>` in muted italic text
- [ ] Delete of the only workspace in the list: empty state rendered after successful deletion
- [ ] No color support terminal: text markers `[R]`/`[S]`/`[P]`/`[F]`/`[X]` replace ● icons

## Design

### Layout Structure

```
┌─────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Workspaces     │
├─────────────────────────────────────────────────┤
│ Workspaces (5)                        / filter  │
│ Status: All                                     │
├─────────────────────────────────────────────────┤
│ NAME           STATUS     OWNER    IDLE   AGE   │
├─────────────────────────────────────────────────┤
│ ► ● dev-env    running    alice    30m    3d    │
│   ● staging    suspended  alice    1h     1w    │
│   ● test-env   running    bob      30m    2d    │
│   ● debug      failed     alice    —      5d    │
│   ● preview    stopped    carol    —      2w    │
│                                                 │
├─────────────────────────────────────────────────┤
│ j/k:nav Enter:open /:filter f:status c:new q:back│
└─────────────────────────────────────────────────┘
```

The screen is composed of: (1) a title row with "Workspaces (N)" header and filter hint, (2) a persistent filter toolbar with search input and status label, (3) a column header row with bold muted labels on a `surface` background (hidden at minimum breakpoint), (4) a `<scrollbox>` containing workspace rows with pagination indicator, and (5) conditional empty/error/confirmation states that replace or overlay the scrollbox content.

### OpenTUI Component Structure

```jsx
<box flexDirection="column" width="100%" height="100%">
  {/* Title row */}
  <box flexDirection="row" justifyContent="space-between">
    <text bold color="primary">Workspaces ({totalCount})</text>
    <text color="muted">/ filter</text>
  </box>

  {/* Filter toolbar */}
  <box flexDirection="row" gap={2}>
    <text color="muted">Status: {statusFilter}</text>
    {searchActive && <input value={searchText} onChange={setSearchText} />}
  </box>

  {/* Column headers (hidden at 80×24) */}
  {breakpoint !== "minimum" && (
    <box flexDirection="row" backgroundColor="surface">
      <text bold color="muted" width={30}>NAME</text>
      <text bold color="muted" width={12}>STATUS</text>
      <text bold color="muted" width={15}>OWNER</text>
      <text bold color="muted" width={8}>IDLE</text>
      <text bold color="muted" width={4}>AGE</text>
    </box>
  )}

  {/* Scrollable workspace list */}
  <scrollbox flexGrow={1}>
    <box flexDirection="column">
      {filteredWorkspaces.map(ws => (
        <box key={ws.id} flexDirection="row"
             backgroundColor={ws.id === focusedId ? "primary" : undefined}>
          <text color={statusColor(ws.status)}>●</text>
          <text width={nameWidth}>{truncate(ws.name, nameWidth)}</text>
          {breakpoint !== "minimum" && (
            <>
              <text width={12} color={statusColor(ws.status)}>{ws.status}</text>
              <text width={15} color="muted">{ws.user}</text>
              <text width={8} color="muted">{formatIdleTimeout(ws.idle_timeout_seconds)}</text>
            </>
          )}
          <text width={4} color="muted">{relativeTime(ws.last_activity_at)}</text>
        </box>
      ))}
      {isLoadingMore && <text color="muted">Loading more…</text>}
    </box>
  </scrollbox>

  {/* Delete confirmation overlay */}
  {showDeleteConfirm && (
    <box position="absolute" top="center" left="center"
         width="50%" border="single" backgroundColor="surface">
      <text>Delete workspace '{focusedWorkspace.name}'?</text>
      <text color="muted">This action cannot be undone.</text>
      <text color="muted">[y] Confirm    [n/Esc] Cancel</text>
    </box>
  )}
</box>
```

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Move focus to next row | List focused, not in search input |
| `k` / `Up` | Move focus to previous row | List focused, not in search input |
| `Enter` | Open focused workspace detail | Workspace row focused |
| `/` | Focus search input in toolbar | List focused |
| `Esc` | Close overlay → clear filter → pop screen | Context-dependent priority |
| `G` | Jump to last loaded row | List focused |
| `g g` | Jump to first row | List focused |
| `Ctrl+D` | Page down (half visible height) | List focused |
| `Ctrl+U` | Page up (half visible height) | List focused |
| `R` | Retry failed API request | Error state displayed |
| `f` | Cycle status filter | List focused, not in search input |
| `c` | Push workspace create form | List focused, not in search input |
| `p` | Suspend focused workspace | Focused workspace status is `running` |
| `r` | Resume focused workspace | Focused workspace status is `suspended` |
| `d` | Delete focused workspace (with confirmation) | Workspace row focused, not in search input |
| `S` | Copy SSH connection command to clipboard | Focused workspace status is `running` |
| `Space` | Toggle row selection | Workspace row focused |
| `q` | Pop screen (back to repo overview) | Not in search input, no overlay open |
| `y` | Confirm delete action | Delete confirmation overlay visible |
| `n` | Cancel delete action | Delete confirmation overlay visible |

### Responsive Column Layout

**80×24 (minimum)**: `│ ● name (remaining) │ 3d │` — Toolbar shows search input only. Column headers hidden. Status filter label hidden. Delete overlay renders at 90% width instead of 50%.

**120×40 (standard)**: `│ ● name (30ch) │ running (12ch) │ alice (15ch) │ 30m (8ch) │ 3d │` — Full toolbar with status filter label. Column headers visible.

**200×60 (large)**: `│ ● name (30ch) │ a1b2c3d4… (12ch) │ running (12ch) │ alice (15ch) │ 30m (8ch) │ 3d ago (12ch) │ 1w ago (12ch) │ 3d │` — All columns including workspace ID, suspended_at, and created_at.

### Resize Behavior

- `useTerminalDimensions()` provides current `{ width, height }` for breakpoint calculation
- `useOnResize()` triggers synchronous re-layout when the terminal is resized
- Column widths recalculate based on the new breakpoint category
- The focused row remains focused and visible after resize
- Scroll position adjusts to keep the focused row in view
- No animation or transition during resize — single-frame re-render
- Delete confirmation overlay recenters on resize

### Status Icon Colors

| Status | Icon | Color | ANSI |
|--------|------|-------|------|
| `running` | ● | Green | 34 |
| `starting` | ● | Yellow | 178 |
| `pending` | ● | Yellow | 178 |
| `suspended` | ● | Gray | 245 |
| `stopped` | ● | Gray | 240 |
| `failed` | ● | Red | 196 |

### Data Hooks

- `useWorkspaces()` from `@codeplane/ui-core` — returns `{ items: WorkspaceResponse[], totalCount: number, isLoading: boolean, error: Error | null, loadMore: () => void, hasMore: boolean, retry: () => void }`. Calls `GET /api/repos/:owner/:repo/workspaces` with page-based pagination, default page size 30. Requires `owner` and `repo` parameters from the current repository context
- `useSSE("workspace.status")` — subscribes to workspace status change events via SSE. Updates workspace status inline when events arrive. Connection managed by `<SSEProvider>` context
- `useTerminalDimensions()` — provides terminal size for responsive breakpoint calculation
- `useOnResize()` — triggers synchronous re-layout on terminal resize
- `useKeyboard()` — registers keybinding handlers for the screen's keybinding map
- `useNavigation()` — provides `push()` for navigating to workspace detail/create and `pop()` for back navigation
- `useUser()` — provides current user for ownership display and action authorization

### Navigation Context

When `Enter` is pressed on a focused workspace, calls `push("workspace-detail", { repo: "owner/repo", workspaceId: focusedWorkspace.id })`. Breadcrumb updates to "Dashboard > owner/repo > Workspaces > workspace-name". When `c` is pressed, calls `push("workspace-create", { repo: "owner/repo" })`. When `q` is pressed, calls `pop()` to return to the previous screen.

### Status Filter State

Status filter state is local to the screen component and is not persisted across navigation. Options cycle: "All" → "Running" → "Suspended" → "Pending" → "Failed" → "Stopped" → "All". Filtering is applied client-side to the loaded workspace list. Text search is client-side substring matching on `name`, case-insensitive.

### Loading States

- **Initial load**: Full-height centered spinner with "Loading workspaces…" text. Header and toolbar rendered immediately; only the list area shows the spinner
- **Pagination loading**: "Loading more…" text at bottom of scrollbox. Existing rows remain visible and navigable
- **Status filter change**: No spinner. Locally loaded items filter immediately
- **Suspend/resume action**: Optimistic — status icon and label update immediately. Reverts on failure with status bar error flash
- **Delete action**: Row removed from list optimistically after `y` confirmation. Reverts on failure with status bar error flash

### Empty State

If the repository has no workspaces, the screen shows a centered empty state: "No workspaces found. Press `c` to create one." in muted color. If the repository has workspaces but the active filter produces zero matches: "No workspaces match the current filters." with "Press `Esc` to clear filters." hint.

### Confirmation Overlay

The delete confirmation is a modal overlay centered on screen:

```
┌────────────────────────────────────┐
│  Delete workspace 'dev-env'?       │
│                                    │
│  This action cannot be undone.     │
│                                    │
│  [y] Confirm    [n/Esc] Cancel     │
└────────────────────────────────────┘
```

- `y` confirms and triggers `DELETE /api/repos/:owner/:repo/workspaces/:id`
- `n` or `Esc` dismisses the overlay
- Focus is trapped within the overlay
- All other keybindings disabled while overlay is visible

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View workspace list | ❌ | ✅ | ✅ | ✅ |
| Open workspace detail | ❌ | ✅ | ✅ | ✅ |
| Create workspace | ❌ | ❌ | ✅ | ✅ |
| Suspend workspace | ❌ | ❌ | ✅ (own) | ✅ |
| Resume workspace | ❌ | ❌ | ✅ (own) | ✅ |
| Delete workspace | ❌ | ❌ | ✅ (own) | ✅ |
| Copy SSH connection | ❌ | ❌ | ✅ (own) | ✅ |

- The Workspace List screen requires authentication. The TUI enforces authentication at bootstrap; unauthenticated sessions never reach this screen
- `GET /api/repos/:owner/:repo/workspaces` returns workspaces the authenticated user has access to within the repository context
- Write-level users can only suspend/resume/delete workspaces they own. Admins can manage all workspaces in the repository
- If a user attempts an action they lack permission for, the API returns 403. The TUI shows a status bar flash: "Permission denied."
- The `c` keybinding is hidden from the status bar hints for read-only users
- The `p`, `r`, `d`, `S` keybindings are disabled for workspaces not owned by the current user (unless admin)

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to the `@codeplane/ui-core` API client as a `Bearer` token in the `Authorization` header
- Token is never displayed in the TUI, never written to logs, never included in error messages
- SSE connections use ticket-based authentication obtained via the auth API (the token itself is not sent over SSE)
- 401 responses propagate to the app-shell-level auth error screen with message "Session expired. Run `codeplane auth login` to re-authenticate."

### Rate Limiting

- Authenticated users: 300 requests per minute to `GET /api/repos/:owner/:repo/workspaces`
- Workspace action endpoints (suspend/resume/delete): 30 requests per minute per user
- If 429 is returned, the workspace list section displays "Rate limited. Retry in {Retry-After}s." inline
- No auto-retry on rate limit. User presses `R` after the retry-after period has elapsed

### Input Sanitization

- Search/filter input is client-side only — the text is never sent to the API
- Status filter values are from a fixed enum — no user-controlled strings reach the API beyond the token
- Workspace names and IDs are rendered as plain `<text>` components (no injection vector)
- Deep-link flag `--screen workspaces` is validated against the router's allowlist
- SSH connection command copied to clipboard contains only server-provided host, port, and token — never user-input text

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.workspaces.view` | Workspace List screen mounted and initial data loaded | `total_count`, `terminal_width`, `terminal_height`, `breakpoint` (minimum/standard/large), `load_time_ms`, `entry_method` (goto/palette/deeplink), `repo_full_name` |
| `tui.workspaces.open` | User presses Enter on a workspace row | `workspace_id`, `workspace_status`, `position_in_list`, `was_filtered`, `status_filter`, `repo_full_name` |
| `tui.workspaces.filter` | User focuses the search input (presses `/`) | `total_loaded_count`, `status_filter` |
| `tui.workspaces.filter_apply` | Filter text changes and results narrow | `filter_text_length`, `matched_count`, `total_loaded_count` |
| `tui.workspaces.status_filter_change` | User cycles status filter (presses `f`) | `new_status_filter`, `previous_status_filter`, `matched_count` |
| `tui.workspaces.paginate` | Next page of workspaces loaded | `page_number`, `items_loaded_total`, `total_count` |
| `tui.workspaces.create` | User presses `c` to navigate to create form | `repo_full_name` |
| `tui.workspaces.suspend` | User suspends a workspace | `workspace_id`, `workspace_name`, `success` |
| `tui.workspaces.resume` | User resumes a workspace | `workspace_id`, `workspace_name`, `success` |
| `tui.workspaces.delete` | User confirms workspace deletion | `workspace_id`, `workspace_name`, `success` |
| `tui.workspaces.delete_cancel` | User cancels workspace deletion | `workspace_id` |
| `tui.workspaces.ssh_copy` | User copies SSH connection command | `workspace_id`, `workspace_name` |
| `tui.workspaces.sse_status_update` | SSE delivers a workspace status change | `workspace_id`, `old_status`, `new_status` |
| `tui.workspaces.error` | API request fails | `error_type` (network/auth/rate_limit/server/conflict), `http_status`, `request_type` (list/suspend/resume/delete/ssh) |
| `tui.workspaces.retry` | User presses `R` to retry after error | `error_type`, `retry_success` |
| `tui.workspaces.empty` | Empty state rendered (zero workspaces) | `has_filters_active` |

### Common Properties (all events)

- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Screen load completion rate | >98% |
| Workspace open rate (per view) | >50% |
| Create adoption (per view) | >15% |
| Suspend/resume usage (per view) | >10% |
| SSH copy rate (per view) | >20% |
| Filter adoption (per view) | >15% |
| Status filter usage (per view) | >12% |
| SSE update delivery (<5s) | >95% |
| Error rate | <2% |
| Retry success rate | >80% |
| Time to first interaction | <1.5s median |

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|--------|
| `info` | Workspace list screen loaded | `total_count`, `items_in_first_page`, `load_time_ms`, `entry_method`, `repo_full_name` |
| `info` | Workspace opened from list | `workspace_id`, `workspace_name`, `workspace_status`, `position_in_list` |
| `info` | Workspace created (form pushed) | `repo_full_name` |
| `info` | Workspace suspended | `workspace_id`, `workspace_name`, `success` |
| `info` | Workspace resumed | `workspace_id`, `workspace_name`, `success` |
| `info` | Workspace deleted | `workspace_id`, `workspace_name`, `success` |
| `info` | SSH connection command copied | `workspace_id` |
| `info` | SSE workspace status update received | `workspace_id`, `old_status`, `new_status` |
| `info` | Pagination page loaded | `page_number`, `items_count`, `total_loaded` |
| `warn` | API error on workspaces fetch | `http_status`, `error_message` (token redacted) |
| `warn` | Rate limited on workspaces fetch | `retry_after_seconds` |
| `warn` | Rate limited on workspace action | `retry_after_seconds`, `workspace_id`, `action` |
| `warn` | Suspend/resume failed with conflict (409) | `workspace_id`, `workspace_status`, `attempted_action` |
| `warn` | Delete failed | `workspace_id`, `http_status`, `error_message` (token redacted) |
| `warn` | Filter returned zero results | `filter_text`, `status_filter`, `total_loaded_count` |
| `warn` | Pagination cap reached | `total_count`, `cap` (200) |
| `warn` | SSE connection lost | `reconnect_attempt`, `backoff_seconds` |
| `debug` | Filter activated | `filter_text_length` |
| `debug` | Filter cleared | — |
| `debug` | Status filter changed | `new_status_filter`, `previous_status_filter` |
| `debug` | Scroll position updated | `scroll_percent`, `focused_index`, `total_loaded` |
| `debug` | Pagination trigger reached | `scroll_percent`, `items_loaded`, `has_more` |
| `debug` | SSE reconnection attempt | `attempt_number`, `backoff_ms` |
| `debug` | Delete confirmation overlay shown | `workspace_id` |
| `debug` | Delete confirmation cancelled | `workspace_id` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` environment variable (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on initial fetch | Data hook timeout (30s) | Loading spinner replaced with error message + "Press R to retry" |
| Network timeout on pagination | Data hook timeout (30s) | "Loading more…" replaced with inline error. Existing items remain visible and navigable. `R` retries |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate." |
| Rate limited (429) | API returns 429 with Retry-After header | Inline error: "Rate limited. Retry in Ns." User presses `R` after waiting |
| Server error (500+) | API returns 5xx | Inline error with generic message: "Server error. Press R to retry." |
| Suspend fails (409 conflict) | API returns 409 | Optimistic update reverted. Status bar flash: "Workspace state conflict. Press R to refresh." for 3 seconds |
| Resume fails (409 conflict) | API returns 409 | Optimistic update reverted. Status bar flash: "Workspace state conflict. Press R to refresh." for 3 seconds |
| Suspend fails (non-409) | API returns non-2xx | Optimistic update reverted. Status bar flash: "Failed to suspend workspace." for 3 seconds |
| Resume fails (non-409) | API returns non-2xx | Optimistic update reverted. Status bar flash: "Failed to resume workspace." for 3 seconds |
| Delete fails | API returns non-2xx | Optimistic removal reverted (row reappears). Status bar flash: "Failed to delete workspace." for 3 seconds |
| SSH info fetch fails | API returns non-2xx on SSH endpoint | Status bar flash: "Failed to get SSH info." for 3 seconds |
| Permission denied (403) | API returns 403 on action | Status bar flash: "Permission denied." for 3 seconds |
| Terminal resize during initial load | `useOnResize` fires during fetch | Fetch continues uninterrupted. Renders at new size when data arrives |
| Terminal resize while scrolled | `useOnResize` fires | Column widths recalculate. Focused row stays visible. Scroll position adjusted |
| Terminal resize with delete confirmation overlay | `useOnResize` fires | Overlay recenters. Content behind overlay re-renders |
| SSE disconnect | Status bar shows disconnected indicator | Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s). On reconnect, re-fetch workspace list to reconcile missed updates |
| SSE reconnection after missed events | Reconnection establishes | Full workspace list re-fetched to reconcile. Status icons update to reflect current server state |
| Empty response with non-zero total_count | `items.length === 0 && totalCount > 0` | Treated as end-of-pagination. No further fetches |
| Malformed API response | JSON parse error | Error state rendered with generic error message |
| React error boundary triggered | Unhandled exception in component tree | App-shell error boundary renders error screen with restart/quit options |
| Concurrent Enter + initial load | `Enter` pressed before data arrives | Keypress queued; processed after data renders, or no-op on error |
| Clipboard failure | No clipboard available (SSH session) | Status bar shows "Clipboard not available. SSH command: ssh ..." with the command displayed inline for manual copy |

### Failure Modes

- **Total fetch failure**: Error state shown in content area. Header bar and status bar remain stable. User can press `R` to retry or `q` to go back
- **Partial pagination failure**: Existing loaded items remain visible and navigable. Only the "Loading more…" area shows the error. `R` retries the failed page
- **Action failure (suspend/resume/delete)**: Optimistic state reverts. Status bar shows error flash. User can try again immediately
- **SSE failure**: Real-time status updates stop. Status bar shows disconnected icon. Auto-reconnect recovers. Full state reconciliation on reconnect
- **Memory pressure**: 200-item pagination cap prevents unbounded memory growth
- **Clipboard failure**: If clipboard write fails (e.g., no clipboard available in SSH session), status bar shows "Clipboard not available. SSH command: ssh ..." with the command displayed inline for manual copy
- **Component crash**: Global error boundary catches, renders "Press r to restart" / "Press q to quit"

## Verification

### Test File: `e2e/tui/workspaces.test.ts`

### Terminal Snapshot Tests (19 tests)

- **SNAP-WS-001** `workspace-list-screen-initial-load`: Navigate to workspace list screen (`g w`) at 120×40 → snapshot matches golden file showing "Workspaces (N)" header, filter toolbar with status label, column headers, list rows with workspace names, status icons, owners, idle timeouts, and timestamps. First row highlighted with primary color
- **SNAP-WS-002** `workspace-list-screen-empty-state`: Navigate to workspace list for repo with zero workspaces → snapshot shows centered "No workspaces found. Press `c` to create one." in muted color
- **SNAP-WS-003** `workspace-list-screen-loading-state`: Navigate to workspace list with slow API response → snapshot shows "Loading workspaces…" centered in content area with toolbar already visible
- **SNAP-WS-004** `workspace-list-screen-error-state`: Navigate to workspace list with failing API → snapshot shows error message in red with "Press R to retry" below
- **SNAP-WS-005** `workspace-list-screen-focused-row`: Navigate to workspace list → first workspace row highlighted with primary accent color, remaining rows in default colors
- **SNAP-WS-006** `workspace-list-screen-status-icons`: Navigate to workspace list with workspaces in various statuses → running shows green ●, suspended shows gray ●, pending/starting shows yellow ●, failed shows red ●, stopped shows dark gray ●
- **SNAP-WS-007** `workspace-list-screen-filter-active`: Press `/` → search input in toolbar gains focus, cursor visible in input
- **SNAP-WS-008** `workspace-list-screen-filter-results`: Press `/`, type "dev" → list shows only workspaces matching "dev" in name
- **SNAP-WS-009** `workspace-list-screen-filter-no-results`: Press `/`, type "zzzznonexistent" → "No workspaces match the current filters." with "Press Esc to clear filters." hint shown
- **SNAP-WS-010** `workspace-list-screen-status-filter`: Press `f` → toolbar shows "Status: Running"; only running workspaces visible
- **SNAP-WS-011** `workspace-list-screen-pagination-loading`: Scroll to bottom of list → "Loading more…" visible at bottom of scrollbox
- **SNAP-WS-012** `workspace-list-screen-header-total-count`: Navigate to workspace list → header shows "Workspaces (N)" with correct total count
- **SNAP-WS-013** `workspace-list-screen-delete-confirmation`: Press `d` on focused workspace → delete confirmation overlay visible with workspace name
- **SNAP-WS-014** `workspace-list-screen-breadcrumb`: Navigate via `g w` → header bar breadcrumb reads "Dashboard > owner/repo > Workspaces"
- **SNAP-WS-015** `workspace-list-screen-column-headers`: At 120×40 → column header row visible with "NAME", "STATUS", "OWNER", "IDLE", "AGE"
- **SNAP-WS-016** `workspace-list-screen-selected-row`: Press `Space` on a row → "✓" prefix appears on that row
- **SNAP-WS-017** `workspace-list-screen-unnamed-workspace`: Workspace with null name → renders as `<unnamed>` in muted italic
- **SNAP-WS-018** `workspace-list-screen-idle-timeout-display`: Workspaces with various idle timeouts → "30m", "1h", "2h" displayed correctly
- **SNAP-WS-019** `workspace-list-screen-suspended-status-text`: Suspended workspace row → status label shows "suspended" in gray

### Keyboard Interaction Tests (44 tests)

- **KEY-WS-001** `workspace-list-j-moves-down`: Press `j` → focus moves from first to second workspace row
- **KEY-WS-002** `workspace-list-k-moves-up`: Press `j` then `k` → focus returns to first workspace row
- **KEY-WS-003** `workspace-list-k-at-top-no-wrap`: Press `k` on first row → focus stays on first row (no wrap-around)
- **KEY-WS-004** `workspace-list-j-at-bottom-no-wrap`: Navigate to last loaded row, press `j` → focus stays (triggers pagination if more pages exist)
- **KEY-WS-005** `workspace-list-down-arrow-moves-down`: Press Down arrow → same behavior as `j`
- **KEY-WS-006** `workspace-list-up-arrow-moves-up`: Press Up arrow → same behavior as `k`
- **KEY-WS-007** `workspace-list-enter-opens-detail`: Press Enter on focused row → workspace detail screen pushed, breadcrumb updates
- **KEY-WS-008** `workspace-list-enter-on-second-item`: Press `j` then Enter → second workspace's detail screen pushed
- **KEY-WS-009** `workspace-list-slash-focuses-search`: Press `/` → search input in toolbar gains focus
- **KEY-WS-010** `workspace-list-filter-narrows-list`: Press `/`, type "dev" → only matching workspaces shown in list
- **KEY-WS-011** `workspace-list-filter-case-insensitive`: Press `/`, type "DEV" → matches workspaces with "dev" in name (case-insensitive)
- **KEY-WS-012** `workspace-list-esc-clears-filter`: Press `/`, type "test", press Esc → filter cleared, full list restored, focus returns to list
- **KEY-WS-013** `workspace-list-esc-closes-delete-overlay`: Press `d`, then Esc → delete confirmation dismissed, no deletion
- **KEY-WS-014** `workspace-list-esc-pops-when-no-filter`: Without any active filter or overlay, press Esc → screen pops, returns to repo overview
- **KEY-WS-015** `workspace-list-G-jumps-to-bottom`: Press `G` → focus moves to last loaded row
- **KEY-WS-016** `workspace-list-gg-jumps-to-top`: Press `G` then `g g` → focus returns to first row
- **KEY-WS-017** `workspace-list-ctrl-d-page-down`: Press `Ctrl+D` → focus moves down by half the visible list height
- **KEY-WS-018** `workspace-list-ctrl-u-page-up`: Press `Ctrl+D` then `Ctrl+U` → focus returns to original position
- **KEY-WS-019** `workspace-list-R-retries-on-error`: API fails, error state shown, press `R` → fetch retried
- **KEY-WS-020** `workspace-list-R-no-op-when-loaded`: Data loaded successfully, press `R` → no effect
- **KEY-WS-021** `workspace-list-f-cycles-status`: Press `f` → status filter changes to "Running", only running workspaces shown. Press `f` again → "Suspended"
- **KEY-WS-022** `workspace-list-f-cycle-wraps`: Press `f` six times → cycles through all statuses and returns to "All"
- **KEY-WS-023** `workspace-list-c-opens-create-form`: Press `c` → workspace create form screen pushed
- **KEY-WS-024** `workspace-list-p-suspends-running`: Focus on running workspace, press `p` → status changes to "suspended" optimistically
- **KEY-WS-025** `workspace-list-p-no-op-on-suspended`: Focus on suspended workspace, press `p` → no change, no error
- **KEY-WS-026** `workspace-list-p-no-op-on-failed`: Focus on failed workspace, press `p` → no change, no error
- **KEY-WS-027** `workspace-list-r-resumes-suspended`: Focus on suspended workspace, press `r` → status changes to "starting" optimistically
- **KEY-WS-028** `workspace-list-r-no-op-on-running`: Focus on running workspace, press `r` → no change, no error
- **KEY-WS-029** `workspace-list-d-opens-delete-confirm`: Press `d` → delete confirmation overlay appears with workspace name
- **KEY-WS-030** `workspace-list-d-y-confirms-delete`: Press `d` then `y` → workspace removed from list, API DELETE called
- **KEY-WS-031** `workspace-list-d-n-cancels-delete`: Press `d` then `n` → overlay dismissed, workspace remains in list
- **KEY-WS-032** `workspace-list-S-copies-ssh`: Focus on running workspace, press `S` → SSH command copied, status bar shows "SSH command copied"
- **KEY-WS-033** `workspace-list-S-no-op-on-suspended`: Focus on suspended workspace, press `S` → no action, no error
- **KEY-WS-034** `workspace-list-space-selects-row`: Press `Space` → focused row shows "✓" prefix. Press `Space` again → "✓" removed
- **KEY-WS-035** `workspace-list-q-pops-screen`: Press `q` → returns to repository overview
- **KEY-WS-036** `workspace-list-j-in-search-input`: Press `/` then `j` → 'j' typed in search input, NOT list navigation
- **KEY-WS-037** `workspace-list-f-in-search-input`: Press `/` then `f` → 'f' typed in search input, NOT status filter cycle
- **KEY-WS-038** `workspace-list-q-in-search-input`: Press `/` then `q` → 'q' typed in search input, NOT screen pop
- **KEY-WS-039** `workspace-list-p-in-search-input`: Press `/` then `p` → 'p' typed in search input, NOT suspend action
- **KEY-WS-040** `workspace-list-pagination-on-scroll`: Scroll to 80% of loaded content → next page fetch triggered
- **KEY-WS-041** `workspace-list-rapid-j-presses`: Send `j` 15 times in rapid succession → focus moves 15 rows sequentially, no dropped keypresses
- **KEY-WS-042** `workspace-list-enter-during-loading`: Press Enter during initial loading state → no-op (no crash, no navigation)
- **KEY-WS-043** `workspace-list-filter-then-status-filter`: Press `/` type "dev", Esc, then `f` → filtered results further narrowed by status
- **KEY-WS-044** `workspace-list-delete-overlay-traps-focus`: Press `d` → overlay shown; press `j` → no list movement (focus trapped in overlay)

### Responsive Tests (17 tests)

- **RESP-WS-001** `workspace-list-80x24-layout`: Terminal 80×24 → only status icon + name + timestamp columns visible. No status label, owner, idle timeout. Toolbar shows search input only
- **RESP-WS-002** `workspace-list-80x24-truncation`: Terminal 80×24, workspace with long name (60+ chars) → name truncated with `…`
- **RESP-WS-003** `workspace-list-80x24-no-column-headers`: Terminal 80×24 → column header row hidden
- **RESP-WS-004** `workspace-list-80x24-toolbar-collapsed`: Terminal 80×24 → status filter label hidden from toolbar
- **RESP-WS-005** `workspace-list-80x24-delete-overlay`: Terminal 80×24, press `d` → delete overlay renders at 90% width instead of 50%
- **RESP-WS-006** `workspace-list-120x40-layout`: Terminal 120×40 → name, status label, owner, idle timeout, and timestamp columns visible. Full toolbar with status filter label
- **RESP-WS-007** `workspace-list-120x40-column-headers`: Terminal 120×40 → column header row visible with "NAME", "STATUS", "OWNER", "IDLE", "AGE"
- **RESP-WS-008** `workspace-list-120x40-name-truncation`: Terminal 120×40, workspace with name >30ch → truncated with `…` at 30 chars
- **RESP-WS-009** `workspace-list-200x60-layout`: Terminal 200×60 → all columns visible including workspace ID, suspended_at, and created_at
- **RESP-WS-010** `workspace-list-200x60-workspace-id`: Terminal 200×60 → workspace ID column shows first 8 chars of UUID with `…`
- **RESP-WS-011** `workspace-list-resize-standard-to-min`: Resize from 120×40 → 80×24 → status label and owner columns collapse immediately
- **RESP-WS-012** `workspace-list-resize-min-to-standard`: Resize from 80×24 → 120×40 → status label and owner columns appear
- **RESP-WS-013** `workspace-list-resize-preserves-focus`: Resize at any breakpoint → focused row remains focused and visible
- **RESP-WS-014** `workspace-list-resize-during-filter`: Resize with filter active → filter text preserved, results re-rendered at new column layout
- **RESP-WS-015** `workspace-list-resize-during-loading`: Resize while initial load spinner is showing → spinner re-centers, no crash
- **RESP-WS-016** `workspace-list-resize-with-overlay`: Resize with delete confirmation overlay open → overlay recenters, no overflow
- **RESP-WS-017** `workspace-list-search-input-80x24`: Terminal 80×24, press `/` → search input renders at full toolbar width

### Integration Tests (24 tests)

- **INT-WS-001** `workspace-list-auth-expiry`: 401 on initial fetch → app-shell auth error screen rendered, not inline error
- **INT-WS-002** `workspace-list-rate-limit-429`: 429 with `Retry-After: 30` → inline error shows "Rate limited. Retry in 30s."
- **INT-WS-003** `workspace-list-network-error`: Network timeout on initial fetch → inline error with "Press R to retry"
- **INT-WS-004** `workspace-list-pagination-complete`: 45 workspaces total (page size 30) → both pages load, all 45 visible in list
- **INT-WS-005** `workspace-list-200-items-cap`: 300 workspaces → only 200 loaded, "Showing first 200 of 300" footer visible
- **INT-WS-006** `workspace-list-enter-then-q-returns`: Enter on workspace, then `q` → workspace list restored with same scroll position and focus
- **INT-WS-007** `workspace-list-goto-from-detail-and-back`: Open workspace from list, then `g w` → workspace list screen rendered fresh (no stale state)
- **INT-WS-008** `workspace-list-server-error-500`: 500 on fetch → inline error with "Press R to retry"
- **INT-WS-009** `workspace-list-suspend-optimistic-update`: Press `p` on running workspace → status icon changes to gray immediately, API called
- **INT-WS-010** `workspace-list-suspend-revert-on-failure`: Press `p`, server returns 409 → status reverts to running, status bar shows conflict error
- **INT-WS-011** `workspace-list-resume-optimistic-update`: Press `r` on suspended workspace → status icon changes to yellow immediately, API called
- **INT-WS-012** `workspace-list-resume-revert-on-failure`: Press `r`, server returns error → status reverts to suspended, status bar shows error flash
- **INT-WS-013** `workspace-list-delete-and-list-update`: Press `d` then `y` → workspace removed from list, total count decrements
- **INT-WS-014** `workspace-list-delete-revert-on-failure`: Press `d` then `y`, server returns error → workspace reappears in list, status bar shows error flash
- **INT-WS-015** `workspace-list-delete-last-workspace`: Delete the only workspace → empty state rendered
- **INT-WS-016** `workspace-list-ssh-copy-running`: Focus running workspace, press `S` → SSH connection command fetched and copied
- **INT-WS-017** `workspace-list-ssh-copy-not-running`: Focus suspended workspace, press `S` → no action
- **INT-WS-018** `workspace-list-permission-denied-403`: Press `p` on another user's workspace (non-admin) → 403, status bar shows "Permission denied."
- **INT-WS-019** `workspace-list-sse-status-update`: Workspace transitions from `starting` to `running` server-side → status icon updates to green in real-time via SSE
- **INT-WS-020** `workspace-list-sse-disconnect-reconnect`: SSE disconnects → status bar shows disconnected; reconnects → workspace list re-fetched to reconcile
- **INT-WS-021** `workspace-list-deep-link-entry`: Launch `codeplane tui --screen workspaces --repo owner/repo` → workspace list screen rendered, breadcrumb shows "Dashboard > owner/repo > Workspaces"
- **INT-WS-022** `workspace-list-command-palette-entry`: Press `:`, type "workspaces", press Enter → workspace list screen rendered
- **INT-WS-023** `workspace-list-concurrent-navigation`: Rapidly press `g w`, `g d`, `g w` → final state is workspace list screen with no intermediate screen artifacts
- **INT-WS-024** `workspace-list-create-and-return`: Press `c`, complete form, return → workspace list refreshes with newly created workspace

### Edge Case Tests (16 tests)

- **EDGE-WS-001** `workspace-list-no-auth-token`: No token available → app-shell auth error screen rendered before workspace list
- **EDGE-WS-002** `workspace-list-long-workspace-name`: Workspace name 63 chars (max) → truncated correctly at each breakpoint
- **EDGE-WS-003** `workspace-list-unicode-workspace-name`: Workspace with Unicode chars in name → grapheme-safe truncation
- **EDGE-WS-004** `workspace-list-single-workspace`: Only one workspace in repo → renders without layout issues
- **EDGE-WS-005** `workspace-list-concurrent-resize-nav`: Resize event fires during `Enter` key processing → no crash, navigation completes at new size
- **EDGE-WS-006** `workspace-list-search-no-matches`: Search with text that matches nothing → "No workspaces match" message shown
- **EDGE-WS-007** `workspace-list-null-name`: Workspace with null name field → rendered as `<unnamed>` in muted italic
- **EDGE-WS-008** `workspace-list-zero-idle-timeout`: Workspace with idle_timeout_seconds=0 → displayed as "—"
- **EDGE-WS-009** `workspace-list-very-large-idle-timeout`: Workspace with 86400s idle timeout → displayed as "24h"
- **EDGE-WS-010** `workspace-list-deleted-user-owner`: Workspace owned by deleted user → owner shown as "unknown" in muted
- **EDGE-WS-011** `workspace-list-rapid-p-presses`: Press `p` three times rapidly on running workspace → single API call, no duplicate suspend
- **EDGE-WS-012** `workspace-list-rapid-d-presses`: Press `d` twice → single confirmation overlay, not stacked
- **EDGE-WS-013** `workspace-list-network-disconnect-mid-pagination`: Network fails during page 2 fetch → page 1 items remain, error at bottom
- **EDGE-WS-014** `workspace-list-clipboard-unavailable`: `S` pressed in SSH session without clipboard → SSH command displayed inline in status bar
- **EDGE-WS-015** `workspace-list-sse-malformed-event`: SSE delivers unparseable event → ignored silently, no crash
- **EDGE-WS-016** `workspace-list-workspace-id-format`: Workspace with non-standard ID format → ID column handles gracefully

All 120 tests left failing if backend is unimplemented — never skipped or commented out.
