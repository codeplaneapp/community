# JJ_FILE_CONTENT_API

Specification for JJ_FILE_CONTENT_API.

## High-Level User POV

When working with a jj-native repository on Codeplane, developers need to view the contents of any file at any point in the repository's history. Unlike traditional git-based forges that tie file browsing to branches and commits, Codeplane lets users retrieve the exact content of a file using a jj **change ID** — the stable, immutable identifier that jj assigns to every change in the repository.

A developer browsing a repository in the web UI's Code Explorer clicks a file in the tree and immediately sees its contents rendered with syntax highlighting, with the active change (or bookmark) selected in a picker above the tree. A CLI user runs `codeplane change cat <change-id> <path>` and gets the raw file content streamed to their terminal, ready to pipe into other tools. A TUI user selects a file in the tree panel and sees a syntax-highlighted preview in the adjacent pane. An agent operating against the repository's API fetches file content at a specific change to understand context before making a code suggestion.

The value is directness: instead of mentally mapping between branch names, commit SHAs, and content, users ask for exactly the file they want at the change they care about. Because jj change IDs are stable across rebases and rewrites, bookmarks and links to specific file versions remain valid even as the repository history evolves.

This API is foundational. It powers the code explorer, README rendering, file previews in landing request reviews, agent context retrieval, and any surface that needs to display or process a file from a Codeplane repository.

## Acceptance Criteria

### Definition of Done

- [ ] The server route `GET /api/repos/:owner/:repo/file/:change_id/*` is fully implemented (no longer returns 501).
- [ ] The route delegates to the existing `RepoHostService.getFileAtChange()` SDK method.
- [ ] The response includes the file path, content, detected language, byte size, and line count.
- [ ] Binary files are detected and return a `is_binary: true` indicator with content omitted (or base64-encoded, per accept header).
- [ ] The CLI exposes a `change cat <change_id> <path>` command that outputs raw file content.
- [ ] All clients (web, TUI, CLI) can consume this endpoint to display file content.
- [ ] E2E tests cover the happy path, error paths, and boundary conditions.
- [ ] Documentation is updated in the repository guides.

### Functional Constraints

- [ ] The `owner` path parameter must be a non-empty string matching `^[a-zA-Z0-9_.-]{1,39}$`.
- [ ] The `repo` path parameter must be a non-empty string matching `^[a-zA-Z0-9_.-]{1,100}$`.
- [ ] The `change_id` path parameter must be a valid jj change ID string (hex, 1–64 characters). The API must also accept jj revset shorthand such as `@` (working copy).
- [ ] The file path (wildcard remainder) must be a non-empty, forward-slash-delimited relative path. It must not contain `..` path traversal sequences. Maximum path length is 4,096 characters.
- [ ] The API must URL-decode the file path to support paths with spaces and special characters.
- [ ] If the repository does not exist, return `404` with `{"message": "repository not found"}`.
- [ ] If the change ID does not resolve to any known change, return `404` with `{"message": "change '<id>' not found"}`.
- [ ] If the file path does not exist at the given change, return `404` with `{"message": "file '<path>' not found at change '<id>'"}`.
- [ ] If the file is larger than 5 MB, the API must return a `200` response with `is_truncated: true` and the first 5 MB of content, or a `422` if raw content was requested and exceeds the limit.
- [ ] Empty files must return a `200` with `content: ""`, `size: 0`, `line_count: 0`.
- [ ] Binary files (detected via null-byte heuristic in the first 8,192 bytes) must set `is_binary: true` and omit `content` (returning `content: null`), unless the request includes `Accept: application/octet-stream`, in which case raw bytes are returned.
- [ ] The `language` field must be populated using the file extension detection logic already in `detectLanguage()` (70+ extensions). Files with unrecognized extensions return `language: null`.
- [ ] The API must handle symlinks: if jj resolves a symlink, the content of the target file is returned; the path in the response reflects the requested path, not the symlink target.
- [ ] Concurrent requests to the same file must not interfere with each other (jj subprocess isolation).
- [ ] The endpoint must respect repository visibility: private repositories require authentication; public repositories allow anonymous read access.

### Edge Cases

