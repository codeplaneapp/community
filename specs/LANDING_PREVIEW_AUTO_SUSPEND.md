# LANDING_PREVIEW_AUTO_SUSPEND

Specification for LANDING_PREVIEW_AUTO_SUSPEND.

## High-Level User POV

When a developer or reviewer creates a preview environment for a Landing Request, that preview runs in a container consuming compute resources. In practice, most previews are accessed intensely for a few minutes — during a review session or demo — and then sit idle for hours or even days until the Landing Request is eventually landed or closed. Without automatic suspension, these idle containers waste CPU, memory, and port allocations, which is especially costly on self-hosted Community Edition servers with limited resources.

Codeplane's Landing Request Preview Auto-Suspend feature solves this by automatically detecting when a preview has not received any HTTP traffic for a configurable period (defaulting to 15 minutes) and gracefully suspending the container. The preview is not destroyed — its filesystem, installed dependencies, and configuration are preserved — it simply stops consuming active compute resources. The preview URL remains valid; if anyone visits it after suspension, the preview is automatically woken up.

From the user's perspective, this is largely invisible. The preview status on the Landing Request detail page transitions from "Running" to "Suspended" after the idle period, and a small visual indicator reflects this state. Users do not need to configure or manage suspension — it happens in the background. Repository administrators who want tighter or looser resource control can adjust the idle timeout through repository settings or the `.codeplane/preview.ts` configuration file, giving them fine-grained control over how aggressively previews are suspended.

The net effect is that teams can create previews freely without worrying about resource sprawl. A team with ten open Landing Requests, each with a preview, may only have one or two previews actually running at any given time — the rest are suspended and ready to wake on demand. This keeps the self-hosted experience lean and responsive without requiring manual cleanup discipline from developers.

## Acceptance Criteria

### Definition of Done

- Running preview environments that receive no HTTP traffic for the configured idle timeout period are automatically suspended.
- The default idle timeout is 15 minutes (900 seconds).
- Suspended previews retain their container filesystem and configuration; only the running process state is stopped.
- The preview status transitions from `"running"` to `"suspended"` upon auto-suspension.
- The preview URL remains valid after suspension (it does not change or become unresolvable).
- The idle timer is reset every time the preview receives an HTTP request through the reverse proxy layer.
- The Landing Request detail page in all clients (web, CLI, TUI) reflects the `"suspended"` status.
- Auto-suspension is triggered by a periodic background cleanup job and/or per-preview idle timers.
- Preview containers that were already in `"starting"`, `"stopped"`, or `"failed"` states are not affected by the auto-suspend logic.
- Server shutdown clears idle timers without force-stopping containers (containers persist for manual or LR-lifecycle cleanup).

### Functional Constraints

- [ ] The idle timeout default is 15 minutes (900,000 milliseconds). This value must be a compile-time constant (`PREVIEW_IDLE_TIMEOUT_MS`).
- [ ] The idle timeout is configurable per-preview via the `PreviewConfig` in `.codeplane/preview.ts` (field: `idleTimeoutSeconds`). If specified, it overrides the default.
- [ ] The configurable idle timeout must be a positive integer between 60 (1 minute) and 86400 (24 hours). Values outside this range must be clamped or rejected at creation time.
- [ ] Only previews with `status === "running"` are eligible for auto-suspension. Previews in `"starting"`, `"suspended"`, `"stopped"`, or `"failed"` states must not be suspended.
- [ ] The `last_accessed_at` timestamp on the preview record must be updated every time `recordAccess()` is called by the reverse proxy.
- [ ] Idle detection must compare `Date.now() - last_accessed_at >= idleTimeoutMs` when evaluating whether to suspend.
- [ ] When a preview is suspended, the container must be stopped via `sandbox.suspendVM(containerId)` (which maps to `docker stop` / `podman stop`).
- [ ] When a preview is suspended, its `status` field must be updated to `"suspended"` in the in-memory preview record.
- [ ] Idle timers for a specific preview must be cleared when the preview is deleted.
- [ ] Idle timers for a specific preview must be cleared when the preview is already suspended.
- [ ] Idle timers must be rescheduled (reset) whenever `recordAccess()` updates `last_accessed_at`.
- [ ] The `suspendIdlePreviews()` method must be callable by the `CleanupScheduler` as a periodic sweep in addition to per-preview timers.
- [ ] The `suspendIdlePreviews()` sweep must return the count of previews suspended in that sweep cycle.
- [ ] If the `sandbox.suspendVM()` call fails (e.g., container already stopped externally, Docker daemon error), the error must be caught, logged at ERROR level, and the preview status should be synced from the container runtime state.
- [ ] Auto-suspension must not affect previews whose containers have been externally removed. If the container no longer exists when suspension is attempted, the preview record should be updated to `"stopped"` or `"failed"` status.
- [ ] Multiple concurrent suspension attempts on the same preview (e.g., timer fires while sweep is running) must not cause errors or double-stop calls. The operation must be idempotent.

