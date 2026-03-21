# AUTH_CLI_LOGOUT

Specification for AUTH_CLI_LOGOUT.

## High-Level User POV

When a developer is done working with Codeplane from the command line — or wants to switch accounts, rotate credentials, or simply clean up auth state on a shared machine — they run `codeplane auth logout`. This single command removes the locally stored access token from the operating system's secure credential store and confirms the action. The user sees which host they were logged out from and whether a credential was actually removed.

The experience is intentionally simple and safe. If the user runs `codeplane auth logout` when they are already logged out, it succeeds without error — there is nothing to undo, and the CLI does not punish the user for being cautious. If the user has been authenticating via the `CODEPLANE_TOKEN` environment variable rather than a stored keyring token, the CLI warns them that their environment variable will continue to authenticate requests until they unset it or close the shell. This prevents the subtle surprise of thinking you're logged out while your shell still carries a live credential.

For developers who work against multiple Codeplane instances — a self-hosted server at work and the public codeplane.app service, for example — the `--hostname` flag lets them log out of one host without disturbing their credentials for the other. Each host's token is stored and managed independently.

CLI logout is a purely local operation. It does not contact the Codeplane server. The access token that was stored locally remains valid server-side until it expires or is explicitly revoked through `codeplane auth token revoke` or the web UI's token management page. This design is deliberate: logging out of the CLI should always work, even if the server is unreachable. Users who need to invalidate the server-side token should use the separate revocation flow.

After logging out, any subsequent CLI command that requires authentication — listing repositories, creating issues, managing workflows — will fail with a clear message directing the user to run `codeplane auth login` or set `CODEPLANE_TOKEN`. The user is never left in an ambiguous state.

The value of CLI logout is trust and hygiene. Users trust that they can reliably end a CLI session, that shared machines do not retain stale credentials in the keyring, and that multi-host setups can be managed precisely.

## Acceptance Criteria

### Definition of Done

- [ ] `codeplane auth logout` deletes the stored access token from the OS-native credential store (macOS Keychain, Linux Secret Service, or Windows PasswordVault) for the resolved host.
- [ ] `codeplane auth logout` scrubs any legacy token stored in the config file (`~/.config/codeplane/config.toon` or equivalent XDG path) for the resolved host.
- [ ] `codeplane auth logout` returns exit code `0` on success, including when no token was stored (idempotent no-op).
- [ ] `codeplane auth logout` returns exit code `1` only when an unexpected credential store error occurs (e.g., keyring backend crashes).
- [ ] `codeplane auth logout` displays a human-readable confirmation message: `Logged out from <host>`.
- [ ] `codeplane auth logout` displays a warning when `CODEPLANE_TOKEN` environment variable is set: `Logged out from <host>. CODEPLANE_TOKEN env is still active for this shell.`
- [ ] `codeplane auth logout --json` returns structured JSON output with `status`, `host`, `cleared`, and `message` fields.
- [ ] `codeplane auth logout --hostname <host>` clears the token for the specified host only, leaving tokens for other hosts untouched.
- [ ] `codeplane auth logout` does NOT make any HTTP request to the Codeplane server. It is entirely client-side.
- [ ] `codeplane auth logout` does NOT invalidate the server-side token. The token remains valid until it expires or is explicitly revoked.
- [ ] `codeplane auth status` reports "Not logged in" after a successful logout (assuming `CODEPLANE_TOKEN` is not set).
- [ ] Any CLI command requiring authentication fails with a clear error after logout, directing the user to `codeplane auth login` or `CODEPLANE_TOKEN`.
- [ ] Shell completions for `codeplane auth logout` are available in bash, zsh, and fish.

### Edge Cases

