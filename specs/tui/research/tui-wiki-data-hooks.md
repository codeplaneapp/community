# Research Report: tui-wiki-data-hooks

## 1. Existing Data Hook Patterns & API Client Integration

### APIClientProvider
The TUI currently implements a local mock of the `@codeplane/ui-core` API client in `apps/tui/src/providers/APIClientProvider.tsx` (lines 15-34). 
- It exposes an `APIClient` interface containing `baseUrl` and `token`.
- The `useAPIClient()` hook is used to access these values.
- Current convention dictates that components/hooks call `useAPIClient()` and then construct standard `fetch` requests with `Authorization: Bearer ${client.token}`.

### `useRepoFetch` Precedent
In `apps/tui/src/hooks/useRepoFetch.ts` (lines 78-112), there is an existing implementation of authenticated data fetching using `useAPIClient()`. It shows the standard error-handling pattern (`FetchError`) and status code parsing that should be replicated or reused for the new wiki hooks. 

## 2. API Endpoint Verification

A review of `apps/server/src/routes/wiki.ts` reveals important details and **discrepancies** with the Engineering Specification:

1. **List Wiki Pages:** `GET /api/repos/:owner/:repo/wiki`
   - **Note on Pagination:** The server implementation at `routes/wiki.ts` line 50 returns an object containing `{ items, total }` from `service().listWikiPages(...)`. 
   - *Discrepancy:* The Engineering Spec requests parsing the `X-Total-Count` header. The hook implementation should be prepared to handle either the header or a JSON body containing `{ items, total }` depending on how the server route actually serializes the response.

2. **Create Wiki Page:** `POST /api/repos/:owner/:repo/wiki`
   - Exists and expects `CreateWikiPageRequest` payload (typically `{ title, content }`).

3. **Get Wiki Page:** `GET /api/repos/:owner/:repo/wiki/:slug`
   - Exists and returns the single page.

4. **Update Wiki Page:** `PATCH /api/repos/:owner/:repo/wiki/:slug`
   - *Discrepancy:* The Engineering Spec specifies a `PUT` request for `useWikiUpdate`, but the server strictly implements this as `PATCH` (line 107 of `routes/wiki.ts`). The hook **must** use `PATCH`.

5. **Delete Wiki Page:** `DELETE /api/repos/:owner/:repo/wiki/:slug`
   - Exists and successfully handles the deletion logic.

## 3. Hook Implementations & File Placements

Based on the spec, the following files should be created in `apps/tui/src/hooks/`:

*   `wiki-types.ts`: Define `WikiPage` matching the DTO.
*   `useWikiPages.ts`: 
    *   Manage `page`, `pages`, `isLoading`, `error`, `totalCount`.
    *   Implement 500-item memory cap: `setPages(prev => [...prev, ...newItems].slice(-500))`.
    *   Use `useRef` for `AbortController` to cancel in-flight requests on `q` changes.
*   `useWikiPage.ts`:
    *   Define module-level cache: `const cache = new Map<string, { data: WikiPage; timestamp: number }>();`
    *   Check cache using `owner/repo/slug` key. Evict/ignore if older than 30s.
*   `useWikiCreate.ts` & `useWikiUpdate.ts`:
    *   Standard mutation hooks. 
    *   Remember to use `PATCH` for `useWikiUpdate` instead of `PUT`.
    *   Implement 30s timeout on the `AbortController` signal.
*   `useWikiDelete.ts`:
    *   Catch `404` and treat as success.
    *   Catch `403` and set a readable "Permission denied" error.

## 4. Test Strategy
Tests should be placed in `e2e/tui/wiki-hooks.test.ts` (or `apps/tui/src/hooks/__tests__/wiki-hooks.test.ts` following existing patterns like `useSpinner.test.ts`). 
- Validate caching logic by overriding `Date.now()` or using mocked timers.
- Test the `AbortController` abort signal directly to ensure search updates cancel active fetches.
- Ensure `useWikiUpdate` sends the correct `PATCH` method.