# Research Document: TUI_SEARCH_ISSUES_TAB

## Overview
This document provides technical context and implementation guidelines for the `TUI_SEARCH_ISSUES_TAB` feature, which introduces a cross-repository issue search results tab into the global TUI Search screen. The research covers specifications, existing architectural patterns, hooks, and routing considerations.

## 1. Specification References

The primary specification for this feature is located at `specs/tui/TUI_SEARCH_ISSUES_TAB.md`. 

Key requirements from the spec:
- **Location**: Second tab in the global search screen (accessible via `2` or `Tab`/`Shift+Tab`).
- **Functionality**: Full-text search across all accessible repositories matching the current query.
- **Data Source**: Fetched via `GET /api/search/issues?q={query}&page={page}&per_page=30`.
- **Filtering**: Inline state filter supporting `Open`, `Closed`, and `All`, cycled via the `o` key. Changing this filter only re-queries the issues endpoint, preserving the state of other search tabs.
- **Pagination**: Infinite scrolling capped at 300 total items (10 pages), triggering when the scroll position reaches 80%.
- **Navigation**: Selecting an issue (`Enter`) pushes `ScreenName.IssueDetail` onto the navigation stack (`Search > owner/repo > Issues > #N`). Pressing `q` returns to the search screen with all tab states preserved.

## 2. API & Data Hooks Context

Based on findings in `specs/tui/engineering/tui-search-data-hooks.md` and `specs/tui/TUI_SEARCH_ISSUES_TAB.md`, the data retrieval mechanism follows these patterns:

- **API Client**: The UI consumes the `@codeplane/ui-core`'s `useSearch()` hook, specifically utilizing the `searchIssues` property.
- **Hook Signature**: The `searchIssues` hook exposes `{ data, loading, error, loadMore }`.
- **State Management**: Orchestration of parallel search queries (Repos, Issues, Users, Code) is managed by a hook defined as `useSearchTabs()` located (or to be created) in `apps/tui/src/hooks/useSearchTabs.ts`.
- **Type Definitions**: The data type `IssueSearchResult` is expected to be defined in `apps/tui/src/hooks/useSearchTabs.types.ts`.

## 3. UI and OpenTUI Layout Constraints

The TUI must adapt to three predefined terminal breakpoints (`minimum`, `standard`, `large`), leveraging OpenTUI React 19 primitives:

### OpenTUI Components
- `<box>`: For main structural layout and flex directions.
- `<scrollbox>`: Used for the issue results list, with an `onScrollEnd` event bound to `loadMore`.
- `<text>`: Used for rendering text with specific ANSI color themes.

### Breakpoint Formatting
- **Minimum (`80x24`)**: `#number title state_icon` only. Repository context and timestamp are hidden. State filter bar is hidden.
- **Standard (`120x40`)**: `owner/repo #number title state_badge timestamp`. State filter bar is visible.
- **Large (`200x60+`)**: Expanded format preventing title truncation where possible.

### Styling Tokens
- **Open State**: Green `●` (`ANSI 34`). Token: `theme.tokens.success`.
- **Closed State**: Red `○` (`ANSI 196`). Token: `theme.tokens.error`.
- **Repo Context/Timestamp**: Muted (`ANSI 245`). Token: `theme.tokens.muted`.
- **Issue Number**: Primary blue (`ANSI 33`). Token: `theme.tokens.primary`.
- **Focus**: Active items utilize reverse video background.

## 4. Routing Context

According to `apps/tui/src/router/registry.ts` and `apps/tui/src/router/types.ts`:
- The target screen for opening an issue is `ScreenName.IssueDetail`.
- The route parameters should include the repo owner, repo name, and issue number.
- `useNavigation` hook (`apps/tui/src/providers/NavigationProvider.ts`) must be used for `push` and `pop` actions.

## 5. Keyboard Navigation Requirements

Custom keyboard handling should be orchestrated using the `@opentui/react` `useKeyboard()` hook with the following mappings when the Issues tab is active:
- `j` / `Down`: Move cursor down.
- `k` / `Up`: Move cursor up.
- `Enter`: Trigger navigation to `ScreenName.IssueDetail`.
- `G`: Jump to the bottom of the loaded list.
- `g g`: Jump to the top of the list.
- `Ctrl+D` / `Ctrl+U`: Page down / Page up.
- `o`: Toggle state filter (`All` -> `Open` -> `Closed` -> `All`).
- `/`: Focus the global search input.
- `R`: Retry failed API requests.
- `q`: Pop the current screen (return to previous).

## 6. Telemetry & Analytics Requirements

The implementation must dispatch the following telemetry events:
- `tui.search.issues_tab.viewed`
- `tui.search.issues_tab.result_opened`
- `tui.search.issues_tab.filter_changed`
- `tui.search.issues_tab.paginated`
- `tui.search.issues_tab.error`
- `tui.search.issues_tab.retry`
- `tui.search.issues_tab.zero_results`

These events should include common properties like `session_id`, `query_length`, `terminal_width`, `terminal_height`, and `breakpoint`.

## 7. Next Steps for Implementation

1. Ensure `apps/tui/src/hooks/useSearchTabs.ts` and `apps/tui/src/hooks/useSearchTabs.types.ts` are scaffolding `IssueSearchResult` and the `searchIssues` hook.
2. Create the `SearchIssuesTab` wrapper component in the search screens directory.
3. Create the `IssueSearchRow` sub-component that handles the responsive line formatting and focus highlighting.
4. Wire up the `useKeyboard` logic specifically restricted to when `activeTab === 'issues'`.
5. Write corresponding E2E tests in `e2e/tui/search.test.ts` focusing on the snapshot, keybinding, responsive, and integration targets listed in the specification.