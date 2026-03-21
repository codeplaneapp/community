# WORKSPACE_SNAPSHOT_LIST

Specification for WORKSPACE_SNAPSHOT_LIST.

## High-Level User POV

When you're working with Codeplane workspaces, snapshots are your safety net and reuse mechanism. A snapshot captures the complete state of a running workspace — installed packages, file changes, configuration tweaks, running services — so you can spin up new workspaces from a known-good point instead of starting from scratch every time.

The snapshot list gives you visibility into all the snapshots you've taken for a given repository. From any repository's workspace area, you can browse your snapshots sorted by when they were created, see which workspace each snapshot came from, and understand at a glance what you have available to restore from. Whether you're in the web interface, using the CLI, or working from the TUI, listing your snapshots should feel like checking your save files — quick, scannable, and immediately actionable.

This feature is the hub of the snapshot lifecycle. From the snapshot list, you can decide which snapshot to use when creating a new workspace, inspect snapshot details, or clean up snapshots you no longer need. It supports pagination so that power users with dozens of snapshots don't suffer slow loads or overwhelming scrolling. The list is always scoped to your repository and your user — you only ever see snapshots you created, for the repository you're currently working in.

## Acceptance Criteria

### Definition of Done

- [ ] The snapshot list API endpoint returns paginated results scoped to the authenticated user and repository.
- [ ] The response includes a total count via the `X-Total-Count` header to support pagination controls in all clients.
- [ ] Snapshots are returned in reverse chronological order (most recent first).
- [ ] Every snapshot in the list includes: `id`, `repository_id`, `user_id`, `name`, `workspace_id` (if associated), `freestyle_snapshot_id`, `created_at`, and `updated_at`.
- [ ] The CLI `workspace snapshots <workspace-id>` command renders a table of snapshots for the specified workspace.
- [ ] The API supports both page/per_page and cursor/limit pagination styles.
- [ ] All clients degrade gracefully when the list is empty.

### Pagination Constraints

- [ ] Default page size is 30 if not specified.
- [ ] Maximum page size is 100; requests exceeding this return an error.
- [ ] `page` must be a positive integer (≥ 1). Non-numeric, zero, or negative values return `400` with a descriptive message.
- [ ] `per_page` must be a positive integer (≥ 1, ≤ 100). Values outside this range return `400`.
- [ ] `limit` must be a positive integer (≥ 1). Values ≤ 0 return `400`. Values > 100 are clamped to 100.
- [ ] `cursor` must be a non-negative integer. Invalid (non-numeric) cursor values are ignored gracefully, defaulting to page 1.

### Boundary & Edge Cases

- [ ] An empty snapshot list returns `200` with an empty JSON array `[]` and `X-Total-Count: 0`.
- [ ] Requesting a page number beyond available data returns `200` with an empty array (not `404`).
- [ ] Snapshot names may be empty strings (auto-generated names are system-controlled).
- [ ] Snapshot names may contain Unicode characters, spaces, and special characters.
- [ ] The `workspace_id` field is omitted (not `null`) in the response when the source workspace has been deleted.
- [ ] If the sandbox client (container runtime) is unavailable, the list endpoint still functions because it reads from the database.
- [ ] Concurrent requests from the same user must return consistent results.

### Authentication & Authorization

