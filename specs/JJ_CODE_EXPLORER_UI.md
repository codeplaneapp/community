# JJ_CODE_EXPLORER_UI

Specification for JJ_CODE_EXPLORER_UI.

## High-Level User POV

The Code Explorer is the central file browsing experience for any repository on Codeplane. When a developer navigates to a repository, the Code Explorer is the gateway to understanding what code lives there and what it looks like — at any point in the repository's history.

Unlike traditional git-based forges that tie browsing to branches and commit SHAs, Codeplane's Code Explorer is built around jj-native concepts. Users pick a **bookmark** (like `main` or `feature-auth`) or a **jj change ID** (like `ksqxyz`) and explore the repository's directory structure and file contents exactly as they existed at that change. Because jj change IDs are stable — they survive rebases and history rewrites — bookmarked links to specific files or directories remain valid over time, even as the repository evolves.

The experience begins with a tree view of the repository's root directory. Folders can be expanded to reveal their contents, lazily loading children only when opened. Files can be selected to reveal a syntax-highlighted preview with line numbers, language detection, file size, and line count. A breadcrumb bar above the preview shows the full path, and every segment is clickable for navigation. A bookmark/change picker lets users switch between different points in time without leaving the explorer. Binary files show a placeholder with a download link. Oversized files (>5 MB) are truncated with a clear notice. Empty files display a gentle "Empty file" message.

The Code Explorer is available across all Codeplane clients. In the web UI, it occupies the `/:owner/:repo/code` route and provides a two-panel layout: a collapsible tree sidebar on the left and a file preview pane on the right. In the TUI, a similar two-pane layout lets terminal users navigate with keyboard shortcuts (`j`/`k` for movement, `Enter` to expand/select, `h` to collapse, `b` to switch bookmarks, `/` to search-filter). From the CLI, `codeplane repo contents` lists directory contents and `codeplane change cat` retrieves file content, both supporting local jj repos and remote API-backed repos. Editor integrations link into the explorer via dashboard webviews.

The Code Explorer ties together three foundational APIs: the Contents Tree API for directory listings, the File Content API for individual file retrieval, and the Change File List for understanding which files a change touches. Together, they enable a seamless browsing experience that respects jj's unique model — stable change IDs, bookmark-based navigation, and conflict-aware repository state — while delivering the speed and polish users expect from modern code forges.

For agents and automation, the Code Explorer APIs enable programmatic repository exploration. An agent can enumerate directories, read file contents at specific changes, and understand change scope — all through the same API surface that powers the human-facing UI.

## Acceptance Criteria

### Definition of Done

- [ ] The web UI route `/:owner/:repo/code` renders a fully functional Code Explorer with a collapsible file tree sidebar and a file preview pane.
- [ ] The file tree sidebar lazily loads directory contents from `GET /api/repos/:owner/:repo/contents` and `GET /api/repos/:owner/:repo/contents/*`.
- [ ] File selection in the tree triggers a file preview via `GET /api/repos/:owner/:repo/file/:change_id/*`.
- [ ] A bookmark/change picker allows users to switch the browsing ref; changing the ref reloads the tree from root.
- [ ] Breadcrumb navigation shows the current path with clickable segments.
- [ ] The TUI includes a Code Explorer screen with the same two-pane layout and keyboard-driven navigation.
- [ ] The CLI exposes `codeplane repo contents [path]` for directory listings and `codeplane change cat <change_id> <path>` for file content.
- [ ] All three underlying APIs (`/contents`, `/contents/*`, `/file/:change_id/*`) are fully implemented (no 501 stubs).
- [ ] The `@codeplane/ui-core` package exports `useRepoTree`, `useFileContent`, and `getContents` / `getFileAtChange` client methods.
- [ ] Syntax highlighting is applied in the file preview based on the `language` field from the file content API response.
- [ ] E2E tests cover the complete user journey across web, TUI, and CLI.
- [ ] Documentation is written for API reference, CLI reference, and user guides.

### Functional Constraints

- [ ] **Owner validation**: `owner` path parameter must match `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,38}$` (1–39 characters).
- [ ] **Repo name validation**: `repo` path parameter must match `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$` (1–100 characters, no `.git` suffix).
- [ ] **Path constraints**: forward-slash-delimited, maximum 4,096 characters, no `..` traversal, no `.jj/` or `.git/` internal paths.
- [ ] **Ref parameter**: accepts bookmark names, jj change IDs (hex, 1–64 chars), jj revset aliases (`@`, `@-`, `root()`), and commit SHAs. Maximum 256 characters. Shell metacharacters rejected with `400`.
- [ ] **Default ref**: when `ref` is omitted, defaults to the repository's default bookmark.
- [ ] **Directory listing sort order**: directories first (alphabetical, case-sensitive), then files (alphabetical).
- [ ] **Directory entry fields**: `name`, `path`, `type` (file/dir/submodule/symlink), `size` (number or null), `sha`, `download_url` (string or null).
- [ ] **Symlinks**: include `link_target` field.
- [ ] **Submodules**: include `submodule_url` field when available.
- [ ] **Directory truncation**: maximum 10,000 entries per directory; `truncated: true` if exceeded.
- [ ] **File content for files ≤ 1 MB** (contents endpoint): returned inline as base64.
- [ ] **File content for files > 1 MB** (contents endpoint): `content: null`, `encoding: "none"`.
- [ ] **File content (file API) truncation**: files > 5 MB return `is_truncated: true` with first 5 MB of content.
- [ ] **Binary detection**: null-byte heuristic in first 8,192 bytes. Binary files return `is_binary: true` with `content: null` (unless `?encoding=base64`).
- [ ] **Language detection**: file extension–based detection for 70+ extensions via `detectLanguage()`.
- [ ] **Empty files**: `200` with `content: ""`, `size: 0`, `line_count: 0`.
- [ ] **Empty repositories**: return empty entries array at root.
- [ ] **Private repositories**: return `404` (never `403`) for unauthenticated/unauthorized users.

