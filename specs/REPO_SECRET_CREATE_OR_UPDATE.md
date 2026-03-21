# REPO_SECRET_CREATE_OR_UPDATE

Specification for REPO_SECRET_CREATE_OR_UPDATE.

## High-Level User POV

Repository secrets are sensitive values—API keys, access tokens, service credentials—that teams need to store securely alongside their repository and inject into workflows, workspaces, and agent sessions without ever exposing the raw value to unauthorized parties or in logs.

When a user creates or updates a repository secret, they provide a human-readable name and the sensitive value. Codeplane stores the value encrypted at rest and never returns it through any API response, CLI output, web UI, or log stream. Only the secret's name and metadata (when it was created, when it was last updated) are visible to collaborators. The actual value is only ever decrypted server-side at the moment it is injected into a workflow run, workspace environment, or agent session—and is automatically redacted from any output logs.

The create-or-update operation is an upsert: if a secret with the given name already exists in the repository, the value is silently replaced and the `updated_at` timestamp advances. If the name is new, a new secret record is created. This design means users never need to explicitly decide between "create" and "update"—they simply set the secret to the value they want, and the system does the right thing. This is critical for automation flows where an agent or CI script may set a secret without knowing whether it already exists.

The feature is accessible from the CLI (piping values through stdin to avoid shell history exposure), the HTTP API (for programmatic integrations), and will be accessible from the Web UI and TUI settings pages. Across all surfaces, the same validation rules, permission checks, and encryption behavior apply uniformly because they are implemented once in the shared SDK service layer.

## Acceptance Criteria

### Definition of Done

- [ ] A repository secret can be created by providing a valid name and non-empty value.
- [ ] If a secret with the same name already exists in the same repository, the value is replaced (upsert semantics) and `updated_at` is refreshed.
- [ ] The secret value is encrypted at rest using AES-256-GCM before being persisted.
- [ ] The API response for create/update returns only the secret's metadata (`id`, `repository_id`, `name`, `created_at`, `updated_at`)—never the value.
- [ ] The secret listing endpoint returns only metadata—never values.
- [ ] The CLI `secret set` command requires `--body-stdin` and reads the value from stdin to prevent shell history leakage.
- [ ] All clients (API, CLI, Web UI, TUI) enforce identical validation rules because validation is shared at the server layer.

### Name Validation

- [ ] Name must not be empty or whitespace-only.
- [ ] Name must match the pattern `^[a-zA-Z_][a-zA-Z0-9_]*$` (starts with letter or underscore, followed by alphanumeric characters or underscores).
- [ ] Name maximum length is 255 characters.
- [ ] Name is stored with leading/trailing whitespace trimmed.
- [ ] Names are case-sensitive: `API_KEY` and `api_key` are distinct secrets.
- [ ] Names containing hyphens (`MY-SECRET`), dots (`my.secret`), spaces, or starting with a digit (`1_SECRET`) are rejected with a validation error.

### Value Validation

- [ ] Value must not be empty (zero-length string).
- [ ] Value maximum size is 64 KiB (65,536 bytes).
- [ ] Value may contain any bytes—it is treated as an opaque string up to the size limit.
- [ ] A value consisting only of whitespace is accepted (it is non-empty).

### Upsert Behavior

- [ ] Creating a secret with a name that does not exist yields a new record. The HTTP response status is `201 Created`.
- [ ] Creating a secret with a name that already exists replaces the encrypted value and updates the `updated_at` timestamp. The HTTP response status is `201 Created` (the endpoint does not distinguish create vs. update at the HTTP status level).
- [ ] The `created_at` timestamp is preserved on update—it reflects when the secret was first created.
- [ ] Concurrent upserts for the same (repository, name) pair must not result in data corruption—the database `ON CONFLICT` clause guarantees atomicity.

### Error Cases

