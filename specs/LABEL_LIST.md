# LABEL_LIST

Specification for LABEL_LIST.

## High-Level User POV

When managing a repository in Codeplane, users need a way to see every label that has been defined for that repository. Labels are the primary organizational primitive for categorizing issues and landing requests — they carry a human-readable name, a hex color, and an optional description. Before a user can apply labels to issues, triage work, or build automation around label-based workflows, they first need to discover which labels exist.

The Label List feature gives users a single, paginated view of all labels defined on a repository. From the web UI, a repository maintainer navigating to the labels settings area sees every label rendered as a colored badge with its name and description, making it easy to scan what categories are available and whether new labels need to be created. From the CLI, a developer running `codeplane label list` in a repository directory sees a structured listing of all labels, which they can pipe to other tools or use as a reference before creating issues. Agents and automation tools query the label list endpoint to discover the label taxonomy of a repository, enabling them to correctly classify issues, suggest labels during triage, or validate label references in workflow definitions.

The label list is scoped to a single repository — there is no cross-repository or organization-wide label list. Labels are returned in a stable, deterministic order so that repeated queries produce consistent results, which is important for both human comprehension and machine-driven pagination. The feature respects repository visibility: labels on public repositories are visible to anyone, while labels on private repositories require appropriate access.

## Acceptance Criteria

- [ ] A user with read access to a repository can list all labels defined on that repository.
- [ ] The endpoint `GET /api/repos/:owner/:repo/labels` returns a JSON array of label objects.
- [ ] Each label object in the response contains `id` (number), `repository_id` (number), `name` (string), `color` (string in `#RRGGBB` format), `description` (string), `created_at` (ISO 8601 string), and `updated_at` (ISO 8601 string).
- [ ] The response is paginated using `cursor` and `limit` query parameters.
- [ ] The default page size is 30 labels per page.
- [ ] The maximum page size is 100 labels per page.
- [ ] If `limit` exceeds 100, it is silently clamped to 100.
- [ ] If `limit` is 0 or negative, it defaults to 30.
- [ ] If `cursor` is 0 or negative, it defaults to page 1.
- [ ] The response includes pagination headers (via `setPaginationHeaders`) indicating the total count of labels in the repository.
- [ ] Labels are returned ordered by label ID ascending (stable, deterministic ordering).
- [ ] A repository with no labels returns an empty JSON array `[]` with total count 0 and HTTP status 200.
- [ ] A repository with exactly one label returns a single-element array.
- [ ] Requesting a page beyond the available labels returns an empty array with the correct total count header.
- [ ] The `owner` and `repo` path parameters are case-insensitive (resolved via lowercase trimming).
- [ ] An empty or whitespace-only `owner` parameter returns 400 Bad Request with message "owner is required".
- [ ] An empty or whitespace-only `repo` parameter returns 400 Bad Request with message "repository name is required".
- [ ] An unauthenticated request to list labels on a public repository succeeds with 200.
- [ ] An unauthenticated request to list labels on a private repository returns 403 Forbidden.
- [ ] An authenticated user without any access to a private repository receives 403 Forbidden.
- [ ] An authenticated user with read, write, or admin access to a private repository succeeds with 200.
- [ ] The repository owner always succeeds.
- [ ] An organization owner always succeeds for org-owned repositories.
- [ ] A team member with read or higher permission succeeds for team-assigned repositories.
- [ ] A collaborator with read or higher permission succeeds.
- [ ] Listing labels on a non-existent repository returns 404 Not Found with message "repository not found".
- [ ] Label names may contain any characters, including spaces, emoji, and special characters, up to 255 characters in length; these are returned faithfully.
- [ ] Colors are always returned in normalized `#rrggbb` lowercase hex format.
- [ ] The CLI command `codeplane label list` outputs the same data in structured JSON format when `--json` is passed.
- [ ] The CLI command supports `--repo OWNER/REPO` to specify the target repository, or resolves from the current working directory context.
- [ ] Shell completions (bash, zsh, fish) include `list` as a subcommand of `label`.
- [ ] Labels reflect the current state of the repository — if a label was recently created, updated, or deleted, the list reflects the change immediately.

