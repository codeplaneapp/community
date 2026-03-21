# Implementation Plan: tui-workflow-data-hooks

## 1. Overview & Strategy

This implementation plan covers the creation of workflow data hooks for the Codeplane TUI. Based on recent research findings, the foundational primitives for API access and React hooks (`useAPIClient`, `usePaginatedQuery`, `useMutation`) **already exist** in `@codeplane/ui-core`. 

Therefore, instead of building everything from scratch as originally outlined in the spec, we will adopt a **Pragmatic Adaptation strategy**:
- We will leverage `@codeplane/ui-core` for the API client and foundational hooks (`usePaginatedQuery`, `useMutation`).
- We will build an adapter layer within `apps/tui/src/hooks/` to map the `ui-core` primitive return values (e.g., `items`, `fetchMore`, `mutate`) to the exact domain contracts required by the TUI engineering spec (`data`, `loadMore`, `execute`).
- We will implement a missing primitive, `useQuery`, for single-resource fetching.
- We will implement all 12 requested workflow hooks and their corresponding types.
- We will establish E2E tests exactly as specified.

## 2. Step-by-Step Execution Plan

### Step 1: Shared Types and Error Definitions
**File:** `apps/tui/src/hooks/workflow-types.ts`
- Extract and define the domain models (`WorkflowDefinition`, `WorkflowRun`, `WorkflowRunDetailResponse`, `WorkflowArtifact`, `WorkflowCache`, etc.).
- Define the return type interfaces (`QueryResult<T>`, `PaginatedQueryResult<T>`, `MutationResult<TInput, TOutput>`) exactly as dictated by the spec to ensure screen components do not need to change.
- Define filter interfaces (`WorkflowRunFilters`, `WorkflowCacheFilters`).
- Define memory cap constants (`MAX_DEFINITIONS`, `MAX_RUNS`, `MAX_ARTIFACTS`, `MAX_CACHES`).
- **Adaptation:** Import the existing error types from `@codeplane/ui-core/src/types/errors` and alias or map them to the spec's `HookError` shape.

### Step 2: Implement Single-Resource Fetching Primitive
**File:** `apps/tui/src/hooks/useQuery.ts`
- The `ui-core` package currently lacks a simple single-resource fetching hook. We will implement `useQuery<T>` internally for the TUI.
- It will consume `useAPIClient` from `@codeplane/ui-core`.
- It will accept `{ path, params, transform, enabled }` and return `{ data, loading, error, refetch }` matching the `QueryResult<T>` interface.

### Step 3: Implement Workflow List Hooks (Paginated)
**Files:** `apps/tui/src/hooks/useWorkflowDefinitions.ts`, `apps/tui/src/hooks/useWorkflowRuns.ts`, `apps/tui/src/hooks/useWorkflowCaches.ts`
- Import `usePaginatedQuery` and `useAPIClient` from `@codeplane/ui-core`.
- Wrap the core hook to map the return object to the `PaginatedQueryResult` shape:
  - `items` -> `data`
  - `isLoading` -> `loading`
  - `fetchMore` -> `loadMore`
- For `useWorkflowRuns`, ensure the `state` and `definition_id` filters are correctly translated into query parameters.
- Pass the defined `memoryCap` values to the `maxItems` property of the `ui-core` hook.

### Step 4: Implement Single-Resource Hooks
**Files:** `apps/tui/src/hooks/useWorkflowRunDetail.ts`, `apps/tui/src/hooks/useWorkflowRunArtifacts.ts`, `apps/tui/src/hooks/useWorkflowCaches.ts` (Stats)
- Use the newly created `useQuery` primitive.
- For artifacts, implement an array truncation map in the `transform` function to enforce `MAX_ARTIFACTS`.
- Ensure endpoints handle stubbed data properly as defined in the spec.

### Step 5: Implement Mutation Hooks
**Files:** `apps/tui/src/hooks/useWorkflowActions.ts`, `apps/tui/src/hooks/useDispatchWorkflow.ts`
- Import `useMutation` and `useAPIClient` from `@codeplane/ui-core`.
- Wrap the core mutation hook to map its return object to `MutationResult<TInput, TOutput>`:
  - `mutate` -> `execute`
  - `isLoading` -> `loading`
- Ensure optimistic updates, success, and error callbacks are properly passed down.
- Implement the `mutationFn` using the `client.request()` method with appropriate POST/DELETE methods.

### Step 6: Expose Hooks via Barrel Export
**File:** `apps/tui/src/hooks/index.ts`
- Update the existing barrel file to export all 12 newly created hooks and the shared types from `workflow-types.ts`.
- Retain existing exports (`useNavigation`, etc.).

### Step 7: Create E2E Tests
**File:** `e2e/tui/workflows.test.ts`
- Create the test suite exactly as provided in the engineering spec using `@microsoft/tui-test`.
- Structure the tests into descriptive `describe` blocks.
- Since we are not mocking the backend, these tests will hit the real local server. Tests asserting on stubbed artifact/cache endpoints will expect empty states.

## 3. File Inventory

| File Path | Action | Description |
|-----------|--------|-------------|
| `apps/tui/src/hooks/workflow-types.ts` | **Create** | All shared types, interfaces, constants |
| `apps/tui/src/hooks/useQuery.ts` | **Create** | Reusable single-resource query hook utilizing `useAPIClient` |
| `apps/tui/src/hooks/useWorkflowDefinitions.ts` | **Create** | Workflow definitions list hook |
| `apps/tui/src/hooks/useWorkflowRuns.ts` | **Create** | Workflow runs list hook |
| `apps/tui/src/hooks/useWorkflowRunDetail.ts` | **Create** | Single run detail hook |
| `apps/tui/src/hooks/useWorkflowRunArtifacts.ts` | **Create** | Run artifacts hook |
| `apps/tui/src/hooks/useWorkflowCaches.ts` | **Create** | Cache list + stats hooks |
| `apps/tui/src/hooks/useWorkflowActions.ts` | **Create** | Cancel/rerun/resume/delete mutation hooks |
| `apps/tui/src/hooks/useDispatchWorkflow.ts` | **Create** | Dispatch mutation hook |
| `apps/tui/src/hooks/index.ts` | **Update** | Add all new exports and types |
| `e2e/tui/workflows.test.ts` | **Create** | E2E tests for workflow data hooks |

## 4. Productionization & Quality Assurance
- **Logging & Error Handling:** Utilize the existing error mappings from `ui-core` to accurately expose 400, 401, 403, 404, 409, 429, and 5xx errors to the TUI.
- **Typing:** Strict TypeScript typing will be enforced, directly bridging the API layer response bodies into predictable React domain models.
- **Bookmark/Source Control:** Work will be committed under a targeted JJ bookmark (`tui-workflow-data-hooks`) representing the implemented features.
- **Rollback logic:** Mutation hooks that modify list state (like cancel or delete) will ensure they execute the `onOptimistic` rollback function correctly if the `client.request()` throws an exception.
