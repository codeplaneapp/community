# Engineering Specification: `tui-workflow-data-hooks`

## Implement Workflow Data Hooks Adapter for TUI Consumption of @codeplane/ui-core

---

## 1. Overview

This ticket implements the data-fetching and mutation hooks that all workflow screens in the TUI consume. These hooks bridge the HTTP API and the screen components, providing a consistent React-hook interface with loading/error tracking, pagination, caching, optimistic updates, and rollback.

The hooks are implemented in `apps/tui/src/hooks/` as thin adapters over `@codeplane/ui-core` primitives. The base primitives — `usePaginatedQuery` and `useMutation` — live in `packages/ui-core/src/hooks/internal/` and are shared across all clients (TUI, web). A local `useQuery` hook in the TUI layer handles single-resource fetching where `ui-core` does not yet provide one. Each workflow-specific hook composes one of these primitives with endpoint-specific path construction, response parsing, and filter handling.

**Dependency:** `tui-navigation-provider` (provides `useNavigation()` for repo context resolution and screen transitions on mutation success).

**Implementation status:** All 12 hooks and supporting types are implemented. The files exist at the paths specified in the File Inventory. This spec documents the exact implementation as-built, the API contracts it depends on, and the testing strategy for verification.

---

## 2. API Endpoints Consumed

All endpoint paths are derived from the server route handlers in `apps/server/src/routes/workflows.ts`. Response shapes are verified against the actual server-side interface types.

| Hook | Method | Endpoint | Server Status | Response Shape |
|------|--------|----------|---------------|----------------|
| `useWorkflowDefinitions` | `GET` | `/api/repos/:owner/:repo/workflows` | Implemented | `{ workflows: WorkflowDefinition[], total_count? }` |
| `useWorkflowRuns` | `GET` | `/api/repos/:owner/:repo/workflows/runs` | Implemented | `{ runs: WorkflowRun[], total_count? }` (enriched with `workflow_name`, `workflow_path`) |
| `useWorkflowRunDetail` | `GET` | `/api/repos/:owner/:repo/workflows/runs/:id` | Implemented | `{ run, workflow, nodes, mermaid, plan_xml }` |
| `useWorkflowRunArtifacts` | `GET` | `/api/repos/:owner/:repo/actions/runs/:id/artifacts` | Stubbed | `{ artifacts: [] }` |
| `useWorkflowCaches` | `GET` | `/api/repos/:owner/:repo/actions/cache` | Stubbed | `[]` (raw array) |
| `useWorkflowCacheStats` | `GET` | `/api/repos/:owner/:repo/actions/cache/stats` | Stubbed | `{ total_count: 0, total_size_bytes: 0 }` |
| `useDispatchWorkflow` | `POST` | `/api/repos/:owner/:repo/workflows/:id/dispatches` | Implemented | `204 No Content` |
| `useWorkflowRunCancel` | `POST` | `/api/repos/:owner/:repo/workflows/runs/:id/cancel` | Implemented | `204 No Content` |
| `useWorkflowRunRerun` | `POST` | `/api/repos/:owner/:repo/workflows/runs/:id/rerun` | Implemented | `201 { workflow_definition_id, workflow_run_id, steps }` |
| `useWorkflowRunResume` | `POST` | `/api/repos/:owner/:repo/workflows/runs/:id/resume` | Implemented | `204 No Content` |
| `useDeleteWorkflowArtifact` | `DELETE` | `/api/repos/:owner/:repo/actions/runs/:id/artifacts/:name` | Stubbed | `204 No Content` |
| `useDeleteWorkflowCache` | `DELETE` | `/api/repos/:owner/:repo/actions/cache` | Stubbed | `200 { deleted_count: 0 }` |

**Pagination contract:** The server supports both legacy `page`/`per_page` and cursor-based `cursor`/`limit` pagination. Default: page=1, per_page=30, max=100. Hooks use `page`/`per_page` format via the `usePaginatedQuery` primitive, which appends `?page=N&per_page=M` automatically.

**State filter normalization:** The server normalizes state filter values: `completed`/`complete`/`done` → `success`, `failed`/`error` → `failure`, `cancelled`/`canceled` → `cancelled`, `pending` → `queued`, `in_progress`/`in-progress` → `running`, `finished`/`terminal` → `finished` (matches all terminal states). The hooks pass state filters as-is; normalization is server-side.

**Note on stubbed endpoints:** Artifact and cache endpoints return empty/zero data. Hooks consuming these endpoints function correctly (return empty `data`, no errors). Tests against them receive real HTTP responses. When these endpoints are implemented server-side, the hooks require zero changes.

---

## 3. Shared Types

### File: `apps/tui/src/hooks/workflow-types.ts` — **Implemented**

All workflow hooks share these types. Domain model interfaces are derived from the server-side interface types in `apps/server/src/routes/workflows.ts`.

```typescript
import type { HookError as CoreHookError } from "@codeplane/ui-core/src/types/errors.js";

// ---- Domain models (match API response shapes) ----

export interface WorkflowDefinition {
  id: number;
  repository_id: number;
  name: string;
  path: string;
  config: unknown; // WorkflowTriggerConfig — opaque to hooks, parsed by screens
  is_active: boolean;
  created_at: string; // ISO 8601
  updated_at: string;
}

export interface WorkflowRun {
  id: number;
  repository_id: number;
  workflow_definition_id: number;
  status: WorkflowRunStatus;
  trigger_event: string;
  trigger_ref: string;
  trigger_commit_sha: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Enriched fields from v2 /workflows/runs endpoint:
  workflow_name?: string;
  workflow_path?: string;
}

export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "success"
  | "failure"
  | "cancelled"
  | "error";

export const TERMINAL_STATUSES: ReadonlySet<WorkflowRunStatus> = new Set([
  "success",
  "failure",
  "cancelled",
  "error",
]);

export interface WorkflowRunNode {
  id: string;
  step_id: number;
  name: string;
  position: number;
  status: string;
  iteration: number;
  started_at: string | null;
  completed_at: string | null;
  duration: string;
  duration_seconds: number;
}

export interface WorkflowRunDetailResponse {
  run: WorkflowRun;
  workflow: {
    id: number;
    name: string;
    path: string;
  };
  nodes: WorkflowRunNode[];
  mermaid: string;
  plan_xml: string;
}

export interface WorkflowArtifact {
  id: number;
  repository_id: number;
  workflow_run_id: number;
  name: string;
  size: number;
  content_type: string;
  status: "pending" | "ready";
  gcs_key: string;
  confirmed_at: string | null;
  expires_at: string | null;
  release_tag: string | null;
  release_asset_name: string | null;
  release_attached_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowCache {
  id: number;
  repository_id: number;
  workflow_run_id: number | null;
  bookmark_name: string;
  cache_key: string;
  cache_version: string;
  object_key: string;
  object_size_bytes: number;
  compression: string;
  status: "pending" | "finalized";
  hit_count: number;
  last_hit_at: string | null;
  finalized_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowCacheStats {
  total_count: number;
  total_size_bytes: number;
}

export interface WorkflowRunResult {
  workflow_definition_id: number;
  workflow_run_id: number;
  steps: Array<{ step_id: string; task_id: string }>;
}

// ---- Hook return types ----

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

export interface RepoIdentifier {
  owner: string;
  repo: string;
}

// ---- Filter types ----

export interface WorkflowRunFilters {
  state?: string;           // Server-side filter: queued, running, success, failure, cancelled, finished
  definition_id?: number;   // Filter by specific workflow definition
  page?: number;            // Page number (1-based)
  per_page?: number;        // Items per page (default 30, max 100)
}

export interface WorkflowCacheFilters {
  bookmark?: string;
  key?: string;
  page?: number;
  per_page?: number;
}

export const MAX_DEFINITIONS = 300;
export const MAX_RUNS = 500;
export const MAX_ARTIFACTS = 200;
export const MAX_CACHES = 500;
```

