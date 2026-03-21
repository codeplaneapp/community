# WORKFLOW_TRIGGER_ISSUE_COMMENT

Specification for WORKFLOW_TRIGGER_ISSUE_COMMENT.

## High-Level User POV

When a team is collaborating on issues in Codeplane, it is often valuable for automated workflows to react to the conversation happening inside those issues. The Issue Comment workflow trigger allows repository maintainers to define workflows that automatically run whenever a comment is created, edited, or deleted on any issue in their repository.

A developer authoring a workflow can declare that it should fire on issue comment activity using the `on.issueComment.created()`, `on.issueComment.edited()`, or `on.issueComment.deleted()` trigger builders, or equivalently through `on.issue.commented()` as a convenience alias for new comments. Once configured and active, Codeplane evaluates every issue comment event against all active workflow definitions in the repository. Any workflow whose trigger configuration matches the event type and action is automatically dispatched as a new workflow run.

This enables a wide range of automation scenarios: triaging new comments with AI-powered sentiment analysis, auto-assigning issues when a maintainer comments, notifying external systems when discussion activity happens, triggering code generation agents when a specific command-style comment is posted (e.g., `/fix`, `/deploy`), running compliance checks when issue discussions are modified, or cleaning up resources when comments are removed.

The trigger seamlessly integrates with the existing workflow ecosystem. Triggered runs appear in the repository's workflow run list alongside manually dispatched and push-triggered runs. Each run records the trigger event type as `issue_comment` and the specific action (`created`, `edited`, or `deleted`) so that operators can filter, audit, and debug comment-triggered runs with full context. The experience is consistent across the web UI, CLI, TUI, and editor integrations — anywhere a user can view workflow runs, they can see runs triggered by issue comments and understand which event caused them.

Users who do not define any `issue_comment` triggers in their workflow definitions experience no change. The trigger evaluation is a lightweight, zero-cost path when no workflows match the event.

## Acceptance Criteria

### Definition of Done

- [ ] When an issue comment is created, Codeplane evaluates all active workflow definitions in the repository for matching `issue_comment` triggers with `types` including `created` (or empty/unset `types` to match all actions).
- [ ] When an issue comment is edited, Codeplane evaluates all active workflow definitions for matching `issue_comment` triggers with `types` including `edited` (or empty/unset `types`).
- [ ] When an issue comment is deleted, Codeplane evaluates all active workflow definitions for matching `issue_comment` triggers with `types` including `deleted` (or empty/unset `types`).
- [ ] Matched workflows produce new workflow runs with `trigger_event` set to `"issue_comment"`.
- [ ] The `trigger_ref` for issue-comment-triggered runs is set to the repository's default bookmark (e.g., `"main"`).
- [ ] The `trigger_commit_sha` for issue-comment-triggered runs is set to the HEAD commit SHA of the default bookmark at the time of dispatch.
- [ ] Workflow runs triggered by issue comments are visible in the workflow run list across web UI, CLI, TUI, and editor integrations, with `issue_comment` displayed as the trigger event type.
- [ ] The `on.issueComment.created()`, `on.issueComment.edited()`, and `on.issueComment.deleted()` builder functions produce valid trigger descriptors that serialize correctly into workflow definition configs.
- [ ] The `on.issue.commented()` convenience alias continues to produce an `issue_comment` trigger descriptor with `event: "created"`.
- [ ] Trigger evaluation is skipped for inactive workflow definitions.
- [ ] If no workflows match the `issue_comment` event, no runs are created and no errors are raised.
- [ ] Workflow dispatch failures (e.g., database errors during run creation) do not block or roll back the comment creation/edit/delete operation itself.
- [ ] Trigger dispatch is asynchronous — the issue comment API response is returned to the caller without waiting for workflow runs to complete.

### Edge Cases