### Edge Cases

- [ ] Leading `/` in path is stripped.
- [ ] Trailing `/` is stripped and treated as directory request.
- [ ] `..` in any path position returns `400`.
- [ ] Whitespace-only path returns `400`.
- [ ] Double slashes (`src//lib`) normalized to single slash.
- [ ] `ref` with shell metacharacters (`;`, `|`, `&`, `$`, backtick) returns `400`.
- [ ] Unicode file names work via URL encoding.
- [ ] Spaces in file names work via URL encoding.
- [ ] 100+ levels of directory nesting work correctly.
- [ ] Directory with exactly 10,000 entries: `truncated: false`.
- [ ] Directory with 10,001 entries: returns 10,000, `truncated: true`.
- [ ] File at exactly 5 MB: `is_truncated: false`, full content.
- [ ] File at 5 MB + 1 byte: `is_truncated: true`, first 5 MB.
- [ ] File with extremely long single line (>1 MB) counts as 1 line, no crash.
- [ ] `.jj/` and `.git/` internal paths return `404`.
- [ ] Symlink to a directory returns target listing with originally requested path.
- [ ] Single-file repo returns one-element array at root.
- [ ] Change ID `@` resolves correctly.
- [ ] Change ID `@-` resolves correctly.
- [ ] Short unique prefix change IDs (4 chars) resolve correctly.
- [ ] File paths with no extension (`Makefile`) return correct or null language.

## Design

### Web UI Design

**Route**: `/:owner/:repo/code`

**Layout**: Two-panel layout within the repository workbench shell.

**Left panel — File Tree Sidebar:**
- Width: 25% of container, min 200px, max 400px, with 1px right border.
- **Ref picker**: Dropdown at the top showing the current bookmark/change. Switching reloads the entire tree from root.
- **Tree view**: On initial load, calls `GET /api/repos/:owner/:repo/contents?ref=<default_bookmark>` for root entries. Directory nodes are collapsible; clicking triggers lazy fetch of `GET /contents/<path>?ref=<ref>`.
- **Entry rendering**:
  - Directories: folder icon, expandable, click to lazy-load children, arrow indicator for expand/collapse state.
  - Files: file icon with language-appropriate variant where available, click to load preview.
  - Symlinks: link icon, target path shown on hover.
  - Submodules: package icon, non-expandable, clicking navigates to the submodule repository if resolvable.
- **Sort**: directories first (alphabetical), then files (alphabetical).
- **Truncation**: if `truncated: true`, a notice at the bottom reads "Showing first 10,000 entries".
- **Loading state**: spinner on expanding node.
- **Error state**: inline error message with retry button.
- **Responsive**: sidebar hidden by default below 768px; toggle button available in toolbar.

**Right panel — File Preview Pane:**
- **Breadcrumb navigation**: Shows `owner / repo / path / segments / file.ext`, each segment clickable. Clicking a directory segment loads that directory in the tree.
- **File header bar**: file path, language badge, file size (human-readable), line count.
- **Content area**: syntax-highlighted source code with line numbers in muted color. Uses the `language` field from the file content API for highlighter selection.
- **Binary files**: placeholder: "Binary file (45.2 KB) — Download" with download link via `Accept: application/octet-stream`.
- **Truncated files**: banner: "File truncated at 5 MB — Download full file" with raw download link.
- **Empty files**: centered "Empty file" message.
- **Action buttons**: "Raw" button (opens raw content in new tab), "Copy" button (copies text content to clipboard, text files only).
- **Deep-linkable**: URL updates to reflect current file path (e.g., `/:owner/:repo/code/src/main.ts?ref=main`).

**Keyboard shortcuts**:
| Key | Action |
|-----|--------|
| `Ctrl+B` | Toggle sidebar visibility |
| `/` | Focus search filter in sidebar |
| `Enter` | Expand directory / select file |
| `↑`/`↓` | Navigate tree entries |

### TUI UI

**Screen**: Code Explorer, accessible from the repository context.

**Layout**: Two-pane layout.
- **Left pane** (file tree): 25% width at ≥120 cols; 30% when toggled on at 80–119 cols (min 24 cols); hidden by default below 80 cols.
- **Right pane** (file preview): remaining width.

**Tree pane**:
- Fetches root via `GET /api/repos/:owner/:repo/contents?ref=<ref>`.
- Entry indicators: `▸` collapsed dir, `▾` expanded dir, ` ` file, `→` symlink, `◉` submodule.
- Navigate: `j`/`k` for cursor, `Enter`/`l` to expand/select, `h` to collapse.
- Search filter: `/` activates, real-time case-insensitive match, `Escape` to clear, max 128 chars.
- Bookmark selector: `b` opens picker.
- Error/retry: `R` to retry.
- Loading: `⟳` spinner.

