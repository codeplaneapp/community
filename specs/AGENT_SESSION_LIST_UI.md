# AGENT_SESSION_LIST_UI

Specification for AGENT_SESSION_LIST_UI.

## High-Level User POV

When working on a repository in Codeplane, users frequently start agent sessions — automated AI-assisted conversations that help them triage issues, write code, review changes, or explore the codebase. Over time, a repository accumulates many such sessions, and users need a clear, organized way to see what agent work has been done, what is still running, and what completed or failed.

The Agent Session List gives users a browsable, filterable, paginated view of every agent session associated with a repository. From any Codeplane surface — the web application, the CLI, the TUI, or the desktop app — a user can pull up the list of agent sessions and immediately see which sessions are active, which completed successfully, which failed, and which timed out. Each session in the list shows its title, its current status, how many messages have been exchanged, how long it ran (or has been running), and when it was created.

Users can filter the list by status to focus on just the active sessions, or just the failed ones that need attention. They can search by title to find a specific session. They can select a session to view its full conversation, replay a completed session to understand what the agent did, or delete sessions they no longer need. The list serves as the central hub for understanding and managing all agent activity in a repository — it answers the question "what have agents been doing in this repo?" at a glance.

For teams where multiple people (or multiple agents) are working on the same repository, the session list provides shared visibility into all agent activity, not just the current user's sessions. This transparency is essential for agent-augmented teams where automated and human work overlap.

## Acceptance Criteria

- **Sessions are scoped to a repository.** The list shows all agent sessions belonging to a specific repository, regardless of which user created them.
- **Authentication is required.** Unauthenticated users cannot view the agent session list. A `401 Unauthorized` response is returned for unauthenticated requests.
- **Pagination is supported.** The default page size is 30 sessions. The maximum page size is 50. Page and per-page parameters are accepted.
- **Total count is provided.** The response includes a total count of matching sessions (via `X-Total-Count` header in the API), enabling clients to show "Showing 1–30 of 142" or similar.
- **Sessions are ordered by creation time, newest first** (`created_at DESC`).
- **Each session in the list includes:** `id`, `title`, `status`, `messageCount`, `userId`, `workflowRunId` (if linked), `startedAt`, `finishedAt`, `createdAt`, `updatedAt`.
- **Status values are one of:** `active`, `completed`, `failed`, `timed_out`, `pending`.
- **Client-side filtering by status** is supported in the TUI and web UI. The API itself does not currently require server-side status filtering; filtering is performed client-side on the fetched page.
- **Client-side title search** is supported in the TUI and web UI. Users can type a search query to narrow the visible sessions by title substring match.
- **Empty states are handled gracefully.** When no sessions exist, a helpful empty state message is shown. When a filter or search produces no results, a distinct message indicates the filter/search has no matches rather than that no sessions exist at all.
- **Sessions can be deleted from the list view.** A delete action with confirmation is available. Only the session owner can delete their own sessions. Repository admins and owners can delete any session.
- **Navigation to session detail** is available from each row. Selecting a session navigates to the session view/replay screen.
- **Navigation to create a new session** is available from the list view.
- **Session title is not empty.** Titles must be at least 1 character after trimming. Maximum title length is 255 characters.
- **Page number must be ≥ 1.** A `page` value of 0 or negative is treated as page 1.
- **Per-page must be between 1 and 50.** Values above 50 are clamped to 50. Values below 1 are clamped to 1.
- **The list degrades gracefully if message counts are unavailable.** If the message count subquery fails or returns null, the count is displayed as 0.
- **Memory cap for client-side accumulation.** Clients that support "load more" pagination must cap accumulated sessions at 500 items in memory, evicting the oldest when the cap is exceeded.
- **The list is available on all primary client surfaces:** API, Web UI, CLI, TUI.
- **Session titles with special characters are rendered safely.** Unicode, emoji, and HTML entities must be displayed verbatim without XSS vulnerabilities or rendering corruption.
- **Duplicate session titles are allowed.** Multiple sessions may have the same title.
- **Empty title strings (after trimming) are rejected.** Whitespace-only titles are not valid.
- **Title strings longer than 255 characters are rejected** at creation time.
- **Repository isolation is enforced.** Sessions from repository A never appear in the list for repository B.

