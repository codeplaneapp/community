# Engineering Specification: `tui-issues-data-hooks`

## Title
Implement issue data hooks: useIssues, useIssue, mutations, comments, events, labels, milestones, collaborators

## Status
`Implemented` — All twelve hooks are implemented in `specs/tui/packages/ui-core/src/hooks/issues/`. Types, barrel exports, and stub unit tests exist. The `usePaginatedQuery` query-param patch is applied. Two known backend gaps remain: (1) the issue events HTTP route does not exist — `useIssueEvents` returns 404, (2) no collaborators endpoint — `useRepoCollaborators` uses user search as a workaround. Test coverage is **partial** — only 15 test cases across 12 test files; ~164 additional test cases specified but not yet written. E2E test file `specs/tui/e2e/tui/issues.test.ts` does not yet exist.

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

The following facts were validated against the actual repository on 2026-03-24 and drive every decision in this spec:

| Fact | Location | Impact |
|------|----------|--------|
| `packages/ui-core/` exists with agent, issue, and workspace hooks | `specs/tui/packages/ui-core/src/` | Issue hooks are additions to an established package |
| `IssueService` is registered in `Services` interface | `apps/server/src/services.ts` line 90 | Service layer is live, not stubbed |
| `LabelService` is registered in `Services` interface | `apps/server/src/services.ts` line 91 | Label routes use real service |
| `MilestoneService` is registered in `Services` interface | `apps/server/src/services.ts` line 92 | Milestone routes use real service |
| Issue list sets `X-Total-Count` header via `setPaginationHeaders` | `apps/server/src/routes/issues.ts` | `useIssues` reads this header for totalCount |
| Comment list sets `X-Total-Count` header | `apps/server/src/routes/issues.ts` | `useIssueComments` reads this header |
| Label list sets `X-Total-Count` header | `apps/server/src/routes/labels.ts` | `useRepoLabels` reads this header |
| Milestone list sets `X-Total-Count` header | `apps/server/src/routes/milestones.ts` | `useRepoMilestones` reads this header |
| Issue label list sets `X-Total-Count` header | `apps/server/src/routes/issues.ts` | Label listing on issues is paginated |
| Pagination uses `parsePagination()` → `cursorToPage()` | `packages/sdk/src/lib/pagination.ts` | Server interprets `page` + `per_page` |
| `parsePagination()` defaults to limit=30, max=100 | `packages/sdk/src/lib/pagination.ts` | Matches hook defaults |
| Issue create returns 201 | `apps/server/src/routes/issues.ts` | |
| Issue update returns 200 | `apps/server/src/routes/issues.ts` | |
| Comment create returns 201 | `apps/server/src/routes/issues.ts` | |
| Comment delete returns 204 | `apps/server/src/routes/issues.ts` | |
| Label add to issue returns 200 (array) | `apps/server/src/routes/issues.ts` | Not 201 — returns full label set |
| Label remove from issue returns 204 | `apps/server/src/routes/issues.ts` | |
| Issue events HTTP route does **NOT** exist | `apps/server/src/routes/issues.ts` | `useIssueEvents` will 404 until route added |
| `listIssueEvents` service method exists in SDK | `packages/sdk/src/services/issue.ts` lines 506-536 | Service ready, no HTTP handler |
| Events total count returns `items.length` (no COUNT query) | `packages/sdk/src/services/issue.ts` line 533-535 | |
| No collaborators list endpoint exists | No route anywhere | `useRepoCollaborators` uses `/api/search/users` |
| User search endpoint exists (no auth required) | `apps/server/src/routes/search.ts` lines 119-140 | `GET /api/search/users?q=...` with total_count |
| Auth header format is `Authorization: token {token}` | Server auth middleware | Not `Bearer` |
| Error response shape: `{ message, errors? }` | `specs/tui/packages/ui-core/src/types/errors.ts` | `parseResponseError()` handles this |
| `ApiError`, `NetworkError`, `parseResponseError` exist | `specs/tui/packages/ui-core/src/types/errors.ts` (82 lines) | Reused from agent hooks |
| `usePaginatedQuery` has query-param separator fix | `usePaginatedQuery.ts` line 79 | `path.includes('?') ? '&' : '?'` |
| `useMutation` stores raw caught error as-is in `setError(err)` | `useMutation.ts` line 82 | Does NOT auto-parse Response objects |
| `mockAPIClient` uses queue-based response system | `test-utils/mockAPIClient.ts` (72 lines) | `respondWithJSON`, `respondWithError`, `callsTo` |
| `renderHook` uses minimal React mock | `test-utils/renderHook.ts` (95 lines) | Executes hooks with `waitForNextUpdate` |
| `useRepoCollaborators` reads `data.items` from response (nested) | `useRepoCollaborators.ts` line 75 | Not a top-level array |
| `useRepoCollaborators` initial isLoading depends on `enabled && query !== ""` | `useRepoCollaborators.ts` line 18 | |
| Existing tests cover only 15 test cases total | 12 test files × 1-2 tests each | |
| `usePaginatedQuery` page=1 fetch replaces all items (not appends) | `usePaginatedQuery.ts` line 102-103 | |
| `usePaginatedQuery` hard reset on cacheKey change clears everything | `usePaginatedQuery.ts` lines 147-164 | |
| No E2E TUI issues test file exists | `specs/tui/e2e/tui/` confirmed via glob | Must be created |
| `launchTUI` helper exists in `specs/tui/e2e/tui/helpers.ts` (353 lines) | E2E helper module | |

---

## 2. API Contract Reference

All issue endpoints are repository-scoped under `/api/repos/:owner/:repo/`.

**Source of truth**: `apps/server/src/routes/issues.ts` (369 lines), `apps/server/src/routes/labels.ts` (184 lines), `apps/server/src/routes/milestones.ts` (187 lines)

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