- [ ] File path with leading `/` is normalized (strip leading slash).
- [ ] File path with trailing `/` returns `400` ("path must refer to a file, not a directory").
- [ ] File path containing only whitespace after trimming returns `400`.
- [ ] Change ID containing non-hex characters returns `400` ("invalid change_id format") — unless it is a recognized revset alias (e.g., `@`, `@-`, `root()`).
- [ ] Repository that exists but has zero changes (freshly initialized, empty) returns `404` for any file request.
- [ ] File with extremely long single line (>1 MB single line) must not crash; it counts as 1 line.
- [ ] File path with Unicode characters (e.g., `docs/日本語.md`) must work correctly via URL encoding.
- [ ] `.gitignore`, `.jj/` internal files, and other jj-metadata files are not accessible through this API (jj's `file show` naturally excludes `.jj/` internals).

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
| `encoding` | `"utf8"` \| `"base64"` | `"utf8"` | How to encode the file content in the JSON response. `base64` is useful for binary files. |

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

**Response (200 OK, binary file)**:
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

**Response (200 OK, binary file with `?encoding=base64`)**:
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

**Raw Content**: When the request includes `Accept: application/octet-stream`, the response is the raw file bytes with `Content-Type: application/octet-stream` and a `Content-Disposition: attachment; filename="<basename>"` header. No JSON wrapping.

**Error Responses**:
| Status | Condition |
|--------|-----------|
| `400` | Missing or invalid owner, repo, change_id, or path; path traversal detected |
| `401` | Private repository, no valid auth |
| `403` | Authenticated but insufficient permissions |
| `404` | Repository, change, or file not found |
| `422` | File exceeds maximum size with raw download |
| `429` | Rate limit exceeded |
| `500` | Internal jj subprocess failure |

### SDK Shape

The existing `RepoHostService.getFileAtChange()` method is the foundation. It must be extended to return richer metadata:

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

The service method signature becomes:
```typescript
async getFileAtChange(
  owner: string,
  repo: string,
  changeId: string,
  filePath: string,
  options?: { encoding?: "utf8" | "base64"; maxSize?: number }
): Promise<Result<FileContentResponse, APIError>>
```

The service must:
1. Call `jj file show -r <changeId> <filePath>` to retrieve content.
2. Detect binary content via null-byte scan of the first 8,192 bytes.
3. Compute `size` in bytes and `line_count` (number of `\n` characters + 1 for non-empty files).
4. Detect language via the existing `detectLanguage()` function.
5. Truncate content at 5 MB and set `is_truncated: true` if the file exceeds that limit.

### CLI Command

**Command**: `codeplane change cat <change_id> <path>`

**Aliases**: `codeplane change show-file <change_id> <path>`

**Options**:
| Flag | Description |
|------|-------------|
| `--repo, -R` | Repository in `OWNER/REPO` format (auto-detected from cwd if in a jj repo) |
| `--json` | Output as JSON with metadata (language, size, line_count) |
| `--raw` | Output raw bytes without any framing (default for non-JSON mode) |
| `--encoding` | Force base64 encoding in JSON output |

**Behavior**:
- **Local mode** (inside a jj repository, no `--repo`): shells out to `jj file show -r <change_id> <path>` directly, bypassing the API.
- **Remote mode** (`--repo` specified or not in a jj repo): calls `GET /api/repos/:owner/:repo/file/:change_id/<path>`.
- Default output (no `--json`): raw file content to stdout, suitable for piping.
- JSON output: full `FileContentResponse` object.
- Exit code `1` on not-found errors with a human-readable stderr message.

**Examples**:
```bash
# View a file at the current working copy
codeplane change cat @ src/main.ts

# View a file at a specific change, remote repo
codeplane change cat ksqxyz src/lib.ts -R acme/myrepo

# Pipe to another tool
codeplane change cat ksqxyz package.json | jq .dependencies

# JSON output with metadata
codeplane change cat ksqxyz README.md --json
```

### Web UI Design

The file content API is consumed by the **Code Explorer** view at `/:owner/:repo/code`. When a user selects a file in the tree panel:

1. The UI calls `GET /api/repos/:owner/:repo/file/:change_id/<path>` where `change_id` is derived from the currently selected bookmark's `target_change_id`.
2. The response populates a **file preview panel** with:
   - A header showing the file path, language badge, file size, and line count.
   - Syntax-highlighted content using the `language` field for highlighter selection.
   - Line numbers in muted color.
3. Binary files show a placeholder message: "Binary file (45.2 KB) — download" with a link that fetches raw content via `Accept: application/octet-stream`.
4. Truncated files show a banner: "File truncated at 5 MB — download full file" with a raw download link.
5. Empty files show a centered "Empty file" message.

The Code Explorer also provides:
- A **bookmark/change picker** dropdown at the top of the tree to switch the reference change.
- **Breadcrumb navigation** reflecting the current file path.
- A **"Raw" button** in the file header that opens the raw content endpoint in a new tab.
- A **"Copy" button** to copy file content to the clipboard (text files only).

### TUI UI

The TUI file preview panel (when navigated to via the Code Explorer screen):

1. Fetches `GET /api/repos/:owner/:repo/file/:change_id/<path>`.
2. Renders a **file header bar**: `path | language | size | lines`.
3. Renders syntax-highlighted content with line numbers.
4. Keyboard: `j`/`k` scroll, `Ctrl+D`/`Ctrl+U` page, `G`/`gg` jump, `y` copy path, `Y` copy content, `/` search.
5. Binary files: "Binary file — cannot preview in terminal".
6. Truncated files: "[Truncated at 5 MB]" footer.

### Documentation

The following documentation must be written:

1. **API Reference — File Content at Change** (`docs/api/file-content.mdx`):
   - Endpoint URL, parameters, query options.
   - Request/response examples for text, binary, truncated, and error cases.
   - curl examples with and without authentication.
   - Note on raw download via `Accept: application/octet-stream`.

2. **Repository Guide update** (`docs/guides/repositories.mdx`):
   - Add a "Browsing File Contents" section under the existing "Code Browsing" heading.
   - Add `GET /api/repos/:owner/:repo/file/:change_id/*` to the API endpoint table.
   - Add curl example for fetching file content at a change.

3. **CLI Reference update** (`docs/cli/change.mdx` or equivalent):
   - Document `change cat` command with options and examples.
   - Document local vs. remote mode behavior.

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
| **Deploy Key (read)** | ✅ Read (via SSH) | ✅ Read (via SSH) |

This is a read-only endpoint. There is no write or delete path. Authorization follows the same repository read-access check used by other repository content endpoints.

### Rate Limiting

| Consumer | Limit | Window |
|----------|-------|--------|
| Anonymous | 60 requests | per hour, per IP |
| Authenticated user | 5,000 requests | per hour, per token/session |
| Deploy key | 5,000 requests | per hour, per key |
| Agent session | 10,000 requests | per hour, per session |

Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) must be included in all responses.

