# LANDING_CREATE

Specification for LANDING_CREATE.

## High-Level User POV

A landing request is Codeplane's jj-native equivalent of a pull request. When a developer has one or more jj changes ready for review and integration into a target bookmark (e.g., `main`), they create a landing request to propose those changes to the team.

Creating a landing request is intentionally built around jj's mental model: instead of selecting branches or comparing HEAD refs, the user selects one or more jj change IDs and a target bookmark. Changes are ordered as a stack — reflecting the natural way jj users compose dependent edits — and the landing request preserves that stack ordering throughout the review, conflict-check, and merge lifecycle.

Users can create landing requests from the web UI, the CLI, or the TUI. The CLI is particularly powerful for jj workflows: it can automatically detect the current working change, or gather an entire stack of changes leading up to a target bookmark with a single `--stack` flag. Once created, the landing request appears in the repository's landing list with an auto-assigned number, an `open` state, and an initial conflict status assessment. The author can then share the landing request with reviewers, who can inspect the stacked diffs, leave comments, and approve or request changes.

The landing request creation flow is designed to be fast and low-friction. A title and at least one change are the only strict requirements. The body, source bookmark, and other metadata are optional. This means a developer can go from "I have changes" to "my team can review them" in a single command or a short form interaction.

## Acceptance Criteria

### Definition of Done

- A landing request can be created from the API, CLI, Web UI, and TUI with consistent behavior and validation rules across all surfaces.
- The created landing request is immediately visible in the repository's landing request list.
- The created landing request has a unique, auto-incremented number scoped to the repository.
- All specified change IDs are associated with the landing request in the submitted stack order.

### Required Field Constraints

- **Title**: Required. Must be non-empty after trimming whitespace. Maximum length: 255 characters. May contain any Unicode characters. Leading and trailing whitespace is stripped.
- **Target Bookmark**: Required. Must be non-empty after trimming whitespace. Must reference a valid bookmark name string. Leading and trailing whitespace is stripped.
- **Change IDs**: Required. Must contain at least one entry. Every entry must be non-empty after trimming whitespace. Each change ID is trimmed before storage. Duplicate change IDs within the same request are accepted (server does not deduplicate). Multiple change IDs submitted via CLI `--change-ids` are comma-separated.

### Optional Field Constraints

- **Body**: Optional. Defaults to empty string `""`. Supports plain text and markdown content. No explicit maximum length enforced at the API layer.
- **Source Bookmark**: Optional. Defaults to empty string `""`. Leading and trailing whitespace is stripped.

### State and Metadata

- The landing request is always created in the `open` state. There is no way to create directly in `draft`, `closed`, or `merged` state.
- The `conflict_status` field is set by the system (not user-controlled at creation time).
- The `stack_size` is automatically computed from the number of change IDs provided.
- The `number` is auto-incremented per repository using the `get_next_landing_number()` database function.
- `created_at` and `updated_at` are set to the server timestamp at creation.

### Edge Cases

- **Empty title after trim**: Returns 422 validation error with `field: "title"`, `code: "missing_field"`.
- **Empty target bookmark after trim**: Returns 422 validation error with `field: "target_bookmark"`, `code: "missing_field"`.
- **Empty change_ids array**: Returns 422 validation error with `field: "change_ids"`, `code: "missing_field"`.
- **change_ids containing an empty string**: Returns 422 validation error with `field: "change_ids"`, `code: "invalid"`.
- **Null/missing body in request JSON**: Defaults to `""`.
- **Null/missing source_bookmark**: Defaults to `""`.
- **Null/missing change_ids**: Defaults to `[]`, which then fails validation.
- **Repository not found**: Returns 404.
- **User lacks write access**: Returns 403.
- **Unauthenticated request**: Returns 401.
- **Unique constraint violation** (e.g., race condition on number generation): Returns 409 conflict.
- **Malformed JSON body**: Returns 400 bad request.
- **Rate limit exceeded**: Returns 429.

### CLI-Specific Behavior

