# JJ_GIT_REFS_API

Specification for JJ_GIT_REFS_API.

## High-Level User POV

When you work with a Codeplane repository, you need a way to see all of the underlying git references that exist in the colocated git backend — branches (heads), tags, and other refs — alongside the jj-native bookmarks and changes that Codeplane treats as first-class concepts. The JJ Git Refs API gives you a unified, read-only view of the raw git ref namespace for any repository you have access to.

This matters because Codeplane repositories use a colocated jj+git model. While jj bookmarks are the primary collaboration primitive, there are situations where you need to see the underlying git ref state: debugging push/pull behavior, verifying that a CI system's tag-based triggers are wired correctly, confirming that a landing request's changes have been exported to git, or integrating with external tools that speak git-native protocols. The Git Refs API exposes this information without requiring SSH access or a local clone.

From the web UI, you can browse the full ref list on a repository's code explorer or bookmarks page, filtered by type (heads, tags, or all). From the CLI, `codeplane repo refs` prints a table of refs with their target SHAs, filterable by prefix or type. The TUI includes a refs panel within the repository screen. Editor integrations can query refs for picker/autocomplete flows. In all cases, the API is read-only — ref mutation is performed through jj bookmark operations, landing requests, or git push, never by directly writing refs through this endpoint.

The Git Refs API is the bridge between jj-native workflows and the git-layer reality that underlies every Codeplane repository. It closes the current 501 stub on `GET /api/repos/:owner/:repo/git/refs` and makes the colocated git backend's ref state fully observable through every Codeplane client surface.

## Acceptance Criteria

- [ ] `GET /api/repos/:owner/:repo/git/refs` returns a JSON response containing all git refs in the repository's colocated git backend.
- [ ] Each ref entry includes: `ref` (full ref name, e.g. `refs/heads/main`), `object_sha` (the 40-character hex SHA the ref points to), and `type` (one of `branch`, `tag`, `other`).
- [ ] Tag refs additionally include `tag_name` (short name without `refs/tags/` prefix) and, for annotated tags, `tagger_name`, `tagger_email`, `tagger_date`, and `message`.
- [ ] Branch refs additionally include `branch_name` (short name without `refs/heads/` prefix).
- [ ] The endpoint supports a `type` query parameter accepting values `branch`, `tag`, or `all` (default `all`), filtering the returned refs to only the requested category.
- [ ] The endpoint supports a `prefix` query parameter that filters refs by a prefix match on the full ref name (e.g. `prefix=refs/tags/v1` returns only refs starting with `refs/tags/v1`).
- [ ] Pagination uses cursor/limit style consistent with other jj-family endpoints: query parameters `cursor` (opaque string, default empty) and `limit` (integer, default 30, max 100, min 1).
- [ ] The response shape is `{ items: GitRef[], next_cursor: string }`.
- [ ] An invalid `limit` value (non-numeric, ≤ 0) returns 400 with `{ message: "invalid limit value" }`.
- [ ] A `limit` value greater than 100 is silently clamped to 100.
- [ ] A request for a non-existent repository returns 404 with `{ message: "repository '<owner>/<repo>' not found" }`.
- [ ] A request for a private repository by an unauthenticated user or a user without read access returns 404 (not 403, to avoid leaking repository existence).
- [ ] The endpoint returns an empty `items` array (not an error) when the repository exists but has no refs (e.g. a freshly initialized repo before any commit).
- [ ] Ref names are returned as-is from the git backend; no normalization, truncation, or renaming is performed.
- [ ] The `object_sha` is always the full 40-character lowercase hex SHA-1.
- [ ] The endpoint must not return refs from other repositories or leak cross-repository data.
- [ ] The response must be sorted lexicographically by `ref` name (ascending) for deterministic pagination.
- [ ] Ref names containing special characters (e.g. `/`, `.`, `-`, `_`, unicode) are returned verbatim.
- [ ] The `prefix` parameter is limited to 256 characters; longer values return 400.
- [ ] The `type` parameter is case-insensitive; unknown values return 400 with `{ message: "invalid type filter; must be 'branch', 'tag', or 'all'" }`.
- [ ] The endpoint completes within 5 seconds for repositories with up to 10,000 refs; if the underlying git operation times out, a 504 is returned.
- [ ] The endpoint does not expose `.git/config`, credentials, hooks, or any non-ref git internal state.

