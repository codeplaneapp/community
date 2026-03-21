# TUI_SEARCH_TAB_NAVIGATION

Specification for TUI_SEARCH_TAB_NAVIGATION.

## High-Level User POV

The search tab navigation is the mechanism for switching between the four result categories on the Codeplane TUI's global Search screen. When a user performs a search, results are organized into four tabs — **Repositories**, **Issues**, **Users**, and **Code** — displayed as a horizontal tab bar between the search input and the results area. The tab bar is the central navigation control that lets the user rapidly pivot across result types for the same query without retyping or re-submitting.

Each tab displays a count badge showing the total number of matching results for that category (e.g., `Repositories (42)`). These counts update immediately when search results arrive from the API. All four search endpoints are called in parallel when a query is dispatched, so count badges for all tabs populate together. A tab with zero results shows `(0)` and remains selectable — the user can switch to it and see an explicit "No results" message rather than having the tab disappear.

The interaction model mirrors the repository tab navigation pattern but is adapted for 4 tabs instead of 6. The user can cycle through tabs with `Tab` (forward) and `Shift+Tab` (backward), both wrapping at the ends — pressing `Tab` on Code wraps to Repositories, pressing `Shift+Tab` on Repositories wraps to Code. For direct access, the number keys `1` through `4` jump immediately to a specific tab: `1` for Repositories, `2` for Issues, `3` for Users, `4` for Code. Number keys `5` through `9` and `0` are no-ops — no error, no visual change. The `h`/`l` and `Left`/`Right` arrow keys move between adjacent tabs without wrapping.

Tab labels include their numeric prefix for discoverability: `1:Repos`, `2:Issues`, `3:Users`, `4:Code` at minimum terminal width, and `Repositories (N)`, `Issues (N)`, `Users (N)`, `Code (N)` at standard and large widths. The active tab is highlighted with bold, underline, and primary color (ANSI 33). Inactive tabs render in muted color (ANSI 245). The active tab indicator is visually unambiguous at all terminal sizes.

Tab switching is instantaneous — it is a purely client-side state change. The search query is shared across all tabs: when the user types "api gateway" on the Repositories tab and then switches to Issues, the Issues tab shows results for "api gateway" without requiring a new search. Each tab independently maintains its own scroll position and focused item index. If the user scrolls to the 15th repository result, switches to Issues, browses there, and then returns to Repositories, they are still on the 15th item exactly where they left off.

When search results load for the first time (user types a new query), the tab that was most recently active remains active if it has results. If the active tab has zero results but another tab does, the first tab with non-zero results is auto-selected. This auto-selection only happens on the initial result load for a new query — subsequent tab switches are always user-driven.

Tab keybindings are context-sensitive. When the search input has focus, `Tab` and `Shift+Tab` still switch tabs (they do not advance form fields, since the search input is a single-line control with no sibling form fields). However, number keys `1`–`4` are passed through as literal characters when the search input has focus, so the user can type queries containing digits. When a modal overlay (help, command palette) is open, all tab keybindings are suppressed — keystrokes go to the overlay instead. When the `g` prefix is active for go-to mode, number keys are consumed by the go-to handler, not the tab navigator.

The tab bar is a single-row element that never wraps or scrolls. At minimum terminal width (80 columns), abbreviated labels with counts fit comfortably within the available space. At standard width (120+ columns), full labels with pipe separators (`│`) provide visual separation. At large width (200+ columns), the same full layout is used with additional horizontal padding. The tab bar re-renders synchronously on terminal resize, adjusting label format while preserving the active tab.

The tab bar integrates with the global help overlay: pressing `?` includes a "Search Tabs" group listing all tab keybindings. The status bar reflects the current search context: `Tab:tab  1-4:jump  /:input  q:back` when the results list has focus.

## Acceptance Criteria

### Tab Bar Rendering
- [ ] The tab bar renders exactly 4 tabs: Repositories (1), Issues (2), Users (3), Code (4)
- [ ] Each tab label includes a count badge showing `total_count` from the corresponding API response
- [ ] Count badges display `(0)` for tabs with zero results, not hidden or disabled
- [ ] Count badges are absent (no parenthetical) before any search query is dispatched
- [ ] Count badges abbreviated above 9999 as "10k+", "100k+", etc.
- [ ] The active tab is rendered with bold, underline, and `primary` color (ANSI 33)
- [ ] Inactive tabs are rendered in `muted` color (ANSI 245), no bold, no underline
- [ ] The tab bar occupies exactly 1 row of terminal height
- [ ] The tab bar is positioned immediately below the search input and above the results area
- [ ] The tab bar does not wrap to multiple lines at any supported terminal width (≥80 columns)
- [ ] Tab labels are separated by ` │ ` (space-pipe-space) at standard and large widths
- [ ] Tab labels are separated by 2 spaces at minimum width