- [ ] Unauthenticated requests return `401`.
- [ ] Requests for a repository the user does not have at least read access to return `404`.
- [ ] A user can only list their own snapshots; they cannot see snapshots created by other users in the same repository.

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/workspace-snapshots`

**Query Parameters:**

| Parameter  | Type    | Default | Description                                    |
|-----------|---------|---------|------------------------------------------------|
| `page`     | integer | 1       | Page number (legacy pagination)                |
| `per_page` | integer | 30      | Items per page (legacy pagination, max 100)    |
| `limit`    | integer | 30      | Items per page (cursor pagination, max 100)    |
| `cursor`   | integer | 0       | Offset cursor (cursor pagination)              |

**Response:** `200 OK`

**Headers:**
- `X-Total-Count`: Total number of snapshots matching the filter.

**Body:** JSON array of snapshot objects:

```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "repository_id": 42,
    "user_id": 7,
    "name": "pre-refactor checkpoint",
    "workspace_id": "f9e8d7c6-b5a4-3210-fedc-ba0987654321",
    "freestyle_snapshot_id": "codeplane-snapshot-a1b2c3d4-1711234567",
    "created_at": "2026-03-20T14:30:00.000Z",
    "updated_at": "2026-03-20T14:30:00.000Z"
  }
]
```

**Error Responses:**

| Status | Condition                               |
|--------|-----------------------------------------|
| `400`  | Invalid pagination parameters           |
| `401`  | Not authenticated                       |
| `404`  | Repository not found or no access       |
| `500`  | Internal server error                   |

### SDK Shape

The `WorkspaceService.listWorkspaceSnapshots` method in `@codeplane/sdk`:

```typescript
listWorkspaceSnapshots(
  repositoryID: number,
  userID: number,
  page: number,
  perPage: number
): Promise<{ snapshots: WorkspaceSnapshotResponse[]; total: number }>
```

The SDK normalizes invalid pagination inputs (page < 1 becomes 1, perPage outside 1–100 becomes 30). Count and list queries execute in parallel for performance.

### CLI Command

**Command:** `codeplane workspace snapshots <workspace-id> [--repo OWNER/REPO]`

**Arguments:**
- `id` (required): The workspace ID whose snapshots to list.

**Options:**
- `--repo OWNER/REPO`: Repository reference. Defaults to the repository inferred from the current working directory.

**Output (default):** A formatted table with columns: ID, NAME, CREATED.

**Output (--json):** Raw JSON array of snapshot objects, supporting downstream `--json` field filtering.

**Empty state:** Prints `No snapshots found.` to stderr and exits with code 0.

**Note:** The current CLI `snapshots` subcommand calls `GET /api/repos/:owner/:repo/workspaces/:id/snapshots`. This should be reconciled with the top-level `GET /api/repos/:owner/:repo/workspace-snapshots` endpoint. The workspace-scoped endpoint should filter by the given workspace ID.

### TUI UI

When workspace TUI screens are built, the snapshot list should be accessible as a tab within the workspace detail view:

- **Table columns:** ID (truncated to 8 chars), Name, Created At (relative time).
- **Navigation:** Arrow keys to select, Enter to view details, `d` to delete with confirmation, `c` to create workspace from snapshot.
- **Empty state:** Centered message: "No snapshots yet. Create one from a running workspace."
- **Pagination:** Footer showing "Page X of Y" with `n`/`p` keys for next/previous.

### Documentation

1. **Workspace Snapshots Overview** — What snapshots are, how they relate to workspaces, and when to use them. Include snapshot lifecycle diagram.
2. **CLI Reference: `workspace snapshots`** — Full command reference with examples including `--repo` flag and `--json` output.
3. **API Reference: List Workspace Snapshots** — OpenAPI-style docs covering endpoint URL, parameters, response schema, error codes, and both pagination patterns.
4. **Tutorial: "Save and Reuse Workspace State"** — Step-by-step guide: create snapshot → list snapshots → create workspace from snapshot.

## Permissions & Security

### Authorization Matrix

| Role         | Can List Own Snapshots | Can List Others' Snapshots |
|-------------|----------------------|---------------------------|
| Owner        | ✅                    | ❌                         |
| Admin        | ✅                    | ❌                         |
| Member       | ✅                    | ❌                         |
| Read-Only    | ✅                    | ❌                         |
| Anonymous    | ❌                    | ❌                         |

Snapshots are always user-scoped. Even repository owners and admins cannot list another user's snapshots through this endpoint. This is a deliberate privacy boundary — snapshot contents may include ephemeral credentials, personal configuration, or work-in-progress code.

### Rate Limiting

- **Standard tier:** 60 requests per minute per user per repository.
- **Burst:** Up to 10 requests in a 1-second window before throttling.
- **Response on limit:** `429 Too Many Requests` with `Retry-After` header.

### Data Privacy

- Snapshot responses do **not** expose container image contents, only the metadata reference (`freestyle_snapshot_id`).
- The `user_id` in the response is the authenticated user's own ID — no cross-user information leakage.
- Snapshot names are user-supplied and may contain PII. Log sanitization should avoid recording full snapshot names in structured logs at levels below `DEBUG`.

## Telemetry & Product Analytics

### Business Events

| Event Name                    | Trigger                                              | Properties                                                                                                          |
|------------------------------|------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| `WorkspaceSnapshotListViewed` | User successfully retrieves a snapshot list           | `repository_id`, `user_id`, `page`, `per_page`, `result_count`, `total_count`, `client` (web/cli/tui/api)           |
| `WorkspaceSnapshotListEmpty`  | User retrieves a snapshot list and total is 0         | `repository_id`, `user_id`, `client`                                                                                |
| `WorkspaceSnapshotListPaged`  | User navigates beyond page 1                          | `repository_id`, `user_id`, `page`, `per_page`, `total_count`, `client`                                            |

### Funnel Metrics

- **Snapshot list → Snapshot detail click-through rate:** Measures whether users find what they need in the list. Target: > 30% of list views result in a detail view.
- **Snapshot list → Create workspace from snapshot:** Measures the core value loop. Target: > 10% of list views eventually lead to a workspace creation from a snapshot within the same session.
- **Empty list rate:** Percentage of list views returning zero results. If this exceeds 80%, it suggests the snapshot creation flow has discoverability problems.
- **Pagination depth:** Average page number reached. If > 1.5 on average, consider increasing the default page size or adding search/filter.

### Success Indicators

- Snapshot list p95 latency < 200ms.
- Zero `500` errors on the list endpoint over any 24-hour window.
- Positive growth in `WorkspaceSnapshotListViewed` events week-over-week during feature rollout.

## Observability

### Logging Requirements

| Log Event                         | Level  | Structured Context                                                    |
|----------------------------------|--------|-----------------------------------------------------------------------|
| Snapshot list request received    | `INFO` | `repository_id`, `user_id`, `page`, `per_page`, `request_id`         |
| Snapshot list query executed      | `DEBUG`| `repository_id`, `user_id`, `result_count`, `total_count`, `duration_ms` |
| Pagination parameter validation failure | `WARN` | `parameter_name`, `invalid_value`, `request_id`                |
| Database query failure            | `ERROR`| `repository_id`, `user_id`, `error_message`, `query_name`, `request_id` |
| Service-level unexpected error    | `ERROR`| `repository_id`, `user_id`, `error_type`, `stack_trace`, `request_id`  |

### Prometheus Metrics

| Metric Name                                          | Type      | Labels                              | Description                                    |
|-----------------------------------------------------|-----------|-------------------------------------|------------------------------------------------|
| `codeplane_workspace_snapshot_list_requests_total`   | Counter   | `repository_id`, `status_code`      | Total list endpoint requests                   |
| `codeplane_workspace_snapshot_list_duration_seconds`  | Histogram | `repository_id`                     | Request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_workspace_snapshot_list_result_count`      | Histogram | `repository_id`                     | Number of snapshots returned per request       |
| `codeplane_workspace_snapshot_count_total`            | Gauge     | `repository_id`, `user_id`          | Total snapshots per user per repo              |