**Definition of Done:**
The `GET /api/repos/:owner/:repo/git/refs` endpoint returns live git ref data from the colocated backend, is consumed by Web UI, CLI, TUI, and editor integrations, has passing integration and E2E tests across all client surfaces, and is documented in the API reference.

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/git/refs`

**Query parameters:**

| Parameter | Type     | Default | Constraints                        | Description                                   |
|-----------|----------|---------|-------------------------------------|-----------------------------------------------|
| `type`    | `string` | `all`   | `branch`, `tag`, `all` (case-insensitive) | Filter refs by category                      |
| `prefix`  | `string` | (none)  | Max 256 characters                  | Filter refs whose full name starts with this  |
| `cursor`  | `string` | `""`    | Opaque string from previous response | Pagination cursor                             |
| `limit`   | `integer`| `30`    | 1–100                               | Max items per page                            |

**Success response (200):**

```json
{
  "items": [
    {
      "ref": "refs/heads/main",
      "object_sha": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "type": "branch",
      "branch_name": "main"
    },
    {
      "ref": "refs/tags/v1.0.0",
      "object_sha": "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5",
      "type": "tag",
      "tag_name": "v1.0.0",
      "tagger_name": "Jane Dev",
      "tagger_email": "jane@example.com",
      "tagger_date": "2026-03-20T14:30:00Z",
      "message": "Release v1.0.0"
    }
  ],
  "next_cursor": ""
}
```

**Type definition (to be added in `apps/server/src/routes/jj.ts` or `repos.ts`):**

```typescript
interface GitRefResponse {
  ref: string;              // Full ref name, e.g. "refs/heads/main"
  object_sha: string;       // 40-char hex SHA
  type: "branch" | "tag" | "other";
  branch_name?: string;     // Present when type === "branch"
  tag_name?: string;        // Present when type === "tag"
  tagger_name?: string;     // Present for annotated tags
  tagger_email?: string;    // Present for annotated tags
  tagger_date?: string;     // ISO 8601, present for annotated tags
  message?: string;         // Present for annotated tags
}
```

**Error responses:**

| Status | Condition                                         | Body                                                   |
|--------|---------------------------------------------------|--------------------------------------------------------|
| 400    | Invalid `limit` (non-numeric or ≤ 0)              | `{ "message": "invalid limit value" }`                 |
| 400    | Invalid `type` filter                             | `{ "message": "invalid type filter; must be 'branch', 'tag', or 'all'" }` |
| 400    | `prefix` exceeds 256 characters                   | `{ "message": "prefix too long (max 256 characters)" }`|
| 400    | Missing `owner` or `repo`                         | `{ "message": "owner is required" }` / `{ "message": "repository name is required" }` |
| 404    | Repository not found or not accessible            | `{ "message": "repository '<owner>/<repo>' not found" }` |
| 504    | git command timed out                             | `{ "message": "git refs operation timed out" }`        |

### SDK Shape

The `RepoHostService` in `packages/sdk/src/services/repohost.ts` must add a `listGitRefs` method:

```typescript
async listGitRefs(
  owner: string,
  repo: string,
  options?: {
    type?: "branch" | "tag" | "all";
    prefix?: string;
    cursor?: string;
    limit?: number;
  }
): Promise<Result<{ items: GitRef[]; nextCursor: string }, APIError>>
```

This method shells out to `git for-each-ref` on the colocated git backend with an appropriate format string and optional ref pattern. It uses `--sort=refname` for deterministic ordering and `--count` for pagination.

### CLI Command

**Command:** `codeplane repo refs`

**Usage:**
```
codeplane repo refs [--type <branch|tag|all>] [--prefix <string>] [--limit <n>] [--json]
```

**Flags:**

| Flag       | Short | Default | Description                                   |
|------------|-------|---------|-----------------------------------------------|
| `--type`   | `-t`  | `all`   | Filter by ref type: `branch`, `tag`, or `all` |
| `--prefix` | `-p`  | (none)  | Filter refs by name prefix                    |
| `--limit`  | `-l`  | `30`    | Number of refs to return per page              |
| `--json`   |       | false   | Output raw JSON                                |
| `--repo`   | `-R`  | (auto)  | Repository slug `owner/repo`                  |

**Human-readable output (default):**

```
REF                         SHA         TYPE
refs/heads/main             a1b2c3d4    branch
refs/heads/feature/auth     e5f6a1b2    branch
refs/tags/v1.0.0            f6e5d4c3    tag
refs/tags/v1.1.0            b2a1f6e5    tag
```

**Behavior notes:**
- Repository is resolved from `--repo` flag, or from the current directory's jj/git remote configuration.
- Pagination: if `next_cursor` is non-empty, print a footer line `-- more refs available (use --cursor to paginate) --`.
- The `--json` flag outputs the raw API response for piping and scripting.

### Web UI Design

The git refs data is surfaced in the repository's **Bookmarks** page as a secondary tab or collapsible section titled "Git Refs":

- **Refs table** with columns: Ref Name, SHA (truncated to 8 chars, full on hover/copy), Type badge.
- **Type filter** dropdown: All, Branches, Tags.
- **Search/filter** text input for prefix filtering.
- Tags with annotation data show an expandable row with tagger info and message.
- Clicking a SHA copies the full 40-character SHA to the clipboard.
- Clicking a branch name navigates to the corresponding bookmark view if one exists.
- Clicking a tag name navigates to the release view if a matching release exists, otherwise shows the tag detail.
- Empty state: "No git refs found in this repository."
- Loading state: skeleton rows matching the table shape.
- Error state: inline error banner with retry button.

### TUI UI

Within the repository screen, a "Git Refs" tab (accessible via keyboard shortcut `g`) shows:

- A scrollable list of refs, each line showing: `type_icon ref_name short_sha`.
- Type icons: `⎇` for branches, `🏷` for tags, `?` for other.
- `/` to filter by name substring.
- `t` to cycle type filter (all → branches → tags → all).
- `c` to copy the full SHA of the selected ref.
- `Enter` to view details of the selected ref (branch → bookmark view, tag → release view if available).
- Cursor-based pagination with auto-load at 80% scroll depth.
- Terminal-width-responsive layout: at widths below 80 columns, SHA is hidden.

### VS Code Extension

The VS Code extension's existing bookmark tree view should be extended with a "Git Refs" section that:

- Shows a collapsible tree: Branches (folder) → individual branch refs, Tags (folder) → individual tag refs.
- Each tree item shows the ref short name and truncated SHA as the description.
- Context menu: "Copy SHA", "Copy Ref Name", "Open in Codeplane Web".
- Data is fetched from the Codeplane API via the existing daemon/API client.
- Refreshes when the repository context changes or on manual refresh command.

### Neovim Plugin

A new command `:CodeplaneRefs` (and Telescope picker `codeplane_refs`) that:

- Fetches refs from the API.
- Displays in a Telescope picker with ref name, type, and SHA columns.
- `<CR>` copies the SHA to the `+` register.
- Supports `--type` and `--prefix` as optional arguments.

### Documentation

The following documentation artifacts must be written:

1. **API Reference page** (`docs/api-reference/git-refs.mdx`): Full endpoint documentation with request/response examples, query parameter descriptions, error codes, and pagination notes.
2. **CLI Reference entry** (`docs/cli/repo-refs.mdx`): Command help, flag descriptions, and example usage for `codeplane repo refs`.
3. **Guide section** in the existing "Repository Browsing" guide: A paragraph explaining when and why to use Git Refs vs. Bookmarks, with a cross-link to the API reference.
4. **Changelog entry**: A line item noting the new endpoint, CLI command, and UI surface.

## Permissions & Security

### Authorization Matrix

| Role                   | Access         | Notes                                                |
|------------------------|----------------|------------------------------------------------------|
| Repository Owner       | ✅ Full access | Can list all refs                                     |
| Repository Admin       | ✅ Full access | Can list all refs                                     |
| Repository Member (Write) | ✅ Full access | Can list all refs                                  |
| Repository Member (Read)  | ✅ Full access | Can list all refs (read-only endpoint)             |
| Organization Member    | ✅ If repo access | Follows repository-level permission                |
| Authenticated (no repo access) | ❌ 404 | Must not reveal repository existence               |
| Anonymous (public repo) | ✅ Full access | Public repos allow unauthenticated read            |
| Anonymous (private repo) | ❌ 404       | Must not reveal repository existence               |
| Deploy Key (read)      | ✅ Full access | Deploy keys with read scope may query refs          |
| Deploy Key (write)     | ✅ Full access | Write deploy keys also have read access             |
| PAT with `repo:read`   | ✅ Full access | Personal access tokens with repo read scope         |
| OAuth2 app with `repo` scope | ✅ Full access | OAuth2 apps with repository scope               |

### Rate Limiting

- **Authenticated requests:** Standard API rate limit (the platform-wide rate limiter configured in middleware).
- **Unauthenticated requests (public repos):** Lower tier rate limit consistent with other unauthenticated read endpoints.
- **Per-repository throttle:** If a single repository receives more than 60 git-refs requests per minute from the same source, return 429 with `Retry-After` header. This prevents abuse of the underlying `git for-each-ref` subprocess.

### Data Privacy

- The endpoint must not expose `.git/config`, hook scripts, credential helpers, or any non-ref git internal data.
- Ref names themselves may encode information (e.g. `refs/heads/feature/secret-project`); this is acceptable because the user already has read access to the repository.
- No PII is exposed beyond what is already visible in the repository's commit/tag history (tagger name/email for annotated tags).
- The endpoint must enforce the same visibility rules as other repository-scoped read endpoints: private repos are invisible to unauthorized users.

## Telemetry & Product Analytics

### Business Events

| Event Name          | Trigger                               | Properties                                                                                              |
|---------------------|---------------------------------------|---------------------------------------------------------------------------------------------------------|
| `GitRefsListed`     | Successful `GET /git/refs` response   | `repo_id`, `owner`, `repo`, `type_filter`, `has_prefix`, `result_count`, `has_next_page`, `client` (web/cli/tui/vscode/nvim), `response_time_ms` |
| `GitRefsError`      | Error response from `GET /git/refs`   | `repo_id`, `owner`, `repo`, `error_status`, `error_message`, `client`                                   |
| `GitRefsCopySha`    | User copies a SHA from UI/TUI/editor  | `repo_id`, `ref_type`, `client`                                                                         |

### Funnel Metrics

- **Adoption rate:** Percentage of active repositories whose refs endpoint is called at least once per week.
- **Client distribution:** Breakdown of `GitRefsListed` events by `client` property to understand which surfaces users prefer.
- **Filter usage:** Percentage of requests using `type` or `prefix` filters (indicates whether the filtering UX is discoverable and useful).
- **Pagination depth:** Average number of pages fetched per session (>1 indicates users are exploring large ref sets).
- **Error rate:** `GitRefsError` count / total `GitRefsListed` + `GitRefsError` count, broken down by `error_status`.

### Success Indicators

- The endpoint is called for >20% of active repositories within 30 days of launch.
- <1% error rate across all clients.
- The most common `type_filter` value provides signal on whether users primarily care about branches, tags, or both.

## Observability

### Logging Requirements

| Log Event                          | Level  | Structured Context                                                                 |
|------------------------------------|--------|------------------------------------------------------------------------------------|
| Refs request received              | `info` | `owner`, `repo`, `type_filter`, `has_prefix`, `cursor`, `limit`, `request_id`      |
| Refs response returned             | `info` | `owner`, `repo`, `result_count`, `has_next_page`, `duration_ms`, `request_id`      |
| Git for-each-ref command started   | `debug`| `owner`, `repo`, `args`, `request_id`                                              |
| Git for-each-ref command completed | `debug`| `owner`, `repo`, `exit_code`, `stdout_bytes`, `stderr_bytes`, `duration_ms`        |
| Git for-each-ref command failed    | `error`| `owner`, `repo`, `exit_code`, `stderr`, `duration_ms`, `request_id`                |
| Git for-each-ref command timed out | `error`| `owner`, `repo`, `timeout_ms`, `request_id`                                       |
| Invalid request parameters         | `warn` | `owner`, `repo`, `param_name`, `param_value`, `error_message`, `request_id`        |
| Repository not found               | `warn` | `owner`, `repo`, `request_id`                                                     |
| Authorization denied               | `warn` | `owner`, `repo`, `user_id`, `reason`, `request_id`                                |

### Prometheus Metrics

| Metric                                         | Type       | Labels                                    | Description                                         |
|------------------------------------------------|------------|-------------------------------------------|-----------------------------------------------------|
| `codeplane_git_refs_requests_total`            | Counter    | `status`, `type_filter`                   | Total git refs API requests by response status       |
| `codeplane_git_refs_request_duration_seconds`  | Histogram  | `type_filter`                             | Request duration from handler entry to response      |
| `codeplane_git_refs_result_count`              | Histogram  | `type_filter`                             | Number of refs returned per successful response      |
| `codeplane_git_refs_subprocess_duration_seconds`| Histogram | (none)                                    | Duration of `git for-each-ref` subprocess execution  |
| `codeplane_git_refs_subprocess_errors_total`   | Counter    | `error_type` (`timeout`, `exit_code`, `spawn_failure`) | Git subprocess failures                |

### Alerts

#### Alert: `GitRefsHighErrorRate`
- **Condition:** `rate(codeplane_git_refs_requests_total{status=~"5.."}[5m]) / rate(codeplane_git_refs_requests_total[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_git_refs_subprocess_errors_total` to determine if errors are subprocess-related.
  2. SSH into the server and run `git for-each-ref` manually against a failing repository to verify the git binary and repo state.
  3. Check disk space on the repos volume — a full disk causes git operations to fail.
  4. Review server logs filtered by `request_id` from recent error responses for stderr output.
  5. If errors are concentrated on specific repositories, check those repos for corruption (`git fsck`).
  6. If errors are widespread, check that the `git` binary is accessible and the correct version.

#### Alert: `GitRefsHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_git_refs_request_duration_seconds_bucket[5m])) > 3`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_git_refs_subprocess_duration_seconds` to isolate whether latency is in the subprocess or the handler.
  2. Identify if specific repositories have unusually large ref sets (`git for-each-ref --count=1 | wc -l` on suspect repos).
  3. Check system load (`uptime`, `iostat`) — high I/O wait indicates disk contention.
  4. If a single repository is causing issues, consider whether it has an abnormal number of refs (>50K) and whether ref cleanup is needed.
  5. Verify no other heavy git operations (gc, repack) are running concurrently.

