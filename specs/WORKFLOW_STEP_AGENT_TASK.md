# WORKFLOW_STEP_AGENT_TASK

Specification for WORKFLOW_STEP_AGENT_TASK.

## High-Level User POV

When a Codeplane user defines a workflow, they can include an **agent task step** alongside traditional shell-script steps and reusable action steps. An agent task step tells Codeplane to spin up an AI agent session within the context of the workflow run, hand it a prompt and repository context, and let it autonomously perform work — reading code, editing files, running commands, creating changes — inside a sandboxed workspace.

From the user's perspective, this is the automation equivalent of assigning an issue to a human developer. The user writes a natural-language prompt describing what the agent should accomplish, optionally constrains which tools the agent may use, sets a timeout, and lets the workflow engine handle the rest. The agent operates inside a container-backed workspace with full access to the repository checkout, jj tooling, and any configured secrets. When the agent finishes — or hits its time limit — the step completes with success or failure, logs are captured in the workflow run, and any changes the agent committed are available for downstream steps to inspect, test, or land.

This makes it possible to build fully automated pipelines where an issue triggers a workflow, the workflow dispatches an agent to write a fix, a subsequent step runs the test suite against the agent's changes, and a final step opens a landing request if tests pass. Teams get a repeatable, auditable, and observable path from "problem identified" to "fix proposed" without any human needing to context-switch.

Agent task steps appear in the same workflow run detail views as any other step — in the web UI, CLI, TUI, and editor integrations. Users can watch the agent's progress via streaming logs, inspect the full agent session replay after completion, and re-run agent steps just like any other workflow step. The agent task step is first-class: it participates in job dependency graphs, respects conditional execution expressions, supports retries, and emits the same status-change events that drive notifications and downstream workflow triggers.

## Acceptance Criteria

### Definition of Done

- [ ] A workflow definition can declare a step with the `agent` property instead of `run` or `uses`, and the workflow engine dispatches it as an agent task.
- [ ] The agent task step spins up a workspace, starts an agent session linked to the workflow run, and executes the provided prompt.
- [ ] The agent session is visible from the agent sessions list for the repository, with a clear link back to the originating workflow run.
- [ ] Agent task step logs (agent messages, tool calls, tool results) stream into the workflow run log viewer in real time via SSE.
- [ ] Agent task step status transitions (`queued` → `running` → `success`/`failure`/`cancelled`/`timeout`) are identical to other step types.
- [ ] The workflow run detail view (web, CLI, TUI) clearly identifies agent task steps with a distinct visual indicator.
- [ ] Agent task steps participate in the job dependency graph (`needs`) and conditional execution (`if`) like any other step type.
- [ ] Agent task steps support `retries`, `timeoutMs`, `continueOnFail`, and `needsApproval` properties.
- [ ] Cancelling a workflow run terminates any running agent task sessions and their associated workspaces.
- [ ] Re-running a workflow run re-executes agent task steps with fresh workspaces and sessions.
- [ ] The `packages/workflow` TypeScript authoring DSL supports agent task steps via the `Task` component's `agent` prop.

### Boundary Constraints

- [ ] The `agent.prompt` field must be a non-empty string, maximum 100,000 characters (UTF-8).
- [ ] The `agent.model` field, if provided, must be one of the server's configured model identifiers. If omitted, the server default is used.
- [ ] The `agent.tools` field, if provided, must be an array of known tool identifiers. An empty array means no tools. If omitted, all default tools are available.
- [ ] The `agent.maxTurns` field, if provided, must be a positive integer between 1 and 500. Default: 200.
- [ ] Step `name` for agent tasks follows the same validation as other step types: 1–200 characters, printable UTF-8, no control characters.
- [ ] Step `timeoutMs` for agent tasks has a default of 1,800,000 (30 minutes) and a maximum of 14,400,000 (4 hours).
- [ ] A workflow definition that specifies both `run` and `agent` on the same step, or both `uses` and `agent`, must be rejected at definition parse time with a clear validation error.
- [ ] A workflow definition that specifies `agent` without a `prompt` sub-field must be rejected at definition parse time.
- [ ] Agent task steps must not expose repository secrets to the agent unless the step explicitly opts in via `agent.secrets: true` or a named list.
- [ ] The agent token generated for the workflow run must be scoped to the repository and expire no later than the step timeout plus a 15-minute grace period.

