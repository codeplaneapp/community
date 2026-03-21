# AUTH_CLI_CLAUDE_STATUS

Specification for AUTH_CLI_CLAUDE_STATUS.

## High-Level User POV

When a developer uses Codeplane's Claude Code integration — whether for agent-assisted issue resolution, seeding Claude auth into workspaces, or pushing Claude credentials to repository secrets — they need a quick, reliable way to answer the question: "Is my Claude Code authentication set up correctly, and where is it coming from?"

Running `codeplane auth claude status` gives the developer an immediate, clear answer. The command inspects all the places where Claude Code credentials can live — environment variables, the OS-native credential store, and the local Claude Code application's keychain — and reports whether authentication is configured, which specific source is providing it, and what kind of credential is in use.

The experience is intentionally transparent. Rather than a simple "yes" or "no", the status command tells the developer exactly which source is active. If they stored a subscription token via `codeplane auth claude login`, they'll see "stored Claude subscription token." If they've set `ANTHROPIC_AUTH_TOKEN` in their shell environment, they'll see "ANTHROPIC_AUTH_TOKEN env." If they signed into Claude Code locally on macOS and Codeplane is picking up that OAuth credential, they'll see "local Claude Code login." And if nothing is configured at all, the command tells them plainly that Claude Code auth is not configured — making it obvious that they need to set something up before Claude-dependent features will work.

This is especially valuable for debugging. When a `codeplane workspace issue` command fails because Claude auth can't be resolved, or when `codeplane auth claude push` doesn't behave as expected, running `codeplane auth claude status` is the first diagnostic step. The structured JSON output mode makes it easy to script status checks into CI pipelines or automation wrappers. The human-readable mode makes it easy to paste into a support thread or team chat.

The status command is a purely local, read-only operation. It does not contact the Codeplane server, does not contact the Anthropic API, and does not modify any credentials. It only reads and reports.

## Acceptance Criteria

### Definition of Done

- [ ] `codeplane auth claude status` returns exit code `0` when Claude auth is configured via any source.
- [ ] `codeplane auth claude status` returns exit code `0` when Claude auth is not configured (not an error — absence of auth is a valid state to report).
- [ ] `codeplane auth claude status` returns exit code `1` only when an unexpected error occurs (e.g., keyring backend failure, macOS Keychain locked and unlock declined).
- [ ] `codeplane auth claude status` reports `configured: true` when any Claude auth source resolves successfully.
- [ ] `codeplane auth claude status` reports `configured: false` when no Claude auth source resolves.
- [ ] `codeplane auth claude status` reports the `source` field as a human-readable label identifying the active auth source.
- [ ] `codeplane auth claude status` reports the `auth_kind` field as either `"ANTHROPIC_AUTH_TOKEN"` or `"ANTHROPIC_API_KEY"` depending on which environment variable the resolved credential maps to.
- [ ] `codeplane auth claude status` reports `stored_token_set: true` when a stored subscription token exists in the OS keyring, regardless of whether that token is the currently active source.
- [ ] `codeplane auth claude status` reports `stored_token_set: false` when no stored subscription token exists in the OS keyring.
- [ ] `codeplane auth claude status` displays a human-readable `message` summarizing the auth state.
- [ ] `codeplane auth claude status` supports `--json` for structured output with `configured`, `source`, `auth_kind`, `stored_token_set`, and `message` fields.
- [ ] `codeplane auth claude status` does NOT make any HTTP request to the Codeplane server or to the Anthropic API.
- [ ] `codeplane auth claude status` does NOT modify, store, or delete any credentials.
- [ ] `codeplane auth claude status` does NOT print or log any token values — only the source label and boolean presence indicators.
- [ ] Shell completions for `codeplane auth claude status` are available in bash, zsh, and fish.

### Edge Cases

