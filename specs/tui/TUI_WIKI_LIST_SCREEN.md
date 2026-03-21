# TUI_WIKI_LIST_SCREEN

Specification for TUI_WIKI_LIST_SCREEN.

## High-Level User POV

The Wiki List screen is the primary wiki browsing surface in the Codeplane TUI. It presents a full-screen view of all wiki pages within a repository, designed for developers who need to browse, search, and manage documentation without leaving the terminal. The screen is reached via the `g k` go-to keybinding from any screen with an active repository context, by selecting "Wiki" in the command palette (`:wiki`), or by launching the TUI with `codeplane tui --screen wiki --repo owner/repo`. It requires a repository context — if no repository is active when `g k` is pressed, the user is first prompted to select a repository from the repo list.

The screen occupies the entire content area between the header bar and status bar. At the top is a title row showing "Wiki" in bold primary color, followed by the total page count in parentheses (e.g., "Wiki (23)"). Below the title is a persistent search toolbar with a text search input that performs server-side full-text search across page titles, slugs, and body content.

The main content area is a scrollable list of wiki page rows. Each row occupies a single line and shows: the page title, the slug in muted text (prefixed with `/`), the author login, and a relative timestamp of the last update. The list is sorted by `updated_at` descending, so the most recently edited pages appear first. When a search query is active, results are sorted by relevance — exact slug match first, then exact title match, then prefix matches on title and slug, then recency within remaining results.

Navigation uses vim-style `j`/`k` keys and arrow keys to move the focus cursor between rows. Pressing `Enter` on a focused wiki page pushes the wiki detail view, which renders the page's full markdown content. Server-side search is activated via `/`, which focuses the search input. The search query is sent to the API as the `q` parameter and performs ILIKE matching across title, slug, and body fields. The search triggers after the user presses `Enter` or after a 300ms debounce pause. Clearing the search input and pressing `Enter` (or `Esc`) resets to the unfiltered list.

The list supports page-based pagination (page size 30, max 50 per page from the API, 500-item memory cap). When the user scrolls past 80% of loaded content, the next page is fetched automatically. Users with write access can create new wiki pages with `c` (pushes the wiki create form) and delete the focused page with `d` (shows an inline confirmation prompt — "Delete 'Page Title'? y/n" — before executing the deletion optimistically). The screen adapts responsively: at 80×24 only the title and timestamp are shown; at 120×40 the slug and author columns appear; at 200×60+ the full column set renders with wider title and slug columns.

## Acceptance Criteria