- [ ] A workflow definition with `on: { issue_comment: {} }` (empty types array or no types field) matches all issue comment actions (`created`, `edited`, `deleted`).
- [ ] A workflow definition with `on: { issue_comment: { types: ["created"] } }` only matches the `created` action, not `edited` or `deleted`.
- [ ] A workflow definition with `on: { issue_comment: { types: ["Created"] } }` matches case-insensitively (action matching is case-insensitive per the existing `matchesActionTypes` behavior).
- [ ] If a repository has zero active workflow definitions, trigger evaluation completes without error and dispatches nothing.
- [ ] If a repository has 100 active workflow definitions but none include `issue_comment` triggers, all are evaluated and none produce runs.
- [ ] If multiple workflows in the same repository match the same `issue_comment` event, each matching workflow produces its own independent run.
- [ ] If the workflow definition config JSON is malformed or unparseable, that definition is silently skipped during trigger matching (existing `matchTrigger` catch behavior).
- [ ] Comments on closed issues still trigger workflow evaluation — issue state does not gate trigger dispatch.
- [ ] Comments on locked issues still trigger workflow evaluation if the commenter has sufficient permissions to comment.
- [ ] If the repository's default bookmark has no commits (empty repository), the `trigger_commit_sha` is set to an empty string and the run still proceeds.
- [ ] Rapid sequential comments on the same issue each independently trigger workflow evaluation — there is no deduplication or debouncing.

### Boundary Constraints

- [ ] The `action` field in the `TriggerEvent` must be one of: `"created"`, `"edited"`, `"deleted"`. No other action values are valid for the `issue_comment` trigger type.
- [ ] The `types` array in the `IssueCommentTrigger` configuration accepts at most 3 entries (one for each valid action). Duplicate entries are tolerated but redundant.
- [ ] Workflow definition configs larger than 1 MB are rejected at the definition creation boundary, not at the trigger evaluation boundary.
- [ ] Trigger evaluation processes at most 100 workflow definitions per dispatch event (consistent with the existing page size in `dispatchForEvent`).

## Design

### Workflow Authoring API

Workflow authors define issue comment triggers using the `@codeplane/workflow` package's `on` builder:

```tsx
import { on } from "@codeplane/workflow";

// Trigger on any issue comment activity
triggers={[
  on.issueComment.created(),   // When a comment is posted
  on.issueComment.edited(),    // When a comment is modified
  on.issueComment.deleted(),   // When a comment is removed
]}

// Convenience: on.issue.commented() is equivalent to on.issueComment.created()
triggers={[
  on.issue.commented(),
]}
```

Each builder produces an `IssueCommentTriggerDescriptor` with shape `{ _type: "issue_comment", event: "<action>" }`. The workflow renderer serializes this into the JSON config stored in the workflow definition as `{ on: { issue_comment: { types: ["<action>"] } } }`.

### API Shape

No new API endpoints are introduced. The trigger fires as a server-side side effect when existing issue comment endpoints are called:

- `POST /api/repos/:owner/:repo/issues/:number/comments` — dispatches `issue_comment` event with action `created`
- `PATCH /api/repos/:owner/:repo/issues/comments/:id` — dispatches `issue_comment` event with action `edited`
- `DELETE /api/repos/:owner/:repo/issues/comments/:id` — dispatches `issue_comment` event with action `deleted`

The dispatch calls `workflowService.dispatchForEvent()` with a `TriggerEvent`:

```
{
  type: "issue_comment",
  action: "created" | "edited" | "deleted",
  ref: "<default bookmark>",
  commitSHA: "<HEAD of default bookmark>"
}
```

Workflow runs produced by this trigger are returned via the existing workflow run APIs:

- `GET /api/repos/:owner/:repo/workflows/runs` — lists all runs, filterable by status; `issue_comment` runs appear with `trigger_event: "issue_comment"`
- `GET /api/repos/:owner/:repo/workflows/runs/:id` — run detail includes full trigger metadata

### SDK Shape

