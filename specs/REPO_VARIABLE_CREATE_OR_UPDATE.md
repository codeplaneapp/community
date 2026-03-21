# REPO_VARIABLE_CREATE_OR_UPDATE

Specification for REPO_VARIABLE_CREATE_OR_UPDATE.

## High-Level User POV

When configuring a repository on Codeplane, you frequently need non-sensitive configuration values — build flags, environment names, feature toggles, API base URLs, or version strings — available to workflows, workspaces, and agent sessions. Repository variables serve this purpose. Unlike secrets, variables store plaintext values that are visible to anyone with repository access, making them ideal for configuration that is not confidential but needs to be centrally managed and consistently available across all automation surfaces.

Creating or updating a variable is a single unified action. You provide a name and a value, and Codeplane either creates the variable if it doesn't exist or overwrites the value if a variable with that name already exists. This upsert behavior means you never need to check whether a variable already exists before setting it — the operation is always safe and idempotent in its final state. If you set `NODE_ENV` to `production` twice, the result is the same: a single variable named `NODE_ENV` with the value `production` and a refreshed `updated_at` timestamp.

From the CLI, you run `codeplane variable set NODE_ENV --body production` and the variable is immediately available. From the API, you POST a JSON body with the name and value. The web UI provides a form where you type a name and value and click save. In all cases, the operation is instant and the variable is available to subsequent workflow runs, workspace sessions, and agent tooling that reads the repository's variable environment.

Variables are scoped to a single repository. Setting `NODE_ENV` on one repository has no effect on any other repository. This isolation ensures that teams can independently manage their configuration without cross-contamination.

The create-or-update operation is the primary write path for repository variables. It is used both for initial provisioning (a new repository being configured for the first time) and for ongoing maintenance (updating a deploy target URL after an infrastructure migration). The same command, endpoint, and UI action handles both cases seamlessly.

## Acceptance Criteria

- **Upsert semantics**: If no variable with the given name exists in the repository, a new variable is created. If a variable with that name already exists, its value is overwritten and `updated_at` is refreshed. The name match is exact and case-sensitive.
- **Name is required and non-empty**: The variable name must not be empty or whitespace-only. Requests with a missing or blank name must be rejected with a validation error.
- **Value is required and non-empty**: The variable value must not be empty. Requests with a missing or empty value must be rejected with a validation error.
- **Name format constraint**: Variable names must match the pattern `^[a-zA-Z_][a-zA-Z0-9_]*$` — they must start with a letter or underscore and contain only letters, digits, and underscores. Names that violate this pattern must be rejected with a validation error.
- **Name maximum length**: Variable names must not exceed 255 characters. Names longer than 255 characters must be rejected with a validation error.
- **Value maximum size**: Variable values must not exceed 64 KiB (65,536 bytes). Values larger than 64 KiB must be rejected with a validation error.
- **Name is trimmed before storage**: Leading and trailing whitespace on the name is stripped before persistence. The returned name reflects the trimmed form.
- **Value is stored as-is**: The value is stored in plaintext without any encryption. It is returned verbatim in responses.
- **Response includes full variable object**: On success, the response contains the complete variable record: `id`, `repository_id`, `name`, `value`, `created_at`, `updated_at`.
- **HTTP 201 on both create and update**: The endpoint returns `201 Created` for both create and update outcomes. This is the current contract.
- **Repository-scoped**: The variable is stored against the resolved repository only. It does not affect or appear in other repositories.
- **Authentication required**: The request must be made by an authenticated user. Unauthenticated requests are rejected with 401.
- **Authorization via repository write access**: The requesting user must have write access to the repository. Users with only read access cannot create or update variables.
- **Consistent timestamp format**: `created_at` and `updated_at` are ISO 8601 strings.
- **On create, `created_at` equals `updated_at`**: A freshly created variable has identical creation and update timestamps.
- **On update, `updated_at` is refreshed**: When overwriting an existing variable, `updated_at` reflects the current time while `created_at` remains the original creation time.
- **Idempotent final state**: Setting the same name and value multiple times results in the same stored state (the value is the same). Only `updated_at` changes on repeated calls.
- **Invalid JSON body returns 400**: A request with a body that is not valid JSON returns `400 Bad Request` with message `"invalid request body"`.
- **Content-Type must be JSON for mutation**: The middleware enforces JSON content type on POST requests.
- **Non-existent owner or repo returns 404**: If the owner or repository cannot be resolved, the endpoint returns 404.
- **Private repo access returns 404 for unauthorized users**: To avoid leaking repository existence, unauthorized users receive 404, not 403.
- **CLI `variable set` command**: The CLI exposes `codeplane variable set NAME --body VALUE [--repo OWNER/REPO]` which calls the API and outputs the created/updated variable.
- **CLI JSON output**: When `--json` is passed, the CLI outputs the API response as valid JSON.
- **Multiple variables with different names coexist**: Creating variables `A` and `B` in the same repository does not interfere; both persist independently.
- **Special valid names**: Names like `_PRIVATE`, `__DOUBLE_UNDERSCORE`, `a`, `A1`, and `_` (single underscore) are all valid and accepted.
- **Names starting with a digit are rejected**: Names like `1_BAD`, `9VAR` must be rejected by the pattern validation.
- **Names with special characters are rejected**: Names like `MY-VAR`, `MY.VAR`, `MY VAR`, `MY@VAR` must be rejected.
- **Empty body object `{}` returns validation error**: Submitting an empty JSON object triggers validation failure for missing `name` field.

