# WORKFLOW_DISPATCH_BY_ID

Specification for WORKFLOW_DISPATCH_BY_ID.

## High-Level User POV

When a user has registered a workflow definition in their Codeplane repository, they need a way to manually trigger that workflow using its numeric database identifier. This is the most precise and deterministic dispatch mechanism — it avoids any ambiguity that can arise when multiple workflow definitions share similar names or file paths.

From the user's perspective, workflow dispatch by ID is the "exact address" method. A user visits their repository's workflow list, identifies a specific workflow definition alongside its numeric ID, and triggers it — optionally specifying a ref (bookmark) to run against and a set of key-value inputs that parameterize the run. The system validates that the workflow definition exists, is active, and has a `workflow_dispatch` trigger configured, then creates a new workflow run and returns immediately.

This dispatch mechanism is available across every Codeplane surface: the web UI's workflow detail page, the CLI's `workflow dispatch` command, the TUI's dispatch modal, and direct API calls from automation scripts or editor integrations. In all cases, the user provides a numeric workflow definition ID, an optional ref, and optional inputs, and receives confirmation that the run has been created. If the workflow doesn't exist, isn't active, or the user lacks permission, they receive a clear, immediate error explaining why the dispatch was rejected.

The primary value of dispatch-by-ID over dispatch-by-name is reliability in automation contexts. CI scripts, agent workflows, and programmatic integrations that store a workflow definition ID can rely on exact targeting without risking misidentification if workflow names are later changed, or if multiple workflows have overlapping name patterns.

## Acceptance Criteria

### Definition of Done

- [ ] A user can dispatch a workflow by providing its numeric definition ID, an optional ref, and optional key-value inputs.
- [ ] The dispatch creates exactly one workflow run for the targeted definition.
- [ ] The API returns 204 No Content on successful dispatch.
- [ ] The created workflow run is visible in the workflow runs list, the repository activity feed, and via SSE event streams.
- [ ] All five Codeplane clients (Web UI, CLI, TUI, VS Code, Neovim) can initiate a dispatch-by-ID.

### Input Validation

- [ ] The workflow definition ID must be a positive integer (> 0, 64-bit range, max 9,223,372,036,854,775,807).
- [ ] A non-numeric, zero, negative, or floating-point ID returns 400 with message `"invalid workflow id"`.
- [ ] An ID that is numeric but does not correspond to a definition in the target repository returns 404 with message `"workflow definition not found"`.
- [ ] A definition that exists but belongs to a different repository returns 404 (no cross-repo leakage).
- [ ] An inactive workflow definition returns 404 (inactive definitions are not dispatchable).
- [ ] The `ref` field defaults to `"main"` if omitted, empty, or whitespace-only.
- [ ] The `ref` field accepts any valid jj bookmark or git ref string up to 256 characters.
- [ ] A `ref` longer than 256 characters returns 400 with message `"ref exceeds maximum length"`.
- [ ] The `inputs` field is optional. When omitted, the system uses default values from the workflow definition's `on.workflow_dispatch.inputs` schema.
- [ ] When `inputs` is provided, user-supplied values override definition defaults. Keys not present in the user payload retain their default values from the definition.
- [ ] Extra input keys not defined in the workflow definition schema are silently accepted (forward-compatible behavior).
- [ ] Each input value is coerced to string. Input values must not exceed 10,000 characters individually.
- [ ] The total serialized inputs JSON must not exceed 64 KB.
- [ ] An empty `inputs` object (`{}`) is valid and means "use all defaults."
- [ ] A missing request body returns 400 with message `"invalid request body"`.
- [ ] A request body that is not valid JSON returns 400 with message `"invalid request body"`.

### Edge Cases

- [ ] Dispatching a workflow that has no `on.workflow_dispatch` trigger configured in its definition config still succeeds at the route layer but the trigger-matching engine produces no run (the dispatch is accepted but no run is created). The response is still 204.
- [ ] Rapidly dispatching the same workflow ID multiple times creates separate independent runs (no deduplication by default).
- [ ] Dispatching while another run of the same workflow is already in progress creates a new concurrent run (no queuing or blocking).
- [ ] A workflow definition whose config is malformed JSON in the database still processes gracefully — the dispatch succeeds, input validation falls back to accepting raw user inputs, and trigger matching is attempted with best-effort parsing.

