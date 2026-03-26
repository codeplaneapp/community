# Implementation Plan: Repository Data Hooks Adapter Layer

**Ticket:** `tui-repo-data-hooks`

This document outlines the step-by-step implementation plan for creating the TUI-side adapter hooks that bridge `@codeplane/ui-core`'s data-fetching primitives with the TUI's provider stack, error handling, and pagination patterns.

## Step 1: Upgrade `APIClientProvider`
**Target File:** `apps/tui/src/providers/APIClientProvider.tsx`

1.  **Inline `ui-core` functionality:** Since `@codeplane/ui-core` may not be a formal dependency yet, we will inline the `APIClient` interface, `APIRequestOptions`, `NetworkError`, and `createAPIClient` factory.
2.  **Add TODOs:** Mark the inlined sections with `// TODO(ui-core): Replace with import from @codeplane/ui-core when package is published`.
3.  **Implement Factory:** The factory must return an object with `{ baseUrl, token, request(path, options) }`.
4.  **Update Provider:** `APIClientProvider` should use `useMemo` to instantiate the client via `createAPIClient({ baseUrl, token })` and provide it via context.

## Step 2: Create Shared Types & Parsers
**Target File:** `apps/tui/src/hooks/data/types.ts`

1.  **Define `Repository` Interface:** Use camelCase property names representing the parsed repository data.
2.  **Implement `parseRepository`:** Create a function that accepts a raw `Record<string, unknown>` and maps the `snake_case` API response to the `camelCase` `Repository` interface with proper type coercion.
3.  **Re-export Options:** Export `APIRequestOptions` to avoid leaking inline `ui-core` types directly into hook implementations.

## Step 3: Implement `useTUIFetch` Wrapper
**Target File:** `apps/tui/src/hooks/data/useTUIFetch.ts`

1.  **Define `TUIFetchError`:** An interface extending `Error` with optional `status`, `code`, and `retryAfterMs` fields.
2.  **Consume Providers:** Use `useAPIClient()` and `useAuth()`.
3.  **Error Interception:** Implement a wrapper around `client.request`:
    *   If `status === 401`, construct an unauthorized error and trigger `auth.retry()`.
    *   If `status === 429`, parse the `Retry-After` header, calculate `retryAfterMs`, and throw a rate-limited error.
    *   For other errors, parse the response body (if JSON) for a `message` and throw.
4.  **Return Wrapper:** Return `{ request }`.

## Step 4: Implement `useRepo` Hook
**Target File:** `apps/tui/src/hooks/data/useRepo.ts`

1.  **State Management:** Track `data`, `isLoading`, `error`, and `refetchCounter`.
2.  **Data Fetching:** Use `useTUIFetch().request` within a `useEffect` hooked to `owner`, `repo`, and `refetchCounter`.
3.  **Abort Controller:** Track requests with an `AbortController` stored in a ref to cancel in-flight requests on re-render or unmount.
4.  **Parsing:** Process the successful response through `parseRepository`.
5.  **Return Type:** Export `UseRepoResult` and return `{ repo, isLoading, error, refetch }`.

## Step 5: Implement `useRepos` Hook
**Target File:** `apps/tui/src/hooks/data/useRepos.ts`

1.  **Options Interface:** Define `UseReposOptions` (`owner`, `org`, `visibility`, `sort`, `direction`, `perPage`, `enabled`).
2.  **State Management:** Track `items`, `totalCount`, `isLoading`, `error`, `refetchCounter`, and pagination references (`pageRef`, `lastPageSizeRef`).
3.  **Cache Key:** Compute a `cacheKey` memo based on filter params to hard-reset the list when filters change.
4.  **Endpoint Building:** Implement a `buildPath` function to route to `/api/user/repos`, `/api/users/:user/repos`, or `/api/orgs/:org/repos` based on options.
5.  **Pagination Logic:** Parse the `X-Total-Count` header. Combine existing items with new items, capping the total array at 500 items via slice logic.
6.  **Export:** Return `{ repos, totalCount, isLoading, error, hasMore, fetchMore, refetch }`.

