# ISSUE_LABELS_LIST

Specification for ISSUE_LABELS_LIST.

## High-Level User POV

When working with issues in Codeplane, users need to see which labels are attached to a specific issue. The Issue Labels List feature provides a dedicated, paginated view of all labels currently associated with a given issue, independent of the issue detail view.

While the issue detail view already embeds labels as part of the full issue response, the dedicated labels list endpoint serves a distinct purpose: it enables clients, agents, and automation to retrieve just the label data for an issue without fetching the entire issue payload, and it supports pagination for issues that may accumulate many labels over time.

From the web UI, a user navigating to an issue detail page sees all attached labels rendered as colored badges in the sidebar. The data backing this display can be fetched either from the embedded labels in the issue response or from the dedicated labels list endpoint. For issue list views, labels are shown inline as colored pills next to each issue title.

From the CLI, a user viewing an issue sees its labels as part of the issue detail output. The labels are resolved to their full objects including name, color, and description, so the user gets complete context about each label without needing a separate lookup.

From the TUI, the issue detail screen displays labels in the metadata section with terminal-appropriate color rendering. Labels are listed with colored bullet indicators that adapt to the terminal's color capability (truecolor, ANSI-256, ANSI-16, or no-color).

For agents and automation, the dedicated issue labels list endpoint is the preferred way to inspect label state on an issue. An agent triaging issues can query labels to determine whether an issue has already been categorized, and can then decide whether additional labels need to be applied. The paginated design ensures this works reliably even for issues with many labels.

## Acceptance Criteria

- [ ] A user with read access to a repository can list the labels on any issue in that repository.
- [ ] The endpoint `GET /api/repos/:owner/:repo/issues/:number/labels` returns a JSON array of label objects for the specified issue.
- [ ] Each label object in the response contains `id` (number), `repository_id` (number), `name` (string), `color` (string), `description` (string), `created_at` (ISO 8601 string), and `updated_at` (ISO 8601 string).
- [ ] The response is paginated using cursor/limit query parameters.
- [ ] The default page size is 30 labels per page.
- [ ] The maximum page size is 100 labels per page.
- [ ] If `limit` exceeds 100, it is silently clamped to 100.
- [ ] If `limit` is 0 or negative, it defaults to 30.
- [ ] If `cursor` is 0 or negative, it defaults to page 1.
- [ ] The response includes pagination headers indicating the total count of labels on the issue.
- [ ] Labels are returned ordered by label ID ascending (stable, deterministic ordering).
- [ ] An issue with no labels returns an empty JSON array `[]` with total count 0.
- [ ] An issue with exactly one label returns a single-element array.
- [ ] An issue at the maximum label count (50 labels) returns all labels when paginated appropriately.
- [ ] Requesting a page beyond the available labels returns an empty array with the correct total count header.
- [ ] The `owner` and `repo` path parameters are case-insensitive (resolved via lowercase matching).
- [ ] The `number` path parameter must be a positive integer. Non-integer, zero, or negative values return 400 Bad Request.
- [ ] An unauthenticated request to list labels on a public repository issue succeeds with 200.
- [ ] An unauthenticated request to list labels on a private repository issue returns 403 Forbidden.
- [ ] An authenticated user without any access to a private repository receives 403 Forbidden.
- [ ] An authenticated user with read, write, or admin access to a private repository succeeds with 200.
- [ ] The repository owner always succeeds.
- [ ] An organization owner always succeeds for org-owned repositories.
- [ ] Listing labels on a non-existent issue returns 404 Not Found with message "issue not found".
- [ ] Listing labels on a non-existent repository returns 404 Not Found with message "repository not found".
- [ ] Listing labels on a valid issue in a valid repository that happens to have zero labels returns 200 with an empty array (not 404).
- [ ] The response format is consistent regardless of whether labels were added via PATCH replace, POST additive, or issue creation.
- [ ] Labels reflect the current state of the issue — if a label was recently added or removed, the list reflects the change immediately (no stale cache).

