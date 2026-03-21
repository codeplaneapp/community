# LANDING_PREVIEW_DELETE

Specification for LANDING_PREVIEW_DELETE.

## High-Level User POV

When a Landing Request's preview environment is no longer needed — because the changes have been merged, the Landing Request has been abandoned, or the developer simply wants to free up resources — Codeplane lets the user delete the preview with a single action. Clicking "Delete Preview" on the Landing Request detail page in the web UI, running a delete command in the CLI, or pressing a keybinding in the TUI immediately tears down the preview container and removes the preview URL. The page updates to reflect that no preview is active, and the "Create Preview" button returns, ready for the user to spin up a fresh environment if they change their mind.

Deleting a preview is a deliberate cleanup action. It stops the running container, releases the mapped port, and reclaims all resources the preview was consuming. This matters for self-hosted teams where container capacity is limited — a single developer deleting stale previews can free up slots for the rest of the team. It also matters for tidy workflows: once a reviewer has verified a front-end change and the Landing Request is about to be merged, there is no reason to keep a preview running and accruing idle resource cost.

The delete operation is idempotent. If a user clicks "Delete Preview" and the preview has already been removed (perhaps by another team member, or by an automated cleanup process), the operation succeeds silently. No error appears. This means users never have to worry about race conditions or stale UI state — the action simply ensures the preview is gone.

Deleting a preview does not affect the Landing Request itself. The Landing Request remains open (or in whatever state it was in), its changes and reviews are untouched, and its diff is still browsable. The only thing that changes is the preview environment: it disappears. If the user later wants a preview again, they can create one from scratch.

This feature complements the preview creation flow and is a necessary counterpart to it. Together, create and delete give users full manual control over the preview lifecycle, supplementing the automatic idle-suspension and auto-resume behaviors that Codeplane manages in the background.

## Acceptance Criteria

### Definition of Done

- A user with write access to a repository can delete the preview environment for a Landing Request.
- Deleting a preview stops and removes the backing container, releases the mapped port, and clears internal state (idle timers, in-memory record).
- The preview URL becomes inaccessible after deletion.
- The operation is idempotent: deleting a preview that does not exist returns success (204), not an error.
- The Landing Request detail page in all clients (web, CLI, TUI) updates to show no active preview after deletion.
- The feature degrades gracefully when no container runtime is available (no-op, since no preview could have been created).

### Functional Constraints

- [ ] Deleting a preview requires a valid `owner`, `repo`, and Landing Request `number` in the URL path.
- [ ] The `owner` path parameter must be a non-empty, non-whitespace string. Whitespace-only values must return 400.
- [ ] The `repo` path parameter must be a non-empty, non-whitespace string. Whitespace-only values must return 400.
- [ ] The Landing Request number must be a positive integer. Zero, negative numbers, non-numeric strings, and floating-point numbers must return 400.
- [ ] The repository must exist. A delete request for a non-existent owner/repo must return 404.
- [ ] The Landing Request must exist. A delete request for a non-existent LR number must return 404.
- [ ] If no preview environment exists for the given Landing Request, the API must return 204 (success, no content). This is the idempotent case.
- [ ] If a preview exists in any status (`starting`, `running`, `suspended`, `failed`, `stopped`), the delete operation must remove it and return 204.
- [ ] Deleting a preview must clear the associated idle-suspension timer so that no stale timer fires after deletion.
- [ ] Deleting a preview must call `deleteVM` on the container sandbox client to stop and remove the container. If `deleteVM` fails (e.g., container already removed externally), the error must be caught and the preview record must still be removed (best-effort container destruction).
- [ ] The `DELETE` response body must be empty (HTTP 204 No Content).
- [ ] A preview can be deleted regardless of the Landing Request's state — `open`, `draft`, `closed`, or `merged` all allow deletion. (Previews may linger after a Landing Request state change, and explicit cleanup must be possible in all states.)
- [ ] After deletion, a subsequent `GET` for the same preview must return 404.
- [ ] After deletion, a subsequent `POST` (create) for the same Landing Request must succeed with a new container (no stale state).
- [ ] Concurrent delete requests for the same preview must not error. Both requests return 204. Only one actually destroys the container.

### Edge Cases

