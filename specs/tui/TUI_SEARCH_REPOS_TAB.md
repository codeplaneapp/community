# TUI_SEARCH_REPOS_TAB

Specification for TUI_SEARCH_REPOS_TAB.

## High-Level User POV

Full narrative of the search-to-navigate flow: user presses `g s` or `/` to reach search, types a query into the search input, results appear in the Repos tab with debounced API calls (300ms), browse results with j/k navigation, press Enter to open a repository detail screen. Tab persistence ensures returning to search preserves the last query and results. Empty state shows search prompt, zero-results state shows helpful message. All interactions are keyboard-driven with vim-style navigation.

## Acceptance Criteria

70+ checkboxes covering: definition of done (repo results render with owner/name, description, star count, language, updated-at; cursor navigation works; Enter opens repo detail; pagination loads at 80% scroll), keyboard interactions (j/k, G/gg, Ctrl+D/U, Enter, Tab/Shift+Tab between search tabs, / to focus input, Esc to clear), responsive behavior (80×24 hides description+language columns and truncates repo name to 40ch; 120×40 shows all columns; 200×60 shows extended descriptions), truncation constraints (repo names ellipsized, descriptions capped per breakpoint), and edge cases (empty query, no results, API errors with R to retry, token expiry, special characters in queries).

## Design

Three ASCII layout diagrams for empty state, results state, and zero-results state. Complete OpenTUI component tree using <box>, <scrollbox>, <input>, <text> with SearchScreen, SearchInput, TabBar, RepoResultsList, RepoResultRow components. Responsive column specifications at three breakpoints: 80×24 (name + stars only), 120×40 (name + description + language + stars + updated), 200×60 (wider columns with extended descriptions). Keybinding reference table for all search-specific keys. Data hooks: useSearch() from @codeplane/ui-core with query/type/cursor params, useNavigation() for push/pop, useTerminalDimensions() for responsive layout.

## Permissions & Security

Auth roles table mapping anonymous (no access), authenticated user (search own + public repos), org member (search org repos), admin (search all repos). Token handling via CLI keychain or CODEPLANE_TOKEN env var, 401 triggers 'session expired' message. Rate limiting at 300 requests/min server-side plus 300ms client-side debounce. Input sanitization using plainto_tsquery to prevent injection, query length capped at 256 characters, HTML entities escaped in rendered results.

## Telemetry & Product Analytics

11 business events with property schemas: search.query_submitted (query, tab, timestamp), search.repos_tab_viewed, search.result_clicked (repo_id, position, query), search.pagination_triggered (page, query), search.query_cleared, search.tab_switched (from_tab, to_tab), search.zero_results (query), search.error_displayed (error_type), search.retry_triggered, search.debounce_cancelled, search.session_duration. 10 success indicators with targets: p50 time-to-first-result <500ms, zero-result rate <15%, click-through rate >40%, retry rate <5%, error rate <1%, pagination usage >20% of sessions with results, tab switch rate, average results per query, search abandonment rate <30%, session duration.

## Observability

16 log entries covering: search query dispatched, API response received, pagination cursor advanced, debounce timer started/cancelled, SSE reconnection during search, component mount/unmount, error boundary triggered, auth token refresh attempted, terminal resize during search, cache hit/miss, scroll position tracked, tab switch logged, input focus gained/lost, results rendered, empty state displayed. 14 error cases with detection and recovery: API timeout (detect via 10s threshold, show retry prompt), 401 auth error (detect via status code, show re-auth message), 429 rate limit (detect via status code, show backoff timer), network disconnect (detect via fetch failure, show offline indicator), malformed API response (detect via schema validation, show generic error), SSE drop during search, empty response body, server 500, query too long, invalid cursor, component render error, memory pressure, terminal too small, concurrent search race condition. 5 failure modes: total API outage, degraded search performance, partial results, stale cache, auth token rotation during active search.

## Verification

83 tests targeting e2e/tui/search.test.ts using @microsoft/tui-test: 19 snapshot tests (empty state render, single result, multiple results, zero results, error state, loading spinner, pagination loading indicator, focused row highlight, truncated repo name at each breakpoint, tab bar active state, search input with query text, status bar keybinding hints, modal overlay interaction, header breadcrumb showing 'Search', long description truncation, special characters in results, starred repo indicator, language color badge, updated-at relative time). 33 keyboard tests (j/k navigation, Enter to open, G jump to bottom, gg jump to top, Ctrl+D/U page down/up, / focus input, Esc clear input, Tab/Shift+Tab cycle tabs, 1-9 jump to tab, q to go back, : command palette, ? help overlay, Space no-op in search, typing query triggers debounce, backspace updates query, Enter in input submits search, arrow keys in input move cursor, Ctrl+C quits). 15 responsive tests (column visibility at each breakpoint, sidebar collapse at 80×24, truncation lengths, modal width adjustment, status bar content at minimum size). 16 integration tests (API call with correct query params, cursor-based pagination, error retry with R key, auth token included in requests, debounce timing verification, tab persistence on back-navigation, concurrent query cancellation, empty query returns no API call, search results update on new query, navigation stack push on Enter, loading state during fetch, cache behavior on repeated queries, SSE reconnection during search, rate limit handling, special character encoding, large result set scrolling).
