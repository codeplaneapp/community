# Research Findings for `tui-repo-tree-hooks`

## 1. Existing TUI Hooks & Structure (`apps/tui/src/hooks/`)

Upon inspecting `apps/tui/src/hooks/index.ts`, I found the standard barrel export pattern used across the TUI hooks module. Currently, it exports various UI and state management hooks such as `useDiffSyntaxStyle`, `useTheme`, `useScreenLoading`, `usePaginationLoading`, and others.

This validates **Step 6** of the engineering specification: we will append our new data fetching hooks (`useRepoTree`, `useFileContent`, `useBookmarks`) and the associated types from `repo-tree-types.ts` directly into this file.

## 2. API Client Provider (`apps/tui/src/providers/APIClientProvider.tsx`)

The API client is exposed via the `useAPIClient()` hook, which relies on `APIClientContext`. 

The interface is:
```typescript
export interface APIClient {
  baseUrl: string;
  token: string;
}
```
This perfectly supports the requirements for the proposed `useRepoFetch` internal helper. `useRepoFetch` can invoke `useAPIClient()` to access the `baseUrl` and `token` required to populate the `Authorization: Bearer <token>` header for `fetch()` requests.

## 3. Loading System Types (`apps/tui/src/loading/types.ts`)

I reviewed the `LoadingError` interface defined in the loading types:
```typescript
export interface LoadingError {
  type: "network" | "timeout" | "http_error" | "auth_error" | "rate_limited";
  httpStatus?: number;
  summary: string;
}
```
This confirms the exact shape needed by the `toLoadingError` translation helper inside `useRepoFetch`. It maps perfectly:
- HTTP 401 maps to `type: "auth_error"`.
- HTTP 429 maps to `type: "rate_limited"`.
- HTTP >= 400 (including 501 stubs) maps to `type: "http_error"`.
- Generic / Abort errors map to `type: "network"`.

The `summary` property should be truncated to 60 characters, which aligns exactly with the `toLoadingError` helper logic from the spec.

## 4. Testing Infrastructure (`e2e/tui/helpers.ts`)

The E2E helpers provide everything required by the `e2e/tui/repository.test.ts` integration and unit tests detailed in the spec:
- `TUI_ROOT`, `TUI_SRC`: Path constants for static file checks and `bunEval` executions.
- `TERMINAL_SIZES`: Constants for standard and minimum terminal widths (`minimum: { width: 80, height: 24 }`, `standard: { width: 120, height: 40 }`).
- `createMockAPIEnv`: A helper that provisions the mock API configuration environment variables.
- `launchTUI`: The terminal spawner using `@microsoft/tui-test`, which returns a comprehensive interaction interface (`sendKeys`, `waitForText`, `snapshot`, etc.).
- `bunEval` / `run`: Subprocess utilities meant to evaluate snippet code to test hook exports without mounting a React tree.

## 5. Missing Context (`packages/ui-core` and `apps/ui/`)

A broad glob search across `packages/ui-core/src/` and `apps/ui/src/` yielded no corresponding TypeScript files. This indicates that shared API fetching hooks for the repository concepts do not yet exist in the shared workspaces. This directly reinforces the engineering spec's note that these must be written as TUI-specific temporary hooks inside `apps/tui/src/hooks/` and subsequently migrated once `@codeplane/ui-core` introduces equivalent functionality.

## Summary

The TUI application provides a robust, isolated environment for implementing these features. We have access to the exact primitives needed: `useAPIClient` for authenticated fetching, standard `@microsoft/tui-test` utilities for validating structure and UI outputs, and `LoadingError` interfaces perfectly aligned with our proposed error wrapping. The implementation plan outlined in the spec can be followed verbatim.