- [ ] Deleting a preview that was just created (container still in `starting` status) must succeed and destroy the container.
- [ ] Deleting a preview that is `suspended` must succeed and destroy the container.
- [ ] Deleting a preview that is `failed` must succeed and clean up the record.
- [ ] If the container runtime (Docker/Podman) is completely unavailable at delete time but a preview record exists in memory, the record must still be cleaned up. The container cannot be destroyed (it may already be gone), but the in-memory state must not leak.
- [ ] Deleting a preview and immediately re-creating one for the same Landing Request must produce a new container with a different `container_id`.
- [ ] If the server process restarts (and in-memory state is lost), a delete request for a preview that existed before the restart returns 204 (the record is already gone).
- [ ] Two users with write access deleting the same preview simultaneously both get 204.

## Design

### API Shape

**Endpoint:** `DELETE /api/repos/:owner/:repo/landings/:number/preview`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner username or organization name |
| `repo` | string | Repository name |
| `number` | integer | Landing Request number (positive integer) |

**Request Body:** None. Any body provided is ignored.

**Success Response: `204 No Content`**

Empty body. Returned both when a preview existed and was destroyed, and when no preview existed (idempotent).

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Missing or invalid owner/repo | `{ "message": "owner and repo are required" }` |
| 400 | Invalid LR number (zero, negative, non-numeric) | `{ "message": "valid landing request number is required" }` |
| 401 | Unauthenticated request | `{ "message": "authentication required" }` |
| 403 | User lacks write access to the repository | `{ "message": "insufficient permissions" }` |
| 404 | Repository not found | `{ "message": "repository not found" }` |
| 404 | Landing Request not found | `{ "message": "landing request not found" }` |

Note: A missing preview is **not** a 404 — it returns 204 (idempotent success). Only a missing repository or Landing Request produces 404.

### SDK Shape

The `PreviewService` in `@codeplane/sdk` exposes:

```typescript
deletePreview(repositoryId: number, lrNumber: number): Promise<void>
```

This method is idempotent — if no preview exists for the given key, it returns without error. If a preview exists, it:

1. Clears the idle-suspension timer for the preview.
2. Calls `sandbox.deleteVM(containerId)` to stop and remove the container (best-effort, errors caught).
3. Sets the record status to `"stopped"`.
4. Removes the record from the in-memory store.

The SDK also exports `PreviewService` and all related types (`PreviewResponse`, `PreviewStatus`) from `@codeplane/sdk`.

### CLI Command

**Command:** `codeplane preview delete`

**Usage:**
```
codeplane preview delete [--repo <owner/repo>] [--lr <number>] [options]
```

**Flags:**

| Flag | Short | Description |
|------|-------|-------------|
| `--repo` | `-R` | Repository in `owner/repo` format (defaults to current repo context) |
| `--lr` | `-l` | Landing Request number (required) |
| `--json` | | Output raw JSON response (empty object `{}` on success) |
| `--force` | `-f` | Skip confirmation prompt |

**Behavior:**

1. Without `--force`, the CLI displays a confirmation prompt: `Delete preview for landing request #7? [y/N]`.
2. With `--force`, the deletion proceeds immediately.
3. On success (204), the CLI prints a confirmation message.
4. On error, the CLI prints the error message from the API and exits with a non-zero code.

**Example:**
```bash
# Delete with confirmation
codeplane preview delete --lr 7
# -> Delete preview for landing request #7? [y/N] y
# -> ✓ Preview deleted for landing request #7

# Force delete without confirmation
codeplane preview delete --lr 7 --force
# -> ✓ Preview deleted for landing request #7

# JSON output
codeplane preview delete --lr 7 --force --json
# -> {}
```

### Web UI Design

**Location:** Landing Request detail page, in the "Preview" section or sidebar panel.

**Trigger:** A "Delete Preview" button displayed when a preview exists for the current Landing Request (in any status: running, starting, suspended, failed).

**Button Placement and Appearance:**
- The "Delete Preview" button appears as a secondary/destructive-styled button (red text or red outline) within the preview status card, alongside the preview URL and status badge.
- It is visually subordinate to the preview URL link to avoid accidental clicks.

**Button States:**
- **Preview exists (running):** Preview status card shows the URL, "Running" badge, and a "Delete Preview" button.
- **Preview exists (suspended):** Status card shows "Suspended" badge, "Wake Preview" button, and "Delete Preview" button.
- **Preview exists (starting):** Status card shows "Starting..." spinner and "Delete Preview" button (users may abort a slow startup).
- **Preview exists (failed):** Status card shows "Failed" badge and "Delete Preview" button (cleanup of failed previews).
- **Deleting:** When the delete button is clicked, it becomes disabled, shows a spinner with "Deleting..." text. The rest of the card remains visible.
- **Deleted:** The entire preview status card is replaced by the "Create Preview" button (same state as when no preview exists).

