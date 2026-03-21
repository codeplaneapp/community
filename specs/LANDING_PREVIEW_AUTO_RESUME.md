# LANDING_PREVIEW_AUTO_RESUME

Specification for LANDING_PREVIEW_AUTO_RESUME.

## High-Level User POV

When a landing request preview environment has been idle and automatically suspended to conserve resources, visitors should never encounter a dead link or a confusing error page. Instead, Codeplane transparently wakes the preview the instant someone navigates to its URL. The user experience is simply a brief loading indication — a few seconds of a "waking up" interstitial — followed by the live preview rendering exactly as it did before it was suspended.

This wake-on-access behavior means that reviewers, stakeholders, and product managers can bookmark a preview URL, come back hours or even days later, and still see the running preview without asking the developer to restart anything. The preview container's filesystem is preserved across suspend cycles, so the application state (installed dependencies, built artifacts, local database files) survives the suspension. Only in-memory runtime state is lost, which means the application goes through its normal startup sequence — but all the heavy dependency installation work is already done.

From the web UI and TUI, users also see the preview's status update in real time. If they're looking at the landing request detail page and the preview badge says "Suspended," accessing the preview URL from any browser tab will cause the badge to transition through "Waking…" to "Running" within seconds. Alternatively, users can explicitly trigger a wake from the landing request detail page by clicking a "Wake Preview" button (web) or pressing a keyboard shortcut (TUI), which is equivalent to accessing the URL.

The auto-resume behavior also protects against a common team frustration: a reviewer opens a preview link shared in a chat message only to find it's offline. With auto-resume, shared preview links are always warm — they wake on first access and remain running until the idle timeout elapses again. This makes preview links safe to share in code review comments, Slack messages, issue threads, and documentation without worrying about whether the preview is currently running.

Auto-resume applies equally in self-hosted Community Edition deployments (where the preview runs on a localhost port via Docker/Podman) and in cloud deployments (where the preview runs behind a subdomain-based reverse proxy). The wake latency depends on the container restart time and the application's startup speed, but in typical cases the preview is accessible again within 5–15 seconds.

## Acceptance Criteria

### Definition of Done

- Accessing the preview URL of a suspended preview environment automatically wakes the preview and serves the request once the container is ready.
- The user sees a brief loading or interstitial indication during wake, not an error page.
- After waking, the preview is fully functional and responds to subsequent requests normally.
- The idle timer is reset after a wake, giving the preview a fresh idle window before the next auto-suspend.
- The preview status transitions from `suspended` → `running` during auto-resume, and this transition is observable from the API, web UI, and TUI.
- Explicit wake actions (web UI "Wake Preview" button, TUI keyboard shortcut, CLI command) behave identically to the auto-wake-on-access path.
- The feature works in both CE (localhost/path-based routing) and cloud (subdomain-based routing) deployment modes.
- The feature degrades gracefully when the container runtime is unavailable (returns an appropriate error, does not hang indefinitely).

### Functional Constraints

- [ ] When an HTTP request arrives at a preview URL and the preview status is `suspended`, the system must automatically call `wakePreview()` before proxying the request.
- [ ] The wake operation must restart the existing container (Docker `start`), not create a new one. The container's filesystem state must be preserved.
- [ ] Port mappings must be re-resolved after container restart because dynamic host ports may change.
- [ ] If port mappings change after wake, the preview response's `host_port` and `url` fields must reflect the new mapping.
- [ ] The preview's `last_accessed_at` timestamp must be updated to the current time on wake.
- [ ] The idle timer must be reset to the full idle timeout duration (default 15 minutes) after a successful wake.
- [ ] If the container fails to start during auto-resume, the preview status must transition to `failed` rather than remaining `suspended`.
- [ ] If the container fails to start, the error must be returned to the client as an HTTP 502 Bad Gateway with a descriptive message (not a generic 500).
- [ ] A wake operation on a preview that is already `running` must be a no-op: update `last_accessed_at`, reset the idle timer, and return the existing state.
- [ ] A wake operation on a preview that is `stopped` or `failed` must return a 404 or 410 error indicating the preview no longer exists (the user must recreate it).
- [ ] The wake operation must not block indefinitely. A timeout of 120 seconds for the container healthcheck must be enforced, with a 502 returned if exceeded.
- [ ] Concurrent wake requests for the same suspended preview must not produce duplicate container start operations. Only one start should occur; subsequent requests must wait or receive the already-waking result.
- [ ] The reverse proxy must hold the incoming HTTP request until the container is ready (not drop or 503 it), up to the healthcheck timeout.
- [ ] The `recordAccess()` method on `PreviewService` must be the single entry point for the wake-on-access path (called by the reverse proxy middleware).
- [ ] During the wake process, `getPreview()` must return status `"starting"` (not `"suspended"`) to indicate the wake is in progress.
- [ ] The web UI preview status badge must reflect the `starting` → `running` transition live via polling or SSE.
- [ ] A preview can only be auto-resumed if it was previously in `suspended` state. Previews in `stopped` or `failed` state are not eligible for auto-resume.
- [ ] If the preview URL points to a preview that has been deleted (not just suspended), the proxy must return 404, not attempt a wake.

