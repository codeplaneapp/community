# JJ_CHANGE_LIST

Specification for JJ_CHANGE_LIST.

## High-Level User POV

Changes in Codeplane are the fundamental unit of work in jj. Unlike git commits, jj changes have **stable change IDs** that persist even when the underlying commit is rewritten, rebased, or amended. The **Change List** feature lets any user browsing a repository see every change in the repository's history, understand the metadata of each change, and quickly identify conflicts or empty changes.

When a developer opens a repository in Codeplane — whether through the web UI, the CLI, the TUI, or an editor integration — they can view the chronological list of changes in the repository. Each change shows its jj change ID, the underlying commit ID, the first line of the description, the author's name and email, a timestamp, whether the change contains conflicts, whether the change is empty, and which parent changes it descends from. This gives users complete visibility into the jj-native history of a repository without requiring them to think in git terms.

This feature is core to the jj-native workflow. Instead of presenting a flat commit log, the change list surfaces jj's own concepts directly — including conflict markers and empty-change indicators that have no equivalent in traditional git forges. Users can see changes made by teammates, identify which changes have unresolved conflicts, navigate to diffs and file listings, and use change IDs to create landing requests or start workspace sessions. For teams using stacked changes, the change list is the primary view for understanding the shape and state of work in progress.

The change list supports cursor-based pagination for repositories with extensive histories, and offers both human-readable and structured JSON output in the CLI. Anonymous users can list changes on public repositories without authentication, making change discovery seamless for open-source contributors.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/changes` returns a paginated list of changes for any accessible repository.
- [ ] The CLI command `codeplane change list` returns changes in both human-readable and JSON formats.
- [ ] The web UI displays a "Changes" tab within the repository view showing all changes with their metadata.
- [ ] The TUI displays a changes screen within the repository view with keyboard navigation.
- [ ] Editor integrations (VS Code, Neovim) provide change browsing via tree views and telescope pickers respectively.
- [ ] All clients converge on the same API and display consistent data.
- [ ] The feature is covered by integration and end-to-end tests across API, CLI, TUI, and web UI.

### Functional Constraints

- [ ] Each change entry must include: `change_id`, `commit_id`, `description`, `author_name`, `author_email`, `timestamp`, `has_conflict`, `is_empty`, `parent_change_ids`.
- [ ] Changes with conflicts must be visually distinguished (⚠ icon, conflict badge, or warning color) in all visual clients.
- [ ] Empty changes must be visually distinguished (∅ icon, dimmed text, or "empty" badge) in all visual clients.
- [ ] Changes must be sorted newest-first by default (reverse chronological).
- [ ] Repositories with no changes (freshly initialized, empty) must return an empty list, not an error.
- [ ] The `parent_change_ids` field must be a JSON array of strings. For root changes (no parents), it must be an empty array `[]`.
- [ ] The `description` field must contain the first line of the change description. Multi-line descriptions are truncated to the first line in the list view.
- [ ] The `timestamp` field must be an ISO 8601 string.

### Pagination Constraints

- [ ] The API must support cursor-based pagination with `cursor` and `limit` query parameters.
- [ ] The default page size must be 30.
- [ ] The maximum page size must be 100.
- [ ] A `limit` value of 0 or negative must return a `400 Bad Request` with message `"invalid limit value"`.
- [ ] A non-numeric `limit` value must return a `400 Bad Request` with message `"invalid limit value"`.
- [ ] If `limit` exceeds 100, it must be silently clamped to 100 (not rejected).
- [ ] The `next_cursor` field must be an empty string when there are no more results.
- [ ] Cursor values from a previous response must be accepted without modification to retrieve the next page.
- [ ] An invalid or expired cursor must return a `400 Bad Request` with message `"invalid cursor"`.

### Edge Cases

- [ ] Change descriptions containing special characters (quotes, backslashes, newlines, null bytes, emoji, Unicode) must be returned correctly in the API response.
- [ ] Change descriptions that are empty strings must be returned as `""`, not `null`.
- [ ] Changes with very long descriptions (up to 10,000 characters in the full description) must have their first line returned without truncation in the API response, provided the first line is under 1,000 characters.
- [ ] If a change's first-line description exceeds 1,000 characters, it must be truncated to 1,000 characters with a `…` suffix.
- [ ] Changes with multiple parents (merge changes) must list all parent change IDs in `parent_change_ids`.
- [ ] Changes whose parents have been garbage-collected should still appear in the list — `parent_change_ids` may reference change IDs that no longer resolve.
- [ ] If the repository path is invalid or the jj subprocess fails, the API must return a `500 Internal Server Error` with a descriptive message, not crash.
- [ ] If the `:owner` or `:repo` path parameter is empty or whitespace-only, the API must return `400 Bad Request`.
- [ ] Private repositories must not expose changes to unauthenticated users.
- [ ] A repository with exactly one change (the root) must return that single change.
- [ ] Change IDs must be full-length (not truncated) in API responses. Visual truncation is a client-side concern.
- [ ] Commit IDs must be full 40-character hex strings in API responses.
- [ ] The `has_conflict` field must accurately reflect the current conflict state of each change at the time of listing.
- [ ] The `is_empty` field must accurately reflect whether the change has any file modifications.

### Boundary Constraints

- [ ] Change ID format: lowercase hexadecimal string, typically 12+ characters (full jj change ID).
- [ ] Commit ID format: 40-character lowercase hexadecimal string.
- [ ] Description first-line maximum display length: 1,000 characters (truncated with `…` beyond this).
- [ ] Author name maximum length: 255 characters.
- [ ] Author email maximum length: 320 characters (per RFC 5321).
- [ ] Maximum number of `parent_change_ids` per change: no enforced limit (merge changes can have many parents).
- [ ] Maximum number of changes returned per page: 100.

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/changes`

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cursor` | string | `""` | Opaque cursor for pagination. Empty string for the first page. |
| `limit` | integer | `30` | Number of changes to return. Clamped to `[1, 100]`. |

**Success Response (200):**
```json
{
  "items": [
    {
      "change_id": "ksrmwumlqpyz",
      "commit_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "description": "Add user authentication middleware",
      "author_name": "Alice Chen",
      "author_email": "alice@example.com",
      "timestamp": "2026-03-20T14:30:00Z",
      "has_conflict": false,
      "is_empty": false,
      "parent_change_ids": ["xvtnmoklyqzr"]
    },
    {
      "change_id": "xvtnmoklyqzr",
      "commit_id": "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
      "description": "Initial project scaffold",
      "author_name": "Bob Smith",
      "author_email": "bob@example.com",
      "timestamp": "2026-03-19T09:15:00Z",
      "has_conflict": true,
      "is_empty": false,
      "parent_change_ids": []
    }
  ],
  "next_cursor": "eyJvZmZzZXQiOjMwfQ"
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Missing or empty `owner` param | `{ "message": "owner is required" }` |
| 400 | Missing or empty `repo` param | `{ "message": "repository name is required" }` |
| 400 | Invalid `limit` value | `{ "message": "invalid limit value" }` |
| 400 | Invalid `cursor` value | `{ "message": "invalid cursor" }` |
| 404 | Repository not found | `{ "message": "repository not found" }` |
| 500 | jj subprocess failure | `{ "message": "failed to list changes: <stderr>" }` |

### SDK Shape

The `RepoHostService` in `@codeplane/sdk` exposes:

```typescript
interface Change {
  change_id: string;
  commit_id: string;
  description: string;
  author_name: string;
  author_email: string;
  timestamp: string;
  has_conflict: boolean;
  is_empty: boolean;
  parent_change_ids: string[];
}

interface ChangeListResult {
  items: Change[];
  nextCursor: string;
}

listChanges(
  owner: string,
  repo: string,
  cursor?: string,
  limit?: number
): Promise<Result<ChangeListResult, APIError>>
```

The SDK also exposes database-backed queries via `changes_sql.ts`:

```typescript
listChangesByRepo(sql, {
  repositoryId: string,
  pageOffset: string,
  pageSize: string
}): Promise<ListChangesByRepoRow[]>

countChangesByRepo(sql, {
  repositoryId: string
}): Promise<CountChangesByRepoRow | null>
```

The `ListChangesByRepoRow` includes: `id`, `repositoryId`, `changeId`, `commitId`, `description`, `authorName`, `authorEmail`, `hasConflict`, `isEmpty`, `parentChangeIds`, `createdAt`, `updatedAt`.

The `@codeplane/ui-core` package exposes a `useChanges` hook:

```typescript
useChanges(owner: string, repo: string, options?: {
  limit?: number;
}): {
  data: Change[] | undefined;
  loading: boolean;
  error: Error | undefined;
  loadMore: () => void;
  hasMore: boolean;
  retry: () => void;
  totalLoaded: number;
}
```

### CLI Command

**Command:** `codeplane change list`

**Options:**
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--limit` | integer | `10` | Number of changes to display. |
| `--repo` | string | inferred | Repository in `OWNER/REPO` format. Inferred from working directory if omitted. |

**Human-readable output (default):**
```
ksrmwuml  Add user authentication middleware
xvtnmokl  ⚠ Initial project scaffold
qrstvwxy  ∅ (empty)
```

Each line shows the short change ID (8 characters), a conflict indicator (`⚠`) if `has_conflict` is true, an empty indicator (`∅`) if `is_empty` is true, and the first line of the description. If the description is empty, `"(no description)"` is shown.

If no changes exist:
```
No changes
```

**JSON output (`--json`):**
```json
[
  {
    "change_id": "ksrmwumlqpyz",
    "commit_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    "description": "Add user authentication middleware",
    "author_name": "Alice Chen",
    "author_email": "alice@example.com",
    "timestamp": "2026-03-20T14:30:00Z",
    "has_conflict": false,
    "is_empty": false,
    "parent_change_ids": ["xvtnmoklyqzr"]
  }
]
```

**Local-only behavior:** When run inside a jj working copy without `--repo`, the CLI calls `jj log` locally rather than hitting the API. This means the CLI works offline in daemon/local-first mode.

### Web UI Design

**Location:** Repository view → "Changes" tab (accessible at `/:owner/:repo/changes`)

**Layout:**
- A page header showing the repository name and "Changes" as the active tab.
- A count badge on the tab showing the total number of changes loaded.
- A search/filter input at the top of the list to filter changes by description, change ID, or author (client-side).
- A sort toggle allowing the user to switch between newest-first and oldest-first.
- Each change row displays:
  - Change ID (truncated to 12 characters, monospace font, primary accent color, clickable — navigates to change detail view).
  - A `⚠` conflict icon (amber/warning color) if `has_conflict` is true. Hovering shows tooltip "This change contains conflicts".
  - A `∅` empty icon (muted color) if `is_empty` is true. Hovering shows tooltip "This change is empty".
  - Description first line (primary text, truncated with ellipsis if it exceeds the available width).
  - Author name (secondary text).
  - Relative timestamp (e.g., "2 hours ago", secondary/muted text). Hovering shows the full ISO timestamp.
  - A "copy" button (clipboard icon) that copies the full change ID to the clipboard.
- If no changes exist, show an empty state illustration with text: "No changes yet" and a brief description: "Changes appear here as you make commits in your jj repository."

**Interactions:**
- Clicking a change ID or the change row navigates to the change detail view at `/:owner/:repo/changes/:change_id`.
- Clicking an author name navigates to the user profile if the author is a Codeplane user.
- The search filter updates the displayed list in real time as the user types.
- Pagination loads additional changes on scroll (infinite scroll triggered at 80% scroll depth) or via a "Load more" button at the bottom.
- The conflict icon is clickable and navigates to the change's conflict list.

### TUI UI Design

**Location:** Repository screen → Changes tab (tab #2, keyboard shortcut: `c` from the repo screen)

**Layout (Standard 120-column breakpoint):**
- A table with columns: `Change ID` (12 chars, monospace), `Status` (2 chars: `⚠`/`∅`/` `), `Description` (flexible width), `Author` (20 chars), `Time` (relative).
- Rows are selectable via `j`/`k` or arrow keys.
- Conflict changes are rendered in amber/yellow.
- Empty changes are rendered in dimmed/muted color.
- A status bar at the bottom showing: `{n} changes · [Enter] Detail · [d] Diff · [/] Filter · [o] Sort · [q] Back`

**Layout (Minimum 80-column breakpoint):**
- Columns: `Change ID` (8 chars), `Status` (2 chars), `Description` (flexible), `Time` (short relative).
- Author column is hidden.

**Layout (Large 200+ column breakpoint):**
- All columns visible with full widths.
- Additional column: `Commit ID` (8 chars, muted).
- Additional column: `Parents` (comma-separated short IDs).

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `j` / `↓` | Move selection down |
| `k` / `↑` | Move selection up |
| `Enter` | View the selected change's detail |
| `d` | View the selected change's diff |
| `f` | View the selected change's file list |
| `/` | Activate filter mode (type to filter by description or change ID) |
| `Esc` | Clear filter / exit filter mode |
| `y` | Copy selected change's full change ID to clipboard |
| `o` | Cycle sort order: newest-first → oldest-first → author A→Z |
| `q` | Return to previous screen |
| `g` | Go to top |
| `G` | Go to bottom |

**Empty state:** Display centered text "No changes" with a hint about making commits.

**Pagination:** Cursor-based, 50 items per page. Automatically loads more at 80% scroll depth.

### VS Code Extension

**Tree View:** A "Changes" section in the Codeplane sidebar tree view.

- Each change renders as a tree item with the short change ID (8 chars) as the label and the description first line as the description text.
- Changes with conflicts show a warning icon (⚠) as the tree item icon.
- Empty changes show a dimmed icon (∅).
- Clicking a change opens a quickpick showing the change detail, or navigates to the webview change detail.
- A refresh button at the top of the tree view reloads the change list.
- Context menu on each change: "Copy Change ID", "View Diff", "View Files", "Create Landing Request".
- The tree view shows the most recent 50 changes by default.

### Neovim Plugin

**Telescope Picker:** `:Codeplane changes` launches a Telescope picker.

- Each entry shows: `{short_change_id} {description}` with conflict/empty indicators.
- Changes with conflicts are prefixed with `⚠`.
- Empty changes are prefixed with `∅`.
- `<CR>` on a selected change opens the change detail in a split.
- `<C-d>` opens the diff for the selected change.
- `<C-y>` copies the change ID to the system clipboard.
- The picker supports fuzzy filtering by change ID or description.

**Command:** `:Codeplane changes` — lists changes in a floating Telescope window.

### Documentation

The following end-user documentation should be written:

1. **API Reference — List Changes**: Document the `GET /api/repos/:owner/:repo/changes` endpoint with request/response examples, pagination behavior, error codes, and field descriptions.
2. **CLI Reference — `change list`**: Document the command, its flags (`--limit`, `--repo`), output formats (human-readable and JSON), and local-vs-remote behavior.
3. **User Guide — Understanding Changes**: A conceptual guide explaining what jj changes are, how they differ from git commits (stable IDs, conflict-aware, empty-change-aware), and how to use them in Codeplane across web, CLI, TUI, and editors.
4. **TUI Keyboard Reference**: Add the changes screen shortcuts to the TUI keyboard help overlay.
5. **Editor Integration Guide — Changes**: Document how to browse changes in VS Code (tree view, context menu) and Neovim (Telescope picker, keybindings).

## Permissions & Security

### Authorization Model

| Role | Can List Changes? | Notes |
|------|-------------------|-------|
| **Anonymous** | ✅ on public repos | Read-only access to change metadata |
| **Anonymous** | ❌ on private repos | Returns `404` (not `403`) to avoid repo existence disclosure |
| **Read-Only Member** | ✅ | Full change list access |
| **Member** | ✅ | Full change list access |
| **Admin** | ✅ | Full change list access |
| **Owner** | ✅ | Full change list access |

Note: The change list is strictly a read-only operation. No write permissions are required.

### Rate Limiting

| Context | Limit | Window |
|---------|-------|--------|
| Authenticated user | 300 requests | per minute |
| Anonymous / unauthenticated | 60 requests | per minute |
| Per-repository cap | 600 requests | per minute (across all users) |

Rate limit responses must use `429 Too Many Requests` with `Retry-After` header and standard rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`).