- [ ] Logout when no token is stored in the keyring succeeds with exit code `0` and `cleared: false`.
- [ ] Logout when the keyring backend is disabled (`CODEPLANE_DISABLE_SYSTEM_KEYRING=1`) succeeds with exit code `0` and `cleared: false`.
- [ ] Logout when the keyring backend binary is missing (e.g., `secret-tool` not installed on Linux) succeeds with exit code `0` and `cleared: false`.
- [ ] Logout when the keyring backend throws an unexpected error (e.g., macOS Keychain locked, D-Bus failure on Linux) returns exit code `1` with a descriptive error message.
- [ ] Logout when only a legacy config-file token exists scrubs the legacy token and reports `cleared: true`.
- [ ] Logout when both a keyring token and a legacy config-file token exist clears both.
- [ ] Logout when `CODEPLANE_TOKEN` is set to an empty or whitespace-only string does NOT display the env var warning.
- [ ] Logout when `CODEPLANE_TOKEN` is set to a non-empty value displays the env var warning, even if the keyring was already empty.
- [ ] Logout with `--hostname` set to a URL (e.g., `https://api.myhost.com`) correctly normalizes and resolves the host.
- [ ] Logout with `--hostname` set to a loopback address (e.g., `localhost:3000`) correctly targets that host.
- [ ] Logout with `--hostname` set to an empty string fails with a descriptive error.
- [ ] Logout with `--hostname` set to a host that has no stored token succeeds with `cleared: false`.
- [ ] Running logout twice in succession produces the same structured output shape both times (idempotent).
- [ ] Logout does not modify or delete the config file's `api_url`, `git_protocol`, or `agent_issue_repo` fields.

### Boundary Constraints

- [ ] Hostname input: any valid hostname or URL string; no maximum length enforced by the CLI itself (delegated to URL parsing).
- [ ] Keyring service name: `codeplane-cli` (constant, not configurable).
- [ ] Host normalization: hostnames are lowercased and trimmed; `api.` prefix is stripped (e.g., `api.codeplane.app` → `codeplane.app`).
- [ ] Config file path: resolved via `XDG_CONFIG_HOME` / platform defaults; max path length is OS-dependent.
- [ ] JSON output: always includes exactly `status` (string), `host` (string), `cleared` (boolean), and `message` (string).
- [ ] The `cleared` field in JSON output is the logical OR of keyring-cleared and legacy-cleared (true if either had a token that was removed).

## Design

### CLI Command

```
codeplane auth logout [--hostname <host>] [--json]
```

**Arguments:**

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--hostname` | `string` | No | Resolved from config or default (`codeplane.app`) | The hostname or API URL to clear credentials for |
| `--json` | `boolean` | No | `false` | Output machine-parseable JSON instead of human-readable text |

**Behavior:**

1. Resolve the target host using the following priority:
   - If `--hostname` is provided, use it (normalizing URLs and stripping `api.` prefix).
   - Otherwise, read `api_url` from the config file.
   - If no config exists, fall back to the default API URL (`https://api.codeplane.app`).
2. Delete the stored token from the OS-native credential store for the normalized host.
3. Scrub any legacy token from the config file if the config file's `api_url` matches the resolved host.
4. Compute the `cleared` result: `true` if either the keyring or legacy token was removed.
5. Check whether `CODEPLANE_TOKEN` is set and non-empty in the current environment.
6. Return the result.

**Human-readable output (default):**

```
Logged out from codeplane.app
```

or, if `CODEPLANE_TOKEN` is set:

```
Logged out from codeplane.app. CODEPLANE_TOKEN env is still active for this shell.
```

**Structured JSON output (`--json`):**

```json
{
  "status": "logged_out",
  "host": "codeplane.app",
  "cleared": true,
  "message": "Logged out from codeplane.app"
}
```

or, with `CODEPLANE_TOKEN` set:

```json
{
  "status": "logged_out",
  "host": "codeplane.app",
  "cleared": true,
  "message": "Logged out from codeplane.app. CODEPLANE_TOKEN env is still active for this shell."
}
```

**Exit codes:**