### Edge Cases

- [ ] If the server restarts, in-memory idle timers are lost. The `suspendIdlePreviews()` sweep (triggered by CleanupScheduler) must re-evaluate all running previews on startup and suspend any that exceed their idle timeout based on `last_accessed_at`.
- [ ] If a preview receives traffic at the exact moment the idle timer fires, the timer callback must re-check `last_accessed_at` before suspending. If the access occurred within the timeout window, the timer must be rescheduled rather than suspending.
- [ ] If `last_accessed_at` is in the future due to clock skew, the preview must not be suspended (idle duration would be negative).
- [ ] If a preview was created but never accessed (e.g., the user created it but never visited the URL), the `last_accessed_at` equals `created_at`, and the preview should still be suspended after the idle timeout elapses from creation time.
- [ ] If the container runtime becomes unavailable during a suspend attempt, the error must be logged and the preview status must remain `"running"` (rather than being marked `"suspended"` without actually stopping the container).
- [ ] Suspending a preview that is currently being woken by another request (race between suspend timer and wake-on-access) must not corrupt the preview state. The wake operation should take precedence.

## Design

### API Shape

There is no dedicated "suspend" API endpoint for auto-suspension — auto-suspension is an internal, server-side behavior. However, the preview status is reflected through the existing preview status endpoint:

**Endpoint:** `GET /api/repos/:owner/:repo/landings/:number/preview`

**Response when preview is suspended:**
```json
{
  "id": "42:7",
  "repository_id": 42,
  "lr_number": 7,
  "status": "suspended",
  "url": "http://localhost:49321",
  "container_id": "codeplane-preview-lr7-a1b2c3",
  "container_port": 3000,
  "host_port": 49321,
  "last_accessed_at": "2026-03-22T14:30:00.000Z",
  "created_at": "2026-03-22T14:15:00.000Z"
}
```

The `status` field changes from `"running"` to `"suspended"`. The `url`, `container_id`, and port fields remain unchanged. The `last_accessed_at` field reflects the last time the preview received HTTP traffic before suspension.

**Admin preview listing endpoint:** `GET /api/admin/previews`

Returns all previews with their current status, useful for administrators monitoring resource usage and identifying suspended previews.

### SDK Shape

The `PreviewService` in `@codeplane/sdk` exposes the following auto-suspend-related surface:

```typescript
// Internal — called by CleanupScheduler periodically
suspendIdlePreviews(): Promise<number>

// Internal — per-preview idle timer management
scheduleIdleCheck(key: string): void

// Internal — suspends a single preview container
suspendPreview(key: string, record: PreviewRecord): Promise<void>

// Called by reverse proxy — resets idle timer
recordAccess(repositoryId: number, lrNumber: number): Promise<PreviewResponse | null>

// Cleanup — clears all idle timers on server shutdown
cleanup(): Promise<void>
```

**Constants:**
```typescript
const PREVIEW_IDLE_TIMEOUT_MS = 15 * 60 * 1000  // 15 minutes
```

**Extended `PreviewConfig` type (for configurable timeout):**
```typescript
interface PreviewConfig {
  port: number
  install?: string
  start: string
  env?: Record<string, string>
  idleTimeoutSeconds?: number  // 60–86400, defaults to 900
}
```

