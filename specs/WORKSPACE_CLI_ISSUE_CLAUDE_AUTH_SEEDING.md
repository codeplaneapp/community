# WORKSPACE_CLI_ISSUE_CLAUDE_AUTH_SEEDING

Specification for WORKSPACE_CLI_ISSUE_CLAUDE_AUTH_SEEDING.

## High-Level User POV

When a developer runs `codeplane workspace issue <number>`, Codeplane automates the entire journey from an open issue to a ready-to-review landing request. A critical part of this automation is making sure the Claude Code AI agent running inside the remote workspace has valid Anthropic credentials — without the user needing to manually SSH in and configure environment variables.

Codeplane solves this by transparently seeding Claude Code authentication into the remote workspace. The CLI automatically discovers the user's local Anthropic credentials — from environment variables, a previously stored subscription token, or the local Claude Code keychain — and securely transfers them into the workspace container before Claude Code starts running. The user never sees the credential transfer happen; they simply run a single command and watch their issue get worked on.

If the user has no local credentials available but the workspace already has credentials from a prior session, those existing credentials are reused. If no credentials can be found anywhere, the CLI stops early with a clear, actionable message explaining exactly how to fix the problem — whether by running `claude setup-token | codeplane auth claude login`, setting an environment variable, or signing into Claude Code locally.

The auth seeding is part of a larger orchestrated flow: after credentials are confirmed, the CLI bootstraps the workspace with Node.js and Claude Code, constructs a prompt from the issue's title, body, and labels, runs Claude Code in headless mode, extracts any jj changes that were committed, and automatically opens a landing request linking back to the original issue. The entire experience feels like asking an AI teammate to go fix something — one command, no context-switching, no manual workspace setup.

This feature is designed for both human developers who want to offload an issue to Claude Code and for automated pipelines that need to drive issue resolution programmatically. It respects the principle that credentials should flow from the operator's local environment into sandboxed workspaces, never the other way around, and that sensitive material should be stored with restrictive permissions on the remote side.

## Acceptance Criteria

### Definition of Done

- [ ] Running `codeplane workspace issue <number>` with valid local Claude credentials successfully seeds those credentials into the remote workspace and completes the full issue automation flow.
- [ ] Running `codeplane workspace issue <number>` without any local Claude credentials, and without pre-existing workspace credentials, produces a clear, actionable error message before any workspace provisioning occurs.
- [ ] Credentials are written to the workspace filesystem with restrictive permissions (600) and correct ownership.
- [ ] The four-tier credential resolution order is honored: `ANTHROPIC_AUTH_TOKEN` env → stored subscription token → `ANTHROPIC_API_KEY` env → local Claude Code keychain.
- [ ] Pre-existing workspace credentials (from a prior session) are detected and reused when no local credentials are available.
- [ ] The prompt constructed for Claude Code accurately includes the issue title, body, and labels.
- [ ] If Claude Code produces jj changes relative to the target bookmark, a landing request is automatically created.
- [ ] If Claude Code produces no changes, a clear status message is returned and no landing request is created.
- [ ] If landing request creation fails after successful Claude Code execution, the error is caught gracefully and the workspace ID and change IDs are still returned.
- [ ] Structured JSON output is available for all success and failure paths when `--json` is used.

### Edge Cases

- [ ] Issue number `0`, negative numbers, non-integer strings, and values exceeding `Number.MAX_SAFE_INTEGER` are rejected with an error before any API calls.
- [ ] If the issue does not exist (404), a clear error is surfaced.
- [ ] If the issue is closed, the flow still proceeds (users may want to reopen or extend work on a closed issue).
- [ ] If the repository does not exist or the user lacks access, the error from the API is surfaced.
- [ ] If workspace creation fails (e.g., quota exceeded, container runtime unavailable), the error is surfaced before SSH polling begins.
- [ ] If SSH readiness polling times out (default 120s), a timeout error including the workspace ID is raised so the user can investigate.
- [ ] If the SSH connection drops mid-credential-seeding, the error is surfaced with the provisioning step label ("claude auth bootstrap").
- [ ] If the Claude Code installation fails inside the workspace, diagnostic information is collected and surfaced.
- [ ] If the Claude Code process exits with a non-zero code, diagnostics are gathered (running processes, install logs, environment state).
- [ ] If the remote auth file already exists from a prior run but is corrupt or empty, the runtime auth check inside the developer script still fails cleanly with a descriptive message.
- [ ] If `--target` specifies a bookmark that doesn't exist in the workspace, `jj log` returns no changes and no landing request is created (no crash).
- [ ] If the issue body is empty, the prompt is still valid and includes only the title and labels.
- [ ] If the issue has no labels, the labels line is omitted from the prompt.

