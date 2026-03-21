# JJ_COMMIT_STATUS_LIST

Specification for JJ_COMMIT_STATUS_LIST.

## High-Level User POV

When you push code to a Codeplane repository, external CI/CD systems — workflow runs, build pipelines, test suites, linters, security scanners — report the outcome of their checks back to Codeplane as "commit statuses." The **commit status list** feature lets you see all of those check results in one place, for any given jj change or git commit.

From the web interface, the CLI, or the TUI, you can ask "what checks have run against this change?" and immediately see every reported status: whether it's pending, succeeded, failed, errored, or was cancelled. Each status includes the reporting context name (like `ci/build` or `security/scan`), a human-readable description, and an optional link back to the CI system where you can see full details.

Because Codeplane is jj-native, commit statuses can be looked up by either a jj change ID or a git commit SHA. This means you can query statuses using the stable change identifiers you already work with in jj, not just ephemeral commit hashes. When you're reviewing a landing request, the checks view aggregates statuses across all changes in the stack, giving you a single picture of whether the entire set of changes is ready to land.

The commit status list is a read-only view. It does not create or modify statuses — that's the job of the paired `JJ_COMMIT_STATUS_SET` feature, which CI systems and workflow integrations use to report results. The list feature is purely about giving developers, reviewers, and automation consumers fast, reliable access to the current state of all checks for any change.

## Acceptance Criteria

### Definition of Done

- [ ] `GET /api/repos/:owner/:repo/commits/:ref/statuses` returns a paginated list of commit statuses for the given ref
- [ ] The `:ref` parameter accepts both jj change IDs and git commit SHAs
- [ ] The response is a JSON array of commit status objects, each containing: `id`, `context`, `status`, `description`, `target_url`, `commit_sha`, `change_id`, `workflow_run_id`, `created_at`, `updated_at`
- [ ] Results are ordered by `created_at` descending (most recent first)
- [ ] Pagination uses `page`/`per_page` query parameters with sensible defaults
- [ ] The CLI command `codeplane status list <ref>` returns the status list for the given ref
- [ ] The CLI `land checks <number>` subcommand aggregates statuses across all changes in a landing request's change stack
- [ ] The TUI Checks tab in the landing detail view renders aggregated statuses grouped by change
- [ ] Anonymous/unauthenticated users can list statuses on public repositories
- [ ] Authenticated users with at least read access can list statuses on private repositories
- [ ] Users without repository access receive a 404 (not 403) for private repositories

### Input Constraints

- [ ] `:ref` must be a non-empty, trimmed string
- [ ] `:ref` containing only whitespace returns a 400 error
- [ ] `:owner` must be a valid, non-empty owner identifier
- [ ] `:repo` must be a valid, non-empty repository name
- [ ] `page` query parameter: positive integer, defaults to `1`; non-integer or `0`/negative values return 400
- [ ] `per_page` query parameter: positive integer, defaults to `30`, maximum `100`; values above 100 are clamped to 100
- [ ] Refs up to 255 characters are accepted; refs longer than 255 characters return 400
- [ ] Refs may contain lowercase alphanumeric characters and common jj/git punctuation (`-`, `_`, `.`, `/`); other characters are rejected with 400

### Response Constraints

- [ ] When no statuses exist for the ref, the endpoint returns an empty array `[]` with status 200
- [ ] Each status object's `status` field is one of: `pending`, `success`, `failure`, `error`, `cancelled`
- [ ] `change_id` may be `null` if the status was set using only a commit SHA
- [ ] `commit_sha` may be `null` if the status was set using only a change ID
- [ ] `workflow_run_id` may be `null` if the status was reported by an external system
- [ ] `target_url` may be an empty string if no URL was provided
- [ ] `description` may be an empty string if no description was provided
- [ ] Timestamps are returned in ISO 8601 format
- [ ] The endpoint returns statuses that match the ref as either a `change_id` or a `commit_sha` (union match)

### Edge Cases

