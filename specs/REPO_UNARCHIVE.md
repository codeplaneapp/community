# REPO_UNARCHIVE

Specification for REPO_UNARCHIVE.

## High-Level User POV

When you archive a Codeplane repository, it enters a read-only state where no pushes, new issues, landing requests, or workflow runs are accepted. Unarchiving reverses that decision. As a repository owner or administrator, you need the ability to restore a previously archived repository to its fully writable, active state — because projects get revived, archiving sometimes happens by mistake, or organizational priorities shift.

Unarchiving a repository is a single-action operation available from the web UI's repository settings page, the CLI, the TUI, and the API. When you unarchive a repository, it immediately resumes accepting pushes over SSH and Smart HTTP, allows new issues and landing requests to be filed, permits workflow runs to be dispatched, and reappears in default (non-archived) repository listings. All previously existing data — issues, landing requests, workflow history, wiki pages, releases, secrets, and variables — remains intact and fully accessible, exactly as it was before archiving.

The unarchive action requires admin-level access. If you are the repository owner, an organization owner for org-owned repositories, or a platform admin, you can unarchive the repository. Everyone else sees the archived status as read-only information.

From the web UI, you visit the repository settings page and click an "Unarchive this repository" button in the danger zone section. A confirmation dialog asks you to confirm the action. From the CLI, you run `codeplane repo unarchive owner/repo`. From the TUI, the repository settings tab shows an unarchive action when the repository is archived. In every case, the result is the same: the repository's `is_archived` flag is cleared, the `archived_at` timestamp is removed, and the repository is immediately writable again.

Unarchiving is idempotent. If you attempt to unarchive a repository that is not currently archived, the API returns the repository's current state without error. This makes the operation safe for automation and agent-driven workflows.

## Acceptance Criteria

### Definition of Done

- [ ] `POST /api/repos/:owner/:repo/unarchive` returns HTTP 200 with the full updated repository object on success
- [ ] After unarchiving, `is_archived` is `false` and `archived_at` is absent from the response
- [ ] After unarchiving, the repository accepts pushes over SSH and Smart HTTP
- [ ] After unarchiving, new issues can be created on the repository
- [ ] After unarchiving, new landing requests can be created on the repository
- [ ] After unarchiving, workflow runs can be dispatched on the repository
- [ ] After unarchiving, metadata updates (description, default bookmark, topics) are accepted again
- [ ] After unarchiving, the repository reappears in default (non-archived-filtered) repository listings
- [ ] All pre-existing data (issues, landing requests, workflows, wiki, releases, secrets, variables, webhooks) remains intact and accessible
- [ ] The operation is idempotent: unarchiving a non-archived repository returns HTTP 200 with current state unchanged
- [ ] `updated_at` timestamp is refreshed on the repository when archive state actually changes
- [ ] All clients (web UI, CLI, TUI) can trigger unarchive and display the result
- [ ] The CLI command `codeplane repo unarchive <OWNER/REPO>` succeeds with exit code 0
- [ ] The TUI settings view shows "Unarchive this repository" action when the repository is currently archived
- [ ] The web UI settings page shows "Unarchive this repository" button when the repository is currently archived
- [ ] A `repo.unarchived` webhook event is fired to repository and org-level webhook subscribers
- [ ] An audit log entry is recorded for the unarchive action

### Edge Cases

- [ ] Unarchiving a repository that is not archived returns HTTP 200 with current state (no error, no state change)
- [ ] Unarchiving a repository that does not exist returns HTTP 404
- [ ] Unarchiving a private repository that the user cannot see returns HTTP 404 (not 403, to avoid leaking existence)
- [ ] Unauthenticated requests return HTTP 401
- [ ] Authenticated user without admin permission returns HTTP 403
- [ ] Authenticated user with read-only permission returns HTTP 403
- [ ] Authenticated user with write permission returns HTTP 403
- [ ] Concurrent unarchive requests for the same repository both succeed (idempotent)
- [ ] Unarchiving immediately after archiving succeeds (no cooldown)
- [ ] Repository with empty owner parameter returns HTTP 400
- [ ] Repository with empty repo name parameter returns HTTP 400
- [ ] Owner/repo parameters with leading/trailing whitespace are trimmed before resolution

### Boundary Constraints

