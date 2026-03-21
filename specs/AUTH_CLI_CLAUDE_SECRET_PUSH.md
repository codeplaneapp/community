# AUTH_CLI_CLAUDE_SECRET_PUSH

Specification for AUTH_CLI_CLAUDE_SECRET_PUSH.

## High-Level User POV

When you use Codeplane workspaces, agent sessions, or workflows to automate development tasks, those remote environments need access to Claude Code credentials to run Claude on your behalf. Your local machine has Claude auth configured — perhaps through a stored subscription token from `codeplane auth claude login`, an `ANTHROPIC_AUTH_TOKEN` environment variable, an `ANTHROPIC_API_KEY`, or a local Claude Code OAuth login — but remote environments cannot reach your local keyring or read your local shell environment.

`codeplane auth claude push` bridges this gap. It resolves whichever Claude credential is currently active on your machine and securely pushes it into a repository's encrypted secrets store. Once pushed, any workflow run, workspace bootstrap, or agent session scoped to that repository can use the credential to authenticate Claude Code operations — writing code, reviewing diffs, triaging issues, or executing tasks in sandboxes.

The command is intentionally minimal. Run `codeplane auth claude push` from inside a repository checkout, and the CLI detects the repository, resolves your active Claude credential, determines the correct secret name (`ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` depending on what you have configured), and pushes it as a repository secret. If you're not inside a checkout, pass `--repo OWNER/REPO` explicitly. The CLI confirms what was pushed, where the credential came from, and which repository received it — without ever displaying the credential value itself.

This command is the Claude-credential counterpart to `codeplane auth push`, which pushes your Codeplane authentication token. Together, these two commands let you fully provision a remote environment with every credential it needs to operate autonomously: Codeplane API access and Claude Code access. The `codeplane workspace issue` automation flow relies on this same mechanism internally — when it seeds Claude auth into a workspace, it uses the same resolution cascade. Running `codeplane auth claude push` explicitly gives you direct control over when and where your Claude credentials are stored as repository secrets, making credential rotation and multi-repository provisioning straightforward.

If you rotate your Anthropic credentials, simply re-run `codeplane auth claude push` — the command uses upsert semantics, overwriting the previous secret value without requiring a separate delete step.

## Acceptance Criteria

### Definition of Done

- [ ] A user can run `codeplane auth claude push` to push their active Claude credential into the current repository's secrets.
- [ ] A user can run `codeplane auth claude push --repo OWNER/REPO` to push their active Claude credential to a specific repository's secrets.
- [ ] The command resolves the active Claude credential using the standard priority chain: `ANTHROPIC_AUTH_TOKEN` env → stored Claude subscription token (keyring) → `ANTHROPIC_API_KEY` env → local Claude Code OAuth keychain (macOS).
- [ ] The secret name matches the resolved credential type: `ANTHROPIC_AUTH_TOKEN` when the source is an auth/subscription/OAuth token, `ANTHROPIC_API_KEY` when the source is an API key.
- [ ] The command creates or updates the repository secret via `POST /api/repos/:owner/:repo/secrets` (upsert behavior).
- [ ] The command returns structured output including `status`, `repo`, `secret_name`, `source`, and `message`.
- [ ] The command prints a human-readable confirmation to stderr when not in structured output mode.
- [ ] The command fails with a clear error if no Claude auth is configured anywhere in the resolution cascade.
- [ ] The command fails with a clear error if the target repository cannot be determined (no `--repo` flag and no detectable remote).
- [ ] The command fails with a clear error if the user lacks write/admin permissions on the target repository.
- [ ] The command is registered in CLI help text under `codeplane auth claude push`.
- [ ] Shell completions include `push` as a subcommand of `auth claude` in bash, zsh, and fish.

### Functional Constraints

- [ ] The secret name is determined by the resolution cascade and is always either `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` — the user cannot customize it.
- [ ] The command must never print the raw credential value to stdout or stderr.
- [ ] The command must work with credentials from any source in the resolution cascade (env auth token, stored subscription token, env API key, local Claude Code keychain).
- [ ] If the repository secret already exists, it must be overwritten without error (upsert behavior).
- [ ] The command requires Codeplane server authentication in addition to Claude auth (the user must be logged in to Codeplane to call the secrets API).
- [ ] The command must refuse to send credentials over HTTP to non-loopback addresses.

