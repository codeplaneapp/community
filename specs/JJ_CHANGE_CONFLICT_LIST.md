# JJ_CHANGE_CONFLICT_LIST

Specification for JJ_CHANGE_CONFLICT_LIST.

## High-Level User POV

When a jj change contains unresolved conflicts — files where two or more sides of a rebase, merge, or edit disagree about what the content should be — developers need a clear, immediate view of exactly which files are conflicted and what kind of conflict each file has. The **Change Conflict List** feature provides this view across every Codeplane surface.

A developer working in Codeplane spots a change marked with a conflict indicator (⚠) in the change list. They click into that change — or they run `codeplane change conflicts <id>` in their terminal — and immediately see every conflicted file within that change: the file path, the type of conflict (2-sided, modify-delete, add-add, etc.), and whether the conflict has already been resolved. This view is the starting point for understanding what needs to be fixed before a change can be landed.

The conflict list is available everywhere a developer works. In the web UI, it appears as a dedicated section on the change detail page. In the CLI, it is a first-class subcommand that works both against the remote API and locally within a jj working copy. In the TUI, it is an expandable section within the change detail screen. In VS Code, conflicted changes show warning icons and expanding them lists the conflicted files. In Neovim, a Telescope picker surfaces the same data.

Critically, the conflict list is not just an informational display. It is the bridge between seeing that a conflict exists and acting on it. From the conflict list, users can navigate to the diff viewer for a specific conflicted file, understand the conflict's three-way structure (base, left, right), and determine whether someone has already resolved it. For teams, the conflict list shows who resolved which conflict and how, creating accountability and a resolution audit trail.

The feature works locally without a server connection when run inside a jj working copy, and it works remotely via the Codeplane API for repository collaboration scenarios. This dual-mode behavior means individual developers and teams both get first-class conflict visibility regardless of how they access the repository.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/changes/:change_id/conflicts` returns a paginated list of conflicts for the specified change, wired to the existing `RepoHostService.getChangeConflicts()` method.
- [ ] The CLI command `codeplane change conflicts <id>` returns conflicts in both human-readable and JSON formats, supporting both local and remote modes.
- [ ] The web UI displays a conflict list section on the change detail page for changes with `has_conflict: true`.
- [ ] The TUI displays a conflict section within the change detail screen.
- [ ] Editor integrations surface conflict indicators alongside change browsing views.
- [ ] All clients converge on the same API shape and display consistent data.
- [ ] The feature is covered by integration and end-to-end tests across API, CLI, web UI, and TUI.

### Functional Constraints

- [ ] Each conflict entry must include: `file_path`, `conflict_type`.
- [ ] Each conflict entry may optionally include: `base_content`, `left_content`, `right_content`, `hunks`, `resolution_status`.
- [ ] Conflicts must be sorted alphabetically by `file_path`.
- [ ] A change with no conflicts must return an empty array `[]`, not an error.
- [ ] Conflict types must be returned as-is from jj (e.g., `"2-sided conflict"`, `"3-sided conflict"`, `"modify-delete conflict"`, `"add-add conflict"`); Codeplane must not remap or normalize them.
- [ ] The `file_path` must be the repository-relative path (no leading slash, no absolute paths).
- [ ] If the change does not exist in the repository, the endpoint must return `404`.
- [ ] If the repository does not exist or the caller lacks access, the endpoint must return `404` (not `403`, to avoid repository existence disclosure).
- [ ] A change that is not conflicted (i.e., `has_conflict: false` in the change list) must return an empty conflict list, not an error.

### Pagination Constraints

- [ ] The API must support page/offset pagination with `page` and `per_page` query parameters.
- [ ] The default page size must be 50.
- [ ] The maximum page size must be 100.
- [ ] A `per_page` value of 0 or negative must return `400 Bad Request` with message `"invalid per_page value"`.
- [ ] A `per_page` value exceeding 100 must be silently clamped to 100.
- [ ] A `page` value of 0 or negative must be treated as page 1.
- [ ] When fewer results than `per_page` are returned, the client must infer it is the last page.

### Edge Cases

- [ ] A change with a single conflicted file must return exactly one entry.
- [ ] A change with 500+ conflicted files (pathological case) must paginate correctly without timeout.
- [ ] File paths containing spaces must be returned correctly (e.g., `src/my file.ts`).
- [ ] File paths containing Unicode characters must be returned without modification (e.g., `src/日本語.ts`).
- [ ] File paths containing special characters (e.g., `#`, `@`, `[`, `]`, parentheses) must be returned without escaping or encoding.
- [ ] Deeply nested file paths (e.g., 20+ directory levels like `a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/file.ts`) must be returned in full.
- [ ] File paths up to 4096 characters (filesystem maximum) must be handled.
- [ ] A file path that exists in the conflict list but has since been resolved (jj allows this state) should be returned with `resolution_status` set accordingly.
- [ ] If the jj subprocess returns an unexpected output format, the server must return `500` with a descriptive error rather than silently returning an empty list.
- [ ] If the jj subprocess exits with a non-zero code for reasons other than "no conflicts", the server must return `500`.
- [ ] Concurrent conflict list requests for the same change must not deadlock or corrupt data.
- [ ] The `change_id` parameter may be a full hex change ID or a shortened prefix; the API delegates resolution to jj.
- [ ] An empty `change_id` parameter must return `400 Bad Request` with message `"change_id is required"`.
- [ ] A `change_id` containing only whitespace must return `400 Bad Request`.
- [ ] A `change_id` containing non-hex characters that jj does not recognize must return `404` with an appropriate message.

