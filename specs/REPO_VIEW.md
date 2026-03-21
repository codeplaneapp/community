# REPO_VIEW

Specification for REPO_VIEW.

## High-Level User POV

When you navigate to a repository on Codeplane — whether through the web UI, the CLI, the TUI, or an editor integration — you see a clear, information-dense summary of that repository. This is the repository view, and it is the single most important screen in Codeplane because it is where every repository interaction begins.

The repository view tells you at a glance what a repository is, who owns it, whether it is public or private, whether it is archived, and how to clone it. It surfaces jj-native concepts like the default bookmark (rather than a "default branch") and shows engagement metrics such as star count, fork count, watcher count, and open issue count. If the repository is a fork, that relationship is visible. If the repository is archived, it is clearly communicated so you know it is read-only.

From the CLI, you can run `codeplane repo view` (optionally passing an `OWNER/REPO` argument or using the `-R` flag) and receive a formatted text summary of the repository — its full name, visibility, description, default bookmark, clone URL, and star count. If you pass `--json`, you receive the full structured response, which is useful for scripting, automation, and agent-driven workflows.

From the TUI, the repository view appears as a detail screen accessible from the repository list. It provides the same information in a navigable terminal layout with keyboard shortcuts for common actions like starring, cloning, or jumping to issues, landing requests, or bookmarks.

From the web UI, navigating to `/:owner/:repo` loads the repository overview. The overview page shows the repository header (name, owner, visibility badge, archive badge if applicable, star/fork/watch counts), the description and topics, the clone URL, and contextual navigation into bookmarks, changes, code explorer, issues, landing requests, workflows, releases, wiki, and settings.