### Boundary Constraints

- [ ] SSH poll interval is configurable via `CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS` (default 3000ms, must be a positive integer).
- [ ] SSH poll timeout is configurable via `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS` (default 120000ms, must be a positive integer).
- [ ] Remote command timeout is 120s for provisioning commands and 1800s (30 minutes) for the Claude Code execution itself.
- [ ] The workspace name is always `issue-{number}`, derived from the validated issue number.
- [ ] The target bookmark defaults to `main` if `--target` is not specified.
- [ ] The prompt file is written with 600 permissions and base64-encoded during transfer to avoid shell escaping issues with arbitrary issue body content.
- [ ] The remote auth file path is always `/home/developer/.codeplane/claude-env.sh` and the directory is created with 700 permissions.
- [ ] The `ANTHROPIC_AUTH_TOKEN` pattern must match `sk-ant-oat[0-9a-z-]*-[A-Za-z0-9._-]+` when stored via `codeplane auth claude login`.
- [ ] The keychain lookup for Claude Code credentials is macOS-only; on other platforms, only the env var and stored token tiers are available.

## Design

### CLI Command

**Command:** `codeplane workspace issue <number>`

**Arguments:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `number` | string (parsed as integer) | Yes | The issue number to work on |

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--target` | string | `"main"` | Target bookmark for the landing request |
| `--repo` | string | auto-detected | Repository in `OWNER/REPO` format |

**Output (JSON mode):**

On success with changes:
```json
{
  "workspace_id": "ws_abc123",
  "landing_request": 42,
  "change_ids": ["abc123def", "456ghi789"],
  "issue": 17,
  "status": "completed"
}
```

On success without changes:
```json
{
  "workspace_id": "ws_abc123",
  "issue": 17,
  "status": "completed",
  "message": "Claude Code session ended. No non-empty changes were detected relative to main, so no landing request was created."
}
```

On success with changes but landing request creation failed:
```json
{
  "workspace_id": "ws_abc123",
  "change_ids": ["abc123def"],
  "issue": 17,
  "status": "completed",
  "message": "Claude Code session ended, but the landing request could not be created: <error detail>"
}
```

### Claude Auth Resolution

The CLI resolves Claude credentials using a strict four-tier priority cascade. The first tier that yields a non-empty value wins:

1. **`ANTHROPIC_AUTH_TOKEN` environment variable** — Direct environment override. Source label: `"ANTHROPIC_AUTH_TOKEN env"`.
2. **Stored Claude subscription token** — Previously saved via `codeplane auth claude login` into the system keyring. Source label: `"stored Claude subscription token"`.
3. **`ANTHROPIC_API_KEY` environment variable** — Direct API key. Source label: `"ANTHROPIC_API_KEY env"`.
4. **Local Claude Code keychain** — The OAuth access token from the Claude Code desktop app's keychain entry (macOS only). Source label: `"local Claude Code login"`.

If no tier produces credentials, the CLI checks whether the remote workspace already has a credential file at `/home/developer/.codeplane/claude-env.sh`. If it does, the flow continues using those existing credentials. If it does not, the CLI throws an error with remediation steps.

### Auth Seeding Mechanism

When local credentials are available:

1. The CLI constructs a shell script that creates the `/home/developer/.codeplane` directory with 700 permissions.
2. The script writes `export ANTHROPIC_AUTH_TOKEN=<value>` (or `export ANTHROPIC_API_KEY=<value>`) lines into `/home/developer/.codeplane/claude-env.sh`.
3. Ownership is set to the `developer` user and permissions are set to 600.
4. The script is executed via SSH as root, using `runRemoteProvisionCommand`.

When Claude Code runs, the developer script sources this file:
```
if [ -f /home/developer/.codeplane/claude-env.sh ]; then
  . /home/developer/.codeplane/claude-env.sh
