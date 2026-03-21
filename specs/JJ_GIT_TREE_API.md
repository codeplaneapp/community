# JJ_GIT_TREE_API

Specification for JJ_GIT_TREE_API.

## High-Level User POV

When a developer browses a repository on Codeplane, they need to inspect the underlying Git tree objects that represent directory snapshots at specific points in history. The JJ Git Tree API provides low-level, content-addressable access to Git tree objects by their SHA hash. This is distinct from the higher-level `/contents` endpoint (which provides path-based browsing at a human-readable ref): the Git tree endpoint exposes the raw tree structure as Git internally represents it — a list of entries, each with a name, mode, type, and SHA hash pointing to either a blob or another tree.

This capability matters for three categories of users. First, developers and tooling authors who need to walk the Git object graph programmatically — for example, building a custom file diff tool, performing repository analytics, or integrating with third-party services that expect GitHub-compatible tree endpoints. Second, the Codeplane web UI, TUI, and editor integrations themselves, which may need to resolve tree objects when rendering repository graphs, code explorers, or landing request diffs that reference specific commit trees. Third, CI/CD workflows and agent sessions that need to inspect the exact file layout of a repository at a precise commit tree without relying on bookmark or change-ID resolution.

The user experience is straightforward: given a repository they have read access to, they provide a Git tree SHA, and the API returns the list of entries in that tree — each with its filesystem name, type (blob, tree, or commit for submodules), mode bits, size (for blobs), and SHA. If the tree SHA is invalid or does not exist in the repository, the API returns a clear 404 error. If the repository itself does not exist or the user lacks read access, the API returns the appropriate 404 or 403 error. The endpoint also supports a `recursive` query parameter that flattens the entire tree hierarchy into a single response, and a `per_page` parameter to limit the number of entries returned.

From the CLI, users can invoke `codeplane api get /repos/:owner/:repo/git/trees/:sha` to retrieve tree objects. The TUI code explorer and web UI code explorer use this endpoint internally when they need to resolve trees during graph visualization or when navigating from a commit object to its file tree.

## Acceptance Criteria

### Definition of Done

- [ ] `GET /api/repos/:owner/:repo/git/trees/:sha` returns a JSON response containing the tree entries for the given SHA
- [ ] Each tree entry includes `path` (entry name), `mode` (Git file mode string), `type` (`"blob"`, `"tree"`, or `"commit"`), `sha` (hex-encoded object SHA), and `size` (integer, present only for blobs)
- [ ] The response envelope includes `sha` (the requested tree SHA), `url` (canonical API URL for this tree), and `tree` (array of entries), and `truncated` (boolean indicating if the response was truncated due to size limits)
- [ ] The `recursive` query parameter (`?recursive=1` or `?recursive=true`) flattens all nested trees into a single response with full relative paths
- [ ] Non-recursive requests return only the immediate children of the requested tree (one level deep)
- [ ] When `recursive=1`, entry `path` fields use forward-slash-separated relative paths from the tree root (e.g., `src/lib/utils.ts`)
- [ ] The response is sorted: trees/directories first, then blobs/files, both groups alphabetically by name (case-sensitive, matching Git convention)
- [ ] The `per_page` query parameter limits the number of entries returned (default: 100, max: 10000)
- [ ] If the total entries exceed `per_page` (or the system maximum of 100,000 entries for recursive trees), the `truncated` field is set to `true`
- [ ] If the SHA does not reference a valid tree object, the API returns `404` with `{ "message": "tree not found" }`
- [ ] If the SHA is not a valid hex string or is not exactly 40 characters, the API returns `400` with `{ "message": "invalid tree SHA" }`
- [ ] If the repository does not exist, the API returns `404` with `{ "message": "repository not found" }`
- [ ] If the user lacks read access to the repository, the API returns `404` (not 403, to avoid leaking repository existence)
- [ ] The route handler delegates to the `RepoHostService` which shells out to `git ls-tree` on the colocated Git backend
- [ ] The endpoint is wired into the existing route mount in `apps/server/src/routes/repos.ts`, replacing the current 501 stub
- [ ] The SDK exports a `TreeEntry` type and a `getGitTree` method on `RepoHostService`
- [ ] The `@codeplane/ui-core` API client exposes a `getGitTree(owner, repo, sha, options?)` method
- [ ] The CLI `api` subcommand can call this endpoint via `codeplane api get`

