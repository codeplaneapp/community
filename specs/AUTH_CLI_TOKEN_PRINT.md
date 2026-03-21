# AUTH_CLI_TOKEN_PRINT

Specification for AUTH_CLI_TOKEN_PRINT.

## High-Level User POV

When a developer has already authenticated the Codeplane CLI — whether through the browser-based OAuth flow, by piping a personal access token via stdin, or by setting the `CODEPLANE_TOKEN` environment variable — they sometimes need to retrieve and display the raw authentication token that the CLI is currently using. The `codeplane auth token` command serves exactly this purpose.

A developer might need the current token for several reasons. They may want to pipe it into another tool, inject it into a CI environment variable, pass it to a workspace session, or simply verify which credential the CLI is resolving and where it came from. Running `codeplane auth token` immediately prints the token to standard output and a brief source description to standard error, making it safe to compose in shell pipelines — the token goes to stdout, the human-readable metadata goes to stderr, so `codeplane auth token | pbcopy` cleanly copies just the token.

The command also supports JSON structured output via the `--json` flag, which returns the token, its source (environment variable, OS keyring, or legacy config file), and the host it targets. This is useful for scripting and automation where consumers need to programmatically extract the token or verify its provenance.

For developers who work with multiple Codeplane instances — for example a company self-hosted server and a personal instance — the `--hostname` flag lets them print the token for a specific host rather than the default. Each host's token is resolved independently.

If no token is found for the target host, the command exits with a clear error message suggesting that the user run `codeplane auth login` or set the `CODEPLANE_TOKEN` environment variable. There is no ambiguity: either a token is found and printed, or the user is told exactly what to do next.

The token resolution follows a strict priority order that the developer can rely on: the `CODEPLANE_TOKEN` environment variable is checked first, then the OS keyring, and finally the legacy config file. The source label in the output always tells the developer which layer the token came from, so they can reason about which credential will be used by other CLI commands.

This command is purely local and offline — it never makes network requests. This is the key distinction from `codeplane auth status`, which validates the token against the server. `codeplane auth token` prints whatever credential is stored, even if it has been revoked server-side, making it reliable for offline and air-gapped workflows.

## Acceptance Criteria

### Definition of Done

- A user can run `codeplane auth token` and see their current authentication token printed to stdout.
- The token source and host metadata are printed to stderr in human-readable mode.
- JSON structured output via `--json` returns `host`, `source`, and `token` fields.
- The `--hostname` flag resolves and prints the token for a specific Codeplane instance.
- If no token is found, the command exits non-zero with an actionable error message.
- The command works across macOS, Linux, and Windows.
- All token resolution sources (environment variable, keyring, legacy config) are correctly prioritized and labeled.
- Help text is accurate and discoverable via `codeplane auth token --help`.

### Functional Constraints

- [ ] Running `codeplane auth token` with no flags MUST print the token for the default configured host to stdout, followed by a newline.
- [ ] Token source metadata MUST be written to stderr, NOT stdout, to preserve pipeline composability.
- [ ] The stderr output format MUST be: `Token source: {source_label} ({host})\n`.
- [ ] The stdout output MUST be exactly the raw token string followed by a single newline character — no additional whitespace, prefixes, or decoration.
- [ ] Running `codeplane auth token --json` MUST output a JSON object to stdout with exactly three fields: `host` (string), `source` (string), and `token` (string).
- [ ] Running `codeplane auth token --hostname <host>` MUST resolve the token for the specified host instead of the default.
- [ ] If `--hostname` is provided as a full API URL (e.g., `https://api.example.com`), the host MUST be extracted from the URL.
- [ ] If `--hostname` is a bare hostname (e.g., `example.com`), the API URL MUST be derived as `https://api.example.com`.
- [ ] If `--hostname` is a loopback address (e.g., `localhost:3000`), the API URL MUST use `http://` scheme.
- [ ] Token resolution priority MUST be: (1) `CODEPLANE_TOKEN` environment variable, (2) OS keyring, (3) legacy config file.
- [ ] The `source` field in JSON output MUST be one of: `"CODEPLANE_TOKEN env"`, `"keyring"`, or `"config file"`.
- [ ] If no token is found for the target host, the command MUST exit with a non-zero exit code.
- [ ] The error message when no token is found MUST include the target hostname and suggest both `codeplane auth login` and `CODEPLANE_TOKEN` as remediation.
- [ ] The command MUST NOT make any network requests — token resolution is entirely local.
- [ ] The command MUST NOT modify any stored credentials, config files, or keyring entries — it is a read-only operation.
- [ ] The `--json` flag MUST produce parseable JSON to stdout with no extraneous output.
- [ ] The command MUST be registered and visible in `codeplane auth --help` output.

