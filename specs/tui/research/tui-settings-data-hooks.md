# Codebase Context: TUI Settings Data Hooks

This document provides codebase context, relevant file paths, and existing patterns to support the implementation of the `tui-settings-data-hooks` ticket. The codebase relies heavily on the `ui-core` hooks and local wrapping patterns in `apps/tui`.

## 1. Types Isolation (`settings-types.ts`)
**Reference File:** `apps/tui/src/hooks/workflow-types.ts`

The TUI splits hook implementations and type definitions into separate files. This avoids cyclic dependencies and allows types to be imported safely across UI components.

Following the pattern in `workflow-types.ts`, the new `settings-types.ts` file should include:
- Re-exporting the `HookError` type from `ui-core`: `export type { HookError } from "@codeplane/ui-core/src/types/errors.js";`
- Defining the domain interfaces (`UserProfile`, `EmailResponse`, `SSHKeyResponse`, `TokenSummary`, etc.).
- Re-defining or re-exporting the wrapper hook response types:
  ```typescript
  export interface QueryResult<T> { ... }
  export interface ListQueryResult<T> { ... }
  export interface MutationResult<TInput, TOutput = void> { ... }
  ```

## 2. Query Patterns (`useQuery`)
**Reference File:** `apps/tui/src/hooks/useQuery.ts`

The TUI application provides a local `useQuery` wrapper around the `ui-core` API client to handle fetch lifecycles. It expects:
- An options object: `{ path: string; params?: Record<string, string>; transform?: (response: unknown) => T; enabled?: boolean; }`
- Returns: `{ data, loading, error, refetch }`

The new settings read hooks (e.g., `useUser`, `useUserEmails`, `useUserSSHKeys`) should directly invoke this `useQuery` function.

**Example Adaptation:**
```typescript
import { useQuery } from "./useQuery.js";
import type { QueryResult, UserProfile } from "./settings-types.js";

export function useUser(): QueryResult<UserProfile> {
  return useQuery<UserProfile>({ path: "/api/user" });
}
```

## 3. Mutation and Optimistic Rollback Patterns (`useMutation`)
**Reference Files:** 
- `packages/ui-core/src/hooks/internal/useMutation.ts`
- `apps/tui/src/hooks/useWorkflowActions.ts`

The core `useMutation` hook provides lifecycle callbacks (`onOptimistic`, `onSuccess`, `onError`, `onSettled`). However, it does not persist the rollback function returned by the consumer's `onOptimistic` callback natively.

In the existing `useWorkflowActions.ts`, rollbacks are stored by polluting the hook function object:
```typescript
// Anti-pattern currently used in useWorkflowActions.ts:
(useWorkflowRunCancel as any)[`rollback_${runId}`] = rollback;
```

**Mandated Pattern Improvement for Settings:**
As explicitly required in the engineering spec, the `useSettingsData.ts` module must use module-scoped `Map` instances to store rollbacks instead of attaching them to the hook objects. This is much safer for garbage collection.

**Example Adaptation:**
```typescript
import { useMutation } from "@codeplane/ui-core/src/hooks/internal/useMutation.js";

const deleteEmailRollbacks = new Map<string, () => void>();

export function useDeleteEmail(callbacks) {
  const client = useAPIClient();
  const { mutate, isLoading, error, reset } = useMutation({
    mutationFn: async (emailId, signal) => {
      const response = await client.request(`/api/user/emails/${emailId}`, { method: "DELETE", signal });
      if (!response.ok) throw await parseResponseError(response);
    },
    onOptimistic: (emailId) => {
      if (callbacks?.onOptimistic) {
        const rollback = callbacks.onOptimistic(emailId);
        if (typeof rollback === "function") deleteEmailRollbacks.set(`${emailId}`, rollback);
      }
    },
    onError: (err, emailId) => {
      const rollback = deleteEmailRollbacks.get(`${emailId}`);
      if (rollback) rollback();
      deleteEmailRollbacks.delete(`${emailId}`);
      callbacks?.onError?.(err, emailId);
    },
    onSuccess: (result, emailId) => {
      deleteEmailRollbacks.delete(`${emailId}`);
      callbacks?.onSuccess?.(emailId);
    }
  });
  return { execute: mutate, loading: isLoading, error, reset };
}
```

## 4. Error Handling (`HookError`)
**Reference File:** `packages/ui-core/src/types/errors.ts`

Mutations must catch `!response.ok` conditions and throw errors parsed by `parseResponseError(response)`. This standardizes the error into an `ApiError` which conforms to the `HookError` union type (`ApiError | NetworkError`), allowing the TUI layout to render the correct message string (`err.detail`).

## 5. Exports Barrel (`index.ts`)
**Reference File:** `apps/tui/src/hooks/index.ts`

The barrel file already aggregates domain hooks. Both the actual hooks from `useSettingsData.ts` and the type definitions from `settings-types.ts` must be exported here to fulfill the public API of the hooks directory.

## 6. End-to-End Testing (`@microsoft/tui-test`)
**Target File:** `e2e/tui/settings.test.ts`

As seen in the spec, tests will utilize `@microsoft/tui-test` using standard OpenTUI primitives. Testing asserts visual state using:
- `.sendKeys(...)` simulating user behavior (e.g. `g s` for Settings, `Tab`, `ctrl+s`).
- `.waitForText(...)` awaiting specific terminal render blocks.
- `.snapshot().toMatchSnapshot()` asserting standard visual regressions.