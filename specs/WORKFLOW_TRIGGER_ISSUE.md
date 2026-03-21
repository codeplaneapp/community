# WORKFLOW_TRIGGER_ISSUE

Specification for WORKFLOW_TRIGGER_ISSUE.

## High-Level User POV

When a user creates, edits, closes, reopens, labels, or assigns an issue in Codeplane, any workflow that has been configured to listen for that specific issue activity will automatically run. This allows teams to build powerful automation that reacts to their issue tracker — for example, automatically triaging new issues, notifying external systems when issues are labeled "critical," spinning up workspaces when an issue is assigned, or running compliance checks when an issue is closed.

From the workflow author's perspective, enabling issue-driven automation is as simple as adding an `on.issue` trigger to their workflow definition file. The trigger supports filtering by specific activity types — such as only firing when an issue is opened or only when a label is added — so that teams get precise control over when their workflows run. If no specific activity types are listed, the workflow fires on any issue activity.

From the day-to-day user's perspective, this feature is invisible until they look at a workflow run and see that it was triggered by an issue event. The run detail surfaces show which issue event caused the run, what action occurred (e.g., "opened," "labeled"), and link back to the issue that triggered it. Users do not need to configure anything beyond the workflow file itself — the Codeplane platform detects issue events and evaluates all active workflow definitions in the repository automatically.

This feature also supports agent-driven workflows. When an agent creates or modifies an issue via the API, the same trigger evaluation occurs. This enables fully automated loops where an agent opens an issue, a workflow reacts to it, and downstream automation handles triage, assignment, or resolution without human intervention.

## Acceptance Criteria

- When an issue is created in a repository, all active workflow definitions in that repository with an `on.issue` trigger that includes `"opened"` (or has no `types` filter) must be evaluated and matching workflows must produce new runs.
- When an issue is closed, all matching workflows with `on.issue` trigger including `"closed"` must fire.
- When a closed issue is reopened, all matching workflows with `on.issue` trigger including `"reopened"` must fire.
- When an issue's title or body is edited, all matching workflows with `on.issue` trigger including `"edited"` must fire.
- When a label is added to or removed from an issue, all matching workflows with `on.issue` trigger including `"labeled"` must fire.
- When an assignee is added to or removed from an issue, all matching workflows with `on.issue` trigger including `"assigned"` must fire.
- If a workflow's `on.issue` trigger specifies no `types` array, the workflow must fire on every issue activity type (opened, closed, reopened, edited, labeled, assigned).
- If a workflow's `on.issue` trigger specifies a `types` array, only the listed activity types must cause the workflow to fire. Activity types not in the list must not trigger a run.
- Activity type matching must be case-insensitive (e.g., `"Opened"` matches an `"opened"` event).
- Multiple workflow definitions in the same repository may each have independent `on.issue` triggers; all matching definitions must produce independent runs.
- A single issue mutation that causes multiple activities (e.g., creating an issue that also sets labels and assignees) must fire the `"opened"` trigger event. Label and assignee assignments as part of creation are considered part of the `"opened"` action, not separate `"labeled"` and `"assigned"` events.
- When an existing issue is updated and both state and labels change in the same PATCH request, the state-change event (e.g., `"closed"`) fires first. The label change fires as a separate `"labeled"` event if labels were modified as a distinct operation.
- Workflow runs created by issue triggers must record `trigger_event` as `"issue"` and `trigger_ref` as the repository's default bookmark.
- The `trigger_commit_sha` for issue-triggered runs must be set to the HEAD commit of the repository's default bookmark at the time of the event, or an empty string if the repository has no commits.
- Trigger evaluation must be gated behind the `WORKFLOW_TRIGGER_ISSUE` feature flag. If the flag is disabled, issue events must not produce workflow runs even if workflow definitions contain `on.issue` triggers.
- Trigger evaluation must happen asynchronously. The issue API response must not be delayed by workflow dispatch processing.
- If no active workflow definitions match an issue event, no runs are created and no error is reported.
- If workflow dispatch fails for one definition (e.g., invalid config), other matching definitions must still produce runs independently.
- The `on.issue` and `on.issues` keys in workflow configs must be treated as equivalent (normalized to `issue`).
- Activity types in the `types` array must be limited to the set: `opened`, `closed`, `reopened`, `edited`, `labeled`, `assigned`. Any other value in the types array must be ignored during matching.
- The maximum number of workflow runs that a single issue event can create is bounded by the number of active workflow definitions in the repository (no artificial cap beyond that).
- A workflow that is marked as inactive (`is_active = false`) must not be evaluated for issue triggers.
- Issue events triggered by API calls, CLI commands, TUI actions, web UI actions, and agent operations must all produce the same trigger behavior.
- Webhook deliveries for issue events and workflow trigger evaluation for issue events must both fire from the same issue mutation. They are independent systems that react to the same event.