**Confirmation:** Clicking "Delete Preview" opens a lightweight confirmation dialog: "Delete preview for landing request #N? The preview URL will become inaccessible." with "Cancel" and "Delete" buttons. The "Delete" button is styled as a destructive action (red).

**Error display:** If deletion fails, a toast notification displays the error message. The preview card returns to its previous state.

**Optimistic update:** After the user confirms deletion, the UI can optimistically remove the preview card and show the "Create Preview" button. If the API call fails, the card is restored and an error toast appears.

### TUI UI

**Location:** Landing Request detail screen, in the "Preview" section.

**Display when preview exists:**
- `Preview: http://localhost:49321 (running)  [d] Delete`
- `Preview: suspended — [p] Wake  [d] Delete`
- `Preview: starting...  [d] Delete`
- `Preview: failed  [d] Delete`

**Keybinding:** `d` (when focused on the Preview section) triggers preview deletion.

**Confirmation:** After pressing `d`, the TUI displays an inline prompt: `Delete preview? [y/N]`. Pressing `y` confirms; pressing `N` or `Esc` cancels.

**After deletion:** The preview section updates to: `[p] Create Preview`

### Documentation

The following end-user documentation should be written:

1. **Guide addition: "Preview Environments for Landing Requests"** — Add a "Deleting a Preview" section to the existing preview environments guide. Explain when and why a user would delete a preview (freeing resources, cleaning up after merge, removing stale environments). Include step-by-step instructions for web UI, CLI, and TUI. Emphasize that deletion is idempotent and does not affect the Landing Request.

2. **CLI Reference: `codeplane preview delete`** — Full flag documentation with examples. Expected output formats (human-readable and JSON). Document the `--force` flag and confirmation behavior.

3. **FAQ addition** — Add entries: "What happens to my Landing Request when I delete a preview?" (nothing — the LR is unaffected). "Can I re-create a preview after deleting it?" (yes, at any time). "What if two people delete the same preview?" (both succeed, no error).

## Permissions & Security

### Authorization

| Role | Can Delete Preview? |
|------|-------------------|
| Repository Owner | ✅ Yes |
| Repository Admin | ✅ Yes |
| Repository Write (Member) | ✅ Yes |
| Repository Read | ❌ No — returns 403 |
| Anonymous / Unauthenticated | ❌ No — returns 401 |

The user must be authenticated (via session cookie, PAT, or OAuth token) and must have write-level access to the repository.

**Note:** Any user with write access can delete a preview, even if they did not create it. This is intentional — preview environments are shared repository resources, not personal artifacts.

### Rate Limiting

- **Per-user rate limit:** Maximum 30 delete requests per minute per user. Exceeding this returns `429 Too Many Requests`. The limit is higher than create (10/min) because deletes are cheap operations and users may be batch-cleaning.
- **Per-repository rate limit:** Maximum 60 delete requests per minute per repository. This accommodates scripted cleanup but prevents abuse.
- **No global concurrency concern:** Unlike creation, deletion does not consume resources, so no global concurrency cap is needed.

### Data Privacy

- The delete operation does not accept sensitive input — there is no request body.
- Container logs inside the preview container may contain PII or application secrets. When the container is destroyed via `deleteVM`, those logs are removed with the container. This is the expected behavior and provides a natural data-retention boundary.
- The `container_id` value is logged for audit purposes. Container IDs are not considered PII.
- No preview environment variables are exposed or logged during deletion.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `LandingPreviewDeleted` | Preview container successfully deleted | `repository_id`, `lr_number`, `repo_owner`, `repo_name`, `preview_status_at_delete` (the status the preview was in when delete was called: "running", "suspended", "starting", "failed"), `preview_age_seconds` (time since creation), `preview_idle_seconds` (time since last access), `triggered_by` ("manual_api", "manual_cli", "manual_ui", "manual_tui") |
| `LandingPreviewDeleteNoOp` | Delete called but no preview existed | `repository_id`, `lr_number`, `repo_owner`, `repo_name` |
| `LandingPreviewDeleteFailed` | Container destruction threw an unrecoverable error (should be extremely rare since errors are caught best-effort) | `repository_id`, `lr_number`, `error_type`, `error_message` |

