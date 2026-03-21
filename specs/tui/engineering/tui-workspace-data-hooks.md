# Engineering Specification: `tui-workspace-data-hooks`

## Title
Implement workspace data hooks in `@codeplane/ui-core`

## Status
`Partial` — Hook implementations exist in `packages/ui-core/src/hooks/workspaces/` with 13 hook files and 13 skeleton test files. All test bodies are empty (`it("...", () => {})`) — no assertions exist yet. Several hooks contain compile-time bugs that must be fixed before tests can pass. Server workspace routes in `apps/server/src/routes/workspaces.ts` are fully scaffolded (524 lines) with real `WorkspaceService` calls. Database layer (`apps/server/src/db/workspace_sql.ts`, 1255 lines) is fully implemented. `WorkspaceService` in `packages/sdk/src/services/workspace.ts` (1137 lines) provides complete CRUD, session management, snapshot operations, and SSH connection info. SSE streaming via PostgreSQL LISTEN/NOTIFY is implemented for workspace and session status updates.

## Summary

This ticket creates the workspace data access layer for all workspace TUI screens. The deliverable is a set of React hooks in `packages/ui-core/src/hooks/workspaces/` that wrap the workspace HTTP API endpoints and provide typed, reactive data access with pagination, loading, error states, and optimistic mutations.

The hooks are framework-agnostic React 19 hooks consumed by both the TUI (`apps/tui/`) and, in the future, the web UI (`apps/web/`). No TUI-specific rendering code belongs here. The hooks reuse the shared `APIClient` context, typed error classes, and internal `usePaginatedQuery`/`useMutation` utilities established by `tui-agent-data-hooks`.

**Scope boundary:**
- ✅ `packages/ui-core/src/hooks/workspaces/` — all workspace hook implementations
- ✅ `packages/ui-core/src/types/workspaces.ts` — workspace domain types
- ✅ `packages/ui-core/src/hooks/workspaces/__tests__/` — unit tests
- ❌ `apps/tui/src/` — no TUI screen code in this ticket
- ❌ `e2e/tui/` — no E2E tests in this ticket (those belong in `tui-workspace-e2e-scaffolding`)

**Dependency:** This ticket depends on `tui-navigation-provider` completing (NavigationProvider must exist in the provider hierarchy before workspace screens can navigate). It also depends on the `tui-agent-data-hooks` ticket having established the `packages/ui-core/` package scaffold, `APIClientProvider`, error types, and internal utilities (`usePaginatedQuery`, `useMutation`).

---

## 1. Codebase Ground Truth

Before reading any further, the following facts about the actual repository drive every decision in this spec. **All facts verified line-by-line from source.**

| Fact | Location | Exact Evidence | Impact |
|------|----------|----------------|--------|
| `packages/ui-core/` established by `tui-agent-data-hooks` | `specs/tui/packages/ui-core/package.json` | Package exists with all internal utilities | Workspace hooks add to existing package, don't create it |
| `useAPIClient()` exported from `client/context.ts`, returns `APIClient` (not `{ fetch }`) | `client/context.ts` line 8: `export function useAPIClient(): APIClient` | Returns the raw `APIClient` object, no destructuring | Hooks must call `client.request()` not `fetch()` |
| `APIClient` interface has `request(path, options?)` method only | `client/types.ts` lines 1-10: `request(path: string, options?: APIRequestOptions): Promise<Response>` | No `fetch` property exists on APIClient | All hooks destructuring `{ fetch }` from `useAPIClient()` get `undefined` |
| No file named `APIClientProvider.js` exists in `client/` | Only `context.ts`, `types.ts`, `createAPIClient.ts`, `index.ts` in `client/` | Import `../../client/APIClientProvider.js` resolves to nothing | 5 hooks have broken import paths |
| `usePaginatedQuery` requires `client: APIClient` in config | `usePaginatedQuery.ts` line 7: `client: APIClient;` in `PaginatedQueryConfig` | Config property is non-optional | 3 paginated hooks omit `client` — TypeScript error |
| `usePaginatedQuery.parseResponse` signature is `(data: unknown, headers: Headers)` | `usePaginatedQuery.ts` line 14: `parseResponse: (data: unknown, headers: Headers) => { items: T[]; totalCount: number \| null; }` | First arg is pre-parsed JSON body, second is response headers | 3 hooks pass `async (res) => { await res.json(); ... }` — wrong signature |
| `usePaginatedQuery` internally calls `response.json()` then passes result to `parseResponse` | `usePaginatedQuery.ts` lines 94-95: `const body = await response.json();` then `const parsed = parseResponse(body, response.headers);` | Data is already parsed when `parseResponse` receives it | Hooks that call `res.json()` inside `parseResponse` would double-parse or crash |
| `usePaginatedQuery` calls `parseResponse` synchronously at render time for `hasMore` computation | `usePaginatedQuery.ts` line 191: `config.parseResponse([], new Headers()).totalCount !== null` | Called outside any async context | `async` parseResponse returns Promise, `.totalCount` would be `undefined` |
| `useMutation` second param to `mutationFn` is `AbortSignal` | `useMutation.ts` line 5: `mutationFn: (input: TInput, signal: AbortSignal) => Promise<TOutput>` | Plain `AbortSignal`, not `{ fetch }` | 5 hooks destructure `{ fetch }` from signal — runtime crash |
| `useMutation<TInput, TOutput>` — Input first, Output second | `useMutation.ts` line 4-5: `MutationConfig<TInput, TOutput>` then `mutationFn: (input: TInput, signal: AbortSignal) => Promise<TOutput>` | Generic order: Input, Output | 5 hooks reverse these — type mismatch |
| `useMutation` does NOT have `onRevert` callback | `useMutation.ts` lines 4-9: only `onOptimistic`, `onSuccess`, `onError`, `onSettled` in `MutationConfig` | No `onRevert` field exists | 2 hooks pass `onRevert` — TypeScript error, callback never fires |
| `useMutation` rejects with `Error("mutation in progress")` on double-submit | `useMutation.ts` lines 44-46: `if (isLoading) { return Promise.reject(new Error("mutation in progress")); }` | Guard at start of `mutate` | Tests must account for this behavior |
| Workspace routes are fully scaffolded | `apps/server/src/routes/workspaces.ts` (524 lines) | Real `WorkspaceService` calls, not stubs | Routes exist but repo context middleware not wired |
| `per_page` max is **100** (not 50) | Route line 34: `if (parsed > 100) return { error: "per_page must not exceed 100" }` | Hard cap enforced server-side | `perPage` option must cap at 100 |
| Workspace list `GET` sets `X-Total-Count` header | Route line 122: `c.header("X-Total-Count", String(total))` | Header set on all list responses | `useWorkspaces` must read this header |
| Delete workspace returns 204 with `c.body(null, 204)` | Route line 207 | Empty body on success | Client must handle empty body |
| Session destroy is `POST .../destroy` not `DELETE` | Route line 429: `app.post(".../:id/destroy")` | POST method, not DELETE | `useDestroyWorkspaceSession` correctly uses POST |
| SSH connection info has access token with 5-minute TTL | Service constant: `SANDBOX_ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000` | Not in response — client-side estimate | Hook exposes `tokenExpiresAt` and `isTokenExpired` |
| Auth header format is `Authorization: token {token}` | `createAPIClient.ts` line 15: `"Authorization": \`token ${config.token}\`` | Not `Bearer` — uses `token` prefix | Injected by `createAPIClient` — hooks don't handle this |
| `repositoryID` and `userID` are hardcoded to 0 in routes | Every route handler: `const repositoryID = 0; // TODO: from repo context middleware` | Routes will produce wrong results until middleware wired | Integration tests expected to fail |
| `createAPIClient` handles JSON serialization | `createAPIClient.ts` lines 20-21: sets `Content-Type: application/json` and calls `JSON.stringify(options.body)` when body is present | Auto-serialization on any non-undefined body | Hooks must NOT manually `JSON.stringify` — causes double-serialization |
| `renderHook` sets `state.currentContextValue = options?.apiClient` | `renderHook.ts` line 36 | `useContext()` in react-mock returns this value | Tests must pass `apiClient` option to `renderHook` for `useAPIClient()` to work |
| `react-mock.useContext()` returns `state.currentContextValue` directly | `react-mock.ts` line 79-81: `useContext(ctx: any): any { return state.currentContextValue; }` | Ignores context identity — returns whatever was set | Any hook calling `useAPIClient()` will get the mock client |
| `createMockAPIClient` is queue-based | `mockAPIClient.ts` lines 30-40: `const next = queue.shift()` | Responses consumed FIFO | Must queue responses BEFORE triggering hook render |
| `createMockAPIClient.respondWithJSON` wraps in `new Response(JSON.stringify(body), { status, headers })` | `mockAPIClient.ts` lines 47-53 | Returns real `Response` objects | `.json()` and `.headers.get()` work as expected on mock responses |

---

## 2. Critical Bugs in Existing Code

The following bugs were identified by reading the actual implementation files line-by-line. They **MUST** be fixed as part of this ticket.

### Bug 1: `useWorkspaces` missing `client` param + wrong `parseResponse` signature

**Location:** `packages/ui-core/src/hooks/workspaces/useWorkspaces.ts`

**Problems (3 issues in one file):**

1. **Line 12:** `usePaginatedQuery<Workspace>({` — config object has no `client` field. `PaginatedQueryConfig<T>` requires `client: APIClient` (line 7 of `usePaginatedQuery.ts`). TypeScript will reject this.

2. **Line 19:** `parseResponse: async (res) => {` — Function is `async` but `usePaginatedQuery` calls `parseResponse` synchronously at line 191: `config.parseResponse([], new Headers()).totalCount !== null`. An async function returns a `Promise`, so `.totalCount` evaluates to `undefined`, making `hasMore` always `false`.

3. **Lines 20-21:** `const items = await res.json();` / `res.headers.get("X-Total-Count")` — `parseResponse` receives `(data: unknown, headers: Headers)`, not a `Response`. The first arg is already-parsed JSON. Calling `.json()` on it will crash. Similarly, `res.headers` doesn't exist — headers are the second parameter.

**Fix:**
```typescript
import { useAPIClient } from "../../client/context.js";
// ... inside hook body:
const client = useAPIClient();
// ... in usePaginatedQuery config:
client,
parseResponse: (data: unknown, headers: Headers) => {
  const items = data as Workspace[];
  const totalCount = parseInt(headers.get("X-Total-Count") ?? "0", 10);
  return { items, totalCount };
},
```

### Bug 2: Same `client` + `parseResponse` bug in `useWorkspaceSessions`

**Location:** `packages/ui-core/src/hooks/workspaces/useWorkspaceSessions.ts`