- [ ] Status when no Claude auth source is available: `configured: false`, `source: null/undefined`, `auth_kind: null/undefined`, `stored_token_set: false`.
- [ ] Status when `ANTHROPIC_AUTH_TOKEN` env is set: `configured: true`, `source: "ANTHROPIC_AUTH_TOKEN env"`, `auth_kind: "ANTHROPIC_AUTH_TOKEN"`.
- [ ] Status when `ANTHROPIC_AUTH_TOKEN` env is set to an empty string or whitespace-only: treated as absent — falls through to next source.
- [ ] Status when a stored subscription token exists (and no higher-priority env var): `configured: true`, `source: "stored Claude subscription token"`, `auth_kind: "ANTHROPIC_AUTH_TOKEN"`.
- [ ] Status when `ANTHROPIC_API_KEY` env is set (and no `ANTHROPIC_AUTH_TOKEN` env, no stored token): `configured: true`, `source: "ANTHROPIC_API_KEY env"`, `auth_kind: "ANTHROPIC_API_KEY"`.
- [ ] Status when `ANTHROPIC_API_KEY` env is set to an empty string or whitespace-only: treated as absent.
- [ ] Status when local Claude Code keychain has an OAuth token (macOS, no higher-priority source): `configured: true`, `source: "local Claude Code login"`, `auth_kind: "ANTHROPIC_AUTH_TOKEN"`.
- [ ] Status when multiple auth sources are available: reports the highest-priority source per resolution cascade (`ANTHROPIC_AUTH_TOKEN` env > stored subscription token > `ANTHROPIC_API_KEY` env > local Claude Code keychain).
- [ ] Status when `ANTHROPIC_AUTH_TOKEN` env is set AND a stored subscription token exists: `source` reports `"ANTHROPIC_AUTH_TOKEN env"` (env takes priority), but `stored_token_set` is still `true`.
- [ ] Status when keyring backend is disabled (`CODEPLANE_DISABLE_SYSTEM_KEYRING=1`): `stored_token_set: false`, and if no env var is set, `configured: false`.
- [ ] Status when keyring backend binary is missing (e.g., `secret-tool` not installed on Linux): `stored_token_set: false`, graceful fallthrough.
- [ ] Status when macOS Keychain is locked: stored token lookup may fail; command should still succeed with `configured: false` if no other source is available (soft failure, exit code `0`).
- [ ] Status when local Claude Code keychain JSON is malformed: treated as absent, falls through gracefully.
- [ ] Status when `CODEPLANE_TEST_CREDENTIAL_STORE_FILE` is set: reads from the test file backend instead of the OS keyring.
- [ ] Status when `CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD` is set: uses the test payload to simulate the macOS Claude Code keychain on any platform.

### Boundary Constraints

- [ ] The command accepts no positional arguments.
- [ ] The command accepts no flags other than the global `--json` output format flag.
- [ ] The `configured` field in JSON output is always a boolean.
- [ ] The `source` field in JSON output is one of `"ANTHROPIC_AUTH_TOKEN env"`, `"stored Claude subscription token"`, `"ANTHROPIC_API_KEY env"`, `"local Claude Code login"`, or `undefined`/absent when not configured.
- [ ] The `auth_kind` field in JSON output is one of `"ANTHROPIC_AUTH_TOKEN"`, `"ANTHROPIC_API_KEY"`, or `undefined`/absent when not configured.
- [ ] The `stored_token_set` field in JSON output is always a boolean.
- [ ] The `message` field in JSON output is always a non-empty string.
- [ ] The auth resolution cascade is fixed and not configurable: `ANTHROPIC_AUTH_TOKEN` env → stored subscription token → `ANTHROPIC_API_KEY` env → local Claude Code keychain.
- [ ] Keyring storage key: `claude.subscription-token` (constant).
- [ ] Keyring service name: `codeplane-cli`.
- [ ] macOS Claude Code keychain service name: `Claude Code-credentials`.
- [ ] Token values (subscription tokens, API keys, OAuth access tokens) must NEVER appear in command output.

## Design

### CLI Command

```
codeplane auth claude status [--json]
```

**Arguments:** None.