The `DispatchForEventInput` and `TriggerEvent` interfaces already support issue comment events. The `IssueCommentTrigger` config interface is defined with:

```typescript
interface IssueCommentTrigger {
  types?: string[];  // "created", "edited", "deleted"; empty = match all
}
```

The `matchesOn` function in `packages/sdk/src/services/workflow.ts` already handles the `"issue_comment"` case. The missing piece is the call site: `createIssueComment`, `updateIssueComment`, and `deleteIssueComment` in the `IssueService` must call `workflowService.dispatchForEvent()` after the comment operation succeeds.

### Web UI Design

No new web UI screens or components are required. The trigger integrates with existing surfaces:

**Workflow Run List**: Runs triggered by issue comments appear in the workflow run list with `trigger_event` displayed as `"issue_comment"`. The trigger ref column shows the default bookmark name. The trigger event column should render `"issue_comment"` in a human-readable format (e.g., "Issue Comment" or "issue comment").

**Workflow Run Detail**: The run detail header shows:
- Trigger event: `issue_comment`
- Trigger action: `created`, `edited`, or `deleted`
- Trigger ref: the default bookmark
- Commit SHA: abbreviated 7-character SHA

**Workflow Definition View**: Workflow definitions that include `issue_comment` triggers display the trigger configuration in the definition detail view alongside other trigger types.

### CLI Command

No new CLI commands are required. Existing commands surface issue-comment-triggered runs:

- `codeplane run list` — shows runs with `trigger_event: "issue_comment"` in the output
- `codeplane run view <id>` — displays full trigger metadata including the `issue_comment` event type and action
- `codeplane run logs <id>` — streams logs for issue-comment-triggered runs identically to any other run

### TUI UI

No new TUI screens are required. The existing TUI workflow run list and detail screens already render `trigger_event` values. When a run is triggered by an issue comment:

- **Run List Row**: The trigger event column displays `"issue_comment"` (truncated per responsive breakpoint rules: 12ch standard, 15ch large)
- **Run Detail Header**: Shows the trigger event as `"issue_comment"` alongside ref and SHA

### Documentation

The following documentation updates are required:

1. **Workflow Guide** (`docs/guides/workflows.mdx`): Add an "Issue Comment" subsection under the existing "Issue" trigger section. Provide examples of each action type (`created`, `edited`, `deleted`) and explain the convenience alias `on.issue.commented()`. Include a practical example such as a bot that responds to `/deploy` commands in issue comments.

2. **Trigger Reference**: Document the `IssueCommentTriggerDescriptor` shape, the valid action values, and the behavior when `types` is empty or omitted (matches all actions).

3. **Workflow Run Context**: Document what metadata is available in runs triggered by issue comments — specifically that `trigger_event` is `"issue_comment"`, `trigger_ref` is the default bookmark, and `trigger_commit_sha` is the HEAD of the default bookmark.

## Permissions & Security

### Authorization

- **Creating/editing/deleting comments**: The existing issue comment permission model governs who can perform comment operations. Only authenticated users with write access to the repository (or the comment author for edits/deletes) can trigger comment events.
- **Workflow dispatch**: The workflow dispatch side effect runs with system-level authority. It does not require the commenting user to have explicit workflow permissions — the act of commenting in a repository where workflows are defined is sufficient to trigger evaluation.
- **Viewing triggered runs**: Read access to the repository is required to view workflow runs, consistent with all other trigger types.

### Role Matrix

| Action | Owner | Admin | Member (Write) | Read-Only | Anonymous |
|--------|-------|-------|----------------|-----------|----------|
| Create comment (triggers dispatch) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit comment (triggers dispatch) | ✅ | ✅ | Own comments | ❌ | ❌ |
| Delete comment (triggers dispatch) | ✅ | ✅ | Own comments | ❌ | ❌ |
| View triggered workflow runs | ✅ | ✅ | ✅ | ✅ | ❌ |

### Rate Limiting