- Owner name: 1–39 characters, alphanumeric and hyphens, as determined by existing user/org name validation
- Repository name: 1–100 characters, must match `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`, cannot end with `.git`, cannot be a reserved name
- The unarchive endpoint accepts no request body — it is a simple POST with owner/repo path parameters
- Sending an unexpected request body is ignored (not an error)

### Known API Mismatch (Must Be Resolved)

- The server exposes `POST /api/repos/:owner/:repo/unarchive` as the canonical unarchive endpoint
- The CLI currently sends `DELETE /api/repos/:owner/:repo/archive` which does NOT match any mounted server route
- The public documentation (`docs/guides/repositories.mdx`) documents the endpoint as `DELETE /api/repos/:owner/:repo/archive`
- **Resolution required**: either (a) the server must also mount `DELETE /api/repos/:owner/:repo/archive` as an alias for unarchive, or (b) the CLI and docs must be updated to use `POST /api/repos/:owner/:repo/unarchive`. The spec recommends option (a) for backward compatibility while adopting `POST /api/repos/:owner/:repo/unarchive` as the canonical endpoint going forward.

## Design

### API Shape

**Primary Endpoint:** `POST /api/repos/:owner/:repo/unarchive`

**Alias Endpoint (for backward compatibility):** `DELETE /api/repos/:owner/:repo/archive`

Both endpoints MUST behave identically.

**Authentication:** Required (session cookie, PAT, or OAuth2 token)

**Request Headers:**
- `Authorization: token <PAT>` (alternative to session cookie)
- No `Content-Type` required (no request body)

**Request Body:** None. Any body sent is ignored.

**Path Parameters:**
- `owner` (string, required) — username or org name. Trimmed of leading/trailing whitespace.
- `repo` (string, required) — repository name. Trimmed of leading/trailing whitespace.

**Success Response (HTTP 200):**
```json
{
  "id": 42,
  "owner": "alice",
  "name": "my-repo",
  "full_name": "alice/my-repo",
  "description": "A jj-native forge",
  "private": false,
  "is_public": true,
  "default_bookmark": "main",
  "topics": ["jj", "forge"],
  "is_archived": false,
  "is_fork": false,
  "num_stars": 12,
  "num_forks": 3,
  "num_watches": 5,
  "num_issues": 7,
  "clone_url": "git@codeplane.io:alice/my-repo.git",
  "created_at": "2025-01-15T10:30:00.000Z",
  "updated_at": "2026-03-21T14:22:00.000Z"
}
```

Note: `archived_at` is absent when `is_archived` is `false`.

**Error Responses:**
- `400 Bad Request`: `{ "message": "owner is required" }` or `{ "message": "repository name is required" }`
- `401 Unauthorized`: `{ "message": "authentication required" }`
- `403 Forbidden`: `{ "message": "permission denied" }`
- `404 Not Found`: Repository does not exist, or private repo and user lacks access
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: `{ "message": "failed to unarchive repository" }` (database failure)

### SDK Shape

The `RepoService.unarchiveRepo()` method in `@codeplane/sdk`:

```typescript
async unarchiveRepo(
  actor: RepoActor | null,
  owner: string,
  repo: string
): Promise<Result<RepoRow, APIError>>
```

**Behavior:**
1. Validate actor is authenticated (return `unauthorized` if null)
2. Resolve repository by owner and name (return `notFound` if missing)
3. Check `canAdminRepo()` permission (return `forbidden` if denied)
4. If `!repository.isArchived`, return `Result.ok(repository)` immediately (idempotent no-op)
5. Call database `unarchiveRepo()` to set `is_archived = FALSE`, `archived_at = NULL`, `updated_at = NOW()`
6. Return the updated `RepoRow`

### CLI Command

**Command:** `codeplane repo unarchive <OWNER/REPO>`

**Arguments:**
- `repo` (positional, required) — Repository in `OWNER/REPO` format

**Behavior:**
1. Parse `OWNER/REPO` using `resolveRepoRef()`
2. Send `POST /api/repos/:owner/:repo/unarchive`
3. On success, print confirmation message or structured JSON

**Output (default):** `✓ Unarchived alice/my-repo`

**Output (--json):**
```json
{ "status": "unarchived", "repo": "alice/my-repo" }
```

**Error handling:** Uses `handleRepoApiError()` to produce user-friendly messages for 401, 403, 404, and other error codes.