The value of REPO_VIEW is immediacy: every user, agent, and integration can retrieve a canonical, consistent representation of a repository from a single API call, and every client surface presents that representation appropriately for its medium.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo` returns a complete `RepoResponse` payload for any valid, accessible repository.
- [ ] The CLI command `codeplane repo view [OWNER/REPO]` prints a human-readable summary and supports `--json` for structured output.
- [ ] The TUI repository overview screen displays all `RepoResponse` fields in a navigable layout.
- [ ] The Web UI route `/:owner/:repo` loads the repository overview page with all required sections.
- [ ] All clients (API, CLI, TUI, Web) return the identical data model for the same repository.

### Functional Constraints

- [ ] The `owner` path parameter must be a non-empty string consisting of alphanumeric characters, hyphens, and underscores. Maximum length: 39 characters.
- [ ] The `repo` (name) path parameter must be a non-empty string consisting of alphanumeric characters, hyphens, underscores, and dots. Maximum length: 100 characters. Must not start or end with a dot. Must not contain consecutive dots.
- [ ] Repository names are case-insensitive for lookup but case-preserving in storage and display.
- [ ] If `owner` or `repo` is empty or whitespace-only, the API must return `400 Bad Request` with an explicit error message.
- [ ] If the repository does not exist, the API must return `404 Not Found`.
- [ ] If the repository is private and the viewer is unauthenticated or lacks read access, the API must return `404 Not Found` (not `403 Forbidden`) to avoid leaking repository existence.
- [ ] If the repository is public, unauthenticated requests must succeed with `200 OK`.
- [ ] The `clone_url` field must follow the format `git@{SSH_HOST}:{owner}/{name}.git`.
- [ ] The `default_bookmark` field must default to `"main"` if not explicitly set.
- [ ] The `full_name` field must be `{owner}/{name}`.
- [ ] The `is_public` field must be the logical inverse of `private`.
- [ ] Numeric fields (`num_stars`, `num_forks`, `num_watches`, `num_issues`) must be non-negative integers (≥ 0).
- [ ] The `topics` field must be an array (empty array `[]` if no topics are set, never `null`).
- [ ] The `created_at` and `updated_at` fields must be ISO 8601 strings in UTC.
- [ ] If the repository is archived, `is_archived` must be `true` and `archived_at` must be a valid ISO 8601 string.
- [ ] If the repository is not archived, `is_archived` must be `false` and `archived_at` must be absent from the response.
- [ ] If the repository is a fork, `is_fork` must be `true` and `fork_id` must be present as a positive integer.
- [ ] If the repository is not a fork, `is_fork` must be `false` and `fork_id` must be absent from the response.
- [ ] The `id` field must be a positive integer.
- [ ] The `description` field must be a string (empty string `""` if not set, never `null`).

### Edge Cases

- [ ] Viewing a repository whose owner account has been deleted must return `404 Not Found`.
- [ ] Viewing a repository immediately after creation must return consistent data (no stale cache).
- [ ] Viewing a repository that was just transferred must work at the new `owner/repo` path and may redirect from the old path during a grace period.
- [ ] Viewing a repository with the maximum allowed name length (100 characters) must succeed.
- [ ] Viewing a repository with special characters in the name (e.g., hyphens, underscores, dots) must succeed.
- [ ] Concurrent `repo view` requests for the same repository must all succeed without race conditions.
- [ ] An owner name that looks like a reserved route (e.g., `api`, `admin`, `login`) must be handled correctly by the routing layer.

### CLI-Specific Constraints

- [ ] `codeplane repo view` without arguments resolves the repository from the current working directory's jj/git context.
- [ ] `codeplane repo view OWNER/REPO` accepts a positional argument.
- [ ] `codeplane repo view --repo OWNER/REPO` accepts a flag-based reference.
- [ ] `codeplane repo view -R OWNER/REPO` accepts the short flag alias.
- [ ] `--json` output must produce a valid JSON object matching the `RepoResponse` schema.
- [ ] Non-JSON output must include: full name, visibility, description (if set), default bookmark, clone URL, and star count.
- [ ] If the repository cannot be resolved (no argument and no local context), the CLI must exit with a non-zero code and a clear error message.

## Design

## API Shape

### Endpoint

```
GET /api/repos/:owner/:repo
```

### Request

- **Path parameters:**
  - `owner` (string, required): The user or organization that owns the repository.
  - `repo` (string, required): The repository name.
- **Authentication:** Optional. Required for private repositories.
- **Headers:** `Authorization: token <PAT>` or session cookie.

### Response: `200 OK`

```typescript
interface RepoResponse {
  id: number;                    // Positive integer, unique repository identifier
  owner: string;                 // Owner username or organization name
  name: string;                  // Repository name
  full_name: string;             // "{owner}/{name}"
  description: string;           // Repository description (empty string if unset)
  private: boolean;              // true if the repository is private
  is_public: boolean;            // Logical inverse of `private`
  default_bookmark: string;      // Default jj bookmark (defaults to "main")
  topics: string[];              // Array of topic tags (empty array if none)
  is_archived: boolean;          // true if the repository is archived
  archived_at?: string;          // ISO 8601 UTC timestamp, present only when archived
  is_fork: boolean;              // true if this is a forked repository
  fork_id?: number;              // Parent repository ID, present only for forks
  num_stars: number;             // Number of stars (≥ 0)
  num_forks: number;             // Number of forks (≥ 0)
  num_watches: number;           // Number of watchers (≥ 0)
  num_issues: number;            // Number of open issues (≥ 0)
  clone_url: string;             // SSH clone URL: git@{host}:{owner}/{name}.git
  created_at: string;            // ISO 8601 UTC timestamp
  updated_at: string;            // ISO 8601 UTC timestamp
}
```

### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | `owner` or `repo` is empty/whitespace | `{ "error": "owner is required" }` or `{ "error": "repository name is required" }` |
| `404 Not Found` | Repository does not exist, or viewer lacks access to a private repo | `{ "error": "repository not found" }` |
| `500 Internal Server Error` | Unexpected server failure | `{ "error": "internal server error" }` |

---

## SDK Shape

The `RepoService` class in `@codeplane/sdk` exposes:

```typescript
class RepoService {
  async getRepo(
    viewer: RepoActor | null,
    owner: string,
    repo: string
  ): Promise<Result<RepoRow, APIError>>;
}
```

- `viewer` is `null` for unauthenticated requests.
- `RepoActor` contains `{ id: number; username: string; isAdmin: boolean }`.
- The method delegates to `resolveReadableRepo`, which checks existence, resolves the owner, and enforces visibility rules.
- Public repos resolve for any viewer (including `null`). Private repos require a viewer with read access.

---

## CLI Command

### Synopsis

```
codeplane repo view [OWNER/REPO] [--repo OWNER/REPO] [-R OWNER/REPO] [--json]
```

### Behavior

1. If `OWNER/REPO` is provided as a positional argument, use it.
2. If `--repo` or `-R` is provided, use that.
3. If neither is provided, resolve from the current working directory's jj/git remote configuration.
4. Call `GET /api/repos/:owner/:repo`.
5. If `--json` is passed, print the raw JSON response.
6. Otherwise, print a formatted summary.

### Formatted Output

```
alice/my-project
Visibility: public
Description: A TypeScript monorepo for building AI-native tools
Default bookmark: main
Clone URL: git@ssh.codeplane.app:alice/my-project.git
Stars: 42
```

- `full_name` is printed as the header line.
- `Visibility` is derived from `is_public` ("public" or "private").
- `Description` is only printed if non-empty.
- `Default bookmark` is always printed.
- `Clone URL` is always printed.
- `Stars` is only printed if `num_stars` is defined.

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | API error (not found, unauthorized, server error) |
| `1` | Missing repo reference and unable to resolve from local context |

---

## TUI UI

### Screen: Repository Overview

The TUI repository overview screen is accessible from the repository list screen by selecting a repository and pressing `Enter`.

**Layout:**
- **Header bar:** `{full_name}` with visibility badge (`PUBLIC` / `PRIVATE`) and archive badge if applicable.
- **Metadata section:**
  - Owner: `{owner}`
  - Default bookmark: `{default_bookmark}`
  - Clone URL: `{clone_url}` (with copy-to-clipboard shortcut)
  - Created: `{created_at}` (relative time)
  - Updated: `{updated_at}` (relative time)
- **Stats row:** `★ {num_stars}  ⑂ {num_forks}  👁 {num_watches}  Issues: {num_issues}`
- **Topics row:** Rendered as inline tags if `topics.length > 0`.
- **Description:** Rendered below the metadata if non-empty.
- **Fork indicator:** If `is_fork`, show "Forked from {fork_id}" with link/navigation.

**Keybindings:**

| Key | Action |
|-----|--------|
| `s` | Star / unstar the repository |
| `c` | Copy clone URL to clipboard |
| `b` | Navigate to bookmarks |
| `i` | Navigate to issues |
| `l` | Navigate to landing requests |
| `w` | Navigate to workflows |
| `q` / `Esc` | Go back to repository list |
| `?` | Show keyboard help |

---

## Web UI Design

### Route: `/:owner/:repo`

The web repository overview page is the landing page for any repository.

**Page sections:**

1. **Repository header:**
   - Owner avatar + owner name (linked to owner profile)
   - `/` separator
   - Repository name
   - Visibility badge ("Public" or "Private")
   - Archive badge ("Archived") if `is_archived` is true
   - Star button with count (`num_stars`)
   - Fork button with count (`num_forks`)
   - Watch button with count (`num_watches`)

2. **Description and topics:**
   - Description text (or placeholder "No description provided" in muted text)
   - Topic tags as clickable chips (link to search filtered by topic)

3. **Quick actions bar:**
   - Clone URL selector (SSH / HTTPS toggle) with copy button
   - "Open in Desktop" button (if desktop app is detected)
   - "Open in VS Code" button

4. **Tab navigation:**
   - Code (default) — file tree and README
   - Bookmarks — list of jj bookmarks
   - Changes — recent jj changes
   - Issues — issue list with count badge
   - Landing Requests — LR list
   - Workflows — workflow definitions and runs
   - Releases — release list
   - Wiki — wiki pages
   - Settings (admin only) — repository settings

5. **README rendering area:**
   - Markdown rendering of the repository README (if present)
   - "No README found" placeholder if absent

6. **Sidebar (right):**
   - About section with description
   - Topics
   - Stats (stars, forks, watchers)
   - Languages breakdown (if available)
   - License info (if detected)
   - Latest release (if any)

---

## Editor Integrations

### VS Code

- The VS Code extension provides a "Repository" tree view that displays the current repository's metadata.
- The status bar shows the connected repository name and default bookmark.
- A "View Repository on Codeplane" command opens the web UI at `/:owner/:repo`.

### Neovim

- `:Codeplane repo view` command opens a floating window with repository details.
- The statusline component shows `{owner}/{repo}` and the current bookmark.
- `:Codeplane repo open` opens the web UI in the default browser.

---

## Documentation

The following documentation should be written for end users:

1. **Repositories guide** (`docs/guides/repositories.mdx`):
   - Section "Viewing Repository Details" with CLI examples (`codeplane repo view`, `codeplane repo view --json`, `codeplane repo view -R owner/repo`).
   - API reference table for `GET /api/repos/:owner/:repo`.
   - Full `RepoResponse` field reference table with types and descriptions.
   - Example JSON response.

2. **CLI reference** (`docs/reference/cli/repo-view.mdx`):
   - Synopsis, arguments, options, examples, and exit codes.

3. **API reference** (`docs/reference/api/repos.mdx`):
   - Full endpoint documentation with request/response schemas, error codes, and curl examples.

## Permissions & Security

## Authorization Model

### Role-Based Access

| Role | Can View Public Repos | Can View Private Repos | Notes |
|------|-----------------------|------------------------|-------|
| Anonymous (unauthenticated) | ✅ Yes | ❌ No (returns 404) | Cannot see private repos exist |
| Authenticated (no repo access) | ✅ Yes | ❌ No (returns 404) | Same as anonymous for private repos |
| Read-Only collaborator | ✅ Yes | ✅ Yes | Minimum required role for private repo access |
| Member (write access) | ✅ Yes | ✅ Yes | |
| Admin | ✅ Yes | ✅ Yes | |
| Owner | ✅ Yes | ✅ Yes | |
| Org member (with team repo access) | ✅ Yes | ✅ Yes (if team grants access) | Team-based access for org repos |
| Platform admin (`is_admin`) | ✅ Yes | ✅ Yes (all repos) | Superuser access |

### Security Rules

1. **Information leakage prevention:** Private repositories must return `404 Not Found` to unauthorized viewers, never `403 Forbidden`. This prevents attackers from enumerating private repository names.
2. **Archived repositories remain accessible:** Archiving a repository does not change its visibility or access rules. Archived repos are still viewable by anyone with read access.
3. **Forked repository access:** Viewing a fork does not grant access to the parent repository. Each repository has independent access control.
4. **Deploy key access:** Deploy keys can authenticate `GET /api/repos/:owner/:repo` for their scoped repository only.
5. **PAT scope:** Personal access tokens must have `repo:read` scope (or equivalent) to access private repositories.

### Rate Limiting

| Context | Rate Limit | Window |
|---------|-----------|--------|
| Authenticated requests | 5,000 requests | per hour |
| Unauthenticated requests | 60 requests | per hour |
| Per-IP burst | 30 requests | per minute |

Rate limiting is enforced by the platform middleware layer (`PLATFORM_HTTP_MIDDLEWARE_RATE_LIMITING`). Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) must be included in all responses.

### Data Privacy

- **No PII in the response:** The `RepoResponse` does not contain user PII beyond the owner's username, which is already public.
- **Private repo descriptions:** Descriptions of private repositories are only visible to authorized viewers. They must not appear in search results, activity feeds, or logs accessible to unauthorized users.
- **Clone URLs:** Clone URLs for private repos are only returned to authorized viewers (enforced by the 404 rule).
- **Audit trail:** All access to private repositories should be logged for audit purposes (see Observability section).

## Telemetry & Product Analytics

## Business Events

### `RepoViewed`

Fired every time a repository is successfully viewed via any client surface.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `repo_id` | number | The unique repository ID |
| `repo_full_name` | string | `owner/repo` |
| `owner_type` | string | `"user"` or `"org"` |
| `is_public` | boolean | Whether the repository is public |
| `is_archived` | boolean | Whether the repository is archived |
| `is_fork` | boolean | Whether the repository is a fork |
| `viewer_id` | number \| null | The authenticated user's ID, or null for anonymous |
| `viewer_is_owner` | boolean | Whether the viewer is the repo owner |
| `client` | string | `"api"`, `"cli"`, `"tui"`, `"web"`, `"vscode"`, `"neovim"`, `"desktop"` |
| `response_time_ms` | number | Time to serve the request in milliseconds |

### `RepoViewFailed`

Fired when a repository view request fails (404, 400, 500).

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `owner` | string | The requested owner |
| `repo` | string | The requested repo name |
| `error_code` | number | HTTP status code |
| `error_message` | string | Error description |
| `viewer_id` | number \| null | Authenticated user ID or null |
| `client` | string | Client type |

## Funnel Metrics and Success Indicators

| Metric | Definition | Target |
|--------|-----------|--------|
| **Repo view success rate** | `RepoViewed / (RepoViewed + RepoViewFailed)` | ≥ 99.5% |
| **P50 response time** | 50th percentile `response_time_ms` for `RepoViewed` | ≤ 50ms |
| **P99 response time** | 99th percentile `response_time_ms` for `RepoViewed` | ≤ 500ms |
| **Repo view → clone conversion** | Users who view a repo and then clone it within 24 hours | Track trend |
| **Repo view → star conversion** | Users who view a repo and then star it within the same session | Track trend |
| **Repo view → issue creation** | Users who view a repo and then create an issue within 1 hour | Track trend |
| **Anonymous vs authenticated split** | Percentage of views from unauthenticated users | Monitor for abuse |
| **CLI vs Web vs TUI distribution** | Breakdown of `client` values for `RepoViewed` | Monitor adoption |
| **404 rate** | `RepoViewFailed` where `error_code = 404` / total requests | Monitor for broken links |

## Observability

## Logging

### Required Log Points

| Log Point | Level | Structured Context | When |
|-----------|-------|-------------------|------|
| Repo view request received | `DEBUG` | `{ owner, repo, viewer_id, request_id }` | Start of request handler |
| Repo resolved successfully | `DEBUG` | `{ repo_id, owner, repo, is_public, response_time_ms }` | After service call succeeds |
| Repo not found | `INFO` | `{ owner, repo, viewer_id, request_id }` | Service returns 404 |
| Private repo access denied | `INFO` | `{ owner, repo, viewer_id, request_id }` | Unauthenticated or unauthorized access to private repo |
| Bad request (missing params) | `WARN` | `{ owner, repo, error, request_id }` | Empty owner or repo |
| Internal server error | `ERROR` | `{ owner, repo, error_message, stack_trace, request_id }` | Unexpected exception |
| Database query timeout | `ERROR` | `{ owner, repo, query_duration_ms, request_id }` | DB query exceeds timeout |

All log lines must include the `request_id` from the middleware for correlation.

## Prometheus Metrics

### Counters

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_repo_view_total` | `status`, `owner_type` | Total repo view requests |
| `codeplane_repo_view_errors_total` | `status_code`, `error_type` | Total repo view errors |

