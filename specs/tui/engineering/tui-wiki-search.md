# Engineering Specification: TUI_WIKI_SEARCH

## High-Level User POV

Wiki Search is the keyboard-driven search capability embedded within the Wiki List screen of the Codeplane TUI. It allows a developer to rapidly locate wiki pages within a repository by typing a query that matches against page titles, slugs, and body content — all without leaving the wiki list or navigating to a separate screen. The search is activated by pressing `/` from the wiki list, which focuses the search input in the persistent toolbar immediately below the title row.

When the user presses `/`, the cursor moves into the search input and the placeholder text "Search wiki pages…" clears. As the user types, the query is debounced by 300ms and then dispatched to the wiki API's server-side search endpoint (`GET /api/repos/:owner/:repo/wiki?q=<query>&page=1&per_page=30`). The wiki list below the input replaces with matching pages ranked by relevance — the server applies intelligent ranking: exact slug matches appear first, followed by exact title matches, then title prefixes, slug prefixes, and finally body content matches. While the search request is in flight, a "Searching…" indicator appears in the match count area. When results arrive, the list repopulates and the first matching result is automatically focused.

Each result row displays the page title (with matching text segments highlighted in `primary` accent color), the slug in muted text (also highlighted where matching), the author login, and a relative timestamp. The highlight makes it immediately obvious why each result matched the query. Navigation within results uses vim-style `j`/`k` keys and arrow keys. Pressing `Enter` on a focused result pushes the wiki page detail view onto the navigation stack. Pressing `q` from the detail view returns to the wiki list with the search query, results, and cursor position preserved.

A match count badge appears to the right of the search input: "N results" in muted color (or "1 result" singular), derived from the `X-Total-Count` response header. When zero pages match, the badge shows "No results" in warning color and the list area displays "No wiki pages match '{query}'" with a hint "Press Esc to clear search."

The search input supports standard editing: `Backspace` deletes the last character, `Ctrl+W` deletes the last word, and `Ctrl+U` clears the entire query text without dismissing the input. Pressing `Enter` while the search input is focused closes the input and moves focus to the first result in the filtered list — the query remains active and results are preserved. Pressing `Esc` clears the search query, re-fetches the unfiltered wiki page list from the server, and returns focus to the list. If the search input is empty and no search was previously active, `Esc` behaves as a standard back action (same as `q` — popping the wiki list screen).

The search integrates cleanly with the wiki list's existing pagination and lifecycle. When a search query is submitted, pagination resets to page 1. Search results are paginated identically to the unfiltered list (30 items per page, 500-item memory cap). The user can scroll through search results and trigger additional page loads at the 80% scroll threshold. The header count updates to reflect search results: "Wiki (3)" instead of "Wiki (23)" during an active search.

At minimum terminal size (80×24), the search input spans the full content width and result rows show only the title and timestamp. At standard (120×40), the search input takes 70% width with the match count always visible, and result rows include title, slug, author, and timestamp — all with match highlighting. At large (200×60+), the input is 60% width and result rows use wider columns. The search input maximum length is 120 characters — additional characters are silently ignored. Long queries that exceed the visible input width scroll horizontally within the input.

The search state is preserved when navigating to a page detail and returning, but is cleared when leaving the wiki screen entirely (via go-to navigation or when the screen is unmounted and re-mounted). Within the wiki screen, the search acts as a transient filter on the page list.

## Acceptance Criteria

### Definition of Done