**Shell completion:** The `unarchive` subcommand is registered in bash, zsh, and fish completion scripts.

**Important fix needed:** The CLI currently sends `DELETE /api/repos/:owner/:repo/archive`. It must be updated to send `POST /api/repos/:owner/:repo/unarchive` (or the server must mount the `DELETE` alias).

### Web UI Design

**Location:** `/:owner/:repo/settings` → Danger Zone section

**Behavior when repository IS archived:**
- The archive section in the Danger Zone shows:
  - A status badge or indicator: "This repository is currently archived"
  - Archived date: "Archived on {archived_at, formatted}"
  - An "Unarchive this repository" button (green/success color variant, not red/destructive)
  - Helper text: "Unarchiving will restore this repository to its fully writable state. Pushes, issues, landing requests, and workflows will be accepted again."
- Clicking "Unarchive this repository" opens a confirmation dialog:
  - Title: "Unarchive {owner}/{repo}?"
  - Body: "This will restore the repository to its writable state. All previously restricted operations will resume."
  - Confirm button: "Unarchive" (green/success)
  - Cancel button: "Cancel"
- On confirmation, calls `POST /api/repos/:owner/:repo/unarchive`
- Success: toast notification "Repository unarchived", settings page re-renders with the archive button replaced by the standard "Archive this repository" button, archived badge disappears from the repository header
- Failure: toast notification with error message, no state change

**Behavior when repository IS NOT archived:**
- The archive section shows the "Archive this repository" button (yellow/warning color variant)
- The "Unarchive" button is not shown

**Archived repository header badge:**
- When `is_archived` is true, the repository header shows an "Archived" badge next to the visibility badge
- After unarchiving, the badge disappears immediately (optimistic update, reverted on API failure)

**Read-only enforcement while archived:**
- While archived, the General section of repository settings (description, default bookmark, topics) should display fields as read-only with a notice: "This repository is archived. Unarchive it to edit settings."
- After unarchiving, these fields become editable again

**Non-admin users:**
- See the archived status indicator but no unarchive button
- See a notice: "Only administrators can unarchive this repository"

### TUI UI

**Location:** Repository settings tab (tab 6) → Archive section

**Behavior when repository IS archived:**
- Archive section shows: `Status: ⊘ Archived (since {date})`
- Action: "Unarchive this repository" — highlighted in green/success color
- Pressing Enter on the action shows confirmation: `Unarchive {owner}/{repo}? (y/n)`
- `y` sends `POST /api/repos/:owner/:repo/unarchive`
- Success: status updates to reflect unarchived state, General fields become editable
- Failure: inline error message with retry capability
- `n` cancels and returns focus to the action

**Behavior when repository IS NOT archived:**
- Archive section shows: `Status: Active`
- Action: "Archive this repository" — highlighted in yellow/warning color

**Activity Feed Integration:**
- `repo.unarchive` events appear in the TUI dashboard activity feed
- Icon: `⊙` (circle with dot)
- Color: success (green)
- Text: "{actor} unarchived {owner}/{repo}"

### Editor Integrations (VS Code & Neovim)

- No dedicated unarchive command is needed in editor integrations
- Editors delegate to CLI or web UI for administrative operations
- The repository status indicator in the editor sidebar/statusline should reflect archived state and update after unarchive
- If the VS Code extension shows a "Repository is archived" banner, it should refresh after detecting the state change (via daemon sync or next API poll)

### Documentation

End-user documentation should include:

- **Repository Archiving Guide** (`docs/guides/repositories.mdx`): already exists. Must be updated to:
  - Correct the API endpoint from `DELETE /api/repos/:owner/:repo/archive` to `POST /api/repos/:owner/:repo/unarchive` (or document both if alias is mounted)
  - Add a section on what happens after unarchiving (writes resume, listings normalize, data is preserved)
  - Include examples for all clients (CLI, web, TUI)

- **CLI Reference: `repo unarchive`**: full command reference with:
  - Syntax: `codeplane repo unarchive <OWNER/REPO>`
  - Options: `--json` for structured output
  - Examples with expected output
  - Error messages and their meanings

