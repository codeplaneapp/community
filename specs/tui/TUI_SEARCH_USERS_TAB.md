# TUI_SEARCH_USERS_TAB

Specification for TUI_SEARCH_USERS_TAB.

## High-Level User POV

The Users tab is the third tab on the global search screen, providing cross-instance user discovery. When a developer types a query on the search screen and switches to the Users tab (by pressing `3`, or cycling with `Tab`/`Shift+Tab`), the results list shows all matching Codeplane users whose username or display name matches the query. This is the only tab on the search screen that is not scoped by repository visibility — every active user matching the query appears regardless of whether the searcher shares any repository access with them. This makes the Users tab the primary way to find collaborators, assign reviewers, and discover team members across the Codeplane instance from a terminal session.

Each result row is rendered as a single line. The username is displayed in the primary color (ANSI blue, 33) and is always visible. The display name, when present, follows the username in parentheses rendered in muted color (ANSI gray, 245). If the user has no display name set, only the username appears. There is no avatar rendering — the TUI is a text-only environment. The focused result row is highlighted with reverse video to indicate cursor position. The user scrolls through results with `j`/`k` (or arrow keys), pages with `Ctrl+D`/`Ctrl+U`, and jumps to the top or bottom with `g g` and `G`.

Pressing `Enter` on a focused user result navigates to that user's profile screen, pushing it onto the navigation stack. The search screen remains underneath — pressing `q` from the profile returns the user to the search screen with the query, active tab (Users), scroll position, and focused item all preserved. This round-trip pattern supports the iterative discovery workflow: search → inspect user → return → inspect another user.

The Users tab count badge updates as soon as the user search API responds. If the search returns zero users, the tab still shows "(0)" and is still selectable. When the Users tab is active with zero results, the content area displays "No users match '{query}'." in muted color. The tab label format varies by terminal size: "Users(N)" at 80×24, "Users (N)" with pipe separators at 120×40 and above.

Pagination works automatically: when the user scrolls past 80% of loaded results, the next page is fetched from the server and appended. Pagination stops after 300 loaded items (10 pages of 30). A "Loading more…" indicator appears at the bottom of the list during page fetches. The total count badge on the tab reflects the server's `total_count`, not the number of loaded items — so a user might see "Users (847)" even though only 30 items are loaded initially.

The Users tab is a read-only discovery surface. There are no mutation actions (no follow/unfollow, no invite, no admin actions). The only interaction verbs are navigation (browse the list) and selection (press `Enter` to view profile). This simplicity keeps the tab fast and predictable.

## Acceptance Criteria

### Definition of Done

- [ ] The Users tab is accessible by pressing `3` from the search results list
- [ ] The Users tab is accessible by cycling with `Tab`/`Shift+Tab` from adjacent tabs
- [ ] The Users tab is the third tab in the tab bar, positioned between Issues and Code
- [ ] The Users tab count badge updates with `total_count` from `GET /api/search/users`
- [ ] The Users tab count badge shows `(0)` when no users match the query
- [ ] The Users tab is selectable even when the count is zero
- [ ] The Users tab auto-selects when it is the first tab with non-zero results (per TUI_SEARCH_SCREEN rules)
- [ ] The Users tab retains its own independent scroll position and focused item index across tab switches
- [ ] User results render as single-line rows: username in `primary` color, display_name in `muted` color in parentheses
- [ ] Users without a display_name show only the username (no empty parentheses)
- [ ] The focused result row is highlighted with reverse video
- [ ] `j`/`k`/`Down`/`Up` moves the cursor within the users list
- [ ] `Enter` on a focused user navigates to the user profile screen
- [ ] The search screen remains in the navigation stack after `Enter` navigation
- [ ] `q` from the user profile returns to the search screen with Users tab active, query, scroll, and focus preserved
- [ ] `G` jumps to the last loaded user result
- [ ] `g g` jumps to the first user result
- [ ] `Ctrl+D` pages down (half visible height)
- [ ] `Ctrl+U` pages up (half visible height)
- [ ] Pagination fetches the next page when scroll reaches 80% of loaded content height
- [ ] Pagination uses `page` and `per_page` parameters (default 30 per page)
- [ ] Pagination stops at 300 loaded items (10 pages × 30 per page)
- [ ] A "Loading more…" indicator appears at the bottom of the list during pagination fetches
- [ ] Results are rendered in relevance order as returned by the API (FTS rank descending)
- [ ] The header breadcrumb reads "Search" while the Users tab is active
- [ ] The status bar shows context-sensitive keybinding hints: `/:focus input  Tab:tab  j/k:nav  Enter:open  q:back`

