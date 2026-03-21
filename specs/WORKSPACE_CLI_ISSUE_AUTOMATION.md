# WORKSPACE_CLI_ISSUE_AUTOMATION

Specification for WORKSPACE_CLI_ISSUE_AUTOMATION.

## High-Level User POV

When a developer encounters an issue in their Codeplane repository, they should be able to resolve it with a single command. `codeplane workspace issue <number>` transforms an issue into a complete development cycle — from provisioning a cloud workspace, to running an AI coding agent against the issue, to opening a landing request with the resulting changes — without the developer needing to manually set up environments, write prompts, or create review artifacts.

The experience is designed for teams that want to turn issue triage into automated resolution. A developer reads an issue, decides it's suitable for agent-assisted work, and runs the command. Codeplane takes over: it fetches the issue context, spins up an isolated workspace tied to the repository, ensures the AI agent has proper credentials, feeds the issue title, labels, and body as a structured prompt, and waits for the agent to finish. If the agent produces committed changes, Codeplane automatically opens a landing request that references the original issue, ready for human review.

The developer sees real-time progress throughout the process. Workspace provisioning status, SSH readiness polling, agent output, and final results are all streamed to the terminal. If something goes wrong — the workspace doesn't come up, credentials are missing, or the agent fails — the developer gets clear error messages with actionable remediation steps. If the agent completes but produces no changes, the developer is told so explicitly rather than being left wondering. If the agent produces changes but the landing request cannot be created, the developer still gets the change IDs so they can follow up manually.

This command is the centerpiece of Codeplane's agent-augmented development workflow. It embodies the product principle that moving from issue to change to landing request should feel like one continuous action rather than a chain of disconnected tool invocations.

## Acceptance Criteria

### Definition of Done

- [ ] Running `codeplane workspace issue <number>` with a valid issue number in a repository context completes the full six-step automation pipeline: fetch issue → create workspace → wait for SSH → seed auth → run Claude Code → create landing request
- [ ] The command returns structured JSON output describing the workspace ID, issue number, status, and (if applicable) landing request number and change IDs
- [ ] All six steps produce user-visible progress output streamed to stderr
- [ ] The command is documented in CLI help text, the user guide, and the command reference

### Functional Constraints

- [ ] The `number` argument must be a positive safe integer; non-numeric, zero, negative, or floating-point values must produce a clear `"invalid issue number"` error
- [ ] The `--target` option defaults to `"main"` when omitted
- [ ] The `--repo` option is auto-detected from the current working directory's repository context when omitted
- [ ] If `--repo` is provided, it must be in `OWNER/REPO` format
- [ ] The workspace is named `issue-{number}` (e.g., `issue-42`)
- [ ] If an active workspace named `issue-{number}` already exists for this repository, the command reuses it rather than creating a duplicate
- [ ] The command must wait for SSH readiness with a configurable polling interval (default 3 seconds) and timeout (default 120 seconds)
- [ ] Claude Code auth must be resolved from the local environment before being seeded into the workspace; if no auth source is available, the command must fail with a remediation message directing the user to `codeplane auth claude login`
- [ ] The prompt sent to Claude Code must include the issue number, title, labels (if any), and body
- [ ] The prompt must instruct the agent to commit changes with jj and explicitly tell it not to create a landing request
- [ ] Claude Code execution has a configurable timeout (default 30 minutes)
- [ ] After Claude Code completes, the command must detect committed changes using jj revset relative to the target bookmark
- [ ] Empty commits (no file changes) must be excluded from the change list
- [ ] If changes are detected, a landing request must be created with title `"fix: {issue title} (#{number})"` and body `"Closes #{number}\n\n{issue body}"`
- [ ] If no changes are detected, the command must return successfully with an explanatory message
- [ ] If changes are detected but landing request creation fails, the command must return successfully with the change IDs and an error detail message (graceful degradation)
- [ ] All credentials seeded into the workspace must have file permissions set to `600` and be owned by the `developer` user

### Edge Cases

