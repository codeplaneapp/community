# WORKSPACE_CLI_FORK

Specification for WORKSPACE_CLI_FORK.

## High-Level User POV

When you're working with Codeplane workspaces from the command line, there are moments when you want to duplicate an entire running workspace into an independent copy — without leaving your terminal. Perhaps you're about to try a risky refactor and want a safety net. Perhaps you want to spin up a parallel environment for an AI agent to work in while you continue in your current workspace. Or perhaps you just want to hand off a fully configured development environment to a teammate so they can pick up exactly where you left off.

The `codeplane workspace fork` command lets you do this in a single invocation. You point it at a running workspace by ID, optionally give the fork a name, and Codeplane creates a brand-new, independent workspace that starts from the same state as the original. The forked workspace has its own container, its own SSH access, its own lifecycle — but it carries a visible lineage marker back to the workspace it was forked from, so you always know where it originated.

If you're running Codeplane Community Edition, the direct fork command will tell you that single-step forking requires Codeplane Cloud, and it will guide you through the two-step alternative: first take a snapshot of your workspace with `codeplane workspace snapshot`, then create a new workspace from that snapshot with `codeplane workspace create --snapshot`. The end result is the same — an independent forked workspace — but the CE path gives you explicit control over when and what state is captured.

The fork command fits naturally into scripting and automation workflows. It outputs structured JSON when you ask for it, returns predictable exit codes, and auto-detects the repository context from your current directory so you don't have to specify `--repo` every time. For agent orchestration, you can fork a workspace N times in a shell loop and dispatch different agents to each fork — all starting from the same known-good state.

## Acceptance Criteria

### Definition of Done

- The `codeplane workspace fork <WORKSPACE_ID>` command exists and is invocable from the CLI.
- The command calls `POST /api/repos/:owner/:repo/workspaces/:id/fork` with the provided name (or empty string if omitted).
- On success (HTTP 201), the command outputs a human-readable summary by default, or raw JSON with `--json`.
- On HTTP 501 (Community Edition), the command prints the server error message **and** a helpful hint directing the user to the snapshot-based fork workflow.
- On all other errors, the command prints a clear error message and exits with code 1.
- The `--repo` flag accepts `OWNER/REPO` format, and when omitted the command auto-detects the repository from jj/git remotes in the current working directory.
- The `--name` flag is optional; when omitted, it sends an empty string to the server, which triggers server-side default name generation (`fork-of-{source-name}`).
- The command is discoverable via `codeplane workspace --help` and `codeplane workspace fork --help`.
- The command is included in shell completion output.

### Functional Constraints