- [ ] Pressing `/` from the wiki list screen focuses the search input rendered in the persistent search toolbar below the title row
- [ ] The search input displays a `/ ` prefix indicator in `muted` color (ANSI 245) and accepts keyboard text input
- [ ] The search input placeholder reads "Search wiki pages…" in `muted` color when empty and unfocused
- [ ] Typing in the search input dispatches a debounced (300ms) server-side search request to `GET /api/repos/:owner/:repo/wiki?q={query}&page=1&per_page=30`
- [ ] The search is entirely server-side — no client-side filtering is performed
- [ ] The query parameter `q` is URL-encoded before dispatch
- [ ] Queries that are empty or whitespace-only after trimming do not dispatch an API request; the full page list is shown instead
- [ ] Server-side search matches against wiki page title, slug, and body content using case-insensitive `ILIKE`
- [ ] Server-side results are ranked by relevance: exact slug match → exact title match → title prefix → slug prefix → body content match
- [ ] A match count badge renders to the right of the search input: "N results" in `muted` (ANSI 245), "1 result" (singular), or "No results" in `warning` (ANSI 178) when zero pages match
- [ ] The match count is derived from the `X-Total-Count` response header, not from the count of items on the current page
- [ ] Matching text segments in wiki page titles are highlighted with `primary` color (ANSI 33) in the result rows
- [ ] Matching text segments in wiki page slugs are highlighted with `primary` color at standard and large terminal sizes
- [ ] Pressing `Enter` while search input is focused closes the input and returns focus to the filtered wiki page list, preserving results
- [ ] Pressing `Esc` while search input has text clears the query, re-fetches the unfiltered list from the server, and returns focus to the list
- [ ] Pressing `Esc` while search input is empty and a search was previously active clears the active search and restores the full list
- [ ] Pressing `Esc` while search input is empty and no search was active behaves as the standard back action (pop screen)
- [ ] When a search query is submitted, pagination resets to page 1
- [ ] The wiki page list cursor resets to the first result when search results arrive
- [ ] When the search produces zero results, the list area shows "No wiki pages match '{query}'" centered in `muted` color with a hint "Press Esc to clear search"
- [ ] The header count updates to reflect search results: "Wiki (N)" where N is the search result `X-Total-Count`
- [ ] After locking search results with `Enter`, pressing `/` re-opens the search input with the previous query pre-filled
- [ ] Returning from wiki detail view via `q` preserves search results and cursor position
- [ ] The breadcrumb reads "Dashboard > owner/repo > Wiki" regardless of search state
- [ ] Search results use page-based pagination with `page` and `per_page` query parameters (default 30 per page)
- [ ] Pagination loads the next page when scroll position reaches 80% of content height
- [ ] Memory cap: 500 wiki pages max loaded during search. After cap, footer shows "Showing 500 of N pages"
- [ ] The search toolbar is always visible — it is not conditionally rendered

### Keyboard Interactions

- [ ] `/`: Focus the search input (from wiki list context, not when already in search input or in delete confirmation)
- [ ] Any printable character: Appended to the search query while input is focused
- [ ] `Backspace`: Deletes last character from the search query
- [ ] `Ctrl+U`: Clears the entire search query text (while input is focused); does not dismiss search or submit
- [ ] `Ctrl+W`: Deletes last word from the search query (while input is focused)
- [ ] `Enter`: Submit search query (fires immediate request cancelling any pending debounce), close input, return focus to filtered list
- [ ] `Esc` (search input, query non-empty): Clear query, re-fetch unfiltered list, return focus to list
- [ ] `Esc` (search input, query empty, previous search active): Clear active search, restore full list, return focus to list
- [ ] `Esc` (search input, query empty, no previous search): Pop screen (same as `q`)
- [ ] `Ctrl+C`: Quit TUI (global binding, overrides search input)
- [ ] `j`/`k`/`Down`/`Up`: While search input is focused, these keys type characters into the input (no list navigation)
- [ ] `q`/`c`/`d`/`G`/`g`: While search input is focused, types into query (not actions)
- [ ] `/`: While search input is already focused, types literal `/` into query

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the app shell
- [ ] 80×24 – 119×39: Search input full width minus 2 padding. Match count hidden if overlaps query. Result rows: title + timestamp only
- [ ] 120×40 – 199×59: Search input 70% width. Match count always visible. Result rows: title (45ch) + slug (25ch) + author (12ch) + timestamp (4ch) — all with highlighting
- [ ] 200×60+: Search input 60% width. Match count always visible. Result rows: title (70ch) + slug (35ch) + author (15ch) + timestamp (4ch)
- [ ] Terminal resize preserves query text, cursor position, and focused row

