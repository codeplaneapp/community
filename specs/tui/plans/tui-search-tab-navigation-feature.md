# Implementation Plan: TUI Search Tab Navigation (TUI_SEARCH_TAB_NAVIGATION)

This plan details the implementation of the search tab navigation feature for the Codeplane TUI, including responsive tab rendering, keyboard navigation, state persistence, and e2e testing.

## 1. Types and Constants

**File:** `apps/tui/src/screens/search/types.ts`

1. Create the `SearchTab` interface to strongly type the tab definitions.
2. Export the `SEARCH_TABS` array containing the definitions for Repositories, Issues, Users, and Code.

```typescript
export interface SearchTab {
  id: "repositories" | "issues" | "users" | "code";
  label: string;
  short: string;
  key: string;
}

export const SEARCH_TABS: readonly SearchTab[] = [
  { id: "repositories", label: "Repositories", short: "Repos", key: "1" },
  { id: "issues",       label: "Issues",       short: "Issues", key: "2" },
  { id: "users",        label: "Users",        short: "Users", key: "3" },
  { id: "code",         label: "Code",         short: "Code",  key: "4" },
];
```

## 2. Tab Bar Component

**File:** `apps/tui/src/screens/search/SearchTabBar.tsx`

1. Create the `SearchTabBar` component.
2. Define props: `activeTabIndex: number`, `tabCounts: Record<string, number | null>`, and `terminalWidth: number`.
3. Implement `formatSearchTabLabel` logic:
   - Format counts: `null` -> `""`, `> 99999` -> `"(100k+)"`, `> 9999` -> `"(Nk+)"`, else `"(N)"`.
   - If `terminalWidth < 120`, use `tab.short` + formatted count.
   - If `terminalWidth >= 120`, use `tab.label` + formatted count.
4. Render the `<box>` layout with `flexDirection="row"`, `height={1}`, and `borderBottom="single"`, `borderColor="border"`.
5. Map over `SEARCH_TABS` to render each tab. Apply `color="primary"`, `bold={true}`, and `underline={true}` to the active tab, and `color="muted"` to inactive tabs.
6. Render separators between tabs based on `terminalWidth` (`"  "` for `< 120`, `" │ "` for `120-199`, `"    │    "` for `>= 200`).

## 3. Keyboard Navigation Hook

**File:** `apps/tui/src/screens/search/useSearchTabNavigation.ts`

1. Create a custom hook `useSearchTabNavigation` to manage tab state and keybindings.
2. Initialize `activeTabIndex` state (defaulting to `0`).
3. Consume contexts to determine suppression states:
   - `useKeybindingContext()` for `hasActiveModal()`.
   - Take `inputFocused` and `isGoToActive` as arguments or retrieve from a local state/provider.
4. Implement tab switching logic with bounds checking.
5. Use `useScreenKeybindings` to register keybindings:
   - `Tab`: Next tab (wrap around).
   - `Shift+Tab`: Previous tab (wrap around).
   - `1`, `2`, `3`, `4`: Direct jump to index 0, 1, 2, 3.
   - `h` / `Left`: Previous tab (clamp to 0).
   - `l` / `Right`: Next tab (clamp to 3).
6. Implement suppression logic within the keybinding handlers:
   - If `hasActiveModal()` or `isGoToActive`, ignore all keybindings.
   - If `inputFocused`, ignore `1-4`, `h`, `l`, `Left`, `Right` so they can be typed into the input field, but allow `Tab` and `Shift+Tab`.
7. Return `activeTabIndex` and `setActiveTabIndex`.

## 4. Search Screen Component

**File:** `apps/tui/src/screens/search/SearchScreen.tsx`

1. Create the `SearchScreen` component, serving as the main entry point for the search view.
2. Manage local state for the search `query` and `inputFocused`.
3. Use the `useSearchTabNavigation` hook to manage the active tab.
4. Fetch data using `@codeplane/ui-core` hooks (e.g., `useSearchRepos`, `useSearchIssues`, etc.), passing the `query`. Ensure they run concurrently.
5. Implement auto-selection logic using `useEffect`:
   - Track the `previousQuery` with a ref.
   - When a new query yields results, if the current tab has 0 results, find the first tab index with `total_count > 0` and update `activeTabIndex`.
6. Integrate `useScrollPositionCache()` from `NavigationProvider` to save and restore scroll positions per tab and query.
7. Render the UI:
   - Search input field (tracking focus state with `onFocus` and `onBlur`).
   - `<SearchTabBar />`, passing counts and terminal width (via `useTerminalDimensions()`).
   - Conditionally render the active tab's content component (e.g., `<SearchReposTab>`).
8. Update the global status bar with dynamic keybinding hints based on `inputFocused` state using `useScreenKeybindings` hints array:
   - List focused: `Tab:tab  1-4:jump  /:input  j/k:nav  Enter:open  q:back`
   - Input focused: `Tab:tab  Enter:results  Esc:clear  Ctrl+U:clear all  q:back`

## 5. E2E Tests

**File:** `e2e/tui/search.test.ts`

Implement the following test suites using `@microsoft/tui-test`:

1. **Terminal Snapshot Tests:**
   - `search-tab-bar-default-state`: Render at 120x40, no query. Assert 4 tabs, Repositories active, no counts.
   - `search-tab-bar-with-counts`: Execute query, assert counts and active styling.
   - `search-tab-bar-issues-active`: Press `2`, assert Issues tab active styling.
   - `search-tab-bar-zero-count-tab`: Mock 0 results, assert `(0)` renders.
   - `search-tab-bar-abbreviated-80col`: Render at 80x24, assert short labels and `  ` separators.
   - `search-tab-bar-full-labels-120col`: Render at 120x40, assert full labels and ` │ ` separators.
   - `search-tab-bar-expanded-200col`: Render at 200x60, assert full labels and `    │    ` separators.
   - `search-tab-bar-large-count`: Mock large result counts, assert `(100k+)` formatting.

2. **Keyboard Interaction Tests:**
   - **Cycling:** Test `Tab` (increments, wraps 3->0) and `Shift+Tab` (decrements, wraps 0->3).
   - **Cycling from Input:** Focus input, press `Tab`, assert tab switch without typing literal.
   - **Direct Jumps:** Test `3` (Users), `4` (Code), `0` (no-op), `5-9` (no-op).
   - **Arrow Navigation:** Test `l`/`Right` (clamps at 3) and `h`/`Left` (clamps at 0).
   - **Suppression Contexts:** Focus input, test `2` and `Left` (types literal, moves cursor). Open help modal, test `Tab` (no tab switch).

3. **Shared Query & State Persistence:**
   - **Query Sharing:** Type query, switch tabs, assert query persists.
   - **Scroll Preservation:** Scroll Repos, switch to Issues, switch back, assert scroll position maintained.
   - **Reset on New Query:** Scroll, clear input, type new query, assert scroll resets.
   - **Stack Persistence:** Navigate to detail from Users tab, pop back, assert Users tab remains active.

4. **Auto-Selection Integration:**
   - `search-tab-auto-selects-first-with-results`: Issues active, query yields 0 issues but 5 repos, assert Repositories becomes active.
   - `search-tab-stays-on-active-if-has-results`: Issues active, query yields >0 issues, assert Issues remains active.

5. **Layout & API Verification:**
   - `search-tab-all-four-apis-called`: Assert all 4 search API hooks are called concurrently on query.
   - `search-tab-resize-120-to-80`: Trigger resize from 120x40 to 80x24, assert layout updates synchronously.
