# AUTH_CLI_STATUS

Specification for AUTH_CLI_STATUS.

## High-Level User POV

When a developer sits down to work with Codeplane from the terminal, one of the first things they need to know is whether they are properly authenticated. The `codeplane auth status` command answers that question immediately. It tells the user whether they are logged in, which account they are authenticated as, which Codeplane instance they are connected to, and where their credential is stored.

This is especially valuable in environments where developers work across multiple Codeplane instances — a self-hosted company server and a personal instance, for example — or where teams share CI machines where authentication state may be configured through environment variables rather than interactive login. Rather than discovering a stale or missing credential halfway through a workflow, `codeplane auth status` lets users verify their authentication health proactively.

The command works offline when possible: if a token exists locally, the command reports it even when the network is unavailable, while clearly noting that online verification could not be completed. When the network is reachable, the command validates the token against the server and shows the authenticated username. If the token is expired, revoked, or otherwise invalid, the command tells the user plainly and suggests re-authenticating.

The output is designed for both humans and scripts. In its default mode, it prints a clear, readable status message to the terminal. With the `--json` flag, it returns structured JSON that CI pipelines, editor integrations, and other tooling can parse reliably.

## Acceptance Criteria

### Definition of Done

- The `codeplane auth status` command is registered, documented, and functional.
- The command reports authentication state for the resolved Codeplane host.
- The command validates the stored token against the remote `/api/user` endpoint when the network is available.
- The command degrades gracefully when the network is unavailable, reporting local token presence without failing.
- JSON output via `--json` returns a stable, documented schema.
- The command exits with code 0 when logged in and code 1 when not logged in.
- Help text is accurate and discoverable via `codeplane auth status --help`.

### Functional Constraints

- [ ] When no token is found from any source (env, keyring, config), the command MUST report `logged_in: false` and `token_set: false`.
- [ ] When a token is found but the server returns a non-2xx response for `/api/user`, the command MUST report `logged_in: false` and `token_set: true`, with a message indicating the token is invalid or expired.
- [ ] When a token is found and the server returns a valid user profile, the command MUST report `logged_in: true`, `token_set: true`, and include the `user` field with the authenticated username.
- [ ] When a token is found but the network request fails (timeout, DNS failure, connection refused), the command MUST report `logged_in: true`, `token_set: true`, and include a message noting that online verification could not be completed.
- [ ] The `--hostname` flag MUST allow the user to inspect authentication state for a specific Codeplane instance instead of the default configured host.
- [ ] The `token_source` field MUST accurately reflect where the token was loaded from: `"env"` for the `CODEPLANE_TOKEN` environment variable, `"keyring"` for OS secure storage, or `"config"` for the legacy config file.
- [ ] The `api_url` field MUST contain the fully-qualified API URL that was used for verification.
- [ ] The `host` field MUST contain the normalized hostname (lowercase, no protocol, no path).
- [ ] The human-readable `message` field MUST be present in every response.
- [ ] The `--json` flag MUST produce parseable JSON to stdout with no extraneous output.
- [ ] The command MUST NOT write the token value to stdout or stderr under any circumstances.
- [ ] The command MUST complete within 10 seconds even when the server is unreachable (network timeout).

### Edge Cases

- [ ] If `CODEPLANE_TOKEN` is set to an empty string, it MUST be treated as unset (no token found from env source).
- [ ] If `CODEPLANE_TOKEN` is set and the keyring also contains a token for the same host, the env token MUST take precedence and `token_source` MUST be `"env"`.
- [ ] If `--hostname` is provided as a full URL (e.g., `https://codeplane.example.com`), the command MUST normalize it to extract the hostname.
- [ ] If `--hostname` is provided as a bare hostname (e.g., `codeplane.example.com`), the command MUST construct the appropriate API URL.
- [ ] If `--hostname` points to a `localhost` or `127.0.0.1` address with a port, the command MUST handle it correctly for local daemon scenarios.
- [ ] If the keyring backend is unavailable (e.g., headless server without Secret Service), the command MUST still check env and config sources without erroring.
- [ ] If the config file does not exist or is malformed, the command MUST not crash; it MUST treat the config source as empty.
- [ ] If the server returns a 401 or 403 specifically, the message SHOULD distinguish between an expired token and an explicitly revoked token when possible.
- [ ] If the server returns a 5xx error, the command MUST treat it as a network/server issue (not an invalid token) and report accordingly.