### Definition of Done

1. The API endpoint `POST /api/repos/:owner/:repo/variables` correctly creates or updates a variable and returns the full variable object with a 201 status.
2. The CLI `codeplane variable set NAME --body VALUE` correctly invokes the API and renders output.
3. Variable values are stored in plaintext and returned in full in responses.
4. All name and value validation constraints are enforced with appropriate error responses.
5. Authorization is enforced — users without write access cannot create/update variables.
6. Upsert behavior is correct — duplicate names overwrite the value and refresh `updated_at`.
7. All acceptance criteria pass verification via automated E2E tests.
8. Observability instrumentation (logging, metrics, analytics events) is in place.
9. End-user documentation covers CLI usage, API reference, and the conceptual difference between variables and secrets.

## Design

### API Shape

**Endpoint**: `POST /api/repos/:owner/:repo/variables`

**Path Parameters**:
| Parameter | Type   | Required | Description                    |
|-----------|--------|----------|--------------------------------|
| `owner`   | string | Yes      | Repository owner (user or org) |
| `repo`    | string | Yes      | Repository name                |

**Query Parameters**: None.

**Request Headers**:
- `Content-Type: application/json` (enforced by middleware)
- `Cookie` (session-based auth) or `Authorization: token <PAT>` (token-based auth)

**Request Body**:
```json
{
  "name": "NODE_ENV",
  "value": "production"
}
```

| Field   | Type   | Required | Constraints                                                       |
|---------|--------|----------|-------------------------------------------------------------------|
| `name`  | string | Yes      | 1–255 chars, matches `^[a-zA-Z_][a-zA-Z0-9_]*$`, trimmed         |
| `value` | string | Yes      | 1–65,536 bytes (64 KiB), non-empty                                |