### Definition of Done
- [ ] The Wiki List screen renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The screen is reachable via `g k` go-to navigation (with repo context), `:wiki` command palette entry, and `--screen wiki --repo owner/repo` deep-link
- [ ] The breadcrumb reads "Dashboard > owner/repo > Wiki"
- [ ] Pressing `q` pops the screen and returns to the repository overview (or previous screen)
- [ ] Wiki pages are fetched via `useWikiPages()` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/wiki` with page-based pagination (default page size 30, max 50)
- [ ] The list defaults to showing all wiki pages sorted by `updated_at` descending
- [ ] Each row displays: title, slug (muted, `/`-prefixed), author login (muted), and relative `updated_at` timestamp (muted)
- [ ] The header shows "Wiki (N)" where N is the `X-Total-Count` from the API response
- [ ] The search toolbar is always visible below the title row
- [ ] Search queries are sent server-side via the `q` query parameter and reset the pagination to page 1
- [ ] Search results are ranked by relevance: exact slug match → exact title match → prefix matches → recency

### Keyboard Interactions
- [ ] `j` / `Down`: Move focus to next wiki page row
- [ ] `k` / `Up`: Move focus to previous wiki page row
- [ ] `Enter`: Open focused wiki page (push wiki detail view)
- [ ] `/`: Focus search input in toolbar
- [ ] `Esc`: Clear search → pop screen (context-dependent priority)
- [ ] `G`: Jump to last loaded wiki page row
- [ ] `g g`: Jump to first wiki page row
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up
- [ ] `R`: Retry failed API request (only in error state)
- [ ] `c`: Push wiki page create form
- [ ] `d`: Delete focused wiki page (with inline confirmation prompt; requires write access)
- [ ] `y`: Confirm delete (only when confirmation is active)
- [ ] `n`: Cancel delete (only when confirmation is active)
- [ ] `q`: Pop screen (not available while search input is focused or confirmation is active)

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: Title (remaining, truncated), timestamp (4ch). Slug/author hidden. Toolbar: search only
- [ ] 120×40 – 199×59: Title (45ch), slug (25ch), author (12ch), timestamp (4ch). Full toolbar
- [ ] 200×60+: Title (70ch), slug (35ch), author (15ch), timestamp (4ch)

### Truncation & Boundary Constraints
- [ ] Wiki page title: truncated with `…` at column width (remaining/45ch/70ch)
- [ ] Slug: `/`-prefixed, truncated with `…` at 25ch (standard) / 35ch (large)
- [ ] Author login: truncated at 12ch (standard) / 15ch (large)
- [ ] Timestamps: max 4ch ("3d", "1w", "2mo", "1y", "now")
- [ ] Search input: max 120ch
- [ ] Memory cap: 500 wiki pages max loaded in scrollbox
- [ ] Total count: abbreviated above 9999 (e.g., "10K")
- [ ] Page title max display: 200ch before hard truncation (prevents layout blowout from malicious data)

### Edge Cases
- [ ] Terminal resize while scrolled: focus preserved, columns recalculate
- [ ] Rapid j/k: sequential, no debounce, one row per keypress
- [ ] Search query change during pagination: cancels in-flight request, resets to page 1
- [ ] Unicode in titles/slugs: truncation respects grapheme clusters
- [ ] Null fields: rendered as blank, no "null" text
- [ ] 500+ wiki pages: pagination cap, footer shows count
- [ ] Delete 403: optimistic reverts, status bar error "Permission denied"
- [ ] Delete confirmation dismissed: no action taken, focus returns to row
- [ ] Empty search results: show "No wiki pages match your search."
- [ ] Server-side search with special characters: query is URL-encoded
- [ ] Deleted user author: show login as "unknown" in muted text
- [ ] Delete 404 (page already deleted): item removed from list, "Page not found" flash

## Design

### Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Wiki                     │
├──────────────────────────────────────────────────────────┤
│ Wiki (23)                                       / search  │
├──────────────────────────────────────────────────────────┤
│ Getting Started                    /getting-started  al…  │
│ API Reference                      /api-reference    bob  │
│ Architecture Overview              /architecture     al…  │
│ Contributing Guide                 /contributing     car… │
│ …                                                         │
│                    Loading more…                           │
├──────────────────────────────────────────────────────────┤
│ Status: j/k:nav Enter:open /:search c:new d:del q:back   │
└──────────────────────────────────────────────────────────┘
```

The screen is composed of: (1) title row "Wiki (N)", (2) persistent search toolbar with text input, (3) `<scrollbox>` with wiki page rows and pagination indicator, (4) empty/error states.

### Components Used
- `<box>` — Vertical/horizontal flexbox containers for layout, rows, toolbar
- `<scrollbox>` — Scrollable wiki page list with scroll-to-end pagination detection at 80%
- `<text>` — Wiki page titles, slugs, author logins, timestamps, counts
- `<input>` — Search input in toolbar (focused via `/`)

### WikiPageRow
Each row renders as a single-line `<box flexDirection="row">`: Title (default text, flex-grows), Slug (muted ANSI 245, `/`-prefixed, hidden at minimum), Author (muted ANSI 245, hidden at minimum), Timestamp (muted ANSI 245, fixed 4ch). Focused row uses reverse video with primary color (ANSI 33).

### Search Toolbar
Below title row, separated by single-line border. Left: "Wiki (N)" bold primary. Right: `/` glyph muted + `<input>` with placeholder "Search wiki…". Submitted on Enter or 300ms debounce.

### Delete Confirmation
Inline prompt replaces focused row: "Delete 'Page Title'? y/n" in warning color (ANSI 178). `y` confirms (optimistic deletion), `n`/`Esc` cancels. Focus trapped until resolved. Only one confirmation active at a time.