### Edge Cases

- [ ] When `CODEPLANE_TOKEN` is set to a whitespace-only string, it MUST be treated as unset (trimmed to empty → fall through to keyring).
- [ ] When `CODEPLANE_TOKEN` is set to a non-empty string that does NOT start with `codeplane_`, the command MUST still print it (the command prints whatever is resolved; it does not validate token format).
- [ ] When the keyring backend is unavailable (no `security`, `secret-tool`, or `powershell` on the system) and no `CODEPLANE_TOKEN` is set and no legacy config token exists, the command MUST exit non-zero with the standard "no token found" error.
- [ ] When the keyring read operation fails (e.g., locked keychain on macOS), the error MUST propagate as a non-zero exit with a descriptive message.
- [ ] When `--hostname` is an empty string, the command MUST error with `"Hostname is required."`.
- [ ] When `--hostname` matches the currently configured default host, the command MUST behave identically to running without `--hostname`.
- [ ] When two different hosts have tokens stored, `codeplane auth token` and `codeplane auth token --hostname other.host` MUST return their respective tokens independently.
- [ ] When a legacy config file token exists and a keyring token also exists for the same host, the keyring token MUST take precedence.
- [ ] When `CODEPLANE_TOKEN` is set, the command MUST report source as `"CODEPLANE_TOKEN env"` regardless of whether a keyring or config token also exists.
- [ ] When the user's config file is missing or corrupted, the command MUST use built-in defaults for the API URL and not crash.
- [ ] In JSON mode, when no token is found, the command MUST still exit non-zero — it MUST NOT output an empty or partial JSON object.
- [ ] When the `CODEPLANE_DISABLE_SYSTEM_KEYRING=1` environment variable is set, the keyring source MUST be skipped entirely (fall through to config or error).
- [ ] When the test credential store file (`CODEPLANE_TEST_CREDENTIAL_STORE_FILE`) is set, the command MUST use the file-based backend instead of the system keyring.

### Boundary Constraints

- `--hostname` maximum length: 253 characters (DNS hostname limit).
- `--hostname` allowed characters: alphanumeric, hyphens, dots, colons (for port), forward slashes (for URLs), square brackets (for IPv6), and the `://` scheme prefix.
- Token strings: unbounded in length (the command prints whatever is stored; it does not enforce a maximum).
- JSON output encoding: UTF-8.
- Exit code on success: `0`.
- Exit code on failure: `1`.

## Design

### CLI Command

**Command**: `codeplane auth token`

**Synopsis**:
```
codeplane auth token [--hostname <host>] [--json]
```

**Options**:

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--hostname` | string | No | Configured default host from `~/.config/codeplane/config.toon` | Hostname or API URL of the Codeplane instance to retrieve the token for |
| `--json` | boolean | No | `false` | Output structured JSON to stdout instead of human-readable split output |

**Exit Codes**:

| Code | Meaning |
|------|--------|
| 0 | Token found and printed |
| 1 | No token found, or resolution error |

**Human-readable output (default)**:

stderr:
```
Token source: keyring (codeplane.example.com)
```

stdout:
```
codeplane_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2
```

**Structured JSON output (`--json`)**:

stdout:
```json
{
  "host": "codeplane.example.com",
  "source": "keyring",
  "token": "codeplane_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
}
```

| Field | Type | Always Present | Description |
|-------|------|----------------|-------------|
| `host` | string | Yes | The normalized hostname the token is associated with |
| `source` | string | Yes | Where the token was loaded from: `"CODEPLANE_TOKEN env"`, `"keyring"`, or `"config file"` |
| `token` | string | Yes | The raw authentication token |

**Error output (stderr, exit code 1)**:

```
Error: no token found for codeplane.example.com. Run `codeplane auth login` or set CODEPLANE_TOKEN.
```

**Source label mapping**:

| Internal Source | Display Label (human) | Display Label (JSON) |
|----------------|----------------------|---------------------|
| `env` | `CODEPLANE_TOKEN env` | `CODEPLANE_TOKEN env` |
| `keyring` | `keyring` | `keyring` |
| `config` | `config file` | `config file` |

**Usage patterns**:

```bash
# Print current token
codeplane auth token

