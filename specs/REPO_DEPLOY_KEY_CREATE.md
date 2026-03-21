# REPO_DEPLOY_KEY_CREATE

Specification for REPO_DEPLOY_KEY_CREATE.

## High-Level User POV

Deploy keys provide repository administrators with a way to grant automated systems — such as CI/CD pipelines, deployment scripts, and build servers — scoped SSH access to a specific repository without tying that access to any individual user account. When a team member leaves the organization or rotates their personal SSH keys, deploy keys remain unaffected, giving operations teams a stable, auditable access mechanism for machines.

To add a deploy key, a repository owner or administrator navigates to the repository's settings and opens the "Deploy Keys" section. They paste in a public SSH key (typically generated on the target machine), give it a human-readable title like "production-deploy" or "ci-builder-main", and choose whether the key should have read-only access (the default, suitable for pull/fetch operations) or read-write access (needed for pushing changes back to the repository). Once created, the system computes and displays the key's SHA256 fingerprint for verification, and the key is immediately active for SSH-based repository operations.

Deploy keys are scoped to a single repository. The same public key material cannot be registered as a deploy key on the same repository twice, but may be used across different repositories. This scoping model lets teams audit exactly which machines have access to which repositories and revoke access surgically. The key's title appears in SSH session logs, making it straightforward to trace repository access back to the specific automation system that performed it.

The feature is available from the web UI, the CLI, and the raw API. All three surfaces produce the same result: a new deploy key entry associated with the repository that is immediately usable for SSH transport.

## Acceptance Criteria

### Definition of Done

- A deploy key can be created for any non-archived repository via API, CLI, and web UI.
- The created key is immediately usable for SSH repository transport (fetch for read-only, fetch+push for read-write).
- The key appears in the deploy key list for that repository.
- All clients (API, CLI, web) produce consistent behavior and error responses.

### Functional Constraints

- **Title is required.** An empty or whitespace-only title must be rejected with a validation error.
- **Title maximum length is 255 characters.** Titles longer than 255 characters must be rejected.
- **Title must be trimmed.** Leading and trailing whitespace must be stripped before storage.
- **Title allows printable characters.** Alphanumeric characters, hyphens, underscores, dots, spaces, and other printable ASCII/Unicode characters are permitted. Control characters (U+0000–U+001F, U+007F) must be rejected.
- **Key material is required.** An empty or whitespace-only key must be rejected with a validation error.
- **Key material must be a valid SSH public key.** The key must parse as one of the accepted SSH key types: `ssh-ed25519`, `ssh-rsa`, `ecdsa-sha2-nistp256`, `ecdsa-sha2-nistp384`, `ecdsa-sha2-nistp521`, `sk-ssh-ed25519@openssh.com`, `sk-ecdsa-sha2-nistp256@openssh.com`. Invalid key formats or unsupported key types must be rejected.
- **SHA256 fingerprint is computed server-side.** The client never supplies the fingerprint; it is derived from the public key material and returned in the response.
- **Fingerprint format is `SHA256:<base64-no-padding>`.** This matches OpenSSH's standard fingerprint format.
- **Duplicate fingerprint within the same repository is rejected.** Attempting to create a deploy key with the same public key material already registered on the same repository must return a 409 Conflict error.
- **Same key on different repositories is allowed.** The uniqueness constraint is per-repository, not global.
- **Same key as a user SSH key is allowed.** Deploy keys and user SSH keys occupy different identity spaces.
- **`read_only` defaults to `true`.** If the `read_only` field is omitted, the key is created as read-only.
- **`read_only` must be a boolean.** Non-boolean values must be rejected.
- **The repository must exist.** Creating a deploy key for a non-existent repository returns 404.
- **The repository must not be archived.** Creating a deploy key on an archived repository returns 403.
- **The response includes `id`, `title`, `fingerprint`, `read_only`, and `created_at`.** The public key material is not returned.
- **The response `id` is a stable numeric identifier** usable for subsequent GET and DELETE operations.
- **Only the canonical key form is stored.** Key type and base64 data only; trailing comment is stripped.