- **Positional argument `id` is required**: Invoking `codeplane workspace fork` without a workspace ID must print a usage error and exit with code 1.
- **`--name` validation**: The CLI does not perform client-side name validation beyond what the `incur` schema enforces (it sends the string as-is and lets the server validate). Server-side validation rejects names that do not match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` or exceed 63 characters.
- **`--repo` format**: Must be `OWNER/REPO`. Full clone URLs (HTTPS/SSH) for the configured host are also accepted and parsed. Invalid formats produce a clear error.
- **Authentication required**: The command requires a valid auth token. If no token is configured, the command prints an error directing the user to `codeplane auth login` and exits with code 1.
- **Exit codes**: 0 on success, 1 on any error (authentication, network, server error, validation).
- **No interactive prompts**: The fork command is non-interactive. It never prompts for confirmation or input. This makes it safe for use in scripts and automation pipelines.
- **Idempotency**: The command is not idempotent. Each invocation creates a new workspace fork. Repeated calls with the same name will fail with a 409 conflict after the first succeeds.
- **Output format — human-readable (default)**: Prints a summary block to stdout containing the forked workspace ID, name, parent workspace ID, and initial status.
- **Output format — JSON (`--json`)**: Prints the raw `WorkspaceResponse` JSON object to stdout. No additional decoration.
- **Stderr for diagnostics**: All error messages, hints, and non-data output are printed to stderr. Stdout is reserved for the fork result.

### Edge Cases

- **Empty `--name` (default)**: Sends `""` to the server. Server generates `fork-of-{source-name}`.
- **`--name` with whitespace only**: Sends the whitespace string; server trims to empty and generates default name.
- **`--name` exceeding 63 characters**: Server returns 400/422. CLI prints the error.
- **`--name` with uppercase letters**: Sent as-is. Server may lowercase or reject depending on validation.
- **`--name` with special characters**: Sent as-is. Server rejects names not matching the regex.
- **`--name` starting or ending with hyphen**: Server rejects.
- **`--name` containing consecutive hyphens**: Server rejects.
- **Non-existent workspace ID**: Server returns 404. CLI prints "workspace not found".
- **Non-running workspace**: Server returns 409. CLI prints "workspace must be running to fork".
- **Workspace owned by another user**: Server returns 404. CLI does not reveal workspace existence.
- **No auth token configured**: CLI prints error before making any network request.
- **Expired or invalid auth token**: Server returns 401. CLI prints authentication error.
- **Network unreachable**: CLI prints a connection error.
- **Server timeout**: CLI prints a timeout error.
- **Rate limit exceeded**: Server returns 429. CLI prints rate limit error with retry guidance.
- **`--repo` omitted in directory with no remotes**: CLI prints "Could not determine repository. Use -R OWNER/REPO or run from within a repo." and exits 1.
- **`--repo` with invalid format**: CLI prints "Invalid repo format" and exits 1.
- **Concurrent invocations with same name**: First succeeds, subsequent get 409. Each invocation is independent.
- **Forking a fork**: Allowed. The new fork's `parent_workspace_id` points to the immediate parent.
- **501 response with `--json`**: The JSON error object is printed to stdout (consistent with how `incur` handles API errors), and the snapshot hint is printed to stderr.

## Design

### CLI Command

#### Synopsis

```
codeplane workspace fork <WORKSPACE_ID> [--name <name>] [--repo <OWNER/REPO>] [--json]
```

#### Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `WORKSPACE_ID` | string | Yes | UUID of the workspace to fork |

#### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--name` | string | `""` (server generates default) | Human-readable name for the forked workspace |
| `--repo`, `-R` | string | auto-detected from cwd | Repository in `OWNER/REPO` format |
| `--json` | boolean | `false` | Output raw JSON response |

#### Human-Readable Output (default)

On success:
```
Forked workspace my-fork (id: a1b2c3d4-e5f6-7890-abcd-ef1234567890)
  Parent: 11223344-5566-7788-99aa-bbccddeeff00
  Status: starting
  Repository: alice/myapp
```

On HTTP 501 (CE):
```
Error: forking requires Codeplane Cloud — container-based workspaces cannot fork a running VM's memory state

Hint: Use the snapshot-based fork workflow instead:
  1. codeplane workspace snapshot 11223344-5566-7788-99aa-bbccddeeff00 --name my-snapshot --repo alice/myapp
  2. codeplane workspace create --name my-fork --snapshot <SNAPSHOT_ID> --repo alice/myapp
```

On other errors:
```
Error: workspace not found
```

#### JSON Output (`--json`)

On success:
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "repository_id": 123,
  "user_id": 456,
  "name": "my-fork",
  "status": "starting",
  "is_fork": true,
  "parent_workspace_id": "11223344-5566-7788-99aa-bbccddeeff00",
  "freestyle_vm_id": "vm-abcdef",
  "persistence": "persistent",
  "idle_timeout_seconds": 1800,
  "suspended_at": null,
  "created_at": "2026-03-22T10:00:00.000Z",
  "updated_at": "2026-03-22T10:00:00.000Z"
}
```

On error:
```json
{
  "message": "workspace not found"
}
```

#### Exit Codes

| Code | Meaning |
|------|--------|
| 0 | Fork created successfully |
| 1 | Any error (auth, validation, network, server error) |

#### Help Text

```
codeplane workspace fork --help

