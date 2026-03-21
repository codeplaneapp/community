# USER_SSH_KEYS_UI

Specification for USER_SSH_KEYS_UI.

## High-Level User POV

When you use Codeplane to host and collaborate on repositories, SSH keys are how your machines prove who you are. The SSH Keys settings page is your personal credential management hub — a single place where you see every SSH public key registered to your account, add new keys for new machines, and remove keys you no longer need.

You reach the SSH Keys page from your account settings sidebar, under "SSH Keys" at the path `/settings/keys`. The page opens to a clean, scannable list of every key you've registered. Each entry shows the human-readable title you chose when you added it (like "Work Laptop" or "Home Desktop"), a badge indicating the key's algorithm (Ed25519, RSA, ECDSA), the SHA256 fingerprint in monospace text that matches what your local `ssh-add -l` shows, and a relative timestamp for when you added it. The most recently added key always appears at the top. If you hover over the date, you see the exact UTC timestamp.

When you need to set up a new machine, you click "Add SSH Key" and fill out two fields: a title so you can recognize the key later, and the public key content from your `.pub` file. Codeplane validates the key instantly, computes its fingerprint, and adds it to your list. If you accidentally paste the same key again — even with a different title — Codeplane tells you it's already registered instead of creating a duplicate. If you paste something invalid, you get a clear error explaining what's wrong.

When a machine is decommissioned, lost, or you're rotating credentials, you click the delete button next to the key. A confirmation dialog tells you exactly what will happen: any machine using that key will immediately lose SSH access to Codeplane. After you confirm, the key disappears from the list and is permanently removed. There is no undo, but you can always re-add the public key material if you deleted it by mistake.

The SSH Keys page is personal and private — only you can see your registered keys, and you can only manage your own. Whether you add a key from the web UI, the CLI (`codeplane ssh-key add`), or the API directly, the list stays consistent. Add a key from the command line and it appears in the web UI immediately. Delete one from the web and the CLI reflects it instantly.

This page is distinct from deploy keys (which are repository-scoped) and from API tokens (which authenticate HTTP calls). SSH keys authenticate you personally for all git-over-SSH operations and workspace SSH access across every repository you have permission to use.

## Acceptance Criteria

### Definition of Done

The feature is complete when:

1. An authenticated user can view, add, and delete SSH keys from the web UI settings page at `/settings/keys` with full inline validation, confirmation flows, loading states, error handling, empty states, and success feedback.
2. The same operations work consistently via CLI (`codeplane ssh-key list`, `codeplane ssh-key add`, `codeplane ssh-key delete`) and API (`GET/POST/DELETE /api/user/keys`).
3. The TUI includes a settings-accessible SSH key management screen with list, add, and delete flows.
4. All acceptance criteria pass in automated E2E tests (API, CLI, Playwright, and cross-client).
5. SSH authentication works immediately after key addition and fails immediately after key deletion.
6. Documentation accurately describes all workflows, CLI usage, API shapes, and troubleshooting steps.

### Functional Constraints — List

- `GET /api/user/keys` returns a JSON array of all SSH keys owned by the authenticated user.
- Each key object includes exactly: `id` (integer), `name` (string), `fingerprint` (string), `key_type` (string), `created_at` (ISO 8601 string).
- The response does **not** include raw `public_key` material.
- Keys are ordered by `created_at` descending (newest first).
- An empty key set returns `200 OK` with body `[]`, not `null` or an error.
- Read-only PATs are sufficient for this read endpoint.
- The endpoint returns only the authenticated user's keys — no cross-user leakage.

### Functional Constraints — Add

- `POST /api/user/keys` requires authentication with write scope.
- `title` field is required, 1–255 characters after trimming, any Unicode allowed.
- `key` field is required, must be a valid OpenSSH public key with a supported algorithm.
- Supported key types: `ssh-rsa`, `ssh-ed25519`, `ecdsa-sha2-nistp256`, `ecdsa-sha2-nistp384`, `ecdsa-sha2-nistp521`, `sk-ssh-ed25519@openssh.com`, `sk-ecdsa-sha2-nistp256@openssh.com`.
- Trailing comments on the key string are stripped before storage; only canonical form (`<algorithm> <base64-data>`) is persisted.
- SHA256 fingerprint is computed in `SHA256:<base64_no_trailing_padding>` format.
- Duplicate fingerprint (global, across all users) returns `409 Conflict`.
- Duplicate titles are allowed.
- Success returns `201 Created` with `id`, `name`, `fingerprint`, `key_type`, `created_at`. No raw key in response.
- The key is usable for SSH authentication immediately after creation.

### Functional Constraints — Delete

- `DELETE /api/user/keys/:id` requires authentication with write scope.
- Key ID must be a positive integer (1 to 2^53 - 1). Non-numeric, zero, negative, float, `NaN`, `Infinity`, and values exceeding `MAX_SAFE_INTEGER` return `400 Bad Request`.
- Attempting to delete another user's key returns `404 Not Found` (not `403`) to avoid leaking key existence.
- Successful deletion returns `204 No Content` with empty body.
- Idempotent safety: deleting an already-deleted key returns `404` (not a server error).
- No cascading deletes — only the key credential itself is removed.
- Interactive clients (web, TUI) must require explicit confirmation before executing the delete.
- CLI supports `--yes` to skip confirmation.
- Defense-in-depth: database deletion query filters on both `id` AND `user_id`.

### Edge Cases

- A user with zero keys sees an empty state with a call-to-action to add their first key.
- A user with 100+ keys receives all keys in a single response (no pagination required).
- Key names with special characters (Unicode, emoji, HTML entities, quotation marks) are returned verbatim in JSON encoding.
- Concurrent requests to the same endpoint return consistent snapshots.
- Pasting a private key is rejected as invalid format before any storage occurs.
- Keys with extra whitespace between parts or leading/trailing whitespace are accepted after trimming.
- Adding a key, deleting it, then re-adding the same key material succeeds (fingerprint uniqueness is cleared on delete).
- Two parallel `DELETE` requests for the same key: one returns `204`, one returns `404`, no server errors.

### Boundary Constraints

