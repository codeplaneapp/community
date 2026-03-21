# REPO_VARIABLE_LIST

Specification for REPO_VARIABLE_LIST.

## High-Level User POV

When working with a repository on Codeplane, you frequently need non-sensitive configuration values — feature flags, environment names, build modes, service URLs — available to workflows, workspaces, and agent sessions. Unlike secrets, which are encrypted and never revealed after creation, variables are plaintext configuration that you can freely read, audit, and share. The ability to list them is the foundational view that lets you understand what configuration is currently defined for a given repository.

As a repository collaborator, you navigate to a repository's settings or use the CLI to see which variables exist. You see a sorted list of variable names — `NODE_ENV`, `BUILD_MODE`, `API_BASE_URL` — along with their current values, and when each variable was created and last updated. Because variables are non-sensitive by design, the full value is always visible in the list. This transparency is intentional: variables are the public counterpart to secrets, and their values are part of the information you need to understand your repository's runtime configuration at a glance.

This list is the starting point for variable management. From here, you can confirm that a required configuration value exists and is correct before running a workflow, spot outdated values that need to be changed, or identify variables that are no longer needed so they can be deleted. The list also helps onboarding — a new team member can quickly see what configuration the repository expects, along with the current values, without anyone having to explain settings one by one.

The variable list is accessible from the CLI via `codeplane variable list`, from the API as a standard GET endpoint, and is the data source for any UI or TUI variable management surface. It works identically whether Codeplane is running as a self-hosted server or in local daemon mode.

## Acceptance Criteria

- **Returns full variable objects including values**: The list response must include each variable's id, repository_id, name, value, created timestamp, and updated timestamp. Unlike secrets, variable values are always returned.
- **Alphabetically sorted**: Variables are returned sorted by name in ascending lexicographic order (A-Z, case-sensitive, underscore after uppercase letters per ASCII ordering).
- **Repository-scoped**: The list returns only variables belonging to the resolved repository. Variables from other repositories, organizations, or global scopes must never leak into the response.
- **All variables returned**: The endpoint returns all variables for the repository in a single response. There is no pagination, cursor, or limit parameter. This is the current contract.
- **Authentication required**: The request must be made by an authenticated user. Unauthenticated requests must be rejected.
- **Authorization via repository access**: The requesting user must have at least read access to the repository. If the repository does not exist or the user lacks access, the request fails with an appropriate error (404 for private repos, to avoid leaking existence).
- **Empty list for repositories with no variables**: A repository with zero variables must return an empty JSON array `[]`, not an error or null.
- **Consistent timestamp format**: `created_at` and `updated_at` must be ISO 8601 strings (e.g., `2026-03-22T14:30:00.000Z`).
- **Response field completeness**: Each variable object must contain exactly: `id` (number), `repository_id` (number), `name` (string), `value` (string), `created_at` (string), `updated_at` (string).
- **Invalid repository ID**: If the resolved repository ID is invalid (e.g., non-positive), the service must return a `400 Bad Request` error with message `"invalid repository id"`.
- **Non-existent owner or repo**: If the owner or repository name does not resolve, the route must return an appropriate error (404 Not Found).
- **Handles special characters in owner/repo URL path**: The route must correctly handle owner and repo names that are valid identifiers but could be URL-sensitive (e.g., hyphens, underscores).
- **Variable name constraints apply to stored data**: All listed variables must have names matching `^[a-zA-Z_][a-zA-Z0-9_]*$` and be at most 255 characters long. Variable values must be at most 64 KiB.
- **CLI `--repo` flag**: The CLI `variable list` command must accept an optional `--repo OWNER/REPO` flag. If omitted, the CLI must resolve the repository from local context.
- **CLI JSON output**: When `--json` is passed, the CLI must output valid JSON matching the API response structure.
- **Idempotent and safe**: Repeated calls to the list endpoint must return the same result (assuming no intervening mutations). The operation must have no side effects.

### Definition of Done