# Copy token to clipboard (macOS)
codeplane auth token | pbcopy

# Copy token to clipboard (Linux)
codeplane auth token | xclip -selection clipboard

# Print token for a specific host
codeplane auth token --hostname my-company.codeplane.com

# Get token as JSON for scripting
codeplane auth token --json

# Extract just the token from JSON output
codeplane auth token --json | jq -r .token

# Use in another tool
curl -H "Authorization: token $(codeplane auth token)" https://api.codeplane.example.com/api/user

# Inject into an environment variable
export CODEPLANE_TOKEN=$(codeplane auth token)

# Pass to a workspace or container
docker run -e CODEPLANE_TOKEN=$(codeplane auth token) my-image
```

### Relationship to Other Auth Commands

`codeplane auth token` is the read-only counterpart in the auth command family:

- `codeplane auth login` — stores a token (browser OAuth or stdin).
- `codeplane auth logout` — removes the stored token.
- `codeplane auth status` — validates the token against the server and shows the authenticated user (makes a network call).
- **`codeplane auth token`** — prints the raw stored token without any network verification (purely local).

### SDK Shape

The CLI command delegates to the following functions in `apps/cli/src/auth-state.ts`:

- `requireAuthToken(options?: { hostname?: string }): ResolvedAuthToken` — Resolves the token from the priority chain (env → keyring → config) or throws if none found. Returns `{ apiUrl, host, source, token }`.
- `resolveAuthTarget(options?: { hostname?: string }): AuthTarget` — Determines `apiUrl` and `host` from the hostname option or config defaults. Used by `requireAuthToken` internally and referenced in error messages.
- `formatTokenSource(source: AuthTokenSource): string` — Maps the internal source enum (`"env"`, `"keyring"`, `"config"`) to the human-readable display label.
- `resolveAuthToken(options?): ResolvedAuthToken | null` — Lower-level resolver that returns `null` instead of throwing when no token is found.

Credential retrieval is handled by `apps/cli/src/credentials.ts`:

- `loadStoredToken(host: string): string | null` — Reads the token from the platform-specific keyring backend.
- The test file backend (`CODEPLANE_TEST_CREDENTIAL_STORE_FILE`) is used in CI/testing contexts.
- Host normalization: `normalizeHost(host)` lowercases and trims the hostname for storage key consistency.

Output control is handled by `apps/cli/src/output.ts`:

- `shouldReturnStructuredOutput(context: OutputContext): boolean` — Returns `true` when `--json` flag is active, causing the command to return the structured object instead of writing to stderr/stdout.

### API Shape

This feature makes **no API calls**. It is entirely a local credential retrieval command. No server endpoints are required.

The token printed by this command can subsequently be used with any Codeplane API endpoint via the `Authorization: token <value>` header, but that is the consumer's responsibility, not this command's.

### Documentation

The following end-user documentation should be written:

1. **CLI Reference — `codeplane auth token`**: Document the command, its flags, output modes (human-readable vs JSON), all source labels, exit codes, and at least four usage examples (basic print, clipboard copy, scripting with `jq`, injection into `curl`/`docker`).

2. **Authentication Guide — "Printing Your Token"**: A section in the CLI authentication guide explaining when to use `auth token` versus `auth status`, the resolution priority order (env → keyring → config), and common workflows like piping to other tools.

3. **Troubleshooting — "No Token Found"**: Document the error message, the three resolution sources the command checks, and step-by-step recovery (run `codeplane auth login`, or set `CODEPLANE_TOKEN`, or check `--hostname` targeting).

4. **CI/CD Integration Guide — "Retrieving Tokens in Scripts"**: Show how `codeplane auth token` can be used in CI scripts to extract a stored token for forwarding to other services, containers, or downstream tools. Include examples of the `--json | jq` pattern and direct subshell expansion.

## Permissions & Security

### Authorization Roles

- **Any authenticated user** can run `codeplane auth token`. The command requires that a token already exists in the resolution chain.
- **Unauthenticated users** receive a clear "no token found" error — no partial information is disclosed.
- No server-side authorization check is performed because the command makes no network requests.
- There is no concept of Owner, Admin, Member, Read-Only, or Anonymous roles for this command. The only gating is local credential existence.

### Rate Limiting

- No server-side rate limiting applies because no network request is made.
- No client-side rate limiting is needed — the command reads from local credential stores which have their own I/O constraints.
- Automated callers (scripts, CI) should avoid calling `codeplane auth token` in tight loops as keyring access on some platforms (especially macOS Keychain via `security` subprocess) incurs process spawn overhead (~50-200ms per invocation).

### Security Constraints

- **Token is printed to stdout**: This is the explicit purpose of the command. Users must be aware that the token will appear in their terminal scrollback, shell history (if used in backtick/subshell expansion in a logged shell), and any pipeline consumers.
- **Token MUST NOT appear in logs**: If the CLI emits structured logs (at any log level, including DEBUG and TRACE), the token value must never be included. Only the source label and host are safe to log.
- **No network exposure**: The command must never transmit the token over the network. It is strictly a local credential retrieval operation.
- **stderr/stdout separation**: The token goes to stdout and metadata to stderr specifically so that piping (`codeplane auth token | other-tool`) only sends the token, not the source metadata. This separation MUST be maintained.
- **Environment variable visibility**: When the token comes from `CODEPLANE_TOKEN`, printing it does not create additional exposure beyond what already exists in the process environment. The source label `"CODEPLANE_TOKEN env"` signals this to the user.
- **Terminal security**: Users should be advised in documentation that running `codeplane auth token` in a shared tmux/screen session or with terminal logging enabled exposes the token to other session participants or log consumers.
- **Credential file permissions**: The test credential store file (`CODEPLANE_TEST_CREDENTIAL_STORE_FILE`) MUST be created with `0o600` permissions. System keyring backends manage their own access control.

### PII / Data Privacy

- The token is a credential, not PII, but grants access to PII (user profile, repositories, issues, etc.).
- The hostname is not PII but may reveal internal infrastructure names for self-hosted instances.
- No user-identifying information is disclosed by the command itself — the token is an opaque string and the user would need to call `auth status` to resolve it to a username.
- Hostnames MUST NOT be sent to external telemetry services without user consent.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `cli.auth.token_print.attempted` | When `codeplane auth token` command is entered | `host` (string), `has_hostname_flag` (bool), `output_format` (`"text"` or `"json"`), `cli_version` (string), `platform` (`"darwin"`, `"linux"`, or `"win32"`) |
| `cli.auth.token_print.succeeded` | Token was found and printed | `host` (string), `source` (`"env"`, `"keyring"`, or `"config"`), `output_format` (string), `cli_version` (string), `platform` (string) |
| `cli.auth.token_print.failed` | No token found or resolution error | `host` (string), `error_type` (`"no_token"`, `"keyring_error"`, `"config_error"`, `"hostname_invalid"`), `cli_version` (string), `platform` (string) |

**Property definitions**:

- `host`: The resolved target hostname (never includes the token value). May be hashed for privacy.
- `has_hostname_flag`: Boolean — whether `--hostname` was explicitly provided.
- `output_format`: `"text"` for default human-readable, `"json"` for structured JSON.
- `source`: Which resolution layer produced the token.
- `error_type`: Categorized failure reason.
- `cli_version`: The Codeplane CLI version string.
- `platform`: `darwin`, `linux`, or `win32`.

**Critical rule**: The `token` value MUST NEVER be included in any telemetry event payload.

### Funnel Metrics & Success Indicators

| Metric | Description | Target / Indicator |
|--------|-------------|-------------------|
| Token print success rate | `succeeded / attempted` ratio | > 95% — indicates users generally have tokens when they try to print them |
| Source distribution | Breakdown of `source` across successful prints | Keyring should dominate (~70%+); high `env` suggests CI-heavy usage; high `config` suggests migration lag from legacy format |
| JSON vs text usage ratio | Proportion of `--json` invocations | Tracks scripting/automation adoption versus interactive use; expect 10-30% JSON |
| Token print → subsequent API call | Users who print a token and then use it in another tool within 60 seconds | Validates the command's utility as a credential forwarding mechanism |
| Failed print → login conversion | Users who fail `auth token` and then run `auth login` within 5 minutes | > 50% indicates the error message effectively guides recovery |
| Hostname flag usage | Percentage of invocations using `--hostname` | Tracks multi-instance adoption; expect low (<10%) unless enterprise heavy |
| Legacy config source decline | Week-over-week decrease in `source=config` events | Measures migration away from the deprecated config-file token storage |

## Observability

### Logging Requirements

All log entries are structured JSON. The token value MUST **never** appear in any log output at any level.

| Log Point | Level | Structured Context | Notes |
|-----------|-------|-------------------|-------|
| Token print command invoked | `DEBUG` | `{ event: "auth.token_print.start", host, has_hostname_flag, output_format }` | Entry point |
| Token resolved from env | `DEBUG` | `{ event: "auth.token_print.resolved", host, source: "env" }` | Never log token |
| Token resolved from keyring | `DEBUG` | `{ event: "auth.token_print.resolved", host, source: "keyring" }` | Never log token |
| Token resolved from config | `DEBUG` | `{ event: "auth.token_print.resolved", host, source: "config" }` | Never log token |
| Token printed successfully | `INFO` | `{ event: "auth.token_print.completed", host, source }` | |
| No token found | `WARN` | `{ event: "auth.token_print.failed", host, reason: "no_token" }` | |
| Keyring read error | `ERROR` | `{ event: "auth.token_print.failed", host, reason: "keyring_error", error_message }` | Include backend error detail |
| Config read error | `ERROR` | `{ event: "auth.token_print.failed", host, reason: "config_error", error_message }` | Include parse error detail |
| Hostname resolution error | `WARN` | `{ event: "auth.token_print.failed", reason: "hostname_invalid", input }` | Log the invalid hostname input |
| Keyring backend not found | `DEBUG` | `{ event: "auth.token_print.keyring_unavailable", platform }` | Expected in headless/container envs |

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_cli_auth_token_print_total` | Counter | `status` (`success`, `error`), `source` (`env`, `keyring`, `config`, `none`), `platform` | Total token print invocations |
| `codeplane_cli_auth_token_print_errors_total` | Counter | `reason` (`no_token`, `keyring_error`, `config_error`, `hostname_invalid`), `platform` | Error breakdown |
| `codeplane_cli_auth_token_print_duration_seconds` | Histogram | `platform`, `source` | Time from command entry to output. Buckets: 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1 seconds |

