# USER_SSH_KEY_LIST

Specification for USER_SSH_KEY_LIST.

## High-Level User POV

When you navigate to the SSH Keys section of your Codeplane account settings, you see a clear, scannable list of every SSH public key you have registered with your account. Each key entry shows a human-readable title you chose when adding the key, the key's algorithm type (such as Ed25519 or RSA), a truncated SHA256 fingerprint that matches what your local `ssh-add -l` command shows, and the date the key was added. The list is sorted with the most recently added key at the top.

This view gives you confidence that the right keys are attached to your account and that no unexpected keys have been added. When you recognize a key that belongs to a machine you no longer use, you can delete it directly from this list. When you need to add a new key for a new workstation, you can initiate that flow from this same page.

The SSH Keys list is the management hub for your SSH authentication credentials. It is distinct from deploy keys (which are repository-scoped) and from API tokens (which authenticate HTTP calls). The list is personal and private — only you can see your own registered SSH keys. There is no public surface that exposes this information to other users or anonymous visitors.

Whether you are using the web UI, the CLI, or the API directly, the data shown is consistent: the same keys, the same fingerprints, the same ordering. If you add a key through the CLI and then open the web settings page, the key appears immediately.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user can retrieve a list of all SSH keys registered to their account across all supported clients (API, CLI, web UI), with consistent data shape, ordering, and access control.

### Functional Constraints

- An authenticated user calling `GET /api/user/keys` receives a JSON array of all SSH keys owned by that user.
- Each key object in the response includes exactly: `id` (integer), `name` (string), `fingerprint` (string), `key_type` (string), `created_at` (ISO 8601 string).
- The response does **not** include the raw `public_key` material in the list endpoint. Only `fingerprint` and `key_type` are exposed for identification.
- Keys are ordered by `created_at` descending (most recently added first).
- If the user has no registered SSH keys, the endpoint returns an empty JSON array `[]`, not `null` or an error.
- The endpoint requires authentication. Unauthenticated requests receive a `401 Unauthorized` response.
- The endpoint supports both session cookie authentication and PAT-based `Authorization: token <pat>` authentication.
- Read-only PATs are sufficient to call this endpoint (it is a read operation).
- The endpoint returns only keys belonging to the authenticated user — no cross-user key leakage is possible.
- The `fingerprint` field uses the `SHA256:<base64-no-padding>` format, matching OpenSSH's `ssh-keygen -lf` output.
- The `key_type` field returns the SSH algorithm identifier exactly as stored (e.g., `ssh-ed25519`, `ssh-rsa`, `ecdsa-sha2-nistp256`).
- The `name` field reflects the title provided at key creation time, trimmed of leading/trailing whitespace, with a maximum length of 255 characters.
- The `id` field is a stable, monotonically increasing integer suitable for use in subsequent `DELETE /api/user/keys/:id` calls.

### Edge Cases

- A user with zero keys receives `200 OK` with body `[]`.
- A user with 100+ keys receives all keys in a single response (no pagination is required for this endpoint given expected key counts).
- If a key's `name` contains special characters (unicode, emoji, HTML entities, quotation marks), they are returned verbatim in JSON encoding — no sanitization or escaping beyond standard JSON string encoding.
- If the same user makes concurrent requests to `GET /api/user/keys`, both return the same consistent snapshot.
- If a key is deleted between the user listing keys and acting on the list, subsequent delete attempts for the already-deleted key return `404 Not Found`.

### Boundary Constraints

- Key `name` length: 1–255 characters (enforced at creation, displayed as-is in list).
- `fingerprint` string length: always `SHA256:` prefix + 43 characters of base64 (without trailing `=` padding), totaling exactly 50 characters.
- `key_type` valid values: `ssh-rsa`, `ssh-ed25519`, `ecdsa-sha2-nistp256`, `ecdsa-sha2-nistp384`, `ecdsa-sha2-nistp521`, `sk-ssh-ed25519@openssh.com`, `sk-ecdsa-sha2-nistp256@openssh.com`.
- `created_at` is always a valid ISO 8601 UTC timestamp string.

## Design

### API Shape

**Endpoint:** `GET /api/user/keys`

**Authentication:** Required. Session cookie or `Authorization: token <pat>` header.

**Request:** No query parameters. No request body.

**Response (200 OK):**

```json
[
  {
    "id": 42,
    "name": "MacBook Pro",
    "fingerprint": "SHA256:abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
    "key_type": "ssh-ed25519",
    "created_at": "2026-03-15T09:30:00.000Z"
  }
]
```

**Response (401 Unauthorized):**

```json
{
  "message": "authentication required"
}
```

