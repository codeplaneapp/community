# Engineering Specification: tui-wiki-data-hooks

## 1. Overview
This specification details the implementation of React data hooks for the Codeplane TUI to interact with the Wiki API endpoints. These hooks will serve as the data layer for the TUI Wiki screens, providing page-based pagination, caching, optimistic updates, and robust error handling. They will consume the `@codeplane/ui-core` API client and integrate with the TUI's authentication provider.

## 2. Scope & Requirements
Create five custom React hooks in `apps/tui/src/hooks/`:
1. **`useWikiPages(owner, repo, options?)`**: Fetches a paginated list of wiki pages.
   - Uses page-based pagination (not cursor-based).
   - API: `GET /api/repos/:owner/:repo/wiki?page=N&per_page=30&q=...`
   - Parses the `X-Total-Count` header to determine total available pages.
   - Computes `hasMore` by comparing loaded items against `X-Total-Count`.
   - Supports server-side search via the `q` query parameter.
   - Triggers an automatic reset to page 1 and cancels any in-flight requests when the `q` parameter changes.
   - Enforces a 500-item memory cap to maintain terminal client performance.
2. **`useWikiPage(owner, repo, slug)`**: Fetches a single wiki page's content.
   - API: `GET /api/repos/:owner/:repo/wiki/:slug`
   - Implements a 30-second client-side cache per slug.
3. **`useWikiDelete(owner, repo)`**: Deletes a wiki page.
   - API: `DELETE /api/repos/:owner/:repo/wiki/:slug`
   - Supports optimistic removal from list states.
   - Gracefully handles `403` (permission denied) and `404` (already deleted).
4. **`useWikiCreate(owner, repo)`**: Creates a new wiki page.
   - API: `POST /api/repos/:owner/:repo/wiki`
5. **`useWikiUpdate(owner, repo, slug)`**: Updates an existing wiki page.
   - API: `PUT /api/repos/:owner/:repo/wiki/:slug`

All hooks must robustly handle standard API errors:
- `401 Unauthorized` (auth error screen)
- `429 Too Many Requests` (rate limit flash/indicator)
- Network timeout enforcement (30 seconds)
- Server errors (`5xx`)

## 3. Architecture & Design

### API Client Integration
These hooks will wrap the configured `APIClient` provided by `@codeplane/ui-core` (typically via a `useAPIClient` or `useAuth` hook). Because the TUI operates in a terminal environment, these hooks must avoid browser-specific globals.

### Error Handling
Each hook returns an `error` object which TUI components can use to conditionally render an `ErrorBoundary` or an inline error message. For `401` auth errors, the TUI's `APIClientProvider` interceptor is typically responsible for setting the global auth state, but the hooks must propagate the errors smoothly.

### Pagination Strategy
Unlike the typical cursor-based scrollbox paradigm, `useWikiPages` will manage a numbered `page` state. The hook accumulates fetched pages into an `items` array up to a 500-item limit. Calling `fetchMore()` increments the internal `page` counter and triggers the next request.

### Caching Strategy
For `useWikiPage`, an in-memory `Map` keyed by `owner/repo/slug` and a timestamp will manage the 30-second client-side cache.

## 4. Implementation Plan

### Step 1: Shared Constants and Types
Create `apps/tui/src/hooks/wiki-types.ts` (or place inline) to define standard DTOs.
```typescript
export interface WikiPage {
  slug: string;
  title: string;
  content: string; // Used in detail view
  createdAt: string;
  updatedAt: string;
  author: {
    username: string;
  };
}
```

### Step 2: Implement `useWikiPages`
**Path**: `apps/tui/src/hooks/useWikiPages.ts`
- **State**: `pages: WikiPage[]`, `page: number`, `totalCount: number`, `isLoading`, `error`.
- **Effect**: React to `q`, `owner`, and `repo` changes.
- **Cancelation**: Store an `AbortController` in a `useRef`. On `q` change or unmount, call `controller.abort()`. Reset `page` to `1` and clear the `pages` array.
- **Data Fetching**: When `page` changes, fetch `/api/repos/:owner/:repo/wiki?page=${page}&per_page=30&q=${q}`.
- **Response parsing**: Append items to the `pages` state. Read `X-Total-Count` header via `response.headers.get("X-Total-Count")`. Cap memory by slicing the array from the end if `pages.length > 500`.

### Step 3: Implement `useWikiPage`
**Path**: `apps/tui/src/hooks/useWikiPage.ts`
- **Cache**: Implement a module-level `const cache = new Map<string, { data: WikiPage; timestamp: number }>()`.
- **State**: `page: WikiPage | null`, `isLoading`, `error`.
- **Logic**: Construct a cache key `${owner}/${repo}/${slug}`. Check cache; if hit and `Date.now() - timestamp < 30000`, return cached data immediately and skip network. Otherwise, fetch `/api/repos/:owner/:repo/wiki/:slug`, update cache, and set state.

### Step 4: Implement `useWikiCreate` and `useWikiUpdate`
**Path**: `apps/tui/src/hooks/useWikiCreate.ts` & `apps/tui/src/hooks/useWikiUpdate.ts`
- Standard mutation hooks returning `isCreating`/`isUpdating`, `error`, and the mutation function.
- `useWikiCreate` payload: `{ title, content }`.
- `useWikiUpdate` payload: `{ title, content }`.
- Wrap the API call in a `try...catch`, handle `AbortController.signal` with a 30s timeout using `setTimeout`.

### Step 5: Implement `useWikiDelete`
**Path**: `apps/tui/src/hooks/useWikiDelete.ts`
- **Return signature**: `{ deletePage: (slug: string) => Promise<boolean>, isDeleting, error }`.
- **Logic**: Issue `DELETE`.
- **Error Handling**: Explicit check for status `403` (map to "Permission denied") and `404` (treat as success or swallow, since the goal is removal).
- **Optimistic Removal**: To support optimistic updates, the hook should accept an optional `onSuccess(slug)` callback, or the consumer will manually filter their local state.

## 5. Unit & Integration Tests

Create `e2e/tui/wiki-hooks.test.ts` (using Bun's test runner, testing hook behavior via a test component, or testing the logic directly if exported properly).

### Test Cases

**useWikiPages**
- **Pagination**: Verify that calling `fetchMore` increments the page number and appends new results to the state.
- **Total Count**: Verify `hasMore` is `true` when `pages.length < totalCount`, and `false` otherwise.
- **Search Reset**: Verify that modifying the `q` parameter resets the internal `page` back to `1`, aborts any in-flight fetch, and clears previous results.
- **Memory Cap**: Mock an API returning >500 items across multiple pages and verify the state array never exceeds 500 items.

**useWikiPage**
- **Caching**: Call the hook, wait 10 seconds, and verify a re-render or second call does *not* trigger a new network request. Wait 31 seconds and verify a network request *is* triggered.
- **Timeouts**: Verify the request aborts and returns an error state if the server does not respond within 30 seconds.

**useWikiDelete**
- **404 Handling**: Mock the API to return a 404 and verify the hook treats the operation gracefully (either swallowing the error or mapping it correctly so the UI can proceed with optimistic removal).
- **403 Handling**: Mock a 403 and verify the `error` state is populated with a permission denied message.

**useWikiCreate / useWikiUpdate**
- **Success Path**: Verify they correctly serialize payloads, execute the `POST`/`PUT`, and return the updated entity.
- **Validation Errors**: Verify that server 400 validation errors are surfaced correctly in the `error` state.