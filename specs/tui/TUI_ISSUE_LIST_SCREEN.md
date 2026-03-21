# TUI_ISSUE_LIST_SCREEN

Specification for TUI_ISSUE_LIST_SCREEN.

## High-Level User POV

The Issue List screen is the primary issue management surface in the Codeplane TUI. It presents a comprehensive, full-screen view of all issues within a repository, designed for developers who need to triage, browse, and act on issues without leaving the terminal. The screen is reached via the `g i` go-to keybinding from any screen with an active repository context, by selecting "Issues" in the command palette, or by launching the TUI with `codeplane tui --screen issues --repo owner/repo`. It requires a repository context — if no repository is active when `g i` is pressed, the user is first prompted to select a repository from the repo list.

The screen occupies the entire content area between the header bar and status bar. At the top is a title row showing "Issues" in bold primary color, followed by the total issue count in parentheses (e.g., "Issues (142)"). Below the title is a persistent filter toolbar that displays the current state filter, active label filters, assignee filter, and a text search input.

The main content area is a scrollable list of issue rows. Each row occupies a single line and shows: the issue state icon (● green for open, ● red for closed), the issue number (#42), the issue title, label badges (color-coded inline tags), assignee login, comment count, and a relative timestamp. Navigation uses vim-style `j`/`k` keys and arrow keys. Pressing `Enter` on a focused issue pushes the issue detail view.

State filtering is accessible via `f`, which cycles through: "Open" (default), "Closed", and "All". Label filtering via `L` opens a multi-select overlay. Assignee filtering via `a` opens a single-select overlay. These filters compose. Text search via `/` focuses the search input for client-side substring matching.

The list supports cursor-based pagination (page size 30, 500-item memory cap). Users can create issues with `c` and close/reopen with `x` (optimistic). The screen adapts responsively: at 80×24 only essential columns are shown; at 120×40 labels, assignee, and comments appear; at 200×60+ the full column set including milestone renders.

## Acceptance Criteria

### Definition of Done
- [ ] The Issue List screen renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The screen is reachable via `g i` go-to navigation (with repo context), `:issues` command palette entry, and `--screen issues --repo owner/repo` deep-link
- [ ] The breadcrumb reads "Dashboard > owner/repo > Issues"
- [ ] Pressing `q` pops the screen and returns to the repository overview (or previous screen)
- [ ] Issues are fetched via `useIssues()` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/issues` with cursor-based pagination (default page size 30, state filter `open` by default)
- [ ] The list defaults to showing open issues sorted by `updated_at` descending
- [ ] Each row displays: state icon (● colored), issue number (#N), title, label badges, assignee login, comment count (💬 N), and relative `updated_at` timestamp
- [ ] The header shows "Issues (N)" where N is the `X-Total-Count` from the API response
- [ ] The filter toolbar is always visible below the title row
- [ ] State filter changes trigger a fresh API request with the new `state` query parameter and reset the pagination cursor

### Keyboard Interactions
- [ ] `j` / `Down`: Move focus to next issue row
- [ ] `k` / `Up`: Move focus to previous issue row
- [ ] `Enter`: Open focused issue (push issue detail view)
- [ ] `/`: Focus search input in filter toolbar
- [ ] `Esc`: Close overlay; or clear search; or pop screen (context-dependent priority)
- [ ] `G`: Jump to last loaded issue row
- [ ] `g g`: Jump to first issue row
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up
- [ ] `R`: Retry failed API request (only in error state)
- [ ] `f`: Cycle state filter (Open → Closed → All → Open)
- [ ] `L`: Open label filter overlay (multi-select)
- [ ] `a`: Open assignee filter overlay (single-select)
- [ ] `c`: Push issue create form
- [ ] `x`: Close/reopen focused issue (optimistic toggle)
- [ ] `Space`: Toggle row selection

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: State icon (2ch), number (6ch), title (remaining, truncated), timestamp (4ch). Labels/assignee/comments hidden. Toolbar: state + search only
- [ ] 120×40 – 199×59: State icon (2ch), number (6ch), title (45ch), labels (20ch), assignee (12ch), comments (5ch), timestamp (4ch). Full toolbar
- [ ] 200×60+: All columns including milestone (15ch). Title 70ch. Labels 30ch. Assignee 15ch

### Truncation & Boundary Constraints
- [ ] Issue title: truncated with `…` at column width (remaining/45ch/70ch)
- [ ] Issue number: `#N` format, max 6ch (up to #99999)
- [ ] Labels: max 20ch (standard) / 30ch (large), excess shown as `+N`
- [ ] Label names: truncated at 12ch within badges
- [ ] Assignee login: truncated at 12ch (standard) / 15ch (large)
- [ ] Comment count: K-abbreviated above 999, max 5ch
- [ ] Timestamps: max 4ch ("3d", "1w", "2mo", "1y", "now")
- [ ] Search input: max 120ch
- [ ] Memory cap: 500 issues max
- [ ] Total count: abbreviated above 9999

### Edge Cases
- [ ] Terminal resize while scrolled: focus preserved, columns recalculate
- [ ] Rapid j/k: sequential, no debounce, one row per keypress
- [ ] State filter change during pagination: cancels in-flight, resets cursor
- [ ] Unicode in titles: truncation respects grapheme clusters
- [ ] Null fields: rendered as blank, no "null" text
- [ ] 500+ issues: pagination cap, footer shows count
- [ ] Close/reopen 403: optimistic reverts, status bar error
- [ ] Label overlay with 100+ labels: scrollable
- [ ] Empty label/collaborator sets: graceful messages

## Design

### Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Issues                  │
├──────────────────────────────────────────────────────────┤
│ Issues (142)                                    / search │
│ State: Open │ Labels: bug, ux │ Assignee: —              │
├──────────────────────────────────────────────────────────┤
│ ● #142  Fix login timeout on slow networks  [bug]  al…  │
│ ● #139  Add dark mode support               [ui] [ux]   │
│ ●  #97  Refactor auth module                       bob   │
│ …                                                        │
│                    Loading more…                          │
├──────────────────────────────────────────────────────────┤
│ Status: j/k:nav Enter:open f:state /:search c:new q:back │
└──────────────────────────────────────────────────────────┘
```

The screen is composed of: (1) title row "Issues (N)", (2) persistent filter toolbar with state/labels/assignee/search, (3) column header row (standard+ sizes), (4) `<scrollbox>` with issue rows and pagination, (5) empty/error states.

### Components Used
- `<box>` — Vertical/horizontal flexbox containers for layout, rows, toolbar
- `<scrollbox>` — Scrollable issue list with scroll-to-end pagination detection at 80%
- `<text>` — Issue titles, numbers, timestamps, labels, filter labels
- `<input>` — Search input in filter toolbar (focused via `/`)
- `<select>` — Not used directly; label and assignee overlays are custom `<box>` overlays with keyboard navigation

### IssueRow: state icon (● green/red), #number (muted), title, label badges ([name] with bg color), assignee (muted), 💬 count (muted), timestamp (muted). Focused row uses reverse video with primary color.

### Label Filter Overlay: Centered modal (50% × 60%), border in primary color, bg surface (236). Scrollable label list with [✓]/[ ] checkboxes. Space toggles, Enter applies, Esc cancels.

### Assignee Filter Overlay: Centered modal (40% × 50%), single-select with "All", "Unassigned", and collaborators. j/k navigation, Enter selects, Esc cancels.

### Keybindings
| Key | Action | Condition |
|-----|--------|-----------|
| `j`/`Down` | Next row | List focused |
| `k`/`Up` | Previous row | List focused |
| `Enter` | Open issue / Apply overlay | Context |
| `/` | Focus search | List focused |
| `Esc` | Close overlay → clear search → pop | Priority |
| `G` | Last row | List focused |
| `g g` | First row | List focused |
| `Ctrl+D`/`Ctrl+U` | Page down/up | List focused |
| `R` | Retry | Error state |
| `f` | Cycle state filter | List focused |
| `L` | Label overlay | List focused |
| `a` | Assignee overlay | List focused |
| `c` | Create issue | List focused |
| `x` | Close/reopen | Issue focused |
| `Space` | Toggle selection | Issue focused |
| `q` | Pop screen | Not in input |

### Responsive: 80×24 = icon+number+title+time; 120×40 = +labels+assignee+comments; 200×60 = +milestone. Resize triggers synchronous re-layout, focused row preserved.

### Data Hooks
- `useIssues()` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/issues?state=open&page=N&per_page=30`
- `useRepoLabels()` → `GET /api/repos/:owner/:repo/labels`
- `useRepoCollaborators()` → `GET /api/repos/:owner/:repo/collaborators`
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()`, `useRepoContext()` from local TUI

### Navigation: Enter → `push("issue-detail", { repo, number })`. `c` → `push("issue-create", { repo })`. `q` → `pop()`.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View issue list (public repo) | ✅ | ✅ | ✅ | ✅ |
| View issue list (private repo) | ❌ | ✅ | ✅ | ✅ |
| Open issue detail | Same as view | ✅ | ✅ | ✅ |
| Create issue | ❌ | ❌ | ✅ | ✅ |
| Close/reopen issue | ❌ | ❌ | ✅ | ✅ |

- The Issue List screen requires an active repository context. Repository context is enforced at navigation level
- `GET /api/repos/:owner/:repo/issues` respects repository visibility: public repos accessible to all authenticated users; private repos require read access
- Close/reopen (`PATCH /api/repos/:owner/:repo/issues/:number`) requires write access. Read-only users see the `x` keybinding but receive "Permission denied" on action
- Issue creation requires write access. Read-only users can navigate to create form but submission fails

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen

### Rate Limiting
- 300 req/min for `GET /api/repos/:owner/:repo/issues`
- 60 req/min for PATCH (close/reopen) operations
- 429 responses show inline "Rate limited. Retry in {Retry-After}s."
- No auto-retry; user presses `R` after waiting

### Input Sanitization
- Search text is client-side only — never sent to API
- State filter values from fixed enum ("open", "closed", "") — no user strings reach API
- Issue titles/labels rendered as plain `<text>` (no injection vector in terminal)
- Label colors converted via safe ANSI mapping (no escape injection)

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.issues.view` | Screen mounted, data loaded | `repo`, `total_count`, `state_filter`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_method` |
| `tui.issues.open` | Enter on issue | `repo`, `issue_number`, `issue_state`, `position_in_list`, `was_filtered`, `state_filter`, `label_filter_count`, `assignee_filter` |
| `tui.issues.state_filter_change` | Press f | `repo`, `new_state`, `previous_state`, `total_count_for_new_state` |
| `tui.issues.label_filter_apply` | Apply label overlay | `repo`, `selected_label_count`, `total_available_labels`, `matched_issue_count` |
| `tui.issues.assignee_filter_apply` | Select assignee | `repo`, `assignee_value`, `matched_issue_count` |
| `tui.issues.search` | Type in search | `repo`, `query_length`, `match_count`, `total_loaded_count` |
| `tui.issues.create` | Press c | `repo`, `current_state_filter` |
| `tui.issues.close` | Press x (close) | `repo`, `issue_number`, `success`, `position_in_list` |
| `tui.issues.reopen` | Press x (reopen) | `repo`, `issue_number`, `success`, `position_in_list` |
| `tui.issues.paginate` | Next page loaded | `repo`, `page_number`, `items_loaded_total`, `total_count`, `state_filter` |
| `tui.issues.error` | API failure | `repo`, `error_type`, `http_status`, `request_type` |
| `tui.issues.retry` | Press R | `repo`, `error_type`, `retry_success` |
| `tui.issues.empty` | Empty state shown | `repo`, `state_filter`, `has_label_filter`, `has_assignee_filter`, `has_search_text` |
| `tui.issues.data_load_time` | All data loaded | `repo`, `issues_ms`, `labels_ms`, `collaborators_ms`, `total_ms` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators
| Metric | Target |
|--------|--------|
| Screen load completion | >98% |
| Issue open rate | >60% of views |
| State filter usage | >30% of views |
| Search adoption | >15% of views |
| Label filter usage | >10% of views |
| Assignee filter usage | >8% of views |
| Close/reopen rate | >5% of views |
| Create rate | >3% of views |
| Error rate | <2% |
| Retry success | >80% |
| Time to interactive | <1.5s |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `Issues: mounted [repo={r}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Data loaded | `Issues: loaded [repo={r}] [count={n}] [total={t}] [state={s}] [duration={ms}ms]` |
| `debug` | Search/filter changes | `Issues: search [repo={r}] [query_length={n}] [matches={m}]` |
| `debug` | State filter changed | `Issues: state filter [repo={r}] [from={old}] [to={new}]` |
| `debug` | Pagination triggered | `Issues: pagination [repo={r}] [page={n}]` |
| `info` | Fully loaded | `Issues: ready [repo={r}] [issues={n}] [labels={l}] [collaborators={c}] [total_ms={ms}]` |
| `info` | Issue navigated | `Issues: navigated [repo={r}] [number={n}] [position={i}]` |
| `info` | Issue state changed | `Issues: state changed [repo={r}] [number={n}] [action={close|reopen}] [success={bool}]` |
| `warn` | Fetch failed | `Issues: fetch failed [repo={r}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `Issues: rate limited [repo={r}] [retry_after={s}]` |
| `warn` | Action failed | `Issues: action failed [repo={r}] [number={n}] [action={a}] [status={code}]` |
| `warn` | Slow load (>3s) | `Issues: slow load [repo={r}] [duration={ms}ms]` |
| `warn` | Pagination cap | `Issues: pagination cap [repo={r}] [total={n}] [cap=500]` |
| `error` | Auth error | `Issues: auth error [repo={r}] [status=401]` |
| `error` | Permission denied | `Issues: permission denied [repo={r}] [number={n}] [action={a}]` |
| `error` | Render error | `Issues: render error [repo={r}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases
| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during load | Layout re-renders; fetch continues | Independent |
| Resize with overlay open | Overlay resizes proportionally | Synchronous |
| SSE disconnect | Status bar indicator; issue list unaffected | SSE provider reconnects |
| Auth expiry | Next API call → 401 → auth error screen | Re-auth via CLI |
| Network timeout (30s) | Loading → error + "Press R" | User retries |
| Close/reopen 403 | Optimistic reverts; status bar flash | Informational |
| Rapid f cycling | Each change cancels previous request | Cancel semantics |
| No color support | Text markers [O]/[C] replace ● icons | Theme detection |
| Memory cap (500) | Stop pagination; show cap message | Client-side cap |

### Failure Modes
- Component crash → global error boundary → "Press r to restart"
- Label/assignee overlay crash → overlay dismissed, error flash; user retries
- All API fails → error state; c/q still work for navigation
- Slow network → spinner shown; user navigates away via go-to or palette

## Verification

### Test File: `e2e/tui/issues.test.ts`

### Terminal Snapshot Tests (30 tests)

- SNAP-ISSUES-001: Issue list at 120×40 with populated issues — full layout, headers, columns, focus highlight
- SNAP-ISSUES-002: Issue list at 80×24 minimum — icon, number, title, timestamp only
- SNAP-ISSUES-003: Issue list at 200×60 large — all columns including milestone
- SNAP-ISSUES-004: Empty state (zero issues) — "No issues yet. Press c to create one."
- SNAP-ISSUES-005: No filter matches — "No issues match the current filters."
- SNAP-ISSUES-006: Loading state — "Loading issues…" with title/toolbar visible
- SNAP-ISSUES-007: Error state — red error with "Press R to retry"
- SNAP-ISSUES-008: Focused row highlight — primary accent (ANSI 33)
- SNAP-ISSUES-009: Open issue state icons — ● green (ANSI 34)
- SNAP-ISSUES-010: Closed issue state icons — ● red (ANSI 196)
- SNAP-ISSUES-011: Label badges with colors
- SNAP-ISSUES-012: Label overflow (+N indicator)
- SNAP-ISSUES-013: Assignee column
- SNAP-ISSUES-014: Comment count (💬 N)
- SNAP-ISSUES-015–017: Filter toolbar states (Open/Closed/All)
- SNAP-ISSUES-018–019: Search input active + narrowed results
- SNAP-ISSUES-020–021: Label/assignee overlay rendering
- SNAP-ISSUES-022–023: Pagination loading + cap indicators
- SNAP-ISSUES-024: Breadcrumb
- SNAP-ISSUES-025: Total count header
- SNAP-ISSUES-026: Column headers
- SNAP-ISSUES-027: Selected row ✓
- SNAP-ISSUES-028–029: Active filter indicators in toolbar
- SNAP-ISSUES-030: Status bar hints

### Keyboard Interaction Tests (48 tests)

- KEY-ISSUES-001–006: j/k/Down/Up navigation
- KEY-ISSUES-007–008: Enter opens issue detail
- KEY-ISSUES-009–012: / search, narrowing, case-insensitive, Esc clear
- KEY-ISSUES-013–015: Esc context priority (overlay → search → pop)
- KEY-ISSUES-016–019: G, g g, Ctrl+D, Ctrl+U
- KEY-ISSUES-020–021: R retry behavior
- KEY-ISSUES-022–023: f state filter cycling + API request
- KEY-ISSUES-024–027: L label overlay (open, toggle, apply, multi-select)
- KEY-ISSUES-028–030: a assignee overlay (open, select, unassigned)
- KEY-ISSUES-031: c create form
- KEY-ISSUES-032–035: x close/reopen (optimistic, revert, permission denied)
- KEY-ISSUES-036: Space toggle selection
- KEY-ISSUES-037: q pops screen
- KEY-ISSUES-038–040: Keys in search input (j/f/q type, not action)
- KEY-ISSUES-041: Pagination on scroll to 80%
- KEY-ISSUES-042: Rapid j presses (15× sequential)
- KEY-ISSUES-043: Enter during loading (no-op)
- KEY-ISSUES-044–046: Filter composition (state+label, state+assignee+search, Esc cascade)
- KEY-ISSUES-047–048: Overlay j/k navigation

### Responsive Tests (16 tests)

- RESP-ISSUES-001–004: 80×24 layout, truncation, no headers, collapsed toolbar
- RESP-ISSUES-005–007: 120×40 layout, label truncation, column headers
- RESP-ISSUES-008–009: 200×60 layout, full toolbar
- RESP-ISSUES-010–011: Resize between breakpoints (columns collapse/expand)
- RESP-ISSUES-012: Focus preserved through resize
- RESP-ISSUES-013–014: Resize during search/loading
- RESP-ISSUES-015–016: Resize with overlays open

### Integration Tests (22 tests)

- INT-ISSUES-001–003: Auth expiry, rate limit, network error
- INT-ISSUES-004–005: Pagination complete + cap
- INT-ISSUES-006–007: Navigation round-trips
- INT-ISSUES-008: Server 500
- INT-ISSUES-009–011: Close/reopen optimistic, revert, permission
- INT-ISSUES-012–013: State filter API + pagination reset
- INT-ISSUES-014–016: Deep link, command palette, g i without context
- INT-ISSUES-017: Create and return with refresh
- INT-ISSUES-018: Null fields
- INT-ISSUES-019: Empty labels overlay
- INT-ISSUES-020: Concurrent state filter changes
- INT-ISSUES-021–022: Number formatting, timestamp formatting

### Edge Case Tests (15 tests)

- EDGE-ISSUES-001: No auth token
- EDGE-ISSUES-002–003: Long titles, unicode/emoji
- EDGE-ISSUES-004: Single issue
- EDGE-ISSUES-005: Concurrent resize + navigation
- EDGE-ISSUES-006: Search no matches
- EDGE-ISSUES-007: Null body
- EDGE-ISSUES-008: Comment count edge cases
- EDGE-ISSUES-009–010: Long/unusual label names/colors
- EDGE-ISSUES-011: 100+ labels in overlay
- EDGE-ISSUES-012: Deleted user author
- EDGE-ISSUES-013: Rapid x presses
- EDGE-ISSUES-014: Network disconnect mid-pagination
- EDGE-ISSUES-015: Issue #0

All 111 tests left failing if backend is unimplemented — never skipped or commented out.