**Preview pane**:
- Header bar: `path | language | size | lines`.
- Syntax-highlighted content with line numbers.
- Scroll: `j`/`k` line, `Ctrl+D`/`Ctrl+U` page, `G`/`gg` jump.
- Copy: `y` path, `Y` content.
- Search: `/` when preview focused.
- Binary: "Binary file — cannot preview in terminal".
- Truncated: "[Truncated at 5 MB]" footer.

**Focus model**: `Tab`/`Shift+Tab` switches panes. `Ctrl+B` toggles sidebar.

### API Shape

**Directory Listing**:
- `GET /api/repos/:owner/:repo/contents` — Root directory
- `GET /api/repos/:owner/:repo/contents/*` — Subdirectory or file at path
- Query: `?ref=<bookmark|change_id|revset>`
- Response (directory): `{ type: "dir", path, entries: ContentsEntry[], truncated }`
- Response (file): `{ name, path, type: "file", size, sha, content, encoding, download_url }`
- Errors: `400` (invalid path/ref), `404` (repo/ref/path not found), `429`, `500`

**File Content**:
- `GET /api/repos/:owner/:repo/file/:change_id/*`
- Query: `?encoding=utf8|base64`
- Response: `{ path, content, encoding, language, size, line_count, is_binary, is_truncated }`
- Raw: `Accept: application/octet-stream` returns raw bytes with `Content-Disposition: attachment`
- Errors: `400`, `404`, `422` (too large for raw), `429`, `500`

### SDK Shape

**Types** (in `packages/sdk/src/services/repohost.ts`):

```typescript
export interface ContentsEntry {
  name: string;
  path: string;
  type: "file" | "dir" | "submodule" | "symlink";
  size: number | null;
  sha: string;
  download_url: string | null;
  link_target?: string;
  submodule_url?: string;
}

export interface ContentsDirectoryResponse {
  type: "dir";
  path: string;
  entries: ContentsEntry[];
  truncated: boolean;
}

export interface ContentsFileResponse {
  name: string;
  path: string;
  type: "file";
  size: number;
  sha: string;
  content: string | null;
  encoding: "base64" | "none";
  download_url: string;
}

export type ContentsResponse = ContentsDirectoryResponse | ContentsFileResponse;

export interface FileContentResponse {
  path: string;
  content: string | null;
  encoding: "utf8" | "base64";
  language: string | null;
  size: number;
  line_count: number;
  is_binary: boolean;
  is_truncated: boolean;
}
```

**New SDK methods**:
- `RepoHostService.listContents(owner, repo, path, options?: { ref?: string }): Promise<Result<ContentsResponse, APIError>>`
- Enhanced `RepoHostService.getFileAtChange()` to return `FileContentResponse` with full metadata.

**UI-core hooks** (in `@codeplane/ui-core`):
- `useRepoTree(owner, repo, ref?, path?)` — `{ data, loading, error, refetch }`
- `useFileContent(owner, repo, changeId, path)` — `{ data, loading, error }`
- `getContents(owner, repo, path?, options?)` — imperative API client
- `getFileAtChange(owner, repo, changeId, path, options?)` — imperative API client

### CLI Command

**Directory listing**: `codeplane repo contents [path]`

| Flag | Description |
|------|-------------|
| `--repo, -R` | Repository in `OWNER/REPO` format (auto-detected from cwd) |
| `--ref` | Bookmark, change ID, or revset alias |
| `--json` | Full JSON response |
| `--tree` | Indented tree output (default for TTY) |

TTY default: formatted listing with type indicators, size column, name. Exit code `1` on not-found.

**File content**: `codeplane change cat <change_id> <path>`

| Flag | Description |
|------|-------------|
| `--repo, -R` | Repository in `OWNER/REPO` format |
| `--json` | JSON with metadata |
| `--raw` | Raw bytes (default for non-JSON) |
| `--encoding` | Force base64 in JSON |

Local mode: `jj file show` directly. Remote mode: API call. Default: raw stdout for piping. Exit code `1` on errors.

### Documentation

1. **API Reference — Contents Tree** (`docs/api/contents.mdx`): Both endpoints, parameters, response shapes, error codes, curl examples, comparison table vs file/git-tree APIs.
2. **API Reference — File Content** (`docs/api/file-content.mdx`): Endpoint, parameters, text/binary/truncated/empty responses, raw download, curl examples.
3. **Repository Guide** (`docs/guides/repositories.mdx`): "Browsing Code" section with workflow, ref parameter explanation, endpoint table.
4. **CLI Reference — repo contents** (`docs/cli/repo.mdx`): Flags, examples, local vs remote.
5. **CLI Reference — change cat** (`docs/cli/change.mdx`): Flags, examples, piping.
6. **SDK Reference** (`docs/sdk/repohost.mdx`): `listContents()` and `getFileAtChange()` methods, type definitions.
7. **Web UI Guide — Code Explorer** (`docs/guides/code-explorer.mdx`): Screenshot-annotated walkthrough of tree navigation, file preview, ref switching, breadcrumbs, keyboard shortcuts.

## Permissions & Security

### Authorization Matrix