### Boundary Constraints

- [ ] `sha` parameter: exactly 40 hexadecimal characters (`[0-9a-f]{40}`), case-insensitive on input, normalized to lowercase in response
- [ ] `owner` parameter: 1–39 characters, alphanumeric plus hyphens, no leading/trailing hyphens
- [ ] `repo` parameter: 1–100 characters, alphanumeric plus hyphens/underscores/dots, no leading dots, no `.git` suffix
- [ ] `per_page` parameter: integer 1–10000, default 100
- [ ] `recursive` parameter: `"1"`, `"true"`, or `"yes"` treated as truthy; all other values (including absent) treated as falsy
- [ ] Maximum total entries in a recursive response: 100,000. Beyond this, `truncated: true` and only the first 100,000 entries are returned
- [ ] Entry `path` values for non-recursive responses are bare filenames (no slashes)
- [ ] Entry `path` values for recursive responses use forward slashes, never backslashes
- [ ] Entry `mode` values are standard Git mode strings: `"100644"` (normal file), `"100755"` (executable), `"120000"` (symlink), `"040000"` (directory/tree), `"160000"` (submodule/commit)
- [ ] Entry `size` is present and non-negative for blobs; absent or omitted for tree and commit entries
- [ ] Path traversal attempts via `..` in the SHA parameter are rejected with 400

### Edge Cases

