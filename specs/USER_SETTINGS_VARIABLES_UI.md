# USER_SETTINGS_VARIABLES_UI

Specification for USER_SETTINGS_VARIABLES_UI.

## High-Level User POV

Users need a centralized place to manage personal configuration variables that follow them across every repository and workflow on Codeplane. Today, variables can only be set at the repository level, forcing users to duplicate the same non-sensitive configuration—preferred build flags, default region strings, formatting preferences, or tool version pins—into every repository they work in. User-level variables solve this by letting a user define named key-value pairs once, in their account settings, and have those values available in every workflow run, workspace session, and agent invocation scoped to that user.

The experience should feel identical to managing repository variables: a user navigates to their Settings area, opens the Variables section, and sees an alphabetically sorted list of their current variables with names, values, and timestamps. They can create a new variable by filling in a name and a value, update an existing variable by submitting the same name with a new value, or delete variables they no longer need. The values are plaintext and always visible—this is not a secrets store. Variables are meant for non-sensitive configuration that the user wants to inspect, copy, and share freely.

User-level variables are scoped exclusively to the authenticated user. They are not visible to other users, organization administrators, or repository collaborators. When a workflow executes for a given user, user-level variables are merged with repository-level variables, with repository-level values taking precedence in the event of a name collision. This gives teams a clean layering model: users set personal defaults, repositories override where needed.

## Acceptance Criteria

### Functional Requirements

- Users can view a list of all their personal variables on a dedicated settings page.
- Users can create a new variable by providing a name and a value.
- Users can update an existing variable by submitting the same name with a different value (upsert semantics).
- Users can delete any of their own variables with a confirmation step.
- Variable names must match the pattern `^[a-zA-Z_][a-zA-Z0-9_]*$`.
- Variable names must be between 1 and 255 characters after trimming whitespace.
- Variable names are case-sensitive (`MY_VAR` and `my_var` are distinct).
- Variable values must be non-empty strings.
- Variable values must not exceed 64 KiB (65,536 bytes).
- Variable values are stored in plaintext and returned in full in all API responses.
- The variable list is sorted alphabetically by name.
- The upsert endpoint returns `201 Created` for both creation and update operations.
- On creation, `created_at` and `updated_at` are identical.
- On update, `created_at` is preserved and `updated_at` is refreshed.
- The settings sidebar navigation includes a "Variables" entry linking to the variables page.
- The settings home page includes a summary card for variables showing the count and a "Manage →" link.
- Empty state is displayed when no variables exist, with a clear call-to-action.
- Submitting an empty name or an empty value produces an inline validation error.
- Submitting a name with invalid characters produces a specific inline validation error.
- Submitting a value exceeding 64 KiB produces a specific error message.
- Deleting a variable requires a confirmation dialog before executing.

### Edge Cases

- Leading and trailing whitespace on names is trimmed before validation and storage.
- A name consisting entirely of whitespace is rejected as empty.
- A name at exactly 255 characters is accepted; a name at 256 characters is rejected.
- A value at exactly 65,536 bytes is accepted; a value at 65,537 bytes is rejected.
- A name starting with a digit (e.g., `1FOO`) is rejected with code `invalid`.
- A name containing special characters (e.g., `MY-VAR`, `MY.VAR`, `MY VAR`) is rejected.
- Attempting to delete a variable that was already deleted returns a `404`.
- Concurrent upserts with the same name result in a deterministic final state (last write wins).
- Unicode characters in values are accepted (values are arbitrary strings); names remain ASCII-only.
- An upsert that sets the same value as the existing value still updates `updated_at`.

### Definition of Done

