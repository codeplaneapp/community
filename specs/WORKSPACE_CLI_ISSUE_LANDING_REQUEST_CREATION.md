# WORKSPACE_CLI_ISSUE_LANDING_REQUEST_CREATION

Specification for WORKSPACE_CLI_ISSUE_LANDING_REQUEST_CREATION.

## High-Level User POV

When a developer picks up an issue to work on, the traditional workflow involves multiple manual steps: creating a branch, setting up a development environment, writing code, committing changes, and opening a review request. The `codeplane workspace issue` command collapses this entire process into a single command.

A developer runs `codeplane workspace issue 42` and Codeplane takes over. It reads the issue details, spins up a cloud workspace pre-configured with the repository, waits until the workspace is reachable over SSH, provisions AI coding credentials, and then launches Claude Code inside the workspace with a prompt derived from the issue title, labels, and description. The developer watches Claude Code work in their terminal, and when Claude finishes—or the developer manually exits—Codeplane inspects the workspace for any committed jj changes. If changes exist, Codeplane automatically creates a landing request that references the original issue, links the committed change IDs as a stack, and presents the developer with the landing request number.

The result is that a developer can go from "I see an issue" to "there is a landing request ready for review" with a single command. The workspace handles environment provisioning, the AI agent handles initial implementation, and Codeplane handles the review artifact creation—all without the developer needing to manually manage any of these steps. If Claude Code produces no changes (the issue might be non-actionable, or the agent might fail), the flow exits gracefully without creating an empty landing request.

This workflow is designed for agent-augmented software teams who want to use AI assistance as a first pass on issue resolution while retaining human review through the landing request process. It is equally useful for solo developers who want to quickly prototype a fix in an isolated environment without polluting their local machine state.

## Acceptance Criteria

### Definition of Done

- [ ] A user can run `codeplane workspace issue <number>` and have the complete flow execute end-to-end: issue fetch → workspace creation → SSH readiness → Claude auth provisioning → Claude Code execution → change collection → landing request creation.
- [ ] The resulting landing request correctly references the source issue with a `Closes #N` body and properly formatted title.
- [ ] If Claude Code produces no changes, the flow exits successfully without creating a landing request.
- [ ] If any step fails, the user receives a clear, actionable error message.

### Input Validation

- [ ] `<number>` must be a positive integer; non-numeric, zero, and negative values must produce a clear error.
- [ ] `--target` must be a valid bookmark name string; if omitted, it defaults to `"main"`.
- [ ] `--repo` must be in `OWNER/REPO` format if provided; if omitted, the CLI resolves from the current repository context.
- [ ] If the issue number does not exist in the target repository, the CLI must display a "not found" error from the API.

### Workspace Lifecycle

- [ ] The workspace is named `issue-{issueNumber}` (e.g., `issue-42`).
- [ ] If an active workspace named `issue-{issueNumber}` already exists for the same user and repository, it must be reused rather than creating a duplicate.
- [ ] The CLI must poll for SSH readiness with a configurable interval (default 3 seconds) and timeout (default 120 seconds).
- [ ] If SSH readiness is not achieved within the timeout, the CLI must exit with a timeout error and not proceed to subsequent steps.
- [ ] Retryable HTTP statuses during SSH polling (404, 409, 423, 425, 429, 502, 503, 504) must be retried silently; non-retryable errors must fail immediately.

### Claude Auth Provisioning

- [ ] The CLI must attempt to resolve Claude authentication from local environment variables, stored tokens, or the macOS keychain, in priority order.
- [ ] If Claude auth is resolved, it must be securely seeded into the workspace at `/home/developer/.codeplane/claude-env.sh` with file permissions `600`.
- [ ] If no Claude auth source is available, the CLI must exit with an error containing remediation steps.

### Claude Code Execution

- [ ] The prompt must include the issue number, title, body, and labels (if any).
- [ ] The prompt must explicitly instruct Claude Code not to create a landing request.
- [ ] Claude Code must be invoked with `--dangerously-skip-permissions`, `--no-session-persistence`, and `--output-format json`.
- [ ] Claude Code execution must time out after a configurable duration (default 30 minutes / 1,800 seconds).
- [ ] On Claude Code failure, diagnostic information must be collected and displayed.
- [ ] The CLI must bootstrap jj, Node.js 22, and the Claude Code CLI in the workspace if they are not already installed.

