# NOTIFICATION_CLI_MARK_READ

Specification for NOTIFICATION_CLI_MARK_READ.

## High-Level User POV

When a Codeplane user works primarily from the terminal — running commands, inspecting issues, reviewing landing requests, or monitoring workflow runs — their notification inbox accumulates items in the background. They need the ability to manage that inbox without switching to the web UI or TUI. The CLI mark-read commands give them direct, scriptable control over notification read state from the command line.

There are two distinct actions a user can take. First, they can mark a single notification as read by providing its ID: `codeplane notification mark-read 42`. This is useful when they've reviewed a specific notification via `codeplane notification list` and want to acknowledge it. Second, they can mark all notifications as read at once: `codeplane notification mark-all-read`. This is useful when they've been away and want to clear their inbox entirely before starting fresh.

Both commands provide immediate feedback. On success, the user gets a confirmation and exit code zero. On failure — whether from authentication issues, invalid input, or server errors — they get a clear error message and a non-zero exit code. When run with `--json`, both commands produce machine-parseable output suitable for scripting, piping to `jq`, or integration into automated workflows.

The commands are intentionally split into two distinct subcommands (`mark-read` and `mark-all-read`) rather than overloading a single command with flags. This makes the CLI self-documenting, reduces the risk of accidentally clearing an entire inbox, and aligns with the E2E test expectations already defined in the repository. Both commands respect the same authentication mechanisms as all other CLI commands: environment-variable tokens, configured credentials, and explicit `--token` flags.

The value of this feature is operational efficiency. Terminal-native users can triage notifications entirely within their existing workflow. Automation scripts can mark notifications as read as part of CI/CD pipelines, bot workflows, or agent-driven task completion. The CLI mark-read commands complete the notification management loop that starts with `codeplane notification list`.

## Acceptance Criteria

### Definition of Done

- [ ] `codeplane notification mark-read <id>` marks a single notification as read by calling `PATCH /api/notifications/:id`
- [ ] `codeplane notification mark-all-read` marks all unread notifications as read by calling `PUT /api/notifications/mark-read`
- [ ] Both commands exit with code 0 on success and non-zero on failure
- [ ] Both commands require authentication; unauthenticated invocations exit non-zero with a clear error message
- [ ] Both commands support `--json` output mode for machine-parseable responses
- [ ] `mark-read <id>` with a valid ID that does not exist for the user succeeds silently (mirrors the 204 no-op behavior of the API)
- [ ] `mark-read <id>` with a valid ID that is already read succeeds silently (idempotent)
- [ ] `mark-all-read` with zero unread notifications succeeds silently (idempotent)
- [ ] The existing `notification read` subcommand with `--all` flag is preserved as a backward-compatible alias
- [ ] Shell completion scripts include `mark-read` and `mark-all-read` subcommands under `notification`
- [ ] Both commands are registered in the CLI help text with clear descriptions

### Input Validation and Edge Cases

- [ ] `mark-read` without an ID argument exits non-zero with error: `"Provide a notification ID."`
- [ ] `mark-read 0` exits non-zero — notification ID must be a positive integer
- [ ] `mark-read -1` exits non-zero — negative IDs are rejected
- [ ] `mark-read abc` exits non-zero — non-numeric IDs are rejected
- [ ] `mark-read 1.5` exits non-zero — floating-point IDs are rejected
- [ ] `mark-read 9223372036854775807` (max bigint) succeeds (204 no-op if not found)
- [ ] `mark-read 9223372036854775808` (bigint overflow) exits non-zero — server returns 400
- [ ] `mark-read ""` (empty string) exits non-zero
- [ ] `mark-all-read` ignores any trailing positional arguments
- [ ] `mark-all-read` accepts no options other than the global `--json`, `--token`, and `-R` flags
- [ ] Both commands respect the `CODEPLANE_API_URL` and `CODEPLANE_TOKEN` environment variables
- [ ] Both commands work with PAT-based authentication (`Authorization: Bearer <PAT>`)

### Boundary Constraints

- [ ] Notification IDs are positive integers within the PostgreSQL `bigint` range (1 to 9223372036854775807)
- [ ] The `mark-read` command takes exactly one positional argument (the ID)
- [ ] The `mark-all-read` command takes zero positional arguments
- [ ] JSON output for `mark-read` on success: `{ "status": "ok" }` or empty (matching the 204 semantics)
- [ ] JSON output for `mark-all-read` on success: `{ "status": "all_read" }`
- [ ] Error messages are written to stderr; structured JSON errors (when `--json` is active) are written to stdout

