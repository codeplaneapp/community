# TUI_AGENT_SESSION_LIST

Specification for TUI_AGENT_SESSION_LIST.

## High-Level User POV

The Agent Session List is the entry point for all agent interactions within a Codeplane repository in the TUI. It presents a full-screen, scrollable list of all agent sessions associated with the current repository, designed for developers who use AI agents to assist with code generation, issue triage, diff review, and task automation — all without leaving the terminal. The screen is reached via the `g a` go-to keybinding from any screen, by typing `:agents` in the command palette, or by launching the TUI with `codeplane tui --screen agents --repo owner/repo`. Because agent sessions are scoped to a repository, this screen requires an active repository context; navigating to it without one pushes the user to the repository list to select a repo first.

The screen occupies the entire content area between the header bar and status bar. At the top is a title row showing "Agent Sessions" in bold primary color, followed by the total count in parentheses (e.g., "Agent Sessions (12)"). Below the title is a filter toolbar displaying the current status filter ("All", "Active", "Completed", "Failed", "Timed Out") and a search input for client-side substring filtering across session titles. The active filter is highlighted in the primary color; inactive filters are muted.

The main content area is a scrollable list of session rows. Each row occupies a single line and shows: a status indicator icon (● green for active, ✓ green for completed, ✗ red for failed, ⏱ yellow for timed out, ○ muted for pending), the session title (truncated to fit), the message count (muted, e.g., "4 msgs"), and a relative timestamp showing when the session was created. Active sessions render with bold text to visually distinguish them from terminal sessions. The focused row is highlighted with reverse video in the primary accent color. Navigation uses vim-style `j`/`k` keys and arrow keys. Pressing `Enter` on a focused session navigates to the Agent Chat Screen (`TUI_AGENT_CHAT_SCREEN`) for that session. Pressing `n` opens the session creation flow (`TUI_AGENT_SESSION_CREATE`). Pressing `d` prompts a confirmation overlay before deleting the focused session. Pressing `r` on a completed or failed session enters replay mode (`TUI_AGENT_SESSION_REPLAY`).

The list supports page-based pagination (page size 30, max 50 per page, 500-item memory cap). SSE events for session status changes (active → completed, active → failed, active → timed_out) update the corresponding row inline in real-time. The screen adapts responsively: at 80×24 only the status icon, title, and timestamp are shown; at 120×40 the message count and session ID prefix appear; at 200×60+ the full column set including the workflow run link and duration renders with generous spacing.

## Acceptance Criteria