### Web UI Design

**Location:** Landing Request detail page, preview status section.

**Status Display:**

When a preview transitions to `"suspended"` status, the preview card on the Landing Request detail page updates:

- The status badge changes from a green "Running" badge to an amber "Suspended" badge.
- The preview URL remains visible and clickable. Clicking it navigates to the preview URL, which triggers auto-resume (handled by LANDING_PREVIEW_AUTO_RESUME).
- A brief explanatory line appears below the URL: "Suspended due to inactivity. Will wake automatically when accessed."
- A manual "Wake Preview" button is displayed, which calls the `POST /api/repos/:owner/:repo/landings/:number/preview` endpoint (idempotent create/wake).

**Real-time status transitions:**

The web UI should subscribe to preview status changes via SSE or polling so that the status badge transitions from "Running" → "Suspended" in near real-time without requiring a page refresh. The recommended approach is a periodic poll (every 30 seconds) of the preview status endpoint while the LR detail page is visible.

**Repository Settings:**

Under Repository Settings → Preview Environments, a "Default Idle Timeout" field allows repository admins to set a repository-level default idle timeout (in minutes). This value is used when `.codeplane/preview.ts` does not specify `idleTimeoutSeconds`. The field is a numeric input with a minimum of 1 and maximum of 1440 (24 hours).

### CLI Command

There is no dedicated CLI command for auto-suspension (it is automatic). The `codeplane preview status` command reflects the current state:

**Command:** `codeplane preview status`

**Usage:**
```
codeplane preview status [--repo <owner/repo>] [--lr <number>]
```

**Output when preview is suspended:**
```
Preview for landing request #7
  Status:       suspended
  URL:          http://localhost:49321
  Last accessed: 15 minutes ago
  Created:      2026-03-22T14:15:00.000Z
```

**JSON Output (`--json`):**
```json
{
  "id": "42:7",
  "status": "suspended",
  "url": "http://localhost:49321",
  "last_accessed_at": "2026-03-22T14:30:00.000Z",
  "created_at": "2026-03-22T14:15:00.000Z"
}
```

### TUI UI

**Location:** Landing Request detail screen, "Preview" section.

**Display when suspended:**
```
Preview: http://localhost:49321 (suspended — last accessed 15m ago)
  Press [p] to wake
```

The URL is rendered as a terminal hyperlink (OSC 8) so it can be clicked in supported terminals. Pressing `p` triggers a wake via the idempotent create endpoint.

### `.codeplane/preview.ts` Configuration

The `definePreview()` function accepts an optional `idleTimeoutSeconds` field:

```typescript
import { definePreview } from "@codeplane-ai/workflow"

export default definePreview({
  port: 3000,
  install: "bun install",
  start: "bun run dev",
  idleTimeoutSeconds: 600, // Suspend after 10 minutes of inactivity
})
```

If omitted, the default of 900 seconds (15 minutes) is used.

### Documentation

The following end-user documentation should be written:

1. **Guide: "How Preview Auto-Suspend Works"** — Explains the idle detection behavior, the 15-minute default, what "suspended" means (container stopped, filesystem preserved), and how wake-on-access restores the preview. Includes guidance on when to adjust the timeout.

2. **Reference: `idleTimeoutSeconds` in `.codeplane/preview.ts`** — Documents the configuration field, its valid range (60–86400), default value, and interaction with the repository-level default setting. Explains the priority: per-preview config > repository setting > system default.

3. **Admin Guide: "Managing Preview Resources"** — How to monitor active and suspended previews via the admin API. How to set repository-level defaults. How the CleanupScheduler handles idle previews. Troubleshooting guidance for previews that won't suspend or wake.

## Permissions & Security

### Authorization

Auto-suspension is a system-initiated action and does not require user authorization. However, the related surfaces have the following access model:

