# INTEGRATION_LINEAR_CREATE

Specification for INTEGRATION_LINEAR_CREATE.

## High-Level User POV

When a Codeplane user has completed the Linear OAuth authorization flow — they clicked "Connect Linear", authorized Codeplane on Linear's consent screen, and were redirected back — they arrive at the final and most important step of the integration setup: choosing which Linear team to connect and which Codeplane repository to bind it to. This is the "create integration" step, and it is the moment where the user's intent to synchronize Linear and Codeplane becomes a persistent, active connection.

From the user's perspective, they see a configuration form that already knows their Linear identity — their name and email are displayed as confirmation that the right Linear account is connected. Below that, they see a list of their available Linear teams (fetched from the OAuth result) and a searchable picker of their Codeplane repositories. They select the Linear team they want to sync (for example, "Engineering" with key "ENG"), select the Codeplane repository they want to bind it to (for example, "acme-corp/backend-api"), and click "Complete Setup."

If everything succeeds, the user sees a confirmation message — "Linear integration created" — and is taken to the integrations list page where their new integration appears as an active card showing the team name, repository, and status. From this moment, issues created in Codeplane will be mirrored to Linear and vice versa. The user has gone from zero to a working bidirectional integration in a single, guided flow.

If something goes wrong — the OAuth setup expired because the user waited too long, they don't have admin access to the selected repository, or the selected team wasn't part of the original OAuth authorization — the user sees a clear error message explaining exactly what happened and what to do next. The experience is designed so that no error is a dead end; every failure path has a recovery action.

From the CLI, power users and automation scripts can achieve the same result without a browser by piping pre-obtained Linear credentials via stdin and specifying the team and repository directly. This makes the integration configurable in CI/CD pipelines, infrastructure-as-code flows, and agent-driven automation scenarios where a browser-based OAuth flow is impractical.

The value of this feature is that it is the atomic commit point for the entire Linear integration lifecycle. Everything before it — OAuth start, OAuth callback, setup resolution, repository listing — is preparation. Everything after it — sync, webhooks, issue mapping — depends on the integration record this feature creates. Without a reliable, secure, and user-friendly integration creation step, the entire Linear integration is broken.

## Acceptance Criteria

### Definition of Done

The `INTEGRATION_LINEAR_CREATE` feature is done when:

- A user who has completed the Linear OAuth flow can select a Linear team and Codeplane repository and create a persistent integration binding between them.
- The integration record is created with encrypted tokens, a generated webhook secret, and the correct team/repository metadata.
- The integration immediately appears in the user's integration list as active.
- The CLI `codeplane extension linear install` command can create an integration with pre-obtained credentials without a browser.
- The web UI configuration form validates inputs, shows clear errors, and prevents double-submission.
- All sensitive token material is encrypted at rest and never exposed to the browser or API response.
- The consumed OAuth setup record cannot be reused.

### Functional Constraints

- [ ] The endpoint MUST accept a JSON body with `linear_team_id` (string), `setup_key` (string), `repo_owner` (string), `repo_name` (string), and `repo_id` (number).
- [ ] The endpoint MUST require an authenticated Codeplane session (session cookie or PAT). Unauthenticated requests MUST return HTTP 401 with `{ "error": "authentication required" }`.
- [ ] The endpoint MUST validate that `linear_team_id` is a non-empty trimmed string. Empty or whitespace-only values MUST return HTTP 400.
- [ ] The endpoint MUST validate that `repo_id` is a positive integer. Zero, negative, non-numeric, or missing values MUST return HTTP 400.
- [ ] The endpoint MUST validate that `setup_key` is a non-empty trimmed string. Empty or whitespace-only values MUST return HTTP 400.
- [ ] The endpoint MUST verify the user has admin access to the target repository. If the repository does not exist, return HTTP 404 with `{ "error": "repository not found" }`. If the user lacks admin access, return HTTP 403 with `{ "error": "you do not have admin access to this repository" }`.
- [ ] The endpoint MUST consume the OAuth setup record atomically (delete-on-read). If the setup key is invalid, expired, already consumed, or belongs to a different user, return HTTP 404.
- [ ] The endpoint MUST verify that the `linear_team_id` submitted by the user matches one of the teams returned in the OAuth setup result. If no match, return HTTP 400 with `{ "error": "selected linear_team_id was not returned by the oauth setup" }`.
- [ ] On success, the endpoint MUST create a `linear_integrations` record with encrypted access/refresh tokens, a generated webhook secret, `is_active=true`, and the correct team/repo metadata.
- [ ] On success, the endpoint MUST return HTTP 201 with a response body containing `id`, `linear_team_id`, `linear_team_name`, `repo_owner`, `repo_name`, and `is_active`.
- [ ] The response MUST NOT include `access_token_encrypted`, `refresh_token_encrypted`, `token_expires_at`, `webhook_secret`, or `user_id`.
- [ ] The endpoint MUST be gated behind the `INTEGRATION_LINEAR_CREATE` feature flag. When disabled, return 404 or do not mount.
- [ ] If the request body is not valid JSON, return HTTP 400 with `{ "error": "invalid request body" }`.
- [ ] The endpoint MUST be idempotent with respect to the setup key — since setup keys are single-use, a second request with the same setup key MUST fail with 404 (setup not found), not create a duplicate integration.

### Edge Cases

