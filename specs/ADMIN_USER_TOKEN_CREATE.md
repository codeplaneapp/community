# ADMIN_USER_TOKEN_CREATE

Specification for ADMIN_USER_TOKEN_CREATE.

## High-Level User POV

As a Codeplane instance administrator, there are situations where you need to create a personal access token on behalf of another user. This might happen during onboarding, when provisioning service accounts for automation pipelines, when a user has lost access to their account and needs a new token for API access, or when setting up agent-driven workflows that require tokens scoped to specific users.

The admin token creation capability lets you generate a fully functional personal access token owned by any user on the instance, specifying the token's name and the permission scopes it should carry. You receive the raw token string exactly once — just as the target user would if they created the token themselves — and can then securely deliver it to the intended user or configure it into the appropriate system.

This operation is restricted exclusively to instance administrators. It is surfaced through the API, the CLI, and the web admin panel. The created token behaves identically to one the user would have created themselves: it authenticates as that user, respects the assigned scopes, and appears in the user's own token list. The admin can assign any scope, including privileged scopes like `admin` or `all`, because they are already operating at the highest trust level.

## Acceptance Criteria

- An authenticated admin can create a personal access token for any existing user by specifying the target username, a token name, and one or more scopes.
- The created token is owned by the target user, not by the admin who created it.
- The raw token string (`codeplane_` followed by 40 lowercase hex characters) is returned exactly once in the creation response and is never retrievable again.
- The token appears in the target user's own token list (via `GET /api/user/tokens`) with matching name, scopes, and `token_last_eight`.
- The token authenticates API requests as the target user with the assigned scopes.
- Token name is required and must not be empty after trimming whitespace.
- Token name must not exceed 255 characters.
- Token name is trimmed of leading/trailing whitespace before storage.
- At least one scope is required; an empty scopes array is rejected.
- All scopes must be valid canonical scopes or recognized aliases. Invalid scopes produce per-index validation errors.
- Scope aliases are normalized to their canonical form (e.g., `repo` → `write:repository`).
- Duplicate scopes are deduplicated; the stored scopes list is sorted alphabetically.
- Privileged scopes (`admin`, `read:admin`, `write:admin`, `all`) are permitted when the requesting user is an admin — no additional privilege check blocks them.
- If the target username does not exist, the endpoint returns 404 with `"user not found"`.
- If the target user account is inactive/disabled, the endpoint returns 403 with `"cannot create token for inactive user"`.
- An empty or whitespace-only username path parameter returns 400 with `"username is required"`.
- A request body that is not valid JSON returns 400 with `"invalid request body"`.
- A request body missing the `name` field (or with an empty name after trim) returns 422 with a validation error for `AccessToken.name` / `missing_field`.
- A request body missing the `scopes` field (or with an empty array) returns 422 with a validation error for `AccessToken.scopes` / `missing_field`.
- A request containing one or more unrecognized scope strings returns 422 with per-index validation errors for each invalid scope.
- The endpoint returns HTTP 201 on success.
- Non-admin authenticated users receive 401 with `"admin access required"`.
- Unauthenticated requests receive 401 with `"authentication required"`.
- The operation is recorded in the audit log with the admin's identity, the target username, the token name, the assigned scopes, and the created token ID.
- The raw token value is never written to logs or the audit trail.
- Creating two tokens with the same name for the same user succeeds — token names are not unique constraints.
- Scopes are case-insensitive during validation (e.g., `READ:REPOSITORY` normalizes to `read:repository`).

## Design

### API Shape

**Endpoint**: `POST /api/admin/users/:username/tokens`

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `username` | string | Yes | The username of the user to create the token for |

