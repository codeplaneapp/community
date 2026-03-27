# Research Findings: TUI Diff Data Hooks (`tui-diff-data-hooks`)

This document summarizes research across the Codeplane TUI codebase and dependencies, guiding the implementation of diff data hooks (`useChangeDiff`, `useLandingDiff`, `useLandingComments`, `useCreateLandingComment`).

## 1. Existing TUI Code and Patterns (`apps/tui/`)

### API Client Provider
- **File:** `apps/tui/src/providers/APIClientProvider.tsx`
- **Details:** The API client provides `baseUrl` and `token` via React Context. Since shared packages like `@codeplane/ui-core` are omitted in this repository slice, standard `fetch()` calls must manually construct the URL (`${client.baseUrl}/api/...`) and pass authorization headers (`token ${client.token}`).

### Loading States and Mutation Patterns
- **Files:** `apps/tui/src/hooks/useLoading.ts`, `apps/tui/src/hooks/useScreenLoading.ts`, `apps/tui/src/hooks/useOptimisticMutation.ts`, `apps/tui/src/loading/types.ts`
- **Details:**
  - Global loading state is managed by `LoadingProvider`. 
  - Data queries should utilize `AbortController` which `useScreenLoading` manages during component unmount.
  - Mutations MUST use `registerMutation`, `completeMutation`, and `failMutation`. Mutations are deliberately NOT aborted on unmount to prevent background task failure. `useCreateLandingComment` will mirror the optimistic update logic found in `useOptimisticMutation.ts`.
  - Errors fall into categorized `LoadingError` strings (e.g., `network`, `http_error`), requiring `tryParseErrorMessage` for graceful handling.

### Types and Modular Exports
- **Files:** `apps/tui/src/types/index.ts`, `apps/tui/src/hooks/index.ts`
- **Details:** The project uses barrel exports enforcing the `.js` extension (e.g. `export { useChangeDiff } from "./useChangeDiff.js"`). We must stick to this ESM node compliance when adding the new exports.

### E2E Testing Ecosystem
- **Files:** `e2e/tui/helpers.ts`, `e2e/tui/diff.test.ts`
- **Details:** 
  - Tests use `@microsoft/tui-test`. `launchTUI()` spawns a PTY context with a mocked API environment config.
  - Standard breakpoints exist (`minimum`: 80x24, `standard`: 120x40, `large`: 200x60).
  - `e2e/tui/diff.test.ts` already contains syntax highlighting tests (`TUI_DIFF_SYNTAX_HIGHLIGHT`). The new data tests should cleanly append to this file.
  - Tests are intentionally allowed to fail if hitting an unimplemented `501` backend. We do not mock out these failures; we let the real API client capture the error text.

## 2. OpenTUI Infrastructure (`context/opentui/`)
- **Details:** OpenTUI relies heavily on `<box>`, `<scrollbox>`, and `<text>` components. The hooks being implemented are pure data/state logic that sit right above the OpenTUI layout layer, so no underlying OpenTUI core changes are necessary. 

## 3. Missing Shared UI Packages (`packages/ui-core/`, `apps/ui/src/`)
- **Details:** These paths do not exist in the current subset of the Codeplane monorepo.
- **Impact:** The TUI cannot import interfaces from `@codeplane/sdk` or `@codeplane/ui-core`. We must declare local definitions for `FileDiffItem`, `ChangeDiffResponse`, etc., in a new `apps/tui/src/types/diff.ts` file, serving as a localized source of truth.

## Conclusion
The existing architecture seamlessly supports the required cache logic (`diff-cache.ts`) and data hooks. Implementation should proceed by recreating the specific types requested in the specification, utilizing `useAPIClient()`, manually injecting the query parameters (like `whitespace=ignore` and `ignore_whitespace=true`), and adhering to the established optimistic mutation workflow.