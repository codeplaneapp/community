# AUTH_CLI_CLAUDE_TOKEN_PRINT

Specification for AUTH_CLI_CLAUDE_TOKEN_PRINT.

## High-Level User POV

When a developer uses Codeplane's agent-assisted features — such as running `codeplane workspace issue` to have Claude Code autonomously resolve an issue, driving an agent session from the CLI, or pushing Claude credentials to a repository secret — they sometimes need to retrieve the raw Claude Code credential that the Codeplane CLI is currently using. The `codeplane auth claude token` command serves exactly this purpose.

A developer might need the active Claude token for several reasons. They may want to pipe it into another tool that accepts Anthropic credentials, inject it into a CI environment variable, verify which credential source the CLI has resolved and confirm it is the one they expect, or forward it to a container or remote machine that will run Claude Code. Running `codeplane auth claude token` immediately prints the token to standard output and writes a brief source description to standard error, making it safe to compose in shell pipelines — the token goes to stdout, the human-readable metadata goes to stderr, so `codeplane auth claude token | pbcopy` cleanly copies just the token.

The command also supports JSON structured output via the `--json` flag, which returns the token, the environment variable key it maps to (`ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY`), and a human-readable source label describing where the credential was found. This is useful for scripting and automation where consumers need to programmatically extract the credential or verify its provenance.

The credential resolution follows a strict priority order that the developer can rely on. The `ANTHROPIC_AUTH_TOKEN` environment variable is checked first. Next, the stored Claude subscription token from the OS keyring (stored by `codeplane auth claude login`) is checked. Then the `ANTHROPIC_API_KEY` environment variable is checked. Finally, on macOS, the local Claude Code OAuth credential from the macOS Keychain is checked. The source label in the output always tells the developer which layer the token came from, so they can reason about which credential will be used by downstream agent flows.

If no Claude Code credential is found in any source, the command exits with a non-zero exit code and a clear error message listing all the ways the user can configure Claude Code auth — running `claude setup-token | codeplane auth claude login`, setting `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` environment variables, or signing in with Claude Code locally via `claude login`. The remediation guidance eliminates guesswork.

This command is purely local and offline — it never makes network requests. It does not validate the credential against Anthropic's servers. It prints whatever credential is currently resolved, even if it has been revoked or expired, making it reliable for offline workflows and debugging scenarios. This is the key distinction from `codeplane auth claude status`, which reports configuration state without revealing the credential value.

## Acceptance Criteria

### Definition of Done

The feature is complete when a user can run `codeplane auth claude token` and have the currently resolved Claude Code credential printed to stdout, with source metadata on stderr. JSON structured output via `--json` returns `env_key`, `source`, and `token` fields. If no credential is resolved, the command exits non-zero with an actionable remediation message listing all configuration paths. The command works across macOS, Linux, and Windows. All credential resolution sources are correctly prioritized and labeled. Help text is accurate and discoverable via `codeplane auth claude token --help`.

### Functional Constraints

- [ ] Running `codeplane auth claude token` with no flags MUST print the resolved Claude Code credential to stdout, followed by a newline.
- [ ] Token source metadata MUST be written to stderr, NOT stdout, to preserve pipeline composability.
- [ ] The stderr output format MUST be: `Token source: {source_label} ({env_key})\n`.
- [ ] The stdout output MUST be exactly the raw token string followed by a single newline character — no additional whitespace, prefixes, or decoration.
- [ ] Running `codeplane auth claude token --json` MUST output a JSON object to stdout with exactly three fields: `env_key` (string), `source` (string), and `token` (string).
- [ ] The `env_key` field MUST be one of `"ANTHROPIC_AUTH_TOKEN"` or `"ANTHROPIC_API_KEY"`, reflecting which environment variable the resolved credential maps to.
- [ ] The `source` field MUST use one of these human-readable labels: `"ANTHROPIC_AUTH_TOKEN env"`, `"stored Claude subscription token"`, `"ANTHROPIC_API_KEY env"`, `"local Claude Code login"`.
- [ ] Credential resolution priority MUST be: (1) `ANTHROPIC_AUTH_TOKEN` environment variable, (2) stored Claude subscription token in OS keyring, (3) `ANTHROPIC_API_KEY` environment variable, (4) local Claude Code keychain (macOS only).
- [ ] The first source that resolves a non-empty value wins; no further sources are checked.
- [ ] If no credential is found in any source, the command MUST exit with a non-zero exit code.
- [ ] The error message when no credential is found MUST include remediation instructions listing `claude setup-token | codeplane auth claude login`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, and `claude login` as options.
- [ ] The command MUST NOT make any network requests — credential resolution is entirely local.
- [ ] The command MUST NOT modify any stored credentials, config files, or keyring entries — it is a read-only operation.
- [ ] The `--json` flag MUST produce parseable JSON to stdout with no extraneous output.
- [ ] The command MUST be registered and visible in `codeplane auth claude --help` output.
- [ ] The command description in help text MUST be: `"Print the Claude Code token or API key in use"`.