#### Alert: `GitRefsSubprocessTimeouts`
- **Condition:** `rate(codeplane_git_refs_subprocess_errors_total{error_type="timeout"}[10m]) > 0`
- **Severity:** Critical
- **Runbook:**
  1. Identify which repositories triggered timeouts from logs (filter by `error_type=timeout`).
  2. Run `git for-each-ref` manually on the affected repository to reproduce.
  3. Check if the repository has a very large number of refs (`git for-each-ref | wc -l`).
  4. If the repo is healthy but slow, consider increasing the timeout threshold or adding `--count` limits at the git level.
  5. Check for filesystem-level issues (NFS stalls, disk failures) with `dmesg` and `mount`.
  6. If persistent, consider running `git pack-refs --all` on the affected repository to consolidate loose refs.

### Error Cases and Failure Modes

| Failure Mode                        | User Impact                                | Mitigation                                                    |
|------------------------------------|--------------------------------------------|---------------------------------------------------------------|
| `git` binary not found             | 500 error on all refs requests             | Health check at startup should verify `git` is on PATH        |
| Repository directory missing       | 404 (correct behavior)                     | `ensureRepo` guard                                            |
| `.git` directory missing (jj-only) | 500 — git commands fail                    | Verify colocated mode; return helpful error message           |
| Corrupted git packfile             | 500 or partial results                     | Log error, return 500, alert on elevated error rate           |
| Ref name with null bytes           | Parse failure                              | Filter null bytes from git output before parsing              |
| Disk full                          | `git for-each-ref` fails                   | Alert on disk usage, degrade gracefully                       |
| Subprocess hangs                   | Request times out after 5s                 | Kill subprocess, return 504, log timeout                      |
| Very large ref set (>100K refs)    | Slow response but functional               | Enforce `--count` at git level, pagination reduces payload    |