**Request Body** (JSON):
```json
{
  "name": "ci-deploy-token",
  "scopes": ["write:repository", "read:user"]
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `name` | string | Yes | 1–255 characters after trimming; must not be empty |
| `scopes` | string[] | Yes | At least one valid scope; aliases are normalized |

**Canonical Scopes**: `read:repository`, `write:repository`, `read:organization`, `write:organization`, `read:user`, `write:user`, `admin`, `read:admin`, `write:admin`, `all`

**Recognized Aliases**: `repo` → `write:repository`, `repository` → `write:repository`, `admin:read` → `read:admin`, `admin:write` → `write:admin`, `org` / `organization` → `write:organization`, `user` → `write:user`

**Success Response** (201):
```json
{
  "id": 42,
  "name": "ci-deploy-token",
  "token": "codeplane_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "token_last_eight": "f6a1b2c3",
  "scopes": ["read:user", "write:repository"]
}
```

**Error Responses**:
| Status | Condition | Body |
|--------|-----------|------|
| 400 | Username empty/whitespace | `{ "error": "bad_request", "message": "username is required" }` |
| 400 | Invalid JSON body | `{ "error": "bad_request", "message": "invalid request body" }` |
| 401 | No auth | `{ "error": "unauthorized", "message": "authentication required" }` |
| 401 | Non-admin | `{ "error": "unauthorized", "message": "admin access required" }` |
| 403 | User inactive | `{ "error": "forbidden", "message": "cannot create token for inactive user" }` |
| 404 | User not found | `{ "error": "not_found", "message": "user not found" }` |
| 422 | Name empty | `{ "error": "validation_failed", "message": "validation failed", "errors": [{ "resource": "AccessToken", "field": "name", "code": "missing_field" }] }` |
| 422 | Scopes empty | `{ "error": "validation_failed", "message": "validation failed", "errors": [{ "resource": "AccessToken", "field": "scopes", "code": "missing_field" }] }` |
| 422 | Invalid scope at index i | `{ "error": "validation_failed", "message": "validation failed", "errors": [{ "resource": "AccessToken", "field": "scopes[i]", "code": "invalid" }] }` |

### SDK Shape

A new `createTokenForUser` method on `UserService`:

```typescript
async createTokenForUser(
  username: string,
  req: CreateTokenRequest
): Promise<Result<CreateTokenResult, APIError>>
```

This method:
1. Resolves `username` → user record via `getUserByUsername`.
2. Validates the user exists and is active.
3. Delegates to the existing `createToken(userId, req)` method — but bypasses the privileged-scope check since the caller is already an admin.
4. Returns the same `CreateTokenResult` shape (including the raw token) as self-service token creation.

### CLI Command

```
codeplane admin user token create <username> --name <name> --scopes <scope1,scope2,...>
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `username` | positional string | Yes | Target user's username |

**Options**:
| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `--name` | string | Yes | Token display name |
| `--scopes` | string (comma-separated) | Yes | Permission scopes |

**Output** (JSON mode): Same shape as the API success response. In non-JSON mode, print the raw token prominently with a warning that it will not be shown again.

**Examples**:
```bash
codeplane admin user token create bob --name "ci-deploy" --scopes "write:repository"
codeplane admin user token create alice --name "full-access" --scopes "all"
codeplane admin user token create bob --name "automation" --scopes "read:repository,read:user" --json
```

### Web UI Design

The admin user detail page (`/admin/users/:username`) should include a "Create Token" action in the user management section. Clicking it opens a dialog/drawer with:

1. **Token Name** — text input, required, placeholder "e.g., ci-deploy-token".
2. **Scopes** — multi-select or checkbox group listing canonical scopes with human-readable labels.
3. **Create** button — submits the request.
4. On success, a one-time display panel shows the raw token with a copy-to-clipboard button and a prominent warning: "This token will not be shown again. Copy it now."
5. On error, inline validation messages appear next to the relevant field.

### Documentation

