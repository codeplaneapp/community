# JJ_GIT_COMMIT_API

Specification for JJ_GIT_COMMIT_API.

## High-Level User POV

When a developer works with a repository on Codeplane, they often need to inspect the underlying Git commit objects that represent individual snapshots in the repository's history. The JJ Git Commit API provides low-level, content-addressable access to Git commit objects by their SHA hash. This is distinct from Codeplane's higher-level jj change endpoints (which expose change IDs, descriptions, and conflict metadata): the Git commit endpoint exposes the raw commit structure as Git internally represents it — the author, committer, tree SHA, parent commit SHAs, message, and optional GPG signature.

This capability matters for three categories of users. First, developers and tooling authors who need to walk the Git object graph programmatically — for example, building custom history analysis tools, performing repository audits, integrating with third-party services that expect GitHub-compatible commit endpoints, or resolving the tree SHA for a commit to then use with the Git Tree API. Second, the Codeplane web UI, TUI, and editor integrations themselves, which need to resolve commit objects when rendering repository graphs, code explorers, landing request diffs, and commit status views that reference specific commits. Third, CI/CD workflows and agent sessions that need to inspect the exact metadata of a commit — its parent chain, author identity, commit message, and associated tree — as part of automated validation, status reporting, or integration pipelines.

The user experience is straightforward: given a repository they have read access to, they provide a Git commit SHA, and the API returns the full commit object — including author and committer identities with timestamps, the commit message, the tree SHA this commit points to, and the parent commit SHAs. If the SHA is invalid or does not reference a commit object in the repository, the API returns a clear error. If the repository does not exist or the user lacks read access, the API returns a 404. From the CLI, users can invoke `codeplane api get /repos/:owner/:repo/git/commits/:sha` to retrieve commit objects. The web UI, TUI, and editors use this endpoint internally when they need to resolve a commit to its tree, display commit metadata in graph views, or bridge between jj change IDs and their underlying Git commit representations.

## Acceptance Criteria

### Definition of Done

- [ ] `GET /api/repos/:owner/:repo/git/commits/:sha` returns a JSON response containing the commit object for the given SHA
- [ ] The response envelope includes `sha` (the requested commit SHA, normalized to lowercase), `url` (canonical API URL for this commit), and `commit` (the commit object)
- [ ] The `commit` object includes `message` (full commit message string), `tree` (object with `sha` and `url`), and `parents` (array of objects each with `sha` and `url`)
- [ ] The `commit` object includes `author` (object with `name`, `email`, `date` as ISO 8601 string) and `committer` (same shape)
- [ ] The `commit` object includes `verification` (object with `verified` boolean, `reason` string, and `signature` string or null) when GPG/SSH signature data is present
- [ ] If the SHA does not reference a valid commit object, the API returns `404` with `{ "message": "commit not found" }`
- [ ] If the SHA references a tree or blob object instead of a commit, the API returns `404` with `{ "message": "not a commit object" }`
- [ ] If the SHA is not a valid hex string or is not exactly 40 characters, the API returns `400` with `{ "message": "invalid commit SHA" }`
- [ ] If the repository does not exist, the API returns `404` with `{ "message": "repository not found" }`
- [ ] If the user lacks read access to the repository, the API returns `404` (not 403, to avoid leaking repository existence)
- [ ] The route handler delegates to the `RepoHostService` which shells out to `git cat-file` on the colocated Git backend
- [ ] The endpoint replaces the current 501 stub in `apps/server/src/routes/repos.ts`
- [ ] The SDK exports `GitCommitResponse`, `CommitObject`, `CommitAuthor`, and `CommitVerification` types and a `getGitCommit` method on `RepoHostService`
- [ ] The `@codeplane/ui-core` API client exposes a `getGitCommit(owner, repo, sha)` method
- [ ] The CLI `api` subcommand can call this endpoint via `codeplane api get`

### Boundary Constraints