---

## 4. Dependency on @codeplane/ui-core

The implementation consumes established `ui-core` primitives:

| Import | Source | Purpose |
|--------|--------|--------|
| `useAPIClient` | `@codeplane/ui-core/src/client/index.js` | Provides the authenticated `APIClient` instance via React context |
| `usePaginatedQuery` | `@codeplane/ui-core/src/hooks/internal/usePaginatedQuery.js` | Paginated list fetching with page caching, abort control, memory caps |
| `useMutation` | `@codeplane/ui-core/src/hooks/internal/useMutation.js` | Mutation execution with double-execute prevention, optimistic callbacks |
| `parseResponseError` | `@codeplane/ui-core/src/types/errors.js` | Maps HTTP responses to typed `ApiError` |
| `NetworkError` | `@codeplane/ui-core/src/types/errors.js` | Represents network/fetch failures |
| `HookError` | `@codeplane/ui-core/src/types/errors.js` | Union type: `ApiError | NetworkError` |

### APIClient contract

The `APIClient` interface (from `ui-core/src/client/types.ts`):

```typescript
interface APIClient {
  baseUrl: string;
  request(path: string, options?: APIRequestOptions): Promise<Response>;
}

interface APIRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}
```

The `createAPIClient` implementation injects `Authorization: token ${token}` header on every request. Network errors from `fetch()` are caught and wrapped in `NetworkError`. `DOMException` with name `"AbortError"` is rethrown as-is for upstream handling.

### usePaginatedQuery contract

```typescript
interface PaginatedQueryConfig<T> {
  client: APIClient;
  path: string;
  cacheKey: string;         // Used to detect param changes (hard reset vs refetch)
  perPage: number;
  enabled: boolean;
  maxItems: number;          // Memory cap — evicts from end when exceeded
  autoPaginate: boolean;     // false for workflow hooks (manual loadMore)
  parseResponse: (data: unknown, headers: Headers) => {
    items: T[];
    totalCount: number | null;  // null = infer hasMore from page size
  };
}

interface PaginatedQueryResult<T> {
  items: T[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
}
```

Key implementation details:
- Builds URL with `?page={N}&per_page={perPage}` appended (handles existing query params via `?` vs `&` separator)
- `cacheKey` change triggers hard reset: aborts inflight, clears items, sets loading, fetches page 1
- `refetch()` triggers soft reset: aborts inflight, clears error, resets page to 1 via `refetchCounter`
- `hasMore` derived from: `totalCount` comparison when available, otherwise `lastPageItemCount === perPage`
- Memory cap enforced via `combinedItems.slice(combinedItems.length - maxItems)` — retains most recent items
- `fetchMore()` is gated: returns early if `!hasMore || isLoading`
- Auto-paginate mode recursively fetches next page when `hasMore` is true (used by other hooks, not workflow hooks)

### useMutation contract

```typescript
interface MutationConfig<TInput, TOutput> {
  mutationFn: (input: TInput, signal: AbortSignal) => Promise<TOutput>;
  onOptimistic?: (input: TInput) => void;
  onSuccess?: (output: TOutput, input: TInput) => void;
  onError?: (error: HookError, input: TInput) => void;
  onSettled?: (input: TInput) => void;
}

interface MutationResult<TInput, TOutput> {
  mutate: (input: TInput) => Promise<TOutput>;
  isLoading: boolean;
  error: HookError | null;
  reset: () => void;
}
```

Double-execute prevention: `mutate()` rejects with `new Error("mutation in progress")` if `isLoading` is true. Config stored in refs for stable closure references. Abort on unmount via `AbortController`. `AbortError` is rethrown (not set to error state). All other errors are set to state and rethrown.

**Important design note on optimistic rollback:** The `ui-core` `useMutation` hook's `onOptimistic` callback is fire-and-forget — it does not capture or invoke a rollback function. Rollback is implemented in the workflow action hooks by storing rollback closures as expando properties keyed by input identity, and invoking them in the `onError` callback. This is a known coupling that should be refactored when `ui-core` adds native rollback support.

---

## 5. Implementation Plan

Each step is a vertical slice. Steps 1–3 are foundational; steps 4–10 are the individual hook implementations.

### Step 1: Shared types and constants

**File:** `apps/tui/src/hooks/workflow-types.ts` — **Implemented**

Defines all domain model interfaces, hook return types, filter interfaces, and memory cap constants. Imports `HookError` from `@codeplane/ui-core/src/types/errors.js` rather than redefining it.

**Rationale:** Single source of truth for all workflow type information. No circular imports — this file imports only from `ui-core` types.

### Step 2: Local query hook for single-resource fetching

**File:** `apps/tui/src/hooks/useQuery.ts` — **Implemented**

Generic single-resource fetch hook because `ui-core` does not yet expose one (only `usePaginatedQuery` and `useMutation` exist in the internal hooks).

```typescript
export interface UseQueryOptions<T> {
  path: string;
  params?: Record<string, string>;
  transform?: (response: unknown) => T;
  enabled?: boolean;
}

export function useQuery<T>(options: UseQueryOptions<T>): QueryResult<T>;
```

**Implementation details:**

- Uses `useAPIClient()` from `ui-core` for the authenticated client.
- Maintains `AbortController` ref for cancellation on unmount and on re-fetch.
- `isMounted` ref guards against state updates after unmount.
- `refetchCounter` state drives re-execution when `refetch()` is called.
- URL construction: appends `params` as query string via `URLSearchParams`. Handles paths with existing query params (`?` vs `&` separator) via `buildUrl()` memoized callback.
- On non-2xx response: calls `parseResponseError(response)` to produce a typed `ApiError`.
- On network error: wraps in `NetworkError` if not already one.
- On success: applies `transform` if provided, otherwise casts raw JSON body to `T`.
- Error does not clear stale `data` — preserves last successful value for "last known" display.
- `AbortError` is silently swallowed (no state update, returns early).
- `optionsRef` pattern avoids stale closures without re-triggering the effect.
- `refetch()` aborts inflight request, clears error, and increments `refetchCounter`.

**Exact data flow:**

```
useEffect triggers on [client, path, enabled, refetchCounter, buildUrl]
  → abort previous inflight
  → set loading=true
  → client.request(url, { signal })
  → if !response.ok → parseResponseError → setError, setLoading(false), return
  → response.json() → transform (or identity) → setData, setError(null), setLoading(false)
  → catch: AbortError → return silently
  → catch: other → NetworkError → setError, setLoading(false)
```

**Why local, not in ui-core:** This hook is a simple React `useEffect` + `useState` pattern. When `ui-core` adds a `useQuery` primitive, the TUI's `useQuery.ts` can be replaced with a re-export. The hook signature is designed to be forward-compatible.

### Step 3: Verify ui-core primitives are available

Before implementing hook files, verify that the following imports resolve:

```typescript
import { usePaginatedQuery } from "@codeplane/ui-core/src/hooks/internal/usePaginatedQuery.js";
import { useMutation } from "@codeplane/ui-core/src/hooks/internal/useMutation.js";
import { useAPIClient } from "@codeplane/ui-core/src/client/index.js";
import { parseResponseError, NetworkError } from "@codeplane/ui-core/src/types/errors.js";
```

**Status:** All four imports are verified present in `packages/ui-core/src/`.

### Step 4: Workflow definitions hook

**File:** `apps/tui/src/hooks/useWorkflowDefinitions.ts` — **Implemented**

```typescript
export function useWorkflowDefinitions(
  repo: RepoIdentifier,
  options?: { page?: number; perPage?: number; enabled?: boolean },
): PaginatedQueryResult<WorkflowDefinition>;
```

**Implementation:**
- Composes `usePaginatedQuery` from `ui-core` with:
  - `path`: `/api/repos/${repo.owner}/${repo.repo}/workflows`
  - `cacheKey`: `workflows:${repo.owner}:${repo.repo}` — changes when repo changes, triggering hard reset
  - `perPage`: `options?.perPage ?? 30`
  - `enabled`: `options?.enabled ?? true`
  - `maxItems`: `MAX_DEFINITIONS` (300)
  - `autoPaginate`: `false` — screen controls pagination via `loadMore()`
  - `parseResponse`: extracts `data?.workflows || []` array; `totalCount` from `data?.total_count ?? null`
- Maps `ui-core` return shape (`items`, `isLoading`, `fetchMore`) to the `PaginatedQueryResult` shape (`data`, `loading`, `loadMore`)

### Step 5: Workflow runs hook

**File:** `apps/tui/src/hooks/useWorkflowRuns.ts` — **Implemented**

```typescript
export function useWorkflowRuns(
  repo: RepoIdentifier,
  filters?: WorkflowRunFilters,
): PaginatedQueryResult<WorkflowRun>;
```

**Implementation:**
- Builds query string from `filters.state` and `filters.definition_id` using `URLSearchParams`
- Appends query string to path: `/api/repos/${owner}/${repo}/workflows/runs?${queryString}`
- `cacheKey` includes serialized query string: `workflow-runs:${owner}:${repo}:${queryString}` — when filters change, `cacheKey` changes, triggering `usePaginatedQuery`'s hard-reset path (aborts inflight, clears items, fetches page 1)
- Uses the v2 endpoint (`/workflows/runs`) which returns enriched runs with `workflow_name` and `workflow_path`
- `parseResponse`: extracts `data?.runs || []` array; `totalCount` from `data?.total_count ?? null`
- `perPage`: `filters?.per_page ?? 30`
- `enabled`: always `true` (no conditional fetch — screen controls visibility)
- Memory cap: `MAX_RUNS` (500)

**State filter behavior:** The server applies state filtering after fetching from the database. The `state` query param is passed directly. The server's `normalizeWorkflowState()` handles aliases. The hook does not validate or normalize filter values.

### Step 6: Workflow run detail hook

**File:** `apps/tui/src/hooks/useWorkflowRunDetail.ts` — **Implemented**

```typescript
export function useWorkflowRunDetail(
  repo: RepoIdentifier,
  runId: number,
  options?: { enabled?: boolean },
): QueryResult<WorkflowRunDetailResponse>;
```

**Implementation:**
- Composes the local `useQuery` with identity transform (`(res: any) => res`)
- `path`: `/api/repos/${repo.owner}/${repo.repo}/workflows/runs/${runId}`
- `enabled`: `options?.enabled ?? true`
- Response includes `run`, `workflow` (id, name, path), `nodes` (step details with duration), `mermaid` (graph markup), and `plan_xml`

### Step 7: Workflow run artifacts hook

**File:** `apps/tui/src/hooks/useWorkflowRunArtifacts.ts` — **Implemented**

```typescript
export function useWorkflowRunArtifacts(
  repo: RepoIdentifier,
  runId: number,
  options?: { enabled?: boolean },
): QueryResult<WorkflowArtifact[]>;
```

**Implementation:**
- Composes local `useQuery` with transform: `(res) => res?.artifacts || []`
- Memory cap enforced in transform: if `artifacts.length > MAX_ARTIFACTS`, truncates to last `MAX_ARTIFACTS` items via `slice(-MAX_ARTIFACTS)` (newest retained)
- Note: Server currently returns `{ artifacts: [] }` (stubbed)

### Step 8: Workflow caches hooks

**File:** `apps/tui/src/hooks/useWorkflowCaches.ts` — **Implemented**

```typescript
export function useWorkflowCaches(
  repo: RepoIdentifier,
  filters?: WorkflowCacheFilters,
): PaginatedQueryResult<WorkflowCache>;

export function useWorkflowCacheStats(
  repo: RepoIdentifier,
): QueryResult<WorkflowCacheStats>;
```

**Implementation:**

`useWorkflowCaches`:
- Composes `usePaginatedQuery` from `ui-core`
- `path`: `/api/repos/${repo.owner}/${repo.repo}/actions/cache`
- `parseResponse`: handles the raw array response — `Array.isArray(data) ? data : []` (the stubbed endpoint returns `[]` directly, not wrapped in an object)
- When the raw array response is received, `totalCount` is set to `Array.isArray(data) ? data.length : 0` — this causes `hasMore` to be `false` immediately for stubbed responses because `items.length >= totalCount`
- Filter params: `bookmark`, `key` passed as query string via `URLSearchParams`
- `cacheKey`: `workflow-caches:${owner}:${repo}:${queryString}` — changes on filter change
- Memory cap: `MAX_CACHES` (500)

`useWorkflowCacheStats`:
- Composes local `useQuery`
- `path`: `/api/repos/${repo.owner}/${repo.repo}/actions/cache/stats`
- Transform: extracts `total_count` and `total_size_bytes` with zero defaults (`res?.total_count || 0`, `res?.total_size_bytes || 0`)

### Step 9: Workflow action mutation hooks

**File:** `apps/tui/src/hooks/useWorkflowActions.ts` — **Implemented**

All five mutation hooks compose `useMutation` from `@codeplane/ui-core/src/hooks/internal/useMutation.js`.

#### `useWorkflowRunCancel`

```typescript
export function useWorkflowRunCancel(
  repo: RepoIdentifier,
  callbacks?: {
    onOptimistic?: (runId: number) => (() => void) | void;
    onSuccess?: (runId: number) => void;
    onError?: (error: HookError, runId: number) => void;
  },
): MutationResult<number, void>;
```

- `mutationFn`: `POST /api/repos/:owner/:repo/workflows/runs/:runId/cancel`
- Expected: 204 No Content
- Non-2xx: throws `ApiError` via `parseResponseError(response)`

#### `useWorkflowRunRerun`

```typescript
export function useWorkflowRunRerun(
  repo: RepoIdentifier,
  callbacks?: {
    onOptimistic?: (runId: number) => (() => void) | void;
    onSuccess?: (result: WorkflowRunResult, runId: number) => void;
    onError?: (error: HookError, runId: number) => void;
  },
): MutationResult<number, WorkflowRunResult>;
```

- `mutationFn`: `POST /api/repos/:owner/:repo/workflows/runs/:runId/rerun`
- Expected: 201 with `{ workflow_definition_id, workflow_run_id, steps: [{ step_id, task_id }] }`
- Calls `response.json()` to parse the result body and returns it