### Boundary Constraints

- [ ] `file_path`: maximum 4096 characters (OS filesystem limit); no minimum.
- [ ] `conflict_type`: maximum 256 characters.
- [ ] `change_id`: 1–64 hex characters (jj short or full form).
- [ ] `base_content`, `left_content`, `right_content`: optional; when populated, maximum 1MB per field.
- [ ] `hunks`: optional; maximum 1MB.
- [ ] `resolution_status`: one of `""` (unresolved), `"resolved"`, or absent.
- [ ] Maximum conflicts per change: no artificial limit; bounded by the repository's actual state.
- [ ] Maximum conflicts returned per page: 100.
- [ ] `owner`: 1–39 characters, alphanumeric and hyphens only (matching username constraints).
- [ ] `repo`: 1–100 characters, alphanumeric, hyphens, underscores, and dots only (matching repository name constraints).

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/changes/:change_id/conflicts`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner username or organization |
| `repo` | string | Repository name |
| `change_id` | string | jj change ID (full or abbreviated hex) |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number for pagination. Values ≤ 0 treated as 1. |
| `per_page` | integer | `50` | Number of conflicts to return per page. Clamped to `[1, 100]`. |

**Success Response (200):**
```json
{
  "items": [
    {
      "file_path": "src/auth/session.ts",
      "conflict_type": "2-sided conflict",
      "base_content": null,
      "left_content": null,
      "right_content": null,
      "hunks": null,
      "resolution_status": ""
    }
  ],
  "total": 2,
  "page": 1,
  "per_page": 50
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Missing or empty `owner` param | `{ "message": "owner is required" }` |
| 400 | Missing or empty `repo` param | `{ "message": "repository name is required" }` |
| 400 | Missing or empty `change_id` param | `{ "message": "change_id is required" }` |
| 400 | Invalid `per_page` value (0, negative, non-numeric) | `{ "message": "invalid per_page value" }` |
| 404 | Repository not found or private without access | `{ "message": "repository not found" }` |
| 404 | Change not found | `{ "message": "change '<change_id>' not found" }` |
| 429 | Rate limit exceeded | `{ "message": "rate limit exceeded" }` with `Retry-After` header |
| 500 | jj subprocess failure | `{ "message": "failed to get conflicts: <stderr>" }` |

### SDK Shape

The `RepoHostService` in `@codeplane/sdk` exposes:

```typescript
interface ChangeConflict {
  file_path: string;
  conflict_type: string;
  base_content?: string;
  left_content?: string;
  right_content?: string;
  hunks?: string;
  resolution_status?: string;
}

getChangeConflicts(
  owner: string,
  repo: string,
  changeId: string
): Promise<Result<ChangeConflict[], APIError>>
```

The SDK calls `jj resolve --list -r <change_id>` and parses the output. The jj output format is: `<file_path>    <conflict_type>` where file path and conflict type are separated by two or more spaces. If jj reports "No conflicts" or "is not a conflicted", the method returns an empty array. If the change is not found, it returns a `404` error.

Database-backed persistence via `conflicts_sql.ts`:
```typescript
listConflictsByChangeID(sql, { repositoryId, changeId, pageOffset, pageSize })
upsertConflict(sql, { repositoryId, changeId, filePath, conflictType })
markConflictResolved(sql, { repositoryId, changeId, filePath, resolvedBy, resolutionMethod })
deleteConflictsByChangeID(sql, { repositoryId, changeId })
```

Shared data hooks in `@codeplane/ui-core` (to be created):
- `useChangeConflicts(owner, repo, changeId)` — Fetches and caches conflict list. Returns `{ data, loading, error, refetch }`.

### CLI Command

**Command:** `codeplane change conflicts <id>`

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | jj change ID (full or abbreviated) |

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--repo` | string | (inferred from cwd) | Repository in `OWNER/REPO` format. When provided, uses API. |

**Human-readable output:**
```
src/auth/session.ts    2-sided conflict
src/routes/landing.ts  modify-delete conflict
```

One file per line, right-padded path aligned with conflict type. When no conflicts exist, output nothing with exit code 0.

**JSON output (`--json`):**
```json
{
  "change_id": "wqnwkozp",
  "conflicts": ["src/auth/session.ts", "src/routes/landing.ts"]
}
```

**Local-only behavior:** When run inside a jj working copy without `--repo`, calls `jj diff --summary -r <id>` locally and filters for entries with conflict status (`C`). Works offline without a server connection.

**Remote behavior:** When `--repo` is specified, calls `GET /api/repos/:owner/:repo/changes/:change_id/conflicts` and formats the response.

### Web UI Design

**Location:** `/:owner/:repo/changes/:change_id` (change detail page)

**Conflict Section:**
- Only rendered when the change has `has_conflict: true`.
- Section header: "Conflicts (N files)" with a warning icon (⚠).
- When no conflicts are present despite `has_conflict: true` (stale flag edge case), show "Conflict status reported but no conflicted files found."
- Each conflict row displays:
  - File path as a clickable link to the diff viewer for that file.
  - Conflict type in a muted badge (e.g., `2-sided`, `modify-delete`).
  - Resolution status indicator: unresolved (red dot) or resolved (green checkmark).
- Sort: alphabetical by file path (matching API default).
- No client-side pagination for typical conflict counts (< 50). For changes with 50+ conflicts, paginate with "Load more" at the bottom.
- Empty state (no conflicts and no `has_conflict` flag): section not rendered at all.

**Visual Integration:**
- Conflict section positioned after the change metadata header and before the diff/files section.
- Warning color theme (amber/yellow border) to visually distinguish from normal content.
- File paths use monospace font for readability.
- Clicking a file path navigates to the diff viewer at `/:owner/:repo/changes/:change_id/diff#<file_path>`.

### TUI UI Design

**Location:** Change detail screen → Conflicts section

**Layout:**
- Section appears only for changes with `has_conflict: true`.
- Header: `⚠ Conflicts (N files)` in warning color.
- Scrollable list of conflict entries:
  - File path (truncated to terminal width minus type column).
  - Conflict type (right-aligned).
  - Resolution status icon: `✗` (red, unresolved), `✓` (green, resolved).

**Keyboard Interactions:**
- `j`/`k`/↑/↓: Navigate between conflict entries.
- `Enter`: Open diff viewer for the selected conflicted file.
- `d`: Open diff viewer (alias for Enter).
- `q`/`Esc`: Return to change detail.
- `R`: Hard refresh conflict list from API.

**Responsive Behavior:**
- **80×24**: File path only (no conflict type column).
- **120×40**: File path + conflict type.
- **200×60+**: File path + conflict type + resolution status + resolved-by.

**Empty State:** "No conflicts. All clear! ✓" centered with success color.

**Error State:** "Failed to load conflicts. Press R to retry." centered with error color.

### VS Code Extension

- When browsing changes in the Codeplane sidebar, changes with `has_conflict: true` display a ⚠ icon.
- Expanding a conflicted change shows child tree items for each conflicted file with the conflict type as the description.
- Clicking a conflicted file opens the file in the editor.
- Context menu on a conflicted file: "Open Diff", "Copy Path".

### Neovim Plugin

- `:Codeplane change conflicts <id>` opens a Telescope picker listing conflicted files.
- Each entry shows `<file_path>  <conflict_type>`.
- `<CR>` opens the file. `<C-d>` opens the diff view. `<C-y>` copies the file path.
- If no conflicts exist, the picker shows "No conflicts" and immediately closes.

### Documentation

1. **API Reference — List Change Conflicts**: Endpoint, path and query parameters, response schema, pagination behavior, error codes, cURL examples.
2. **CLI Reference — `change conflicts`**: Command syntax, arguments, options, output formats, local-vs-remote behavior, usage examples.
3. **User Guide — Resolving jj Conflicts**: What jj conflicts are, how they arise (rebase, merge, concurrent edits), how to use the conflict list to triage, and how to navigate to resolution tools.
4. **TUI Keyboard Reference**: Conflict section shortcuts added to the help overlay.

## Permissions & Security

### Authorization Model

| Role | Can List Change Conflicts? | Notes |
|------|---------------------------|-------|
| **Anonymous** | ✅ on public repos | Read-only conflict metadata |
| **Anonymous** | ❌ on private repos | Returns `404` (not `403`) to avoid repository existence disclosure |
| **Read-Only Member** | ✅ | Full conflict list access |
| **Member** | ✅ | Full conflict list access |
| **Admin** | ✅ | Full conflict list access |
| **Owner** | ✅ | Full conflict list access |

The TUI requires authentication at bootstrap, so unauthenticated TUI access is not possible. The CLI in local mode does not require server authentication (operates on the local jj working copy directly).

### Rate Limiting

| Context | Limit | Window |
|---------|-------|--------|
| Authenticated user | 300 requests | per minute |
| Anonymous / unauthenticated | 60 requests | per minute |
| Per-repository cap | 600 requests | per minute (across all users) |

Rate limit responses use `429 Too Many Requests` with `Retry-After` header. Rate limit state headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in all responses.

### Data Privacy

- Conflict file paths are repository metadata visible to anyone who can clone the repository. No additional PII is exposed beyond what is already accessible via repository browsing.
- `base_content`, `left_content`, and `right_content` fields, when populated, contain repository file content. These follow the same access rules as the repository's code browsing endpoints.
- `resolved_by` contains a user identifier. This is visible to all users who can view the repository's conflicts, consistent with how other attribution data (commit author, commenter) works.
- File paths must never be indexed by search engines for public repository change detail pages (controlled via `noindex` meta tag on the change detail page).
- Server logs must not log full file contents (`base_content`, `left_content`, `right_content`). Only `file_path`, `conflict_type`, and counts should appear in structured logs.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ChangeConflictListViewed` | User views conflict list for a change | `repo_id`, `owner`, `repo_name`, `change_id`, `client` (web/cli/tui/vscode/nvim), `conflict_count`, `is_authenticated`, `page_number` |
| `ChangeConflictFileNavigated` | User navigates from conflict list to a specific file | `repo_id`, `change_id`, `client`, `file_path`, `conflict_type`, `navigation_method` (click/enter/d) |
| `ChangeConflictListEmpty` | User views conflict list that returns zero items | `repo_id`, `change_id`, `client`, `has_conflict_flag` (from change list — useful for detecting stale conflict flags) |
| `ChangeConflictListError` | Conflict list request fails | `repo_id`, `change_id`, `client`, `error_type`, `http_status` |
| `ChangeConflictListPaginated` | User loads additional page of conflicts | `repo_id`, `change_id`, `client`, `page_number`, `loaded_count` |

### Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Conflict list load success rate** | Successful `ChangeConflictListViewed` / total attempts | > 99.5% |
| **Conflict → File navigation rate** | `ChangeConflictFileNavigated` / `ChangeConflictListViewed` | > 50% (users who see conflicts should act on them) |
| **Stale conflict flag rate** | `ChangeConflictListEmpty` where `has_conflict_flag=true` / total views | < 5% |
| **Multi-client conflict usage** | Unique users viewing conflict lists from 2+ clients in 7 days | Increasing over time |
| **Error rate** | `ChangeConflictListError` / total requests | < 1% |
| **Median conflict count per change** | Median of `conflict_count` across all `ChangeConflictListViewed` | Track (lower is healthier) |

## Observability

### Logging

| Log Point | Level | Structured Context | When |
|-----------|-------|--------------------|------|
| Change conflict list request received | `INFO` | `{ owner, repo, change_id, page, per_page, user_id?, request_id }` | Every request |
| Change conflict list response | `DEBUG` | `{ owner, repo, change_id, conflict_count, response_time_ms, request_id }` | Successful response |
| jj resolve --list started | `DEBUG` | `{ owner, repo, change_id, command: "jj resolve --list", request_id }` | Before exec |
| jj resolve --list completed | `DEBUG` | `{ owner, repo, change_id, exit_code, duration_ms, stdout_bytes, request_id }` | After exec |
| jj resolve --list failed | `ERROR` | `{ owner, repo, change_id, exit_code, stderr, duration_ms, request_id }` | Non-zero exit (not "no conflicts") |
| No conflicts detected (benign) | `DEBUG` | `{ owner, repo, change_id, request_id }` | jj reports no conflicts |
| Change not found | `WARN` | `{ owner, repo, change_id, request_id }` | 404 response for change |
| Repository not found | `WARN` | `{ owner, repo, request_id }` | 404 response for repo |
| Conflict output parsing failure | `ERROR` | `{ owner, repo, change_id, raw_output_length, raw_line, request_id }` | Line does not match expected `^(.+?)\s{2,}(.+)$` format |
| Rate limit exceeded | `WARN` | `{ owner, repo, user_id?, ip, request_id }` | 429 response |
| Invalid per_page parameter | `WARN` | `{ owner, repo, raw_per_page, request_id }` | 400 response |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_change_conflict_list_requests_total` | Counter | `owner`, `repo`, `status_code` | Total change conflict list requests |
| `codeplane_change_conflict_list_duration_seconds` | Histogram | `owner`, `repo` | End-to-end request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0) |
| `codeplane_change_conflict_list_items_returned` | Histogram | — | Number of conflicts returned per request (buckets: 0, 1, 2, 5, 10, 25, 50, 100) |
| `codeplane_jj_resolve_list_duration_seconds` | Histogram | `exit_code` | jj resolve --list execution time (buckets: 0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0, 30.0) |
| `codeplane_jj_resolve_list_errors_total` | Counter | `error_type` | jj resolve --list failures (labels: `not_found`, `no_conflicts`, `subprocess_error`, `parse_error`) |
| `codeplane_change_conflict_count` | Histogram | — | Number of conflicts per change (buckets: 0, 1, 2, 5, 10, 25, 50, 100, 500) |