### Edge Cases

- [ ] If the workspace fails to provision within the SSH poll timeout (default 120s), the step transitions to `failure` with a diagnostic error in the logs.
- [ ] If the agent session times out (hits `timeoutMs`), the step transitions to `timeout`, the agent session is marked `timed_out`, and the workspace is cleaned up.
- [ ] If the agent produces no changes (empty changeset), the step still completes as `success` — downstream steps should inspect changes if they need them.
- [ ] If the agent encounters an unrecoverable error (e.g., model API unavailable), the step transitions to `failure` with the error message in logs.
- [ ] If the workflow is cancelled while the agent is mid-execution, the agent session receives a cancellation signal, the workspace is terminated, and the step transitions to `cancelled`.
- [ ] If `retries` is set and the agent fails, each retry creates a fresh workspace and agent session. The previous session's logs remain accessible.
- [ ] If `needsApproval` is set, the step enters a `pending_approval` state before the agent is dispatched. The agent only runs after approval.
- [ ] Concurrent agent task steps within the same workflow run (via `Parallel` or independent jobs) each get their own workspace and session.
- [ ] If the repository has no workspace configuration, the agent task step uses a default workspace template with the repository checkout.

## Design

### Workflow Definition Shape

A step with the `agent` property in the workflow YAML/config is an agent task step:

```yaml
jobs:
  fix-bug:
    name: Auto-fix bug
    runs-on: codeplane
    steps:
      - name: Analyze and fix
        agent:
          prompt: |
            Look at issue #42 and propose a fix. Run the test suite
            to verify your changes pass.
          model: claude-sonnet
          tools:
            - bash
            - read
            - write
            - edit
            - codeplane_issue_create
          maxTurns: 100
          secrets: true
          timeoutMs: 3600000
```

### TypeScript Authoring DSL (packages/workflow)

The existing `Task` component's `agent` prop is the authoring entry point:

```tsx
<Task
  id="fix-bug"
  agent={{
    prompt: `Look at issue #42 and propose a fix.
             Run the test suite to verify your changes pass.`,
    model: "claude-sonnet",
    tools: ["bash", "read", "write", "edit"],
    maxTurns: 100,
    secrets: true,
  }}
  timeoutMs={3_600_000}
  retries={1}
  continueOnFail={false}
>
  {(ctx) => { /* post-processing callback */ }}
</Task>
```

The `agent` prop type should be formalized as:

```typescript
interface AgentTaskConfig {
  /** Natural-language instruction for the agent. Required. */
  prompt: string;
  /** Model identifier. Optional; defaults to server config. */
  model?: string;
  /** Allowed tool names. Omit for all defaults; empty array for none. */
  tools?: string[];
  /** Maximum agent conversation turns. Default 200, max 500. */
  maxTurns?: number;
  /** Whether repository secrets are injected. Default false. */
  secrets?: boolean | string[];
  /** Override step timeout in milliseconds. Default 1,800,000. */
  timeoutMs?: number;
}
```

### API Shape

#### Step Detail Enhancement

`GET /api/repos/:owner/:repo/workflows/runs/:runId/nodes/:nodeId`

The response gains an `agent_session` block when the node is an agent task step:

```json
{
  "id": 42,
  "step_id": 7,
  "name": "Analyze and fix",
  "position": 1,
  "status": "running",
  "step_type": "agent",
  "agent_session": {
    "id": "sess_abc123",
    "status": "active",
    "message_count": 14,
    "turn_count": 7,
    "max_turns": 100,
    "model": "claude-sonnet",
    "started_at": "2026-03-22T10:00:00Z"
  },
  "workspace": {
    "id": "ws_xyz789",
    "status": "running"
  },
  "started_at": "2026-03-22T10:00:00Z",
  "completed_at": null,
  "duration_seconds": 142,
  "logs": [...]
}
```

#### Agent Session Link

`GET /api/repos/:owner/:repo/agent/sessions/:sessionId`

The existing agent session response gains:

```json
{
  "workflow_run_id": 99,
  "workflow_step_id": 7,
  "workflow_step_name": "Analyze and fix"
}
```

#### Step Type in Run Detail

`GET /api/repos/:owner/:repo/workflows/runs/:runId`

