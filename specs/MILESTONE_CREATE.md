# MILESTONE_CREATE

Specification for MILESTONE_CREATE.

## High-Level User POV

Milestones are a project-management primitive in Codeplane that let teams organize issues around release targets, sprints, or any other time-bounded goal. When a user creates a milestone, they define a named checkpoint — with a title, an optional description, and an optional due date — that can then be associated with issues in the same repository to track progress toward that goal.

Creating a milestone is a repository-level action. A user with write access navigates to their repository's milestone management area (through the settings page, the issues sidebar, or the CLI) and provides a title such as "v1.0" or "Q2 Sprint 3," optionally writes a description explaining the milestone's scope and purpose, and optionally sets a due date to establish a deadline. Once created, the milestone is immediately available for association with any issue in that repository. Collaborators can see the new milestone in issue creation forms, in the issue sidebar milestone picker, and in the milestone listing view.

The value of milestone creation is that it gives teams a way to group related issues under a shared goal with a clear endpoint. Without milestones, teams must track progress toward releases or deliverables externally. With milestones, teams can visualize how much work remains before a release, filter issues by milestone to see what's in scope, and use due dates to maintain accountability against deadlines. Because milestones are scoped to a single repository, different projects can define their own release cadence independently.

## Acceptance Criteria

- A user with write access to a repository can create a new milestone by providing a title.
- The milestone title is required, must not be empty after trimming whitespace, and must not exceed 255 characters.
- Leading and trailing whitespace on the title is trimmed before storage.
- The milestone description is required in the request body but may be an empty string.
- The due date is optional. When provided, it must be a valid ISO 8601 date string parseable by `new Date()`. When omitted or empty, the milestone is created without a due date (stored as `null`).
- An invalid due date string (e.g., `"not-a-date"`, `"2026-13-45"`) returns a 422 Validation Failed error with `{ resource: "Milestone", field: "due_date", code: "invalid" }`.
- Milestone titles must be unique within a repository. Attempting to create a milestone with a title that already exists in the same repository returns a 409 Conflict error with the message "milestone already exists."
- New milestones are created in the `"open"` state by default. There is no way to set the initial state to `"closed"` on creation.
- The `closed_at` field is `null` on creation (since the state is always `"open"`).
- Unauthenticated requests are rejected with a 401 Unauthorized error.
- Authenticated users without write access to the repository are rejected with a 403 Forbidden error.
- Requests targeting a non-existent repository return a 404 Not Found error.
- A malformed or unparseable JSON request body returns a 400 Bad Request error.
- A missing or empty title (after trimming) returns a 422 Validation Failed error with `{ resource: "Milestone", field: "title", code: "missing_field" }`.
- A title exceeding 255 characters returns a 422 Validation Failed error with `{ resource: "Milestone", field: "title", code: "invalid" }`.
- On successful creation, the response includes the milestone's `id`, `repository_id`, `title`, `description`, `state` (always `"open"`), `due_date` (ISO 8601 string or `null`), `closed_at` (`null`), `created_at`, and `updated_at` timestamps.
- The response status code for successful creation is 201 Created.
- The newly created milestone is immediately available for listing, for retrieval by ID, and for association with issues.
- The CLI `milestone create` command accepts a positional `title` argument, `--description` option, `--due-date` option, and `--repo` option.
- **Definition of Done**: the feature is complete when the API endpoint, SDK service method, CLI command, and all acceptance criteria are covered by passing integration/E2E tests.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/milestones`

**Path Parameters:**
- `owner` — Repository owner username or organization name
- `repo` — Repository name

**Request Headers:**
- `Content-Type: application/json` (enforced by middleware)
- `Authorization: Bearer <PAT>` or session cookie

**Request Body:**
```json
{
  "title": "v1.0",
  "description": "First public release",
  "due_date": "2026-06-01T00:00:00.000Z"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `title` | string | Yes | 1–255 characters after trimming; unique per repository |
| `description` | string | Yes (may be `""`) | No maximum length enforced |
| `due_date` | string | No | Valid ISO 8601 date string, or omit entirely |

**Success Response (201 Created):**
```json
{
  "id": 1,
  "repository_id": 7,
  "title": "v1.0",
  "description": "First public release",
  "state": "open",
  "due_date": "2026-06-01T00:00:00.000Z",
  "closed_at": null,
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
| 409 | Duplicate milestone title | `{ "message": "milestone already exists" }` |
| 422 | Validation error | `{ "message": "validation failed", "errors": [{ "resource": "Milestone", "field": "<field>", "code": "missing_field" or "invalid" }] }` |
| 500 | Unexpected server error | `{ "message": "failed to create milestone" }` |

### SDK Shape

The `MilestoneService` class from `@codeplane/sdk` exposes:

```typescript
createMilestone(
  actor: AuthUser | null,
  owner: string,
  repo: string,
  req: { title: string; description: string; due_date?: string }
): Promise<MilestoneResponse>
```

Where `MilestoneResponse` is:
```typescript
{
  id: number;
  repository_id: number;
  title: string;
  description: string;
  state: string;           // Always "open" on creation
  due_date: string | null; // ISO 8601 or null
  closed_at: string | null; // Always null on creation
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601
}
```

### CLI Command

**Command:** `codeplane milestone create <title> [options]`

**Arguments:**
- `<title>` — The milestone title (positional, required)

**Options:**
- `--description <text>` — Milestone description (default: `""`)
- `--due-date <iso-date>` — Due date as an ISO 8601 string (optional; omitted by default)
- `--repo <OWNER/REPO>` — Target repository; if omitted, resolved from the current working directory's jj/git context
- `--json` — Output full JSON response

**Output:** JSON object of the created milestone on success. Error message on failure.

**Examples:**
```bash
# Create a simple milestone
codeplane milestone create "v1.0" --description "First release" --repo myorg/myproject

# Create a milestone with a due date
codeplane milestone create "Q2 Sprint" --description "Sprint ending June" --due-date "2026-06-30T00:00:00.000Z"

# Create a milestone with minimal fields
codeplane milestone create "v2.0"

# JSON output
codeplane milestone create "v1.0" --description "First release" --repo myorg/myproject --json
```

### Web UI Design

Milestone creation in the web UI is accessible from the repository's milestone management settings page (at `/:owner/:repo/settings/milestones`) and from inline "create a milestone" links within the issue milestone picker when no milestones exist.

The creation form presents:
1. **Title input** — Text field, placeholder "Milestone title", max 255 characters. Required.
2. **Description input** — Multiline textarea, placeholder "Description (optional)".
3. **Due date input** — A date picker allowing the user to select a calendar date. The date is converted to an ISO 8601 string before sending to the API. Optional — the picker may be cleared or left empty.
4. **Submit button** — "Create milestone" button, disabled until the title is non-empty.

On successful creation, the new milestone appears in the milestone list immediately with its title, state badge ("Open"), and due date (if set). On validation errors, inline error messages appear next to the offending field. On conflict (duplicate title), a toast or inline error reads "A milestone with this title already exists."

### TUI UI

The TUI does not currently expose a dedicated milestone creation screen. Milestone management is available through the CLI. If a milestone creation flow is added to the TUI, it should present a form with title, description, and due date fields (the latter via a text input for ISO dates), with inline validation matching the API constraints.

### Documentation

End-user documentation should cover:

- **Concept page: Milestones** — Explain what milestones are, that they are repository-scoped, their relationship to issues, and how the open/closed state model works.
- **How-to: Create a milestone via CLI** — Show `codeplane milestone create` usage with examples including the `--due-date` option.
- **How-to: Create a milestone via API** — Show the `POST /api/repos/:owner/:repo/milestones` endpoint with a curl example.
- **Reference: Milestone API** — Full endpoint reference including request/response shapes and all error codes.
- **Reference: CLI milestone commands** — Argument/option table for `milestone create`, `milestone list`, `milestone view`, `milestone update`, `milestone delete`.

## Permissions & Security

### Authorization Matrix

| Role | Can Create Milestones? |
|---|---|
| Repository Owner | ✅ Yes |
| Organization Owner (for org repo) | ✅ Yes |
| Admin Collaborator | ✅ Yes |
| Write Collaborator | ✅ Yes |
| Read Collaborator | ❌ No (403) |
| Unauthenticated | ❌ No (401) |
| Authenticated, no repo access | ❌ No (403) |

### Rate Limiting

- Milestone creation is subject to the server's global rate limiting middleware applied to all mutation endpoints.
- A per-user burst limit of **30 milestone creation requests per minute per repository** is recommended to prevent automated abuse (e.g., a script flooding a repo with milestones).

### Data Privacy

- Milestone titles, descriptions, and due dates are repository-scoped metadata. They are visible to anyone who can read the repository (including unauthenticated users for public repositories).
- No PII is expected in milestone fields, but since users may type arbitrary text into the title and description, milestones inherit the repository's visibility scope. Private repository milestones are not exposed to unauthorized viewers.
- Milestone creation does not involve secrets, tokens, or credentials.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `MilestoneCreated` | Successful milestone creation | `repository_id`, `milestone_id`, `milestone_title`, `actor_id`, `has_description` (boolean), `has_due_date` (boolean), `client` ("api" / "cli" / "web" / "tui"), `timestamp` |

### Funnel Metrics

- **Milestone adoption rate**: Percentage of repositories that have at least one milestone.
- **Milestones per repository**: Distribution of milestone counts across repositories, measured as a histogram.
- **Milestone-to-issue association rate**: Of created milestones, what percentage have at least one issue associated within 7 days?
- **Time from repo creation to first milestone**: How quickly do teams start organizing with milestones?
- **Due date usage rate**: Percentage of milestones created with a due date vs. without. High due-date usage indicates teams rely on deadlines.
- **Milestone creation errors**: Ratio of failed milestone creation attempts to successful ones, broken down by error type (validation, conflict, permission).

### Success Indicators

- Increasing milestone adoption rate indicates the feature is discoverable and useful.
- A high milestone-to-issue association rate indicates milestones are being actively used to organize work, not just created.
- A high due-date usage rate indicates teams are leveraging the time-bounded nature of milestones.
- A low error rate on creation indicates the UI and CLI guide users toward valid inputs effectively.

## Observability

### Logging Requirements

| Event | Log Level | Structured Fields |
|---|---|---|
| Milestone created successfully | `info` | `event: "milestone.created"`, `repository_id`, `milestone_id`, `milestone_title`, `actor_id`, `has_due_date`, `duration_ms` |
| Milestone creation failed — validation | `warn` | `event: "milestone.create_failed"`, `reason: "validation"`, `field`, `code`, `repository_id`, `actor_id` |
| Milestone creation failed — conflict | `warn` | `event: "milestone.create_failed"`, `reason: "conflict"`, `milestone_title`, `repository_id`, `actor_id` |
| Milestone creation failed — permission | `warn` | `event: "milestone.create_failed"`, `reason: "forbidden"`, `repository_id`, `actor_id` |
| Milestone creation failed — unauthenticated | `info` | `event: "milestone.create_failed"`, `reason: "unauthenticated"` |
| Milestone creation failed — internal error | `error` | `event: "milestone.create_failed"`, `reason: "internal"`, `repository_id`, `actor_id`, `error_message` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_milestone_creates_total` | Counter | `status` (success / error), `error_type` (validation / conflict / forbidden / unauthenticated / internal) | Total milestone creation attempts |
| `codeplane_milestone_create_duration_seconds` | Histogram | — | Time taken to process a milestone creation request end-to-end |
| `codeplane_milestones_per_repo` | Gauge | `repository_id` | Current number of milestones in a repository (updated on create/delete) |

### Alerts

#### Alert: High Milestone Creation Error Rate
- **Condition:** `rate(codeplane_milestone_creates_total{status="error", error_type="internal"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `event: "milestone.create_failed"` with `reason: "internal"` to identify the root cause.
  2. Look for database connection issues — the most common cause is DB pool exhaustion or a connectivity problem.
  3. Check if the `milestones` table has any schema drift or if a recent migration failed.
  4. Verify the unique constraint on `(repository_id, title)` still exists — a dropped constraint could cause silent data corruption instead of a proper 409 response.
  5. If the error is a transient DB issue, monitor for auto-recovery. If persistent, check PGLite/Postgres health and restart the server if needed.

#### Alert: Milestone Creation Latency Spike
- **Condition:** `histogram_quantile(0.99, rate(codeplane_milestone_create_duration_seconds_bucket[5m])) > 2`
- **Severity:** Warning
- **Runbook:**
  1. Check database query latency — run `EXPLAIN ANALYZE` on the `INSERT INTO milestones` query.
  2. Look for table bloat or missing indexes on the `milestones` table.
  3. Check if the unique constraint index on `(repository_id, title)` is healthy.
  4. Review server resource utilization (CPU, memory, DB connections).
  5. If isolated to one repository, check if that repository has an unusually large number of milestones causing index pressure.

#### Alert: Unusual Milestone Creation Volume
- **Condition:** `rate(codeplane_milestone_creates_total{status="success"}[5m]) > 5`
- **Severity:** Info
- **Runbook:**
  1. This may indicate automated milestone seeding (legitimate) or abuse.
  2. Check if the volume is concentrated on one repository/user by examining structured logs.
  3. If it's a single actor creating many milestones, consider whether rate limiting needs tightening.
  4. If it's distributed across many users/repos, it may indicate a product event — no action needed.

### Error Cases and Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Recovery |
|---|---|---|---|
| Empty milestone title | 422 | Validation failed — title missing | User provides a non-empty title |
| Title too long (>255 chars) | 422 | Validation failed — title invalid | User shortens the title |
| Invalid due date format | 422 | Validation failed — due_date invalid | User provides a valid ISO 8601 date |
| Duplicate title in repo | 409 | Milestone already exists | User chooses a different title or updates the existing milestone |
| Not authenticated | 401 | Authentication required | User logs in or provides a valid PAT |
| No write access | 403 | Permission denied | User requests write access from a repo admin |
| Repository not found | 404 | Repository not found | User verifies the owner/repo path |
| Malformed JSON | 400 | Invalid request body | User fixes the request payload |
| Database unreachable | 500 | Failed to create milestone | Ops team investigates DB connectivity |
| Unexpected DB error | 500 | Failed to create milestone | Ops team investigates via structured logs |

## Verification

### API Integration Tests

1. **Happy path: Create a milestone with all fields** — POST with valid `title`, `description`, `due_date`. Assert 201 status. Assert response contains `id` (number), `repository_id` (number), `title` matching input (trimmed), `description` matching input, `state` equals `"open"`, `due_date` as a valid ISO 8601 string, `closed_at` is `null`, `created_at` and `updated_at` as valid ISO 8601 strings.

2. **Happy path: Create a milestone without due date** — POST with `title` and `description` only (no `due_date` field). Assert 201 and `due_date` is `null`.

3. **Happy path: Create a milestone with empty description** — POST with `description: ""`. Assert 201 and response `description` is `""`.

4. **Title: maximum valid length (255 characters)** — POST with a title that is exactly 255 characters long. Assert 201 and response `title` has length 255.

5. **Title: exceeds maximum length (256 characters)** — POST with a title that is 256 characters long. Assert 422 with `{ resource: "Milestone", field: "title", code: "invalid" }`.

6. **Title: whitespace trimming** — POST with `title: "  v1.0  "`. Assert 201 and response `title` is `"v1.0"`.

7. **Title: all whitespace** — POST with `title: "   "`. Assert 422 with `{ resource: "Milestone", field: "title", code: "missing_field" }`.

8. **Title: empty string** — POST with `title: ""`. Assert 422 with `{ resource: "Milestone", field: "title", code: "missing_field" }`.

9. **Title: single character** — POST with `title: "X"`. Assert 201 and response `title` is `"X"`.

10. **Title: exactly 255 characters after trimming leading/trailing whitespace** — POST with `title: " " + "A".repeat(255) + " "`. Assert 201 and response `title` has length 255.

11. **Due date: valid ISO 8601 full datetime** — POST with `due_date: "2026-06-01T00:00:00.000Z"`. Assert 201 and `due_date` is a valid ISO 8601 string.

12. **Due date: valid ISO 8601 date-only** — POST with `due_date: "2026-06-01"`. Assert 201 and `due_date` is a valid ISO 8601 string (server parses it successfully).

13. **Due date: invalid string** — POST with `due_date: "not-a-date"`. Assert 422 with `{ resource: "Milestone", field: "due_date", code: "invalid" }`.

14. **Due date: empty string** — POST with `due_date: ""`. Assert 201 and `due_date` is `null` (empty string treated as no due date).

15. **Due date: impossible date values** — POST with `due_date: "2026-13-45T00:00:00Z"`. Assert 422 with `{ resource: "Milestone", field: "due_date", code: "invalid" }`.

16. **Due date: past date** — POST with `due_date: "2020-01-01T00:00:00.000Z"`. Assert 201 (past due dates are allowed; the server does not enforce future-only dates).

17. **Duplicate title: exact match** — Create a milestone titled "v1.0", then POST again with `title: "v1.0"`. Assert 409 with message "milestone already exists".

18. **Duplicate title: case sensitivity** — Create "V1.0", then create "v1.0". Assert behavior based on DB collation and document actual result.

19. **Cross-repository: same title allowed** — Create "v1.0" in repo A, then create "v1.0" in repo B. Assert both succeed with 201 (uniqueness is per-repository).

20. **State is always open on creation** — POST a valid milestone. Assert response `state` is `"open"` and `closed_at` is `null`.

21. **Unauthenticated request** — POST without auth. Assert 401 with message "authentication required".

22. **Read-only collaborator** — POST as a user with only read access. Assert 403 with message "permission denied".

23. **Write collaborator** — POST as a user with write access. Assert 201.

24. **Admin collaborator** — POST as a user with admin access. Assert 201.

25. **Repository owner** — POST as the repository owner. Assert 201.

26. **Organization owner** — POST as the org owner for an org-owned repo. Assert 201.

27. **Non-existent repository** — POST to `/api/repos/nobody/nonexistent/milestones`. Assert 404 with message "repository not found".

28. **Malformed JSON body** — POST with body `"not json"`. Assert 400 with message "invalid request body".

29. **Missing body entirely** — POST with no body / empty content. Assert 400.

30. **Milestone is immediately listable** — Create a milestone, then GET `/api/repos/:owner/:repo/milestones`. Assert the new milestone appears in the list.

31. **Milestone is immediately retrievable by ID** — Create a milestone, then GET `/api/repos/:owner/:repo/milestones/:id` using the returned ID. Assert the response matches the creation response.

32. **Created milestone can be associated with an issue** — Create a milestone, create an issue with `milestone: <milestone_id>`. Assert the issue's `milestone_id` matches the created milestone.

33. **Special characters in title** — POST with `title: "release / v1.0-beta (RC1)"`. Assert 201.

34. **Unicode in title** — POST with `title: "リリース v1.0 🚀"`. Assert 201.

35. **Newlines in description** — POST with `description: "Line 1\nLine 2\nLine 3"`. Assert 201 and the description preserves newlines.

36. **Very long description** — POST with a description that is 10,000 characters long. Assert 201 (no description length limit enforced).

37. **Multiple milestones in the same repo** — Create 5 milestones with unique titles. Assert all succeed and all appear in the list endpoint.

### CLI E2E Tests

38. **CLI: Create milestone with all options** — Run `codeplane milestone create "v1.0" --description "First release" --repo OWNER/REPO --json`. Assert JSON output contains `id` (number), `title: "v1.0"`, `state: "open"`, `description: "First release"`.

39. **CLI: Create milestone without description** — Run `codeplane milestone create "v2.0" --repo OWNER/REPO --json`. Assert 201 and description is `""`.

40. **CLI: Create milestone with due date** — Run `codeplane milestone create "Q2" --description "Q2 goals" --due-date "2026-06-30T00:00:00Z" --repo OWNER/REPO --json`. Assert JSON output includes a non-null `due_date`.

41. **CLI: Create duplicate milestone** — Create "v1.0" twice via CLI. Assert the second invocation outputs an error indicating the milestone already exists.

42. **CLI: Verify created milestone appears in list** — Create a milestone via CLI, then run `codeplane milestone list --repo OWNER/REPO --json`. Assert the created milestone appears in the output.

43. **CLI: Repo resolution from working directory** — In a directory with jj/git context pointing to a known repo, run `codeplane milestone create "localms" --json` without `--repo`. Assert success.

44. **CLI: Create milestone with empty title** — Run `codeplane milestone create "" --repo OWNER/REPO`. Assert failure with a validation error.

### Playwright (Web UI) E2E Tests

45. **Web: Milestone creation form renders** — Navigate to `/:owner/:repo/settings/milestones`. Assert the create milestone form is visible with title input, description textarea, due date picker, and submit button.

46. **Web: Create milestone via form** — Fill in title, description, and due date in the form and submit. Assert the milestone appears in the milestone list on the same page with "Open" badge and the due date displayed.

47. **Web: Create milestone without due date** — Fill in title and description only, leave due date empty, and submit. Assert the milestone is created and appears in the list with no due date shown.

48. **Web: Inline validation — empty title** — Leave title empty, click submit. Assert an inline validation error appears on the title field.

49. **Web: Duplicate title error** — Create a milestone, then try to create another with the same title. Assert a user-visible error message about the milestone already existing.

50. **Web: Created milestone available in issue milestone picker** — Create a milestone via settings, navigate to an issue, open the milestone picker. Assert the new milestone appears in the picker options.

51. **Web: Submit button disabled until title is non-empty** — Load the creation form. Assert the submit button is disabled. Type a title. Assert the submit button becomes enabled.