- `--change-id` and `--change` are aliases; either accepts a single change ID.
- When neither `--change-id` nor `--stack` is provided, the CLI automatically uses the current local jj change ID.
- `--stack` gathers all changes in the stack up to the target bookmark from the local jj repository.
- `--target` defaults to `"main"` when not specified.
- `--repo` can be omitted if the CLI can resolve the repository from the current working directory's jj/git remote.

## Design

### API Shape

**Endpoint**: `POST /api/repos/:owner/:repo/landings`

**Request Headers**:
```
Authorization: token <personal_access_token>
Content-Type: application/json
```

**Path Parameters**:
| Parameter | Type   | Description                      |
|-----------|--------|----------------------------------|
| `owner`   | string | Repository owner (user or org)   |
| `repo`    | string | Repository name                  |

**Request Body**:
```json
{
  "title": "string (required, non-empty after trim)",
  "body": "string (optional, defaults to \"\")",
  "target_bookmark": "string (required, non-empty after trim)",
  "source_bookmark": "string (optional, defaults to \"\")",
  "change_ids": ["string (required, at least one, each non-empty after trim)"]
}
```

**Success Response** (`201 Created`):
```json
{
  "number": 42,
  "title": "Add user authentication",
  "body": "Implements JWT-based auth flow",
  "state": "open",
  "author": {
    "id": 1,
    "login": "alice"
  },
  "change_ids": ["abc123def456", "xyz789ghi012"],
  "target_bookmark": "main",
  "conflict_status": "unknown",
  "stack_size": 2,
  "created_at": "2026-03-22T10:30:00.000Z",
  "updated_at": "2026-03-22T10:30:00.000Z"
}
```

**Error Responses**:

| Status | Condition                        | Body Shape                                                                       |
|--------|----------------------------------|---------------------------------------------------------------------------------|
| 400    | Malformed JSON or missing path params | `{ "message": "..." }`                                                       |
| 401    | No authentication                | `{ "message": "authentication required" }`                                    |
| 403    | Insufficient permissions         | `{ "message": "permission denied" }`                                          |
| 404    | Repository not found             | `{ "message": "repository not found" }`                                       |
| 409    | Unique constraint violation      | `{ "message": "landing request already exists" }`                             |
| 422    | Validation failure               | `{ "message": "Validation Failed", "errors": [{ "resource": "LandingRequest", "field": "...", "code": "..." }] }` |
| 429    | Rate limited                     | `{ "message": "rate limit exceeded" }`                                        |
| 500    | Internal server error            | `{ "message": "failed to create landing request" }`                           |

### SDK Shape

**Service**: `LandingService.createLandingRequest(actor, owner, repo, input)`

**Input Type** (`CreateLandingRequestInput`):
```typescript
{
  title: string;
  body: string;
  target_bookmark: string;
  source_bookmark: string;
  change_ids: string[];
}
```

**Return Type**: `Result<LandingRequestResponse, APIError>`

**Validation Pipeline** (executed in order):
1. Actor authentication check
2. Title non-empty check
3. Target bookmark non-empty check
4. Change IDs normalization (non-empty array, each entry non-empty after trim)
5. Repository resolution (owner + repo name → repository record)
6. Write access permission check
7. Database insert with auto-numbered sequence
8. Change ID association records (one per change, preserving stack order via `position_in_stack`)

### CLI Command

**Command**: `codeplane land create` (alias: `codeplane lr create`)

**Options**:

| Flag             | Type    | Required | Default  | Description                                  |
|------------------|---------|----------|----------|----------------------------------------------|
| `--title`        | string  | Yes      | —        | Landing request title                        |
| `--body`         | string  | No       | `""`     | Landing request description (markdown)       |
| `--target`       | string  | No       | `"main"` | Target bookmark name                         |
| `--change`       | string  | No       | —        | Explicit change ID to include                |
| `--change-id`    | string  | No       | —        | Alias for `--change`                         |
| `--repo`         | string  | No       | auto     | Repository in `OWNER/REPO` format            |
| `--stack`        | boolean | No       | `false`  | Include full change stack to target bookmark |

