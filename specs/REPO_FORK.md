# REPO_FORK

Specification for REPO_FORK.

## High-Level User POV

When you discover a repository on Codeplane that you want to contribute to, experiment with, or build upon independently, you can fork it. Forking creates your own personal copy of the repository under your namespace (or an organization you belong to), preserving the source repository's contents, visibility settings, and default bookmark. From that moment forward, the fork is a fully independent repository that you own and control, while retaining a visible link back to the original so you and others always know where it came from.

Forking is the natural starting point for contributing changes back to a project. After forking, you work in your own copy, make changes using jj-native workflows, and then submit a landing request back to the original repository when your work is ready. This keeps the original repository clean while enabling broad community participation.

The fork relationship is visible everywhere you encounter the repository — on the repository overview page, in CLI output, in search results, and in repository listings. Source repositories display their fork count, giving maintainers and visitors a sense of community adoption. Fork owners see a clear indication that their repository is a fork, including a link to navigate to the upstream source.

Forking is available from the CLI, the web UI, the TUI, and programmatically via the API. The experience is designed to be fast and low-friction: you can fork with a single command or button click, optionally choosing a custom name or target organization. The fork is created immediately and you can begin working in it right away.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user can create a fork of any repository they have read access to
- [ ] The fork is created as an independent repository under the user's namespace by default
- [ ] The fork can optionally be created under an organization the user is a member of
- [ ] The fork retains a permanent, queryable link to the source repository
- [ ] The source repository's `num_forks` counter is incremented upon successful fork creation
- [ ] The fork relationship is visible in repository detail views across all clients (API, CLI, TUI, Web)
- [ ] The `GET /api/repos/:owner/:repo/forks` endpoint lists all forks of a given repository with pagination

### Fork Creation Constraints

- [ ] The fork name defaults to the source repository's name if not explicitly provided
- [ ] The fork name can be overridden via the `name` field in the request body
- [ ] The fork inherits the source repository's visibility (public/private), default bookmark, and description
- [ ] The fork description can be overridden via the `description` field in the request body
- [ ] The request body is entirely optional — an empty body or no body at all is valid
- [ ] Invalid JSON in the request body returns HTTP 400 with `"invalid request body"`

### Name Validation

- [ ] Fork name must not be empty (returns `missing_field` validation error)
- [ ] Fork name must be at most 100 characters (returns `invalid` validation error)
- [ ] Fork name must match the pattern `^[a-zA-Z0-9][a-zA-Z0-9._-]*$` — must start with alphanumeric, may contain letters, digits, dots, underscores, and hyphens
- [ ] Fork name must not end with `.git` (case-insensitive)
- [ ] Fork name must not be a reserved name: `agent`, `bookmarks`, `changes`, `commits`, `contributors`, `issues`, `labels`, `landings`, `milestones`, `operations`, `pulls`, `settings`, `stargazers`, `watchers`, `workflows`

### Duplicate and Conflict Handling

- [ ] If the authenticated user already owns a repository with the same name (case-insensitive), the API returns HTTP 409 with `"repository '<name>' already exists"`
- [ ] A user may fork the same source repository multiple times if each fork has a distinct name
- [ ] Forking a fork is allowed — the resulting repository's `fork_id` points to the immediate parent, not the root ancestor

### Error Cases

- [ ] Unauthenticated requests return HTTP 401 `"authentication required"`
- [ ] Forking a nonexistent repository returns HTTP 404
- [ ] Forking a private repository the user cannot read returns HTTP 404 (do not reveal existence)
- [ ] Forking into an organization the user is not a member of returns HTTP 403 or HTTP 404

### Response Shape

- [ ] Successful fork creation returns HTTP 202 (Accepted)
- [ ] The response body is a standard `RepoResponse` object with `is_fork: true` and `fork_id` set to the source repository's ID
- [ ] The response includes `full_name`, `owner`, `name`, `clone_url`, `created_at`, and all standard repo fields

## Design

### API Shape

#### Create a Fork

```
POST /api/repos/:owner/:repo/forks
```

**Authentication:** Required (session cookie, PAT, or OAuth2 token)

**Path Parameters:**
| Parameter | Type   | Description                        |
|-----------|--------|------------------------------------|  
| `owner`   | string | Owner of the source repository     |
| `repo`    | string | Name of the source repository      |