| Code | Meaning |
|------|--------|
| `0` | Logout completed (token removed, or no token was stored) |
| `1` | Unexpected error (credential store failure) |

**Relationship to other auth commands:**

| Command | Effect |
|---------|--------|
| `codeplane auth login` | Stores a token in the keyring (reverse of logout) |
| `codeplane auth logout` | Clears the stored token from the keyring (this feature) |
| `codeplane auth status` | Reports whether a token is available (should report "Not logged in" after logout, unless `CODEPLANE_TOKEN` is set) |
| `codeplane auth token` | Prints the active token (should error after logout, unless `CODEPLANE_TOKEN` is set) |

### SDK Shape

The CLI logout operation uses the following functions from the shared CLI SDK:

```typescript
// auth-state.ts
function clearAuthToken(
  options?: { apiUrl?: string; hostname?: string }
): AuthTarget & { cleared: boolean; legacy_cleared: boolean };

// credentials.ts
function deleteStoredToken(host: string): boolean;
```

`clearAuthToken` is the entry point. It:
1. Calls `resolveAuthTarget` to normalize the host.
2. Calls `deleteStoredToken` to remove the keyring entry.
3. Calls `scrubLegacyTokenIfCurrentHost` to remove any config-file token.
4. Returns the composite result.

`deleteStoredToken` is the credential store interface. It:
1. Resolves the backend (macOS, Linux, Windows, or test file).
2. Returns `false` if no backend is available.
3. Calls `backend.delete(normalizedHost)`.
4. Returns `true` if a credential was deleted, `false` if none existed.

### Test Credential Store

For E2E and integration testing, the credential store can be redirected to a plain JSON file by setting `CODEPLANE_TEST_CREDENTIAL_STORE_FILE` to a file path. This file is created with `0o600` permissions and stores host→token mappings. The test backend supports the same `get`/`set`/`delete` interface as the OS-native backends.

### Documentation

End-user documentation should include:

1. **CLI Auth Logout** — Usage of `codeplane auth logout`, the `--hostname` flag for multi-host setups, the `--json` flag for scripting, and the distinction between clearing a local token vs. revoking a server-side token.
2. **Understanding CLI Auth State** — Where tokens are stored (OS keyring), how `CODEPLANE_TOKEN` environment variable overrides keyring tokens, and why logout does not contact the server.
3. **Multi-Host Credential Management** — How to log in/out of specific Codeplane instances using `--hostname`, and how the default host is resolved from the config file.
4. **Security Best Practices** — Guidance to log out on shared devices, use `codeplane auth token revoke` to invalidate server-side tokens, and avoid storing tokens in plaintext config files (legacy behavior that logout scrubs).
5. **Troubleshooting** — What to do if logout reports `cleared: false` unexpectedly (check `CODEPLANE_DISABLE_SYSTEM_KEYRING`, check that `secret-tool` or `security` is installed), and what the `CODEPLANE_TOKEN` warning means.

## Permissions & Security

### Authorization Roles

| Action | Required Role |
|--------|---------------|
| `codeplane auth logout` | Any local user — no server authentication required |

CLI logout is a client-side-only operation. It does not make any network request and therefore does not require any server-side authorization role. Any user who can execute the `codeplane` binary and access the OS keyring can run logout.

### Rate Limiting

No rate limiting applies. CLI logout is a local operation that does not contact the server. The OS credential store has its own access controls (keyring unlock prompts, D-Bus permissions, etc.) that provide natural rate limiting.

### Data Privacy and PII