fi
```

### Auth Management CLI Commands

**`codeplane auth claude login`** — Reads a Claude setup token from stdin (from `claude setup-token` pipe), validates the `sk-ant-oat` pattern, and stores it in the system keyring. Optionally pushes the token as a repository secret.

**`codeplane auth claude logout`** — Removes the stored Claude subscription token from the system keyring.

**`codeplane auth claude status`** — Shows which credential tier is currently active and whether a stored token exists.

**`codeplane auth claude token`** — Prints the active Claude credential value (for piping or debugging).

**`codeplane auth claude push`** — Pushes the active Claude credential into a repository's secrets for use in workflows.

### End-to-End Flow Diagram

```
User runs: codeplane workspace issue 42 --target main

1. Validate issue number (42)
2. GET /api/repos/:owner/:repo/issues/42
3. POST /api/repos/:owner/:repo/workspaces  {name: "issue-42"}
4. Poll GET /api/repos/:owner/:repo/workspaces/:id/ssh  (3s intervals, 120s timeout)
5. Resolve Claude auth (four-tier cascade)
6. SSH → write /home/developer/.codeplane/claude-env.sh  (600 perms)
7. SSH → bootstrap jj + Node.js + Claude Code
8. SSH → write issue prompt to /home/developer/.codeplane/issue-prompt.txt
9. SSH → run Claude Code as 'developer' user with sourced auth
10. SSH → jj log to extract change IDs relative to target bookmark
11. POST /api/repos/:owner/:repo/landings  {title, body, target_bookmark, change_ids}
12. Return structured result
```

### Documentation

The following end-user documentation should be written:

- **CLI Reference: `codeplane workspace issue`** — Full command documentation with arguments, options, examples, and explanation of the automated flow.
- **CLI Reference: `codeplane auth claude`** — Subcommand documentation for `login`, `logout`, `status`, `token`, and `push`.
- **Guide: Automated Issue Resolution with Claude Code** — A walkthrough showing how to go from an open issue to a landing request in one command. Should cover: prerequisite auth setup, running the command, understanding the output, and common troubleshooting scenarios.
- **Guide: Claude Code Auth Configuration** — Explains all four credential tiers, when each is used, platform-specific considerations (macOS keychain), and how to configure credentials for CI/headless environments.
- **Troubleshooting: Workspace Claude Auth Errors** — Covers the specific error messages a user may encounter and how to resolve each one.

## Permissions & Security

### Authorization

- **Authenticated users only**: The `codeplane workspace issue` command requires a valid Codeplane session (PAT or session cookie). Unauthenticated requests fail at the API layer.
- **Repository write access**: The user must have at least write access to the repository to create workspaces and landing requests.
- **Issue read access**: The user must have at least read access to view the issue. Public repository issues are readable by any authenticated user. Private repository issues require repository membership.
- **No anonymous access**: This feature is never available to unauthenticated users.

### Credential Security

- **Local credential resolution**: All credential lookups happen client-side in the CLI process. No credentials are sent to the Codeplane API server; they are transferred directly to the workspace container via SSH.
- **SSH transport**: Credentials travel over the SSH connection to the workspace. The SSH transport is encrypted.
- **Remote file permissions**: The auth file is written with `chmod 600` and owned by the `developer` user. The containing directory has `chmod 700`. Root writes the file, then `chown`s it to `developer`.
- **No credential logging**: The CLI must never log, print, or include credential values in error messages, structured output, or diagnostic dumps.
- **Prompt file security**: The issue prompt file is also written with 600 permissions to prevent other workspace processes from reading potentially sensitive issue content.
- **Shell escaping**: All values injected into remote shell scripts use `shellEscape()` to prevent command injection.
- **Base64 encoding**: The issue prompt is base64-encoded during transfer to avoid shell interpretation of special characters in issue bodies.

### Rate Limiting

- **Workspace creation**: Subject to the existing workspace creation rate limit on the server (prevents workspace spam).
- **SSH polling**: Capped by the client-side poll interval (default 3s) and timeout (default 120s), which naturally limits API request rate to ~40 requests per workspace creation.
- **Issue fetch**: Single GET request, subject to standard API rate limiting.
- **Landing request creation**: Single POST request, subject to standard API rate limiting.

### Data Privacy

- **Credential exposure risk**: The `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` is written to a file inside the workspace container. If the container is snapshotted, the auth file would be included in the snapshot. Snapshot access controls must prevent unauthorized users from accessing workspace snapshots.
- **Issue content**: Issue titles and bodies may contain sensitive information. The prompt file containing this content is written with restrictive permissions.
- **No PII in telemetry**: Telemetry events must never include credential values, issue bodies, or prompt content.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `workspace_issue_started` | User invokes `codeplane workspace issue` | `repo_owner`, `repo_name`, `issue_number`, `target_bookmark`, `auth_source` (tier name, not credential value) |
| `workspace_issue_auth_seeded` | Claude auth successfully written to workspace | `repo_owner`, `repo_name`, `workspace_id`, `auth_source`, `auth_was_preexisting` (boolean) |
| `workspace_issue_auth_failed` | No Claude auth could be resolved | `repo_owner`, `repo_name`, `tiers_checked` (array of tier names attempted) |
| `workspace_issue_claude_started` | Claude Code process begins executing | `repo_owner`, `repo_name`, `workspace_id`, `issue_number` |
| `workspace_issue_claude_completed` | Claude Code process exits | `repo_owner`, `repo_name`, `workspace_id`, `issue_number`, `exit_code`, `duration_ms`, `changes_produced` (count) |
| `workspace_issue_landing_created` | Landing request successfully created | `repo_owner`, `repo_name`, `workspace_id`, `issue_number`, `landing_number`, `change_count` |
| `workspace_issue_landing_failed` | Landing request creation failed | `repo_owner`, `repo_name`, `workspace_id`, `issue_number`, `error_type` |
| `workspace_issue_completed` | Full flow finished (success or partial) | `repo_owner`, `repo_name`, `workspace_id`, `issue_number`, `outcome` ("landing_created" / "no_changes" / "landing_failed" / "error"), `total_duration_ms` |

### Funnel Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| Auth resolution success rate | `workspace_issue_auth_seeded` / `workspace_issue_started` | > 95% |
| End-to-end completion rate | `workspace_issue_completed` where outcome ≠ "error" / `workspace_issue_started` | > 80% |
| Change production rate | `workspace_issue_claude_completed` where `changes_produced > 0` / `workspace_issue_claude_completed` | > 60% |
| Landing request success rate | `workspace_issue_landing_created` / (`workspace_issue_landing_created` + `workspace_issue_landing_failed`) | > 95% |
| Median flow duration | p50 of `total_duration_ms` from `workspace_issue_completed` | < 10 minutes |

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Issue fetched | `info` | `{issue_number, repo, title_length}` |
| Workspace created | `info` | `{workspace_id, workspace_name, repo}` |
| SSH poll attempt | `debug` | `{workspace_id, attempt, elapsed_ms}` |
| SSH ready | `info` | `{workspace_id, poll_duration_ms, total_attempts}` |
| SSH poll timeout | `error` | `{workspace_id, timeout_ms, last_error}` |
| Auth resolution started | `debug` | `{tiers_to_check}` |
| Auth resolved | `info` | `{auth_source}` — **NEVER log the credential value** |
| Auth seeding started | `info` | `{workspace_id, auth_source}` |
| Auth seeding completed | `info` | `{workspace_id, auth_source, duration_ms}` |
| Auth seeding failed | `error` | `{workspace_id, error_message}` |
| Pre-existing auth detected | `info` | `{workspace_id}` |
| No auth available | `error` | `{tiers_checked}` |
| Claude Code install started | `info` | `{workspace_id}` |
| Claude Code install completed | `info` | `{workspace_id, duration_ms}` |
| Claude Code execution started | `info` | `{workspace_id, issue_number, prompt_length}` |
| Claude Code execution completed | `info` | `{workspace_id, exit_code, duration_ms}` |
| Claude Code execution failed | `error` | `{workspace_id, exit_code, stderr_tail_256}` — **NEVER include auth values** |
| Diagnostics collected | `warn` | `{workspace_id, diagnostics_summary}` |
| Change IDs extracted | `info` | `{workspace_id, change_count, change_ids}` |
| Landing request created | `info` | `{workspace_id, issue_number, landing_number}` |
| Landing request failed | `error` | `{workspace_id, issue_number, error_message}` |

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_workspace_issue_total` | counter | `repo`, `outcome` | Total workspace issue invocations |
| `codeplane_workspace_issue_duration_seconds` | histogram | `repo`, `outcome` | End-to-end duration of the workspace issue flow |
| `codeplane_workspace_issue_auth_resolution_total` | counter | `source`, `result` | Auth resolution attempts by source tier |
| `codeplane_workspace_issue_auth_seed_duration_seconds` | histogram | `source` | Time to seed auth into workspace |
| `codeplane_workspace_issue_ssh_poll_duration_seconds` | histogram | `repo` | Time spent polling for SSH readiness |
| `codeplane_workspace_issue_ssh_poll_attempts` | histogram | `repo` | Number of SSH poll attempts before ready |
| `codeplane_workspace_issue_claude_duration_seconds` | histogram | `repo` | Claude Code execution time |
| `codeplane_workspace_issue_claude_exit_code` | counter | `repo`, `exit_code` | Claude Code exit codes |
| `codeplane_workspace_issue_changes_produced` | histogram | `repo` | Number of jj changes produced per run |
| `codeplane_workspace_issue_landing_created_total` | counter | `repo` | Successful landing request creations |
| `codeplane_workspace_issue_landing_failed_total` | counter | `repo`, `error_type` | Failed landing request creations |