### Alerts & Runbooks

#### Alert 1: `AuthTokenPrintHighFailureRate`

- **Condition**: `rate(codeplane_cli_auth_token_print_errors_total[5m]) / rate(codeplane_cli_auth_token_print_total[5m]) > 0.5` sustained for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check the `reason` label breakdown on `codeplane_cli_auth_token_print_errors_total`.
  2. If `reason=no_token` dominates: This is likely a user behavior issue, not a system issue. Check if a documentation change removed instructions for running `auth login` first. Verify the onboarding flow still guides users to authenticate before using `auth token`. Check if a recent CLI update changed the default config path or host resolution.
  3. If `reason=keyring_error` dominates: Check if a platform OS update or security policy change broke keyring access. Check platform distribution via the `platform` label — is it isolated to one OS? Verify `security` (macOS), `secret-tool` (Linux), or `pwsh` (Windows) availability on affected systems. Check if enterprise security policies recently changed (e.g., Keychain Access restrictions).
  4. If `reason=config_error` dominates: Check if a CLI update changed the config file format (TOON parsing). Verify config file migration logic is working. Check for file permission issues.
  5. Check recent CLI releases for regressions in the `auth-state.ts` or `credentials.ts` modules.

#### Alert 2: `AuthTokenPrintKeyringLatencyHigh`

