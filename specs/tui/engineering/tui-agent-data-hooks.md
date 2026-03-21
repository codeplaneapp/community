# Engineering Specification: `tui-agent-data-hooks`

## Title
Implement agent data hooks in `@codeplane/ui-core`

## Status
`Implemented` — The `packages/ui-core/` package exists in `specs/tui/packages/ui-core/` with all six agent data hooks, internal utilities (`usePaginatedQuery`, `useMutation`), type definitions, API client infrastructure, test utilities (custom React mock, `renderHook`, `mockAPIClient`), and comprehensive unit tests. Server agent routes in `apps/server/src/routes/agents.ts` are scaffolded with stub service implementations. `AgentService` is not registered in `apps/server/src/services.ts`. The `useAgentStream` hook (SSE streaming) is also implemented in this package but out of scope for this ticket. The package also includes workspace and issue hooks beyond the agent scope.

## Summary

This ticket creates the foundational data access layer for all agent TUI screens. The deliverable is the `packages/ui-core/` package containing six React hooks that wrap the agent HTTP API endpoints and provide typed, reactive data access with pagination, loading, and error states.

The hooks live in `packages/ui-core/src/hooks/agents/` and are framework-agnostic React 19 hooks consumed by both the TUI (`apps/tui/`) and, in the future, the web UI (`apps/web/`). No TUI-specific rendering code belongs here. The package also establishes the shared `APIClient` context interface, typed error classes, and internal pagination/mutation utilities that all future non-agent hooks reuse.

**Scope boundary:**
- ✅ `packages/ui-core/` — all implementation code
- ✅ `packages/ui-core/src/hooks/agents/__tests__/` — unit tests
- ❌ `apps/tui/src/` — no TUI screen code in this ticket
- ❌ `e2e/tui/` — no E2E tests in this ticket (those are in `tui-agent-e2e-scaffolding`)

---

## 1. Codebase Ground Truth

The following facts about the actual repository drive every decision in this spec:

| Fact | Location | Impact |
|------|----------|--------|
| `specs/tui/packages/ui-core/` contains the full implementation | 60+ source files across types, client, hooks, test-utils, SSE | Implementation exists — spec documents what IS built, not what needs to be built |
| Server agent service is fully stubbed | `apps/server/src/routes/agents.ts` lines 102–129 | Unit tests against real API will fail until service layer ships |
| `AgentService` not in `Services` interface | `apps/server/src/services.ts` — 20 services registered (`UserService`, `RepoService`, `IssueService`, `LabelService`, `MilestoneService`, `LandingService`, `OrgService`, `WikiService`, `SearchService`, `WebhookService`, `WorkflowService`, `NotificationService`, `SecretService`, `ReleaseService`, `OAuth2Service`, `LFSService`, `SSEManager`, `WorkspaceService`, `PreviewService`, `BillingService`), agent not among them | Server routes use inline stub, not service registry |
| `per_page` max is **50** (not 30) | Route line 172: `Math.min(parseInt(query.get("per_page") ?? "30", 10), 50)` | `perPage` option caps at 50 |
| Sessions `GET` sets `X-Total-Count` header | Route line 176: `c.header("X-Total-Count", String(total))` | `useAgentSessions` reads this header |
| Messages `GET` does **not** set `X-Total-Count` | Route lines 293–295: bare `writeJSON(c, 200, messages)` | `useAgentMessages` derives `hasMore` from page fullness heuristic |
| `listMessages` stub returns bare array | Route line 127: `Promise<any[]> => []` | No `{ items, total }` wrapper — just the array |
| `listSessions` stub returns `{ items, total }` | Route line 113 | Sessions list is a paginated wrapper; messages is a bare array |
| `sequence` is a **string** from the DB | `ListAgentMessagesRow.sequence: string` in `agent_sql.ts` | Hook converts to number via `Number()` |
| `messageCount` from list query is a **string** | `ListAgentSessionsByRepoWithMessageCountRow.messageCount: string` in `agent_sql.ts` | Hook converts to number via `Number()` |
| `partIndex` is a **string** from the DB | `ListAgentMessagePartsRow.partIndex: string` in `agent_sql.ts` | Hook converts to number via `Number()` |
| Auth header accepts both `token` and `Bearer` | `apps/server/src/lib/middleware.ts` line 57 | Client uses `Authorization: token {token}` format |
| Error response shape from SDK | `packages/sdk/src/lib/errors.ts` — `{ message: string, errors?: FieldError[] }` | Error parsing handles optional `errors` field |
| Monorepo uses pnpm workspaces | Root `pnpm-workspace.yaml`: `packages: ["apps/*", "packages/*", "specs", "docs"]` | New package auto-discovered under `packages/` |
| Custom React mock for Bun testing | `specs/tui/packages/ui-core/src/test-utils/react-mock.ts` | Implements `useState`, `useEffect`, `useRef`, `useCallback`, `useMemo`, `useContext` for isolated hook testing |
| `renderHook` uses `bun:test` `mock.module` | `specs/tui/packages/ui-core/src/test-utils/renderHook.ts` | Replaces React module entirely for synchronous hook testing |
| SDK `APIError` class is server-side (imports Hono) | `packages/sdk/src/lib/errors.ts` line 1 | Client-side `ApiError` in ui-core is a separate class |
| Delete returns 204 with `c.body(null, 204)` | Route line 217 | Client handles empty body on success |
| POST create session returns 201 | Route line 157 | |
| POST append message returns 201 | Route line 271 | |
| Server dispatches agent run on `role === "user"` | Route lines 258–269 | See §2 note on dispatch failure edge case |
| DB `Date` objects serialized to ISO-8601 by `c.json()` | Hono's `c.json()` calls `JSON.stringify()` | Wire format for timestamps is always ISO-8601 strings |
| Sessions ordered by `created_at DESC` in DB | `agent_sql.ts` | Newest sessions first |
| Messages ordered by `sequence ASC` in DB | `agent_sql.ts` | Hook does not need to re-sort |
| Session list query uses OFFSET not cursor | `agent_sql.ts`: `OFFSET $2` | Page-based pagination, not cursor-based |
| No root `tsconfig.json` at repo root | `packages/sdk/tsconfig.json` extends `../../tsconfig.json` but file may be absent | ui-core `tsconfig.json` is self-contained |
| SDK package uses `"main": "src/index.ts"` | `packages/sdk/package.json` | Bun resolves `.ts` directly — no build step needed |
| `useAgentStream` also implemented | `specs/tui/packages/ui-core/src/hooks/agents/useAgentStream.ts` | SSE streaming hook exists alongside the six data hooks |
| Server normalizes bare string content | Route `normalizeAgentMessagePartContent` at line 74 wraps bare strings to `{ value: string }` for text parts | Client sends raw content; server normalizes |
| Validation order on server | Route lines 242–251: role validated first, then parts via `normalizeAgentMessageParts()` | Client mirrors this order in `useSendAgentMessage` |

---

## 2. API Contract Reference

All endpoints are repository-scoped under `/api/repos/:owner/:repo/agent/sessions`.

**Source of truth**: `apps/server/src/routes/agents.ts`

| Endpoint | Method | Success | Request Body | Response Body | Response Headers |
|----------|--------|---------|-------------|---------------|------------------|
| `/agent/sessions` | `GET` | 200 | — | `AgentSession[]` | `X-Total-Count: N` |
| `/agent/sessions` | `POST` | 201 | `{ title: string }` | `AgentSession` | — |
| `/agent/sessions/:id` | `GET` | 200 | — | `AgentSession` | — |
| `/agent/sessions/:id` | `DELETE` | 204 | — | (empty body) | — |
| `/agent/sessions/:id/messages` | `GET` | 200 | — | `AgentMessage[]` | ⚠️ **no `X-Total-Count`** |
| `/agent/sessions/:id/messages` | `POST` | 201 | `{ role, parts }` | `AgentMessage` | — |
| `/agent/sessions/:id/stream` | `GET` | 501 | — | `{ message }` | — |

**Pagination query parameters** (list endpoints):
- `page`: integer ≥ 1, default 1
- `per_page`: integer 1–50, default 30, server hard-caps at 50