**Response shape contract:** The response is always a JSON array. Each element is an object with exactly the five fields above. No additional fields are included. No `public_key` field is present in the list response.

### SDK Shape

The `UserService.listSSHKeys(userID: number)` method returns a `Result` containing an array of key summary objects:

```typescript
type SSHKeySummary = {
  id: number;
  name: string;
  fingerprint: string;
  key_type: string;
  created_at: string; // ISO 8601
};

// Returns Result<SSHKeySummary[], APIError>
```

The method validates that `userID > 0` before querying. An invalid user ID returns a `badRequest` error without touching the database.

### CLI Command

**Command:** `codeplane ssh-key list`

**Options:** None.

**Output:** JSON array of key objects printed to stdout.

**Exit code:** `0` on success, non-zero on authentication failure or network error.

**Authentication:** Uses the token stored in CLI config (set via `codeplane auth login`). Fails with a clear error message if no token is configured.

**Behavior on empty list:** Prints `[]` and exits with code `0`.

### Web UI Design

**Location:** User Settings → SSH Keys (`/settings/keys`)

**Layout:**

- **Page heading:** "SSH Keys" with a subtitle: "SSH keys are used to authenticate git operations over SSH."
- **Add key button:** A prominent "Add SSH Key" action button in the top-right of the section header, linking to the add-key flow.
- **Key list:** Each registered key is displayed as a card/row with:
  - **Title** (bold, primary text): The key's `name` field.
  - **Key type badge:** A small badge showing the algorithm (e.g., "Ed25519", "RSA", "ECDSA").
  - **Fingerprint:** Displayed in monospace font, showing the full `SHA256:...` string.
  - **Added date:** Relative time (e.g., "Added 3 days ago") with an exact timestamp shown on hover/title attribute.
  - **Delete button:** A destructive action (red text or icon) with a confirmation dialog before deleting.
- **Empty state:** When no keys are registered, show a centered illustration or icon with the message: "No SSH keys yet. Add an SSH key to authenticate git operations over SSH." with a call-to-action button to add a key, and a link to the SSH keys documentation guide.
- **Loading state:** A skeleton loader matching the card/row layout while the API call is in flight.
- **Error state:** If the API call fails, show an inline error banner: "Failed to load SSH keys. Please try again." with a retry button.

**Interactions:**

- The list refreshes automatically after a key is added or deleted (no manual page reload required).
- Clicking the delete button opens a confirmation modal: "Delete SSH key '[key name]'? This will revoke SSH access for any machine using this key. This action cannot be undone." with "Cancel" and "Delete" buttons.
- The fingerprint is selectable/copyable for cross-referencing with local `ssh-add -l` output.

### Documentation

The existing SSH keys guide (`docs/guides/ssh-keys.mdx`) already documents the list operation comprehensively. No additional documentation is required for the list feature specifically, but the documentation should be verified to remain accurate:

- The "Listing Your SSH Keys" section should match the actual response shape.
- The CLI example output should match the actual CLI output format.
- The API reference table at the bottom should remain accurate.

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| Authenticated user | Can list their own SSH keys. Always returns only keys owned by the authenticated user. |
| Unauthenticated | Rejected with `401 Unauthorized`. |
| Other users | Cannot see another user's SSH keys under any circumstance. There is no admin or public endpoint for viewing another user's SSH keys. |
| Read-only PAT | Permitted. Listing keys is a read operation. |
| Full-scope PAT | Permitted. |
| Session cookie | Permitted. |

### Rate Limiting

- The `GET /api/user/keys` endpoint is subject to the platform-wide rate limiting middleware.
- No additional per-endpoint rate limiting is required, as this is a low-cost read operation returning a small payload.
- Standard rate limit: follows the global per-user rate limit configured in the platform middleware (typically 60 requests/minute for authenticated users).

### Data Privacy