- [ ] `sha` parameter: exactly 40 hexadecimal characters (`[0-9a-f]{40}`), case-insensitive on input, normalized to lowercase in response
- [ ] `owner` parameter: 1–39 characters, alphanumeric plus hyphens, no leading/trailing hyphens
- [ ] `repo` parameter: 1–100 characters, alphanumeric plus hyphens/underscores/dots, no leading dots, no `.git` suffix
- [ ] `commit.message`: returned as-is from Git, preserving newlines and trailing whitespace; maximum observable length is bounded by Git's own limits (no artificial truncation)
- [ ] `commit.author.name` and `commit.committer.name`: returned as-is from Git, up to 1024 characters
- [ ] `commit.author.email` and `commit.committer.email`: returned as-is from Git, up to 254 characters
- [ ] `commit.author.date` and `commit.committer.date`: ISO 8601 format with timezone offset (e.g., `2024-03-15T14:30:00+00:00`)
- [ ] `commit.parents`: array of 0 or more parent objects; root commits have 0 parents, merge commits may have 2 or more
- [ ] `commit.tree.sha`: exactly 40 lowercase hex characters
- [ ] `commit.verification.signature`: the raw GPG/SSH signature string if present, `null` if unsigned
- [ ] `commit.verification.reason`: one of `"valid"`, `"unsigned"`, `"unverified_key"`, `"unknown_key"`, `"bad_signature"`, `"expired_key"`, `"not_signing_key"`, `"expired_signature"`
- [ ] Path traversal attempts via `..` in the SHA parameter are rejected with 400

### Edge Cases

- [ ] Root commit (zero parents): returns `{ parents: [] }`
- [ ] Merge commit (two parents): returns both parent SHAs in `parents` array
- [ ] Octopus merge (three or more parents): returns all parent SHAs in order
- [ ] Commit with empty message: returns `{ message: "" }`
- [ ] Commit with multi-line message including blank lines: message preserved verbatim
- [ ] Commit with GPG signature: `verification` includes the signature and `verified` status
- [ ] Commit with SSH signature: `verification` includes the signature and `verified` status
- [ ] Unsigned commit: `verification.verified` is `false`, `verification.reason` is `"unsigned"`, `verification.signature` is `null`
- [ ] Commit with author name containing unicode characters: returned correctly
- [ ] Commit with author email containing `+` or subaddressing: returned correctly
- [ ] Commit authored by a bot/automation with unusual name format: returned as-is
- [ ] SHA references a tag object (annotated tag): returns `404` with `"not a commit object"`
- [ ] Concurrent requests for the same commit SHA: all return the same result (stateless)
- [ ] Repository exists but is archived: commit endpoint still works (read-only access preserved)
- [ ] Empty SHA parameter: returns `400`
- [ ] SHA with uppercase hex characters: accepted, normalized to lowercase in response

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/git/commits/:sha`

**Success Response (200):**

```json
{
  "sha": "abc123def456789012345678901234567890abcd",
  "url": "https://codeplane.example/api/repos/owner/repo/git/commits/abc123def456789012345678901234567890abcd",
  "commit": {
    "message": "feat: add new authentication flow\n\nImplements OAuth2 PKCE support for CLI clients.",
    "tree": {
      "sha": "def789012345678901234567890123456789abcd",
      "url": "https://codeplane.example/api/repos/owner/repo/git/trees/def789012345678901234567890123456789abcd"
    },
    "parents": [
      {
        "sha": "parent123456789012345678901234567890abcd",
        "url": "https://codeplane.example/api/repos/owner/repo/git/commits/parent123456789012345678901234567890abcd"
      }
    ],
    "author": {
      "name": "Jane Developer",
      "email": "jane@example.com",
      "date": "2024-03-15T14:30:00+00:00"
    },
    "committer": {
      "name": "Jane Developer",
      "email": "jane@example.com",
      "date": "2024-03-15T14:32:00+00:00"
    },
    "verification": {
      "verified": false,
      "reason": "unsigned",
      "signature": null
    }
  }
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "message": "invalid commit SHA" }` | SHA is not a valid 40-char hex string |
| 404 | `{ "message": "repository not found" }` | Repository does not exist or user lacks access |
| 404 | `{ "message": "commit not found" }` | SHA does not exist in the repository |
| 404 | `{ "message": "not a commit object" }` | SHA references a non-commit object (tree, blob, tag) |
| 429 | `{ "message": "rate limit exceeded" }` | Too many requests |
| 500 | `{ "message": "internal server error" }` | Unexpected failure in git cat-file |

### SDK Shape

**New types in `packages/sdk/src/services/repohost.ts`:**

```typescript
export interface CommitAuthor {
  name: string;
  email: string;
  date: string;
}

export interface CommitVerification {
  verified: boolean;
  reason: string;
  signature: string | null;
}

export interface CommitObject {
  message: string;
  tree: { sha: string; url: string };
  parents: Array<{ sha: string; url: string }>;
  author: CommitAuthor;
  committer: CommitAuthor;
  verification: CommitVerification;
}