### Boundary Constraints

- [ ] Wake timeout must not exceed 120 seconds (the container healthcheck timeout).
- [ ] The interstitial loading page must be returned within 500ms of the initial request, even though the container is not yet ready.
- [ ] The interstitial page must auto-refresh at a configurable interval (default: 2 seconds) until the preview is ready.
- [ ] The interstitial page must display a maximum wait time indication (e.g., "This may take up to 2 minutes").
- [ ] The interstitial page must be a minimal, self-contained HTML page (no external CSS/JS dependencies) to ensure it loads even if the preview app assets are unavailable.
- [ ] If the container starts but the application inside does not bind the configured port within 120 seconds, the proxy must return 502.
- [ ] The `wakePreview` operation must be idempotent: calling it multiple times on the same suspended preview must produce the same result.

### Edge Cases

- [ ] If the underlying Docker daemon is restarted while a preview is suspended, the container may be gone. The wake attempt must detect `not_found` state and transition the preview to `failed` with a descriptive error.
- [ ] If the container's image has been pruned while suspended, the start will fail. This must produce a `failed` status and a clear error message.
- [ ] If the host running the preview is under extreme memory pressure, the container start may be slow or fail with OOM. The 120-second timeout must apply.
- [ ] If the idle timer fires at the exact same moment a wake request arrives, the system must not race into a suspend→wake→suspend cycle. The wake must win (update `lastAccessedAt` before the idle check re-evaluates).
- [ ] If a preview is being woken and the server shuts down mid-wake (SIGTERM), the container may be left in a starting state. On next server boot, any previews in in-memory state are lost; the container persists and will be cleaned up when the LR closes.
- [ ] If the reverse proxy receives a WebSocket upgrade request while the preview is suspended, the wake must complete before the WebSocket handshake is forwarded.

## Design

### API Shape

**Auto-resume is transparent** — there is no dedicated "resume" endpoint for previews. The existing endpoints handle wake semantics as follows:

**`GET /api/repos/:owner/:repo/landings/:number/preview`** — Returns current status including `"suspended"`, `"starting"` (during wake), or `"running"`.

**`POST /api/repos/:owner/:repo/landings/:number/preview`** — If the preview is suspended, this acts as an explicit wake trigger (idempotent with auto-resume). Returns the woken preview.

**Reverse proxy path (transparent auto-resume):**

| Deployment Mode | URL Pattern | Trigger |
|----------------|-------------|---------|
| CE (self-hosted) | `http://localhost:{host_port}/*` or `/_preview/:owner/:repo/landings/:number/*` | Any HTTP request to the preview URL |
| Cloud | `https://{lr-number}-{repo}.preview.codeplane.app/*` | Any HTTP request to the preview subdomain |

When the reverse proxy receives a request for a suspended preview:

1. The proxy calls `PreviewService.recordAccess(repositoryId, lrNumber)`.
2. `recordAccess()` detects `status === "suspended"` and delegates to `wakePreview()`.
3. `wakePreview()` calls `sandbox.startVM(containerId)`, re-resolves port mappings, updates status to `"running"`, resets the idle timer.
4. The proxy holds the original request during wake and serves an interstitial page if the wait exceeds 500ms.
5. Once the container healthcheck passes, the proxy forwards the original request to the now-running container.

**Error responses from the proxy during wake:**

| Status | Condition |
|--------|-----------||
| 502 Bad Gateway | Container failed to start or healthcheck timed out |
| 404 Not Found | Preview does not exist or has been deleted |
| 503 Service Unavailable | Sandbox client is unavailable |