### Alerts

#### Alert: `WorkspaceSnapshotListHighLatency`

**Condition:** p95 of `codeplane_workspace_snapshot_list_duration_seconds` > 1.0s over a 5-minute window.

**Severity:** Warning

**Runbook:**
1. Check the histogram for the affected `repository_id` to confirm the spike is localized or global.
2. Query the `workspace_snapshots` table row count for the affected repository/user pair. Large counts (> 10,000) may indicate missing index or cleanup policy issue.
3. Check database connection pool health: look for elevated `pg_stat_activity` counts or lock contention.
4. Review recent deployments for query plan regressions. Run `EXPLAIN ANALYZE` on the `ListWorkspaceSnapshotsByRepo` query.
5. If localized to one user, check for unusually large snapshot counts and advise retention policy.
6. If global, check for database host resource exhaustion and scale if necessary.

#### Alert: `WorkspaceSnapshotListErrorRate`

**Condition:** Rate of 5xx responses / total requests > 1% over a 10-minute window.

**Severity:** Critical

**Runbook:**
1. Check application logs for ERROR-level entries with `query_name: "ListWorkspaceSnapshotsByRepo"` or `query_name: "CountWorkspaceSnapshotsByRepo"`.
2. Verify database connectivity via health check query.
3. Check if the error correlates with a recent deployment — consider rollback.
4. Check for migration failures that may have altered the `workspace_snapshots` table.
5. If the database is healthy, check for service registry initialization failures.
6. Escalate to platform team if the issue persists after 15 minutes.

