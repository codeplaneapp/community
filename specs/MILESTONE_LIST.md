# MILESTONE_LIST

Specification for MILESTONE_LIST.

## High-Level User POV

When managing a repository in Codeplane, users need a way to see every milestone that has been defined for that repository. Milestones are the primary time-based planning primitive for organizing issues and landing requests into coherent release targets or project phases — they carry a human-readable title, an optional description, an open/closed state, and an optional due date. Before a user can associate issues with milestones, track progress toward a release, or decide whether new milestones need to be created, they first need to discover which milestones exist and what state they are in.

The Milestone List feature gives users a single, filterable, paginated view of all milestones defined on a repository. From the web UI, a repository maintainer navigating to the milestones area sees every milestone with its title, description, state (open or closed), due date, and closure timestamp, making it easy to scan what planning targets are active and which have been completed. From the CLI, a developer running `codeplane milestone list` in a repository directory sees a structured listing of milestones, which they can filter by state and pipe to other tools or use as a reference before associating issues. Agents and automation tools query the milestone list endpoint to discover the planning taxonomy of a repository, enabling them to correctly assign issues to milestones, check release readiness, or validate milestone references in workflow definitions.

The milestone list is scoped to a single repository — there is no cross-repository or organization-wide milestone list. Milestones are returned in a stable, deterministic order so that repeated queries produce consistent results, which is important for both human comprehension and machine-driven pagination. The feature supports filtering by state, allowing users to see only open milestones (active planning targets), only closed milestones (completed phases), or all milestones. The feature respects repository visibility: milestones on public repositories are visible to anyone, while milestones on private repositories require appropriate read access.

## Acceptance Criteria

- [ ] A user with read access to a repository can list all milestones defined on that repository.
- [ ] The endpoint `GET /api/repos/:owner/:repo/milestones` returns a JSON array of milestone objects.
- [ ] Each milestone object in the response contains `id` (number), `repository_id` (number), `title` (string), `description` (string), `state` (string, either "open" or "closed"), `due_date` (ISO 8601 string or null), `closed_at` (ISO 8601 string or null), `created_at` (ISO 8601 string), and `updated_at` (ISO 8601 string).
- [ ] The response is paginated using `cursor` and `limit` query parameters.
- [ ] The default page size is 30 milestones per page.
- [ ] The maximum page size is 100 milestones per page.
- [ ] If `limit` exceeds 100, it is silently clamped to 100.
- [ ] If `limit` is 0 or negative, it defaults to 30.
- [ ] If `cursor` is 0 or negative, it defaults to page 1.
- [ ] The response includes pagination headers (via `setPaginationHeaders`) indicating the total count of milestones matching the current state filter.
- [ ] Milestones are returned ordered by milestone ID ascending (stable, deterministic ordering).
- [ ] The endpoint supports an optional `state` query parameter that filters milestones by state.
- [ ] When `state` is omitted or empty, all milestones (open and closed) are returned.
- [ ] When `state=open`, only milestones with state "open" are returned.
- [ ] When `state=closed`, only milestones with state "closed" are returned.
- [ ] The `state` parameter is case-insensitive ("Open", "OPEN", "open" all work).
- [ ] An invalid `state` value (e.g., "pending", "archived") returns a 422 Validation Failed error with resource "Milestone", field "state", code "invalid".
- [ ] A repository with no milestones returns an empty JSON array `[]` with total count 0 and HTTP status 200.
- [ ] A repository with exactly one milestone returns a single-element array.
- [ ] Requesting a page beyond the available milestones returns an empty array with the correct total count header.
- [ ] The `owner` and `repo` path parameters are case-insensitive (resolved via lowercase trimming).
- [ ] An empty or whitespace-only `owner` parameter returns 400 Bad Request with message "owner is required".
- [ ] An empty or whitespace-only `repo` parameter returns 400 Bad Request with message "repository name is required".
- [ ] An unauthenticated request to list milestones on a public repository succeeds with 200.
- [ ] An unauthenticated request to list milestones on a private repository returns 403 Forbidden.
- [ ] An authenticated user without any access to a private repository receives 403 Forbidden.
- [ ] An authenticated user with read, write, or admin access to a private repository succeeds with 200.
- [ ] The repository owner always succeeds.
- [ ] An organization owner always succeeds for org-owned repositories.
- [ ] A team member with read or higher permission succeeds for team-assigned repositories.
- [ ] A collaborator with read or higher permission succeeds.
- [ ] Listing milestones on a non-existent repository returns 404 Not Found with message "repository not found".
- [ ] Milestone titles may contain any characters, including spaces, emoji, and special characters, up to 255 characters in length; these are returned faithfully.
- [ ] The `due_date` field is either a valid ISO 8601 string or null when no due date is set.
- [ ] The `closed_at` field is null for open milestones and a valid ISO 8601 string for closed milestones.
- [ ] The total count in pagination headers reflects the filtered count (respecting the state filter), not the total count of all milestones.
- [ ] The CLI command `codeplane milestone list` outputs the same data in structured JSON format when `--json` is passed.
- [ ] The CLI command supports `--repo OWNER/REPO` to specify the target repository, or resolves from the current working directory context.
- [ ] The CLI command supports `--state open` or `--state closed` to filter by state.
- [ ] Shell completions (bash, zsh, fish) include `list` as a subcommand of `milestone`.
- [ ] Milestones reflect the current state of the repository — if a milestone was recently created, updated, closed, or deleted, the list reflects the change immediately.
- [ ] Filtering by `state=open` when all milestones are closed returns an empty array with total count 0.
- [ ] Filtering by `state=closed` when all milestones are open returns an empty array with total count 0.

