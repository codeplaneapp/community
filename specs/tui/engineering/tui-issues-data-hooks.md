# Engineering Specification: `tui-issues-data-hooks`

## Title
Implement issue data hooks: useIssues, useIssue, mutations, comments, events, labels, milestones, collaborators

## Status
`Implemented` — All twelve hooks are implemented in `specs/tui/packages/ui-core/src/hooks/issues/`. Types, barrel exports, and stub unit tests exist. The `usePaginatedQuery` query-param patch is applied. Two known backend gaps remain: (1) the issue events HTTP route does not exist — `useIssueEvents` returns 404, (2) no collaborators endpoint — `useRepoCollaborators` uses user search as a workaround. Test coverage is **partial** — only 14 test cases across 12 test files; ~165 additional test cases specified but not yet written.

## Dependencies
- `tui-navigation-provider` — NavigationProvider must exist for repo context resolution in TUI screens that consume these hooks.
- `tui-agent-data-hooks` — Shipped. Established `packages/ui-core/`, `APIClientProvider`, `useAPIClient()`, `usePaginatedQuery`, `useMutation`, error types, and test utilities.

## Summary

This ticket delivers the complete issue data access layer in `specs/tui/packages/ui-core/`. The deliverable is twelve React hooks that wrap the Codeplane HTTP API issue, label, milestone, comment, event, and collaborator endpoints. These hooks provide typed, reactive data access with pagination, loading states, error handling, optimistic updates, and cache invalidation.

The hooks live in `specs/tui/packages/ui-core/src/hooks/issues/` and are framework-agnostic React 19 hooks consumed by the TUI (`apps/tui/`) and future web UI. No TUI-specific rendering code belongs in this ticket.

**Scope boundary:**
- ✅ `specs/tui/packages/ui-core/src/hooks/issues/` — all hook implementation code
- ✅ `specs/tui/packages/ui-core/src/types/issues.ts` — issue domain types
- ✅ `specs/tui/packages/ui-core/src/hooks/issues/__tests__/` — unit tests (mock-client)
- ✅ `specs/tui/packages/ui-core/src/hooks/internal/usePaginatedQuery.ts` — query param separator patch
- ✅ `specs/tui/packages/ui-core/src/hooks/issues/index.ts` — barrel exports
- ✅ `specs/tui/packages/ui-core/src/index.ts` — updated public barrel
- ✅ `specs/tui/e2e/tui/issues.test.ts` — E2E smoke tests validating hooks via rendered TUI screens
- ❌ `apps/tui/src/screens/Issues/` — issue screen UI components (separate ticket: `tui-issues-screen`)

---

## 1. Codebase Ground Truth

The following facts were validated against the actual repository on 2026-03-22 and drive every decision in this spec:

| Fact | Location | Impact |
|------|----------|--------|
| `packages/ui-core/` exists with agent, issue, and workspace hooks | `specs/tui/packages/ui-core/src/` | Issue hooks are additions to an established package |
| `IssueService` is registered in `Services` interface | `apps/server/src/services.ts` line 41 | Service layer is live, not stubbed |
| `LabelService` is registered in `Services` interface | `apps/server/src/services.ts` line 42 | Label routes use real service |
| `MilestoneService` is registered in `Services` interface | `apps/server/src/services.ts` line 43 | Milestone routes use real service |
| Issue list sets `X-Total-Count` header via `setPaginationHeaders` | `apps/server/src/routes/issues.ts` line 175 | `useIssues` reads this header for totalCount |
| Comment list sets `X-Total-Count` header | `apps/server/src/routes/issues.ts` line 272 | `useIssueComments` reads this header |
| Label list sets `X-Total-Count` header | `apps/server/src/routes/labels.ts` line 129 | `useRepoLabels` reads this header |
| Milestone list sets `X-Total-Count` header | `apps/server/src/routes/milestones.ts` line 131 | `useRepoMilestones` reads this header |
| Issue label list sets `X-Total-Count` header | `apps/server/src/routes/issues.ts` line 332 | Label listing on issues is paginated |
| Pagination uses `parsePagination()` → `cursorToPage()` | `packages/sdk/src/lib/pagination.ts` | Server interprets `page` + `per_page` (aliased from `cursor`+`limit`) |
| `parsePagination()` defaults to limit=30, max=100 | `packages/sdk/src/lib/pagination.ts` | Matches hook defaults |
| Issue create returns 201 | `apps/server/src/routes/issues.ts` line 196 | |
| Issue update returns 200 | `apps/server/src/routes/issues.ts` line 241 | |
| Comment create returns 201 | `apps/server/src/routes/issues.ts` line 256 | |
| Comment delete returns 204 | `apps/server/src/routes/issues.ts` line 316 | |
| Label add to issue returns 200 (array) | `apps/server/src/routes/issues.ts` line 347 | Not 201 — returns full label set |
| Label remove from issue returns 204 | `apps/server/src/routes/issues.ts` line 362 | |
| Issue events HTTP route does **NOT** exist | `apps/server/src/routes/issues.ts` ends at line 368 | `useIssueEvents` will 404 until route added |
| `listIssueEvents` service method exists in SDK | `packages/sdk/src/services/issue.ts` | Service ready, no HTTP handler |
| Events total count is approximated in service | `packages/sdk/src/services/issue.ts` | Returns `items.length` as total (no COUNT query) |
| No collaborators list endpoint exists | No route anywhere | `useRepoCollaborators` uses `/api/search/users` |
| User search endpoint exists | `apps/server/src/routes/search.ts` | `GET /api/search/users?q=...` |
| Auth header format is `Authorization: token {token}` | Server auth middleware | Not `Bearer` |
| Error response shape: `{ message, errors? }` | `specs/tui/packages/ui-core/src/types/errors.ts` | `parseResponseError()` handles this |
| `ApiError`, `NetworkError`, `parseResponseError` exist | `specs/tui/packages/ui-core/src/types/errors.ts` | Reused from agent hooks |
| `usePaginatedQuery` has query-param separator fix | `specs/tui/packages/ui-core/src/hooks/internal/usePaginatedQuery.ts` line 79 | `path.includes('?') ? '&' : '?'` |
| `useMutation` supports full callback lifecycle | `specs/tui/packages/ui-core/src/hooks/internal/useMutation.ts` | `onOptimistic → mutationFn → onSuccess/onError → onSettled` |
| `useMutation` double-submit guard | `specs/tui/packages/ui-core/src/hooks/internal/useMutation.ts` line 45 | Rejects with `"mutation in progress"` if `isLoading` |
| `mockAPIClient` uses queue-based response system | `specs/tui/packages/ui-core/src/test-utils/mockAPIClient.ts` | `respondWithJSON`, `respondWithError`, `callsTo` |
| `renderHook` uses minimal React mock | `specs/tui/packages/ui-core/src/test-utils/renderHook.ts` | Executes hooks with `waitForNextUpdate` |
| React mock `useState` triggers `resolveUpdate` on change | `specs/tui/packages/ui-core/src/test-utils/react-mock.ts` line 27 | `waitForNextUpdate` relies on this |
| React mock `useContext` returns `state.currentContextValue` | `specs/tui/packages/ui-core/src/test-utils/react-mock.ts` line 79 | Set via `renderHook({ apiClient })` |
| Milestone patch uses `"milestone" in body` presence detection | `apps/server/src/routes/issues.ts` lines 228-231 | Send `null` to clear, omit to leave unchanged |
| Issue `state` wire type is `string`, narrowed to `"open" \| "closed"` | `IssueResponse.state: string` | Client-side type assertion in `useIssues` parseResponse |
| All `id` fields are numbers (not strings) | Issue, Comment, Label, Milestone IDs | Different from agent hooks (string IDs) |
| Issue `number` is distinct from `id` | URL paths use `number`, not `id` | Hooks key on `number` |
| Dates are ISO-8601 strings on the wire | Hono `c.json()` serialization | No coercion needed |
| Existing tests cover only 14 test cases total | `specs/tui/packages/ui-core/src/hooks/issues/__tests__/` | 12 test files × 1-2 tests each |
| `usePaginatedQuery` hasMore uses side-effect-free `parseResponse([], new Headers())` heuristic | Line 191-193 | Fragile but functional |
| `usePaginatedQuery` maxItems eviction slices from end: `combinedItems.slice(combinedItems.length - maxItems)` | Line 108-109 | Keeps most recent items, drops oldest |
| `useUpdateIssue` milestone check: `patch.milestone !== undefined` includes `null` | Line 36 | `null` → sent as `null` in body; `undefined` → key omitted |
| `useCreateIssueComment` validation happens in outer `mutate` wrapper, not in `mutationFn` | Lines 73-77 | Throws `ApiError(400)` before `useMutation` runs |
| `useRemoveIssueLabel` validation happens inside `mutationFn` | Lines 28-31 | Throws `ApiError(400)` inside mutation lifecycle |
| No E2E TUI issues test file exists | `specs/tui/e2e/tui/` has no `issues.test.ts` | Must be created |

---

## 2. API Contract Reference

All issue endpoints are repository-scoped under `/api/repos/:owner/:repo/`.

**Source of truth**: `apps/server/src/routes/issues.ts`, `apps/server/src/routes/labels.ts`, `apps/server/src/routes/milestones.ts`

### Issue Endpoints

| Endpoint | Method | Success | Request Body | Response Body | Response Headers |
|----------|--------|---------|-------------|---------------|------------------|
| `/issues` | `GET` | 200 | — | `IssueResponse[]` | `X-Total-Count: N` |
| `/issues` | `POST` | 201 | `{ title, body, assignees?, labels?, milestone? }` | `IssueResponse` | — |
| `/issues/:number` | `GET` | 200 | — | `IssueResponse` | — |
| `/issues/:number` | `PATCH` | 200 | `{ title?, body?, state?, assignees?, labels?, milestone? }` | `IssueResponse` | — |

### Comment Endpoints