### Data Privacy & Security

- **Path traversal prevention**: The file path must be validated to reject `..` sequences. The SDK layer already sanitizes owner/repo with `replace(/\.\./g, "_")`, and jj's `file show` operates within the repository sandbox. The route layer must additionally reject paths containing `..` before passing to the service.
- **No PII exposure**: File content is repository data, not user PII. However, file content should not be logged (it could contain secrets checked into the repo).
- **Secrets in repositories**: The API serves whatever jj stores. If a user has committed a `.env` file, the API will serve it. This is expected behavior consistent with any forge. The response does not add any warning headers; this is a user responsibility.
- **CORS**: The endpoint inherits the server's existing CORS policy. Cross-origin requests from allowed origins are permitted.
- **Content-Type safety**: JSON responses always use `application/json`. Raw downloads use `application/octet-stream` to prevent browser content sniffing.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `FileContentViewed` | Successful 200 response | `owner`, `repo`, `change_id`, `file_path`, `language`, `size_bytes`, `is_binary`, `is_truncated`, `client` (`web`/`cli`/`tui`/`api`), `encoding` |
| `FileContentNotFound` | 404 response (file or change not found) | `owner`, `repo`, `change_id`, `file_path`, `not_found_reason` (`change`/`file`/`repo`) |
| `FileContentRawDownload` | Raw octet-stream download | `owner`, `repo`, `change_id`, `file_path`, `size_bytes`, `is_binary` |
| `FileContentRateLimited` | 429 response | `owner`, `repo`, `consumer_type` (`anonymous`/`authenticated`/`deploy_key`/`agent`) |

