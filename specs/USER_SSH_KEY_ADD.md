# USER_SSH_KEY_ADD

Specification for USER_SSH_KEY_ADD.

## High-Level User POV

When you want to interact with Codeplane repositories over SSH — cloning, pushing changes, pulling updates — you need to register a public SSH key with your account. Adding an SSH key is the one-time setup step that unlocks passwordless, secure repository access from any machine you control.

The workflow is simple: on your local machine you generate an SSH key pair (or use an existing one), then give Codeplane the public half. You choose a human-readable title — something like "Work Laptop" or "Home Desktop" — so you can recognize the key later, and paste or pipe the public key content. Codeplane verifies the key is valid, computes its fingerprint, and stores it against your account. From that moment on, Codeplane's SSH server recognizes you whenever you connect with the corresponding private key.

You can add keys from the web UI settings page, from the CLI, or through the API directly. The response confirms the key was accepted and shows you its fingerprint, key type, and the title you chose, so you can immediately verify it matches what your local `ssh-keygen -lf` command reports.

If you accidentally try to register the same key twice — even with a different title — Codeplane tells you the key is already registered rather than creating a duplicate. If you paste something that isn't a valid SSH public key, or use an unsupported algorithm, Codeplane gives you a clear error explaining what went wrong before anything is stored.

Adding an SSH key is a prerequisite for SSH-based git operations and for SSH-based workspace access. It is the critical first step in your Codeplane SSH setup, and a well-designed flow here means users rarely need to think about SSH authentication again.

## Acceptance Criteria

- **Authenticated access required**: The add endpoint must return a `401 Unauthorized` error when called without a valid session cookie or personal access token.
- **Write scope required**: The endpoint must reject requests made with read-only personal access tokens. A write-capable session or token is required. Returns `403 Forbidden` or equivalent write-scope error.
- **Title is required**: If the `title` field is missing, empty, or contains only whitespace, the endpoint must return a `422 Unprocessable Entity` validation error indicating the `title` field is missing.
- **Title maximum length**: The `title` field must accept up to 255 characters. Titles longer than 255 characters must be rejected with a `422` validation error indicating the `title` field is invalid.
- **Title minimum length**: After trimming whitespace, the title must be at least 1 character long.
- **Title content**: The title may contain any valid Unicode characters, including spaces, punctuation, emoji, and non-Latin scripts. No character restrictions beyond length.
- **Title trimming**: Leading and trailing whitespace on the title must be trimmed before storage.
- **Key is required**: If the `key` field is missing, empty, or contains only whitespace, the endpoint must return a `422` validation error indicating the `key` field is missing.
- **Key format validation**: The `key` field must be a valid SSH public key in OpenSSH format (`<algorithm> <base64-data> [comment]`). Keys that cannot be parsed must be rejected with a `422` validation error.
- **Supported key types only**: The following key types are accepted: `ssh-rsa`, `ssh-ed25519`, `ecdsa-sha2-nistp256`, `ecdsa-sha2-nistp384`, `ecdsa-sha2-nistp521`, `sk-ssh-ed25519@openssh.com`, `sk-ecdsa-sha2-nistp256@openssh.com`. Keys with any other algorithm identifier must be rejected with a `422` validation error.
- **Base64 data validation**: The base64-encoded key data portion must decode to a non-empty byte sequence. Keys with invalid or empty base64 data must be rejected.
- **Comment stripping**: If the SSH public key string includes a trailing comment (the third whitespace-delimited field), it must be stripped before storage. Only the canonical form (`<algorithm> <base64-data>`) is persisted.
- **Fingerprint computation**: The SHA256 fingerprint must be computed from the raw decoded key bytes, encoded as `SHA256:<base64_no_trailing_padding>`, consistent with the format produced by `ssh-keygen -lf`.
- **Duplicate key rejection**: If a key with the same SHA256 fingerprint is already registered to any user, the endpoint must return `409 Conflict` with a message indicating the key is already registered. Duplicate detection is fingerprint-based, not title-based.
- **Duplicate title is allowed**: Multiple keys may share the same title. Title uniqueness is not enforced.
- **Successful response shape**: On success, the endpoint must return `201 Created` with a JSON body containing: `id` (number), `name` (string, the trimmed title), `fingerprint` (string, `SHA256:…`), `key_type` (string, the algorithm identifier), `created_at` (string, ISO 8601 UTC timestamp).
- **Public key material in response**: The success response does NOT include the raw public key string in the body. Only metadata is returned.
- **Content-Type**: The response must have `Content-Type: application/json`.
- **Idempotency**: The endpoint is NOT idempotent. Each successful call creates a new key record. Repeated calls with the same fingerprint return `409`.
- **Immediate effect**: Once the key is successfully added, it must be usable for SSH authentication on the very next SSH connection attempt. There is no propagation delay.
- **User scoping**: The key is always created under the authenticated user's account. There is no way to add a key to another user's account through this endpoint.