## Design

### Workflow Definition Authoring (TypeScript)

Workflow authors configure issue triggers using the `on.issue` builder in their `.codeplane/workflows/*.ts` definition files:

```typescript
import { on } from "@codeplane/workflow";

export default {
  on: [
    on.issue.opened(),
    on.issue.closed(),
    on.issue.labeled(),
  ],
  jobs: {
    triage: {
      "runs-on": "default",
      steps: [
        { run: "echo 'Issue event received'" },
      ],
    },
  },
};
```

The following activity type builders are available:
- `on.issue.opened()` — new issue created
- `on.issue.closed()` — issue closed
- `on.issue.reopened()` — issue reopened from closed state
- `on.issue.edited()` — issue title or body changed
- `on.issue.labeled()` — label added to or removed from an issue
- `on.issue.assigned()` — assignee added to or removed from an issue

### Rendered Workflow Config Shape (JSON)

The workflow renderer produces JSON consumed by the trigger matching engine:

```json
{
  "on": {
    "issue": {
      "types": ["opened", "labeled"]
    }
  }
}
```

Or for all activity types (no types filter):

```json
{
  "on": {
    "issue": {}
  }
}
```

Both `"issue"` and `"issues"` keys are accepted and normalized.

### API Shape

No new API endpoints are introduced. Issue triggers fire as a side effect of existing issue mutation endpoints:

- `POST /api/repos/:owner/:repo/issues` — fires `action: "opened"`
- `PATCH /api/repos/:owner/:repo/issues/:number` — fires `action: "edited"`, `"closed"`, `"reopened"`, `"labeled"`, and/or `"assigned"` depending on what changed

Workflow runs from issue triggers appear in the standard run list and detail endpoints with `trigger_event: "issue"`.

### SDK Shape

The `@codeplane/workflow` package already exports `on.issue` builders. The `@codeplane/sdk` workflow service already has `matchTrigger` and `dispatchForEvent` support for issue events. The missing piece is calling `dispatchForEvent` from the issue service after mutations.

### Web UI Design

**Workflow Run List:** Runs triggered by issues display `issue` in the trigger event column with the default bookmark as the trigger ref.

**Workflow Run Detail:** The header shows trigger type `issue` with a badge for the action (e.g., "opened", "labeled").

**Workflow Definition View:** The `on.issue` trigger section displays configured activity types. If no types are specified, shows "All issue events."

### CLI Command

No new CLI commands are required. `codeplane run list` and `codeplane run view` surface issue-triggered runs. `codeplane issue create` and `codeplane issue edit` trigger workflows as a side effect.

### TUI UI

The TUI workflow run list screen displays issue-triggered runs with trigger event `issue`. No new screens needed.

### Documentation

1. **Workflow Triggers Reference — Issue Events:** Document the `on.issue` trigger, all supported activity types, matching behavior, and example definitions.
2. **Cookbook: Auto-triage on issue creation:** Show a workflow using `on.issue.opened()` to run a triage script or agent task.
3. **Cookbook: Notify external systems on issue close:** Show a workflow using `on.issue.closed()` to post to an external webhook.
4. **Workflow Runs docs update:** Explain that runs may be triggered by issue events and how to identify them.

## Permissions & Security

### Authorization

- **Trigger evaluation** requires no special permission from the user who performed the issue action. The trigger fires based on the issue event occurring in a repository.
- **Workflow authoring** (adding `on.issue` to a workflow file) requires write access to the repository.
- **Viewing workflow runs** triggered by issues requires repository read access.
- **Canceling, rerunning, or resuming** issue-triggered runs requires repository write access.
- Anonymous users and read-only users can view issue-triggered runs if they have read access. They cannot trigger runs because they cannot create or edit issues (write access required).

### Rate Limiting