**Change ID Resolution Order**:
1. If `--change-id` or `--change` is provided → use that single ID
2. Else if `--stack` is `true` → call `listLocalStackChangeIds(target)` to gather the full stack from the local jj repo
3. Else → call `currentLocalChangeId()` to use the working-copy change

**Human-readable Output**: Formatted via `formatLandingCreate(repoRef, landing)` showing the landing number, title, and a URL to the landing request.

**JSON Output**: When `--json` is passed, the raw API response object is returned.

**Example Invocations**:
```bash
# Create from current change, default target
codeplane land create --title "Fix auth bug"

# Create with explicit change ID and description
codeplane land create --title "Add feature" --change abc123def456 --body "Detailed description"

# Create from full stack
codeplane land create --title "User auth flow" --target main --stack

# Create against non-default target
codeplane land create --title "Backport fix" --target release/v2 --change xyz789

# Explicit repo
codeplane land create --title "Fix" --repo myorg/myrepo --change abc123
```

### Web UI Design

The web UI provides a landing request creation form accessible from the repository's Landings view.

**Entry Points**:
- "New Landing Request" button on the landing request list page (`/:owner/:repo/landings`)
- Command palette: "Create Landing Request"

**Form Fields** (in order):
1. **Title** — Single-line text input. Required. Placeholder: "Landing request title". Auto-focused on form load.
2. **Description** — Multi-line textarea. Optional. Supports markdown. Placeholder: "Describe your changes (markdown supported)".
3. **Target Bookmark** — Dropdown selector populated from the repository's bookmarks. Required. Defaults to the repository's default bookmark (typically `main`).
4. **Source Bookmark** — Text input. Optional. Placeholder: "Source bookmark (optional)".
5. **Changes** — Multi-select list populated from the repository's jj changes. Required (at least one). Each entry displays the change ID (first 12 characters) and the first line of the description. Changes with conflicts display a warning indicator.

**Form Actions**:
- **Create** button — Submits the form. Disabled until title, target bookmark, and at least one change are provided. Shows loading state during submission.
- **Cancel** button / link — Returns to the landing request list. If the form has unsaved changes, a confirmation dialog appears.

**Success Behavior**: On successful creation, the user is navigated to the newly created landing request's detail page.

**Error Behavior**: Validation errors appear inline beneath the relevant field. Server errors appear as a banner at the top of the form. The form remains editable on error so the user can correct and retry.

### TUI Design

The TUI provides a full-screen landing request creation form.

**Entry Points**:
- Press `c` from the landing request list screen
- Command palette: type "create landing" or "new landing request"

**Form Layout** (standard 120×40 terminal):
```
┌─────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Landings > New Landing Request │
├─────────────────────────────────────────────────────────┤
│  Title                                                  │
│  [━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━] │
│                                                         │
│  Description                                            │
│  [                                                    ] │
│  [                                                    ] │
│  [                                                    ] │
│                                                         │
│  Target Bookmark    [▼ main                           ] │
│  Source Bookmark    [                                 ] │
│  Changes (jj)       [▼ Select changes...              ] │
│                                                         │
│  [ Submit ]   [ Cancel ]                                │
├─────────────────────────────────────────────────────────┤
│ Tab: next field │ Ctrl+S: submit │ Esc: cancel │ ?: help│
└─────────────────────────────────────────────────────────┘
```

**Keyboard Shortcuts**:
- `Tab` / `Shift+Tab`: Navigate between fields
- `Ctrl+S`: Submit from any field
- `Esc`: Cancel (confirmation prompt if form is dirty)
- `?`: Help overlay
- `/`: Filter within dropdown selectors

**Responsive Breakpoints**:
- 80×24 (minimum): Abbreviated labels, 4-line description area
- 120×40 (standard): Full labels, 8-line description area, overlay dropdowns
- 200×60 (large): Extended layout with extra padding

**Inline Validation Messages**:
- "⚠ Title is required" (red, below title field)
- "⚠ Target bookmark is required" (red, below target selector)
- "⚠ At least one change is required" (red, below changes selector)