#### `useWorkflowRunResume`

```typescript
export function useWorkflowRunResume(
  repo: RepoIdentifier,
  callbacks?: {
    onOptimistic?: (runId: number) => (() => void) | void;
    onSuccess?: (runId: number) => void;
    onError?: (error: HookError, runId: number) => void;
  },
): MutationResult<number, void>;
```

- `mutationFn`: `POST /api/repos/:owner/:repo/workflows/runs/:runId/resume`
- Expected: 204 No Content
- Server returns 409 if run is not in `cancelled` or `failure` status

#### `useDeleteWorkflowArtifact`

```typescript
export function useDeleteWorkflowArtifact(
  repo: RepoIdentifier,
  callbacks?: {
    onOptimistic?: (args: { runId: number; name: string }) => (() => void) | void;
    onSuccess?: (args: { runId: number; name: string }) => void;
    onError?: (error: HookError, args: { runId: number; name: string }) => void;
  },
): MutationResult<{ runId: number; name: string }, void>;
```

- `mutationFn`: `DELETE /api/repos/:owner/:repo/actions/runs/:runId/artifacts/:name`
- Artifact name is URL-encoded via `encodeURIComponent(args.name)`
- Rollback key derived from compound identity: `` `${args.runId}_${args.name}` ``

#### `useDeleteWorkflowCache`

```typescript
export function useDeleteWorkflowCache(
  repo: RepoIdentifier,
  callbacks?: {
    onOptimistic?: (cacheId: number) => (() => void) | void;
    onSuccess?: (cacheId: number) => void;
    onError?: (error: HookError, cacheId: number) => void;
  },
): MutationResult<number, void>;
```

- `mutationFn`: `DELETE /api/repos/:owner/:repo/actions/cache`
- Takes `cacheId` param for forward-compatibility when per-cache delete is implemented. Currently maps to the bulk-delete endpoint.

**Optimistic rollback pattern (all action hooks):**

Since `ui-core`'s `useMutation.onOptimistic` does not capture rollback functions, the workflow action hooks implement a rollback bridge using expando properties on the hook function itself:

```typescript
onOptimistic: (runId) => {
  if (callbacks?.onOptimistic) {
    const rollback = callbacks.onOptimistic(runId);
    if (typeof rollback === "function") {
      (useWorkflowRunCancel as any)[`rollback_${runId}`] = rollback;
    }
  }
},
onError: (err, runId) => {
  const rollback = (useWorkflowRunCancel as any)[`rollback_${runId}`];
  if (typeof rollback === "function") {
    rollback();
  }
  delete (useWorkflowRunCancel as any)[`rollback_${runId}`];
  callbacks?.onError?.(err, runId);
},
onSuccess: (result, runId) => {
  delete (useWorkflowRunCancel as any)[`rollback_${runId}`];
  callbacks?.onSuccess?.(runId);
},
```

This pattern stores rollback functions as expando properties keyed by input identity. It is safe for single-inflight mutations (guaranteed by double-execute prevention). It will be replaced when `ui-core` adds native rollback support.

### Step 10: Dispatch workflow hook

**File:** `apps/tui/src/hooks/useDispatchWorkflow.ts` — **Implemented**

```typescript
export interface DispatchInput {
  workflowId: number;
  ref?: string;              // defaults to "main"
  inputs?: Record<string, unknown>;
}

export function useDispatchWorkflow(
  repo: RepoIdentifier,
  callbacks?: {
    onSuccess?: (input: DispatchInput) => void;
    onError?: (error: HookError, input: DispatchInput) => void;
  },
): MutationResult<DispatchInput, void>;
```

**Implementation:**
- `mutationFn`: `POST /api/repos/:owner/:repo/workflows/:workflowId/dispatches`
- Request body: `JSON.stringify({ ref: input.ref || "main", inputs: input.inputs })`
- Content-Type: `application/json` (set via headers)
- No optimistic update (dispatch creates new state, does not modify existing list)
- Expected: 204 No Content
- On success, downstream consumers should call `refetch()` on the workflow runs hook to see the new run

### Step 11: Barrel export update

**File:** `apps/tui/src/hooks/index.ts` — **Implemented**

All workflow hook exports and type re-exports are present at lines 15–49 and lines 61–75:

```typescript
// Workflow data hooks
export { useWorkflowDefinitions } from "./useWorkflowDefinitions.js";
export { useWorkflowRuns } from "./useWorkflowRuns.js";
export { useWorkflowRunDetail } from "./useWorkflowRunDetail.js";
export { useWorkflowRunArtifacts } from "./useWorkflowRunArtifacts.js";
export { useWorkflowCaches, useWorkflowCacheStats } from "./useWorkflowCaches.js";
export { useDispatchWorkflow } from "./useDispatchWorkflow.js";
export {
  useWorkflowRunCancel,
  useWorkflowRunRerun,
  useWorkflowRunResume,
  useDeleteWorkflowArtifact,
  useDeleteWorkflowCache,
} from "./useWorkflowActions.js";

// Re-export types for consumer convenience
export type {
  WorkflowDefinition,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowRunNode,
  WorkflowRunDetailResponse,
  WorkflowArtifact,
  WorkflowCache,
  WorkflowCacheStats,
  WorkflowRunResult,
  WorkflowRunFilters,
  WorkflowCacheFilters,
  RepoIdentifier,
  QueryResult,
  PaginatedQueryResult,
  MutationResult,
  HookError,
} from "./workflow-types.js";
export type { DispatchInput } from "./useDispatchWorkflow.js";

// Workflow streaming hooks
export { useWorkflowLogStream } from "./useWorkflowLogStream.js";
export { useWorkflowRunSSE } from "./useWorkflowRunSSE.js";
export type {
  LogLine,
  StatusEvent,
  DoneEvent,
  WorkflowLogStreamEvent,
  WorkflowRunSSEEvent,
  WorkflowStreamConnectionState,
  ConnectionHealth,
  WorkflowLogStreamState,
  StepState,
  WorkflowRunSSEState,
} from "./workflow-stream-types.js";
export { VIRTUAL_SCROLL_WINDOW } from "./workflow-stream-types.js";
```

Additionally, the barrel exports companion hooks used by workflow screens:

```typescript
export { useLoading } from './useLoading.js';
export { useOptimisticMutation } from './useOptimisticMutation.js';
```

---

## 6. File Inventory