### Alerts

#### Alert: High Change Conflict List Error Rate
- **Condition:** `rate(codeplane_change_conflict_list_requests_total{status_code=~"5.."}[5m]) / rate(codeplane_change_conflict_list_requests_total[5m]) > 0.05`
- **Severity:** Warning (> 5%), Critical (> 20%)
- **Runbook:**
  1. Check `codeplane_jj_resolve_list_errors_total` — if `subprocess_error` is rising, jj may be unavailable or crashing.
  2. SSH into the server and verify `jj --version` works and the binary is in PATH.
  3. Check disk space on the repository storage volume (`df -h`). jj operations fail on full filesystems.
  4. Check server logs for `"failed to get conflicts"` entries and inspect the `stderr` content.
  5. If specific to one repository, check that repository's `.jj` directory for corruption: `jj debug operation log` in the repo path.
  6. If `parse_error` is rising, check if jj updated and the `jj resolve --list` output format changed. Compare against the regex pattern `^(.+?)\s{2,}(.+)$`.
  7. Verify the server is not running out of process handles from concurrent jj subprocesses.

#### Alert: High Change Conflict List Latency
- **Condition:** `histogram_quantile(0.95, rate(codeplane_change_conflict_list_duration_seconds_bucket[5m])) > 3.0`
- **Severity:** Warning (p95 > 3s), Critical (p95 > 8s)
- **Runbook:**
  1. Check `codeplane_jj_resolve_list_duration_seconds` — if jj subprocess time is high, the bottleneck is in jj, not the server.
  2. Check system load (`uptime`, `top`). High CPU may indicate resource contention.
  3. Check if a specific repository has an unusual number of conflicts (hundreds). This is rare but possible in large rebases.
  4. Check I/O wait (`iostat`). Repository operations are I/O-bound.
  5. Try `jj resolve --list -r <change_id>` manually in the affected repo to reproduce.
  6. If latency is widespread, check for lock contention from concurrent jj operations on the same repository.