- **API Reference: `POST /api/repos/:owner/:repo/unarchive`**: request/response schema, error codes, idempotency note, curl example:
  ```bash
  curl -X POST -H "Authorization: token codeplane_xxxxx" \
    https://api.codeplane.app/api/repos/alice/my-repo/unarchive
  ```

## Permissions & Security

### Authorization Roles

| Role | Can Unarchive | Enforcement |
|------|--------------|-------------|
| **Repository Owner** | ✅ Yes | `canAdminRepo()` returns true for owner |
| **Organization Owner** (for org-owned repos) | ✅ Yes | `isOrgOwnerForRepoUser()` check |
| **Platform Admin** (`isAdmin: true`) | ✅ Yes | Admin bypass in permission check |
| **Admin Collaborator/Team Member** | ✅ Yes | `canAdminRepo()` returns true for admin-level collaborators and team members |
| **Write Collaborator/Team Member** | ❌ No | Returns HTTP 403 |
| **Read Collaborator/Team Member** | ❌ No | Returns HTTP 403 |
| **Authenticated user with no repo access** | ❌ No | Returns HTTP 403 (or 404 for private repos) |
| **Anonymous / Unauthenticated** | ❌ No | Returns HTTP 401 |
| **Deploy Key** | ❌ No | Deploy keys are scoped to git read/write transport only; they cannot call HTTP management APIs |
| **OAuth2 Application** | ✅ Conditional | Requires appropriate OAuth scope (e.g., `repo:admin` or `repo:write`); denied if scope is insufficient |
| **PAT** | ✅ Conditional | Requires a PAT with sufficient repository scope; denied if scopes are insufficient |

### Private Repository Visibility

- If an authenticated user does not have at least read access to a private repository, the unarchive endpoint returns HTTP 404 (not 403) to avoid leaking the existence of private repositories

### Rate Limiting

- **Standard API rate limit** applies as configured in the global rate limiter middleware
- **Recommended burst limit**: 10 requests per minute per user per repository for archive/unarchive operations. These are infrequent administrative actions; a higher rate strongly suggests automation bugs or abuse.
- **No per-IP anonymous rate limiting** is needed because the endpoint requires authentication

### Data Privacy

- The unarchive operation changes only the `is_archived` boolean flag and `archived_at` timestamp on the repository record — no PII is created, exposed, or modified
- Repository names and owner names are already public-facing identifiers for public repositories
- For private repositories, the response payload is only visible to users with at least read access
- The `archived_at` timestamp (when present) reveals when the repo was archived — this is acceptable public metadata for public repos
- Audit log entries recording the unarchive action contain the actor's user ID and the repository ID — both are internal identifiers that do not constitute PII exposure

### SSH Transport

- Repository unarchive is not available over SSH transport; it is an HTTP API operation only
- After unarchiving, the SSH server immediately allows write (push) operations to the repository — there is no cache or delay in permission evaluation since SSH authorization checks `is_archived` on each connection

## Telemetry & Product Analytics

### Business Events

**`repo.unarchived`**
Fired on every successful unarchive operation where the repository's archived state actually changed (not on idempotent no-ops).

Properties:
- `repo_id: number` — the repository's internal ID
- `repo_name: string` — the repository name
- `full_name: string` — `owner/repo` format
- `owner_id: number` — the repository owner's user or org ID
- `owner_name: string` — the repository owner's username or org name
- `owner_type: "user" | "org"` — whether the repo is user-owned or org-owned
- `actor_id: number` — the user who performed the unarchive
- `actor_name: string` — the username of the actor
- `unarchive_method: "web" | "cli" | "tui" | "api" | "desktop"` — which client surface initiated the action
- `was_archived_at: string` — ISO 8601 timestamp of when the repo was originally archived (the value of `archived_at` before the unarchive)
- `archive_duration_seconds: number` — how long the repository was archived (seconds between `archived_at` and now)
- `timestamp: string` — ISO 8601 timestamp of the unarchive event

**`repo.unarchive_failed`**
Fired on every failed unarchive attempt.

Properties:
- `repo_id: number | null` — the repository ID (null if not found)
- `owner: string` — the requested owner
- `repo_name: string` — the requested repo name
- `actor_id: number | null` — the user who attempted the action (null if unauthenticated)
- `error_code: string` — `"unauthorized"`, `"forbidden"`, `"not_found"`, `"internal"`
- `unarchive_method: "web" | "cli" | "tui" | "api" | "desktop"`