**Definition of Done**: The feature is complete when users can retrieve a paginated list of all labels for any accessible repository via the API and CLI, with correct permission enforcement, proper pagination, deterministic ordering, normalized color values, and consistent response shape. All client surfaces that consume repository labels use this endpoint correctly.

## Design

### API Shape

**List labels for a repository:**

```
GET /api/repos/:owner/:repo/labels
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

**Success response:** `200 OK`

```json
[
  {
    "id": 1,
    "repository_id": 7,
    "name": "bug",
    "color": "#d73a4a",
    "description": "Something isn't working",
    "created_at": "2026-01-15T10:30:00.000Z",
    "updated_at": "2026-01-15T10:30:00.000Z"
  },
  {
    "id": 2,
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

The response includes a total count header (set via `setPaginationHeaders`) indicating the total number of labels in the repository, enabling clients to compute total page counts.

**Error responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400    | Empty owner or repo | `{ "message": "owner is required" }` or `{ "message": "repository name is required" }` |
| 403    | Private repo, no access | `{ "message": "permission denied" }` |
| 404    | Repository not found | `{ "message": "repository not found" }` |

### SDK Shape

The `LabelService` class in `@codeplane/sdk` exposes:

```typescript
async listLabels(
  viewer: AuthUser | null,
  owner: string,
  repo: string,
  page: number,
  perPage: number,
): Promise<{ items: LabelResponse[]; total: number }>
```

The method resolves the repository by owner and lowercase name, checks read access, normalizes pagination parameters, counts all labels for the repository, and fetches the requested page ordered by ID ascending.

`LabelResponse` shape:
```typescript
interface LabelResponse {
  id: number;
  repository_id: number;
  name: string;
  color: string;         // Always #rrggbb lowercase
  description: string;
  created_at: string;    // ISO 8601
  updated_at: string;    // ISO 8601
}
```

### CLI Command

```
codeplane label list [--repo OWNER/REPO] [--json]
```

**Behavior:**
- If `--repo` is omitted, the CLI resolves the repository from the current working directory context (e.g., jj or git remote).
- Calls `GET /api/repos/:owner/:repo/labels` using the configured API URL and auth token.
- Default output is a human-readable table. When `--json` is passed, outputs the raw JSON array.
- Exit code 0 on success, non-zero on error.

**Shell completions:**
- Bash: `label` subcommand includes `list` in completions.
- Zsh: `label` subcommand includes `list` via `_values`.
- Fish: `label` subcommand includes `list` with description.

### TUI UI

The TUI does not currently have a dedicated repository-level label list screen. Issue labels are displayed inline on issue detail screens. A future TUI screen could be added under the repository context, but this is not currently required.

### Web UI Design

The web application should display the repository label list in the repository settings area. Each label row shows:
- A colored circle or badge rendered in the label's hex color.
- The label name in bold text.
- The label description in muted text.
- The creation timestamp.

The list should support pagination ("Load more" or page navigation) when the number of labels exceeds the page size. An empty state message ("No labels yet") should be shown when the repository has zero labels.

### Documentation

End-user documentation should include:
- **API reference**: Document the `GET /api/repos/:owner/:repo/labels` endpoint with parameters, response shape, pagination behavior, and error codes.
- **CLI reference**: Document `codeplane label list` including the `--repo` option, `--json` flag, and examples of usage.
- **Guide**: A "Managing Labels" guide explaining how to list, create, edit, and delete labels for a repository, with examples showing the full lifecycle.

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
- Unauthenticated requests: lower rate limit tier to prevent abuse of public repository label enumeration.
- No additional per-endpoint rate limiting is required beyond the platform default.

### Data Privacy

- Label data (name, color, description) is not PII.
- No user-specific data is included in the label response.
- Private repository labels are gated behind read access, preventing information leakage about private repository taxonomy to unauthorized parties.
- Repository existence is not leaked: requests to non-existent repositories return 404 regardless of authentication state.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `LabelListViewed` | User successfully lists labels for a repository | `repository_id`, `owner`, `repo`, `viewer_id` (nullable for anonymous), `result_count`, `total_count`, `page`, `per_page`, `client` (web/cli/tui/api) |

### Event Properties Detail

- `repository_id` (number): The internal ID of the repository.
- `owner` (string): The repository owner name.
- `repo` (string): The repository name.
- `viewer_id` (number | null): The authenticated user's ID, or null for anonymous access.
- `result_count` (number): The number of labels returned in this page.
- `total_count` (number): The total number of labels in the repository.
- `page` (number): The page number requested.
- `per_page` (number): The page size used (after normalization).
- `client` (string): The client surface that initiated the request (derived from User-Agent or explicit client header).

### Funnel Metrics and Success Indicators

- **Label list usage rate**: Percentage of active repositories that have had their labels listed in the last 30 days. Indicates feature adoption.
- **Labels-per-repository distribution**: Histogram of label counts across repositories. Helps product team understand whether users are creating rich taxonomies or using minimal labels.
- **Empty label list rate**: Percentage of label list requests that return zero labels. A high rate may indicate users are looking for labels before any have been created, suggesting a need for default label seeding.
- **Pagination depth**: Percentage of label list requests that use non-default cursor values. Near-zero pagination indicates most repositories have ≤30 labels.
- **Label list → Label create conversion**: Funnel from viewing the label list to creating a new label within the same session. Indicates whether the list view is an effective entry point for label management.
- **Client distribution**: Breakdown of label list requests by client type (web, CLI, TUI, API/agent). Indicates which surfaces are most used for label discovery.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Notes |
|-----------|-------|--------------------|-------|
| Label list request received | DEBUG | `owner`, `repo`, `page`, `limit`, `viewer_id` | Entry point log |
| Repository resolved | DEBUG | `repository_id`, `owner`, `repo`, `is_public` | Confirms repo lookup succeeded |
| Access denied (private repo) | WARN | `repository_id`, `viewer_id`, `reason` | Logged at WARN for security audit trail |
| Repository not found | INFO | `owner`, `repo` | Expected error path |
| Labels fetched | DEBUG | `repository_id`, `count`, `total`, `page`, `per_page`, `duration_ms` | Success with timing |
| Unexpected error | ERROR | `owner`, `repo`, `error_message`, `stack_trace` | Catch-all for internal errors |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_label_list_requests_total` | Counter | `status` (200, 400, 403, 404, 500), `auth` (authenticated, anonymous) | Total label list requests by status |
| `codeplane_label_list_duration_seconds` | Histogram | `status` | Request duration histogram (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_label_list_result_count` | Histogram | — | Number of labels returned per request (buckets: 0, 1, 5, 10, 20, 30, 50, 100) |
| `codeplane_label_list_total_count` | Histogram | — | Total label count per repository queried (buckets: 0, 1, 5, 10, 25, 50, 100, 250, 500) |

### Alerts

#### Alert: High Label List Error Rate

**Condition**: `rate(codeplane_label_list_requests_total{status="500"}[5m]) / rate(codeplane_label_list_requests_total[5m]) > 0.05`

**Severity**: Warning

**Runbook**:
1. Check the server logs for ERROR-level entries related to label list operations. Filter by `label_list` context.
2. Look for database connectivity issues — the label list requires two queries (count + select). Check `pg_stat_activity` for connection pool exhaustion.
3. Verify the `labels` table is accessible and not locked by a long-running migration or vacuum.
4. Check if the error is isolated to a specific repository (look at `repository_id` in structured logs). If so, investigate that repository's label table state.
5. If the error rate is cluster-wide, check for recent deployments that may have introduced a regression in the label service or route handler.
6. Escalate to the platform team if database-level issues are confirmed.

#### Alert: Label List Latency Spike

**Condition**: `histogram_quantile(0.95, rate(codeplane_label_list_duration_seconds_bucket[5m])) > 1.0`

**Severity**: Warning

**Runbook**:
1. Check if the latency spike correlates with overall database latency increases (check other endpoint latencies).
2. Examine slow query logs for the `listLabelsByRepo` and `countLabelsByRepo` queries.
3. Verify the `labels` table has proper indexes on `repository_id` (expected: primary key and index on `(repository_id, id)`).
4. Check for a specific repository with an unusually large number of labels causing the spike.
5. Review connection pool metrics for saturation.
6. If isolated, consider adding query-level timeouts as a safety measure.

#### Alert: Elevated 403 Rate on Label List

**Condition**: `rate(codeplane_label_list_requests_total{status="403"}[15m]) > 50`

**Severity**: Info

**Runbook**:
1. This may indicate a brute-force attempt to enumerate private repository labels.
2. Check the source IPs from structured logs for the 403 responses.
3. Verify that the rate limiter is correctly throttling these requests.
4. If the 403s come from a single source, consider IP-level blocking if they exceed abuse thresholds.
5. No immediate action required if the rate limiter is functioning correctly.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Error Message | Recovery |
|------------|-------------|---------------|----------|
| Repository not found | 404 | "repository not found" | Client should verify owner/repo spelling |
| Owner parameter empty | 400 | "owner is required" | Client should provide a valid owner |
| Repo parameter empty | 400 | "repository name is required" | Client should provide a valid repo name |
| Private repo, no auth | 403 | "permission denied" | User should authenticate |
| Private repo, insufficient access | 403 | "permission denied" | User should request access from repo owner |
| Database connection failure | 500 | "internal server error" | Retry after delay; check DB health |
| Count query returns null | 500 (gracefully defaults to 0) | N/A | Service handles this by defaulting total to 0 |

## Verification

### API Integration Tests

#### Happy Path

- [ ] **List labels on a public repo (unauthenticated)**: Create a public repo with 3 labels. Call `GET /api/repos/:owner/:repo/labels` without auth. Assert 200, array of 3 labels, each with correct shape (`id`, `repository_id`, `name`, `color`, `description`, `created_at`, `updated_at`).
- [ ] **List labels on a public repo (authenticated)**: Same as above but with a valid token. Assert 200.
- [ ] **List labels on a private repo (authenticated with read access)**: Create a private repo, add a collaborator with read access, create 2 labels. Call as the collaborator. Assert 200, array of 2 labels.
- [ ] **List labels returns correct field types**: Assert `id` is a number, `repository_id` is a number, `name` is a string, `color` matches `/#[0-9a-f]{6}/`, `description` is a string, `created_at` and `updated_at` are valid ISO 8601 strings.
- [ ] **List labels returns deterministic order**: Create labels "zebra", "apple", "mango" in that order. Assert they are returned ordered by ascending ID (i.e., creation order, not alphabetical).
- [ ] **List labels after creating a new label**: Create a label, then list. Assert the new label appears in the list.
- [ ] **List labels after deleting a label**: Create 3 labels, delete one, list. Assert only 2 remain and the deleted label is absent.
- [ ] **List labels after updating a label**: Create a label with name "old", update to "new", list. Assert the returned label has name "new".

#### Empty States

- [ ] **List labels on a repo with no labels**: Create a repo with no labels. Assert 200, empty array `[]`, total count header is 0.
- [ ] **List labels on a repo with exactly one label**: Create a repo with 1 label. Assert 200, single-element array.

#### Pagination

- [ ] **Default pagination (no params)**: Create 5 labels. Call without cursor/limit. Assert all 5 returned (under default limit of 30).
- [ ] **Explicit limit=2**: Create 5 labels. Call with `limit=2`. Assert 2 labels returned, total count header shows 5.
- [ ] **Second page**: Create 5 labels. Call with `cursor=2&limit=2`. Assert the next 2 labels returned (IDs 3 and 4 in creation order).
- [ ] **Last page with partial results**: Create 5 labels. Call with `cursor=3&limit=2`. Assert 1 label returned (the 5th).
- [ ] **Page beyond available data**: Create 5 labels. Call with `cursor=10&limit=2`. Assert empty array, total count header still shows 5.
- [ ] **limit=0 defaults to 30**: Create 5 labels. Call with `limit=0`. Assert all 5 returned.
- [ ] **limit=-1 defaults to 30**: Create 5 labels. Call with `limit=-1`. Assert all 5 returned.
- [ ] **limit=100 (maximum)**: Create 5 labels. Call with `limit=100`. Assert all 5 returned.
- [ ] **limit=101 clamped to 100**: Create 5 labels. Call with `limit=101`. Assert all 5 returned (clamped to 100, which covers all 5).
- [ ] **cursor=0 defaults to page 1**: Create 5 labels. Call with `cursor=0`. Assert first page returned.
- [ ] **cursor=-1 defaults to page 1**: Create 5 labels. Call with `cursor=-1`. Assert first page returned.
- [ ] **Pagination with exactly 100 labels**: Create exactly 100 labels. Call with `limit=100`. Assert all 100 returned in a single page.
- [ ] **Pagination with 101 labels**: Create 101 labels. Call with `limit=100`. Assert 100 returned on page 1, then call with `cursor=2&limit=100` and assert 1 returned.

#### Boundary Constraints

- [ ] **Label name with 255 characters**: Create a label with a 255-character name. List labels. Assert the label appears with the full 255-character name.
- [ ] **Label name with special characters**: Create labels with names containing spaces, emoji (e.g., "🐛 bug"), hyphens, underscores, dots, slashes. List labels. Assert all appear correctly.
- [ ] **Label with empty description**: Create a label with an empty description. List. Assert the label appears with `description: ""`.
- [ ] **Label color normalization**: Create a label with color `D73A4A` (uppercase, no hash). List labels. Assert color is returned as `#d73a4a`.

#### Permission Tests

- [ ] **Unauthenticated on private repo**: Create a private repo with labels. Call without auth. Assert 403.
- [ ] **Authenticated user with no repo access on private repo**: Create a private repo. Call as a user who is not a collaborator. Assert 403.
- [ ] **Repository owner on private repo**: Call as the repo owner. Assert 200.
- [ ] **Organization owner on org-owned private repo**: Create an org repo. Call as the org owner. Assert 200.
- [ ] **Team member with read permission**: Add a team with read access to the repo. Call as a team member. Assert 200.
- [ ] **Collaborator with write permission**: Add a collaborator with write access. Call as the collaborator. Assert 200.
- [ ] **Collaborator with admin permission**: Add a collaborator with admin access. Call as the collaborator. Assert 200.

#### Error Handling

- [ ] **Non-existent repository**: Call `GET /api/repos/alice/nonexistent/labels`. Assert 404 with message "repository not found".
- [ ] **Non-existent owner**: Call `GET /api/repos/nobody/somerepo/labels`. Assert 404 with message "repository not found".
- [ ] **Owner is case-insensitive**: Create repo as `Alice/MyRepo`. Call as `alice/myrepo`. Assert 200.

### CLI E2E Tests

- [ ] **`codeplane label list` returns labels**: Create a repo, create a label "bug" with color `d73a4a` and description "Something is broken". Run `codeplane label list --repo OWNER/REPO --json`. Assert the output is a JSON array containing the created label with correct name, color (`#d73a4a`), and description.
- [ ] **`codeplane label list` on empty repo**: Create a repo with no labels. Run `codeplane label list --repo OWNER/REPO --json`. Assert the output is an empty JSON array `[]`.
- [ ] **`codeplane label list` returns multiple labels in order**: Create 3 labels. Run `codeplane label list`. Assert all 3 appear in creation order.
- [ ] **`codeplane label list` with invalid repo**: Run `codeplane label list --repo nonexistent/repo --json`. Assert non-zero exit code and error output.
- [ ] **`codeplane label list` resolves repo from context**: From within a cloned repo directory, run `codeplane label list --json` without `--repo`. Assert it resolves the repo and returns labels.

### Playwright (Web UI) E2E Tests

- [ ] **Labels page renders all labels**: Navigate to the labels page for a repository with 5 labels. Assert 5 label entries are visible, each with a colored badge, name, and description.
- [ ] **Labels page shows empty state**: Navigate to the labels page for a repository with 0 labels. Assert an empty state message is displayed.
- [ ] **Labels page reflects newly created label**: Create a label via API, refresh the labels page. Assert the new label appears.
- [ ] **Labels page reflects deleted label**: Delete a label via API, refresh the labels page. Assert the label is no longer shown.
- [ ] **Labels page is inaccessible on private repo without auth**: Navigate to labels page of a private repo while unauthenticated. Assert access is denied.
- [ ] **Label colors render correctly**: Create a label with color `#ff0000`. Navigate to the labels page. Assert the color swatch or badge uses the correct hex color.

### Performance / Scale Tests

- [ ] **100 labels load within 500ms**: Create 100 labels on a repo. Call `GET /api/repos/:owner/:repo/labels?limit=100`. Assert response time < 500ms.
- [ ] **500 labels paginate correctly**: Create 500 labels. Paginate through all pages with `limit=100`. Assert all 500 labels are retrieved across 5 pages with no duplicates and no missing entries.
