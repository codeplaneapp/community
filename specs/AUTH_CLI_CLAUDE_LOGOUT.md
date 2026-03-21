# AUTH_CLI_CLAUDE_LOGOUT

Specification for AUTH_CLI_CLAUDE_LOGOUT.

## High-Level User POV

When a developer has previously stored a Claude Code setup token in their Codeplane CLI credential store — via `codeplane auth claude login` — and wants to remove it, they run `codeplane auth claude logout`. This single command deletes the stored Claude subscription token from the operating system's secure credential store and confirms the action. The user sees whether a token was actually removed and whether Claude Code authentication is still available through other sources.

The Claude logout experience mirrors the simplicity of the main `codeplane auth logout` command, but targets a different credential. Codeplane stores Claude setup tokens (the `sk-ant-oat` prefixed tokens from `claude setup-token`) separately from Codeplane access tokens. Running `codeplane auth claude logout` clears only the stored Claude subscription token — it does not affect the user's Codeplane login, their Claude Code local login, or any environment variables they may have set.

This distinction matters because Claude Code authentication can come from four sources: the `ANTHROPIC_AUTH_TOKEN` environment variable, the stored subscription token (what this command clears), the `ANTHROPIC_API_KEY` environment variable, or a local Claude Code keychain entry (from running `claude login`). After running `codeplane auth claude logout`, the CLI checks whether Claude Code auth is still available from one of the remaining sources and tells the user. If the user had been authenticating Claude through an environment variable, the command warns them that their credential persists. If they authenticated through a local Claude Code login, they remain authenticated through that path. Only when the stored subscription token was their sole source of Claude auth does the logout leave them fully de-authenticated for Claude workflows.

This is important for agent-assisted development flows in Codeplane. When a user starts a workspace-based agent session, Codeplane seeds the workspace with Claude Code credentials. If a user wants to rotate their Claude token, switch from a subscription token to an API key, or simply clean up credentials on a shared machine, `codeplane auth claude logout` is the precise tool for removing the stored subscription token without disturbing other authentication paths.

The command is entirely local. It does not contact any server — neither Codeplane nor Anthropic. The token is only removed from the local credential store. If the same token was previously pushed to a repository secret (via `codeplane auth claude push`), the repository secret remains intact and must be managed separately through the secrets management flow.

After running `codeplane auth claude logout`, the user can verify their Claude auth state by running `codeplane auth claude status`, which will report whether any authentication source remains available.

## Acceptance Criteria

### Definition of Done

- [ ] `codeplane auth claude logout` deletes the stored Claude subscription token from the OS-native credential store (macOS Keychain, Linux Secret Service, or Windows PasswordVault) under the key `claude.subscription-token`.
- [ ] `codeplane auth claude logout` returns exit code `0` on success, including when no stored subscription token existed (idempotent no-op).
- [ ] `codeplane auth claude logout` returns exit code `1` only when an unexpected credential store error occurs (e.g., keyring backend crashes).
- [ ] `codeplane auth claude logout` displays a human-readable confirmation message that indicates whether a token was cleared and whether Claude auth remains available through another source.
- [ ] `codeplane auth claude logout --json` returns structured JSON output with `status`, `cleared`, `active_source`, and `message` fields.
- [ ] `codeplane auth claude logout` does NOT make any HTTP request to the Codeplane server or to Anthropic's API. It is entirely client-side.
- [ ] `codeplane auth claude logout` does NOT affect the user's Codeplane login token (stored under the `codeplane-cli` service).
- [ ] `codeplane auth claude logout` does NOT affect `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` environment variables.
- [ ] `codeplane auth claude logout` does NOT affect the local Claude Code keychain entry (the `Claude Code-credentials` macOS keychain item or equivalent).
- [ ] `codeplane auth claude logout` does NOT remove any repository secrets that may have been pushed via `codeplane auth claude push`.
- [ ] `codeplane auth claude status` correctly reports the updated auth state after `codeplane auth claude logout`.
- [ ] After logout, if the stored subscription token was the only Claude auth source, `codeplane auth claude token` fails with a descriptive error listing remediation steps.
- [ ] Shell completions for `codeplane auth claude logout` are available in bash, zsh, and fish.

### Edge Cases