### Funnel Metrics

| Metric | Description | Success Indicator |
|--------|-------------|-------------------|
| Delete success rate | `LandingPreviewDeleted` / (`LandingPreviewDeleted` + `LandingPreviewDeleteFailed`) | > 99% (deletes should almost never fail) |
| Manual delete rate | `LandingPreviewDeleted` where triggered_by starts with "manual" / total landing requests with previews | Informational — tracks how often users proactively clean up |
| Time-to-delete after LR close | For Landing Requests that had a preview, time from LR close/merge to preview deletion | Trending downward (indicates good cleanup hygiene) |
| Re-create after delete rate | Landing Requests where `LandingPreviewCreated` follows `LandingPreviewDeleted` / total `LandingPreviewDeleted` | Informational — high rate may indicate users are using delete+create as a "restart" pattern |
| Preview age at deletion | Distribution of `preview_age_seconds` on `LandingPreviewDeleted` | Informational — reveals typical preview lifetimes |

## Observability

### Logging

| Log Point | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Preview deletion requested | INFO | `repository_id`, `lr_number`, `repo_owner`, `repo_name`, `user_id` | Emitted when the route handler receives a valid delete request |
| Preview found for deletion | INFO | `repository_id`, `lr_number`, `container_id`, `preview_status`, `preview_age_ms` | Emitted when a preview record exists and will be destroyed |
| Container destruction started | DEBUG | `repository_id`, `lr_number`, `container_id` | Emitted before calling `sandbox.deleteVM()` |
| Container destruction completed | INFO | `repository_id`, `lr_number`, `container_id`, `duration_ms` | Emitted after `sandbox.deleteVM()` returns successfully |
| Container destruction failed (caught) | WARN | `repository_id`, `lr_number`, `container_id`, `error` | Emitted when `sandbox.deleteVM()` throws. Non-fatal — the preview record is still cleaned up. |
| Idle timer cleared | DEBUG | `repository_id`, `lr_number` | Emitted when the idle-suspension timer for this preview is cleared |
| Preview record removed | DEBUG | `repository_id`, `lr_number` | Emitted when the in-memory record is deleted from the store |
| No-op delete (no preview exists) | DEBUG | `repository_id`, `lr_number` | Emitted when delete is called but no preview record exists |
| Request validation failed | WARN | `owner`, `repo`, `number`, `reason` | Emitted on 400-class validation errors |
| Auth/permission denied | WARN | `user_id`, `owner`, `repo`, `reason` | Emitted on 401/403 errors |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_preview_delete_total` | Counter | `result` ("success", "no_op", "failed") | Total preview deletion requests by outcome. "success" = preview existed and was removed. "no_op" = no preview existed. "failed" = unrecoverable error. |
| `codeplane_preview_delete_duration_seconds` | Histogram | `result` | Time from request receipt to response, bucketed: 0.1s, 0.5s, 1s, 5s, 10s, 30s |
| `codeplane_preview_container_delete_duration_seconds` | Histogram | — | Time spent in the `sandbox.deleteVM()` call specifically |
| `codeplane_preview_active_count` | Gauge | `status` ("running", "starting", "suspended") | Current number of active previews by status (shared with create — decremented on delete) |
| `codeplane_preview_delete_errors_total` | Counter | `error_type` ("container_failed", "validation", "auth") | Deletion errors by category |
| `codeplane_preview_age_at_delete_seconds` | Histogram | — | Age of previews at deletion time, bucketed: 60s, 300s, 900s, 3600s, 14400s, 86400s |

### Alerts

#### Alert: `PreviewDeleteHighFailureRate`
**Condition:** `rate(codeplane_preview_delete_errors_total{error_type="container_failed"}[10m]) > 0.5` for 5 minutes.
**Severity:** Warning

**Runbook:**
1. Check `codeplane_preview_delete_errors_total` by `error_type` label to confirm the dominant failure mode.
2. If `error_type="container_failed"`: The container runtime is having trouble removing containers.
   - SSH into the host and run `docker ps -a --filter label=tech.codeplane.preview` to list all preview containers.
   - Check if containers are in a stuck state: `docker inspect <container_id> | jq '.[0].State'`.
   - Try manual removal: `docker rm -f <container_id>`. If this fails, the Docker daemon may be unhealthy.
   - Check Docker daemon logs: `journalctl -u docker --since "10 minutes ago"`.
   - Check disk space: `df -h` and `docker system df`. Full disk can prevent container removal.
   - If Docker daemon is unresponsive, restart it: `systemctl restart docker`. Note: this affects all containers on the host.
3. If the issue is transient (e.g., one container was stuck), no further action needed — best-effort cleanup means the record was still removed from Codeplane's state.
4. If persistent, escalate to infrastructure team.

#### Alert: `PreviewDeleteSlowP95`
**Condition:** `histogram_quantile(0.95, rate(codeplane_preview_delete_duration_seconds_bucket[10m])) > 30` for 10 minutes.
**Severity:** Warning

**Runbook:**
1. Check `codeplane_preview_container_delete_duration_seconds` to determine if the bottleneck is the `deleteVM` call.
2. If container deletion is slow:
   - Check Docker daemon load: `docker stats --no-stream`. High CPU or memory pressure can slow container operations.
   - Check for many concurrent deletions: `rate(codeplane_preview_delete_total[5m])`. A spike in deletions (e.g., batch cleanup) can cause contention.
   - Check for large container filesystems: containers with many written files take longer to remove. Consider if preview containers are writing excessive data.
3. If container deletion is fast but overall request is slow: check server-side middleware latency (auth, rate limiting). Review Hono middleware metrics.
4. Consider adding a timeout to the `deleteVM` call if one is not already present.

#### Alert: `PreviewActiveCountNeverDecreasing`
**Condition:** `delta(codeplane_preview_active_count[1h]) >= 0` AND `codeplane_preview_active_count > 20` for 2 hours.
**Severity:** Warning

**Runbook:**
1. This alert fires when the active preview count has not decreased in over an hour while being above 20, suggesting previews are not being cleaned up.
2. List all active previews: use the admin API or check `codeplane_preview_active_count` by status label.
3. Check if idle-suspension is working: `codeplane_preview_active_count{status="suspended"}` should be non-zero if previews are going idle.
4. Check if Landing Requests are being closed/merged without preview cleanup: look for recent `LandingPreviewDeleted` events. If none exist, automatic cleanup may not be wired up.
5. Consider manually deleting stale previews via the API or running `docker rm -f` on containers with the `tech.codeplane.preview` label.
6. File a bug if automatic cleanup on LR close/merge is expected but not happening.

### Error Cases and Failure Modes

| Failure Mode | Detection | User Impact | Recovery |
|--------------|-----------|-------------|----------|
| Container runtime unavailable at delete time | `sandbox` is null | No user impact — if the runtime was unavailable, no preview could exist. If a record somehow exists, it is cleaned up from memory. | None needed |
| Container already removed externally (e.g., `docker rm`) | `deleteVM` throws "not found" error | No user impact — error is caught, record still cleaned up | None needed |
| Container removal hangs or times out | `deleteVM` exceeds timeout | Slow API response; user may retry | Implement timeout on `deleteVM`; manual `docker rm -f` |
| Container removal fails with permission error | `deleteVM` throws permission error | Error logged as WARN; record still cleaned up from memory but container persists | Check Docker socket permissions; manual `docker rm -f` |
| Race condition: two concurrent deletes | Second `deleteVM` call throws "not found" | No user impact — both requests return 204 | None needed |
| Server restart during deletion | Process killed mid-operation | Container may persist (orphaned); in-memory record is lost on restart | Orphaned containers should be cleaned by container label-based garbage collection |
| In-memory state inconsistency (record exists but container doesn't) | `deleteVM` throws "not found" | No user impact — record still cleaned up | None needed |

## Verification

### API Integration Tests

| # | Test | Method | Input | Expected |
|---|------|--------|-------|----------|
| 1 | Delete existing running preview | DELETE `/api/repos/:owner/:repo/landings/:number/preview` | Preview exists in "running" status | 204, empty body |
| 2 | Delete existing suspended preview | DELETE same endpoint | Preview exists in "suspended" status | 204, empty body |
| 3 | Delete existing starting preview | DELETE same endpoint | Preview exists in "starting" status | 204, empty body |
| 4 | Delete existing failed preview | DELETE same endpoint | Preview exists in "failed" status | 204, empty body |
| 5 | Idempotent delete — no preview exists | DELETE same endpoint | No preview for this LR | 204, empty body |
| 6 | Double delete — second delete is idempotent | DELETE same endpoint twice | Preview exists -> first delete -> second delete | Both return 204 |
| 7 | GET after delete returns 404 | DELETE then GET same endpoint | Preview existed | DELETE returns 204, GET returns 404 with "no preview environment for this landing request" |
| 8 | Create after delete produces new container | DELETE then POST same endpoint | Preview existed | DELETE returns 204, POST returns 201 with different `container_id` |
| 9 | Delete does not affect Landing Request | DELETE then GET LR detail | Preview existed | DELETE returns 204, LR detail returns 200 with unchanged data |
| 10 | Missing owner returns 400 | DELETE `/api/repos//myrepo/landings/1/preview` | — | 400, `"owner and repo are required"` |
| 11 | Missing repo returns 400 | DELETE `/api/repos/alice//landings/1/preview` | — | 400, `"owner and repo are required"` |
| 12 | Whitespace-only owner returns 400 | DELETE with owner=" " | — | 400, `"owner and repo are required"` |
| 13 | Whitespace-only repo returns 400 | DELETE with repo=" " | — | 400, `"owner and repo are required"` |
| 14 | Invalid LR number (zero) returns 400 | DELETE with number=0 | — | 400, `"valid landing request number is required"` |
| 15 | Invalid LR number (negative) returns 400 | DELETE with number=-1 | — | 400, `"valid landing request number is required"` |
| 16 | Invalid LR number (non-numeric) returns 400 | DELETE with number="abc" | — | 400, `"valid landing request number is required"` |
| 17 | Invalid LR number (floating-point) returns 400 | DELETE with number=1.5 | — | 400, `"valid landing request number is required"` |
| 18 | Very large LR number (MAX_SAFE_INTEGER) succeeds when valid | DELETE with number=9007199254740991 | No preview, valid LR | 204 |
| 19 | Non-existent repository returns 404 | DELETE for non-existent owner/repo | — | 404, `"repository not found"` |
| 20 | Non-existent Landing Request returns 404 | DELETE for valid repo but non-existent LR number | — | 404, `"landing request not found"` |
| 21 | Unauthenticated request returns 401 | DELETE without auth header/cookie | — | 401 |
| 22 | Read-only user returns 403 | DELETE with a read-only user token | — | 403 |
| 23 | Write-access user succeeds | DELETE with write-access user token | Preview exists | 204 |
| 24 | Admin user succeeds | DELETE with admin user token | Preview exists | 204 |
| 25 | Owner user succeeds | DELETE with repo owner token | Preview exists | 204 |
| 26 | Delete preview for open LR succeeds | DELETE | LR state = "open" | 204 |
| 27 | Delete preview for draft LR succeeds | DELETE | LR state = "draft" | 204 |
| 28 | Delete preview for closed LR succeeds | DELETE | LR state = "closed" | 204 |
| 29 | Delete preview for merged LR succeeds | DELETE | LR state = "merged" | 204 |
| 30 | Response body is empty on 204 | DELETE | Preview exists | Content-Length: 0, no body |
| 31 | Response Content-Type is not set on 204 | DELETE | Preview exists | No Content-Type header (empty body) |
| 32 | Concurrent deletes — both succeed | Send 5 simultaneous DELETE requests | Preview exists | All return 204; only 1 `deleteVM` call to container runtime |
| 33 | Create -> Delete -> Create cycle produces distinct containers | Full lifecycle | — | First create 201, delete 204, second create 201 with different `container_id` |
| 34 | Delete with request body (ignored) | DELETE with `{ "foo": "bar" }` body | Preview exists | 204 (body is ignored) |
| 35 | Container runtime failure during delete does not error to client | DELETE when `deleteVM` throws | Preview exists | 204 (container error caught, record cleaned up) |
| 36 | Rate limit enforcement — per-user | Send 31 DELETE requests in under 1 minute from one user | — | 31st request returns 429 |
| 37 | Rate limit enforcement — per-repository | Send 61 DELETE requests in under 1 minute across users for same repo | — | 61st request returns 429 |

