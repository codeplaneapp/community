# AUTH_CLI_HOST_TARGET_SELECTION

Specification for AUTH_CLI_HOST_TARGET_SELECTION.

## High-Level User POV

# AUTH_CLI_HOST_TARGET_SELECTION

Specification for AUTH_CLI_HOST_TARGET_SELECTION.

## High-Level User POV

Developers using the Codeplane CLI often work with more than one Codeplane instance. They might have a company self-hosted server, a personal instance, and a local daemon running on their laptop. Every CLI command that touches the Codeplane API — logging in, checking status, creating issues, running workflows — needs to know which instance to talk to. Host target selection is the system that answers that question consistently across every command.

By default, the CLI targets the instance the developer last authenticated with. This is stored in a local configuration file and set automatically during login. When a developer runs `codeplane auth login`, the host they log into becomes their default. From that point on, every command — `codeplane issue list`, `codeplane repo create`, `codeplane workflow run` — operates against that host without any extra flags.

When a developer needs to target a different instance, they pass the `--hostname` flag to any auth command. The hostname can be provided in several natural forms: a bare domain name like `my-company.codeplane.dev`, a full API URL like `https://api.my-company.codeplane.dev`, or a local address like `localhost:3000` for daemon development. The CLI figures out the correct API URL and credential lookup from whatever form is given.

Credentials are stored per-host in the operating system's secure keyring — macOS Keychain, Linux Secret Service, or Windows Credential Locker. This means a developer can be simultaneously authenticated to multiple Codeplane instances, each with its own token, without any conflict. Switching between instances is as simple as passing `--hostname` to the command they want to redirect.

For CI/CD and headless environments, the `CODEPLANE_TOKEN` environment variable provides an escape hatch that takes precedence over all stored credentials regardless of which host is targeted. This gives automation scripts a single, predictable way to inject credentials.

The overall experience is designed so that the common case — working with one Codeplane instance — requires zero configuration after the first login, while the multi-instance case is always one flag away without any complex profile or context switching ceremony.

## Acceptance Criteria

## Acceptance Criteria

### Definition of Done

- Every CLI auth subcommand (`login`, `logout`, `status`, `token`) accepts a `--hostname` flag that overrides the default target.
- The `--hostname` flag accepts bare hostnames, full API URLs, and loopback addresses with ports.
- The default target host is determined from the config file (`~/.config/codeplane/config.toon` or platform equivalent) and updated on login.
- Credentials are stored per-host in the OS secure keyring, keyed by normalized hostname.
- The `CODEPLANE_TOKEN` environment variable takes unconditional precedence over all per-host stored credentials.
- Token resolution follows a strict priority chain: environment variable → OS keyring → legacy config file.
- Host normalization is case-insensitive and strips `api.` prefixes for lookup consistency.
- All non-auth API-consuming commands use the same host resolution pipeline to determine their target.
- The feature works identically on macOS, Linux, and Windows.
- JSON output from auth commands always includes the resolved `host` and `api_url`.

### Functional Constraints

- [ ] When `--hostname` is not provided and no `--apiUrl` override is active, the CLI MUST use the `api_url` from the config file (default: `https://api.codeplane.app`).
- [ ] When `--hostname` is provided as a bare hostname (e.g., `my-company.codeplane.dev`), the CLI MUST derive the API URL as `https://api.my-company.codeplane.dev`.
- [ ] When `--hostname` is provided as a hostname that already starts with `api.` (e.g., `api.my-company.codeplane.dev`), the CLI MUST NOT double-prefix it (MUST NOT produce `api.api.my-company.codeplane.dev`).
- [ ] When `--hostname` is provided as a full URL (e.g., `https://api.my-company.codeplane.dev`), the CLI MUST use it directly as the API URL after normalization.
- [ ] When `--hostname` is a loopback address (`localhost`, `127.0.0.1`, `[::1]`, `::1`) with or without a port, the CLI MUST default to `http://` scheme instead of `https://`.
- [ ] When `--hostname` resolves to the same host as the current config default, the CLI MUST use the configured API URL rather than re-deriving it.
- [ ] Host normalization MUST be case-insensitive: `Example.COM` and `example.com` MUST resolve to the same credential and API URL.
- [ ] After a successful `codeplane auth login`, the resolved `api_url` MUST be persisted to the config file, making it the new default for subsequent commands.
- [ ] After a successful `codeplane auth login --hostname other.host.com`, the resolved `api_url` for `other.host.com` MUST be persisted to the config file, switching the default.
- [ ] The `CODEPLANE_TOKEN` environment variable MUST take precedence over keyring and config file tokens for the resolved host, and `token_source` MUST report `"env"`.
- [ ] An empty or whitespace-only `CODEPLANE_TOKEN` MUST be treated as unset and fall through to the keyring.
- [ ] Credential storage MUST be keyed by the normalized hostname (lowercase, trimmed, `api.` prefix stripped).
- [ ] Credential retrieval for a given host MUST be independent of credentials stored for other hosts.
- [ ] When the OS keyring backend is unavailable, credential read operations MUST return `null` silently; credential write operations MUST throw a `SecureStorageUnavailableError` with a message suggesting `CODEPLANE_TOKEN`.
- [ ] The `--hostname` flag MUST be optional on every auth subcommand — omitting it MUST always fall back to the config default.
- [ ] Non-auth commands (e.g., `codeplane issue list`, `codeplane repo create`) MUST resolve their API client target using the same `resolveAuthTarget → resolveAuthToken` pipeline.