| Role | Public Repository | Private Repository |
|------|-------------------|--------------------|---|
| **Anonymous** | ✅ Read | ❌ 404 (no existence leak) |
| **Authenticated (no repo access)** | ✅ Read | ❌ 404 (no existence leak) |
| **Repository Read** | ✅ Read | ✅ Read |
| **Repository Write** | ✅ Read | ✅ Read |
| **Repository Admin** | ✅ Read | ✅ Read |
| **Owner** | ✅ Read | ✅ Read |
| **Org Member (team read)** | ✅ Read | ✅ Read |
| **Deploy Key (read scope)** | ✅ Read | ✅ Read |
| **PAT (read scope)** | ✅ Read | ✅ Read |
| **Agent session** | ✅ Read | ✅ Read (scoped to session's repo context) |

All Code Explorer endpoints are **read-only**. Authorization follows the same repository read-access check used by all other repository content endpoints.

**Critical rule**: Private repository access always returns `404` (never `403` or `401` with repo name) to prevent leaking repository existence.

### Rate Limiting

| Consumer | Limit | Window |
|----------|-------|--------|
| Anonymous | 60 requests | per hour, per IP |
| Authenticated user | 5,000 requests | per hour, per token/session |
| Deploy key | 5,000 requests | per hour, per key |
| Agent session | 10,000 requests | per hour, per session |

Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) included on all responses. `Retry-After` header on `429` responses.

### Data Privacy & Security

- **Path traversal prevention**: Route layer rejects `..` before passing to service. SDK layer sanitizes owner/repo. jj operates within repository sandbox.
- **Ref injection prevention**: `ref` parameter validated against strict format whitelist. Shell metacharacters (`;`, `|`, `&`, `$`, backtick) rejected with `400`.
- **Subprocess safety**: All parameters passed to jj via argument array (not shell interpolation), preventing command injection.
- **No PII exposure**: Directory listings contain file names and sizes. File content is repository data. Neither constitutes user PII, but file content must never be logged.
- **Cache-Control**: Public repos: `Cache-Control: public, max-age=60`. Private repos: `Cache-Control: private, no-store`.
- **Content-Type safety**: JSON responses use `application/json`. Raw downloads use `application/octet-stream` to prevent content sniffing.
- **CORS**: Inherits server CORS policy.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `CodeExplorerOpened` | User navigates to Code Explorer route | `owner`, `repo`, `ref`, `ref_type` (bookmark/change_id/revset), `client` (web/tui), `entry_point` (nav_sidebar/breadcrumb/direct_url/repo_overview) |
| `ContentsTreeViewed` | Successful directory listing response | `owner`, `repo`, `ref`, `path`, `entry_count`, `truncated`, `client` (web/cli/tui/api/agent), `depth` (path segments) |
| `FileContentViewed` | Successful file content response | `owner`, `repo`, `change_id`, `file_path`, `language`, `size_bytes`, `is_binary`, `is_truncated`, `client` (web/cli/tui/api/agent), `encoding` |
| `ContentsRefSwitched` | User changes ref in picker | `owner`, `repo`, `from_ref`, `to_ref`, `ref_type`, `client` |
| `CodeExplorerDirectoryExpanded` | User expands directory node | `owner`, `repo`, `ref`, `path`, `depth`, `entry_count`, `client` |
| `FileContentRawDownload` | Raw download triggered | `owner`, `repo`, `change_id`, `file_path`, `size_bytes`, `is_binary` |
| `FileContentCopied` | Copy button clicked | `owner`, `repo`, `file_path`, `size_bytes` |
| `ContentsNotFound` | 404 response | `owner`, `repo`, `ref`, `path`, `not_found_reason` (repo/ref/path/change/file), `client` |
| `ContentsRateLimited` | 429 response | `owner`, `repo`, `consumer_type` (anonymous/authenticated/deploy_key/agent) |

All events include standard context: `user_id` (if authenticated), `session_id`, `timestamp` (ISO 8601), `request_id`, `ip_country`.