### Alerts

#### Alert: High Auth Resolution Failure Rate
- **Condition**: `rate(codeplane_workspace_issue_auth_resolution_total{result="failure"}[15m]) / rate(codeplane_workspace_issue_total[15m]) > 0.3`
- **Severity**: Warning
- **Runbook**:
  1. Check if there was a recent Claude Code update that changed keychain format.
  2. Check if the macOS keychain service name (`Claude Code-credentials`) has changed.
  3. Verify that `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY` environment variables are correctly propagated in the environments where the CLI runs.
  4. Check credential storage backend health (macOS Keychain, Linux Secret Service, Windows Credential Locker).
  5. Review recent changes to `claude-auth.ts` for regressions in the resolution cascade.

#### Alert: SSH Readiness Timeout Spike
- **Condition**: `rate(codeplane_workspace_issue_ssh_poll_duration_seconds_bucket{le="+Inf"}[15m]) - rate(codeplane_workspace_issue_ssh_poll_duration_seconds_bucket{le="120"}[15m]) > 5`
- **Severity**: Critical
- **Runbook**:
  1. Check workspace/container runtime health (is the sandbox runtime available?).
  2. Inspect workspace creation logs for container provisioning failures.
  3. Check network connectivity between the CLI host and workspace SSH endpoint.
  4. Verify that the workspace API is returning SSH info correctly for running workspaces.
  5. Check if there's a resource exhaustion condition (CPU/memory/disk on the container host).
  6. Review workspace service logs for errors during SSH info resolution.

