# JJ_CONTENTS_TREE_API

Specification for JJ_CONTENTS_TREE_API.

## High-Level User POV

When a developer browses a repository on Codeplane, the most natural action is to explore the directory structure — clicking into folders, seeing what files exist, and navigating the project layout. The Contents Tree API is the engine behind this experience. It lets any Codeplane client — the web Code Explorer, the TUI file tree sidebar, agents, or external tooling — ask a simple question: "What's in this directory, at this point in time?"

Unlike the low-level Git Tree API (which requires a raw SHA hash and returns git-internal metadata), the Contents Tree API works with human-readable inputs. A user picks a bookmark like `main` or a jj change ID like `ksqxyz`, provides a directory path like `src/components`, and gets back a clean list of the files and subdirectories at that location. Directories are listed first, then files, both alphabetically — matching the convention developers expect from every file browser they've ever used.

This API is foundational to Codeplane's code browsing experience. The web UI's Code Explorer sidebar calls it every time a user expands a directory. The TUI's file tree pane uses it to lazily load subdirectory contents as users navigate with keyboard shortcuts. CLI users and agents can call it to understand repository structure before diving into specific files. It is the bridge between "I want to look around this repository" and the file content API that shows individual files.

Because Codeplane is jj-native, this API accepts both jj bookmarks and jj change IDs as the ref parameter. A user can browse the repository as it looks at their working copy (`@`), at a specific historical change, or at the tip of any bookmark. This means directory browsing is not locked to branch tips the way traditional git forges work — users can explore the exact state of the repository at any change in history, using stable identifiers that survive rebases.

The value is immediate: developers spend less time context-switching between tools and more time understanding code. A product manager can browse the repository at the change associated with a landing request to understand what's being proposed. An agent can enumerate directory contents before deciding which files to read or modify. The contents API makes repository exploration a first-class, self-service operation for every Codeplane participant.

## Acceptance Criteria

### Definition of Done

- [ ] `GET /api/repos/:owner/:repo/contents` is fully implemented (no longer returns 501) and returns a JSON directory listing for the repository root.
- [ ] `GET /api/repos/:owner/:repo/contents/*` is fully implemented (no longer returns 501) and returns entries for the specified path — either a directory listing (wrapped object with entries array) or a single file metadata object.
- [ ] The `?ref=` query parameter is supported to specify a bookmark name, jj change ID, or jj revset alias.
- [ ] When `ref` is omitted, the API defaults to the repository's default bookmark (typically `main` or `trunk`).
- [ ] Directory responses return a JSON object with `type: "dir"`, `path`, `entries` (array of entry objects), and `truncated` (boolean).
- [ ] File responses return a single JSON object with `name`, `path`, `type: "file"`, `size`, `sha`, `content` (base64-encoded or null), `encoding`, and `download_url`.
- [ ] The route handler delegates to a new `RepoHostService.listContents()` SDK method.
- [ ] The `@codeplane/ui-core` package exports a `useRepoTree` hook and/or `getContents()` API client method.
- [ ] The web UI Code Explorer sidebar consumes this endpoint for directory browsing.
- [ ] The TUI file tree sidebar consumes this endpoint for lazy-loading tree navigation.
- [ ] The CLI exposes `codeplane repo contents [path]` and the endpoint is accessible via `codeplane api get`.
- [ ] E2E tests validate happy paths, error paths, and boundary conditions.
- [ ] Documentation is updated in the API reference and repository guides.

### Functional Constraints

- [ ] `owner` path parameter must match `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,38}$` (1–39 characters).
- [ ] `repo` path parameter must match `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$` (1–100 characters, no `.git` suffix).
- [ ] Wildcard path must be forward-slash-delimited, max 4,096 characters, no `..` traversal.
- [ ] `ref` query parameter accepts bookmark names, jj change IDs (hex, 1–64 chars), jj revset aliases (`@`, `@-`, `root()`), and commit SHAs. Max 256 characters.
- [ ] Invalid `ref` returns `404` with `{"message": "ref '<ref>' not found"}`.
- [ ] Non-existent repository returns `404` with `{"message": "repository not found"}`.
- [ ] Non-existent path returns `404` with `{"message": "path '<path>' not found at ref '<ref>'"}`.
- [ ] Path pointing to a file returns a single file object; path pointing to a directory returns a directory object.
- [ ] Directory entries sorted: directories first (alphabetical, case-sensitive), then files (alphabetical).
- [ ] Each directory entry must contain: `name`, `path`, `type` (file/dir/submodule/symlink), `size` (number or null), `sha`, `download_url` (string or null).
- [ ] File responses for files > 1 MB set `content: null` and `encoding: "none"`.
- [ ] Empty directories return `200` with empty entries array.
- [ ] Maximum 10,000 entries per directory listing; `truncated: true` if exceeded.
- [ ] Symlink entries include `link_target`.
- [ ] Submodule entries include `submodule_url` when available.