- **Condition**: `histogram_quantile(0.95, rate(codeplane_cli_auth_token_print_duration_seconds_bucket{source="keyring"}[5m])) > 2` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check if the latency is isolated to a specific platform (`platform` label).
  2. For macOS: the `security` subprocess can be slow if Keychain Access is performing background operations or if the keychain database is large. Suggest users run `security unlock-keychain` manually. Check if full disk access or automation permissions are blocking the subprocess.
  3. For Linux: check if the D-Bus session is responding slowly. Verify `gnome-keyring-daemon` or the active Secret Service provider is healthy. Check `systemctl --user status gnome-keyring-daemon`.
  4. For Windows: PowerShell cold start can be slow (~1-2s). Check if `pwsh` (PowerShell Core) vs `powershell` (Windows PowerShell) makes a difference in the `PATH`.
  5. If widespread, consider whether a file-based cache layer would help as a performance optimization.

#### Alert 3: `AuthTokenPrintKeyringErrorSpike`

- **Condition**: `rate(codeplane_cli_auth_token_print_errors_total{reason="keyring_error"}[15m]) > 10`
- **Severity**: Warning
- **Runbook**:
  1. Identify affected platforms from the `platform` label.
  2. For macOS: verify `security` binary exists at `/usr/bin/security`. Check if macOS Keychain is locked or corrupted (`security show-keychain-info`). Check if running inside a Docker container or sandbox that restricts Keychain access. Verify the `codeplane-cli` service entry exists in Keychain via `security find-generic-password -s codeplane-cli`.
  3. For Linux: verify `secret-tool` is installed (`which secret-tool`). Check D-Bus session availability (`echo $DBUS_SESSION_BUS_ADDRESS`). Verify a Secret Service daemon is running (`ps aux | grep keyring`). In headless/server environments, `secret-tool` may not function without a display session.
  4. For Windows: verify PowerShell is available and the `Windows.Security.Credentials` namespace is accessible. Check Windows Credential Manager for the `codeplane-cli` entry.
  5. Ensure CLI error messages clearly guide users to the `CODEPLANE_TOKEN` environment variable fallback when keyring is unavailable.