#### Alert: `WorkspaceSnapshotListPaginationAbuse`

**Condition:** Any single user exceeds 120 requests/minute to the list endpoint.

**Severity:** Warning

**Runbook:**
1. Check if the rate limiter is correctly configured for the workspace-snapshots route.
2. Identify the user and check if the traffic pattern suggests a misbehaving script or UI bug.
3. If from a legitimate integration, advise on appropriate polling intervals.
4. If malicious, temporarily block API access and notify security team.

### Error Cases & Failure Modes

| Error Case                              | Behavior                                                 | User-Facing Message              |
|----------------------------------------|----------------------------------------------------------|----------------------------------|
| Database connection failure             | Return `500`, log ERROR                                   | `"internal server error"`        |
| Count query returns null                | Treat as 0 total, return empty list                      | (empty list, no error)           |
| List query timeout                      | Return `500`, log ERROR                                   | `"internal server error"`        |
| Auth middleware failure                 | Return `401`                                             | `"authentication required"`      |
| Repository context middleware unresolved | Returns `repository_id: 0` (known TODO)                  | Incorrect results (known gap)    |

## Verification

### API Integration Tests

- [ ] **List snapshots — empty repository:** Create a repository with no snapshots. `GET /api/repos/:owner/:repo/workspace-snapshots` returns `200`, empty array, `X-Total-Count: 0`.
- [ ] **List snapshots — single snapshot:** Create one snapshot. Verify the list returns exactly one item with all expected fields populated.
- [ ] **List snapshots — multiple snapshots sorted by created_at DESC:** Create 3 snapshots with known creation order. Verify the response array is ordered most-recent-first.
- [ ] **List snapshots — default pagination (30 items):** Create 35 snapshots. Request without pagination params. Verify exactly 30 returned and `X-Total-Count: 35`.
- [ ] **List snapshots — custom page size:** Create 10 snapshots. Request `?per_page=3&page=1`. Verify exactly 3 returned. Request `?page=4`. Verify 1 returned.
- [ ] **List snapshots — page beyond data:** Create 5 snapshots. Request `?page=100`. Verify `200` with empty array and `X-Total-Count: 5`.
- [ ] **List snapshots — per_page=1:** Create 3 snapshots. Request `?per_page=1&page=2`. Verify exactly 1 snapshot returned and it is the second-most-recent.
- [ ] **List snapshots — per_page=100 (maximum valid):** Create 100 snapshots. Request `?per_page=100`. Verify all 100 returned in a single page.
- [ ] **List snapshots — per_page=101 (exceeds maximum):** Request `?per_page=101`. Verify `400` error response with descriptive message.
- [ ] **List snapshots — per_page=0 (invalid):** Request `?per_page=0`. Verify `400` error.
- [ ] **List snapshots — per_page=-1 (negative):** Request `?per_page=-1`. Verify `400` error.
- [ ] **List snapshots — page=0 (invalid):** Request `?page=0`. Verify `400` error.
- [ ] **List snapshots — page=-1 (negative):** Request `?page=-1`. Verify `400` error.
- [ ] **List snapshots — page=abc (non-numeric):** Request `?page=abc`. Verify `400` error.
- [ ] **List snapshots — cursor-based pagination:** Create 10 snapshots. Request `?limit=3&cursor=0`. Verify 3 returned. Request `?limit=3&cursor=3`. Verify next 3 returned.
- [ ] **List snapshots — limit clamped to 100:** Request `?limit=200`. Verify it is silently clamped to 100 (not an error).
- [ ] **List snapshots — user isolation:** User A creates 3 snapshots, User B creates 2 in the same repository. User A's list returns only 3. User B's list returns only 2.
- [ ] **List snapshots — cross-repository isolation:** User creates snapshots in repo X and repo Y. Listing against repo X returns only repo X snapshots.
- [ ] **List snapshots — unauthenticated request:** Request without auth returns `401`.
- [ ] **List snapshots — X-Total-Count header present:** Verify the header is present and matches the actual total for every successful response.
- [ ] **List snapshots — workspace_id field omission:** Create a snapshot from a workspace, then delete the source workspace. Verify the snapshot still appears in the list.
- [ ] **List snapshots — snapshot with empty name:** Create a snapshot with `name: ""`. Verify it appears in the list with an empty string name.
- [ ] **List snapshots — snapshot with long name (255 chars):** Create a snapshot with a 255-character name. Verify it appears correctly.
- [ ] **List snapshots — snapshot with Unicode name:** Create a snapshot with name `"スナップショット-テスト-🚀"`. Verify it appears correctly with the name intact.
- [ ] **List snapshots — concurrent creation and list:** In parallel, create a snapshot and list snapshots. Verify the list operation completes without error.
- [ ] **List snapshots — response schema validation:** Validate every response against the `WorkspaceSnapshotResponse` interface: `id` is UUID, `repository_id` is integer, `user_id` is integer, `name` is string, `freestyle_snapshot_id` is string, `created_at` and `updated_at` are ISO 8601 timestamps.