### Funnel Metrics

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| **File view adoption** | % of active users who view at least one file per week | > 60% of weekly active users |
| **Code Explorer engagement** | Median files viewed per Code Explorer session | > 3 files per session |
| **Binary file download rate** | % of binary file views that result in a raw download | Tracking only (no target) |
| **API consumer diversity** | % of requests from each client type | Web > 40%, CLI > 15%, API/Agent > 10% |
| **Error rate** | % of requests that return 4xx/5xx | < 2% for 4xx, < 0.1% for 5xx |

## Observability

### Logging

| Log Point | Level | Structured Context | Notes |
|-----------|-------|-------------------|-------|
| Request received | `debug` | `owner`, `repo`, `change_id`, `file_path`, `user_id`, `request_id` | Never log file content |
| File content served | `info` | `owner`, `repo`, `change_id`, `file_path`, `size_bytes`, `language`, `is_binary`, `is_truncated`, `duration_ms` | |
| File not found | `info` | `owner`, `repo`, `change_id`, `file_path`, `not_found_reason` | Expected user error |
| Change not found | `info` | `owner`, `repo`, `change_id` | Expected user error |
| Repository not found | `warn` | `owner`, `repo` | May indicate stale links |
| jj subprocess failure | `error` | `owner`, `repo`, `change_id`, `file_path`, `exit_code`, `stderr` (truncated to 500 chars) | Operational issue |
| Path traversal attempt | `warn` | `owner`, `repo`, `file_path`, `remote_ip`, `user_id` | Security-relevant |
| Rate limit exceeded | `warn` | `owner`, `repo`, `consumer_type`, `remote_ip` | |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_file_content_requests_total` | Counter | `owner`, `repo`, `status` (2xx/4xx/5xx), `client` | Total file content requests |
| `codeplane_file_content_duration_seconds` | Histogram | `owner`, `repo`, `is_binary` | Request duration from receipt to response |
| `codeplane_file_content_size_bytes` | Histogram | `language`, `is_binary` | Size distribution of served files |
| `codeplane_file_content_jj_subprocess_duration_seconds` | Histogram | | Time spent in `jj file show` subprocess |
| `codeplane_file_content_errors_total` | Counter | `error_type` (`not_found`/`traversal`/`subprocess`/`internal`) | Error breakdown |
| `codeplane_file_content_truncated_total` | Counter | | Files that exceeded 5 MB and were truncated |
| `codeplane_file_content_binary_total` | Counter | | Binary file requests |

### Alerts & Runbooks

**Alert 1: High jj Subprocess Error Rate**
- **Condition**: `rate(codeplane_file_content_errors_total{error_type="subprocess"}[5m]) > 0.5`
- **Severity**: `warning`
- **Runbook**:
  1. Check if `jj` binary is available: `which jj` on the server.
  2. Check disk space on the repos data directory: `df -h $CODEPLANE_DATA_DIR/repos`.
  3. Check for jj lock contention: look for `.jj/repo/op_store/lock` files that are stale.
  4. Check server logs for `jj subprocess failure` entries — the `stderr` field will contain the jj error message.
  5. If jj is segfaulting, check jj version compatibility and consider upgrading.
  6. If the error is repository-specific, try running `jj file show` manually in that repo directory.

**Alert 2: High Latency (p95 > 5s)**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_file_content_duration_seconds_bucket[5m])) > 5`
- **Severity**: `warning`
- **Runbook**:
  1. Check `codeplane_file_content_jj_subprocess_duration_seconds` — if jj subprocess time is high, the issue is on the jj/disk side.
  2. Check system load: `top`, `iostat`. Large repositories with deep history can cause slow jj operations.
  3. Check if specific repositories are causing the latency (use the `owner`/`repo` labels).
  4. Check for filesystem I/O bottlenecks on the repos data directory.
  5. Consider enabling jj's `native-backend` if not already enabled for large repos.

**Alert 3: Path Traversal Attempts**
- **Condition**: `increase(codeplane_file_content_errors_total{error_type="traversal"}[1h]) > 10`
- **Severity**: `critical`
- **Runbook**:
  1. This indicates potential attack activity. Check server logs for `Path traversal attempt` entries.
  2. Extract the `remote_ip` and `user_id` from structured logs.
  3. If a single IP is responsible, consider temporary IP-level blocking.
  4. If a single user is responsible, review their account for compromise.
  5. Verify the path sanitization logic is working correctly by testing manually.
  6. Escalate to security team if the pattern suggests coordinated probing.

