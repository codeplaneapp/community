# WORKFLOW_TRIGGER_SCHEDULE

Specification for WORKFLOW_TRIGGER_SCHEDULE.

## High-Level User POV

As a Codeplane user, I want my workflows to run automatically on a recurring schedule so that time-based automation — nightly builds, periodic dependency audits, scheduled deployments, health-check sweeps, and recurring report generation — happens reliably without anyone clicking "dispatch" every time.

When I define a workflow in my repository, I can attach one or more schedule triggers using standard cron expressions. Codeplane evaluates these cron expressions on the server and fires workflow runs at the specified times. I can see upcoming scheduled runs and past schedule-triggered runs in the workflow UI, and I have confidence that the system will not fire duplicate runs, will not silently skip a scheduled tick, and will recover gracefully if the server restarts between ticks.

Schedule triggers are a "set it and forget it" experience: I author the cron expression once in my workflow definition, and Codeplane takes care of computing the next fire time, persisting the schedule, claiming due schedules in a distributed-safe manner, and creating runs at the right moments. I can inspect the schedule, disable it by removing the trigger from the workflow definition, and observe its behavior from the web UI, CLI, and TUI.

Schedule triggers complement Codeplane's other trigger types (push, issue, landing request, release, manual dispatch, etc.) and can be combined with them. A single workflow definition may have both a schedule trigger and a push trigger, meaning it fires on both cron ticks and code pushes.

## Acceptance Criteria

### Core Behavior
- [ ] A workflow definition with `on.schedule` containing a valid cron expression is automatically registered as a schedule spec when the definition is discovered or updated by the server.
- [ ] The server background scheduler polls for due schedule specs and creates workflow runs at or shortly after the specified cron fire time.
- [ ] Schedule-triggered workflow runs carry `trigger_type: "schedule"` in their metadata and are identifiable as schedule-triggered in all client surfaces.
- [ ] Multiple cron expressions may be specified on a single workflow definition (e.g., `[on.schedule("0 * * * *"), on.schedule("0 0 * * 0")]`), and each fires independently.
- [ ] A workflow definition with both schedule and non-schedule triggers fires on both schedule ticks and the other trigger events independently.

### Cron Expression Validation
- [ ] Standard 5-field cron expressions are accepted: `minute hour day-of-month month day-of-week`.
- [ ] Extended 6-field cron expressions with a seconds field are rejected with a clear validation error.
- [ ] The minimum allowed interval between schedule ticks is **5 minutes**. Cron expressions that resolve to intervals shorter than 5 minutes (e.g., `* * * * *` for every minute, `*/2 * * * *` for every 2 minutes) are rejected at definition registration time.
- [ ] Cron expressions longer than **128 characters** are rejected.
- [ ] Empty cron strings (`""`) are rejected.
- [ ] Cron expressions with invalid field values (e.g., `61 * * * *`, `* 25 * * *`, `* * 32 * *`) are rejected.
- [ ] Cron expressions containing non-standard extensions (e.g., `@hourly`, `@daily`) are accepted if and only if the cron parsing library supports them, and are otherwise rejected with a clear error.
- [ ] Validation errors are surfaced to the user with the exact cron expression that failed and a human-readable reason.

### Schedule Lifecycle
- [ ] When a workflow definition is created or updated with schedule triggers, schedule specs are upserted in the database with the correct `next_fire_at` timestamp.
- [ ] When a workflow definition is deleted, all associated schedule specs are deleted.
- [ ] When a workflow definition is updated to remove a schedule trigger (but keep the definition), the corresponding schedule spec is deleted.
- [ ] When a workflow definition is updated to change a cron expression, the old schedule spec is replaced with the new one and `next_fire_at` is recalculated from the current time.
- [ ] If the server restarts, overdue schedule specs (where `next_fire_at` is in the past) are claimed and fired on the first scheduler tick after restart rather than being silently skipped.

