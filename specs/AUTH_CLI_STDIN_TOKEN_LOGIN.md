# AUTH_CLI_STDIN_TOKEN_LOGIN

Specification for AUTH_CLI_STDIN_TOKEN_LOGIN.

## High-Level User POV

When a user needs to authenticate the Codeplane CLI without opening a browser — because they are working in a headless CI/CD environment, inside an SSH session to a remote machine, running automation scripts, or simply prefer the speed of piping a token directly — they can log in by piping a Personal Access Token into the `codeplane auth login --with-token` command via standard input.

The user already has a Codeplane Personal Access Token, which they previously created through the web UI or CLI. They pipe or echo that token into the login command:

```
echo "codeplane_abc123..." | codeplane auth login --with-token
```

The CLI reads the token from stdin, validates that it has the correct format, and stores it securely in the operating system's credential keyring (macOS Keychain, Linux Secret Service, or Windows Credential Locker). From that point forward, every CLI command, editor integration, TUI session, and daemon interaction targeting that Codeplane host authenticates automatically using the stored token — no further manual steps are needed.

This flow is essential for three use cases. First, CI/CD pipelines that need to authenticate a Codeplane CLI session as part of a build or deployment step. Second, remote or headless servers where no browser is available. Third, advanced users who prefer composable Unix-style workflows over interactive browser-based flows. In all cases, the user experience is the same: one piped command, immediate authentication, and secure storage.

If the user provides an invalid token — one that is empty, missing the required `codeplane_` prefix, or otherwise malformed — the CLI exits with a clear error message and a non-zero exit code. No credential is stored, and no network request is made. The validation is purely local and instantaneous.

Users can target a specific Codeplane instance by passing `--hostname`, which is useful when working with multiple self-hosted Codeplane servers. If no hostname is specified, the CLI uses the configured default host.

After logging in, the user can verify their authentication at any time by running `codeplane auth status`, which confirms the host, username, and token source. If the token turns out to be expired or revoked on the server side, the status command surfaces that clearly so the user can re-authenticate.

## Acceptance Criteria

### Definition of Done

The feature is complete when a user can pipe a valid Codeplane Personal Access Token into `codeplane auth login --with-token`, have it validated locally, stored securely in the OS credential keyring, and used automatically for all subsequent authenticated CLI operations — and when all edge cases, error paths, and platform-specific credential backends are handled correctly.

### Functional Criteria

- [ ] Running `echo "codeplane_<40-hex-chars>" | codeplane auth login --with-token` reads the token from stdin and stores it in the OS credential keyring.
- [ ] After successful login, all subsequent CLI commands authenticate using the stored token without further user input.
- [ ] The CLI prints a structured success result to stdout (JSON when `--json` is used) and a human-readable confirmation to stderr.
- [ ] The CLI exits with code `0` on successful login.
- [ ] No network request is made during the login flow — validation is purely local format checking.
- [ ] The `--hostname` option allows targeting a specific Codeplane instance; the token is stored keyed to the resolved hostname.
- [ ] If `--hostname` is omitted, the CLI resolves the target from the user's configuration file (default API URL).
- [ ] The config file's `api_url` field is updated to match the resolved target after successful token storage.
- [ ] If a legacy token exists in the config file for the same host, it is cleared upon successful keyring storage.
- [ ] If a token was previously stored in the keyring for the same host, it is overwritten with the new token.

### Token Format Constraints

- [ ] The token must start with the `codeplane_` prefix.
- [ ] The full token format is `codeplane_` followed by exactly 40 lowercase hexadecimal characters (46 characters total).
- [ ] Leading and trailing whitespace around the token is trimmed before validation.
- [ ] Trailing newline characters from `echo` or heredoc piping are stripped.
- [ ] Tokens containing internal whitespace (spaces, tabs, newlines within the token body) are rejected.

### Stdin Input Constraints

- [ ] The CLI reads the entirety of stdin using `Bun.stdin.text()`, which blocks until EOF.
- [ ] The user signals end of input via pipe EOF or Ctrl-D in an interactive terminal context.
- [ ] If stdin is empty (zero bytes after trimming), the CLI exits with error: `"no token provided on stdin"`.
- [ ] If stdin contains multiple lines, only the trimmed full content is validated — multi-line input that does not match the token format is rejected.
- [ ] Maximum accepted stdin payload: 1024 bytes. Input exceeding this limit should be rejected to prevent resource exhaustion.
- [ ] Binary or non-UTF-8 stdin content is treated as an invalid token and rejected.