### Data Privacy

- Change listing exposes author names and email addresses. These are inherently part of the repository's jj/git metadata and are visible to anyone who can clone the repository. This is consistent with how all forges handle commit author information.
- On private repositories, change listing is gated behind repository read access, which protects author PII from unauthorized access.
- Change descriptions could contain sensitive information (e.g., security fix details, customer names). This is a user responsibility, not a platform concern, but admin audit logs should capture who accessed change lists on private repositories.
- The `commit_id` and `change_id` are repository-internal identifiers and are not PII.
- No additional PII beyond what is already in the repository's history is exposed by this endpoint.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ChangeListViewed` | User views change list in any client | `repo_id`, `owner`, `repo_name`, `client` (web/cli/tui/vscode/nvim), `change_count`, `is_authenticated`, `page_number`, `requested_limit`, `has_filter`, `sort_order` |
| `ChangeListFiltered` | User applies a filter to the change list | `repo_id`, `client`, `filter_query_length`, `results_count`, `filter_type` (description/change_id/author) |
| `ChangeCopied` | User copies a change ID from the list | `repo_id`, `client`, `change_id` |
| `ChangeNavigated` | User navigates from change list to change detail | `repo_id`, `client`, `change_id`, `has_conflict`, `is_empty` |
| `ChangeListPaginated` | User loads a subsequent page of changes | `repo_id`, `client`, `page_number`, `cursor_used`, `items_loaded` |
| `ChangeDiffNavigated` | User navigates from change list directly to a diff view | `repo_id`, `client`, `change_id` |

### Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Change list load success rate** | `ChangeListViewed` events with `change_count >= 0` / total attempts | > 99.5% |
| **Change → Detail navigation rate** | `ChangeNavigated` / `ChangeListViewed` | > 20% (indicates users find the list useful for navigation) |
| **Change → Diff navigation rate** | `ChangeDiffNavigated` / `ChangeListViewed` | > 10% (indicates users review diffs from the change list) |
| **Pagination depth** | Average `page_number` across `ChangeListPaginated` events | 1.5–3.0 (users browse beyond the first page but not excessively) |
| **Multi-client usage** | Unique users who view changes from 2+ different clients in a 7-day window | Increasing over time |
| **Empty state rate** | `ChangeListViewed` with `change_count == 0` / total views | < 10% (lower than bookmarks since most repos have at least one change) |
| **Conflict visibility rate** | `ChangeListViewed` where at least one change has `has_conflict=true` / total views | Tracking only (no target — this indicates repo health) |
| **Filter usage rate** | `ChangeListFiltered` / `ChangeListViewed` | > 5% (indicates search is discoverable and useful) |

## Observability

### Logging

| Log Point | Level | Structured Context | When |
|-----------|-------|--------------------|------|
| Change list request received | `INFO` | `{ owner, repo, cursor, limit, user_id?, request_id }` | Every request |
| Change list response | `DEBUG` | `{ owner, repo, change_count, has_next_page, response_time_ms, request_id }` | Successful response |
| jj subprocess started | `DEBUG` | `{ owner, repo, command: "jj log", template_version, request_id }` | Before exec |
| jj subprocess completed | `DEBUG` | `{ owner, repo, exit_code, stdout_bytes, duration_ms, request_id }` | After exec |
| jj subprocess failed | `ERROR` | `{ owner, repo, exit_code, stderr, duration_ms, request_id }` | Non-zero exit |
| Change output parse failure | `ERROR` | `{ owner, repo, raw_output_length, parse_error, request_id }` | Template output cannot be parsed |
| Repository not found | `WARN` | `{ owner, repo, request_id }` | 404 response |
| Pagination parse error | `WARN` | `{ owner, repo, raw_cursor, raw_limit, request_id }` | Invalid cursor or limit param |
| Rate limit exceeded | `WARN` | `{ owner, repo, user_id?, ip, request_id }` | 429 response |
| Large result set | `INFO` | `{ owner, repo, total_changes, request_id }` | When a repo returns more than 500 changes total |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_change_list_requests_total` | Counter | `owner`, `repo`, `status_code` | Total change list requests |
| `codeplane_change_list_duration_seconds` | Histogram | `owner`, `repo` | Request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0) |
| `codeplane_change_list_items_returned` | Histogram | — | Number of changes returned per request (buckets: 0, 1, 5, 10, 25, 50, 100) |
| `codeplane_change_list_conflicts_count` | Histogram | — | Number of changes with `has_conflict=true` per response (buckets: 0, 1, 5, 10, 25) |
| `codeplane_jj_subprocess_duration_seconds` | Histogram | `command`, `exit_code` | jj subprocess execution time (shared with other jj operations) |
| `codeplane_jj_subprocess_errors_total` | Counter | `command`, `error_type` | jj subprocess failures (shared with other jj operations) |
| `codeplane_change_list_parse_errors_total` | Counter | `owner`, `repo` | Template output parsing failures |

### Alerts

#### Alert: High Change List Error Rate
- **Condition:** `rate(codeplane_change_list_requests_total{status_code=~"5.."}[5m]) / rate(codeplane_change_list_requests_total[5m]) > 0.05`
- **Severity:** Warning (> 5%), Critical (> 20%)
- **Runbook:**
  1. Check `codeplane_jj_subprocess_errors_total{command="change_list"}` — if rising, the jj binary may be unavailable or crashing.
  2. SSH into the server and verify `jj --version` works.
  3. Check disk space on the repository storage volume (`df -h`). jj operations fail if the filesystem is full.
  4. Check server logs for `"failed to list changes"` entries and inspect the stderr content.
  5. If the error is specific to one repository, check if that repository's `.jj` directory is corrupted. Run `jj debug operation log` in the repo path.
  6. If widespread, check if a jj upgrade introduced a breaking template syntax change. Compare the `CHANGE_TEMPLATE` string in `repohost.ts` against the installed jj version's template docs.
  7. Check `codeplane_change_list_parse_errors_total` — if parsing is failing, jj may be outputting in an unexpected format after an upgrade.

#### Alert: High Change List Latency
- **Condition:** `histogram_quantile(0.95, rate(codeplane_change_list_duration_seconds_bucket[5m])) > 3.0`
- **Severity:** Warning (p95 > 3s), Critical (p95 > 8s)
- **Runbook:**
  1. Check `codeplane_jj_subprocess_duration_seconds{command="change_list"}` — if jj subprocess time is high, the issue is in jj, not the server.
  2. Check system load (`uptime`, `top`) on the server. High CPU may indicate resource contention.
  3. Check if a specific repository has an unusually large history. Repositories with >10,000 changes may cause jj to be slow with full log traversal.
  4. Check I/O wait (`iostat`). Repository operations are I/O-bound.
  5. Consider whether the repository storage has moved to a slower disk tier.
  6. If the issue is isolated to one repo, try running `jj log --limit 30` manually in the affected repository to reproduce.
  7. For large repos, consider whether the `--limit` flag is being properly passed to `jj log` to avoid scanning the full history.

#### Alert: jj Subprocess Crash Spike
- **Condition:** `rate(codeplane_jj_subprocess_errors_total{command="change_list"}[5m]) > 5`
- **Severity:** Critical
- **Runbook:**
  1. Check if jj is installed and accessible: `which jj && jj --version`.
  2. Inspect recent server logs for the full stderr output of failed jj commands.
  3. Check if the jj binary was recently updated. Template syntax changes across jj versions can cause parse failures.
  4. Verify the field separator characters (ASCII 0x1f Unit Separator, 0x1e Record Separator) are not being mangled by locale or encoding settings.
  5. If jj segfaults, capture a core dump and file an upstream jj issue.
  6. As a temporary mitigation, consider pinning the jj version in the deployment.

#### Alert: Change List Parse Error Spike
- **Condition:** `rate(codeplane_change_list_parse_errors_total[5m]) > 1`
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `"Change output parse failure"` entries. The `raw_output_length` and `parse_error` fields will indicate what went wrong.
  2. Manually run the jj template command against the affected repository to see the raw output.
  3. Verify the `CHANGE_TEMPLATE` in `repohost.ts` uses field/record separators correctly.
  4. Check if a change description contains the ASCII separator characters (0x1f, 0x1e) — this would break parsing. If so, the template or parser needs to handle escaping.
  5. File a bug and add a test case for the specific malformed output.

### Error Cases and Failure Modes

| Failure Mode | Cause | Detection | User Impact | Recovery |
|--------------|-------|-----------|-------------|----------|
| jj binary not found | jj not installed or not in PATH | Subprocess exec error | 500 error on all change list requests | Install jj or fix PATH |
| jj template syntax error | jj version incompatibility | Non-zero exit code with syntax error in stderr | 500 error on all repos | Update template string to match jj version |
| Repository path missing | Repository deleted or storage unmounted | `ensureRepo` returns error | 404 for specific repo | Restore storage or remove stale repo record |
| Output parsing failure | Unexpected jj output format (e.g., description contains separator chars) | Changes array empty despite repo having changes, or parse error logged | Silent data loss (empty list) or 500 | Update parsing logic to handle escaping |
| Disk full | Storage exhausted | jj operations fail | 500 errors | Free disk space |
| Process timeout | jj hangs on large repo with deep history | Server-side timeout (10s) | 504 or 500 | Kill jj process; investigate repo health; ensure --limit is passed |
| Corrupt .jj directory | File system corruption, interrupted operation | jj returns error about workspace state | 500 for specific repo | Run `jj workspace recover` or restore from backup |
| Memory exhaustion | Repository with enormous history loaded without pagination | OOM in jj subprocess | 500 or server crash | Ensure --limit is always passed to jj log; add subprocess memory limit |

## Verification

### API Integration Tests

1. **List changes on a repository with changes** — Create a repo, make several commits, call `GET /api/repos/:owner/:repo/changes`, verify response has `items` array with changes containing all 9 required fields (`change_id`, `commit_id`, `description`, `author_name`, `author_email`, `timestamp`, `has_conflict`, `is_empty`, `parent_change_ids`).
2. **List changes returns newest-first order** — Create 3 changes in sequence. Verify the response items are ordered with the newest timestamp first.
3. **List changes on empty repository** — Create a repo with no commits. Call the endpoint. Verify 200 with `{ "items": [], "next_cursor": "" }`.
4. **List changes respects default limit of 30** — Populate a repo with 50 changes. Call the endpoint without `limit`. Verify exactly 30 items returned and `next_cursor` is non-empty.
5. **List changes with explicit limit** — Call with `?limit=5`. Verify exactly 5 items returned.
6. **List changes with limit=1** — Verify exactly 1 item returned (the most recent change).
7. **List changes with limit=100 (maximum)** — Populate a repo with 150 changes. Call with `?limit=100`. Verify exactly 100 items returned.
8. **List changes with limit=150 (exceeds max) is clamped to 100** — Call with `?limit=150`. Verify 100 items returned (not 150, not error).
9. **List changes with limit=0 returns 400** — Call with `?limit=0`. Verify `400` with `"invalid limit value"`.
10. **List changes with limit=-1 returns 400** — Call with `?limit=-1`. Verify `400`.
11. **List changes with limit=abc returns 400** — Call with `?limit=abc`. Verify `400` with `"invalid limit value"`.
12. **Cursor-based pagination returns all changes across pages** — Create 10 changes. Fetch with `?limit=3`, then follow `next_cursor` until empty. Verify all 10 changes are returned exactly once, in consistent order.
13. **List changes on nonexistent repository returns 404** — Call with a repo that does not exist. Verify `404`.
14. **List changes with empty owner returns 400** — Call `GET /api/repos/%20/myrepo/changes`. Verify `400` with `"owner is required"`.
15. **List changes with empty repo name returns 400** — Call `GET /api/repos/myowner/%20/changes`. Verify `400` with `"repository name is required"`.
16. **Change with conflict shows has_conflict=true** — Create a change that introduces a conflict. Verify `has_conflict` is `true` in the response.
17. **Change without conflict shows has_conflict=false** — Verify a normal change has `has_conflict` as `false`.
18. **Empty change shows is_empty=true** — Create an empty change (no file modifications). Verify `is_empty` is `true`.
19. **Non-empty change shows is_empty=false** — Verify a change with file modifications has `is_empty` as `false`.
20. **Change with no description returns empty string** — Create a change with no description. Verify `description` is `""`, not `null` or `undefined`.
21. **Change with Unicode description is returned correctly** — Create a change with emoji and CJK characters in the description. Verify the API returns them without corruption.
22. **Change with special characters in description** — Create a change with quotes, backslashes, angle brackets, and ampersands in the description. Verify correct JSON escaping.
23. **Change with multi-line description returns first line only** — Create a change with a multi-line description. Verify the API returns only the first line.
24. **Change with very long description (1000 chars first line)** — Create a change where the first line is exactly 1,000 characters. Verify it is returned without truncation.
25. **Change with description first line exceeding 1000 chars is truncated** — Create a change where the first line is 1,500 characters. Verify it is truncated to 1,000 characters followed by `…`.
26. **parent_change_ids contains correct parent references** — Create a linear chain of 3 changes. Verify each change's `parent_change_ids` correctly references its parent.
27. **Root change has empty parent_change_ids** — Verify the oldest change in the repo has `parent_change_ids: []`.
28. **Merge change has multiple parent_change_ids** — Create a merge change with 2 parents. Verify `parent_change_ids` contains both parent IDs.
29. **Anonymous user can list changes on public repo** — Do not send auth headers. Call the endpoint on a public repo. Verify `200`.
30. **Anonymous user cannot list changes on private repo** — Do not send auth headers. Call the endpoint on a private repo. Verify `404`.
31. **Authenticated user with read access can list changes on private repo** — Verify `200`.
32. **Response content-type is application/json** — Verify the `Content-Type` header is `application/json`.
33. **change_id is full-length (not truncated)** — Verify the `change_id` field is the full jj change ID, not a short form.
34. **commit_id is 40-character hex string** — Verify the `commit_id` field matches the regex `^[0-9a-f]{40}$`.
35. **timestamp is valid ISO 8601** — Verify the `timestamp` field can be parsed as a valid ISO 8601 datetime.
36. **Rate limit headers are present** — Verify `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers exist.
37. **Concurrent requests to the same repo do not cause errors** — Send 10 concurrent change list requests. Verify all return `200` with consistent data.
38. **Request ID is present in response headers** — Verify the response includes an `X-Request-ID` header.
39. **Invalid cursor returns 400** — Call with `?cursor=not-a-valid-cursor`. Verify `400` with `"invalid cursor"`.
40. **Pagination cursor from one repo does not work on another repo** — Use a cursor from repo A on repo B. Verify the request either returns `400` or returns correct data for repo B (does not leak data).
41. **author_email with maximum length (320 chars) is returned correctly** — Create a change with a 320-character email. Verify it is returned without truncation.
42. **author_name with maximum length (255 chars) is returned correctly** — Create a change with a 255-character author name. Verify it is returned without truncation.