Fork a workspace

Usage: codeplane workspace fork <id> [options]

Arguments:
  id    Workspace ID to fork

Options:
  --name <name>      Name for the forked workspace (default: server-generated)
  --repo <OWNER/REPO>  Repository (default: auto-detected from cwd)
  --json             Output raw JSON
  -h, --help         Show this help message
```

### API Shape

The CLI calls the existing workspace fork API endpoint:

**Endpoint**: `POST /api/repos/:owner/:repo/workspaces/:id/fork`

**Request Body**:
```json
{ "name": "<user-provided or empty string>" }
```

**Success Response**: HTTP 201 with `WorkspaceResponse` JSON body.

**Error Responses**: HTTP 400, 401, 403, 404, 409, 429, 500, or 501 with `{ "message": "..." }` body.

The CLI does not add any client-specific headers beyond the standard `Authorization`, `Accept`, and `Content-Type` headers managed by the shared `api()` client function.

### SDK Shape

The CLI does not directly import the SDK `WorkspaceService`. It calls the HTTP API via the shared `api()` function in `apps/cli/src/client.ts`. The SDK types are relevant only as the server-side contract that defines the response shape.

Relevant SDK exports consumed transitively:
- `ForkWorkspaceInput` — defines the server-side input shape
- `WorkspaceResponse` — defines the response payload shape

### Shell Completion

The `workspace fork` subcommand must be included in the completion output generated by `codeplane completion`. The `--name` and `--repo` flags should appear in flag completion. Workspace ID argument completion is not expected (UUIDs are not completable from client-side state).

### Documentation

End-user documentation for the CLI fork command should include:

- **CLI Reference — `workspace fork`**: Full command synopsis, all arguments and options with descriptions and defaults, human-readable and JSON output format examples, all exit codes, and CE 501 behavior with the snapshot-based workaround.
- **CLI Quickstart — Forking a Workspace**: A short tutorial showing: (1) listing workspaces to find the ID, (2) forking with a custom name, (3) verifying the fork exists in the workspace list, (4) SSHing into the fork.
- **CLI Quickstart — Snapshot-Based Forking (CE)**: A short tutorial showing: (1) creating a snapshot, (2) creating a workspace from the snapshot, (3) verifying the fork.
- **Scripting Guide — Parallel Forks**: Example shell script that forks a workspace N times in a loop, collects the fork IDs, and dispatches work to each fork via SSH.
- **Troubleshooting — Workspace Fork CLI Errors**: Table of common error messages, their causes, and remediation steps.

## Permissions & Security

### Authorization

| Actor | Can Use `workspace fork`? | Notes |
|-------|---------------------------|-------|
| Repository Owner | Yes | Full access to fork their own workspaces |
| Repository Admin | Yes | Full access to fork their own workspaces within administered repos |
| Member (Write access) | Yes | Can fork their own workspaces in repos where they have write access |
| Read-Only | No | Server returns HTTP 403 `"write access required"` |
| Anonymous / Unauthenticated | No | CLI exits with auth error before making request; server returns HTTP 401 |

**Ownership constraint**: A user can only fork workspaces they own. Attempting to fork another user's workspace returns HTTP 404. The CLI does not distinguish "not found" from "belongs to another user" — this prevents workspace enumeration.

### Authentication Requirements

- The CLI requires a valid personal access token or active session token.
- Token is loaded from the local auth state file managed by `codeplane auth login`.
- If no token exists, the command fails immediately with a message directing the user to authenticate.
- Tokens are transmitted via the `Authorization: token <PAT>` header over HTTPS.

### Rate Limiting

- **Per-user**: Maximum 10 fork requests per minute (enforced server-side).
- **Per-repository**: Maximum 30 fork requests per minute (enforced server-side).
- **Global**: Subject to the server-wide rate limiting middleware.
- When rate limited, the server returns HTTP 429 with a `Retry-After` header.
- The CLI prints the 429 error message and does **not** auto-retry. The user or script must handle backoff.

### Data Privacy Constraints

- The CLI transmits the workspace ID, repository owner/name, and optional fork name to the server. None of these are inherently PII but users should avoid embedding sensitive information in workspace names.
- The forked workspace inherits the file system and environment state of the parent workspace. If the parent contained secrets or credentials in its file system, those are present in the fork. This is acceptable because only the workspace owner can fork their own workspace.
- Auth tokens are never logged or printed to stdout/stderr.
- The `--json` output may include `user_id` and `repository_id` fields. These are internal numeric IDs, not PII.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `cli.workspace.fork.invoked` | CLI `workspace fork` command executed | `has_custom_name` (bool), `has_repo_flag` (bool), `repo_auto_detected` (bool), `json_output` (bool) |
| `cli.workspace.fork.succeeded` | Fork API returned HTTP 201 | `workspace_id`, `parent_workspace_id`, `repository_id`, `name_length`, `name_was_customized` (bool), `duration_ms`, `status` |
| `cli.workspace.fork.failed` | Fork API returned an error | `error_code` (HTTP status), `error_type` ("auth" | "not_found" | "not_running" | "name_conflict" | "rate_limited" | "not_implemented" | "server_error" | "network_error"), `error_message`, `duration_ms` |
| `cli.workspace.fork.501_hint_shown` | CE 501 received and snapshot hint printed | `parent_workspace_id`, `repository_id` |
| `cli.workspace.fork.auth_missing` | Command aborted because no auth token was configured | — |
| `cli.workspace.fork.repo_detection_failed` | Neither `--repo` flag nor cwd remote detection produced a result | — |

### Funnel Metrics & Success Indicators

- **CLI fork success rate**: `cli.workspace.fork.succeeded` / `cli.workspace.fork.invoked`. Target: >90% (excluding 501s in CE environments).
- **CLI fork error distribution**: Breakdown of `cli.workspace.fork.failed` by `error_type`. Helps identify whether failures are auth issues, infra issues, or user errors.
- **501-to-snapshot conversion**: Track whether users who receive the 501 hint subsequently run `codeplane workspace snapshot` within the same session. Target: >40% conversion.
- **Repo auto-detection success rate**: % of invocations where `repo_auto_detected=true`. Target: >70% (indicates users are running the command from within repo directories).
- **JSON output adoption**: % of invocations with `json_output=true`. Insight metric — high values indicate scripting/automation usage.
- **Fork latency (p50/p95)**: Distribution of `duration_ms` for successful forks. Target: p95 < 5s for the CLI round-trip (excluding workspace provisioning time).
- **Name customization rate**: % of forks where `name_was_customized=true`. Insight metric for UX.

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|-------------------|
| `info` | CLI workspace fork command invoked | `{ workspace_id, repo_owner, repo_name, has_custom_name, json_output }` |
| `info` | CLI workspace fork succeeded | `{ workspace_id, parent_workspace_id, name, status, duration_ms }` |
| `info` | CLI workspace fork received 501 (CE) | `{ workspace_id, repo_owner, repo_name }` |
| `warn` | CLI workspace fork received 409 (name conflict) | `{ workspace_id, attempted_name, repo_owner, repo_name }` |
| `warn` | CLI workspace fork received 429 (rate limited) | `{ workspace_id, repo_owner, repo_name, retry_after }` |
| `error` | CLI workspace fork failed with server error | `{ workspace_id, error_code, error_message, duration_ms }` |
| `error` | CLI workspace fork failed with network error | `{ workspace_id, error_message }` |
| `debug` | Repository auto-detection result | `{ detected_owner, detected_repo, detection_method: "jj" | "git" | "flag" }` |
| `debug` | Auth token loaded for fork request | `{ token_type: "pat" | "session", api_url }` |
| `debug` | API request sent | `{ method: "POST", path, body_size_bytes }` |
| `debug` | API response received | `{ status_code, response_size_bytes, duration_ms }` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_cli_workspace_fork_total` | Counter | `status` ("success" | "failed" | "not_implemented"), `error_type` | Total CLI workspace fork invocations |
| `codeplane_cli_workspace_fork_duration_seconds` | Histogram | `status` | CLI round-trip duration for fork command |
| `codeplane_cli_workspace_fork_501_total` | Counter | — | Total 501 responses received by CLI fork command |
| `codeplane_cli_workspace_fork_auth_failures_total` | Counter | — | Fork attempts aborted due to missing or invalid auth |
| `codeplane_cli_workspace_fork_repo_detection_failures_total` | Counter | — | Fork attempts aborted due to repo detection failure |

