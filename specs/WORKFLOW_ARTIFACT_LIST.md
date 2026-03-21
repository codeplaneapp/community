# WORKFLOW_ARTIFACT_LIST

Specification for WORKFLOW_ARTIFACT_LIST.

## High-Level User POV

When a workflow run completes in Codeplane, it often produces build outputs — compiled binaries, test coverage reports, bundled assets, benchmark results, or container images. Today, discovering and accessing these outputs requires leaving Codeplane and digging through external storage or CI logs. The Workflow Artifact List feature makes these outputs visible and accessible directly within Codeplane, across every client surface.

From any workflow run, users can view a complete list of all artifacts that run has produced. Each artifact is displayed with its name, file type, size, current status (whether the upload is still in progress, fully ready for download, or has expired), and how long until it expires. Artifacts that have been attached to a release are clearly marked so users can distinguish between ephemeral build outputs and artifacts that have been promoted to release assets.

The artifact list is available in the web UI as a tab on the workflow run detail page, in the CLI as a dedicated `artifact list` command, and in the TUI as a full-screen artifacts view. In all surfaces, users with appropriate permissions can browse artifacts and initiate downloads or deletions. The list is sorted newest-first by default, and users can search, filter by status, and re-sort to find what they need quickly. The experience is designed for runs that produce anywhere from zero to a couple hundred artifacts — the common case for build, test, and deploy workflows.

This feature is the foundation for the broader artifact lifecycle in Codeplane: artifacts listed here can be downloaded, deleted, attached to releases, or used to trigger downstream workflows. Without the list, none of those downstream capabilities are discoverable.

## Acceptance Criteria

### Definition of Done
- [ ] The `GET /api/repos/:owner/:repo/actions/runs/:id/artifacts` endpoint returns all artifacts for a given workflow run, ordered by `created_at` descending then `id` descending
- [ ] The response payload is `{ artifacts: WorkflowArtifactRecord[] }` where each record includes: `id`, `repository_id`, `workflow_run_id`, `name`, `size`, `content_type`, `status`, `expires_at`, `created_at`, `updated_at`, and optional release attachment fields
- [ ] The CLI `codeplane artifact list <runId>` command displays the artifact list in both table and JSON output formats
- [ ] The web UI workflow run detail page shows an "Artifacts" tab with a populated artifact list (replacing the current empty-state stub)
- [ ] The TUI workflow artifacts view renders the full artifact list with keyboard navigation
- [ ] All clients display artifact status visually: ready, pending (upload in progress), and expired
- [ ] Artifacts attached to a release are visually distinguished from unattached artifacts
- [ ] Empty state is shown when a run has no artifacts, with a clear message explaining what artifacts are and how they are produced
- [ ] The endpoint validates the run ID parameter and returns 400 for non-numeric or non-positive values
- [ ] The endpoint verifies the run belongs to the specified repository (owner/repo) and returns 404 if it does not
- [ ] The endpoint respects repository visibility: public repos allow read access for any authenticated user; private repos require at least read permission
- [ ] The `gcs_key` field is never exposed in the API response

### Artifact Record Constraints
- `name`: 1–255 characters. Allowed characters: alphanumeric, hyphens, underscores, dots, forward slashes. No null bytes, no leading/trailing whitespace. Case-sensitive. Unique per run (unique constraint on `workflow_run_id` + `name`)
- `size`: non-negative integer representing bytes. Display must handle 0 bytes through multi-terabyte values
- `content_type`: valid MIME type string, 1–255 characters
- `status`: one of exactly three values: `pending`, `ready`, `expired`
- `expires_at`: ISO 8601 timestamp or null (no expiration)
- `created_at`, `updated_at`: ISO 8601 timestamps, always present
- `confirmed_at`: ISO 8601 timestamp or null (null when status is `pending`)
- `release_tag`, `release_asset_name`: string or null
- `release_attached_at`: ISO 8601 timestamp or null