## Step 6: Implement `useRepoReadme` Hook
**Target File:** `apps/tui/src/hooks/data/useRepoReadme.ts`

1.  **State Management:** Track `content`, `filename`, `isLoading`, `error`.
2.  **Fetch Logic:** Request `/api/repos/:owner/:repo/readme` with `Accept: application/vnd.codeplane.raw`.
3.  **404 Handling:** In the catch block, explicitly catch 404 responses and set `content` and `error` to `null` (404 means no README, not an error state).
4.  **Export:** Return `{ content, filename, isLoading, error, refetch }`.

## Step 7: Implement `useStarRepo` Hook
**Target File:** `apps/tui/src/hooks/data/useStarRepo.ts`

1.  **State Management:** Track `isStarred`, `starCount`, `isLoading`, `error`.
2.  **Initial Fetch:** `GET /api/user/starred/:owner/:repo` to check status (204 = starred, 404 = not starred).
3.  **Optimistic Mutation:** Utilize `useOptimisticMutation` from `../useOptimisticMutation.js` to execute `PUT` or `DELETE` requests.
4.  **Toggle Action:** Provide a `toggle()` function that flips the state immediately and relies on `useOptimisticMutation`'s `onRevert` to fix state on failure.
5.  **Export:** Return `{ isStarred, isLoading, starCount, toggle, error }`.

## Step 8: Implement `useClipboard` Hook
**Target File:** `apps/tui/src/hooks/data/useClipboard.ts`

1.  **Renderer Access:** Call `useRenderer()` from `@opentui/react`.
2.  **Detection:** Expose `isSupported` via `renderer.clipboard?.isOsc52Supported() ?? false`.
3.  **Copy Action:** Expose a `copy(text)` function that attempts to use `renderer.clipboard.copyToClipboardOSC52(text)`.
4.  **Feedback:** Temporarily set `justCopied` to `true` for 2000ms upon successful copy.
5.  **Export:** Return `{ copy, isSupported, justCopied }`.

## Step 9: Wire Barrel Exports
**Target Files:** `apps/tui/src/hooks/data/index.ts` & `apps/tui/src/hooks/index.ts`

1.  **Data Barrel:** Create `apps/tui/src/hooks/data/index.ts` and re-export all types and hooks from steps 3-8.
2.  **Main Barrel:** Add `export * from "./data/index.js";` to the bottom of `apps/tui/src/hooks/index.ts`.

## Step 10: Create E2E Tests
**Target File:** `e2e/tui/repository.test.ts`

1.  **Create Test File:** Instantiate `e2e/tui/repository.test.ts` utilizing `launchTUI`, `TERMINAL_SIZES`, `WRITE_TOKEN`, `API_URL`, and `OWNER` from `e2e/tui/helpers.ts`.
2.  **Write Suites:** Replicate the exact test suites and cases specified in the engineering document, categorized by:
    *   `TUI_REPO_LIST_SCREEN` (useRepos hook integration)
    *   `TUI_REPO_OVERVIEW` (useRepo hook integration)
    *   `TUI_REPO_README_RENDER` (useRepoReadme hook integration)
    *   Star/unstar (useStarRepo hook integration)
    *   Clipboard (useClipboard hook integration)
    *   Error handling (TUI-specific error interception)
    *   Pagination (useRepos fetchMore integration)
3.  **Execution Policy:** Rely on `expect(snapshot).toMatchSnapshot()` and string matching. Allow tests for unimplemented backend endpoints or missing UI screens to naturally fail without skipping them.

## Step 11: Type Checking and Validation
1.  Run `bun run check` within `apps/tui/` to ensure all TypeScript types are strictly bound and free of compilation errors.
2.  Ensure that no new dependencies are incorrectly introduced and that OpenTUI components and `ui-core` paradigms are respected.