**Definition of Done**: The feature is complete when users can retrieve a paginated list of labels for any accessible issue via the API, with correct permission enforcement, proper pagination, deterministic ordering, and consistent response shape across all access patterns. All client surfaces (web UI, CLI, TUI) that display issue labels consume this data correctly.

## Design

### API Shape

**List labels on an issue:**

```
GET /api/repos/:owner/:repo/issues/:number/labels
Authorization: Bearer <token>  (optional for public repos)
```

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cursor` | integer | 1 | Page number (1-indexed). Values ≤0 default to 1. |
| `limit` | integer | 30 | Results per page. Clamped to range [1, 100]. |

**Success response:** `200 OK`

```json
[
  {
    "id": 42,
    "repository_id": 7,
    "name": "bug",
    "color": "#d73a4a",
    "description": "Something isn't working",
    "created_at": "2026-01-15T10:30:00.000Z",
    "updated_at": "2026-01-15T10:30:00.000Z"
  },
  {
    "id": 43,
    "repository_id": 7,
    "name": "enhancement",
    "color": "#a2eeef",
    "description": "New feature or request",
    "created_at": "2026-01-15T10:31:00.000Z",
    "updated_at": "2026-01-15T10:31:00.000Z"
  }
]
```

**Pagination headers:**

The response includes a total count header (set via `setPaginationHeaders`) indicating the total number of labels attached to the issue, enabling clients to compute page counts.

**Error responses:**

| Status | Condition |
|--------|----------|
| 400 | Invalid issue number (non-integer, zero, negative) |
| 403 | User lacks read access to private repository |
| 404 | Repository not found |
| 404 | Issue not found |
| 429 | Rate limit exceeded |

**Empty state response:** `200 OK`

```json
[]
```

With total count header set to 0.

### SDK Shape

The `LabelService` exposes the following method for listing issue labels:

```typescript
async listIssueLabels(
  viewer: AuthUser | null,
  owner: string,
  repo: string,
  number: number,
  page: number,
  perPage: number,
): Promise<{ items: LabelResponse[]; total: number }>
```

Behavior:
1. Validates that `number > 0`; throws `badRequest("invalid issue number")` otherwise.
2. Resolves the repository by owner and name (case-insensitive).
3. Checks read access for the viewer against the repository.
4. Looks up the issue by number within the repository; throws `notFound("issue not found")` if absent.
5. Normalizes pagination via `normalizePage(page, perPage)` — defaults page to 1, clamps perPage to [1, 100].
6. Counts total labels via `dbCountLabelsForIssue`.
7. Fetches the page of labels via `dbListLabelsForIssue` (ordered by `l.id ASC`).
8. Maps each row through `mapLabel()` to produce `LabelResponse` objects.
9. Returns `{ items, total }`.

The service also exposes an internal helper `listAllLabelsForIssue(issueId)` that paginates through all labels for embedding in issue detail responses.

### CLI Command

The CLI does not currently expose a dedicated `issue labels list` subcommand. Instead, labels are displayed as part of the `issue view` command output:

```bash
# View an issue (includes labels)
codeplane issue view 42 --repo OWNER/REPO