### Alerts

#### `CLIWorkspaceForkHighFailureRate`
**Condition**: `rate(codeplane_cli_workspace_fork_total{status="failed"}[15m]) / rate(codeplane_cli_workspace_fork_total[15m]) > 0.3`
**Severity**: Warning
**Runbook**:
1. Check `error_type` label distribution — is the failure concentrated in one category?
2. If `error_type="server_error"`: check server-side `codeplane_workspace_fork_errors_total` metrics and server logs for 500-class errors. Likely a sandbox/container runtime issue.
3. If `error_type="auth"`: check whether the auth service is healthy. Verify tokens are being validated correctly.
4. If `error_type="network_error"`: check network connectivity between CLI users and the API server. Verify DNS resolution and TLS certificate validity.
5. If `error_type="rate_limited"`: check if a single user or automation script is hammering the fork endpoint. Review rate limit configuration.
6. Cross-reference with server-side `codeplane_workspace_forks_total` — if server-side success rate is healthy, the issue may be CLI-specific (version mismatch, configuration drift).

#### `CLIWorkspaceForkLatencyHigh`
**Condition**: `histogram_quantile(0.95, rate(codeplane_cli_workspace_fork_duration_seconds_bucket[15m])) > 10`
**Severity**: Warning
**Runbook**:
1. Check server-side `codeplane_workspace_fork_provisioning_duration_seconds` — is the server slow to respond?
2. If server-side latency is normal, the issue is network latency between the CLI and server. Check network path, TLS handshake time, and DNS resolution.
3. If server-side latency is also high, follow the server-side `WorkspaceForkProvisioningLatencyHigh` runbook.
4. Check if the slow requests are concentrated to a specific region or set of users.

