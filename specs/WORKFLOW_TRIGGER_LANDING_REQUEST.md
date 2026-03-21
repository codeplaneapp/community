# WORKFLOW_TRIGGER_LANDING_REQUEST

Specification for WORKFLOW_TRIGGER_LANDING_REQUEST.

## High-Level User POV

When a team member creates, updates, closes, or lands a landing request, the repository's workflows should react automatically — just like they do for pushes, issues, or releases. A workflow author declares which landing request events matter to their workflow (for example, "run my CI checks when a landing request is opened or updated," or "deploy a preview when changes are ready to land"), and the system takes care of the rest.

From the user's perspective, there is no manual step required. The moment a landing request transitions — opened, closed, synchronized with new changes, marked ready to land, or successfully landed — every active workflow that subscribes to that event type is evaluated and, if matched, a new workflow run is queued automatically. The user sees these triggered runs in the workflow runs list, on the landing request's checks tab, and in the TUI, CLI, and editor status indicators, exactly as they would see a manually dispatched or push-triggered run.

This feature closes the gap between landing request lifecycle events and workflow automation. Without it, teams cannot run CI, deploy previews, notify external systems, or trigger agent-assisted review in response to landing request activity. With it, every landing request state change becomes a first-class automation trigger, enabling jj-native continuous integration, continuous delivery, and agent-orchestrated review pipelines that feel native to the Codeplane product rather than bolted on.

## Acceptance Criteria

### Definition of Done

- [ ] When a landing request is created (state = `open`), the system dispatches a `landing_request` event with action `opened` to the workflow engine.
- [ ] When a landing request's state changes to `closed`, the system dispatches a `landing_request` event with action `closed`.
- [ ] When changes are pushed/added to an existing landing request (change stack updated), the system dispatches a `landing_request` event with action `synchronize`.
- [ ] When a landing request meets all landing requirements (all required approvals, clean conflict status), the system dispatches a `landing_request` event with action `ready_to_land`.
- [ ] When a landing request is successfully landed/merged, the system dispatches a `landing_request` event with action `landed`.
- [ ] Only active workflow definitions with a matching `on.landing_request` trigger configuration are evaluated and executed.
- [ ] If a workflow defines `on: { landing_request: {} }` (no `types` filter), it triggers on **all** landing request event actions.
- [ ] If a workflow defines `on: { landing_request: { types: ["opened", "synchronize"] } }`, it triggers only on those specific actions.
- [ ] Action type matching is case-insensitive (e.g., `"Opened"` matches `"opened"`).
- [ ] The triggered workflow run records the trigger event type as `landing_request`, the action, the target bookmark as the ref, the head change's commit SHA, and the landing request's primary change ID.
- [ ] Multiple workflows can be triggered by the same landing request event.
- [ ] A workflow run triggered by a landing request event appears in the repository's workflow runs list with a clear indication of the trigger source.
- [ ] Workflow runs triggered by landing request events appear on the landing request's checks/status tab.
- [ ] The `on.landingRequest` TypeScript trigger builders (`opened()`, `closed()`, `synchronize()`, `readyToLand()`, `landed()`) produce workflow definitions that are correctly matched by the trigger evaluation engine.
- [ ] Workflow dispatch for landing request events is fire-and-forget from the landing request operation's perspective — a failed dispatch does not block or roll back the landing request state transition.
- [ ] Reopening a closed landing request dispatches a `landing_request` event with action `opened` (same as initial creation).
- [ ] If no active workflow definitions match the event, no workflow runs are created and no error is raised.
- [ ] The dispatch call includes the acting user's ID as the event actor.

### Edge Cases

- [ ] A landing request created in `draft` state does NOT dispatch `opened` until it transitions to `open`.
- [ ] Rapidly closing and reopening a landing request dispatches both `closed` and `opened` events independently, each producing separate workflow runs.
- [ ] If the workflow service is temporarily unavailable, the landing request operation succeeds and the dispatch failure is logged as a warning — landing request operations are never blocked by workflow dispatch failures.
- [ ] A landing request with zero changes (empty change stack) still triggers events if the state transitions occur.
- [ ] Dispatching for a repository with no workflow definitions is a no-op.
- [ ] The `synchronize` event fires once per change-stack update operation, not once per individual change added.
- [ ] The `ready_to_land` event fires only when the landing request transitions *into* the ready state, not on every review that maintains an already-ready state.
- [ ] The `landed` event fires only once, after the merge operation completes successfully — not when the landing is merely queued.