### Edge Cases

- [ ] If no Claude auth is configured (no env vars, no stored token, no keychain entry), the command must fail with a message directing the user to `claude setup-token | codeplane auth claude login`, or to set `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY`, or to sign in locally via `claude login`.
- [ ] If the user is not logged in to Codeplane (no Codeplane auth token), the command must fail with a message directing the user to `codeplane auth login`.
- [ ] If the user runs `codeplane auth claude push` outside a repository checkout and without `--repo`, the command must fail with a message explaining how to specify the target repository.
- [ ] If the user's Codeplane token is expired or revoked, the API call returns 401; the CLI must surface "Codeplane token is invalid or expired" rather than a raw HTTP error.
- [ ] If the repository does not exist, the command must surface a clear "repository not found" error.
- [ ] If the secrets API returns 403 (insufficient permissions), the command must explain that write or admin access is required.
- [ ] If the network is unreachable, the command must fail with a network-specific error message.
- [ ] If the user has multiple remotes pointing to different Codeplane repositories, the command should prefer the `origin` remote (consistent with existing `resolveRepoRef` behavior).
- [ ] If the resolved Claude credential is empty after trimming (corrupted keyring entry, empty env var), the command must fail with a clear error rather than pushing an empty secret.
- [ ] If `ANTHROPIC_AUTH_TOKEN` is set to an empty string in the environment, the resolution cascade must skip it and fall through to the next source.
- [ ] If the user passes `--repo` with an invalid format (not `OWNER/REPO`, not a valid clone URL), the command must fail with a descriptive format error.

### Boundary Constraints

- [ ] Repository owner names: 1–39 characters, alphanumeric and hyphens, no leading/trailing hyphens.
- [ ] Repository names: 1–100 characters, alphanumeric, hyphens, underscores, and dots.
- [ ] Secret value (credential): minimum 1 character after trimming; maximum 10,000 characters.
- [ ] The `--repo` flag must accept `OWNER/REPO` format, HTTPS clone URLs, and SSH clone URLs.
- [ ] The `sk-ant-oat` subscription token pattern allows alphanumeric, hyphens, underscores, dots, and dashes.
- [ ] `ANTHROPIC_API_KEY` values follow the `sk-ant-api03-` prefix pattern and may be up to 256 characters.

## Design

### CLI Command

**Command**: `codeplane auth claude push`

**Synopsis**:
```
codeplane auth claude push [--repo OWNER/REPO]
```