### Tab Cycling
- [ ] `Tab` moves to the next tab (left to right): Repos → Issues → Users → Code → Repos
- [ ] `Shift+Tab` moves to the previous tab (right to left): Repos → Code → Users → Issues → Repos
- [ ] `Tab` on Code (tab 4) wraps to Repositories (tab 1)
- [ ] `Shift+Tab` on Repositories (tab 1) wraps to Code (tab 4)
- [ ] Tab cycling takes effect within one render frame (<16ms)
- [ ] Tab cycling is suppressed when a modal or overlay is open (help, command palette)
- [ ] Tab cycling is NOT suppressed when the search input has focus (Tab/Shift+Tab switch tabs from the input)

### Direct Jump by Number
- [ ] `1` jumps to Repositories tab
- [ ] `2` jumps to Issues tab
- [ ] `3` jumps to Users tab
- [ ] `4` jumps to Code tab
- [ ] `5`, `6`, `7`, `8`, `9`, `0` are ignored (no-op) — no error, no visual change
- [ ] Number keys are suppressed (passed as literal characters) when the search input has focus
- [ ] Number keys are suppressed when a modal or overlay is open
- [ ] Number keys are suppressed when the `g` go-to prefix is active
- [ ] Jumping to the already-active tab is a no-op (no re-render, no data refetch, no scroll reset)

### Arrow Key Navigation
- [ ] `l` / `Right` moves to the next tab (does not wrap)
- [ ] `h` / `Left` moves to the previous tab (does not wrap)
- [ ] `l` / `Right` on Code (tab 4) is a no-op
- [ ] `h` / `Left` on Repositories (tab 1) is a no-op
- [ ] Arrow keys are suppressed when the search input has focus (input cursor movement takes priority)
- [ ] Arrow keys are suppressed when a modal or overlay is open

### Shared Query Across Tabs
- [ ] Switching tabs does not change, reset, or re-dispatch the current search query
- [ ] The same query string is used across all 4 tab API calls when search is dispatched
- [ ] Changing the query while on a non-default tab updates all tabs' results when the debounce fires
- [ ] Each tab displays results from its respective API endpoint for the shared query

### Per-Tab State Preservation
- [ ] Each tab independently maintains its own scroll position within the results scrollbox
- [ ] Each tab independently maintains its own focused item index
- [ ] Switching away from a tab and back preserves both scroll position and focused item
- [ ] Tab state (scroll, focus) is reset when a new query is dispatched
- [ ] Per-tab result data is cached in memory — switching back does not trigger a re-fetch unless the query changed

### Auto-Selection on New Query
- [ ] When a new query's results arrive, the active tab remains active if it has ≥1 result
- [ ] If the active tab has 0 results but another tab has results, the first tab (lowest index) with results auto-selects
- [ ] If all tabs have 0 results, the active tab remains unchanged
- [ ] Auto-selection only occurs on the initial result load for a new query, never on subsequent pagination or tab switches
- [ ] Auto-selection does not fire on re-entry to the search screen (cached results, same query)

### Content Area Behavior
- [ ] Switching tabs replaces the results area content with the new tab's results
- [ ] Tab switch does not trigger a full-screen loading state
- [ ] Each tab manages its own loading state (skeleton, "Searching…", error, or results)
- [ ] Tab content for the inactive tabs is not rendered (unmounted), but state is preserved in a React ref or external store
- [ ] The results area fills all vertical space between the tab bar and the status bar

### Active Tab Persistence
- [ ] The active tab index is preserved when navigating away from the search screen and returning
- [ ] The active tab index is preserved across terminal resize events
- [ ] The active tab index resets to Repositories (index 0) when the search screen is re-mounted from scratch (new TUI session or after error boundary recovery)

### Responsive Label Formatting
- [ ] At 80–119 columns: abbreviated labels with counts — `Repos(3)  Issues(12)  Users(0)  Code(27)`
- [ ] At 120–199 columns: full labels with counts, pipe-separated — `Repositories (3) │ Issues (12) │ Users (0) │ Code (27)`
- [ ] At 200+ columns: full labels with counts, pipe-separated, expanded padding (4 spaces around `│`)
- [ ] Label format updates synchronously on terminal resize

### Edge Cases
- [ ] Terminal below 80×24: "Terminal too small" message handled by the app shell; tab bar not rendered
- [ ] Rapid `Tab` presses (holding Tab) cycles through tabs sequentially without skipping
- [ ] Rapid number key presses (e.g., `1` `3` `4` in quick succession) lands on the last pressed (`4`)
- [ ] Terminal resize during tab transition does not crash or corrupt layout
- [ ] SSE disconnect does not affect tab navigation behavior (search uses REST, not SSE)
- [ ] API error on one tab's search does not prevent switching to other tabs
- [ ] 401 auth error propagates to app-shell auth error screen; tab bar becomes unreachable
- [ ] Tab switching while a search request is in-flight: new tab shows its own loading/cached state; in-flight requests continue
- [ ] Switching tabs rapidly during a search causes no duplicate API requests (requests are per-query, not per-tab-switch)
- [ ] Tab count badge rendering with very large numbers (e.g., 999999) does not overflow the tab bar

