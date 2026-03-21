# LABEL_VIEW

Specification for LABEL_VIEW.

## High-Level User POV

When working with a Codeplane repository, users frequently need to inspect the details of a specific label. Labels are the primary organizational primitive for categorizing issues and landing requests — they carry a human-readable name, a hex color, and an optional description. While the label list gives an overview of all labels, the Label View feature provides a focused, detailed view of a single label.

A repository maintainer who has set up dozens of labels might need to inspect a particular label to confirm its exact color code before referencing it in documentation, to verify its description, or to check when it was last modified. From the web UI, clicking on a label from the labels management page or from an issue sidebar opens a view of that label's full details — its color swatch, name, description, and timestamps. From the CLI, a developer running `codeplane label view <id>` sees the complete label object, which they can use to verify label properties before referencing the label in scripts, automation pipelines, or workflow definitions. Agents and automation tools use the single-label endpoint to validate that a specific label ID still exists and to fetch its current properties before performing operations that depend on label metadata.

The Label View is scoped to a single repository — a label ID is meaningful only within the context of the repository that owns it. The feature respects repository visibility: labels on public repositories are viewable by anyone, while labels on private repositories require appropriate read access.

## Acceptance Criteria

- [ ] A user with read access to a repository can retrieve a specific label by its ID.
- [ ] The endpoint `GET /api/repos/:owner/:repo/labels/:id` returns a JSON object representing the label.
- [ ] The response object contains `id` (number), `repository_id` (number), `name` (string), `color` (string in `#rrggbb` lowercase hex format), `description` (string), `created_at` (ISO 8601 string), and `updated_at` (ISO 8601 string).
- [ ] The response HTTP status is `200 OK` on success.
- [ ] The `owner` and `repo` path parameters are case-insensitive (resolved via lowercase trimming).
- [ ] The `:id` path parameter must be a valid positive integer. An ID of `0` or negative returns `400 Bad Request` with message "invalid label id".
- [ ] A non-numeric `:id` path parameter returns `400 Bad Request` with message "invalid label id".
- [ ] An empty or missing `:id` path parameter returns `400 Bad Request` with message "label id is required".
- [ ] An empty or whitespace-only `owner` parameter returns `400 Bad Request` with message "owner is required".
- [ ] An empty or whitespace-only `repo` parameter returns `400 Bad Request` with message "repository name is required".
- [ ] Requesting a label ID that does not exist within the repository returns `404 Not Found` with message "label not found".
- [ ] Requesting a label ID that exists in a different repository but not in the requested repository returns `404 Not Found` with message "label not found" (no cross-repository label leakage).
- [ ] An unauthenticated request to view a label on a public repository succeeds with `200`.
- [ ] An unauthenticated request to view a label on a private repository returns `403 Forbidden`.
- [ ] An authenticated user without any access to a private repository receives `403 Forbidden`.
- [ ] An authenticated user with read, write, or admin access to a private repository succeeds with `200`.
- [ ] The repository owner always succeeds.
- [ ] An organization owner always succeeds for org-owned repositories.
- [ ] A team member with read or higher permission succeeds for team-assigned repositories.
- [ ] A collaborator with read or higher permission succeeds.
- [ ] Viewing a label on a non-existent repository returns `404 Not Found` with message "repository not found".
- [ ] The response label name preserves the original casing, whitespace, emoji, and special characters exactly as stored.
- [ ] The response color is always in normalized `#rrggbb` lowercase hex format regardless of how it was originally created.
- [ ] The `created_at` and `updated_at` timestamps are valid ISO 8601 strings in UTC.
- [ ] After a label is updated (name, color, or description changed), viewing that label returns the updated values and an `updated_at` timestamp that is ≥ the previous `updated_at`.
- [ ] The CLI command `codeplane label view <id>` outputs the label object in structured JSON format when `--json` is passed.
- [ ] The CLI command supports `--repo OWNER/REPO` to specify the target repository, or resolves from the current working directory context.
- [ ] Shell completions (bash, zsh, fish) include `view` as a subcommand of `label`.
- [ ] Very large label IDs (up to `2^63 - 1`) are handled without overflow. IDs exceeding `2^63 - 1` return `400 Bad Request`.
- [ ] The label view reflects the current state — if the label was recently updated, the view returns the latest data immediately.