**Options**:

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--repo`, `-R` | `string` | No | Target repository in `OWNER/REPO` format or as a clone URL. Defaults to auto-detection from jj/git remotes in the current directory. |

**Behavior**:

1. Resolve the active Claude credential using the standard priority chain:
   - `ANTHROPIC_AUTH_TOKEN` environment variable
   - Stored Claude subscription token from the OS keyring (`claude.subscription-token` key)
   - `ANTHROPIC_API_KEY` environment variable
   - macOS Claude Code OAuth keychain entry (`Claude Code-credentials` service)
2. Determine the corresponding secret name: `ANTHROPIC_AUTH_TOKEN` for auth/subscription/OAuth tokens, `ANTHROPIC_API_KEY` for API keys.
3. Resolve the target repository from `--repo` or by detecting jj/git remotes in the current directory.
4. Require Codeplane server authentication (active Codeplane token).
5. POST the credential to `/api/repos/:owner/:repo/secrets` with `{ name: <secret_name>, value: <credential> }`.
6. Return the result.

**Structured output** (when `--json` is used or stdout is not a TTY):
```json
{
  "status": "pushed",
  "repo": "owner/repo-name",
  "secret_name": "ANTHROPIC_AUTH_TOKEN",
  "source": "stored Claude subscription token",
  "message": "Pushed ANTHROPIC_AUTH_TOKEN from stored Claude subscription token to owner/repo-name."
}
```

**Human-readable output** (stderr):
```
✓ Pushed ANTHROPIC_AUTH_TOKEN from stored Claude subscription token to owner/repo-name.
```

**Error output examples**:
```
Error: no Claude Code auth found.
Run `claude setup-token | codeplane auth claude login`.
Or set ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY.
Or sign in with Claude Code locally (claude login).
```
```
Error: Could not determine repository. Use --repo OWNER/REPO or run from within a repo.
```
```
Error: POST /api/repos/owner/repo/secrets → 403: write access to repository required.
```
```
Error: POST /api/repos/owner/repo/secrets → 401: Codeplane token is invalid or expired. Run `codeplane auth login`.
```

**Exit codes**:

| Code | Meaning |
|------|--------|
| `0` | Secret pushed successfully |
| `1` | Error (no Claude auth, no repo, API error, network error) |

**Relationship to other commands**:

| Command | Effect |
|---------|--------|
| `codeplane auth claude login` | Stores a Claude subscription token in the keyring (prerequisite for push from keyring source) |
| `codeplane auth claude logout` | Clears the stored subscription token from the keyring |
| `codeplane auth claude status` | Shows whether Claude auth is configured and via which source |
| `codeplane auth claude token` | Prints the active Claude token or API key value |
| `codeplane auth claude push` | Pushes the active Claude credential into repository secrets (this feature) |
| `codeplane auth push` | Pushes the active Codeplane token into repository secrets (the Codeplane-token counterpart) |

### API Shape

This feature uses the existing secrets API endpoint. No new API routes are needed.

**Endpoint**: `POST /api/repos/:owner/:repo/secrets`

**Request body**:
```json
{
  "name": "ANTHROPIC_AUTH_TOKEN",
  "value": "<the-claude-credential>"
}
```

**Response** (200 or 201): Secret created or updated successfully.

**Error responses**:
- `401 Unauthorized`: Codeplane token is invalid, expired, or missing.
- `403 Forbidden`: User lacks write/admin permission on the repository.
- `404 Not Found`: Repository does not exist or user has no read access.
- `422 Unprocessable Entity`: Invalid secret name or empty value.

### SDK Shape

No new SDK services are required. The CLI command calls the existing `api()` helper to POST to the secrets endpoint, using the shared `pushClaudeAuthSecret` function that encapsulates credential resolution, repo resolution, and the API call.

The key internal functions involved:
- `getResolvedClaudeAuthToken()` — resolves Claude auth and returns `{ envKey, source, token }`
- `pushClaudeAuthSecret(repo, resolved)` — calls `resolveRepoRef` and POSTs to the secrets API
- `resolveRepoRef(repoOverride?)` — resolves `OWNER/REPO` from flag or git/jj remotes

### Documentation

The following end-user documentation should be written or updated:

1. **CLI Reference — `codeplane auth claude push`**: Document the command, its options, behavior, and output format. Include examples for pushing from inside a repo, pushing to a specific repo, pushing with JSON output, and interpreting the `secret_name` and `source` fields.

2. **Getting Started — Claude Code Integration**: Add a section explaining how to configure Claude credentials for remote environments. Cover the full flow: `claude setup-token | codeplane auth claude login` → `codeplane auth claude push` → workspace/workflow usage.

3. **Workspaces Guide — Claude Code in Workspaces**: Explain that `codeplane workspace issue` automatically seeds Claude auth into workspaces, but `codeplane auth claude push` lets you pre-provision the credential as a repository secret for explicit control and reuse.

4. **Workflows Guide — Secrets and Credentials**: Document that `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` can be pushed via `codeplane auth claude push` and will be available as a secret in workflow runs.

5. **Credential Rotation Guide**: Explain how to rotate Claude credentials: obtain a new token, run `codeplane auth claude login`, then `codeplane auth claude push` to update repository secrets.

## Permissions & Security

### Authorization Roles

| Role | Can push Claude secret? | Rationale |
|------|------------------------|----------|
| Repository Owner | ✅ Yes | Full repository control. |
| Repository Admin | ✅ Yes | Admin-level secret management. |
| Repository Write Member | ✅ Yes | Write access includes secret management for CI/CD and workspace workflows. |
| Repository Read Member | ❌ No | Read-only users cannot modify repository secrets. |
| Anonymous | ❌ No | Both Codeplane authentication and Claude authentication are required. |

The authorization check is enforced server-side by the existing secrets API endpoint. The CLI does not pre-check permissions; it relies on the API response.

**Dual-auth requirement**: This command requires two separate credentials:
1. **Codeplane auth** — to authenticate the API call to the secrets endpoint.
2. **Claude auth** — the credential being pushed. These are resolved from different sources and the absence of either produces a distinct, actionable error.

### Rate Limiting

- The secrets API endpoint should enforce the same rate limits as other mutation endpoints: **30 requests per minute per authenticated user**.
- The CLI does not add additional client-side rate limiting beyond what the server enforces.

### Data Privacy & Security Constraints

- **Credential in transit**: The credential is sent over HTTPS to the secrets API. The CLI must refuse to push credentials to `http://` endpoints unless the host is a loopback address (`localhost`, `127.0.0.1`, `[::1]`).
- **Credential at rest**: Repository secrets are stored encrypted at rest by the secrets service. The credential value is never returned by the API after creation.
- **Credential exposure in logs**: The CLI must never log, print, or include the raw credential value in structured output, human-readable output, or debug logs. Only the source label (e.g., "stored Claude subscription token"), the secret name (e.g., "ANTHROPIC_AUTH_TOKEN"), and the target repository should appear in output.
- **Credential scope**: The pushed credential carries whatever capabilities the user's Claude auth provides. Documentation should warn users that pushing a broad-scope credential grants those capabilities to any workflow, agent, or workspace session that reads the secret.
- **Credential rotation**: If the user rotates their Anthropic credential, they must re-run `codeplane auth claude push` for each relevant repository to update the secret. The upsert behavior makes this safe and idempotent.
- **Separation from Codeplane credentials**: Claude credentials and Codeplane credentials are independent. Pushing a Claude secret does not affect the Codeplane token, and vice versa.
- **PII**: Claude credentials are credentials, not PII. Repository owner/name and credential source are included in structured output and telemetry events — these are not PII.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | When Fired | Properties |
|------------|-----------|------------|
| `AuthCliClaudeSecretPushAttempted` | When the user runs `codeplane auth claude push` | `repo_owner`, `repo_name`, `credential_source` (`env_auth_token` / `stored_subscription_token` / `env_api_key` / `local_claude_keychain`), `secret_name` (`ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY`), `has_repo_flag` (boolean), `cli_version` |
| `AuthCliClaudeSecretPushSucceeded` | When the secret is successfully created/updated | `repo_owner`, `repo_name`, `credential_source`, `secret_name`, `duration_ms`, `cli_version` |
| `AuthCliClaudeSecretPushFailed` | When the push fails for any reason | `repo_owner` (if known), `repo_name` (if known), `credential_source` (if known), `secret_name` (if known), `error_category` (`no_claude_auth` / `no_codeplane_auth` / `no_repo` / `forbidden` / `not_found` / `network` / `server_error` / `empty_credential` / `insecure_endpoint`), `http_status` (if applicable), `cli_version` |