### Funnel Metrics & Success Indicators

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| **Code Explorer adoption** | % of active users opening Code Explorer ≥1 time per week | > 50% of WAU |
| **Directory depth engagement** | Median directory depth navigated per session | > 2 levels deep |
| **File preview engagement** | Median files previewed per Code Explorer session | > 3 files per session |
| **Lazy load success rate** | % of expanded directories loading successfully first attempt | > 99% |
| **Ref-switching usage** | % of sessions switching refs at least once | > 15% |
| **Change ID ref usage** | % of requests where ref is a jj change ID | Tracking only (higher = stronger jj adoption) |
| **Error rate** | % of API requests returning 4xx/5xx | < 2% (4xx), < 0.1% (5xx) |
| **Client distribution** | Requests by client type | Web > 45%, TUI > 10%, CLI > 10%, API/Agent > 10% |
| **File view → action rate** | % of file previews leading to Copy, Raw download, or navigation | > 20% |

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Notes |
|-----------|-------|-------------------|-------|
| Contents request received | `debug` | `owner`, `repo`, `path`, `ref`, `user_id`, `request_id` | Never log directory entries |
| Contents directory served | `info` | `owner`, `repo`, `path`, `ref`, `entry_count`, `truncated`, `duration_ms`, `request_id` | |
| Contents file served | `info` | `owner`, `repo`, `path`, `ref`, `file_size`, `has_content`, `duration_ms`, `request_id` | |
| File content request received | `debug` | `owner`, `repo`, `change_id`, `file_path`, `user_id`, `request_id` | Never log file content |
| File content served | `info` | `owner`, `repo`, `change_id`, `file_path`, `size_bytes`, `language`, `is_binary`, `is_truncated`, `duration_ms`, `request_id` | |
| Path not found | `info` | `owner`, `repo`, `path`, `ref`, `request_id` | Expected navigation miss |
| Ref not found | `info` | `owner`, `repo`, `ref`, `request_id` | Expected user error |
| Change not found | `info` | `owner`, `repo`, `change_id`, `request_id` | Expected user error |
| File not found | `info` | `owner`, `repo`, `change_id`, `file_path`, `request_id` | Expected user error |
| Repository not found | `warn` | `owner`, `repo`, `request_id` | May indicate stale links |
| jj/git subprocess failure | `error` | `owner`, `repo`, `path`, `ref`, `exit_code`, `stderr` (truncated 500 chars), `request_id` | Operational issue |
| Path traversal attempt | `warn` | `owner`, `repo`, `path`, `remote_ip`, `user_id`, `request_id` | Security-relevant |
| Ref injection attempt | `warn` | `owner`, `repo`, `ref`, `remote_ip`, `user_id`, `request_id` | Security-relevant |
| Rate limit exceeded | `warn` | `owner`, `repo`, `consumer_type`, `remote_ip`, `request_id` | |
| Directory truncated | `info` | `owner`, `repo`, `path`, `ref`, `total_entries`, `returned_entries`, `request_id` | |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_code_explorer_requests_total` | Counter | `endpoint` (contents/file), `status` (2xx/4xx/5xx), `response_type` (dir/file), `client` | Total requests |
| `codeplane_code_explorer_duration_seconds` | Histogram | `endpoint`, `response_type` | Request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5) |
| `codeplane_contents_entries_returned` | Histogram | — | Entries per directory (buckets: 0, 1, 10, 50, 100, 500, 1000, 5000, 10000) |
| `codeplane_contents_truncated_total` | Counter | — | Truncated directory responses |
| `codeplane_file_content_size_bytes` | Histogram | `language`, `is_binary` | File size distribution |
| `codeplane_file_content_truncated_total` | Counter | — | Files exceeding 5 MB |
| `codeplane_file_content_binary_total` | Counter | — | Binary file requests |
| `codeplane_code_explorer_subprocess_duration_seconds` | Histogram | `command` | jj subprocess time |
| `codeplane_code_explorer_subprocess_errors_total` | Counter | `error_type` (exit_code/timeout/spawn) | Subprocess failures |
| `codeplane_code_explorer_path_traversal_total` | Counter | — | Rejected path traversals |
| `codeplane_code_explorer_ref_injection_total` | Counter | — | Rejected ref injections |

### Alerts & Runbooks

**Alert 1: High Subprocess Error Rate**
- **Condition**: `rate(codeplane_code_explorer_subprocess_errors_total[5m]) > 0.5`
- **Severity**: `warning`
- **Runbook**:
  1. Check jj/git binary availability: `which jj && which git`.
  2. Check disk space: `df -h $CODEPLANE_DATA_DIR/repos`.
  3. Check logs for `error_type` breakdown (spawn vs exit_code vs timeout).
  4. If `spawn` errors: check file descriptor exhaustion — `ls /proc/<pid>/fd | wc -l`.
  5. If repo-specific: try `jj log` manually in affected repo.
  6. Check for stale `.jj/repo/op_store/lock` files.
  7. If `exit_code`: check `stderr` in logs for jj error message.
  8. If jj version incompatibility: verify version matches pinned range.

**Alert 2: High Latency (P95 > 3s)**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_code_explorer_duration_seconds_bucket[5m])) > 3`
- **Severity**: `warning`
- **Runbook**:
  1. Check subprocess duration — if dominant, issue is I/O or jj performance.
  2. Check `codeplane_contents_entries_returned` — large directories cause proportional latency.
  3. Check `iostat -x 1 5` for disk latency.
  4. Check if specific repos are the cause (large monorepos).
  5. Check for competing heavy operations (pushes, clones, artifact writes).
  6. Consider read-through cache for hot directory listings.

**Alert 3: Path Traversal / Ref Injection Spike**
- **Condition**: `increase(codeplane_code_explorer_path_traversal_total[1h]) + increase(codeplane_code_explorer_ref_injection_total[1h]) > 20`
- **Severity**: `critical`
- **Runbook**:
  1. Pull structured logs for traversal/injection entries.
  2. Extract `remote_ip` and `user_id`. Check single-source pattern.
  3. Single IP: add to temporary block list or WAF deny rule.
  4. Single user: review account for compromise; consider suspension.
  5. Test validation logic manually with known-bad inputs.
  6. Escalate to security team if coordinated probing suspected.

**Alert 4: Sustained 5xx Rate > 5%**
- **Condition**: `rate(codeplane_code_explorer_requests_total{status="5xx"}[5m]) / rate(codeplane_code_explorer_requests_total[5m]) > 0.05`
- **Severity**: `critical`
- **Runbook**:
  1. Check error logs for stack traces by `request_id`.
  2. Determine global vs repo-specific scope.
  3. Verify binary health: `jj version`, `git version`.
  4. Check OOM: `dmesg | grep -i oom`.
  5. Check Bun subprocess limits.
  6. If repo-specific: `git fsck` on colocated `.git`.
  7. If transient: check concurrent repo operations causing lock contention.

