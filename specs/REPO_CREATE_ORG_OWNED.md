# REPO_CREATE_ORG_OWNED

Specification for REPO_CREATE_ORG_OWNED.

## High-Level User POV

When you are part of an organization on Codeplane, you may need to create repositories that belong to the organization rather than to your personal account. Organization-owned repositories are the foundation of team collaboration — they live under the organization's namespace, are accessible to organization members based on team permissions, and are managed collectively rather than individually.

Creating an organization-owned repository follows the same general workflow as creating a personal repository, but you specify which organization should own it. From the CLI, you run `codeplane repo create my-project --org acme-corp` and the repository is created instantly under the `acme-corp` namespace. From the web UI, you select the target organization from an owner dropdown on the new repository page. From the TUI, an interactive form lets you choose the owning organization before submitting.

The repository appears at `acme-corp/my-project` in URLs, clone commands, and listings. It shows up in the organization's repository list and is immediately accessible to other organization members according to visibility rules. Public org repos are visible to anyone; private org repos are visible only to organization members.

Only organization owners can create repositories under their organization. This ensures that repository creation is a deliberate act of someone with organizational authority. If you are a regular member of the organization but not an owner, you will see a clear error explaining you do not have sufficient permissions.

Repository names within an organization must be unique (case-insensitively). If `acme-corp` already has a repository called `api-server`, trying to create another one with the same name — even with different capitalization — produces a conflict error. Names follow the same rules as personal repositories: they must start with a letter or number, can contain letters, numbers, dots, underscores, and hyphens, cannot end with `.git`, and cannot use reserved names like `settings`, `issues`, or `workflows`.

Once created, the organization-owned repository behaves identically to any other Codeplane repository. You can push code, create issues, open landing requests, run workflows, and configure settings. The only difference is that ownership belongs to the organization, and access is governed by organization membership and team assignments rather than personal repository collaborator lists.

## Acceptance Criteria

### Definition of Done

The feature is complete when an authenticated user who is an owner of an organization can create a new repository under that organization via API, CLI, TUI, and web UI. The created repository appears under the organization's namespace (`org/repo`), is immediately accessible in the organization's repository list, and is visible to other organization members according to the repository's visibility setting. All validation errors, permission denials, duplicate name conflicts, and unauthenticated requests are handled with clear, specific error responses. The behavior is consistent across all client surfaces.

### Functional Constraints

- [ ] The API endpoint `POST /api/orgs/:org/repos` requires authentication. Unauthenticated requests return `401` with `"authentication required"`.
- [ ] The `:org` path parameter is resolved case-insensitively via `lower_name`. `POST /api/orgs/AcmeCorp/repos` and `POST /api/orgs/acmecorp/repos` resolve to the same organization.
- [ ] If the `:org` path parameter is empty or whitespace-only, the endpoint returns `400 Bad Request` with `"organization name is required"`.
- [ ] If no organization matches the given name, the endpoint returns `404 Not Found` with `"organization not found"`.
- [ ] The authenticated user must be a member of the organization with the `"owner"` role. Users with the `"member"` role receive `403 Forbidden` with `"insufficient organization permissions"`.
- [ ] Users who are not members of the organization at all receive `403 Forbidden` with `"insufficient organization permissions"`.
- [ ] A valid `name` field is required in the request body. An empty, whitespace-only, or missing name returns `422` with a `"missing_field"` validation error on the `name` field, resource `"Repository"`.
- [ ] The `name` field is trimmed of leading and trailing whitespace before validation and storage.
- [ ] Repository names must match the regex `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`. Names violating this pattern return `422` with an `"invalid"` validation error on the `name` field.
- [ ] Repository names must not exceed 100 characters. Names exceeding this limit return `422` with `"invalid"` on `name`.
- [ ] Repository names must not end with `.git`. Names ending with `.git` return `422` with `"invalid"` on `name`.
- [ ] Repository names must not be one of the reserved names: `agent`, `bookmarks`, `changes`, `commits`, `contributors`, `issues`, `labels`, `landings`, `milestones`, `operations`, `pulls`, `settings`, `stargazers`, `watchers`, `workflows`. This check is case-insensitive. Reserved names return `422` with `"invalid"` on `name`.
- [ ] Repository names are case-insensitive for uniqueness within the organization. Creating `"API-Server"` when `"api-server"` already exists under the same org returns `409 Conflict` with `"repository 'API-Server' already exists"`.
- [ ] The `description` field is optional. If omitted or empty, it defaults to `""`.
- [ ] The `private` field is optional. If omitted, it defaults to `false` (the repository is public).
- [ ] When `private` is `true`, the repository's `is_public` flag is set to `false`.
- [ ] The `default_bookmark` field is optional. If omitted or empty, it defaults to `"main"`.
- [ ] The `default_bookmark` field is trimmed of leading and trailing whitespace.
- [ ] The `auto_init` field is accepted in the request body. (Note: the backend parameter is currently accepted but not yet used for repository initialization.)
- [ ] On success, the endpoint returns `201 Created` with the full repository response object.
- [ ] The response `owner` field is set to the organization name (as provided in the path, preserving the original casing of the stored organization name).
- [ ] The response `full_name` field is `"{org_name}/{repo_name}"`.
- [ ] The response `clone_url` field is `"git@{ssh_host}:{org_name}/{repo_name}.git"`.
- [ ] The newly created repository immediately appears in `GET /api/orgs/:org/repos` for organization members.
- [ ] The newly created repository is immediately accessible via `GET /api/repos/:org/:repo`.
- [ ] The endpoint accepts both session cookie and PAT-based authentication.
- [ ] The `Content-Type` header on the request must be `application/json`. Non-JSON content types are rejected.