### Keyboard Interactions

- [ ] `3`: Switch to Users tab from results list (literal `3` when search input is focused)
- [ ] `Tab`: Cycle to next tab (Code, wrapping to Repositories)
- [ ] `Shift+Tab`: Cycle to previous tab (Issues)
- [ ] `j` / `Down`: Move cursor down one result
- [ ] `k` / `Up`: Move cursor up one result
- [ ] `Enter`: Navigate to focused user's profile screen
- [ ] `G`: Jump to last loaded result
- [ ] `g g`: Jump to first result
- [ ] `Ctrl+D`: Page down (half visible height)
- [ ] `Ctrl+U`: Page up (half visible height)
- [ ] `/`: Return focus to search input
- [ ] `Esc`: Pop the search screen
- [ ] `q`: Pop the search screen
- [ ] `R`: Retry failed user search (only active during error state)

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by app shell — Users tab not rendered
- [ ] 80×24 – 119×39 (minimum): Tab label "Users(N)". Result rows show username only (no display_name). Max ~16 visible rows
- [ ] 120×40 – 199×59 (standard): Tab label "Users (N)" with `│` separators. Result rows show username + display_name in parentheses. Max ~30 visible rows
- [ ] 200×60+ (large): Same as standard layout. Result rows show username + display_name in parentheses. Max ~50 visible rows

### Truncation and Boundary Constraints

- [ ] Username: max 20 characters displayed, truncated with `…` (usernames can be up to 40 characters in the system)
- [ ] Display name: max 30 characters displayed, truncated with `…`
- [ ] At 80×24 minimum width, username truncation threshold reduces to fit within available row width minus padding (2 chars left + 2 chars right)
- [ ] Tab count badge: abbreviated above 9,999 (e.g., "10k+")
- [ ] Total loaded items per tab: capped at 300 (pagination stops)
- [ ] Empty display_name: no parenthetical rendered — row shows username only, no trailing whitespace or empty `()`
- [ ] Row width: full terminal width minus left/right padding (2 characters each side)
- [ ] Focused cursor indicator `►` occupies 2 characters at row start

### Edge Cases

- [ ] Terminal resize while Users tab is active: layout re-renders, scroll position preserved, focused item preserved
- [ ] Terminal resize from standard to minimum: display_name fields hide, username-only rows render
- [ ] Terminal resize from minimum to standard: display_name fields appear
- [ ] Query returns only user results (repos/issues/code all zero): Users tab auto-selects as first tab with results
- [ ] Query returns zero users but other tabs have results: Users tab selectable, shows "No users match '{query}'."
- [ ] Query returns zero results across all tabs: Users tab shows "(0)" in tab badge and zero-results message
- [ ] User has an extremely long username (40 characters): truncated with `…` at display limit
- [ ] User has a display_name identical to their username: both still displayed (`alice (alice)`)
- [ ] User has Unicode characters in display_name: rendered correctly, grapheme-aware truncation
- [ ] User has RTL characters in display_name: rendered as-is (terminal bidi behavior is terminal-dependent)
- [ ] Pagination API returns fewer than 30 results on a page: pagination stops (no further pages)
- [ ] API returns `total_count` larger than loadable cap (300): badge shows full count, but only 300 items are loadable
- [ ] Network timeout on user search specifically: Users tab shows "Search failed. Press R to retry." while other tabs display their own results
- [ ] 429 rate limit on user search endpoint: Users tab shows "Rate limited. Retry in {N}s."
- [ ] 500 server error on user search: Users tab shows "Search error. Press R to retry."
- [ ] Switching to Users tab while its results are still loading: "Searching…" shown in the results area
- [ ] Switching away from Users tab during pagination load: load completes in background, results preserved for return
- [ ] Rapid repeated `3` presses: no-op after first activation (tab already active)
- [ ] Navigate to user profile for a user whose account was deleted since search results loaded: profile screen handles 404 gracefully