1. The API endpoint `GET /api/repos/:owner/:repo/variables` returns a correctly shaped `VariableResponse[]` for all valid requests.
2. The CLI `codeplane variable list` command correctly invokes the API and renders output.
3. Variable values are present and accurate in all response payloads.
4. Authorization is enforced — users without repo access cannot list variables.
5. All acceptance criteria above pass verification via automated E2E tests.
6. Observability instrumentation (logging, metrics) is in place.

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/variables`

**Path Parameters**:
| Parameter | Type   | Required | Description                    |
|-----------|--------|----------|--------------------------------|
| `owner`   | string | Yes      | Repository owner (user or org) |
| `repo`    | string | Yes      | Repository name                |

**Query Parameters**: None.

**Request Body**: None.

**Request Headers**:
- `Cookie` (session-based auth) or `Authorization: token <PAT>` (token-based auth)

**Success Response** (`200 OK`):
```json
[
  {
    "id": 1,
    "repository_id": 42,
    "name": "API_BASE_URL",
    "value": "https://api.example.com",
    "created_at": "2026-03-01T12:00:00.000Z",
    "updated_at": "2026-03-15T09:30:00.000Z"
  },
  {
    "id": 2,
    "repository_id": 42,
    "name": "NODE_ENV",
    "value": "production",
    "created_at": "2026-03-10T08:00:00.000Z",
    "updated_at": "2026-03-10T08:00:00.000Z"
  }
]
```

**Empty Response** (`200 OK`):
```json
[]
```

**Error Responses**:
| Status | Condition                              | Body Shape                                      |
|--------|----------------------------------------|-------------------------------------------------|
| 400    | Invalid repository ID resolved         | `{ "message": "invalid repository id" }`        |
| 401    | No authentication provided             | `{ "message": "authentication required" }`       |
| 404    | Owner or repo not found / no access    | `{ "message": "not found" }`                     |
| 500    | Unexpected server error                | `{ "message": "internal server error" }`          |

### SDK Shape

The `SecretService` class in `@codeplane/sdk` exposes:

```typescript
async listVariables(repositoryId: string): Promise<Result<VariableResponse[], APIError>>
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

The service validates `repositoryId > 0`, queries the `repository_variables` table (selecting `id`, `repository_id`, `name`, `value`, `created_at`, `updated_at`), maps rows to `VariableResponse`, and returns a `Result.ok` array. Unlike secrets, the `value` column is plaintext and is always included in the response.

### CLI Command

**Command**: `codeplane variable list`

**Synopsis**:
```
codeplane variable list [--repo OWNER/REPO] [--json]
```

**Options**:
| Flag           | Type    | Default             | Description                                  |
|----------------|---------|---------------------|----------------------------------------------|
| `--repo`, `-R` | string  | Resolved from local | Repository in OWNER/REPO format              |
| `--json`       | boolean | false               | Output as JSON instead of formatted table     |

**Default output (human-readable)**:
```
NAME              VALUE                          CREATED              UPDATED
API_BASE_URL      https://api.example.com        2026-03-01 12:00     2026-03-15 09:30
NODE_ENV          production                     2026-03-10 08:00     2026-03-10 08:00
```

**JSON output (`--json`)**: Outputs the raw API JSON array, suitable for piping to `jq` or programmatic consumption.

**Exit codes**:
- `0` — Success (even if list is empty)
- `1` — Authentication or authorization failure, network error, or server error

**Shell completions**: Bash, Zsh, and Fish completions are provided for `codeplane variable list`.

### Web UI Design

The web UI should present a "Variables" section within the repository settings page (`/:owner/:repo/settings`), positioned alongside the existing "Secrets" section:

- A table/list view showing each variable's name, value, created date, and last updated date.
- Variable values are displayed in full — unlike secrets, there is no masking or redaction because variables are non-sensitive by design.
- Long values should be truncated with an ellipsis in the table cell and expandable on hover or click, so the table layout remains readable.
- An empty state when no variables exist: "No variables configured for this repository. Variables are plaintext configuration values available to workflows and workspaces."
- Each row should include action affordances (edit, delete) linking to the REPO_VARIABLE_CREATE_OR_UPDATE and REPO_VARIABLE_DELETE features.
- Variables are displayed in alphabetical order matching the API sort.
- A "New variable" button at the top of the section for creating new variables.

### Documentation

End-user documentation should cover:

- **Concept page — "Repository Variables"**: What they are, how they differ from secrets (plaintext vs. encrypted), where they are injected (workflows, workspaces, agent sessions). Clarify that variables are for non-sensitive configuration and that anyone with repository read access can see their values.
- **CLI reference — `codeplane variable list`**: Synopsis, options, examples, and exit codes.
- **API reference — `GET /api/repos/:owner/:repo/variables`**: Request/response schema, authentication requirements, error codes.
- **Security note**: Explicitly state that variable values are plaintext and visible to all repository collaborators. Advise users to use secrets instead for any sensitive data like API keys, tokens, or passwords.

## Permissions & Security

### Authorization Roles