- Issue trigger evaluation shares rate limiting with the underlying issue mutation endpoints.
- A maximum of 50 workflow definitions per repository are evaluated per trigger event to prevent unbounded run creation.
- Workflow runs created by issue triggers count toward the repository's workflow run quota.

### Data Privacy

- Issue trigger event payloads contain only event type, action, ref, and commit SHA — no issue body, title, or author PII.
- Workflow run logs may contain issue data if workflow steps read the issue via API, but this is governed by the workflow author's code.
- The triggering issue is not stored as a first-class field on the run record.

## Telemetry & Product Analytics

### Business Events

1. **`workflow.trigger.issue.evaluated`** — Fired each time an issue event is evaluated against workflow definitions.
   - Properties: `repository_id`, `action` (opened/closed/reopened/edited/labeled/assigned), `definitions_checked`, `definitions_matched`, `trigger_source` (api/cli/web/tui/agent)

2. **`workflow.trigger.issue.run_created`** — Fired for each workflow run created by an issue trigger.
   - Properties: `repository_id`, `workflow_definition_id`, `workflow_run_id`, `action`, `trigger_source`

3. **`workflow.trigger.issue.no_match`** — Fired when an issue event matches no workflow definitions.
   - Properties: `repository_id`, `action`, `definitions_checked`

### Funnel Metrics & Success Indicators

