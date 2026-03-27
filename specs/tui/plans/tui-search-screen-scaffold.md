# Implementation Plan: Search Screen Scaffold

## 1. Create `useSearchInput` hook
**File:** `apps/tui/src/screens/Search/useSearchInput.ts`
- Create a new file exporting the `useSearchInput` hook and its related interfaces `UseSearchInputOptions` and `UseSearchInputReturn`.
- Implement state variables: `query` (raw input), `debouncedQuery` (debounced input), and `inputFocused` (boolean, defaults to true).
- Implement `handleInput` to clamp text to `maxLength` (default 120) and update `query` synchronously. Start a `setTimeout` to update `debouncedQuery` after `debounceMs` (default 300).
- Implement `handleClear` to immediately reset `query` and `debouncedQuery` to `""`, and clear any pending timeouts.
- Add a `useEffect` cleanup to clear the timeout when the component unmounts.
- Accept `initialQuery` to populate the initial state for deep-linking (e.g., from command palette).

## 2. Create `SearchScreen` component
**File:** `apps/tui/src/screens/Search/SearchScreen.tsx`
- Create a new file exporting `SearchScreen`.
- Import dependencies: `ScreenComponentProps` from `../../router/types.js`, `useLayout`, `useTheme`, `useScreenKeybindings` from `../../hooks/`, `useNavigation` from `../../providers/NavigationProvider.js`, and `useSearchInput` from `./useSearchInput.js`.
- Initialize `useSearchInput` passing `params.q` as `initialQuery`.
- Set up screen keybindings using `useScreenKeybindings`:
  - `/` to focus the search input (when `!inputFocused`).
  - `escape` to unfocus the input if focused, or call `nav.pop()` to go back if already unfocused.
- Register status bar hints: `/` for "focus search", `Tab` for "next tab", and `Esc` for "back".
- Render the layout using `<box>`, `<input>`, and `<text>`:
  - **Row 1 (Search Input):** Render a row of height 1. Use `useLayout` breakpoint to conditionally hide the `🔍 ` icon on the "minimum" breakpoint. Pass `query`, `inputFocused`, and `handleInput` to the `<input>` component.
  - **Row 2 (Tab Bar):** Render a visual-only tab bar for "Repos", "Issues", "Users", and "Code". On the "minimum" breakpoint, truncate these labels to 3 characters ("Rep", "Iss", "Usr", "Cod"). Apply `theme.primary` to the active tab (e.g., the first one).
  - **Row 3 (Results Area):** Center the content. Display placeholder text depending on the `debouncedQuery` state ("Type to search across Codeplane" if empty, or `Searching for "${debouncedQuery}"…` if not empty).

## 3. Create Barrel Export
**File:** `apps/tui/src/screens/Search/index.ts`
- Create a new file and export `SearchScreen` from `./SearchScreen.js`.

## 4. Update Screen Registry
**File:** `apps/tui/src/router/registry.ts`
- Add an import for `SearchScreen` from `../screens/Search/index.js`.
- In the `[ScreenName.Search]` entry, replace the `PlaceholderScreen` component with `SearchScreen`.
- Leave other properties (`requiresRepo`, `requiresOrg`, `breadcrumbLabel`) intact.

## 5. Create E2E Test Scaffold
**File:** `e2e/tui/search.test.ts`
- Create the E2E test suite for `TUI_SEARCH — Screen scaffold`.
- Import `describe`, `test`, `expect`, `afterEach` from `bun:test`, and test helpers (`launchTUI`, `TERMINAL_SIZES`, `TUITestInstance`) from `./helpers.ts`.
- Ensure the TUI instance is terminated in `afterEach`.
- Add tests to verify:
  - Search screen renders via `g s` navigation.
  - Search input is auto-focused on mount.
  - `Esc` unfocuses input, then pops the screen on the second press.
  - `/` refocuses the search input after `Esc`.
  - Search screen adapts to the `80x24` minimum size without crashing.
  - Breadcrumb shows "Search" in the header.
  - Status bar shows search-specific hints.
  - `q` pops the screen when the input is unfocused.
  - `Ctrl+U` clears the search input.