### Boundary Constraints

- [ ] **`name`:** 1–100 characters. Must match `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`. Must not end with `.git`. Must not be a reserved name.
- [ ] **`description`:** 0 or more characters. No explicit server-side maximum is currently enforced, but descriptions should support Unicode (including emoji, CJK, and accented characters).
- [ ] **`private`:** Boolean (`true` or `false`). Defaults to `false`.
- [ ] **`default_bookmark`:** String. Defaults to `"main"` if empty or omitted.
- [ ] **`auto_init`:** Boolean. Accepted but not yet functionally used.
- [ ] **`:org` path parameter:** Case-insensitive organization name lookup.
- [ ] **Response `id`:** Positive integer (auto-generated).
- [ ] **Response timestamps:** ISO 8601 formatted datetime strings.

### Edge Cases

- [ ] Submitting an empty JSON body `{}` returns `422` with `"missing_field"` on `name`.
- [ ] Submitting `{ "name": "" }` returns `422` with `"missing_field"` on `name`.
- [ ] Submitting `{ "name": "   " }` (whitespace-only) returns `422` with `"missing_field"` on `name` after trimming.
- [ ] Submitting a name with leading/trailing whitespace like `"  my-repo  "` is trimmed to `"my-repo"` and accepted.
- [ ] Submitting a name that is exactly 100 characters succeeds.
- [ ] Submitting a name that is 101 characters returns `422` with `"invalid"` on `name`.
- [ ] Submitting `{ "name": "settings" }` (reserved name) returns `422`.
- [ ] Submitting `{ "name": "Settings" }` (reserved name, different case) returns `422`.
- [ ] Submitting `{ "name": "my-repo.git" }` (ends with `.git`) returns `422`.
- [ ] Submitting `{ "name": ".hidden" }` (starts with dot) returns `422` (fails regex).
- [ ] Submitting `{ "name": "-dashed" }` (starts with hyphen) returns `422` (fails regex).
- [ ] Submitting `{ "name": "my repo" }` (contains space) returns `422` (fails regex).
- [ ] Submitting `{ "name": "a" }` (single character) succeeds.
- [ ] Creating a repo with the same name as an existing repo in the same org but different casing returns `409`.
- [ ] Creating a repo with the same name as a repo in a *different* org succeeds (names are scoped per-owner).
- [ ] Creating two repos with different names in rapid succession under the same org both succeed.
- [ ] A description containing emoji `"🚀 Our service"` is stored and returned correctly.
- [ ] Submitting with only the `name` field succeeds with all defaults applied (`description: ""`, `private: false`, `default_bookmark: "main"`).
- [ ] Creating a private repo succeeds and the repo is not visible to unauthenticated users.
- [ ] An org member (non-owner) attempting to create a repo receives `403`.
- [ ] A user who is not a member of the org at all receives `403`.
- [ ] Creating a repo under a non-existent organization returns `404`.