### Edge Cases

- [ ] `ANTHROPIC_AUTH_TOKEN` is set to a non-empty string: it wins over all other sources, `env_key` is `"ANTHROPIC_AUTH_TOKEN"`, `source` is `"ANTHROPIC_AUTH_TOKEN env"`.
- [ ] `ANTHROPIC_AUTH_TOKEN` is set but whitespace-only: MUST be treated as unset (trimmed to empty → fall through).
- [ ] `ANTHROPIC_AUTH_TOKEN` is set to empty string: MUST be treated as unset.
- [ ] Both `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY` are set: `ANTHROPIC_AUTH_TOKEN` wins.
- [ ] Both `ANTHROPIC_AUTH_TOKEN` and a stored subscription token exist: `ANTHROPIC_AUTH_TOKEN` env wins.
- [ ] Only a stored subscription token exists: `source` is `"stored Claude subscription token"`, `env_key` is `"ANTHROPIC_AUTH_TOKEN"`.
- [ ] Only `ANTHROPIC_API_KEY` is set: `env_key` is `"ANTHROPIC_API_KEY"`, `source` is `"ANTHROPIC_API_KEY env"`.
- [ ] `ANTHROPIC_API_KEY` is set but whitespace-only: MUST be treated as unset.
- [ ] macOS keychain contains valid credential but no higher-priority source is set: `source` is `"local Claude Code login"`, `env_key` is `"ANTHROPIC_AUTH_TOKEN"`.
- [ ] macOS keychain JSON payload is malformed: silently skip.
- [ ] macOS keychain JSON payload exists but `claudeAiOauth.accessToken` is missing or empty: silently skip.
- [ ] Running on Linux or Windows: macOS keychain source silently skipped.
- [ ] CI container with no keychain and no env vars: exit non-zero with remediation message.
- [ ] All four sources available: first in priority order wins.
- [ ] No sources available: exit non-zero.
- [ ] `CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD` set: use test payload instead of real keychain.
- [ ] `CODEPLANE_DISABLE_SYSTEM_KEYRING=1`: keyring skipped for stored subscription token.
- [ ] In JSON mode, no credential found: exit non-zero, no stdout output.

### Boundary Constraints

- Token strings: unbounded in length.
- Environment variable values: accepted as-is with no maximum length constraint.
- JSON output encoding: UTF-8.
- Exit code on success: `0`.
- Exit code on failure: `1`.
- No positional arguments; only `--json` flag supported.

## Design

### CLI Command

**Command**: `codeplane auth claude token`

**Synopsis**:
```
codeplane auth claude token [--json]
```