### Funnel Metrics & Success Indicators

- **Archive → Unarchive round-trip rate**: percentage of archived repositories that are eventually unarchived — indicates whether archiving is used as a temporary vs. permanent state
- **Average archive duration**: mean time between archive and unarchive — indicates typical use patterns (accidental archive vs. long-term hibernation)
- **Unarchive frequency**: total unarchives per week — indicates feature usage
- **Unarchive error rate**: percentage of unarchive attempts that fail (should be < 2%) — indicates permission model clarity and API reliability
- **Client distribution**: breakdown of unarchives by client surface — informs investment priority
- **Post-unarchive activity**: percentage of unarchived repos that receive a push within 24 hours — indicates the unarchive was intentional and the repo is actively used again
- **Re-archive rate**: percentage of unarchived repos that are re-archived within 7 days — indicates possible UX confusion or accidental unarchiving

## Observability

### Logging Requirements

**INFO level:**
- `repo.unarchived` — log every successful state-changing unarchive with structured context: `{ repo_id, owner, repo, actor_id, archive_duration_seconds, was_archived_at }`
- `repo.unarchive.idempotent` — log when unarchive is called on a non-archived repo (no state change) with: `{ repo_id, owner, repo, actor_id }`. This is informational, not an error.

**WARN level:**
- `repo.unarchive.permission_denied` — log permission failures with: `{ owner, repo, actor_id }`
- `repo.unarchive.not_found` — log 404 responses (repo does not exist or user lacks visibility) with: `{ owner, repo, actor_id }`

**ERROR level:**
- `repo.unarchive.db_error` — log database errors during the unarchive update with: `{ repo_id, owner, repo, error_message }` (no raw SQL or sensitive data)
- `repo.unarchive.unexpected_error` — log unexpected exceptions in the route handler with: `{ owner, repo, error_message, stack_trace }`

### Prometheus Metrics

**Counters:**
- `codeplane_repo_unarchive_total{status, method}` — total unarchive operations
  - `status`: `"success"` (state changed), `"idempotent"` (already unarchived), `"unauthorized"`, `"forbidden"`, `"not_found"`, `"server_error"`
  - `method`: `"web"`, `"cli"`, `"tui"`, `"api"`, `"desktop"`

**Histograms:**
- `codeplane_repo_unarchive_duration_seconds{method}` — latency of the unarchive endpoint, bucketed at 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0s
- `codeplane_repo_archive_duration_hours` — distribution of how long repositories stay archived before unarchive (in hours), bucketed at 0.1, 1, 6, 24, 72, 168, 720, 2160, 8760

### Alerts

**Alert: `RepoUnarchiveErrorRateHigh`**
- **Condition:** `rate(codeplane_repo_unarchive_total{status="server_error"}[5m]) > 0` sustained for 5 minutes
- **Severity:** Error
- **Runbook:**
  1. Check `repo.unarchive.db_error` and `repo.unarchive.unexpected_error` logs for the last 10 minutes
  2. Verify database connectivity: run a basic health query against the primary database
  3. Check `pg_stat_activity` for long-running transactions or lock contention on the `repositories` table
  4. Verify the `unarchiveRepo` SQL function exists and has not been dropped or altered by a migration
  5. Check disk space on the database volume
  6. If errors correlate with a recent deployment, roll back and investigate
  7. Escalate to database on-call if the issue is infrastructure-related

**Alert: `RepoUnarchiveLatencyHigh`**
- **Condition:** `histogram_quantile(0.99, rate(codeplane_repo_unarchive_duration_seconds_bucket[5m])) > 1.0`
- **Severity:** Warning
- **Runbook:**
  1. Check database query latency for the `UPDATE repositories` query using `pg_stat_statements` or query-level monitoring
  2. Look for table bloat on `repositories` — run `VACUUM ANALYZE repositories` if autovacuum is behind
  3. Check for lock contention: are there concurrent long-running transactions holding row locks on the target repository?
  4. Verify index health on `repositories(lower_name, user_id)` and `repositories(lower_name, org_id)`
  5. If latency is isolated to specific repos, investigate whether those repos have unusually large associated data or are targets of concurrent operations
  6. Check if the Hono middleware stack (request ID, auth, rate limit) is contributing unexpected latency

