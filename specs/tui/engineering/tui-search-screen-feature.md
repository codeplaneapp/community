# Engineering Specification: TUI_SEARCH_SCREEN

## 1. Overview
The `TUI_SEARCH_SCREEN` feature implements the global cross-repository search interface for the Codeplane TUI. It allows users to search across Repositories, Issues, Users, and Code using a single debounced input, with results grouped into navigable tabs. The implementation relies exclusively on the OpenTUI React 19 reconciler and shared data hooks from `@codeplane/ui-core`.

## 2. Architecture & File Structure

All feature implementation will target `apps/tui/src/screens/search/` and be registered in the central screen router.

**File Layout:**
```text
apps/tui/src/
  screens/
    search/
      SearchScreen.tsx                 # Main screen component
      hooks/
        useSearchLogic.ts              # Debounce, auto-tab selection, data orchestration
      components/
        SearchInput.tsx                # Input component with cursor & key capture
        SearchTabBar.tsx               # Responsive tab bar with counts
        SearchResultList.tsx           # Wrapper around ScrollableList
        SearchResultRow.tsx            # Row renderers (Repos, Issues, Users, Code)
e2e/tui/
  search.test.ts                       # E2E test file using @microsoft/tui-test
```

## 3. Implementation Plan

### Phase 1: Data Orchestration & Hooks (`useSearchLogic.ts`)
1. **Debounce Logic**: Create a local state `query` for the raw input and a `debouncedQuery` state updated via a 300ms `setTimeout` (cleared on subsequent typing).
2. **API Consumption**: Call `@codeplane/ui-core`'s `useSearch(debouncedQuery)` which internally dispatches the 4 parallel requests (`searchRepos`, `searchIssues`, `searchUsers`, `searchCode`).
3. **Tab State**: Maintain `activeTab` state (`'repos' | 'issues' | 'users' | 'code'`).
4. **Auto-Selection**: Implement a `useEffect` that watches the loading state and results of the 4 endpoints. When data arrives, if the current `activeTab` has 0 results and another tab has >0, automatically update `activeTab` to the first populated tab.
5. **Pagination Guard**: Expose `fetchMore` callbacks for each tab, applying a cap of 300 items (`items.length >= 300`).

### Phase 2: Component Implementation

**`SearchInput.tsx`**
- Use OpenTUI's `<input>` wrapped in a `<box flexDirection="row">`.
- Display a static `🔍 ` text prefix.
- Manage a local `isFocused` prop.
- **Constraints**: Enforce a 120-character maximum via `onChange={(val) => setQuery(val.slice(0, 120))}`. Trim query before executing API dispatch but preserve visual spaces.
- **Key Interception**: Bind `Ctrl+U` to clear the query. Bind `Enter` and `Esc` to blur the input (`onBlur`), returning focus to the results list.

**`SearchTabBar.tsx`**
- Read `useTerminalDimensions()` to determine breakpoint (`minimum`, `standard`, `large`).
- Map the 4 tabs to `<text>` elements in a horizontal `<box>`.
- Use the `theme.primary` token with `bold` and `underline` for the active tab.
- Render dynamic labels based on breakpoint (e.g., minimum: `"Repos(3)"`, standard: `"Repositories (3) │"`). Handle >9999 truncation (e.g., `"10k+"`).

**`SearchResultRow.tsx`**
- Implement an entity-specific factory component `renderSearchResultItem(item, focused, breakpoint)`.
- **Repositories**: Show `theme.primary` for full name, `theme.success` for public badge, `theme.muted` for stars. At `standard` or `large`, render a second line with truncated description and topic tags.
- **Issues**: Format as `{owner/repo} #{number} {title}`. Use `theme.success` (●) for open and `theme.error` (○) for closed states.
- **Users**: Format username with `theme.primary` and display name with `theme.muted`.
- **Code**: Display file path. At `standard` or `large`, use OpenTUI's `<code>` component for a 2-line or 4-line syntax-highlighted snippet, prefixed with a `│` gutter.

**`SearchResultList.tsx`**
- Wrap the shared TUI abstraction `<ScrollableList>`.
- Handle `onSelect` by dispatching router `push` events mapped to the entity type:
  - Repos: `push('RepoOverview', { owner, repo })`
  - Issues: `push('IssueDetail', { owner, repo, issueNumber })`
  - Users: `push('UserProfile', { username })`
  - Code: `push('CodeExplorer', { owner, repo, path })`
- Integrate inline Loading states (`"Searching..."`), Empty states, Zero Result states, and Error states (`"Search failed. Press R to retry."`).

