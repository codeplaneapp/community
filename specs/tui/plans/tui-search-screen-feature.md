# Implementation Plan: TUI_SEARCH_SCREEN

This document outlines the step-by-step implementation plan for the `TUI_SEARCH_SCREEN` feature, adhering strictly to the React 19 + OpenTUI architecture and the provided Engineering Specification.

## Phase 1: Data Orchestration & Hooks

**1. Create `apps/tui/src/screens/search/hooks/useSearchLogic.ts`**
- **Debounce Logic:** Implement local state `query` and `debouncedQuery`. Use a `useEffect` with a `setTimeout` of 300ms to update `debouncedQuery`, clearing the timeout on cleanup.
- **API Integration:** Import and call `useSearch(debouncedQuery)` from `@codeplane/ui-core`. Extract the loading states, error states, and result arrays for `repos`, `issues`, `users`, and `code`.
- **Tab Management:** Create an `activeTab` state defaulting to `'repos'`. 
- **Auto-Selection Effect:** Add a `useEffect` that monitors the completion of the search requests. If the `activeTab` results are empty (`length === 0`) but another tab has results, automatically `setActiveTab` to the first populated tab.
- **Pagination:** Expose `fetchMore` handlers for each tab type. Add a safeguard to prevent fetching if the current tab's `items.length >= 300`.

## Phase 2: Component Implementation

**1. Create `apps/tui/src/screens/search/components/SearchInput.tsx`**
- **Structure:** Wrap an OpenTUI `<input>` in a `<box flexDirection="row">` with a static `<text>🔍 </text>` prefix.
- **Props:** Accept `query`, `onChange`, `isFocused`, `onFocus`, and `onBlur`.
- **Constraints:** Enforce a 120-character limit in the `onChange` handler (`val.slice(0, 120)`).
- **Keybindings:** Use `useKeyboard` to intercept `Ctrl+U` to clear the input, and `Enter`/`Esc` to trigger `onBlur` (shifting focus to the list).

**2. Create `apps/tui/src/screens/search/components/SearchTabBar.tsx`**
- **Structure:** Render a horizontal `<box gap={1}>` containing the four tabs.
- **Responsive Labels:** Utilize `useTerminalDimensions` to detect `minimum`, `standard`, and `large` breakpoints.
  - *Minimum:* Render abbreviated labels (e.g., `"Repos(3)"`).
  - *Standard/Large:* Render full labels (e.g., `"Repositories (3) │"`).
- **Formatting:** Truncate counts >9999 to `"10k+"`. Highlight the active tab using `theme.primary` with `bold` and `underline` text styling.

**3. Create `apps/tui/src/screens/search/components/SearchResultRow.tsx`**
- **Structure:** Create a factory component `SearchResultItem({ item, type, isFocused, breakpoint })`.
- **Styling:** Apply reverse-video or `theme.primary` background when `isFocused` is true.
- **Entity Variants:**
  - *Repos:* Show `item.fullName` (primary), `item.isPublic` badge (success), and stars (muted). Add a second line for descriptions/topics at `standard`/`large` breakpoints.
  - *Issues:* Format as `{owner/repo} #{number} {title}`. Add `●` (success) for open and `○` (error) for closed.
  - *Users:* Show `item.username` (primary) and `item.displayName` (muted).
  - *Code:* Show `item.path`. Use OpenTUI `<code>` for 2-4 lines of syntax highlighting if breakpoint is `standard` or `large`.

**4. Create `apps/tui/src/screens/search/components/SearchResultList.tsx`**
- **Structure:** Wrap the TUI's standard `<ScrollableList>` component.
- **Props:** Accept `items`, `type`, `isFocused` (boolean flag if the list owns keyboard focus), and `onScrollToEnd`.
- **Routing:** Implement an `onSelect` callback that uses the screen router's `push` function:
  - Repos: `push('RepoOverview', { owner, repo })`
  - Issues: `push('IssueDetail', { owner, repo, issueNumber })`
  - Users: `push('UserProfile', { username })`
  - Code: `push('CodeExplorer', { owner, repo, path })`
- **States:** Handle rendering for Empty (no query), Loading (`"Searching..."`), Zero Results (`"No results for '{query}'"`), and Error (`"Search failed. Press R to retry."`).

## Phase 3: Screen Assembly & Keybindings

**1. Create `apps/tui/src/screens/search/SearchScreen.tsx`**
- **State Management:** Track `focusTarget` (`'input' | 'list'`).
- **Layout:** Use a vertical `<box>`:
  - Top: `<SearchInput>`
  - Middle: `<SearchTabBar>`
  - Bottom: `<SearchResultList>` expanding to `flex={1}`.
- **Keybindings:** Use `useScreenKeybindings` to register handlers:
  - `/`: Set `focusTarget = 'input'`.
  - `Tab` / `Shift+Tab`: Cycle the `activeTab`.
  - `1`, `2`, `3`, `4`: Jump directly to a tab.
  - `R`: Trigger retry on the active tab if it's in an error state.
  - `q` / `Esc`: If `focusTarget === 'list'`, map `Esc` to `q` (pop screen). If `focusTarget === 'input'`, map `Esc` to blur input.

## Phase 4: Router Integration

**1. Update `apps/tui/src/router/registry.ts`**
- Import `SearchScreen` and replace `PlaceholderScreen` in the `ScreenName.Search` definition.
- Ensure `requiresRepo: false` and `requiresOrg: false`.

**2. Verify Navigation Bindings**
- Ensure `g s` in `apps/tui/src/navigation/goToBindings.ts` correctly points to `push(ScreenName.Search)`.
- Verify the command palette (`:search`) is mapped correctly.

## Phase 5: E2E Tests

**1. Create `e2e/tui/search.test.ts`**
- **Snapshot Tests (`SNAP-SEARCH-*`):** Validate rendering of empty states, mock API responses for each tab, and responsive layout collapsing at `120x40`, `80x24`, and `200x60`.
- **Keyboard Tests (`KEY-SEARCH-*`):** Verify `g s` launches the screen. Test 300ms debounce typing. Test `Ctrl+U` clears input. Test `/`, `Enter`, and `Esc` focus shifting. Verify list navigation (`j`/`k`/`G`/`gg`) and tab cycling (`Tab`/`1-4`).
- **Responsive Tests (`RESIZE-SEARCH-*`):** Trigger runtime resize events to ensure synchronous layout collapsing (e.g., hiding code snippets) while preserving list focus index.
- **Integration Tests (`INT-SEARCH-*`):** Assert 4 concurrent fetch requests, pagination caps at 300 items, and localized error boundary handling (e.g., Code tab fails but Repos tab succeeds).