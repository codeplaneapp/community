# REPO_DEPLOY_KEY_DELETE

Specification for REPO_DEPLOY_KEY_DELETE.

## High-Level User POV

When you manage a repository on Codeplane, deploy keys are the SSH credentials that allow external systems — CI runners, build servers, deployment pipelines, and other automated tooling — to clone and optionally push to your repository without being tied to a personal user account. Over time, deploy keys accumulate as infrastructure is rotated, pipelines are retired, or security policies mandate credential cycling. Deleting a deploy key permanently revokes that credential's ability to access the repository over SSH.

From the repository settings page in the web UI, through the CLI, or from the TUI, a repository administrator or owner can select a deploy key they want to remove and delete it. The experience is direct: you find the key in your deploy key list (identified by its title, fingerprint, or ID), confirm the deletion, and the key is permanently removed. Any machine that was using that key to authenticate against Codeplane's SSH server for this repository will immediately lose access. If you accidentally delete a key you still need, you can re-add the same public key material — there is no "undo" because the key itself still exists on the remote machine.

This is a critical infrastructure hygiene action. It lets you revoke access for a decommissioned CI runner, rotate to a new key pair, respond to a security incident, or clean up keys created during testing. The delete action is always scoped to the specific repository — deleting a deploy key from one repository has no effect on deploy keys for other repositories, even if they share the same public key material. Only repository administrators and owners can delete deploy keys, because deploy keys are infrastructure credentials that affect the entire repository's access boundary.

## Acceptance Criteria

- **Authenticated access required**: The delete endpoint must return `401 Unauthorized` when called without a valid session cookie or personal access token.
- **Admin or owner permission required**: Only users with admin or owner permissions on the repository may delete deploy keys. Users with write-only or read-only access must receive `403 Forbidden`.
- **Repository-scoped operation**: The deploy key identified by `:id` must belong to the repository identified by `:owner/:repo`. If the key exists but belongs to a different repository, the endpoint must return `404 Not Found`.
- **Deploy key ID validation**: The key ID must be a positive integer. Non-numeric values, zero, negative numbers, floating-point numbers, and values exceeding `Number.MAX_SAFE_INTEGER` must be rejected with `400 Bad Request`.
- **Deploy key existence check**: If the deploy key ID does not correspond to any existing deploy key within the specified repository, the endpoint must return `404 Not Found`.
- **Immediate SSH revocation**: Once deleted, the deploy key must no longer appear in the repository's deploy key list (`GET /api/repos/:owner/:repo/keys`), and SSH authentication attempts using that key's fingerprint against this repository must fail immediately.
- **Idempotent safety**: Deleting an already-deleted deploy key must return `404 Not Found` (not a server error). The operation must not crash, corrupt data, or leave orphan records.
- **No cascading side effects**: Deleting a deploy key must not affect the repository's code, issues, landing requests, workflows, or any other data. The only effect is the removal of the key credential itself.
- **Confirmation required in interactive clients**: The CLI must support a `--yes` flag to skip confirmation. Without `--yes`, the CLI must prompt the user to confirm before proceeding. The web UI must show a confirmation dialog before executing the delete.
- **HTTP response**: Successful deletion must return `204 No Content` with an empty body.
- **Content-Type on errors**: Error responses must have `Content-Type: application/json`.
- **Deploy key ID path parameter constraints**: The key ID is provided as a URL path segment. Leading zeros are acceptable (e.g., `007` is parsed as `7`). Non-integer strings (e.g., `abc`, `1.5`, empty string) must be rejected.
- **Maximum key ID value**: Key IDs up to `2^53 - 1` (JavaScript safe integer range) must be accepted. Values beyond this range must be rejected with `400 Bad Request`.
- **No request body required**: The `DELETE` request must not require a request body. Any body sent must be ignored.
- **Defense-in-depth deletion**: The database deletion query must filter on both `id` AND `repository_id` to prevent cross-repository deletion even if the application-layer scoping check is bypassed.
- **Private repository scoping**: For private repositories, users without explicit repository access must receive `404 Not Found` (not `403`) to avoid leaking the repository's existence.
- **Archived repository restriction**: Deploy keys on archived repositories cannot be deleted. The endpoint must return `403 Forbidden` with a message indicating the repository is archived.
- **Deploy key title constraints (for display)**: The deploy key title may contain any UTF-8 characters with a maximum length of 255 characters. Titles are displayed in confirmation dialogs and logs.
- **Fingerprint uniqueness is freed**: After deletion, the same public key material (and thus same fingerprint) can be re-added to the same repository as a new deploy key.

