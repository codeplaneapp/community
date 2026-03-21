# JJ_CHANGE_FILE_CONTENT_AT_REVISION

Specification for JJ_CHANGE_FILE_CONTENT_AT_REVISION.

## High-Level User POV

When a developer is reviewing a jj change in Codeplane — whether from the change detail view, a landing request review, or an agent session — they often need to see the full content of a specific file as it exists at that change's revision. This is different from simply browsing the repository tree at a change: the developer wants to understand a file in the context of the change that touched it, with awareness of whether the file was added, modified, deleted, or renamed.

A reviewer on a landing request clicks a modified file in the change stack. Instead of just seeing a diff, they want to read the complete file to understand the broader context around the changed lines. They select the "Full File" tab and see the file rendered with syntax highlighting, with the lines that were modified by this change softly highlighted in the background. They toggle to the "Previous" version to see the file as it existed before the change, verifying that their understanding of the old behavior is correct before approving.

A CLI user runs `codeplane change file-content <change_id> <path>` and gets the file content as it exists at that change's revision. They add `--side old` and get the file content as it existed at the parent revision, which they pipe into a diff tool alongside the new version. An agent fetches both old and new file content via the API to construct a full-context code review, comparing the file's state before and after the change to generate targeted review comments.

The value is contextual completeness. While the general file browsing API lets you view any file at any change, this change-scoped file content API enriches the response with change context: it tells you how this change affected this file, gives you access to both the old and new versions, and makes it easy to understand a file's full state within the scope of a single unit of work. This is the building block that enables inline code annotation, full-file review overlays, agent-driven code review, and landing request file previews across all Codeplane surfaces.

## Acceptance Criteria

### Definition of Done

- [ ] The server endpoint `GET /api/repos/:owner/:repo/changes/:change_id/content/*` is fully implemented (no 501 response).
- [ ] The endpoint returns file content at the change's revision by default (`side=new`) and at the parent revision when `side=old` is specified.
- [ ] The response includes change-contextual metadata: `change_type` (added, modified, deleted, renamed, copied, unchanged), `old_path` (for renames), and all standard file metadata (language, size, line_count, is_binary, is_truncated, encoding).
- [ ] The SDK method `getChangeFileContent()` is added to `RepoHostService` and returns a `ChangeFileContentResponse`.
- [ ] The CLI exposes `change file-content <change_id> <path>` with `--side`, `--json`, `--raw`, `--repo`, and `--encoding` options.
- [ ] The web UI change detail view and landing request review view consume this endpoint to show full-file previews with changed-line highlighting.
- [ ] The TUI change detail screen supports opening a full-file preview for any file in the files tab.
- [ ] E2E tests cover the happy path, error paths, old/new side retrieval, and all boundary conditions.
- [ ] Documentation is updated for API reference, CLI reference, and user guides.

### Functional Constraints

- [ ] The `owner` path parameter must be a non-empty string matching `^[a-zA-Z0-9_.-]{1,39}$`.
- [ ] The `repo` path parameter must be a non-empty string matching `^[a-zA-Z0-9_.-]{1,100}$`.
- [ ] The `change_id` path parameter must be a valid jj change ID (lowercase alphabetic, 1–64 characters). The API must also accept revset shorthand such as `@` (working copy).
- [ ] The file path (wildcard remainder) must be a non-empty, forward-slash-delimited relative path. It must not contain `..` path traversal sequences. Maximum path length is 4,096 characters.
- [ ] The `side` query parameter must be either `new` (default) or `old`. Any other value returns `400` with `{"message": "invalid side parameter; must be 'new' or 'old'"}`.
- [ ] The `encoding` query parameter must be either `utf8` (default) or `base64`. Any other value returns `400`.
- [ ] If the repository does not exist, return `404` with `{"message": "repository not found"}`.
- [ ] If the change ID does not resolve to any known change, return `404` with `{"message": "change '<id>' not found"}`.
- [ ] If the file path does not exist at the requested side's revision, return `404` with `{"message": "file '<path>' not found at change '<id>'"}`.
- [ ] When `side=old` and the file was added by this change (no parent version exists), return `404` with `{"message": "file '<path>' does not exist before change '<id>' (file was added)"}`.
- [ ] When `side=new` and the file was deleted by this change, return `200` with `content: null` and `change_type: "deleted"`, communicating the deletion state.
- [ ] If the file is larger than 5 MB, the API must return `200` with `is_truncated: true` and the first 5 MB of content.
- [ ] Empty files must return `200` with `content: ""`, `size: 0`, `line_count: 0`.
- [ ] Binary files (detected via null-byte heuristic in the first 8,192 bytes) must set `is_binary: true` and omit content (returning `content: null`), unless `encoding=base64` is specified, in which case base64-encoded content is returned.
- [ ] The `language` field must be populated using the existing `detectLanguage()` function. Unrecognized extensions return `language: null`.
- [ ] The `change_type` field must accurately reflect how this change affected this file: `added`, `modified`, `deleted`, `renamed`, `copied`, or `unchanged` (for files that exist at the revision but were not modified by this change).
- [ ] For renamed files, the response must include `old_path` with the file's previous path.
- [ ] Concurrent requests for the same file must not interfere (jj subprocess isolation).
- [ ] The endpoint respects repository visibility: private repositories require authentication.

