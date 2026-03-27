# Implementation Plan: TUI Repository List Screen

**Ticket**: `tui-repo-list-screen`
**Title**: Repository list screen with search, sort, and filter

This document outlines the step-by-step implementation plan for the Codeplane TUI Repository List screen, using React 19 + OpenTUI.

## Phase 1: Foundation (Types & Utils)

**Step 1.1: Define Data Types and Constants**
- **File**: `apps/tui/src/screens/RepoList/types.ts`
- **Action**: Create the file to define `RepoSortOrder`, `VisibilityFilter`, `RepoListItem`, and `ColumnLayout` interfaces. Export constants for cycles (`SORT_ORDER_CYCLE`, `VISIBILITY_CYCLE`) and pagination constants.

**Step 1.2: Implement Pure Formatting Utilities**
- **File**: `apps/tui/src/screens/RepoList/format.ts`
- **Action**: Implement independent formatting functions (`formatCount`, `formatRelativeTime`, `formatTotalCount`, `formatRepoName`, `formatDescription`, `formatVisibility`, `formatLanguage`). Ensure they use `truncateText` and `fitWidth` from `../../util/text.js` to strictly enforce fixed column widths without React dependencies.

**Step 1.3: Add Formatting Unit Tests**
- **File**: `e2e/tui/repo-list-format.test.ts`
- **Action**: Add pure `bun:test` unit tests for the formatting utilities to verify abbreviation logic (e.g., `1000` -> `1.0k`), relative time formatting, and column truncation.

## Phase 2: State & Data Hooks

**Step 2.1: Create Column Layout Calculator**
- **File**: `apps/tui/src/screens/RepoList/useColumnLayout.ts`
- **Action**: Implement a hook that consumes `useLayout()` to return exact character widths for columns based on the active breakpoint (`minimum`, `standard`, `large`).

**Step 2.2: Implement Client-Side Filtering**
- **File**: `apps/tui/src/screens/RepoList/useRepoFilters.ts`
- **Action**: Build the hook to manage client-side sorting, visibility, owner filtering, and text search over the loaded repository list. Ensure it exposes actions to cycle sort/visibility without modifying standard `useState` directly from the UI components.

**Step 2.3: Build Data Hook Adapter**
- **File**: `apps/tui/src/screens/RepoList/useRepoListData.ts`
- **Action**: Create the data fetcher adapter. 
- **Crucial Requirement**: Since `tui-repo-data-hooks` (which provides `@codeplane/ui-core`) is an unmet dependency, use dynamic imports and `@ts-expect-error` annotations as specified in the engineering spec. Include optimistic mutations for the star/unstar functionality.

## Phase 3: Presentation Components

**Step 3.1: Build the Filter Toolbar**
- **File**: `apps/tui/src/screens/RepoList/FilterToolbar.tsx`
- **Action**: Create the `FilterToolbar` component using `<box>`, `<text>`, and `<input>`. Adapt the rendering based on the `useLayout()` breakpoint (showing only the search input on `minimum`).

**Step 3.2: Build Column Headers**
- **File**: `apps/tui/src/screens/RepoList/ColumnHeaders.tsx`
- **Action**: Implement the header row for the columns using the widths provided by `useColumnLayout()`. Hide this component entirely at the `minimum` breakpoint.

**Step 3.3: Build the Row Component**
- **File**: `apps/tui/src/screens/RepoList/RepoRow.tsx`
- **Action**: Implement `RepoRow` using OpenTUI `<box>` and `<text>`. Apply theme colors for focused states (e.g., `theme.primary` background, `theme.surface` foreground). Render the formatted cells joined by spaces.

## Phase 4: Screen Composition & Wiring

**Step 4.1: Assemble RepoListScreen**
- **File**: `apps/tui/src/screens/RepoList/RepoListScreen.tsx`
- **Action**: 
  - Compose the toolbar, headers, and rows inside an OpenTUI `<scrollbox>`.
  - Integrate `useScreenKeybindings` to map keyboard interactions (`j`, `k`, `Enter`, `/`, `o`, `v`, `w`, `c`, `s`, etc.).
  - Implement manual scroll windowing calculating offsets based on `contentHeight`.
  - Handle `Loading` and `Error` states using standard TUI components (`FullScreenLoading`, `FullScreenError`).

**Step 4.2: Create Barrel Export**
- **File**: `apps/tui/src/screens/RepoList/index.ts`
- **Action**: Export `RepoListScreen` and relevant types.

**Step 4.3: Register Screen in Router**
- **File**: `apps/tui/src/router/registry.ts`
- **Action**: Replace `PlaceholderScreen` for `ScreenName.RepoList` with the new `RepoListScreen`.

**Step 4.4: Wire Global Go-To Action**
- **File**: `apps/tui/src/navigation/goToBindings.ts`
- **Action**: Add `g g` jump-to-top support (either via go-to fallback action dispatch or a local timeout chord detector in the screen's keybindings).

## Phase 5: E2E Terminal Tests

**Step 5.1: Implement Terminal Snapshots & Keybinding Tests**
- **File**: `e2e/tui/repository.test.ts`
- **Action**: Add comprehensive tests using `@microsoft/tui-test` via `launchTUI`. 
  - Write tests for navigation (`j`/`k`/`Enter`), filtering (`/`), and layout responsive resizing.
  - Add snapshot assertions (`toMatchSnapshot()`).
  - **Note**: Any tests relying on the unimplemented `GET /api/user/repos` backend must be allowed to fail (do not skip or comment them out, per project policy).