## Design

### API Shape

#### `POST /api/orgs/:org/repos`

**Description:** Create a new repository owned by the specified organization.

**Authentication:** Required. Session cookie or PAT `Authorization` header.

**Path parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `org` | string | Yes | Organization name (case-insensitive lookup). |

**Request body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | — | Repository name. 1–100 chars, `[a-zA-Z0-9][a-zA-Z0-9._-]*`, not ending with `.git`, not a reserved name. |
| `description` | string | No | `""` | Repository description. Unicode allowed. |
| `private` | boolean | No | `false` | If `true`, the repository is private (visible only to org members). |
| `auto_init` | boolean | No | `false` | Initialize with a default bookmark. (Accepted but not yet functional.) |
| `default_bookmark` | string | No | `"main"` | Name of the default bookmark. |

**Example request:**

```json
{
  "name": "api-server",
  "description": "Core API service",
  "private": true,
  "default_bookmark": "main"
}
```

**Success response — `201 Created`:**

```json
{
  "id": 17,
  "owner": "acme-corp",
  "name": "api-server",
  "full_name": "acme-corp/api-server",
  "description": "Core API service",
  "private": true,
  "is_public": false,
  "default_bookmark": "main",
  "topics": [],
  "is_archived": false,
  "is_fork": false,
  "num_stars": 0,
  "num_forks": 0,
  "num_watches": 0,
  "num_issues": 0,
  "clone_url": "git@ssh.codeplane.app:acme-corp/api-server.git",
  "created_at": "2026-03-21T12:00:00.000Z",
  "updated_at": "2026-03-21T12:00:00.000Z"
}
```

**Error responses:**

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | Empty `:org` path parameter | `{ "message": "organization name is required" }` |
| `401 Unauthorized` | No valid session or token | `{ "message": "authentication required" }` |
| `403 Forbidden` | User is not an org owner | `{ "message": "insufficient organization permissions" }` |
| `404 Not Found` | Organization does not exist | `{ "message": "organization not found" }` |
| `409 Conflict` | Repository name already taken in this org | `{ "message": "repository 'api-server' already exists" }` |
| `422 Unprocessable Entity` | Name missing or empty | `{ "message": "validation failed", "errors": [{ "resource": "Repository", "field": "name", "code": "missing_field" }] }` |
| `422 Unprocessable Entity` | Name invalid (regex, length, reserved, .git suffix) | `{ "message": "validation failed", "errors": [{ "resource": "Repository", "field": "name", "code": "invalid" }] }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` with `Retry-After` header |

### SDK Shape

The SDK `RepoService` exposes:

```typescript
createOrgRepo(
  actor: RepoActor,
  orgName: string,
  name: string,
  description: string,
  isPublic: boolean,
  defaultBookmark: string,
  autoInit: boolean
): Promise<Result<RepoRow, APIError>>
```

Where `RepoActor` is:

```typescript
interface RepoActor {
  id: number;
  username: string;
  isAdmin: boolean;
}
```

The method:
1. Trims and validates `name` against the repo name rules.
2. Trims `orgName` and resolves the organization by `lower_name` (case-insensitive).
3. Returns `404` if the organization is not found.
4. Looks up the actor's organization membership.
5. Returns `403` if the actor is not a member, or is a member but not an owner.
6. Inserts the repository into the database with `org_id` (not `user_id`).
7. If a unique violation occurs (duplicate repo name within the org), returns `409`.
8. Returns the created `RepoRow` on success.

### CLI Command

#### `codeplane repo create <name> --org <org>`

**Description:** Create a new repository owned by an organization.

**Authentication:** Required. Uses the stored CLI session token or `CODEPLANE_TOKEN`.

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Repository name |

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--org` | string | — | Organization name. When provided, creates the repo under the specified organization instead of the authenticated user's account. |
| `--description` | string | `""` | Repository description |
| `--private` | boolean | `false` | Make repository private |

**Example usage:**

```bash
# Create a public org repo
codeplane repo create api-server --org acme-corp --description "Core API service"

# Create a private org repo
codeplane repo create internal-tools --org acme-corp --private

# With JSON output
codeplane repo create api-server --org acme-corp --json
```

**Output (human-readable, default):**

```
Repository "acme-corp/api-server" created successfully.