### Distributed Safety
- [ ] In a multi-instance deployment, only one server instance claims and fires each due schedule spec. The `FOR UPDATE SKIP LOCKED` pattern prevents duplicate run creation.
- [ ] After a schedule spec is claimed and fired, its `next_fire_at` is updated to the next cron occurrence, preventing re-firing.
- [ ] If a claimed schedule spec fails to produce a workflow run (e.g., due to a transient error), the schedule spec's `next_fire_at` is still advanced to prevent infinite retry loops, and the failure is logged.

### Edge Cases
- [ ] A repository that is archived does not fire scheduled workflow runs.
- [ ] A repository where workflows are disabled at the settings level does not fire scheduled workflow runs.
- [ ] If a cron expression evaluates to a `next_fire_at` that is unreasonably far in the future (e.g., February 30), the system logs a warning and skips that spec until the definition is corrected.
- [ ] Schedule triggers do not produce runs for empty/uninitialized repositories (no content to build against).
- [ ] Duplicate schedule specs (same workflow definition ID + same cron expression) are handled via upsert — no duplicate rows are created.

### Definition of Done
- [ ] Schedule trigger fires correctly for standard cron expressions (hourly, daily, weekly, monthly, custom).
- [ ] Schedule specs are persisted, claimed, fired, and advanced correctly in both single-instance and multi-instance modes.
- [ ] All client surfaces (Web UI, CLI, TUI) display schedule trigger information and schedule-triggered runs.
- [ ] Cron validation rejects all invalid and below-minimum-interval expressions with clear error messages.
- [ ] The feature is documented in the workflow authoring guide.
- [ ] All verification tests pass.

## Design

### Workflow Authoring (SDK Shape)

Users author schedule triggers using the `on.schedule()` builder from `@codeplane/workflow`:

```typescript
import { on, Workflow, Task } from "@codeplane/workflow";

export default Workflow({
  name: "nightly-audit",
  triggers: [on.schedule("0 2 * * *")], // every day at 2:00 AM UTC
  children: Task({
    id: "audit",
    children: "Run dependency audit",
  }),
});
```

Multiple schedules:
```typescript
triggers: [
  on.schedule("0 * * * *"),       // every hour
  on.schedule("0 0 * * 0"),       // every Sunday at midnight
],
```

The `on.schedule(cron)` function accepts a single string argument — the 5-field cron expression. It returns a `ScheduleTriggerDescriptor` with shape `{ _type: "schedule", cron: string }`.

### API Shape

#### Schedule spec inspection

**`GET /api/v1/repos/:owner/:repo/workflows/:workflow_id/schedules`**

Returns the list of active schedule specs for a workflow definition.

Response:
```json
{
  "schedules": [
    {
      "id": "sched_abc123",
      "cron_expression": "0 2 * * *",
      "next_fire_at": "2026-03-23T02:00:00Z",
      "prev_fire_at": "2026-03-22T02:00:00Z",
      "created_at": "2026-03-01T00:00:00Z"
    }
  ]
}
```

#### Workflow run detail includes trigger metadata

**`GET /api/v1/repos/:owner/:repo/workflows/runs/:run_id`**

The run response includes:
```json
{
  "trigger_type": "schedule",
  "trigger_meta": {
    "cron_expression": "0 2 * * *",
    "scheduled_at": "2026-03-22T02:00:00Z"
  }
}
```

#### Validation error response

When a workflow definition with an invalid cron expression is registered, the API returns:
```json
{
  "error": "invalid_schedule_trigger",
  "message": "Cron expression '* * * * *' resolves to an interval shorter than the minimum of 5 minutes.",
  "field": "on.schedule[0].cron"
}
```

### Web UI Design

#### Workflow definition detail page

- The trigger section of the workflow detail page displays each schedule trigger with:
  - The raw cron expression (e.g., `0 2 * * *`)
  - A human-readable description (e.g., "Every day at 2:00 AM UTC")
  - The next scheduled fire time, rendered in the user's local timezone with a relative time tooltip (e.g., "in 4 hours")
  - The last fire time, if available
- Schedule triggers are visually distinguished from other trigger types with a clock icon.

#### Workflow runs list

