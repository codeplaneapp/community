# WORKFLOW_TRIGGER_WORKFLOW_ARTIFACT

Specification for WORKFLOW_TRIGGER_WORKFLOW_ARTIFACT.

## High-Level User POV

When a workflow run produces an artifact — a compiled binary, a test report, a bundled asset, a container image manifest, or any other build output — it often needs to kick off downstream automation. A build workflow might produce a release-ready binary that needs a separate deployment workflow to push it to production. A test suite might generate a coverage report artifact that triggers a notification workflow. An agent session might produce a patch artifact that triggers a validation pipeline. Today, without artifact-based triggering, users must either chain everything into a single monolithic workflow, manually dispatch follow-up workflows after inspecting artifacts, or rely on the coarser `workflow_run` trigger that fires on run completion regardless of what was actually produced.

The Workflow Artifact Trigger solves this by letting users declare that a workflow should fire automatically when a specific artifact (or class of artifacts matching a name pattern) becomes available from a specific source workflow. This is a fine-grained, content-aware alternative to `workflow_run` completion triggers. Instead of asking "did the build workflow finish?", users ask "did the build workflow produce a `dist/bundle.zip` artifact?"

From the user's perspective, authoring this trigger is straightforward. In a TypeScript workflow definition, the user imports `on.workflowArtifact` and specifies optional filter criteria: which source workflows to watch, and which artifact name patterns to match. Once the workflow definition is saved and active, the trigger evaluates automatically every time an artifact upload is confirmed (transitions from `pending` to `ready` status) in the repository. If the confirmed artifact matches the trigger's filters, a new workflow run is created immediately — no polling, no manual intervention.

The triggered run inherits the source run's ref and commit SHA context, so downstream workflows operate against the same repository state that produced the artifact. Users see the triggered runs in the workflow runs list across all clients (web, CLI, TUI, editors), with clear attribution showing which artifact from which source workflow caused the trigger. This enables powerful multi-stage pipelines: build → test → deploy, where each stage is an independent workflow connected by artifact triggers, and each stage only fires when the upstream stage actually produces the expected output.

## Acceptance Criteria

### Definition of Done

- [ ] When an artifact upload is confirmed (status transitions from `pending` to `ready`), the system evaluates all active workflow definitions in the same repository for matching `on.workflow_artifact` triggers.
- [ ] A workflow definition with `on: { workflow_artifact: {} }` (no filters) triggers on every artifact confirmation in the repository.
- [ ] A workflow definition with `on: { workflow_artifact: { workflows: ["build"] } }` triggers only when the confirmed artifact was produced by a workflow run whose definition name matches `"build"`.
- [ ] A workflow definition with `on: { workflow_artifact: { names: ["dist/*"] } }` triggers only when the confirmed artifact's name matches the glob pattern `"dist/*"`.
- [ ] A workflow definition with both `workflows` and `names` filters requires both to match (AND semantics).
- [ ] Source workflow name matching is case-insensitive and supports glob patterns (e.g., `"build-*"`, `"ci*"`).
- [ ] Artifact name matching is case-sensitive and supports glob patterns (e.g., `"dist/*.zip"`, `"coverage-*"`, `"[abc]*.tar.gz"`).
- [ ] Multiple workflows can be triggered by a single artifact confirmation event.
- [ ] The triggered workflow run records the trigger event type as `workflow_artifact`, the action as `ready`, the source run's ref as the trigger ref, the source run's commit SHA as the trigger commit SHA, the artifact name, and the source workflow name.
- [ ] The `on.workflowArtifact` TypeScript trigger builder from `@codeplane/workflow` produces a `WorkflowArtifactTriggerDescriptor` that is correctly matched by the trigger evaluation engine.
- [ ] Workflow dispatch for artifact events is fire-and-forget from the artifact confirmation operation's perspective — a failed dispatch does not block or roll back the artifact status transition.
- [ ] If no active workflow definitions match the event, no workflow runs are created and no error is raised.
- [ ] The dispatch includes the source run's repository context but does not require a user identity (userId is empty string, matching the existing `onArtifactConfirmed` implementation).
- [ ] Triggered runs appear in the repository's workflow runs list with trigger attribution showing the source artifact and source workflow.
- [ ] Artifact-triggered workflow runs appear correctly in the workflow run detail view with full trigger metadata.