- **Adoption rate:** Percentage of repositories with at least one active workflow containing an `on.issue` trigger.
- **Trigger-to-run conversion rate:** Ratio of evaluated events where `definitions_matched > 0` to total evaluated events.
- **Action type distribution:** Breakdown of which issue actions are most commonly used as triggers.
- **Runs per trigger:** Average runs created per issue event that matches at least one definition.
- **Latency p50/p95:** Time from issue mutation API response to first workflow run reaching `queued` status.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|---|---|---|
| Issue event dispatched to trigger evaluator | `info` | `repository_id`, `action`, `issue_number`, `actor_id`, `feature_flag_enabled` |
| Feature flag disabled, skipping evaluation | `debug` | `repository_id`, `action` |
| Workflow definitions loaded for evaluation | `debug` | `repository_id`, `definitions_count` |
| Trigger matched workflow definition | `info` | `repository_id`, `workflow_definition_id`, `workflow_name`, `action` |
| No definitions matched | `debug` | `repository_id`, `action`, `definitions_checked` |
| Workflow run created from issue trigger | `info` | `repository_id`, `workflow_definition_id`, `workflow_run_id`, `action` |
| Evaluation failed for a definition (bad config) | `warn` | `repository_id`, `workflow_definition_id`, `error_message` |
| Trigger dispatch error (unexpected) | `error` | `repository_id`, `action`, `error_message`, `stack_trace` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_workflow_trigger_issue_events_total` | Counter | `action`, `repository_id` | Total issue events dispatched for evaluation |
| `codeplane_workflow_trigger_issue_runs_created_total` | Counter | `action`, `repository_id` | Workflow runs created by issue triggers |
| `codeplane_workflow_trigger_issue_no_match_total` | Counter | `action` | Events matching no definitions |
| `codeplane_workflow_trigger_issue_evaluation_duration_seconds` | Histogram | `action` | Time to evaluate all definitions for one event |
| `codeplane_workflow_trigger_issue_errors_total` | Counter | `error_type` | Errors during evaluation |
| `codeplane_workflow_trigger_issue_definitions_evaluated` | Histogram | — | Definitions evaluated per event |

### Alerts

#### `WorkflowIssueTriggerHighErrorRate`
- **Condition:** `rate(codeplane_workflow_trigger_issue_errors_total[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:** (1) Check logs for `trigger dispatch error` and `trigger evaluation failed` entries. (2) If `bad_config`, identify the offending definitions — user-authored config issues. (3) If `dispatch_failure`, check DB connectivity and workflow run creation path via `/health`. (4) If `unexpected`, examine stack traces, restart if needed, escalate to workflow team.

#### `WorkflowIssueTriggerEvaluationLatencyHigh`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_workflow_trigger_issue_evaluation_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning
- **Runbook:** (1) Check definitions_evaluated histogram for repos with many definitions. (2) Verify DB query performance for loading definitions. (3) Check if a single repo has hundreds of definitions. (4) Check server CPU/memory.

#### `WorkflowIssueTriggerZeroEventsAnomaly`
- **Condition:** `sum(rate(codeplane_workflow_trigger_issue_events_total[1h])) == 0` for > 2h during business hours when issues are being created.
- **Severity:** Critical
- **Runbook:** (1) Check if feature flag is disabled. (2) Verify issue service calls trigger dispatch — check recent deployments. (3) Check workflow service initialization. (4) Test manually by creating an issue in a repo with an `on.issue` workflow.

### Error Cases and Failure Modes

| Error Case | Behavior | Severity |
|---|---|---|
| Invalid JSON in workflow config | Skip definition, log warning, continue | Warn |
| `dispatchForEvent` throws for one definition | Log error, continue with remaining | Error |
| No active definitions in repo | No evaluation, debug log only | Debug |
| Feature flag disabled | Skip all evaluation, debug log | Debug |
| Database unavailable during definition loading | Trigger evaluation fails; issue mutation still succeeds | Error |
| HEAD commit unresolvable | Use empty string for `trigger_commit_sha` | Warn |

## Verification

### API Integration Tests

1. **Issue created triggers matching workflow run** — Create repo, workflow with `on.issue: { types: ["opened"] }`, create issue, verify run created with `trigger_event: "issue"`.
2. **Issue closed triggers matching workflow run** — Workflow with `types: ["closed"]`, close issue, verify run.
3. **Issue reopened triggers matching workflow run** — Workflow with `types: ["reopened"]`, close then reopen issue, verify run.
4. **Issue edited triggers matching workflow run** — Workflow with `types: ["edited"]`, edit title, verify run.
5. **Issue labeled triggers matching workflow run** — Workflow with `types: ["labeled"]`, add label, verify run.
6. **Issue assigned triggers matching workflow run** — Workflow with `types: ["assigned"]`, assign user, verify run.
7. **Unmatched activity type does not trigger run** — Workflow with `types: ["closed"]`, create issue, verify no run.
8. **No types filter matches all activity types** — Workflow with `on.issue: {}`, create and close issue, verify two runs.
9. **Multiple definitions produce independent runs** — Two workflows with `types: ["opened"]`, create issue, verify two runs.
10. **Inactive definition is not evaluated** — Inactive workflow, create issue, verify no run.
11. **Case-insensitive activity type matching** — Workflow with `types: ["OPENED"]`, create issue, verify run.
12. **`on.issues` treated as `on.issue`** — Config with `"issues"` key, create issue, verify run.
13. **Feature flag disabled prevents triggers** — Disable flag, create issue, verify no run.
14. **Issue trigger and webhook dispatch both fire** — Webhook + workflow, create issue, verify both delivery and run.
15. **Run records correct trigger metadata** — Verify `trigger_event`, `trigger_ref`, `trigger_commit_sha`.
16. **Issue from API and CLI both trigger** — Create issues via both, verify runs for each.
17. **Invalid config doesn't prevent other definitions** — One valid + one malformed, create issue, valid one runs.
18. **Repo with no definitions doesn't error** — Create issue in empty repo, verify success.
19. **Repo with only push trigger doesn't fire on issues** — Push-only workflow, create issue, no run.
20. **Rapid sequential mutations each produce runs** — 5 issues in succession, 5 runs created.

### CLI E2E Tests

21. **`codeplane issue create` triggers run visible in `codeplane run list`** — Verify run with trigger `issue` in list.
22. **`codeplane issue edit --state closed` triggers run** — Verify run after closing.
23. **`codeplane run view` shows issue trigger details** — Verify `trigger_event: "issue"` in JSON output.

### Playwright (Web UI) E2E Tests

24. **Creating issue from web UI produces workflow run** — Create issue, navigate to runs, verify.
25. **Run detail page shows issue trigger info** — Verify trigger section.
26. **Definition view shows issue trigger config** — Verify types displayed.
27. **Closing issue from UI triggers run** — Close issue, verify run.

### Boundary and Edge Case Tests

28. **All 6 types specified works correctly** — All types in array, verify fires on opened, closed, reopened.
29. **Empty types array matches all** — `types: []`, create issue, verify run.
30. **Unrecognized type is ignored** — `types: ["opened", "deleted"]`, create issue, verify fires on opened.
31. **Issue creation with labels fires only `opened`** — Workflow A on opened, B on labeled, create issue with labels, only A fires.
32. **Trigger evaluation is async (non-blocking)** — Measure API response time with/without workflows, verify <100ms difference.
