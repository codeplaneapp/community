# WORKFLOW_TRIGGER_PUSH

Specification for WORKFLOW_TRIGGER_PUSH.

## High-Level User POV

As a developer pushing changes to a Codeplane repository, I want workflows to automatically trigger on push events so that CI/CD pipelines run without manual intervention. The push trigger should evaluate against bookmark patterns, change ID patterns, and path filters to determine which workflows to execute.

## Acceptance Criteria

1. Workflows with `on: push` triggers fire when bookmarks are updated via git/jj push
2. Bookmark pattern matching supports glob patterns (e.g., `main`, `release/*`) for include/exclude
3. Path filters (`paths` and `paths-ignore`) correctly scope trigger evaluation to changed files
4. Change ID pattern matching works for jj-native push events
5. Push events carry correct payload: repository, pusher, ref, before/after commit IDs, and list of changed files
6. Multiple workflows can trigger from a single push event
7. Push triggers respect repository-level workflow enablement settings
8. Force pushes are correctly identified in the event payload
9. Tag pushes are distinguishable from bookmark pushes
10. Trigger evaluation completes within 500ms of push event receipt

## Design

The push trigger is evaluated in the workflow service's trigger evaluation pipeline (`packages/sdk/src/services/workflow.ts`). When a push event is received from the repo-host layer (SSH transport or Smart HTTP transport), it is dispatched to `WorkflowService.evaluateTriggers()` with event type `push`. The trigger evaluator matches against workflow definition `on.push` configurations, checking bookmark patterns, path filters, and change ID patterns. Matched workflows are enqueued as new runs. The push event payload follows the shape: `{ ref, before, after, repository, pusher, commits, head_commit, forced }`. The SSE manager emits workflow run creation events for real-time UI updates. The trigger evaluation uses the same glob matching library used for path filters across all trigger types.

## Permissions & Security

Push trigger evaluation respects repository write access — only pushes from authenticated users with write permission (or deploy keys with write scope) result in trigger evaluation. Workflow runs created by push triggers inherit the pusher's identity for audit purposes but execute with the workflow's configured permission set. Repository admins can enable/disable workflow triggers at the repository settings level.

## Telemetry & Product Analytics

Track: `workflow.trigger.push.evaluated` (count of push events evaluated), `workflow.trigger.push.matched` (count of workflows matched per push), `workflow.trigger.push.latency_ms` (time from push receipt to run creation), `workflow.trigger.push.pattern_match_failures` (debugging mismatched patterns). Include dimensions: repository_id, bookmark_pattern, has_path_filter, is_force_push.

## Observability

Structured log entries at key points: push event received (info), trigger evaluation started (debug), pattern match results per workflow definition (debug), workflow run created (info), trigger evaluation completed with match count (info). Error logging for: malformed push payloads, failed workflow definition lookups, run creation failures. Health endpoint includes trigger evaluation queue depth. SSE events emitted for workflow run status changes visible in web UI, TUI, and editor integrations.

## Verification

1. Unit tests for bookmark glob pattern matching (exact, wildcard, negation)
2. Unit tests for path filter evaluation (paths, paths-ignore, combined)
3. Unit tests for change ID pattern matching (jj-native)
4. Integration test: push to repository triggers matching workflow run creation
5. Integration test: push with no matching triggers creates no runs
6. Integration test: force push correctly sets `forced: true` in payload
7. Integration test: multiple workflow definitions matched from single push
8. E2E test: SSH push triggers workflow visible in web UI run list
9. E2E test: Smart HTTP push triggers workflow with correct event payload
10. Performance test: trigger evaluation for 50 workflow definitions completes under 500ms
