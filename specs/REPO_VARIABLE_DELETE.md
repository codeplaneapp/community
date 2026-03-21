# REPO_VARIABLE_DELETE

Specification for REPO_VARIABLE_DELETE.

## High-Level User POV

When managing a repository on Codeplane, you frequently configure plaintext variables — build flags, public endpoint URLs, default locales, feature-toggle values — that workflows, workspaces, and agent sessions consume at runtime. Over time, some of these variables become obsolete: a migration completes, a feature flag is retired, or an integration is decommissioned. Repository variable deletion lets you remove those stale entries so your configuration stays clean and your team is never confused about which variables are actually in use.

As a repository collaborator with write access, you delete a variable by specifying its name. From the CLI you run `codeplane variable delete MY_VARIABLE`, from the API you issue a `DELETE` request against the variable's named endpoint, and from the web UI you click the delete action on the variable's row in the settings table. In every case, the experience is the same: the variable is immediately and permanently removed. Any subsequent workflow run, workspace boot, or agent session that referenced the deleted variable will no longer receive it. The deletion is irreversible — there is no soft-delete, recycle bin, or undo. If you need the variable again, you must re-create it with a new value.

Deleting a variable that does not exist is a silent success at the server level — the system does not error on double-deletes because the postcondition (the variable is gone) is already satisfied. This idempotency simplifies scripted cleanup and automation. However, the CLI currently treats a non-existent delete as an error for user-facing feedback; the server itself returns 204 regardless.

Variable deletion is scoped strictly to the current repository. Deleting `MY_VARIABLE` in `alice/frontend` has no effect on a variable with the same name in `alice/backend` or any other repository. Authorization is enforced through repository access — you must have write-level access to the repository to delete variables.

## Acceptance Criteria

- **Permanent removal**: Deleting a variable permanently removes it from the `repository_variables` table. There is no soft-delete, trash, or recovery mechanism.
- **Name-based addressing**: The variable to delete is identified by its exact name. Names are case-sensitive (`MY_VAR` and `my_var` are different variables).
- **Name validation**: The variable name must match the pattern `^[a-zA-Z_][a-zA-Z0-9_]*$` and must be between 1 and 255 characters (inclusive). Names that fail validation must be rejected with a `422 Validation Failed` response before any database operation occurs.
- **Trimming behavior**: The service layer trims whitespace from the variable name before validation and deletion. Leading/trailing whitespace in the URL path parameter or CLI argument does not cause a mismatch.
- **Empty name rejected**: A name that is empty or consists entirely of whitespace must be rejected with a `400 Bad Request` ("variable name is required").
- **Authentication required**: The request must be made by an authenticated user (session cookie, PAT, or OAuth token). Unauthenticated requests must return `401`.
- **Authorization via repository write access**: The requesting user must have write access to the repository. Read-only users, members without write privileges, and anonymous users must be denied. Private repositories must return `404` (not `403`) for unauthorized users to avoid leaking existence.
- **Repository-scoped**: The deletion only affects the variable in the specified repository. Variables with the same name in other repositories are not affected.
- **Idempotent at the server level**: Deleting a variable that does not exist at the database level succeeds silently with `204 No Content`. The DELETE SQL statement affects zero rows, which is acceptable.
- **204 No Content on success**: The API returns HTTP 204 with no response body on a successful deletion.
- **No response body**: The 204 response must have an empty body — no JSON, no whitespace, no trailing newline.
- **Immediate effect**: After a successful delete, the variable must not appear in any subsequent `GET /api/repos/:owner/:repo/variables` response.
- **Workflow impact**: Any workflow run initiated after the deletion must not receive the deleted variable in its environment injection. Runs already in progress are unaffected.
- **CLI confirmation output**: The CLI must return `{ "status": "deleted", "name": "<NAME>" }` as JSON output on success and exit with code `0`.
- **CLI non-zero exit code on failure**: The CLI must exit with a non-zero code if the API returns an error status (401, 404, 422, 500).
- **Special characters in URL path**: The variable name in the URL path must be properly handled. Since valid variable names only contain `[a-zA-Z0-9_]`, URL encoding is not a concern for valid inputs, but percent-encoded path segments must not bypass validation.
- **Non-existent repository returns 404**: If the `owner` or `repo` does not exist, the endpoint returns `404 Not Found`.
- **Invalid repository ID (internal)**: If repository resolution produces an invalid ID (≤ 0), the service returns `400 Bad Request`.