**Flags:**

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--json` | `boolean` | No | `false` | Output machine-parseable JSON instead of human-readable text |

**Behavior:**

1. Call `resolveClaudeAuth()` to determine the active Claude auth source by checking, in priority order: `ANTHROPIC_AUTH_TOKEN` env, stored subscription token in OS keyring, `ANTHROPIC_API_KEY` env, local Claude Code keychain (macOS).
2. Call `loadStoredClaudeAuthToken()` independently to check whether a stored subscription token exists in the OS keyring — this is reported separately because it tells the user whether `codeplane auth claude login` was previously used, even if a higher-priority env var is currently masking it.
3. Format and return the result.

**Human-readable output (default):**

When Claude auth is configured:
```
Claude Code auth is configured via ANTHROPIC_AUTH_TOKEN env
```
```
Claude Code auth is configured via stored Claude subscription token
```
```
Claude Code auth is configured via ANTHROPIC_API_KEY env
```
```
Claude Code auth is configured via local Claude Code login
```

When Claude auth is not configured:
```
Claude Code auth is not configured
```

**Structured JSON output (`--json`):**

When configured:
```json
{
  "configured": true,
  "source": "ANTHROPIC_AUTH_TOKEN env",
  "auth_kind": "ANTHROPIC_AUTH_TOKEN",
  "stored_token_set": true,
  "message": "Claude Code auth is configured via ANTHROPIC_AUTH_TOKEN env"
}
```

When not configured:
```json
{
  "configured": false,
  "stored_token_set": false,
  "message": "Claude Code auth is not configured"
}
```

**Exit codes:**

| Code | Meaning |
|------|--------|
| `0` | Status check completed (whether configured or not) |
| `1` | Unexpected error (credential store failure) |

**Relationship to other `auth claude` commands:**

| Command | Effect |
|---------|--------|
| `codeplane auth claude login` | Stores a Claude setup token in the keyring |
| `codeplane auth claude logout` | Clears the stored Claude setup token from the keyring |
| `codeplane auth claude status` | Reports whether Claude auth is configured and via which source (this feature) |
| `codeplane auth claude token` | Prints the active Claude token or API key |
| `codeplane auth claude push` | Pushes the active Claude credential into repository secrets |

**Relationship to Codeplane auth commands:**

`codeplane auth claude status` is entirely independent from `codeplane auth status`. The former reports Claude Code authentication state; the latter reports Codeplane server authentication state. They read different credential sources and do not interact.

### SDK Shape

The CLI status command uses the following functions from the CLI's internal modules:

```typescript
// claude-auth.ts
function resolveClaudeAuth(): ResolvedClaudeAuth | null;
function loadStoredClaudeAuthToken(): string | null;
function formatClaudeAuthSource(source: ClaudeAuthSource): string;

type ClaudeAuthSource =
  | "env_auth_token"
  | "stored_subscription_token"
  | "env_api_key"
  | "local_claude_keychain";