#### `CLIWorkspaceFork501Spike`
**Condition**: `rate(codeplane_cli_workspace_fork_501_total[1h]) > 20`
**Severity**: Info (P4)
**Runbook**:
1. This is informational — 501 is expected on Community Edition.
2. If this is a Cloud deployment, investigate why the sandbox client is not configured. Check `CODEPLANE_CONTAINER_RUNTIME` and sandbox client initialization logs.
3. If on CE, consider improving the 501 hint message or adding proactive CLI-side edition detection before calling fork.
4. Review 501-to-snapshot conversion funnel to ensure the fallback guidance is effective.

### Error Cases and Failure Modes

| Error Case | CLI Behavior | Exit Code | Recovery |
|------------|-------------|-----------|----------|
| No auth token | Prints "Not authenticated. Run `codeplane auth login`." to stderr | 1 | User runs `codeplane auth login` |
| Expired/invalid token | Prints "POST ...fork → 401: authentication required" to stderr | 1 | User re-authenticates |
| Repo not detected | Prints "Could not determine repository..." to stderr | 1 | User provides `--repo OWNER/REPO` |
| Invalid `--repo` format | Prints "Invalid repo format..." to stderr | 1 | User corrects to `OWNER/REPO` |
| Missing workspace ID arg | Prints usage error from `incur` | 1 | User provides workspace ID |
| Workspace not found (404) | Prints "workspace not found" | 1 | User verifies workspace ID |
| Workspace not running (409) | Prints "workspace must be running to fork" | 1 | User resumes workspace first |
| Name conflict (409) | Prints "workspace name already in use" | 1 | User provides different `--name` |
| Invalid name (400/422) | Prints validation error from server | 1 | User corrects name format |
| Rate limited (429) | Prints "rate limit exceeded" | 1 | User waits and retries |
| CE direct fork (501) | Prints error + snapshot hint | 1 | User follows snapshot-based workflow |
| Sandbox unavailable (500) | Prints "sandbox client unavailable" | 1 | Admin configures container runtime |
| Network unreachable | Prints connection error | 1 | User checks network/server availability |
| Server timeout | Prints timeout error | 1 | User retries |