## Design

### Layout Structure

**Standard layout (120×40) — Users tab active:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Search                                                    │
├─────────────────────────────────────────────────────────────────┤
│ 🔍 alice█                                                        │
├─────────────────────────────────────────────────────────────────┤
│ Repositories (0) │ Issues (0) │ ▸Users (3) │ Code (0)            │
├─────────────────────────────────────────────────────────────────┤
│ ► alicejohnson                          (Alice Johnson)          │
│   alicew                                (Alice Wang)             │
│   alice_dev                             (Alice)                  │
├─────────────────────────────────────────────────────────────────┤
│ /:focus input  Tab:tab  j/k:nav  Enter:open  q:back             │
└─────────────────────────────────────────────────────────────────┘
```

**Minimum layout (80×24) — Users tab active:**

```
┌──────────────────────────────────────────────────────────────┐
│ Search                                                         │
├──────────────────────────────────────────────────────────────┤
│ 🔍 alice█                                                     │
├──────────────────────────────────────────────────────────────┤
│ Repos(0) Issues(0) Users(3) Code(0)                            │
├──────────────────────────────────────────────────────────────┤
│ ► alicejohnson                                                │
│   alicew                                                      │
│   alice_dev                                                   │
├──────────────────────────────────────────────────────────────┤
│ /:input Tab:tab j/k:nav Enter:open q:back                      │
└──────────────────────────────────────────────────────────────┘
```

### Component Tree (OpenTUI + React 19)

The Users tab is rendered as a child of the `SearchScreen` component. When `activeTab === "users"`, the results area renders `UserResultRow` components:

```jsx
<scrollbox flexGrow={1} onScrollEnd={handleLoadMoreUsers} scrollPosition={tabScrollPositions.users}>
  {usersLoading ? (
    <box justifyContent="center" alignItems="center" flexGrow={1}>
      <text fg="muted">Searching…</text>
    </box>
  ) : usersError ? (
    <box justifyContent="center" alignItems="center" flexGrow={1}>
      <text fg="error">{usersErrorMessage}</text>
      <text fg="muted">Press R to retry</text>
    </box>
  ) : userResults.length === 0 && query.length > 0 ? (
    <box justifyContent="center" alignItems="center" flexGrow={1}>
      <text fg="muted">No users match '{truncate(query, 40)}'.</text>
      <text fg="muted">Try a different query or check spelling.</text>
    </box>
  ) : (
    <box flexDirection="column">
      {userResults.map((user, i) => (
        <UserResultRow key={user.id} user={user} focused={i === focusedIndex} breakpoint={breakpoint} />
      ))}
      {usersLoadingMore && <text fg="muted">Loading more…</text>}
    </box>
  )}
