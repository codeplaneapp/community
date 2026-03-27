# Engineering Specification: `tui-repo-tree-hooks`

## Title
Repository tree and file content hooks

## Status
`Partial` — hooks built and compiling; backend API routes are stubbed (return 501).

## Dependency
- `tui-auth-token-loading` — `AuthProvider` and `APIClientProvider` must be mounted so hooks can resolve `baseUrl` and `token` for HTTP requests.

## Feature Mapping
These hooks underpin the following features from `specs/tui/features.ts`:
- `TUI_REPO_CODE_EXPLORER` — lazy-loading tree navigation
- `TUI_REPO_FILE_TREE` — directory listing display
- `TUI_REPO_FILE_PREVIEW` — file content rendering
- `TUI_REPO_BOOKMARKS_VIEW` — bookmark list and ref picker
- `TUI_REPO_README_RENDER` — README file retrieval

---

## 1. Overview

This ticket creates three TUI-side data hooks that power the code explorer screen and are reused by other repository sub-views:

| Hook | Purpose | API Endpoint |
|------|---------|-------------|
| `useRepoTree` | Lazy directory listing for a path within a repo at a given ref | `GET /api/repos/:owner/:repo/contents` and `GET /api/repos/:owner/:repo/contents/*` |
| `useFileContent` | Fetch full file content at a specific jj change | `GET /api/repos/:owner/:repo/file/:change_id/*` |
| `useBookmarks` | Fetch bookmark list (used by bookmark tab and code explorer ref picker) | `GET /api/repos/:owner/:repo/bookmarks` |

All three hooks follow the established TUI data-fetching patterns:
- Use `AbortController` signals for cancellation on unmount/navigation
- Return structured `LoadingError` on failure (matching `apps/tui/src/loading/types.ts`)
- Are consumed via `useAPIClient()` for auth and base URL resolution
- Work against the real API server (currently stubbed at 501 — tests that hit these endpoints will fail as expected per project policy)
- Designed for composability: screen components integrate these hooks with `useScreenLoading` at the screen level, not inside the hooks themselves

---

## 2. API Contract

### 2.1 Contents / Tree Endpoint

**Request:**
```
GET /api/repos/:owner/:repo/contents
GET /api/repos/:owner/:repo/contents/:path
Query params:
  ref=<bookmark_name_or_change_id>   (optional, defaults to default bookmark)
```

**Server location:** `apps/server/src/routes/repos.ts` — the contents endpoints use `APIError(501, ...)` via `writeRouteError`.

**Expected response (when implemented):**
```typescript
interface TreeEntry {
  name: string;           // file or directory name
  path: string;           // full path from repo root
  type: "file" | "dir" | "symlink" | "submodule";
  size?: number;          // file size in bytes (files only)
}

// Response is an array of TreeEntry
type ContentsResponse = TreeEntry[];
```

**Current status:** Returns `501 Not Implemented` with body `{ "message": "list repo contents not implemented" }` or `{ "message": "get repo contents not implemented" }`.

### 2.2 File at Change Endpoint

**Request:**
```
GET /api/repos/:owner/:repo/file/:change_id/:path
```

The `:path` is a wildcard catch-all. The server extracts the file path by slicing the URL pathname after the `/file/:change_id/` prefix, then `decodeURIComponent`'s the result.

**Server location:** `apps/server/src/routes/jj.ts` — wildcard route with `notImplementedErr`.

**SDK type** (`packages/sdk/src/services/repohost.ts`):
```typescript
export interface FileContent {
  path: string;
  content: string;
}
```

**Current status:** Returns `501 Not Implemented` with body `{ "message": "get file at change not implemented" }`.

### 2.3 Bookmarks Endpoint

**Request:**
```
GET /api/repos/:owner/:repo/bookmarks
Query params:
  cursor=<string>         (optional, for pagination)
  limit=<number>          (optional, default 30, max 100)
```

**Server location:** `apps/server/src/routes/jj.ts` — pagination parsed via `parsePagination()`, then stubbed.

**SDK type** (`packages/sdk/src/services/repohost.ts`):
```typescript
export interface Bookmark {
  name: string;
  target_change_id: string;
  target_commit_id: string;
  is_tracking_remote: boolean;
}
```

**RepoHostService response shape:**
```typescript
{ items: Bookmark[]; nextCursor: string }
```

Note: `nextCursor` (camelCase) is used in the service layer. The wire format uses `next_cursor` (snake_case). The hook types use `next_cursor` to match the expected JSON wire format.

**Current status:** Returns `501 Not Implemented` with body `{ "message": "list bookmarks not implemented" }`.

---

## 3. Type Definitions

### File: `apps/tui/src/hooks/repo-tree-types.ts`

