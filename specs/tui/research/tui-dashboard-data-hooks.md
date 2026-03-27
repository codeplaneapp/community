# Research Findings: Dashboard Data Hooks

## 1. `@codeplane/ui-core` Structure & Pathing

I discovered that the `ui-core` package actually lives at `specs/tui/packages/ui-core/` rather than the `packages/ui-core/` directory root. Any new hooks and types should be placed in:
- `specs/tui/packages/ui-core/src/types/`
- `specs/tui/packages/ui-core/src/hooks/dashboard/`

The main barrel files for exports are located at `specs/tui/packages/ui-core/src/index.ts` and `specs/tui/packages/ui-core/src/types/index.ts`. 

## 2. Existing SDK Types

The types required by the Dashboard hooks (`UserProfile`, `RepoSummary`, `OrgSummary`, `ActivitySummary`) are already defined and exported from `@codeplane/sdk` inside `packages/sdk/src/services/user.ts`. These can be safely imported and re-exported in the new `ui-core` types file.

## 3. The `usePaginatedQuery` Internal Hook

The `usePaginatedQuery` hook is fully implemented at `specs/tui/packages/ui-core/src/hooks/internal/usePaginatedQuery.ts`. It accepts a `PaginatedQueryConfig<T>` object and handles all the heavy lifting:
- **Caching:** Requires a JSON stringified `cacheKey` to identify when to hard reset.
- **Response Parsing:** Relies on a `parseResponse` function to extract `items` and `totalCount` (often pulled from the `X-Total-Count` header).
- **Pagination & Limitations:** Automatically caps at `maxItems: 500`. Accepts manual `fetchMore` pagination when `autoPaginate: false` is used.

This exact pattern is already heavily utilized in `specs/tui/packages/ui-core/src/hooks/issues/useIssues.ts`, serving as an identical blueprint for `useRepos`, `useStarredRepos`, `useOrgs`, and `useActivity`.

## 4. `APIClientProvider` and Auth Integration

- The current TUI provider in `apps/tui/src/providers/APIClientProvider.tsx` is indeed a stub that mocks `APIClient` and `createAPIClient` locally.
- The real implementations live at `specs/tui/packages/ui-core/src/client/createAPIClient.ts` and `specs/tui/packages/ui-core/src/client/types.ts`.
- `apps/tui/src/hooks/useAuth.ts` is fully implemented and correctly exposes `auth.apiUrl` and `auth.token`. This means `APIClientProvider` can easily be refactored to consume `useAuth()` to instantiate the real `createAPIClient` from `ui-core`.
- `index.tsx` renders `<APIClientProvider>` with no props as a child of `<AuthProvider>`, perfectly matching the proposed refactoring plan where it derives auth values internally via context.