| Role        | Can List Variables? | Notes                                                                    |
|-------------|---------------------|--------------------------------------------------------------------------|
| Owner       | Yes                 | Full access                                                              |
| Admin       | Yes                 | Full access                                                              |
| Member      | Yes                 | Can view variable names and values for repos they have access to         |
| Read-Only   | Yes                 | Can see variable names and values, but cannot create/update/delete        |
| Anonymous   | No                  | Must be authenticated                                                    |

Authorization is enforced by `resolveRepoId()`, which delegates to `RepoService.getRepo()`. This function checks whether the actor has at least read access to the repository. For private repositories, unauthorized users receive a 404 (not 403) to avoid leaking the repository's existence.

### Rate Limiting

- The standard server-wide rate limiter applies to this endpoint.
- No feature-specific rate limit is required because the operation is read-only, returns bounded data (limited by the number of variables per repo), and does not involve expensive computation.
- If abuse is detected (e.g., automated scraping of variable values across many repos), the global rate limiter handles it.

### Data Privacy Constraints

- **Variable values are intentionally visible**: Unlike secrets, variable values are returned in plaintext. This is by design — variables are non-sensitive configuration. Users must be clearly warned not to store sensitive data (passwords, tokens, API keys) in variables.
- **Variable names and values may reveal infrastructure details**: Names like `PROD_API_URL` and values like `https://internal.example.com` reveal topology. This is acceptable because only authenticated users with repository access can see them, which is the same trust boundary as seeing the repository's source code.
- **No PII in variable metadata**: Variable names, values, and timestamps are not inherently PII. If a user puts PII in a variable name or value, that is a user-side concern, but documentation should advise against it.
- **Audit logging**: Variable list access should be logged for security audit trails, especially for repositories with compliance requirements.

## Telemetry & Product Analytics

### Business Events

| Event Name                | Trigger                                          | Properties                                                                                             |
|---------------------------|--------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| `RepoVariableListViewed`  | Successful 200 response from the list endpoint   | `repository_id`, `owner`, `repo`, `actor_id`, `variable_count`, `client` (web/cli/tui/api), `timestamp` |

### Properties Detail

- `repository_id` (number): The resolved repository ID.
- `owner` (string): The repository owner name.
- `repo` (string): The repository name.
- `actor_id` (number): The authenticated user's ID.
- `variable_count` (number): The number of variables returned in the response.
- `client` (string): The originating client surface — `"web"`, `"cli"`, `"tui"`, or `"api"` (direct API call).
- `timestamp` (string): ISO 8601 timestamp of the event.

### Funnel Metrics & Success Indicators

- **Variable adoption rate**: Percentage of repositories that have at least one variable configured. Tracked by observing `variable_count > 0` in `RepoVariableListViewed` events.
- **Variable management flow completion**: Users who list variables -> create/update a variable -> use variables in a workflow. This multi-step funnel indicates healthy variable lifecycle engagement.
- **CLI vs. Web distribution**: Ratio of `RepoVariableListViewed` events by `client` type, indicating which surfaces are most used for variable management.
- **Variables vs. secrets adoption ratio**: Comparison of `RepoVariableListViewed` vs. `RepoSecretListViewed` events to understand whether users appropriately segment sensitive vs. non-sensitive configuration.
- **Stale variable detection potential**: Repositories where all variables have `updated_at` older than 90 days may indicate configuration drift — useful for future product nudges.

## Observability

### Logging Requirements

| Log Point                        | Level  | Structured Fields                                                      | When                                      |
|----------------------------------|--------|------------------------------------------------------------------------|-------------------------------------------|
| Variable list requested          | `info` | `owner`, `repo`, `actor_id`, `request_id`                             | On every request to the endpoint          |
| Variable list success            | `info` | `owner`, `repo`, `actor_id`, `variable_count`, `latency_ms`, `request_id` | On successful 200 response                |
| Repository resolution failure    | `warn` | `owner`, `repo`, `actor_id`, `error`, `request_id`                    | When `resolveRepoId()` throws             |
| Service layer error              | `error`| `owner`, `repo`, `actor_id`, `error`, `request_id`                    | When `listVariables()` returns `Result.err`|
| Unexpected exception             | `error`| `owner`, `repo`, `actor_id`, `error_stack`, `request_id`              | When the catch block fires                |

All logs must include `request_id` from the middleware for request tracing.

### Prometheus Metrics

| Metric Name                                | Type      | Labels                                  | Description                                          |
|--------------------------------------------|-----------|-----------------------------------------|------------------------------------------------------|
| `codeplane_repo_variable_list_total`       | Counter   | `status` (success, error), `error_type` | Total list requests and their outcomes                |
| `codeplane_repo_variable_list_duration_ms` | Histogram | `status`                                | Latency distribution for list requests (buckets: 5, 10, 25, 50, 100, 250, 500, 1000 ms) |
| `codeplane_repo_variable_count`            | Gauge     | `repository_id`                         | Number of variables per repository (updated on list)  |