### Boundary Constraints
- [ ] Tab count is fixed at 4 (not dynamic)
- [ ] Tab label maximum length at minimum width: 10 characters including count (e.g., `Repos(999)`)
- [ ] Tab label maximum length at standard/large width: 22 characters including count (e.g., `Repositories (10k+)`)
- [ ] Tab bar total width at minimum: 4 labels × 10 chars + 3 × 2-char gaps = 46 chars minimum
- [ ] Tab bar total width at standard: 4 labels × 22 chars + 3 × 3-char separators = 97 chars maximum
- [ ] Active tab index range: 0–3 (clamped, never out of bounds)
- [ ] Count badge value range: 0 to display cap of "100k+" (values above 99999 show "100k+")

## Design

### Screen Layout

**Standard layout (120×40):**

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Search                                         ● 🔔 3  │
├─────────────────────────────────────────────────────────────────┤
│ 🔍 api gateway█                                                │
├─────────────────────────────────────────────────────────────────┤
│ [Repositories (3)] │ Issues (12) │ Users (1) │ Code (27)       │
├─────────────────────────────────────────────────────────────────┤
│ ► acme/api-gateway                                  ◆ public   │
│     REST API gateway service for microservices…      ★ 42      │
│   acme/gateway-sdk                                  ◆ public   │
│     Client SDK for the API gateway…                  ★ 15      │
│   internal/gateway-config                           ◇ private  │
│     Configuration templates for gateway deploys…     ★ 3       │
│                                                                │
├─────────────────────────────────────────────────────────────────┤
│ Tab:tab  1-4:jump  /:input  j/k:nav  Enter:open  q:back       │
└─────────────────────────────────────────────────────────────────┘
```

**Minimum layout (80×24):**

```
┌──────────────────────────────────────────────────────────────┐
│ Search                                              ● 🔔 3   │
├──────────────────────────────────────────────────────────────┤
│ 🔍 api gateway█                                             │
├──────────────────────────────────────────────────────────────┤
│ [Repos(3)]  Issues(12)  Users(1)  Code(27)                   │
├──────────────────────────────────────────────────────────────┤
│ ► acme/api-gateway                          ◆ public         │
│   acme/gateway-sdk                          ◆ public         │
│   internal/gateway-config                   ◇ private        │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Tab:tab  1-4:jump  /:input  q:back                           │
└──────────────────────────────────────────────────────────────┘
```

**Large layout (200×60):**

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Header: Search                                                                  ● 🔔 3  │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ 🔍 api gateway█                                                                        │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Repositories (3)]    │    Issues (12)    │    Users (1)    │    Code (27)               │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ► acme/api-gateway                    REST API gateway service...        ◆ public  ★ 42 │
│   acme/gateway-sdk                    Client SDK for the API gateway...  ◆ public  ★ 15 │
│   internal/gateway-config             Configuration templates...         ◇ private ★ 3  │
│                                                                                         │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Tab/S-Tab:tab  1-4:jump  /:input  j/k:nav  Enter:open  G:bottom  q:back      ? help    │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Structure

```jsx
<box flexDirection="column" height="100%">
  {/* Search input — managed by TUI_SEARCH_SCREEN */}
  <SearchInput query={query} onQueryChange={setQuery} focused={inputFocused} />

  {/* Tab bar — this feature */}
  <box flexDirection="row" height={1} borderBottom="single" borderColor="border">
    {SEARCH_TABS.map((tab, index) => (
      <text
        key={tab.id}
        bold={index === activeTabIndex}
        underline={index === activeTabIndex}
        color={index === activeTabIndex ? "primary" : "muted"}
      >
        {formatSearchTabLabel(tab, index, terminalWidth, tabCounts[tab.id])}
      </text>
    ))}
    {terminalWidth >= 120 && index < SEARCH_TABS.length - 1 && (
      <text color="border"> │ </text>
    )}
  </box>

  {/* Tab content area — conditionally renders active tab */}
  <box flexGrow={1}>
    {activeTabIndex === 0 && (
      <SearchReposTab query={query} onNavigate={push} tabState={tabStates.repos} />
    )}
    {activeTabIndex === 1 && (
      <SearchIssuesTab query={query} onNavigate={push} tabState={tabStates.issues} />
    )}
    {activeTabIndex === 2 && (
      <SearchUsersTab query={query} onNavigate={push} tabState={tabStates.users} />
    )}
    {activeTabIndex === 3 && (
      <SearchCodeTab query={query} onNavigate={push} tabState={tabStates.code} />
    )}
  </box>