Owner:       acme-corp
Name:        api-server
Visibility:  public
Description: Core API service
Clone URL:   git@ssh.codeplane.app:acme-corp/api-server.git
```

**Output (JSON, with `--json`):**

The full `RepoResponse` JSON object as returned by the API.

**Error behavior:**

- Running without authentication → non-zero exit code, stderr: `Error: authentication required`
- Missing repo name → non-zero exit code, stderr: `Error: missing required argument "name"`
- Non-existent org → non-zero exit code, stderr: `Error: organization not found`
- Insufficient permissions → non-zero exit code, stderr: `Error: insufficient organization permissions`
- Duplicate name → non-zero exit code, stderr: `Error: repository 'api-server' already exists`

**Implementation note:** When `--org` is provided, the CLI sends `POST /api/orgs/:org/repos` instead of `POST /api/user/repos`. When `--org` is not provided, behavior falls through to user-owned repository creation (the existing `REPO_CREATE_USER_OWNED` flow).

### TUI UI

The TUI repository creation screen should support organization-owned repository creation:

```
┌── Create Repository ──────────────────────────────────────────┐
│                                                                │
│  Owner:        ( • ) alice (personal)                          │
│                (   ) acme-corp                                 │
│                (   ) my-other-org                              │
│                                                                │
│  Name:         [________________________]                      │
│                                                                │
│  Description:  [________________________]                      │
│                                                                │
│  Visibility:   ( • ) Public                                    │
│                (   ) Private                                   │
│                                                                │
│  [ Create ]  [ Cancel ]                                        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

- The **Owner** selector lists the authenticated user's personal account and all organizations where the user has the `owner` role.
- Organizations where the user is only a `member` (not an owner) are excluded from the dropdown.
- Selecting an organization switches the API target to `POST /api/orgs/:org/repos`.
- The **Name** field shows inline validation errors for empty names, invalid characters, and length violations.
- On success, the TUI navigates to the newly created repository's detail screen.
- On conflict (`409`), the TUI shows an inline error: `"Repository name already taken"`.
- On permission denied (`403`), the TUI shows: `"Insufficient organization permissions"`.
- Press Escape or select Cancel to return to the previous screen without creating.

### Web UI Design

The web UI new-repository page should support organization ownership selection:

**"New Repository" page** (accessible from `+` menu or `/new` route):

- **Owner dropdown** — a select/dropdown showing the user's personal account and all organizations where the user has the `owner` role. Defaults to the personal account. When an organization is selected, the form submits to `POST /api/orgs/:org/repos`.
- **Name** — single-line text input with live validation. Shows character count. Highlights errors inline (e.g., "Name is required", "Only letters, numbers, dots, underscores, and hyphens allowed", "Cannot end with .git", "This name is reserved").
- **Description** — optional textarea.
- **Visibility** — radio group: Public (default) or Private.
- A **"Create repository"** primary button that is disabled until the name field is valid.
- The URL preview shows the resulting path: `acme-corp/my-repo` updating live as the owner and name change.
- On `201` success, redirect to the new repository's overview page at `/:org/:repo`.
- On `409` conflict, show inline error below the name field: `"A repository with this name already exists in this organization."`.
- On `403` forbidden, show a toast: `"You do not have permission to create repositories in this organization."`.
- On `404` not found (org deleted between page load and submit), show a toast: `"Organization not found."`.
- On network error, show a toast: `"Failed to create repository. Please try again."`.

### Documentation

The following end-user documentation should be written:

1. **API Reference — Create Organization Repository:** Document `POST /api/orgs/:org/repos` with full request/response examples, all error codes, field constraints, authentication requirements, and notes on name uniqueness being case-insensitive and scoped per-organization.
2. **CLI Reference — `codeplane repo create --org`:** Document the `--org` flag with usage examples, output in both human-readable and JSON formats, and error behavior for missing names, auth failures, permission denials, non-existent orgs, and duplicate names.
3. **User Guide — Creating Organization Repositories:** A guide explaining how to create repositories under an organization, who has permission to do so, how visibility works for org repos, and how the repository appears in the organization's namespace. Include examples from CLI, web UI, and TUI.

## Permissions & Security

### Authorization Roles