- [ ] Issue number `0` → `"invalid issue number"` error
- [ ] Issue number `-1` → `"invalid issue number"` error
- [ ] Issue number `1.5` (parsed as `1` via `parseInt`) → accepted (JavaScript parseInt truncation behavior)
- [ ] Issue number `99999999999999999` (exceeds safe integer) → `"invalid issue number"` error
- [ ] Issue number `abc` → `"invalid issue number"` error (parseInt returns NaN)
- [ ] Non-existent issue number (e.g., `999999` in a repo with 3 issues) → API 404 error propagated
- [ ] Closed issue → the command proceeds (no state gate on the issue)
- [ ] Issue with no body → prompt is constructed with empty body section; command proceeds
- [ ] Issue with no labels → prompt omits the labels line; command proceeds
- [ ] Issue body exceeding 100KB → prompt is constructed with full body; Claude Code may truncate internally
- [ ] Workspace SSH never becomes ready within timeout → clear timeout error with workspace ID
- [ ] SSH becomes ready but connection is immediately dropped → SSH transport error propagated
- [ ] Claude Code exits with non-zero code → error propagated with diagnostic log output
- [ ] Claude Code produces output but no jj commits → "no non-empty changes" message returned
- [ ] Claude Code produces commits but all are empty → "no non-empty changes" message returned
- [ ] Target bookmark does not exist in the repository → jj revset error propagated during change detection
- [ ] Network interruption during Claude Code execution → SSH transport error; partial work may remain in workspace
- [ ] Multiple concurrent `workspace issue` invocations for the same issue → second invocation reuses the existing workspace
- [ ] Repository permissions insufficient (read-only user) → API errors at workspace creation or landing request creation steps

### Boundary Constraints

- [ ] Issue number: must be a positive JavaScript safe integer (1 to 2^53 - 1)
- [ ] Target bookmark: any valid jj bookmark name (alphanumeric, hyphens, slashes, dots; no spaces or special shell characters)
- [ ] Repo format: `OWNER/REPO` where both segments are non-empty strings matching Codeplane's username/reponame validation
- [ ] Workspace name: `issue-{number}` — constrained by workspace naming rules (alphanumeric and hyphens, max 63 characters)
- [ ] Landing request title: max length inherited from landing request creation API constraints
- [ ] Landing request body: max length inherited from landing request creation API constraints
- [ ] SSH poll interval: configurable via `CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS` (minimum 1000ms recommended)
- [ ] SSH poll timeout: configurable via `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS`
- [ ] Claude timeout: configurable via `CODEPLANE_WORKSPACE_CLAUDE_TIMEOUT_MS`
- [ ] SSH connect timeout: configurable via `CODEPLANE_WORKSPACE_SSH_CONNECT_TIMEOUT_SECONDS` (default 15s)

## Design

### CLI Command

