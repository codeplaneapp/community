# REPO_TOPICS_LIST

Specification for REPO_TOPICS_LIST.

## High-Level User POV

When you navigate to a repository on Codeplane — whether through the web UI, the CLI, the TUI, or an editor integration — you can see the topics (tags) associated with that repository. Topics are short, lowercase labels that help categorize repositories by subject area, technology, or purpose. For example, a repository might be tagged with `typescript`, `ai-agents`, `workflow-engine`, or `jj-native`.

Listing repository topics lets you quickly understand what a project is about at a glance. Topics appear prominently on the repository overview page as clickable chips, in the repository sidebar, and in search results. From the CLI, you can run `codeplane repo topic list` to see every topic applied to a repository, which is especially useful for scripting, automation, and agent-driven workflows that need to classify or route work based on repository metadata.

The value of REPO_TOPICS_LIST is discoverability: topics are the primary way users, agents, and integrations categorize and find repositories across a Codeplane instance. Whether you're browsing the web UI, querying the API from a CI pipeline, or using the TUI to explore repositories on your team, the topics list gives you a fast, consistent answer to "what is this repo about?" without reading the README.

Topics are always returned as a flat list of lowercase strings, sorted alphabetically and deduplicated. A repository with no topics returns an empty list. Topics never contain spaces, uppercase characters, or special characters beyond hyphens — they are clean, machine-friendly labels designed to work equally well as UI chips, search facets, CLI output, and API payloads.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/topics` returns a `{ topics: string[] }` payload for any valid, accessible repository.
- [ ] The CLI command `codeplane repo topic list` prints the topics and supports `--json` for structured output.
- [ ] The TUI displays repository topics as inline tags on the repository overview screen.
- [ ] The Web UI renders topics as clickable chips on the repository overview page and sidebar.
- [ ] All clients (API, CLI, TUI, Web) return the identical data from the same underlying API call.
- [ ] The feature is exercised by end-to-end tests covering API, CLI, and key edge cases.

### Functional Constraints

- [ ] The `owner` path parameter must be a non-empty string. Maximum length: 39 characters.
- [ ] The `repo` (name) path parameter must be a non-empty string matching the repository name regex `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`. Maximum length: 100 characters.
- [ ] If `owner` or `repo` is empty or whitespace-only, the API must return `400 Bad Request` with a descriptive error message.
- [ ] If the repository does not exist, the API must return `404 Not Found`.
- [ ] If the repository is private and the viewer is unauthenticated or lacks read access, the API must return `404 Not Found` (not `403`) to prevent leaking repository existence.
- [ ] If the repository is public, unauthenticated requests must succeed with `200 OK`.
- [ ] The response `topics` field must always be an array — never `null` or `undefined`. An empty array `[]` is the canonical representation for "no topics".
- [ ] Each topic in the returned array must match the regex `^[a-z0-9][a-z0-9-]{0,34}$`.
- [ ] Topics must be lowercase, alphanumeric with hyphens allowed (but not leading hyphens).
- [ ] Each topic must be between 1 and 35 characters inclusive.
- [ ] The returned topics array must not contain duplicates.
- [ ] The returned topics must be in the order they are stored (insert order, as persisted by the replace operation).
- [ ] The response must be `Content-Type: application/json`.

### Edge Cases

- [ ] A repository with zero topics returns `{ "topics": [] }` (200 OK), not an error.
- [ ] A repository with the maximum reasonable number of topics (e.g., 20) returns all topics in the array.
- [ ] A repository with topics containing the maximum character length (35 chars) returns those topics fully.
- [ ] A repository that was just created (and has never had topics set) returns `{ "topics": [] }`.
- [ ] A repository whose topics were just cleared (replaced with `[]` via PUT) returns `{ "topics": [] }`.
- [ ] An archived repository still returns its topics (archiving does not affect topic visibility).
- [ ] A forked repository returns its own topics, independent of the parent repository's topics.
- [ ] Viewing topics for an owner name that matches a reserved route (e.g., `api`, `admin`) is handled correctly by the routing layer.
- [ ] Concurrent GET requests for the same repository's topics all succeed without race conditions.
- [ ] Requesting topics immediately after a PUT update returns the newly set topics (no stale reads).

### CLI-Specific Constraints

- [ ] `codeplane repo topic list` without a repo argument resolves the repository from the current working directory's jj/git remote context.
- [ ] `codeplane repo topic list -R OWNER/REPO` accepts the short flag alias.
- [ ] `codeplane repo topic list --repo OWNER/REPO` accepts the long flag.
- [ ] `--json` output produces a valid JSON object matching `{ topics: string[] }`.
- [ ] Non-JSON output prints each topic on its own line (plain text, one topic per line), or a message like "No topics" if the list is empty.
- [ ] If the repository cannot be resolved (no argument and no local context), the CLI exits with a non-zero exit code and a clear error message.

## Design

### API Shape

#### Endpoint

```
GET /api/repos/:owner/:repo/topics
```

#### Request

- **Path parameters:**
  - `owner` (string, required): The user or organization that owns the repository.
  - `repo` (string, required): The repository name.
- **Authentication:** Optional. Required for private repositories.
- **Headers:** `Authorization: token <PAT>` or session cookie (optional).

#### Response: `200 OK`

```typescript
interface RepoTopicsResponse {
  topics: string[];  // Array of topic strings, empty array if none
}
```

Example response (repository with topics):

```json
{
  "topics": ["ai-agents", "jj-native", "typescript", "workflow-engine"]
}
```

Example response (repository with no topics):

```json
{
  "topics": []
}
```

#### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | `owner` or `repo` is empty/whitespace | `{ "error": "owner is required" }` or `{ "error": "repository name is required" }` |
| `404 Not Found` | Repository does not exist, or viewer lacks access to a private repo | `{ "error": "repository not found" }` |
| `500 Internal Server Error` | Unexpected server failure | `{ "error": "internal server error" }` |

---

### SDK Shape

The `RepoService` class in `@codeplane/sdk` exposes:

```typescript
class RepoService {
  async getRepoTopics(
    viewer: RepoActor | null,
    owner: string,
    repo: string
  ): Promise<Result<string[], APIError>>;
}
```

- `viewer` is `null` for unauthenticated requests.
- `RepoActor` contains `{ id: number; username: string; isAdmin: boolean }`.
- The method delegates to `resolveReadableRepo`, which checks existence, resolves the owner, and enforces visibility rules (returning `404` for both non-existent and unauthorized private repos).
- Returns `Result.ok(topics)` where `topics` is `string[]` (may be empty).
- Returns `Result.err(...)` with an `APIError` on failure.

---

### CLI Command

#### Synopsis

```
codeplane repo topic list [--repo OWNER/REPO] [-R OWNER/REPO] [--json]
```

#### Behavior

1. If `--repo` or `-R` is provided, use that to resolve the repository.
2. If neither is provided, resolve from the current working directory's jj/git remote configuration.
3. Call `GET /api/repos/:owner/:repo/topics`.
4. If `--json` is passed, print the raw JSON response.
5. Otherwise, print topics in a human-readable format.

#### Formatted Output

When topics exist:

```
ai-agents
jj-native
typescript
workflow-engine
```

When no topics exist:

```
No topics
```

#### JSON Output

```json
{
  "topics": ["ai-agents", "jj-native", "typescript", "workflow-engine"]
}
```

#### Exit Codes

| Code | Meaning |
|------|--------|
| `0` | Success |
| `1` | API error (not found, unauthorized, server error) |
| `1` | Missing repo reference and unable to resolve from local context |

---

### TUI UI

#### Repository Overview Screen — Topics Row

On the repository overview / detail screen, topics are displayed as an inline row of styled tags below the metadata section.

**Layout:**

- **Label:** `Topics:` in dim/muted text, followed by a horizontal list of topic tags.
- Each topic is rendered as a styled inline badge (e.g., `[ai-agents]` `[typescript]`) using Ink `<Box>` and `<Text>` with a distinct color or inverse style.
- If no topics exist, the topics row is either omitted or shows `Topics: none` in muted text.

**Keybindings:** No additional keybindings required — topics are display-only in the TUI.

---

### Web UI Design

#### Repository Overview Page (`/:owner/:repo`)

**Topics display locations:**

1. **Description and topics section** (below the repository header):
   - Topics are rendered as horizontal, clickable chip/badge components.
   - Each chip shows the topic text in lowercase.
   - Clicking a topic chip navigates to the global search page filtered by that topic (e.g., `/search?q=topic:typescript`).
   - Chips wrap to the next line if there are more topics than fit on one line.
   - If no topics exist, the topics area is empty (no "No topics" placeholder in the overview — that space is simply absent).

2. **Sidebar "About" section** (right column):
   - Topics appear as a bulleted or chipped list under a "Topics" heading.
   - Same clickable behavior as the main topics area.
   - If no topics exist, the "Topics" heading may be omitted from the sidebar, or show "None" in muted text.

**Visual Specification:**

- **Chip style:** Rounded pill shape, muted background color (e.g., `bg-blue-100 text-blue-800` in light mode, `bg-blue-900 text-blue-200` in dark mode), small text (`text-xs` or `text-sm`).
- **Spacing:** `gap-2` between chips, `gap-1` vertical when wrapping.
- **Hover state:** Slightly darker background, cursor pointer.
- **Max display:** All topics are always shown (no truncation). Since the maximum is ~20 and each is ≤35 chars, this fits in all layouts.

---

### Editor Integrations

#### VS Code

- The repository tree view should include a "Topics" node if topics are present, listing each topic as a child item.
- Topics are display-only in the tree view (no inline editing).

#### Neovim

- `:Codeplane repo view` output includes a `Topics:` line listing all topics, comma-separated.
- If no topics, the Topics line shows `none`.

---

### Documentation

The following documentation should be written for end users:

1. **Repositories guide** (`docs/guides/repositories.mdx`):
   - Section "Repository Topics" explaining what topics are, how they categorize repositories, and how to view them.
   - CLI examples: `codeplane repo topic list`, `codeplane repo topic list -R owner/repo`, `codeplane repo topic list --json`.
   - Explanation of topic format constraints (lowercase, alphanumeric + hyphens, 1–35 characters).

2. **CLI reference** (`docs/reference/cli/repo-topic-list.mdx`):
   - Synopsis, arguments, options, examples, and exit codes.
   - Example output in both formatted and JSON modes.

3. **API reference** (`docs/reference/api/repos.mdx`):
   - Full endpoint documentation for `GET /api/repos/:owner/:repo/topics`.
   - Request/response schemas, error codes, and curl examples.
   - Example: `curl -H "Authorization: token <PAT>" https://codeplane.example.com/api/repos/alice/my-project/topics`

