# WORKSPACE_SNAPSHOT_VIEW

Specification for WORKSPACE_SNAPSHOT_VIEW.

## High-Level User POV

When a developer has been creating snapshots of their workspaces — capturing configured environments, dependency baselines, or agent-ready starting points — they need a way to inspect an individual snapshot's details. The snapshot view is the detail screen for a single workspace snapshot, answering the essential questions: "What is this snapshot called? Which workspace was it taken from? When was it created? Is the source workspace still around?"

From the web UI, TUI, or CLI, a user navigates to a specific snapshot — either by clicking a snapshot row in the snapshots tab of the workspace detail view, selecting one from the repository-level snapshot listing, or requesting it directly by ID. The view shows the snapshot's name, unique identifier, the source workspace it was captured from, the underlying image reference, and precise creation and update timestamps.

The snapshot view is not just informational — it is a decision-making surface. A developer reviewing which snapshot to use for a new workspace can examine a snapshot's provenance: when it was captured, which workspace it came from, and whether that source workspace still exists. This is especially important in team environments where multiple snapshots accumulate over time, and in agent-driven workflows where snapshots serve as repeatable baselines for automated development sessions.

From the snapshot view, the user can take two key actions: use the snapshot to create a new workspace (jumping directly into the workspace creation flow with the snapshot pre-selected), or delete the snapshot if it is no longer needed. The delete action requires explicit confirmation because snapshot deletion is irreversible — the underlying container image is removed and any workspace creation referencing that snapshot ID will fail afterward.

The snapshot view is lightweight by design. Snapshots are immutable artifacts — once created, their metadata does not change (except for the `updated_at` timestamp, which reflects any metadata-level writes). There is no editing, renaming, or status lifecycle. The view is a focused read surface with targeted actions, designed to help users make quick decisions about snapshot reuse and cleanup.

## Acceptance Criteria

### Definition of Done

- A user can retrieve the full details of a single workspace snapshot by its ID from the API, CLI, TUI, and web surfaces.
- The view displays all snapshot metadata: id, name, source workspace ID, freestyle snapshot ID (image reference), repository and user association, and timestamps.
- The view provides a "Create Workspace from Snapshot" action that navigates to the workspace creation flow with the snapshot pre-selected.
- The view provides a "Delete Snapshot" action with confirmation that removes the snapshot.
- All clients handle error states (not found, forbidden, unauthenticated, server error) with clear, actionable messaging.
- The snapshot view is accessible from both the workspace detail snapshots tab and from any direct navigation by snapshot ID.
- The feature is covered by integration and end-to-end tests across API, CLI, web UI, and TUI.

### Functional Constraints

- **Scope**: The snapshot view is accessed by a specific snapshot ID within a repository context (`GET /api/repos/:owner/:repo/workspace-snapshots/:id`).
- **Response payload**: The snapshot detail response includes: `id`, `repository_id`, `user_id`, `name`, `workspace_id` (optional — may be absent if the source workspace reference was cleared), `freestyle_snapshot_id`, `created_at`, `updated_at`.
- **Immutability**: Snapshots are read-only artifacts. There is no edit or rename operation from the view. The only write action is deletion.
- **Source workspace resolution**: The view displays the `workspace_id` of the source workspace. If the source workspace has been deleted, the view should still display the workspace ID but indicate that the workspace no longer exists.
- **Delete semantics**: Deletion removes the snapshot metadata from the database. The underlying container image cleanup is a separate concern. Deletion returns HTTP 204 with no body.
- **No status lifecycle**: Snapshots do not have a status field. They are either present or deleted. There is no SSE stream for snapshot state.
- **Snapshot ID format**: Must be a valid UUID (36 characters with dashes). Invalid IDs return HTTP 400 with `"workspace snapshot id is required"`.
- **Cross-endpoint consistency**: A snapshot retrieved via `GET /api/repos/:owner/:repo/workspace-snapshots/:id` must be identical to the same snapshot as it appears in list responses from `GET /api/repos/:owner/:repo/workspace-snapshots`.

### Boundary Constraints

- **Snapshot ID**: Must be a valid UUID format (pattern: `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`). Non-UUID values return HTTP 400.
- **Snapshot name display**: 0–63 characters. Must be displayed in full without truncation in the detail view. An empty name (auto-generated) should be displayed as the generated value, not as a blank.
- **Freestyle snapshot ID**: Variable-length string (typically in the format `codeplane-snapshot-{8chars}-{timestamp}`). Should be displayed as a monospace, copyable value. Must handle IDs up to 255 characters without layout breakage.
- **Workspace ID reference**: UUID format (36 characters). May be absent/null if the snapshot was created via a path that did not persist the workspace reference.
- **Timestamp format**: ISO-8601 strings. Clients must parse and display in the user's local timezone with both relative ("4 hours ago") and absolute ("2026-03-22 14:30 UTC") formats.
- **Repository path parameters**: `owner` and `repo` must be non-empty path segments referencing an existing, accessible repository.