### Definition of Done
- [ ] The Agent Session List screen renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The screen is reachable via `g a` go-to navigation (requires repo context), `:agents` command palette entry, and `--screen agents --repo owner/repo` deep-link
- [ ] The breadcrumb reads "Dashboard > owner/repo > Agent Sessions"
- [ ] Pressing `q` pops the screen and returns to the previous screen
- [ ] Agent sessions are fetched via `useAgentSessions()` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/agent/sessions` with page-based pagination (default page size 30, max 50)
- [ ] The list defaults to showing all sessions sorted by `created_at` descending (newest first)
- [ ] Each row displays: status indicator icon, title, message count (standard+ sizes), and relative timestamp
- [ ] Active sessions render with bold text; terminal sessions (completed, failed, timed_out) render with normal weight
- [ ] The header shows "Agent Sessions (N)" where N is derived from the `X-Total-Count` response header
- [ ] The filter toolbar is always visible below the title row
- [ ] Status filter changes re-filter sessions client-side on the loaded data set
- [ ] The screen shows a "Repository required" message and redirects to repo list when accessed without repo context

### Keyboard Interactions
- [ ] `j` / `Down`: Move focus to next session row
- [ ] `k` / `Up`: Move focus to previous session row
- [ ] `Enter`: Navigate to agent chat screen for the focused session (push `TUI_AGENT_CHAT_SCREEN`)
- [ ] `/`: Focus search input in filter toolbar
- [ ] `Esc`: Close overlay; or clear search; or pop screen (context-dependent priority)
- [ ] `G`: Jump to last loaded session row
- [ ] `g g`: Jump to first session row
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up
- [ ] `n`: Open agent session creation flow (push `TUI_AGENT_SESSION_CREATE`)
- [ ] `d`: Delete focused session (show confirmation overlay, then `DELETE /api/repos/:owner/:repo/agent/sessions/:id`)
- [ ] `r`: Enter replay mode for focused completed/failed session (push `TUI_AGENT_SESSION_REPLAY`)
- [ ] `f`: Cycle status filter (All → Active → Completed → Failed → Timed Out → All)
- [ ] `q`: Pop screen (return to previous screen)
- [ ] `Space`: Toggle row selection (multi-select for future batch delete)
- [ ] `R`: Retry fetch on error state

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: Status icon (2ch), title (remaining minus timestamp, truncated with `…`), timestamp (4ch). Message count, session ID, and duration hidden. Toolbar: filter + search only
- [ ] 120×40 – 199×59: Status icon (2ch), title (40ch), message count (8ch, e.g., "12 msgs"), timestamp (4ch). Session ID prefix hidden. Full toolbar
- [ ] 200×60+: Status icon (2ch), session ID prefix (10ch, e.g., "abc123de…"), title (50ch), message count (8ch), duration (8ch, e.g., "2m 34s"), timestamp (6ch, e.g., "3d ago"). Full column set with generous spacing

### Truncation & Boundary Constraints
- [ ] Session title: truncated with `…` at column width (remaining/40ch/50ch depending on breakpoint)
- [ ] Session title max server length: 255 characters (truncated client-side if wider than column)
- [ ] Session ID prefix: first 8 characters of UUID followed by `…` (10ch total)
- [ ] Message count: format "N msgs" for N < 10000, "9999+" for N ≥ 10000
- [ ] Duration: format "Xs" for <60s, "Xm Ys" for <60m, "Xh Ym" for ≥60m; "—" if session never started
- [ ] Timestamps: max 4ch standard ("3d", "1w", "2mo", "1y", "now"), 6ch large ("3d ago")
- [ ] Search input: max 120ch
- [ ] Memory cap: 500 sessions max loaded
- [ ] Total count: abbreviated above 9999 ("9999+")

### Edge Cases
- [ ] Terminal resize while scrolled: focus index preserved, columns recalculate synchronously
- [ ] Rapid j/k: sequential, no debounce, one row per keypress
- [ ] SSE session status update arrives while list is open: row updates inline, status icon and bold/normal weight change, no scroll position jump
- [ ] SSE disconnect and reconnect: status bar shows disconnection, list remains usable with stale data
- [ ] Unicode in session titles: truncation respects grapheme clusters
- [ ] Null or empty title: rendered as "Untitled session" in muted italic
- [ ] 500+ sessions: pagination cap, footer shows "Showing 500 of N"
- [ ] Delete 404 (session already deleted): optimistic removal stands, no error flash
- [ ] Delete while session is active: confirmation overlay warns "This session is still active. Delete anyway?"
- [ ] Delete confirmation cancelled: no-op, focus returns to list
- [ ] Empty list (zero sessions): "No agent sessions yet. Press n to create one." centered message
- [ ] All filtered out by status: "No {status} sessions." with hint to press `f` to cycle filter
- [ ] Search no matches: "No sessions match \"{query}\"." centered
- [ ] Rapid `d` presses on same session: first press opens confirmation, subsequent are no-ops while overlay is open
- [ ] Network disconnect mid-pagination: error state on list, "Press R to retry"
- [ ] Session with zero messages: message count shows "0 msgs"
- [ ] Session with null startedAt and null finishedAt: duration shows "—"
- [ ] Navigating to agents without repo context: redirect to repo list with flash "Select a repository to view agent sessions"
- [ ] Session created via CLI or web UI: appears on next data fetch or via SSE push
- [ ] Session with workflow_run_id linked: no special display in list (link is shown in detail view)

## Design

### Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│ Header: Dashboard > acme/api > Agent Sessions    ● sync  │
├──────────────────────────────────────────────────────────┤
│ Agent Sessions (12)                              / search │
│ Filter: All │ Active │ Completed │ Failed │ Timed Out     │
├──────────────────────────────────────────────────────────┤
│ ● Refactor auth module                    4 msgs     3m  │
│ ● Fix flaky test in CI                    12 msgs    1h  │
│ ✓ Add pagination to user list             8 msgs     2h  │
│ ✗ Migrate database schema                 3 msgs     1d  │
│ ✓ Update README with new API docs         6 msgs     2d  │
│ ⏱ Review landing request #42              1 msg      3d  │
│ …                                                         │
│                    Loading more…                           │
├──────────────────────────────────────────────────────────┤
│ Status: j/k:nav Enter:open n:new d:del r:replay q:back   │
└──────────────────────────────────────────────────────────┘
```