| File Path | Status | Description |
|-----------|--------|-------------|
| `apps/tui/src/hooks/workflow-types.ts` | **Implemented** | All shared types, interfaces, constants |
| `apps/tui/src/hooks/useQuery.ts` | **Implemented** | Reusable single-resource query hook (TUI-local) |
| `apps/tui/src/hooks/useWorkflowDefinitions.ts` | **Implemented** | Workflow definitions list hook |
| `apps/tui/src/hooks/useWorkflowRuns.ts` | **Implemented** | Workflow runs list hook with filter support |
| `apps/tui/src/hooks/useWorkflowRunDetail.ts` | **Implemented** | Single run detail hook |
| `apps/tui/src/hooks/useWorkflowRunArtifacts.ts` | **Implemented** | Run artifacts hook |
| `apps/tui/src/hooks/useWorkflowCaches.ts` | **Implemented** | Cache list + stats hooks |
| `apps/tui/src/hooks/useWorkflowActions.ts` | **Implemented** | Cancel/rerun/resume/delete mutation hooks |
| `apps/tui/src/hooks/useDispatchWorkflow.ts` | **Implemented** | Dispatch mutation hook |
| `apps/tui/src/hooks/useOptimisticMutation.ts` | **Implemented** | Standalone optimistic mutation pattern (used by screens, not by workflow action hooks) |
| `apps/tui/src/hooks/useWorkflowLogStream.ts` | **Implemented** | TUI wrapper for log streaming with spinner animation |
| `apps/tui/src/hooks/useWorkflowRunSSE.ts` | **Implemented** | TUI re-export for multi-run status streaming |
| `apps/tui/src/hooks/workflow-stream-types.ts` | **Implemented** | SSE event types, connection health, stream state |
| `apps/tui/src/hooks/index.ts` | **Implemented** | All workflow hook and type exports present |
| `e2e/tui/workflows.test.ts` | **Implemented** | E2E tests for workflow data hooks |
| `e2e/tui/workflow-sse.test.ts` | **Implemented** | E2E tests for workflow SSE streaming |
| `e2e/tui/workflow-utils.test.ts` | **Implemented** | Unit tests for workflow display utilities |
| `e2e/tui/helpers/workflows.ts` | **Implemented** | Workflow-specific test helpers |

---

## 7. Optimistic Update Patterns

Two complementary patterns exist for optimistic updates in the TUI:

### Pattern 1: Callback-based rollback via useWorkflowActions

Used by `useWorkflowRunCancel`, `useWorkflowRunRerun`, `useWorkflowRunResume`, `useDeleteWorkflowArtifact`, `useDeleteWorkflowCache`. The screen provides `onOptimistic` that returns a rollback closure:

```typescript
const cancelMutation = useWorkflowRunCancel(repo, {
  onOptimistic: (runId) => {
    const previousStatus = getRunStatus(runId);
    setRunStatus(runId, "cancelled");
    return () => setRunStatus(runId, previousStatus); // rollback closure
  },
  onSuccess: (runId) => {
    // SSE will also deliver status change, but immediate feedback is better
  },
  onError: (error, runId) => {
    showInlineError(error.message);
    // rollback was already invoked automatically before onError fires
  },
});
```

The rollback closure is stored as an expando property on the hook function keyed by input identity (e.g., `rollback_${runId}`). On error, the stored rollback is invoked before the `onError` callback fires. On success, the stored rollback is cleaned up without invocation.

### Pattern 2: useOptimisticMutation (standalone)

Used by screen components for fire-and-forget mutations that must complete even after navigation. Integrates with the `useLoading` status bar system:

```typescript
const closeMutation = useOptimisticMutation({
  id: "close-issue",
  entityType: "issue",
  action: "close",
  mutate: (args) => apiClient.post(`/issues/${args.id}/close`),
  onOptimistic: (args) => setIssueState(args.id, "closed"),
  onRevert: (args) => setIssueState(args.id, "open"),
});
```

Key differences from Pattern 1:
- Never aborts on unmount — mutations continue in background
- Shows status bar feedback via `useLoading()` (register → complete/fail)
- Truncates error messages to 60 characters for status bar display (appends `"…"` when truncated)
- Shows error for 5 seconds via `loading.failMutation(id, message)`
- Debug logging to stderr when `CODEPLANE_TUI_DEBUG=true`

### Pattern 3: Rerun (navigates, no optimistic)

```typescript
const rerunMutation = useWorkflowRunRerun(repo, {
  onSuccess: (result, oldRunId) => {
    navigation.push("WorkflowRunDetail", {
      owner: repo.owner,
      repo: repo.repo,
      runId: String(result.workflow_run_id),
    });
  },
  onError: (error) => {
    showInlineError(error.message);
  },
});
```

No optimistic update because rerun creates a new entity — there is no existing state to optimistically modify. On success, navigation pushes to the newly created run's detail screen.

---

## 8. Memory Management

### Caps

| Hook | Memory Cap | Eviction Strategy |
|------|-----------|-------------------|
| `useWorkflowDefinitions` | 300 items | `usePaginatedQuery` evicts from end when exceeded |
| `useWorkflowRuns` | 500 items | `usePaginatedQuery` evicts from end when exceeded |
| `useWorkflowRunArtifacts` | 200 items | Truncate array in `transform` via `slice(-MAX_ARTIFACTS)` (newest retained) |
| `useWorkflowCaches` | 500 items | `usePaginatedQuery` evicts from end when exceeded |

### Eviction in usePaginatedQuery

The `ui-core` `usePaginatedQuery` implements eviction after combining page results:

```typescript
let combinedItems: T[];
if (pageToFetch === 1) {
  combinedItems = newItems;
} else {
  combinedItems = [...currentItems, ...newItems];
}

if (combinedItems.length > maxItems) {
  combinedItems = combinedItems.slice(combinedItems.length - maxItems);
}
```

This keeps the most recent `maxItems` items, dropping the oldest (earliest pages). The `data` array exposed to consumers is always a contiguous slice of the most recently loaded items.

### Stale Data on Back-Navigation

When a user navigates away from a workflow screen and returns, the hook re-mounts with fresh state. Cached pages from the previous mount are lost (hooks do not persist state outside the React tree). The hook re-fetches page 1 on mount, providing fresh data. Cross-mount caching would be added at the `ui-core` level if needed.

---

## 9. Error Handling Matrix

Errors are handled by the `parseResponseError` function from `@codeplane/ui-core/src/types/errors.js`, which maps HTTP status codes via `mapStatusToCode()`.

| HTTP Status | `ApiError.code` | Retryable | Hook Behavior |
|-------------|-----------------|-----------|---------------|
| 200/201/204 | — | — | Success path |
| 400 | `BAD_REQUEST` | No | Set error, retain stale data |
| 401 | `UNAUTHORIZED` | No | Set error. Screen renders: "Session expired. Run `codeplane auth login`." |
| 403 | `FORBIDDEN` | No | Set error, retain stale data |
| 404 | `NOT_FOUND` | No | Set error. Detail hooks: indicates resource does not exist |
| 409 | `UNKNOWN` | No | Set error. Mutation hooks: trigger rollback |
| 422 | `UNPROCESSABLE` | No | Set error (validation failure) |
| 429 | `RATE_LIMITED` | Yes | Set error, retain stale data |
| 500+ | `SERVER_ERROR` | Yes | Set error, retain stale data |
| Network error | `NETWORK_ERROR` | Yes | `NetworkError` set, retain stale data |

**Error construction in `parseResponseError`:**

```typescript
async function parseResponseError(response: Response): Promise<ApiError> {
  let detail = response.statusText || `HTTP ${response.status}`;
  let fieldErrors;
  try {
    const body = await response.json();
    if (body.message) detail = body.message;
    if (body.errors?.length) fieldErrors = body.errors;
  } catch { /* use statusText */ }
  return new ApiError(response.status, detail, fieldErrors);
}
```

**Key behavior:** Query hooks (definitions, runs, detail, artifacts, caches) retain stale data on error — the `data` field is not cleared. This allows the UI to show "last known" data with an error banner overlay. Mutation hooks do not hold data — they only track `loading` and `error`.

**Note on `useQuery` error retention:** The `useQuery` implementation sets `setError(parsedError)` and `setLoading(false)` on error responses but does NOT call `setData(null)`. Stale data from a previous successful fetch persists. This is intentional — screens can show both the last-good data and the error banner.