**Definition of Done**: The feature is complete when users can retrieve a filtered, paginated list of all milestones for any accessible repository via the API and CLI, with correct permission enforcement, state filtering, proper pagination, deterministic ordering, and consistent response shape. All client surfaces that consume repository milestones use this endpoint correctly.

## Design

### API Shape

**List milestones for a repository:**

```
GET /api/repos/:owner/:repo/milestones
Authorization: Bearer <token>  (optional for public repos)
```

**Path parameters:**

| Parameter | Type   | Description |
|-----------|--------|-------------|
| `owner`   | string | Repository owner (user or org). Case-insensitive. |
| `repo`    | string | Repository name. Case-insensitive. |

**Query parameters:**

| Parameter | Type    | Default | Description |
|-----------|---------|---------|-------------|
| `cursor`  | integer | 1       | Page number (1-indexed). Values ≤0 default to 1. |
| `limit`   | integer | 30      | Results per page. Clamped to range [1, 100]. |
| `state`   | string  | ""      | Filter by state. Valid values: "open", "closed", or empty/omitted for all. Case-insensitive. |

**Success response:** `200 OK`

```json
[
  {
    "id": 1,
    "repository_id": 7,
    "title": "v1.0",
    "description": "First public release",
    "state": "open",
    "due_date": "2026-06-01T00:00:00.000Z",
    "closed_at": null,
    "created_at": "2026-01-15T10:30:00.000Z",
    "updated_at": "2026-01-15T10:30:00.000Z"
  },
  {
    "id": 2,
    "repository_id": 7,
    "title": "v0.9-beta",
    "description": "Beta milestone",
    "state": "closed",
    "due_date": "2026-01-01T00:00:00.000Z",
    "closed_at": "2025-12-28T15:00:00.000Z",
    "created_at": "2025-11-01T08:00:00.000Z",
    "updated_at": "2025-12-28T15:00:00.000Z"
  }
]
```

**Pagination headers:**

The response includes a total count header (set via `setPaginationHeaders`) indicating the total number of milestones matching the state filter, enabling clients to compute total page counts.

**Error responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400    | Empty owner or repo | `{ "message": "owner is required" }` or `{ "message": "repository name is required" }` |
| 403    | Private repo, no access | `{ "message": "permission denied" }` |
| 404    | Repository not found | `{ "message": "repository not found" }` |
| 422    | Invalid state filter | `{ "message": "Validation Failed", "errors": [{ "resource": "Milestone", "field": "state", "code": "invalid" }] }` |

### SDK Shape

The `MilestoneService` class in `@codeplane/sdk` exposes:

```typescript
async listMilestones(
  viewer: AuthUser | null,
  owner: string,
  repo: string,
  page: number,
  perPage: number,
  state: string,
): Promise<{ items: MilestoneResponse[]; total: number }>
```