### Histograms

| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `codeplane_repo_view_duration_seconds` | `status` | `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5` | Request duration |
| `codeplane_repo_view_db_query_duration_seconds` | — | `0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25` | Database query time |

### Gauges

| Metric | Description |
|--------|-------------|
| `codeplane_repo_view_in_flight` | Number of currently in-flight repo view requests |

## Alerts

### Alert: `RepoViewHighErrorRate`

**Condition:** `rate(codeplane_repo_view_errors_total{status_code=~"5.."}[5m]) / rate(codeplane_repo_view_total[5m]) > 0.01`

**Severity:** `critical`

**Runbook:**
1. Check the server logs for `ERROR`-level entries with the `repo_view` context. Look for stack traces.
2. Check database connectivity: `SELECT 1` on the primary database.
3. Check if the database connection pool is exhausted: look at `codeplane_db_pool_active` and `codeplane_db_pool_idle` gauges.
4. Check recent deployments: was a new version rolled out in the last 30 minutes?
5. If the error is a query timeout, check `codeplane_repo_view_db_query_duration_seconds` for spikes.
6. If the database is healthy, check for memory pressure on the application server (`process_resident_memory_bytes`).
7. Escalate to the platform team if unresolved within 15 minutes.

### Alert: `RepoViewHighLatency`