### Definition of Done

1. The API endpoint `DELETE /api/repos/:owner/:repo/variables/:name` correctly deletes the variable and returns `204 No Content`.
2. The CLI command `codeplane variable delete <NAME>` correctly invokes the API and renders structured output.
3. The web UI settings page allows variable deletion with a confirmation dialog.
4. Authorization is enforced — users without write access cannot delete variables.
5. Name validation rejects all invalid names before reaching the database.
6. All acceptance criteria above pass verification via automated E2E tests.
7. Observability instrumentation (logging, metrics, events) is in place.
8. End-user documentation covers the CLI command, API endpoint, and web UI flow.

## Design

### API Shape

**Endpoint**: `DELETE /api/repos/:owner/:repo/variables/:name`

**Path Parameters**:

| Parameter | Type   | Required | Description                                  |
|-----------|--------|----------|----------------------------------------------|
| `owner`   | string | Yes      | Repository owner (username or organization)  |
| `repo`    | string | Yes      | Repository name                              |
| `name`    | string | Yes      | Variable name to delete                      |

**Query Parameters**: None.

**Request Body**: None. Any request body is ignored.

**Request Headers**:
- `Cookie` (session-based auth) **or** `Authorization: token <PAT>` (token-based auth)

**Success Response** (`204 No Content`):
- Empty body.
- No `Content-Type` header required.

**Error Responses**:

| Status | Condition                                       | Body Shape                                             |
|--------|-------------------------------------------------|--------------------------------------------------------|
| 400    | Variable name is empty/whitespace               | `{ "message": "variable name is required" }`           |
| 401    | No authentication provided                      | `{ "message": "authentication required" }`             |
| 404    | Owner/repo not found or user lacks access       | `{ "message": "not found" }`                           |
| 422    | Variable name fails regex or length validation  | `{ "message": "Validation Failed", "errors": [{ "resource": "Variable", "field": "name", "code": "invalid" }] }` |
| 500    | Unexpected server error                         | `{ "message": "internal server error" }`               |

### SDK Shape

The `SecretService` class in `@codeplane/sdk` exposes:

```typescript
async deleteVariable(
  repositoryId: string,
  name: string
): Promise<Result<void, APIError>>
```

**Behavior**:
1. Validates `repositoryId` is a positive number; returns `Result.err(badRequest("invalid repository id"))` otherwise.
2. Validates `name.trim()` is non-empty; returns `Result.err(badRequest("variable name is required"))` otherwise.
3. Calls `deleteVariable(sql, { repositoryId, name: name.trim() })` which executes `DELETE FROM repository_variables WHERE repository_id = $1 AND name = $2`.
4. Returns `Result.ok(undefined)` regardless of whether a row was actually deleted (idempotent).

### CLI Command

**Command**: `codeplane variable delete <NAME>`

**Synopsis**:
```
codeplane variable delete <NAME> [--repo OWNER/REPO] [--json]
```

**Positional Arguments**:

| Argument | Type   | Required | Description             |
|----------|--------|----------|-------------------------|
| `NAME`   | string | Yes      | The variable name       |

**Options**:

| Flag           | Type    | Default             | Description                              |
|----------------|---------|---------------------|------------------------------------------|
| `--repo`, `-R` | string  | Resolved from local | Repository in OWNER/REPO format          |
| `--json`       | boolean | false               | Output as JSON instead of human text     |

