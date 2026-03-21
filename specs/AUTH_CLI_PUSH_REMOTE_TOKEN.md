# AUTH_CLI_PUSH_REMOTE_TOKEN

Specification for AUTH_CLI_PUSH_REMOTE_TOKEN.

## High-Level User POV

When you clone a Codeplane repository over HTTPS and later run `jj git push`, jj needs credentials to authenticate the push against the Codeplane server. Today, you have to manually configure a git credential helper, embed a token in the remote URL, or switch to SSH—all of which require stepping outside Codeplane's tooling to configure something that should just work.

`codeplane auth setup-git` solves this. After you log in with `codeplane auth login`, running `codeplane auth setup-git` configures your local git and jj environment so that HTTPS push and fetch operations against your Codeplane instance automatically use your stored Codeplane token. No manual credential-helper scripts, no token pasting into URLs, no separate configuration steps. You authenticate once with Codeplane, set up git credentials once, and every `jj git push` and `jj git fetch` against that host works seamlessly from that moment forward.

The command installs a git credential helper that delegates to `codeplane auth token` to retrieve the stored token on demand. It writes the minimal necessary git configuration—scoped to your Codeplane host only—so it does not interfere with credentials for GitHub, GitLab, or any other remote. If you later log out with `codeplane auth logout`, the credential helper naturally returns nothing and git will prompt you or fail cleanly, signaling that you need to re-authenticate.

This feature is especially valuable in CI/CD pipelines and workspace environments where SSH key management is impractical. A pipeline can `codeplane auth login --with-token` and then `codeplane auth setup-git` to prepare the environment for push operations in two lines, with no interactive steps.

## Acceptance Criteria

### Definition of Done

- [ ] Running `codeplane auth setup-git` after a successful `codeplane auth login` enables `jj git push` over HTTPS to the authenticated Codeplane host without additional user configuration.
- [ ] Running `jj git fetch` over HTTPS to the same host also works without additional configuration.
- [ ] The credential helper is scoped exclusively to the user's Codeplane host and does not affect credentials for other git remotes.
- [ ] The command is idempotent: running it multiple times produces the same configuration without duplication.
- [ ] The command works on macOS, Linux, and Windows.
- [ ] The command supports `--hostname` to target a specific Codeplane instance.
- [ ] The command supports `--json` for structured output.
- [ ] If the user is not logged in, the command exits with a clear error and non-zero exit code.
- [ ] `codeplane auth logout` does not remove the credential helper configuration, but the helper gracefully returns no credentials when no token is stored.
- [ ] The credential helper binary path is resolved to an absolute path to avoid PATH-dependent failures.

### Edge Cases

- [ ] If `codeplane` is not on PATH (e.g., installed to a non-standard location), the helper must still work because it uses the absolute path recorded at setup time.
- [ ] If the user's global gitconfig already contains a credential helper for the same host, the command warns and replaces it (with `--force`) or errors without `--force`.
- [ ] If the user's global gitconfig is missing or unreadable, the command creates it with appropriate permissions (0644 on Unix).
- [ ] If the git config file is read-only, the command emits a clear permission-denied error.
- [ ] If `--hostname` targets a loopback address (127.0.0.1, localhost, ::1), the helper uses `http://` not `https://`.
- [ ] Token values are never written to git config files—only the helper command path is persisted.
- [ ] Hostnames longer than 253 characters (DNS maximum) are rejected.
- [ ] Hostnames containing whitespace, newlines, or null bytes are rejected.
- [ ] The credential helper protocol response uses exactly the format git expects: `protocol=https\nhost=<host>\nusername=x-token\npassword=<token>\n\n`.
- [ ] If the user has `CODEPLANE_TOKEN` set in the environment, the helper returns that token (respecting the existing priority: env > keyring > config).
- [ ] If both SSH and HTTPS remotes exist for the same repository, only HTTPS operations are affected.

### Boundary Constraints