### Change Collection

- [ ] Change IDs must be collected using the jj revset `(::@ ~ ::present(bookmarks(exact:"{target}"))) ~ empty()`.
- [ ] Empty changes must be excluded from the collected set.
- [ ] Change IDs must be returned in oldest-first order.
- [ ] If zero change IDs are collected, the CLI must report success and skip landing request creation.

### Landing Request Creation

- [ ] The landing request title must follow the format `fix: {issue.title} (#{issueNumber})`.
- [ ] The landing request body must follow the format `Closes #{issueNumber}\n\n{issue.body}`.
- [ ] The landing request must target the bookmark specified by `--target` (default `"main"`).
- [ ] All collected change IDs must be included in the landing request, preserving stack order.
- [ ] The landing request must be created in `"open"` state (not draft).
- [ ] On successful creation, the CLI must display the landing request number, workspace ID, and change IDs.

### Edge Cases

- [ ] If the issue is in a closed state, the flow must still proceed.
- [ ] If the repository does not exist or the user lacks read access, the issue fetch must fail with a clear error.
- [ ] If the user lacks write access, landing request creation must fail with a 403 error.
- [ ] If a landing request with the same change IDs already exists, the API must return a 409 conflict.
- [ ] If the workspace container fails to start, the SSH polling must eventually time out with a descriptive error.
- [ ] If the SSH connection drops during Claude Code execution, the CLI must surface the SSH failure.
- [ ] If the issue body is empty, the prompt and landing request body must still be well-formed.
- [ ] If the issue title contains special characters, they must be safely escaped in the prompt and landing request title.

### Boundary Constraints

- [ ] Landing request title: minimum 1 character after trim; no enforced maximum in application layer.
- [ ] Landing request body: optional; no enforced maximum in application layer.
- [ ] Change IDs array: minimum 1 entry; each entry must be non-empty after trim.
- [ ] Issue number: must be a positive integer.
- [ ] Target bookmark: must be a non-empty string after trim.
- [ ] SSH poll interval: minimum 1 second; configurable via `CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS`.
- [ ] SSH poll timeout: minimum 1 second; configurable via `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS`.
- [ ] Claude execution timeout: minimum 1 second; configurable via `CODEPLANE_WORKSPACE_CLAUDE_TIMEOUT_MS`.

## Design

### CLI Command

**Synopsis:**

```
codeplane workspace issue <number> [--target <bookmark>] [--repo <OWNER/REPO>]
```

**Arguments:**

| Argument | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `<number>` | integer | Yes | — | The issue number to work on |

**Options:**

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `--target` | string | No | `"main"` | The target bookmark for the landing request |
| `--repo`, `-R` | string | No | Auto-detected | Repository in `OWNER/REPO` format |

**Environment Variable Overrides:**

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS` | `3000` | Milliseconds between SSH readiness polls |
| `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS` | `120000` | Maximum milliseconds to wait for SSH readiness |
| `CODEPLANE_WORKSPACE_CLAUDE_TIMEOUT_MS` | `1800000` | Maximum milliseconds for Claude Code execution |

**Output (success with changes):**

```
✓ Fetched issue #42: Fix login page redirect
✓ Workspace issue-42 ready (id: ws_abc123)
✓ SSH connection established
✓ Claude auth provisioned
⠋ Running Claude Code...
[Claude Code interactive output streams here]
✓ Claude Code completed
✓ Collected 3 change(s)
✓ Landing request #7 created
  Workspace: ws_abc123
  Changes: kpqvtsmo, rlvkpntz, zsxolqlp