interface ResolvedClaudeAuth {
  env: Record<string, string>;
  source: ClaudeAuthSource;
}
```

`resolveClaudeAuth()` priority cascade:
1. `ANTHROPIC_AUTH_TOKEN` env → returns `{ source: "env_auth_token", env: { ANTHROPIC_AUTH_TOKEN: ... } }`
2. Stored subscription token in keyring → returns `{ source: "stored_subscription_token", env: { ANTHROPIC_AUTH_TOKEN: ... } }`
3. `ANTHROPIC_API_KEY` env → returns `{ source: "env_api_key", env: { ANTHROPIC_API_KEY: ... } }`
4. macOS Claude Code keychain → returns `{ source: "local_claude_keychain", env: { ANTHROPIC_AUTH_TOKEN: ... } }`
5. Nothing → returns `null`

`formatClaudeAuthSource()` mapping:
| Internal source | User-facing label |
|----------------|-------------------|
| `env_auth_token` | `"ANTHROPIC_AUTH_TOKEN env"` |
| `stored_subscription_token` | `"stored Claude subscription token"` |
| `env_api_key` | `"ANTHROPIC_API_KEY env"` |
| `local_claude_keychain` | `"local Claude Code login"` |

### Test Credential Store

For E2E and integration testing, the credential store can be redirected to a plain JSON file by setting `CODEPLANE_TEST_CREDENTIAL_STORE_FILE`. The macOS Claude Code keychain lookup can be simulated on any platform by setting `CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD` to a JSON string (e.g., `'{"claudeAiOauth":{"accessToken":"test-token"}}'`).

### Documentation

End-user documentation should include:

1. **CLI Auth Claude Status** — Usage of `codeplane auth claude status`, what each output field means (`configured`, `source`, `auth_kind`, `stored_token_set`, `message`), JSON output format, and example outputs for each auth source.
2. **Understanding Claude Auth in Codeplane** — How Codeplane resolves Claude credentials in priority order, why `stored_token_set` might be `true` while `source` reports an environment variable (the env var takes priority), and how to read the status output to understand which mechanism is active.
3. **Diagnostic Workflow** — How to use `codeplane auth claude status` as the first step when Claude-dependent features (workspace issue automation, agent flows, credential push) fail. Explain that `configured: false` means the user needs to set up Claude auth, and link to the three remediation paths: `claude setup-token | codeplane auth claude login`, setting `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY`, or `claude login`.
4. **Scripting and CI** — How to use `codeplane auth claude status --json` in scripts to gate Claude-dependent workflows, with examples of `jq` usage to extract the `configured` boolean.

## Permissions & Security

### Authorization Roles

| Action | Required Role |
|--------|---------------|
| `codeplane auth claude status` | Any local user — no server authentication required |

Claude auth status is a client-side-only, read-only operation. It does not make any network request and therefore does not require any Codeplane server-side authorization role or Anthropic API access. Any user who can execute the `codeplane` binary can run this command.

### Rate Limiting

No rate limiting applies. Claude auth status is a local operation that does not contact any server. The OS credential store provides its own access controls (keyring unlock prompts, D-Bus permissions, etc.). No server-side or client-side throttling is necessary.

### Data Privacy and PII

- **Token values are never printed, logged, or returned** by the status command. The command only reports boolean presence flags (`configured`, `stored_token_set`) and source labels (`source`, `auth_kind`).
- **The stored subscription token is read but not exposed** — `loadStoredClaudeAuthToken()` returns the token internally to check its presence, but the status command only reports `stored_token_set: true/false`.
- **Environment variable values are read but not exposed** — only their presence/non-presence is checked during `resolveClaudeAuth()`.
- **The macOS Claude Code keychain is read but not modified** — Codeplane reads the `Claude Code-credentials` Keychain item to detect local Claude Code login but does not alter it.
- **No PII is transmitted** — the command is entirely offline.
- **No credential material appears in structured output** — the `--json` output contains only metadata about auth state, never token strings.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `auth.claude.cli.status` | User runs `codeplane auth claude status` | `configured` (boolean — whether any Claude auth source resolved), `source` (string or null — the active auth source label, e.g. `"env_auth_token"`, `"stored_subscription_token"`, `"env_api_key"`, `"local_claude_keychain"`, or `null`), `auth_kind` (string or null — `"ANTHROPIC_AUTH_TOKEN"` or `"ANTHROPIC_API_KEY"` or `null`), `stored_token_set` (boolean — whether a stored subscription token exists independently), `output_format` (string — `"json"` or `"text"`) |

### Funnel Metrics and Success Indicators

1. **Claude Status Check Frequency**: Total `auth.claude.cli.status` events per week — indicates adoption and awareness of the diagnostic command.
2. **Unconfigured Rate**: Percentage of `auth.claude.cli.status` events with `configured: false` — a persistently high rate indicates users are struggling to set up Claude auth and may need better onboarding or documentation.
3. **Auth Source Distribution**: Breakdown of `source` values across all status checks — informs which auth mechanisms are most popular (env vars vs. stored tokens vs. local keychain), guiding documentation and UX investment.
4. **Status-to-Login Conversion**: Rate of `auth.claude.cli.login` events within 5 minutes after an `auth.claude.cli.status` event with `configured: false` — indicates whether the status command's output successfully drives users toward remediation.
5. **Pre-Feature Diagnostic Pattern**: Rate of `auth.claude.cli.status` events within 2 minutes before a `workspace.issue.start` or `agent.ask` event — indicates how often users check status before running Claude-dependent features.
6. **Stored Token Awareness**: Among events with `configured: true` and `source: "env_auth_token"`, percentage where `stored_token_set: true` — indicates how many users have a stored token that is currently masked by an env var, which can cause confusion.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|-------------------|
| CLI Claude status executed | `INFO` | `configured`, `source`, `auth_kind`, `stored_token_set`, `output_format` |
| CLI Claude status auth resolved from env auth token | `DEBUG` | `source: "env_auth_token"` |
| CLI Claude status auth resolved from stored subscription token | `DEBUG` | `source: "stored_subscription_token"` |
| CLI Claude status auth resolved from env API key | `DEBUG` | `source: "env_api_key"` |
| CLI Claude status auth resolved from local Claude Code keychain | `DEBUG` | `source: "local_claude_keychain"` |
| CLI Claude status no auth source found | `DEBUG` | — |
| CLI Claude status stored token check completed | `DEBUG` | `stored_token_set` |
| CLI Claude status keyring read failed (soft) | `WARN` | `error_message`, `platform`, `backend_type` |
| CLI Claude status keyring read failed (hard) | `ERROR` | `error_message`, `platform`, `backend_type` |
| CLI Claude status macOS keychain payload malformed | `DEBUG` | `reason` |

**CRITICAL:** Token values (subscription tokens, API keys, OAuth access tokens) must NEVER appear in logs. Only the storage key name, platform, source labels, and boolean/enum status may be logged.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_cli_claude_status_total` | Counter | `configured` (true, false), `source` (env_auth_token, stored_subscription_token, env_api_key, local_claude_keychain, none), `output_format` (json, text) | Total CLI Claude status checks by outcome |
| `codeplane_cli_claude_status_errors_total` | Counter | `platform` (darwin, linux, win32), `error_type` (keyring_locked, backend_missing, io_error, keychain_parse_error, unknown) | Total CLI Claude status errors by platform and type |
| `codeplane_cli_claude_status_stored_token_set` | Gauge | — | 1 if a stored subscription token exists, 0 otherwise (last known state from most recent CLI invocation) |