</scrollbox>
```

### UserResultRow Sub-component

```jsx
function UserResultRow({ user, focused, breakpoint }) {
  const showDisplayName = breakpoint !== "minimum" && user.display_name;
  return (
    <box flexDirection="row" height={1} width="100%" attributes={focused ? REVERSE : 0}>
      <text>{focused ? "► " : "  "}</text>
      <text fg="primary">{truncate(user.username, breakpoint === "minimum" ? 76 : 20)}</text>
      {showDisplayName && <text fg="muted"> ({truncate(user.display_name, 30)})</text>}
    </box>
  );
}
```

### Keybinding Reference (Users Tab Specific)

| Key | Context | Action |
|-----|---------|--------|
| `3` | Results list focused | Switch to Users tab |
| `j` / `Down` | Users tab, results list | Move cursor down one user |
| `k` / `Up` | Users tab, results list | Move cursor up one user |
| `Enter` | Users tab, user focused | Navigate to user profile screen |
| `G` | Users tab, results list | Jump to last loaded user |
| `g g` | Users tab, results list | Jump to first user |
| `Ctrl+D` | Users tab, results list | Page down (half visible height) |
| `Ctrl+U` | Users tab, results list | Page up (half visible height) |
| `Tab` | Users tab active | Switch to Code tab (next tab) |
| `Shift+Tab` | Users tab active | Switch to Issues tab (previous tab) |
| `/` | Users tab, results list | Focus search input |
| `Esc` | Users tab, results list | Pop search screen |
| `q` | Users tab, results list | Pop search screen |
| `R` | Users tab, error state | Retry failed user search |

### Responsive Behavior

| Dimension | 80×24 (minimum) | 120×40 (standard) | 200×60+ (large) |
|-----------|-----------------|-------------------|------------------|
| Tab label | `Users(N)` | `Users (N)` with `│` separator | `Users (N)` with `│` separator |
| Row content | Username only | Username + (display_name) | Username + (display_name) |
| Username max chars | 76 (full row width) | 20 | 20 |
| Display name shown | No | Yes (max 30 chars) | Yes (max 30 chars) |
| Visible rows | ~16 | ~30 | ~50 |
| Cursor indicator | `► ` / `  ` (2 chars) | `► ` / `  ` (2 chars) | `► ` / `  ` (2 chars) |

### Data Hooks Consumed

| Hook | Source | Purpose |
|------|--------|---------|
| `useSearch()` | `@codeplane/ui-core` | Returns `{ searchUsers }` function and `{ data: UserSearchResultPage, loading, error, loadMore }` state |
| `useUser()` | `@codeplane/ui-core` | Current authenticated user |
| `useTerminalDimensions()` | `@opentui/react` | Terminal size for breakpoint calculation |
| `useOnResize()` | `@opentui/react` | Resize event trigger |
| `useKeyboard()` | `@opentui/react` | Keyboard event handler |
| `useNavigation()` | TUI app shell | `{ push }` to navigate to user profile screen |

### API Endpoint Consumed

| Endpoint | Parameters | Response |
|----------|------------|----------|
| `GET /api/search/users` | `q` (required, ≥1 char), `page` (default 1), `per_page` (default 30, max 100) | `UserSearchResultPage` with `items: UserSearchResult[]`, `total_count`, `page`, `per_page` |

Each `UserSearchResult` contains: `id`, `username`, `display_name`, `avatar_url`. The `avatar_url` is ignored by the TUI.

### Navigation Target

When `Enter` is pressed on a user result:
```
push({ screen: "user-profile", params: { username: user.username } })
```
Breadcrumb updates to: `Search > @username`

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated | Admin |
|--------|-----------|---------------|-------|
| View Users tab | ❌ | ✅ | ✅ |
| Search users | ❌ | ✅ | ✅ |
| Navigate to user profile | ❌ | ✅ | ✅ |

- Authentication is required. The TUI enforces authentication at bootstrap; unauthenticated sessions cannot reach the search screen
- The user search endpoint returns all active users whose username or display_name matches the query. It does not filter by repository access — user profiles are considered public information
- No elevated role (admin, org owner) is needed to search users. Admin users see the same user search results as regular users
- The `viewer` parameter is passed to the API but does not restrict user results (unlike repo/issue/code search, which filter by visibility)
- Deactivated or deleted users are excluded from results by the server

### Token Handling

- Token loaded from CLI keychain (via `codeplane auth login`) or `CODEPLANE_TOKEN` environment variable
- Token sent as `Bearer` token in the `Authorization` header on the `GET /api/search/users` request
- Token is never displayed in the TUI, never logged, never included in error messages or telemetry events
- 401 on the user search endpoint propagates to the app-shell auth error screen

### Rate Limiting

- The user search API shares the global rate limit: 300 requests per minute per authenticated user across all API endpoints
- User search is dispatched as one of four parallel requests per query (repos + issues + users + code). With 300ms debounce, worst-case burst is ~52 total requests/minute during continuous typing
- Pagination requests (user-initiated via scrolling) are additional but infrequent
- If the user search endpoint returns 429, the Users tab shows "Rate limited. Retry in {Retry-After}s." inline. Other tabs' results are unaffected
- No auto-retry on 429 — user presses `R` after the retry-after period

### Input Sanitization

- The search query is URL-encoded by the `@codeplane/ui-core` API client before transmission
- The API validates query is non-empty (≥1 character after trim); returns 422 otherwise (client guards against this)
- Result data (username, display_name) is rendered as plain `<text>` — no injection vector exists in the terminal context
- The `avatar_url` field is received but never rendered or used by the TUI

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.search.users_tab_viewed` | Users tab becomes active | `source` ("tab_key", "shift_tab", "number_key", "auto_select"), `user_result_count`, `query_length`, `terminal_width`, `terminal_height` |
| `tui.search.user_result_opened` | User presses Enter on a user result | `username` (hashed), `position_in_list`, `query_length`, `total_user_results`, `tab_result_count`, `time_on_users_tab_ms` |
| `tui.search.users_pagination` | Scroll triggers next page load for users | `page_number`, `items_loaded_total`, `query_length` |
| `tui.search.users_zero_results` | Users tab activated with zero results | `query_length`, `query_text_hash` (privacy-safe hash), `other_tabs_have_results` (boolean) |
| `tui.search.users_error` | User search API call fails | `error_type` ("network", "timeout", "rate_limit", "server_error", "auth"), `http_status`, `query_length` |
| `tui.search.users_retry` | User presses R to retry on Users tab | `retry_success`, `previous_error_type` |