## Verification

### CLI Integration Tests

#### Happy Path

- [ ] **`CLI workspace fork > forks a running workspace with custom name`**: Run `codeplane workspace fork <id> --name cli-fork --repo owner/repo --json`. Verify: exit code 0, JSON output contains `is_fork: true`, `parent_workspace_id` equals source ID, `name: "cli-fork"`, `status: "starting"`, and all required `WorkspaceResponse` fields.
- [ ] **`CLI workspace fork > forks a running workspace without --name`**: Run `codeplane workspace fork <id> --repo owner/repo --json`. Verify: exit code 0, JSON output contains auto-generated name matching `fork-of-*` pattern.
- [ ] **`CLI workspace fork > forks a running workspace with empty --name`**: Run `codeplane workspace fork <id> --name "" --repo owner/repo --json`. Verify: exit code 0, server generates default name.
- [ ] **`CLI workspace fork > auto-detects repo from cwd`**: From within a cloned repo directory, run `codeplane workspace fork <id> --json` without `--repo`. Verify: exit code 0, correct repository used.
- [ ] **`CLI workspace fork > outputs human-readable format by default`**: Run `codeplane workspace fork <id> --repo owner/repo` without `--json`. Verify: stdout contains "Forked workspace", workspace ID, parent ID, and status in readable format.
- [ ] **`CLI workspace fork > outputs valid JSON with --json`**: Run with `--json`. Verify: stdout is valid JSON, parseable, and contains all `WorkspaceResponse` fields.
- [ ] **`CLI workspace fork > fork response includes is_fork true`**: Verify JSON response `is_fork` field is boolean `true`.
- [ ] **`CLI workspace fork > fork response includes parent_workspace_id`**: Verify `parent_workspace_id` equals the source workspace ID.
- [ ] **`CLI workspace fork > fork response timestamps are valid ISO strings`**: Verify `created_at` and `updated_at` are valid ISO 8601 date strings.
- [ ] **`CLI workspace fork > forked workspace appears in workspace list`**: After forking, run `codeplane workspace list --repo owner/repo --json`. Verify: fork appears in the list with `is_fork: true`.
- [ ] **`CLI workspace fork > fork does not affect parent workspace`**: After forking, run `codeplane workspace view <parent-id> --repo owner/repo --json`. Verify: parent metadata unchanged.
- [ ] **`CLI workspace fork > forking a fork is allowed`**: Fork workspace A to get B, then fork B to get C. Verify: C has `parent_workspace_id` pointing to B.
- [ ] **`CLI workspace fork > multiple forks with different names all succeed`**: Fork same workspace 3 times with names `fork-a`, `fork-b`, `fork-c`. Verify: all 3 return exit code 0.

#### Name Handling