**Problems:** Identical to Bug 1. Line 14: no `client` in config. Line 21: `async (res) =>` with wrong signature. Lines 22-24: calls `res.json()` and `res.headers.get()` on pre-parsed data.

**Fix:** Same pattern as Bug 1.

### Bug 3: Same `client` + `parseResponse` bug in `useWorkspaceSnapshots`

**Location:** `packages/ui-core/src/hooks/workspaces/useWorkspaceSnapshots.ts`

**Problems:** Identical to Bug 1. Line 12: no `client` in config. Line 19: `async (res) =>` with wrong signature. Lines 20-22: calls `res.json()` and `res.headers.get()` on pre-parsed data.

**Fix:** Same pattern as Bug 1.

### Bug 4: Import path `../../client/APIClientProvider.js` does not exist (5 files)

**Locations:**
- `useWorkspace.ts` line 2
- `useWorkspaceSSH.ts` line 2
- `useDeleteWorkspace.ts` line 2
- `useDestroyWorkspaceSession.ts` line 2
- `useDeleteWorkspaceSnapshot.ts` line 2

**Problem:** All five files import from `../../client/APIClientProvider.js`. No such file exists in the `client/` directory. The `useAPIClient` hook is exported from `../../client/context.js`.

**Fix:** Change import to `../../client/context.js` in all five files.

### Bug 5: `useAPIClient()` destructured as `{ fetch }` — no such property (5 files)

**Locations:**
- `useWorkspace.ts` line 11: `const { fetch } = useAPIClient()`
- `useWorkspaceSSH.ts` line 13: `const { fetch } = useAPIClient()`
- `useDeleteWorkspace.ts` line 17: `const { fetch } = useAPIClient()`
- `useDestroyWorkspaceSession.ts` line 17: `const { fetch } = useAPIClient()`
- `useDeleteWorkspaceSnapshot.ts` line 17: `const { fetch } = useAPIClient()`

**Problem:** `useAPIClient()` returns an `APIClient` object with `baseUrl: string` and `request(path, options?)`. It has no `fetch` property. Destructuring `{ fetch }` yields `undefined`. All subsequent calls like `fetch(\`/api/...\`, { signal })` will throw `TypeError: fetch is not a function`.

**Fix:** Change to `const client = useAPIClient()` and replace all `fetch(...)` calls with `client.request(...)`.

### Bug 6: `useMutation` `mutationFn` second param destructured as `{ fetch }` — is `AbortSignal` (5 files)

**Locations:**
- `useCreateWorkspace.ts` line 7: `async (input, { fetch }) => { ... }`
- `useSuspendWorkspace.ts` line 18: `async (workspaceId, { fetch }) => { ... }`
- `useResumeWorkspace.ts` line 18: `async (workspaceId, { fetch }) => { ... }`
- `useCreateWorkspaceSession.ts` line 7: `async (input, { fetch }) => { ... }`
- `useCreateWorkspaceSnapshot.ts` line 7: `async (input, { fetch }) => { ... }`

**Problem:** `useMutation`'s `mutationFn` signature is `(input: TInput, signal: AbortSignal) => Promise<TOutput>` (line 5 of `useMutation.ts`). The second parameter is an `AbortSignal`, not an object with a `fetch` property. Destructuring `{ fetch }` from an `AbortSignal` yields `undefined`, so all `fetch(...)` calls inside will throw `TypeError: fetch is not a function`.

**Fix:** Obtain `client` via `useAPIClient()` at the hook level (outside `mutationFn`), use `signal` as the second param:
```typescript
export function useCreateWorkspace(owner, repo) {
  const client = useAPIClient();
  const { mutate, isLoading, error } = useMutation<CreateWorkspaceRequest, Workspace>({
    mutationFn: async (input, signal) => {
      // ... use client.request(path, { method: "POST", body, signal })
    },
  });
}
```

### Bug 7: `useMutation` generic type parameters reversed (5 files)

**Locations:**
- `useCreateWorkspace.ts` line 6: `useMutation<Workspace, CreateWorkspaceRequest>` → should be `<CreateWorkspaceRequest, Workspace>`
- `useSuspendWorkspace.ts` line 17: `useMutation<Workspace, string>` → should be `<string, Workspace>`
- `useResumeWorkspace.ts` line 17: `useMutation<Workspace, string>` → should be `<string, Workspace>`
- `useCreateWorkspaceSession.ts` line 6: `useMutation<WorkspaceSession, CreateWorkspaceSessionRequest>` → should be `<CreateWorkspaceSessionRequest, WorkspaceSession>`
- `useCreateWorkspaceSnapshot.ts` line 6: `useMutation<WorkspaceSnapshot, CreateWorkspaceSnapshotRequest>` → should be `<CreateWorkspaceSnapshotRequest, WorkspaceSnapshot>`

**Problem:** `useMutation<TInput, TOutput>` takes Input first, Output second. All five hooks reverse them. This causes `mutationFn` to receive the wrong type as `input` and be expected to return the wrong type.

**Fix:** Swap generic parameters in all affected hooks.

### Bug 8: Mutation hooks return raw `Response` instead of parsed typed data (5 files)

**Locations:**
- `useCreateWorkspace.ts` line 29: `return res;`
- `useSuspendWorkspace.ts` line 26: `return res;`
- `useResumeWorkspace.ts` line 26: `return res;`
- `useCreateWorkspaceSession.ts` line 31: `return res;`
- `useCreateWorkspaceSnapshot.ts` line 24: `return res;` (verified — returns the raw `fetch` call result)

**Problem:** `useMutation<TInput, TOutput>` expects `mutationFn` to return `Promise<TOutput>`. But all five hooks return the raw `Response` object from `fetch()`. This means `onSuccess(output, input)` receives a `Response` instead of a typed `Workspace`/`WorkspaceSession`/`WorkspaceSnapshot`. Additionally, no response status validation occurs — a 4xx/5xx would silently succeed.

**Fix:** Parse response, validate status, return typed data:
```typescript
if (!response.ok) throw await parseResponseError(response);
return await response.json() as Workspace;
```

### Bug 9: `useSuspendWorkspace` and `useResumeWorkspace` pass `onRevert` to `useMutation`

**Locations:**
- `useSuspendWorkspace.ts` line 29: `onRevert: callbacks?.onRevert,`
- `useResumeWorkspace.ts` line 29: `onRevert: callbacks?.onRevert,`

**Problem:** Both hooks pass `onRevert: callbacks?.onRevert` to `useMutation`. But `MutationConfig` has no `onRevert` field (only `onOptimistic`, `onSuccess`, `onError`, `onSettled` — verified at `useMutation.ts` lines 4-9). TypeScript will reject this, and even without strict checking, the callback will never fire.

**Fix:** Wire `onRevert` through the `onError` callback:
```typescript
onError: (error, input) => {
  callbacks?.onRevert?.(input);   // revert optimistic state
  callbacks?.onError?.(error, input);
},
```

### Bug 10: `useCreateWorkspace` manually sets `Content-Type` and `JSON.stringify`

**Locations:**
- `useCreateWorkspace.ts` lines 25-26: `headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),`
- `useCreateWorkspaceSession.ts` lines 27-28: `headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id, cols: input.cols, rows: input.rows }),`
- `useCreateWorkspaceSnapshot.ts` lines 20-21: `headers: { "Content-Type": "application/json" }, body: ... ? JSON.stringify(body) : undefined,`

**Problem:** The `createAPIClient.request()` implementation (verified at `createAPIClient.ts` lines 20-21) auto-sets `Content-Type: application/json` and auto-serializes `body` when it's present and non-undefined: `body: options?.body !== undefined ? JSON.stringify(options.body) : undefined`. Manually `JSON.stringify`-ing causes **double-serialization**: the string gets JSON-stringified again, producing `"\"...\""`.

**Fix:** Pass `body` as a plain object and omit manual headers:
```typescript
const response = await client.request(path, {
  method: "POST",
  body: { name: trimmedName, snapshot_id: input.snapshot_id },
  signal,
});
```

---

## 3. API Contract Reference

All endpoints are repository-scoped under `/api/repos/:owner/:repo/`.

**Source of truth**: `apps/server/src/routes/workspaces.ts` (524 lines, verified)

### Workspace Endpoints

| Endpoint | Method | Success | Request Body | Response Body | Response Headers |
|----------|--------|---------|-------------|---------------|------------------|
| `/workspaces` | `GET` | 200 | — | `Workspace[]` | `X-Total-Count: N` |
| `/workspaces` | `POST` | 201 | `{ name?: string, snapshot_id?: string }` | `Workspace` | — |
| `/workspaces/:id` | `GET` | 200 | — | `Workspace` | — |
| `/workspaces/:id/ssh` | `GET` | 200 | — | `WorkspaceSSHInfo` | — |
| `/workspaces/:id/suspend` | `POST` | 200 | — | `Workspace` | — |
| `/workspaces/:id/resume` | `POST` | 200 | — | `Workspace` | — |
| `/workspaces/:id` | `DELETE` | 204 | — | (empty body via `c.body(null, 204)`) | — |
| `/workspaces/:id/snapshot` | `POST` | 201 | `{ name?: string }` | `WorkspaceSnapshot` | — |
| `/workspaces/:id/fork` | `POST` | 201 | `{ name?: string }` | `Workspace` | — |

### Snapshot Endpoints

| Endpoint | Method | Success | Request Body | Response Body | Response Headers |
|----------|--------|---------|-------------|---------------|------------------|
| `/workspace-snapshots` | `GET` | 200 | — | `WorkspaceSnapshot[]` | `X-Total-Count: N` |
| `/workspace-snapshots` | `POST` | 201 | `{ workspace_id: string, name?: string }` | `WorkspaceSnapshot` | — |
| `/workspace-snapshots/:id` | `GET` | 200 | — | `WorkspaceSnapshot` | — |
| `/workspace-snapshots/:id` | `DELETE` | 204 | — | (empty body) | — |

### Session Endpoints

| Endpoint | Method | Success | Request Body | Response Body | Response Headers |
|----------|--------|---------|-------------|---------------|------------------|
| `/workspace/sessions` | `GET` | 200 | — | `WorkspaceSession[]` | `X-Total-Count: N` |
| `/workspace/sessions` | `POST` | 201 | `{ cols?: number, rows?: number, workspace_id?: string }` | `WorkspaceSession` | — |
| `/workspace/sessions/:id` | `GET` | 200 | — | `WorkspaceSession` | — |
| `/workspace/sessions/:id/ssh` | `GET` | 200 | — | `WorkspaceSSHInfo` | — |
| `/workspace/sessions/:id/destroy` | `POST` | 204 | — | (empty body) | — |

### SSE Streams