### Error Cases and Failure Modes

| Error Case | Behavior | Exit Code | User Message |
|------------|----------|-----------|---------------|
| No token in env, keyring, or config | Exit with actionable error | 1 | `no token found for {host}. Run \`codeplane auth login\` or set CODEPLANE_TOKEN.` |
| Keyring read fails (locked/unavailable) | Exit with backend error | 1 | Platform-specific error (e.g., `Failed to read token from macOS Keychain: ...`) |
| Config file missing | Fall through to "no token" path silently | 1 | Same as "no token found" (config is optional) |
| Config file corrupted/unparseable | Exit with parse error | 1 | Config parse error message from TOON parser |
| `--hostname` is empty string | Exit with validation error | 1 | `Hostname is required.` |
| `--hostname` is unreachable | N/A — no network request made | 0 | Token printed if found in keyring for that host |
| `CODEPLANE_TOKEN` set to whitespace-only | Treated as unset; fall through to keyring/config | varies | Depends on keyring/config state |
| `CODEPLANE_DISABLE_SYSTEM_KEYRING=1` | Skip keyring entirely | varies | Falls through to config or "no token found" |
| Test credential store file is unreadable | Exit with I/O error | 1 | File read error message |

## Verification

### CLI End-to-End Tests

**Happy path tests:**