### CLI Integration Tests

43. **`codeplane change list` returns changes as plain text** — Run the command in a repo with changes. Verify output contains short change IDs and descriptions, one per line.
44. **`codeplane change list --json` returns valid JSON array** — Verify the output is a valid JSON array of change objects with all 9 required fields.
45. **`codeplane change list` on empty repo returns "No changes"** — Run in a repo with no changes. Verify output is `"No changes"`.
46. **`codeplane change list --json` on empty repo returns `[]`** — Verify empty JSON array.
47. **`codeplane change list` exits with code 0 on success** — Verify exit code is `0`.
48. **`codeplane change list --limit 5` returns at most 5 changes** — Verify output contains at most 5 lines of changes.
49. **`codeplane change list` default limit is 10** — Create 15 changes. Run without `--limit`. Verify exactly 10 changes are shown.
50. **`codeplane change list` works without auth on public repo** — Pass empty token. Verify exit code `0`.
51. **`codeplane change list` on nonexistent repo fails** — Verify non-zero exit code with error message.
52. **`codeplane change list` local mode** — Run inside a jj working copy without `--repo`. Verify it calls local jj and returns changes.
53. **`codeplane change list` shows conflict indicator** — Create a conflicting change. Verify `⚠` appears in the output.
54. **`codeplane change list` shows empty indicator** — Create an empty change. Verify `∅` appears in the output.
55. **`codeplane change list` handles descriptions with special characters** — Create changes with quotes, backslashes, and emoji. Verify they appear correctly in both plain and JSON output.
56. **`codeplane change list` shows "(no description)" for changes without descriptions** — Create a change with no description. Verify `"(no description)"` in plain text output.