### Boundary Constraints

- [ ] The `--hostname` value MUST be at most 253 characters (maximum DNS hostname length).
- [ ] The `--hostname` value MUST contain only valid hostname characters: alphanumeric, hyphens, dots, colons (for port), and square brackets (for IPv6).
- [ ] Tokens of any length up to 4096 characters MUST be handled without truncation.
- [ ] The `user` field reflects the server's username, which may be up to 39 characters (following GitHub-style username constraints).
- [ ] The `message` field MUST NOT exceed 500 characters.

## Design

### CLI Command

**Command**: `codeplane auth status`

**Synopsis**:
```
codeplane auth status [--hostname <host>] [--json]
```

**Options**:
| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--hostname` | string | No | Configured default host | Hostname or API URL of the Codeplane instance to check |
| `--json` | boolean | No | `false` | Output structured JSON instead of human-readable text |

**Exit Codes**:
| Code | Meaning |
|------|--------|
| 0 | Authenticated (logged in) |
| 1 | Not authenticated (not logged in, or token invalid/expired) |

**Human-Readable Output Examples**:

*Logged in:*
```
✓ Logged in to codeplane.app as octocat via keyring
```

*Logged in via environment variable:*
```
✓ Logged in to codeplane.app as octocat via CODEPLANE_TOKEN env
```

*Logged in but could not verify online:*
```
✓ Logged in to codeplane.app via keyring (could not verify token due to network error)
```

*Token stored but invalid:*
```
✗ Stored token for codeplane.app from keyring is invalid or expired
```

*Not logged in:*
```
✗ Not logged in to codeplane.app
```

**JSON Output Schema**:

```json
{
  "logged_in": true,
  "api_url": "https://api.codeplane.app",
  "host": "codeplane.app",
  "token_set": true,
  "user": "octocat",
  "token_source": "keyring",
  "message": "Logged in to codeplane.app as octocat via keyring"
}
```

| Field | Type | Always Present | Description |
|-------|------|----------------|-------------|
| `logged_in` | boolean | Yes | Whether the user is considered authenticated |
| `api_url` | string | Yes | The resolved API URL checked |
| `host` | string | Yes | The normalized hostname |
| `token_set` | boolean | Yes | Whether a token was found locally |
| `user` | string | No | The authenticated username (only when verified online) |
| `token_source` | string | No | Where the token was loaded from: `"env"`, `"keyring"`, or `"config"` |
| `message` | string | Yes | Human-readable status summary |

**Token Source Display Mapping**:
| Internal Source | Display String |
|-----------------|---------------|
| `"env"` | `"CODEPLANE_TOKEN env"` |
| `"keyring"` | `"keyring"` |
| `"config"` | `"config file"` |

### API Shape

The `codeplane auth status` command relies on a single API endpoint for online token verification:

**`GET /api/user`**

- **Purpose**: Returns the authenticated user's profile, used to validate token liveness and retrieve the username.
- **Authentication**: Bearer token in the `Authorization` header.
- **Success Response (200)**: JSON object containing at minimum `username`, `id`, `email`, `display_name`, and `avatar_url`.
- **Error Responses**: 401 (unauthorized/expired), 403 (forbidden/revoked), 5xx (server error).

No additional API endpoints are required for this feature.

### SDK Shape

The core logic resides in the shared auth-state module consumed by the CLI:

- **`resolveAuthToken(options?)`**: Resolves the active token using the priority chain (env → keyring → config). Returns `{ token, source, apiUrl, host }` or `null`.
- **`getAuthStatus(fetchImpl, options?)`**: Composes `resolveAuthToken` with an online verification call to `/api/user`. Returns an `AuthStatusResult` object.
- **`AuthStatusResult`**: The structured return type with fields: `logged_in`, `api_url`, `host`, `token_set`, `user?`, `token_source?`, `message`.
- **`AuthTokenSource`**: Union type `"env" | "keyring" | "config"`.
- **`formatTokenSource(source)`**: Maps internal source identifiers to human-readable display strings.

### TUI Integration

Auth status information is displayed in the TUI's dashboard connection indicator using the same `getAuthStatus` function. The indicator shows:
- A green dot and username when authenticated.
- A yellow dot with "unverified" when a token exists but cannot be verified.
- A red dot with "not logged in" when no token is present.

### Editor Integration

**VS Code**: The status bar item reflects auth status. On activation, it calls `getAuthStatus` and displays the username. Clicking offers a "Login" action if unauthenticated.

**Neovim**: The statusline component exposes auth status. The `:Codeplane status` command displays authentication state alongside daemon/sync status.

### Documentation

1. **CLI Reference — `codeplane auth status`**: Reference page documenting the command synopsis, all flags, output fields, exit codes, and examples for each status scenario (logged in, not logged in, token expired, network unavailable, custom hostname).

2. **Authentication Guide — Verifying Your Login**: A section explaining how to check auth status, how to interpret each status message, what to do when a token is invalid, and how environment variable tokens interact with keyring tokens.

3. **Scripting Guide — Auth Status in CI/CD**: A short guide showing how to use `codeplane auth status --json` in CI pipelines to gate operations on authentication, with example shell snippets parsing the JSON output.

## Permissions & Security

### Authorization Roles

- **Any user (authenticated or anonymous)**: Can run `codeplane auth status`. The command itself does not require authentication — it *reports* authentication state.
- **No server-side authorization check is needed** beyond the standard token verification on `GET /api/user`. If the token is invalid, the server returns 401/403, and the CLI interprets this as "not logged in."

### Rate Limiting

- The `GET /api/user` endpoint MUST be rate-limited to prevent abuse. Recommended limit: **60 requests per minute per IP** for unauthenticated/invalid-token requests, **120 requests per minute per authenticated user** for valid tokens.
- The CLI SHOULD NOT retry on rate-limit (429) responses. It should report the error in the `message` field and set `logged_in: false`.

### Data Privacy & PII

- The token value MUST NEVER appear in stdout, stderr, logs, crash reports, or telemetry events.
- The username returned by `/api/user` is considered public profile information and may appear in output.
- The `api_url` and `host` fields may contain internal hostnames for self-hosted instances. These MUST NOT be sent to external telemetry services without user consent.
- When `token_source` is `"env"`, the command MUST NOT log or display the environment variable's value — only the source name.
- Keyring access must use the platform's standard secure storage APIs and must not fall back to plaintext storage on disk (except in the explicit test-mode JSON file backend).

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `cli.auth.status.checked` | Every invocation of `codeplane auth status` | `logged_in` (bool), `token_set` (bool), `token_source` (string or null), `host` (string, hashed), `verification_outcome` ("verified", "invalid", "network_error", "no_token"), `exit_code` (int), `json_output` (bool), `custom_hostname` (bool), `latency_ms` (int) |
| `cli.auth.status.token_invalid` | When a stored token is found to be invalid or expired | `token_source` (string), `host` (string, hashed), `http_status` (int) |
| `cli.auth.status.network_error` | When online verification fails due to network issues | `host` (string, hashed), `error_type` (string: "timeout", "dns", "connection_refused", "other") |

### Funnel Metrics & Success Indicators

- **Auth status check rate**: Number of `cli.auth.status.checked` events per day. A healthy, active CLI user base produces steady daily volume.
- **Token validity rate**: Percentage of status checks where `verification_outcome == "verified"` out of all checks where `token_set == true`. Target: >95%. A low rate indicates token expiry, revocation, or misconfiguration issues at scale.
- **Invalid token → re-login conversion**: Percentage of `cli.auth.status.token_invalid` events followed by a `cli.auth.login.completed` event within 10 minutes from the same device. A high conversion rate indicates that the status command's messaging effectively guides users to re-authenticate.
- **Network error rate**: Percentage of checks resulting in `network_error`. Spikes indicate infrastructure issues or connectivity problems with the Codeplane instance.
- **JSON usage rate**: Percentage of status checks using `--json`. High rates indicate strong CI/scripting adoption.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | Description |
|-----------|-------|-------------------|-------------|
| Auth status check initiated | `DEBUG` | `host`, `custom_hostname` (bool), `has_env_token` (bool) | Logged at the start of every status check |
| Token resolved | `DEBUG` | `token_source`, `host` | Logged when a token is found from any source |
| No token found | `DEBUG` | `host`, `checked_sources` (array) | Logged when no token exists |
| Verification request sent | `DEBUG` | `api_url`, `method: "GET"` | Logged before the `/api/user` call |
| Verification succeeded | `DEBUG` | `host`, `username`, `response_time_ms` | Logged on 200 response |
| Verification failed (auth error) | `WARN` | `host`, `token_source`, `http_status` | Logged on 401/403 response |
| Verification failed (server error) | `WARN` | `host`, `http_status` | Logged on 5xx response |
| Verification failed (network error) | `WARN` | `host`, `error_message`, `error_type` | Logged on network failure |
| Keyring access error | `WARN` | `host`, `error_message` | Logged when keyring backend fails |
| Auth status result | `INFO` | `logged_in`, `token_set`, `token_source`, `host`, `exit_code` | Logged at the end of every status check |

**Critical rule**: Token values MUST NEVER appear in any log at any level.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_cli_auth_status_total` | Counter | `outcome` ("logged_in", "not_logged_in", "token_invalid", "network_error"), `token_source` ("env", "keyring", "config", "none"), `host_hashed` | Total auth status checks |
| `codeplane_cli_auth_status_verification_duration_seconds` | Histogram | `outcome` ("success", "auth_error", "server_error", "network_error"), `host_hashed` | Duration of the `/api/user` verification call |
| `codeplane_api_user_requests_total` | Counter | `status_code`, `auth_method` ("bearer") | Server-side counter for `/api/user` requests |

