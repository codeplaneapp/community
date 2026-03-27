# Implementation Plan: `tui-repo-tree-hooks`

This document outlines the step-by-step implementation plan for the `tui-repo-tree-hooks` ticket. This ticket focuses on building the data layer hooks for repository tree navigation, file content viewing, and bookmark listing within the Codeplane TUI. All implementation targets `apps/tui/src/` and E2E tests are placed in `e2e/tui/`.

## Step 1: Define Types

**File:** `apps/tui/src/hooks/repo-tree-types.ts`

**Action:** Create a dedicated types file for the repository tree, file content, and bookmark API responses to keep the core hook logic clean.

**Implementation Details:**
- Import `LoadingError` from `../loading/types.js`.
- Define `TreeEntryType` (`"file" | "dir" | "symlink" | "submodule"`) and `TreeEntry`.
- Define `UseRepoTreeOptions` and `UseRepoTreeReturn`.
- Define `UseFileContentOptions` and `UseFileContentReturn`.
- Define `Bookmark`, `UseBookmarksOptions`, and `UseBookmarksReturn`.

## Step 2: Implement Internal Fetch Helper

**File:** `apps/tui/src/hooks/useRepoFetch.ts`

**Action:** Create an internal (unexported from the barrel) fetch helper to encapsulate authenticated API calls to the Codeplane server and translate HTTP/Network errors into TUI-compatible `LoadingError` shapes.

**Implementation Details:**
- Import `useAPIClient` from `../providers/APIClientProvider.js`.
- Implement a custom `FetchError` class extending `Error` that accepts an HTTP status code.
- Implement a `toLoadingError(err: unknown): LoadingError` function that categorizes `FetchError` status codes (e.g., `401` to `auth_error`, `429` to `rate_limited`, >= `400` to `http_error`) and truncates messages to 60 characters.
- Implement the `useRepoFetch` hook, returning a `get<T>(path: string, options?: FetchOptions): Promise<T>` method that attaches the `Authorization: Bearer <token>` header and injects `AbortSignal` for cancellation.

## Step 3: Implement `useRepoTree` Hook

**File:** `apps/tui/src/hooks/useRepoTree.ts`

**Action:** Create the hook for retrieving and lazy-loading a repository's directory tree at a given reference.

**Implementation Details:**
- Import dependencies: React hooks (`useState`, `useEffect`, `useCallback`, `useRef`), `useRepoFetch`, `toLoadingError`, and types from `./repo-tree-types.js`.
- Manage local state for `entries`, `isLoading`, and `error`.
- Setup an `AbortController` within the `useEffect` to guarantee race condition protection and clean cancellation on unmount.
- Construct a `sortTreeEntries(entries: TreeEntry[])` helper function to organize directories first, then files, both alphabetically.
- Expose a `fetchPath(subPath: string)` callback to lazily fetch subdirectories on-demand for use within a code explorer tree node expansion.

## Step 4: Implement `useFileContent` Hook

**File:** `apps/tui/src/hooks/useFileContent.ts`

**Action:** Create the hook for fetching a single file's contents at a specific jj change ID.

**Implementation Details:**
- Import dependencies: React hooks, `useRepoFetch`, `toLoadingError`, and types from `./repo-tree-types.js`.
- Handle state for `content`, `resolvedPath`, `isLoading`, and `error`.
- Assemble the URL `apiPath` targeting the jj-native endpoint `/api/repos/:owner/:repo/file/:change_id/:filePath`.
- Automatically abort previous fetch requests when parameters change.
- Ensure `content` and `resolvedPath` are reset to `null` if a new fetch errors out.

## Step 5: Implement `useBookmarks` Hook

**File:** `apps/tui/src/hooks/useBookmarks.ts`

**Action:** Create the hook for fetching paginated lists of a repository's bookmarks.

**Implementation Details:**
- Import dependencies: React hooks, `useRepoFetch`, `toLoadingError`, and types from `./repo-tree-types.js`.
- Track `bookmarks`, `cursor`, `hasMore`, `isLoading`, and `error` states.
- Request an initial batch limit of `100` to cover a majority of use-cases in a single round-trip.
- Implement a deduplicated `fetchMore` function utilizing a `useRef` boolean guard to prevent overlapping cursor fetches during rapid user scrolling.

## Step 6: Expose Hooks via Barrel Export

**File:** `apps/tui/src/hooks/index.ts`

**Action:** Append the new hooks and types to the central hooks export module.

**Implementation Details:**
- Add `export { useRepoTree }`, `export { useFileContent }`, and `export { useBookmarks }`.
- Export types from `./repo-tree-types.js`.
- Explicitly ensure that `useRepoFetch` and `toLoadingError` are NOT exported, retaining their internal status.

## Step 7: Create End-to-End & Integration Tests

**File:** `e2e/tui/repository.test.ts`

**Action:** Implement test cases using `@microsoft/tui-test` and `bunEval` to validate compilation, structure, type shape, pure functions, and API-bound E2E terminal renders.

**Implementation Details:**
- **Static Analysis Tests**: Write `bunEval` statements to confirm the physical existence of the newly created files and verify that `hooks/index.ts` exports exactly the intended symbols while omitting internal helpers.
- **Compilation Tests**: Use `run('bunx', ['tsc', '--noEmit', <filepath>])` to rigorously enforce TypeScript integrity on the standalone hook files.
- **Unit Tests (`useRepoFetch` / `useRepoTree`)**: Verify that `toLoadingError` effectively partitions HTTP 401, 429, 500, 501, and generic errors into appropriate `LoadingError` interfaces. Verify the `sortTreeEntries` functionality locally within the test to assert directory prioritization.
- **Integration Tests (Will fail on 501s intentionally)**:
    - Build snapshot matches testing standard and minimal bounds (`TERMINAL_SIZES`) rendering the repository navigation, `CodeExplorer` tab (triggering `useRepoTree`), `Bookmarks` list (`useBookmarks`), and file preview panes (`useFileContent`).
    - Ensure the tests execute against a real instantiated server with `createMockAPIEnv()` and capture the 501 fallback behavior elegantly per project policy.