### Definition of Done

1. The API accepts valid SSH keys of all 7 supported types and returns `201` with the correct response shape.
2. All validation error cases return the correct HTTP status and structured error body.
3. Duplicate fingerprint detection works across users and returns `409`.
4. The CLI `ssh-key add` command works end-to-end and renders the created key in both human and JSON output modes.
5. The web UI add-key form submits successfully, shows validation errors inline, and refreshes the key list on success.
6. All acceptance criteria pass in automated E2E tests (API, CLI, and Playwright).
7. The newly added key can be used for SSH authentication immediately after creation.
8. The documentation accurately describes the add workflow, CLI usage, API shape, and error cases.

## Design

### API Shape

**Endpoint**: `POST /api/user/keys`

**Authentication**: Required. Session cookie or `Authorization: token <PAT>` header. Write scope required.

**Request Headers**:
- `Content-Type: application/json` (required for all mutation endpoints)

**Request Body**:
```json
{
  "title": "MacBook Pro M4",
  "key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGrh... user@example.com"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `title` | `string` | Yes | 1–255 characters after trimming. Any Unicode allowed. |
| `key` | `string` | Yes | Valid OpenSSH public key string. Supported types: `ssh-rsa`, `ssh-ed25519`, `ecdsa-sha2-nistp256`, `ecdsa-sha2-nistp384`, `ecdsa-sha2-nistp521`, `sk-ssh-ed25519@openssh.com`, `sk-ecdsa-sha2-nistp256@openssh.com`. |

**Success Response** (`201 Created`):
```json
{
  "id": 42,
  "name": "MacBook Pro M4",
  "fingerprint": "SHA256:uNiReFhu9MAqGFoVkvLlnfazPHEb7bFMXYmSk7IwDcY",
  "key_type": "ssh-ed25519",
  "created_at": "2026-03-15T14:32:00.000Z"
}
```

**Response Field Definitions**:

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | `number` | Unique key identifier | Positive integer, server-assigned |
| `name` | `string` | User-assigned title (trimmed) | 1–255 characters |
| `fingerprint` | `string` | SHA256 fingerprint of the public key | Format: `SHA256:<base64_no_padding>` |
| `key_type` | `string` | SSH algorithm identifier | One of the 7 supported types |
| `created_at` | `string` | ISO 8601 UTC timestamp | Always includes timezone designator `Z` |

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | Malformed JSON body or missing Content-Type header | `{"message": "..."}` |
| `401 Unauthorized` | No valid session or token | `{"message": "authentication required"}` |
| `403 Forbidden` | Read-only token used for a write operation | `{"message": "insufficient scope"}` |
| `409 Conflict` | Key with same fingerprint already registered | `{"message": "ssh key already registered"}` |
| `422 Unprocessable Entity` | Validation failure on `title` or `key` field | `{"message": "validation failed", "errors": [{"resource": "SSHKey", "field": "<field>", "code": "<code>"}]}` |
| `429 Too Many Requests` | Rate limit exceeded | `{"message": "rate limit exceeded"}` |

**Validation Error Codes**:

| Field | Code | Meaning |
|-------|------|---------|
| `title` | `missing_field` | Title is empty or whitespace-only |
| `title` | `invalid` | Title exceeds 255 characters |
| `key` | `missing_field` | Key is empty or whitespace-only |
| `key` | `invalid` | Key is not a valid SSH public key or uses an unsupported algorithm |

### SDK Shape

The `UserService.createSSHKey(userID: number, req: { title: string; key: string })` method in `@codeplane/sdk` returns:

```typescript
Result<
  {
    id: number;
    name: string;
    fingerprint: string;
    key_type: string;
    created_at: string; // ISO 8601
  },
  APIError
