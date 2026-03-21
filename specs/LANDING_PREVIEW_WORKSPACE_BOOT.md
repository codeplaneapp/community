# LANDING_PREVIEW_WORKSPACE_BOOT

Specification for LANDING_PREVIEW_WORKSPACE_BOOT.

## High-Level User POV

When a developer creates or opens a Landing Request, they shouldn't have to remember to manually create a preview environment. If their repository has a `.codeplane/preview.ts` configuration file, the preview should simply appear — automatically. The Landing Request Preview Workspace Boot feature is the glue that makes this happen: it detects when a Landing Request transitions to the `open` state and, if the repository has preview configuration defined, automatically provisions a preview workspace without any manual intervention from the user.

The experience from the developer's point of view is seamless. They push their changes, create a Landing Request, and within seconds see the Landing Request detail page light up with a "Starting preview…" indicator. Shortly after, a live preview URL appears, ready for reviewers to click. There are no extra buttons to click, no CLI flags to remember, and no workflow steps to configure. The preview just boots.

For repository maintainers, the behavior is opt-in at the repository level: adding a `.codeplane/preview.ts` file signals that this repository supports automatic preview boot. Without that file, nothing happens automatically — users can still create previews manually via the existing "Create Preview" button or CLI command. Maintainers can also explicitly disable auto-boot in repository settings if they want preview configuration available for manual use but not automatic provisioning.

When a Landing Request is reopened after being closed, the auto-boot triggers again — provisioning a fresh preview for the new review cycle. When a Landing Request is updated with new changes (a force-push to the underlying bookmark), the existing preview can optionally be rebuilt to reflect the latest code, or the user can manually trigger a rebuild. The auto-boot does not fire for Landing Requests created in `draft` state, since drafts represent work-in-progress that isn't ready for review. When a draft is promoted to `open`, the auto-boot kicks in.

This feature completes the circle on Landing Request previews: rather than treating preview creation as a separate manual step, it makes live preview environments an integral, automatic part of the Landing Request review workflow. For teams doing front-end development, documentation, or any work where seeing running code matters more than reading diffs, this turns every Landing Request into a live demo by default.

## Acceptance Criteria

### Definition of Done

- When a Landing Request transitions to `open` state and the repository contains a `.codeplane/preview.ts` file, a preview workspace is automatically provisioned without any user action.
- The auto-boot is triggered by Landing Request creation (when state is `open`), reopening a closed Landing Request, and promoting a draft Landing Request to `open`.
- The auto-booted preview appears on the Landing Request detail page in all clients (web, CLI, TUI) exactly as if the user had manually clicked "Create Preview."
- The auto-boot does not fire for Landing Requests created in `draft` state.
- The auto-boot does not fire if the repository has no `.codeplane/preview.ts` file.
- The auto-boot does not fire if auto-boot is explicitly disabled in repository settings.
- The auto-boot does not fire if a preview already exists for the Landing Request (idempotent).
- If the container runtime is unavailable, auto-boot fails silently (no user-facing error) but logs the failure and emits telemetry.
- The feature degrades gracefully to the existing manual preview creation experience when auto-boot is not applicable or fails.

### Functional Constraints

- [ ] Auto-boot must only trigger for Landing Requests that transition to or are created in the `open` state. The set of triggering transitions is: `create(open)`, `draft → open`, `closed → open`.
- [ ] Auto-boot must not trigger for Landing Requests created in `draft` state or transitioned to `closed` or `merged` states.
- [ ] Auto-boot must check for the existence of `.codeplane/preview.ts` in the repository's default bookmark (e.g., `main` or `trunk`) before provisioning. The file must parse successfully as a valid `PreviewConfig`.
- [ ] If `.codeplane/preview.ts` exists but is malformed (invalid TypeScript/JSON, missing required `start` field), auto-boot must not provision and must log a warning with the parse error.
- [ ] If a preview already exists for the Landing Request (in any non-terminal state: `starting`, `running`, `suspended`), auto-boot must be a no-op. It must not create a duplicate.
- [ ] If a preview exists in a terminal state (`stopped`, `failed`), auto-boot must provision a fresh replacement preview.
- [ ] Auto-boot must call the same `PreviewService.createPreview()` method used by manual creation. No separate provisioning path.
- [ ] Auto-boot must be asynchronous (fire-and-forget from the Landing Request creation/update path). The Landing Request creation response must not be delayed by preview provisioning.
- [ ] The maximum time from Landing Request state transition to preview boot initiation must be under 5 seconds (excluding container provisioning time).
- [ ] Repository settings must include a boolean `preview_auto_boot` field. Default value: `true` (enabled) when `.codeplane/preview.ts` exists.
- [ ] Repository settings `preview_auto_boot` field must be overridable by repository owners and admins via the repository settings API and UI.
- [ ] If the container runtime (sandbox client) is unavailable, auto-boot must not throw. It must log the failure at WARN level and emit a `LandingPreviewAutoBootFailed` telemetry event.
- [ ] Auto-boot must not trigger more than once per Landing Request state transition. If the LR service emits duplicate events (e.g., due to retries), the idempotent nature of `createPreview()` handles deduplication.
- [ ] The auto-boot trigger must include the Landing Request number, repository ID, owner, and repo name in all log entries and telemetry events.
- [ ] Auto-boot must respect the same global concurrency limit for preview containers as manual creation. If the limit is reached, auto-boot fails silently with appropriate logging.
- [ ] The `.codeplane/preview.ts` file lookup must be cached per-repository for a TTL of 60 seconds to avoid repeated filesystem/blob reads on rapid LR state changes.
- [ ] The cache must be invalidated when the repository's default bookmark is updated (push event).