- [ ] **`CLI workspace fork > name with 1 character (minimum valid)`**: `--name a`. Verify: exit code 0, name is `"a"`.
- [ ] **`CLI workspace fork > name with exactly 63 characters (maximum valid)`**: `--name <63-char valid string>`. Verify: exit code 0, name is the 63-char string.
- [ ] **`CLI workspace fork > name with 64 characters (exceeds max)`**: `--name <64-char string>`. Verify: exit code 1, error message indicates name too long.
- [ ] **`CLI workspace fork > name with only whitespace`**: `--name "   "`. Verify: server generates default name (trimmed to empty).
- [ ] **`CLI workspace fork > name with uppercase letters`**: `--name MyFork`. Verify: server behavior (lowered or rejected).
- [ ] **`CLI workspace fork > name starting with hyphen`**: `--name "-bad"`. Verify: exit code 1, validation error.
- [ ] **`CLI workspace fork > name ending with hyphen`**: `--name "bad-"`. Verify: exit code 1, validation error.
- [ ] **`CLI workspace fork > name with consecutive hyphens`**: `--name "my--fork"`. Verify: exit code 1, validation error.
- [ ] **`CLI workspace fork > name with special characters`**: `--name "my_fork!@#"`. Verify: exit code 1, validation error.

#### Error Cases

- [ ] **`CLI workspace fork > returns 501 in Community Edition`**: Run on CE. Verify: exit code 1, stderr contains "forking requires Codeplane Cloud", stderr contains snapshot hint.
- [ ] **`CLI workspace fork > 501 hint includes snapshot command example`**: On CE, verify: stderr output includes `codeplane workspace snapshot` and `codeplane workspace create --snapshot` example commands.
- [ ] **`CLI workspace fork > 501 with --json outputs JSON error`**: Run on CE with `--json`. Verify: stdout is JSON `{ "message": "..." }`, stderr still includes hint.
- [ ] **`CLI workspace fork > missing workspace ID argument`**: Run `codeplane workspace fork --repo owner/repo`. Verify: exit code 1, usage error printed.
- [ ] **`CLI workspace fork > returns 404 for non-existent workspace`**: Run with random UUID. Verify: exit code 1, "workspace not found" in output.
- [ ] **`CLI workspace fork > returns 409 for non-running workspace`**: Fork a suspended workspace. Verify: exit code 1, "workspace must be running to fork".
- [ ] **`CLI workspace fork > returns 409 for duplicate fork name`**: Fork twice with same name. Verify: first exits 0, second exits 1 with "workspace name already in use".
- [ ] **`CLI workspace fork > returns 401 without auth`**: Run without auth token configured. Verify: exit code 1, authentication error.
- [ ] **`CLI workspace fork > returns 403 for read-only user`**: Authenticate as read-only user. Verify: exit code 1, "write access required".
- [ ] **`CLI workspace fork > returns 404 for another user's workspace`**: Fork another user's workspace ID. Verify: exit code 1, "workspace not found" (no existence leak).
- [ ] **`CLI workspace fork > returns 429 when rate limited`**: Exceed rate limit with rapid requests. Verify: exit code 1, rate limit error.
- [ ] **`CLI workspace fork > exit code 0 on success`**: Verify process exit code is exactly 0.
- [ ] **`CLI workspace fork > exit code 1 on failure`**: Verify process exit code is exactly 1 for any error.

#### Repo Detection

- [ ] **`CLI workspace fork > --repo flag overrides auto-detection`**: From within repo A's directory, run with `--repo B_OWNER/B_REPO`. Verify: fork created against repo B.
- [ ] **`CLI workspace fork > fails gracefully when not in a repo and --repo omitted`**: From `/tmp`, run without `--repo`. Verify: exit code 1, "Could not determine repository" message.
- [ ] **`CLI workspace fork > supports -R as alias for --repo`**: Run with `-R owner/repo`. Verify: same behavior as `--repo`.
- [ ] **`CLI workspace fork > accepts HTTPS clone URL for --repo`**: Run with `--repo https://codeplane.app/alice/myapp.git`. Verify: parsed correctly.
- [ ] **`CLI workspace fork > accepts SSH clone URL for --repo`**: Run with `--repo git@ssh.codeplane.app:alice/myapp.git`. Verify: parsed correctly.