**Definition of Done**: The feature is complete when users can retrieve any single label by ID for any accessible repository via the API, CLI, TUI, and web UI, with correct permission enforcement, proper error handling for invalid/missing IDs, repository-scoped label isolation, normalized color values, and a consistent response shape. All client surfaces that display individual label details use this endpoint correctly.

## Design

### API Shape

**Get a single label for a repository:**

```
GET /api/repos/:owner/:repo/labels/:id
Authorization: Bearer <token>  (optional for public repos)
```

**Path parameters:**

| Parameter | Type    | Description |
|-----------|---------|-------------|
| `owner`   | string  | Repository owner (user or org). Case-insensitive. |
| `repo`    | string  | Repository name. Case-insensitive. |
| `id`      | integer | Label ID. Must be a positive integer. |

**Success response:** `200 OK`

```json
{
  "id": 1,
  "repository_id": 7,
  "name": "bug",
  "color": "#d73a4a",
  "description": "Something isn't working",
  "created_at": "2026-01-15T10:30:00.000Z",
  "updated_at": "2026-01-15T10:30:00.000Z"
}
```

**Response fields:**

| Field           | Type   | Description |
|-----------------|--------|-------------|
| `id`            | number | Unique label identifier within the repository. |
| `repository_id` | number | ID of the repository this label belongs to. |
| `name`          | string | The label name (1–255 characters, preserves original casing and characters). |
| `color`         | string | Hex color code in `#rrggbb` lowercase format. |
| `description`   | string | Human-readable description. May be empty string. |
| `created_at`    | string | ISO 8601 timestamp of creation (UTC). |
| `updated_at`    | string | ISO 8601 timestamp of last modification (UTC). |

**Error responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400    | ID missing | `{ "message": "label id is required" }` |
| 400    | ID non-numeric, zero, or negative | `{ "message": "invalid label id" }` |
| 400    | Empty owner | `{ "message": "owner is required" }` |
| 400    | Empty repo | `{ "message": "repository name is required" }` |
| 403    | Private repo, no access | `{ "message": "permission denied" }` |
| 404    | Repository not found | `{ "message": "repository not found" }` |
| 404    | Label not found in this repository | `{ "message": "label not found" }` |

### SDK Shape

The `LabelService` class in `@codeplane/sdk` exposes:

```typescript
async getLabel(
  viewer: AuthUser | null,
  owner: string,
  repo: string,
  id: number,
): Promise<LabelResponse>
```

The method:
1. Validates that `id` is a positive integer (throws `badRequest("invalid label id")` if `id <= 0`).
2. Resolves the repository by owner and lowercase name (throws `notFound("repository not found")` or `badRequest` for invalid owner/repo).
3. Checks read access (throws `forbidden("permission denied")` for private repos without access).
4. Fetches the label by ID scoped to the resolved repository (throws `notFound("label not found")` if absent).
5. Maps and returns the `LabelResponse`.

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
codeplane label view <id> [--repo OWNER/REPO] [--json]
```

**Behavior:**
- `<id>` is a required positional argument — the label ID to retrieve.
- If `--repo` is omitted, the CLI resolves the repository from the current working directory context (e.g., jj or git remote).
- Calls `GET /api/repos/:owner/:repo/labels/:id` using the configured API URL and auth token.
- Default output is a human-readable key-value display showing name, color (with terminal color swatch if supported), description, and timestamps.
- When `--json` is passed, outputs the raw JSON object.
- Exit code 0 on success, non-zero on error (with error message printed to stderr).

**Human-readable output format:**
```
Label #1
  Name:        bug
  Color:       ● #d73a4a
  Description: Something isn't working
  Created:     2026-01-15T10:30:00.000Z
  Updated:     2026-01-15T10:30:00.000Z
