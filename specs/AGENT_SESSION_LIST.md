# AGENT_SESSION_LIST

Specification for AGENT_SESSION_LIST.

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
- **Client-side title search** is supported in the TUI. Users can type a search query to narrow the visible sessions by title substring match.
- **Empty states are handled gracefully.** When no sessions exist, a helpful empty state message is shown. When a filter or search produces no results, a distinct message indicates the filter/search has no matches rather than that no sessions exist at all.
- **Sessions can be deleted from the list view.** A delete action with confirmation is available. Only the session owner can delete their own sessions.
- **Navigation to session detail** is available from each row. Selecting a session navigates to the session view/replay screen.
- **Navigation to create a new session** is available from the list view.
- **Session title is not empty.** Titles must be at least 1 character after trimming. Maximum title length is 255 characters.
- **Page number must be ≥ 1.** A `page` value of 0 or negative is treated as page 1.
- **Per-page must be between 1 and 50.** Values above 50 are clamped to 50.
- **The list degrades gracefully if message counts are unavailable.** If the message count subquery fails or returns null, the count is displayed as 0.
- **Memory cap for client-side accumulation.** Clients that support "load more" pagination must cap accumulated sessions at 500 items in memory, evicting the oldest when the cap is exceeded.
- **The list is available on all primary client surfaces:** API, Web UI, CLI, TUI.

### Definition of Done

1. The API endpoint `GET /api/repos/:owner/:repo/agent/sessions` returns paginated session data with message counts and total count header.
2. The Web UI displays an agent session list page within the repository view, with status indicators, pagination, and navigation to detail.
3. The CLI `codeplane agent session list` command returns formatted session list output with pagination options.
4. The TUI AgentSessionListScreen renders sessions with status filtering, search, delete confirmation, responsive column layout, and keyboard navigation.
5. All acceptance criteria above are verified by passing integration and e2e tests.

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

**Behavior:**
- On mount (when `enabled` is true), fetches the first page.
- `fetchMore()` fetches the next page and appends results.
- `refetch()` clears accumulated data and re-fetches from page 1.
- When `owner` or `repo` changes, aborts in-flight requests and refetches.
- Accumulated items are capped at 500; oldest evicted when cap exceeded.
- Parses `X-Total-Count` header for `totalCount`.

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

| Key     | Action                              |
|---------|-------------------------------------|
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
- On confirm, calls delete API and shows a flash message "Session deleted" for 3 seconds.
- On cancel, returns to list without action.

**Empty States:**
- No sessions: "No agent sessions yet. Press `n` to start one."
- Filter empty: "No {status} sessions found. Press `f` to change the filter."
- Search empty: "No sessions matching '{query}'. Press Escape to clear search."

**Pagination:**
- "Load more" when scrolling past the last loaded item (if `hasMore` is true).
- Warning shown if accumulated items reach the 500-item memory cap.

### Web UI Design

**Route:** `/:owner/:repo/agents` (within the repository view)

**Page Elements:**
- Page heading: "Agent Sessions" with total count badge.
- "New session" button (primary action).
- Status filter tabs/pills: All, Active, Completed, Failed, Timed Out.
- Search input for filtering by title.
- Session table with columns: Status icon, Title, Messages, Duration, Created, Creator avatar.
- Each row links to `/:owner/:repo/agents/:id`.
- Pagination controls at the bottom (page numbers or "Load more").
- Empty state illustrations matching the three cases above.

**Agent Dock Integration:**
- The shell's Agent Dock can show a condensed recent-sessions list.
- Clicking "View all sessions" in the dock navigates to the full list page.

### Documentation

1. **"Managing Agent Sessions"** guide — Explains what agent sessions are, how to view the list, filter by status, search, delete, and navigate to session details. Covers Web UI, CLI, and TUI.
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
- Automated polling (e.g., TUI SSE fallback) should use a minimum interval of 10 seconds between requests to avoid rate limit exhaustion.

### Data Privacy

- Agent session titles may contain user-generated natural language and could include sensitive information. Titles must not be indexed by public search engines.
- The `userId` field in session responses exposes which user created a session. This is acceptable for authenticated repository members but must not be exposed to unauthenticated users.
- Message contents are **not** included in the list response. Only metadata (title, status, counts) is returned.
- Session data must respect repository access controls — if a user loses access to a repository, they can no longer view its agent sessions.

## Telemetry & Product Analytics

### Business Events

| Event Name              | Trigger                                      | Properties                                                                                              |
|-------------------------|----------------------------------------------|---------------------------------------------------------------------------------------------------------|
| `AgentSessionListViewed` | User opens the session list in any client     | `repo_id`, `owner`, `repo`, `client` (web/cli/tui/desktop), `session_count`, `status_filter`, `has_search_query` |
| `AgentSessionListFiltered` | User applies a status filter               | `repo_id`, `client`, `filter_status`, `result_count`                                                    |
| `AgentSessionListSearched` | User performs a title search               | `repo_id`, `client`, `query_length`, `result_count`                                                     |
| `AgentSessionListPaginated` | User loads more sessions (next page)      | `repo_id`, `client`, `page_number`, `accumulated_count`                                                  |
| `AgentSessionDeletedFromList` | User deletes a session from the list view | `repo_id`, `session_id`, `session_status`, `session_age_seconds`, `client`                              |