- [ ] A ref that matches zero statuses returns `[]`, not 404
- [ ] A ref that exists as both a change_id on some rows and a commit_sha on other rows returns all matching rows
- [ ] Repository that does not exist returns 404
- [ ] Repository the user cannot access returns 404
- [ ] Extremely long context strings in stored statuses are returned faithfully, not truncated by the API
- [ ] Statuses with duplicate contexts for the same ref are all returned (no deduplication at the list level)
- [ ] Concurrent status creation during a list request does not cause errors; results are eventually consistent within the page being fetched

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/commits/:ref/statuses`

**Path Parameters:**
| Parameter | Type | Description |
|-----------|--------|-------------|
| `owner` | string | Repository owner (user or org) |
| `repo` | string | Repository name |
| `ref` | string | jj change ID or git commit SHA |

**Query Parameters:**
| Parameter | Type | Default | Max | Description |
|-----------|--------|---------|------|-------------|
| `page` | int | 1 | — | Page number |
| `per_page` | int | 30 | 100 | Results per page |

**Success Response: `200 OK`**

```json
[
  {
    "id": 42,
    "context": "ci/build",
    "status": "success",
    "description": "Build passed in 2m 34s",
    "target_url": "https://ci.example.com/build/1234",
    "commit_sha": "abc123def456789012345678901234567890abcd",
    "change_id": "kpqrstuvwxyz1234",
    "workflow_run_id": null,
    "created_at": "2026-03-21T10:30:00Z",
    "updated_at": "2026-03-21T10:32:34Z"
  }
]
```

**Response Headers:**
| Header | Description |
|--------|-------------|
| `X-Total-Count` | Total number of statuses matching the ref |
| `Link` | RFC 5988 pagination links (`next`, `prev`, `last`, `first`) |

**Error Responses:**
| Status | Condition |
|--------|----------|
| 400 | Missing or invalid `owner`, `repo`, `ref`, or pagination params |
| 401 | Private repository, no authentication provided |
| 404 | Repository not found or user lacks access |

### SDK Shape

The database layer in `packages/sdk/src/db/workflows_sql.ts` already provides:

- `listCommitStatusesByRef(sql, { repositoryId, ref, pageOffset, pageSize })` — queries by change_id OR commit_sha union match
- `listCommitStatusesBySHA(sql, { repositoryId, commitSha, pageOffset, pageSize })` — queries by commit_sha only
- `countCommitStatusesByRef(sql, { repositoryId, ref })` — returns total count for pagination headers

The route handler should use `listCommitStatusesByRef` as the primary query, since it handles the union of change_id and commit_sha matching.

### CLI Command

**Command:** `codeplane status list <ref>`

**Arguments:**
| Argument | Description |
|----------|-------------|
| `ref` | A jj change ID or git commit SHA |

**Options:**
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo`, `-R` | string | Auto-detected from cwd | Repository in `OWNER/REPO` format |
| `--json` | boolean | false | Output raw JSON |
| `--page` | int | 1 | Page number |
| `--per-page` | int | 30 | Results per page |

**Human-readable output format:**

```
STATUS   CONTEXT         DESCRIPTION                UPDATED
✓        ci/build        Build passed in 2m 34s     3 min ago
✓        ci/test         All 142 tests passed       2 min ago
⏳       security/scan   Scan in progress           1 min ago
```

**JSON output:** Returns the raw API response array.

**Exit codes:**
- `0` — Success (including empty results)
- `1` — API error, network error, or invalid arguments

**Landing request integration:**

`codeplane land checks <number>` fetches the landing request, iterates over each change ID in the stack, calls the status list endpoint for each, and aggregates the results. The aggregated view groups statuses by change.

### TUI UI

The TUI consumes commit statuses through the landing detail Checks tab (tab `6`). The Checks tab:

- Loads data lazily on first tab activation
- Fetches statuses for all changes in the landing's change stack concurrently
- Displays a summary bar with aggregated status counts
- Groups check rows by change with collapsible change group headers
- Supports vim-style navigation (`j`/`k` for rows, `n`/`p` for groups)
- Shows status icons: `✓` (success/green), `✗` (failure/red), `⚠` (error/red), `⏳` (pending/yellow), `⊘` (cancelled/dim)
- Allows manual refresh with `R`
- Adapts layout to terminal width (compact at 80 columns, full at 120+)