**Alert 4: Sustained 5xx Rate > 5%**
- **Condition**: `rate(codeplane_file_content_requests_total{status="5xx"}[5m]) / rate(codeplane_file_content_requests_total[5m]) > 0.05`
- **Severity**: `critical`
- **Runbook**:
  1. Check server error logs for stack traces.
  2. Check if the issue is global or scoped to specific repositories.
  3. Verify jj binary health: `jj version`.
  4. Check for OOM conditions if serving very large files: `dmesg | grep -i oom`.
  5. Check Bun runtime health — subprocess spawning limits may be exhausted.
  6. If the issue is transient, check if a repository operation (e.g., large push) is causing temporary lock contention.

### Error Cases & Failure Modes

| Error Case | HTTP Status | Detection | Impact | Mitigation |
|------------|-------------|-----------|--------|------------|
| jj binary not found | 500 | Subprocess spawn error | All file content requests fail | Pre-flight check at server startup |
| Repository directory missing | 404 | `ensureRepo()` check | Single-repo impact | Expected for deleted repos; log at warn |
| jj lock contention | 500 | jj stderr contains "lock" | Temporary per-repo | Retry with exponential backoff in service layer |
| Disk full | 500 | jj stderr or OS error | All repos on that volume | Alert on disk space separately |
| File too large for memory | 500 | OOM or Bun crash | Single request | Enforce 5 MB streaming limit |
| Invalid UTF-8 in file | 200 (binary detection) | Null-byte heuristic | None — handled as binary | Binary detection covers this |
| jj version incompatibility | 500 | Unexpected stderr format | Parse failures | Pin supported jj version range in docs |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `API-FC-001` | `GET /api/repos/:owner/:repo/file/:change_id/src/main.ts` for a known text file | `200`, JSON body with `content` matching file, `language: "typescript"`, `is_binary: false`, `size > 0`, `line_count > 0` |
| `API-FC-002` | `GET /api/repos/:owner/:repo/file/:change_id/README.md` for a known markdown file | `200`, `language: "markdown"`, content starts with expected header |
| `API-FC-003` | `GET /api/repos/:owner/:repo/file/:change_id/nonexistent.txt` | `404`, message contains "not found" |
| `API-FC-004` | `GET /api/repos/:owner/:repo/file/zzzzzzzzzzzzzzzz/any.txt` (invalid change ID) | `404`, message contains "change" and "not found" |
| `API-FC-005` | `GET /api/repos/nonexistent-owner/nonexistent-repo/file/@/any.txt` | `404`, message contains "not found" |
| `API-FC-006` | `GET /api/repos/:owner/:repo/file/:change_id/` (empty path) | `400`, message contains "path is required" |
| `API-FC-007` | `GET /api/repos/:owner/:repo/file/:change_id/../../../etc/passwd` | `400`, message contains "invalid path" or "path traversal" |
| `API-FC-008` | `GET /api/repos/:owner/:repo/file/:change_id/assets/logo.png` for a binary file | `200`, `is_binary: true`, `content: null` |
| `API-FC-009` | `GET /api/repos/:owner/:repo/file/:change_id/assets/logo.png?encoding=base64` | `200`, `is_binary: true`, `content` is valid base64, `encoding: "base64"` |
| `API-FC-010` | `GET /api/repos/:owner/:repo/file/:change_id/empty.txt` for an empty file | `200`, `content: ""`, `size: 0`, `line_count: 0` |
| `API-FC-011` | `GET /api/repos/:owner/:repo/file/:change_id/src/main.ts` with `Accept: application/octet-stream` | `200`, `Content-Type: application/octet-stream`, `Content-Disposition` header present, body is raw file bytes |
| `API-FC-012` | Request with valid session cookie on a public repo | `200` |
| `API-FC-013` | Request with valid PAT on a private repo | `200` |
| `API-FC-014` | Anonymous request on a private repo | `401` |
| `API-FC-015` | Authenticated user with no repo access on a private repo | `403` |
| `API-FC-016` | `GET /api/repos/:owner/:repo/file/@/src/main.ts` (using `@` revset alias) | `200`, returns working copy file content |
| `API-FC-017` | File path with spaces: `GET /api/repos/:owner/:repo/file/:change_id/docs/my%20file.md` | `200`, path decoded correctly |
| `API-FC-018` | File path with Unicode: `GET /api/repos/:owner/:repo/file/:change_id/docs/%E6%97%A5%E6%9C%AC%E8%AA%9E.md` | `200` if file exists, `404` if not (but no 400/500) |
| `API-FC-019` | Deeply nested path (100 components): `GET /api/repos/:owner/:repo/file/:change_id/a/b/c/.../z/file.txt` | `200` if file exists, `404` if not |
| `API-FC-020` | File at exactly 5 MB | `200`, `is_truncated: false`, full content returned |
| `API-FC-021` | File at 5 MB + 1 byte | `200`, `is_truncated: true`, content is exactly 5 MB |
| `API-FC-022` | File path with trailing slash: `GET /api/repos/:owner/:repo/file/:change_id/src/` | `400` |
| `API-FC-023` | Missing `change_id` parameter (malformed URL) | `400` |
| `API-FC-024` | `owner` parameter is empty string | `400` |
| `API-FC-025` | `repo` parameter is empty string | `400` |
| `API-FC-026` | Concurrent requests (10 parallel) for the same file | All return `200` with identical content |
| `API-FC-027` | Concurrent requests (10 parallel) for different files in the same repo | All return correct respective content |
| `API-FC-028` | Request for `.jj/config.toml` (internal jj file) | `404` (jj does not track its own internals) |
| `API-FC-029` | File with no extension (e.g., `Makefile`, `Dockerfile`) | `200`, `language` correctly detected or `null` |
| `API-FC-030` | File with recognized extension but no content (0 bytes, `.ts` extension) | `200`, `language: "typescript"`, `content: ""`, `size: 0` |
| `API-FC-031` | Rate limit: send 61 anonymous requests in under 1 hour from same IP | 61st request returns `429` |