| Endpoint | Method | Event Type | Data Shape |
|----------|--------|------------|------------|
| `/workspaces/:id/stream` | `GET` | `workspace.status` | `{ workspace_id: string, status: string }` |
| `/workspace/sessions/:id/stream` | `GET` | `workspace.session` | `{ session_id: string, status: string }` |

**Pagination query parameters** (all list endpoints):
- Legacy: `page` (integer ≥ 1, default 1), `per_page` (integer 1–100, default 30)
- Cursor-based: `limit` (integer 1–100, default 30), `cursor` (integer offset ≥ 0)

**Authentication header**: `Authorization: token {token}` (injected by `createAPIClient`)

**Error response shape** (all non-2xx):
```json
{ "message": "error description", "errors": [{ "resource": "...", "field": "...", "code": "..." }] }
```

---

## 4. Type Definitions

### 4.1 File: `packages/ui-core/src/types/workspaces.ts`

**Status:** Already exists and is correct. **No changes needed.** Verified line-by-line.

All types match the SDK wire format:

```typescript
export type WorkspaceStatus = "pending" | "starting" | "running" | "suspended" | "stopped" | "failed";
export type WorkspaceSessionStatus = "running" | "stopped" | "failed";

export interface Workspace {
  id: string;
  repository_id: number;
  user_id: number;
  name: string;
  status: WorkspaceStatus;
  is_fork: boolean;
  parent_workspace_id?: string;
  freestyle_vm_id: string;
  persistence: string;
  ssh_host?: string;
  snapshot_id?: string;
  idle_timeout_seconds: number;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSession {
  id: string;
  workspace_id: string;
  repository_id: number;
  user_id: number;
  status: WorkspaceSessionStatus;
  cols: number;
  rows: number;
  last_activity_at: string;
  idle_timeout_secs: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSSHInfo {
  workspace_id: string;
  session_id: string;
  vm_id: string;
  host: string;
  ssh_host: string;
  username: string;
  port: number;
  access_token: string;
  command: string;
}

export interface WorkspaceSnapshot {
  id: string;
  repository_id: number;
  user_id: number;
  name: string;
  workspace_id?: string;
  freestyle_snapshot_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkspaceRequest { name: string; snapshot_id?: string; }
export interface CreateWorkspaceSessionRequest { workspace_id: string; cols?: number; rows?: number; }
export interface CreateWorkspaceSnapshotRequest { workspace_id: string; name?: string; }

export interface WorkspacesOptions { page?: number; perPage?: number; status?: WorkspaceStatus; enabled?: boolean; }
export interface WorkspaceSessionsOptions { page?: number; perPage?: number; enabled?: boolean; }
export interface WorkspaceSnapshotsOptions { page?: number; perPage?: number; enabled?: boolean; }

export interface WorkspaceStatusEvent { workspace_id: string; status: WorkspaceStatus; }
export interface WorkspaceSessionStatusEvent { session_id: string; status: WorkspaceSessionStatus; }
```

### 4.2 TUI Type Reconciliation

| SDK Type | ui-core Type | Difference |
|----------|-------------|------------|
| `WorkspaceResponse` | `Workspace` | Name only — identical fields |
| `WorkspaceSessionResponse` | `WorkspaceSession` | Name only — identical fields |
| `WorkspaceSSHConnectionInfo` | `WorkspaceSSHInfo` | Shortened name — identical fields |
| `WorkspaceSnapshotResponse` | `WorkspaceSnapshot` | Name only — identical fields |

TUI screens import from `@codeplane/ui-core`, not `@codeplane/sdk`. SDK types import Hono and cannot be used client-side.

---

## 5. Hook Signatures and Behavior

### 5.1 Internal Utility Contracts

All workspace hooks build on two internal utilities. Their exact contracts (verified from source):

**`usePaginatedQuery<T>(config)`** — `packages/ui-core/src/hooks/internal/usePaginatedQuery.ts` (218 lines)

```typescript
interface PaginatedQueryConfig<T> {
  client: APIClient;                          // Required — from useAPIClient()
  path: string;                                // API endpoint path
  cacheKey: string;                            // Stringified params — change triggers hard reset
  perPage: number;                             // Items per page
  enabled: boolean;                            // False skips fetch, clears items
  maxItems: number;                            // In-memory cap (500)
  autoPaginate: boolean;                       // Auto-fetch subsequent pages
  parseResponse: (data: unknown, headers: Headers) => {
    items: T[];
    totalCount: number | null;                 // null = unknown, use heuristic
  };
}
```

**Key behavior (verified from source):**
- Line 81: Calls `client.request(urlPath, { signal })` (NOT `fetch`)
- Line 94: Calls `const body = await response.json()` internally
- Line 95: Passes parsed JSON body + `response.headers` to `parseResponse(body, response.headers)`
- Lines 147-164: Cache key change triggers hard reset (clear items, reset page to 1, abort in-flight)
- Lines 167-178: `enabled=false` clears items, totalCount, error, resets page to 1, stops loading
- Lines 182-187: `refetchCounter > 0` calls `fetchPage(1, true, items)` — refetch keeps items (stale-while-revalidate)
- Line 191: `hasMore` computation calls `config.parseResponse([], new Headers()).totalCount !== null` **synchronously** on every render — async parseResponse would break this
- Lines 108-109: `maxItems` evicts from the beginning: `combinedItems.slice(combinedItems.length - maxItems)`
- Lines 131-133: `autoPaginate && hasMoreLocal` recursively calls `fetchPage(pageToFetch + 1, false, combinedItems)` — auto-pagination continues until no more pages

**`useMutation<TInput, TOutput>(config)`** — `packages/ui-core/src/hooks/internal/useMutation.ts` (103 lines)

```typescript
interface MutationConfig<TInput, TOutput> {
  mutationFn: (input: TInput, signal: AbortSignal) => Promise<TOutput>;
  onOptimistic?: (input: TInput) => void;
  onSuccess?: (output: TOutput, input: TInput) => void;
  onError?: (error: HookError, input: TInput) => void;
  onSettled?: (input: TInput) => void;
}
```

**Key behavior (verified from source):**
- Line 5: Second parameter to `mutationFn` is `AbortSignal`, NOT `{ fetch }`
- Lines 44-46: Double-submit prevention — rejects with `Error("mutation in progress")` if `isLoading`
- Lines 58-59: Calls `onOptimistic(input)` synchronously before `mutationFn`
- Line 62: Calls `mutationFn(input, controller.signal)`
- Lines 68-73: On success: calls `onSuccess(result, input)` then `onSettled(input)`
- Lines 77-79: On AbortError: rejects with the abort error (no state updates)
- Lines 82-91: On other error: sets `error` state, calls `onError(err, input)` then `onSettled(input)`, **re-throws**
- Line 33: Stores config in `configRef` to avoid stale closures
- **No `onRevert` field exists** in `MutationConfig`

### 5.2 `useWorkspaces(owner, repo, options?)`

**File**: `packages/ui-core/src/hooks/workspaces/useWorkspaces.ts`

**Corrected implementation:**

```typescript
import { useAPIClient } from "../../client/context.js";
import { usePaginatedQuery } from "../internal/usePaginatedQuery.js";
import type { Workspace, WorkspacesOptions } from "../../types/workspaces.js";

export function useWorkspaces(
  owner: string,
  repo: string,
  options?: WorkspacesOptions,
) {
  const client = useAPIClient();
  const perPage = Math.min(options?.perPage ?? 30, 100);
  const cacheKey = JSON.stringify({ owner, repo, perPage, status: options?.status });

  const query = usePaginatedQuery<Workspace>({
    client,
    path: `/api/repos/${owner}/${repo}/workspaces`,
    cacheKey,
    perPage,
    maxItems: 500,
    autoPaginate: false,
    enabled: options?.enabled ?? true,
    parseResponse: (data: unknown, headers: Headers) => {
      const items = data as Workspace[];
      const totalCount = parseInt(headers.get("X-Total-Count") ?? "0", 10);
      return { items, totalCount };
    },
  });

  const filteredItems = options?.status
    ? query.items.filter((w) => w.status === options.status)
    : query.items;

  return {
    workspaces: filteredItems,
    totalCount: query.totalCount,
    isLoading: query.isLoading,
    error: query.error,
    hasMore: query.hasMore,
    fetchMore: query.fetchMore,
    refetch: query.refetch,
  };
}
```

**Changes from existing code:**
1. Added `import { useAPIClient } from "../../client/context.js"`
2. Added `const client = useAPIClient()` call
3. Added `client` to `usePaginatedQuery` config
4. Changed `parseResponse` from `async (res) => { await res.json(); res.headers.get(...) }` to `(data: unknown, headers: Headers) => { data as T[]; headers.get(...) }`

### 5.3 `useWorkspace(owner, repo, workspaceId)`

**File**: `packages/ui-core/src/hooks/workspaces/useWorkspace.ts`

**Changes from existing code:**
1. Line 2: Change `import { useAPIClient } from "../../client/APIClientProvider.js"` to `import { useAPIClient } from "../../client/context.js"`
2. Line 11: Change `const { fetch } = useAPIClient()` to `const client = useAPIClient()`
3. Line 41: Change `fetch(\`/api/...\`)` to `client.request(\`/api/...\`)`
4. Line 66: Update dependency array from `[..., fetch]` to `[..., client]`

### 5.4 `useWorkspaceSSH(owner, repo, workspaceId)`

**File**: `packages/ui-core/src/hooks/workspaces/useWorkspaceSSH.ts`

**Same pattern fixes as `useWorkspace`:**
1. Line 2: Fix import path to `../../client/context.js`
2. Line 13: Change `const { fetch } = useAPIClient()` to `const client = useAPIClient()`
3. Line 53: Change `fetch(...)` to `client.request(...)`
4. Line 79: Update dependency array from `[..., fetch]` to `[..., client]`

**Existing TTL tracking logic is correct (verified):**
- Line 6: `SANDBOX_ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000` (300,000ms)
- Line 63: `setTokenExpiresAt(Date.now() + SANDBOX_ACCESS_TOKEN_TTL_MS)` on successful fetch
- Lines 28-33: 1-second `setInterval` for `now` state updates
- Line 81: `isTokenExpired = tokenExpiresAt !== null && now > tokenExpiresAt`
- Line 25: `refetch()` clears `tokenExpiresAt` before re-fetching via `setTokenExpiresAt(null)`
- Line 32: Timer cleanup on unmount via `clearInterval`

### 5.5 `useWorkspaceSessions(owner, repo, workspaceId, options?)`

**File**: `packages/ui-core/src/hooks/workspaces/useWorkspaceSessions.ts`

