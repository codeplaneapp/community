# WORKFLOW_RUN_RERUN

Specification for WORKFLOW_RUN_RERUN.

## High-Level User POV

When a workflow run finishes — whether it succeeded, failed, timed out, or was cancelled — developers often need to run it again. A test suite may have been flaky, infrastructure may have hiccupped, or a configuration change may have been made that warrants re-validation without changing any code. The Workflow Run Rerun feature gives developers a one-action way to start a completely new workflow run that faithfully reproduces the original run's execution context.

From any surface in Codeplane — the web UI run detail page, the TUI, or the CLI — a developer can trigger a rerun on any workflow run that has reached a terminal state. Rerun creates a brand-new workflow run using the same workflow definition, the same trigger event type, the same target ref and commit SHA, and the same dispatch inputs that the original run used. The new run is enqueued independently: it gets its own run ID, its own step graph, its own logs, and its own lifecycle. The original run remains unchanged in the run history, so the developer always has a clear audit trail of what ran and when.

In the web UI, a "Rerun" button appears in the run detail header whenever the run has completed. Clicking it immediately creates the new run and navigates the developer to its detail page, where they can watch execution unfold in real time. In the TUI, pressing `r` on a completed run opens a confirmation overlay on the detail screen or triggers an immediate optimistic rerun on the run list screen. In the CLI, `codeplane workflow run rerun <id>` creates the new run and outputs its metadata.

Rerun is distinct from Resume. Resume attempts to pick up a cancelled or failed run from where it left off, re-activating incomplete steps. Rerun always starts fresh — it creates an entirely new run from scratch, regardless of which steps had completed. This distinction matters for developers who want a clean-room re-execution rather than a partial retry.

The feature is valuable for CI/CD reliability (retrying flaky runs), for validation (re-running a deployment pipeline after environment fixes), and for debugging (reproducing a failure while streaming logs to investigate root cause). It fits naturally into Codeplane's workflow lifecycle alongside dispatch, cancel, and resume as the four primary run management operations.

## Acceptance Criteria

### Definition of Done