- [ ] **Basic token print (human-readable)**: After authenticating via `codeplane auth login --with-token`, run `codeplane auth token`. Verify exit code is `0`. Verify stdout contains exactly the token string followed by a newline. Verify stderr contains `Token source:` line with a source label and host in parentheses.
- [ ] **JSON output mode**: After authenticating, run `codeplane auth token --json`. Verify exit code is `0`. Verify stdout is valid JSON with exactly three keys: `host` (string), `source` (string), `token` (string). Verify no additional keys are present.
- [ ] **Token value matches stored credential**: Login via `echo 'codeplane_abc123...' | codeplane auth login --with-token` with a known 46-character token value. Run `codeplane auth token`. Verify the printed token exactly matches the input token character-for-character.
- [ ] **Token from CODEPLANE_TOKEN env variable**: Set `CODEPLANE_TOKEN=codeplane_env0000000000000000000000000000000000` and run `codeplane auth token --json`. Verify `source` is `"CODEPLANE_TOKEN env"` and `token` matches the env value exactly.
- [ ] **Token from keyring**: Login via `--with-token` (stores to keyring). Ensure `CODEPLANE_TOKEN` is unset. Run `codeplane auth token --json`. Verify `source` is `"keyring"`.
- [ ] **Token from legacy config**: Set a legacy config file token for the default host. Ensure `CODEPLANE_TOKEN` is unset and keyring has no token for the host. Run `codeplane auth token --json`. Verify `source` is `"config file"`.
- [ ] **Priority: env overrides keyring**: Login via `--with-token` to store token A in keyring, then set `CODEPLANE_TOKEN` to a different token B. Run `codeplane auth token`. Verify token B is printed and source is `"CODEPLANE_TOKEN env"`.
- [ ] **Priority: keyring overrides config**: Store token A in keyring and token B in legacy config for the same host. Ensure `CODEPLANE_TOKEN` is unset. Run `codeplane auth token`. Verify token A is printed.
- [ ] **Hostname flag for different hosts**: Store token A for `host-a.com` and token B for `host-b.com`. Run `codeplane auth token --hostname host-a.com` and `codeplane auth token --hostname host-b.com`. Verify distinct tokens A and B are returned respectively.
- [ ] **Hostname as full API URL**: Store a token for `example.com`. Run `codeplane auth token --hostname https://api.example.com`. Verify the correct token is returned and `host` field is `example.com`.
- [ ] **Hostname as loopback address**: Store a token for `localhost:3000`. Run `codeplane auth token --hostname localhost:3000`. Verify the correct token is returned.
- [ ] **Hostname matching default**: Store a token for the configured default host. Run `codeplane auth token` and `codeplane auth token --hostname <default-host>`. Verify both return the same token and same source.

**Output format tests:**

- [ ] **Stdout contains only the token**: Run `codeplane auth token` and capture stdout exclusively. Verify it matches `^[^\n]+\n$` exactly (token + single newline, no extra lines or whitespace).
- [ ] **Stderr contains source and host**: Run `codeplane auth token` and capture stderr exclusively. Verify it matches the pattern `Token source: .+ \(.+\)\n`.
- [ ] **JSON schema strict validation**: Run `codeplane auth token --json` and validate the output: parse as JSON, verify exactly three keys (`host`, `source`, `token`), verify all are strings, verify no additional keys.
- [ ] **Pipeline composability**: Run `codeplane auth token 2>/dev/null | wc -c` and verify the byte count matches the token length + 1 (for the newline). This confirms stderr metadata does not leak into stdout.
- [ ] **No trailing whitespace in stdout**: Run `codeplane auth token` and verify stdout does not end with spaces or tabs before the newline.

**Error path tests:**

- [ ] **No token found (default host)**: Clear all tokens (logout, unset env, clear config). Run `codeplane auth token`. Verify exit code is `1`. Verify stderr contains `no token found for` and the host name. Verify stderr mentions both `codeplane auth login` and `CODEPLANE_TOKEN`.
- [ ] **No token found with --hostname**: Run `codeplane auth token --hostname nonexistent.host.com` when no token exists for that host. Verify exit code is `1` and error references `nonexistent.host.com`.
- [ ] **No token found in JSON mode**: Run `codeplane auth token --json` when no token exists. Verify exit code is `1`. Verify stdout is empty (no partial JSON is written).
- [ ] **Empty hostname flag**: Run `codeplane auth token --hostname ""`. Verify exit code is `1` and error message contains `Hostname is required`.
- [ ] **CODEPLANE_TOKEN set to whitespace-only**: Set `CODEPLANE_TOKEN="   "`. Clear keyring. Run `codeplane auth token`. Verify the command falls through to keyring/config and either prints from those sources or errors with "no token found".
- [ ] **CODEPLANE_TOKEN set to empty string**: Set `CODEPLANE_TOKEN=""`. Clear keyring. Run `codeplane auth token`. Verify it is treated as unset (falls through).

**Credential store tests:**

- [ ] **Test file backend round-trip**: Set `CODEPLANE_TEST_CREDENTIAL_STORE_FILE` to a temp path. Login via `--with-token` with a known token. Run `codeplane auth token`. Verify the printed token matches. Verify the credential file exists with `0o600` permissions.
- [ ] **Host key normalization (case-insensitive)**: Login with `--hostname EXAMPLE.COM`. Run `codeplane auth token --hostname example.com`. Verify the token is found (hosts are case-insensitive).
- [ ] **Independent host tokens**: Login for `host-a.com` with token A and `host-b.com` with token B. Verify `codeplane auth token --hostname host-a.com` prints A and `--hostname host-b.com` prints B. Verify neither cross-contaminates.
- [ ] **Disabled keyring fallback**: Set `CODEPLANE_DISABLE_SYSTEM_KEYRING=1` and `CODEPLANE_TOKEN=codeplane_fallback...`. Run `codeplane auth token --json`. Verify source is `"CODEPLANE_TOKEN env"` (keyring was skipped).