### Edge Cases

- [ ] Leading `/` in path is stripped.
- [ ] Trailing `/` is stripped and treated as directory request.
- [ ] `..` in any path position returns `400`.
- [ ] Whitespace-only path returns `400`.
- [ ] Double slashes (`src//lib`) normalized to single slash.
- [ ] `ref` with shell metacharacters (`;`, `|`, `&`, `$`, backtick) returns `400`.
- [ ] Unicode file names work via URL encoding.
- [ ] Spaces in file names work via URL encoding.
- [ ] Empty repo (no commits) returns empty entries array at root.
- [ ] Single-file repo returns one-element array.
- [ ] Symlink to a directory returns the target directory listing with original requested path.
- [ ] `.jj/` and `.git/` internal paths return `404`.
- [ ] 100+ levels of directory nesting works correctly.
- [ ] Directory with exactly 10,000 entries: `truncated: false`.
- [ ] Directory with 10,001 entries: returns 10,000, `truncated: true`.

## Design

### API Shape

**Endpoint 1:** `GET /api/repos/:owner/:repo/contents`
**Endpoint 2:** `GET /api/repos/:owner/:repo/contents/*`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner username or org name |
| `repo` | string | Repository name |
| `*` (wildcard) | string | Forward-slash-delimited path within the repository (optional; absent = root) |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ref` | string | default bookmark | Bookmark name, jj change ID, revset alias, or commit SHA to browse at |

**Response (200 OK — directory listing):**

```json
{
  "type": "dir",
  "path": "src/components",
  "entries": [
    {
      "name": "hooks",
      "path": "src/components/hooks",
      "type": "dir",
      "size": null,
      "sha": "abc123def456...",
      "download_url": null
    },
    {
      "name": "Button.tsx",
      "path": "src/components/Button.tsx",
      "type": "file",
      "size": 2048,
      "sha": "def789abc012...",
      "download_url": "https://codeplane.example/api/repos/owner/repo/file/@/src/components/Button.tsx"
    }
  ],
  "truncated": false
}
```

**Response (200 OK — single file):**

```json
{
  "name": "main.ts",
  "path": "src/main.ts",
  "type": "file",
  "size": 2048,
  "sha": "def789abc012...",
  "content": "aW1wb3J0IHsgc2VydmUgfSBmcm9tICdob25vJzs=",
  "encoding": "base64",
  "download_url": "https://codeplane.example/api/repos/owner/repo/file/@/src/main.ts"
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| `400` | `{"message": "invalid path: directory traversal not allowed"}` | Path contains `..` |
| `400` | `{"message": "invalid ref format"}` | Ref contains shell metacharacters or exceeds 256 chars |
| `404` | `{"message": "repository not found"}` | Repo doesn't exist or user lacks access |
| `404` | `{"message": "ref '<ref>' not found"}` | Ref doesn't resolve |
| `404` | `{"message": "path '<path>' not found at ref '<ref>'"}` | Path doesn't exist at ref |
| `429` | `{"message": "rate limit exceeded"}` | Too many requests |
| `500` | `{"message": "internal server error"}` | Subprocess failure |

### SDK Shape

**New types in `packages/sdk/src/services/repohost.ts`:**

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
```

**New method on `RepoHostService`:**

```typescript
async listContents(
  owner: string,
  repo: string,
  path: string,
  options?: { ref?: string }
): Promise<Result<ContentsResponse, APIError>>
```

**New hook in `@codeplane/ui-core`:**

```typescript
function useRepoTree(
  owner: string,
  repo: string,
  ref?: string,
  path?: string
): { data: ContentsDirectoryResponse | undefined; loading: boolean; error: Error | undefined; refetch: () => void }
```

### CLI Command

**Command:** `codeplane repo contents [path]`

**Options:**

| Flag | Description |
|------|-------------|
| `--repo, -R` | Repository in `OWNER/REPO` format (auto-detected from cwd if in a jj repo) |
| `--ref` | Bookmark, change ID, or revset alias (default: repository default bookmark) |
| `--json` | Output full JSON response |
| `--tree` | Output as an indented tree (default for TTY) |

**Behavior:**
- TTY default: formatted directory listing with type indicators (📁 dirs, 📄 files, 🔗 symlinks, 📦 submodules), size column, and name.
- `--json`: full ContentsResponse JSON object.
- File path: outputs file metadata (not content — use `change cat` for content).
- Exit code `1` on not-found errors with stderr message.

**Examples:**

```bash
# List root directory
codeplane repo contents -R acme/myrepo

# List subdirectory at a bookmark
codeplane repo contents src/components -R acme/myrepo --ref feature-branch

# JSON output
codeplane repo contents src --json -R acme/myrepo

# Generic API passthrough
codeplane api get "/repos/owner/repo/contents/src?ref=main"
```

### Web UI Design

The Contents Tree API is consumed by the **Code Explorer** at `/:owner/:repo/code`:

1. On load, calls `GET /api/repos/:owner/:repo/contents?ref=<default_bookmark>` for root entries.
2. Directory nodes are collapsible; clicking triggers lazy fetch of `GET /contents/<path>?ref=<ref>`.
3. File entries show language-appropriate icons.
4. Symlinks show link icon with target on hover.
5. Submodule entries show package icon, non-expandable, clicking navigates to the submodule repo.
6. Sort: directories first alphabetically, then files alphabetically.
7. Bookmark/ref picker above the tree; changing ref reloads from root.
8. Breadcrumb navigation above file preview, each segment clickable.
9. Truncated directories show "Showing first 10,000 entries" notice.
10. Loading: spinner on expanding node. Error: inline message with retry.

### TUI UI

The TUI file tree sidebar consumes this endpoint:

1. Fetches root via `useRepoTree(owner, repo, ref)`.
2. Expand (`Enter`/`l`), collapse (`h`), navigate (`j`/`k`).
3. Type indicators: `▸` collapsed dir, `▾` expanded dir, ` ` file, `→` symlink, `◉` submodule.
4. Search filter (`/`), bookmark selector (`b`), retry on error (`R`).

### Documentation

1. **API Reference** (`docs/api/contents.mdx`): Both endpoints, parameters, response examples (root, subdir, file, empty dir, symlink, submodule, truncated, all error cases), curl examples, comparison table vs `/file/:change_id/*` vs `/git/trees/:sha`.
2. **Repository Guide** (`docs/guides/repositories.mdx`): "Browsing Directory Contents" section, ref parameter explanation, endpoint table update.
3. **CLI Reference** (`docs/cli/repo.mdx`): `repo contents` command, flags, examples, local vs remote mode.
4. **SDK Reference** (`docs/sdk/repohost.mdx`): `listContents()` method, `ContentsEntry`/`ContentsDirectoryResponse`/`ContentsFileResponse` types.

## Permissions & Security

### Authorization Matrix

| Role | Public Repository | Private Repository |
|------|-------------------|--------------------||
| **Anonymous** | ✅ Read | ❌ 404 |
| **Authenticated (no repo access)** | ✅ Read | ❌ 404 |
| **Repository Read** | ✅ Read | ✅ Read |
| **Repository Write** | ✅ Read | ✅ Read |
| **Repository Admin** | ✅ Read | ✅ Read |
| **Owner** | ✅ Read | ✅ Read |
| **Org Member (team read)** | ✅ Read | ✅ Read |
| **Deploy Key (read scope)** | ✅ Read | ✅ Read |

This is a read-only endpoint. Authorization follows the same repository read-access check used by all other repository content endpoints.

**Key rule:** Private repository access returns `404` (never `403`) to avoid leaking repository existence.

### Rate Limiting

| Consumer | Limit | Window |
|----------|-------|--------|
| Anonymous | 60 requests | per hour, per IP |
| Authenticated user | 5,000 requests | per hour, per token/session |
| Deploy key | 5,000 requests | per hour, per key |
| Agent session | 10,000 requests | per hour, per session |

Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) included on all responses. `Retry-After` header on 429 responses.

### Data Privacy & Security

- **Path traversal prevention**: Route layer rejects `..` before passing to service. SDK layer sanitizes owner/repo. jj/git operate within repository sandbox.
- **Ref injection prevention**: `ref` parameter validated to reject shell metacharacters (`;`, `|`, `&`, `$`, backtick). Whitelist valid ref formats.
- **No PII exposure**: Directory listings contain file names and sizes, not user data. Private repo file names are proprietary and must not leak through error messages, cache headers, or logs.
- **Cache-Control**: Public repos: `Cache-Control: public, max-age=60`. Private repos: `Cache-Control: private, no-store`.
- **Content-Type**: `application/json; charset=utf-8`.
- **CORS**: Inherits server CORS policy.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ContentsTreeViewed` | Successful 200 for a directory listing | `owner`, `repo`, `ref`, `path`, `entry_count`, `truncated`, `client` (web/cli/tui/api/agent), `depth` (path segments) |
| `ContentsFileViewed` | Successful 200 for a single file metadata | `owner`, `repo`, `ref`, `path`, `file_size`, `has_inline_content`, `client` |
| `ContentsNotFound` | 404 response | `owner`, `repo`, `ref`, `path`, `not_found_reason` (repo/ref/path), `client` |
| `ContentsRefSwitched` | User changes ref parameter (client-side in web/TUI) | `owner`, `repo`, `from_ref`, `to_ref`, `ref_type` (bookmark/change_id/revset), `client` |
| `ContentsRateLimited` | 429 response | `owner`, `repo`, `consumer_type` (anonymous/authenticated/deploy_key/agent) |

All events include standard context: `user_id` (if authenticated), `session_id`, `timestamp` (ISO 8601), `request_id`, `ip_country`.

### Funnel Metrics & Success Indicators

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| **Directory browse adoption** | % of active users browsing ≥1 directory per week | > 50% of WAU |
| **Tree depth engagement** | Median directory depth navigated per session | > 2 levels deep |
| **Lazy load success rate** | % of expanded directories loading successfully first attempt | > 99% |
| **Ref-switching usage** | % of sessions switching refs at least once | > 15% |
| **Error rate** | % of requests returning 4xx/5xx | < 2% (4xx), < 0.1% (5xx) |
| **Client distribution** | Requests by client type | Web > 45%, TUI > 10%, CLI > 10%, API/Agent > 10% |
| **Change ID ref usage** | % of requests where ref is a jj change ID | Tracking only (higher = stronger jj adoption) |

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Notes |
|-----------|-------|-------------------|-------|
| Contents request received | `debug` | `owner`, `repo`, `path`, `ref`, `user_id`, `request_id` | Never log directory entries |
| Contents directory served | `info` | `owner`, `repo`, `path`, `ref`, `entry_count`, `truncated`, `duration_ms`, `request_id` | |
| Contents file served | `info` | `owner`, `repo`, `path`, `ref`, `file_size`, `has_content`, `duration_ms`, `request_id` | Never log file content |
| Path not found | `info` | `owner`, `repo`, `path`, `ref`, `request_id` | Expected navigation miss |
| Ref not found | `info` | `owner`, `repo`, `ref`, `request_id` | Expected user error |
| Repository not found | `warn` | `owner`, `repo`, `request_id` | May indicate stale links |
| jj/git subprocess failure | `error` | `owner`, `repo`, `path`, `ref`, `exit_code`, `stderr` (truncated 500 chars), `request_id` | Operational issue |
| Path traversal attempt | `warn` | `owner`, `repo`, `path`, `remote_ip`, `user_id`, `request_id` | Security-relevant |
| Ref injection attempt | `warn` | `owner`, `repo`, `ref`, `remote_ip`, `user_id`, `request_id` | Security-relevant |
| Rate limit exceeded | `warn` | `owner`, `repo`, `consumer_type`, `remote_ip`, `request_id` | |
| Directory truncated | `info` | `owner`, `repo`, `path`, `ref`, `total_entries`, `returned_entries`, `request_id` | |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_contents_requests_total` | Counter | `status` (2xx/4xx/5xx), `response_type` (dir/file), `client` | Total contents requests |
| `codeplane_contents_duration_seconds` | Histogram | `response_type` (dir/file) | Request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5) |
| `codeplane_contents_entries_returned` | Histogram | | Entries per directory response (buckets: 0, 1, 10, 50, 100, 500, 1000, 5000, 10000) |
| `codeplane_contents_truncated_total` | Counter | | Truncated directory responses |
| `codeplane_contents_subprocess_duration_seconds` | Histogram | | jj/git subprocess duration |
| `codeplane_contents_subprocess_errors_total` | Counter | `error_type` (exit_code/timeout/spawn) | Subprocess failures |
| `codeplane_contents_path_traversal_total` | Counter | | Rejected path traversal attempts |
| `codeplane_contents_ref_injection_total` | Counter | | Rejected ref injection attempts |

### Alerts & Runbooks

**Alert 1: High Contents Subprocess Error Rate**
- **Condition:** `rate(codeplane_contents_subprocess_errors_total[5m]) > 0.5`
- **Severity:** `warning`
- **Runbook:**
  1. Check jj/git binary availability: `which jj && which git` on the server.
  2. Check disk space: `df -h $CODEPLANE_DATA_DIR/repos`.
  3. Check logs for `error_type` breakdown (spawn vs exit_code vs timeout).
  4. If `spawn` errors: check file descriptor exhaustion — `ls /proc/<pid>/fd | wc -l`.
  5. If repo-specific: try `jj log` or `git status` manually in affected repo.
  6. Check for stale `.jj/repo/op_store/lock` files.
  7. If `exit_code` errors: check `stderr` in logs for specific error message.

**Alert 2: High Contents Latency (P95 > 3s)**
- **Condition:** `histogram_quantile(0.95, rate(codeplane_contents_duration_seconds_bucket[5m])) > 3`
- **Severity:** `warning`
- **Runbook:**
  1. Check subprocess duration — if dominant, issue is I/O or jj/git performance.
  2. Check entries_returned histogram — large directories cause proportional latency.
  3. Check `iostat -x 1 5` for disk latency.
  4. Check if specific repos are the cause (large monorepos).
  5. Check for competing heavy operations (pushes, artifact writes).
  6. Consider read-through cache for hot directory listings.

**Alert 3: Path Traversal / Ref Injection Spike**
- **Condition:** `increase(codeplane_contents_path_traversal_total[1h]) + increase(codeplane_contents_ref_injection_total[1h]) > 20`
- **Severity:** `critical`
- **Runbook:**
  1. Pull structured logs for traversal/injection entries.
  2. Extract `remote_ip` and `user_id`. Check single-source pattern.
  3. Single IP: add to temporary block list or WAF deny rule.
  4. Single user: review account for compromise; consider suspension.
  5. Test validation logic manually with known-bad inputs.
  6. Escalate to security team if coordinated probing suspected.

**Alert 4: Sustained 5xx Rate > 5%**
- **Condition:** `rate(codeplane_contents_requests_total{status="5xx"}[5m]) / rate(codeplane_contents_requests_total[5m]) > 0.05`
- **Severity:** `critical`
- **Runbook:**
  1. Check error logs for stack traces by `request_id`.
  2. Determine global vs repo-specific scope.
  3. Verify binary health: `jj version`, `git version`.
  4. Check OOM: `dmesg | grep -i oom`.
  5. Check Bun subprocess limits.
  6. If repo-specific: `git fsck` on colocated `.git`.
  7. If transient: check concurrent repo operations causing lock contention.

**Alert 5: High Truncation Rate**
- **Condition:** `rate(codeplane_contents_truncated_total[1h]) / rate(codeplane_contents_requests_total{status="2xx"}[1h]) > 0.10`
- **Severity:** `info`
- **Runbook:**
  1. Not an operational emergency. Review which repos have >10k entries per directory.
  2. Consider increasing truncation limit if resources permit.
  3. Consider cursor-based pagination as future enhancement.
  4. File product issue to track pagination work.

### Error Cases & Failure Modes

| Error Case | HTTP Status | Detection | Impact | Mitigation |
|------------|-------------|-----------|--------|------------|
| jj binary not found | 500 | Spawn error | All requests fail | Pre-flight startup check |
| git binary not found | 500 | Spawn error | All requests fail | Pre-flight startup check |
| Repo directory missing on disk | 404 | ensureRepo() | Single-repo | Expected for deleted repos |
| jj/git lock contention | 500 | stderr contains "lock" | Temp per-repo | Retry once after 100ms |
| Disk full | 500 | OS error | All repos on volume | Independent disk alert |
| Subprocess timeout (>30s) | 500 | Timeout kill | Single request | Alert; investigate |
| >100k entries in dir | 200 (truncated) | Entry count | Partial response | truncated flag |
| Invalid UTF-8 in filenames | 200 | Git output | Garbled names possible | Escape invalid sequences |
| jj version incompatibility | 500 | Unexpected output | Parse failures | Pin supported version range |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `API-CT-001` | `GET /api/repos/:owner/:repo/contents` for a repo with files at root | `200`, `type: "dir"`, non-empty `entries`, `truncated: false` |
| `API-CT-002` | `GET /api/repos/:owner/:repo/contents/src` for known subdirectory | `200`, `type: "dir"`, entries matching subdirectory |
| `API-CT-003` | `GET /api/repos/:owner/:repo/contents/README.md` for known file | `200`, `type: "file"`, `content` present (base64), `size > 0` |
| `API-CT-004` | `GET /contents?ref=main` with explicit ref | `200`, directory listing at `main` |
| `API-CT-005` | `GET /contents?ref=<change_id>` with jj change ID | `200`, listing at that change |
| `API-CT-006` | `GET /contents?ref=@` with jj revset alias | `200`, listing at working copy |
| `API-CT-007` | `GET /contents?ref=nonexistent-bookmark` | `404`, message contains "ref" and "not found" |
| `API-CT-008` | `GET /contents/nonexistent-path` | `404`, message contains "path" and "not found" |
| `API-CT-009` | `GET /api/repos/nonexistent/repo/contents` | `404`, "repository not found" |
| `API-CT-010` | `GET /contents/../../../etc/passwd` | `400`, "traversal" |
| `API-CT-011` | `GET /contents/..` | `400`, "traversal" |
| `API-CT-012` | `GET /contents/src/..` | `400`, "traversal" |
| `API-CT-013` | `GET /contents/` (trailing slash) | `200`, same as `/contents` |
| `API-CT-014` | `GET /contents/src/` (trailing slash) | `200`, same as `/contents/src` |
| `API-CT-015` | `GET /contents/src//lib` (double slash) | `200`, normalized |
| `API-CT-016` | Verify sort: dirs first alphabetical, then files alphabetical | Correct order |
| `API-CT-017` | Each entry has `name`, `path`, `type`, `size`, `sha`, `download_url` | All fields present |
| `API-CT-018` | `size` is `null` for dir entries | Verified |
| `API-CT-019` | `size` is positive integer for file entries | Verified |
| `API-CT-020` | `download_url` is `null` for dir entries | Verified |
| `API-CT-021` | `download_url` is valid URL for file entries | Points to file API |
| `API-CT-022` | File response: `content` is valid base64 | Decoded matches file |
| `API-CT-023` | File > 1 MB: `content: null`, `encoding: "none"` | Metadata only |
| `API-CT-024` | File exactly 1 MB: `content` present | Full content returned |
| `API-CT-025` | File at 1 MB + 1 byte: `content: null` | Threshold enforced |
| `API-CT-026` | Empty directory | `200`, `entries: []`, `truncated: false` |
| `API-CT-027` | Empty repo (no commits) root | `200`, `entries: []` |
| `API-CT-028` | Symlink entry has `type: "symlink"`, `link_target` set | Correct |
| `API-CT-029` | Submodule entry has `type: "submodule"` | Correct |
| `API-CT-030` | Path with spaces: `GET /contents/my%20dir/my%20file.txt` | `200` or `404`, decoded correctly |
| `API-CT-031` | Path with Unicode: `GET /contents/docs/%E6%97%A5%E6%9C%AC%E8%AA%9E` | `200` or `404` (no 400/500) |
| `API-CT-032` | Deeply nested path (50 levels) | `200` if exists |
| `API-CT-033` | `ref` with `; rm -rf /` | `400`, "invalid ref" |
| `API-CT-034` | `ref` with `| cat /etc/passwd` | `400`, "invalid ref" |
| `API-CT-035` | `ref` with backtick injection | `400`, "invalid ref" |
| `API-CT-036` | `ref` > 256 characters | `400`, "invalid ref" |
| `API-CT-037` | `ref` exactly 256 characters (valid) | `200` or `404` (accepted) |
| `API-CT-038` | `.jj/config.toml` path | `404` |
| `API-CT-039` | `.git/config` path | `404` |
| `API-CT-040` | 10 concurrent requests, same directory | All `200`, identical |
| `API-CT-041` | 10 concurrent requests, different directories | All correct |
| `API-CT-042` | Content-Type is `application/json; charset=utf-8` | Verified |

### Repository Access Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `API-CT-050` | Authenticated user, public repo | `200` |
| `API-CT-051` | Anonymous user, public repo | `200` |
| `API-CT-052` | Authenticated with read access, private repo | `200` |
| `API-CT-053` | Authenticated without access, private repo | `404` (not 403) |
| `API-CT-054` | Anonymous, private repo | `404` (not 401/403) |
| `API-CT-055` | PAT with read scope | `200` |
| `API-CT-056` | Deploy key with read scope | `200` |
| `API-CT-057` | Archived repository | `200` |
| `API-CT-058` | Org member with team read, private org repo | `200` |

### Truncation Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `API-CT-060` | Directory with 10,000 entries | `200`, all entries, `truncated: false` |
| `API-CT-061` | Directory with 10,001 entries | `200`, 10,000 entries, `truncated: true` |
| `API-CT-062` | Directory with 50 entries | `200`, 50 entries, `truncated: false` |
| `API-CT-063` | Directory with 1 entry | `200`, 1 entry, `truncated: false` |

### Rate Limiting Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `API-CT-070` | Auth user: 5,001st request in 1 hour | `429` with `Retry-After` |
| `API-CT-071` | Anonymous: 61st request in 1 hour | `429` with `Retry-After` |
| `API-CT-072` | 429 response has `X-RateLimit-*` headers | Present |
| `API-CT-073` | Non-429 response has `X-RateLimit-*` headers | Present |

### CLI Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CLI-CT-001` | `codeplane repo contents -R owner/repo` | Exit 0, root entries |
| `CLI-CT-002` | `codeplane repo contents src -R owner/repo` | Exit 0, src entries |
| `CLI-CT-003` | `codeplane repo contents src --json -R owner/repo` | Exit 0, valid ContentsResponse JSON |
| `CLI-CT-004` | `codeplane repo contents nonexistent -R owner/repo` | Exit 1, stderr "not found" |
| `CLI-CT-005` | `codeplane repo contents -R owner/repo --ref main` | Exit 0, entries at main |
| `CLI-CT-006` | `codeplane repo contents -R owner/repo --ref nonexistent` | Exit 1, stderr "not found" |
| `CLI-CT-007` | `codeplane repo contents` (inside local jj repo) | Exit 0, root listing |
| `CLI-CT-008` | `codeplane api get "/repos/owner/repo/contents/src?ref=main"` | Exit 0, raw JSON |

### E2E Playwright Tests (Web UI)

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `E2E-CT-001` | Navigate to `/:owner/:repo/code`, verify file tree renders | Sidebar with root entries |
| `E2E-CT-002` | Click directory node | Expands, shows children |
| `E2E-CT-003` | Click expanded directory | Collapses |
| `E2E-CT-004` | Verify dirs before files in tree | Sort order correct |
| `E2E-CT-005` | Click file in tree | Preview panel loads |
| `E2E-CT-006` | Switch bookmark in ref picker | Tree reloads |
| `E2E-CT-007` | Navigate nested dir, verify breadcrumbs | Full path, each segment clickable |
| `E2E-CT-008` | Click breadcrumb segment | Navigates to that level |
| `E2E-CT-009` | Private repo while unauthenticated | Redirect to login |
| `E2E-CT-010` | Non-existent repo | 404 page |
| `E2E-CT-011` | Symlink entry shows link icon | Visual indicator present |
| `E2E-CT-012` | Submodule entry non-expandable | Does not expand |

### TUI E2E Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `TUI-CT-001` | Code tab, verify tree renders | Root entries visible |
| `TUI-CT-002` | `j`/`k` cursor movement | Cursor moves between entries |
| `TUI-CT-003` | `Enter` on directory | Expands with children |
| `TUI-CT-004` | `h` on expanded directory | Collapses |
| `TUI-CT-005` | `Enter` on file | Preview loads |
| `TUI-CT-006` | `b` opens bookmark selector | Picker appears |
| `TUI-CT-007` | Select different bookmark | Tree reloads |
| `TUI-CT-008` | `/` and type query | Tree filters |
| `TUI-CT-009` | Loading spinner during fetch | `⟳` visible |
| `TUI-CT-010` | Network error, verify error state | `✗` with message, `R` to retry |

### Performance Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `PERF-CT-001` | Root listing, 50 entries | < 500ms |
| `PERF-CT-002` | Root listing, 1,000 entries | < 1,000ms |
| `PERF-CT-003` | Root listing, 10,000 entries | < 3,000ms |
| `PERF-CT-004` | Single file metadata request | < 500ms |
| `PERF-CT-005` | 50 sequential directory expands | All within 15s total |