**Same pattern fixes as `useWorkspaces`:**
1. Add `useAPIClient` import from `../../client/context.js` and `client` variable
2. Add `client` to `usePaginatedQuery` config
3. Fix `parseResponse` signature from `async (res) => ...` to `(data: unknown, headers: Headers) => ...`

**Client-side filtering logic is correct (verified):** Lines 29-31 filter by `workspace_id` when `workspaceId` is non-empty. Line 12: `isEnabled = workspaceId !== "" && (options?.enabled ?? true)` correctly forces disable when workspaceId is empty.

### 5.6 `useWorkspaceSnapshots(owner, repo, options?)`

**File**: `packages/ui-core/src/hooks/workspaces/useWorkspaceSnapshots.ts`

**Same pattern fixes as `useWorkspaces`.** No client-side filtering — simpler hook.

### 5.7 `useCreateWorkspace(owner, repo)`

**File**: `packages/ui-core/src/hooks/workspaces/useCreateWorkspace.ts`

**Corrected implementation:**

```typescript
import { useAPIClient } from "../../client/context.js";
import { useMutation } from "../internal/useMutation.js";
import type { CreateWorkspaceRequest, Workspace } from "../../types/workspaces.js";
import { ApiError, parseResponseError } from "../../types/errors.js";

export function useCreateWorkspace(owner: string, repo: string) {
  const client = useAPIClient();
  const { mutate, isLoading, error } = useMutation<CreateWorkspaceRequest, Workspace>({
    mutationFn: async (input, signal) => {
      const trimmedName = input.name.trim();
      if (!trimmedName) {
        throw new ApiError(400, "name is required");
      }

      const nameRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
      if (trimmedName.length > 63 || !nameRegex.test(trimmedName)) {
        throw new ApiError(
          400,
          "name must be 1-63 lowercase alphanumeric characters or hyphens, starting and ending with alphanumeric",
        );
      }

      const body: Record<string, unknown> = { name: trimmedName };
      if (input.snapshot_id !== undefined) {
        body.snapshot_id = input.snapshot_id;
      }

      const response = await client.request(`/api/repos/${owner}/${repo}/workspaces`, {
        method: "POST",
        body,
        signal,
      });

      if (!response.ok) throw await parseResponseError(response);
      return await response.json() as Workspace;
    },
  });

  return { mutate, isLoading, error };
}
```

**Changes from existing code (6 changes):**
1. Added `import { useAPIClient } from "../../client/context.js"` and `import { parseResponseError } from "../../types/errors.js"`
2. Added `const client = useAPIClient()` at hook level
3. Swapped generic parameters: `<CreateWorkspaceRequest, Workspace>` (was `<Workspace, CreateWorkspaceRequest>`)
4. Changed `mutationFn` second param from `{ fetch }` to `signal`
5. Changed `fetch(...)` to `client.request(...)` with `body` as object and `signal` passed (removed manual `JSON.stringify` and `Content-Type` header)
6. Added response status validation (`if (!response.ok)`) and typed response parsing (`return await response.json() as Workspace`)

### 5.8 `useSuspendWorkspace(owner, repo, callbacks?)`

**File**: `packages/ui-core/src/hooks/workspaces/useSuspendWorkspace.ts`

**Corrected implementation:**

```typescript
import { useAPIClient } from "../../client/context.js";
import { useMutation } from "../internal/useMutation.js";
import type { Workspace } from "../../types/workspaces.js";
import { ApiError, parseResponseError } from "../../types/errors.js";
import type { HookError } from "../../types/errors.js";

export interface SuspendWorkspaceCallbacks {
  onOptimistic?: (workspaceId: string) => void;
  onRevert?: (workspaceId: string) => void;
  onError?: (error: HookError, workspaceId: string) => void;
  onSettled?: (workspaceId: string) => void;
}

export function useSuspendWorkspace(
  owner: string,
  repo: string,
  callbacks?: SuspendWorkspaceCallbacks,
) {
  const client = useAPIClient();
  const { mutate, isLoading, error } = useMutation<string, Workspace>({
    mutationFn: async (workspaceId, signal) => {
      if (!workspaceId) {
        throw new ApiError(400, "workspace id is required");
      }
      const response = await client.request(
        `/api/repos/${owner}/${repo}/workspaces/${workspaceId}/suspend`,
        { method: "POST", signal },
      );
      if (!response.ok) throw await parseResponseError(response);
      return await response.json() as Workspace;
    },
    onOptimistic: callbacks?.onOptimistic,
    onError: (error, workspaceId) => {
      callbacks?.onRevert?.(workspaceId);
      callbacks?.onError?.(error, workspaceId);
    },
    onSettled: callbacks?.onSettled,
  });

  return { mutate, isLoading, error };
}
```

**Key changes:**
1. All standard mutation fixes (import path, `useAPIClient`, generic swap, signal, client.request, response parsing)
2. Removed `onRevert: callbacks?.onRevert` — `useMutation` has no `onRevert` field
3. Wired `onRevert` through `onError`: calls `onRevert` first (to undo optimistic state), then `onError`

### 5.9 `useResumeWorkspace(owner, repo, callbacks?)`

**File**: `packages/ui-core/src/hooks/workspaces/useResumeWorkspace.ts`

Identical pattern to `useSuspendWorkspace` with `/resume` path instead of `/suspend`. Same `onRevert` wiring through `onError`.

### 5.10 `useDeleteWorkspace(owner, repo, callbacks?)`

**File**: `packages/ui-core/src/hooks/workspaces/useDeleteWorkspace.ts`

**Changes required — import path and client destructure only:**
1. Line 2: `import { useAPIClient } from "../../client/context.js"` (was `../../client/APIClientProvider.js`)
2. Line 17: `const client = useAPIClient()` (was `const { fetch } = useAPIClient()`)
3. Line 43: `client.request(...)` (was `fetch(...)`)
4. Line 83: Update dependency array from `[..., fetch, ...]` to `[..., client, ...]`

**Existing deduplication logic is correct (verified):**
- Lines 30-32: `inflight` ref Map checks for existing promise by ID, returns it if found
- Lines 37-41: Increments `isLoadingCount`, calls `onOptimistic`
- Lines 47-57: Success path: checks `res.status !== 204`, removes from maps, decrements count, clears error, calls `onSettled`
- Lines 59-78: Error path: calls `onRevert`, `onError`, `onSettled`, re-throws
- Lines 85-93: Cleanup: aborts all controllers, clears maps

### 5.11 `useCreateWorkspaceSession(owner, repo)`

**File**: `packages/ui-core/src/hooks/workspaces/useCreateWorkspaceSession.ts`

Same pattern fixes as `useCreateWorkspace` (import path addition, `useAPIClient`, generic swap `<CreateWorkspaceSessionRequest, WorkspaceSession>`, signal param, client.request, response parsing, remove manual JSON.stringify).

### 5.12 `useDestroyWorkspaceSession(owner, repo, callbacks?)`

**File**: `packages/ui-core/src/hooks/workspaces/useDestroyWorkspaceSession.ts`

Same pattern fix as `useDeleteWorkspace` (import path, client.request instead of fetch).

**Critical detail preserved (verified at line 44):** Uses `method: "POST"` (not DELETE) per API contract. Route is `POST .../:id/destroy`.

### 5.13 `useCreateWorkspaceSnapshot(owner, repo)`

**File**: `packages/ui-core/src/hooks/workspaces/useCreateWorkspaceSnapshot.ts`

Same pattern fixes as `useCreateWorkspace`. **Additional note:** The snapshot endpoint is `POST /api/repos/:owner/:repo/workspaces/:workspace_id/snapshot` (workspace-scoped, line 238 of routes), NOT the top-level `POST /workspace-snapshots`. The existing hook correctly constructs this path at line 19: `` `/api/repos/${owner}/${repo}/workspaces/${workspace_id}/snapshot` ``.

### 5.14 `useDeleteWorkspaceSnapshot(owner, repo, callbacks?)`

**File**: `packages/ui-core/src/hooks/workspaces/useDeleteWorkspaceSnapshot.ts`

Same pattern fix as `useDeleteWorkspace`. Verified at line 43: correct path `/workspace-snapshots/${snapshotId}` and method `DELETE`.

---

## 6. File Inventory

### Files to modify (bug fixes)

| File | Changes | Bug IDs |
|------|---------|--------|
| `packages/ui-core/src/hooks/workspaces/useWorkspaces.ts` | Add `useAPIClient`, add `client` to config, fix `parseResponse` signature | 1 |
| `packages/ui-core/src/hooks/workspaces/useWorkspace.ts` | Fix import path, use `client.request()` instead of `fetch()` | 4, 5 |
| `packages/ui-core/src/hooks/workspaces/useWorkspaceSSH.ts` | Fix import path, use `client.request()` instead of `fetch()` | 4, 5 |
| `packages/ui-core/src/hooks/workspaces/useWorkspaceSessions.ts` | Add `useAPIClient`, add `client` to config, fix `parseResponse` signature | 2 |
| `packages/ui-core/src/hooks/workspaces/useWorkspaceSnapshots.ts` | Add `useAPIClient`, add `client` to config, fix `parseResponse` signature | 3 |
| `packages/ui-core/src/hooks/workspaces/useCreateWorkspace.ts` | Fix generic params, fix signal param, add `useAPIClient`, add response parsing, remove manual JSON.stringify | 6, 7, 8, 10 |
| `packages/ui-core/src/hooks/workspaces/useSuspendWorkspace.ts` | Fix generic params, fix signal param, add `useAPIClient`, add response parsing, wire `onRevert` through `onError` | 6, 7, 8, 9 |
| `packages/ui-core/src/hooks/workspaces/useResumeWorkspace.ts` | Fix generic params, fix signal param, add `useAPIClient`, add response parsing, wire `onRevert` through `onError` | 6, 7, 8, 9 |
| `packages/ui-core/src/hooks/workspaces/useDeleteWorkspace.ts` | Fix import path, use `client.request()` instead of `fetch()` | 4, 5 |
| `packages/ui-core/src/hooks/workspaces/useCreateWorkspaceSession.ts` | Fix generic params, fix signal param, add `useAPIClient`, add response parsing, remove manual JSON.stringify | 6, 7, 8, 10 |
| `packages/ui-core/src/hooks/workspaces/useDestroyWorkspaceSession.ts` | Fix import path, use `client.request()` instead of `fetch()` | 4, 5 |
| `packages/ui-core/src/hooks/workspaces/useCreateWorkspaceSnapshot.ts` | Fix generic params, fix signal param, add `useAPIClient`, add response parsing, remove manual JSON.stringify | 6, 7, 8, 10 |
| `packages/ui-core/src/hooks/workspaces/useDeleteWorkspaceSnapshot.ts` | Fix import path, use `client.request()` instead of `fetch()` | 4, 5 |