**Loading States**:
- Bookmarks loading: "Loading bookmarks..." in selector
- Changes loading: "Loading changes..." in selector
- Submit in progress: "Creating…" on submit button, all fields disabled
- Submit blocked until both bookmark and change data have loaded

**Success**: Form screen replaced with landing detail view showing the new landing number.

**Error Handling**:
- 401: "Session expired. Run `codeplane auth login` to re-authenticate."
- 403: "You do not have permission to create landing requests in this repository."
- 422: Field-level errors mapped to inline messages
- 429: "Rate limit exceeded. Please wait and try again."
- Network error: Red banner, form re-enables, press `R` to retry

### Editor Integrations

**VS Code** (`VSCODE_LANDINGS_PANEL`): The VS Code extension provides a landings tree view panel for browsing landing requests. Landing creation is accessed by opening the Codeplane dashboard webview or by using the CLI from the integrated terminal. No dedicated in-editor creation form exists today.

**Neovim** (`NVIM_LANDINGS_COMMAND`): The Neovim plugin exposes `:CodeplaneLandings` for browsing landing requests. Landing creation is performed via the CLI or TUI from the terminal. No dedicated creation command exists today.

### Documentation

The following end-user documentation should be written:

1. **"Creating a Landing Request" guide** — A step-by-step walkthrough covering:
   - What a landing request is and how it maps to jj concepts
   - Creating from the web UI (form fields, selectors, submission)
   - Creating from the CLI (basic, with `--stack`, with explicit change IDs)
   - Creating from the TUI (keyboard navigation, form flow)
   - Understanding the created landing request's initial state and conflict status

2. **CLI Reference for `codeplane land create`** — Complete option reference, examples, and error message explanations.

3. **API Reference for `POST /api/repos/:owner/:repo/landings`** — Request/response schemas, status codes, and example curl commands.

## Permissions & Security

### Authorization Requirements

| Role       | Can Create Landing Request? | Notes                                            |
|------------|----------------------------|--------------------------------------------------|
| Owner      | ✅ Yes                      | Repository owner always has full access          |
| Admin      | ✅ Yes                      | Organization admin or repo admin                 |
| Write      | ✅ Yes                      | Team member or collaborator with write access    |
| Read       | ❌ No                       | Read-only access is insufficient                 |
| Anonymous  | ❌ No                       | Authentication is always required                |

**Permission Resolution Order**:
1. Check if actor is the repository owner → full access
2. Check team memberships for the repository → highest permission wins
3. Check direct collaborator assignment → check permission level
4. Write or admin permission required; read permission is insufficient

### Rate Limiting

- Landing request creation follows the server's general mutation rate limit.
- Recommended limit: 60 creation requests per minute per authenticated user.
- 429 response returned when exceeded, with `Retry-After` header.

### Data Privacy and Security

- **No PII in change IDs**: Change IDs are opaque jj identifiers and do not contain personally identifiable information.
- **Author attribution**: The `author` field is derived from the authenticated session and cannot be spoofed. It records the user's internal ID and login username.
- **Title and body content**: User-generated text fields. Clients should sanitize for display (XSS prevention). The server stores raw text.
- **Input sanitization**: All string inputs are trimmed. The server does not render HTML and returns JSON responses, minimizing injection risk.
- **Secrets exposure**: Landing request creation does not involve or expose repository secrets or variables.
- **Audit trail**: The `author_id` and `created_at` fields provide a durable audit trail for who created each landing request and when.

## Telemetry & Product Analytics

### Key Business Events

| Event Name                     | Trigger                                 | Properties                                                                                                                                                  |
|--------------------------------|-----------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `landing_request.created`      | Successful creation (201)               | `repo_id`, `repo_owner`, `repo_name`, `landing_number`, `author_id`, `target_bookmark`, `stack_size`, `has_body` (boolean), `has_source_bookmark` (boolean), `client` (web/cli/tui/api) |
| `landing_request.create_failed`| Creation failed (4xx or 5xx)            | `repo_owner`, `repo_name`, `author_id`, `error_code` (HTTP status), `error_field` (if 422), `client`                                                       |
| `landing_request.create_attempted` | Form submission / CLI execution started | `repo_owner`, `repo_name`, `author_id`, `client`, `change_count`                                                                                           |