### Credential Storage Constraints

- [ ] On macOS, the token is stored in macOS Keychain via the `security` CLI tool under service name `codeplane-cli`.
- [ ] On Linux, the token is stored via `secret-tool` (freedesktop Secret Service) under service `codeplane-cli`.
- [ ] On Windows, the token is stored in Windows Credential Locker via PowerShell (`pwsh` or `powershell`).
- [ ] If no supported credential backend is available and `CODEPLANE_DISABLE_SYSTEM_KEYRING=1` is not set, the CLI raises `SecureStorageUnavailableError` with an actionable message suggesting `CODEPLANE_TOKEN` as an alternative.
- [ ] In test mode (`CODEPLANE_TEST_CREDENTIAL_STORE_FILE` is set), tokens are stored in a JSON file at the specified path with `0o600` permissions.
- [ ] The hostname key used for credential storage is normalized to lowercase and trimmed.

### Edge Cases

- [ ] Empty stdin (`echo "" | codeplane auth login --with-token`): error `"no token provided on stdin"`, exit code non-zero, no credential stored.
- [ ] Whitespace-only stdin: error `"no token provided on stdin"`.
- [ ] Token without `codeplane_` prefix: error `'Invalid token. Tokens must start with "codeplane_".'`.
- [ ] Token with correct prefix but wrong length (e.g., `codeplane_abc`): accepted by the CLI format validation (the server will reject on first use). The CLI validates prefix only.
- [ ] Token with uppercase hex after prefix (e.g., `codeplane_ABCD...`): accepted by CLI (server-side hash comparison handles case sensitivity).
- [ ] Piping a file containing the token: works identically to echo piping.
- [ ] Piping from a secret manager (`vault read ... | codeplane auth login --with-token`): works as expected.
- [ ] Running `--with-token` without piping stdin (interactive TTY): blocks until user types token and sends EOF (Ctrl-D); no special TTY prompt is displayed for this flow.
- [ ] Multiple tokens on separate lines: the entire stdin is trimmed as one blob — if it doesn't match the format after trim, it's rejected.
- [ ] `--with-token` combined with `--hostname example.com`: token stored under `example.com` host key.
- [ ] `--with-token` with `--hostname` pointing to a loopback address: uses `http://` scheme (not `https://`).
- [ ] `--with-token` when keyring is locked or unavailable: raises `SecureStorageUnavailableError`.
- [ ] Running login twice with different tokens for the same host: second token replaces the first.
- [ ] Running login with the same token for different hosts: both hosts store independent copies.

## Design

### CLI Command

**Command signature:**

```
codeplane auth login --with-token [--hostname <HOST>] [--json]
```

**Flags:**

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--with-token` | boolean | Yes (for this flow) | `false` | Switches from browser OAuth to stdin token mode |
| `--hostname` | string | No | Configured default host | Codeplane instance hostname or full API URL |
| `--json` | boolean | No | `false` | Output structured JSON instead of human-readable text |

**Standard usage patterns:**

```bash
# Basic: pipe token from echo
echo "codeplane_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2" | codeplane auth login --with-token

# From environment variable
echo "$MY_CODEPLANE_TOKEN" | codeplane auth login --with-token

# From a secret manager
vault kv get -field=token secret/codeplane | codeplane auth login --with-token

# Targeting a specific host
echo "$TOKEN" | codeplane auth login --with-token --hostname codeplane.example.com

# Targeting a loopback daemon
echo "$TOKEN" | codeplane auth login --with-token --hostname localhost:3000