- Key `name` length: 1–255 characters (enforced at creation; displayed as-is in list).
- `fingerprint` string length: `SHA256:` prefix + 43 characters of base64 (no trailing `=`), totaling exactly 50 characters.
- `key_type` valid values: exactly the 7 supported algorithms listed above.
- `created_at`: always a valid ISO 8601 UTC timestamp ending with `Z`.
- Key ID path parameter: positive integer, 1 to `Number.MAX_SAFE_INTEGER` (2^53 - 1). Leading zeros are parsed (e.g., `007` → `7`).
- Title field: character counter shown in web UI when approaching limit; client-side enforcement at 255.

## Design

### Web UI Design

**Location:** User Settings → SSH Keys (`/settings/keys`)

**Settings Sidebar Navigation:**
The SSH Keys item appears in the user settings sidebar with a key icon, routing to `/settings/keys`. The active item has a 4px left-border accent in the primary color, bold text, and a subtle background highlight.

**Settings Home Summary Card:**
On the settings home page (`/settings`), a summary card for SSH Keys shows:
- Title: "SSH Keys"
- Primary metric: "{count} SSH key(s)" or "No SSH keys"
- Secondary: "Last added: {relative_date}" (only if count > 0)
- Empty CTA: "Add your first SSH key to push code securely"
- Link: "Manage SSH keys →" navigating to `/settings/keys`

**Page Header:**
- Heading: "SSH Keys"
- Subtitle: "SSH keys are used to authenticate git operations over SSH."
- "Add SSH Key" button prominently placed at the top-right of the section header.

**Key List:**
Each registered key renders as a card/row containing:
- **Title** (bold, primary text): the key's `name` field.
- **Key type badge**: small pill badge showing the human-friendly algorithm name (e.g., "Ed25519", "RSA", "ECDSA P-256", "ECDSA P-384", "ECDSA P-521", "FIDO2 Ed25519", "FIDO2 ECDSA").
- **Fingerprint**: full `SHA256:...` string in monospace font. Text is selectable and copyable for cross-referencing with local `ssh-add -l` output.
- **Added date**: relative time (e.g., "Added 3 days ago") with exact UTC timestamp shown in a tooltip on hover.
- **Delete button**: right-aligned, styled as a destructive action (red text or trash icon) with `aria-label="Delete SSH key <key title>"`.

**Empty State:**
When no keys are registered, show a centered illustration or key icon with:
- Message: "No SSH keys yet. Add an SSH key to authenticate git operations over SSH."
- Call-to-action button: "Add SSH Key"
- Link to the SSH keys documentation guide.

**Loading State:**
A skeleton loader matching the card/row layout while the API call is in flight.

**Error State:**
If the API call fails, show an inline error banner: "Failed to load SSH keys. Please try again." with a retry button. Clicking retry re-fetches the key list.

**Add Key Form:**
- **Form layout**: modal dialog or inline expandable form section at the top of the key list.
- **Title field**: text input labeled "Title", placeholder `e.g., MacBook Pro, Work Desktop`. Max length enforced client-side at 255 characters with a character counter shown when approaching the limit (e.g., "247/255").
- **Key field**: multi-line textarea labeled "Public Key", placeholder `Begins with ssh-ed25519, ssh-rsa, or ecdsa-sha2-...`. Monospace font. Auto-trims whitespace on submission.
- **Submit button**: "Add SSH Key" — disabled until both fields have content. Shows a loading spinner while the request is in flight. Both buttons disabled during submission.
- **Cancel button**: "Cancel" — clears the form and closes the modal or collapses the inline section.

**Add Validation Feedback:**
- Client-side: inline errors beneath fields immediately (empty title, empty key, title too long).
- Server-side `422`: field-level error message beneath the corresponding field.
- Server-side `409`: banner "This SSH key is already registered to an account."
- `401`/`403`: redirect to login or show insufficient-permissions message.

**Add Success Behavior:**
On `201`, close the form/modal, show a success toast notification ("SSH key added successfully"), and refresh the key list to show the newly added key at the top.

**Delete Confirmation Dialog:**
- Modal with title "Delete SSH Key".
- Body: `Are you sure you want to delete "<key title>"? Any machine using this key will no longer be able to connect to Codeplane over SSH.`
- Key fingerprint shown in monospace below the warning.
- Buttons: "Cancel" (default focus, secondary styling) and "Delete" (destructive, red).
- Escape or click-outside cancels.
- Loading spinner on Delete button during API call; both buttons disabled during request.

**After Successful Deletion:**
Dialog closes, key row removed with a fade-out animation, toast notification: `SSH key "<key title>" deleted.` If it was the last key, transition to empty state.

**Delete Error Handling:**
On API failure (5xx), dialog stays open with inline error: "Failed to delete key. Please try again." Delete button re-enables. On `404` (already deleted by another client/tab), close dialog, remove row, toast: "Key was already deleted."

**Accessibility:**
- All form fields must have associated `<label>` elements.
- Error messages must be linked via `aria-describedby`.
- Focus must move to the first form field when the form opens, and to the success toast or the newly added key row on success.
- Delete button has `aria-label` containing the key title.

**Interactions:**
- The list refreshes automatically after a key is added or deleted (no manual page reload required).
- Navigating to `/settings/keys` without authentication redirects to the login page.

### API Shape

**List Keys:** `GET /api/user/keys`
- Auth: Required (session cookie or PAT, read-only PATs permitted)
- Request: No query parameters, no body
- Success (200): JSON array of `{id, name, fingerprint, key_type, created_at}` objects
- Error (401): `{"message": "authentication required"}`

**Add Key:** `POST /api/user/keys`
- Auth: Required (write scope)
- Headers: `Content-Type: application/json`
- Request body: `{"title": "string", "key": "string"}`
- Success (201): `{id, name, fingerprint, key_type, created_at}`
- Errors: 400 (malformed JSON), 401 (no auth), 403 (read-only token), 409 (duplicate fingerprint), 422 (validation errors with `{message, errors: [{resource, field, code}]}`)

