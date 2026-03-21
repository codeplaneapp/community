# AUTH_CLI_CLAUDE_LOGIN

Specification for AUTH_CLI_CLAUDE_LOGIN.

## High-Level User POV

When a developer or automation pipeline needs Codeplane to interact with Claude Code — for example, to run agent-assisted issue resolution in a remote workspace, drive an agent session from the CLI, or push Claude credentials to a repository secret for use in workflows — they first need to make a Claude Code authentication credential available to the Codeplane CLI. The `codeplane auth claude login` command is how that credential gets stored.

The user obtains a Claude setup token by running `claude setup-token` in their terminal (a command provided by the Claude Code CLI). This produces a token that starts with `sk-ant-oat`. The user then pipes that token into `codeplane auth claude login`:

```
claude setup-token | codeplane auth claude login
```

The CLI reads the token from standard input, validates that it matches the expected Claude setup token format, and stores it securely in the operating system's credential keyring. From that point forward, any Codeplane operation that requires Claude Code credentials — such as `codeplane workspace issue`, agent helper flows, or `codeplane auth claude push` — can automatically locate and use the stored token without the user needing to re-enter it or set environment variables.

This flow is valuable because it bridges two independent authentication systems. Codeplane has its own auth (via `codeplane auth login`), and Claude Code has its own auth. By storing the Claude credential inside the Codeplane credential chain, users get seamless agent-powered workflows: they issue a single `codeplane workspace issue` command and Codeplane handles creating a workspace, provisioning Claude auth into it, running the agent, and producing a landing request — all without the user needing to manually configure environment variables or transfer keys.

The login command also optionally auto-pushes the token to a repository secret (via `--repo`), so that remote workflows and workspaces associated with that repository can access Claude Code without manual secret configuration.

If the user already has Claude Code auth configured through other means — the `ANTHROPIC_AUTH_TOKEN` environment variable, the `ANTHROPIC_API_KEY` environment variable, or a local Claude Code OAuth login stored in the macOS Keychain — the `codeplane auth claude login` command still stores the setup token, but informs the user which auth source is currently active. This prevents confusion when multiple credential sources coexist.

If the token is invalid, empty, or times out (the CLI waits up to 5 minutes for stdin input), the command fails with a clear error message and stores nothing.

## Acceptance Criteria

### Definition of Done

The feature is complete when a user can pipe a valid Claude setup token (from `claude setup-token`) into `codeplane auth claude login`, have it validated locally against the `sk-ant-oat` pattern, stored securely in the OS credential keyring under the key `claude.subscription-token`, optionally auto-pushed to a repository secret, and then used automatically by all downstream Codeplane operations that require Claude Code auth — and when all edge cases, error paths, timeout behavior, and platform-specific credential backends are handled correctly.

### Functional Criteria

- [ ] Running `claude setup-token | codeplane auth claude login` reads the Claude setup token from stdin and stores it in the OS credential keyring under the storage key `claude.subscription-token`.
- [ ] After successful login, `resolveClaudeAuth()` returns a `ResolvedClaudeAuth` with `source: "stored_subscription_token"` and the token as `ANTHROPIC_AUTH_TOKEN`, provided no higher-priority auth source is set.
- [ ] The CLI prompts on stderr: `"Paste the Claude setup token from \`claude setup-token\`, then press Ctrl-D."` before reading stdin.
- [ ] The CLI exits with code `0` on successful login.
- [ ] The structured JSON result includes `status`, `stored_token`, `active_source`, `pushed_secret`, `pushed_repo`, `push_warning`, and `message` fields.
- [ ] The `active_source` field reflects whichever Claude auth source is currently effective after storage (which may differ from `stored_subscription_token` if an env var overrides).
- [ ] No network request is made to validate the Claude token itself — validation is purely local pattern matching.
- [ ] If `--repo OWNER/REPO` is provided and the user has a valid Codeplane auth token, the CLI also pushes the Claude setup token as the `ANTHROPIC_AUTH_TOKEN` repository secret.
- [ ] If `--repo` is omitted but a repository can be inferred from the current directory context, the CLI attempts to push the secret; if inference fails, the push is silently skipped (no error).
- [ ] If `--repo` is omitted and repo inference fails, the push is skipped and the result contains no `pushed_secret` or `pushed_repo` fields.
- [ ] If `--repo` is explicitly provided and the push fails, the CLI raises an error (non-zero exit).
- [ ] If `--repo` is omitted and repo inference succeeds but the push fails, the CLI includes a `push_warning` in the result instead of failing.
- [ ] A previously stored Claude setup token for the same key is overwritten by a new login.

### Token Format Constraints