#### Snapshot-Based Fork End-to-End (CE)

- [ ] **`CLI workspace fork (snapshot path) > full two-step fork workflow`**: (1) `codeplane workspace snapshot <id> --name snap --repo owner/repo --json` returns 201 with snapshot ID. (2) `codeplane workspace create --name from-snap --snapshot <snap-id> --repo owner/repo --json` returns 201 with `is_fork: true` and `snapshot_id` set.
- [ ] **`CLI workspace fork (snapshot path) > snapshot of non-running workspace fails`**: Snapshot a suspended workspace. Verify: error.
- [ ] **`CLI workspace fork (snapshot path) > create from deleted snapshot fails`**: Delete snapshot, then create workspace from it. Verify: 404.
- [ ] **`CLI workspace fork (snapshot path) > multiple workspaces from same snapshot`**: Create 3 workspaces from same snapshot. All succeed with unique IDs.

#### Fork Lifecycle via CLI

- [ ] **`CLI workspace fork lifecycle > forked workspace can be deleted`**: Fork, then `codeplane workspace delete <fork-id>`. Verify: parent unaffected.
- [ ] **`CLI workspace fork lifecycle > parent can be deleted without affecting fork`**: Fork, then delete parent. Verify: fork still accessible via `codeplane workspace view`.
- [ ] **`CLI workspace fork lifecycle > fork can be SSHed into`**: Fork, wait for running, then `codeplane workspace ssh <fork-id>`. Verify: SSH connection info returned.
- [ ] **`CLI workspace fork lifecycle > fork can be viewed`**: `codeplane workspace view <fork-id> --json`. Verify: `is_fork: true`, `parent_workspace_id` set.
- [ ] **`CLI workspace fork lifecycle > fork appears in list with fork metadata`**: `codeplane workspace list --json`. Verify: fork entry has `is_fork: true`.

### API Integration Tests

- [ ] **`API workspace fork > POST fork returns 201 with valid WorkspaceResponse`**: Direct API call with valid auth, valid body. Verify full response shape.
- [ ] **`API workspace fork > POST fork with empty body returns 201 with default name`**: `POST {}`. Verify auto-generated name.
- [ ] **`API workspace fork > POST fork with no body returns 400`**: No Content-Type, no body. Verify 400.
- [ ] **`API workspace fork > POST fork with malformed JSON returns 400`**: Send `{invalid`. Verify 400 "invalid request body".
- [ ] **`API workspace fork > POST fork returns 501 in CE`**: Verify exact 501 message.
- [ ] **`API workspace fork > rate limiting returns 429 with Retry-After`**: Exceed limit. Verify 429 and header.
- [ ] **`API workspace fork > concurrent forks with different names both succeed`**: Two simultaneous requests. Both return 201.
- [ ] **`API workspace fork > concurrent forks with same name — one 409`**: Two simultaneous requests with same name. One 201, one 409.

### Cross-Cutting Tests

- [ ] **`Cross-cutting > CLI fork output matches API fork output`**: Fork via CLI `--json` and via direct API call. Verify: structurally identical response shapes.
- [ ] **`Cross-cutting > fork does not count as primary workspace`**: Fork, then create a new primary workspace. Verify: both exist.
- [ ] **`Cross-cutting > fork preserves repository association`**: Verify `repository_id` matches between fork and parent.
- [ ] **`Cross-cutting > fork does not copy workspace sessions`**: Fork a workspace with active sessions. Verify: fork has zero sessions.
- [ ] **`Cross-cutting > concurrent forks do not corrupt parent`**: Fork same workspace 5 times in parallel via CLI. Verify: parent workspace unchanged after all complete.
- [ ] **`Cross-cutting > fork cleanup on provisioning failure`**: If provisioning fails, verify workspace record status is `failed` and no orphaned VM.
