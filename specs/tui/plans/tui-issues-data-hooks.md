# Implementation Plan: TUI Issues Data Hooks

## 1. Overview
This implementation plan covers the addition of a complete issue data access layer to `packages/ui-core/`. The deliverable is twelve React 19 hooks that wrap the Codeplane HTTP API issue, label, milestone, comment, event, and collaborator endpoints.

**Scope Boundary:**
- **In Scope:** All hook implementation code in `packages/ui-core/src/hooks/issues/`, issue domain types in `packages/ui-core/src/types/issues.ts`, unit/integration tests in `packages/ui-core/src/hooks/issues/__tests__/`, and updated barrel exports.
- **Out of Scope:** No TUI rendering code (`apps/tui/src/`) or TUI E2E tests (`e2e/tui/`) are included in this ticket per the engineering specification.

## 2. Step-by-Step Implementation Steps

### Step 1: Type Definitions
*   **File Created:** `packages/ui-core/src/types/issues.ts`
*   **File Updated:** `packages/ui-core/src/types/index.ts`
*   **Action:** Define strict wire types representing the JSON payload returned by the API (`Issue`, `IssueComment`, `IssueEvent`, `Label`, `Milestone`). Define request types (`CreateIssueRequest`, `UpdateIssueRequest`, etc.) and options types. Export them in the barrel file.
*   **Verification:** Run `cd packages/ui-core && bun run check` to ensure types compile.

### Step 2: Patch `usePaginatedQuery`
*   **File Updated:** `packages/ui-core/src/hooks/internal/usePaginatedQuery.ts`
*   **Action:** Update URL construction to support paths that already contain `?` query parameters.
    *   Change: ``const url = `${path}?page=${currentPage}&per_page=${perPage}`;``
    *   To: ``const separator = path.includes('?') ? '&' : '?'; const url = `${path}${separator}page=${currentPage}&per_page=${perPage}`;``
*   **Verification:** Ensure existing tests in `packages/ui-core` pass.

### Step 3: Implement `useIssues`
*   **Files Created:** `packages/ui-core/src/hooks/issues/useIssues.ts`, `packages/ui-core/src/hooks/issues/__tests__/useIssues.test.ts`
*   **Action:** Implement paginated issue list hook using `usePaginatedQuery`. Add support for `state` filter appended to the query path. Cap `perPage` at 100.
*   **Verification:** Pass mock-client tests (initial state, fetch lifecycle, state filter, hasMore) and integration tests against real server.

### Step 4: Implement `useIssue`
*   **Files Created:** `packages/ui-core/src/hooks/issues/useIssue.ts`, `packages/ui-core/src/hooks/issues/__tests__/useIssue.test.ts`
*   **Action:** Implement single-resource fetch. Add 30-second stale-while-revalidate cache tracked via `useRef`. Add guard to bypass fetch if `issueNumber <= 0`.
*   **Verification:** Pass mock-client tests and integration tests.

### Step 5: Implement `useCreateIssue`
*   **Files Created:** `packages/ui-core/src/hooks/issues/useCreateIssue.ts`, `packages/ui-core/src/hooks/issues/__tests__/useCreateIssue.test.ts`
*   **Action:** Implement issue creation mutation using `useMutation`. Add client-side synchronous validation for empty titles.
*   **Verification:** Pass mock-client tests for validation, mutation lifecycle, and double-submit prevention.

### Step 6: Implement `useUpdateIssue`
*   **Files Created:** `packages/ui-core/src/hooks/issues/useUpdateIssue.ts`, `packages/ui-core/src/hooks/issues/__tests__/useUpdateIssue.test.ts`
*   **Action:** Implement optimistic update pattern with `onOptimistic`, `onRevert`, `onError`, `onSettled` callbacks. Ensure proper handling of `milestone: null` vs `undefined`.
*   **Verification:** Pass mock-client and integration tests.

### Step 7: Implement `useIssueComments`
*   **Files Created:** `packages/ui-core/src/hooks/issues/useIssueComments.ts`, `packages/ui-core/src/hooks/issues/__tests__/useIssueComments.test.ts`
*   **Action:** Implement paginated comment list using `usePaginatedQuery`.
*   **Verification:** Pass mock-client pagination tests and integration tests.

### Step 8: Implement `useCreateIssueComment`
*   **Files Created:** `packages/ui-core/src/hooks/issues/useCreateIssueComment.ts`, `packages/ui-core/src/hooks/issues/__tests__/useCreateIssueComment.test.ts`
*   **Action:** Implement optimistic append for comments. Construct a temporary `IssueComment` with a negative ID sentinel during `onOptimistic`.
*   **Verification:** Pass mock-client and integration tests.

### Step 9: Implement `useIssueEvents`
*   **Files Created:** `packages/ui-core/src/hooks/issues/useIssueEvents.ts`, `packages/ui-core/src/hooks/issues/__tests__/useIssueEvents.test.ts`
*   **Action:** Implement paginated event list.
*   **Verification:** Pass mock-client tests. *Note: Integration tests are expected to fail with 404 as the server route is not yet implemented. Tests must be left failing per project policy.*

### Step 10: Implement `useRepoLabels` & `useRepoMilestones`
*   **Files Created:** `packages/ui-core/src/hooks/issues/useRepoLabels.ts`, `packages/ui-core/src/hooks/issues/useRepoMilestones.ts`, and their respective `__tests__` files.
*   **Action:** Implement paginated lists for labels and milestones. Add `state` filter to milestones.
*   **Verification:** Pass mock-client and integration tests.

### Step 11: Implement `useRepoCollaborators`
*   **Files Created:** `packages/ui-core/src/hooks/issues/useRepoCollaborators.ts`, `packages/ui-core/src/hooks/issues/__tests__/useRepoCollaborators.test.ts`
*   **Action:** Implement temporary workaround using `/api/search/users?q=...` as a single-fetch hook (not paginated).
*   **Verification:** Pass mock-client and integration tests.

### Step 12: Implement `useAddIssueLabels` & `useRemoveIssueLabel`
*   **Files Created:** `packages/ui-core/src/hooks/issues/useAddIssueLabels.ts`, `packages/ui-core/src/hooks/issues/useRemoveIssueLabel.ts`, and their respective `__tests__` files.
*   **Action:** 
    *   `useAddIssueLabels`: Simple mutation returning the updated label array (200 success).
    *   `useRemoveIssueLabel`: Optimistic removal mutation (204 success).
*   **Verification:** Pass mock-client and integration tests.

### Step 13: Export Barrel and Final Validation
*   **File Created:** `packages/ui-core/src/hooks/issues/index.ts`
*   **File Updated:** `packages/ui-core/src/index.ts`
*   **Action:** Export all hooks and callback types in the `issues/index.ts` barrel, and re-export them from the main public barrel.
*   **Verification:** Run full test suite: `bun test packages/ui-core/src/hooks/issues/`. Run `cd packages/ui-core && bun run check`. Verify imports resolve correctly.