### Edge Cases

- [ ] If a Landing Request is created and immediately closed before auto-boot completes provisioning, the preview creation should still succeed (the LR close/merge lifecycle handler will delete it later).
- [ ] If multiple Landing Requests are opened simultaneously in the same repository, each should independently trigger auto-boot. They must not interfere with each other.
- [ ] If the `.codeplane/preview.ts` file is added to the repository after a Landing Request is already open, the already-open LR does not retroactively receive auto-boot. Only new state transitions trigger the check.
- [ ] If the `.codeplane/preview.ts` file is removed from the repository while a Landing Request with an auto-booted preview is open, the existing preview continues to run. The removal only affects future LR transitions.
- [ ] If the repository is transferred to a new owner while an auto-booted preview is running, the preview continues to work under the new owner context.
- [ ] If the server restarts during an auto-boot provisioning attempt, the in-flight provisioning is lost. The preview will not exist for that LR, and the user can manually create it. No orphaned containers should be left behind (container creation is atomic).
- [ ] Concurrent state transitions (e.g., draft→open and closed→open race) for the same LR must not create duplicate preview containers due to the idempotent nature of `createPreview()`.
- [ ] If `.codeplane/preview.ts` exports a `definePreview()` call with `env` containing reserved keys (`CODEPLANE_PREVIEW`, `PORT`, etc.), the auto-boot should fail validation and log the error rather than crash.

## Design

### API Shape

Auto-boot is an internal server-side behavior triggered by Landing Request state transitions. There are no new API endpoints for auto-boot itself. However, the following API surfaces are modified or added:

**Repository settings extension:**

`PATCH /api/repos/:owner/:repo/settings`