**Preview status response during wake:**
```json
{
  "id": "42:7",
  "repository_id": 42,
  "lr_number": 7,
  "status": "starting",
  "url": "http://localhost:49321",
  "container_id": "codeplane-preview-lr7-a1b2c3",
  "container_port": 3000,
  "host_port": 49321,
  "last_accessed_at": "2026-03-22T16:45:00.000Z",
  "created_at": "2026-03-22T14:30:00.000Z"
}
```

### SDK Shape

The `PreviewService` in `@codeplane/sdk` exposes auto-resume through existing methods:

```typescript
/**
 * Record a preview access (called by the reverse proxy on each request).
 * Resets the idle timer and wakes suspended previews.
 */
async recordAccess(repositoryId: number, lrNumber: number): Promise<PreviewResponse | null>

/**
 * Wake a suspended preview environment.
 * Restarts the container and re-resolves port mappings.
 * Throws if the preview does not exist or cannot be started.
 */
async wakePreview(repositoryId: number, lrNumber: number): Promise<PreviewResponse>
```

The SDK also exports the `PreviewStatus` type which includes `"starting"` as a valid intermediate state during wake.

### Web UI Design

**Location:** Landing Request detail page, in the Preview section/sidebar panel.

**Suspended state display:**
- Status badge shows **"Suspended"** in a muted/gray style.
- A primary **"Wake Preview"** button is displayed alongside the suspended badge.
- The preview URL remains visible but is displayed in a muted style with a tooltip: "Preview is suspended — click to wake or visit the URL."
- The preview URL link is still clickable; clicking it opens the preview URL in a new tab, which triggers auto-resume via the reverse proxy.

**Waking state display (transition):**
- When the user clicks "Wake Preview" or the system detects a status change to `"starting"`:
  - The badge transitions to **"Waking…"** with a spinner animation.
  - The "Wake Preview" button is replaced with a disabled state showing "Waking…"
  - The preview URL link remains visible but gains a subtle pulsing indicator.
- The UI polls `GET /api/repos/:owner/:repo/landings/:number/preview` every 2 seconds during the waking state.

**Running state display (after wake):**
- The badge transitions to **"Running"** in green.
- The preview URL is displayed as a fully active clickable link with an "Open in new tab" icon.
- A brief success toast: "Preview is awake and running."

**Interstitial page (served by reverse proxy):**
- When a browser request hits the proxy while the preview is waking, the proxy serves a self-contained HTML interstitial page:
  - Codeplane-branded minimal page with a spinner.
  - Text: "Waking preview for Landing Request #N…"
  - Subtext: "This may take up to 2 minutes."
  - The page auto-refreshes every 2 seconds using a `<meta http-equiv="refresh">` tag.
  - Once the container is ready, the next refresh serves the actual preview content.
  - No external CSS or JavaScript dependencies — fully inline.

**Error state display:**
- If the wake fails, the badge shows **"Failed"** in red.
- An error message is displayed: "Preview could not be resumed. The container may have been removed."
- A **"Recreate Preview"** button is shown, which triggers `POST .../preview` to create a fresh preview.

### CLI Command

**Explicit wake via create (idempotent):**
```bash
# Wake a suspended preview (same as create — idempotent)
codeplane preview create --lr 7

# Output when waking:
# ✓ Preview woken for landing request #7
#   Status: running
#   URL:    http://localhost:49321
```

**Check preview status:**
```bash
codeplane preview status --lr 7

# Output when suspended:
# Preview for landing request #7
#   Status: suspended
#   URL:    http://localhost:49321
#   Last accessed: 2 hours ago
#   Hint: Run `codeplane preview create --lr 7` to wake
```

The CLI does not need a separate `wake` subcommand because `create` is idempotent and handles wake semantics. The status output includes a hint when the preview is suspended.

### TUI UI

**Location:** Landing Request detail screen, Preview section.

**Suspended state:**
```
Preview: http://localhost:49321 (suspended)
  Last accessed 2h ago
  [w] Wake Preview
```

**Waking state:**
```
Preview: http://localhost:49321 (waking…) ⠋
```

**Running state (after wake):**
```
Preview: http://localhost:49321 (running) ✓
```

**Keyboard shortcut:** `w` on the landing request detail screen triggers wake when the preview is suspended. If the preview is already running, `w` is a no-op. If no preview exists, `w` shows a hint to press `p` to create one.