**JSON output (`--json`)**:
```json
{ "status": "deleted", "name": "MY_VARIABLE" }
```

**Human-readable output (default)**:
```
Variable MY_VARIABLE deleted.
```

**Exit codes**:
- `0` — Variable deleted successfully.
- `1` — Authentication failure, authorization failure, network error, server error, or API error.

**Shell completions**: Bash, Zsh, and Fish completions provided for `codeplane variable delete`.

### Web UI Design

The variable delete action is part of the repository settings page at `/:owner/:repo/settings/variables`.

**Trigger**: Each variable row in the settings table displays a delete icon button (trash icon) at the end of the row. This button is only visible to users with write access.

**Confirmation dialog**: Clicking the delete button opens a confirmation dialog:
- **Title**: "Delete variable"
- **Body**: "Are you sure you want to delete the variable **{NAME}**? This action cannot be undone. Workflows and workspaces that depend on this variable will no longer receive it."
- **Primary action button**: "Delete" (destructive/red styling)
- **Secondary action button**: "Cancel"

**Loading state**: While the DELETE request is in flight, the "Delete" button in the dialog shows a spinner and is disabled to prevent double-submission.

**Success behavior**: On receiving a 204 response, the dialog closes, the variable disappears from the table (either via optimistic removal or refetch), and a toast notification appears: "Variable {NAME} deleted."

**Error behavior**: If the API returns an error, the dialog remains open, the error message is shown inline within the dialog, and the "Delete" button re-enables so the user can retry or cancel.

**Empty state**: If the last variable is deleted, the table is replaced by the empty-state message: "No variables configured for this repository. Variables are plaintext key-value pairs available to workflows and workspaces."

**Read-only users**: The delete button is not rendered for users with read-only access. The entire actions column is hidden if the user cannot mutate variables.

### Documentation

End-user documentation should cover:

- **Concept page — "Repository Variables"**: What variables are, how they differ from secrets (plaintext vs. encrypted), where they are injected (workflows, workspaces, agent sessions), and the permanence of deletion.
- **CLI reference — `codeplane variable delete`**: Synopsis, positional arguments, options, output format, exit codes, and examples including `codeplane variable delete MY_VAR --repo alice/frontend`.
- **API reference — `DELETE /api/repos/:owner/:repo/variables/:name`**: Path parameters, authentication requirements, response codes, and example curl command.
- **Web UI guide — "Managing Repository Variables"**: Screenshot-annotated walkthrough of the settings page, delete flow, and confirmation dialog.
- **Migration/cleanup note**: Guidance on scripting bulk variable cleanup using the CLI (e.g., `codeplane variable list --json | jq -r '.[].name' | xargs -I{} codeplane variable delete {}`).

## Permissions & Security

### Authorization Roles

| Role       | Can Delete Variables? | Notes                                                                   |
|------------|----------------------|-------------------------------------------------------------------------|
| Owner      | ✅ Yes               | Full access to all repository settings                                  |
| Admin      | ✅ Yes               | Full access to repository settings                                      |
| Member (write) | ✅ Yes           | Can manage variables for repositories they have write access to         |
| Member (read)  | ❌ No            | Can view variables but cannot delete                                    |
| Read-Only  | ❌ No                | Cannot modify repository configuration                                  |
| Anonymous  | ❌ No                | Must be authenticated; receives 401                                     |

Authorization is enforced by `resolveRepoId()`, which delegates to `RepoService.getRepo()`. For private repositories, unauthorized users receive a `404` (not `403`) to prevent leaking the repository's existence.

### Rate Limiting

- The standard server-wide rate limiter applies to this endpoint.
- No feature-specific rate limit is required beyond the global limit. Variable deletion is bounded by the number of variables per repository, which is naturally small.
- If abuse is detected (e.g., automated deletion across many repositories), the global rate limiter handles it.
- Consider future enhancement: require re-authentication or CAPTCHA for bulk deletion (more than 10 variables in a 1-minute window per user per repo).