- **Admin Guide — Managing User Tokens**: Document the use case (onboarding, service accounts, recovery), the CLI command with examples, the API endpoint with curl examples, and the web UI flow.
- **API Reference — Admin Endpoints**: Add `POST /api/admin/users/:username/tokens` with request/response schemas and all error codes.
- **CLI Reference — `admin user token create`**: Document arguments, options, output formats, and exit codes.
- **Security Advisory**: Note that admin-created tokens authenticate as the target user and should be delivered securely. Warn that the raw token is shown only once.

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| Instance Admin | ✅ Full access — can create tokens for any user |
| Organization Owner | ❌ No access |
| Organization Admin | ❌ No access |
| Regular User | ❌ No access |
| Read-Only Token | ❌ No access |
| Anonymous | ❌ No access |

The `requireAdmin` guard checks that the authenticated user has `isAdmin === true`. This is enforced at the route layer before any service logic executes.

### Rate Limiting

- **Per-admin principal**: 30 admin token creation requests per minute.
- **Global ceiling**: 100 admin token creation requests per minute across all admins.
- Rate limit responses return HTTP 429 with `Retry-After` header.

### Data Privacy & PII

- The raw token value (`codeplane_...`) must never be logged, stored in plaintext, or included in audit records. Only the SHA-256 hash and `token_last_eight` are persisted.
- The admin's identity (who created the token) should be recorded in the audit log to enable accountability.
- The target user's username appears in logs and audit records; this is expected admin-visible PII.
- Tokens created by admins are indistinguishable from user-created tokens once stored — there is no "created by admin" flag on the token itself. The audit log is the sole record of provenance.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `AdminUserTokenCreated` | Token successfully created | `admin_user_id`, `target_username`, `target_user_id`, `token_id`, `scopes` (array), `scope_count`, `has_privileged_scope` (bool), `token_name_length` |
| `AdminUserTokenCreateFailed` | Token creation attempt failed | `admin_user_id`, `target_username`, `error_type` (`not_found`, `validation`, `inactive_user`, `rate_limited`), `error_detail` |

### Funnel Metrics

- **Adoption**: Count of distinct admins who have used this feature in the last 30 days.
- **Success Rate**: Ratio of `AdminUserTokenCreated` to total attempts (created + failed).
- **Target User Distribution**: How many distinct target users have had tokens created for them — identifies if this is used broadly or for a few service accounts.
- **Scope Pattern**: Distribution of scope combinations to understand usage patterns (e.g., are most admin-created tokens `all` scope vs. narrowly scoped).
- **Error Distribution**: Breakdown of `AdminUserTokenCreateFailed` by `error_type` to identify UX friction.

## Observability

### Logging

| Event | Level | Structured Context |
|-------|-------|--------------------|
| Admin token creation request received | `INFO` | `admin_username`, `target_username`, `request_id` |
| Token created successfully | `INFO` | `admin_username`, `target_username`, `token_id`, `scopes`, `request_id` |
| Target user not found | `WARN` | `admin_username`, `target_username`, `request_id` |
| Target user inactive | `WARN` | `admin_username`, `target_username`, `request_id` |
| Validation error | `WARN` | `admin_username`, `target_username`, `validation_errors`, `request_id` |
| Rate limit exceeded | `WARN` | `admin_username`, `request_id` |
| Internal error during token creation | `ERROR` | `admin_username`, `target_username`, `error_message`, `request_id` |