## Permissions & Security

### Authorization Model

| Role | Can List Topics (Public Repo) | Can List Topics (Private Repo) | Notes |
|------|-------------------------------|--------------------------------|-------|
| Anonymous (unauthenticated) | ✅ Yes | ❌ No (returns 404) | Cannot discover private repos exist |
| Authenticated (no repo access) | ✅ Yes | ❌ No (returns 404) | Same as anonymous for private repos |
| Read-Only collaborator | ✅ Yes | ✅ Yes | Minimum required role for private repo topic access |
| Member (write access) | ✅ Yes | ✅ Yes | |
| Admin | ✅ Yes | ✅ Yes | |
| Owner | ✅ Yes | ✅ Yes | |
| Org member (with team repo access) | ✅ Yes | ✅ Yes (if team grants read access) | Team-based access for org repos |
| Platform admin (`is_admin`) | ✅ Yes | ✅ Yes (all repos) | Superuser access |
| Deploy key (read scope) | ✅ Yes | ✅ Yes (scoped repo only) | Deploy keys only access their assigned repo |

### Security Rules

1. **Information leakage prevention:** Private repositories must return `404 Not Found` to unauthorized viewers, never `403 Forbidden`. This prevents enumerating private repository names via the topics endpoint.
2. **Archived repositories remain accessible:** Archiving does not change topic visibility or access rules.
3. **No sensitive data in topics:** Topics are user-defined labels. The system must not allow topics that resemble secrets, tokens, or PII. The character constraint (`^[a-z0-9][a-z0-9-]{0,34}$`) inherently prevents most injection vectors.
4. **PAT scope:** Personal access tokens must have `repo:read` scope to access topics on private repositories.