- The user settings variables page is accessible at `/settings/variables` and renders correctly.
- The settings sidebar includes a "Variables" navigation item with the correct active state.
- The settings home page summary card shows the variable count and links to the variables page.
- All CRUD operations work end-to-end from the web UI, CLI, and API.
- All validation rules are enforced both client-side (for immediate feedback) and server-side (as the authoritative boundary).
- The feature is covered by Playwright E2E tests, CLI integration tests, and API integration tests.
- Telemetry events fire correctly for all create, update, and delete operations.
- Observability metrics and structured logs are in place.
- Documentation for the settings page, CLI commands, and API endpoints is published.

## Design

### Web UI Design

#### Navigation Integration

The user settings sidebar adds a new entry:

| Position | Icon | Label | Route |
|----------|------|-------|-------|
| After "Connected Accounts" (position 8) | `{ }` or key icon | Variables | `/settings/variables` |

The sidebar item follows the existing pattern: 4px left-border accent when active, bold label, subtle background highlight.

#### Settings Home Summary Card

A new summary card is added to the settings home grid:

```
┌─────────────────────────────────────────────┐
│  { }  Variables                              │
│                                              │
│  {count} variable(s)                         │
│  Last updated: {relative_date}               │
│                                              │
│  Manage variables →                          │
└─────────────────────────────────────────────┘
```

- If `count === 0`: display "No variables configured" and "Add a variable →".
- The card shows a skeleton loader while the variable count is being fetched.
- If the fetch fails, the card shows an error state with a "Retry" button.

#### Variables List Page (`/settings/variables`)

**Page Header:**
- Title: "User Variables"
- Subtitle: "Variables are non-sensitive key-value pairs available to your workflows, workspaces, and agents across all repositories. For sensitive values, use Secrets instead."

**Creation Form** (always visible above the list, in a bordered card):

```
┌─────────────────────────────────────────────────────────┐
│  Name                                                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │ e.g., PREFERRED_REGION                             │  │
│  └────────────────────────────────────────────────────┘  │
│  Must start with a letter or underscore. Letters,        │
│  digits, and underscores only.                    0/255  │
│                                                          │
│  Value                                                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │                                                    │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│  Plaintext. Visible in API responses and logs.    0/64K  │
│                                                          │
│  ┌─────────────────┐                                    │
│  │  Save variable   │  (disabled until both fields     │
│  └─────────────────┘   have valid content)              │
└─────────────────────────────────────────────────────────┘
```

- **Name field**: `<input type="text" maxlength="255">`, character counter appears when name exceeds 200 characters.
- **Value field**: `<textarea>` with monospace font, character counter shows bytes used / 64 KiB.
- **Save button**: Primary style, disabled when name is empty, value is empty, or name fails pattern validation. Shows "Saving…" spinner during submission.
- On successful save: the form clears, the list updates (optimistically inserts or updates the entry), and a toast notification confirms "Variable saved" or "Variable updated".
- On validation error: inline error message appears beneath the relevant field in red.
- When editing an existing variable (clicking "Edit" in the list): the form pre-fills with the existing name (read-only) and value. The button label changes to "Update variable".

**Variable List Table** (below the form):

| Column | Width | Content |
|--------|-------|---------|
| Name | ~200px, flex | Variable name in monospace, bold |
| Value | ~flex | Full value text, truncated with ellipsis at ~120 chars, full value in tooltip on hover |
| Created | ~140px | Relative time (e.g., "3 days ago"), exact ISO 8601 on hover |
| Updated | ~140px | Relative time, exact ISO 8601 on hover |
| Actions | ~120px | "Edit" (text button) and "Delete" (destructive text button, red) |

- Sorted alphabetically by name (ascending).
- No pagination—user-level variables are expected to remain in the low hundreds at most.
- Rows use alternating subtle background for readability.

**Delete Confirmation Dialog** (modal):

```
┌─────────────────────────────────────────────┐
│  Delete variable                            │
│                                              │
│  Are you sure you want to delete "MY_VAR"?  │
│  This action cannot be undone. Any workflow  │
│  or workspace referencing this variable will │
│  no longer receive its value.                │
│                                              │
│       [Cancel]         [Delete variable]     │
│                        (red, destructive)    │
└─────────────────────────────────────────────┘
```

