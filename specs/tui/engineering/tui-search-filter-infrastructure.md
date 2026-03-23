# Engineering Specification: Search inline filter infrastructure

## 1. Overview
The Codeplane TUI requires robust filtering capabilities within the global search screen to allow users to narrow down high-volume search results. This infrastructure introduces a modular filter bar, an interactive modal for selecting filter values, and a state management hook for maintaining filter configuration per search tab. 

As defined in the ticket `tui-search-filter-infrastructure`, the system consists of three primary deliverables:
1. `SearchFilterBar.tsx`: A responsive, inline component displaying active filters.
2. `FilterPickerModal.tsx`: A keyboard-navigable overlay for selecting filter values with fuzzy-search.
3. `useSearchFilters.ts`: A custom hook managing tab-local, session-scoped filter state that resets upon screen pop.

## 2. Architecture & Design

### 2.1 State Management (`useSearchFilters`)
Search encompasses four distinct domains (Issues, Repositories, Code, Users), each with unique filtering axes. To adhere to the requirement of "tab-local, session-scoped, reset on screen pop", the filter state must be hoisted to the root of the `SearchScreen` component. 

*   **Issues:** `state` (open/closed), `labels` (multi-select strings), `repo` (string)
*   **Repos:** `visibility` (public/private), `language` (string)
*   **Code:** `language` (string), `repo` (string)
*   **Users:** No filters applicable.

The hook will expose state accessors and mutators. Server-side filter changes (like `repo` or `state`) will trigger a refetch via the `@codeplane/ui-core` search hooks. Client-side filters will apply predicates to the loaded result sets.

### 2.2 Component: `SearchFilterBar`
The filter bar sits immediately beneath the search tab bar. It uses a horizontal flex layout to display active filters.
*   **Condensed format** (triggered at `< 120` columns): Shows only the number of active filters or highly abbreviated chips (e.g., `s:open | l:bug`).
*   **Full format**: Shows standard chips (e.g., `state: open | labels: bug, p1`).
*   Interaction focuses on opening the `FilterPickerModal` via specific keybindings mapped to the active tab's filter criteria (e.g., `f s` for state, `f l` for labels).

### 2.3 Component: `FilterPickerModal`
This component uses the TUI's existing `ModalSystem` (`<OverlayLayer>`).
*   **Structure:** An OpenTUI `<input>` mapped to a local fuzzy-search query state, followed by a `<ScrollableList>` displaying available options.
*   **Interaction:** 
    *   Printable characters route to the `<input>`.
    *   `j`/`k` route to the `<ScrollableList>` for navigation.
    *   `Space` toggles items in `multiSelect` mode.
    *   `Enter` confirms the selection and dismisses the modal.
    *   `Esc` cancels and dismisses the modal.

---

## 3. Implementation Plan

### Step 1: Define Filter State Types & Hook
**File:** `apps/tui/src/screens/Search/filters/useSearchFilters.ts`
*   Define the TypeScript interfaces for each tab's filter schema.
*   Create the `useSearchFilters` hook utilizing `useState` to store the configuration.
*   Expose `setFilter(tab, key, value)`, `clearFilters(tab)`, and a computed `getActiveFilters(tab)` function.

### Step 2: Implement `FilterPickerModal`
**File:** `apps/tui/src/screens/Search/filters/FilterPickerModal.tsx`
*   Build a modal containing an input field and a scrollable list.
*   Implement a simple client-side fuzzy match filtering the `options` array based on the `query` state.
*   Manage local selection state before bubbling up via `onConfirm`.

### Step 3: Implement `SearchFilterBar`
**File:** `apps/tui/src/screens/Search/filters/SearchFilterBar.tsx`
*   Accept current tab and its active filters.
*   Utilize `useLayout` to determine `condensed` vs `full` rendering.
*   Render chips with `theme.primary` for keys and standard text for values, delimited by `|`.

### Step 4: Integrate with `SearchScreen`
**File:** `apps/tui/src/screens/Search/SearchScreen.tsx`
*   Initialize `useSearchFilters`.
*   Pass filters to `@codeplane/ui-core` search hook invocation.
*   Render `<SearchFilterBar>` between the `<TabBar>` and the main `<ScrollableList>`.
*   Bind keyboard shortcuts (e.g., `f` to trigger a local overlay or sequence to open specific pickers) via `useScreenKeybindings`.

---

## 4. Unit & Integration Tests

**File:** `e2e/tui/search.test.ts`
We will append the following test cases to the existing search test suite using `@microsoft/tui-test`.

### 4.1 Filter Bar Rendering & Responsiveness
- Launch TUI at 120x40, navigate to search.
- Trigger state filter selection (e.g., `f s Enter`).
- Verify full format renders (`state: open`).
- Resize to 80x24.
- Verify condensed format renders (`s:open`).

### 4.2 Modal Navigation & Fuzzy Search
- Navigate to search, open labels picker (`f l`).
- Type "bug" in the filter input.
- Navigate list using `j`/`k`, toggle selection with `Space`, confirm with `Enter`.
- Verify filter bar updates with the selected label.

### 4.3 Tab-Local State Isolation
- Set an active filter on the Issues tab.
- Press `Tab` to switch to Repositories tab.
- Verify the filter bar no longer shows the Issue filter.
- Press `q` to pop the search screen, then `g s` to reopen.
- Verify all filters are reset to their default empty state.