### Funnel Metrics

1. **Session List → Session Detail conversion rate**: What percentage of list views result in a user clicking into a specific session? Target: >40%.
2. **Session List → New Session conversion rate**: What percentage of list views result in creating a new session? Indicates discoverability of the "new session" action.
3. **Repeat list usage**: How often does a user return to the session list within the same repository in a single day? High repeat usage indicates the list is a valuable navigation hub.
4. **Filter/search adoption**: What percentage of list views use a status filter or search? Low adoption may indicate the list is short enough to scan visually (good) or that filtering is not discoverable (needs UX improvement).

### Success Indicators

- Users who view the agent session list are more likely to create additional agent sessions (indicating the list drives engagement with the agent system).
- Average time-to-navigate from list to session detail is under 5 seconds.
- Fewer than 2% of session list API calls result in errors.

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

### Prometheus Metrics

| Metric Name                                    | Type      | Labels                                | Description                                        |
|------------------------------------------------|-----------|---------------------------------------|----------------------------------------------------|----------------------------------------|
| `codeplane_agent_session_list_requests_total`  | Counter   | `repo_id`, `status_code`              | Total number of session list requests              |
| `codeplane_agent_session_list_latency_seconds` | Histogram | `repo_id`                             | Request latency for session list endpoint          |
| `codeplane_agent_session_list_result_count`    | Histogram | `repo_id`                             | Number of sessions returned per request            |
| `codeplane_agent_sessions_total`               | Gauge     | `repo_id`, `status`                   | Current count of sessions by status per repository |
| `codeplane_agent_session_delete_total`         | Counter   | `repo_id`, `status_code`              | Total number of session delete requests            |

### Alerts

#### Alert: High Session List Error Rate

**Condition:** `rate(codeplane_agent_session_list_requests_total{status_code=~"5.."}[5m]) / rate(codeplane_agent_session_list_requests_total[5m]) > 0.05`

**Severity:** Warning (>5%), Critical (>20%)

**Runbook:**
1. Check server logs for `error_message` context on session list failures.
2. Verify database connectivity — the session list query joins `agent_sessions` with an aggregate subquery on `agent_messages`, which can fail if the database is under load.
3. Check for query timeouts — the `listAgentSessionsByRepoWithMessageCount` query involves a LEFT JOIN with a COUNT subquery. If `agent_messages` is very large, this may time out. Consider adding an index on `agent_messages(session_id)` if not present.
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

### Error Cases and Failure Modes

| Error Case                              | HTTP Code | User-Facing Message                        | Recovery                                        |
|-----------------------------------------|-----------|--------------------------------------------|-------------------------------------------------|
| Unauthenticated request                 | 401       | "Authentication required"                  | User must log in                                |
| Repository not found                    | 404       | "Repository not found"                     | Verify owner/repo path                          |
| No read access to repository            | 404       | "Repository not found"                     | Request access from repository admin            |
| Database connection failure             | 500       | "Internal server error"                    | Retry; check server health                      |
| Query timeout                           | 500       | "Internal server error"                    | Reduce page size; retry                         |
| Invalid page parameter (non-numeric)    | (clamped) | Uses default page 1                       | N/A (graceful degradation)                      |
| Invalid per_page parameter              | (clamped) | Clamped to 50                              | N/A (graceful degradation)                      |

## Verification

### API Integration Tests