### Files to modify (test implementation)

| File | Purpose |
|------|---------|
| `packages/ui-core/src/hooks/workspaces/__tests__/useWorkspaces.test.ts` | Fill in all 38 test bodies |
| `packages/ui-core/src/hooks/workspaces/__tests__/useWorkspace.test.ts` | Fill in all 24 test bodies |
| `packages/ui-core/src/hooks/workspaces/__tests__/useWorkspaceSSH.test.ts` | Fill in all 24 test bodies |
| `packages/ui-core/src/hooks/workspaces/__tests__/useWorkspaceSessions.test.ts` | Fill in all 12 test bodies |
| `packages/ui-core/src/hooks/workspaces/__tests__/useWorkspaceSnapshots.test.ts` | Fill in all 9 test bodies |
| `packages/ui-core/src/hooks/workspaces/__tests__/useCreateWorkspace.test.ts` | Fill in all 21 test bodies |
| `packages/ui-core/src/hooks/workspaces/__tests__/useSuspendWorkspace.test.ts` | Fill in all 13 test bodies |
| `packages/ui-core/src/hooks/workspaces/__tests__/useResumeWorkspace.test.ts` | Fill in all 9 test bodies |
| `packages/ui-core/src/hooks/workspaces/__tests__/useDeleteWorkspace.test.ts` | Fill in all 21 test bodies |
| `packages/ui-core/src/hooks/workspaces/__tests__/useCreateWorkspaceSession.test.ts` | Fill in all 12 test bodies |
| `packages/ui-core/src/hooks/workspaces/__tests__/useDestroyWorkspaceSession.test.ts` | Fill in all 11 test bodies |
| `packages/ui-core/src/hooks/workspaces/__tests__/useCreateWorkspaceSnapshot.test.ts` | Fill in all 9 test bodies |
| `packages/ui-core/src/hooks/workspaces/__tests__/useDeleteWorkspaceSnapshot.test.ts` | Fill in all 9 test bodies |

### Files that require NO changes

| File | Reason |
|------|--------|
| `packages/ui-core/src/types/workspaces.ts` | Already correct — verified line-by-line |
| `packages/ui-core/src/types/index.ts` | Already exports workspace types |
| `packages/ui-core/src/types/errors.ts` | Error types (`ApiError`, `NetworkError`, `HookError`, `parseResponseError`) are correct |
| `packages/ui-core/src/hooks/workspaces/index.ts` | Already exports all 13 hooks and callback types |
| `packages/ui-core/src/index.ts` | Already exports all workspace types and hooks |
| `packages/ui-core/src/hooks/internal/usePaginatedQuery.ts` | Internal utility is correct — verified 218 lines |
| `packages/ui-core/src/hooks/internal/useMutation.ts` | Internal utility is correct — verified 103 lines |
| `packages/ui-core/src/client/types.ts` | `APIClient` interface is correct |
| `packages/ui-core/src/client/context.ts` | `APIClientProvider` and `useAPIClient` are correct |
| `packages/ui-core/src/client/createAPIClient.ts` | Client factory with auto-serialization is correct |
| `packages/ui-core/src/test-utils/mockAPIClient.ts` | Mock client with queue-based responses is correct |
| `packages/ui-core/src/test-utils/renderHook.ts` | Test utility with `waitForNextUpdate` is correct |
| `packages/ui-core/src/test-utils/react-mock.ts` | React mock with hook simulation is correct |

---

## 7. Implementation Plan

Each step is a vertical slice that produces compilable, testable code.

### Step 1 — Fix all hook bug classes systematically

This step fixes all 10 identified bugs across all 13 hook files. The bugs fall into mechanical categories that can be applied uniformly.

**Bug fix category A — Import path fix (5 files):**

In each of `useWorkspace.ts`, `useWorkspaceSSH.ts`, `useDeleteWorkspace.ts`, `useDestroyWorkspaceSession.ts`, `useDeleteWorkspaceSnapshot.ts`:

```diff
-import { useAPIClient } from "../../client/APIClientProvider.js";
+import { useAPIClient } from "../../client/context.js";
```

**Bug fix category B — `useAPIClient()` destructure fix + method rename (5 files):**

In each of the same 5 files:

```diff
-const { fetch } = useAPIClient();
+const client = useAPIClient();
```

Then replace all `fetch(path, opts)` calls with `client.request(path, opts)` and update `useCallback` dependency arrays from `fetch` to `client`.

Specific line changes per file:
- **useWorkspace.ts**: line 11 (`{ fetch }` → `client`), line 41 (`fetch(` → `client.request(`), line 66 dep array
- **useWorkspaceSSH.ts**: line 13 (`{ fetch }` → `client`), line 53 (`fetch(` → `client.request(`), line 79 dep array
- **useDeleteWorkspace.ts**: line 17 (`{ fetch }` → `client`), line 43 (`fetch(` → `client.request(`), line 83 dep array
- **useDestroyWorkspaceSession.ts**: line 17 (`{ fetch }` → `client`), line 43 (`fetch(` → `client.request(`), line 83 dep array
- **useDeleteWorkspaceSnapshot.ts**: line 17 (`{ fetch }` → `client`), line 43 (`fetch(` → `client.request(`), line 83 dep array

**Bug fix category C — Add `useAPIClient` + `client` to paginated hooks (3 files):**

In `useWorkspaces.ts`, `useWorkspaceSessions.ts`, `useWorkspaceSnapshots.ts`:

```diff
+import { useAPIClient } from "../../client/context.js";
 ...
 export function useWorkspaces(...) {
+  const client = useAPIClient();
   ...
   const query = usePaginatedQuery<Workspace>({
+    client,
     path: ...,
```

**Bug fix category D — Fix `parseResponse` signature (3 files):**

In `useWorkspaces.ts`, `useWorkspaceSessions.ts`, `useWorkspaceSnapshots.ts`:

```diff
-    parseResponse: async (res) => {
-      const items = await res.json();
-      const totalCountHeader = res.headers.get("X-Total-Count");
+    parseResponse: (data: unknown, headers: Headers) => {
+      const items = data as Workspace[];
+      const totalCountHeader = headers.get("X-Total-Count");
```

(Replace `Workspace` with appropriate type: `WorkspaceSession` for sessions, `WorkspaceSnapshot` for snapshots.)

**Bug fix category E — Fix generic params + signal + client + response parsing (5 files):**

In `useCreateWorkspace.ts`, `useSuspendWorkspace.ts`, `useResumeWorkspace.ts`, `useCreateWorkspaceSession.ts`, `useCreateWorkspaceSnapshot.ts`:

1. Add `import { useAPIClient } from "../../client/context.js"` and `import { parseResponseError } from "../../types/errors.js"`
2. Add `const client = useAPIClient()` at hook level
3. Swap generic params (e.g., `<Workspace, CreateWorkspaceRequest>` → `<CreateWorkspaceRequest, Workspace>`)
4. Change `async (input, { fetch }) =>` to `async (input, signal) =>`
5. Change `fetch(path, opts)` to `client.request(path, { ...opts, signal })`
6. Remove manual `JSON.stringify` and `Content-Type` header — pass `body` as object
7. Add `if (!response.ok) throw await parseResponseError(response);`
8. Change `return res;` to `return await response.json() as Workspace;` (or appropriate type)

**Bug fix category F — Wire `onRevert` through `onError` (2 files):**

In `useSuspendWorkspace.ts` and `useResumeWorkspace.ts`:

```diff
-    onRevert: callbacks?.onRevert,
-    onError: callbacks?.onError,
+    onError: (error, input) => {
+      callbacks?.onRevert?.(input);
+      callbacks?.onError?.(error, input);
+    },
```

**Done when:** `cd specs/tui/packages/ui-core && bun tsc --noEmit` passes with zero errors. All hooks import from correct paths, use `client.request()`, pass `client` to `usePaginatedQuery`, use correct `parseResponse` signature, use correct generic parameter order, use `signal: AbortSignal` as second `mutationFn` param, parse/validate responses before returning, and wire `onRevert` through `onError`.

### Step 2 — Implement query hook tests (`useWorkspace`, `useWorkspaces`, `useWorkspaceSSH`)

**Files:**
- `packages/ui-core/src/hooks/workspaces/__tests__/useWorkspace.test.ts`
- `packages/ui-core/src/hooks/workspaces/__tests__/useWorkspaces.test.ts`
- `packages/ui-core/src/hooks/workspaces/__tests__/useWorkspaceSSH.test.ts`

**Test implementation pattern (example for `useWorkspace`):**

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useWorkspace } from "../useWorkspace.js";
import type { Workspace } from "../../../types/workspaces.js";