**Authentication header**: `Authorization: token {token}` (injected by `APIClientProvider`). Server also accepts `Bearer` scheme but client uses `token` for consistency.

**Error response shape** (all non-2xx):
```json
{ "message": "error description", "errors": [{ "resource": "...", "field": "...", "code": "..." }] }
```
The `errors` array is optional (only present for validation failures). The `code` values are: `missing`, `missing_field`, `invalid`, `already_exists`.

**Agent run dispatch edge case**: When `role === "user"`, the server calls `service.dispatchAgentRun()` after successfully persisting the message via `appendMessage()` (line 255). The execution order is:
1. `service.appendMessage(id, role, normalized)` → message persisted to DB ✅
2. `service.dispatchAgentRun(...)` → may throw ❌
3. If dispatch throws: `writeRouteError(c, dispatchErr)` returns a non-2xx error (line 267)
4. If dispatch succeeds: `writeJSON(c, 201, msg)` returns the message (line 271)

This means when dispatch fails, the hook's `onError` callback fires **even though the message was successfully persisted to the database**. The hook treats this as a normal error — the caller (TUI screen) should handle this by refetching messages on retry rather than re-sending the same message.

**Server-side validation constants (exact match required):**
```typescript
const VALID_AGENT_MESSAGE_ROLES = new Set(["user", "assistant", "system", "tool"]);
const VALID_AGENT_MESSAGE_PART_TYPES = new Set(["text", "tool_call", "tool_result"]);
```

---

## 3. Type Definitions

### 3.1 File: `packages/ui-core/src/types/agents.ts`

```typescript
export type AgentSessionStatus =
  | "active"
  | "completed"
  | "failed"
  | "timed_out"
  | "pending";

export type AgentMessageRole =
  | "user"
  | "assistant"
  | "system"
  | "tool";

export type AgentPartType =
  | "text"
  | "tool_call"
  | "tool_result";

export interface AgentSession {
  id: string;
  repositoryId: string;
  userId: string;
  workflowRunId: string | null;
  title: string;
  status: AgentSessionStatus;
  startedAt: string | null;    // ISO-8601 or null
  finishedAt: string | null;   // ISO-8601 or null
  createdAt: string;           // ISO-8601
  updatedAt: string;           // ISO-8601
  messageCount?: number;       // present when using list-with-count endpoint
}

export interface AgentPart {
  id: string;
  messageId: string;
  partIndex: number;           // server sends as string; hook coerces to number
  partType: AgentPartType;
  content: unknown;            // shape varies by partType
  createdAt: string;           // ISO-8601
}

export interface AgentMessage {
  id: string;
  sessionId: string;
  role: AgentMessageRole;
  sequence: number;            // server sends as string; hook coerces to number
  createdAt: string;           // ISO-8601
  parts?: AgentPart[];         // populated when server includes inline parts
}

export interface CreateAgentSessionRequest {
  title: string;
}

export interface CreateAgentMessageRequest {
  role: AgentMessageRole;
  parts: Array<{
    type: AgentPartType;
    content: unknown;
  }>;
}

export interface AgentSessionsOptions {
  page?: number;
  perPage?: number;            // capped at 50 client-side
  status?: AgentSessionStatus; // future: server ignores this param today
  enabled?: boolean;           // defaults to true; false skips initial fetch
}

export interface AgentMessagesOptions {
  page?: number;
  perPage?: number;            // capped at 50 client-side
  enabled?: boolean;
  autoPaginate?: boolean;      // fetch all pages sequentially (for replay mode)
}
```

### 3.2 File: `packages/ui-core/src/types/errors.ts`

```typescript
export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "UNPROCESSABLE"
  | "SERVER_ERROR"
  | "ABORTED"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly detail: string;
  readonly fieldErrors?: Array<{ resource: string; field: string; code: string }>;

  constructor(
    status: number,
    detail: string,
    fieldErrors?: Array<{ resource: string; field: string; code: string }>,
  ) {
    super(`API ${status}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.code = mapStatusToCode(status);
    this.detail = detail;
    this.fieldErrors = fieldErrors;
  }
}

export class NetworkError extends Error {
  readonly code: "NETWORK_ERROR" = "NETWORK_ERROR";

  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "NetworkError";
  }
}

export type HookError = ApiError | NetworkError;

function mapStatusToCode(status: number): ApiErrorCode {
  switch (status) {
    case 400: return "BAD_REQUEST";
    case 401: return "UNAUTHORIZED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 422: return "UNPROCESSABLE";
    case 429: return "RATE_LIMITED";
  }
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}

export async function parseResponseError(response: Response): Promise<ApiError> {
  let detail = response.statusText || `HTTP ${response.status}`;
  let fieldErrors: ApiError["fieldErrors"];

  try {
    const body = await response.json() as {
      message?: string;
      errors?: ApiError["fieldErrors"];
    };
    if (body.message) detail = body.message;
    if (body.errors?.length) fieldErrors = body.errors;
  } catch {
    // Ignore JSON parse failure — use statusText as detail
  }

  return new ApiError(response.status, detail, fieldErrors);
}
```

### 3.3 File: `packages/ui-core/src/types/index.ts`

Barrel re-export for all type modules (agents, errors, issues, workspaces, agentStream).

---

## 4. API Client Infrastructure

### 4.1 File: `packages/ui-core/src/client/types.ts`

```typescript
export interface APIClient {
  baseUrl: string;
  request(path: string, options?: APIRequestOptions): Promise<Response>;
}