**Success Response** (`201 Created`):
```json
{
  "id": 7,
  "repository_id": 42,
  "name": "NODE_ENV",
  "value": "production",
  "created_at": "2026-03-22T14:30:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses**:
| Status | Condition                              | Body Shape                                                           |
|--------|----------------------------------------|----------------------------------------------------------------------|
| 400    | Invalid JSON body                      | `{ "message": "invalid request body" }`                              |
| 400    | Invalid repository ID (internal)       | `{ "message": "invalid repository id" }`                             |
| 401    | No authentication provided             | `{ "message": "authentication required" }`                           |
| 404    | Owner or repo not found / no access    | `{ "message": "not found" }`                                         |
| 422    | Name missing or empty                  | `{ "message": "Validation Failed", "errors": [{ "resource": "Variable", "field": "name", "code": "missing_field" }] }` |
| 422    | Name too long or invalid pattern       | `{ "message": "Validation Failed", "errors": [{ "resource": "Variable", "field": "name", "code": "invalid" }] }`       |
| 422    | Value missing or empty                 | `{ "message": "Validation Failed", "errors": [{ "resource": "Variable", "field": "value", "code": "missing_field" }] }` |
| 422    | Value exceeds 64 KiB                   | `{ "message": "Validation Failed", "errors": [{ "resource": "Variable", "field": "value", "code": "invalid" }] }`       |
| 500    | Unexpected server error                | `{ "message": "internal server error" }`                              |

### SDK Shape

The `SecretService` class in `@codeplane/sdk` exposes:

```typescript
async setVariable(
  repositoryId: string,
  name: string,
  value: string
): Promise<Result<VariableResponse, APIError>>
```

**`VariableResponse` interface**:
```typescript
interface VariableResponse {
  id: number;
  repository_id: number;
  name: string;
  value: string;
  created_at: string;  // ISO 8601
  updated_at: string;  // ISO 8601
}
```

The service validates `repositoryId > 0`, trims the name, checks that both name and value are non-empty, delegates to `createOrUpdateVariable()` which performs a PostgreSQL `INSERT ... ON CONFLICT DO UPDATE`, and returns the full variable record wrapped in `Result.ok`.

### CLI Command

**Command**: `codeplane variable set`

**Synopsis**:
```
codeplane variable set NAME --body VALUE [--repo OWNER/REPO] [--json]
```

**Arguments**:
| Argument | Type   | Required | Description       |
|----------|--------|----------|-------------------|
| `NAME`   | string | Yes      | The variable name |

**Options**:
| Flag           | Type    | Default             | Description                              |
|----------------|---------|---------------------|------------------------------------------|
| `--body`       | string  | (required)          | The variable value                       |
| `--repo`, `-R` | string  | Resolved from local | Repository in OWNER/REPO format          |
| `--json`       | boolean | false               | Output as JSON instead of formatted text |

**JSON output (`--json`)**: Outputs the raw API JSON response object.

**Exit codes**:
- `0` — Success (variable created or updated)
- `1` — Authentication failure, authorization failure, validation error, network error, or server error

**Known CLI mismatch**: The current CLI implementation sends `PUT` to the variables endpoint, but the server only accepts `POST`. This must be reconciled — the CLI should use `POST` to match the server's route definition.

### Web UI Design

The web UI should provide a variable management surface within the repository settings page (`/:owner/:repo/settings`), in a "Variables" section:

- A "New variable" or "Add variable" button that opens an inline form or modal.
- The form contains two fields: **Name** (text input) and **Value** (text area or text input).
- Name input should have a placeholder like `VARIABLE_NAME` and inline validation reflecting the `^[a-zA-Z_][a-zA-Z0-9_]*$` pattern. Invalid characters should be flagged with a helper message: "Variable names must start with a letter or underscore and contain only letters, digits, and underscores."
- Name input should show a character counter or validation warning as it approaches the 255-character limit.
- Value input should have a placeholder like `variable value` and a size indicator as it approaches the 64 KiB limit.
- A "Save variable" button submits the form. On success, the variable list refreshes and a success toast appears.
- If a variable with the same name already exists, the form should still succeed (upsert). The UI may optionally show a confirmation or simply save silently per upsert semantics.
- Editing an existing variable should pre-populate the form with the current name (read-only) and current value (editable).
- Validation errors from the API should be surfaced inline next to the relevant field.
- The value field is plaintext and visible — there is no masking. A helper note should clarify: "Variable values are stored in plaintext. For sensitive data, use Secrets instead."

### TUI UI

The TUI does not currently have a dedicated variables management screen. The CLI is the primary terminal-based interface for variable management.

### Documentation

End-user documentation should cover:

- **Concept page — "Repository Variables"**: What they are, how they differ from secrets (plaintext vs. encrypted), where they are injected (workflows, workspaces, agent sessions), when to use variables vs. secrets.
- **CLI reference — `codeplane variable set`**: Synopsis, arguments, options, examples, exit codes, and the upsert behavior.
- **API reference — `POST /api/repos/:owner/:repo/variables`**: Full request/response schema, all validation constraints, all error codes, authentication requirements, and the upsert behavior.
- **Variable naming rules**: Explicitly document the name pattern, the 255-character limit, and the 64 KiB value limit.
- **Security note**: Explicitly state that variable values are stored in plaintext and visible in API responses and workflow logs. Sensitive credentials should use repository secrets instead.
- **Variables vs. Secrets comparison table**: A side-by-side comparison: storage (plaintext vs. AES-256-GCM), visibility (values returned vs. names only), CLI input method (`--body` vs. `--body-stdin`), use case (configuration vs. credentials).

## Permissions & Security

### Authorization Roles

| Role        | Can Create/Update Variables? | Notes                                                                |
|-------------|------------------------------|----------------------------------------------------------------------|
| Owner       | ✅ Yes                       | Full access                                                          |
| Admin       | ✅ Yes                       | Full access                                                          |
| Member      | ✅ Yes                       | Members with write access to the repository can manage variables     |
| Read-Only   | ❌ No                        | Can view variables via list but cannot create or modify them         |
| Anonymous   | ❌ No                        | Must be authenticated; receives 401                                  |

Authorization is enforced in two layers:
1. The route handler checks `getUser(c)` and returns 401 if no actor is present.
2. `resolveRepoId()` delegates to `RepoService.getRepo()` which verifies the actor has access. For private repositories, unauthorized users receive 404 to avoid leaking repository existence.

Write access enforcement should be added at the route or service layer to ensure read-only collaborators cannot create/update variables even though they can resolve the repository.

### Rate Limiting

- The standard server-wide rate limiter applies to this endpoint.
- An additional per-repository rate limit of **60 requests per minute** per authenticated user is recommended for the variables mutation endpoint, to prevent:
  - Bulk variable flooding (intentional or accidental scripting loops).
  - Denial-of-service via repeated large-value writes consuming storage.
- If a user exceeds the rate limit, the endpoint returns `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy Constraints