- Runs triggered by a schedule display a "Scheduled" badge/tag with the clock icon, distinct from "Push", "Manual", "Issue", etc.
- A filter option in the runs list allows filtering by `trigger_type = schedule`.

#### Repository workflows list

- Workflow definitions with active schedule triggers display a "Scheduled" indicator and the next fire time in the list row.

### CLI Command

#### View schedule specs

```
codeplane workflow schedules <workflow-name> [--repo owner/repo] [--json]
```

Output:
```
CRON EXPRESSION    NEXT FIRE            PREV FIRE            
0 2 * * *          2026-03-23 02:00 UTC 2026-03-22 02:00 UTC
0 0 * * 0          2026-03-29 00:00 UTC 2026-03-23 00:00 UTC
```

With `--json`:
```json
[
  {
    "cron_expression": "0 2 * * *",
    "next_fire_at": "2026-03-23T02:00:00Z",
    "prev_fire_at": "2026-03-22T02:00:00Z"
  }
]
```

#### Filter runs by schedule trigger

```
codeplane run list --trigger schedule [--repo owner/repo]
```

### TUI UI

#### Workflow detail screen

- Display schedule triggers in the workflow detail view with the cron expression and next/prev fire times.
- Use a clock icon or `[scheduled]` label to distinguish schedule triggers.

#### Run list

- Schedule-triggered runs display a `[scheduled]` tag in the run list.

### Documentation

The following end-user documentation should be written:

1. **Workflow Schedule Triggers Guide** — A dedicated page explaining:
   - How to add schedule triggers to a workflow definition using `on.schedule()`
   - Cron expression syntax with examples (every hour, every day at midnight, every Monday, first of month, etc.)
   - The 5-minute minimum interval restriction and why it exists
   - How multiple schedule triggers work on a single workflow
   - How schedule triggers combine with other trigger types
   - How to inspect upcoming and past scheduled runs from the Web UI, CLI, and TUI
   - Timezone behavior (all cron expressions are evaluated in UTC)
   - What happens when the server restarts (overdue schedules fire on recovery)

2. **Workflow Triggers Reference** — An addition to the triggers reference page with:
   - `on.schedule(cron: string)` API documentation
   - Accepted cron expression format
   - Validation rules and error messages
   - Examples table

3. **CLI Reference update** — Document `codeplane workflow schedules` and `codeplane run list --trigger schedule`.

## Permissions & Security

### Authorization

| Role | Can author schedule triggers | Can view schedule specs | Can view schedule-triggered runs |
|------|------------------------------|------------------------|----------------------------------|
| Repository Owner | Yes | Yes | Yes |
| Repository Admin | Yes | Yes | Yes |
| Repository Write Member | Yes | Yes | Yes |
| Repository Read Member | No | Yes | Yes |
| Anonymous | No | No (private repo) / Yes (public repo) | No (private repo) / Yes (public repo) |

- Only users with write access to the repository can create or modify workflow definitions containing schedule triggers.
- The schedule evaluation background worker runs with system-level permissions and does not impersonate a user. Runs created by schedule triggers are attributed to the "Codeplane System" actor rather than a specific user.
- Repository admins can disable all workflow triggers (including schedules) at the repository settings level. When triggers are disabled, schedule specs remain in the database but are not evaluated until re-enabled.

### Rate Limiting

- The 5-minute minimum interval enforced at cron validation time is the primary abuse prevention mechanism.
- A maximum of **20 schedule specs per repository** is enforced. Attempts to register more than 20 active schedule triggers across all workflow definitions in a repository are rejected with a clear error.
- A maximum of **5 schedule specs per workflow definition** is enforced.
- The schedule claiming worker processes at most **50 due schedule specs per tick** (configurable), preventing a thundering-herd scenario where thousands of specs fire simultaneously.

### Data Privacy