### Alerts

**Alert 1: High Variable List Error Rate**
- **Condition**: `rate(codeplane_repo_variable_list_total{status="error"}[5m]) / rate(codeplane_repo_variable_list_total[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check the server logs filtered by `request_id` for the failing requests.
  2. Determine if errors are `400` (client-sent bad repo IDs) or `500` (server-side).
  3. If 500s: check database connectivity — run `SELECT 1` against the database. Check if the `repository_variables` table exists and is accessible.
  4. If 400s: check if a misbehaving client or bot is sending malformed requests. Review the `owner` and `repo` fields in the logs.
  5. If database is healthy, check if the `SecretService` constructor has a valid SQL connection.
  6. Escalate to backend on-call if not resolved within 15 minutes.

**Alert 2: High Variable List Latency**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_repo_variable_list_duration_ms_bucket[5m])) > 500`
- **Severity**: Warning
- **Runbook**:
  1. Check database query performance: `EXPLAIN ANALYZE SELECT id, repository_id, name, value, created_at, updated_at FROM repository_variables WHERE repository_id = $1 ORDER BY name`.
  2. Verify the `repository_variables` table has an index on `(repository_id, name)` (the unique constraint should serve as this index).
  3. Check if the database is under heavy load — review connection pool metrics and active query counts.
  4. Check if a single repository has an unusually large number of variables causing slow scans, or if a single variable has an extremely large value.
  5. If the index is missing, create it: the unique constraint on `(repository_id, name)` should cover this.
  6. Escalate to DBA on-call if latency persists.

### Error Cases and Failure Modes

| Error Case                          | Expected Behavior                                  | HTTP Status |
|-------------------------------------|----------------------------------------------------|-------------|
| Unauthenticated request             | Reject with authentication required message        | 401         |
| User lacks repo access              | Return not found (no existence leak)               | 404         |
| Non-existent owner                  | Return not found                                   | 404         |
| Non-existent repo                   | Return not found                                   | 404         |
| Invalid repository ID (internal)    | Return bad request                                 | 400         |
| Database connection failure         | Return internal server error, log with stack trace | 500         |
| Database query timeout              | Return internal server error, log with timeout info| 500         |
| Malformed URL path parameters       | Router-level 404 or 400                            | 400/404     |

## Verification

### API E2E Tests

1. **List variables for a repository with multiple variables**: Create 3 variables (`ALPHA`, `BRAVO`, `CHARLIE`) with known values, call `GET /api/repos/:owner/:repo/variables`, assert response is `200`, response body is an array of length 3, names are `["ALPHA", "BRAVO", "CHARLIE"]` (alphabetical order), and all values are present and correct.

2. **List variables returns empty array for repo with no variables**: Create a fresh repository with no variables, call the list endpoint, assert `200` with `[]`.

3. **Variable values are present in list response**: Create a variable with a known value (`MY_VAR` = `hello-world`), list variables, assert that the returned object for `MY_VAR` includes `"value": "hello-world"`.

4. **Response shape validation**: For each object in the list, assert the presence of exactly `id` (number), `repository_id` (number), `name` (string), `value` (string), `created_at` (valid ISO 8601 string), `updated_at` (valid ISO 8601 string). Assert no extra fields.

5. **Alphabetical ordering**: Create variables in reverse order (`ZULU`, `MIKE`, `ALPHA`), list them, assert the returned order is `["ALPHA", "MIKE", "ZULU"]`.

6. **Unauthenticated request returns 401**: Call the list endpoint with no auth cookie and no `Authorization` header. Assert `401`.

7. **Unauthorized user receives 404 for private repo**: Create a private repository as user A, attempt to list variables as user B (who has no access). Assert `404`.

8. **Authorized user can list variables on a public repo**: Create a public repo as user A, add a variable, list variables as user B. Assert `200` and the variable is in the list with its value.

9. **Non-existent repository returns 404**: Call `GET /api/repos/alice/nonexistent-repo-xyz/variables`. Assert `404`.

10. **Non-existent owner returns 404**: Call `GET /api/repos/nonexistent-owner-xyz/somerepo/variables`. Assert `404`.

11. **Consistency after create**: Create a variable `NEW_KEY` with value `new-value`, immediately list, assert `NEW_KEY` appears with the correct value.