</box>
```

### Tab Definition Array

```typescript
const SEARCH_TABS = [
  { id: "repositories", label: "Repositories", short: "Repos", key: "1" },
  { id: "issues",       label: "Issues",       short: "Issues", key: "2" },
  { id: "users",        label: "Users",        short: "Users", key: "3" },
  { id: "code",         label: "Code",         short: "Code",  key: "4" },
] as const;
```

### Tab Label Formatting

```typescript
function formatSearchTabLabel(
  tab: SearchTab,
  index: number,
  terminalWidth: number,
  count: number | null,
): string {
  const countStr = count === null
    ? ""
    : count > 99999
      ? "(100k+)"
      : count > 9999
        ? `(${Math.floor(count / 1000)}k+)`
        : `(${count})`;

  if (terminalWidth < 120) {
    // Minimum: abbreviated label + count, no prefix number
    return `${tab.short}${countStr}`;
  }
  // Standard/large: full label + count
  return `${tab.label} ${countStr}`.trim();
}
```

### Keybinding Reference

**Tab switching (active when search screen has focus, not suppressed by input for Tab/Shift+Tab):**

| Key | Context | Action |
|-----|---------|--------|
| `Tab` | Results list or search input | Next tab (wraps) |
| `Shift+Tab` | Results list or search input | Previous tab (wraps) |
| `1` | Results list only | Jump to Repositories |
| `2` | Results list only | Jump to Issues |
| `3` | Results list only | Jump to Users |
| `4` | Results list only | Jump to Code |
| `h` / `Left` | Results list only | Previous tab (no wrap) |
| `l` / `Right` | Results list only | Next tab (no wrap) |

**Suppression rules:**
- `Tab`/`Shift+Tab` are always active on the search screen unless a modal/overlay is open
- Number keys `1`–`4` are suppressed when the search input has focus (passed as literal characters)
- Arrow keys `h`/`l`/`Left`/`Right` are suppressed when the search input has focus (cursor movement)
- All tab keybindings are suppressed when the help overlay, command palette, or any modal is open
- Number keys are suppressed when the `g` go-to prefix is active

### Keybinding Handler Flow

```
keypress event on search screen
  ├─ Modal/overlay open? → pass to overlay handler
  ├─ Go-to prefix active? → pass to go-to handler
  ├─ Key is Tab? → setActiveTab((activeTab + 1) % 4)
  ├─ Key is Shift+Tab? → setActiveTab((activeTab + 3) % 4)
  ├─ Search input focused?
  │   ├─ Key is 1–9 or 0? → pass through to input as character
  │   ├─ Key is h/l/Left/Right? → pass through to input for cursor
  │   └─ Other → pass to input handler
  ├─ Key is 1–4? → setActiveTab(parseInt(key) - 1)
  ├─ Key is 5–9 or 0? → no-op
  ├─ Key is l/Right? → setActiveTab(Math.min(activeTab + 1, 3))
  ├─ Key is h/Left? → setActiveTab(Math.max(activeTab - 1, 0))
  └─ Other → pass to results list or global handler