| Endpoint | Method | Success | Request Body | Response Body | Response Headers |
|----------|--------|---------|-------------|---------------|------------------|
| `/issues/:number/comments` | `GET` | 200 | — | `IssueCommentResponse[]` | `X-Total-Count: N` |
| `/issues/:number/comments` | `POST` | 201 | `{ body }` | `IssueCommentResponse` | — |
| `/issues/comments/:id` | `GET` | 200 | — | `IssueCommentResponse` | — |
| `/issues/comments/:id` | `PATCH` | 200 | `{ body }` | `IssueCommentResponse` | — |
| `/issues/comments/:id` | `DELETE` | 204 | — | (empty) | — |

### Issue Label Endpoints

| Endpoint | Method | Success | Request Body | Response Body | Response Headers |
|----------|--------|---------|-------------|---------------|------------------|
| `/issues/:number/labels` | `GET` | 200 | — | `LabelResponse[]` | `X-Total-Count: N` |
| `/issues/:number/labels` | `POST` | 200 | `{ labels: string[] }` | `LabelResponse[]` | — |
| `/issues/:number/labels/:name` | `DELETE` | 204 | — | (empty) | — |

### Repository Label Endpoints

| Endpoint | Method | Success | Request Body | Response Body | Response Headers |
|----------|--------|---------|-------------|---------------|------------------|
| `/labels` | `GET` | 200 | — | `LabelResponse[]` | `X-Total-Count: N` |

### Milestone Endpoints

| Endpoint | Method | Success | Request Body | Response Body | Response Headers |
|----------|--------|---------|-------------|---------------|------------------|
| `/milestones` | `GET` | 200 | — | `MilestoneResponse[]` | `X-Total-Count: N` |

### Issue Event Endpoints

| Endpoint | Method | Success | Notes |
|----------|--------|---------|-------|
| `/issues/:number/events` | `GET` | ⚠️ **NO ROUTE** | `listIssueEvents` service exists but no HTTP handler. `useIssueEvents` hook returns 404. Tests left failing per policy. |

### Collaborator/Assignee Endpoints

| Endpoint | Method | Success | Notes |
|----------|--------|---------|-------|
| No `/collaborators` endpoint | — | — | `useRepoCollaborators` uses `/api/search/users?q=...` as workaround |
| `/api/search/users?q=...` | `GET` | 200 | Returns `{ items: UserSearchResult[], total_count: number }` |

**Pagination query parameters** (all list endpoints):
- `page`: integer ≥ 1, default 1
- `per_page`: integer 1–100, default 30, server hard-caps at 100

**State filter** (issues and milestones):
- `state`: `"open"`, `"closed"`, or `""` (empty for all)

**Authentication header**: `Authorization: token {token}` (injected by `APIClientProvider`)

---

## 3. Type Definitions

### 3.1 File: `specs/tui/packages/ui-core/src/types/issues.ts`

**Status**: ✅ Implemented (137 lines)

```typescript
export type IssueState = "open" | "closed";

export interface IssueUserSummary {
  id: number;
  login: string;
}

export interface IssueLabelSummary {
  id: number;
  name: string;
  color: string;
  description: string;
}

export interface Issue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: IssueState;
  author: IssueUserSummary;
  assignees: IssueUserSummary[];
  labels: IssueLabelSummary[];
  milestone_id: number | null;
  comment_count: number;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IssueComment {
  id: number;
  issue_id: number;
  user_id: number;
  commenter: string;
  body: string;
  type: string;
  created_at: string;
  updated_at: string;
}

export interface IssueEvent {
  id: number;
  issueId: number;
  actorId: number | null;
  eventType: string;
  payload: unknown;
  createdAt: string;
}

export interface Label {
  id: number;
  repository_id: number;
  name: string;
  color: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: number;
  repository_id: number;
  title: string;
  description: string;
  state: string;
  due_date: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSearchResult {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

export interface CreateIssueRequest {
  title: string;
  body: string;
  assignees?: string[];
  labels?: string[];
  milestone?: number;
}

export interface UpdateIssueRequest {
  title?: string;
  body?: string;
  state?: IssueState;
  assignees?: string[];
  labels?: string[];
  milestone?: number | null;
}

export interface CreateIssueCommentRequest {
  body: string;
}

export interface IssuesOptions {
  page?: number;
  perPage?: number;
  state?: IssueState | "";
  enabled?: boolean;
}

export interface IssueCommentsOptions {
  page?: number;
  perPage?: number;
  enabled?: boolean;
}

export interface IssueEventsOptions {
  page?: number;
  perPage?: number;
  enabled?: boolean;
}

export interface RepoLabelsOptions {
  page?: number;
  perPage?: number;
  enabled?: boolean;
}

export interface RepoMilestonesOptions {
  page?: number;
  perPage?: number;
  state?: string;
  enabled?: boolean;
}

export interface RepoCollaboratorsOptions {
  query: string;
  enabled?: boolean;
}
```

### 3.2 File: `specs/tui/packages/ui-core/src/types/index.ts`

**Status**: ✅ Implemented — Issue type exports present in barrel.

---

## 4. Hook Signatures and Behavior