# JSON output includes full labels array
codeplane issue view 42 --repo OWNER/REPO --json
```

**Human-readable output includes:**
```
Issue #42: Fix login timeout
State: open
Labels: bug, high-priority
Assignees: alice, bob
...
```

**JSON output includes labels as embedded objects within the issue response:**
```json
{
  "number": 42,
  "title": "Fix login timeout",
  "labels": [
    { "id": 1, "name": "bug", "color": "#d73a4a", "description": "Something is broken" }
  ]
}
```

Agents and scripts that need only the label data can use the API directly:
```bash
codeplane api GET /api/repos/OWNER/REPO/issues/42/labels --json
```

### Web UI Design

**Issue Detail Page — Labels Sidebar:**

The labels section appears in the right sidebar of the issue detail view:

1. **Header**: "Labels" text, with a gear icon for users with write access.
2. **Label badges**: Each label renders as a colored pill/badge. The background color is the label's hex color. Text color is auto-computed for contrast (white on dark backgrounds, dark on light backgrounds).
3. **Empty state**: When no labels are assigned, "None yet" appears in muted text.
4. **Overflow**: If more than ~5 labels are assigned, the sidebar section scrolls or wraps to accommodate.

**Issue List Page — Inline Labels:**

In the issue list, each row displays assigned labels as inline colored badges after the issue title. If labels exceed available width, a `+N` overflow indicator shows the count of hidden labels.

### TUI UI

**Issue Detail Screen — Labels Display:**

Labels appear in the metadata section of the issue detail screen:
- Each label is prefixed with a colored bullet (●) using the nearest terminal-compatible color.
- Label names are rendered inline, comma-separated, with line wrapping if they exceed terminal width.
- Color mapping uses terminal capability detection: truecolor → ANSI-256 → ANSI-16 → no-color.
- A luminance floor is applied for dark background terminals to ensure readability.

**Issue List Screen — Inline Labels:**

Issue list rows show labels as `[label-name]` badges with color where terminal capabilities allow. Labels are truncated based on available terminal width.

### Documentation

The following end-user documentation should be written:

1. **"Viewing Issue Labels"** section within the Issues guide covering:
   - How labels appear on issue detail pages (web, CLI, TUI)
   - How labels appear in issue list views
   - How to query labels via the API directly
   - Pagination behavior and parameters
2. **API reference entry** for `GET /api/repos/:owner/:repo/issues/:number/labels` including:
   - Path parameters
   - Query parameters with defaults and limits
   - Response schema with example
   - Error codes and conditions
   - Pagination header documentation
3. **CLI reference** noting that `issue view` includes labels and that `codeplane api` can be used for direct API access.

## Permissions & Security

### Authorization Roles

| Role | Can list labels on issue | Notes |
|------|-------------------------|-------|
| Repository Owner | ✅ | Always allowed |
| Organization Owner | ✅ | Always allowed for org repos |
| Admin collaborator | ✅ | Full read access |
| Write collaborator | ✅ | Full read access |
| Read collaborator | ✅ | Read access to private repos |
| Authenticated, no explicit access | ✅ (public repos only) | 403 on private repos |
| Anonymous / Unauthenticated | ✅ (public repos only) | 403 on private repos |

This is a read-only endpoint. No write access is required. The only gating is repository read access: public repositories allow anyone (including unauthenticated users) to list issue labels; private repositories require the viewer to have at least read-level access.

### Rate Limiting

- **Read endpoint**: 120 requests per minute per user (authenticated or anonymous, identified by IP for anonymous).
- Rate limit responses return `429 Too Many Requests` with a `Retry-After` header.
- Anonymous requests share a per-IP rate limit pool.
- Authenticated requests use per-user rate limiting.

### Data Privacy Constraints

- Label names and descriptions are user-generated content. For private repositories, they must not be exposed to users without read access.
- Label names may theoretically contain PII (e.g., a label named after a person). Label names must not appear in server logs at INFO level — only at DEBUG level.
- Responses for private repositories must not be cached by CDNs or shared caches. The `Cache-Control: private, no-store` header should be set for private repository responses.
- Public repository label data may be cached with standard HTTP caching headers.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `issue_labels_listed` | A client successfully retrieves the labels for an issue | `repo_id`, `repo_owner`, `repo_name`, `issue_number`, `label_count` (total labels on issue), `page`, `per_page`, `viewer_id` (nullable for anonymous), `client` (web/cli/tui/api/agent) |
| `issue_labels_list_failed` | A labels list request fails (permission, not found) | `repo_owner`, `repo_name`, `issue_number`, `error_code` (403/404), `viewer_id` (nullable), `client` |

### Funnel Metrics & Success Indicators

- **Adoption**: Number of unique repositories where issue labels are listed per day/week — indicates feature usage breadth.
- **Agent vs. human split**: Breakdown of `issue_labels_listed` events by `client` type — measures how much agents rely on the dedicated endpoint vs. the embedded labels in issue detail.
- **Read-to-write ratio**: Ratio of `issue_labels_listed` events to `issue_label_added` / `issue_label_removed` events — indicates whether users are inspecting labels before modifying them (healthy triage pattern).
- **Empty label rate**: Percentage of `issue_labels_listed` events where `label_count` is 0 — high rates may indicate labels are underutilized in those repositories.
- **Pagination depth**: Distribution of `page` values in `issue_labels_listed` events — if most requests are page 1, it confirms that issues rarely exceed the default page size.
- **Error rate**: Percentage of `issue_labels_list_failed` events relative to total attempts (target: <1%).

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Issue labels list request received | DEBUG | `repo_owner`, `repo_name`, `issue_number`, `page`, `per_page`, `viewer_id` | Entry point for the labels list operation |
| Repository resolved | DEBUG | `repo_id`, `repo_owner`, `repo_name`, `is_public` | Repository lookup succeeded |
| Repository not found | WARN | `repo_owner`, `repo_name` | Requested repository does not exist |
| Permission denied (private repo) | WARN | `repo_owner`, `repo_name`, `viewer_id`, `is_public` | Viewer lacks read access to private repo |
| Issue not found | WARN | `repo_id`, `issue_number` | Requested issue does not exist in the repository |
| Invalid issue number | WARN | `raw_value` | Issue number parameter could not be parsed as a positive integer |
| Issue labels list completed | INFO | `repo_id`, `issue_number`, `total_labels`, `page`, `returned_count`, `duration_ms` | Successful labels list with timing |
| Database error during labels list | ERROR | `repo_id`, `issue_number`, `error_type`, `error_message` | Unexpected database failure |

**Note**: Label names must NOT appear in INFO-level logs to avoid accidental PII exposure. They may appear at DEBUG level only.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issue_labels_list_total` | counter | `status` (success, error), `error_code` (400/403/404/500, empty for success) | Total issue labels list operations |
| `codeplane_issue_labels_list_duration_seconds` | histogram | `status` | Latency of issue labels list operations (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_issue_labels_list_result_size` | histogram | — | Number of labels returned per successful request (buckets: 0, 1, 5, 10, 20, 30, 50) |

### Alerts

**Alert 1: High issue labels list error rate**

- **Condition**: `rate(codeplane_issue_labels_list_total{status="error"}[5m]) / rate(codeplane_issue_labels_list_total[5m]) > 0.15`
- **Severity**: Warning
- **Runbook**:
  1. Check error logs filtered by issue labels list context for the last 15 minutes. Identify the dominant `error_code`.
  2. If errors are primarily 404s: Check whether a client or agent is polling for issues/repos that have been deleted. Inspect the `repo_owner`/`repo_name` in WARN logs to identify the source.
  3. If errors are 403s: Check if a permission change (repo went private, collaborator removed) is causing a spike. Review recent permission audit logs.
  4. If errors are 500s: Check database connectivity via existing DB health metrics. Inspect PostgreSQL slow query logs for queries on `issue_labels` and `labels` tables. Check for connection pool exhaustion.
  5. If errors are 400s: A client is sending malformed issue numbers. Check WARN logs for `raw_value` to identify the source.
  6. If the issue correlates with a deployment, consider rolling back.

**Alert 2: Issue labels list latency spike**

- **Condition**: `histogram_quantile(0.95, rate(codeplane_issue_labels_list_duration_seconds_bucket[5m])) > 1.0`
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_issue_labels_list_duration_seconds` histogram to confirm the latency spike is real and sustained.
  2. Check PostgreSQL slow query logs for queries involving `labels` JOIN `issue_labels` tables.
  3. Verify indexes exist on `issue_labels(issue_id)` and `issue_labels(label_id)`. Run `EXPLAIN ANALYZE` on the `ListLabelsForIssue` query with a representative issue ID.
  4. Check if a single repository or issue has an unusually high label count (approaching 50) that is causing slow JOINs.
  5. Check overall database load — elevated latency across all endpoints suggests a systemic DB issue rather than a labels-specific problem.
  6. Check connection pool utilization and consider increasing pool size if near saturation.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | HTTP Status |
|------------|-------------------|-------------|
| Issue number is not a valid integer | Return "invalid issue number" | 400 |
| Issue number is zero or negative | Return "invalid issue number" | 400 |
| Repository not found (owner or name) | Return "repository not found" | 404 |
| Issue not found in repository | Return "issue not found" | 404 |
| Private repo, unauthenticated viewer | Return "permission denied" | 403 |
| Private repo, authenticated but no access | Return "permission denied" | 403 |
| Rate limit exceeded | Return rate limit error with Retry-After | 429 |
| Database connection failure | Return internal server error, log ERROR | 500 |
| Database query timeout | Return internal server error, log ERROR | 500 |

## Verification

### API Integration Tests

1. **List labels on an issue with one label** — Create a repo, create a label "bug" (color: `#d73a4a`, description: "Something is broken"), create an issue, add "bug" to the issue, `GET /api/repos/:owner/:repo/issues/:number/labels` → verify 200, response is an array with one element, element has correct `id`, `name`, `color`, `description`, `repository_id`, `created_at`, `updated_at` fields.
2. **List labels on an issue with multiple labels** — Add labels "bug", "enhancement", "urgent" to an issue, GET labels → verify response contains all three labels.
3. **Labels are ordered by ID ascending** — Add labels in order B, A, C (by name). Verify response is ordered by `id` ascending (which reflects creation order), not alphabetically.
4. **List labels on an issue with no labels** — Create an issue with no labels, GET labels → verify 200, response is `[]`, total count header is 0.
5. **Pagination with default limit** — Add 5 labels to an issue, GET without query params → verify all 5 returned (under default limit of 30).
6. **Pagination with custom limit** — Add 10 labels, GET with `limit=3` → verify exactly 3 labels returned, total count header is 10.
7. **Pagination page 2** — Add 10 labels, GET with `cursor=2&limit=3` → verify labels 4-6 returned (by order), total count remains 10.
8. **Pagination beyond available pages** — Add 3 labels, GET with `cursor=5&limit=30` → verify 200 with empty array, total count header is 3.
9. **Limit clamped to 100** — GET with `limit=200` → verify response returns at most 100 items (service clamps silently).
10. **Limit defaults to 30 when 0** — GET with `limit=0` → verify response uses default page size of 30.
11. **Limit defaults to 30 when negative** — GET with `limit=-5` → verify response uses default page size.
12. **Cursor defaults to page 1 when 0** — GET with `cursor=0` → verify first page returned.
13. **Cursor defaults to page 1 when negative** — GET with `cursor=-1` → verify first page returned.
14. **Maximum labels per issue (50)** — Create 50 labels, add all 50 to an issue, GET with `limit=100` → verify all 50 returned, total count is 50.
15. **Label object shape validation** — Verify each label object has exactly: `id` (number), `repository_id` (number), `name` (string), `color` (string), `description` (string), `created_at` (ISO 8601 string), `updated_at` (ISO 8601 string).
16. **Labels with special characters in names** — Add labels with names containing spaces ("needs review"), hyphens ("high-priority"), slashes ("area/frontend"), parentheses ("bug (confirmed)"), Unicode ("urgente"), emoji ("🔥 hot") → GET labels → verify all returned with correct names.
17. **Label with maximum length name (255 chars)** — Create a label with a 255-character name, add to issue, GET labels → verify 200, label returned with full 255-char name.
18. **Label with empty description** — Create a label with `description: ""`, add to issue, GET labels → verify description is empty string in response.
19. **Owner path parameter is case-insensitive** — GET with owner in mixed case (e.g., `OWNER` vs `owner`) → verify both resolve to the same repository and return 200.
20. **Repo path parameter is case-insensitive** — GET with repo name in mixed case → verify both resolve correctly.
21. **Invalid issue number (non-integer)** — GET with `:number` = `abc` → verify 400.
22. **Invalid issue number (zero)** — GET with `:number` = `0` → verify 400.
23. **Invalid issue number (negative)** — GET with `:number` = `-1` → verify 400.
24. **Issue number as float** — GET with `:number` = `1.5` → verify 400 (not a valid integer).
25. **Non-existent repository** — GET on `/api/repos/nouser/norepo/issues/1/labels` → verify 404 with "repository not found".
26. **Non-existent issue** — GET on valid repo with issue number 99999 → verify 404 with "issue not found".
27. **Public repo, unauthenticated** — Create a public repo with labeled issue, GET without auth → verify 200.
28. **Private repo, unauthenticated** — Create a private repo with labeled issue, GET without auth → verify 403.
29. **Private repo, authenticated but no access** — Create a private repo, authenticate as unrelated user, GET → verify 403.
30. **Private repo, read collaborator** — Add user as read collaborator, GET → verify 200.
31. **Private repo, write collaborator** — Add user as write collaborator, GET → verify 200.
32. **Private repo, admin collaborator** — Add user as admin collaborator, GET → verify 200.
33. **Private repo, repository owner** — Authenticate as repo owner, GET → verify 200.
34. **Org repo, org owner** — Create org repo, authenticate as org owner, GET → verify 200.
35. **Labels reflect recent additions** — Add a label to an issue, immediately GET labels → verify the newly added label appears.
36. **Labels reflect recent removals** — Remove a label from an issue, immediately GET labels → verify the removed label is absent.
37. **Closed issue labels** — Close an issue, GET labels → verify 200, labels still returned correctly.
38. **Consistency with issue detail response** — GET issue detail (which embeds labels), GET issue labels list → verify both return the same set of labels (same names, same ids).
39. **Multiple pages exhaust all labels** — Add 10 labels, GET page 1 with limit=4, GET page 2 with limit=4, GET page 3 with limit=4 → collect all results → verify exactly 10 unique labels, matching the full set.
40. **Concurrent label reads** — Issue 5 parallel GET requests for the same issue's labels → verify all return 200 with consistent data.

### CLI E2E Tests

41. **`codeplane issue view <N> --json` includes labels** — Create issue, add label, view issue → verify JSON output contains `labels` array with the added label.
42. **`codeplane issue view <N>` human-readable includes labels** — View issue without `--json` → verify output includes "Labels: <label-name>".
43. **`codeplane issue view <N> --json` with no labels** — Create issue without labels, view → verify `labels` is an empty array `[]`.
44. **`codeplane issue view <N> --json` with multiple labels** — Add 3 labels, view → verify all 3 labels appear in response.
45. **`codeplane api GET /api/repos/OWNER/REPO/issues/N/labels --json`** — Direct API call via CLI → verify returns label array.
46. **`codeplane issue view` with `--repo` flag** — Specify explicit repo → verify labels for correct repo.
47. **CLI with no auth on private repo** — Remove auth, view issue on private repo → verify error.

### Web UI Playwright Tests

48. **Issue detail page shows labels in sidebar** — Navigate to issue with labels → verify label badges are visible in sidebar with correct text.
49. **Label badge colors match label hex color** — Verify each label badge's background-color CSS property matches the label's configured color.
50. **Issue detail page shows "None yet" for unlabeled issue** — Navigate to issue with no labels → verify "None yet" text is visible in labels section.
51. **Issue list page shows inline label badges** — Navigate to issue list → verify issues with labels show colored badge elements.
52. **Label badges in list have correct names** — Verify label badge text content matches expected label names.
53. **Labels update after modification** — Add a label via API, reload issue detail → verify new label appears without full page reload if optimistic, or after reload.
54. **Multiple labels render correctly** — Issue with 5+ labels → verify all render, with proper wrapping or overflow indicator.

### API Rate Limiting Tests

55. **Rate limit is enforced** — Send 121+ requests within one minute for issue labels list → verify 429 response with Retry-After header on excess requests.
56. **Rate limit resets after window** — After hitting rate limit, wait for reset, send request → verify 200.