export interface GitCommitResponse {
  sha: string;
  url: string;
  commit: CommitObject;
}
```

**New method on `RepoHostService`:**

```typescript
async getGitCommit(
  owner: string,
  repo: string,
  sha: string
): Promise<Result<GitCommitResponse, APIError>>
```

The implementation shells out to `git cat-file -p <sha>` on the colocated Git backend, then verifies the object type via `git cat-file -t <sha>`. The output is parsed to extract tree SHA, parent SHAs, author/committer lines (with name, email, and Unix timestamp+timezone), and the commit message body. Signature verification uses `git verify-commit <sha>` when signature data is present.

### CLI Command

The endpoint is accessible through the generic `codeplane api` passthrough:

```bash
# Fetch a commit object
codeplane api get /repos/myorg/myrepo/git/commits/abc123def456789012345678901234567890abcd

# With JSON field filtering
codeplane api get /repos/myorg/myrepo/git/commits/abc123... --json .commit.message

# Pipe to jq for custom formatting
codeplane api get /repos/myorg/myrepo/git/commits/abc123... | jq '.commit.parents[].sha'
```

No dedicated CLI subcommand is required for this low-level endpoint. The `codeplane api` command already supports arbitrary GET requests with JSON output formatting.

### Web UI Design

The JJ Git Commit API is a backend-only data endpoint. It does not have its own dedicated web UI page. It is consumed internally by:

- **Repository Graph**: When rendering commit graph nodes, the web UI resolves commit objects via this endpoint to display author, message, and parent relationships.
- **Code Explorer**: When navigating from a bookmark or change to a specific commit, the UI may call this endpoint to resolve the commit's tree SHA for file browsing.
- **Landing Request Diff View**: When comparing changes, the diff engine uses this endpoint to resolve commit tree SHAs for before/after comparison.
- **Change Detail View**: When displaying the underlying Git commit associated with a jj change, this endpoint provides the raw commit metadata.

No new web UI routes or components are required specifically for this feature.

### TUI UI

The TUI does not expose a direct "browse git commits by SHA" screen. However, the TUI's internal data layer (`@codeplane/ui-core`) should export a `getGitCommit` client method so that TUI features such as graph inspection, commit detail drilldown from the changes view, and landing request checks can resolve commit objects.

### Documentation

The following documentation should be written:

- **API Reference entry** for `GET /api/repos/:owner/:repo/git/commits/:sha` including all response fields, error codes, and request/response examples
- **SDK Reference entry** for `RepoHostService.getGitCommit()` method with type signatures, return types, and usage examples
- **CLI Guide addendum** showing how to use `codeplane api get` to fetch commit objects, with example output showing author, tree, parents, and message
- **Conceptual note** in the JJ-native repository docs explaining the relationship between jj change IDs, Git commit SHAs, and Git tree SHAs — specifically that each jj change maps to a Git commit (via `commit_id`), and each commit points to a tree, forming the object graph that these low-level APIs expose

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
- Archived repositories remain readable — the commit endpoint works on archived repos
- Deploy keys with read access can access this endpoint
- PAT-based auth follows the same permission model as session-based auth
- The SHA parameter must be validated as hex-only to prevent shell injection in the `git cat-file` subprocess
- The owner and repo parameters must be sanitized for path traversal (replace `..` and `/` as in existing `resolveRepoPath`)

### Rate Limiting

| Context | Limit |
|---------|-------|
| Authenticated user | 5,000 requests/hour (shared across all API endpoints) |
| Anonymous user | 60 requests/hour |
| Per-repository burst | 100 requests/minute per repository per user |

### Data Privacy

- Commit author names and emails are part of the Git history and are not considered Codeplane-managed PII, but repository content may be proprietary
- Private repo commit data must never leak through error messages, logs, or caching headers
- Response must include `Cache-Control: private` for private repositories and `Cache-Control: public, max-age=300` for public repositories (commit objects are immutable once created)
- Author emails in commit objects may differ from verified Codeplane account emails — no linkage or enrichment is performed at this API layer
- No credentials, secrets, or user PII managed by Codeplane are present in commit responses

## Telemetry & Product Analytics

### Business Events

| Event | Properties | Description |
|-------|------------|-------------|
| `GitCommitViewed` | `owner`, `repo`, `sha`, `parent_count` (int), `has_signature` (boolean), `response_time_ms`, `client` (web/cli/tui/api) | Fired on every successful commit retrieval |
| `GitCommitNotFound` | `owner`, `repo`, `sha`, `error_reason` (string: "commit not found", "not a commit object") | Fired when a commit lookup fails with 404 |

### Event Properties

All events should include standard context properties:

- `user_id` (if authenticated)
- `session_id`
- `timestamp`
- `request_id`
- `ip_country` (for analytics, never logged as raw IP)

### Funnel Metrics and Success Indicators

- **Adoption**: Number of unique repositories accessed via `git/commits` endpoint per week
- **Latency P95**: Commit endpoint response time should be < 200ms (commit objects are small and fast to retrieve)
- **Error Rate**: 4xx/5xx rate should be < 2% of total requests
- **Object Graph Navigation**: Percentage of `GitCommitViewed` events followed within 60 seconds by a `GitTreeViewed` event for the same repo — indicates users walking the object graph
- **Client Distribution**: Breakdown of requests by client type (web, CLI, TUI, external) — helps prioritize client-specific optimizations
- **Signature Verification**: Percentage of retrieved commits that have GPG/SSH signatures — informs whether to promote verification features more prominently

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | Condition |
|-----------|-------|-------------------|----------|
| Commit request received | `info` | `owner`, `repo`, `sha`, `request_id`, `user_id` | Every request |
| Commit returned successfully | `info` | `owner`, `repo`, `sha`, `parent_count`, `has_signature`, `duration_ms`, `request_id` | Successful response |
| Commit not found | `warn` | `owner`, `repo`, `sha`, `error`, `request_id` | 404 response |
| Invalid SHA parameter | `warn` | `owner`, `repo`, `sha_input`, `request_id` | 400 response |
| Not a commit object | `warn` | `owner`, `repo`, `sha`, `actual_type`, `request_id` | SHA references wrong object type |
| Git cat-file failed | `error` | `owner`, `repo`, `sha`, `exit_code`, `stderr`, `duration_ms`, `request_id` | git subprocess failure |
| Git cat-file timeout | `error` | `owner`, `repo`, `sha`, `timeout_ms`, `request_id` | git subprocess exceeded timeout |
| Rate limit exceeded | `warn` | `owner`, `repo`, `user_id`, `request_id` | 429 response |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_git_commit_requests_total` | Counter | `owner`, `repo`, `status` (200/400/404/429/500) | Total requests to the git commit endpoint |
| `codeplane_git_commit_duration_seconds` | Histogram | `owner`, `repo` | Request duration in seconds (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2) |
| `codeplane_git_commit_parent_count` | Histogram | | Number of parents per retrieved commit (buckets: 0, 1, 2, 3, 5, 10) |
| `codeplane_git_catfile_subprocess_duration_seconds` | Histogram | | Duration of the underlying git cat-file subprocess |
| `codeplane_git_catfile_subprocess_errors_total` | Counter | `exit_code` | Git cat-file subprocess failures |
| `codeplane_git_commit_signed_total` | Counter | `verified` (true/false) | Count of signed vs unsigned commits retrieved |

