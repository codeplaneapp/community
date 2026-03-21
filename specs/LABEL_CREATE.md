# LABEL_CREATE

Specification for LABEL_CREATE.

## High-Level User POV

Labels are a fundamental organizational tool in Codeplane that help teams categorize and filter issues within a repository. When a user creates a label, they are defining a reusable tag — consisting of a name, a color, and an optional description — that can be applied to any issue in that repository to signal its type, priority, status, or any other categorization the team needs.

Creating a label is a repository-level action. A user with write access navigates to their repository's label management area (through the settings page, the issue sidebar, or the CLI) and provides a short name such as "bug" or "enhancement," picks a hex color to give the label visual identity, and optionally writes a brief description explaining what the label means. Once created, the label immediately becomes available for use on any issue in that repository. Collaborators can see the new label in issue creation forms, in the issue sidebar label picker, and in filtered issue views.

The value of label creation is straightforward: it gives teams a shared vocabulary for organizing work. Without labels, issues become an undifferentiated list. With labels, teams can build workflows around categories like severity, component area, effort size, or workflow stage. Because labels are scoped to a single repository, different projects can maintain their own taxonomy without interfering with each other.

## Acceptance Criteria

- A user with write access to a repository can create a new label by providing a name and a color.
- The label name is required, must not be empty after trimming whitespace, and must not exceed 255 characters.
- The label color is required, must be a valid 6-character hexadecimal string (characters 0–9 and a–f, case-insensitive), and may optionally include a leading `#` which is stripped before validation.
- The label description is optional and may be an empty string.
- Leading and trailing whitespace on the name is trimmed before storage.
- The color is normalized to lowercase with a `#` prefix (e.g., input `D73A4A` is stored as `#d73a4a`).
- Label names must be unique within a repository. Attempting to create a label with a name that already exists in the same repository returns a 409 Conflict error with the message "label already exists."
- Unauthenticated requests are rejected with a 401 Unauthorized error.
- Authenticated users without write access to the repository are rejected with a 403 Forbidden error.
- Requests targeting a non-existent repository return a 404 Not Found error.
- A malformed or unparseable JSON request body returns a 400 Bad Request error.
- A missing or empty name returns a 422 Validation Failed error with `{ resource: "Label", field: "name", code: "missing_field" }`.
- A name exceeding 255 characters returns a 422 Validation Failed error with `{ resource: "Label", field: "name", code: "invalid" }`.
- A missing or empty color returns a 422 Validation Failed error with `{ resource: "Label", field: "color", code: "missing_field" }`.
- A color that is not exactly 6 hex characters (after stripping `#`) returns a 422 Validation Failed error with `{ resource: "Label", field: "color", code: "invalid" }`.
- A color containing non-hex characters (e.g., `gggggg`, `zz00ff`) returns a 422 Validation Failed error with `{ resource: "Label", field: "color", code: "invalid" }`.
- On successful creation, the response includes the label's `id`, `repository_id`, `name`, `color` (normalized with `#` prefix), `description`, `created_at`, and `updated_at` timestamps.
- The response status code for successful creation is 201 Created.
- The newly created label is immediately available for listing and for attachment to issues.
- The CLI `label create` command accepts a positional `name` argument, `--color` option, `--description` option, and `--repo` option to specify the repository.
- **Definition of Done**: the feature is complete when the API endpoint, CLI command, and all acceptance criteria are covered by passing integration/E2E tests.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/labels`

**Path Parameters:**
- `owner` — Repository owner username or organization name
- `repo` — Repository name

**Request Headers:**
- `Content-Type: application/json` (enforced by middleware)
- `Authorization: Bearer <PAT>` or session cookie

**Request Body:**
```json
{
  "name": "bug",
  "color": "d73a4a",
  "description": "Something is broken"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `name` | string | Yes | 1–255 characters after trimming; unique per repository |
| `color` | string | Yes | 6 hex chars (0-9, a-f); leading `#` optional and stripped |
| `description` | string | Yes (may be `""`) | No length limit enforced |

**Success Response (201 Created):**
```json
{
  "id": 42,
  "repository_id": 7,
  "name": "bug",
  "color": "#d73a4a",
  "description": "Something is broken",
  "created_at": "2026-03-22T12:00:00.000Z",
  "updated_at": "2026-03-22T12:00:00.000Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|---|---|---|
| 400 | Malformed JSON body | `{ "message": "invalid request body" }` |
| 401 | No authentication | `{ "message": "authentication required" }` |
| 403 | Insufficient permissions | `{ "message": "permission denied" }` |
| 404 | Repository not found | `{ "message": "repository not found" }` |
| 409 | Duplicate label name | `{ "message": "label already exists" }` |
| 422 | Validation error | `{ "message": "validation failed", "errors": [{ "resource": "Label", "field": "<field>", "code": "missing_field" or "invalid" }] }` |
| 500 | Unexpected server error | `{ "message": "failed to create label" }` |

### SDK Shape

The `LabelService` class from `@codeplane/sdk` exposes:

```typescript
createLabel(
  actor: AuthUser | null,
  owner: string,
  repo: string,
  req: { name: string; color: string; description: string }
): Promise<LabelResponse>
```

Where `LabelResponse` is:
```typescript
{
  id: number;
  repository_id: number;
  name: string;
  color: string;       // Always "#xxxxxx"
  description: string;
  created_at: string;  // ISO 8601
  updated_at: string;  // ISO 8601
}
```

### CLI Command

**Command:** `codeplane label create <name> [options]`

**Arguments:**
- `<name>` — The label name (positional, required)

**Options:**
- `--color <hex>` — Label color as a 6-character hex string (default: `""`, which will trigger a server-side validation error if not provided)
- `--description <text>` — Label description (default: `""`)
- `--repo <OWNER/REPO>` — Target repository; if omitted, resolved from the current working directory's jj/git context

**Output:** JSON object of the created label on success. Error message on failure.

**Examples:**
```bash
# Create a bug label with color and description
codeplane label create bug --color d73a4a --description "Something is broken"

# Create a label with # prefix on color (stripped automatically by server)
codeplane label create enhancement --color "#a2eeef" --description "New feature"

# Create a label in a specific repo
codeplane label create "needs review" --color 0075ca --repo myorg/myproject
```

### Web UI Design

Label creation in the web UI is accessible from the repository's label management settings page (at `/:owner/:repo/settings/labels`) and from inline "create a label" links within the issue label picker when no labels exist.

The creation form presents:
1. **Name input** — Text field, placeholder "Label name", max 255 characters.
2. **Description input** — Text field, placeholder "Description (optional)".
3. **Color picker** — A hex color input showing a swatch preview. Users can type a hex value or use a visual color picker. The `#` prefix is shown in the input but stripped before sending to the API.
4. **Submit button** — "Create label" button, disabled until name and color are non-empty.

On successful creation, the new label appears in the label list immediately. On validation errors, inline error messages appear next to the offending field. On conflict (duplicate name), a toast or inline error reads "A label with this name already exists."

### TUI UI

The TUI does not currently expose a dedicated label creation screen. Label management is available through the CLI. If a label creation flow is added to the TUI, it should present a form with name, color (hex input), and description fields, with inline validation matching the API constraints.

### Documentation

End-user documentation should cover:

- **Concept page: Labels** — Explain what labels are, that they are repository-scoped, and their role in organizing issues.
- **How-to: Create a label via CLI** — Show `codeplane label create` usage with examples.
- **How-to: Create a label via API** — Show the `POST /api/repos/:owner/:repo/labels` endpoint with a curl example.
- **Reference: Label API** — Full endpoint reference including request/response shapes and all error codes.
- **Reference: CLI label commands** — Argument/option table for `label create`, `label list`, `label delete`.

## Permissions & Security

### Authorization Matrix

| Role | Can Create Labels? |
|---|---|
| Repository Owner | ✅ Yes |
| Organization Owner (for org repo) | ✅ Yes |
| Admin Collaborator | ✅ Yes |
| Write Collaborator | ✅ Yes |
| Read Collaborator | ❌ No (403) |
| Unauthenticated | ❌ No (401) |
| Authenticated, no repo access | ❌ No (403) |

### Rate Limiting

- Label creation is subject to the server's global rate limiting middleware applied to all mutation endpoints.
- A per-user burst limit of **30 label creation requests per minute per repository** is recommended to prevent automated abuse (e.g., a script flooding a repo with thousands of labels).

### Data Privacy

- Label names, colors, and descriptions are repository-scoped metadata. They are visible to anyone who can read the repository (including unauthenticated users for public repositories).
- No PII is expected in label fields, but since users may type arbitrary text into the description field, labels inherit the repository's visibility scope. Private repository labels are not exposed to unauthorized viewers.
- Label creation does not involve secrets, tokens, or credentials.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `LabelCreated` | Successful label creation | `repository_id`, `label_id`, `label_name`, `label_color`, `actor_id`, `has_description` (boolean), `client` ("api" / "cli" / "web" / "tui"), `timestamp` |

### Funnel Metrics

- **Label adoption rate**: Percentage of repositories that have at least one user-created label.
- **Labels per repository**: Distribution of label counts across repositories, measured as a histogram.
- **Label-to-issue attachment rate**: Of created labels, what percentage are actually attached to at least one issue within 7 days?
- **Time from repo creation to first label**: How quickly do teams start organizing with labels?
- **Label creation errors**: Ratio of failed label creation attempts to successful ones, broken down by error type (validation, conflict, permission).

### Success Indicators

- Increasing label adoption rate indicates the feature is discoverable and useful.
- A high label-to-issue attachment rate indicates labels are being used, not just created.
- A low error rate on creation indicates the UI and CLI guide users toward valid inputs effectively.

## Observability

### Logging Requirements

| Event | Log Level | Structured Fields |
|---|---|---|
| Label created successfully | `info` | `event: "label.created"`, `repository_id`, `label_id`, `label_name`, `actor_id`, `duration_ms` |
| Label creation failed — validation | `warn` | `event: "label.create_failed"`, `reason: "validation"`, `field`, `code`, `repository_id`, `actor_id` |
| Label creation failed — conflict | `warn` | `event: "label.create_failed"`, `reason: "conflict"`, `label_name`, `repository_id`, `actor_id` |
| Label creation failed — permission | `warn` | `event: "label.create_failed"`, `reason: "forbidden"`, `repository_id`, `actor_id` |
| Label creation failed — unauthenticated | `info` | `event: "label.create_failed"`, `reason: "unauthenticated"` |
| Label creation failed — internal error | `error` | `event: "label.create_failed"`, `reason: "internal"`, `repository_id`, `actor_id`, `error_message` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_label_creates_total` | Counter | `status` (success / error), `error_type` (validation / conflict / forbidden / unauthenticated / internal) | Total label creation attempts |
| `codeplane_label_create_duration_seconds` | Histogram | — | Time taken to process a label creation request end-to-end |
| `codeplane_labels_per_repo` | Gauge | `repository_id` | Current number of labels in a repository (updated on create/delete) |

### Alerts

#### Alert: High Label Creation Error Rate
- **Condition:** `rate(codeplane_label_creates_total{status="error", error_type="internal"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `event: "label.create_failed"` with `reason: "internal"` to identify the root cause.
  2. Look for database connection issues — the most common cause is DB pool exhaustion or a connectivity problem.
  3. Check if the `labels` table has any schema drift or if a recent migration failed.
  4. Verify the unique constraint on `(repository_id, name)` still exists — a dropped constraint could cause silent data corruption instead of a proper 409 response.
  5. If the error is a transient DB issue, monitor for auto-recovery. If persistent, check PGLite/Postgres health and restart the server if needed.

#### Alert: Label Creation Latency Spike
- **Condition:** `histogram_quantile(0.99, rate(codeplane_label_create_duration_seconds_bucket[5m])) > 2`
- **Severity:** Warning
- **Runbook:**
  1. Check database query latency — run `EXPLAIN ANALYZE` on the `INSERT INTO labels` query.
  2. Look for table bloat or missing indexes on the `labels` table.
  3. Check if the unique constraint index on `(repository_id, name)` is healthy.
  4. Review server resource utilization (CPU, memory, DB connections).
  5. If isolated to one repository, check if that repository has an unusually large number of labels causing index pressure.

#### Alert: Unusual Label Creation Volume
- **Condition:** `rate(codeplane_label_creates_total{status="success"}[5m]) > 10`
- **Severity:** Info
- **Runbook:**
  1. This may indicate automated label seeding (legitimate) or abuse.
  2. Check if the volume is concentrated on one repository/user by examining structured logs.
  3. If it's a single actor creating hundreds of labels, consider whether rate limiting needs tightening.
  4. If it's distributed across many users/repos, it may indicate a product event (e.g., a tutorial going viral) — no action needed.

### Error Cases and Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Recovery |
|---|---|---|---|
| Empty label name | 422 | Validation failed — name missing | User provides a non-empty name |
| Name too long (>255 chars) | 422 | Validation failed — name invalid | User shortens the name |
| Empty color | 422 | Validation failed — color missing | User provides a valid hex color |
| Invalid hex color | 422 | Validation failed — color invalid | User corrects the color format |
| Duplicate name in repo | 409 | Label already exists | User chooses a different name or updates the existing label |
| Not authenticated | 401 | Authentication required | User logs in or provides a valid PAT |
| No write access | 403 | Permission denied | User requests write access from a repo admin |
| Repository not found | 404 | Repository not found | User verifies the owner/repo path |
| Malformed JSON | 400 | Invalid request body | User fixes the request payload |
| Database unreachable | 500 | Failed to create label | Ops team investigates DB connectivity |
| Unexpected DB error | 500 | Failed to create label | Ops team investigates via structured logs |

## Verification

### API Integration Tests

1. **Happy path: Create a label with all fields** — POST with valid `name`, `color`, `description`. Assert 201 status. Assert response contains `id` (number), `repository_id` (number), `name` matching input (trimmed), `color` with `#` prefix and lowercase, `description` matching input, `created_at` and `updated_at` as valid ISO 8601 strings.

2. **Color normalization: uppercase hex** — POST with `color: "D73A4A"`. Assert response `color` is `"#d73a4a"`.

3. **Color normalization: with # prefix** — POST with `color: "#a2eeef"`. Assert response `color` is `"#a2eeef"`.

4. **Color normalization: mixed case with # prefix** — POST with `color: "#AbCdEf"`. Assert response `color` is `"#abcdef"`.

5. **Description: empty string** — POST with `description: ""`. Assert 201 and response `description` is `""`.

6. **Name: maximum valid length (255 characters)** — POST with a name that is exactly 255 characters long. Assert 201 and response `name` has length 255.

7. **Name: exceeds maximum length (256 characters)** — POST with a name that is 256 characters long. Assert 422 with `{ resource: "Label", field: "name", code: "invalid" }`.

8. **Name: whitespace trimming** — POST with `name: "  bug  "`. Assert 201 and response `name` is `"bug"`.

9. **Name: all whitespace** — POST with `name: "   "`. Assert 422 with `{ resource: "Label", field: "name", code: "missing_field" }`.

10. **Name: empty string** — POST with `name: ""`. Assert 422 with `{ resource: "Label", field: "name", code: "missing_field" }`.

11. **Color: empty string** — POST with `color: ""`. Assert 422 with `{ resource: "Label", field: "color", code: "missing_field" }`.

12. **Color: too short (5 chars)** — POST with `color: "d73a4"`. Assert 422 with `{ resource: "Label", field: "color", code: "invalid" }`.

13. **Color: too long (7 chars without #)** — POST with `color: "d73a4aa"`. Assert 422 with `{ resource: "Label", field: "color", code: "invalid" }`.

14. **Color: non-hex characters** — POST with `color: "gggggg"`. Assert 422 with `{ resource: "Label", field: "color", code: "invalid" }`.

15. **Color: mixed valid/invalid hex** — POST with `color: "zz00ff"`. Assert 422 with `{ resource: "Label", field: "color", code: "invalid" }`.

16. **Color: 3-character shorthand** — POST with `color: "f00"`. Assert 422 (not expanded; must be exactly 6 chars).

17. **Duplicate name: exact match** — Create a label named "bug", then POST again with `name: "bug"`. Assert 409 with message "label already exists".

18. **Duplicate name: case sensitivity** — Create "Bug", then create "bug". Assert behavior based on DB collation and document actual result.

19. **Cross-repository: same name allowed** — Create "bug" in repo A, then create "bug" in repo B. Assert both succeed with 201 (uniqueness is per-repository).

20. **Unauthenticated request** — POST without auth. Assert 401 with message "authentication required".

21. **Read-only collaborator** — POST as a user with only read access. Assert 403 with message "permission denied".

22. **Write collaborator** — POST as a user with write access. Assert 201.

23. **Admin collaborator** — POST as a user with admin access. Assert 201.

24. **Repository owner** — POST as the repository owner. Assert 201.

25. **Organization owner** — POST as the org owner for an org-owned repo. Assert 201.

26. **Non-existent repository** — POST to `/api/repos/nobody/nonexistent/labels`. Assert 404 with message "repository not found".

27. **Malformed JSON body** — POST with body `"not json"`. Assert 400 with message "invalid request body".

28. **Missing body entirely** — POST with no body / empty content. Assert 400.

29. **Label is immediately listable** — Create a label, then GET `/api/repos/:owner/:repo/labels`. Assert the new label appears in the list.

30. **Label is immediately retrievable by ID** — Create a label, then GET `/api/repos/:owner/:repo/labels/:id` using the returned ID. Assert the response matches the creation response.

31. **Created label can be attached to an issue** — Create a label, create an issue, add the label to the issue. Assert the issue's labels include the new label.

32. **Special characters in name** — POST with `name: "won't fix / duplicate"`. Assert 201.

33. **Unicode in name** — POST with `name: "🐛 バグ"`. Assert 201.

34. **Color: all zeros** — POST with `color: "000000"`. Assert 201 and response `color` is `"#000000"`.

35. **Color: all f's** — POST with `color: "ffffff"`. Assert 201 and response `color` is `"#ffffff"`.

### CLI E2E Tests

36. **CLI: Create label with all options** — Run `codeplane label create bug --color d73a4a --description "Something is broken" --repo OWNER/REPO`. Assert JSON output contains `id`, `name: "bug"`, `color: "#d73a4a"`, `description: "Something is broken"`.

37. **CLI: Create label without description** — Run `codeplane label create enhancement --color a2eeef --repo OWNER/REPO`. Assert 201 and description is `""`.

38. **CLI: Create label without color** — Run `codeplane label create test --repo OWNER/REPO`. Assert failure (color defaults to `""`, which triggers a server-side validation error).

39. **CLI: Create duplicate label** — Create "bug" twice via CLI. Assert the second invocation outputs an error indicating the label already exists.

40. **CLI: Verify created label appears in list** — Create a label via CLI, then run `codeplane label list --repo OWNER/REPO`. Assert the created label appears in the output.

41. **CLI: Repo resolution from working directory** — In a directory with jj/git context pointing to a known repo, run `codeplane label create localtest --color 00ff00` without `--repo`. Assert success.

### Playwright (Web UI) E2E Tests

42. **Web: Label creation form renders** — Navigate to `/:owner/:repo/settings/labels`. Assert the create label form is visible with name input, color input, description input, and submit button.

43. **Web: Create label via form** — Fill in name, color, and description in the form and submit. Assert the label appears in the label list on the same page with the correct color swatch.

44. **Web: Inline validation — empty name** — Leave name empty, fill color, click submit. Assert an inline validation error appears on the name field.

45. **Web: Inline validation — invalid color** — Fill name, enter "xyz" as color, click submit. Assert an inline validation error appears on the color field.

46. **Web: Duplicate name error** — Create a label, then try to create another with the same name. Assert a user-visible error message about the label already existing.

47. **Web: Created label available in issue label picker** — Create a label via settings, navigate to an issue, open the label picker. Assert the new label appears in the picker options.

48. **Web: 'No labels — create one' link** — On a repository with zero labels, navigate to issue creation. Assert a "create one" link or message is visible, and clicking it navigates to label creation.