- Cron expressions are not PII. They are stored in plaintext.
- Schedule specs reference `repository_id` and `workflow_definition_id` but do not contain user-specific data.
- Workflow run logs and artifacts produced by schedule-triggered runs follow the same access control as any other workflow run.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|---|---|---|
| `workflow.schedule_spec.created` | A schedule spec is upserted for the first time | `repository_id`, `workflow_definition_id`, `cron_expression`, `next_fire_at` |
| `workflow.schedule_spec.updated` | A schedule spec's cron expression or next_fire_at is updated | `repository_id`, `workflow_definition_id`, `old_cron_expression`, `new_cron_expression` |
| `workflow.schedule_spec.deleted` | A schedule spec is removed (definition updated or deleted) | `repository_id`, `workflow_definition_id`, `cron_expression` |
| `workflow.schedule_trigger.fired` | A schedule spec is claimed and a run is created | `repository_id`, `workflow_definition_id`, `cron_expression`, `scheduled_at`, `actual_fire_at`, `drift_ms` |
| `workflow.schedule_trigger.skipped` | A due schedule spec is skipped (archived repo, disabled workflows) | `repository_id`, `workflow_definition_id`, `cron_expression`, `skip_reason` |
| `workflow.schedule_trigger.validation_failed` | A cron expression fails validation | `repository_id`, `cron_expression`, `failure_reason` |

### Funnel Metrics

- **Schedule adoption rate**: % of repositories with at least one active schedule spec.
- **Schedule reliability**: % of expected schedule fires that produced a successful workflow run within 60 seconds of the target fire time.
- **Schedule drift (p50/p95/p99)**: Time between `next_fire_at` and actual run creation timestamp, measuring how closely the system hits cron targets.
- **Schedule churn rate**: Frequency of schedule spec creation/deletion, indicating whether users are iterating frequently (possible UX friction) or setting and forgetting (healthy).

## Observability

### Logging