- Cancel is secondary style, receives default focus.
- Delete button shows spinner during request.
- On success: modal closes, variable removed from list (optimistic), toast confirms "Variable deleted".
- On error: modal stays open, error message displayed inline.

**Empty State** (when zero variables):

```
         { }
  No user variables yet.

  Variables let you define non-sensitive
  configuration available across all your
  repositories and workflows.

  [Create your first variable]
```

The "Create your first variable" button scrolls to / focuses the name field in the creation form.

**Loading State:**
- Skeleton rows matching the table layout (4 skeleton rows).
- Creation form remains interactive during list loading.

**Error State:**
- Error banner above the list: "Failed to load variables. [Retry]"
- Creation form remains accessible even if the list fails to load.

#### Responsive Behavior

- **≥1024px**: Two-column layout (sidebar + content), full table with all columns.
- **768px–1023px**: Single-column layout, sidebar collapses to horizontal tabs, table drops "Created" column.
- **<768px**: Stacked layout, table becomes card-based list (name, value, updated date, actions per card).

### API Shape

#### List User Variables

```
GET /api/user/variables
Authorization: Bearer <token> | cookie session
```

**Response 200:**
```json
[
  {
    "id": 42,
    "user_id": 7,
    "name": "PREFERRED_REGION",
    "value": "us-east-1",
    "created_at": "2026-03-15T10:30:00Z",
    "updated_at": "2026-03-20T14:22:00Z"
  }
]
```

**Response 401:**
```json
{ "message": "authentication required" }
```

#### Create or Update User Variable

```
POST /api/user/variables
Authorization: Bearer <token> | cookie session
Content-Type: application/json

{
  "name": "PREFERRED_REGION",
  "value": "us-east-1"
}
```

**Response 201:**
```json
{
  "id": 42,
  "user_id": 7,
  "name": "PREFERRED_REGION",
  "value": "us-east-1",
  "created_at": "2026-03-15T10:30:00Z",
  "updated_at": "2026-03-22T09:00:00Z"
}
```

**Response 422:**
```json
{
  "message": "Validation Failed",
  "errors": [
    { "resource": "Variable", "field": "name", "code": "invalid" }
  ]
}
```

**Response 401:**
```json
{ "message": "authentication required" }
```

#### Delete User Variable

```
DELETE /api/user/variables/:name
Authorization: Bearer <token> | cookie session
```

**Response 204:** No content.

**Response 404:**
```json
{ "message": "not found" }
```

**Response 401:**
```json
{ "message": "authentication required" }
```

### SDK Shape

```typescript
// packages/sdk/src/services/secret.ts (extended)

interface UserVariable {
  id: number;
  user_id: number;
  name: string;
  value: string;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

// New methods on SecretService (or a dedicated UserVariableService)
listUserVariables(userId: string): Promise<Result<UserVariable[], APIError>>
setUserVariable(userId: string, name: string, value: string): Promise<Result<UserVariable, APIError>>
getUserVariable(userId: string, name: string): Promise<Result<UserVariable, APIError>>
deleteUserVariable(userId: string, name: string): Promise<Result<void, APIError>>
```

Validation rules are identical to repository-level variables:
- Name: `^[a-zA-Z_][a-zA-Z0-9_]*$`, 1–255 chars, trimmed.
- Value: non-empty, max 64 KiB.

### CLI Command

```
codeplane variable list --user
codeplane variable get NAME --user
codeplane variable set NAME --body VALUE --user
codeplane variable delete NAME --user
```

The `--user` flag disambiguates user-level from repo-level variables. When `--user` is passed, the CLI targets `/api/user/variables` instead of `/api/repos/:owner/:repo/variables`.

**Output Formats:**

