# JJ_FILE_PREVIEW_TEXT

Specification for JJ_FILE_PREVIEW_TEXT.

## High-Level User POV

When a developer browses a jj-native repository on Codeplane and selects a text file from the code explorer, they see an immediate, syntax-highlighted preview of the file's content. This is the core text file viewing experience — the moment a developer clicks a `.ts`, `.py`, `.rs`, `.go`, or any recognized text file in the file tree, they see the file rendered with proper syntax coloring, line numbers, and metadata at a glance. The preview is tied to a specific jj change ID, meaning the developer always sees the file exactly as it existed at a particular point in the repository's history, not just at the tip of some branch.

The text file preview appears across every Codeplane client surface. In the **web UI**, the code explorer's right panel renders the file with a header bar showing the file path, detected language, byte size, and line count, followed by a scrollable syntax-highlighted code block with line numbers. In the **TUI**, the same preview occupies the main panel of the code explorer screen, driven entirely by keyboard shortcuts — `j`/`k` to scroll, `/` to search within the file, `y` to copy the path, `Y` to copy content. In the **CLI**, `codeplane change cat @ src/main.ts` streams raw file content to stdout, ready to pipe into other tools, with a `--json` flag to get structured metadata alongside the content. In **editor integrations**, developers can peek at files from other changes without leaving VS Code or Neovim.

The value is directness and stability. Because Codeplane uses jj change IDs — which are stable across rebases and history rewrites — a link to a file at a specific change remains valid even as the repository evolves. Developers reviewing landing requests, inspecting agent-generated code, or exploring unfamiliar codebases get a fast, consistent text preview everywhere, without needing to clone the repository or switch tools. The text preview is the foundation upon which richer previews (images, PDFs, rendered markdown) and contextual views (file-at-change-revision, inline annotations) are built.

## Acceptance Criteria

### Definition of Done

- [ ] The server route `GET /api/repos/:owner/:repo/file/:change_id/*` is fully implemented and no longer returns 501.
- [ ] The route delegates to the existing `RepoHostService.getFileAtChange()` SDK method, extended to return enriched metadata.
- [ ] The JSON response includes `path`, `content`, `encoding`, `language`, `size`, `line_count`, `is_binary`, and `is_truncated` fields.
- [ ] Binary files are detected via null-byte heuristic in the first 8,192 bytes and return `is_binary: true` with `content: null` (or base64-encoded content when `?encoding=base64`).
- [ ] Files larger than 5 MB are truncated and return `is_truncated: true` with the first 5 MB of content.
- [ ] Empty files return `200` with `content: ""`, `size: 0`, `line_count: 0`.
- [ ] The `language` field is populated by the existing `detectLanguage()` function (70+ extensions). Unrecognized extensions return `language: null`.
- [ ] The web UI Code Explorer renders a text file preview panel with syntax highlighting, line numbers, file header bar (path, language badge, size, line count), and scrollable content.
- [ ] The TUI Code Explorer renders a text file preview panel with syntax highlighting via OpenTUI's `SyntaxStyle`, keyboard-driven scrolling, in-file search, copy-to-clipboard, and line number toggling.
- [ ] The CLI exposes `codeplane change cat <change_id> <path>` that outputs raw file content to stdout (default) or structured JSON (with `--json`).
- [ ] The `useFileContent(owner, repo, changeId, filePath)` hook exists in `@codeplane/ui-core` and is consumed by both web and TUI clients.
- [ ] Raw file download is supported via `Accept: application/octet-stream` header, returning `Content-Type: application/octet-stream` with `Content-Disposition: attachment`.
- [ ] E2E tests cover happy path, error paths, boundary conditions, and all client surfaces.
- [ ] API documentation, CLI reference, and user guide sections are updated.

### Functional Constraints