Each node in the `nodes` array gains a `step_type` field: `"run"` | `"uses"` | `"agent"`.

#### Changes Produced by Agent

`GET /api/repos/:owner/:repo/workflows/runs/:runId/nodes/:nodeId/changes`

Returns the jj change IDs produced by the agent during this step:

```json
{
  "change_ids": ["abc123def456", "789ghi012jkl"],
  "target_bookmark": "main"
}
```

### Web UI Design

#### Workflow Run Detail Page

**Step list panel:**
- Agent task steps display a distinct icon (robot/agent icon) next to the step name, differentiating them from shell steps (terminal icon) and action steps (puzzle-piece icon).
- The step status badge uses the same color scheme as other steps (green success, red failure, blue running, gray queued, yellow timeout).
- While running, the step shows a "turns: 7/100" counter beneath the status badge.

**Step detail panel (when agent step is selected):**
- **Agent Session tab:** Shows the full agent session replay — messages, tool calls, tool results — in the same format as the standalone agent session view. This is the primary view.
- **Logs tab:** Shows the structured log stream (stdout/stderr from workspace operations, agent lifecycle events).
- **Changes tab:** Shows jj change IDs produced by the agent, with links to change detail views.
- **Workspace tab:** Shows workspace status, SSH info, and a "Connect" button for live terminal access (if workspace is still running).

**Header area:**
- If the step is `pending_approval`, shows an "Approve" / "Reject" button pair.
- Shows model name, tool count, and max turns as metadata chips.

### CLI Commands

#### Workflow run view (enhanced)

`codeplane run view <run-id>` output gains:

```
Step 2: Analyze and fix
  Type:    agent
  Status:  running (turn 7/100)
  Model:   claude-sonnet
  Session: sess_abc123
  Started: 2 minutes ago
```

#### Agent session from workflow

`codeplane agent session view <session-id>` gains a workflow context block:

```
Workflow Run: #99 (fix-bug)
Step:         Analyze and fix
Repository:   acme/widgets
```

#### Watch agent step

`codeplane run watch <run-id>` streams agent messages interleaved with step status changes when the active step is an agent task:

```
[step 2] Agent started (model: claude-sonnet, max turns: 100)
[step 2] [assistant] I'll look at issue #42 and analyze the failing test...
[step 2] [tool_call] bash: npm test
[step 2] [tool_result] 3 tests failed
[step 2] [assistant] I see the issue. The handler doesn't account for...
...
[step 2] Agent completed (7 turns, 2 changes)
```

#### Direct agent step logs

`codeplane run logs <run-id> --step <step-id>` streams the agent session messages and tool interactions.

### TUI Design

#### Workflow Run Detail Screen

- Agent task steps in the step list show a `🤖` prefix before the step name.
- Selecting an agent step and pressing `Enter` opens an inline agent session replay (reusing the existing `MessageBlock` and `ToolBlock` components from the Agents screen).
- Pressing `a` on an agent step opens the full `AgentChatScreen` for that session (read-only if step is complete).
- The step detail pane shows: model, turn count / max turns, tool list, and change IDs produced.

#### Keyboard bindings

| Key | Action |
|-----|--------|
| `Enter` | Expand/collapse inline agent session |
| `a` | Open full agent session view |
| `w` | Open workspace detail for this step |
| `c` | Cancel running agent step |

### SDK Shape

The `WorkflowService` gains:

```typescript
interface CreateAgentStepInput {
  workflowRunId: string;
  workflowStepId: string;
  repositoryId: string;
  agentConfig: AgentTaskConfig;
  ref: string;
  commit: string;
  agentToken: string;
}

createAgentTaskStep(input: CreateAgentStepInput): Promise<{ sessionId: string; workspaceId: string }>;
cancelAgentTaskStep(workflowRunId: string, stepId: string): Promise<void>;
getAgentStepChanges(workflowRunId: string, stepId: string): Promise<{ changeIds: string[]; targetBookmark: string }>;
```

### Documentation

The following end-user documentation should be written:

- **Guide: "Agent Task Steps in Workflows"** — A getting-started guide covering: what agent tasks are, how to add one to a workflow definition, configuring the prompt and tools, setting timeouts and retries, viewing agent session output in the run detail, and a complete example workflow that fixes an issue automatically.
- **Reference: "Workflow Step Types"** — Update the existing step types reference to include the `agent` step type alongside `run` and `uses`, with the full `AgentTaskConfig` property table.
- **Reference: "Agent Task Config Properties"** — Detailed reference for each `agent` sub-field: `prompt`, `model`, `tools`, `maxTurns`, `secrets`, `timeoutMs`, with defaults, constraints, and examples.
- **Tutorial: "Automated Issue Resolution Pipeline"** — End-to-end tutorial showing a workflow triggered by issue creation that uses an agent task to propose a fix and a subsequent step to run tests and open a landing request.
- **FAQ entry: "How do agent task steps differ from the `workspace issue` CLI command?"** — Explains that `workspace issue` is an interactive CLI flow while agent task steps are declarative, repeatable workflow steps with full audit trails.

## Permissions & Security

### Authorization Roles

| Action | Owner | Admin | Member (Write) | Member (Read) | Anonymous |
|--------|-------|-------|-----------------|---------------|----------|
| Define workflow with agent steps | ✅ | ✅ | ✅ | ❌ | ❌ |
| Dispatch workflow with agent steps | ✅ | ✅ | ✅ | ❌ | ❌ |
| View agent step logs & session | ✅ | ✅ | ✅ | ✅ | ❌ |
| Cancel running agent step | ✅ | ✅ | ✅ (own dispatch) | ❌ | ❌ |
| Approve pending agent step | ✅ | ✅ | ❌ | ❌ | ❌ |
| Re-run agent step | ✅ | ✅ | ✅ | ❌ | ❌ |
| Access workspace of agent step | ✅ | ✅ | ❌ | ❌ | ❌ |

### Rate Limiting

- **Agent step dispatch**: Inherits workflow dispatch rate limits (repository-scoped).
- **Concurrent agent steps per repository**: Maximum 5 concurrently running agent task steps per repository. Excess steps queue as `pending`.
- **Concurrent agent steps per organization**: Maximum 20 concurrently running agent task steps across all repositories in an organization.
- **Agent step creation rate**: Maximum 30 agent task step dispatches per repository per hour.
- **Agent session message rate**: Inherits existing agent session message rate limits.

### Data Privacy & PII

- Agent prompts may contain sensitive information. Prompts are stored in the workflow task payload and are visible to all users with read access to the repository's workflow runs.
- Agent session messages (including tool call inputs/outputs) are persisted. They may contain source code, error messages, or data from the repository. Access is scoped by repository read permissions.
- Repository secrets injected into agent workspaces via `agent.secrets` must never appear in agent session logs. The agent runtime must redact configured secret values from all logged output.
- Agent model API calls use the server's configured credentials; user-specific API keys are not exposed to the agent runtime.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkflowAgentStepDispatched` | Agent task step transitions from `queued` to `running` | `repository_id`, `workflow_run_id`, `step_id`, `model`, `max_turns`, `tools_count`, `secrets_enabled`, `timeout_ms` |
| `WorkflowAgentStepCompleted` | Agent task step reaches terminal status | `repository_id`, `workflow_run_id`, `step_id`, `status` (success/failure/timeout/cancelled), `duration_seconds`, `turn_count`, `change_ids_count`, `model`, `retry_attempt` |
| `WorkflowAgentStepApproved` | Approval granted for pending agent step | `repository_id`, `workflow_run_id`, `step_id`, `approver_user_id`, `wait_duration_seconds` |
| `WorkflowAgentStepRejected` | Approval denied for pending agent step | `repository_id`, `workflow_run_id`, `step_id`, `rejector_user_id` |
| `WorkflowAgentStepRetried` | Agent step re-dispatched after failure | `repository_id`, `workflow_run_id`, `step_id`, `retry_attempt`, `previous_status` |
| `WorkflowAgentStepChangesProduced` | Agent produces jj changes | `repository_id`, `workflow_run_id`, `step_id`, `change_ids_count`, `target_bookmark` |

### Funnel Metrics