| Log Point | Level | Structured Context |
|---|---|---|
| Schedule spec upserted | `info` | `repository_id`, `workflow_definition_id`, `cron_expression`, `next_fire_at` |
| Schedule spec deleted | `info` | `repository_id`, `workflow_definition_id`, `cron_expression` |
| Schedule claim sweep started | `debug` | `batch_limit`, `tick_timestamp` |
| Schedule specs claimed | `info` | `claimed_count`, `spec_ids[]` |
| Schedule run created | `info` | `repository_id`, `workflow_definition_id`, `run_id`, `cron_expression`, `scheduled_at`, `drift_ms` |
| Schedule run creation failed | `error` | `repository_id`, `workflow_definition_id`, `cron_expression`, `error_message`, `stack_trace` |
| Schedule spec skipped (archived/disabled) | `warn` | `repository_id`, `workflow_definition_id`, `cron_expression`, `skip_reason` |
| Next fire time calculated | `debug` | `schedule_spec_id`, `cron_expression`, `prev_fire_at`, `next_fire_at` |
| Cron validation rejected | `warn` | `cron_expression`, `validation_error` |
| Schedule claim sweep completed | `debug` | `claimed_count`, `fired_count`, `skipped_count`, `error_count`, `sweep_duration_ms` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_workflow_schedule_specs_total` | Gauge | `repository_id` | Current count of active schedule specs |
| `codeplane_workflow_schedule_claim_sweep_total` | Counter | `status` (claimed, fired, skipped, errored) | Total claim sweep outcomes |
| `codeplane_workflow_schedule_claim_sweep_duration_seconds` | Histogram | — | Duration of each claim sweep tick |
| `codeplane_workflow_schedule_fire_drift_seconds` | Histogram | — | Drift between target fire time and actual run creation |
| `codeplane_workflow_schedule_runs_created_total` | Counter | `repository_id` | Total runs created by schedule triggers |
| `codeplane_workflow_schedule_validation_failures_total` | Counter | `reason` | Cron validation failures |
| `codeplane_workflow_schedule_overdue_specs` | Gauge | — | Count of specs where `next_fire_at` is in the past (should be near zero) |

### Alerts

#### Alert: `ScheduleClaimSweepStalled`
- **Condition**: `codeplane_workflow_schedule_claim_sweep_total` has not incremented in the last 5 minutes.
- **Severity**: Critical
- **Runbook**:
  1. Check if the server process is running (`systemctl status codeplane` or container health).
  2. Check the CleanupScheduler logs for panic/crash: `grep "[schedule]" /var/log/codeplane/server.log | tail -50`.
  3. Check database connectivity: run a simple `SELECT 1` query against the database.
  4. If the scheduler timer stopped, restart the server process. The scheduler is idempotent and will recover on restart.
  5. Check if a long-running database transaction is blocking the `FOR UPDATE SKIP LOCKED` query: `SELECT * FROM pg_locks WHERE relation = 'workflow_schedule_specs'::regclass`.
  6. If blocked, terminate the blocking transaction and verify the scheduler resumes.

#### Alert: `ScheduleFireDriftHigh`
- **Condition**: `codeplane_workflow_schedule_fire_drift_seconds` p95 exceeds 120 seconds for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check the scheduler tick interval — if it is set to 60s, a 120s drift may indicate the tick is taking too long or being delayed.
  2. Check `codeplane_workflow_schedule_claim_sweep_duration_seconds` for unusually long sweep times.
  3. Check database load: high query latency can delay claims.
  4. Check if the claim batch limit is too low relative to the number of due specs. Increase `scheduleClaimBatchSize` if many specs fire simultaneously.
  5. Check server CPU/memory for resource contention from other background workers.

#### Alert: `ScheduleOverdueSpecsAccumulating`
- **Condition**: `codeplane_workflow_schedule_overdue_specs` > 10 for 10 minutes.
- **Severity**: Critical
- **Runbook**:
  1. This means specs are falling behind and not being claimed. First check if the claim sweep is running at all (see `ScheduleClaimSweepStalled` runbook).
  2. Check if specs are being claimed but not advanced: look for `"Schedule run creation failed"` error logs.
  3. If specs are stuck with `next_fire_at = '9999-12-31T23:59:59Z'`, this indicates a claim that was never followed by a fire-time update. Manually reset these specs: `UPDATE workflow_schedule_specs SET next_fire_at = NOW() WHERE next_fire_at = '9999-12-31T23:59:59Z'::timestamptz`.
  4. Investigate why the update phase failed — check for database write errors or transaction timeouts.

#### Alert: `ScheduleRunCreationFailureRate`
- **Condition**: Rate of `codeplane_workflow_schedule_claim_sweep_total{status="errored"}` exceeds 10% of `{status="claimed"}` over a 15-minute window.
- **Severity**: Warning
- **Runbook**:
  1. Check error logs for `"Schedule run creation failed"` entries. The `error_message` field will indicate the cause.
  2. Common causes: workflow definition was deleted between claim and fire (race condition — benign), database constraint violation (investigate schema state), repository no longer exists (orphaned spec — clean up manually).
  3. If errors are transient (connection timeouts), they will self-heal. Monitor for 15 more minutes.
  4. If errors persist, check if a migration is needed or if specs reference deleted definitions. Run: `SELECT wss.* FROM workflow_schedule_specs wss LEFT JOIN workflow_definitions wd ON wss.workflow_definition_id = wd.id WHERE wd.id IS NULL`.

### Error Cases and Failure Modes

| Failure Mode | Behavior | Recovery |
|---|---|---|
| Invalid cron expression at definition time | Rejected with 400 error, schedule spec not created | User corrects the cron expression |
| Server restarts between claim and fire | Claimed spec has `next_fire_at = '9999-12-31...'`; on restart, it is not re-claimed until manually reset or the alert fires | Alert triggers runbook; manual fix or automated recovery sweep |
| Database unavailable during claim sweep | Sweep logs error and retries on next tick | Automatic on DB recovery |
| Workflow definition deleted after spec exists | `deleteWorkflowScheduleSpecsByDefinition` removes orphaned specs | Automatic via definition lifecycle |
| Repository archived after spec exists | Claim sweep checks repo status and skips archived repos | Spec remains but is inert; fires again if unarchived |
| Cron resolves to past date (leap year edge, etc.) | next_fire_at is far future or invalid; logged as warning, spec skipped | User updates the cron expression |

## Verification

### API Integration Tests

1. **Register workflow definition with valid schedule trigger** — POST a workflow definition with `on.schedule("0 2 * * *")` and verify a schedule spec is created with correct `cron_expression` and `next_fire_at`.
2. **Register workflow definition with multiple schedule triggers** — POST a definition with two `on.schedule` entries and verify two schedule specs are created.
3. **Reject invalid cron expression (too many fields)** — POST with `on.schedule("0 0 0 * * *")` (6 fields) and verify 400 response with `invalid_schedule_trigger` error.
4. **Reject below-minimum-interval cron** — POST with `on.schedule("* * * * *")` (every minute) and verify 400 response citing the 5-minute minimum.
5. **Reject empty cron string** — POST with `on.schedule("")` and verify 400 response.
6. **Reject cron string exceeding 128 characters** — POST with a 129-character cron string and verify 400 response.
7. **Reject invalid field values** — POST with `on.schedule("61 * * * *")` and verify 400 response.
8. **Accept maximum valid cron length (128 chars)** — POST with a 128-character valid cron string (padded with valid syntax) and verify 200 response.
9. **Update workflow definition changes schedule spec** — PUT a definition changing `on.schedule("0 2 * * *")` to `on.schedule("0 3 * * *")` and verify the old spec is removed and a new spec with the updated cron is created.
10. **Delete workflow definition removes schedule specs** — DELETE a definition and verify all associated schedule specs are gone.
11. **Remove schedule trigger from definition** — PUT a definition removing the `on.schedule` entry but keeping the definition, and verify schedule specs are deleted.
12. **GET schedule specs for a workflow** — Call `GET /workflows/:id/schedules` and verify the response includes all active schedule specs with correct fields.
13. **Schedule-triggered run has correct trigger metadata** — After a schedule fires, GET the created run and verify `trigger_type: "schedule"` and `trigger_meta.cron_expression`.
14. **Enforce max 20 schedule specs per repository** — Register workflow definitions with schedules until hitting the limit and verify the 21st spec is rejected.
15. **Enforce max 5 schedule specs per workflow definition** — Register 6 `on.schedule` entries on a single definition and verify the 6th is rejected.
16. **Upsert handles duplicate cron expression on same definition** — Register the same cron twice and verify only one spec exists (upsert behavior).

### Schedule Firing Integration Tests

17. **Claim due schedule spec creates a workflow run** — Insert a schedule spec with `next_fire_at` in the past, run the claim sweep, and verify a workflow run is created with the correct trigger metadata.
18. **Claimed spec advances next_fire_at** — After firing, verify the spec's `next_fire_at` is updated to the next cron occurrence and `prev_fire_at` is set to the fire time.
19. **Overdue specs fire on server restart** — Insert specs with `next_fire_at` in the past (simulating server downtime), start the scheduler, and verify they fire on the first sweep.
20. **Archived repository schedules are skipped** — Archive a repository, insert a due schedule spec, run the sweep, and verify no run is created and the spec is skipped with a logged reason.
21. **Disabled workflow triggers are skipped** — Disable workflows at the repo settings level, insert a due schedule spec, run the sweep, and verify no run is created.
22. **Multiple server instances do not duplicate runs** — Concurrently run two claim sweeps against the same set of due specs and verify exactly one run per spec is created (test the `SKIP LOCKED` behavior).
23. **Failed run creation still advances next_fire_at** — Simulate a run creation failure (e.g., missing workflow definition) and verify the spec's `next_fire_at` is still advanced to prevent infinite retries.
24. **Sweep respects batch limit** — Insert 100 due specs, set batch limit to 10, run one sweep, and verify exactly 10 specs are claimed.

### CLI Integration Tests

25. **`codeplane workflow schedules` lists schedule specs** — Create a workflow with a schedule trigger and verify the CLI command outputs the cron expression, next fire time, and prev fire time.
26. **`codeplane workflow schedules --json` returns JSON** — Verify the `--json` output matches the expected schema.
27. **`codeplane run list --trigger schedule` filters runs** — Create both schedule-triggered and push-triggered runs, and verify the filter returns only schedule-triggered runs.
28. **`codeplane workflow schedules` with no schedules** — Run the command against a workflow without schedule triggers and verify a clean "No schedules configured" message.

### Web UI E2E (Playwright) Tests

29. **Workflow detail page shows schedule trigger info** — Navigate to a workflow definition detail page and verify the schedule trigger displays the cron expression, human-readable description, and next fire time.
30. **Workflow runs list shows "Scheduled" badge** — Navigate to the runs list and verify schedule-triggered runs have a distinct "Scheduled" badge.
31. **Runs list filter by schedule trigger** — Apply the schedule trigger filter and verify only schedule-triggered runs are shown.
32. **Workflow list shows "Scheduled" indicator** — Navigate to the repository workflows list and verify workflow definitions with schedule triggers display a schedule indicator with next fire time.
33. **Invalid cron expression shows validation error in definition UI** — If a definition editing UI exists, enter an invalid cron expression and verify the validation error is displayed inline.

### TUI E2E Tests

34. **TUI workflow detail screen shows schedule info** — Navigate to the workflow detail screen in the TUI and verify schedule triggers are listed with cron expression and timing info.
35. **TUI run list shows `[scheduled]` tag** — Verify schedule-triggered runs are tagged appropriately in the TUI run list.

### Trigger Builder Unit Tests (packages/workflow)

36. **`on.schedule("0 * * * *")` produces correct descriptor** — Verify `{ _type: "schedule", cron: "0 * * * *" }`.
37. **`on.schedule("*/15 * * * *")` produces correct descriptor** — Verify `{ _type: "schedule", cron: "*/15 * * * *" }`.
38. **`on.schedule("0 0 1 1 *")` produces correct descriptor for yearly** — Verify yearly cron.
39. **`on.schedule("0 9 * * 1-5")` produces correct descriptor for weekdays** — Verify weekday range.

### Cron Validation Tests

40. **Valid: `"0 2 * * *"`** — Accepted.
41. **Valid: `"*/5 * * * *"`** — Accepted (exactly 5-minute interval).
42. **Valid: `"0 0 * * 0"`** — Accepted (weekly).
43. **Valid: `"0 0 1 * *"`** — Accepted (monthly).
44. **Valid: `"15,45 * * * *"`** — Accepted (twice per hour at :15 and :45, 30-min interval).
45. **Invalid: `"* * * * *"`** — Rejected (every minute, below 5-min minimum).
46. **Invalid: `"*/2 * * * *"`** — Rejected (every 2 minutes, below minimum).
47. **Invalid: `"*/4 * * * *"`** — Rejected (every 4 minutes, below minimum).
48. **Invalid: `""`** — Rejected (empty string).
49. **Invalid: `"0 0 0 * * *"`** — Rejected (6 fields).
50. **Invalid: `"61 * * * *"`** — Rejected (minute out of range).
51. **Invalid: `"* 25 * * *"`** — Rejected (hour out of range).
52. **Invalid: `"* * 32 * *"`** — Rejected (day out of range).
53. **Invalid: `"not a cron"`** — Rejected (unparseable).
54. **Boundary: cron expression at exactly 128 characters** — Accepted.
55. **Boundary: cron expression at 129 characters** — Rejected.

### Database-Level Tests

56. **Upsert creates new spec** — Insert via `upsertWorkflowScheduleSpec` and verify row exists.
57. **Upsert updates existing spec** — Insert twice with same `(workflow_definition_id, cron_expression)` and verify only one row exists with updated fields.
58. **Claim skips locked rows** — Start a transaction holding a lock on a spec, run `claimDueWorkflowScheduleSpecs` in a separate connection, and verify the locked row is not claimed.
59. **Delete by definition removes all specs** — Insert multiple specs for one definition, delete, and verify all are gone.
60. **Update fire times correctly sets prev and next** — Call `updateWorkflowScheduleFireTimes` and verify both `prev_fire_at` and `next_fire_at` are correctly persisted.