### Rate Limiting

| Context | Rate Limit | Window |
|---------|-----------|--------|
| Authenticated requests | 5,000 requests | per hour |
| Unauthenticated requests | 60 requests | per hour |
| Per-IP burst | 30 requests | per minute |

Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) must be included in all responses.

### Data Privacy

- **No PII in topics:** Topics are free-form labels constrained to a safe character set. They do not contain user PII.
- **Private repo topics are private:** Topics on private repositories are only visible to authorized viewers. They must not leak into search indexes, logs, or activity feeds accessible to unauthorized users.

## Telemetry & Product Analytics

### Business Events

#### `RepoTopicsListed`

Fired every time a repository's topics are successfully listed via any client surface.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `repo_id` | number | The unique repository ID |
| `repo_full_name` | string | `owner/repo` |
| `owner_type` | string | `"user"` or `"org"` |
| `is_public` | boolean | Whether the repository is public |
| `topic_count` | number | Number of topics returned |
| `viewer_id` | number \| null | Authenticated user ID, or null for anonymous |
| `viewer_is_owner` | boolean | Whether the viewer is the repo owner |
| `client` | string | `"api"`, `"cli"`, `"tui"`, `"web"`, `"vscode"`, `"neovim"`, `"desktop"` |
| `response_time_ms` | number | Time to serve the request in milliseconds |