**Condition:** `histogram_quantile(0.99, rate(codeplane_repo_view_duration_seconds_bucket[5m])) > 1.0`

**Severity:** `warning`

**Runbook:**
1. Check `codeplane_repo_view_db_query_duration_seconds` to determine if latency is database-bound.
2. Check database slow query logs for queries involving the `repos` table.
3. Check if there is elevated traffic: compare `rate(codeplane_repo_view_total[5m])` against the baseline.
4. Check system load (`node_cpu_seconds_total`, `node_memory_MemAvailable_bytes`) on application and database hosts.
5. If database-bound, check for missing indexes on the repos lookup path (owner + name).
6. If traffic-bound, consider enabling caching or scaling horizontally.

### Alert: `RepoView404Spike`

**Condition:** `rate(codeplane_repo_view_errors_total{status_code="404"}[10m]) > 50`

**Severity:** `warning`

**Runbook:**
1. Check if a popular repository was recently deleted, transferred, or renamed.
2. Check referrer headers in access logs to identify broken external links.
3. Check if a bot or crawler is generating 404s against non-existent repos.
4. If caused by a transfer, verify that the redirect grace period is functioning.
5. If caused by a bot, consider adding the user-agent to the rate-limit deny list.

## Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior |
|------------|-------------|----------|
| Owner param empty | 400 | Return error immediately, no DB query |
| Repo param empty | 400 | Return error immediately, no DB query |
| Repo not found in DB | 404 | Log at INFO level |
| Private repo, no auth | 404 | Log at INFO level (do not log the repo name to avoid leaking) |
| Private repo, insufficient access | 404 | Log at INFO level |
| Database connection failure | 500 | Log at ERROR with full error, retry once |
| Database query timeout | 500 | Log at ERROR with query duration |
| Unexpected exception in mapRepoResponse | 500 | Log at ERROR with stack trace |
| SSH_HOST env var missing | Response uses fallback `localhost` | Log at WARN on server startup only |