### Data Privacy Constraints

- **Variable values are not returned**: The DELETE endpoint returns 204 with no body. The deleted variable's value is never included in the response.
- **Variable names may be semi-sensitive**: Names like `PROD_API_ENDPOINT` reveal infrastructure details. This is acceptable because only authenticated users with repository write access can trigger deletion, and they already have visibility into the repository's source code and configuration.
- **No PII in variable metadata**: Variable names and values are not inherently PII. If a user stores PII in a variable value, that value is permanently deleted from the database — deletion is a data-privacy-positive action.
- **Audit logging**: Variable deletion should be logged for security audit trails, including the actor ID, repository, and deleted variable name (but not value, which is already gone).
- **Webhook fan-out**: If webhook events for repository configuration changes are implemented in the future, the deleted variable's value must not be included in the webhook payload — only the name.

## Telemetry & Product Analytics

### Business Events

| Event Name             | Trigger                                                   | Properties                                                                                                      |
|------------------------|-----------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| `RepoVariableDeleted`  | Successful 204 response from the delete endpoint          | `repository_id`, `owner`, `repo`, `actor_id`, `variable_name`, `client` (web/cli/tui/api), `timestamp`          |
| `RepoVariableDeleteFailed` | Non-2xx response from the delete endpoint             | `repository_id` (if resolved), `owner`, `repo`, `actor_id`, `variable_name`, `error_code`, `client`, `timestamp` |

### Properties Detail

- `repository_id` (number): The resolved repository ID. May be absent if resolution failed.
- `owner` (string): The repository owner name from the request path.
- `repo` (string): The repository name from the request path.
- `actor_id` (number): The authenticated user's ID.
- `variable_name` (string): The name of the variable targeted for deletion.
- `client` (string): The originating client surface — `"web"`, `"cli"`, `"tui"`, or `"api"`.
- `error_code` (number): The HTTP status code for failure events.
- `timestamp` (string): ISO 8601 timestamp of the event.

### Funnel Metrics & Success Indicators

- **Variable hygiene rate**: Percentage of repositories where at least one variable has been deleted over the trailing 30 days. Indicates active configuration management.
- **Delete-after-create latency**: Time between a variable's `created_at` and its deletion event. Short lifespans may indicate experimentation; very long lifespans may indicate stale configuration.
- **CLI vs. Web delete distribution**: Ratio of `RepoVariableDeleted` events by `client` type. Helps prioritize UX investment across surfaces.
- **Delete error rate**: `RepoVariableDeleteFailed` / (`RepoVariableDeleted` + `RepoVariableDeleteFailed`). Should remain below 5%. High error rates may indicate UX confusion or permission misconfiguration.
- **Variables-per-repo trend**: Track average variable count per repo over time. A declining trend after a release may indicate bulk cleanup (healthy) or accidental deletion (needs investigation).

## Observability

### Logging Requirements

| Log Point                           | Level   | Structured Fields                                                          | When                                          |
|-------------------------------------|---------|----------------------------------------------------------------------------|-----------------------------------------------|
| Variable delete requested           | `info`  | `owner`, `repo`, `variable_name`, `actor_id`, `request_id`                | On every DELETE request to the endpoint        |
| Variable name validation failure    | `warn`  | `owner`, `repo`, `variable_name`, `validation_error`, `actor_id`, `request_id` | When name fails regex or length check    |
| Repository resolution failure       | `warn`  | `owner`, `repo`, `actor_id`, `error`, `request_id`                        | When `resolveRepoId()` throws                  |
| Variable delete success             | `info`  | `owner`, `repo`, `variable_name`, `actor_id`, `latency_ms`, `request_id`  | On successful 204 response                     |
| Service layer error                 | `error` | `owner`, `repo`, `variable_name`, `actor_id`, `error`, `request_id`       | When `deleteVariable()` returns `Result.err`   |
| Unexpected exception                | `error` | `owner`, `repo`, `variable_name`, `actor_id`, `error_stack`, `request_id` | When the catch block fires                      |