### CLI Integration Tests

| # | Test | Command | Expected |
|---|------|---------|----------|
| 38 | CLI delete preview with confirmation | `codeplane preview delete --lr 7` (then type `y`) | Exit 0, output contains "Preview deleted for landing request #7" |
| 39 | CLI delete preview with --force | `codeplane preview delete --lr 7 --force` | Exit 0, output contains "Preview deleted", no prompt |
| 40 | CLI delete preview — JSON output | `codeplane preview delete --lr 7 --force --json` | Exit 0, output is `{}` |
| 41 | CLI delete preview — confirmation declined | `codeplane preview delete --lr 7` (then type `N`) | Exit 0, output contains "Cancelled" or similar, no API call made |
| 42 | CLI delete preview — missing LR flag | `codeplane preview delete` | Exit non-zero, error about required --lr flag |
| 43 | CLI delete preview — invalid LR number | `codeplane preview delete --lr abc` | Exit non-zero, error message |
| 44 | CLI delete preview — unauthenticated | `codeplane preview delete --lr 7 --force` (no auth) | Exit non-zero, authentication error |
| 45 | CLI idempotent delete — no preview | `codeplane preview delete --lr 7 --force` (no preview exists) | Exit 0, success message (idempotent) |
| 46 | CLI delete with --repo flag | `codeplane preview delete --repo alice/myapp --lr 7 --force` | Exit 0, success message |
| 47 | CLI delete with -R shorthand | `codeplane preview delete -R alice/myapp -l 7 -f` | Exit 0, success message |