```bash
# List (default table format)
$ codeplane variable list --user
NAME                VALUE           CREATED              UPDATED
PREFERRED_REGION    us-east-1       2026-03-15T10:30Z    2026-03-20T14:22Z
BUILD_FLAGS         --release       2026-03-10T08:00Z    2026-03-10T08:00Z

# List (JSON format)
$ codeplane variable list --user --json
[{"id":42,"user_id":7,"name":"PREFERRED_REGION","value":"us-east-1",...}]

# Get single variable
$ codeplane variable get PREFERRED_REGION --user
us-east-1

# Set (create or update)
$ codeplane variable set PREFERRED_REGION --body us-west-2 --user
✓ Variable "PREFERRED_REGION" saved.

# Delete
$ codeplane variable delete PREFERRED_REGION --user
✓ Variable "PREFERRED_REGION" deleted.
```

**Error output:**
```bash
$ codeplane variable set 1INVALID --body foo --user
Error: Validation Failed
  name: must start with a letter or underscore and contain only letters, digits, and underscores.
```

### TUI UI

The TUI settings screen adds a "Variables" entry to the sidebar navigation.

**Variables Screen Layout (120×40):**

```
┌─────────────────────────────────────────────────────────────┐
│ Settings > Variables                                         │
├──────────────┬──────────────────────────────────────────────┤
│ 1. Home      │ User Variables                               │
│ 2. Profile   │ Non-sensitive key-value configuration.       │
│ 3. Emails    │                                               │
│ 4. SSH Keys  │ [n] New variable                             │
│ 5. Tokens    │                                               │
│ 6. Sessions  │ NAME                VALUE       UPDATED      │
│ 7. Connected │ ───────────────────────────────────────────  │
│ 8. Notifs    │ ▸ BUILD_FLAGS       --release   3 days ago   │
│ 9. OAuth     │   PREFERRED_REGION  us-east-1   12 hours ago │
│ 10. Variables│                                               │
│              │                                               │
│              │ [e]dit  [d]elete  [n]ew  [/]search           │
├──────────────┴──────────────────────────────────────────────┤
│ j/k: navigate  Enter: edit  n: new  d: delete  ?: help      │
└─────────────────────────────────────────────────────────────┘
```

**Keybindings:**
- `n`: Open new variable form (inline at top of list)
- `e` or `Enter`: Edit selected variable (pre-fill form)
- `d`: Delete selected variable (inline confirmation in status bar)
- `j`/`k` or `↑`/`↓`: Navigate list
- `/`: Filter list by name substring
- `Esc`: Cancel form or filter

**New/Edit Form (inline):**
```
│ Name:  [____________________________]  │
│ Value: [____________________________]  │
│ [Ctrl+S] Save    [Esc] Cancel          │
```

**Delete Confirmation (status bar):**
```
│ Delete "BUILD_FLAGS"? This cannot be undone. [y/N] │
```

**Responsive Behavior:**
- **80×24**: Sidebar hidden, horizontal tab bar, single-line rows, value column truncated to ~20 chars.
- **200×60+**: Wider value column, timestamps show full ISO 8601 strings.

### Documentation

The following end-user documentation must be written:

1. **Settings Guide — Variables**: A page explaining what user variables are, how they differ from secrets, how they layer with repository variables, and step-by-step instructions for creating, updating, and deleting variables via the web UI.
2. **CLI Reference — `variable` command**: Updated to document the `--user` flag, with examples for list, get, set, and delete operations targeting user-level variables.
3. **API Reference — User Variables**: OpenAPI-style documentation for `GET /api/user/variables`, `POST /api/user/variables`, and `DELETE /api/user/variables/:name`.
4. **Workflows Guide — Variable Precedence**: A section explaining the merge order: user variables < repository variables (repo overrides user).

## Permissions & Security

### Authorization