### Alerts

**Alert 1: High Git Commit Error Rate**

| Field | Value |
|-------|-------|
| Name | `GitCommitHighErrorRate` |
| Condition | `rate(codeplane_git_commit_requests_total{status=~"5.."}[5m]) / rate(codeplane_git_commit_requests_total[5m]) > 0.05` |
| Severity | Warning |
| For | 5 minutes |

**Runbook:**
1. Check `codeplane_git_catfile_subprocess_errors_total` — if rising, the `git` binary may be unavailable or the repository data directory may be corrupted.
2. SSH into the server and verify `git --version` works and the `git` binary is on the `PATH`.
3. Check disk space on the `CODEPLANE_DATA_DIR` volume — full disk causes git failures.
4. Check recent deploys — a misconfigured `PATH` or `CODEPLANE_DATA_DIR` could prevent git from finding repos.
5. Review error logs filtered by `request_id` for specific stderr output from git.
6. If a specific repository is affected, run `git fsck` on its `.git` directory to check for corruption.
7. If `git cat-file` crashes with signal, check system memory pressure (`dmesg | grep oom`).

**Alert 2: High Git Commit Latency**

| Field | Value |
|-------|-------|
| Name | `GitCommitHighLatency` |
| Condition | `histogram_quantile(0.95, rate(codeplane_git_commit_duration_seconds_bucket[5m])) > 2` |
| Severity | Warning |
| For | 10 minutes |