>
```

The SDK method:
1. Validates `userID > 0` — returns `badRequest` if invalid.
2. Trims and validates the `title` — returns `validationFailed` for empty or over-255-character titles.
3. Trims and validates the `key` — returns `validationFailed` for empty keys.
4. Parses the SSH public key via `parseSSHPublicKey()` — returns `validationFailed` if parsing fails or key type is unsupported.
5. Checks for an existing key with the same fingerprint — returns `conflict` if found.
6. Inserts the key record with canonical key form, fingerprint, key type, and trimmed title.
7. Returns the created key's metadata (without the raw public key string).
8. Catches unique-constraint violations at the database level as a secondary duplicate guard — returns `conflict`.

### CLI Command

**Command**: `codeplane ssh-key add`

**Options**:

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--title` | `string` | Yes | Human-readable title for the key |
| `--key` | `string` | Yes | SSH public key content (typically piped from a `.pub` file) |

**Typical usage**:
```bash
codeplane ssh-key add --title "MacBook Pro" --key "$(cat ~/.ssh/id_ed25519.pub)"
```

**Human-readable output** (default):
```
✓ SSH key added

ID:           42
Title:        MacBook Pro
Fingerprint:  SHA256:uNiReFhu9MAqGFoVkvLlnfazPHEb7bFMXYmSk7IwDcY
Key Type:     ssh-ed25519
Created:      2026-03-15T14:32:00.000Z
```

**JSON output** (`--json`): Returns the raw API response object.

**Error behavior**:
- Missing `--title` or `--key`: CLI framework rejects before making API call; prints usage help and exits non-zero.
- `401`: Prints authentication error and exits non-zero.
- `403`: Prints insufficient permissions error and exits non-zero.
- `409`: Prints "SSH key already registered" and exits non-zero.
- `422`: Prints validation error details and exits non-zero.
- Network errors: Prints connection error and exits non-zero.

### Web UI Design

**Location**: User Settings → SSH Keys (`/settings/keys`)

The add-key flow is accessible from the SSH keys settings page.

**Entry Point**:
- A prominent "Add SSH Key" button at the top-right of the SSH keys list page.
- In the empty state, a call-to-action button labeled "Add your first SSH key" or similar.

**Add Key Form**:
- **Form layout**: Either a modal dialog or an inline expandable form section at the top of the key list.
- **Title field**: Text input labeled "Title". Placeholder text: `e.g., MacBook Pro, Work Desktop`. Max length enforced client-side at 255 characters with a character counter shown when approaching the limit.
- **Key field**: Multi-line textarea (or tall text input) labeled "Public Key". Placeholder text: `Begins with ssh-ed25519, ssh-rsa, or ecdsa-sha2-...`. Monospace font. Auto-trims whitespace on submission.
- **Submit button**: "Add SSH Key" — disabled until both fields have content. Shows a loading spinner while the request is in flight.
- **Cancel button**: "Cancel" — clears the form and collapses it or closes the modal.

**Validation Feedback**:
- Client-side: Show inline validation errors beneath fields immediately (empty title, empty key, title too long).
- Server-side: On `422`, display the field-level error message beneath the corresponding field. On `409`, display a banner: "This SSH key is already registered to an account."
- On `401`/`403`, redirect to login or show an insufficient-permissions message.

**Success Behavior**:
- On `201`, close the form / modal, show a success toast notification ("SSH key added successfully"), and refresh the key list to show the newly added key at the top.

**Accessibility**:
- All form fields must have associated `<label>` elements.
- Error messages must be linked via `aria-describedby`.
- Focus must move to the first form field when the form opens, and to the success toast or the newly added key row on success.

### TUI UI

**Screen**: Accessible from the settings navigation or via a command-palette action.

**Add Key Flow**:
- Prompt-based form: sequentially prompt for title and key content.
- Title prompt: "Key title:" with inline validation for empty/too-long input.
- Key prompt: "Public key:" — accepts pasted multi-line input (the key is a single long line but terminals may wrap it).
- On success: display the created key's metadata (id, title, fingerprint, key type) and return to the key list.
- On error: display the error message and allow retry.

### Documentation

The user-facing documentation at `docs/guides/ssh-keys.mdx` must include:

1. **"Adding Your SSH Key to Codeplane via CLI"** section covering `codeplane ssh-key add` usage with `--title` and `--key` flags, including the `$(cat ~/.ssh/id_ed25519.pub)` pattern.
2. **"Adding Your SSH Key via API"** section covering the `POST /api/user/keys` curl example, request body shape, `201` response shape, and error status codes (`400`, `401`, `409`, `422`).
3. **"Adding Your SSH Key via Web UI"** section: Step-by-step instructions for navigating to Settings → SSH Keys, clicking "Add SSH Key", filling in the title and key fields, and confirming.
4. **Supported key types table**: clarifying which algorithms are accepted.
5. **Troubleshooting → "Key format not supported"** section: explaining common mistakes (pasting private key, truncated key, unsupported algorithm).
6. **API Reference table entry** for `POST /api/user/keys`.

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| **Authenticated user (write-scope token)** | Can add SSH keys to their own account. |
| **Authenticated user (read-only PAT)** | Denied. Returns `403`. Adding a key is a write operation. |
| **Unauthenticated** | Denied. Returns `401`. |
| **Admin** | Cannot add SSH keys to another user's account via this endpoint. Admin SSH key management is a separate surface. |
| **OAuth2 application** | Permitted if the OAuth2 token has the appropriate write scope for user keys. |

### Rate Limiting

- **Mutation rate limit**: The `POST /api/user/keys` endpoint must be subject to a stricter rate limit than read endpoints, consistent with other user mutation endpoints.
- **Recommended limit**: 10 requests per minute per authenticated user. SSH key addition is an infrequent operation; aggressive limits prevent abuse without impacting legitimate use.
- **Response on limit breach**: `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy & PII

- **Public keys are cryptographic material, not PII**, but they are user-linked. The canonical public key string is stored in the database but is NOT returned in the `POST` response body or the `GET /api/user/keys` list response.
- **Key titles may contain PII** (e.g., "Alice Johnson's MacBook"). The title field must not be logged at INFO level. DEBUG-level logging may include the title when correlated with a `user_id` and `request_id`.
- **Fingerprints are user-linked metadata**. They may appear in logs for debugging SSH authentication issues but should always be correlated with `request_id` and `user_id`.
- **The raw key string must be logged at most at DEBUG level**, and only when diagnosing key-parsing failures. Never log the full key at INFO or above.
- **Private keys are never handled**: this endpoint only accepts public keys. If a user accidentally pastes a private key, the parser will reject it as invalid format before any storage occurs.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ssh_key.added` | User successfully adds an SSH key | `user_id`, `key_id`, `key_type` (algorithm string), `title_length` (integer), `client` (`web`, `cli`, `tui`, `api`), `timestamp` |
| `ssh_key.add_failed` | SSH key add attempt fails for any reason | `user_id` (if authenticated), `failure_reason` (`validation_title`, `validation_key`, `duplicate`, `auth`, `rate_limited`), `client`, `timestamp` |

### Properties Required on All SSH Key Events

- `user_id` (anonymized or pseudonymized in analytics pipeline; null for unauthenticated failures)
- `client` (one of: `web`, `cli`, `tui`, `api`, `vscode`, `nvim`)
- `timestamp` (ISO 8601)
- `request_id` (for correlation with observability)

### Funnel Metrics

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| **SSH key registration rate** | % of new users who add at least 1 SSH key within 7 days of account creation | > 50% for active developers |
| **Add success rate** | `ssh_key.added` / (`ssh_key.added` + `ssh_key.add_failed`) | > 90% (most failures should be duplicate keys, not confused users) |
| **Key type distribution** | Breakdown of `key_type` across all successful adds | Ed25519 should be the dominant type; increasing over time |
| **Time to first SSH key** | Median time from user account creation to first `ssh_key.added` event | Decreasing over time (indicates onboarding friction reduction) |
| **List → Add conversion** | % of users who view the key list and subsequently add a key within the same session | > 15% for users with 0 keys |
| **Add → SSH auth success** | % of users whose first successful SSH authentication occurs within 10 minutes of adding a key | > 80% (indicates the key actually works) |

## Observability

### Logging