12. **Consistency after delete**: Create a variable `TEMP_KEY`, delete it, list, assert `TEMP_KEY` does not appear.

13. **Consistency after update**: Create `MY_KEY` with value `v1`, update to `v2`, list, assert `MY_KEY` appears with value `v2` and `updated_at` is more recent than `created_at`.

14. **Repository isolation**: Create two repositories, add different variables to each, list variables for repo A, assert only repo A's variables appear.

15. **Maximum number of variables**: Create 100 variables (names `VAR_001` through `VAR_100`), list, assert all 100 are returned and correctly ordered.

16. **Variable name at maximum length (255 characters)**: Create a variable with a 255-character valid name (e.g., `A` followed by 254 underscores), list, assert it appears with correct name and value.

17. **Variable name exceeding maximum length (256 characters) rejected during creation**: Attempt to create a variable with a 256-character name. Assert creation is rejected with a validation error. This ensures the list never contains over-length names.

18. **Variable value at maximum size (64 KiB)**: Create a variable with a value exactly 64 KiB in size (65,536 bytes), list, assert it appears with the full value intact.

19. **Variable value exceeding maximum size (64 KiB + 1 byte) rejected during creation**: Attempt to create a variable with a value of 65,537 bytes. Assert creation is rejected. This ensures the list never contains over-size values.

20. **Variable name with underscores and mixed case**: Create variables named `_PRIVATE`, `mixedCase_Key`, `ALL_CAPS`, list and assert all appear in correct sorted order.

21. **Timestamps are valid ISO 8601**: For every variable in the list response, parse `created_at` and `updated_at` as `Date` objects and assert they are valid dates (not `NaN`).

22. **PAT-based authentication works**: Call the list endpoint using an `Authorization: token <valid-PAT>` header. Assert `200`.

23. **Expired/revoked PAT returns 401**: Call the list endpoint with an invalid or revoked PAT. Assert `401`.

24. **Variable with empty-string value is not present**: Attempt to create a variable with an empty value. Assert creation is rejected (value is required), confirming the list will never contain empty-valued variables.

25. **Variable name with invalid characters rejected during creation**: Attempt to create a variable with name `MY-VAR` (contains hyphen) or `123_VAR` (starts with digit). Assert creation is rejected. This confirms the list only contains validly-named variables.

### CLI E2E Tests

26. **`codeplane variable list` with `--json` returns valid JSON array**: Run the CLI command, parse stdout as JSON, assert it is an array.

27. **`codeplane variable list` shows created variable with value**: Create a variable via CLI, list via CLI with `--json`, assert the variable name and value both appear.

28. **`codeplane variable list` with `--repo` flag**: Run `codeplane variable list --repo alice/myrepo --json`, assert it targets the correct repository.

29. **`codeplane variable list` with `-R` shorthand**: Run `codeplane variable list -R alice/myrepo --json`, assert same behavior as `--repo`.

30. **`codeplane variable list` exit code 0 on success**: Assert exit code is `0` for a valid authenticated request, even when the list is empty.

31. **`codeplane variable list` exit code non-zero on auth failure**: Run with an invalid token, assert non-zero exit code.

32. **`codeplane variable list` returns values**: Create a variable with a known value via `variable set`, list via CLI, assert the known value string appears in the output.

33. **`codeplane variable list` after delete shows removal**: Create variable, delete it, list, assert the deleted variable is absent from output.

34. **`codeplane variable list` multiple variables shown in alphabetical order**: Create `ZZZ_VAR` then `AAA_VAR`, list with `--json`, parse and assert `AAA_VAR` appears before `ZZZ_VAR`.

### Integration Tests (Service Layer)

35. **`SecretService.listVariables` with valid repo ID**: Call with a valid repository ID that has variables, assert `Result.ok` with correct array including values.

36. **`SecretService.listVariables` with valid repo ID and no variables**: Call with a repo ID that has no variables, assert `Result.ok` with empty array.

37. **`SecretService.listVariables` with invalid repo ID (0)**: Assert `Result.err` with `"invalid repository id"`.

38. **`SecretService.listVariables` with negative repo ID**: Assert `Result.err` with `"invalid repository id"`.

39. **`SecretService.listVariables` with empty string repo ID**: Assert `Result.err` with `"invalid repository id"`.

40. **Value column inclusion**: Verify at the SQL level that the `listVariables` query DOES select `value`. This is a static assertion on the query string, and is the inverse of the secret list test which asserts value exclusion.

41. **Ordering correctness at DB level**: Insert variables out of order, call `listVariables`, assert returned order matches `ORDER BY name`.