#### Alert: jj resolve --list Crash Spike
- **Condition:** `rate(codeplane_jj_resolve_list_errors_total{error_type="subprocess_error"}[5m]) > 5`
- **Severity:** Critical
- **Runbook:**
  1. Verify jj is installed: `which jj && jj --version`.
  2. Inspect server logs for full stderr of failed commands.
  3. Check if jj was recently updated — the `resolve --list` subcommand behavior may have changed.
  4. If jj segfaults, capture core dump and file upstream issue.
  5. Pin jj version as temporary mitigation.
  6. If repo-specific, check `.jj/repo/store` for corruption.

#### Alert: Conflict Output Parsing Failures
- **Condition:** `rate(codeplane_jj_resolve_list_errors_total{error_type="parse_error"}[5m]) > 1`
- **Severity:** Warning
- **Runbook:**
  1. Check if jj `resolve --list` output format changed in a recent jj upgrade.
  2. Inspect logs for `"Conflict output parsing failure"` with `raw_line` content.
  3. Test manually: `jj resolve --list -r <change_id>` in the affected repo.
  4. If format changed, update the regex in `RepoHostService.getChangeConflicts()` to match new output.
  5. Check if file paths with unusual characters (spaces, Unicode) are causing the regex to fail.

### Error Cases and Failure Modes