### Documentation

1. **API Reference — List Commit Statuses:** Document the endpoint path, parameters, response schema, pagination headers, and error codes with curl examples showing both change ID and commit SHA lookups.
2. **CLI Reference — `codeplane status list`:** Document the command syntax, all flags, output format examples in both human and JSON modes, and the relationship to `land checks`.
3. **Guides — Understanding Checks and Statuses:** A conceptual guide explaining what commit statuses are, how they relate to jj changes vs. git commits, how CI systems report them, and how to read the aggregated checks view in a landing request context.

## Permissions & Security

### Authorization Matrix

| Role | Public Repo | Private Repo |
|------|------------|-------------|
| Anonymous (no auth) | ✅ Can list | ❌ 404 |
| Read-only token | ✅ Can list | ✅ Can list |
| Member | ✅ Can list | ✅ Can list |
| Admin | ✅ Can list | ✅ Can list |
| Owner | ✅ Can list | ✅ Can list |

This is a read-only endpoint. It does not mutate state, so no write-level permission checks are needed. The authorization model matches repository visibility:

- If the repository is public, anyone can read statuses.
- If the repository is private, only authenticated users with at least read access (via PAT, session cookie, or OAuth token) can see statuses.
- When access is denied, the server returns 404 (not 403) to avoid leaking the existence of private repositories.

### Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| Unauthenticated | 60 requests | per hour per IP |
| Authenticated | 5,000 requests | per hour per user |
| Per-repository burst | 30 requests | per minute per user per repo |

The per-repository burst limit prevents automated tools from hammering the status list endpoint in tight polling loops. Clients should prefer webhook-triggered refreshes or SSE-based status streaming where available.

### Data Privacy

- Commit statuses may contain `target_url` values pointing to external CI systems. These URLs could encode session tokens or internal infrastructure paths. The API returns them as-is; operators are responsible for ensuring CI integrations do not embed sensitive tokens in status URLs.
- The `description` field is free-text and could theoretically contain PII. The API does not sanitize it on read, matching write-time validation only.
- `commit_sha` and `change_id` are repository-internal identifiers and are safe to expose to any user with read access.
- No user email, IP, or session data is included in the commit status response.

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `CommitStatusListed` | API endpoint returns 200 | `repository_id`, `owner`, `repo`, `ref_type` (change_id | commit_sha | ambiguous), `result_count`, `page`, `per_page`, `has_next_page`, `client` (web | cli | tui | api | sdk) |
| `CommitStatusListEmpty` | API endpoint returns 200 with 0 results | `repository_id`, `owner`, `repo`, `ref`, `ref_type` |
| `CommitStatusListError` | API endpoint returns 4xx or 5xx | `repository_id`, `owner`, `repo`, `ref`, `error_code`, `error_message` |
| `LandingChecksViewed` | CLI `land checks` or TUI Checks tab activated | `repository_id`, `landing_number`, `change_count`, `total_status_count`, `aggregate_status` (all_passing | has_failures | has_pending | has_errors) |

### Funnel Metrics

| Metric | What it tells us |
|--------|------------------|
| **Status list requests per day** | How frequently developers check CI results through Codeplane vs. going directly to their CI dashboard |
| **% of landing requests where checks are viewed** | Whether the checks integration is adding value to the review flow |
| **Unique repos with status reads** | Adoption breadth — how many repositories have active CI integrations reporting statuses |
| **Empty result rate** | If high, suggests statuses are not being written (adoption problem with `JJ_COMMIT_STATUS_SET`) or users are querying the wrong refs |
| **Time from status creation to first list read** | How quickly developers check their CI results after a push |
| **CLI vs. TUI vs. Web breakdown** | Which client surfaces are most used for status consumption |

## Observability

### Logging