- The list endpoint does **not** return the raw `public_key` content. Only `fingerprint` and `key_type` are returned, which are sufficient for key identification but insufficient for impersonation.
- SSH key fingerprints are derived data (SHA256 of the public key bytes) and are not considered PII, but they are still scoped to the authenticated user only.
- The `name` field is user-provided and could contain PII (e.g., a machine name or a person's name). It is only visible to the key owner.
- No SSH key data (list contents, fingerprints, or names) is ever exposed in server logs at INFO level. Structured log context may include `user_id` and `key_count` but never fingerprint or key name values.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ssh_keys_listed` | User successfully retrieves their SSH key list | `user_id`, `key_count`, `client` (`web`, `cli`, `api`), `timestamp` |

### Funnel Metrics

- **SSH key adoption rate:** Percentage of active users who have ≥1 SSH key registered.
- **Key list view frequency:** How often users view their SSH key list (indicates engagement with credential management).
- **List-to-action conversion:** Percentage of key list views that lead to an add or delete action within the same session (indicates the list is actionable, not just informational).

### Success Indicators

- Users who view the SSH key list and then successfully use SSH transport within 24 hours — indicates the list helped verify or troubleshoot SSH configuration.
- Low error rate on list endpoint (< 0.1% of requests returning 5xx).
- Key list load time p95 < 200ms.

## Observability

### Logging

| Log Point | Level | Structured Context | Condition |
|-----------|-------|-------------------|----------|
| SSH key list requested | `DEBUG` | `user_id` | Every request |
| SSH key list returned | `INFO` | `user_id`, `key_count` | Every successful response |
| SSH key list auth failure | `WARN` | `request_id`, `ip`, `path` | 401 response |
| SSH key list internal error | `ERROR` | `user_id`, `request_id`, `error_message`, `stack_trace` | 500 response |

**Rules:**
- Never log `fingerprint`, `name`, or `public_key` values at any log level.
- Always include `request_id` for correlation.
- `key_count` is safe to log as it reveals no key details.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_ssh_key_list_requests_total` | Counter | `status` (200, 401, 500) | Total SSH key list requests |
| `codeplane_ssh_key_list_duration_seconds` | Histogram | — | Request duration for key list endpoint |
| `codeplane_ssh_keys_per_user` | Histogram | — | Distribution of key counts per user (sampled on list) |

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
2. Inspect database query performance: run `EXPLAIN ANALYZE` on the `ListUserSSHKeys` query for a sample user ID to check for missing indexes or sequential scans.
3. Verify that the `ssh_keys.user_id` index exists and is being used.
4. Check for lock contention on the `ssh_keys` table (concurrent bulk inserts, schema migrations, or vacuum operations).
5. If latency is widespread, check Bun runtime metrics for event loop lag or memory pressure.
6. Consider adding a response cache if this endpoint is being called at unexpectedly high frequency.

#### Alert: `SSHKeyList401Spike`

**Condition:** `rate(codeplane_ssh_key_list_requests_total{status="401"}[5m]) > 50`

**Severity:** Info

**Runbook:**
1. Check if the spike correlates with a known deployment or client release that may have broken auth token handling.
2. Review request source IPs for patterns indicating automated scanning or brute-force probing.
3. If the spike is from a single IP or narrow range, verify rate limiting is functioning correctly.
4. If the spike is from legitimate client traffic, check if session/token expiration settings changed recently.
5. No immediate action required unless the rate exceeds 500/min, in which case escalate as a potential abuse vector.

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Resolution |
|-------|-------------|-------|------------|
| Authentication required | 401 | Missing or invalid session/token | User must re-authenticate |
| Invalid user | 400 | Internal error: user ID ≤ 0 passed to service | Should never happen in production; indicates a middleware bug |
| Database unavailable | 500 | Connection pool exhausted or database down | Retry with backoff; platform team investigates |
| Database query timeout | 500 | Slow query due to missing index or table lock | DBA investigates query plan and indexing |

## Verification

### API Integration Tests

- **List keys returns 200 with empty array for a user with no keys.** Create a fresh user with no SSH keys. Call `GET /api/user/keys`. Assert status 200 and body `[]`.

- **List keys returns all registered keys for a user.** Create a user. Add 3 SSH keys via `POST /api/user/keys`. Call `GET /api/user/keys`. Assert status 200, array length 3, and each element has `id`, `name`, `fingerprint`, `key_type`, `created_at` fields.

- **List keys returns keys in descending created_at order.** Add 3 keys with known titles in sequence (small delay between adds). Call `GET /api/user/keys`. Assert the first element's `created_at` is the most recent.

- **List keys does not include raw public_key material.** Add a key. Call `GET /api/user/keys`. Assert no element in the response array has a `public_key` field.

- **List keys returns correct field types.** Add a key. List keys. Assert: `id` is a positive integer, `name` is a non-empty string, `fingerprint` starts with `SHA256:`, `key_type` is one of the valid SSH key type strings, `created_at` is a valid ISO 8601 string.

- **List keys requires authentication (no token).** Call `GET /api/user/keys` with no auth header and no session cookie. Assert status 401.

- **List keys requires authentication (invalid token).** Call `GET /api/user/keys` with `Authorization: token invalid_garbage`. Assert status 401.

- **List keys works with read-only PAT.** Create a read-only PAT. Call `GET /api/user/keys` with that PAT. Assert status 200.

- **List keys works with full-scope PAT.** Create a full-scope PAT. Call `GET /api/user/keys` with that PAT. Assert status 200.

- **List keys works with session cookie authentication.** Authenticate via OAuth flow, obtain session cookie. Call `GET /api/user/keys` with the cookie. Assert status 200.

- **List keys returns only the authenticated user's keys (no cross-user leakage).** Create User A and User B. Add 2 keys for User A and 1 key for User B. List keys as User A. Assert array length 2. List keys as User B. Assert array length 1. Assert no key IDs overlap.

- **List keys reflects a just-added key immediately.** List keys (expect N). Add a key. List keys again. Assert array length is N+1 and the new key appears first.

- **List keys reflects a just-deleted key immediately.** Add a key. List keys (note ID). Delete the key. List keys again. Assert the deleted key's ID is not in the response.

- **List keys handles a user with a large number of keys (50 keys).** Add 50 SSH keys for a single user. Call `GET /api/user/keys`. Assert status 200 and array length 50.

- **List keys returns correct fingerprint format.** Generate an ed25519 key locally. Compute the expected SHA256 fingerprint using `ssh-keygen -lf`. Add the key. List keys. Assert the returned fingerprint matches the locally computed fingerprint.

- **List keys name field preserves unicode characters.** Add a key with title `"Tëst Kéy 日本語 🔑"`. List keys. Assert the name field in the response matches exactly.

- **List keys name field preserves maximum-length title (255 characters).** Add a key with a title of exactly 255 characters. List keys. Assert the name field has length 255.

- **List keys returns correct key_type for each supported algorithm.** For each supported key type (`ssh-ed25519`, `ssh-rsa`, `ecdsa-sha2-nistp256`, `ecdsa-sha2-nistp384`, `ecdsa-sha2-nistp521`): generate a key of that type, add it, list keys, and assert the `key_type` field matches the expected algorithm string.

### CLI E2E Tests

- **`codeplane ssh-key list` returns a JSON array.** Run `codeplane ssh-key list`. Assert exit code 0. Parse stdout as JSON. Assert it is an array.

- **`codeplane ssh-key list` shows keys added via CLI.** Run `codeplane ssh-key add --title "test" --key "<valid_key>"`. Run `codeplane ssh-key list`. Assert the list includes a key with name "test".

- **`codeplane ssh-key list` shows keys added via API.** Add a key via direct `POST /api/user/keys` call. Run `codeplane ssh-key list`. Assert the list includes the added key.

- **`codeplane ssh-key list` fails without authentication.** Run `codeplane ssh-key list` with no configured token (or cleared token). Assert non-zero exit code and stderr contains an authentication error.

- **`codeplane ssh-key list` returns empty array when no keys exist.** Ensure user has no keys. Run `codeplane ssh-key list`. Assert exit code 0 and output is `[]`.

- **`codeplane ssh-key list` round-trip: add, list, delete, list.** Add a key. List (assert present). Delete the key. List again (assert absent).

### Web UI E2E Tests (Playwright)

- **SSH Keys settings page loads and shows the key list.** Log in. Navigate to `/settings/keys`. Assert the page heading "SSH Keys" is visible.

- **Empty state is shown when no keys exist.** Log in as a user with no SSH keys. Navigate to `/settings/keys`. Assert the empty state message is visible and the "Add SSH Key" call-to-action is present.

- **Key list renders all key attributes.** Pre-add 2 SSH keys via API. Navigate to `/settings/keys`. Assert 2 key entries are visible. For each entry, assert title, fingerprint (monospace), key type badge, and date are visible.

- **Add key button is present and navigable.** Navigate to `/settings/keys`. Assert the "Add SSH Key" button is visible and clickable.

- **Delete key shows confirmation dialog.** Pre-add a key. Navigate to `/settings/keys`. Click the delete button on the key. Assert a confirmation dialog appears with the key name and destructive warning.

- **Delete key confirmation removes the key from the list.** Pre-add a key. Navigate to `/settings/keys`. Click delete → confirm. Assert the key is no longer visible in the list without page reload.

- **Delete key cancellation keeps the key in the list.** Pre-add a key. Navigate to `/settings/keys`. Click delete → cancel. Assert the key remains visible.

- **Fingerprint text is selectable/copyable.** Pre-add a key. Navigate to `/settings/keys`. Assert the fingerprint element uses a monospace font and the text can be selected.

- **Page shows loading state while fetching.** Navigate to `/settings/keys` with network throttling. Assert a skeleton or loading indicator is visible before the key list renders.

- **Page shows error state on API failure.** Intercept the `GET /api/user/keys` request and force a 500 response. Navigate to `/settings/keys`. Assert an error message is visible with a retry option.

- **Retry button on error state re-fetches the key list.** Force a 500 on first load, then allow the second request to succeed. Click retry. Assert the key list loads correctly.