**Error on wake failure:**
```
Preview: failed to wake — container may have been removed
  [p] Recreate Preview
```

### Documentation

The following end-user documentation should be written:

1. **Guide section in "Preview Environments for Landing Requests"** — Add a section titled "Idle Suspension and Auto-Resume" explaining: previews are automatically suspended after 15 minutes of no traffic to conserve resources; when someone visits the preview URL after suspension, the preview automatically wakes up within a few seconds; the interstitial loading page is shown briefly while the container restarts; all filesystem state (installed packages, build artifacts) is preserved; only in-memory state is lost so the application goes through its normal boot sequence; the idle timer resets after every access.

2. **FAQ entry: "Why does my preview take a few seconds to load?"** — Explain that if the preview was suspended due to inactivity, it automatically resumes when accessed, and the brief delay is the container restarting.

3. **FAQ entry: "My preview shows 'Failed' after being suspended"** — Explain that this can happen if the Docker daemon was restarted or if the container image was pruned while the preview was suspended. The fix is to recreate the preview.

4. **CLI reference update for `codeplane preview create`** — Note that this command also wakes suspended previews (idempotent behavior).

## Permissions & Security

### Authorization

| Role | Can Trigger Auto-Resume? | Can Explicitly Wake? |
|------|-------------------------|---------------------|
| Repository Owner | ✅ Yes (via URL access or explicit wake) | ✅ Yes |
| Repository Admin | ✅ Yes | ✅ Yes |
| Repository Write (Member) | ✅ Yes | ✅ Yes |
| Repository Read | ✅ Yes (via URL access only — the reverse proxy does not check repo permissions) | ❌ No (explicit wake via POST requires write access) |
| Anonymous / Unauthenticated | ✅ Yes (via URL access — CE previews on localhost are unauthenticated; cloud previews on public subdomains are unauthenticated) | ❌ No (explicit wake via POST requires authentication) |

**Important security note:** Auto-resume via URL access is unauthenticated by design — preview URLs are intended to be shareable with anyone (reviewers, PMs, stakeholders) without requiring them to have a Codeplane account. The preview container itself is sandboxed and runs the Landing Request's code, which is already visible to anyone with read access to the repository. If a team requires authenticated preview access, this should be implemented as a separate feature (preview access control) and is out of scope for auto-resume.

### Rate Limiting

- **Wake-on-access (via reverse proxy):** No explicit rate limit on the proxy path. The container `startVM` operation naturally serializes (only one start per container at a time). The proxy holds concurrent requests during a single wake.
- **Explicit wake (via POST `/preview`):** Subject to the existing preview creation rate limits: 10 requests per minute per user, 20 per minute per repository.
- **Anti-flap protection:** If a preview is woken and then re-suspended within 60 seconds (which should not happen with the 15-minute idle timeout, but could happen if the timeout is misconfigured), the system should log a warning but not prevent the wake.

### Data Privacy

- No additional PII is collected during auto-resume beyond what is already collected during preview creation.
- The interstitial page does not include any user-identifying information — it only displays the Landing Request number.
- Container start/stop operations are logged with `repository_id` and `lr_number` but not with user IP addresses or identities (since auto-resume is unauthenticated).

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `LandingPreviewAutoResumed` | Preview successfully woken via `recordAccess()` (reverse proxy path) | `repository_id`, `lr_number`, `repo_owner`, `repo_name`, `suspended_duration_ms` (time between suspension and wake), `wake_duration_ms` (time from start request to container ready), `trigger` ("proxy") |
| `LandingPreviewExplicitlyResumed` | Preview successfully woken via explicit POST or UI/TUI action | `repository_id`, `lr_number`, `repo_owner`, `repo_name`, `suspended_duration_ms`, `wake_duration_ms`, `trigger` ("api" | "web_ui" | "tui" | "cli") |
| `LandingPreviewResumeFailed` | Preview wake failed | `repository_id`, `lr_number`, `error_type` ("container_not_found", "start_failed", "healthcheck_timeout", "sandbox_unavailable"), `error_message`, `suspended_duration_ms` |
| `LandingPreviewInterstitialServed` | Interstitial loading page was served to a visitor | `repository_id`, `lr_number`, `deployment_mode` ("ce" | "cloud") |

### Funnel Metrics