- [ ] If the user's Codeplane session expires between the OAuth callback and submitting the configuration form, the endpoint MUST return 401, not crash or create a partial record.
- [ ] If the setup key has expired (>10 minutes old) by the time the user submits, the endpoint MUST return 404 with a message indicating the setup has expired.
- [ ] If the same setup key is submitted twice (replay or double-click), the second request MUST fail because the setup was already consumed.
- [ ] If the user selects a repository they own but that was archived between page load and form submission, the admin check MUST still pass (the user is admin of archived repos), but the integration will bind to an archived repo. This is acceptable — archival status is a repository management concern, not an integration concern.
- [ ] If the user provides a `repo_id` that does not match `repo_owner`/`repo_name`, the endpoint MUST use `repo_id` as the source of truth for the permission check (not the owner/name pair).
- [ ] If Linear returned only one team during OAuth, and the user sends a different `linear_team_id`, the team verification MUST reject the request.
- [ ] If the request body contains extra unexpected fields, they MUST be silently ignored (not cause an error).
- [ ] If the request Content-Type is not `application/json`, the middleware MUST reject the request with HTTP 415 or 400 before the handler runs.
- [ ] Concurrent submissions with different setup keys for the same user and same repo MUST both succeed (a user can have multiple integrations for the same repo with different Linear teams).
- [ ] If the database INSERT fails due to a constraint violation (e.g., unexpected unique index), the endpoint MUST return 500 with a structured error, not expose SQL details.

### Boundary Constraints