### Boundary Constraints

- [ ] The `types` array in the trigger configuration accepts only the values: `opened`, `closed`, `synchronize`, `ready_to_land`, `landed`. Unknown values are ignored during matching (they will never match any event).
- [ ] The trigger event's `ref` field uses the landing request's target bookmark name (e.g., `main`), not a synthetic ref.
- [ ] The trigger event's `commitSHA` field uses the head commit SHA of the landing request's topmost change.
- [ ] The trigger event's `changeID` field uses the primary (topmost) jj change ID from the landing request's stack.
- [ ] Maximum of 100 workflow definitions are evaluated per dispatch event (consistent with existing broadcast dispatch behavior).

## Design

### Workflow Authoring (TypeScript SDK)

Users define landing request triggers using the `on.landingRequest` builder from `@codeplane/workflow`:

```typescript
import { Workflow, Task, on } from "@codeplane/workflow";

export default (
  <Workflow
    name="ci-on-landing-request"
    triggers={[
      on.landingRequest.opened(),
      on.landingRequest.synchronize(),
    ]}
  >
    <Task name="lint-and-test" run="bun test" />
  </Workflow>
);
```

Available trigger builders:

| Builder | Action | Fires when |
|---------|--------|------------|
| `on.landingRequest.opened()` | `opened` | A landing request is created or reopened |
| `on.landingRequest.closed()` | `closed` | A landing request is closed without landing |
| `on.landingRequest.synchronize()` | `synchronize` | Changes are pushed to a landing request |
| `on.landingRequest.readyToLand()` | `ready_to_land` | A landing request meets all requirements to land |
| `on.landingRequest.landed()` | `landed` | A landing request is successfully merged |

These builders produce `LandingRequestTriggerDescriptor` objects that the workflow renderer serializes to the JSON configuration format:

```json
{
  "on": {
    "landing_request": {
      "types": ["opened", "synchronize"]
    }
  }
}
```

### Workflow Configuration (JSON)

The `landing_request` trigger accepts an optional `types` array. Omitting `types` (or providing an empty array) matches all event actions.

```json
{
  "on": {
    "landing_request": {
      "types": ["opened", "closed", "synchronize", "ready_to_land", "landed"]
    }
  }
}
```

### API Shape

No new API endpoints are introduced. Landing request triggers operate through existing endpoints with enhanced behavior:

**Existing endpoints that now dispatch workflow events:**

| Endpoint | Method | Event Action |
|----------|--------|--------------|
| `/api/repos/:owner/:repo/landings` | `POST` | `opened` (when state is `open`) |
| `/api/repos/:owner/:repo/landings/:number` | `PATCH` | `closed` (when state transitions to `closed`), `opened` (when state transitions to `open` from `closed`) |
| `/api/repos/:owner/:repo/landings/:number/land` | `PUT` | `landed` (after successful merge) |
| `/api/repos/:owner/:repo/landings/:number/changes` | `POST`/`PATCH` | `synchronize` (when changes are added/updated) |
| `/api/repos/:owner/:repo/landings/:number/reviews` | `POST` | `ready_to_land` (if review causes LR to meet requirements) |

**Workflow runs triggered by landing request events are visible via:**

- `GET /api/repos/:owner/:repo/workflows/runs` — lists all runs including those triggered by `landing_request`
- `GET /api/repos/:owner/:repo/landings/:number/checks` — shows workflow runs associated with the landing request

**TriggerEvent payload shape for landing request events:**

```json
{
  "type": "landing_request",
  "ref": "main",
  "commitSHA": "abc123def456...",
  "changeID": "xyzchange789",
  "action": "opened"
}
```

### Web UI Design