| Role | Can Create Org Repo? | Notes |
|------|---------------------|-------|
| **Organization Owner** | ✅ Yes | Full access to create repos under their org |
| **Organization Member** | ❌ No | Returns `403 Forbidden` |
| **Non-member (authenticated)** | ❌ No | Returns `403 Forbidden` |
| **Anonymous (unauthenticated)** | ❌ No | Returns `401 Unauthorized` |
| **Instance Admin** | Per org membership | Admin status alone does not bypass org ownership checks; the user must also be an org owner |

### Rate Limiting

- The global rate limit of **120 requests per 60 seconds** per identity applies to this endpoint.
- Identity is determined by `user:{userId}` for authenticated users.
- Rate limit headers are returned on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- When exceeded, the endpoint returns `429 Too Many Requests` with a `Retry-After` header.
- No additional per-endpoint rate limit is currently required, but the endpoint should be monitored for abuse patterns (rapid org repo creation could be a signal).

### Data Privacy Constraints

- The response must not leak internal-only fields such as `shard_id`, `search_vector`, `user_id`, `org_id`, `workspace_idle_timeout_secs`, `workspace_persistence`, `workspace_dependencies`, `landing_queue_mode`, or `landing_queue_required_checks`.
- Organization membership details (other members, their roles) must not be exposed through this endpoint's responses or error messages.
- Error messages for `403` should be generic (`"insufficient organization permissions"`) rather than revealing whether the user is a non-member vs. a non-owner member.

## Telemetry & Product Analytics

### Key Business Events

1. **`OrgRepoCreated`** — Fired when an organization-owned repository is successfully created (`201`).

   Properties:
   - `repo_id` (number) — ID of the created repository
   - `repo_name` (string) — Name of the created repository
   - `org_id` (number) — ID of the owning organization
   - `org_name` (string) — Name of the owning organization
   - `actor_id` (number) — ID of the user who created the repo
   - `is_private` (boolean) — Whether the repository is private
   - `default_bookmark` (string) — The default bookmark name
   - `has_description` (boolean) — Whether a non-empty description was provided
   - `client` (string) — Source client: `"api"`, `"cli"`, `"tui"`, `"web"`
   - `timestamp` (ISO 8601 string) — Server-side creation time

2. **`OrgRepoCreateFailed`** — Fired when an organization-owned repository creation fails.

   Properties:
   - `org_name` (string) — Target organization name
   - `actor_id` (number | null) — ID of the requesting user (null if unauthenticated)
   - `error_code` (number) — HTTP status code (`401`, `403`, `404`, `409`, `422`)
   - `error_reason` (string) — High-level reason: `"unauthenticated"`, `"forbidden"`, `"org_not_found"`, `"name_conflict"`, `"validation_failed"`
   - `client` (string) — Source client
   - `timestamp` (ISO 8601 string)

### Funnel Metrics & Success Indicators

- **Org repo creation success rate:** Percentage of `POST /api/orgs/:org/repos` requests that return `201` vs. total requests. Target: >90% (most failures should be intentional validation rejections).
- **Org repo creation volume:** Count of `OrgRepoCreated` events per day/week. Indicates adoption of organization-scoped collaboration.
- **Permission denial rate:** Percentage of `403` responses. A high rate may indicate UX confusion about who can create org repos.
- **Name conflict rate:** Percentage of `409` responses. A spike may indicate naming convention issues or accidental duplicates.
- **Client distribution:** Breakdown of `OrgRepoCreated` by `client` property. Helps prioritize client investment.
- **Time-to-first-org-repo:** Time elapsed from org creation (`OrgCreated` event) to first `OrgRepoCreated` in that org. Measures activation speed.

## Observability

### Logging Requirements