#### Alert: Claude Code Execution Failure Spike
- **Condition**: `rate(codeplane_workspace_issue_claude_exit_code{exit_code!="0"}[15m]) / rate(codeplane_workspace_issue_claude_exit_code[15m]) > 0.5`
- **Severity**: Critical
- **Runbook**:
  1. Check if Claude Code npm package (`@anthropic-ai/claude-code`) has a new version with breaking changes.
  2. Review workspace diagnostic logs (`/home/developer/.codeplane/claude-install.log`).
  3. Check if Node.js installation is succeeding (review `/home/developer/.codeplane/node-install.log`).
  4. Verify that the auth file is being written correctly and sourced by the developer script.
  5. Check Anthropic API status for outages.
  6. Inspect recent Claude Code stderr output for patterns (auth errors, rate limits, model unavailable).

#### Alert: Auth Seeding Latency High
- **Condition**: `histogram_quantile(0.95, codeplane_workspace_issue_auth_seed_duration_seconds) > 10`
- **Severity**: Warning
- **Runbook**:
  1. Check SSH connection latency to workspace containers.
  2. Verify that the workspace filesystem is responsive (not a slow/full disk).
  3. Inspect whether the `runRemoteProvisionCommand` is timing out or retrying.
  4. Check for workspace container health issues (high CPU/memory usage during provisioning).

#### Alert: Landing Request Creation Failure Spike
- **Condition**: `rate(codeplane_workspace_issue_landing_failed_total[15m]) > 3`
- **Severity**: Warning
- **Runbook**:
  1. Check landing request API endpoint health.
  2. Verify that the change IDs extracted from the workspace are valid jj change IDs.
  3. Check if the target bookmark exists in the repository.
  4. Review API error responses for validation failures (duplicate titles, permission issues).
  5. Check database connectivity and landing request service logs.

### Error Cases and Failure Modes