**Runbook:**
1. Check `codeplane_git_catfile_subprocess_duration_seconds` — if the subprocess itself is slow, the bottleneck is git/disk I/O.
2. Check server CPU and memory — high load may cause subprocess scheduling delays.
3. Check if the spike correlates with a specific repository — very large repositories with deep history may have slower pack lookups.
4. Check disk I/O metrics (iops, latency, queue depth) — degraded storage affects all git operations.
5. If disk I/O is the bottleneck, consider moving `CODEPLANE_DATA_DIR` to faster storage (SSD/NVMe).
6. Consider running `git gc` or `git repack -a -d` on affected repositories to optimize pack files.

**Alert 3: Git Cat-File Subprocess Timeout**

| Field | Value |
|-------|-------|
| Name | `GitCatFileSubprocessTimeout` |
| Condition | `increase(codeplane_git_catfile_subprocess_errors_total{exit_code="timeout"}[15m]) > 5` |
| Severity | Critical |
| For | 0 minutes (immediate) |

**Runbook:**
1. Identify the affected repository from error logs (`request_id` → structured log context).
2. Check if the repository has an unusually large packfile — `git count-objects -v` to inspect.
3. Check for disk I/O contention — run `iostat` or check monitoring dashboards for storage saturation.
4. If a single repository is causing all timeouts, inspect it for corruption with `git fsck --no-dangling`.
5. If many repositories are affected simultaneously, check for infrastructure issues (NFS mount stalls, disk failures, storage controller errors).
6. Consider increasing the subprocess timeout from the default 30 seconds if the affected repositories are legitimately very large.

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Recovery |
|-------|-------------|-------|----------|
| Invalid SHA format | 400 | Client sent non-hex or wrong-length SHA | Client must fix SHA — no server action |
| Repository not found | 404 | Repo doesn't exist or user lacks access | Verify repo name and credentials |
| Commit object not found | 404 | SHA doesn't exist in the repo | Client should verify the SHA was obtained from a valid ref or change |
| Not a commit object | 404 | SHA exists but is a tree, blob, or tag | Client should use the appropriate endpoint (git/trees for trees) |
| Git subprocess timeout | 500 | `git cat-file` exceeded 30s timeout | Rare for commits (small objects) — check repo health and disk I/O |
| Git subprocess crash | 500 | `git cat-file` exited non-zero | Check repo integrity with `git fsck`; may indicate corrupt packfile |
| Disk I/O failure | 500 | Underlying filesystem error | Check disk health, mounts, available space |
| Rate limit exceeded | 429 | User exceeded request quota | Client should back off and retry with exponential delay |
| Commit message encoding error | 500 | Git commit message contains invalid byte sequences | Check repository encoding; consider setting `i18n.commitEncoding` |

## Verification

### API Integration Tests

- [ ] `GET /api/repos/:owner/:repo/git/commits/:sha` with a valid commit SHA returns 200 with correct structure
- [ ] Response includes `sha`, `url`, and `commit` object
- [ ] `commit` object includes `message`, `tree`, `parents`, `author`, `committer`, and `verification` fields
- [ ] `commit.tree` includes `sha` (40-char hex) and `url` (valid API URL)
- [ ] `commit.parents` is an array where each element has `sha` and `url`
- [ ] `commit.author` includes `name` (string), `email` (string), and `date` (ISO 8601 string)
- [ ] `commit.committer` includes `name` (string), `email` (string), and `date` (ISO 8601 string)
- [ ] `commit.verification` includes `verified` (boolean), `reason` (string), and `signature` (string or null)
- [ ] `commit.message` preserves the full message including newlines and multi-paragraph format
- [ ] Response `sha` is normalized to lowercase regardless of input case
- [ ] Response `url` contains the full canonical API path

### SHA Validation Tests

- [ ] Valid 40-character lowercase hex SHA returns 200 (assuming commit exists)
- [ ] Valid 40-character uppercase hex SHA returns 200 (case-insensitive input accepted)
- [ ] Mixed-case 40-character hex SHA returns 200
- [ ] SHA is normalized to lowercase in the response body
- [ ] 39-character hex string returns 400 `"invalid commit SHA"`
- [ ] 41-character hex string returns 400 `"invalid commit SHA"`
- [ ] Empty SHA parameter returns 400 `"invalid commit SHA"`
- [ ] SHA containing non-hex characters (e.g., `g`, `z`, `!`, spaces) returns 400
- [ ] SHA containing path traversal `../../etc` returns 400
- [ ] SHA that is valid hex but does not exist in the repo returns 404 `"commit not found"`
- [ ] SHA that references a tree object returns 404 `"not a commit object"`
- [ ] SHA that references a blob object returns 404 `"not a commit object"`
- [ ] SHA that references an annotated tag object returns 404 `"not a commit object"`

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
- [ ] Owner parameter with path traversal (`../other-owner`): 404 or 400
- [ ] Repo parameter with `.git` suffix: 404 or 400