### Edge Cases

- [ ] If `--hostname` is an empty string, the CLI MUST throw an error: `"Hostname is required."`.
- [ ] If `--hostname` contains only whitespace, the CLI MUST throw the same `"Hostname is required."` error after trimming.
- [ ] If `--hostname` is provided with a trailing slash (e.g., `https://api.example.com/`), the trailing slash MUST be stripped during normalization.
- [ ] If `--hostname` is provided with a trailing `/api` path (e.g., `https://example.com/api`), the `/api` suffix MUST be stripped during normalization.
- [ ] If `--hostname` includes a port (e.g., `my-host.com:8443`), the port MUST be preserved in the API URL and used for the network request.
- [ ] If two different hostnames normalize to the same host (e.g., `api.example.com` and `example.com`), they MUST share the same credential entry.
- [ ] If `--hostname` points to an unreachable server, `codeplane auth login` MUST eventually fail with a timeout or connection error — it MUST NOT hang indefinitely.
- [ ] If the config file does not exist, the CLI MUST use built-in defaults (`https://api.codeplane.app`, `ssh` protocol) without crashing.
- [ ] If the config file is malformed (invalid YAML/TOON), the CLI MUST use built-in defaults without crashing.
- [ ] If `--hostname` is an IPv6 address with brackets (e.g., `[::1]:3000`), the CLI MUST handle it correctly as a loopback address.
- [ ] If `--hostname` is `127.0.0.1:3000` and a separate token exists for `localhost:3000`, these MUST be treated as separate credential entries (no cross-resolution between IP and hostname).
- [ ] If the user logs into `host-a.com` and then logs into `host-b.com`, the config default MUST switch to `host-b.com`, but the token for `host-a.com` MUST remain in the keyring and be accessible via `--hostname host-a.com`.

### Boundary Constraints