- [ ] Logout when no stored Claude subscription token exists succeeds with exit code `0` and `cleared: false`.
- [ ] Logout when the keyring backend is disabled (`CODEPLANE_DISABLE_SYSTEM_KEYRING=1`) succeeds with exit code `0` and `cleared: false`.
- [ ] Logout when the keyring backend binary is missing (e.g., `secret-tool` not installed on Linux) succeeds with exit code `0` and `cleared: false`.
- [ ] Logout when the keyring backend throws an unexpected error (e.g., macOS Keychain locked, D-Bus failure on Linux) returns exit code `1` with a descriptive error message.
- [ ] Logout when `ANTHROPIC_AUTH_TOKEN` is set: `cleared` reports the subscription token deletion result, `active_source` reports `"ANTHROPIC_AUTH_TOKEN env"`, message informs user that auth remains active.
- [ ] Logout when `ANTHROPIC_API_KEY` is set (and no `ANTHROPIC_AUTH_TOKEN`): `active_source` reports `"ANTHROPIC_API_KEY env"`.
- [ ] Logout when a local Claude Code keychain entry exists (macOS only): `active_source` reports `"local Claude Code login"`.
- [ ] Logout when no Claude auth source remains after clearing: `active_source` is `null`/absent, message confirms full de-authentication.
- [ ] Logout when `ANTHROPIC_AUTH_TOKEN` is set to empty or whitespace-only string: the env var is not treated as a valid auth source.
- [ ] Running `codeplane auth claude logout` twice in succession: first returns `cleared: true`, second returns `cleared: false`, both exit `0`.
- [ ] Logout does not modify or delete the Codeplane config file (`~/.config/codeplane/config.toon`).
- [ ] Logout does not interact with or modify the test keychain payload (`CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD`).

### Boundary Constraints

- [ ] Keyring storage key: `claude.subscription-token` (constant, not configurable).
- [ ] Keyring service name: `codeplane-cli` (shared with Codeplane token storage).
- [ ] The `status` field in JSON output is always the string `"logged_out"`.
- [ ] The `cleared` field in JSON output is a boolean: `true` if a stored subscription token was removed, `false` if none existed.
- [ ] The `active_source` field in JSON output is a string describing the remaining auth source, or absent/null if no Claude auth remains.
- [ ] The `message` field in JSON output is a human-readable string summarizing the outcome.
- [ ] No command-line flags beyond `--json` are accepted. There is no `--hostname` flag because the Claude subscription token is not host-scoped.

## Design

### CLI Command

```
codeplane auth claude logout [--json]
```

**Arguments:**

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--json` | `boolean` | No | `false` | Output machine-parseable JSON instead of human-readable text |

**Behavior:**

1. Delete the stored Claude subscription token from the OS-native credential store under the key `claude.subscription-token`.
2. Re-resolve Claude auth via the full resolution chain to determine if any auth source remains.
3. Return the result with the `cleared` status and remaining auth source (if any).

**Human-readable output (default):**

When a token was cleared and auth remains:
```
Cleared stored Claude setup token. Active auth remains ANTHROPIC_AUTH_TOKEN env.
```

When a token was cleared and no auth remains:
```
Cleared stored Claude setup token
```

When no token was stored and auth remains:
```
No stored Claude setup token found. Active auth remains local Claude Code login.
```

When no token was stored and no auth remains:
```
No stored Claude setup token found
```

**Structured JSON output (`--json`):**

```json
{
  "status": "logged_out",
  "cleared": true,
  "active_source": "ANTHROPIC_AUTH_TOKEN env",
  "message": "Cleared stored Claude setup token. Active auth remains ANTHROPIC_AUTH_TOKEN env."
}
```

When no auth remains after clearing:

```json
{
  "status": "logged_out",
  "cleared": true,
  "active_source": null,
  "message": "Cleared stored Claude setup token"
}
```

**Exit codes:**

| Code | Meaning |
|------|--------|
| `0` | Logout completed (token removed, or no token was stored) |
| `1` | Unexpected error (credential store failure) |

**Relationship to other auth claude commands:**

| Command | Effect |
|---------|--------|
| `codeplane auth claude login` | Stores a Claude subscription token in the keyring (reverse of logout) |
| `codeplane auth claude logout` | Clears the stored Claude subscription token from the keyring (this feature) |
| `codeplane auth claude status` | Reports whether Claude auth is configured and from which source |
| `codeplane auth claude token` | Prints the active Claude token (should error if no auth remains after logout) |
| `codeplane auth claude push` | Pushes the active Claude credential into a repository secret (unaffected by logout) |

**Relationship to `codeplane auth logout`:**

`codeplane auth logout` and `codeplane auth claude logout` are independent operations that target different credentials. Running one does not affect the other. A user can be logged out of Codeplane but still have Claude auth configured, and vice versa.

### SDK Shape

The CLI Claude logout operation uses the following functions:

```typescript
// claude-auth.ts
function deleteStoredClaudeAuthToken(): boolean;
// Deletes the stored Claude subscription token from the keyring.
// Returns true if a token was deleted, false if none existed.
// Delegates to deleteStoredToken("claude.subscription-token").