The screen is composed of: (1) title row "Agent Sessions (N)", (2) persistent filter toolbar with status filter and search input, (3) `<scrollbox>` with session rows and pagination footer, (4) empty/error/loading states.

### Components Used
- `<box>` — Vertical/horizontal flexbox containers for layout, rows, toolbar, confirmation overlay
- `<scrollbox>` — Scrollable session list with scroll-to-end pagination detection at 80%
- `<text>` — Session titles, message counts, timestamps, status icons, filter labels
- `<input>` — Search input in filter toolbar (focused via `/`)

### Status Icon Mapping

| Status | Icon | Color | Bold |
|--------|------|-------|------|
| `active` | `●` | `success` (green 34) | Yes |
| `completed` | `✓` | `success` (green 34) | No |
| `failed` | `✗` | `error` (red 196) | No |
| `timed_out` | `⏱` | `warning` (yellow 178) | No |
| `pending` | `○` | `muted` (gray 245) | No |

Text fallbacks for terminals without Unicode support: `[A]`, `[C]`, `[F]`, `[T]`, `[P]`.

### Empty States
- Zero sessions: "No agent sessions yet. Press n to create one." centered muted text
- All filtered out: "No {activeFilter} sessions. Press f to cycle filter." centered muted text
- Search no matches: "No sessions match \"{query}\"." centered muted text

### Keybindings

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Next row | List focused |
| `k` / `Up` | Previous row | List focused |
| `Enter` | Navigate to chat screen | Session focused |
| `/` | Focus search input | List focused |
| `Esc` | Close overlay → clear search → pop screen | Priority chain |
| `G` | Jump to last row | List focused |
| `g g` | Jump to first row | List focused |
| `Ctrl+D` / `Ctrl+U` | Page down / page up | List focused |
| `n` | Create new session | List focused |
| `d` | Delete focused session | Session focused, confirmation overlay |
| `r` | Replay session | Session focused, status is completed/failed/timed_out |
| `f` | Cycle status filter | List focused |
| `Space` | Toggle row selection | Session focused |
| `R` | Retry on error | Error state visible |
| `q` | Pop screen | Not in search input, not in overlay |
| `Enter` (in overlay) | Confirm delete | Delete overlay open |
| `Esc` (in overlay) | Cancel delete | Delete overlay open |

### Responsive Behavior

| Breakpoint | Icon | ID Prefix | Title | Msg Count | Duration | Timestamp | Toolbar |
|-----------|------|-----------|-------|-----------|----------|-----------|--------|
| 80×24 min | 2ch | hidden | remaining−4ch | hidden | hidden | 4ch | filter + search |
| 120×40 std | 2ch | hidden | 40ch | 8ch | hidden | 4ch | full |
| 200×60 lg | 2ch | 10ch | 50ch | 8ch | 8ch | 6ch | full |

Resize triggers synchronous re-layout. Focused row index preserved. Column widths recalculated. Search input width adjusts proportionally.

### Data Hooks
- `useAgentSessions(owner, repo)` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/agent/sessions?page=N&per_page=30` (page-based pagination, `X-Total-Count` header for total)
- `useDeleteAgentSession(owner, repo)` from `@codeplane/ui-core` → `DELETE /api/repos/:owner/:repo/agent/sessions/:id` (returns 204 on success)
- `useSSE("agent_session_{repoId}")` from SSE context provider — listens for session status change events
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()`, `useRepoContext()` from local TUI routing