### Alerts & Runbooks

**Alert 1: High Token Invalid Rate**
- **Condition**: `rate(codeplane_cli_auth_status_total{outcome="token_invalid"}[15m]) / rate(codeplane_cli_auth_status_total{token_source!="none"}[15m]) > 0.20`
- **Severity**: Warning
- **Runbook**:
  1. Check if a recent token rotation or revocation event occurred (e.g., admin bulk-revoked tokens).
  2. Check if the auth service or database is healthy: query `codeplane_api_user_requests_total{status_code="500"}` for spikes.
  3. Check if a deployment changed the token validation logic or secret key.
  4. If the rate is caused by a small number of users repeatedly checking invalid tokens, this may be benign. Check cardinality of `host_hashed` label.
  5. If widespread, notify the engineering team and check recent auth service deployments.

**Alert 2: High Network Error Rate**
- **Condition**: `rate(codeplane_cli_auth_status_total{outcome="network_error"}[15m]) > 0.30 * rate(codeplane_cli_auth_status_total[15m])`
- **Severity**: Warning
- **Runbook**:
  1. Check if the Codeplane API server is up and accepting connections (`codeplane_http_requests_total`).
  2. Check DNS resolution for the API hostname.
  3. Check for network partitions, firewall changes, or certificate expiry.
  4. If the errors are concentrated on a single `host_hashed`, the issue is likely instance-specific. Check that instance's health.
  5. If widespread, escalate to infrastructure team.