**Delete Key:** `DELETE /api/user/keys/:id`
- Auth: Required (write scope)
- Path params: `id` (positive integer)
- Request body: None (ignored if sent)
- Success (204): Empty body
- Errors: 400 (invalid ID), 401 (no auth), 403 (read-only token), 404 (not found or wrong user), 429 (rate limited)

### SDK Shape

```typescript
// UserService methods in @codeplane/sdk

listSSHKeys(userID: number): Result<SSHKeySummary[], APIError>
createSSHKey(userID: number, req: { title: string; key: string }): Result<SSHKeySummary, APIError>
deleteSSHKey(userID: number, keyID: number): Result<void, APIError>

type SSHKeySummary = {
  id: number;
  name: string;
  fingerprint: string;
  key_type: string;
  created_at: string; // ISO 8601
};
```

### CLI Commands

**`codeplane ssh-key list`**
- No options
- Output: JSON array of key objects
- Exit code 0 on success; non-zero on auth or network failure

**`codeplane ssh-key add --title <title> --key <key>`**
- Both flags required
- Typical usage: `codeplane ssh-key add --title "MacBook Pro" --key "$(cat ~/.ssh/id_ed25519.pub)"`
- Human-readable output shows ID, title, fingerprint, key type, created timestamp
- JSON output (`--json`) returns raw API response
- Exit code 0 on success; non-zero with descriptive error on any failure

**`codeplane ssh-key delete <id> [--yes]`**
- Positional `id` required (positive integer)
- Without `--yes`: prompts for confirmation
- On success: `SSH key <id> deleted.` (or JSON `{"status":"deleted","id":<id>}`)
- Exit code 0 on success; non-zero on not-found, auth, or invalid ID

### TUI UI

**Settings Screen:**
SSH Keys appears in the TUI settings navigation, accessible from the dashboard or command palette.

**Key List Screen:**
- Displays keys in a scrollable list with title, key type, fingerprint, and date.
- `a` or `Enter` on "Add Key" to open the add flow.
- `d` or `Delete` on a highlighted key to initiate deletion.

**Add Flow:**
Sequential prompts: "Key title:" then "Public key:" — validates inline, shows created key metadata on success, error message on failure with retry option.

**Delete Flow:**
Confirmation bar at bottom: `Delete SSH key "<title>"? [y/N]`. On `y`: API call, key removed, status message. On `n`: dismissed. On error: error message replaces confirmation bar.

### Documentation

The user-facing documentation at `docs/guides/ssh-keys.mdx` must include:

1. **"Why SSH Keys"**: No passwords, strong cryptography, works everywhere, supports multiple keys.
2. **"Supported Key Types"**: Table of supported algorithms with Ed25519 recommended.
3. **"Generating SSH Keys"**: Step-by-step for macOS/Linux, Windows (PowerShell/WSL), RSA fallback.
4. **"Adding Your SSH Key"**: Via CLI, API, and web UI with examples for each.
5. **"Listing Your SSH Keys"**: Via CLI and API with example output.
6. **"Deleting an SSH Key"**: Via CLI (with and without `--yes`), API, and web UI. Warning about immediate effect.
7. **"Testing Your SSH Connection"**: `ssh -T ssh.codeplane.app` with expected success greeting.
8. **"Using SSH with jj"**: Clone, push, and default protocol configuration.
9. **"Multiple SSH Keys"**: SSH config for multiple accounts with `IdentitiesOnly yes`.
10. **"Troubleshooting"**: Permission denied, wrong key, SSH agent issues, unsupported format, connection timeout.
11. **"SSH Keys vs Other Methods"**: Comparison table (SSH keys, deploy keys, API tokens).
12. **API Reference**: Summary table of all three endpoints.

## Permissions & Security

### Authorization Roles

| Role | List Keys | Add Key | Delete Key |
|------|-----------|---------|------------|
| Authenticated user (full-scope PAT or session) | ✅ Own keys only | ✅ Own account only | ✅ Own keys only |
| Authenticated user (read-only PAT) | ✅ Read is permitted | ❌ 403 Forbidden | ❌ 403 Forbidden |
| Unauthenticated | ❌ 401 Unauthorized | ❌ 401 Unauthorized | ❌ 401 Unauthorized |
| Other users | ❌ Cannot see another user's keys | ❌ Cannot add to another user | ❌ Returns 404 (not 403) |
| Admin | Cannot access another user's keys via this endpoint | Cannot add to another user via this endpoint | Cannot delete another user's keys via this endpoint |
| OAuth2 application | ✅ If token has user-keys read scope | ✅ If token has user-keys write scope | ✅ If token has user-keys write scope |

### Rate Limiting

| Endpoint | Limit | Rationale |
|----------|-------|----------|
| `GET /api/user/keys` | Global per-user rate limit (~60 req/min) | Low-cost read, small payload |
| `POST /api/user/keys` | 10 requests/min per user | Infrequent operation; prevents key-spray abuse |
| `DELETE /api/user/keys/:id` | 30 requests/min per user | Lower than reads due to destructive nature; prevents automated mass-deletion |