A dedicated types file keeps the hook files focused on logic and allows consumers (screen components, test helpers) to import types without pulling in React.

**Key types defined:**
- `TreeEntryType` — Union: `"file" | "dir" | "symlink" | "submodule"`
- `TreeEntry` — `{ name, path, type, size? }`
- `UseRepoTreeOptions` — `{ owner, repo, path?, ref?, enabled? }`
- `UseRepoTreeReturn` — `{ entries, isLoading, error, refetch, fetchPath }`
- `UseFileContentOptions` — `{ owner, repo, changeId, filePath, enabled? }`
- `UseFileContentReturn` — `{ content, filePath, isLoading, error, refetch }`
- `Bookmark` — `{ name, target_change_id, target_commit_id, is_tracking_remote }`
- `UseBookmarksOptions` — `{ owner, repo, enabled? }`
- `UseBookmarksReturn` — `{ bookmarks, isLoading, error, hasMore, fetchMore, refetch }`

All error fields use `LoadingError` from `../loading/types.js`.

---

## 4. Implementation Plan

Each step is a vertical slice that produces a testable artifact.

### Step 1: Type definitions ✅

**File:** `apps/tui/src/hooks/repo-tree-types.ts` — Created.

Zero runtime dependencies — only imports `LoadingError` from `../loading/types.js`. All types are exported and importable from sibling modules.

### Step 2: Internal fetch helper ✅

**File:** `apps/tui/src/hooks/useRepoFetch.ts` — Created.

Provides:
- `useRepoFetch()` hook returning `{ get }` bound to current `APIClient.baseUrl` and `APIClient.token`
- `FetchError` class carrying HTTP status for error classification
- `toLoadingError(err)` converting any error to `LoadingError`

**Design decisions:**
- Uses native `fetch` (available in Bun) rather than an npm HTTP client
- `FetchError` carries HTTP status so `toLoadingError` can produce the correct `LoadingError.type`
- Error classification mirrors `parseToLoadingError` in `useScreenLoading.ts` (401 → auth_error, 429 → rate_limited, 4xx/5xx → http_error, AbortError → network cancel, other → network)
- Response body parsed as `Record<string, unknown>` with `typeof body?.message === "string"` guard matching the server's `{ message: string }` error format
- Truncation: messages >60 chars → `s.slice(0, 57) + "…"` (matches `truncateErrorSummary` in `useScreenLoading.ts`)

### Step 3: `useRepoTree` hook ✅

**File:** `apps/tui/src/hooks/useRepoTree.ts` — Created.

**Key design decisions:**
1. **`fetchPath` is decoupled from main state.** The code explorer maintains its own tree model. `fetchPath` returns entries directly so the tree component inserts them at the correct depth.
2. **`enabled` parameter.** Supports lazy-loading where the hook is instantiated but shouldn't fetch until the code explorer tab is active.
3. **Sorting.** Directories first, then files, alphabetical within each group via `sortTreeEntries()` (module-private).
4. **AbortController per fetch.** New requests cancel stale in-flight requests. Unmount aborts via cleanup function.
5. **`fetchPath` does not use AbortController.** It's a user-initiated imperative call; the caller can catch errors.

### Step 4: `useFileContent` hook ✅

**File:** `apps/tui/src/hooks/useFileContent.ts` — Created.

**Key design decisions:**
1. **Uses the jj change-based file endpoint** (`/api/repos/:owner/:repo/file/:change_id/*`), not the git-based contents endpoint. This is the jj-native path.
2. **Resets content to `null` on error.** Prevents stale content from displaying when navigating to a file that fails to load.
3. **`filePath` is not URL-encoded segment-by-segment.** The API route uses a wildcard catch-all, preserving `/` characters. The server does its own `decodeURIComponent`.

### Step 5: `useBookmarks` hook ✅

**File:** `apps/tui/src/hooks/useBookmarks.ts` — Created.

**Key design decisions:**
1. **Generous initial page size (100).** Most repos have <100 bookmarks. The `RepoHostService.listBookmarks()` returns all bookmarks with `nextCursor: ""`.
2. **Pagination via cursor.** `fetchMore` supports theoretical large repos. Server enforces `limit <= 100`.
3. **Deduplication guard.** `isFetchingMoreRef` prevents double-fetching from rapid scroll events.
4. **`refetch` resets bookmarks to null.** Ensures loading state on re-fetch.

### Step 6: Export barrel update ✅

**File:** `apps/tui/src/hooks/index.ts` — Updated.

Appended after line 24 (existing `useSidebarState` export):
- `useRepoTree`, `useFileContent`, `useBookmarks` function exports
- All types from `repo-tree-types.ts` as named type exports
- `useRepoFetch`, `FetchError`, `toLoadingError` intentionally NOT exported (internal)