### Edge Cases

- **Snapshot not found**: Returns HTTP 404 with `"workspace snapshot not found"`. Clients show clear "Snapshot not found" message with back-navigation.
- **Snapshot belongs to a different user**: Returns HTTP 404 (not 403) to avoid leaking snapshot existence.
- **Snapshot belongs to a different repository**: Returns HTTP 404.
- **Source workspace deleted**: The snapshot remains valid and accessible. The `workspace_id` field is still present. The UI shows "Source workspace deleted" or similar.
- **Snapshot deleted while viewing**: Subsequent actions fail with appropriate errors. No SSE auto-update.
- **Empty snapshot name**: The auto-generated name is displayed. The view never shows an empty name field.
- **Unauthenticated request**: Returns HTTP 401.
- **User lacks repository access**: Returns HTTP 403 or HTTP 404.
- **Repository does not exist**: Returns HTTP 404.
- **Snapshot ID is empty string**: Returns HTTP 400.
- **Snapshot ID is not a valid UUID**: Returns HTTP 400.
- **Snapshot with very long freestyle_snapshot_id (up to 255 chars)**: View handles without layout breakage.

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/workspace-snapshots/:id`

**Authentication**: Required (session cookie or PAT).

**Path Parameters**:

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `owner` | string | Required, non-empty | Repository owner username or org |
| `repo` | string | Required, non-empty | Repository name |
| `id` | string (UUID) | Required, valid UUID | Snapshot ID |

**Success Response**: HTTP 200

```json
{
  "id": "b1c2d3e4-f5a6-7890-abcd-ef1234567890",
  "repository_id": 42,
  "user_id": 7,
  "name": "after-deps-install",
  "workspace_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "freestyle_snapshot_id": "codeplane-snapshot-f47ac10b-1711234567890",
  "created_at": "2026-03-22T14:30:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Response Fields**:

| Field | Type | Always Present | Description |
|-------|------|---------------|-------------|
| `id` | string (UUID) | Yes | Unique snapshot identifier |
| `repository_id` | number | Yes | Repository the snapshot belongs to |
| `user_id` | number | Yes | User who created the snapshot |
| `name` | string | Yes | Human-readable snapshot name (may be auto-generated) |
| `workspace_id` | string (UUID) | No | Source workspace the snapshot was captured from |
| `freestyle_snapshot_id` | string | Yes | Internal container image reference |
| `created_at` | string (ISO-8601) | Yes | Creation timestamp |
| `updated_at` | string (ISO-8601) | Yes | Last update timestamp |

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Missing or non-UUID snapshot ID | `{ "message": "workspace snapshot id is required" }` |
| 401 | Not authenticated | `{ "message": "authentication required" }` |
| 403 | User lacks repository access | `{ "message": "forbidden" }` |
| 404 | Repository not found | `{ "message": "repository not found" }` |
| 404 | Snapshot not found or not owned by user | `{ "message": "workspace snapshot not found" }` |
| 500 | Unhandled service error | `{ "message": "internal server error" }` |

**Related Endpoints Used by the View**:

| Endpoint | Method | Purpose |
|----------|--------|--------|
| `/api/repos/:owner/:repo/workspace-snapshots/:id` | DELETE | Delete this snapshot |
| `/api/repos/:owner/:repo/workspaces` | POST | Create workspace from this snapshot |
| `/api/repos/:owner/:repo/workspaces/:workspace_id` | GET | Fetch source workspace details (provenance) |

### SDK Shape

**Service method**: `WorkspaceService.getWorkspaceSnapshot(snapshotID: string, repositoryID: number, userID: number)`

**Returns**: `Promise<WorkspaceSnapshotResponse | null>`

**Behavior**:
- Queries database via `dbGetWorkspaceSnapshotForUserRepo` matching ID, repository, and user.
- Returns `null` if snapshot not found or user has no access.
- Maps database row to `WorkspaceSnapshotResponse` via `toSnapshotResponse()`.
- Pure read — no side effects.

**Response type**:

```typescript
interface WorkspaceSnapshotResponse {
  id: string;
  repository_id: number;
  user_id: number;
  name: string;
  workspace_id?: string;
  freestyle_snapshot_id: string;
  created_at: string;
  updated_at: string;
}
```

### CLI Command

**Command**: `codeplane workspace snapshot-view <snapshot-id>`

**Arguments**:

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `snapshot-id` | string (UUID) | Yes | Snapshot ID to view |

**Options**:

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo`, `-R` | string | (auto-detected from cwd) | Repository in `OWNER/REPO` format |

**Output (default)**:
```
Snapshot: after-deps-install
  ID:         b1c2d3e4-f5a6-7890-abcd-ef1234567890
  Source:     f47ac10b-58cc-4372-a567-0e02b2c3d479
  Image:      codeplane-snapshot-f47ac10b-1711234567890
  Created:    2026-03-22T14:30:00.000Z (4 hours ago)
  Updated:    2026-03-22T14:30:00.000Z (4 hours ago)
```

**Output (`--json`)**: Raw JSON `WorkspaceSnapshotResponse` object.

**Behavior**:
- Resolves repository from `--repo` flag or cwd's jj/git remote.
- Fetches snapshot detail via `GET /api/repos/:owner/:repo/workspace-snapshots/:id`.
- Exits with code 0 on success, 1 on error.
- Prints human-readable error messages for 400, 401, 403, 404.

**Example usage**:
```bash
codeplane workspace snapshot-view b1c2d3e4-f5a6-7890-abcd-ef1234567890
codeplane workspace snapshot-view b1c2d3e4-f5a6-7890-abcd-ef1234567890 --repo myorg/myrepo
codeplane workspace snapshot-view b1c2d3e4-f5a6-7890-abcd-ef1234567890 --json
```

### TUI UI

**Entry points**:
- `Enter` on a snapshot row in Tab 4 (Snapshots) of workspace detail view.
- Command palette: `:snapshot <id>`.
- Deep link: `codeplane tui --screen snapshot --repo owner/repo --snapshot <id>`.

**Screen Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Workspaces > ws-name > Snapshots   │
│ > after-deps-install                              ● conn    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Name         after-deps-install                            │
│  ID           b1c2d3e4-f5a6-7890-abcd-ef1234567890          │
│  Source WS    f47ac10b-58cc-4372-a567-0e02b2c3d479          │
│  Image Ref    codeplane-snapshot-f47ac10b-1711234567890     │
│  Created      2026-03-22 14:30 UTC (4 hours ago)            │
│  Updated      2026-03-22 14:30 UTC (4 hours ago)            │
│                                                             │
│  ──────────────────────────────────────────────────────      │
│                                                             │
│  [ Use for New Workspace ]    [ Delete Snapshot ]           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ w:create workspace │ D:delete │ q:back │ y:copy ID │ ?:help │
└─────────────────────────────────────────────────────────────┘
```

**Key bindings**:

| Key | Action |
|-----|--------|
| `w` | Create workspace from this snapshot (navigates to workspace create with snapshot pre-selected) |
| `D` | Delete snapshot (confirmation required) |
| `y` | Copy snapshot ID to clipboard |
| `Y` | Copy freestyle_snapshot_id (image ref) to clipboard |
| `o` | Open source workspace detail (if workspace still exists) |
| `q` / `Esc` | Back to previous screen |
| `?` | Help overlay |
| `:` | Command palette |
| `R` | Retry failed fetch |

**Delete confirmation modal**:
```
Delete snapshot "after-deps-install"?
This action cannot be undone. Workspaces created
from this snapshot will not be affected, but no
new workspaces can be created from it.

[y] Delete    [n] Cancel
```

**States**: Loading (spinner), Loaded (full detail), Not Found, Error (with retry), Deleting (spinner, actions disabled), Deleted (confirmation, auto-navigate back).

**Responsive breakpoints**:

| Breakpoint | Adaptation |
|------------|------------|
| 80×24 (minimum) | Abbreviated labels, truncated UUIDs (12 chars), stacked action buttons |
| 120×40 (standard) | Full labels, full UUIDs, inline action buttons |
| 200×60+ (large) | Extra padding, full timestamps with timezone, action descriptions |

### Web UI Design

**Route**: `/:owner/:repo/workspace-snapshots/:id`

Alternatively rendered as a detail panel/modal when clicking a snapshot row in the workspace detail Snapshots tab.

**Layout**: Repository workbench with snapshot detail as main content area.

**Header section**:
- Snapshot name (large, bold)
- Snapshot ID as subtle subtitle (monospace, copyable on click)
- Breadcrumb: `repo-owner / repo-name / Workspaces / workspace-name / Snapshots / snapshot-name`

**Detail card**:

| Label | Value | Display |
|-------|-------|--------|
| Name | `after-deps-install` | Plain text |
| Snapshot ID | `b1c2d3e4-...` | Monospace, copy button |
| Source Workspace | `f47ac10b-...` | Link to workspace detail if exists; grayed with "(deleted)" if workspace gone |
| Image Reference | `codeplane-snapshot-...` | Monospace, copy button |
| Created | `March 22, 2026 at 2:30 PM (4 hours ago)` | Relative + absolute on hover |
| Updated | `March 22, 2026 at 2:30 PM (4 hours ago)` | Relative + absolute on hover |

**Action bar**:
- "Create Workspace from Snapshot" (primary button): Navigates to workspace creation form with snapshot pre-selected.
- "Delete Snapshot" (danger button): Opens confirmation dialog.

**Confirmation dialog (delete)**:
- Title: "Delete snapshot?"
- Body: `Are you sure you want to delete "after-deps-install"? This action cannot be undone.`
- Actions: "Cancel" (secondary), "Delete" (danger with loading spinner during request).

**UI States**: Loading (skeleton), Loaded (full card), Not Found (illustration + message + back link), Error (banner + retry), Deleting (dimmed card, spinner on delete button), Deleted (toast + navigate back).

**Source workspace link behavior**: Hover tooltip previews workspace name/status (lazy fetch). If workspace deleted (404), link replaced with plain text ID + "(deleted)" label.

### Documentation

1. **"Viewing Workspace Snapshot Details" guide** — What each field means, how to interpret provenance (source workspace, image reference).
2. **CLI Reference: `workspace snapshot-view`** — Command syntax, arguments, flags, examples, output formats, error reference.
3. **API Reference: `GET /api/repos/:owner/:repo/workspace-snapshots/:id`** — Path parameters, response schema, auth requirements, error codes.
4. **"Workspace Snapshots" guide update** — Add section on viewing individual snapshots, cross-reference from create and list docs. Include guidance on deletion impact (existing forked workspaces are unaffected).

## Permissions & Security

### Authorization

| Role | Can View Snapshot? | Can Delete Snapshot? | Can Create Workspace from Snapshot? |
|------|-------------------|---------------------|------------------------------------||
| Workspace/Snapshot Owner | Yes | Yes | Yes |
| Repository Admin | No (current implementation) | No (current implementation) | No (current implementation) |
| Repository Member | No | No | No |
| Read-Only | No | No | No |
| Anonymous | No (HTTP 401) | No (HTTP 401) | No (HTTP 401) |

The current access model is strictly user-scoped: the authenticated user's `user_id` must match the snapshot's `user_id` AND the snapshot must belong to the specified `repository_id`. This is enforced at the service layer via `dbGetWorkspaceSnapshotForUserRepo`. Non-owners receive HTTP 404 (not 403) to prevent snapshot existence leakage.

### Rate Limiting

- **Per-user rate limit**: Maximum 120 requests per minute per authenticated user for the snapshot detail endpoint.
- **Burst allowance**: Up to 10 requests in a 1-second window.
- **Delete action rate limit**: Maximum 10 deletion requests per minute per authenticated user (shared with other snapshot write operations).
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) included in responses.
- HTTP 429 returned when rate limit is exceeded, with `Retry-After` header.