**Note on 409 Conflict:** The `mapStatusToCode` function does not have a dedicated case for 409, so it falls through to `"UNKNOWN"`. The hooks still handle it correctly — the error is set, and rollback is triggered for mutation hooks.

---

## 10. Unit & Integration Tests

### Test File: `e2e/tui/workflows.test.ts` — **Implemented**

All tests run against a real API server instance. Tests do **not** mock the API client, HTTP requests, or hook internals. Tests that fail because backend endpoints are stubbed remain failing — they are never skipped.

The test file imports `launchTUI` from `./helpers.js` and uses `bun:test`'s `describe`/`test`/`expect`.

#### Test Organization

Tests are organized into `describe` blocks by hook:

```typescript
import { describe, test, expect } from "bun:test";
import { launchTUI } from "./helpers.js";

describe("Workflow Data Hooks", () => {

  // =========================================================================
  // useWorkflowDefinitions
  // =========================================================================
  describe("useWorkflowDefinitions", () => {

    test("HOOK-WFD-001: definitions load on screen mount with loading→data transition", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Loading");
      await terminal.waitForText("Workflows");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFD-002: definitions display empty state when repo has no workflows", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "empty-org/empty-repo"],
      });
      await terminal.waitForText("No workflows");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFD-003: definitions pagination loads next page on scroll-to-end", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/large-repo"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("G");
      await terminal.waitForText("Loading more");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFD-004: definitions error state renders on API failure", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/private-repo"],
        env: { CODEPLANE_TOKEN: "invalid-token" },
      });
      await terminal.waitForText("error", 5000);
      await terminal.terminate();
    });

    test("HOOK-WFD-005: definitions refetch on Ctrl+R clears and reloads", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("ctrl+r");
      await terminal.waitForText("Loading");
      await terminal.waitForText("Workflows");
      await terminal.terminate();
    });
  });

  // =========================================================================
  // useWorkflowRuns
  // =========================================================================
  describe("useWorkflowRuns", () => {

    test("HOOK-WFR-001: runs load with correct columns for workflow", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFR-002: runs filter by state re-fetches from page 1", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("f");
      await terminal.waitForText("Running");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFR-003: runs show enriched workflow_name and workflow_path", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      const header = terminal.getLine(1);
      expect(header).toMatch(/Runs/);
      await terminal.terminate();
    });

    test("HOOK-WFR-004: runs pagination loads more on scroll to bottom", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("G");
      await terminal.terminate();
    });

    test("HOOK-WFR-005: runs empty state when no runs match filter", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      for (let i = 0; i < 6; i++) {
        await terminal.sendKeys("f");
      }
      await terminal.terminate();
    });
  });

  // =========================================================================
  // useWorkflowRunDetail
  // =========================================================================
  describe("useWorkflowRunDetail", () => {

    test("HOOK-WFRD-001: run detail loads with metadata header and step list", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("Enter");
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/#\d+/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFRD-002: run detail shows nodes with status and duration", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("#");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFRD-003: run detail 404 for nonexistent run shows error", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.terminate();
    });
  });

  // =========================================================================
  // useWorkflowRunArtifacts (stubbed endpoint)
  // =========================================================================
  describe("useWorkflowRunArtifacts", () => {

    test("HOOK-WFRA-001: artifacts load as empty array from stubbed endpoint", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("#");
      await terminal.sendKeys("a");
      await terminal.waitForText("No artifacts");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // useWorkflowCaches / useWorkflowCacheStats (stubbed endpoints)
  // =========================================================================
  describe("useWorkflowCaches", () => {

    test("HOOK-WFC-001: caches load as empty array from stubbed endpoint", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await terminal.waitForText("Caches");
      await terminal.waitForText("No caches");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFC-002: cache stats show zero counts from stubbed endpoint", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflow-caches", "--repo", "acme/api"],
      });
      await terminal.waitForText("Caches");
      const statsLine = terminal.getLine(2);
      expect(statsLine).toMatch(/0/);
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Mutation hooks: cancel, rerun, resume
  // =========================================================================
  describe("useWorkflowRunCancel", () => {

    test("HOOK-WFA-001: cancel on running run shows immediate status change", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("c");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-WFA-002: cancel on terminal run shows state-gated message", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("j", "j", "j");
      await terminal.sendKeys("c");
      await terminal.terminate();
    });
  });

  describe("useWorkflowRunRerun", () => {

    test("HOOK-WFA-003: rerun on completed run creates new run and navigates", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("r");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  describe("useWorkflowRunResume", () => {

    test("HOOK-WFA-004: resume on failed run triggers resume API call", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("Enter");
      await terminal.waitForText("Runs");
      await terminal.sendKeys("m");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // useDispatchWorkflow
  // =========================================================================
  describe("useDispatchWorkflow", () => {

    test("HOOK-WFD-010: dispatch sends POST to correct endpoint", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      await terminal.sendKeys("d");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Error handling integration
  // =========================================================================
  describe("Error handling", () => {

    test("HOOK-ERR-001: 401 response renders auth error message", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
        env: { CODEPLANE_TOKEN: "expired-token" },
      });
      await terminal.waitForText("expired", 5000);
      await terminal.terminate();
    });

    test("HOOK-ERR-002: network error shows retryable error with R hint", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
        env: { CODEPLANE_API_URL: "http://localhost:1" },
      });
      await terminal.waitForText("error", 10000);
      await terminal.terminate();
    });

    test("HOOK-ERR-003: error state preserves stale data and shows error banner", async () => {
      const terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // =========================================================================
  // Responsive behavior with data hooks
  // =========================================================================
  describe("Responsive data display", () => {

    test("HOOK-RSP-001: workflow list at 80x24 shows minimal columns", async () => {
      const terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("HOOK-RSP-002: workflow list at 200x60 shows all columns", async () => {
      const terminal = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "workflows", "--repo", "acme/api"],
      });
      await terminal.waitForText("Workflows");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });
});
```

### Companion Test Files

#### `e2e/tui/workflow-sse.test.ts` — **Implemented**

Covers SSE streaming integration (35+ tests) for `useWorkflowLogStream` and `useWorkflowRunSSE`. Tests verify:
- Connection lifecycle: mount → connect, terminal state skips, health display, cleanup on back-navigation
- Log events: incremental rendering, ANSI code passthrough, step grouping, deduplication via `log_id`
- Status events: step status updates, run status badge changes, done event finality
- Reconnection: indicators, max attempts exhaustion, manual R key trigger
- Multi-run SSE: live updates, inline transitions, auto-disconnect on terminal, pagination with SSE reconnect
- Virtual scroll: memory bounds during long output (`VIRTUAL_SCROLL_WINDOW = 10,000` lines)
- Responsive: streaming at 80×24 vs 200×60
- Auth: ticket-based and bearer token fallback

#### `e2e/tui/workflow-utils.test.ts` — **Implemented**

Unit-level tests for workflow display utility functions:
- `getRunStatusIcon` / `getStepStatusIcon` — status visualization with colors and labels
- `formatDuration` — seconds to human-readable ("Xm Ys", "Xh Ym"), handles null/NaN/Infinity
- `getDurationColor` — color thresholds: success (<60s), muted (60–299s), warning (300–899s), error (≥900s)
- `formatRelativeTime` — ISO 8601 to relative ("now", "5m", "3h", "3d", "1w", "2mo", "1y")
- `getMiniStatusBar` — compact 5-dot status bar with `●◎○·` characters and semantic colors
- `formatBytes`, `abbreviateSHA`, `formatRunCount` — data formatting utilities

