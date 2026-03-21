# REPO_CREATE_USER_OWNED

Specification for REPO_CREATE_USER_OWNED.

## High-Level User POV

When a developer wants to start a new project on Codeplane, they create a user-owned repository. This is the most fundamental action in the product — it gives the user a home for their code under their personal namespace.

From any Codeplane surface — the web UI, the CLI, the TUI, or a desktop app — the user can create a new repository by providing a name. Optionally, they can add a description, choose whether the repository should be public or private, and specify a default bookmark name (Codeplane's jj-native equivalent of a default branch). If they don't specify a bookmark, it defaults to "main."

Once created, the repository immediately appears under the user's namespace (e.g., `alice/my-project`). The user receives a clone URL and can start pushing code right away via SSH. The repository is listed in their personal repository list and is discoverable through search if public. From the moment of creation, the full Codeplane collaboration surface — issues, landing requests, workflows, workspaces, wiki, releases — is available on the new repository.

Repository names must be unique within the user's namespace. If a user already has a repository called `my-app`, trying to create another one with the same name will fail with a clear conflict message. Names are case-preserving but case-insensitively unique: `My-App` and `my-app` cannot coexist under the same owner.

The feature is intentionally simple. Users should be able to create a repository in under five seconds from any client surface. There is no wizard, no multi-step form, and no configuration that cannot be changed later.

## Acceptance Criteria

## Definition of Done

The feature is complete when an authenticated user can create a personal repository from the API, CLI, TUI, and Web UI, the repository is immediately usable, and all validation, error, and edge-case paths are covered by end-to-end tests.

## Functional Constraints

- [ ] An authenticated user can create a repository under their personal namespace
- [ ] The created repository is immediately accessible via `GET /api/repos/:owner/:repo`
- [ ] The created repository appears in `GET /api/user/repos` list results
- [ ] The response includes a valid `clone_url` using the configured SSH host
- [ ] The `full_name` is constructed as `{username}/{name}`
- [ ] The `owner` field in the response matches the authenticated user's username
- [ ] The `default_bookmark` defaults to `"main"` when not provided or empty
- [ ] The `private` flag defaults to `false` (repository is public by default)
- [ ] The `description` defaults to an empty string when not provided
- [ ] The `topics` field defaults to an empty array on newly created repositories
- [ ] Counter fields (`num_stars`, `num_forks`, `num_watches`, `num_issues`) default to `0`
- [ ] The `is_archived`, `is_fork` booleans default to `false`
- [ ] The response includes valid `created_at` and `updated_at` ISO-8601 timestamps

## Name Validation Constraints

- [ ] Repository name must be at least 1 character after trimming
- [ ] Repository name must be at most 100 characters
- [ ] Repository name must start with an alphanumeric character (`[a-zA-Z0-9]`)
- [ ] Repository name may contain only alphanumeric characters, dots, underscores, and hyphens (`[a-zA-Z0-9._-]`)
- [ ] Repository name must not end with `.git` (case-insensitive)
- [ ] Repository name must not be a reserved name (case-insensitive): `agent`, `bookmarks`, `changes`, `commits`, `contributors`, `issues`, `labels`, `landings`, `milestones`, `operations`, `pulls`, `settings`, `stargazers`, `watchers`, `workflows`
- [ ] An empty name returns a 422 validation error with `code: "missing_field"` and `field: "name"`
- [ ] An invalid name returns a 422 validation error with `code: "invalid"` and `field: "name"`
- [ ] Leading/trailing whitespace on the name is trimmed before validation

## Uniqueness Constraints

- [ ] Two repositories under the same user cannot share the same name (case-insensitive)
- [ ] Attempting to create a duplicate repository returns a 409 Conflict error
- [ ] The conflict error message includes the repository name
- [ ] Names are stored with a separate `lower_name` for case-insensitive uniqueness enforcement
- [ ] The original casing of the name is preserved in the `name` field

## Authentication Constraints

- [ ] An unauthenticated request returns 401 Unauthorized
- [ ] The endpoint accepts session cookie authentication
- [ ] The endpoint accepts PAT-based `Authorization` header authentication

## Error Cases

- [ ] Invalid JSON body returns 400 Bad Request
- [ ] Missing `name` field returns 422 validation error
- [ ] Empty string `name` (after trimming) returns 422 validation error
- [ ] Name with 101+ characters returns 422 validation error
- [ ] Name starting with a dot returns 422 validation error
- [ ] Name starting with a hyphen returns 422 validation error
- [ ] Name starting with an underscore returns 422 validation error
- [ ] Name containing spaces returns 422 validation error
- [ ] Name containing special characters (`@`, `#`, `$`, `%`, etc.) returns 422 validation error
- [ ] Name `settings` (reserved) returns 422 validation error
- [ ] Name `my-repo.git` returns 422 validation error
- [ ] Duplicate name returns 409 Conflict
- [ ] Internal server error during creation returns 500

## Boundary Values

- [ ] A 1-character alphanumeric name (`a`) is accepted
- [ ] A 100-character valid name is accepted
- [ ] A 101-character name is rejected
- [ ] A name with all valid special characters (`a.b_c-d`) is accepted
- [ ] Description may be an arbitrarily long string (no upper limit enforced at the API layer)
- [ ] `default_bookmark` of whitespace-only normalizes to `"main"`

## Design

## API Shape

**Endpoint:** `POST /api/user/repos`

**Authentication:** Required (session cookie or PAT)

**Content-Type:** `application/json`

**Request Body:**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | `string` | Yes | — | Repository name. 1–100 chars, `[a-zA-Z0-9][a-zA-Z0-9._-]*`, not reserved, not ending in `.git`. |
| `description` | `string` | No | `""` | Free-text description of the repository. |
| `private` | `boolean` | No | `false` | If `true`, the repository is private. |
| `auto_init` | `boolean` | No | `false` | Whether to auto-initialize the repository with a default commit. |
| `default_bookmark` | `string` | No | `"main"` | The default jj bookmark. Trimmed; empty string normalizes to `"main"`. |

**Success Response:** `201 Created`

```json
{
  "id": 42,
  "owner": "alice",
  "name": "my-project",
  "full_name": "alice/my-project",
  "description": "A cool project",
  "private": false,
  "is_public": true,
  "default_bookmark": "main",
  "topics": [],
  "is_archived": false,
  "is_fork": false,
  "num_stars": 0,
  "num_forks": 0,
  "num_watches": 0,
  "num_issues": 0,
  "clone_url": "git@ssh.codeplane.app:alice/my-project.git",
  "created_at": "2026-03-21T12:00:00.000Z",
  "updated_at": "2026-03-21T12:00:00.000Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|---|---|---|
| `400` | Invalid JSON body | `{ "message": "invalid request body" }` |
| `401` | Not authenticated | `{ "message": "not authenticated" }` |
| `409` | Duplicate name | `{ "message": "repository 'my-project' already exists" }` |
| `422` | Name empty | `{ "resource": "Repository", "field": "name", "code": "missing_field" }` |
| `422` | Name invalid | `{ "resource": "Repository", "field": "name", "code": "invalid" }` |
| `500` | Internal error | `{ "message": "failed to create repository" }` |

## SDK Shape

The SDK exposes `RepoService.createRepo()` as the domain method:

```typescript
createRepo(
  actor: RepoActor,
  name: string,
  description: string,
  isPublic: boolean,
  defaultBookmark: string,
  autoInit: boolean
): Promise<Result<RepoRow, APIError>>
```

The method trims the name, normalizes the default bookmark, validates all name constraints, calls the database insertion, and handles unique-violation errors. It returns a `Result` type for explicit success/error handling. Route handlers call this method and map the result to `RepoResponse`.

## CLI Command

**Command:** `codeplane repo create <name> [options]`

**Arguments:**

| Argument | Required | Description |
|---|---|---|
| `name` | Yes | Repository name (positional) |

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `--description` | `string` | `""` | Repository description |
| `--private` | `boolean` | `false` | Make the repository private |

**Human-Readable Output:**

```
Created repository alice/my-project
Clone URL: git@ssh.codeplane.app:alice/my-project.git
```

**Structured Output (via `--json`):**

Returns the full `RepoResponse` JSON object as received from the API.

**Error Output:**

CLI errors are surfaced through `handleRepoApiError`, which formats API error payloads into readable terminal messages. Non-zero exit codes indicate failure.

## TUI UI

The TUI provides two entry points to repository creation:

1. **Dashboard Quick Actions Bar:** Pressing `c` from the dashboard pushes a `create-repo` screen.
2. **Repository List Screen:** Pressing `c` from the repository list pushes the same `create-repo` screen.

The create-repo screen should present a form with the following fields:

| Field | Widget | Default | Validation |
|---|---|---|---|
| Name | Text input | Empty | Required. Real-time validation against name rules. |
| Description | Text input | Empty | Optional. Free text. |
| Visibility | Toggle / Select | Public | Toggles between Public and Private. |
| Default Bookmark | Text input | `main` | Optional. Normalizes empty to `main`. |

**Keybindings:**

- `Enter` or `Ctrl+S` — Submit the form
- `Escape` — Cancel and return to previous screen
- `Tab` / `Shift+Tab` — Navigate between fields

**Success Behavior:** On success, navigate to the newly created repository detail screen and display a success flash message.

**Error Behavior:** Display inline validation errors below the offending field. For server errors (409, 500), display a banner/toast error message without clearing the form so the user can correct and retry.

## Web UI Design

The web application should provide a "New Repository" page accessible from:

1. The global `+` / "New" button in the navigation header
2. The command palette (`Cmd+K` → "Create Repository")
3. Direct URL navigation to `/new`

**Form Layout:**

The form should be a single-column, vertically stacked layout:

1. **Owner selector** — Pre-filled with the authenticated user's username. (For this feature, always the authenticated user. Organization selection is out of scope.)
2. **Repository name** — Text input with inline validation. Shows a green checkmark when valid, red error text when invalid.
3. **Description** — Optional textarea.
4. **Visibility** — Radio button group: "Public" (default, with subtext: "Anyone can see this repository") and "Private" (with subtext: "Only you and collaborators can see this repository").
5. **Default bookmark** — Optional text input with placeholder "main".
6. **Create Repository** button — Primary action. Disabled until the name field is valid and non-empty.

**Real-time validation on name field:**

- Debounce: 300ms after the user stops typing
- Show character count: `{current}/100`
- Validate format, reserved names, and `.git` suffix client-side
- Server-side uniqueness check is deferred to submission

**Success Behavior:** Redirect to `/:owner/:repo` (the new repository overview page).

**Error Behavior:**

- 409 Conflict: Show inline error below name field: "A repository with this name already exists."
- 422 Validation: Show inline error with specific message.
- 500: Show a toast/banner: "Something went wrong. Please try again."

## Editor Integrations

**VS Code:** The extension should expose a "Codeplane: Create Repository" command via the command palette. It should prompt sequentially for name, optional description, and visibility (public/private), then call the API and show an information message with the clone URL on success.

**Neovim:** The plugin should expose a `:CodeplaneRepoCreate` command. It should use `vim.ui.input` for name and description, and `vim.ui.select` for visibility. On success, display the clone URL via `vim.notify`.

## Documentation

The following end-user documentation should be written:

1. **"Creating a repository"** guide covering:
   - How to create a repository from the Web UI, CLI, and TUI
   - Explanation of name rules and reserved names
   - How visibility (public vs. private) works
   - What the default bookmark means in a jj-native context
   - Example CLI invocations with sample output

2. **CLI reference entry** for `codeplane repo create`:
   - Full usage syntax
   - All arguments and options with descriptions
   - Example commands
   - Example JSON output

3. **API reference entry** for `POST /api/user/repos`:
   - Request/response schemas
   - Error codes and their meanings
   - Authentication requirements
   - Example `curl` invocations

## Permissions & Security

## Authorization

| Role | Can Create User-Owned Repo? |
|---|---|
| Authenticated user | ✅ Yes — repos are created under their own namespace |
| Unauthenticated / Anonymous | ❌ No — returns 401 |
| Admin | ✅ Yes — admins are also authenticated users |

There is no concept of "Owner", "Member", or "Read-Only" for user-owned repository creation because the actor is always creating a repository in their own namespace. Organization-scoped creation is a separate feature (`REPO_CREATE_ORG_OWNED`).

## Rate Limiting

| Limit | Value | Scope | Rationale |
|---|---|---|---|
| Create requests | 30 per hour | Per authenticated user | Prevents automated mass repository creation |
| Burst limit | 5 per minute | Per authenticated user | Prevents rapid-fire creation scripts |

Rate limit responses should return `429 Too Many Requests` with `Retry-After` header.

## Data Privacy

- Repository names and descriptions are user-supplied content. No PII is inherently required.
- The `owner` username is exposed in the response and clone URL — this is intentional and expected since usernames are public identifiers.
- Private repository existence should not be discoverable by unauthenticated users or users without access. The 404 response for private repositories must be indistinguishable from a genuinely non-existent repository.
- The `clone_url` contains the SSH host, which is infrastructure information but is intentionally public.

## Input Sanitization

- The `name` field is validated against a strict allowlist regex. No HTML, SQL, or shell metacharacters can pass validation.
- The `description` field is free text and must be sanitized/escaped on display in all clients to prevent XSS.
- The `default_bookmark` field is free text within its trim/default logic and should be treated with the same display-time sanitization as description.

## Telemetry & Product Analytics

## Business Events

| Event | Trigger | Properties |
|---|---|---|
| `RepositoryCreated` | Successful repository creation | `repo_id`, `owner_id`, `owner_username`, `repo_name`, `full_name`, `is_public`, `default_bookmark`, `has_description` (boolean), `source` (api, cli, tui, web, vscode, neovim), `created_at` |
| `RepositoryCreateFailed` | Any failed creation attempt | `owner_id`, `owner_username`, `error_code` (400, 401, 409, 422, 500), `error_reason` (missing_field, invalid, conflict, unauthenticated), `source`, `attempted_name_length`, `attempted_at` |

## Funnel Metrics

| Metric | Description | Success Indicator |
|---|---|---|
| **Creation success rate** | `RepositoryCreated / (RepositoryCreated + RepositoryCreateFailed)` | > 90% indicates good UX validation prevents most errors |
| **Time-to-first-repo** | Time from user account creation to first `RepositoryCreated` event | Decreasing trend indicates better onboarding |
| **Repos per user (30d)** | Count of `RepositoryCreated` per unique `owner_id` in 30-day window | Indicates active usage |
| **Client distribution** | Breakdown of `source` field on `RepositoryCreated` | Healthy distribution across clients indicates multi-surface adoption |
| **Common failure reasons** | Breakdown of `error_reason` on `RepositoryCreateFailed` | High `conflict` rate may indicate users struggling with naming; high `invalid` rate may indicate poor UX feedback |

## Activation Signal

A user's first `RepositoryCreated` event is a key activation signal. It should be flagged as a milestone in user lifecycle analytics.

## Observability

## Logging

| Log Event | Level | Structured Context | When |
|---|---|---|---|
| Repository creation attempt | `info` | `user_id`, `username`, `repo_name`, `is_public` | Before calling service method |
| Repository created successfully | `info` | `user_id`, `username`, `repo_id`, `repo_name`, `full_name`, `duration_ms` | After successful creation |
| Repository creation validation failed | `warn` | `user_id`, `username`, `repo_name`, `validation_error`, `field`, `code` | When name validation fails |
| Repository creation conflict | `warn` | `user_id`, `username`, `repo_name` | When duplicate name detected |
| Repository creation internal error | `error` | `user_id`, `username`, `repo_name`, `error_message`, `stack_trace` | When unexpected DB or service error occurs |
| Unauthenticated creation attempt | `warn` | `request_ip`, `user_agent` | When 401 is returned |

All log entries must include `request_id` from the middleware-injected request ID.

## Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_repo_create_total` | Counter | `status` (success, validation_error, conflict, auth_error, internal_error) | Total repository creation attempts |
| `codeplane_repo_create_duration_seconds` | Histogram | `status` | Latency of the creation operation (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_repos_total` | Gauge | `visibility` (public, private) | Total number of repositories (updated on create/delete) |
| `codeplane_repo_create_rate` | Counter | `user_id` | Per-user creation rate for rate-limit monitoring |

## Alerts

### Alert: High Repository Creation Error Rate

**Condition:** `rate(codeplane_repo_create_total{status="internal_error"}[5m]) > 0.1`

**Severity:** `critical`

**Runbook:**
1. Check the server logs for `error`-level entries with `repo_create` context in the last 15 minutes.
2. Check database connectivity: `SELECT 1` against the primary database.
3. Check if the `repositories` table is locked or if there is unusual locking contention: inspect `pg_stat_activity` for long-running transactions.
4. Check disk space on the database host and the repo-host shard (`codeplane-repo-host-0`).
5. If the database is healthy, check for recent deployments that may have introduced a schema mismatch.
6. If the error is a unique constraint violation that should not be occurring, check for race conditions in concurrent creation.
7. Escalate to the database team if the issue persists after 15 minutes.

### Alert: Repository Creation Latency Spike

**Condition:** `histogram_quantile(0.95, rate(codeplane_repo_create_duration_seconds_bucket[5m])) > 2.0`

**Severity:** `warning`

**Runbook:**
1. Check database query latency: review slow-query logs for `INSERT INTO repositories`.
2. Check connection pool utilization — if the pool is exhausted, creation requests will queue.
3. Check if the repo-host shard is under heavy I/O load (e.g., from concurrent clone operations).
4. Review recent traffic patterns: a traffic spike may be causing legitimate load.
5. If latency is isolated to this endpoint, check for table lock contention or index bloat on the `repositories` table.
6. Consider temporarily increasing the connection pool size if the issue is pool exhaustion.

### Alert: Abnormal Repository Creation Volume

**Condition:** `sum(rate(codeplane_repo_create_total{status="success"}[5m])) > 10` (adjust threshold based on baseline)

**Severity:** `warning`

**Runbook:**
1. Check if the creation volume is from a single user or spread across many users.
2. If a single user: check if they are a known automation account or if this is potential abuse. Consider temporarily suspending the account and investigating.
3. If spread: check if a marketing campaign, blog post, or product launch is driving legitimate signups.
4. Verify rate limiting is functioning: check that `429` responses are being issued to heavy creators.
5. If this is abuse, consider adding IP-level rate limiting in the load balancer.

## Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|---|---|---|---|
| Database unavailable | Creation returns 500 consistently | Complete feature outage | DB health check alert; failover to replica if available |
| Unique index corruption | Duplicate repos can be created; or valid names falsely rejected | Data integrity violation | Periodic index integrity checks; reindex if needed |
| Repo-host shard unavailable | Repo created in DB but on-disk initialization fails | Repo exists in API but cannot be cloned | Health check on shard; reconciliation job to clean up orphaned DB records |
| Rate limiter failure | Users not being rate-limited | Potential abuse, resource exhaustion | Monitor `429` response rate; fallback to conservative in-memory limiter |
| SSH host misconfigured | Clone URL points to wrong host | Users cannot clone | Validate `CODEPLANE_SSH_HOST` on startup; alert if unset or unreachable |

## Verification

## API Integration Tests

| # | Test Case | Method | Inputs | Expected |
|---|---|---|---|---|
| 1 | Create a public repo with minimal payload | `POST /api/user/repos` | `{ "name": "test-repo" }` | 201, `is_public: true`, `default_bookmark: "main"`, `description: ""` |
| 2 | Create a private repo | `POST /api/user/repos` | `{ "name": "priv-repo", "private": true }` | 201, `private: true`, `is_public: false` |
| 3 | Create a repo with description | `POST /api/user/repos` | `{ "name": "desc-repo", "description": "Hello world" }` | 201, `description: "Hello world"` |
| 4 | Create a repo with custom default bookmark | `POST /api/user/repos` | `{ "name": "bm-repo", "default_bookmark": "develop" }` | 201, `default_bookmark: "develop"` |
| 5 | Create a repo with empty default_bookmark | `POST /api/user/repos` | `{ "name": "empty-bm", "default_bookmark": "" }` | 201, `default_bookmark: "main"` |
| 6 | Create a repo with whitespace-only default_bookmark | `POST /api/user/repos` | `{ "name": "ws-bm", "default_bookmark": "   " }` | 201, `default_bookmark: "main"` |
| 7 | Verify `owner` matches authenticated user | `POST /api/user/repos` | `{ "name": "owner-test" }` | 201, `owner` equals auth user's username |
| 8 | Verify `full_name` format | `POST /api/user/repos` | `{ "name": "fullname-test" }` | 201, `full_name` equals `{username}/fullname-test` |
| 9 | Verify `clone_url` format | `POST /api/user/repos` | `{ "name": "clone-test" }` | 201, `clone_url` matches `git@{SSH_HOST}:{username}/clone-test.git` |
| 10 | Verify counter fields default to zero | `POST /api/user/repos` | `{ "name": "counter-test" }` | 201, all `num_*` fields equal `0` |
| 11 | Verify boolean defaults | `POST /api/user/repos` | `{ "name": "bool-test" }` | 201, `is_archived: false`, `is_fork: false` |
| 12 | Verify timestamps are present and valid ISO-8601 | `POST /api/user/repos` | `{ "name": "ts-test" }` | 201, `created_at` and `updated_at` are valid ISO-8601 strings |
| 13 | Verify `topics` defaults to empty array | `POST /api/user/repos` | `{ "name": "topics-test" }` | 201, `topics: []` |
| 14 | Created repo is retrievable via GET | `POST` then `GET /api/repos/:owner/:repo` | `{ "name": "get-test" }` | GET returns 200 with matching fields |
| 15 | Created repo appears in user repo list | `POST` then `GET /api/user/repos` | `{ "name": "list-test" }` | List includes the created repo |
| 16 | Name with 1 character (minimum valid) | `POST /api/user/repos` | `{ "name": "a" }` | 201 |
| 17 | Name with exactly 100 characters (maximum valid) | `POST /api/user/repos` | `{ "name": "a" + "b".repeat(99) }` | 201 |
| 18 | Name with 101 characters (exceeds max) | `POST /api/user/repos` | `{ "name": "a" + "b".repeat(100) }` | 422 |
| 19 | Name with dots, underscores, hyphens | `POST /api/user/repos` | `{ "name": "my.repo_name-here" }` | 201 |
| 20 | Empty name | `POST /api/user/repos` | `{ "name": "" }` | 422, `code: "missing_field"` |
| 21 | Whitespace-only name | `POST /api/user/repos` | `{ "name": "   " }` | 422, `code: "missing_field"` |
| 22 | Name with leading whitespace (trimmed) | `POST /api/user/repos` | `{ "name": "  valid-name  " }` | 201, `name: "valid-name"` |
| 23 | Name starting with dot | `POST /api/user/repos` | `{ "name": ".hidden" }` | 422 |
| 24 | Name starting with hyphen | `POST /api/user/repos` | `{ "name": "-invalid" }` | 422 |
| 25 | Name starting with underscore | `POST /api/user/repos` | `{ "name": "_invalid" }` | 422 |
| 26 | Name containing spaces | `POST /api/user/repos` | `{ "name": "my repo" }` | 422 |
| 27 | Name containing `@` | `POST /api/user/repos` | `{ "name": "my@repo" }` | 422 |
| 28 | Name containing `#` | `POST /api/user/repos` | `{ "name": "my#repo" }` | 422 |
| 29 | Name containing `/` | `POST /api/user/repos` | `{ "name": "my/repo" }` | 422 |
| 30 | Name ending with `.git` | `POST /api/user/repos` | `{ "name": "myrepo.git" }` | 422 |
| 31 | Name ending with `.GIT` (case-insensitive) | `POST /api/user/repos` | `{ "name": "myrepo.GIT" }` | 422 |
| 32 | Reserved name `settings` | `POST /api/user/repos` | `{ "name": "settings" }` | 422 |
| 33 | Reserved name `issues` | `POST /api/user/repos` | `{ "name": "issues" }` | 422 |
| 34 | Reserved name `SETTINGS` (case-insensitive) | `POST /api/user/repos` | `{ "name": "SETTINGS" }` | 422 |
| 35 | All reserved names rejected | `POST /api/user/repos` for each | Each of the 15 reserved names | 422 for each |
| 36 | Duplicate name (exact case) | Two `POST` with same `name` | `{ "name": "dupe-test" }` | First: 201, Second: 409 |
| 37 | Duplicate name (different case) | `POST` with `MyRepo`, then `POST` with `myrepo` | — | First: 201, Second: 409 |
| 38 | Unauthenticated request | `POST /api/user/repos` without auth | `{ "name": "no-auth" }` | 401 |
| 39 | Invalid JSON body | `POST /api/user/repos` with body `not json` | — | 400 |
| 40 | Missing body entirely | `POST /api/user/repos` with no body | — | 400 |
| 41 | Missing `name` field in valid JSON | `POST /api/user/repos` | `{ "description": "no name" }` | 422 |
| 42 | `name` field is null | `POST /api/user/repos` | `{ "name": null }` | 422 |
| 43 | `name` field is a number | `POST /api/user/repos` | `{ "name": 123 }` | 422 or 400 |
| 44 | Extra unknown fields are ignored | `POST /api/user/repos` | `{ "name": "extra", "foo": "bar" }` | 201, extra fields ignored |

## CLI E2E Tests

| # | Test Case | Command | Expected |
|---|---|---|---|
| 45 | Create repo via CLI | `codeplane repo create my-cli-repo --description "CLI test"` | Exit code 0, output contains "Created repository {user}/my-cli-repo" and clone URL |
| 46 | Create repo via CLI (JSON output) | `codeplane repo create my-json-repo --json` | Exit code 0, valid JSON with `name`, `owner`, `full_name`, `clone_url` |
| 47 | Create private repo via CLI | `codeplane repo create my-private --private` | Exit code 0, JSON output has `private: true` |
| 48 | Verify created repo via `repo view` | `codeplane repo view -R {user}/my-cli-repo --json` | Exit code 0, returns matching repo data |
| 49 | Verify created repo in `repo list` | `codeplane repo list --json` | List includes `my-cli-repo` |
| 50 | Duplicate name via CLI | `codeplane repo create my-cli-repo` (already exists) | Non-zero exit code, error message contains "already exists" |
| 51 | Empty name via CLI | `codeplane repo create ""` | Non-zero exit code |
| 52 | Invalid name via CLI | `codeplane repo create ".bad-name"` | Non-zero exit code |
| 53 | Reserved name via CLI | `codeplane repo create settings` | Non-zero exit code |
| 54 | Delete created repo (cleanup) | `codeplane repo delete --yes -R {user}/my-cli-repo` | Exit code 0 |

## Web UI E2E Tests (Playwright)

| # | Test Case | Steps | Expected |
|---|---|---|---|
| 55 | Navigate to create repo page | Click "New" → "New Repository" | Create repo form is displayed |
| 56 | Create repo with valid name | Fill name "pw-test-repo", click "Create Repository" | Redirected to `/{user}/pw-test-repo`, success message shown |
| 57 | Create repo with all fields | Fill name, description, select private, set bookmark | All fields persisted in created repo |
| 58 | Name validation: empty name | Leave name field empty | "Create Repository" button is disabled |
| 59 | Name validation: invalid characters | Type `bad name!` in name field | Inline error shown, button disabled |
| 60 | Name validation: reserved name | Type `settings` | Inline error: name is reserved |
| 61 | Name validation: too long | Type 101 characters | Inline error, button disabled |
| 62 | Duplicate name error | Create repo, navigate back, try same name | Inline error: "already exists" |
| 63 | Default visibility is Public | Open form | Public radio is selected by default |
| 64 | Default bookmark placeholder | Open form | Bookmark field shows "main" placeholder |
| 65 | Cancel returns to previous page | Click Cancel / press Escape | Navigated back, no repo created |
| 66 | Command palette access | `Cmd+K` → type "Create Repository" → Enter | Create repo form is displayed |

## TUI E2E Tests

| # | Test Case | Steps | Expected |
|---|---|---|---|
| 67 | Quick action `c` from dashboard | Press `c` | Create-repo screen opens |
| 68 | Quick action `c` from repo list | Navigate to repos, press `c` | Create-repo screen opens |
| 69 | Create repo via TUI form | Fill name, submit | Repo created, navigated to repo detail |
| 70 | Cancel via Escape | Press `Escape` on create form | Returns to previous screen |
| 71 | Inline validation in TUI | Type invalid name | Error message shown below field |

## Cross-Client Consistency Tests

| # | Test Case | Steps | Expected |
|---|---|---|---|
| 72 | Repo created via CLI is visible in API | Create via CLI, GET via API | Same data returned |
| 73 | Repo created via API is visible in CLI | Create via API, list via CLI | Repo appears in list |
| 74 | Repo created via CLI is visible in Web UI | Create via CLI, navigate to repo in browser | Repo page loads correctly |