### Definition of Done

1. The API correctly returns `204 No Content` for a valid delete and appropriate error codes for all invalid cases.
2. All acceptance criteria pass in automated E2E tests (API, CLI, and Playwright).
3. The CLI `deploy-key delete <id>` command (or equivalent) works with `--yes` flag and prompts without it.
4. The web UI repository settings page shows a delete button per deploy key row, presents a confirmation dialog, and removes the key from the list on success.
5. Repository scoping is verified by a cross-repository deletion test.
6. SSH authentication with a deleted deploy key fails for the target repository.
7. The deploy key can be re-added after deletion.
8. Documentation accurately reflects the delete behavior, CLI usage, and API shape.

## Design

### API Shape

**Endpoint**: `DELETE /api/repos/:owner/:repo/keys/:id`

**Authentication**: Required. Session cookie or `Authorization: token <PAT>` header. Write scope required.

**Path Parameters**:

| Parameter | Type | Description | Constraints |
|-----------|------|-------------|-------------|
| `owner` | `string` | Repository owner username or organization name | Required, must match an existing owner |
| `repo` | `string` | Repository name | Required, must match an existing repository under the owner |
| `id` | `number` | Unique identifier of the deploy key to delete | Positive integer, 1 to 2^53 - 1 |

**Request Body**: None. Any body sent is ignored.

**Success Response** (`204 No Content`): Empty body. No `Content-Type` header required for empty bodies.

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | Deploy key ID is not a valid positive integer | `{"message": "invalid deploy key id"}` |
| `401 Unauthorized` | No valid session or token | `{"message": "authentication required"}` |
| `403 Forbidden` | User lacks admin/owner permission on repository, or repository is archived | `{"message": "forbidden"}` |
| `404 Not Found` | Repository does not exist, user has no access to a private repo, or deploy key does not exist within this repository | `{"message": "not found"}` |
| `429 Too Many Requests` | Rate limit exceeded | `{"message": "rate limit exceeded"}` |

**Idempotency**: Deleting an already-deleted key returns `404 Not Found`. There is no `410 Gone` distinction.

### SDK Shape

The `RepoService` (or a dedicated `DeployKeyService`) in `@codeplane/sdk` exposes:

```typescript
deleteDeployKey(
  actor: AuthUser,
  owner: string,
  repo: string,
  deployKeyId: number,
): Promise<void>
```

The method:
1. Validates `actor` is non-null (throws `unauthorized`).
2. Validates `deployKeyId > 0` and `deployKeyId <= Number.MAX_SAFE_INTEGER` (throws `badRequest`).
3. Resolves the repository by `owner` and `repo` name.
4. Validates the repository is not archived (throws `forbidden`).
5. Requires admin or owner permission on the repository (throws `forbidden`).
6. Deletes using a query that filters on both `id` AND `repository_id` for defense-in-depth.
7. Checks affected row count — if 0, throws `notFound`.

The `@codeplane/ui-core` package provides a shared mutation hook:

```typescript
useDeleteDeployKey(owner: string, repo: string): {
  deleteKey: (keyId: number) => Promise<void>;
  isDeleting: boolean;
}
```

### CLI Command

**Command**: `codeplane deploy-key delete <id> [--repo OWNER/REPO] [--yes]`

**Arguments**: `id` (positional, required) — The numeric ID of the deploy key to delete.

**Options**:
- `--repo` / `-R` (optional): Repository in `OWNER/REPO` format. If omitted, resolved from the current working directory's jj/git remote.
- `--yes` / `-y` (boolean, default `false`): Skip confirmation prompt.