### Data Privacy

- Snapshot responses include `user_id` and `repository_id` as internal numeric identifiers. These are acceptable since the endpoint is authenticated and user-scoped.
- `freestyle_snapshot_id` is an opaque container image reference. It does not expose sensitive infrastructure topology but should be treated as an internal implementation detail in documentation.
- Snapshot names are user-provided and could contain project-specific information. They are not exposed to users other than the snapshot owner.
- The `workspace_id` reference links to a workspace that may contain sensitive development state. The snapshot view only displays the ID, not the workspace's contents or SSH credentials.
- No PII beyond user IDs and snapshot names is exposed in the snapshot detail response.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkspaceSnapshotViewed` | User fetches snapshot detail | `snapshot_id`, `workspace_id`, `repository_id`, `user_id`, `snapshot_name`, `snapshot_age_seconds` (time since creation), `client` (`api`, `cli`, `web`, `tui`), `entry_point` (`workspace_detail_tab`, `direct_url`, `cli_command`, `command_palette`) |
| `WorkspaceSnapshotViewFailed` | Snapshot detail fetch failed | `snapshot_id`, `repository_id`, `user_id`, `error_type` (`not_found`, `forbidden`, `auth_required`, `internal`), `client` |
| `WorkspaceSnapshotDeleteInitiated` | User clicks/triggers delete action | `snapshot_id`, `repository_id`, `user_id`, `client`, `snapshot_age_seconds` |
| `WorkspaceSnapshotDeleteConfirmed` | User confirms deletion | `snapshot_id`, `repository_id`, `user_id`, `client`, `snapshot_age_seconds` |
| `WorkspaceSnapshotDeleteCancelled` | User cancels deletion | `snapshot_id`, `repository_id`, `user_id`, `client` |
| `WorkspaceSnapshotDeleteCompleted` | Snapshot successfully deleted from view | `snapshot_id`, `repository_id`, `user_id`, `client`, `snapshot_age_seconds`, `duration_ms` |
| `WorkspaceSnapshotDeleteFailed` | Snapshot deletion failed | `snapshot_id`, `repository_id`, `user_id`, `error_type`, `client` |
| `WorkspaceSnapshotCreateWorkspaceClicked` | User clicks "Create Workspace from Snapshot" | `snapshot_id`, `repository_id`, `user_id`, `client`, `snapshot_age_seconds` |
| `WorkspaceSnapshotIDCopied` | User copies snapshot ID or image ref | `snapshot_id`, `user_id`, `client`, `copied_field` (`snapshot_id`, `freestyle_snapshot_id`) |
| `WorkspaceSnapshotSourceWorkspaceClicked` | User navigates to source workspace | `snapshot_id`, `workspace_id`, `user_id`, `client`, `workspace_exists` (boolean) |

### Funnel Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **View → Create Workspace conversion** | Percentage of snapshot detail views that result in clicking "Create Workspace from Snapshot" | > 20% indicates snapshots are serving their reuse purpose |
| **View → Delete conversion** | Percentage of snapshot detail views that result in snapshot deletion | < 30% — high deletion rates may indicate low snapshot quality or clutter |
| **Delete confirmation rate** | `WorkspaceSnapshotDeleteConfirmed / WorkspaceSnapshotDeleteInitiated` | > 80% — users who start a delete should mostly follow through |
| **Snapshot detail load time (p50, p95)** | Time from request to rendered view | p50 < 200ms, p95 < 500ms |
| **View error rate** | `WorkspaceSnapshotViewFailed / (WorkspaceSnapshotViewed + WorkspaceSnapshotViewFailed)` | < 2% |
| **Source workspace click-through rate** | Percentage of views where user clicks source workspace link | Informational — indicates interest in provenance |
| **Snapshot age at view time** | Distribution of `snapshot_age_seconds` at view time | Informational — indicates whether users view recent or old snapshots |

## Observability

### Logging

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| `workspace_snapshot.view.start` | `info` | `request_id`, `snapshot_id`, `repository_id`, `user_id`, `client_ip` | Request received |
| `workspace_snapshot.view.success` | `info` | `request_id`, `snapshot_id`, `repository_id`, `user_id`, `snapshot_name`, `duration_ms` | Snapshot found and returned |
| `workspace_snapshot.view.not_found` | `warn` | `request_id`, `snapshot_id`, `repository_id`, `user_id` | Snapshot not found (404) |
| `workspace_snapshot.view.auth_failure` | `warn` | `request_id`, `snapshot_id`, `client_ip`, `reason` | Authentication or authorization failure |
| `workspace_snapshot.view.error` | `error` | `request_id`, `snapshot_id`, `repository_id`, `user_id`, `error_message`, `stack_trace` | Internal server error (500) |
| `workspace_snapshot.view.validation_error` | `warn` | `request_id`, `field`, `value`, `rule`, `user_id` | Invalid snapshot ID format |
| `workspace_snapshot.delete.start` | `info` | `request_id`, `snapshot_id`, `repository_id`, `user_id` | Delete request received |
| `workspace_snapshot.delete.success` | `info` | `request_id`, `snapshot_id`, `repository_id`, `user_id`, `snapshot_name`, `duration_ms` | Snapshot deleted |
| `workspace_snapshot.delete.not_found` | `warn` | `request_id`, `snapshot_id`, `repository_id`, `user_id` | Snapshot not found for deletion |
| `workspace_snapshot.delete.error` | `error` | `request_id`, `snapshot_id`, `repository_id`, `user_id`, `error_message`, `stack_trace` | Delete failed |
| `workspace_snapshot.db_query.slow` | `error` | `request_id`, `snapshot_id`, `query`, `duration_ms`, `repository_id` | Database query exceeds 5s |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workspace_snapshot_view_requests_total` | Counter | `status_code` (`200`, `400`, `401`, `403`, `404`, `500`), `client` | Total snapshot detail requests |
| `codeplane_workspace_snapshot_view_duration_seconds` | Histogram | `status_code`, `client` | End-to-end request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_workspace_snapshot_view_errors_total` | Counter | `error_type` (`not_found`, `auth`, `validation`, `internal`) | Total errors by category |
| `codeplane_workspace_snapshot_delete_from_view_total` | Counter | `status` (`success`, `error`), `error_type` | Deletions triggered from the snapshot view |
| `codeplane_workspace_snapshot_delete_from_view_duration_seconds` | Histogram | `status` | Deletion request duration |

### Alerts

#### Alert: High Snapshot View Error Rate

- **Condition**: `rate(codeplane_workspace_snapshot_view_errors_total{error_type="internal"}[5m]) > 0.05` for 5 minutes
- **Severity**: Critical
- **Runbook**:
  1. Check `codeplane_workspace_snapshot_view_errors_total` by `error_type` to identify the dominant failure mode.
  2. If `internal`: check database connectivity and health. Verify PostgreSQL is accepting connections. Check `pg_stat_activity` for long-running queries or lock contention on the `workspace_snapshots` table.
  3. Check application logs filtered by `level=error` and `event=workspace_snapshot.view.error` for specific error messages and stack traces.
  4. If errors correlate with recent deployments, check for schema drift or `toSnapshotResponse` mapping failures.
  5. Verify the service registry is initialized and `workspace` service is available.
  6. Escalate to platform team if not resolved within 15 minutes.

#### Alert: Snapshot View Latency Spike

- **Condition**: `histogram_quantile(0.95, rate(codeplane_workspace_snapshot_view_duration_seconds_bucket[5m])) > 1.0` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check Grafana dashboard for P95 latency trend over the last hour.
  2. Run `EXPLAIN ANALYZE` on the snapshot get query (`getWorkspaceSnapshotForUserRepo`) with affected parameters.
  3. Verify the relevant composite index on `(id, repository_id, user_id)` exists and is being used.
  4. Check database connection pool utilization. If saturated, investigate which queries are holding connections.
  5. Check disk I/O metrics on the database host.
  6. If the issue is isolated to specific repositories with many snapshots, investigate table bloat.
  7. Escalate if latency doesn't recover after 15 minutes.

#### Alert: Elevated Snapshot Not-Found Rate

- **Condition**: `rate(codeplane_workspace_snapshot_view_errors_total{error_type="not_found"}[5m]) / rate(codeplane_workspace_snapshot_view_requests_total[5m]) > 0.50` for 10 minutes
- **Severity**: Warning
- **Runbook**:
  1. A high not-found rate may indicate stale links in the UI pointing to deleted snapshots.
  2. Check recent `workspace_snapshot.delete.success` log events to determine if a bulk deletion occurred.
  3. Verify that the workspace detail view's snapshot tab correctly removes deleted snapshots on refresh.
  4. Check for a client-side caching bug that may be serving stale snapshot lists.
  5. If caused by a specific user or automation, review their access patterns for potential abuse.
  6. No immediate action required unless correlated with other errors — this may be a normal consequence of snapshot cleanup.

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|--------------|-----------|--------|------------|
| Database connection lost | `workspace_snapshot.view.error` with connection error | All snapshot view requests fail | Standard DB failover/retry. Check connection pool. Alert fires on error rate. |
| Database query timeout | `workspace_snapshot.db_query.slow` logs | Individual requests time out | Check for table lock contention, missing indexes. Run `EXPLAIN ANALYZE`. |
| Snapshot table corruption | Unexpected null fields in response | Malformed responses, client crashes | Schema validation at service layer catches nulls. Check recent migrations. |
| Stale client-side cache | Users see deleted snapshots in lists, get 404 on view | Poor UX, confusion | Ensure list refreshes invalidate cache. Add cache-busting on navigation. |
| Service registry not initialized | Null pointer on `getServices().workspace` | 500 on all snapshot requests | Indicates server boot failure. Check startup logs. Restart server. |
| Route parameter injection | Malicious or malformed path params | 400 error or unexpected behavior | `routeParam` helper validates presence. UUID format check prevents injection. |

## Verification

### API Integration Tests

1. **Happy path: Get snapshot by valid ID** — `GET /api/repos/:owner/:repo/workspace-snapshots/:id` with a valid, existing snapshot ID. Assert HTTP 200, response contains `id` matching request, `name` is non-empty string, `repository_id` and `user_id` are numbers, `freestyle_snapshot_id` is non-empty string, `created_at` and `updated_at` are valid ISO-8601 strings.

2. **Happy path: Response matches creation response** — Create a snapshot, capture response. Immediately `GET` by ID. Assert view response is field-for-field identical to creation response.

3. **Happy path: Snapshot with auto-generated name** — Create snapshot without name, `GET` by ID. Assert `name` matches pattern `snapshot-\d+`.

4. **Happy path: Snapshot with user-provided name** — Create snapshot with name `my-baseline`, `GET` by ID. Assert `name` equals `"my-baseline"`.

5. **Happy path: Snapshot with maximum valid name (63 chars)** — Create snapshot with 63-char valid name, `GET` by ID. Assert `name` is the full 63-character string, not truncated.

6. **Happy path: Snapshot with minimum valid name (1 char)** — Create snapshot with name `a`, `GET` by ID. Assert `name` equals `"a"`.

7. **Response includes workspace_id** — Create snapshot from workspace, `GET` the snapshot. Assert `workspace_id` is present and matches source workspace UUID.

8. **Response includes freestyle_snapshot_id** — Assert `freestyle_snapshot_id` matches expected pattern `codeplane-snapshot-*`.

9. **Response timestamps are valid ISO-8601** — Assert both `created_at` and `updated_at` parse as valid Date objects.

10. **Response contains all required fields** — Assert response has `id`, `repository_id`, `user_id`, `name`, `freestyle_snapshot_id`, `created_at`, `updated_at`. Assert `workspace_id` is present when source workspace existed.

11. **Cross-endpoint consistency: view matches list entry** — Create snapshot, list all snapshots, find matching entry, GET by ID. Assert list entry and view response are field-for-field identical.

12. **Error: Snapshot not found (non-existent UUID)** — `GET` with valid UUID that does not exist. Assert HTTP 404, body contains `"workspace snapshot not found"`.

13. **Error: Snapshot belongs to different user** — Create snapshot as user A, `GET` as user B. Assert HTTP 404 with `"workspace snapshot not found"` (not 403).

14. **Error: Snapshot belongs to different repository** — Create snapshot in repo A, `GET` using repo B's path. Assert HTTP 404.

15. **Error: Empty snapshot ID** — `GET /api/repos/:owner/:repo/workspace-snapshots/` (trailing slash, no ID). Assert HTTP 400 or 404.

16. **Error: Non-UUID snapshot ID** — `GET` with `id = "not-a-uuid"`. Assert HTTP 400 with `"workspace snapshot id is required"`.

17. **Error: Snapshot ID with special characters** — `GET` with `id = "'; DROP TABLE workspace_snapshots;--"`. Assert HTTP 400.

18. **Error: Unauthenticated request** — `GET` without auth. Assert HTTP 401.

19. **Error: Non-existent repository** — `GET` with invalid `:owner/:repo`. Assert HTTP 404 with `"repository not found"`.

20. **Error: Repository exists but user has no access** — `GET` for private repo user cannot access. Assert HTTP 403 or 404.

21. **Snapshot survives source workspace deletion** — Create workspace, create snapshot, delete workspace, `GET` snapshot. Assert HTTP 200 with data intact, `workspace_id` still references deleted workspace UUID.

22. **Multiple snapshots from same workspace independently viewable** — Create two snapshots from same workspace, `GET` each by ID. Assert both return HTTP 200 with different `id` values.

23. **Snapshot with same name as another returns correct snapshot** — Create two snapshots named `baseline`, `GET` each by distinct ID. Assert each returns correct snapshot.

24. **Response Content-Type is application/json on 200** — Assert `Content-Type` header.

25. **Response Content-Type is application/json on 404** — Assert `Content-Type` header.

26. **Snapshot deleted then viewed returns 404** — Create snapshot, delete it, `GET` by ID. Assert HTTP 404.

27. **Concurrent reads do not interfere** — Send 10 simultaneous `GET` requests for same snapshot. Assert all return HTTP 200 with identical bodies.

### CLI Integration Tests

28. **CLI: View snapshot with valid ID** — `codeplane workspace snapshot-view <id> --repo owner/repo`. Assert exit code 0, output includes name, ID, source workspace, image reference, timestamps.

29. **CLI: View snapshot with JSON output** — `codeplane workspace snapshot-view <id> --json`. Assert exit code 0, valid JSON matching `WorkspaceSnapshotResponse` schema.

30. **CLI: View non-existent snapshot** — `codeplane workspace snapshot-view <non-existent-uuid>`. Assert exit code 1, stderr contains error.

31. **CLI: View snapshot with invalid UUID** — `codeplane workspace snapshot-view not-a-uuid`. Assert exit code 1, stderr contains error.

32. **CLI: View snapshot auto-detects repo** — From cloned repo directory, `codeplane workspace snapshot-view <id>`. Assert exit code 0.

33. **CLI: View snapshot with invalid repo** — `codeplane workspace snapshot-view <id> --repo nonexistent/repo`. Assert exit code 1.

34. **CLI: JSON output contains all fields** — Parse JSON, assert `id`, `repository_id`, `user_id`, `name`, `freestyle_snapshot_id`, `created_at`, `updated_at` present.

35. **CLI: Human output displays relative timestamps** — Assert output contains relative time like "4 hours ago".

### Playwright E2E Tests (Web UI)

36. **Web: Navigate to snapshot detail from workspace snapshots tab** — Navigate to workspace detail → Snapshots tab → click snapshot row. Assert detail view loads with correct metadata.

37. **Web: Snapshot detail displays all metadata fields** — Assert Name, Snapshot ID (copyable), Source Workspace (link), Image Reference (copyable), Created, Updated present.

38. **Web: Source workspace link is clickable** — Click source workspace link. Assert navigation to workspace detail.

39. **Web: Source workspace link shows "(deleted)" when workspace gone** — Delete source workspace, navigate to snapshot detail. Assert source workspace shows "(deleted)".

40. **Web: Copy snapshot ID button** — Click copy button. Assert clipboard contains full UUID.

41. **Web: Copy image reference button** — Click copy button. Assert clipboard contains freestyle_snapshot_id.

42. **Web: "Create Workspace from Snapshot" navigates to create form** — Click button. Assert workspace creation form opens with snapshot pre-selected.

43. **Web: Delete button opens confirmation dialog** — Click "Delete Snapshot". Assert confirmation dialog with snapshot name.

44. **Web: Confirm delete removes snapshot and navigates back** — Click delete, confirm. Assert toast + navigation back.

45. **Web: Cancel delete closes dialog** — Click delete, click Cancel. Assert dialog closes, snapshot visible.

46. **Web: Delete shows loading state** — Click delete, confirm. Assert spinner on delete button.

47. **Web: 404 shows not-found state** — Navigate to non-existent snapshot URL. Assert "Snapshot not found" illustration.

48. **Web: Loading state shows skeleton** — Navigate to snapshot detail. Assert skeleton layout before data loads.

49. **Web: Breadcrumb navigation works** — Assert correct breadcrumb path, click segments to navigate.

50. **Web: Direct URL access works** — Navigate to `/:owner/:repo/workspace-snapshots/:id` directly. Assert detail view loads.

### TUI E2E Tests

51. **TUI: Navigate to snapshot detail from workspace Tab 4** — Workspace detail → Tab 4 → select snapshot → Enter. Assert detail screen renders.

52. **TUI: Displays all fields** — Assert Name, ID, Source WS, Image Ref, Created, Updated.

53. **TUI: 'y' copies snapshot ID** — Press `y`. Assert clipboard contains UUID.

54. **TUI: 'Y' copies freestyle_snapshot_id** — Press `Y`. Assert clipboard contains image ref.

55. **TUI: 'w' navigates to workspace create with snapshot** — Press `w`. Assert create form with snapshot pre-selected.

56. **TUI: 'D' opens delete confirmation** — Press `D`. Assert confirmation prompt.

57. **TUI: Confirm delete ('y') deletes and navigates back** — Press `D`, then `y`. Assert deletion + navigation.

58. **TUI: Cancel delete ('n') returns to detail** — Press `D`, then `n`. Assert back on detail.

59. **TUI: 'q' navigates back** — Press `q`. Assert navigation to previous screen.

60. **TUI: Error state on fetch failure** — Mock 500. Assert error message with `R` to retry.

61. **TUI: Not-found state for invalid ID** — Non-existent ID. Assert "Snapshot not found".

62. **TUI: 'R' retries failed fetch** — Error state → press `R`. Assert re-fetch.

63. **TUI: Responsive 80×24** — Assert abbreviated labels, truncated UUIDs.

64. **TUI: Responsive 120×40** — Assert full labels, full UUIDs.

65. **TUI: 'o' opens source workspace detail** — Press `o`. Assert navigation to workspace detail.

66. **TUI: 'o' when source workspace deleted** — Press `o`. Assert "Source workspace not found".

### Cross-Cutting Tests

67. **Rate limiting: Exceed per-user rate limit** — Send 121+ GET requests in one minute. Assert HTTP 429 with `Retry-After`.

68. **Concurrent view and delete** — View in one client, delete in another. Assert viewer gets 404 on subsequent refresh.

69. **Cross-client consistency** — Create via CLI, view via API. Assert identical data.

70. **Error responses have correct Content-Type and body shape** — Verify 400, 401, 403, 404, 500 all return `application/json` with `{ "message": "..." }`.