### Backward Compatibility

- [ ] The existing `notification read <id>` command continues to work as an alias for `notification mark-read <id>`
- [ ] The existing `notification read --all` command continues to work as an alias for `notification mark-all-read`
- [ ] If neither `<id>` nor `--all` is provided to `notification read`, the error message mentions both `mark-read <id>` and `mark-all-read` as the canonical commands

## Design

### CLI Command: `codeplane notification mark-read`

**Usage:**

```
codeplane notification mark-read <id> [--json]
```

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string (parsed as positive integer) | Yes | The notification ID to mark as read |

**Global Options (inherited):**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--json` | boolean | false | Output machine-parseable JSON |
| `--token` | string | env `CODEPLANE_TOKEN` | Authentication token |
| `-R`, `--repo` | string | — | Repository context (not used by this command) |

**Behavior:**

1. Parse and validate the `id` argument as a positive integer.
2. If validation fails, print error to stderr and exit with code 1.
3. Send `PATCH /api/notifications/{id}` with the configured authentication.
4. On 204 response: print success confirmation and exit 0.
5. On 400 response: print the error body and exit 1.
6. On 401 response: print authentication error and exit 1.
7. On 429 response: print rate limit error and exit 1.
8. On any other error: print generic error and exit 1.

**Output Examples:**

```
$ codeplane notification mark-read 42
Notification 42 marked as read.

$ codeplane notification mark-read 42 --json
{"status":"ok"}

$ codeplane notification mark-read 0
Error: Notification ID must be a positive integer.

$ codeplane notification mark-read abc
Error: Notification ID must be a positive integer.

$ codeplane notification mark-read
Error: Provide a notification ID.
```

### CLI Command: `codeplane notification mark-all-read`

**Usage:**

```
codeplane notification mark-all-read [--json]
```

**Arguments:** None.

**Global Options (inherited):**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--json` | boolean | false | Output machine-parseable JSON |
| `--token` | string | env `CODEPLANE_TOKEN` | Authentication token |

**Behavior:**

1. Send `PUT /api/notifications/mark-read` with the configured authentication.
2. On 204 response: print success confirmation and exit 0.
3. On 401 response: print authentication error and exit 1.
4. On 429 response: print rate limit error and exit 1.
5. On any other error: print generic error and exit 1.

**Output Examples:**

```
$ codeplane notification mark-all-read
All notifications marked as read.

$ codeplane notification mark-all-read --json
{"status":"all_read"}
```

### CLI Command: `codeplane notification read` (backward-compatible alias)

The existing `notification read` command is preserved with its current behavior:

- `notification read <id>` → delegates to `mark-read <id>`
- `notification read --all` → delegates to `mark-all-read`
- `notification read` (no args, no `--all`) → prints: `"Provide a notification ID or use --all to mark all as read."` and exits 1

This alias is not documented in new user-facing docs but continues to work for existing scripts and muscle memory.

### API Shape (consumed, not defined here)

The CLI commands consume two existing API endpoints:

| Command | Method | Endpoint | Success Status |
|---------|--------|----------|----------------|
| `mark-read <id>` | `PATCH` | `/api/notifications/:id` | 204 No Content |
| `mark-all-read` | `PUT` | `/api/notifications/mark-read` | 204 No Content |

No new API endpoints are introduced by this feature.

### SDK Shape (consumed, not defined here)

The CLI calls the API directly via the shared `api()` HTTP helper in `apps/cli/src/client.ts`. It does not import or use the `NotificationService` from `@codeplane/sdk` directly.

### Documentation

The following end-user documentation should be written:

1. **CLI Reference: `notification mark-read`** — Command reference documenting the positional `<id>` argument, output modes, error cases, and examples including `--json` usage and scripting patterns.

2. **CLI Reference: `notification mark-all-read`** — Command reference documenting the bulk action, output modes, idempotency behavior, and examples.

3. **CLI Reference: `notification read` (legacy)** — Brief note indicating this is a backward-compatible alias and users should prefer `mark-read` and `mark-all-read`.

4. **Notification Management Guide** — A section in the notification user guide covering CLI-based notification triage workflows, including listing, marking individual items, clearing the inbox, and combining these commands in shell scripts.

5. **CLI Completion** — Ensure `mark-read` and `mark-all-read` appear in shell completion outputs for bash, zsh, and fish.

## Permissions & Security

### Authorization