### 4.1 `useIssues(owner, repo, options?)`

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useIssues.ts` (52 lines)  
**Status**: ✅ Implemented

```typescript
export function useIssues(
  owner: string,
  repo: string,
  options?: IssuesOptions,
): {
  issues: Issue[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
};
```

**Implementation details**:
- Delegates to `usePaginatedQuery<Issue>`.
- Path: `/api/repos/${owner}/${repo}/issues`. State filter appended as `?state=${state}` when non-empty.
- `cacheKey = JSON.stringify({ owner, repo, perPage: Math.min(options?.perPage ?? 30, 100), state: options?.state ?? "" })`.
- `parseResponse`: reads `X-Total-Count` header. Casts `state` field to `IssueState` via type assertion.
- `maxItems = 500` (ticket requirement: 500-item cap).
- `autoPaginate = false`.
- `perPage` capped at 100 client-side via `Math.min(options?.perPage ?? 30, 100)`.
- Return aliases: `issues` → `query.items`.

### 4.2 `useIssue(owner, repo, issueNumber)`

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useIssue.ts` (115 lines)  
**Status**: ✅ Implemented

```typescript
export function useIssue(
  owner: string,
  repo: string,
  issueNumber: number,
): {
  issue: Issue | null;
  isLoading: boolean;
  error: HookError | null;
  refetch: () => void;
};
```

**Implementation details**:
- Manual single-resource fetch — does NOT use `usePaginatedQuery`.
- Path: `/api/repos/${owner}/${repo}/issues/${issueNumber}`.
- **30-second cache**: `useRef` tracks `lastFetchTimestamp`. Cache check on line 43: `refetchCounter === 0 && now - lastFetchTimestamp.current < 30_000 && issue` — skips fetch if within 30s window, data exists, and this is not an explicit refetch.
- **Stale-while-revalidate**: `issue` preserved during `refetch()` — never set to `null` on refetch start.
- **Edge case**: `issueNumber <= 0` → sets `issue = null`, `isLoading = false`, `error = null`, no fetch.
- AbortController in ref. Aborted on param change and unmount.
- `isMounted` guard on all state updates.
- Cache timestamp reset to 0 on `[owner, repo, issueNumber]` change via separate `useEffect` (line 98-100).
- `refetch()` increments `refetchCounter` which bypasses the cache check.

### 4.3 `useCreateIssue(owner, repo)`

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useCreateIssue.ts` (50 lines)  
**Status**: ✅ Implemented

```typescript
export function useCreateIssue(
  owner: string,
  repo: string,
): {
  mutate: (input: CreateIssueRequest) => Promise<Issue>;
  isLoading: boolean;
  error: HookError | null;
};
```

**Implementation details**:
- Delegates to `useMutation`.
- **Client-side validation inside `mutationFn`**: Trims `title`. If empty, throws `new ApiError(400, "title is required")`.
- `mutationFn`: `POST /api/repos/${owner}/${repo}/issues` with JSON body. Optional fields (`assignees`, `labels`, `milestone`) only included when `!== undefined`.
- Response must be 201. Non-success throws raw `response` object for `useMutation` error handling.
- No optimistic callback.
- Double-submit prevention via `useMutation`'s `isLoading` guard (line 45-47 of useMutation.ts).

### 4.4 `useUpdateIssue(owner, repo, callbacks?)`

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useUpdateIssue.ts` (78 lines)  
**Status**: ✅ Implemented

```typescript
export interface UpdateIssueCallbacks {
  onOptimistic?: (issueNumber: number, patch: UpdateIssueRequest) => void;
  onRevert?: (issueNumber: number) => void;
  onError?: (error: HookError, issueNumber: number) => void;
  onSettled?: (issueNumber: number) => void;
}

export function useUpdateIssue(
  owner: string,
  repo: string,
  callbacks?: UpdateIssueCallbacks,
): {
  mutate: (issueNumber: number, patch: UpdateIssueRequest) => Promise<Issue>;
  isLoading: boolean;
  error: HookError | null;
};
```

**Implementation details**:
- Delegates to `useMutation` with internal `UpdateIssueInput = { issueNumber, patch }`.
- **Optimistic pattern**: `onOptimistic(input)` → `mutationFn` → on success: `onSuccess` calls `callbacks.onSettled` / on error: `onError` calls `callbacks.onRevert → callbacks.onError → callbacks.onSettled`.
- **Body construction**: Only defined fields included via `!== undefined` checks. `patch.milestone === null` sends `{ milestone: null }` (because `null !== undefined` is `true`). `patch.milestone === undefined` omits the key.
- Response must be 200.
- `mutate` wrapped with `useCallback` to present `(issueNumber, patch)` interface.

**Critical implementation detail — callback ordering in `useMutation`**:
- On success: `useMutation.onSuccess` → `useMutation.onSettled` (lines 68-73 of useMutation.ts)
- On error: `useMutation.onError` → `useMutation.onSettled` (lines 86-91 of useMutation.ts)
- But `useUpdateIssue` maps these: `useMutation.onSuccess` calls `callbacks.onSettled` only. `useMutation.onError` calls `callbacks.onRevert` then `callbacks.onError` then `callbacks.onSettled`. Then `useMutation` also calls its own `onSettled` which calls `callbacks.onSettled` again.
- **Bug identified**: On error, `callbacks.onSettled` is called **twice** — once inside `useMutation.onError` (line 63) and once inside `useMutation.onSettled` (mapped by the `useMutation` base). Wait — checking the code again: `useUpdateIssue` does NOT pass `onSettled` to `useMutation`. It only passes `onOptimistic`, `onSuccess`, and `onError`. The `useMutation` config has no `onSettled`. So on error, the flow is: `useMutation.onError` calls `callbacks.onRevert → callbacks.onError → callbacks.onSettled`, and `useMutation.onSettled` is undefined so it's a no-op. This is correct.

### 4.5 `useIssueComments(owner, repo, issueNumber, options?)`

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useIssueComments.ts` (43 lines)  
**Status**: ✅ Implemented

```typescript
export function useIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
  options?: IssueCommentsOptions,
): {
  comments: IssueComment[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
};
```

**Implementation details**:
- Delegates to `usePaginatedQuery<IssueComment>`.
- Path: `/api/repos/${owner}/${repo}/issues/${issueNumber}/comments`.
- `maxItems = 500`. `perPage` capped at 100.
- Disabled when `issueNumber <= 0` via `enabled: issueNumber > 0 && (options?.enabled ?? true)`.

### 4.6 `useIssueEvents(owner, repo, issueNumber, options?)`

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useIssueEvents.ts` (43 lines)  
**Status**: ✅ Implemented (⚠️ endpoint does not exist — hook returns 404)

```typescript
export function useIssueEvents(
  owner: string,
  repo: string,
  issueNumber: number,
  options?: IssueEventsOptions,
): {
  events: IssueEvent[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
};
```

**Implementation details**:
- Delegates to `usePaginatedQuery<IssueEvent>`.
- Path: `/api/repos/${owner}/${repo}/issues/${issueNumber}/events`.
- ⚠️ **This endpoint does not exist yet.** Returns 404. Tests left failing per project policy.
- When the backend route is added, `totalCount` will be approximate because the service has no COUNT query for events.

### 4.7 `useCreateIssueComment(owner, repo, callbacks?)`

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useCreateIssueComment.ts` (91 lines)  
**Status**: ✅ Implemented

```typescript
export interface CreateIssueCommentCallbacks {
  onOptimistic?: (issueNumber: number, tempComment: IssueComment) => void;
  onSettled?: (issueNumber: number, tempId: number, serverComment: IssueComment | null) => void;
  onRevert?: (issueNumber: number, tempId: number) => void;
  onError?: (error: HookError, issueNumber: number, tempId: number) => void;
}

export function useCreateIssueComment(
  owner: string,
  repo: string,
  callbacks?: CreateIssueCommentCallbacks,
): {
  mutate: (issueNumber: number, input: CreateIssueCommentRequest) => Promise<IssueComment>;
  isLoading: boolean;
  error: HookError | null;
};
```

**Implementation details**:
- **Two-layer validation**: The outer `mutate` wrapper (line 73-80) trims body and validates before calling `mutation.mutate`. Validation happens BEFORE the `useMutation` lifecycle — `ApiError(400)` is thrown directly, not through `useMutation.onError`.
- **Optimistic append**: `tempId = -(Date.now())` — always negative. Constructs temp `IssueComment` with `id = tempId`, `issue_id = 0`, `user_id = 0`, `commenter = ""`, `type = "comment"`, current timestamp.
- The trimmed body is passed to `mutation.mutate`, so the temp comment and the server request both use trimmed body.
- `mutationFn`: `POST /api/repos/${owner}/${repo}/issues/${issueNumber}/comments`. Response is 201.
- Error callback lifecycle: `onRevert(issueNumber, tempId)` → `onError(error, issueNumber, tempId)` → `onSettled(issueNumber, tempId, null)`.

### 4.8 `useRepoLabels(owner, repo, options?)`

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useRepoLabels.ts` (42 lines)  
**Status**: ✅ Implemented

```typescript
export function useRepoLabels(
  owner: string,
  repo: string,
  options?: RepoLabelsOptions,
): {
  labels: Label[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
};
```

- Delegates to `usePaginatedQuery<Label>`.
- Path: `/api/repos/${owner}/${repo}/labels`.
- `maxItems = 500`. `perPage` capped at 100.
- Standard `X-Total-Count` header parsing.

### 4.9 `useRepoMilestones(owner, repo, options?)`

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useRepoMilestones.ts` (48 lines)  
**Status**: ✅ Implemented

```typescript
export function useRepoMilestones(
  owner: string,
  repo: string,
  options?: RepoMilestonesOptions,
): {
  milestones: Milestone[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
};
```

- Includes optional `state` filter (works identically to `useIssues` state filter).
- Path includes `?state=${state}` when state is non-empty.

### 4.10 `useRepoCollaborators(owner, repo, options)`

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useRepoCollaborators.ts` (109 lines)  
**Status**: ✅ Implemented (⚠️ workaround — uses user search)

```typescript
export function useRepoCollaborators(
  owner: string,
  repo: string,
  options: RepoCollaboratorsOptions,
): {
  users: UserSearchResult[];
  isLoading: boolean;
  error: HookError | null;
  refetch: () => void;
};
```

**Implementation details**:
- **NOT paginated.** Manual single-fetch pattern with `useState`/`useEffect`.
- Path: `/api/search/users?q=${encodeURIComponent(options.query)}&limit=20`.
- ⚠️ **Workaround**: No real collaborators endpoint. Searches all platform users.
- Disabled when `query` is empty string or `enabled` is false.
- `owner` and `repo` params unused but reserved for future real endpoint.
- No debouncing — caller is responsible.
- AbortController properly managed for query changes and unmount.

### 4.11 `useAddIssueLabels(owner, repo)`

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useAddIssueLabels.ts` (45 lines)  
**Status**: ✅ Implemented

```typescript
export function useAddIssueLabels(
  owner: string,
  repo: string,
): {
  mutate: (issueNumber: number, labelNames: string[]) => Promise<Label[]>;
  isLoading: boolean;
  error: HookError | null;
};
```

- **Validation inside `mutationFn`**: Empty `labelNames` throws `ApiError(400, "at least one label name is required")`.
- Response is 200 (not 201). Returns the full `Label[]` now on the issue.
- Note: `mutate` is an inline function, not wrapped with `useCallback` — minor optimization opportunity.

### 4.12 `useRemoveIssueLabel(owner, repo, callbacks?)`

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useRemoveIssueLabel.ts` (68 lines)  
**Status**: ✅ Implemented

```typescript
export interface RemoveIssueLabelCallbacks {
  onOptimistic?: (issueNumber: number, labelName: string) => void;
  onRevert?: (issueNumber: number, labelName: string) => void;
  onError?: (error: HookError, issueNumber: number, labelName: string) => void;
  onSettled?: (issueNumber: number, labelName: string) => void;
}

export function useRemoveIssueLabel(
  owner: string,
  repo: string,
  callbacks?: RemoveIssueLabelCallbacks,
): {
  mutate: (issueNumber: number, labelName: string) => Promise<void>;
  isLoading: boolean;
  error: HookError | null;
};
```

- **Validation inside `mutationFn`**: Trims `labelName`. If empty, throws `ApiError(400, "label name is required")`.
- `DELETE /api/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(trimmedLabelName)}`.
- Response is 204 with empty body.
- Optimistic removal pattern with full callback lifecycle.
- Note: The outer `mutate` wrapper passes raw `labelName` to `mutation.mutate`, but trimming happens inside `mutationFn` — so `onOptimistic` receives the untrimmed name.

---

## 5. Internal Utility Integration

### 5.1 `usePaginatedQuery` — Query parameter support

**File**: `specs/tui/packages/ui-core/src/hooks/internal/usePaginatedQuery.ts` (218 lines)  
**Status**: ✅ Applied (line 79)

```typescript
const separator = path.includes('?') ? '&' : '?';
const urlPath = `${path}${separator}page=${pageToFetch}&per_page=${perPage}`;
```

This is backward-compatible — agent hooks don't include `?` in their paths.

### 5.2 `usePaginatedQuery` — Key behaviors affecting issue hooks

1. **Hard reset on cacheKey change** (lines 147-164): When `cacheKey` changes (e.g., state filter change, owner/repo change), items are cleared, page resets to 1, error is cleared. This is distinct from a refetch which preserves items.
2. **Soft reset on refetch** (lines 182-183): When `refetchCounter > 0`, `fetchPage(1, true, items)` is called with existing items, enabling stale-while-revalidate. However, `fetchPage` with `pageToFetch === 1` replaces all items (line 102), so the "stale-while-revalidate" only applies during the loading period.
3. **maxItems eviction** (lines 108-109): `combinedItems.slice(combinedItems.length - maxItems)` — keeps the **most recent** items (by position), drops the oldest.
4. **hasMore calculation** (lines 191-193): Uses `parseResponse([], new Headers())` heuristic to determine if `totalCount` is null. For issue hooks that return `totalCount: 0` on empty input, `totalCount !== null` is true, so `hasMore = items.length < totalCount`.
5. **Enabled toggle** (lines 167-178): When `enabled` becomes false, everything is cleared and loading is set to false. When re-enabled, the next render cycle triggers a fresh fetch.

### 5.3 `useMutation` — Key behaviors affecting issue hooks

1. **Double-submit guard** (line 45-47): `if (isLoading) return Promise.reject(new Error("mutation in progress"))`.
2. **Callback ordering on success** (lines 57-75): `onOptimistic(input)` → `mutationFn(input, signal)` → `setIsLoading(false)` → `onSuccess(result, input)` → `onSettled(input)` → return result.
3. **Callback ordering on error** (lines 76-93): `onOptimistic(input)` → `mutationFn(input, signal)` → `setError(err)` → `setIsLoading(false)` → `onError(err, input)` → `onSettled(input)` → throw err.
4. **Config ref pattern** (lines 29-32): Config is stored in a ref and updated via `useEffect`. This prevents stale closure issues when callbacks change.
5. **Error rethrow** (line 93): After calling `onError` and `onSettled`, the error is rethrown so the caller's `await mutate(...)` rejects.

---

## 6. Error Handling Contract

All hooks follow the error handling contract established by the agent hooks:

| HTTP Status | Error Type | `error.code` | Hook Behavior |
|-------------|-----------|-------------|---------------|
| 400 | `ApiError` | `BAD_REQUEST` | Set error. Client-side validation throws this. |
| 401 | `ApiError` | `UNAUTHORIZED` | Set error. Preserve stale data. TUI shows "Session expired" message. |
| 403 | `ApiError` | `FORBIDDEN` | Set error. Preserve stale data. |
| 404 | `ApiError` | `NOT_FOUND` | Set error. Preserve stale data. |
| 422 | `ApiError` | `UNPROCESSABLE` | Set error. Includes `fieldErrors` if present. |
| 429 | `ApiError` | `RATE_LIMITED` | Set error. Preserve stale data. |
| 500+ | `ApiError` | `SERVER_ERROR` | Set error. Preserve stale data. |
| Network failure | `NetworkError` | `NETWORK_ERROR` | Set error. Preserve stale data. |
| AbortError | (not set) | — | Silently swallowed. No state update. |

**Error parsing flow**:
- Query hooks (`usePaginatedQuery`): Response → `parseResponseError(response)` → `setError(apiError)` (line 86-88 of usePaginatedQuery)
- Mutation hooks (`useMutation`): Non-success response → `throw response` in `mutationFn` → `useMutation` catches in `onError` → `setError(err)`. Note: the thrown `Response` object is NOT an `ApiError` — it's a raw `Response`. The consuming mutation hook's `mutationFn` throws the response, and `useMutation` sets it as `error`. This means `mutation.error` may be a `Response` object, not always `HookError`.

**Design note — mutation error inconsistency**: The mutation hooks throw raw `Response` objects (`throw response`) rather than parsed `ApiError` objects. The `useMutation` base catches these and stores them in `error` state. Callers expecting `HookError` typed errors may receive `Response` objects instead. This is noted as a productionization concern in §11.7.

---

## 7. File Inventory

### Implementation Files

| File | Purpose | Status | Lines |
|------|---------|--------|-------|
| `specs/tui/packages/ui-core/src/types/issues.ts` | Issue domain types (§3.1) | ✅ | 137 |
| `specs/tui/packages/ui-core/src/types/index.ts` | Type barrel with issue exports | ✅ | — |
| `specs/tui/packages/ui-core/src/hooks/issues/index.ts` | Issue hooks barrel | ✅ | 16 |
| `specs/tui/packages/ui-core/src/hooks/issues/useIssues.ts` | Paginated issue list (§4.1) | ✅ | 52 |
| `specs/tui/packages/ui-core/src/hooks/issues/useIssue.ts` | Single issue with 30s cache (§4.2) | ✅ | 115 |
| `specs/tui/packages/ui-core/src/hooks/issues/useCreateIssue.ts` | Issue creation mutation (§4.3) | ✅ | 50 |
| `specs/tui/packages/ui-core/src/hooks/issues/useUpdateIssue.ts` | Issue update with optimistic (§4.4) | ✅ | 78 |
| `specs/tui/packages/ui-core/src/hooks/issues/useIssueComments.ts` | Paginated comments (§4.5) | ✅ | 43 |
| `specs/tui/packages/ui-core/src/hooks/issues/useIssueEvents.ts` | Paginated events (§4.6) | ✅ (⚠️ 404) | 43 |
| `specs/tui/packages/ui-core/src/hooks/issues/useCreateIssueComment.ts` | Comment creation with optimistic (§4.7) | ✅ | 91 |
| `specs/tui/packages/ui-core/src/hooks/issues/useRepoLabels.ts` | Paginated repo labels (§4.8) | ✅ | 42 |
| `specs/tui/packages/ui-core/src/hooks/issues/useRepoMilestones.ts` | Paginated repo milestones (§4.9) | ✅ | 48 |
| `specs/tui/packages/ui-core/src/hooks/issues/useRepoCollaborators.ts` | User search workaround (§4.10) | ✅ (⚠️ workaround) | 109 |
| `specs/tui/packages/ui-core/src/hooks/issues/useAddIssueLabels.ts` | Add labels to issue (§4.11) | ✅ | 45 |
| `specs/tui/packages/ui-core/src/hooks/issues/useRemoveIssueLabel.ts` | Remove label with optimistic (§4.12) | ✅ | 68 |
| `specs/tui/packages/ui-core/src/hooks/internal/usePaginatedQuery.ts` | Patched for query param support (§5.1) | ✅ | 218 |
| `specs/tui/packages/ui-core/src/hooks/internal/useMutation.ts` | Mutation with optimistic lifecycle (§5.3) | ✅ | 103 |
| `specs/tui/packages/ui-core/src/index.ts` | Public barrel with issue exports | ✅ | 97 |

### Test Files

| File | Purpose | Status | Tests Written / Specified |
|------|---------|--------|---------------------------|
| `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useIssues.test.ts` | Issue list tests | ⚠️ Partial | 2 / 35 |
| `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useIssue.test.ts` | Single issue tests | ⚠️ Partial | 2 / 24 |
| `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useCreateIssue.test.ts` | Issue creation tests | ⚠️ Partial | 1 / 13 |
| `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useUpdateIssue.test.ts` | Issue update tests | ⚠️ Partial | 1 / 16 |
| `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useIssueComments.test.ts` | Comment list tests | ⚠️ Partial | 1 / 10 |
| `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useIssueEvents.test.ts` | Event list tests | ⚠️ Partial | 2 / 10 |
| `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useCreateIssueComment.test.ts` | Comment creation tests | ⚠️ Partial | 1 / 15 |
| `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useRepoLabels.test.ts` | Label list tests | ⚠️ Partial | 1 / 8 |
| `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useRepoMilestones.test.ts` | Milestone list tests | ⚠️ Partial | 1 / 8 |
| `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useRepoCollaborators.test.ts` | Collaborator search tests | ⚠️ Partial | 1 / 12 |
| `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useAddIssueLabels.test.ts` | Label add tests | ⚠️ Partial | 1 / 6 |
| `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useRemoveIssueLabel.test.ts` | Label remove tests | ⚠️ Partial | 1 / 11 |

### E2E Test Files

| File | Purpose | Status |
|------|---------|--------|
| `specs/tui/e2e/tui/issues.test.ts` | Issue screen E2E tests (uses hooks via rendered screens) | ❌ Does not exist |

---

## 8. Implementation Plan

Hook implementation files are complete. The remaining work is organized into two phases: **Phase A** is test hardening for the hook unit tests (mock-client based, in `specs/tui/packages/ui-core/`), and **Phase B** is E2E test scaffolding that validates the hooks function correctly when consumed by TUI screens (in `specs/tui/e2e/tui/`).

### Phase A: Hook Unit Test Hardening

Each step is a vertical slice adding missing test cases to existing stub test files.

#### Step A.1 — Validate existing implementations compile and pass

**Action**: Run `bun test specs/tui/packages/ui-core/src/hooks/issues/` to establish baseline.

**Done when**: All existing 14 tests pass (except `useIssueEvents` integration test which should fail with network/404-related assertion).

#### Step A.2 — Harden `useIssues` tests

**File**: `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useIssues.test.ts`

**Add test cases for**:
- State filter (`open`, `closed`, empty string, undefined) — verifies path includes/omits `?state=`
- State filter in cache key — verifies filter change triggers hard reset (cacheKey change)
- `hasMore` true/false based on `issues.length` vs `totalCount`
- `fetchMore` pagination — page 2 fetch appends items
- `fetchMore` no-op when `hasMore=false` or `isLoading=true`
- `refetch` resets to page 1, preserves existing issues during fetch (stale-while-revalidate window)
- Param change (owner, repo) triggers hard reset via cacheKey
- `enabled=false` prevents fetch; transition to `true` triggers fetch
- Abort on unmount; no setState after unmount
- Error mapping (401→UNAUTHORIZED, 404→NOT_FOUND, network→NETWORK_ERROR)
- Stale data preservation on error
- Memory cap: evicts oldest when exceeding 500 items (verify `usePaginatedQuery` maxItems behavior)
- `perPage` capped at 100 when caller passes 200

**Mock data factory**:
```typescript
function makeIssue(n: number): Issue {
  return {
    id: n, number: n, title: `Issue #${n}`, body: "",
    state: "open", author: { id: 1, login: "user" },
    assignees: [], labels: [], milestone_id: null,
    comment_count: 0, closed_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  };
}
```

**Target**: 35 total test cases.

#### Step A.3 — Harden `useIssue` tests

**File**: `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useIssue.test.ts`

**Add test cases for**:
- Successful fetch populates `issue` and sets `isLoading=false`
- 30-second cache — second render within 30s does NOT re-fetch (requires mocking `Date.now()`)
- 30-second cache — fetch after 30s elapsed triggers re-fetch
- Explicit `refetch()` bypasses cache regardless of timestamp
- Stale-while-revalidate — existing issue preserved during refetch
- Param change (`issueNumber`, `owner`, `repo`) triggers re-fetch and resets cache timestamp (via line 98-100)
- Abort in-flight request on param change
- Invalid `issueNumber` negative — `issue=null`, `isLoading=false`, `error=null`, no fetch
- Abort on unmount; no setState after unmount
- Error mapping (401, 404, network)
- Stale issue preserved on error (not set to null)

**Cache simulation technique**: Mock `Date.now()` via Bun's `mock.fn()` to control timestamp. Set initial timestamp, call hook, advance 31s, rerender to trigger re-fetch. The `lastFetchTimestamp` ref comparison on line 43 uses `Date.now()` at runtime.

**Target**: 24 total test cases.

#### Step A.4 — Harden `useCreateIssue` tests

**File**: `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useCreateIssue.test.ts`

**Add test cases for**:
- Validation: whitespace-only title rejects (already tested with `"   "`)
- Validation: completely empty string title rejects
- Successful mutation: correct POST path, body includes `title` and `body`
- Successful mutation: returns created `Issue` from 201 response
- `isLoading` lifecycle: true during mutation, false after
- Optional fields: `assignees`, `labels`, `milestone` included when provided
- Optional fields: omitted from body when undefined
- Double-submit prevention: second call rejects while first in-flight
- Error handling: 422 with field errors parsed
- Error handling: 401 parsed as UNAUTHORIZED
- Error handling: sets `error` state on failure
- Title is trimmed in the sent body

**Target**: 13 total test cases.

#### Step A.5 — Harden `useUpdateIssue` tests

**File**: `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useUpdateIssue.test.ts`

**Add test cases for**:
- Successful PATCH with correct path and body
- Returns updated `Issue` from 200 response
- `isLoading` lifecycle
- Optimistic: `onOptimistic` called synchronously before network request
- Optimistic success: `onSettled` called after successful mutation
- Optimistic failure: `onRevert → onError → onSettled` called in that order
- Error re-thrown after callbacks execute
- Milestone handling: `milestone: null` sends `{ milestone: null }` in body
- Milestone handling: `milestone: undefined` omits `milestone` key from body
- Milestone handling: `milestone: 5` sends `{ milestone: 5 }` in body
- Partial patch: only defined fields included in PATCH body
- Full patch: all fields included when all defined
- State sent as string (`'open'` or `'closed'`)
- Error 403 parsed as FORBIDDEN
- Error 404 parsed as NOT_FOUND

**Callback verification pattern**:
```typescript
const callOrder: string[] = [];
const callbacks = {
  onOptimistic: () => callOrder.push("optimistic"),
  onRevert: () => callOrder.push("revert"),
  onError: () => callOrder.push("error"),
  onSettled: () => callOrder.push("settled"),
};
// After mutation failure:
expect(callOrder).toEqual(["optimistic", "revert", "error", "settled"]);
```

**Target**: 16 total test cases.

#### Step A.6 — Harden `useIssueComments` tests

**File**: `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useIssueComments.test.ts`

**Add test cases for**:
- Successful fetch populates `comments` and reads `X-Total-Count`
- Correct request path includes issue number
- `hasMore=true` when `comments.length < totalCount`
- `fetchMore` fetches page 2 and appends results
- Disabled when `issueNumber` is 0 (enabled=false path)
- Disabled when `issueNumber` is negative
- Abort on unmount
- Error handling: 404 mapped to NOT_FOUND
- perPage capped at 100

**Target**: 10 total test cases.

#### Step A.7 — Harden `useCreateIssueComment` tests

**File**: `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useCreateIssueComment.test.ts`

**Add test cases for**:
- Validation: whitespace-only body rejects
- Validation: body is trimmed before sending
- Successful POST with correct path
- Returns created `IssueComment` from 201 response
- `isLoading` lifecycle
- Optimistic: `onOptimistic` called with temp comment before network request
- Optimistic: temp comment has negative `id` sentinel (`id < 0`)
- Optimistic: temp comment has trimmed body
- Optimistic: temp comment has `type = 'comment'`
- Optimistic success: `onSettled` called with `tempId` and server comment
- Optimistic failure: `onRevert` called with `tempId`
- Optimistic failure: `onError` called with error and `tempId`
- Callback order on failure: `onRevert → onError → onSettled`
- Double-submit prevention

**Target**: 15 total test cases.

#### Step A.8 — Harden `useIssueEvents` tests

**File**: `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useIssueEvents.test.ts`

**Add test cases for**:
- Successful fetch populates `events` (mock-client — succeeds)
- Reads `X-Total-Count` header (mock-client)
- Correct request path includes issue number
- `hasMore=true` when `events.length < totalCount` (mock-client)
- `fetchMore` fetches page 2 (mock-client)
- Disabled when `issueNumber` is 0 (mock-client)
- Abort on unmount (mock-client)
- Error handling (mock-client)
- **Integration test: fetches from live server (expected to FAIL — 404, route not implemented)** — already exists
- **Integration test: paginates from live server (expected to FAIL — 404)** — new

**Target**: 10 total test cases (8 pass via mock-client, 2 intentionally fail).

**Policy**: Integration tests are NEVER skipped or commented out. They serve as a failing signal that the backend route needs implementation.

#### Step A.9 — Harden label/milestone/collaborator/label-mutation tests

**Files** (5 test files):

**`useRepoLabels.test.ts`** — 8 test cases:
- Fetch lifecycle: correct path, populates labels, reads X-Total-Count
- Pagination: hasMore, fetchMore
- Param changes: re-fetches on owner/repo change (via cacheKey)
- Error handling: 404 mapped to NOT_FOUND
- Abort on unmount

**`useRepoMilestones.test.ts`** — 8 test cases:
- Fetch lifecycle: correct path, populates milestones, reads X-Total-Count
- State filter: appends `?state=open`, omits when empty
- Pagination: hasMore, fetchMore
- Error handling: 404 mapped to NOT_FOUND
- State filter change triggers hard reset

**`useRepoCollaborators.test.ts`** — 12 test cases:
- Initial state: empty users, isLoading true when query non-empty
- Fetch: correct path (`/api/search/users?q=...&limit=20`), populates users
- Fetch: reads `data.items` from response (not top-level array)
- Empty query guard: no fetch, empty users, isLoading false
- Enabled=false guard: no fetch even with non-empty query
- Query changes: re-fetches, aborts in-flight
- Abort on unmount
- Error handling: NetworkError on fetch failure
- Refetch: calls `refetch()` triggers re-fetch
- URL-encodes query parameter

**`useAddIssueLabels.test.ts`** — 6 test cases:
- Validation: empty array rejects
- Mutation: correct POST path with `{ labels: [...] }`
- Response: returns `Label[]` on 200 (not 201)
- isLoading lifecycle
- Error: 404 when issue doesn't exist
- Error: 422 when label names invalid

**`useRemoveIssueLabel.test.ts`** — 11 test cases:
- Validation: empty string rejects (already exists)
- Validation: whitespace-only rejects
- Validation: trims before sending
- Mutation: correct DELETE path, URL-encodes label name
- Response: handles 204 empty response
- isLoading lifecycle
- Optimistic: `onOptimistic` before request, `onSettled` on success
- Failure: `onRevert → onError → onSettled` order
- Error re-thrown after callbacks
- Abort on unmount

**Target**: 45 total test cases across 5 files.

#### Step A.10 — Final verification

**Action**:
1. `cd specs/tui && bun run check` — TypeScript compiles with no errors.
2. `bun test specs/tui/packages/ui-core/src/hooks/issues/` — all mock-client tests pass; `useIssueEvents` integration tests fail with expected 404.
3. Verify imports resolve from `apps/tui/`:
   ```typescript
   import {
     useIssues, useIssue, useCreateIssue, useUpdateIssue,
     useIssueComments, useIssueEvents, useCreateIssueComment,
     useRepoLabels, useRepoMilestones, useRepoCollaborators,
     useAddIssueLabels, useRemoveIssueLabel,
     APIClientProvider, useAPIClient, ApiError, NetworkError,
   } from "@codeplane/ui-core";
   ```

**Done when**: All checks pass and total test count is ~179 (165 passing + 2 intentionally failing + existing 14 baseline minus duplicates).

### Phase B: E2E Test Scaffolding

E2E tests use `@microsoft/tui-test` and validate issue hooks through rendered TUI screens. These tests run against a real API server with test fixtures.

#### Step B.1 — Create issue E2E test file

**File**: `specs/tui/e2e/tui/issues.test.ts`

This file does NOT exist yet and must be created. These tests exercise the `useIssues`, `useIssue`, `useRepoLabels`, `useRepoMilestones` hooks by navigating to the issue list screen and verifying terminal output.

```typescript
import { test, expect, describe } from "bun:test";
import { launchTUI } from "./helpers";