**Critical rule**: The raw token value must NEVER appear in any log at any level.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_admin_token_create_total` | Counter | `status` (`success`, `error`), `error_type` | Total admin token creation attempts |
| `codeplane_admin_token_create_duration_seconds` | Histogram | — | Latency of admin token creation requests |
| `codeplane_admin_token_create_rate_limited_total` | Counter | `admin_username` | Rate limit hits on admin token creation |

### Alerts

#### Alert: `AdminTokenCreateErrorRateHigh`
- **Condition**: `rate(codeplane_admin_token_create_total{status="error"}[5m]) / rate(codeplane_admin_token_create_total[5m]) > 0.5` for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check structured logs for `admin_token_create` events with `ERROR` or `WARN` level.
  2. If errors are `not_found`, investigate whether admin is targeting stale/deleted usernames — likely a human error pattern, not a system issue.
  3. If errors are `validation`, check if a client is sending malformed payloads — inspect request bodies in logs.
  4. If errors are `internal`, check database connectivity and the `access_tokens` table for constraint violations or disk space issues.
  5. If errors are `rate_limited`, check if a script is hammering the endpoint — review `admin_username` label for the source.

#### Alert: `AdminTokenCreateLatencyHigh`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_admin_token_create_duration_seconds_bucket[5m])) > 2` for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database query latency — the `getUserByUsername` and `createAccessToken` queries should be fast.
  2. Check if there's lock contention on the `access_tokens` table.
  3. Check overall database connection pool saturation via existing DB metrics.
  4. If isolated to one admin, check if they're creating tokens in a tight loop and hitting rate limits.

#### Alert: `AdminTokenCreateRateLimitSpike`
- **Condition**: `rate(codeplane_admin_token_create_rate_limited_total[5m]) > 5` for 5 minutes.
- **Severity**: Info
- **Runbook**:
  1. Identify the admin hitting rate limits from the `admin_username` label.
  2. Check if this is a legitimate bulk provisioning operation or a runaway script.
  3. If legitimate, consider temporarily raising the rate limit or advising the admin to batch with delays.
  4. If suspicious, investigate the admin account for compromise.

### Error Cases and Failure Modes

| Failure | HTTP Status | Recovery |
|---------|-------------|----------|
| Database unreachable | 500 | Retry; check DB health |
| Random bytes generation failure | 500 | Extremely unlikely; restart process |
| Hash computation failure | 500 | Extremely unlikely; restart process |
| Token insert constraint violation (duplicate hash) | 500 | Auto-retry with new random bytes (astronomically unlikely) |
| Target user deleted between lookup and insert | 500 | Foreign key violation; surface as internal error |
| Request body exceeds size limit | 400 | Rejected by middleware before reaching handler |

## Verification

### API Integration Tests