```

**Output (success without changes):**

```
✓ Fetched issue #42: Fix login page redirect
✓ Workspace issue-42 ready (id: ws_abc123)
✓ SSH connection established
✓ Claude auth provisioned
⠋ Running Claude Code...
[Claude Code interactive output streams here]
✓ Claude Code completed
ℹ No changes produced — skipping landing request creation
```

**Output (failure — no Claude auth):**

```
✓ Fetched issue #42: Fix login page redirect
✓ Workspace issue-42 ready (id: ws_abc123)
✓ SSH connection established
✗ Claude auth not available

  To fix this, try one of the following:
  1. Run 'claude setup-token | codeplane auth claude login' and rerun
  2. Set ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY in your environment
  3. Sign in with Claude Code locally ('claude login')
```

### API Shape

**Step 1 — Fetch Issue:**

```
GET /api/repos/:owner/:repo/issues/:number
```

Response: Standard issue object with `number`, `title`, `body`, `state`, `labels`.

**Step 2 — Create Workspace:**

```
POST /api/repos/:owner/:repo/workspaces
Content-Type: application/json

{
  "name": "issue-42"
}
```

Response: Workspace object with `id`, `name`, `status`, `ssh_host`.

**Step 3 — Poll SSH Readiness:**

```
GET /api/repos/:owner/:repo/workspaces/:id/ssh
```

Response (when ready): SSH connection info with `host`, `port`, `username`, `access_token`, `command`.

**Step 4 — Create Landing Request:**

```
POST /api/repos/:owner/:repo/landings
Content-Type: application/json

{
  "title": "fix: Fix login page redirect (#42)",
  "body": "Closes #42\n\nThe login page currently redirects to /dashboard...",
  "target_bookmark": "main",
  "change_ids": ["kpqvtsmo", "rlvkpntz", "zsxolqlp"]
}
```

Response: Landing request object with `number`, `title`, `body`, `state`, `change_ids`, `target_bookmark`, `author`, `stack_size`.

### SDK Shape

The following SDK services are consumed by this flow:

- **IssueService.getIssue(owner, repo, number)** — Retrieves the issue.
- **WorkspaceService.createWorkspace(repoId, userId, options)** — Creates or reuses a workspace.
- **WorkspaceService.getSSHInfo(workspaceId)** — Returns SSH connection details.
- **LandingService.createLandingRequest(repoId, userId, payload)** — Creates the landing request with validation.

### Prompt Construction

The Claude Code prompt is constructed as follows:

```
Fix issue #<number>: <title>
Labels: <label1>, <label2>    ← only if labels exist

<issue body>

