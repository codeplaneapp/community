# TUI Org Data Hooks Context Research

## 1. General Findings & Structure
The Codeplane TUI codebase follows a specific organizational structure. The implementation code and patterns specified in the PRD correctly map to the existing architecture under `specs/tui/apps/tui/` and `specs/tui/packages/ui-core/`. 
- All hook and type implementations must go to `apps/tui/src/hooks/`.
- E2E tests target `e2e/tui/` which uses `@microsoft/tui-test`.

## 2. Discrepancy Found in `useAuth`
In the provided Engineering Specification, the role calculation logic for `useOrgRole` is written as:
```typescript
const { user } = useAuth();
// ... 
const currentMember = user ? members.data.find(m => m.username === user.username) : undefined;
```

**Important Correction:** Upon inspecting `apps/tui/src/providers/AuthProvider.tsx` and `apps/tui/src/hooks/useAuth.ts`, the `AuthContextValue` defines `user` as `string | null` (it directly stores the username string). It is NOT an object with a `.username` property. 

Therefore, the implementation must be corrected to:
```typescript
const currentMember = user ? members.data.find(m => m.username === user) : undefined;
```

## 3. Core Hook APIs in `@codeplane/ui-core`
1. **`usePaginatedQuery<T>`**: Located in `packages/ui-core/src/hooks/internal/usePaginatedQuery.ts`.
   - **Config options:** `{ client: APIClient, path: string, cacheKey: string, perPage: number, enabled: boolean, maxItems: number, autoPaginate: boolean, parseResponse: (data: unknown, headers: Headers) => { items: T[], totalCount: number | null } }`
   - **Returns:** `{ items, totalCount, isLoading, error, hasMore, fetchMore, refetch }`

2. **`useMutation<TInput, TOutput>`**: Located in `packages/ui-core/src/hooks/internal/useMutation.ts`.
   - **Config options:** `{ mutationFn: (input: TInput, signal: AbortSignal) => Promise<TOutput>, onOptimistic?: ..., onSuccess?: ..., onError?: ..., onSettled?: ... }`
   - **Returns:** `{ mutate, isLoading, error, reset }`

3. **`useQuery<T>`**: Located in `apps/tui/src/hooks/useQuery.ts`.
   - **Config options:** `{ path: string, params?: Record<string, string>, transform?: (response: unknown) => T, enabled?: boolean }`
   - **Returns:** `{ data, loading, error, refetch }`

## 4. Error Handling and Parsing
- `parseResponseError(response: Response)` from `packages/ui-core/src/types/errors.ts` returns a Promise that resolves to an `ApiError`.
- Custom errors `NetworkError` and generic `HookError` map directly to the domain types as detailed in the spec.

## 5. E2E Tests Configuration
- Existing test file: `specs/tui/e2e/tui/organizations.test.ts`.
- It extensively uses `launchTUI()` from `helpers.js` to simulate interactions and `tui.snapshot()` for regression testing.
- Tests for the new hooks (data loading, pagination, viewer roles, and mutations) should be grouped logically in new `describe()` blocks and appended to the existing file as laid out in the spec.

## 6. Import Conventions
As observed in files like `useWorkflowRuns.ts`, the repository enforces ES modules strictly. Imports to local files and `ui-core` packages must end with the `.js` extension (e.g., `./org-types.js` and `@codeplane/ui-core/src/hooks/internal/usePaginatedQuery.js`), even when authored in TypeScript.