All logs must include `request_id` from the middleware for request tracing. Variable values must never be logged.

### Prometheus Metrics

| Metric Name                                | Type      | Labels                                  | Description                                                |
|--------------------------------------------|-----------|-----------------------------------------|------------------------------------------------------------|
| `codeplane_repo_variable_delete_total`     | Counter   | `status` (success, error), `error_type` | Total delete requests and their outcomes                   |
| `codeplane_repo_variable_delete_duration_ms` | Histogram | `status`                              | Latency distribution (buckets: 5, 10, 25, 50, 100, 250, 500, 1000 ms) |
| `codeplane_repo_variable_count`            | Gauge     | `repository_id`                         | Number of variables per repository (updated after mutation) |

### Alerts

**Alert 1: High Variable Delete Error Rate**
- **Condition**: `rate(codeplane_repo_variable_delete_total{status="error"}[5m]) / rate(codeplane_repo_variable_delete_total[5m]) > 0.10`
- **Severity**: Warning
- **Runbook**:
  1. Check the server logs filtered by `request_id` for failing requests.
  2. Categorize errors: Are they `400` (bad names), `401` (auth issues), `404` (repo not found), or `500` (server-side)?
  3. If 400/422: Identify if a misbehaving client is sending invalid variable names. Check `variable_name` values in logs for patterns.
  4. If 401: Check auth infrastructure — session store, PAT validation, OAuth token refresh.
  5. If 404: Check if a deployment or migration dropped the repository table or permissions table.
  6. If 500: Check database connectivity — run `SELECT 1` against the database. Verify `repository_variables` table exists. Check for lock contention or deadlocks.
  7. If errors are concentrated on a single repository, check if that repo's data is corrupted.
  8. Escalate to backend on-call if not resolved within 15 minutes.