**Behavior**: Parse `id` argument; reject if not a valid positive safe integer. Without `--yes`, prompt: `Delete deploy key <id> from <owner>/<repo>? This will revoke repository access for any machine using this key. (y/N)`. On confirm, send `DELETE /api/repos/<owner>/<repo>/keys/<id>`. On `204`: output `Deploy key <id> deleted from <owner>/<repo>.` in human-readable mode, or `{"status":"deleted","id":<id>,"repo":"<owner>/<repo>"}` in `--json` mode. Exit code 0. On `404`: print `Error: Deploy key not found.` and exit 1. On `403`: print `Error: You do not have permission to delete deploy keys for this repository.` and exit 1.

**Fallback via `codeplane api`**: Until the first-party `deploy-key delete` subcommand is implemented, the operation is available via `codeplane api /api/repos/:owner/:repo/keys/:id --method DELETE`.

### Web UI Design

**Location**: Repository Settings → Deploy Keys (`/:owner/:repo/settings/keys`)

**Delete affordance per key row**: Each deploy key row includes a right-aligned delete button styled as a destructive action (red text or trash icon). `aria-label="Delete deploy key <key title>"` for accessibility.

**Confirmation dialog**: Modal with title "Delete Deploy Key", body: `Are you sure you want to delete "<key title>"? Any machine using this key will no longer be able to access <owner>/<repo> over SSH.` Key fingerprint shown in monospace below the warning. Read-only/read-write access level displayed as a badge. Buttons: "Cancel" (default focus, secondary) and "Delete" (destructive, red). Escape or click-outside cancels. Loading spinner on Delete button during API call, both buttons disabled during request.

**After successful deletion**: Dialog closes, key row removed (with fade-out animation), toast: `Deploy key "<key title>" deleted.` If last deploy key, show empty state with "Add Deploy Key" CTA.

**Error handling**: On API failure, dialog stays open with inline error: `Failed to delete deploy key. Please try again.` Delete button re-enables. On 404, close dialog, remove row, toast: `Key was already deleted.`

### TUI UI

**Location**: Repository settings or dedicated deploy keys screen within the TUI.

**Delete flow**: With deploy key highlighted, press `d` or `Delete`. Confirmation bar at bottom: `Delete deploy key "<title>"? This will revoke access for machines using this key. [y/N]`. On `y`: API call, key removed from list, status message `Deploy key deleted` in success color for 2 seconds. On `n` or `Esc`: dismissed. On error: error message replaces confirmation bar.

**Focus behavior after deletion**: Focus moves to the next key in the list. If the deleted key was the last one, focus moves to the previous key. If no keys remain, focus returns to the empty state area.

### Editor Integrations

**VS Code**: The repository settings webview can support deploy key deletion through the embedded web UI. No separate VS Code-native delete command is required.

**Neovim**: Deploy keys can be deleted via the CLI command, accessible through Neovim's command integration: `:Codeplane deploy-key delete <id> --yes`.

### Documentation

The following documentation must be provided:

- **API Reference** (`docs/api-reference/deploy-keys.mdx`): Document the `DELETE /api/repos/:owner/:repo/keys/:id` endpoint with path parameters, error codes, authentication requirements, and a curl example showing the delete request followed by a list call verifying absence.
- **CLI Reference** (`docs/cli/deploy-key.mdx`): Document the `deploy-key delete` subcommand with arguments, options (`--yes`, `--repo`, `--json`), example usage, and the interactive confirmation behavior. Include the `codeplane api` fallback.
- **User Guide** (`docs/guides/deploy-keys.mdx`): Include a "Deleting a Deploy Key" section covering: when to delete (decommissioned CI, key rotation, security incident); warning about immediate SSH revocation; instructions for web UI, CLI, and TUI; finding the key ID via the list command; re-adding accidentally deleted keys; troubleshooting "Permission denied (publickey)" after deletion for CI/CD pipelines.

## Permissions & Security

### Authorization Roles

| Role | Can Delete Deploy Keys? | Notes |
|------|------------------------|-------|
| **Repository Owner** | ✅ Yes | Full control over repository credentials |
| **Organization Admin** | ✅ Yes | Org-level admin implies repo admin access |
| **Repository Admin** | ✅ Yes | Admin-level credential management |
| **Team Member (write)** | ❌ No | Write access is insufficient for credential management |
| **Team Member (read)** | ❌ No | Read-only cannot manage credentials |
| **Collaborator (write)** | ❌ No | Write access is insufficient |
| **Collaborator (read)** | ❌ No | Read-only cannot manage credentials |
| **Authenticated (public repo, no explicit access)** | ❌ No | No repository management access |
| **Anonymous / Unauthenticated** | ❌ No | Returns `401` |
| **Deploy key (SSH auth)** | ❌ No | Deploy keys cannot manage other deploy keys |