### CLI Integration Tests

- [ ] **CLI `workspace snapshots` — basic output:** Create snapshots via API. Run `codeplane workspace snapshots <workspace-id> --repo OWNER/REPO`. Verify table output includes ID, Name, and Created columns.
- [ ] **CLI `workspace snapshots` — JSON output:** Run with `--json` flag. Verify valid JSON array output matching API response schema.
- [ ] **CLI `workspace snapshots` — empty list:** Run against a workspace with no snapshots. Verify graceful empty-state message, exit code 0.
- [ ] **CLI `workspace snapshots` — invalid workspace ID:** Run with a non-existent workspace ID. Verify error message on stderr, non-zero exit code.
- [ ] **CLI `workspace snapshots` — repo flag inference:** From within a cloned repository directory (without `--repo`), verify correct repository inference.

### E2E Tests (Playwright — Web UI)

- [ ] **Web snapshot list — renders table:** Navigate to workspace snapshots view. Verify table renders with correct column headers.
- [ ] **Web snapshot list — empty state:** Navigate to snapshot list with no snapshots. Verify empty state message displayed.
- [ ] **Web snapshot list — pagination controls:** Create > 30 snapshots. Verify pagination controls appear. Click next. Verify second page loads.
- [ ] **Web snapshot list — loading state:** Verify a loading indicator appears while API request is in flight.
- [ ] **Web snapshot list — error state:** Simulate server error via network interception. Verify error message with retry option.
- [ ] **Web snapshot list — click snapshot row:** Click a snapshot. Verify navigation to snapshot detail view.

### E2E Tests (API-level, full stack)

- [ ] **Full lifecycle: create → list → verify:** Create a workspace, snapshot it, list snapshots, verify the new snapshot appears with correct metadata.
- [ ] **Full lifecycle: create many → paginate through all:** Create 50 snapshots. Page through all using `per_page=10`. Collect all IDs. Verify 50 unique IDs, no duplicates.
- [ ] **Full lifecycle: delete → list → verify removal:** Create 3 snapshots. Delete one. List. Verify only 2 remain.
- [ ] **Full lifecycle: create workspace from snapshot in list:** List snapshots, take the first ID, create workspace with `snapshot_id`. Verify workspace created with `source_snapshot_id` populated.