- [ ] `linear_team_id`: Must be a non-empty string, maximum 255 characters (Linear UUIDs are typically 36 characters).
- [ ] `setup_key`: Must be a non-empty string, minimum 32 characters, maximum 128 characters.
- [ ] `repo_owner`: Must be a non-empty string, 1–100 characters, matching Codeplane's username/org-name rules (alphanumeric, hyphens, underscores).
- [ ] `repo_name`: Must be a non-empty string, 1–100 characters, matching Codeplane's repository name rules (alphanumeric, hyphens, underscores, dots, no leading/trailing hyphens).
- [ ] `repo_id`: Must be a positive integer. Maximum value: 2^53 - 1 (JavaScript safe integer).
- [ ] `linear_team_name` (derived from setup): Maximum 255 characters.
- [ ] `linear_team_key` (derived from setup): Maximum 10 characters (Linear's constraint).
- [ ] The generated `webhook_secret` MUST be at least 32 cryptographically random characters.
- [ ] The response `id` field is a string representation of the database-generated integer ID.
- [ ] All request string fields MUST be trimmed of leading/trailing whitespace before processing.

## Design

### API Shape

#### `POST /api/integrations/linear`

**Purpose:** Finalize the Linear integration configuration by binding a Linear team to a Codeplane repository using the credentials obtained during the OAuth flow.

**Request:**
- Method: `POST`
- Authentication: Session cookie or PAT-based `Authorization` header (required)
- Content-Type: `application/json`
- Body:

```json
{
  "linear_team_id": "abc123-def456-ghi789",
  "setup_key": "a1b2c3d4e5f6...minimum32chars",
  "repo_owner": "acme-corp",
  "repo_name": "backend-api",
  "repo_id": 42
}
```

**Request Field Descriptions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `linear_team_id` | string | Yes | The Linear team UUID to bind this integration to. Must match one of the teams from the OAuth setup. |
| `setup_key` | string | Yes | The opaque key from the OAuth callback redirect, used to retrieve and consume the stored OAuth tokens. |
| `repo_owner` | string | Yes | Owner (username or org name) of the target Codeplane repository. |
| `repo_name` | string | Yes | Name of the target Codeplane repository. |
| `repo_id` | number | Yes | Database ID of the target Codeplane repository. Used as the authoritative identifier for permission checks. |

**Success Response:** HTTP 201 Created

```json
{
  "id": "57",
  "linear_team_id": "abc123-def456-ghi789",
  "linear_team_name": "Engineering",
  "repo_owner": "acme-corp",
  "repo_name": "backend-api",
  "is_active": true
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Missing or empty `linear_team_id` or `repo_id` | `{ "error": "linear_team_id and repo_id are required" }` |
| 400 | Missing or empty `setup_key` | `{ "error": "setup_key is required" }` |
| 400 | Invalid JSON body | `{ "error": "invalid request body" }` |
| 400 | Selected team not in OAuth setup | `{ "error": "selected linear_team_id was not returned by the oauth setup" }` |
| 401 | Not authenticated | `{ "error": "authentication required" }` |
| 403 | User lacks admin access to repo | `{ "error": "you do not have admin access to this repository" }` |
| 404 | Repository not found | `{ "error": "repository not found" }` |
| 404 | Setup key invalid, expired, consumed, or wrong user | `{ "error": "OAuth setup not found or expired" }` |
| 404 | Feature flag disabled | Not mounted |
| 500 | Internal error | `{ "error": "internal server error" }` |

### SDK Shape

The `linearService.configureIntegration(userId, config)` method must:

1. Call `consumeOAuthSetup(userId, setupKey)` to atomically retrieve and delete the setup record.
2. Decrypt the setup payload using AES-256-GCM with the key derived from `CODEPLANE_SECRET_KEY`.
3. Verify the selected `linear_team_id` exists in the decrypted setup's `teams` array.
4. Extract the matched team's `name` and `key`.
5. Encrypt the `access_token` and `refresh_token` using AES-256-GCM before storage.
6. Generate a cryptographically random `webhook_secret` (≥32 characters).
7. Call `createLinearIntegration(sql, args)` to insert the integration record.
8. Return the created record with sensitive fields stripped.

The `repoChecker` service must:
1. Look up the repository by `repo_id`.
2. Verify the authenticated user has admin-level access (owner, org admin, or repo admin).

### Web UI Design

#### Integration Configuration Form

After the OAuth callback redirects the user to `/integrations/linear?setup=<setupKey>`, the frontend resolves the setup data and presents the configuration form:

**Connected Identity Banner:**
- Displays: "Connected as {viewer.name} ({viewer.email})" with a green checkmark icon.
- This confirms the correct Linear account is connected and builds trust.

**Linear Team Selection:**
- If only one team is available: Auto-select it and show it as a confirmed selection ("Team: Engineering (ENG)") with the option to cancel if the user wants a different team.
- If multiple teams are available: Render a radio group or dropdown listing all teams from the setup, each showing `{team.name} ({team.key})`.
- If no teams are available (unlikely but possible): Show an error state — "No Linear teams found. Please try connecting again."

**Codeplane Repository Selection:**
- A searchable dropdown populated from `GET /api/integrations/linear/repositories`.
- Each option displays `owner/name` as the primary text and `description` as secondary text.
- Public/private visibility is indicated with a small icon.
- If the user has no repositories, show: "No repositories available. Create a repository first."
- The dropdown loads asynchronously with a loading indicator while the repository list is fetched.

**Complete Setup Button:**
- Label: "Complete Setup"
- Disabled until both a team and a repository are selected.
- On click: Shows a loading spinner on the button, disables the button to prevent double-click, and submits `POST /api/integrations/linear`.
- On success (201): Show a success toast "Linear integration created" and navigate to `/integrations/linear` (the list view).
- On error: Show an inline error banner above the form with the error message from the API. The button returns to its enabled state so the user can fix and retry.

**Error Recovery Paths:**

| Error | User Sees | Recovery Action |
|-------|-----------|----------------|
| Setup expired (404) | "Your setup session has expired. Please start the connection again." | "Reconnect Linear" button triggers OAuth start |
| No admin access (403) | "You don't have admin access to this repository. Choose a different repository or ask a repository admin to set up the integration." | User selects a different repository |
| Repository not found (404) | "This repository no longer exists." | User selects a different repository |
| Team mismatch (400) | "The selected team was not part of your Linear authorization. Please reconnect." | "Reconnect Linear" button triggers OAuth start |
| Network error | "Failed to create integration. Please check your connection and try again." | "Retry" button re-submits |

### CLI Command

**Command:** `codeplane extension linear install`

**Usage:**
```bash
echo '{"access_token":"lin_api_...","refresh_token":"..."}' | \
  codeplane extension linear install \
    --team-id=TEAM_UUID \
    --repo-owner=acme-corp \
    --repo-name=backend-api \
    --repo-id=42 \
    --credentials-stdin
```

**Options:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `--team-id` | string | Yes | Linear team UUID |
| `--team-name` | string | No | Linear team display name (defaults to empty) |
| `--team-key` | string | No | Linear team key prefix (defaults to empty) |
| `--repo-owner` | string | Yes | Codeplane repository owner |
| `--repo-name` | string | Yes | Codeplane repository name |
| `--repo-id` | number | Yes | Codeplane repository ID |
| `--credentials-stdin` | boolean | Yes | Must be set; credentials are read from stdin as JSON |
| `--expires-at` | string | No | Token expiry as ISO-8601 string |
| `--actor-id` | string | No | Linear actor ID for loop guard |

**Stdin Format:**
```json
{
  "access_token": "lin_api_xxxxxxxxxxxx",
  "refresh_token": "lin_ref_xxxxxxxxxxxx"
}
```

- `access_token` is required and must be a non-empty string.
- `refresh_token` is optional.

**Success Output:**
```json
{
  "id": "57",
  "linear_team_id": "abc123-def456",
  "linear_team_name": "Engineering",
  "repo_owner": "acme-corp",
  "repo_name": "backend-api",
  "is_active": true
}
```

**Error Cases:**
- No `--credentials-stdin` flag: Error with message explaining credentials must be provided via stdin.
- Empty stdin: Error: "Linear OAuth credentials required."
- Malformed JSON on stdin: Error: "invalid Linear OAuth credentials on stdin; expected JSON with access_token and optional refresh_token."
- Missing `access_token` in JSON: Same error as malformed JSON.
- Non-existent repo: Error from API: "repository not found."
- No admin access: Error from API: "you do not have admin access to this repository."
- Not authenticated: Standard CLI auth error directing user to `codeplane auth login`.

**Exit Codes:**
- 0: Integration created successfully.
- 1: Any error (auth, validation, API, stdin parsing).

### TUI UI

The TUI does not currently have a dedicated Linear integration creation screen. The TUI's integrations surface (tracked under `INTEGRATION_LINEAR_UI`) will initially redirect users to the web UI for the setup flow. For this feature, no TUI changes are required.

### Documentation

The following end-user documentation must be written:

1. **"Connecting Linear to Codeplane" guide** — Step-by-step walkthrough of the complete flow from clicking "Connect Linear" through team selection, repository selection, and completing setup. Include annotated screenshots of: (a) the OAuth authorization screen on Linear, (b) the team and repository selection form, (c) the success confirmation, and (d) the resulting entry in the integrations list.

2. **"Troubleshooting Linear Integration Setup"** — Cover every user-facing error: setup expired (waited too long), permission denied (not a repo admin), team mismatch (reconnect needed), repository not found (deleted), network failures (retry), and double-submission (already consumed). Each error should have a clear explanation and recovery steps.

3. **"CLI: Headless Linear Setup"** — How to configure a Linear integration via `codeplane extension linear install` for CI/automation use cases. Include: obtaining a Linear personal API key, constructing the stdin JSON, full command examples, verifying with `codeplane extension linear list`, and common error troubleshooting.

4. **"Linear Integration Permissions"** — Explain that only repository administrators can create Linear integrations, why this restriction exists (integrations create webhooks and write to the repository's issue tracker), and how to check/grant admin access.

## Permissions & Security

### Authorization Roles

| Role | Can create a Linear integration? | Notes |
|------|----------------------------------|-------|
| Repository Owner | Yes | Full admin access to their own repositories |
| Organization Admin | Yes | Admin access to all org repositories |
| Repository Admin | Yes | Explicitly granted admin role on the repository |
| Repository Member (Write) | No | Returns 403. Members with write access cannot create integrations — admin is required because integrations create webhooks and affect the issue tracker. |
| Repository Member (Read) | No | Returns 403 |
| Authenticated user (no repo access) | No | Returns 404 (repository not found, to avoid leaking existence) or 403 |
| Anonymous / Unauthenticated | No | Returns 401 |

**Important design notes:**
- The permission check is on the **target repository**, not the user's global role. A user who is a site admin but not a repo admin of a specific repository should still be allowed to create integrations (site admins have implicit admin on all repos).
- The OAuth setup key is user-scoped — consuming a setup key belonging to a different user returns 404 (not 403) to prevent information leakage about other users' OAuth flows.
- The CLI `install` command bypasses the OAuth setup flow (it takes credentials directly), but the underlying API still enforces the repository admin check.

### Rate Limiting

- **Per-user rate limit:** Maximum 10 integration creation requests per user per minute. Integration creation is a low-frequency operation; 10/min is generous enough for legitimate use (including retries after errors) while preventing automation abuse.
- **Global rate limit:** Maximum 100 integration creation requests per minute across all users.
- **Rate limit response:** HTTP 429 with `Retry-After` header and `{ "error": "rate limit exceeded" }`.
- **Burst allowance:** Up to 3 requests in a 1-second window before rate limiting engages.
- **Setup key consumption is not rate-limited separately** — the single-use nature of setup keys is the primary abuse prevention mechanism.

### Data Privacy & PII

- **Linear access tokens and refresh tokens** are encrypted using AES-256-GCM before database storage. The encryption key is derived from `CODEPLANE_SECRET_KEY` via SHA-256. Tokens are NEVER returned in any API response, log entry, or error message.
- **Linear viewer email** (obtained during OAuth) is stored in the encrypted OAuth setup payload only. It is NOT persisted in the `linear_integrations` table. It appears only in the setup resolution response (to confirm identity in the UI) and is destroyed when the setup record is consumed.
- **Linear actor ID** is stored in the integration record for loop-guard attribution. It is a Linear-internal UUID and is not PII by itself, but it correlates to a Linear user identity.
- **Webhook secret** is stored in plaintext in the database (needed for signature verification) but is NEVER returned in any API response.
- **Error messages** must not include token values, setup key values, or any credential material.
- **Server logs** must not include request bodies (which contain `setup_key`), access tokens, or webhook secrets. Only the `repo_id`, `linear_team_id`, and operation outcome should be logged.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `LinearIntegrationCreateAttempted` | User submits the configuration form or CLI install command | `user_id`, `repo_id`, `linear_team_id`, `client` (`web`, `cli`, `api`), `timestamp` |
| `LinearIntegrationCreated` | Integration record successfully created | `user_id`, `integration_id`, `repo_id`, `repo_owner`, `repo_name`, `linear_team_id`, `linear_team_name`, `linear_team_key`, `client`, `time_since_oauth_start_ms` (if trackable), `timestamp` |
| `LinearIntegrationCreateFailed` | Any error during integration creation | `user_id`, `repo_id`, `linear_team_id`, `error_type` (enum: `invalid_body`, `missing_fields`, `setup_expired`, `setup_consumed`, `setup_not_found`, `team_mismatch`, `repo_not_found`, `permission_denied`, `internal_error`), `client`, `timestamp` |
| `LinearIntegrationCreateUnauthorized` | Unauthenticated request to the create endpoint | `timestamp`, `client` |
| `LinearIntegrationCreateRateLimited` | User is rate-limited on the create endpoint | `user_id`, `timestamp`, `retry_after_seconds` |
| `LinearSetupKeyConsumed` | OAuth setup key successfully consumed | `user_id`, `setup_key_hash` (SHA-256 of setup key, not the key itself), `team_count`, `time_since_setup_created_ms`, `timestamp` |

### Funnel Metrics

The create integration step is the conversion point of the Linear integration funnel:

1. **OAuth Start** → `LinearOAuthStartInitiated`
2. **OAuth Callback** → `LinearOAuthCallbackSucceeded`
3. **Setup Resolved** → `LinearOAuthSetupResolved`
4. **Integration Created** → `LinearIntegrationCreated` ← **this feature**
5. **First Sync** → `LinearSyncTriggered`

### Key Metrics and Success Indicators

- **Creation success rate**: `LinearIntegrationCreated / LinearIntegrationCreateAttempted` — Target: >90%. The gap represents validation errors, permission issues, and expired setups.
- **Setup-to-create conversion**: `LinearIntegrationCreated / LinearOAuthSetupResolved` — Target: >80%. Drop-off here means users start the form but abandon it.
- **End-to-end funnel conversion**: `LinearIntegrationCreated / LinearOAuthStartInitiated` — Target: >65%. This is the ultimate success metric for the entire OAuth → configure flow.
- **Error type distribution**: Breakdown of `error_type` in `LinearIntegrationCreateFailed`. A spike in `setup_expired` means users are taking too long; a spike in `permission_denied` means the repository picker is showing repos the user can't admin.
- **Time from setup to create**: p50/p90 of `time_since_setup_created_ms` in `LinearSetupKeyConsumed`. Target: p50 < 60s, p90 < 300s. Long times indicate UX friction in the configuration form.
- **Client distribution**: Breakdown of `client` in `LinearIntegrationCreated`. Indicates adoption across web UI, CLI, and direct API usage.
- **Repeat creation rate**: Users who create more than one integration. Healthy sign — indicates users connecting multiple teams/repos.
- **Setup expiry rate**: `LinearIntegrationCreateFailed{error_type="setup_expired"} / LinearOAuthSetupResolved` — Target: <5%. High rates mean the 10-minute window is too short or the form is too confusing.

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Create request received | `INFO` | `user_id`, `repo_id`, `linear_team_id`, `request_id` | Entry log for every create request. MUST NOT log `setup_key`. |
| Request body validation failed | `WARN` | `user_id`, `request_id`, `validation_error` | Missing/invalid fields |
| Repository lookup started | `DEBUG` | `user_id`, `repo_id`, `request_id` | Before repo permission check |
| Repository not found | `WARN` | `user_id`, `repo_id`, `request_id` | User submitted non-existent repo ID |
| Repository permission denied | `WARN` | `user_id`, `repo_id`, `request_id` | User lacks admin access |
| OAuth setup consumption started | `DEBUG` | `user_id`, `request_id` | Before consuming setup key |
| OAuth setup consumed successfully | `INFO` | `user_id`, `setup_key_hash`, `team_count`, `request_id` | Setup key consumed, teams available |
| OAuth setup not found / expired | `WARN` | `user_id`, `request_id` | Setup key invalid or expired |
| Team verification failed | `WARN` | `user_id`, `linear_team_id`, `available_team_ids`, `request_id` | Selected team not in setup |
| Token encryption completed | `DEBUG` | `user_id`, `request_id`, `duration_ms` | After encrypting access/refresh tokens |
| Integration record created | `INFO` | `user_id`, `integration_id`, `repo_id`, `linear_team_id`, `request_id` | Successful creation |
| Integration creation failed (DB error) | `ERROR` | `user_id`, `repo_id`, `linear_team_id`, `error_message`, `stack_trace`, `request_id` | Database INSERT failure |
| Webhook secret generated | `DEBUG` | `user_id`, `integration_id`, `request_id` | MUST NOT log the secret value |

**MUST NOT log:** OAuth setup keys, access tokens, refresh tokens, webhook secrets, full request bodies, Linear viewer email addresses.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_linear_integration_create_total` | Counter | `status` (`success`, `error`), `error_type` (`invalid_body`, `missing_fields`, `setup_expired`, `setup_consumed`, `setup_not_found`, `team_mismatch`, `repo_not_found`, `permission_denied`, `db_error`, `internal_error`) | Total create requests by outcome |
| `codeplane_linear_integration_create_duration_seconds` | Histogram | `status` | End-to-end request duration including setup consumption, encryption, and DB insert |
| `codeplane_linear_integration_setup_consume_duration_seconds` | Histogram | `status` (`success`, `error`) | Time to consume the OAuth setup record |
| `codeplane_linear_integration_token_encrypt_duration_seconds` | Histogram | — | Time to encrypt tokens with AES-256-GCM |
| `codeplane_linear_integration_db_insert_duration_seconds` | Histogram | `status` (`success`, `error`) | Time for the database INSERT |
| `codeplane_linear_integration_repo_check_duration_seconds` | Histogram | `status` (`found_admin`, `found_no_admin`, `not_found`) | Time for repository lookup and permission check |
| `codeplane_linear_integrations_active_total` | Gauge | — | Total number of active integrations (updated on create/delete) |
| `codeplane_linear_integration_create_rate_limited_total` | Counter | — | Rate-limited create requests |

### Alerts

#### Alert: `LinearIntegrationCreateErrorRateHigh`
- **Condition:** `rate(codeplane_linear_integration_create_total{status="error"}[5m]) / rate(codeplane_linear_integration_create_total[5m]) > 0.3` for 10 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_linear_integration_create_total` by `error_type` label to identify the dominant failure.
  2. If `error_type=setup_expired`: Many users are taking >10 minutes between OAuth callback and form submission. Check if the frontend is loading slowly (look at `codeplane_linear_integration_setup_consume_duration_seconds`). Consider increasing the 10-minute TTL temporarily.
  3. If `error_type=permission_denied`: The repository options endpoint may be returning repos the user can't admin. Verify `GET /api/integrations/linear/repositories` is correctly filtering by admin access.
  4. If `error_type=db_error`: Check database connectivity and the `linear_integrations` table health. Run `SELECT count(*) FROM linear_integrations` to verify table is accessible. Check for disk space, connection pool exhaustion, or lock contention.
  5. If `error_type=team_mismatch`: This is unusual — it means the frontend is sending a team ID that wasn't in the setup. Check for frontend bugs or API request tampering.
  6. If `error_type=internal_error`: Check server logs for stack traces. Look for encryption failures (missing `CODEPLANE_SECRET_KEY`), serialization errors, or unexpected exceptions.
  7. Check recent deployments for regressions.

#### Alert: `LinearIntegrationCreateLatencyHigh`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_linear_integration_create_duration_seconds_bucket[5m])) > 3` for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Normal p95 should be <1s. Break down latency by sub-operation:
     - `codeplane_linear_integration_setup_consume_duration_seconds` — setup consumption
     - `codeplane_linear_integration_token_encrypt_duration_seconds` — encryption
     - `codeplane_linear_integration_db_insert_duration_seconds` — database insert
     - `codeplane_linear_integration_repo_check_duration_seconds` — permission check
  2. If setup consumption is slow: Check `linear_oauth_setups` table for index health on `setup_key` column.
  3. If encryption is slow: Check CPU utilization. AES-256-GCM should be <1ms.
  4. If DB insert is slow: Check `linear_integrations` table for lock contention, missing indexes, or disk I/O pressure.
  5. If repo check is slow: Check the repository service and user permission query performance.

#### Alert: `LinearIntegrationCreateDBFailuresSpike`
- **Condition:** `rate(codeplane_linear_integration_create_total{error_type="db_error"}[5m]) > 0` for 5 minutes
- **Severity:** Critical
- **Runbook:**
  1. Any database failure on the create path means integrations cannot be created.
  2. Immediately check database connectivity from the server. Run a simple health query.
  3. Check `linear_integrations` table: `\d linear_integrations` to verify schema is intact.
  4. Check PostgreSQL logs for constraint violations, deadlocks, or out-of-space errors.
  5. Check if the encrypted token columns (`access_token_encrypted`, `refresh_token_encrypted`) are receiving data in the expected binary format.
  6. If the issue is transient (e.g., brief connection drop), monitor for auto-recovery.
  7. If persistent, check recent migrations. A schema change may have broken the INSERT query.

#### Alert: `LinearIntegrationSetupExpirySpikeHigh`
- **Condition:** `rate(codeplane_linear_integration_create_total{error_type="setup_expired"}[15m]) / rate(codeplane_linear_integration_create_total[15m]) > 0.2` for 15 minutes
- **Severity:** Info
- **Runbook:**
  1. More than 20% of create attempts are failing because the setup expired.
  2. Check if there is a frontend performance issue causing slow page loads after OAuth callback (the user might be waiting for the setup resolution or repository list to load).
  3. Check if users are being distracted (tab-switching, long decision time). The 10-minute window may need to be extended.
  4. Verify the cleanup scheduler is not aggressively deleting setups early. Check `expires_at` values versus actual deletion times.
  5. Consider adding a client-side timer warning at the 8-minute mark to prompt the user to complete setup.

### Error Cases and Failure Modes

| Failure Mode | HTTP Status | Detection | Impact | Mitigation |
|-------------|-------------|-----------|--------|------------|
| Invalid/missing JSON body | 400 | Input validation | User sees validation error | Clear error message; form validation prevents this in web UI |
| Missing required fields | 400 | Input validation | User sees field-specific error | Form validation in web UI; CLI validates options before API call |
| Setup key expired | 404 | Setup lookup returns null | User must restart OAuth flow | Error message with "Reconnect" button; consider extending TTL |
| Setup key already consumed | 404 | Atomic delete returns 0 rows | Double-click or replay prevented | Idempotent failure; user sees "setup not found" |
| Setup key belongs to different user | 404 | User ID mismatch in query | Cross-user attack prevented | Silent 404 (no information leakage) |
| Team ID not in setup | 400 | Team array scan finds no match | Tampered request or stale UI | Error message; user must reconnect |
| Repository not found | 404 | Repo lookup returns null | Deleted repo or wrong ID | User selects different repo |
| User lacks admin access | 403 | Permission check fails | User can't create integration here | Error message; suggest different repo or request access |
| Encryption key missing | 500 | AES-256-GCM init fails | All creates fail | Alert fires; verify CODEPLANE_SECRET_KEY env var |
| Database INSERT fails | 500 | SQL error | Integration not created | Alert fires; check DB health |
| Database connection pool exhausted | 500 | Connection timeout | All creates fail | Alert fires; scale DB connections |
| Webhook secret generation fails | 500 | crypto.getRandomValues error | Should never happen | Log and alert; check system entropy source |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CR-API-001` | `POST /api/integrations/linear` with valid body (valid setup key, valid team ID matching setup, valid repo ID where user is admin) | HTTP 201; response contains `id`, `linear_team_id`, `linear_team_name`, `repo_owner`, `repo_name`, `is_active: true` |
| `CR-API-002` | Verify the created integration appears in `GET /api/integrations/linear` immediately after creation | New integration present in list with matching `id`, team, and repo fields |
| `CR-API-003` | `POST /api/integrations/linear` without authentication (no session cookie, no PAT) | HTTP 401 with `{ "error": "authentication required" }` |
| `CR-API-004` | `POST /api/integrations/linear` with expired PAT | HTTP 401 |
| `CR-API-005` | `POST /api/integrations/linear` with valid PAT (non-cookie auth) | HTTP 201; integration created successfully |
| `CR-API-006` | `POST /api/integrations/linear` with missing `linear_team_id` (field absent) | HTTP 400 with `"linear_team_id and repo_id are required"` |
| `CR-API-007` | `POST /api/integrations/linear` with empty `linear_team_id` (empty string) | HTTP 400 with `"linear_team_id and repo_id are required"` |
| `CR-API-008` | `POST /api/integrations/linear` with whitespace-only `linear_team_id` | HTTP 400 with `"linear_team_id and repo_id are required"` |
| `CR-API-009` | `POST /api/integrations/linear` with missing `repo_id` | HTTP 400 with `"linear_team_id and repo_id are required"` |
| `CR-API-010` | `POST /api/integrations/linear` with `repo_id: 0` | HTTP 400 with `"linear_team_id and repo_id are required"` |
| `CR-API-011` | `POST /api/integrations/linear` with `repo_id: -1` | HTTP 400 |
| `CR-API-012` | `POST /api/integrations/linear` with `repo_id: "not_a_number"` | HTTP 400 |
| `CR-API-013` | `POST /api/integrations/linear` with missing `setup_key` | HTTP 400 with `"setup_key is required"` |
| `CR-API-014` | `POST /api/integrations/linear` with empty `setup_key` | HTTP 400 with `"setup_key is required"` |
| `CR-API-015` | `POST /api/integrations/linear` with non-JSON body (e.g., plain text) | HTTP 400 with `"invalid request body"` |
| `CR-API-016` | `POST /api/integrations/linear` with empty body `{}` | HTTP 400 (missing required fields) |
| `CR-API-017` | `POST /api/integrations/linear` with a `setup_key` that does not exist | HTTP 404 (setup not found) |
| `CR-API-018` | `POST /api/integrations/linear` with a `setup_key` that has already been consumed (second submission) | HTTP 404 (setup already consumed) |
| `CR-API-019` | `POST /api/integrations/linear` with a `setup_key` that has expired (>10 minutes old) | HTTP 404 (setup expired) |
| `CR-API-020` | `POST /api/integrations/linear` with a valid `setup_key` belonging to a different user | HTTP 404 (user-scoped; no information leakage) |
| `CR-API-021` | `POST /api/integrations/linear` with a `linear_team_id` that was NOT in the OAuth setup's teams list | HTTP 400 with `"selected linear_team_id was not returned by the oauth setup"` |
| `CR-API-022` | `POST /api/integrations/linear` where the setup had 3 teams and the user selects each one individually (3 separate tests with 3 separate setup keys) | All 3 return HTTP 201 with the correct `linear_team_name` matching the selected team |
| `CR-API-023` | `POST /api/integrations/linear` with a `repo_id` for a repository that does not exist | HTTP 404 with `"repository not found"` |
| `CR-API-024` | `POST /api/integrations/linear` with a `repo_id` for a repository where the user has Read access but NOT admin | HTTP 403 with `"you do not have admin access to this repository"` |
| `CR-API-025` | `POST /api/integrations/linear` with a `repo_id` for a repository where the user has Write access but NOT admin | HTTP 403 |
| `CR-API-026` | `POST /api/integrations/linear` with a `repo_id` for a repository where the user IS admin | HTTP 201 |
| `CR-API-027` | `POST /api/integrations/linear` with a `repo_id` for a repository the user owns | HTTP 201 |
| `CR-API-028` | `POST /api/integrations/linear` with a `repo_id` for an org repository where the user is org admin | HTTP 201 |
| `CR-API-029` | Verify the response does NOT contain `access_token_encrypted`, `refresh_token_encrypted`, `token_expires_at`, `webhook_secret`, or `user_id` | None of these fields present in 201 response body |
| `CR-API-030` | Verify the response `is_active` field is `true` | `is_active === true` |
| `CR-API-031` | Verify the response `id` is a string (not a number) | `typeof response.id === "string"` |
| `CR-API-032` | Verify the `Content-Type` response header is `application/json` | Header matches |
| `CR-API-033` | `POST /api/integrations/linear` with `linear_team_id` at maximum length (255 characters, padded) | HTTP 400 (team mismatch since no OAuth setup has a 255-char team ID) or HTTP 201 if mocked |
| `CR-API-034` | `POST /api/integrations/linear` with `linear_team_id` at exactly the length of a standard Linear UUID (36 chars) | HTTP 201 (assuming team matches) |
| `CR-API-035` | `POST /api/integrations/linear` with `repo_owner` at maximum length (100 characters) and `repo_name` at maximum length (100 characters) | HTTP 201 if repo exists and user is admin |
| `CR-API-036` | `POST /api/integrations/linear` with `repo_owner` containing special characters not allowed in Codeplane usernames | HTTP 404 (repo not found) — validation happens at repo lookup, not field parsing |
| `CR-API-037` | Verify that after a successful create, the consumed setup key can NOT be used again for `GET /api/integrations/linear/oauth/setup/:setupKey` | HTTP 404 on setup resolution |
| `CR-API-038` | Verify that two integrations can be created for the same repository with different Linear teams (using two separate setup keys) | Both return HTTP 201; both appear in list |
| `CR-API-039` | Verify that two integrations can be created for different repositories with the same Linear team (using two separate setup keys) | Both return HTTP 201 |
| `CR-API-040` | `POST /api/integrations/linear` with extra fields in the request body (e.g., `foo: "bar"`) | HTTP 201 — extra fields silently ignored |
| `CR-API-041` | Feature flag disabled: `POST /api/integrations/linear` when `INTEGRATION_LINEAR_CREATE` flag is off | HTTP 404 or endpoint not mounted |
| `CR-API-042` | Concurrent creation: Send 5 simultaneous valid requests (each with a unique setup key) from the same user | All 5 return either 201 (if all setups are valid) or a mix of 201 and 404 (if setup consumption races); no 500s or deadlocks |
| `CR-API-043` | Double-click prevention: Send the same request twice rapidly with the same setup key | First returns 201; second returns 404 (setup consumed) |
| `CR-API-044` | Rate limiting: Send 11 valid create requests within 1 minute from the same user | First 10 succeed (or fail for other reasons); 11th returns 429 with `Retry-After` header |
| `CR-API-045` | Rate limiting does not cross users: User A sends 10 requests, User B sends 1 request | User B gets normal response (not rate-limited) |

### Security Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CR-SEC-001` | Verify no token material appears in any API response for a successful create | Grep 201 response body for patterns matching `lin_api_`, `lin_ref_`, or base64-encoded data >50 chars — none found |
| `CR-SEC-002` | Verify the integration record in the database has encrypted (non-plaintext) values in `access_token_encrypted` and `refresh_token_encrypted` columns | Raw DB query shows binary/encrypted data, not readable token strings |
| `CR-SEC-003` | Verify the `webhook_secret` is NOT returned in the 201 response | Field absent from response |
| `CR-SEC-004` | Verify the `webhook_secret` stored in the database is at least 32 characters | Raw DB query confirms length |
| `CR-SEC-005` | Verify a setup key belonging to User A cannot be consumed by User B | User B receives 404 when using User A's setup key |
| `CR-SEC-006` | Verify the endpoint rejects requests without a valid session or PAT | HTTP 401 |
| `CR-SEC-007` | Verify no token, setup key, or webhook secret appears in server logs after a successful create | Log inspection confirms only hashed values or IDs appear |

### E2E Tests (Playwright — Web UI)

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CR-E2E-001` | Full happy path: Sign in → Navigate to integrations → Click "Connect Linear" → Complete OAuth (mocked) → Select team → Select repository → Click "Complete Setup" → See success toast → See integration in list | Integration card visible with correct team name and repo |
| `CR-E2E-002` | Team selection with single team: After OAuth, verify the single team is auto-selected and the team selector shows the team name and key | Team displayed as pre-selected; user only needs to pick a repo |
| `CR-E2E-003` | Team selection with multiple teams: After OAuth with 3 teams, verify all 3 teams are listed and user can select any one | Radio group/dropdown shows all 3 teams |
| `CR-E2E-004` | Repository picker loads and displays user's repos: Verify the repository dropdown is populated with repos from the API | Dropdown contains repo entries with owner/name format |
| `CR-E2E-005` | Repository picker with search: Type a search term in the repo picker and verify the list filters | Only matching repos visible |
| `CR-E2E-006` | "Complete Setup" button is disabled until both team and repo are selected | Button is disabled when either is unselected; enabled when both selected |
| `CR-E2E-007` | "Complete Setup" button shows loading spinner during submission | Button text changes or spinner appears; button is not clickable |
| `CR-E2E-008` | Double-click prevention: Click "Complete Setup" rapidly twice; verify only one request is sent | Network inspector shows only 1 POST request |
| `CR-E2E-009` | Error: Expired setup key — mock the API to return 404 on create; verify error banner shows with "Reconnect" action | Error message visible; "Reconnect Linear" button present |
| `CR-E2E-010` | Error: Permission denied — mock the API to return 403; verify error banner explains the permission issue | Error message mentions "admin access" |
| `CR-E2E-011` | Error: Network failure — intercept the POST request and simulate a network error; verify error banner with "Retry" button | Error message visible; "Retry" button functional |
| `CR-E2E-012` | After successful creation, verify the URL changes to `/integrations/linear` (list view) | URL bar shows list route |
| `CR-E2E-013` | After successful creation, verify the new integration appears at the top of the integration list (newest first) | First card in list matches the just-created integration |
| `CR-E2E-014` | Unauthenticated user navigating to the setup page is redirected to login | Login page or auth prompt displayed |

### CLI Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CR-CLI-001` | `codeplane extension linear install` with valid credentials via stdin and all required options | JSON output with `id`, `linear_team_id`, `repo_owner`, `repo_name`, `is_active: true`; exit code 0 |
| `CR-CLI-002` | `codeplane extension linear install` without `--credentials-stdin` flag | Error: "Linear OAuth credentials must be provided via stdin with --credentials-stdin"; exit code 1 |
| `CR-CLI-003` | `codeplane extension linear install --credentials-stdin` with empty stdin | Error: "Linear OAuth credentials" message; exit code 1 |
| `CR-CLI-004` | `codeplane extension linear install --credentials-stdin` with malformed JSON on stdin (e.g., `not json`) | Error: "invalid Linear OAuth credentials on stdin"; exit code 1 |
| `CR-CLI-005` | `codeplane extension linear install --credentials-stdin` with JSON missing `access_token` field | Error: "invalid Linear OAuth credentials on stdin"; exit code 1 |
| `CR-CLI-006` | `codeplane extension linear install --credentials-stdin` with JSON where `access_token` is empty string | Error: credential validation fails; exit code 1 |
| `CR-CLI-007` | `codeplane extension linear install --credentials-stdin` with valid JSON containing `access_token` and `refresh_token` | Success; both tokens included in API request |
| `CR-CLI-008` | `codeplane extension linear install --credentials-stdin` with valid JSON containing only `access_token` (no `refresh_token`) | Success; refresh_token defaults to empty string |
| `CR-CLI-009` | `codeplane extension linear install` with `--repo-id` pointing to a non-existent repository | Error from API: "repository not found"; exit code 1 |
| `CR-CLI-010` | `codeplane extension linear install` where user lacks admin access to the target repo | Error from API: "you do not have admin access"; exit code 1 |
| `CR-CLI-011` | `codeplane extension linear install` without authentication (no stored token) | Standard CLI auth error directing to `codeplane auth login`; exit code 1 |
| `CR-CLI-012` | `codeplane extension linear install` with all optional flags (`--team-name`, `--team-key`, `--expires-at`, `--actor-id`) | Success; all optional fields passed to API |
| `CR-CLI-013` | `codeplane extension linear install` followed by `codeplane extension linear list` | Newly created integration appears in list output |
| `CR-CLI-014` | `codeplane extension linear install` followed by `codeplane extension linear remove <id>` followed by `codeplane extension linear list` | Integration no longer appears in list |
| `CR-CLI-015` | `codeplane extension linear install --credentials-stdin` with access_token at maximum reasonable length (4096 characters) | Success; token accepted and processed |
| `CR-CLI-016` | `codeplane extension linear install --credentials-stdin` with access_token at 8192 characters (over maximum) | Either success (if no server limit) or predictable error — not a crash |
| `CR-CLI-017` | `codeplane extension linear install` with `--team-id` missing | CLI argument validation error before API call; exit code 1 |
| `CR-CLI-018` | `codeplane extension linear install` with `--repo-owner` missing | CLI argument validation error; exit code 1 |
| `CR-CLI-019` | `codeplane extension linear install` with `--repo-name` missing | CLI argument validation error; exit code 1 |
| `CR-CLI-020` | `codeplane extension linear install` with `--repo-id` missing | CLI argument validation error; exit code 1 |