All rate-limited responses return `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy & PII

- **Public key material** is stored but never returned in API responses (list or add success). Only fingerprint and key type are exposed.
- **Key titles** may contain PII (e.g., machine names, personal names). Titles are only visible to the key owner and must not be logged at INFO level.
- **Fingerprints** are derived data (SHA256 of public key bytes), not PII, but are scoped to the authenticated user only.
- **SSH key data** (fingerprints, names, public keys) must never appear in server logs at INFO level. Structured log context may include `user_id` and `key_count` but never individual fingerprints or names.
- **Hard delete**: SSH keys are hard-deleted from the database; no residual material is retained.
- **Private keys** are never handled. If a user accidentally pastes a private key, the parser rejects it before storage.

### Security Considerations

- CSRF protection on web UI mutation flows.
- Timing-attack resistance: response for "key belongs to another user" is indistinguishable from "key does not exist" (both `404` with identical message).
- Defense-in-depth SQL DELETE uses both `id` AND `user_id` in WHERE clause.
- Comment stripping ensures no user email or identifying information from the key comment is persisted.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ssh_keys_listed` | User retrieves their SSH key list | `user_id`, `key_count`, `client` (`web`/`cli`/`tui`/`api`/`vscode`/`nvim`), `timestamp` |
| `ssh_key.added` | User successfully adds an SSH key | `user_id`, `key_id`, `key_type`, `title_length`, `client`, `timestamp` |
| `ssh_key.add_failed` | Add attempt fails | `user_id` (if authenticated), `failure_reason` (`validation_title`/`validation_key`/`duplicate`/`auth`/`rate_limited`), `client`, `timestamp` |
| `ssh_key.deleted` | User successfully deletes an SSH key | `user_id`, `key_id`, `key_type`, `key_age_days`, `remaining_key_count`, `client`, `timestamp` |
| `ssh_key.delete_failed` | Delete attempt fails | `user_id` (if authenticated), `key_id`, `error_reason` (`not_found`/`auth_error`/`rate_limited`/`invalid_id`/`server_error`), `client`, `timestamp` |
| `ssh_key.delete_confirmed` | User confirms deletion in dialog (web/TUI) | `user_id`, `key_id`, `client`, `timestamp`, `time_to_confirm_ms` |
| `ssh_key.delete_cancelled` | User cancels deletion in dialog | `user_id`, `key_id`, `client`, `timestamp` |

### Properties Required on All Events

- `user_id` (anonymized/pseudonymized in analytics pipeline; null for unauthenticated failures)
- `client` (one of: `web`, `cli`, `tui`, `api`, `vscode`, `nvim`)
- `timestamp` (ISO 8601)
- `request_id` (for correlation with observability)

### Funnel Metrics & Success Indicators

| Metric | Definition | Target |
|--------|-----------|--------|
| SSH key adoption rate | % of active users with ≥1 SSH key | > 50% for active developers |
| Add success rate | `ssh_key.added` / total add attempts | > 90% |
| Time to first SSH key | Median time from account creation to first `ssh_key.added` | Decreasing over time |
| Add → SSH auth success | % of users whose first SSH auth succeeds within 10 min of adding key | > 80% |
| Key type distribution | Breakdown of `key_type` across adds | Ed25519 dominant, increasing |
| Delete completion rate | % of delete initiations → successful deletion | > 80% |
| List-to-action conversion | % of list views → add or delete within session | Increasing |
| Zero-key-after-delete rate | % of deletions leaving user with 0 keys | Should be low |
| Re-add rate | % of users adding a key within 1 hour of deletion | Indicates rotation (healthy) |
| Key list load time p95 | 95th percentile response time for list endpoint | < 200ms |
| List/Add/Delete error rate | 5xx responses / total requests | < 0.1% |

## Observability

### Logging

| Log Point | Level | Structured Fields | Condition |
|-----------|-------|-------------------|----------|
| SSH key list requested | DEBUG | `user_id`, `request_id` | Every list request |
| SSH key list returned | INFO | `user_id`, `key_count`, `request_id` | Successful list response |
| SSH key list auth failure | WARN | `request_id`, `ip`, `path` | 401 response |
| SSH key list internal error | ERROR | `user_id`, `request_id`, `error_message`, `stack_trace` | 500 response |
| Add request received | DEBUG | `user_id`, `request_id`, `title_length`, `key_type_hint` | Every add request |
| Key parsed successfully | DEBUG | `user_id`, `request_id`, `key_type`, `fingerprint` | Key validated |
| Key parse failure | WARN | `request_id`, `user_id`, `error_message` | Invalid key format |
| Duplicate fingerprint detected | INFO | `user_id`, `request_id`, `fingerprint` | 409 conflict |
| Key created successfully | INFO | `user_id`, `request_id`, `key_id`, `key_type`, `fingerprint`, `duration_ms` | 201 success |
| Title validation failure | WARN | `user_id`, `request_id`, `validation_code` | Empty or too long |
| Add auth failure | WARN | `request_id`, `ip`, `auth_method_attempted` | 401/403 |
| Database insert failure | ERROR | `user_id`, `request_id`, `error_message`, `stack` | 500 |
| Delete request received | DEBUG | `user_id`, `request_id`, `key_id` | Every delete request |
| Key ownership verified | DEBUG | `user_id`, `request_id`, `key_id`, `key_fingerprint` | Key belongs to user |
| Key deleted successfully | INFO | `user_id`, `request_id`, `key_id`, `duration_ms` | 204 success |
| Delete — key not found | INFO | `user_id`, `request_id`, `key_id` | 404 |
| Delete — invalid key ID | WARN | `request_id`, `raw_id`, `ip` | 400 |
| Delete — auth failure | WARN | `request_id`, `ip`, `auth_method_attempted` | 401/403 |
| Delete — write scope missing | WARN | `user_id`, `request_id`, `ip` | Read-only token |
| Delete — service error | ERROR | `user_id`, `request_id`, `key_id`, `error_message`, `stack` | 500 |
| Delete — ownership mismatch | WARN | `request_id`, `key_id`, `requesting_user_id` | Cross-user attempt |
| Rate limit hit | WARN | `user_id`, `request_id`, `ip`, `endpoint` | 429 on any endpoint |

