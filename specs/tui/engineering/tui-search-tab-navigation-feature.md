# Engineering Specification: TUI_SEARCH_TAB_NAVIGATION

## Implementation Plan

### 1. Types and Constants
**File:** `apps/tui/src/screens/search/types.ts` (or `constants.ts`)
*   Define the `SearchTab` interface to structure tab definitions:
    ```typescript
    export interface SearchTab {
      id: "repositories" | "issues" | "users" | "code";
      label: string;
      short: string;
      key: string;
    }
    ```
*   Export the constant `SEARCH_TABS` array:
    ```typescript
    export const SEARCH_TABS: readonly SearchTab[] = [
      { id: "repositories", label: "Repositories", short: "Repos", key: "1" },
      { id: "issues",       label: "Issues",       short: "Issues", key: "2" },
      { id: "users",        label: "Users",        short: "Users", key: "3" },
      { id: "code",         label: "Code",         short: "Code",  key: "4" },
    ];
    ```

### 2. Tab Bar Component
**File:** `apps/tui/src/screens/search/SearchTabBar.tsx`
*   Create a component to render the tab bar and handle responsive layout logic.
*   **Props:**
    *   `activeTabIndex: number`
    *   `tabCounts: Record<string, number | null>`
    *   `terminalWidth: number`
*   **Formatting Logic:** Implement `formatSearchTabLabel(tab, index, terminalWidth, count)`.
    *   Format count: `null` -> `""`, `> 99999` -> `"(100k+)"`, `> 9999` -> `(Nk+)`, else `(N)`.
    *   Width `< 120`: Return abbreviated label (`tab.short`) + formatted count.
    *   Width `>= 120`: Return full label (`tab.label`) + formatted count.
*   **Rendering:**
    *   Render a `<box flexDirection="row" height={1} borderBottom="single" borderColor="border">`.
    *   Map over `SEARCH_TABS`. Render the active tab `<text>` with `bold={true}`, `underline={true}`, and `color="primary"`. Render inactive tabs with `color="muted"`.
    *   Render the correct separator string based on `terminalWidth` (`"  "` for `< 120`, `" │ "` for `120-199`, `"    │    "` for `>= 200`).

### 3. Keyboard Navigation and State
**File:** `apps/tui/src/screens/search/useSearchTabNavigation.ts`
*   Implement a custom hook to encapsulate tab switching logic.
*   **State:** Manage `activeTabIndex`, falling back to `0` (Repositories). Tie into `useNavigation().tabStates` if the TUI app shell tracks screen-level state persistence.
*   **Keybindings:** Utilize `useScreenKeybindings` (from the App Shell provider) to register handlers.
    *   `Tab`: `setActiveTab((prev) => (prev + 1) % 4)`
    *   `Shift+Tab`: `setActiveTab((prev) => (prev + 3) % 4)`
    *   `1`, `2`, `3`, `4`: `setActiveTab(parseInt(key) - 1)`
    *   `h` / `Left`: `setActiveTab((prev) => Math.max(0, prev - 1))`
    *   `l` / `Right`: `setActiveTab((prev) => Math.min(3, prev + 1))`
*   **Context Suppression:**
    *   Read `isModalOpen`, `isGoToActive`, and `inputFocused` context states.
    *   Suppress all tab keybindings if `isModalOpen` or `isGoToActive` are true.
    *   If `inputFocused` is true, suppress `1-4`, `h`, `l`, `Left`, `Right` so they pass as literal input, but still execute `Tab` / `Shift+Tab`.

### 4. Auto-Selection Logic
**File:** `apps/tui/src/screens/search/SearchScreen.tsx`
*   Implement auto-selection via a `useEffect` bounded to query changes and results data.
*   When results arrive, check if it's a new query (track `previousQuery` in a ref).
*   If the query is new and the current `activeTabIndex` has `0` results:
    *   Iterate through `SEARCH_TABS` to find the first index where `total_count > 0`.
    *   If found, update `activeTabIndex` to that index.
    *   If all tabs have `0` results, leave `activeTabIndex` unchanged.

