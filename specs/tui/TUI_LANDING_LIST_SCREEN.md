# TUI_LANDING_LIST_SCREEN

Specification for TUI_LANDING_LIST_SCREEN.

## High-Level User POV

The Landing List screen is the primary landing request management surface in the Codeplane TUI. Landing requests are Codeplane's jj-native alternative to pull requests, representing stacked changes that are proposed for landing (merging) into a target bookmark. The screen presents a full-screen, keyboard-driven view of all landing requests within a repository, designed for developers who need to review, triage, and manage their landing queue without leaving the terminal.

The screen is reached via the `g l` go-to keybinding from any screen with an active repository context, by selecting "Landings" in the command palette (`:landings`), or by launching the TUI with `codeplane tui --screen landings --repo owner/repo`. It requires a repository context — if no repository is active when `g l` is pressed, the user is first prompted to select a repository from the repo list.

The screen occupies the entire content area between the header bar and status bar. At the top is a title row showing "Landings" in bold primary color, followed by the total landing request count in parentheses (e.g., "Landings (37)"). Below the title is a persistent filter toolbar that displays the current state filter and a text search input. The state filter defaults to "Open" and can be cycled through Open, Draft, Closed, Merged, and All.

The main content area is a scrollable list of landing request rows. Each row occupies a single line and shows: the landing state icon (▲ green for open, ▲ gray for draft, ▲ red for closed, ▲ purple for merged), the landing number (#12), the landing title, the target bookmark name (e.g., `→ main`), the conflict status indicator (✓ clean, ✗ conflicted, ? unknown), the change stack size (e.g., "3 changes"), the author login, and a relative timestamp. Navigation uses vim-style `j`/`k` keys and arrow keys. Pressing `Enter` on a focused landing pushes the landing detail view.

State filtering is accessible via `f`, which cycles through: "Open" (default), "Draft", "Closed", "Merged", and "All". Text search via `/` focuses the search input for client-side substring matching against titles and author names. These filters compose.

The list supports cursor-based pagination (page size 30, 500-item memory cap). Users can create new landing requests with `c`, close/reopen with `x` (optimistic), and queue for landing with `m` (when the focused landing is open and mergeable). The screen adapts responsively: at 80×24 only essential columns are shown; at 120×40 the target bookmark, conflict status, and author appear; at 200×60+ the full column set including stack size and review summary renders.

Landing requests are a jj-native concept. Unlike traditional pull requests, they represent a stack of changes (not a single branch diff) targeting a bookmark. The conflict status reflects jj's native conflict tracking — changes can be in a conflicted state without failing to apply. This screen surfaces these jj-native concepts directly to terminal users in a way that feels natural alongside vim-style navigation.

## Acceptance Criteria

### Definition of Done
- [ ] The Landing List screen renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The screen is reachable via `g l` go-to navigation (with repo context), `:landings` command palette entry, and `--screen landings --repo owner/repo` deep-link
- [ ] The breadcrumb reads "Dashboard > owner/repo > Landings"
- [ ] Pressing `q` pops the screen and returns to the repository overview (or previous screen)
- [ ] Landings are fetched via `useLandings()` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/landings` with page-based pagination (default page size 30, state filter `open` by default)
- [ ] The list defaults to showing open landing requests sorted by `number` descending (newest first)
- [ ] Each row displays: state icon (▲ colored), landing number (#N), title, target bookmark (→ name), conflict status indicator, stack size, author login, and relative `updated_at` timestamp
- [ ] The header shows "Landings (N)" where N is the `X-Total-Count` from the API response
- [ ] The filter toolbar is always visible below the title row
- [ ] State filter changes trigger a fresh API request with the new `state` query parameter and reset the pagination cursor

### Keyboard Interactions
- [ ] `j` / `Down`: Move focus to next landing row
- [ ] `k` / `Up`: Move focus to previous landing row
- [ ] `Enter`: Open focused landing (push landing detail view)
- [ ] `/`: Focus search input in filter toolbar
- [ ] `Esc`: Close overlay; or clear search; or pop screen (context-dependent priority)
- [ ] `G`: Jump to last loaded landing row
- [ ] `g g`: Jump to first landing row
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up
- [ ] `R`: Retry failed API request (only in error state)
- [ ] `f`: Cycle state filter (Open → Draft → Closed → Merged → All → Open)
- [ ] `c`: Push landing create form
- [ ] `x`: Close/reopen focused landing (optimistic toggle, only for open/closed states)
- [ ] `m`: Queue focused landing for merge (only when state is open and conflict_status is clean)
- [ ] `Space`: Toggle row selection
- [ ] `q`: Pop screen (when not in input mode)

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: State icon (2ch), number (6ch), title (remaining, truncated), timestamp (4ch). Target bookmark/conflict/author/stack hidden. Toolbar: state + search only
- [ ] 120×40 – 199×59: State icon (2ch), number (6ch), title (40ch), target bookmark (12ch), conflict status (3ch), author (12ch), timestamp (4ch). Stack size hidden. Full toolbar
- [ ] 200×60+: All columns including stack size (10ch). Title 60ch. Target bookmark 18ch. Author 15ch

### Truncation & Boundary Constraints
- [ ] Landing title: truncated with `…` at column width (remaining/40ch/60ch)
- [ ] Landing number: `#N` format, max 6ch (up to #99999)
- [ ] Target bookmark: truncated with `…` at 12ch (standard) / 18ch (large), prefixed with `→`
- [ ] Author login: truncated at 12ch (standard) / 15ch (large)
- [ ] Stack size: displayed as "N chg" (max 10ch), abbreviated "99+ chg" above 99
- [ ] Conflict status: single icon character — ✓ (clean), ✗ (conflicted), ? (unknown), max 3ch with padding
- [ ] Timestamps: max 4ch ("3d", "1w", "2mo", "1y", "now")
- [ ] Search input: max 120ch
- [ ] Memory cap: 500 landing requests max
- [ ] Total count: abbreviated above 9999 (e.g., "10K")

### Edge Cases
- [ ] Terminal resize while scrolled: focus preserved, columns recalculate
- [ ] Rapid j/k: sequential, no debounce, one row per keypress
- [ ] State filter change during pagination: cancels in-flight, resets cursor
- [ ] Unicode in titles: truncation respects grapheme clusters
- [ ] Null fields: rendered as blank, no "null" text (e.g., null author shows "—")
- [ ] 500+ landings: pagination cap, footer shows count
- [ ] Close/reopen 403: optimistic reverts, status bar error
- [ ] Queue for merge 409 (conflict): status bar shows "Landing has conflicts, cannot merge"
- [ ] Queue for merge 403 (no permission): status bar shows "Permission denied"
- [ ] Queue for merge on non-open landing: no-op, status bar flash "Only open landings can be merged"
- [ ] Draft state landing: `x` transitions draft → closed, not draft → open
- [ ] Merged state landing: `x` is a no-op (merged is terminal state)
- [ ] Empty change_ids array: stack size shows "0 chg"
- [ ] Target bookmark name with special characters or long names: truncated safely
- [ ] Network disconnect mid-pagination: error state for that page, previously loaded items retained

## Design

### Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Landings                │
├──────────────────────────────────────────────────────────┤
│ Landings (37)                                   / search │
│ State: Open                                              │
├──────────────────────────────────────────────────────────┤
│ ▲ #37  Implement auth token refresh     → main  ✓ alice │
│ ▲ #35  Add workspace suspend/resume     → main  ✗ bob   │
│ ▲ #34  Fix diff view scroll sync        → main  ✓ carol │
│ ▲ #31  Refactor landing service         → dev   ? dave  │
│ …                                                        │
│                    Loading more…                          │
├──────────────────────────────────────────────────────────┤
│ Status: j/k:nav Enter:open f:state /:search c:new q:back│
└──────────────────────────────────────────────────────────┘
```

At standard (120×40) terminal size, with all visible columns:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Landings                                     │
├───────────────────────────────────────────────────────────────────────────────┤
│ Landings (37)                                                        / search │
│ State: Open                                                                   │
├───────────────────────────────────────────────────────────────────────────────┤
│  #   Title                                   Target       ⚡  Author     Age  │
│ ▲ #37  Implement auth token refresh          → main        ✓  alice      2h  │
│ ▲ #35  Add workspace suspend/resume          → main        ✗  bob        1d  │
│ ▲ #34  Fix diff view scroll sync             → main        ✓  carol      1d  │
│ ▲ #31  Refactor landing service              → dev         ?  dave       3d  │
│ ▲ #28  Update notification SSE handler       → main        ✓  alice      1w  │
│ …                                                                             │
├───────────────────────────────────────────────────────────────────────────────┤
│ j/k:navigate  Enter:open  f:state  /:search  c:new  m:merge  x:close  q:back │
└───────────────────────────────────────────────────────────────────────────────┘
```

The screen is composed of: (1) title row "Landings (N)", (2) persistent filter toolbar with state filter and search, (3) column header row (standard+ sizes), (4) `<scrollbox>` with landing rows and pagination, (5) empty/error states.

### Components Used
- `<box>` — Vertical/horizontal flexbox containers for layout, rows, toolbar
- `<scrollbox>` — Scrollable landing list with scroll-to-end pagination detection at 80%
- `<text>` — Landing titles, numbers, timestamps, bookmark names, author logins, conflict indicators
- `<input>` — Search input in filter toolbar (focused via `/`)

### LandingRow

State icon (▲ green/gray/red/magenta), #number (muted), title, target bookmark `→ name` (cyan, muted), conflict status icon (✓ green / ✗ red / ? yellow), stack size "N chg" (muted), author (muted), timestamp (muted). Focused row uses reverse video with primary color.

State icon color mapping:
- Open: ▲ green (ANSI 34)
- Draft: ▲ gray (ANSI 245)
- Closed: ▲ red (ANSI 196)
- Merged: ▲ magenta (ANSI 135)

Conflict status icon mapping:
- Clean: ✓ green (ANSI 34)
- Conflicted: ✗ red (ANSI 196)
- Unknown: ? yellow (ANSI 178)

### Column Header Row

Visible at 120×40+ sizes. Rendered in muted color (ANSI 245), with underline border separator below. Columns: `#`, `Title`, `Target`, `⚡` (conflict), `Author`, `Age`. At 200×60+ adds `Stack` column.

### Filter Toolbar

Always visible below the title row. Shows current state filter as a labeled chip: `State: Open` in primary color. The state cycles through five values via `f`: Open → Draft → Closed → Merged → All. Active non-default state shown with highlighted background.

Search input on the right side of the title row, accessible via `/`. Performs client-side substring matching against landing title and author login.

### Empty States

- No landings exist: "No landing requests yet. Press `c` to create one."
- No filter matches: "No landing requests match the current filters."
- Error state: Red error message with "Press `R` to retry."

### Keybindings

| Key | Action | Condition |
|-----|--------|-----------||
| `j`/`Down` | Next row | List focused |
| `k`/`Up` | Previous row | List focused |
| `Enter` | Open landing detail | Landing focused |
| `/` | Focus search | List focused |
| `Esc` | Close overlay → clear search → pop | Priority chain |
| `G` | Last row | List focused |
| `g g` | First row | List focused |
| `Ctrl+D`/`Ctrl+U` | Page down/up | List focused |
| `R` | Retry | Error state |
| `f` | Cycle state filter | List focused |
| `c` | Create landing | List focused |
| `x` | Close/reopen | Landing focused (not merged) |
| `m` | Queue for merge | Open landing with clean conflicts |
| `Space` | Toggle selection | Landing focused |
| `q` | Pop screen | Not in input |

### Responsive

80×24 = icon+number+title+time; 120×40 = +target+conflict+author+column headers; 200×60 = +stack size. Resize triggers synchronous re-layout, focused row preserved.

### Data Hooks
- `useLandings()` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/landings?state=open&page=N&per_page=30`
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()`, `useRepoContext()` from local TUI

### Pagination

Page-based pagination using the API's `page` and `per_page` query parameters. `X-Total-Count` response header provides the total count. `Link` response header provides next/prev page URLs. Scrollbox scroll-to-end detection at 80% triggers loading the next page. Page size is 30. Memory cap is 500 items — after 500 loaded, pagination stops and a footer message shows "Showing 500 of N landing requests."

### Navigation

Enter → `push("landing-detail", { repo, number })`. `c` → `push("landing-create", { repo })`. `m` → `PUT /api/repos/:owner/:repo/landings/:number/land` with confirmation then refresh. `q` → `pop()`.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View landing list (public repo) | ✅ | ✅ | ✅ | ✅ |
| View landing list (private repo) | ❌ | ✅ | ✅ | ✅ |
| Open landing detail | Same as view | ✅ | ✅ | ✅ |
| Create landing request | ❌ | ❌ | ✅ | ✅ |
| Close/reopen landing request | ❌ | ❌ | ✅ | ✅ |
| Queue for merge | ❌ | ❌ | ✅ | ✅ |

- The Landing List screen requires an active repository context. Repository context is enforced at navigation level
- `GET /api/repos/:owner/:repo/landings` respects repository visibility: public repos accessible to all authenticated users; private repos require read access
- Close/reopen (`PATCH /api/repos/:owner/:repo/landings/:number`) requires write access. Read-only users see the `x` keybinding but receive "Permission denied" on action
- Queue for merge (`PUT /api/repos/:owner/:repo/landings/:number/land`) requires write access. If the target bookmark is protected, the required approval count must be met
- Landing creation requires write access. Read-only users can navigate to create form but submission fails

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen

### Rate Limiting
- 300 req/min for `GET /api/repos/:owner/:repo/landings`
- 60 req/min for PATCH (close/reopen) and PUT (land) operations
- 429 responses show inline "Rate limited. Retry in {Retry-After}s."
- No auto-retry; user presses `R` after waiting

### Input Sanitization
- Search text is client-side only — never sent to API
- State filter values from fixed enum ("open", "draft", "closed", "merged", "") — no user strings reach API
- Landing titles and author logins rendered as plain `<text>` (no injection vector in terminal)
- Bookmark names rendered as plain text (no escape injection)

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.landings.view` | Screen mounted, data loaded | `repo`, `total_count`, `state_filter`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_method` |
| `tui.landings.open` | Enter on landing | `repo`, `landing_number`, `landing_state`, `conflict_status`, `stack_size`, `position_in_list`, `was_filtered`, `state_filter` |
| `tui.landings.state_filter_change` | Press f | `repo`, `new_state`, `previous_state`, `total_count_for_new_state` |
| `tui.landings.search` | Type in search | `repo`, `query_length`, `match_count`, `total_loaded_count` |
| `tui.landings.create` | Press c | `repo`, `current_state_filter` |
| `tui.landings.close` | Press x (close) | `repo`, `landing_number`, `success`, `position_in_list` |
| `tui.landings.reopen` | Press x (reopen) | `repo`, `landing_number`, `success`, `position_in_list` |
| `tui.landings.merge` | Press m | `repo`, `landing_number`, `success`, `conflict_status`, `stack_size` |
| `tui.landings.paginate` | Next page loaded | `repo`, `page_number`, `items_loaded_total`, `total_count`, `state_filter` |
| `tui.landings.error` | API failure | `repo`, `error_type`, `http_status`, `request_type` |
| `tui.landings.retry` | Press R | `repo`, `error_type`, `retry_success` |
| `tui.landings.empty` | Empty state shown | `repo`, `state_filter`, `has_search_text` |
| `tui.landings.data_load_time` | All data loaded | `repo`, `landings_ms`, `total_ms` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Screen load completion | >98% |
| Landing open rate | >65% of views |
| State filter usage | >35% of views |
| Search adoption | >12% of views |
| Merge action rate | >8% of views |
| Close/reopen rate | >4% of views |
| Create rate | >5% of views |
| Error rate | <2% |
| Retry success | >80% |
| Time to interactive | <1.5s |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `Landings: mounted [repo={r}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Data loaded | `Landings: loaded [repo={r}] [count={n}] [total={t}] [state={s}] [duration={ms}ms]` |
| `debug` | Search/filter changes | `Landings: search [repo={r}] [query_length={n}] [matches={m}]` |
| `debug` | State filter changed | `Landings: state filter [repo={r}] [from={old}] [to={new}]` |
| `debug` | Pagination triggered | `Landings: pagination [repo={r}] [page={n}]` |
| `info` | Fully loaded | `Landings: ready [repo={r}] [landings={n}] [total_ms={ms}]` |
| `info` | Landing navigated | `Landings: navigated [repo={r}] [number={n}] [position={i}]` |
| `info` | Landing state changed | `Landings: state changed [repo={r}] [number={n}] [action={close|reopen}] [success={bool}]` |
| `info` | Landing queued for merge | `Landings: merge queued [repo={r}] [number={n}] [success={bool}]` |
| `warn` | Fetch failed | `Landings: fetch failed [repo={r}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `Landings: rate limited [repo={r}] [retry_after={s}]` |
| `warn` | Action failed | `Landings: action failed [repo={r}] [number={n}] [action={a}] [status={code}]` |
| `warn` | Slow load (>3s) | `Landings: slow load [repo={r}] [duration={ms}ms]` |
| `warn` | Pagination cap | `Landings: pagination cap [repo={r}] [total={n}] [cap=500]` |
| `error` | Auth error | `Landings: auth error [repo={r}] [status=401]` |
| `error` | Permission denied | `Landings: permission denied [repo={r}] [number={n}] [action={a}]` |
| `error` | Render error | `Landings: render error [repo={r}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during load | Layout re-renders; fetch continues | Independent |
| Resize with search focused | Search input resizes; text preserved | Synchronous |
| SSE disconnect | Status bar indicator; landing list unaffected (list is HTTP, not SSE) | SSE provider reconnects |
| Auth expiry | Next API call → 401 → auth error screen | Re-auth via CLI |
| Network timeout (30s) | Loading → error + "Press R" | User retries |
| Close/reopen 403 | Optimistic reverts; status bar flash "Permission denied" | Informational |
| Merge 409 (conflict) | Status bar flash "Landing has conflicts" | User resolves conflicts first |
| Merge 409 (not open) | Status bar flash "Landing is not in open state" | Informational |
| Merge 202 accepted | Status bar flash "Landing #N queued for merge" | Optimistic state update to "merged" |
| Rapid f cycling | Each change cancels previous request | Cancel semantics |
| No color support | Text markers [O]/[D]/[C]/[M] replace ▲ icons | Theme detection |
| Memory cap (500) | Stop pagination; show cap message | Client-side cap |

### Failure Modes
- Component crash → global error boundary → "Press r to restart"
- All API fails → error state; c/q still work for navigation
- Slow network → spinner shown; user navigates away via go-to or palette
- Merge action fails → status bar error flash, row state unchanged

## Verification

### Test File: `e2e/tui/landings.test.ts`

### Terminal Snapshot Tests (28 tests)

- SNAP-LAND-001: Landing list at 120×40 with populated landings — full layout, headers, columns, focus highlight
- SNAP-LAND-002: Landing list at 80×24 minimum — icon, number, title, timestamp only
- SNAP-LAND-003: Landing list at 200×60 large — all columns including stack size
- SNAP-LAND-004: Empty state (zero landing requests) — "No landing requests yet. Press c to create one."
- SNAP-LAND-005: No filter matches — "No landing requests match the current filters."
- SNAP-LAND-006: Loading state — "Loading landings…" with title/toolbar visible
- SNAP-LAND-007: Error state — red error with "Press R to retry"
- SNAP-LAND-008: Focused row highlight — primary accent (ANSI 33)
- SNAP-LAND-009: Open landing state icons — ▲ green (ANSI 34)
- SNAP-LAND-010: Draft landing state icons — ▲ gray (ANSI 245)
- SNAP-LAND-011: Closed landing state icons — ▲ red (ANSI 196)
- SNAP-LAND-012: Merged landing state icons — ▲ magenta (ANSI 135)
- SNAP-LAND-013: Target bookmark column — "→ main" in cyan
- SNAP-LAND-014: Conflict status clean — ✓ green icon
- SNAP-LAND-015: Conflict status conflicted — ✗ red icon
- SNAP-LAND-016: Conflict status unknown — ? yellow icon
- SNAP-LAND-017: Stack size column — "3 chg" format
- SNAP-LAND-018–022: Filter toolbar states (Open/Draft/Closed/Merged/All)
- SNAP-LAND-023–024: Search input active + narrowed results
- SNAP-LAND-025–026: Pagination loading + cap indicators
- SNAP-LAND-027: Breadcrumb "Dashboard > owner/repo > Landings"
- SNAP-LAND-028: Status bar hints

### Keyboard Interaction Tests (44 tests)

- KEY-LAND-001–006: j/k/Down/Up navigation (single, boundary at top/bottom, wrapping)
- KEY-LAND-007–008: Enter opens landing detail view
- KEY-LAND-009–012: / search, narrowing, case-insensitive match, Esc clears search
- KEY-LAND-013–015: Esc context priority (search active → clear; nothing active → pop)
- KEY-LAND-016–019: G (last row), g g (first row), Ctrl+D (page down), Ctrl+U (page up)
- KEY-LAND-020–021: R retry behavior (retries fetch; no-op when not in error state)
- KEY-LAND-022–026: f state filter cycling (Open→Draft→Closed→Merged→All→Open) with API request verification
- KEY-LAND-027: c pushes landing create form
- KEY-LAND-028–031: x close/reopen (optimistic update, revert on 403, no-op on merged, draft→closed)
- KEY-LAND-032–035: m merge (successful 202, conflict 409, permission 403, no-op on non-open)
- KEY-LAND-036: Space toggle selection
- KEY-LAND-037: q pops screen
- KEY-LAND-038–040: Keys in search input (j/f/q type into input, not trigger action)
- KEY-LAND-041: Pagination on scroll to 80%
- KEY-LAND-042: Rapid j presses (15× sequential)
- KEY-LAND-043: Enter during loading (no-op)
- KEY-LAND-044: Filter + search composition (state filter + search text filter together)

### Responsive Tests (14 tests)

- RESP-LAND-001–003: 80×24 layout (icon+number+title+time only), truncation, no column headers
- RESP-LAND-004–006: 120×40 layout (adds target, conflict, author), column headers visible, toolbar full
- RESP-LAND-007–008: 200×60 layout (adds stack size), full width columns
- RESP-LAND-009–010: Resize between breakpoints (columns collapse/expand)
- RESP-LAND-011: Focus preserved through resize
- RESP-LAND-012: Resize during search (search input + text preserved)
- RESP-LAND-013: Resize during loading state
- RESP-LAND-014: Resize with long title truncation change

### Integration Tests (20 tests)

- INT-LAND-001–003: Auth expiry (401 → auth screen), rate limit (429 → message), network error (timeout → error state)
- INT-LAND-004–005: Pagination complete (all pages loaded) + cap (500 items shown, cap message)
- INT-LAND-006–007: Navigation round-trips (list → detail → back preserves scroll + focus)
- INT-LAND-008: Server 500 → error state with retry
- INT-LAND-009–011: Close/reopen optimistic update, revert on failure, permission denied
- INT-LAND-012–013: State filter changes API params + pagination reset
- INT-LAND-014–016: Deep link `--screen landings`, command palette `:landings`, `g l` without repo context
- INT-LAND-017: Create landing and return with refresh (new landing appears at top)
- INT-LAND-018: Merge action → 202 accepted → state updates optimistically
- INT-LAND-019: Merge action → 409 conflict → status bar error, no state change
- INT-LAND-020: Concurrent state filter changes (rapid f presses cancel in-flight requests)

### Edge Case Tests (15 tests)

- EDGE-LAND-001: No auth token → auth error screen
- EDGE-LAND-002–003: Long titles (100+ chars), unicode/emoji in titles
- EDGE-LAND-004: Single landing request in list
- EDGE-LAND-005: Concurrent resize + navigation
- EDGE-LAND-006: Search no matches (shows empty filter message)
- EDGE-LAND-007: Null body field renders gracefully
- EDGE-LAND-008: Stack size of 0 changes
- EDGE-LAND-009: Very long bookmark name truncation
- EDGE-LAND-010: Author login with special characters
- EDGE-LAND-011: Rapid x presses on same landing (idempotent)
- EDGE-LAND-012: Rapid m presses on same landing (idempotent, first wins)
- EDGE-LAND-013: Network disconnect mid-pagination (partial list preserved)
- EDGE-LAND-014: Landing #0 edge case
- EDGE-LAND-015: All conflict statuses in single list (mix of clean, conflicted, unknown)

All 121 tests left failing if backend is unimplemented — never skipped or commented out.