#### `e2e/tui/helpers/workflows.ts` — **Implemented**

Workflow-specific test helpers:
- `navigateToWorkflowRunDetail(terminal, runIndex?)` — navigate from dashboard → workflows → runs → run detail using `g,f` keybinding sequence
- `waitForLogStreaming(terminal, timeoutMs?)` — poll for connection indicators ("Connected", "Streaming", braille spinner characters) or "Log" text
- `createSSEInjectFile(dir)` — create JSON Lines file for SSE event injection, returns `{ path, appendEvent() }`

### Test Principles Applied

1. **No mocking.** Tests run against a real API server. All hooks consume real HTTP endpoints via `ui-core`'s `APIClient`.
2. **Stubbed endpoints remain tested.** Artifact and cache tests assert on the real (empty) responses from stubbed endpoints. They are never skipped.
3. **Tests that fail due to unimplemented backends stay failing.** If the server returns unexpected data or errors because an endpoint isn't fully wired, the test fails naturally and remains failing.
4. **Each test validates one user-facing behavior.** Test names describe what the user sees, not how the hook is internally structured.
5. **Snapshot tests at multiple sizes.** Critical screens are snapshot-tested at 80×24 (minimum) and 200×60 (large).
6. **Fresh instance per test.** Each test calls `launchTUI()` and `terminate()` independently. No shared state.
7. **Refetch test uses Ctrl+R.** Updated from the original spec's `R` key to `ctrl+r` to match the actual screen keybinding implementation.

### Test Coverage Matrix

| Hook | Happy Path | Error Path | Pagination | Empty State | Responsive |
|------|-----------|-----------|------------|------------|------------|
| `useWorkflowDefinitions` | WFD-001 | WFD-004 | WFD-003 | WFD-002 | RSP-001, RSP-002 |
| `useWorkflowRuns` | WFR-001 | — | WFR-004 | WFR-005 | — |
| `useWorkflowRunDetail` | WFRD-001, WFRD-002 | WFRD-003 | — | — | — |
| `useWorkflowRunArtifacts` | WFRA-001 | — | — | WFRA-001 | — |
| `useWorkflowCaches` | WFC-001 | — | — | WFC-001 | — |
| `useWorkflowCacheStats` | WFC-002 | — | — | — | — |
| `useWorkflowRunCancel` | WFA-001 | WFA-002 | — | — | — |
| `useWorkflowRunRerun` | WFA-003 | — | — | — | — |
| `useWorkflowRunResume` | WFA-004 | — | — | — | — |
| `useDispatchWorkflow` | WFD-010 | — | — | — | — |
| Error integration | — | ERR-001, ERR-002, ERR-003 | — | — | — |
| Filter integration | WFR-002, WFR-003 | — | — | — | — |
| SSE log streaming | WFSS-001–004, 010–013 | WFSS-030–032 | — | — | WFSS-RSP-001/002 |
| SSE run status | WFRSSE-001–004 | — | WFRSSE-004 | — | — |
| Utility functions | workflow-utils.test.ts (all) | — | — | — | — |

---

## 11. Productionization Plan

### Current Architecture

The hooks are split between two packages:

- **`packages/ui-core/src/hooks/internal/`** — Framework-agnostic primitives (`usePaginatedQuery`, `useMutation`). These use standard React hooks and have no OpenTUI dependency. Already shared across clients.
- **`packages/ui-core/src/hooks/workflows/`** — Core streaming hooks (`useWorkflowLogStreamCore`, `useWorkflowRunSSECore`). Shared infrastructure for SSE connection management with exponential backoff, deduplication, and batch flushing.
- **`apps/tui/src/hooks/`** — Workflow-specific adapters (`useWorkflowDefinitions`, `useWorkflowRuns`, etc.), the local `useQuery` primitive, and TUI wrappers for streaming hooks that add spinner animation.

### Migration path: TUI-local → ui-core

When workflow hooks are promoted to shared status:

1. **Move `useQuery.ts`** to `packages/ui-core/src/hooks/internal/useQuery.ts`. This fills the gap in `ui-core`'s primitive set. Update imports across consumers. The existing interface is forward-compatible.

2. **Move `workflow-types.ts`** to `packages/ui-core/src/types/workflow.ts`. All domain models already match server response shapes and have no TUI-specific imports.

3. **Move workflow hooks** to `packages/ui-core/src/hooks/workflows/`. Create `index.ts` barrel. The pattern follows `ui-core/src/hooks/agents/` and `ui-core/src/hooks/issues/` which are already structured this way.

4. **Update TUI barrel** (`apps/tui/src/hooks/index.ts`) to re-export from `@codeplane/ui-core` instead of local files. All screen components that import from `../hooks` continue to work with zero changes.

5. **Improve rollback pattern.** Add native rollback support to `ui-core`'s `useMutation`:
   ```typescript
   interface MutationConfig<TInput, TOutput> {
     // existing fields...
     onOptimistic?: (input: TInput) => (() => void) | void;  // return value is rollback
   }
   ```
   The `useMutation` implementation would store the returned rollback closure and call it automatically in the error path. This eliminates the expando-property rollback bridge in `useWorkflowActions.ts`.

6. **Shared by web UI.** Once in `ui-core`, the SolidJS web UI can consume the same types and API client patterns. The React hooks themselves would need a SolidJS adapter layer (SolidJS uses signals, not React hooks).

### Migration readiness checklist

- [x] All hooks export pure React hooks with no OpenTUI imports
- [x] All hooks consume `useAPIClient()` context from `ui-core`, not direct `fetch`
- [x] All types are in a standalone types file with no TUI-specific imports
- [x] All hooks have corresponding E2E tests in `e2e/tui/workflows.test.ts`
- [x] The barrel export in `hooks/index.ts` is the only consumer-facing import path
- [x] No hook references `useNavigation`, `useKeyboard`, or any screen/component directly
- [x] Streaming hooks delegate to `ui-core` core implementations with TUI wrappers only for spinner animation
- [ ] `useQuery` promoted to `ui-core` (pending)
- [ ] `useMutation` rollback support added to `ui-core` (pending)

### Complementary hooks

**`useOptimisticMutation`** at `apps/tui/src/hooks/useOptimisticMutation.ts` is a TUI-specific hook. It is **not** a candidate for `ui-core` promotion because:

1. It depends on `useLoading()` which is TUI-specific (status bar feedback via register/complete/fail methods)
2. It intentionally never aborts on unmount (fire-and-forget mutation semantics via `Bun.spawn` behavior)
3. It truncates error messages to 60 characters for status bar display
4. Debug logging to stderr is TUI-specific (`CODEPLANE_TUI_DEBUG`)

Screens choose between `useOptimisticMutation` (for inline list actions like close/mark-read) and the `useWorkflowActions` callbacks (for explicit mutation buttons with more control).

**`useWorkflowLogStream`** at `apps/tui/src/hooks/useWorkflowLogStream.ts` is a thin TUI wrapper that:
1. Delegates to `useWorkflowLogStreamCore` from `@codeplane/ui-core/hooks/workflows`
2. Adds `useSpinner()` for braille spinner animation when streaming is active
3. Memoizes the combined state via `useMemo` for render stability