**Alert: `RepoUnarchiveSpikeDetected`**
- **Condition:** `rate(codeplane_repo_unarchive_total{status="success"}[5m]) > 20`
- **Severity:** Info
- **Runbook:**
  1. Check if a single actor is performing bulk unarchives (potential automation or migration script)
  2. Review `repo.unarchived` logs to identify the actor and affected repositories
  3. If it's a known migration or admin operation, no action needed — add a silence annotation
  4. If unexpected, check for abuse patterns: is the same user rapidly archiving/unarchiving?
  5. Verify rate limiting is functioning correctly for the affected user

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Recovery |
|-------|-------------|-------|----------|
| Authentication missing | 401 | No session cookie, PAT, or OAuth token | User must authenticate |
| Permission denied | 403 | User lacks admin role on the repository | User must request admin access from the repository owner |
| Repository not found | 404 | Repo doesn't exist, or private repo and user lacks visibility | Verify owner/repo spelling; request access if private |
| Owner parameter empty | 400 | Path parameter `:owner` is empty or whitespace | Provide a valid owner |
| Repo name parameter empty | 400 | Path parameter `:repo` is empty or whitespace | Provide a valid repository name |
| Database update failure | 500 | Database connectivity issue, lock timeout, or schema problem | Retry after short delay; if persistent, investigate DB health |
| Unexpected exception | 500 | Unhandled error in route handler or service | Check error logs; likely a code bug requiring a fix |
| Rate limit exceeded | 429 | Too many requests from this user | Wait and retry after the rate limit window resets |

## Verification

### API Integration Tests

**Happy Path:**
- [ ] `POST /api/repos/:owner/:repo/unarchive` on an archived repository returns HTTP 200 with `is_archived: false` and `archived_at` absent
- [ ] After unarchive, `GET /api/repos/:owner/:repo` confirms `is_archived: false` and `archived_at` absent
- [ ] After unarchive, `updated_at` timestamp is more recent than before the unarchive call
- [ ] `POST /api/repos/:owner/:repo/unarchive` on a non-archived repository returns HTTP 200 with current state (idempotent)
- [ ] Idempotent unarchive does NOT update `updated_at` (since no state change occurred)
- [ ] After unarchive, `PATCH /api/repos/:owner/:repo` with `{ "description": "new" }` succeeds (previously blocked while archived)
- [ ] Repository owner can unarchive their own repository
- [ ] Organization owner can unarchive an org-owned repository
- [ ] Admin collaborator (team or direct) can unarchive the repository
- [ ] PAT-authenticated admin can unarchive the repository

**Alias Endpoint (once mounted):**
- [ ] `DELETE /api/repos/:owner/:repo/archive` on an archived repository returns HTTP 200 with `is_archived: false` (if alias is implemented)
- [ ] `DELETE /api/repos/:owner/:repo/archive` behaves identically to `POST /api/repos/:owner/:repo/unarchive`

**Authentication & Authorization:**
- [ ] Unauthenticated request returns HTTP 401 with `{ "message": "authentication required" }`
- [ ] Authenticated user with no repository access returns HTTP 403 (public repo) or 404 (private repo)
- [ ] Authenticated user with read-only access returns HTTP 403
- [ ] Authenticated user with write access returns HTTP 403
- [ ] Authenticated user with admin access returns HTTP 200
- [ ] Repository owner returns HTTP 200
- [ ] Non-existent repository returns HTTP 404
- [ ] Private repository where user lacks visibility returns HTTP 404 (not 403)

**Parameter Validation:**
- [ ] Empty owner parameter returns HTTP 400 with `{ "message": "owner is required" }`
- [ ] Empty repo parameter returns HTTP 400 with `{ "message": "repository name is required" }`
- [ ] Owner with leading/trailing whitespace is trimmed and resolved correctly
- [ ] Repo name with leading/trailing whitespace is trimmed and resolved correctly
- [ ] Very long owner name (e.g., 256 characters) returns HTTP 404 (no such user)
- [ ] Very long repo name (e.g., 256 characters) returns HTTP 404 (no such repo)

**Post-Unarchive Behavioral Verification:**
- [ ] After unarchive, SSH push to the repository succeeds (previously rejected while archived)
- [ ] After unarchive, SSH clone/fetch still works (should work both archived and unarchived)
- [ ] After unarchive, issue creation via `POST /api/repos/:owner/:repo/issues` succeeds
- [ ] After unarchive, landing request creation succeeds
- [ ] After unarchive, workflow dispatch succeeds
- [ ] After unarchive, repository appears in default listings without `--archived` filter