- Issue comment creation is already rate-limited by the server's global rate limiting middleware. No additional rate limiting is required for the trigger dispatch side effect.
- However, a per-repository throttle should be applied to prevent a flood of comment-triggered runs from overwhelming the workflow execution system. If more than **50 issue comment-triggered workflow runs** are created for a single repository within a **1-minute window**, subsequent dispatches should be silently dropped until the window resets. This limit is separate from and in addition to the comment creation rate limit.
- The throttle counter should be keyed by `repository_id + trigger_event_type` to avoid cross-trigger interference.

### Data Privacy

- The trigger event payload passed to `dispatchForEvent` does not include the comment body, commenter identity, or issue content. Only the event type, action, ref, and commit SHA are passed. This ensures no PII leaks into workflow run trigger metadata.
- Workflow steps that need access to comment details must fetch them explicitly via the Codeplane API within the workflow execution context, subject to the workflow's authorization scope.

## Telemetry & Product Analytics

### Business Events

| Event Name | Fired When | Properties |
|------------|------------|------------|
| `WorkflowTriggerEvaluated` | After evaluating all workflow definitions against an `issue_comment` event | `repository_id`, `trigger_type: "issue_comment"`, `action` (`created`/`edited`/`deleted`), `definitions_evaluated: number`, `definitions_matched: number`, `runs_created: number` |
| `WorkflowRunCreated` | When a new workflow run is created from an `issue_comment` trigger | `repository_id`, `workflow_definition_id`, `workflow_run_id`, `trigger_event: "issue_comment"`, `trigger_action`, `trigger_ref` |

### Funnel Metrics

| Metric | Definition | Success Indicator |
|--------|------------|-------------------|
| **Trigger adoption rate** | % of repositories with at least one active workflow definition containing an `issue_comment` trigger | Growing quarter-over-quarter |
| **Trigger-to-run conversion** | Ratio of `issue_comment` events dispatched to actual workflow runs created | >0 runs for repositories that have `issue_comment` triggers configured |
| **Mean evaluation latency** | p50/p95/p99 time from comment creation to workflow run creation | p99 < 500ms |
| **Trigger action distribution** | Breakdown of `created` vs `edited` vs `deleted` actions | `created` expected to dominate; `deleted` expected to be rare |

## Observability

### Logging