When done, commit your changes with jj. Do not create a landing request — that will be handled automatically after you exit.
```

The labels line is omitted entirely if the issue has no labels. The issue body is included verbatim.

### Remote Bootstrap Sequence

The workspace must have the following tools available before Claude Code can execute:

1. **jj** — Installed from GitHub releases if not present at `/home/developer/.local/bin/jj`.
2. **Node.js 22** — Installed from the official distribution if `node --version` does not report major version 22.
3. **Claude Code CLI** — Installed via `npm install -g @anthropic-ai/claude-code` if not already available.

Each bootstrap step is idempotent: if the tool is already present and at the correct version, it is skipped.

### Documentation

The following documentation must be provided for end users:

**CLI Reference — `workspace issue`:**
- Full command synopsis with all arguments and options.
- Description of the end-to-end flow with what happens at each step.
- Environment variable configuration table.
- Example invocations showing success and failure scenarios.
- Troubleshooting section covering: SSH timeout, Claude auth missing, workspace already exists, no changes produced.

**Guide — "Resolve Issues with AI-Assisted Workspaces":**
- Narrative walkthrough of the workspace issue workflow from the developer's perspective.
- Prerequisites: authenticated CLI session, Claude auth available, repository with write access.
- Step-by-step explanation with terminal output screenshots.
- Section on customizing the target bookmark for non-main-branch workflows.
- Section on what happens after the landing request is created (review, checks, landing).

## Permissions & Security

### Authorization Roles

| Step | Minimum Role | Notes |
|------|-------------|-------|
| Fetch issue | **Read** | Public repos allow anonymous; private repos require read access |
| Create workspace | **Write** | Must be authenticated; requires write access to the repository |
| Poll SSH info | **Write** | Same auth context as workspace creation |
| Create landing request | **Write** | Must have write or admin permission on the repository |
| Land (merge) a landing request | **Admin** | Not part of this flow, but noted for completeness |

### Authentication Requirements

- The user must be authenticated via session cookie or personal access token.
- Unauthenticated requests to any mutating endpoint must receive a 401 response.
- The CLI must check authentication status before beginning the flow and fail fast with a "please log in" message if not authenticated.

### Rate Limiting

- Workspace creation should be rate-limited to prevent abuse: **10 workspace creations per user per hour** per repository.
- Landing request creation should be rate-limited: **30 landing requests per user per hour** per repository.
- SSH polling is inherently self-limiting due to the poll interval, but the server should enforce standard API rate limits on the SSH info endpoint.
- Claude Code execution is externally rate-limited by the Anthropic API; no additional Codeplane rate limiting is needed on the execution step.

### Data Privacy and Security

- **Claude auth tokens** must never be logged, included in error messages, or stored in workspace logs. They are written to a file with `600` permissions and sourced only by the `developer` user in the workspace.
- **Issue content** (title, body, labels) is sent to Claude Code as a prompt. Users must be aware that issue content will be processed by the Claude API. This should be documented as a data flow disclosure.
- **SSH access tokens** for workspaces are single-use, scoped to the workspace session, and must not be persisted beyond the session lifetime.
- **Landing request bodies** may contain PII from issue descriptions. The same access controls that apply to issues apply to landing requests—no additional PII exposure is introduced.
- The remote bootstrap scripts must not execute untrusted code. All installations are from pinned, official sources (GitHub releases for jj, official Node.js distribution, npm for Claude Code).

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger Point | Properties |
|------------|--------------|------------|
| `WorkspaceIssueFlowStarted` | User invokes `workspace issue` | `issue_number`, `repo_owner`, `repo_name`, `target_bookmark`, `user_id` |
| `WorkspaceIssueIssueFetched` | Issue successfully retrieved | `issue_number`, `issue_state`, `label_count`, `body_length` |
| `WorkspaceIssueWorkspaceCreated` | Workspace created or reused | `workspace_id`, `workspace_name`, `was_reused: boolean`, `repo_id` |
| `WorkspaceIssueSSHReady` | SSH polling succeeds | `workspace_id`, `poll_duration_ms`, `poll_attempts` |
| `WorkspaceIssueSSHTimeout` | SSH polling times out | `workspace_id`, `timeout_ms`, `poll_attempts` |
| `WorkspaceIssueClaudeAuthProvisioned` | Claude auth seeded into workspace | `auth_source: "env_token" | "stored_token" | "api_key" | "keychain"` |
| `WorkspaceIssueClaudeAuthFailed` | No Claude auth source found | `attempted_sources: string[]` |
| `WorkspaceIssueClaudeStarted` | Claude Code execution begins | `workspace_id`, `prompt_length`, `timeout_ms` |
| `WorkspaceIssueClaudeCompleted` | Claude Code execution finishes | `workspace_id`, `duration_ms`, `exit_code`, `success: boolean` |
| `WorkspaceIssueClaudeTimedOut` | Claude Code execution exceeds timeout | `workspace_id`, `timeout_ms` |
| `WorkspaceIssueChangesCollected` | Change IDs extracted from workspace | `workspace_id`, `change_count`, `target_bookmark` |
| `WorkspaceIssueLandingCreated` | Landing request successfully created | `landing_number`, `change_count`, `issue_number`, `repo_id`, `workspace_id` |
| `WorkspaceIssueFlowCompleted` | Entire flow finishes | `issue_number`, `outcome: "landing_created" | "no_changes" | "error"`, `total_duration_ms` |
| `WorkspaceIssueFlowFailed` | Flow terminates due to error | `issue_number`, `failed_step`, `error_message`, `total_duration_ms` |

### Funnel Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| **Flow completion rate** | `FlowCompleted / FlowStarted` | > 70% |
| **Change production rate** | `ChangesCollected(change_count > 0) / ClaudeCompleted(success=true)` | > 50% |
| **Landing creation rate** | `LandingCreated / FlowStarted` | > 40% |
| **SSH readiness p95** | 95th percentile of `SSHReady.poll_duration_ms` | < 30 seconds |
| **Claude execution p95** | 95th percentile of `ClaudeCompleted.duration_ms` | < 15 minutes |
| **Auth failure rate** | `ClaudeAuthFailed / FlowStarted` | < 10% |
| **Mean time to landing** | Average `FlowCompleted.total_duration_ms` where outcome=landing_created | < 20 minutes |

### Success Indicators

- Increasing `WorkspaceIssueFlowStarted` events over time indicates adoption.
- High `Landing creation rate` indicates the AI agent is producing useful changes.
- Low `Auth failure rate` indicates good onboarding documentation.
- Decreasing `Mean time to landing` over time indicates infrastructure and agent improvements.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | Description |
|-----------|-------|-------------------|-------------|
| `workspace_issue.flow_start` | `INFO` | `issue_number`, `repo`, `target_bookmark`, `user_id` | Flow initiated |
| `workspace_issue.issue_fetched` | `INFO` | `issue_number`, `issue_state`, `title_length`, `body_length` | Issue retrieved |
| `workspace_issue.issue_fetch_failed` | `ERROR` | `issue_number`, `repo`, `status_code`, `error` | Issue retrieval failed |
| `workspace_issue.workspace_created` | `INFO` | `workspace_id`, `workspace_name`, `reused` | Workspace ready |
| `workspace_issue.workspace_create_failed` | `ERROR` | `workspace_name`, `repo`, `status_code`, `error` | Workspace creation failed |
| `workspace_issue.ssh_poll_attempt` | `DEBUG` | `workspace_id`, `attempt`, `status_code` | Each SSH poll attempt |
| `workspace_issue.ssh_ready` | `INFO` | `workspace_id`, `poll_duration_ms`, `attempts` | SSH became reachable |
| `workspace_issue.ssh_timeout` | `ERROR` | `workspace_id`, `timeout_ms`, `attempts` | SSH polling timed out |
| `workspace_issue.claude_auth_resolved` | `INFO` | `auth_source` | Auth source identified (never log the token) |
| `workspace_issue.claude_auth_failed` | `WARN` | `attempted_sources` | No auth source found |
| `workspace_issue.claude_bootstrap_start` | `INFO` | `workspace_id` | Remote tool installation starting |
| `workspace_issue.claude_execution_start` | `INFO` | `workspace_id`, `prompt_length` | Claude Code invoked |
| `workspace_issue.claude_execution_complete` | `INFO` | `workspace_id`, `duration_ms`, `exit_code` | Claude Code finished |
| `workspace_issue.claude_execution_timeout` | `ERROR` | `workspace_id`, `timeout_ms` | Claude Code timed out |
| `workspace_issue.claude_execution_failed` | `ERROR` | `workspace_id`, `exit_code`, `diagnostics_summary` | Claude Code errored |
| `workspace_issue.changes_collected` | `INFO` | `workspace_id`, `change_count`, `change_ids` | Changes extracted |
| `workspace_issue.no_changes` | `INFO` | `workspace_id`, `target_bookmark` | No changes found |
| `workspace_issue.landing_created` | `INFO` | `landing_number`, `change_count`, `issue_number` | Landing request created |
| `workspace_issue.landing_create_failed` | `ERROR` | `issue_number`, `status_code`, `error` | Landing creation failed |
| `workspace_issue.flow_complete` | `INFO` | `issue_number`, `outcome`, `total_duration_ms` | Flow finished |

**Logging rules:**
- Never log authentication tokens, API keys, or SSH access tokens at any level.
- All ERROR-level logs must include enough context to reproduce the failure.
- DEBUG-level SSH poll logs should be suppressible via log level configuration.

### Prometheus Metrics

**Counters:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workspace_issue_flow_total` | `outcome={landing_created, no_changes, error}` | Total flow executions by outcome |
| `codeplane_workspace_issue_step_failures_total` | `step={issue_fetch, workspace_create, ssh_poll, claude_auth, claude_exec, change_collect, landing_create}` | Failures by step |
| `codeplane_workspace_issue_claude_auth_resolved_total` | `source={env_token, stored_token, api_key, keychain}` | Auth resolution by source |
| `codeplane_workspace_issue_workspace_reuse_total` | `reused={true, false}` | Workspace creation vs reuse |