### CLI-Specific Events

| Event Name                     | Trigger                                    | Properties                                                  |
|--------------------------------|--------------------------------------------|-------------------------------------------------------------|
| `cli.landing_create.stack_resolved` | `--stack` flag resolved change IDs    | `stack_size`, `target_bookmark`, `resolution_duration_ms`   |
| `cli.landing_create.current_change_resolved` | Auto-detected current change | `change_id_prefix`, `resolution_duration_ms`                |

### TUI-Specific Events

| Event Name                                    | Trigger                       | Properties                            |
|-----------------------------------------------|-------------------------------|---------------------------------------|
| `tui.landing_create_form.opened`              | Form screen opened            | `entry_point`, `terminal_dimensions`  |
| `tui.landing_create_form.submitted`           | Submit button pressed         | `field_count`, `body_length`          |
| `tui.landing_create_form.succeeded`           | 201 response received         | `landing_number`, `duration_ms`       |
| `tui.landing_create_form.failed`              | Error response received       | `error_code`, `duration_ms`           |
| `tui.landing_create_form.validation_error`    | Client-side validation failed | `field`, `error_type`                 |

### Funnel Metrics and Success Indicators

- **Creation success rate**: `landing_request.created` / `landing_request.create_attempted` — target ≥ 95%.
- **Time from form open to creation** (web/TUI): Median time between `form.opened` and `form.succeeded` — indicates form usability.
- **Stack vs. single change ratio**: Percentage of created landings with `stack_size > 1` — indicates adoption of jj-native stacking workflows.
- **CLI vs. Web vs. TUI creation ratio**: Distribution of `client` property — indicates which surfaces are most used.
- **Error rate by error type**: Breakdown of `landing_request.create_failed` by `error_code` — identifies common failure patterns.
- **Weekly active landing creators**: Unique `author_id` values in `landing_request.created` per week.
- **Landings per repository per week**: Average `landing_request.created` grouped by `repo_id` — indicates repository activity health.

## Observability

### Logging Requirements

| Log Point                           | Level | Structured Context                                                             |
|-------------------------------------|-------|--------------------------------------------------------------------------------|
| Landing request creation started    | INFO  | `repo_id`, `owner`, `repo`, `actor_id`, `change_count`, `target_bookmark`     |
| Landing request created successfully| INFO  | `repo_id`, `landing_number`, `actor_id`, `stack_size`, `duration_ms`           |
| Landing request creation failed (validation) | WARN  | `repo_id`, `owner`, `repo`, `actor_id`, `field`, `error_code`          |
| Landing request creation failed (permission) | WARN  | `repo_id`, `owner`, `repo`, `actor_id`, `permission_level`             |
| Landing request creation failed (not found)  | WARN  | `owner`, `repo`, `actor_id`                                            |
| Landing request creation failed (DB error)   | ERROR | `repo_id`, `owner`, `repo`, `actor_id`, `error_message`, `stack_trace` |
| Landing request creation failed (unique violation) | WARN  | `repo_id`, `owner`, `repo`, `actor_id`                           |
| Change IDs associated with landing  | DEBUG | `landing_request_id`, `change_ids`, `positions`                                |

### Prometheus Metrics

| Metric Name                                     | Type      | Labels                                      | Description                                        |
|--------------------------------------------------|-----------|----------------------------------------------|----------------------------------------------------|n| `codeplane_landing_requests_created_total`       | Counter   | `owner`, `repo`, `client`                    | Total landing requests created successfully        |
| `codeplane_landing_requests_create_errors_total` | Counter   | `owner`, `repo`, `error_type`, `status_code` | Total landing request creation failures            |
| `codeplane_landing_request_create_duration_seconds` | Histogram | `owner`, `repo`                           | Time to create a landing request (server-side)     |
| `codeplane_landing_request_stack_size`           | Histogram | `owner`, `repo`                              | Distribution of stack sizes in created landings    |
| `codeplane_landing_request_changes_insert_duration_seconds` | Histogram | —                                  | Time to insert change association records          |