### Funnel Metrics & Success Indicators

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| Push success rate | `Succeeded` / `Attempted` | > 90% indicates good UX and clear error handling |
| Credential source distribution | Breakdown of `credential_source` across all pushes | Healthy if `stored_subscription_token` dominates (means users are using `auth claude login` properly) |
| Secret name distribution | Breakdown of `secret_name` across all pushes | Tracks whether users prefer subscription tokens vs. API keys |
| Auto-detection rate | Percentage of pushes where `has_repo_flag` is false | High auto-detection indicates users are running from inside repos (good ergonomics) |
| Repeat push rate | Number of users who push to the same repo more than once per week | High repeat rate may indicate credential rotation cadence or troubleshooting friction |
| Push-before-workspace-issue correlation | Percentage of `workspace.issue` invocations preceded by a push within the last 24 hours for the same repo | Indicates whether users understand the credential provisioning flow |
| Failure category distribution | Breakdown of `error_category` across all failures | `no_claude_auth` dominating suggests documentation gaps; `forbidden` dominating suggests permission confusion |

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Claude auth resolution started | `DEBUG` | `{ source_chain: ["env_auth_token", "stored_subscription_token", "env_api_key", "local_claude_keychain"] }` | Logged when the CLI begins resolving the active Claude credential. |
| Claude auth resolved | `DEBUG` | `{ source, secret_name }` | Logged when a credential is found. Must NOT include the credential value. |
| Claude auth resolution failed | `WARN` | `{ reason: "no_claude_auth" }` | Logged when no Claude credential is available. |
| Codeplane auth resolution started | `DEBUG` | `{ hostname }` | Logged when the CLI resolves the Codeplane token for the API call. |
| Repository resolution started | `DEBUG` | `{ has_repo_flag, cwd }` | Logged when the CLI begins resolving the target repository. |
| Repository resolved | `DEBUG` | `{ owner, repo, detection_method }` | Logged when the target repository is determined. |
| Repository resolution failed | `WARN` | `{ reason }` | Logged when no repository can be determined. |
| Secret push request sent | `INFO` | `{ owner, repo, secret_name }` | Logged when the API request is dispatched. Must NOT include the credential value. |
| Secret push succeeded | `INFO` | `{ owner, repo, secret_name, source, duration_ms }` | Logged when the API returns success. |
| Secret push failed | `ERROR` | `{ owner, repo, secret_name, http_status, error_message }` | Logged when the API returns an error. |
| Insecure endpoint blocked | `WARN` | `{ host, scheme: "http" }` | Logged when the CLI refuses to push to a non-loopback HTTP endpoint. |