**Alert 3: Verification Latency Spike**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_cli_auth_status_verification_duration_seconds_bucket[10m])) > 5`
- **Severity**: Warning
- **Runbook**:
  1. Check API server response times: `histogram_quantile(0.95, rate(codeplane_http_request_duration_seconds_bucket{route="/api/user"}[10m]))`.
  2. Check database query times for user lookup.
  3. Check for connection pooling exhaustion or elevated request queuing.
  4. If latency is only on the CLI side (not reflected in server metrics), investigate DNS or TLS handshake delays.

### Error Cases and Failure Modes

| Error Case | Behavior | User Message |
|------------|----------|-------------|
| No token in any source | Return `logged_in: false`, exit 1 | "Not logged in to {host}" |
| Token found, server returns 401 | Return `logged_in: false`, exit 1 | "Stored token for {host} from {source} is invalid or expired" |
| Token found, server returns 403 | Return `logged_in: false`, exit 1 | "Stored token for {host} from {source} is invalid or expired" |
| Token found, server returns 429 | Return `logged_in: false`, exit 1 | "Rate limited by {host}. Try again later." |
| Token found, server returns 5xx | Return `logged_in: true`, exit 0 | "Logged in to {host} via {source} (server error during verification, token may still be valid)" |
| Token found, network timeout | Return `logged_in: true`, exit 0 | "Logged in to {host} via {source} (could not verify token due to network error)" |
| Token found, DNS failure | Return `logged_in: true`, exit 0 | "Logged in to {host} via {source} (could not verify token due to network error)" |
| Token found, connection refused | Return `logged_in: true`, exit 0 | "Logged in to {host} via {source} (could not verify token due to network error)" |
| Keyring backend unavailable | Fall through to config source | (No error shown unless no other source has a token) |
| Config file missing or malformed | Skip config source | (No error shown unless no other source has a token) |
| Invalid `--hostname` value | Return error, exit 2 | "Invalid hostname: {value}" |
| `--hostname` exceeds 253 chars | Return error, exit 2 | "Hostname too long (max 253 characters)" |

## Verification

### API Integration Tests

- [ ] **`GET /api/user` with valid bearer token returns 200 and user profile**: Verify the response includes `username`, `id`, `email`, `display_name`, and `avatar_url`.
- [ ] **`GET /api/user` with expired/revoked token returns 401**: Create a token, revoke it via `/api/user/tokens/:id`, then call `/api/user` with that token.
- [ ] **`GET /api/user` with malformed token returns 401**: Send a request with `Authorization: Bearer invalid_garbage_string`.
- [ ] **`GET /api/user` with no Authorization header returns 401**: Verify unauthenticated requests are rejected.
- [ ] **`GET /api/user` with a token at the maximum valid length (4096 chars) returns the expected response**: Create or mock a token at boundary length.
- [ ] **`GET /api/user` with a token exceeding maximum length (4097 chars) returns 401 or 400**: Verify oversized tokens are rejected.
- [ ] **`GET /api/user` rate limiting is enforced**: Send 61+ requests in quick succession from the same IP with an invalid token and verify 429 responses.

### CLI E2E Tests

#### Happy Path

- [ ] **`codeplane auth status` when logged in shows username and host**: Log in first, then run status. Verify output contains `✓`, username, and host.
- [ ] **`codeplane auth status --json` when logged in returns valid JSON**: Parse stdout as JSON, verify `logged_in: true`, `user` is present, `token_set: true`, `token_source` is present, `api_url` is a valid URL, `host` is a string, and `message` is a non-empty string.
- [ ] **`codeplane auth status` exit code is 0 when logged in**: Verify the process exits with code 0.
- [ ] **`codeplane auth status` when not logged in shows "Not logged in"**: Clear all credentials, run status. Verify output contains `✗` and "Not logged in".
- [ ] **`codeplane auth status --json` when not logged in returns valid JSON**: Parse stdout, verify `logged_in: false`, `token_set: false`, `user` is absent, `token_source` is absent.
- [ ] **`codeplane auth status` exit code is 1 when not logged in**: Verify the process exits with code 1.

#### Token Source Priority

- [ ] **`codeplane auth status` with `CODEPLANE_TOKEN` env var set shows source as env**: Set `CODEPLANE_TOKEN` to a valid token, run status. Verify `token_source` is `"env"` and message contains "CODEPLANE_TOKEN env".
- [ ] **`codeplane auth status` with both env and keyring tokens uses env**: Store a token in keyring and set `CODEPLANE_TOKEN`. Verify `token_source: "env"`.
- [ ] **`codeplane auth status` with keyring token shows source as keyring**: Clear env var, store token in keyring. Verify `token_source: "keyring"`.
- [ ] **`codeplane auth status` with only config file token shows source as config**: Clear env and keyring, place token in config. Verify `token_source: "config"`.
- [ ] **`codeplane auth status` with empty `CODEPLANE_TOKEN` env var falls through to keyring**: Set `CODEPLANE_TOKEN=""`, store token in keyring. Verify `token_source: "keyring"`.

#### Token Validation

- [ ] **`codeplane auth status` with valid token shows username**: Verify the `user` field matches the expected username.
- [ ] **`codeplane auth status` with expired/revoked token shows invalid message**: Create token, revoke it, run status. Verify `logged_in: false`, `token_set: true`, message contains "invalid or expired".
- [ ] **`codeplane auth status --json` with invalid token includes `token_source` but no `user`**: Verify JSON has `token_source` but `user` is absent.

#### Custom Hostname

- [ ] **`codeplane auth status --hostname codeplane.example.com` checks the specified host**: Verify `host` in output matches the provided hostname.
- [ ] **`codeplane auth status --hostname https://api.codeplane.example.com` normalizes URL to hostname**: Verify `host` is the appropriate normalization.
- [ ] **`codeplane auth status --hostname localhost:3000` works for local daemon**: Verify the command successfully checks a local instance.
- [ ] **`codeplane auth status --hostname 127.0.0.1:3000` works for loopback addresses**: Verify no errors for IP-based hostnames.
- [ ] **`codeplane auth status --hostname` with a 253-character hostname succeeds**: Verify maximum-length hostnames are accepted.
- [ ] **`codeplane auth status --hostname` with a 254-character hostname fails with a clear error**: Verify the boundary is enforced.
- [ ] **`codeplane auth status --hostname` with special characters (spaces, slashes in unexpected positions) fails with a clear error**: Verify input validation.