**Request Body (optional JSON):**
```json
{
  "name": "my-custom-fork-name",
  "description": "Optional description override",
  "organization": "my-org"
}
```

| Field          | Type   | Required | Default                      | Constraints           |
|----------------|--------|----------|------------------------------|-----------------------|
| `name`         | string | No       | Source repository name        | 1–100 chars, `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`, not ending in `.git`, not reserved |
| `description`  | string | No       | Source repository description | Free text             |
| `organization` | string | No       | User's own namespace          | Must be an org the user belongs to |

**Success Response:** `202 Accepted`
```json
{
  "id": 42,
  "owner": "alice",
  "name": "my-custom-fork-name",
  "full_name": "alice/my-custom-fork-name",
  "description": "A description",
  "private": false,
  "is_public": true,
  "default_bookmark": "main",
  "topics": [],
  "is_archived": false,
  "is_fork": true,
  "fork_id": 7,
  "num_stars": 0,
  "num_forks": 0,
  "num_watches": 0,
  "num_issues": 0,
  "clone_url": "git@ssh.codeplane.app:alice/my-custom-fork-name.git",
  "created_at": "2026-03-21T12:00:00.000Z",
  "updated_at": "2026-03-21T12:00:00.000Z"
}
```

**Error Responses:**

| Status | Condition                                      |
|--------|-------------------------------------------------|
| 400    | Invalid request body / missing owner or repo    |
| 401    | Not authenticated                               |
| 404    | Source repo not found or not readable            |
| 409    | Repository with that name already exists         |
| 422    | Name validation failed                           |

#### List Forks of a Repository

```
GET /api/repos/:owner/:repo/forks?page=1&per_page=30
```

**Authentication:** Optional (public repos accessible without auth)

**Query Parameters:**
| Parameter  | Type   | Default | Constraints     |
|------------|--------|---------|------------------|
| `page`     | number | 1       | ≥ 1             |
| `per_page` | number | 30      | 1–100           |

**Success Response:** `200 OK`
```json
[
  { /* RepoResponse */ },
  { /* RepoResponse */ }
]
```

*Note: The `listRepoForks` database function exists but is not currently mounted as a server route. This specification requires it to be exposed.*

### SDK Shape

The `RepoService` class in `@codeplane/sdk` exposes:

- `forkRepo(actor, owner, repo, nameOverride, descriptionOverride)` — creates a fork in the actor's namespace
- `listRepoForks(owner, repo, page, perPage)` — lists forks (to be implemented at service layer)
- `countRepoForks(repoId)` — returns the count of forks (DB function exists)

### CLI Command

```
codeplane repo fork OWNER/REPO [options]
```

**Arguments:**
| Argument      | Description                              |
|---------------|------------------------------------------|
| `OWNER/REPO`  | Source repository in owner/repo format   |

**Options:**
| Flag               | Short   | Description                                   |
|--------------------|---------|-----------------------------------------------|
| `--name <name>`    |         | Custom name for the fork                       |
| `--organization`   | `--org` | Fork into the specified organization           |

**Structured output (`--json`):** Returns the full `RepoResponse` JSON object with `fork: true` (mapped from `is_fork`) and `parent: { full_name }` enrichment.

**Human-readable output:**
```
Forked repository alice/my-fork
```

**Error output:** Prints the API error message to stderr and exits with a non-zero code.

### Web UI Design

#### Fork Button on Repository Overview

- A "Fork" button is displayed on every repository overview page, in the repository action bar alongside Star and Watch
- The button displays the current fork count (from `num_forks`)
- Clicking "Fork" opens a fork dialog/modal

#### Fork Dialog

- **Repository name field:** Pre-populated with the source repository name, editable
- **Description field:** Pre-populated with the source description, editable
- **Namespace selector:** Dropdown listing the user's own namespace plus all organizations the user is a member of
- **Create Fork button:** Submits the fork. On success, navigates to the newly created fork's overview page
- **Validation:** Real-time name validation showing errors for invalid characters, reserved names, length violations, or duplicate names in the selected namespace

#### Fork Indicator on Repository Pages

- Forked repositories display a "Forked from owner/source-repo" notice below the repository name in the header
- The source repository name is a clickable link navigating to the source
- If the source repository has been deleted, the notice reads "Forked from a deleted repository"