| Failure Mode | Cause | Detection | User Impact | Recovery |
|--------------|-------|-----------|-------------|----------|
| jj binary not found | Not installed or not in PATH | Subprocess exec error | 500 on all requests | Install jj or fix PATH |
| jj resolve --list format change | jj version upgrade | Parse errors, empty results | Stale or missing conflicts | Update parser regex |
| Repository path missing | Deleted or unmounted storage | ensureRepo returns error | 404 for specific repo | Restore storage |
| Change not found | Invalid change ID, squashed, or abandoned | jj stderr contains "not found" | 404 for change | User corrects change ID |
| Disk full | Storage exhausted | jj operations fail | 500 errors | Free disk space |
| Process timeout | jj hangs on large repo | Server timeout | 504 or 500 | Kill process; check repo health |
| Corrupted .jj directory | Disk corruption | jj returns errors | 500 for specific repo | Restore from backup |
| Concurrent access deadlock | Multiple jj commands on same repo | High latency, hangs | Slow or stuck responses | jj uses internal locking; restart server |
| Stale has_conflict flag | Change resolved but flag not updated | Empty conflict list on flagged change | Confusing UX | Trigger conflict re-check |
| File path with newlines | Rare but possible in jj | Parse failure | Missing conflict entry | Handle embedded newlines in parser |