### Alerts and Runbooks

#### Alert: `CLIClaudeStatusErrorRateSpikeAlert`
- **Condition**: `rate(codeplane_cli_claude_status_errors_total[1h]) > 5`
- **Severity**: Info
- **Runbook**:
  1. This alert fires if aggregated CLI telemetry (opt-in) reports a spike in Claude status check errors.
  2. Check the `platform` and `error_type` labels to identify whether the issue is platform-specific.
  3. For `keyring_locked` on macOS: Users may be running in headless/SSH sessions where Keychain access requires manual unlock. This is expected behavior — verify that the command still returns `exit 0` with `configured: false` when keyring is locked (soft failure). If it is returning `exit 1`, check whether `loadStoredClaudeAuthToken()` is propagating an exception instead of catching it.
  4. For `backend_missing` on Linux: Users may not have `secret-tool` / `libsecret-tools` installed. Verify installation docs include this dependency. The CLI should gracefully degrade to `stored_token_set: false`, not error out.
  5. For `keychain_parse_error` on macOS: The Claude Code application may have changed its keychain payload format. Check the latest Claude Code release for credential storage format changes. Update `loadClaudeOAuthAccessTokenFromKeychain()` if necessary.
  6. For errors spanning all platforms: Check if a CLI update introduced a regression in `resolveClaudeAuth()` or `loadStoredClaudeAuthToken()`. Roll back the CLI release if necessary.
  7. Verify the storage key `claude.subscription-token` and the keychain service name `Claude Code-credentials` have not been accidentally changed in the codebase.

#### Alert: `CLIClaudeStatusUnconfiguredRateHighAlert`
- **Condition**: `rate(codeplane_cli_claude_status_total{configured="false"}[24h]) / rate(codeplane_cli_claude_status_total[24h]) > 0.6` for more than 72 hours
- **Severity**: Info (product signal, not operational)
- **Runbook**:
  1. This alert fires when a majority of Claude status checks find no configured auth.
  2. This is a product signal, not an operational emergency. It indicates users are checking status but not finding auth — either they haven't set up Claude Code yet, or the remediation guidance is insufficient.
  3. Review `source` distribution in recent events. If all events show `configured: false`, check whether the documentation for `codeplane auth claude login` is discoverable.
  4. Check whether the status command's "not configured" message includes actionable remediation steps or a link to setup documentation. Consider adding a hint: "Run `claude setup-token | codeplane auth claude login` to configure."
  5. If the unconfigured rate coincides with a new user cohort (e.g., after a product launch or blog post), this is expected and should resolve as users complete onboarding.
  6. No immediate operational action required.