- **List sessions for a repository with no sessions** — Returns `200 OK` with empty array and `X-Total-Count: 0`.
- **List sessions for a repository with one session** — Returns array of 1 session with all expected fields populated.
- **List sessions returns sessions in newest-first order** — Create 3 sessions with known timestamps, verify ordering.
- **List sessions returns correct `messageCount`** — Create a session with 5 messages, verify `messageCount` is `5` in the list response.
- **List sessions returns `messageCount: 0` for sessions with no messages** — Create a session without appending any messages, verify count is 0.
- **List sessions respects default pagination (page=1, per_page=30)** — Create 35 sessions, request without params, verify 30 returned and `X-Total-Count: 35`.
- **List sessions respects explicit `per_page` parameter** — Request with `per_page=5`, verify 5 returned.
- **List sessions clamps `per_page` to 50** — Request with `per_page=100`, verify at most 50 returned.
- **List sessions with `per_page=1`** — Request with `per_page=1`, verify exactly 1 returned.
- **List sessions page 2** — Create 35 sessions, request page=2 with per_page=30, verify 5 returned.
- **List sessions with `page=0`** — Verify graceful handling (treated as page 1 or error).
- **List sessions with `page` exceeding available pages** — Returns empty array with correct total count.
- **List sessions with non-numeric `page` parameter** — Verify graceful fallback to default.
- **List sessions with non-numeric `per_page` parameter** — Verify graceful fallback to default.
- **List sessions returns correct `X-Total-Count` header** — Create 42 sessions, verify header is `42`.
- **List sessions requires authentication** — Request without auth returns `401`.
- **List sessions with invalid PAT returns 401**.
- **List sessions for non-existent repository returns 404**.
- **List sessions for a repository the user cannot access returns 404** (not 403, to avoid leaking repository existence).
- **List sessions returns all status types correctly** — Create sessions with each of the 5 statuses, verify all appear with correct status values.
- **List sessions for a session with `workflowRunId`** — Verify the field is populated in the response.
- **List sessions for a session without `workflowRunId`** — Verify the field is `null`.
- **List sessions includes `startedAt` and `finishedAt` when set**.
- **List sessions returns `null` for `startedAt` and `finishedAt` when not set**.
- **Maximum valid page size (50) works correctly** — Create 50 sessions, request with `per_page=50`, verify all 50 returned.
- **Per-page of 51 is clamped to 50** — Request with `per_page=51`, verify only 50 returned.
- **Session title with maximum length (255 characters) appears correctly in list** — Create a session with a 255-character title, verify it appears in full.
- **Session title with special characters (Unicode, emoji, HTML entities) appears correctly** — Create sessions with titles like `"<script>alert('xss')</script>"`, `"🤖 Agent run"`, `"日本語タイトル"`, verify they are returned verbatim without sanitization.
- **Concurrent session creation during list** — While listing, create a new session, verify next list call includes it.
- **Deleted sessions do not appear in subsequent list calls** — Create and delete a session, verify it's absent from the list.
- **List sessions across multiple repositories are isolated** — Create sessions in repo A and repo B, verify listing repo A only shows repo A's sessions.

### CLI E2E Tests

- **`codeplane agent session list` with no sessions** — Outputs empty table or "No sessions" message.
- **`codeplane agent session list` with sessions** — Outputs formatted table with ID, status, title, message count, and timestamp columns.
- **`codeplane agent session list --json`** — Outputs valid JSON array.
- **`codeplane agent session list --page 2 --per-page 5`** — Correct pagination.
- **`codeplane agent session list --repo owner/repo`** — Uses the specified repository.
- **`codeplane agent session list` without authentication** — Prints error message and exits non-zero.
- **`codeplane agent session list` with auto-detected repo** — Correctly resolves from CWD.

### TUI E2E Tests

- **AgentSessionListScreen renders loading state on mount** — Shows spinner/loading indicator.
- **AgentSessionListScreen renders empty state when no sessions exist** — Shows "No agent sessions yet" message.
- **AgentSessionListScreen renders session rows after data loads** — Correct number of rows with correct data.
- **Status filter cycling with `f` key** — Cycles through All → Active → Completed → Failed → Timed Out → All.
- **Search narrows visible sessions** — Type a search term, verify only matching sessions are shown.
- **Search with no matches shows empty search state** — Type a non-matching term, verify "No sessions matching" message.
- **Escape clears search** — After searching, press Escape, verify all sessions reappear.
- **`j`/`k` navigation moves focus** — Verify the focused row indicator moves.
- **`Enter` on a session navigates to session detail** — Verify screen transition.
- **`n` navigates to create session screen** — Verify screen transition.
- **`d` triggers delete confirmation overlay** — Verify overlay appears with session title.
- **Delete confirmation `y` deletes and shows flash message** — Verify session removed from list and flash shown.
- **Delete confirmation `n` cancels** — Verify overlay dismissed and session still present.
- **`r` navigates to session replay** — Verify screen transition for completed/failed sessions.
- **`q` navigates back** — Verify return to previous screen.
- **Responsive columns at minimum width (80 cols)** — Verify only status icon, title, and timestamp shown.
- **Responsive columns at standard width (120 cols)** — Verify ID prefix and message count added.
- **Responsive columns at large width (200+ cols)** — Verify duration column added.
- **Pagination "load more" triggers on scroll past last item** — Verify additional sessions load.

### Web UI (Playwright) E2E Tests

- **Agent sessions page loads and displays sessions** — Navigate to `/:owner/:repo/agents`, verify session rows rendered.
- **Agent sessions page shows empty state for repo with no sessions** — Verify empty state illustration and "New session" CTA.
- **Status filter tabs filter the list** — Click "Active" tab, verify only active sessions shown.
- **Search input filters by title** — Type in search, verify list narrows.
- **Clicking a session row navigates to session detail** — Verify URL changes and detail page loads.
- **"New session" button navigates to session creation** — Verify session creation UI appears.
- **Pagination controls work** — If >30 sessions, verify next page loads.
- **Delete session from list (if user is owner)** — Verify confirmation dialog, deletion, and removal from list.
- **Session list is not accessible without login** — Navigate while logged out, verify redirect to login.