### Phase 3: Screen Assembly & Keybindings (`SearchScreen.tsx`)
1. **Layout**:
   - Header (managed by `AppShell`, update breadcrumb to "Search").
   - `SearchInput` at the top.
   - `SearchTabBar` below the input.
   - `SearchResultList` expanding to fill the remaining `contentHeight`.
2. **Keybinding Registration**: Use `useScreenKeybindings()` to register priority handlers.
   - `/`: Set `isInputFocused = true`.
   - `Tab` / `Shift+Tab`: Cycle `activeTab`.
   - `1`, `2`, `3`, `4`: Jump to specific tabs.
   - `R`: Trigger refetch/retry on the current active tab if it is in an error state.
   - `q`: Pop the screen (if input is not focused).
   - `Esc`: Pop the screen (if input is not focused and list is focused).
3. **Focus Management**: Track `focusTarget` (`'input' | 'list'`). When `'list'`, pass the keyboard events down to `<ScrollableList>`.

### Phase 4: Integration with TUI Router
- Add `Search: { component: SearchScreen, requiresRepo: false }` to the central `screenRegistry`.
- Map `g s` global go-to keybinding in `KeybindingProvider` to `push('Search')`.
- Add command palette entry `:search`.

---

## 4. Unit & Integration Tests

All tests target `e2e/tui/search.test.ts` using `@microsoft/tui-test`.

### 4.1 Snapshot Tests
*Validate layout, breakpoints, and rendering fidelity.*

- `SNAP-SEARCH-001/002/003`: Launch TUI, push Search, verify empty state renders correctly at `120x40`, `80x24`, and `200x60`. Ensure centered placeholder text.
- `SNAP-SEARCH-004 to 010`: Inject mock API responses. Render each tab (Repos, Issues, Users, Code) at different breakpoints. Validate that Code snippets hide at `80x24` and show 4 lines at `200x60`.
- `SNAP-SEARCH-012`: Simulate empty API responses, verify "No results for '{query}'" text.
- `SNAP-SEARCH-016 to 019`: Assert visual badges (counts formatting like `10k+`), Error states ("Press R to retry"), and Rate limit states.

### 4.2 Keyboard Interaction Tests
*Validate event handlers, input captures, and navigation.*

- `KEY-SEARCH-001/002`: Assert `g s` from dashboard and `:search` from command palette mount the search screen with input focused.
- `KEY-SEARCH-003/026`: Type "test", assert no API call immediately, wait 300ms, assert API dispatcher is called. Simulate rapid typing to verify debounce clearing.
- `KEY-SEARCH-005`: Type query, hit `Ctrl+U`, assert input clears and screen resets to Empty State.
- `KEY-SEARCH-009/010`: Hit `Enter` in input -> moves focus to list. Hit `/` in list -> moves focus to input.
- `KEY-SEARCH-011 to 015`: Test `Enter` on a result row pushes the correct detail screen. Test `q` returns to Search with query/tab/scroll state intact.
- `KEY-SEARCH-013 to 015`: Verify `Tab`, `Shift+Tab`, and numeric keys (`1-4`) correctly switch the `activeTab` state.
- `KEY-SEARCH-016 to 019`: Verify `j`/`k`/`G`/`gg`/`Ctrl+D`/`Ctrl+U` manipulates the focused list item.

### 4.3 Responsive & Resize Tests
*Validate synchronous OpenTUI `useOnResize` behavior.*

- `RESIZE-SEARCH-004 to 005`: Render at `120x40`. Dispatch resize to `80x24`. Assert layout synchronously collapses (tabs abbreviate, columns hide). Resize back to `120x40` and assert expansion.
- `RESIZE-SEARCH-006`: Resize while an item is focused; assert focus index and visual reverse-video highlight are preserved.

### 4.4 Integration Logic Tests
*Validate cross-cutting logic and edge cases.*

- `INT-SEARCH-002`: Assert typing a query fires exactly 4 concurrent fetch requests to the mock server.
- `INT-SEARCH-003/004`: Scroll to 80% to trigger pagination. Verify page 2 loads. Inject 500 mock results and verify pagination stops requesting after 300 items (10th page).
- `INT-SEARCH-008`: Simulate `searchRepos` 200 OK and `searchCode` 500 Error. Verify Repos tab is healthy and Code tab displays the localized error state.
- `INT-SEARCH-010`: Type "old", stall API. Type "new", resolve API. Verify only "new" results are rendered and the "old" promise is discarded/aborted.