function resolveClaudeAuth(): ResolvedClaudeAuth | null;
// Resolves Claude auth from all sources (env vars, stored token, keychain).
// Called AFTER deletion to check if auth remains through another source.

function formatClaudeAuthSource(source: ClaudeAuthSource): string;
// Formats the auth source for display.
// "env_auth_token" → "ANTHROPIC_AUTH_TOKEN env"
// "stored_subscription_token" → "stored Claude subscription token"
// "env_api_key" → "ANTHROPIC_API_KEY env"
// "local_claude_keychain" → "local Claude Code login"

// credentials.ts
function deleteStoredToken(host: string): boolean;
// Low-level credential store interface. For Claude, host is "claude.subscription-token".
```

### Test Credential Store

For E2E and integration testing, the credential store can be redirected to a plain JSON file by setting `CODEPLANE_TEST_CREDENTIAL_STORE_FILE` to a file path. The Claude subscription token is stored under the key `claude.subscription-token` in this file. The test backend supports the same `get`/`set`/`delete` interface as the OS-native backends.

Additionally, `CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD` can be set to a JSON string to simulate a local Claude Code keychain entry for testing the `active_source` resolution after logout.

### Documentation

End-user documentation should include:

1. **CLI Auth Claude Logout** — Usage of `codeplane auth claude logout`, what it clears vs. what it leaves intact, and how to verify the result with `codeplane auth claude status`.
2. **Claude Code Auth Sources** — The four-source resolution chain (`ANTHROPIC_AUTH_TOKEN` → stored subscription token → `ANTHROPIC_API_KEY` → local Claude Code keychain) and how `codeplane auth claude logout` only affects the "stored subscription token" source.
3. **Credential Rotation** — How to rotate Claude credentials: logout → login with new token, or switch from subscription token to API key by logging out and setting `ANTHROPIC_API_KEY`.
4. **Security Best Practices** — Guidance to log out on shared devices, note that repository secrets pushed via `codeplane auth claude push` are not affected by logout and must be managed separately, and that the token remains valid at Anthropic until it expires.
5. **Troubleshooting** — What to do if logout reports `cleared: false` unexpectedly (check `CODEPLANE_DISABLE_SYSTEM_KEYRING`, check that the keyring backend is available), what `active_source` values mean, and how to fully de-authenticate Claude (unset env vars, run `codeplane auth claude logout`, clear local Claude login).

## Permissions & Security

### Authorization Roles

| Action | Required Role |
|--------|---------------|
| `codeplane auth claude logout` | Any local user — no server authentication required |

CLI Claude logout is a client-side-only operation. It does not make any network request to Codeplane or Anthropic and therefore does not require any server-side authorization role. Any user who can execute the `codeplane` binary and access the OS keyring can run this command.

### Rate Limiting

No rate limiting applies. CLI Claude logout is a local operation that does not contact any server. The OS credential store has its own access controls (keyring unlock prompts, D-Bus permissions, etc.) that provide natural rate limiting.

### Data Privacy and PII

- **Token values are never logged or printed** by the logout command. Only the `cleared` boolean and the `active_source` description appear in output.
- **The stored subscription token is deleted**, not overwritten. The OS credential store handles secure erasure according to platform conventions.
- **Environment variables are not modified** — the CLI cannot alter the parent shell's environment. If `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` is set, the user is informed via the `active_source` field so they can take manual action.
- **Repository secrets are not affected** — any secret pushed via `codeplane auth claude push` remains in the repository's secret store and must be removed through the secrets management API.
- **The local Claude Code keychain entry is not affected** — `codeplane auth claude logout` only targets the Codeplane-managed subscription token, not the Claude Code application's own credential store.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `auth.cli.claude.logout` | User runs `codeplane auth claude logout` | `cleared` (boolean — whether a stored subscription token was actually removed), `active_source` (string or null — the remaining auth source after logout, if any), `had_env_auth_token` (boolean — whether `ANTHROPIC_AUTH_TOKEN` was set), `had_env_api_key` (boolean — whether `ANTHROPIC_API_KEY` was set), `had_local_keychain` (boolean — whether a local Claude Code keychain entry was present) |

### Funnel Metrics and Success Indicators

1. **Claude Logout-Login Cycle Time**: Median time between `auth.cli.claude.logout` and the next `auth.cli.claude.login` — indicates whether users are rotating tokens (short cycle) or permanently removing Claude auth (long or no follow-up login).
2. **Claude Logout Cleared Rate**: Ratio of `auth.cli.claude.logout` events with `cleared: true` vs. `cleared: false` — a persistently high `false` rate suggests users are confused about their Claude auth state or running logout redundantly.
3. **Post-Logout Auth Availability**: Percentage of `auth.cli.claude.logout` events where `active_source` is non-null — indicates how many users have redundant Claude auth sources (env vars, local keychain) that persist after logout.
4. **Claude Auth Source Distribution**: Breakdown of `active_source` values across all logout events — tracks whether users rely primarily on subscription tokens, API keys, env vars, or local keychain entries.
5. **Agent Session Impact**: Correlation between `auth.cli.claude.logout` events and subsequent failed agent session starts — indicates whether users are inadvertently breaking their agent workflows by logging out of Claude.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|-------------------|
| CLI Claude logout executed | `INFO` | `cleared`, `active_source`, `had_env_auth_token`, `had_env_api_key` |
| CLI Claude logout no backend available | `DEBUG` | `platform`, `keyring_disabled` |
| CLI Claude logout keyring delete succeeded | `DEBUG` | — |
| CLI Claude logout keyring delete no-op (no credential) | `DEBUG` | — |
| CLI Claude logout keyring error | `ERROR` | `error_message`, `platform`, `backend_type` |
| CLI Claude logout auth source check | `DEBUG` | `active_source`, `source_count` |

**CRITICAL:** Token values and API keys must NEVER appear in logs. Only boolean indicators and source labels may be logged.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_cli_claude_logout_total` | Counter | `cleared` (true, false) | Total CLI Claude logout operations by outcome |
| `codeplane_cli_claude_logout_remaining_source` | Counter | `source` (env_auth_token, env_api_key, local_claude_keychain, none) | Distribution of remaining auth sources after Claude logout |
| `codeplane_cli_claude_logout_errors_total` | Counter | `platform` (darwin, linux, win32), `error_type` (keyring_locked, backend_missing, io_error, unknown) | Total CLI Claude logout errors by platform and type |