| Failure Mode | Detection | User Experience | Recovery |
|--------------|-----------|----------------|----------|
| Invalid issue number | Client-side validation | Immediate error with message | Fix the issue number argument |
| Issue not found (404) | API response | Error with "not found" detail | Verify issue number and repository |
| Workspace creation failed | API response | Error with server detail | Check quotas, runtime availability |
| SSH poll timeout | Client-side timer | Error with workspace ID for manual investigation | Increase timeout env var or investigate workspace health |
| No Claude auth available | Client-side resolution | Error with three remediation suggestions | Follow remediation steps |
| Auth seeding SSH failure | SSH exit code | Error with "claude auth bootstrap" label | Check workspace SSH connectivity |
| Claude Code install failure | Remote exit code | Error with install log tail | Check Node.js/npm availability in workspace |
| Claude Code execution failure | Remote exit code | Error with diagnostics dump | Review diagnostics, check Anthropic API status |
| Change ID extraction failure | Remote exit code | Error from jj log | Check jj installation in workspace |
| Landing request creation failure | API response | Graceful degradation — returns workspace ID and change IDs with error message | Manually create landing request |

## Verification

### CLI Integration Tests

#### Auth Resolution Tests

- **Test: auth resolution prefers `ANTHROPIC_AUTH_TOKEN` env over all other sources** — Set `ANTHROPIC_AUTH_TOKEN=test-token-1` in env, store a subscription token, and set `ANTHROPIC_API_KEY=test-key-1`. Call `resolveClaudeAuth()`. Assert result source is `"env_auth_token"` and env contains `ANTHROPIC_AUTH_TOKEN: "test-token-1"`.

- **Test: auth resolution falls back to stored subscription token when `ANTHROPIC_AUTH_TOKEN` is unset** — Store a subscription token via `storeStoredClaudeAuthToken()`. Unset `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY`. Call `resolveClaudeAuth()`. Assert result source is `"stored_subscription_token"`.

- **Test: auth resolution falls back to `ANTHROPIC_API_KEY` when higher tiers are empty** — Unset `ANTHROPIC_AUTH_TOKEN`, clear stored token, set `ANTHROPIC_API_KEY=test-api-key`. Call `resolveClaudeAuth()`. Assert result source is `"env_api_key"` and env contains `ANTHROPIC_API_KEY: "test-api-key"`.

- **Test: auth resolution reads Claude Code keychain on macOS when all other tiers are empty** — Set `CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD` to `{"claudeAiOauth":{"accessToken":"kc-token"}}`. Unset all other auth sources. Call `resolveClaudeAuth()`. Assert result source is `"local_claude_keychain"` and env contains `ANTHROPIC_AUTH_TOKEN: "kc-token"`.

- **Test: auth resolution returns null when no source has credentials** — Clear all env vars, stored tokens, and mock keychain. Call `resolveClaudeAuth()`. Assert result is `null`.

- **Test: auth resolution ignores whitespace-only env vars** — Set `ANTHROPIC_AUTH_TOKEN="   "`. Call `resolveClaudeAuth()`. Assert it falls through to the next tier.

- **Test: auth resolution ignores empty string env vars** — Set `ANTHROPIC_AUTH_TOKEN=""`. Call `resolveClaudeAuth()`. Assert it falls through to the next tier.

- **Test: keychain payload with missing `claudeAiOauth` returns null** — Set `CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD` to `{}`. Call `loadClaudeOAuthAccessTokenFromKeychain()`. Assert result is `null`.

- **Test: keychain payload with invalid JSON returns null** — Set `CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD` to `"not json"`. Call `loadClaudeOAuthAccessTokenFromKeychain()`. Assert result is `null`.

#### Token Validation Tests

- **Test: `validateClaudeSetupToken` accepts valid `sk-ant-oat` token** — Call with `"sk-ant-oat01-abc123-XYZ.foo_bar"`. Assert it returns the token without error.

- **Test: `validateClaudeSetupToken` rejects empty string** — Call with `""`. Assert it throws with "no Claude setup token provided".

- **Test: `validateClaudeSetupToken` rejects token without `sk-ant-oat` prefix** — Call with `"sk-ant-xxx-abc123"`. Assert it throws with "Invalid Claude setup token".

- **Test: `extractClaudeSetupToken` extracts token from surrounding text** — Call with `"here is a token sk-ant-oat01-abc-DEF and more text"`. Assert it returns `"sk-ant-oat01-abc-DEF"`.