- **Adoption rate**: % of repositories with at least one workflow containing an agent task step.
- **Success rate**: % of agent task steps that complete with `success` status, segmented by model, tools configuration, and prompt length.
- **Time to completion**: Histogram of agent step duration (p50, p90, p99), segmented by model.
- **Changes produced rate**: % of successful agent steps that produce at least one jj change.
- **Pipeline completion rate**: % of workflows containing agent steps where the full workflow (including downstream test/land steps) succeeds end-to-end.
- **Retry effectiveness**: % of retried agent steps that succeed on retry.
- **Approval latency**: Time between step entering `pending_approval` and receiving approval/rejection.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------|  
| Agent step queued | `info` | `workflow_run_id`, `step_id`, `step_name`, `model`, `max_turns`, `timeout_ms` |
| Workspace provisioning started | `info` | `workflow_run_id`, `step_id`, `workspace_id` |
| Workspace provisioning failed | `error` | `workflow_run_id`, `step_id`, `workspace_id`, `error_message`, `duration_ms` |
| Workspace SSH ready | `info` | `workflow_run_id`, `step_id`, `workspace_id`, `provision_duration_ms` |
| Agent session created | `info` | `workflow_run_id`, `step_id`, `session_id`, `model`, `tools` |
| Agent turn completed | `debug` | `session_id`, `turn_number`, `role`, `tool_calls_count` |
| Agent step succeeded | `info` | `workflow_run_id`, `step_id`, `session_id`, `turn_count`, `change_ids_count`, `duration_ms` |
| Agent step failed | `warn` | `workflow_run_id`, `step_id`, `session_id`, `error_message`, `turn_count`, `duration_ms` |
| Agent step timed out | `warn` | `workflow_run_id`, `step_id`, `session_id`, `timeout_ms`, `turn_count` |
| Agent step cancelled | `info` | `workflow_run_id`, `step_id`, `session_id`, `turn_count`, `cancelled_by` |
| Secret redaction applied | `debug` | `session_id`, `redacted_keys_count` |
| Agent token generated | `info` | `workflow_run_id`, `token_expires_at` |
| Workspace cleanup completed | `info` | `workflow_run_id`, `step_id`, `workspace_id` |
| Workspace cleanup failed | `error` | `workflow_run_id`, `step_id`, `workspace_id`, `error_message` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_agent_steps_total` | Counter | `repository_id`, `status` | Total agent task steps by terminal status |
| `codeplane_workflow_agent_steps_active` | Gauge | `repository_id` | Currently running agent task steps |
| `codeplane_workflow_agent_step_duration_seconds` | Histogram | `repository_id`, `status`, `model` | Agent step duration (buckets: 30, 60, 120, 300, 600, 1200, 1800, 3600) |
| `codeplane_workflow_agent_step_turns` | Histogram | `repository_id`, `status`, `model` | Agent turns per step (buckets: 1, 5, 10, 25, 50, 100, 200, 500) |
| `codeplane_workflow_agent_step_changes_produced` | Histogram | `repository_id` | Number of jj changes produced per step (buckets: 0, 1, 2, 5, 10, 20) |
| `codeplane_workflow_agent_workspace_provision_seconds` | Histogram | `repository_id` | Time to provision workspace for agent step (buckets: 5, 10, 30, 60, 120) |
| `codeplane_workflow_agent_step_retries_total` | Counter | `repository_id` | Total agent step retry attempts |
| `codeplane_workflow_agent_step_approval_wait_seconds` | Histogram | `repository_id` | Time waiting for approval (buckets: 60, 300, 900, 1800, 3600, 7200) |
| `codeplane_workflow_agent_concurrent_limit_reached_total` | Counter | `repository_id` | Times the concurrency limit blocked a step |

### Alerts and Runbooks

#### Alert: `AgentStepFailureRateHigh`
- **Condition**: `rate(codeplane_workflow_agent_steps_total{status="failure"}[15m]) / rate(codeplane_workflow_agent_steps_total[15m]) > 0.5` sustained for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_workflow_agent_step_duration_seconds` to see if failures are correlated with timeouts.
  2. Query structured logs for `agent step failed` events in the last 15 minutes; inspect `error_message` for patterns (model API errors, workspace provisioning failures, SSH failures).
  3. Check the model provider's status page for outages.
  4. If workspace provisioning failures dominate, check container runtime health and disk space.
  5. If model API errors dominate, verify API key validity and quota.
  6. If SSH connection failures dominate, check workspace networking and SSH server health.

