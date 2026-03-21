# WORKFLOW_CACHE_CLEAR

Specification for WORKFLOW_CACHE_CLEAR.

## High-Level User POV

When developers run workflows in Codeplane, the workflow engine automatically caches intermediate artifacts — dependency directories, build outputs, compiled assets — so that future workflow runs can skip expensive re-computation steps. Over time, these caches accumulate and consume storage against the repository's quota. The **Workflow Cache Clear** feature gives repository collaborators a way to reclaim that storage by bulk-deleting cached artifacts, either across the entire repository or scoped to a specific bookmark or cache key.

A developer who notices their workflow cache usage approaching the repository quota can clear stale or unnecessary caches without needing to wait for the automatic TTL-based eviction to run. This is especially useful after large refactors that invalidate most cached state, after renaming bookmarks that leave orphaned cache entries, or when debugging cache-related workflow failures where starting fresh is the fastest path forward.

Cache clearing is available everywhere Codeplane is used. From the CLI, `codeplane cache clear` removes matching caches and reports how many entries and how many bytes were freed. From the TUI, pressing `D` on the cache view screen opens a confirmation overlay showing the count and total size of caches about to be deleted. From the web UI's repository workflow cache management page, a "Clear caches" button with optional filter controls performs the same operation with a visual confirmation dialog. In all cases, the operation is scoped to a single repository and requires appropriate admin permissions. The user always sees a clear summary of what was deleted and how much space was reclaimed, and all cache lists and statistics refresh automatically to reflect the new state.

The feature respects the principle that destructive operations should be explicit and reversible where possible. Cache clearing is permanent — deleted cache entries and their backing storage objects cannot be recovered — but the system always requires confirmation before proceeding, shows a preview of the impact, and only deletes finalized caches (pending caches from in-progress workflow runs are never touched). Cache clearing does not affect running workflows; any currently executing workflow that has already restored a cache will continue using its in-memory copy, and future runs will simply rebuild the cache from scratch.

## Acceptance Criteria

### Definition of Done

- [ ] Bulk cache clear deletes all finalized caches for a repository when invoked with no filters
- [ ] Bulk cache clear deletes only caches matching the specified `bookmark` filter when provided
- [ ] Bulk cache clear deletes only caches matching the specified `key` filter when provided
- [ ] Bulk cache clear deletes only caches matching both `bookmark` AND `key` filters when both are provided
- [ ] Only caches with `status = 'finalized'` are eligible for deletion; `pending` caches are never deleted
- [ ] The response includes `deleted_count` (integer, number of cache entries removed) and `deleted_bytes` (integer, total `object_size_bytes` freed)
- [ ] Backing blob-store objects are deleted for each cleared cache entry
- [ ] Clearing caches on a repository with zero matching caches returns `{ deleted_count: 0, deleted_bytes: 0 }` with a 200 status
- [ ] After clearing, the repository's cache stats (`cache_count`, `total_size_bytes`) reflect the new totals
- [ ] The operation is atomic from the user's perspective — either all matching caches are deleted or none are (partial failure returns an error and does not silently lose entries)
- [ ] Cache clear does not affect currently in-progress workflow runs
- [ ] All clients (API, CLI, TUI, Web) require explicit user confirmation before executing a clear

### Boundary Constraints

- [ ] `bookmark` filter: maximum 255 characters, UTF-8, trimmed of leading/trailing whitespace; empty string treated as "no filter"
- [ ] `key` filter: maximum 255 characters, UTF-8, trimmed of leading/trailing whitespace; empty string treated as "no filter"
- [ ] `bookmark` filter supports exact match only (no glob, no regex, no partial matching)
- [ ] `key` filter supports exact match only (no glob, no regex, no partial matching)
- [ ] Maximum number of caches deletable in a single clear operation: 10,000 entries (if more exist, the response must include a `truncated: true` flag and the user must re-invoke to continue)
- [ ] `deleted_count` and `deleted_bytes` are returned as integers (not strings), with `deleted_bytes` representing the sum of compressed `object_size_bytes`
- [ ] Special characters in filter values (slashes, dots, hyphens, underscores, colons) are treated as literal characters
- [ ] Filter values containing only whitespace are treated as empty (no filter)
- [ ] A `bookmark` filter value that matches no existing caches returns zero deleted, not an error
- [ ] A `key` filter value that matches no existing caches returns zero deleted, not an error

### Edge Cases