| Role | Can view preview status (including "suspended")? | Can configure idle timeout in repo settings? | Can view admin preview listing? |
|------|--------------------------------------------------|----------------------------------------------|-------------------------------|
| Repository Owner | ✅ Yes | ✅ Yes | Only via admin role |
| Repository Admin | ✅ Yes | ✅ Yes | Only via admin role |
| Repository Write (Member) | ✅ Yes | ❌ No | ❌ No |
| Repository Read | ✅ Yes | ❌ No | ❌ No |
| Anonymous / Unauthenticated | ❌ No (401) | ❌ No | ❌ No |
| System Admin | ✅ Yes | ✅ Yes | ✅ Yes |

### Rate Limiting

- Auto-suspension is a server-internal operation and is not subject to API rate limits.
- The `recordAccess()` method (called by the reverse proxy on every HTTP request to a preview URL) is high-frequency and must not be rate-limited, as doing so would prevent idle timer resets and cause premature suspension.
- The preview status endpoint (`GET .../preview`) is subject to the standard per-user API rate limit (60 requests/minute).
- The CleanupScheduler sweep interval should not run more frequently than once per 60 seconds to avoid excessive container runtime queries.

### Data Privacy

- No PII is involved in the auto-suspend flow. The `last_accessed_at` timestamp is derived from HTTP request arrival time, not from any user identity.
- Structured log entries for suspension events must include only `repository_id`, `lr_number`, and `container_id` — never the content of the preview's HTTP traffic.
- The idle timeout value configured in `.codeplane/preview.ts` is not sensitive and can be logged freely.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `LandingPreviewAutoSuspended` | A running preview is suspended due to idle timeout | `repository_id`, `lr_number`, `repo_owner`, `repo_name`, `idle_duration_ms` (actual time since last access), `configured_timeout_ms`, `container_id`, `preview_age_ms` (time since creation), `total_accesses` (number of `recordAccess` calls since last wake) |
| `LandingPreviewAutoSuspendFailed` | The auto-suspend attempt failed (e.g., Docker error) | `repository_id`, `lr_number`, `container_id`, `error_type` (e.g., "container_not_found", "docker_error", "timeout"), `error_message` |
| `LandingPreviewIdleSweepCompleted` | The periodic `suspendIdlePreviews()` sweep finished | `total_running_previews` (count evaluated), `suspended_count` (count suspended in this sweep), `sweep_duration_ms`, `errors_count` |

### Funnel Metrics

| Metric | Description | Success Indicator |
|--------|-------------|-------------------|
| Auto-suspend success rate | `LandingPreviewAutoSuspended` / (`LandingPreviewAutoSuspended` + `LandingPreviewAutoSuspendFailed`) | > 99% |
| Average idle-to-suspend time | Mean `idle_duration_ms` across `LandingPreviewAutoSuspended` events | Should cluster tightly around `configured_timeout_ms` (±30 seconds) |
| Preview resource efficiency | Average ratio of time spent `"running"` vs total preview lifetime | Lower is better (more time suspended = less wasted resource) |
| Previews suspended per sweep | Mean `suspended_count` from `LandingPreviewIdleSweepCompleted` | Informational — validates that timers are catching most cases; sweep should catch few |
| Wake-after-suspend rate | Count of `LandingPreviewWokenViaCreate` events / `LandingPreviewAutoSuspended` events | Higher indicates previews are useful and accessed again; lower means previews could have been deleted instead |

## Observability

### Logging