- **Test: `validateClaudeSetupToken` rejects whitespace-only input** — Call with `"   \n  "`. Assert it throws.

- **Test: token with maximum realistic length (256 chars) is accepted** — Construct a valid `sk-ant-oat` token of 256 characters. Call `validateClaudeSetupToken()`. Assert it succeeds.

#### Auth Seeding Script Tests

- **Test: `buildClaudeAuthSeedRemoteScript` generates correct shell script for `ANTHROPIC_AUTH_TOKEN`** — Call with `{ANTHROPIC_AUTH_TOKEN: "test-token"}`. Assert output contains `export ANTHROPIC_AUTH_TOKEN=`, `chmod 600`, and `chown developer:developer`.

- **Test: `buildClaudeAuthSeedRemoteScript` generates correct shell script for `ANTHROPIC_API_KEY`** — Call with `{ANTHROPIC_API_KEY: "sk-test-key"}`. Assert output contains `export ANTHROPIC_API_KEY=`.

- **Test: `buildClaudeAuthSeedRemoteScript` shell-escapes values with special characters** — Call with `{ANTHROPIC_AUTH_TOKEN: "token'with\"special$chars"}`. Assert the value is properly shell-escaped in the output.

- **Test: auth seed script creates directory with 700 permissions** — Call `buildClaudeAuthSeedRemoteScript` with any valid auth. Assert output contains `install -d` with `-m 700`.

#### Auth CLI Command Tests

- **Test: `codeplane auth claude login` stores valid token from stdin** — Pipe `"sk-ant-oat01-test123-ABC"` to `codeplane auth claude login`. Assert exit code 0. Assert JSON output includes `"status": "stored"`.

- **Test: `codeplane auth claude login` rejects invalid token from stdin** — Pipe `"invalid-token"` to `codeplane auth claude login`. Assert non-zero exit code. Assert error message mentions "Invalid Claude setup token".

- **Test: `codeplane auth claude logout` clears stored token** — Store a token, then run `codeplane auth claude logout`. Assert JSON output includes `"status": "logged_out"` and `"cleared": true`.

- **Test: `codeplane auth claude logout` handles no stored token gracefully** — Run `codeplane auth claude logout` without any stored token. Assert JSON output includes `"cleared": false`.

- **Test: `codeplane auth claude status` reports configured when auth exists** — Set `ANTHROPIC_AUTH_TOKEN=test-token`. Run `codeplane auth claude status`. Assert JSON output includes `"configured": true` and `"source": "ANTHROPIC_AUTH_TOKEN env"`.

- **Test: `codeplane auth claude status` reports not configured when no auth exists** — Clear all auth sources. Run `codeplane auth claude status`. Assert JSON output includes `"configured": false`.

- **Test: `codeplane auth claude token` prints the active token** — Set `ANTHROPIC_API_KEY=test-api-key`. Run `codeplane auth claude token`. Assert stdout contains the token value.

- **Test: `codeplane auth claude push` pushes credential to repository secrets** — Set `ANTHROPIC_AUTH_TOKEN=test-token`. Run `codeplane auth claude push --repo owner/repo`. Assert JSON output includes `"status": "pushed"`.

#### Workspace Issue Command Tests

- **Test: `codeplane workspace issue` rejects issue number 0** — Run `codeplane workspace issue 0 --repo owner/repo`. Assert error containing "invalid issue number".

- **Test: `codeplane workspace issue` rejects negative issue number** — Run `codeplane workspace issue -5 --repo owner/repo`. Assert error containing "invalid issue number".

- **Test: `codeplane workspace issue` rejects non-numeric issue number** — Run `codeplane workspace issue abc --repo owner/repo`. Assert error containing "invalid issue number".

- **Test: `codeplane workspace issue` rejects float issue number** — Run `codeplane workspace issue 3.14 --repo owner/repo`. Assert error containing "invalid issue number".

- **Test: `codeplane workspace issue` validates large integer issue number** — Run `codeplane workspace issue 999999999999999999 --repo owner/repo`. Assert error.

#### Remediation Message Tests

- **Test: `describeClaudeAuthRemediation` returns three remediation suggestions** — Call `describeClaudeAuthRemediation()`. Assert result is an array of 3 strings. Assert first mentions `claude setup-token`. Assert second mentions `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY`. Assert third mentions `claude login`.

