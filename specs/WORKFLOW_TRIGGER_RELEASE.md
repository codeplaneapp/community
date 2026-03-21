# WORKFLOW_TRIGGER_RELEASE

Specification for WORKFLOW_TRIGGER_RELEASE.

## High-Level User POV

When a release is published, updated, deleted, marked as a prerelease, or promoted from draft to published in a Codeplane repository, any workflow that has been configured to listen for that specific release activity will automatically run. This allows teams to build powerful automation that reacts to their release lifecycle — for example, automatically deploying artifacts to staging when a release is published, notifying external channels when a prerelease ships, cleaning up downstream environments when a release is deleted, or triggering downstream build pipelines when release notes are updated.

From the workflow author's perspective, enabling release-driven automation is as simple as adding an `on.release` trigger to their workflow definition file. The trigger supports filtering by specific activity types — such as only firing when a release is published or only when a prerelease is created — and by tag patterns, so that teams get precise control over when their workflows run. For instance, a workflow can be configured to run only when a release tag matches `v*` or `release/*`, allowing separate deployment pipelines for different tag conventions.

From the day-to-day user's perspective, this feature is invisible until they look at a workflow run and see that it was triggered by a release event. The run detail surfaces show which release event caused the run, what action occurred (e.g., "published," "prereleased"), and which tag was associated. Users do not need to configure anything beyond the workflow file itself — the Codeplane platform detects release events and evaluates all active workflow definitions in the repository automatically.

This feature also supports agent-driven workflows. When an agent creates or publishes a release via the API, the same trigger evaluation occurs. This enables fully automated release pipelines where an agent creates a release, a workflow deploys it, and downstream automation handles notifications and cleanup without human intervention.

Draft releases do not trigger workflow events. When a draft is promoted to a published release (by setting `draft: false`), a `published` event fires, ensuring that incomplete or in-progress releases do not cause premature automation.

## Acceptance Criteria

- [ ] When a non-draft release is created in a repository, all active workflow definitions in that repository with an `on.release` trigger that includes `"published"` (or has no `types` filter) must be evaluated and matching workflows must produce new runs.
- [ ] When a non-draft prerelease is created, all matching workflows with `on.release` trigger including `"prereleased"` must fire. If the trigger includes `"published"`, it must also fire (a prerelease is also a publication).
- [ ] When a release is updated (title, body, tag, or prerelease flag changed), all matching workflows with `on.release` trigger including `"updated"` must fire.
- [ ] When a release is deleted, all matching workflows with `on.release` trigger including `"deleted"` must fire.
- [ ] When a draft release is promoted to published (draft flag changed from `true` to `false`), a `published` event must fire. If the release is a prerelease, a `prereleased` event must also fire.
- [ ] When a published release is demoted to draft (draft flag changed from `false` to `true`), no trigger event fires.
- [ ] The `released` event fires when a non-draft, non-prerelease release is created or when a prerelease is promoted to a full release (prerelease flag changed from `true` to `false`).
- [ ] Draft release creation, updates, and deletion must NOT fire any trigger events.
- [ ] If a workflow's `on.release` trigger specifies no `types` array, the workflow must fire on all release activity types (`published`, `updated`, `deleted`, `released`, `prereleased`).
- [ ] If a workflow's `on.release` trigger specifies a `types` array, only the listed activity types must cause the workflow to fire.
- [ ] Activity type matching must be case-insensitive (e.g., `"Published"` matches a `"published"` event).
- [ ] If a workflow's `on.release` trigger specifies a `tags` array, only releases whose tag matches at least one glob pattern in the array must trigger the workflow. If no `tags` array is specified, all tags match.
- [ ] Tag pattern matching must support `*` (single-level wildcard) and `**` (multi-level wildcard) glob patterns.
- [ ] Tag pattern matching strips `refs/tags/` prefixes before matching.
- [ ] Multiple workflow definitions in the same repository may each have independent `on.release` triggers; all matching definitions must produce independent runs.
- [ ] Workflow runs created by release triggers must record `trigger_event` as `"release"` and `trigger_ref` as the release's tag name.
- [ ] The `trigger_commit_sha` for release-triggered runs must be set to the release's commit SHA, or an empty string if unavailable.
- [ ] Trigger evaluation must happen asynchronously. The release API response must not be delayed by workflow dispatch processing.
- [ ] If no active workflow definitions match a release event, no runs are created and no error is reported.
- [ ] If workflow dispatch fails for one definition (e.g., invalid config), other matching definitions must still produce runs independently.
- [ ] A workflow that is marked as inactive (`is_active = false`) must not be evaluated for release triggers.
- [ ] Release events triggered by API calls, CLI commands, and web UI actions must all produce the same trigger behavior.
- [ ] Webhook deliveries for release events and workflow trigger evaluation for release events must both fire from the same release mutation. They are independent systems.
- [ ] A single release mutation that triggers multiple event types (e.g., a draft promotion that produces both `published` and `prereleased`) dispatches each event independently.
- [ ] The maximum number of workflow runs that a single release event can create is bounded by the number of active workflow definitions in the repository (up to 100 definitions per broadcast dispatch).
- [ ] Activity types in the `types` array must be limited to the set: `published`, `updated`, `deleted`, `released`, `prereleased`. Any other value is ignored during matching.
- [ ] Tag pattern entries must be non-empty strings with a maximum length of 255 characters each.
- [ ] The maximum number of tag patterns per trigger is 20.