- **Token values are never logged or printed** by the logout command. Only the host and boolean `cleared` status appear in output.
- **Legacy tokens are scrubbed from the config file** during logout, reducing the risk of plaintext credential exposure.
- **The config file is not deleted** — only the `token` field is removed. Other settings (`api_url`, `git_protocol`, `agent_issue_repo`) are preserved.
- **Keyring entries are deleted**, not overwritten. The OS credential store handles secure erasure according to platform conventions.
- **The `CODEPLANE_TOKEN` environment variable is not modified** — the CLI cannot alter the parent shell's environment. The warning message informs the user so they can take manual action.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `auth.cli.logout` | User runs `codeplane auth logout` | `host` (string — the target host), `cleared` (boolean — whether a token was actually removed), `had_env_token` (boolean — whether `CODEPLANE_TOKEN` was set), `legacy_cleared` (boolean — whether a legacy config token was scrubbed), `hostname_explicit` (boolean — whether `--hostname` was provided) |

### Funnel Metrics and Success Indicators

1. **CLI Logout-Login Cycle Time**: Median time between `auth.cli.logout` and the next `auth.cli.login` for the same host — indicates whether users are quickly switching accounts (short cycle) or permanently logging out (long or no follow-up login).
2. **CLI Token Hygiene**: Ratio of `auth.cli.logout` events with `cleared: true` vs. `cleared: false` — a persistently high `false` rate suggests users are confused about their auth state or running logout redundantly.
3. **CODEPLANE_TOKEN Warning Rate**: Percentage of `auth.cli.logout` events with `had_env_token: true` — indicates how many users rely on environment variable auth and may be surprised that logout does not fully de-authenticate.
4. **Legacy Token Scrub Rate**: Percentage of `auth.cli.logout` events with `legacy_cleared: true` — tracks migration progress away from plaintext config tokens. Should trend toward 0% over time.
5. **Multi-Host Usage**: Percentage of `auth.cli.logout` events with `hostname_explicit: true` — indicates adoption of multi-host workflows.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|-------------------|
| CLI logout executed | `INFO` | `host`, `cleared`, `legacy_cleared`, `had_env_token`, `hostname_explicit` |
| CLI logout no backend available | `DEBUG` | `host`, `platform`, `keyring_disabled` |
| CLI logout keyring delete succeeded | `DEBUG` | `host` |
| CLI logout keyring delete no-op (no credential) | `DEBUG` | `host` |
| CLI logout legacy token scrubbed | `INFO` | `host` |
| CLI logout keyring error | `ERROR` | `host`, `error_message`, `platform`, `backend_type` |

