# Implementation Plan: Repository jj-Native Data Hooks (`tui-repo-jj-hooks`)

This implementation plan details the steps to build the `useChanges`, `useRepoConflicts`, and `useOperationLog` data hooks for the Codeplane TUI. Based on the codebase findings, the prerequisite `hooks/data/` structure does not yet exist and must be scaffolded as part of this ticket.

## Step 1: Scaffold Prerequisite Infrastructure

Since the base `tui-repo-data-hooks` have not yet been merged, we must establish the base data hook architecture.

1. **Create Directory:** Create the `apps/tui/src/hooks/data/` directory.
2. **Create Base Types:** 
   - **File:** `apps/tui/src/loading/types.ts` (if not exists) or `apps/tui/src/hooks/data/types.ts`.
   - Ensure the `LoadingError` type exists as `{ type: "network" | "timeout" | "http_error" | "auth_error" | "rate_limited", httpStatus?: number, summary: string }`.
3. **Create `useTUIFetch` Wrapper:**
   - **File:** `apps/tui/src/hooks/data/useTUIFetch.ts`
   - **Action:** Implement the `useTUIFetch` hook which consumes `useAPIClient()` from `apps/tui/src/providers/APIClientProvider.tsx`. 
   - Ensure it catches 401, 429, and 501 errors and maps them to a structured `TUIFetchError` (which extends `LoadingError`).

## Step 2: Define jj-Native Types and Parsers

Create a dedicated types file to mirror API response shapes and enforce strict typing without tying it to React.

1. **File:** `apps/tui/src/hooks/data/jj-types.ts`
2. **Action:** 
   - Export interfaces: `Change`, `UseChangesOptions`, `UseChangesResult`, `ChangeConflict`, `ConflictedChange`, `UseRepoConflictsResult`, `Operation`, `UseOperationLogOptions`, `UseOperationLogResult`.
   - Implement and export pure functions: `parseChange`, `parseChangeConflict`, and `parseOperation`.
   - Ensure parsers defensively handle missing/null/undefined fields from the raw API payload, mapping snake_case to camelCase.

## Step 3: Implement Cursor Pagination Primitive

The jj endpoints use cursor-based pagination. We need a reusable primitive to handle state accumulation.

1. **File:** `apps/tui/src/hooks/data/useCursorPagination.ts`
2. **Action:** 
   - Implement `useCursorPagination<TRaw, TParsed>(config)`.
   - Utilize `useTUIFetch` for network requests.
   - Implement state management for `items`, `isLoading`, `error`, `hasMore`.
   - Accumulate items via `cursorRef` and handle memory capping (e.g., evicting oldest items after a threshold).
   - Support optional `clientFilter` callback applied post-parsing.
   - Ensure changing `cacheKey` triggers a hard reset.

## Step 4: Implement `useChanges` Hook

Provide paginated change history data.

1. **File:** `apps/tui/src/hooks/data/useChanges.ts`
2. **Action:**
   - Wrap `useCursorPagination` targeting `GET /api/repos/:owner/:repo/changes`.
   - Provide a client-side filter for `conflicted`, `empty`, `non-empty` states.
   - Ensure the return payload reverses accumulated items client-side if `sort: "oldest"` is requested.
   - Set default pagination limits (perPage: 30) and memory cap (maxItems: 500).

## Step 5: Implement `useRepoConflicts` Hook

Provide conflicted changes alongside their file-level conflicts loaded on demand.

1. **File:** `apps/tui/src/hooks/data/useRepoConflicts.ts`
2. **Action:**
   - Utilize `useCursorPagination` configured for `/changes` with a client-side filter requiring `hasConflict === true`.
   - Manage a localized cache (`Map<string, ConflictDetail>`) for on-demand conflict details.
   - Expose `loadConflictsForChange(changeId)` to fetch `GET /api/repos/:owner/:repo/changes/:change_id/conflicts` and populate the cache.
   - Join paginated changes with cache data to yield `conflictedChanges` and `conflictCount`.
   - Ensure `refetch()` aborts in-flight detail requests and clears the cache.

## Step 6: Implement `useOperationLog` Hook

Provide a paginated audit trail of repository operations.

1. **File:** `apps/tui/src/hooks/data/useOperationLog.ts`
2. **Action:**
   - Wrap `useCursorPagination` targeting `GET /api/repos/:owner/:repo/operations`.
   - Configure for audit-trail workloads: `perPage: 50` and `maxItems: 5000`.

## Step 7: Update Hook Exports (Barrel Files)

Ensure all data hooks are accessible from a clean import path.

1. **File:** `apps/tui/src/hooks/data/index.ts`
   - **Action:** Export `useChanges`, `useRepoConflicts`, `useOperationLog`, `useCursorPagination`, and all associated types/parsers from `jj-types.ts`.
2. **File:** `apps/tui/src/hooks/index.ts`
   - **Action:** Ensure `export * from "./data/index.js";` is present.

## Step 8: Extend E2E Test Helpers

Provide navigation helpers for the test suite to reach the correct UI tabs.

1. **File:** `e2e/tui/helpers.ts`
2. **Action:** Append `navigateToChangesTab`, `navigateToConflictsTab`, and `navigateToOperationLog` functions. They should leverage `terminal.sendKeys()` to simulate deep linking or 'Go-To' navigation and tab switching (`2`, `4`, `5`).

## Step 9: Author E2E Integration Tests

Implement the explicit test definitions provided in the specification.

1. **File:** `e2e/tui/repository.test.ts` (or individual test files per hook in `e2e/tui/`)
2. **Action:** 
   - Add pure-function unit tests for `jj-types.ts` parsers (`parseChange`, `parseChangeConflict`, `parseOperation`).
   - Add the `TUI_REPO_CHANGES_VIEW` block validating loading, 501 errors, retry mechanics, client-side filtering, and responsive layout snapshots.
   - Add the `TUI_REPO_CONFLICTS_VIEW` block verifying empty states, 501 errors, and responsive layouts.
   - Add the `TUI_REPO_OPERATION_LOG` block verifying default limits, pagination triggers, navigation (`j/k`, `G`, `gg`), and snapshots.
   - **Crucial Rule:** Any tests fetching from backend routes must expect and validate the `501 Not Implemented` error state (since the backend is not yet implemented). Never skip or comment out failing tests.

## Acceptance Criteria
- `apps/tui/src/hooks/data/` structure compiles strictly under `tsc --noEmit`.
- Pure functions are verified with unit assertions.
- All E2E tests execute via `@microsoft/tui-test`, capturing 80x24, 120x40, and 200x60 snapshot widths.
- Tests verifying API endpoints explicitly validate error fallback and visual propagation of 501 HTTP responses.