The method resolves the repository by owner and lowercase name, checks read access, normalizes the state filter (empty string for all, "open" or "closed"), normalizes pagination parameters, counts matching milestones for the repository, and fetches the requested page ordered by ID ascending.

`MilestoneResponse` shape:
```typescript
interface MilestoneResponse {
  id: number;
  repository_id: number;
  title: string;
  description: string;
  state: string;           // "open" or "closed"
  due_date: string | null; // ISO 8601 or null
  closed_at: string | null; // ISO 8601 or null
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601
}
```

### CLI Command

```
codeplane milestone list [--repo OWNER/REPO] [--state STATE] [--json]
```

**Behavior:**
- If `--repo` is omitted, the CLI resolves the repository from the current working directory context (e.g., jj or git remote).
- If `--state` is provided, it filters milestones to "open" or "closed". If omitted, returns all milestones.
- Calls `GET /api/repos/:owner/:repo/milestones?state=STATE` using the configured API URL and auth token.
- Default output is a human-readable table with columns: ID, Title, State, Due Date. When `--json` is passed, outputs the raw JSON array.
- Exit code 0 on success, non-zero on error.

**Shell completions:**
- Bash: `milestone` subcommand includes `list` in completions.
- Zsh: `milestone` subcommand includes `list` via `_values`.
- Fish: `milestone` subcommand includes `list` with description.
- The `--state` flag offers completion values: `open`, `closed`.

### TUI UI

The TUI does not currently have a dedicated repository-level milestone list screen. Milestones are displayed inline on issue detail and issue creation screens as single-select overlays. A future TUI screen could be added under the repository context, but this is not currently required for the MILESTONE_LIST feature.

### Web UI Design

The web application should display the repository milestone list as a dedicated view accessible from the repository settings or issues navigation area. Each milestone row shows:
- The milestone title in bold text.
- The milestone state rendered as a badge ("Open" in green, "Closed" in purple/grey).
- The milestone description in muted text (truncated with ellipsis if longer than 120 characters).
- The due date, if set, formatted as a human-readable date (e.g., "Jun 1, 2026"). If the due date is in the past and the milestone is still open, it should be rendered in a warning color (e.g., red/orange).
- The `closed_at` timestamp for closed milestones, formatted as a relative time (e.g., "Closed 3 days ago").

The list should include:
- A state filter toggle at the top: "Open" (default), "Closed", "All".
- Pagination controls ("Load more" or page navigation) when the number of milestones exceeds the page size.
- An empty state message ("No milestones yet") when the repository has zero milestones for the selected filter.
- An empty state for filtered views ("No open milestones" or "No closed milestones") when filtering yields zero results but milestones exist in the other state.

### Documentation

End-user documentation should include:
- **API reference**: Document the `GET /api/repos/:owner/:repo/milestones` endpoint with path parameters, query parameters (including `state` filter), response shape, pagination behavior, and error codes.
- **CLI reference**: Document `codeplane milestone list` including the `--repo` option, `--state` option, `--json` flag, and examples of usage such as `codeplane milestone list --state open --json`.
- **Guide**: A "Managing Milestones" guide explaining how to list, create, edit, close, and delete milestones for a repository, with examples showing the full lifecycle from creating a milestone through associating issues and closing it upon completion.

## Permissions & Security

### Authorization Roles

| Role | Access | Notes |
|------|--------|-------|
| **Anonymous (unauthenticated)** | Allowed on public repos, denied on private repos | Returns 403 Forbidden for private repos |
| **Authenticated, no repo access** | Denied on private repos | Returns 403 Forbidden |
| **Read** | Allowed | Collaborator or team member with read permission |
| **Write** | Allowed | Collaborator or team member with write permission |
| **Admin** | Allowed | Collaborator or team member with admin permission |
| **Repository Owner** | Always allowed | Checked via `repository.userId` match |
| **Organization Owner** | Always allowed for org repos | Checked via `dbIsOrgOwnerForRepoUser` |

### Permission Resolution Order