### Edge Cases

- **Key with trailing comment:** Comment stripped; only key type + base64 data stored.
- **Key with extra whitespace:** Tolerated during parsing.
- **Key with Windows-style line endings:** Handled gracefully.
- **Empty JSON body:** Returns 422 validation error listing missing fields.
- **Payload with extra unknown fields:** Extra fields silently ignored.
- **Concurrent duplicate creation:** Exactly one succeeds; the other receives 409.
- **Very long key material (e.g., 16KB RSA key):** Accepted if valid.
- **DSA keys (`ssh-dss`):** Rejected as unsupported.
- **Private key material submitted:** Rejected with clear validation error.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/keys`

**Request Headers:**
- `Content-Type: application/json`
- `Authorization: token <PAT>` or session cookie

**Request Body:**
```json
{
  "title": "ci-deploy-production",
  "key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... user@host",
  "read_only": true
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | string | Yes | — | Human-readable name (1–255 chars) |
| `key` | string | Yes | — | SSH public key material |
| `read_only` | boolean | No | `true` | Read-only or read-write access |

**Success Response:** `201 Created`
```json
{
  "id": 42,
  "title": "ci-deploy-production",
  "fingerprint": "SHA256:nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY8",
  "read_only": true,
  "created_at": "2026-03-22T10:30:00.000Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Malformed JSON or non-JSON content type | `{ "message": "bad request" }` |
| 401 | No authentication | `{ "message": "unauthorized" }` |
| 403 | Lacks admin/owner access or repo archived | `{ "message": "forbidden" }` |
| 404 | Repository not found | `{ "message": "not found" }` |
| 409 | Duplicate fingerprint on this repo | `{ "message": "deploy key already registered for this repository" }` |
| 422 | Validation failure | `{ "message": "validation failed", "errors": [{"resource": "DeployKey", "field": "...", "code": "..."}] }` |
| 429 | Rate limit exceeded | `{ "message": "rate limit exceeded" }` |

### SDK Shape

The `RepoService` (or new `DeployKeyService`) in `packages/sdk` should expose:

```typescript
async createDeployKey(
  repositoryId: string,
  req: { title: string; key: string; read_only?: boolean }
): Promise<Result<{
  id: number;
  title: string;
  fingerprint: string;
  read_only: boolean;
  created_at: string;
}, APIError>>
```

This method validates/trims the title (non-empty, ≤255 chars, no control characters), parses the SSH public key via the shared `parseSSHPublicKey` helper, checks for duplicate fingerprints within the repository scope, inserts via the generated `createDeployKey` SQL wrapper, and returns the formatted result.

### CLI Command

**Current path:** `codeplane api /api/repos/:owner/:repo/keys --method POST -f title=... -f key=... -f read_only=true`

**Future first-class command:**
```
codeplane deploy-key add --repo <owner/repo> --title <title> --key <public-key> [--read-write] [--json]
```

- `--repo` / `-R`: Repository in `owner/repo` format. Defaults to current repo context.
- `--title`: Required. Human-readable name.
- `--key`: Required. SSH public key string, or `-` for stdin, or `@<path>` for file.
- `--read-write`: Optional flag. If present, read-write access. If absent, read-only.
- `--json`: Output as JSON.

**Default output:**
```
Deploy key added to owner/repo
  ID:          42
  Title:       ci-deploy-production
  Fingerprint: SHA256:nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY8
  Access:      read-only
  Created:     2026-03-22T10:30:00Z
```

### Web UI Design

**Location:** Repository Settings → "Deploy Keys" tab.

**Page layout:**
1. **Header:** "Deploy Keys" with subtitle: "Deploy keys grant SSH access to this repository from automated systems."
2. **Add Deploy Key form:**
   - Title text input (placeholder: "e.g., production-deploy", max 255 chars)
   - Key multiline textarea (placeholder: "Paste your SSH public key here...")
   - Access level toggle: "Read-only" (default) / "Read & write" with helper text
   - "Add deploy key" submit button (disabled while submitting, shows spinner)
3. **Validation feedback:** Inline field-level errors on 422; toast for 409/server errors; success toast with fingerprint.
4. **Existing keys list:** Card/row per key showing title, truncated fingerprint with copy button, access badge, relative created date, delete button. Empty state: "No deploy keys have been added to this repository."

### Documentation

1. **"Managing deploy keys" guide:** What deploy keys are, when to use them, generating keypairs, adding via web UI and CLI, read-only vs read-write, verification steps, security best practices.
2. **API reference:** `POST /api/repos/:owner/:repo/keys` — schema, auth requirements, error codes, curl example.
3. **CLI reference:** `codeplane deploy-key add` — flags, examples (inline, file, stdin), error behavior.

## Permissions & Security

### Authorization

| Role | Can create deploy keys? |
|------|------------------------|
| Repository Owner | ✅ Yes |
| Repository Admin | ✅ Yes |
| Organization Owner (for org repos) | ✅ Yes |
| Team Member with Write access | ❌ No |
| Team Member with Read access | ❌ No |
| Collaborator (any level) | ❌ No — only Owner/Admin |
| Anonymous / Unauthenticated | ❌ No (401) |

**Rationale:** Deploy keys grant SSH transport access that bypasses user-level authentication. Only repository administrators and owners should be able to establish this level of access.

### Rate Limiting

- **Per-user, per-repository:** Maximum 10 deploy key creation requests per hour per user per repository.
- **Per-user global:** Maximum 60 deploy key creation requests per hour across all repositories.
- **Rationale:** Deploy key creation is a low-frequency administrative action. These limits prevent abuse without impacting legitimate use.

### Data Privacy & Security

- **Public key only:** Only the public key is stored. The server never receives or stores private key material. If private key material is submitted, it must be detected and rejected, and the request body must not be logged.
- **Fingerprint is non-sensitive:** Safe to display, log, and return in API responses.
- **Key material not in responses:** Full public key stored but not returned in create or list responses.
- **Audit trail:** Every creation logged with acting user ID, repository, fingerprint, and access level. Full public key material must never appear in audit logs.
- **SSH session attribution:** Deploy key SSH sessions log the key's title as `deploy-key:<title>`.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `deploy_key.created` | Deploy key successfully created | `repository_id`, `repository_owner`, `repository_name`, `key_id`, `key_fingerprint_prefix` (first 12 chars), `read_only` (boolean), `key_type` (e.g., `ssh-ed25519`), `actor_user_id`, `client` (`api`/`cli`/`web`), `timestamp` |
| `deploy_key.create_failed` | Deploy key creation rejected | `repository_id`, `repository_owner`, `repository_name`, `error_code` (`duplicate`/`validation`/`forbidden`/`not_found`), `actor_user_id`, `client`, `timestamp` |

### Funnel Metrics & Success Indicators

- **Adoption rate:** Repositories with ≥1 deploy key / total repositories.
- **Key type distribution:** `ssh-ed25519` vs `ssh-rsa` vs `ecdsa-*` breakdown.
- **Read-only ratio:** % of keys created as read-only (healthy: >80%).
- **First deploy key time-to-create:** Time from repo creation to first deploy key, by client surface.
- **Error rate:** `create_failed` / (`created` + `create_failed`) — target <5%.
- **Duplicate rejection rate:** High rate may signal UX confusion.
- **Growth:** Deploy key creation volume grows month-over-month.
- **SSH adoption:** SSH sessions attributed to deploy keys grow proportionally.
- **Web UX speed:** Median time from settings page load to key creation <60 seconds.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Deploy key created | `info` | `event=deploy_key_created`, `repo_id`, `repo_slug`, `key_id`, `fingerprint`, `read_only`, `key_type`, `actor_user_id`, `duration_ms` | Successful creation |
| Validation error | `warn` | `event=deploy_key_create_validation_error`, `repo_slug`, `field`, `error_code`, `actor_user_id` | 422 response |
| Duplicate key | `warn` | `event=deploy_key_create_duplicate`, `repo_slug`, `fingerprint`, `actor_user_id` | 409 response |
| Forbidden | `warn` | `event=deploy_key_create_forbidden`, `repo_slug`, `actor_user_id` | 403 response |
| Internal error | `error` | `event=deploy_key_create_error`, `repo_slug`, `actor_user_id`, `error_message` | 500 response |

**Log hygiene:** Public key material must NEVER appear in logs. Only fingerprints and key types may be logged.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_deploy_key_create_total` | Counter | `status` (`success`, `duplicate`, `validation_error`, `forbidden`, `not_found`, `internal_error`) | Total creation attempts |
| `codeplane_deploy_key_create_duration_seconds` | Histogram | `status` | Request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_deploy_keys_total` | Gauge | — | Total deploy keys across all repos |
| `codeplane_deploy_keys_per_repo` | Histogram | — | Distribution of key count per repo (buckets: 1, 2, 5, 10, 20, 50) |

### Alerts & Runbooks

#### `DeployKeyCreateErrorRateHigh`
- **Condition:** `rate(codeplane_deploy_key_create_total{status="internal_error"}[5m]) / rate(codeplane_deploy_key_create_total[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:** 1) Check logs for `event=deploy_key_create_error` to identify the error. 2) Verify database connectivity — most internal errors are DB write failures. 3) Check `deploy_keys` table for lock contention or storage limits. 4) Verify the unique constraint on `(repository_id, key_fingerprint)` is intact. 5) If transient (DB failover), monitor recovery. If persistent, escalate to DB on-call.