**Syntax:**
```
codeplane workspace issue <number> [--target <bookmark>] [--repo <OWNER/REPO>]
```

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `number` | string (parsed as integer) | Yes | The issue number to work on |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--target` | string | `"main"` | Target bookmark for the landing request |
| `--repo` | string | auto-detected | Repository in OWNER/REPO format |

**Output (JSON):**

Success with landing request:
```json
{
  "workspace_id": "uuid-string",
  "landing_request": 7,
  "change_ids": ["abc123", "def456"],
  "issue": 42,
  "status": "completed"
}
```

Success without changes:
```json
{
  "workspace_id": "uuid-string",
  "issue": 42,
  "status": "completed",
  "message": "Claude Code session ended. No non-empty changes were detected relative to main, so no landing request was created."
}
```

Partial success (changes but landing request failed):
```json
{
  "workspace_id": "uuid-string",
  "change_ids": ["abc123"],
  "issue": 42,
  "status": "completed",
  "message": "Claude Code session ended, but the landing request could not be created: 422 Unprocessable Entity"
}
```

**Progress Output (stderr):**

The command streams human-readable progress messages to stderr throughout execution, including step indicators for fetching the issue, creating the workspace, waiting for SSH readiness, seeding credentials, running Claude Code (with streamed agent output), detecting changes, and creating the landing request.

**Error Output:**

Errors produce non-zero exit codes and structured error messages to stderr:
- `"invalid issue number"` (exit 1)
- `"workspace {id} did not return an SSH command"` (exit 1)
- `"Claude Code auth is not configured. Run \`codeplane auth claude login\`, or set ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY locally and rerun \`codeplane workspace issue\`."` (exit 1)
- `"workspace {id} did not become SSH-ready within 120s"` (exit 1)

### Automation Pipeline Design

The six-step pipeline is the core user-facing design:

**Step 1 — Fetch Issue:** The command retrieves the issue from the Codeplane API. The user sees the issue title confirmed in the terminal. If the issue does not exist, the user sees an API error immediately.

**Step 2 — Create Workspace:** A workspace named `issue-{number}` is created (or an existing one reused). The user sees the workspace ID and status.

**Step 3 — Wait for SSH:** The command polls until the workspace's SSH endpoint is ready. The user sees a waiting indicator. If it times out, the user gets a clear timeout message.

**Step 4 — Seed Auth:** Claude Code credentials are resolved from the local environment (in priority order: `ANTHROPIC_AUTH_TOKEN` env var, OS keyring subscription token, `ANTHROPIC_API_KEY` env var, macOS Keychain OAuth token) and provisioned into the workspace. The user sees confirmation that auth was seeded. If no credentials are found, the user gets a remediation message.

**Step 5 — Run Claude Code:** The agent executes inside the workspace with the issue as its prompt. The user sees Claude Code's output streamed in real time. The session has a 30-minute default timeout.

**Step 6 — Create Landing Request:** If the agent committed changes, a landing request is created automatically. The user sees the landing request number and can navigate to it in the web UI. If no changes were produced, the user is informed. If landing request creation fails, the user gets the change IDs for manual follow-up.

### Claude Code Prompt Format

The prompt constructed from the issue follows this template:

```
Fix issue #<number>: <title>
Labels: <label1>, <label2>

<body>

