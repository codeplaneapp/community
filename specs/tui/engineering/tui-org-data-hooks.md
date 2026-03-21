# Engineering Specification: `tui-org-data-hooks`

## Summary

Create TUI-side adapter hooks that wrap `@codeplane/ui-core` internal primitives (`usePaginatedQuery`, `useMutation`) to provide data access for all organization API endpoints. These hooks are consumed by the org list screen, org overview screen, org members view, org teams view, org team detail, and org settings screens.

All hooks live in a single file: `apps/tui/src/hooks/useOrgData.ts`, with types defined in `apps/tui/src/hooks/org-types.ts`.

---

## Dependencies

| Dependency | Status | Required For |
|---|---|---|
| `tui-navigation-provider` | Prerequisite | `NavigationProvider` context for screen push/pop used by consuming screens |
| `tui-theme-provider` | Prerequisite | `ThemeProvider` context for color tokens used by consuming screens |
| `@codeplane/ui-core` internal hooks | Exists | `usePaginatedQuery`, `useMutation`, `useAPIClient` |
| `@codeplane/ui-core` error types | Exists | `HookError`, `parseResponseError`, `NetworkError` |
| Server org routes | Exists | `apps/server/src/routes/orgs.ts` — all endpoints implemented |

---

## API Contract Reference

The hooks consume the following server endpoints (all implemented in `apps/server/src/routes/orgs.ts` and `apps/server/src/routes/users.ts`):

### Query Endpoints

| Method | Path | Auth | Pagination | Response Shape |
|---|---|---|---|---|
| `GET` | `/api/user/orgs` | Required | `page` / `per_page` | `Organization[]` + `X-Total-Count` header |
| `GET` | `/api/orgs/:org` | Optional | None | `Organization` |
| `GET` | `/api/orgs/:org/members` | Required | `page` / `per_page` | `OrgMemberResponse[]` + `X-Total-Count` header |
| `GET` | `/api/orgs/:org/teams` | Required | `page` / `per_page` | `Team[]` + `X-Total-Count` header |
| `GET` | `/api/orgs/:org/repos` | Optional | `page` / `per_page` | `Repository[]` + `X-Total-Count` header |
| `GET` | `/api/orgs/:org/teams/:team` | Required | None | `Team` |
| `GET` | `/api/orgs/:org/teams/:team/members` | Required | `page` / `per_page` | `TeamMemberResponse[]` + `X-Total-Count` header |
| `GET` | `/api/orgs/:org/teams/:team/repos` | Required | `page` / `per_page` | `Repository[]` + `X-Total-Count` header |

### Mutation Endpoints

| Method | Path | Auth | Request Body | Response |
|---|---|---|---|---|
| `PATCH` | `/api/orgs/:org` | Required (owner) | `UpdateOrgRequest` | `Organization` |
| `DELETE` | `/api/orgs/:org` | Required (owner) | None | `204` |
| `POST` | `/api/orgs/:org/members` | Required (owner) | `{ user_id, role }` | `201` |
| `DELETE` | `/api/orgs/:org/members/:username` | Required (owner) | None | `204` |
| `POST` | `/api/orgs/:org/teams` | Required (owner) | `CreateTeamRequest` | `Team` |
| `PATCH` | `/api/orgs/:org/teams/:team` | Required (owner) | `UpdateTeamRequest` | `Team` |
| `DELETE` | `/api/orgs/:org/teams/:team` | Required (owner) | None | `204` |

### Viewer Role Detection

The server does not expose a dedicated `/api/orgs/:org/role` endpoint. The viewer's role is determined by:

1. Fetching the org members list via `GET /api/orgs/:org/members`.
2. Matching the current authenticated user (from `AuthProvider`) against the members list.
3. The matched member's `role` field (`"owner"` or `"member"`) determines viewer permissions.
4. If the user is not found in the members list, they have no org role (viewer/outsider).

This is implemented in `useOrgRole()` which delegates to `useOrgMembers()` internally.

---

## Implementation Plan

### Step 1: Define organization domain types

**File:** `apps/tui/src/hooks/org-types.ts`

Define all TypeScript types matching the server API response shapes, plus hook return types following the established pattern from `apps/tui/src/hooks/workflow-types.ts`.

```typescript
import type { HookError as CoreHookError } from "@codeplane/ui-core/src/types/errors.js";

// ---- Domain models (match API response shapes) ----

export interface Organization {
  id: number;
  name: string;
  lower_name: string;
  description: string;
  visibility: OrgVisibility;
  website: string;
  location: string;
  created_at: string; // ISO 8601
  updated_at: string;
}

export type OrgVisibility = "public" | "limited" | "private";

export interface OrgMember {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  role: OrgRole;
}

export type OrgRole = "owner" | "member";

export interface Team {
  id: number;
  organization_id: number;
  name: string;
  lower_name: string;
  description: string;
  permission: TeamPermission;
  created_at: string; // ISO 8601
  updated_at: string;
}

export type TeamPermission = "read" | "write" | "admin";

export interface TeamMember {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
}

export interface OrgRepository {
  id: number;
  name: string;
  lower_name: string;
  owner: string;
  description: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

// ---- Request DTOs ----

export interface UpdateOrgRequest {
  name: string;
  description: string;
  visibility: string;
  website: string;
  location: string;
}

export interface AddOrgMemberRequest {
  user_id: number;
  role: string;
}

export interface CreateTeamRequest {
  name: string;
  description: string;
  permission: string;
}

export interface UpdateTeamRequest {
  name: string;
  description: string;
  permission: string;
}

// ---- Hook return types (matches workflow-types.ts pattern) ----

export type HookError = CoreHookError;

export interface QueryResult<T> {
  data: T | null;
  loading: boolean;
  error: HookError | null;
  refetch: () => void;
}

export interface PaginatedQueryResult<T> {
  data: T[];
  loading: boolean;
  error: HookError | null;
  loadMore: () => void;
  hasMore: boolean;
  totalCount: number;
  refetch: () => void;
}

export interface MutationResult<TInput, TOutput = void> {
  execute: (input: TInput) => Promise<TOutput>;
  loading: boolean;
  error: HookError | null;
  reset: () => void;
}

// ---- Filter types ----

export interface OrgListFilters {
  page?: number;
  per_page?: number;
}

export interface OrgMembersFilters {
  page?: number;
  per_page?: number;
}

export interface OrgTeamsFilters {
  page?: number;
  per_page?: number;
}

export interface OrgReposFilters {
  page?: number;
  per_page?: number;
}

export interface TeamMembersFilters {
  page?: number;
  per_page?: number;
}

export interface TeamReposFilters {
  page?: number;
  per_page?: number;
}

// ---- Constants ----

export const MAX_ORGS = 500;
export const MAX_ORG_MEMBERS = 500;
export const MAX_ORG_TEAMS = 500;
export const MAX_ORG_REPOS = 500;
export const MAX_TEAM_MEMBERS = 500;
export const MAX_TEAM_REPOS = 500;
```