#### `DeployKeyCreateLatencyHigh`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_deploy_key_create_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning
- **Runbook:** 1) Check DB query latency — insert and duplicate-check should each be <50ms. 2) Check for connection pool exhaustion. 3) Check for bulk-creation scripts causing unusual load. 4) Run `EXPLAIN ANALYZE` on the duplicate-check query to verify index usage. 5) If correlated with overall DB load, coordinate with DB on-call.

#### `DeployKeyDuplicateRateSpike`
- **Condition:** `rate(codeplane_deploy_key_create_total{status="duplicate"}[15m]) > 5`
- **Severity:** Info
- **Runbook:** 1) Typically a misconfigured automation script. 2) Check `actor_user_id` from `deploy_key_create_duplicate` logs. 3) If single source, contact the user. 4) If widespread, investigate whether the list endpoint/UI is broken.

### Error Cases & Failure Modes

| Error Case | Behavior | Recovery |
|------------|----------|----------|
| Database unavailable | 500 | Automatic retry; DB failover |
| Unique constraint race | 409 | Client retries are idempotent |
| SSH key parse failure | 422 | User corrects key; log key type prefix only |
| Request body too large | 413/400 | Middleware rejects before handler |
| Repo deleted between authz and insert | FK violation → 500 | Rare race; client retry gets 404 |