| Log Point | Level | Structured Context |
|-----------|-------|-----------|
| Status list request received | `info` | `owner`, `repo`, `ref`, `page`, `per_page`, `request_id`, `user_id` (if authed) |
| Status list query executed | `debug` | `repository_id`, `ref`, `result_count`, `query_duration_ms` |
| Status list returned empty | `debug` | `repository_id`, `ref` |
| Repository not found | `warn` | `owner`, `repo`, `request_id` |
| Repository access denied | `warn` | `owner`, `repo`, `user_id`, `request_id` |
| Invalid pagination parameters | `warn` | `owner`, `repo`, `raw_page`, `raw_per_page`, `request_id` |
| Database query error | `error` | `owner`, `repo`, `ref`, `error_message`, `request_id` |
| Rate limit exceeded | `warn` | `owner`, `repo`, `user_id`, `ip`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_commit_status_list_requests_total` | counter | `owner`, `repo`, `status_code` | Total requests to the list endpoint |
| `codeplane_commit_status_list_duration_seconds` | histogram | `owner`, `repo` | Request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_commit_status_list_result_count` | histogram | `owner`, `repo` | Number of statuses returned per request (buckets: 0, 1, 5, 10, 25, 50, 100) |
| `codeplane_commit_status_list_errors_total` | counter | `owner`, `repo`, `error_type` | Errors by type (db_error, not_found, unauthorized, bad_request, rate_limited) |
| `codeplane_commit_status_list_db_query_duration_seconds` | histogram | — | Database query duration for status list queries |

### Alerts

#### Alert: `CommitStatusListHighErrorRate`
**Condition:** `rate(codeplane_commit_status_list_errors_total{error_type="db_error"}[5m]) / rate(codeplane_commit_status_list_requests_total[5m]) > 0.05`
**Severity:** Critical
**Runbook:**
1. Check database connectivity: verify the PostgreSQL/PGLite connection pool is healthy and not exhausted.
2. Check `codeplane_commit_status_list_db_query_duration_seconds` for elevated latency — slow queries may indicate missing indexes or table bloat on `commit_statuses`.
3. Review server error logs filtered by `request_id` to identify specific query failures.
4. Check if the `commit_statuses` table has grown unusually large (run `SELECT COUNT(*) FROM commit_statuses`).
5. If the issue is index-related, verify that indexes on `(repository_id, change_id)` and `(repository_id, commit_sha)` exist and are not corrupted.
6. If the connection pool is exhausted, increase pool size or investigate long-running transactions holding connections.

#### Alert: `CommitStatusListHighLatency`
**Condition:** `histogram_quantile(0.95, rate(codeplane_commit_status_list_duration_seconds_bucket[5m])) > 2`
**Severity:** Warning
**Runbook:**
1. Check `codeplane_commit_status_list_db_query_duration_seconds` — if database query time dominates, the issue is in the data layer.
2. Run `EXPLAIN ANALYZE` on the `listCommitStatusesByRef` query with a sample `repository_id` and `ref` to check the query plan.
3. Check if a particular repository has an unusually high number of statuses (thousands+), causing sequential scan fallback.
4. Check server CPU and memory utilization — high resource usage may indicate broader infrastructure pressure.
5. If isolated to specific repositories, consider adding a composite index or archiving old statuses.

#### Alert: `CommitStatusListRateLimitSpike`
**Condition:** `rate(codeplane_commit_status_list_errors_total{error_type="rate_limited"}[5m]) > 10`
**Severity:** Warning
**Runbook:**
1. Identify the user or IP triggering rate limits by checking structured logs for `rate_limit_exceeded` events.
2. If it's an automated CI system polling in a tight loop, contact the integration owner and suggest using webhooks or SSE instead.
3. If it's a legitimate high-traffic pattern, consider adjusting the per-repository burst limit for that specific user/integration.
4. Check if any recent deployment introduced a client-side polling regression (e.g., TUI or web refreshing too aggressively).

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior |
|------------|-------------|----------|
| Missing `owner` parameter | 400 | Returns `{"message": "owner is required"}` |
| Missing `repo` parameter | 400 | Returns `{"message": "repository name is required"}` |
| Missing `ref` parameter | 400 | Returns `{"message": "ref is required"}` |
| Invalid `page` (non-integer) | 400 | Returns `{"message": "invalid page value"}` |
| Invalid `per_page` (non-integer) | 400 | Returns `{"message": "invalid per_page value"}` |
| `ref` exceeds 255 characters | 400 | Returns `{"message": "ref is too long"}` |
| Repository does not exist | 404 | Returns `{"message": "repository not found"}` |
| User lacks access to private repo | 404 | Returns `{"message": "repository not found"}` (same as non-existent) |
| No authentication for private repo | 401 | Returns `{"message": "authentication required"}` |
| Database connection failure | 500 | Returns `{"message": "internal server error"}`, logs full error server-side |
| Rate limit exceeded | 429 | Returns `{"message": "rate limit exceeded"}` with `Retry-After` header |