### Playwright E2E Tests (Web UI)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 48 | Delete preview button visible when preview exists | Navigate to LR detail page with active preview | "Delete Preview" button is visible in preview card |
| 49 | Delete preview button not visible when no preview | Navigate to LR detail page without preview | No "Delete Preview" button; "Create Preview" button shown instead |
| 50 | Click delete shows confirmation dialog | Click "Delete Preview" button | Confirmation dialog appears with "Cancel" and "Delete" buttons |
| 51 | Cancel confirmation does not delete | Click "Delete Preview", then click "Cancel" | Dialog closes; preview card remains unchanged |
| 52 | Confirm deletion removes preview card | Click "Delete Preview", then click "Delete" in dialog | Preview card disappears; "Create Preview" button appears |
| 53 | Delete button shows loading state | Click "Delete Preview", confirm; observe button during API call | Button shows spinner/"Deleting..." text and is disabled |
| 54 | Error toast on failed deletion | Mock API to return 500; click delete and confirm | Toast notification with error message; preview card remains |
| 55 | Delete on suspended preview succeeds | Navigate to LR with suspended preview, delete it | Preview card removed; "Create Preview" button appears |
| 56 | Can create preview after deletion | Delete preview, then click "Create Preview" | New preview created successfully with URL displayed |
| 57 | Delete button not visible for read-only users | Log in as read-only user; navigate to LR with preview | Preview URL and status visible; "Delete Preview" button hidden |