- [ ] Hostname: 1–253 characters, valid DNS hostname or IP address.
- [ ] Credential helper path: absolute filesystem path, maximum 4096 characters (PATH_MAX on most systems).
- [ ] Token format unchanged: `codeplane_` prefix + 40 lowercase hex characters = 46 characters total.
- [ ] Git config section name: `credential "https://<host>"` — host is lowercase-normalized.

## Design

### CLI Command: `codeplane auth setup-git`

**Synopsis:**
```
codeplane auth setup-git [--hostname <HOST>] [--force] [--json]
```

**Description:**
Configures a git credential helper for the target Codeplane host so that HTTPS git operations (push, fetch, clone) automatically use the stored Codeplane authentication token.

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--hostname` | string | Configured default host | Codeplane hostname or API URL to configure credentials for |
| `--force` | boolean | false | Overwrite existing credential helper configuration for this host |
| `--json` | boolean | false | Return structured JSON output |

**Human-readable output (stderr):**
```
✓ Configured git credential helper for codeplane.app
  Helper: /usr/local/bin/codeplane
  Config: ~/.gitconfig
```

**Human-readable output when already configured (stderr):**
```
✓ Git credential helper for codeplane.app is already configured.
  Use --force to reconfigure.
```

**JSON output (stdout):**
```json
{
  "status": "configured",
  "host": "codeplane.app",
  "helper_path": "/usr/local/bin/codeplane",
  "config_file": "/Users/alice/.gitconfig",
  "protocol": "https",
  "created": true
}
```

**Error output (not logged in):**
```
Error: not logged in to codeplane.app. Run `codeplane auth login` first.
```

**Error output (existing config, no --force):**
```
Error: a credential helper is already configured for codeplane.app in ~/.gitconfig.
Use --force to overwrite, or remove the existing configuration manually.
```

### CLI Command: `codeplane auth credential-helper`

**Synopsis:**
```
codeplane auth credential-helper [get]
```

**Description:**
This is the git credential helper subcommand invoked by git. It is not intended to be called directly by users. It reads a credential request from stdin in git's credential-helper protocol format and responds with stored Codeplane credentials if the host matches.

**Behavior:**
1. Read credential request lines from stdin (key=value pairs, blank line terminated).
2. Extract `protocol` and `host` from the request.
3. If `protocol` is `https` (or `http` for loopback) and `host` matches the configured Codeplane host:
   - Resolve the token using the standard priority chain (env > keyring > config).
   - If a token is found, respond with `protocol`, `host`, `username=x-token`, and `password=<token>`.
   - If no token is found, respond with nothing (empty output), letting git fall through to the next helper.
4. For non-matching hosts, respond with nothing.
5. The `store` and `erase` operations are no-ops (Codeplane manages its own credential lifecycle).

**Protocol example:**
```
# git sends on stdin:
protocol=https
host=codeplane.app

# helper responds on stdout:
protocol=https
host=codeplane.app
username=x-token
password=codeplane_abc123...
```

### Git Configuration Written

The `setup-git` command writes to the user's global git config (`~/.gitconfig` or `$XDG_CONFIG_HOME/git/config`):

```ini
[credential "https://codeplane.app"]
    helper = !/usr/local/bin/codeplane auth credential-helper
```

For loopback hosts:
```ini
[credential "http://127.0.0.1:3000"]
    helper = !/usr/local/bin/codeplane auth credential-helper --hostname 127.0.0.1:3000