1. If the repository is public, access is granted to all (including unauthenticated).
2. If the user is the repository owner (direct user match), access is granted.
3. If the repository is org-owned and the user is the org owner, access is granted.
4. The highest permission is resolved from team permissions and collaborator permissions.
5. If the resolved permission is `read`, `write`, or `admin`, access is granted.
6. Otherwise, 403 Forbidden is returned.

### Rate Limiting

- The global rate limiter applied via the middleware stack applies to this endpoint.
- Authenticated requests: standard API rate limit (as configured in the platform middleware).
- Unauthenticated requests: lower rate limit tier to prevent abuse of public repository milestone enumeration.
- No additional per-endpoint rate limiting is required beyond the platform default.

### Data Privacy

- Milestone data (title, description, state, due date) is not PII.
- No user-specific data is included in the milestone response.
- Private repository milestones are gated behind read access, preventing information leakage about private repository planning taxonomy to unauthorized parties.
- Repository existence is not leaked: requests to non-existent repositories return 404 regardless of authentication state.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `MilestoneListViewed` | User successfully lists milestones for a repository | `repository_id`, `owner`, `repo`, `viewer_id` (nullable for anonymous), `result_count`, `total_count`, `page`, `per_page`, `state_filter`, `client` (web/cli/tui/api) |

### Event Properties Detail

- `repository_id` (number): The internal ID of the repository.
- `owner` (string): The repository owner name.
- `repo` (string): The repository name.
- `viewer_id` (number | null): The authenticated user's ID, or null for anonymous access.
- `result_count` (number): The number of milestones returned in this page.
- `total_count` (number): The total number of milestones matching the state filter in the repository.
- `page` (number): The page number requested.
- `per_page` (number): The page size used (after normalization).
- `state_filter` (string): The state filter applied — "open", "closed", or "all" (when no filter was specified).
- `client` (string): The client surface that initiated the request (derived from User-Agent or explicit client header).

### Funnel Metrics and Success Indicators

- **Milestone list usage rate**: Percentage of active repositories that have had their milestones listed in the last 30 days. Indicates feature adoption.
- **Milestones-per-repository distribution**: Histogram of milestone counts across repositories. Helps the product team understand whether users are creating rich planning structures or using minimal milestones.
- **Empty milestone list rate**: Percentage of milestone list requests that return zero milestones. A high rate may indicate users are looking for milestones before any have been created, suggesting a need for default milestone seeding or onboarding prompts.
- **State filter usage rate**: Percentage of milestone list requests that use a non-empty state filter. Indicates whether users rely on state-based filtering or prefer to see all milestones.
- **Open vs. closed filter ratio**: Ratio of `state=open` requests to `state=closed` requests. A high open-to-closed ratio is expected (users typically browse active milestones).
- **Pagination depth**: Percentage of milestone list requests that use non-default cursor values. Near-zero pagination indicates most repositories have ≤30 milestones.
- **Milestone list → Milestone create conversion**: Funnel from viewing the milestone list to creating a new milestone within the same session. Indicates whether the list view is an effective entry point for milestone management.
- **Milestone list → Issue milestone assignment conversion**: Funnel from viewing the milestone list to assigning a milestone to an issue. Indicates planning workflow adoption.
- **Client distribution**: Breakdown of milestone list requests by client type (web, CLI, TUI, API/agent). Indicates which surfaces are most used for milestone discovery.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Notes |
|-----------|-------|--------------------|-------|
| Milestone list request received | DEBUG | `owner`, `repo`, `page`, `limit`, `state_filter`, `viewer_id` | Entry point log |
| Repository resolved | DEBUG | `repository_id`, `owner`, `repo`, `is_public` | Confirms repo lookup succeeded |
| Access denied (private repo) | WARN | `repository_id`, `viewer_id`, `reason` | Logged at WARN for security audit trail |
| Repository not found | INFO | `owner`, `repo` | Expected error path |
| Invalid state filter rejected | INFO | `owner`, `repo`, `state_value` | Validation rejection |
| Milestones fetched | DEBUG | `repository_id`, `count`, `total`, `page`, `per_page`, `state_filter`, `duration_ms` | Success with timing |
| Count query returned null | WARN | `repository_id`, `state_filter` | Defensive fallback to total=0 |
| Unexpected error | ERROR | `owner`, `repo`, `error_message`, `stack_trace` | Catch-all for internal errors |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_milestone_list_requests_total` | Counter | `status` (200, 400, 403, 404, 422, 500), `auth` (authenticated, anonymous) | Total milestone list requests by status |
| `codeplane_milestone_list_duration_seconds` | Histogram | `status` | Request duration histogram (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_milestone_list_result_count` | Histogram | — | Number of milestones returned per request (buckets: 0, 1, 5, 10, 20, 30, 50, 100) |
| `codeplane_milestone_list_total_count` | Histogram | — | Total milestone count per repository queried (buckets: 0, 1, 5, 10, 25, 50, 100, 250) |
| `codeplane_milestone_list_state_filter_usage` | Counter | `state` (all, open, closed) | Breakdown of state filter usage |