- [ ] The token must match the regex pattern: `\bsk-ant-oat[0-9a-z-]*-[A-Za-z0-9._-]+\b`.
- [ ] The `extractClaudeSetupToken` function extracts the first matching token from the input string, allowing surrounding text.
- [ ] Leading and trailing whitespace around the full stdin input is trimmed before extraction.
- [ ] Trailing newline characters from pipe/echo are handled transparently.
- [ ] Tokens that do not contain the `sk-ant-oat` prefix anywhere in the input are rejected.
- [ ] The minimum valid token is `sk-ant-oat` followed by at least a hyphen and one character in `[A-Za-z0-9._-]` (e.g., `sk-ant-oat-X`).
- [ ] There is no explicit maximum token length enforced by the pattern, but the stdin timeout acts as a practical bound.

### Stdin Input Constraints

- [ ] The CLI reads stdin using `Bun.stdin.text()` with a 5-minute timeout (`CLAUDE_SETUP_TOKEN_TIMEOUT_MS = 5 * 60 * 1000`).
- [ ] If stdin does not produce EOF within 5 minutes, the CLI exits with error: `"Timed out waiting for Claude setup token on stdin."`.
- [ ] If stdin is empty (zero bytes after trimming), the CLI exits with error: `"no Claude setup token provided on stdin"`.
- [ ] If stdin contains text but no matching `sk-ant-oat` pattern, the CLI exits with error: `"Invalid Claude setup token. Run \`claude setup-token\` and provide the resulting sk-ant-oat token."`.
- [ ] Binary or non-UTF-8 stdin content that does not match the pattern is rejected with the invalid token error.

### Credential Storage Constraints

- [ ] The token is stored using the shared `storeToken` function with host key `claude.subscription-token` (not a real hostname — a synthetic key).
- [ ] On macOS, stored in macOS Keychain via `security add-generic-password -U -s codeplane-cli -a claude.subscription-token -w <token>`.
- [ ] On Linux, stored via `secret-tool store --label="Codeplane CLI token" service codeplane-cli host claude.subscription-token` with the token piped on stdin.
- [ ] On Windows, stored in Windows Credential Locker via PowerShell `PasswordVault` with resource `codeplane-cli` and username `claude.subscription-token`.
- [ ] In test mode (`CODEPLANE_TEST_CREDENTIAL_STORE_FILE` is set), stored in a JSON file at the specified path with `0o600` permissions.
- [ ] If no supported credential backend is available, the CLI raises `SecureStorageUnavailableError` with message: `"Secure credential storage is unavailable. Use CODEPLANE_TOKEN for headless or CI workflows."`.

### Auth Resolution Priority (Post-Login Context)

- [ ] `resolveClaudeAuth()` checks sources in this order: (1) `ANTHROPIC_AUTH_TOKEN` env, (2) stored subscription token in keyring, (3) `ANTHROPIC_API_KEY` env, (4) local Claude Code OAuth keychain (macOS only).
- [ ] If `ANTHROPIC_AUTH_TOKEN` env is set, it takes priority over the stored subscription token, and the `active_source` in the login result reflects `"ANTHROPIC_AUTH_TOKEN env"`.
- [ ] The login command always stores the token regardless of env var precedence — it just reports the active source accurately.

### Edge Cases

- [ ] Empty stdin: error `"no Claude setup token provided on stdin"`, exit code non-zero, no credential stored.
- [ ] Whitespace-only stdin: same as empty stdin.
- [ ] Stdin with valid token embedded in surrounding text (e.g., `"Token: sk-ant-oat-abc-def123"`): the token is extracted successfully.
- [ ] Stdin with multiple `sk-ant-oat` tokens on different lines: the first match is used.
- [ ] Token that starts with `sk-ant-oat` but has no trailing hyphen-separated segment (e.g., `sk-ant-oat`): does not match the pattern, rejected.
- [ ] Non-`sk-ant-oat` token (e.g., `sk-ant-api-key-...`): rejected with invalid token error.
- [ ] Running login twice with different tokens: second token replaces the first in the keyring.
- [ ] Running login when `CODEPLANE_DISABLE_SYSTEM_KEYRING=1`: raises `SecureStorageUnavailableError`.
- [ ] Running login with `--repo` pointing to a non-existent or unauthorized repository: push fails with API error, login itself still stores the token (push failure is separate).
- [ ] Running login with `--repo` but no Codeplane auth configured: push fails with auth error; the Claude token is still stored locally.
- [ ] Stdin timeout after 5 minutes with no input: error `"Timed out waiting for Claude setup token on stdin."`, no credential stored.
- [ ] Running `claude setup-token | codeplane auth claude login` when `claude` is not installed: the pipe fails before the CLI reads stdin — the CLI sees empty stdin or a broken pipe and reports accordingly.

## Design

### CLI Command

**Command signature:**