### API Endpoints Consumed
- `GET /api/repos/:owner/:repo/agent/sessions?page=N&per_page=30` — Paginated session list with `X-Total-Count` header. Returns sessions with `id`, `title`, `status`, `startedAt`, `finishedAt`, `createdAt`, `updatedAt`, `messageCount`
- `DELETE /api/repos/:owner/:repo/agent/sessions/:id` — Delete a session (204 No Content on success, 404 if already deleted)

### Navigation
- `Enter` → `push("agent-chat", { repo: owner/repo, sessionId: session.id })`
- `n` → `push("agent-session-create", { repo: owner/repo })`
- `r` (on completed/failed/timed_out session) → `push("agent-session-replay", { repo: owner/repo, sessionId: session.id })`
- `q` → `pop()`
- No repo context + `Enter` → `push("repo-list")`

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated (repo read) | Authenticated (repo write) | Repo Admin |
|--------|-----------|---------------------------|---------------------------|------------|
| View session list | ❌ | ✅ | ✅ | ✅ |
| Navigate to chat | ❌ | ✅ | ✅ | ✅ |
| Create session | ❌ | ❌ | ✅ | ✅ |
| Delete session | ❌ | ❌ | ✅ (own sessions) | ✅ (any session) |
| Replay session | ❌ | ✅ | ✅ | ✅ |

- The Agent Session List screen requires authentication. Unauthenticated users see the auth error screen ("Run `codeplane auth login` to authenticate.")
- All API endpoints are scoped to the repository. A user must have at least read access to the repository to view sessions
- Session deletion is restricted: users can only delete their own sessions unless they are a repository admin
- The `n` (create) keybinding is suppressed (no-op with status bar flash "Write access required") for users with read-only repository access
- The `d` (delete) keybinding is suppressed for sessions owned by other users (unless repo admin)

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- SSE endpoint uses ticket-based authentication obtained via auth API
- Token is never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen ("Session expired. Run `codeplane auth login` to re-authenticate.")
- 403 responses show inline "Insufficient permissions" error with `q` to go back

### Rate Limiting
- `GET /api/repos/:owner/:repo/agent/sessions`: 300 req/min (shared with other list endpoints)
- `DELETE /api/repos/:owner/:repo/agent/sessions/:id`: 60 req/min
- SSE connections: 10 connections/min (reconnection limiter)
- 429 responses show inline "Rate limited. Retry in {Retry-After}s." in the status bar
- No auto-retry on rate limit; user waits and presses `R` or action auto-succeeds on next interaction
- Delete actions that are rate-limited revert their optimistic update

### Data Sensitivity
- Session titles may contain task descriptions referencing code, issues, or internal project details — these are scoped to repo-level access
- Session IDs are UUIDs — not sensitive but not user-facing (only shown as prefix in large terminals)
- No PII beyond what the user already has access to in the repository
- Message counts are aggregated integers, not sensitive

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.agents.session_list.view` | Screen mounted, initial data loaded | `total_count`, `active_count`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_method` ("goto", "palette", "deeplink"), `repo_slug` |
| `tui.agents.session_list.navigate_to_chat` | Enter on session | `session_id`, `session_status`, `message_count`, `position_in_list`, `status_filter`, `had_search` |
| `tui.agents.session_list.navigate_to_replay` | Press r on session | `session_id`, `session_status`, `message_count`, `position_in_list` |
| `tui.agents.session_list.create_initiated` | Press n | `status_filter`, `total_count` |
| `tui.agents.session_list.delete_initiated` | Press d (before confirmation) | `session_id`, `session_status`, `is_own_session` |
| `tui.agents.session_list.delete_confirmed` | Enter in delete overlay | `session_id`, `session_status`, `success` |
| `tui.agents.session_list.delete_cancelled` | Esc in delete overlay | `session_id` |
| `tui.agents.session_list.filter_change` | Press f | `new_filter`, `previous_filter`, `visible_count` |
| `tui.agents.session_list.search` | Type in search input | `query_length`, `match_count`, `total_loaded_count` |
| `tui.agents.session_list.paginate` | Next page loaded via scroll | `page_number`, `items_loaded_total`, `total_count` |
| `tui.agents.session_list.sse_status_update` | SSE session status change | `session_id`, `old_status`, `new_status`, `was_screen_visible` |
| `tui.agents.session_list.error` | API failure | `error_type`, `http_status`, `request_type` ("list", "delete") |
| `tui.agents.session_list.retry` | Retry after error | `error_type`, `retry_success` |
| `tui.agents.session_list.empty` | Empty state shown | `filter_value`, `has_search_text` |
| `tui.agents.session_list.no_repo_context` | Accessed without repo | `entry_method` |