**CRITICAL:** Token values must NEVER appear in logs. Only the host, platform, and boolean status may be logged.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_cli_logout_total` | Counter | `cleared` (true, false), `had_env_token` (true, false) | Total CLI logout operations by outcome |
| `codeplane_cli_logout_legacy_scrub_total` | Counter | — | Total legacy config-file tokens scrubbed during logout |
| `codeplane_cli_logout_errors_total` | Counter | `platform` (darwin, linux, win32), `error_type` (keyring_locked, backend_missing, io_error, unknown) | Total CLI logout errors by platform and type |

### Alerts and Runbooks

#### Alert: `CLILogoutErrorRateSpikeAlert`
- **Condition**: `rate(codeplane_cli_logout_errors_total[1h]) > 10`
- **Severity**: Info
- **Runbook**:
  1. This alert fires if aggregated CLI telemetry (opt-in) reports a spike in logout errors.
  2. Check the `platform` and `error_type` labels to identify whether the issue is platform-specific.
  3. For `keyring_locked` on macOS: Users may have changed their Keychain settings or are running in a remote session where the Keychain agent is unavailable. No server action needed — document workaround (`CODEPLANE_DISABLE_SYSTEM_KEYRING=1`).
  4. For `backend_missing` on Linux: Users may not have `secret-tool` installed. Update installation docs to include `libsecret-tools` as a recommended dependency.
  5. For `io_error` on Windows: Check if a Windows update changed PasswordVault API behavior. Review PowerShell command compatibility.
  6. If errors are across all platforms, check if a CLI update introduced a regression in the credential backend resolution logic.

### Error Cases and Failure Modes

| Error Case | Behavior | Exit Code |
|------------|----------|----------|
| No keyring backend available (headless server, `CODEPLANE_DISABLE_SYSTEM_KEYRING=1`) | Logout succeeds as no-op, `cleared: false` | `0` |
| Keyring backend binary missing (`security`, `secret-tool`, `pwsh`) | Logout succeeds as no-op, `cleared: false` | `0` |
| Keyring backend crashes or times out | Error message with platform-specific context | `1` |
| macOS Keychain is locked and unlock prompt is declined | Error message: `Failed to delete token from macOS Keychain: ...` | `1` |
| Linux D-Bus / Secret Service unavailable | Error message: `Failed to delete token from Secret Service: ...` | `1` |
| Windows PasswordVault API failure | Error message: `Failed to delete token from Windows Credential Locker: ...` | `1` |
| `--hostname` is empty string | Error: `Hostname is required.` | `1` |
| Config file is corrupted / unparseable YAML | Falls back to default host, proceeds with logout | `0` |
| Config file directory has restrictive permissions (cannot scrub legacy token) | Keyring credential cleared, legacy scrub fails with filesystem error | `1` |
| Test credential store file has invalid JSON | Error: `Invalid credential store file: <path>` | `1` |

## Verification

### CLI Integration Tests

#### Core Logout Flow
- [ ] `cli: codeplane auth logout returns exit code 0 when a token is stored`
- [ ] `cli: codeplane auth logout returns exit code 0 when no token is stored (no-op)`
- [ ] `cli: codeplane auth logout actually removes the token from the credential store (verified by subsequent loadStoredToken returning null)`
- [ ] `cli: codeplane auth logout --json returns JSON with exactly status, host, cleared, and message fields`
- [ ] `cli: codeplane auth logout --json status field is always "logged_out"`
- [ ] `cli: codeplane auth logout --json cleared is true when a token was present and removed`
- [ ] `cli: codeplane auth logout --json cleared is false when no token was stored`
- [ ] `cli: codeplane auth logout human-readable output includes the target host name`
- [ ] `cli: codeplane auth status reports "Not logged in" after codeplane auth logout`
- [ ] `cli: codeplane auth token fails with clear error after codeplane auth logout`
- [ ] `cli: CLI commands requiring auth (e.g., codeplane repo list) fail with descriptive error after logout`

#### Environment Variable Warning
- [ ] `cli: codeplane auth logout warns about CODEPLANE_TOKEN when CODEPLANE_TOKEN is set to a non-empty value`
- [ ] `cli: codeplane auth logout does NOT warn about CODEPLANE_TOKEN when CODEPLANE_TOKEN is unset`
- [ ] `cli: codeplane auth logout does NOT warn about CODEPLANE_TOKEN when CODEPLANE_TOKEN is set to empty string`
- [ ] `cli: codeplane auth logout does NOT warn about CODEPLANE_TOKEN when CODEPLANE_TOKEN is set to whitespace-only string`
- [ ] `cli: codeplane auth logout message field in JSON includes CODEPLANE_TOKEN warning text when env var is set`
- [ ] `cli: codeplane auth status still reports "Logged in" after logout if CODEPLANE_TOKEN is set (env var takes priority)`

#### Hostname Flag
- [ ] `cli: codeplane auth logout --hostname specific.host.com clears token for that host`
- [ ] `cli: codeplane auth logout --hostname specific.host.com does not affect tokens for other hosts`
- [ ] `cli: codeplane auth logout --hostname https://api.myhost.com normalizes to myhost.com`
- [ ] `cli: codeplane auth logout --hostname api.myhost.com normalizes to myhost.com`
- [ ] `cli: codeplane auth logout --hostname localhost:3000 targets localhost:3000`
- [ ] `cli: codeplane auth logout --hostname 127.0.0.1:8080 targets loopback address`
- [ ] `cli: codeplane auth logout --hostname [::1]:3000 targets IPv6 loopback`
- [ ] `cli: codeplane auth logout --hostname HOST with no stored token for HOST returns cleared: false, exit code 0`
- [ ] `cli: codeplane auth logout --hostname "" fails with descriptive error`