**Alert 5: High Truncation Rate**
- **Condition**: `rate(codeplane_contents_truncated_total[1h]) / rate(codeplane_code_explorer_requests_total{status="2xx", endpoint="contents"}[1h]) > 0.10`
- **Severity**: `info`
- **Runbook**:
  1. Not an operational emergency. Review which repos have >10k entries per directory.
  2. Consider increasing truncation limit if resources permit.
  3. Consider cursor-based pagination as future enhancement.
  4. File product issue to track pagination work.

### Error Cases & Failure Modes

| Error Case | HTTP Status | Detection | Impact | Mitigation |
|------------|-------------|-----------|--------|------------|
| jj binary not found | 500 | Spawn error | All requests fail | Pre-flight startup check |
| git binary not found | 500 | Spawn error | All requests fail | Pre-flight startup check |
| Repo directory missing | 404 | `ensureRepo()` | Single-repo | Expected for deleted repos |
| jj/git lock contention | 500 | stderr "lock" | Temp per-repo | Retry once after 100ms |
| Disk full | 500 | OS error | All repos on volume | Independent disk alert |
| Subprocess timeout (>30s) | 500 | Timeout kill | Single request | Alert; investigate repo size |
| >10k entries in dir | 200 (truncated) | Entry count | Partial response | `truncated` flag |
| >5 MB file content | 200 (truncated) | File size | Partial content | `is_truncated` flag + download |
| Invalid UTF-8 in filenames | 200 | Git output | Garbled names | Escape invalid sequences |
| jj version incompatibility | 500 | Unexpected output | Parse failures | Pin supported version range |
| File too large for memory | 500 | OOM | Single request | 5 MB streaming limit |
| Subprocess exhaustion | 500 | spawn spike | Multiple requests | Subprocess pool with backpressure |

## Verification

### API Integration Tests — Contents Tree

| Test ID | Description | Expected |
|---------|-------------|----------|
| `API-CE-001` | `GET /api/repos/:owner/:repo/contents` for repo with files at root | `200`, `type: "dir"`, non-empty `entries`, `truncated: false` |
| `API-CE-002` | `GET /api/repos/:owner/:repo/contents/src` for known subdirectory | `200`, `type: "dir"`, entries matching subdirectory |
| `API-CE-003` | `GET /api/repos/:owner/:repo/contents/README.md` for known file | `200`, `type: "file"`, `content` present (base64), `size > 0` |
| `API-CE-004` | `GET /contents?ref=main` with explicit ref | `200`, listing at `main` |
| `API-CE-005` | `GET /contents?ref=<change_id>` with jj change ID | `200`, listing at that change |
| `API-CE-006` | `GET /contents?ref=@` with jj revset alias | `200`, listing at working copy |
| `API-CE-007` | `GET /contents?ref=nonexistent-bookmark` | `404`, message contains "ref" and "not found" |
| `API-CE-008` | `GET /contents/nonexistent-path` | `404`, message contains "path" and "not found" |
| `API-CE-009` | `GET /api/repos/nonexistent/repo/contents` | `404`, "repository not found" |
| `API-CE-010` | `GET /contents/../../../etc/passwd` | `400`, "traversal" |
| `API-CE-011` | `GET /contents/..` | `400`, "traversal" |
| `API-CE-012` | `GET /contents/src/..` | `400`, "traversal" |
| `API-CE-013` | `GET /contents/` (trailing slash) | `200`, same as `/contents` |
| `API-CE-014` | `GET /contents/src/` (trailing slash) | `200`, same as `/contents/src` |
| `API-CE-015` | `GET /contents/src//lib` (double slash) | `200`, normalized |
| `API-CE-016` | Verify sort: dirs first alphabetical, then files alphabetical | Correct order |
| `API-CE-017` | Each entry has `name`, `path`, `type`, `size`, `sha`, `download_url` | All fields present |
| `API-CE-018` | `size` is `null` for dir entries | Verified |
| `API-CE-019` | `size` is positive integer for file entries | Verified |
| `API-CE-020` | `download_url` is `null` for dir entries | Verified |
| `API-CE-021` | `download_url` is valid URL for file entries | Points to file API |
| `API-CE-022` | File response `content` is valid base64 | Decoded matches file |
| `API-CE-023` | File > 1 MB (contents endpoint): `content: null`, `encoding: "none"` | Metadata only |
| `API-CE-024` | File exactly 1 MB: `content` present | Full content returned |
| `API-CE-025` | File at 1 MB + 1 byte: `content: null` | Threshold enforced |
| `API-CE-026` | Empty directory | `200`, `entries: []`, `truncated: false` |
| `API-CE-027` | Empty repo (no commits) root | `200`, `entries: []` |
| `API-CE-028` | Symlink entry has `type: "symlink"`, `link_target` set | Correct |
| `API-CE-029` | Submodule entry has `type: "submodule"` | Correct |
| `API-CE-030` | Path with spaces: `GET /contents/my%20dir/my%20file.txt` | `200` or `404`, decoded correctly |
| `API-CE-031` | Path with Unicode: `GET /contents/docs/%E6%97%A5%E6%9C%AC%E8%AA%9E` | `200` or `404` (no 400/500) |
| `API-CE-032` | Deeply nested path (50 levels) | `200` if exists |
| `API-CE-033` | `ref` with `; rm -rf /` | `400`, "invalid ref" |
| `API-CE-034` | `ref` with `| cat /etc/passwd` | `400`, "invalid ref" |
| `API-CE-035` | `ref` with backtick injection | `400`, "invalid ref" |
| `API-CE-036` | `ref` > 256 characters | `400`, "invalid ref" |
| `API-CE-037` | `ref` exactly 256 characters (valid) | `200` or `404` (accepted) |
| `API-CE-038` | `.jj/config.toml` path | `404` |
| `API-CE-039` | `.git/config` path | `404` |
| `API-CE-040` | Content-Type is `application/json; charset=utf-8` | Verified |