### Definition of Done

- Release creation, update, and deletion in the release service dispatch trigger events to the workflow engine.
- The `@codeplane/workflow` trigger builders (`on.release.published()`, etc.) produce definitions that are correctly matched.
- The `matchesRelease` function correctly filters by action types and tag glob patterns.
- Workflow runs appear in standard run list/detail endpoints with `trigger_event: "release"`.
- Draft releases are completely excluded from trigger evaluation.
- End-to-end tests validate all five event types, tag filtering, and edge cases.
- Documentation covers trigger authoring, configuration, and examples.

## Design

### Workflow Definition Authoring (TypeScript)

Workflow authors configure release triggers using the `on.release` builder in their `.codeplane/workflows/*.ts` definition files:

```typescript
import { on } from "@codeplane/workflow";

export default {
  on: [
    on.release.published(),
    on.release.prereleased(),
  ],
  jobs: {
    deploy: {
      "runs-on": "default",
      steps: [
        { run: "echo 'Deploying release'" },
      ],
    },
  },
};
```

With tag filtering:

```typescript
import { on } from "@codeplane/workflow";

export default {
  on: [
    on.release.published({ tags: ["v*"] }),
  ],
  jobs: {
    deploy: {
      "runs-on": "default",
      steps: [
        { run: "echo 'Deploying release'" },
      ],
    },
  },
};
```

Available trigger builders:

| Builder | Action | Fires when |
|---------|--------|------------|
| `on.release.published()` | `published` | A non-draft release is created, or a draft is promoted to published |
| `on.release.updated()` | `updated` | A non-draft release's title, body, tag, or prerelease flag is modified |
| `on.release.deleted()` | `deleted` | A non-draft release is deleted |
| `on.release.released()` | `released` | A non-draft, non-prerelease release is created, or a prerelease is promoted to full release |
| `on.release.prereleased()` | `prereleased` | A non-draft prerelease is created, or a draft prerelease is promoted to published |

Each builder accepts an optional `{ tags: string[] }` argument to filter by tag patterns.

### Rendered Workflow Config Shape (JSON)

The workflow renderer produces JSON consumed by the trigger matching engine:

```json
{
  "on": {
    "release": {
      "types": ["published", "prereleased"],
      "tags": ["v*"]
    }
  }
}
```

Or for all activity types with no tag filter:

```json
{
  "on": {
    "release": {}
  }
}
```

### API Shape

No new API endpoints are introduced. Release triggers fire as a side effect of existing release mutation endpoints:

| Endpoint | Method | Possible Event Actions |
|----------|--------|------------------------|
| `POST /api/repos/:owner/:repo/releases` | `POST` | `published`, `released`, `prereleased` (if non-draft) |
| `PATCH /api/repos/:owner/:repo/releases/:id` | `PATCH` | `updated`, `published`, `released`, `prereleased` (depending on changes) |
| `DELETE /api/repos/:owner/:repo/releases/:id` | `DELETE` | `deleted` (if was non-draft) |
| `DELETE /api/repos/:owner/:repo/releases/tags/*` | `DELETE` | `deleted` (if was non-draft) |