### Edge Cases

- [ ] File path with leading `/` is normalized (strip leading slash).
- [ ] File path with trailing `/` returns `400` ("path must refer to a file, not a directory").
- [ ] File path containing only whitespace after trimming returns `400`.
- [ ] Change ID containing non-hex characters returns `400` unless it is a recognized revset alias (e.g., `@`, `@-`, `root()`).
- [ ] `side=old` on a root change (no parent) returns `404` with `{"message": "change has no parent revision"}`.
- [ ] `side=old` on a merge change (multiple parents) uses the first parent by default.
- [ ] File that exists at the revision but was not modified by this change returns `200` with `change_type: "unchanged"`.
- [ ] File path with Unicode characters (e.g., `docs/日本語.md`) works correctly via URL encoding.
- [ ] `.jj/` internal files are not accessible through this API.
- [ ] Requesting a file in an empty repository (no changes) returns `404`.
- [ ] Ambiguous short change ID that jj cannot resolve returns `400` with a message indicating ambiguity.
- [ ] File at exactly 5 MB returns `is_truncated: false`; file at 5 MB + 1 byte returns `is_truncated: true`.
- [ ] File with extremely long single line (>1 MB) must not crash; it counts as 1 line.
- [ ] Renamed file: `side=new` returns content at new path; `side=old` returns content at old path.
- [ ] Copied file: `side=old` returns content at the source path.
- [ ] Deleted file: `side=new` returns `content: null`, `change_type: "deleted"`, `size: 0`; `side=old` returns the file content as it was before deletion.

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/changes/:change_id/content/*`

This endpoint is scoped under the changes resource, differentiating it from the general-purpose file content endpoint (`/file/:change_id/*`). It provides change-contextual file content retrieval.

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner username or org name |
| `repo` | string | Repository name |
| `change_id` | string | jj change ID, or revset alias (`@`, `@-`) |
| `*` (wildcard) | string | Forward-slash-delimited file path within the repository |

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `side` | `"new"` \| `"old"` | `"new"` | Which revision to retrieve content from. `new` is the change's own revision; `old` is the first parent's revision. |
| `encoding` | `"utf8"` \| `"base64"` | `"utf8"` | Content encoding in the JSON response. `base64` is useful for binary files. |

**Response (200 OK, text file, side=new)**:
```json
{
  "path": "src/auth/token.ts",
  "content": "import { verify } from 'jsonwebtoken';\n...",
  "encoding": "utf8",
  "language": "typescript",
  "size": 3072,
  "line_count": 94,
  "is_binary": false,
  "is_truncated": false,
  "change_type": "modified",
  "old_path": null,
  "side": "new"
}
```

**Response (200 OK, text file, side=old)**:
```json
{
  "path": "src/auth/token.ts",
  "content": "import { verify } from 'jsonwebtoken';\n...",
  "encoding": "utf8",
  "language": "typescript",
  "size": 2816,
  "line_count": 88,
  "is_binary": false,
  "is_truncated": false,
  "change_type": "modified",
  "old_path": null,
  "side": "old"
}
```

**Response (200 OK, renamed file, side=new)**:
```json
{
  "path": "src/auth/refresh-token.ts",
  "content": "...",
  "encoding": "utf8",
  "language": "typescript",
  "size": 1024,
  "line_count": 32,
  "is_binary": false,
  "is_truncated": false,
  "change_type": "renamed",
  "old_path": "src/auth/token-refresh.ts",
  "side": "new"
}
```

**Response (200 OK, deleted file, side=new)**:
```json
{
  "path": "src/deprecated.ts",
  "content": null,
  "encoding": "utf8",
  "language": "typescript",
  "size": 0,
  "line_count": 0,
  "is_binary": false,
  "is_truncated": false,
  "change_type": "deleted",
  "old_path": null,
  "side": "new"
}
```

**Response (200 OK, binary file)**:
```json
{
  "path": "assets/icon.png",
  "content": null,
  "encoding": "utf8",
  "language": null,
  "size": 45231,
  "line_count": 0,
  "is_binary": true,
  "is_truncated": false,
  "change_type": "added",
  "old_path": null,
  "side": "new"
}
```

**Raw Content**: When the request includes `Accept: application/octet-stream`, the response is the raw file bytes with `Content-Type: application/octet-stream` and `Content-Disposition: attachment; filename="<basename>"`. The `change_type` and `old_path` metadata are returned via response headers `X-Codeplane-Change-Type` and `X-Codeplane-Old-Path`.

**Error Responses**:
| Status | Condition |
|--------|-----------|
| `400` | Missing or invalid owner, repo, change_id, path, side, or encoding; path traversal detected |
| `401` | Private repository, no valid auth |
| `403` | Authenticated but insufficient permissions |
| `404` | Repository, change, or file not found; file does not exist at requested side |
| `422` | File exceeds maximum size with raw download |
| `429` | Rate limit exceeded |
| `500` | Internal jj subprocess failure |

### SDK Shape

A new method is added to `RepoHostService`:

```typescript
interface ChangeFileContentResponse {
  path: string;
  content: string | null;
  encoding: "utf8" | "base64";
  language: string | null;
  size: number;
  line_count: number;
  is_binary: boolean;
  is_truncated: boolean;
  change_type: "added" | "modified" | "deleted" | "renamed" | "copied" | "unchanged";
  old_path: string | null;
  side: "new" | "old";
}

async getChangeFileContent(
  owner: string,
  repo: string,
  changeId: string,
  filePath: string,
  options?: {
    side?: "new" | "old";
    encoding?: "utf8" | "base64";
    maxSize?: number;
  }
): Promise<Result<ChangeFileContentResponse, APIError>>
```

The method must:
1. Determine the change type by calling `jj diff --summary -r <changeId>` and finding the file in the results.
2. If `side=old`, resolve the parent change ID via `jj log -r <changeId>` to extract `parent_change_ids[0]`, then call `jj file show -r <parentChangeId> <filePath>` (using `old_path` for renames).
3. If `side=new`, call `jj file show -r <changeId> <filePath>`.
4. Detect binary content via null-byte scan of the first 8,192 bytes.
5. Compute `size` in bytes and `line_count`.
6. Detect language via `detectLanguage()`.
7. Truncate content at 5 MB and set `is_truncated: true` if necessary.

Shared data hooks in `@codeplane/ui-core` (to be created):
- `useChangeFileContent(owner, repo, changeId, filePath, side?)` — Fetches and caches file content with change context. Returns `{ data, loading, error, refetch }`.

### CLI Command

**Command**: `codeplane change file-content <change_id> <path>`

**Aliases**: `codeplane change cat-at <change_id> <path>`

**Options**:
| Flag | Description |
|------|-------------|
| `--side` | `new` (default) or `old` — which revision to show |
| `--repo, -R` | Repository in `OWNER/REPO` format (auto-detected from cwd if in a jj repo) |
| `--json` | Output as JSON with full metadata (language, size, line_count, change_type, old_path) |
| `--raw` | Output raw bytes without any framing (default for non-JSON mode) |
| `--encoding` | Force base64 encoding in JSON output |

**Behavior**:
- **Local mode** (inside a jj repository, no `--repo`): resolves the parent change locally via `jj log` and shells out to `jj file show` directly.
- **Remote mode** (`--repo` specified or not in a jj repo): calls `GET /api/repos/:owner/:repo/changes/:change_id/content/<path>?side=<side>`.
- Default output (no `--json`): raw file content to stdout, suitable for piping.
- JSON output: full `ChangeFileContentResponse` object.
- Exit code `1` on not-found errors with a human-readable stderr message.

**Examples**:
```bash
# View a file at the current change
codeplane change file-content @ src/main.ts

# View the file as it was before this change
codeplane change file-content wqnwkozp src/auth/token.ts --side old

# Compare old and new versions with an external diff tool
diff <(codeplane change file-content wqnwkozp src/auth/token.ts --side old) \
     <(codeplane change file-content wqnwkozp src/auth/token.ts --side new)

# JSON output with change context metadata
codeplane change file-content wqnwkozp README.md --json

# Remote repo
codeplane change file-content ksqxyz src/lib.ts -R acme/myrepo --side new
```

### Web UI Design

The change-scoped file content is consumed in two primary web UI surfaces:

**1. Change Detail — Full File Tab**

Route: `/:owner/:repo/changes/:changeId` (within the Files tab)

When a user clicks a file in the change detail files list, a slide-over panel or expanded section shows the full file content:

1. A header bar displays: file path, language badge, file size, line count, and a `change_type` badge (Added/Modified/Deleted/Renamed/Copied).
2. A **side toggle** with two buttons: "Current" (side=new, default) and "Previous" (side=old). The Previous button is disabled for added files.
3. For modified files on the "Current" side, lines changed by this change are highlighted with a subtle background tint (derived by mapping diff hunks to line numbers).
4. Renamed files show a sub-header: `Renamed from src/old-name.ts`.
5. Deleted files show a placeholder: "This file was deleted by this change" with a link to view the previous version.
6. Binary files show: "Binary file (45.2 KB) — download" with a raw download link.
7. Truncated files show a banner: "File truncated at 5 MB — download full file".
8. A "Raw" button opens the raw content in a new tab.
9. A "Copy" button copies content to clipboard (text files only).

**2. Landing Request Review — File Preview**

Route: `/:owner/:repo/landings/:id` (within the Files/Diff tab)

When reviewing a landing request's change stack, clicking a file in any change's file list opens the same full-file preview panel. This is especially useful for reviewers who want to see the full file context beyond the diff hunks.

The same UI components are reused; the only difference is that the change_id is derived from the landing request's change stack rather than from direct navigation.

### TUI UI

The TUI change detail screen gains a file preview action:

1. In the Files tab, pressing `Enter` on a file opens a full-file preview screen.
2. The preview screen shows:
   - Header bar: `path | language | size | lines | change_type`
   - Side indicator: `[NEW]` or `[OLD]`, toggled with `Tab`
   - Syntax-highlighted file content with line numbers
   - Lines changed by this change highlighted with a distinct marker in the gutter
3. Keyboard shortcuts:
   - `Tab`: Toggle between new and old side
   - `j`/`k`: Scroll line by line
   - `Ctrl+D`/`Ctrl+U`: Page scroll
   - `G`/`gg`: Jump to end/beginning
   - `n`/`N`: Jump to next/previous changed line
   - `y`: Copy file path
   - `Y`: Copy file content
   - `/`: Search within file
   - `q`: Return to change detail
4. Binary files: "Binary file — cannot preview in terminal"
5. Deleted files (side=new): "File deleted by this change — press Tab to view previous version"
6. Added files (side=old): "File did not exist before this change — press Tab to view current version"

### Documentation

1. **API Reference — File Content at Change Revision** (`docs/api/change-file-content.mdx`):
   - Endpoint URL, path and query parameters
   - Explanation of `side` parameter and change_type semantics
   - Request/response examples for: modified text file (both sides), added file, deleted file, renamed file, binary file, truncated file, and error cases
   - curl examples with and without authentication
   - Note on raw download via `Accept: application/octet-stream`
   - Distinction from the general file content endpoint (`/file/:change_id/*`)

2. **Repository Guide update** (`docs/guides/repositories.mdx`):
   - Add a "Viewing Files in Change Context" section under the existing "Code Browsing" heading
   - Explain the difference between browsing a file at a change vs. viewing a file in the context of a change's modifications
   - Add endpoint to the API endpoint table

3. **CLI Reference update** (`docs/cli/change.mdx`):
   - Document `change file-content` command with all options and examples
   - Document `--side old` workflow for comparing old and new versions
   - Document piping into external diff tools

4. **Review Workflow Guide update** (`docs/guides/reviews.mdx`):
   - Add section on viewing full file context during landing request reviews
   - Explain how to toggle between old and new versions
   - Show how agents can use the API to build full-context reviews

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
| **Deploy Key (read)** | ✅ Read (via SSH transport) | ✅ Read (via SSH transport) |

This is a read-only endpoint. There is no write or delete path. Authorization follows the same repository read-access check used by other repository content and change detail endpoints.

### Rate Limiting

| Consumer | Limit | Window |
|----------|-------|--------|
| Anonymous | 60 requests | per hour, per IP |
| Authenticated user | 5,000 requests | per hour, per token/session |
| Deploy key | 5,000 requests | per hour, per key |
| Agent session | 10,000 requests | per hour, per session |

Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) must be included in all responses. When the limit is exceeded, the endpoint returns `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy & Security

- **Path traversal prevention**: The file path must be validated to reject `..` sequences before passing to the jj subprocess. The SDK layer sanitizes owner/repo with `replace(/\.\./g, "_")`, and jj's `file show` operates within the repository sandbox. The route layer must additionally reject paths containing `..` with a `400` response.
- **No PII exposure**: File content is repository data, not user PII. However, file content must never be logged (it could contain secrets committed to the repo).
- **Secrets in repositories**: The API serves whatever jj stores. If a user has committed a `.env` file, the API will serve it. This is expected behavior consistent with any forge.
- **CORS**: The endpoint inherits the server's existing CORS policy.
- **Content-Type safety**: JSON responses always use `application/json`. Raw downloads use `application/octet-stream` with `X-Content-Type-Options: nosniff` to prevent browser content sniffing.
- **Side parameter injection**: The `side` parameter must be strictly validated against the allowlist `["new", "old"]`. It must not be interpolated into shell commands or jj arguments without validation.
- **Change ID sanitization**: Change IDs must be validated against the expected pattern before being passed to jj subprocesses. SQL injection and command injection patterns in the change_id must be rejected at the validation layer.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ChangeFileContentViewed` | Successful 200 response | `owner`, `repo`, `change_id`, `file_path`, `side` (new/old), `change_type`, `language`, `size_bytes`, `is_binary`, `is_truncated`, `client` (web/cli/tui/api), `encoding` |
| `ChangeFileContentSideToggled` | User switches from new to old or vice versa (web/TUI only) | `owner`, `repo`, `change_id`, `file_path`, `from_side`, `to_side`, `client` |
| `ChangeFileContentNotFound` | 404 response | `owner`, `repo`, `change_id`, `file_path`, `side`, `not_found_reason` (change/file/repo/no_parent/added_file) |
| `ChangeFileContentRawDownload` | Raw octet-stream download | `owner`, `repo`, `change_id`, `file_path`, `side`, `size_bytes`, `is_binary` |
| `ChangeFileContentRateLimited` | 429 response | `owner`, `repo`, `consumer_type` (anonymous/authenticated/deploy_key/agent) |
| `ChangeFileContentCopied` | User copies file content via Copy button (web/TUI) | `owner`, `repo`, `change_id`, `file_path`, `side`, `client` |

### Funnel Metrics

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| **Change detail → file content view rate** | % of change detail views where the user also views at least one file's full content | > 25% of change detail sessions |
| **Side toggle adoption** | % of file content views where the user views both old and new sides | > 15% (indicates users finding contextual comparison valuable) |
| **Review file preview adoption** | % of landing request review sessions that include at least one full-file preview | > 20% |
| **Agent file content usage** | % of agent sessions that fetch change file content via API | > 30% of agent sessions that interact with changes |
| **Error rate** | % of requests that return 4xx/5xx | < 2% for 4xx, < 0.1% for 5xx |
| **Client distribution** | % of requests from each client type | Web > 35%, API/Agent > 20%, CLI > 10% |

### Success Indicators

- Landing request review velocity improves (reviewers spend less time switching between diff and file views)
- Agent-generated code reviews include full-context references (indicating agents are using old/new content for comparison)
- Users who use the side toggle have higher review completion rates than those who don't
- The file content endpoint is the second-most-used change sub-resource after diff (indicating it fills a real gap)

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Notes |
|-----------|-------|-------------------|-------|
| Request received | `debug` | `owner`, `repo`, `change_id`, `file_path`, `side`, `user_id`, `request_id` | Never log file content |
| File content served | `info` | `owner`, `repo`, `change_id`, `file_path`, `side`, `change_type`, `size_bytes`, `language`, `is_binary`, `is_truncated`, `duration_ms` | |
| File not found | `info` | `owner`, `repo`, `change_id`, `file_path`, `side`, `not_found_reason` | Expected user error |
| Change not found | `info` | `owner`, `repo`, `change_id` | Expected user error |
| No parent revision (side=old on root) | `info` | `owner`, `repo`, `change_id` | Expected user error |
| File added (side=old requested) | `info` | `owner`, `repo`, `change_id`, `file_path` | Expected user error |
| Repository not found | `warn` | `owner`, `repo` | May indicate stale links |
| jj subprocess failure | `error` | `owner`, `repo`, `change_id`, `file_path`, `side`, `jj_command`, `exit_code`, `stderr` (truncated to 500 chars) | Operational issue |
| Parent change resolution failure | `error` | `owner`, `repo`, `change_id`, `exit_code`, `stderr` | jj log failed |
| Change type resolution failure | `error` | `owner`, `repo`, `change_id`, `exit_code`, `stderr` | jj diff --summary failed |
| Path traversal attempt | `warn` | `owner`, `repo`, `file_path`, `remote_ip`, `user_id` | Security-relevant |
| Rate limit exceeded | `warn` | `owner`, `repo`, `consumer_type`, `remote_ip` | |
| Invalid side parameter | `debug` | `owner`, `repo`, `side_value`, `request_id` | Client error |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_change_file_content_requests_total` | Counter | `owner`, `repo`, `status` (2xx/4xx/5xx), `side` (new/old), `client` | Total change file content requests |
| `codeplane_change_file_content_duration_seconds` | Histogram | `owner`, `repo`, `side`, `is_binary` | Request duration (buckets: 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_change_file_content_size_bytes` | Histogram | `language`, `is_binary`, `side` | Size distribution of served files |
| `codeplane_change_file_content_jj_subprocess_duration_seconds` | Histogram | `jj_command` (file_show/diff_summary/log) | Time spent in jj subprocesses (this endpoint may invoke up to 3) |
| `codeplane_change_file_content_errors_total` | Counter | `error_type` (not_found/traversal/subprocess/internal/no_parent/invalid_side) | Error breakdown |
| `codeplane_change_file_content_truncated_total` | Counter | `side` | Files that exceeded 5 MB and were truncated |
| `codeplane_change_file_content_binary_total` | Counter | `side` | Binary file requests |
| `codeplane_change_file_content_side_old_total` | Counter | | Requests for old (parent) side — tracks adoption |
| `codeplane_change_file_content_change_type_total` | Counter | `change_type` (added/modified/deleted/renamed/copied/unchanged) | Distribution of change types |

### Alerts & Runbooks

**Alert 1: High jj Subprocess Error Rate**
- **Condition**: `rate(codeplane_change_file_content_errors_total{error_type="subprocess"}[5m]) > 0.5`
- **Severity**: `warning`
- **Runbook**:
  1. Check if `jj` binary is available: `which jj` on the server.
  2. Check disk space on the repos data directory: `df -h $CODEPLANE_DATA_DIR/repos`.
  3. Check for jj lock contention: look for `.jj/repo/op_store/lock` files that are stale.
  4. Check server logs for `jj subprocess failure` entries — the `stderr` field will contain the jj error message.
  5. This endpoint invokes up to 3 jj subprocesses per request (diff --summary, log, file show). If only one of the three is failing, the `jj_command` label on `codeplane_change_file_content_jj_subprocess_duration_seconds` will help isolate which.
  6. If jj is segfaulting, check jj version compatibility and consider upgrading.
  7. If the error is repository-specific, try running `jj file show -r <changeId> <path>` manually in that repo directory.

**Alert 2: High Latency (p95 > 5s)**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_change_file_content_duration_seconds_bucket[5m])) > 5`
- **Severity**: `warning`
- **Runbook**:
  1. Check `codeplane_change_file_content_jj_subprocess_duration_seconds` — this endpoint invokes up to 3 jj subprocesses, so latency may be additive.
  2. If `diff_summary` is the slow subprocess, the change may touch many files. Check specific repositories and changes causing the latency.
  3. Check system load: `top`, `iostat`. Large repositories with deep history can cause slow jj operations.
  4. Check for filesystem I/O bottlenecks on the repos data directory.
  5. Consider caching the `diff --summary` results for a change ID (change IDs are stable, so the result is cacheable).
  6. Consider parallelizing the independent jj subprocess calls (diff --summary and file show can run concurrently).

**Alert 3: Path Traversal Attempts**
- **Condition**: `increase(codeplane_change_file_content_errors_total{error_type="traversal"}[1h]) > 10`
- **Severity**: `critical`
- **Runbook**:
  1. This indicates potential attack activity. Check server logs for `Path traversal attempt` entries.
  2. Extract the `remote_ip` and `user_id` from structured logs.
  3. If a single IP is responsible, consider temporary IP-level blocking.
  4. If a single user is responsible, review their account for compromise.
  5. Verify the path sanitization logic is working correctly by testing manually.
  6. Escalate to security team if the pattern suggests coordinated probing.

**Alert 4: Sustained 5xx Rate > 5%**
- **Condition**: `rate(codeplane_change_file_content_requests_total{status="5xx"}[5m]) / rate(codeplane_change_file_content_requests_total[5m]) > 0.05`
- **Severity**: `critical`
- **Runbook**:
  1. Check server error logs for stack traces.
  2. Check if the issue is global or scoped to specific repositories.
  3. Verify jj binary health: `jj version`.
  4. Check for OOM conditions if serving very large files: `dmesg | grep -i oom`.
  5. Check Bun runtime health — subprocess spawning limits may be exhausted (this endpoint spawns up to 3 subprocesses per request).
  6. If the issue is transient, check if a repository operation (e.g., large push) is causing temporary lock contention.
  7. Check `codeplane_change_file_content_jj_subprocess_duration_seconds` for timeouts — long-running jj processes may be consuming subprocess slots.

**Alert 5: Unusually High old-Side Request Volume**
- **Condition**: `rate(codeplane_change_file_content_side_old_total[5m]) > rate(codeplane_change_file_content_requests_total[5m]) * 0.8`
- **Severity**: `info`
- **Runbook**:
  1. This is informational, not an error. An unusually high ratio of old-side requests may indicate a bot or scraper systematically fetching both versions.
  2. Check if the requests are from a single user/IP.
  3. If it's an agent workflow, this is expected behavior. No action needed.
  4. If it's unexpected, investigate the traffic pattern.

### Error Cases & Failure Modes

| Error Case | HTTP Status | Detection | Impact | Mitigation |
|------------|-------------|-----------|--------|------------|
| jj binary not found | 500 | Subprocess spawn error | All change file content requests fail | Pre-flight check at server startup |
| Repository directory missing | 404 | `ensureRepo()` check | Single-repo impact | Expected for deleted repos; log at warn |
| jj lock contention | 500 | jj stderr contains "lock" | Temporary per-repo | Retry with exponential backoff in service layer |
| Disk full | 500 | jj stderr or OS error | All repos on that volume | Alert on disk space separately |
| File too large for memory | 500 | OOM or Bun crash | Single request | Enforce 5 MB streaming limit |
| Invalid UTF-8 in file | 200 (binary) | Null-byte heuristic | None — handled as binary | Binary detection covers this |
| jj version incompatibility | 500 | Unexpected stderr format | Parse failures | Pin supported jj version range in docs |
| Parent resolution failure (jj log) | 500 | Second subprocess fails | side=old requests fail for this change | Log error; check jj log compatibility |
| Change type resolution failure (jj diff --summary) | 500 | First subprocess fails | change_type not computable | Degrade gracefully: return change_type as "unknown" and log error |
| Race condition: change rewritten between subprocess calls | 200 (stale) | Parent or file may have changed | Minor inconsistency | jj change IDs are stable; content is eventually consistent |
| jj process timeout (>30s) | 500 | Subprocess killed | Single request | Add subprocess timeout; log for investigation |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `API-CFC-001` | `GET /api/repos/:owner/:repo/changes/:change_id/content/src/main.ts` for a modified text file | `200`, JSON with `content` matching file, `language: "typescript"`, `is_binary: false`, `change_type: "modified"`, `side: "new"` |
| `API-CFC-002` | Same request with `?side=old` | `200`, content matches the parent revision's version, `side: "old"`, `change_type: "modified"` |
| `API-CFC-003` | Request for a file added by the change (`side=new`) | `200`, `change_type: "added"`, content present |
| `API-CFC-004` | Request for a file added by the change with `side=old` | `404`, message indicates file did not exist before this change |
| `API-CFC-005` | Request for a file deleted by the change (`side=new`) | `200`, `content: null`, `change_type: "deleted"`, `size: 0` |
| `API-CFC-006` | Request for a file deleted by the change with `side=old` | `200`, content is the file as it existed before deletion, `change_type: "deleted"` |
| `API-CFC-007` | Request for a renamed file (`side=new`) | `200`, `change_type: "renamed"`, `old_path` is populated, content at new path |
| `API-CFC-008` | Request for a renamed file (`side=old`) | `200`, content at old path, `old_path` populated |
| `API-CFC-009` | Request for a file that exists at the revision but was NOT modified by this change | `200`, `change_type: "unchanged"`, content returned |
| `API-CFC-010` | `side=invalid` query parameter | `400`, message: "invalid side parameter" |
| `API-CFC-011` | `side=` (empty string) | Uses default `new`, returns `200` |
| `API-CFC-012` | Request for a file that does not exist at any revision | `404`, message contains "not found" |
| `API-CFC-013` | Request with invalid change_id (non-existent) | `404`, message contains "change" and "not found" |
| `API-CFC-014` | Request with invalid change_id format (numbers, special chars) | `400`, message: "invalid change_id format" |
| `API-CFC-015` | Request for nonexistent repository | `404` |
| `API-CFC-016` | Request with empty file path | `400`, "path is required" |
| `API-CFC-017` | Request with path traversal (`../../../etc/passwd`) | `400`, message contains "invalid path" or "traversal" |
| `API-CFC-018` | Request with trailing slash in path (`src/`) | `400` |
| `API-CFC-019` | Binary file (e.g., `.png`) at change | `200`, `is_binary: true`, `content: null` |
| `API-CFC-020` | Binary file with `?encoding=base64` | `200`, `is_binary: true`, `content` is valid base64, `encoding: "base64"` |
| `API-CFC-021` | Empty file (0 bytes) | `200`, `content: ""`, `size: 0`, `line_count: 0` |
| `API-CFC-022` | File with `Accept: application/octet-stream` header | `200`, `Content-Type: application/octet-stream`, `Content-Disposition` present, `X-Codeplane-Change-Type` header present, body is raw bytes |
| `API-CFC-023` | File at exactly 5 MB | `200`, `is_truncated: false` |
| `API-CFC-024` | File at 5 MB + 1 byte | `200`, `is_truncated: true`, content is exactly 5 MB |
| `API-CFC-025` | Valid session cookie on public repo | `200` |
| `API-CFC-026` | Valid PAT on private repo | `200` |
| `API-CFC-027` | Anonymous request on private repo | `401` |
| `API-CFC-028` | Authenticated user with no repo access on private repo | `403` |
| `API-CFC-029` | Using `@` revset alias as change_id | `200`, returns working copy file content |
| `API-CFC-030` | File path with spaces (`docs/my%20file.md`) | `200`, path decoded correctly |
| `API-CFC-031` | File path with Unicode characters | `200` if file exists, `404` if not (no 400/500) |
| `API-CFC-032` | Deeply nested path (100 components) | `200` if file exists |
| `API-CFC-033` | `side=old` on a root change (no parents) | `404`, "change has no parent revision" |
| `API-CFC-034` | `side=old` on a merge change (2+ parents) | `200`, content from first parent |
| `API-CFC-035` | Concurrent requests (10 parallel) for the same file, same side | All return `200` with identical content |
| `API-CFC-036` | Concurrent requests (10 parallel) for same file, alternating old/new | All return `200` with correct respective content |
| `API-CFC-037` | Request for `.jj/config.toml` (internal jj file) | `404` |
| `API-CFC-038` | File with no extension (e.g., `Makefile`) | `200`, `language` correctly detected or `null` |
| `API-CFC-039` | Empty repo (no changes, no files) | `404` |
| `API-CFC-040` | File path at maximum length (4,096 characters) | `200` if file exists |
| `API-CFC-041` | File path exceeding 4,096 characters | `400` |
| `API-CFC-042` | Rate limit: send 61 anonymous requests in under 1 hour | 61st returns `429` with `Retry-After` header |
| `API-CFC-043` | `encoding=base64` on a text file | `200`, content is base64-encoded, `encoding: "base64"` |
| `API-CFC-044` | `encoding=invalid` query parameter | `400` |
| `API-CFC-045` | Copied file with `side=old` | `200`, content from the source/original file |

### CLI Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CLI-CFC-001` | `codeplane change file-content @ src/main.ts` in a local jj repo | Exit 0, stdout contains file content |
| `CLI-CFC-002` | `codeplane change file-content @ src/main.ts --json` | Exit 0, valid JSON with `path`, `content`, `language`, `size`, `line_count`, `change_type`, `side` |
| `CLI-CFC-003` | `codeplane change file-content @ src/main.ts --side old` | Exit 0, stdout contains parent revision's file content |
| `CLI-CFC-004` | `codeplane change file-content @ nonexistent.txt` | Exit 1, stderr contains "not found" |
| `CLI-CFC-005` | `codeplane change file-content badchangeid src/main.ts` | Exit 1, stderr contains error |
| `CLI-CFC-006` | `codeplane change file-content <change_id> src/main.ts -R owner/repo` (remote) | Exit 0, content from remote |
| `CLI-CFC-007` | `codeplane change file-content @ package.json \| jq .name` (pipe test) | Exit 0, jq receives valid JSON |
| `CLI-CFC-008` | `codeplane change file-content @ README.md --raw` | Exit 0, raw content, no JSON framing |
| `CLI-CFC-009` | `codeplane change file-content` with no arguments | Exit 1, usage help shown |
| `CLI-CFC-010` | `codeplane change file-content @ added-file.ts --side old` (file was added) | Exit 1, stderr: "file does not exist before this change" |
| `CLI-CFC-011` | `codeplane change file-content @ renamed.ts --json` (file was renamed) | Exit 0, JSON includes `old_path` and `change_type: "renamed"` |
| `CLI-CFC-012` | `codeplane change file-content @ deleted.ts --side new` (file was deleted) | Exit 0 with JSON mode showing `content: null`, `change_type: "deleted"` |

### E2E Playwright Tests (Web UI)

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `E2E-CFC-001` | Navigate to change detail, click a modified file in Files tab | Full file preview panel opens with syntax-highlighted content |
| `E2E-CFC-002` | In file preview, verify header shows file path, language badge, size, and change_type badge | All metadata displayed correctly |
| `E2E-CFC-003` | Click "Previous" toggle in file preview for a modified file | Content updates to show parent revision's version |
| `E2E-CFC-004` | Click "Previous" toggle for an added file | Toggle is disabled or shows "File did not exist" message |
| `E2E-CFC-005` | Click a deleted file in Files tab | Preview shows "File deleted by this change" with link to view previous version |
| `E2E-CFC-006` | Click a renamed file in Files tab | Preview shows rename indicator with old path |
| `E2E-CFC-007` | Click a binary file in Files tab | Binary file placeholder with download link |
| `E2E-CFC-008` | Click "Raw" button in file preview header | New tab opens with raw file content |
| `E2E-CFC-009` | Click "Copy" button in file preview header | Clipboard contains file content |
| `E2E-CFC-010` | Navigate to file preview via landing request review | Same preview panel renders correctly in review context |
| `E2E-CFC-011` | Access change detail on a private repo while unauthenticated | Redirect to login or 401 page |
| `E2E-CFC-012` | Changed lines are highlighted in the full file view for modified files | Highlight markers visible on lines matching diff hunks |

### TUI Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `TUI-CFC-001` | In change detail Files tab, press `Enter` on a file | File preview screen opens with header bar |
| `TUI-CFC-002` | Header bar shows path, language, size, lines, change_type | All metadata displayed |
| `TUI-CFC-003` | Press `Tab` to toggle between NEW and OLD side | Content updates, side indicator changes |
| `TUI-CFC-004` | Press `Tab` on an added file showing NEW side | Switches to OLD side showing "File did not exist" message |
| `TUI-CFC-005` | Press `n`/`N` on a modified file | Cursor jumps to next/previous changed line |
| `TUI-CFC-006` | Press `y` | File path copied to clipboard |
| `TUI-CFC-007` | Press `q` | Returns to change detail screen |
| `TUI-CFC-008` | Select a binary file | "Binary file — cannot preview" message |
| `TUI-CFC-009` | Press `j`/`k` to scroll | Content scrolls line by line |

### Cross-Surface Consistency Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `XSFC-CFC-001` | Same change_id and file returns identical content via API, CLI (`--json`), and web UI | Content, size, line_count, language, change_type all match |
| `XSFC-CFC-002` | `change_type` is consistent between this endpoint and the change files list endpoint | If `/changes/:id/files` lists a file as `M`, this endpoint returns `change_type: "modified"` |
| `XSFC-CFC-003` | `side=old` content is consistent with what the diff endpoint shows as the old side of the patch | Old content matches |
| `XSFC-CFC-004` | `side=new` content is consistent with what the general file content API (`/file/:change_id/*`) returns | Content matches |

### Performance Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `PERF-CFC-001` | API responds within 1s for a text file in a repo with 10,000+ changes | < 1s |
| `PERF-CFC-002` | API responds within 2s when `side=old` (requires parent resolution + file show) | < 2s |
| `PERF-CFC-003` | 10 concurrent requests to the same change/file do not cause jj lock errors | All return 200 |
| `PERF-CFC-004` | API responds within 3s for a 5 MB file | < 3s |