| Log Point | Level | Structured Fields | Description |
|-----------|-------|-------------------|-------------|
| Add request received | DEBUG | `user_id`, `request_id`, `title_length`, `key_type_hint` (first token of key string) | Entry point for the add operation |
| Key parsed successfully | DEBUG | `user_id`, `request_id`, `key_type`, `fingerprint` | SSH key passed validation and fingerprint was computed |
| Key parse failure | WARN | `request_id`, `user_id`, `error_message` | Key string could not be parsed or uses unsupported algorithm |
| Duplicate fingerprint detected | INFO | `user_id`, `request_id`, `fingerprint` | User attempted to add a key that is already registered |
| Key created successfully | INFO | `user_id`, `request_id`, `key_id`, `key_type`, `fingerprint`, `duration_ms` | Key stored and returned to client |
| Title validation failure | WARN | `user_id`, `request_id`, `validation_code` (`missing_field` or `invalid`) | Title was empty or exceeded 255 characters |
| Auth failure on add | WARN | `request_id`, `ip`, `auth_method_attempted` | Unauthenticated or insufficient-scope access attempt |
| Database insert failure | ERROR | `user_id`, `request_id`, `error_message`, `stack` | Database error during key creation |
| Rate limit hit on add | WARN | `user_id`, `request_id`, `ip` | User exceeded rate limit for key creation |

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_ssh_key_add_total` | Counter | `status` (`success`, `validation_error`, `duplicate`, `auth_error`, `rate_limited`, `error`) | Total add requests by outcome |
| `codeplane_ssh_key_add_duration_seconds` | Histogram | — | Latency distribution for add requests (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_ssh_key_add_by_type_total` | Counter | `key_type` | Successful key additions broken down by algorithm |
| `codeplane_ssh_keys_total` | Gauge | — | Total number of SSH keys in the system (periodically sampled) |

### Alerts

#### Alert: `SSHKeyAddHighErrorRate`

**Condition**: `rate(codeplane_ssh_key_add_total{status="error"}[5m]) / rate(codeplane_ssh_key_add_total[5m]) > 0.1` for 5 minutes.

**Severity**: Warning.

**Runbook**:
1. Check server error logs for `ssh_key_add` failures: filter for ERROR level with `ssh key` or `createSSHKey` in structured context.
2. Verify database connectivity: run a simple health query against the primary database.
3. Check if the `ssh_keys` table is accessible and writable: attempt a test insert and rollback.
4. Look for unique-constraint violations that are NOT being caught by the pre-check fingerprint lookup (possible race condition under high concurrency).
5. Check for recent deployments that may have introduced a regression in key parsing or the service layer.
6. If the database is healthy, check for resource exhaustion (memory, file descriptors) on the server process.
7. Escalate to the platform team if the database appears degraded.

#### Alert: `SSHKeyAddHighValidationRate`

**Condition**: `rate(codeplane_ssh_key_add_total{status="validation_error"}[15m]) / rate(codeplane_ssh_key_add_total[15m]) > 0.5` for 15 minutes.

**Severity**: Info (product signal, not operational emergency).

**Runbook**:
1. This alert indicates that more than half of add attempts are failing validation. This is likely a UX problem, not an infrastructure problem.
2. Check if a specific client (`web`, `cli`, `api`) is disproportionately responsible.
3. Review recent changes to the web UI add-key form or CLI command for regressions in how the key value is submitted (e.g., double-encoding, truncation, newline insertion).
4. Check documentation for clarity — users may be pasting private keys, partial keys, or keys in a non-OpenSSH format (e.g., PuTTY `.ppk` format).
5. File a product ticket if the pattern persists; consider adding client-side format hinting.

#### Alert: `SSHKeyAddHighDuplicateRate`

**Condition**: `rate(codeplane_ssh_key_add_total{status="duplicate"}[15m]) / rate(codeplane_ssh_key_add_total[15m]) > 0.6` for 15 minutes.

**Severity**: Info.

**Runbook**:
1. A high duplicate rate suggests users are confused about whether their key was already added, or automated tooling is retrying without checking.
2. Check if a single user or IP is responsible (could be a script bug).
3. Review the web UI add-key flow to ensure success feedback is clear and the key list refreshes after add.
4. No operational action needed unless the volume is causing performance impact.

#### Alert: `SSHKeyAddHighLatency`

**Condition**: `histogram_quantile(0.95, rate(codeplane_ssh_key_add_duration_seconds_bucket[5m])) > 3.0` for 5 minutes.

**Severity**: Warning.

**Runbook**:
1. Check database query performance: look for slow query logs related to `ssh_keys` table (the duplicate-check query and the INSERT are the two database calls).
2. Verify that the `ssh_keys` table has an index on `fingerprint`.
3. Check for table bloat or lock contention on the `ssh_keys` table.
4. Check SHA256 computation performance — this should be sub-millisecond, but if the key data is malformed, the `Buffer.from(keyData, "base64")` call could behave unexpectedly.
5. Check server resource utilization (CPU, memory, event-loop lag).
6. If latency is isolated to the database, consider connection pool saturation.

#### Alert: `SSHKeyAddAuthFailureSpike`

**Condition**: `rate(codeplane_ssh_key_add_total{status="auth_error"}[5m]) > 30` for 3 minutes.