### Edge Cases
- Run with zero artifacts: returns `{ artifacts: [] }` with 200 status
- Run ID does not exist: returns 404 `{ "message": "run not found" }`
- Run ID belongs to a different repository than the URL path: returns 404
- Run ID is not a valid positive integer: returns 400 `{ "message": "invalid run id" }`
- Artifact names containing URL-encoded characters (spaces, unicode): returned as-is in the JSON response
- Artifacts with null optional fields (`confirmed_at`, `release_tag`, etc.): rendered as null in JSON, displayed as "—" in UI
- Artifacts where `expires_at` is in the past but not yet pruned: still returned in the list
- A run with 200+ artifacts: all artifacts returned (no server-side pagination); TUI client caps at 200 with footer message
- Concurrent artifact creation during list fetch: eventual consistency
- Extremely large artifact size (TB+): rendered as human-readable ("1.2 TB")
- Artifact name with path separators (e.g., "dist/bundle.js"): rendered as-is, no path splitting
- Artifact size of exactly 0 bytes: rendered as "0 B"

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/actions/runs/:id/artifacts`

**Path parameters:**
- `owner` (string): repository owner username or organization name
- `repo` (string): repository name
- `id` (positive integer): workflow run ID

**Response (200):**
```json
{
  "artifacts": [
    {
      "id": 42,
      "repository_id": 7,
      "workflow_run_id": 123,
      "name": "coverage-report",
      "size": 2145832,
      "content_type": "text/html",
      "status": "ready",
      "confirmed_at": "2026-03-18T14:23:12Z",
      "expires_at": "2026-04-17T14:23:05Z",
      "release_tag": "v1.2.3",
      "release_asset_name": "coverage-report.html",
      "release_attached_at": "2026-03-19T09:00:00Z",
      "created_at": "2026-03-18T14:23:05Z",
      "updated_at": "2026-03-19T09:00:00Z"
    }
  ]
}
```

**Error responses:**
- `400`: `{ "message": "invalid run id" }` — non-numeric or non-positive run ID
- `401`: `{ "message": "authentication required" }` — no valid session/token
- `403`: `{ "message": "access denied" }` — insufficient repository permissions
- `404`: `{ "message": "run not found" }` — run does not exist or does not belong to this repository

### SDK Shape

The database layer is implemented in `packages/sdk/src/db/workflow_artifacts_sql.ts`. The list endpoint uses `listWorkflowArtifactsByRun({ workflowRunId })` which queries by `workflow_run_id` and returns rows ordered by `created_at DESC, id DESC`. The route handler must:
1. Parse and validate the run ID path parameter
2. Resolve the repository from owner/repo path parameters
3. Check read access to the repository
4. Verify the run belongs to the resolved repository
5. Call `listWorkflowArtifactsByRun({ workflowRunId })` to fetch artifacts
6. Map database rows to the API response shape (strip `gcs_key`, convert dates to ISO strings)
7. Return `{ artifacts: [...] }`

### CLI Command

**Command:** `codeplane artifact list <runId>`

**Arguments:**
- `runId` (number, required): the workflow run ID

**Options:**
- `--repo <OWNER/REPO>` (string, optional): target repository. Defaults to repo inferred from working directory.

**Table output (default):**
```
NAME              STATUS  SIZE      CONTENT TYPE       EXPIRES  RELEASE  CREATED
coverage-report   ready   2.1 MB    text/html          29d      v1.2.3   3h ago
dist-bundle       ready   8.9 MB    application/zip    29d      v1.2.3   3h ago
test-logs         pending 1.2 MB    text/plain         —                 3h ago
old-snapshot      expired 156 KB    image/png          expired           2w ago
benchmark-data    ready   45 KB     application/json   14d               3h ago
```

**JSON output (`--json`):** Raw API response. Supports field filtering e.g. `--json .artifacts[].name`.

### Web UI Design

The workflow run detail page already has a tab bar with a stubbed "Artifacts" tab. Replace the stub with:

1. **Header row**: "Artifacts (N)" with total combined size (e.g., "12.4 MB total")
2. **Filter toolbar**: Status dropdown (All/Ready/Pending/Expired), search input for name filtering, sort controls
3. **Table columns**: Status dot (green ready / yellow pending / gray expired), Name, Content Type, Size (human-readable), Expires (relative countdown or "expired" in red), Release (tag badge if attached), Created (relative timestamp)
4. **Row actions**: Download button, Delete button (write-access only)
5. **Detail drawer**: Click artifact name → side drawer with full metadata (name, content type, exact size in bytes and human-readable, status, created/confirmed/expires timestamps, release attachment details)
6. **Empty state**: "No artifacts for this run. Artifacts are produced by workflow steps using the artifacts API."
7. **Loading state**: Skeleton shimmer table rows
8. **Error state**: Error message with retry button

Sorting by column header click (toggle asc/desc). Default: Created descending.

### TUI UI

Full-screen view reached by pressing `a` on workflow run detail. Layout:
- Title row: "Artifacts (N)" + total size
- Filter toolbar: search input (`/`), status filter (`f`), sort indicator (`s`)
- Scrollable artifact list with vim-style navigation (`j`/`k`, `G`, `gg`, `Ctrl+D`/`Ctrl+U`)
- Status icons: `●` green ready, `◎` yellow pending, `○` gray expired
- `Enter`: artifact detail modal overlay
- `D`: download via CLI delegation
- `x`: delete with confirmation overlay
- `q`: pop screen
- Responsive at three breakpoints: 80×24 (icon+name+size+exp), 120×40 (+ content type, release, timestamp), 200×60+ (all columns, wider)
- Client-side memory cap: 200 artifacts with footer message if exceeded

### Documentation

1. **Workflow Artifacts Overview** — What artifacts are, lifecycle (pending → ready → expired), relationship to releases
2. **Viewing Artifacts (Web)** — Navigate to Artifacts tab, column meanings, filter/sort usage
3. **Viewing Artifacts (CLI)** — `codeplane artifact list` command reference with examples
4. **Viewing Artifacts (TUI)** — Navigation to artifacts view, keybinding reference
5. **Artifact Expiration** — How expiration works, cleanup timing, release-attached artifact behavior

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Member (Write) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| List artifacts (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| List artifacts (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |
| View artifact detail metadata | Same as list | ✅ | ✅ | ✅ | ✅ |

- Anonymous users can list artifacts on public repositories but cannot initiate downloads (download is governed by `WORKFLOW_ARTIFACT_DOWNLOAD`)
- Read-only collaborators can list and view artifact metadata on private repositories
- The list endpoint does not expose `gcs_key` (internal storage path) in the API response
- The endpoint must not leak private repository existence: if a user lacks access, return the same 404 as a non-existent repository

### Rate Limiting

- `GET /api/repos/:owner/:repo/actions/runs/:id/artifacts`: 300 requests per minute per authenticated user
- Anonymous access (public repos): 60 requests per minute per IP address
- Rate limit responses return `429 Too Many Requests` with `Retry-After` header
- No automatic retry; clients display the retry-after period and let the user retry manually

### Data Privacy Constraints

- The `gcs_key` field (cloud storage path) must never appear in the API response — it is an internal implementation detail
- Artifact names may contain project-specific information but are not treated as PII
- Download URLs (served by the separate download endpoint) are time-limited signed URLs; the list endpoint does not expose download URLs
- Audit logs record who listed artifacts (user ID, repo, run ID) but must not log full response payloads
- Bearer tokens are never logged or included in error responses

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|-----------|---------|------------|
| `workflow.artifacts.listed` | Successful artifact list response (API) | `repo_id`, `repo_owner`, `repo_name`, `run_id`, `artifact_count`, `total_size_bytes`, `ready_count`, `pending_count`, `expired_count`, `client_type` (web/cli/tui/api), `response_time_ms` |
| `workflow.artifacts.listed_empty` | Artifact list returned zero artifacts | `repo_id`, `run_id`, `client_type` |
| `workflow.artifacts.view.loaded` | Web/TUI artifacts view fully rendered | `repo_id`, `run_id`, `artifact_count`, `total_size_bytes`, `load_time_ms`, `client_type`, `viewport_size` (web) or `terminal_size` (tui) |
| `workflow.artifacts.filtered` | User applied a filter or search | `repo_id`, `run_id`, `filter_type` (status/search), `filter_value`, `visible_count`, `total_count`, `client_type` |
| `workflow.artifacts.sorted` | User changed sort order | `repo_id`, `run_id`, `sort_field`, `sort_direction`, `client_type` |
| `workflow.artifacts.detail_viewed` | User viewed artifact detail (overlay/drawer) | `repo_id`, `run_id`, `artifact_id`, `artifact_name`, `status`, `has_release_tag`, `client_type` |

### Common Properties (All Events)

- `user_id`, `session_id`, `timestamp`, `codeplane_version`, `client_type`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|----------|
| Artifact list load success rate | >99% | Core data path; failures indicate service issues |
| P95 list endpoint latency | <200ms | Run artifacts are a small dataset; should be fast |
| Artifact view adoption | >20% of run detail visits switch to Artifacts tab | Indicates users are discovering and using the feature |
| Filter/search usage rate | >10% of artifact views | Indicates filtering UX is useful for multi-artifact runs |
| Detail view open rate | >30% of artifact views | Indicates users need more than summary table |
| Repeated visits (same user, same run, <1hr) | <15% | High repeats suggest insufficient information upfront |
| Error rate | <2% | Low error rate indicates stable backend |
| Time to interactive (web) | <1.5s | Fast perceived load |
| Time to interactive (TUI) | <1.0s | Terminal users expect instant responses |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|-------------------|
| `debug` | Artifact list query started | `request_id`, `run_id`, `repo_id`, `user_id` |
| `info` | Artifact list returned successfully | `request_id`, `run_id`, `repo_id`, `artifact_count`, `total_size_bytes`, `response_time_ms` |
| `warn` | Artifact list for non-existent run (404) | `request_id`, `run_id`, `repo_id`, `user_id` |
| `warn` | Artifact list rate limited (429) | `request_id`, `user_id`, `ip`, `retry_after_seconds` |
| `warn` | Slow artifact list query (>500ms) | `request_id`, `run_id`, `repo_id`, `artifact_count`, `response_time_ms` |
| `error` | Database query failure | `request_id`, `run_id`, `repo_id`, `error_message`, `error_code` |
| `error` | Unexpected exception in handler | `request_id`, `run_id`, `repo_id`, `error_message`, `stack_trace` |

All logs must include the `request_id` for cross-service correlation.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_artifact_list_total` | Counter | `status` (200/400/401/403/404/429/500), `repo_id` | Total artifact list requests |
| `codeplane_workflow_artifact_list_duration_seconds` | Histogram | `status` | Request duration. Buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5 |
| `codeplane_workflow_artifact_list_count` | Histogram | — | Number of artifacts returned per call. Buckets: 0, 1, 5, 10, 25, 50, 100, 200 |
| `codeplane_workflow_artifact_list_total_size_bytes` | Histogram | — | Total bytes of artifacts per call. Buckets: 0, 1024, 102400, 1048576, 10485760, 104857600, 1073741824, 10737418240 |