- **Test: `describeClaudeAuthRemediation` with markdown option** — Call `describeClaudeAuthRemediation({ markdown: true })`. Assert results contain backtick-formatted code.

- **Test: `describeClaudeAuthRemediation` with rerunCommand option** — Call `describeClaudeAuthRemediation({ rerunCommand: "codeplane workspace issue 42" })`. Assert results contain "rerun" text.

### E2E Tests (with sandbox runtime)

- **Test (e2e/cli): `workspace issue` fetches issue, creates workspace, and reports structured output** — Create a test repository and issue. Set `ANTHROPIC_AUTH_TOKEN` in the test environment. Run `codeplane workspace issue <number> --repo <repo> --json`. Assert JSON output contains `workspace_id`, `issue`, and `status`.

- **Test (e2e/cli): `workspace issue` with no auth and no pre-existing workspace auth fails with remediation** — Create a test repository and issue. Clear all Claude auth sources. Run `codeplane workspace issue <number> --repo <repo>`. Assert error message contains "Claude Code auth is not configured". Assert error message contains at least one remediation suggestion.

- **Test (e2e/cli): `workspace issue` creates workspace named `issue-{number}`** — Create a test repository and issue. Run `codeplane workspace issue <number> --repo <repo> --json`. List workspaces for the repository. Assert a workspace named `issue-<number>` exists.

- **Test (e2e/cli): `workspace issue` with `--target` specifies the correct bookmark** — Create a test repository with a non-default bookmark. Create an issue. Run `codeplane workspace issue <number> --repo <repo> --target <bookmark> --json`. Assert the flow uses the specified target bookmark.

- **Test (e2e/api): auth seed script writes file with correct permissions** — Create a workspace and wait for SSH. Execute the auth seed script via SSH. Execute `stat -c '%a' /home/developer/.codeplane/claude-env.sh` via SSH. Assert permissions are `600`. Execute `stat -c '%U' /home/developer/.codeplane/claude-env.sh` via SSH. Assert owner is `developer`.

- **Test (e2e/api): auth seed script writes correct export statement** — Create a workspace and seed auth with `ANTHROPIC_AUTH_TOKEN=test-value`. Read the auth file contents via SSH. Assert it contains `export ANTHROPIC_AUTH_TOKEN=`. Assert the value matches `test-value`.

- **Test (e2e/api): auth directory is created with 700 permissions** — Create a workspace and seed auth. Execute `stat -c '%a' /home/developer/.codeplane` via SSH. Assert permissions are `700`.

- **Test (e2e/cli): `workspace issue` with issue that has no body produces valid prompt** — Create an issue with title but empty body. Run `codeplane workspace issue <number> --repo <repo> --json`. Assert the flow starts without error.

- **Test (e2e/cli): `workspace issue` with issue that has labels includes labels in prompt** — Create an issue with labels `["bug", "priority-high"]`. Verify that the prompt file written to the workspace contains "Labels: bug, priority-high".

- **Test (e2e/cli): `workspace issue` reports no landing request when Claude produces no changes** — Configure Claude Code to produce no changes. Run `codeplane workspace issue <number> --repo <repo> --json`. Assert JSON output contains `"message"` mentioning "No non-empty changes". Assert JSON output does not contain `"landing_request"` key.

### Credential Storage Tests

- **Test: credential store round-trip on test backend** — Set `CODEPLANE_TEST_CREDENTIAL_STORE_FILE` to a temp path. Store a token via `storeStoredClaudeAuthToken("sk-ant-oat01-test-ABC")`. Load via `loadStoredClaudeAuthToken()`. Assert the loaded value matches.

- **Test: credential store deletion on test backend** — Store and then delete via `deleteStoredClaudeAuthToken()`. Assert `loadStoredClaudeAuthToken()` returns `null`.

- **Test: credential store file has 600 permissions (test backend)** — Set `CODEPLANE_TEST_CREDENTIAL_STORE_FILE` to a temp path. Store a token. Assert the file has mode 600.

- **Test: credential store handles `CODEPLANE_DISABLE_SYSTEM_KEYRING=1`** — Set `CODEPLANE_DISABLE_SYSTEM_KEYRING=1`. Call `loadStoredToken()`. Assert it returns `null`. Call `storeToken()`. Assert it throws `SecureStorageUnavailableError`.