### Alerts and Runbooks

#### Alert: `CLIClaudeLogoutErrorRateSpikeAlert`
- **Condition**: `rate(codeplane_cli_claude_logout_errors_total[1h]) > 5`
- **Severity**: Info
- **Runbook**:
  1. This alert fires if aggregated CLI telemetry (opt-in) reports a spike in Claude logout errors.
  2. Check the `platform` and `error_type` labels to identify whether the issue is platform-specific.
  3. For `keyring_locked` on macOS: Users may have changed their Keychain settings or are running in a remote session where the Keychain agent is unavailable. No server action needed — document workaround (`CODEPLANE_DISABLE_SYSTEM_KEYRING=1`).
  4. For `backend_missing` on Linux: Users may not have `secret-tool` installed. Update installation docs to include `libsecret-tools` as a recommended dependency.
  5. For `io_error` on Windows: Check if a Windows update changed PasswordVault API behavior. Review PowerShell command compatibility.
  6. If errors are across all platforms, check if a CLI update introduced a regression in the credential backend resolution logic (the Claude subscription token uses the same `deleteStoredToken` path as the Codeplane token).

#### Alert: `CLIClaudeLogoutOrphanedAgentSessionAlert`
- **Condition**: `rate(codeplane_agent_session_start_auth_failure_total[1h]) > 10 AND rate(codeplane_cli_claude_logout_total{cleared="true"}[2h]) > 5`
- **Severity**: Warning
- **Runbook**:
  1. This alert fires when a spike in agent session auth failures correlates with recent Claude logout activity, suggesting users are logging out without realizing it breaks their agent workflows.
  2. Check whether affected users had `active_source: null` at logout time (no remaining auth source).
  3. If this is widespread, consider adding a confirmation prompt or warning to `codeplane auth claude logout` when the stored token is the user's only Claude auth source.
  4. Review documentation for clarity on how Claude logout affects workspace and agent session flows.