### Alerts

#### Alert: High Milestone List Error Rate

**Condition**: `rate(codeplane_milestone_list_requests_total{status="500"}[5m]) / rate(codeplane_milestone_list_requests_total[5m]) > 0.05`

**Severity**: Warning

**Runbook**:
1. Check the server logs for ERROR-level entries related to milestone list operations. Filter by structured context containing `milestone_list`.
2. Look for database connectivity issues — the milestone list requires two queries (count + select). Check `pg_stat_activity` for connection pool exhaustion.
3. Verify the `milestones` table is accessible and not locked by a long-running migration or vacuum.
4. Check if the error is isolated to a specific repository (look at `repository_id` in structured logs). If so, investigate that repository's milestone table state for data corruption.
5. If the error rate is cluster-wide, check for recent deployments that may have introduced a regression in the milestone service or route handler.
6. Verify the `mapMilestone` function is not throwing on unexpected null/undefined row values from the database layer.
7. Escalate to the platform team if database-level issues are confirmed.

#### Alert: Milestone List Latency Spike

**Condition**: `histogram_quantile(0.95, rate(codeplane_milestone_list_duration_seconds_bucket[5m])) > 1.0`

**Severity**: Warning

**Runbook**:
1. Check if the latency spike correlates with overall database latency increases (compare with other endpoint latencies such as label list or issue list).
2. Examine slow query logs for the `listMilestonesByRepo` and `countMilestonesByRepo` queries.
3. Verify the `milestones` table has proper indexes on `repository_id` (expected: index on `(repository_id, id)` and state filter support).
4. Check for a specific repository with an unusually large number of milestones causing the spike.
5. Review connection pool metrics for saturation — both the count and list queries share the same connection pool.
6. If isolated to a specific repository, consider whether the state filter clause `($2::text = '' OR state = $2::text)` is causing a full table scan due to the OR condition. Recommend a query plan analysis.

#### Alert: Elevated 403 Rate on Milestone List

**Condition**: `rate(codeplane_milestone_list_requests_total{status="403"}[15m]) > 50`

**Severity**: Info

**Runbook**:
1. This may indicate a brute-force attempt to enumerate private repository milestones or a misconfigured client.
2. Check the source IPs from structured logs for the 403 responses.
3. Verify that the rate limiter is correctly throttling these requests at the unauthenticated tier.
4. If the 403s come from a single source, consider IP-level blocking if they exceed abuse thresholds.
5. If the 403s come from an authenticated user, verify whether their access was recently revoked (e.g., removed from a team or organization).
6. No immediate action required if the rate limiter is functioning correctly.

#### Alert: Spike in Invalid State Filter Requests

**Condition**: `rate(codeplane_milestone_list_requests_total{status="422"}[15m]) > 20`

**Severity**: Info

**Runbook**:
1. This indicates clients are sending invalid `state` query parameter values.
2. Check structured logs for the rejected `state_value` to identify the common invalid values.
3. If the invalid values are coming from a first-party client (web, CLI, TUI), file a bug against that client surface.
4. If from third-party API consumers, consider whether documentation needs to be updated or whether API validation messages are clear enough.
5. No immediate action required — the server is correctly rejecting invalid input.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Error Message | Recovery |
|------------|-------------|---------------|----------|
| Repository not found | 404 | "repository not found" | Client should verify owner/repo spelling |
| Owner parameter empty | 400 | "owner is required" | Client should provide a valid owner |
| Repo parameter empty | 400 | "repository name is required" | Client should provide a valid repo name |
| Private repo, no auth | 403 | "permission denied" | User should authenticate |
| Private repo, insufficient access | 403 | "permission denied" | User should request access from repo owner |
| Invalid state filter | 422 | "Validation Failed" (resource: Milestone, field: state, code: invalid) | Client should use "open", "closed", or omit the parameter |
| Database connection failure | 500 | "internal server error" | Retry after delay; check DB health |
| Count query returns null | 200 (gracefully defaults to 0) | N/A | Service handles this by defaulting total to 0 |

