# Implementation Plan: `tui-dashboard-data-hooks`

## 1. Overview
This plan outlines the steps to create and wire the `@codeplane/ui-core` data hooks required for the TUI Dashboard screen, and to upgrade the TUI's `APIClientProvider` to use the real API client implementation from the core library.

## 2. File Updates and Additions

### 2.1 Type Definitions
**Create File:** `specs/tui/packages/ui-core/src/types/dashboard.ts`
- Re-export `UserProfile`, `RepoSummary`, `OrgSummary`, and `ActivitySummary` from `@codeplane/sdk`.
- Define options interfaces for the new paginated hooks: `ReposOptions`, `StarredReposOptions`, `OrgsOptions`, `ActivityOptions`.

**Modify File:** `specs/tui/packages/ui-core/src/types/index.ts`
- Export the newly created dashboard types to expose them from the `ui-core` types barrel.

### 2.2 Hook Implementations
**Create File:** `specs/tui/packages/ui-core/src/hooks/dashboard/useUser.ts`
- Implement the `useUser()` hook using the `useAPIClient` and standard React `useState`/`useEffect` hooks.
- Ensure it follows the fetch-on-mount pattern for `/api/user`, robustly handling AbortController logic for unmounts and providing `refetch` capabilities.

**Create File:** `specs/tui/packages/ui-core/src/hooks/dashboard/useRepos.ts`
- Implement the `useRepos(options)` hook by wrapping the internal `usePaginatedQuery` hook.
- Target endpoint: `/api/user/repos` and correctly parse the `X-Total-Count` header.

**Create File:** `specs/tui/packages/ui-core/src/hooks/dashboard/useStarredRepos.ts`
- Implement the `useStarredRepos(options)` hook leveraging `usePaginatedQuery`.
- Target endpoint: `/api/user/starred`.

**Create File:** `specs/tui/packages/ui-core/src/hooks/dashboard/useOrgs.ts`
- Implement the `useOrgs(options)` hook via `usePaginatedQuery`.
- Target endpoint: `/api/user/orgs`.

**Create File:** `specs/tui/packages/ui-core/src/hooks/dashboard/useActivity.ts`
- Implement `useActivity(username, options)` using `usePaginatedQuery`.
- Target endpoint: `/api/users/:username/activity`, safely url-encoding parameters and supporting an optional `type` filter. 
- Note: Gracefully handles 501 responses out-of-the-box via the underlying query hook.

**Create File:** `specs/tui/packages/ui-core/src/hooks/dashboard/index.ts`
- Create a barrel export file for all newly added dashboard hooks.

**Modify File:** `specs/tui/packages/ui-core/src/index.ts`
- Export the dashboard hooks barrel and the new dashboard types from the main `ui-core` package entrypoint.

### 2.3 Provider Upgrade
**Modify File:** `apps/tui/src/providers/APIClientProvider.tsx`
- Remove the existing stub/mock implementation for `APIClient` and `createAPIClient`.
- Import `createAPIClient` and `APIClient` from `@codeplane/ui-core`.
- Use the `useAuth()` hook to fetch the `token` and `apiUrl`. Memoize the instantiation of the real API client, returning `null` if the token is unavailable (letting `AuthProvider` handle the broader unauthenticated state).

### 2.4 E2E Testing
**Create File:** `e2e/tui/dashboard.test.ts`
- Implement end-to-end tests using the `@microsoft/tui-test` framework to validate the exact data hook wiring and API client integrations.
- Write test cases for `useUser`, `useRepos`, `useStarredRepos`, `useOrgs`, and `useActivity` to assert they resolve correctly and feed into the TUI's state.
- Ensure test coverage for error recovery, missing network connectivity scenarios, and list pagination.
- Include explicit assertion for `DASH-DATA-007` to verify the 501 response on the unimplemented activity feed does not hard-crash the TUI.

## 3. Step-by-Step Execution

1. **Generate Types:** Create `dashboard.ts` in `ui-core/src/types` and append re-exports to `types/index.ts`.
2. **Generate Single Resource Hooks:** Write `useUser.ts` in `ui-core/src/hooks/dashboard/` ensuring error parsing and cancellation work optimally.
3. **Generate Paginated Hooks:** Write `useRepos.ts`, `useStarredRepos.ts`, `useOrgs.ts`, and `useActivity.ts` inside `ui-core/src/hooks/dashboard/` wiring them cleanly to `usePaginatedQuery`.
4. **Update Barrels:** Stand up the local `index.ts` export for the dashboard hooks and finalize the root `index.ts` in `ui-core`.
5. **Upgrade APIClientProvider:** Refactor `apps/tui/src/providers/APIClientProvider.tsx` to instantiate the genuine client leveraging contextual auth data.
6. **Write Tests:** Create the `e2e/tui/dashboard.test.ts` suite capturing the snapshot and behavioral expectations described in the PRD.
7. **Validate Checkpoints:** Run `bun typecheck` locally to confirm rigid typings and execute `bun test e2e/tui/dashboard.test.ts` to confirm functionality.