### Error Cases and Failure Modes

| Error Case | Behavior | Exit Code |
|------------|----------|----------|
| No keyring backend available (headless server, `CODEPLANE_DISABLE_SYSTEM_KEYRING=1`) | Logout succeeds as no-op, `cleared: false` | `0` |
| Keyring backend binary missing (`security`, `secret-tool`, `pwsh`) | Logout succeeds as no-op, `cleared: false` | `0` |
| Keyring backend crashes or times out | Error message with platform-specific context | `1` |
| macOS Keychain is locked and unlock prompt is declined | Error message: `Failed to delete token from macOS Keychain: ...` | `1` |
| Linux D-Bus / Secret Service unavailable | Error message: `Failed to delete token from Secret Service: ...` | `1` |
| Windows PasswordVault API failure | Error message: `Failed to delete token from Windows Credential Locker: ...` | `1` |
| Test credential store file has invalid JSON | Error: `Invalid credential store file: <path>` | `1` |

## Verification

### CLI Integration Tests

#### Core Logout Flow
- [ ] `cli: codeplane auth claude logout returns exit code 0 when a stored subscription token exists`
- [ ] `cli: codeplane auth claude logout returns exit code 0 when no stored subscription token exists (no-op)`
- [ ] `cli: codeplane auth claude logout actually removes the token from the credential store (verified by subsequent loadStoredClaudeAuthToken returning null)`
- [ ] `cli: codeplane auth claude logout --json returns JSON with exactly status, cleared, active_source, and message fields`
- [ ] `cli: codeplane auth claude logout --json status field is always "logged_out"`
- [ ] `cli: codeplane auth claude logout --json cleared is true when a stored subscription token was present and removed`
- [ ] `cli: codeplane auth claude logout --json cleared is false when no stored subscription token existed`
- [ ] `cli: codeplane auth claude logout human-readable output matches expected message text`

#### Active Source Reporting
- [ ] `cli: codeplane auth claude logout reports active_source as "ANTHROPIC_AUTH_TOKEN env" when ANTHROPIC_AUTH_TOKEN is set`
- [ ] `cli: codeplane auth claude logout reports active_source as "ANTHROPIC_API_KEY env" when ANTHROPIC_API_KEY is set and ANTHROPIC_AUTH_TOKEN is not set`
- [ ] `cli: codeplane auth claude logout reports active_source as "local Claude Code login" when CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD is set with a valid access token and no env vars are set`
- [ ] `cli: codeplane auth claude logout reports active_source as null/undefined when no remaining auth source exists`
- [ ] `cli: codeplane auth claude logout message includes "Active auth remains ..." text when active_source is present`
- [ ] `cli: codeplane auth claude logout message does NOT include "Active auth remains" when active_source is absent`
- [ ] `cli: codeplane auth claude logout with ANTHROPIC_AUTH_TOKEN set to empty string does NOT report it as active_source`
- [ ] `cli: codeplane auth claude logout with ANTHROPIC_AUTH_TOKEN set to whitespace-only string does NOT report it as active_source`

#### Auth Source Priority After Logout
- [ ] `cli: when ANTHROPIC_AUTH_TOKEN and ANTHROPIC_API_KEY are both set, active_source reports ANTHROPIC_AUTH_TOKEN env (higher priority)`
- [ ] `cli: when ANTHROPIC_AUTH_TOKEN is set and local keychain exists, active_source reports ANTHROPIC_AUTH_TOKEN env (higher priority)`
- [ ] `cli: when only ANTHROPIC_API_KEY is set, active_source reports ANTHROPIC_API_KEY env`
- [ ] `cli: when only local keychain exists, active_source reports local Claude Code login`

#### Idempotency
- [ ] `cli: running codeplane auth claude logout twice in succession both return exit code 0`
- [ ] `cli: running codeplane auth claude logout twice: first returns cleared: true, second returns cleared: false`
- [ ] `cli: JSON output shape is identical between first and second logout (same keys, same types)`