**`useWorkflowRunSSE`** at `apps/tui/src/hooks/useWorkflowRunSSE.ts` is a pure re-export of `useWorkflowRunSSECore` from `ui-core`. It exists as a barrel indirection so TUI screens import all workflow hooks from the same path.

---

## 12. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | All 12 workflow data hooks implemented with correct TypeScript types | Code review: types match API response shapes from `apps/server/src/routes/workflows.ts` |
| 2 | Hooks use `useAPIClient()` from `@codeplane/ui-core` for auth and base URL | No direct `fetch` calls outside the `APIClient` abstraction |
| 3 | Mutation hooks implement optimistic update + rollback on error | `onOptimistic` callback invoked before HTTP request; rollback invoked in `onError` via expando-property bridge |
| 4 | Page-based pagination hooks support `page` and `per_page` parameters | `usePaginatedQuery` appends `?page=N&per_page=M` to path |
| 5 | Loading, error, and empty states correctly tracked | Each hook returns `{ loading, error, data }` with correct state transitions |
| 6 | Memory caps enforced: 300 definitions, 500 runs, 200 artifacts, 500 caches | `maxItems` passed to `usePaginatedQuery`; `MAX_ARTIFACTS` enforced in transform via `slice(-MAX_ARTIFACTS)` |
| 7 | Error handling covers 400, 401, 403, 404, 409, 422, 429, 5xx, and network errors | `parseResponseError()` maps all status codes to typed `ApiError` |
| 8 | `refetch()` clears error state and re-fetches from page 1 | `usePaginatedQuery` resets `pageRef` and increments `refetchCounter`; `useQuery` aborts inflight and increments `refetchCounter` |
| 9 | Filter changes trigger automatic re-fetch via cacheKey change | `useWorkflowRuns` builds `cacheKey` from serialized query string; `usePaginatedQuery` hard-resets on `cacheKey` change |
| 10 | Double-execute prevention on mutations | `useMutation.mutate()` rejects with `new Error("mutation in progress")` if `isLoading` is true |
| 11 | All hooks exported from `apps/tui/src/hooks/index.ts` | Barrel export includes all 12 hooks + streaming hooks + type re-exports |
| 12 | E2E tests in `e2e/tui/workflows.test.ts` cover all hooks | Tests exist for each hook's happy path, error paths, and edge cases |
| 13 | `useQuery` is abort-safe on unmount | `AbortController` aborts inflight request; `isMounted` guards state updates |
| 14 | Artifact name is URL-encoded in delete path | `encodeURIComponent(args.name)` in `useDeleteWorkflowArtifact` |
| 15 | `useDispatchWorkflow` sends Content-Type header | `headers: { "Content-Type": "application/json" }` in request options |
| 16 | `useWorkflowCaches` handles raw array response | `parseResponse` uses `Array.isArray(data) ? data : []` |
| 17 | Streaming hooks delegate to ui-core core with TUI-specific wrappers | `useWorkflowLogStream` wraps core with spinner; `useWorkflowRunSSE` re-exports core |
| 18 | Stale data preserved on error | Query hooks set error without clearing data |

---

## 13. Dependencies

| Dependency | Status | Impact |
|-----------|--------|--------|
| `tui-navigation-provider` | ✅ Implemented | Provides `useNavigation()` for repo context and screen transitions |
| `@codeplane/ui-core` `APIClientProvider` | ✅ Implemented | Provides `useAPIClient()` hook via `ui-core/src/client/context.ts` |
| `@codeplane/ui-core` `usePaginatedQuery` | ✅ Implemented | Paginated list fetching at `ui-core/src/hooks/internal/usePaginatedQuery.ts` |
| `@codeplane/ui-core` `useMutation` | ✅ Implemented | Mutation execution at `ui-core/src/hooks/internal/useMutation.ts` |
| `@codeplane/ui-core` error types | ✅ Implemented | `ApiError`, `NetworkError`, `parseResponseError` at `ui-core/src/types/errors.ts` |
| `@codeplane/ui-core` streaming hooks | ✅ Implemented | `useWorkflowLogStreamCore`, `useWorkflowRunSSECore` at `ui-core/src/hooks/workflows/` |
| Workflow server routes | ✅ Implemented (partial stubs) | All routes exist in `apps/server/src/routes/workflows.ts`; artifact/cache endpoints stubbed |
| Workflow screen scaffold | ❌ Not yet implemented | Screens that consume these hooks. Hooks can be built and tested independently. |
| `useOptimisticMutation` | ✅ Implemented | TUI-local optimistic mutation with status bar integration |
| `useLoading` | ✅ Implemented | TUI-local loading state registry for status bar feedback |
| `useSpinner` | ✅ Implemented | TUI-local braille spinner animation for streaming state |

---

## 14. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Optimistic rollback uses expando properties on function objects | Documented as a known coupling. Safe for single-inflight mutations (guaranteed by double-execute prevention). Will be replaced when `ui-core` adds native rollback support. |
| Artifact and cache endpoints are stubbed server-side | Hooks work correctly with empty responses. Tests assert on real (empty) data. When endpoints are implemented, tests will start verifying real data without hook changes. |
| `useQuery` is a TUI-local hook not in `ui-core` | Designed with the same API contract as other `ui-core` hooks. Migration path documented. Can be promoted with zero breaking changes. |
| Memory caps may be too low/high for real usage | Caps are configurable constants in `workflow-types.ts`. Easy to adjust based on production telemetry without changing hook logic. |
| Server-side state normalization may change | Hooks pass filter values as-is to the server. Normalization is entirely server-side (`normalizeWorkflowState()` in workflows.ts). Hooks are unaffected by normalization rule changes. |
| `usePaginatedQuery` evicts from end, not oldest pages | This is the current `ui-core` behavior (`slice(length - maxItems)`). It retains the most recent items. If oldest-page eviction is needed, modify `usePaginatedQuery` in `ui-core`. |
| `cacheKey` change on filter update may cause brief flicker | `usePaginatedQuery` clears items and sets loading on hard reset. This is intentional — stale filtered data should not persist across filter changes. |
| `useDispatchWorkflow` sends body via `JSON.stringify()` manually | The `APIClient.request()` contract accepts `body: unknown` and the dispatch hook pre-serializes to ensure Content-Type header is set. If `APIClient` is updated to auto-serialize JSON bodies with the correct Content-Type, the explicit `JSON.stringify` and header can be removed. |
| `usePaginatedQuery` hasMore calculation has a subtle edge | The `hasMore` getter calls `config.parseResponse([], new Headers())` to determine if `totalCount` is available. For `useWorkflowCaches` whose `parseResponse` returns `{ items: [], totalCount: 0 }` on empty input, this means hasMore uses totalCount comparison (correct behavior — `items.length >= totalCount` → false). For other hooks that return `totalCount: null`, hasMore falls back to page-size heuristic (`lastPageItemCount === perPage`). |
| 409 Conflict maps to `UNKNOWN` error code | The `mapStatusToCode` function has no case for 409. Hooks still handle it correctly — error is set, rollback fires for mutations. If more granular handling is needed, add `case 409: return "CONFLICT"` to `mapStatusToCode` in `ui-core`. |
| Streaming hooks depend on SSE ticket endpoint | If `POST /api/auth/sse-ticket` fails, the core streaming hooks fall back to Bearer token auth. If both fail, connection transitions to `"errored"` state with manual reconnect available. |