### Common Event Properties

All Users tab events include:
- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `color_mode`: `"truecolor"` | `"256"` | `"16"`
- `breakpoint`: `"minimum"` | `"standard"` | `"large"`

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Users tab view rate | ≥ 15% of search sessions | At least 15% of search sessions visit the Users tab |
| User result open rate | ≥ 30% of Users tab views | At least 30% of Users tab views result in opening a user profile |
| Users zero-result rate | < 15% of Users tab views with a query | Fewer than 15% of Users tab views produce zero results |
| Users tab dwell time | > 3 seconds median | Median time spent on the Users tab indicates engagement |
| User search error rate | < 3% of user search requests | Fewer than 3% of user search API calls result in errors |
| Pagination engagement | ≥ 10% of Users tab views | At least 10% of Users tab sessions trigger a second page load |
| Profile navigation return rate | ≥ 40% of profile navigations | At least 40% of user profile navigations return to the search Users tab |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Users tab activated | `Search: users tab active [source={source}] [query_length={n}]` |
| `debug` | Users results rendered | `Search: users rendered [count={n}] [total={total_count}] [duration={ms}ms]` |
| `debug` | Users pagination triggered | `Search: users pagination [page={n}] [items_loaded={n}]` |
| `debug` | Users focus changed | `Search: users focus [index={n}] [username_hash={hash}]` |
| `info` | User result navigated | `Search: users navigated [username_hash={hash}] [position={n}] [query_length={n}]` |
| `info` | Users pagination complete | `Search: users page loaded [page={n}] [items={count}] [total={total_count}] [duration={ms}ms]` |
| `warn` | User search API failed | `Search: users API error [status={code}] [error={message}]` |
| `warn` | User search rate limited | `Search: users rate limited [retry_after={n}s]` |
| `warn` | User search slow response | `Search: users slow response [duration={ms}ms]` (> 3000ms) |
| `warn` | Users pagination cap reached | `Search: users pagination cap [items=300] [total_count={n}]` |
| `error` | Users tab render error | `Search: users render error [component=UserResultRow] [error={message}]` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`). Username values are hashed in logs to protect privacy.

### Error Cases Specific to TUI

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on user search | API client timeout (10s) | Users tab shows "Search failed. Press R to retry." Other tabs unaffected |
| 401 auth error | User search returns 401 | Propagated to app-shell auth error screen |
| 429 rate limit | User search returns 429 | "Rate limited. Retry in {N}s." on Users tab |
| 500 server error | User search returns 5xx | "Search error. Press R to retry." on Users tab |
| Terminal resize while scrolled | `useOnResize` fires | Layout re-renders at new dimensions; scroll position preserved proportionally; focused index unchanged |
| Terminal resize minimum↔standard | `useOnResize` fires | Display_name fields toggle visibility; no data refetch needed |
| Navigation to deleted user profile | Profile screen returns 404 | Profile screen shows "User not found" error; `q` returns to search with state preserved |
| Pagination returns empty page | API returns items: [] | Pagination stops; no "Loading more…" indicator |
| API returns unexpected shape | Missing `items` or `total_count` field | Logged as error; Users tab shows generic error message |
| React render crash in UserResultRow | Error boundary | Individual row error caught; remaining rows render; error logged |
| SSE disconnect | Status bar indicator | User search unaffected — uses REST, not SSE |
| Query change while users page is loading | New query dispatched | In-flight pagination request aborted; fresh results for new query |
| Tab switch during user results loading | User switches to Code/Repos/Issues | Users loading continues in background; results available on return |

### Failure Modes and Recovery

- **Complete user search failure**: Users tab shows error state with retry hint. Other tabs may still have results. User can switch tabs and continue browsing.
- **Stale results after query change**: Previous query's in-flight user search response is discarded via request ID matching. Only the most recent query's user results are rendered.
- **Pagination failure mid-scroll**: "Loading more…" replaced with inline error. Previously loaded results remain visible and navigable. User can retry with `R`.
- **Memory pressure from large user result set**: Capped at 300 loaded user items (10 pages). Tab badge still shows full `total_count`.
- **Individual row render crash**: Caught by per-row try-catch. Crashed row replaced with `[render error]` text in error color. Other rows unaffected.

## Verification

### Test File: `e2e/tui/search.test.ts`

All tests are under the `TUI_SEARCH_USERS_TAB` describe block within the shared search test file.

### Terminal Snapshot Tests

```
SNAP-USERS-001: Users tab renders at 120x40 with results
  → Type "alice" → press 3 (Users tab) → wait for results
  → Assert Users tab label has bold/underline in primary color
  → Assert user rows show username in primary, display_name in muted parenthetical
  → Assert first user is focused (reverse video)
  → Assert status bar shows "/:focus input  Tab:tab  j/k:nav  Enter:open  q:back"