## Verification

### API Integration Tests

#### Happy Path

- [ ] **List milestones on a public repo (unauthenticated)**: Create a public repo with 3 milestones (2 open, 1 closed). Call `GET /api/repos/:owner/:repo/milestones` without auth. Assert 200, array of 3 milestones, each with correct shape (`id`, `repository_id`, `title`, `description`, `state`, `due_date`, `closed_at`, `created_at`, `updated_at`).
- [ ] **List milestones on a public repo (authenticated)**: Same as above but with a valid token. Assert 200.
- [ ] **List milestones on a private repo (authenticated with read access)**: Create a private repo, add a collaborator with read access, create 2 milestones. Call as the collaborator. Assert 200, array of 2 milestones.
- [ ] **List milestones returns correct field types**: Assert `id` is a number, `repository_id` is a number, `title` is a string, `description` is a string, `state` is either "open" or "closed", `due_date` is either null or a valid ISO 8601 string, `closed_at` is either null or a valid ISO 8601 string, `created_at` and `updated_at` are valid ISO 8601 strings.
- [ ] **List milestones returns deterministic order**: Create milestones "zebra", "apple", "mango" in that order. Assert they are returned ordered by ascending ID (i.e., creation order, not alphabetical).
- [ ] **List milestones after creating a new milestone**: Create a milestone, then list. Assert the new milestone appears in the list.
- [ ] **List milestones after deleting a milestone**: Create 3 milestones, delete one, list. Assert only 2 remain and the deleted milestone is absent.
- [ ] **List milestones after updating a milestone**: Create a milestone with title "old", update to "new", list. Assert the returned milestone has title "new".
- [ ] **List milestones after closing a milestone**: Create a milestone, close it (update state to "closed"), list with no state filter. Assert the milestone has state "closed" and `closed_at` is a non-null ISO 8601 timestamp.
- [ ] **List milestones with due dates**: Create a milestone with `due_date: "2026-06-01"`. List milestones. Assert the milestone's `due_date` is a valid ISO 8601 string.
- [ ] **List milestones with null due dates**: Create a milestone without a due date. List milestones. Assert the milestone's `due_date` is null.

#### State Filtering

- [ ] **Filter by state=open**: Create 2 open and 1 closed milestone. Call with `state=open`. Assert 2 milestones returned, all with state "open".
- [ ] **Filter by state=closed**: Create 2 open and 1 closed milestone. Call with `state=closed`. Assert 1 milestone returned with state "closed".
- [ ] **Filter by state=Open (case-insensitive)**: Create 1 open milestone. Call with `state=Open`. Assert 1 milestone returned.
- [ ] **Filter by state=CLOSED (case-insensitive)**: Create 1 closed milestone. Call with `state=CLOSED`. Assert 1 milestone returned.
- [ ] **No state filter returns all**: Create 2 open and 2 closed milestones. Call without `state` parameter. Assert 4 milestones returned.
- [ ] **Empty state filter returns all**: Call with `state=`. Assert same as no filter.
- [ ] **Invalid state filter returns 422**: Call with `state=pending`. Assert 422 with validation error on field "state".
- [ ] **Invalid state filter "archived" returns 422**: Call with `state=archived`. Assert 422.
- [ ] **Filter state=open when all milestones are closed**: Create 2 closed milestones. Call with `state=open`. Assert empty array, total count 0.
- [ ] **Filter state=closed when all milestones are open**: Create 2 open milestones. Call with `state=closed`. Assert empty array, total count 0.
- [ ] **Pagination total respects state filter**: Create 3 open and 2 closed milestones. Call with `state=open`. Assert total count header shows 3, not 5.

#### Empty States