| Endpoint | Method | Success | Request Body | Response Body |
|----------|--------|---------|-------------|---------------|
| `/issues/:number/labels` | `GET` | 200 | — | `LabelResponse[]` |
| `/issues/:number/labels` | `POST` | 200 | `{ labels: string[] }` | `LabelResponse[]` |
| `/issues/:number/labels/:name` | `DELETE` | 204 | — | (empty) |

### Repository Label & Milestone Endpoints

| Endpoint | Method | Success | Response Headers |
|----------|--------|---------|------------------|
| `/labels` | `GET` | 200 | `X-Total-Count: N` |
| `/milestones` | `GET` | 200 | `X-Total-Count: N` |

### Missing Endpoints

| Endpoint | Notes |
|----------|-------|
| `/issues/:number/events` | ⚠️ **NO ROUTE**. SDK service exists (`listIssueEvents`), no HTTP handler. Hook returns 404. |
| `/collaborators` | Does not exist. `useRepoCollaborators` uses `/api/search/users?q=...` workaround. |

**Pagination**: `page` (≥1, default 1), `per_page` (1–100, default 30). **State filter**: `state=open|closed|""`. **Auth**: `Authorization: token {token}`.

---

## 3. Type Definitions

**File**: `specs/tui/packages/ui-core/src/types/issues.ts` (137 lines) — ✅ Implemented

Core types: `IssueState`, `Issue`, `IssueComment`, `IssueEvent`, `Label`, `Milestone`, `UserSearchResult`. Request types: `CreateIssueRequest`, `UpdateIssueRequest`, `CreateIssueCommentRequest`. Options types: `IssuesOptions`, `IssueCommentsOptions`, `IssueEventsOptions`, `RepoLabelsOptions`, `RepoMilestonesOptions`, `RepoCollaboratorsOptions`.

All `id` fields are numbers (not strings). Issue `number` is distinct from `id` — URL paths use `number`. Dates are ISO-8601 strings.

### Type Details

```typescript
// Core domain types
export type IssueState = "open" | "closed";

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
  issueId: number;       // camelCase
  actorId: number;       // camelCase
  eventType: string;     // camelCase
  createdAt: string;     // camelCase
}

export interface Label {
  id: number;
  repository_id: number;
  name: string;
  color: string;
  description: string;
  created_at: string;
}

export interface Milestone {
  id: number;
  repository_id: number;
  title: string;
  description: string;
  state: string;
  due_date: string | null;
  created_at: string;
}

export interface UserSearchResult {
  id: number;
  login: string;
  avatar_url: string;
  full_name: string;
}

// Request types
export interface CreateIssueRequest {
  title: string;
  body?: string;
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
  milestone?: number | null;  // null clears milestone
}

export interface CreateIssueCommentRequest {
  body: string;
}

// Options types (all have page?, perPage?, enabled?)
export interface IssuesOptions {
  state?: IssueState | "";  // empty string = all states
  page?: number;
  perPage?: number;
  enabled?: boolean;
}

export interface RepoCollaboratorsOptions {
  query: string;     // required
  enabled?: boolean;
}
```

---

## 4. Hook Signatures and Behavior

### 4.1 `useIssues(owner, repo, options?)` — Paginated issue list

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useIssues.ts` (52 lines) — ✅

Delegates to `usePaginatedQuery<Issue>`. Path: `/api/repos/${owner}/${repo}/issues` with optional `?state=` filter. `maxItems=500`, `perPage` capped at 100. Returns `{ issues, totalCount, isLoading, error, hasMore, fetchMore, refetch }`.

**Key behavior:**
- `perPage` capped at 100 regardless of caller input
- State filter appended to URL only when non-empty: `?state=open` or `?state=closed`
- Cache key includes `owner`, `repo`, `perPage`, and `state` — changes to any trigger hard reset
- `parseResponse` extracts array from JSON body + `X-Total-Count` header
- Returns renamed property: `issues` (not `items`)

### 4.2 `useIssue(owner, repo, issueNumber)` — Single issue with 30s cache

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useIssue.ts` (116 lines) — ✅

Manual single-resource fetch. 30-second cache via `lastFetchTimestamp` ref. `refetch()` bypasses cache. `issueNumber <= 0` guard returns null without fetching. Uses `parseResponseError()` explicitly for structured errors.

**Key behavior:**
- Cache check: `refetchCounter === 0 && now - lastFetchTimestamp < 30_000 && issue exists`
- On param change (`owner`, `repo`, `issueNumber`): cache timestamp reset to 0, forces re-fetch
- On `refetch()`: increments `refetchCounter`, aborts in-flight request, starts new fetch
- Error handling: non-ok response → `parseResponseError()` → `ApiError`; network error → `NetworkError`
- AbortError silently swallowed (no state update)
- **Known bug (§11.9)**: Cache permanently disabled after first explicit refetch

### 4.3 `useCreateIssue(owner, repo)` — Issue creation

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useCreateIssue.ts` (50 lines) — ✅

Delegates to `useMutation`. Validates title (trim, non-empty). Optional fields included only when defined.

**Key behavior:**
- Client-side validation: `title.trim()` must be non-empty, throws `ApiError(400, "issue title is required")`
- Body construction: only includes `body`, `assignees`, `labels`, `milestone` when `!== undefined`
- Expects 201 response
- **Known issue (§11.7)**: Throws raw `Response` on HTTP error

### 4.4 `useUpdateIssue(owner, repo, callbacks?)` — Optimistic issue update

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useUpdateIssue.ts` (78 lines) — ✅

Optimistic pattern with callback interface:

```typescript
export interface UpdateIssueCallbacks {
  onOptimistic?: (issueNumber: number, update: UpdateIssueRequest) => void;
  onRevert?: (issueNumber: number) => void;
  onError?: (error: HookError, issueNumber: number) => void;
  onSettled?: (issueNumber: number) => void;
}
```

**Callback sequence:**
- Success: `onOptimistic → mutationFn → onSettled`
- Failure: `onOptimistic → mutationFn(error) → onRevert → onError → onSettled`

**Milestone handling:** `null` sends `{ milestone: null }` to clear; `undefined` omits key from body.