### Alerts and Runbooks

**Alert: `WorkflowArtifactListErrorRateHigh`**
- **Condition**: `rate(codeplane_workflow_artifact_list_total{status="500"}[5m]) / rate(codeplane_workflow_artifact_list_total[5m]) > 0.05` for 5 minutes
- **Severity**: P2
- **Runbook**:
  1. Check server logs filtered by `workflow.artifact.list` and `level=error` for the last 15 minutes
  2. Verify database connectivity: run `SELECT 1` against the primary database
  3. Check if the `workflow_artifacts` table has excessive row counts for any single run: `SELECT workflow_run_id, COUNT(*) FROM workflow_artifacts GROUP BY 1 ORDER BY 2 DESC LIMIT 10`
  4. Check database connection pool utilization via `codeplane_db_pool_active_connections`
  5. If database is healthy, check for recent deployments that may have introduced a regression
  6. Escalate to workflows team if unresolved after 15 minutes

**Alert: `WorkflowArtifactListLatencyHigh`**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_workflow_artifact_list_duration_seconds_bucket[5m])) > 1.0` for 10 minutes
- **Severity**: P3
- **Runbook**:
  1. Check `codeplane_workflow_artifact_list_count` histogram — are a few runs returning unusually large artifact sets?
  2. Run `EXPLAIN ANALYZE` on `listWorkflowArtifactsByRun` query for a representative run ID
  3. Verify `workflow_artifacts(workflow_run_id)` index exists and is not bloated
  4. Check database CPU and I/O metrics for saturation
  5. If a single run has thousands of artifacts, investigate whether the creation path has a bug
  6. Consider adding query plan cache hints if needed

**Alert: `WorkflowArtifactList404Spike`**
- **Condition**: `rate(codeplane_workflow_artifact_list_total{status="404"}[5m]) > 50` for 5 minutes
- **Severity**: P4 (informational)
- **Runbook**:
  1. Check if a client is sending stale run IDs after runs have been deleted
  2. Review 404 logs for patterns — same user, same run, same repo
  3. If a single user/IP accounts for majority, check for misconfigured automation
  4. No action required if traffic is distributed; update baseline if needed

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|-----------|-------------|----------|----------|
| Invalid run ID (non-numeric) | 400 | Return error JSON immediately | Client-side validation |
| Run not found | 404 | Return error JSON | User navigates to valid run |
| Repository not found or no access | 404 | Same 404 (no info leak) | User checks permissions |
| Authentication missing/expired | 401 | Return error JSON | Client redirects to login |
| Database connection failure | 500 | Log error, return generic 500 | Auto-reconnect; alert fires |
| Database query timeout | 500 | Log slow query, return 500 | Check query plan, table size |
| Rate limited | 429 | Return with Retry-After header | Client waits and retries |
| Malformed owner/repo path | 400 | Return error JSON | Client-side URL construction |

## Verification

### API Integration Tests (`e2e/api/workflow-artifacts.test.ts`)

- **API-ART-LIST-001**: List artifacts for a run with multiple artifacts — verify response shape, status 200, correct count, all fields present
- **API-ART-LIST-002**: List artifacts for a run with zero artifacts — verify `{ artifacts: [] }` with status 200
- **API-ART-LIST-003**: List artifacts ordering — verify `created_at DESC, id DESC` order
- **API-ART-LIST-004**: List includes all status types (pending, ready, expired) — verify correct status values
- **API-ART-LIST-005**: List includes release attachment fields — verify `release_tag`, `release_asset_name`, `release_attached_at` (null when unattached, populated when attached)
- **API-ART-LIST-006**: Invalid run ID (string "abc") — verify 400
- **API-ART-LIST-007**: Run ID = 0 — verify 400
- **API-ART-LIST-008**: Negative run ID — verify 400
- **API-ART-LIST-009**: Non-existent run ID — verify 404
- **API-ART-LIST-010**: Run belongs to different repository — verify 404
- **API-ART-LIST-011**: Public repo as anonymous user — verify 200
- **API-ART-LIST-012**: Private repo as anonymous user — verify 404 (not 403)
- **API-ART-LIST-013**: Private repo as read-only collaborator — verify 200
- **API-ART-LIST-014**: Private repo as non-collaborator — verify 404
- **API-ART-LIST-015**: Response does not include `gcs_key` field
- **API-ART-LIST-016**: Artifact name with special characters (spaces, unicode, slashes) returned as-is
- **API-ART-LIST-017**: Artifact with size = 0 — verify size field is 0
- **API-ART-LIST-018**: Artifact with null `confirmed_at` (pending) — verify null
- **API-ART-LIST-019**: Artifact with null `expires_at` — verify null
- **API-ART-LIST-020**: Response time under 200ms for 100 artifacts
- **API-ART-LIST-021**: Run with exactly 200 artifacts — verify all 200 returned
- **API-ART-LIST-022**: Run with 201 artifacts — verify all 201 returned (no server cap)
- **API-ART-LIST-023**: Artifact with past `expires_at` but `ready` status still included
- **API-ART-LIST-024**: Rate limiting — 301st request within 1 minute returns 429 with `Retry-After`
- **API-ART-LIST-025**: `created_at` and `updated_at` are valid ISO 8601 timestamps
- **API-ART-LIST-026**: Maximum-length artifact name (255 chars) returned in full
- **API-ART-LIST-027**: Maximum-length content type (255 chars) returned in full
- **API-ART-LIST-028**: Response has `Content-Type: application/json` header

### CLI Integration Tests (`e2e/cli/artifact.test.ts`)

- **CLI-ART-LIST-001**: `codeplane artifact list <runId> --repo owner/repo` — table output with correct columns
- **CLI-ART-LIST-002**: `--json` flag — JSON matches API response shape
- **CLI-ART-LIST-003**: `--json .artifacts[].name` — field filtering returns array of names
- **CLI-ART-LIST-004**: Repo inferred from working directory — verify success
- **CLI-ART-LIST-005**: Non-numeric run ID — verify error message
- **CLI-ART-LIST-006**: Non-existent run — verify "Run not found" error
- **CLI-ART-LIST-007**: No auth — verify auth error message
- **CLI-ART-LIST-008**: Run with zero artifacts — verify empty table with message
- **CLI-ART-LIST-009**: Private repo as non-collaborator — verify permission error
- **CLI-ART-LIST-010**: Table shows human-readable sizes (B, KB, MB, GB)
- **CLI-ART-LIST-011**: Table shows relative timestamps
- **CLI-ART-LIST-012**: Table shows artifact status (ready, pending, expired)
- **CLI-ART-LIST-013**: Table shows release tag for attached artifacts

### Web UI Playwright Tests (`e2e/web/workflow-artifacts.test.ts`)

- **WEB-ART-LIST-001**: Navigate to run detail → Artifacts tab → verify table renders
- **WEB-ART-LIST-002**: Header shows "Artifacts (N)" with correct count
- **WEB-ART-LIST-003**: Header shows total combined size
- **WEB-ART-LIST-004**: Ready artifact has green status dot
- **WEB-ART-LIST-005**: Pending artifact has yellow status dot
- **WEB-ART-LIST-006**: Expired artifact has gray dot and "expired" label
- **WEB-ART-LIST-007**: Release-attached artifact shows release badge
- **WEB-ART-LIST-008**: Click name opens detail drawer
- **WEB-ART-LIST-009**: Empty run shows empty state message
- **WEB-ART-LIST-010**: Loading state shows skeleton shimmer
- **WEB-ART-LIST-011**: Error state shows error with retry button
- **WEB-ART-LIST-012**: Retry button re-fetches list
- **WEB-ART-LIST-013**: Status filter dropdown filters client-side
- **WEB-ART-LIST-014**: Search input filters by name
- **WEB-ART-LIST-015**: Column header click toggles sort
- **WEB-ART-LIST-016**: Write user sees download and delete buttons
- **WEB-ART-LIST-017**: Read-only user does not see delete button
- **WEB-ART-LIST-018**: Size column shows human-readable format
- **WEB-ART-LIST-019**: Expiration shows relative countdown
- **WEB-ART-LIST-020**: 0-byte artifact renders as "0 B"
- **WEB-ART-LIST-021**: Long name truncated with ellipsis
- **WEB-ART-LIST-022**: Tab preserves state when switching away and back

### TUI Tests (`e2e/tui/workflow-artifacts.test.ts`)

- **TUI-ART-LIST-001**: Navigate to run → `a` → artifacts view renders with list
- **TUI-ART-LIST-002**: Breadcrumb: "Dashboard > owner/repo > Workflows > name > Run #N > Artifacts"
- **TUI-ART-LIST-003**: Title "Artifacts (N)" + total size
- **TUI-ART-LIST-004**: `j`/`k` navigation between rows
- **TUI-ART-LIST-005**: `Enter` opens detail overlay
- **TUI-ART-LIST-006**: `/` search focuses input, narrows list
- **TUI-ART-LIST-007**: `f` cycles status filters
- **TUI-ART-LIST-008**: `s` cycles sort options
- **TUI-ART-LIST-009**: `q` pops screen
- **TUI-ART-LIST-010**: Empty state for zero artifacts
- **TUI-ART-LIST-011**: Status icons ●/◎/○ render correctly
- **TUI-ART-LIST-012**: 80×24 responsive layout (minimal columns)
- **TUI-ART-LIST-013**: 120×40 responsive layout (standard)
- **TUI-ART-LIST-014**: 200×60 responsive layout (all columns)
- **TUI-ART-LIST-015**: 200 artifact cap with footer message
- **TUI-ART-LIST-016**: Network error → error state with retry prompt
- **TUI-ART-LIST-017**: `R` retries and recovers
- **TUI-ART-LIST-018**: Filter + search compose correctly
- **TUI-ART-LIST-019**: Sort preserves focus by artifact ID
- **TUI-ART-LIST-020**: Resize between breakpoints preserves focus

All tests must be left failing if the backend is not yet implemented — never skipped or commented out.