**CRITICAL**: Credential values (subscription tokens, API keys, OAuth access tokens) must NEVER appear in logs at any level.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_cli_claude_secret_push_total` | Counter | `status` (`success` / `error`), `credential_source`, `secret_name`, `error_category` | Total number of Claude secret push attempts. |
| `codeplane_cli_claude_secret_push_duration_seconds` | Histogram | `status` | Duration of the push operation (API call round-trip). Buckets: 0.1, 0.25, 0.5, 1, 2.5, 5, 10. |
| `codeplane_api_repo_secrets_upsert_total` | Counter | `status` (`success` / `error`), `secret_name` | Server-side counter for secret upsert operations (existing metric, segmented by secret name). |

### Alerts

#### Alert: `ClaudeSecretPushHighFailureRate`

**Condition**: `rate(codeplane_cli_claude_secret_push_total{status="error"}[5m]) / rate(codeplane_cli_claude_secret_push_total[5m]) > 0.5` for 10 minutes.

**Severity**: Warning

**Runbook**:
1. Check the `error_category` label distribution to identify the dominant failure mode.
2. If `error_category="no_claude_auth"` dominates: likely a keyring integration issue or documentation gap. Check recent CLI releases for credential storage regressions. Verify `claude setup-token` still produces valid `sk-ant-oat` tokens.
3. If `error_category="no_codeplane_auth"` dominates: users may be running `auth claude push` before `auth login`. Check onboarding documentation.
4. If `error_category="forbidden"` dominates: check if repository permission policies changed or server deployment broke secret write authorization. Query `codeplane_api_repo_secrets_upsert_total{status="error"}` for server-side confirmation.
5. If `error_category="network"` dominates: check API server health, DNS resolution, and TLS certificate validity.
6. If `error_category="server_error"` dominates: check server logs for 500-level errors on `POST /api/repos/:owner/:repo/secrets`. Investigate database connectivity and secret encryption service health.
7. If `error_category="empty_credential"` dominates: a platform keyring or env var regression is returning empty values.

#### Alert: `ClaudeSecretPushLatencyHigh`

**Condition**: `histogram_quantile(0.95, rate(codeplane_cli_claude_secret_push_duration_seconds_bucket[5m])) > 5` for 5 minutes.

**Severity**: Warning

**Runbook**:
1. Check API server response latency for the secrets endpoint.
2. Investigate database query performance for secret upsert operations.
3. Check network latency between CLI user population and API server.
4. If localized, check CDN/proxy health in the affected region.
5. Correlate with `codeplane_api_repo_secrets_upsert_total` to determine if general or Claude-specific.

#### Alert: `ClaudeSecretPushNoAuthSpike`

**Condition**: `rate(codeplane_cli_claude_secret_push_total{error_category="no_claude_auth"}[1h]) > 10` for 2 hours.

**Severity**: Info (product signal)

**Runbook**:
1. This alert indicates many users are attempting to push Claude secrets without having Claude auth configured.
2. Review onboarding and documentation flows. Ensure the "Getting Started" guide clearly explains the `claude setup-token | codeplane auth claude login` prerequisite.
3. Check if `codeplane auth claude status` is surfacing clear remediation guidance.
4. Consider whether the CLI's error message needs improvement.
5. No immediate operational action required — this is a UX/documentation improvement signal.

### Error Cases and Failure Modes

| Error Case | User-Facing Message | HTTP Status | Recovery Action |
|-----------|---------------------|-------------|----------------|
| No Claude auth configured | `no Claude Code auth found.` + remediation steps | N/A (client-side) | Run `claude setup-token \| codeplane auth claude login`, set env vars, or `claude login` |
| No Codeplane auth configured | `not logged in. Run 'codeplane auth login' or set CODEPLANE_TOKEN.` | N/A (client-side) | Run `codeplane auth login` |
| Empty/corrupted credential | `Resolved Claude credential is empty. Re-configure via 'codeplane auth claude login'.` | N/A (client-side) | Run `codeplane auth claude logout` then login |
| Repository cannot be determined | `Could not determine repository. Use --repo OWNER/REPO or run from within a repo.` | N/A (client-side) | Pass `--repo` flag |
| Invalid `--repo` format | `Invalid repo format. Expected OWNER/REPO or a clone URL.` | N/A (client-side) | Fix the `--repo` value |
| Codeplane token expired | `Codeplane token is invalid or expired. Run 'codeplane auth login'.` | 401 | Re-authenticate |
| Insufficient permissions | `Write access to {owner}/{repo} is required to push secrets.` | 403 | Request write access |
| Repository not found | `Repository {owner}/{repo} not found.` | 404 | Check repo name |
| Rate limited | `Rate limit exceeded. Try again in {retry_after} seconds.` | 429 | Wait and retry |
| Server error | `Server error while pushing secret. Try again later.` | 500+ | Retry |
| Network unreachable | `Could not reach {host}. Check your network connection.` | N/A | Check connectivity |
| Insecure endpoint | `Refusing to push credential over insecure HTTP to {host}. Use HTTPS or a loopback address.` | N/A | Use HTTPS |

## Verification

### API Integration Tests

| Test ID | Description | Method |
|---------|-------------|--------|
| `api-claude-push-success-auth-token` | Authenticated user with write access pushes `ANTHROPIC_AUTH_TOKEN` secret and receives 200/201 | `POST /api/repos/:owner/:repo/secrets` with `name: "ANTHROPIC_AUTH_TOKEN"`, valid value |
| `api-claude-push-success-api-key` | Authenticated user pushes `ANTHROPIC_API_KEY` secret and receives 200/201 | `POST /api/repos/:owner/:repo/secrets` with `name: "ANTHROPIC_API_KEY"`, valid value |
| `api-claude-push-upsert` | Push `ANTHROPIC_AUTH_TOKEN` twice to the same repository; second push overwrites without error | Two sequential `POST` calls; verify both return success |
| `api-claude-push-unauthorized` | Request with no auth header returns 401 | `POST` without `Authorization` header |
| `api-claude-push-expired-codeplane-token` | Request with a revoked Codeplane PAT returns 401 | Create a PAT, revoke it, then use it to push |
| `api-claude-push-forbidden-read-only` | User with only read access receives 403 | Authenticate as a read-only collaborator and attempt to push |
| `api-claude-push-repo-not-found` | Push to a non-existent repository returns 404 | `POST /api/repos/nonexistent-owner/nonexistent-repo/secrets` |
| `api-claude-push-empty-value` | Push with an empty `value` field is rejected with 400/422 | `POST` with `{ name: "ANTHROPIC_AUTH_TOKEN", value: "" }` |
| `api-claude-push-whitespace-only-value` | Push with a whitespace-only `value` field is rejected | `POST` with `{ name: "ANTHROPIC_AUTH_TOKEN", value: "   " }` |
| `api-claude-push-max-length-value` | Push a credential value at the maximum allowed length (10,000 chars) succeeds | `POST` with a 10,000-character value |
| `api-claude-push-over-max-length` | Push a credential value exceeding maximum length is rejected | `POST` with a 10,001-character value |
| `api-claude-push-rate-limit` | Exceeding 30 requests/minute returns 429 | Send 31 rapid requests and verify the 31st is rate-limited |

### CLI E2E Tests

| Test ID | Description | Setup | Command | Expected Outcome |
|---------|-------------|-------|---------|------------------|
| `cli-claude-push-from-repo-dir` | Push credential from inside a repository checkout | Clone a repo, set `ANTHROPIC_AUTH_TOKEN` env | `codeplane auth claude push` | Exits 0; output contains `status: "pushed"`, correct `repo`, `secret_name: "ANTHROPIC_AUTH_TOKEN"`, `source: "ANTHROPIC_AUTH_TOKEN env"` |
| `cli-claude-push-with-repo-flag` | Push credential using explicit `--repo` flag | Set `ANTHROPIC_AUTH_TOKEN` env; NOT inside a repo | `codeplane auth claude push --repo owner/repo` | Exits 0; output contains correct repo |
| `cli-claude-push-with-repo-url` | Push credential using a clone URL as `--repo` value | Set `ANTHROPIC_AUTH_TOKEN` env | `codeplane auth claude push --repo https://codeplane.app/owner/repo.git` | Exits 0; URL parsed correctly |
| `cli-claude-push-with-ssh-url` | Push credential using SSH clone URL as `--repo` value | Set `ANTHROPIC_AUTH_TOKEN` env | `codeplane auth claude push --repo git@ssh.codeplane.app:owner/repo.git` | Exits 0; correct owner/repo |
| `cli-claude-push-json-output` | Structured JSON output when `--json` is used | Set `ANTHROPIC_AUTH_TOKEN` env; inside a repo | `codeplane auth claude push --json` | Valid JSON with `status`, `repo`, `secret_name`, `source`, `message` |
| `cli-claude-push-no-claude-auth` | Error when no Claude auth is configured | Unset all Anthropic env vars; no stored token | `codeplane auth claude push --repo owner/repo` | Exits non-zero; stderr contains "no Claude Code auth found" and remediation steps |
| `cli-claude-push-no-codeplane-auth` | Error when not logged in to Codeplane | Set `ANTHROPIC_AUTH_TOKEN`; clear Codeplane auth | `codeplane auth claude push --repo owner/repo` | Exits non-zero; stderr mentions Codeplane login |
| `cli-claude-push-no-repo` | Error when no repository determined | Set `ANTHROPIC_AUTH_TOKEN`; non-repo dir without `--repo` | `codeplane auth claude push` | Exits non-zero; stderr mentions `--repo` |
| `cli-claude-push-forbidden` | Error when user lacks write access | Read-only user; set `ANTHROPIC_AUTH_TOKEN` | `codeplane auth claude push --repo owner/repo` | Exits non-zero; stderr contains "403" or "write access" |
| `cli-claude-push-repo-not-found` | Error when repo does not exist | Set `ANTHROPIC_AUTH_TOKEN` | `codeplane auth claude push --repo nonexistent/repo` | Exits non-zero; stderr contains "not found" |
| `cli-claude-push-credential-not-leaked` | Credential never appears in stdout/stderr | Set `ANTHROPIC_AUTH_TOKEN` env | `codeplane auth claude push --repo owner/repo 2>&1` | Output does not contain credential string |
| `cli-claude-push-upsert` | Pushing twice overwrites without error | Set `ANTHROPIC_AUTH_TOKEN`; inside a repo | `codeplane auth claude push && codeplane auth claude push` | Both exit 0 |
| `cli-claude-push-env-auth-token-source` | Push from ANTHROPIC_AUTH_TOKEN env shows correct source | Set `ANTHROPIC_AUTH_TOKEN` env | `codeplane auth claude push --repo owner/repo --json` | `source` is `"ANTHROPIC_AUTH_TOKEN env"`, `secret_name` is `"ANTHROPIC_AUTH_TOKEN"` |
| `cli-claude-push-stored-subscription-source` | Push from stored subscription token shows correct source | Store via login; unset env vars | `codeplane auth claude push --repo owner/repo --json` | `source` is `"stored Claude subscription token"`, `secret_name` is `"ANTHROPIC_AUTH_TOKEN"` |
| `cli-claude-push-env-api-key-source` | Push from ANTHROPIC_API_KEY env shows correct source | Set `ANTHROPIC_API_KEY`; unset `ANTHROPIC_AUTH_TOKEN`; no stored token | `codeplane auth claude push --repo owner/repo --json` | `source` is `"ANTHROPIC_API_KEY env"`, `secret_name` is `"ANTHROPIC_API_KEY"` |
| `cli-claude-push-keychain-source` | Push from macOS keychain shows correct source | Set `CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD`; unset all env vars; no stored token | `codeplane auth claude push --repo owner/repo --json` | `source` is `"local Claude Code login"`, `secret_name` is `"ANTHROPIC_AUTH_TOKEN"` |
| `cli-claude-push-priority-env-over-stored` | ANTHROPIC_AUTH_TOKEN env takes priority over stored token | Set env AND store token | `codeplane auth claude push --repo owner/repo --json` | `source` is `"ANTHROPIC_AUTH_TOKEN env"` |
| `cli-claude-push-priority-stored-over-api-key` | Stored token takes priority over ANTHROPIC_API_KEY | Store token; set API key; unset auth token | `codeplane auth claude push --repo owner/repo --json` | `source` is `"stored Claude subscription token"` |
| `cli-claude-push-invalid-repo-format` | Error on invalid `--repo` format | Set `ANTHROPIC_AUTH_TOKEN` | `codeplane auth claude push --repo "not-valid"` | Exits non-zero; stderr contains "Invalid repo format" |
| `cli-claude-push-empty-env-skipped` | Empty ANTHROPIC_AUTH_TOKEN is skipped | Set `ANTHROPIC_AUTH_TOKEN=""` and `ANTHROPIC_API_KEY` | `codeplane auth claude push --repo owner/repo --json` | `source` is `"ANTHROPIC_API_KEY env"` |