| Role | `mark-read <id>` | `mark-all-read` | Notes |
|------|-------------------|-----------------|-------|
| Authenticated user (notification owner) | ✅ | ✅ | Can mark their own notifications as read |
| Authenticated user (non-owner of specific notification) | ✅ (silent no-op) | N/A | 204 returned but no row updated; no information leakage |
| Unauthenticated | ❌ 401 | ❌ 401 | CLI exits non-zero with auth error |
| PAT-authenticated | ✅ | ✅ | PATs carry the same permissions as session auth |
| OAuth2 application token | ✅ | ✅ | If scope includes notification management |
| Deploy key | ❌ | ❌ | Deploy keys are repo-scoped, no user identity for notifications |
| Admin (for another user's notifications) | ❌ | ❌ | Admin role does not grant cross-user notification access |

### Rate Limiting

| Command | Endpoint | Rate Limit | Burst Allowance |
|---------|----------|------------|------------------|
| `mark-read <id>` | `PATCH /api/notifications/:id` | 60 requests/minute/user | 10 requests/second burst |
| `mark-all-read` | `PUT /api/notifications/mark-read` | 30 requests/minute/user | N/A |

When rate-limited (429), the CLI should print the `Retry-After` value if present in the response headers, e.g.: `"Rate limited. Retry after 15 seconds."`

### Data Privacy

- The 204 response on non-existent or non-owned notification IDs prevents enumeration attacks via sequential ID probing.
- Error messages do not reveal whether a notification ID exists for a different user.
- No notification content (subject, body) is logged by the CLI in error outputs — only the notification ID.
- CLI tokens stored in environment variables or config files must follow standard credential hygiene (not committed to repositories, restricted file permissions).

## Telemetry & Product Analytics

### Business Events

**Event: `NotificationMarkedReadCLI`**

Fired when a user successfully marks a single notification as read via the CLI.

| Property | Type | Description |
|----------|------|-------------|
| `user_id` | number | Authenticated user's ID |
| `notification_id` | number | The notification that was marked read |
| `client` | string | Always `"cli"` |
| `trigger` | string | Always `"explicit"` |
| `was_noop` | boolean | True if the API returned 204 with 0 rows affected (already read or non-existent) |
| `latency_ms` | number | Round-trip time from CLI to API response |

**Event: `NotificationMarkAllReadCLI`**

Fired when a user successfully marks all notifications as read via the CLI.

| Property | Type | Description |
|----------|------|-------------|
| `user_id` | number | Authenticated user's ID |
| `client` | string | Always `"cli"` |
| `notifications_affected_count` | number | Number of notifications transitioned from unread to read (0 for no-op) |
| `latency_ms` | number | Round-trip time from CLI to API response |

**Event: `NotificationCLIMarkReadError`**

Fired when a mark-read CLI command fails.

| Property | Type | Description |
|----------|------|-------------|
| `user_id` | number \| null | User ID if authenticated, null if auth failed |
| `command` | string | `"mark-read"` or `"mark-all-read"` |
| `error_type` | string | `"auth"`, `"validation"`, `"rate_limit"`, `"server_error"`, `"network"` |
| `notification_id` | number \| null | The ID attempted (null for mark-all-read) |
| `client` | string | Always `"cli"` |

### Funnel Metrics & Success Indicators

| Metric | Description | Target |
|--------|-------------|--------|
| **CLI mark-read adoption** | % of CLI users who use `mark-read` or `mark-all-read` at least once per week | > 20% of CLI notification-list users |
| **CLI mark-read success rate** | % of CLI mark-read invocations that exit 0 | > 98% |
| **CLI mark-read error distribution** | Breakdown of errors by type (auth, validation, rate limit, server, network) | Validation errors < 5%, server errors < 0.1% |
| **Command preference: mark-read vs mark-all-read** | Ratio of single mark-read to mark-all-read invocations | Tracking only (expect 60/40 single/all) |
| **Legacy alias usage** | % of mark-read actions that come through `notification read` vs `notification mark-read` | Track to determine when alias can be deprecated |
| **JSON output mode usage** | % of CLI mark-read invocations that use `--json` | Tracking only (indicates scripting adoption) |

## Observability

### Logging

All logs should use structured JSON format with standard request context.

| Log Point | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| CLI mark-read invoked | `DEBUG` | `command`, `notification_id` (if applicable), `json_mode` | On command entry before API call |
| CLI mark-read API request sent | `DEBUG` | `method`, `url`, `notification_id` (if applicable) | When HTTP request is dispatched |
| CLI mark-read API response received | `DEBUG` | `status_code`, `latency_ms`, `notification_id` (if applicable) | On HTTP response |
| CLI mark-read success | `INFO` | `command`, `notification_id` (if applicable), `latency_ms` | On successful completion (exit 0) |
| CLI mark-read validation failure | `WARN` | `command`, `raw_input`, `error` | When input validation rejects the ID |
| CLI mark-read auth failure | `WARN` | `command`, `api_url` | On 401 response |
| CLI mark-read rate limited | `WARN` | `command`, `retry_after_seconds` | On 429 response |
| CLI mark-read server error | `ERROR` | `command`, `notification_id` (if applicable), `status_code`, `response_body`, `latency_ms` | On 5xx response |
| CLI mark-read network error | `ERROR` | `command`, `notification_id` (if applicable), `error`, `api_url` | On connection failure, timeout, DNS failure |

### Prometheus Metrics

These metrics are server-side (the CLI is a client and does not emit Prometheus metrics directly). The server endpoints consumed by the CLI are already instrumented per `NOTIFICATION_MARK_READ_SINGLE` and `NOTIFICATION_MARK_READ_ALL` specs. The following CLI-relevant metrics ensure end-to-end visibility:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_notification_mark_read_total` | Counter | `status` (`success`, `noop`, `error_validation`, `error_auth`, `error_rate_limit`, `error_internal`), `client` | Total mark-read-single requests by outcome and client |
| `codeplane_notification_mark_all_read_total` | Counter | `status` (`success`, `error`, `rate_limited`), `client` | Total mark-all-read requests by outcome and client |
| `codeplane_notification_mark_read_duration_seconds` | Histogram | `client` | End-to-end request duration |
| `codeplane_notification_mark_all_read_duration_seconds` | Histogram | `client` | End-to-end request duration |

The `client` label should be set to `"cli"` when the request originates from the CLI (detectable via `User-Agent` header or a custom `X-Codeplane-Client: cli` header).

### Alerts

**Alert: `NotificationMarkReadCLIHighErrorRate`**

- **Condition:** `rate(codeplane_notification_mark_read_total{status=~"error_.*", client="cli"}[10m]) / rate(codeplane_notification_mark_read_total{client="cli"}[10m]) > 0.10`
- **Severity:** Warning
- **Summary:** More than 10% of CLI mark-read requests are failing
- **Runbook:**
  1. Check structured server logs filtered by `client=cli` for the error type distribution.
  2. If `error_auth` dominates: check if a CLI release broke token handling, or if tokens are expiring. Verify `CODEPLANE_TOKEN` environment variable is being set correctly.
  3. If `error_validation` dominates: check if a CLI release changed argument parsing or if upstream tooling is sending malformed IDs.
  4. If `error_internal` dominates: follow the `NotificationMarkReadHighErrorRate` runbook from the `NOTIFICATION_MARK_READ_SINGLE` spec — check database health, connection pool, and index integrity.
  5. If `error_rate_limit` dominates: check if an automation script is hammering the endpoint. Identify the user from logs and investigate.

**Alert: `NotificationMarkAllReadCLIHighLatency`**

- **Condition:** `histogram_quantile(0.95, rate(codeplane_notification_mark_all_read_duration_seconds_bucket{client="cli"}[10m])) > 5.0`
- **Severity:** Warning
- **Summary:** CLI mark-all-read p95 latency exceeds 5 seconds
- **Runbook:**
  1. Check if affected users have very large unread counts (>10,000). Large batch sizes are expected to be slower.
  2. Check the `codeplane_notifications_mark_all_read_rows_affected` histogram for unusually large values.
  3. Run `EXPLAIN ANALYZE` on the `markAllNotificationsRead` query for a representative user.
  4. Check database lock contention and autovacuum status on the `notifications` table.
  5. If latency is network-related (CLI is remote), check network path between CLI and API server.

**Alert: `NotificationCLINetworkErrorSpike`**

- **Condition:** CLI-side telemetry shows `error_type=network` in `NotificationCLIMarkReadError` events exceeding 5 per 5 minutes from distinct users.
- **Severity:** Info
- **Summary:** Multiple CLI users experiencing network errors reaching the notification API
- **Runbook:**
  1. Check if the API server is healthy via the `/api/health` endpoint.
  2. Check if there's a DNS resolution issue or TLS certificate problem.
  3. Check if a recent infrastructure change (firewall, load balancer) is blocking CLI traffic.
  4. If localized to specific users: suggest they verify their `CODEPLANE_API_URL` configuration.

### Error Cases and Failure Modes

| Error Case | Exit Code | User-Facing Message | Recovery |
|------------|-----------|---------------------|----------|
| Missing notification ID for `mark-read` | 1 | `"Provide a notification ID."` | Provide a valid ID argument |
| ID is zero | 1 | `"Notification ID must be a positive integer."` | Provide an ID > 0 |
| ID is negative | 1 | `"Notification ID must be a positive integer."` | Provide an ID > 0 |
| ID is non-numeric | 1 | `"Notification ID must be a positive integer."` | Provide a numeric ID |
| ID is floating-point | 1 | `"Notification ID must be a positive integer."` | Provide an integer ID |
| ID exceeds bigint max | 1 | Server returns 400, CLI prints error | Provide a valid ID |
| Unauthenticated | 1 | `"Authentication required. Set CODEPLANE_TOKEN or run codeplane auth login."` | Authenticate |
| Expired/invalid token | 1 | `"Authentication failed. Token may be expired or revoked."` | Re-authenticate |
| Rate limited (429) | 1 | `"Rate limited. Retry after N seconds."` | Wait and retry |
| Server error (5xx) | 1 | `"Server error. Please try again later."` | Retry; if persistent, check server health |
| Network error | 1 | `"Could not reach the Codeplane server at {url}. Check your connection and CODEPLANE_API_URL."` | Verify network and URL configuration |
| Notification not found (mark-read) | 0 | Success (silent no-op, mirrors 204) | No action needed |
| Zero unread (mark-all-read) | 0 | Success (silent no-op, mirrors 204) | No action needed |

## Verification

### API Integration Tests (verifying the endpoints the CLI consumes)

| # | Test | Expected Outcome |
|---|------|------------------|
| 1 | `PATCH /api/notifications/:id` with valid unread notification ID returns 204 | Status 204, empty body |
| 2 | `PATCH /api/notifications/:id` with already-read notification returns 204 (idempotent) | Status 204, no error |
| 3 | `PATCH /api/notifications/0` returns 400 | Status 400, `"invalid notification id"` |
| 4 | `PATCH /api/notifications/-1` returns 400 | Status 400 |
| 5 | `PATCH /api/notifications/abc` returns 400 | Status 400 |
| 6 | `PATCH /api/notifications/1.5` returns 400 | Status 400 |
| 7 | `PATCH /api/notifications/9223372036854775807` (max bigint) returns 204 (no-op) | Status 204 |
| 8 | `PATCH /api/notifications/9223372036854775808` (bigint + 1) returns 400 | Status 400 |
| 9 | `PATCH /api/notifications/:id` without authentication returns 401 | Status 401 |
| 10 | `PATCH /api/notifications/:id` where ID belongs to a different user returns 204 (no leakage) | Status 204, other user's notification unchanged |
| 11 | `PUT /api/notifications/mark-read` with unread notifications returns 204 | Status 204 |
| 12 | `PUT /api/notifications/mark-read` with zero unread returns 204 (idempotent) | Status 204 |
| 13 | `PUT /api/notifications/mark-read` without authentication returns 401 | Status 401 |
| 14 | `PUT /api/notifications/mark-read` only affects the authenticated user's notifications | Other user's unread notifications remain unread |
| 15 | Concurrent `PATCH /api/notifications/:id` for the same ID (10 parallel) all return 204 | No 5xx, no deadlocks |
| 16 | Concurrent `PUT /api/notifications/mark-read` (5 parallel, same user) all return 204 | No 5xx, no deadlocks |
| 17 | `PUT /api/notifications/mark-read` with a JSON request body `{"foo": "bar"}` returns 204 (body ignored) | Status 204 |

### CLI Integration Tests

| # | Test | Command | Expected Outcome |
|---|------|---------|------------------|
| 18 | mark-read single requires authentication | `["notification", "mark-read", "1"]` with `token: ""` | Exit code ≠ 0, stderr contains auth error |
| 19 | mark-read single with valid auth and valid ID exits 0 | `["notification", "mark-read", "1"]` with `token: WRITE_TOKEN` | Exit code 0 |
| 20 | mark-read single rejects ID 0 | `["notification", "mark-read", "0"]` with `token: WRITE_TOKEN` | Exit code ≠ 0 |
| 21 | mark-read single rejects negative ID | `["notification", "mark-read", "-5"]` with `token: WRITE_TOKEN` | Exit code ≠ 0 |
| 22 | mark-read single rejects non-numeric ID | `["notification", "mark-read", "abc"]` with `token: WRITE_TOKEN` | Exit code ≠ 0 |
| 23 | mark-read single rejects floating-point ID | `["notification", "mark-read", "1.5"]` with `token: WRITE_TOKEN` | Exit code ≠ 0 |
| 24 | mark-read single with max bigint ID exits 0 (no-op) | `["notification", "mark-read", "9223372036854775807"]` with `token: WRITE_TOKEN` | Exit code 0 |
| 25 | mark-read single with bigint overflow exits non-zero | `["notification", "mark-read", "9223372036854775808"]` with `token: WRITE_TOKEN` | Exit code ≠ 0 |
| 26 | mark-read single without ID argument exits non-zero | `["notification", "mark-read"]` with `token: WRITE_TOKEN` | Exit code ≠ 0, stderr contains guidance |
| 27 | mark-read single with `--json` outputs valid JSON | `["notification", "mark-read", "1"]` with `token: WRITE_TOKEN, json: true` | Exit code 0, stdout is valid JSON |
| 28 | mark-read single with empty string ID exits non-zero | `["notification", "mark-read", ""]` with `token: WRITE_TOKEN` | Exit code ≠ 0 |
| 29 | mark-all-read requires authentication | `["notification", "mark-all-read"]` with `token: ""` | Exit code ≠ 0 |
| 30 | mark-all-read with valid auth exits 0 | `["notification", "mark-all-read"]` with `token: WRITE_TOKEN` | Exit code 0 |
| 31 | mark-all-read with `--json` outputs valid JSON | `["notification", "mark-all-read"]` with `token: WRITE_TOKEN, json: true` | Exit code 0, stdout parses to `{ "status": "all_read" }` |
| 32 | mark-all-read is idempotent (run twice, both exit 0) | Run `["notification", "mark-all-read"]` twice | Both exit code 0 |
| 33 | Legacy: `notification read <id>` still works | `["notification", "read", "1"]` with `token: WRITE_TOKEN` | Exit code 0 |
| 34 | Legacy: `notification read --all` still works | `["notification", "read", "--all"]` with `token: WRITE_TOKEN` | Exit code 0 |
| 35 | Legacy: `notification read` with no args and no `--all` exits non-zero | `["notification", "read"]` with `token: WRITE_TOKEN` | Exit code ≠ 0, stderr contains guidance |

### End-to-End Workflow Tests

| # | Test | Description | Expected Outcome |
|---|------|-------------|------------------|
| 36 | List → mark-read → verify state change | Seed a notification, list via CLI to get ID, mark-read that ID, list again and verify `status` changed to `"read"` | Notification appears as `"read"` in second list |
| 37 | List → mark-all-read → verify all read | Seed 5 notifications, mark-all-read, list with `--json` and verify all have `status: "read"` | All 5 notifications are read |
| 38 | mark-read then mark-all-read (no conflict) | Seed 3 notifications, mark-read the first, then mark-all-read; verify all are read | All 3 read, no errors |
| 39 | mark-all-read then mark-read (idempotent) | mark-all-read, then mark-read a specific ID; both exit 0 | Both succeed silently |
| 40 | Cross-client consistency: mark-read via CLI, verify via API | CLI mark-read, then `GET /api/notifications/list` and verify state | API response reflects read state |
| 41 | Cross-client consistency: mark-all-read via CLI, verify via API | CLI mark-all-read, then `GET /api/notifications/list` and verify all read | API response shows all read |
| 42 | mark-read with notification belonging to different user | User A marks a notification ID that belongs to User B; exits 0 (no-op) and User B's notification is unchanged | Exit 0, User B's notification still unread |

### Load and Boundary Tests

| # | Test | Description | Expected Outcome |
|---|------|-------------|------------------|
| 43 | mark-read with ID at the max valid boundary (9223372036854775807) | `codeplane notification mark-read 9223372036854775807` | Exit 0 (silent no-op) |
| 44 | mark-read with ID one above max valid boundary (9223372036854775808) | `codeplane notification mark-read 9223372036854775808` | Exit ≠ 0, error message |
| 45 | mark-all-read with 500 unread notifications | Seed 500 unread, run mark-all-read, verify completion within 10 seconds | Exit 0, all 500 marked read |
| 46 | Rapid sequential mark-read (20 different IDs in quick succession) | Run 20 mark-read commands back-to-back | All exit 0, none rate-limited (within 60/min limit) |
| 47 | mark-read with special characters in surrounding args | `codeplane notification mark-read 42 --json` with extra whitespace/quotes in shell | Exit 0, correct behavior |