### Definition of Done

1. The API endpoint `GET /api/repos/:owner/:repo/agent/sessions` returns paginated session data with message counts and total count header.
2. The Web UI displays an agent session list page within the repository view at `/:owner/:repo/agents`, with status indicators, filtering, search, pagination, delete confirmation, and navigation to session detail and session creation.
3. The CLI `codeplane agent session list` command returns formatted session list output with pagination options.
4. The TUI `AgentSessionListScreen` renders sessions with status filtering, search, delete confirmation, responsive column layout, and keyboard navigation.
5. All acceptance criteria above are verified by passing integration and end-to-end tests.

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/agent/sessions`

**Authentication:** Required (session cookie or PAT)

**Query Parameters:**

| Parameter  | Type    | Default | Constraints       | Description                  |
|------------|---------|---------|-------------------|------------------------------|
| `page`     | integer | 1       | ≥ 1               | Page number (1-indexed)      |
| `per_page` | integer | 30      | 1–50, clamped     | Number of sessions per page  |

**Response:** `200 OK`

**Response Headers:**
- `X-Total-Count`: Total number of sessions for the repository (string-encoded integer)

**Response Body:** JSON array of session objects:

```json
[
  {
    "id": "01HXYZ...",
    "repositoryId": "42",
    "userId": "7",
    "workflowRunId": null,
    "title": "Fix the login redirect bug",
    "status": "completed",
    "startedAt": "2026-03-22T10:00:00Z",
    "finishedAt": "2026-03-22T10:05:32Z",
    "createdAt": "2026-03-22T09:59:58Z",
    "updatedAt": "2026-03-22T10:05:32Z",
    "messageCount": 14
  }
]
```

**Error Responses:**
- `401 Unauthorized` — Not authenticated
- `404 Not Found` — Repository does not exist or user does not have read access
- `500 Internal Server Error` — Database or service failure

### SDK Shape (ui-core)

The `useAgentSessions` hook is the shared data-fetching primitive consumed by both the Web UI and the TUI.

```typescript
function useAgentSessions(
  owner: string,
  repo: string,
  options?: {
    perPage?: number;    // default 30, max 50
    enabled?: boolean;   // default true; set false to defer fetching
  }
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

**`useDeleteAgentSession` hook:**

```typescript
function useDeleteAgentSession(
  owner: string,
  repo: string,
  callbacks?: {
    onSuccess?: (sessionId: string) => void;
    onError?: (error: HookError) => void;
  }
): {
  deleteSession: (sessionId: string) => Promise<void>;
  isDeleting: boolean;
};
```

**Behavior:**
- On mount (when `enabled` is true), fetches the first page.
- `fetchMore()` fetches the next page and appends results.
- `refetch()` clears accumulated data and re-fetches from page 1.
- When `owner` or `repo` changes, aborts in-flight requests and refetches.
- Accumulated items are capped at 500; oldest evicted when cap exceeded.
- Parses `X-Total-Count` header for `totalCount`.
- `deleteSession()` calls `DELETE /api/repos/:owner/:repo/agent/sessions/:id` and on success removes the session from the local list without refetching.

### Web UI Design

**Route:** `/:owner/:repo/agents` (within the repository view)

**Page Elements:**
- **Page heading:** "Agent Sessions" with a total count badge (e.g., "Agent Sessions (142)").
- **"New session" button:** Primary action button in the page header. Navigates to session creation flow.
- **Status filter tabs/pills:** Horizontally arranged selectable filters: All, Active, Completed, Failed, Timed Out. "All" is selected by default. Only one filter active at a time. Filters are client-side on the currently loaded data.
- **Search input:** Text field with placeholder "Search sessions by title…". Filters the currently loaded sessions client-side by case-insensitive title substring match. A clear button (×) appears when the input is non-empty.
- **Session table/list:** Each row displays:
  - Status indicator icon (colored dot/icon matching status — green dot for active, green checkmark for completed, red × for failed, yellow clock for timed_out, gray circle for pending)
  - Session title (truncated with ellipsis if too long for the column width)
  - Message count (e.g., "14 messages")
  - Duration (computed from `startedAt` to `finishedAt` for terminal sessions, or `startedAt` to now for active sessions; "—" if `startedAt` is null)
  - Relative created timestamp (e.g., "2h ago", "3d ago")
  - Creator avatar or initials (derived from `userId`)
- **Row interactions:**
  - Click a row to navigate to `/:owner/:repo/agents/:id` (session detail/replay view)
  - Hover state with subtle background highlight
  - An overflow/context menu on each row with "View", "Replay", and "Delete" actions (delete only shown if the current user is the session owner or a repo admin/owner)
- **Delete confirmation dialog:** Modal with "Delete session '{title}'? This action cannot be undone." and two buttons: "Delete" (destructive, red) and "Cancel".
- **Pagination:** "Load more" button at the bottom of the list (or infinite scroll). Shows "Showing {loaded} of {total}" indicator. When 500-item memory cap is reached, a notice: "Showing most recent 500 sessions. Refine your search to find older sessions."
- **Empty states:**
  - No sessions exist: Illustration with text "No agent sessions yet" and a prominent "Start a session" CTA button.
  - Filter produces no results: "No {status} sessions found. Try a different filter."
  - Search produces no results: "No sessions matching '{query}'." 
- **Loading state:** Skeleton rows or spinner while the first page is loading.
- **Error state:** If the API call fails, show an error banner with a "Retry" button.

**Agent Dock Integration:**
- The shell's Agent Dock can show a condensed view of the most recent 3–5 sessions.
- A "View all sessions" link in the dock navigates to the full `/:owner/:repo/agents` list page.

**Responsive Behavior:**
- On narrow viewports (<768px), the session table collapses to show only status icon, title, and timestamp. Duration, message count, and creator avatar are hidden.
- On medium viewports (768px–1200px), all columns are shown but duration may be abbreviated.
- On wide viewports (>1200px), full column widths with generous spacing.

### CLI Command

**Command:** `codeplane agent session list`

**Options:**

| Flag         | Type    | Default | Description                      |
|--------------|---------|---------|----------------------------------|
| `--page`     | number  | 1       | Page number                      |
| `--per-page` | number  | 30      | Results per page                 |
| `--repo`     | string  | (auto)  | Repository override (OWNER/REPO) |

**Default output** (table format):

```
ID            STATUS     TITLE                          MESSAGES  CREATED
01HXYZ...     completed  Fix the login redirect bug     14        2h ago
01HABC...     active     Triage stale issues            3         12m ago
01HDEF...     failed     Migrate database schema        8         1d ago
```

**JSON output** (`--json`): Outputs the raw JSON array returned by the API.

**Behavior:**
- Auto-detects repository from the current working directory via `resolveRepoRef`.
- If `--repo` is provided, uses that instead.
- Prints a human-readable table by default; supports `--json` for structured output.
- Exits with code 0 on success, non-zero on error.
- Shows "No agent sessions" message when the result is empty.
- Truncates long titles to fit terminal width.

### TUI UI

**Screen:** `AgentSessionListScreen`

**Layout:**
- Header bar showing repository name and "Agent Sessions" title, plus total count badge.
- Filter toolbar: status cycle control and search input.
- Session table with responsive columns based on terminal width.
- Footer with keybinding hints.

**Columns (responsive):**

| Column        | Minimum (80 cols) | Standard (120 cols) | Large (200+ cols) |
|---------------|:-:|:-:|:-:|
| Status icon   | ✓ | ✓ | ✓ |
| ID prefix     | — | ✓ | ✓ |
| Title         | ✓ | ✓ | ✓ |
| Message count | — | ✓ | ✓ |
| Duration      | — | — | ✓ |
| Timestamp     | ✓ | ✓ | ✓ |

**Status Icons:**

| Status     | Icon | Color   |
|------------|------|---------|  
| active     | ●    | green   |
| completed  | ✓    | green   |
| failed     | ✗    | red     |
| timed_out  | ⏱    | yellow  |
| pending    | ○    | gray    |

**Keybindings:**

| Key       | Action                              |
|-----------|-------------------------------------|
| `j` / `↓` | Move focus down                    |
| `k` / `↑` | Move focus up                      |
| `Enter`   | Open selected session              |
| `n`       | Create new session                 |
| `d`       | Delete selected session (confirm)  |
| `r`       | Replay selected session            |
| `f`       | Cycle status filter                |
| `/`       | Focus search input                 |
| `Escape`  | Clear search / exit filter         |
| `q`       | Navigate back                      |

**Delete Confirmation:**
- Shows an overlay/modal: "Delete session '{title}'? This cannot be undone. (y/n)"
- On confirm (`y`), calls delete API and shows a flash message "Session deleted" for 3 seconds.
- On cancel (`n` or `Escape`), returns to list without action.

**Empty States:**
- No sessions: "No agent sessions yet. Press `n` to start one."
- Filter empty: "No {status} sessions found. Press `f` to change the filter."
- Search empty: "No sessions matching '{query}'. Press Escape to clear search."

**Pagination:**
- "Load more" when scrolling past the last loaded item (if `hasMore` is true).
- Warning shown if accumulated items reach the 500-item memory cap.

### Documentation

1. **"Managing Agent Sessions" guide** — Explains what agent sessions are, how to view the list, filter by status, search, delete, and navigate to session details. Covers Web UI, CLI, and TUI.
2. **CLI reference** for `codeplane agent session list` — Flags, output format, examples.
3. **API reference** for `GET /api/repos/:owner/:repo/agent/sessions` — Request/response schema, headers, error codes.
4. **Keyboard shortcuts reference** — Document the TUI keybindings for the agent session list screen.

## Permissions & Security

### Authorization

| Role         | Can list sessions? | Can delete sessions? | Notes                                    |
|-------------|:-:|:-:|-------------------------------------------|
| Anonymous    | ❌ | ❌ | Must be authenticated                     |
| Read-only    | ✅ | ❌ | Can view but not modify                   |
| Member       | ✅ | Own only | Can delete only sessions they created   |
| Admin        | ✅ | ✅ | Can delete any session in the repository  |
| Owner        | ✅ | ✅ | Full access                               |

### Rate Limiting

- The `GET /api/repos/:owner/:repo/agent/sessions` endpoint is subject to the global rate limiter applied to all API routes.
- Recommended rate limit: **60 requests per minute per authenticated user** for this endpoint.
- The `DELETE /api/repos/:owner/:repo/agent/sessions/:id` endpoint should be limited to **30 requests per minute per authenticated user** to prevent bulk-deletion abuse.
- Automated polling (e.g., TUI SSE fallback) should use a minimum interval of 10 seconds between requests to avoid rate limit exhaustion.

### Data Privacy

- Agent session titles may contain user-generated natural language and could include sensitive information. Titles must not be indexed by public search engines.
- The `userId` field in session responses exposes which user created a session. This is acceptable for authenticated repository members but must not be exposed to unauthenticated users.
- Message contents are **not** included in the list response. Only metadata (title, status, counts) is returned.
- Session data must respect repository access controls — if a user loses access to a repository, they can no longer view its agent sessions.
- Session titles must be HTML-escaped in all web rendering contexts to prevent XSS.

## Telemetry & Product Analytics

### Business Events

| Event Name              | Trigger                                      | Properties                                                                                              |
|-------------------------|----------------------------------------------|---------------------------------------------------------------------------------------------------------|
| `AgentSessionListViewed` | User opens the session list in any client     | `repo_id`, `owner`, `repo`, `client` (web/cli/tui/desktop), `session_count`, `status_filter`, `has_search_query` |
| `AgentSessionListFiltered` | User applies a status filter               | `repo_id`, `client`, `filter_status`, `result_count`                                                    |
| `AgentSessionListSearched` | User performs a title search               | `repo_id`, `client`, `query_length`, `result_count`                                                     |
| `AgentSessionListPaginated` | User loads more sessions (next page)      | `repo_id`, `client`, `page_number`, `accumulated_count`                                                  |
| `AgentSessionDeletedFromList` | User deletes a session from the list view | `repo_id`, `session_id`, `session_status`, `session_age_seconds`, `client`                              |
| `AgentSessionDetailNavigated` | User clicks into a session from the list  | `repo_id`, `session_id`, `session_status`, `client`, `list_position`                                    |
| `AgentSessionCreateNavigated` | User clicks "New session" from the list   | `repo_id`, `client`                                                                                     |

### Funnel Metrics

1. **Session List → Session Detail conversion rate**: What percentage of list views result in a user clicking into a specific session? Target: >40%.
2. **Session List → New Session conversion rate**: What percentage of list views result in creating a new session? Indicates discoverability of the "new session" action.
3. **Repeat list usage**: How often does a user return to the session list within the same repository in a single day? High repeat usage indicates the list is a valuable navigation hub.
4. **Filter/search adoption**: What percentage of list views use a status filter or search? Low adoption may indicate the list is short enough to scan visually (good) or that filtering is not discoverable (needs UX improvement).

### Success Indicators

- Users who view the agent session list are more likely to create additional agent sessions (indicating the list drives engagement with the agent system).
- Average time-to-navigate from list to session detail is under 5 seconds.
- Fewer than 2% of session list API calls result in errors.
- Session list page renders within 1 second (p95) on standard hardware for repositories with up to 1,000 sessions.

## Observability

### Logging

| Log Point                         | Level  | Structured Context                                                  |
|-----------------------------------|--------|---------------------------------------------------------------------|
| Session list request received     | `info` | `repo_id`, `user_id`, `page`, `per_page`                           |
| Session list returned successfully| `info` | `repo_id`, `user_id`, `total_count`, `page_size`, `latency_ms`     |
| Session list query failed         | `error`| `repo_id`, `user_id`, `error_message`, `error_code`                |
| Session list auth rejected        | `warn` | `request_id`, `ip_address`                                         |
| Session list rate limited         | `warn` | `user_id`, `ip_address`, `endpoint`                                |
| Session delete from list          | `info` | `session_id`, `user_id`, `repo_id`                                 |
| Session delete auth denied        | `warn` | `session_id`, `requesting_user_id`, `owner_user_id`, `repo_id`     |
| Session delete failed             | `error`| `session_id`, `user_id`, `repo_id`, `error_message`                |

### Prometheus Metrics

| Metric Name                                    | Type      | Labels                                | Description                                        |
|------------------------------------------------|-----------|---------------------------------------|----------------------------------------------------|  
| `codeplane_agent_session_list_requests_total`  | Counter   | `repo_id`, `status_code`              | Total number of session list requests              |
| `codeplane_agent_session_list_latency_seconds` | Histogram | `repo_id`                             | Request latency for session list endpoint          |
| `codeplane_agent_session_list_result_count`    | Histogram | `repo_id`                             | Number of sessions returned per request            |
| `codeplane_agent_sessions_total`               | Gauge     | `repo_id`, `status`                   | Current count of sessions by status per repository |
| `codeplane_agent_session_delete_total`         | Counter   | `repo_id`, `status_code`              | Total number of session delete requests            |
| `codeplane_agent_session_delete_latency_seconds` | Histogram | `repo_id`                          | Request latency for session delete endpoint        |

### Alerts

#### Alert: High Session List Error Rate

**Condition:** `rate(codeplane_agent_session_list_requests_total{status_code=~"5.."}[5m]) / rate(codeplane_agent_session_list_requests_total[5m]) > 0.05`

**Severity:** Warning (>5%), Critical (>20%)

**Runbook:**
1. Check server logs for `error_message` context on session list failures.
2. Verify database connectivity — the session list query joins `agent_sessions` with an aggregate subquery on `agent_messages`, which can fail if the database is under load.
3. Check for query timeouts — the `ListAgentSessionsByRepoWithMessageCount` query involves a LEFT JOIN with a COUNT subquery. If `agent_messages` is very large, this may time out. Consider adding an index on `agent_messages(session_id)` if not present.
4. If errors are concentrated on specific repositories, check for data corruption or unusually large session/message counts.
5. Escalate to the database team if query plans have regressed.

#### Alert: High Session List Latency

**Condition:** `histogram_quantile(0.95, rate(codeplane_agent_session_list_latency_seconds_bucket[5m])) > 2.0`

**Severity:** Warning (>2s p95), Critical (>5s p95)

**Runbook:**
1. Check database query execution plans for the session list query.
2. Look for lock contention on `agent_sessions` — concurrent session creation or deletion may cause row-level locks that slow reads.
3. Verify database connection pool utilization. If the pool is exhausted, list queries will queue.
4. Check if a specific repository has an unusually large number of sessions (>10,000). If so, consider whether the query needs optimization or the repository needs cleanup.
5. Monitor memory usage on the database server — large result sets may cause memory pressure.

#### Alert: Session List Rate Limiting Spike

**Condition:** `rate(codeplane_agent_session_list_requests_total{status_code="429"}[5m]) > 10`

**Severity:** Warning

**Runbook:**
1. Identify the user(s) being rate-limited from structured logs.
2. Check if a CLI script or CI job is polling the session list in a tight loop.
3. If the traffic is legitimate (e.g., a dashboard polling), consider raising the rate limit for that user or recommending SSE-based updates instead of polling.
4. If the traffic is abusive, consider temporary IP-level blocking.

#### Alert: Session Delete Error Spike

**Condition:** `rate(codeplane_agent_session_delete_total{status_code=~"5.."}[5m]) > 5`

**Severity:** Warning

**Runbook:**
1. Check structured logs for `error_message` on delete failures.
2. Verify the DELETE query is not blocked by FK constraints or lock contention.
3. Check if cascade deletes on `agent_messages` and `agent_parts` are timing out for sessions with very large message counts.
4. If a single user is experiencing repeated delete failures, check for data integrity issues on their specific sessions.

### Error Cases and Failure Modes

| Error Case                              | HTTP Code | User-Facing Message                        | Recovery                                        |
|-----------------------------------------|-----------|--------------------------------------------|-------------------------------------------------|
| Unauthenticated request                 | 401       | "Authentication required"                  | User must log in                                |
| Repository not found                    | 404       | "Repository not found"                     | Verify owner/repo path                          |
| No read access to repository            | 404       | "Repository not found"                     | Request access from repository admin            |
| Database connection failure             | 500       | "Internal server error"                    | Retry; check server health                      |
| Query timeout                           | 500       | "Internal server error"                    | Reduce page size; retry                         |
| Invalid page parameter (non-numeric)    | (clamped) | Uses default page 1                       | N/A (graceful degradation)                      |
| Invalid per_page parameter              | (clamped) | Clamped to 1–50 range                      | N/A (graceful degradation)                      |
| Delete non-existent session             | 404       | "Session not found"                        | Refresh list                                    |
| Delete session without ownership        | 403       | "Forbidden"                                | Only session owner or admin can delete          |
| Rate limited                            | 429       | "Too many requests"                        | Wait and retry                                  |

## Verification

### API Integration Tests

- **List sessions for a repository with no sessions** — Returns `200 OK` with empty array and `X-Total-Count: 0`.
- **List sessions for a repository with one session** — Returns array of 1 session with all expected fields populated (`id`, `repositoryId`, `userId`, `workflowRunId`, `title`, `status`, `startedAt`, `finishedAt`, `createdAt`, `updatedAt`, `messageCount`).
- **List sessions returns sessions in newest-first order** — Create 3 sessions with known timestamps, verify ordering is `created_at DESC`.
- **List sessions returns correct `messageCount`** — Create a session with 5 messages, verify `messageCount` is `5` in the list response.
- **List sessions returns `messageCount: 0` for sessions with no messages** — Create a session without appending any messages, verify count is 0.
- **List sessions respects default pagination (page=1, per_page=30)** — Create 35 sessions, request without params, verify 30 returned and `X-Total-Count: 35`.
- **List sessions respects explicit `per_page` parameter** — Request with `per_page=5`, verify 5 returned.
- **List sessions clamps `per_page` to 50** — Request with `per_page=100`, verify at most 50 returned.
- **List sessions with `per_page=1`** — Request with `per_page=1`, verify exactly 1 returned.
- **List sessions with `per_page=50` (maximum valid size)** — Create 50 sessions, request with `per_page=50`, verify all 50 returned in a single response.
- **List sessions with `per_page=51` is clamped to 50** — Request with `per_page=51`, verify only 50 returned.
- **List sessions with `per_page=0` is clamped to 1** — Request with `per_page=0`, verify 1 returned.
- **List sessions with `per_page=-5` is clamped to 1** — Request with `per_page=-5`, verify graceful handling.
- **List sessions page 2** — Create 35 sessions, request page=2 with per_page=30, verify 5 returned.
- **List sessions with `page=0`** — Verify graceful handling (treated as page 1).
- **List sessions with `page` exceeding available pages** — Returns empty array with correct total count.
- **List sessions with non-numeric `page` parameter** — Verify graceful fallback to default (page 1).
- **List sessions with non-numeric `per_page` parameter** — Verify graceful fallback to default (30).
- **List sessions returns correct `X-Total-Count` header** — Create 42 sessions, verify header is `"42"`.
- **List sessions requires authentication** — Request without auth returns `401`.
- **List sessions with invalid PAT returns 401**.
- **List sessions with expired session cookie returns 401**.
- **List sessions for non-existent repository returns 404**.
- **List sessions for a repository the user cannot access returns 404** (not 403, to avoid leaking repository existence).
- **List sessions returns all status types correctly** — Create sessions with each of the 5 statuses (`active`, `completed`, `failed`, `timed_out`, `pending`), verify all appear with correct status values.
- **List sessions for a session with `workflowRunId` populated** — Verify the field is populated in the response.
- **List sessions for a session without `workflowRunId`** — Verify the field is `null`.
- **List sessions includes `startedAt` and `finishedAt` when set**.
- **List sessions returns `null` for `startedAt` and `finishedAt` when not set** (pending session).
- **Session title with maximum length (255 characters) appears correctly in list** — Create a session with a 255-character title, verify it appears in full in the API response.
- **Session title with special characters (Unicode, emoji, HTML entities) appears correctly** — Create sessions with titles like `"<script>alert('xss')</script>"`, `"🤖 Agent run"`, `"日本語タイトル"`, `"O'Malley's \"fix\""`, verify they are returned verbatim without modification.
- **Concurrent session creation during list** — While listing, create a new session, verify next list call includes it.
- **Deleted sessions do not appear in subsequent list calls** — Create and delete a session, verify it's absent from the list.
- **List sessions across multiple repositories are isolated** — Create sessions in repo A and repo B, verify listing repo A only shows repo A's sessions.
- **Delete session returns 204 for session owner**.
- **Delete session returns 403 for non-owner member**.
- **Delete session returns 204 for repository admin (non-owner of session)**.
- **Delete session returns 204 for repository owner (non-owner of session)**.
- **Delete session returns 404 for non-existent session ID**.
- **Delete session returns 401 for unauthenticated request**.
- **List with valid PAT authentication succeeds**.
- **List with valid session cookie authentication succeeds**.

### CLI E2E Tests

- **`codeplane agent session list` with no sessions** — Outputs empty table or "No agent sessions" message. Exit code 0.
- **`codeplane agent session list` with sessions** — Outputs formatted table with ID, status, title, message count, and timestamp columns.
- **`codeplane agent session list --json`** — Outputs valid JSON array. Each object contains expected fields.
- **`codeplane agent session list --json` with no sessions** — Outputs `[]`.
- **`codeplane agent session list --page 2 --per-page 5`** — Correct pagination; returns expected subset.
- **`codeplane agent session list --per-page 51`** — Clamped to 50; returns at most 50.
- **`codeplane agent session list --repo owner/repo`** — Uses the specified repository instead of auto-detection.
- **`codeplane agent session list` without authentication** — Prints error message and exits non-zero.
- **`codeplane agent session list` with auto-detected repo** — Correctly resolves repository from CWD when inside a repo checkout.
- **`codeplane agent session list` outside any repo without `--repo`** — Prints error about missing repository context and exits non-zero.
- **Long title truncation in CLI output** — Create a session with a 255-character title, verify the table output truncates gracefully without breaking alignment.

### TUI E2E Tests

- **AgentSessionListScreen renders loading state on mount** — Shows spinner/loading indicator before data arrives.
- **AgentSessionListScreen renders empty state when no sessions exist** — Shows "No agent sessions yet. Press `n` to start one."
- **AgentSessionListScreen renders session rows after data loads** — Correct number of rows with correct data (title, status icon, timestamp).
- **Status filter cycling with `f` key** — Cycles through All → Active → Completed → Failed → Timed Out → All.
- **Status filter shows only matching sessions** — When "Active" filter is selected, only active sessions are visible.
- **Search narrows visible sessions** — Type a search term via `/`, verify only matching sessions are shown.
- **Search is case-insensitive** — Searching for "fix" matches titles containing "Fix", "FIX", "fix".
- **Search with no matches shows empty search state** — Type a non-matching term, verify "No sessions matching '{query}'" message.
- **Escape clears search** — After searching, press Escape, verify all sessions reappear.
- **`j`/`k` navigation moves focus** — Verify the focused row indicator moves down with `j` and up with `k`.
- **`j` at bottom of list does not crash** — Focus stays on last item.
- **`k` at top of list does not crash** — Focus stays on first item.
- **`Enter` on a session navigates to session detail** — Verify screen transition to session view.
- **`n` navigates to create session screen** — Verify screen transition.
- **`d` triggers delete confirmation overlay** — Verify overlay appears with session title.
- **Delete confirmation `y` deletes and shows flash message** — Verify session removed from list and "Session deleted" flash shown for ~3 seconds.
- **Delete confirmation `n` cancels** — Verify overlay dismissed and session still present.
- **Delete confirmation `Escape` cancels** — Same as `n`.
- **`r` navigates to session replay** — Verify screen transition for completed/failed sessions.
- **`q` navigates back** — Verify return to previous screen.
- **Responsive columns at minimum width (80 cols)** — Verify only status icon, title, and timestamp shown.
- **Responsive columns at standard width (120 cols)** — Verify ID prefix and message count columns added.
- **Responsive columns at large width (200+ cols)** — Verify duration column added.
- **Pagination "load more" triggers on scroll past last item** — Verify additional sessions load when `hasMore` is true.
- **Memory cap warning at 500 items** — Load 500+ sessions, verify cap warning is displayed.

### Web UI (Playwright) E2E Tests

- **Agent sessions page loads and displays sessions** — Navigate to `/:owner/:repo/agents`, verify session rows rendered with correct data.
- **Agent sessions page shows empty state for repo with no sessions** — Verify empty state illustration, "No agent sessions yet" text, and "Start a session" CTA button.
- **Agent sessions page shows loading skeleton on initial load** — Verify skeleton/spinner is visible before data arrives.
- **Status filter tabs filter the list** — Click "Active" tab, verify only active sessions shown. Click "All", verify all sessions shown.
- **Each status filter tab works** — Click each of Active, Completed, Failed, Timed Out tabs and verify correct filtering.
- **Search input filters by title** — Type in search input, verify list narrows to matching sessions.
- **Search clear button restores full list** — Type a search, click ×, verify all sessions reappear.
- **Search with no results shows appropriate empty state** — Type a non-matching term, verify "No sessions matching" message.
- **Clicking a session row navigates to session detail** — Click row, verify URL changes to `/:owner/:repo/agents/:id` and detail page loads.
- **"New session" button navigates to session creation** — Click button, verify session creation UI appears.
- **Pagination controls work** — If >30 sessions, verify "Load more" button appears and loads additional sessions.
- **Delete session from list (if user is owner)** — Click delete in context menu, verify confirmation dialog appears, confirm, verify session removed from list.
- **Delete confirmation cancel leaves session in list** — Click delete, click Cancel in dialog, verify session still present.
- **Delete button not shown for sessions user does not own (non-admin)** — Verify delete option is absent from context menu.
- **Session list is not accessible without login** — Navigate while logged out, verify redirect to login page.
- **Total count badge updates after deletion** — Delete a session, verify the count badge decrements by 1.
- **Session with 255-character title renders without layout breakage** — Create session with max-length title, verify it renders with proper truncation/ellipsis.
- **Session with emoji title renders correctly** — Create session with title "🤖 Agent run 🚀", verify emoji renders correctly.
- **Session with HTML-like title does not execute scripts** — Create session with title `<img onerror=alert(1)>`, verify raw text is displayed, not executed.
- **Agent Dock "View all sessions" link navigates to list page** — Open agent dock, click "View all sessions", verify navigation to `/:owner/:repo/agents`.
- **Multiple rapid filter changes do not produce inconsistent state** — Rapidly click between filter tabs, verify the final state is consistent with the last selected filter.
- **Browser back navigation from session detail returns to list with preserved filter/search state** — Apply a filter, navigate to detail, press back, verify filter is still applied.