#### Alert: `AgentStepTimeoutRateHigh`
- **Condition**: `rate(codeplane_workflow_agent_steps_total{status="timeout"}[1h]) / rate(codeplane_workflow_agent_steps_total[1h]) > 0.3` sustained for 30 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Review `codeplane_workflow_agent_step_turns` histogram — if most steps hit max turns, users may be setting prompts that are too broad.
  2. Check `codeplane_workflow_agent_step_duration_seconds` p99 — if it clusters near the timeout boundary, consider whether default timeouts need adjustment.
  3. Inspect recent timed-out agent sessions for infinite loops (repeated tool calls with same inputs).
  4. If a single repository dominates, contact the repository owner to review their agent configurations.

#### Alert: `AgentWorkspaceProvisionSlow`
- **Condition**: `histogram_quantile(0.9, codeplane_workflow_agent_workspace_provision_seconds) > 90` sustained for 15 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check container runtime resource utilization (CPU, memory, disk).
  2. Inspect `Workspace provisioning failed` log events for error patterns.
  3. Verify container image pull times — large images may be causing delays.
  4. Check if workspace concurrency limits are being hit, causing queue backpressure.
  5. Review node/host capacity if running on a self-hosted cluster.

#### Alert: `AgentConcurrentLimitSaturation`
- **Condition**: `codeplane_workflow_agent_steps_active / 5 > 0.8` per repository, sustained for 5 minutes.
- **Severity**: Info
- **Runbook**:
  1. This is informational — the repository is approaching its concurrent agent step limit.
  2. Check if steps are taking longer than expected (review duration histogram).
  3. If legitimate load, consider increasing the per-repository limit for this organization.
  4. If a runaway workflow is producing unbounded agent steps, cancel the workflow run.

#### Alert: `AgentStepNoChangesProduced`
- **Condition**: Custom query — more than 20 consecutive successful agent steps with 0 changes produced in a single repository within 24 hours.
- **Severity**: Info
- **Runbook**:
  1. This may indicate misconfigured prompts or overly narrow tool permissions.
  2. Review the agent session replays for the affected steps — the agent may be completing without making changes.
  3. Contact the repository owner if the pattern suggests a prompt issue.

### Error Cases and Failure Modes

| Failure Mode | Detection | Behavior |
|-------------|-----------|----------|
| Model API unavailable | HTTP error from model provider | Step fails with error message; retries if configured |
| Model API rate limited | 429 from model provider | Agent runtime backs off and retries within the step; step fails only if backoff exhausts timeout |
| Workspace provisioning timeout | SSH poll exceeds deadline | Step fails with "workspace provisioning timed out" |
| Workspace crash mid-execution | SSH connection lost | Agent session marked failed; step transitions to failure with diagnostic logs |
| Agent infinite loop | Turn count approaches max | Step completes with failure if max turns exceeded without resolution |
| Disk full in workspace | Write operations fail | Agent tool results include errors; agent may self-correct or fail |
| Secret redaction miss | Audit log review | Post-hoc alert; secret rotation recommended |
| Stale agent token | Token expired before step completes | Agent API calls rejected; step fails |
| Concurrent limit exceeded | Step stays in `pending` beyond threshold | Logged as warning; step executes when capacity frees |

## Verification

### API Integration Tests