### Edge Cases

- [ ] An artifact that remains in `pending` status (upload never confirmed) does NOT trigger any workflows.
- [ ] An artifact transitioning to `expired` status does NOT trigger workflows — only the `pending` → `ready` transition fires the trigger.
- [ ] Confirming multiple artifacts from the same workflow run dispatches one trigger evaluation per artifact, potentially creating multiple downstream runs per artifact.
- [ ] If the artifact confirmation and trigger dispatch fail partway through (e.g., after confirming the artifact but before completing dispatch), the artifact remains in `ready` status and the missed trigger is not automatically retried.
- [ ] A workflow definition that triggers on its own workflow's artifacts does NOT create an infinite loop — the same artifact can only be confirmed once, so re-triggering from the same artifact is naturally idempotent.
- [ ] If the source workflow run is deleted between artifact confirmation and trigger evaluation, the dispatch proceeds with whatever metadata is available (the source workflow name may be empty).
- [ ] An artifact with a name containing path separators (e.g., `"dist/app/bundle.js"`) is matched against glob patterns as a flat string — `"dist/*"` matches `"dist/bundle.js"` but not `"dist/app/bundle.js"` because `*` does not cross `/`.
- [ ] A repository with zero active workflow definitions: artifact confirmation succeeds; dispatch is a no-op.
- [ ] Concurrent artifact confirmations from the same run: each dispatches independently; possible duplicate downstream runs for overlapping trigger configs are acceptable.
- [ ] A workflow artifact trigger with an empty `workflows` array matches all source workflows (same as omitting the field).
- [ ] A workflow artifact trigger with an empty `names` array matches all artifact names (same as omitting the field).

### Boundary Constraints

- [ ] The `workflows` filter array accepts strings of 1–255 characters each. Glob metacharacters `*`, `?`, `[`, `]` are allowed. Maximum 50 entries in the array.
- [ ] The `names` filter array accepts strings of 1–255 characters each. Glob metacharacters `*`, `?`, `[`, `]` are allowed. Maximum 50 entries in the array.
- [ ] Source workflow names are matched case-insensitively; artifact names are matched case-sensitively.
- [ ] The trigger event's `ref` field uses the source run's `triggerRef`.
- [ ] The trigger event's `commitSHA` field uses the source run's `triggerCommitSha`.
- [ ] The trigger event's `artifactName` is the exact artifact name string from the confirmed artifact record.
- [ ] The trigger event's `sourceWorkflow` is the resolved definition name of the source run.
- [ ] Maximum of 100 workflow definitions are evaluated per dispatch event.
- [ ] Glob pattern matching uses the same `globMatch` implementation as all other trigger types.

## Design

### Workflow Authoring (TypeScript SDK)

Users define workflow artifact triggers using the `on.workflowArtifact` builder from `@codeplane/workflow`:

```typescript
import { Workflow, Task, on } from "@codeplane/workflow";

// Trigger on any artifact from the "build" workflow
export default (
  <Workflow
    name="deploy-on-build-artifact"
    triggers={[on.workflowArtifact({ workflows: ["build"] })]}
  >
    <Task name="deploy" run="./deploy.sh" />
  </Workflow>
);
```

```typescript
// Trigger on specific artifact name patterns from specific workflows
export default (
  <Workflow
    name="publish-dist"
    triggers={[
      on.workflowArtifact({
        workflows: ["build", "build-*"],
        names: ["dist/*.zip", "dist/*.tar.gz"],
      }),
    ]}
  >
    <Task name="publish" run="./publish.sh" />
  </Workflow>
);
```