- [ ] **List milestones on a repo with no milestones**: Create a repo with no milestones. Assert 200, empty array `[]`, total count header is 0.
- [ ] **List milestones on a repo with exactly one milestone**: Create a repo with 1 milestone. Assert 200, single-element array.

#### Pagination

- [ ] **Default pagination (no params)**: Create 5 milestones. Call without cursor/limit. Assert all 5 returned (under default limit of 30).
- [ ] **Explicit limit=2**: Create 5 milestones. Call with `limit=2`. Assert 2 milestones returned, total count header shows 5.
- [ ] **Second page**: Create 5 milestones. Call with `cursor=2&limit=2`. Assert the next 2 milestones returned (IDs 3 and 4 in creation order).
- [ ] **Last page with partial results**: Create 5 milestones. Call with `cursor=3&limit=2`. Assert 1 milestone returned (the 5th).
- [ ] **Page beyond available data**: Create 5 milestones. Call with `cursor=10&limit=2`. Assert empty array, total count header still shows 5.
- [ ] **limit=0 defaults to 30**: Create 5 milestones. Call with `limit=0`. Assert all 5 returned.
- [ ] **limit=-1 defaults to 30**: Create 5 milestones. Call with `limit=-1`. Assert all 5 returned.
- [ ] **limit=100 (maximum)**: Create 5 milestones. Call with `limit=100`. Assert all 5 returned.
- [ ] **limit=101 clamped to 100**: Create 5 milestones. Call with `limit=101`. Assert all 5 returned (clamped to 100, which covers all 5).
- [ ] **cursor=0 defaults to page 1**: Create 5 milestones. Call with `cursor=0`. Assert first page returned.
- [ ] **cursor=-1 defaults to page 1**: Create 5 milestones. Call with `cursor=-1`. Assert first page returned.
- [ ] **Pagination with exactly 100 milestones**: Create exactly 100 milestones. Call with `limit=100`. Assert all 100 returned in a single page.
- [ ] **Pagination with 101 milestones**: Create 101 milestones. Call with `limit=100`. Assert 100 returned on page 1, then call with `cursor=2&limit=100` and assert 1 returned.
- [ ] **Pagination with state filter**: Create 5 open and 5 closed milestones. Call with `state=open&limit=3`. Assert 3 open milestones returned, total count shows 5.

#### Boundary Constraints

- [ ] **Milestone title with 255 characters**: Create a milestone with a 255-character title. List milestones. Assert the milestone appears with the full 255-character title.
- [ ] **Milestone title with special characters**: Create milestones with titles containing spaces, emoji (e.g., "🚀 v2.0"), hyphens, underscores, dots, slashes, parentheses. List milestones. Assert all appear correctly.
- [ ] **Milestone with empty description**: Create a milestone with an empty description. List. Assert the milestone appears with `description: ""`.
- [ ] **Milestone with very long description**: Create a milestone with a 10,000-character description. List milestones. Assert the milestone appears with the full description.
- [ ] **Milestone with null due_date and null closed_at**: Create an open milestone without a due date. Assert both `due_date` and `closed_at` are null in the list response.

#### Permission Tests

- [ ] **Unauthenticated on private repo**: Create a private repo with milestones. Call without auth. Assert 403.
- [ ] **Authenticated user with no repo access on private repo**: Create a private repo. Call as a user who is not a collaborator. Assert 403.
- [ ] **Repository owner on private repo**: Call as the repo owner. Assert 200.
- [ ] **Organization owner on org-owned private repo**: Create an org repo. Call as the org owner. Assert 200.
- [ ] **Team member with read permission**: Add a team with read access to the repo. Call as a team member. Assert 200.
- [ ] **Collaborator with write permission**: Add a collaborator with write access. Call as the collaborator. Assert 200.
- [ ] **Collaborator with admin permission**: Add a collaborator with admin access. Call as the collaborator. Assert 200.

#### Error Handling

- [ ] **Non-existent repository**: Call `GET /api/repos/alice/nonexistent/milestones`. Assert 404 with message "repository not found".
- [ ] **Non-existent owner**: Call `GET /api/repos/nobody/somerepo/milestones`. Assert 404 with message "repository not found".
- [ ] **Owner is case-insensitive**: Create repo as `Alice/MyRepo`. Call as `alice/myrepo`. Assert 200.
- [ ] **Empty owner parameter**: Call `GET /api/repos/%20/somerepo/milestones`. Assert 400 with message "owner is required".
- [ ] **Empty repo parameter**: Call `GET /api/repos/alice/%20/milestones`. Assert 400 with message "repository name is required".