### Alerts

#### Alert: High Landing Creation Error Rate

**Condition**: `rate(codeplane_landing_requests_create_errors_total[5m]) / rate(codeplane_landing_requests_created_total[5m]) > 0.1` for 10 minutes.

**Severity**: Warning

**Runbook**:
1. Check the error type label breakdown: `sum by (error_type) (rate(codeplane_landing_requests_create_errors_total[5m]))`.
2. If dominated by `validation` errors → likely a client-side issue or API contract change. Check recent deployments for breaking changes to the creation endpoint or client code.
3. If dominated by `permission` errors → check for accidental permission changes, org membership revocations, or repository visibility changes.
4. If dominated by `internal` errors → check server logs for stack traces. Look for database connection issues, lock contention on `get_next_landing_number()`, or disk space problems.
5. If dominated by `not_found` errors → check if repositories were recently deleted, renamed, or transferred.

#### Alert: Landing Creation Latency Spike

**Condition**: `histogram_quantile(0.95, rate(codeplane_landing_request_create_duration_seconds_bucket[5m])) > 5` for 5 minutes.

**Severity**: Warning

**Runbook**:
1. Check database query latency: look at `get_next_landing_number()` execution times. This function uses a sequence and may contend under high write load.
2. Check if the change ID insertion loop is slow: `codeplane_landing_request_changes_insert_duration_seconds`. Large stacks (>50 changes) may cause sequential insert slowness.
3. Check database connection pool utilization and queue depth.
4. Check for table bloat or missing indexes on `landing_requests(repository_id, number)`.
5. Check server resource utilization (CPU, memory, I/O).

#### Alert: Landing Creation Availability Drop

**Condition**: `rate(codeplane_landing_requests_created_total[5m]) == 0` AND previous 1-hour average was `> 1` for 15 minutes.

**Severity**: Critical

**Runbook**:
1. Verify the server process is running and healthy: `GET /api/health`.
2. Check if the landings route is mounted: look for startup logs confirming route registration.
3. Check database connectivity: can the service reach the database?
4. Check for recent deployments that may have broken the landing creation path.
5. Test creation manually with a curl command against the API.
6. Check rate limiter state — an overly aggressive rate limit configuration could block all requests.

### Error Cases and Failure Modes