- **Variable values are plaintext**: Values are stored without encryption and returned in full in API responses. Users must be clearly warned not to store sensitive data as variables.
- **Variable names and values may contain configuration details**: Names like `PROD_DB_HOST` and values like `db.internal.company.com` could reveal infrastructure topology. This is acceptable because only authenticated users with repository access can see them.
- **No PII should be stored as variables**: Documentation should advise against storing PII (email addresses, API keys, passwords) as variables. Secrets should be used for any sensitive material.
- **Audit logging**: Variable create and update operations should be logged for security audit trails, including the actor, repository, variable name, and timestamp. The variable value should **not** be included in audit logs to limit exposure surface area.

## Telemetry & Product Analytics

### Business Events

| Event Name                    | Trigger                                                       | Properties                                                                                                                     |
|-------------------------------|---------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| `RepoVariableCreated`        | A new variable is created (no prior variable with that name)  | `repository_id`, `owner`, `repo`, `actor_id`, `variable_name`, `value_size_bytes`, `client`, `timestamp`                       |
| `RepoVariableUpdated`        | An existing variable's value is overwritten                   | `repository_id`, `owner`, `repo`, `actor_id`, `variable_name`, `value_size_bytes`, `client`, `timestamp`                       |
| `RepoVariableSetFailed`      | The set operation fails for any reason                        | `repository_id`, `owner`, `repo`, `actor_id`, `error_type` (validation, auth, not_found, internal), `client`, `timestamp`      |