**Severity**: Warning.

**Runbook**:
1. Check if this is a broad auth outage affecting all endpoints (not just SSH key add).
2. Look at the `ip` field in WARN logs to determine if the traffic is from a single source (possible credential stuffing or automated attack).
3. If from a single IP, verify rate limiting is functioning and consider temporary IP-level blocking.
4. If broad, check the auth service / session store / token validation path for errors.
5. Verify that the auth middleware is loading correctly on server startup.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | HTTP Status |
|------------|-------------------|-------------|
| No auth token / expired session | Return `401`, log at WARN | 401 |
| Invalid PAT (malformed) | Return `401`, log at WARN | 401 |
| Revoked PAT | Return `401`, log at WARN | 401 |
| Read-only PAT | Return `403`, log at WARN | 403 |
| Missing Content-Type header | Return `400`, log at WARN | 400 |
| Malformed JSON body | Return `400`, log at WARN | 400 |
| Empty body / null body | Return `400`, log at WARN | 400 |
| Title empty or whitespace-only | Return `422` with `missing_field`, log at WARN | 422 |
| Title exceeds 255 characters | Return `422` with `invalid`, log at WARN | 422 |
| Key empty or whitespace-only | Return `422` with `missing_field`, log at WARN | 422 |
| Key is not valid SSH public key format | Return `422` with `invalid`, log at WARN | 422 |
| Key uses unsupported algorithm (e.g., `ssh-dss`) | Return `422` with `invalid`, log at WARN | 422 |
| Key has invalid base64 data | Return `422` with `invalid`, log at WARN | 422 |
| Key only has one whitespace-delimited part | Return `422` with `invalid`, log at WARN | 422 |
| Duplicate fingerprint | Return `409`, log at INFO | 409 |
| Database unreachable | Return `500`, log at ERROR with connection details | 500 |
| Database unique-constraint race | Return `409` (caught by secondary guard), log at INFO | 409 |
| Rate limit exceeded | Return `429` with `Retry-After` header, log at WARN | 429 |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `API-ADD-001` | `POST /api/user/keys` with valid Ed25519 key and title | `201 Created`, body contains `id`, `name`, `fingerprint`, `key_type` = `ssh-ed25519`, `created_at` |
| `API-ADD-002` | `POST /api/user/keys` with valid RSA-4096 key | `201 Created`, `key_type` = `ssh-rsa` |
| `API-ADD-003` | `POST /api/user/keys` with valid ECDSA-P256 key | `201 Created`, `key_type` = `ecdsa-sha2-nistp256` |
| `API-ADD-004` | `POST /api/user/keys` with valid ECDSA-P384 key | `201 Created`, `key_type` = `ecdsa-sha2-nistp384` |
| `API-ADD-005` | `POST /api/user/keys` with valid ECDSA-P521 key | `201 Created`, `key_type` = `ecdsa-sha2-nistp521` |
| `API-ADD-006` | `POST /api/user/keys` with valid `sk-ssh-ed25519@openssh.com` FIDO2 key | `201 Created`, `key_type` = `sk-ssh-ed25519@openssh.com` |
| `API-ADD-007` | `POST /api/user/keys` with valid `sk-ecdsa-sha2-nistp256@openssh.com` FIDO2 key | `201 Created`, `key_type` = `sk-ecdsa-sha2-nistp256@openssh.com` |
| `API-ADD-008` | `POST /api/user/keys` without auth header | `401 Unauthorized` |
| `API-ADD-009` | `POST /api/user/keys` with expired token | `401 Unauthorized` |
| `API-ADD-010` | `POST /api/user/keys` with read-only PAT | `403 Forbidden` or non-`201` error |
| `API-ADD-011` | `POST /api/user/keys` with empty body `{}` | `422`, validation error on `title` field |
| `API-ADD-012` | `POST /api/user/keys` with title but no key `{"title": "foo"}` | `422`, validation error on `key` field |
| `API-ADD-013` | `POST /api/user/keys` with key but no title `{"key": "ssh-ed25519 AAAA..."}` | `422`, validation error on `title` field |
| `API-ADD-014` | `POST /api/user/keys` with empty title `{"title": "", "key": "ssh-ed25519 AAAA..."}` | `422`, validation error on `title` with `missing_field` code |
| `API-ADD-015` | `POST /api/user/keys` with whitespace-only title `{"title": "   ", "key": "ssh-ed25519 AAAA..."}` | `422`, validation error on `title` with `missing_field` code |
| `API-ADD-016` | `POST /api/user/keys` with 255-character title (maximum valid) | `201 Created`, `name` in response is exactly 255 characters |
| `API-ADD-017` | `POST /api/user/keys` with 256-character title (exceeds maximum) | `422`, validation error on `title` with `invalid` code |
| `API-ADD-018` | `POST /api/user/keys` with title containing emoji, unicode, CJK characters | `201 Created`, `name` in response matches input exactly (after trimming) |
| `API-ADD-019` | `POST /api/user/keys` with title containing leading/trailing whitespace | `201 Created`, `name` in response is trimmed |
| `API-ADD-020` | `POST /api/user/keys` with empty key `{"title": "foo", "key": ""}` | `422`, validation error on `key` with `missing_field` code |
| `API-ADD-021` | `POST /api/user/keys` with whitespace-only key | `422`, validation error on `key` with `missing_field` code |
| `API-ADD-022` | `POST /api/user/keys` with invalid key material `{"title": "foo", "key": "not-a-real-key"}` | `422`, validation error on `key` with `invalid` code |
| `API-ADD-023` | `POST /api/user/keys` with unsupported key type `ssh-dss AAAA...` | `422`, validation error on `key` with `invalid` code |
| `API-ADD-024` | `POST /api/user/keys` with key that has only one part (no base64 data) `{"key": "ssh-ed25519"}` | `422`, validation error on `key` with `invalid` code |
| `API-ADD-025` | `POST /api/user/keys` with key containing invalid base64 `{"key": "ssh-ed25519 !!!notbase64!!!"}` | `422`, validation error on `key` |
| `API-ADD-026` | Add the same key twice (same fingerprint) with different titles | First returns `201`, second returns `409 Conflict` |
| `API-ADD-027` | Add the same key twice with the same title | First returns `201`, second returns `409 Conflict` |
| `API-ADD-028` | Add two different keys with the same title | Both return `201` — title uniqueness is not enforced |
| `API-ADD-029` | User A adds a key, User B tries to add the same key | User A gets `201`, User B gets `409` (fingerprint uniqueness is global) |
| `API-ADD-030` | Response `Content-Type` header is `application/json` | Header present and correct |
| `API-ADD-031` | Response `id` field is a positive integer | `typeof id === 'number' && id > 0` |
| `API-ADD-032` | Response `fingerprint` matches `SHA256:<base64_chars>` format | Regex: `^SHA256:[A-Za-z0-9+/]+$` |
| `API-ADD-033` | Response `created_at` is a valid ISO 8601 timestamp with `Z` timezone | `new Date(created_at).toISOString()` does not throw, ends with `Z` |
| `API-ADD-034` | Response does NOT contain `key`, `publicKey`, or `public_key` field | None of those fields present |
| `API-ADD-035` | After adding a key, `GET /api/user/keys` list includes the newly added key as the first element | New key's `id` matches the first element in the list |
| `API-ADD-036` | Key with trailing comment `ssh-ed25519 AAAA... user@example.com` — comment is stripped, canonical form stored | Fingerprint matches `ssh-keygen -lf` of the same key without comment |
| `API-ADD-037` | Key with extra whitespace between parts `ssh-ed25519   AAAA...` is accepted | `201 Created` |
| `API-ADD-038` | Key with leading/trailing whitespace is accepted after trimming | `201 Created` |
| `API-ADD-039` | `POST /api/user/keys` with no `Content-Type` header and form body | `400 Bad Request` |
| `API-ADD-040` | Malformed JSON body (e.g., `{title: "foo"` — invalid JSON) | `400 Bad Request` |
| `API-ADD-041` | Fingerprint in response matches OpenSSH `ssh-keygen -lf` output for the same public key | Fingerprints are identical |
| `API-ADD-042` | After adding a key, the key can be deleted by ID and no longer appears in list | Round-trip add → delete → list verification |