**Alert 2: High Variable Delete Latency**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_repo_variable_delete_duration_ms_bucket[5m])) > 500`
- **Severity**: Warning
- **Runbook**:
  1. Check database query performance: `EXPLAIN ANALYZE DELETE FROM repository_variables WHERE repository_id = $1 AND name = $2` (on a test instance, not production).
  2. Verify the `repository_variables` table has the unique constraint index on `(repository_id, name)` — this should serve as the lookup index for deletes.
  3. Check overall database load — connection pool saturation, active query count, replication lag if applicable.
  4. Check if `resolveRepoId()` is the slow path rather than the delete itself. This involves a join across the users/orgs and repos tables.
  5. If the index is missing, recreate the unique constraint on `(repository_id, name)`.
  6. If the database is healthy, investigate network latency between the app server and database.
  7. Escalate to DBA on-call if latency persists after index verification.

**Alert 3: Unexpected Spike in Variable Deletions**
- **Condition**: `rate(codeplane_repo_variable_delete_total{status="success"}[5m]) > 50`
- **Severity**: Info
- **Runbook**:
  1. Check if a known bulk cleanup operation is in progress (e.g., a team migration or script-based cleanup).
  2. Check if the deletions are concentrated on a single repository or spread across many repos.
  3. If spread across many repos by a single actor: review the actor's recent activity for signs of compromised credentials.
  4. If concentrated on one repo: verify with the repo owner that the cleanup is intentional.
  5. No action needed if the spike is explainable. Document the cause.

### Error Cases and Failure Modes

| Error Case                                  | Expected Behavior                                    | HTTP Status |
|---------------------------------------------|------------------------------------------------------|-------------|
| Unauthenticated request                     | Reject with authentication required message          | 401         |
| User lacks write access to repository       | Return not found (no existence leak for private)     | 404         |
| Non-existent owner                          | Return not found                                     | 404         |
| Non-existent repository                     | Return not found                                     | 404         |
| Empty or whitespace-only variable name      | Return bad request ("variable name is required")     | 400         |
| Variable name exceeding 255 characters      | Return validation failed                             | 422         |
| Variable name with invalid characters       | Return validation failed                             | 422         |
| Variable does not exist in repository       | Succeed silently (idempotent)                        | 204         |
| Invalid repository ID (internal resolution) | Return bad request ("invalid repository id")         | 400         |
| Database connection failure                 | Return internal server error, log with stack trace   | 500         |
| Database query timeout                      | Return internal server error, log with timeout info  | 500         |
| Concurrent delete of same variable          | Both succeed (DELETE is idempotent at DB level)       | 204         |

## Verification

### API E2E Tests

1. **Delete an existing variable**: Create a variable `DELETE_ME` with value `test-value`, send `DELETE /api/repos/:owner/:repo/variables/DELETE_ME`, assert response is `204` with empty body.

2. **Variable is removed after deletion**: Create variable `GONE_VAR`, delete it, then `GET /api/repos/:owner/:repo/variables`, assert `GONE_VAR` does not appear in the list.

3. **Delete a non-existent variable returns 204**: Send `DELETE /api/repos/:owner/:repo/variables/NEVER_EXISTED`, assert response is `204` (idempotent).

4. **Double-delete returns 204 both times**: Create `DOUBLE_DEL`, delete it (assert 204), delete it again (assert 204).

5. **Unauthenticated request returns 401**: Send `DELETE /api/repos/:owner/:repo/variables/MY_VAR` with no auth cookie and no `Authorization` header, assert `401`.

6. **Unauthorized user receives 404 for private repo**: Create a private repository as user A, add variable `SECRET_FLAG`, attempt to delete as user B (no access), assert `404`.

7. **Read-only user cannot delete**: As a user with only read access to the repo, attempt deletion, assert `403` or `404` depending on repo visibility.

8. **Non-existent repository returns 404**: Send `DELETE /api/repos/alice/nonexistent-repo-xyz/variables/MY_VAR`, assert `404`.

9. **Non-existent owner returns 404**: Send `DELETE /api/repos/nonexistent-owner-xyz/somerepo/variables/MY_VAR`, assert `404`.

10. **Empty variable name returns 400**: Send `DELETE /api/repos/:owner/:repo/variables/%20` (whitespace-only after decoding), assert `400` with `"variable name is required"`.

11. **Variable name with invalid characters returns 422**: Send `DELETE /api/repos/:owner/:repo/variables/my-var` (contains hyphen), assert `422` validation error.

12. **Variable name exceeding 255 characters returns 422**: Send `DELETE /api/repos/:owner/:repo/variables/` with a name of 256 `A` characters, assert `422`.

13. **Variable name at exactly 255 characters succeeds**: Create a variable with a 255-character valid name (`A` + 254 `_` characters), delete it, assert `204`.

14. **Variable name at exactly 1 character succeeds**: Create a variable named `X`, delete it, assert `204`.

15. **Variable name starting with underscore succeeds**: Create `_PRIVATE_VAR`, delete it, assert `204`.

16. **Deletion does not affect other variables**: Create `VAR_A` and `VAR_B`, delete `VAR_A`, list variables, assert `VAR_B` still exists with its value unchanged.

17. **Repository isolation — delete in one repo does not affect another**: Create `SHARED_NAME` in repo A and repo B, delete from repo A, verify repo B still has `SHARED_NAME`.

18. **PAT-based authentication works for deletion**: Send the DELETE request using `Authorization: token <valid-PAT>`, assert `204`.

19. **Revoked PAT returns 401**: Send the DELETE request with a revoked PAT, assert `401`.

20. **Response has no content-type for 204**: Verify the 204 response does not set a `Content-Type` header or that the body length is 0.

21. **Variable with numeric name portion**: Create `VAR_123`, delete it, assert `204`.

22. **Case-sensitive deletion**: Create `My_Var` and `MY_VAR` (two different variables), delete `My_Var`, list, assert `MY_VAR` still exists.

23. **Concurrent deletions of same variable**: Send two simultaneous DELETE requests for the same variable, assert both return `204` without error.

### CLI E2E Tests

24. **`codeplane variable delete <NAME>` succeeds**: Create `CLI_DEL_VAR`, run `codeplane variable delete CLI_DEL_VAR --repo OWNER/REPO --json`, assert exit code `0` and JSON output `{ "status": "deleted", "name": "CLI_DEL_VAR" }`.

25. **Deleted variable no longer appears in list**: After CLI deletion, run `codeplane variable list --json`, assert deleted variable is absent.

26. **Delete non-existent variable via CLI**: Run `codeplane variable delete DOES_NOT_EXIST --repo OWNER/REPO --json`, assert non-zero exit code.

27. **`--repo` flag correctly targets repository**: Run `codeplane variable delete MY_VAR --repo alice/frontend --json`, verify the request targets the correct repository.

28. **`-R` shorthand works**: Run `codeplane variable delete MY_VAR -R alice/frontend --json`, assert same behavior as `--repo`.

29. **CLI exit code 0 on success**: Verify exit code is exactly `0` for a successful deletion.

30. **CLI exit code non-zero on auth failure**: Run with invalid credentials, assert non-zero exit code.

31. **Multiple variable lifecycle via CLI**: Create `A`, `B`, `C` via CLI, delete `B`, list, assert only `A` and `C` remain.

32. **CLI delete with local repo context**: Inside a cloned repository, run `codeplane variable delete MY_VAR` (no `--repo` flag), assert it resolves the repo from local context and deletes successfully.

### Web UI E2E Tests (Playwright)

33. **Delete button visible for write-access user**: Navigate to `/:owner/:repo/settings/variables`, assert each variable row has a visible delete button.

34. **Delete button hidden for read-only user**: As a read-only user, navigate to the variables settings page, assert no delete buttons are rendered.

35. **Confirmation dialog appears on click**: Click the delete button for a variable, assert a confirmation dialog appears with the variable name in the body text.

36. **Cancel dismisses dialog without deletion**: Click delete, then click "Cancel" in the dialog, assert the dialog closes and the variable is still in the list.

37. **Confirm deletes variable and updates table**: Click delete, confirm in the dialog, assert the variable disappears from the table and a success toast appears.

38. **Delete last variable shows empty state**: Delete the only remaining variable, assert the empty-state message is displayed.

39. **Error state in dialog**: Simulate a server error (e.g., network failure), click delete and confirm, assert an error message appears in the dialog and the "Delete" button re-enables.

40. **Loading state during deletion**: Click delete and confirm, assert the "Delete" button shows a loading spinner while the request is in flight.

### Integration Tests (Service Layer)

41. **`SecretService.deleteVariable` with valid repo ID and existing variable**: Create a variable, call `deleteVariable`, assert `Result.ok(undefined)`. Verify variable is gone via `listVariables`.

42. **`SecretService.deleteVariable` with valid repo ID and non-existent variable**: Call `deleteVariable` for a name that was never created, assert `Result.ok(undefined)` (idempotent).

43. **`SecretService.deleteVariable` with invalid repo ID (0)**: Assert `Result.err` with `"invalid repository id"`.

44. **`SecretService.deleteVariable` with negative repo ID**: Assert `Result.err` with `"invalid repository id"`.

45. **`SecretService.deleteVariable` with empty string repo ID**: Assert `Result.err` with `"invalid repository id"`.

46. **`SecretService.deleteVariable` with empty name**: Assert `Result.err` with `"variable name is required"`.

47. **`SecretService.deleteVariable` with whitespace-only name**: Assert `Result.err` with `"variable name is required"`.

48. **SQL-level verification**: After `deleteVariable`, execute `SELECT COUNT(*) FROM repository_variables WHERE repository_id = $1 AND name = $2` and assert count is 0.