### Common Properties (all events)
- `session_id` (TUI session, not agent session), `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`, `repo_slug`

### Success Indicators

| Metric | Target |
|--------|--------|
| Screen load completion | >98% |
| Navigate-to-chat rate | >60% of views |
| Create session rate | >20% of views |
| Delete rate | <10% of views |
| Replay rate | >15% of views |
| Filter usage | >20% of views |
| Search adoption | >10% of views |
| SSE connection uptime | >95% of session time |
| Error rate | <2% |
| Retry success | >80% |
| Time to interactive | <1.5s |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `AgentSessions: mounted [repo={slug}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Data loaded | `AgentSessions: loaded [count={n}] [total={t}] [active={a}] [duration={ms}ms]` |
| `debug` | Search/filter changes | `AgentSessions: search [query_length={n}] [matches={m}]` |
| `debug` | Filter changed | `AgentSessions: filter [from={old}] [to={new}]` |
| `debug` | Pagination triggered | `AgentSessions: pagination [page={n}]` |
| `debug` | SSE status update | `AgentSessions: sse status [session_id={id}] [old={old}] [new={new}]` |
| `info` | Fully loaded | `AgentSessions: ready [count={n}] [active={a}] [total_ms={ms}]` |
| `info` | Navigated to chat | `AgentSessions: navigated to chat [session_id={id}] [status={s}]` |
| `info` | Navigated to replay | `AgentSessions: navigated to replay [session_id={id}] [status={s}]` |
| `info` | Session deleted | `AgentSessions: deleted [session_id={id}] [success={bool}]` |
| `info` | Session create initiated | `AgentSessions: create initiated` |
| `warn` | Fetch failed | `AgentSessions: fetch failed [status={code}] [error={msg}]` |
| `warn` | Rate limited | `AgentSessions: rate limited [retry_after={s}]` |
| `warn` | Delete failed | `AgentSessions: delete failed [session_id={id}] [status={code}]` |
| `warn` | Slow load (>3s) | `AgentSessions: slow load [duration={ms}ms]` |
| `warn` | Pagination cap | `AgentSessions: pagination cap [total={n}] [cap=500]` |
| `warn` | SSE disconnect | `AgentSessions: sse disconnected [duration={ms}ms]` |
| `warn` | No repo context | `AgentSessions: no repo context [entry_method={method}]` |
| `error` | Auth error | `AgentSessions: auth error [status=401]` |
| `error` | Permission error | `AgentSessions: permission error [status=403]` |
| `error` | SSE failed permanently | `AgentSessions: sse failed [attempts={n}] [last_error={msg}]` |
| `error` | Render error | `AgentSessions: render error [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Detection | Behavior | Recovery |
|-------|-----------|----------|----------|
| Resize during load | `useOnResize` fires while fetch in-flight | Layout re-renders; fetch continues | Independent; layout adjusts on completion |
| Resize while scrolled | `useOnResize` fires with scroll offset | Columns recalculate; focus preserved | Synchronous re-layout |
| SSE disconnect | SSE `error`/`close` event | Status bar shows "⚠ Disconnected"; list remains usable with stale data | Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s) |
| Auth expiry | 401 from any API call | Auth error screen pushed | Re-auth via CLI (`codeplane auth login`) |
| Permission denied | 403 from any API call | Inline "Insufficient permissions" error | Navigate away; check repo access |
| Network timeout (30s) | Fetch promise timeout | Loading → error state with "Press R to retry" | User retries |
| Delete 404 | `DELETE` returns 404 (session already deleted) | Optimistic removal stands; no error flash | Session was deleted elsewhere; removal is correct |
| Delete 403 | `DELETE` returns 403 (not owner and not admin) | Optimistic reverts; status bar flash "Cannot delete: not your session" | User navigates away or contacts admin |
| Delete 429 | `DELETE` returns 429 | Optimistic reverts; status bar flash with retry-after | User waits, tries again |
| Rapid d presses | Multiple `d` on same session | First opens confirmation overlay; subsequent are no-ops while overlay is open | Overlay captures all input until dismissed |
| No repo context | Screen mounted without repoContext | "Repository required" screen shown | Enter navigates to repo list |
| No color support | `TERM`/`COLORTERM` detection | Text markers `[A]`, `[C]`, `[F]`, `[T]`, `[P]` replace icons | Theme detection at startup |
| Memory cap (500) | Client-side item count check | Stop pagination; footer shows count | Client-side cap; user is informed |
| SSE delivers stale update | Session status change for session not in loaded list | Ignored (not in viewport) | No action needed |
| Delete during SSE update | Delete races with status update | Delete wins; row removed regardless of SSE update | Optimistic delete takes priority |