# JSON output for scripting
echo "$TOKEN" | codeplane auth login --with-token --json
```

**Successful output (human-readable, on stderr):**

```
Logged in to codeplane.example.com via keyring
```

**Successful output (JSON, on stdout):**

```json
{
  "status": "logged_in",
  "host": "codeplane.example.com",
  "token_source": "keyring",
  "message": "Logged in to codeplane.example.com via keyring"
}
```

**Error output (stderr, exit code 1):**

```
Error: no token provided on stdin
```

or

```
Error: Invalid token. Tokens must start with "codeplane_".
```

or

```
Error: Secure credential storage is unavailable. Use CODEPLANE_TOKEN for headless or CI workflows.
```

### Relationship to Other Auth Commands

After `codeplane auth login --with-token` succeeds:

- `codeplane auth status` reports `logged_in: true`, `token_source: "keyring"`, and resolves the username by calling `GET /api/user`.
- `codeplane auth token` prints the stored token to stdout.
- `codeplane auth logout` clears the stored token from the keyring.
- All domain commands (`repo`, `issue`, `land`, `workflow`, etc.) authenticate using the stored token via `Authorization: token <token>` header.

### SDK Shape

The CLI delegates to the following SDK/utility functions:

- `validateToken(input: string): string` — trims input, checks for emptiness, verifies `codeplane_` prefix, returns cleaned token or throws.
- `persistAuthToken(token: string, options?: { hostname?: string }): AuthTarget` — resolves the target host, stores the token in the credential backend, updates config, clears legacy tokens.
- `resolveAuthTarget(options?: { hostname?: string }): AuthTarget` — determines `apiUrl` and `host` from the hostname option or config defaults.
- `storeToken(host: string, token: string): void` — writes to the platform-specific credential backend.

### Documentation

The following end-user documentation should be written:

1. **CLI Reference — `codeplane auth login`**: Document the `--with-token` flag, its purpose, all flags, and at least three usage examples (basic echo, secret manager, multi-host).

2. **Authentication Guide — "Non-Interactive Login"**: A section in the auth guide explaining when and why to use stdin token login (CI/CD, headless servers, scripting), how to create a PAT first, and how to pipe it.

3. **CI/CD Integration Guide**: A dedicated section showing how to configure popular CI systems (GitHub Actions, GitLab CI, generic) to authenticate the Codeplane CLI using `--with-token` with secrets from the CI environment.

4. **Troubleshooting — Auth Errors**: Document the three error messages (`no token provided on stdin`, `Invalid token`, `Secure credential storage is unavailable`) with resolution steps for each.

## Permissions & Security

### Authorization Roles

- **Any user (including unauthenticated)** can invoke `codeplane auth login --with-token`. The command itself does not require prior authentication — it is the mechanism by which authentication is established.
- The token being piped must belong to an active, non-login-prohibited user. The CLI does not verify this at login time (no network call), but the first subsequent authenticated API call will fail with `401` if the user is inactive or prohibited.

### Rate Limiting

- No network request is made during `--with-token` login, so server-side rate limiting does not apply to the login action itself.
- The stored token is subject to normal per-endpoint rate limiting on all subsequent API calls.
- Credential storage operations are naturally rate-limited by OS keyring I/O; no additional application-level rate limit is necessary.

### Security Constraints

- **Token never logged**: The raw token must never appear in CLI log output, structured logs, or error messages. Only the `codeplane_` prefix and masked/truncated representations are acceptable in diagnostics.
- **Token in memory**: The token is held in process memory only for the duration of the `readStdinWithTimeout` → `validateToken` → `persistAuthToken` flow. No global variable or cache retains it.
- **Credential file permissions**: When using the test file backend, the credential file is written with `0o600` (owner-read/write only).
- **No query-string fallback**: The CLI must never send the token as a URL query parameter.
- **Stdin over pipe, not argv**: The token is read from stdin, not from a command-line argument. This prevents the token from appearing in `ps` output, shell history, or `/proc/*/cmdline`.
- **Keyring isolation**: Tokens are stored per-host, preventing a token intended for one Codeplane instance from being sent to a different instance.
- **Environment variable precedence**: If `CODEPLANE_TOKEN` is set, it takes priority over the keyring token at authentication time. The user should be aware that `--with-token` stores to keyring but does not override `CODEPLANE_TOKEN`.

### PII / Data Privacy

- The token itself is a credential, not PII, but it grants access to PII (user data, repos, issues). Treat it with the same sensitivity as a password.
- The hostname stored in config and keyring metadata is not PII.
- No user-identifying information is transmitted or stored beyond the token and host during this flow.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `cli.auth.stdin_token_login.attempted` | When `--with-token` code path is entered | `host`, `has_hostname_flag`, `cli_version`, `platform` |
| `cli.auth.stdin_token_login.succeeded` | After token is validated and stored | `host`, `token_source: "keyring"`, `has_hostname_flag`, `cli_version`, `platform`, `credential_backend` |
| `cli.auth.stdin_token_login.failed` | When validation or storage fails | `host`, `error_type` (`empty_stdin`, `invalid_prefix`, `storage_unavailable`), `cli_version`, `platform` |

**Property definitions:**

- `host`: The resolved target hostname (e.g., `codeplane.example.com`). Never includes the token.
- `has_hostname_flag`: Boolean — whether `--hostname` was explicitly provided.
- `cli_version`: The Codeplane CLI version string.
- `platform`: `darwin`, `linux`, or `win32`.
- `credential_backend`: `keychain` (macOS), `secret_service` (Linux), `credential_locker` (Windows), or `test_file`.
- `error_type`: Categorized failure reason.

### Funnel Metrics

| Metric | Description | Success Indicator |
|--------|-------------|-------------------|
| Stdin login attempt rate | How many users attempt `--with-token` login per day/week | Growing or stable adoption |
| Stdin login success rate | `succeeded / attempted` ratio | > 95% indicates clear UX and docs |
| Error distribution | Breakdown of `error_type` across failures | `empty_stdin` should be lowest; `storage_unavailable` indicates platform gaps |
| Subsequent auth success rate | First authenticated API call after stdin login | > 99% indicates tokens are valid at time of storage |
| Stdin vs browser login ratio | Proportion of CLI logins using `--with-token` vs browser | Tracks CI/automation adoption |

## Observability

### Logging Requirements

All log entries are structured JSON. The token value must **never** appear in log output.

| Log Point | Level | Structured Context | Notes |
|-----------|-------|-------------------|-------|
| Stdin token login initiated | `info` | `{ event: "auth.stdin_login.start", host }` | Logged when `--with-token` path is entered |
| Token validated successfully | `debug` | `{ event: "auth.stdin_login.validated", host, token_prefix: "codeplane_" }` | Never log token body |
| Token stored in keyring | `info` | `{ event: "auth.stdin_login.stored", host, backend }` | `backend` = keychain/secret_service/credential_locker/test_file |
| Legacy token cleared | `debug` | `{ event: "auth.stdin_login.legacy_cleared", host }` | Only when a legacy config token existed |
| Validation failed: empty | `warn` | `{ event: "auth.stdin_login.failed", host, reason: "empty_stdin" }` | |
| Validation failed: bad prefix | `warn` | `{ event: "auth.stdin_login.failed", host, reason: "invalid_prefix" }` | |
| Keyring storage failed | `error` | `{ event: "auth.stdin_login.failed", host, reason: "storage_unavailable", error_message }` | Include backend error message |
| Stdin read timeout | `warn` | `{ event: "auth.stdin_login.failed", host, reason: "stdin_timeout" }` | If timeout variant is used |

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_cli_auth_stdin_login_total` | Counter | `status` (`success`, `error`), `host`, `platform` | Total stdin token login attempts |
| `codeplane_cli_auth_stdin_login_errors_total` | Counter | `reason` (`empty_stdin`, `invalid_prefix`, `storage_unavailable`, `stdin_timeout`), `platform` | Error breakdown |
| `codeplane_cli_auth_stdin_login_duration_seconds` | Histogram | `platform` | Time from command entry to completion (buckets: 0.01, 0.05, 0.1, 0.5, 1, 5) |

### Alerts

**Alert 1: Elevated stdin login failure rate**

- **Condition**: `rate(codeplane_cli_auth_stdin_login_errors_total[5m]) / rate(codeplane_cli_auth_stdin_login_total[5m]) > 0.3` sustained for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check the `reason` label breakdown: is it dominated by `invalid_prefix`, `empty_stdin`, or `storage_unavailable`?
  2. If `invalid_prefix`: Check if a documentation change or API update changed the token format. Verify `codeplane_` prefix is still correct. Check if users are accidentally piping OAuth tokens or other credential types.
  3. If `empty_stdin`: Check CI pipeline configurations — a common cause is a missing or empty secret variable. Verify documentation examples are correct.
  4. If `storage_unavailable`: Check if a platform OS update broke keyring integration. Verify `security` (macOS), `secret-tool` (Linux), or `pwsh`/`powershell` (Windows) are available in the affected environments. Confirm the documentation recommends `CODEPLANE_TOKEN` as a fallback.
  5. Check recent CLI releases for regressions in the auth command.

**Alert 2: Keyring storage errors spike**

- **Condition**: `rate(codeplane_cli_auth_stdin_login_errors_total{reason="storage_unavailable"}[15m]) > 5`
- **Severity**: Warning
- **Runbook**:
  1. Identify affected platforms from the `platform` label.
  2. For macOS: verify `security` binary exists and Keychain Access is not locked. Check if the user is running in a non-interactive shell (e.g., `launchd`) where Keychain may not be unlocked.
  3. For Linux: verify `secret-tool` is installed and a Secret Service daemon (e.g., `gnome-keyring-daemon`) is running. Check for D-Bus session availability.
  4. For Windows: verify PowerShell is available and `Windows.Security.Credentials` WinRT type is accessible.
  5. Ensure the error message in CLI output clearly guides users to the `CODEPLANE_TOKEN` environment variable alternative.

### Error Cases and Failure Modes

| Error Case | Behavior | Exit Code |
|------------|----------|----------|
| Stdin is empty after trim | Print `"no token provided on stdin"` to stderr | 1 |
| Token missing `codeplane_` prefix | Print `'Invalid token. Tokens must start with "codeplane_".'` to stderr | 1 |
| Keyring backend unavailable | Print `"Secure credential storage is unavailable..."` to stderr | 1 |
| Keyring write fails (permission, locked) | Print platform-specific error message to stderr | 1 |
| Stdin read times out (if timeout is used) | Print `"Timed out waiting for token on stdin."` to stderr | 1 |
| Hostname resolution fails (empty string) | Print `"Hostname is required."` to stderr | 1 |
| Config file is corrupted/unreadable | Print config parse error to stderr | 1 |

## Verification

### API Integration Tests

These tests validate that a token stored via `--with-token` is subsequently usable for API authentication.

- [ ] **Valid token → API call succeeds**: Pipe a valid PAT via `--with-token`, then run `codeplane auth status` and verify `logged_in: true` and correct username from the server.
- [ ] **Valid token → subsequent CLI commands authenticate**: After `--with-token` login, run `codeplane repo list --json` and verify a successful `200` response.
- [ ] **Revoked token → API call fails after login**: Pipe a valid PAT, revoke it via the API, then verify `codeplane auth status` reports `logged_in: false` with an invalid/expired token message.
- [ ] **Token for wrong host → not used for default host**: Pipe a token with `--hostname other.example.com`, then verify `codeplane auth status` (without `--hostname`) does not use that token for the default host.

### CLI E2E Tests

These tests validate the full CLI command behavior end-to-end.

**Happy path tests:**

- [ ] **Basic stdin login**: `echo "codeplane_<valid-40-hex>" | codeplane auth login --with-token` exits with code 0 and outputs JSON with `status: "logged_in"`.
- [ ] **Login with hostname flag**: `echo "$TOKEN" | codeplane auth login --with-token --hostname my.codeplane.com` stores token under `my.codeplane.com`.
- [ ] **Login with loopback hostname**: `echo "$TOKEN" | codeplane auth login --with-token --hostname localhost:3000` stores token and resolves API URL as `http://localhost:3000`.
- [ ] **Login with full API URL as hostname**: `echo "$TOKEN" | codeplane auth login --with-token --hostname https://api.codeplane.example.com` stores token under the resolved host.
- [ ] **JSON output mode**: `echo "$TOKEN" | codeplane auth login --with-token --json` outputs valid JSON with `status`, `host`, `token_source`, and `message` fields.
- [ ] **Token with trailing newline**: `printf "codeplane_<valid-40-hex>\n" | codeplane auth login --with-token` succeeds (newline is trimmed).
- [ ] **Token with surrounding whitespace**: `echo "  codeplane_<valid-40-hex>  " | codeplane auth login --with-token` succeeds (whitespace is trimmed).
- [ ] **Overwrite existing token**: Run `--with-token` twice with different tokens for the same host; verify `codeplane auth token` prints the second token.
- [ ] **Token from file**: `cat token-file.txt | codeplane auth login --with-token` works correctly.
- [ ] **Token from heredoc**: `codeplane auth login --with-token <<< "codeplane_<valid-40-hex>"` works correctly.
- [ ] **Maximum valid token length (46 chars)**: `echo "codeplane_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" | codeplane auth login --with-token` succeeds.

**Error path tests:**

- [ ] **Empty stdin**: `echo "" | codeplane auth login --with-token` exits non-zero with `"no token provided on stdin"`.
- [ ] **Whitespace-only stdin**: `echo "   " | codeplane auth login --with-token` exits non-zero with `"no token provided on stdin"`.
- [ ] **No stdin (EOF immediately)**: `echo -n "" | codeplane auth login --with-token` exits non-zero with `"no token provided on stdin"`.
- [ ] **Token without prefix**: `echo "abc123def456" | codeplane auth login --with-token` exits non-zero with `'Invalid token. Tokens must start with "codeplane_".'`.
- [ ] **Token with wrong prefix**: `echo "github_pat_abc123" | codeplane auth login --with-token` exits non-zero with the invalid prefix error.
- [ ] **Token that is just the prefix**: `echo "codeplane_" | codeplane auth login --with-token` — accepted by CLI (prefix check passes); server will reject on first use.
- [ ] **Binary data on stdin**: Pipe non-UTF-8 binary content — exits non-zero with an appropriate error.
- [ ] **Stdin exceeding 1024 bytes**: Pipe a string longer than 1024 bytes — verify it is rejected or handled gracefully.
- [ ] **Multiple lines with token on first line**: `printf "codeplane_<valid>\nextra\n" | codeplane auth login --with-token` — rejected since the full trimmed content doesn't match a single token format.
- [ ] **No credential backend available**: Set `CODEPLANE_DISABLE_SYSTEM_KEYRING=1` and run `--with-token` — exits non-zero with `SecureStorageUnavailableError` message.

**Credential storage tests:**

- [ ] **Test file backend**: Set `CODEPLANE_TEST_CREDENTIAL_STORE_FILE=/tmp/test-creds.json`, pipe a valid token, verify the file contains the token keyed by host.
- [ ] **Test file permissions**: After writing to test file backend, verify file permissions are `0o600`.
- [ ] **Host key normalization**: Pipe tokens with hostname `EXAMPLE.COM` and `example.com` — both should resolve to the same key in the credential store.
- [ ] **Legacy token cleared**: Set a legacy token in config, then login via `--with-token` — verify the legacy token is removed from config.
- [ ] **Config api_url updated**: After `--with-token` with `--hostname`, verify the config file's `api_url` is updated.

**Cross-command integration tests:**

- [ ] **Login then status**: `--with-token` login, then `codeplane auth status --json` shows `logged_in: true`, `token_source: "keyring"`.
- [ ] **Login then token print**: `--with-token` login, then `codeplane auth token` prints the exact token that was piped.
- [ ] **Login then logout then status**: `--with-token` login, `codeplane auth logout`, then `codeplane auth status --json` shows `logged_in: false`.
- [ ] **Login then logout then token**: `--with-token` login, `codeplane auth logout`, then `codeplane auth token` errors with no token found.
- [ ] **CODEPLANE_TOKEN env overrides keyring**: After `--with-token` login, set `CODEPLANE_TOKEN` env var to a different token, then `codeplane auth token` returns the env var token.
- [ ] **Login does not verify token on server**: Mock/disconnect the network, pipe a valid-format token — login should still succeed (no network call).

**Platform-specific tests (where CI environments allow):**

- [ ] **macOS Keychain storage**: Verify token round-trips through `security add-generic-password` / `security find-generic-password`.
- [ ] **Linux Secret Service storage**: Verify token round-trips through `secret-tool store` / `secret-tool lookup`.
- [ ] **Windows Credential Locker storage**: Verify token round-trips through PowerShell PasswordVault.