**Known issue (§11.7)**: Throws raw `Response` on HTTP error.

### 4.5 `useIssueComments(owner, repo, issueNumber, options?)` — Paginated comments

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useIssueComments.ts` (43 lines) — ✅

Delegates to `usePaginatedQuery<IssueComment>`. Disabled when `issueNumber <= 0`. Returns `{ comments, totalCount, isLoading, error, hasMore, fetchMore, refetch }`.

### 4.6 `useIssueEvents(owner, repo, issueNumber, options?)` — Paginated events

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useIssueEvents.ts` (43 lines) — ✅ (⚠️ endpoint returns 404)

Identical pattern to `useIssueComments`. Returns `{ events, totalCount, isLoading, error, hasMore, fetchMore, refetch }`. **Blocked**: endpoint does not exist in server routes.

### 4.7 `useCreateIssueComment(owner, repo, callbacks?)` — Optimistic comment creation

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useCreateIssueComment.ts` (91 lines) — ✅

**Two-layer architecture:**
1. Outer `useCallback` wrapper: trims body, validates non-empty, generates `tempId = -(Date.now())`
2. Inner `useMutation`: executes HTTP POST, manages optimistic lifecycle

**Callback interface:**
```typescript
export interface CreateIssueCommentCallbacks {
  onOptimistic?: (issueNumber: number, tempComment: IssueComment) => void;
  onSettled?: (issueNumber: number, tempId: number, serverComment: IssueComment | null) => void;
  onRevert?: (issueNumber: number, tempId: number) => void;
  onError?: (error: HookError, issueNumber: number, tempId: number) => void;
}
```

**Optimistic comment construction:**
- `id: tempId` (negative number)
- `issue_id: 0`, `user_id: 0`, `commenter: ""`
- `body: trimmedBody`
- `type: "comment"` (hardcoded)
- `created_at` / `updated_at`: current ISO timestamp

**Failure callback order:** `onRevert → onError → onSettled`

**Known issue (§11.7)**: Throws raw `Response` on HTTP error.

### 4.8 `useRepoLabels(owner, repo, options?)` — Paginated labels

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useRepoLabels.ts` (42 lines) — ✅

Delegates to `usePaginatedQuery<Label>`. Returns `{ labels, totalCount, isLoading, error, hasMore, fetchMore, refetch }`.

### 4.9 `useRepoMilestones(owner, repo, options?)` — Paginated milestones

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useRepoMilestones.ts` (48 lines) — ✅

Delegates to `usePaginatedQuery<Milestone>`. Supports optional `state` filter (same pattern as `useIssues`). Returns `{ milestones, totalCount, isLoading, error, hasMore, fetchMore, refetch }`.

### 4.10 `useRepoCollaborators(owner, repo, options)` — User search workaround

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useRepoCollaborators.ts` (109 lines) — ✅ (⚠️ workaround)

Manual fetch to `/api/search/users?q=...&limit=20`. `owner`/`repo` parameters are accepted but **unused** (not scoped to repo). Uses `parseResponseError()` explicitly for structured errors.

**Key behavior:**
- Reads `data.items` from response (nested structure, not top-level array)
- Initial `isLoading` depends on `enabled && query !== ""`
- Empty `query` string guard: clears users array, sets `isLoading: false`
- AbortController managed per-fetch for cancellation
- Returns `{ users, totalCount, isLoading, error, refetch }`