- [ ] Clearing caches while a separate workflow run is actively saving a new pending cache: the pending cache is untouched
- [ ] Clearing caches while another clear request for the same repo is in-flight: both succeed without conflict (idempotent deletes)
- [ ] Clearing caches on a repository the user does not have access to: 404 (repository not found) or 403 (forbidden), never leaks existence
- [ ] Clearing caches on a non-existent repository: 404
- [ ] Clearing caches with a `bookmark` filter value at exactly 255 characters: succeeds
- [ ] Clearing caches with a `bookmark` filter value at 256 characters: 400 validation error
- [ ] Clearing caches with a `key` filter value at exactly 255 characters: succeeds
- [ ] Clearing caches with a `key` filter value at 256 characters: 400 validation error
- [ ] Clearing caches when blob-store is temporarily unreachable: returns 503 with descriptive error, no database records are deleted
- [ ] Clearing caches on a repository with caches in mixed statuses (some pending, some finalized): only finalized are deleted, `deleted_count` reflects only finalized entries

## Design

### API Shape

**Endpoint:** `DELETE /api/repos/:owner/:repo/caches`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bookmark` | string | No | Filter caches to those created on this bookmark name. Exact match. Max 255 chars. |
| `key` | string | No | Filter caches to those with this cache key. Exact match. Max 255 chars. |

**Success Response (200):**

```json
{
  "deleted_count": 47,
  "deleted_bytes": 149226496
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | `bookmark` or `key` exceeds 255 characters | `{ "message": "bookmark filter exceeds maximum length of 255 characters" }` |
| 401 | Not authenticated | `{ "message": "authentication required" }` |
| 403 | Insufficient permissions | `{ "message": "admin access required to clear caches" }` |
| 404 | Repository not found or not accessible | `{ "message": "repository not found" }` |
| 503 | Blob store unavailable | `{ "message": "cache storage temporarily unavailable" }` |

**Flow:**

1. Authenticate the user and resolve the repository from `:owner/:repo`
2. Verify the user has admin permission on the repository
3. Validate filter parameters (length, trimming)
4. Query all finalized caches matching filters via `listWorkflowCachesForClear`
5. For each matched cache, delete the backing blob-store object
6. Delete all matched cache database records
7. Sum `object_size_bytes` across deleted records
8. Return `{ deleted_count, deleted_bytes }`

### CLI Command

**Command:** `codeplane cache clear`

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo` / `-R` | string | Auto-detected from CWD | Repository in `OWNER/REPO` format |
| `--bookmark` | string | (none) | Filter by bookmark name |
| `--key` | string | (none) | Filter by cache key |
| `--yes` / `-y` | boolean | false | Skip confirmation prompt |
| `--json` | boolean | false | Output raw JSON response |

**Interactive Behavior (no `--yes`):**

```
⚠  This will delete all workflow caches for acme/widget matching:
   bookmark: main
   key: (all)

   Continue? [y/N]
```

**Output (default):**

```
✓ Cleared 47 caches, freed 142.3 MB
```

**Output (`--json`):**

```json
{
  "deleted_count": 47,
  "deleted_bytes": 149226496
}
```

**Exit codes:**

| Code | Meaning |
|------|---------|
| 0 | Success (including zero deleted) |
| 1 | API error (auth, permission, not found) |
| 2 | Invalid arguments |
| 130 | User cancelled at confirmation prompt |

### TUI UI

The cache clear action is integrated into the Workflow Cache View screen:

- **Single delete (`d`):** Deletes the focused cache entry. Shows a confirmation overlay: `"Delete cache 'node_modules-abc123' (45 MB)? [y/N]"`. Calls `DELETE /api/repos/:owner/:repo/caches/:id`.
- **Bulk clear (`D`):** Deletes all caches matching active filters. Shows a confirmation overlay: `"Clear 47 caches (142.3 MB) matching [bookmark:main]? [y/N]"`. Calls `DELETE /api/repos/:owner/:repo/caches` with filter query parameters.
- After either operation, the stats banner and cache list refresh automatically.
- If zero caches match filters, the `D` overlay shows `"0 caches (0 B)"` and the confirm button is disabled.
- Errors are shown inline in the TUI status bar.

### Web UI Design

The Web UI's repository workflow section includes a "Caches" tab (alongside Runs, Definitions, Artifacts). The cache management page includes:

**Header area:**
- Statistics banner showing cache count, total usage vs. quota (with progress bar), max archive size, TTL, and last hit timestamp.
- Filter controls: bookmark dropdown (populated from distinct bookmark values in cache list) and cache key text input.
- "Clear caches" button (destructive red styling, only visible to admins).

**Clear confirmation dialog (modal):**
- Title: "Clear workflow caches"
- Body: "This will permanently delete **{count}** caches ({formatted_bytes}) matching the current filters. This cannot be undone."
- If filters are active: shows active filter pills in the dialog body.
- If no filters: "This will permanently delete **all {count}** caches ({formatted_bytes}) for this repository."
- Buttons: "Cancel" (secondary) and "Clear {count} caches" (destructive red).
- While clearing: button shows spinner and "Clearing…" text, Cancel is disabled.

**Post-clear behavior:**
- Success toast: "Cleared {count} caches, freed {formatted_bytes}"
- Stats banner and cache list auto-refresh
- If all caches were cleared, transitions to empty state

### SDK Shape

The SDK service exposes a `clearWorkflowCaches` method on the workflow service:

```typescript
interface ClearWorkflowCachesInput {
  repositoryId: string;
  bookmarkName?: string;
  cacheKey?: string;
}

interface ClearWorkflowCachesResult {
  deletedCount: number;
  deletedBytes: number;
}

async clearWorkflowCaches(input: ClearWorkflowCachesInput): Promise<ClearWorkflowCachesResult>
```

Internally, the method:
1. Calls `listWorkflowCachesForClear` to get all matching finalized caches
2. Iterates and calls blob store delete for each `objectKey`
3. Calls `deleteWorkflowCacheByID` for each cache
4. Sums `objectSizeBytes` across all deleted entries
5. Returns `{ deletedCount, deletedBytes }`

### Documentation

End-user documentation should cover:

- **Concept page — Workflow Caches:** What caches are, how they're created by workflow `save` steps, how they're restored, TTL behavior, quota limits, and eviction order.
- **Guide — Managing Workflow Caches:** How to view, filter, and clear caches from CLI, TUI, and Web UI. Includes common scenarios (clearing after a refactor, debugging stale caches, reclaiming quota).
- **CLI Reference — `codeplane cache clear`:** Full flag documentation, examples with output, exit codes.
- **API Reference — `DELETE /api/repos/:owner/:repo/caches`:** Request/response schema, authentication, error codes, examples.

## Permissions & Security

### Authorization

| Role | Can clear caches? |
|------|--------------------|
| Anonymous | No |
| Read-only | No |
| Member (write) | No |
| Admin | **Yes** |
| Owner | **Yes** |

Cache clearing is an admin-only operation because it affects shared CI/CD infrastructure. A member who can push code and trigger workflows should not unilaterally be able to invalidate the team's cache investment. Organization owners inherit admin permissions on all organization repositories.

### Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| Per-user, per-repository | 10 clear requests | 1 hour |
| Per-repository (all users) | 30 clear requests | 1 hour |

Rate limit responses return `429 Too Many Requests` with `Retry-After` header.

### Data Privacy

- Cache metadata (keys, bookmark names, sizes, timestamps) is repository-scoped and visible to anyone with read access to the repository.
- Cache blob contents are not returned by the clear endpoint — only metadata about what was deleted.
- Audit logs include the identity of the user who performed the clear, the filters used, and the count/bytes deleted. They do not include cache contents.
- No PII is stored in cache metadata. Cache keys and bookmark names are developer-defined identifiers. If a developer places PII in a cache key (antipattern), clearing the cache removes that metadata from the system.

## Telemetry & Product Analytics

### Business Events

**Event: `WorkflowCacheClear`**

Fired when a cache clear operation completes successfully.

| Property | Type | Description |
|----------|------|-------------|
| `repository_id` | string | Repository ID |
| `owner` | string | Repository owner name |
| `repo` | string | Repository name |
| `actor_id` | string | User who triggered the clear |
| `filter_bookmark` | string \| null | Bookmark filter applied, or null |
| `filter_key` | string \| null | Key filter applied, or null |
| `deleted_count` | number | Number of caches deleted |
| `deleted_bytes` | number | Total bytes freed |
| `client` | string | Origin client: `api`, `cli`, `tui`, `web` |
| `duration_ms` | number | Wall-clock time for the operation |

**Event: `WorkflowCacheClearFailed`**

Fired when a cache clear operation fails.

| Property | Type | Description |
|----------|------|-------------|
| `repository_id` | string | Repository ID |
| `actor_id` | string | User who triggered the clear |
| `error_code` | string | Error classification (e.g., `blob_store_unavailable`, `permission_denied`) |
| `filter_bookmark` | string \| null | Bookmark filter applied |
| `filter_key` | string \| null | Key filter applied |

### Funnel Metrics & Success Indicators

- **Adoption rate:** Percentage of repositories with >0 caches that have used cache clear at least once in the last 30 days.
- **Quota relief:** Average percentage of quota freed per clear operation (indicates whether users are effectively managing cache pressure).
- **Clear-to-refill time:** Median time between a cache clear and the repository's cache count returning to 80% of pre-clear levels (measures whether clears are productive or churn-inducing).
- **Filtered vs. unfiltered clears:** Ratio of filtered clears (targeted) to unfiltered clears (scorched earth). A healthy ratio skews toward filtered clears, indicating users understand their cache topology.
- **Client distribution:** Breakdown of clears by client (`cli`, `web`, `tui`, `api`), to inform investment in each surface.
- **Error rate:** Percentage of clear attempts that fail, segmented by error type.

## Observability

### Logging

| Log Event | Level | Structured Fields | Description |
|-----------|-------|-------------------|-------------|
| `workflow_cache_clear.started` | INFO | `repository_id`, `actor_id`, `filter_bookmark`, `filter_key` | Clear operation initiated |
| `workflow_cache_clear.query_complete` | DEBUG | `repository_id`, `matched_count`, `query_duration_ms` | Cache query for matching entries completed |
| `workflow_cache_clear.blob_delete` | DEBUG | `cache_id`, `object_key`, `object_size_bytes` | Individual blob deletion (per entry) |
| `workflow_cache_clear.blob_delete_failed` | WARN | `cache_id`, `object_key`, `error` | Individual blob deletion failed |
| `workflow_cache_clear.completed` | INFO | `repository_id`, `actor_id`, `deleted_count`, `deleted_bytes`, `duration_ms` | Clear completed successfully |
| `workflow_cache_clear.failed` | ERROR | `repository_id`, `actor_id`, `error`, `error_code`, `filter_bookmark`, `filter_key` | Clear failed |
| `workflow_cache_clear.rate_limited` | WARN | `actor_id`, `repository_id`, `retry_after_seconds` | Rate limit exceeded |
| `workflow_cache_clear.unauthorized` | WARN | `actor_id`, `repository_id`, `required_role` | Permission denied |

### Prometheus Metrics

**Counters:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_cache_clear_total` | `repository_id`, `status` (`success`, `error`, `rate_limited`) | Total cache clear operations |
| `codeplane_workflow_cache_clear_entries_deleted_total` | `repository_id` | Cumulative count of cache entries deleted |
| `codeplane_workflow_cache_clear_bytes_freed_total` | `repository_id` | Cumulative bytes freed by cache clears |

**Histograms:**

| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `codeplane_workflow_cache_clear_duration_seconds` | `status` | 0.1, 0.5, 1, 2, 5, 10, 30, 60 | Clear operation wall-clock time |
| `codeplane_workflow_cache_clear_entries_per_op` | — | 1, 5, 10, 50, 100, 500, 1000, 5000, 10000 | Number of entries deleted per operation |

**Gauges:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_workflow_cache_repo_usage_bytes` | `repository_id` | Current total cache usage per repo (updated after clear) |

### Alerts

**Alert: WorkflowCacheClearHighErrorRate**

- **Condition:** `rate(codeplane_workflow_cache_clear_total{status="error"}[5m]) / rate(codeplane_workflow_cache_clear_total[5m]) > 0.25` sustained for 10 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check `workflow_cache_clear.failed` logs for the `error_code` field — determine if errors are concentrated on a single repository or widespread.
  2. If `error_code` is `blob_store_unavailable`: check blob store health (S3/MinIO dashboard, connectivity). Verify blob store credentials are valid. Check for network partition between API server and blob store.
  3. If `error_code` is `database_error`: check PostgreSQL connection pool health, run `pg_stat_activity` for lock contention on `workflow_caches` table.
  4. If errors are repository-specific: check for data corruption in that repo's cache records (orphaned entries, null `object_key` values).
  5. If errors resolve: no action. If persistent: escalate to storage/infrastructure team.

**Alert: WorkflowCacheClearSlowOperations**

- **Condition:** `histogram_quantile(0.95, codeplane_workflow_cache_clear_duration_seconds) > 30` sustained for 15 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check `workflow_cache_clear.query_complete` logs for `query_duration_ms` — if high, the database query is slow. Check for missing index on `workflow_caches(repository_id, status, bookmark_name, cache_key)`.
  2. Check `workflow_cache_clear.blob_delete` logs — if many individual blob deletes are slow, check blob store latency metrics.
  3. Check `codeplane_workflow_cache_clear_entries_per_op` histogram — if p95 entries is very high (>5000), operations may be legitimately slow due to volume. Consider whether the 10,000-entry cap is being hit.
  4. If blob store latency is the bottleneck: consider implementing batch/parallel blob deletion (currently sequential).
  5. If query latency is the bottleneck: run `EXPLAIN ANALYZE` on `ListWorkflowCachesForClear` query with representative parameters.

**Alert: WorkflowCacheClearRateLimitSpike**

- **Condition:** `rate(codeplane_workflow_cache_clear_total{status="rate_limited"}[10m]) > 5` sustained for 10 minutes
- **Severity:** Info
- **Runbook:**
  1. Check which user(s) and repository(ies) are triggering rate limits via `workflow_cache_clear.rate_limited` logs.
  2. Determine if this is legitimate usage (user frustrated by slow clear, retrying) or potential abuse.
  3. If legitimate: consider whether the rate limit (10/hour per user per repo) is too aggressive. Check if the user's clear operations are failing and they're retrying.
  4. If abuse: check if the actor is an automated integration or PAT. Consider temporary token revocation if necessary.

### Error Cases and Failure Modes

| Failure Mode | HTTP Status | User-Visible Behavior | System Behavior |
|---|---|---|---|
| Unauthenticated request | 401 | "Authentication required" | Log at WARN level |
| Insufficient permissions | 403 | "Admin access required to clear caches" | Log at WARN level |
| Repository not found | 404 | "Repository not found" | Log at DEBUG level |
| Filter value too long | 400 | "bookmark/key filter exceeds maximum length of 255 characters" | Log at DEBUG level |
| Blob store unreachable | 503 | "Cache storage temporarily unavailable" | Log at ERROR, do not delete DB records |
| Partial blob deletion failure | 503 | "Some caches could not be cleared, please retry" | Log each failed blob at WARN, roll back DB deletes |
| Database connection failure | 500 | "Internal server error" | Log at ERROR level with connection details |
| Rate limit exceeded | 429 | "Rate limit exceeded. Retry after {N} seconds" | Log at WARN level |
| Request timeout (>60s) | 504 | "Operation timed out, please retry with narrower filters" | Log at ERROR level |

## Verification

### API Integration Tests

- [ ] `DELETE /api/repos/:owner/:repo/caches` returns `200` with `{ deleted_count: 0, deleted_bytes: 0 }` on a repository with no caches
- [ ] `DELETE /api/repos/:owner/:repo/caches` returns `200` and deletes all finalized caches when no filters are provided
- [ ] `DELETE /api/repos/:owner/:repo/caches?bookmark=main` deletes only caches where `bookmark_name = 'main'`
- [ ] `DELETE /api/repos/:owner/:repo/caches?key=node_modules` deletes only caches where `cache_key = 'node_modules'`
- [ ] `DELETE /api/repos/:owner/:repo/caches?bookmark=main&key=node_modules` deletes only caches matching both filters simultaneously
- [ ] `deleted_count` in response exactly matches the number of finalized caches that matched the filters
- [ ] `deleted_bytes` in response exactly equals the sum of `object_size_bytes` for all deleted caches
- [ ] Pending caches (status = 'pending') are never deleted even when filters match
- [ ] After clear, `GET /api/repos/:owner/:repo/caches` returns a list without the deleted entries
- [ ] After clear, `GET /api/repos/:owner/:repo/caches/stats` shows updated `cache_count` and `total_size_bytes`
- [ ] `DELETE /api/repos/:owner/:repo/caches` returns `401` for unauthenticated requests
- [ ] `DELETE /api/repos/:owner/:repo/caches` returns `403` for users with read-only access
- [ ] `DELETE /api/repos/:owner/:repo/caches` returns `403` for users with write (member) access but not admin
- [ ] `DELETE /api/repos/:owner/:repo/caches` returns `200` for users with admin access
- [ ] `DELETE /api/repos/:owner/:repo/caches` returns `200` for repository owners
- [ ] `DELETE /api/repos/:owner/:repo/caches` returns `404` for a non-existent repository
- [ ] `DELETE /api/repos/:owner/:repo/caches` returns `404` for a private repository the user cannot access (does not leak existence)
- [ ] `DELETE /api/repos/:owner/:repo/caches?bookmark=x` where `x` is 255 characters long returns `200` (succeeds)
- [ ] `DELETE /api/repos/:owner/:repo/caches?bookmark=x` where `x` is 256 characters long returns `400`
- [ ] `DELETE /api/repos/:owner/:repo/caches?key=x` where `x` is 255 characters long returns `200` (succeeds)
- [ ] `DELETE /api/repos/:owner/:repo/caches?key=x` where `x` is 256 characters long returns `400`
- [ ] `DELETE /api/repos/:owner/:repo/caches?bookmark=%20%20` (whitespace-only bookmark) is treated as no filter
- [ ] `DELETE /api/repos/:owner/:repo/caches?key=%20%20` (whitespace-only key) is treated as no filter
- [ ] Clearing caches with Unicode characters in bookmark filter works correctly
- [ ] Clearing caches with special characters (slashes, dots, colons) in key filter works correctly
- [ ] Two concurrent clear requests on the same repository both succeed without conflict
- [ ] Clearing 10,000 caches in a single operation completes successfully and returns the correct count
- [ ] Clearing a repository with >10,000 matching caches returns `truncated: true` and deletes exactly 10,000
- [ ] Backing blob-store objects are actually removed after a successful clear (verified via blob store query)
- [ ] Response `Content-Type` is `application/json`
- [ ] Rate limiting returns `429` after 10 clear requests in one hour from the same user on the same repo
- [ ] Rate limit response includes `Retry-After` header

### CLI E2E Tests

- [ ] `codeplane cache clear --repo owner/repo` returns exit code 0 and JSON `{ deleted_count: 0, deleted_bytes: 0 }` on empty repo
- [ ] `codeplane cache clear --repo owner/repo --bookmark main` passes bookmark filter to API
- [ ] `codeplane cache clear --repo owner/repo --key npm` passes key filter to API
- [ ] `codeplane cache clear --repo owner/repo --bookmark main --key npm` passes both filters to API
- [ ] `codeplane cache clear --repo owner/repo --json` returns valid JSON with `deleted_count` and `deleted_bytes` fields
- [ ] `codeplane cache clear` (no `--repo`) auto-detects repository from CWD
- [ ] `codeplane cache clear --repo nonexistent/repo` returns exit code 1
- [ ] After populating caches via workflow runs and then running `cache clear`, `cache list` returns empty and `cache stats` shows zero usage
- [ ] `codeplane cache clear --bookmark main` clears only main-bookmark caches; caches on other bookmarks remain
- [ ] `codeplane cache clear --key node_modules` clears only node_modules-key caches; caches with other keys remain

### TUI E2E Tests

- [ ] Pressing `D` on the cache view screen opens a confirmation overlay
- [ ] The confirmation overlay displays the count and total size of caches to be deleted
- [ ] Pressing `y` on the confirmation overlay triggers the clear and refreshes the list
- [ ] Pressing `n` or `Esc` on the confirmation overlay dismisses it without clearing
- [ ] After clearing, the statistics banner updates to reflect new totals
- [ ] Pressing `D` with active bookmark filter only shows matching caches in the confirmation count
- [ ] Pressing `D` when zero caches match filters shows disabled confirm button
- [ ] Error responses from the API are displayed in the TUI status bar
- [ ] Pressing `d` on a single finalized cache opens single-delete confirmation
- [ ] Pressing `d` on a pending cache is a no-op (key is dimmed)

### Web UI (Playwright) E2E Tests

- [ ] "Clear caches" button is visible to admin users on the repository cache management page
- [ ] "Clear caches" button is not visible to non-admin users
- [ ] Clicking "Clear caches" opens a confirmation dialog showing count and size
- [ ] Confirmation dialog shows active filter pills when filters are applied
- [ ] Clicking "Cancel" on the confirmation dialog dismisses it without clearing
- [ ] Clicking "Clear {N} caches" on the confirmation dialog triggers the clear operation
- [ ] After clearing, a success toast appears with the deleted count and freed bytes
- [ ] After clearing, the cache list and statistics banner refresh automatically
- [ ] Clearing all caches transitions the page to the empty state
- [ ] The "Clear caches" button is disabled while a clear operation is in progress
- [ ] Network error during clear shows an error toast with a retry option