**Landing Request Detail — Checks Tab:**
- Displays workflow runs triggered by the current landing request.
- Each run shows: workflow name, trigger action (e.g., "Triggered by landing_request.opened"), status badge (queued/running/success/failure/cancelled), duration, and link to full run detail.
- Status checks update in real-time via SSE when a workflow run changes status.
- A summary status indicator appears in the landing request header: ✅ All checks passed, ❌ Checks failed, ⏳ Checks pending, or ⚪ No checks.

**Workflow Runs List:**
- Runs triggered by landing request events display the trigger source as "Landing Request #N (action)" in the trigger column.
- Clicking the trigger links back to the landing request detail view.

**Workflow Run Detail:**
- The run detail view shows the trigger metadata: event type `landing_request`, action, target bookmark, change ID, and a link back to the source landing request.

### CLI Command

No new CLI commands are introduced. Existing commands surface landing-request-triggered workflow runs:

- `codeplane land checks <number>` — already shows commit status checks; now also shows workflow runs triggered by landing request events for this LR.
- `codeplane workflow run list --repo OWNER/REPO` — lists runs, including those with trigger event `landing_request`.
- `codeplane workflow run view <run-id>` — shows run detail, including trigger metadata referencing the landing request.

**Example output of `land checks`:**

```
Landing Request #42 — Checks

  ✅  ci-on-landing-request    triggered by landing_request.opened    2m 14s
  ⏳  deploy-preview           triggered by landing_request.opened    running
  ✅  ci-on-landing-request    triggered by landing_request.synchronize    1m 48s
```

### TUI UI

**Landing Detail — Checks Tab:**
- Shows the same information as the web UI checks tab, formatted for the terminal.
- Status badges use terminal color codes: green for success, red for failure, yellow for running/queued.
- Keyboard shortcut `c` navigates to the checks tab from the landing detail view.

**Workflow Runs Screen:**
- Runs triggered by landing request events appear in the runs list with the trigger type shown.

### Editor Integrations (VS Code / Neovim)

**VS Code — Landings Panel:**
- Landing request tree items show a status icon derived from the aggregate check status of triggered workflow runs.
- Hovering shows a tooltip with the check summary.

**Neovim — Landings Command:**
- `:Codeplane landings view <number>` output includes a "Checks" section showing triggered workflow run statuses.

### Documentation

The following end-user documentation should be written:

1. **Workflow Triggers Reference — Landing Request section**: Document the `landing_request` trigger type, available event actions (`opened`, `closed`, `synchronize`, `ready_to_land`, `landed`), configuration examples in both TypeScript SDK and JSON format, and the behavior of wildcard (no `types` filter) vs. selective matching.

2. **Workflow Authoring Guide — CI for Landing Requests**: A tutorial showing how to set up a basic CI workflow that runs tests on every opened and synchronized landing request, with an example workflow definition using `on.landingRequest.opened()` and `on.landingRequest.synchronize()`.

3. **Landing Request Guide — Automated Checks section**: Document how landing request events trigger workflows, how to view triggered workflow run statuses on the checks tab, and how check results influence landing readiness.

4. **Workflow Triggers Reference — Event Payload section**: Document the `TriggerEvent` payload fields for landing request events (`type`, `ref`, `commitSHA`, `changeID`, `action`) so workflow authors can reference these values in their workflow steps.

## Permissions & Security

### Authorization

| Action | Required Role | Notes |
|--------|--------------|-------|
| **Creating/updating/closing a landing request** (which triggers workflow dispatch) | Repository Write or higher | Same permissions as existing landing request operations. The workflow dispatch inherits the actor's identity. |
| **Landing a landing request** (which triggers `landed` event) | Repository Write + all protected bookmark requirements met | Same as existing land operation. |
| **Viewing triggered workflow runs** | Repository Read or higher | Follows existing workflow run visibility rules. |
| **Authoring workflow definitions with `landing_request` triggers** | Repository Admin or Workflow Write | Same as existing workflow definition management. |

### Key Security Constraints

