# JJ_CHANGE_FILE_LIST

Specification for JJ_CHANGE_FILE_LIST.

## High-Level User POV

When working with jj-native repositories on Codeplane, developers need a fast way to see exactly which files a change touches without loading full diffs. The **Change File List** feature provides a lightweight summary of every file modified, added, deleted, renamed, or copied within a specific jj change. This is the jj equivalent of running `jj diff --summary` — but accessible everywhere: in the web UI, CLI, TUI, API, and editor integrations.

A developer reviewing a teammate's change stack can glance at the file list to quickly understand the scope of work — "this change touches 3 files in `src/api/` and adds a new test file" — before deciding whether to open the full diff. The file list also powers navigation: in the diff viewer, the file sidebar lets you jump directly to the file you care about. In agent workflows, the file list tells an agent which parts of the codebase a change affected, enabling smarter triage, review, and follow-up.

The file list includes the change type for each entry (added, modified, deleted, renamed, copied) so users can immediately see the nature of each modification without reading patches. For renamed and copied files, the original path is included. This summary-level view is intentionally cheaper than the full diff endpoint, making it suitable for polling, dashboards, and contexts where you want scope awareness without the weight of patch data.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/changes/:change_id/files` returns a structured JSON response with file paths and change types for a given jj change.
- [ ] The endpoint is wired to the existing `RepoHostService.getChangeFiles()` method, with the response enriched to include change type metadata.
- [ ] The CLI command `codeplane change files <change_id>` works in both local mode (direct jj) and remote mode (API-backed).
- [ ] The web UI change detail view includes a file list panel showing affected files.
- [ ] The TUI change/diff screen file sidebar is populated from this endpoint.
- [ ] All clients render change type indicators (added, modified, deleted, renamed, copied).
- [ ] The SDK exports an updated `ChangeFileEntry` type and a corresponding client method.
- [ ] All error cases return structured, predictable error responses.
- [ ] Tests pass for all clients (API, CLI, E2E).

### Functional Constraints

- [ ] **Change ID validation**: Change IDs must be 1–64 hexadecimal characters, or a supported revset alias (`@`, `@-`, `root()`). Invalid change IDs must return HTTP 400.
- [ ] **Owner and repo validation**: Both `owner` and `repo` path parameters are required and must be non-empty after trimming. Missing values return HTTP 400.
- [ ] **Change not found**: If the change ID does not resolve to a known revision, return HTTP 404 with message `"change '<id>' not found"`.
- [ ] **Repository not found**: If the owner/repo combination does not exist, return HTTP 404 with message `"repository not found"`.
- [ ] **Empty change**: A change that modifies zero files must return an empty `files` array (`[]`), not an error.
- [ ] **Binary files**: Binary files must be included in the file list with their change type; there is no exclusion of binary files from the summary.
- [ ] **Renamed files**: Renamed files must include both the new `path` and the `old_path`.
- [ ] **Copied files**: Copied files must include both the new `path` and the `old_path`.
- [ ] **Maximum file count**: The response must handle changes with up to 10,000 files. Changes exceeding 10,000 files must set `truncated: true` and return the first 10,000 entries.
- [ ] **Path encoding**: File paths must be returned as UTF-8 strings. Paths containing spaces, unicode characters, or special characters must be preserved exactly as stored in the repository.
- [ ] **No path traversal in change IDs**: Change IDs containing `..`, `/`, shell metacharacters (`|`, `;`, `&`, `` ` ``), or newlines must be rejected with HTTP 400.
- [ ] **Private repositories**: Unauthenticated or unauthorized requests to private repositories must receive HTTP 404 (not 403) to avoid information leakage.
- [ ] **Whitespace in parameters**: Leading and trailing whitespace in `owner`, `repo`, and `change_id` path parameters must be trimmed before processing.

### Edge Cases