#### Forks Tab / Forks List

- The repository overview or sidebar includes a "Forks" link/section showing the number of forks
- Clicking it navigates to a paginated list of all forks of this repository
- Each fork entry shows: owner avatar, full name, description snippet, star count, and creation date

### TUI UI

- A fork action is accessible from the repository detail screen via a keyboard shortcut or action menu
- Fork creation prompts for optional name and organization selection inline
- After fork creation, navigates to the new fork's detail screen
- The repository detail screen shows fork relationship metadata (parent link, fork indicator)

### Documentation

The following end-user documentation should be written:

- **"Forking a Repository" guide:** Step-by-step instructions for forking via Web UI, CLI, and API, including naming options and organization targeting
- **"Understanding Fork Relationships" explainer:** How Codeplane tracks fork parentage, what is inherited vs. independent, and how forks relate to landing requests
- **CLI reference entry for `repo fork`:** Full synopsis, options, examples, and error explanations
- **API reference entry for `POST /api/repos/:owner/:repo/forks`:** Request/response schema, error codes, and curl examples
- **API reference entry for `GET /api/repos/:owner/:repo/forks`:** Pagination, response schema, curl examples

## Permissions & Security

### Authorization Matrix

| Actor                    | Can Fork? | Notes                                              |
|--------------------------|-----------|-----------------------------------------------------|
| Authenticated user       | Yes       | If they have read access to the source repository    |
| Unauthenticated visitor  | No        | Returns 401                                          |
| Org member (any role)    | Yes       | Can fork into their own namespace                    |
| Org admin/owner          | Yes       | Can fork into the organization's namespace           |
| Org member (non-admin)   | Yes       | Can fork into the org if org settings allow it       |
| User with no read access | No        | Returns 404 (do not leak repository existence)       |
| Blocked/banned user      | No        | Returns 403                                          |

### Fork-Into-Organization Authorization

- The user must be a confirmed member of the target organization
- If the user is not a member, the API should return 403 `"permission denied"` or 404

### Rate Limiting

- Fork creation should be rate-limited to **10 forks per user per hour** to prevent abuse
- This limit is separate from general API rate limits
- Exceeding the limit returns HTTP 429 with a `Retry-After` header

### Data Privacy

- Forking a public repository is always allowed for any authenticated user
- Forking a private repository is only allowed if the user has explicit read permission (collaborator, team member, or org member with repo access)
- Private forks remain private — the fork inherits the source's visibility and does not automatically become public
- No PII is transferred during fork creation beyond what is already present in the repository metadata (owner name, description)

## Telemetry & Product Analytics

### Business Events

| Event Name          | Trigger                          | Properties                                                                                                    |
|---------------------|----------------------------------|---------------------------------------------------------------------------------------------------------------|
| `RepoForked`        | Successful fork creation         | `source_repo_id`, `source_repo_full_name`, `fork_repo_id`, `fork_repo_full_name`, `fork_owner_type` (user/org), `name_was_customized` (bool), `description_was_customized` (bool), `source_is_public` (bool), `actor_id` |
| `RepoForkFailed`    | Fork creation failed             | `source_repo_full_name`, `error_code` (401/404/409/422), `error_reason`, `actor_id`                          |
| `RepoForkListViewed`| User views the forks list        | `repo_id`, `repo_full_name`, `fork_count`, `page`, `actor_id`                                                |

### Funnel Metrics

| Metric                                | Description                                                    |
|---------------------------------------|----------------------------------------------------------------|
| Fork creation success rate            | `RepoForked` / (`RepoForked` + `RepoForkFailed`)              |
| Fork → landing request conversion     | % of forks that produce at least one landing request to the source within 30 days |
| Fork → active development rate        | % of forks with at least one commit/change within 7 days       |
| Time from fork to first landing request | Median duration                                                |
| Org fork ratio                        | % of forks created under organizations vs. personal namespaces |
| Duplicate name collision rate         | % of fork attempts that fail with 409                          |

### Success Indicators

- Fork creation latency p95 < 2 seconds
- Fork-to-landing-request conversion rate increasing month-over-month
- Less than 1% of fork attempts result in 5xx errors

## Observability

### Logging Requirements