- The workflow dispatch runs under the identity of the user who performed the landing request action, not a system identity. This ensures audit trails are accurate.
- Workflow runs triggered by landing request events have the same secret access scope as any other workflow run for that repository — repository secrets and variables are available; user secrets are not.
- The landing request's change IDs and commit SHAs are passed to the workflow engine; these are already visible to anyone with Read access to the repository.
- No PII is exposed beyond what is already accessible through the repository's existing permission model.

### Rate Limiting

- Workflow dispatch for landing request events is subject to the same per-repository workflow dispatch rate limit as other trigger types.
- A single landing request event can trigger at most 100 workflow runs (capped by the broadcast dispatch page size).
- If a user rapidly creates and closes landing requests in a loop (potential abuse vector), the existing repository-level rate limiting on landing request creation (`POST /api/repos/:owner/:repo/landings`) and updates (`PATCH`) provides the primary protection.
- No additional rate limits specific to this trigger type are needed; existing workflow dispatch and landing request operation rate limits are sufficient.

## Telemetry & Product Analytics

### Business Events

| Event Name | Fires When | Properties |
|------------|-----------|------------|
| `WorkflowTriggeredByLandingRequest` | A workflow run is created due to a landing request event | `repository_id`, `workflow_definition_id`, `workflow_run_id`, `landing_request_number`, `trigger_action` (`opened`/`closed`/`synchronize`/`ready_to_land`/`landed`), `actor_user_id`, `target_bookmark`, `stack_size`, `timestamp` |
| `LandingRequestWorkflowDispatchSkipped` | A landing request event was dispatched but no workflows matched | `repository_id`, `landing_request_number`, `trigger_action`, `active_definition_count`, `timestamp` |
| `LandingRequestWorkflowDispatchFailed` | The workflow dispatch call failed (service error) | `repository_id`, `landing_request_number`, `trigger_action`, `error_message`, `timestamp` |

### Funnel Metrics

| Metric | What it tells us |
|--------|------------------|
| **Landing request events dispatched / day** | Volume of trigger-eligible events flowing through the system. |
| **Workflow runs created per landing request event** | Average fan-out ratio — how many workflows respond to each event. Healthy range: 1–5. |
| **% of repositories with ≥1 active `landing_request` trigger** | Adoption rate of the feature. |
| **Trigger action distribution** | Which actions (`opened`, `synchronize`, etc.) are most commonly used. Expect `opened` + `synchronize` to dominate. |
| **Time from LR event → first workflow run queued** | Dispatch latency. Target: < 500ms p99. |
| **% of landing requests with at least one triggered workflow run** | Feature engagement rate — how many LRs actually trigger automation. |

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Landing request workflow dispatch started | `info` | `repository_id`, `landing_request_number`, `trigger_action`, `actor_user_id` | Before evaluating workflow definitions |
| Workflow definition matched | `debug` | `repository_id`, `landing_request_number`, `trigger_action`, `workflow_definition_id`, `workflow_name` | When a definition's trigger matches |
| Workflow run created from LR event | `info` | `repository_id`, `landing_request_number`, `trigger_action`, `workflow_run_id`, `workflow_name` | After run is created |
| No definitions matched | `debug` | `repository_id`, `landing_request_number`, `trigger_action`, `checked_definition_count` | When broadcast dispatch finds zero matches |
| Dispatch failed | `warn` | `repository_id`, `landing_request_number`, `trigger_action`, `error` | When `dispatchForEvent` returns an error |
| Dispatch skipped (no active defs) | `debug` | `repository_id`, `landing_request_number` | When repository has zero active definitions |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_landing_request_dispatch_total` | Counter | `repository_id`, `action`, `status` (`success`, `error`, `no_match`) | Total landing request event dispatch attempts |
| `codeplane_workflow_landing_request_runs_created_total` | Counter | `repository_id`, `action` | Total workflow runs created from LR events |
| `codeplane_workflow_landing_request_dispatch_duration_seconds` | Histogram | `action` | Time to evaluate definitions and create runs |
| `codeplane_workflow_landing_request_definitions_evaluated` | Histogram | `action` | Number of definitions checked per dispatch |

### Alerts & Runbooks

**Alert: `LandingRequestWorkflowDispatchErrorRate`**
- **Condition**: `rate(codeplane_workflow_landing_request_dispatch_total{status="error"}[5m]) / rate(codeplane_workflow_landing_request_dispatch_total[5m]) > 0.05` (more than 5% of dispatches failing)
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_workflow_landing_request_dispatch_total{status="error"}` to confirm the error volume.
  2. Search structured logs for `msg="Dispatch failed"` with the relevant `repository_id` values.
  3. Common causes: database connection pool exhaustion (check DB connection metrics), workflow definition config parsing errors (check for malformed JSON in recently updated definitions), or OOM in the workflow service.
  4. If isolated to one repository, inspect that repository's workflow definitions for malformed configs.
  5. If systemic, check database health and restart the workflow service if necessary.