- [ ] Unauthenticated request returns `401 Unauthorized`.
- [ ] Request to a non-existent repository returns `404 Not Found`.
- [ ] Request to a repository the user does not have write access to returns `403 Forbidden`.
- [ ] Invalid JSON body returns `400 Bad Request` with message `"invalid request body"`.
- [ ] Missing or invalid name returns `422 Validation Failed` with field error `{ resource: "Secret", field: "name", code: "missing_field" | "invalid" }`.
- [ ] Missing or oversized value returns `422 Validation Failed` with field error `{ resource: "Secret", field: "value", code: "missing_field" | "invalid" }`.
- [ ] Encryption failure (corrupt key, runtime error) returns `500 Internal Server Error` without leaking internal details.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/secrets`

**Request Headers:**
- `Content-Type: application/json` (enforced by middleware)
- `Authorization: Bearer <PAT>` or session cookie

**Request Body:**
```json
{
  "name": "DEPLOY_TOKEN",
  "value": "ghp_abc123..."
}
```

**Success Response (201 Created):**
```json
{
  "id": 42,
  "repository_id": 7,
  "name": "DEPLOY_TOKEN",
  "created_at": "2026-03-22T10:00:00.000Z",
  "updated_at": "2026-03-22T10:00:00.000Z"
}
```

On upsert (name already exists), the response shape is identical but `updated_at` reflects the current time while `created_at` remains the original creation time.

**Error Responses:**

| Status | Condition | Body Shape |
|--------|-----------|------------|
| 400 | Malformed JSON | `{ "message": "invalid request body" }` |
| 401 | No auth | `{ "message": "authentication required" }` |
| 403 | Insufficient permissions | `{ "message": "forbidden" }` |
| 404 | Repository not found | `{ "message": "not found" }` |
| 422 | Validation failure | `{ "message": "Validation Failed", "errors": [{ "resource": "Secret", "field": "name"|"value", "code": "missing_field"|"invalid" }] }` |
| 500 | Encryption failure | `{ "message": "failed to encrypt secret value" }` |

### SDK Shape

The SDK exposes the operation through `SecretService.setSecret(repositoryId, name, value)`:

- **Input:** `repositoryId: string`, `name: string`, `value: string`
- **Output:** `Result<SecretDetail, APIError>` where `SecretDetail` contains `id`, `repository_id`, `name`, `created_at`, `updated_at`
- The service handles encryption internally using AES-256-GCM with the server's `CODEPLANE_SECRET_KEY`
- If no encryption key is configured (development mode), the value is stored as plaintext bytes

### CLI Command

**Command:** `codeplane secret set <NAME> --body-stdin [-R OWNER/REPO] [--json]`

**Behavior:**
1. The `--body-stdin` flag is mandatory. If omitted, the CLI exits with error: `"secret values must be provided via stdin with --body-stdin"`.
2. The secret value is read from stdin until EOF.
3. The resolved repository (from `-R` flag or local repo detection) is used to construct the API call.
4. On success, the CLI prints the secret metadata (name, timestamps). With `--json`, structured JSON is emitted.
5. On failure, the CLI prints the error message to stderr and exits non-zero.

**Examples:**
```bash
echo "ghp_abc123" | codeplane secret set DEPLOY_TOKEN --body-stdin -R acme/widgets
cat credentials.txt | codeplane secret set SERVICE_ACCOUNT --body-stdin -R acme/widgets
```

### Web UI Design

**Location:** Repository Settings → Secrets (sidebar navigation item)

**Secrets Settings Page:**
- Displays a table of existing secrets: Name, Created, Last Updated, Delete button per row.
- Secret values are never shown—no "reveal" or "copy" capability for existing values.
- "Add secret" form at the top or as a modal:
  - **Name** text input (placeholder: `SECRET_NAME`, client-side validation against `^[a-zA-Z_][a-zA-Z0-9_]*$`, max 255 chars)
  - **Value** textarea (masked by default with show/hide toggle during entry, placeholder: `Enter secret value`, max 64 KiB)
  - **Save** button (disabled until both fields are valid)
- Upsert is silent—no overwrite confirmation since upsert is the expected behavior.
- After save, the table refreshes showing the new/updated secret with updated timestamp.
- Inline validation errors appear below the relevant field.

### TUI Design

**Location:** Repository Detail → Settings tab → Secrets section

- Lists secret names and timestamps.
- "Add Secret" action opens inline form with name and masked value inputs.
- Same validation as the API with inline error messages.

### Documentation

1. **Concept guide: Repository Secrets** — What secrets are, how they differ from variables, encryption at rest, injection points (workflows, workspaces, agent sessions).
2. **CLI reference: `codeplane secret set`** — Syntax, `--body-stdin` requirement, `-R` flag, `--json` output, examples.
3. **API reference: `POST /api/repos/:owner/:repo/secrets`** — Request/response shapes, auth, validation rules, error codes.
4. **Settings guide: Managing Secrets in the Web UI** — Step-by-step instructions with screenshots.
5. **Security guide: Secret handling** — AES-256-GCM encryption, log redaction, `CODEPLANE_SECRET_KEY` requirement, rotation best practices.

## Permissions & Security

### Authorization

| Role | Can Create/Update Secret? |
|------|---------------------------|
| Repository Owner | ✅ Yes |
| Repository Admin | ✅ Yes |
| Repository Write | ✅ Yes |
| Repository Read | ❌ No (403) |
| Anonymous / Unauthenticated | ❌ No (401) |
| Organization Owner (for org repo) | ✅ Yes |
| Team with Write permission | ✅ Yes |

The permission check is performed via `resolveRepoId`, which calls `repo.getRepo(actor, owner, repo)`. If the actor lacks sufficient access, the call throws and the route returns the appropriate error.

### Rate Limiting

- The global rate limiter applies to all mutation endpoints, including secret creation.
- Recommended additional per-endpoint rate limit: **30 requests per minute per authenticated user** for the secrets POST endpoint, to prevent bulk secret enumeration or abuse.
- Rate limit responses follow standard `429 Too Many Requests` with `Retry-After` header.

### Data Privacy & PII

- **Secret values are never returned in any API response.** The `SecretDetail` type intentionally omits `value_encrypted`.
- **Secret values are never logged.** The `redactSecretValues` utility replaces all known secret values with `********` in workflow logs and output streams.
- **Secret values are encrypted at rest** using AES-256-GCM with a server-managed key derived from `CODEPLANE_SECRET_KEY`.
- **The CLI reads values from stdin** to avoid secret values appearing in shell history (`~/.bash_history`, `~/.zsh_history`).
- **Secret values must not appear in error messages.** Encryption/decryption failures produce generic errors without including plaintext or ciphertext.
- **Database backups** contain encrypted blobs, not plaintext values, provided `CODEPLANE_SECRET_KEY` is configured.
- **Audit trail**: Secret creation and update events are logged with the secret name and actor, but never the value.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `RepoSecretSet` | A secret is created or updated | `repo_id`, `repo_owner`, `repo_name`, `secret_name`, `actor_id`, `client` (api/cli/web/tui), `is_update` (boolean, true if `created_at != updated_at`) |
| `RepoSecretSetFailed` | Create/update attempt failed | `repo_id`, `repo_owner`, `repo_name`, `error_code` (400/401/403/422/500), `actor_id`, `client` |

**Note:** The upsert implementation uses `ON CONFLICT` and does not explicitly distinguish create vs. update at the database level. The `is_update` property can be derived by comparing `created_at` and `updated_at` in the returned row: if they differ, it was an update.

### Funnel Metrics & Success Indicators

- **Secret adoption rate:** Percentage of active repositories with ≥1 secret. Target: >30% of repos with workflows.
- **Secret freshness:** Distribution of `updated_at` age across all secrets. Secrets older than 90 days may indicate stale credentials.
- **Workflow-to-secret correlation:** Percentage of workflow runs that inject ≥1 repository secret. Measures whether secrets are fulfilling their primary use case.
- **CLI vs. API vs. Web distribution:** Breakdown of `RepoSecretSet` events by `client` property. Healthy distribution indicates multi-surface adoption.
- **Error rate:** `RepoSecretSetFailed` / (`RepoSecretSet` + `RepoSecretSetFailed`). Target: <2%.
- **Time-to-first-secret:** Duration from repository creation to first `RepoSecretSet` event. Shorter is better.

## Observability

### Logging

| Log Event | Level | Structured Context |
|-----------|-------|--------------------------|
| Secret created or updated successfully | `info` | `{ event: "secret_set", repo_id, secret_name, actor_id, is_update: boolean }` |
| Secret validation failed | `warn` | `{ event: "secret_validation_failed", repo_id, field, code, actor_id }` |
| Secret encryption failed | `error` | `{ event: "secret_encrypt_failed", repo_id, secret_name, error_class }` — **never log the value or key** |
| Unauthorized secret access attempt | `warn` | `{ event: "secret_unauthorized", repo_id, actor_id, status: 401|403 }` |
| Repository not found during secret operation | `info` | `{ event: "secret_repo_not_found", owner, repo, actor_id }` |
| Malformed request body | `warn` | `{ event: "secret_bad_request", actor_id, error: "invalid request body" }` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_repo_secret_set_total` | Counter | `status` (success/error), `is_update` (true/false) | Total secret create/update operations |
| `codeplane_repo_secret_set_errors_total` | Counter | `error_code` (400/401/403/422/500) | Secret set failures by HTTP error code |
| `codeplane_repo_secret_set_duration_seconds` | Histogram | — | Latency of the full create/update operation including encryption and DB write |
| `codeplane_repo_secret_encrypt_duration_seconds` | Histogram | — | Latency of the AES-256-GCM encryption step alone |
| `codeplane_repo_secrets_count` | Gauge | `repo_id` | Current number of secrets per repository |