| Log Event                   | Level | Structured Context                                                                                                        |
|-----------------------------|-------|---------------------------------------------------------------------------------------------------------------------------|
| Fork creation started       | INFO  | `actor_id`, `source_owner`, `source_repo`, `fork_name`, `target_namespace`, `target_namespace_type`                       |
| Fork creation succeeded     | INFO  | `actor_id`, `source_repo_id`, `fork_repo_id`, `fork_full_name`, `duration_ms`                                            |
| Fork creation failed        | WARN  | `actor_id`, `source_owner`, `source_repo`, `fork_name`, `error_type`, `error_message`, `http_status`                     |
| Fork name validation failed | DEBUG | `actor_id`, `attempted_name`, `validation_code`                                                                          |
| Fork unique violation       | WARN  | `actor_id`, `fork_name`, `target_namespace`                                                                               |
| Source repo not found       | DEBUG | `actor_id`, `source_owner`, `source_repo`                                                                                |
| Fork count increment failed | ERROR | `source_repo_id`, `error_message` — this indicates data consistency risk                                                  |

### Prometheus Metrics

| Metric                                         | Type      | Labels                                      | Description                                      |
|------------------------------------------------|-----------|----------------------------------------------|--------------------------------------------------|
| `codeplane_repo_fork_total`                    | Counter   | `status` (success/failure), `namespace_type` (user/org) | Total fork creation attempts                     |
| `codeplane_repo_fork_duration_seconds`         | Histogram | `status`                                     | Fork creation latency                            |
| `codeplane_repo_fork_errors_total`             | Counter   | `error_type` (auth/not_found/conflict/validation/internal) | Fork creation errors by type                     |
| `codeplane_repo_fork_name_collisions_total`    | Counter   |                                              | 409 conflicts from duplicate names               |
| `codeplane_repo_forks_list_total`              | Counter   | `status`                                     | Fork list endpoint requests                      |

### Alerts

#### Alert: High Fork Creation Error Rate

**Condition:** `rate(codeplane_repo_fork_errors_total{error_type="internal"}[5m]) > 0.1`

**Severity:** P2

**Runbook:**
1. Check `codeplane_repo_fork_errors_total` by `error_type` to identify the dominant failure mode.
2. If `error_type=internal`, check server logs for the `Fork creation failed` entries and look for database connection errors or constraint violations.
3. Verify database connectivity and check the `repositories` table for locking or deadlock issues.
4. Check if the `createForkRepo` SQL query is timing out — look at database slow query logs.
5. If the issue is transient, confirm it self-resolves. If persistent, check for schema drift or migration issues.
6. Escalate to the database on-call if the issue is at the persistence layer.

#### Alert: Fork Count Consistency Drift

**Condition:** `increase(codeplane_repo_fork_errors_total{error_type="internal"}[1h]) > 0` where logs contain `"Fork count increment failed"`

**Severity:** P3

**Runbook:**
1. This alert indicates that a fork was created but the source repository's `num_forks` counter was not incremented.
2. Query the database: `SELECT id, num_forks FROM repositories WHERE id = <source_repo_id>` and compare with `SELECT COUNT(*) FROM repositories WHERE fork_id = <source_repo_id>`.
3. If there is a mismatch, run a corrective update: `UPDATE repositories SET num_forks = (SELECT COUNT(*) FROM repositories WHERE fork_id = id) WHERE id = <source_repo_id>`.
4. Investigate why the increment failed — check for connection pool exhaustion or transaction rollback patterns.
5. Consider adding the fork count increment to the same transaction as the fork creation to prevent future drift.

#### Alert: Fork Creation Latency Spike

**Condition:** `histogram_quantile(0.95, rate(codeplane_repo_fork_duration_seconds_bucket[5m])) > 5`

**Severity:** P3

**Runbook:**
1. Check database query latency for `createForkRepo` and `incrementRepoForks` queries.
2. Look for table lock contention on the `repositories` table — particularly if a popular repository is being forked heavily.
3. Check if there is a surge in fork requests (possible abuse) and verify rate limiting is functioning.
4. If the latency is purely database-side, check connection pool utilization and consider scaling read replicas.
5. If latency is at the application layer, check server resource utilization (CPU, memory).

### Error Cases and Failure Modes