### CLI Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CLI-FC-001` | `codeplane change cat @ src/main.ts` in a local jj repo | Exit 0, stdout contains file content |
| `CLI-FC-002` | `codeplane change cat @ src/main.ts --json` | Exit 0, stdout is valid JSON with `path`, `content`, `language`, `size`, `line_count` |
| `CLI-FC-003` | `codeplane change cat @ nonexistent.txt` | Exit 1, stderr contains "not found" |
| `CLI-FC-004` | `codeplane change cat badchangeid src/main.ts` | Exit 1, stderr contains error |
| `CLI-FC-005` | `codeplane change cat <change_id> src/main.ts -R owner/repo` (remote) | Exit 0, stdout contains file content from remote |
| `CLI-FC-006` | `codeplane change cat @ package.json | jq .name` (pipe test) | Exit 0, jq receives valid JSON |
| `CLI-FC-007` | `codeplane change cat @ README.md --raw` | Exit 0, raw content, no JSON framing |
| `CLI-FC-008` | `codeplane change cat` with no arguments | Exit 1, usage help shown |

### E2E Playwright Tests (Web UI)

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `E2E-FC-001` | Navigate to Code Explorer, click a `.ts` file | File preview panel shows syntax-highlighted TypeScript |
| `E2E-FC-002` | Navigate to Code Explorer, click an empty file | "Empty file" message displayed |
| `E2E-FC-003` | Navigate to Code Explorer, click a binary file (e.g., `.png`) | "Binary file" placeholder with download link |
| `E2E-FC-004` | Click "Raw" button in file header | New tab opens with raw file content |
| `E2E-FC-005` | Click "Copy" button in file header | Clipboard contains file content |
| `E2E-FC-006` | Switch bookmark in the picker | File tree and file content reload for new bookmark's change |
| `E2E-FC-007` | Navigate to a file via breadcrumb | Correct file content is displayed |
| `E2E-FC-008` | Navigate to a file URL directly (deep link) | File content loads correctly |
| `E2E-FC-009` | Access Code Explorer on a private repo while unauthenticated | Redirect to login or 401 page |

### TUI Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `TUI-FC-001` | Open Code Explorer, select a file | File preview shows header bar with path, language, size |
| `TUI-FC-002` | Scroll file with `j`/`k` | Content scrolls line by line |
| `TUI-FC-003` | Press `y` on a file | File path copied to clipboard |
| `TUI-FC-004` | Press `Y` on a text file | File content copied to clipboard |
| `TUI-FC-005` | Select a binary file | "Binary file — cannot preview" message |
| `TUI-FC-006` | Press `/` and search for a string | Matching lines highlighted |