- [ ] **Create workflow with agent step**: `POST` a workflow definition containing an `agent` step; verify it is accepted and the step appears in the definition's parsed config.
- [ ] **Reject mutually exclusive step types**: `POST` a workflow definition with both `run` and `agent` on the same step; verify 422 with a clear validation message.
- [ ] **Reject agent step without prompt**: `POST` a workflow definition with `agent: {}` (no prompt); verify 422.
- [ ] **Reject agent prompt exceeding max length**: `POST` a workflow definition with `agent.prompt` of 100,001 characters; verify 422.
- [ ] **Accept agent prompt at max length**: `POST` a workflow definition with `agent.prompt` of exactly 100,000 characters; verify 200.
- [ ] **Reject invalid model**: `POST` a workflow definition with `agent.model: "nonexistent-model"`; verify 422.
- [ ] **Reject invalid tools**: `POST` a workflow definition with `agent.tools: ["nonexistent_tool"]`; verify 422.
- [ ] **Reject maxTurns out of range**: `POST` with `agent.maxTurns: 0`; verify 422. `POST` with `agent.maxTurns: 501`; verify 422.
- [ ] **Accept maxTurns at boundaries**: `POST` with `agent.maxTurns: 1`; verify accepted. `POST` with `agent.maxTurns: 500`; verify accepted.
- [ ] **Reject timeoutMs out of range**: `POST` with `agent.timeoutMs: 14_400_001`; verify 422.
- [ ] **Accept timeoutMs at max**: `POST` with `agent.timeoutMs: 14_400_000`; verify accepted.
- [ ] **Dispatch workflow with agent step**: `POST` dispatch; verify a workflow run is created with a step of type `agent`, the step starts as `queued`, and a workspace is created.
- [ ] **Step status transitions**: Dispatch and observe the step transitions from `queued` → `running` → `success`.
- [ ] **Step failure produces correct status**: Dispatch with a prompt that will fail (e.g., "exit immediately with error"); verify step status is `failure`.
- [ ] **Step timeout produces correct status**: Dispatch with `timeoutMs: 5000` and a prompt that takes longer; verify step status is `timeout`.
- [ ] **Cancel running agent step**: Dispatch, wait for `running`, then cancel the run; verify step status is `cancelled` and agent session is `timed_out` or `failed`.
- [ ] **Rerun workflow with agent step**: Complete a run, rerun it; verify a new workspace and agent session are created.
- [ ] **Resume workflow after agent step failure**: Fail an agent step, resume the run; verify the agent step re-executes.
- [ ] **Step with retries**: Configure `retries: 2`, make the agent fail on first attempt; verify up to 3 total attempts.
- [ ] **Step with continueOnFail**: Configure `continueOnFail: true`, make the agent fail; verify the job continues to the next step.
- [ ] **Step with needsApproval**: Configure `needsApproval: true`; verify the step enters `pending_approval` and does not dispatch until approved via API.
- [ ] **Step with conditional execution**: Configure `if: "needs.build.result == 'success'"` on an agent step; verify it skips when the dependency fails.
- [ ] **Step in job dependency graph**: Configure an agent step that `needs: ["lint"]`; verify it remains `blocked` until the lint job completes.
- [ ] **Node detail includes agent_session**: `GET` node detail for an agent step; verify `step_type: "agent"` and `agent_session` block is present.
- [ ] **Node detail includes workspace**: `GET` node detail for a running agent step; verify `workspace` block is present.
- [ ] **Changes endpoint**: `GET` changes for a completed agent step that produced changes; verify `change_ids` array is populated.
- [ ] **Changes endpoint empty**: `GET` changes for a completed agent step that produced no changes; verify `change_ids` is empty array.
- [ ] **Agent session links to workflow**: `GET` the agent session created by the step; verify `workflow_run_id` and `workflow_step_id` are set.
- [ ] **Log streaming includes agent messages**: Connect to SSE log stream; verify agent messages (text, tool_call, tool_result) appear as log entries.
- [ ] **Concurrent agent steps**: Dispatch a workflow with two parallel agent steps; verify both get separate workspaces and sessions, both execute concurrently.
- [ ] **Concurrent limit enforcement**: Dispatch 6 agent steps for the same repo (limit is 5); verify the 6th stays `pending` until one completes.
- [ ] **Secret injection with secrets:true**: Configure `agent.secrets: true`; verify the agent workspace has secrets available.
- [ ] **Secret redaction in logs**: Configure secrets and verify that secret values do not appear in agent session messages or workflow logs.
- [ ] **Auth: read-only user cannot dispatch**: Authenticate as read-only; verify 403 on dispatch.
- [ ] **Auth: anonymous user cannot view agent step session**: Verify 401 on session detail.
- [ ] **Auth: member can view agent step logs**: Authenticate as read-access member; verify 200 on log stream.

### CLI Integration Tests

- [ ] **`run view` shows agent step type**: Dispatch a workflow with an agent step; run `codeplane run view <id>`; verify output includes `Type: agent` and session ID.
- [ ] **`run logs` streams agent messages**: Run `codeplane run logs <id>`; verify agent tool calls and responses appear in the stream.
- [ ] **`run watch` shows agent progress**: Run `codeplane run watch <id>`; verify live turn count updates and agent message summaries.
- [ ] **`agent session view` shows workflow context**: Run `codeplane agent session view <session-id>`; verify workflow run and step info are displayed.
- [ ] **`run cancel` stops agent step**: Run `codeplane run cancel <id>` while agent step is running; verify step transitions to `cancelled`.