### API Integration Tests — File Content

| Test ID | Description | Expected |
|---------|-------------|----------|
| `API-CE-050` | `GET /file/:change_id/src/main.ts` for known text file | `200`, `content` matches, `language: "typescript"`, `is_binary: false` |
| `API-CE-051` | `GET /file/:change_id/README.md` for known markdown file | `200`, `language: "markdown"` |
| `API-CE-052` | `GET /file/:change_id/nonexistent.txt` | `404`, "not found" |
| `API-CE-053` | `GET /file/zzzzzzzzzzzzzzzz/any.txt` (invalid change ID) | `404`, "change" and "not found" |
| `API-CE-054` | `GET /file/:change_id/` (empty path) | `400`, "path is required" |
| `API-CE-055` | `GET /file/:change_id/../../../etc/passwd` | `400`, "path traversal" |
| `API-CE-056` | `GET /file/:change_id/assets/logo.png` for binary file | `200`, `is_binary: true`, `content: null` |
| `API-CE-057` | `GET /file/:change_id/assets/logo.png?encoding=base64` | `200`, `content` is valid base64 |
| `API-CE-058` | `GET /file/:change_id/empty.txt` for empty file | `200`, `content: ""`, `size: 0`, `line_count: 0` |
| `API-CE-059` | `GET /file/:change_id/src/main.ts` with `Accept: application/octet-stream` | `200`, raw bytes, `Content-Disposition` |
| `API-CE-060` | `GET /file/@/src/main.ts` (revset alias) | `200`, working copy content |
| `API-CE-061` | File at exactly 5 MB | `200`, `is_truncated: false`, full content |
| `API-CE-062` | File at 5 MB + 1 byte | `200`, `is_truncated: true`, 5 MB content |
| `API-CE-063` | File path with spaces | `200`, decoded correctly |
| `API-CE-064` | File path with Unicode | `200` or `404`, no 400/500 |
| `API-CE-065` | Concurrent 10 requests for same file | All `200` identical |
| `API-CE-066` | Concurrent 10 requests for different files | All correct |
| `API-CE-067` | `.jj/config.toml` | `404` |
| `API-CE-068` | File with no extension (`Makefile`) | `200`, language correct or `null` |

### Repository Access Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `API-CE-080` | Authenticated user, public repo | `200` |
| `API-CE-081` | Anonymous user, public repo | `200` |
| `API-CE-082` | Auth with read access, private repo | `200` |
| `API-CE-083` | Auth without access, private repo | `404` (not 403) |
| `API-CE-084` | Anonymous, private repo | `404` (not 401/403) |
| `API-CE-085` | PAT with read scope | `200` |
| `API-CE-086` | Deploy key with read scope | `200` |
| `API-CE-087` | Archived repository | `200` |
| `API-CE-088` | Org member with team read, private org repo | `200` |

### Truncation & Scale Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `API-CE-090` | Directory with 10,000 entries | `200`, all, `truncated: false` |
| `API-CE-091` | Directory with 10,001 entries | `200`, 10,000, `truncated: true` |
| `API-CE-092` | Directory with 50 entries | `200`, 50, `truncated: false` |
| `API-CE-093` | Directory with 1 entry | `200`, 1, `truncated: false` |

### Rate Limiting Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `API-CE-100` | Auth user: 5,001st request | `429` with `Retry-After` |
| `API-CE-101` | Anonymous: 61st request | `429` with `Retry-After` |
| `API-CE-102` | 429 response has `X-RateLimit-*` headers | Present |
| `API-CE-103` | Non-429 response has `X-RateLimit-*` headers | Present |