**Options**:

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--json` | boolean | No | `false` | Output structured JSON to stdout instead of human-readable split output |

**Exit Codes**:

| Code | Meaning |
|------|--------|
| 0 | Credential found and printed |
| 1 | No credential found, or resolution error |

**Human-readable output (default)**:

stderr:
```
Token source: stored Claude subscription token (ANTHROPIC_AUTH_TOKEN)
```

stdout:
```
sk-ant-oat01-abc123def456...
```

**Structured JSON output (`--json`)**:

stdout:
```json
{
  "env_key": "ANTHROPIC_AUTH_TOKEN",
  "source": "stored Claude subscription token",
  "token": "sk-ant-oat01-abc123def456..."
}
```

| Field | Type | Always Present | Description |
|-------|------|----------------|-------------|
| `env_key` | string | Yes | The environment variable name the credential maps to: `"ANTHROPIC_AUTH_TOKEN"` or `"ANTHROPIC_API_KEY"` |
| `source` | string | Yes | Where the credential was loaded from — one of the four human-readable source labels |
| `token` | string | Yes | The raw credential value |

**Error output (stderr, exit code 1)**:

```
Error: no Claude Code auth found.
Run `claude setup-token | codeplane auth claude login`.
Or set ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY.
Or sign in with Claude Code locally (claude login).
```

**Source label mapping**:

| Internal Source | `env_key` | Display Label (`source`) |
|-----------------|-----------|-------------------------|
| `env_auth_token` | `ANTHROPIC_AUTH_TOKEN` | `ANTHROPIC_AUTH_TOKEN env` |
| `stored_subscription_token` | `ANTHROPIC_AUTH_TOKEN` | `stored Claude subscription token` |
| `env_api_key` | `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY env` |
| `local_claude_keychain` | `ANTHROPIC_AUTH_TOKEN` | `local Claude Code login` |

**Usage patterns**:

```bash
# Print current Claude credential
codeplane auth claude token

# Copy Claude credential to clipboard (macOS)
codeplane auth claude token | pbcopy

# Copy Claude credential to clipboard (Linux)
codeplane auth claude token | xclip -selection clipboard

# Get credential as JSON for scripting
codeplane auth claude token --json

# Extract just the token from JSON output
codeplane auth claude token --json | jq -r .token

# Inject into an environment variable
export ANTHROPIC_AUTH_TOKEN=$(codeplane auth claude token)

# Pass to a container
docker run -e ANTHROPIC_AUTH_TOKEN=$(codeplane auth claude token) my-workspace-image