### CLI Integration Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `CLI-ADD-001` | `codeplane ssh-key add --title "Test Key" --key "$(cat key.pub)"` with valid Ed25519 key | Exit code 0, JSON output contains `id`, `name`, `fingerprint`, `key_type`, `created_at` |
| `CLI-ADD-002` | `codeplane ssh-key add --title "Test Key" --key "same-key"` duplicate key | Exit code ≠ 0, stderr/output indicates conflict |
| `CLI-ADD-003` | `codeplane ssh-key add --title "Test Key" --key "not-a-real-ssh-key"` invalid key | Exit code ≠ 0, stderr/output indicates validation failure |
| `CLI-ADD-004` | `codeplane ssh-key add` without `--title` or `--key` flags | Exit code ≠ 0, usage help or missing-option error |
| `CLI-ADD-005` | `codeplane ssh-key add --title "" --key "$(cat key.pub)"` empty title | Exit code ≠ 0 |
| `CLI-ADD-006` | `codeplane ssh-key add` without auth token (no `CODEPLANE_TOKEN`) | Exit code ≠ 0, auth error |
| `CLI-ADD-007` | `codeplane ssh-key add` with read-only token | Exit code ≠ 0, permission error |
| `CLI-ADD-008` | Round-trip: `ssh-key add` → `ssh-key list --json` → verify new key present → `ssh-key delete` → `ssh-key list --json` → verify absent | Full lifecycle works end to end |
| `CLI-ADD-009` | `codeplane ssh-key add` with maximum valid title (255 chars) | Exit code 0, `name` in response is 255 characters |
| `CLI-ADD-010` | `codeplane ssh-key add` with title exceeding maximum (256 chars) | Exit code ≠ 0, validation error |
| `CLI-ADD-011` | `codeplane ssh-key add --json` output is parseable JSON | JSON.parse succeeds on stdout |