## Verification

### API Integration Tests

1. **List conflicts on a change with conflicts** — Create a repo with a conflicted change, call `GET /api/repos/:owner/:repo/changes/:change_id/conflicts`, verify response has `items` array with entries containing `file_path` and `conflict_type`.
2. **List conflicts on a change with no conflicts** — Create a clean change. Call the endpoint. Verify `200` with `{ "items": [], "total": 0 }`.
3. **List conflicts returns items sorted by file_path** — Create a change with conflicts in files `z.ts`, `a.ts`, `m.ts`. Verify response order is `a.ts`, `m.ts`, `z.ts`.
4. **Conflict entry includes file_path field** — Verify every item has a non-empty `file_path` string.
5. **Conflict entry includes conflict_type field** — Verify every item has a non-empty `conflict_type` string.
6. **Conflict type matches jj output** — Create a 2-sided conflict. Verify `conflict_type` contains `"2-sided conflict"`.
7. **List conflicts with default pagination** — Create 60 conflicts. Call without pagination params. Verify exactly 50 items and `total: 60`.
8. **List conflicts with explicit per_page** — Call with `?per_page=10`. Verify exactly 10 items.
9. **List conflicts with per_page=1** — Verify exactly 1 item.
10. **List conflicts with per_page=100 (maximum valid size)** — Create 150 conflicts. Call with `?per_page=100`. Verify exactly 100 items.
11. **List conflicts with per_page=101 is clamped to 100** — Call with `?per_page=101`. Verify 100 items returned (validates maximum boundary).
12. **List conflicts with per_page=150 is clamped to 100** — Call with `?per_page=150`. Verify 100 items returned.
13. **List conflicts with per_page=0 returns 400** — Verify `400` with `"invalid per_page value"`.
14. **List conflicts with per_page=-1 returns 400** — Verify `400`.
15. **List conflicts with per_page=abc returns 400** — Verify `400` with `"invalid per_page value"`.
16. **Pagination across pages returns all conflicts** — Create 12 conflicts. Fetch with `?per_page=5&page=1`, then `page=2`, then `page=3`. Verify all 12 returned exactly once across pages.
17. **Page beyond available data returns empty items** — 12 conflicts, request `page=4&per_page=5`. Verify `items: []`.
18. **Page=0 treated as page 1** — Verify same results as `page=1`.
19. **Page=-1 treated as page 1** — Verify same results as `page=1`.
20. **List conflicts on nonexistent repository returns 404** — Verify `404` with `"repository not found"`.
21. **List conflicts on nonexistent change returns 404** — Verify `404` with `"change '<id>' not found"`.
22. **List conflicts with empty owner returns 400** — Verify `400` with `"owner is required"`.
23. **List conflicts with empty repo name returns 400** — Verify `400` with `"repository name is required"`.
24. **List conflicts with empty change_id returns 400** — Verify `400` with `"change_id is required"`.
25. **List conflicts with whitespace-only change_id returns 400** — Verify `400`.
26. **File path with spaces is returned correctly** — Create conflict in `src/my file.ts`. Verify path returned as-is.
27. **File path with Unicode characters is returned correctly** — Create conflict in `src/日本語.ts`. Verify correct encoding.
28. **File path with special characters (#, @, [], ())** — Verify path returned without escaping.
29. **Deeply nested file path is returned in full** — Create conflict in `a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/file.ts`. Verify full path.
30. **Maximum-length file path (4096 chars) is handled** — Create conflict with a file path at or near filesystem maximum. Verify returned correctly.
31. **File path exceeding 4096 characters returns appropriate error** — Verify server does not crash and returns a meaningful error or truncates gracefully.
32. **Anonymous user can list conflicts on public repo** — No auth headers. Verify `200`.
33. **Anonymous user cannot list conflicts on private repo** — No auth. Verify `404`.
34. **Authenticated user with read access on private repo** — Verify `200`.
35. **Response content-type is application/json** — Verify header.
36. **Rate limit headers are present** — Verify `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
37. **Request ID in response headers** — Verify `X-Request-ID`.
38. **Concurrent requests do not cause errors** — 10 concurrent requests for the same change all return `200`.
39. **Abbreviated change ID resolves correctly** — Use first 8 characters of change ID. Verify conflicts returned.
40. **Change with 100+ conflicted files paginates correctly** — Create a change with 100+ conflicts. Verify paginated response is correct and no timeout.
41. **Total count is consistent across pages** — Verify `total` field is the same on every page.
42. **Modify-delete conflict type is reported correctly** — Create a modify-delete conflict. Verify `conflict_type` is `"modify-delete conflict"`.

### CLI Integration Tests

43. **`codeplane change conflicts <id>` returns conflict file paths** — Verify output contains file paths, one per line.
44. **`codeplane change conflicts <id> --json` returns valid JSON** — Verify parseable JSON with `change_id` and `conflicts` array.
45. **`codeplane change conflicts <id>` on a clean change** — Verify no output, exit code `0`.
46. **`codeplane change conflicts <id> --json` on a clean change** — Verify `{ "change_id": "<id>", "conflicts": [] }`.
47. **`codeplane change conflicts <id>` exits with code 0** — Verify exit code on both conflicted and clean changes.
48. **`codeplane change conflicts` without id returns error** — Verify usage error.
49. **`codeplane change conflicts <id>` local mode** — Run inside jj working copy without `--repo`. Verify local jj output.
50. **`codeplane change conflicts <id> --repo owner/repo` uses API** — Verify remote fetch.
51. **File path with spaces in CLI output** — Verify correct rendering.
52. **Unicode file path in CLI output** — Verify correct rendering.
53. **CLI JSON output includes conflict_type when available** — Verify `conflict_type` field present in JSON mode for remote calls.
54. **`codeplane change conflicts <invalid-id>` returns error** — Verify non-zero exit code or descriptive error.
55. **`codeplane change conflicts <id>` with very long change ID (64 chars)** — Verify correct handling.
56. **`codeplane change conflicts <id>` with 1-char change ID prefix** — Verify jj resolves or returns appropriate error.

### Web UI E2E Tests (Playwright)

57. **Conflict section visible on conflicted change detail page** — Navigate to a conflicted change. Verify "Conflicts" section exists.
58. **Conflict section not visible on clean change detail page** — Navigate to a non-conflicted change. Verify no "Conflicts" section.
59. **Conflict count displayed in section header** — Verify "Conflicts (N files)" header.
60. **Each conflict row shows file path** — Verify file paths rendered.
61. **Each conflict row shows conflict type badge** — Verify conflict type visible (e.g., "2-sided").
62. **Clicking file path navigates to diff viewer** — Verify navigation to diff view.
63. **Warning icon (⚠) present in section header** — Verify icon rendered.
64. **Conflict section has warning color theme** — Verify amber/yellow border or background via computed styles.
65. **File paths use monospace font** — Verify CSS font-family.
66. **Multiple conflicts render in alphabetical order** — Verify sorted display.
67. **Public repo conflict list loads without auth** — Verify unauthenticated access works.
68. **Private repo returns 404 without auth** — Verify redirect/404.
69. **Error state shows retry option** — Simulate API failure. Verify error message with retry.
70. **Empty conflict state on a change flagged as conflicted** — Verify graceful handling message.
71. **Load more button appears when > 50 conflicts** — Verify pagination controls.

### TUI Tests

72. **Conflict section appears for conflicted change** — Verify section header visible.
73. **Conflict section absent for clean change** — Verify no section.
74. **File path and conflict type columns render at 120×40** — Verify both columns.
75. **Only file path at 80×24** — Verify no conflict type column.
76. **j/k navigates between conflict entries** — Verify selection highlight moves.
77. **Enter opens diff viewer for selected file** — Verify screen push.
78. **d opens diff viewer (alias)** — Verify same behavior as Enter.
79. **q returns to change detail** — Verify navigation back.
80. **Esc returns to change detail** — Verify navigation back.
81. **R triggers refresh** — Verify data reload.
82. **Empty state shows "No conflicts. All clear! ✓"** — Verify message.
83. **Error state shows "Press R to retry"** — Verify retry prompt.
84. **Resolution status icons render correctly** — Verify `✗` for unresolved and `✓` for resolved.

### Cross-Client Consistency Tests

85. **API and CLI return same conflict file paths** — Compare conflict file paths from API response and CLI `--json` output for the same change.
86. **API conflict count matches web UI conflict count** — Compare API `total` with web UI header count.
87. **All clients show same conflict type strings** — Verify web, CLI, and TUI all display identical `conflict_type` values.
88. **Pagination produces no duplicates across pages** — Fetch all pages from API, verify each conflict appears exactly once.
89. **API and CLI agree on conflict count for a clean change** — Both return zero/empty.
