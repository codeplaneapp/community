# Engineering Specification: tui-dashboard-data-hooks

## Title
Create or wire @codeplane/ui-core data hooks consumed by the Dashboard

## Type
engineering

## Description
Ensure the following data hooks are available for TUI consumption from `@codeplane/ui-core` (or create TUI-side wrappers if ui-core is not yet available):

- `useRepos(filters?)` → `{ items: RepoSummary[], totalCount, loading, error, loadMore, hasMore, retry }`
  - Calls `GET /api/user/repos?page=N&per_page=20`, sorted by `updated_at` desc
- `useStarredRepos(filters?)` → `{ items: RepoSummary[], totalCount, loading, error, loadMore, hasMore, retry }`
  - Calls `GET /api/user/starred?page=N&per_page=20`, sorted by `stars.created_at` desc
- `useOrgs(filters?)` → `{ items: OrgSummary[], totalCount, loading, error, loadMore, hasMore, retry }`
  - Calls `GET /api/user/orgs?page=N&per_page=20`, sorted by `id` asc
- `useActivity(username, { page, perPage, type? })` → `{ items: ActivitySummary[], totalCount, loading, error, loadMore, hasMore, retry, setFilter }`
  - Calls `GET /api/users/:username/activity?page=N&per_page=30&type=<filter>`, sorted by `created_at` desc
- `useUser()` → `{ user: UserProfile, loading, error }`
  - Already expected from AuthProvider; ensure it provides the `username` field for the activity feed endpoint.

All hooks must support cursor-based or page-based pagination, return loading/error/retry, and integrate with the `APIClientProvider` for auth headers. Include the TypeScript interfaces: `RepoSummary`, `OrgSummary`, `ActivitySummary`, `UserProfile`.

## Dependencies
- tui-navigation-provider
- tui-auth-token-loading

## Architecture Alignment
These hooks fit directly into the **Data Layer Integration** of the TUI architecture. They sit between the React component tree and the Codeplane API Server, providing framework-agnostic data access. The hooks must utilize the shared `createAPIClient` configuration (or `useAPIClient` context) to ensure all outbound requests automatically include the resolved CLI authentication token and appropriate base URL. The pagination pattern (returning `items`, `loadMore`, `hasMore`, `loading`) aligns with the expectations of the `<ScrollableList>` component which will handle the intersection observer/scroll-to-end detection.

## Implementation Plan

1. **Define Domain Types**:
   - Locate or create the domain types in `@codeplane/sdk` (or `packages/ui-core/src/types` / `apps/tui/src/types` if SDK is unavailable).
   - Export interfaces: `RepoSummary`, `OrgSummary`, `ActivitySummary`, and `UserProfile`.
   - Ensure `UserProfile` explicitly includes `username: string`.

2. **Implement API Client Integration**:
   - Ensure a hook like `useAPIClient()` exists to access the pre-configured fetcher from the `APIClientProvider`.

3. **Implement Pagination Utility / Pattern**:
   - Create a reusable internal hook or pattern for page-based pagination to avoid duplicating state logic across the four list hooks. It should manage `items` (accumulated), `page`, `loading`, `error`, `hasMore`, and provide `loadMore()` and `retry()` methods.

4. **Implement Data Hooks** (in `@codeplane/ui-core/src/hooks` or `apps/tui/src/hooks/data`):
   - **`useRepos(filters?)`**: Build the URL with query parameters (`page`, `per_page=20`). Fetch from `/api/user/repos`.
   - **`useStarredRepos(filters?)`**: Fetch from `/api/user/starred` with `page` and `per_page=20`.
   - **`useOrgs(filters?)`**: Fetch from `/api/user/orgs` with `page` and `per_page=20`.
   - **`useActivity(username, options)`**: Conditionally fetch from `/api/users/${username}/activity`. Append `type` if provided in `options`. Provide a `setFilter` function in the return object that resets pagination and refetches.

5. **Enhance `useUser()`**:
   - Verify that `useUser()` exports the `UserProfile` data correctly from the `AuthProvider` context and confirm the `username` property is exposed for downstream consumption by `useActivity()`.

## Unit & Integration Tests

1. **Test Setup**:
   - Use `bun:test` and a mock API client (or mock fetch/MSW) to intercept HTTP requests.
   - Create a custom render hook wrapper that injects the `APIClientProvider` and `AuthProvider`.

2. **Hook Fetch & State Tests**:
   - For each hook (`useRepos`, `useStarredRepos`, `useOrgs`, `useActivity`), verify that the initial state is `loading: true` and `items: []`.
   - Verify that upon successful resolution, `items` are populated, `loading: false`, and `error` is null.

3. **Pagination Tests**:
   - Simulate a `loadMore()` call.
   - Assert that the API client is called with `page=2`.
   - Assert that the new items are appended to the existing `items` array, not replaced.
   - Verify that `hasMore` becomes `false` when the returned items length is less than `per_page`.

4. **Error & Retry Tests**:
   - Force a mock network error.
   - Verify `error` state is populated and `loading: false`.
   - Call `retry()` and verify the API request is dispatched again and state recovers upon success.

5. **Filter Tests (`useActivity`)**:
   - Call `setFilter('push')` on the activity hook.
   - Assert that the `items` array is cleared, `page` resets to 1, and the correct API URL with `?type=push` is requested.