- [ ] Empty tree (valid tree object with zero entries): returns `{ sha, url, tree: [], truncated: false }`
- [ ] Tree containing only one entry: returns correctly with single-element array
- [ ] Tree containing a submodule entry: entry has `type: "commit"` and `mode: "160000"`, no `size`
- [ ] Tree containing a symlink: entry has `type: "blob"` and `mode: "120000"`, `size` reflects the link target path length
- [ ] Deeply nested recursive tree (100+ levels): returned flattened, paths use forward slashes
- [ ] Very large tree (10,000+ entries at one level): paginated by `per_page`, `truncated` set appropriately
- [ ] SHA references a blob instead of a tree: returns `404` with `"not a tree object"`
- [ ] SHA references a commit instead of a tree: returns `404` with `"not a tree object"`
- [ ] Concurrent requests for the same tree SHA: all return the same result (stateless, no caching side effects)
- [ ] Repository exists but is archived: tree endpoint still works (read-only access is preserved for archived repos)
- [ ] Empty SHA parameter: returns `400`
- [ ] SHA with uppercase hex characters: accepted, normalized to lowercase in response

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/git/trees/:sha`

**Query Parameters:**

| Parameter   | Type    | Default | Description |
|-------------|---------|---------|-------------|
| `recursive` | string  | (falsy) | Set to `1`, `true`, or `yes` to flatten all nested trees |
| `per_page`  | integer | 100     | Number of entries to return (1–10000) |

**Success Response (200):**

```json
{
  "sha": "abc123def456...",
  "url": "https://codeplane.example/api/repos/owner/repo/git/trees/abc123def456...",
  "tree": [
    {
      "path": "src",
      "mode": "040000",
      "type": "tree",
      "sha": "def789..."
    },
    {
      "path": "README.md",
      "mode": "100644",
      "type": "blob",
      "sha": "ghi012...",
      "size": 4521
    }
  ],
  "truncated": false
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|-----------||
| 400 | `{ "message": "invalid tree SHA" }` | SHA is not a valid 40-char hex string |
| 400 | `{ "message": "invalid per_page value" }` | `per_page` is not a valid integer in range |
| 404 | `{ "message": "repository not found" }` | Repository does not exist or user lacks access |
| 404 | `{ "message": "tree not found" }` | SHA does not reference a tree object |
| 429 | `{ "message": "rate limit exceeded" }` | Too many requests |
| 500 | `{ "message": "internal server error" }` | Unexpected failure in git ls-tree |

### SDK Shape

**New type in `packages/sdk/src/services/repohost.ts`:**

```typescript
export interface TreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

export interface GitTreeResponse {
  sha: string;
  url: string;
  tree: TreeEntry[];
  truncated: boolean;
}
```

**New method on `RepoHostService`:**

```typescript
async getGitTree(
  owner: string,
  repo: string,
  sha: string,
  options?: { recursive?: boolean; perPage?: number }
): Promise<Result<GitTreeResponse, APIError>>
```

The implementation shells out to `git ls-tree` on the colocated Git backend:
- Non-recursive: `git ls-tree -l <sha>`
- Recursive: `git ls-tree -r -l <sha>`

Output parsing splits each line by whitespace to extract mode, type, sha, size, and path.

### CLI Command

The endpoint is accessible through the generic `codeplane api` passthrough:

```bash
# Fetch a tree
codeplane api get /repos/myorg/myrepo/git/trees/abc123def456...

# Fetch recursively
codeplane api get "/repos/myorg/myrepo/git/trees/abc123...?recursive=1"

# With per_page
codeplane api get "/repos/myorg/myrepo/git/trees/abc123...?per_page=500"
```

No dedicated CLI subcommand is required for this low-level endpoint. The `codeplane api` command already supports arbitrary GET requests with JSON output formatting.

### Web UI Design

The JJ Git Tree API is a backend-only data endpoint. It does not have its own dedicated web UI page. It is consumed internally by:

- **Code Explorer**: When resolving a commit's tree SHA to render the file tree sidebar, the web UI may call this endpoint to walk tree objects.
- **Repository Graph**: When rendering commit graph nodes, clicking a commit may resolve its tree via this endpoint.
- **Landing Request Diff View**: When comparing trees between changes, the diff engine may call this endpoint.

No new web UI routes or components are required specifically for this feature.

### TUI UI

The TUI does not expose a direct "browse git trees by SHA" screen. The TUI code explorer consumes the higher-level `/contents` endpoint. However, the TUI's internal data layer (`@codeplane/ui-core`) should export a `getGitTree` client method so that future TUI features (e.g., graph inspection, commit detail drilldown) can use it.

### Documentation

The following documentation should be written:

- **API Reference entry** for `GET /api/repos/:owner/:repo/git/trees/:sha` including all parameters, response shape, error codes, and examples
- **SDK Reference entry** for `RepoHostService.getGitTree()` method with type signatures and usage examples
- **CLI Guide addendum** showing how to use `codeplane api get` to fetch tree objects, with example output
- **Conceptual note** in the JJ-native repository docs explaining the relationship between jj change IDs, Git commit SHAs, and Git tree SHAs, and when to use each endpoint

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| Repository Owner | ✅ Full access |
| Repository Admin | ✅ Full access |
| Repository Member (Write) | ✅ Full access |
| Repository Member (Read) | ✅ Full access |
| Organization Member (with repo access) | ✅ Full access (if repo is accessible to the team) |
| Authenticated User (non-member, public repo) | ✅ Full access |
| Authenticated User (non-member, private repo) | ❌ Returns 404 |
| Anonymous (public repo) | ✅ Full access |
| Anonymous (private repo) | ❌ Returns 404 |

**Key security rules:**

- Private repository access must return `404` (not `403`) to avoid leaking repository existence
- Archived repositories remain readable — the tree endpoint works on archived repos
- Deploy keys with read access can access this endpoint
- PAT-based auth follows the same permission model as session-based auth

### Rate Limiting

| Context | Limit |
|---------|-------|
| Authenticated user | 5,000 requests/hour (shared across all API endpoints) |
| Anonymous user | 60 requests/hour |
| Per-repository burst | 100 requests/minute per repository per user |

The `recursive=1` variant should count as a single request but may be weighted as 5x for rate-limiting purposes since it is significantly more expensive.

### Data Privacy

- Tree SHAs, file modes, and file names are not PII, but repository content structure may be proprietary
- Private repo tree data must never leak through error messages, logs, or caching headers
- Response must include `Cache-Control: private` for private repositories and `Cache-Control: public, max-age=300` for public repositories (tree objects are immutable once created)
- No credentials, secrets, or user PII are present in tree responses

## Telemetry & Product Analytics

### Business Events

| Event | Properties | Description |
|-------|------------|-------------|
| `GitTreeViewed` | `owner`, `repo`, `sha`, `recursive` (boolean), `entry_count` (int), `truncated` (boolean), `response_time_ms`, `client` (web/cli/tui/api) | Fired on every successful tree retrieval |
| `GitTreeNotFound` | `owner`, `repo`, `sha`, `error_reason` (string) | Fired when a tree lookup fails with 404 |
| `GitTreeTruncated` | `owner`, `repo`, `sha`, `total_entries`, `returned_entries` | Fired when a response is truncated due to size limits |

### Event Properties

All events should include standard context properties:

- `user_id` (if authenticated)
- `session_id`
- `timestamp`
- `request_id`
- `ip_country` (for analytics, never logged as raw IP)

### Funnel Metrics and Success Indicators

- **Adoption**: Number of unique repositories accessed via git/trees endpoint per week
- **Latency P95**: Tree endpoint response time should be < 500ms for non-recursive, < 2000ms for recursive
- **Error Rate**: 4xx/5xx rate should be < 2% of total requests
- **Recursive Usage**: Percentage of requests using `recursive=1` — helps inform whether users prefer flat or hierarchical browsing
- **Truncation Rate**: Percentage of responses that are truncated — if > 10%, consider increasing limits or adding pagination cursors
- **Client Distribution**: Breakdown of requests by client type (web, CLI, TUI, external) — helps prioritize client-specific optimizations

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | Condition |
|-----------|-------|-------------------|----------|
| Tree request received | `info` | `owner`, `repo`, `sha`, `recursive`, `per_page`, `request_id`, `user_id` | Every request |
| Tree returned successfully | `info` | `owner`, `repo`, `sha`, `entry_count`, `truncated`, `duration_ms`, `request_id` | Successful response |
| Tree not found | `warn` | `owner`, `repo`, `sha`, `error`, `request_id` | 404 response |
| Invalid SHA parameter | `warn` | `owner`, `repo`, `sha_input`, `request_id` | 400 response |
| Git ls-tree failed | `error` | `owner`, `repo`, `sha`, `exit_code`, `stderr`, `duration_ms`, `request_id` | git subprocess failure |
| Git ls-tree timeout | `error` | `owner`, `repo`, `sha`, `timeout_ms`, `request_id` | git subprocess exceeded timeout |
| Rate limit exceeded | `warn` | `owner`, `repo`, `user_id`, `request_id` | 429 response |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_git_tree_requests_total` | Counter | `owner`, `repo`, `status` (200/400/404/429/500), `recursive` (true/false) | Total requests to the git tree endpoint |
| `codeplane_git_tree_duration_seconds` | Histogram | `owner`, `repo`, `recursive` | Request duration in seconds (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10) |
| `codeplane_git_tree_entries_returned` | Histogram | `recursive` | Number of entries returned per request (buckets: 1, 10, 50, 100, 500, 1000, 5000, 10000, 100000) |
| `codeplane_git_tree_truncated_total` | Counter | `owner`, `repo` | Number of truncated responses |
| `codeplane_git_lstree_subprocess_duration_seconds` | Histogram | `recursive` | Duration of the underlying git ls-tree subprocess |
| `codeplane_git_lstree_subprocess_errors_total` | Counter | `exit_code` | Git ls-tree subprocess failures |

### Alerts

**Alert 1: High Git Tree Error Rate**

| Field | Value |
|-------|-------|
| Name | `GitTreeHighErrorRate` |
| Condition | `rate(codeplane_git_tree_requests_total{status=~"5.."}[5m]) / rate(codeplane_git_tree_requests_total[5m]) > 0.05` |
| Severity | Warning |
| For | 5 minutes |

**Runbook:**
1. Check `codeplane_git_lstree_subprocess_errors_total` — if rising, the `git` binary may be unavailable or the repository data directory may be corrupted.
2. SSH into the server and verify `git --version` works.
3. Check disk space on the `CODEPLANE_DATA_DIR` volume — full disk causes git failures.
4. Check recent deploys — a misconfigured `PATH` or `CODEPLANE_DATA_DIR` could prevent git from finding repos.
5. Review error logs filtered by `request_id` for specific stderr output from git.
6. If a specific repository is affected, run `git fsck` on its `.git` directory.

**Alert 2: High Git Tree Latency**

| Field | Value |
|-------|-------|
| Name | `GitTreeHighLatency` |
| Condition | `histogram_quantile(0.95, rate(codeplane_git_tree_duration_seconds_bucket[5m])) > 5` |
| Severity | Warning |
| For | 10 minutes |

**Runbook:**
1. Check `codeplane_git_lstree_subprocess_duration_seconds` — if the subprocess itself is slow, the bottleneck is git/disk I/O.
2. Check server CPU and memory — high load may cause subprocess scheduling delays.
3. Check if the spike correlates with a specific repository — very large repositories (>1M objects) may have inherently slow tree walks.
4. Check if `recursive=true` requests dominate — consider increasing `per_page` defaults or adding response caching for hot trees.
5. If disk I/O is the bottleneck, consider moving `CODEPLANE_DATA_DIR` to faster storage (SSD/NVMe).

**Alert 3: Git Tree Subprocess Timeout**

| Field | Value |
|-------|-------|
| Name | `GitTreeSubprocessTimeout` |
| Condition | `increase(codeplane_git_lstree_subprocess_errors_total{exit_code="timeout"}[15m]) > 5` |
| Severity | Critical |
| For | 0 minutes (immediate) |

**Runbook:**
1. Identify the affected repository from error logs.
2. Check if the repository has an unusually large tree (>100,000 files) — consider whether the 30-second subprocess timeout needs adjusting.
3. Check for disk I/O contention — run `iostat` or check monitoring dashboards.
4. If a single repository is causing all timeouts, inspect it with `git count-objects -v` to check for bloat.
5. If many repositories are affected simultaneously, check for infrastructure issues (NFS mount stalls, disk failures).

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Recovery |
|-------|-------------|-------|----------|
| Invalid SHA format | 400 | Client sent non-hex or wrong-length SHA | Client must fix SHA — no server action |
| Repository not found | 404 | Repo doesn't exist or user lacks access | Verify repo name and credentials |
| Tree object not found | 404 | SHA exists but is not a tree, or SHA doesn't exist | Client should verify the SHA was obtained from a valid commit |
| Git subprocess timeout | 500 | `git ls-tree` exceeded 30s timeout | Usually very large repos — retry with smaller `per_page` or without `recursive` |
| Git subprocess crash | 500 | `git ls-tree` exited non-zero | Check repo integrity with `git fsck`; may indicate corrupt packfile |
| Disk I/O failure | 500 | Underlying filesystem error | Check disk health, mounts, available space |
| Rate limit exceeded | 429 | User exceeded request quota | Client should back off and retry with exponential delay |

## Verification

### API Integration Tests

- [ ] `GET /api/repos/:owner/:repo/git/trees/:sha` with a valid tree SHA returns 200 with correct entry structure
- [ ] Response includes `sha`, `url`, `tree` array, and `truncated` fields
- [ ] Each entry in `tree` has `path`, `mode`, `type`, `sha` fields
- [ ] Blob entries include `size` as a non-negative integer
- [ ] Tree entries do not include `size` field (or it is omitted/undefined)
- [ ] Non-recursive request returns only immediate children (one level)
- [ ] `?recursive=1` returns flattened entries with full paths containing forward slashes
- [ ] `?recursive=true` behaves identically to `?recursive=1`
- [ ] `?recursive=yes` behaves identically to `?recursive=1`
- [ ] Absent `recursive` parameter returns one-level entries only
- [ ] `?recursive=0` returns one-level entries only (treated as falsy)
- [ ] `?recursive=false` returns one-level entries only
- [ ] Entries are sorted: trees first (alphabetical), then blobs (alphabetical)
- [ ] Recursive entries maintain alphabetical sort within their flattened paths
- [ ] `?per_page=5` limits response to 5 entries and sets `truncated: true` if total > 5
- [ ] `?per_page=10000` is accepted as the maximum valid value
- [ ] `?per_page=10001` returns 400 with `"invalid per_page value"`
- [ ] `?per_page=0` returns 400 with `"invalid per_page value"`
- [ ] `?per_page=-1` returns 400 with `"invalid per_page value"`
- [ ] `?per_page=abc` returns 400 with `"invalid per_page value"`
- [ ] Default `per_page` (no parameter) returns up to 100 entries

### SHA Validation Tests

- [ ] Valid 40-character lowercase hex SHA returns 200 (assuming tree exists)
- [ ] Valid 40-character uppercase hex SHA returns 200 (case-insensitive input accepted)
- [ ] SHA is normalized to lowercase in the response body
- [ ] 39-character hex string returns 400 `"invalid tree SHA"`
- [ ] 41-character hex string returns 400 `"invalid tree SHA"`
- [ ] Empty SHA parameter returns 400 `"invalid tree SHA"`
- [ ] SHA containing non-hex characters (e.g., `g`, `z`, `!`) returns 400
- [ ] SHA that is valid hex but does not exist in the repo returns 404 `"tree not found"`
- [ ] SHA that references a blob object returns 404 `"not a tree object"`
- [ ] SHA that references a commit object returns 404 `"not a tree object"`

### Repository Access Tests

- [ ] Authenticated user with read access to a public repo: 200
- [ ] Authenticated user with read access to a private repo: 200
- [ ] Authenticated user without access to a private repo: 404
- [ ] Anonymous user on a public repo: 200
- [ ] Anonymous user on a private repo: 404
- [ ] PAT-authenticated user with repo scope: 200
- [ ] Deploy key with read access: 200
- [ ] Archived repository: 200 (read-only access preserved)
- [ ] Non-existent repository: 404 `"repository not found"`
- [ ] Non-existent owner: 404 `"repository not found"`

### Content Correctness Tests

- [ ] A tree with one file entry returns one blob entry with correct name, mode `"100644"`, type `"blob"`, valid sha, and correct size
- [ ] A tree with one directory entry returns one entry with mode `"040000"`, type `"tree"`, valid sha, no size
- [ ] A tree with both files and directories returns directories first, then files
- [ ] An empty tree (no entries) returns `{ tree: [], truncated: false }`
- [ ] A tree with an executable file returns mode `"100755"`
- [ ] A tree with a symlink returns mode `"120000"` and type `"blob"`
- [ ] A tree with a submodule returns mode `"160000"` and type `"commit"`
- [ ] Recursive tree with nested directories returns correct full paths (e.g., `dir/subdir/file.txt`)
- [ ] Recursive tree does not include directory entries themselves (only leaf entries), matching git ls-tree -r behavior
- [ ] File with a space in the name is returned correctly
- [ ] File with unicode characters in the name is returned correctly
- [ ] File with a very long name (255 characters) is returned correctly

### Truncation and Pagination Tests

- [ ] Repository with 150 entries at root, default `per_page=100`: returns 100 entries, `truncated: true`
- [ ] Repository with 50 entries at root, default `per_page=100`: returns 50 entries, `truncated: false`
- [ ] Repository with 100 entries at root, `per_page=100`: returns 100 entries, `truncated: false`
- [ ] Recursive tree with 100,001 total entries: returns 100,000 entries, `truncated: true`
- [ ] Recursive tree with exactly 100,000 entries: returns 100,000 entries, `truncated: false`
- [ ] Maximum valid `per_page=10000` with a tree of 10,000 entries: returns all, `truncated: false`

### Rate Limiting Tests

- [ ] Authenticated user making 5,001 requests in one hour receives 429 on the 5,001st request
- [ ] Anonymous user making 61 requests in one hour receives 429 on the 61st request
- [ ] Rate limit response includes `Retry-After` header
- [ ] Rate limit response body includes `{ "message": "rate limit exceeded" }`

### Performance Tests

- [ ] Non-recursive tree request for a repo with 100 root entries completes in < 500ms
- [ ] Recursive tree request for a repo with 1,000 total entries completes in < 2000ms
- [ ] Recursive tree request for a repo with 10,000 total entries completes in < 5000ms

### E2E Tests (Playwright - Web UI)

- [ ] Navigate to a repository's code explorer, verify that the file tree renders (indirectly validates the tree API is working)
- [ ] Click into a nested directory in the code explorer, verify subdirectory contents load
- [ ] Switch bookmarks in the code explorer, verify the tree reloads with the new ref's tree

### E2E Tests (CLI)

- [ ] `codeplane api get /repos/:owner/:repo/git/trees/:sha` returns valid JSON with tree entries
- [ ] `codeplane api get /repos/:owner/:repo/git/trees/:sha?recursive=1` returns flattened entries
- [ ] `codeplane api get /repos/:owner/:repo/git/trees/invalid` returns error JSON with appropriate message
- [ ] `codeplane api get /repos/nonexistent/repo/git/trees/:sha` returns 404 error

### E2E Tests (API - Direct HTTP)

- [ ] Full round-trip: create repo → push files → resolve commit tree SHA → GET git/trees/:sha → verify entries match pushed files
- [ ] Create repo with nested directory structure → GET recursive tree → verify all files appear with correct paths
- [ ] Create repo with mixed entry types (file, executable, symlink, submodule) → verify all modes/types are correct
- [ ] Push a commit with an empty directory (using a `.gitkeep`) → verify tree entries
- [ ] Verify response headers include appropriate `Cache-Control` for public vs. private repos
- [ ] Verify response headers include `Content-Type: application/json`
