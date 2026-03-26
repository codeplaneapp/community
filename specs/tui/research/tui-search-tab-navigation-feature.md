# Codebase Research: TUI_SEARCH_TAB_NAVIGATION

Based on a thorough analysis of the repository, the following contexts, patterns, and files are relevant for implementing the `tui-search-tab-navigation-feature`.

## 1. Directory Structure & Missing Files
The `SearchScreen` and the corresponding `apps/tui/src/screens/search/` directory do not currently exist in the codebase. You will need to create this directory and scaffold the files (`types.ts`, `SearchTabBar.tsx`, `useSearchTabNavigation.ts`, `SearchScreen.tsx`) as outlined in the engineering spec.

## 2. Keybindings & Context Suppression
**Relevant Files:**
- `apps/tui/src/hooks/useScreenKeybindings.ts`
- `apps/tui/src/providers/KeybindingProvider.tsx`
- `apps/tui/src/components/GlobalKeybindings.tsx`

**Findings:**
- **Registering Keys:** Use `useScreenKeybindings(bindings, hints)` to register tab navigation keys (`Tab`, `Shift+Tab`, `1-4`, `h`, `l`). It internally normalizes keys and registers a scope with `PRIORITY.SCREEN`.
- **Modal State (`isModalOpen`):** The `KeybindingContext` provides a `hasActiveModal()` function (see `KeybindingProvider.tsx`, line 102). You can use this to suppress tab switching when a modal is open.
- **Go-To State (`isGoToActive`):** The `GlobalKeybindings.tsx` file indicates that the Go-To functionality is currently a stub (`/* TODO: wired in go-to keybindings ticket */`). You will need to either introduce this context state or scaffold a placeholder for the suppression logic.
- **Input Focus (`inputFocused`):** OpenTUI doesn't natively expose a global `inputFocused` context; this state should be managed locally within `SearchScreen.tsx` where the `<input>` component's `onFocus`/`onBlur` callbacks are handled, allowing you to suppress the `1-4`, `h`, and `l` keys so they can be typed into the search bar.

## 3. Tab State & Scroll Persistence
**Relevant Files:**
- `apps/tui/src/providers/NavigationProvider.tsx`

**Findings:**
- The engineering spec mentions "Tie into `useNavigation().tabStates`". While `tabStates` doesn't explicitly exist on the navigation context, `NavigationProvider.tsx` exports a dedicated `useScrollPositionCache()` hook (line 152). 
- This hook returns `{ saveScrollPosition, getScrollPosition }`. You should use this alongside your local `activeTabIndex` state to cache scroll positions per tab within the search screen, mapping them to the active search query and tab ID.

## 4. UI-Core Data Hooks
**Relevant Context:**
- `apps/tui/src/providers/APIClientProvider.tsx`
- `specs/design.md`

**Findings:**
- The TUI relies heavily on shared data hooks from `@codeplane/ui-core`. A comment in `APIClientProvider.tsx` notes `// Mock implementation of APIClient since @codeplane/ui-core is missing`.
- You should proceed by importing hooks like `useSearchRepos`, `useSearchIssues`, `useSearchUsers`, and `useSearchCode` from `@codeplane/ui-core` as described in the spec, keeping in mind that these might be implemented in a subsequent backend/shared PR or mocked locally for UI development.

## 5. UI Components & Layout
**Relevant Features:**
- `SearchTabBar.tsx` requires responsive logic.
- According to the TUI Design Spec and `packages/core/src/examples`, OpenTUI provides a `useTerminalDimensions()` hook.
- You can implement the `terminalWidth` logic to format the `SEARCH_TABS` counts and dividers (e.g., swapping `  ` for ` │ `) by feeding the width from `useTerminalDimensions()` into the formatting function.

## 6. E2E Testing Strategy
**Relevant Files:**
- `e2e/tui/helpers.ts`
- `e2e/tui/` directory

**Findings:**
- Existing test files (e.g., `app-shell.test.ts`, `repository.test.ts`) are located in `e2e/tui/` and use `@microsoft/tui-test`.
- You will need to create `e2e/tui/search.test.ts` to implement the required Snapshot and Keyboard Interaction tests. Follow the established patterns in `helpers.ts` for simulating terminal resizes (`resize-120-to-80`) and injecting keyboard events (`Tab`, `Shift+Tab`, `1`, etc.).