- [ ] A new workflow run is created by the rerun operation — it must never mutate or overwrite the original run
- [ ] The new run preserves the original run's `trigger_event`, `trigger_ref`, `trigger_commit_sha`, and `dispatch_inputs`
- [ ] The new run uses the current state of the workflow definition (not a snapshot from the original run's creation time)
- [ ] The rerun operation returns a response containing `workflow_definition_id`, `workflow_run_id`, and `steps` (each with `stepId` and `taskId`)
- [ ] Rerun is only available for runs in a terminal state: `success`, `failure`, `cancelled`, or `timeout`
- [ ] Attempting to rerun a run that is `running` or `queued` returns an appropriate error or is prevented at the client level
- [ ] Attempting to rerun a run whose workflow definition has been deleted returns 404 with `{ "message": "workflow definition not found" }`
- [ ] Attempting to rerun a non-existent run returns 404 with `{ "message": "workflow run not found" }`
- [ ] The API endpoint returns HTTP 201 Created on success with the new run metadata
- [ ] The rerun operation is available via both v1 (`/api/repos/:owner/:repo/actions/runs/:id/rerun`) and v2 (`/api/repos/:owner/:repo/workflows/runs/:id/rerun`) API paths
- [ ] The CLI command `codeplane workflow run rerun <id>` successfully triggers a rerun and outputs the result
- [ ] The TUI supports rerun from both the run detail screen (with confirmation overlay) and the run list screen (with optimistic update)
- [ ] The web UI renders a "Rerun" button on the run detail page for terminal-state runs
- [ ] After a successful rerun, the web UI navigates to the new run's detail page
- [ ] After a successful rerun in the TUI detail screen, the TUI navigates to the new run's detail view
- [ ] After a successful rerun in the TUI run list, the list refreshes to show the new run at the top
- [ ] The new run appears in the workflow run list with its own independent status lifecycle
- [ ] The new run's steps, logs, and artifacts are independent of the original run
- [ ] An authenticated user with write access to the repository can rerun any run in that repository (including runs triggered by other users)

### Boundary Constraints

- [ ] Run ID must be a positive integer (int64); non-numeric, zero, negative, or floating-point values return HTTP 400 with `{ "message": "invalid run id" }`
- [ ] Run ID maximum value: 2^53 - 1 (JavaScript safe integer limit); values exceeding this return 400
- [ ] `dispatch_inputs` from the original run are faithfully preserved — both string-serialized and object-serialized forms are handled during reconstruction
- [ ] If the original run's `dispatch_inputs` contained malformed JSON, the rerun proceeds with `undefined` inputs (graceful degradation, not failure)
- [ ] Workflow definition name max length: 255 characters (inherited from definition creation constraints)
- [ ] The request body is optional and currently unused (forward-compatible with future rerun-with-override semantics)
- [ ] The new run ID is always strictly greater than the original run ID

### Edge Cases

- [ ] Rerunning a run whose definition was deleted between the run's creation and the rerun attempt returns 404
- [ ] Rerunning a run whose definition config was modified since the original run uses the updated definition config (not a frozen copy)
- [ ] Rerunning a run that was itself a rerun of another run works correctly (rerun chains)
- [ ] Rerunning the same original run multiple times creates multiple independent new runs (no deduplication)
- [ ] Rerunning a run that had zero steps (empty workflow config) creates a new run that also has zero steps
- [ ] Rerunning a run while the repository is being transferred or archived returns the appropriate repository-level error
- [ ] Concurrent rerun requests for the same run ID both succeed and create two independent new runs
- [ ] Rerunning a run whose `trigger_ref` no longer exists as a bookmark/branch still creates the run (the ref is stored as metadata, not resolved at rerun time)
- [ ] Rerunning a run whose `trigger_commit_sha` is no longer reachable in the repo still creates the run
- [ ] The original run's `dispatch_inputs` containing deeply nested objects (up to 10 levels), arrays, null values, or empty strings are preserved byte-for-byte through JSON round-trip
- [ ] Unicode characters (including emoji, CJK, RTL text) in dispatch input values are preserved through rerun

## Design

### API Shape

#### Rerun Endpoint (v2 — primary)

```
POST /api/repos/:owner/:repo/workflows/runs/:id/rerun
```

**Headers:**
- `Authorization: Bearer <token>` or session cookie (required)
- `Content-Type: application/json` (optional; body is currently unused)

**Path Parameters:**
- `:owner` — repository owner username or organization name
- `:repo` — repository name
- `:id` — the ID of the workflow run to rerun (positive integer)

**Request Body:** Optional, currently ignored. Forward-compatible with a future `rerunWorkflowRunRequest` schema that may allow overriding inputs or ref.

**Response (201 Created):**

```json
{
  "workflow_definition_id": "5",
  "workflow_run_id": "1048",
  "steps": [
    { "stepId": "201", "taskId": "301" },
    { "stepId": "202", "taskId": "302" },
    { "stepId": "203", "taskId": "303" }
  ]
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|----------|
| 400 | `{ "message": "invalid run id" }` | Non-numeric, zero, negative, or float ID |
| 401 | `{ "message": "unauthorized" }` | Missing or invalid auth |
| 403 | `{ "message": "forbidden" }` | Insufficient repository access |
| 404 | `{ "message": "workflow run not found" }` | Run ID does not exist in repository |
| 404 | `{ "message": "workflow definition not found" }` | Workflow definition was deleted |
| 429 | `{ "message": "rate limit exceeded" }` | Rate limit reached |

#### Rerun Endpoint (v1 — legacy)

```
POST /api/repos/:owner/:repo/actions/runs/:id/rerun
```

Identical behavior to the v2 endpoint. Maintained for backward compatibility.

### SDK Shape

The `@codeplane/ui-core` package provides:

**Hook: `useWorkflowRunRerun(repoContext, runId)`**

- Calls `POST /api/repos/:owner/:repo/workflows/runs/:id/rerun`
- Returns `{ trigger: () => Promise<WorkflowRunResult | null>, isLoading: boolean, error: Error | null }`
- On success, returns the `WorkflowRunResult` object containing `workflowDefinitionId`, `workflowRunId`, and `steps`
- Returns `null` if the workflow definition has been deleted (404 from server)
- The `trigger` function is idempotent-safe: calling it multiple times creates multiple independent runs (intentional)

**Type: `WorkflowRunResult`**

```typescript
interface WorkflowRunResult {
  workflowDefinitionId: string;
  workflowRunId: string;
  steps: WorkflowStepResult[];
}

interface WorkflowStepResult {
  stepId: string;
  taskId: string;
}
```

### CLI Command

```
codeplane workflow run rerun <id> [--repo OWNER/REPO] [--json]
```

**Arguments:**
- `id` (required, positive integer): The workflow run ID to rerun

**Options:**
- `--repo OWNER/REPO`: Target repository (defaults to current repo context from working directory or config)
- `--json`: Output full API response as JSON

**Human-readable output on success:**

```
✓ Rerun started as run #1048
  Workflow:    CI (definition #5)
  Steps:       3
```

**JSON output on success:**

```json
{
  "workflow_definition_id": "5",
  "workflow_run_id": "1048",
  "steps": [
    { "stepId": "201", "taskId": "301" },
    { "stepId": "202", "taskId": "302" },
    { "stepId": "203", "taskId": "303" }
  ]
}
```

**Error output:**
- Non-existent run: `Error: Workflow run not found`
- Invalid ID: `Error: Invalid run ID — must be a positive integer`
- Deleted definition: `Error: Workflow definition not found`
- No repo context: `Error: No repository context. Use --repo OWNER/REPO or run from a repository directory`
- Permission denied: `Error: Permission denied`

**Exit codes:**
- `0` — success
- `1` — error (with descriptive message to stderr)

### Web UI Design

The rerun action appears on the Workflow Run Detail page at route `/:owner/:repo/workflows/runs/:id`.

**Button placement:** In the run detail header, alongside the Cancel and Resume buttons. The button group is right-aligned in the header bar.

**Button state:**
- Visible and enabled when run status is `success`, `failure`, `cancelled`, or `timeout`
- Hidden when run status is `running` or `queued`
- Disabled with tooltip "Permission denied" for read-only users

**Button appearance:**
- Label: "Rerun"
- Icon: refresh/cycle icon (↻)
- Color: primary/neutral (blue)
- Loading state: spinner replaces icon during API call, button text changes to "Rerunning…", button is disabled

**On click:**
1. Button enters loading state
2. API call to `POST /api/repos/:owner/:repo/workflows/runs/:id/rerun`
3. On success: navigate to `/:owner/:repo/workflows/runs/:newRunId` (the new run's detail page)
4. On error: show toast notification with error message, button returns to ready state

**Run list context:** In the workflow run list page, each row in the run table may include a "⋯" overflow menu with a "Rerun" option for terminal-state runs. Clicking triggers the rerun and, on success, refreshes the run list.

### TUI UI

**Run Detail Screen:**
- Keybinding: `r` — opens confirmation overlay
- Confirmation overlay text: "Rerun run #N?" with workflow name below
- Overlay color: primary (ANSI 33)
- On confirm + success: navigate to the new run's detail view via `push("workflow-run-detail", { repo, runId: newRunId })`
- On confirm + error: show error message inline in overlay with retry option
- State gating: `r` key is only active when run status is `success`, `failure`, `cancelled`, or `timeout`
- Invalid state message: pressing `r` on a `running`/`queued` run shows "Run is still in progress" in the status bar (3s auto-dismiss)

**Run List Screen:**
- Keybinding: `r` — immediate optimistic action (no confirmation overlay)
- Optimistic behavior: no visual change on the source row (unlike cancel/resume); after API returns, a silent data refresh loads the new run at the top of the list
- On success: status bar flash "✓ Rerun started as #N" (green, 3s auto-dismiss)
- On error: status bar flash with error message (red, 3s auto-dismiss)
- State gating: `r` key is only active when focused run is in a terminal state

**Status bar hints:**
- `r:rerun` displayed in normal color for terminal-state runs when user has write access
- `r:rerun` displayed in dimmed ANSI 245 for non-terminal runs or read-only users
- At small terminal widths (< 120 columns), abbreviates to `r` only

### Documentation

End-user documentation should cover:

1. **Workflow Run Rerun concept page:** Explain what rerun does (creates a new run from the same context), how it differs from resume (fresh start vs. partial retry), and when to use each
2. **CLI reference for `workflow run rerun`:** Full argument/option documentation with examples
3. **Web UI guide:** Screenshot-annotated guide showing the Rerun button on the run detail page and the resulting navigation
4. **TUI keybinding reference:** Table entry for `r` (rerun) on both run detail and run list screens
5. **API reference:** OpenAPI-style documentation for both v1 and v2 rerun endpoints including request/response shapes and error codes
6. **FAQ entry:** "Can I rerun a run if the workflow file was changed?" — Yes, the rerun uses the current workflow definition, not a frozen snapshot

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write (Member) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| View rerun button/hint | ❌ | ✅ (dimmed/disabled) | ✅ | ✅ | ✅ |
| Execute rerun | ❌ | ❌ | ✅ | ✅ | ✅ |
| Rerun another user's run | ❌ | ❌ | ✅ | ✅ | ✅ |

- Write access to the repository is required to execute a rerun
- The rerun operation records the requesting user's ID as the actor on the new run (not the original run's triggering user)
- Anonymous users receive 401 Unauthorized
- Read-only users receive 403 Forbidden
- All permission checks are enforced server-side regardless of client-side UI gating

### Rate Limiting

- 60 requests/minute for the rerun POST endpoint, shared rate limit bucket with cancel and resume action endpoints
- Rate limit is per-token (per authenticated user), not per-action-type
- 429 responses include `Retry-After` header with integer seconds
- No server-side auto-retry or queuing — the client must wait and re-initiate
- A single user cannot create more than 60 new runs per minute via rerun across all repositories (prevents abuse of compute resources)

### Data Privacy & PII

- Dispatch inputs may contain user-provided data including potentially sensitive values (API keys, environment-specific configs). These are faithfully copied to the new run. The server does not inspect or redact dispatch input content
- The requesting user's ID is stored on the new run. User IDs are internal identifiers and are not exposed directly to other users in standard API responses
- Run metadata (trigger ref, commit SHA) is repository-scoped and subject to the same access controls as the repository itself
- No PII is logged in the rerun operation beyond the user ID and run ID — dispatch inputs are not logged at the service layer

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkflowRunRerunInitiated` | User clicks rerun in any client | `repository_id`, `original_run_id`, `user_id`, `client` (web/cli/tui/api), `original_status` (the status of the run being rerun) |
| `WorkflowRunRerunSucceeded` | API returns 201 | `repository_id`, `original_run_id`, `new_run_id`, `workflow_definition_id`, `user_id`, `client`, `step_count`, `latency_ms` |
| `WorkflowRunRerunFailed` | API returns 4xx/5xx | `repository_id`, `original_run_id`, `user_id`, `client`, `error_code`, `error_message` |

### Funnel Metrics

- **Rerun adoption rate:** % of terminal runs that are rerun at least once (target: 5–15% of failed runs)
- **Rerun success rate:** % of rerun API calls that return 201 (target: >99%)
- **Rerun-to-success rate:** % of rerun-created runs that reach `success` status (insight into whether reruns are solving the problem)
- **Mean time from failure to rerun:** Average seconds between original run reaching terminal state and rerun being triggered (indicates developer response time)
- **Rerun chain depth:** Distribution of how many times a single original run lineage is rerun (identifies persistent failures)
- **Client distribution:** Breakdown of rerun triggers by client surface (web vs. CLI vs. TUI) to understand which surfaces are most used
- **Repeat rerun rate:** % of runs that are rerun more than once within 1 hour (may indicate systematic infrastructure issues)

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | When |
|-----------|-------|--------------------|------|
| Rerun request received | `info` | `{ run_id, repository_id, user_id, client_ip }` | On every rerun API request |
| Original run fetched | `debug` | `{ run_id, status, trigger_event, workflow_definition_id }` | After successful DB lookup of original run |
| Workflow definition fetched | `debug` | `{ definition_id, name, path }` | After successful DB lookup of definition |
| Dispatch inputs reconstructed | `debug` | `{ has_inputs: boolean, input_keys: string[] }` | After parsing dispatch inputs (keys only, no values for PII safety) |
| New run created | `info` | `{ original_run_id, new_run_id, workflow_definition_id, step_count, latency_ms }` | After successful `createRunForDefinition` |
| Rerun failed — run not found | `warn` | `{ run_id, repository_id }` | When original run lookup returns null |
| Rerun failed — definition not found | `warn` | `{ run_id, definition_id, repository_id }` | When definition lookup returns null |
| Rerun failed — dispatch input parse error | `warn` | `{ run_id, error }` | When `dispatchInputs` JSON is malformed (non-fatal, continues with undefined inputs) |
| Rerun failed — internal error | `error` | `{ run_id, repository_id, error }` | When `createRunForDefinition` throws an unexpected error |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_rerun_total` | Counter | `repository_id`, `status` (success/error) | Total rerun requests |
| `codeplane_workflow_rerun_duration_seconds` | Histogram | `repository_id` | End-to-end rerun operation latency (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_workflow_rerun_errors_total` | Counter | `repository_id`, `error_type` (not_found/definition_deleted/internal/rate_limited) | Rerun errors by type |
| `codeplane_workflow_runs_created_total` | Counter | `repository_id`, `trigger_source` (rerun/dispatch/event/schedule) | All new runs by source — rerun is one trigger source |

### Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| `WorkflowRerunHighErrorRate` | `rate(codeplane_workflow_rerun_errors_total[5m]) / rate(codeplane_workflow_rerun_total[5m]) > 0.1` for 5 minutes | Warning |
| `WorkflowRerunLatencyHigh` | `histogram_quantile(0.95, codeplane_workflow_rerun_duration_seconds) > 5` for 10 minutes | Warning |
| `WorkflowRerunSpikeRate` | `rate(codeplane_workflow_rerun_total[5m]) > 100` for 5 minutes | Info |

### Alert Runbooks

**WorkflowRerunHighErrorRate:**
1. Check `codeplane_workflow_rerun_errors_total` by `error_type` label to identify the dominant error category
2. If `definition_deleted` is dominant: check if a bulk definition cleanup job ran; review recent admin actions; verify workflow definitions exist for affected repositories
3. If `not_found` is dominant: check for client cache staleness or stale links; verify run IDs in recent error logs
4. If `internal` is dominant: check server error logs for DB connection errors, transaction deadlocks, or schema migration issues; check DB health metrics
5. Resolution: fix underlying cause; no rerun-specific circuit breaker is needed since reruns are user-initiated

**WorkflowRerunLatencyHigh:**
1. Check DB query latency for `getWorkflowRun`, `getWorkflowDefinition`, and `createRunForDefinition` queries
2. Check for table lock contention on `workflow_runs`, `workflow_steps`, and `workflow_tasks` tables
3. Check if the affected workflow definitions have unusually large configs (many steps)
4. Check overall DB CPU and memory utilization
5. Resolution: identify slow query and add index if needed, or scale DB resources; consider optimizing `createRunForDefinition` for large step counts

**WorkflowRerunSpikeRate:**
1. Identify whether the spike is from a single user/token or distributed (likely a team re-running after infrastructure fix)
2. Verify it's not a runaway automation script or CI loop
3. Check per-user rate limits are being enforced (60/min)
4. Monitor workflow execution queue depth for resource impact
5. Resolution: if automated abuse, revoke the token; if legitimate, monitor resource impact and consider temporarily increasing runner capacity

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|--------------|-----------|--------|------------|
| DB unavailable during rerun | `createRunForDefinition` throws connection error | Rerun returns 500, user retries | Standard DB health monitoring; user can retry |
| Original run row locked by concurrent update | `getWorkflowRun` blocks or times out | Increased latency or timeout | Read uses snapshot isolation; no write lock needed on original run |
| Workflow definition deleted during rerun (TOCTOU) | `getWorkflowDefinition` returns null after `getWorkflowRun` succeeded | 404 returned to user | Expected behavior; user is informed definition no longer exists |
| Dispatch input JSON corruption | `JSON.parse` throws in input reconstruction | Rerun proceeds with `undefined` inputs; logged as warning | Graceful degradation is intentional |
| Rate limit exceeded | 429 response | User cannot rerun immediately | Client shows retry-after guidance; per-user limit prevents abuse |
| New run creation partially fails (steps not all created) | `createRunForDefinition` returns partial result or error | Orphaned run with incomplete step graph | Transaction should wrap run + step creation atomically; if not, cleanup scheduler handles orphaned runs |

## Verification

### API Integration Tests

- [ ] **Rerun a successful run (v2 path):** Dispatch a workflow, wait for success, POST rerun, assert 201 with `workflow_run_id` different from original, `workflow_definition_id` matching, and non-empty `steps` array
- [ ] **Rerun a failed run:** Dispatch a workflow that fails, POST rerun, assert 201 with new run ID
- [ ] **Rerun a cancelled run:** Dispatch, cancel, rerun — assert 201
- [ ] **Rerun a timed-out run:** If timeout is testable, create a timed-out run and rerun — assert 201
- [ ] **Rerun via legacy v1 path:** POST to `/api/repos/:owner/:repo/actions/runs/:id/rerun`, assert 201 with same response shape as v2
- [ ] **Rerun preserves trigger context:** Rerun a manually dispatched run with inputs, fetch the new run detail, assert `trigger_event`, `trigger_ref`, `trigger_commit_sha`, and `dispatch_inputs` match the original
- [ ] **Rerun preserves dispatch inputs (object form):** Original run with `{ "env": "prod", "verbose": true }` inputs — new run should have the same inputs
- [ ] **Rerun preserves dispatch inputs (string form):** Original run with string-serialized dispatch inputs — new run should parse and preserve them
- [ ] **Rerun with empty/null dispatch inputs:** Original run with no dispatch inputs — new run should have no dispatch inputs
- [ ] **Rerun creates independent run:** After rerun, the original run's status, steps, and logs are unchanged
- [ ] **Rerun of a rerun (chain):** Rerun run A to get run B, rerun run B to get run C — assert all three are independent runs with correct parent workflow
- [ ] **Multiple reruns of same run:** Rerun the same run ID 3 times — assert 3 distinct new run IDs are created
- [ ] **Rerun non-existent run:** POST rerun with run ID 999999 — assert 404 with `"workflow run not found"`
- [ ] **Rerun with invalid run ID (string):** POST with `:id` = "abc" — assert 400 with `"invalid run id"`
- [ ] **Rerun with invalid run ID (zero):** POST with `:id` = 0 — assert 400
- [ ] **Rerun with invalid run ID (negative):** POST with `:id` = -1 — assert 400
- [ ] **Rerun with invalid run ID (float):** POST with `:id` = "1.5" — assert 400
- [ ] **Rerun with maximum valid run ID (2^53-1):** POST with large valid ID — assert 404 (run not found, not 400)
- [ ] **Rerun with ID exceeding max safe integer:** POST with `:id` = "9007199254740993" — assert 400
- [ ] **Rerun deleted definition:** Delete the workflow definition, then POST rerun — assert 404 with `"workflow definition not found"`
- [ ] **Rerun with updated definition:** Modify the workflow definition config (add a step), then rerun — assert the new run has the updated step count
- [ ] **Rerun without authentication:** POST rerun with no auth header — assert 401
- [ ] **Rerun with read-only access:** POST rerun as a read-only user — assert 403
- [ ] **Rerun cross-repository isolation:** POST rerun for a run ID that belongs to a different repository — assert 404
- [ ] **Rerun response shape validation:** Assert response has exactly `workflow_definition_id` (string), `workflow_run_id` (string), and `steps` (array of `{ stepId: string, taskId: string }`)
- [ ] **Rerun with optional JSON body:** POST with `{ "unused": "field" }` body — assert 201 (body is accepted but ignored)
- [ ] **Rerun with empty body:** POST with empty body — assert 201
- [ ] **Rerun rate limiting:** Send 61 rerun requests within 60 seconds — assert the 61st returns 429

### CLI E2E Tests

- [ ] **CLI rerun happy path:** `codeplane workflow run rerun <id> --repo OWNER/REPO --json` — assert output contains new run ID and status is `queued` or `pending` or `running`
- [ ] **CLI rerun with implicit repo context:** From a repository directory, `codeplane workflow run rerun <id> --json` — assert success
- [ ] **CLI rerun of cancelled run:** Cancel a run, then `codeplane workflow run rerun <id> --json` — assert new run is created
- [ ] **CLI rerun non-existent run:** `codeplane workflow run rerun 999999 --json` — assert error output contains "not found" and exit code 1
- [ ] **CLI rerun invalid ID:** `codeplane workflow run rerun abc` — assert error output and exit code 1
- [ ] **CLI rerun without repo context:** `codeplane workflow run rerun 1` (outside any repo, no `--repo`) — assert error about missing repository context
- [ ] **CLI rerun human-readable output:** `codeplane workflow run rerun <id> --repo OWNER/REPO` (no `--json`) — assert output contains "Rerun started as run #"
- [ ] **CLI full lifecycle test:** Register workflow → dispatch → view → cancel → rerun → verify new run appears in list (matches existing `workflow-lifecycle.test.ts` pattern)

### Web UI E2E Tests (Playwright)

- [ ] **Rerun button visibility on success run:** Navigate to a successful run detail page — assert "Rerun" button is visible and enabled
- [ ] **Rerun button visibility on failed run:** Navigate to a failed run detail page — assert "Rerun" button is visible and enabled
- [ ] **Rerun button visibility on cancelled run:** Navigate to a cancelled run detail page — assert "Rerun" button is visible and enabled
- [ ] **Rerun button hidden on running run:** Navigate to a running run detail page — assert "Rerun" button is not visible
- [ ] **Rerun button hidden on queued run:** Navigate to a queued run detail page — assert "Rerun" button is not visible
- [ ] **Rerun button click navigates to new run:** Click "Rerun" on a completed run — assert URL changes to the new run's detail page and the new run status is `queued` or `running`
- [ ] **Rerun button loading state:** Click "Rerun" — assert button shows loading spinner and is disabled during API call
- [ ] **Rerun button error toast:** Mock 500 response — click "Rerun" — assert toast notification appears with error message and button returns to enabled state
- [ ] **Rerun button for read-only user:** Log in as read-only user, navigate to run detail — assert "Rerun" button is disabled with appropriate tooltip
- [ ] **Rerun from run list overflow menu:** On the run list, click "⋯" menu on a completed run, click "Rerun" — assert list refreshes with new run visible
- [ ] **Rerun preserves original run in list:** After rerun, navigate to run list — assert both original run and new run appear with correct statuses

### TUI Tests

- [ ] **TUI rerun from detail screen:** Navigate to a terminal-state run detail, press `r`, confirm in overlay — assert navigation to new run detail
- [ ] **TUI rerun overlay cancel:** Press `r`, then `Esc` — assert overlay dismisses, no API call made
- [ ] **TUI rerun from list screen:** Focus a terminal-state run in the list, press `r` — assert flash message "✓ Rerun started as #N"
- [ ] **TUI rerun invalid state on detail:** Navigate to a running run, press `r` — assert status bar shows "Run is still in progress" and no overlay opens
- [ ] **TUI rerun invalid state on list:** Focus a running run in the list, press `r` — assert no action occurs and status bar shows appropriate message
- [ ] **TUI rerun permission denied:** As read-only user, press `r` on a terminal run — assert "Permission denied" in status bar
- [ ] **TUI rerun keybinding hint display:** On a terminal run, assert `r:rerun` appears in status bar in normal color; on a running run, assert it appears dimmed