| Event | Log Level | Structured Context |
|-------|-----------|-------------------|
| Org repo creation request received | `info` | `{ "action": "org_repo_create", "org": orgName, "repo": name, "actor_id": actor.id }` |
| Org repo created successfully | `info` | `{ "action": "org_repo_created", "org": orgName, "repo": name, "repo_id": repo.id, "actor_id": actor.id, "is_private": !isPublic }` |
| Name validation failed | `warn` | `{ "action": "org_repo_create_validation_failed", "org": orgName, "repo": name, "reason": "invalid_name" }` |
| Organization not found | `warn` | `{ "action": "org_repo_create_org_not_found", "org": orgName, "actor_id": actor.id }` |
| Permission denied (not owner) | `warn` | `{ "action": "org_repo_create_forbidden", "org": orgName, "actor_id": actor.id, "member_role": member?.role }` |
| Duplicate name conflict | `info` | `{ "action": "org_repo_create_conflict", "org": orgName, "repo": name, "actor_id": actor.id }` |
| Database error during creation | `error` | `{ "action": "org_repo_create_db_error", "org": orgName, "repo": name, "error": err.message }` |
| Unauthenticated request | `warn` | `{ "action": "org_repo_create_unauthenticated" }` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_repo_creates_total` | Counter | `status` (`success`, `validation_error`, `conflict`, `forbidden`, `not_found`, `unauthenticated`, `internal_error`) | Total org repo creation attempts by outcome |
| `codeplane_org_repo_create_duration_seconds` | Histogram | — | Latency of the `POST /api/orgs/:org/repos` handler (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_org_repos_created_total` | Counter | `org` | Running total of repos created per organization |

### Alerts

#### Alert: `OrgRepoCreateErrorRateHigh`

**Condition:** `rate(codeplane_org_repo_creates_total{status="internal_error"}[5m]) > 0.05`

**Severity:** Critical

**Runbook:**
1. Check server logs for `action: "org_repo_create_db_error"` entries in the last 5 minutes.
2. Verify database connectivity: run a health check query against the primary database.
3. Check if the `repositories` table has hit disk space limits or index corruption.
4. Check for recent migrations or schema changes that may have altered the `repositories` table.
5. If the database is healthy, inspect the specific error messages in logs. Common causes: unique constraint index corruption, connection pool exhaustion, or PGLite file locking in daemon mode.
6. Restart the server process if connection pool exhaustion is suspected.
7. Escalate to the database on-call if the issue persists beyond 10 minutes.

#### Alert: `OrgRepoCreateLatencyHigh`

**Condition:** `histogram_quantile(0.95, rate(codeplane_org_repo_create_duration_seconds_bucket[5m])) > 2.0`

**Severity:** Warning

**Runbook:**
1. Check if the p95 latency spike correlates with a general database latency increase (check `codeplane_db_query_duration_seconds`).
2. Inspect active database connections and long-running queries.
3. Check if org membership lookup queries are slow — the `createOrgRepo` path does an org lookup + membership check + insert, so any of these could be the bottleneck.
4. Verify database connection pool utilization.
5. Check if there is a concurrent high volume of repository operations (bulk creation, migration).
6. If isolated to this endpoint, review recent code changes to the `createOrgRepo` service method.

#### Alert: `OrgRepoCreatePermissionDenialSpike`

**Condition:** `rate(codeplane_org_repo_creates_total{status="forbidden"}[15m]) > 0.5`

**Severity:** Warning

**Runbook:**
1. Check logs for `action: "org_repo_create_forbidden"` to identify which users and organizations are generating denials.
2. Determine if a single user or bot is repeatedly attempting unauthorized creation (potential abuse).
3. If a single actor, check if their membership role was recently changed or if they were removed from the org.
4. If many different actors, check if there is a UX issue causing members to attempt creation when only owners can.
5. Consider whether the permission model should be surfaced more clearly in the UI (e.g., hiding the create button for non-owners).

### Error Cases and Failure Modes

| Error | HTTP Status | Likely Cause | Recovery |
|-------|-------------|-------------|----------|
| `authentication required` | 401 | Missing or expired session/token | User must re-authenticate |
| `organization name is required` | 400 | Empty `:org` path param | Client must provide org name |
| `organization not found` | 404 | Typo in org name or org was deleted | User must verify org name |
| `insufficient organization permissions` | 403 | User is not an org owner | User must request ownership or ask an owner |
| `validation failed` (missing_field) | 422 | Empty repo name | User must provide a name |
| `validation failed` (invalid) | 422 | Name too long, bad chars, reserved, `.git` suffix | User must choose a valid name |
| `repository already exists` | 409 | Duplicate name in this org (case-insensitive) | User must choose a different name |
| `failed to create repository` | 500 | Database error | Retry; if persistent, check DB health |
| `rate limit exceeded` | 429 | Too many requests | Wait for `Retry-After` duration |

## Verification

### API Integration Tests