### Alerts & Runbooks

**Alert 1: High Secret Set 500 Error Rate**
- **Condition:** `rate(codeplane_repo_secret_set_errors_total{error_code="500"}[5m]) > 0.1`
- **Severity:** Critical
- **Runbook:**
  1. Check server logs for `event: "secret_encrypt_failed"` entries in the last 10 minutes.
  2. Verify `CODEPLANE_SECRET_KEY` environment variable is set and non-empty on all server instances (`kubectl exec` or equivalent to inspect runtime env).
  3. Check if the encryption key was recently rotated—a mismatch between instances causes failures. Verify all pods/instances have the same key.
  4. Verify `crypto.subtle` API is functioning: check process stderr for WebCrypto runtime errors.
  5. If key rotation is the cause, ensure all instances restart simultaneously with the new key.
  6. Escalate to security team if the key appears compromised or missing from the secret store.

**Alert 2: Elevated 422 Validation Failure Rate**
- **Condition:** `rate(codeplane_repo_secret_set_errors_total{error_code="422"}[15m]) / rate(codeplane_repo_secret_set_total[15m]) > 0.5`
- **Severity:** Warning
- **Runbook:**
  1. Check structured logs for `event: "secret_validation_failed"` to identify the failing field and code.
  2. If failures are on `name` + `invalid`: a client may be sending names with unsupported characters. Check for third-party integrations or outdated client versions.
  3. If failures are on `value` + `invalid`: a client may be sending values >64 KiB. Identify the actor and assist.
  4. If concentrated on a single `actor_id`, reach out directly to help with correct usage.