```typescript
// Trigger on any artifact from any workflow in the repository
export default (
  <Workflow
    name="artifact-notifier"
    triggers={[on.workflowArtifact()]}
  >
    <Task name="notify" run="./notify.sh" />
  </Workflow>
);
```

**Builder API:**

| Builder | Filter | Behavior |
|---------|--------|----------|
| `on.workflowArtifact()` | None | Triggers on any artifact confirmation in the repo |
| `on.workflowArtifact({ workflows: [...] })` | Source workflow | Triggers only for artifacts from named workflows |
| `on.workflowArtifact({ names: [...] })` | Artifact name | Triggers only for artifacts with matching names |
| `on.workflowArtifact({ workflows: [...], names: [...] })` | Both | Both filters must match (AND) |

The builder produces a `WorkflowArtifactTriggerDescriptor`:

```typescript
interface WorkflowArtifactTriggerDescriptor {
  _type: "workflow_artifact";
  workflows?: string[];
  names?: string[];
}
```

### Workflow Configuration (JSON)

The rendered JSON configuration uses the `workflow_artifact` key under `on`:

```json
{
  "on": {
    "workflow_artifact": {
      "workflows": ["build", "build-*"],
      "names": ["dist/*.zip", "dist/*.tar.gz"]
    }
  }
}
```

Omitting either `workflows` or `names` means "match all" for that dimension.

### API Shape

No new API endpoints are introduced. Artifact triggers operate through the existing artifact confirmation lifecycle. When an artifact upload is confirmed (status → `ready`), the handler calls `WorkflowService.onArtifactConfirmed()` which resolves the source workflow name via `getWorkflowDefinitionNameByRunID`, then calls `dispatchForEvent` with a `TriggerEvent` of type `workflow_artifact`.

**TriggerEvent payload shape:**

```json
{
  "type": "workflow_artifact",
  "ref": "main",
  "commitSHA": "abc123def456...",
  "action": "ready",
  "artifactName": "dist/bundle.zip",
  "sourceWorkflow": "build"
}
```

**Triggered runs are visible via:**
- `GET /api/repos/:owner/:repo/workflows/runs` — lists all runs including artifact-triggered
- `GET /api/repos/:owner/:repo/workflows/runs/:id` — run detail includes trigger metadata

### Web UI Design

**Workflow Runs List:**
- Trigger column shows "Artifact `<name>` from `<workflow>`" with artifact name in monospace badge
- Source workflow name links to source definition