#### Idempotency
- [ ] `cli: running codeplane auth logout twice in succession both return exit code 0`
- [ ] `cli: running codeplane auth logout twice: first returns cleared: true, second returns cleared: false`
- [ ] `cli: JSON output shape is identical between first and second logout (same keys, same types)`

#### Legacy Token Handling
- [ ] `cli: codeplane auth logout scrubs legacy token from config file when present`
- [ ] `cli: codeplane auth logout preserves api_url, git_protocol, and agent_issue_repo in config file after scrubbing legacy token`
- [ ] `cli: codeplane auth logout with both keyring token and legacy config token clears both and reports cleared: true`
- [ ] `cli: codeplane auth logout with only legacy config token (no keyring) reports cleared: true`

#### No Server Contact
- [ ] `cli: codeplane auth logout completes successfully when the server is unreachable (no network request made)`
- [ ] `cli: codeplane auth logout does not make any HTTP requests (verified by intercepting/mocking fetch)`

#### Credential Store Backend Edge Cases
- [ ] `cli: codeplane auth logout with CODEPLANE_DISABLE_SYSTEM_KEYRING=1 returns cleared: false, exit code 0`
- [ ] `cli: codeplane auth logout with CODEPLANE_TEST_CREDENTIAL_STORE_FILE uses the test file backend`
- [ ] `cli: codeplane auth logout with test credential store file that has a token removes the token`
- [ ] `cli: codeplane auth logout with test credential store file that is empty JSON ({}) returns cleared: false`
- [ ] `cli: codeplane auth logout with test credential store file preserves tokens for other hosts`

#### Login-Logout Roundtrip
- [ ] `cli: full login → status (logged in) → logout → status (not logged in) roundtrip`
- [ ] `cli: full login → logout → login → status (logged in) roundtrip (re-login works after logout)`

### End-to-End (E2E) Tests — CLI

- [ ] `e2e/cli: codeplane auth logout succeeds when authenticated (exit code 0)`
- [ ] `e2e/cli: codeplane auth logout succeeds without a token (exit code 0, no-op)`
- [ ] `e2e/cli: codeplane auth logout --json returns valid JSON with all required fields`
- [ ] `e2e/cli: codeplane auth logout followed by codeplane repo list fails with auth error`
- [ ] `e2e/cli: codeplane auth logout followed by codeplane auth status shows not logged in`
- [ ] `e2e/cli: codeplane auth logout --hostname nonexistent.host returns exit code 0 with cleared: false`
- [ ] `e2e/cli: codeplane auth login --with-token followed by codeplane auth logout followed by codeplane auth status shows complete roundtrip`

### End-to-End (E2E) Tests — API Interaction Verification

- [ ] `e2e/api: after CLI logout, the server-side token remains valid (logout is client-side only) — verify by using the same token value via curl`
- [ ] `e2e/api: after CLI logout AND codeplane auth token revoke, the server-side token is invalid`

### Security-Focused Tests

- [ ] `security: codeplane auth logout output never contains the token value, only the host and cleared status`
- [ ] `security: codeplane auth logout --json output never contains the token value`
- [ ] `security: the test credential store file is created with 0o600 permissions (owner read/write only)`
- [ ] `security: after logout, the keyring entry is fully removed (not just overwritten with empty string)`
- [ ] `security: after logout of legacy config token, the config file does not contain a "token" key`

### Shell Completion Tests

- [ ] `completion: bash completion includes "logout" as a subcommand of "auth"`
- [ ] `completion: zsh completion includes "logout" as a subcommand of "auth"`
- [ ] `completion: fish completion includes "logout" as a subcommand of "auth"`
- [ ] `completion: bash completion for codeplane auth logout includes --hostname flag`