Workflow runs from release triggers appear in the standard run list and detail endpoints with `trigger_event: "release"`.

**TriggerEvent payload shape:**

```json
{
  "type": "release",
  "ref": "v1.2.0",
  "commitSHA": "abc123def456...",
  "action": "published"
}
```

### SDK Shape

The `@codeplane/workflow` package already exports `on.release` builders. The `@codeplane/sdk` workflow service already has `matchTrigger` and `matchesRelease` support for release events, including both action type filtering and tag glob matching. The missing piece is calling `dispatchForEvent` from the release service after mutations.

### Web UI Design

**Workflow Run List:** Runs triggered by releases display `release` in the trigger event column with the release tag as the trigger ref.

**Workflow Run Detail:** The header shows trigger type `release` with a badge for the action (e.g., "published", "prereleased") and the tag name. The tag name links to the release detail page.

**Workflow Definition View:** The `on.release` trigger section displays configured activity types and tag patterns. If no types are specified, shows "All release events." If no tags are specified, shows "All tags."

**Release Detail Page — Timeline:** When a release triggers workflow runs, a timeline entry reads "Triggered N workflow runs" with a link to the filtered run list.

### CLI Command

No new CLI commands are required. Existing commands surface release-triggered runs:

- `codeplane run list` and `codeplane run view` surface release-triggered runs.
- `codeplane release create` and `codeplane release delete` trigger workflows as a side effect.

**Example output of `codeplane run list`:**

```
ID     Name            Trigger             Ref       Status    Duration
1234   deploy-prod     release.published   v1.2.0    success   2m 14s
1235   notify-slack    release.published   v1.2.0    success   12s
```

### TUI UI

The TUI workflow run list screen displays release-triggered runs with trigger event `release` and the tag as the ref. No new screens are needed.

### Editor Integrations (VS Code / Neovim)

No new editor features are required. Release-triggered runs appear in existing workflow run views.

### Documentation

1. **Workflow Triggers Reference — Release Events:** Document the `on.release` trigger, all supported activity types (`published`, `updated`, `deleted`, `released`, `prereleased`), tag pattern filtering with glob syntax, matching behavior, and example definitions.
2. **Cookbook: Auto-deploy on release publish:** Show a workflow using `on.release.published({ tags: ["v*"] })` to deploy artifacts to staging.
3. **Cookbook: Notify team on prerelease:** Show a workflow using `on.release.prereleased()` to send a notification.
4. **Cookbook: Cleanup on release deletion:** Show a workflow using `on.release.deleted()` to tear down associated preview environments.
5. **Workflow Runs docs update:** Explain that runs may be triggered by release events and how to identify them.

## Permissions & Security

### Authorization

| Action | Required Role | Notes |
|--------|--------------|-------|
| **Creating/updating/deleting a release** (which triggers workflow dispatch) | Repository Write or higher | Same permissions as existing release operations. The workflow dispatch inherits the actor's identity. |
| **Viewing triggered workflow runs** | Repository Read or higher | Follows existing workflow run visibility rules. |
| **Authoring workflow definitions with `release` triggers** | Repository Write or higher | Same as existing workflow definition management. |
| **Canceling, rerunning, or resuming** release-triggered runs | Repository Write or higher | Same as existing workflow run management. |

- Anonymous users and read-only users can view release-triggered runs if they have read access to the repository. They cannot trigger runs because they cannot create or modify releases (write access required).
- Draft release visibility rules apply independently of trigger behavior — draft releases never fire triggers regardless of viewer permissions.

### Rate Limiting

- Release trigger evaluation shares rate limiting with the underlying release mutation endpoints.
- A maximum of 100 workflow definitions per repository are evaluated per trigger event (consistent with broadcast dispatch behavior).
- Workflow runs created by release triggers count toward the repository's workflow run quota.
- No additional rate limits specific to this trigger type are needed; existing workflow dispatch and release operation rate limits are sufficient.

### Data Privacy

- Release trigger event payloads contain only event type, action, tag ref, and commit SHA — no release body, title, or author PII.
- Workflow run logs may contain release data if workflow steps read the release via API, but this is governed by the workflow author's code.
- The triggering release ID is not stored as a first-class field on the run record; only the tag name appears as `trigger_ref`.