### CLI Integration Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `CLI-CE-001` | `codeplane repo contents -R owner/repo` | Exit 0, root entries |
| `CLI-CE-002` | `codeplane repo contents src -R owner/repo` | Exit 0, src entries |
| `CLI-CE-003` | `codeplane repo contents src --json -R owner/repo` | Exit 0, valid JSON |
| `CLI-CE-004` | `codeplane repo contents nonexistent -R owner/repo` | Exit 1, stderr "not found" |
| `CLI-CE-005` | `codeplane repo contents -R owner/repo --ref main` | Exit 0, entries at main |
| `CLI-CE-006` | `codeplane repo contents -R owner/repo --ref nonexistent` | Exit 1, stderr "not found" |
| `CLI-CE-007` | `codeplane repo contents` (inside local jj repo) | Exit 0, root listing |
| `CLI-CE-008` | `codeplane api get "/repos/owner/repo/contents/src?ref=main"` | Exit 0, raw JSON |
| `CLI-CE-010` | `codeplane change cat @ src/main.ts` in local jj repo | Exit 0, file content |
| `CLI-CE-011` | `codeplane change cat @ src/main.ts --json` | Exit 0, valid JSON |
| `CLI-CE-012` | `codeplane change cat @ nonexistent.txt` | Exit 1, stderr "not found" |
| `CLI-CE-013` | `codeplane change cat badchangeid src/main.ts` | Exit 1, stderr error |
| `CLI-CE-014` | `codeplane change cat <id> src/main.ts -R owner/repo` | Exit 0, remote content |
| `CLI-CE-015` | `codeplane change cat @ package.json | jq .name` | Exit 0, pipe works |
| `CLI-CE-016` | `codeplane change cat @ README.md --raw` | Exit 0, raw content |
| `CLI-CE-017` | `codeplane change cat` no arguments | Exit 1, usage help |

### E2E Playwright Tests (Web UI)

| Test ID | Description | Expected |
|---------|-------------|----------|
| `E2E-CE-001` | Navigate to `/:owner/:repo/code`, file tree renders | Sidebar with root entries |
| `E2E-CE-002` | Click directory node | Expands, shows children |
| `E2E-CE-003` | Click expanded directory | Collapses |
| `E2E-CE-004` | Dirs before files in tree | Sort order correct |
| `E2E-CE-005` | Click file in tree | Preview panel loads with syntax highlighting |
| `E2E-CE-006` | File preview shows language badge, size, line count | Metadata displayed |
| `E2E-CE-007` | Switch bookmark in ref picker | Tree reloads from root |
| `E2E-CE-008` | Navigate nested dir, verify breadcrumbs | Full path, clickable |
| `E2E-CE-009` | Click breadcrumb segment | Navigates to level, tree updates |
| `E2E-CE-010` | Click binary file | Placeholder with download link |
| `E2E-CE-011` | Click "Raw" button | New tab with raw content |
| `E2E-CE-012` | Click "Copy" button | Clipboard has file content |
| `E2E-CE-013` | Private repo unauthenticated | Redirect to login or 404 |
| `E2E-CE-014` | Non-existent repo | 404 page |
| `E2E-CE-015` | Symlink entry shows link icon | Visual indicator |
| `E2E-CE-016` | Submodule entry non-expandable | Does not expand |
| `E2E-CE-017` | URL updates on file navigation | Reflects current path and ref |
| `E2E-CE-018` | Direct URL to file loads correctly | File preview shown |
| `E2E-CE-019` | Empty file shows message | "Empty file" visible |
| `E2E-CE-020` | Toggle sidebar `Ctrl+B` | Hides/shows |
| `E2E-CE-021` | Loading spinner on expand | Spinner visible |
| `E2E-CE-022` | Error state with retry | Error inline, retry works |
| `E2E-CE-023` | Truncated directory notice | "Showing first 10,000 entries" |

### TUI E2E Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `TUI-CE-001` | Open Code Explorer, tree renders | Root entries with type indicators |
| `TUI-CE-002` | `j`/`k` cursor movement | Moves between entries |
| `TUI-CE-003` | `Enter` on directory | Expands |
| `TUI-CE-004` | `h` on expanded directory | Collapses |
| `TUI-CE-005` | `Enter` on file | Preview loads with header |
| `TUI-CE-006` | Preview syntax highlighting | Content rendered |
| `TUI-CE-007` | `b` bookmark selector | Picker appears |
| `TUI-CE-008` | Select different bookmark | Tree reloads |
| `TUI-CE-009` | `/` filter | Tree filters |
| `TUI-CE-010` | Loading spinner | `⟳` visible |
| `TUI-CE-011` | Error state | `✗` with message, `R` retries |
| `TUI-CE-012` | `Ctrl+B` toggle | Sidebar hides/shows |
| `TUI-CE-013` | `Tab`/`Shift+Tab` focus switch | Focus moves |
| `TUI-CE-014` | `y` copies path | Path in clipboard |
| `TUI-CE-015` | `Y` copies content | Content in clipboard |
| `TUI-CE-016` | Binary file | "Cannot preview" message |
| `TUI-CE-017` | `j`/`k` scrolls preview | Line-by-line |
| `TUI-CE-018` | `Ctrl+D`/`Ctrl+U` pages preview | Page up/down |

### Performance Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `PERF-CE-001` | Root listing, 50 entries | < 500ms |
| `PERF-CE-002` | Root listing, 1,000 entries | < 1,000ms |
| `PERF-CE-003` | Root listing, 10,000 entries | < 3,000ms |
| `PERF-CE-004` | Single file content request | < 500ms |
| `PERF-CE-005` | 50 sequential directory expands | All within 15s |
| `PERF-CE-006` | 10 concurrent file content requests | All < 1s each |

### Cross-Surface Consistency Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| `XSURF-CE-001` | Web and TUI same root entries | Identical |
| `XSURF-CE-002` | Web and CLI same file content | Identical |
| `XSURF-CE-003` | Web and TUI same file metadata | Identical |
| `XSURF-CE-004` | CLI `--json` matches API response schema | Schema matches |