**Rules:**
- Never log `fingerprint`, `name`, or `public_key` values at INFO or above.
- Always include `request_id` for correlation.
- `key_count` is safe to log as it reveals no key details.
- DEBUG-level logs may include fingerprint and title for diagnostic purposes only.

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_ssh_key_list_requests_total` | Counter | `status` (200, 401, 500) | Total list requests |
| `codeplane_ssh_key_list_duration_seconds` | Histogram | — | List request latency |
| `codeplane_ssh_keys_per_user` | Histogram | — | Distribution of keys per user (sampled on list) |
| `codeplane_ssh_key_add_total` | Counter | `status` (success, validation_error, duplicate, auth_error, rate_limited, error) | Total add requests by outcome |
| `codeplane_ssh_key_add_duration_seconds` | Histogram | — | Add request latency |
| `codeplane_ssh_key_add_by_type_total` | Counter | `key_type` | Successful adds by algorithm |
| `codeplane_ssh_key_delete_total` | Counter | `status` (success, not_found, auth_error, invalid_id, rate_limited, error) | Total delete requests by outcome |
| `codeplane_ssh_key_delete_duration_seconds` | Histogram | — | Delete request latency |
| `codeplane_ssh_key_delete_confirmation_total` | Counter | `result` (confirmed, cancelled) | Confirmation dialog outcomes (client-side) |
| `codeplane_ssh_keys_total` | Gauge | — | Total SSH keys in the system |

### Alerts

#### Alert: `SSHKeyListErrorRateHigh`
**Condition:** `rate(codeplane_ssh_key_list_requests_total{status="500"}[5m]) / rate(codeplane_ssh_key_list_requests_total[5m]) > 0.05`
**Severity:** Warning
**Runbook:**
1. Check server logs filtered by `path=/api/user/keys` and `status=500` for the alerting time window.
2. Look for database connection errors or query timeouts in the structured log `error_message` field.
3. Verify database health: check connection pool saturation, replication lag, and query latency dashboards.
4. If the database is healthy, check for recent deployments that may have introduced a regression in the `listSSHKeys` service method or the `listUserSSHKeys` SQL query.
5. If the issue is database load, consider temporarily increasing connection pool size or adding a read replica.
6. Escalate to the platform team if the root cause is infrastructure-level.

#### Alert: `SSHKeyListLatencyHigh`
**Condition:** `histogram_quantile(0.95, rate(codeplane_ssh_key_list_duration_seconds_bucket[5m])) > 2`
**Severity:** Warning
**Runbook:**
1. Check if the issue is isolated to the SSH key list endpoint or affecting all user routes.
2. Inspect database query performance: run `EXPLAIN ANALYZE` on the `ListUserSSHKeys` query for a sample user ID.
3. Verify that the `ssh_keys.user_id` index exists and is being used.
4. Check for lock contention on the `ssh_keys` table.
5. If latency is widespread, check Bun runtime metrics for event loop lag or memory pressure.
6. Consider adding a response cache if this endpoint is being called at unexpectedly high frequency.

#### Alert: `SSHKeyList401Spike`
**Condition:** `rate(codeplane_ssh_key_list_requests_total{status="401"}[5m]) > 50`
**Severity:** Info
**Runbook:**
1. Check if the spike correlates with a known deployment or client release.
2. Review request source IPs for automated scanning patterns.
3. If single IP, verify rate limiting is functioning.
4. If legitimate traffic, check session/token expiration settings.
5. Escalate if rate exceeds 500/min.

#### Alert: `SSHKeyAddHighErrorRate`
**Condition:** `rate(codeplane_ssh_key_add_total{status="error"}[5m]) / rate(codeplane_ssh_key_add_total[5m]) > 0.1` for 5 minutes.
**Severity:** Warning
**Runbook:**
1. Check server error logs for `ssh_key_add` failures.
2. Verify database connectivity.
3. Check if the `ssh_keys` table is accessible and writable.
4. Look for unique-constraint race conditions under high concurrency.
5. Check for recent deployment regressions.
6. Check for resource exhaustion (memory, file descriptors).
7. Escalate to platform team if database appears degraded.

#### Alert: `SSHKeyAddHighValidationRate`
**Condition:** `rate(codeplane_ssh_key_add_total{status="validation_error"}[15m]) / rate(codeplane_ssh_key_add_total[15m]) > 0.5` for 15 minutes.
**Severity:** Info
**Runbook:**
1. More than half of add attempts failing validation — likely UX problem.
2. Check which client is disproportionately responsible.
3. Review recent UI/CLI changes for regression in key submission.
4. Check documentation clarity (private keys, partial keys, PuTTY format).
5. File product ticket if pattern persists.

#### Alert: `SSHKeyAddHighDuplicateRate`
**Condition:** `rate(codeplane_ssh_key_add_total{status="duplicate"}[15m]) / rate(codeplane_ssh_key_add_total[15m]) > 0.6` for 15 minutes.
**Severity:** Info
**Runbook:**
1. Users may be confused about whether key was added, or automation is retrying.
2. Check if single user/IP is responsible.
3. Review success feedback clarity in add flow.
4. No operational action unless causing performance impact.

#### Alert: `SSHKeyAddHighLatency`
**Condition:** `histogram_quantile(0.95, rate(codeplane_ssh_key_add_duration_seconds_bucket[5m])) > 3.0` for 5 minutes.
**Severity:** Warning
**Runbook:**
1. Check database query performance for `ssh_keys` table.
2. Verify fingerprint index exists.
3. Check for table bloat or lock contention.
4. Check SHA256 computation performance.
5. Check server resource utilization.
6. Consider connection pool saturation.

#### Alert: `SSHKeyAddAuthFailureSpike`
**Condition:** `rate(codeplane_ssh_key_add_total{status="auth_error"}[5m]) > 30` for 3 minutes.
**Severity:** Warning
**Runbook:**
1. Check if broad auth outage affecting all endpoints.
2. Look at `ip` field for single-source traffic.
3. If single IP, verify rate limiting and consider blocking.
4. If broad, check auth service/session store.
5. Verify auth middleware loads correctly on startup.

#### Alert: `SSHKeyDeleteHighErrorRate`
**Condition:** `rate(codeplane_ssh_key_delete_total{status="error"}[5m]) / rate(codeplane_ssh_key_delete_total[5m]) > 0.1` for 5 minutes.
**Severity:** Warning
**Runbook:**
1. Check server error logs for delete failures.
2. Verify database connectivity.
3. Check ssh_keys table accessibility.
4. Look for database lock contention.
5. Check recent deployments or migrations.
6. Check service layer for unhandled rejections.
7. Escalate to platform team if DB degraded.

#### Alert: `SSHKeyDeleteLatencyHigh`
**Condition:** `histogram_quantile(0.95, rate(codeplane_ssh_key_delete_duration_seconds_bucket[5m])) > 3.0` for 5 minutes.
**Severity:** Warning
**Runbook:**
1. Check DB query performance for ssh_keys.
2. Verify indices on `id` and `user_id`.
3. Check connection pool utilization.
4. Check server resources.
5. Verify `getSSHKeyByID` is not table-scanning.
6. Investigate automated script users.
7. Consider query-level timeouts.

#### Alert: `SSHKeyDeleteOwnershipMismatchSpike`
**Condition:** `rate(codeplane_ssh_key_delete_total{status="not_found"}[5m]) > 20` for 3 minutes with correlated ownership mismatch WARN logs.
**Severity:** Critical
**Runbook:**
1. May indicate cross-user key deletion attack or client bug.
2. Check WARN logs for `requesting_user_id` and `ip`.
3. If single IP, consider temporary rate-limit escalation or IP blocking.
4. If multiple users, check client releases for regressions.
5. Confirm defense-in-depth SQL WHERE clause is intact.

#### Alert: `SSHKeyMassDeleteBurst`
**Condition:** `increase(codeplane_ssh_key_delete_total{status="success"}[1m]) > 20`
**Severity:** Warning
**Runbook:**
1. May indicate compromised account or unintentional automation.
2. Correlate `user_id` from INFO logs.
3. Check if user also created keys recently (rotation vs. unexpected).
4. Contact user out-of-band if suspicious.
5. Consider temporary account lock via admin.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Cause | Resolution |
|------------|-------------|-------|------------|
| No auth / expired session | 401 | Missing or invalid credentials | User re-authenticates |
| Invalid PAT (malformed/revoked) | 401 | Bad token | User generates new token |
| Read-only PAT on write operation | 403 | Insufficient scope | User uses full-scope token |
| Missing Content-Type on POST | 400 | No `application/json` header | Client sends correct header |
| Malformed JSON body | 400 | Invalid JSON syntax | Client fixes request body |
| Empty/whitespace title | 422 | Validation failure | User provides valid title |
| Title exceeds 255 chars | 422 | Validation failure | User shortens title |
| Empty/whitespace key | 422 | Validation failure | User provides key content |
| Invalid SSH key format | 422 | Not OpenSSH format or unsupported algo | User pastes correct public key |
| Duplicate fingerprint | 409 | Key already registered globally | User uses different key or verifies existing |
| Invalid key ID | 400 | Non-numeric, zero, negative, float | Client sends valid integer |
| Key ID exceeds MAX_SAFE_INTEGER | 400 | Out of range | Client sends valid integer |
| Key not found | 404 | Doesn't exist or belongs to another user | User verifies key ID |
| Database unreachable | 500 | Connection pool exhausted or DB down | Retry with backoff; platform team investigates |
| Database query timeout | 500 | Slow query, missing index | DBA investigates |
| Rate limit exceeded | 429 | Too many requests | Client retries after Retry-After header |

## Verification

### API Integration Tests — List

| Test ID | Description | Expected |
|---------|------------|----------|
| `API-LIST-001` | `GET /api/user/keys` for user with no keys | 200, body `[]` |
| `API-LIST-002` | `GET /api/user/keys` for user with 3 keys | 200, array length 3, each has `id`, `name`, `fingerprint`, `key_type`, `created_at` |
| `API-LIST-003` | Keys returned in descending `created_at` order | First element is most recently added |
| `API-LIST-004` | Response does not include `public_key` field | No element has a `public_key` field |
| `API-LIST-005` | Field types are correct | `id`: positive integer, `name`: non-empty string, `fingerprint`: starts with `SHA256:`, `key_type`: valid algorithm, `created_at`: valid ISO 8601 |
| `API-LIST-006` | No auth header → 401 | `401 Unauthorized` |
| `API-LIST-007` | Invalid token → 401 | `401 Unauthorized` |
| `API-LIST-008` | Read-only PAT → 200 | Read operation permitted |
| `API-LIST-009` | Full-scope PAT → 200 | Permitted |
| `API-LIST-010` | Session cookie → 200 | Permitted |
| `API-LIST-011` | Cross-user isolation | User A's list doesn't contain User B's keys, and vice versa |
| `API-LIST-012` | Just-added key appears immediately | Add key, re-list, new key is first |
| `API-LIST-013` | Just-deleted key disappears immediately | Delete key, re-list, key absent |
| `API-LIST-014` | User with 50 keys | 200, array length 50 |
| `API-LIST-015` | Fingerprint format matches local `ssh-keygen -lf` | Fingerprints identical |
| `API-LIST-016` | Unicode title preserved | Title `"Tëst Kéy 日本語 🔑"` returned verbatim |
| `API-LIST-017` | Maximum-length title (255 chars) preserved | Name field has length 255 |
| `API-LIST-018` | Correct `key_type` for each supported algorithm | Each of the 7 types matches when added and listed |
| `API-LIST-019` | Concurrent list requests return consistent snapshot | Both return same data |

### API Integration Tests — Add

| Test ID | Description | Expected |
|---------|------------|----------|
| `API-ADD-001` | Valid Ed25519 key | 201, `key_type` = `ssh-ed25519` |
| `API-ADD-002` | Valid RSA-4096 key | 201, `key_type` = `ssh-rsa` |
| `API-ADD-003` | Valid ECDSA-P256 key | 201, `key_type` = `ecdsa-sha2-nistp256` |
| `API-ADD-004` | Valid ECDSA-P384 key | 201, `key_type` = `ecdsa-sha2-nistp384` |
| `API-ADD-005` | Valid ECDSA-P521 key | 201, `key_type` = `ecdsa-sha2-nistp521` |
| `API-ADD-006` | Valid FIDO2 Ed25519 key | 201, `key_type` = `sk-ssh-ed25519@openssh.com` |
| `API-ADD-007` | Valid FIDO2 ECDSA key | 201, `key_type` = `sk-ecdsa-sha2-nistp256@openssh.com` |
| `API-ADD-008` | No auth → 401 | `401 Unauthorized` |
| `API-ADD-009` | Expired token → 401 | `401 Unauthorized` |
| `API-ADD-010` | Read-only PAT → 403 | `403 Forbidden` |
| `API-ADD-011` | Empty body `{}` → 422 on title | Validation error on `title` |
| `API-ADD-012` | Title only, no key → 422 | Validation error on `key` |
| `API-ADD-013` | Key only, no title → 422 | Validation error on `title` |
| `API-ADD-014` | Empty title `""` → 422 | `missing_field` code |
| `API-ADD-015` | Whitespace-only title → 422 | `missing_field` code |
| `API-ADD-016` | 255-character title (max valid) → 201 | `name` is exactly 255 chars |
| `API-ADD-017` | 256-character title (exceeds max) → 422 | `invalid` code |
| `API-ADD-018` | Unicode/emoji/CJK title → 201 | `name` matches input exactly |
| `API-ADD-019` | Title with leading/trailing whitespace → 201, trimmed | `name` is trimmed |
| `API-ADD-020` | Empty key `""` → 422 | `missing_field` code |
| `API-ADD-021` | Whitespace-only key → 422 | `missing_field` code |
| `API-ADD-022` | Invalid key material `"not-a-real-key"` → 422 | `invalid` code |
| `API-ADD-023` | Unsupported algorithm `ssh-dss` → 422 | `invalid` code |
| `API-ADD-024` | Key with only algorithm, no base64 data → 422 | `invalid` code |
| `API-ADD-025` | Key with invalid base64 → 422 | Validation error on `key` |
| `API-ADD-026` | Same fingerprint, different title → 409 | First 201, second 409 |
| `API-ADD-027` | Same fingerprint, same title → 409 | First 201, second 409 |
| `API-ADD-028` | Different keys, same title → both 201 | Title uniqueness not enforced |
| `API-ADD-029` | User A adds key, User B adds same key → 409 for B | Global fingerprint uniqueness |
| `API-ADD-030` | Response Content-Type is `application/json` | Header correct |
| `API-ADD-031` | Response `id` is positive integer | `id > 0` |
| `API-ADD-032` | Response `fingerprint` matches `SHA256:<base64>` format | Regex match |
| `API-ADD-033` | Response `created_at` is valid ISO 8601 with Z | Valid timestamp |
| `API-ADD-034` | Response does NOT contain `key`/`publicKey`/`public_key` | None present |
| `API-ADD-035` | After add, list includes new key first | ID matches first element |
| `API-ADD-036` | Key with trailing comment — comment stripped | Fingerprint matches `ssh-keygen -lf` |
| `API-ADD-037` | Key with extra whitespace between parts accepted | 201 |
| `API-ADD-038` | Key with leading/trailing whitespace accepted | 201 |
| `API-ADD-039` | No Content-Type header → 400 | Bad request |
| `API-ADD-040` | Malformed JSON → 400 | Bad request |
| `API-ADD-041` | Fingerprint matches OpenSSH output | Identical |
| `API-ADD-042` | Add → delete → list round-trip | Key absent after delete |

### API Integration Tests — Delete

| Test ID | Description | Expected |
|---------|------------|----------|
| `API-DEL-001` | Valid auth, valid key ID → 204 | 204 No Content, empty body |
| `API-DEL-002` | After delete, key absent from list | ID not in list |
| `API-DEL-003` | No auth → 401 | 401 |
| `API-DEL-004` | Invalid token → 401 | 401 |
| `API-DEL-005` | Read-only PAT → 403 | 403 |
| `API-DEL-006` | Non-existent key ID `999999999` → 404 | 404 |
| `API-DEL-007` | Cross-user: User A deletes User B's key → 404 | 404 (not 403) |
| `API-DEL-008` | Key ID `0` → 400 | Invalid key id |
| `API-DEL-009` | Key ID `-1` → 400 | 400 |
| `API-DEL-010` | Key ID `abc` → 400 | 400 |
| `API-DEL-011` | Key ID `1.5` → 400 | 400 |
| `API-DEL-012` | Key ID empty string → 400 or 404 | Route miss or bad request |
| `API-DEL-013` | Key ID exceeds MAX_SAFE_INTEGER → 400 | 400 |
| `API-DEL-014` | Delete key with valid maximum ID | 204 |
| `API-DEL-015` | Idempotency: delete same key twice | First 204, second 404 |
| `API-DEL-016` | Delete then re-add same key material | Re-add succeeds (201) |
| `API-DEL-017` | Response body is empty | Length 0 |
| `API-DEL-018` | Error response Content-Type is JSON | Header correct |
| `API-DEL-019` | Delete with request body present — ignored | 204 |
| `API-DEL-020` | Cross-user isolation round-trip | User B's key unaffected |
| `API-DEL-021` | Delete middle key of 3, other 2 remain in order | List returns 2 in reverse chronological |
| `API-DEL-022` | Delete last remaining key | 204, list returns `[]` |
| `API-DEL-023` | Key ID with leading zeros `007` | 204 (parsed as 7) |
| `API-DEL-024` | Key ID with whitespace | 400 |
| `API-DEL-025` | Key ID `NaN` → 400 | 400 |
| `API-DEL-026` | Key ID `Infinity` → 400 | 400 |

### CLI E2E Tests

| Test ID | Description | Expected |
|---------|------------|----------|
| `CLI-LIST-001` | `codeplane ssh-key list` returns JSON array | Exit 0, valid JSON array |
| `CLI-LIST-002` | Shows keys added via CLI | Key present after add |
| `CLI-LIST-003` | Shows keys added via API | Cross-client consistency |
| `CLI-LIST-004` | Fails without auth | Non-zero exit, auth error |
| `CLI-LIST-005` | Empty array when no keys | Exit 0, `[]` |
| `CLI-ADD-001` | Valid Ed25519 key add | Exit 0, response has `id`, `name`, `fingerprint`, `key_type`, `created_at` |
| `CLI-ADD-002` | Duplicate key rejection | Non-zero exit, conflict message |
| `CLI-ADD-003` | Invalid key rejection | Non-zero exit, validation error |
| `CLI-ADD-004` | Missing flags | Non-zero exit, usage error |
| `CLI-ADD-005` | Empty title | Non-zero exit |
| `CLI-ADD-006` | No auth token | Non-zero exit, auth error |
| `CLI-ADD-007` | Read-only token | Non-zero exit, permission error |
| `CLI-ADD-008` | Full round-trip: add → list → delete → list | Key appears then disappears |
| `CLI-ADD-009` | 255-char title (max valid) | Exit 0, name is 255 chars |
| `CLI-ADD-010` | 256-char title (exceeds max) | Non-zero exit |
| `CLI-ADD-011` | `--json` output is parseable | JSON.parse succeeds |
| `CLI-DEL-001` | `codeplane ssh-key delete <id> --yes` | Exit 0, includes `deleted` |
| `CLI-DEL-002` | `--json` returns structured JSON | Parseable JSON |
| `CLI-DEL-003` | Round-trip: add → list → delete → list → verify absent | Full lifecycle |
| `CLI-DEL-004` | Non-existent key ID | Non-zero exit |
| `CLI-DEL-005` | `abc` as key ID | Non-zero exit, invalid ID |
| `CLI-DEL-006` | `0` as key ID | Non-zero exit |
| `CLI-DEL-007` | `-1` as key ID | Non-zero exit |
| `CLI-DEL-008` | No auth | Non-zero exit, auth error |
| `CLI-DEL-009` | Read-only token | Non-zero exit |
| `CLI-DEL-010` | Delete via CLI, verify via API | API list confirms absence |
| `CLI-DEL-011` | Delete via API, attempt CLI delete | Non-zero exit, not-found |

### Playwright (Web UI) E2E Tests

| Test ID | Description | Expected |
|---------|------------|----------|
| `UI-LIST-001` | `/settings/keys` loads with heading "SSH Keys" | Page heading visible |
| `UI-LIST-002` | Empty state with CTA when no keys | Empty message and "Add SSH Key" button visible |
| `UI-LIST-003` | Key list renders all attributes (title, fingerprint, badge, date) | All elements visible per key row |
| `UI-LIST-004` | "Add SSH Key" button present and clickable | Button visible |
| `UI-LIST-005` | Loading skeleton shown while fetching | Skeleton/spinner visible before data |
| `UI-LIST-006` | Error state with retry on API failure | Error message and retry button visible |
| `UI-LIST-007` | Retry re-fetches successfully | Key list loads after retry |
| `UI-LIST-008` | Fingerprint uses monospace font and is selectable | CSS and selectability verified |
| `UI-ADD-001` | Click "Add SSH Key" → form/modal opens | Title and key fields visible |
| `UI-ADD-002` | Valid title + Ed25519 key → success toast, key in list | Toast shown, list updated |
| `UI-ADD-003` | Empty title → inline validation error | Error beneath title field |
| `UI-ADD-004` | Empty key → inline validation error | Error beneath key field |
| `UI-ADD-005` | Invalid key material → server validation error | Error displayed |
| `UI-ADD-006` | Duplicate key → conflict banner | "Already registered" message |
| `UI-ADD-007` | 255-char limit enforced client-side | Counter shown, beyond 255 prevented/flagged |
| `UI-ADD-008` | Cancel clears form | Fields empty, form dismissed |
| `UI-ADD-009` | Submit disabled when fields empty | Button disabled |
| `UI-ADD-010` | Loading spinner during submission | Spinner visible |
| `UI-ADD-011` | Navigate without auth → redirect to login | URL becomes `/login` |
| `UI-ADD-012` | New key shows correct title, fingerprint, type | Row values match |
| `UI-ADD-013` | Accessibility: labels, aria-describedby on errors | Audit passes |
| `UI-DEL-001` | Each key row has delete button | Delete button visible per row |
| `UI-DEL-002` | Click delete → confirmation dialog with title + fingerprint | Dialog with correct metadata |
| `UI-DEL-003` | Cancel in dialog → key NOT deleted | Key remains, API unchanged |
| `UI-DEL-004` | Escape while dialog open → closes | Dialog dismissed, key remains |
| `UI-DEL-005` | Confirm delete → key removed from list | Row disappears, toast shown |
| `UI-DEL-006` | After delete, page refresh doesn't show key | Server-side confirmed |
| `UI-DEL-007` | Delete last key → empty state appears | Empty state message visible |
| `UI-DEL-008` | Loading state during delete API call | Spinner, buttons disabled |
| `UI-DEL-009` | API failure → error in dialog, retry possible | Error visible, button re-enabled |
| `UI-DEL-010` | Delete button has correct `aria-label` | Attribute present with key title |
| `UI-DEL-011` | Concurrent delete (key deleted in another tab) → graceful handling | 404 handled: key removed, toast "already deleted" |

### Cross-Cutting Validation Tests

| Test ID | Description | Expected |
|---------|------------|----------|
| `CROSS-001` | Add via CLI, verify in API list | API includes CLI-added key |
| `CROSS-002` | Add via API, verify in CLI list | CLI includes API-added key |
| `CROSS-003` | Add via CLI, duplicate via API → 409 | Duplicate detected cross-client |
| `CROSS-004` | Add via API, duplicate via CLI → non-zero exit | Duplicate detected cross-client |
| `CROSS-005` | Add 20 keys sequentially, list all | All 20 present, newest first |
| `CROSS-006` | Concurrent add of 5 different keys | All 5 return 201, unique IDs |
| `CROSS-007` | Concurrent add of same key from 2 requests | One 201, one 409 |
| `CROSS-008` | Add key, verify SSH auth works | SSH connection authenticated |
| `CROSS-009` | 255-char title via API, list via CLI | Title fully preserved |
| `CROSS-010` | Emoji title via API, list via API | Title preserved exactly |
| `CROSS-011` | Add via CLI, delete via API | API 204, CLI confirms absence |
| `CROSS-012` | Add via API, delete via CLI | CLI exit 0, API confirms absence |
| `CROSS-013` | Delete key, re-add same public key | Re-add succeeds |
| `CROSS-014` | Two parallel DELETEs for same key | One 204, one 404, no 500s |
| `CROSS-015` | Add 50 keys, delete all sequentially | All succeed, final list `[]` |
| `CROSS-016` | Add 20 keys, delete all concurrently | All complete, final list `[]` |
| `CROSS-017` | After deleting key, SSH auth fails with that key | Permission denied |
| `CROSS-018` | Delete key A, key B still works for SSH | SSH with key B succeeds |
| `CROSS-019` | User A deletes their key, User B unaffected | User B can list and use keys |