# Check which env var to use in a script
ENV_KEY=$(codeplane auth claude token --json | jq -r .env_key)
TOKEN=$(codeplane auth claude token --json | jq -r .token)
export "$ENV_KEY=$TOKEN"
```

### Relationship to Other Claude Auth Commands

- `codeplane auth claude login` — stores a Claude setup token from stdin into the OS keyring.
- `codeplane auth claude logout` — removes the stored Claude setup token from the OS keyring.
- `codeplane auth claude status` — reports Claude auth configuration state **without revealing the credential value**.
- **`codeplane auth claude token`** — prints the raw resolved credential to stdout. This is the only Claude auth command that outputs the secret value.
- `codeplane auth claude push` — pushes the active Claude credential into a repository secret.

### SDK Shape

The CLI command delegates to:

- `resolveClaudeAuth(): ResolvedClaudeAuth | null` — Walks the four-source priority chain.
- `loadStoredClaudeAuthToken(): string | null` — Reads the stored subscription token from the OS keyring.
- `loadClaudeOAuthAccessTokenFromKeychain(): string | null` — Reads the local Claude Code OAuth access token from macOS Keychain (or test payload).
- `formatClaudeAuthSource(source: ClaudeAuthSource): string` — Maps internal source to display label.
- `getResolvedClaudeAuthToken(): { envKey, source, token }` — Wraps `resolveClaudeAuth()`, extracts token and env key, throws if not found.
- `shouldReturnStructuredOutput(context): boolean` — Detects `--json` flag.

### API Shape

This feature makes **no API calls**. It is entirely a local credential retrieval command.

### Documentation

1. **CLI Reference — `codeplane auth claude token`**: Document command, `--json` flag, output modes, all four source labels, both `env_key` values, exit codes, and usage examples.
2. **Authentication Guide — "Printing Your Claude Credential"**: When to use `auth claude token` vs `auth claude status`, resolution priority, common piping workflows.
3. **Troubleshooting — "No Claude Code Auth Found"**: Error message, four resolution sources, step-by-step recovery.
4. **Agent Workflows Guide — "Credential Forwarding"**: How token print feeds into workspace bootstrap, secret push, and manual forwarding.

## Permissions & Security

### Authorization Roles

- **Any user** can run `codeplane auth claude token`. The command requires only that a Claude credential exists in the local resolution chain.
- **Unauthenticated users** (no Claude credential anywhere) receive a clear "no Claude Code auth found" error — no partial information is disclosed.
- No server-side authorization check is performed because the command makes no network requests.
- No Owner, Admin, Member, Read-Only, or Anonymous role distinctions apply. The only gating is local credential existence.
- This command does not require Codeplane auth (`codeplane auth login`) — Claude auth is a separate, independent credential chain.

### Rate Limiting

- No server-side rate limiting applies because no network request is made.
- No client-side rate limiting is needed.
- Automated callers should avoid tight loops as keyring access on some platforms (especially macOS Keychain) incurs ~50-200ms process spawn overhead per invocation.

### Security Constraints

- **Token is printed to stdout**: Users must be aware it appears in terminal scrollback and shell history.
- **Token MUST NOT appear in logs**: At any log level (DEBUG, TRACE, etc.), only source label and env_key may be logged.
- **No network exposure**: The command must never transmit the token over the network.
- **stderr/stdout separation**: Token to stdout, metadata to stderr. This separation MUST be maintained for pipeline safety.
- **Keychain access (macOS)**: May prompt for user authorization; denial silently skips the source.
- **Terminal security**: Documentation should advise against running in shared tmux/screen sessions.
- **Credential file permissions**: Test credential store file MUST use `0o600` permissions.

### PII / Data Privacy

- The token is a credential, not PII, but grants access to Anthropic API resources and billable usage.
- No user-identifying information is disclosed by the command.
- Credential values MUST NOT be sent to any external telemetry, analytics, or logging service.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `cli.auth.claude_token_print.attempted` | When `codeplane auth claude token` is entered | `output_format` (`"text"` or `"json"`), `cli_version`, `platform` |
| `cli.auth.claude_token_print.succeeded` | Credential found and printed | `source` (internal enum), `env_key`, `output_format`, `cli_version`, `platform` |
| `cli.auth.claude_token_print.failed` | No credential found or error | `error_type` (`"no_credential"`, `"keyring_error"`), `cli_version`, `platform` |

**Critical rule**: The `token` value MUST NEVER be included in any telemetry event payload.

### Funnel Metrics & Success Indicators

| Metric | Description | Target |
|--------|-------------|--------|
| Claude token print success rate | `succeeded / attempted` | > 90% |
| Source distribution | Breakdown by source | `stored_subscription_token` ~50%+ |
| JSON vs text usage | `--json` proportion | 15-30% JSON |
| Token print → workspace issue | Users who print then run workspace issue within 5min | Validates credential verification workflow |
| Token print → push | Users who print then push within 5min | Validates inspect-then-push workflow |
| Failed print → login conversion | Users who fail then login within 10min | > 40% indicates effective remediation |
| Platform distribution | Breakdown by platform | Tracks cross-platform adoption |

## Observability

### Logging Requirements

All log entries are structured JSON. The token value MUST **never** appear in any log output.

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Command invoked | `DEBUG` | `{ event: "auth.claude_token_print.start", output_format }` |
| Credential resolved | `DEBUG` | `{ event: "auth.claude_token_print.resolved", source, env_key }` |
| Credential printed | `INFO` | `{ event: "auth.claude_token_print.completed", source, env_key }` |
| No credential found | `WARN` | `{ event: "auth.claude_token_print.failed", reason: "no_credential" }` |
| Keyring read error | `ERROR` | `{ event: "auth.claude_token_print.failed", reason: "keyring_error", error_message }` |
| Keyring backend not found | `DEBUG` | `{ event: "auth.claude_token_print.keyring_unavailable", platform }` |
| macOS keychain lookup failed | `DEBUG` | `{ event: "auth.claude_token_print.keychain_failed", reason }` |

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_cli_auth_claude_token_print_total` | Counter | `status`, `source`, `platform` | Total invocations |
| `codeplane_cli_auth_claude_token_print_errors_total` | Counter | `reason`, `platform` | Error breakdown |
| `codeplane_cli_auth_claude_token_print_duration_seconds` | Histogram | `platform`, `source` | Command duration. Buckets: 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1s |