SNAP-USERS-002: Users tab renders at 80x24 with results
  → Type "alice" at 80x24 → press 3
  → Assert abbreviated tab labels: "Repos(0) Issues(0) Users(3) Code(0)"
  → Assert user rows show username only (no display_name)
  → Assert first user focused

SNAP-USERS-003: Users tab renders at 200x60 with results
  → Type "alice" at 200x60 → press 3
  → Assert full tab labels with pipe separators
  → Assert user rows show username + display_name with wider spacing
  → Assert first user focused

SNAP-USERS-004: Users tab zero results
  → Type "xyznonexistent" → press 3
  → Assert tab badge shows "Users (0)"
  → Assert content area shows "No users match 'xyznonexistent'."
  → Assert hint text "Try a different query or check spelling."

SNAP-USERS-005: Users tab with focused item at position 3
  → Type "test" → press 3 → j j
  → Assert third user row highlighted with reverse video
  → Assert first two rows in normal style

SNAP-USERS-006: Users tab loading state
  → Type query with slow API → press 3
  → Assert "Searching…" shown in users results area

SNAP-USERS-007: Users tab error state
  → Type query → users API returns 500 → press 3
  → Assert "Search error. Press R to retry." in error color

SNAP-USERS-008: Users tab rate limit state
  → Type query → users API returns 429 with Retry-After: 30 → press 3
  → Assert "Rate limited. Retry in 30s." on Users tab

SNAP-USERS-009: Users tab pagination loading
  → Type query returning 60+ users → scroll to bottom
  → Assert "Loading more…" at bottom of list