#### Network Failure Handling

- [ ] **`codeplane auth status` with unreachable server shows network error message**: Configure a hostname that resolves but has no server. Verify `logged_in: true`, message mentions "network error".
- [ ] **`codeplane auth status` with unreachable server exits 0**: Even with network error, if token is present, exit code is 0.
- [ ] **`codeplane auth status --json` with unreachable server still returns valid JSON**: Verify the JSON is parseable and complete.
- [ ] **`codeplane auth status` completes within 10 seconds even when server is unreachable**: Time the command execution and verify it does not hang.

#### Credential Storage Edge Cases

- [ ] **`codeplane auth status` when keyring is unavailable still checks env and config**: Set `CODEPLANE_DISABLE_SYSTEM_KEYRING=1`, place token in env. Verify it works.
- [ ] **`codeplane auth status` when config file is missing does not error**: Delete or rename config file. Verify the command runs without crashing.
- [ ] **`codeplane auth status` when config file is malformed does not crash**: Write garbage to the config file. Verify graceful degradation.

#### Output Safety

- [ ] **`codeplane auth status` never leaks the token value in stdout**: Capture all stdout. Verify the actual token string does not appear anywhere in the output.
- [ ] **`codeplane auth status` never leaks the token value in stderr**: Capture all stderr. Verify the actual token string does not appear.
- [ ] **`codeplane auth status --json` does not include a `token` field in the JSON**: Parse the JSON and verify no `token` key exists.

### Playwright (Web UI) Tests

- [ ] **No dedicated web UI for auth status**: This feature is CLI-primary. No new Playwright tests are required specifically for this feature.

### Security Tests

- [ ] **Token is not logged to any file or output at DEBUG or TRACE level**: Run the command with maximum verbosity. Grep all output for the token string.
- [ ] **Test-mode credential store file has 0600 permissions**: When using `CODEPLANE_TEST_CREDENTIAL_STORE_FILE`, verify the file is created with restricted permissions.
- [ ] **Status check does not modify any stored credentials**: Run status, then verify the keyring and config file are byte-identical before and after.