### Concurrency

- [ ] Multiple simultaneous dispatch requests for the same workflow ID all succeed independently.
- [ ] No race condition between workflow definition updates and concurrent dispatches — dispatch uses the definition state at read time.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/workflows/:id/dispatches`

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner username or organization slug |
| `repo` | string | Repository name |
| `id` | integer | Numeric workflow definition ID (positive int64) |

**Request Body (JSON):**
```json
{
  "ref": "main",
  "inputs": {
    "environment": "staging",
    "debug": "true"
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `ref` | string | No | `"main"` | Bookmark or ref to run the workflow against |
| `inputs` | object | No | `{}` | Key-value dispatch inputs; merged with definition defaults |

**Success Response:** `204 No Content` (empty body)

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Non-numeric, zero, or negative ID | `{ "message": "invalid workflow id" }` |
| 400 | Missing or malformed JSON body | `{ "message": "invalid request body" }` |
| 401 | Not authenticated | `{ "message": "authentication required" }` |
| 403 | User lacks write access to repository | `{ "message": "forbidden" }` |
| 404 | Definition not found or inactive | `{ "message": "workflow definition not found" }` |
| 429 | Rate limit exceeded | `{ "message": "rate limit exceeded" }` |

### Web UI Design

The dispatch-by-ID action is exposed on the **Workflow Detail** page (`/:owner/:repo/workflows/:id`):

- A **"Run workflow"** button appears in the page header for users with write access.
- Clicking the button opens a **dispatch modal** containing:
  - A **Ref selector** — a text input pre-populated with `"main"`, with autocomplete for available bookmarks.
  - **Dynamic input fields** rendered from the workflow definition's `on.workflow_dispatch.inputs` schema:
    - `string` type → text input field with optional default value pre-filled.
    - `boolean` type → toggle switch, default from definition.
    - `choice` type → dropdown/select with the options array from the definition, default selected.
  - Input field labels show the input key name and description (if provided in the definition schema).
  - A **"Dispatch"** primary action button.
  - A **"Cancel"** secondary button to close the modal.
- On successful dispatch (204): the modal closes, a success toast appears ("Workflow dispatched"), and the workflow runs list refreshes to show the new run.
- On error: the modal remains open and an inline error banner shows the error message.
- The workflow definition's numeric ID is displayed in the page header metadata as `#<id>` so users can reference it.

### CLI Command

**Command:** `codeplane workflow dispatch <id>`

**Arguments:**
| Argument | Type | Description |
|----------|------|-------------|
| `id` | number | Numeric workflow definition ID |

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--ref` | string | `"main"` | Bookmark/ref to run against |
| `--input` | string[] | `[]` | Dispatch inputs in `key=value` format (repeatable) |
| `--repo` | string | auto-detected | Repository in `OWNER/REPO` format |
| `--json` | flag | false | Output as JSON |

**Examples:**
```bash
# Dispatch workflow #42 on the main bookmark
codeplane workflow dispatch 42

# Dispatch with a specific ref and inputs
codeplane workflow dispatch 42 --ref feature/auth --input environment=staging --input debug=true

# Dispatch in a specific repo with JSON output
codeplane workflow dispatch 42 --repo acme/api --json
```

**Output (table mode):**
```
✓ Dispatched workflow "ci-pipeline" (run #187)
  Status: queued
  Ref:    main
```

**Output (JSON mode):**
```json
{
  "id": 187,
  "workflow_name": "ci-pipeline",
  "status": "queued",
  "trigger": "workflow_dispatch",
  "ref": "main",
  "inputs": { "environment": "staging", "debug": "true" }
}
```

### TUI UI

The TUI dispatch interaction is triggered from the **Workflows** screen:

- Highlight a workflow definition in the list and press `d` to open the dispatch modal.
- The modal renders:
  - Ref input (editable, default `"main"`)
  - Dynamic input fields matching the definition's input schema
  - `[Dispatch]` and `[Cancel]` action buttons, navigable with Tab/Shift+Tab
- On success: modal closes, status line shows "Dispatched workflow <name>", run list refreshes.
- On error: inline error message displayed in the modal.
- Press `Esc` to cancel at any time.

### SDK Shape

The SDK exposes dispatch-by-ID through the `WorkflowService`:

```typescript
workflowService.dispatchForEvent({
  repositoryID: number,
  userID: number,
  workflowDefinitionID: number,  // targets specific definition by ID
  event: {
    type: "workflow_dispatch",
    ref: string,
    inputs?: Record<string, unknown>,
  },
})
```

The `workflowDefinitionID` field triggers the "targeted dispatch" code path, which loads only the specified definition and skips broadcast matching.

### VS Code Extension

- The VS Code extension exposes a **"Codeplane: Dispatch Workflow"** command from the command palette.
- This command shows a quick-pick list of workflow definitions for the current repository (fetched from the API).
- Each entry shows the workflow name and numeric ID.
- After selection, a multi-step input flow collects ref and any defined inputs.
- Dispatch is sent to `POST /api/repos/:owner/:repo/workflows/:id/dispatches`.
- A notification toast confirms success or reports the error.

### Neovim Plugin

- The Neovim plugin exposes `:CodeplaneWorkflowDispatch <id>` command.
- If `<id>` is omitted, a Telescope picker displays available workflow definitions.
- After selection, a prompt collects ref (default `"main"`) and optional inputs.
- Dispatch is sent via the API. A `vim.notify` message confirms the result.

### Documentation

End-user documentation should include:

- **"Dispatching Workflows"** guide page covering:
  - How to find a workflow's numeric ID (web UI, CLI `workflow list`, API).
  - How to dispatch by ID from each client surface.
  - How inputs work: definition schema, defaults, overrides.
  - Common errors and what they mean.
- **API Reference** entry for `POST /api/repos/:owner/:repo/workflows/:id/dispatches` with full request/response documentation.
- **CLI Reference** entry for `codeplane workflow dispatch` with examples.

## Permissions & Security

### Authorization

| Role | Can Dispatch? | Notes |
|------|--------------|-------|
| Repository Owner | ✅ Yes | Full access |
| Repository Admin | ✅ Yes | Full access |
| Repository Member (Write) | ✅ Yes | Must have write permission on the repository |
| Repository Member (Read) | ❌ No | Read-only members cannot trigger workflows |
| Anonymous / Unauthenticated | ❌ No | Must be authenticated |
| Organization Owner | ✅ Yes | Implicitly has write access to org repositories |

### Rate Limiting

- **Per-user dispatch rate limit:** 30 dispatches per minute per repository.
- **Per-repository dispatch rate limit:** 100 dispatches per minute across all users.
- When rate-limited, the API returns `429 Too Many Requests` with a `Retry-After` header.
- Rate limiting is applied at the route middleware layer before any service-layer logic executes.

### Data Privacy

- Dispatch inputs may contain sensitive values (e.g., API keys, environment names). Inputs are stored in the `dispatch_inputs` column of the workflow run record.
- Inputs are visible to any user who can view the workflow run detail. This means read-access users can see inputs that were provided at dispatch time.
- **Recommendation:** Document that users should use repository secrets rather than dispatch inputs for sensitive values.
- No PII is collected or stored by the dispatch mechanism beyond the standard user ID of the dispatcher.
- Workflow definition IDs are sequential integers and are not considered sensitive. They are visible to any user who can list workflow definitions.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkflowDispatched` | Successful dispatch (204 returned) | `repository_id`, `workflow_definition_id`, `workflow_name`, `ref`, `has_inputs` (boolean), `input_count` (integer), `user_id`, `client` (web/cli/tui/vscode/neovim/api), `run_id` |
| `WorkflowDispatchFailed` | Dispatch rejected (4xx returned) | `repository_id`, `workflow_identifier`, `error_code` (400/401/403/404/429), `error_reason`, `user_id`, `client` |
| `WorkflowDispatchInputsProvided` | Dispatch with non-empty inputs | `repository_id`, `workflow_definition_id`, `input_keys` (string[]), `user_id` |

### Funnel Metrics

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| **Dispatch success rate** | `WorkflowDispatched / (WorkflowDispatched + WorkflowDispatchFailed)` | > 95% (most failures should be user error, not system error) |
| **Dispatch adoption by client** | Distribution of `client` property across `WorkflowDispatched` events | Healthy usage across web, CLI, and at least one editor integration |
| **Input usage rate** | `WorkflowDispatchInputsProvided / WorkflowDispatched` | Indicator of parameterized workflow adoption; trending upward is healthy |
| **Time-to-first-dispatch** | Time from workflow definition creation to first `WorkflowDispatched` event for that definition | Decreasing over time indicates improved discoverability |
| **Repeat dispatch rate** | Percentage of workflow definitions dispatched more than once in a 7-day window | High rate indicates workflows are providing ongoing value |

## Observability

### Structured Logging

| Log Point | Level | Structured Context | When |
|-----------|-------|-------------------|------|
| Dispatch request received | `info` | `{ repository_id, workflow_id, user_id, ref, has_inputs }` | On route entry, before validation |
| Dispatch validation failed | `warn` | `{ repository_id, workflow_id, user_id, error, status_code }` | On 400/404 responses |
| Dispatch authorization failed | `warn` | `{ repository_id, workflow_id, user_id, status_code }` | On 401/403 responses |
| Dispatch succeeded | `info` | `{ repository_id, workflow_definition_id, run_id, user_id, ref }` | After successful run creation |
| Dispatch input validation fallback | `warn` | `{ repository_id, workflow_definition_id, parse_error }` | When definition config fails to parse during input validation |
| Dispatch rate limited | `warn` | `{ repository_id, user_id, limit, window }` | On 429 responses |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_dispatch_total` | Counter | `repository_id`, `status` (success/client_error/server_error) | Total dispatch attempts |
| `codeplane_workflow_dispatch_duration_seconds` | Histogram | `repository_id` | End-to-end dispatch latency (route entry to response) |
| `codeplane_workflow_dispatch_input_count` | Histogram | — | Number of inputs per dispatch (0 for no-input dispatches) |
| `codeplane_workflow_dispatch_rate_limited_total` | Counter | `repository_id` | Rate-limited dispatch attempts |
| `codeplane_workflow_runs_created_total` | Counter | `repository_id`, `trigger` (filtered to `workflow_dispatch`) | Runs created via manual dispatch |

### Alerts

#### Alert: High Dispatch Failure Rate
- **Condition:** `rate(codeplane_workflow_dispatch_total{status="server_error"}[5m]) / rate(codeplane_workflow_dispatch_total[5m]) > 0.05`
- **Severity:** Warning (> 5%), Critical (> 20%)
- **Runbook:**
  1. Check server error logs for `workflow_dispatch` entries with status 5xx.
  2. Verify database connectivity — dispatch reads the `workflow_definitions` table and writes to `workflow_runs`.
  3. Check if the workflow service singleton is healthy (service registry startup logs).
  4. If database is healthy, check for schema migration issues — the `dispatch_inputs` column or `workflow_runs` insert may be failing.
  5. Escalate to the workflows team if the root cause is in `dispatchForEvent` business logic.

#### Alert: Dispatch Latency Spike
- **Condition:** `histogram_quantile(0.99, rate(codeplane_workflow_dispatch_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning (> 2s p99), Critical (> 5s p99)
- **Runbook:**
  1. Check database query latency — dispatch performs a SELECT on `workflow_definitions` by primary key (should be < 5ms).
  2. If the definition lookup is slow, check for database connection pool exhaustion.
  3. Check if the `createRunForDefinition` step is slow — this involves an INSERT into `workflow_runs` and potentially SSE event emission.
  4. Check for lock contention on the `workflow_runs` table during high-concurrency dispatch scenarios.
  5. Review recent deployments for regressions in the workflow service.

#### Alert: Abnormal Rate Limiting
- **Condition:** `rate(codeplane_workflow_dispatch_rate_limited_total[5m]) > 50`
- **Severity:** Warning
- **Runbook:**
  1. Identify the user(s) and repositories generating the rate-limited requests via structured logs.
  2. Determine if this is legitimate automation (CI scripts, agents) or abusive behavior.
  3. If legitimate, consider per-user or per-repo rate limit tier adjustments.
  4. If abusive, review the source IP and user account for further enforcement action.
  5. Check that rate limit middleware configuration hasn't accidentally been set too low after a recent change.

### Error Cases and Failure Modes

| Error | Cause | User Impact | System Response |
|-------|-------|-------------|------------------|
| Database unreachable | DB connection failure | Dispatch returns 500 | Log error, increment `server_error` counter, alert fires |
| Definition table corrupt | Migration issue | Dispatch returns 500 | Log error, increment `server_error` counter |
| SSE emission failure | Event bus failure | Dispatch succeeds but run doesn't appear in real-time feeds | Log warn, run still persisted — visible on refresh |
| Extremely large inputs payload | Malicious or accidental | Request rejected at 400 if > 64KB | Log warn with payload size |
| Concurrent definition deletion | Race between delete and dispatch | Dispatch returns 404 | Normal operation — definition was deleted between list and dispatch |

## Verification

### API Integration Tests

- [ ] **Dispatch by valid numeric ID returns 204** — Register a workflow definition, dispatch by its ID, assert 204 response.
- [ ] **Dispatch creates a workflow run** — After dispatch, GET the workflow runs list and verify a new run exists with `trigger: "workflow_dispatch"`.
- [ ] **Dispatch with ref parameter** — Dispatch with `ref: "feature/auth"`, verify the created run has the correct ref.
- [ ] **Dispatch with default ref** — Dispatch without `ref` field, verify the run uses `"main"`.
- [ ] **Dispatch with empty ref** — Dispatch with `ref: ""`, verify the run uses `"main"`.
- [ ] **Dispatch with whitespace-only ref** — Dispatch with `ref: "   "`, verify the run uses `"main"`.
- [ ] **Dispatch with inputs** — Dispatch with `inputs: { "env": "staging", "debug": "true" }`, verify inputs stored on the run.
- [ ] **Dispatch with empty inputs object** — Dispatch with `inputs: {}`, verify definition defaults are used.
- [ ] **Dispatch without inputs field** — Dispatch without `inputs` key in body, verify definition defaults are used.
- [ ] **Dispatch merges defaults and user inputs** — Definition has inputs `a` (default "x") and `b` (default "y"). Dispatch with `inputs: { "a": "override" }`. Verify run inputs are `{ "a": "override", "b": "y" }`.
- [ ] **Dispatch with extra input keys** — Dispatch with an input key not defined in the schema. Verify it is accepted (no error).
- [ ] **Dispatch with maximum valid input value size (10,000 chars)** — Create an input value of exactly 10,000 characters. Dispatch succeeds with 204.
- [ ] **Dispatch with oversized input value (10,001 chars)** — Create an input value of 10,001 characters. Dispatch returns 400.
- [ ] **Dispatch with maximum total inputs payload (64 KB)** — Construct inputs JSON that is exactly 64 KB. Dispatch succeeds with 204.
- [ ] **Dispatch with oversized total inputs payload (> 64 KB)** — Construct inputs JSON that exceeds 64 KB. Dispatch returns 400.
- [ ] **Dispatch with non-numeric ID returns 400** — `POST /workflows/abc/dispatches` returns 400 with `"invalid workflow id"`.
- [ ] **Dispatch with zero ID returns 400** — `POST /workflows/0/dispatches` returns 400.
- [ ] **Dispatch with negative ID returns 400** — `POST /workflows/-1/dispatches` returns 400.
- [ ] **Dispatch with float ID returns 400** — `POST /workflows/1.5/dispatches` returns 400.
- [ ] **Dispatch with max int64 ID that doesn't exist returns 404** — `POST /workflows/9223372036854775807/dispatches` returns 404.
- [ ] **Dispatch with nonexistent definition returns 404** — Dispatch using an ID that was never registered. Assert 404.
- [ ] **Dispatch against wrong repository returns 404** — Register a definition in repo A, attempt dispatch via repo B's URL. Assert 404 (no cross-repo leakage).
- [ ] **Dispatch without authentication returns 401** — No session/PAT. Assert 401.
- [ ] **Dispatch with read-only access returns 403** — Authenticate as a read-only collaborator. Assert 403.
- [ ] **Dispatch with missing request body returns 400** — Send POST with no body. Assert 400 `"invalid request body"`.
- [ ] **Dispatch with non-JSON body returns 400** — Send POST with `Content-Type: text/plain`. Assert 400.
- [ ] **Dispatch with malformed JSON body returns 400** — Send `{invalid`. Assert 400 `"invalid request body"`.
- [ ] **Concurrent dispatches create independent runs** — Fire 10 dispatch requests simultaneously for the same workflow ID. Verify 10 separate runs are created.
- [ ] **Dispatch an inactive workflow returns 404** — Deactivate a definition, then dispatch by its ID. Assert 404.
- [ ] **Dispatch with malformed definition config succeeds gracefully** — Register a definition with invalid JSON config. Dispatch by ID. Assert the dispatch still returns 204 (input validation falls back gracefully).

### CLI Integration Tests

- [ ] **`codeplane workflow dispatch <id>` dispatches workflow** — Register a definition, dispatch by numeric ID via CLI, verify run is created.
- [ ] **`codeplane workflow dispatch <id> --ref feature/x`** — Dispatch with custom ref, verify run ref matches.
- [ ] **`codeplane workflow dispatch <id> --input key=value`** — Dispatch with inputs, verify inputs on run.
- [ ] **`codeplane workflow dispatch <id> --input a=1 --input b=2`** — Multiple inputs, verify all stored.
- [ ] **`codeplane workflow dispatch <id> --json`** — Verify JSON output matches expected schema with `id`, `workflow_name`, `status`, `trigger`.
- [ ] **`codeplane workflow dispatch nonexistent-id`** — Non-numeric argument returns error (exit code non-zero).
- [ ] **`codeplane workflow dispatch 999999`** — Nonexistent numeric ID returns 404 error message.
- [ ] **`codeplane workflow dispatch <id> --repo owner/repo`** — Explicit repo flag overrides auto-detection.

### Playwright (Web UI) E2E Tests

- [ ] **Dispatch button visible for write-access users** — Navigate to workflow detail page, verify "Run workflow" button is present.
- [ ] **Dispatch button hidden for read-only users** — Log in as read-only collaborator, verify button is absent.
- [ ] **Dispatch modal opens on button click** — Click "Run workflow", verify modal appears with ref input and dispatch button.
- [ ] **Dispatch modal shows dynamic input fields** — For a workflow with `string`, `boolean`, and `choice` inputs, verify all three field types render correctly with defaults.
- [ ] **Dispatch modal pre-fills ref with "main"** — Open modal, verify ref field contains "main".
- [ ] **Successful dispatch closes modal and shows toast** — Fill in fields, click Dispatch, verify modal closes, success toast appears, and runs list refreshes.
- [ ] **Failed dispatch shows inline error** — Attempt dispatch for a deleted workflow, verify error banner in modal.
- [ ] **Cancel button closes modal without dispatch** — Open modal, click Cancel, verify modal closes and no run is created.
- [ ] **Escape key closes modal** — Open modal, press Escape, verify modal closes.
- [ ] **Workflow ID displayed in page header** — Navigate to workflow detail, verify `#<id>` is visible.

### TUI E2E Tests

- [ ] **Press `d` on workflow opens dispatch modal** — Navigate to workflows screen, highlight a workflow, press `d`, verify modal renders.
- [ ] **Dispatch modal renders ref and input fields** — Verify ref field and dynamic inputs appear based on definition schema.
- [ ] **Submit dispatch from TUI modal** — Fill fields, press Enter on Dispatch button, verify success message and run list refresh.
- [ ] **Cancel dispatch with Esc** — Open modal, press Esc, verify modal closes without dispatching.
- [ ] **Error displayed for failed dispatch** — Dispatch a nonexistent workflow, verify error message appears in modal.