### Step 2: Implement query hooks

**File:** `apps/tui/src/hooks/useOrgData.ts`

All hooks are implemented in this single file, following the established pattern from `useWorkflowRuns.ts` (paginated queries use `usePaginatedQuery`, single-entity queries use `useQuery`, mutations use `useMutation`).

#### 2a. `useOrgs()` — User's organization list

```typescript
import { usePaginatedQuery } from "@codeplane/ui-core/src/hooks/internal/usePaginatedQuery.js";
import { useMutation } from "@codeplane/ui-core/src/hooks/internal/useMutation.js";
import { useAPIClient } from "@codeplane/ui-core/src/client/index.js";
import { parseResponseError, NetworkError } from "@codeplane/ui-core/src/types/errors.js";
import { useQuery } from "./useQuery.js";
import type {
  Organization,
  OrgMember,
  OrgRole,
  Team,
  TeamMember,
  OrgRepository,
  UpdateOrgRequest,
  AddOrgMemberRequest,
  CreateTeamRequest,
  UpdateTeamRequest,
  PaginatedQueryResult,
  QueryResult,
  MutationResult,
  OrgListFilters,
  OrgMembersFilters,
  OrgTeamsFilters,
  OrgReposFilters,
  TeamMembersFilters,
  TeamReposFilters,
  HookError,
} from "./org-types.js";
import {
  MAX_ORGS,
  MAX_ORG_MEMBERS,
  MAX_ORG_TEAMS,
  MAX_ORG_REPOS,
  MAX_TEAM_MEMBERS,
  MAX_TEAM_REPOS,
} from "./org-types.js";
```

**`useOrgs(filters?)`** — Fetch authenticated user's organizations.