### Truncation & Boundary Constraints

- [ ] Search query maximum: 120 characters, additional input silently ignored
- [ ] Query exceeding visible width: horizontal scroll within input, cursor always visible
- [ ] Title highlight across truncation: highlight applies to visible portion only
- [ ] Match count format: "N results" (2+), "1 result" (singular), "No results" (0). Max 15 characters
- [ ] Results per page: 30 items. Memory cap: 500 items
- [ ] Debounce delay: 300ms
- [ ] Page title max display: 200ch hard truncation
- [ ] Timestamps: max 4ch ("3d", "1w", "2mo", "1y", "now")
- [ ] Total count abbreviated above 9999 (e.g., "10K")

## Implementation Plan

### Step 1: Create Search State Hook
**File**: `apps/tui/src/screens/Wiki/hooks/useWikiSearch.ts`
- Initialize `searchQuery` string state for raw input.
- Initialize `activeQuery` string state for debounced/submitted input.
- Initialize `isSearchFocused` boolean state.
- Create a `useEffect` with a 300ms `setTimeout` to sync `searchQuery` to `activeQuery`. Clean up timeout on subsequent keystrokes to implement debounce.
- Expose a `submitImmediate` function to bypass debounce on `Enter`.
- Expose `clearSearch` to reset both `searchQuery` and `activeQuery` to empty strings.
- Manage memory caps or constraints by defining local constant `MAX_QUERY_LENGTH = 120`. Apply truncation synchronously inside `setSearchQuery`.

### Step 2: Implement WikiSearchInput Component
**File**: `apps/tui/src/screens/Wiki/components/WikiSearchInput.tsx`
- Build a responsive layout using `<box flexDirection="row">`.
- Render a muted `/ ` prefix using `<text>`.
- Use OpenTUI's `<input>` primitive to capture user text. Handle constraints natively or mask via `onChange` callback from `useWikiSearch`.
- Render the badge count `<text>` component based on `totalCount` and `isLoading` props. Use warning colors (ANSI 178) for zero results.
- Implement explicit keyboard interceptors for the input box:
  - `Enter`: Trigger `submitImmediate()` and remove focus.
  - `Esc`: Trigger `clearSearch()` if non-empty, or unfocus.
  - `Ctrl+U`: Clear input value, maintain focus.
  - `Ctrl+W`: Regex-based word deletion, maintain focus.
- Calculate width allocations: 100% (-2) for minimum breakpoint, 70% for standard, 60% for large using `useTerminalDimensions()` or `useLayout()`.

### Step 3: Integrate Search into WikiListScreen
**File**: `apps/tui/src/screens/Wiki/WikiListScreen.tsx`
- Mount `useWikiSearch()` and retrieve state variables.
- Pass `activeQuery` as the `q` parameter to `useWikiPages(owner, repo, { q: activeQuery })` from `@codeplane/ui-core`. Ensure empty queries send `undefined` or strip the parameter to fetch the unfiltered list.
- Register screen-level keybindings:
  - `/`: Call `focusSearchInput()` (set `isSearchFocused` to true).
- Modify the `HeaderBar` dynamic title payload to reflect search result counts instead of total repo pages when `activeQuery` is truthy.
- Replace the static toolbar with `WikiToolbar` containing the `WikiSearchInput`.
- Render a "No results" box with centered message and instructions if `!isLoading && items.length === 0 && activeQuery`.

### Step 4: Enhance List Rendering with Match Highlights
**File**: `apps/tui/src/screens/Wiki/components/WikiListRow.tsx` (or inline rendering logic)
- Consume the `HighlightedText` component for rendering titles and slugs.
- Pass `activeQuery` string to `HighlightedText` alongside the text value. Ensure truncation rules apply *after* calculating match boundaries, or that the component handles substring styling natively.

## Unit & Integration Tests