describe("TUI_ISSUES - issue data hooks via screen", () => {
  test("issue list renders issues from useIssues hook", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "i"); // go to issues
    await terminal.waitForText("Issues");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("issue list shows loading state before data arrives", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText(/Loading|\.\.\./);
    await terminal.terminate();
  });

  test("issue list shows empty state when no issues exist", async () => {
    const terminal = await launchTUI({
      cols: 120, rows: 40,
      env: { CODEPLANE_REPO: "owner/empty-repo" }
    });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("j/k navigates issue list via ScrollableList", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    await terminal.sendKeys("j");
    const line = terminal.getLine(4);
    expect(line).toMatch(/\x1b\[7m/);
    await terminal.terminate();
  });

  test("Enter on issue navigates to detail view using useIssue", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    await terminal.sendKeys("Enter");
    expect(terminal.getLine(0)).toMatch(/Issues.*›.*#\d+/);
    await terminal.terminate();
  });

  test("q from issue detail returns to list", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    await terminal.sendKeys("Enter");
    await terminal.waitForText(/#\d+/);
    await terminal.sendKeys("q");
    await terminal.waitForText("Issues");
    expect(terminal.getLine(0)).not.toMatch(/#\d+/);
    await terminal.terminate();
  });

  test("issue detail shows comments from useIssueComments", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    await terminal.sendKeys("Enter");
    await terminal.waitForText(/#\d+/);
    await terminal.waitForText(/Comments/i);
    await terminal.terminate();
  });

  test("issue detail shows labels", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    await terminal.sendKeys("Enter");
    await terminal.waitForText(/#\d+/);
    await terminal.waitForText(/Labels/i);
    await terminal.terminate();
  });

  test("issue list renders at minimum terminal size 80x24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("issue list renders at large terminal size 200x60", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("auth error shows session expired message (401)", async () => {
    const terminal = await launchTUI({
      cols: 120, rows: 40,
      env: { CODEPLANE_TOKEN: "invalid-expired-token" }
    });
    await terminal.waitForText(/expired|unauthorized/i);
    await terminal.terminate();
  });
});
```

**Note**: These E2E tests are expected to fail until the TUI issue screens are implemented (separate ticket `tui-issues-screen`). Per project policy, they are left failing — never skipped or commented out.

---

## 9. Unit & Integration Tests

### Framework

**Hook unit tests**: `bun:test` for all tests within `specs/tui/packages/ui-core/`. Tests use `renderHook` from `specs/tui/packages/ui-core/src/test-utils/renderHook.ts` and `createMockAPIClient` from `specs/tui/packages/ui-core/src/test-utils/mockAPIClient.ts` for controlling responses.

**E2E tests**: `@microsoft/tui-test` for terminal-rendered tests in `specs/tui/e2e/tui/`. These capture terminal snapshots, simulate keyboard input, and assert on rendered output.

### Testing Strategy

Tests fall into three categories:

1. **Pure logic tests** — Validation logic, body construction. No server, no React async. Always pass.
2. **Hook behavior tests with mock client** — Verify hook state transitions, cleanup, validation. Use `mockAPIClient`. These pass.
3. **Integration tests against real API** — Expected to **fail** for event endpoint (no route) and for E2E tests (no screens yet). Tests are NEVER skipped or commented out.

### Test Pattern

All hook tests follow the established pattern from agent hooks:

```typescript
import { expect, test, describe, beforeEach } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";
import { useHookName } from "../useHookName.js";

describe("useHookName", () => {
  let mockClient: ReturnType<typeof createMockAPIClient>;

  beforeEach(() => {
    mockClient = createMockAPIClient();
  });

  describe("category", () => {
    test("behavior description", async () => {
      mockClient.respondWithJSON(200, [
        { id: 1, number: 1, title: "Test Issue", body: "", state: "open",
          author: { id: 1, login: "user" }, assignees: [], labels: [],
          milestone_id: null, comment_count: 0, closed_at: null,
          created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" }
      ], { "X-Total-Count": "1" });

      const { result, waitForNextUpdate, unmount } = renderHook(
        () => useHookName("owner", "repo"),
        { apiClient: mockClient }
      );

      let iters = 0;
      while (result.current.isLoading && iters < 20) {
        await waitForNextUpdate();
        iters++;
      }

      expect(mockClient.calls[0].path).toBe("/api/repos/owner/repo/issues?page=1&per_page=30");
      expect(result.current.items).toHaveLength(1);
      unmount();
    });
  });
});
```

**Important mock-client caveats**:
- `createMockAPIClient()` uses a FIFO queue: responses must be enqueued in the order they will be consumed.
- Each `respondWithJSON` / `respondWithError` call adds one entry. One fetch = one queued response.
- `mockClient.calls` tracks all calls made. `mockClient.callsTo(pattern)` filters by path.
- After tests, always call `unmount()` to prevent leaked timers or dangling effects.
- For multi-page tests, enqueue responses for both page 1 and page 2.

### 9.1 `useIssues.test.ts` — Full Test Specification

```
describe("useIssues")
  describe("initial state")
    ✓ returns empty issues array before fetch completes
    ✓ isLoading is true on mount when enabled
    ✓ isLoading is false on mount when enabled=false
    ✓ error is null initially

  describe("fetch lifecycle") [mock client]
    ✓ fetches /api/repos/:owner/:repo/issues with page=1&per_page=30
    ✓ populates issues from response JSON array
    ✓ reads X-Total-Count header for totalCount
    ✓ sets isLoading=false after successful fetch
    ✓ respects custom perPage option (perPage=10 → per_page=10)
    ✓ caps perPage at 100 (perPage=200 → per_page=100)

  describe("state filter") [mock client]
    ✓ appends state=open to request path when state is 'open'
    ✓ appends state=closed to request path when state is 'closed'
    ✓ omits state param when state is empty string
    ✓ omits state param when state is undefined
    ✓ re-fetches when state filter changes (cacheKey change → hard reset)
    ✓ includes state in cacheKey (verify different state = different cacheKey)

  describe("hasMore") [mock client]
    ✓ hasMore=true when issues.length < totalCount
    ✓ hasMore=false when issues.length >= totalCount

  describe("fetchMore") [mock client]
    ✓ fetches page=2 and appends to existing issues
    ✓ no-op when hasMore=false
    ✓ no-op when isLoading=true

  describe("refetch") [mock client]
    ✓ resets page to 1 and re-fetches
    ✓ preserves existing issues during refetch (stale-while-revalidate)
    ✓ replaces issues on successful refetch response

  describe("param changes") [mock client]
    ✓ re-fetches when owner changes
    ✓ re-fetches when repo changes
    ✓ clears items on param change (hard reset via cacheKey)

  describe("enabled option") [mock client]
    ✓ does not fetch when enabled=false
    ✓ fetches when enabled transitions from false to true

  describe("abort and cleanup") [mock client]
    ✓ aborts request on unmount
    ✓ does not setState after unmount

  describe("error handling") [mock client]
    ✓ maps 401 response to UNAUTHORIZED ApiError
    ✓ maps 404 response to NOT_FOUND ApiError
    ✓ sets NetworkError on fetch failure
    ✓ preserves stale issues on error
    ✓ clears error on successful refetch
```

**Total**: 35 test cases

### 9.2 `useIssue.test.ts` — Full Test Specification

```
describe("useIssue")
  describe("initial state")
    ✓ issue is null before fetch completes
    ✓ isLoading is true on mount
    ✓ error is null initially

  describe("fetch lifecycle") [mock client]
    ✓ fetches /api/repos/:owner/:repo/issues/:number
    ✓ populates issue from response JSON
    ✓ sets isLoading=false after successful fetch

  describe("30s cache") [mock client]
    ✓ does not re-fetch within 30s of last successful fetch
    ✓ re-fetches after 30s have elapsed
    ✓ explicit refetch() bypasses cache regardless of timestamp

  describe("refetch") [mock client]
    ✓ re-fetches issue data
    ✓ preserves existing issue during refetch (stale-while-revalidate)

  describe("param changes") [mock client]
    ✓ re-fetches when issueNumber changes
    ✓ re-fetches when owner or repo changes
    ✓ aborts in-flight request on param change
    ✓ resets cache timestamp on param change

  describe("invalid issueNumber guard")
    ✓ does not fetch when issueNumber is 0
    ✓ does not fetch when issueNumber is negative
    ✓ issue is null when issueNumber is invalid
    ✓ isLoading is false when issueNumber is invalid

  describe("abort and cleanup") [mock client]
    ✓ aborts request on unmount
    ✓ does not setState after unmount

  describe("error handling") [mock client]
    ✓ maps 401 response to UNAUTHORIZED ApiError
    ✓ maps 404 response to NOT_FOUND ApiError
    ✓ sets NetworkError on fetch failure
    ✓ preserves stale issue on error (does not set to null)
```

**Total**: 24 test cases

### 9.3 `useCreateIssue.test.ts` — Full Test Specification

```
describe("useCreateIssue")
  describe("client-side validation")
    ✓ rejects with ApiError(400) when title is empty string
    ✓ rejects with ApiError(400) when title is whitespace only
    ✓ trims title before sending

  describe("mutation lifecycle") [mock client]
    ✓ sends POST /api/repos/:owner/:repo/issues with correct body
    ✓ returns created Issue on 201 success
    ✓ sets isLoading=true during mutation
    ✓ sets isLoading=false after success
    ✓ includes assignees, labels, milestone in body when provided
    ✓ omits optional fields when not provided

  describe("double-submit prevention") [mock client]
    ✓ rejects second call while first is in progress

  describe("error handling") [mock client]
    ✓ parses 422 error with field errors
    ✓ parses 401 error as UNAUTHORIZED
    ✓ sets error state on failure
```

**Total**: 13 test cases

### 9.4 `useUpdateIssue.test.ts` — Full Test Specification

```
describe("useUpdateIssue")
  describe("mutation lifecycle") [mock client]
    ✓ sends PATCH /api/repos/:owner/:repo/issues/:number with patch body
    ✓ returns updated Issue on 200 success
    ✓ sets isLoading=true during mutation
    ✓ sets isLoading=false after success

  describe("optimistic update") [mock client]
    ✓ calls onOptimistic synchronously before network request
    ✓ calls onSettled on success
    ✓ calls onRevert, onError, onSettled on failure (in that order)
    ✓ re-throws error after calling callbacks

  describe("milestone handling") [mock client]
    ✓ includes milestone: null in body when patch.milestone is null
    ✓ omits milestone key from body when patch.milestone is undefined
    ✓ includes milestone: 5 in body when patch.milestone is 5

  describe("body construction") [mock client]
    ✓ only includes defined fields in PATCH body
    ✓ includes all fields when all are defined
    ✓ sends state as string ('open' or 'closed')

  describe("error handling") [mock client]
    ✓ parses 403 error as FORBIDDEN
    ✓ parses 404 error as NOT_FOUND
```

**Total**: 16 test cases

### 9.5 `useIssueComments.test.ts` — Full Test Specification

```
describe("useIssueComments")
  describe("initial state")
    ✓ returns empty comments array before fetch completes
    ✓ isLoading is true on mount

  describe("fetch lifecycle") [mock client]
    ✓ fetches /api/repos/:owner/:repo/issues/:number/comments
    ✓ populates comments from response JSON array
    ✓ reads X-Total-Count header for totalCount

  describe("pagination") [mock client]
    ✓ hasMore=true when comments.length < totalCount
    ✓ fetchMore fetches page=2 and appends

  describe("disabled when issueNumber invalid") [mock client]
    ✓ does not fetch when issueNumber is 0
    ✓ does not fetch when issueNumber is negative

  describe("abort and cleanup") [mock client]
    ✓ aborts request on unmount
```

**Total**: 10 test cases

### 9.6 `useIssueEvents.test.ts` — Full Test Specification

```
describe("useIssueEvents")
  describe("initial state")
    ✓ returns empty events array before fetch completes
    ✓ isLoading is true on mount

  describe("fetch lifecycle") [mock client]
    ✓ fetches /api/repos/:owner/:repo/issues/:number/events
    ✓ populates events from response JSON array
    ✓ reads X-Total-Count header for totalCount

  describe("pagination") [mock client]
    ✓ hasMore=true when events.length < totalCount
    ✓ fetchMore fetches page=2 and appends

  describe("disabled when issueNumber invalid") [mock client]
    ✓ does not fetch when issueNumber is 0

  describe("integration - events endpoint") [expected to FAIL]
    ✗ fetches events from live server (404 — route not implemented)
    ✗ paginates events from live server (404 — route not implemented)
    Note: These tests are NEVER skipped or commented out.
```

**Total**: 10 test cases (8 pass, 2 intentionally fail)

### 9.7 `useCreateIssueComment.test.ts` — Full Test Specification

```
describe("useCreateIssueComment")
  describe("client-side validation")
    ✓ rejects with ApiError(400) when body is empty string
    ✓ rejects with ApiError(400) when body is whitespace only
    ✓ trims body before sending

  describe("mutation lifecycle") [mock client]
    ✓ sends POST /api/repos/:owner/:repo/issues/:number/comments
    ✓ returns created IssueComment on 201 success
    ✓ sets isLoading during mutation

  describe("optimistic append") [mock client]
    ✓ calls onOptimistic with temp comment before network request
    ✓ temp comment has negative id sentinel (id < 0)
    ✓ temp comment has trimmed body
    ✓ temp comment has type = 'comment'
    ✓ calls onSettled with tempId and server comment on success
    ✓ calls onRevert with tempId on failure
    ✓ calls onError with error and tempId on failure
    ✓ callback order: onRevert → onError → onSettled on failure

  describe("double-submit prevention") [mock client]
    ✓ rejects second call while first is in progress
```

**Total**: 15 test cases

### 9.8 `useRepoLabels.test.ts` — Full Test Specification

```
describe("useRepoLabels")
  describe("fetch lifecycle") [mock client]
    ✓ fetches /api/repos/:owner/:repo/labels
    ✓ populates labels from response JSON array
    ✓ reads X-Total-Count header for totalCount

  describe("pagination") [mock client]
    ✓ hasMore=true when labels.length < totalCount
    ✓ fetchMore fetches page=2 and appends

  describe("param changes") [mock client]
    ✓ re-fetches when owner changes
    ✓ re-fetches when repo changes

  describe("error handling") [mock client]
    ✓ maps 404 response to NOT_FOUND ApiError
```

**Total**: 8 test cases

### 9.9 `useRepoMilestones.test.ts` — Full Test Specification

```
describe("useRepoMilestones")
  describe("fetch lifecycle") [mock client]
    ✓ fetches /api/repos/:owner/:repo/milestones
    ✓ populates milestones from response JSON array
    ✓ reads X-Total-Count header for totalCount

  describe("state filter") [mock client]
    ✓ appends state=open when state option is 'open'
    ✓ omits state when state option is empty

  describe("pagination") [mock client]
    ✓ hasMore=true when milestones.length < totalCount
    ✓ fetchMore fetches page=2 and appends

  describe("error handling") [mock client]
    ✓ maps 404 response to NOT_FOUND ApiError
```

**Total**: 8 test cases

### 9.10 `useRepoCollaborators.test.ts` — Full Test Specification

```
describe("useRepoCollaborators")
  describe("initial state")
    ✓ returns empty users array before fetch completes
    ✓ isLoading is true on mount when query is non-empty

  describe("fetch lifecycle") [mock client]
    ✓ fetches /api/search/users?q=query&limit=20
    ✓ populates users from response items array
    ✓ sets isLoading=false after success

  describe("empty query guard")
    ✓ does not fetch when query is empty string
    ✓ users is empty when query is empty
    ✓ isLoading is false when query is empty

  describe("query changes") [mock client]
    ✓ re-fetches when query changes
    ✓ aborts in-flight request on query change

  describe("abort and cleanup") [mock client]
    ✓ aborts request on unmount

  describe("error handling") [mock client]
    ✓ sets NetworkError on fetch failure
```

**Total**: 12 test cases

### 9.11 `useAddIssueLabels.test.ts` — Full Test Specification

```
describe("useAddIssueLabels")
  describe("client-side validation")
    ✓ rejects with ApiError(400) when labelNames is empty array

  describe("mutation lifecycle") [mock client]
    ✓ sends POST /api/repos/:owner/:repo/issues/:number/labels with { labels: [...] }
    ✓ returns Label[] on 200 success (not 201)
    ✓ sets isLoading during mutation

  describe("error handling") [mock client]
    ✓ parses 404 error when issue does not exist
    ✓ parses 422 error when label names are invalid
```

**Total**: 6 test cases

### 9.12 `useRemoveIssueLabel.test.ts` — Full Test Specification

```
describe("useRemoveIssueLabel")
  describe("client-side validation")
    ✓ rejects with ApiError(400) when labelName is empty string
    ✓ rejects with ApiError(400) when labelName is whitespace only
    ✓ trims labelName before sending

  describe("mutation lifecycle") [mock client]
    ✓ sends DELETE /api/repos/:owner/:repo/issues/:number/labels/:name
    ✓ URL-encodes label name in path
    ✓ handles 204 empty response
    ✓ sets isLoading during mutation

  describe("optimistic removal") [mock client]
    ✓ calls onOptimistic synchronously before network request
    ✓ calls onSettled on success
    ✓ calls onRevert, onError, onSettled on failure (in that order)
    ✓ re-throws error after calling callbacks
```

**Total**: 11 test cases

### Test Count Summary

| Test File | Cases | Expected Pass | Expected Fail |
|-----------|-------|---------------|---------------|
| useIssues.test.ts | 35 | 35 | 0 |
| useIssue.test.ts | 24 | 24 | 0 |
| useCreateIssue.test.ts | 13 | 13 | 0 |
| useUpdateIssue.test.ts | 16 | 16 | 0 |
| useIssueComments.test.ts | 10 | 10 | 0 |
| useIssueEvents.test.ts | 10 | 8 | 2 (404 — no backend route) |
| useCreateIssueComment.test.ts | 15 | 15 | 0 |
| useRepoLabels.test.ts | 8 | 8 | 0 |
| useRepoMilestones.test.ts | 8 | 8 | 0 |
| useRepoCollaborators.test.ts | 12 | 12 | 0 |
| useAddIssueLabels.test.ts | 6 | 6 | 0 |
| useRemoveIssueLabel.test.ts | 11 | 11 | 0 |
| **Hook unit subtotal** | **168** | **166** | **2** |
| issues.test.ts (E2E) | 11 | 0 | 11 (no screens yet) |
| **Grand total** | **179** | **166** | **13** |

---

## 10. Downstream Consumer Integration Guide

This section describes how TUI screens (implemented in the `tui-issues-screen` ticket) consume these hooks.

### 10.1 Import Pattern

```typescript
// apps/tui/src/screens/Issues/IssueListScreen.tsx
import {
  useIssues,
  useRepoLabels,
  useRepoMilestones,
  type Issue,
  type IssueState,
} from "@codeplane/ui-core";
```

### 10.2 Repo Context from Navigation

Issue hooks require `owner` and `repo` strings. TUI screens obtain these from the `NavigationProvider`:

```typescript
import { useNavigation } from "../../providers/NavigationProvider";

function IssueListScreen() {
  const { repoContext } = useNavigation();
  if (!repoContext) return <text>No repository selected</text>;

  const { owner, repo } = repoContext;
  const { issues, isLoading, error, hasMore, fetchMore } = useIssues(owner, repo, { state: "open" });
  // ...
}
```

### 10.3 Pagination via ScrollableList

The `ScrollableList` component (from `tui-scrollable-list` ticket) integrates with paginated hooks:

```typescript
<ScrollableList
  items={issues}
  keyExtractor={(issue) => String(issue.number)}
  renderItem={(issue, focused) => <IssueRow issue={issue} focused={focused} />}
  onSelect={(issue) => navigation.push("IssueDetail", { number: String(issue.number) })}
  onFetchMore={fetchMore}
  hasMore={hasMore}
  isLoading={isLoading}
  emptyMessage="No issues found"
/>
```

### 10.4 Optimistic Updates in Issue Detail

The close/reopen action uses `useUpdateIssue` with optimistic callbacks:

```typescript
function IssueDetailScreen({ issueNumber }: { issueNumber: number }) {
  const { owner, repo } = useNavigation().repoContext!;
  const { issue, refetch } = useIssue(owner, repo, issueNumber);
  const { mutate: updateIssue } = useUpdateIssue(owner, repo, {
    onOptimistic: (num, patch) => {
      // Immediately update local issue state for responsive UI
    },
    onRevert: (num) => {
      // Revert if server rejects
    },
    onError: (error, num) => {
      // Show inline error
    },
    onSettled: (num) => {
      refetch(); // Refresh from server
    },
  });

  const toggleState = () => {
    if (!issue) return;
    const newState = issue.state === "open" ? "closed" : "open";
    updateIssue(issueNumber, { state: newState });
  };
}
```

### 10.5 Comment Creation with Optimistic Append

```typescript
function CommentSection({ issueNumber }: { issueNumber: number }) {
  const { owner, repo } = useNavigation().repoContext!;
  const { comments, refetch: refetchComments } = useIssueComments(owner, repo, issueNumber);
  const [localComments, setLocalComments] = useState<IssueComment[]>([]);

  const { mutate: createComment } = useCreateIssueComment(owner, repo, {
    onOptimistic: (num, tempComment) => {
      setLocalComments(prev => [...prev, tempComment]);
    },
    onSettled: (num, tempId, serverComment) => {
      setLocalComments(prev => prev.filter(c => c.id !== tempId));
      refetchComments();
    },
    onRevert: (num, tempId) => {
      setLocalComments(prev => prev.filter(c => c.id !== tempId));
    },
  });

  const allComments = [...comments, ...localComments];
  // Render allComments...
}
```

### 10.6 Cross-Hook Cache Invalidation

This ticket does NOT implement automatic cross-hook cache invalidation. The TUI screen layer is responsible for calling `refetch()` on list hooks after successful mutations:

```typescript
// After creating an issue:
const { mutate: createIssue } = useCreateIssue(owner, repo);
const { refetch: refetchIssues } = useIssues(owner, repo);

async function handleCreateIssue(data: CreateIssueRequest) {
  await createIssue(data);
  refetchIssues(); // Manually invalidate list
  navigation.pop(); // Return to list
}
```

---

## 11. Productionization Notes

### 11.1 Test Gaps — Current vs. Required

The current test files are **stubs** — they cover only initial state and basic fetch lifecycle (1–2 tests per hook, 14 total). The spec in §9 defines the **full** test suite (168 hook unit tests + 11 E2E tests = 179 total). Hardening these tests is the primary remaining work.

Key areas with zero test coverage today:
- State filter behavior in `useIssues` and `useRepoMilestones`
- `fetchMore` pagination (all paginated hooks)
- `refetch` stale-while-revalidate behavior
- Param change hard resets
- `enabled` flag transitions
- Memory cap (500-item eviction)
- 30-second cache logic in `useIssue`
- Client-side validation completeness for mutations
- Optimistic callback sequence (order of `onRevert → onError → onSettled`)
- Milestone `null` vs `undefined` body construction in `useUpdateIssue`
- Negative ID sentinel in `useCreateIssueComment` optimistic append
- Double-submit prevention for all mutations
- Error handling (401, 403, 404, 422, network)
- URL encoding in `useRemoveIssueLabel`
- Body trimming verification for `useCreateIssueComment`

### 11.2 `useRepoCollaborators` Workaround

The current implementation uses the user search endpoint as a workaround for the missing collaborators list API. When a real `GET /api/repos/:owner/:repo/collaborators` endpoint is implemented:

1. Update the hook's path from `/api/search/users?q=...` to `/api/repos/${owner}/${repo}/collaborators`.
2. Switch from single-fetch to `usePaginatedQuery` if the endpoint supports pagination.
3. Update the response type from `UserSearchResult` to a `Collaborator` type that includes permission level.
4. The `owner` and `repo` params will then be used in the actual request path.
5. Update tests to validate the new endpoint.

### 11.3 `useIssueEvents` Blocked Endpoint

The hook is fully implemented but blocked on a missing HTTP route. To unblock:

1. Add a route handler to `apps/server/src/routes/issues.ts` for `GET /api/repos/:owner/:repo/issues/:number/events`.
2. Follow the established pattern: `parsePagination`, `cursorToPage`, call `service().listIssueEvents(...)`, `setPaginationHeaders`, `writeJSON(c, 200, items)`.
3. The `IssueService.listIssueEvents` method already exists in the SDK and returns `{ items, total }`.
4. **Important caveat**: `listIssueEvents` has no COUNT query — `total` is `items.length` on the current page. The `X-Total-Count` header will be inaccurate for pagination. Consider adding a proper count query in the service layer, or document that `hasMore` may be unreliable for events.
5. Once the route is live, the currently-failing integration tests in `useIssueEvents.test.ts` will pass.

### 11.4 `usePaginatedQuery` Query Param Improvement

The one-line patch (§5.1) is applied and backward-compatible. If more hooks need custom query parameters, consider extending `usePaginatedQuery` to accept a `queryParams: Record<string, string>` option that it merges into the URL. This avoids the fragile pattern of baking query params into the path string.

**Proposed interface evolution**:
```typescript
interface PaginatedQueryConfig<T> {
  // ... existing fields ...
  queryParams?: Record<string, string>; // merged into URL alongside page/per_page
}
```

### 11.5 Cache Invalidation Across Hooks

This ticket does NOT implement cross-hook cache invalidation. When `useCreateIssue` succeeds, `useIssues` does not automatically refetch. The TUI screen layer is responsible for calling `refetch()` on the list hook after a successful mutation (see §10.6).

**Future improvement**: Introduce a shared cache invalidation bus (event emitter or React context) that mutations can signal to trigger automatic refetch on related query hooks. Pattern:
```typescript
// Future: useCacheInvalidation()
const invalidate = useCacheInvalidation();
await createIssue(data);
invalidate("issues", { owner, repo }); // All useIssues hooks with matching params refetch
```

### 11.6 Rate Limiting

The hooks surface `RATE_LIMITED` errors but do not implement automatic retry-after handling. If rate limiting becomes a problem, a future enhancement can read the `Retry-After` response header and implement exponential backoff at the `usePaginatedQuery` level.

### 11.7 Mutation Error Type Inconsistency

The mutation hooks throw raw `Response` objects on non-success status codes (`throw response` in `mutationFn`). The `useMutation` base hook catches these and stores them in `error` state as-is. This means:

- `mutation.error` may be a `Response` object, not a `HookError` (`ApiError | NetworkError`)
- Callers that type-narrow on `error instanceof ApiError` will get `false` for server errors from mutations
- The `useCreateIssue` validation throws a proper `ApiError`, but HTTP errors throw `Response`

**Recommended fix**: Always parse errors explicitly in `mutationFn`:
```typescript
// Instead of: throw response;
// Do:
const parsedError = await parseResponseError(response);
throw parsedError;
```

This is a minor cleanup that should be done before the `tui-issues-screen` ticket consumes these hooks.

### 11.8 `useRemoveIssueLabel` — Untrimmed Name in Optimistic Callback

The outer `mutate` wrapper passes the raw `labelName` to `mutation.mutate({ issueNumber, labelName })`, but trimming happens inside `mutationFn`. This means `onOptimistic` receives the untrimmed name. If the consumer uses the label name to filter a local list, whitespace-padded names won't match. Consider trimming in the outer wrapper before passing to `mutation.mutate`.

### 11.9 `hasMore` Calculation in `usePaginatedQuery`

The current `hasMore` calculation (line 191-193 in `usePaginatedQuery.ts`) calls `config.parseResponse([], new Headers())` to detect whether `totalCount` is null. This is a side-effect-free heuristic, but it's fragile — if `parseResponse` has side effects or throws on empty input, it will break. Consider extracting a `hasTotalCount: boolean` flag in the config interface instead.

### 11.10 Test Utility Limitations

The current `renderHook` test utility uses a minimal React mock (custom `useState`, `useEffect`, etc. implementations in `react-mock.ts`). Known limitations:

1. **`useCallback` deps**: The mock's `useCallback` does dependency comparison, but the comparison happens at render time, not at call time. This matches React behavior.
2. **Effect ordering**: Effects run in registration order. This matches React but may diverge for complex hook compositions.
3. **No `useReducer`**: Not implemented in the mock. If any hook needs `useReducer`, the mock must be extended.
4. **No Suspense/ErrorBoundary**: The mock doesn't support React Suspense or error boundaries.
5. **Single context value**: `useContext` always returns `state.currentContextValue` regardless of which context is passed. This works because all hooks only use `APIClientContext`, but would break if hooks used multiple contexts.

### 11.11 `useIssue` Cache Race Condition

The 30-second cache in `useIssue` has a subtle issue: the cache check on line 43 checks `refetchCounter === 0`. After the first explicit `refetch()`, `refetchCounter` becomes 1+, which means the cache check `refetchCounter === 0` will ALWAYS be false on subsequent renders. This effectively disables the 30-second cache after the first explicit refetch. Subsequent renders will always re-fetch.

**Impact**: Minor performance issue. After first `refetch()`, every re-render triggers a new fetch instead of using the 30s cache.

**Fix**: Track a separate `lastRefetchCounter` ref and compare: only bypass cache when `refetchCounter` changed since last check.

---

## 12. Barrel Export Verification

### Issue hooks barrel (`specs/tui/packages/ui-core/src/hooks/issues/index.ts`):

```typescript
export { useIssues } from "./useIssues.js";
export { useIssue } from "./useIssue.js";
export { useCreateIssue } from "./useCreateIssue.js";
export { useUpdateIssue } from "./useUpdateIssue.js";
export type { UpdateIssueCallbacks } from "./useUpdateIssue.js";
export { useIssueComments } from "./useIssueComments.js";
export { useIssueEvents } from "./useIssueEvents.js";
export { useCreateIssueComment } from "./useCreateIssueComment.js";
export type { CreateIssueCommentCallbacks } from "./useCreateIssueComment.js";
export { useRepoLabels } from "./useRepoLabels.js";
export { useRepoMilestones } from "./useRepoMilestones.js";
export { useRepoCollaborators } from "./useRepoCollaborators.js";
export { useAddIssueLabels } from "./useAddIssueLabels.js";
export { useRemoveIssueLabel } from "./useRemoveIssueLabel.js";
export type { RemoveIssueLabelCallbacks } from "./useRemoveIssueLabel.js";
```

### Public barrel (`specs/tui/packages/ui-core/src/index.ts`) includes:

- All issue hooks exported by name
- All callback types exported as `type`
- All issue domain types exported from `./types/index.js`

Verification: imports from `@codeplane/ui-core` resolve all twelve hooks and all types.

---

## 13. Source of Truth

This engineering spec should be maintained alongside:

- [specs/tui/prd.md](../prd.md) — Product requirements
- [specs/tui/design.md](../design.md) — Design specification
- [specs/tui/engineering/tui-agent-data-hooks.md](./tui-agent-data-hooks.md) — Agent data hooks (established pattern)
- [apps/server/src/routes/issues.ts](../../../apps/server/src/routes/issues.ts) — Issue API routes
- [apps/server/src/routes/labels.ts](../../../apps/server/src/routes/labels.ts) — Label API routes
- [apps/server/src/routes/milestones.ts](../../../apps/server/src/routes/milestones.ts) — Milestone API routes
- [packages/sdk/src/services/issue.ts](../../../packages/sdk/src/services/issue.ts) — Issue service
- [packages/sdk/src/services/label.ts](../../../packages/sdk/src/services/label.ts) — Label service
- [packages/sdk/src/services/milestone.ts](../../../packages/sdk/src/services/milestone.ts) — Milestone service