## Verification

### API Integration Tests

1. **`GET /git/refs` returns refs for a repository with branches and tags.** Create a repo, push content to create `refs/heads/main`, create a tag. Verify the response includes both refs with correct `type`, `ref`, and `object_sha` fields.
2. **`GET /git/refs` returns empty items for a fresh repo with no commits.** Create a repo but don't push. Verify `{ items: [], next_cursor: "" }`.
3. **`GET /git/refs?type=branch` filters to only branch refs.** Verify no tag refs appear in the response.
4. **`GET /git/refs?type=tag` filters to only tag refs.** Verify no branch refs appear in the response.
5. **`GET /git/refs?type=all` returns all ref types.** Verify both branches and tags appear.
6. **`GET /git/refs?type=BRANCH` (case-insensitive) works.** Verify the type filter is case-insensitive.
7. **`GET /git/refs?type=invalid` returns 400.** Verify the error message matches spec.
8. **`GET /git/refs?prefix=refs/tags/v1` filters by prefix.** Create tags `v1.0`, `v1.1`, `v2.0`. Verify only `v1.0` and `v1.1` are returned.
9. **`GET /git/refs?prefix=` (empty prefix) returns all refs.** Equivalent to no prefix filter.
10. **`GET /git/refs?prefix=<257-char-string>` returns 400.** Verify prefix length limit enforcement.
11. **`GET /git/refs?limit=5` returns at most 5 items.** Create >5 refs, verify `items.length <= 5` and `next_cursor` is populated.
12. **`GET /git/refs?limit=0` returns 400.**
13. **`GET /git/refs?limit=-1` returns 400.**
14. **`GET /git/refs?limit=abc` returns 400.**
15. **`GET /git/refs?limit=200` clamps to 100.** Verify `items.length <= 100`.
16. **Cursor-based pagination returns all refs across pages.** Create 10 refs, paginate with `limit=3`, collect all pages, verify all 10 refs are present with no duplicates.
17. **Refs are sorted lexicographically by `ref` name.** Verify the order of `ref` fields in the response is ascending alphabetical.
18. **`object_sha` is always a 40-character lowercase hex string.** Regex-validate every SHA in the response.
19. **Annotated tags include tagger metadata.** Create an annotated tag, verify `tagger_name`, `tagger_email`, `tagger_date`, and `message` are present.
20. **Lightweight tags omit tagger metadata.** Create a lightweight tag, verify tagger fields are absent.
21. **`branch_name` is present for branch-type refs and equals the ref name without `refs/heads/` prefix.**
22. **`tag_name` is present for tag-type refs and equals the ref name without `refs/tags/` prefix.**
23. **Non-existent repository returns 404.**
24. **Private repository without auth returns 404 (not 403).**
25. **Private repository with valid auth and read access returns 200.**
26. **Ref names with special characters (slashes, dots, unicode) are returned verbatim.** Create a branch `feature/my-branch.v2`, verify it appears correctly.
27. **Maximum valid input sizes work:** Create a repository with 100 refs, request `limit=100`, verify all 100 are returned in one page.
28. **Request with `limit=101` is clamped to 100** (not rejected).
29. **Multiple concurrent requests to the same repo return consistent results.**
30. **Deploy key with read access can query refs.**
31. **PAT with `repo:read` scope can query refs.**