- [ ] The `owner` path parameter must be a non-empty string matching `^[a-zA-Z0-9_.-]{1,39}$`.
- [ ] The `repo` path parameter must be a non-empty string matching `^[a-zA-Z0-9_.-]{1,100}$`.
- [ ] The `change_id` path parameter must be a valid jj change ID (hex characters, 1–64 characters) or a recognized revset alias (`@`, `@-`, `root()`).
- [ ] The file path (wildcard remainder) must be a non-empty, forward-slash-delimited relative path. Maximum path length is 4,096 characters.
- [ ] The file path must not contain `..` path traversal sequences. Paths containing `..` return `400` with a path traversal error message.
- [ ] The API must URL-decode the file path to support paths with spaces and special characters (e.g., `docs/my%20file.md`).
- [ ] File paths with Unicode characters (e.g., `docs/日本語.md`) must work correctly via URL encoding.
- [ ] File path with leading `/` is normalized (strip leading slash).
- [ ] File path with trailing `/` returns `400` ("path must refer to a file, not a directory").
- [ ] File path containing only whitespace after trimming returns `400`.
- [ ] If the repository does not exist, return `404` with `{"message": "repository not found"}`.
- [ ] If the change ID does not resolve, return `404` with `{"message": "change '<id>' not found"}`.
- [ ] If the file does not exist at the given change, return `404` with `{"message": "file '<path>' not found at change '<id>'"}`.
- [ ] Change ID containing non-hex characters returns `400` unless it is a recognized revset alias.
- [ ] Repository with zero changes (freshly initialized, empty) returns `404` for any file request.
- [ ] File at exactly 5 MB (5,242,880 bytes) returns `is_truncated: false`; file at 5 MB + 1 byte (5,242,881 bytes) returns `is_truncated: true`.
- [ ] File with extremely long single line (>1 MB) must not crash; it counts as 1 line.
- [ ] `.jj/` internal files are not accessible through this API (jj's `file show` naturally excludes them).
- [ ] Symlinks: if jj resolves a symlink, the content of the target file is returned; the response path reflects the requested path.
- [ ] Concurrent requests to the same file must not interfere with each other (jj subprocess isolation).
- [ ] The endpoint respects repository visibility: private repos require authentication; public repos allow anonymous read.
- [ ] Private repos return `401` (unauthenticated) or `403` (authenticated, no access), never leaking repo existence.

### Edge Cases

- [ ] Duplicate file path components (e.g., `src/src/main.ts`) are treated as literal paths — no normalization beyond `..` rejection.
- [ ] File with no extension (e.g., `Makefile`, `Dockerfile`) returns correctly detected language or `null`.
- [ ] File with recognized extension but zero bytes returns `200` with `language` detected from extension, `content: ""`, `size: 0`.
- [ ] Non-UTF-8 file content detected as binary via null-byte heuristic.
- [ ] Request for `.gitignore` or other dotfiles that jj tracks returns content normally.
- [ ] Deeply nested path (100 directory components) returns the file if it exists.
- [ ] `?encoding=base64` on a text file returns base64-encoded content.
- [ ] `?encoding=invalid` returns `400`.
- [ ] Extremely long file path (>4,096 characters) returns `400`.
- [ ] Request with empty `change_id` returns `400`.
- [ ] `@-` (parent of working copy) as change_id returns `200` if parent exists.
- [ ] Multiple rapid file selections in the web/TUI abort previous in-flight requests; only the final request renders.
- [ ] `Y` (copy content) on a binary file shows "Cannot copy binary file content" in TUI.
- [ ] File content >1 MB cannot be copied to clipboard in TUI (shows "File too large to copy").
- [ ] Search input in TUI capped at 256 characters; search match tracking capped at 10,000 matches.
- [ ] Horizontal line length hard-truncated at 10,000 chars in non-wrap mode in TUI.
- [ ] Terminal resize while scrolled preserves scroll position; gutter width may change on breakpoint crossing.

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/file/:change_id/*`

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner username or org name |
| `repo` | string | Repository name |
| `change_id` | string | jj change ID, commit ID, or revset alias (`@`, `@-`) |
| `*` (wildcard) | string | Forward-slash-delimited file path within the repository |

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `encoding` | `"utf8"` \| `"base64"` | `"utf8"` | How to encode file content in the JSON response |

**Response (200 OK, text file)**:
```json
{
  "path": "src/main.ts",
  "content": "import { serve } from 'hono';\n...",
  "encoding": "utf8",
  "language": "typescript",
  "size": 2048,
  "line_count": 64,
  "is_binary": false,
  "is_truncated": false
}
```

**Response (200 OK, binary file, default encoding)**:
```json
{
  "path": "assets/logo.png",
  "content": null,
  "encoding": "utf8",
  "language": null,
  "size": 45231,
  "line_count": 0,
  "is_binary": true,
  "is_truncated": false
}
```

**Response (200 OK, binary file, `?encoding=base64`)**:
```json
{
  "path": "assets/logo.png",
  "content": "iVBORw0KGgo...",
  "encoding": "base64",
  "language": null,
  "size": 45231,
  "line_count": 0,
  "is_binary": true,
  "is_truncated": false
}
```

**Raw Content**: When the request includes `Accept: application/octet-stream`, the response is raw file bytes with `Content-Type: application/octet-stream` and `Content-Disposition: attachment; filename="<basename>"`. No JSON wrapping. Files over 5 MB requested as raw return `422`.

**Error Responses**:

| Status | Condition |
|--------|------------------------------------------|
| `400` | Missing/invalid owner, repo, change_id, or path; path traversal detected; invalid encoding; trailing slash |
| `401` | Private repository, no valid auth |
| `403` | Authenticated but insufficient permissions |
| `404` | Repository, change, or file not found |
| `422` | File exceeds 5 MB for raw download |
| `429` | Rate limit exceeded |
| `500` | Internal jj subprocess failure |

---

### SDK Shape

The existing `RepoHostService.getFileAtChange()` method is extended to return enriched metadata.

**Interface**:
```typescript
interface FileContentResponse {
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

**Method signature**:
```typescript
async getFileAtChange(
  owner: string,
  repo: string,
  changeId: string,
  filePath: string,
  options?: { encoding?: "utf8" | "base64"; maxSize?: number }
): Promise<Result<FileContentResponse, APIError>>
```

The method must:
1. Call `jj file show -r <changeId> <filePath>` to retrieve content.
2. Detect binary content via null-byte scan of the first 8,192 bytes.
3. Compute `size` in bytes and `line_count` (count of `\n` + 1 for non-empty files; 0 for empty).
4. Detect language via the existing `detectLanguage()` function.
5. Truncate content at 5 MB and set `is_truncated: true` if the file exceeds that limit.

**Shared data hook** (`@codeplane/ui-core`):
```typescript
function useFileContent(
  owner: string,
  repo: string,
  changeId: string,
  filePath: string
): {
  data: FileContentResponse | undefined;
  error: APIError | undefined;
  isLoading: boolean;
  refetch: () => void;
}
```

This hook is consumed by both web and TUI clients, providing AbortController-based cancellation when the selected file changes.

---

### Web UI Design

The text file preview is the right panel of the **Code Explorer** view at `/:owner/:repo/code`.

When a user selects a text file in the file tree:

1. The UI calls `GET /api/repos/:owner/:repo/file/:change_id/<path>` where `change_id` is derived from the currently selected bookmark.
2. A **file header bar** renders at the top of the panel:
   - File path (relative, with breadcrumb-style segments — clicking a segment navigates to that directory in the tree)
   - Language badge (e.g., `TypeScript` in a muted pill)
   - File size in human-readable format (e.g., `2.4 KB`)
   - Line count (e.g., `64 lines`)
   - "Raw" button — opens `Accept: application/octet-stream` URL in new tab
   - "Copy" button — copies file content to clipboard (text files only)
3. A **code content block** renders below:
   - Syntax-highlighted text using the `language` field for highlighter selection
   - Line numbers in a fixed-width muted gutter
   - Scrollable content area
   - On hover, line number background highlights
4. **Truncated files** show a banner: "File truncated at 5 MB — download full file" with a raw download link.
5. **Empty files** show a centered "Empty file" message in muted text.
6. **Binary files** show: "Binary file (45.2 KB) — download" with a raw download link. (Rich binary previews are handled by JJ_FILE_PREVIEW_IMAGE, JJ_FILE_PREVIEW_PDF.)
7. **Loading state**: skeleton placeholder matching file header and content layout.
8. **Error state**: inline error message with "Retry" button.

---

### TUI UI

The TUI file preview occupies the main (right) panel of the code explorer screen.

**Layout**:
```
┌──────────┬───────────────────────────────────────┐
│ File     │ src/lib/utils.ts  TypeScript  2.4 KB  │ ← Header bar (1 row, pinned)
│ Tree     ├───────────────────────────────────────┤
│ (25%)    │   1 │ import { join } from "path";    │ ← Syntax-highlighted code
│          │   2 │                                  │
│          │   3 │ export function slugify(         │
│          │ ... │                                  │
└──────────┴───────────────────────────────────────┘
```

**File header bar** (1 row, always visible): file path (truncated with `…/` if needed), language label (max 20 chars), size (max 8 chars), line count (comma-formatted, max 14 chars). Binary files show `BINARY` badge. Non-UTF-8 files show `NON-UTF8` badge.

**Content body**:
- Text files rendered via `<code>` with syntax highlighting from OpenTUI's `SyntaxStyle` and line numbers in a muted gutter (4-char at <120 cols, 6-char at ≥120 cols).
- Empty files: "File is empty." centered in muted text.
- Large files (>100,000 lines or >5 MB): first 10,000 lines with "— truncated —" footer.
- Binary files: "Binary file — preview not available." centered.

**Keyboard shortcuts**:

| Key | Action |
|-----|--------|
| `j` / `Down` | Scroll down one line |
| `k` / `Up` | Scroll up one line |
| `Ctrl+D` | Page down (half viewport) |
| `Ctrl+U` | Page up (half viewport) |
| `G` | Jump to bottom |
| `g g` | Jump to top |
| `y` | Copy file path to clipboard |
| `Y` | Copy file content (text only, max 1 MB) |
| `n` | Toggle line numbers (normal mode) / Next match (search mode) |
| `N` | Previous search match |
| `w` | Toggle word wrap |
| `/` | Activate in-file search |
| `Esc` | Clear search / Pop screen |
| `h` / `Left` | Return focus to file tree |
| `R` | Retry failed fetch (error state only) |
| `q` | Pop code explorer screen |
| `?` | Show help overlay |

**Search behavior**: Incremental literal text matching. Matches highlighted in reverse-video `warning` color, active match in `primary` color. `n`/`N` cycle through matches wrapping at both ends. Match count displayed as `current/total`. Debounced by 150ms for files >5,000 lines. Max 10,000 matches tracked. Max 256-character search input.

**Responsive breakpoints**:
- 80×24 – 119×39: Full-width preview (sidebar hidden), 4-char gutter, path truncated with `…/`.
- 120×40 – 199×59: 25% sidebar / 75% preview, 6-char gutter, full path.
- 200×60+: Wider margins, 6-char gutter with extra spacing.

---

### CLI Command

**Command**: `codeplane change cat <change_id> <path>`

**Alias**: `codeplane change show-file <change_id> <path>`

**Options**:

| Flag | Description |
|------|-------------|
| `--repo, -R` | Repository in `OWNER/REPO` format (auto-detected from cwd in a jj repo) |
| `--json` | Output as JSON with metadata (language, size, line_count, is_binary, is_truncated) |
| `--raw` | Output raw bytes without framing (default for non-JSON mode) |
| `--encoding` | Force base64 encoding in JSON output |

**Behavior**:
- **Local mode** (inside a jj repo, no `--repo`): shells out to `jj file show -r <change_id> <path>` directly, bypassing the API.
- **Remote mode** (`--repo` specified or not in a jj repo): calls `GET /api/repos/:owner/:repo/file/:change_id/<path>`.
- Default output (no `--json`): raw file content to stdout, suitable for piping.
- JSON output: full `FileContentResponse` object.
- Exit code `0` on success, `1` on not-found or error (with human-readable stderr message).

**Examples**:
```bash
# View a file at working copy
codeplane change cat @ src/main.ts

# Remote repo, specific change
codeplane change cat ksqxyz src/lib.ts -R acme/myrepo

# Pipe to another tool
codeplane change cat ksqxyz package.json | jq .dependencies

# JSON output with metadata
codeplane change cat ksqxyz README.md --json
```

---

### Documentation

1. **API Reference — File Content at Change** (`docs/api/file-content.mdx`):
   - Endpoint URL, path and query parameters.
   - Request/response examples for text, binary, truncated, empty, and error cases.
   - curl examples with and without authentication.
   - Raw download via `Accept: application/octet-stream`.
   - Rate limiting documentation.

2. **Repository Guide update** (`docs/guides/repositories.mdx`):
   - "Browsing File Contents" section under existing "Code Browsing" heading.
   - Explanation of change-ID-based file viewing and its stability guarantees.
   - curl example.

3. **CLI Reference update** (`docs/cli/change.mdx`):
   - Document `change cat` command with all options and examples.
   - Document local vs. remote mode behavior.
   - Piping and structured output examples.

4. **TUI Guide update** (`docs/guides/tui.mdx`):
   - File preview keyboard shortcuts reference table.
   - Search, copy, and navigation instructions.

## Permissions & Security

### Authorization Matrix

| Role | Public Repository | Private Repository |
|------|---------------------|--------------------|
| **Anonymous** | ✅ Read | ❌ 401 |
| **Authenticated (no repo access)** | ✅ Read | ❌ 403 |
| **Repository Read** | ✅ Read | ✅ Read |
| **Repository Write** | ✅ Read | ✅ Read |
| **Repository Admin** | ✅ Read | ✅ Read |
| **Owner** | ✅ Read | ✅ Read |
| **Org Member (team read)** | ✅ Read | ✅ Read |
| **Deploy Key (read)** | ✅ Read (via SSH/API) | ✅ Read (via SSH/API) |

This is a **read-only** endpoint. There is no write or delete path. Authorization follows the same repository read-access check used by other repository content endpoints (tree, refs, commits).

For the TUI specifically: the TUI requires authentication at bootstrap, so unauthenticated sessions never reach the file preview screen. Private repositories that the user cannot access return `404` (not `403`) to avoid leaking repository existence.

### Rate Limiting

| Consumer | Limit | Window |
|----------|-------|--------|
| Anonymous | 60 requests | per hour, per IP |
| Authenticated user | 5,000 requests | per hour, per token/session |
| Deploy key | 5,000 requests | per hour, per key |
| Agent session | 10,000 requests | per hour, per session |

Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) must be included in all responses. `429` responses must include `Retry-After` header.

In the TUI and web UI, rapid file selection (user clicking through files quickly) uses AbortController to cancel in-flight requests — only the final request counts against rate limits.

### Data Privacy & Security

- **Path traversal prevention**: File paths containing `..` sequences must be rejected at the route layer (before reaching the SDK service). The SDK layer already sanitizes owner/repo with `replace(/\.\./g, "_")`, and jj's `file show` operates within the repository sandbox.
- **No PII exposure**: File content is repository data, not user PII. File content must **never** be included in server logs.
- **Secrets in repositories**: The API serves whatever jj stores. If a user has committed a `.env` file, the API will serve it. This is consistent with every other forge. No warning headers are added; this is a user responsibility.
- **CORS**: The endpoint inherits the server's existing CORS policy.
- **Content-Type safety**: JSON responses always use `application/json`. Raw downloads use `application/octet-stream` with `X-Content-Type-Options: nosniff` to prevent browser content sniffing.
- **TUI client**: Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable. Token is never displayed, logged, or included in error messages. File content is held in memory only — never written to disk.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `FileContentViewed` | Successful 200 response serving file content | `owner`, `repo`, `change_id`, `file_path`, `language`, `size_bytes`, `is_binary`, `is_truncated`, `client` (`web`/`cli`/`tui`/`api`/`agent`), `encoding`, `response_time_ms` |
| `FileContentNotFound` | 404 response (file, change, or repo not found) | `owner`, `repo`, `change_id`, `file_path`, `not_found_reason` (`change`/`file`/`repo`) |
| `FileContentRawDownload` | Raw octet-stream download (Accept header) | `owner`, `repo`, `change_id`, `file_path`, `size_bytes`, `is_binary` |
| `FileContentRateLimited` | 429 response | `owner`, `repo`, `consumer_type` (`anonymous`/`authenticated`/`deploy_key`/`agent`) |
| `FileContentCopied` | User copies file content or path (web/TUI) | `owner`, `repo`, `file_path`, `copy_type` (`path`/`content`), `client`, `size_bytes` |
| `FileContentSearched` | User searches within a file (web/TUI) | `owner`, `repo`, `file_path`, `query_length`, `match_count`, `client` |
| `FileContentTruncated` | File exceeded 5 MB, truncated content served | `owner`, `repo`, `file_path`, `actual_size_bytes`, `language` |

### Funnel Metrics & Success Indicators

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| **File view adoption** | % of weekly active users who view at least one file | > 60% of WAU |
| **Code Explorer engagement** | Median files viewed per Code Explorer session | > 3 files per session |
| **Preview load success rate** | % of file preview requests that return 200 | > 98% |
| **Preview load latency (p50/p95)** | Time from request to rendered content | p50 < 500ms, p95 < 2s |
| **In-file search usage** | % of file preview sessions where search is used | > 15% |
| **Copy usage** | % of sessions with path or content copy | > 8% |
| **API consumer diversity** | Request distribution across client types | Web > 40%, CLI > 15%, API/Agent > 10% |
| **Error rate** | % of requests returning 4xx/5xx | < 2% for 4xx, < 0.1% for 5xx |
| **Binary file encounter rate** | % of file views that are binary (indicates need for JJ_FILE_PREVIEW_IMAGE) | Tracking only |
| **Truncation rate** | % of file views that are truncated | < 5% |

## Observability

### Logging

| Log Point | Level | Structured Context | Notes |
|-----------|-------|--------------------|-------|
| Request received | `debug` | `owner`, `repo`, `change_id`, `file_path`, `user_id`, `request_id` | Never log file content |
| File content served | `info` | `owner`, `repo`, `change_id`, `file_path`, `size_bytes`, `language`, `is_binary`, `is_truncated`, `duration_ms` | Primary success log |
| File not found | `info` | `owner`, `repo`, `change_id`, `file_path`, `not_found_reason` | Expected user error |
| Change not found | `info` | `owner`, `repo`, `change_id` | Expected user error |
| Repository not found | `warn` | `owner`, `repo` | May indicate stale links or probing |
| jj subprocess failure | `error` | `owner`, `repo`, `change_id`, `file_path`, `exit_code`, `stderr` (truncated to 500 chars) | Operational issue — never log full file content |
| jj subprocess timeout | `error` | `owner`, `repo`, `change_id`, `file_path`, `timeout_ms` | Process hung or I/O bottleneck |
| Path traversal attempt | `warn` | `owner`, `repo`, `file_path`, `remote_ip`, `user_id` | Security-relevant, correlate with IP |
| Rate limit exceeded | `warn` | `owner`, `repo`, `consumer_type`, `remote_ip` | Track burst patterns |
| Binary file detected | `debug` | `owner`, `repo`, `file_path`, `size_bytes` | Useful for understanding content mix |
| File truncated | `info` | `owner`, `repo`, `file_path`, `actual_size_bytes`, `truncated_at_bytes` | Track large file patterns |
| Raw download served | `info` | `owner`, `repo`, `file_path`, `size_bytes`, `duration_ms` | Separate from JSON responses |
| Invalid encoding parameter | `info` | `owner`, `repo`, `encoding_value` | Client sending bad parameters |

All logs are structured JSON. File content is **never** included in any log line at any level.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_file_content_requests_total` | Counter | `status` (2xx/4xx/5xx), `client` (web/cli/tui/api/agent) | Total file content requests |
| `codeplane_file_content_duration_seconds` | Histogram | `is_binary` (true/false) | End-to-end request duration (buckets: 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_file_content_size_bytes` | Histogram | `language`, `is_binary` | Size distribution of served files (buckets: 1KB, 10KB, 100KB, 500KB, 1MB, 5MB) |
| `codeplane_file_content_jj_subprocess_duration_seconds` | Histogram | | Time spent in `jj file show` subprocess |
| `codeplane_file_content_errors_total` | Counter | `error_type` (`not_found`/`traversal`/`subprocess`/`internal`/`rate_limit`) | Error breakdown |
| `codeplane_file_content_truncated_total` | Counter | | Files that exceeded 5 MB and were truncated |
| `codeplane_file_content_binary_total` | Counter | | Binary file requests |
| `codeplane_file_content_active_jj_subprocesses` | Gauge | | Currently running jj file show processes |

### Alerts & Runbooks

**Alert 1: High jj Subprocess Error Rate**
- **Condition**: `rate(codeplane_file_content_errors_total{error_type="subprocess"}[5m]) > 0.5`
- **Severity**: `warning`
- **Runbook**:
  1. Check if `jj` binary is available on the server: `which jj && jj version`.
  2. Check disk space on the repos data directory: `df -h $CODEPLANE_DATA_DIR/repos`.
  3. Check for jj lock contention: look for stale `.jj/repo/op_store/lock` files.
  4. Check server logs filtered by `error_type=subprocess` — the `stderr` field contains the jj error message.
  5. If jj is segfaulting, check version compatibility and consider upgrading.
  6. If repo-specific, try `jj file show` manually in that repo's directory.
  7. Check for Bun subprocess spawning limits (`ulimit -u`).

**Alert 2: High Latency (p95 > 5s)**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_file_content_duration_seconds_bucket[5m])) > 5`
- **Severity**: `warning`
- **Runbook**:
  1. Check `codeplane_file_content_jj_subprocess_duration_seconds` — if jj subprocess time is high, the bottleneck is jj or disk I/O.
  2. Check system load: `top`, `iostat`. Large repos with deep history can slow jj.
  3. Use owner/repo labels to identify if specific repos are causing latency.
  4. Check `codeplane_file_content_active_jj_subprocesses` gauge — too many concurrent subprocesses may cause contention.
  5. Consider tuning jj's backend or enabling `native-backend` for large repos.

**Alert 3: Path Traversal Attempts**
- **Condition**: `increase(codeplane_file_content_errors_total{error_type="traversal"}[1h]) > 10`
- **Severity**: `critical`
- **Runbook**:
  1. This indicates potential attack activity. Query logs for `Path traversal attempt` entries.
  2. Extract `remote_ip` and `user_id` from structured logs.
  3. If a single IP is responsible, apply temporary IP-level blocking via WAF/firewall.
  4. If a user account is responsible, review the account for compromise.
  5. Verify path sanitization logic is working by testing `curl` with `..` paths.
  6. Escalate to security team if the pattern suggests coordinated probing.

**Alert 4: Sustained 5xx Rate > 5%**
- **Condition**: `rate(codeplane_file_content_requests_total{status="5xx"}[5m]) / rate(codeplane_file_content_requests_total[5m]) > 0.05`
- **Severity**: `critical`
- **Runbook**:
  1. Check server error logs for stack traces.
  2. Determine if the issue is global or scoped to specific repos.
  3. Verify jj binary health: `jj version`.
  4. Check for OOM conditions: `dmesg | grep -i oom`.
  5. Check Bun runtime health — subprocess spawn limits may be exhausted.
  6. If transient, check if a large push or repo operation is causing lock contention.
  7. Restart the server process if all other checks pass — may be a leaked resource.

**Alert 5: Rate Limit Spike**
- **Condition**: `rate(codeplane_file_content_errors_total{error_type="rate_limit"}[5m]) > 5`
- **Severity**: `info`
- **Runbook**:
  1. Check if a single IP/user is hitting limits (query logs for `consumer_type`, `remote_ip`).
  2. If it's an agent session, verify the agent is not in a loop.
  3. If legitimate use, consider increasing rate limits for that consumer type.
  4. If abusive, apply IP or token-level blocking.

### Error Cases & Failure Modes

| Error Case | HTTP Status | Detection | Impact | Mitigation |
|------------|-------------|-----------|--------|------------|
| jj binary not found | 500 | Subprocess spawn error | All file content requests fail | Pre-flight check at server startup |
| Repository directory missing | 404 | `ensureRepo()` check | Single repo | Expected for deleted repos; log at warn |
| jj lock contention | 500 | jj stderr contains "lock" | Temporary, per-repo | Retry with exponential backoff in service layer |
| Disk full | 500 | jj stderr or OS error | All repos on volume | Alert on disk space separately |
| File too large for memory | 500 | OOM or Bun crash | Single request | Enforce 5 MB streaming limit |
| Invalid UTF-8 in file | 200 (binary) | Null-byte heuristic | None — handled as binary | Binary detection covers this |
| jj version incompatibility | 500 | Unexpected stderr format | Parse failures | Pin supported jj version range in docs |
| jj subprocess timeout | 500 | Process exceeds 30s | Single request | Kill subprocess, return 500 with timeout message |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `API-FPT-001` | `GET /api/repos/:owner/:repo/file/:change_id/src/main.ts` for a known `.ts` file | `200`, JSON with `content` matching file, `language: "typescript"`, `is_binary: false`, `size > 0`, `line_count > 0` |
| `API-FPT-002` | `GET /api/repos/:owner/:repo/file/:change_id/README.md` for a known markdown file | `200`, `language: "markdown"`, content starts with expected header |
| `API-FPT-003` | `GET /api/repos/:owner/:repo/file/:change_id/src/lib.py` for a known Python file | `200`, `language: "python"` |
| `API-FPT-004` | `GET /api/repos/:owner/:repo/file/:change_id/nonexistent.txt` | `404`, message contains "not found" |
| `API-FPT-005` | `GET /api/repos/:owner/:repo/file/zzzzzzzzzzzzzzzz/any.txt` (invalid change ID) | `404`, message contains "change" and "not found" |
| `API-FPT-006` | `GET /api/repos/nonexistent-owner/nonexistent-repo/file/@/any.txt` | `404`, message contains "not found" |
| `API-FPT-007` | `GET /api/repos/:owner/:repo/file/:change_id/` (empty path) | `400`, message contains "path is required" |
| `API-FPT-008` | `GET /api/repos/:owner/:repo/file/:change_id/../../../etc/passwd` | `400`, message contains "path traversal" or "invalid path" |
| `API-FPT-009` | `GET /api/repos/:owner/:repo/file/:change_id/foo/../../etc/passwd` (embedded traversal) | `400`, path traversal |
| `API-FPT-010` | `GET /api/repos/:owner/:repo/file/:change_id/assets/logo.png` for a binary file | `200`, `is_binary: true`, `content: null` |
| `API-FPT-011` | `GET /api/repos/:owner/:repo/file/:change_id/assets/logo.png?encoding=base64` | `200`, `is_binary: true`, `content` is valid base64, `encoding: "base64"` |
| `API-FPT-012` | `GET /api/repos/:owner/:repo/file/:change_id/empty.txt` for an empty file | `200`, `content: ""`, `size: 0`, `line_count: 0`, `is_binary: false` |
| `API-FPT-013` | `GET /api/repos/:owner/:repo/file/:change_id/src/main.ts` with `Accept: application/octet-stream` | `200`, `Content-Type: application/octet-stream`, `Content-Disposition` header present, body is raw bytes |
| `API-FPT-014` | Request with valid session cookie on a public repo | `200` |
| `API-FPT-015` | Request with valid PAT on a private repo | `200` |
| `API-FPT-016` | Anonymous request on a private repo | `401` |
| `API-FPT-017` | Authenticated user with no repo access on private repo | `403` |
| `API-FPT-018` | `GET /api/repos/:owner/:repo/file/@/src/main.ts` (using `@` revset alias) | `200`, returns working copy content |
| `API-FPT-019` | File path with spaces: `.../file/:change_id/docs/my%20file.md` | `200`, path decoded correctly |
| `API-FPT-020` | File path with Unicode: `.../file/:change_id/docs/%E6%97%A5%E6%9C%AC%E8%AA%9E.md` | `200` if exists, `404` if not (no 400/500) |
| `API-FPT-021` | Deeply nested path (100 directory components) | `200` if file exists, `404` if not |
| `API-FPT-022` | File at exactly 5 MB (5,242,880 bytes) | `200`, `is_truncated: false`, full content returned |
| `API-FPT-023` | File at 5 MB + 1 byte (5,242,881 bytes) | `200`, `is_truncated: true`, content is exactly 5 MB |
| `API-FPT-024` | File path with trailing slash: `.../file/:change_id/src/` | `400` |
| `API-FPT-025` | Missing `change_id` (malformed URL) | `400` or `404` (route mismatch) |
| `API-FPT-026` | `owner` parameter is empty string | `400` |
| `API-FPT-027` | `repo` parameter is empty string | `400` |
| `API-FPT-028` | 10 concurrent requests for the same file | All return `200` with identical content |
| `API-FPT-029` | 10 concurrent requests for different files in same repo | All return correct respective content |
| `API-FPT-030` | Request for `.jj/config.toml` (internal jj file) | `404` (jj excludes its internals) |
| `API-FPT-031` | File with no extension (e.g., `Makefile`) | `200`, `language` correctly detected or `null` |
| `API-FPT-032` | File with `.ts` extension but 0 bytes | `200`, `language: "typescript"`, `content: ""`, `size: 0` |
| `API-FPT-033` | `?encoding=invalid` | `400` |
| `API-FPT-034` | `?encoding=base64` on a text file | `200`, content is base64-encoded text, `encoding: "base64"` |
| `API-FPT-035` | File path longer than 4,096 characters | `400` |
| `API-FPT-036` | Send 61 anonymous requests in under 1 hour from same IP | 61st returns `429` with `Retry-After` header |
| `API-FPT-037` | Response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers | All three headers present with numeric values |
| `API-FPT-038` | `GET /api/repos/:owner/:repo/file/:change_id/.gitignore` (tracked dotfile) | `200`, content returned |
| `API-FPT-039` | File with extremely long single line (1 MB, no newlines) | `200`, `line_count: 1`, no crash |
| `API-FPT-040` | Raw download of file > 5 MB with `Accept: application/octet-stream` | `422` |
| `API-FPT-041` | Response `Content-Type` is `application/json` for JSON responses | Header value matches |
| `API-FPT-042` | `@-` (parent of working copy) as change_id | `200` if parent exists |

### CLI Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CLI-FPT-001` | `codeplane change cat @ src/main.ts` in a local jj repo | Exit 0, stdout contains file content |
| `CLI-FPT-002` | `codeplane change cat @ src/main.ts --json` | Exit 0, stdout is valid JSON with `path`, `content`, `language`, `size`, `line_count` fields |
| `CLI-FPT-003` | `codeplane change cat @ nonexistent.txt` | Exit 1, stderr contains "not found" |
| `CLI-FPT-004` | `codeplane change cat badchangeid src/main.ts` | Exit 1, stderr contains error message |
| `CLI-FPT-005` | `codeplane change cat <change_id> src/main.ts -R owner/repo` (remote) | Exit 0, stdout contains file content |
| `CLI-FPT-006` | `codeplane change cat @ package.json | jq .name` (pipe test) | Exit 0, jq receives valid JSON |
| `CLI-FPT-007` | `codeplane change cat @ README.md --raw` | Exit 0, raw content output, no JSON framing |
| `CLI-FPT-008` | `codeplane change cat` with no arguments | Exit 1, usage help shown |
| `CLI-FPT-009` | `codeplane change cat @ empty.txt` (empty file) | Exit 0, stdout is empty |
| `CLI-FPT-010` | `codeplane change cat @ empty.txt --json` | Exit 0, JSON with `content: ""`, `size: 0` |
| `CLI-FPT-011` | `codeplane change cat @ binary.png --json` | Exit 0, JSON with `is_binary: true`, `content: null` |
| `CLI-FPT-012` | `codeplane change show-file @ src/main.ts` (alias) | Exit 0, same output as `change cat` |

### E2E Playwright Tests (Web UI)

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `E2E-FPT-001` | Navigate to Code Explorer, click a `.ts` file | File preview panel shows syntax-highlighted TypeScript; header shows path, "TypeScript" badge, size, line count |
| `E2E-FPT-002` | Navigate to Code Explorer, click an empty file | "Empty file" message displayed; header shows `0 B` and `0 lines` |
| `E2E-FPT-003` | Navigate to Code Explorer, click a binary file | "Binary file" placeholder with download link; `BINARY` badge in header |
| `E2E-FPT-004` | Click "Raw" button in file header | New tab/window opens with raw file content (`Content-Type: application/octet-stream`) |
| `E2E-FPT-005` | Click "Copy" button in file header for a text file | Clipboard contains file content |
| `E2E-FPT-006` | Switch bookmark in the picker | File tree and file preview reload for new bookmark's change |
| `E2E-FPT-007` | Navigate to a file URL directly (deep link `/:owner/:repo/code/:change_id/src/main.ts`) | File content loads correctly |
| `E2E-FPT-008` | Access Code Explorer on a private repo while unauthenticated | Redirect to login |
| `E2E-FPT-009` | File header line count matches actual content line count | Values are consistent |
| `E2E-FPT-010` | File header size is displayed in human-readable format | e.g., `2.4 KB` not `2457` |
| `E2E-FPT-011` | Truncated file shows truncation banner | Banner text: "File truncated at 5 MB" with download link |
| `E2E-FPT-012` | Unknown file extension shows no language badge (or "Plain Text") | No syntax highlighting errors |
| `E2E-FPT-013` | Loading state shows skeleton/spinner | Visible skeleton before content renders |
| `E2E-FPT-014` | Error state shows error message with retry | Inline error with "Retry" button; clicking retry re-fetches |
| `E2E-FPT-015` | Line numbers are visible and sequential | Gutter shows `1`, `2`, `3`, ... in order |
| `E2E-FPT-016` | Breadcrumb navigation shows file path segments | Clicking a breadcrumb segment navigates to that directory |

### TUI Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `TUI-FPT-001` | Open Code Explorer, select a `.ts` file | Header bar shows path, "TypeScript", size, line count; content is syntax-highlighted |
| `TUI-FPT-002` | Scroll file with `j`/`k` | Content scrolls line by line; line numbers update |
| `TUI-FPT-003` | `Ctrl+D` / `Ctrl+U` page scrolling | Content pages down/up by half viewport height |
| `TUI-FPT-004` | `G` jumps to bottom, `g g` jumps to top | Last/first line visible respectively |
| `TUI-FPT-005` | Press `y` on a file | "Path copied!" confirmation; clipboard contains file path |
| `TUI-FPT-006` | Press `Y` on a text file | "Content copied!" confirmation; clipboard contains file content |
| `TUI-FPT-007` | Press `Y` on a binary file | "Cannot copy binary file content" message |
| `TUI-FPT-008` | Select a binary file | "Binary file — preview not available." message; `BINARY` badge |
| `TUI-FPT-009` | Select an empty file | "File is empty." message; `0 B`, `0 lines` in header |
| `TUI-FPT-010` | Press `/`, type search term, see matches highlighted | Search bar appears; matches highlighted in reverse-video |
| `TUI-FPT-011` | `n` in search mode navigates to next match | Active match changes |
| `TUI-FPT-012` | `N` in search mode navigates to previous match | Active match changes in reverse |
| `TUI-FPT-013` | Search wraps at end (last match + `n` → first match) | Wrapping behavior confirmed |
| `TUI-FPT-014` | Search with no matches shows "No matches" | Status text visible |
| `TUI-FPT-015` | `Esc` clears search | Search bar disappears, highlights removed |
| `TUI-FPT-016` | `n` outside search mode toggles line numbers | Line numbers toggle on/off |
| `TUI-FPT-017` | `w` toggles word wrap | Long lines wrap/truncate |
| `TUI-FPT-018` | `h` / `Left` returns focus to file tree | Tree is focused; preview remains visible |
| `TUI-FPT-019` | `R` retries in error state | New fetch attempt; content loads on success |
| `TUI-FPT-020` | `R` is no-op when content is loaded | No change |
| `TUI-FPT-021` | `q` pops the screen | Code explorer closes |
| `TUI-FPT-022` | `?` shows help overlay | Keyboard shortcut reference displayed |
| `TUI-FPT-023` | Rapid file selection (A then B quickly) | Only B's content renders; A's fetch aborted |
| `TUI-FPT-024` | Large file (>100K lines) shows truncation footer | "— truncated —" visible; only first 10K lines |
| `TUI-FPT-025` | 80×24 terminal: full-width preview, 4-char gutter | Layout matches spec |
| `TUI-FPT-026` | 120×40 terminal: sidebar 25%, preview 75%, 6-char gutter | Layout matches spec |
| `TUI-FPT-027` | Terminal resize preserves scroll position | Scroll offset maintained across resize |
| `TUI-FPT-028` | 401 response propagates to auth error screen | TUI auth error screen displayed |
| `TUI-FPT-029` | 429 response shows rate limit message | "Rate limited. Retry in Ns." inline |
| `TUI-FPT-030` | File with unknown extension shows "Plain Text" | No syntax highlighting; label correct |