### Content Correctness Tests

- [ ] A standard single-parent commit returns exactly one parent in `parents` array
- [ ] A root commit (initial commit with no parents) returns `parents: []`
- [ ] A merge commit with two parents returns both in correct order
- [ ] An octopus merge commit with three or more parents returns all in correct order
- [ ] Commit message with only a subject line (no body): returned correctly without trailing newlines
- [ ] Commit message with subject + blank line + body: returned with newlines preserved
- [ ] Commit message with empty string: returns `message: ""`
- [ ] Commit message with unicode characters (CJK, emoji, diacritics): returned correctly
- [ ] Commit message with maximum observed length (64KB): returned without truncation
- [ ] Author name with unicode characters: returned correctly
- [ ] Author email with subaddressing (`user+tag@example.com`): returned correctly
- [ ] Author and committer with different identities: both returned correctly
- [ ] Author date and committer date with different values: both returned correctly
- [ ] Author date with non-UTC timezone offset: returned with correct offset in ISO 8601
- [ ] Unsigned commit: `verification.verified` is `false`, `reason` is `"unsigned"`, `signature` is `null`
- [ ] GPG-signed commit (if test repo supports it): `verification` includes non-null `signature`
- [ ] Tree SHA in response is a valid 40-char lowercase hex string
- [ ] Parent SHAs in response are valid 40-char lowercase hex strings
- [ ] Calling git/trees with the returned `commit.tree.sha` returns a valid tree (cross-API consistency)

### Rate Limiting Tests

- [ ] Authenticated user making requests up to the per-repository burst limit (100/min) succeeds
- [ ] Authenticated user exceeding per-repository burst limit receives 429
- [ ] Anonymous user making 61 requests in one hour receives 429 on the 61st request
- [ ] Rate limit response includes `Retry-After` header
- [ ] Rate limit response body includes `{ "message": "rate limit exceeded" }`

### Performance Tests

- [ ] Single commit retrieval completes in < 200ms for a standard repository
- [ ] Single commit retrieval for a very large repository (>1M objects) completes in < 1000ms
- [ ] 50 concurrent requests for different commits in the same repository all complete in < 2000ms
- [ ] Response payload size for a typical commit is < 2KB

### E2E Tests (Playwright - Web UI)

- [ ] Navigate to a repository's graph view, verify that commit nodes render with author and message (indirectly validates the commit API)
- [ ] Click a commit node in the graph view, verify commit detail panel shows correct author, message, and parent links
- [ ] Navigate from a change detail view to inspect the underlying Git commit metadata
- [ ] Navigate from a landing request diff view that resolves commit tree SHAs

### E2E Tests (CLI)

- [ ] `codeplane api get /repos/:owner/:repo/git/commits/:sha` returns valid JSON with commit fields
- [ ] `codeplane api get /repos/:owner/:repo/git/commits/:sha --json .commit.message` returns just the message
- [ ] `codeplane api get /repos/:owner/:repo/git/commits/:sha --json .commit.parents` returns the parent array
- [ ] `codeplane api get /repos/:owner/:repo/git/commits/invalid` returns error JSON with appropriate message
- [ ] `codeplane api get /repos/nonexistent/repo/git/commits/:sha` returns 404 error

### E2E Tests (API - Direct HTTP)

- [ ] Full round-trip: create repo → push commit → resolve HEAD SHA → GET git/commits/:sha → verify author and message match pushed commit
- [ ] Create repo with merge commit → GET commit → verify two parents in response
- [ ] Create repo with initial commit → GET commit → verify `parents: []`
- [ ] Resolve commit tree SHA from response → GET git/trees/:sha → verify tree exists and matches (cross-API validation)
- [ ] Push commit with known GPG signature → GET commit → verify `verification.signature` is non-null
- [ ] Push commit with multi-line message → GET commit → verify message preserves all lines
- [ ] Verify response headers include appropriate `Cache-Control` for public vs. private repos
- [ ] Verify response headers include `Content-Type: application/json; charset=utf-8`
- [ ] Verify `url` field in response matches the actual request URL used
- [ ] Verify `url` fields in `tree` and `parents` are valid API URLs that return 200 when requested