| Failure Mode                           | Impact                                    | Detection                                    | Mitigation                                          |
|----------------------------------------|-------------------------------------------|----------------------------------------------|-----------------------------------------------------|
| Database connection failure            | Fork creation returns 500                 | `codeplane_repo_fork_errors_total{internal}` | Retry with backoff; connection pool health check     |
| Unique constraint violation race       | Rare 500 instead of clean 409             | Application logs                             | `isUniqueViolation` catch handles this               |
| `num_forks` increment fails            | Counter drift; cosmetic inaccuracy        | Log-level ERROR alert                        | Background reconciliation job                        |
| Source repo deleted mid-fork           | FK violation or 404                       | Application logs                             | Transaction isolation handles this                   |
| Rate limit exhaustion                  | Legitimate users blocked                  | 429 response count                           | Adjust rate limit; add per-repo exemptions           |
| Malformed JSON body                    | 400 returned                              | Normal; no alert needed                      | Client-side validation                               |

## Verification

### API Integration Tests

#### Fork Creation — Happy Path

- [ ] **Fork with default name:** `POST /api/repos/alice/myrepo/forks` with empty body → 202, response has `is_fork: true`, `name` matches source name, `fork_id` set
- [ ] **Fork with custom name:** `POST` with `{"name": "custom-name"}` → 202, response `name` is `"custom-name"`
- [ ] **Fork with custom description:** `POST` with `{"description": "My fork"}` → 202, response `description` is `"My fork"`
- [ ] **Fork with both name and description:** `POST` with `{"name": "x", "description": "y"}` → 202, both overridden
- [ ] **Fork into organization:** `POST` with `{"organization": "my-org"}` → 202, response `owner` is `"my-org"`
- [ ] **Fork inherits visibility:** Fork a public repo → fork `is_public: true`. Fork a private repo (with access) → fork `is_public: false` (i.e., `private: true`)
- [ ] **Fork inherits default bookmark:** Source has `default_bookmark: "trunk"` → fork has `default_bookmark: "trunk"`
- [ ] **Source `num_forks` incremented:** After forking, `GET /api/repos/alice/myrepo` shows `num_forks` increased by 1
- [ ] **Fork `num_forks` starts at 0:** Newly created fork has `num_forks: 0`
- [ ] **Fork response has `clone_url`:** The `clone_url` in the response points to the fork, not the source

#### Fork Creation — Name Validation

- [ ] **Empty name with no body:** Defaults to source name → 202
- [ ] **Name with 1 character (minimum valid):** `{"name": "a"}` → 202
- [ ] **Name with exactly 100 characters (maximum valid):** `{"name": "<100-char string>"}` → 202
- [ ] **Name with 101 characters (exceeds max):** → 422 validation error
- [ ] **Name starting with a dot:** `{"name": ".foo"}` → 422
- [ ] **Name starting with a hyphen:** `{"name": "-foo"}` → 422
- [ ] **Name starting with underscore:** `{"name": "_foo"}` → 422
- [ ] **Name containing spaces:** `{"name": "my repo"}` → 422
- [ ] **Name containing special characters (`@#$%`):** → 422
- [ ] **Name with valid characters (dots, underscores, hyphens):** `{"name": "my-repo_v2.0"}` → 202
- [ ] **Name ending in `.git`:** `{"name": "foo.git"}` → 422
- [ ] **Name ending in `.GIT` (case-insensitive):** `{"name": "foo.GIT"}` → 422
- [ ] **Reserved name `issues`:** `{"name": "issues"}` → 422
- [ ] **Reserved name `settings`:** `{"name": "settings"}` → 422
- [ ] **Reserved name `workflows`:** `{"name": "workflows"}` → 422
- [ ] **All 15 reserved names rejected:** Test each of: agent, bookmarks, changes, commits, contributors, issues, labels, landings, milestones, operations, pulls, settings, stargazers, watchers, workflows

#### Fork Creation — Error Cases

- [ ] **Unauthenticated request:** → 401 `"authentication required"`
- [ ] **Nonexistent source repository:** → 404
- [ ] **Private repo without read access:** → 404 (no existence leak)
- [ ] **Duplicate fork name in user namespace:** Fork twice with same name → first 202, second 409 `"repository 'name' already exists"`
- [ ] **Duplicate fork name in org namespace:** → 409
- [ ] **Invalid JSON body:** `POST` with body `{invalid` → 400 `"invalid request body"`
- [ ] **Missing owner path param:** (malformed URL) → 400 `"owner is required"`
- [ ] **Missing repo path param:** (malformed URL) → 400 `"repository name is required"`
- [ ] **Fork into nonexistent organization:** → 404 or 403
- [ ] **Fork into org user is not a member of:** → 403