```

**Shell completions:**
- Bash: `label` subcommand includes `view` in completions.
- Zsh: `label` subcommand includes `view` via `_values`.
- Fish: `label` subcommand includes `view` with description "View a specific label".

### TUI UI

The TUI should support navigating to a single-label detail view from any context where labels are displayed (e.g., issue detail, label list if added). The detail view shows:
- Label name as a bold header.
- Color swatch rendered using the terminal-appropriate color tier (truecolor → ANSI 256 → ANSI 16).
- Description text (or "No description" in muted text if empty).
- Created and updated timestamps.
- Keyboard shortcut `q` or `Esc` to return to the previous screen.

When `NO_COLOR=1` is set, the color swatch is replaced with the hex value as plain text.

### Web UI Design

The web UI should display label details in the following contexts:

**Label detail panel (from labels management page):**
- Clicking a label name in the labels list opens a detail panel or navigates to a detail view.
- The detail view shows:
  - A large color swatch circle rendered in the label's hex color.
  - The label name displayed prominently in bold.
  - The description text (or "No description provided" in muted/italic text if empty).
  - "Created" and "Last updated" human-friendly relative timestamps (e.g., "3 days ago") with full ISO 8601 on hover tooltip.
  - Action buttons for "Edit" and "Delete" (visible only to users with write access).
- A breadcrumb showing: `Repository → Labels → [label name]`.

**Label badge tooltip (inline in issues, landing requests):**
- Hovering over a label badge in any context shows a tooltip with the label's description, color hex value, and a link to view the label detail page.

**Error states:**
- If the label ID is invalid or not found, the web UI displays a "Label not found" message with a link back to the labels list.
- If the user does not have access to the repository, the standard access-denied page is shown.

### Documentation

End-user documentation should include:

- **API reference**: Document the `GET /api/repos/:owner/:repo/labels/:id` endpoint with path parameters, response shape, all error codes and messages, and an example `curl` command.
- **CLI reference**: Document `codeplane label view` including the positional `<id>` argument, `--repo` option, `--json` flag, and examples.
- **Guide**: The "Managing Labels" guide should include a "Viewing a label" section explaining how to inspect a single label from the web UI, CLI, and TUI, with examples.

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
- Unauthenticated requests: lower rate limit tier to prevent label enumeration on public repos.
- No additional per-endpoint rate limiting is required beyond the platform default.

### Data Privacy

- Label data (name, color, description) is not PII.
- No user-specific data is included in the label response.
- Private repository labels are gated behind read access, preventing information leakage about private repository taxonomy to unauthorized parties.
- Repository existence is not leaked: requests to non-existent repositories return 404 regardless of authentication state.
- Label ID enumeration across repositories is prevented by scoping the lookup to the specific `(repository_id, id)` pair — requesting a valid label ID from a different repository returns 404.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `LabelViewed` | User successfully retrieves a single label | `repository_id`, `owner`, `repo`, `label_id`, `label_name`, `viewer_id` (nullable for anonymous), `client` |

### Event Properties Detail

- `repository_id` (number): The internal ID of the repository.
- `owner` (string): The repository owner name.
- `repo` (string): The repository name.
- `label_id` (number): The ID of the viewed label.
- `label_name` (string): The name of the viewed label.
- `viewer_id` (number | null): The authenticated user's ID, or null for anonymous access.
- `client` (string): The client surface that initiated the request (derived from User-Agent or explicit client header: `web`, `cli`, `tui`, `api`, `vscode`, `neovim`).

### Funnel Metrics and Success Indicators

- **Label view usage rate**: Number of `LabelViewed` events per day, broken down by client type. Indicates which surfaces users prefer for label inspection.
- **Label view → Label update conversion**: Funnel from viewing a label to updating it within the same session. Indicates whether the view is an effective entry point for label editing.
- **Label view → Issue label add conversion**: Funnel from viewing a label to adding it to an issue. Indicates whether users view labels to discover and then apply them.
- **Label view 404 rate**: Percentage of `GET /api/repos/:owner/:repo/labels/:id` requests that return 404. A high rate suggests stale references or broken links in clients.
- **Client distribution**: Breakdown of label view requests by client type (web, CLI, TUI, API/agent). Indicates which surfaces are most used for label inspection.
- **Referrer analysis**: When viewed from the web UI, track the referrer page (issue detail, labels list, landing request) to understand which contexts drive single-label inspection.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Notes |
|-----------|-------|--------------------|-------|
| Label view request received | DEBUG | `owner`, `repo`, `label_id`, `viewer_id` | Entry point log |
| Repository resolved | DEBUG | `repository_id`, `owner`, `repo`, `is_public` | Confirms repo lookup succeeded |
| Access denied (private repo) | WARN | `repository_id`, `viewer_id`, `reason` | Logged at WARN for security audit trail |
| Repository not found | INFO | `owner`, `repo` | Expected error path |
| Label not found | INFO | `repository_id`, `label_id` | Expected error path — may indicate stale references |
| Invalid label ID parameter | INFO | `owner`, `repo`, `raw_id` | Client sent non-numeric or invalid ID |
| Label fetched successfully | DEBUG | `repository_id`, `label_id`, `label_name`, `duration_ms` | Success with timing |
| Unexpected error | ERROR | `owner`, `repo`, `label_id`, `error_message`, `stack_trace` | Catch-all for internal errors |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_label_view_requests_total` | Counter | `status` (200, 400, 403, 404, 500), `auth` (authenticated, anonymous) | Total label view requests by status and auth type |
| `codeplane_label_view_duration_seconds` | Histogram | `status` | Request duration histogram (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |

### Alerts

#### Alert: High Label View Error Rate

**Condition**: `rate(codeplane_label_view_requests_total{status="500"}[5m]) / rate(codeplane_label_view_requests_total[5m]) > 0.05`

**Severity**: Warning

**Runbook**:
1. Check the server logs for ERROR-level entries related to label view operations. Filter by `label_view` or `getLabel` context.
2. Look for database connectivity issues — the label view requires a single SELECT query against the `labels` table. Check `pg_stat_activity` for connection pool exhaustion.
3. Verify the `labels` table is accessible and not locked by a long-running migration, vacuum, or DDL operation.
4. Check if the error is isolated to a specific repository (look at `repository_id` in structured logs). If so, investigate that repository's label table state.
5. If the error rate is cluster-wide, check for recent deployments that may have introduced a regression in the label service, route handler, or SDK `mapLabel` function.
6. Verify that the `parseInt64Param` helper is not throwing unexpected errors on well-formed IDs.
7. Escalate to the platform team if database-level issues are confirmed.

#### Alert: Label View Latency Spike

**Condition**: `histogram_quantile(0.95, rate(codeplane_label_view_duration_seconds_bucket[5m])) > 0.5`

**Severity**: Warning

**Runbook**:
1. Check if the latency spike correlates with overall database latency increases (compare with other endpoint latencies).
2. Examine slow query logs for the `getLabelByID` query. The query should be a simple indexed lookup — if it's slow, check the index on `(repository_id, id)`.
3. Check whether the latency is in the repo resolution step (which involves a join) or the label fetch step.
4. Verify connection pool metrics are healthy and not saturated.
5. If isolated to specific repositories, check whether those repos have an unusually high volume of concurrent requests.
6. If persistent, consider adding query-level timeouts as a safety measure.

#### Alert: Elevated 404 Rate on Label View

**Condition**: `rate(codeplane_label_view_requests_total{status="404"}[15m]) / rate(codeplane_label_view_requests_total[15m]) > 0.3`

**Severity**: Info

**Runbook**:
1. A high 404 rate on label view typically indicates stale references — clients or cached links pointing to deleted labels.
2. Check structured logs for the most common `(repository_id, label_id)` pairs returning 404. If concentrated on specific labels, those labels were likely recently deleted.
3. Verify whether the web UI or other clients are caching label IDs that have since been removed. If so, the client cache invalidation logic may need improvement.
4. If the 404s correspond to non-existent repository paths, this may indicate URL scanning rather than legitimate usage.
5. No immediate action is required unless the pattern indicates a systematic client bug.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Error Message | Recovery |
|------------|-------------|---------------|----------|
| Label ID is missing | 400 | "label id is required" | Client should provide a label ID |
| Label ID is non-numeric | 400 | "invalid label id" | Client should provide a valid integer ID |
| Label ID is zero or negative | 400 | "invalid label id" | Client should provide a positive integer ID |
| Label ID exceeds int64 range | 400 | "invalid label id" | Client should use a valid ID within range |
| Repository not found | 404 | "repository not found" | Client should verify owner/repo spelling |
| Owner parameter empty | 400 | "owner is required" | Client should provide a valid owner |
| Repo parameter empty | 400 | "repository name is required" | Client should provide a valid repo name |
| Label not found in repository | 404 | "label not found" | Label may have been deleted; client should refresh label list |
| Private repo, no auth | 403 | "permission denied" | User should authenticate |
| Private repo, insufficient access | 403 | "permission denied" | User should request access from repo owner |
| Database connection failure | 500 | "internal server error" | Retry after delay; check DB health |

## Verification

### API Integration Tests

#### Happy Path

- [ ] **View a label on a public repo (unauthenticated)**: Create a public repo, create a label "bug" with color `#d73a4a` and description "Something isn't working". Call `GET /api/repos/:owner/:repo/labels/:id` without auth. Assert 200, response contains all fields with correct values: `id` (number), `repository_id` (number), `name` = "bug", `color` = "#d73a4a", `description` = "Something isn't working", `created_at` (valid ISO 8601), `updated_at` (valid ISO 8601).
- [ ] **View a label on a public repo (authenticated)**: Same as above but with a valid token. Assert 200 with identical response shape.
- [ ] **View a label on a private repo (authenticated with read access)**: Create a private repo, add a collaborator with read access, create a label. Call as the collaborator. Assert 200.
- [ ] **View a label as repo owner**: Create a private repo as user A, create a label. Call as user A. Assert 200.
- [ ] **View a label as org owner**: Create an org, create a repo under the org, create a label. Call as the org owner. Assert 200.
- [ ] **View a label as team member with read permission**: Create an org repo, assign a team with read access, create a label. Call as a team member. Assert 200.
- [ ] **View a label as collaborator with write permission**: Add a collaborator with write access. Call as the collaborator. Assert 200.
- [ ] **View a label as collaborator with admin permission**: Add a collaborator with admin access. Call as the collaborator. Assert 200.
- [ ] **Response field types are correct**: Assert `id` is a number, `repository_id` is a number, `name` is a string, `color` matches regex `/#[0-9a-f]{6}/`, `description` is a string, `created_at` and `updated_at` are parseable as valid ISO 8601 dates.
- [ ] **View a recently updated label returns latest state**: Create a label "old-name" with color `#000000`. Update it to "new-name" with color `#ffffff`. View the label. Assert `name` = "new-name", `color` = "#ffffff", and `updated_at` >= `created_at`.
- [ ] **Color normalization is applied**: Create a label with color `D73A4A` (uppercase, no hash). View it. Assert `color` = `#d73a4a`.

#### Boundary Constraints

- [ ] **View a label with 255-character name**: Create a label with a 255-character name. View it. Assert the full 255-character name is returned faithfully.
- [ ] **View a label with special characters in name**: Create a label named `"🐛 bug / priority: high ★"`. View it. Assert the name is returned exactly.
- [ ] **View a label with empty description**: Create a label with description `""`. View it. Assert `description` is `""`.
- [ ] **View a label with very long description**: Create a label with a multi-sentence description (500+ characters). View it. Assert the full description is returned.
- [ ] **View a label with unicode in description**: Create a label with description containing CJK characters, Arabic text, and emoji. View it. Assert the description is returned faithfully.
- [ ] **View a label with maximum valid ID**: Create a label, then request its actual ID. Assert the endpoint handles the ID correctly.
- [ ] **Request label ID at int64 boundary (2^63 - 1)**: Call `GET /api/repos/:owner/:repo/labels/9223372036854775807`. Assert either 404 (label not found) or 400 (if the value cannot be handled). Must not cause a server error.
- [ ] **Request label ID exceeding int64 boundary (2^63)**: Call `GET /api/repos/:owner/:repo/labels/9223372036854775808`. Assert 400 "invalid label id".

#### ID Validation

- [ ] **Label ID is 0**: Call `GET /api/repos/:owner/:repo/labels/0`. Assert 400 "invalid label id".
- [ ] **Label ID is negative**: Call `GET /api/repos/:owner/:repo/labels/-1`. Assert 400 "invalid label id".
- [ ] **Label ID is non-numeric string**: Call `GET /api/repos/:owner/:repo/labels/abc`. Assert 400 "invalid label id".
- [ ] **Label ID is floating point**: Call `GET /api/repos/:owner/:repo/labels/1.5`. Assert 400 "invalid label id".
- [ ] **Label ID has leading zeros**: Call `GET /api/repos/:owner/:repo/labels/001` (where label 1 exists). Assert either 200 (if parsed as 1) or 400, depending on parser behavior. Document actual behavior.

#### Cross-Repository Isolation

- [ ] **Label ID from different repo returns 404**: Create repo A with label (ID = X). Create repo B with no labels. Call `GET /api/repos/:ownerB/:repoB/labels/X`. Assert 404 "label not found".
- [ ] **Same label name in different repos have different IDs**: Create label "bug" in repo A and repo B. View each. Assert they have different IDs and different `repository_id` values.

#### Permission Tests

- [ ] **Unauthenticated on private repo**: Create a private repo with a label. Call without auth. Assert 403.
- [ ] **Authenticated user with no repo access on private repo**: Create a private repo with a label. Call as a user who is not a collaborator. Assert 403.
- [ ] **Correct label data is not leaked in 403 response**: When 403 is returned, assert the response body does not contain any label data (name, color, description).
- [ ] **Correct label data is not leaked in 404 response for repo not found**: When 404 is returned for a non-existent repo, assert the response does not contain label metadata.

#### Error Handling

- [ ] **Non-existent repository**: Call `GET /api/repos/alice/nonexistent/labels/1`. Assert 404 with message "repository not found".
- [ ] **Non-existent owner**: Call `GET /api/repos/nobody/somerepo/labels/1`. Assert 404 with message "repository not found".
- [ ] **Label deleted between create and view**: Create a label, delete it, then attempt to view it. Assert 404 "label not found".
- [ ] **Owner is case-insensitive**: Create repo as `Alice/MyRepo`, create a label. Call `GET /api/repos/alice/myrepo/labels/:id`. Assert 200.

### CLI E2E Tests

- [ ] **`codeplane label view <id>` returns label details**: Create a repo, create a label "bug" with color `d73a4a` and description "Something is broken". Run `codeplane label view <id> --repo OWNER/REPO --json`. Assert the output is a JSON object with correct `name`, `color` (`#d73a4a`), `description`, and timestamps.
- [ ] **`codeplane label view` with non-existent ID**: Run `codeplane label view 999999 --repo OWNER/REPO --json`. Assert non-zero exit code and error output containing "not found".
- [ ] **`codeplane label view` with invalid ID**: Run `codeplane label view abc --repo OWNER/REPO`. Assert non-zero exit code and error output.
- [ ] **`codeplane label view` with invalid repo**: Run `codeplane label view 1 --repo nonexistent/repo --json`. Assert non-zero exit code and error output.
- [ ] **`codeplane label view` resolves repo from context**: From within a cloned repo directory, create a label and then run `codeplane label view <id> --json` without `--repo`. Assert it resolves the repo and returns the label.
- [ ] **`codeplane label view` human-readable output includes all fields**: Run `codeplane label view <id> --repo OWNER/REPO` (without `--json`). Assert output contains the label name, color hex value, description, and timestamps.

### Playwright (Web UI) E2E Tests

- [ ] **Label detail page renders correctly**: Navigate to the label detail page for a label with name "bug", color `#d73a4a`, and description "Something isn't working". Assert the page shows the color swatch, name, description, and timestamps.
- [ ] **Label detail page shows empty description gracefully**: Navigate to the label detail page for a label with an empty description. Assert the page shows "No description provided" or equivalent placeholder text.
- [ ] **Label detail page shows edit/delete buttons for users with write access**: Authenticate as a user with write access. Navigate to label detail. Assert "Edit" and "Delete" action buttons are visible.
- [ ] **Label detail page hides edit/delete buttons for read-only users**: Authenticate as a user with read-only access. Navigate to label detail. Assert "Edit" and "Delete" buttons are not visible.
- [ ] **Label detail page handles non-existent label**: Navigate to a label detail URL with a non-existent ID. Assert a "Label not found" message is displayed with a link back to the labels list.
- [ ] **Label detail is accessible via click from labels list**: Navigate to the labels list page, click a label name. Assert the label detail view loads with correct data.
- [ ] **Label badge tooltip shows description**: Hover over a label badge on an issue. Assert a tooltip appears showing the label description.
- [ ] **Label detail page is inaccessible on private repo without auth**: Navigate to label detail of a private repo while unauthenticated. Assert access is denied.
- [ ] **Label color swatch renders correctly**: Create a label with color `#ff0000`. Navigate to its detail page. Assert the color swatch element has the correct hex color applied.
- [ ] **Breadcrumb navigation works**: On the label detail page, assert a breadcrumb like "Repository → Labels → bug" is displayed. Click "Labels" in the breadcrumb. Assert navigation returns to the labels list.

### Performance / Scale Tests

- [ ] **Single label view responds within 100ms**: Create a label. Call `GET /api/repos/:owner/:repo/labels/:id`. Assert response time < 100ms.
- [ ] **Label view in a repo with 500 labels responds within 100ms**: Create 500 labels. View one specific label by ID. Assert response time < 100ms (the query is ID-indexed and should not scan all labels).
- [ ] **Concurrent label views under load**: Send 100 concurrent `GET` requests for the same label. Assert all return 200 with consistent data and no errors.