| Log Point | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Idle timer scheduled | DEBUG | `preview_key`, `timeout_ms` | Emitted when a new idle timer is set or rescheduled after access |
| Idle timer fired — evaluating | DEBUG | `preview_key`, `idle_duration_ms`, `configured_timeout_ms` | Emitted when the idle timer callback runs, before deciding to suspend or reschedule |
| Preview auto-suspended | INFO | `preview_key`, `repository_id`, `lr_number`, `container_id`, `idle_duration_ms` | Emitted after successful container suspension |
| Preview auto-suspend skipped (rescheduled) | DEBUG | `preview_key`, `remaining_ms` | Emitted when the timer fires but the preview was recently accessed, so the timer is rescheduled for the remaining time |
| Preview auto-suspend failed | ERROR | `preview_key`, `repository_id`, `lr_number`, `container_id`, `error_type`, `error_message` | Emitted when `sandbox.suspendVM()` fails |
| Idle sweep started | DEBUG | `running_preview_count` | Emitted when `suspendIdlePreviews()` begins |
| Idle sweep completed | INFO | `total_evaluated`, `suspended_count`, `errors_count`, `duration_ms` | Emitted when `suspendIdlePreviews()` finishes |
| Preview not found for suspension | WARN | `preview_key` | Emitted when idle timer fires for a preview that no longer exists in the in-memory map |
| Container externally removed | WARN | `preview_key`, `container_id` | Emitted when attempting to suspend a container that no longer exists in Docker/Podman |
| Idle timer cleared | DEBUG | `preview_key`, `reason` ("deleted" or "suspended" or "shutdown") | Emitted when an idle timer is cleared |
| Access recorded — timer reset | DEBUG | `preview_key`, `new_timeout_ms` | Emitted when `recordAccess()` resets the idle timer |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_preview_auto_suspend_total` | Counter | `status` ("success", "failed", "skipped") | Total auto-suspension attempts by outcome |
| `codeplane_preview_idle_duration_seconds` | Histogram | — | Actual idle duration at time of suspension, bucketed: 60s, 300s, 600s, 900s, 1800s, 3600s, 7200s, 14400s, 43200s, 86400s |
| `codeplane_preview_suspend_duration_seconds` | Histogram | — | Time taken to execute `sandbox.suspendVM()`, bucketed: 0.1s, 0.5s, 1s, 2s, 5s, 10s, 30s |
| `codeplane_preview_active_count` | Gauge | `status` ("running", "starting", "suspended") | Current number of active previews by status (shared with LANDING_PREVIEW_CREATE) |
| `codeplane_preview_idle_sweep_total` | Counter | — | Total number of `suspendIdlePreviews()` sweep cycles executed |
| `codeplane_preview_idle_sweep_suspended` | Counter | — | Total number of previews suspended via the sweep mechanism (as opposed to per-preview timers) |
| `codeplane_preview_idle_sweep_duration_seconds` | Histogram | — | Time taken for each sweep cycle, bucketed: 0.01s, 0.05s, 0.1s, 0.5s, 1s, 5s |
| `codeplane_preview_idle_timer_reschedules_total` | Counter | — | Total number of times idle timers were rescheduled due to recent activity |

### Alerts

#### Alert: `PreviewAutoSuspendHighFailureRate`
**Condition:** `rate(codeplane_preview_auto_suspend_total{status="failed"}[10m]) / rate(codeplane_preview_auto_suspend_total[10m]) > 0.10` for 10 minutes.
**Severity:** Warning

**Runbook:**
1. Check `codeplane_preview_auto_suspend_total` by `status` label. Confirm the `failed` count is elevated.
2. Query server logs for `"Preview auto-suspend failed"` entries filtered by the last 15 minutes. Inspect `error_type` and `error_message` fields.
3. If `error_type="container_not_found"`: Containers are being removed externally (e.g., manual `docker rm`, another orchestrator). Verify no external cron or cleanup job is deleting Codeplane-labeled containers. Check `docker ps -a --filter label=tech.codeplane.preview` to see current container state.
4. If `error_type="docker_error"`: The Docker daemon may be unhealthy. Run `docker info` and `systemctl status docker`. Check host disk space (`df -h`) and memory (`free -m`). Restart the Docker daemon if necessary.
5. If `error_type="timeout"`: The `docker stop` command is hanging. Check for containers with blocking shutdown hooks. Consider lowering the Docker stop timeout or investigating the container's signal handling.
6. Verify that the `codeplane_preview_active_count{status="running"}` gauge is not growing unboundedly (indicating previews that should be suspended are stuck running).

#### Alert: `PreviewIdleSweepNotRunning`
**Condition:** `increase(codeplane_preview_idle_sweep_total[5m]) == 0` for 10 minutes.
**Severity:** Critical

**Runbook:**
1. The CleanupScheduler is not executing the idle preview sweep. Check if the server process is healthy by querying the health endpoint.
2. Check server logs for CleanupScheduler errors or unhandled exceptions.
3. Verify that the CleanupScheduler was started during server bootstrap (search for `"starting cleanup scheduler"` in startup logs).
4. If the server recently restarted and the scheduler hasn't yet fired, wait one sweep interval (60 seconds) and re-evaluate.
5. If the server is running but the scheduler is stuck, restart the server process. File a bug if this recurs.

#### Alert: `PreviewSuspendLatencyHigh`
**Condition:** `histogram_quantile(0.95, rate(codeplane_preview_suspend_duration_seconds_bucket[10m])) > 10` for 10 minutes.
**Severity:** Warning

**Runbook:**
1. The `docker stop` / `podman stop` operation is taking over 10 seconds at p95. This usually means containers are not responding to SIGTERM and Docker is waiting for the kill timeout.
2. Check which containers are slow to stop: `docker events --filter event=die --since 10m`.
3. Inspect the preview application's process in the affected containers — it may not handle SIGTERM gracefully. This is a user-code issue; consider lowering Docker's stop timeout for preview containers (default is 10 seconds).
4. If all containers are slow, check host CPU and I/O — the system may be overloaded.

#### Alert: `PreviewResourceLeakSuspected`
**Condition:** `codeplane_preview_active_count{status="running"} > 20` for 30 minutes.
**Severity:** Warning

**Runbook:**
1. More than 20 previews have been running for over 30 minutes. Under normal operation, most should be auto-suspended after 15 minutes.
2. Check if auto-suspend is functioning: `codeplane_preview_auto_suspend_total` should show recent `success` counts.
3. If `success` count is zero: Check `PreviewIdleSweepNotRunning` alert and logs.
4. If `success` count is normal but running count is high: These previews are receiving continuous traffic. Check `codeplane_preview_idle_timer_reschedules_total` — a high reschedule rate confirms active usage.
5. If reschedule rate is low and running count is high: Idle timers may not be firing. Check for JavaScript timer issues or event loop blocking in the server.
6. As a mitigation, manually trigger the sweep by restarting the server or calling the admin endpoint.

### Error Cases and Failure Modes

| Failure Mode | Detection | User Impact | Recovery |
|--------------|-----------|-------------|----------|
| Docker daemon unavailable during suspend | `suspendVM()` throws connection error | Preview stays "running" consuming resources | Docker daemon auto-restart or manual restart; next sweep retries |
| Container externally removed before suspend | `suspendVM()` throws "container not found" | Preview status becomes stale until next status poll | Preview record updated to "stopped"; user can create new preview |
| Idle timer lost due to server restart | Sweep catches it on next cycle | Up to 60 seconds additional delay before suspension | CleanupScheduler sweep re-evaluates all running previews |
| Race condition: suspend and wake simultaneous | Both operations attempt to modify container state | Potential for inconsistent preview status | Idempotent design — wake operation always does `docker start`, suspend always does `docker stop`; last writer wins, next status poll syncs |
| Event loop blocked — timers delayed | Timer fires late (seconds to minutes) | Preview runs slightly longer than configured timeout | Not harmful; sweep acts as secondary mechanism |
| In-memory map lost (process crash without restart) | No idle timers exist after restart | Previews stay running indefinitely until sweep runs | CleanupScheduler initializes and sweeps on startup |
| `last_accessed_at` not updated (reverse proxy misconfigured) | Preview suspends despite active traffic | User sees intermittent preview downtime | Fix reverse proxy to call `recordAccess()`; preview auto-wakes on next access |

## Verification

### API Integration Tests

| # | Test | Method | Input | Expected |
|---|------|--------|-------|----------|
| 1 | Preview status shows "suspended" after auto-suspend | Create preview, wait for idle timeout, GET status | — | `status: "suspended"` in response |
| 2 | Preview URL unchanged after suspension | Create preview, note URL, wait for suspend, GET status | — | `url` field matches original |
| 3 | `last_accessed_at` reflects last access time, not suspend time | Create preview, access once, wait for suspend, GET status | — | `last_accessed_at` equals the access timestamp, not the suspension timestamp |
| 4 | `container_id` unchanged after suspension | Create preview, note container_id, wait for suspend, GET status | — | Same `container_id` |
| 5 | `container_port` and `host_port` unchanged after suspension | Create preview, note ports, wait for suspend, GET status | — | Same port values |
| 6 | Suspend only affects running previews | Create two previews (LR #1 running, LR #2 already suspended), trigger sweep | — | Only LR #1 transitions to suspended; LR #2 remains unchanged |
| 7 | `suspendIdlePreviews()` returns count of newly suspended | Create 3 previews, let all go idle, call `suspendIdlePreviews()` | — | Returns 3 |
| 8 | `suspendIdlePreviews()` returns 0 when nothing is idle | Create preview, access it, immediately call `suspendIdlePreviews()` | — | Returns 0 |
| 9 | Access resets idle timer | Create preview, wait 10 minutes, call `recordAccess()`, wait 10 more minutes | — | Preview still running (total 20 min but timer reset at 10 min) |
| 10 | Preview suspends exactly after idle timeout | Create preview with 60s timeout, do not access, wait 60–65 seconds | — | Preview status is `"suspended"` |
| 11 | Preview does not suspend before idle timeout | Create preview with 60s timeout, check at 30 seconds | — | Preview status is `"running"` |
| 12 | Admin preview listing shows suspended previews | Create and let preview idle-suspend, GET `/api/admin/previews` | — | Preview appears with `status: "suspended"` |
| 13 | Concurrent suspend attempts are idempotent | Trigger `suspendPreview()` twice simultaneously on same preview | — | No error, preview is `"suspended"`, only one `docker stop` executed |
| 14 | Suspend fails gracefully when container already stopped externally | Create preview, manually `docker stop` the container, trigger suspend | — | No 500 error, preview status synced to `"stopped"` |
| 15 | Suspend fails gracefully when container removed externally | Create preview, manually `docker rm -f` the container, trigger suspend | — | No 500 error, preview status synced to `"stopped"` or `"failed"` |
| 16 | Custom idle timeout of 60 seconds (minimum valid) works | Create preview with `idleTimeoutSeconds: 60`, wait 60–65 seconds | — | Preview is suspended |
| 17 | Custom idle timeout of 86400 seconds (maximum valid) works | Create preview with `idleTimeoutSeconds: 86400`, trigger sweep at 86399s | — | Preview still running |
| 18 | Custom idle timeout below minimum (59) is rejected | Create preview with `idleTimeoutSeconds: 59` | — | 400 error on creation |
| 19 | Custom idle timeout above maximum (86401) is rejected | Create preview with `idleTimeoutSeconds: 86401` | — | 400 error on creation |
| 20 | Custom idle timeout of 0 is rejected | Create preview with `idleTimeoutSeconds: 0` | — | 400 error on creation |
| 21 | Custom idle timeout as negative number is rejected | Create preview with `idleTimeoutSeconds: -60` | — | 400 error on creation |
| 22 | Custom idle timeout as non-integer is rejected | Create preview with `idleTimeoutSeconds: 60.5` | — | 400 error on creation |
| 23 | Preview created without custom timeout uses default 900s | Create preview with no `idleTimeoutSeconds`, verify behavior at 899s and 901s | — | Still running at 899s, suspended by 901s |
| 24 | Deleted preview does not trigger suspend | Create preview, delete it, wait for original idle timeout | — | No suspend attempt, no errors in logs |
| 25 | `recordAccess()` returns `null` for non-existent preview | Call `recordAccess()` with invalid `repositoryId`/`lrNumber` | — | Returns `null`, no error |

### CLI Integration Tests

| # | Test | Command | Expected |
|---|------|---------|----------|
| 26 | CLI preview status shows "suspended" | `codeplane preview status --lr 7` after auto-suspend | Exit 0, output shows `Status: suspended` |
| 27 | CLI preview status shows "last accessed" | `codeplane preview status --lr 7` after auto-suspend | Exit 0, output shows `Last accessed: Xm ago` |
| 28 | CLI preview status JSON output for suspended preview | `codeplane preview status --lr 7 --json` after auto-suspend | Exit 0, JSON with `"status": "suspended"` |
| 29 | CLI preview create wakes suspended preview | `codeplane preview create --lr 7` after auto-suspend | Exit 0, output shows `Status: running` |

### Playwright E2E Tests (Web UI)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 30 | Preview status badge transitions to "Suspended" | Create preview, wait for idle timeout (use short timeout for test), observe detail page | Green "Running" badge transitions to amber "Suspended" badge |
| 31 | Suspended preview shows explanatory text | Navigate to LR detail page with suspended preview | "Suspended due to inactivity" text visible below URL |
| 32 | Preview URL remains visible when suspended | Navigate to LR detail page with suspended preview | URL is visible and rendered as a clickable link |
| 33 | "Wake Preview" button appears when suspended | Navigate to LR detail page with suspended preview | "Wake Preview" button is visible |
| 34 | Clicking "Wake Preview" transitions to "Running" | Click "Wake Preview" on suspended preview | Badge transitions to "Running" after loading state |
| 35 | Status updates without full page refresh | Create preview, keep LR detail page open, wait for suspension | Badge transitions to "Suspended" without page reload (via polling/SSE) |
| 36 | Repo settings shows idle timeout config | Navigate to Repository Settings → Preview Environments | "Default Idle Timeout" field is visible with numeric input |
| 37 | Repo settings accepts valid idle timeout | Enter "10" in idle timeout (minutes), save | Settings saved successfully |
| 38 | Repo settings rejects invalid idle timeout | Enter "0" in idle timeout (minutes), save | Validation error displayed |

### TUI Integration Tests

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 39 | TUI shows suspended status | Open LR detail after auto-suspend | Preview section shows "(suspended — last accessed Xm ago)" |
| 40 | TUI shows `[p] to wake` for suspended preview | Open LR detail with suspended preview | Key hint `[p] to wake` visible |
| 41 | Pressing `p` wakes suspended preview | Press `p` on LR detail screen with suspended preview | Status transitions to "running" |

### Cross-Cutting and Stress Tests

| # | Test | Description | Expected |
|---|------|-------------|----------|
| 42 | Sweep suspends all idle previews | Create 10 previews with 60s timeout, do not access any, wait 70 seconds, trigger sweep | All 10 suspended, `suspendIdlePreviews()` returns 10 |
| 43 | Mixed idle/active previews — sweep only suspends idle ones | Create 5 previews, continuously access 2, let 3 go idle, trigger sweep | 3 suspended, 2 remain running |
| 44 | Server restart recovery — sweep catches orphaned running previews | Create preview, simulate server restart (clear in-memory timers), trigger sweep after timeout | Preview is suspended by sweep even though timer was lost |
| 45 | Rapid access pattern prevents suspension | Create preview with 60s timeout, access every 30 seconds for 5 minutes, then stop | Preview remains running during access period, suspends ~60s after last access |
| 46 | Suspend → Wake → Suspend cycle works cleanly | Create preview, let idle-suspend, wake via create, let idle-suspend again | Both suspensions succeed, preview status correct throughout |
| 47 | Concurrent access and suspend do not corrupt state | While idle timer is about to fire, send concurrent `recordAccess()` calls | Preview either stays running (access wins) or suspends and immediately wakes; no crash or stuck state |
| 48 | Large number of concurrent previews does not cause timer contention | Create 50 previews with various idle timeouts (60s–300s), let them naturally suspend | All eventually suspended, no missed timers, no OOM from timer accumulation |
| 49 | Preview with idleTimeoutSeconds at maximum boundary (86400) — verify timer is created | Create preview with `idleTimeoutSeconds: 86400` | Timer is scheduled; `scheduleIdleCheck` is called; no immediate suspension |
| 50 | Preview with idleTimeoutSeconds at minimum boundary (60) — verify suspension timing | Create preview with `idleTimeoutSeconds: 60`, wait 65 seconds | Preview is suspended |