#### Fork Listing

- [ ] **List forks of repo with no forks:** `GET /api/repos/alice/myrepo/forks` → 200, empty array
- [ ] **List forks of repo with forks:** → 200, array of `RepoResponse` objects, each with `is_fork: true`
- [ ] **Pagination page 1:** `?page=1&per_page=2` with 3 forks → returns 2 results
- [ ] **Pagination page 2:** `?page=2&per_page=2` with 3 forks → returns 1 result
- [ ] **List forks of nonexistent repo:** → 404
- [ ] **Forks are ordered by creation date descending:** First result is the most recently created fork

#### Fork Relationship Queries

- [ ] **View fork shows parent info:** `GET /api/repos/alice/my-fork` → response includes `is_fork: true` and `fork_id` pointing to source
- [ ] **View source shows fork count:** `GET /api/repos/alice/myrepo` → response `num_forks` reflects actual count
- [ ] **Fork of a fork:** Fork repo A to get B, fork B to get C → C's `fork_id` points to B, not A

### CLI E2E Tests

- [ ] **`codeplane repo fork OWNER/REPO`:** Creates fork with default name, exits 0, prints confirmation message
- [ ] **`codeplane repo fork OWNER/REPO --name custom`:** Creates fork with custom name
- [ ] **`codeplane repo fork OWNER/REPO --org my-org`:** Creates fork in organization namespace
- [ ] **`codeplane repo fork OWNER/REPO --json`:** Returns structured JSON with `fork: true` and `parent.full_name`
- [ ] **`codeplane repo fork nonexistent/repo`:** Exits non-zero, prints error
- [ ] **`codeplane repo view` on fork (`--json`):** Shows `fork: true` and `parent` object
- [ ] **`codeplane repo fork` with duplicate name:** Exits non-zero, prints conflict error

### Web UI (Playwright) E2E Tests

- [ ] **Fork button visible on public repo:** Navigate to a public repo overview → "Fork" button is visible with fork count
- [ ] **Fork button not visible when unauthenticated:** Visit repo overview while logged out → Fork button is hidden or disabled
- [ ] **Fork dialog opens:** Click "Fork" → modal/dialog appears with pre-populated name and description
- [ ] **Fork dialog name validation:** Enter invalid name (e.g., spaces) → validation error displayed inline
- [ ] **Fork dialog namespace selector:** Dropdown shows user namespace and user's organizations
- [ ] **Successful fork via UI:** Fill dialog, click "Create Fork" → navigated to new fork page, "Forked from" banner visible
- [ ] **Fork indicator on forked repo page:** Navigate to a known fork → "Forked from owner/source" is displayed
- [ ] **Fork indicator links to source:** Click the source link → navigates to source repo
- [ ] **Fork count updates on source:** After forking, navigate to source repo → fork count badge incremented
- [ ] **Forks list page:** Navigate to forks list of a repo with forks → fork entries displayed with owner, name, description
- [ ] **Duplicate name error in UI:** Try to fork with a name that already exists → error message displayed in dialog without closing it

### TUI E2E Tests

- [ ] **Fork action from repo detail:** Navigate to repo detail → invoke fork action → fork created, navigates to fork detail
- [ ] **Fork with custom name in TUI:** Provide custom name when prompted → fork created with that name
- [ ] **Fork relationship displayed:** View a forked repo in TUI detail screen → fork indicator and parent info shown

### Cross-Cutting Tests

- [ ] **Rate limiting:** Make 11 fork requests in quick succession → 11th returns 429
- [ ] **Concurrent fork with same name:** Two simultaneous fork requests with the same target name → one succeeds (202), the other gets 409
- [ ] **Fork of archived repository:** Fork an archived repo → should succeed (forks are independent copies)
- [ ] **Fork does not copy stars/watches:** Fork a repo with 5 stars → fork has `num_stars: 0`, `num_watches: 0`
- [ ] **Fork does not copy issues:** Fork a repo with issues → fork has `num_issues: 0`