### Web UI (Playwright) E2E Tests

- [ ] **Workflow run detail shows agent step icon**: Navigate to a run with an agent step; verify the step list renders the agent icon.
- [ ] **Agent step detail shows session replay**: Click on an agent step in the run detail; verify the agent session messages render in the detail pane.
- [ ] **Agent step detail shows turn counter**: While an agent step is running, verify the turn counter updates.
- [ ] **Agent step status badge colors**: Verify success (green), failure (red), running (blue), timeout (yellow), cancelled (gray) badge colors on agent steps.
- [ ] **Changes tab shows produced changes**: Navigate to a completed agent step's Changes tab; verify change IDs are listed with links.
- [ ] **Approval flow UI**: Navigate to a step with `needsApproval`; verify Approve/Reject buttons are present; click Approve; verify the step starts.
- [ ] **Cancel agent step from UI**: Click cancel on a running agent step; verify the step transitions to cancelled.
- [ ] **SSE log streaming in agent step**: Open a running agent step; verify log entries appear in real time without page refresh.
- [ ] **Workspace tab shows workspace status**: Navigate to a running agent step's Workspace tab; verify workspace status and SSH info display.
- [ ] **Session link navigates to agent session**: Click the session ID link in the agent step detail; verify navigation to the agent session detail page.

### TUI Integration Tests

- [ ] **Agent step displays robot icon**: Open workflow run detail in TUI; verify agent steps show `🤖` prefix.
- [ ] **Expand agent step shows session**: Press `Enter` on an agent step; verify inline message replay renders.
- [ ] **`a` key opens full session view**: Press `a` on an agent step; verify navigation to agent session screen.
- [ ] **Step status updates live**: Watch a running agent step in TUI; verify status transitions render without manual refresh.

### Workflow Definition Validation Tests

- [ ] **Valid minimal agent step**: `{ agent: { prompt: "fix it" } }` — accepted.
- [ ] **Valid full agent step**: All fields populated with valid values — accepted.
- [ ] **Empty prompt string**: `{ agent: { prompt: "" } }` — rejected.
- [ ] **Whitespace-only prompt**: `{ agent: { prompt: "   " } }` — rejected.
- [ ] **Prompt with unicode**: `{ agent: { prompt: "修复这个错误 🐛" } }` — accepted.
- [ ] **Prompt at exactly 100,000 chars**: Accepted.
- [ ] **Prompt at 100,001 chars**: Rejected with size error.
- [ ] **maxTurns: 1**: Accepted (minimum).
- [ ] **maxTurns: 500**: Accepted (maximum).
- [ ] **maxTurns: 0**: Rejected.
- [ ] **maxTurns: 501**: Rejected.
- [ ] **maxTurns: -1**: Rejected.
- [ ] **maxTurns: 1.5** (non-integer): Rejected.
- [ ] **timeoutMs: 1**: Accepted (minimum valid).
- [ ] **timeoutMs: 14,400,000**: Accepted (maximum).
- [ ] **timeoutMs: 14,400,001**: Rejected.
- [ ] **timeoutMs: 0**: Rejected.
- [ ] **timeoutMs: -1**: Rejected.
- [ ] **tools: []** (empty array): Accepted (no tools).
- [ ] **tools: ["bash", "read", "write"]**: Accepted (known tools).
- [ ] **tools: ["nonexistent"]**: Rejected.
- [ ] **secrets: true**: Accepted.
- [ ] **secrets: false**: Accepted.
- [ ] **secrets: ["MY_SECRET"]**: Accepted (named list).
- [ ] **secrets: [""]**: Rejected (empty secret name).
- [ ] **Both run and agent on same step**: Rejected with clear error.
- [ ] **Both uses and agent on same step**: Rejected with clear error.
- [ ] **All three (run, uses, agent) on same step**: Rejected.
- [ ] **Step name at max length (200 chars)**: Accepted.
- [ ] **Step name at 201 chars**: Rejected.
- [ ] **Step name with control characters**: Rejected.