### Properties Detail

- `repository_id` (number): The resolved repository ID.
- `owner` (string): The repository owner name.
- `repo` (string): The repository name.
- `actor_id` (number): The authenticated user's ID.
- `variable_name` (string): The name of the variable being set.
- `value_size_bytes` (number): The byte length of the variable value (not the value itself — never log the value in analytics).
- `client` (string): The originating client surface — `"web"`, `"cli"`, `"tui"`, or `"api"`.
- `error_type` (string): The category of failure.
- `timestamp` (string): ISO 8601 timestamp.

**Note**: To distinguish create from update, the service or route layer should check whether the returned `created_at` equals `updated_at` (create) or differs (update). Alternatively, the database upsert can return an `is_new` flag via `xmax = 0` in PostgreSQL.

### Funnel Metrics & Success Indicators

- **Variable adoption rate**: Percentage of active repositories with at least one variable. Higher is better — indicates the feature is providing value.
- **Create-to-workflow funnel**: Users who set a variable → reference that variable in a workflow definition → run the workflow. Indicates variables are being used as intended.
- **Update frequency**: Average number of updates per variable per week. High update frequency suggests variables are being used for dynamic configuration.
- **Error rate**: `RepoVariableSetFailed` / total set attempts. Should remain below 2% for non-validation errors.
- **CLI vs. Web distribution**: Ratio of `RepoVariableCreated` / `RepoVariableUpdated` events by `client` type.
- **Value size distribution**: Histogram of `value_size_bytes` to understand whether users are storing small config strings or large blobs.

## Observability

### Logging Requirements

| Log Point                             | Level   | Structured Fields                                                                     | When                                          |
|---------------------------------------|---------|--------------------------------------------------------------------------------------|-----------------------------------------------|
| Variable set requested                | `info`  | `owner`, `repo`, `actor_id`, `variable_name`, `value_size_bytes`, `request_id`       | On every POST request to the endpoint         |
| Variable created                      | `info`  | `owner`, `repo`, `actor_id`, `variable_name`, `variable_id`, `latency_ms`, `request_id` | On successful create (new variable)           |
| Variable updated                      | `info`  | `owner`, `repo`, `actor_id`, `variable_name`, `variable_id`, `latency_ms`, `request_id` | On successful update (existing variable)      |
| Variable set validation failed        | `warn`  | `owner`, `repo`, `actor_id`, `field`, `code`, `request_id`                           | When name or value validation fails           |
| Repository resolution failure         | `warn`  | `owner`, `repo`, `actor_id`, `error`, `request_id`                                   | When `resolveRepoId()` throws                 |
| Authentication missing                | `warn`  | `owner`, `repo`, `request_id`                                                        | When no actor present on request              |
| Service layer error                   | `error` | `owner`, `repo`, `actor_id`, `variable_name`, `error`, `request_id`                  | When `setVariable()` returns `Result.err`     |
| Unexpected exception                  | `error` | `owner`, `repo`, `actor_id`, `error_stack`, `request_id`                             | When the catch block fires                    |
| Invalid JSON body                     | `warn`  | `owner`, `repo`, `actor_id`, `request_id`                                            | When body parsing fails                       |

**Critical rules**:
- **Never log the variable value**. Log `value_size_bytes` instead.
- All logs must include `request_id` from the middleware for request tracing.

### Prometheus Metrics

| Metric Name                                    | Type      | Labels                                                    | Description                                                                    |
|------------------------------------------------|-----------|-----------------------------------------------------------|--------------------------------------------------------------------------------|
| `codeplane_repo_variable_set_total`            | Counter   | `status` (created, updated, error), `error_type`          | Total set requests and their outcomes                                          |
| `codeplane_repo_variable_set_duration_ms`      | Histogram | `status`                                                  | Latency distribution for set requests (buckets: 5, 10, 25, 50, 100, 250, 500, 1000 ms) |
| `codeplane_repo_variable_set_validation_errors`| Counter   | `field` (name, value), `code` (missing_field, invalid)    | Count of validation rejections by field and code                               |
| `codeplane_repo_variable_value_size_bytes`     | Histogram | —                                                         | Distribution of variable value sizes (buckets: 64, 256, 1024, 4096, 16384, 65536 bytes) |
| `codeplane_repo_variable_count`                | Gauge     | `repository_id`                                           | Number of variables per repository (updated on set/delete)                     |