| Log Point | Level | Structured Context | When |
|-----------|-------|--------------------|------|
| Trigger evaluation started | `debug` | `repository_id`, `event_type: "issue_comment"`, `action`, `issue_number`, `comment_id` | Before calling `dispatchForEvent` |
| Trigger evaluation completed | `info` | `repository_id`, `event_type: "issue_comment"`, `action`, `definitions_evaluated`, `definitions_matched`, `runs_created`, `duration_ms` | After `dispatchForEvent` returns |
| Trigger evaluation failed | `error` | `repository_id`, `event_type: "issue_comment"`, `action`, `error_message`, `error_code` | If `dispatchForEvent` returns an error |
| Trigger throttled | `warn` | `repository_id`, `event_type: "issue_comment"`, `action`, `throttle_window_remaining_ms` | When per-repository throttle is hit |
| Individual workflow match | `debug` | `repository_id`, `workflow_definition_id`, `workflow_name`, `matched: boolean` | During per-definition evaluation |
| Workflow run created from trigger | `info` | `repository_id`, `workflow_definition_id`, `workflow_run_id`, `trigger_event: "issue_comment"`, `trigger_action` | After successful run creation |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_trigger_evaluations_total` | Counter | `trigger_type`, `action`, `repository_id` | Total trigger evaluations performed |
| `codeplane_workflow_trigger_matches_total` | Counter | `trigger_type`, `action`, `repository_id` | Total definitions that matched a trigger event |
| `codeplane_workflow_trigger_runs_created_total` | Counter | `trigger_type`, `action`, `repository_id` | Total workflow runs created from trigger events |
| `codeplane_workflow_trigger_evaluation_duration_seconds` | Histogram | `trigger_type`, `action` | Time to evaluate all definitions for a trigger event |
| `codeplane_workflow_trigger_errors_total` | Counter | `trigger_type`, `action`, `error_type` | Total trigger evaluation errors |
| `codeplane_workflow_trigger_throttled_total` | Counter | `trigger_type`, `repository_id` | Total trigger dispatches dropped due to throttling |

### Alerts

#### Alert: `WorkflowTriggerEvaluationErrorRate`

- **Condition**: `rate(codeplane_workflow_trigger_errors_total{trigger_type="issue_comment"}[5m]) > 0.1`
- **Severity**: Warning
- **Runbook**:
  1. Check structured logs for `trigger evaluation failed` entries with `event_type: "issue_comment"`.
  2. Identify the `error_code` — common causes: database connectivity issues (`ECONNREFUSED`), malformed workflow configs (`JSON parse error`), missing repository (`not found`).
  3. If database errors: check PG connection pool health, run `SELECT 1` healthcheck, verify disk space.
  4. If malformed configs: identify the offending `workflow_definition_id` from logs, inspect its `config` column, and deactivate if corrupt.
  5. If repository not found: check if repositories were recently deleted without cleaning up workflow definitions.

#### Alert: `WorkflowTriggerEvaluationLatencyP99`

- **Condition**: `histogram_quantile(0.99, rate(codeplane_workflow_trigger_evaluation_duration_seconds_bucket{trigger_type="issue_comment"}[5m])) > 2`
- **Severity**: Warning
- **Runbook**:
  1. Check if a specific repository has an unusually large number of workflow definitions (>50). Query: `SELECT repository_id, COUNT(*) FROM workflow_definitions WHERE is_active GROUP BY repository_id ORDER BY 2 DESC`.
  2. If a single repo dominates: consider whether the 100-definition page limit should be reduced or whether definition configs should be cached.
  3. Check database query latency for `listWorkflowDefinitionsByRepo` — may indicate missing indexes or table bloat.
  4. Check for lock contention on the `workflow_runs` table during high-frequency comment activity.

#### Alert: `WorkflowTriggerThrottleActivated`

- **Condition**: `increase(codeplane_workflow_trigger_throttled_total{trigger_type="issue_comment"}[5m]) > 10`
- **Severity**: Info
- **Runbook**:
  1. Identify the `repository_id` from labels.
  2. Check if the repository is under a comment spam attack or a misbehaving integration posting comments rapidly.
  3. Review the repository's webhook configurations and connected integrations for unintended feedback loops.
  4. If legitimate high-volume usage: consider increasing the per-repository throttle limit for that specific repository.

### Error Cases and Failure Modes

| Failure Mode | Behavior | User Impact |
|-------------|----------|-------------|
| Database unavailable during dispatch | `dispatchForEvent` returns error; comment creation succeeds; error logged | Comment saved, but no workflow runs created; user sees no error |
| Malformed workflow definition config | `matchTrigger` catches parse error and returns `false` | That workflow silently skipped; other workflows still evaluated |
| Repository deleted between comment and dispatch | `dispatchForEvent` returns `repository not found` error | Comment may fail at a higher level; dispatch error logged |
| Workflow definition deactivated between match and run creation | Run not created; no error | Expected behavior; user sees no triggered run |
| Throttle limit reached | Dispatch silently dropped; warning logged | Comments succeed; workflow runs not created until throttle window resets |
| Default bookmark has no commits | Run created with empty `trigger_commit_sha` | Run proceeds; workflow steps that need a commit may fail within their own error handling |

## Verification

### API Integration Tests

- [ ] **Comment created triggers matching workflow**: Create a workflow definition with `on: { issue_comment: { types: ["created"] } }`. Create a comment on an issue. Verify a workflow run is created with `trigger_event: "issue_comment"` and `trigger_ref` matching the repository's default bookmark.
- [ ] **Comment edited triggers matching workflow**: Create a workflow definition with `on: { issue_comment: { types: ["edited"] } }`. Create and then edit a comment. Verify a run is created only on edit, not on create.
- [ ] **Comment deleted triggers matching workflow**: Create a workflow definition with `on: { issue_comment: { types: ["deleted"] } }`. Create and then delete a comment. Verify a run is created only on delete.
- [ ] **Empty types matches all actions**: Create a workflow definition with `on: { issue_comment: {} }`. Create a comment, edit it, then delete it. Verify 3 separate workflow runs are created, one for each action.
- [ ] **No types field matches all actions**: Create a workflow definition with `on: { issue_comment: true }` or `on: { issue_comment: { types: [] } }`. Create a comment. Verify a run is created.
- [ ] **Case-insensitive action matching**: Create a workflow definition with `on: { issue_comment: { types: ["Created"] } }`. Create a comment. Verify a run is created (action matching is case-insensitive).
- [ ] **Non-matching action does not trigger**: Create a workflow definition with `on: { issue_comment: { types: ["deleted"] } }`. Create a comment. Verify no workflow run is created.
- [ ] **No issue_comment trigger configured — no run**: Create a workflow definition with `on: { push: {} }` only. Create a comment. Verify no workflow run is created.
- [ ] **No active workflow definitions — no run**: Deactivate all workflow definitions in a repository. Create a comment. Verify no runs and no errors.
- [ ] **Multiple matching workflows each produce a run**: Create 3 workflow definitions, each with `on: { issue_comment: { types: ["created"] } }`. Create a comment. Verify 3 workflow runs are created, one per definition.
- [ ] **Inactive workflow definition is skipped**: Create a workflow definition with `issue_comment` trigger and deactivate it. Create a comment. Verify no run.
- [ ] **Malformed config is skipped silently**: Create a workflow definition with config set to `"not valid json {{"`. Create a comment. Verify no run and no 500 error on the comment endpoint.
- [ ] **Comment creation succeeds even if dispatch fails**: Simulate a database failure in the workflow dispatch path (if testable). Create a comment. Verify the comment is created and returned successfully despite the dispatch error.
- [ ] **Workflow run trigger_event is correct**: Create a run via `issue_comment` trigger. Fetch the run via `GET /api/repos/:owner/:repo/workflows/runs/:id`. Verify `trigger_event === "issue_comment"`.
- [ ] **Workflow run trigger_ref is default bookmark**: Verify the `trigger_ref` on the created run matches the repository's default bookmark name.
- [ ] **Workflow run trigger_commit_sha is HEAD of default bookmark**: Verify the `trigger_commit_sha` on the created run matches the current HEAD of the default bookmark.
- [ ] **on.issue.commented() alias triggers correctly**: Create a workflow definition using the serialized form of `on.issue.commented()`. Create a comment. Verify a run is created.
- [ ] **Comment on closed issue still triggers**: Close an issue, then add a comment. Verify workflow runs are dispatched.
- [ ] **Rapid sequential comments each trigger independently**: Post 5 comments in quick succession on the same issue. Verify 5 independent workflow runs are created (assuming no throttle hit).

### Throttle Tests

- [ ] **Under-threshold comments are not throttled**: Create 10 comments across different issues in the same repository within 1 minute. Verify all 10 trigger dispatches succeed.
- [ ] **Over-threshold comments are throttled**: Create 51+ comment-triggered workflow runs for a single repository within 1 minute. Verify the 51st dispatch is silently dropped and a warning is logged.
- [ ] **Throttle resets after window**: Hit the throttle limit, wait for the 1-minute window to pass, then create another comment. Verify the dispatch succeeds.
- [ ] **Throttle is per-repository**: Hit the throttle on repository A. Verify comments on repository B are not affected.

### Workflow Authoring Tests

- [ ] **on.issueComment.created() produces correct descriptor**: Verify the output is `{ _type: "issue_comment", event: "created" }`.
- [ ] **on.issueComment.edited() produces correct descriptor**: Verify the output is `{ _type: "issue_comment", event: "edited" }`.
- [ ] **on.issueComment.deleted() produces correct descriptor**: Verify the output is `{ _type: "issue_comment", event: "deleted" }`.
- [ ] **on.issue.commented() produces issue_comment descriptor**: Verify the output is `{ _type: "issue_comment", event: "created" }`.
- [ ] **Trigger descriptor serializes to valid config JSON**: Verify the rendered workflow config from `IssueCommentTriggerDescriptor` produces `{ on: { issue_comment: { types: ["created"] } } }`.

### Trigger Matching Unit/Integration Tests

- [ ] **matchTrigger returns true for matching issue_comment event**: Call `matchTrigger({ on: { issue_comment: { types: ["created"] } } }, { type: "issue_comment", action: "created", ref: "main", commitSHA: "abc123" })`. Verify returns `true`.
- [ ] **matchTrigger returns false for non-matching action**: Call with `types: ["edited"]` and `action: "created"`. Verify returns `false`.
- [ ] **matchTrigger returns true for empty types**: Call with `issue_comment: {}` and any action. Verify returns `true`.
- [ ] **matchTrigger returns false when issue_comment is not in config**: Call with `{ on: { push: {} } }` and an `issue_comment` event. Verify returns `false`.
- [ ] **matchTrigger handles null config**: Call with `null` config. Verify returns `false`.
- [ ] **matchTrigger handles malformed JSON string**: Call with `"broken json"` config. Verify returns `false`.
- [ ] **normalizeTriggerName handles case**: Verify `normalizeTriggerName("Issue_Comment")` normalizes correctly.

### CLI E2E Tests

- [ ] **Run list shows issue_comment-triggered runs**: Create a comment that triggers a workflow. Run `codeplane run list --repo owner/repo`. Verify the output includes a run with trigger event `issue_comment`.
- [ ] **Run view shows issue_comment trigger details**: Run `codeplane run view <id> --repo owner/repo`. Verify the output displays `trigger_event: issue_comment` and the correct `trigger_ref`.
- [ ] **Run list filtering does not exclude issue_comment runs**: Run `codeplane run list --repo owner/repo` without filters. Verify `issue_comment` runs appear alongside other trigger types.

### Web UI E2E Tests (Playwright)

- [ ] **Workflow run list displays issue_comment trigger event**: Navigate to the workflow runs page. Verify a comment-triggered run shows "issue_comment" (or its human-readable label) in the trigger event column.
- [ ] **Workflow run detail shows issue_comment metadata**: Click into a comment-triggered run. Verify the header displays the trigger event as `issue_comment`, the action, the ref, and the commit SHA.
- [ ] **Workflow definition with issue_comment trigger displays correctly**: Navigate to a workflow definition that has an `issue_comment` trigger. Verify the trigger configuration is visible in the definition detail view.

### TUI E2E Tests

- [ ] **TUI run list renders issue_comment trigger**: Open the TUI workflow run list. Verify a comment-triggered run displays `issue_comment` in the trigger event column, truncated per responsive breakpoint rules.
- [ ] **TUI run detail renders issue_comment metadata**: Select a comment-triggered run. Verify the detail header shows the trigger event and ref.

### Maximum Input Size Tests

- [ ] **Maximum comment body (65,535 chars) triggers workflow**: Create a comment with body at the maximum allowed length. Verify the comment is created and workflow trigger evaluation proceeds normally.
- [ ] **Comment body exceeding maximum (65,536+ chars) fails gracefully**: Attempt to create a comment exceeding the maximum body length. Verify the request is rejected with a validation error and no trigger evaluation occurs.
- [ ] **100 active workflow definitions evaluated**: Create 100 active workflow definitions, some with and some without `issue_comment` triggers. Create a comment. Verify all 100 are evaluated and only matching ones produce runs.