**Alert: `LandingRequestWorkflowDispatchLatencyHigh`**
- **Condition**: `histogram_quantile(0.99, rate(codeplane_workflow_landing_request_dispatch_duration_seconds_bucket[5m])) > 2` (p99 latency above 2 seconds)
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_workflow_landing_request_definitions_evaluated` — a spike in definitions per dispatch may indicate a repository with an unusually high number of workflow definitions.
  2. Check database query latency for `listWorkflowDefinitionsByRepo` and `createWorkflowRun`.
  3. If a single repository is responsible, consider whether it has excessive definitions and contact the repository admin.
  4. If systemic, investigate database connection pooling, indexing, and overall server load.

**Alert: `LandingRequestWorkflowDispatchStalled`**
- **Condition**: `increase(codeplane_workflow_landing_request_dispatch_total[30m]) == 0` AND `increase(codeplane_landing_request_state_change_total[30m]) > 0` (landing requests are changing state but no dispatches are occurring)
- **Severity**: Critical
- **Runbook**:
  1. This indicates the dispatch call site is not being reached during landing request state transitions.
  2. Check recent deployments for regressions in the landing request route handlers or service layer.
  3. Verify the workflow service is initialized in the service registry.
  4. Check server logs for panics or unhandled exceptions in the landing request handlers.
  5. If the workflow service is down, restart it. If the dispatch call is missing, this is a code regression — roll back to the last known good deploy.

### Error Cases and Failure Modes

| Error Case | Behavior | Recovery |
|------------|----------|----------|
| Workflow service unavailable | Landing request operation succeeds; dispatch failure logged as `warn` | Automatic — dispatch is fire-and-forget |
| Database connection error during definition lookup | Dispatch fails; logged as `warn` | Automatic on transient errors; DB restart for persistent issues |
| Malformed workflow definition config (unparseable JSON) | That definition is skipped; `matchTrigger` returns `false` | Admin fixes the definition; no run is created for that definition |
| Race condition: LR deleted between event and dispatch | `dispatchForEvent` may reference a non-existent LR; runs are created but may fail at execution time | Runs fail gracefully; no data corruption |
| Workflow run creation fails (e.g., duplicate run key) | Individual run creation error is logged; other matching definitions still produce runs | Automatic retry on next event; or manual dispatch |

## Verification

### API Integration Tests

- [ ] **LR created → `opened` event dispatched**: Create a landing request via `POST /api/repos/:owner/:repo/landings` with state `open`. Verify a workflow run is created for a workflow with `on: { landing_request: { types: ["opened"] } }`.
- [ ] **LR created in draft → no event dispatched**: Create a landing request with state `draft`. Verify no workflow run is created for a workflow with `on: { landing_request: { types: ["opened"] } }`.
- [ ] **LR draft → open → `opened` event dispatched**: Create a landing request in `draft` state, then `PATCH` to `open`. Verify the `opened` event fires.
- [ ] **LR closed → `closed` event dispatched**: Create an open LR, then `PATCH` state to `closed`. Verify a workflow run is created for a workflow with `on: { landing_request: { types: ["closed"] } }`.
- [ ] **LR reopened → `opened` event dispatched**: Create an open LR, close it, then reopen it. Verify `opened` fires on reopen.
- [ ] **LR changes updated → `synchronize` event dispatched**: Create an open LR, then push new changes to it. Verify the `synchronize` event fires.
- [ ] **LR landed → `landed` event dispatched**: Create an open LR, then `PUT /api/repos/:owner/:repo/landings/:number/land`. Verify the `landed` event fires after successful merge.
- [ ] **LR ready to land → `ready_to_land` event dispatched**: Create an open LR with required approvals configured on the target bookmark, then submit the required number of approving reviews. Verify `ready_to_land` fires.
- [ ] **Wildcard trigger (no types) matches all actions**: Create a workflow with `on: { landing_request: {} }`. Verify it triggers on `opened`, `closed`, `synchronize`, `ready_to_land`, and `landed` actions.
- [ ] **Selective trigger only matches specified types**: Create a workflow with `on: { landing_request: { types: ["opened"] } }`. Create an LR (triggers run), then close it (does NOT trigger a run).
- [ ] **Case-insensitive action matching**: Create a workflow with `on: { landing_request: { types: ["Opened"] } }`. Verify it matches an `opened` event.
- [ ] **Multiple workflows triggered by same event**: Create two active workflows both with `on: { landing_request: { types: ["opened"] } }`. Create an LR. Verify two separate workflow runs are created.
- [ ] **Inactive workflow not triggered**: Create a workflow with `on: { landing_request: { types: ["opened"] } }` and mark it inactive. Create an LR. Verify no run is created.
- [ ] **No matching workflows → no runs created**: Create an LR in a repository with no workflow definitions. Verify no error and no runs.
- [ ] **Unknown action type in config → no match**: Create a workflow with `on: { landing_request: { types: ["invalid_action"] } }`. Create an LR. Verify no run is created.
- [ ] **Dispatch failure does not block LR operation**: Simulate a workflow service error during dispatch. Verify the LR creation still succeeds (returns 201).
- [ ] **Trigger event payload contains correct fields**: Create an LR that triggers a workflow. Verify the created run's `trigger_event` is `landing_request`, `trigger_ref` is the target bookmark, `trigger_commit_sha` is the head change's commit SHA.
- [ ] **Run appears in LR checks endpoint**: Create an LR that triggers a workflow. Verify `GET /api/repos/:owner/:repo/landings/:number/checks` includes the triggered run.
- [ ] **Rapid close/reopen creates separate runs**: Open an LR, close it, reopen it. Verify three separate runs are created for a wildcard trigger (opened, closed, opened).
- [ ] **Empty change stack still triggers events**: Create an LR with an empty change stack (if API allows). Verify state transition events still fire.
- [ ] **Maximum 100 definitions evaluated**: Create 101 active workflow definitions with landing request triggers. Create an LR. Verify that exactly 100 definitions are evaluated (matching the broadcast dispatch page size).

### CLI Integration Tests

- [ ] **`land checks` shows triggered runs**: Create an LR that triggers a workflow. Run `codeplane land checks <number>`. Verify the output includes the triggered workflow run with its name, trigger action, and status.
- [ ] **`workflow run list` shows LR-triggered runs**: Create an LR that triggers a workflow. Run `codeplane workflow run list`. Verify the output includes the run with trigger event `landing_request`.
- [ ] **`workflow run view` shows LR trigger metadata**: View a run triggered by a landing request event. Verify the output shows the trigger event type, action, and landing request reference.
- [ ] **`land create` triggers workflows end-to-end**: Run `codeplane land create --title "Test" --change <id>`. Verify a workflow run appears in `codeplane land checks`.

### Web UI (Playwright) E2E Tests

- [ ] **Landing request detail — checks tab shows triggered runs**: Navigate to an LR detail page. Verify the checks tab displays workflow runs triggered by the LR's events.
- [ ] **Check status badge on LR header**: Create an LR that triggers a successful workflow. Verify the LR header shows a green check indicator.
- [ ] **Check status badge updates in real-time**: Create an LR that triggers a workflow. Observe the checks tab. Verify the status updates from "queued" to "running" to "success" without page refresh.
- [ ] **Workflow runs list — trigger column shows LR source**: Navigate to the workflow runs page. Verify that LR-triggered runs show "Landing Request #N" as the trigger source.
- [ ] **Workflow run detail — trigger metadata links to LR**: Click into a run triggered by an LR event. Verify the trigger metadata section shows the LR number and links back to the LR detail page.
- [ ] **No checks tab content for LR with no triggered workflows**: View an LR in a repository with no workflows. Verify the checks tab shows an empty state message.

### Workflow SDK / Trigger Builder Tests

- [ ] **`on.landingRequest.opened()` produces correct descriptor**: Verify output is `{ _type: "landing_request", event: "opened" }`.
- [ ] **`on.landingRequest.closed()` produces correct descriptor**: Verify output is `{ _type: "landing_request", event: "closed" }`.
- [ ] **`on.landingRequest.synchronize()` produces correct descriptor**: Verify output is `{ _type: "landing_request", event: "synchronize" }`.
- [ ] **`on.landingRequest.readyToLand()` produces correct descriptor**: Verify output is `{ _type: "landing_request", event: "ready_to_land" }`.
- [ ] **`on.landingRequest.landed()` produces correct descriptor**: Verify output is `{ _type: "landing_request", event: "landed" }`.
- [ ] **Rendered workflow config matches expected JSON shape**: Render a workflow with `on.landingRequest.opened()` and `on.landingRequest.synchronize()`. Verify the JSON config contains `{ on: { landing_request: { types: ["opened", "synchronize"] } } }`.

### Trigger Matching Logic Tests

- [ ] **`matchTrigger` returns `true` for matching landing request event**: Config `{ on: { landing_request: { types: ["opened"] } } }`, event `{ type: "landing_request", action: "opened", ref: "main", commitSHA: "abc" }`. Expect `true`.
- [ ] **`matchTrigger` returns `false` for non-matching action**: Config `{ on: { landing_request: { types: ["opened"] } } }`, event `{ type: "landing_request", action: "closed", ref: "main", commitSHA: "abc" }`. Expect `false`.
- [ ] **`matchTrigger` returns `true` for wildcard (no types)**: Config `{ on: { landing_request: {} } }`, event `{ type: "landing_request", action: "synchronize", ref: "main", commitSHA: "abc" }`. Expect `true`.
- [ ] **`matchTrigger` returns `true` for empty types array**: Config `{ on: { landing_request: { types: [] } } }`, event `{ type: "landing_request", action: "landed", ref: "main", commitSHA: "abc" }`. Expect `true`.
- [ ] **`matchTrigger` returns `false` when no `landing_request` key in config**: Config `{ on: { push: {} } }`, event `{ type: "landing_request", action: "opened", ref: "main", commitSHA: "abc" }`. Expect `false`.
- [ ] **`matchTrigger` case-insensitive matching**: Config `{ on: { landing_request: { types: ["OPENED"] } } }`, event `{ type: "landing_request", action: "opened", ref: "main", commitSHA: "abc" }`. Expect `true`.
- [ ] **`matchTrigger` with multiple types**: Config `{ on: { landing_request: { types: ["opened", "synchronize", "ready_to_land"] } } }`. Test each matching action returns `true` and non-matching actions (`closed`, `landed`) return `false`.
- [ ] **`matchTrigger` with malformed config JSON string**: Config `"not valid json"`, any event. Expect `false` (no crash).
- [ ] **`matchTrigger` with null config**: Config `null`, any event. Expect `false`.
- [ ] **`matchTrigger` with config missing `on` key**: Config `{ jobs: {} }`, any event. Expect `false`.
- [ ] **`matchTrigger` handles maximum types array (all 5 types)**: Config `{ on: { landing_request: { types: ["opened", "closed", "synchronize", "ready_to_land", "landed"] } } }`. Verify all 5 actions match.
- [ ] **`matchTrigger` with extra unknown types**: Config `{ on: { landing_request: { types: ["opened", "merged", "deleted"] } } }`. Verify `opened` matches and `merged`/`deleted` events (if sent) do not crash.