### Alerts & Runbooks

#### Alert 1: `ClaudeTokenPrintHighFailureRate`
- **Condition**: `rate(errors[5m]) / rate(total[5m]) > 0.6` for 10 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check `reason` label breakdown.
  2. If `no_credential` dominates: onboarding/docs issue. Check `codeplane auth claude login` guidance. Verify `claude setup-token` still produces `sk-ant-oat` tokens.
  3. If `keyring_error` dominates: check platform distribution. Verify `security`/`secret-tool`/`pwsh` availability. Check enterprise security policy changes.
  4. Check recent CLI releases for regressions in `claude-auth.ts` or `credentials.ts`.

#### Alert 2: `ClaudeTokenPrintKeyringLatencyHigh`
- **Condition**: p95 duration > 2s for `stored_subscription_token` source, sustained 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check platform isolation.
  2. macOS: Keychain background ops, locked keychain, automation permissions.
  3. Linux: D-Bus session responsiveness, `gnome-keyring-daemon` health.
  4. Windows: PowerShell cold start latency.

#### Alert 3: `ClaudeTokenPrintKeychainErrorSpike`
- **Condition**: `increase(errors{reason="keyring_error"}[15m]) > 10`
- **Severity**: Warning
- **Runbook**:
  1. Identify affected platforms.
  2. macOS: verify `security` binary, check Keychain locked/corrupted state, check `codeplane-cli` service entry.
  3. Linux: verify `secret-tool`, D-Bus availability, Secret Service daemon.
  4. Windows: verify PowerShell, `Windows.Security.Credentials` namespace.
  5. Ensure error messages guide to env var fallback.

### Error Cases and Failure Modes

| Error Case | Behavior | Exit Code | User Message |
|------------|----------|-----------|---------------|
| No credential in any source | Exit with remediation | 1 | Multi-line: "no Claude Code auth found" + steps |
| Keyring read fails | Silently skip, fall through | varies | Standard "no auth" if all fail |
| macOS keychain fails | Silently skip, fall through | varies | Standard "no auth" if all fail |
| `CODEPLANE_DISABLE_SYSTEM_KEYRING=1` | Skip keyring | varies | Falls through |
| Env vars empty/whitespace | Treated as unset | varies | Falls through |
| Malformed test keychain payload | Skip keychain | varies | Falls through |

## Verification

### CLI End-to-End Tests

**Happy path tests:**

- [ ] **Basic token print from stored subscription token (human-readable)**: Store a Claude setup token via `codeplane auth claude login`. Unset `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY`. Run `codeplane auth claude token`. Verify exit code `0`. Verify stdout contains exactly the token + newline. Verify stderr contains `Token source: stored Claude subscription token (ANTHROPIC_AUTH_TOKEN)`.
- [ ] **JSON output mode from stored subscription token**: Store a Claude setup token. Run `codeplane auth claude token --json`. Verify exit code `0`. Verify stdout is valid JSON with exactly three keys: `env_key` (`"ANTHROPIC_AUTH_TOKEN"`), `source` (`"stored Claude subscription token"`), `token` (the stored value).
- [ ] **Token value matches stored credential**: Store known token `sk-ant-oat01-testtoken123-AbcDef`. Run `codeplane auth claude token`. Verify character-for-character match.
- [ ] **Token from ANTHROPIC_AUTH_TOKEN env**: Set `ANTHROPIC_AUTH_TOKEN=sk-ant-oat01-envtoken-XYZ`. Run `codeplane auth claude token --json`. Verify `env_key` is `"ANTHROPIC_AUTH_TOKEN"`, `source` is `"ANTHROPIC_AUTH_TOKEN env"`.
- [ ] **Token from ANTHROPIC_API_KEY env**: Unset other sources, set `ANTHROPIC_API_KEY=sk-ant-api03-key123`. Run `--json`. Verify `env_key` is `"ANTHROPIC_API_KEY"`, `source` is `"ANTHROPIC_API_KEY env"`.
- [ ] **Token from local Claude Code keychain (test mode)**: Set `CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD='{"claudeAiOauth":{"accessToken":"oauthtoken123"}}'`. Clear other sources. Run `--json`. Verify `source` is `"local Claude Code login"`.