```

### Responsive Behavior

| Terminal Width | Label Format | Separator | Padding |
|---------------|-------------|-----------|---------|
| < 80 | N/A (unsupported) | N/A | N/A |
| 80–119 cols | `Repos(N)` (abbreviated + count) | 2 spaces | 1 space |
| 120–199 cols | `Repositories (N)` (full + count) | ` │ ` (space-pipe-space) | 1 space |
| 200+ cols | `Repositories (N)` (full + count) | `    │    ` (4-space-pipe-4-space) | 2 spaces |

### Data Hooks Consumed

| Hook | Source | Purpose |
|------|--------|---------|
| `useKeyboard()` | `@opentui/react` | Capture Tab, Shift+Tab, number keys, arrow keys for tab switching |
| `useTerminalDimensions()` | `@opentui/react` | Determine label format, separator style, and padding |
| `useOnResize()` | `@opentui/react` | Re-layout tab bar synchronously on terminal resize |
| `useSearch()` | `@codeplane/ui-core` | Access `searchRepos`, `searchIssues`, `searchUsers`, `searchCode` — each provides `{ data, loading, error, loadMore }`. The tab navigation reads `data.total_count` for count badges |
| `useNavigation()` | TUI app shell | Read/write `activeTabIndex` and `tabStates` in navigation context for persistence |

The tab navigation component itself only uses `useKeyboard`, `useTerminalDimensions`, `useOnResize`, and `useNavigation` directly. The `useSearch()` hook's individual tab data (`searchRepos.data.total_count`, etc.) is read for rendering count badges. The actual search dispatch, result rendering, and pagination are handled by the individual tab content components (TUI_SEARCH_REPOS_TAB, TUI_SEARCH_ISSUES_TAB, TUI_SEARCH_USERS_TAB, TUI_SEARCH_CODE_TAB).

### Status Bar Hints

When the search screen is active with the results list focused:
```
Tab:tab  1-4:jump  /:input  j/k:nav  Enter:open  q:back
```

When the search input is focused:
```
Tab:tab  Enter:results  Esc:clear  Ctrl+U:clear all  q:back
```

At 80 columns, hints are truncated to the most essential 4:
```
Tab:tab  /:input  Enter:open  q:back
```

### Help Overlay — Search Tabs Group

```
── Search Tabs ─────────────────────
Tab / Shift+Tab    Cycle tabs
1                  Repositories
2                  Issues
3                  Users
4                  Code
h / Left           Previous tab
l / Right          Next tab
```

## Permissions & Security

### Authorization
- Tab navigation is a client-side UI mechanism and requires no specific authorization role
- All authenticated users who can access the search screen can navigate between tabs
- Authorization for search results is enforced at the API layer — each search endpoint applies visibility rules based on the authenticated user
- Repository search results exclude private repositories the user cannot access
- Issue and code search results exclude items from repositories the user cannot access
- User search results are visible to all authenticated users (usernames and display names are non-sensitive)
- No elevated role (admin, org owner) is required to switch search tabs
- The search screen requires authentication; unauthenticated sessions are redirected to the auth error screen before the search screen is reachable

### Token Handling
- Tab navigation does not read, transmit, display, or log any auth tokens
- Token state does not affect tab switching behavior
- The TUI uses token-based auth from CLI keychain (`codeplane auth login`) or `CODEPLANE_TOKEN` environment variable — no OAuth browser flow is triggered by tab navigation
- If the auth token expires while on the search screen, subsequent search requests show "Session expired. Run `codeplane auth login` to re-authenticate." The tab bar itself remains interactive until the auth error propagates to the app shell

### Rate Limiting
- Tab switching itself generates zero API requests — it only swaps which tab's cached results are rendered
- Search API requests are fired per-query (not per-tab-switch) since all 4 endpoints are called in parallel when a query dispatches
- Rapid tab switching does not cause additional API requests unless the user is on a tab that needs to paginate
- Server-side rate limit: 300 requests per minute per authenticated user. With 4 parallel requests per query and 300ms debounce, typical usage stays well under limit
- If any search endpoint returns 429, the affected tab shows "Rate limited. Retry in {Retry-After}s." inline. Other tabs' results remain visible
- No client-side rate limiting is needed for tab switching

### Input Validation
- Active tab index is clamped to 0–3. Values outside this range are ignored
- Tab IDs come from a hardcoded constant array (`SEARCH_TABS`), not from user input or API responses
- Count badge values come from API `total_count` fields; they are rendered as display-only text, never used for navigation logic
- No user-provided text is executed or passed to the API by the tab navigation mechanism itself

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.search.tab_switched` | User switches to a different tab | `from_tab`, `to_tab`, `switch_method` (`cycle`, `shift_cycle`, `number`, `arrow`), `tab_index`, `from_tab_result_count`, `to_tab_result_count`, `query_length`, `query_active` (boolean) |
| `tui.search.tab_viewed` | Tab content becomes visible (results rendered or empty/error state shown) | `tab_id`, `tab_index`, `result_count`, `load_time_ms`, `from_cache`, `query_length` |
| `tui.search.tab_auto_selected` | Active tab auto-switched because previous tab had 0 results on new query | `from_tab`, `to_tab`, `to_tab_result_count`, `query_length` |
| `tui.search.tab_error` | Tab content fails to load (API error on that tab's endpoint) | `tab_id`, `tab_index`, `error_code`, `error_type` (`network`, `timeout`, `rate_limit`, `server_error`, `auth`), `query_length` |

### Common Event Properties

All search tab events include:
- `session_id`: TUI session identifier
- `timestamp`: ISO 8601 event timestamp
- `terminal_width`: Current terminal column count
- `terminal_height`: Current terminal row count
- `breakpoint`: `"minimum"` | `"standard"` | `"large"`
- `color_mode`: `"truecolor"` | `"256"` | `"16"`
- `viewer_id`: Authenticated user ID

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Tab exploration rate | ≥30% of search sessions visit ≥2 tabs | Users discovering results across categories |
| Number-key jump rate | ≥25% of tab switches | Power-user adoption of direct tab jumps |
| Tab/Shift+Tab cycle rate | ≥50% of tab switches | Discoverability of the primary tab navigation |
| Arrow key rate | <20% of tab switches | Arrow keys as secondary/alternative navigation |
| Auto-selection accuracy | <10% of auto-selections followed by immediate manual switch | Auto-selection lands on the right tab |
| Tab switch latency (p50) | <16ms | Render frame time for tab content swap |
| Most-visited tab distribution | Track | Understand which result types users check most (informs tab ordering) |
| Tab switches per search session | ≥1.5 average | Users exploring beyond the default tab |
| Zero-result tab visit rate | Track | How often users visit tabs with (0) results (curiosity vs. confusion) |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Tab switched | `SearchTabs: switched [from={from_tab}] [to={to_tab}] [method={method}]` |
| `debug` | Tab content mount | `SearchTabs: content mount [tab={tab_id}] [has_cache={bool}]` |
| `debug` | Tab key suppressed | `SearchTabs: key suppressed [key={key}] [reason={reason}]` (input_focused, overlay_open, goto_active) |
| `debug` | Tab label format changed | `SearchTabs: label format [format={abbreviated|full}] [width={cols}]` |
| `debug` | Count badge updated | `SearchTabs: count updated [tab={tab_id}] [count={n}]` |
| `info` | Tab auto-selected | `SearchTabs: auto-selected [from={tab}] [to={tab}] [reason=zero_results]` |
| `info` | All tab counts loaded | `SearchTabs: counts loaded [repos={n}] [issues={n}] [users={n}] [code={n}] [total={n}]` |
| `warn` | Tab count fetch failed | `SearchTabs: count fetch failed [tab={tab_id}] [status={code}] [error={msg}]` |
| `warn` | Tab index out of range (clamped) | `SearchTabs: index clamped [requested={n}] [clamped_to={n}]` |
| `error` | Tab render error | `SearchTabs: render error [tab={tab_id}] [error={msg}] [stack={trace}]` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Terminal resize during tab switch | `useOnResize()` fires mid-render | Re-layout tab bar. Active tab preserved. Labels may change format. No crash. |
| SSE disconnect while on search screen | SSE provider emits disconnect | Status bar indicator updates. Tab bar and search unaffected — search uses REST endpoints. |
| API 401 on any search endpoint | Data hook returns 401 | Propagated to app-shell auth error screen. Tab bar becomes unreachable. |
| API 500 on one tab's search endpoint | Data hook returns 500 | Affected tab shows error in content area. Other tabs render normally. Tab bar interactive. |
| API 429 rate limit on one endpoint | Data hook returns 429 | Affected tab shows "Rate limited. Retry in {N}s." Other tabs unaffected. Tab bar interactive. |
| API timeout on search (10s) | Data hook timeout | Affected tab shows "Search timed out. Press R to retry." Tab bar interactive. |
| Rapid tab switching | Multiple `setActiveTab` calls in quick succession | React batches state updates. Final state wins. No intermediate renders. |
| Tab index out of range (programming error) | Value > 3 or < 0 | Clamped to 0–3. Logs warning. Falls back to tab 0 if clamped value is still invalid. |
| Count badge value extremely large | `total_count` > 99999 | Formatted as "100k+". No overflow. |
| Tab content component throws during render | React error boundary per-tab | Error message in content area for that tab. Tab bar remains interactive. Other tabs unaffected. |
| Navigation context lost (provider unmount) | Context provider check | Falls back to default tab (0). Logs warning. Counts reset to null (no badges). |
| All 4 search endpoints fail simultaneously | All tabs return error | All tabs show error state. Tab bar remains interactive. User can retry with `R` on any tab. |
| Search screen remount after error boundary | Component re-initialization | Active tab resets to 0 (Repositories). Query cleared. State starts fresh. |

### Failure Modes and Recovery

- **Stuck tab state**: Active index is a clamped integer in React state. No timeout or external coordination needed. If render fails, error boundary catches it.
- **Tab bar unresponsive**: `useKeyboard` handler is registered at mount. If the handler stops firing, the TUI-level error boundary captures the React error. `Ctrl+C` always exits.
- **Stale count badges**: Counts are derived from the most recent `useSearch()` response. If the response is stale (user changed query but hasn't finished debounce), counts show the previous query's totals until new data arrives. No manual invalidation needed.
- **Memory accumulation**: Tab content is unmounted on switch. Per-tab state is stored in a lightweight ref (scroll position integer + focused index integer + result array reference). Cache is cleared on new query dispatch.

## Verification

### Test File: `e2e/tui/search.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

#### Terminal Snapshot Tests

1. **`search-tab-bar-default-state`** — Navigate to search screen at 120×40. Snapshot. Assert tab bar visible with 4 tabs. No count badges (no query dispatched). Repositories tab active (bold, underline, primary color). Other tabs in muted color.

2. **`search-tab-bar-with-counts`** — Type "api" and wait for results at 120×40. Snapshot. Assert tab bar shows counts on all 4 tabs (e.g., "Repositories (3) │ Issues (12) │ Users (1) │ Code (27)"). Active tab retains bold/underline.

3. **`search-tab-bar-issues-active`** — Type "bug", wait for results, press `2`. Snapshot. Assert Issues tab active (bold, underline, primary). Repositories, Users, Code in muted. Content area shows issue results.

4. **`search-tab-bar-users-active`** — Type "alice", press `3`. Snapshot. Assert Users tab active. Content area shows user results.

5. **`search-tab-bar-code-active`** — Type "handleRequest", press `4`. Snapshot. Assert Code tab active. Content area shows code results.

6. **`search-tab-bar-zero-count-tab`** — Type query that returns 0 users. Snapshot. Assert Users tab shows "(0)" and is still selectable (not hidden, not disabled).

7. **`search-tab-bar-abbreviated-80col`** — Navigate to search, type "test" at 80×24. Snapshot. Assert abbreviated labels: `Repos(N)  Issues(N)  Users(N)  Code(N)`. No pipe separators.

8. **`search-tab-bar-full-labels-120col`** — Navigate to search, type "test" at 120×40. Snapshot. Assert full labels with pipe separators: `Repositories (N) │ Issues (N) │ Users (N) │ Code (N)`.

9. **`search-tab-bar-expanded-200col`** — Navigate to search, type "test" at 200×60. Snapshot. Assert full labels with expanded padding around pipe separators.

10. **`search-tab-bar-large-count`** — Type query returning 15000+ repos. Snapshot. Assert Repositories tab shows "Repositories (15k+)".

11. **`search-tab-bar-no-counts-before-query`** — Open search screen, no query typed. Snapshot. Assert tabs show labels without count badges: "Repositories │ Issues │ Users │ Code".

12. **`search-tab-bar-all-zero-counts`** — Type query returning 0 results on all tabs. Snapshot. Assert all tabs show "(0)". Active tab unchanged.

#### Keyboard Interaction Tests — Tab Cycling

13. **`search-tab-cycle-forward`** — Type query, get results (Repos active). Press `Tab`. Assert Issues tab active (index 1).

14. **`search-tab-cycle-forward-twice`** — Press `Tab` twice from Repos. Assert Users tab active (index 2).

15. **`search-tab-cycle-forward-thrice`** — Press `Tab` three times from Repos. Assert Code tab active (index 3).

16. **`search-tab-cycle-forward-wrap`** — Press `Tab` on Code (tab 4). Assert Repositories tab active (wrapped to index 0).

17. **`search-tab-cycle-backward`** — On Repositories, press `Shift+Tab`. Assert Code tab active (wrapped to index 3).

18. **`search-tab-cycle-backward-from-issues`** — On Issues, press `Shift+Tab`. Assert Repositories tab active (index 0).

19. **`search-tab-full-cycle-forward`** — Press `Tab` 4 times from Repos. Assert back to Repositories (index 0).

20. **`search-tab-full-cycle-backward`** — Press `Shift+Tab` 4 times from Repos. Assert back to Repositories (index 0).

21. **`search-tab-cycle-from-input`** — Focus search input. Press `Tab`. Assert Issues tab active (next from Repos). Search input loses focus to results.

22. **`search-tab-shift-cycle-from-input`** — Focus search input. Press `Shift+Tab`. Assert Code tab active (wrapped from Repos). Search input loses focus to results.

#### Keyboard Interaction Tests — Number Jump

23. **`search-tab-jump-1`** — Press `2` (Issues), then press `1`. Assert Repositories tab active.

24. **`search-tab-jump-2`** — Press `2`. Assert Issues tab active.

25. **`search-tab-jump-3`** — Press `3`. Assert Users tab active.

26. **`search-tab-jump-4`** — Press `4`. Assert Code tab active.

27. **`search-tab-jump-5-noop`** — On Repos. Press `5`. Assert no change (still Repos).

28. **`search-tab-jump-6-noop`** — Press `6`. Assert no change.

29. **`search-tab-jump-7-noop`** — Press `7`. Assert no change.

30. **`search-tab-jump-8-noop`** — Press `8`. Assert no change.

31. **`search-tab-jump-9-noop`** — Press `9`. Assert no change.

32. **`search-tab-jump-0-noop`** — Press `0`. Assert no change.

33. **`search-tab-jump-same-noop`** — On Repos (index 0). Press `1`. Assert no re-render. Content unchanged. Scroll position preserved.

34. **`search-tab-number-suppressed-in-input`** — Focus search input. Press `2`. Assert "2" typed into input, not tab switch. Press `4`. Assert "24" in input.

#### Keyboard Interaction Tests — Arrow Keys

35. **`search-tab-arrow-right`** — On Repos. Press `l`. Assert Issues active.

36. **`search-tab-arrow-left`** — On Issues. Press `h`. Assert Repos active.

37. **`search-tab-arrow-right-no-wrap`** — On Code (index 3). Press `l`. Assert still Code (no wrap).

38. **`search-tab-arrow-left-no-wrap`** — On Repos (index 0). Press `h`. Assert still Repos (no wrap).

39. **`search-tab-arrow-right-key`** — On Repos. Press `Right`. Assert Issues active.

40. **`search-tab-arrow-left-key`** — On Issues. Press `Left`. Assert Repos active.

41. **`search-tab-arrow-suppressed-in-input`** — Focus search input. Type "test". Press `Left`. Assert cursor moves within input, not tab switch.

#### Keyboard Interaction Tests — Suppression

42. **`search-tab-suppressed-during-help`** — Press `?` (help overlay). Press `Tab`. Assert help overlay scrolls or receives key, not tab switch. Press `Esc`. Assert search screen, active tab unchanged.

43. **`search-tab-suppressed-during-command-palette`** — Press `:` (command palette). Press `2`. Assert `2` typed into palette search, not tab switch. Press `Esc`. Assert active tab unchanged.

44. **`search-tab-number-suppressed-during-goto`** — Press `g` (go-to prefix active). Press `4`. Assert go-to handler processes `g 4` (which is a no-op since there's no go-to binding for `4`), not tab switch.

#### Keyboard Interaction Tests — Shared Query

45. **`search-tab-preserves-query-on-switch`** — Type "api gateway". Press `2` (Issues). Assert search input still shows "api gateway". Assert Issues tab shows results for "api gateway".

46. **`search-tab-preserves-query-on-cycle`** — Type "test". Press `Tab` `Tab` `Tab` `Tab`. Assert search input still shows "test" on each tab.

#### Keyboard Interaction Tests — Per-Tab State

47. **`search-tab-preserves-scroll-on-switch`** — On Repos tab, scroll to item 10. Press `2` (Issues). Press `1` (Repos). Assert item 10 still focused.

48. **`search-tab-preserves-focus-on-switch`** — On Repos tab, press `j` `j` `j` (focus item 4). Switch to Code (`4`). Switch back to Repos (`1`). Assert item 4 focused.

49. **`search-tab-state-resets-on-new-query`** — On Repos tab, scroll to item 8. Clear query (`Ctrl+U`). Type new query. Assert Repos tab scroll position reset to item 1.

#### Keyboard Interaction Tests — Auto-Selection

50. **`search-tab-auto-selects-first-with-results`** — On Issues tab (tab 2). Type a query that returns 0 issues but 5 repos. Assert Repositories tab auto-selected.

51. **`search-tab-stays-on-active-if-has-results`** — On Issues tab. Type a query that returns results on all tabs including Issues. Assert Issues tab remains active.

52. **`search-tab-stays-if-all-zero`** — On Issues tab. Type a query returning 0 on all tabs. Assert Issues tab remains active (no auto-selection to another 0-result tab).

#### Keyboard Interaction Tests — Content Area

53. **`search-tab-switch-replaces-content`** — On Repos (see repo results). Press `2`. Assert issue results visible. Repo results gone.

54. **`search-tab-switch-preserves-tab-bar`** — Switch through all 4 tabs. Assert tab bar always visible with correct tab highlighted on each switch.

55. **`search-tab-content-error-does-not-break-tabs`** — Tab 4 (Code) returns API error. Assert error in Code content area. Press `1` (Repos). Assert Repos loads normally. Press `4` (Code). Assert error still shown.

#### Active Tab Persistence Tests

56. **`search-tab-persists-across-navigation`** — Press `3` (Users tab). Navigate to a user detail via `Enter`. Press `q` to return. Assert Users tab still active.

57. **`search-tab-persists-across-goto`** — On Code tab (3). Press `g d` (go-to Dashboard). Press `g s` (go-to Search). Assert Code tab still active. Query preserved.

58. **`search-tab-persists-across-resize`** — On Issues tab at 120×40. Resize to 80×24. Assert Issues tab still active. Labels switched to abbreviated.

59. **`search-tab-resets-on-fresh-mount`** — Exit search screen completely (navigation stack clears it). Re-navigate to search. Assert Repositories tab active (index 0).

#### Rapid Input Tests

60. **`search-tab-rapid-number-keys`** — Press `1` `3` `4` in rapid succession (<50ms between). Assert Code tab active (index 3, last pressed).

61. **`search-tab-rapid-tab-cycling`** — Press `Tab` 8 times rapidly. Assert active tab is (0 + 8) % 4 = 0 (Repos).

62. **`search-tab-rapid-mixed-input`** — Press `Tab`, `3`, `Shift+Tab`, `4` rapidly. Assert Code tab active (last effective input).

#### Responsive Tests

63. **`search-tab-bar-at-80x24`** — 80×24. Navigate to search, type query. Assert abbreviated labels with counts. All 4 tabs visible. Active tab styled.

64. **`search-tab-bar-at-120x40`** — 120×40. Type query. Assert full labels with pipe separators and counts.

65. **`search-tab-bar-at-200x60`** — 200×60. Type query. Assert full labels with expanded padding.

66. **`search-tab-resize-120-to-80`** — Start at 120×40 on Issues tab. Resize to 80×24. Assert Issues still active. Labels switch to abbreviated.

67. **`search-tab-resize-80-to-120`** — Start at 80×24 on Code tab. Resize to 120×40. Assert Code still active. Labels switch to full.

68. **`search-tab-resize-below-minimum`** — Start at 80×24. Resize to 60×20. Assert "terminal too small" message. Resize back to 80×24. Assert search screen restored with previous active tab.

69. **`search-tab-rapid-resize`** — On Users tab. Resize 120→80→200→100→150 rapidly. Assert clean layout at final size. Users tab still active.

#### Integration Tests

70. **`search-tab-help-overlay-includes-tabs`** — Press `?`. Assert "Search Tabs" group with entries for Tab/Shift+Tab, 1-4, h/Left, l/Right.

71. **`search-tab-status-bar-hints-results`** — Type query, get results. Assert status bar includes `Tab:tab` and `1-4:jump`.

72. **`search-tab-status-bar-hints-input`** — Focus search input. Assert status bar includes `Tab:tab`.

73. **`search-tab-all-four-apis-called`** — Type "test". Assert 4 concurrent API requests dispatched: `/api/search/repositories`, `/api/search/issues`, `/api/search/users`, `/api/search/code`.

74. **`search-tab-count-badge-updates`** — Type "test" → assert counts appear. Type "testing" (refine) → assert counts update to new values.

75. **`search-tab-deep-link-default`** — Launch `codeplane tui --screen search`. Assert Repositories tab active as default.

76. **`search-tab-goto-from-search`** — On Issues tab. Press `g d` (go-to Dashboard). Assert dashboard pushed. Press `g s`. Assert search restored with Issues tab.