When done, commit your changes with jj. Do not create a landing request — that will be handled automatically after you exit.
```

- The "Labels:" line is omitted when the issue has no labels
- The body is included verbatim (may be empty)

### Landing Request Format

The auto-created landing request uses:
- **Title:** `fix: <issue title> (#<issue number>)`
- **Body:** `Closes #<issue number>\n\n<issue body>`
- **Target bookmark:** value of `--target` option (default: `main`)
- **Change IDs:** all non-empty change IDs detected relative to the target bookmark, in chronological order (oldest first)

### Environment Variable Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS` | `3000` | Milliseconds between SSH readiness polls |
| `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS` | `120000` | Maximum milliseconds to wait for SSH readiness |
| `CODEPLANE_WORKSPACE_SSH_CONNECT_TIMEOUT_SECONDS` | `15` | SSH connection timeout in seconds |
| `CODEPLANE_WORKSPACE_CLAUDE_TIMEOUT_MS` | `1800000` | Maximum milliseconds for Claude Code session |
| `CODEPLANE_WORKSPACE_KNOWN_HOSTS_FILE` | `~/.codeplane/ssh/known_hosts` | Path to SSH known hosts file |

### Related CLI Commands

- `codeplane auth claude login` — Configure Claude Code credentials (prerequisite if env vars not set)
- `codeplane auth claude status` — Check active Claude Code auth source
- `codeplane workspace list` — View workspaces including those created by issue automation
- `codeplane workspace view <id>` — Inspect a workspace created by this command
- `codeplane workspace delete <id>` — Clean up a workspace after issue resolution
- `codeplane workspace ssh <id>` — Manually SSH into a workspace for debugging
- `codeplane land view <number>` — View the auto-created landing request

### Documentation

The following documentation should be written:

1. **CLI Reference Entry** (`docs/cli/workspace-issue.md`): Full command reference including syntax, arguments, options, examples, environment variables, and error messages.

2. **Guide: Automating Issue Resolution** (`docs/guides/issue-automation.md`): A tutorial-style guide walking through the prerequisites (Claude auth setup), a first run, interpreting output, reviewing the auto-created landing request, and troubleshooting common failures.

3. **Guide: Claude Code Auth Setup** (`docs/guides/claude-auth.md`): How to configure Claude Code credentials for workspace automation, covering all four auth resolution sources and their priority order.

4. **CLI Help Text**: The `--help` output for `codeplane workspace issue` must include the command description, all arguments and options with defaults, and at least one example invocation.

## Permissions & Security

### Authorization Requirements

| Action | Required Role | Notes |
|--------|--------------|-------|
| Fetch issue | Read access to repository | Members, admins, owners; public repos allow anonymous |
| Create workspace | Write access to repository | Members with write, admins, owners |
| SSH into workspace | Workspace owner | Only the user who created the workspace |
| Create landing request | Write access to repository | Members with write, admins, owners |
| Full pipeline | Write access to repository | Effectively requires write since workspace creation and landing request creation both need it |

- **Anonymous users** cannot run this command (workspace creation requires authentication).
- **Read-only members** will fail at workspace creation (step 2) with a 403 error.
- **Organization team permissions** are evaluated at the repository level — team-to-repo write access is sufficient.

### Rate Limiting

| Endpoint | Rate Limit | Scope |
|----------|-----------|-------|
| Issue fetch | Standard API rate limit (per-user) | Per user per time window |
| Workspace creation | Workspace creation limit (e.g., 10 per hour per user) | Per user |
| SSH polling | Client-side polling interval (3s default) | Self-regulated |
| Landing request creation | Standard API rate limit | Per user per time window |

- SSH polling is self-throttled by the client's polling interval. The server should tolerate rapid polls gracefully (429 is a retryable status).
- Workspace creation should be rate-limited to prevent resource exhaustion from automated loops.

### Credential Security

- **Claude Code auth tokens** are seeded into the workspace as environment variables in a file with `600` permissions, owned by the `developer` user. They are never logged to stdout/stderr.
- **SSH access tokens** have a 5-minute TTL and are single-use. They are SHA-256 hashed in the database; the raw token is returned exactly once.
- **Workspace isolation** ensures that only the creating user can access the workspace. Other users — even repository admins — cannot SSH into another user's workspace.
- **Shell injection prevention**: All user-supplied values (issue title, body, labels) are shell-escaped before being interpolated into remote scripts.
- **No PII exposure**: Issue content (which may contain PII) is transmitted to the workspace over SSH. It is not logged by the CLI beyond the structured JSON output. The auto-created landing request body reproduces the issue body, which is already public within the repository.

### Data Privacy Constraints

- Claude Code runs inside the workspace sandbox. Any code or data it accesses is confined to the workspace container.
- Auth credentials are not persisted in the workspace beyond the session. Workspace deletion removes all seeded credentials.
- The diagnostic script (run on Claude Code failure) captures process lists, file permissions, and binary versions — not file contents or credentials.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkspaceIssueAutomationStarted` | Command begins execution | `repo_owner`, `repo_name`, `issue_number`, `target_bookmark`, `auth_source` (env/keyring/keychain), `timestamp` |
| `WorkspaceIssueAutomationIssueFetched` | Issue successfully retrieved | `repo_owner`, `repo_name`, `issue_number`, `issue_state`, `has_labels`, `has_body`, `body_length` |
| `WorkspaceIssueAutomationWorkspaceCreated` | Workspace created or reused | `repo_owner`, `repo_name`, `workspace_id`, `workspace_reused` (boolean), `issue_number` |
| `WorkspaceIssueAutomationSSHReady` | SSH readiness achieved | `workspace_id`, `poll_duration_ms`, `poll_attempts` |
| `WorkspaceIssueAutomationAuthSeeded` | Claude auth provisioned | `workspace_id`, `auth_source`, `auth_type` (subscription/api_key/oauth) |
| `WorkspaceIssueAutomationClaudeStarted` | Claude Code execution begins | `workspace_id`, `issue_number`, `prompt_length` |
| `WorkspaceIssueAutomationClaudeCompleted` | Claude Code execution finishes | `workspace_id`, `issue_number`, `duration_ms`, `exit_code`, `success` (boolean) |
| `WorkspaceIssueAutomationChangesDetected` | Change detection completed | `workspace_id`, `issue_number`, `change_count`, `target_bookmark` |
| `WorkspaceIssueAutomationLandingCreated` | Landing request created | `repo_owner`, `repo_name`, `issue_number`, `landing_number`, `change_count` |
| `WorkspaceIssueAutomationCompleted` | Full pipeline finished | `repo_owner`, `repo_name`, `issue_number`, `workspace_id`, `total_duration_ms`, `outcome` (landing_created/no_changes/landing_failed/error), `landing_number` (nullable) |
| `WorkspaceIssueAutomationFailed` | Pipeline failed at any step | `repo_owner`, `repo_name`, `issue_number`, `failed_step` (fetch_issue/create_workspace/ssh_ready/seed_auth/run_claude/create_landing), `error_message`, `duration_ms` |

### Funnel Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| **Automation start rate** | Number of `WorkspaceIssueAutomationStarted` events per day/week | Growth indicator |
| **Pipeline completion rate** | `Completed` / `Started` | > 80% |
| **Change production rate** | `ChangesDetected (count > 0)` / `ClaudeCompleted (success)` | > 60% |
| **Landing request creation rate** | `LandingCreated` / `ChangesDetected (count > 0)` | > 95% |
| **End-to-end success rate** | `LandingCreated` / `Started` | > 50% |
| **Median pipeline duration** | P50 of `total_duration_ms` from `Completed` events | < 10 minutes |
| **Auth failure rate** | `Failed (step=seed_auth)` / `Started` | < 5% |
| **SSH timeout rate** | `Failed (step=ssh_ready)` / `Started` | < 2% |

### Success Indicators

- Increasing adoption: growing unique users running the command per week
- Repeat usage: users who run the command more than once per week
- Landing request merge rate: auto-created landing requests that are eventually merged
- Time-to-review: median time from auto-created landing request to first human review comment

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Pipeline start | `info` | `issue_number`, `repo`, `target`, `auth_source` | Logged when the command begins |
| Issue fetched | `info` | `issue_number`, `issue_state`, `has_body` | Confirms issue retrieval |
| Issue fetch failed | `error` | `issue_number`, `repo`, `http_status`, `error` | Issue API call failed |
| Workspace created | `info` | `workspace_id`, `workspace_name`, `reused` | Workspace provisioned or reused |
| Workspace creation failed | `error` | `repo`, `workspace_name`, `http_status`, `error` | Workspace API call failed |
| SSH poll attempt | `debug` | `workspace_id`, `attempt`, `elapsed_ms` | Each polling iteration |
| SSH ready | `info` | `workspace_id`, `poll_duration_ms`, `poll_attempts` | SSH became available |
| SSH timeout | `error` | `workspace_id`, `timeout_ms`, `attempts` | SSH never became ready |
| Auth seeding started | `info` | `workspace_id`, `auth_source` | Credential provisioning begins |
| Auth seeding failed | `error` | `workspace_id`, `error` | Credential provisioning failed |
| Auth not configured | `warn` | `checked_sources` | No auth source found |
| Claude started | `info` | `workspace_id`, `prompt_length` | Claude Code execution begins |
| Claude output line | `debug` | `workspace_id`, `line` | Real-time agent output |
| Claude completed | `info` | `workspace_id`, `duration_ms`, `exit_code` | Claude Code finished |
| Claude failed | `error` | `workspace_id`, `exit_code`, `diagnostic_summary` | Claude Code errored |
| Claude timed out | `error` | `workspace_id`, `timeout_ms` | Claude Code exceeded timeout |
| Changes detected | `info` | `workspace_id`, `change_count`, `change_ids` | jj change detection result |
| No changes | `info` | `workspace_id`, `target` | No non-empty changes found |
| Change detection failed | `error` | `workspace_id`, `error` | jj revset query failed |
| Landing created | `info` | `repo`, `landing_number`, `issue_number`, `change_count` | Landing request successfully created |
| Landing creation failed | `error` | `repo`, `issue_number`, `http_status`, `error` | Landing request API call failed |
| Pipeline completed | `info` | `issue_number`, `workspace_id`, `outcome`, `total_duration_ms` | Full pipeline finished |

### Prometheus Metrics

**Counters:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workspace_issue_automation_total` | `outcome` (completed/failed) | Total automation pipeline invocations |
| `codeplane_workspace_issue_automation_step_total` | `step`, `result` (success/failure) | Per-step completion counts |
| `codeplane_workspace_issue_automation_landing_created_total` | `repo` | Total landing requests auto-created |
| `codeplane_workspace_issue_automation_no_changes_total` | `repo` | Times Claude produced no changes |
| `codeplane_workspace_issue_automation_auth_failure_total` | `reason` (not_configured/seed_failed) | Auth-related failures |

**Histograms:**

| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `codeplane_workspace_issue_automation_duration_seconds` | `outcome` | 30, 60, 120, 300, 600, 900, 1200, 1800 | Total pipeline duration |
| `codeplane_workspace_issue_automation_ssh_poll_duration_seconds` | — | 3, 6, 15, 30, 60, 120 | Time to SSH readiness |
| `codeplane_workspace_issue_automation_claude_duration_seconds` | `exit_code` | 30, 60, 120, 300, 600, 900, 1200, 1800 | Claude Code execution time |

**Gauges:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workspace_issue_automation_active` | — | Currently running automation pipelines |

### Alerts

#### Alert: `WorkspaceIssueAutomationHighFailureRate`
- **Condition:** `rate(codeplane_workspace_issue_automation_total{outcome="failed"}[15m]) / rate(codeplane_workspace_issue_automation_total[15m]) > 0.3`
- **Severity:** Warning
- **Summary:** More than 30% of workspace issue automations are failing over a 15-minute window.

**Runbook:**
1. Check `codeplane_workspace_issue_automation_step_total` to identify which step is failing most frequently.
2. If `step=ssh_ready`: Check workspace container orchestration health. Verify sandbox runtime is available. Check `codeplane_workspace_issue_automation_ssh_poll_duration_seconds` for timeout patterns. Inspect container scheduler logs for provisioning failures.
3. If `step=seed_auth`: Check if credential resolution paths are working. Verify keyring/keychain accessibility. Check for expired or revoked tokens.
4. If `step=run_claude`: Check Claude Code availability. Verify npm registry accessibility from workspaces. Check for Claude API outages. Review Claude diagnostic logs for common patterns.
5. If `step=create_landing`: Check landing request API health. Verify the user has write permissions. Check for repository-level landing request constraints.
6. Escalate to platform team if container orchestration is degraded.

#### Alert: `WorkspaceIssueAutomationSSHTimeoutSpike`
- **Condition:** `rate(codeplane_workspace_issue_automation_step_total{step="ssh_ready",result="failure"}[10m]) > 5`
- **Severity:** Critical
- **Summary:** Workspace SSH readiness failures are spiking — workspaces may not be provisioning correctly.

**Runbook:**
1. Check container runtime health (Docker/sandbox client availability).
2. Verify workspace provisioning pipeline is processing requests.
3. Check system resources (CPU, memory, disk) on workspace host nodes.
4. Check network connectivity between API server and workspace hosts.
5. Review workspace creation logs for error patterns.
6. If container runtime is down, restart the sandbox service.
7. If resource exhaustion, scale workspace host capacity or enable workspace cleanup for idle workspaces.

#### Alert: `WorkspaceIssueAutomationClaudeTimeoutRate`
- **Condition:** `rate(codeplane_workspace_issue_automation_step_total{step="run_claude",result="failure"}[30m]) / rate(codeplane_workspace_issue_automation_step_total{step="run_claude"}[30m]) > 0.5`
- **Severity:** Warning
- **Summary:** More than 50% of Claude Code sessions are failing or timing out.

**Runbook:**
1. Check if the Claude API is experiencing an outage (check status.anthropic.com).
2. Verify npm registry is accessible from workspace containers (Claude Code installation may be failing).
3. Check workspace diagnostic logs for common error patterns (missing binaries, permission errors).
4. Verify Claude Code package version compatibility.
5. Check if issue bodies are unusually large or malformed, causing prompt construction issues.
6. If API outage: wait for resolution, no user action needed.
7. If installation failures: verify workspace base image has required dependencies.

#### Alert: `WorkspaceIssueAutomationLongDuration`
- **Condition:** `histogram_quantile(0.95, codeplane_workspace_issue_automation_duration_seconds) > 1500`
- **Severity:** Warning
- **Summary:** P95 automation pipeline duration exceeds 25 minutes — approaching the 30-minute Claude timeout.

**Runbook:**
1. Check `codeplane_workspace_issue_automation_ssh_poll_duration_seconds` — if SSH polling is slow, investigate workspace provisioning latency.
2. Check `codeplane_workspace_issue_automation_claude_duration_seconds` — if Claude is consistently running long, consider whether issue complexity is appropriate for automation.
3. Review whether the 30-minute Claude timeout should be increased for the workload pattern.
4. Check if workspace bootstrap (jj/node installation) is taking longer than expected due to network issues.

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Recovery |
|-------------|-----------|--------|----------|
| Issue not found (404) | API response | Pipeline aborts at step 1 | User corrects issue number |
| Repository not found | API response | Pipeline aborts at step 1 | User corrects `--repo` |
| Workspace creation quota exceeded | API 429 | Pipeline aborts at step 2 | User waits or deletes existing workspaces |
| Sandbox runtime unavailable | Workspace never becomes SSH-ready | Pipeline times out at step 3 | Ops restores sandbox runtime |
| SSH key negotiation failure | SSH transport error | Pipeline fails at step 3-6 | Check SSH known hosts, key exchange |
| Claude auth not configured | Pre-check at step 4 | Pipeline aborts with remediation message | User runs `codeplane auth claude login` |
| Auth token expired | Claude API rejection | Claude fails at step 5 | User refreshes auth token |
| npm registry unreachable | Claude Code installation failure | Claude fails at step 5 | Check network from workspace |
| Claude Code crashes | Non-zero exit code | Pipeline captures diagnostics, aborts at step 5 | Review diagnostic output |
| Claude timeout (30 min) | Process killed | Pipeline continues to step 6 (may find partial changes) | Consider increasing timeout or simplifying issue |
| jj not installed in workspace | Change detection fails | Pipeline fails at step 6 | Check workspace bootstrap script |
| Target bookmark missing | jj revset error | Pipeline fails at step 6 | User specifies valid `--target` |
| Landing request validation error (422) | API response | Pipeline returns partial success with change IDs | User creates landing request manually |
| Network partition mid-execution | SSH disconnection | Pipeline fails at current step | User re-runs command (workspace is reused) |

## Verification

### API Integration Tests

- **Test:** Fetch an existing open issue via API and verify the response includes `number`, `title`, `body`, `state`, and `labels`
- **Test:** Fetch a non-existent issue (number 999999) and verify a 404 response
- **Test:** Fetch a closed issue and verify the response succeeds (no state gate)
- **Test:** Create a workspace via API with name `issue-1` and verify it returns `id` and `status`
- **Test:** Create a workspace with a duplicate name and verify idempotent behavior (reuses existing)
- **Test:** Create a landing request via API with `change_ids`, `target_bookmark`, `title`, and `body` and verify it returns a landing number
- **Test:** Create a landing request with an empty `change_ids` array and verify a validation error
- **Test:** Create a landing request with a non-existent `target_bookmark` and verify appropriate error

### CLI Argument Validation Tests

- **Test:** Run `codeplane workspace issue` with no arguments and verify it shows a usage error
- **Test:** Run `codeplane workspace issue 42` with a valid issue number and verify it begins execution (may fail at API call in test environment)
- **Test:** Run `codeplane workspace issue 0` and verify `"invalid issue number"` error
- **Test:** Run `codeplane workspace issue -1` and verify `"invalid issue number"` error
- **Test:** Run `codeplane workspace issue abc` and verify `"invalid issue number"` error
- **Test:** Run `codeplane workspace issue 9007199254740992` (Number.MAX_SAFE_INTEGER + 1) and verify `"invalid issue number"` error
- **Test:** Run `codeplane workspace issue 1 --target develop` and verify `--target` is accepted
- **Test:** Run `codeplane workspace issue 1 --repo owner/repo` and verify `--repo` is accepted
- **Test:** Run `codeplane workspace issue 1 --target ""` and verify behavior (empty target)

### End-to-End CLI Tests (require VM/container runtime)

These tests should be gated behind `CODEPLANE_E2E_FREESTYLE=true` (or equivalent workspace E2E flag):

- **Test:** Full happy path — create a test issue with a known body, run `codeplane workspace issue <number>`, verify:
  - Workspace is created with name `issue-{number}`
  - SSH readiness is achieved
  - Claude Code auth is seeded (verify file exists with correct permissions)
  - Claude Code runs and exits cleanly
  - If changes produced: landing request is created with correct title format `fix: {title} (#{number})`, body contains `Closes #{number}`, and `change_ids` are non-empty
  - JSON output contains `workspace_id`, `issue`, `status: "completed"`

- **Test:** Issue with no body — create an issue with an empty body, run automation, verify the prompt is constructed without error and Claude Code receives a valid (if short) prompt

- **Test:** Issue with labels — create an issue with two labels, run automation, verify the prompt includes `Labels: label1, label2`

- **Test:** Issue with very long body (50KB) — create an issue with a large body, run automation, verify the command does not crash or truncate unexpectedly

- **Test:** Issue with maximum valid issue number — use the largest issue number in the test repo, verify it works

- **Test:** Workspace reuse — run `codeplane workspace issue <number>` twice for the same issue, verify the second run reuses the existing workspace (same workspace ID)

- **Test:** No changes produced — create an issue that Claude Code is unlikely to produce changes for (e.g., "Document the meaning of life"), verify the output contains the "no non-empty changes" message and no landing request is created

- **Test:** Custom target bookmark — create a bookmark `test-target`, run `codeplane workspace issue <number> --target test-target`, verify the landing request targets `test-target`

- **Test:** Invalid target bookmark — run `codeplane workspace issue <number> --target nonexistent-bookmark`, verify an error is returned at the change detection step

- **Test:** Auth not configured — unset all Claude auth environment variables and clear keyring, run the command, verify the remediation error message appears

- **Test:** SSH timeout — configure `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS=1` (1ms), run the command, verify it times out with a clear error message

- **Test:** Claude timeout — configure `CODEPLANE_WORKSPACE_CLAUDE_TIMEOUT_MS=1000` (1 second), run the command against a complex issue, verify Claude times out and the command continues to check for changes

- **Test:** Concurrent automation — run `codeplane workspace issue <number>` for two different issues simultaneously, verify both complete independently without interference

- **Test:** Verify workspace cleanup — after automation completes, verify the workspace still exists (cleanup is a separate manual step), and that `codeplane workspace delete <id>` works

### CLI Output Format Tests

- **Test:** Run with `--json` flag (if supported) and verify output is valid JSON matching the expected schema
- **Test:** Verify stderr progress output includes step indicators for all six steps
- **Test:** Verify that Claude Code output is streamed to stderr (not stdout) during execution
- **Test:** Verify that the final JSON result is written to stdout (not stderr)

### Security Tests

- **Test:** Run as a user with read-only access to the repository and verify failure at workspace creation with appropriate 403 error
- **Test:** Verify that the auth file seeded in the workspace has `600` permissions (via SSH inspection after seeding)
- **Test:** Verify that auth tokens do not appear in stdout JSON output
- **Test:** Verify that issue body with shell metacharacters (e.g., `$(whoami)`, `` `id` ``, `; rm -rf /`) does not cause shell injection in the remote script
- **Test:** Verify that issue title with special characters (quotes, newlines, unicode) is correctly shell-escaped in the prompt and landing request title

### Diagnostic/Error Handling Tests

- **Test:** Simulate Claude Code installation failure (e.g., block npm registry), verify diagnostic output includes process list, binary availability, and installation logs
- **Test:** Verify that when landing request creation fails, the output includes `change_ids` so the user can follow up manually
- **Test:** Verify that when the workspace API returns a 5xx error, the command retries or fails gracefully with a clear message