### CLI E2E Tests

32. **`codeplane repo refs` outputs a human-readable table with REF, SHA, TYPE columns.**
33. **`codeplane repo refs --type branch` filters CLI output to branches only.**
34. **`codeplane repo refs --type tag` filters CLI output to tags only.**
35. **`codeplane repo refs --prefix refs/tags/v1 --json` outputs filtered JSON.**
36. **`codeplane repo refs --json` outputs valid JSON matching the API response shape.**
37. **`codeplane repo refs --limit 2` limits output and shows pagination footer when more refs exist.**
38. **`codeplane repo refs -R owner/repo` works with explicit repo slug.**
39. **`codeplane repo refs` with no repo context returns a helpful error.**
40. **`codeplane repo refs --type invalid` returns a user-friendly error message.**

### Web UI Playwright Tests

41. **Repository bookmarks page shows "Git Refs" tab/section.**
42. **Git Refs tab displays a table with ref name, SHA, and type badge columns.**
43. **Type filter dropdown filters displayed refs to branches only.**
44. **Type filter dropdown filters displayed refs to tags only.**
45. **Search/filter input narrows refs by prefix.**
46. **Clicking a SHA copies the full SHA to clipboard.**
47. **Empty state message is shown for repos with no refs.**
48. **Loading skeleton is displayed while refs are being fetched.**
49. **Error state shows retry button; clicking retry refetches.**
50. **Pagination: scrolling to the bottom loads more refs if `next_cursor` is non-empty.**
51. **Annotated tag row expands to show tagger info and message.**

### TUI Tests

52. **Git Refs tab (`g` key) renders a list of refs in the repository screen.**
53. **`/` key activates filter mode; typing filters refs by substring.**
54. **`t` key cycles type filter (all → branches → tags → all).**
55. **`c` key copies the full SHA of the selected ref (verify clipboard or output).**
56. **Empty repository shows empty state message in the refs tab.**

### Cross-Cutting Tests

57. **The `RepoHostService.listGitRefs` method returns correct data for a repository with mixed ref types.**
58. **The `RepoHostService.listGitRefs` method returns an error for a non-existent repository.**
59. **The `RepoHostService.listGitRefs` method handles a repository with zero refs gracefully.**
60. **The `RepoHostService.listGitRefs` method enforces the subprocess timeout and returns an appropriate error on timeout.**