## Verification

## Integration & E2E Test Plan

### API Tests (`e2e/api/repo-view.test.ts`)

#### Happy Path

- [ ] **View a public repository as an authenticated user.** Create a public repo, call `GET /api/repos/:owner/:repo`, assert `200` with all `RepoResponse` fields present and correctly typed.
- [ ] **View a public repository as an unauthenticated user.** Call `GET /api/repos/:owner/:repo` without auth headers, assert `200`.
- [ ] **View a private repository as the owner.** Create a private repo, call `GET` as the owner, assert `200`.
- [ ] **View a private repository as a collaborator with read access.** Add a collaborator, call `GET` as the collaborator, assert `200`.
- [ ] **View an org-owned public repository.** Create an org repo, call `GET`, assert `200` with `owner` set to the org name.
- [ ] **View a forked repository.** Fork a repo, call `GET` on the fork, assert `is_fork: true` and `fork_id` is present and valid.
- [ ] **View an archived repository.** Archive a repo, call `GET`, assert `is_archived: true` and `archived_at` is a valid ISO 8601 string.
- [ ] **View a repository with topics set.** Set topics, call `GET`, assert `topics` array matches.
- [ ] **View a repository with zero stars/forks/watches.** Newly created repo, assert all counts are `0`.
- [ ] **View a repository after starring.** Star the repo, call `GET`, assert `num_stars` is `1`.