**Workflow Run Detail — Trigger Metadata:**
- Event type: `workflow_artifact`, Action: `ready`
- Source workflow (linked), Artifact name (linked to source run's artifacts), Ref, Commit SHA (linked)

**Workflow Definition View — Trigger Section:**
- "Workflow Artifact" card showing workflow filter patterns and name filter patterns
- If no filters: "Any artifact from any workflow"

### CLI Command

No new commands. Existing commands surface artifact-triggered runs:

- `workflow run list` — trigger column: `artifact:<name> from <workflow>`
- `workflow run view <id>` — trigger metadata includes artifact name, source workflow, ref, commit
- `workflow view <id>` — trigger section shows `workflow_artifact:` with filters

**Example `workflow run list` output:**
```
ID   WORKFLOW           TRIGGER                                STATUS    DURATION  CREATED
45   deploy-on-build    artifact:dist/bundle.zip from build    success   1m 23s    5m ago
```

**Example `workflow run view 45` output:**
```
Run #45 — deploy-on-build
Status:    success
Duration:  1m 23s
Created:   2026-03-22 10:15:00 UTC

Trigger:
  Type:       workflow_artifact
  Action:     ready
  Artifact:   dist/bundle.zip
  Source:     build (Run #43)
  Ref:        main
  Commit:     abc123d
```

### TUI UI

- Workflow runs screen shows artifact-triggered runs with trigger source format matching CLI
- Run detail shows full trigger metadata
- Definition view shows artifact trigger config in the triggers panel
- `Enter` on source workflow name navigates to definition view

### Documentation

1. **Workflow Triggers Reference — Workflow Artifact section**: `workflow_artifact` trigger type, `workflows`/`names` filter options, glob syntax, case-sensitivity rules, AND semantics, TypeScript SDK and JSON examples.
2. **Workflow Authoring Guide — Multi-Stage Pipelines with Artifact Triggers**: Tutorial: build → test → deploy pipeline connected by artifact triggers, complete two-workflow example.
3. **Workflow Authoring Guide — Artifact Trigger Patterns**: Common patterns (all artifacts, specific names, specific workflows, combined), glob examples, path separator edge cases.
4. **Workflow Triggers Reference — Event Payload**: Document `TriggerEvent` fields for artifact events (`type`, `ref`, `commitSHA`, `action`, `artifactName`, `sourceWorkflow`).

## Permissions & Security

### Authorization

| Action | Required Role | Notes |
|--------|--------------|-------|
| **Uploading/confirming an artifact** (which triggers dispatch) | Workflow execution context | Artifacts are created by running workflow steps, not by direct user API calls. The dispatch inherits the source run's repository context. |
| **Viewing triggered workflow runs** | Repository Read or higher | Follows existing workflow run visibility rules. |
| **Authoring workflow definitions with `workflow_artifact` triggers** | Repository Admin or Workflow Write | Same as existing workflow definition management. |

### Key Security Constraints

- Artifact-triggered dispatch does not carry a user identity (`userId` is empty string). The dispatch runs under system context because artifacts are confirmed by the workflow execution engine.
- Workflow runs triggered by artifact events have the same secret access scope as any other workflow run — repository secrets and variables are available.
- Artifact name and source workflow name are repository-internal metadata visible to anyone with read access.
- No PII is exposed through the trigger mechanism.
- Cannot be exploited for cross-repository dispatch — artifact confirmation is scoped to the source run's repository.

### Rate Limiting

- Subject to the same per-repository workflow dispatch rate limit as other trigger types.
- Single artifact event can trigger at most 100 runs (broadcast dispatch page cap).
- High-frequency artifact confirmation naturally bounded by workflow execution engine upload rate.
- Existing repository-level rate limiting on workflow run creation provides abuse protection.
- No additional trigger-type-specific rate limits needed.

### Data Privacy

- Artifact names may contain project identifiers but are not PII.
- Source workflow names are internal identifiers, not sensitive.
- Trigger event payloads contain refs, commit SHAs, artifact names, workflow names — all accessible to repository readers.

## Telemetry & Product Analytics

### Business Events

| Event Name | Fires When | Properties |
|------------|-----------|------------|
| `WorkflowTriggeredByArtifact` | A workflow run is created due to an artifact confirmation event | `repository_id`, `workflow_definition_id`, `workflow_run_id`, `source_workflow_run_id`, `source_workflow_name`, `artifact_name`, `trigger_ref`, `trigger_commit_sha`, `matched_definitions_count`, `timestamp` |
| `WorkflowArtifactDispatchSkipped` | An artifact was confirmed but no workflows matched | `repository_id`, `source_workflow_run_id`, `source_workflow_name`, `artifact_name`, `active_definition_count`, `timestamp` |
| `WorkflowArtifactDispatchFailed` | The trigger dispatch call failed | `repository_id`, `source_workflow_run_id`, `source_workflow_name`, `artifact_name`, `error_message`, `timestamp` |
| `WorkflowArtifactTriggerChainCreated` | An artifact-triggered run itself produces an artifact that triggers another run | `repository_id`, `chain_depth`, `root_workflow_name`, `artifact_name`, `timestamp` |

### Common Properties (all events)

- `timestamp`, `codeplane_version`, `server_instance_id`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|----------|
| Artifact confirmation events dispatched / day | Baseline within 30 days | Volume of trigger-eligible events |
| Workflow runs created per artifact event | 0.5–3.0 avg | Fan-out ratio; >5 indicates overly broad configs |
| % of repositories with ≥1 active `workflow_artifact` trigger | >5% within 90 days | Adoption rate |
| Dispatch latency (confirmed → run queued) | < 500ms p99 | Tight feedback loops |
| % of artifact events with ≥1 matched workflow | 10–50% | Balance: not too broad, not too narrow |
| Chain depth distribution | >95% at depth 1, <1% at depth 3+ | Prevents accidental deep chains |
| Error rate in dispatch | < 1% | Reliable pipeline automation |

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Artifact trigger dispatch started | `info` | `repository_id`, `source_workflow_run_id`, `source_workflow_name`, `artifact_name`, `trigger_ref`, `trigger_commit_sha` | After artifact confirmation, before evaluating definitions |
| Source workflow name resolved | `debug` | `repository_id`, `source_workflow_run_id`, `source_workflow_name` | After `getWorkflowDefinitionNameByRunID` returns |
| Source workflow name resolution failed | `warn` | `repository_id`, `source_workflow_run_id`, `error` | When resolution returns null/error |
| Workflow definition matched | `debug` | `repository_id`, `artifact_name`, `source_workflow_name`, `workflow_definition_id`, `workflow_name`, `matched_workflow_filter`, `matched_name_filter` | When a definition matches |
| Workflow run created from artifact event | `info` | `repository_id`, `artifact_name`, `source_workflow_name`, `source_workflow_run_id`, `workflow_run_id`, `workflow_name` | After run created |
| No definitions matched | `debug` | `repository_id`, `artifact_name`, `source_workflow_name`, `checked_definition_count` | Zero matches |
| Dispatch failed | `warn` | `repository_id`, `source_workflow_run_id`, `artifact_name`, `source_workflow_name`, `error` | When `dispatchForEvent` errors |
| Dispatch completed | `info` | `repository_id`, `artifact_name`, `source_workflow_name`, `runs_created_count`, `definitions_evaluated_count`, `dispatch_duration_ms` | After all evaluation done |

All logs include `request_id` for correlation.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_artifact_trigger_dispatch_total` | Counter | `repository_id`, `status` (success/error/no_match) | Total dispatch attempts |
| `codeplane_workflow_artifact_trigger_runs_created_total` | Counter | `repository_id` | Total runs created |
| `codeplane_workflow_artifact_trigger_dispatch_duration_seconds` | Histogram | — | Dispatch latency. Buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5 |
| `codeplane_workflow_artifact_trigger_definitions_evaluated` | Histogram | — | Definitions checked per dispatch. Buckets: 0, 1, 5, 10, 25, 50, 100 |
| `codeplane_workflow_artifact_trigger_runs_per_event` | Histogram | — | Runs per artifact event. Buckets: 0, 1, 2, 3, 5, 10, 25 |
| `codeplane_workflow_artifact_trigger_chain_depth` | Histogram | — | Chain depth. Buckets: 1, 2, 3, 5, 10 |

### Alerts & Runbooks

**Alert: `WorkflowArtifactTriggerDispatchErrorRate`**
- **Condition**: `rate(codeplane_workflow_artifact_trigger_dispatch_total{status="error"}[5m]) / rate(codeplane_workflow_artifact_trigger_dispatch_total[5m]) > 0.05`
- **Severity**: Warning (P2)
- **Runbook**:
  1. Check error volume and affected repositories via the counter labels.
  2. Search logs for `msg="Dispatch failed"` with `artifact_name` and `source_workflow_name`.
  3. Common causes: DB connection pool exhaustion (check `codeplane_db_pool_active_connections`), config parsing errors, source run deleted before dispatch.
  4. If isolated to one repo, inspect workflow definitions for malformed configs.
  5. If systemic, check DB health (`SELECT 1`), server memory, restart workflow service.
  6. Escalate if unresolved after 15 minutes.

**Alert: `WorkflowArtifactTriggerDispatchLatencyHigh`**
- **Condition**: `histogram_quantile(0.99, rate(codeplane_workflow_artifact_trigger_dispatch_duration_seconds_bucket[5m])) > 2`
- **Severity**: Warning (P3)
- **Runbook**:
  1. Check definitions-evaluated histogram for repos with many definitions.
  2. Check DB query latency for `listWorkflowDefinitionsByRepo` and `createWorkflowRun`.
  3. Check if `resolveSourceWorkflowName` is slow (join between runs and definitions).
  4. If single repo: check definition count.
  5. If systemic: check DB indexing, connection pooling, server load.

**Alert: `WorkflowArtifactTriggerChainDepthExcessive`**
- **Condition**: `histogram_quantile(0.99, rate(codeplane_workflow_artifact_trigger_chain_depth_bucket[15m])) > 5`
- **Severity**: Informational (P4)
- **Runbook**:
  1. Identify repo with deep chains.
  2. Review workflow definitions for chain structure.
  3. Contact repo admin to verify intentional design.
  4. Help refactor if accidental.

**Alert: `WorkflowArtifactTriggerHighFanout`**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_workflow_artifact_trigger_runs_per_event_bucket[15m])) > 20`
- **Severity**: Informational (P4)
- **Runbook**:
  1. Identify repo and source workflow.
  2. Review definitions for overly broad triggers.
  3. Suggest narrowing filters to repo admin.
  4. Apply per-repo rate limit if causing resource pressure.

### Error Cases and Failure Modes

| Error Case | Behavior | Recovery |
|------------|----------|----------|
| Source workflow name resolution fails | Dispatch proceeds with empty `sourceWorkflow`; only wildcard triggers match | Automatic — degraded but functional |
| DB failure during definition lookup | Dispatch fails; logged as `warn`; artifact stays `ready` | Automatic on transient errors; DB restart for persistent |
| DB failure during run creation | Individual run fails; others still created | Manual dispatch as fallback |
| Malformed definition config | Definition skipped; `matchTrigger` returns `false` | Admin fixes definition |
| Dispatch not called (code regression) | Artifact `ready` but no runs fire | Detect via stalled alert; rollback |
| High-frequency confirmations | Independent dispatch per artifact; elevated DB load | Rate limiting on run creation; latency alert |
| Glob syntax error in config | Pattern match fails safely (no match, no crash) | Admin corrects pattern |

## Verification

### Trigger Matching Logic Tests

- [ ] **MATCH-ART-001**: `matchTrigger` returns `true` for artifact event matching workflow name filter — Config `{ on: { workflow_artifact: { workflows: ["build"] } } }`, event `{ type: "workflow_artifact", action: "ready", artifactName: "dist.zip", sourceWorkflow: "build", ref: "main", commitSHA: "abc" }`. Expect `true`.
- [ ] **MATCH-ART-002**: Returns `false` for non-matching workflow — Config `{ workflows: ["build"] }`, event `sourceWorkflow: "test"`. Expect `false`.
- [ ] **MATCH-ART-003**: Returns `true` for artifact name glob match — Config `{ names: ["dist/*.zip"] }`, event `artifactName: "dist/bundle.zip"`. Expect `true`.
- [ ] **MATCH-ART-004**: Returns `false` for non-matching artifact name glob — Config `{ names: ["dist/*.zip"] }`, event `artifactName: "dist/bundle.tar.gz"`. Expect `false`.
- [ ] **MATCH-ART-005**: Returns `true` for wildcard (no filters) — Config `{ on: { workflow_artifact: {} } }`. Expect `true`.
- [ ] **MATCH-ART-006**: Returns `true` for empty arrays — Config `{ workflows: [], names: [] }`. Expect `true`.
- [ ] **MATCH-ART-007**: Returns `false` when no `workflow_artifact` key — Config `{ on: { push: {} } }`. Expect `false`.
- [ ] **MATCH-ART-008**: Workflow name matching is case-insensitive — Config `{ workflows: ["BUILD"] }`, event `sourceWorkflow: "build"`. Expect `true`.
- [ ] **MATCH-ART-009**: Artifact name matching is case-sensitive — Config `{ names: ["Dist.zip"] }`, event `artifactName: "dist.zip"`. Expect `false`.
- [ ] **MATCH-ART-010**: AND semantics — both filters must match. Workflow matches but name doesn't → `false`.
- [ ] **MATCH-ART-011**: AND semantics — both match → `true`.
- [ ] **MATCH-ART-012**: Workflow name glob pattern `"build-*"` matches `"build-linux"`. Expect `true`.
- [ ] **MATCH-ART-013**: Workflow name glob no match — `"build-*"` vs `"test"`. Expect `false`.
- [ ] **MATCH-ART-014**: Multiple workflow name patterns — `["build", "compile-*"]` matches `"compile-arm64"`. Expect `true`.
- [ ] **MATCH-ART-015**: Multiple artifact name patterns — `["*.zip", "*.tar.gz"]` matches `"dist.tar.gz"`. Expect `true`.
- [ ] **MATCH-ART-016**: Question mark glob — `"report-?.html"` matches `"report-A.html"`. Expect `true`.
- [ ] **MATCH-ART-017**: Character class glob — `"[abc]*.log"` matches `"a-test.log"`. Expect `true`.
- [ ] **MATCH-ART-018**: Null config → `false`, no crash.
- [ ] **MATCH-ART-019**: Config missing `on` key → `false`.
- [ ] **MATCH-ART-020**: Empty `sourceWorkflow` with workflow filter → `false`.
- [ ] **MATCH-ART-021**: Empty `artifactName` with name filter → `false`.
- [ ] **MATCH-ART-022**: Path separator behavior — `"dist/*"` does NOT match `"dist/app/bundle.js"`. Expect `false`.
- [ ] **MATCH-ART-023**: Maximum filter arrays (50 workflows, 50 names) — completes without timeout.
- [ ] **MATCH-ART-024**: Maximum-length pattern (255 chars) — works correctly.

### SDK Trigger Builder Tests

- [ ] **SDK-ART-001**: `on.workflowArtifact()` → `{ _type: "workflow_artifact" }`.
- [ ] **SDK-ART-002**: `on.workflowArtifact({ workflows: ["build"] })` → correct descriptor.
- [ ] **SDK-ART-003**: `on.workflowArtifact({ names: ["dist/*"] })` → correct descriptor.
- [ ] **SDK-ART-004**: Both filters → correct descriptor with both.
- [ ] **SDK-ART-005**: Rendered JSON config matches expected shape.
- [ ] **SDK-ART-006**: Empty arrays → `{ _type: "workflow_artifact", workflows: [], names: [] }`.

### API Integration Tests (`e2e/api/workflow-artifact-trigger.test.ts`)

- [ ] **API-WART-001**: Confirm artifact with matching trigger → run created.
- [ ] **API-WART-002**: Confirm artifact with no triggers → no runs, no error.
- [ ] **API-WART-003**: Source workflow name matches filter → run created.
- [ ] **API-WART-004**: Source workflow name doesn't match → no run.
- [ ] **API-WART-005**: Artifact name matches glob → run created.
- [ ] **API-WART-006**: Artifact name doesn't match → no run.
- [ ] **API-WART-007**: Both filters match → run created.
- [ ] **API-WART-008**: Workflows matches, names doesn't → no run (AND).
- [ ] **API-WART-009**: Wildcard trigger → run for any artifact.
- [ ] **API-WART-010**: Multiple definitions match → multiple runs.
- [ ] **API-WART-011**: Inactive definition → no run.
- [ ] **API-WART-012**: Triggered run metadata: type=workflow_artifact, action=ready, artifactName, sourceWorkflow, ref, commitSHA.
- [ ] **API-WART-013**: Pending artifact → no dispatch.
- [ ] **API-WART-014**: Multiple artifacts from same run → independent dispatch each.
- [ ] **API-WART-015**: Path-like name `"dist/app/bundle.js"` matches `"dist/app/*"` not `"dist/*"`.
- [ ] **API-WART-016**: Case-insensitive workflow matching.
- [ ] **API-WART-017**: Case-sensitive artifact name matching.
- [ ] **API-WART-018**: Dispatch failure doesn't affect artifact status.
- [ ] **API-WART-019**: Triggered run in runs list with correct trigger info.
- [ ] **API-WART-020**: 100 matching definitions → 100 runs.
- [ ] **API-WART-021**: 101 matching definitions → at most 100 runs.
- [ ] **API-WART-022**: Max-length artifact name (255 chars) → correct matching.
- [ ] **API-WART-023**: Max-length filter pattern (255 chars) → works.
- [ ] **API-WART-024**: 50 workflow + 50 name filters → correct results.
- [ ] **API-WART-025**: Deleted source run → dispatch with empty sourceWorkflow; only wildcards match.
- [ ] **API-WART-026**: Chain test: A→artifact→B→artifact→C at depth 2.

### CLI Integration Tests (`e2e/cli/workflow-artifact-trigger.test.ts`)

- [ ] **CLI-WART-001**: `workflow run list` shows trigger `artifact:<name> from <workflow>`.
- [ ] **CLI-WART-002**: `workflow run view` shows trigger type, action, artifact, source workflow.
- [ ] **CLI-WART-003**: `workflow run list --json` includes trigger metadata.
- [ ] **CLI-WART-004**: `workflow view` shows artifact trigger config.
- [ ] **CLI-WART-005**: `workflow view` for wildcard trigger shows all-artifact indication.

### Web UI Playwright Tests (`e2e/web/workflow-artifact-trigger.test.ts`)

- [ ] **WEB-WART-001**: Runs list shows artifact-triggered run with correct trigger source.
- [ ] **WEB-WART-002**: Run detail shows trigger metadata.
- [ ] **WEB-WART-003**: Definition view shows artifact trigger card with filters.
- [ ] **WEB-WART-004**: Wildcard trigger shows "Any artifact from any workflow".
- [ ] **WEB-WART-005**: Source workflow link navigates to definition.
- [ ] **WEB-WART-006**: Real-time run appearance via SSE.
- [ ] **WEB-WART-007**: Multiple artifact-triggered runs from multi-artifact run all appear.

### TUI Tests (`e2e/tui/workflow-artifact-trigger.test.ts`)

- [ ] **TUI-WART-001**: Runs screen shows trigger source format.
- [ ] **TUI-WART-002**: Run detail shows trigger metadata.
- [ ] **TUI-WART-003**: Definition view shows artifact trigger section.
- [ ] **TUI-WART-004**: Enter on source workflow navigates to definition.

### E2E Pipeline Tests (`e2e/api/workflow-artifact-trigger-pipeline.test.ts`)

- [ ] **E2E-PIPE-001**: Full pipeline — push triggers build, build produces artifact, artifact triggers deploy.
- [ ] **E2E-PIPE-002**: Non-matching artifact — build produces wrong artifact, deploy does NOT run.
- [ ] **E2E-PIPE-003**: Fan-out — one artifact triggers three downstream workflows.
- [ ] **E2E-PIPE-004**: Chain — A→artifact→B→artifact→C, all three run in sequence.

All tests must be left failing if backend is not yet implemented — never skipped or commented out.