**Cross-command integration tests:**

- [ ] **Login then token print**: Run `echo 'codeplane_known...' | codeplane auth login --with-token`, then `codeplane auth token`. Verify the same token is returned.
- [ ] **Login, logout, then token print**: Run `codeplane auth login --with-token`, then `codeplane auth logout`, then `codeplane auth token`. Verify exit code is `1` with "no token found".
- [ ] **Token print then status**: Run `codeplane auth token` to get the token, then `codeplane auth status --json`. Verify both commands resolve against the same host.
- [ ] **Token print is read-only**: Snapshot the credential store file before running `codeplane auth token`. Run the command. Verify the file is byte-identical afterward.

**Boundary and stress tests:**

- [ ] **Maximum valid hostname length (253 characters)**: Generate a valid 253-character hostname (e.g., repeating `a.` segments). Run `codeplane auth token --hostname <253-char-hostname>`. Verify the command processes it without error (either finds a token or cleanly errors with "no token found").
- [ ] **Hostname with 254 characters (one above max)**: Run `codeplane auth token --hostname <254-char-hostname>`. Verify the command either processes it gracefully or returns a clear validation error.
- [ ] **Very long stored token (1024 characters)**: Store a token `codeplane_` followed by 1018 hex characters. Run `codeplane auth token`. Verify it is printed completely and correctly — compare output byte-for-byte.
- [ ] **Very long stored token (4096 characters)**: Store a 4096-character token. Run `codeplane auth token`. Verify it is printed completely without truncation.
- [ ] **Special characters in hostname**: Run `codeplane auth token --hostname "host-with-dashes.and.dots.example.com"`. Verify correct resolution.
- [ ] **IPv6 loopback hostname**: Run `codeplane auth token --hostname "[::1]:3000"`. Verify the command handles IPv6 bracket notation correctly.
- [ ] **Rapid sequential invocations**: Run `codeplane auth token` 10 times in quick succession. Verify all invocations succeed with identical, consistent output.
- [ ] **Non-codeplane-prefixed token in CODEPLANE_TOKEN**: Set `CODEPLANE_TOKEN=my_custom_token_abc`. Run `codeplane auth token`. Verify it prints `my_custom_token_abc` without validation error (command does not enforce prefix).

### API Integration Tests

- [ ] **Token from `auth token` authenticates API calls**: Run `codeplane auth token`, capture the output, then use it directly as `Authorization: token <captured>` header against `GET /api/user`. Verify HTTP 200 and a valid user profile response.
- [ ] **Revoked token still prints but fails API**: Create a PAT via the API, login with it, revoke it via `DELETE /api/user/tokens/:id`, then run `codeplane auth token`. Verify the revoked token is still printed (no network check). Verify using it against `GET /api/user` returns HTTP 401.

### Security Tests

- [ ] **Token not in stderr**: Run `codeplane auth token` and capture stderr. Verify the raw token value does NOT appear anywhere in stderr output (only the source label and host should be present).
- [ ] **Token not in debug logs**: Run `codeplane auth token` with maximum log verbosity enabled. Grep all output (stdout, stderr, log files) for the token string. Verify zero matches outside of the intended stdout line.
- [ ] **No network traffic**: Run `codeplane auth token` while monitoring network connections (e.g., via `lsof -i` or `strace -e network`). Verify zero network connections are opened during command execution.
- [ ] **Test credential file permissions**: When using `CODEPLANE_TEST_CREDENTIAL_STORE_FILE`, verify the credential file is created with `0o600` permissions (owner read/write only) and is not group-readable or world-readable.
- [ ] **Command does not modify credentials**: Compute a checksum of the credential store before and after running `codeplane auth token`. Verify the checksum is identical (the command is strictly read-only).

### Playwright (Web UI) Tests

- [ ] **No dedicated web UI for this feature**: `codeplane auth token` is a CLI-only feature. No Playwright tests are required. The web UI does not expose a "print token" surface.