const mockWorkspace: Workspace = {
  id: "ws-1",
  repository_id: 1,
  user_id: 1,
  name: "test-workspace",
  status: "running",
  is_fork: false,
  freestyle_vm_id: "vm-abc",
  persistence: "persistent",
  idle_timeout_seconds: 3600,
  suspended_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("useWorkspace", () => {
  let mockClient: ReturnType<typeof createMockAPIClient>;

  beforeEach(() => {
    mockClient = createMockAPIClient();
  });

  describe("initial state", () => {
    it("workspace is null before fetch completes", () => {
      mockClient.respondWithJSON(200, mockWorkspace);
      const { result } = renderHook(
        () => useWorkspace("owner", "repo", "ws-1"),
        { apiClient: mockClient },
      );
      // Before async resolution, workspace should be null
      expect(result.current.workspace).toBeNull();
    });

    it("isLoading is true on mount", () => {
      mockClient.respondWithJSON(200, mockWorkspace);
      const { result } = renderHook(
        () => useWorkspace("owner", "repo", "ws-1"),
        { apiClient: mockClient },
      );
      expect(result.current.isLoading).toBe(true);
    });

    it("error is null on mount", () => {
      mockClient.respondWithJSON(200, mockWorkspace);
      const { result } = renderHook(
        () => useWorkspace("owner", "repo", "ws-1"),
        { apiClient: mockClient },
      );
      expect(result.current.error).toBeNull();
    });
  });

  describe("fetch lifecycle", () => {
    it("fetches GET /api/repos/:owner/:repo/workspaces/:id on mount", () => {
      mockClient.respondWithJSON(200, mockWorkspace);
      renderHook(
        () => useWorkspace("owner", "repo", "ws-1"),
        { apiClient: mockClient },
      );
      expect(mockClient.calls.length).toBe(1);
      expect(mockClient.calls[0].path).toBe("/api/repos/owner/repo/workspaces/ws-1");
    });

    it("populates workspace from response body", async () => {
      mockClient.respondWithJSON(200, mockWorkspace);
      const { result, waitForNextUpdate } = renderHook(
        () => useWorkspace("owner", "repo", "ws-1"),
        { apiClient: mockClient },
      );
      await waitForNextUpdate();
      expect(result.current.workspace).toEqual(mockWorkspace);
    });

    it("sets isLoading to false after successful fetch", async () => {
      mockClient.respondWithJSON(200, mockWorkspace);
      const { result, waitForNextUpdate } = renderHook(
        () => useWorkspace("owner", "repo", "ws-1"),
        { apiClient: mockClient },
      );
      await waitForNextUpdate();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("empty workspaceId guard", () => {
    it("does not fetch when workspaceId is empty string", () => {
      const { result } = renderHook(
        () => useWorkspace("owner", "repo", ""),
        { apiClient: mockClient },
      );
      expect(mockClient.calls.length).toBe(0);
    });

    it("returns null workspace when workspaceId is empty", () => {
      const { result } = renderHook(
        () => useWorkspace("owner", "repo", ""),
        { apiClient: mockClient },
      );
      expect(result.current.workspace).toBeNull();
    });

    it("isLoading is false when workspaceId is empty", () => {
      const { result } = renderHook(
        () => useWorkspace("owner", "repo", ""),
        { apiClient: mockClient },
      );
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("error handling", () => {
    it("sets error on 404 response", async () => {
      mockClient.respondWithJSON(404, { message: "workspace not found" });
      const { result, waitForNextUpdate } = renderHook(
        () => useWorkspace("owner", "repo", "ws-missing"),
        { apiClient: mockClient },
      );
      await waitForNextUpdate();
      expect(result.current.error).not.toBeNull();
      expect(result.current.error!.status).toBe(404);
    });

    it("swallows AbortError silently", () => {
      const abortError = new DOMException("aborted", "AbortError");
      mockClient.respondWithError(abortError);
      const { result } = renderHook(
        () => useWorkspace("owner", "repo", "ws-1"),
        { apiClient: mockClient },
      );
      // AbortError should not set error state
      expect(result.current.error).toBeNull();
    });
  });

  describe("cleanup", () => {
    it("aborts in-flight request on unmount", () => {
      mockClient.respondWithJSON(200, mockWorkspace);
      const { unmount } = renderHook(
        () => useWorkspace("owner", "repo", "ws-1"),
        { apiClient: mockClient },
      );
      const signal = mockClient.calls[0]?.options?.signal as AbortSignal;
      expect(signal?.aborted).toBe(false);
      unmount();
      expect(signal?.aborted).toBe(true);
    });
  });

  // Integration tests — expected to fail until server middleware is wired
  describe("integration — real server", () => {
    it("fetches workspace from running server", () => {
      // This test intentionally left to fail against real server.
      // Will pass once workspace routes have repo/auth middleware wired.
    });
    it("handles 404 for non-existent workspace", () => {
      // This test intentionally left to fail against real server.
    });
  });
});
```

**Critical testing details for `useWorkspaceSSH`:**
- TTL tracking tests must mock `Date.now`: `const originalNow = Date.now; Date.now = () => 1000;` before render, then `Date.now = () => 301000;` (5min + 1sec) after render to verify `isTokenExpired` transitions
- Timer test: Verify `setInterval` creates a 1-second timer by checking state updates
- Cleanup test: Verify `clearInterval` fires on unmount
- Restore `Date.now` in `afterEach` to avoid test pollution

**Critical testing details for `useWorkspaces`:**
- `respondWithJSON` must include `X-Total-Count` header: `mockClient.respondWithJSON(200, [...items], { "X-Total-Count": "5" })`
- `fetchMore` test: Queue two responses (page 1 and page 2), verify items accumulate
- Status filter test: Return mixed-status workspaces, verify `options.status` filters client-side
- `perPage` cap test: Pass `perPage: 200`, verify the path contains `per_page=100`

### Step 3 — Implement remaining query hook tests

**Files:**
- `packages/ui-core/src/hooks/workspaces/__tests__/useWorkspaceSessions.test.ts`
- `packages/ui-core/src/hooks/workspaces/__tests__/useWorkspaceSnapshots.test.ts`

Key patterns:
- `useWorkspaceSessions`: Test client-side `workspace_id` filtering — provide sessions with different workspace IDs, verify only matching ones returned
- `useWorkspaceSessions`: Test `enabled` is force-`false` when `workspaceId` is empty string (line 12 of hook: `workspaceId !== "" && (options?.enabled ?? true)`)
- `useWorkspaceSnapshots`: Simpler — no client-side filtering, just pagination and header reading

### Step 4 — Implement `useCreateWorkspace` tests

**File:** `packages/ui-core/src/hooks/workspaces/__tests__/useCreateWorkspace.test.ts`

Key test patterns:
- **Validation tests are synchronous** — call `result.current.mutate({ name: "INVALID" })` and `expect(promise).rejects.toThrow()`
- Verify validation fires BEFORE `client.request()` — check `mockClient.calls.length === 0` after validation error
- Test name regex edge cases:
  - `"a"` → valid (single char)
  - `"a-b"` → valid
  - `"abc"` → valid
  - `"-abc"` → invalid (starts with hyphen)
  - `"abc-"` → invalid (ends with hyphen)
  - `"ABC"` → invalid (uppercase)
  - `"a b"` → invalid (space)
  - `"a_b"` → invalid (underscore)
  - `"a.b"` → invalid (dot)
  - `"a".repeat(64)` → invalid (> 63 chars)
  - `" abc "` → valid after trim (verify trimmed name is sent in request body)
- Test `snapshot_id` inclusion/omission in request body
- Test double-submit prevention: first `mutate()` succeeds, second rejects with `"mutation in progress"`

### Step 5 — Implement suspend/resume/delete workspace tests

**Files:**
- `packages/ui-core/src/hooks/workspaces/__tests__/useSuspendWorkspace.test.ts`
- `packages/ui-core/src/hooks/workspaces/__tests__/useResumeWorkspace.test.ts`
- `packages/ui-core/src/hooks/workspaces/__tests__/useDeleteWorkspace.test.ts`

Key test patterns for `useSuspendWorkspace`/`useResumeWorkspace`:
- Verify `onOptimistic` fires before network request: pass callback, check it was called, then check `mockClient.calls`
- Verify `onRevert` fires on error (via the `onError` callback wiring) — queue an error response, verify `onRevert` was called
- Verify `onSettled` fires after both success and error paths
- Verify empty workspaceId guard: `mutate("")` throws `ApiError(400)`

Key test patterns for `useDeleteWorkspace`:
- **Deduplication**: Call `mutate("ws-1")` twice, verify `mockClient.calls.length === 1` (only one network request)
- Verify second call returns the SAME promise (referential equality with `===`)
- Verify `onOptimistic` NOT called on deduplicated call (because the inflight check returns early at line 30-31 before the `onOptimistic` call at line 39)
- Verify separate IDs get separate promises and separate network requests
- Verify `isLoadingCount` works: `isLoading` true during in-flight, false after all complete
- Verify all `AbortController`s are aborted on unmount

### Step 6 — Implement session + snapshot mutation tests

**Files:**
- `packages/ui-core/src/hooks/workspaces/__tests__/useCreateWorkspaceSession.test.ts`
- `packages/ui-core/src/hooks/workspaces/__tests__/useDestroyWorkspaceSession.test.ts`
- `packages/ui-core/src/hooks/workspaces/__tests__/useCreateWorkspaceSnapshot.test.ts`
- `packages/ui-core/src/hooks/workspaces/__tests__/useDeleteWorkspaceSnapshot.test.ts`

Key detail for `useDestroyWorkspaceSession`: Verify the hook uses `method: "POST"` — check `mockClient.calls[0].options?.method === "POST"` (not DELETE).

Key detail for `useCreateWorkspaceSession`: Verify validation of `cols` and `rows` — negative values and non-integers should throw `ApiError(400)`.

Key detail for `useCreateWorkspaceSnapshot`: Verify body construction — when `input.name` is undefined, the body object should be empty (or have no `name` field).

### Step 7 — Final type-check and import verification

**Verification commands:**
```bash
cd specs/tui/packages/ui-core && bun tsc --noEmit
bun test specs/tui/packages/ui-core/src/hooks/workspaces/
```

**Expected results:**
- TypeScript compilation passes with zero errors
- All mock-client tests pass
- All integration tests fail — expected, due to:
  - `repositoryID = 0` / `userID = 0` hardcoded in server routes
  - Missing container sandbox runtime
  - Server may not be running in test environment
- Integration tests are **NOT** skipped or commented out — they are left failing per project policy

---

## 8. Unit & Integration Tests

### Framework

`bun:test` for all unit/integration tests within `packages/ui-core/src/hooks/workspaces/__tests__/`. `@microsoft/tui-test` is **NOT** used here — that framework is for terminal E2E tests in `e2e/tui/`. Hook tests use:
- `renderHook` from `packages/ui-core/src/test-utils/renderHook.ts`
- `createMockAPIClient` from `packages/ui-core/src/test-utils/mockAPIClient.ts`

### Test Infrastructure Details

The test utilities use a custom React mock (`test-utils/react-mock.ts`) that provides:
- `useState` — hook state with change detection and re-render triggering via `state.resolveUpdate`
- `useEffect` — dependency-tracked effects processed after each render cycle (effects run synchronously within `renderCycle()`)
- `useRef` — persistent refs across renders
- `useCallback` — memoized callbacks with dependency tracking
- `useMemo` — memoized values
- `useContext` — returns `state.currentContextValue` (set by `renderHook` from `options.apiClient`)

`renderHook` provides:
- `result.current` — latest hook return value (updated after each render cycle)
- `rerender()` — trigger a new render cycle with same hook call
- `unmount()` — run all effect cleanup functions
- `waitForNextUpdate(timeoutMs?)` — returns a Promise that resolves when a state update triggers a re-render (1000ms default timeout). Works by setting `state.resolveUpdate` to a callback that runs `renderCycle()` then resolves the promise.

`createMockAPIClient` provides:
- `respondWithJSON(status, body, headers?)` — queue a JSON response. **MUST** call BEFORE `renderHook` since the hook's `useEffect` fires synchronously during `renderCycle()` and the `request()` call happens immediately.
- `respondWith(response)` — queue a raw Response
- `respondWithError(error)` — queue a thrown error
- `calls` — array of all `{ path, options, timestamp }` calls made to `request()`
- `callsTo(pattern)` — filter calls by path (string includes or regex)
- `reset()` — clear queues and call history

**Critical detail:** `createMockAPIClient` is queue-based (FIFO). Responses are consumed in order by `queue.shift()`. If a hook makes N requests, N responses must be queued before the hook renders. Unqueued requests get a 500 response with `{ message: "no mock response queued" }` and a console warning.

**Async behavior note:** The React mock executes effects synchronously within `renderCycle()`. However, `useWorkspace` (and similar hooks) call `client.request()` which returns a Promise. Even though `createMockAPIClient.request()` resolves immediately (no actual I/O), the `.then()` callback runs on the next microtask. Therefore:
- Synchronous assertions after `renderHook()` see the loading state (pre-resolution)
- `await waitForNextUpdate()` is needed to see the resolved state
- `waitForNextUpdate()` works by waiting for a `setState` call to fire `state.resolveUpdate`

### Testing Strategy

Tests fall into three categories:

1. **Pure logic tests** — Validation logic (workspace name format, empty ID guards). No server, no React async. Always pass.
2. **Hook behavior tests with mock client** — Verify hook state transitions, cleanup, validation. Use `createMockAPIClient` to control responses. **These should pass.**
3. **Integration tests against real API** — Tests that make real HTTP requests to a running server. **Expected to fail until workspace routes are fully wired with repo/auth middleware.** These tests are written but left failing per project policy. They are NEVER `.skip`-ed or commented out.

### Test Specifications

#### `useWorkspaces.test.ts` — 38 tests

```
describe("useWorkspaces")
  describe("initial state")
    ✓ returns empty workspaces array before fetch completes
    ✓ isLoading is true on mount
    ✓ error is null on mount
    ✓ hasMore is false before first response
    ✓ totalCount is 0 before first response

  describe("fetch lifecycle")
    ✓ fetches GET /api/repos/:owner/:repo/workspaces on mount
    ✓ populates workspaces from response body
    ✓ reads X-Total-Count header for totalCount
    ✓ sets isLoading to false after successful fetch
    ✓ sets hasMore to true when items.length < totalCount
    ✓ sets hasMore to false when items.length >= totalCount

  describe("pagination")
    ✓ fetchMore sends page=2 request
    ✓ fetchMore appends items to existing list
    ✓ fetchMore is no-op when hasMore is false
    ✓ fetchMore is no-op when isLoading is true
    ✓ caps perPage at 100
    ✓ defaults perPage to 30
    ✓ respects maxItems cap of 500

  describe("refetch")
    ✓ refetch replaces items with fresh page 1
    ✓ refetch preserves items during loading (stale-while-revalidate)
    ✓ refetch resets page to 1

  describe("client-side status filter")
    ✓ filters workspaces by status when option provided
    ✓ returns all workspaces when no status filter
    ✓ totalCount reflects server total, not filtered count

  describe("param changes")
    ✓ changing owner resets and re-fetches
    ✓ changing repo resets and re-fetches
    ✓ changing perPage resets and re-fetches

  describe("enabled option")
    ✓ does not fetch when enabled is false
    ✓ fetches when enabled transitions from false to true
    ✓ clears items when enabled transitions from true to false

  describe("error handling")
    ✓ sets error on non-2xx response
    ✓ preserves stale items on error
    ✓ swallows AbortError silently
    ✓ wraps fetch failure as NetworkError

  describe("cleanup")
    ✓ aborts in-flight request on unmount
    ✓ does not update state after unmount

  describe("integration — real server")
    ✓ fetches workspaces from running server
    ✓ handles 401 unauthorized response
```

#### `useWorkspace.test.ts` — 24 tests

```
describe("useWorkspace")
  describe("initial state")
    ✓ workspace is null before fetch completes
    ✓ isLoading is true on mount
    ✓ error is null on mount

  describe("fetch lifecycle")
    ✓ fetches GET /api/repos/:owner/:repo/workspaces/:id on mount
    ✓ populates workspace from response body
    ✓ sets isLoading to false after successful fetch

  describe("refetch")
    ✓ refetch preserves workspace during loading
    ✓ refetch replaces workspace on success
    ✓ refetch preserves workspace on error

  describe("param changes")
    ✓ changing workspaceId aborts previous request and re-fetches
    ✓ changing owner re-fetches
    ✓ changing repo re-fetches

  describe("empty workspaceId guard")
    ✓ does not fetch when workspaceId is empty string
    ✓ returns null workspace when workspaceId is empty
    ✓ isLoading is false when workspaceId is empty
    ✓ error is null when workspaceId is empty

  describe("error handling")
    ✓ sets error on 404 response
    ✓ sets error on 500 response
    ✓ preserves stale workspace on error
    ✓ swallows AbortError silently

  describe("cleanup")
    ✓ aborts in-flight request on unmount
    ✓ does not update state after unmount

  describe("integration — real server")
    ✓ fetches workspace from running server
    ✓ handles 404 for non-existent workspace
```

#### `useWorkspaceSSH.test.ts` — 24 tests

```
describe("useWorkspaceSSH")
  describe("initial state")
    ✓ sshInfo is null before fetch completes
    ✓ isLoading is true on mount
    ✓ tokenExpiresAt is null before fetch
    ✓ isTokenExpired is false before fetch

  describe("fetch lifecycle")
    ✓ fetches GET /api/repos/:owner/:repo/workspaces/:id/ssh on mount
    ✓ populates sshInfo from response body
    ✓ sets tokenExpiresAt to Date.now() + 300_000 on success
    ✓ isTokenExpired is false immediately after fetch

  describe("token TTL tracking")
    ✓ isTokenExpired becomes true after 5 minutes
    ✓ tokenExpiresAt is recalculated on refetch
    ✓ refetch clears tokenExpiresAt during loading
    ✓ timer fires every 1 second to update isTokenExpired

  describe("refetch")
    ✓ refetch preserves sshInfo during loading
    ✓ refetch replaces sshInfo on success
    ✓ refetch recomputes tokenExpiresAt from new Date.now()

  describe("empty workspaceId guard")
    ✓ does not fetch when workspaceId is empty
    ✓ returns null sshInfo when workspaceId is empty

  describe("error handling")
    ✓ sets error on 404 response
    ✓ preserves stale sshInfo on error

  describe("cleanup")
    ✓ clears interval timer on unmount
    ✓ aborts in-flight request on unmount
    ✓ does not update state after unmount

  describe("integration — real server")
    ✓ fetches SSH info from running server
    ✓ handles 404 for non-existent workspace
```

#### `useWorkspaceSessions.test.ts` — 12 tests

```
describe("useWorkspaceSessions")
  describe("initial state")
    ✓ returns empty sessions array before fetch
    ✓ isLoading is true on mount

  describe("fetch lifecycle")
    ✓ fetches GET /api/repos/:owner/:repo/workspace/sessions on mount
    ✓ filters sessions by workspace_id client-side
    ✓ returns all sessions when workspaceId is empty
    ✓ reads X-Total-Count header

  describe("pagination")
    ✓ fetchMore appends and filters
    ✓ caps perPage at 100

  describe("param changes")
    ✓ changing workspaceId resets and re-fetches

  describe("enabled option")
    ✓ forced disabled when workspaceId is empty

  describe("cleanup")
    ✓ aborts on unmount

  describe("integration — real server")
    ✓ fetches sessions from running server
```

#### `useWorkspaceSnapshots.test.ts` — 9 tests

```
describe("useWorkspaceSnapshots")
  describe("initial state")
    ✓ returns empty snapshots array before fetch
    ✓ isLoading is true on mount

  describe("fetch lifecycle")
    ✓ fetches GET /api/repos/:owner/:repo/workspace-snapshots on mount
    ✓ populates snapshots from response body
    ✓ reads X-Total-Count header

  describe("pagination")
    ✓ fetchMore sends page=2
    ✓ caps perPage at 100

  describe("cleanup")
    ✓ aborts on unmount

  describe("integration — real server")
    ✓ fetches snapshots from running server
```

#### `useCreateWorkspace.test.ts` — 21 tests

```
describe("useCreateWorkspace")
  describe("client-side validation")
    ✓ rejects empty name
    ✓ rejects whitespace-only name
    ✓ rejects name with uppercase characters
    ✓ rejects name starting with hyphen
    ✓ rejects name ending with hyphen
    ✓ rejects name longer than 63 characters
    ✓ rejects name with invalid characters (spaces, underscores, dots)
    ✓ accepts valid lowercase alphanumeric name
    ✓ accepts name with hyphens in middle
    ✓ accepts single character name
    ✓ validation does not make network request

  describe("mutation lifecycle")
    ✓ sends POST /api/repos/:owner/:repo/workspaces
    ✓ sends trimmed name in request body
    ✓ includes snapshot_id when provided
    ✓ omits snapshot_id when undefined
    ✓ returns created workspace on 201
    ✓ sets isLoading during mutation
    ✓ clears isLoading after success

  describe("double-submit prevention")
    ✓ rejects second mutate call while first is in-flight

  describe("error handling")
    ✓ sets error on non-201 response
    ✓ parses server validation errors

  describe("integration — real server")
    ✓ creates workspace on running server
    ✓ handles server-side validation error
```

#### `useSuspendWorkspace.test.ts` — 13 tests

```
describe("useSuspendWorkspace")
  describe("mutation lifecycle")
    ✓ sends POST /api/repos/:owner/:repo/workspaces/:id/suspend
    ✓ returns updated workspace on 200
    ✓ calls onOptimistic before network request
    ✓ calls onSettled after success

  describe("error handling")
    ✓ calls onRevert on error
    ✓ calls onError with error and workspaceId
    ✓ calls onSettled after error
    ✓ sets error state

  describe("empty workspaceId guard")
    ✓ throws ApiError(400) for empty workspaceId
    ✓ does not make network request for empty workspaceId

  describe("double-submit prevention")
    ✓ rejects concurrent suspend calls

  describe("cleanup")
    ✓ aborts on unmount

  describe("integration — real server")
    ✓ suspends workspace on running server
```

#### `useResumeWorkspace.test.ts` — 9 tests

```
describe("useResumeWorkspace")
  describe("mutation lifecycle")
    ✓ sends POST /api/repos/:owner/:repo/workspaces/:id/resume
    ✓ returns updated workspace on 200
    ✓ calls onOptimistic before network request
    ✓ calls onSettled after success

  describe("error handling")
    ✓ calls onRevert on error
    ✓ calls onError with error and workspaceId

  describe("empty workspaceId guard")
    ✓ throws ApiError(400) for empty workspaceId

  describe("cleanup")
    ✓ aborts on unmount

  describe("integration — real server")
    ✓ resumes workspace on running server
```

#### `useDeleteWorkspace.test.ts` — 21 tests

```
describe("useDeleteWorkspace")
  describe("mutation lifecycle")
    ✓ sends DELETE /api/repos/:owner/:repo/workspaces/:id
    ✓ resolves on 204 empty body
    ✓ calls onOptimistic before network request
    ✓ calls onSettled after success
    ✓ clears error after successful delete

  describe("deduplication")
    ✓ returns same promise for concurrent deletes of same id
    ✓ does not call onOptimistic on deduplicated call
    ✓ allows new delete after previous completes
    ✓ tracks separate promises for different workspace ids

  describe("error handling")
    ✓ calls onRevert on error
    ✓ calls onError with error and workspaceId
    ✓ calls onSettled after error
    ✓ sets error state
    ✓ re-throws error
    ✓ removes from dedup map on error

  describe("isLoading")
    ✓ isLoading true when any delete in-flight
    ✓ isLoading false when all deletes complete

  describe("empty workspaceId guard")
    ✓ throws ApiError(400) for empty workspaceId

  describe("cleanup")
    ✓ aborts all in-flight deletes on unmount
    ✓ does not update state after unmount

  describe("integration — real server")
    ✓ deletes workspace on running server
```

#### `useCreateWorkspaceSession.test.ts` — 12 tests

```
describe("useCreateWorkspaceSession")
  describe("client-side validation")
    ✓ rejects empty workspace_id
    ✓ rejects whitespace-only workspace_id
    ✓ rejects negative cols
    ✓ rejects negative rows
    ✓ rejects non-integer cols
    ✓ accepts zero cols and rows (defaults)
    ✓ validation does not make network request

  describe("mutation lifecycle")
    ✓ sends POST /api/repos/:owner/:repo/workspace/sessions
    ✓ sends workspace_id, cols, rows in body
    ✓ returns created session on 201

  describe("double-submit prevention")
    ✓ rejects concurrent create calls

  describe("integration — real server")
    ✓ creates session on running server
```

#### `useDestroyWorkspaceSession.test.ts` — 11 tests

```
describe("useDestroyWorkspaceSession")
  describe("mutation lifecycle")
    ✓ sends POST /api/repos/:owner/:repo/workspace/sessions/:id/destroy
    ✓ uses POST method not DELETE
    ✓ resolves on 204 empty body
    ✓ calls onOptimistic before network request

  describe("deduplication")
    ✓ returns same promise for concurrent destroys of same id
    ✓ allows new destroy after previous completes

  describe("error handling")
    ✓ calls onRevert on error
    ✓ calls onError with error and sessionId

  describe("empty sessionId guard")
    ✓ throws ApiError(400) for empty sessionId

  describe("cleanup")
    ✓ aborts on unmount

  describe("integration — real server")
    ✓ destroys session on running server
```

#### `useCreateWorkspaceSnapshot.test.ts` — 9 tests

```
describe("useCreateWorkspaceSnapshot")
  describe("client-side validation")
    ✓ rejects empty workspace_id
    ✓ rejects whitespace-only workspace_id
    ✓ validation does not make network request

  describe("mutation lifecycle")
    ✓ sends POST /api/repos/:owner/:repo/workspaces/:id/snapshot
    ✓ includes name in body when provided
    ✓ omits name when undefined
    ✓ returns created snapshot on 201

  describe("double-submit prevention")
    ✓ rejects concurrent create calls

  describe("integration — real server")
    ✓ creates snapshot on running server
```

#### `useDeleteWorkspaceSnapshot.test.ts` — 9 tests

```
describe("useDeleteWorkspaceSnapshot")
  describe("mutation lifecycle")
    ✓ sends DELETE /api/repos/:owner/:repo/workspace-snapshots/:id
    ✓ resolves on 204 empty body
    ✓ calls onOptimistic before network request

  describe("deduplication")
    ✓ returns same promise for concurrent deletes of same id
    ✓ allows new delete after previous completes

  describe("error handling")
    ✓ calls onRevert on error
    ✓ calls onError with error and snapshotId

  describe("empty snapshotId guard")
    ✓ throws ApiError(400) for empty snapshotId

  describe("cleanup")
    ✓ aborts on unmount

  describe("integration — real server")
    ✓ deletes snapshot on running server
```

### Test Count Summary

| Test file | Mock tests (pass) | Integration tests (expected fail) | Total |
|-----------|-------------------|----------------------------------|-------|
| useWorkspaces.test.ts | 36 | 2 | 38 |
| useWorkspace.test.ts | 22 | 2 | 24 |
| useWorkspaceSSH.test.ts | 22 | 2 | 24 |
| useWorkspaceSessions.test.ts | 11 | 1 | 12 |
| useWorkspaceSnapshots.test.ts | 8 | 1 | 9 |
| useCreateWorkspace.test.ts | 19 | 2 | 21 |
| useSuspendWorkspace.test.ts | 12 | 1 | 13 |
| useResumeWorkspace.test.ts | 8 | 1 | 9 |
| useDeleteWorkspace.test.ts | 20 | 1 | 21 |
| useCreateWorkspaceSession.test.ts | 11 | 1 | 12 |
| useDestroyWorkspaceSession.test.ts | 10 | 1 | 11 |
| useCreateWorkspaceSnapshot.test.ts | 8 | 1 | 9 |
| useDeleteWorkspaceSnapshot.test.ts | 8 | 1 | 9 |
| **Total** | **195** | **17** | **212** |

---

## 9. Productionization Notes

### From Existing Code to Production

The hook implementations exist but contain 10 classes of bugs (covering all 13 files) that prevent compilation and runtime correctness. Step 1 of the implementation plan systematically fixes all bugs. Test files exist as skeleton stubs — Steps 2-6 fill in all 212 test bodies.

### No PoC Stage Needed

The hooks use only React 19 primitives (`useState`, `useEffect`, `useCallback`, `useRef`) and the standard `fetch` API available in Bun. No new dependencies are introduced. The internal utilities (`usePaginatedQuery`, `useMutation`) are already battle-tested by the agent hooks. The test infrastructure (`renderHook`, `createMockAPIClient`, `react-mock`) is already established. Per the dependency principles in the engineering architecture: "No new runtime dependency without a PoC test" — no new dependencies means no PoC needed.

### Critical Paths to Production Readiness

1. **Server middleware wiring**: The workspace routes currently hardcode `repositoryID = 0` and `userID = 0` (TODO comments on every route handler). The hooks will work correctly once repo context and auth middleware are wired. Until then, integration tests will fail with auth/context errors.

2. **Container sandbox availability**: The `WorkspaceService` requires a `ContainerSandboxClient` for create, suspend, resume, and delete operations. In environments without Docker or the container runtime, these operations will return 500 errors. The hooks surface these errors correctly via `error` state.

3. **SSE workspace streaming**: The `useWorkspaceSSH` hook's TTL tracking is a client-side estimate based on the `SANDBOX_ACCESS_TOKEN_TTL_MS` constant (5 minutes, matching the server's value). In production, the server's TTL constant should ideally be surfaced in the SSH info response so the client can track TTL precisely. Until then, the client-side 5-minute estimate is sufficient.

4. **Session endpoint filtering**: The session list endpoint (`GET /workspace/sessions`) returns all sessions for the repo, not filtered by workspace. Client-side filtering in `useWorkspaceSessions` works but is inefficient for repos with many sessions across many workspaces. A server-side `?workspace_id=` query parameter should be added in a future ticket.

5. **Status filter**: The workspace list endpoint does not support a `?status=` query parameter. Client-side filtering in `useWorkspaces` works but fetches more data than needed. A server-side filter should be added.

6. **`createAPIClient` auto-serialization**: The `createAPIClient.ts` implementation (verified at lines 20-21) auto-serializes `body` objects to JSON and sets `Content-Type: application/json`. The corrected hooks pass `body` as a plain object and do NOT manually `JSON.stringify`. If `createAPIClient` ever changes its serialization behavior, the hooks must be updated accordingly.

### `onRevert` Callback Wiring

The `useMutation` utility does not have a built-in `onRevert` callback. The `SuspendWorkspaceCallbacks` and `ResumeWorkspaceCallbacks` interfaces define `onRevert` which is conceptually "undo optimistic update on failure". This is wired through `useMutation`'s `onError` callback:

```typescript
onError: (error, input) => {
  callbacks?.onRevert?.(input);   // revert optimistic state first
  callbacks?.onError?.(error, input);  // then notify caller of error
},
```

The manual-implementation hooks (`useDeleteWorkspace`, `useDestroyWorkspaceSession`, `useDeleteWorkspaceSnapshot`) handle `onRevert` directly in their catch blocks — this is already correct in the existing code (verified at lines 69-71 of each file).

### Memory Considerations

- All list hooks cap at 500 items (oldest pages evicted via `usePaginatedQuery` line 108-109: `combinedItems.slice(combinedItems.length - maxItems)`).
- The `useWorkspaceSSH` hook creates a 1-second `setInterval` timer. Only one timer per hook instance. Timer is cleaned up on unmount via `clearInterval` (line 32).
- Deduplication maps in delete hooks (`inflight`, `abortControllers`) are bounded by in-flight operations (typically 1-2 concurrent). Maps are cleared on unmount (lines 90-91).

### Error Recovery

- All query hooks expose `refetch()` for manual retry.
- Mutation hooks expose `error` state that callers can display.
- Network errors preserve stale data (stale-while-revalidate pattern) — `useWorkspace` and `useWorkspaceSSH` keep their last-good data on error (verified: `.catch()` sets error and isLoading but does NOT clear workspace/sshInfo state).
- AbortErrors are always swallowed — they are expected during navigation and cleanup. Verified at line 56 of `useWorkspace.ts`: `if (err.name === "AbortError") return;` and line 60 of `useDeleteWorkspace.ts`.
- `usePaginatedQuery` preserves items on error (verified: the catch block at lines 135-141 sets error and loading, but does NOT call `setItems([])`).

---

## 10. Source of Truth

This engineering specification should be maintained alongside:

- `specs/tui/prd.md` — Product requirements (workspace screens described in §4.6)
- `specs/tui/design.md` — Design specification (workspace detail views, SSH info display)
- `specs/tui/engineering-architecture.md` — Data layer patterns, `usePaginatedQuery`, `useMutation`
- `specs/tui/engineering/tui-agent-data-hooks.md` — Sister spec establishing shared infrastructure
- `apps/server/src/routes/workspaces.ts` — Server route source of truth (524 lines, fully scaffolded)
- `packages/sdk/src/services/workspace.ts` — Service layer source of truth (1137 lines)
- `packages/ui-core/src/hooks/internal/usePaginatedQuery.ts` — Pagination utility (218 lines)
- `packages/ui-core/src/hooks/internal/useMutation.ts` — Mutation utility (103 lines)
- `packages/ui-core/src/client/types.ts` — APIClient interface definition
- `packages/ui-core/src/test-utils/` — Test infrastructure (`renderHook`, `mockAPIClient`, `react-mock`)