**Concurrency:**
- [ ] Two concurrent `POST /api/repos/:owner/:repo/unarchive` requests both return HTTP 200 (no race condition or conflict)
- [ ] Archive followed immediately by unarchive succeeds — final state is `is_archived: false`
- [ ] Unarchive followed immediately by archive succeeds — final state is `is_archived: true`

### CLI E2E Tests

- [ ] `codeplane repo archive OWNER/REPO` then `codeplane repo unarchive OWNER/REPO` — exits 0, outputs `{ "status": "unarchived", "repo": "OWNER/REPO" }` in JSON mode
- [ ] `codeplane repo unarchive OWNER/REPO` (on non-archived repo) — exits 0, outputs unarchived status (idempotent)
- [ ] `codeplane repo view OWNER/REPO --json` after unarchive — confirms `archived: false`
- [ ] `codeplane repo unarchive NONEXISTENT/REPO` — exits non-zero with 404 error message
- [ ] `codeplane repo unarchive OWNER/REPO` without authentication — exits non-zero with 401 error message
- [ ] `codeplane repo unarchive OWNER/REPO` as non-admin user — exits non-zero with 403 error message
- [ ] `codeplane repo unarchive OWNER/REPO` (default output, not --json) — prints a human-friendly confirmation message containing the repo ref
- [ ] Full round-trip: create repo → archive → verify archived → unarchive → verify unarchived → push succeeds

### Web UI Playwright Tests

- [ ] Navigate to `/:owner/:repo/settings` for an archived repository — "Unarchive this repository" button is visible in the Danger Zone
- [ ] Click "Unarchive this repository" — confirmation dialog appears with correct title and body text
- [ ] Click "Cancel" in confirmation dialog — dialog closes, repository remains archived
- [ ] Click "Unarchive" in confirmation dialog — dialog closes, success toast appears, page re-renders without archive indicator
- [ ] After unarchive, the repository header no longer shows the "Archived" badge
- [ ] After unarchive, the Danger Zone section shows "Archive this repository" instead of "Unarchive"
- [ ] After unarchive, the General settings section fields (description, default bookmark, topics) are editable again
- [ ] Navigate to `/:owner/:repo/settings` for a non-archived repository — "Unarchive" button is NOT visible, "Archive" button IS visible
- [ ] Non-admin user visits settings page for an archived repository — sees archived indicator but no unarchive button
- [ ] Unauthenticated user attempting to access settings page — redirected to login
- [ ] After unarchive, refreshing the page confirms the state persists

### TUI Tests

- [ ] Navigate to repository settings tab for an archived repository — archive section shows `Status: ⊘ Archived` with "Unarchive this repository" action
- [ ] Press Enter on "Unarchive this repository" — confirmation prompt `Unarchive owner/repo? (y/n)` appears
- [ ] Press `y` at confirmation — status updates to unarchived, General fields become editable
- [ ] Press `n` at confirmation — no change, focus returns to action
- [ ] Navigate to repository settings tab for a non-archived repository — archive section shows `Status: Active` with "Archive this repository" action
- [ ] API error during unarchive — inline error message displayed, retry is possible
- [ ] `R` key refreshes state after unarchive — confirms current state from API

### Webhook & Audit Integration Tests

- [ ] After unarchive, a `repo.unarchived` webhook event is delivered to configured repository webhooks
- [ ] After unarchive, a `repo.unarchived` webhook event is delivered to org-level webhooks (for org-owned repos)
- [ ] Webhook payload includes `repo_id`, `owner`, `repo_name`, `actor_id`, and `timestamp`
- [ ] After unarchive, an audit log entry is created with action `repo.unarchive`, actor, and target repository
- [ ] Idempotent unarchive (repo was not archived) does NOT fire a webhook or audit log entry

### Activity Feed Tests

- [ ] After unarchive, a `repo.unarchive` event appears in the TUI dashboard activity feed
- [ ] The activity feed event shows the correct icon (`⊙`), color (green), actor, and repository name
- [ ] Filtering the activity feed by repository events includes the unarchive event