### Keybindings
| Key | Action | Condition |
|-----|--------|----------|
| `j`/`Down` | Next row | List focused |
| `k`/`Up` | Previous row | List focused |
| `Enter` | Open wiki page / Submit search | Context |
| `/` | Focus search | List focused |
| `Esc` | Clear search → pop | Priority |
| `G` | Last row | List focused |
| `g g` | First row | List focused |
| `Ctrl+D`/`Ctrl+U` | Page down/up | List focused |
| `R` | Retry | Error state |
| `c` | Create wiki page | List focused |
| `d` | Delete wiki page | Page focused |
| `y` | Confirm delete | Confirmation active |
| `n` | Cancel delete | Confirmation active |
| `q` | Pop screen | Not in input/confirmation |

### Responsive Column Widths
| Breakpoint | Title | Slug | Author | Timestamp |
|-----------|-------|------|--------|----------|
| 80×24 (minimum) | remaining | hidden | hidden | 4ch |
| 120×40 (standard) | 45ch | 25ch | 12ch | 4ch |
| 200×60 (large) | 70ch | 35ch | 15ch | 4ch |

Resize triggers synchronous re-layout, focused row preserved. At minimum breakpoint, search input width reduces to 20ch.

### Data Hooks
- `useWikiPages()` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/wiki?page=N&per_page=30&q=...`
- Response: `WikiPageResponse[]` (id, slug, title, author: {id, login}, created_at, updated_at) with `X-Total-Count` header
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()`, `useRepoContext()` from local TUI

### Navigation
- Enter → `push("wiki-detail", { repo, slug })`
- c → `push("wiki-create", { repo })`
- q → `pop()`

### Pagination
- Page-based (page/per_page, not cursors). Default 30, max 50 (API-enforced)
- Next page at 80% scroll. "Loading more…" indicator. Pages cached. 500-item memory cap with "Showing 500 of N pages" footer

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View wiki list (public repo) | ✅ | ✅ | ✅ | ✅ |
| View wiki list (private repo) | ❌ | ✅ | ✅ | ✅ |
| Open wiki page detail | Same as view | ✅ | ✅ | ✅ |
| Create wiki page | ❌ | ❌ | ✅ | ✅ |
| Delete wiki page | ❌ | ❌ | ✅ | ✅ |

- The Wiki List screen requires an active repository context enforced at navigation level
- `GET /api/repos/:owner/:repo/wiki` respects repository visibility: public repos accessible to all authenticated users; private repos require read access
- Delete (`DELETE /api/repos/:owner/:repo/wiki/:slug`) requires write access. Read-only users see the `d` keybinding but receive "Permission denied" on action
- Wiki page creation requires write access. Read-only users can navigate to create form but submission fails
- The `c` and `d` keybinding hints are shown to all users; permission enforcement happens on the server

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."

### Rate Limiting
- 300 req/min for `GET /api/repos/:owner/:repo/wiki` (list and search)
- 60 req/min for `DELETE /api/repos/:owner/:repo/wiki/:slug`
- 429 responses show inline "Rate limited. Retry in {Retry-After}s."
- No auto-retry; user presses `R` after waiting
- Search queries debounced 300ms client-side to reduce API call frequency