## Verification

### API Integration Tests

1. **Create read-only deploy key with Ed25519** — Generate Ed25519 keypair. POST with valid title, key, `read_only: true`. Assert 201 with `id` (number > 0), matching `title`, `SHA256:...` fingerprint, `read_only: true`, ISO 8601 `created_at`.
2. **Create read-write deploy key with Ed25519** — POST with `read_only: false`. Assert 201 with `read_only: false`.
3. **Create deploy key with RSA key** — Generate 4096-bit RSA keypair. POST. Assert 201 with valid fingerprint.
4. **Create deploy key with ECDSA key (nistp256)** — Generate ECDSA keypair. POST. Assert 201.
5. **Default read_only when omitted** — POST with only `title` and `key`. Assert 201 with `read_only: true`.
6. **Title at max length (255 chars)** — POST with 255-char title. Assert 201.
7. **Title exceeding max length (256 chars)** — POST with 256-char title. Assert 422 on `title` field.
8. **Title with special/Unicode characters** — POST with hyphens, underscores, dots, spaces, Unicode. Assert 201, title preserved.
9. **Empty title** — POST with `title: ""`. Assert 422, field `title`, code `missing_field`.
10. **Whitespace-only title** — POST with `title: "   "`. Assert 422, field `title`, code `missing_field`.
11. **Missing title field** — POST with `{ "key": "..." }`. Assert 422.
12. **Empty key** — POST with `key: ""`. Assert 422, field `key`, code `missing_field`.
13. **Missing key field** — POST with `{ "title": "test" }`. Assert 422.
14. **Invalid key material** — POST with `key: "not-a-key"`. Assert 422, field `key`, code `invalid`.
15. **Unsupported key type (DSA)** — POST with `ssh-dss` key. Assert 422.
16. **Key with trailing comment** — POST with comment in key. Assert 201; fingerprint computed from key data only.
17. **Key with extra whitespace** — POST with leading/trailing/multiple spaces. Assert 201.
18. **Key with Windows line endings** — POST with `\r\n`. Assert 201.
19. **Duplicate key on same repo** — Create key A on repo X, then same key A again. Assert second returns 409.
20. **Same key on different repos** — Create key A on repo X, then on repo Y. Assert both 201.
21. **Same key as user SSH key** — Register as user SSH key, then create as deploy key. Assert 201.
22. **Unauthenticated request** — POST without auth. Assert 401.
23. **Non-admin user** — POST as non-owner/non-admin. Assert 403.
24. **Read-only token** — POST with read-only PAT. Assert 403.
25. **Non-existent repository** — POST to nonexistent repo. Assert 404.
26. **Archived repository** — Archive repo, then POST. Assert 403.
27. **Empty JSON body** — POST with `{}`. Assert 422.
28. **Non-JSON content type** — POST with `text/plain`. Assert 400.
29. **Very large RSA key (16384 bit)** — Generate and submit. Assert 201 if valid.
30. **Non-boolean `read_only`** — POST with `read_only: "yes"`. Assert 400/422.
31. **Created key appears in list** — Create, then GET list. Assert key present with matching fields.
32. **Read-only key allows SSH fetch** — Create read-only key, `git clone` over SSH. Assert success.
33. **Read-only key denies SSH push** — Create read-only key, `git push` over SSH. Assert permission denied.
34. **Read-write key allows SSH push** — Create read-write key, `git push` over SSH. Assert success.