#### Field Validation

- [ ] **`full_name` format.** Assert `full_name === owner + '/' + name`.
- [ ] **`is_public` and `private` consistency.** Assert `is_public === !private`.
- [ ] **`default_bookmark` defaults to "main".** Create a repo without specifying `default_bookmark`, assert it equals `"main"`.
- [ ] **`clone_url` format.** Assert `clone_url` matches `git@{SSH_HOST}:{owner}/{name}.git`.
- [ ] **`created_at` and `updated_at` are valid ISO 8601.** Parse with `new Date()`, assert `!isNaN(date.getTime())`.
- [ ] **`description` is empty string when unset.** Create a repo without description, assert `description === ""`.
- [ ] **`topics` is empty array when unset.** Create a repo without topics, assert `topics` is `[]` and not `null`.
- [ ] **`id` is a positive integer.** Assert `id > 0` and `Number.isInteger(id)`.
- [ ] **Numeric counters are non-negative integers.** Assert `num_stars >= 0`, `num_forks >= 0`, `num_watches >= 0`, `num_issues >= 0` and all are integers.
- [ ] **`archived_at` absent when not archived.** Assert the field is `undefined` in the JSON response.
- [ ] **`fork_id` absent when not a fork.** Assert the field is `undefined` in the JSON response.