| Metric | Description | Success Indicator |
|--------|-------------|-------------------|
| Auto-resume success rate | `LandingPreviewAutoResumed` / (`LandingPreviewAutoResumed` + `LandingPreviewResumeFailed`) | > 98% |
| Wake latency P50 | P50 of `wake_duration_ms` on successful resumes | < 8 seconds |
| Wake latency P95 | P95 of `wake_duration_ms` on successful resumes | < 30 seconds |
| Interstitial bounce rate | Sessions where `LandingPreviewInterstitialServed` fires but no subsequent preview page view is recorded within 3 minutes | < 10% (users should wait for the wake) |
| Suspended-to-resumed ratio | `LandingPreviewAutoResumed` / total `LandingPreviewAutoSuspended` events | Informational — tracks how often suspended previews are revisited |
| Repeat wake frequency | Average number of suspend/resume cycles per preview per day | Informational — high values may indicate the idle timeout is too short |

## Observability

### Logging

| Log Point | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Preview wake started | INFO | `repository_id`, `lr_number`, `container_id`, `trigger` ("proxy" | "explicit"), `suspended_duration_ms` | Emitted when `wakePreview()` begins |
| Container start requested | DEBUG | `repository_id`, `lr_number`, `container_id` | Emitted when `sandbox.startVM()` is called |
| Container started, ports re-resolved | INFO | `repository_id`, `lr_number`, `container_id`, `host_port`, `old_host_port` (if changed), `wake_duration_ms` | Emitted after successful container start |
| Preview wake completed | INFO | `repository_id`, `lr_number`, `container_id`, `status: "running"`, `wake_duration_ms` | Emitted when the preview transitions to running |
| Preview wake failed | ERROR | `repository_id`, `lr_number`, `container_id`, `error_type`, `error_message` | Emitted on any wake failure |
| Container not found during wake | WARN | `repository_id`, `lr_number`, `container_id` | Emitted when the container has been removed externally |
| Port mapping changed after wake | WARN | `repository_id`, `lr_number`, `old_port`, `new_port` | Emitted when the host port changes after container restart — indicates the preview URL may have changed in CE mode |
| Interstitial served | DEBUG | `repository_id`, `lr_number`, `request_path` | Emitted when the reverse proxy serves the loading interstitial |
| Wake-no-op (already running) | DEBUG | `repository_id`, `lr_number` | Emitted when `wakePreview()` is called on an already-running preview |
| Concurrent wake serialized | DEBUG | `repository_id`, `lr_number`, `waiting_requests` | Emitted when a second wake request is queued behind an in-progress wake |
| Wake race with idle timer | WARN | `repository_id`, `lr_number` | Emitted when a wake and an idle-suspend race — the wake wins |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_preview_wake_total` | Counter | `status` ("success", "failed"), `trigger` ("proxy", "explicit") | Total wake operations by outcome and trigger source |
| `codeplane_preview_wake_duration_seconds` | Histogram | `status`, `trigger` | Time from wake request to container ready. Buckets: 1s, 3s, 5s, 10s, 15s, 30s, 60s, 120s |
| `codeplane_preview_wake_in_progress` | Gauge | — | Number of previews currently being woken (should be low) |
| `codeplane_preview_interstitial_served_total` | Counter | — | Number of interstitial pages served during wake |
| `codeplane_preview_suspend_resume_cycles_total` | Counter | — | Total number of suspend→resume cycles (tracks container churn) |
| `codeplane_preview_wake_errors_total` | Counter | `error_type` ("container_not_found", "start_failed", "healthcheck_timeout", "sandbox_unavailable") | Wake errors by category |
| `codeplane_preview_suspended_duration_seconds` | Histogram | — | Duration a preview was suspended before being woken. Buckets: 5m, 15m, 30m, 1h, 2h, 6h, 12h, 24h |

### Alerts

#### Alert: `PreviewWakeHighFailureRate`
**Condition:** `rate(codeplane_preview_wake_errors_total[5m]) / rate(codeplane_preview_wake_total[5m]) > 0.15` for 5 minutes.
**Severity:** Warning

**Runbook:**
1. Check `codeplane_preview_wake_errors_total` by `error_type` label to identify the dominant failure mode.
2. If `error_type="container_not_found"`: Containers have been removed while suspended. Check if Docker/Podman was restarted (`systemctl status docker`). Check if `docker system prune` was run. Inspect `docker ps -a --filter label=tech.codeplane.preview` to see if preview containers still exist. If containers were pruned, users will need to recreate previews — this is expected after host maintenance.
3. If `error_type="start_failed"`: Containers exist but cannot start. Run `docker start <container_id>` manually and check `docker logs <container_id>`. Common causes: out of disk space (`df -h`), OOM killer (`dmesg | grep -i oom`), corrupted container state (`docker inspect <container_id>`).
4. If `error_type="healthcheck_timeout"`: Containers start but the application doesn't bind the port. This is usually an application issue (e.g., the start command fails on restart). Check `docker logs <container_id>` for application errors. Consider increasing the healthcheck timeout via `PREVIEW_HEALTHCHECK_TIMEOUT_SECS` environment variable.
5. If `error_type="sandbox_unavailable"`: The container runtime is completely down. Follow the standard Docker/Podman recovery procedure.

#### Alert: `PreviewWakeSlowP95`
**Condition:** `histogram_quantile(0.95, rate(codeplane_preview_wake_duration_seconds_bucket[10m])) > 60` for 10 minutes.
**Severity:** Warning

**Runbook:**
1. Check host resource utilization: `top`, `free -m`, `df -h`. Slow wakes are usually caused by resource contention.
2. Check Docker daemon performance: `docker info`, `docker system df`. If the Docker storage driver is under pressure, all container operations will be slow.
3. Check `codeplane_preview_wake_in_progress` gauge. If many wakes are happening simultaneously, they compete for resources. Consider staggering idle timeouts or increasing host capacity.
4. Check application startup time. If the application's start command is inherently slow (e.g., Next.js build on startup), the wake time reflects that. Consider suggesting the user modify their preview config to use a pre-built artifact.
5. If the issue is transient, it may be caused by Docker image layer cache invalidation. Verify the workspace base image is cached locally.

#### Alert: `PreviewSuspendResumeThrashing`
**Condition:** `rate(codeplane_preview_suspend_resume_cycles_total[1h]) > 20` for 1 hour.
**Severity:** Info

**Runbook:**
1. This alert indicates previews are being suspended and resumed frequently, which wastes resources on container start/stop overhead.
2. Check if the idle timeout is misconfigured or set too low. The default is 15 minutes; a lower value causes more frequent cycling.
3. Check if there's automated tooling (bots, monitoring) periodically pinging preview URLs just frequently enough to trigger wakes but not frequently enough to prevent suspension.
4. Consider increasing the idle timeout for high-traffic previews.
5. This is informational — no immediate action required unless host resources are impacted.

### Error Cases and Failure Modes

| Failure Mode | Detection | User Impact | Recovery |
|--------------|-----------|-------------|----------|
| Container removed while suspended | `sandbox.startVM()` returns "not found" | Proxy returns 502; preview status transitions to "failed" | User recreates preview via POST or "Recreate Preview" button |
| Container image pruned | `sandbox.startVM()` fails with image error | Proxy returns 502; status → "failed" | Pull workspace image, recreate preview |
| Docker daemon down | `sandbox.startVM()` throws connection error | Proxy returns 503 | Restart Docker daemon (`systemctl restart docker`) |
| Healthcheck timeout (app won't start) | `startVM()` exceeds 120s timeout | Proxy returns 502 after timeout | Check application start command; fix app-level startup issue |
| Host out of memory | Container OOM-killed during start | Proxy returns 502; status → "failed" | Free host memory or add resources |
| Host out of disk | Container start fails | Proxy returns 502 | `docker system prune`, free disk |
| Port mapping conflict | Host port previously assigned is now taken | Container starts but on different port; preview URL updates | Transparent — port re-resolution handles this |
| Race between wake and idle-suspend | Both fire at same instant | Wake wins; idle timer is re-scheduled | Transparent — no user impact |
| Server crash mid-wake | Container left in starting state; in-memory state lost | On restart, preview is no longer tracked in memory | Container persists; cleaned up when LR closes. User recreates preview. |
| Concurrent wake requests | Multiple requests for same suspended preview | All requests wait; only one container start | Transparent — concurrent handling is serialized |

## Verification

### API Integration Tests

| # | Test | Method | Input | Expected |
|---|------|--------|-------|----------|
| 1 | `recordAccess` on suspended preview triggers wake | Call `recordAccess()` on a suspended preview | Preview status changes to `"running"`, container is started |
| 2 | `recordAccess` on running preview is a no-op | Call `recordAccess()` on a running preview | Status remains `"running"`, `last_accessed_at` updated, idle timer reset |
| 3 | `recordAccess` on non-existent preview returns null | Call `recordAccess()` with unknown repo/lr | Returns `null` |
| 4 | `wakePreview` on suspended preview succeeds | Call `wakePreview()` directly on a suspended preview | Returns `PreviewResponse` with status `"running"`, valid `host_port` |
| 5 | `wakePreview` on running preview is no-op | Call `wakePreview()` on an already-running preview | Returns same response, `last_accessed_at` updated |
| 6 | `wakePreview` on non-existent preview returns 404 | Call `wakePreview()` with unknown key | Throws `notFound` error |
| 7 | `wakePreview` on stopped preview returns error | Create, delete, then wake | Throws `notFound` error |
| 8 | `wakePreview` on failed preview returns error | Force preview to `"failed"`, then wake | Throws `notFound` error |
| 9 | Port re-resolution after wake | Suspend preview, wake, verify `host_port` is valid | `host_port` in response is > 0 and corresponds to a listening port |
| 10 | `last_accessed_at` updates on wake | Suspend preview (wait), then wake | `last_accessed_at` is more recent than `created_at` |
| 11 | Idle timer reset after wake | Wake preview, verify it does not suspend within next idle check | Preview remains `"running"` after the old idle timeout elapses (new timer was set) |
| 12 | GET preview status during wake shows `"starting"` | Initiate wake, immediately GET status | Status is `"starting"` or `"running"` (depending on timing) |
| 13 | GET preview status after wake shows `"running"` | Complete wake, then GET status | Status is `"running"` |
| 14 | Wake when sandbox is unavailable returns error | Set sandbox to null, attempt wake | Throws `internal` error with descriptive message |
| 15 | POST `/preview` for suspended preview wakes it | Create preview, suspend it, POST again | Returns `200 OK` with status `"running"` (not 201) |
| 16 | POST `/preview` for running preview is idempotent | POST twice while preview is running | Both return same `id` and `container_id` |
| 17 | Concurrent `recordAccess` calls serialize correctly | Call `recordAccess()` 5 times concurrently on a suspended preview | Only 1 `startVM` call; all 5 return the same running preview |
| 18 | Container not found during wake → status becomes `"failed"` | Remove container externally, then call `wakePreview()` | Preview status transitions to `"failed"`, error thrown |
| 19 | Wake after Docker daemon restart | Suspend preview, simulate daemon restart (container still present), wake | Wake succeeds if container persists; fails with clear error if container is gone |
| 20 | Preview URL reflects new port after wake | Suspend, wake (port may change), check `url` field | URL includes the new `host_port` |
| 21 | Wake timeout enforcement (120s max) | Mock `startVM` to hang indefinitely | Wake fails after 120s with timeout error |

### CLI Integration Tests

| # | Test | Command | Expected |
|---|------|---------|----------|
| 22 | CLI preview create wakes suspended preview | Suspend preview, run `codeplane preview create --lr N` | Exit 0, output contains "Preview woken" and running URL |
| 23 | CLI preview create on running preview returns existing | Run `codeplane preview create --lr N` twice | Second invocation shows idempotent message |
| 24 | CLI preview status shows suspended state | Suspend preview, run `codeplane preview status --lr N` | Output shows "suspended" and hint to wake |
| 25 | CLI preview status shows running after wake | Wake preview, run `codeplane preview status --lr N` | Output shows "running" |
| 26 | CLI JSON output after wake has correct fields | Suspend, wake via `codeplane preview create --lr N --json` | Valid JSON with `status: "running"`, updated `last_accessed_at` |

### Playwright E2E Tests (Web UI)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 27 | Suspended badge visible on LR detail | Suspend preview, navigate to LR detail | Preview section shows "Suspended" badge and "Wake Preview" button |
| 28 | Click "Wake Preview" starts wake | Click "Wake Preview" button | Button shows spinner, badge transitions to "Waking…" |
| 29 | Badge transitions to "Running" after wake | Click "Wake Preview", wait | Badge becomes "Running" in green, URL link is active |
| 30 | Success toast after wake | Complete wake | Toast notification: "Preview is awake and running" |
| 31 | Preview URL link opens new tab | After wake, click preview URL | New tab opens with the preview application content |
| 32 | Failed wake shows error state | Remove container externally, click "Wake Preview" | Badge shows "Failed", error message displayed, "Recreate Preview" button shown |
| 33 | "Recreate Preview" creates a fresh preview | After failed wake, click "Recreate Preview" | New preview created, badge shows "Running" |
| 34 | Interstitial page served on direct URL access | Suspend preview, navigate to preview URL directly | Interstitial page with spinner and "Waking preview…" text is shown |
| 35 | Interstitial auto-refreshes to preview content | Continue from test 34, wait | Page auto-refreshes and shows the preview application content |
| 36 | No "Wake Preview" button on running preview | Preview is running, navigate to LR detail | Only URL link shown, no wake button |
| 37 | No "Wake Preview" button when no preview exists | Navigate to LR with no preview | Only "Create Preview" button shown |

### TUI Integration Tests

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 38 | Suspended preview shows `[w] Wake Preview` hint | Navigate to LR detail with suspended preview | Preview section shows suspended status and `[w]` keybind |
| 39 | Press `w` initiates wake | Press `w` key on LR detail | Preview section shows waking spinner |
| 40 | After wake, shows running status | Wait for wake to complete | Preview section shows running status with URL |
| 41 | Press `w` on running preview is no-op | Press `w` when preview is running | No change — preview remains running |
| 42 | Press `w` when no preview exists shows hint | Press `w` on LR with no preview | Message: "No preview exists. Press [p] to create one." |
| 43 | Failed wake shows error and `[p] Recreate` | Simulate failed wake | Error message and `[p] Recreate Preview` keybind shown |

### Reverse Proxy Tests

| # | Test | Description | Expected |
|---|------|-------------|----------|
| 44 | Proxy wakes suspended preview on HTTP GET | Send GET to suspended preview URL | Interstitial served, then preview content returned on refresh |
| 45 | Proxy forwards request to running preview | Send GET to running preview URL | Preview content returned immediately (no interstitial) |
| 46 | Proxy returns 404 for deleted preview | Send GET to URL of deleted preview | 404 response |
| 47 | Proxy returns 502 on wake failure | Container removed, send GET to suspended preview URL | 502 response with descriptive error |
| 48 | Concurrent requests during wake all succeed | Send 10 concurrent GET requests to a suspended preview URL | All requests eventually receive preview content (after wake) |
| 49 | WebSocket upgrade waits for wake | Send WebSocket upgrade to suspended preview URL | WebSocket handshake completes after wake |
| 50 | Interstitial page is self-contained HTML | Inspect interstitial response | Response is HTML with inline styles, no external dependencies |
| 51 | Interstitial includes `<meta http-equiv="refresh">` | Inspect interstitial HTML | Meta refresh tag present with 2-second interval |
| 52 | Proxy returns 503 when sandbox unavailable | Disable sandbox, send GET to preview URL | 503 response |

### Cross-Cutting and Edge Case Tests

| # | Test | Description | Expected |
|---|------|-------------|----------|
| 53 | Full suspend→wake→suspend→wake cycle | Create preview, let idle timeout suspend it, wake via URL, let idle suspend again, wake again | Both wakes succeed, preview functions correctly after each |
| 54 | Rapid suspend and wake do not race | Trigger wake immediately after idle timer fires | Preview ends in `"running"` state (wake wins) |
| 55 | Wake after server restart | Create preview, restart server (in-memory state lost), attempt to access URL | Preview not tracked in memory; proxy returns 404. Container persists for cleanup. |
| 56 | Multiple LR previews wake independently | Create previews for LR #1 and LR #2, suspend both, wake only LR #1 | LR #1 is running, LR #2 remains suspended |
| 57 | Wake does not affect other running previews | With LR #1 running and LR #2 suspended, wake LR #2 | Both running, LR #1's idle timer unaffected |
| 58 | Healthcheck timeout returns 502 within 125s | Mock healthcheck to never pass, attempt wake | Returns error within ~120s (not hanging forever) |
| 59 | Port re-mapping on wake: new port is usable | Wake preview where host port changes | Response contains new `host_port`, and HTTP request to new port succeeds |
| 60 | Idle timer uses full duration after wake | Wake preview, measure time until next auto-suspend | Suspend occurs ~15 minutes after wake, not sooner |