- [ ] Change ID `@` (working copy) resolves correctly.
- [ ] Change ID `@-` (parent of working copy) resolves correctly.
- [ ] Change ID that is a full 64-character hex string resolves correctly.
- [ ] Change ID that is a short unique prefix (e.g., 4 characters) resolves correctly.
- [ ] A change that only adds files returns all entries with `change_type: "added"`.
- [ ] A change that only deletes files returns all entries with `change_type: "deleted"`.
- [ ] A change with a single renamed file returns one entry with `change_type: "renamed"`, `path` as the new name, and `old_path` as the old name.
- [ ] A merge change with conflicts still returns the file list (conflicts are surfaced by the separate `/conflicts` endpoint).
- [ ] Files in deeply nested directories (e.g., `a/b/c/d/e/f/g/h/file.txt`) are returned with full paths.
- [ ] Files at the repository root (e.g., `README.md`) are returned without a leading `/`.

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/changes/:change_id/files`

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | yes | Repository owner username or organization |
| `repo` | string | yes | Repository name |
| `change_id` | string | yes | jj change ID, short prefix, revset alias, or commit SHA |

**Query Parameters**: None.

**Success Response** (`200 OK`):

```json
{
  "change_id": "ksqxyzab",
  "files": [
    {
      "path": "src/api/handler.ts",
      "change_type": "modified"
    },
    {
      "path": "src/api/types.ts",
      "old_path": "src/api/old_types.ts",
      "change_type": "renamed"
    },
    {
      "path": "tests/handler.test.ts",
      "change_type": "added"
    }
  ],
  "truncated": false
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `change_id` | string | The resolved full change ID |
| `files` | `ChangeFileEntry[]` | Array of changed file entries |
| `files[].path` | string | File path relative to repo root |
| `files[].old_path` | string? | Previous path for renamed/copied files |
| `files[].change_type` | string | One of: `"added"`, `"modified"`, `"deleted"`, `"renamed"`, `"copied"` |
| `truncated` | boolean | `true` if the file list exceeds 10,000 entries and has been capped |

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Missing or invalid `owner`, `repo`, or `change_id` | `{ "message": "<validation error>" }` |
| 400 | `change_id` contains path traversal or shell metacharacters | `{ "message": "invalid change ID" }` |
| 401 | Request is unauthenticated and repo is private | `{ "message": "authentication required" }` |
| 404 | Repository not found or inaccessible | `{ "message": "repository not found" }` |
| 404 | Change ID does not resolve | `{ "message": "change 'abc123' not found" }` |
| 429 | Rate limit exceeded | `{ "message": "rate limit exceeded" }` |
| 500 | Internal jj execution failure | `{ "message": "internal server error" }` |

### SDK Shape

The `ChangeFile` type in `packages/sdk/src/services/repohost.ts` is expanded:

```typescript
export interface ChangeFileEntry {
  path: string;
  old_path?: string;
  change_type: "added" | "modified" | "deleted" | "renamed" | "copied";
}

export interface ChangeFileListResponse {
  change_id: string;
  files: ChangeFileEntry[];
  truncated: boolean;
}
```

The existing `RepoHostService.getChangeFiles()` method is updated to return `ChangeFileEntry[]` instead of `ChangeFile[]`, parsing both the change type character and the path from `jj diff --summary` output. The change type character mapping is: `A` → `"added"`, `M` → `"modified"`, `D` → `"deleted"`, `R` → `"renamed"`, `C` → `"copied"`.

The `@codeplane/ui-core` API client exposes:

```typescript
function getChangeFiles(owner: string, repo: string, changeId: string): Promise<ChangeFileListResponse>
```

### CLI Command

**Command**: `codeplane change files <change_id>`

**Arguments**:

| Argument | Required | Description |
|----------|----------|-------------|
| `<change_id>` | yes | jj change ID, prefix, or revset alias |

**Options**:

| Option | Default | Description |
|--------|---------|-------------|
| `--repo` / `-R` | auto-detected | Repository in `OWNER/REPO` format (for remote mode) |
| `--json` | false | Output as structured JSON |

**Default (human-readable) output**:

```
M  src/api/handler.ts
R  src/api/old_types.ts → src/api/types.ts
A  tests/handler.test.ts
```

Change type indicators: `A` (added), `M` (modified), `D` (deleted), `R` (renamed), `C` (copied).

**JSON output** (`--json`):

```json
{
  "change_id": "ksqxyzab",
  "files": [
    { "path": "src/api/handler.ts", "change_type": "modified" },
    { "path": "src/api/types.ts", "old_path": "src/api/old_types.ts", "change_type": "renamed" },
    { "path": "tests/handler.test.ts", "change_type": "added" }
  ],
  "truncated": false
}
```

**Behavior modes**:
- **Local mode** (no `--repo`): Runs `jj diff --summary -r <change_id>` directly in the current working directory. No server required.
- **Remote mode** (`--repo OWNER/REPO`): Calls `GET /api/repos/:owner/:repo/changes/:change_id/files`.

**Error output**:
- Change not found: `error: change 'abc123' not found` (exit code 1)
- No repository context: `error: not in a jj repository and --repo not specified` (exit code 1)

### Web UI Design

**Location**: Change detail view at `/:owner/:repo/changes/:change_id`

**File list panel**:
- Rendered as a vertical list within the change detail page.
- Each entry shows:
  - A change type icon/badge: green `A` for added, yellow `M` for modified, red `D` for deleted, blue `R` for renamed, cyan `C` for copied.
  - The file path, with the directory portion in muted text and the filename in normal weight.
  - For renamed/copied files, the old path is shown in strikethrough muted text below or beside the new path with a `→` arrow.
- Files are sorted: directories first (alphabetical), then files (alphabetical), matching the contents tree convention.
- Clicking a file navigates to the diff view scrolled/focused to that file's diff section.
- An empty change displays a centered message: "This change has no modified files."
- If `truncated` is `true`, a banner at the bottom reads: "File list truncated to 10,000 entries."

**Integration with diff view**:
- The diff viewer sidebar uses the file list endpoint to populate its file tree, avoiding the cost of fetching full diffs just to enumerate files.
- The file list response populates the sidebar; selecting a file triggers a targeted diff fetch or scrolls to that file's section in an already-loaded diff.

### TUI UI

**Diff screen file sidebar** (as defined in TUI_DIFF_SCREEN spec):
- The left sidebar (25% width) is populated from this endpoint.
- Each entry shows: `[A/M/D/R/C] path/to/file`
- Navigate with `j`/`k`, select with `Enter` to jump to that file's diff.
- Toggle sidebar visibility with `Ctrl+B`.

**Change detail screen**:
- When viewing a change in the TUI, a "Files" tab lists all affected files with change type indicators.
- Selecting a file from the list opens the diff screen focused on that file.

### Neovim Plugin API

The Neovim plugin exposes:
- `:CodeplaneChangeFiles <change_id>` — opens a quickfix/location list populated with the file list.
- Each entry shows the change type prefix and file path.
- Selecting an entry opens the file in a buffer. If a diff view is active, it jumps to that file's diff hunk.

### VS Code Extension

The VS Code extension:
- Adds a "Changed Files" tree view within the Codeplane sidebar panel for the current change context.
- Each tree item shows the change type icon and file path.
- Clicking opens the file; a context menu offers "Open Diff" to show the before/after comparison.

### Documentation

End-user documentation should include:

1. **API Reference**: Document the `GET /api/repos/:owner/:repo/changes/:change_id/files` endpoint with request/response examples, all error codes, and the `change_type` enum values.
2. **CLI Reference**: Document `codeplane change files` with examples of local mode, remote mode, JSON output, and each change type indicator.
3. **Web UI Guide**: Screenshot-annotated walkthrough of viewing a change's file list, understanding change type badges, and navigating from file list to diff.
4. **Conceptual Guide**: A short section in the "Working with jj Changes" guide explaining the difference between the file list (lightweight summary), the full diff (patch data), and file content at revision (single file).

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| **Owner** | Full access to file list for all repositories they own |
| **Admin** | Full access to file list for repositories they administer |
| **Member** (write) | Full access to file list for repositories they have write access to |
| **Member** (read) | Full access to file list for repositories they have read access to |
| **Anonymous (public repo)** | Full access to file list for public repositories |
| **Anonymous (private repo)** | HTTP 404 (not 403) — no information leakage |
| **Deploy key (read)** | Access to file list for the associated repository |
| **PAT** | Access scoped to the token's repository permissions |
| **Agent session** | Access scoped to the agent session's repository context |

### Rate Limiting

| Consumer | Limit |
|----------|-------|
| Anonymous | 60 requests/hour per IP |
| Authenticated user | 5,000 requests/hour per user |
| Agent session | 10,000 requests/hour per session |

Rate limiting uses the same sliding-window mechanism as all other jj API endpoints.

### Security Constraints

- **Change ID injection**: The `change_id` parameter must be validated against a strict pattern (`^[a-zA-Z0-9@\-_]+$`). Shell metacharacters, path traversal sequences, pipes, semicolons, backticks, and newlines must be rejected with HTTP 400.
- **Information leakage**: Private repository existence must never be revealed to unauthorized users. Always return 404, never 403.
- **No secret exposure**: File paths may reveal internal directory structure. This is acceptable for users with read access. No file contents are returned by this endpoint.
- **PII considerations**: File paths may contain author names or usernames in directory structures. This is repository content and follows the same exposure model as the code browser.
- **Subprocess safety**: The `change_id` parameter is passed to `jj` via argument array (not shell interpolation), preventing command injection.

## Telemetry & Product Analytics

### Business Events

| Event | Properties | Trigger |
|-------|------------|--------|
| `ChangeFileListViewed` | `owner`, `repo`, `change_id`, `file_count`, `truncated`, `client` (`web`, `cli`, `tui`, `api`, `vscode`, `neovim`), `response_time_ms` | Successful file list retrieval |
| `ChangeFileListError` | `owner`, `repo`, `change_id`, `error_type` (`not_found`, `bad_request`, `internal`), `client` | Failed file list retrieval |
| `ChangeFileListNavigated` | `owner`, `repo`, `change_id`, `file_path`, `change_type`, `client` | User clicked/selected a file from the file list to navigate to diff |

### Funnel Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **File list → Diff navigation rate** | Percentage of file list views where the user subsequently navigates to at least one file's diff | > 60% |
| **File list load time p95** | 95th percentile response time for the endpoint | < 500ms |
| **File list adoption rate** | Percentage of change detail views that also load the file list | > 80% (indicates UI is using the endpoint) |
| **CLI file list usage** | Weekly active users of `codeplane change files` | Growing week-over-week |
| **Error rate** | Percentage of file list requests resulting in 4xx or 5xx | < 2% |

### Success Indicators

- The file list endpoint becomes the primary entry point for diff navigation (replaces loading full diffs just to enumerate files).
- Agent sessions use the file list endpoint to understand change scope before deciding on review strategy.
- CLI users use `change files` as a precursor to `change diff` for large changes.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-----------------|
| File list request received | `debug` | `owner`, `repo`, `change_id`, `request_id`, `user_id` |
| jj subprocess invoked | `debug` | `command`, `repo_path`, `change_id`, `request_id` |
| jj subprocess completed | `info` | `command`, `exit_code`, `duration_ms`, `file_count`, `request_id` |
| jj subprocess failed | `warn` | `command`, `exit_code`, `stderr` (first 500 chars), `request_id` |
| Change not found | `info` | `owner`, `repo`, `change_id`, `request_id` |
| Invalid change ID rejected | `warn` | `owner`, `repo`, `change_id_raw`, `rejection_reason`, `request_id` |
| File list truncated | `info` | `owner`, `repo`, `change_id`, `total_files`, `returned_files`, `request_id` |
| Rate limit exceeded | `warn` | `client_ip`, `user_id`, `endpoint`, `request_id` |
| Internal error | `error` | `owner`, `repo`, `change_id`, `error_message`, `stack_trace`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_change_file_list_requests_total` | counter | `status` (`200`, `400`, `404`, `429`, `500`), `owner` | Total file list requests |
| `codeplane_change_file_list_duration_seconds` | histogram | `owner` | Request duration distribution (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_change_file_list_file_count` | histogram | `owner` | Distribution of files-per-change (buckets: 1, 5, 10, 25, 50, 100, 500, 1000, 5000, 10000) |
| `codeplane_change_file_list_truncated_total` | counter | `owner` | Responses where truncation occurred |
| `codeplane_jj_subprocess_duration_seconds` | histogram | `command` (`diff_summary`) | jj subprocess execution time |
| `codeplane_jj_subprocess_errors_total` | counter | `command`, `exit_code` | jj subprocess failures |

### Alerts

#### Alert: High Error Rate on Change File List

**Condition**: `rate(codeplane_change_file_list_requests_total{status="500"}[5m]) / rate(codeplane_change_file_list_requests_total[5m]) > 0.05` for 5 minutes.

**Severity**: Warning

**Runbook**:
1. Check the structured logs for `level=error` entries with the `change_file_list` context within the alerting time window.
2. Look for patterns in `stderr` output from jj subprocess failures — common causes include corrupted repository state, jj binary missing or incompatible version, or filesystem permission issues.
3. If the errors are concentrated on a single repository, check that repository's health: `jj --repository <path> status`.
4. If jj is consistently failing, verify the jj binary version matches the expected version: `jj --version`.
5. If the issue is filesystem-related, check disk space and inode availability on the repository storage volume.
6. If the issue is transient, monitor for resolution. If persistent, escalate to the platform team.

#### Alert: High Latency on Change File List

**Condition**: `histogram_quantile(0.95, rate(codeplane_change_file_list_duration_seconds_bucket[5m])) > 2` for 10 minutes.

**Severity**: Warning

**Runbook**:
1. Check if the latency is correlated with specific repositories (use the `owner` label).
2. Large repositories with massive changes (>1000 files) will naturally be slower. Check `codeplane_change_file_list_file_count` histogram for spikes.
3. Check disk I/O metrics on the repository storage volume — high iowait indicates storage contention.
4. Check for concurrent heavy operations (workflow runs, clones, large diffs) that may compete for jj subprocess resources.
5. If one repository is causing all the latency, investigate its size and consider whether the change in question is abnormally large.
6. If latency is widespread, check system resources (CPU, memory, disk) and jj process count.

#### Alert: Excessive Truncation

**Condition**: `rate(codeplane_change_file_list_truncated_total[1h]) > 10`

**Severity**: Info

**Runbook**:
1. This alert indicates users are frequently viewing changes that touch >10,000 files. This is informational — it may indicate automated/generated changes or repository import operations.
2. Check which repositories are generating truncated responses.
3. Consider whether the 10,000 file limit should be raised or whether pagination should be implemented.
4. No immediate action required unless users report missing files.

### Error Cases and Failure Modes

| Failure Mode | Detection | Behavior | Recovery |
|--------------|-----------|----------|----------|
| jj binary not found | Subprocess exec failure | 500 Internal Server Error | Deploy/reinstall jj binary |
| Repository path missing | `ensureRepo()` returns error | 404 Not Found | Verify repo storage mount |
| jj hangs (infinite loop) | Subprocess timeout (30s) | 500 with timeout message | Kill orphaned jj process; investigate repo state |
| Disk full | jj write failure | 500 Internal Server Error | Free disk space; alert on disk usage |
| Corrupted repo index | jj parse error | 500 Internal Server Error | Run `jj debug reindex`; escalate if persistent |
| Invalid UTF-8 in file paths | Parse error | Include path as-is with replacement chars | Repository-specific; no general fix needed |
| Rate limit exceeded | Counter check | 429 Too Many Requests | User waits; no operator action |

## Verification

### API Integration Tests

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Basic file list for a change with one modified file | Valid `change_id` with 1 modified file | 200, `files` has 1 entry with `change_type: "modified"` |
| 2 | File list for a change with multiple file types | Change that adds, modifies, and deletes files | 200, entries have correct `change_type` for each |
| 3 | File list for a change that renames a file | Change with a renamed file | 200, entry has `change_type: "renamed"`, `path` is new, `old_path` is old |
| 4 | File list for a change that copies a file | Change with a copied file | 200, entry has `change_type: "copied"`, `path` is new, `old_path` is source |
| 5 | Empty change (no modified files) | `change_id` pointing to an empty change | 200, `files: []`, `truncated: false` |
| 6 | Change ID as `@` (working copy) | `change_id: "@"` | 200, returns files from working copy change |
| 7 | Change ID as `@-` (parent) | `change_id: "@-"` | 200, returns files from parent change |
| 8 | Change ID as short prefix (4 chars) | `change_id: "ksqx"` | 200, resolves to full change and returns files |
| 9 | Change ID as full 64-char hex | Full hex change ID | 200, correct file list |
| 10 | Change not found | Non-existent `change_id` | 404, `{ "message": "change '<id>' not found" }` |
| 11 | Repository not found | Invalid `owner/repo` | 404, `{ "message": "repository not found" }` |
| 12 | Missing `owner` param | Empty owner | 400, `{ "message": "owner is required" }` |
| 13 | Missing `repo` param | Empty repo | 400, `{ "message": "repository name is required" }` |
| 14 | Missing `change_id` param | Empty change_id | 400, `{ "message": "change_id is required" }` |
| 15 | Change ID with path traversal `../` | `change_id: "../etc/passwd"` | 400, `{ "message": "invalid change ID" }` |
| 16 | Change ID with shell metacharacter `;` | `change_id: "abc;rm -rf"` | 400, `{ "message": "invalid change ID" }` |
| 17 | Change ID with pipe `|` | `change_id: "abc|cat"` | 400, `{ "message": "invalid change ID" }` |
| 18 | Change ID with backtick | `change_id: "abc\`ls\`"` | 400, `{ "message": "invalid change ID" }` |
| 19 | Change ID with newline | `change_id: "abc\nls"` | 400, `{ "message": "invalid change ID" }` |
| 20 | File path with spaces | Change modifying `"path with spaces/file.txt"` | 200, path preserved exactly |
| 21 | File path with unicode characters | Change modifying `"docs/日本語.md"` | 200, unicode path preserved |
| 22 | Deeply nested file path | Change modifying `"a/b/c/d/e/f/g/h/i/j/file.txt"` | 200, full path returned |
| 23 | File at repo root | Change modifying `"README.md"` | 200, path has no leading `/` |
| 24 | Binary file included | Change that adds a `.png` file | 200, binary file appears in list with correct change type |
| 25 | Private repo, unauthenticated | No auth token, private repo | 404 (not 403) |
| 26 | Private repo, authenticated with read access | Valid token with read permission | 200, file list returned |
| 27 | Private repo, authenticated without access | Valid token, no repo access | 404 (not 403) |
| 28 | Public repo, unauthenticated | No auth token, public repo | 200, file list returned |
| 29 | `truncated` is `false` for small file list | Change with 5 files | 200, `truncated: false` |
| 30 | Change ID with leading/trailing whitespace | `change_id: "  ksqx  "` | 200, trimmed and resolved correctly |
| 31 | Change with conflict still returns file list | Change that has conflicts | 200, files returned (conflicts are a separate endpoint) |
| 32 | Rate limit returns 429 | Exceed rate limit | 429, `{ "message": "rate limit exceeded" }` |
| 33 | `change_id` field in response matches resolved full ID | Short prefix input | 200, `change_id` is the full resolved ID |
| 34 | Response Content-Type is `application/json` | Any valid request | `Content-Type: application/json` header |
| 35 | PAT-based authentication works | Valid PAT in Authorization header | 200 |
| 36 | Deploy key authentication works | Valid deploy key with read access | 200 |

### Truncation and Scale Tests

| # | Test | Input | Expected |
|---|------|-------|----------|
| 37 | Change with exactly 10,000 files | Change modifying 10,000 files | 200, `files` has 10,000 entries, `truncated: false` |
| 38 | Change with 10,001 files | Change modifying 10,001 files | 200, `files` has 10,000 entries, `truncated: true` |
| 39 | Change with 50,000 files (large auto-generated) | Change modifying 50,000 files | 200, `files` has 10,000 entries, `truncated: true`, response completes within 10s |

### CLI Integration Tests

| # | Test | Command | Expected |
|---|------|---------|----------|
| 40 | Local mode basic file list | `codeplane change files <id>` (in jj repo) | Outputs `M  src/file.ts` style lines |
| 41 | Local mode JSON output | `codeplane change files <id> --json` | JSON with `change_id`, `files[]`, `truncated` |
| 42 | Local mode empty change | `codeplane change files <empty_change_id>` | Empty output (no files) |
| 43 | Local mode change not found | `codeplane change files nonexistent` | `error: change 'nonexistent' not found`, exit code 1 |
| 44 | Local mode not in jj repo | Run outside jj repo without `--repo` | `error: not in a jj repository and --repo not specified`, exit code 1 |
| 45 | Remote mode basic file list | `codeplane change files <id> --repo owner/repo` | Outputs file list from API |
| 46 | Remote mode JSON output | `codeplane change files <id> --repo owner/repo --json` | JSON response from API |
| 47 | CLI shows rename with arrow | `codeplane change files <id>` with renamed file | `R  old_name → new_name` |
| 48 | CLI `-R` alias works | `codeplane change files <id> -R owner/repo` | Same as `--repo` |

### End-to-End (E2E) Playwright Tests

| # | Test | Scenario | Expected |
|---|------|----------|----------|
| 49 | Web UI file list renders on change detail | Navigate to `/:owner/:repo/changes/:change_id` | File list panel visible with correct entries |
| 50 | Web UI change type badges render correctly | View change with mixed add/modify/delete | Green A, yellow M, red D badges visible |
| 51 | Web UI renamed file shows old → new path | View change with renamed file | Both paths visible with arrow |
| 52 | Web UI empty change shows placeholder | View empty change | "This change has no modified files" message |
| 53 | Web UI click file navigates to diff | Click a file in the file list | Diff view opens/scrolls to that file |
| 54 | Web UI file list loads for public repo (anonymous) | Visit public repo change page without login | File list renders |
| 55 | Web UI private repo redirects to login | Visit private repo change page without login | Redirect to login or 404 page |
| 56 | Web UI truncation banner | View change with >10,000 files | "File list truncated" banner appears |
| 57 | Web UI diff sidebar matches file list | Open diff view for a change | Sidebar file list matches the file list endpoint response |

### TUI Integration Tests

| # | Test | Scenario | Expected |
|---|------|----------|----------|
| 58 | TUI diff sidebar populated | Open diff screen for a change | Left sidebar shows file entries with change types |
| 59 | TUI file navigation | Press `j`/`k` to navigate, `Enter` to select | Diff content updates to selected file |
| 60 | TUI sidebar toggle | Press `Ctrl+B` | Sidebar hides/shows |
| 61 | TUI empty change | View change with no files | Sidebar shows "No files" message |

### Editor Integration Tests

| # | Test | Scenario | Expected |
|---|------|----------|----------|
| 62 | VS Code file tree view populates | Activate extension in repo context | "Changed Files" tree shows entries |
| 63 | VS Code file click opens file | Click entry in changed files tree | File opens in editor |
| 64 | Neovim `:CodeplaneChangeFiles` populates quickfix | Run command with valid change ID | Quickfix list populated with files and change types |

### Performance Tests

| # | Test | Scenario | Expected |
|---|------|----------|----------|
| 65 | Small change response time | Change with 5 files | Response < 200ms |
| 66 | Medium change response time | Change with 500 files | Response < 1s |
| 67 | Large change response time | Change with 10,000 files | Response < 5s |
| 68 | Concurrent requests | 50 concurrent file list requests to different changes | All complete within 10s, no 500 errors |