### Step 7: Integration with `useScreenLoading`

Screen components that consume these hooks integrate with the existing loading infrastructure. The hooks' return values plug in directly:

```typescript
// Example usage in a code explorer screen component:
const tree = useRepoTree({ owner, repo, path: currentPath, ref: selectedRef });
const { showSpinner, showError, loadingError, retry } = useScreenLoading({
  id: "code_explorer",
  label: "Loading file tree…",
  isLoading: tree.isLoading,
  error: tree.error ? { message: tree.error.summary, status: tree.error.httpStatus } : null,
  onRetry: tree.refetch,
});
```

This integration is documented here but implemented in the code explorer screen ticket (`TUI_REPO_CODE_EXPLORER`), not in this ticket.

---

## 5. File Inventory

| File | Action | Purpose |
|------|--------|--------|
| `apps/tui/src/hooks/repo-tree-types.ts` | **Created** | Type definitions for all three hooks |
| `apps/tui/src/hooks/useRepoFetch.ts` | **Created** | Internal authenticated fetch helper |
| `apps/tui/src/hooks/useRepoTree.ts` | **Created** | Directory tree hook |
| `apps/tui/src/hooks/useFileContent.ts` | **Created** | File content hook |
| `apps/tui/src/hooks/useBookmarks.ts` | **Created** | Bookmark list hook |
| `apps/tui/src/hooks/index.ts` | **Edited** | Added new exports (appended after line 24) |
| `e2e/tui/repository.test.ts` | **Created** | E2E tests for these hooks |

---

## 6. Unit & Integration Tests

### Test file: `e2e/tui/repository.test.ts`

All tests use `bun:test` and the existing `e2e/tui/helpers.ts` infrastructure. Tests run against a real API server. Tests that fail due to the 501 stub responses or missing `@microsoft/tui-test` are **left failing** per project policy.

### Test Results Summary

**31 pass, 12 fail** (all failures are expected — integration tests requiring uninstalled `@microsoft/tui-test` or unimplemented backend).

### Test Categories

#### 1. Hook file structure (12 tests, all pass)
- File existence checks for all 5 hook files
- Export verification via `bunEval` (direct module imports)
- Barrel file export declarations verified via file content inspection
- Internal helper (`useRepoFetch`) confirmed not publicly exported

#### 2. TypeScript compilation (1 test, passes)
- Verifies none of the 5 new hook files appear in `tsc --noEmit` error output
- Pre-existing errors in other files (AuthErrorScreen, ScreenRouter, etc.) are excluded from assertion

#### 3. Type export surface (4 tests, all pass)
- `TreeEntry` shape with and without optional `size` field
- `Bookmark` shape matches SDK (`name`, `target_change_id`, `target_commit_id`, `is_tracking_remote`)
- `TreeEntryType` union covers all 4 values (`file`, `dir`, `symlink`, `submodule`)

#### 4. useRepoFetch error classification (10 tests, all pass)
- 401 → `auth_error` with httpStatus 401
- 429 → `rate_limited` with httpStatus 429
- 404 → `http_error` with httpStatus 404
- 500 → `http_error` with httpStatus 500
- 501 → `http_error` with httpStatus 501 and summary "Not Implemented" (validates stubbed endpoint handling)
- Generic Error → `network` with message preserved
- AbortError (DOMException) → `network` with "Request cancelled"
- Long messages truncated to ≤60 chars
- Messages ≤60 chars preserved
- Non-Error values → `network` with "Network error"

#### 5. sortTreeEntries behavior (2 tests, all pass)
- Directories sort before files, alphabetical within each group
- Symlinks and submodules sort with files (after directories)

#### 6. FetchError class (2 tests, all pass)
- Carries status and message properties
- Is `instanceof Error`

#### 7. Integration tests (12 tests, all fail as expected)
- `TUI_REPO_FILE_TREE` — 7 tests: code explorer navigation, rendering at all 3 breakpoints, j/k navigation, directory expansion, file content preview
- `TUI_REPO_BOOKMARKS_VIEW` — 3 tests: bookmark tab, 80x24 truncation, column display
- `TUI_REPO_FILE_PREVIEW` — 2 tests: syntax highlighting, loading state

All integration tests fail with `Cannot find module '@microsoft/tui-test/lib/terminal/term.js'` — the test framework dependency is not installed in the current environment. When installed and connected to a real API server, these tests will additionally fail with 501 errors from the stubbed endpoints until the backend is implemented.

### Test Philosophy Notes

