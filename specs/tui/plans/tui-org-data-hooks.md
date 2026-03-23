# Implementation Plan: TUI Organization Data Hooks (`tui-org-data-hooks`)

## 1. Create Organization Domain Types

**File:** `apps/tui/src/hooks/org-types.ts`

Define all domain models, request payloads, hook return types, filter interfaces, and pagination constants. This creates a solid type foundation aligned with the API contract.

**Implementation Details:**
- **Domain Models:** Export `Organization`, `OrgVisibility`, `OrgMember`, `OrgRole`, `Team`, `TeamPermission`, `TeamMember`, and `OrgRepository`.
- **Request DTOs:** Export `UpdateOrgRequest`, `AddOrgMemberRequest`, `CreateTeamRequest`, and `UpdateTeamRequest`.
- **Hook Types:** Export `HookError` (imported from `@codeplane/ui-core/src/types/errors.js`), `QueryResult<T>`, `PaginatedQueryResult<T>`, and `MutationResult<TInput, TOutput>`.
- **Filter Types:** Export `OrgListFilters`, `OrgMembersFilters`, `OrgTeamsFilters`, `OrgReposFilters`, `TeamMembersFilters`, and `TeamReposFilters`.
- **Constants:** Export limit constants (`MAX_ORGS = 500`, `MAX_ORG_MEMBERS = 500`, `MAX_ORG_TEAMS = 500`, etc.).

## 2. Implement Organization Data Hooks

**File:** `apps/tui/src/hooks/useOrgData.ts`

Implement the data access hooks by wrapping `@codeplane/ui-core` primitives (`usePaginatedQuery`, `useMutation`) and local generic hooks (`useQuery`). All local file and `ui-core` imports must use the `.js` extension for ESM compatibility.

**Internal Helpers:**
- `parseArrayResponse<T>`: A parsing function that takes `data` and `headers` to extract a bare JSON array and properly read the `X-Total-Count` header.
- `usePaginatedOrgQuery<T>`: A reusable factory function that wraps `usePaginatedQuery`, injecting `parseArrayResponse` and standardizing pagination config across org-related paginated queries.

**Query Hooks:**
- `useOrgs(filters?)`: Fetch user orgs using `usePaginatedOrgQuery` (cache key: `"user-orgs"`).
- `useOrg(orgName)`: Fetch a single org using `useQuery` (path: `/api/orgs/${orgName}`).
- `useOrgMembers(orgName, filters?)`: Fetch org members using `usePaginatedOrgQuery`.
- `useOrgTeams(orgName, filters?)`: Fetch org teams using `usePaginatedOrgQuery`.
- `useOrgRepos(orgName, filters?)`: Fetch org repos using `usePaginatedOrgQuery`.
- `useTeam(orgName, teamName)`: Fetch a specific team using `useQuery`.
- `useTeamMembers(orgName, teamName, filters?)`: Fetch team members using `usePaginatedOrgQuery`.
- `useTeamRepos(orgName, teamName, filters?)`: Fetch team repos using `usePaginatedOrgQuery`.

**Derived Hook (`useOrgRole`):**
- Implement `useOrgRole(orgName)` to determine the current user's role.
- **Critical Logic Fix:** Since `useAuth().user` is a simple string containing the username (as discovered during research), the member lookup should be updated to `members.data.find(m => m.username === user)`. It must return `{ role, isOwner, isMember, loading, error }`.

**Mutation Hooks:**
- Implement mutations using the `useMutation` core hook. All mutations must manually verify `!response.ok` and throw `parseResponseError(response)` to gracefully propagate hook errors.
- `useUpdateOrg(orgName)`: `PATCH /api/orgs/:org`
- `useDeleteOrg(orgName)`: `DELETE /api/orgs/:org`
- `useAddOrgMember(orgName)`: `POST /api/orgs/:org/members`
- `useRemoveOrgMember(orgName)`: `DELETE /api/orgs/:org/members/:username`
- `useCreateTeam(orgName)`: `POST /api/orgs/:org/teams`
- `useUpdateTeam(orgName, teamName)`: `PATCH /api/orgs/:org/teams/:team`
- `useDeleteTeam(orgName, teamName)`: `DELETE /api/orgs/:org/teams/:team`

## 3. Implement End-to-End Tests

**File:** `e2e/tui/organizations.test.ts`

Append exhaustive E2E test blocks to the existing organizations test file. Tests must use `@microsoft/tui-test` to simulate key presses and match terminal snapshots. Do not skip or comment out failing tests if the backend endpoint is not yet fully implemented.

**Test Suites to Append:**

1. **Data Loading (`TUI_ORG_DATA — org list loading`)**
   - Render org list, verify list items.
   - Ensure loading states are displayed during data fetch.
   - Validate error handling correctly surfaces messages on simulated API failures (e.g., 401 via invalid token).
   - Validate visibility badges rendering properly.

2. **Detail Rendering (`TUI_ORG_DATA — org detail loading`)**
   - Validate org metadata headers on the overview page.
   - Tab switching to Repositories, Members, and Teams should dynamically load corresponding data.

3. **Pagination (`TUI_ORG_DATA — pagination`)**
   - Scroll to the end of the lists using `G` keypress for orgs, members, teams, and repos.
   - Verify pagination triggers and loads subsequent pages.
   - Confirm tab labels reflect the header's `X-Total-Count`.

4. **Role Detection (`TUI_ORG_DATA — viewer role`)**
   - Ensure an owner viewer sees settings tabs and "add member" hints.
   - Ensure a non-owner does not see privileged tabs or commands.

5. **Mutation Operations (`TUI_ORG_DATA — mutations`)**
   - Submit changes in settings to test org update workflows.
   - Simulate member removal flows.
   - Create and delete teams.
   - Delete the org via the settings danger zone, verifying the confirmation flow.
   - Test error surfaces when a mutation fails.

6. **Refetching and Cache State (`TUI_ORG_DATA — refetch`)**
   - Assert that pressing `r` manually refetches tab data.
   - Ensure navigation between different orgs resets caching context properly (e.g., Org A's repos do not bleed into Org B).

7. **Team Detail Screens (`TUI_ORG_DATA — team detail`)**
   - Validate the team detail view properly renders its sub-tabs for members and repositories.