### 4.11 `useAddIssueLabels(owner, repo)` — Add labels mutation

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useAddIssueLabels.ts` (45 lines) — ✅

Validates non-empty `labelNames` array. Sends `POST /api/repos/{owner}/{repo}/issues/{issueNumber}/labels` with `{ labels: labelNames }`. Response is 200 (not 201) — returns full label set.

**Known issue (§11.7)**: Throws raw `Response` on HTTP error.

### 4.12 `useRemoveIssueLabel(owner, repo, callbacks?)` — Optimistic label removal

**File**: `specs/tui/packages/ui-core/src/hooks/issues/useRemoveIssueLabel.ts` (68 lines) — ✅

**Callback interface:**
```typescript
export interface RemoveIssueLabelCallbacks {
  onOptimistic?: (issueNumber: number, labelName: string) => void;
  onRevert?: (issueNumber: number, labelName: string) => void;
  onError?: (error: HookError, issueNumber: number, labelName: string) => void;
  onSettled?: (issueNumber: number) => void;
}
```

**Key behavior:**
- URL-encodes label name: `encodeURIComponent(trimmedName)`
- Expects 204 response
- Trimming happens inside `mutationFn`, so `onOptimistic` receives untrimmed name (§11.8)
- Failure callback order: `onRevert → onError → onSettled`

**Known issues:** §11.7 (raw Response error), §11.8 (untrimmed optimistic name).

---

## 5. Internal Utility Integration

### 5.1 `usePaginatedQuery` (218 lines)

Query param separator fix at line 79: `path.includes('?') ? '&' : '?'`. Hard reset on cacheKey change (lines 147-164). Page=1 replaces items (line 102-103). maxItems eviction keeps most recent (line 109). hasMore calls `parseResponse([], new Headers())` at render time (line 191). fetchMore guarded by `!hasMore || isLoading` (line 196).

**Config interface:**
```typescript
interface PaginatedQueryConfig<T> {
  path: string;
  perPage?: number;           // default 30, max 100
  maxItems?: number;          // default 500
  cacheKey: string;
  enabled?: boolean;          // default true
  autoPaginate?: boolean;     // default false
  parseResponse: (items: T[], headers: Headers) => {
    items: T[];
    totalCount: number | null;
  };
}
```

**Return type:**
```typescript
interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
}
```

### 5.2 `useMutation` (103 lines)

Double-submit guard (line 45-47). Config ref pattern prevents stale closures (lines 29-32). `setError(err)` stores raw error — does NOT call `parseResponseError` (line 82). Error rethrown after callbacks (line 93). AbortError rejected without state update (lines 77-79).

**Config interface:**
```typescript
interface MutationConfig<TInput, TResult> {
  mutationFn: (input: TInput, signal: AbortSignal) => Promise<TResult>;
  onOptimistic?: (input: TInput) => void;
  onSuccess?: (data: TResult, input: TInput) => void;
  onError?: (error: unknown, input: TInput) => void;
}
```

---

## 6. Error Handling Contract

| HTTP Status | Error Type | `error.code` |
|-------------|-----------|-------------|
| 400 | `ApiError` | `BAD_REQUEST` |
| 401 | `ApiError` | `UNAUTHORIZED` |
| 403 | `ApiError` | `FORBIDDEN` |
| 404 | `ApiError` | `NOT_FOUND` |
| 422 | `ApiError` | `UNPROCESSABLE` |
| 429 | `ApiError` | `RATE_LIMITED` |
| 500+ | `ApiError` | `SERVER_ERROR` |
| Network | `NetworkError` | `NETWORK_ERROR` |
| Abort | (not set) | — |

**⚠️ Critical inconsistency**: Query hooks (`useIssue`, `useRepoCollaborators`) use `parseResponseError()` → structured `ApiError`. Mutation hooks (`useCreateIssue`, `useUpdateIssue`, `useCreateIssueComment`, `useAddIssueLabels`, `useRemoveIssueLabel`) use `throw response` → raw `Response` stored in `mutation.error`. Fix in Phase C.1.

---

## 7. File Inventory

### Implementation Files (18 files)

| File | Lines | Status |
|------|-------|--------|
| `specs/tui/packages/ui-core/src/types/issues.ts` | 137 | ✅ |
| `specs/tui/packages/ui-core/src/hooks/issues/index.ts` | 16 | ✅ |
| `specs/tui/packages/ui-core/src/hooks/issues/useIssues.ts` | 52 | ✅ |
| `specs/tui/packages/ui-core/src/hooks/issues/useIssue.ts` | 116 | ✅ |
| `specs/tui/packages/ui-core/src/hooks/issues/useCreateIssue.ts` | 50 | ✅ |
| `specs/tui/packages/ui-core/src/hooks/issues/useUpdateIssue.ts` | 78 | ✅ |
| `specs/tui/packages/ui-core/src/hooks/issues/useIssueComments.ts` | 43 | ✅ |
| `specs/tui/packages/ui-core/src/hooks/issues/useIssueEvents.ts` | 43 | ✅ (⚠️ 404) |
| `specs/tui/packages/ui-core/src/hooks/issues/useCreateIssueComment.ts` | 91 | ✅ |
| `specs/tui/packages/ui-core/src/hooks/issues/useRepoLabels.ts` | 42 | ✅ |
| `specs/tui/packages/ui-core/src/hooks/issues/useRepoMilestones.ts` | 48 | ✅ |
| `specs/tui/packages/ui-core/src/hooks/issues/useRepoCollaborators.ts` | 109 | ✅ (⚠️ workaround) |
| `specs/tui/packages/ui-core/src/hooks/issues/useAddIssueLabels.ts` | 45 | ✅ |
| `specs/tui/packages/ui-core/src/hooks/issues/useRemoveIssueLabel.ts` | 68 | ✅ |
| `specs/tui/packages/ui-core/src/hooks/internal/usePaginatedQuery.ts` | 218 | ✅ |
| `specs/tui/packages/ui-core/src/hooks/internal/useMutation.ts` | 103 | ✅ |
| `specs/tui/packages/ui-core/src/index.ts` | 97 | ✅ |
| `specs/tui/packages/ui-core/src/types/index.ts` | — | ✅ |

### Test Files (12 unit + 0 E2E = 15 tests written / 179 specified)

| File | Written | Specified |
|------|---------|----------|
| `__tests__/useIssues.test.ts` | 2 | 35 |
| `__tests__/useIssue.test.ts` | 2 | 24 |
| `__tests__/useCreateIssue.test.ts` | 1 | 13 |
| `__tests__/useUpdateIssue.test.ts` | 1 | 16 |
| `__tests__/useIssueComments.test.ts` | 1 | 10 |
| `__tests__/useIssueEvents.test.ts` | 2 | 10 |
| `__tests__/useCreateIssueComment.test.ts` | 1 | 15 |
| `__tests__/useRepoLabels.test.ts` | 1 | 8 |
| `__tests__/useRepoMilestones.test.ts` | 1 | 8 |
| `__tests__/useRepoCollaborators.test.ts` | 1 | 12 |
| `__tests__/useAddIssueLabels.test.ts` | 1 | 6 |
| `__tests__/useRemoveIssueLabel.test.ts` | 1 | 11 |
| `e2e/tui/issues.test.ts` | 0 | 11 |

---

## 8. Implementation Plan

Hook implementation files are complete. Remaining work is three phases.

### Phase A: Hook Unit Test Hardening

#### Step A.1 — Baseline validation
Run `bun test specs/tui/packages/ui-core/src/hooks/issues/` to confirm existing 15 tests pass (except `useIssueEvents` integration test which is expected to fail with 404).

#### Step A.2 — Harden `useIssues` tests (35 total)
**File**: `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useIssues.test.ts`

**Initial state (4 tests):**
- returns empty `issues` array before fetch completes
- `isLoading` starts as `true`
- `error` starts as `null`
- `totalCount` starts as `0`

**Fetch lifecycle (6 tests):**
- constructs correct path `/api/repos/owner/repo/issues`
- sends request via `client.request()`
- parses JSON response into `issues` array
- reads `X-Total-Count` header into `totalCount`
- sets `isLoading: false` after successful fetch
- sets `error: null` on success

**State filter (6 tests):**
- no `?state=` param when state is `""`
- appends `?state=open` when state is `"open"`
- appends `?state=closed` when state is `"closed"`
- cache key changes when state changes (hard reset)
- refetches with new state after filter change
- empty result after state change clears previous items

**hasMore (2 tests):**
- `hasMore: true` when `items.length < totalCount`
- `hasMore: false` when `items.length >= totalCount`

**fetchMore (3 tests):**
- increments page number on `fetchMore()` call
- appends new items to existing list
- does not call fetchMore when `hasMore: false`

**refetch (3 tests):**
- re-fetches page=1 on `refetch()` call
- replaces all items with fresh data (page=1 replace behavior)
- clears error on successful refetch

**Param changes (3 tests):**
- hard reset when `owner` changes
- hard reset when `repo` changes
- hard reset when `perPage` changes

**Enabled option (2 tests):**
- does not fetch when `enabled: false`
- fetches immediately when `enabled` transitions to `true`

**Abort/cleanup (2 tests):**
- aborts in-flight request on unmount
- does not update state after unmount

**Error handling (5 tests):**
- 401 → `ApiError` with code `UNAUTHORIZED`
- 404 → `ApiError` with code `NOT_FOUND`
- 500 → `ApiError` with code `SERVER_ERROR`
- network failure → `NetworkError`
- sets `isLoading: false` on error

#### Step A.3 — Harden `useIssue` tests (24 total)
**File**: `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useIssue.test.ts`

**Initial state (3 tests):**
- `issue` starts as `null`
- `isLoading` starts as `true`
- `error` starts as `null`

**Fetch lifecycle (3 tests):**
- constructs correct path `/api/repos/owner/repo/issues/42`
- parses response JSON as `Issue`
- sets `isLoading: false` after success

**30s cache (3 tests):**
- returns cached issue within 30 seconds (no HTTP request)
- re-fetches after 30 seconds elapsed (mock `Date.now()`)
- cache timestamp resets on param change

**Refetch (2 tests):**
- bypasses cache on explicit `refetch()` call
- aborts previous in-flight request before re-fetching

**Param changes (4 tests):**
- re-fetches when `owner` changes
- re-fetches when `repo` changes
- re-fetches when `issueNumber` changes
- clears cache timestamp on any param change

**Invalid guard (4 tests):**
- returns `null` issue for `issueNumber = 0`
- returns `null` issue for `issueNumber = -1`
- `isLoading: false` for invalid issue number
- no HTTP request made for invalid issue number

**Abort/cleanup (2 tests):**
- aborts on unmount
- no state update after unmount

**Error handling (4 tests):**
- 401 → `ApiError(UNAUTHORIZED)`
- 404 → `ApiError(NOT_FOUND)`
- network error → `NetworkError`
- clears error on successful re-fetch

#### Step A.4 — Harden `useCreateIssue` tests (13 total)
**File**: `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useCreateIssue.test.ts`

**Validation (3 tests):**
- throws `ApiError(400)` for empty title
- throws `ApiError(400)` for whitespace-only title
- trims title before sending (" My Title " → "My Title")

**Mutation lifecycle (6 tests):**
- sends POST to correct path
- sends correct JSON body with required fields
- includes optional fields only when defined
- excludes `undefined` optional fields from body
- returns created `Issue` on 201
- sets `isLoading` during mutation

**Double-submit (1 test):**
- rejects second mutation while first is in progress

**Error handling (3 tests):**
- stores error on non-201 response
- resets error on next successful mutation
- `isLoading: false` after error

#### Step A.5 — Harden `useUpdateIssue` tests (16 total)
**File**: `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useUpdateIssue.test.ts`

**Mutation lifecycle (4 tests):**
- sends PATCH to correct path with issue number
- sends JSON body with update fields
- returns updated `Issue` on 200
- sets `isLoading` during mutation

**Optimistic callbacks (4 tests):**
- calls `onOptimistic` before HTTP request
- calls `onSettled` after success
- calls `onRevert → onError → onSettled` in order on failure (verify with `callOrder[]` array)
- does not call `onRevert` on success

**Milestone handling (3 tests):**
- includes `milestone: null` in body to clear milestone
- omits `milestone` key when value is `undefined`
- includes `milestone: 5` when setting milestone

**Body construction (3 tests):**
- includes only defined fields
- sends partial update (e.g., only `state: "closed"`)
- sends multiple fields simultaneously

**Error handling (2 tests):**
- stores error and calls `onError` callback
- resets error on next successful mutation

#### Step A.6 — Harden `useIssueComments` tests (10 total)
**File**: `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useIssueComments.test.ts`

**Initial state (2):** empty comments, loading true.
**Fetch lifecycle (3):** correct path, parses comments, reads X-Total-Count.
**Pagination (2):** fetchMore appends, hasMore false at end.
**Disabled guard (2):** no fetch for issueNumber=0, no fetch for issueNumber=-1.
**Abort (1):** aborts on unmount.

#### Step A.7 — Harden `useCreateIssueComment` tests (15 total)
**File**: `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useCreateIssueComment.test.ts`

**Validation (3 tests):**
- throws `ApiError(400)` for empty body
- throws `ApiError(400)` for whitespace-only body
- trims body before sending

**Mutation lifecycle (3 tests):**
- sends POST to correct path with issue number
- sends `{ body: trimmedBody }` as JSON
- returns `IssueComment` on 201

**Optimistic append (7 tests):**
- `tempId` is negative (< 0)
- `tempId` is `-(Date.now())` approximately
- optimistic comment has `type: "comment"`
- optimistic comment has `body: trimmedBody`
- optimistic comment has `issue_id: 0`, `user_id: 0`, `commenter: ""`
- failure calls `onRevert → onError → onSettled` (callback order verified)
- success calls `onSettled` with server comment (not temp)

**Double-submit (1 test):**
- rejects second mutation while first is in progress

#### Step A.8 — Harden `useIssueEvents` tests (10 total)
**File**: `specs/tui/packages/ui-core/src/hooks/issues/__tests__/useIssueEvents.test.ts`

**Initial state (2):** empty events, loading true.
**Fetch lifecycle with mock (3):** correct path, parses events, reads X-Total-Count.
**Pagination (2):** fetchMore, hasMore.
**Disabled guard (1):** no fetch for issueNumber=0.
**Integration tests (2):** Both expected to **FAIL** with 404 (no route exists). **Never skip or comment out.**

#### Step A.9 — Harden label/milestone/collaborator/label-mutation tests (45 total across 5 files)

**`useRepoLabels.test.ts` (8 tests):** fetch lifecycle (3), pagination (2), param changes (1), errors (2).

**`useRepoMilestones.test.ts` (8 tests):** fetch lifecycle (3), state filter (2), pagination (1), errors (2).

**`useRepoCollaborators.test.ts` (12 tests):**
- initial state (2): not loading when query empty, loading when query non-empty
- fetch lifecycle (3): correct URL, reads `data.items`, reads totalCount
- empty query guard (2): clears users, sets isLoading false
- query changes (2): re-fetches with new query, aborts previous
- abort (1): aborts on unmount
- errors (2): 401 → ApiError, network → NetworkError

**`useAddIssueLabels.test.ts` (6 tests):**
- validation (2): throws for empty array, accepts non-empty
- mutation (2): correct path, sends `{ labels: [...] }`
- 200 response (1): returns label array (not 201)
- errors (1): stores error on failure

**`useRemoveIssueLabel.test.ts` (11 tests):**
- validation (2): throws for empty string, throws for whitespace-only
- trim (1): trims label name before URL construction
- URL-encode (1): encodes special characters in label name
- 204 response (1): treats 204 as success
- optimistic callbacks (4): onOptimistic before request, onRevert+onError+onSettled on failure, onSettled on success
- error rethrow (2): error is rethrown after callbacks, stores in mutation.error

#### Step A.10 — Final verification
Run `bun run check` and `bun test`. Expected: 166 pass + 2 intentionally fail (useIssueEvents integration) = 168 total unit tests.

### Phase B: E2E Test Scaffolding

#### Step B.1 — Create `specs/tui/e2e/tui/issues.test.ts`

11 E2E tests using `@microsoft/tui-test`:

```typescript
import { test, expect, describe } from "bun:test";
import { launchTUI, navigateToIssues, waitForIssueListReady, navigateToIssueDetail } from "./helpers";

