# JJ_BOOKMARK_LIST

Specification for JJ_BOOKMARK_LIST.

## High-Level User POV

Bookmarks in Codeplane are the jj-native equivalent of branches. They are named pointers that reference a specific change in a repository's history. The **Bookmark List** feature lets any user browsing a repository see every bookmark that exists, understand which change each bookmark points to, and quickly identify whether a bookmark is tracking a remote.

When a developer opens a repository in Codeplane — whether through the web UI, the CLI, the TUI, or an editor integration — they can view the complete list of bookmarks. Each bookmark shows its name, the jj change ID it targets, the underlying commit ID, and whether it is tracking a remote bookmark. The repository's default bookmark (typically `main`) is visually distinguished so users can immediately orient themselves.

This feature is fundamental to the jj-native workflow. Instead of forcing users into a git-branch mental model, bookmark listing surfaces jj's own concepts directly. Users can see bookmarks created by teammates, identify which change a bookmark resolves to, and use that information to navigate to diffs, create landing requests, or start workspace sessions. For teams using stacked changes, the bookmark list provides the anchor points that define where stacks begin and end.

The bookmark list supports pagination for repositories with many bookmarks, and offers both human-readable and structured JSON output in the CLI. Anonymous users can list bookmarks on public repositories without authentication, making bookmark discovery seamless for open-source contributors.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/bookmarks` returns a paginated list of bookmarks for any accessible repository.
- [ ] The CLI command `codeplane bookmark list` returns bookmarks in both human-readable and JSON formats.
- [ ] The web UI displays a bookmarks tab within the repository view showing all bookmarks with their metadata.
- [ ] The TUI displays a bookmarks screen within the repository view with keyboard navigation.
- [ ] Editor integrations (VS Code, Neovim) provide bookmark browsing via tree views and telescope pickers respectively.
- [ ] All clients converge on the same API and display consistent data.
- [ ] The feature is covered by integration and end-to-end tests across API, CLI, TUI, and web UI.

### Functional Constraints

- [ ] Each bookmark entry must include: `name`, `target_change_id`, `target_commit_id`, `is_tracking_remote`.
- [ ] The default bookmark must be visually distinguished (star icon, badge, or label) in all visual clients.
- [ ] Bookmarks must be sorted alphabetically by name (ascending) by default.
- [ ] Empty repositories (no bookmarks) must return an empty list, not an error.
- [ ] Repositories that have never been pushed to must return an empty bookmark list gracefully.

### Pagination Constraints

- [ ] The API must support cursor-based pagination with `cursor` and `limit` query parameters.
- [ ] The default page size must be 30.
- [ ] The maximum page size must be 100.
- [ ] A `limit` value of 0 or negative must return a `400 Bad Request` with message `"invalid limit value"`.
- [ ] A non-numeric `limit` value must return a `400 Bad Request` with message `"invalid limit value"`.
- [ ] If `limit` exceeds 100, it must be silently clamped to 100 (not rejected).
- [ ] The `next_cursor` field must be an empty string when there are no more results.

### Edge Cases

- [ ] Bookmark names containing `/` (e.g., `release/v1.0`, `feature/my-feature`) must be listed correctly.
- [ ] Bookmark names containing Unicode characters must be listed correctly.
- [ ] Bookmark names that are very long (up to 255 characters) must be handled without truncation in the API response.
- [ ] Bookmark names longer than 255 characters must be rejected at creation time (not a listing concern, but listing must not break if one exists).
- [ ] A bookmark whose target change has been garbage-collected or is otherwise unresolvable should still appear in the list with the best available metadata (empty commit_id is acceptable).
- [ ] Bookmarks tracking multiple remotes (e.g., `origin` and `upstream`) must report `is_tracking_remote: true`.
- [ ] If the repository path is invalid or the jj subprocess fails, the API must return a `500 Internal Server Error` with a descriptive message, not crash.
- [ ] If the `:owner` or `:repo` path parameter is empty or whitespace-only, the API must return `400 Bad Request`.
- [ ] Private repositories must not expose bookmarks to unauthenticated users.

### Boundary Constraints

- [ ] Bookmark name maximum length: 255 characters.
- [ ] Allowed bookmark name characters: alphanumerics, `-`, `_`, `/`, `.` (matching jj bookmark naming rules).
- [ ] Bookmark names must not start or end with `/` or `.`.
- [ ] Bookmark names must not contain consecutive `/` characters.
- [ ] Maximum number of bookmarks returned per page: 100.

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/bookmarks`

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cursor` | string | `""` | Opaque cursor for pagination. Empty string for the first page. |
| `limit` | integer | `30` | Number of bookmarks to return. Clamped to `[1, 100]`. |

**Success Response (200):**
```json
{
  "items": [
    {
      "name": "main",
      "target_change_id": "ksrmwumlqpyz",
      "target_commit_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "is_tracking_remote": false
    },
    {
      "name": "release/v1.0",
      "target_change_id": "xvtnmoklyqzr",
      "target_commit_id": "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
      "is_tracking_remote": true
    }
  ],
  "next_cursor": ""
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Missing or empty `owner` param | `{ "message": "owner is required" }` |
| 400 | Missing or empty `repo` param | `{ "message": "repository name is required" }` |
| 400 | Invalid `limit` value | `{ "message": "invalid limit value" }` |
| 404 | Repository not found | `{ "message": "repository not found" }` |
| 500 | jj subprocess failure | `{ "message": "failed to list bookmarks: <stderr>" }` |

### SDK Shape

The `RepoHostService` in `@codeplane/sdk` exposes:

```typescript
interface Bookmark {
  name: string;
  target_change_id: string;
  target_commit_id: string;
  is_tracking_remote: boolean;
}

interface BookmarkListResult {
  items: Bookmark[];
  nextCursor: string;
}

listBookmarks(
  owner: string,
  repo: string,
  cursor?: string,
  limit?: number
): Promise<Result<BookmarkListResult, APIError>>
```

The SDK also exposes database-backed queries via `bookmarks_sql.ts`:

```typescript
listBookmarksByRepo(sql, {
  repositoryId: string,
  pageOffset: string,
  pageSize: string
}): Promise<ListBookmarksByRepoRow[]>
```

The `ListBookmarksByRepoRow` includes: `id`, `repositoryId`, `name`, `targetChangeId`, `isDefault`, `createdAt`, `updatedAt`.

### CLI Command

**Command:** `codeplane bookmark list`

**Options:**
| Flag | Type | Description |
|------|------|-------------|
| `--repo` | string | Repository in `OWNER/REPO` format. Inferred from working directory if omitted. |

**Human-readable output (default):**
```
main ksrmwumlqpyz
release/v1.0 xvtnmoklyqzr
```

If no bookmarks exist:
```
No bookmarks
```

**JSON output (`--json`):**
```json
[
  {
    "name": "main",
    "target_change_id": "ksrmwumlqpyz",
    "target_commit_id": "a1b2c3d4e5f6..."
  }
]
```

**Local-only behavior:** When run inside a jj working copy without `--repo`, the CLI calls `jj bookmark list` locally rather than hitting the API. This means the CLI works offline in daemon/local-first mode.

### Web UI Design

**Location:** Repository view → "Bookmarks" tab (accessible at `/:owner/:repo/bookmarks`)

**Layout:**
- A page header showing the repository name and "Bookmarks" as the active tab.
- A count badge on the tab showing the total number of bookmarks.
- A search/filter input at the top of the list to filter bookmarks by name substring (client-side).
- Each bookmark row displays:
  - Bookmark name (monospace font, primary text).
  - A ★ star icon or "default" badge next to the repository's default bookmark.
  - A "tracking" badge for bookmarks where `is_tracking_remote` is true.
  - The target change ID (truncated to 12 characters, monospace, secondary text, clickable — links to the change detail view).
  - The target commit ID (truncated to 8 characters, monospace, muted text).
  - A "copy" button that copies the full change ID to the clipboard.
- If no bookmarks exist, show an empty state illustration with text: "No bookmarks yet" and a brief description: "Bookmarks are jj's named pointers to changes. Push changes to create bookmarks."

**Interactions:**
- Clicking a bookmark name navigates to a bookmark detail view showing the change it points to.
- Clicking the change ID navigates to the change detail view.
- The search filter updates the displayed list in real time as the user types.
- Pagination loads additional bookmarks on scroll (infinite scroll) or via a "Load more" button.

### TUI UI Design

**Location:** Repository screen → Bookmarks tab (keyboard shortcut: `b` from the repo screen)

**Layout:**
- A table with columns: `Name`, `Change ID`, `Commit ID`, `Tracking`.
- The default bookmark row is highlighted with a star prefix (`★ main`).
- Rows are selectable via `j`/`k` or arrow keys.
- A status bar at the bottom showing: `{n} bookmarks · {selected} selected · [Enter] View · [/] Filter · [q] Back`

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `j` / `↓` | Move selection down |
| `k` / `↑` | Move selection up |
| `Enter` | View the selected bookmark's target change |
| `/` | Activate filter mode (type to filter by name) |
| `Esc` | Clear filter / exit |
| `y` | Copy selected bookmark's change ID to clipboard |
| `q` | Return to previous screen |
| `g` | Go to top |
| `G` | Go to bottom |

**Empty state:** Display centered text "No bookmarks" with a hint about pushing changes.

### VS Code Extension

**Tree View:** A "Bookmarks" section in the Codeplane sidebar tree view.

- Each bookmark renders as a tree item with the bookmark name as label and the change ID as description.
- The default bookmark has a star icon (`★`).
- Tracking bookmarks show a cloud icon (`☁`).
- Clicking a bookmark opens a quickpick or webview showing the change detail.
- A refresh button at the top of the tree view reloads the bookmark list.
- Context menu on each bookmark: "Copy Change ID", "View Change", "Create Landing Request from Bookmark".

### Neovim Plugin

**Telescope Picker:** `:Codeplane bookmarks` launches a Telescope picker.

- Each entry shows: `{name} ({change_id})`.
- Default bookmark is prefixed with `★`.
- `<CR>` on a selected bookmark opens the change detail in a split.
- `<C-y>` copies the change ID to the system clipboard.
- The picker supports fuzzy filtering by bookmark name.

**Command:** `:Codeplane bookmarks` — lists bookmarks in a floating Telescope window.

### Documentation

The following end-user documentation should be written:

1. **API Reference — List Bookmarks**: Document the `GET /api/repos/:owner/:repo/bookmarks` endpoint with request/response examples, pagination behavior, and error codes.
2. **CLI Reference — `bookmark list`**: Document the command, its flags, output formats, and local-vs-remote behavior.
3. **User Guide — Understanding Bookmarks**: A conceptual guide explaining what jj bookmarks are, how they differ from git branches, and how to use them in Codeplane across web, CLI, TUI, and editors.
4. **TUI Keyboard Reference**: Add the bookmarks screen shortcuts to the TUI keyboard help overlay.

## Permissions & Security

### Authorization Model

| Role | Can List Bookmarks? | Notes |
|------|---------------------|-------|
| **Anonymous** | ✅ on public repos | Read-only access to bookmark metadata |
| **Anonymous** | ❌ on private repos | Returns `404` (not `403`) to avoid repo existence disclosure |
| **Read-Only Member** | ✅ | Full bookmark list access |
| **Member** | ✅ | Full bookmark list access |
| **Admin** | ✅ | Full bookmark list access |
| **Owner** | ✅ | Full bookmark list access |

### Rate Limiting

| Context | Limit | Window |
|---------|-------|--------|
| Authenticated user | 300 requests | per minute |
| Anonymous / unauthenticated | 60 requests | per minute |
| Per-repository cap | 600 requests | per minute (across all users) |

Rate limit responses must use `429 Too Many Requests` with `Retry-After` header.

### Data Privacy

- Bookmark listing does not expose PII. The response contains only bookmark metadata (names, change/commit IDs, tracking status).
- Bookmark names could theoretically contain sensitive information (e.g., `fix/customer-123-data-leak`). This is a user responsibility, not a platform concern, but admin audit logs should capture who accessed bookmark lists on private repositories.
- The `target_commit_id` and `target_change_id` are repository-internal identifiers and are not PII.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `BookmarkListViewed` | User views bookmark list in any client | `repo_id`, `owner`, `repo_name`, `client` (web/cli/tui/vscode/nvim), `bookmark_count`, `is_authenticated`, `page_number`, `requested_limit` |
| `BookmarkListFiltered` | User applies a filter to the bookmark list | `repo_id`, `client`, `filter_query_length`, `results_count` |
| `BookmarkCopied` | User copies a bookmark's change ID | `repo_id`, `client`, `bookmark_name` |
| `BookmarkNavigated` | User navigates from bookmark list to change detail | `repo_id`, `client`, `bookmark_name`, `target_change_id` |

### Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Bookmark list load success rate** | `BookmarkListViewed` events with `bookmark_count >= 0` / total attempts | > 99.5% |
| **Bookmark → Change navigation rate** | `BookmarkNavigated` / `BookmarkListViewed` | > 15% (indicates users find the list useful for navigation) |
| **Multi-client usage** | Unique users who view bookmarks from 2+ different clients in a 7-day window | Increasing over time |
| **Empty state rate** | `BookmarkListViewed` with `bookmark_count == 0` / total views | < 20% (high empty rate suggests onboarding gap) |

## Observability

### Logging

| Log Point | Level | Structured Context | When |
|-----------|-------|--------------------|------|
| Bookmark list request received | `INFO` | `{ owner, repo, cursor, limit, user_id?, request_id }` | Every request |
| Bookmark list response | `DEBUG` | `{ owner, repo, bookmark_count, response_time_ms, request_id }` | Successful response |
| jj subprocess started | `DEBUG` | `{ owner, repo, command: "jj bookmark list", request_id }` | Before exec |
| jj subprocess completed | `DEBUG` | `{ owner, repo, exit_code, duration_ms, request_id }` | After exec |
| jj subprocess failed | `ERROR` | `{ owner, repo, exit_code, stderr, duration_ms, request_id }` | Non-zero exit |
| Repository not found | `WARN` | `{ owner, repo, request_id }` | 404 response |
| Pagination parse error | `WARN` | `{ owner, repo, raw_limit, request_id }` | Invalid limit param |
| Rate limit exceeded | `WARN` | `{ owner, repo, user_id?, ip, request_id }` | 429 response |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_bookmark_list_requests_total` | Counter | `owner`, `repo`, `status_code` | Total bookmark list requests |
| `codeplane_bookmark_list_duration_seconds` | Histogram | `owner`, `repo` | Request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_bookmark_list_items_returned` | Histogram | — | Number of bookmarks returned per request (buckets: 0, 1, 5, 10, 25, 50, 100) |
| `codeplane_jj_subprocess_duration_seconds` | Histogram | `command`, `exit_code` | jj subprocess execution time |
| `codeplane_jj_subprocess_errors_total` | Counter | `command`, `error_type` | jj subprocess failures |

### Alerts

#### Alert: High Bookmark List Error Rate
- **Condition:** `rate(codeplane_bookmark_list_requests_total{status_code=~"5.."}[5m]) / rate(codeplane_bookmark_list_requests_total[5m]) > 0.05`
- **Severity:** Warning (> 5%), Critical (> 20%)
- **Runbook:**
  1. Check `codeplane_jj_subprocess_errors_total` — if rising, the jj binary may be unavailable or crashing.
  2. SSH into the server and verify `jj --version` works.
  3. Check disk space on the repository storage volume (`df -h`). jj operations fail if the filesystem is full.
  4. Check server logs for `"failed to list bookmarks"` entries and inspect the stderr content.
  5. If the error is specific to one repository, check if that repository's `.jj` directory is corrupted. Run `jj debug operation log` in the repo path.
  6. If widespread, check if a jj upgrade introduced a breaking template syntax change. Compare the template string in `repohost.ts` against the installed jj version's template docs.

#### Alert: High Bookmark List Latency
- **Condition:** `histogram_quantile(0.95, rate(codeplane_bookmark_list_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning (p95 > 2s), Critical (p95 > 5s)
- **Runbook:**
  1. Check `codeplane_jj_subprocess_duration_seconds` — if jj subprocess time is high, the issue is in jj, not the server.
  2. Check system load (`uptime`, `top`) on the server. High CPU may indicate resource contention.
  3. Check if a specific repository has an unusually large number of bookmarks. Repositories with >1000 bookmarks may cause jj to be slow with `--all`.
  4. Check I/O wait (`iostat`). Repository operations are I/O-bound.
  5. Consider whether the repository storage has moved to a slower disk tier.
  6. If the issue is isolated, try running `jj bookmark list --all` manually in the affected repository to reproduce.

#### Alert: jj Subprocess Crash Spike
- **Condition:** `rate(codeplane_jj_subprocess_errors_total{command="bookmark_list"}[5m]) > 5`
- **Severity:** Critical
- **Runbook:**
  1. Check if jj is installed and accessible: `which jj && jj --version`.
  2. Inspect recent server logs for the full stderr output of failed jj commands.
  3. Check if the jj binary was recently updated. Template syntax changes across jj versions can cause parse failures.
  4. Verify the field separator characters (ASCII 0x1f, 0x1e) are not being mangled by locale or encoding settings.
  5. If jj segfaults, capture a core dump and file an upstream jj issue.
  6. As a temporary mitigation, consider pinning the jj version in the deployment.

### Error Cases and Failure Modes

| Failure Mode | Cause | Detection | User Impact | Recovery |
|--------------|-------|-----------|-------------|----------|
| jj binary not found | jj not installed or not in PATH | Subprocess exec error | 500 error on all bookmark requests | Install jj or fix PATH |
| jj template syntax error | jj version incompatibility | Non-zero exit code with syntax error in stderr | 500 error on all repos | Update template string to match jj version |
| Repository path missing | Repository deleted or storage unmounted | `ensureRepo` returns error | 404 for specific repo | Restore storage or remove stale repo record |
| Output parsing failure | Unexpected jj output format | Bookmarks array is empty despite repo having bookmarks | Silent data loss (empty list returned) | Update parsing logic to handle new output format |
| Disk full | Storage exhausted | jj write operations fail; reads may still work | Degraded or 500 errors | Free disk space |
| Process timeout | jj hangs on large repo | Server-side timeout | 504 or 500 | Kill jj process; investigate repo health |

## Verification

### API Integration Tests

1. **List bookmarks on a repository with bookmarks** — Create a repo, push content to create a `main` bookmark, call `GET /api/repos/:owner/:repo/bookmarks`, verify response has `items` array with at least one bookmark containing `name`, `target_change_id`, `target_commit_id`, and `is_tracking_remote` fields.
2. **List bookmarks returns alphabetical order** — Create a repo with bookmarks named `zebra`, `alpha`, `middle`. Verify the response items are ordered `alpha`, `middle`, `zebra`.
3. **List bookmarks on empty repository** — Create a repo with no commits. Call the endpoint. Verify 200 with `{ "items": [], "next_cursor": "" }`.
4. **List bookmarks respects default limit of 30** — Populate a repo with 50 bookmarks. Call the endpoint without `limit`. Verify exactly 30 items returned and `next_cursor` is non-empty.
5. **List bookmarks with explicit limit** — Call with `?limit=5`. Verify exactly 5 items returned.
6. **List bookmarks with limit=1** — Verify exactly 1 item returned.
7. **List bookmarks with limit=100 (maximum)** — Populate a repo with 150 bookmarks. Call with `?limit=100`. Verify exactly 100 items returned.
8. **List bookmarks with limit=150 (exceeds max) is clamped to 100** — Call with `?limit=150`. Verify 100 items returned (not 150, not error).
9. **List bookmarks with limit=0 returns 400** — Call with `?limit=0`. Verify `400` with `"invalid limit value"`.
10. **List bookmarks with limit=-1 returns 400** — Call with `?limit=-1`. Verify `400`.
11. **List bookmarks with limit=abc returns 400** — Call with `?limit=abc`. Verify `400` with `"invalid limit value"`.
12. **Cursor-based pagination returns all bookmarks across pages** — Create 10 bookmarks. Fetch with `?limit=3`, then follow `next_cursor` until empty. Verify all 10 bookmarks are returned exactly once.
13. **List bookmarks on nonexistent repository returns 404** — Call with a repo that does not exist. Verify `404`.
14. **List bookmarks with empty owner returns 400** — Call `GET /api/repos/%20/myrepo/bookmarks`. Verify `400` with `"owner is required"`.
15. **List bookmarks with empty repo name returns 400** — Call `GET /api/repos/myowner/%20/bookmarks`. Verify `400` with `"repository name is required"`.
16. **Bookmark with slash in name is returned correctly** — Create a bookmark named `release/v1.0`. Verify it appears in the list with the full name.
17. **Bookmark tracking a remote shows is_tracking_remote=true** — Push a bookmark to a remote. Verify `is_tracking_remote` is `true` in the response.
18. **Anonymous user can list bookmarks on public repo** — Do not send auth headers. Call the endpoint on a public repo. Verify `200`.
19. **Anonymous user cannot list bookmarks on private repo** — Do not send auth headers. Call the endpoint on a private repo. Verify `404`.
20. **Authenticated user with read access can list bookmarks on private repo** — Verify `200`.
21. **Response content-type is application/json** — Verify the `Content-Type` header is `application/json`.
22. **Bookmark with maximum-length name (255 chars) is returned** — Create a bookmark with a 255-character name. Verify it appears in the list without truncation.
23. **Rate limit headers are present** — Verify `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers exist.
24. **Concurrent requests to the same repo do not cause errors** — Send 10 concurrent bookmark list requests. Verify all return `200` with consistent data.
25. **Request ID is present in response headers** — Verify the response includes an `X-Request-ID` header.

### CLI Integration Tests

26. **`codeplane bookmark list` returns bookmarks as plain text** — Run the command in a repo with bookmarks. Verify output contains bookmark names and change IDs, one per line.
27. **`codeplane bookmark list --json` returns valid JSON array** — Verify the output is a valid JSON array of bookmark objects with `name`, `target_change_id`, and `target_commit_id`.
28. **`codeplane bookmark list` on empty repo returns "No bookmarks"** — Run in a repo with no bookmarks. Verify output is `"No bookmarks"`.
29. **`codeplane bookmark list --json` on empty repo returns `[]`** — Verify empty JSON array.
30. **`codeplane bookmark list` exits with code 0 on success** — Verify exit code is `0`.
31. **`codeplane bookmark list` works without auth on public repo** — Pass empty token. Verify exit code `0`.
32. **`codeplane bookmark list` on nonexistent repo fails** — Verify non-zero exit code with error message.
33. **`codeplane bookmark list` local mode** — Run inside a jj working copy without `--repo`. Verify it calls local jj and returns bookmarks.
34. **`codeplane bookmark list` handles bookmark names with slashes** — Create a `feature/my-feature` bookmark locally. Verify it appears in the list.
35. **`codeplane bookmark list` handles bookmark names with special characters** — Create bookmarks with `-`, `_`, `.` in names. Verify all appear correctly.

### Web UI E2E Tests (Playwright)

36. **Bookmarks tab is visible on repository page** — Navigate to `/:owner/:repo`. Verify a "Bookmarks" tab exists.
37. **Clicking Bookmarks tab shows bookmark list** — Click the tab. Verify bookmark entries are rendered.
38. **Each bookmark row shows name, change ID, and commit ID** — Verify the three data points are visible for each row.
39. **Default bookmark has a star indicator** — Verify the default bookmark row contains a star icon or "default" badge.
40. **Tracking bookmarks show tracking badge** — Verify bookmarks with `is_tracking_remote=true` show a badge.
41. **Empty repo shows empty state message** — Navigate to a repo with no bookmarks. Verify "No bookmarks yet" message and illustration.
42. **Filter input filters bookmarks by name** — Type a partial name in the filter. Verify only matching bookmarks are shown.
43. **Clicking change ID navigates to change detail** — Click a change ID link. Verify navigation to the change detail view.
44. **Copy button copies change ID to clipboard** — Click the copy button. Verify clipboard content matches the full change ID (using Playwright clipboard API).
45. **Bookmark count badge on tab shows correct count** — Verify the badge number matches the number of bookmark rows.
46. **Pagination loads more bookmarks** — On a repo with many bookmarks, scroll or click "Load more". Verify additional bookmarks appear.
47. **Bookmarks page loads without authentication on public repo** — Open the bookmarks page in an unauthenticated browser session. Verify it loads.
48. **Bookmarks page shows 404 for private repo without auth** — Open a private repo's bookmarks page without auth. Verify redirect to login or 404 page.

### TUI Tests

49. **Bookmarks screen renders table with correct columns** — Open the bookmarks screen. Verify columns: Name, Change ID, Commit ID, Tracking.
50. **Default bookmark shows star prefix** — Verify the default bookmark row starts with `★`.
51. **Arrow keys move selection** — Press `j` and `k`. Verify the selection highlight moves.
52. **Enter navigates to change detail** — Press Enter on a selected bookmark. Verify the change detail screen opens.
53. **`/` activates filter mode** — Press `/`. Verify filter input appears. Type a query. Verify list is filtered.
54. **`Esc` clears filter** — After filtering, press Esc. Verify filter is cleared and all bookmarks reappear.
55. **`q` returns to previous screen** — Press `q`. Verify the TUI navigates back.
56. **`y` copies change ID** — Press `y` on a selected bookmark. Verify clipboard content.
57. **Empty state displays message** — Open bookmarks on an empty repo. Verify "No bookmarks" text is centered.
58. **`g` jumps to top, `G` jumps to bottom** — In a long list, press `G` then `g`. Verify selection position.

### Cross-Client Consistency Tests

59. **API and CLI return the same bookmark data** — For the same repo, call the API and the CLI. Compare the returned bookmark names, change IDs, and commit IDs. They must match.
60. **API and Web UI display the same bookmarks** — Compare API JSON response with bookmarks visible in the web UI. They must match.
