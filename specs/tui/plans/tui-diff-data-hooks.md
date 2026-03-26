# Implementation Plan: TUI Diff Data Hooks

**Ticket:** `tui-diff-data-hooks`

This implementation plan details the steps required to implement the data hooks for fetching and creating diffs and inline comments within the TUI. It establishes the typed communication layer with the Codeplane API, introduces an ephemeral caching strategy, and integrates optimistic mutations and loading states.

## Step 1: Define Diff Types

**Target:** `apps/tui/src/types/diff.ts`

1. Create `diff.ts` in the types directory.
2. Define local types that mirror the server's response shapes:
   - `FileDiffItem` (with specific `change_type` union).
   - `ChangeDiffResponse` and `LandingChangeDiff`.
   - `LandingDiffResponse`.
   - `LandingCommentAuthor` and `LandingComment`.
   - `CreateLandingCommentInput` and `DiffFetchOptions`.
3. Keep these localized to the TUI to allow for potential future UI-specific properties.

## Step 2: Implement Diff Cache Layer

**Target:** `apps/tui/src/lib/diff-cache.ts`

1. Create a lightweight, `Map`-based in-memory cache to temporarily store diff responses.
2. Implement a 30-second TTL (Time-to-Live) constant: `CACHE_TTL_MS = 30_000`.
3. Create deterministic cache key generators:
   - `changeDiffCacheKey(owner, repo, changeId, ignoreWhitespace)`
   - `landingDiffCacheKey(owner, repo, number, ignoreWhitespace)`
   - `landingCommentsCacheKey(owner, repo, number)`
4. Implement getter and setter functions: `getCached<T>(key)` (validating TTL) and `setCached<T>(key, data)`.
5. Implement invalidation utilities: `invalidateCache(key)`, `invalidateCacheByPrefix(prefix)` (important for busting comment caches after mutation), and `clearDiffCache()`.

## Step 3: Implement `useChangeDiff` Hook

**Target:** `apps/tui/src/hooks/useChangeDiff.ts`

1. Create the hook to fetch data from `GET /api/repos/:owner/:repo/changes/:change_id/diff`.
2. Consume `useAPIClient()` to access `client.baseUrl` and `client.token`.
3. Map the `ignore_whitespace` option to the `?whitespace=ignore` query parameter.
4. Use an `AbortController` bound to a `useRef` to cancel in-flight requests on rapid refetches or component unmount.
5. Check the cache using `changeDiffCacheKey` before initiating a fetch. If bypassing or missing, fetch and update the cache.
6. Expose `files`, `changeId`, `isLoading`, `error`, and a `refetch` function.

## Step 4: Implement `useLandingDiff` Hook

**Target:** `apps/tui/src/hooks/useLandingDiff.ts`

1. Create the hook to fetch data from `GET /api/repos/:owner/:repo/landings/:number/diff`.
2. Map the `ignore_whitespace` option to the `?ignore_whitespace=true` query parameter.
3. Follow the same caching and `AbortController` patterns as `useChangeDiff`.
4. Implement a `flattenChangeDiffs` utility function to map the nested stack of `changes` into a flat array of `FileDiffItem` elements for the DiffViewer.
5. Return both the flattened `files` and structured `changes`, along with `landingNumber`, `isLoading`, `error`, and `refetch`.

## Step 5: Implement `useLandingComments` Hook

**Target:** `apps/tui/src/hooks/useLandingComments.ts`

1. Create the hook to fetch data from `GET /api/repos/:owner/:repo/landings/:number/comments` using page-based pagination (`?page=X&per_page=50`).
2. Extract the total count from the `X-Total-Count` response header to drive the `hasMore` state.
3. Cache the results of the *first page only* using `landingCommentsCacheKey`.
4. Partition the returned comments into two arrays:
   - `inlineComments`: Comments where `path !== ""` and `line > 0`.
   - `generalComments`: Comments where `path === ""` or `line === 0`.
5. Return partitioned comments, `hasMore`, `fetchMore`, `refetch`, `isLoading`, and `totalCount`.

## Step 6: Implement `useCreateLandingComment` Hook

**Target:** `apps/tui/src/hooks/useCreateLandingComment.ts`

1. Create the mutation hook calling `POST /api/repos/:owner/:repo/landings/:number/comments`.
2. Consume `useLoading()` to interact with the global `LoadingProvider`.
3. Implement optimistic rendering logic:
   - Use a decrementing negative ID generator (`provisionalIdCounter = -1`).
   - Trigger `onOptimistic` immediately with the provisional comment.
   - Fire the fetch request. **Do not attach an AbortSignal.** Mutations must complete in the background.
   - On success: call `onSuccess`, `loading.completeMutation`, and `invalidateCacheByPrefix` to bust the comment cache.
   - On failure: call `onRevert`, `onError`, and `loading.failMutation`.

## Step 7: Update Export Barrels

**Targets:** `apps/tui/src/types/index.ts`, `apps/tui/src/hooks/index.ts`

1. **`types/index.ts`**: Add `export type { FileDiffItem, ChangeDiffResponse, LandingChangeDiff, LandingDiffResponse, LandingComment, LandingCommentAuthor, CreateLandingCommentInput, DiffFetchOptions } from "./diff.js";`
2. **`hooks/index.ts`**: Re-export `useChangeDiff`, `useLandingDiff`, `useLandingComments`, and `useCreateLandingComment` alongside their respective return types.

## Step 8: Write E2E Tests

**Target:** `e2e/tui/diff.test.ts`

1. Append to the existing file. Do not alter existing syntax highlighting tests.
2. Write `TUI_DIFF_DATA` tests mapped strictly to the PRD specifications using the `launchTUI` helper.
3. Cover `useChangeDiff` (DATA-CD-001 through DATA-CD-007) simulating navigation, loading states, and refetch behaviors.
4. Cover `useLandingDiff` (DATA-LD-001 through DATA-LD-006) validating cache segregation by whitespace options.
5. Cover `useLandingComments` (DATA-LC-001 through DATA-LC-005) validating inline vs. general partitioning and pagination.
6. Cover `useCreateLandingComment` (DATA-CC-001 through DATA-CC-007) asserting form appearance, optimistic result display, and cancelation flows.
7. Add responsive rendering bounds tests (RSP-DD-001, RSP-DD-002) at `80x24` and `200x60` sizes.
8. *Crucial rule*: Tests against unimplemented (501) endpoints must be left failing, simulating realistic backend failures until the server is fully implemented.