describe("TUI_ISSUES", () => {
  test("issue list renders with items", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToIssues(terminal);
    await waitForIssueListReady(terminal);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("issue list shows loading state", async () => {
    const terminal = await launchTUI();
    await terminal.sendKeys("g", "i");
    // Loading should appear before data arrives
    expect(terminal.snapshot()).toMatch(/Loading/);
    await terminal.terminate();
  });

  test("issue list shows empty state when no issues", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await navigateToIssues(terminal);
    await waitForIssueListReady(terminal);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("j/k navigates issue list", async () => {
    const terminal = await launchTUI();
    await navigateToIssues(terminal);
    await waitForIssueListReady(terminal);
    await terminal.sendKeys("j");
    // Second item should have reverse video
    const line = terminal.getLine(4);
    expect(line).toMatch(/\x1b\[7m/);
    await terminal.sendKeys("k");
    await terminal.terminate();
  });

  test("Enter on issue navigates to detail view", async () => {
    const terminal = await launchTUI();
    await navigateToIssues(terminal);
    await waitForIssueListReady(terminal);
    await terminal.sendKeys("Enter");
    const header = terminal.getLine(0);
    expect(header).toMatch(/Issues.*›.*#\d+/);
    await terminal.terminate();
  });

  test("q returns from detail to list", async () => {
    const terminal = await launchTUI();
    await navigateToIssueDetail(terminal);
    await terminal.sendKeys("q");
    await terminal.waitForText("Issues");
    expect(terminal.getLine(0)).not.toMatch(/#\d+/);
    await terminal.terminate();
  });

  test("issue detail shows comments section", async () => {
    const terminal = await launchTUI();
    await navigateToIssueDetail(terminal);
    await terminal.waitForText("Comments");
    await terminal.terminate();
  });

  test("issue detail shows labels section", async () => {
    const terminal = await launchTUI();
    await navigateToIssueDetail(terminal);
    await terminal.waitForText(/Labels|label/);
    await terminal.terminate();
  });

  test("issue list renders at minimum size (80x24)", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    await navigateToIssues(terminal);
    await waitForIssueListReady(terminal);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("issue list renders at large size (200x60)", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    await navigateToIssues(terminal);
    await waitForIssueListReady(terminal);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("401 error shows session expired message", async () => {
    const terminal = await launchTUI({ env: { CODEPLANE_TOKEN: "expired-token" } });
    await terminal.waitForText(/session expired|re-authenticate/i);
    await terminal.terminate();
  });
});
```

All 11 tests expected to **fail** until `tui-issues-screen` ticket ships. Never skipped.

#### Step B.2 — Add helpers to `specs/tui/e2e/tui/helpers.ts`

Append the following helper functions:

```typescript
export async function navigateToIssues(terminal: TUITestInstance) {
  await terminal.sendKeys("g", "i");
  await terminal.waitForText("Issues");
}

export async function waitForIssueListReady(terminal: TUITestInstance) {
  await terminal.waitForNoText("Loading");
}

export async function navigateToIssueDetail(terminal: TUITestInstance) {
  await navigateToIssues(terminal);
  await waitForIssueListReady(terminal);
  await terminal.sendKeys("Enter");
  await terminal.waitForText(/#\d+/);
}
```

### Phase C: Productionization Fixes

#### Step C.1 — Fix mutation error type inconsistency

**5 files**: Replace `throw response` with `throw await parseResponseError(response)` in:
- `useCreateIssue.ts` line 36
- `useUpdateIssue.ts` line 48
- `useCreateIssueComment.ts` line 43
- `useAddIssueLabels.ts` line 32
- `useRemoveIssueLabel.ts` line 39

Add `import { parseResponseError } from "../../types/errors.js"` to each file.

**Before:**
```typescript
if (response.status !== 201) {
  throw response;
}
```

**After:**
```typescript
if (response.status !== 201) {
  throw await parseResponseError(response);
}
```

This ensures `mutation.error` is always `ApiError | NetworkError`, never raw `Response`. Callers can safely `instanceof ApiError` check.

#### Step C.2 — Fix `useRemoveIssueLabel` untrimmed name in optimistic callback

**File**: `useRemoveIssueLabel.ts` lines 55-60.

**Before:**
```typescript
const mutate = useCallback(
  async (issueNumber: number, labelName: string) => {
    return mutation.mutate({ issueNumber, labelName });
  },
  [mutation.mutate]
);
```

**After:**
```typescript
const mutate = useCallback(
  async (issueNumber: number, labelName: string) => {
    const trimmedName = labelName.trim();
    if (trimmedName === "") {
      throw new ApiError(400, "label name is required");
    }
    return mutation.mutate({ issueNumber, labelName: trimmedName });
  },
  [mutation.mutate]
);
```

This ensures `onOptimistic` receives the trimmed name and removes the redundant trim inside `mutationFn`.

#### Step C.3 — Fix `useIssue` cache bypass after first refetch

**File**: `useIssue.ts` lines 39-47.

**Before:**
```typescript
const [refetchCounter, setRefetchCounter] = useState(0);
// ...
if (refetchCounter === 0 && now - lastFetchTimestamp.current < 30_000 && issue) {
```

**After:**
```typescript
const [refetchCounter, setRefetchCounter] = useState(0);
const lastProcessedRefetch = useRef(0);
// ...
if (refetchCounter <= lastProcessedRefetch.current && now - lastFetchTimestamp.current < 30_000 && issue) {
  setIsLoading(false);
  return;
}
lastProcessedRefetch.current = refetchCounter;
```

This allows the cache to work normally after a refetch completes. Only new `refetch()` calls (counter > last processed) bypass the cache.

---

## 9. Unit & Integration Tests

### Framework

**Hook unit tests**: `bun:test` + `renderHook` + `createMockAPIClient` in `specs/tui/packages/ui-core/`.

**E2E tests**: `@microsoft/tui-test` in `specs/tui/e2e/tui/`.

### Test Pattern

```typescript
import { expect, test, describe, beforeEach } from "bun:test";
import { renderHook } from "../../../test-utils/renderHook.js";
import { createMockAPIClient } from "../../../test-utils/mockAPIClient.js";

describe("useHookName", () => {
  let mockClient: ReturnType<typeof createMockAPIClient>;
  beforeEach(() => { mockClient = createMockAPIClient(); });

  test("behavior description", async () => {
    mockClient.respondWithJSON(200, [...], { "X-Total-Count": "1" });
    const { result, waitForNextUpdate, unmount } = renderHook(
      () => useHookName("owner", "repo"),
      { apiClient: mockClient }
    );
    while (result.current.isLoading) await waitForNextUpdate();
    expect(result.current.items).toHaveLength(1);
    unmount();
  });
});
```

### Test Utilities

**`createMockAPIClient()` (72 lines):**
- `respondWithJSON(status, body, headers?)` — queue JSON response
- `respondWithError(error)` — queue error to throw
- `callsTo(pathPattern)` — filter call log by path
- `reset()` — clear queue and call log
- Queue-based: FIFO, returns 500 if queue empty

**`renderHook(hookFn, options)` (95 lines):**
- Minimal React mock (no DOM, no react-dom)
- `result.current` — current hook return value
- `waitForNextUpdate()` — resolves after next state change
- `unmount()` — runs cleanup effects
- Limitation: single context value, no useReducer, no Suspense

### 9.1 `useIssues.test.ts` — 35 tests

initial state (4), fetch lifecycle (6), state filter (6), hasMore (2), fetchMore (3), refetch (3), param changes (3), enabled (2), abort (2), errors (5). All pass.

### 9.2 `useIssue.test.ts` — 24 tests

initial state (3), fetch (3), 30s cache (3), refetch (2), params (4), invalid guard (4), abort (2), errors (4). All pass.

### 9.3 `useCreateIssue.test.ts` — 13 tests

validation (3), mutation (6), double-submit (1), errors (3). All pass.

### 9.4 `useUpdateIssue.test.ts` — 16 tests

mutation (4), optimistic (4), milestone (3), body (3), errors (2). All pass.

### 9.5 `useIssueComments.test.ts` — 10 tests

initial (2), fetch (3), pagination (2), disabled (2), abort (1). All pass.

### 9.6 `useIssueEvents.test.ts` — 10 tests

initial (2), fetch mock (3), pagination mock (2), disabled (1). 8 pass. **2 integration tests intentionally fail** (404 — no route).

### 9.7 `useCreateIssueComment.test.ts` — 15 tests

validation (3), mutation (3), optimistic (7), double-submit (1). Verify tempId < 0, trimmed body, type='comment', callback order.

### 9.8 `useRepoLabels.test.ts` — 8 tests

fetch lifecycle (3), pagination (2), param changes (1), errors (2). All pass.

### 9.9 `useRepoMilestones.test.ts` — 8 tests

fetch lifecycle (3), state filter (2), pagination (1), errors (2). All pass.

### 9.10 `useRepoCollaborators.test.ts` — 12 tests

initial state (2), fetch (3), empty query guard (2), query changes (2), abort (1), errors (2). All pass.

### 9.11 `useAddIssueLabels.test.ts` — 6 tests

validation (2), mutation (2), 200 response (1), errors (1). All pass.

### 9.12 `useRemoveIssueLabel.test.ts` — 11 tests

validation (2), trim (1), URL-encode (1), 204 (1), optimistic callbacks (4), error rethrow (2). All pass.

### 9.13 E2E Tests — 11 tests

Issue list renders (1), loading state (1), empty state (1), j/k navigation (1), Enter detail (1), q back (1), comments section (1), labels section (1), 80×24 snapshot (1), 200×60 snapshot (1), 401 auth error (1). **All 11 expected to fail** until `tui-issues-screen` ships.

### Test Count Summary

| Category | Cases | Pass | Fail |
|----------|-------|------|------|
| Hook unit tests | 168 | 166 | 2 |
| E2E tests | 11 | 0 | 11 |
| **Total** | **179** | **166** | **13** |

---

## 10. Downstream Consumer Integration Guide

### Import Pattern
```typescript
import { useIssues, useRepoLabels, type Issue } from "@codeplane/ui-core";
```

### Repo Context
Obtain `owner`/`repo` from `NavigationProvider.repoContext`.

### Pagination
Pass `fetchMore`/`hasMore`/`isLoading` to `ScrollableList.onFetchMore`.

```typescript
// In IssueListScreen:
const { owner, repo } = useNavigation().repoContext!;
const { issues, isLoading, hasMore, fetchMore } = useIssues(owner, repo, { state: "open" });

return (
  <ScrollableList
    items={issues}
    renderItem={(issue, focused) => <IssueRow issue={issue} focused={focused} />}
    onSelect={(issue) => navigation.push("IssueDetail", { number: String(issue.number) })}
    onFetchMore={fetchMore}
    hasMore={hasMore}
    isLoading={isLoading}
    keyExtractor={(issue) => String(issue.id)}
  />
);
```

### Optimistic Updates
Use `useUpdateIssue` callbacks for close/reopen:

```typescript
const { mutate: updateIssue } = useUpdateIssue(owner, repo, {
  onOptimistic: (number, update) => {
    // Immediately update UI state
  },
  onRevert: (number) => {
    // Revert UI state
  },
  onSettled: (number) => {
    issues.refetch(); // Refresh list
  },
});

// Close issue:
await updateIssue(42, { state: "closed" });
```

Use `useCreateIssueComment` callbacks for comment append:

```typescript
const { mutate: createComment } = useCreateIssueComment(owner, repo, {
  onOptimistic: (number, tempComment) => {
    // Append tempComment to local list
  },
  onRevert: (number, tempId) => {
    // Remove tempComment from local list
  },
  onSettled: (number, tempId, serverComment) => {
    if (serverComment) {
      // Replace temp with server comment
    }
    comments.refetch();
  },
});
```

### Cache Invalidation
Manual — call `refetch()` on list hooks after successful mutations. No automatic cross-hook invalidation.

### Error Display
```typescript
const { error } = useIssues(owner, repo);
if (error) {
  if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
    return <text>Session expired. Run `codeplane auth login` to re-authenticate.</text>;
  }
  return <text color="error">{error.message} — Press R to retry</text>;
}
```

---

## 11. Productionization Notes

### 11.1 Test Gaps
15 tests written of 179 specified. Key untested areas: state filters, fetchMore pagination, 30s cache, optimistic callback ordering, milestone null/undefined, error type narrowing, URL encoding, body trimming.

### 11.2 `useRepoCollaborators` Workaround
Uses `/api/search/users` instead of non-existent collaborators endpoint. `owner`/`repo` parameters accepted but unused — search is global, not repo-scoped. Update when real endpoint ships.

### 11.3 `useIssueEvents` Blocked
Hook implemented, endpoint missing. Add route to `apps/server/src/routes/issues.ts` using existing `IssueService.listIssueEvents()`. Note: `total` is `items.length`, not a real count — hasMore will use length heuristic.

### 11.4 `usePaginatedQuery` Query Param Evolution
Consider `queryParams: Record<string, string>` config option to replace fragile path-baked params and eliminate the `?` vs `&` separator detection.

### 11.5 No Cross-Hook Cache Invalidation
Screen layer responsible for manual `refetch()` calls. Consider adding event-based invalidation in future.

### 11.6 Rate Limiting
Hooks surface `RATE_LIMITED` error code but don't auto-retry. Future: read `Retry-After` header, implement backoff.

### 11.7 Mutation Error Type Inconsistency (Critical)
5 mutation hooks throw raw `Response`. `useMutation` stores as-is in `error`. Callers cannot `instanceof ApiError` check. Fix: Phase C.1.

### 11.8 `useRemoveIssueLabel` Untrimmed Optimistic Name
Outer wrapper passes untrimmed name to `mutation.mutate()`. The trim happens inside `mutationFn`, so `onOptimistic` callback receives the untrimmed name. Fix: Phase C.2.

### 11.9 `useIssue` Cache Permanently Disabled After Refetch
`refetchCounter` only increments, never resets. Cache check `refetchCounter === 0` is always false after first `refetch()` call. All subsequent effect runs bypass cache and re-fetch. Fix: Phase C.3.

### 11.10 `hasMore` Render-Time Side Effect
`parseResponse([], new Headers())` called every render in `usePaginatedQuery` to determine if totalCount-based or length-based hasMore. Consider `hasTotalCount` boolean flag computed once.

### 11.11 Test Utility Limitations
Mock React implementation does not support `useReducer`, Suspense boundaries, or multiple simultaneous context values. Single `currentContextValue` limits tests to one provider at a time.

### 11.12 Stale-While-Revalidate Window
Items only preserved during loading window. Page=1 replaces all items on success (usePaginatedQuery line 102-103). `isRefetch` param accepted by internal API but unused — no stale-while-revalidate behavior.

---

## 12. Barrel Export Verification

### Issue hooks barrel (`specs/tui/packages/ui-core/src/hooks/issues/index.ts`):

Exports all 12 hooks by name plus 3 callback types (`UpdateIssueCallbacks`, `CreateIssueCommentCallbacks`, `RemoveIssueLabelCallbacks`).

### Public barrel (`specs/tui/packages/ui-core/src/index.ts`):

Re-exports all issue hooks, callback types, and domain types. Verified: `import { useIssues, useIssue, useCreateIssue, useUpdateIssue, useIssueComments, useIssueEvents, useCreateIssueComment, useRepoLabels, useRepoMilestones, useRepoCollaborators, useAddIssueLabels, useRemoveIssueLabel, ApiError, NetworkError, type Issue, type IssueComment, type Label, type Milestone } from "@codeplane/ui-core"` resolves all 12 hooks and all types.

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