1. **Happy path — create token for existing user with single scope**: POST to `/api/admin/users/:username/tokens` with admin auth, valid name, and `["read:repository"]`. Assert 201, response contains `id` > 0, `name` matches, `token` matches `/^codeplane_[0-9a-f]{40}$/`, `token_last_eight` is 8 chars, `scopes` is `["read:repository"]`.
2. **Happy path — create token with multiple scopes**: Use `["read:repository", "write:user"]`. Assert 201, scopes returned sorted alphabetically.
3. **Happy path — create token with scope aliases**: Use `["repo", "user"]`. Assert 201, scopes returned as `["write:repository", "write:user"]`.
4. **Happy path — create token with privileged scopes**: Use `["admin"]`. Assert 201, scopes is `["admin"]`.
5. **Happy path — create token with `all` scope**: Use `["all"]`. Assert 201.
6. **Happy path — duplicate scopes are deduplicated**: Use `["repo", "write:repository"]`. Assert 201, scopes is `["write:repository"]` (single entry).
7. **Happy path — token name with leading/trailing whitespace is trimmed**: Use name `"  my-token  "`. Assert 201, returned name is `"my-token"`.
8. **Happy path — created token is usable for auth**: Create token via admin endpoint, then use the raw token to call `GET /api/user` and verify it authenticates as the target user.
9. **Happy path — created token appears in target user's token list**: Create token, then call `GET /api/user/tokens` as the target user and find the token by `token_last_eight`.
10. **Happy path — token name at maximum length (255 chars)**: Create with a 255-character name. Assert 201.
11. **Error — token name exceeds maximum length (256 chars)**: Create with a 256-character name. Assert 422 validation error on `name` field.
12. **Error — empty token name**: Send `{ "name": "", "scopes": ["repo"] }`. Assert 422, error field is `name`, code is `missing_field`.
13. **Error — whitespace-only token name**: Send `{ "name": "   ", "scopes": ["repo"] }`. Assert 422.
14. **Error — missing name field**: Send `{ "scopes": ["repo"] }`. Assert 422.
15. **Error — empty scopes array**: Send `{ "name": "test", "scopes": [] }`. Assert 422, error field is `scopes`, code is `missing_field`.
16. **Error — missing scopes field**: Send `{ "name": "test" }`. Assert 422.
17. **Error — invalid scope string**: Send `{ "name": "test", "scopes": ["destroy:everything"] }`. Assert 422, error field is `scopes[0]`, code is `invalid`.
18. **Error — mix of valid and invalid scopes**: Send `["read:repository", "invalid_scope"]`. Assert 422, error on `scopes[1]`.
19. **Error — target user does not exist**: POST to `/api/admin/users/nonexistent-user-xyz/tokens`. Assert 404.
20. **Error — empty username in path**: POST to `/api/admin/users/%20/tokens`. Assert 400, `"username is required"`.
21. **Error — request body is not valid JSON**: Send raw string `"not json"`. Assert 400, `"invalid request body"`.
22. **Error — request body is empty**: Send empty body. Assert 400.
23. **Error — non-admin user attempts creation**: Authenticate with a non-admin token. Assert 401, `"admin access required"`.
24. **Error — unauthenticated request**: Send no auth header/cookie. Assert 401, `"authentication required"`.
25. **Error — read-only token attempts creation**: Authenticate with READ_TOKEN. Assert 401.
26. **Idempotency — creating two tokens with the same name for the same user succeeds**: Both should succeed with distinct IDs and distinct raw tokens.
27. **Scope normalization — case insensitivity**: Send `["READ:REPOSITORY"]`. Assert 201, scope normalized to `["read:repository"]`.
28. **Scope normalization — alias variants**: Send `["admin:read"]`. Assert 201, scope is `["read:admin"]`.

### CLI Integration Tests

29. **CLI happy path**: `codeplane admin user token create <username> --name "test" --scopes "read:repository" --json`. Assert exit code 0, JSON output matches API response shape.
30. **CLI with multiple scopes**: `--scopes "read:repository,write:user"`. Assert exit code 0, scopes array contains both.
31. **CLI with privileged scope**: `--scopes "all"`. Assert exit code 0.
32. **CLI error — user not found**: Target a nonexistent username. Assert non-zero exit code, stderr contains error.
33. **CLI error — missing name**: Omit `--name`. Assert non-zero exit code.
34. **CLI error — missing scopes**: Omit `--scopes`. Assert non-zero exit code.
35. **CLI error — non-admin token**: Use a non-admin token. Assert non-zero exit code.
36. **CLI error — no auth**: Use empty token. Assert non-zero exit code.
37. **CLI token is functional**: Create token via CLI, extract raw token from JSON output, use it to make an API call as the target user.

### E2E Tests (Playwright — Web UI)

38. **Admin navigates to user detail page and opens token creation dialog**: Verify the "Create Token" button is visible and clickable.
39. **Admin fills in token name and scopes, submits, sees raw token**: Verify the one-time token display appears with copy button.
40. **Admin sees validation error when name is empty**: Clear the name field and submit. Verify inline error.
41. **Admin sees validation error when no scopes selected**: Deselect all scopes and submit. Verify inline error.
42. **Non-admin user cannot see admin user management pages**: Navigate to `/admin/users/:username` as a regular user. Verify redirect or 403 page.

### Security Tests

43. **Rate limiting — exceed per-admin limit**: Send 31 requests in rapid succession with the same admin. Assert that at least one returns 429.
44. **Token does not appear in server logs**: Create a token, grep the server log output for the raw token string. Assert it is absent.
45. **Created token cannot escalate beyond assigned scopes**: Create a token with `read:repository` scope, attempt a write operation with it. Assert 403.