## Verification

### API Integration Tests

| # | Test | Expected |
|---|------|----------|
| 1 | `GET /api/repos/:owner/:repo/commits/:ref/statuses` with a ref that has statuses | 200, non-empty array of status objects |
| 2 | Response objects contain all required fields: `id`, `context`, `status`, `description`, `target_url`, `commit_sha`, `change_id`, `workflow_run_id`, `created_at`, `updated_at` | All fields present with correct types |
| 3 | Query by jj change ID returns statuses set with that change ID | 200, matching statuses |
| 4 | Query by git commit SHA returns statuses set with that commit SHA | 200, matching statuses |
| 5 | Query by ref that matches both change_id and commit_sha rows returns all | 200, union of both sets |
| 6 | Results are ordered by `created_at` descending | Most recent status first |
| 7 | Empty result set returns `[]` with 200, not 404 | 200, empty array |
| 8 | Pagination: `page=1&per_page=2` returns at most 2 results | 200, array length ≤ 2, `X-Total-Count` header present |
| 9 | Pagination: `page=2` with 3 total results and `per_page=2` returns 1 result | 200, array length = 1 |
| 10 | Pagination: page beyond total results returns empty array | 200, empty array |
| 11 | Default pagination: no page/per_page returns up to 30 results | 200, array length ≤ 30 |
| 12 | `per_page=150` is clamped to 100 | 200, array length ≤ 100 |
| 13 | `per_page=0` returns 400 | 400 error |
| 14 | `per_page=-1` returns 400 | 400 error |
| 15 | `per_page=abc` returns 400 | 400 error |
| 16 | `page=0` returns 400 | 400 error |
| 17 | `page=-1` returns 400 | 400 error |
| 18 | `page=abc` returns 400 | 400 error |
| 19 | Missing `owner` returns 400 | 400 with "owner is required" |
| 20 | Missing `repo` returns 400 | 400 with "repository name is required" |
| 21 | Missing `ref` returns 400 | 400 with "ref is required" |
| 22 | `ref` is whitespace-only returns 400 | 400 error |
| 23 | `ref` at exactly 255 characters is accepted | 200 |
| 24 | `ref` at 256 characters returns 400 | 400 error |
| 25 | Non-existent repository returns 404 | 404 |
| 26 | Private repository without auth returns 401 | 401 |
| 27 | Private repository with read token returns statuses | 200 |
| 28 | Private repository with write token returns statuses | 200 |
| 29 | Public repository without auth returns statuses | 200 |
| 30 | `X-Total-Count` header matches actual total (not page size) | Header value equals total status count |
| 31 | `Link` header contains `next` when more pages exist | Header present with correct URL |
| 32 | `Link` header omits `next` on last page | Header omits `next` rel |
| 33 | Multiple statuses with same context for same ref are all returned | All duplicates present in results |
| 34 | Status with `null` change_id is returned correctly | `change_id` is `null` in JSON |
| 35 | Status with `null` commit_sha is returned correctly | `commit_sha` is `null` in JSON |
| 36 | Status with `null` workflow_run_id is returned correctly | `workflow_run_id` is `null` in JSON |
| 37 | Status with empty `target_url` is returned correctly | `target_url` is `""` |
| 38 | Status with empty `description` is returned correctly | `description` is `""` |
| 39 | Timestamps are valid ISO 8601 strings | Parseable as Date objects |
| 40 | `status` field values are only from allowed set | All statuses in `["pending", "success", "failure", "error", "cancelled"]` |