### 5. Screen Integration and Per-Tab Persistence
**File:** `apps/tui/src/screens/search/SearchScreen.tsx`
*   Fetch search data via `@codeplane/ui-core` hooks (e.g., `useSearchRepos`, `useSearchIssues`, etc.), ensuring all 4 queries dispatch concurrently.
*   Pass aggregated counts down to `<SearchTabBar />`.
*   Maintain per-tab scrolling and focus state across tab switches by unmounting inactive tabs but storing their `ScrollableList` state refs within a parent `tabStates` object.
*   Render the active content component conditionally: `<SearchReposTab>`, `<SearchIssuesTab>`, `<SearchUsersTab>`, or `<SearchCodeTab>`. Pass the exact same `query` string to the active tab.
*   Update the `<StatusBar>` with dynamic keybinding hints:
    *   List focused: `Tab:tab  1-4:jump  /:input  j/k:nav  Enter:open  q:back`
    *   Input focused: `Tab:tab  Enter:results  Esc:clear  Ctrl+U:clear all  q:back`
*   Ensure the `?` help overlay registers a "Search Tabs" section via the keybinding provider.

## Unit & Integration Tests

All tests target `e2e/tui/search.test.ts` utilizing `@microsoft/tui-test`.

### 1. Terminal Snapshot Tests
*   `search-tab-bar-default-state`: Launch TUI search at 120x40 with no query. Assert tab bar renders 4 tabs, active Repositories, no counts.
*   `search-tab-bar-with-counts`: Type query. Assert counts display and active tab styling persists.
*   `search-tab-bar-issues-active`: Press `2`. Assert Issues tab is highlighted (`primary`, bold, underline).
*   `search-tab-bar-zero-count-tab`: Mock query with 0 results. Assert `(0)` renders and tab is selectable.
*   `search-tab-bar-abbreviated-80col`: Launch at 80x24. Assert short labels (`Repos(N)`) and `  ` space separators.
*   `search-tab-bar-full-labels-120col`: Launch at 120x40. Assert full labels and ` │ ` separators.
*   `search-tab-bar-expanded-200col`: Launch at 200x60. Assert full labels with expanded `    │    ` padding.
*   `search-tab-bar-large-count`: Mock large return. Assert formatting limits count to `(100k+)` or `(15k+)`.

### 2. Keyboard Interaction Tests
*   **Cycling:** Ensure `Tab` increments index and wraps `3 -> 0`. Ensure `Shift+Tab` decrements and wraps `0 -> 3`.
*   **Cycling from Input:** Focus search input, press `Tab`. Assert tab switches successfully without typing literal tab character.
*   **Direct Jumps:** Press `3`, assert Users tab. Press `4`, assert Code tab. Press `0` or `5-9`, assert no-op.
*   **Arrow Navigation:** Assert `l`/`Right` increments without wrapping (stops at 3). Assert `h`/`Left` decrements without wrapping (stops at 0).
*   **Suppression Contexts:** Focus input, press `2` and `Left`. Assert input takes characters/cursor movements; tab does not switch. Open Help modal (`?`), press `Tab`. Assert no tab switch.

### 3. Shared Query & State Persistence
*   **Query Sharing:** Type query, switch tabs. Assert `SearchInput` query string remains and new tab utilizes same query.
*   **Scroll Preservation:** On Repos tab, navigate to item 5. Switch to Issues (`2`), switch back to Repos (`1`). Assert focus remains on item 5.
*   **Reset on New Query:** Scroll on Repos, clear input (`Ctrl+U`), type new query. Assert scroll resets to top.
*   **Stack Persistence:** Navigate from Users tab into a specific user detail. Pop back (`q`). Assert Users tab remains active.

### 4. Auto-Selection Integration
*   `search-tab-auto-selects-first-with-results`: With Issues active, execute query yielding 0 issues but 5 repos. Assert Repositories automatically becomes active.
*   `search-tab-stays-on-active-if-has-results`: With Issues active, execute query yielding >0 issues. Assert Issues remains active.

### 5. Layout & API Verification
*   `search-tab-all-four-apis-called`: Dispatch query, mock the API layer, and assert `useSearch` calls all 4 resource endpoints concurrently.
*   `search-tab-resize-120-to-80`: Start at 120x40. Trigger terminal resize to 80x24. Assert layout synchronously swaps from full labels/pipes to abbreviated labels seamlessly while maintaining active tab state.