```
codeplane auth claude login [--repo <OWNER/REPO>] [--json]
```

**Flags:**

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--repo` | string | No | Inferred from current directory context | Repository to auto-push the Claude credential as a secret |
| `--json` | boolean | No | `false` | Output structured JSON instead of human-readable text |

**Standard usage patterns:**

```bash
# Primary: pipe from claude setup-token
claude setup-token | codeplane auth claude login

# With explicit repository secret push
claude setup-token | codeplane auth claude login --repo myorg/myrepo

# Manual paste (interactive): paste token, then Ctrl-D
codeplane auth claude login
# <paste token>
# <Ctrl-D>

# JSON output for scripting
claude setup-token | codeplane auth claude login --json

# From a file
cat ~/claude-setup-token.txt | codeplane auth claude login

# From a secret manager
vault kv get -field=claude_token secret/team | codeplane auth claude login
```

**Pre-read prompt (on stderr):**

```
Paste the Claude setup token from `claude setup-token`, then press Ctrl-D.
```

**Successful output (JSON, on stdout):**

When the token is stored and auto-pushed to a repo:

```json
{
  "status": "logged_in",
  "stored_token": true,
  "active_source": "stored Claude subscription token",
  "pushed_secret": "ANTHROPIC_AUTH_TOKEN",
  "pushed_repo": "myorg/myrepo",
  "message": "Stored Claude setup token in keyring and pushed ANTHROPIC_AUTH_TOKEN to myorg/myrepo."
}
```

When stored but no repo push:

```json
{
  "status": "logged_in",
  "stored_token": true,
  "active_source": "stored Claude subscription token",
  "message": "Stored Claude setup token in keyring"
}
```

When stored but env var takes precedence:

```json
{
  "status": "logged_in",
  "stored_token": true,
  "active_source": "ANTHROPIC_AUTH_TOKEN env",
  "message": "Stored Claude setup token in keyring. Active auth remains ANTHROPIC_AUTH_TOKEN env."
}
```

When stored but auto-push failed (implicit repo):

```json
{
  "status": "logged_in",
  "stored_token": true,
  "active_source": "stored Claude subscription token",
  "push_warning": "Stored Claude setup token in keyring, but automatic repository secret push failed: 403 Forbidden",
  "message": "Stored Claude setup token in keyring, but automatic repository secret push failed: 403 Forbidden"
}
```

**Error output (stderr, exit code 1):**

```
Error: no Claude setup token provided on stdin
```

or

```
Error: Invalid Claude setup token. Run `claude setup-token` and provide the resulting sk-ant-oat token.
```

or

```
Error: Timed out waiting for Claude setup token on stdin.
```

or

```
Error: Secure credential storage is unavailable. Use CODEPLANE_TOKEN for headless or CI workflows.
```

### Relationship to Other `auth claude` Commands

After `codeplane auth claude login` succeeds:

- `codeplane auth claude status` reports `configured: true`, `source: "stored Claude subscription token"`, `stored_token_set: true`, `auth_kind: "ANTHROPIC_AUTH_TOKEN"`.
- `codeplane auth claude token` prints the stored token to stdout, with source metadata on stderr.
- `codeplane auth claude logout` clears the stored token from the keyring.
- `codeplane auth claude push` pushes the active Claude credential (which may be the stored token or an env var) to a repository secret.

### Relationship to Downstream Workflows

- `codeplane workspace issue` calls `ensureWorkspaceClaudeAuth()`, which calls `getClaudeAuthEnv()`, which calls `resolveClaudeAuth()`. If the stored subscription token is the active auth source, it is injected into the remote workspace as an env var.
- Agent helper flows in the CLI use `resolveClaudeAuth()` to configure the Claude Code subprocess environment.
- Repository workflows that need Claude access use the `ANTHROPIC_AUTH_TOKEN` repository secret (pushed by the `--repo` flag or by `codeplane auth claude push`).

### SDK Shape

The CLI delegates to the following utility functions from `claude-auth.ts`:

- `validateClaudeSetupToken(input: string): string` — trims input, extracts the first `sk-ant-oat` match via regex, throws if no match is found.
- `extractClaudeSetupToken(input: string): string | null` — extracts first regex match without throwing.
- `storeStoredClaudeAuthToken(token: string): void` — validates token, then calls `storeToken("claude.subscription-token", token)` to persist in the OS keyring.
- `loadStoredClaudeAuthToken(): string | null` — loads from keyring using key `claude.subscription-token`.
- `resolveClaudeAuth(): ResolvedClaudeAuth | null` — checks all four sources in priority order and returns the active one.
- `formatClaudeAuthSource(source: ClaudeAuthSource): string` — converts source enum to human-readable label.

For the optional repo push, the CLI calls:

- `resolveRepoRef(repo?: string)` — resolves `OWNER/REPO` from flag or local git/jj context.
- `api("POST", "/api/repos/:owner/:repo/secrets", { name, value })` — pushes the secret to the Codeplane server.

### Documentation

The following end-user documentation should be written:

1. **CLI Reference — `codeplane auth claude login`**: Document the command, the `--repo` flag, the stdin input contract, the Claude setup token format, and at least three usage examples (pipe from `claude setup-token`, manual paste, with `--repo`).

2. **Authentication Guide — "Claude Code Integration"**: A dedicated section explaining:
   - Why Codeplane needs Claude Code auth (agent workflows, workspace issue automation).
   - The four Claude auth sources and their priority order (`ANTHROPIC_AUTH_TOKEN` env > stored subscription token > `ANTHROPIC_API_KEY` env > local Claude Code keychain).
   - How to configure Claude auth via `codeplane auth claude login` vs environment variables.
   - How to verify auth status with `codeplane auth claude status`.

3. **Workspace Guide — "Agent Prerequisites"**: A section in the workspace documentation explaining that `codeplane workspace issue` requires Claude Code auth, how to set it up, and what error messages to expect if it's missing.

4. **Troubleshooting — Claude Auth Errors**: Document the four error messages (`no Claude setup token provided on stdin`, `Invalid Claude setup token`, `Timed out waiting for Claude setup token on stdin`, `Secure credential storage is unavailable`) with resolution steps for each.

## Permissions & Security

### Authorization Roles

- **Any user (including unauthenticated to Codeplane)** can invoke `codeplane auth claude login`. The command itself does not require prior Codeplane authentication — it stores a Claude credential, not a Codeplane credential.
- The `--repo` flag's auto-push behavior requires the user to be authenticated to Codeplane (valid Codeplane token) and to have **write access** to the target repository's secrets (typically Owner or Admin role on the repository).
- If the user has no Codeplane auth and uses `--repo`, the push fails with an auth error, but the Claude token is still stored locally.

### Rate Limiting

- No network request is made during Claude token storage, so server-side rate limiting does not apply to the login action itself.
- The optional `--repo` push makes a single `POST /api/repos/:owner/:repo/secrets` call, which is subject to the standard per-endpoint rate limit for secret writes.
- Credential storage operations are naturally rate-limited by OS keyring I/O; no additional application-level rate limit is necessary.
- The 5-minute stdin timeout prevents indefinite resource consumption from abandoned login sessions.

### Security Constraints

- **Token never logged**: The raw Claude setup token must never appear in CLI log output, structured logs, or error messages. Only the token format prefix (`sk-ant-oat`) and the source label are acceptable in diagnostics.
- **Token in memory**: The token is held in process memory only for the duration of the `readStdinWithTimeout` → `validateClaudeSetupToken` → `storeStoredClaudeAuthToken` flow. No global variable or cache retains it beyond this scope.
- **Credential file permissions**: When using the test file backend, the credential file is written with `0o600` (owner-read/write only).
- **Stdin over pipe, not argv**: The token is read from stdin, not from a command-line argument. This prevents the token from appearing in `ps` output, shell history, or `/proc/*/cmdline`.
- **Remote workspace seeding**: When the token is provisioned to a remote workspace (via `ensureWorkspaceClaudeAuth`), it is written to a file with `600` permissions owned by the workspace user. The auth file path is `~/.codeplane/claude-env.sh`.
- **Repo secret push**: When pushed to a repository secret, the token is encrypted at rest by the Codeplane secrets service. The secret name is `ANTHROPIC_AUTH_TOKEN`.
- **No token echo**: The login command never echoes the token back to stdout in its result payload. The `pushed_secret` field contains only the secret name, not the value.

### PII / Data Privacy

- The Claude setup token is a credential, not PII, but it grants access to Anthropic API usage and potentially billed resources. Treat it with the same sensitivity as an API key.
- No user-identifying information from Claude/Anthropic is transmitted or stored during this flow.
- The stored token does not contain embedded user identity — it is opaque to Codeplane.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `cli.auth.claude_login.attempted` | When `auth claude login` code path is entered | `cli_version`, `platform`, `has_repo_flag` |
| `cli.auth.claude_login.succeeded` | After token is validated and stored in keyring | `cli_version`, `platform`, `has_repo_flag`, `active_source`, `credential_backend`, `pushed_secret` (boolean), `push_warning` (boolean) |
| `cli.auth.claude_login.failed` | When validation, storage, or timeout fails | `cli_version`, `platform`, `error_type` (`empty_stdin`, `invalid_token`, `storage_unavailable`, `stdin_timeout`), `has_repo_flag` |
| `cli.auth.claude_login.push_succeeded` | When the optional repo secret push succeeds | `cli_version`, `platform`, `repo`, `secret_name` |
| `cli.auth.claude_login.push_failed` | When the optional repo secret push fails | `cli_version`, `platform`, `repo`, `error_type` (`auth_error`, `permission_denied`, `not_found`, `network_error`), `explicit_repo` (boolean) |

**Property definitions:**

- `cli_version`: The Codeplane CLI version string.
- `platform`: `darwin`, `linux`, or `win32`.
- `has_repo_flag`: Boolean — whether `--repo` was explicitly provided.
- `active_source`: The human-readable label of whichever Claude auth source is effective after storage (e.g., `"stored Claude subscription token"`, `"ANTHROPIC_AUTH_TOKEN env"`).
- `credential_backend`: `keychain` (macOS), `secret_service` (Linux), `credential_locker` (Windows), or `test_file`.
- `error_type`: Categorized failure reason.
- `pushed_secret`: Boolean indicating whether a repo secret was pushed.
- `push_warning`: Boolean indicating whether the push produced a warning instead of success.
- `repo`: The `OWNER/REPO` string (only for push events).
- `secret_name`: `ANTHROPIC_AUTH_TOKEN` (the name of the pushed secret).
- `explicit_repo`: Boolean — whether `--repo` was explicitly passed (vs inferred).

### Funnel Metrics

| Metric | Description | Success Indicator |
|--------|-------------|-------------------|
| Claude login attempt rate | How many users attempt `auth claude login` per day/week | Growing adoption correlates with agent workflow adoption |
| Claude login success rate | `succeeded / attempted` ratio | > 95% indicates clear UX and docs |
| Error distribution | Breakdown of `error_type` across failures | `invalid_token` dominant suggests users are confused about which token to provide |
| Auto-push rate | Percentage of successful logins that also push to a repo secret | Indicates how many users are setting up full agent workflow pipelines |
| Downstream workspace issue usage | Percentage of `claude login` users who subsequently run `workspace issue` within 24 hours | Indicates the login is converting to actual agent workflow usage |
| Auth source override rate | Percentage of logins where `active_source` is not `stored_subscription_token` | High values may indicate users are confused about env var precedence |

## Observability

### Logging Requirements

All log entries are structured JSON. The token value must **never** appear in log output.

| Log Point | Level | Structured Context | Notes |
|-----------|-------|-------------------|-------|
| Claude login initiated | `info` | `{ event: "auth.claude_login.start", has_repo_flag }` | Logged when `auth claude login` handler is entered |
| Stdin prompt displayed | `debug` | `{ event: "auth.claude_login.prompt" }` | After the instructional message is written to stderr |
| Token validated successfully | `debug` | `{ event: "auth.claude_login.validated", token_prefix: "sk-ant-oat" }` | Never log the full token |
| Token stored in keyring | `info` | `{ event: "auth.claude_login.stored", backend }` | `backend` = keychain/secret_service/credential_locker/test_file |
| Active auth source resolved | `debug` | `{ event: "auth.claude_login.source_resolved", active_source }` | Logged after storage to show which source is effective |
| Repo secret push attempted | `info` | `{ event: "auth.claude_login.push_start", repo, secret_name }` | Only when push is attempted |
| Repo secret push succeeded | `info` | `{ event: "auth.claude_login.push_ok", repo, secret_name }` | |
| Repo secret push failed | `warn` | `{ event: "auth.claude_login.push_failed", repo, error_message }` | For implicit repo, this is a warning; for explicit `--repo`, this becomes an error |
| Repo inference skipped | `debug` | `{ event: "auth.claude_login.push_skipped", reason: "no_repo_context" }` | When no `--repo` and no inferable repo |
| Validation failed: empty stdin | `warn` | `{ event: "auth.claude_login.failed", reason: "empty_stdin" }` | |
| Validation failed: invalid pattern | `warn` | `{ event: "auth.claude_login.failed", reason: "invalid_token" }` | |
| Keyring storage failed | `error` | `{ event: "auth.claude_login.failed", reason: "storage_unavailable", error_message }` | Include backend error text |
| Stdin read timeout | `warn` | `{ event: "auth.claude_login.failed", reason: "stdin_timeout" }` | |

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_cli_auth_claude_login_total` | Counter | `status` (`success`, `error`), `platform` | Total Claude login attempts |
| `codeplane_cli_auth_claude_login_errors_total` | Counter | `reason` (`empty_stdin`, `invalid_token`, `storage_unavailable`, `stdin_timeout`), `platform` | Error breakdown |
| `codeplane_cli_auth_claude_login_duration_seconds` | Histogram | `platform` | Time from command entry to completion (buckets: 0.01, 0.05, 0.1, 0.5, 1, 5, 30) |
| `codeplane_cli_auth_claude_login_push_total` | Counter | `status` (`success`, `error`, `skipped`), `platform` | Repo secret push outcomes |
| `codeplane_cli_auth_claude_login_active_source` | Counter | `source` (`stored_subscription_token`, `env_auth_token`, `env_api_key`, `local_claude_keychain`), `platform` | Which auth source is active after login |

### Alerts

**Alert 1: Elevated Claude login failure rate**

- **Condition**: `rate(codeplane_cli_auth_claude_login_errors_total[5m]) / rate(codeplane_cli_auth_claude_login_total[5m]) > 0.3` sustained for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check the `reason` label breakdown: is it dominated by `invalid_token`, `empty_stdin`, `storage_unavailable`, or `stdin_timeout`?
  2. If `invalid_token`: Check if Claude Code's `setup-token` command changed its output format. Verify the regex `sk-ant-oat[0-9a-z-]*-[A-Za-z0-9._-]+` still matches current Claude setup tokens. Check if users are accidentally piping API keys (`sk-ant-api*`) instead of setup tokens. Review recent documentation and error message clarity.
  3. If `empty_stdin`: Check if the `claude setup-token` command is failing silently (producing no output). Verify documentation examples work. Check if CI pipeline secrets are misconfigured.
  4. If `storage_unavailable`: Check platform-specific keyring availability. On macOS, verify `security` binary. On Linux, verify `secret-tool` and that a Secret Service daemon is running. On Windows, verify PowerShell access. Check if a container or sandboxed environment is preventing keyring access.
  5. If `stdin_timeout`: Check if users are running the command interactively without knowing they need to paste a token and press Ctrl-D. Verify the prompt message is being displayed. Consider whether the 5-minute timeout is too short for the use case.
  6. Check recent CLI releases for regressions in `claude-auth.ts` or `credentials.ts`.

**Alert 2: Claude login repo push failure spike**

- **Condition**: `rate(codeplane_cli_auth_claude_login_push_total{status="error"}[15m]) > 5`
- **Severity**: Warning
- **Runbook**:
  1. Check if the Codeplane server's `/api/repos/:owner/:repo/secrets` endpoint is healthy.
  2. Check if users' Codeplane auth tokens are expired or revoked (common if they ran `auth claude login` but forgot `auth login`).
  3. Check if repository permission settings changed — users need write/admin access to push secrets.
  4. Verify the `ANTHROPIC_AUTH_TOKEN` secret name is not being rejected by secret name validation rules.
  5. Check network connectivity between the CLI and the Codeplane server.

**Alert 3: Keyring storage errors spike**

- **Condition**: `rate(codeplane_cli_auth_claude_login_errors_total{reason="storage_unavailable"}[15m]) > 5`
- **Severity**: Warning
- **Runbook**:
  1. Identify affected platforms from the `platform` label.
  2. For macOS: verify `security` binary exists and Keychain Access is not locked. Check if the user is running in a non-interactive shell (e.g., `launchd`) where Keychain may not be unlocked.
  3. For Linux: verify `secret-tool` is installed and a Secret Service daemon (e.g., `gnome-keyring-daemon`) is running. Check for D-Bus session availability.
  4. For Windows: verify PowerShell is available and `Windows.Security.Credentials` WinRT type is accessible.
  5. Ensure the error message in CLI output clearly guides users to `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` environment variables as alternatives.
  6. Check if containerized or CI environments are triggering this — these should use env vars instead of `auth claude login`.

### Error Cases and Failure Modes

| Error Case | Behavior | Exit Code |
|------------|----------|----------|
| Stdin is empty after trim | Print `"no Claude setup token provided on stdin"` to stderr | 1 |
| Stdin has no `sk-ant-oat` match | Print `"Invalid Claude setup token. Run \`claude setup-token\` and provide the resulting sk-ant-oat token."` to stderr | 1 |
| Keyring backend unavailable | Print `"Secure credential storage is unavailable. Use CODEPLANE_TOKEN for headless or CI workflows."` to stderr | 1 |
| Keyring write fails (permission, locked) | Print platform-specific error message to stderr | 1 |
| Stdin read times out (5 minutes) | Print `"Timed out waiting for Claude setup token on stdin."` to stderr | 1 |
| Repo push fails with explicit `--repo` | Print API error message to stderr | 1 |
| Repo push fails with implicit repo (inferred) | Token is stored successfully; result includes `push_warning` field | 0 |
| Repo inference fails (no `--repo`, no repo context) | Token is stored successfully; push silently skipped | 0 |
| Codeplane auth not configured (affects push only) | Token is stored successfully; push fails or is skipped | 0 (unless `--repo` explicit) |

## Verification

### API Integration Tests

These tests validate that the repo secret push works correctly with the Codeplane server.

- [ ] **Push to repo secret succeeds**: Run `auth claude login --repo testorg/testrepo` with a valid Claude token piped, verify the `ANTHROPIC_AUTH_TOKEN` secret is created by calling `GET /api/repos/testorg/testrepo/secrets` and confirming the secret exists.
- [ ] **Push to repo secret overwrites**: Push a Claude token to a repo secret, then push a different one. Verify only the latest value is stored.
- [ ] **Push to unauthorized repo fails with `--repo`**: Run `auth claude login --repo otheruser/private-repo` with a valid token, verify exit code 1 and error message about permissions.
- [ ] **Push to non-existent repo fails with `--repo`**: Run `auth claude login --repo nonexistent/repo` with a valid token, verify exit code 1 and error message about not found.
- [ ] **Push requires Codeplane auth**: Clear Codeplane auth, run `auth claude login --repo testorg/testrepo`, verify the token is stored locally but push fails with auth error.

### CLI E2E Tests

**Happy path tests:**

- [ ] **Basic stdin login via pipe**: `echo "sk-ant-oat01-abc123DEF456.test_token-value" | codeplane auth claude login --json` exits with code 0 and outputs JSON with `status: "logged_in"`, `stored_token: true`.
- [ ] **Login with claude setup-token format**: Pipe a realistic Claude setup token matching `sk-ant-oat[0-9a-z-]*-[A-Za-z0-9._-]+`, verify success.
- [ ] **Login with `--repo` flag**: `echo "<valid-token>" | codeplane auth claude login --repo testorg/testrepo --json` exits with code 0 and JSON includes `pushed_secret: "ANTHROPIC_AUTH_TOKEN"` and `pushed_repo: "testorg/testrepo"`.
- [ ] **Login without `--repo` in non-repo directory**: `echo "<valid-token>" | codeplane auth claude login --json` in a directory with no repo context exits with code 0, `pushed_secret` is absent/null, no `push_warning`.
- [ ] **Token with trailing newline**: `printf "sk-ant-oat01-abc123.token\n" | codeplane auth claude login --json` succeeds.
- [ ] **Token with surrounding whitespace**: `echo "  sk-ant-oat01-abc123.token  " | codeplane auth claude login --json` succeeds.
- [ ] **Token embedded in surrounding text**: `echo "Your token is sk-ant-oat01-abc123.token please use it" | codeplane auth claude login --json` succeeds (first match is extracted).
- [ ] **Overwrite existing Claude token**: Run login twice with different valid tokens, then run `codeplane auth claude token` and verify the second token is returned.
- [ ] **Token from file**: `cat claude-token-file.txt | codeplane auth claude login --json` succeeds.
- [ ] **Token from heredoc**: `codeplane auth claude login --json <<< "sk-ant-oat01-abc.value"` succeeds.
- [ ] **Prompt message displayed**: Run `codeplane auth claude login` and capture stderr; verify it contains `"Paste the Claude setup token from \`claude setup-token\`, then press Ctrl-D."`.
- [ ] **Minimum valid token**: `echo "sk-ant-oat-X" | codeplane auth claude login --json` — this is the smallest string matching the regex; verify it succeeds.
- [ ] **Maximum practical token length (1000 chars)**: Generate a valid `sk-ant-oat01-` followed by 985 characters of `[A-Za-z0-9._-]`, pipe it, verify success.
- [ ] **Active source reflects env override**: Set `ANTHROPIC_AUTH_TOKEN=sk-existing`, pipe a different token into `auth claude login --json`, verify `active_source` is `"ANTHROPIC_AUTH_TOKEN env"` and `stored_token` is `true`.

**Error path tests:**

- [ ] **Empty stdin**: `echo "" | codeplane auth claude login` exits non-zero with `"no Claude setup token provided on stdin"`.
- [ ] **Whitespace-only stdin**: `echo "   " | codeplane auth claude login` exits non-zero with `"no Claude setup token provided on stdin"`.
- [ ] **No stdin (EOF immediately)**: `echo -n "" | codeplane auth claude login` exits non-zero with `"no Claude setup token provided on stdin"`.
- [ ] **Token without `sk-ant-oat` prefix**: `echo "some-random-string" | codeplane auth claude login` exits non-zero with `"Invalid Claude setup token"`.
- [ ] **Token with `sk-ant-api` prefix (wrong type)**: `echo "sk-ant-api01-abc123" | codeplane auth claude login` exits non-zero with `"Invalid Claude setup token"`.
- [ ] **Token that is just the prefix with no trailing segment**: `echo "sk-ant-oat" | codeplane auth claude login` exits non-zero with `"Invalid Claude setup token"` (pattern requires hyphen and more chars).
- [ ] **Codeplane token piped instead of Claude token**: `echo "codeplane_abc123def456" | codeplane auth claude login` exits non-zero with `"Invalid Claude setup token"`.
- [ ] **GitHub PAT piped**: `echo "ghp_abc123def456" | codeplane auth claude login` exits non-zero with `"Invalid Claude setup token"`.
- [ ] **Binary data on stdin**: Pipe non-UTF-8 binary content, verify exits non-zero with an appropriate error.
- [ ] **Input exceeding 10KB**: Pipe a very large string (10,001+ bytes) with no valid token — verify it is handled gracefully (rejected or timeout-bounded).
- [ ] **No credential backend available**: Set `CODEPLANE_DISABLE_SYSTEM_KEYRING=1`, pipe a valid token, verify exit non-zero with `SecureStorageUnavailableError` message.
- [ ] **Explicit `--repo` with push failure**: `echo "<valid-token>" | codeplane auth claude login --repo nonexistent/repo --json` — verify exit code is non-zero.

**Credential storage tests:**

- [ ] **Test file backend roundtrip**: Set `CODEPLANE_TEST_CREDENTIAL_STORE_FILE=/tmp/test-claude-creds.json`, pipe a valid Claude token, then call `codeplane auth claude token` and verify the returned token matches.
- [ ] **Test file permissions**: After writing to test file backend, verify file permissions are `0o600`.
- [ ] **Test file backend key**: After writing, read the JSON file directly and verify the token is stored under key `claude.subscription-token`.
- [ ] **Storage key isolation**: After `auth claude login`, verify that `loadStoredToken("claude.subscription-token")` returns the token and that Codeplane host-keyed tokens are unaffected.

**Cross-command integration tests:**

- [ ] **Login then status**: `auth claude login` then `codeplane auth claude status --json` shows `configured: true`, `source: "stored Claude subscription token"`, `stored_token_set: true`, `auth_kind: "ANTHROPIC_AUTH_TOKEN"`.
- [ ] **Login then token print**: `auth claude login` then `codeplane auth claude token` prints the exact token that was piped to stdout.
- [ ] **Login then logout then status**: `auth claude login`, `codeplane auth claude logout`, then `codeplane auth claude status --json` shows `configured: false` and `stored_token_set: false` (assuming no env vars set).
- [ ] **Login then logout then token**: `auth claude login`, `codeplane auth claude logout`, then `codeplane auth claude token` errors.
- [ ] **Login then push**: `auth claude login`, then `codeplane auth claude push --repo testorg/testrepo --json` pushes the stored token as `ANTHROPIC_AUTH_TOKEN`.
- [ ] **ANTHROPIC_AUTH_TOKEN env overrides stored token**: After `auth claude login`, set `ANTHROPIC_AUTH_TOKEN` to a different value, verify `codeplane auth claude token` returns the env var value, not the stored one.
- [ ] **ANTHROPIC_API_KEY env with no stored token**: Clear stored token, set `ANTHROPIC_API_KEY`, verify `codeplane auth claude status --json` reports `source: "ANTHROPIC_API_KEY env"` and `auth_kind: "ANTHROPIC_API_KEY"`.
- [ ] **Login does not make network call**: Disconnect network or mock, pipe a valid token, verify login succeeds (no network required for token storage).
- [ ] **Auth claude login is independent of Codeplane auth**: Without any Codeplane auth configured, `auth claude login` with a valid Claude token succeeds (exit 0, token stored).

**Timeout tests:**

- [ ] **Stdin timeout fires**: Configure a short timeout (or mock the timeout), provide no stdin input, verify the CLI exits with `"Timed out waiting for Claude setup token on stdin."` after the timeout period.

**Platform-specific tests (where CI environments allow):**

- [ ] **macOS Keychain storage**: Verify Claude token round-trips through `security add-generic-password` / `security find-generic-password` with account `claude.subscription-token`.
- [ ] **Linux Secret Service storage**: Verify Claude token round-trips through `secret-tool store` / `secret-tool lookup` with host `claude.subscription-token`.
- [ ] **Windows Credential Locker storage**: Verify Claude token round-trips through PowerShell PasswordVault with username `claude.subscription-token`.

**Workspace integration E2E tests (if workspace infrastructure is available):**

- [ ] **Login then workspace issue**: After `auth claude login`, run `codeplane workspace issue <issue-number>` and verify that Claude auth is provisioned to the remote workspace (the `claude-env.sh` file is created with correct `ANTHROPIC_AUTH_TOKEN` export).
- [ ] **No Claude auth then workspace issue fails**: Clear all Claude auth sources, run `codeplane workspace issue`, verify it fails with the remediation message listing `codeplane auth claude login` as the first suggestion.