### Failure Modes
- Component crash → global error boundary → "Press r to restart"
- All API fails → error state displayed; `q` and go-to keys still work for navigation away
- SSE permanently fails (>10 reconnect attempts) → status bar shows persistent warning; list still usable with manual refresh via leaving and re-entering screen
- Slow network → spinner shown; user navigates away via go-to or palette
- No repo context → user redirected to repo list, no crash

## Verification

### Test File: `e2e/tui/agents.test.ts`

### Terminal Snapshot Tests (28 tests)

- SNAP-AGENT-LIST-001: Agent session list at 120×40 with mixed status sessions — full layout, headers, columns, focus highlight
- SNAP-AGENT-LIST-002: Agent session list at 80×24 minimum — status icon, title, timestamp only
- SNAP-AGENT-LIST-003: Agent session list at 200×60 large — all columns including ID prefix and duration
- SNAP-AGENT-LIST-004: Empty state (zero sessions) — "No agent sessions yet. Press n to create one." centered
- SNAP-AGENT-LIST-005: All filtered out by Active status — "No Active sessions. Press f to cycle filter."
- SNAP-AGENT-LIST-006: All filtered out by Failed status — "No Failed sessions. Press f to cycle filter."
- SNAP-AGENT-LIST-007: Search no matches — "No sessions match \"{query}\"."
- SNAP-AGENT-LIST-008: Loading state — "Loading agent sessions…" with title/toolbar visible
- SNAP-AGENT-LIST-009: Error state — red error with "Press R to retry"
- SNAP-AGENT-LIST-010: Focused row highlight on active session — primary accent reverse video, bold text
- SNAP-AGENT-LIST-011: Focused row highlight on completed session — primary accent reverse video, normal weight text
- SNAP-AGENT-LIST-012: Status icon rendering — ● green for active, ✓ green for completed, ✗ red for failed, ⏱ yellow for timed_out, ○ gray for pending
- SNAP-AGENT-LIST-013: Status icon text fallbacks — [A], [C], [F], [T], [P] when Unicode unsupported
- SNAP-AGENT-LIST-014: Bold text for active sessions vs normal text for terminal sessions
- SNAP-AGENT-LIST-015: Filter toolbar with "All" active
- SNAP-AGENT-LIST-016: Filter toolbar with "Active" active
- SNAP-AGENT-LIST-017: Filter toolbar with "Completed" active
- SNAP-AGENT-LIST-018: Search input focused with query text
- SNAP-AGENT-LIST-019: Narrowed results after search
- SNAP-AGENT-LIST-020: Pagination loading footer — "Loading more…"
- SNAP-AGENT-LIST-021: Pagination cap footer — "Showing 500 of N"
- SNAP-AGENT-LIST-022: Breadcrumb — "Dashboard > acme/api > Agent Sessions"
- SNAP-AGENT-LIST-023: Total count in title — "Agent Sessions (12)"
- SNAP-AGENT-LIST-024: Status bar keybinding hints — "j/k:nav Enter:open n:new d:del r:replay q:back"
- SNAP-AGENT-LIST-025: Long title truncation with ellipsis
- SNAP-AGENT-LIST-026: Session with null/empty title — "Untitled session" in muted italic
- SNAP-AGENT-LIST-027: Delete confirmation overlay — centered with warning border, confirm/cancel prompts
- SNAP-AGENT-LIST-028: Delete confirmation overlay for active session — includes "still active" warning

