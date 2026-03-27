# Implementation Plan: tui-wiki-data-hooks

## 1. Overview
This plan details the implementation of five React data hooks (`useWikiPages`, `useWikiPage`, `useWikiCreate`, `useWikiUpdate`, `useWikiDelete`) for the Codeplane TUI to interact with the Wiki API. These hooks will utilize the TUI's existing `useAPIClient` and handle caching, pagination, memory limits, and request cancellation.

## 2. Shared Types

**File**: `apps/tui/src/hooks/wiki-types.ts`

Create a shared types file for Wiki data transfer objects.

```typescript
export interface WikiPage {
  slug: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: {
    username: string;
  };
}

export interface WikiPagesResponse {
  items: WikiPage[];
  total: number;
}
```

## 3. Hook Implementations

### Step 3.1: `useWikiPages`
**File**: `apps/tui/src/hooks/useWikiPages.ts`

- **State**: `pages` (array of `WikiPage`), `page` (number), `totalCount` (number), `isLoading` (boolean), `error` (Error | null), `hasMore` (boolean).
- **Dependencies**: `useAPIClient`.
- **Logic**:
  - Maintain an `AbortController` in a `useRef` to cancel in-flight requests when `q` (search query) changes or the component unmounts.
  - When `q` changes: abort current request, reset `page` to 1, and clear the `pages` array.
  - When `page` changes, fetch `/api/repos/:owner/:repo/wiki?page=${page}&per_page=30&q=${q}`.
  - Parse the response. Check for JSON `{ items, total }` or fallback to the `X-Total-Count` header if the server uses header-based pagination.
  - Append new items to `pages`. Enforce a 500-item memory cap: `setPages(prev => [...prev, ...newItems].slice(-500))`.
  - Calculate `hasMore` by comparing `pages.length` against `totalCount`.

### Step 3.2: `useWikiPage`
**File**: `apps/tui/src/hooks/useWikiPage.ts`

- **Cache**: Implement a module-level cache: `const cache = new Map<string, { data: WikiPage; timestamp: number }>();`
- **State**: `page` (WikiPage | null), `isLoading` (boolean), `error` (Error | null).
- **Dependencies**: `useAPIClient`.
- **Logic**:
  - Construct cache key: `${owner}/${repo}/${slug}`.
  - On mount or argument change, check the cache. If a hit exists and `Date.now() - timestamp < 30000` (30 seconds), set `page` state immediately and skip the network request.
  - Otherwise, fetch `/api/repos/:owner/:repo/wiki/:slug`, update the cache, and set the state.
  - Implement a 30-second timeout on the `AbortController` signal for the fetch request.

### Step 3.3: `useWikiDelete`
**File**: `apps/tui/src/hooks/useWikiDelete.ts`

- **Return Signature**: `{ deletePage: (slug: string) => Promise<boolean>, isDeleting, error }`
- **Dependencies**: `useAPIClient`.
- **Logic**:
  - Issue `DELETE /api/repos/:owner/:repo/wiki/:slug`.
  - **Error Handling**: 
    - If status `404`, catch and treat as success (already deleted).
    - If status `403`, catch and throw/set a readable "Permission denied" error.
  - Return `true` on success to allow consumers to perform optimistic UI updates.

### Step 3.4: `useWikiCreate`
**File**: `apps/tui/src/hooks/useWikiCreate.ts`

- **Return Signature**: `{ createPage: (payload: { title: string, content: string }) => Promise<WikiPage>, isCreating, error }`
- **Dependencies**: `useAPIClient`.
- **Logic**:
  - Issue `POST /api/repos/:owner/:repo/wiki` with the payload.
  - Implement a 30-second timeout using an `AbortController`.
  - Handle standard API errors (401, 429, 5xx) and validation errors (400).

### Step 3.5: `useWikiUpdate`
**File**: `apps/tui/src/hooks/useWikiUpdate.ts`

- **Return Signature**: `{ updatePage: (slug: string, payload: { title: string, content: string }) => Promise<WikiPage>, isUpdating, error }`
- **Dependencies**: `useAPIClient`.
- **Logic**:
  - Issue `PATCH /api/repos/:owner/:repo/wiki/:slug` with the payload. *(Note: Must use PATCH, not PUT, per server implementation).* 
  - Implement a 30-second timeout using an `AbortController`.
  - Handle standard API errors.

## 4. Testing

**File**: `apps/tui/src/hooks/__tests__/wiki-hooks.test.ts`

Implement tests using the existing TUI testing patterns.

### Test Cases:

1. **`useWikiPages`**
   - **Pagination**: Verify that calling `fetchMore` increments the page number and appends new results to the state.
   - **Search Reset**: Verify that modifying the `q` parameter resets the internal `page` to `1`, aborts any in-flight fetch, and clears previous results.
   - **Memory Cap**: Mock an API returning a large number of items across multiple pages and verify the state array never exceeds 500 items.

2. **`useWikiPage`**
   - **Caching**: Call the hook, wait 10 seconds, and verify a re-render does not trigger a network request. Wait 31 seconds (using mocked timers or `Date.now` overrides) and verify a network request *is* triggered.
   - **Timeouts**: Verify the request aborts and returns an error state if the server response exceeds 30 seconds.

3. **`useWikiDelete`**
   - **404 Handling**: Mock the API to return a 404 and verify the hook treats the operation as successful.
   - **403 Handling**: Mock a 403 and verify the `error` state is populated with a "Permission denied" message.

4. **`useWikiCreate` & `useWikiUpdate`**
   - **Success Path**: Verify correct payload serialization and method usage (`POST` for create, `PATCH` for update).
   - **Validation Errors**: Verify that server 400 errors are surfaced correctly in the `error` state.