### Playwright (Web UI) E2E Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `UI-ADD-001` | Navigate to `/settings/keys`, click "Add SSH Key" button — form/modal opens | Add-key form is visible with title and key fields |
| `UI-ADD-002` | Fill in valid title and Ed25519 key, submit — key appears in list | Success toast shown, key list refreshes with new key at top |
| `UI-ADD-003` | Submit form with empty title — inline validation error | Error message appears beneath the title field |
| `UI-ADD-004` | Submit form with empty key — inline validation error | Error message appears beneath the key field |
| `UI-ADD-005` | Submit form with invalid key material — server validation error displayed | Error message shown indicating invalid key format |
| `UI-ADD-006` | Submit form with duplicate key — conflict error displayed | Error banner: "This SSH key is already registered" or similar |
| `UI-ADD-007` | Title field enforces 255-character limit client-side | Character counter shown; typing beyond 255 is prevented or flagged |
| `UI-ADD-008` | Cancel button clears the form and closes it | Form fields are cleared, form/modal is dismissed |
| `UI-ADD-009` | Submit button is disabled when both fields are empty | Button is visually disabled and not clickable |
| `UI-ADD-010` | Loading spinner appears on the submit button while request is in flight | Spinner/loading indicator is visible during submission |
| `UI-ADD-011` | Navigate to `/settings/keys` without auth — redirected to login | URL becomes `/login` or login page is shown |
| `UI-ADD-012` | After successful add, the key list shows the correct title, fingerprint, key type | New key row contains the expected values |
| `UI-ADD-013` | Form accessibility: all fields have labels, errors linked via aria-describedby | Accessibility audit passes |

### Cross-Cutting Validation Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `CROSS-ADD-001` | Add key via CLI, verify it appears in API list response | API `GET /api/user/keys` includes the CLI-added key |
| `CROSS-ADD-002` | Add key via API, verify it appears in CLI `ssh-key list --json` output | CLI output includes the API-added key |
| `CROSS-ADD-003` | Add key via CLI, attempt to add same key via API — returns `409` | Duplicate detection works cross-client |
| `CROSS-ADD-004` | Add key via API, attempt to add same key via CLI — exits non-zero | Duplicate detection works cross-client |
| `CROSS-ADD-005` | Add 20 keys sequentially (different keys), list all — all 20 present in correct order | List returns all 20, newest first |
| `CROSS-ADD-006` | Concurrent add of 5 different keys (parallel API calls) — all succeed with unique IDs | All 5 return `201`, all IDs are distinct |
| `CROSS-ADD-007` | Concurrent add of the same key from 2 parallel requests — exactly one succeeds, one returns `409` | One `201` and one `409` |
| `CROSS-ADD-008` | Add key, then verify SSH authentication works with that key against the SSH server | `ssh -T ssh.codeplane.app` returns success greeting (if SSH server is available in test environment) |
| `CROSS-ADD-009` | Add key with 255-character title via API, list via CLI — title is fully preserved | CLI JSON output shows exact 255-char title |
| `CROSS-ADD-010` | Add key with emoji title `"🔑 My Key 🔐"` via API, list via API — title preserved exactly | `name` field matches input |