1. **Happy path: create public org repo** — `POST /api/orgs/:org/repos` with `{ "name": "test-repo" }` as org owner → `201`, response has correct `owner`, `full_name`, `is_public: true`, `default_bookmark: "main"`.
2. **Happy path: create private org repo** — `POST /api/orgs/:org/repos` with `{ "name": "private-repo", "private": true }` → `201`, response has `private: true`, `is_public: false`.
3. **Happy path: create with description** — `POST` with `{ "name": "described-repo", "description": "A test repo" }` → `201`, response `description` matches.
4. **Happy path: create with custom default_bookmark** — `POST` with `{ "name": "custom-bm", "default_bookmark": "trunk" }` → `201`, response `default_bookmark: "trunk"`.
5. **Happy path: create with only name** — `POST` with `{ "name": "minimal" }` → `201`, defaults applied: `description: ""`, `is_public: true`, `default_bookmark: "main"`.
6. **Verify response shape** — `201` response contains exactly: `id`, `owner`, `name`, `full_name`, `description`, `private`, `is_public`, `default_bookmark`, `topics`, `is_archived`, `is_fork`, `num_stars`, `num_forks`, `num_watches`, `num_issues`, `clone_url`, `created_at`, `updated_at`. Counters are `0`. `topics` is `[]`. `is_archived` and `is_fork` are `false`.
7. **Verify `created_at` and `updated_at`** — Both are valid ISO 8601 strings and are equal at creation time.
8. **Verify repo is accessible after creation** — `GET /api/repos/:org/:repo` returns `200` with matching data.
9. **Verify repo appears in org repo list** — `GET /api/orgs/:org/repos` includes the new repo.
10. **Unauthenticated request** — `POST /api/orgs/:org/repos` without auth → `401`.
11. **Non-member creates repo** — Authenticated user who is not an org member → `403`.
12. **Member (non-owner) creates repo** — Authenticated user who is org member with `"member"` role → `403`.
13. **Org not found** — `POST /api/orgs/nonexistent/repos` → `404`.
14. **Empty org path param** — `POST /api/orgs/%20/repos` (whitespace) → `400`.
15. **Case-insensitive org lookup** — `POST /api/orgs/ACME/repos` resolves to `acme` org → `201` with `owner` matching stored org name.
16. **Empty body** — `POST` with `{}` → `422`, error field `name`, code `missing_field`.
17. **Empty name** — `POST` with `{ "name": "" }` → `422`, `missing_field`.
18. **Whitespace-only name** — `POST` with `{ "name": "   " }` → `422`, `missing_field`.
19. **Name with leading/trailing whitespace** — `POST` with `{ "name": "  good-name  " }` → `201`, repo name is `"good-name"`.
20. **Name at maximum length (100 chars)** — `POST` with a 100-character valid name → `201`.
21. **Name exceeds maximum length (101 chars)** — `POST` with a 101-character name → `422`, `invalid`.
22. **Name starts with dot** — `{ "name": ".hidden" }` → `422`.
23. **Name starts with hyphen** — `{ "name": "-dashed" }` → `422`.
24. **Name starts with underscore** — `{ "name": "_private" }` → `422`.
25. **Name contains space** — `{ "name": "my repo" }` → `422`.
26. **Name contains @** — `{ "name": "my@repo" }` → `422`.
27. **Name ends with .git** — `{ "name": "myrepo.git" }` → `422`.
28. **Name ends with .GIT (case variation)** — Verify behavior (should also be rejected if the check is case-insensitive, or accepted if case-sensitive — test documents actual behavior).
29. **Reserved name: settings** — `{ "name": "settings" }` → `422`.
30. **Reserved name: issues** — `{ "name": "issues" }` → `422`.
31. **Reserved name: workflows** — `{ "name": "workflows" }` → `422`.
32. **Reserved name (different case): Settings** — `{ "name": "Settings" }` → `422`.
33. **Duplicate name (same case)** — Create `test-dup`, then create `test-dup` again → second returns `409`.
34. **Duplicate name (different case)** — Create `My-Repo`, then create `my-repo` → second returns `409`.
35. **Same name in different org** — Create `shared-name` in org A, then create `shared-name` in org B → both succeed `201`.
36. **Name with dots** — `{ "name": "my.project" }` → `201`.
37. **Name with underscores** — `{ "name": "my_project" }` → `201` (starts with letter, underscores allowed after first char).
38. **Name with hyphens** — `{ "name": "my-project" }` → `201`.
39. **Name with mixed valid chars** — `{ "name": "My-Project_v2.0" }` → `201`.
40. **Single character name** — `{ "name": "a" }` → `201`.
41. **Numeric name** — `{ "name": "123" }` → `201` (starts with digit, digits allowed).
42. **Description with emoji** — `{ "name": "emoji-desc", "description": "🚀 Launch it" }` → `201`, description preserved.
43. **Description with CJK characters** — `{ "name": "cjk-desc", "description": "日本語テスト" }` → `201`, description preserved.
44. **Empty description explicitly** — `{ "name": "no-desc", "description": "" }` → `201`, description is `""`.
45. **Private repo not visible to unauthenticated** — Create private org repo, then `GET /api/repos/:org/:repo` without auth → `404` or `403`.