#### Error Cases

- [ ] **404 for non-existent repository.** Call `GET /api/repos/alice/does-not-exist`, assert `404`.
- [ ] **404 for private repo as unauthenticated user.** Create a private repo, call `GET` without auth, assert `404` (not `403`).
- [ ] **404 for private repo as user without access.** Create a private repo owned by user A, call `GET` as user B (no collaborator access), assert `404`.
- [ ] **400 for empty owner.** Call `GET /api/repos/%20/my-repo`, assert `400`.
- [ ] **400 for empty repo name.** Call `GET /api/repos/alice/%20`, assert `400`.
- [ ] **404 for deleted repository.** Create then delete a repo, call `GET`, assert `404`.
- [ ] **404 for non-existent owner.** Call `GET /api/repos/nonexistent-user-xyz/my-repo`, assert `404`.

#### Boundary Tests

- [ ] **Maximum length repository name (100 chars).** Create a repo with a 100-character name, call `GET`, assert `200`.
- [ ] **Repository name exceeding maximum length (101 chars).** Attempt to create a repo with 101 chars, assert creation fails. Then call `GET` with 101-char name, assert `404` or `400`.
- [ ] **Maximum length owner name (39 chars).** Call `GET` with a 39-char owner name, assert appropriate response (404 if doesn't exist, 200 if it does).
- [ ] **Repository name with hyphens, underscores, and dots.** Create a repo named `my-project_v2.0`, call `GET`, assert `200`.
- [ ] **Repository name starting with a number.** Create a repo named `123-project`, call `GET`, assert `200`.
- [ ] **Repository name with consecutive hyphens.** Create a repo named `my--project`, call `GET`, assert `200`.
- [ ] **Owner name that matches a reserved route.** Call `GET /api/repos/api/some-repo`, assert proper behavior (should not collide with API routes since this is under `/api/repos/`).

#### Concurrency Tests

- [ ] **50 concurrent GET requests for the same repository.** All must return `200` with identical data.
- [ ] **View immediately after create.** Create a repo in one request, immediately `GET` in a second, assert `200` with correct data.
- [ ] **View immediately after update.** Update repo description, immediately `GET`, assert the new description is returned.

### CLI Tests (`e2e/cli/repo-view.test.ts`)

- [ ] **`codeplane repo view OWNER/REPO` returns formatted output.** Assert output contains the full name, visibility, and clone URL.
- [ ] **`codeplane repo view OWNER/REPO --json` returns valid JSON.** Parse output as JSON, assert it matches `RepoResponse` schema.
- [ ] **`codeplane repo view --repo OWNER/REPO` works with flag.** Assert same output as positional argument.
- [ ] **`codeplane repo view` with no arg and no local context fails.** Assert non-zero exit code and error message.
- [ ] **`codeplane repo view OWNER/NONEXISTENT` returns error.** Assert non-zero exit code.
- [ ] **JSON output includes all RepoResponse fields.** Assert presence of `id`, `owner`, `name`, `full_name`, `description`, `private`, `is_public`, `default_bookmark`, `topics`, `is_archived`, `is_fork`, `num_stars`, `num_forks`, `num_watches`, `num_issues`, `clone_url`, `created_at`, `updated_at`.
- [ ] **Formatted output for repo with no description omits description line.** Create a repo without description, assert output does not contain "Description:".
- [ ] **Formatted output for repo with description includes it.** Create a repo with description, assert output contains "Description: {description}".
- [ ] **View a private repo without auth fails.** Logout, attempt view, assert failure.

### Web UI Tests (`e2e/ui/repo-view.test.ts` — Playwright)

- [ ] **Navigate to `/:owner/:repo` and verify page loads.** Assert the repository name is visible in the header.
- [ ] **Repository header shows correct owner and name.** Assert text content matches.
- [ ] **Visibility badge shows "Public" for public repos.** Assert badge element exists with correct text.
- [ ] **Visibility badge shows "Private" for private repos.** Login as owner, navigate, assert badge.
- [ ] **Archive badge appears for archived repos.** Archive a repo, navigate, assert badge visible.
- [ ] **Star count is displayed.** Assert the star count element shows `num_stars`.
- [ ] **Fork count is displayed.** Assert the fork count element shows `num_forks`.
- [ ] **Description is displayed.** Assert the description text is visible on the page.
- [ ] **Topics are rendered as chips.** Assert each topic has a visible chip element.
- [ ] **Clone URL is visible and copyable.** Assert the clone URL text is present.
- [ ] **Tab navigation works.** Click each tab (Bookmarks, Changes, Issues, etc.) and assert the URL updates.
- [ ] **404 page for non-existent repo.** Navigate to `/:owner/nonexistent`, assert 404 UI is shown.
- [ ] **Private repo shows 404 to unauthenticated user.** Logout, navigate to private repo URL, assert 404 UI.
- [ ] **Star button works.** Click star, assert count increments. Click again, assert count decrements.

### TUI Tests (`e2e/tui/repo-view.test.ts`)

- [ ] **Repository overview screen displays full_name.** Navigate to a repo in the TUI, assert the header contains the full name.
- [ ] **Visibility indicator is shown.** Assert "PUBLIC" or "PRIVATE" badge is visible.
- [ ] **Clone URL is displayed.** Assert clone URL text is present.
- [ ] **Star count is displayed.** Assert star count is visible.
- [ ] **`s` key toggles star.** Press `s`, verify star action completes.
- [ ] **`q` key returns to repo list.** Press `q`, verify navigation back to list.
- [ ] **Archived repository shows archive indicator.** Navigate to an archived repo, assert archive badge is visible.