### Rate Limiting

- **Standard API rate limit**: Subject to the global per-user rate limiter.
- **Recommended limit**: 30 requests per minute per authenticated user (lower than read endpoints due to destructive nature).
- **Response on limit breach**: `429 Too Many Requests` with a `Retry-After` header.
- **Burst protection**: Rate limiting must prevent automated scripts from deleting all deploy keys in rapid succession.

### Data Privacy & PII

- **Key material is never exposed**: The delete response returns no key data (204 empty body). Public key material is not included in any error response.
- **Audit trail**: Deletion logged with deploy key ID, repository ID, and actor user ID. Key title (potential operational PII) only at DEBUG level.
- **Fingerprints in logs**: Deleted key's fingerprint at DEBUG level only, not INFO or higher.
- **Hard delete**: Deploy keys are hard-deleted; no residual key material is retained in the database.
- **No notification to repository watchers**: Deleting a deploy key does not trigger notifications to repository watchers or subscribers.

### Security Considerations

- **CSRF protection**: Web UI delete flow includes CSRF token validation.
- **Timing attack resistance**: Response for "key belongs to a different repository" is indistinguishable from "key does not exist" — both return `404` with identical message and identical response timing.
- **Defense in depth**: SQL DELETE includes both `id` AND `repository_id` in WHERE clause.
- **Private repository hiding**: Users without repository access receive `404` (not `403`) to avoid leaking repository existence.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `deploy_key.deleted` | User successfully deletes a deploy key | `user_id`, `key_id`, `key_title`, `key_type` (ed25519/rsa/etc.), `was_read_only`, `key_age_days`, `remaining_key_count`, `repository_id`, `repository_owner`, `repository_name`, `client`, `timestamp` |
| `deploy_key.delete_failed` | Delete attempt fails | `user_id` (if authenticated), `key_id`, `repository_owner`, `repository_name`, `error_reason` (`not_found`, `forbidden`, `auth_error`, `rate_limited`, `invalid_id`, `archived_repo`, `server_error`), `client`, `timestamp` |
| `deploy_key.delete_confirmed` | User confirms deletion in dialog (web/TUI) | `user_id`, `key_id`, `repository_owner`, `repository_name`, `client`, `timestamp`, `time_to_confirm_ms` |
| `deploy_key.delete_cancelled` | User cancels deletion in dialog | `user_id`, `key_id`, `repository_owner`, `repository_name`, `client`, `timestamp` |

### Properties Required on All Events

- `user_id` (anonymized in analytics pipeline)
- `client` (one of: `web`, `cli`, `tui`, `api`, `vscode`, `nvim`)
- `timestamp` (ISO 8601)
- `request_id` (for correlation)

### Funnel Metrics & Success Indicators

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| **Delete completion rate** | % of delete initiations that result in successful deletion | > 80% |
| **Key hygiene rate** | % of repositories with deploy keys that delete at least one per quarter | Increasing over time |
| **Stale key detection** | % of deletions where `key_age_days` > 365 | If high, consider prompting users to review old keys |
| **Zero-key-after-delete rate** | % of deletions that leave repository with 0 remaining deploy keys | Informational — not inherently bad |
| **Re-add rate** | % of repositories that add a new deploy key within 1 hour of deleting one | Indicates rotation (healthy) vs. accidental deletion |
| **Confirmation dialog completion rate** | % of users who open the confirmation dialog and proceed with deletion vs. cancel | High cancel rates may indicate the UX is confusing or users are accidentally triggering the dialog |

## Observability

### Logging