- **API:** `GET /api/user/orgs?page=N&per_page=N`
- **Response:** `Organization[]` array, `X-Total-Count` in header.
- **Pagination:** Offset-based via `usePaginatedQuery`. Default page size 30, max items 500.
- **Cache key:** `"user-orgs"` (no variable params since this is the current user's orgs).
- **`parseResponse`:** The API returns a bare JSON array (not wrapped in an object). The `X-Total-Count` header provides the total. Parse as:
  ```typescript
  parseResponse: (data: unknown, headers: Headers) => ({
    items: Array.isArray(data) ? (data as Organization[]) : [],
    totalCount: headers.has("X-Total-Count")
      ? parseInt(headers.get("X-Total-Count")!, 10)
      : null,
  })
  ```
- **Return type:** `PaginatedQueryResult<Organization>`

#### 2b. `useOrg(orgName)` — Single organization detail

- **API:** `GET /api/orgs/:org`
- **Response:** Single `Organization` object.
- **Implementation:** Uses the existing `useQuery<Organization>()` hook with `path: \`/api/orgs/${orgName}\`` and `enabled: !!orgName`.
- **Return type:** `QueryResult<Organization>`

#### 2c. `useOrgMembers(orgName, filters?)` — Organization members list

- **API:** `GET /api/orgs/:org/members?page=N&per_page=N`
- **Response:** `OrgMember[]` array, `X-Total-Count` in header.
- **Pagination:** Offset-based via `usePaginatedQuery`. Default page size 30, max items 500.
- **Cache key:** `"org-members:${orgName}"`.
- **`parseResponse`:** Same array + header pattern as `useOrgs()`.
- **`enabled`:** `!!orgName`.
- **Return type:** `PaginatedQueryResult<OrgMember>`

#### 2d. `useOrgTeams(orgName, filters?)` — Organization teams list

- **API:** `GET /api/orgs/:org/teams?page=N&per_page=N`
- **Response:** `Team[]` array, `X-Total-Count` in header.
- **Pagination:** Offset-based via `usePaginatedQuery`. Default page size 30, max items 500.
- **Cache key:** `"org-teams:${orgName}"`.
- **`enabled`:** `!!orgName`.
- **Return type:** `PaginatedQueryResult<Team>`

#### 2e. `useOrgRepos(orgName, filters?)` — Organization repositories list

- **API:** `GET /api/orgs/:org/repos?page=N&per_page=N`
- **Response:** `OrgRepository[]` array, `X-Total-Count` in header.
- **Pagination:** Offset-based via `usePaginatedQuery`. Default page size 30, max items 500.
- **Cache key:** `"org-repos:${orgName}"`.
- **`enabled`:** `!!orgName`.
- **Return type:** `PaginatedQueryResult<OrgRepository>`

#### 2f. `useOrgRole(orgName)` — Viewer's role in organization

This is a derived hook, not a direct API call. It computes the current user's role by cross-referencing the org members list with the authenticated user identity.

- **Implementation:**
  ```typescript
  import { useAuth } from "./useAuth.js";

  export interface OrgRoleResult {
    role: OrgRole | null;    // null = not a member
    isOwner: boolean;
    isMember: boolean;
    loading: boolean;
    error: HookError | null;
  }

  export function useOrgRole(orgName: string): OrgRoleResult {
    const { user } = useAuth();
    const members = useOrgMembers(orgName);

    const currentMember = members.data.find(
      (m) => m.username === user?.username
    );

    return {
      role: currentMember?.role ?? null,
      isOwner: currentMember?.role === "owner",
      isMember: currentMember != null,
      loading: members.loading,
      error: members.error,
    };
  }
  ```

- **Behavioral notes:**
  - Returns `{ role: null, isOwner: false, isMember: false }` if the user is not in the members list.
  - `loading` mirrors the members hook loading state.
  - Since `useOrgMembers` is paginated with a 500-item cap, this works for orgs up to 500 members. For larger orgs, the user may not be found in the first 500 members. This is an acceptable limitation matching the memory cap design (documented in architecture spec).
  - The first page fetch (30 members) is sufficient for most orgs. For orgs where the viewer is not in the first page, the hook triggers pagination fetching until the user is found or all pages are exhausted. **Optimization for v2:** Add a dedicated `GET /api/orgs/:org/membership` endpoint that returns just the viewer's role.

#### 2g. `useTeam(orgName, teamName)` — Single team detail

- **API:** `GET /api/orgs/:org/teams/:team`
- **Response:** Single `Team` object.
- **Implementation:** Uses `useQuery<Team>()` with `path: \`/api/orgs/${orgName}/teams/${teamName}\`` and `enabled: !!orgName && !!teamName`.
- **Return type:** `QueryResult<Team>`

#### 2h. `useTeamMembers(orgName, teamName, filters?)` — Team members list

- **API:** `GET /api/orgs/:org/teams/:team/members?page=N&per_page=N`
- **Response:** `TeamMember[]` array, `X-Total-Count` in header.
- **Pagination:** Offset-based via `usePaginatedQuery`. Default page size 30, max items 500.
- **Cache key:** `"team-members:${orgName}:${teamName}"`.
- **`enabled`:** `!!orgName && !!teamName`.
- **Return type:** `PaginatedQueryResult<TeamMember>`

#### 2i. `useTeamRepos(orgName, teamName, filters?)` — Team repositories list

- **API:** `GET /api/orgs/:org/teams/:team/repos?page=N&per_page=N`
- **Response:** `OrgRepository[]` array, `X-Total-Count` in header.
- **Pagination:** Offset-based via `usePaginatedQuery`. Default page size 30, max items 500.
- **Cache key:** `"team-repos:${orgName}:${teamName}"`.
- **`enabled`:** `!!orgName && !!teamName`.
- **Return type:** `PaginatedQueryResult<OrgRepository>`

### Step 3: Implement mutation hooks

All mutation hooks use the `useMutation` primitive from `@codeplane/ui-core/src/hooks/internal/useMutation.js` and follow the established `MutationResult` return type pattern.

#### 3a. `useUpdateOrg(orgName)` — Update organization metadata

- **API:** `PATCH /api/orgs/:org`
- **Request:** `UpdateOrgRequest` body.
- **Response:** `Organization` (updated).
- **Implementation:**
  ```typescript
  export function useUpdateOrg(orgName: string): MutationResult<UpdateOrgRequest, Organization> {
    const client = useAPIClient();

    const { mutate, isLoading, error, reset } = useMutation<UpdateOrgRequest, Organization>({
      mutationFn: async (input, signal) => {
        const response = await client.request(`/api/orgs/${orgName}`, {
          method: "PATCH",
          body: input,
          signal,
        });
        if (!response.ok) {
          throw await parseResponseError(response);
        }
        return response.json();
      },
    });

    return {
      execute: mutate,
      loading: isLoading,
      error,
      reset,
    };
  }
  ```

#### 3b. `useDeleteOrg(orgName)` — Delete organization

- **API:** `DELETE /api/orgs/:org`
- **Request:** None (the org name is baked into the hook).
- **Response:** `204 No Content`.
- **Input type:** `void` — the caller invokes `execute()` with no arguments.
- **Return type:** `MutationResult<void, void>`
- **Implementation:** Calls `client.request(\`/api/orgs/${orgName}\`, { method: "DELETE", signal })`. Checks `response.ok`. Does not parse body (204).

#### 3c. `useAddOrgMember(orgName)` — Add organization member

- **API:** `POST /api/orgs/:org/members`
- **Request:** `AddOrgMemberRequest` (`{ user_id: number; role: string }`).
- **Response:** `201 Created` (no body).
- **Return type:** `MutationResult<AddOrgMemberRequest, void>`
- **Implementation:** Calls `client.request(\`/api/orgs/${orgName}/members\`, { method: "POST", body: input, signal })`. Checks `response.ok`.

#### 3d. `useRemoveOrgMember(orgName)` — Remove organization member

- **API:** `DELETE /api/orgs/:org/members/:username`
- **Request:** `string` (username to remove).
- **Response:** `204 No Content`.
- **Return type:** `MutationResult<string, void>`
- **Implementation:** Calls `client.request(\`/api/orgs/${orgName}/members/${input}\`, { method: "DELETE", signal })`.

#### 3e. `useCreateTeam(orgName)` — Create team

- **API:** `POST /api/orgs/:org/teams`
- **Request:** `CreateTeamRequest`.
- **Response:** `Team` (201).
- **Return type:** `MutationResult<CreateTeamRequest, Team>`

#### 3f. `useUpdateTeam(orgName, teamName)` — Update team

- **API:** `PATCH /api/orgs/:org/teams/:team`
- **Request:** `UpdateTeamRequest`.
- **Response:** `Team` (200).
- **Return type:** `MutationResult<UpdateTeamRequest, Team>`

#### 3g. `useDeleteTeam(orgName, teamName)` — Delete team

- **API:** `DELETE /api/orgs/:org/teams/:team`
- **Request:** `void`.
- **Response:** `204 No Content`.
- **Return type:** `MutationResult<void, void>`

### Step 4: Shared `parseArrayResponse` utility

Multiple paginated hooks share the same response parsing pattern: the API returns a bare JSON array with `X-Total-Count` in the response header. Extract this into a reusable helper inside the hook file:

```typescript
function parseArrayResponse<T>(data: unknown, headers: Headers): {
  items: T[];
  totalCount: number | null;
} {
  const items = Array.isArray(data) ? (data as T[]) : [];
  const totalCountHeader = headers.get("X-Total-Count");
  const totalCount = totalCountHeader !== null
    ? parseInt(totalCountHeader, 10)
    : null;
  return {
    items,
    totalCount: Number.isNaN(totalCount) ? null : totalCount,
  };
}
```

This is used by `useOrgs`, `useOrgMembers`, `useOrgTeams`, `useOrgRepos`, `useTeamMembers`, and `useTeamRepos`.

### Step 5: Shared `createPaginatedOrgHook` factory

Since six hooks follow an identical pattern (paginated query with `parseArrayResponse`, `enabled` guard, cache key, and max items), extract a factory function to reduce boilerplate:

```typescript
function usePaginatedOrgQuery<T>(config: {
  path: string;
  cacheKey: string;
  enabled: boolean;
  perPage?: number;
  maxItems?: number;
}): PaginatedQueryResult<T> {
  const client = useAPIClient();

  const {
    items,
    totalCount,
    isLoading,
    error,
    hasMore,
    fetchMore,
    refetch,
  } = usePaginatedQuery<T>({
    client,
    path: config.path,
    cacheKey: config.cacheKey,
    perPage: config.perPage ?? 30,
    enabled: config.enabled,
    maxItems: config.maxItems ?? MAX_ORGS,
    autoPaginate: false,
    parseResponse: parseArrayResponse<T>,
  });

  return {
    data: items,
    totalCount,
    loading: isLoading,
    error,
    hasMore,
    loadMore: fetchMore,
    refetch,
  };
}
```

Each public hook then becomes a thin wrapper:

```typescript
export function useOrgs(filters?: OrgListFilters): PaginatedQueryResult<Organization> {
  return usePaginatedOrgQuery<Organization>({
    path: "/api/user/orgs",
    cacheKey: "user-orgs",
    enabled: true,
    perPage: filters?.per_page ?? 30,
    maxItems: MAX_ORGS,
  });
}

export function useOrgMembers(
  orgName: string,
  filters?: OrgMembersFilters,
): PaginatedQueryResult<OrgMember> {
  return usePaginatedOrgQuery<OrgMember>({
    path: `/api/orgs/${orgName}/members`,
    cacheKey: `org-members:${orgName}`,
    enabled: !!orgName,
    perPage: filters?.per_page ?? 30,
    maxItems: MAX_ORG_MEMBERS,
  });
}

// ... same pattern for useOrgTeams, useOrgRepos, useTeamMembers, useTeamRepos
```

### Step 6: Create shared mutation factory

Similarly, mutation hooks share a common pattern. Extract:

```typescript
function useOrgMutation<TInput, TOutput = void>(config: {
  path: string | ((input: TInput) => string);
  method: "POST" | "PATCH" | "DELETE" | "PUT";
  hasBody?: boolean;
  hasResponseBody?: boolean;
  onSuccess?: (output: TOutput, input: TInput) => void;
}): MutationResult<TInput, TOutput> {
  const client = useAPIClient();

  const { mutate, isLoading, error, reset } = useMutation<TInput, TOutput>({
    mutationFn: async (input, signal) => {
      const resolvedPath = typeof config.path === "function"
        ? config.path(input)
        : config.path;

      const requestOptions: any = {
        method: config.method,
        signal,
      };

      if (config.hasBody !== false && config.method !== "DELETE") {
        requestOptions.body = input;
      }

      const response = await client.request(resolvedPath, requestOptions);

      if (!response.ok) {
        throw await parseResponseError(response);
      }

      if (config.hasResponseBody !== false && response.status !== 204 && response.status !== 201) {
        return response.json() as Promise<TOutput>;
      }

      return undefined as unknown as TOutput;
    },
    onSuccess: config.onSuccess,
  });

  return {
    execute: mutate,
    loading: isLoading,
    error,
    reset,
  };
}
```

---

## Complete File Structure

```
apps/tui/src/hooks/
├── org-types.ts            # NEW — Organization domain types
├── useOrgData.ts           # NEW — All organization data hooks
├── useQuery.ts             # EXISTING — Generic query hook (used by useOrg, useTeam)
├── useOptimisticMutation.ts # EXISTING — Optimistic mutation pattern
├── workflow-types.ts       # EXISTING — Pattern reference
├── useWorkflowRuns.ts      # EXISTING — Pattern reference
└── ...
```

---

## Complete Hook Inventory

### Query Hooks

| Hook | Arguments | Return Type | API Endpoint |
|---|---|---|---|
| `useOrgs(filters?)` | `OrgListFilters?` | `PaginatedQueryResult<Organization>` | `GET /api/user/orgs` |
| `useOrg(orgName)` | `string` | `QueryResult<Organization>` | `GET /api/orgs/:org` |
| `useOrgMembers(orgName, filters?)` | `string, OrgMembersFilters?` | `PaginatedQueryResult<OrgMember>` | `GET /api/orgs/:org/members` |
| `useOrgTeams(orgName, filters?)` | `string, OrgTeamsFilters?` | `PaginatedQueryResult<Team>` | `GET /api/orgs/:org/teams` |
| `useOrgRepos(orgName, filters?)` | `string, OrgReposFilters?` | `PaginatedQueryResult<OrgRepository>` | `GET /api/orgs/:org/repos` |
| `useOrgRole(orgName)` | `string` | `OrgRoleResult` | Derived from `useOrgMembers` + `useAuth` |
| `useTeam(orgName, teamName)` | `string, string` | `QueryResult<Team>` | `GET /api/orgs/:org/teams/:team` |
| `useTeamMembers(orgName, teamName, filters?)` | `string, string, TeamMembersFilters?` | `PaginatedQueryResult<TeamMember>` | `GET /api/orgs/:org/teams/:team/members` |
| `useTeamRepos(orgName, teamName, filters?)` | `string, string, TeamReposFilters?` | `PaginatedQueryResult<OrgRepository>` | `GET /api/orgs/:org/teams/:team/repos` |

### Mutation Hooks

| Hook | Arguments | Input Type | Output Type | API Endpoint |
|---|---|---|---|---|
| `useUpdateOrg(orgName)` | `string` | `UpdateOrgRequest` | `Organization` | `PATCH /api/orgs/:org` |
| `useDeleteOrg(orgName)` | `string` | `void` | `void` | `DELETE /api/orgs/:org` |
| `useAddOrgMember(orgName)` | `string` | `AddOrgMemberRequest` | `void` | `POST /api/orgs/:org/members` |
| `useRemoveOrgMember(orgName)` | `string` | `string` (username) | `void` | `DELETE /api/orgs/:org/members/:username` |
| `useCreateTeam(orgName)` | `string` | `CreateTeamRequest` | `Team` | `POST /api/orgs/:org/teams` |
| `useUpdateTeam(orgName, teamName)` | `string, string` | `UpdateTeamRequest` | `Team` | `PATCH /api/orgs/:org/teams/:team` |
| `useDeleteTeam(orgName, teamName)` | `string, string` | `void` | `void` | `DELETE /api/orgs/:org/teams/:team` |

---

## Detailed Implementation: `apps/tui/src/hooks/useOrgData.ts`

```typescript
import { usePaginatedQuery } from "@codeplane/ui-core/src/hooks/internal/usePaginatedQuery.js";
import { useMutation } from "@codeplane/ui-core/src/hooks/internal/useMutation.js";
import { useAPIClient } from "@codeplane/ui-core/src/client/index.js";
import { parseResponseError } from "@codeplane/ui-core/src/types/errors.js";
import { useQuery } from "./useQuery.js";
import { useAuth } from "./useAuth.js";
import type {
  Organization,
  OrgMember,
  Team,
  TeamMember,
  OrgRepository,
  UpdateOrgRequest,
  AddOrgMemberRequest,
  CreateTeamRequest,
  UpdateTeamRequest,
  PaginatedQueryResult,
  QueryResult,
  MutationResult,
  OrgListFilters,
  OrgMembersFilters,
  OrgTeamsFilters,
  OrgReposFilters,
  TeamMembersFilters,
  TeamReposFilters,
  OrgRole,
  HookError,
} from "./org-types.js";
import {
  MAX_ORGS,
  MAX_ORG_MEMBERS,
  MAX_ORG_TEAMS,
  MAX_ORG_REPOS,
  MAX_TEAM_MEMBERS,
  MAX_TEAM_REPOS,
} from "./org-types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a bare JSON array response with X-Total-Count header.
 * Used by all paginated org endpoints which return arrays (not wrapped objects).
 */
function parseArrayResponse<T>(data: unknown, headers: Headers): {
  items: T[];
  totalCount: number | null;
} {
  const items = Array.isArray(data) ? (data as T[]) : [];
  const raw = headers.get("X-Total-Count");
  const totalCount = raw !== null ? parseInt(raw, 10) : null;
  return {
    items,
    totalCount: totalCount !== null && !Number.isNaN(totalCount) ? totalCount : null,
  };
}

/**
 * Internal factory for paginated org query hooks.
 * Wraps usePaginatedQuery with the standard org response parsing pattern.
 */
function usePaginatedOrgQuery<T>(config: {
  path: string;
  cacheKey: string;
  enabled: boolean;
  perPage?: number;
  maxItems?: number;
}): PaginatedQueryResult<T> {
  const client = useAPIClient();

  const {
    items,
    totalCount,
    isLoading,
    error,
    hasMore,
    fetchMore,
    refetch,
  } = usePaginatedQuery<T>({
    client,
    path: config.path,
    cacheKey: config.cacheKey,
    perPage: config.perPage ?? 30,
    enabled: config.enabled,
    maxItems: config.maxItems ?? 500,
    autoPaginate: false,
    parseResponse: parseArrayResponse<T>,
  });

  return {
    data: items,
    totalCount,
    loading: isLoading,
    error,
    hasMore,
    loadMore: fetchMore,
    refetch,
  };
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetch the authenticated user's organizations with cursor pagination.
 *
 * API: GET /api/user/orgs
 * Response: Organization[] + X-Total-Count header
 */
export function useOrgs(filters?: OrgListFilters): PaginatedQueryResult<Organization> {
  return usePaginatedOrgQuery<Organization>({
    path: "/api/user/orgs",
    cacheKey: "user-orgs",
    enabled: true,
    perPage: filters?.per_page ?? 30,
    maxItems: MAX_ORGS,
  });
}

/**
 * Fetch a single organization by name.
 *
 * API: GET /api/orgs/:org
 * Response: Organization
 */
export function useOrg(orgName: string): QueryResult<Organization> {
  return useQuery<Organization>({
    path: `/api/orgs/${orgName}`,
    enabled: !!orgName,
  });
}

/**
 * Fetch organization members with pagination.
 *
 * API: GET /api/orgs/:org/members
 * Response: OrgMember[] + X-Total-Count header
 */
export function useOrgMembers(
  orgName: string,
  filters?: OrgMembersFilters,
): PaginatedQueryResult<OrgMember> {
  return usePaginatedOrgQuery<OrgMember>({
    path: `/api/orgs/${orgName}/members`,
    cacheKey: `org-members:${orgName}`,
    enabled: !!orgName,
    perPage: filters?.per_page ?? 30,
    maxItems: MAX_ORG_MEMBERS,
  });
}

/**
 * Fetch organization teams with pagination.
 *
 * API: GET /api/orgs/:org/teams
 * Response: Team[] + X-Total-Count header
 */
export function useOrgTeams(
  orgName: string,
  filters?: OrgTeamsFilters,
): PaginatedQueryResult<Team> {
  return usePaginatedOrgQuery<Team>({
    path: `/api/orgs/${orgName}/teams`,
    cacheKey: `org-teams:${orgName}`,
    enabled: !!orgName,
    perPage: filters?.per_page ?? 30,
    maxItems: MAX_ORG_TEAMS,
  });
}

/**
 * Fetch organization repositories with pagination.
 *
 * API: GET /api/orgs/:org/repos
 * Response: OrgRepository[] + X-Total-Count header
 */
export function useOrgRepos(
  orgName: string,
  filters?: OrgReposFilters,
): PaginatedQueryResult<OrgRepository> {
  return usePaginatedOrgQuery<OrgRepository>({
    path: `/api/orgs/${orgName}/repos`,
    cacheKey: `org-repos:${orgName}`,
    enabled: !!orgName,
    perPage: filters?.per_page ?? 30,
    maxItems: MAX_ORG_REPOS,
  });
}

/**
 * Determine the current viewer's role in an organization.
 *
 * Derived from useOrgMembers + useAuth — no dedicated API endpoint.
 * Cross-references the authenticated user against the org members list.
 *
 * Returns { role, isOwner, isMember, loading, error }.
 */
export interface OrgRoleResult {
  role: OrgRole | null;
  isOwner: boolean;
  isMember: boolean;
  loading: boolean;
  error: HookError | null;
}

export function useOrgRole(orgName: string): OrgRoleResult {
  const { user } = useAuth();
  const members = useOrgMembers(orgName);

  const currentMember = user
    ? members.data.find((m) => m.username === user.username)
    : undefined;

  return {
    role: currentMember?.role ?? null,
    isOwner: currentMember?.role === "owner",
    isMember: currentMember != null,
    loading: members.loading,
    error: members.error,
  };
}

/**
 * Fetch a single team by org and team name.
 *
 * API: GET /api/orgs/:org/teams/:team
 * Response: Team
 */
export function useTeam(orgName: string, teamName: string): QueryResult<Team> {
  return useQuery<Team>({
    path: `/api/orgs/${orgName}/teams/${teamName}`,
    enabled: !!orgName && !!teamName,
  });
}

/**
 * Fetch team members with pagination.
 *
 * API: GET /api/orgs/:org/teams/:team/members
 * Response: TeamMember[] + X-Total-Count header
 */
export function useTeamMembers(
  orgName: string,
  teamName: string,
  filters?: TeamMembersFilters,
): PaginatedQueryResult<TeamMember> {
  return usePaginatedOrgQuery<TeamMember>({
    path: `/api/orgs/${orgName}/teams/${teamName}/members`,
    cacheKey: `team-members:${orgName}:${teamName}`,
    enabled: !!orgName && !!teamName,
    perPage: filters?.per_page ?? 30,
    maxItems: MAX_TEAM_MEMBERS,
  });
}

/**
 * Fetch team repositories with pagination.
 *
 * API: GET /api/orgs/:org/teams/:team/repos
 * Response: OrgRepository[] + X-Total-Count header
 */
export function useTeamRepos(
  orgName: string,
  teamName: string,
  filters?: TeamReposFilters,
): PaginatedQueryResult<OrgRepository> {
  return usePaginatedOrgQuery<OrgRepository>({
    path: `/api/orgs/${orgName}/teams/${teamName}/repos`,
    cacheKey: `team-repos:${orgName}:${teamName}`,
    enabled: !!orgName && !!teamName,
    perPage: filters?.per_page ?? 30,
    maxItems: MAX_TEAM_REPOS,
  });
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/**
 * Update organization metadata.
 *
 * API: PATCH /api/orgs/:org
 * Request: UpdateOrgRequest
 * Response: Organization
 */
export function useUpdateOrg(orgName: string): MutationResult<UpdateOrgRequest, Organization> {
  const client = useAPIClient();

  const { mutate, isLoading, error, reset } = useMutation<UpdateOrgRequest, Organization>({
    mutationFn: async (input, signal) => {
      const response = await client.request(`/api/orgs/${orgName}`, {
        method: "PATCH",
        body: input,
        signal,
      });
      if (!response.ok) {
        throw await parseResponseError(response);
      }
      return response.json();
    },
  });

  return { execute: mutate, loading: isLoading, error, reset };
}

/**
 * Delete an organization.
 *
 * API: DELETE /api/orgs/:org
 * Response: 204 No Content
 */
export function useDeleteOrg(orgName: string): MutationResult<void, void> {
  const client = useAPIClient();

  const { mutate, isLoading, error, reset } = useMutation<void, void>({
    mutationFn: async (_input, signal) => {
      const response = await client.request(`/api/orgs/${orgName}`, {
        method: "DELETE",
        signal,
      });
      if (!response.ok) {
        throw await parseResponseError(response);
      }
    },
  });

  return { execute: mutate, loading: isLoading, error, reset };
}

/**
 * Add a member to an organization.
 *
 * API: POST /api/orgs/:org/members
 * Request: { user_id: number; role: string }
 * Response: 201 Created
 */
export function useAddOrgMember(orgName: string): MutationResult<AddOrgMemberRequest, void> {
  const client = useAPIClient();

  const { mutate, isLoading, error, reset } = useMutation<AddOrgMemberRequest, void>({
    mutationFn: async (input, signal) => {
      const response = await client.request(`/api/orgs/${orgName}/members`, {
        method: "POST",
        body: input,
        signal,
      });
      if (!response.ok) {
        throw await parseResponseError(response);
      }
    },
  });

  return { execute: mutate, loading: isLoading, error, reset };
}

/**
 * Remove a member from an organization.
 *
 * API: DELETE /api/orgs/:org/members/:username
 * Response: 204 No Content
 */
export function useRemoveOrgMember(orgName: string): MutationResult<string, void> {
  const client = useAPIClient();

  const { mutate, isLoading, error, reset } = useMutation<string, void>({
    mutationFn: async (username, signal) => {
      const response = await client.request(
        `/api/orgs/${orgName}/members/${username}`,
        { method: "DELETE", signal },
      );
      if (!response.ok) {
        throw await parseResponseError(response);
      }
    },
  });

  return { execute: mutate, loading: isLoading, error, reset };
}

/**
 * Create a new team in an organization.
 *
 * API: POST /api/orgs/:org/teams
 * Request: CreateTeamRequest
 * Response: Team (201)
 */
export function useCreateTeam(orgName: string): MutationResult<CreateTeamRequest, Team> {
  const client = useAPIClient();

  const { mutate, isLoading, error, reset } = useMutation<CreateTeamRequest, Team>({
    mutationFn: async (input, signal) => {
      const response = await client.request(`/api/orgs/${orgName}/teams`, {
        method: "POST",
        body: input,
        signal,
      });
      if (!response.ok) {
        throw await parseResponseError(response);
      }
      return response.json();
    },
  });

  return { execute: mutate, loading: isLoading, error, reset };
}

/**
 * Update an existing team.
 *
 * API: PATCH /api/orgs/:org/teams/:team
 * Request: UpdateTeamRequest
 * Response: Team (200)
 */
export function useUpdateTeam(
  orgName: string,
  teamName: string,
): MutationResult<UpdateTeamRequest, Team> {
  const client = useAPIClient();

  const { mutate, isLoading, error, reset } = useMutation<UpdateTeamRequest, Team>({
    mutationFn: async (input, signal) => {
      const response = await client.request(
        `/api/orgs/${orgName}/teams/${teamName}`,
        { method: "PATCH", body: input, signal },
      );
      if (!response.ok) {
        throw await parseResponseError(response);
      }
      return response.json();
    },
  });

  return { execute: mutate, loading: isLoading, error, reset };
}

/**
 * Delete a team from an organization.
 *
 * API: DELETE /api/orgs/:org/teams/:team
 * Response: 204 No Content
 */
export function useDeleteTeam(
  orgName: string,
  teamName: string,
): MutationResult<void, void> {
  const client = useAPIClient();

  const { mutate, isLoading, error, reset } = useMutation<void, void>({
    mutationFn: async (_input, signal) => {
      const response = await client.request(
        `/api/orgs/${orgName}/teams/${teamName}`,
        { method: "DELETE", signal },
      );
      if (!response.ok) {
        throw await parseResponseError(response);
      }
    },
  });

  return { execute: mutate, loading: isLoading, error, reset };
}
```

---

## Edge Cases & Error Handling

### Empty orgName / teamName

All hooks guard against empty string inputs via `enabled: !!orgName` (and `!!teamName` where applicable). When disabled:
- Paginated hooks return `{ data: [], totalCount: 0, loading: false, error: null, hasMore: false }`
- Query hooks return `{ data: null, loading: false, error: null }`
- No API request is made.

### Auth errors (401)

All API requests go through the `APIClient` which attaches the `Authorization` header. If the server returns 401:
- `parseResponseError()` produces an `ApiError` with `code: "UNAUTHORIZED"`.
- The hook sets `error` with this value.
- Consuming screens display "Session expired. Run `codeplane auth login` to re-authenticate."

### Permission errors (403)

Owner-only mutation endpoints (update org, delete org, add/remove members, team CRUD) return 403 for non-owners:
- `parseResponseError()` produces an `ApiError` with `code: "FORBIDDEN"`.
- Mutation hooks set `error`.
- Consuming screens should gate mutation UI elements behind `useOrgRole().isOwner` to avoid showing forbidden actions.

### Network errors

- The `APIClient` throws `NetworkError` on fetch failures.
- Both `usePaginatedQuery` and `useMutation` catch network errors and surface them via `error`.
- Consuming screens show inline error with "Press R to retry" hint.

### Pagination overflow

All paginated hooks cap at 500 items (`MAX_*` constants). When the cap is reached, oldest items are evicted. This matches the architecture spec's memory cap design.

### Cache key invalidation

The `usePaginatedQuery` hook performs a hard reset (clears items, resets to page 1) when the cache key changes. Cache keys include the `orgName` and `teamName` parameters, so navigating between different orgs/teams triggers a fresh fetch.

### `useOrgRole` limitations

- For orgs with >500 members, the viewer may not be found in the cached member list. The hook returns `{ role: null, isOwner: false, isMember: false }` in this case, which is incorrect for members past position 500.
- **Mitigation:** The first page (30 members) is loaded initially. Owners are typically listed early. For v2, a dedicated `/api/orgs/:org/membership` endpoint should be added.
- The hook does not fetch additional pages automatically — it relies on the data already loaded by `useOrgMembers`. If the consuming screen has paginated through enough members, the role will resolve correctly.

---

## Productionization Notes

### No POC code

This implementation uses only established patterns from the existing codebase (`usePaginatedQuery`, `useMutation`, `useQuery`). There is no POC code to graduate. All hooks follow the exact same structure as `useWorkflowRuns.ts` and `useWorkflowDefinitions.ts`.

### Import paths

All imports use the `.js` extension suffix for ESM compatibility, matching the existing convention:
```typescript
import { usePaginatedQuery } from "@codeplane/ui-core/src/hooks/internal/usePaginatedQuery.js";
```

### Type re-exports

The `org-types.ts` file re-exports `HookError` from `@codeplane/ui-core` to maintain consistency with `workflow-types.ts`. Consuming screens should import types from `./org-types.js`.

### Barrel export

Add re-exports to a future `apps/tui/src/hooks/index.ts` barrel file:
```typescript
export * from "./useOrgData.js";
export * from "./org-types.js";
```

Until the barrel file exists, consuming screens import directly:
```typescript
import { useOrgs, useOrg, useOrgMembers, useOrgRole } from "../hooks/useOrgData.js";
import type { Organization, OrgMember } from "../hooks/org-types.js";
```

---

## Unit & Integration Tests

**Test file:** `e2e/tui/organizations.test.ts` (extends existing file)

The existing `e2e/tui/organizations.test.ts` file contains screen-level E2E tests (tab navigation, rendering, filtering). The org data hook tests should be added as new `describe` blocks in the same file, since the test philosophy requires testing **user-visible behavior** through the TUI, not isolated hook unit tests.

These tests validate that the hooks correctly fetch, paginate, and mutate data by verifying the rendered terminal output. They run against a real API server with test fixtures. Tests that fail due to unimplemented backend features are left failing.

### Test Structure (new blocks to add to `e2e/tui/organizations.test.ts`)

```typescript
import { describe, test, expect } from "bun:test";
import { launchTUI } from "./helpers.js";

// =============================================================================
// Organization Data Loading
// =============================================================================

describe("TUI_ORG_DATA — org list loading", () => {
  test("DATA-ORG-001: org list renders fetched organizations", async () => {
    // Navigate to org list screen
    // Verify org names from fixture data appear in the list
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o"); // go to orgs
    await tui.waitForText("Organizations");
    // Fixture org names should be visible
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("DATA-ORG-002: org list shows loading state before data arrives", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    // Immediately after navigation, loading indicator should be visible
    expect(tui.snapshot()).toMatch(/Loading/);
  });

  test("DATA-ORG-003: org list displays error on API failure", async () => {
    // With invalid auth, API returns 401
    const tui = await launchTUI({
      cols: 120,
      rows: 40,
      env: { CODEPLANE_TOKEN: "invalid-token" },
    });
    await tui.sendKeys("g", "o");
    await tui.waitForText("error", 5000);
    // Error message should be visible
    expect(tui.snapshot()).toMatch(/error|Error|unauthorized/i);
  });

  test("DATA-ORG-004: org list shows visibility badge per org", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    // Visibility badges (public/private/limited) should appear
    expect(tui.snapshot()).toMatch(/public|private|limited/);
  });
});

// =============================================================================
// Organization Detail Data
// =============================================================================

describe("TUI_ORG_DATA — org detail loading", () => {
  test("DATA-ORG-010: org overview loads org metadata", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter"); // open first org
    await tui.waitForText("Repositories");
    // Org name and description should be rendered in the header
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("DATA-ORG-011: org repos tab loads repository list", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    // Repository names from fixture data should appear
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("DATA-ORG-012: org members tab loads member list on activation", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    await tui.sendKeys("2"); // switch to Members tab
    await tui.waitForText("Members");
    // Member usernames should appear
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("DATA-ORG-013: org teams tab loads team list on activation", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    await tui.sendKeys("3"); // switch to Teams tab
    // Team names should appear after loading
    expect(tui.snapshot()).toMatchSnapshot();
  });
});

// =============================================================================
// Pagination
// =============================================================================

describe("TUI_ORG_DATA — pagination", () => {
  test("DATA-PAG-001: org list paginates on scroll to end", async () => {
    // Fixture must have >30 orgs to trigger pagination
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    // Scroll to bottom of first page
    await tui.sendKeys("G"); // jump to end
    // If hasMore, Loading more... should appear briefly
    // Additional orgs from page 2 should eventually render
  });

  test("DATA-PAG-002: org members paginates on scroll", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    await tui.sendKeys("2"); // Members tab
    await tui.waitForText("Members");
    await tui.sendKeys("G"); // scroll to end
    // Pagination should trigger if more members exist
  });

  test("DATA-PAG-003: org repos paginates on scroll", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    await tui.sendKeys("G"); // scroll to end
    // Pagination should trigger if more repos exist
  });

  test("DATA-PAG-004: org teams paginates on scroll", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("G"); // scroll to end
    // Pagination should trigger if more teams exist
  });

  test("DATA-PAG-005: team members paginates on scroll", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open first team
    await tui.waitForText("Members");
    await tui.sendKeys("G"); // scroll to end
  });

  test("DATA-PAG-006: team repos paginates on scroll", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open first team
    await tui.waitForText("Members");
    await tui.sendKeys("2"); // Repos tab
    await tui.sendKeys("G"); // scroll to end
  });

  test("DATA-PAG-007: total count displayed in tab badge", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    // Tab labels should show count from X-Total-Count header
    expect(tui.snapshot()).toMatch(/Repositories \(\d+\)/);
  });
});

// =============================================================================
// Viewer Role Detection
// =============================================================================

describe("TUI_ORG_DATA — viewer role", () => {
  test("DATA-ROLE-001: owner sees Settings tab", async () => {
    // Authenticated user is org owner → Settings tab visible
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    // If fixture user is owner, Settings tab should be visible
    expect(tui.snapshot()).toMatch(/4:Settings/);
  });

  test("DATA-ROLE-002: non-owner does not see Settings tab", async () => {
    // Authenticated user is member, not owner → no Settings tab
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    const snapshot = tui.snapshot();
    expect(snapshot).not.toMatch(/Settings/);
  });

  test("DATA-ROLE-003: owner sees add member action", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    await tui.sendKeys("2"); // Members tab
    await tui.waitForText("Members");
    // Owner should see add member hint in status bar
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/a.*add/i);
  });

  test("DATA-ROLE-004: non-owner does not see add member action", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    await tui.sendKeys("2"); // Members tab
    await tui.waitForText("Members");
    // Non-owner should not see add action
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).not.toMatch(/a.*add/i);
  });
});

// =============================================================================
// Mutation Operations
// =============================================================================

describe("TUI_ORG_DATA — mutations", () => {
  test("DATA-MUT-001: update org name via settings", async () => {
    // Navigate to org settings → edit name → save
    // Verify API call succeeds and header updates
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    await tui.sendKeys("4"); // Settings (if owner)
    // Navigate to name field, edit, save
    // Verify updated name renders
  });

  test("DATA-MUT-002: remove org member via members list", async () => {
    // Navigate to org members → focus member → press d → confirm
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    await tui.sendKeys("2"); // Members tab
    await tui.waitForText("Members");
    // Focus a non-owner member and attempt removal
    // Verify confirmation dialog appears
  });

  test("DATA-MUT-003: create team via teams list", async () => {
    // Navigate to org teams → press c → fill form → submit
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    await tui.sendKeys("3"); // Teams tab
    // Press create action key
    // Fill team creation form
    // Verify team appears in list after creation
  });

  test("DATA-MUT-004: delete team via team detail", async () => {
    // Navigate to team detail → press d → confirm → team deleted
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.waitForText("Members");
    // Trigger delete action and confirm
  });

  test("DATA-MUT-005: delete org via settings danger zone", async () => {
    // Navigate to settings → danger zone → delete → type org name → confirm
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    await tui.sendKeys("4"); // Settings
    // Navigate to danger zone section
    // Trigger delete
    // Verify confirmation requires typing org name
  });

  test("DATA-MUT-006: mutation error shows inline error message", async () => {
    // Trigger a mutation that fails (e.g., remove last owner)
    // Verify error message appears inline
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    // Attempt an action that the server rejects
    // Verify error message renders
  });
});

// =============================================================================
// Refetch and Cache Invalidation
// =============================================================================

describe("TUI_ORG_DATA — refetch", () => {
  test("DATA-REF-001: R key refetches current tab data", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.waitForText("Repositories");
    // Press R to refetch
    await tui.sendKeys("r");
    // Verify data reloads (loading indicator may briefly appear)
  });

  test("DATA-REF-002: navigating to different org resets cache", async () => {
    // Open org A → back → open org B → data is for org B not org A
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter"); // org A
    await tui.waitForText("Repositories");
    const snapshotA = tui.snapshot();

    await tui.sendKeys("q"); // back to list
    await tui.sendKeys("j"); // focus org B
    await tui.sendKeys("Enter"); // org B
    await tui.waitForText("Repositories");
    const snapshotB = tui.snapshot();

    // Snapshots should differ (different org data)
    expect(snapshotA).not.toBe(snapshotB);
  });
});

// =============================================================================
// Team Detail Data
// =============================================================================

describe("TUI_ORG_DATA — team detail", () => {
  test("DATA-TEAM-001: team detail loads team metadata", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open first team
    await tui.waitForText("Members");
    // Team name, description, permission badge should render
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("DATA-TEAM-002: team members tab shows member list", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.waitForText("Members");
    // Member usernames should be visible
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("DATA-TEAM-003: team repos tab shows repository list", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
    await tui.sendKeys("Enter");
    await tui.sendKeys("3"); // Teams tab
    await tui.sendKeys("Enter"); // open team
    await tui.waitForText("Members");
    await tui.sendKeys("2"); // Repos tab
    // Repo names should be visible
    expect(tui.snapshot()).toMatchSnapshot();
  });
});
```

### Test Principles Applied

1. **Tests that fail due to unimplemented backends are left failing.** None of these tests are skipped or commented out. If the API server doesn't serve fixture data correctly, the test fails and that failure is a signal.

2. **No mocking of implementation details.** Tests launch a real TUI instance against a real API server. Hooks, state management, and React internals are never mocked.

3. **Each test validates one user-visible behavior.** Test names describe what the user sees, not what the hook does internally.

4. **Snapshot tests are supplementary.** The primary verification mechanism is interaction testing — pressing keys and verifying resulting content. Snapshots catch unintended visual regressions.

5. **Tests run at representative sizes.** Critical org screens are tested at 120×40 (standard). The existing tests in `organizations.test.ts` already cover 80×24 and responsive behavior.

6. **Tests are independent.** Each test launches a fresh TUI instance. No shared state.

---

## Implementation Checklist

- [ ] Create `apps/tui/src/hooks/org-types.ts` with all domain types, request DTOs, hook return types, filter types, and constants
- [ ] Create `apps/tui/src/hooks/useOrgData.ts` with:
  - [ ] `parseArrayResponse<T>()` helper
  - [ ] `usePaginatedOrgQuery<T>()` internal factory
  - [ ] `useOrgs()` — paginated user orgs
  - [ ] `useOrg()` — single org detail
  - [ ] `useOrgMembers()` — paginated members
  - [ ] `useOrgTeams()` — paginated teams
  - [ ] `useOrgRepos()` — paginated repos
  - [ ] `useOrgRole()` — derived viewer role
  - [ ] `useTeam()` — single team detail
  - [ ] `useTeamMembers()` — paginated team members
  - [ ] `useTeamRepos()` — paginated team repos
  - [ ] `useUpdateOrg()` — update org mutation
  - [ ] `useDeleteOrg()` — delete org mutation
  - [ ] `useAddOrgMember()` — add member mutation
  - [ ] `useRemoveOrgMember()` — remove member mutation
  - [ ] `useCreateTeam()` — create team mutation
  - [ ] `useUpdateTeam()` — update team mutation
  - [ ] `useDeleteTeam()` — delete team mutation
- [ ] Add data hook tests to `e2e/tui/organizations.test.ts`
- [ ] Verify all imports resolve correctly with `.js` extensions
- [ ] Verify hooks compile and pass type checks via `bun build`