```

The `!` prefix tells git to treat the value as a shell command rather than a named helper.

### SDK Shape

No new SDK service methods are required. This feature is entirely CLI-side, leveraging existing `resolveAuthToken()` and `resolveAuthTarget()` from `auth-state.ts`.

### Web UI / TUI / Editor Plugin

No changes. This is a CLI-only feature.

### Documentation

**1. CLI reference page for `codeplane auth setup-git`:** Command synopsis, all flags, examples. Explain that this is a one-time setup per host. Show the two-line CI setup: `echo "$TOKEN" | codeplane auth login --with-token && codeplane auth setup-git`.

**2. CLI reference page for `codeplane auth credential-helper`:** Brief note that this is invoked by git, not by users. Document the credential-helper protocol for advanced users.

**3. Update the "Getting Started" / quick-start guide:** After the `codeplane auth login` step, add `codeplane auth setup-git` as the recommended next step for HTTPS users. Clarify that SSH users do not need this.

**4. Update the "Repositories" guide:** In the clone section, mention that HTTPS clone/push requires `codeplane auth setup-git` (or an SSH key). Show the workflow: login → setup-git → clone → push.

**5. Troubleshooting section:** "Push fails with 401 Unauthorized" → Run `codeplane auth setup-git`. "Credential helper not found" → Ensure `codeplane` is installed and re-run `codeplane auth setup-git`. "Wrong host credentials" → Run `codeplane auth setup-git --hostname <correct-host> --force`.

## Permissions & Security

### Authorization Roles

| Action | Required Role |
|--------|---------------|
| `codeplane auth setup-git` | Any authenticated user (must have a valid stored token) |
| `codeplane auth credential-helper get` | No server-side authorization; this is a local-only operation that reads from the local credential store |
| Actual git push to a repository | Repository write access (Owner, Admin, or Member with write permission) — enforced server-side on the git-receive-pack endpoint, not by this feature |

### Rate Limiting

- The credential helper is invoked locally by git. There is no server-side rate limiting needed for the helper itself.
- The underlying `jj git push` triggers server-side git-receive-pack, which is subject to existing server-side rate limits on repository transport operations.
- The `setup-git` command itself makes no network calls (it only verifies a locally stored token exists).

### Data Privacy & PII

- **Tokens are never written to git config files.** Only the path to the credential helper binary is persisted. The token is resolved at runtime from the OS keyring or environment variable.
- **The credential helper writes the token to stdout**, which is consumed by git over a pipe. The token is never written to disk by the helper.
- **Git's built-in `credential.helper` caching** (e.g., `cache` or `store` helpers) is not used. Codeplane's helper is the sole provider for the scoped host.
- **The helper path in gitconfig may reveal the Codeplane installation location**, which is not sensitive information.
- **Log files**: The credential helper must never log the token value. Only the fact that a credential was provided (or not) may be logged.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `AuthSetupGitConfigured` | User successfully runs `codeplane auth setup-git` | `host`, `protocol`, `force_used`, `already_configured`, `config_file_location`, `os_platform` |
| `AuthSetupGitAlreadyConfigured` | User runs `codeplane auth setup-git` and config already exists (no --force) | `host`, `protocol`, `os_platform` |
| `AuthSetupGitFailed` | User runs `codeplane auth setup-git` and it fails | `host`, `error_category` (not_logged_in, config_write_failed, existing_config), `os_platform` |
| `AuthCredentialHelperInvoked` | Git invokes the credential helper | `host`, `token_found` (boolean), `token_source` (env, keyring, config, none), `os_platform` |
| `AuthCredentialHelperHostMismatch` | Git invokes the helper for a non-Codeplane host | `requested_host`, `os_platform` |

### Funnel Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| Setup conversion rate | % of users who run `setup-git` within 24h of `auth login` | > 40% of HTTPS users |
| Push success rate after setup | % of `jj git push` that succeed on first attempt after `setup-git` | > 95% |
| Credential helper miss rate | % of `credential-helper get` invocations that return no token | < 5% (excluding expired sessions) |
| Time from login to first push | Median time between `auth login` and first successful HTTPS push | < 10 minutes |

### Success Indicators

- Reduction in support tickets / issues related to "push authentication failed".
- Increase in HTTPS clone/push ratio vs SSH (indicating lower friction).
- Zero token-leak incidents traceable to the credential helper.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Notes |
|-----------|-------|--------------------|-------|
| `setup-git` command invoked | INFO | `{ host, force, already_configured }` | Entry point logging |
| Git config written successfully | INFO | `{ host, config_file, helper_path }` | Confirms successful write |
| Git config write failed | ERROR | `{ host, config_file, error_message, error_code }` | Permission errors, missing directories |
| Existing config detected | WARN | `{ host, config_file, existing_helper }` | When --force not provided |
| Credential helper invoked | DEBUG | `{ requested_host, matched }` | High frequency; DEBUG only |
| Credential helper returned token | DEBUG | `{ host, token_source }` | **Never log the token value** |
| Credential helper no token found | WARN | `{ host, token_sources_checked }` | Indicates auth gap |
| Token resolution failed | ERROR | `{ host, error_message }` | Keyring unavailable, etc. |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_cli_setup_git_total` | Counter | `host`, `status` (configured, already_configured, failed), `os` | Total setup-git invocations |
| `codeplane_cli_credential_helper_requests_total` | Counter | `host`, `result` (provided, no_token, host_mismatch, error), `token_source` | Total credential helper invocations |
| `codeplane_cli_credential_helper_duration_seconds` | Histogram | `host`, `result` | Latency of credential helper execution (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_cli_setup_git_config_write_errors_total` | Counter | `host`, `error_type` (permission, not_found, parse_error) | Config write failures |

### Alerts

#### Alert 1: High Credential Helper Failure Rate

**Condition:** `rate(codeplane_cli_credential_helper_requests_total{result="error"}[5m]) / rate(codeplane_cli_credential_helper_requests_total[5m]) > 0.1`

**Severity:** Warning

**Runbook:**
1. Check if a new CLI version was deployed that introduced a regression in `resolveAuthToken()`.
2. Inspect structured logs for `error_message` patterns—common causes: keyring daemon crashed (Linux), Keychain access denied (macOS after OS update), PowerShell execution policy change (Windows).
3. Verify the credential backend is functional: `codeplane auth token` should return a token. If it fails, the issue is in the credential storage layer, not the helper.
4. Check if the OS recently updated and broke the keyring integration (`secret-tool`, `security`, or PowerShell PasswordVault).
5. If widespread, consider issuing an advisory to users to re-run `codeplane auth login` to refresh stored credentials.

#### Alert 2: Credential Helper Latency Spike

**Condition:** `histogram_quantile(0.95, rate(codeplane_cli_credential_helper_duration_seconds_bucket[5m])) > 2.0`

**Severity:** Warning

**Runbook:**
1. The credential helper should complete in < 100ms. Latencies > 2s indicate a systemic issue.
2. On macOS: check if Keychain is locked or prompting for a password (common after sleep/reboot). Run `security unlock-keychain` interactively.
3. On Linux: check if `secret-tool` is hanging due to a dbus/secret-service issue. Restart the gnome-keyring-daemon or equivalent.
4. On Windows: check if PowerShell startup is slow due to profile scripts. The helper runs PowerShell inline, so slow profiles cause latency.
5. If the issue is environmental and not fixable, recommend users set `CODEPLANE_TOKEN` as an environment variable to bypass the keyring entirely.

#### Alert 3: Setup-Git Config Write Failures Spike

**Condition:** `rate(codeplane_cli_setup_git_config_write_errors_total[15m]) > 5`

**Severity:** Info

**Runbook:**
1. Check `error_type` label distribution.
2. `permission`: Users may be running in restricted environments (containers, read-only home dirs). Advise using `CODEPLANE_TOKEN` env var as an alternative.
3. `not_found`: The user's home directory or XDG config directory doesn't exist. This is unusual but can happen in minimal container images.
4. `parse_error`: The existing gitconfig has syntax errors that prevent safe modification. Advise users to fix their gitconfig manually.

### Error Cases and Failure Modes

| Error | Cause | User-Facing Message | Recovery |
|-------|-------|---------------------|----------|
| Not logged in | No token in env, keyring, or config | `Error: not logged in to <host>. Run 'codeplane auth login' first.` | Run `codeplane auth login` |
| Config file permission denied | ~/.gitconfig not writable | `Error: cannot write to <path>: permission denied.` | Fix file permissions |
| Config file parse error | Malformed existing gitconfig | `Error: cannot parse <path>: <details>. Fix the file manually or use --force.` | Fix gitconfig syntax |
| Existing helper conflict | Another credential helper already configured for this host | `Error: a credential helper is already configured for <host>. Use --force to overwrite.` | Add `--force` flag |
| codeplane binary not found | Bun.which("codeplane") returns null at setup time | `Error: could not resolve the absolute path to the codeplane binary.` | Ensure codeplane is on PATH or specify path |
| Invalid hostname | Hostname contains invalid characters | `Error: invalid hostname "<input>".` | Provide valid hostname |
| Keyring unavailable during helper invocation | OS keyring not available in current session | Helper returns empty output; git falls through to next helper or prompts | Set `CODEPLANE_TOKEN` env var |

## Verification

### Integration / E2E Tests

#### Setup-Git Command Tests

| # | Test | Type |
|---|------|------|
| 1 | `codeplane auth setup-git` after `codeplane auth login --with-token` writes a credential helper entry to the global gitconfig scoped to the target host. | CLI integration |
| 2 | Running `codeplane auth setup-git` twice without `--force` succeeds with "already_configured" status and does not duplicate the config entry. | CLI integration |
| 3 | Running `codeplane auth setup-git` twice with `--force` on the second invocation replaces the existing entry cleanly. | CLI integration |
| 4 | `codeplane auth setup-git --json` returns a valid JSON object with `status`, `host`, `helper_path`, `config_file`, `protocol`, and `created` fields. | CLI integration |
| 5 | `codeplane auth setup-git` when not logged in exits with code 1 and prints "not logged in" error to stderr. | CLI integration |
| 6 | `codeplane auth setup-git --hostname custom.codeplane.example` writes the credential helper scoped to `https://custom.codeplane.example`. | CLI integration |
| 7 | `codeplane auth setup-git --hostname 127.0.0.1:3000` writes the credential helper scoped to `http://127.0.0.1:3000` (loopback uses http). | CLI integration |
| 8 | `codeplane auth setup-git` writes the absolute path to the `codeplane` binary in the helper config, not a relative path. | CLI integration |
| 9 | `codeplane auth setup-git` with a read-only gitconfig file exits with code 1 and a clear permission error. | CLI integration |
| 10 | `codeplane auth setup-git` when a different credential helper already exists for the same host (without `--force`) exits with code 1 and an informative error. | CLI integration |
| 11 | `codeplane auth setup-git --hostname ""` exits with an invalid hostname error. | CLI integration |
| 12 | `codeplane auth setup-git --hostname` with a 254-character hostname exits with an invalid hostname error. | CLI integration |
| 13 | `codeplane auth setup-git --hostname` with exactly 253 characters succeeds. | CLI integration |
| 14 | `codeplane auth setup-git --hostname "host with spaces"` exits with an invalid hostname error. | CLI integration |

#### Credential Helper Tests

| # | Test | Type |
|---|------|------|
| 15 | `codeplane auth credential-helper get` with matching host on stdin returns `username=x-token` and `password=<stored-token>`. | CLI integration |
| 16 | `codeplane auth credential-helper get` with non-matching host on stdin returns empty output. | CLI integration |
| 17 | `codeplane auth credential-helper get` with no stored token returns empty output (no error, exit code 0). | CLI integration |
| 18 | `codeplane auth credential-helper get` when `CODEPLANE_TOKEN` is set uses the env token over the keyring. | CLI integration |
| 19 | `codeplane auth credential-helper get` with `protocol=http` and a loopback host returns credentials. | CLI integration |
| 20 | `codeplane auth credential-helper get` with `protocol=ssh` returns empty output (SSH doesn't use credential helpers). | CLI integration |
| 21 | `codeplane auth credential-helper store` is a no-op (exits 0, no side effects). | CLI integration |
| 22 | `codeplane auth credential-helper erase` is a no-op (exits 0, no side effects). | CLI integration |
| 23 | `codeplane auth credential-helper get` with empty stdin returns empty output (exit code 0). | CLI integration |
| 24 | `codeplane auth credential-helper get` with malformed stdin (missing protocol line) returns empty output. | CLI integration |
| 25 | `codeplane auth credential-helper get` with `--hostname` flag targets the specified host for token resolution. | CLI integration |
| 26 | The credential helper completes in under 500ms on a warm keyring. | CLI performance |

#### End-to-End Push/Fetch Tests

| # | Test | Type |
|---|------|------|
| 27 | Full workflow: `codeplane auth login --with-token` → `codeplane auth setup-git` → `codeplane repo clone OWNER/REPO --protocol https` → make a change → `jj git push` succeeds with 0 exit code. | E2E (CLI + server) |
| 28 | Full workflow: after setup-git, `jj git fetch` from an HTTPS remote succeeds. | E2E (CLI + server) |
| 29 | After `codeplane auth logout`, `jj git push` over HTTPS fails with a 401 (credential helper returns nothing, git cannot authenticate). | E2E (CLI + server) |
| 30 | After `codeplane auth logout` and then `codeplane auth login --with-token` with a new token, `jj git push` succeeds without re-running `setup-git`. | E2E (CLI + server) |
| 31 | A user with read-only repository access can `jj git fetch` but `jj git push` is rejected by the server (403), confirming the credential helper provides credentials but the server enforces permissions. | E2E (CLI + server) |
| 32 | Push to a private repository works after setup-git with a token that has `repo` scope. | E2E (CLI + server) |
| 33 | Push with a revoked token fails with 401, confirming the credential helper does not cache stale tokens. | E2E (CLI + server) |

#### Cross-Platform Tests

| # | Test | Type |
|---|------|------|
| 34 | `codeplane auth setup-git` works on macOS and writes to `~/.gitconfig`. | CLI integration (macOS) |
| 35 | `codeplane auth setup-git` works on Linux and writes to `~/.gitconfig` (or `$XDG_CONFIG_HOME/git/config` if XDG is set). | CLI integration (Linux) |
| 36 | `codeplane auth setup-git` works on Windows and writes to the user's global gitconfig. | CLI integration (Windows) |
| 37 | The credential helper works when the OS keyring is unavailable and `CODEPLANE_TOKEN` is set as a fallback. | CLI integration |
| 38 | The credential helper works when `CODEPLANE_DISABLE_SYSTEM_KEYRING=1` is set and `CODEPLANE_TOKEN` provides the token. | CLI integration |

#### API Tests

| # | Test | Type |
|---|------|------|
| 39 | Server-side git-receive-pack endpoint accepts `Authorization: token <PAT>` in HTTP basic auth format (`x-token:<PAT>`). | API integration |
| 40 | Server-side git-receive-pack endpoint with an invalid token returns 401. | API integration |
| 41 | Server-side git-receive-pack endpoint with a token lacking `repo` scope returns 403. | API integration |
| 42 | `GET /:owner/:repo/info/refs?service=git-receive-pack` with valid credentials returns ref advertisement. | API integration |
| 43 | `GET /:owner/:repo/info/refs?service=git-upload-pack` with valid credentials returns ref advertisement (fetch). | API integration |

#### Idempotency and Conflict Tests

| # | Test | Type |
|---|------|------|
| 44 | Running `setup-git` for host A, then `setup-git` for host B, results in two separate credential entries that do not conflict. | CLI integration |
| 45 | A user with credentials for multiple Codeplane hosts can push to each host successfully—the correct token is selected per-host. | E2E (CLI + server) |
| 46 | If the gitconfig contains unrelated `[credential]` sections, `setup-git` does not corrupt them. | CLI integration |
| 47 | If the gitconfig contains comments, `setup-git` preserves them. | CLI integration |