**Histograms:**

| Metric | Buckets | Description |
|--------|---------|-------------|
| `codeplane_workspace_issue_flow_duration_seconds` | `[30, 60, 120, 300, 600, 900, 1200, 1800, 2400]` | Total flow duration |
| `codeplane_workspace_issue_ssh_poll_duration_seconds` | `[3, 6, 10, 15, 30, 60, 90, 120]` | Time to SSH readiness |
| `codeplane_workspace_issue_claude_duration_seconds` | `[30, 60, 120, 300, 600, 900, 1200, 1800]` | Claude Code execution time |
| `codeplane_workspace_issue_changes_count` | `[0, 1, 2, 3, 5, 10, 20, 50]` | Number of changes produced |

**Gauges:**

| Metric | Description |
|--------|-------------|
| `codeplane_workspace_issue_flows_in_progress` | Currently running workspace issue flows |

### Alerts

**Alert 1: High Flow Failure Rate**
- **Name:** `WorkspaceIssueHighFailureRate`
- **Condition:** `rate(codeplane_workspace_issue_flow_total{outcome="error"}[15m]) / rate(codeplane_workspace_issue_flow_total[15m]) > 0.4`
- **For:** 10 minutes
- **Severity:** `warning`
- **Runbook:** Check `step_failures_total` to identify the failing step. If `ssh_poll`: check container runtime health. If `claude_auth`: check auth resolution paths. If `claude_exec`: check Anthropic API status and workspace resources. If `landing_create`: check server API health and database.