### Error Cases and Failure Modes

| Error Case | Behavior | Exit Code |
|------------|----------|----------|
| No keyring backend available (headless, `CODEPLANE_DISABLE_SYSTEM_KEYRING=1`) | `stored_token_set: false`, falls through to other sources | `0` |
| Keyring backend binary missing (`security`, `secret-tool`, `pwsh`) | `stored_token_set: false`, falls through to other sources | `0` |
| Keyring backend crashes or times out during stored token read | `stored_token_set: false` (soft failure), falls through | `0` |
| macOS Keychain is locked and unlock prompt is declined | Stored token read fails softly, keychain read fails softly, falls through to env vars | `0` |
| macOS Claude Code keychain JSON is malformed | Keychain source treated as absent, falls through | `0` |
| `CODEPLANE_TEST_CREDENTIAL_STORE_FILE` points to invalid JSON | Error: `Invalid credential store file: <path>` | `1` |
| `CODEPLANE_TEST_CREDENTIAL_STORE_FILE` points to non-existent file | `stored_token_set: false`, treated as empty store | `0` |
| `CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD` is invalid JSON | Keychain source treated as absent, falls through | `0` |
| Unexpected exception in `resolveClaudeAuth()` | Error message with stack context | `1` |

## Verification

### CLI Integration Tests

#### Core Status Flow
- [ ] `cli: codeplane auth claude status returns exit code 0 when Claude auth is configured`
- [ ] `cli: codeplane auth claude status returns exit code 0 when Claude auth is not configured`
- [ ] `cli: codeplane auth claude status --json returns valid JSON`
- [ ] `cli: codeplane auth claude status --json contains exactly configured, source, auth_kind, stored_token_set, and message fields when configured`
- [ ] `cli: codeplane auth claude status --json contains exactly configured, stored_token_set, and message fields when not configured (source and auth_kind may be absent/undefined)`
- [ ] `cli: codeplane auth claude status --json configured field is always a boolean`
- [ ] `cli: codeplane auth claude status --json stored_token_set field is always a boolean`
- [ ] `cli: codeplane auth claude status --json message field is always a non-empty string`

#### Auth Source Reporting via ANTHROPIC_AUTH_TOKEN Env
- [ ] `cli: codeplane auth claude status with ANTHROPIC_AUTH_TOKEN env set reports configured: true`
- [ ] `cli: codeplane auth claude status with ANTHROPIC_AUTH_TOKEN env set reports source: "ANTHROPIC_AUTH_TOKEN env"`
- [ ] `cli: codeplane auth claude status with ANTHROPIC_AUTH_TOKEN env set reports auth_kind: "ANTHROPIC_AUTH_TOKEN"`
- [ ] `cli: codeplane auth claude status with ANTHROPIC_AUTH_TOKEN env set to empty string treats it as absent`
- [ ] `cli: codeplane auth claude status with ANTHROPIC_AUTH_TOKEN env set to whitespace-only treats it as absent`

#### Auth Source Reporting via Stored Subscription Token
- [ ] `cli: codeplane auth claude status with stored subscription token (via test credential store) and no env vars reports configured: true`
- [ ] `cli: codeplane auth claude status with stored subscription token reports source: "stored Claude subscription token"`
- [ ] `cli: codeplane auth claude status with stored subscription token reports auth_kind: "ANTHROPIC_AUTH_TOKEN"`
- [ ] `cli: codeplane auth claude status with stored subscription token reports stored_token_set: true`

#### Auth Source Reporting via ANTHROPIC_API_KEY Env
- [ ] `cli: codeplane auth claude status with ANTHROPIC_API_KEY env set (no ANTHROPIC_AUTH_TOKEN, no stored token) reports configured: true`
- [ ] `cli: codeplane auth claude status with ANTHROPIC_API_KEY env reports source: "ANTHROPIC_API_KEY env"`
- [ ] `cli: codeplane auth claude status with ANTHROPIC_API_KEY env reports auth_kind: "ANTHROPIC_API_KEY"`
- [ ] `cli: codeplane auth claude status with ANTHROPIC_API_KEY env set to empty string treats it as absent`