### TUI Integration Tests

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 58 | Delete keybinding hint shown when preview exists | Open LR detail with active preview | `[d] Delete` visible in preview section |
| 59 | Press `d` shows confirmation prompt | Press `d` in preview section | Inline prompt `Delete preview? [y/N]` appears |
| 60 | Confirm with `y` deletes preview | Press `d`, then `y` | Preview section updates to `[p] Create Preview` |
| 61 | Cancel with `N` preserves preview | Press `d`, then `N` | Preview section unchanged |
| 62 | Cancel with Esc preserves preview | Press `d`, then `Esc` | Preview section unchanged |
| 63 | Delete keybinding not shown when no preview | Open LR detail without preview | No `[d]` hint; only `[p] Create Preview` |

### Cross-Cutting Tests

| # | Test | Description | Expected |
|---|------|-------------|----------|
| 64 | Full lifecycle: Create -> Access -> Delete -> Verify gone | Create preview, access URL to record activity, delete, then GET status | Create 201, access succeeds, delete 204, GET 404 |
| 65 | Delete + Create race condition | Delete and create simultaneously for same LR | No errors; final state is either "preview exists" or "no preview" (consistent) |
| 66 | Concurrent deletes from multiple users | Two write-access users delete same preview at same time | Both get 204; exactly one container destroyed |
| 67 | Delete after server restart (in-memory state lost) | Create preview, restart server, delete preview | Delete returns 204 (no-op, since in-memory state was lost) |
| 68 | Delete does not leak idle timer | Create preview, note timer count, delete, verify no stale timers fire | No idle-suspension callback fires after deletion |
| 69 | Container actually removed after delete | Create preview, note container ID, delete, query Docker for container ID | Container no longer exists in Docker (`docker inspect` returns error) |