**Priority chain tests:**

- [ ] **ANTHROPIC_AUTH_TOKEN overrides stored subscription token**: Store token A, set env to token B. Verify B printed, source is env.
- [ ] **Stored subscription token overrides ANTHROPIC_API_KEY**: Store token A, set API key to B, unset auth token. Verify A printed.
- [ ] **ANTHROPIC_API_KEY overrides local keychain**: Set API key and test keychain payload. Verify API key wins.
- [ ] **All four sources present**: Verify first in priority wins.

**Output format tests:**

- [ ] **Stdout contains only the token**: Capture stdout exclusively. Verify `^[^\n]+\n$`.
- [ ] **Stderr contains source and env_key**: Verify pattern `Token source: .+ \(ANTHROPIC_(AUTH_TOKEN|API_KEY)\)\n`.
- [ ] **JSON schema strict validation**: Parse JSON, verify exactly three keys, all strings, no extras.
- [ ] **Pipeline composability**: `codeplane auth claude token 2>/dev/null | wc -c` equals token length + 1.
- [ ] **No trailing whitespace in stdout**.

**Error path tests:**

- [ ] **No credential found**: Clear all sources. Verify exit code `1`. Verify remediation message on stderr.
- [ ] **No credential found in JSON mode**: Verify exit code `1`, stdout empty.
- [ ] **ANTHROPIC_AUTH_TOKEN whitespace-only**: Verify treated as unset.
- [ ] **ANTHROPIC_AUTH_TOKEN empty string**: Verify treated as unset.
- [ ] **ANTHROPIC_API_KEY whitespace-only**: Verify treated as unset.
- [ ] **Malformed keychain test payload**: Verify silently skipped.
- [ ] **Keychain payload missing accessToken**: Verify silently skipped.
- [ ] **Keychain payload empty accessToken**: Verify silently skipped.
- [ ] **Keychain payload whitespace-only accessToken**: Verify silently skipped.

**Credential store tests:**

- [ ] **Test file backend round-trip**: Store via login, print via token. Verify match. Verify `0o600` permissions.
- [ ] **Disabled keyring fallback to env**: `CODEPLANE_DISABLE_SYSTEM_KEYRING=1` + env var. Verify env source used.
- [ ] **Disabled keyring, no env, no keychain**: Verify exit code `1`.

**Cross-command integration tests:**

- [ ] **Login then token print**: Login with known token, verify same token printed.
- [ ] **Login, logout, then token print**: Verify exit code `1` after logout.
- [ ] **Token print then status**: Verify source fields correspond.
- [ ] **Token print is read-only**: Credential store unchanged after run.
- [ ] **Token print then push**: Verify push succeeds using same credential.

**Boundary and stress tests:**

- [ ] **1024-character token in env**: Verify printed completely, byte-for-byte match.
- [ ] **4096-character token in env**: Verify no truncation.
- [ ] **Token with special characters** (`=`, `/`, `+`, base64): Verify exact match.
- [ ] **Rapid sequential invocations (10x)**: Verify consistent output.
- [ ] **Token with unicode characters**: Verify byte-for-byte match.

**Security tests:**

- [ ] **Token not in stderr**: Verify raw token absent from stderr.
- [ ] **Token not in debug logs**: With max verbosity, verify zero log matches.
- [ ] **No network traffic**: Verify zero connections opened.
- [ ] **Test credential file permissions**: Verify `0o600`.
- [ ] **Command does not modify credentials**: Checksum before/after identical.

**Web UI / API tests:**

- [ ] **No Playwright tests required**: CLI-only feature.
- [ ] **No API integration tests required**: Zero network requests.