export interface APIRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}
```

### 4.2 File: `packages/ui-core/src/client/createAPIClient.ts`

- Factory function that takes `{ baseUrl, token }` config.
- Returns an `APIClient` that injects `Authorization: token {token}` header.
- Auto-sets `Content-Type: application/json` when body is present.
- Serializes body via `JSON.stringify()` when body is an object.
- Wraps fetch errors (non-AbortError) in `NetworkError`.
- Passes `AbortError` through for hook cleanup.

### 4.3 File: `packages/ui-core/src/client/context.ts`

- React Context for `APIClient` (nullable, default `null`).
- `APIClientProvider` export (the context's `.Provider`).
- `useAPIClient()` hook that reads from context and throws `Error("useAPIClient must be used within an APIClientProvider")` if called outside the provider (context value is null).

---

## 5. Internal Utilities

### 5.1 `usePaginatedQuery` — `packages/ui-core/src/hooks/internal/usePaginatedQuery.ts`

Shared pagination engine (218 lines). **Not exported** from the package public API.

**Config interface:**
```typescript
export interface PaginatedQueryConfig<T> {
  client: APIClient;
  path: string;
  cacheKey: string;              // JSON-serialized deps — change triggers hard reset
  perPage: number;
  enabled: boolean;
  maxItems: number;              // 500 for sessions, 10_000 for messages
  autoPaginate: boolean;         // fetch all pages sequentially
  parseResponse: (data: unknown, headers: Headers) => {
    items: T[];
    totalCount: number | null;   // null when header absent
  };
}
```

**Result interface:**
```typescript
export interface PaginatedQueryResult<T> {
  items: T[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
}
```

**Behavior contract:**

The hook distinguishes three state-reset triggers:

**A. Hard reset (cacheKey change):** Aborts in-flight via `abortControllerRef`, clears items/totalCount/error, resets `pageRef` to 1, resets `lastPageItemCountRef` to 0. If `enabled`, starts new fetch for page 1. If `!enabled`, sets `isLoading = false`.

**B. Soft reset (refetch):** Aborts in-flight, increments `refetchCounter` state, resets page to 1 and clears error. Items are preserved (stale-while-revalidate). On successful response, items are replaced with page 1 results since `fetchPage` replaces items when `pageToFetch === 1`.

**C. Enabled transitions:**
- `true → false`: Abort, clear items/totalCount/error, reset page, set `isLoading = false`.
- `false → true`: Detected via effect re-run — starts initial fetch from page 1.

**Fetch cycle details:**
1. Constructs URL: `${path}${separator}page=${pageToFetch}&per_page=${perPage}` (handles existing `?` in path via `?`/`&` detection).
2. On success: calls `parseResponse(jsonBody, headers)`. When `pageToFetch === 1`, items are replaced. When `pageToFetch > 1`, items are appended via spread operator.
3. `hasMore` with `totalCount`: `items.length < totalCount`.
4. `hasMore` without `totalCount`: `lastPageItemCountRef.current === perPage`.
5. Memory cap: if `combinedItems.length > maxItems` after append, slices from the end via `combinedItems.slice(combinedItems.length - maxItems)` (keeps newest).
6. `autoPaginate`: after each successful page, if `hasMore`, recursively calls `fetchPage(pageToFetch + 1, false, combinedItems)`. `isLoading` remains `true` throughout until the final page.
7. AbortController per fetch cycle. AbortError caught silently (just `return`).
8. `isMounted` guard on all state updates.

**Implementation note on `hasMore` computation (lines 191–193):** The `hasMore` value is computed outside the `fetchPage` callback, inline in the hook body. It calls `config.parseResponse([], new Headers())` to detect whether `totalCount` would be non-null. If `totalCount` is non-null (session-style), it uses `items.length < totalCount`. Otherwise (message-style), it uses `lastPageItemCountRef.current === perPage`. This probes the `parseResponse` function with empty data to determine the counting strategy.

**Refetch counter logic (lines 182–187):** The effect watches `[cacheKey, enabled, refetchCounter]`. If `refetchCounter > 0`, it calls `fetchPage(1, true, items)` (soft refetch with existing items). If `refetchCounter === 0` (initial load), it calls `fetchPage(1, false, [])` (clean fetch). The `refetch` function increments this counter via `setRefetchCounter(c => c + 1)` and also aborts in-flight and clears error.

### 5.2 `useMutation` — `packages/ui-core/src/hooks/internal/useMutation.ts`

Shared mutation state (103 lines). **Not exported** from the package public API.

**Config interface:**
```typescript
export interface MutationConfig<TInput, TOutput> {
  mutationFn: (input: TInput, signal: AbortSignal) => Promise<TOutput>;
  onOptimistic?: (input: TInput) => void;
  onSuccess?: (output: TOutput, input: TInput) => void;
  onError?: (error: HookError, input: TInput) => void;
  onSettled?: (input: TInput) => void;
}
```

**Result interface:**
```typescript
export interface MutationResult<TInput, TOutput> {
  mutate: (input: TInput) => Promise<TOutput>;
  isLoading: boolean;
  error: HookError | null;
  reset: () => void;
}
```

**Behavior contract:**
1. **Double-submit prevention:** If `isLoading` is true, returns `Promise.reject(new Error("mutation in progress"))`.
2. **Config ref:** Stores config in a `useRef` and updates it via `useEffect([config])` to avoid stale closures.
3. **Lifecycle:** Clear error → set loading → call `onOptimistic(input)` → call `mutationFn(input, signal)` → on success: clear loading (if mounted), call `onSuccess(result, input)`, call `onSettled(input)`, return result → on error: set error state (if mounted), clear loading (if mounted), call `onError(err, input)`, call `onSettled(input)`, re-throw.
4. **AbortError:** Not set as error state. Not passed to `onError` or `onSettled`. Propagated as rejection to caller via `Promise.reject(err)`.
5. **`isMounted` guard** on all state updates (`setIsLoading`, `setError`).
6. **`reset()`:** Clears error and isLoading to initial state.

---

## 6. Hook Signatures and Behavior

### 6.1 `useAgentSessions(owner, repo, options?)`

**File**: `packages/ui-core/src/hooks/agents/useAgentSessions.ts` (60 lines)

**Signature**:
```typescript
export function useAgentSessions(
  owner: string,
  repo: string,
  options?: AgentSessionsOptions,
): {
  sessions: AgentSession[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
};
```

**Implementation details**:
- Delegates to `usePaginatedQuery<AgentSession>`.
- Path: `/api/repos/${owner}/${repo}/agent/sessions`.
- `cacheKey = JSON.stringify({ owner, repo, perPage, status })`.
- `parseResponse`: reads `X-Total-Count` header via `headers.get("X-Total-Count")`. Parses to int. Falls back to `0` if header absent. Returns `{ items: coercedSessions, totalCount: headerValue }`. Note: `totalCount` is always a number (never `null`) since the fallback is `0`.
- Coerces `messageCount` from string to number via `coerceSession()` helper: `raw.messageCount != null ? Number(raw.messageCount) : undefined`.
- `maxItems = 500`, `autoPaginate = false`.
- `perPage` capped at 50 client-side: `Math.min(options?.perPage ?? 30, 50)`.
- `enabled` defaults to `true`: `options?.enabled ?? true`.
- Return aliases: `sessions` → `query.items`, all other fields pass through directly.

**Verified behavior from tests:**
- Default fetch path: `/api/repos/o/r/agent/sessions?page=1&per_page=30`
- Custom `perPage: 100` caps to `?per_page=50`
- `hasMore=true` when `sessions.length < totalCount` (from X-Total-Count)
- `hasMore=false` when header absent (fallback `totalCount=0`, `0 < 0` is false)
- Hard reset on param change: items cleared immediately, re-fetch starts
- Soft reset on refetch: items preserved during re-fetch
- Memory cap: evicts oldest items when exceeding 500 (keeps newest via slice)

### 6.2 `useAgentSession(owner, repo, sessionId)`

**File**: `packages/ui-core/src/hooks/agents/useAgentSession.ts` (118 lines)

**Signature**:
```typescript
export function useAgentSession(
  owner: string,
  repo: string,
  sessionId: string,
): {
  session: AgentSession | null;
  isLoading: boolean;
  error: HookError | null;
  refetch: () => void;
};
```

**Implementation details**:
- Simple single-resource fetch — does NOT use `usePaginatedQuery`.
- Path: `/api/repos/${owner}/${repo}/agent/sessions/${sessionId}`.
- **Empty `sessionId` guard**: If `!sessionId.trim()`, sets `session = null`, `isLoading = false`, `error = null`, returns early (no fetch).
- **Stale-while-revalidate**: `session` preserved during refetch. Only replaced on successful response via `setSession(newSession)`. Error path sets error state but does NOT call `setSession(null)` — stale data preserved.
- **Param change detection** via `lastParams` ref comparing `{ owner, repo, sessionId }`. On change: updates ref, aborts in-flight, calls `fetchSession()`.
- **Refetch mechanism**: Two effects — one for param changes, one for `[fetchSession, refetchCounter]`. `refetch()` increments `refetchCounter` state, triggering the effect.
- Coerces `messageCount` from string to number if present: `raw.messageCount != null ? Number(raw.messageCount) : undefined`.
- AbortController in ref. Aborted on param change, on new fetch start, and on unmount.
- Error handling: non-ok response → `parseResponseError(response)` → `setError(parsedError)`. Catch block: AbortError silently returns, other errors wrapped in `NetworkError` if not already one.

### 6.3 `useAgentMessages(owner, repo, sessionId, options?)`

**File**: `packages/ui-core/src/hooks/agents/useAgentMessages.ts` (63 lines)

**Signature**:
```typescript
export function useAgentMessages(
  owner: string,
  repo: string,
  sessionId: string,
  options?: AgentMessagesOptions,
): {
  messages: AgentMessage[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
};
```

**Implementation details**:
- Delegates to `usePaginatedQuery<AgentMessage>`.
- Path: `/api/repos/${owner}/${repo}/agent/sessions/${sessionId}/messages`.
- **No `X-Total-Count` on this endpoint.** `parseResponse` returns `{ items: coercedMessages, totalCount: null }`, triggering the last-page-full heuristic in `usePaginatedQuery`.
- `totalCount` in returned result = `query.items.length` (running count of loaded messages, NOT from internal `query.totalCount`).
- **Empty `sessionId` guard**: Overrides `enabled = false` when `!sessionId.trim()`: `const enabled = (!sessionId.trim()) ? false : (options?.enabled ?? true)`.
- `cacheKey = JSON.stringify({ owner, repo, sessionId, perPage })` — includes `sessionId` in cache key so changing session triggers hard reset.
- Coerces `sequence` and `partIndex` from string to number via `coerceMessage()` helper:
  ```typescript
  function coerceMessage(raw: any): AgentMessage {
    return {
      ...raw,
      sequence: Number(raw.sequence),
      parts: raw.parts?.map((p: any) => ({ ...p, partIndex: Number(p.partIndex) })),
    };
  }
  ```
- `maxItems = 10_000`, `autoPaginate` from options (default `false`).

**Verified behavior from tests:**
- `hasMore=true` when last page has exactly `perPage` items (30 by default)
- `hasMore=false` when last page has fewer than `perPage` items
- `hasMore=false` when last page is empty
- `totalCount` equals `messages.length` (running count)
- `autoPaginate: true` fetches pages sequentially: page 1 resolves → `isLoading` stays `true` → page 2 fetches → if page 2 < perPage, `isLoading` becomes `false`
- `autoPaginate` stops on error, preserves partially loaded messages
- `autoPaginate` aborts remaining fetches on unmount
- Refetch during `autoPaginate` aborts current cycle and restarts from page 1

### 6.4 `useCreateAgentSession(owner, repo)`

**File**: `packages/ui-core/src/hooks/agents/useCreateAgentSession.ts` (54 lines)

**Signature**:
```typescript
export function useCreateAgentSession(
  owner: string,
  repo: string,
): {
  mutate: (input: { title: string }) => Promise<AgentSession>;
  isLoading: boolean;
  error: HookError | null;
};
```

**Implementation details**:
- Delegates to `useMutation`.
- **Two-layer validation**: The outer `mutate` wrapper performs synchronous validation (trims title, throws `ApiError(400, "title is required")` if empty). This prevents the mutation from entering loading state. The `mutationFn` inside `useMutation` also validates as a safety net (same check).
- `POST /api/repos/${owner}/${repo}/agent/sessions` with body `{ title: trimmedTitle }`.
- Expects 201 status. Non-201 → `parseResponseError(response)` → thrown.
- Returns `response.json()` directly (no coercion needed on create).
- Double-submit prevention via `useMutation`'s `isLoading` guard.

**Verified behavior from tests:**
- Empty title throws synchronously (not via rejected promise) with `ApiError` code `BAD_REQUEST`
- Whitespace-only title rejected
- Title trimmed before sending: `"  trimmed  "` → body contains `"trimmed"`
- POST path: `/api/repos/o/r/agent/sessions`
- Method: `POST`
- Second mutate while first in-flight rejects with `"mutation in progress"`

### 6.5 `useDeleteAgentSession(owner, repo, callbacks?)`

**File**: `packages/ui-core/src/hooks/agents/useDeleteAgentSession.ts` (120 lines)

**Signature**:
```typescript
export interface DeleteAgentSessionCallbacks {
  onOptimistic?: (sessionId: string) => void;
  onRevert?: (sessionId: string) => void;
  onError?: (error: HookError, sessionId: string) => void;
  onSettled?: (sessionId: string) => void;
}

export function useDeleteAgentSession(
  owner: string,
  repo: string,
  callbacks?: DeleteAgentSessionCallbacks,
): {
  mutate: (sessionId: string) => Promise<void>;
  isLoading: boolean;
  error: HookError | null;
};
```

**Implementation details**:
- Does NOT use `useMutation` — uses manual state management for concurrent deduplication.
- **Deduplication**: Maintains `Map<string, Promise<void>>` ref (`inflightRef`). If `mutate(sessionId)` called while existing delete for same `sessionId` is in-flight, returns the existing promise. Does NOT call `onOptimistic` again for deduplicated calls.
- **Empty `sessionId` guard**: Returns `Promise.reject(new Error("session id is required"))` if `!sessionId.trim()`.
- **Optimistic callback**: `callbacks.onOptimistic?.(sessionId)` called synchronously before network request (only on first call per sessionId).
- `DELETE /api/repos/${owner}/${repo}/agent/sessions/${sessionId}`. Expects 204.
- Non-204 response → `parseResponseError(response)` → thrown.
- Per-session AbortController stored in `abortControllersRef` Map. All aborted on unmount.
- `isLoading = activeCount > 0` (tracked via `useState` counter, incremented/decremented).
- Callbacks stored in ref via `useEffect([callbacks])` to avoid stale closures.
- **Error path**: catch block wraps non-HookError errors in `NetworkError`. Calls `onRevert`, `onError`, `onSettled` in order (if mounted). Sets error state. Re-throws.
- **Success path**: calls `onSettled` only (if mounted).
- **Finally block**: cleans up `inflightRef`, `abortControllersRef`, and decrements `activeCount` (if mounted).

**Verified behavior from tests:**
- DELETE path: `/api/repos/o/r/agent/sessions/1`
- Method: `DELETE`
- `onOptimistic` called with sessionId synchronously before request
- `onSettled` called on success and failure
- `onRevert` and `onError` called on failure
- Same promise returned for concurrent deletes of same sessionId
- `onOptimistic` called only once for deduplicated calls
- Different sessionIds can be deleted concurrently (different promises)

### 6.6 `useSendAgentMessage(owner, repo, sessionId, callbacks?)`

**File**: `packages/ui-core/src/hooks/agents/useSendAgentMessage.ts` (102 lines)

**Signature**:
```typescript
export interface SendAgentMessageCallbacks {
  onOptimistic?: (tempMessage: AgentMessage) => void;
  onSettled?: (tempId: string, serverMessage: AgentMessage | null) => void;
  onRevert?: (tempId: string) => void;
  onError?: (error: HookError, tempId: string) => void;
}

export function useSendAgentMessage(
  owner: string,
  repo: string,
  sessionId: string,
  callbacks?: SendAgentMessageCallbacks,
): {
  send: (input: CreateAgentMessageRequest) => Promise<AgentMessage>;
  sending: boolean;
  error: HookError | null;
};
```

**Implementation details**:
- Delegates to `useMutation` with a compound input type `{ input: CreateAgentMessageRequest; tempId: string; tempMessage: AgentMessage }`.
- **Client-side validation** (`validateInput` helper, throws `ApiError(400, ...)`). Validation is synchronous and runs in `send()` BEFORE calling `mutation.mutate()`:
  1. Trims `role` via `(input.role ?? "").trim()`. Must be one of `["user", "assistant", "system", "tool"]` (checked via `.includes()`). Throws `ApiError(400, "invalid role")` otherwise.
  2. `parts` must exist, be an array (`Array.isArray`), and be non-empty. Throws `ApiError(400, "parts are required")`.
  3. Each part `type` must be one of `["text", "tool_call", "tool_result"]`. Throws `ApiError(400, "invalid part type")`.
  4. Each part `content` must not be `null` or `undefined`. Throws `ApiError(400, "part content is required")`.
  - Validation order mirrors server (role → parts existence → part types → part content).
- **Temporary message construction** (in `send()`, after validation, before mutation):
  - `id = "tmp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8)`
  - `sessionId` from hook params
  - `role` from input (trimmed, cast to `any`)
  - `sequence = -1` (sentinel value)
  - `createdAt = new Date().toISOString()`
  - `parts = undefined` (temp messages don't carry parsed parts)
- `onOptimistic` on `useMutation` destructures `{ tempMessage }` and calls `callbacks?.onOptimistic?.(tempMessage)`.
- `onSuccess` on `useMutation` destructures `(serverMessage, { tempId })` and calls `callbacks?.onSettled?.(tempId, serverMessage)`.
- `onError` on `useMutation` destructures `(error, { tempId })` and calls: `callbacks?.onRevert?.(tempId)`, `callbacks?.onError?.(error, tempId)`, `callbacks?.onSettled?.(tempId, null)`.
- Coerces `sequence` to number in `mutationFn`: `{ ...raw, sequence: Number(raw.sequence) }`.
- `POST /api/repos/${owner}/${repo}/agent/sessions/${sessionId}/messages` with body `{ role: input.role.trim(), parts: input.parts }`.
- `send` aliases to the outer wrapper function. `sending` aliases `mutation.isLoading`.

**Verified behavior from tests:**
- Invalid role throws synchronously with `"invalid role"`
- Empty parts throws with `"parts are required"`
- `undefined` parts throws with `"parts are required"`
- Non-array parts throws with `"parts are required"`
- Invalid part type throws with `"invalid part type"`
- `null` content throws with `"part content is required"`
- `undefined` content throws with `"part content is required"`
- All validation errors are `instanceof ApiError` with code `BAD_REQUEST`
- Role validated before parts (order test)
- Role trimmed: `" user "` accepted as valid
- No network request on validation failure
- Temp message `id` starts with `"tmp_"`, has `sequence = -1`, correct `role` and `sessionId`
- Consecutive calls produce unique temp ids
- Response `sequence` coerced: `"5"` → `5`
- `onSettled(tempId, serverMessage)` on success
- `onSettled(tempId, null)` on error
- `onRevert(tempId)` and `onError(error, tempId)` on error
- Double-submit: `"mutation in progress"`

---

## 7. TUI Type Reconciliation

The existing `apps/tui/src/screens/Agents/types.ts` defines local types that differ from the ui-core canonical types:

| Field | ui-core (canonical) | TUI (local) | Resolution |
|-------|-------------------|-------------|------------|
| `timestamp` / `createdAt` | `createdAt: string` | `timestamp: string` | TUI display adapter maps `createdAt → timestamp` |
| `streaming` | absent | `streaming?: boolean` | TUI extends canonical type with display-only field |
| `sendStatus` | absent | `sendStatus?: "pending" \| "sent" \| "failed"` | TUI `ChatMessage` adds status tracking |
| `clientId` | absent | `clientId?: string` | TUI `ChatMessage` adds client-side tracking ID |
| `parts` | `AgentPart[]` (server shape with `content: unknown`) | `MessagePart[]` (discriminated union with typed content) | TUI narrows `AgentPart.content: unknown` to discriminated union |
| `MessageRole` / `AgentMessageRole` | `AgentMessageRole` | `MessageRole` | Identical values — TUI should import from ui-core |

**Resolution strategy** (responsibility of the TUI agent screen tickets, not this ticket):
- ui-core `AgentMessage` is canonical (wire type, server shape).
- TUI creates `ChatMessage` type that extends the canonical type with display-only fields.
- `MessageRole` and `AgentMessageRole` are identical — TUI should import from ui-core.

---

## 8. Test Utilities

### 8.1 React Mock — `packages/ui-core/src/test-utils/react-mock.ts`

A minimal React hook environment for Bun that does NOT require `react-dom` or `react-test-renderer`. Implements:

- `useState<T>`: Tracks state in a shared `hooks[]` array by index. Setter triggers `pendingStateUpdates` flag and optional `resolveUpdate` callback.
- `useEffect`: Dependency tracking via previous-deps comparison. Queues effect functions for execution after render cycle.
- `useRef<T>`: Returns persistent `{ current: T }` object.
- `useCallback<T>`: Memoizes callback function by deps comparison.
- `useMemo<T>`: Memoizes factory result by deps comparison.
- `useContext`: Returns `state.currentContextValue` (set by `renderHook` from `options.apiClient`).

The module is injected via `bun:test`'s `mock.module("react", ...)` in `renderHook.ts`.

### 8.2 `renderHook` — `packages/ui-core/src/test-utils/renderHook.ts`

```typescript
export interface RenderHookResult<T> {
  result: { current: T };
  rerender: (props?: Record<string, unknown>) => void;
  unmount: () => void;
  waitForNextUpdate: (timeoutMs?: number) => Promise<void>;
}

export interface RenderHookOptions {
  apiClient?: APIClient;
}

export function renderHook<T>(
  hookFn: () => T,
  options?: RenderHookOptions,
): RenderHookResult<T>;
```

**Render cycle mechanics:**
1. Resets React mock state (hook index, hooks array, effects, unmounts).
2. Sets `currentContextValue` from `options.apiClient`.
3. Executes `hookFn()` to capture initial result.
4. Processes queued effects (executing them and storing cleanups).
5. If state was updated during render/effects, loops (`renderCycle()` is recursive on `pendingStateUpdates`).

**`waitForNextUpdate`:** If `pendingStateUpdates` is already true, immediately runs a render cycle. Otherwise creates a promise that resolves when `state.resolveUpdate` fires (triggered by `useState` setter). Times out after `timeoutMs` (default 1000ms).

**`rerender`:** Re-runs the hook function with the same closure. The test mutates captured variables before calling `rerender()` to simulate prop changes.

**`unmount`:** Runs all cleanup functions stored during effect processing.

### 8.3 `mockAPIClient` — `packages/ui-core/src/test-utils/mockAPIClient.ts`

```typescript
export interface MockAPIClient extends APIClient {
  calls: MockCall[];
  respondWith(response: Response): void;
  respondWithJSON(status: number, body: unknown, headers?: Record<string, string>): void;
  respondWithError(error: Error): void;
  reset(): void;
  callsTo(pathPattern: string | RegExp): MockCall[];
}

export function createMockAPIClient(baseUrl?: string): MockAPIClient;
```

- FIFO response queue (array of `Response | Error`).
- Records all calls with path, options, and timestamp in `calls[]` array.
- Falls back to 500 with warning when queue is empty.
- `respondWithJSON` auto-sets `Content-Type: application/json` and optionally merges extra headers.
- `respondWithError` queues an Error that will be thrown by the mock `request()` method.
- `callsTo` filters by string `includes()` or regex `test()`.

---

## 9. Implementation Plan

Each step is a vertical slice that produces compilable, testable code. Since the implementation exists in `specs/tui/packages/ui-core/`, these steps describe what must be done to materialize the code into the live `packages/ui-core/` directory.

### Step 1 — Package scaffold and type definitions

**Files created:**
- `packages/ui-core/package.json`
- `packages/ui-core/tsconfig.json`
- `packages/ui-core/src/index.ts`
- `packages/ui-core/src/types/index.ts`
- `packages/ui-core/src/types/agents.ts`
- `packages/ui-core/src/types/errors.ts`
- `packages/ui-core/src/client/index.ts`
- `packages/ui-core/src/client/types.ts`
- `packages/ui-core/src/client/context.ts`
- `packages/ui-core/src/client/createAPIClient.ts`

**`package.json` key fields:**
```json
{
  "name": "@codeplane/ui-core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "check": "tsc --noEmit",
    "test": "bun test src/"
  },
  "peerDependencies": { "react": "^19.0.0" },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
```

**`tsconfig.json`** (self-contained — does NOT extend absent root tsconfig):
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

**Done when:** `cd packages/ui-core && pnpm tsc --noEmit` passes. `pnpm ls @codeplane/ui-core` resolves from workspace root.

### Step 2 — Test utilities

**Files created:**
- `packages/ui-core/src/test-utils/index.ts`
- `packages/ui-core/src/test-utils/react-mock.ts`
- `packages/ui-core/src/test-utils/renderHook.ts`
- `packages/ui-core/src/test-utils/mockAPIClient.ts`

The React mock implements a synchronous hook environment. `renderHook` uses `bun:test`'s `mock.module("react", ...)` to inject the mock, then runs hook functions in a controlled render cycle. `mockAPIClient` provides a FIFO response queue for testing API interactions.

**Done when:** `import { renderHook, createMockAPIClient } from './test-utils'` compiles. A trivial `renderHook(() => useState(0))` test passes.

### Step 3 — `errors.test.ts`

**File created:** `packages/ui-core/src/types/__tests__/errors.test.ts`

This is the canary test — 24 assertions that validate all error type behavior with zero server dependency.

**Done when:** `bun test packages/ui-core/src/types/__tests__/errors.test.ts` — all tests pass.

### Step 4 — Internal utilities

**Files created:**
- `packages/ui-core/src/hooks/internal/usePaginatedQuery.ts`
- `packages/ui-core/src/hooks/internal/useMutation.ts`

**Done when:** TypeScript compiles. Tested indirectly via hook tests.

### Step 5 — `useAgentSession` + tests

**Files created:**
- `packages/ui-core/src/hooks/agents/useAgentSession.ts`
- `packages/ui-core/src/hooks/agents/__tests__/useAgentSession.test.ts`

Simplest hook (no pagination). Validates single-resource fetch, abort cleanup, stale-while-revalidate, empty sessionId guard, and error handling.

**Done when:** All mock-client and error-handling tests pass.

### Step 6 — `useAgentSessions` + tests

**Files created:**
- `packages/ui-core/src/hooks/agents/useAgentSessions.ts`
- `packages/ui-core/src/hooks/agents/__tests__/useAgentSessions.test.ts`

**Done when:** All tests pass (initial state, fetch lifecycle, hasMore, fetchMore, refetch, param changes, enabled, abort, memory cap, error handling).

### Step 7 — `useAgentMessages` + tests

**Files created:**
- `packages/ui-core/src/hooks/agents/useAgentMessages.ts`
- `packages/ui-core/src/hooks/agents/__tests__/useAgentMessages.test.ts`

Most complex: last-page-full heuristic, auto-pagination mode, 10k cap, sequence coercion.

**Done when:** All tests pass (initial state, fetch lifecycle, hasMore heuristic, totalCount running count, fetchMore, refetch, param changes, empty sessionId guard, enabled, abort, autoPaginate, memory cap, error handling).

### Step 8 — `useCreateAgentSession` + tests

**Files created:**
- `packages/ui-core/src/hooks/agents/useCreateAgentSession.ts`
- `packages/ui-core/src/hooks/agents/__tests__/useCreateAgentSession.test.ts`

**Done when:** All tests pass (validation, mutation lifecycle, double-submit, error handling).

### Step 9 — `useDeleteAgentSession` + tests

**Files created:**
- `packages/ui-core/src/hooks/agents/useDeleteAgentSession.ts`
- `packages/ui-core/src/hooks/agents/__tests__/useDeleteAgentSession.test.ts`

**Done when:** All tests pass (mutation lifecycle, optimistic callbacks, deduplication, error handling, cleanup).

### Step 10 — `useSendAgentMessage` + tests

**Files created:**
- `packages/ui-core/src/hooks/agents/useSendAgentMessage.ts`
- `packages/ui-core/src/hooks/agents/__tests__/useSendAgentMessage.test.ts`

**Done when:** All tests pass (validation, optimistic message, mutation lifecycle, settled/error callbacks, double-submit, error handling).

### Step 11 — Barrel exports and integration type-check

**Files created/updated:**
- `packages/ui-core/src/hooks/agents/index.ts`
- `packages/ui-core/src/index.ts` (final version)

**Verification:**
```typescript
// This must compile from apps/tui/
import {
  useAgentSessions,
  useAgentSession,
  useAgentMessages,
  useCreateAgentSession,
  useDeleteAgentSession,
  useSendAgentMessage,
  APIClientProvider,
  useAPIClient,
  createAPIClient,
  ApiError,
  NetworkError,
} from "@codeplane/ui-core";
```

**Done when:** Import resolves from `apps/tui/`. `cd packages/ui-core && pnpm tsc --noEmit` passes. `bun test packages/ui-core/src/` runs all test files and all tests pass.

---

## 10. Unit & Integration Tests

### Framework

`bun:test` for all unit/integration tests within `packages/ui-core/`. `@microsoft/tui-test` is **NOT** used here — that is for terminal E2E tests in `e2e/tui/`. Hook tests use `renderHook` and `mockAPIClient` from the test-utils.

### Testing Strategy

All tests use the mock API client. The custom React mock enables synchronous hook testing without `react-dom`. Tests fall into categories:

1. **Pure logic tests** — Error types, validation. No React, no server. Always pass.
2. **Hook behavior tests with mock client** — Verify state transitions, cleanup, validation. All pass with mock responses.
3. **Error mapping tests** — Verify error classification for various HTTP status codes. Pass with mock client returning non-2xx responses.

**Note:** ALL tests in the current implementation use mock clients and are designed to pass without a real server. Integration tests against a real server are NOT included in this package — those are covered by E2E tests in `e2e/tui/agents.test.ts`.

### Test Inventory

#### `packages/ui-core/src/types/__tests__/errors.test.ts` (24 assertions)

```
describe("ApiError")
  ✓ constructor sets status, code, detail, message, name
  ✓ maps 400 → BAD_REQUEST
  ✓ maps 401 → UNAUTHORIZED
  ✓ maps 403 → FORBIDDEN
  ✓ maps 404 → NOT_FOUND
  ✓ maps 422 → UNPROCESSABLE
  ✓ maps 429 → RATE_LIMITED
  ✓ maps 500 → SERVER_ERROR
  ✓ maps 502 → SERVER_ERROR
  ✓ maps 418 → UNKNOWN (unmapped status)
  ✓ message format is "API {status}: {detail}"
  ✓ fieldErrors stored when provided
  ✓ fieldErrors undefined when omitted
  ✓ instanceof Error is true

describe("NetworkError")
  ✓ constructor sets message, name, code, cause
  ✓ code is always NETWORK_ERROR
  ✓ cause is optional
  ✓ instanceof Error is true

describe("parseResponseError")
  ✓ parses JSON body with message field
  ✓ parses JSON body with message and errors fields
  ✓ falls back to statusText when body is not JSON
  ✓ falls back to "HTTP {status}" when no statusText
  ✓ returns ApiError with correct status code
  ✓ handles empty response body
```

#### `packages/ui-core/src/hooks/agents/__tests__/useAgentSession.test.ts` (12 tests)

```
describe("useAgentSession")
  describe("initial state")
    ✓ session is null before fetch completes

  describe("fetch lifecycle")
    ✓ fetches /api/repos/:owner/:repo/agent/sessions/:id
    ✓ populates session and coerces messageCount

  describe("refetch")
    ✓ re-fetches session data
    ✓ preserves existing session during refetch (stale-while-revalidate)

  describe("param changes")
    ✓ re-fetches when sessionId changes
    ✓ re-fetches when owner or repo changes
    ✓ aborts in-flight request on param change

  describe("empty sessionId guard")
    ✓ does not fetch when sessionId is empty string

  describe("abort and cleanup")
    ✓ aborts request on unmount
    ✓ does not setState after unmount

  describe("error handling")
    ✓ maps 401 response to UNAUTHORIZED ApiError
    ✓ maps 404 response to NOT_FOUND ApiError
    ✓ sets NetworkError on fetch failure
    ✓ preserves stale session on error
```

#### `packages/ui-core/src/hooks/agents/__tests__/useAgentSessions.test.ts` (17 tests)

```
describe("useAgentSessions")
  describe("initial state")
    ✓ returns empty sessions array before fetch completes
    ✓ isLoading is false on mount when enabled=false

  describe("fetch lifecycle")
    ✓ fetches with page=1&per_page=30 and reads X-Total-Count header
    ✓ respects custom perPage option and caps at 50

  describe("hasMore")
    ✓ hasMore=true when sessions.length < totalCount
    ✓ hasMore=false when sessions.length >= totalCount
    ✓ hasMore=false when X-Total-Count header absent

  describe("fetchMore")
    ✓ fetches page=2 and appends
    ✓ no-op when hasMore=false
    ✓ no-op when isLoading=true

  describe("refetch")
    ✓ resets page to 1 and re-fetches, preserving items

  describe("param changes")
    ✓ re-fetches and clears items on param change (hard reset)
    ✓ aborts in-flight request on param change

  describe("enabled option")
    ✓ fetches when enabled transitions from false to true
    ✓ aborts in-flight and clears items when enabled transitions true to false

  describe("abort and cleanup")
    ✓ aborts request on unmount

  describe("memory cap")
    ✓ evicts oldest items when exceeding 500

  describe("error handling")
    ✓ maps 401 response to UNAUTHORIZED ApiError
    ✓ sets NetworkError on fetch failure
    ✓ preserves stale sessions on error and clears error on successful refetch
```

#### `packages/ui-core/src/hooks/agents/__tests__/useAgentMessages.test.ts` (22 tests)

```
describe("useAgentMessages")
  describe("initial state")
    ✓ returns empty messages array before fetch completes

  describe("fetch lifecycle")
    ✓ fetches messages endpoint and coerces sequence/partIndex

  describe("hasMore (no X-Total-Count)")
    ✓ hasMore=true when last page has perPage items
    ✓ hasMore=false when last page has fewer than perPage items
    ✓ hasMore=false when last page is empty

  describe("totalCount")
    ✓ totalCount equals messages.length (running count)

  describe("fetchMore")
    ✓ fetches page=2 and appends
    ✓ no-op when hasMore=false

  describe("refetch")
    ✓ resets and re-fetches from page 1, preserving messages

  describe("param changes")
    ✓ re-fetches when sessionId changes
    ✓ aborts in-flight request on param change

  describe("empty sessionId guard")
    ✓ does not fetch when sessionId is empty string

  describe("abort and cleanup")
    ✓ aborts request on unmount
    ✓ does not setState after unmount

  describe("enabled option")
    ✓ does not fetch when enabled=false

  describe("error handling")
    ✓ maps 401 to UNAUTHORIZED
    ✓ sets NetworkError on fetch failure
    ✓ preserves stale messages on error

  describe("autoPaginate")
    ✓ fetches pages sequentially until last page is partial
    ✓ stops on error and preserves partially loaded messages
    ✓ aborts remaining fetches on unmount
    ✓ refetch during autoPaginate aborts current cycle and restarts

  describe("memory cap")
    ✓ evicts oldest messages when exceeding 10,000
```

#### `packages/ui-core/src/hooks/agents/__tests__/useCreateAgentSession.test.ts` (9 tests)

```
describe("useCreateAgentSession")
  describe("client-side validation")
    ✓ rejects empty title with ApiError 400 "title is required"
    ✓ rejects whitespace-only title
    ✓ trims title whitespace before sending

  describe("mutation lifecycle")
    ✓ sends POST to correct path with correct body
    ✓ clears error on new mutate call

  describe("double-submit prevention")
    ✓ rejects second mutate while first is in-flight

  describe("error handling")
    ✓ maps 401 response to UNAUTHORIZED ApiError
    ✓ maps 400 response to BAD_REQUEST ApiError
    ✓ handles NetworkError
```

#### `packages/ui-core/src/hooks/agents/__tests__/useDeleteAgentSession.test.ts` (11 tests)

```
describe("useDeleteAgentSession")
  describe("mutation lifecycle")
    ✓ sends DELETE and resolves on 204

  describe("optimistic callbacks")
    ✓ calls onOptimistic synchronously before request
    ✓ calls onRevert and onError on failure

  describe("deduplication")
    ✓ returns same promise for concurrent deletes of same sessionId
    ✓ does not call onOptimistic again for deduplicated calls
    ✓ allows concurrent deletes of different sessionIds

  describe("error handling")
    ✓ maps 401 response to UNAUTHORIZED ApiError
    ✓ maps 404 response to NOT_FOUND ApiError
    ✓ handles NetworkError

  describe("cleanup")
    ✓ aborts all in-flight deletes on unmount
```

#### `packages/ui-core/src/hooks/agents/__tests__/useSendAgentMessage.test.ts` (20 tests)

```
describe("useSendAgentMessage")
  describe("client-side validation")
    ✓ rejects invalid role
    ✓ rejects empty parts array
    ✓ rejects undefined parts
    ✓ rejects non-array parts
    ✓ rejects invalid part type
    ✓ rejects null part content
    ✓ rejects undefined part content
    ✓ all validation errors are instanceof ApiError with code BAD_REQUEST
    ✓ validates role before parts (order matches server)
    ✓ trims role before validation
    ✓ no network request made on validation failure

  describe("optimistic message")
    ✓ calls onOptimistic before network request with correct temp message shape
    ✓ consecutive calls produce unique temp ids

  describe("mutation lifecycle")
    ✓ sends POST with correct body, coerces sequence in response

  describe("settled callback")
    ✓ calls onSettled with tempId and serverMessage on success
    ✓ calls onSettled with tempId and null on error

  describe("error callbacks")
    ✓ calls onRevert and onError with tempId on error

  describe("double-submit prevention")
    ✓ rejects second send while first is in-flight

  describe("error handling")
    ✓ maps 401 response to UNAUTHORIZED ApiError
    ✓ maps 400 response to BAD_REQUEST ApiError
    ✓ handles NetworkError
```

---

## 11. File Inventory

| File | Purpose | Lines (approx) |
|------|---------|-------|
| `packages/ui-core/package.json` | Package manifest | 19 |
| `packages/ui-core/tsconfig.json` | TypeScript config (self-contained) | 16 |
| `packages/ui-core/src/index.ts` | Public barrel export | 97 |
| `packages/ui-core/src/types/index.ts` | Type sub-barrel | ~30 |
| `packages/ui-core/src/types/agents.ts` | Agent domain types (§3.1) | ~80 |
| `packages/ui-core/src/types/errors.ts` | ApiError, NetworkError, parseResponseError (§3.2) | 82 |
| `packages/ui-core/src/client/index.ts` | Client sub-barrel | ~6 |
| `packages/ui-core/src/client/types.ts` | APIClient interface | ~15 |
| `packages/ui-core/src/client/context.ts` | APIClientProvider + useAPIClient | ~15 |
| `packages/ui-core/src/client/createAPIClient.ts` | APIClient factory | ~35 |
| `packages/ui-core/src/hooks/agents/index.ts` | Agent hooks barrel | 10 |
| `packages/ui-core/src/hooks/agents/useAgentSessions.ts` | Paginated session list (§6.1) | 60 |
| `packages/ui-core/src/hooks/agents/useAgentSession.ts` | Single session getter (§6.2) | 118 |
| `packages/ui-core/src/hooks/agents/useAgentMessages.ts` | Paginated message list + auto-pagination (§6.3) | 63 |
| `packages/ui-core/src/hooks/agents/useCreateAgentSession.ts` | Session creation mutation (§6.4) | 54 |
| `packages/ui-core/src/hooks/agents/useDeleteAgentSession.ts` | Session deletion + optimistic removal (§6.5) | 120 |
| `packages/ui-core/src/hooks/agents/useSendAgentMessage.ts` | Message send + optimistic append (§6.6) | 102 |
| `packages/ui-core/src/hooks/internal/usePaginatedQuery.ts` | Internal pagination engine (§5.1) | 218 |
| `packages/ui-core/src/hooks/internal/useMutation.ts` | Internal mutation state (§5.2) | 103 |
| `packages/ui-core/src/test-utils/index.ts` | Test utility barrel | 4 |
| `packages/ui-core/src/test-utils/react-mock.ts` | Custom React hook environment for Bun | ~85 |
| `packages/ui-core/src/test-utils/renderHook.ts` | Hook test renderer | ~95 |
| `packages/ui-core/src/test-utils/mockAPIClient.ts` | Mock API client with FIFO queue | ~72 |
| `packages/ui-core/src/types/__tests__/errors.test.ts` | Error type tests (24 assertions) | 118 |
| `packages/ui-core/src/hooks/agents/__tests__/useAgentSession.test.ts` | Single session tests (12+ tests) | 181 |
| `packages/ui-core/src/hooks/agents/__tests__/useAgentSessions.test.ts` | Session list tests (17 tests) | 255 |
| `packages/ui-core/src/hooks/agents/__tests__/useAgentMessages.test.ts` | Message list tests (22 tests) | 302 |
| `packages/ui-core/src/hooks/agents/__tests__/useCreateAgentSession.test.ts` | Creation tests (9 tests) | 146 |
| `packages/ui-core/src/hooks/agents/__tests__/useDeleteAgentSession.test.ts` | Deletion tests (11 tests) | 137 |
| `packages/ui-core/src/hooks/agents/__tests__/useSendAgentMessage.test.ts` | Message send tests (20 tests) | 255 |

---

## 12. Productionization Notes

### No PoC code

All code is production-ready. The API contract is fully specified in `apps/server/src/routes/agents.ts`. Type definitions are derived from actual database schema in `packages/sdk/src/db/agent_sql.ts`. No experimental patterns.

### Migration from `specs/` to `packages/`

The full implementation currently lives in `specs/tui/packages/ui-core/`. To materialize it:

1. Copy `specs/tui/packages/ui-core/` → `packages/ui-core/`
2. Run `pnpm install` from workspace root (auto-discovers new package)
3. Verify `pnpm tsc --noEmit` passes in `packages/ui-core/`
4. Verify `bun test packages/ui-core/src/` runs all tests
5. Verify `@codeplane/ui-core` import resolves from `apps/tui/`
6. Remove `specs/tui/packages/ui-core/` after successful migration

**Key consideration:** The `src/index.ts` barrel also exports issue and workspace hooks (`useIssues`, `useWorkspaces`, etc.). These are beyond the agent scope but are part of the same package. The migration must include all hook domains, not just agents.

### Graduation criteria

- [ ] `cd packages/ui-core && pnpm tsc --noEmit` passes
- [ ] `bun test packages/ui-core/src/types/__tests__/errors.test.ts` — all 24 tests pass
- [ ] `bun test packages/ui-core/src/hooks/agents/__tests__/` — all ~91 tests pass with mock client
- [ ] `@codeplane/ui-core` import resolves from `apps/tui/`
- [ ] No `apps/tui/src/` changes in this PR
- [ ] No OpenTUI imports or JSX in `packages/ui-core/`
- [ ] No Hono imports in `packages/ui-core/` (unlike `@codeplane/sdk`)
- [ ] No tests are `.skip`-ed, commented out, or otherwise suppressed

### Service layer dependency

When `AgentService` is implemented in the SDK, registered in `apps/server/src/services.ts` (adding it to the `Services` interface alongside the existing 20 services), and wired into the agent routes (replacing the inline stub at lines 102–129), all E2E tests in `e2e/tui/agents.test.ts` should pass without changes to hook code.

### What changes when the server is real

- Stub `listSessions` currently returns `{ items: [], total: 0 }`. Real implementation returns populated data.
- Stub `listMessages` returns `[]`. Real implementation returns populated data.
- Stub `createSession` returns `{}`. Real implementation returns full `AgentSession`.
- Stub `appendMessage` returns `{}`. Real implementation returns full `AgentMessage`.
- Stub `deleteSession` does nothing. Real implementation deletes → 204 response stays same.
- Stub `getSession` returns `{}`. Real implementation returns full `AgentSession`.

The unit tests in `packages/ui-core/` are unaffected since they all use `mockAPIClient`. The E2E tests in `e2e/tui/agents.test.ts` will start passing.

### Future extensions (out of scope for this ticket)

- `useAgentStream(sessionId)` — SSE streaming (already implemented in `specs/tui/packages/ui-core/src/hooks/agents/useAgentStream.ts`, returns 501 from server)
- Session status filter query param — server currently ignores `?status=`
- Cursor-based pagination — if API migrates from page-based in the future
- SolidJS adapter — for web UI (`apps/web/`)
- `useAgentParts(messageId)` — lazy part loading for large messages
- Shared query cache — cross-hook deduplication
- `useResumeAgentSession` — resume a completed/failed session

---

## 13. Dependencies

| Dependency | Type | Version | Rationale |
|------------|------|---------|----------|
| `react` | peerDependency | `^19.0.0` | Hooks runtime (useState, useEffect, useRef, useCallback, useContext, createContext, useMemo) |
| `typescript` | devDependency | `^5.7.0` | Type checking only — no build step, Bun runs .ts directly |
| `@types/react` | devDependency | `^19.0.0` | React type definitions |
| `bun:test` | built-in | — | Test runner (describe, it, expect, mock, beforeEach) |

Zero new runtime npm packages. All HTTP via native `fetch` (available in Bun). No `node-fetch`, no `axios`, no `ky`.

---

## 14. Acceptance Criteria

- [ ] `packages/ui-core/` package exists with valid `package.json` and `tsconfig.json`
- [ ] Package discoverable by pnpm as `@codeplane/ui-core`
- [ ] All six agent hooks implemented in `packages/ui-core/src/hooks/agents/`
- [ ] Types match actual JSON API response shapes (dates as ISO strings, sequence/messageCount/partIndex coerced to number)
- [ ] Type enums match server validation sets exactly (`VALID_AGENT_MESSAGE_ROLES`, `VALID_AGENT_MESSAGE_PART_TYPES`)
- [ ] `ApiError` and `NetworkError` with typed codes in `types/errors.ts`
- [ ] `ApiError` is distinct from server-side `APIError` (no Hono import)
- [ ] `parseResponseError` handles `{ message, errors? }` SDK error shape
- [ ] `APIClientProvider` and `useAPIClient` in `client/`
- [ ] `createAPIClient` uses `Authorization: token {token}` header format
- [ ] All hooks use `useAPIClient()` — no direct `fetch` in hook files
- [ ] `useAgentSessions` reads `X-Total-Count` header for `totalCount`/`hasMore`
- [ ] `useAgentSessions` `hasMore=false` when header absent (totalCount fallback to `0`)
- [ ] `useAgentMessages` uses last-page-full heuristic (no `X-Total-Count` on that endpoint, `parseResponse` returns `totalCount: null`)
- [ ] `useAgentMessages` `totalCount` is `query.items.length` (running count), not internal `query.totalCount`
- [ ] `useAgentMessages` `autoPaginate` fetches sequentially, `isLoading = true` throughout
- [ ] `per_page` client option capped at 50 via `Math.min(options?.perPage ?? 30, 50)`
- [ ] Memory caps: 500 sessions, 10,000 messages
- [ ] All mutation hooks have double-submit prevention (via `useMutation`'s `isLoading` guard or deduplication map)
- [ ] `useDeleteAgentSession` deduplicates concurrent same-`sessionId` calls via `inflightRef` Map
- [ ] `useDeleteAgentSession` exposes `onOptimistic`, `onRevert`, `onError`, `onSettled` callbacks via ref
- [ ] `useDeleteAgentSession` does NOT use `useMutation` (custom state management for concurrent deletes)
- [ ] `useSendAgentMessage` validates parts synchronously via `validateInput` before any network call
- [ ] `useSendAgentMessage` validation order matches server: role → parts existence → part types → part content
- [ ] `useSendAgentMessage` trims role before validation: `(input.role ?? "").trim()`
- [ ] Temp message: `id` starts with `tmp_`, `sequence = -1`, `createdAt = new Date().toISOString()`
- [ ] AbortController cleanup on unmount and param changes for all hooks
- [ ] `isMounted` guard in all hooks prevents setState after unmount
- [ ] Stale-while-revalidate: data preserved during refetch, not cleared on error
- [ ] Hard reset: items cleared on cacheKey change (different owner/repo/perPage/status for sessions; different owner/repo/sessionId/perPage for messages)
- [ ] `useAgentSession` and `useAgentMessages` skip fetch on empty `sessionId`
- [ ] `enabled` transition `true→false` aborts in-flight and clears items (in `usePaginatedQuery`)
- [ ] All 7 test files exist with all test cases (~115 total assertions)
- [ ] `errors.test.ts` passes fully (24 assertions)
- [ ] All mock-client hook behavior tests pass
- [ ] No tests are `.skip`-ed, commented out, or otherwise suppressed
- [ ] No TUI-specific code or OpenTUI imports in `packages/ui-core/`
- [ ] No Hono imports in `packages/ui-core/`
- [ ] Full public API exported from `packages/ui-core/src/index.ts` including agent hooks, types, client exports, and callback type exports
- [ ] `tsconfig.json` is self-contained (does not extend non-existent root tsconfig)
- [ ] Custom React mock (`react-mock.ts`) provides `useState`, `useEffect`, `useRef`, `useCallback`, `useMemo`, `useContext`
- [ ] `renderHook` uses `bun:test` `mock.module` for React replacement
- [ ] `mockAPIClient` provides FIFO response queue with call recording, `respondWithJSON` supports custom headers