All tests target `e2e/tui/wiki.test.ts` utilizing the `@microsoft/tui-test` framework.

### Terminal Snapshot Tests
- **SNAP-WIKI-SEARCH-001**: Verify search input activated at 120×40 (shows `/ ` prefix, cursor).
- **SNAP-WIKI-SEARCH-002**: Search with query and results at 120×40 (highlighted titles/slugs, "3 results").
- **SNAP-WIKI-SEARCH-003**: Zero results at 120×40 ("No wiki pages match...", "Press Esc").
- **SNAP-WIKI-SEARCH-004**: Search input at 80×24 (full width, right-aligned match count).
- **SNAP-WIKI-SEARCH-005**: Search results at 80×24 (title+timestamp only).
- **SNAP-WIKI-SEARCH-006**: Search input at 200×60 (60% width).
- **SNAP-WIKI-SEARCH-007**: Highlighted title and slug at 120×40 (primary color).
- **SNAP-WIKI-SEARCH-008**: "Searching…" loading state at 120×40.
- **SNAP-WIKI-SEARCH-009**: Server error state ("Search failed").
- **SNAP-WIKI-SEARCH-010**: Locked results after Enter (header updated).
- **SNAP-WIKI-SEARCH-011**: Focused result row (reverse video after `j`).
- **SNAP-WIKI-SEARCH-012**: Singular match count ("1 result").
- **SNAP-WIKI-SEARCH-013**: Header count update ("Wiki (3)").
- **SNAP-WIKI-SEARCH-014**: Dashed separator validation.
- **SNAP-WIKI-SEARCH-015**: Long query horizontal scroll at 80×24.
- **SNAP-WIKI-SEARCH-016**: Pagination cap message ("Showing 500 of 600").

### Keyboard Interaction Tests
- **KEY-WIKI-SEARCH-001**: `/` activates input.
- **KEY-WIKI-SEARCH-002**: Typing triggers 300ms debounced request.
- **KEY-WIKI-SEARCH-003**: `Backspace` deletes char and re-debounces.
- **KEY-WIKI-SEARCH-004**: `Ctrl+U` clears query text.
- **KEY-WIKI-SEARCH-005**: `Ctrl+W` deletes last word.
- **KEY-WIKI-SEARCH-006**: `Enter` closes input, focuses list.
- **KEY-WIKI-SEARCH-007**: `Enter` fires immediate search.
- **KEY-WIKI-SEARCH-008**: `Esc` clears query and re-fetches.
- **KEY-WIKI-SEARCH-009**: `Esc` with empty query pops screen.
- **KEY-WIKI-SEARCH-010**: `Esc` with empty query clears active search.
- **KEY-WIKI-SEARCH-011**: `j/k/q/c/d` captured as text.
- **KEY-WIKI-SEARCH-012**: `/` in input types literal slash.
- **KEY-WIKI-SEARCH-013**: `/` re-opens input with previous query.
- **KEY-WIKI-SEARCH-014**: `j/k` navigation in results, `Enter` opens.
- **KEY-WIKI-SEARCH-015**: Return from detail preserves search.
- **KEY-WIKI-SEARCH-016**: `/` during load is no-op.
- **KEY-WIKI-SEARCH-017**: `Ctrl+C` quits during search.
- **KEY-WIKI-SEARCH-018**: Rapid typing triggers single request.
- **KEY-WIKI-SEARCH-019**: Match count updates.
- **KEY-WIKI-SEARCH-020**: Case-insensitive highlighting verified.
- **KEY-WIKI-SEARCH-021**: Delete page from results.
- **KEY-WIKI-SEARCH-022**: Create page re-fetches.
- **KEY-WIKI-SEARCH-023**: Pagination within search results.
- **KEY-WIKI-SEARCH-024**: Search cancels in-flight pagination.
- **KEY-WIKI-SEARCH-025**: `G` and `g g` inside search results.
- **KEY-WIKI-SEARCH-026**: `Ctrl+D/U` paging.
- **KEY-WIKI-SEARCH-027**: Special chars URL-encoded.
- **KEY-WIKI-SEARCH-028**: Whitespace-only query ignored.
- **KEY-WIKI-SEARCH-029**: `/` during delete confirmation no-op.
- **KEY-WIKI-SEARCH-030**: `R` retries failed search.