#### Isolation From Other Credentials
- [ ] `cli: codeplane auth claude logout does NOT affect the Codeplane access token (verified by codeplane auth status still showing logged in)`
- [ ] `cli: codeplane auth claude logout does NOT modify the config file`
- [ ] `cli: codeplane auth claude logout does NOT make any HTTP requests (verified by intercepting/mocking fetch)`
- [ ] `cli: codeplane auth claude logout does NOT modify the CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD mock`

#### Status and Token Commands After Logout
- [ ] `cli: codeplane auth claude status reports configured: false after logout when no other source exists`
- [ ] `cli: codeplane auth claude status reports configured: true after logout when ANTHROPIC_AUTH_TOKEN is set`
- [ ] `cli: codeplane auth claude status reports stored_token_set: false after logout`
- [ ] `cli: codeplane auth claude token fails with descriptive error after logout when no other source exists`
- [ ] `cli: codeplane auth claude token succeeds after logout when ANTHROPIC_AUTH_TOKEN is set (falls back to env var)`
- [ ] `cli: the error message from codeplane auth claude token after logout includes remediation steps (run claude setup-token, set env var, or run claude login)`

#### No Server Contact
- [ ] `cli: codeplane auth claude logout completes successfully when the Codeplane server is unreachable`
- [ ] `cli: codeplane auth claude logout does not make any HTTP requests to Codeplane or Anthropic`

#### Credential Store Backend Edge Cases
- [ ] `cli: codeplane auth claude logout with CODEPLANE_DISABLE_SYSTEM_KEYRING=1 returns cleared: false, exit code 0`
- [ ] `cli: codeplane auth claude logout with CODEPLANE_TEST_CREDENTIAL_STORE_FILE uses the test file backend`
- [ ] `cli: codeplane auth claude logout with test credential store that has a claude.subscription-token removes it`
- [ ] `cli: codeplane auth claude logout with test credential store that is empty JSON ({}) returns cleared: false`
- [ ] `cli: codeplane auth claude logout with test credential store preserves entries for other keys (e.g., codeplane.app token)`

#### Login-Logout Roundtrip
- [ ] `cli: full claude login → claude status (configured: true) → claude logout → claude status (configured: false) roundtrip`
- [ ] `cli: full claude login → claude logout → claude login → claude status (configured: true) roundtrip (re-login works after logout)`
- [ ] `cli: full claude login → claude push → claude logout: repository secret remains (verified by checking secret still exists via API)`

### End-to-End (E2E) Tests — CLI

- [ ] `e2e/cli: codeplane auth claude logout succeeds when authenticated (exit code 0)`
- [ ] `e2e/cli: codeplane auth claude logout succeeds without a stored token (exit code 0, no-op)`
- [ ] `e2e/cli: codeplane auth claude logout --json returns valid JSON with all required fields`
- [ ] `e2e/cli: codeplane auth claude logout --json cleared field is boolean`
- [ ] `e2e/cli: codeplane auth claude logout followed by codeplane auth claude status shows correct state`
- [ ] `e2e/cli: codeplane auth claude login (pipe token) followed by codeplane auth claude logout followed by codeplane auth claude status shows complete roundtrip`
- [ ] `e2e/cli: codeplane auth claude logout does not affect codeplane auth status (Codeplane login remains intact)`

### End-to-End (E2E) Tests — Token Validation Boundary

- [ ] `e2e/cli: after claude logout, attempting codeplane workspace issue (which depends on Claude auth) fails with a descriptive remediation message`
- [ ] `e2e/cli: after claude logout with ANTHROPIC_AUTH_TOKEN set, workspace-dependent commands still succeed (env var fallback works)`

### Security-Focused Tests

- [ ] `security: codeplane auth claude logout output never contains a token value or API key`
- [ ] `security: codeplane auth claude logout --json output never contains a token value or API key`
- [ ] `security: after logout, the keyring entry for claude.subscription-token is fully removed (not just overwritten with empty string)`
- [ ] `security: the test credential store file maintains 0o600 permissions after logout operation`
- [ ] `security: codeplane auth claude logout does not leak token values to stderr, stdout, or any log output`

### Shell Completion Tests

- [ ] `completion: bash completion includes "logout" as a subcommand of "auth claude"`
- [ ] `completion: zsh completion includes "logout" as a subcommand of "auth claude"`
- [ ] `completion: fish completion includes "logout" as a subcommand of "auth claude"`