#### `RepoTopicsListFailed`

Fired when a repository topics list request fails (400, 404, 500).

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `owner` | string | The requested owner |
| `repo` | string | The requested repo name |
| `error_code` | number | HTTP status code |
| `error_message` | string | Error description |
| `viewer_id` | number \| null | Authenticated user ID or null |
| `client` | string | Client type |

### Funnel Metrics and Success Indicators

| Metric | Definition | Target |
|--------|-----------|--------|
| **Topics list success rate** | `RepoTopicsListed / (RepoTopicsListed + RepoTopicsListFailed)` | ≥ 99.5% |
| **P50 response time** | 50th percentile `response_time_ms` for `RepoTopicsListed` | ≤ 30ms |
| **P99 response time** | 99th percentile `response_time_ms` for `RepoTopicsListed` | ≤ 300ms |
| **Repos with topics** | Percentage of repositories that have at least one topic | Track trend (goal: increasing adoption) |
| **Average topics per repo** | Mean `topic_count` across `RepoTopicsListed` events | Track trend |
| **Topic → search conversion** | Users who view topics and then click a topic chip (search by topic) within same session | Track trend |
| **CLI vs Web vs API distribution** | Breakdown of `client` values for `RepoTopicsListed` | Monitor adoption |
| **404 rate** | `RepoTopicsListFailed` where `error_code = 404` / total requests | Monitor for broken links |

## Observability

### Logging

#### Required Log Points

| Log Point | Level | Structured Context | When |
|-----------|-------|-------------------|------|
| Topics list request received | `DEBUG` | `{ owner, repo, viewer_id, request_id }` | Start of request handler |
| Topics resolved successfully | `DEBUG` | `{ repo_id, owner, repo, topic_count, response_time_ms, request_id }` | After service call succeeds |
| Repo not found for topics list | `INFO` | `{ owner, repo, viewer_id, request_id }` | Service returns 404 |
| Private repo topics access denied | `INFO` | `{ owner, repo, viewer_id, request_id }` | Unauthorized access to private repo topics |
| Bad request (missing params) | `WARN` | `{ owner, repo, error, request_id }` | Empty owner or repo parameter |
| Internal server error | `ERROR` | `{ owner, repo, error_message, stack_trace, request_id }` | Unexpected exception |
| Database query timeout | `ERROR` | `{ owner, repo, query_duration_ms, request_id }` | DB query exceeds timeout |

All log lines must include the `request_id` from the middleware for request correlation.

### Prometheus Metrics