1. **Structure/compilation tests pass immediately.** Verify files exist and compile.
2. **Type export surface tests pass immediately.** Verify shapes via `bunEval` without API calls.
3. **Error classification tests pass immediately.** Test pure functions with no network calls, importing directly from file path (not barrel).
4. **Integration tests fail until backend is implemented.** Left failing per project policy — never skipped or commented out.
5. **No mocking.** Tests run against the real server.
6. **Tests run at representative sizes.** Snapshots at minimum (80×24), standard (120×40), and large (200×60).

---

## 7. Productionization Checklist

### 7.1 From POC to production

When backend endpoints are implemented:

1. **Validate response shapes.** Add runtime type validation for API responses before trusting them.
2. **Add caching.** In-memory LRU cache keyed by `(owner, repo, path, ref)` with 30-second TTL and max 200 entries.
3. **Large file handling.** Check file size from tree entry metadata before fetching. Refuse files >1MB.
4. **Binary file detection.** Skip fetching content for binaries, display "Binary file — cannot preview".
5. **Contents endpoint implementation.** Server stubs in `repos.ts` need to call `RepoHostService` methods.
6. **Bookmarks endpoint wiring.** Server stub in `jj.ts` needs to call `repoHostService.listBookmarks()` — the service method is already fully implemented.

### 7.2 Things NOT in scope

- Code explorer screen component (separate ticket: `TUI_REPO_CODE_EXPLORER`)
- Bookmark tab screen component (separate ticket: `TUI_REPO_BOOKMARKS_VIEW`)
- Tree-sitter syntax highlighting — handled by OpenTUI's `<code>` component
- Diff viewing — separate API endpoints and hooks
- File editing — TUI is read-only (per PRD non-goals)

### 7.3 Migration path when `@codeplane/ui-core` adds repo hooks

When shared hooks are added to `ui-core`:
1. Deprecate TUI-specific hooks in favor of shared hooks
2. Update imports: `../hooks/useRepoTree` → `@codeplane/ui-core`
3. Remove `useRepoFetch` helper (shared package provides its own fetch infrastructure)
4. Replace types from `repo-tree-types.ts` with `@codeplane/ui-core/types` or `@codeplane/sdk`

---

## 8. Dependency Graph

```
┌─────────────────────┐
│   Screen Components  │  (future tickets)
│   CodeExplorerScreen │
│   BookmarkTabScreen  │
└────────┬────────────┘
         │ imports
         ▼
┌─────────────────────┐
│   Public Hooks       │  ← THIS TICKET
│   useRepoTree        │
│   useFileContent     │
│   useBookmarks       │
└────────┬────────────┘
         │ imports
         ▼
┌─────────────────────┐
│   Internal Helper    │  ← THIS TICKET
│   useRepoFetch       │
│   FetchError         │
│   toLoadingError     │
└────────┬────────────┘
         │ imports
         ▼
┌─────────────────────┐     ┌───────────────────┐
│  APIClientProvider   │     │  loading/types.ts  │
│  (baseUrl, token)    │     │  (LoadingError)    │
└────────┬────────────┘     └───────────────────┘
         │ depends on
         ▼
┌─────────────────────┐
│   AuthProvider       │  ← tui-auth-token-loading
│   (token resolution) │
└─────────────────────┘
```

---

## 9. Open Questions

| # | Question | Decision / Recommendation |
|---|----------|---------------------------|
| 1 | Should `useRepoTree` use the git-based contents endpoint or the jj-based approach? | **Decision:** Use git-based `/contents` for tree listing (the standard endpoint, stubbed in repos.ts) and jj-based `/file/:change_id/*` for file content (jj-native, supports viewing files at any change). |
| 2 | Should the tree cache be shared across hook instances? | **Recommendation:** Yes, use a module-level `Map` so navigating back to a previously-viewed directory is instant. Implement in productionization phase. |
| 3 | What ref should `useRepoTree` default to when none is specified? | **Decision:** Omit the `ref` query param, letting the server default to the repository's default bookmark. |
| 4 | Should `useBookmarks` prefetch all bookmarks or use incremental pagination? | **Decision:** First page at limit=100 covers most repos. The `RepoHostService.listBookmarks()` already returns all bookmarks with `nextCursor: ""`. `fetchMore` handles the long tail. |
| 5 | Should `useRepoFetch` be extracted to a shared location for other hook groups? | **Recommendation:** Keep internal to repo-tree hooks for now. If other hook groups need the same pattern, extract to a shared `apps/tui/src/lib/fetch.ts` at that time. |
| 6 | Wire format: `next_cursor` vs `nextCursor`? | **Decision:** The TUI types use `next_cursor` (snake_case) to match the expected JSON wire format. The server currently returns `nextCursor` from the service layer but the route handler (when implemented) should serialize to `next_cursor`. If mismatched, the hook can adapt at parse time. |