### Web UI E2E Tests (Playwright)

57. **Changes tab is visible on repository page** — Navigate to `/:owner/:repo`. Verify a "Changes" tab exists.
58. **Clicking Changes tab shows change list** — Click the tab. Verify change entries are rendered.
59. **Each change row shows change ID, description, author, and timestamp** — Verify all four data points are visible for each row.
60. **Change with conflict shows conflict icon** — Create a repo with a conflicting change. Verify the `⚠` icon is visible on that row.
61. **Change with empty state shows empty icon** — Create a repo with an empty change. Verify the `∅` icon is visible.
62. **Empty repo shows empty state message** — Navigate to a repo with no changes. Verify "No changes yet" message.
63. **Filter input filters changes by description** — Type a partial description in the filter. Verify only matching changes are shown.
64. **Filter input filters changes by change ID** — Type a partial change ID. Verify only the matching change is shown.
65. **Clicking change ID navigates to change detail** — Click a change ID link. Verify navigation to `/:owner/:repo/changes/:change_id`.
66. **Copy button copies change ID to clipboard** — Click the copy button. Verify clipboard content matches the full change ID.
67. **Pagination loads more changes** — On a repo with many changes, scroll to the bottom. Verify additional changes appear.
68. **Sort toggle switches between newest-first and oldest-first** — Click the sort toggle. Verify the order reverses.
69. **Changes page loads without authentication on public repo** — Open the changes page in an unauthenticated browser session. Verify it loads.
70. **Changes page shows 404 for private repo without auth** — Open a private repo's changes page without auth. Verify redirect to login or 404 page.
71. **Conflict icon tooltip shows correct text on hover** — Hover over a `⚠` icon. Verify tooltip says "This change contains conflicts".
72. **Timestamp shows relative time** — Verify timestamps display as relative (e.g., "2 hours ago").
73. **Timestamp hover shows full ISO timestamp** — Hover over a timestamp. Verify full ISO datetime in tooltip.
74. **Change count badge on tab shows correct count** — Verify the badge number matches the number of loaded change rows.