### Security Tests

| Test ID | Description |
|---------|-------------|
| `sec-claude-push-no-credential-in-output` | Capture all stdout/stderr and assert credential value does not appear anywhere |
| `sec-claude-push-no-credential-in-structured` | Parse JSON output and assert no field contains the raw credential value |
| `sec-claude-push-http-blocked` | Verify pushing to non-loopback HTTP URL is rejected before API call |
| `sec-claude-push-tls-verification` | Verify CLI does not disable TLS certificate verification |
| `sec-claude-push-credential-not-in-debug-logs` | Run with verbose logging and verify credential does not appear in logs |

### End-to-End Workflow Tests

| Test ID | Description |
|---------|-------------|
| `e2e-claude-push-then-workflow-uses-credential` | Push ANTHROPIC_AUTH_TOKEN via CLI, trigger a workflow, verify workflow can read the secret |
| `e2e-claude-push-then-workspace-uses-credential` | Push ANTHROPIC_AUTH_TOKEN via CLI, create workspace, verify workspace has the credential |
| `e2e-claude-push-rotate-push` | Push credential A, store new credential B via login, push B; verify secret is updated |
| `e2e-claude-push-login-then-push-roundtrip` | Login → status (configured) → push → verify secret exists |
| `e2e-claude-push-and-codeplane-push-independent` | Push Claude credential and Codeplane token to same repo; verify both secrets exist independently |
| `e2e-claude-push-workspace-issue-flow` | Push Claude credential, run `codeplane workspace issue #N`; verify workspace bootstraps with Claude auth |

### Shell Completion Tests

| Test ID | Description |
|---------|-------------|
| `completion-bash-claude-push` | Bash completion includes `push` as subcommand of `auth claude` |
| `completion-zsh-claude-push` | Zsh completion includes `push` as subcommand of `auth claude` |
| `completion-fish-claude-push` | Fish completion includes `push` as subcommand of `auth claude` |
| `completion-claude-push-repo-flag` | Completion for `codeplane auth claude push --` includes `--repo` |
| `completion-claude-push-no-extra-flags` | Completion does not offer flags that don't exist (e.g., `--hostname`, `--force`) |