### Input Sanitization
- Search text URL-encoded before API transmission; server uses parameterized SQL (no injection)
- All API-sourced strings rendered as plain `<text>` — no ANSI escape passthrough
- Slugs and titles sanitized of terminal escape sequences before rendering

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.wiki.view` | Screen mounted, data loaded | `repo`, `total_count`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms`, `entry_method` |
| `tui.wiki.open` | Enter on wiki page | `repo`, `wiki_slug`, `position_in_list`, `was_searched`, `search_query_length` |
| `tui.wiki.search` | Search query submitted | `repo`, `query_length`, `match_count`, `total_count`, `search_duration_ms` |
| `tui.wiki.search_clear` | Search cleared | `repo`, `previous_query_length` |
| `tui.wiki.create` | Press c | `repo`, `total_count` |
| `tui.wiki.delete` | Delete confirmed with y | `repo`, `wiki_slug`, `success`, `position_in_list` |
| `tui.wiki.delete_cancel` | Delete cancelled with n/Esc | `repo`, `wiki_slug` |
| `tui.wiki.paginate` | Next page loaded | `repo`, `page_number`, `items_loaded_total`, `total_count`, `has_search_query` |
| `tui.wiki.error` | API failure | `repo`, `error_type`, `http_status`, `request_type` |
| `tui.wiki.retry` | Press R | `repo`, `error_type`, `retry_success` |
| `tui.wiki.empty` | Empty state shown | `repo`, `has_search_query`, `search_query_length` |
| `tui.wiki.data_load_time` | Data loaded | `repo`, `load_ms`, `total_count` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators
| Metric | Target |
|--------|--------|
| Screen load completion | >98% |
| Wiki page open rate | >50% of views |
| Search adoption | >20% of views |
| Create rate | >5% of views |
| Delete rate | >2% of views |
| Error rate | <2% |
| Retry success | >80% |
| Time to interactive | <1.5s |
| Search response time | <500ms |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `Wiki: mounted [repo={r}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Data loaded | `Wiki: loaded [repo={r}] [count={n}] [total={t}] [duration={ms}ms]` |
| `debug` | Search submitted | `Wiki: search [repo={r}] [query_length={n}] [matches={m}] [duration={ms}ms]` |
| `debug` | Search cleared | `Wiki: search cleared [repo={r}]` |
| `debug` | Pagination triggered | `Wiki: pagination [repo={r}] [page={n}]` |
| `info` | Fully loaded | `Wiki: ready [repo={r}] [pages={n}] [total_ms={ms}]` |
| `info` | Page navigated | `Wiki: navigated [repo={r}] [slug={s}] [position={i}]` |
| `info` | Page deleted | `Wiki: deleted [repo={r}] [slug={s}] [success={bool}]` |
| `warn` | Fetch failed | `Wiki: fetch failed [repo={r}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `Wiki: rate limited [repo={r}] [retry_after={s}]` |
| `warn` | Delete failed | `Wiki: delete failed [repo={r}] [slug={s}] [status={code}]` |
| `warn` | Slow load (>3s) | `Wiki: slow load [repo={r}] [duration={ms}ms]` |
| `warn` | Pagination cap | `Wiki: pagination cap [repo={r}] [total={n}] [cap=500]` |
| `error` | Auth error | `Wiki: auth error [repo={r}] [status=401]` |
| `error` | Permission denied | `Wiki: permission denied [repo={r}] [slug={s}] [action={a}]` |
| `error` | Render error | `Wiki: render error [repo={r}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases
| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during load | Layout re-renders; fetch continues | Independent |
| Resize with confirmation open | Confirmation re-renders proportionally | Synchronous |
| SSE disconnect | Status bar indicator; wiki list unaffected (no SSE dependency) | SSE provider reconnects |
| Auth expiry | Next API call → 401 → auth error screen | Re-auth via CLI |
| Network timeout (30s) | Loading → error + "Press R" | User retries |
| Delete 403 | Optimistic reverts; status bar flash "Permission denied" | Informational |
| Delete 404 | Page removed from list; "Page not found" flash | List state updated |
| Search during pagination | Cancels in-flight pagination, issues fresh search request | Cancel semantics |
| No color support | Text-only rendering; focused row uses `>` prefix marker | Theme detection |
| Memory cap (500) | Stop pagination; show cap message | Client-side cap |
| Delete during search | Item removed from search results; total count decremented | Optimistic update |

### Failure Modes
- Component crash → global error boundary → "Press r to restart"
- Delete confirmation crash → confirmation dismissed, error flash; user retries
- All API fails → error state; c/q still work for navigation
- Slow network → spinner shown; user navigates away via go-to or palette

## Verification

### Test File: `e2e/tui/wiki.test.ts`

### Terminal Snapshot Tests (22 tests)

- SNAP-WIKI-001: Wiki list at 120×40 with populated pages — full layout, headers, columns, focus highlight
- SNAP-WIKI-002: Wiki list at 80×24 minimum — title and timestamp only
- SNAP-WIKI-003: Wiki list at 200×60 large — all columns with wider widths
- SNAP-WIKI-004: Empty state (zero wiki pages) — "No wiki pages yet. Press c to create one."
- SNAP-WIKI-005: No search matches — "No wiki pages match your search."
- SNAP-WIKI-006: Loading state — "Loading wiki pages…" with title/toolbar visible
- SNAP-WIKI-007: Error state — red error with "Press R to retry"
- SNAP-WIKI-008: Focused row highlight — primary accent reverse video (ANSI 33)
- SNAP-WIKI-009: Slug column rendering with `/` prefix in muted color (ANSI 245)
- SNAP-WIKI-010: Author column rendering in muted color (ANSI 245)
- SNAP-WIKI-011: Search input active with query text
- SNAP-WIKI-012: Search results with narrowed list and updated count
- SNAP-WIKI-013: Delete confirmation prompt inline — "Delete 'Page Title'? y/n" in warning color (ANSI 178)
- SNAP-WIKI-014: Pagination loading indicator — "Loading more…" at bottom
- SNAP-WIKI-015: Pagination cap indicator — "Showing 500 of N pages"
- SNAP-WIKI-016: Breadcrumb — "Dashboard > owner/repo > Wiki"
- SNAP-WIKI-017: Total count header — "Wiki (23)"
- SNAP-WIKI-018: Single page in list
- SNAP-WIKI-019: Long title truncation with ellipsis
- SNAP-WIKI-020: Long slug truncation with ellipsis
- SNAP-WIKI-021: Status bar hints — "j/k:nav Enter:open /:search c:new d:del q:back"
- SNAP-WIKI-022: Search toolbar with placeholder "Search wiki…"

### Keyboard Interaction Tests (38 tests)

- KEY-WIKI-001: j moves focus down one row
- KEY-WIKI-002: k moves focus up one row
- KEY-WIKI-003: Down arrow moves focus down one row
- KEY-WIKI-004: Up arrow moves focus up one row
- KEY-WIKI-005: j at bottom of loaded list does not wrap
- KEY-WIKI-006: k at top of list does not wrap
- KEY-WIKI-007: Enter opens wiki detail view with correct slug
- KEY-WIKI-008: Enter on focused row passes correct repo and slug to navigation
- KEY-WIKI-009: / focuses search input
- KEY-WIKI-010: Typing in search input updates query text
- KEY-WIKI-011: Enter in search input submits query to API with `q` parameter
- KEY-WIKI-012: Esc in search clears query and returns focus to list
- KEY-WIKI-013: Esc with empty search pops screen
- KEY-WIKI-014: Esc during delete confirmation closes confirmation without deleting
- KEY-WIKI-015: Esc priority: confirmation → search → pop
- KEY-WIKI-016: G jumps to last loaded row
- KEY-WIKI-017: g g jumps to first row
- KEY-WIKI-018: Ctrl+D pages down
- KEY-WIKI-019: Ctrl+U pages up
- KEY-WIKI-020: R retries failed API request
- KEY-WIKI-021: R is no-op when not in error state
- KEY-WIKI-022: c pushes wiki create form
- KEY-WIKI-023: d shows inline delete confirmation on focused row
- KEY-WIKI-024: y in delete confirmation confirms deletion (optimistic removal)
- KEY-WIKI-025: n in delete confirmation cancels and restores row
- KEY-WIKI-026: Delete with 403 response reverts optimistic removal and shows error
- KEY-WIKI-027: q pops screen
- KEY-WIKI-028: j/k in search input type characters, don't navigate list
- KEY-WIKI-029: q in search input types 'q', doesn't pop screen
- KEY-WIKI-030: Enter in search input submits query, doesn't open page
- KEY-WIKI-031: Pagination triggers on scroll to 80%
- KEY-WIKI-032: Rapid j presses (15× sequential, each moves one row)
- KEY-WIKI-033: Enter during loading state is no-op
- KEY-WIKI-034: d during loading state is no-op
- KEY-WIKI-035: Search then j/k navigates through search results
- KEY-WIKI-036: Search then Esc resets to unfiltered list with fresh API call
- KEY-WIKI-037: Delete while search active removes item from search results
- KEY-WIKI-038: g g after scrolling to page 3 jumps to first row

### Responsive Tests (14 tests)

- RESP-WIKI-001: 80×24 layout shows only title and timestamp columns
- RESP-WIKI-002: 80×24 hides slug and author columns
- RESP-WIKI-003: 80×24 search input width is 20ch
- RESP-WIKI-004: 120×40 layout shows title, slug, author, timestamp
- RESP-WIKI-005: 120×40 title truncates at 45ch
- RESP-WIKI-006: 120×40 slug truncates at 25ch
- RESP-WIKI-007: 200×60 layout shows full column widths (title 70ch, slug 35ch, author 15ch)
- RESP-WIKI-008: 200×60 title does not truncate for short titles
- RESP-WIKI-009: Resize from 120×40 to 80×24 collapses slug and author columns
- RESP-WIKI-010: Resize from 80×24 to 120×40 expands slug and author columns
- RESP-WIKI-011: Focus preserved through resize
- RESP-WIKI-012: Resize during search preserves query and results
- RESP-WIKI-013: Resize during loading re-renders spinner
- RESP-WIKI-014: Resize with delete confirmation re-renders confirmation inline

### Integration Tests (18 tests)

- INT-WIKI-001: Auth expiry during list fetch shows auth error screen
- INT-WIKI-002: Rate limit 429 shows inline "Rate limited. Retry in {N}s."
- INT-WIKI-003: Network timeout shows error state with retry hint
- INT-WIKI-004: Pagination loads next page of 30 items
- INT-WIKI-005: Pagination stops at 500-item memory cap with cap message
- INT-WIKI-006: Navigate to detail and back preserves scroll position
- INT-WIKI-007: Navigate to detail and back preserves search query
- INT-WIKI-008: Server 500 shows error state
- INT-WIKI-009: Delete success removes page and decrements total count
- INT-WIKI-010: Delete 403 reverts optimistic removal and shows "Permission denied"
- INT-WIKI-011: Search sends `q` parameter to API and renders server-filtered results
- INT-WIKI-012: Search clear resets `q` parameter and re-fetches unfiltered list
- INT-WIKI-013: Deep link `--screen wiki --repo owner/repo` opens correctly
- INT-WIKI-014: Command palette `:wiki` navigates to wiki list
- INT-WIKI-015: `g k` without repo context prompts for repo selection
- INT-WIKI-016: Create page and return refreshes list with new page at top
- INT-WIKI-017: Null/missing author field shows "unknown" in muted text
- INT-WIKI-018: Concurrent search and pagination — search cancels in-flight pagination

### Edge Case Tests (13 tests)

- EDGE-WIKI-001: No auth token propagates to auth error screen
- EDGE-WIKI-002: Long title (200+ characters) truncates with ellipsis
- EDGE-WIKI-003: Unicode/emoji in titles and slugs truncates at grapheme boundary
- EDGE-WIKI-004: Single wiki page in repository renders correctly
- EDGE-WIKI-005: Concurrent resize + navigation does not crash
- EDGE-WIKI-006: Search with special characters (%, _, quotes) works correctly via URL encoding
- EDGE-WIKI-007: Deleted user author shows "unknown" in muted text
- EDGE-WIKI-008: Rapid d presses only open one confirmation at a time
- EDGE-WIKI-009: Delete last page in list moves focus to previous row (or shows empty state)
- EDGE-WIKI-010: Network disconnect mid-pagination shows error at list bottom
- EDGE-WIKI-011: Empty slug from API renders as "/" only
- EDGE-WIKI-012: Search query at max length (120ch) accepted
- EDGE-WIKI-013: Delete during pagination loading — confirmation still appears, pagination continues in background

All 105 tests left failing if backend is unimplemented — never skipped or commented out.