### TUI Tests

75. **Changes screen renders table with correct columns** — Open the changes screen. Verify columns include Change ID, Status, Description, Author, Time.
76. **Arrow keys move selection** — Press `j` and `k`. Verify the selection highlight moves.
77. **Enter navigates to change detail** — Press Enter on a selected change. Verify the change detail screen opens.
78. **`d` navigates to diff** — Press `d` on a selected change. Verify the diff view opens.
79. **`/` activates filter mode** — Press `/`. Verify filter input appears. Type a query. Verify list is filtered.
80. **`Esc` clears filter** — After filtering, press Esc. Verify filter is cleared and all changes reappear.
81. **`q` returns to previous screen** — Press `q`. Verify the TUI navigates back.
82. **`y` copies change ID** — Press `y` on a selected change. Verify clipboard content.
83. **`o` cycles sort order** — Press `o` multiple times. Verify sort order changes (newest → oldest → author).
84. **Empty state displays message** — Open changes on an empty repo. Verify "No changes" text.
85. **`g` jumps to top, `G` jumps to bottom** — In a long list, press `G` then `g`. Verify selection position.
86. **Conflict changes shown in amber/warning color** — Verify conflicted changes have distinct coloring.
87. **Empty changes shown in muted color** — Verify empty changes have dimmed styling.
88. **Minimum breakpoint hides author column** — Resize terminal to 80 columns. Verify author column is not shown.
89. **Large breakpoint shows commit ID and parents** — Resize terminal to 200+ columns. Verify additional columns appear.

### Cross-Client Consistency Tests

90. **API and CLI return the same change data** — For the same repo, call the API and the CLI with `--json`. Compare the returned change IDs, commit IDs, descriptions, and conflict/empty flags. They must match.
91. **API and Web UI display the same changes** — Compare API JSON response with changes visible in the web UI. All change IDs, descriptions, and status indicators must match.
92. **API response change_id matches jj CLI output** — Run `jj log` locally on the repo and compare change IDs with the API response. They must match.
93. **Pagination produces consistent results between API and CLI** — List all changes via API pagination and via CLI. Verify the total set of changes is identical.
94. **Conflict status is consistent across API, CLI, and Web UI** — For a change with conflicts, verify all three surfaces report it as conflicting.