### CLI E2E Tests

| # | Test | Expected |
|---|------|----------|
| 41 | `codeplane status list <sha>` returns statuses for a commit | Exit 0, parseable output |
| 42 | `codeplane status list <sha> --json` returns JSON array | Exit 0, valid JSON array |
| 43 | `codeplane status list <change_id>` returns statuses for a change | Exit 0, matching results |
| 44 | `codeplane status list <change_id> --json` returns JSON array with change_id matches | Exit 0, valid JSON with expected `context` |
| 45 | `codeplane status list <sha>` shows multiple contexts per commit | Multiple contexts visible |
| 46 | `codeplane status list <ref>` on non-existent repo fails | Exit 1 |
| 47 | `codeplane status list <ref>` with no auth on private repo fails | Exit 1 |
| 48 | `codeplane status list <ref>` with read-only token succeeds | Exit 0 |
| 49 | `codeplane status list <ref>` with no results returns empty | Exit 0, empty output or empty array |
| 50 | `codeplane status list <ref> --page 1 --per-page 2` paginates correctly | At most 2 results |
| 51 | `codeplane land checks <number> --json` aggregates statuses from all changes | Exit 0, JSON payload with `landing` and `statuses` keys |
| 52 | `codeplane land checks <number>` human output shows grouped-by-change format | Exit 0, change headers visible |
| 53 | `codeplane land checks <number>` for landing with no changes shows no statuses | Exit 0, appropriate empty message |

### Playwright (Web UI) E2E Tests

| # | Test | Expected |
|---|------|----------|
| 54 | Navigate to a change detail page; check statuses are displayed if present | Status indicators visible |
| 55 | Navigate to a landing request detail; switch to Checks tab | Checks tab activates, status rows render |
| 56 | Checks tab shows summary bar with aggregated pass/fail/pending counts | Summary bar visible and correct |
| 57 | Checks tab shows statuses grouped by change | Change group headers visible |
| 58 | Empty checks state shows "No checks" message | Appropriate empty state message |
| 59 | Click/navigate to a check row with `target_url` shows the URL | URL displayed |
| 60 | Pagination controls appear when statuses exceed page size | Next page link or scroll indicator visible |

### TUI E2E Tests

| # | Test | Expected |
|---|------|----------|
| 61 | Landing detail Checks tab (press `6`) renders | Tab activates, content area shows check data or loading state |
| 62 | Checks tab shows summary bar | Summary text with status counts rendered |
| 63 | `j`/`k` navigation moves between check rows | Focus indicator moves |
| 64 | `R` triggers refresh | "Refreshing" indicator appears, data reloads |
| 65 | Tab navigation (`Tab`/`Shift+Tab`) includes the Checks tab | Focus cycles through all 6 tabs including Checks |
| 66 | Empty checks state when no statuses exist | "No checks" message rendered |
| 67 | API returning 501 (current stub state) shows error banner | Error banner with retry message |

### Cross-Cutting Tests

| # | Test | Expected |
|---|------|----------|
| 68 | Create a status via `JJ_COMMIT_STATUS_SET`, then list it via `JJ_COMMIT_STATUS_LIST` | Round-trip: created status appears in list |
| 69 | Create 101 statuses for one ref, list with default pagination | First page returns 30, `X-Total-Count` is 101 |
| 70 | Create statuses across 5 changes in a landing, view via `land checks` | All 5 changes' statuses aggregated |
| 71 | Create status with maximum-length `context` (255 chars), list it | Status returned with full context string |
| 72 | Create status with maximum-length `description` (1024 chars), list it | Status returned with full description |
| 73 | Create status with maximum-length `target_url` (2048 chars), list it | Status returned with full URL |
| 74 | Attempt to list with `ref` of 256 characters (edge boundary) | 400 error (ref too long) |