| Operation | Required Role | Notes |
|-----------|--------------|-------|
| List own variables | Authenticated user | Only the authenticated user's own variables are returned |
| Get own variable | Authenticated user | Only the authenticated user can read their own variables |
| Create/update own variable | Authenticated user | Users can only write to their own variable namespace |
| Delete own variable | Authenticated user | Users can only delete their own variables |
| List another user's variables | Forbidden | User variables are never visible to other users |
| Admin access to user variables | Not supported | Admins do not have a route to read/write other users' variables |

### Rate Limiting

| Endpoint | Rate Limit | Window |
|----------|-----------|--------|
| `GET /api/user/variables` | 60 requests | per minute |
| `POST /api/user/variables` | 30 requests | per minute |
| `DELETE /api/user/variables/:name` | 30 requests | per minute |

Rate limits are per-authenticated-user and use the standard rate-limiting middleware.

### Data Privacy

- User variables are scoped exclusively to the owning user. No API path exposes one user's variables to another.
- Variable values are stored in plaintext. Users must be warned (via UI copy and documentation) not to store sensitive credentials, tokens, or passwords as variables. The Secrets feature is the appropriate store for sensitive values.
- Variable names and values must not appear in server logs. Only variable counts, name lengths, and value sizes may be logged.
- API responses for user variables require authentication; unauthenticated requests receive `401`, not `403`, to avoid leaking the existence of the endpoint.
- When a user account is deleted, all associated user variables must be cascade-deleted.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `UserVariableCreated` | A new user variable is created (name did not previously exist) | `user_id`, `variable_name`, `value_size_bytes`, `client` (web/cli/tui/api), `timestamp` |
| `UserVariableUpdated` | An existing user variable's value is changed | `user_id`, `variable_name`, `value_size_bytes`, `previous_value_size_bytes`, `client`, `timestamp` |
| `UserVariableDeleted` | A user variable is deleted | `user_id`, `variable_name`, `client`, `timestamp` |
| `UserVariableListViewed` | The user variables list page is loaded | `user_id`, `variable_count`, `client`, `timestamp` |
| `UserVariableSetFailed` | A create/update attempt failed validation | `user_id`, `error_code`, `field`, `client`, `timestamp` |

**Important**: Variable values must NEVER appear in telemetry events. Only sizes (in bytes) are recorded.

### Funnel Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| Adoption rate | % of active users with ≥1 user variable | ≥15% within 90 days of launch |
| Variables per user (P50) | Median number of user variables among adopters | 3–10 |
| Create-to-workflow-use | % of created variables that are referenced in a workflow run within 7 days | ≥40% |
| CLI vs. Web distribution | Ratio of variable operations from CLI vs. web | Track, no target |
| Settings page engagement | % of settings home visits that navigate to the Variables page | ≥8% |

### Success Indicators

- Users who configure user-level variables have higher workflow success rates (fewer missing-variable failures).
- Decrease in duplicate repository-level variables across repositories owned by the same user.
- Positive qualitative feedback about the variable layering model (user < repo precedence).

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Variable list requested | `info` | `request_id`, `user_id`, `result_count` | Never log variable names or values |
| Variable created | `info` | `request_id`, `user_id`, `variable_name`, `value_size_bytes` | Log name only, never value |
| Variable updated | `info` | `request_id`, `user_id`, `variable_name`, `value_size_bytes` | Log name only, never value |
| Variable deleted | `info` | `request_id`, `user_id`, `variable_name` | Log name only |
| Validation failure | `warn` | `request_id`, `user_id`, `field`, `error_code`, `name_length`, `value_size_bytes` | Never log the invalid name or value content |
| Database error | `error` | `request_id`, `user_id`, `operation`, `error_message` | Sanitize error messages to exclude user data |
| Rate limit exceeded | `warn` | `request_id`, `user_id`, `endpoint`, `limit`, `window` | |

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_user_variables_requests_total` | Counter | `method` (list/create/update/delete), `status` (success/error) | Total user variable API requests |
| `codeplane_user_variables_request_duration_seconds` | Histogram | `method`, `status` | Request latency distribution |
| `codeplane_user_variables_validation_errors_total` | Counter | `field` (name/value), `code` (missing_field/invalid/too_large) | Validation error breakdown |
| `codeplane_user_variables_total` | Gauge | — | Total number of user variables across all users |
| `codeplane_user_variables_per_user` | Histogram | — | Distribution of variable counts per user |
| `codeplane_user_variables_value_size_bytes` | Histogram | — | Distribution of variable value sizes |

### Alerts

#### Alert: High User Variable Error Rate

- **Condition**: `rate(codeplane_user_variables_requests_total{status="error"}[5m]) / rate(codeplane_user_variables_requests_total[5m]) > 0.1`
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_user_variables_validation_errors_total` to determine if errors are user-input validation failures (expected, non-actionable) or server-side errors.
  2. If validation errors dominate, check for UI/client bugs sending malformed requests. Review recent client deployments.
  3. If server errors dominate, check database connectivity: run `SELECT 1` against the user_variables table.
  4. Check recent deployments for migration issues or schema mismatches.
  5. Review structured logs filtered by `operation=user_variable` and `level=error` for specific error messages.
  6. If database-related, check PGLite/Postgres connection pool health and disk space.