### Keyboard Interaction Tests (42 tests)

- KEY-AGENT-LIST-001: j moves focus down one row
- KEY-AGENT-LIST-002: k moves focus up one row
- KEY-AGENT-LIST-003: Down arrow moves focus down one row
- KEY-AGENT-LIST-004: Up arrow moves focus up one row
- KEY-AGENT-LIST-005: j at bottom of list stops at last row (no wrap)
- KEY-AGENT-LIST-006: k at top of list stays at first row
- KEY-AGENT-LIST-007: Enter on active session navigates to agent chat screen
- KEY-AGENT-LIST-008: Enter on completed session navigates to agent chat screen
- KEY-AGENT-LIST-009: Enter on failed session navigates to agent chat screen
- KEY-AGENT-LIST-010: / focuses search input
- KEY-AGENT-LIST-011: Typing in search input narrows session list by title match
- KEY-AGENT-LIST-012: Search is case-insensitive
- KEY-AGENT-LIST-013: Esc in search input clears search and returns focus to list
- KEY-AGENT-LIST-014: Esc with no search and no overlay active pops screen
- KEY-AGENT-LIST-015: G jumps to last loaded session
- KEY-AGENT-LIST-016: g g jumps to first session
- KEY-AGENT-LIST-017: Ctrl+D pages down
- KEY-AGENT-LIST-018: Ctrl+U pages up
- KEY-AGENT-LIST-019: n navigates to session create screen
- KEY-AGENT-LIST-020: d on focused session opens delete confirmation overlay
- KEY-AGENT-LIST-021: Enter in delete confirmation overlay deletes session and removes row
- KEY-AGENT-LIST-022: Esc in delete confirmation overlay cancels deletion
- KEY-AGENT-LIST-023: d on active session shows "still active" warning in confirmation
- KEY-AGENT-LIST-024: r on completed session navigates to replay screen
- KEY-AGENT-LIST-025: r on failed session navigates to replay screen
- KEY-AGENT-LIST-026: r on timed_out session navigates to replay screen
- KEY-AGENT-LIST-027: r on active session is no-op (status bar flash: "Session still active")
- KEY-AGENT-LIST-028: r on pending session is no-op
- KEY-AGENT-LIST-029: f cycles filter from All to Active
- KEY-AGENT-LIST-030: f cycles filter from Active to Completed
- KEY-AGENT-LIST-031: f cycles filter through all statuses and wraps to All
- KEY-AGENT-LIST-032: Active filter hides completed/failed/timed_out sessions
- KEY-AGENT-LIST-033: Completed filter hides active/failed/timed_out sessions
- KEY-AGENT-LIST-034: Space toggles row selection indicator
- KEY-AGENT-LIST-035: q pops screen
- KEY-AGENT-LIST-036: Keys j/k/n/d/r/f do not trigger while search input focused (they type into input)
- KEY-AGENT-LIST-037: Enter during loading state is no-op
- KEY-AGENT-LIST-038: Pagination triggers on scroll to 80% threshold
- KEY-AGENT-LIST-039: Rapid j presses (15× sequential) — each moves focus one row
- KEY-AGENT-LIST-040: R retries fetch when in error state
- KEY-AGENT-LIST-041: Esc priority chain: overlay open → close overlay; search active → clear search; nothing active → pop screen
- KEY-AGENT-LIST-042: d while delete overlay already open is no-op

### Responsive Tests (14 tests)