SNAP-USERS-010: User without display_name
  → Search returning a user with empty display_name → press 3
  → Assert row shows username only, no empty parentheses "()"

SNAP-USERS-011: Users tab active indicator in tab bar
  → Press 3 → Assert "Users" label styled with bold/underline in primary
  → Assert other tabs (Repos, Issues, Code) in muted color

SNAP-USERS-012: Long username truncation
  → Search returning user with 40-char username → press 3 at 120x40
  → Assert username truncated to 20 chars with "…"

SNAP-USERS-013: Long display_name truncation
  → Search returning user with 50-char display_name → press 3 at 120x40
  → Assert display_name truncated to 30 chars with "…" inside parentheses

SNAP-USERS-014: Users tab count badge formatting
  → Search returning total_count=15000 → press 3
  → Assert tab badge shows "Users (15k+)"
```

### Keyboard Interaction Tests

```
KEY-USERS-001: Press 3 switches to Users tab
KEY-USERS-002: Tab from Issues switches to Users
KEY-USERS-003: Shift+Tab from Code switches to Users
KEY-USERS-004: Tab from Users switches to Code
KEY-USERS-005: Shift+Tab from Users switches to Issues
KEY-USERS-006: j/k navigates user results
KEY-USERS-007: Down/Up navigates user results
KEY-USERS-008: Enter on user navigates to profile
KEY-USERS-009: q from user profile returns to search
KEY-USERS-010: G jumps to last user
KEY-USERS-011: g g jumps to first user
KEY-USERS-012: Ctrl+D pages down
KEY-USERS-013: Ctrl+U pages up
KEY-USERS-014: / from Users tab focuses search input
KEY-USERS-015: Esc from Users tab pops search screen
KEY-USERS-016: q from Users tab pops search screen
KEY-USERS-017: R retries failed user search
KEY-USERS-018: R is noop when no error
KEY-USERS-019: Tab switching preserves Users tab scroll position
KEY-USERS-020: 3 in search input types literal "3"
KEY-USERS-021: Enter on user at cursor boundary
KEY-USERS-022: Pagination on scroll
KEY-USERS-023: Pagination stops at 300 cap
KEY-USERS-024: Rapid j presses
```

### Responsive Tests

```
RESIZE-USERS-001: 120x40 standard layout
RESIZE-USERS-002: 80x24 minimum layout
RESIZE-USERS-003: 200x60 large layout
RESIZE-USERS-004: Resize 120→80 hides display_name
RESIZE-USERS-005: Resize 80→120 shows display_name
RESIZE-USERS-006: Resize preserves query and focus
RESIZE-USERS-007: Resize preserves Users tab selection
RESIZE-USERS-008: Resize during loading
RESIZE-USERS-009: Resize with zero results
RESIZE-USERS-010: Rapid resize without artifacts
```

### Integration Tests

```
INT-USERS-001: Full user search flow (g s → type → tab → enter → q → verify state preserved)
INT-USERS-002: User search API call verifies correct endpoint and parameters
INT-USERS-003: User results render in relevance order (FTS rank DESC)
INT-USERS-004: Users tab auto-selects when only users match
INT-USERS-005: Users tab retains state across tab switches
INT-USERS-006: Users pagination loads next page
INT-USERS-007: Users pagination stops at cap
INT-USERS-008: User search 401 handling
INT-USERS-009: User search 429 handling
INT-USERS-010: User search 500 handling
INT-USERS-011: User search partial failure (other tabs succeed)
INT-USERS-012: User search timeout
INT-USERS-013: User result without display_name
INT-USERS-014: Unicode in display_name
INT-USERS-015: Navigate to user profile deep link
INT-USERS-016: Search state preserved across go-to navigation
INT-USERS-017: Debounce applies to user search
INT-USERS-018: Query change aborts in-flight user search
INT-USERS-019: Empty display_name vs missing display_name
INT-USERS-020: Tab badge shows total_count not loaded count
```

All tests target `e2e/tui/search.test.ts` using `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing — never skipped or commented out.