| Log Point | Level | Structured Fields | Description |
|-----------|-------|-------------------|-------------|
| Delete request received | DEBUG | `user_id`, `request_id`, `key_id`, `repo_owner`, `repo_name` | Entry point |
| Repository resolved | DEBUG | `user_id`, `request_id`, `repository_id`, `repo_owner`, `repo_name` | Repo lookup succeeded |
| Permission verified | DEBUG | `user_id`, `request_id`, `key_id`, `permission_level` | User has admin/owner access |
| Deploy key deleted successfully | INFO | `user_id`, `request_id`, `key_id`, `repository_id`, `duration_ms` | Successful deletion (no PII) |
| Delete — key not found | INFO | `user_id`, `request_id`, `key_id`, `repository_id` | Key does not exist in this repository |
| Delete — invalid key ID | WARN | `request_id`, `raw_id`, `ip` | Malformed key ID in path |
| Delete — auth failure | WARN | `request_id`, `ip`, `auth_method_attempted` | Unauthenticated or invalid token |
| Delete — permission denied | WARN | `user_id`, `request_id`, `key_id`, `repo_owner`, `repo_name`, `user_permission` | User lacks admin/owner role |
| Delete — repository archived | WARN | `user_id`, `request_id`, `repo_owner`, `repo_name` | Attempted delete on archived repo |
| Delete — repository not found | INFO | `request_id`, `repo_owner`, `repo_name` | Owner/repo does not exist or hidden |
| Delete — service error | ERROR | `user_id`, `request_id`, `key_id`, `repository_id`, `error_message`, `stack` | Database or internal failure |
| Delete — rate limited | WARN | `user_id`, `request_id`, `ip` | Rate limit exceeded |

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_deploy_key_delete_total` | Counter | `status` (`success`, `not_found`, `forbidden`, `auth_error`, `invalid_id`, `rate_limited`, `archived`, `error`) | Total delete requests by outcome |
| `codeplane_deploy_key_delete_duration_seconds` | Histogram | — | Latency distribution. Buckets: `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5]` |
| `codeplane_deploy_key_delete_confirmation_total` | Counter | `result` (`confirmed`, `cancelled`), `client` | Confirmation dialog outcomes (client-side) |
| `codeplane_deploy_keys_total` | Gauge | — | Total deploy keys in the system (decremented on delete) |

### Alerts

#### Alert: `DeployKeyDeleteHighErrorRate`

**Condition**: `rate(codeplane_deploy_key_delete_total{status="error"}[5m]) / rate(codeplane_deploy_key_delete_total[5m]) > 0.1` sustained for 5 minutes.

**Severity**: Warning.

**Runbook**:
1. Check server error logs for deploy key delete failures filtered by `request_id`.
2. Verify database connectivity and connection pool health.
3. Check `deploy_keys` table accessibility — run a test query against it.
4. Look for database lock contention or deadlocks in pg_stat_activity.
5. Check recent deployments or migrations that may have altered the `deploy_keys` table schema or indices.
6. Check the service layer for unhandled promise rejections in the delete path.
7. Escalate to the platform team if database is degraded.

#### Alert: `DeployKeyDeleteLatencyHigh`

**Condition**: `histogram_quantile(0.95, rate(codeplane_deploy_key_delete_duration_seconds_bucket[5m])) > 3.0` sustained for 5 minutes.

**Severity**: Warning.

**Runbook**:
1. Check DB query performance — the delete should be a single indexed DELETE by `id` and `repository_id`.
2. Verify indices exist on `deploy_keys(id)` and `deploy_keys(repository_id)`.
3. Check connection pool utilization — high latency with low throughput suggests pool exhaustion.
4. Check server CPU/memory resources for saturation.
5. Look for table bloat on `deploy_keys` — run VACUUM ANALYZE if needed.
6. Investigate whether automated scripts are hammering the endpoint.
7. Consider adding a query-level timeout if not already present.

#### Alert: `DeployKeyDeletePermissionDeniedSpike`

**Condition**: `rate(codeplane_deploy_key_delete_total{status="forbidden"}[5m]) > 10` sustained for 3 minutes.

**Severity**: Warning.

**Runbook**:
1. May indicate a misconfigured CI pipeline or client bug sending delete requests with insufficient credentials.
2. Check WARN logs for `user_id` and `ip` patterns — if a single user/IP dominates, investigate that actor.
3. Verify no recent permission model changes that would have broken previously-working integrations.
4. Check client releases for regressions in the deploy key management flows.
5. If the pattern is from a single user, contact them proactively — they may be confused about permission requirements.

#### Alert: `DeployKeyMassDeleteBurst`

**Condition**: `increase(codeplane_deploy_key_delete_total{status="success"}[1m]) > 15`.

**Severity**: Warning.

**Runbook**:
1. May indicate a compromised admin account or unintentional automation bulk-deleting deploy keys.
2. Correlate `user_id` from INFO logs — identify the responsible actor.
3. Check if the same user also created deploy keys recently (rotation script vs. unexpected).
4. Verify the affected repositories — if many repos are affected, this may be an org-wide credential rotation (legitimate).
5. Contact the user out-of-band if suspicious or unexpected.
6. Consider temporary account lock via admin if the activity appears unauthorized.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | HTTP Status |
|------------|-------------------|-------------|
| No auth token / expired session | Return `401`, log at WARN | 401 |
| Invalid PAT (malformed) | Return `401`, log at WARN | 401 |
| Revoked PAT | Return `401`, log at WARN | 401 |
| Read-only PAT | Return `403`, log at WARN | 403 |
| User has write but not admin permission | Return `403`, log at WARN | 403 |
| Repository is archived | Return `403`, log at WARN | 403 |
| Key ID not a number | Return `400`, log at WARN | 400 |
| Key ID zero or negative | Return `400`, log at WARN | 400 |
| Key ID is float | Return `400`, log at WARN | 400 |
| Key ID exceeds MAX_SAFE_INTEGER | Return `400`, log at WARN | 400 |
| Repository does not exist | Return `404`, log at INFO | 404 |
| Private repo, user has no access | Return `404`, log at INFO | 404 |
| Key does not exist | Return `404`, log at INFO | 404 |
| Key exists but belongs to different repository | Return `404`, log at WARN (defense in depth) | 404 |
| Database unreachable | Return `500`, log at ERROR | 500 |
| Database query timeout | Return `500`, log at ERROR | 500 |
| Rate limit exceeded | Return `429` with Retry-After, log at WARN | 429 |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `API-DK-DEL-001` | `DELETE /api/repos/:owner/:repo/keys/:id` with valid auth (admin) and valid deploy key ID | `204 No Content`, empty body |
| `API-DK-DEL-002` | After successful delete, `GET /api/repos/:owner/:repo/keys` no longer includes the deleted key | Deleted key's `id` is absent from the list |
| `API-DK-DEL-003` | `DELETE /api/repos/:owner/:repo/keys/:id` without auth header | `401 Unauthorized` |
| `API-DK-DEL-004` | `DELETE /api/repos/:owner/:repo/keys/:id` with expired/invalid token | `401 Unauthorized` |
| `API-DK-DEL-005` | `DELETE /api/repos/:owner/:repo/keys/:id` with read-only PAT | `403 Forbidden` |
| `API-DK-DEL-006` | `DELETE /api/repos/:owner/:repo/keys/:id` with write-access user (not admin/owner) | `403 Forbidden` |
| `API-DK-DEL-007` | `DELETE /api/repos/:owner/:repo/keys/:id` where key does not exist (e.g., ID `999999999`) | `404 Not Found` |
| `API-DK-DEL-008` | `DELETE /api/repos/:owner/:repo/keys/:id` where key belongs to a different repository | `404 Not Found` (not `403`) |
| `API-DK-DEL-009` | `DELETE /api/repos/:owner/:repo/keys/:id` with ID `0` | `400 Bad Request` with `"invalid deploy key id"` |
| `API-DK-DEL-010` | `DELETE /api/repos/:owner/:repo/keys/:id` with ID `-1` | `400 Bad Request` |
| `API-DK-DEL-011` | `DELETE /api/repos/:owner/:repo/keys/:id` with ID `abc` | `400 Bad Request` |
| `API-DK-DEL-012` | `DELETE /api/repos/:owner/:repo/keys/:id` with ID `1.5` | `400 Bad Request` |
| `API-DK-DEL-013` | `DELETE /api/repos/:owner/:repo/keys/:id` with ID as empty string (path `/api/repos/:owner/:repo/keys/`) | `400 Bad Request` or `404` (route miss) |
| `API-DK-DEL-014` | `DELETE /api/repos/:owner/:repo/keys/:id` with ID exceeding `Number.MAX_SAFE_INTEGER` (`9007199254740992`) | `400 Bad Request` |
| `API-DK-DEL-015` | `DELETE /api/repos/:owner/:repo/keys/:id` with a valid maximum key ID (the largest `id` in the test database) | `204 No Content` |
| `API-DK-DEL-016` | Idempotency: delete the same deploy key twice | First call returns `204`, second call returns `404` |
| `API-DK-DEL-017` | Delete a deploy key then re-add the same public key material | Re-add succeeds with a new ID |
| `API-DK-DEL-018` | Response has no body on success | Response body is empty (length 0) |
| `API-DK-DEL-019` | Error response `Content-Type` is `application/json` | Header present and correct |
| `API-DK-DEL-020` | Delete with a request body present (`{"foo": "bar"}`) — body is ignored | `204 No Content` |
| `API-DK-DEL-021` | Cross-repository isolation: Repo A's deploy key cannot be deleted via Repo B's endpoint | `404` when using Repo B's path; Repo A's key still present |
| `API-DK-DEL-022` | Add 3 deploy keys, delete the middle one, verify other 2 remain | List returns 2 keys in correct order |
| `API-DK-DEL-023` | Delete the repository's only deploy key (last remaining key) | `204`, subsequent list returns `[]` |
| `API-DK-DEL-024` | Key ID with leading zeros (e.g., `007`) | `204 No Content` (parsed as `7`) |
| `API-DK-DEL-025` | Key ID with whitespace (e.g., ` 7 `) | `400 Bad Request` |
| `API-DK-DEL-026` | Key ID `NaN` | `400 Bad Request` |
| `API-DK-DEL-027` | Key ID `Infinity` | `400 Bad Request` |
| `API-DK-DEL-028` | Delete deploy key on non-existent repository | `404 Not Found` |
| `API-DK-DEL-029` | Delete deploy key on private repository where user has no access | `404 Not Found` (not `403`) |
| `API-DK-DEL-030` | Delete deploy key on archived repository | `403 Forbidden` |
| `API-DK-DEL-031` | Delete a read-only deploy key | `204 No Content` — same behavior as read-write key deletion |
| `API-DK-DEL-032` | Delete a read-write deploy key | `204 No Content` |
| `API-DK-DEL-033` | Owner user can delete deploy key | `204 No Content` |
| `API-DK-DEL-034` | Org admin can delete deploy key on org repository | `204 No Content` |

### CLI Integration Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `CLI-DK-DEL-001` | `codeplane api /api/repos/:owner/:repo/keys/:id --method DELETE` with valid auth | Exit code 0 |
| `CLI-DK-DEL-002` | Round-trip: add deploy key → list → delete → list → verify absent | Key appears after add, disappears after delete |
| `CLI-DK-DEL-003` | `codeplane deploy-key delete <id> --yes --repo OWNER/REPO` (when first-party command exists) | Exit code 0, output includes confirmation |
| `CLI-DK-DEL-004` | `codeplane deploy-key delete <id> --yes --json --repo OWNER/REPO` returns structured JSON | Exit code 0, parseable JSON with status, id, and repo |
| `CLI-DK-DEL-005` | Delete non-existent deploy key via CLI | Exit code ≠ 0, error mentions not found |
| `CLI-DK-DEL-006` | `codeplane deploy-key delete abc --yes` | Exit code ≠ 0, error mentions invalid ID |
| `CLI-DK-DEL-007` | `codeplane deploy-key delete 0 --yes` | Exit code ≠ 0 |
| `CLI-DK-DEL-008` | `codeplane deploy-key delete -1 --yes` | Exit code ≠ 0 |
| `CLI-DK-DEL-009` | Delete deploy key without auth token | Exit code ≠ 0, error mentions authentication |
| `CLI-DK-DEL-010` | Delete deploy key as write-only user (not admin) | Exit code ≠ 0, error mentions permission |
| `CLI-DK-DEL-011` | Delete via CLI, verify via API list that it's gone | API list no longer contains the key |
| `CLI-DK-DEL-012` | Delete via API, attempt CLI delete of same key | CLI exits non-zero with not-found error |
| `CLI-DK-DEL-013` | Confirmation prompt: run without `--yes`, respond `n` | Key NOT deleted |
| `CLI-DK-DEL-014` | Confirmation prompt: run without `--yes`, respond `y` | Key IS deleted |

### Playwright (Web UI) E2E Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `UI-DK-DEL-001` | Navigate to `/:owner/:repo/settings/keys`, each deploy key row has a delete button | Delete button visible per row |
| `UI-DK-DEL-002` | Click delete button, confirmation dialog appears with key title and fingerprint | Dialog visible with correct metadata |
| `UI-DK-DEL-003` | Click "Cancel" in dialog, key NOT deleted | Dialog closes, key remains, API unchanged |
| `UI-DK-DEL-004` | Press Escape while dialog open | Dialog closes, key not deleted |
| `UI-DK-DEL-005` | Click "Delete" in dialog, key removed from list | Key row disappears, toast appears |
| `UI-DK-DEL-006` | After delete, page refresh doesn't show deleted key | Key gone from server-side list |
| `UI-DK-DEL-007` | Delete last remaining deploy key, empty state appears | Empty state message and "Add Deploy Key" CTA visible |
| `UI-DK-DEL-008` | Delete button shows loading state during API call | Spinner visible, buttons disabled |
| `UI-DK-DEL-009` | Simulate API failure (500), error message in dialog | Error visible, Delete button re-enabled |
| `UI-DK-DEL-010` | Delete button has correct `aria-label` | Attribute present with key title |
| `UI-DK-DEL-011` | Navigate to `/:owner/:repo/settings/keys` without auth | Redirected to login |
| `UI-DK-DEL-012` | Navigate as user with write-only access (not admin) | No delete button visible |
| `UI-DK-DEL-013` | Concurrent delete: another tab deletes key first, confirm in first tab | Handles 404 gracefully, key removed, toast: "Key was already deleted" |
| `UI-DK-DEL-014` | Confirmation dialog shows read-only/read-write badge | Badge matches key's access level |
| `UI-DK-DEL-015` | Confirmation dialog shows key fingerprint in monospace | Fingerprint visible and styled correctly |

### TUI Integration Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `TUI-DK-DEL-001` | Press `d` on focused deploy key row | Confirmation bar appears at bottom |
| `TUI-DK-DEL-002` | Confirm deletion with `y` | Key removed from list, success message for 2 seconds |
| `TUI-DK-DEL-003` | Cancel deletion with `n` or `Esc` | Confirmation dismissed, key remains |
| `TUI-DK-DEL-004` | Focus moves to next key after deletion | Focus is on the key below the deleted one |
| `TUI-DK-DEL-005` | Delete last key, focus returns to empty state | Empty state message displayed |
| `TUI-DK-DEL-006` | Error during delete shows error in status bar | Error message replaces confirmation bar |

### Cross-Cutting Validation Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `CROSS-DK-DEL-001` | Add deploy key via API, delete via CLI | CLI exits 0, API list confirms absence |
| `CROSS-DK-DEL-002` | Add deploy key via CLI, delete via API | API returns `204`, CLI list confirms absence |
| `CROSS-DK-DEL-003` | Add via web UI (API), delete via web UI, verify via CLI | All surfaces agree key is gone |
| `CROSS-DK-DEL-004` | Delete deploy key, re-add same public key material | Re-add succeeds with new ID |
| `CROSS-DK-DEL-005` | Two parallel DELETE requests for same deploy key | One `204`, one `404`, no server errors |
| `CROSS-DK-DEL-006` | Add 10 deploy keys, delete all 10 sequentially, verify empty | All deletes succeed, final list is `[]` |
| `CROSS-DK-DEL-007` | Add 10 deploy keys, delete all 10 concurrently | All complete (mix of `204`/`404`), final list is `[]` |
| `CROSS-DK-DEL-008` | After deleting deploy key, SSH clone/pull using that key fails | SSH rejected with permission denied |
| `CROSS-DK-DEL-009` | Delete deploy key A, verify deploy key B still works for SSH | SSH with key B succeeds |
| `CROSS-DK-DEL-010` | Delete deploy key from Repo A, verify Repo B's deploy keys are unaffected | Repo B can still list and use its keys |
| `CROSS-DK-DEL-011` | Delete deploy key from repo, verify user's personal SSH keys are unaffected | User can still SSH with personal key |
| `CROSS-DK-DEL-012` | Delete read-only deploy key, verify remaining read-write deploy key still permits push | Push with read-write key succeeds |