**Alert 3: Secret Set p99 Latency Spike**
- **Condition:** `histogram_quantile(0.99, rate(codeplane_repo_secret_set_duration_seconds_bucket[5m])) > 2`
- **Severity:** Warning
- **Runbook:**
  1. Compare `codeplane_repo_secret_encrypt_duration_seconds` p99 to determine if encryption is the bottleneck.
  2. If encryption is slow: investigate CPU pressure on the server host (AES-GCM is CPU-bound). Check `node_cpu_seconds_total` or equivalent.
  3. If encryption is fast but total latency is high: investigate PostgreSQL write latency—check connection pool saturation, disk I/O, and lock contention on `repository_secrets`.
  4. Check for unusually large values near the 64 KiB limit that increase encryption time.

### Error Cases & Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|-------------|-----------|--------|------------|
| `CODEPLANE_SECRET_KEY` not set | Log warning at service init; 500 on encrypt in prod | Secrets stored plaintext (dev mode) or fail (prod) | Startup health check verifies key presence |
| `CODEPLANE_SECRET_KEY` rotated | Old secrets fail to decrypt | Workflow/workspace injection fails for existing secrets | Re-encrypt migration tool; coordinated key rollout |
| Database connection failure | Standard DB error propagation | Secret set returns 500 | Retry with backoff; DB availability alerting |
| Concurrent upsert race | `ON CONFLICT` clause handles atomically | Last write wins, no corruption | Expected behavior |
| Value at exactly 64 KiB | Validation accepts | Slightly higher latency | Monitor p99 for large values |

## Verification

### API Integration Tests