| Failure Mode                           | Behavior                                       | Detection                                           |
|----------------------------------------|------------------------------------------------|-----------------------------------------------------|
| Database unavailable                   | 500 internal error returned                    | `create_errors_total{error_type="internal"}` spikes |
| Number sequence contention             | Slow creation or unique violation retries      | Duration histogram P99 increases                    |
| Large stack (many change IDs)          | Slow sequential inserts                        | Changes insert duration histogram                   |
| Request body too large                 | 413 from reverse proxy or 400 from Hono        | Error counter with `status_code=413`                |
| Auth token expired mid-session         | 401 returned                                   | `create_errors_total{error_type="unauthorized"}`    |
| Repository deleted between check/write | Race condition, potential 500 or 404           | Error logs with "failed to create" and foreign key  |
| Network timeout (client-side)          | Client retries; potential duplicate if first succeeded | Monitor for duplicate landing titles in short windows |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|----------------|
| API-LC-001 | Create landing request with valid title, target_bookmark, and one change_id | 201 with auto-assigned number, state=open, correct author, stack_size=1 |
| API-LC-002 | Create landing request with multiple change_ids | 201 with change_ids in submitted order, stack_size matching count |
| API-LC-003 | Create landing request with all optional fields (body, source_bookmark) | 201 with body and source_bookmark populated in response |
| API-LC-004 | Create landing request omitting body | 201 with body as empty string |
| API-LC-005 | Create landing request omitting source_bookmark | 201 with source_bookmark absent or empty |
| API-LC-006 | Create landing request with empty title (`""`) | 422 with field=title, code=missing_field |
| API-LC-007 | Create landing request with whitespace-only title (`"   "`) | 422 with field=title, code=missing_field |
| API-LC-008 | Create landing request with empty target_bookmark | 422 with field=target_bookmark, code=missing_field |
| API-LC-009 | Create landing request with whitespace-only target_bookmark | 422 with field=target_bookmark, code=missing_field |
| API-LC-010 | Create landing request with empty change_ids array (`[]`) | 422 with field=change_ids, code=missing_field |
| API-LC-011 | Create landing request with change_ids containing an empty string (`[""]`) | 422 with field=change_ids, code=invalid |
| API-LC-012 | Create landing request with change_ids containing whitespace-only entry (`["  "]`) | 422 with field=change_ids, code=invalid |
| API-LC-013 | Create landing request without authentication | 401 |
| API-LC-014 | Create landing request with expired/invalid token | 401 |
| API-LC-015 | Create landing request on non-existent repository | 404 |
| API-LC-016 | Create landing request on repository where user has read-only access | 403 |
| API-LC-017 | Create landing request on repository where user has write access (collaborator) | 201 |
| API-LC-018 | Create landing request on repository where user has admin access | 201 |
| API-LC-019 | Create landing request as repository owner | 201 |
| API-LC-020 | Create two landing requests in the same repository — verify numbers auto-increment | Second landing has number = first + 1 |
| API-LC-021 | Create landing requests in two different repositories — verify numbers are scoped per repository | Both can have number=1 |
| API-LC-022 | Create landing request with title at maximum length (255 characters) | 201 with full title preserved |
| API-LC-023 | Create landing request with title exceeding maximum length (256+ characters) | 422 or 201 with truncation (verify current behavior) |
| API-LC-024 | Create landing request with Unicode characters in title (emoji, CJK, RTL) | 201 with characters preserved |
| API-LC-025 | Create landing request with special characters in title (quotes, angle brackets, backslashes) | 201 with characters preserved exactly |
| API-LC-026 | Create landing request with markdown in body | 201 with markdown preserved as-is |
| API-LC-027 | Create landing request with very large body (10KB) | 201 |
| API-LC-028 | Create landing request with very large body (1MB) | 201 or appropriate size limit error |
| API-LC-029 | Create landing request with 50 change IDs | 201 with all 50 preserved in order |
| API-LC-030 | Create landing request with 100 change IDs | 201 with all 100 preserved in order |
| API-LC-031 | Create landing request with change IDs that have leading/trailing whitespace | 201 with trimmed change IDs |
| API-LC-032 | Create landing request and verify response `created_at` and `updated_at` are valid ISO 8601 | Timestamps parse correctly |
| API-LC-033 | Create landing request and verify it appears in `GET /api/repos/:owner/:repo/landings` list | Landing found in list with matching number and title |
| API-LC-034 | Create landing request and verify `GET /api/repos/:owner/:repo/landings/:number` returns it | Full detail matches creation response |
| API-LC-035 | Create landing request with malformed JSON body | 400 |
| API-LC-036 | Create landing request with `Content-Type` not `application/json` | 400 or 415 |
| API-LC-037 | Create landing request and verify `conflict_status` is set (not null/undefined) | Response includes `conflict_status` field |
| API-LC-038 | Create landing request and verify `author.id` and `author.login` match the authenticated user | Author fields correct |
| API-LC-039 | Concurrent creation of two landing requests in the same repo | Both succeed with different numbers, no conflicts |

### CLI E2E Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|----------------|
| CLI-LC-001 | `codeplane lr create --title "Test" --change-ids abc123` with valid repo | Success output with landing number |
| CLI-LC-002 | `codeplane lr create --title "Test" --change-ids abc123,def456 --target main` | Created with 2 change IDs |
| CLI-LC-003 | `codeplane lr create --title "Test" --body "Description" --change-ids abc123` | Body included in response |
| CLI-LC-004 | `codeplane lr create` without `--title` | Error: title is required |
| CLI-LC-005 | `codeplane lr create --title "Test" --change-ids abc123 --json` | Raw JSON response output |
| CLI-LC-006 | `codeplane lr create --title "Test" --change-ids abc123 --repo owner/repo` | Uses explicit repo reference |
| CLI-LC-007 | `codeplane land create --title "Test" --change abc123` | Works with `land` alias and `--change` flag |
| CLI-LC-008 | `codeplane lr create --title "Test" --change-id abc123` | Works with `--change-id` alias |
| CLI-LC-009 | `codeplane lr create --title "Test" --target develop --change-ids abc123` | Target bookmark set to "develop" |
| CLI-LC-010 | `codeplane lr create --title "Test" --change-ids abc123` (default target) | Target defaults to "main" |
| CLI-LC-011 | Create via CLI, then verify via `codeplane lr view <number>` | View returns the created landing |
| CLI-LC-012 | Create via CLI, then verify via `codeplane lr list` | Landing appears in list |