### Responsive Tests
- **RESIZE-WIKI-SEARCH-001**: 80×24 layout validation.
- **RESIZE-WIKI-SEARCH-002**: 120×40 layout validation.
- **RESIZE-WIKI-SEARCH-003**: 200×60 layout validation.
- **RESIZE-WIKI-SEARCH-004**: 120→80 collapses slug/author.
- **RESIZE-WIKI-SEARCH-005**: 80→120 reveals slug/author.
- **RESIZE-WIKI-SEARCH-006**: Cursor position preserved.
- **RESIZE-WIKI-SEARCH-007**: Resize during in-flight fetch.
- **RESIZE-WIKI-SEARCH-008**: Match count hidden at 80×24 for long query.
- **RESIZE-WIKI-SEARCH-009**: Match count reappears after resize larger.
- **RESIZE-WIKI-SEARCH-010**: Zero results message re-centers.
- **RESIZE-WIKI-SEARCH-011**: Rapid resize without artifacts.

### Integration Tests
- **INT-WIKI-SEARCH-001**: Full flow.
- **INT-WIKI-SEARCH-002**: API called with `q`, `page`, `per_page`.
- **INT-WIKI-SEARCH-003**: Results replace list, header updates.
- **INT-WIKI-SEARCH-004**: `Esc` re-fetches list.
- **INT-WIKI-SEARCH-005**: Pagination preserves `q`.
- **INT-WIKI-SEARCH-006**: Pagination cap at 500.
- **INT-WIKI-SEARCH-007**: Auth expiry → error screen.
- **INT-WIKI-SEARCH-008**: 429 → "Rate limited".
- **INT-WIKI-SEARCH-009**: Timeout → "Search timed out".
- **INT-WIKI-SEARCH-010**: 500 → "Search failed".
- **INT-WIKI-SEARCH-011**: Debounce prevents excessive reqs.
- **INT-WIKI-SEARCH-012**: Debounce cancels on new key.
- **INT-WIKI-SEARCH-013**: In-flight abort on query change.
- **INT-WIKI-SEARCH-014**: Result ranking verified.
- **INT-WIKI-SEARCH-015**: `X-Total-Count` mapped to badge.
- **INT-WIKI-SEARCH-016**: State preserved across detail view.
- **INT-WIKI-SEARCH-017**: State cleared on screen exit.
- **INT-WIKI-SEARCH-018**: Delete updates count.
- **INT-WIKI-SEARCH-019**: `Enter` without changes skips fetch.
- **INT-WIKI-SEARCH-020**: Unicode URL-encoding.

### Edge Case Tests
- **EDGE-WIKI-SEARCH-001**: Unicode in query.
- **EDGE-WIKI-SEARCH-002**: 120-char limit enforcement.
- **EDGE-WIKI-SEARCH-003**: SQL wildcard chars.
- **EDGE-WIKI-SEARCH-004**: Empty repo handling.
- **EDGE-WIKI-SEARCH-005**: Rapid `/` → `Esc` → `/`.
- **EDGE-WIKI-SEARCH-006**: ANSI escapes stripped.
- **EDGE-WIKI-SEARCH-007**: Long title match near truncation.
- **EDGE-WIKI-SEARCH-008**: Concurrent resize + keypress.
- **EDGE-WIKI-SEARCH-009**: Single character query.
- **EDGE-WIKI-SEARCH-010**: Debounce cancelled on `Esc`.
- **EDGE-WIKI-SEARCH-011**: Body match fallback.
- **EDGE-WIKI-SEARCH-012**: 500-item memory cap.
- **EDGE-WIKI-SEARCH-013**: Missing author field.
- **EDGE-WIKI-SEARCH-014**: Pasted text exceeding length.