- RESP-AGENT-LIST-001: 80×24 layout shows only status icon, title, timestamp
- RESP-AGENT-LIST-002: 80×24 title truncation at correct width (remaining minus 6ch)
- RESP-AGENT-LIST-003: 80×24 message count hidden
- RESP-AGENT-LIST-004: 80×24 session ID prefix hidden
- RESP-AGENT-LIST-005: 80×24 duration hidden
- RESP-AGENT-LIST-006: 120×40 layout shows status icon, title, message count, timestamp
- RESP-AGENT-LIST-007: 120×40 title truncated at 40ch
- RESP-AGENT-LIST-008: 120×40 message count visible (8ch)
- RESP-AGENT-LIST-009: 200×60 layout shows full column set including ID prefix and duration
- RESP-AGENT-LIST-010: 200×60 timestamp uses extended format ("3d ago")
- RESP-AGENT-LIST-011: Resize from 120×40 to 80×24 — columns collapse, focus preserved
- RESP-AGENT-LIST-012: Resize from 80×24 to 120×40 — columns expand, focus preserved
- RESP-AGENT-LIST-013: Resize during search — search input width adjusts
- RESP-AGENT-LIST-014: Resize with scrolled list — scroll position and focus preserved

### Integration Tests (22 tests)

- INT-AGENT-LIST-001: Auth expiry (401) during list fetch — auth error screen shown
- INT-AGENT-LIST-002: Permission denied (403) during list fetch — inline permission error
- INT-AGENT-LIST-003: Rate limit (429) on list fetch — inline error with retry-after
- INT-AGENT-LIST-004: Network timeout on list fetch — error state with "Press R to retry"
- INT-AGENT-LIST-005: Pagination loads next page correctly with page parameter
- INT-AGENT-LIST-006: Pagination cap at 500 items — footer shows cap message
- INT-AGENT-LIST-007: Navigation to chat and back preserves list state (scroll, focus, filter)
- INT-AGENT-LIST-008: Navigation to replay and back preserves list state
- INT-AGENT-LIST-009: Server 500 on list fetch — error state
- INT-AGENT-LIST-010: Delete optimistic then server error — row reappears at original position
- INT-AGENT-LIST-011: Delete 404 (already deleted) — optimistic removal stands
- INT-AGENT-LIST-012: Delete 403 (not owner) — reverts with permission flash
- INT-AGENT-LIST-013: Deep link `--screen agents --repo owner/repo` launches directly to session list
- INT-AGENT-LIST-014: Command palette `:agents` navigates to session list
- INT-AGENT-LIST-015: `g a` go-to navigates to session list
- INT-AGENT-LIST-016: `g a` without repo context redirects to repo list
- INT-AGENT-LIST-017: SSE delivers session status update — row updates inline (icon, bold)
- INT-AGENT-LIST-018: SSE reconnection maintains list state
- INT-AGENT-LIST-019: Total count in title stays synchronized with actual data
- INT-AGENT-LIST-020: n (create) suppressed for read-only users — status bar flash
- INT-AGENT-LIST-021: d (delete) suppressed for non-owner non-admin — status bar flash
- INT-AGENT-LIST-022: Session created via external client (CLI/web) appears on re-fetch

### Edge Case Tests (15 tests)

- EDGE-AGENT-LIST-001: No auth token at startup — auth error screen
- EDGE-AGENT-LIST-002: Long title (255 chars) — truncated with ellipsis
- EDGE-AGENT-LIST-003: Unicode/emoji in session title — truncation respects grapheme clusters
- EDGE-AGENT-LIST-004: Single session in list
- EDGE-AGENT-LIST-005: Concurrent resize + j/k navigation
- EDGE-AGENT-LIST-006: Search with special regex characters (literal match, not regex)
- EDGE-AGENT-LIST-007: Null/empty title field — "Untitled session" displayed, no crash
- EDGE-AGENT-LIST-008: Session with zero messages — "0 msgs" displayed
- EDGE-AGENT-LIST-009: Session with null startedAt/finishedAt — duration shows "—"
- EDGE-AGENT-LIST-010: Rapid d presses on same session — only first opens overlay
- EDGE-AGENT-LIST-011: SSE update arrives during pagination load — correctly merged, no duplicate
- EDGE-AGENT-LIST-012: Network disconnect mid-delete — optimistic reverts, error flash
- EDGE-AGENT-LIST-013: 0 sessions with search text — correct empty message
- EDGE-AGENT-LIST-014: Delete last session in list — empty state displayed, focus reset
- EDGE-AGENT-LIST-015: Delete focused session while filter active — focus moves to next visible row

All 121 tests left failing if backend is unimplemented — never skipped or commented out.