### CLI E2E Tests

46. **CLI: create org repo (happy path)** — `codeplane repo create myrepo --org acme --json` → exit `0`, JSON output with `owner: "acme"`, `full_name: "acme/myrepo"`.
47. **CLI: create org repo with description** — `codeplane repo create myrepo --org acme --description "CLI test" --json` → exit `0`, `description: "CLI test"`.
48. **CLI: create private org repo** — `codeplane repo create myrepo --org acme --private --json` → exit `0`, `private: true`.
49. **CLI: create org repo human-readable output** — `codeplane repo create myrepo --org acme` (no `--json`) → exit `0`, stdout contains `"acme/myrepo"` and `"created successfully"`.
50. **CLI: non-existent org** — `codeplane repo create myrepo --org ghost --json` → non-zero exit, stderr contains `"organization not found"`.
51. **CLI: insufficient permissions** — Using a read-only token for a non-owner member → non-zero exit, stderr contains `"insufficient organization permissions"` or `"forbidden"`.
52. **CLI: duplicate name** — Create same name twice with `--org` → second call non-zero exit, stderr contains `"already exists"`.
53. **CLI: unauthenticated** — Without `CODEPLANE_TOKEN` → non-zero exit, stderr contains `"authentication required"`.
54. **CLI: create org repo without --org falls through to user-owned** — `codeplane repo create myrepo --json` (no `--org`) → `201`, `owner` is the authenticated user, not an org.
55. **CLI: invalid name with --org** — `codeplane repo create ".bad" --org acme --json` → non-zero exit, stderr contains validation error.

### Web UI (Playwright) E2E Tests

56. **Web: new repo page loads with owner selector** — Navigate to new-repo page → owner dropdown is visible and includes user's personal account and org(s) where user is owner.
57. **Web: selecting org changes target namespace** — Select an org in the owner dropdown → the URL preview updates to `org/repo-name`.
58. **Web: create org repo via form** — Fill in org owner, name, submit → redirect to `/:org/:repo`, page loads with correct repo name and org as owner.
59. **Web: create private org repo** — Select private visibility, submit → repo created as private.
60. **Web: name validation inline error** — Type an invalid name (e.g., `.bad`) → inline error appears without submitting.
61. **Web: duplicate name inline error** — Submit a duplicate name → inline error: `"A repository with this name already exists in this organization."`.
62. **Web: create button disabled for empty name** — Name field empty → "Create repository" button is disabled.
63. **Web: non-owner org not shown in dropdown** — User is a member (not owner) of org B → org B does not appear in the owner dropdown.

### TUI E2E Tests

64. **TUI: repo create form shows owner options** — Open create-repo form → owner selector includes personal account and owned orgs.
65. **TUI: select org and create repo** — Select org, type name, submit → success message, repo created under org.
66. **TUI: validation error displayed** — Type invalid name → inline error shown.
67. **TUI: conflict error displayed** — Submit duplicate name → inline error: `"Repository name already taken"`.

### Cross-Client Consistency Tests

68. **API-created repo visible in CLI** — Create org repo via API, then `codeplane repo view -R org/repo --json` → returns the repo.
69. **CLI-created repo visible in web** — Create org repo via CLI, then navigate to `/:org/:repo` in browser → page loads correctly.
70. **Repo appears in org repo list across clients** — Create org repo via any client, verify it appears in `GET /api/orgs/:org/repos`, `codeplane org repo list --org <org>`, and the web org page.