### CLI E2E Tests

35. **CLI: create via `codeplane api`** — Use raw API command. Assert exit 0, JSON has `id`, `title`, `fingerprint`, `read_only`.
36. **CLI: create via `deploy-key add`** — Assert exit 0, output includes fingerprint and access level.
37. **CLI: create with `--read-write`** — Assert output shows read-write.
38. **CLI: create with `--json`** — Assert valid JSON matching API schema.
39. **CLI: fails without auth** — Assert non-zero exit, auth error message.
40. **CLI: fails with invalid key** — Assert non-zero exit, invalid key error.

### Web UI E2E Tests (Playwright)

41. **Navigate to Deploy Keys page** — Log in as owner, go to repo settings. Assert sidebar item visible, page loads.
42. **Add deploy key via form** — Fill title, paste key, select read-only, submit. Assert success toast, key in list.
43. **Add read-write key** — Select read-write, submit. Assert "Read & write" badge.
44. **Validation: empty title** — Leave title empty, submit. Assert inline error.
45. **Validation: invalid key** — Paste invalid key, submit. Assert error message.
46. **Duplicate key error** — Add key, add same key again. Assert error toast.
47. **Empty state** — Navigate to page with no keys. Assert empty state message.
48. **Non-admin cannot access** — Log in as non-admin, navigate. Assert page inaccessible or form hidden.