### Alerts

**Alert 1: High Variable Set Error Rate**
- **Condition**: `rate(codeplane_repo_variable_set_total{status="error"}[5m]) / rate(codeplane_repo_variable_set_total[5m]) > 0.10`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs filtered by `request_id` for the failing requests in the 5-minute window.
  2. Classify errors by type: if predominantly `validation` errors (422), this indicates client-side issues (misbehaving script, unclear UI) — not a server problem. Monitor but do not escalate.
  3. If errors are 500s: check database connectivity. Run `SELECT 1` against the database.
  4. Check if the `repository_variables` table exists and the unique constraint on `(repository_id, name)` is intact: `\d repository_variables`.
  5. Check if the `SecretService` has a valid SQL connection by reviewing connection pool metrics.
  6. If a specific repository is causing all errors, check if it has been deleted or corrupted.
  7. Escalate to backend on-call if 500-class errors persist for more than 10 minutes.

**Alert 2: High Variable Set Latency**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_repo_variable_set_duration_ms_bucket[5m])) > 1000`
- **Severity**: Warning
- **Runbook**:
  1. Check database query performance: `EXPLAIN ANALYZE INSERT INTO repository_variables (repository_id, name, value) VALUES ($1, $2, $3) ON CONFLICT (repository_id, name) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW() RETURNING *`.
  2. Verify the `repository_variables` table has the unique index on `(repository_id, name)` — the ON CONFLICT clause depends on it.
  3. Check if the database is under heavy write load — review WAL lag, active transactions, and lock contention.
  4. Check if large values (near 64 KiB) are causing I/O overhead — review `codeplane_repo_variable_value_size_bytes` histogram for spikes.
  5. Check network latency between the application server and database.
  6. Escalate to DBA on-call if latency persists after verifying indexes and load.

**Alert 3: Variable Value Size Approaching Limit**
- **Condition**: `histogram_quantile(0.99, rate(codeplane_repo_variable_value_size_bytes_bucket[1h])) > 60000`
- **Severity**: Info
- **Runbook**:
  1. Review which repositories are storing near-maximum-size variables.
  2. Consider whether the 64 KiB limit is sufficient for the use cases observed, or whether the product should offer structured configuration files instead.
  3. No immediate action required — this is an informational alert for product planning.

### Error Cases and Failure Modes

| Error Case                                 | Expected Behavior                                       | HTTP Status |
|--------------------------------------------|---------------------------------------------------------|-------------|
| Unauthenticated request                    | Reject with authentication required                     | 401         |
| User lacks write access to repo            | Return not found (no existence leak for private repos)  | 404         |
| Non-existent owner                         | Return not found                                        | 404         |
| Non-existent repo                          | Return not found                                        | 404         |
| Invalid JSON body                          | Return bad request with "invalid request body"          | 400         |
| Empty body `{}`                            | Validation error for missing name field                 | 422         |
| Name is empty string                       | Validation error for missing name                       | 422         |
| Name is whitespace only                    | Validation error for missing name                       | 422         |
| Name exceeds 255 characters                | Validation error for invalid name                       | 422         |
| Name contains invalid characters           | Validation error for invalid name                       | 422         |
| Name starts with digit                     | Validation error for invalid name                       | 422         |
| Value is empty string                      | Validation error for missing value                      | 422         |
| Value exceeds 64 KiB                       | Validation error for invalid value                      | 422         |
| Database connection failure                | Return internal server error, log with stack trace      | 500         |
| Database constraint violation (unexpected) | Return internal server error, log with details          | 500         |
| `createOrUpdateVariable` returns null      | Return internal server error "failed to store variable" | 500         |
| Invalid repository ID (internal)           | Return bad request "invalid repository id"              | 400         |
| Non-JSON Content-Type on POST              | Middleware rejects before reaching handler              | 415         |

## Verification

### API E2E Tests

1. **Create a new variable**: POST `{ "name": "MY_VAR", "value": "hello" }` to `/api/repos/:owner/:repo/variables`. Assert `201`, response has `name: "MY_VAR"`, `value: "hello"`, and valid `id`, `repository_id`, `created_at`, `updated_at`.

2. **Update an existing variable**: Create `MY_VAR` with value `v1`, then POST again with `{ "name": "MY_VAR", "value": "v2" }`. Assert `201`, response has `value: "v2"`, `created_at` is unchanged from the first response, `updated_at` is equal to or later than the first response's `updated_at`.

3. **Upsert idempotency**: Create `IDEMPOTENT_VAR` with value `stable`, call set again with the same name and value. Assert `201`, value is still `stable`.

4. **Response shape validation**: Assert the response contains exactly `id` (number), `repository_id` (number), `name` (string), `value` (string), `created_at` (valid ISO 8601), `updated_at` (valid ISO 8601). Assert no extra fields.

5. **Created timestamp equals updated timestamp on create**: Create a new variable, assert `created_at === updated_at`.

6. **Updated timestamp advances on update**: Create a variable, wait briefly, update it, assert `updated_at > created_at`.

7. **Name trimming**: POST `{ "name": "  TRIMMED  ", "value": "val" }`. Assert `201` and `name` in response is `"TRIMMED"`.

8. **Name validation — empty string**: POST `{ "name": "", "value": "val" }`. Assert `422` with error on field `name`, code `missing_field`.

9. **Name validation — whitespace only**: POST `{ "name": "   ", "value": "val" }`. Assert `422` with error on field `name`, code `missing_field`.

10. **Name validation — starts with digit**: POST `{ "name": "1BAD", "value": "val" }`. Assert `422` with error on field `name`, code `invalid`.

11. **Name validation — contains hyphen**: POST `{ "name": "MY-VAR", "value": "val" }`. Assert `422` with error on field `name`, code `invalid`.

12. **Name validation — contains dot**: POST `{ "name": "MY.VAR", "value": "val" }`. Assert `422` with error on field `name`, code `invalid`.

13. **Name validation — contains space**: POST `{ "name": "MY VAR", "value": "val" }`. Assert `422` with error on field `name`, code `invalid`.

14. **Name validation — contains special character**: POST `{ "name": "MY@VAR", "value": "val" }`. Assert `422`.

15. **Name at maximum length (255 characters)**: POST a name that is exactly 255 characters (`A` + 254 `_` characters). Assert `201` and the full name is returned.

16. **Name exceeding maximum length (256 characters)**: POST a name that is 256 characters. Assert `422` with error on field `name`, code `invalid`.

17. **Value validation — empty string**: POST `{ "name": "VALID_NAME", "value": "" }`. Assert `422` with error on field `value`, code `missing_field`.

18. **Value at maximum size (64 KiB)**: POST a value that is exactly 65,536 bytes. Assert `201` and the full value is returned correctly.

19. **Value exceeding maximum size (64 KiB + 1 byte)**: POST a value that is 65,537 bytes. Assert `422` with error on field `value`, code `invalid`.

20. **Value with special characters**: POST a value containing newlines, tabs, unicode, emoji, and JSON-like strings. Assert `201` and the value is returned verbatim.

21. **Unauthenticated request returns 401**: POST without auth. Assert `401`.

22. **Unauthorized user receives 404 for private repo**: Create a private repo as user A, attempt to set a variable as user B. Assert `404`.

23. **Non-existent repository returns 404**: POST to `/api/repos/alice/nonexistent-repo-xyz/variables`. Assert `404`.

24. **Non-existent owner returns 404**: POST to `/api/repos/nonexistent-owner-xyz/somerepo/variables`. Assert `404`.

25. **Invalid JSON body**: POST with body `not json` and `Content-Type: application/json`. Assert `400` with `"invalid request body"`.

26. **Empty JSON object**: POST `{}`. Assert `422` (validation failure for missing name).

27. **Missing value field**: POST `{ "name": "VALID" }`. Assert `422` (validation failure for missing value).

28. **Missing name field**: POST `{ "value": "something" }`. Assert `422` (validation failure for missing name).

29. **Valid name patterns**: Test each of `_PRIVATE`, `__DOUBLE`, `a`, `A1`, `_`, `UPPER_CASE_123`, `mixedCase`. Assert `201` for all.

30. **Repository isolation**: Create variable `X` on repo A, create variable `X` on repo B with different value. List variables on repo A, assert value is repo A's value, not repo B's.

31. **Multiple variables coexist**: Create `VAR_A` and `VAR_B` in the same repo. Assert both appear in a subsequent list call.

32. **PAT-based authentication works**: POST using `Authorization: token <valid-PAT>`. Assert `201`.

33. **Consistency with list endpoint**: Create a variable via POST, immediately list variables, assert the new variable appears in the list with the correct name and value.

### CLI E2E Tests

34. **`codeplane variable set` creates a variable**: Run `codeplane variable set MY_VAR --body my-value --repo OWNER/REPO --json`. Assert exit code `0` and stdout contains valid JSON.

35. **`codeplane variable set` updates an existing variable**: Set `MY_VAR` to `v1`, then set `MY_VAR` to `v2`. Assert exit code `0`. Run `codeplane variable get MY_VAR` and assert value is `v2`.

36. **`codeplane variable set` with `--repo` flag**: Run with explicit `--repo alice/myrepo`. Assert it targets the correct repository.

37. **`codeplane variable set` with `-R` shorthand**: Run with `-R alice/myrepo`. Assert same behavior as `--repo`.

38. **`codeplane variable set` JSON output**: Run with `--json`, parse stdout as JSON, assert it has `name`, `value`, `id`, `repository_id`, `created_at`, `updated_at`.

39. **`codeplane variable set` exit code 0 on success**: Assert exit code is `0`.

40. **`codeplane variable set` exit code non-zero on auth failure**: Run with invalid auth. Assert non-zero exit code.

41. **`codeplane variable set` with missing --body flag**: Run without `--body`. Assert non-zero exit code and helpful error message.

42. **`codeplane variable set` round-trip with list**: Set a variable via CLI, list via CLI, assert the variable appears.

43. **`codeplane variable set` round-trip with get**: Set a variable via CLI, get via CLI, assert name and value match.

44. **`codeplane variable set` overwrite verified via get**: Set `MY_VAR` to `old`, set `MY_VAR` to `new`, get `MY_VAR`, assert value is `new`.

45. **Multiple variables via CLI**: Set `A`, `B`, `C` via CLI, list via CLI, assert all three appear.

### Playwright (Web UI) E2E Tests

46. **Create a variable via the UI**: Navigate to repo settings, open the variables section, fill in name and value, click save. Assert the variable appears in the list.

47. **Edit an existing variable via the UI**: Create a variable, click edit, change the value, save. Assert the updated value appears.

48. **Name validation in the UI**: Type an invalid name (e.g., `1BAD`), attempt to save. Assert an inline error message appears and the save does not proceed.

49. **Empty name validation in the UI**: Leave name empty, attempt to save. Assert validation error.

50. **Empty value validation in the UI**: Fill in a valid name but leave value empty, attempt to save. Assert validation error.

51. **Plaintext warning visible**: Assert that the UI displays a note indicating variables are stored in plaintext and that secrets should be used for sensitive data.

52. **Variable appears in list after creation**: Create variable via UI, assert the variables list updates to include it without a page reload.