#### Auth Source Reporting via Local Claude Code Keychain
- [ ] `cli: codeplane auth claude status with CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD set (simulating macOS keychain) reports configured: true`
- [ ] `cli: codeplane auth claude status with test keychain payload reports source: "local Claude Code login"`
- [ ] `cli: codeplane auth claude status with test keychain payload reports auth_kind: "ANTHROPIC_AUTH_TOKEN"`

#### No Auth Configured
- [ ] `cli: codeplane auth claude status with no env vars, no stored token, no keychain reports configured: false`
- [ ] `cli: codeplane auth claude status when unconfigured reports stored_token_set: false`
- [ ] `cli: codeplane auth claude status when unconfigured has source absent/undefined in JSON`
- [ ] `cli: codeplane auth claude status when unconfigured has auth_kind absent/undefined in JSON`
- [ ] `cli: codeplane auth claude status when unconfigured message is "Claude Code auth is not configured"`

#### Priority Cascade
- [ ] `cli: codeplane auth claude status with ANTHROPIC_AUTH_TOKEN env AND stored subscription token: source is "ANTHROPIC_AUTH_TOKEN env" (env wins), stored_token_set is true`
- [ ] `cli: codeplane auth claude status with ANTHROPIC_AUTH_TOKEN env AND ANTHROPIC_API_KEY env: source is "ANTHROPIC_AUTH_TOKEN env" (higher priority)`
- [ ] `cli: codeplane auth claude status with stored subscription token AND ANTHROPIC_API_KEY env: source is "stored Claude subscription token" (higher priority)`
- [ ] `cli: codeplane auth claude status with stored subscription token AND test keychain payload: source is "stored Claude subscription token" (higher priority)`
- [ ] `cli: codeplane auth claude status with ANTHROPIC_API_KEY env AND test keychain payload: source is "ANTHROPIC_API_KEY env" (higher priority)`
- [ ] `cli: codeplane auth claude status with ANTHROPIC_AUTH_TOKEN env AND stored token AND ANTHROPIC_API_KEY AND test keychain: source is "ANTHROPIC_AUTH_TOKEN env" (highest priority)`

#### Stored Token Independent Reporting
- [ ] `cli: codeplane auth claude status stored_token_set reflects stored token existence even when env var takes priority as source`
- [ ] `cli: codeplane auth claude status stored_token_set is false when credential store is empty even though env var provides auth`
- [ ] `cli: codeplane auth claude status stored_token_set is true with stored token AND no env vars`

#### Human-Readable Output
- [ ] `cli: codeplane auth claude status default output includes "Claude Code auth is configured via" when configured`
- [ ] `cli: codeplane auth claude status default output includes the source label (e.g., "ANTHROPIC_AUTH_TOKEN env")`
- [ ] `cli: codeplane auth claude status default output is "Claude Code auth is not configured" when unconfigured`

#### Credential Store Backend Edge Cases
- [ ] `cli: codeplane auth claude status with CODEPLANE_DISABLE_SYSTEM_KEYRING=1 returns stored_token_set: false`
- [ ] `cli: codeplane auth claude status with CODEPLANE_DISABLE_SYSTEM_KEYRING=1 and ANTHROPIC_AUTH_TOKEN env still reports configured: true`
- [ ] `cli: codeplane auth claude status with CODEPLANE_TEST_CREDENTIAL_STORE_FILE pointing to empty JSON file ({}): stored_token_set: false`
- [ ] `cli: codeplane auth claude status with CODEPLANE_TEST_CREDENTIAL_STORE_FILE pointing to non-existent file: stored_token_set: false, no crash`
- [ ] `cli: codeplane auth claude status with CODEPLANE_TEST_CREDENTIAL_STORE_FILE containing a claude.subscription-token key: stored_token_set: true`
- [ ] `cli: codeplane auth claude status with test credential store file does NOT modify the file (read-only operation)`
- [ ] `cli: codeplane auth claude status with CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD set to invalid JSON: keychain source treated as absent, no crash`
- [ ] `cli: codeplane auth claude status with CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD set to JSON without claudeAiOauth key: keychain source treated as absent`
- [ ] `cli: codeplane auth claude status with CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD set to JSON with empty accessToken: keychain source treated as absent`