- [ ] **T01**: Create a new secret with valid name (`API_KEY`) and value (`secret123`) → returns 201 with `id`, `repository_id`, `name`, `created_at`, `updated_at`; no `value` field in response.
- [ ] **T02**: Create the same secret again with a different value → returns 201; `updated_at` is later than first call; `created_at` is unchanged.
- [ ] **T03**: List secrets after creation → array contains the secret with `name` field; no item has a `value` field.
- [ ] **T04**: Create secret with minimum valid name (single letter `A`) → 201.
- [ ] **T05**: Create secret with name starting with underscore (`_MY_SECRET`) → 201.
- [ ] **T06**: Create secret with maximum valid name (exactly 255 alphanumeric/underscore characters) → 201.
- [ ] **T07**: Reject name of 256 characters → 422 with `{ field: "name", code: "invalid" }`.
- [ ] **T08**: Reject name starting with digit (`1SECRET`) → 422.
- [ ] **T09**: Reject name containing hyphen (`MY-SECRET`) → 422.
- [ ] **T10**: Reject name containing dot (`MY.SECRET`) → 422.
- [ ] **T11**: Reject name containing space (`MY SECRET`) → 422.
- [ ] **T12**: Reject empty name (`""`) → 422 with `{ field: "name", code: "missing_field" }`.
- [ ] **T13**: Reject whitespace-only name (`"   "`) → 422 with `{ field: "name", code: "missing_field" }`.
- [ ] **T14**: Reject empty value (`""`) → 422 with `{ field: "value", code: "missing_field" }`.
- [ ] **T15**: Create secret with value at exactly 64 KiB (65,536 bytes) → 201.
- [ ] **T16**: Reject value of 65,537 bytes → 422 with `{ field: "value", code: "invalid" }`.
- [ ] **T17**: Create secret with whitespace-only value (`"   "`) → 201 (whitespace is non-empty).
- [ ] **T18**: Create secret with value containing newlines, unicode, null bytes → 201.
- [ ] **T19**: Unauthenticated request → 401.
- [ ] **T20**: Request to non-existent repository → 404.
- [ ] **T21**: Request from user with read-only access → 403.
- [ ] **T22**: Malformed JSON body → 400 with `"invalid request body"`.
- [ ] **T23**: JSON body missing `name` field → 422.
- [ ] **T24**: JSON body missing `value` field → 422.
- [ ] **T25**: Two different secret names coexist in the same repo → list returns both.
- [ ] **T26**: Secret in repo A is not visible when listing secrets in repo B.
- [ ] **T27**: `Content-Type` enforcement: POST with `text/plain` → rejected.
- [ ] **T28**: Case sensitivity: `API_KEY` and `api_key` are distinct → list shows two entries.

### CLI E2E Tests

- [ ] **T29**: `echo "val" | codeplane secret set MY_KEY --body-stdin -R owner/repo` → exit code 0.
- [ ] **T30**: `codeplane secret set MY_KEY -R owner/repo` (no `--body-stdin`) → non-zero exit, error about stdin.
- [ ] **T31**: `codeplane secret list -R owner/repo --json` → JSON array with `MY_KEY`, no `value` fields.
- [ ] **T32**: `echo "new" | codeplane secret set MY_KEY --body-stdin -R owner/repo` (update) → exit code 0.
- [ ] **T33**: `codeplane secret delete MY_KEY --yes -R owner/repo` → secret removed from subsequent list.
- [ ] **T34**: Invalid name via CLI → clear error message and non-zero exit.
- [ ] **T35**: Non-existent repo via CLI → clear error and non-zero exit.
- [ ] **T36**: No authentication via CLI → auth error and non-zero exit.

### Web UI E2E Tests (Playwright)

- [ ] **T37**: Navigate to `/:owner/:repo/settings/secrets` → page loads with empty list for new repo.
- [ ] **T38**: Fill name and value, click Save → secret appears in table with name and timestamp.
- [ ] **T39**: Verify secret value is not displayed anywhere on page after save.
- [ ] **T40**: Add second secret → both appear in table.
- [ ] **T41**: Update existing secret (same name, new value) → table shows updated timestamp.
- [ ] **T42**: Invalid name (`1BAD`) → inline validation error, Save button disabled.
- [ ] **T43**: Empty value → inline validation error, Save button disabled.
- [ ] **T44**: Delete secret via button → secret disappears from table.
- [ ] **T45**: Value input is masked (password-type) by default.
- [ ] **T46**: Value input show/hide toggle works.

### Security Tests

- [ ] **T47**: After creating a secret, list endpoint response contains no field with the plaintext value.
- [ ] **T48**: After creating a secret with `CODEPLANE_SECRET_KEY` set, raw `value_encrypted` column in DB differs from plaintext.
- [ ] **T49**: `getDecryptedValue` returns the original plaintext after creation.
- [ ] **T50**: `getRepositoryEnvironment` includes the secret with correct decrypted value.
- [ ] **T51**: `redactSecretValues` replaces the secret value with `********` in arbitrary text.
- [ ] **T52**: PAT-authenticated request can create a secret successfully.