- [ ] The `--hostname` value MUST be at most 253 characters (maximum DNS hostname length).
- [ ] The `--hostname` value MUST contain only valid characters: alphanumeric (`a-z`, `A-Z`, `0-9`), hyphens (`-`), dots (`.`), colons (`:`), square brackets (`[`, `]`), and the scheme prefix (`://`).
- [ ] Input containing spaces, control characters, or non-ASCII characters in the hostname portion MUST be rejected.
- [ ] Hostnames with individual labels exceeding 63 characters (DNS label limit) SHOULD be accepted by the CLI (DNS enforcement is not the CLI's responsibility).
- [ ] The normalized host key used for keyring storage MUST be at most 253 characters after normalization.
- [ ] The API URL derived from a hostname MUST be at most 2083 characters (practical URL length limit).

## Design

## Design

### CLI Command

Host target selection is not a standalone command — it is a cross-cutting behavior provided via the `--hostname` flag on all `codeplane auth` subcommands, and via the config-based default resolution used by all API-consuming commands.

**Affected commands**:

| Command | `--hostname` flag | Description |
|---------|-------------------|-------------|
| `codeplane auth login` | Yes | Authenticate with a specific Codeplane instance |
| `codeplane auth logout` | Yes | Remove credentials for a specific instance |
| `codeplane auth status` | Yes | Check auth state for a specific instance |
| `codeplane auth token` | Yes | Print the stored token for a specific instance |
| `codeplane config set api_url <url>` | N/A | Directly set the default API URL |
| `codeplane config get api_url` | N/A | View the current default API URL |
| All other API-consuming commands | No (uses config default) | Implicitly targets the configured default host |

**`--hostname` flag specification**:

| Property | Value |
|----------|-------|
| Flag name | `--hostname` |
| Type | `string` |
| Required | No |
| Default | The `api_url` from the config file |
| Aliases | None |
| Description | Hostname or API URL of the Codeplane instance to target |

**Input forms and derived API URLs**:

| Input | Derived API URL | Credential Host Key |
|-------|-----------------|---------------------|
| `codeplane.app` | `https://api.codeplane.app` | `codeplane.app` |
| `my-company.codeplane.dev` | `https://api.my-company.codeplane.dev` | `my-company.codeplane.dev` |
| `api.my-company.codeplane.dev` | `https://api.my-company.codeplane.dev` | `my-company.codeplane.dev` |
| `https://api.my-company.codeplane.dev` | `https://api.my-company.codeplane.dev` | `my-company.codeplane.dev` |
| `https://my-company.codeplane.dev/api` | `https://my-company.codeplane.dev` | `my-company.codeplane.dev` |
| `localhost:3000` | `http://localhost:3000` | `localhost:3000` |
| `127.0.0.1:3000` | `http://127.0.0.1:3000` | `127.0.0.1:3000` |
| `[::1]:3000` | `http://[::1]:3000` | `[::1]:3000` |
| `EXAMPLE.COM` | `https://api.example.com` | `example.com` |

**Host resolution priority**:

1. If `--hostname` is provided, use it to derive the API URL and host key.
2. If `--hostname` is not provided, load the `api_url` from the config file.
3. If the config file is missing or malformed, use the built-in default `https://api.codeplane.app`.

**Token resolution priority** (per resolved host):

1. `CODEPLANE_TOKEN` environment variable (if non-empty after trimming).
2. OS secure keyring entry keyed by the normalized hostname.
3. Legacy `token` field in the config file (only if the config file's `api_url` matches the resolved host).

**Config file format** (`~/.config/codeplane/config.toon` or platform equivalent):

```yaml
api_url: https://api.codeplane.app
git_protocol: ssh
```

The config file stores only the **default** host's API URL. It does not enumerate all authenticated hosts. The keyring is the authoritative registry of per-host credentials.

### SDK Shape

The host target selection logic lives in the CLI's `auth-state` module and is consumed by all commands:

- **`resolveAuthTarget(options?)`**: Accepts optional `{ apiUrl?, hostname? }`. Returns `{ apiUrl: string, host: string }`. Implements the hostname normalization and API URL derivation pipeline.
- **`resolveAuthToken(options?)`**: Composes `resolveAuthTarget` with the token resolution priority chain. Returns `{ apiUrl, host, source, token }` or `null`.
- **`requireAuthToken(options?)`**: Same as `resolveAuthToken` but throws with an actionable error if no token is found.
- **`persistAuthToken(token, options?)`**: Stores the token in the keyring keyed by the resolved host, updates the config file's `api_url`, and scrubs any matching legacy token.
- **`clearAuthToken(options?)`**: Deletes the keyring entry and legacy config token for the resolved host.
- **`apiUrlFromHostInput(hostnameOrApiUrl)`**: The hostname-to-API-URL conversion function. Handles bare hostnames, full URLs, and loopback detection.
- **`formatTokenSource(source)`**: Maps `"env"` → `"CODEPLANE_TOKEN env"`, `"keyring"` → `"keyring"`, `"config"` → `"config file"`.

Credential storage is handled by the `credentials` module:

- **`loadStoredToken(host)`**: Reads from the platform keyring. Returns the token string or `null`.
- **`storeToken(host, token)`**: Writes to the platform keyring. Throws `SecureStorageUnavailableError` if no backend is available.
- **`deleteStoredToken(host)`**: Removes from the platform keyring. Returns `true` if an entry was deleted.

All host keys passed to credential functions are normalized via `normalizeHost()` (trim + lowercase).

### TUI UI

The TUI dashboard connection indicator displays the resolved host and authentication state. The host is determined using the same `resolveAuthTarget` pipeline. The TUI does not currently support a host-switching interaction — it always uses the config default.

### Editor Integration

**VS Code**: The status bar shows the connected host. The extension resolves the host via the daemon or config file. No `--hostname` equivalent exists in the extension UI — it uses the daemon's configured host.

**Neovim**: The statusline shows the connected host. Same resolution behavior as VS Code — uses the daemon or config default.

### Documentation

The following end-user documentation MUST be written:

1. **CLI Reference — Host Target Selection**: A dedicated reference page explaining the `--hostname` flag, all accepted input forms (bare hostname, full URL, loopback addresses), the normalization rules, and examples for each form.

2. **Authentication Guide — Working with Multiple Instances**: A guide section showing how to authenticate with multiple Codeplane instances, how to switch between them, how tokens are stored per-host in the keyring, and how the config default changes on login.

3. **Authentication Guide — Token Resolution Priority**: A clear explanation of the env → keyring → config priority chain, with examples showing how `CODEPLANE_TOKEN` overrides per-host credentials.

4. **Configuration Reference — `api_url`**: Document the `api_url` config key, how it is set automatically on login, how to override it manually via `codeplane config set api_url`, and its relationship to `--hostname`.

5. **CI/CD Guide — Headless Authentication**: A guide showing how to use `CODEPLANE_TOKEN` in CI environments, how it interacts with host targeting, and how to target a specific instance when the config file may not exist.

6. **Troubleshooting — "No token found for {host}"**: Document the error message, the three token sources checked, and step-by-step resolution: (a) run `codeplane auth login --hostname <host>`, (b) set `CODEPLANE_TOKEN`, (c) verify the hostname matches the one used during login.

## Permissions & Security

## Permissions & Security

### Authorization Roles

- **Any user (authenticated or not)** can invoke CLI auth commands. The `--hostname` flag does not require authentication — it is an input parameter that determines *where* to authenticate, not *whether* the user is authorized.
- **No server-side role check** is involved in host resolution itself. Server-side authorization occurs on the subsequent API call using the resolved token.
- **Token storage in the keyring** is gated by the operating system's user-level access controls. Only the user who stored the credential can retrieve it.

### Rate Limiting

- Host resolution is a purely local operation — no rate limiting applies to the `--hostname` flag processing or config file reads.
- The `codeplane auth login` browser flow creates a local HTTP callback server on an ephemeral port. This server MUST only accept connections from `127.0.0.1` and MUST shut down after receiving one valid callback or after the 5-minute timeout.
- Server-side rate limiting on the OAuth and token verification endpoints is covered by the respective auth feature specs (AUTH_CLI_BROWSER_LOGIN, AUTH_CLI_STATUS, etc.).
- The CLI SHOULD NOT retry host resolution or credential lookup in a loop. Each command invocation performs one resolution.

### Data Privacy & PII

- **Hostnames** may reveal internal corporate infrastructure names (e.g., `codeplane.internal.megacorp.com`). Hostnames MUST NOT be sent to external telemetry services without explicit user consent. When included in telemetry, hostnames MUST be hashed.
- **Tokens** MUST NEVER appear in logs, stdout (except via the explicit `codeplane auth token` command), stderr, telemetry, or crash reports.
- **The config file** (`config.toon`) stores the API URL in plaintext. It MUST NOT store tokens. The legacy `token` field MUST be migrated to the keyring on first use and then scrubbed from the file.
- **Keyring entries** are protected by OS-level access controls. The CLI MUST NOT implement its own plaintext fallback for credential storage (except the explicit test file backend gated by `CODEPLANE_TEST_CREDENTIAL_STORE_FILE`).
- **The `CODEPLANE_TOKEN` environment variable** is visible to any process in the same session. Documentation MUST warn users about terminal logging, shared sessions, and process environment exposure.
- **The `CODEPLANE_TEST_CREDENTIAL_STORE_FILE`** test backend MUST create files with `0o600` permissions to prevent other users from reading stored credentials.

## Telemetry & Product Analytics

## Telemetry & Product Analytics

### Key Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `cli.auth.host_resolved` | Every time `resolveAuthTarget` is called for an auth command | `host` (string, hashed), `has_hostname_flag` (bool), `input_form` (enum: `"bare_hostname"`, `"full_url"`, `"loopback"`, `"config_default"`), `matches_config_default` (bool), `cli_version` (string), `platform` (string) |
| `cli.auth.token_resolved` | Every time `resolveAuthToken` returns a non-null result | `host` (string, hashed), `token_source` (enum: `"env"`, `"keyring"`, `"config"`), `has_hostname_flag` (bool), `cli_version` (string), `platform` (string) |
| `cli.auth.token_not_found` | Every time `resolveAuthToken` returns null | `host` (string, hashed), `has_hostname_flag` (bool), `cli_version` (string), `platform` (string) |
| `cli.auth.config_default_changed` | When `persistAuthToken` updates the config file's `api_url` to a new host | `previous_host` (string, hashed), `new_host` (string, hashed), `cli_version` (string), `platform` (string) |
| `cli.auth.hostname_input_error` | When `--hostname` input fails validation | `error_type` (enum: `"empty"`, `"too_long"`, `"invalid_characters"`), `cli_version` (string), `platform` (string) |
| `cli.auth.legacy_token_migrated` | When a legacy config file token is scrubbed after keyring storage | `host` (string, hashed), `cli_version` (string), `platform` (string) |

### Property Definitions

- `host`: The normalized hostname, always SHA-256 hashed before transmission. MUST NEVER be sent in cleartext.
- `has_hostname_flag`: Boolean indicating whether the user explicitly provided `--hostname`.
- `input_form`: Categorizes the raw `--hostname` input form for product understanding.
- `token_source`: Which layer of the priority chain produced the token.
- `platform`: Operating system — `darwin`, `linux`, or `win32`.
- `cli_version`: The Codeplane CLI version string.

**Critical rule**: Token values MUST NEVER appear in any telemetry event.

### Funnel Metrics & Success Indicators

| Metric | Description | Target |
|--------|-------------|--------|
| **Multi-host adoption rate** | Percentage of active CLI users who have `has_hostname_flag: true` on at least one event per week | > 15% indicates healthy multi-instance adoption |
| **Default host stability** | Percentage of `cli.auth.config_default_changed` events relative to total logins | < 20% indicates users rarely switch defaults |
| **Token resolution success rate** | `token_resolved / (token_resolved + token_not_found)` for commands where a token is required | > 95% indicates auth is healthy |
| **Hostname input error rate** | `hostname_input_error / host_resolved{has_hostname_flag=true}` | < 2% indicates the input forms are intuitive |
| **Keyring vs env distribution** | Breakdown of `token_source` across resolved tokens | Keyring should dominate interactive use; env should dominate CI |
| **Legacy migration completion** | Rate of `legacy_token_migrated` events trending toward zero over time | Approaching 0 indicates migration is complete |
| **Loopback usage rate** | Percentage of `host_resolved` events with `input_form: "loopback"` | Tracks local daemon adoption |

## Observability

## Observability

### Logging Requirements

All log entries are structured JSON. Token values MUST **never** appear in any log at any level.

| Log Event | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Host target resolution started | `DEBUG` | `{ event: "auth.host_resolve.start", has_hostname_flag, raw_input_redacted }` | Entry point of resolution. `raw_input_redacted` is the input form category, not the raw value. |
| Host target resolved from config | `DEBUG` | `{ event: "auth.host_resolve.config", host, api_url }` | Default resolution path |
| Host target resolved from flag | `DEBUG` | `{ event: "auth.host_resolve.flag", host, api_url, input_form }` | Explicit `--hostname` path |
| Host target matches config default | `DEBUG` | `{ event: "auth.host_resolve.matches_default", host }` | Flag provided but matches existing default |
| API URL normalization applied | `DEBUG` | `{ event: "auth.host_resolve.normalized", original_form, normalized_url }` | Trailing slashes, `/api` suffixes stripped |
| Loopback host detected | `DEBUG` | `{ event: "auth.host_resolve.loopback", host, scheme: "http" }` | HTTP scheme selected for loopback |
| Token resolved from env | `DEBUG` | `{ event: "auth.token_resolve.env", host }` | Token found in CODEPLANE_TOKEN |
| Token resolved from keyring | `DEBUG` | `{ event: "auth.token_resolve.keyring", host }` | Token found in OS keyring |
| Token resolved from legacy config | `DEBUG` | `{ event: "auth.token_resolve.config", host }` | Token found in config file (legacy path) |
| No token found | `WARN` | `{ event: "auth.token_resolve.not_found", host, checked_sources: ["env", "keyring", "config"] }` | No token in any source |
| Keyring backend unavailable | `WARN` | `{ event: "auth.keyring.unavailable", platform, reason }` | No suitable keyring backend on this platform |
| Keyring read error | `ERROR` | `{ event: "auth.keyring.read_error", host, error_message, platform }` | Keyring access failed unexpectedly |
| Keyring write error | `ERROR` | `{ event: "auth.keyring.write_error", host, error_message, platform }` | Keyring storage failed |
| Config file parse error | `WARN` | `{ event: "auth.config.parse_error", path, error_message }` | Config file exists but could not be parsed |
| Config default updated | `INFO` | `{ event: "auth.config.default_updated", previous_host, new_host }` | Default API URL changed after login |
| Legacy token scrubbed | `INFO` | `{ event: "auth.config.legacy_scrubbed", host }` | Legacy token removed from config file |
| Hostname validation failed | `WARN` | `{ event: "auth.hostname.invalid", error_type, input_length }` | Invalid `--hostname` input rejected |

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_cli_auth_host_resolve_total` | Counter | `source` (`config`, `flag`), `input_form` (`bare_hostname`, `full_url`, `loopback`, `config_default`), `platform` | Total host resolution operations |
| `codeplane_cli_auth_token_resolve_total` | Counter | `outcome` (`found`, `not_found`), `token_source` (`env`, `keyring`, `config`, `none`), `platform` | Total token resolution operations |
| `codeplane_cli_auth_hostname_errors_total` | Counter | `error_type` (`empty`, `too_long`, `invalid_characters`), `platform` | Total hostname validation failures |
| `codeplane_cli_auth_keyring_errors_total` | Counter | `operation` (`read`, `write`, `delete`), `platform` | Total keyring operation failures |
| `codeplane_cli_auth_config_default_changes_total` | Counter | `platform` | Total default host changes via login |
| `codeplane_cli_auth_legacy_token_migrations_total` | Counter | `platform` | Total legacy token → keyring migrations |
| `codeplane_cli_auth_host_resolve_duration_seconds` | Histogram | `source` (`config`, `flag`), `platform` | Duration of host resolution (buckets: 0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1) |
| `codeplane_cli_auth_keyring_operation_duration_seconds` | Histogram | `operation` (`read`, `write`, `delete`), `platform` | Duration of keyring operations (buckets: 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5) |

### Alerts & Runbooks

#### Alert 1: `AuthKeyringErrorRateHigh`

- **Condition**: `rate(codeplane_cli_auth_keyring_errors_total[15m]) > 5`
- **Severity**: Warning
- **Runbook**:
  1. Check the `platform` label to identify which OS is affected.
  2. For `platform=darwin`: Verify `security` binary is available. Check if macOS Keychain is locked (`security show-keychain-info`). Check if running in a restricted sandbox (container, CI) that blocks Keychain access.
  3. For `platform=linux`: Verify `secret-tool` is installed. Check if D-Bus session bus is running (`echo $DBUS_SESSION_BUS_ADDRESS`). Verify a Secret Service daemon (gnome-keyring-daemon, kwallet) is active.
  4. For `platform=win32`: Verify PowerShell is available. Check if the `Windows.Security.Credentials` namespace is accessible. Check group policy restrictions on PasswordVault.
  5. Check the `operation` label — if write errors dominate, the keyring may be full or permissions changed. If read errors dominate, the keyring daemon may be unhealthy.
  6. Verify the CLI error messages are guiding users to the `CODEPLANE_TOKEN` fallback.
  7. Check for recent OS updates that may have changed keyring behavior.

#### Alert 2: `AuthTokenNotFoundRateHigh`

- **Condition**: `rate(codeplane_cli_auth_token_resolve_total{outcome="not_found"}[15m]) / rate(codeplane_cli_auth_token_resolve_total[15m]) > 0.30` sustained for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check if a recent CLI update changed the token resolution logic or host normalization.
  2. Check if a config file format change caused parse failures (correlate with `auth.config.parse_error` logs).
  3. Check if keyring access errors are elevated (correlate with `codeplane_cli_auth_keyring_errors_total`).
  4. Check if a large number of users are targeting hosts they haven't authenticated with (correlate `has_hostname_flag` in telemetry).
  5. If concentrated on one `platform`, investigate platform-specific keyring issues.
  6. Verify the onboarding documentation still guides users to run `codeplane auth login` before other commands.

#### Alert 3: `AuthHostnameValidationErrorSpike`

- **Condition**: `rate(codeplane_cli_auth_hostname_errors_total[15m]) > 10`
- **Severity**: Info
- **Runbook**:
  1. Check the `error_type` label distribution.
  2. If `error_type=empty` dominates: A script or integration may be passing an empty hostname. Check CI pipeline configurations.
  3. If `error_type=too_long` dominates: An integration may be passing full URLs or paths as hostnames. Check documentation for correct usage.
  4. If `error_type=invalid_characters` dominates: Users may be confused about the expected input format. Consider improving the `--hostname` help text.
  5. This is an info-level alert. No immediate action required unless the rate is sustained.

#### Alert 4: `AuthKeyringLatencyHigh`

- **Condition**: `histogram_quantile(0.95, rate(codeplane_cli_auth_keyring_operation_duration_seconds_bucket[5m])) > 3` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check which `platform` and `operation` labels are affected.
  2. For macOS: The `security` subprocess can be slow with large keychains or background Keychain operations. Advise users to run `security unlock-keychain` if prompted.
  3. For Linux: Check D-Bus session latency. Restart the Secret Service daemon if needed.
  4. For Windows: PowerShell cold start can be slow. Check if `pwsh` (PowerShell Core) vs `powershell` (Windows PowerShell) makes a difference.
  5. If widespread and persistent, consider implementing a short-lived local token cache (with appropriate security review).

### Error Cases and Failure Modes

| Error Case | Behavior | User Message |
|------------|----------|-------------|
| `--hostname` is empty string | Throw validation error, exit 1 | `Hostname is required.` |
| `--hostname` exceeds 253 characters | Throw validation error, exit 1 | `Hostname too long (max 253 characters)` |
| `--hostname` contains invalid characters | Throw validation error, exit 1 | `Invalid hostname: {value}` |
| Config file missing | Use defaults silently | (No error — defaults to `https://api.codeplane.app`) |
| Config file malformed | Use defaults silently, log warning | (No error — defaults used, `WARN` log emitted) |
| Keyring backend unavailable (read) | Return `null`, fall through to next source | (No error unless no other source has a token) |
| Keyring backend unavailable (write) | Throw `SecureStorageUnavailableError` | `Secure credential storage is unavailable. Use CODEPLANE_TOKEN for headless or CI workflows.` |
| Keyring read fails unexpectedly | Throw with platform-specific message | `Failed to read token from {backend}: {detail}` |
| Keyring write fails unexpectedly | Throw with platform-specific message | `Failed to save token to {backend}: {detail}` |
| No token found in any source | Throw with actionable message | `no token found for {host}. Run \`codeplane auth login\` or set CODEPLANE_TOKEN.` |
| Legacy config token exists but host mismatches | Token skipped, fall through to "not found" | (No error — legacy token only matches if host matches) |

## Verification

## Verification

### Host Resolution Tests

#### Bare Hostname Input

- [ ] **Bare hostname resolves to HTTPS API URL**: Call `resolveAuthTarget({ hostname: "my-company.codeplane.dev" })`. Verify `apiUrl` is `https://api.my-company.codeplane.dev` and `host` is `my-company.codeplane.dev`.
- [ ] **Bare hostname with `api.` prefix is not double-prefixed**: Call `resolveAuthTarget({ hostname: "api.my-company.codeplane.dev" })`. Verify `apiUrl` is `https://api.my-company.codeplane.dev` (not `https://api.api.my-company.codeplane.dev`) and `host` is `my-company.codeplane.dev`.
- [ ] **Bare hostname is case-insensitive**: Call `resolveAuthTarget({ hostname: "My-Company.CODEPLANE.DEV" })`. Verify `host` is `my-company.codeplane.dev`.
- [ ] **Bare hostname with port preserves port**: Call `resolveAuthTarget({ hostname: "my-host.com:8443" })`. Verify the port is preserved in the API URL.

#### Full URL Input

- [ ] **Full HTTPS URL is used directly**: Call `resolveAuthTarget({ hostname: "https://api.my-company.codeplane.dev" })`. Verify `apiUrl` is `https://api.my-company.codeplane.dev` and `host` is `my-company.codeplane.dev`.
- [ ] **Full URL with trailing slash is normalized**: Call `resolveAuthTarget({ hostname: "https://api.example.com/" })`. Verify `apiUrl` has no trailing slash.
- [ ] **Full URL with trailing `/api` is normalized**: Call `resolveAuthTarget({ hostname: "https://example.com/api" })`. Verify `apiUrl` has `/api` stripped.
- [ ] **Full HTTP URL preserves HTTP scheme**: Call `resolveAuthTarget({ hostname: "http://staging.example.com" })`. Verify `apiUrl` starts with `http://`.

#### Loopback Input

- [ ] **`localhost` defaults to HTTP**: Call `resolveAuthTarget({ hostname: "localhost" })`. Verify `apiUrl` starts with `http://`.
- [ ] **`localhost:3000` defaults to HTTP with port**: Call `resolveAuthTarget({ hostname: "localhost:3000" })`. Verify `apiUrl` is `http://localhost:3000`.
- [ ] **`127.0.0.1` defaults to HTTP**: Call `resolveAuthTarget({ hostname: "127.0.0.1" })`. Verify `apiUrl` starts with `http://`.
- [ ] **`127.0.0.1:3000` defaults to HTTP with port**: Call `resolveAuthTarget({ hostname: "127.0.0.1:3000" })`. Verify `apiUrl` is `http://127.0.0.1:3000`.
- [ ] **`[::1]:3000` defaults to HTTP for IPv6 loopback**: Call `resolveAuthTarget({ hostname: "[::1]:3000" })`. Verify `apiUrl` uses `http://` scheme.
- [ ] **`::1` defaults to HTTP for bare IPv6 loopback**: Call `resolveAuthTarget({ hostname: "::1" })`. Verify `apiUrl` uses `http://` scheme.

#### Config Default Resolution

- [ ] **No hostname flag uses config default**: Set config `api_url` to `https://api.custom.host`. Call `resolveAuthTarget({})`. Verify `apiUrl` is `https://api.custom.host` and `host` is `custom.host`.
- [ ] **Missing config file uses built-in default**: Delete the config file. Call `resolveAuthTarget({})`. Verify `apiUrl` is `https://api.codeplane.app`.
- [ ] **Malformed config file uses built-in default**: Write invalid YAML to the config file. Call `resolveAuthTarget({})`. Verify `apiUrl` is `https://api.codeplane.app`.
- [ ] **Hostname matching config default uses config's API URL**: Set config to `https://custom-api.example.com`. Call `resolveAuthTarget({ hostname: "example.com" })` where the config host normalizes to `example.com`. Verify the config's custom API URL is used rather than re-deriving.

#### Validation Edge Cases

- [ ] **Empty hostname throws error**: Call `resolveAuthTarget({ hostname: "" })`. Verify it falls through to config default (empty is treated as unset after trim).
- [ ] **Whitespace-only hostname throws error**: Call `apiUrlFromHostInput("   ")`. Verify it throws `"Hostname is required."`.
- [ ] **Maximum length hostname (253 chars) is accepted**: Construct a 253-character valid hostname. Call `resolveAuthTarget({ hostname: <253chars> })`. Verify no error.
- [ ] **Hostname exceeding 253 characters**: Construct a 254-character hostname. Verify appropriate behavior (either accepted gracefully or rejected with a clear error).

### Token Resolution Priority Tests

- [ ] **CODEPLANE_TOKEN env takes precedence over keyring**: Set `CODEPLANE_TOKEN=env_token`. Store `keyring_token` in keyring for the host. Call `resolveAuthToken`. Verify token is `env_token` and source is `"env"`.
- [ ] **Keyring takes precedence over legacy config**: Store `keyring_token` in keyring. Set `config_token` in legacy config for the same host. Call `resolveAuthToken`. Verify token is `keyring_token` and source is `"keyring"`.
- [ ] **Legacy config is used as last resort**: Clear env and keyring. Set `config_token` in config. Call `resolveAuthToken`. Verify token is `config_token` and source is `"config"`.
- [ ] **Empty CODEPLANE_TOKEN falls through to keyring**: Set `CODEPLANE_TOKEN=""`. Store `keyring_token` in keyring. Call `resolveAuthToken`. Verify token is `keyring_token` and source is `"keyring"`.
- [ ] **Whitespace-only CODEPLANE_TOKEN falls through to keyring**: Set `CODEPLANE_TOKEN="   "`. Store `keyring_token` in keyring. Call `resolveAuthToken`. Verify token is `keyring_token` and source is `"keyring"`.
- [ ] **No token in any source returns null**: Clear all sources. Call `resolveAuthToken`. Verify result is `null`.
- [ ] **requireAuthToken throws with actionable message**: Clear all sources. Call `requireAuthToken`. Verify it throws with message containing the host, `codeplane auth login`, and `CODEPLANE_TOKEN`.
- [ ] **Legacy config token only matches current host**: Set legacy config token with `api_url: https://api.host-a.com`. Call `resolveAuthToken({ hostname: "host-b.com" })`. Verify legacy token is NOT returned (host mismatch).

### Per-Host Credential Isolation Tests

- [ ] **Tokens for different hosts are independent**: Store `token_a` for `host-a.com` and `token_b` for `host-b.com`. Retrieve for `host-a.com` — verify `token_a`. Retrieve for `host-b.com` — verify `token_b`.
- [ ] **Deleting one host's token does not affect another**: Store tokens for both `host-a.com` and `host-b.com`. Delete `host-a.com`. Verify `host-b.com`'s token still exists.
- [ ] **Case-insensitive host key**: Store a token for `EXAMPLE.COM`. Retrieve for `example.com`. Verify the token is found.
- [ ] **Login to new host changes config default**: Login to `host-a.com`. Verify config `api_url` is `https://api.host-a.com`. Login to `host-b.com`. Verify config `api_url` changed to `https://api.host-b.com`.
- [ ] **Previous host's token survives default switch**: Login to `host-a.com`, then login to `host-b.com`. Verify `resolveAuthToken({ hostname: "host-a.com" })` still returns `host-a.com`'s token.

### CLI E2E Tests

#### Login with `--hostname`

- [ ] **`codeplane auth login --with-token --hostname custom.host.com` stores token for custom host**: Pipe a valid token. Verify `codeplane auth status --hostname custom.host.com` reports logged in.
- [ ] **`codeplane auth login --with-token --hostname localhost:3000` uses HTTP**: Pipe a valid token targeting a local daemon. Verify the stored API URL uses `http://`.
- [ ] **`codeplane auth login --with-token --hostname https://api.example.com` accepts full URL**: Pipe a valid token. Verify `codeplane auth status --hostname example.com` reports logged in.
- [ ] **Login switches the config default**: Check `codeplane config get api_url` before and after login with `--hostname new.host.com`. Verify the default changed.

#### Logout with `--hostname`

- [ ] **`codeplane auth logout --hostname custom.host.com` clears only that host's token**: Login to both `host-a.com` and `host-b.com`. Logout from `host-a.com`. Verify `host-b.com` is still logged in.
- [ ] **`codeplane auth logout` without `--hostname` clears the default host's token**: Login to `host-a.com`. Logout without flag. Verify the default host's token is removed.

#### Status with `--hostname`

- [ ] **`codeplane auth status --hostname custom.host.com` checks the specified host**: Login to `custom.host.com`. Run `codeplane auth status --hostname custom.host.com --json`. Verify `host` in JSON matches.
- [ ] **`codeplane auth status --hostname unauthed.host.com` reports not logged in**: Run status for a host with no stored token. Verify `logged_in: false`.

#### Token with `--hostname`

- [ ] **`codeplane auth token --hostname custom.host.com` prints token for that host**: Login to `custom.host.com` with a known token. Run `codeplane auth token --hostname custom.host.com`. Verify the correct token is printed.
- [ ] **`codeplane auth token --hostname other.host.com` when not logged in errors**: Run token for an unauthenticated host. Verify exit code 1 and error references the host.

#### Cross-Command Integration

- [ ] **Login to host A, login to host B, status for A still works**: Login to `host-a.com`, login to `host-b.com`. Run `codeplane auth status --hostname host-a.com`. Verify it reports logged in.
- [ ] **CODEPLANE_TOKEN overrides per-host credential**: Login to `example.com` with token A. Set `CODEPLANE_TOKEN=token_b`. Run `codeplane auth status`. Verify source is `"env"` and a different token is in use.
- [ ] **Config command shows updated default after login**: Login with `--hostname new.host.com`. Run `codeplane config get api_url`. Verify it reflects `new.host.com`.

#### Boundary and Stress Tests

- [ ] **Maximum valid hostname (253 characters)**: Run `codeplane auth status --hostname <253-char-hostname>`. Verify the command processes it without error.
- [ ] **Hostname exceeding maximum (254 characters)**: Run `codeplane auth status --hostname <254-char-hostname>`. Verify the command either processes it gracefully or returns a clear error.
- [ ] **Hostname with all valid special characters**: Run `codeplane auth status --hostname host-with-dashes.and.dots.example.com:8443`. Verify correct resolution.
- [ ] **Rapid sequential resolutions for different hosts**: Run `codeplane auth token --hostname host-1.com`, `--hostname host-2.com`, `--hostname host-3.com` in quick succession (after storing tokens). Verify all return correct tokens.
- [ ] **Concurrent auth operations to different hosts**: Login to two hosts concurrently in separate processes. Verify both tokens are stored correctly.

### Credential Storage Tests

- [ ] **Test file backend round-trip**: Set `CODEPLANE_TEST_CREDENTIAL_STORE_FILE`. Store a token for a host. Load the token. Verify they match.
- [ ] **Test file backend per-host isolation**: Store tokens for `host-a` and `host-b`. Verify independent retrieval.
- [ ] **Test file backend deletion**: Store a token. Delete it. Verify `loadStoredToken` returns `null`.
- [ ] **Test file backend file permissions**: After storing, verify the credential file has `0o600` permissions.
- [ ] **Keyring unavailable falls through silently on read**: Disable keyring (`CODEPLANE_DISABLE_SYSTEM_KEYRING=1`). Call `loadStoredToken`. Verify it returns `null` without throwing.
- [ ] **Keyring unavailable throws on write**: Disable keyring. Call `storeToken`. Verify it throws `SecureStorageUnavailableError`.

### Security Tests

- [ ] **Token never appears in any log output**: Run auth commands with maximum verbosity. Grep all output for the token string. Verify zero matches.
- [ ] **Config file does not contain token after login**: Login, then read the config file. Verify no `token` field exists.
- [ ] **Legacy token is scrubbed from config after keyring migration**: Place a legacy token in config. Login (which triggers migration). Verify the config file no longer contains the `token` field.
- [ ] **Auth commands do not modify tokens for other hosts**: Login to `host-a.com`. Store a second token manually for `host-b.com`. Login again to `host-a.com` with a different token. Verify `host-b.com`'s token is unchanged.