#### Alert: User Variable Latency Spike

- **Condition**: `histogram_quantile(0.95, rate(codeplane_user_variables_request_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check database query performance: look for missing indexes on the `user_variables` table (should have index on `user_id, name`).
  2. Check overall database load: review connection pool saturation and active query counts.
  3. Check if a specific user has an unusually large number of variables causing slow list queries.
  4. Review recent schema migrations that may have dropped indexes.
  5. If isolated to list operations, consider if a user has hit a pathological case and check `codeplane_user_variables_per_user` histogram.

#### Alert: User Variable Storage Growth Anomaly

- **Condition**: `delta(codeplane_user_variables_total[1h]) > 1000`
- **Severity**: Critical
- **Runbook**:
  1. Check for automated/bot accounts creating variables in bulk—potential abuse vector.
  2. Review rate-limiting effectiveness: check if rate limits are being enforced correctly.
  3. Identify the user(s) responsible for the growth spike using database queries (count by user_id).
  4. If abuse is confirmed, temporarily block the offending user(s) and increase rate-limit strictness.
  5. Evaluate whether a per-user variable count limit should be introduced (recommended: 256 variables per user).

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|------------|-------------|----------|----------|
| Unauthenticated request | 401 | Return `authentication required` | Client redirects to login |
| Invalid variable name | 422 | Return validation error with field and code | Client shows inline error |
| Empty variable value | 422 | Return validation error with field `value` and code `missing_field` | Client shows inline error |
| Value exceeds 64 KiB | 422 | Return validation error with field `value` and code `invalid` | Client shows inline error with size info |
| Variable not found on delete | 404 | Return `not found` | Client removes from list if stale |
| Database connection failure | 500 | Return `internal server error`, log full error | Retry with exponential backoff; alert fires |
| Rate limit exceeded | 429 | Return `rate limit exceeded` with `Retry-After` header | Client displays rate limit message and backs off |
| Malformed JSON body | 400 | Return `invalid request body` | Client should never send malformed JSON; indicates a bug |
| Name collision during concurrent upsert | 201 | Last write wins (database upsert semantics) | No user action needed; deterministic |

## Verification

### API Integration Tests

| # | Test | Expected |
|---|------|----------|
| A1 | `GET /api/user/variables` with no variables | 200, empty array `[]` |
| A2 | `POST /api/user/variables` with valid name and value | 201, returns variable with `created_at === updated_at` |
| A3 | `POST /api/user/variables` with same name, different value | 201, `created_at` unchanged, `updated_at` refreshed, new value returned |
| A4 | `POST /api/user/variables` with same name, same value | 201, `updated_at` refreshed even though value is identical |
| A5 | `GET /api/user/variables` after creating 3 variables | 200, returns 3 variables sorted alphabetically by name |
| A6 | `DELETE /api/user/variables/:name` for existing variable | 204, no content |
| A7 | `DELETE /api/user/variables/:name` for non-existent variable | 404 |
| A8 | `GET /api/user/variables` without authentication | 401 |
| A9 | `POST /api/user/variables` without authentication | 401 |
| A10 | `DELETE /api/user/variables/:name` without authentication | 401 |
| A11 | `POST /api/user/variables` with empty name | 422, error code `missing_field`, field `name` |
| A12 | `POST /api/user/variables` with whitespace-only name | 422, error code `missing_field`, field `name` |
| A13 | `POST /api/user/variables` with name starting with digit | 422, error code `invalid`, field `name` |
| A14 | `POST /api/user/variables` with name containing hyphen | 422, error code `invalid`, field `name` |
| A15 | `POST /api/user/variables` with name containing space | 422, error code `invalid`, field `name` |
| A16 | `POST /api/user/variables` with name containing period | 422, error code `invalid`, field `name` |
| A17 | `POST /api/user/variables` with empty value | 422, error code `missing_field`, field `value` |
| A18 | `POST /api/user/variables` with name at exactly 255 characters | 201, variable created successfully |
| A19 | `POST /api/user/variables` with name at 256 characters | 422, error code `invalid`, field `name` |
| A20 | `POST /api/user/variables` with value at exactly 65,536 bytes | 201, variable created successfully |
| A21 | `POST /api/user/variables` with value at 65,537 bytes | 422, error code `invalid`, field `value` |
| A22 | `POST /api/user/variables` with name having leading/trailing whitespace | 201, name is trimmed, returned name has no whitespace |
| A23 | `POST /api/user/variables` with name `_underscore_start` | 201, valid name |
| A24 | `POST /api/user/variables` with name `A` (single character) | 201, valid name |
| A25 | `POST /api/user/variables` with name `_` (single underscore) | 201, valid name |
| A26 | `POST /api/user/variables` with malformed JSON body | 400, `invalid request body` |
| A27 | `POST /api/user/variables` with no body | 400, `invalid request body` |
| A28 | `POST /api/user/variables` with extra unknown fields in body | 201, extra fields ignored |
| A29 | User A cannot see User B's variables via `GET /api/user/variables` | 200, only User A's variables returned |
| A30 | `POST /api/user/variables` with Unicode characters in value | 201, value stored and returned correctly |
| A31 | `DELETE /api/user/variables/:name` then `GET /api/user/variables` | Variable is no longer in the list |
| A32 | Create variable, delete it, create same name again | 201, new `id` and timestamps |
| A33 | `POST /api/user/variables` with case-sensitive names `MY_VAR` and `my_var` | Both created as distinct variables |

### Web UI E2E Tests (Playwright)

| # | Test | Expected |
|---|------|----------|
| W1 | Navigate to `/settings/variables` | Page loads, shows "User Variables" heading and creation form |
| W2 | Empty state displays when no variables exist | Empty state message and CTA button visible |
| W3 | Create a variable via the form | Variable appears in the list, toast confirms creation |
| W4 | Create a variable with maximum length name (255 chars) | Variable created successfully, name displayed (truncated in table) |
| W5 | Attempt to create a variable with invalid name | Inline validation error appears below name field |
| W6 | Attempt to create a variable with empty value | Save button remains disabled |
| W7 | Edit an existing variable | Form pre-fills with name (read-only) and current value, update succeeds |
| W8 | Delete a variable via confirmation dialog | Confirmation dialog appears, variable removed from list after confirm |
| W9 | Cancel a delete operation | Dialog closes, variable remains in list |
| W10 | Verify list is sorted alphabetically | Create variables `ZZZ`, `AAA`, `MMM` — list shows `AAA`, `MMM`, `ZZZ` |
| W11 | Verify timestamps show relative time | "Created" and "Updated" columns show relative time strings |
| W12 | Verify timestamp tooltip shows exact ISO 8601 | Hover over relative time shows exact timestamp |
| W13 | Settings sidebar shows "Variables" with active state | Sidebar item highlighted when on `/settings/variables` |
| W14 | Settings home card shows variable count | Card displays correct count and "Manage →" link |
| W15 | Settings home card links to variables page | Clicking "Manage variables →" navigates to `/settings/variables` |
| W16 | Form clears after successful creation | Name and value fields are empty after saving |
| W17 | Long value is truncated in table with tooltip | Value cell shows ellipsis, full value visible on hover |
| W18 | Loading skeleton appears while data loads | Skeleton rows visible before data arrives |
| W19 | Error state with retry button on API failure | Mock API failure, verify error banner and Retry button |
| W20 | Responsive layout at mobile viewport (<768px) | Table switches to card layout, sidebar collapses |

### CLI Integration Tests

| # | Test | Expected |
|---|------|----------|
| C1 | `codeplane variable list --user` with no variables | Empty output or "No user variables found." |
| C2 | `codeplane variable set MY_VAR --body hello --user` | Success message: `✓ Variable "MY_VAR" saved.` |
| C3 | `codeplane variable list --user` after creating a variable | Table output with the variable |
| C4 | `codeplane variable get MY_VAR --user` | Outputs `hello` |
| C5 | `codeplane variable set MY_VAR --body updated --user` | Success message: `✓ Variable "MY_VAR" saved.` |
| C6 | `codeplane variable get MY_VAR --user` after update | Outputs `updated` |
| C7 | `codeplane variable delete MY_VAR --user` | Success message: `✓ Variable "MY_VAR" deleted.` |
| C8 | `codeplane variable get MY_VAR --user` after delete | Error: variable not found |
| C9 | `codeplane variable list --user --json` | Valid JSON array output |
| C10 | `codeplane variable set 1BAD --body foo --user` | Error with validation message about name pattern |
| C11 | `codeplane variable set --body foo --user` (no name) | Error: missing required argument |
| C12 | `codeplane variable set MY_VAR --user` (no --body) | Error: missing required flag --body |
| C13 | `codeplane variable delete NONEXISTENT --user` | Error: not found |
| C14 | `codeplane variable list --user` shows alphabetical order | Variables listed A–Z |
| C15 | `codeplane variable set LONG_NAME --body $(python3 -c "print('x'*65536)") --user` | Success (max value size) |
| C16 | `codeplane variable set LONG_NAME --body $(python3 -c "print('x'*65537)") --user` | Error: value exceeds maximum size |

### Cross-Client Consistency Tests

| # | Test | Expected |
|---|------|----------|
| X1 | Create variable via API, verify visible in web UI | Variable appears in list |
| X2 | Create variable via CLI, verify visible in web UI | Variable appears in list |
| X3 | Create variable via web UI, verify via CLI `get` | Correct value returned |
| X4 | Delete variable via CLI, verify removed from web UI | Variable no longer in list |
| X5 | Update variable via API, verify updated value in CLI | CLI shows new value |
| X6 | Create variables with case-different names via API, verify both in web UI | Both `MY_VAR` and `my_var` shown as distinct entries |

### Security and Isolation Tests

| # | Test | Expected |
|---|------|----------|
| S1 | Authenticate as User A, create variable, authenticate as User B, list variables | User B sees empty list (no cross-user leakage) |
| S2 | Attempt to access `/api/user/variables` with expired token | 401 |
| S3 | Attempt to access `/api/user/variables` with revoked PAT | 401 |
| S4 | Send 61 `GET /api/user/variables` requests in 1 minute | 429 on the 61st request |
| S5 | Send 31 `POST /api/user/variables` requests in 1 minute | 429 on the 31st request |
| S6 | Verify response headers do not leak internal info | No server version, stack traces, or internal IPs |