### CLI E2E Tests

- [ ] **`codeplane milestone list` returns milestones**: Create a repo, create a milestone "v1.0" with description "First release". Run `codeplane milestone list --repo OWNER/REPO --json`. Assert the output is a JSON array containing the created milestone with correct title, state ("open"), and description.
- [ ] **`codeplane milestone list` on empty repo**: Create a repo with no milestones. Run `codeplane milestone list --repo OWNER/REPO --json`. Assert the output is an empty JSON array `[]`.
- [ ] **`codeplane milestone list` returns multiple milestones in order**: Create 3 milestones. Run `codeplane milestone list --json`. Assert all 3 appear in creation order (ascending ID).
- [ ] **`codeplane milestone list --state open` filters correctly**: Create 2 open and 1 closed milestone. Run `codeplane milestone list --state open --repo OWNER/REPO --json`. Assert 2 milestones returned, all with state "open".
- [ ] **`codeplane milestone list --state closed` filters correctly**: Create 1 open and 2 closed milestones. Run `codeplane milestone list --state closed --repo OWNER/REPO --json`. Assert 2 milestones returned, all with state "closed".
- [ ] **`codeplane milestone list` with invalid repo**: Run `codeplane milestone list --repo nonexistent/repo --json`. Assert non-zero exit code and error output.
- [ ] **`codeplane milestone list` resolves repo from context**: From within a cloned repo directory, run `codeplane milestone list --json` without `--repo`. Assert it resolves the repo and returns milestones.
- [ ] **`codeplane milestone list` includes due_date and closed_at**: Create a milestone with a due date, close it. Run `codeplane milestone list --json`. Assert `due_date` is present and `closed_at` is non-null for the closed milestone.

### Playwright (Web UI) E2E Tests

- [ ] **Milestones page renders all milestones**: Navigate to the milestones page for a repository with 5 milestones (3 open, 2 closed). Assert 5 milestone entries are visible when "All" filter is selected, each with title, state badge, and description.
- [ ] **Milestones page shows empty state**: Navigate to the milestones page for a repository with 0 milestones. Assert an empty state message is displayed ("No milestones yet").
- [ ] **Milestones page filters by open**: Navigate to the milestones page, select "Open" filter. Assert only open milestones are displayed.
- [ ] **Milestones page filters by closed**: Navigate to the milestones page, select "Closed" filter. Assert only closed milestones are displayed.
- [ ] **Milestones page reflects newly created milestone**: Create a milestone via API, refresh the milestones page. Assert the new milestone appears.
- [ ] **Milestones page reflects deleted milestone**: Delete a milestone via API, refresh the milestones page. Assert the milestone is no longer shown.
- [ ] **Milestones page shows due date**: Create a milestone with a due date. Navigate to the milestones page. Assert the due date is displayed in human-readable format.
- [ ] **Milestones page shows overdue indicator**: Create an open milestone with a past due date. Navigate to the milestones page. Assert the due date is displayed with a warning/overdue visual indicator.
- [ ] **Milestones page is inaccessible on private repo without auth**: Navigate to milestones page of a private repo while unauthenticated. Assert access is denied.
- [ ] **Milestones page defaults to open filter**: Navigate to the milestones page. Assert the "Open" state filter is selected by default.

### Performance / Scale Tests

- [ ] **100 milestones load within 500ms**: Create 100 milestones on a repo. Call `GET /api/repos/:owner/:repo/milestones?limit=100`. Assert response time < 500ms.
- [ ] **250 milestones paginate correctly**: Create 250 milestones. Paginate through all pages with `limit=100`. Assert all 250 milestones are retrieved across 3 pages with no duplicates and no missing entries.
- [ ] **100 milestones with state filter load within 500ms**: Create 100 open and 100 closed milestones. Call `GET /api/repos/:owner/:repo/milestones?state=open&limit=100`. Assert response time < 500ms and exactly 100 results.