**Additional field in request body:**
```json
{
  "preview_auto_boot": true
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `preview_auto_boot` | boolean | No | `true` | Whether to automatically boot a preview workspace when a Landing Request is opened. Only takes effect when `.codeplane/preview.ts` exists. |

**Repository settings response extension:**

`GET /api/repos/:owner/:repo/settings`

```json
{
  "preview_auto_boot": true,
  "has_preview_config": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `preview_auto_boot` | boolean | Whether auto-boot is enabled |
| `has_preview_config` | boolean | Whether the repository contains a valid `.codeplane/preview.ts` file (read-only, derived from file presence) |

**Landing Request response extension:**

The existing `GET /api/repos/:owner/:repo/landings/:number` response gains an optional `preview` field when a preview exists:

```json
{
  "number": 7,
  "title": "Add dark mode",
  "state": "open",
  "preview": {
    "status": "running",
    "url": "http://localhost:49321"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `preview` | object or null | Inline preview summary if a preview exists, `null` otherwise |
| `preview.status` | string | Current preview status: `"starting"`, `"running"`, `"suspended"`, `"stopped"`, `"failed"` |
| `preview.url` | string | The preview URL |

This inline field avoids requiring a separate API call to check preview existence from the LR detail view.

### SDK Shape

The `PreviewService` in `@codeplane/sdk` gains:

```typescript
/**
 * Attempt auto-boot of a preview for a Landing Request.
 * Called internally when an LR transitions to open state.
 * Returns the preview response if created, or null if auto-boot
 * is not applicable (no config, disabled, already exists).
 */
async tryAutoBootPreview(input: AutoBootInput): Promise<PreviewResponse | null>

/**
 * Check whether a repository has a valid .codeplane/preview.ts file.
 * Result is cached per-repository for 60 seconds.
 */
async hasPreviewConfig(repositoryId: number): Promise<boolean>

/**
 * Read and parse the .codeplane/preview.ts config for a repository.
 * Returns null if the file does not exist or cannot be parsed.
 * Result is cached per-repository for 60 seconds.
 */
async readPreviewConfig(repositoryId: number): Promise<PreviewConfig | null>

/**
 * Invalidate the preview config cache for a repository.
 * Called when the default bookmark is updated.
 */
invalidatePreviewConfigCache(repositoryId: number): void
```

Where `AutoBootInput` contains:
```typescript
interface AutoBootInput {
  repositoryId: number;
  lrNumber: number;
  repoOwner: string;
  repoName: string;
  /** The state transition that triggered auto-boot. */
  trigger: "created_open" | "draft_to_open" | "closed_to_open";
}
```

The `LandingService` gains an internal hook:

```typescript
/**
 * Register a callback to be invoked when a Landing Request transitions
 * to the open state. Used by PreviewService for auto-boot.
 */
onLandingRequestOpened(callback: (event: LandingOpenedEvent) => void): void
```

Where `LandingOpenedEvent` is:
```typescript
interface LandingOpenedEvent {
  repositoryId: number;
  lrNumber: number;
  repoOwner: string;
  repoName: string;
  trigger: "created_open" | "draft_to_open" | "closed_to_open";
  actorId: number;
}
```

### CLI Command

There is no new CLI command for auto-boot (it is automatic). However, the existing `codeplane preview status` command is updated to show whether a preview was auto-booted:

**Updated output:**
```
Preview for landing request #7
  Status:       running
  URL:          http://localhost:49321
  Auto-booted:  yes
  Created:      2026-03-22T14:15:00.000Z
```

The `codeplane repo settings` command is updated to show the auto-boot setting:

```
codeplane repo settings --repo owner/repo
```

Output includes:
```
Preview Auto-Boot: enabled
Preview Config:    .codeplane/preview.ts (found)
```

The `codeplane repo settings update` command accepts the new flag:

```bash
# Disable auto-boot
codeplane repo settings update --repo owner/repo --preview-auto-boot=false

# Enable auto-boot
codeplane repo settings update --repo owner/repo --preview-auto-boot=true
```

### Web UI Design

**Landing Request Detail Page:**

When a Landing Request is opened and auto-boot triggers, the preview section on the LR detail page immediately shows:

1. **Boot-in-progress state:** A spinner with "Auto-starting preview…" text appears in the preview section. This state is shown when the LR was just created/opened and no preview response exists yet. The UI polls the preview status endpoint every 3 seconds during this state.

2. **Preview running:** Once the preview API returns a `running` status, the UI transitions to the standard preview card showing the URL, status badge, and "Open in new tab" link. An "Auto-booted" label/tag is shown to indicate the preview was provisioned automatically.

3. **Auto-boot failed:** If the preview status endpoint returns `null` after 120 seconds of polling (auto-boot timed out or failed), the UI transitions to the standard "Create Preview" button, allowing the user to manually trigger creation. A subtle info text reads "Automatic preview boot did not complete — you can create one manually."

**Repository Settings Page:**

Under Repository Settings → Preview Environments:

- **Auto-boot toggle:** A toggle switch labeled "Automatically boot previews for new Landing Requests" with an explanatory subtitle: "When enabled, a preview environment is automatically created whenever a Landing Request is opened, if .codeplane/preview.ts exists in the repository."
- **Config status indicator:** Below the toggle, a read-only status line: "Preview configuration: ✓ .codeplane/preview.ts found" (with a green check) or "Preview configuration: not found — add .codeplane/preview.ts to enable previews" (with a gray indicator).
- The toggle is disabled (grayed out) if `.codeplane/preview.ts` does not exist, with tooltip text: "Add .codeplane/preview.ts to your repository to enable auto-boot."

### TUI UI

**Landing Request Detail Screen:**

When a Landing Request is opened and auto-boot is in progress:
```
Preview: auto-starting… ⠋
```

Once the preview is running:
```
Preview: http://localhost:49321 (running, auto-booted)
```

If auto-boot fails or does not apply:
```
Preview: [p] Create Preview
```

### Neovim Plugin API

The Neovim plugin's Landing Request detail view should display the preview URL and auto-boot status when available. The existing `:CodeplaneLandingDetail` command output should include a `Preview: <url> (auto-booted)` line when a preview is present.

### Documentation

The following end-user documentation should be written:

1. **Guide: "Automatic Preview Environments for Landing Requests"** — Explains what auto-boot is, how it works, prerequisites (`.codeplane/preview.ts`), how to enable/disable it in repository settings, what happens on LR create/reopen/promote-from-draft, and the relationship to manual preview creation. Includes a step-by-step walkthrough with screenshots.

2. **Reference: Repository Settings — Preview Auto-Boot** — Documents the `preview_auto_boot` setting, its default value, who can change it (Owner/Admin), and how it interacts with `.codeplane/preview.ts` existence.

3. **FAQ: "Why didn't my Landing Request get an automatic preview?"** — Troubleshooting guide covering common reasons: no `.codeplane/preview.ts`, auto-boot disabled, LR created as draft, container runtime unavailable, global concurrency limit reached. Each reason includes the resolution.

4. **Changelog entry** — A user-facing changelog entry announcing the feature with a brief description and link to the guide.

## Permissions & Security

### Authorization

| Role | Can view auto-booted preview? | Can toggle auto-boot in repo settings? | Can view auto-boot setting? |
|------|------------------------------|---------------------------------------|---------------------------|
| Repository Owner | ✅ Yes | ✅ Yes | ✅ Yes |
| Repository Admin | ✅ Yes | ✅ Yes | ✅ Yes |
| Repository Write (Member) | ✅ Yes | ❌ No | ✅ Yes |
| Repository Read | ✅ Yes (preview status) | ❌ No | ✅ Yes |
| Anonymous / Unauthenticated | ❌ No (401) | ❌ No | ❌ No |

Auto-boot itself is a system-initiated action that runs with the repository's service identity. The underlying `createPreview()` call does not require a user actor — it is triggered by the system in response to a Landing Request state transition initiated by an authenticated user with write access.

### Rate Limiting

- Auto-boot is a server-internal operation and is not subject to API rate limits for the trigger itself.
- The underlying `createPreview()` call is subject to the existing per-repository concurrency limit for preview containers (default: 50 CE).
- The `.codeplane/preview.ts` config file lookup is cached (60-second TTL) to prevent filesystem abuse from rapid LR state changes.
- A per-repository auto-boot rate limit of 10 auto-boot attempts per minute prevents pathological patterns (e.g., rapidly opening/closing/reopening LRs). Exceeding this limit causes auto-boot to silently skip and log a warning.
- The repository settings `PATCH` endpoint (for toggling `preview_auto_boot`) is subject to the standard per-user API rate limit.

### Data Privacy

- The `.codeplane/preview.ts` file is repository content and may contain environment variable values. These values must not be logged at INFO level or below (same constraints as LANDING_PREVIEW_CREATE).
- Auto-boot telemetry events must not include environment variable values or file contents. They may include whether the config was found and parsed successfully.
- The `has_preview_config` field in the repository settings response does not expose file contents — only boolean presence.

### Sandbox Boundary

- Auto-booted preview containers inherit the same sandbox restrictions as manually created previews: no privileged mode, resource limits applied, containers labeled and isolated.
- The system-initiated `createPreview()` call does not elevate privileges beyond what a manual creation would have.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `LandingPreviewAutoBootTriggered` | Auto-boot logic begins evaluation | `repository_id`, `lr_number`, `repo_owner`, `repo_name`, `trigger` ("created_open", "draft_to_open", "closed_to_open"), `has_preview_config` (bool), `auto_boot_enabled` (bool) |
| `LandingPreviewAutoBootSucceeded` | Preview successfully created via auto-boot | `repository_id`, `lr_number`, `repo_owner`, `repo_name`, `trigger`, `duration_ms` (time from trigger to preview creation response), `port`, `has_install_step` (bool) |
| `LandingPreviewAutoBootSkipped` | Auto-boot was triggered but skipped | `repository_id`, `lr_number`, `repo_owner`, `repo_name`, `trigger`, `skip_reason` ("no_config", "auto_boot_disabled", "preview_already_exists", "draft_state", "rate_limited") |
| `LandingPreviewAutoBootFailed` | Auto-boot attempted but failed | `repository_id`, `lr_number`, `repo_owner`, `repo_name`, `trigger`, `error_type` ("no_runtime", "container_failed", "config_parse_error", "concurrency_limit", "internal"), `error_message` |
| `LandingPreviewAutoBootConfigCacheHit` | Config lookup served from cache | `repository_id` |
| `LandingPreviewAutoBootConfigCacheMiss` | Config lookup required filesystem/blob read | `repository_id`, `config_found` (bool) |

### Funnel Metrics

| Metric | Description | Success Indicator |
|--------|-------------|-------------------|
| Auto-boot trigger-to-success rate | `LandingPreviewAutoBootSucceeded` / `LandingPreviewAutoBootTriggered` | > 80% (some triggers will legitimately be skipped) |
| Auto-boot trigger-to-skip rate | `LandingPreviewAutoBootSkipped` / `LandingPreviewAutoBootTriggered` | Informational — high skip rate due to `no_config` is expected for repos without `.codeplane/preview.ts` |
| Auto-boot trigger-to-fail rate | `LandingPreviewAutoBootFailed` / (`LandingPreviewAutoBootTriggered` - `LandingPreviewAutoBootSkipped`) | < 5% |
| Auto-boot latency | P50 and P95 of `duration_ms` on `LandingPreviewAutoBootSucceeded` | P50 < 30s, P95 < 120s |
| Auto-boot adoption | Unique repositories with at least one `LandingPreviewAutoBootSucceeded` / total repositories with `.codeplane/preview.ts` | Trending up month-over-month |
| Manual creation fallback rate | Manual `LandingPreviewCreated` events for LRs where `LandingPreviewAutoBootFailed` was also emitted / total `LandingPreviewAutoBootFailed` | Informational — indicates users recovering from auto-boot failures |
| Config cache hit ratio | `ConfigCacheHit` / (`ConfigCacheHit` + `ConfigCacheMiss`) | > 90% under normal operation |

## Observability

### Logging

| Log Point | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Auto-boot triggered | INFO | `repository_id`, `lr_number`, `repo_owner`, `repo_name`, `trigger` | Emitted when a Landing Request state transition triggers auto-boot evaluation |
| Preview config lookup — cache hit | DEBUG | `repository_id`, `cache_age_ms` | Emitted when the `.codeplane/preview.ts` lookup is served from cache |
| Preview config lookup — cache miss | DEBUG | `repository_id`, `config_found`, `parse_duration_ms` | Emitted when the config file is read from the filesystem/blob store |
| Preview config parse failed | WARN | `repository_id`, `error_message` | Emitted when `.codeplane/preview.ts` exists but cannot be parsed. Error message must not include env variable values. |
| Auto-boot skipped | DEBUG | `repository_id`, `lr_number`, `skip_reason` | Emitted when auto-boot decides not to provision (config missing, disabled, already exists, etc.) |
| Auto-boot provisioning started | INFO | `repository_id`, `lr_number`, `port`, `has_install_step` | Emitted when `createPreview()` is called by the auto-boot path |
| Auto-boot provisioning succeeded | INFO | `repository_id`, `lr_number`, `container_id`, `host_port`, `duration_ms` | Emitted when the preview container is successfully created |
| Auto-boot provisioning failed | ERROR | `repository_id`, `lr_number`, `error_type`, `error_message` | Emitted when `createPreview()` fails during auto-boot |
| Auto-boot rate limited | WARN | `repository_id`, `lr_number`, `attempts_in_window` | Emitted when the per-repository auto-boot rate limit is exceeded |
| Config cache invalidated | DEBUG | `repository_id`, `reason` ("push_event" or "ttl_expired") | Emitted when the preview config cache entry is cleared |
| Auto-boot setting changed | INFO | `repository_id`, `actor_id`, `new_value` (bool) | Emitted when a user toggles the `preview_auto_boot` repository setting |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_preview_auto_boot_total` | Counter | `outcome` ("succeeded", "skipped", "failed"), `trigger` ("created_open", "draft_to_open", "closed_to_open") | Total auto-boot attempts by outcome and trigger type |
| `codeplane_preview_auto_boot_duration_seconds` | Histogram | `outcome` | End-to-end time from trigger to outcome, bucketed: 0.1s, 0.5s, 1s, 5s, 15s, 30s, 60s, 120s |
| `codeplane_preview_auto_boot_skip_total` | Counter | `reason` ("no_config", "auto_boot_disabled", "preview_exists", "draft_state", "rate_limited") | Auto-boot skips by reason |
| `codeplane_preview_auto_boot_errors_total` | Counter | `error_type` ("no_runtime", "container_failed", "config_parse_error", "concurrency_limit", "internal") | Auto-boot errors by category |
| `codeplane_preview_config_cache_total` | Counter | `result` ("hit", "miss") | Config file cache lookups |
| `codeplane_preview_config_cache_entries` | Gauge | — | Current number of cached config entries |
| `codeplane_preview_auto_boot_enabled_repos` | Gauge | — | Number of repositories with `preview_auto_boot` enabled (updated on settings change) |

### Alerts

#### Alert: `PreviewAutoBootHighFailureRate`
**Condition:** `rate(codeplane_preview_auto_boot_errors_total[10m]) / rate(codeplane_preview_auto_boot_total{outcome!="skipped"}[10m]) > 0.20` for 10 minutes.
**Severity:** Warning

**Runbook:**
1. Check `codeplane_preview_auto_boot_errors_total` by `error_type` label to identify the dominant failure.
2. If `error_type="no_runtime"`: The container sandbox client is null. This means Docker/Podman is unavailable. SSH to the host, verify `docker info` returns successfully, check `systemctl status docker`. Auto-boot will continue to fail until the runtime is restored. This is expected in environments without Docker.
3. If `error_type="container_failed"`: Container creation is failing. Follow the `PreviewCreateHighFailureRate` runbook from LANDING_PREVIEW_CREATE. Check host resources (CPU, memory, disk).
4. If `error_type="config_parse_error"`: Multiple repositories have malformed `.codeplane/preview.ts` files. Check server logs for parse error details. This is likely a user issue, but a sudden spike may indicate a regression in the config parser.
5. If `error_type="concurrency_limit"`: The global preview container limit is exhausted. Check `codeplane_preview_active_count` — are there many stale previews? Trigger idle suspension sweep via admin API or increase the limit.
6. If `error_type="internal"`: Check server error logs for stack traces near the auto-boot code path. Escalate if the root cause is unclear.

#### Alert: `PreviewAutoBootLatencyHigh`
**Condition:** `histogram_quantile(0.95, rate(codeplane_preview_auto_boot_duration_seconds_bucket{outcome="succeeded"}[10m])) > 120` for 10 minutes.
**Severity:** Warning

**Runbook:**
1. Auto-boot is taking over 2 minutes at p95. Most of this time is in container provisioning.
2. Check `codeplane_preview_container_create_duration_seconds` (from LANDING_PREVIEW_CREATE metrics) to determine if container creation is the bottleneck.
3. If container creation is slow: Check Docker image cache (`docker images`), host CPU/memory (`htop`), and Docker daemon load (`docker stats`).
4. If container creation is fast but total duration is high: The startup command (install + start) may be slow. Check server logs for "startup command warning" entries. This is a user-code issue — suggest optimizing `.codeplane/preview.ts` install steps.
5. If the config lookup is slow: Check `codeplane_preview_config_cache_total` — if the miss rate is high, the cache may not be working. Check repo blob store latency.

#### Alert: `PreviewAutoBootConfigCacheDegraded`
**Condition:** `rate(codeplane_preview_config_cache_total{result="miss"}[5m]) / rate(codeplane_preview_config_cache_total[5m]) > 0.50` for 10 minutes.
**Severity:** Info

**Runbook:**
1. The config file cache hit rate is below 50%. This means most lookups are going to the filesystem/blob store.
2. Check if there's an unusually high volume of Landing Request creations across many different repositories (which would naturally cause cache misses).
3. Check if the cache invalidation is firing too aggressively (e.g., many push events causing frequent invalidation). Review `config cache invalidated` log entries.
4. If the cache TTL (60s) is too short for the workload, consider increasing it. However, this delays config file changes from taking effect.
5. This is informational — no user impact unless blob store latency is high.

### Error Cases and Failure Modes

| Failure Mode | Detection | User Impact | Recovery |
|--------------|-----------|-------------|----------|
| Container runtime unavailable | `sandbox` is null | No auto-boot; manual creation also fails | Install Docker/Podman and restart server |
| `.codeplane/preview.ts` not found | Config lookup returns null | No auto-boot; manual creation with explicit config still works | User adds the file to the repository |
| `.codeplane/preview.ts` malformed | Config parse throws | No auto-boot; logged as WARN | User fixes the configuration file |
| Container provisioning fails | `createPreview()` throws | No auto-boot; user can retry manually | Check host resources, Docker health |
| Global concurrency limit reached | `createPreview()` returns 503-equivalent | No auto-boot; user sees "Create Preview" button | Wait for idle previews to suspend, or increase limit |
| Auto-boot rate limited | Rate check exceeds threshold | No auto-boot for this LR; next LR may succeed | Transient — rate limit resets within 1 minute |
| Server restart during provisioning | Container creation is atomic; no half-state | Preview does not exist; user can manually create | Manual creation or wait for next LR state change |
| LR closed before auto-boot completes | Preview is created, then LR close handler deletes it | Brief resource usage, then cleaned up | No action needed — lifecycle is correct |
| Blob store unavailable for config read | Config lookup throws | No auto-boot; cached entries may still serve | Restore blob store; auto-boot will recover on next trigger |

## Verification

### API Integration Tests

| # | Test | Method | Input | Expected |
|---|------|--------|-------|----------|
| 1 | Auto-boot triggers on LR creation (open state) | POST create LR with `state: "open"` in repo with `.codeplane/preview.ts` | Valid LR creation payload | LR created (201); within 5s, GET preview status returns non-null response with `status` of `"starting"` or `"running"` |
| 2 | Auto-boot does not trigger on draft LR creation | POST create LR with `state: "draft"` in repo with `.codeplane/preview.ts` | Valid LR creation payload with `draft: true` | LR created (201); after 10s, GET preview status returns `null` |
| 3 | Auto-boot triggers on draft→open promotion | Create draft LR, then PATCH to `state: "open"` | Draft LR exists | PATCH 200; within 5s, GET preview status returns non-null |
| 4 | Auto-boot triggers on closed→open (reopen) | Create LR, close it, reopen it | LR in closed state | PATCH to reopen 200; within 5s, GET preview status returns non-null |
| 5 | Auto-boot does not trigger without `.codeplane/preview.ts` | POST create LR in repo without preview config | Valid LR creation payload | LR created (201); after 10s, GET preview status returns `null` |
| 6 | Auto-boot does not trigger when setting is disabled | Set `preview_auto_boot: false`, POST create LR | Valid LR creation payload | LR created (201); after 10s, GET preview status returns `null` |
| 7 | Auto-boot is idempotent — existing running preview not duplicated | Create LR (auto-boot triggers), immediately POST create preview manually | Valid LR creation + manual preview create | Both operations succeed; only one container exists; GET preview returns same `container_id` |
| 8 | Auto-boot replaces stopped preview | Create LR, auto-boot creates preview, delete preview, reopen LR | LR cycle | New preview created with different `container_id` |
| 9 | LR response includes inline preview field after auto-boot | POST create LR, wait for auto-boot, GET LR detail | Valid LR | Response includes `preview: { status: "running", url: "..." }` |
| 10 | LR response preview field is null when no preview | POST create draft LR, GET LR detail | Draft LR | Response includes `preview: null` |
| 11 | Repository settings returns `preview_auto_boot` field | GET repo settings for repo with preview config | — | Response includes `preview_auto_boot: true` and `has_preview_config: true` |
| 12 | Repository settings returns `has_preview_config: false` when no config file | GET repo settings for repo without `.codeplane/preview.ts` | — | `has_preview_config: false` |
| 13 | Toggle auto-boot off via settings | PATCH repo settings with `{ "preview_auto_boot": false }` | Valid admin token | 200, subsequent GET shows `preview_auto_boot: false` |
| 14 | Toggle auto-boot on via settings | PATCH repo settings with `{ "preview_auto_boot": true }` | Valid admin token | 200, subsequent GET shows `preview_auto_boot: true` |
| 15 | Non-admin cannot toggle auto-boot | PATCH repo settings with write-only user token | `{ "preview_auto_boot": false }` | 403 |
| 16 | Auto-boot fails silently when no container runtime | POST create LR in repo with preview config but no sandbox | — | LR created (201); preview status is `null`; no error in LR response |
| 17 | Malformed `.codeplane/preview.ts` does not crash auto-boot | POST create LR in repo with malformed preview config | — | LR created (201); preview status is `null`; server log contains WARN about parse error |
| 18 | Auto-boot latency under 5 seconds (trigger to initiation) | POST create LR, measure time from LR creation to first preview status non-null | Valid payload, functional sandbox | Preview status appears within 5 seconds of LR creation |
| 19 | Multiple LRs in same repo each get their own auto-booted preview | POST create two LRs rapidly in same repo | Valid payloads | Each LR has its own preview with distinct `container_id` |
| 20 | Config cache works — rapid LR creations do not cause repeated file reads | POST create 5 LRs within 10 seconds in same repo | Valid payloads | All auto-boot; server logs show at most 1 cache miss + 4 cache hits |
| 21 | Config cache invalidated on push | Update `.codeplane/preview.ts` (push to default bookmark), then create LR | — | New LR uses updated config (e.g., changed port number) |
| 22 | Auto-boot respects global concurrency limit | Create enough LRs to exhaust concurrency limit, then create one more | Many LRs, all with preview config | Last LR created successfully, but preview is `null` (auto-boot skipped due to limit) |
| 23 | `preview_auto_boot` default is `true` for new repositories | Create new repo, add `.codeplane/preview.ts`, GET settings | — | `preview_auto_boot: true` |
| 24 | LR created as open in repo with `preview_auto_boot: false` — no auto-boot | Disable auto-boot, create open LR | — | Preview is `null` after 10 seconds |

### CLI Integration Tests

| # | Test | Command | Expected |
|---|------|---------|----------|
| 25 | CLI `preview status` shows auto-booted preview | Create LR (triggers auto-boot), `codeplane preview status --lr 7` | Exit 0, output includes `Auto-booted: yes` and a URL |
| 26 | CLI `preview status` shows no preview for draft LR | Create draft LR, `codeplane preview status --lr 8` | Exit 0, output indicates no preview exists |
| 27 | CLI `repo settings` shows auto-boot status | `codeplane repo settings --repo owner/repo` | Exit 0, output includes `Preview Auto-Boot: enabled` |
| 28 | CLI `repo settings update` toggles auto-boot | `codeplane repo settings update --repo owner/repo --preview-auto-boot=false` | Exit 0, confirmation message |
| 29 | CLI `repo settings update` rejects non-admin | Run with read-only token: `codeplane repo settings update --preview-auto-boot=false` | Exit non-zero, 403 error |
| 30 | CLI `land create` for open LR shows preview URL in output | `codeplane land create --title "test" --change-id abc123 --target main` | Exit 0, output includes preview URL if auto-boot triggered |
| 31 | CLI `preview status --json` includes auto-boot field | `codeplane preview status --lr 7 --json` | Exit 0, JSON includes `"auto_booted": true` |

### Playwright E2E Tests (Web UI)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 32 | Auto-boot indicator shown on new LR detail page | Create LR (open state) in repo with preview config, navigate to LR detail | "Auto-starting preview…" spinner visible in preview section |
| 33 | Preview URL appears after auto-boot completes | Wait on LR detail page after creation | Preview section transitions from spinner to preview URL card with "Running" badge |
| 34 | Auto-booted badge visible on preview card | Wait for auto-boot to complete on LR detail | "Auto-booted" label/tag visible on preview card |
| 35 | Draft LR detail page shows manual "Create Preview" button | Create draft LR, navigate to detail page | "Create Preview" button visible (not auto-starting) |
| 36 | Promote draft → open triggers auto-boot in UI | On draft LR detail page, click "Ready for review" (promote to open) | Preview section shows "Auto-starting preview…" spinner |
| 37 | Auto-boot failure falls back to manual button | Create LR in repo with malformed preview config | After timeout, "Create Preview" button appears with "Automatic preview boot did not complete" message |
| 38 | Repository settings shows auto-boot toggle | Navigate to Repository Settings → Preview Environments | Toggle visible, labeled "Automatically boot previews for new Landing Requests" |
| 39 | Toggle auto-boot off in settings | Click toggle to off, save | Toggle reflects "off" state; success toast |
| 40 | Toggle is disabled when no preview config exists | Navigate to settings for repo without `.codeplane/preview.ts` | Toggle is grayed out with tooltip explaining prerequisite |
| 41 | Config status indicator shows "found" when preview.ts exists | Navigate to settings for repo with `.codeplane/preview.ts` | Green check with "✓ .codeplane/preview.ts found" |
| 42 | Config status indicator shows "not found" when preview.ts missing | Navigate to settings for repo without `.codeplane/preview.ts` | Gray indicator with "not found — add .codeplane/preview.ts" |
| 43 | LR list page shows preview status icon for auto-booted LRs | Navigate to LR list for repo with auto-booted previews | Preview status icon (small colored dot or badge) visible next to LR entries with active previews |
| 44 | Reopened LR triggers auto-boot UI flow | Close LR (preview deleted), reopen LR, navigate to detail | "Auto-starting preview…" spinner appears again |

### TUI Integration Tests

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 45 | TUI shows auto-starting state on new LR | Open LR detail screen immediately after LR creation | Preview section shows "auto-starting… ⠋" |
| 46 | TUI shows auto-booted preview URL | Open LR detail after auto-boot completes | `Preview: http://localhost:49321 (running, auto-booted)` |
| 47 | TUI shows manual hint for draft LR | Open detail screen for draft LR | `[p] Create Preview` hint (no auto-start) |
| 48 | TUI reflects preview after draft→open promotion | Promote draft LR to open in TUI | Preview section transitions from `[p]` hint to "auto-starting… ⠋" to URL |

### Cross-Cutting Tests

| # | Test | Description | Expected |
|---|------|-------------|----------|
| 49 | Concurrent LR creation in same repo — independent auto-boots | Create 5 LRs simultaneously in same repo | Each gets its own preview; 5 distinct container IDs; no race conditions |
| 50 | Auto-boot + manual create race condition | Create LR (auto-boot starts), immediately POST manual preview create | Only one preview created; both responses reference same container |
| 51 | LR create → immediate close → auto-boot | Create LR, close it within 1 second | Preview may or may not have been created; if created, it is cleaned up by close handler; no orphaned containers |
| 52 | Server restart during auto-boot | Create LR, kill server within 2 seconds, restart server | No orphaned half-provisioned containers; LR exists without preview; user can manually create |
| 53 | Config file change between LR creations — cache coherence | Create LR (auto-boot with port 3000), change `.codeplane/preview.ts` to port 8080, wait >60s, create another LR | First preview has port 3000, second has port 8080 |
| 54 | Auto-boot rate limit enforcement | Create and close 11 LRs in rapid succession (within 1 minute) in same repo | First 10 auto-boot attempts proceed; 11th is rate-limited and skipped; WARN log emitted |
| 55 | Full lifecycle: create LR → auto-boot → idle suspend → wake → land → cleanup | Create open LR, wait for auto-boot, let idle-suspend, access preview URL (wake), land the LR | Preview created automatically, suspended when idle, woken on access, deleted when LR is landed |
| 56 | Auto-boot with maximum valid config (all fields at boundary) | `.codeplane/preview.ts` with port 65535, 4096-char install, 4096-char start, 64 env vars (max key/value lengths) | Auto-boot succeeds; preview runs on port 65535 |
| 57 | Auto-boot with env vars at max count (64) — boundary test | Config with exactly 64 env vars | Auto-boot succeeds |
| 58 | Auto-boot with env vars exceeding max count (65) — should fail config parse | Config with 65 env vars | Auto-boot skips with config_parse_error; WARN logged |
| 59 | Auto-boot with install command at max length (4096 chars) | Config with 4096-char install | Auto-boot succeeds |
| 60 | Auto-boot with install command exceeding max length (4097 chars) | Config with 4097-char install | Auto-boot skips with config_parse_error |