#### Counters

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_repo_topics_list_total` | `status`, `owner_type` | Total repo topics list requests |
| `codeplane_repo_topics_list_errors_total` | `status_code`, `error_type` | Total repo topics list errors by type |

#### Histograms

| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `codeplane_repo_topics_list_duration_seconds` | `status` | `0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0` | Request duration |

#### Gauges

| Metric | Description |
|--------|-------------|
| `codeplane_repo_topics_list_in_flight` | Number of currently in-flight repo topics list requests |

### Alerts

#### Alert: `RepoTopicsListHighErrorRate`

**Condition:** `rate(codeplane_repo_topics_list_errors_total{status_code=~"5.."}[5m]) / rate(codeplane_repo_topics_list_total[5m]) > 0.01`

**Severity:** `critical`

**Runbook:**
1. Check server logs for `ERROR`-level entries containing `topics` and `request_id` context. Look for stack traces indicating unexpected exceptions.
2. Verify database connectivity: run `SELECT 1` against the primary database.
3. Check if the database connection pool is exhausted: inspect `codeplane_db_pool_active` and `codeplane_db_pool_idle` gauges.
4. Review recent deployments: check if a new server version was rolled out in the last 30 minutes that might have introduced a regression.
5. If errors are query timeouts, check `codeplane_repo_topics_list_duration_seconds` for latency spikes and correlate with database slow query logs.
6. If the database is healthy and no recent deploys occurred, check for memory pressure on the application server (`process_resident_memory_bytes`).
7. Escalate to the platform team if unresolved within 15 minutes.

#### Alert: `RepoTopicsListHighLatency`

**Condition:** `histogram_quantile(0.99, rate(codeplane_repo_topics_list_duration_seconds_bucket[5m])) > 0.5`

**Severity:** `warning`

**Runbook:**
1. Check if the latency spike correlates with increased request volume (`codeplane_repo_topics_list_total`). If so, determine if it is a traffic spike or a DDoS.
2. Inspect database query performance: check for missing indexes on the `repositories` table or lock contention.
3. Check the connection pool: saturated pools cause queuing delays.
4. Review the `codeplane_repo_topics_list_in_flight` gauge — a high value suggests backpressure.
5. If the issue is isolated to specific owners/repos, check whether those repos have unusually large data or are involved in concurrent write operations.
6. Consider scaling the database read replicas if the issue is persistent load-related.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Cause | Impact | Recovery |
|------------|-------------|-------|--------|----------|
| Missing `owner` parameter | 400 | Client sends empty or whitespace owner | Client-side bug, no server impact | Fix client, validate input |
| Missing `repo` parameter | 400 | Client sends empty or whitespace repo name | Client-side bug, no server impact | Fix client, validate input |
| Repository not found | 404 | Repo does not exist or was deleted | Normal operation | No action needed |
| Private repo, unauthorized viewer | 404 | Viewer lacks access | Normal operation | User needs to authenticate or request access |
| Database connection failure | 500 | DB is down or unreachable | All topic list requests fail | Restore DB connectivity, check connection pool |
| Database query timeout | 500 | Slow query or lock contention | Elevated latency, some requests fail | Investigate DB performance, check indexes |
| Unexpected exception in handler | 500 | Code bug | Requests fail | Deploy fix, check error logs |
| Rate limit exceeded | 429 | Too many requests from client | Individual client throttled | Client should back off and retry with exponential backoff |

## Verification

### API Integration Tests

#### Happy Path

- [ ] **`GET /api/repos/:owner/:repo/topics` returns topics for a public repo (unauthenticated):** Create a public repo with topics `["alpha", "beta"]`. Send an unauthenticated GET. Assert `200 OK`, body `{ "topics": ["alpha", "beta"] }`, `Content-Type: application/json`.
- [ ] **`GET /api/repos/:owner/:repo/topics` returns topics for a public repo (authenticated):** Same as above but with a valid PAT. Assert `200 OK` with same topics.
- [ ] **`GET /api/repos/:owner/:repo/topics` returns empty array for repo with no topics:** Create a repo without setting topics. Assert `200 OK`, body `{ "topics": [] }`.
- [ ] **`GET /api/repos/:owner/:repo/topics` returns topics for a private repo (authorized viewer):** Create a private repo with topics. Authenticate as the owner. Assert `200 OK` with topics.
- [ ] **`GET /api/repos/:owner/:repo/topics` reflects topics set via PUT:** Create a repo, PUT `{ "topics": ["new-topic"] }`, then GET topics. Assert the GET returns `["new-topic"]`.
- [ ] **`GET /api/repos/:owner/:repo/topics` reflects cleared topics:** Create a repo with topics, PUT `{ "topics": [] }`, then GET topics. Assert the GET returns `[]`.
- [ ] **`GET /api/repos/:owner/:repo/topics` returns topics for an archived repo:** Archive a repo that has topics. GET topics. Assert `200 OK` with topics intact.
- [ ] **`GET /api/repos/:owner/:repo/topics` returns topics for a forked repo independently:** Fork a repo that has topics. Set different topics on the fork. Assert the fork returns its own topics, not the parent's.

#### Maximum Input/Boundary Tests

- [ ] **Repo with maximum number of topics (20 topics) returns all topics:** Set 20 valid topics on a repo. GET topics. Assert all 20 are returned.
- [ ] **Repo with topics at maximum character length (35 chars each):** Set topics like `["a" + "b".repeat(34)]` (35-char topic). GET topics. Assert the full 35-char topic is returned correctly.
- [ ] **Owner name at maximum length (39 chars) resolves correctly:** Create/use an owner with 39-char name. Set topics. GET topics. Assert `200 OK`.
- [ ] **Repo name at maximum length (100 chars) resolves correctly:** Create/use a repo with 100-char name. Set topics. GET topics. Assert `200 OK`.

#### Error Cases

- [ ] **`GET /api/repos/:owner/:repo/topics` returns 404 for non-existent repo:** Assert `404` with error body.
- [ ] **`GET /api/repos/:owner/:repo/topics` returns 404 for private repo (unauthenticated):** Create private repo. Send unauthenticated GET. Assert `404`.
- [ ] **`GET /api/repos/:owner/:repo/topics` returns 404 for private repo (authenticated, no access):** Create private repo owned by user A. Authenticate as user B (with no collaborator access). Assert `404`.
- [ ] **`GET /api/repos/:owner/:repo/topics` returns 400 for empty owner:** Send `GET /api/repos/%20/myrepo/topics`. Assert `400`.
- [ ] **`GET /api/repos/:owner/:repo/topics` returns 400 for empty repo name:** Send `GET /api/repos/alice/%20/topics`. Assert `400`.

#### Consistency Tests

- [ ] **Topics list is consistent with repo view:** GET `/api/repos/:owner/:repo` and GET `/api/repos/:owner/:repo/topics` for the same repo. Assert the `topics` arrays are identical.
- [ ] **Topics list is immediately consistent after update:** PUT new topics, then immediately GET topics. Assert the GET reflects the PUT.

### CLI E2E Tests

- [ ] **`codeplane repo topic list` returns topics (JSON mode):** Create a repo, set topics via API, run `codeplane repo topic list -R owner/repo --json`. Assert JSON output matches `{ "topics": [...] }`.
- [ ] **`codeplane repo topic list` returns topics (human-readable mode):** Same setup, run without `--json`. Assert each topic appears on its own line in stdout.
- [ ] **`codeplane repo topic list` returns empty list gracefully:** Create a repo with no topics. Run `codeplane repo topic list -R owner/repo`. Assert exit code 0 and appropriate "No topics" output.
- [ ] **`codeplane repo topic list` returns empty JSON for no topics:** Run with `--json`. Assert `{ "topics": [] }`.
- [ ] **`codeplane repo topic list` errors on non-existent repo:** Run `codeplane repo topic list -R nonexistent/repo`. Assert non-zero exit code and error message on stderr.
- [ ] **`codeplane repo topic list` errors without repo context:** Run `codeplane repo topic list` in a directory with no jj/git context. Assert non-zero exit code and clear error.
- [ ] **`codeplane repo topic list -R` flag works:** Assert the `-R` short flag resolves the repo correctly.
- [ ] **`codeplane repo topic list --repo` flag works:** Assert the `--repo` long flag resolves the repo correctly.

### Playwright (Web UI) E2E Tests

- [ ] **Repository overview page displays topics as chips:** Navigate to `/:owner/:repo` for a repo with topics. Assert topic chip elements are visible and contain the correct text.
- [ ] **Repository overview page shows no topics area when repo has no topics:** Navigate to a repo with no topics. Assert no topic chip elements are rendered (no empty container either).
- [ ] **Clicking a topic chip navigates to search:** Click a topic chip. Assert the browser navigates to a search URL filtered by that topic.
- [ ] **Sidebar shows topics:** Assert the sidebar "About" section contains the same topics as the overview area.
- [ ] **Topics render correctly for archived repos:** Navigate to an archived repo with topics. Assert topics are visible.

### Concurrency and Consistency Tests

- [ ] **Concurrent reads return consistent results:** Send 10 simultaneous GET requests for the same repo's topics. Assert all return the same `200 OK` response with identical topics.
- [ ] **Read-after-write consistency:** PUT topics then immediately GET. Repeat 5 times. Assert every GET reflects the preceding PUT.