### Web UI E2E Tests (Playwright)

| Test ID | Test Description | Expected Result |
|---------|-----------------|----------------|
| WEB-LC-001 | Navigate to `/:owner/:repo/landings` and click "New Landing Request" | Creation form appears with title focused |
| WEB-LC-002 | Fill all required fields and submit | Navigated to landing detail page with correct data |
| WEB-LC-003 | Submit form with empty title | Inline validation error on title field |
| WEB-LC-004 | Submit form with no changes selected | Inline validation error on changes field |
| WEB-LC-005 | Submit form with no target bookmark selected | Inline validation error on target bookmark |
| WEB-LC-006 | Fill form, click Cancel with unsaved changes | Confirmation dialog appears |
| WEB-LC-007 | Fill form, click Cancel, confirm discard | Returns to landing list, no landing created |
| WEB-LC-008 | Click Cancel on empty form (no changes) | Returns to landing list without confirmation |
| WEB-LC-009 | Verify bookmark dropdown loads and populates | Bookmarks visible in dropdown |
| WEB-LC-010 | Verify changes list loads and populates | Changes visible with IDs and descriptions |
| WEB-LC-011 | Select multiple changes and verify order preservation | Changes appear in selection order in created landing |
| WEB-LC-012 | Verify submit button is disabled until required fields are filled | Button state matches form validity |
| WEB-LC-013 | Verify loading state appears during submission | "Creating…" state visible on button |
| WEB-LC-014 | Verify server error displays as banner | Error message visible, form still editable |
| WEB-LC-015 | Create landing with markdown body, verify on detail page | Markdown renders correctly |
| WEB-LC-016 | Access creation form as read-only user | Form not accessible or 403 error shown |

### TUI E2E Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|----------------|
| TUI-LC-001 | Press `c` on landing list screen | Creation form renders with title focused |
| TUI-LC-002 | Fill required fields and press `Ctrl+S` | Landing created, detail screen shown |
| TUI-LC-003 | Tab through all form fields | Focus moves in correct order |
| TUI-LC-004 | Press `Esc` on dirty form | Confirmation prompt shown |
| TUI-LC-005 | Press `Esc` on clean form | Returns to list without prompt |
| TUI-LC-006 | Submit with empty title | "⚠ Title is required" shown inline |
| TUI-LC-007 | Submit with no changes selected | "⚠ At least one change is required" shown inline |
| TUI-LC-008 | Verify bookmark dropdown loads and is filterable | Bookmarks appear, filter narrows results |
| TUI-LC-009 | Verify changes selector supports multi-select | Multiple changes selectable with Space |
| TUI-LC-010 | Verify changes with conflicts show ⚠ indicator | Conflict indicator visible |
| TUI-LC-011 | Verify form renders at 80×24 minimum terminal size | Form usable, no overflow |
| TUI-LC-012 | Verify double-submit prevention | Second Ctrl+S during submission is ignored |

### Cross-Surface Consistency Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|----------------|
| CROSS-LC-001 | Create via API, verify visible in Web UI list | Landing appears correctly |
| CROSS-LC-002 | Create via CLI, verify visible in Web UI detail | All fields match |
| CROSS-LC-003 | Create via Web UI, verify via CLI `lr view` | All fields match |
| CROSS-LC-004 | Create via API, verify via CLI `lr list` | Landing in list with correct state |
| CROSS-LC-005 | Verify API response schema matches across all creation paths | Identical JSON structure |