#### Independence from Codeplane Auth
- [ ] `cli: codeplane auth claude status does NOT affect codeplane auth status (Codeplane server auth is unaffected)`
- [ ] `cli: codeplane auth status does NOT affect codeplane auth claude status (Claude auth is unaffected)`
- [ ] `cli: codeplane auth claude status does NOT require a Codeplane server to be running`

#### No Server Contact
- [ ] `cli: codeplane auth claude status completes successfully when no network is available`
- [ ] `cli: codeplane auth claude status does not make any HTTP requests (verified by intercepting/mocking fetch)`

#### Read-Only Verification
- [ ] `cli: codeplane auth claude status does NOT modify the credential store (file timestamp unchanged with test credential store)`
- [ ] `cli: codeplane auth claude status does NOT create any new keyring entries`
- [ ] `cli: codeplane auth claude status does NOT modify environment variables`

#### Idempotency
- [ ] `cli: running codeplane auth claude status twice in succession returns identical output`
- [ ] `cli: running codeplane auth claude status 10 times in succession: all return exit code 0 and identical JSON`

#### Token Maximum Size
- [ ] `cli: codeplane auth claude status correctly detects a stored subscription token at maximum observed size (~200 chars sk-ant-oat token)`
- [ ] `cli: codeplane auth claude status with an ANTHROPIC_AUTH_TOKEN env var of 1000 characters reports configured: true`

### End-to-End (E2E) Tests — CLI

- [ ] `e2e/cli: codeplane auth claude status exits with code 0`
- [ ] `e2e/cli: codeplane auth claude status --json returns valid JSON with all required fields`
- [ ] `e2e/cli: codeplane auth claude status --json configured field is boolean`
- [ ] `e2e/cli: codeplane auth claude status --json stored_token_set field is boolean`
- [ ] `e2e/cli: store a test Claude subscription token via test credential store, run codeplane auth claude status --json, verify configured: true and stored_token_set: true and source contains "stored"`
- [ ] `e2e/cli: codeplane auth claude status with no auth sources returns configured: false`
- [ ] `e2e/cli: codeplane auth claude status is idempotent — running it twice produces identical output`
- [ ] `e2e/cli: codeplane auth claude status does not affect codeplane auth status (Codeplane server auth independent)`
- [ ] `e2e/cli: full roundtrip: claude login (store token) → claude status (configured: true, source: stored) → claude logout → claude status (configured: false)`
- [ ] `e2e/cli: full roundtrip: set ANTHROPIC_AUTH_TOKEN env → claude status (configured: true, source: env) → unset env → claude status (configured: false)`
- [ ] `e2e/cli: codeplane auth claude status with ANTHROPIC_AUTH_TOKEN env and stored token: source reports env (priority), stored_token_set is true`
- [ ] `e2e/cli: codeplane auth claude status output never contains a token value (no sk-ant-oat string, no API key in stdout or stderr)`
- [ ] `e2e/cli: codeplane auth claude status --json output never contains a token value`

### Security-Focused Tests

- [ ] `security: codeplane auth claude status output (stdout + stderr) never contains any sk-ant-oat string`
- [ ] `security: codeplane auth claude status --json output never contains any token or API key value`
- [ ] `security: codeplane auth claude status does not write to any file (verified with test credential store mtime check)`
- [ ] `security: codeplane auth claude status does not modify the macOS Claude Code keychain entry (CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD unchanged in test mode)`

### Shell Completion Tests

- [ ] `completion: bash completion includes "status" as a subcommand of "auth claude"`
- [ ] `completion: zsh completion includes "status" as a subcommand of "auth claude"`
- [ ] `completion: fish completion includes "status" as a subcommand of "auth claude"`
- [ ] `completion: bash completion for codeplane auth claude status does not offer subcommand-specific flags (only global --json)`
