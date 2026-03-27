# Codebase Research: TUI_SEARCH_REPOS_TAB

Based on a comprehensive search of the Codeplane monorepo, here are the findings relevant to implementing the `tui-search-repos-tab-feature` ticket.

## 1. Telemetry and Analytics
- **Target File:** `apps/tui/src/lib/telemetry/searchEvents.ts`
- **Current State:** The `telemetry/` subdirectory and `searchEvents.ts` do not exist. 
- **Existing Context:** The core telemetry infrastructure is implemented in `apps/tui/src/lib/telemetry.ts`. It exports an `emit(name: string, properties: Record<string, string | number | boolean>)` function and an `initTelemetry` setup function. The new `trackSearchEvent` wrapper should be built on top of this `emit` function.

## 2. Shared Components (`ScrollableList`)
- **Target File:** `apps/tui/src/components/ScrollableList.tsx`
- **Current State:** **Missing**. This file does not exist in the codebase. 
- **Existing Context:** `apps/tui/src/components/index.ts` exports several layout components (`AppShell`, `SkeletonList`, `PaginationIndicator`, etc.), but not `ScrollableList`. References in other specification documents (e.g., `specs/tui/research/tui-issue-list-screen.md`) also explicitly flag that `ScrollableList.tsx` is missing. This feature either assumes `ScrollableList` will be delivered in a preceding PR (like `tui-list-component`) or will need a mock/stub implementation to proceed.

## 3. Data Layer Integration (`useSearch`)
- **Target Entity:** `useSearch` from `@codeplane/ui-core`
- **Current State:** **Missing**. A repository-wide search confirms that `useSearch` is not implemented in any shared package. Furthermore, `apps/tui/package.json` relies on `@codeplane/sdk`, not `ui-core`.
- **Existing Context:** According to review notes in `specs/tui/reviews/research-tui-search-data-hooks-iteration-0.md`, the `useSearch` hook must be built using `useAPIClient` and custom hook abstractions. There is a planned `tui-search-data-hooks` ticket to scaffold `useSearchTabs.ts` and `useSearchTabs.types.ts` which will provide the `RepositorySearchResult` types required by this feature.

## 4. Search Screen Shell Integration
- **Target File:** `apps/tui/src/screens/search/SearchScreen.tsx`
- **Current State:** **Missing**. The `apps/tui/src/screens/search/` directory does not exist. The only screens present are `PlaceholderScreen.tsx` and the `Agents/` module.
- **Existing Context:** The spec notes "assumes shell exists from tui-search-screen-feature". This implies that `tui-search-screen-scaffold` and `tui-search-screen-feature` are strict prerequisites. The implementation of `RepoResultsList` and `RepoResultRow` can be built in isolation, but integrating them into `SearchScreen.tsx` requires the shell to be merged first.

## 5. String Utilities
- **Target File:** `apps/tui/src/utils/string.ts`
- **Current State:** **Missing**. The `apps/tui/src/utils/` directory has not been scaffolded yet.
- **Implementation Action:** You will need to create `apps/tui/src/utils/string.ts` and implement the `truncateMiddle(str, maxLength)` and `truncateEnd(str, maxLength)` functions from scratch.

## 6. End-to-End Tests
- **Target File:** `e2e/tui/search.test.ts`
- **Current State:** **Missing**. The file does not exist in `e2e/tui/`.
- **Implementation Action:** You will need to initialize this test file utilizing `@microsoft/tui-test` and implement the required 83 snapshot, keyboard, responsive, and integration tests as defined in the engineering specification.

## Summary of Prerequisites & Blockers
To implement `tui-search-repos-tab-feature` precisely as specified, the following dependencies from parallel tickets are required:
1. `ScrollableList` component (`tui-list-component`).
2. `SearchScreen` shell component (`tui-search-screen-feature`).
3. Search data hooks and types (`tui-search-data-hooks`).

If these are not merged, the implementation must utilize stubs or mock data and layout blocks.