## Telemetry & Product Analytics

### Business Events

1. **`workflow.trigger.release.evaluated`** — Fired each time a release event is evaluated against workflow definitions.
   - Properties: `repository_id`, `action` (published/updated/deleted/released/prereleased), `tag_name`, `definitions_checked`, `definitions_matched`, `trigger_source` (api/cli/web/agent)

2. **`workflow.trigger.release.run_created`** — Fired for each workflow run created by a release trigger.
   - Properties: `repository_id`, `workflow_definition_id`, `workflow_run_id`, `action`, `tag_name`, `trigger_source`

3. **`workflow.trigger.release.no_match`** — Fired when a release event matches no workflow definitions.
   - Properties: `repository_id`, `action`, `tag_name`, `definitions_checked`

4. **`workflow.trigger.release.skipped_draft`** — Fired when a release mutation is skipped because the release is a draft.
   - Properties: `repository_id`, `tag_name`, `operation` (create/update/delete)

### Funnel Metrics & Success Indicators

- **Adoption rate:** Percentage of repositories with at least one active workflow containing an `on.release` trigger.
- **Trigger-to-run conversion rate:** Ratio of evaluated events where `definitions_matched > 0` to total evaluated events.
- **Action type distribution:** Breakdown of which release actions are most commonly used as triggers. Expect `published` to dominate.
- **Tag filter adoption:** Percentage of `on.release` triggers that use tag pattern filters vs. unfiltered triggers.
- **Runs per trigger:** Average runs created per release event that matches at least one definition.
- **Latency p50/p95:** Time from release mutation API response to first workflow run reaching `queued` status.
- **Draft-to-published funnel:** Percentage of draft releases that are eventually promoted to published (driving `published` trigger volume).

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|---|---|---|
| Release event dispatched to trigger evaluator | `info` | `repository_id`, `action`, `tag_name`, `release_id`, `actor_id` |
| Draft release mutation, skipping trigger evaluation | `debug` | `repository_id`, `tag_name`, `operation` |
| Workflow definitions loaded for evaluation | `debug` | `repository_id`, `definitions_count` |
| Trigger matched workflow definition | `info` | `repository_id`, `workflow_definition_id`, `workflow_name`, `action`, `tag_name` |
| Tag pattern filter rejected event | `debug` | `repository_id`, `workflow_definition_id`, `tag_name`, `tag_patterns` |
| No definitions matched | `debug` | `repository_id`, `action`, `tag_name`, `definitions_checked` |
| Workflow run created from release trigger | `info` | `repository_id`, `workflow_definition_id`, `workflow_run_id`, `action`, `tag_name` |
| Evaluation failed for a definition (bad config) | `warn` | `repository_id`, `workflow_definition_id`, `error_message` |
| Trigger dispatch error (unexpected) | `error` | `repository_id`, `action`, `tag_name`, `error_message`, `stack_trace` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_workflow_trigger_release_events_total` | Counter | `action`, `repository_id` | Total release events dispatched for evaluation |
| `codeplane_workflow_trigger_release_runs_created_total` | Counter | `action`, `repository_id` | Workflow runs created by release triggers |
| `codeplane_workflow_trigger_release_no_match_total` | Counter | `action` | Events matching no definitions |
| `codeplane_workflow_trigger_release_evaluation_duration_seconds` | Histogram | `action` | Time to evaluate all definitions for one event |
| `codeplane_workflow_trigger_release_errors_total` | Counter | `error_type` | Errors during evaluation |
| `codeplane_workflow_trigger_release_definitions_evaluated` | Histogram | — | Definitions evaluated per event |
| `codeplane_workflow_trigger_release_skipped_draft_total` | Counter | `operation` | Release mutations skipped due to draft status |

### Alerts

#### `WorkflowReleaseTriggerHighErrorRate`
- **Condition:** `rate(codeplane_workflow_trigger_release_errors_total[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check logs for `trigger dispatch error` and `evaluation failed for a definition` entries filtered by `repository_id`.
  2. If `bad_config`, identify the offending workflow definitions — these are user-authored config issues. Check for recently updated definitions with malformed JSON.
  3. If `dispatch_failure`, check DB connectivity via `/health` endpoint. Verify the `workflow_runs` table is writable and not at capacity.
  4. If `unexpected`, examine stack traces for null pointer errors or type mismatches. Restart the workflow service process if the error is persistent. Escalate to the workflow team if the root cause is unclear.
  5. Monitor the metric for 10 minutes after mitigation to confirm resolution.

#### `WorkflowReleaseTriggerEvaluationLatencyHigh`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_workflow_trigger_release_evaluation_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_workflow_trigger_release_definitions_evaluated` histogram for repos with abnormally many definitions.
  2. Verify DB query performance for `listWorkflowDefinitionsByRepo` — check for missing indexes on `repository_id` + `is_active`.
  3. If a single repository has hundreds of definitions, contact the repository admin. Consider if a per-repo definition cap is needed.
  4. Check server CPU/memory utilization. If the server is under resource pressure, scale horizontally or increase resource limits.

#### `WorkflowReleaseTriggerZeroEventsAnomaly`
- **Condition:** `sum(rate(codeplane_workflow_trigger_release_events_total[1h])) == 0` for > 4h during business hours when releases are being created (cross-reference with `codeplane_release_create_total > 0`).
- **Severity:** Critical
- **Runbook:**
  1. Check if the dispatch call site is present in the release service — review recent deployments for regressions.
  2. Verify the workflow service is initialized in the service registry by checking `/health` and structured logs for service init messages.
  3. Check if all recent releases are drafts (which would correctly skip trigger dispatch) by querying `codeplane_workflow_trigger_release_skipped_draft_total`.
  4. Test manually by creating a non-draft release in a repo with an `on.release` workflow and verifying a run is created.
  5. If the dispatch call is missing, this is a code regression — roll back to the last known good deploy.

### Error Cases and Failure Modes

| Error Case | Behavior | Severity |
|---|---|---|
| Invalid JSON in workflow config | Skip definition, log warning, continue with others | Warn |
| `dispatchForEvent` throws for one definition | Log error, continue with remaining definitions | Error |
| No active definitions in repo | No evaluation, debug log only | Debug |
| Database unavailable during definition loading | Trigger evaluation fails; release mutation still succeeds | Error |
| Commit SHA unresolvable for release | Use empty string for `trigger_commit_sha` | Warn |
| Tag pattern contains invalid glob syntax | Pattern is treated as literal string match | Warn |
| Release deleted between event dispatch and run creation | Runs are created but may reference a deleted release; runs execute normally | Info |
| Concurrent release update + delete | Each mutation dispatches independently; delete event fires even if update also fired | Info |

## Verification

### API Integration Tests

1. **Non-draft release created triggers `published` workflow run** — Create repo, register workflow with `on: { release: { types: ["published"] } }`, create non-draft release, verify run created with `trigger_event: "release"`, `trigger_ref: "<tag>"`.
2. **Non-draft non-prerelease release triggers `released` workflow run** — Workflow with `types: ["released"]`, create release with `prerelease: false, draft: false`, verify run.
3. **Non-draft prerelease triggers `prereleased` workflow run** — Workflow with `types: ["prereleased"]`, create release with `prerelease: true, draft: false`, verify run.
4. **Non-draft prerelease also triggers `published`** — Workflow with `types: ["published"]`, create prerelease, verify run fires.
5. **Draft release creation does NOT trigger any run** — Workflow with all types, create draft release, verify no runs created.
6. **Release update triggers `updated` workflow run** — Workflow with `types: ["updated"]`, update non-draft release title, verify run.
7. **Release delete triggers `deleted` workflow run** — Workflow with `types: ["deleted"]`, delete non-draft release, verify run.
8. **Delete by tag triggers `deleted` workflow run** — Workflow with `types: ["deleted"]`, delete release by tag, verify run.
9. **Draft release deletion does NOT trigger** — Create draft, delete it, verify no run.
10. **Draft promotion to published triggers `published`** — Create draft release, update `draft: false`, verify `published` event fires.
11. **Draft prerelease promotion triggers both `published` and `prereleased`** — Create draft prerelease, promote to published, verify both events fire.
12. **Prerelease promotion to full release triggers `released`** — Create non-draft prerelease, update `prerelease: false`, verify `released` fires.
13. **Published demotion to draft does NOT trigger** — Non-draft release, update `draft: true`, verify no trigger event.
14. **Unmatched activity type does not trigger run** — Workflow with `types: ["deleted"]`, create release, verify no run.
15. **No types filter matches all activity types** — Workflow with `on: { release: {} }`, create and then delete release, verify two runs (published + deleted).
16. **Multiple definitions produce independent runs** — Two workflows with `types: ["published"]`, create release, verify two runs.
17. **Inactive definition is not evaluated** — Inactive workflow, create release, verify no run.
18. **Case-insensitive activity type matching** — Workflow with `types: ["PUBLISHED"]`, create release, verify run.
19. **Tag pattern filter matches** — Workflow with `tags: ["v*"]`, create release with tag `v1.0.0`, verify run.
20. **Tag pattern filter rejects non-matching tag** — Workflow with `tags: ["v*"]`, create release with tag `release-1.0`, verify no run.
21. **Tag pattern with `**` wildcard** — Workflow with `tags: ["release/**"]`, create release with tag `release/1.0/beta`, verify run.
22. **Multiple tag patterns (OR logic)** — Workflow with `tags: ["v*", "release-*"]`, create release with tag `release-1.0`, verify run.
23. **Tag with `refs/tags/` prefix is normalized** — Event with ref `refs/tags/v1.0.0` matches pattern `v*`.
24. **Run records correct trigger metadata** — Verify `trigger_event: "release"`, `trigger_ref: "<tag>"`, `trigger_commit_sha: "<sha>"`.
25. **Release from API and CLI both trigger** — Create releases via both, verify runs for each.
26. **Invalid config doesn't prevent other definitions** — One valid + one malformed workflow, create release, valid one runs.
27. **Repo with no definitions doesn't error** — Create release in empty repo, verify success with no runs.
28. **Repo with only push trigger doesn't fire on releases** — Push-only workflow, create release, no run.
29. **Rapid sequential releases each produce runs** — Create 5 releases in succession, verify 5 independent runs per matching workflow.
30. **Release update that changes only body fires `updated`** — Update body only, verify `updated` event.
31. **Release update that changes tag fires `updated`** — Update tag from `v1.0.0` to `v1.0.1`, verify `updated` event.
32. **Trigger evaluation is async (non-blocking)** — Measure API response time with/without workflows, verify <100ms difference.
33. **Maximum tag pattern length (255 chars) accepted** — Workflow with 255-char tag pattern, create matching release, verify run.
34. **Tag pattern exceeding 255 chars is rejected during workflow registration** — Attempt to register workflow with 256-char tag pattern, verify validation error.
35. **Maximum 20 tag patterns per trigger accepted** — Workflow with 20 tag patterns, create matching release, verify run.
36. **More than 20 tag patterns rejected during workflow registration** — Attempt 21 patterns, verify validation error.

### CLI E2E Tests

37. **`codeplane release create` triggers run visible in `codeplane run list`** — Create release via CLI, verify run with trigger `release` in list.
38. **`codeplane release delete` triggers run** — Delete non-draft release via CLI, verify run.
39. **`codeplane run view` shows release trigger details** — Verify `trigger_event: "release"`, `action`, and tag in JSON output.
40. **`codeplane release create --draft` does NOT trigger run** — Create draft via CLI, verify no run.
41. **`codeplane run list --json` includes tag in trigger ref** — Verify `trigger_ref` field contains the release tag.

### Playwright (Web UI) E2E Tests

42. **Creating release from web UI produces workflow run** — Create non-draft release, navigate to runs, verify run listed.
43. **Run detail page shows release trigger info** — Verify trigger section shows event type `release`, action, and tag.
44. **Definition view shows release trigger config** — Verify types and tag patterns displayed.
45. **Deleting release from UI triggers run** — Delete non-draft release, verify run.
46. **Draft release from UI does not produce run** — Create draft release, verify no run.
47. **Workflow run list shows release tag in trigger ref column** — Verify tag name appears.

### Trigger Matching Logic Tests

48. **`matchTrigger` returns `true` for matching release published event** — Config `{ on: { release: { types: ["published"] } } }`, event `{ type: "release", action: "published", ref: "v1.0.0", commitSHA: "abc" }`. Expect `true`.
49. **`matchTrigger` returns `false` for non-matching action** — Config `{ on: { release: { types: ["published"] } } }`, event `{ type: "release", action: "deleted", ref: "v1.0.0", commitSHA: "abc" }`. Expect `false`.
50. **`matchTrigger` returns `true` for wildcard (no types, no tags)** — Config `{ on: { release: {} } }`, event `{ type: "release", action: "updated", ref: "v1.0.0", commitSHA: "abc" }`. Expect `true`.
51. **`matchTrigger` returns `true` for matching tag pattern** — Config `{ on: { release: { tags: ["v*"] } } }`, event `{ type: "release", action: "published", ref: "v1.0.0", commitSHA: "abc" }`. Expect `true`.
52. **`matchTrigger` returns `false` for non-matching tag pattern** — Config `{ on: { release: { tags: ["v*"] } } }`, event `{ type: "release", action: "published", ref: "release-1.0", commitSHA: "abc" }`. Expect `false`.
53. **`matchTrigger` with both types and tags** — Config `{ on: { release: { types: ["published"], tags: ["v*"] } } }`, event `{ type: "release", action: "published", ref: "v1.0.0", commitSHA: "abc" }`. Expect `true`.
54. **`matchTrigger` rejects when type matches but tag doesn't** — Config `{ on: { release: { types: ["published"], tags: ["v*"] } } }`, event `{ type: "release", action: "published", ref: "release-1.0", commitSHA: "abc" }`. Expect `false`.
55. **`matchTrigger` rejects when tag matches but type doesn't** — Config `{ on: { release: { types: ["deleted"], tags: ["v*"] } } }`, event `{ type: "release", action: "published", ref: "v1.0.0", commitSHA: "abc" }`. Expect `false`.
56. **`matchTrigger` with empty types array matches all actions** — Config `{ on: { release: { types: [] } } }`, event `{ type: "release", action: "prereleased", ref: "v1.0.0", commitSHA: "abc" }`. Expect `true`.
57. **`matchTrigger` returns `false` when no `release` key in config** — Config `{ on: { push: {} } }`, event `{ type: "release", action: "published", ref: "v1.0.0", commitSHA: "abc" }`. Expect `false`.
58. **`matchTrigger` case-insensitive type matching** — Config `{ on: { release: { types: ["PUBLISHED"] } } }`, event `{ type: "release", action: "published", ref: "v1.0.0", commitSHA: "abc" }`. Expect `true`.
59. **`matchTrigger` handles all 5 types** — Config with all 5 types specified. Verify each action matches.
60. **`matchTrigger` with malformed config JSON string** — Config `"not valid json"`, any event. Expect `false` (no crash).
61. **`matchTrigger` with null config** — Config `null`, any event. Expect `false`.
62. **`matchTrigger` normalizes `refs/tags/` prefix** — Config `{ on: { release: { tags: ["v*"] } } }`, event with ref `refs/tags/v1.0.0`. Expect `true`.
63. **`matchTrigger` with multiple tag patterns** — Config `{ on: { release: { tags: ["v*", "release-*"] } } }`, event with ref `release-2.0`. Expect `true`.

### Workflow SDK / Trigger Builder Tests

64. **`on.release.published()` produces correct descriptor** — Verify output is `{ _type: "release", event: "published" }`.
65. **`on.release.updated()` produces correct descriptor** — Verify output is `{ _type: "release", event: "updated" }`.
66. **`on.release.deleted()` produces correct descriptor** — Verify output is `{ _type: "release", event: "deleted" }`.
67. **`on.release.released()` produces correct descriptor** — Verify output is `{ _type: "release", event: "released" }`.
68. **`on.release.prereleased()` produces correct descriptor** — Verify output is `{ _type: "release", event: "prereleased" }`.
69. **`on.release.published({ tags: ["v*"] })` includes tags** — Verify output is `{ _type: "release", event: "published", tags: ["v*"] }`.
70. **Rendered workflow config matches expected JSON shape** — Render a workflow with `on.release.published()` and `on.release.deleted()`. Verify the JSON config contains `{ on: { release: { types: ["published", "deleted"] } } }`.