**Alert 2: SSH Readiness Latency Spike**
- **Name:** `WorkspaceIssueSSHLatencyHigh`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_workspace_issue_ssh_poll_duration_seconds_bucket[15m])) > 60`
- **For:** 10 minutes
- **Severity:** `warning`
- **Runbook:** Check container runtime health, base image pull times, host resource utilization, and SSH server startup logs in workspace containers.

**Alert 3: Claude Code Timeout Spike**
- **Name:** `WorkspaceIssueClaudeTimeoutSpike`
- **Condition:** `rate(codeplane_workspace_issue_step_failures_total{step="claude_exec"}[30m]) > 0.3 * rate(codeplane_workspace_issue_flow_total[30m])`
- **For:** 15 minutes
- **Severity:** `info`
- **Runbook:** Check Anthropic API status for rate limiting. Review issue complexity. Check workspace CPU/memory. Verify Claude Code CLI version. Consider increasing timeout.

**Alert 4: Landing Request Creation Failures**
- **Name:** `WorkspaceIssueLandingCreateFailures`
- **Condition:** `increase(codeplane_workspace_issue_step_failures_total{step="landing_create"}[15m]) > 5`
- **For:** 5 minutes
- **Severity:** `critical`
- **Runbook:** Check server API health. Review landing service logs for validation/database errors. If 409 conflicts dominate, investigate duplicate creation. If 403 errors, check permission policy changes. Verify database health.

**Alert 5: Zero Successful Flows**
- **Name:** `WorkspaceIssueNoSuccesses`
- **Condition:** `increase(codeplane_workspace_issue_flow_total{outcome=~"landing_created|no_changes"}[1h]) == 0 and increase(codeplane_workspace_issue_flow_total[1h]) > 5`
- **For:** 30 minutes
- **Severity:** `critical`
- **Runbook:** P1 incident. Identify dominant failure step. Check for recent deployments. Verify all dependent services. Run manual test. If Claude execution step, verify API keys and CLI version.

### Error Cases and Failure Modes

| Error Case | Symptom | Recovery |
|------------|---------|----------|
| Issue not found | 404 from issue API | User provides correct issue number |
| Repository not found | 404 from repo resolution | User provides correct `--repo` |
| Unauthenticated | 401 from any API call | User runs `codeplane auth login` |
| Permission denied | 403 from workspace/landing creation | User obtains write access |
| Workspace create failure | 500 from workspace API | Check container runtime; retry |
| SSH timeout | Poll exceeds 120s | Check container runtime; increase timeout |
| Claude auth missing | No auth sources found | User provisions Claude credentials |
| jj/Node/Claude install failure | Bootstrap script errors | Check workspace network connectivity |
| Claude Code timeout | Execution exceeds 30 min | Increase timeout; simplify issue scope |
| Claude Code crash | Non-zero exit code | Review diagnostics; check Claude API status |
| SSH drop during execution | Connection reset | Retry; check network stability |
| Landing request conflict | 409 from landing API | Existing landing request may already exist |
| Landing request validation | 400 from landing API | Check title/body constraints |
| Database unavailable | 500 from any API call | Check database connectivity |

## Verification

### API Integration Tests

- [ ] **Issue fetch — valid issue**: `GET /api/repos/:owner/:repo/issues/1` returns 200 with complete issue object.
- [ ] **Issue fetch — nonexistent issue**: `GET /api/repos/:owner/:repo/issues/99999` returns 404.
- [ ] **Issue fetch — private repo without access**: `GET /api/repos/:owner/:private-repo/issues/1` returns 404 or 403.
- [ ] **Workspace create — new workspace**: `POST /api/repos/:owner/:repo/workspaces` with `{"name": "issue-1"}` returns 201 with workspace object.
- [ ] **Workspace create — duplicate name reuses**: `POST /api/repos/:owner/:repo/workspaces` with the same name returns the existing workspace.
- [ ] **Workspace create — unauthenticated**: Returns 401.
- [ ] **Workspace create — read-only user**: Returns 403.
- [ ] **Workspace SSH info — workspace not ready**: Returns 404 or 425.
- [ ] **Workspace SSH info — workspace ready**: Returns 200 with `host`, `port`, `username`, `access_token`, `command`.
- [ ] **Landing request create — valid payload**: `POST /api/repos/:owner/:repo/landings` with title, body, target_bookmark, and change_ids returns 201.
- [ ] **Landing request create — missing title**: Returns 400 with `field="title"`, `code="missing_field"`.
- [ ] **Landing request create — empty title (whitespace only)**: Returns 400 with `field="title"`, `code="missing_field"`.
- [ ] **Landing request create — missing target_bookmark**: Returns 400 with `field="target_bookmark"`, `code="missing_field"`.
- [ ] **Landing request create — empty change_ids array**: Returns 400 with `field="change_ids"`, `code="missing_field"`.
- [ ] **Landing request create — change_ids with empty string entry**: Returns 400 with `field="change_ids"`, `code="invalid"`.
- [ ] **Landing request create — single change_id**: Returns 201 with `stack_size: 1`.
- [ ] **Landing request create — 50 change_ids**: Returns 201 with `stack_size: 50` (validates large stacks work).
- [ ] **Landing request create — unauthenticated**: Returns 401.
- [ ] **Landing request create — read-only user**: Returns 403.
- [ ] **Landing request create — duplicate change_ids conflict**: Returns 409.
- [ ] **Landing request create — very long title (10,000 characters)**: Verify behavior (either succeeds or returns a predictable error from database constraint).
- [ ] **Landing request create — very long body (100,000 characters)**: Verify behavior (either succeeds or returns a predictable error).
- [ ] **Landing request create — title with special characters** (`"quotes"`, backticks, `newlines\n`, `émojis 🎉`): Returns 201 with characters preserved.
- [ ] **Landing request create — body with markdown, code blocks, and unicode**: Returns 201 with content preserved.

### CLI Integration Tests

- [ ] **Happy path — full flow mock**: `codeplane workspace issue 1` against a test environment completes and creates a landing request (requires workspace runtime).
- [ ] **Invalid issue number — zero**: `codeplane workspace issue 0` prints error about invalid issue number.
- [ ] **Invalid issue number — negative**: `codeplane workspace issue -1` prints error about invalid issue number.
- [ ] **Invalid issue number — non-numeric**: `codeplane workspace issue abc` prints error about invalid issue number.
- [ ] **Invalid issue number — float**: `codeplane workspace issue 1.5` prints error about invalid issue number.
- [ ] **Issue not found**: `codeplane workspace issue 99999` prints issue not found error.
- [ ] **Custom target bookmark**: `codeplane workspace issue 1 --target develop` uses `develop` as target_bookmark.
- [ ] **Default target bookmark**: `codeplane workspace issue 1` uses `main` as target_bookmark.
- [ ] **Explicit repo flag**: `codeplane workspace issue 1 --repo owner/repo` resolves the correct repository.
- [ ] **Unauthenticated user**: `codeplane workspace issue 1` without auth prints authentication required error.
- [ ] **No write access**: `codeplane workspace issue 1` on a repo with read-only access prints permission denied error.
- [ ] **SSH timeout**: With an artificially low `CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS=1000`, the CLI times out with a descriptive error.
- [ ] **Claude auth missing**: With no auth sources available, the CLI prints remediation steps.
- [ ] **No changes produced**: When Claude Code runs but produces no jj changes, the CLI prints a success message without creating a landing request.
- [ ] **Workspace reuse**: Running `codeplane workspace issue 1` twice reuses the same workspace (verify by workspace ID).
- [ ] **Issue with empty body**: `codeplane workspace issue <N>` where issue N has an empty body still produces a well-formed prompt and landing request body.
- [ ] **Issue with labels**: `codeplane workspace issue <N>` where issue N has labels includes them in the prompt.
- [ ] **Issue with no labels**: `codeplane workspace issue <N>` where issue N has no labels omits the labels line from the prompt.
- [ ] **Landing request title format**: The created landing request title matches `fix: <issue title> (#<number>)`.
- [ ] **Landing request body format**: The created landing request body starts with `Closes #<number>` followed by the issue body.
- [ ] **Landing request state**: The created landing request is in `open` state.
- [ ] **Multiple changes**: When Claude Code produces 5 changes, all 5 change IDs appear in the landing request.
- [ ] **JSON output mode**: `codeplane workspace issue 1 --json` returns structured JSON with workspace_id, landing_number, change_ids.
- [ ] **Issue title with special characters**: Issue title containing quotes, backticks, and unicode does not break the prompt or landing request title.

### End-to-End Tests (Full Stack)

- [ ] **E2E: Complete workspace issue flow**: Create a test issue → run `codeplane workspace issue <N>` → verify workspace exists → verify landing request exists with correct title, body, change_ids, and target_bookmark → verify landing request references the issue.
- [ ] **E2E: No-changes flow**: Create a trivial issue that Claude cannot act on → run `codeplane workspace issue <N>` → verify no landing request is created → verify CLI exit code is 0.
- [ ] **E2E: Permission boundary**: Create a test issue as user A → attempt `codeplane workspace issue <N>` as user B (read-only) → verify 403 at workspace creation step.
- [ ] **E2E: Workspace lifecycle**: Run `codeplane workspace issue <N>` → verify workspace named `issue-<N>` exists → run again → verify same workspace ID is returned (reuse).
- [ ] **E2E: Landing request immutability**: After `codeplane workspace issue <N>` creates a landing request, verify the landing request's change_ids match exactly what was collected from the workspace.
- [ ] **E2E: Issue cross-reference**: After landing request creation, verify the landing request body contains `Closes #<N>` and the issue can be found via search with the landing request number.

### Playwright UI Tests

- [ ] **Landing request created by workspace issue appears in list**: Navigate to repo landing requests page → verify the landing request created by `workspace issue` appears with correct title format.
- [ ] **Landing request detail shows change stack**: Navigate to the landing request detail page → verify all change IDs are displayed in the stack view.
- [ ] **Landing request detail shows issue reference**: Navigate to the landing request detail page → verify `Closes #<N>` is rendered as a link to the issue.
- [ ] **Workspace appears in workspace list**: Navigate to repo workspaces page → verify a workspace named `issue-<N>` appears.
