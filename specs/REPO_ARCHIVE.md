# REPO_ARCHIVE

Specification for REPO_ARCHIVE.

## High-Level User POV

When a repository is no longer under active development—whether the project has been completed, deprecated, superseded, or simply paused—its owner or administrator can archive it. Archiving a repository is the Codeplane equivalent of putting a project on the shelf: it remains fully visible and readable, but is clearly marked as inactive and protected from accidental modifications.

An archived repository keeps all of its existing content intact. Users can still browse its code, read its issues and landing requests, clone it, fork it, and reference it. What changes is that the repository becomes read-only: pushes are refused, metadata updates are blocked, and every surface in Codeplane—web, CLI, TUI, desktop, and editors—displays a clear visual indicator that the repository is archived and when it was archived.

Archiving is a reversible, non-destructive action. The owner or an administrator can unarchive the repository at any time to restore full write access. Both operations are idempotent: archiving an already-archived repository or unarchiving an already-active repository simply returns the current state without error.

The primary value of archive is governance and signal. Teams use it to communicate that a codebase is no longer maintained, to prevent accidental commits to legacy projects, and to keep their repository lists honest about which projects are alive. Because Codeplane treats archive as a first-class state rather than a tag or label, the enforcement is deep: SSH transport, API mutations, workflow dispatch, and metadata edits all respect the archived boundary.

## Acceptance Criteria

- **Archive action**: An authenticated user with admin or owner permission on a repository can archive it via API, CLI, TUI, or web UI.
- **Unarchive action**: An authenticated user with admin or owner permission on a repository can unarchive it via API, CLI, TUI, or web UI.
- **Idempotency**: Archiving an already-archived repository returns HTTP 200 with the current state. Unarchiving an already-active repository returns HTTP 200 with the current state. Neither operation produces an error.
- **Timestamp tracking**: When a repository is archived, `archived_at` is set to the current server timestamp. When unarchived, `archived_at` is cleared to null.
- **SSH push protection**: Git push (`git-receive-pack`) over SSH is rejected with "permission denied: repository is archived" for archived repositories. Git clone/fetch (`git-upload-pack`) remains allowed.
- **Smart HTTP push protection**: HTTP-based push operations are rejected for archived repositories with the same error semantics as SSH.
- **Metadata update block**: PATCH requests to update repository description, default bookmark, or topics are rejected with HTTP 422 when the repository is archived.
- **Read operations unaffected**: All read operations—code browsing, issue viewing, landing request viewing, search indexing, starring, watching, forking, cloning—continue to work on archived repositories.
- **Forking allowed**: Users may fork an archived repository. The resulting fork is created in an unarchived state.
- **Visual indicator in all clients**: Archived repositories display a visible "Archived" badge or label in every client surface where the repository appears (web repo header, CLI repo view, TUI repo overview, editor status, repository list views).
- **Archived timestamp display**: When viewing an archived repository's details, the date/time it was archived is displayed.
- **Repository list inclusion**: Archived repositories appear in repository lists but are visually distinguished. Repository list views should support filtering by archived status.
- **API response contract**: The repository response object always includes `is_archived: boolean`. The field `archived_at` (ISO 8601 string) is present only when the repository is archived.
- **Issue creation on archived repos**: Issue creation remains allowed on archived repositories (issues track bugs in shipped software).
- **Workflow dispatch block**: Manual workflow dispatch is rejected on archived repositories.
- **Landing request creation block**: New landing requests cannot be created against archived repositories.
- **Confirmation required**: Web UI and TUI must present a confirmation dialog before archiving or unarchiving a repository. CLI should accept the action directly (confirmation is the user's responsibility at the command line).
- **Boundary: repository name length**: The archive endpoint must handle repository names up to the maximum allowed length (255 characters) without error.
- **Boundary: rapid toggling**: Rapidly archiving and unarchiving the same repository must not corrupt state. Each operation is serialized at the database level.
- **Error: repository not found**: Returns HTTP 404 when the owner or repository does not exist.
- **Error: unauthenticated**: Returns HTTP 401 when no valid session, PAT, or OAuth token is provided.
- **Error: insufficient permission**: Returns HTTP 403 when the authenticated user does not have admin or owner permission on the repository.

## Design

### API Shape

**Archive a Repository**

```
POST /api/repos/:owner/:repo/archive
```

- **Authentication**: Required (session cookie, PAT, or OAuth token)
- **Authorization**: Admin or owner permission on the repository
- **Request Body**: None
- **Success Response**: `200 OK` with full `RepoResponse` object, `is_archived: true`, `archived_at: "<ISO 8601>"`
- **Error Responses**:
  - `401 Unauthorized` — not authenticated
  - `403 Forbidden` — insufficient permission
  - `404 Not Found` — repository or owner does not exist

**Unarchive a Repository**

```
POST /api/repos/:owner/:repo/unarchive
```

- **Authentication**: Required (session cookie, PAT, or OAuth token)
- **Authorization**: Admin or owner permission on the repository
- **Request Body**: None
- **Success Response**: `200 OK` with full `RepoResponse` object, `is_archived: false`, `archived_at` field absent
- **Error Responses**:
  - `401 Unauthorized` — not authenticated
  - `403 Forbidden` — insufficient permission
  - `404 Not Found` — repository or owner does not exist

**Repository Response Fields (archive-related)**

| Field | Type | Presence | Description |
|-------|------|----------|-------------|
| `is_archived` | `boolean` | Always | Whether the repository is currently archived |
| `archived_at` | `string` (ISO 8601) | Only when archived | Timestamp of when the repository was archived |

### SDK Shape

The SDK service exposes two methods:

- `repoService.archiveRepo(actor, owner, repo)` → `Result<RepoRow, APIError>`
- `repoService.unarchiveRepo(actor, owner, repo)` → `Result<RepoRow, APIError>`

Both require the actor to pass `canAdminRepo()` authorization. Both are idempotent.

The SDK also exposes the archive state on `RepoRow`:
- `isArchived: boolean`
- `archivedAt: Date | null`

### CLI Command

**Archive**

```
codeplane repo archive <OWNER/REPO>
```

- Sends `POST /api/repos/:owner/:repo/archive`
- Text output: `Archived repository owner/repo`
- JSON output: `{ "status": "archived", "repo": "owner/repo" }`
- Exit code 0 on success, non-zero on error

**Unarchive**

```
codeplane repo unarchive <OWNER/REPO>
```

- Sends `POST /api/repos/:owner/:repo/unarchive`
- Text output: `Unarchived repository owner/repo`
- JSON output: `{ "status": "unarchived", "repo": "owner/repo" }`
- Exit code 0 on success, non-zero on error

**Repo View**

`codeplane repo view` output must include the archive status:
- Text output: displays "Archived: Yes (since <date>)" or "Archived: No"
- JSON output: includes `is_archived` and `archived_at` fields

### Web UI Design

**Repository Header**

When a repository is archived, the repository header displays:
- An amber/yellow "Archived" badge next to the repository name
- A subtle banner below the header: "This repository has been archived by the owner. It is now read-only." with the archived date

**Repository Settings Page (Danger Zone)**

The archive/unarchive action appears in the repository settings danger zone section:

- **When not archived**: A section titled "Archive this repository" with explanatory text: "Mark this repository as archived and read-only." A yellow "Archive this repository" button opens a confirmation dialog.
- **When archived**: A section titled "Unarchive this repository" with explanatory text: "Restore write access to this repository." A green "Unarchive this repository" button opens a confirmation dialog.

**Confirmation Dialog**

- Title: "Archive repository?" / "Unarchive repository?"
- Body: "Are you sure you want to archive **owner/repo**? This will make the repository read-only. Pushes, metadata updates, and new landing requests will be blocked." / "Are you sure you want to unarchive **owner/repo**? This will restore full write access."
- Actions: "Archive" (yellow/destructive) + "Cancel" / "Unarchive" (green/primary) + "Cancel"
- The repository name must be displayed in the dialog for clarity.

**Repository List Views**

- Archived repositories show a small "Archived" tag/badge next to the name
- Repository list filters include an "Archived" filter option (show all / active only / archived only)

**Archived Repository Write Surfaces**

When viewing an archived repository, write-oriented UI elements should be visually disabled or hidden:
- "New landing request" button is disabled with tooltip "Repository is archived"
- Workflow "Run workflow" button is disabled with tooltip "Repository is archived"
- Repository settings fields (description, topics, default bookmark) are read-only with a note indicating the repository must be unarchived first

### TUI UI

**Repository Overview Screen**

- Archived repositories display an "[ARCHIVED]" badge in the header, styled with a yellow/amber color

**Repository Settings Screen (Tab 6)**

- Archive section shows current status: "Status: Active" or "Status: Archived (since <date>)"
- Action button: "Archive this repository" (yellow) or "Unarchive this repository" (green)
- Both actions require `y/n` confirmation prompt inline
- When archived: general settings fields (name, description, default bookmark, topics) become read-only

**Repository List Screen**

- Archived repositories show an `[A]` indicator next to the name in the list

### Editor Integrations

**VS Code Extension**

- Repository status bar item shows "(archived)" suffix when the current repository is archived
- Issue/landing tree views continue to show data for archived repos
- Push-related commands should display a warning notification when attempted on an archived repository

**Neovim Plugin**

- Status line component includes "archived" indicator when current repo is archived
- `:Codeplane push`-related commands should display a warning when the repo is archived

### Documentation

The following end-user documentation should be written:

1. **Repository Guide — Archive Section**: Add a section to the existing repositories guide explaining what archiving does and does not do, how to archive/unarchive via web UI, CLI, and TUI, what operations are blocked (push, metadata update, workflow dispatch, landing request creation), what operations remain available (read, clone, fork, issues, search), and permission requirements (admin or owner).

2. **CLI Reference — `repo archive` and `repo unarchive`**: Command reference entries with usage, examples, and expected output for both text and JSON modes.

3. **API Reference — Archive/Unarchive Endpoints**: Document both POST endpoints with request/response schemas, error codes, and idempotency behavior.

## Permissions & Security

### Authorization Roles

| Action | Owner | Admin | Member (Write) | Member (Read) | Anonymous |
|--------|-------|-------|-----------------|---------------|----------|
| Archive repository | ✅ | ✅ | ❌ | ❌ | ❌ |
| Unarchive repository | ✅ | ✅ | ❌ | ❌ | ❌ |
| View archived repository | ✅ | ✅ | ✅ | ✅ | ✅ (if public) |
| Clone/fetch archived repository | ✅ | ✅ | ✅ | ✅ | ✅ (if public) |
| Fork archived repository | ✅ | ✅ | ✅ | ✅ | ✅ (if public, with account) |
| Push to archived repository | ❌ | ❌ | ❌ | ❌ | ❌ |

**Key**: Archive/unarchive is strictly admin-or-above. Once archived, **nobody** can push, regardless of their permission level. The only way to restore write access is to unarchive.

### Rate Limiting

- Archive and unarchive endpoints should share the standard repository mutation rate limit (e.g., 30 requests per minute per user per repository).
- Rapid toggle abuse (archive → unarchive → archive loops) is naturally bounded by this rate limit.
- No additional rate limiting is needed beyond the standard mutation rate.

### Data Privacy

- Archive/unarchive operations do not expose PII beyond what the repository response already contains (owner username, repository name).
- The `archived_at` timestamp does not constitute PII.
- Audit logs recording who archived/unarchived a repository should include the actor's user ID, not their email or other PII.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `RepositoryArchived` | Repository successfully archived | `repo_id`, `owner_id`, `actor_id`, `repo_visibility` (public/private), `repo_age_days` (days since creation), `open_issues_count`, `open_landings_count` |
| `RepositoryUnarchived` | Repository successfully unarchived | `repo_id`, `owner_id`, `actor_id`, `repo_visibility`, `archive_duration_days` (days it was archived) |
| `ArchivedRepoPushRejected` | SSH or HTTP push rejected due to archive | `repo_id`, `actor_id`, `transport` (ssh/http) |
| `ArchivedRepoWriteBlocked` | Metadata update, workflow dispatch, or landing request creation blocked | `repo_id`, `actor_id`, `blocked_action` (metadata_update, workflow_dispatch, landing_request_create) |

### Funnel Metrics

- **Archive adoption rate**: Percentage of repositories that have been archived at least once, by org and globally.
- **Unarchive rate**: Of archived repositories, what percentage are unarchived within 7/30/90 days? A high unarchive rate may indicate users archive prematurely or the feature causes unexpected friction.
- **Push rejection rate on archived repos**: Frequency of push attempts to archived repositories. A sustained high rate suggests users are not aware of archive status, pointing to a UI/notification gap.
- **Archive dwell time**: Median and p95 duration repositories remain archived before being unarchived or deleted.

### Success Indicators

- Archive operations complete in < 200ms p99.
- Fewer than 5% of archive actions are followed by an unarchive within 1 hour (indicating accidental archiving is rare).
- Push rejection messages on archived repos decrease over time as users learn the visual indicators.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------|
| Repository archived | `INFO` | `repo_id`, `owner`, `repo_name`, `actor_id`, `actor_username` |
| Repository unarchived | `INFO` | `repo_id`, `owner`, `repo_name`, `actor_id`, `actor_username`, `archive_duration_seconds` |
| Archive permission denied | `WARN` | `repo_id`, `owner`, `repo_name`, `actor_id`, `actor_username`, `required_permission: "admin"` |
| SSH push rejected (archived) | `WARN` | `repo_id`, `owner`, `repo_name`, `key_fingerprint`, `transport: "ssh"` |
| HTTP push rejected (archived) | `WARN` | `repo_id`, `owner`, `repo_name`, `actor_id`, `transport: "http"` |
| Archive/unarchive DB error | `ERROR` | `repo_id`, `owner`, `repo_name`, `error_message`, `error_code` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_repo_archive_total` | Counter | `action` (archive/unarchive), `status` (success/error/noop) | Total archive/unarchive operations. `noop` = idempotent no-change. |
| `codeplane_repo_archive_duration_seconds` | Histogram | `action` (archive/unarchive) | Latency of archive/unarchive operations |
| `codeplane_repo_archived_push_rejected_total` | Counter | `transport` (ssh/http) | Total push attempts rejected due to archive status |
| `codeplane_repos_archived_gauge` | Gauge | — | Current count of archived repositories |

### Alerts

**Alert: High Archive Error Rate**
- **Condition**: `rate(codeplane_repo_archive_total{status="error"}[5m]) > 0.1`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `archive/unarchive DB error` entries filtered by the last 5 minutes.
  2. Verify database connectivity: run a health check query against the repositories table.
  3. Check if the `repositories` table has any lock contention (long-running transactions or deadlocks).
  4. If errors are isolated to a single repository, check for data integrity issues on that row.
  5. If errors are widespread, escalate to database on-call and check disk space, connection pool exhaustion, and replication lag.

**Alert: Unusual Push Rejection Spike on Archived Repos**
- **Condition**: `rate(codeplane_repo_archived_push_rejected_total[15m]) > 10`
- **Severity**: Info
- **Runbook**:
  1. Identify which repositories are generating the rejections from structured logs.
  2. Check if a recently archived repository has active CI/CD pipelines still attempting to push.
  3. Notify the repository owner that their CI may need to be updated.
  4. If rejections come from many different repos, investigate whether a bulk archive operation occurred without adequate team communication.

**Alert: Archive Operation Latency Spike**
- **Condition**: `histogram_quantile(0.99, codeplane_repo_archive_duration_seconds) > 2`
- **Severity**: Warning
- **Runbook**:
  1. Check database slow query log for archive/unarchive UPDATE statements.
  2. Verify there are no table-level locks on the `repositories` table.
  3. Check for index bloat or missing indexes on `repositories.id`.
  4. Review recent schema migrations that may have affected the repositories table.
  5. If latency correlates with high overall DB load, coordinate with platform team on capacity.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior |
|------------|-------------|----------|
| Repository not found | 404 | Return standard error payload |
| User not authenticated | 401 | Return authentication required error |
| User lacks admin permission | 403 | Return permission denied error |
| Database write failure | 500 | Log ERROR, return internal server error, do not change archive state |
| Database connection timeout | 500 | Log ERROR, return internal server error with retry-after hint |
| Concurrent archive/unarchive on same repo | 200 | Last write wins at DB level; both return the final consistent state |
| Malformed owner/repo path parameters | 404 | Treated as repository not found |

## Verification

### API Integration Tests

1. **Archive a repository successfully**: POST to `/api/repos/:owner/:repo/archive` with admin auth. Assert 200, `is_archived: true`, `archived_at` is valid ISO 8601.
2. **Unarchive a repository successfully**: POST to `/api/repos/:owner/:repo/unarchive` with admin auth. Assert 200, `is_archived: false`, `archived_at` absent.
3. **Archive idempotency**: Archive an already-archived repository. Assert 200, no error, state unchanged.
4. **Unarchive idempotency**: Unarchive an already-active repository. Assert 200, no error, state unchanged.
5. **Archive without authentication**: POST to archive endpoint with no auth. Assert 401.
6. **Archive with read-only permission**: POST to archive endpoint with a read-only user. Assert 403.
7. **Archive with write (non-admin) permission**: POST to archive endpoint with a write-permission member. Assert 403.
8. **Archive non-existent repository**: POST to archive endpoint for a repo that doesn't exist. Assert 404.
9. **Archive non-existent owner**: POST to archive endpoint for an owner that doesn't exist. Assert 404.
10. **Unarchive without authentication**: POST to unarchive endpoint with no auth. Assert 401.
11. **Unarchive with insufficient permission**: POST to unarchive endpoint with a non-admin user. Assert 403.
12. **Archive then view**: Archive a repo, then GET the repo. Assert `is_archived: true` and `archived_at` is present and valid.
13. **Unarchive then view**: Unarchive a repo, then GET the repo. Assert `is_archived: false` and `archived_at` is absent.
14. **Archive preserves all other repo fields**: Archive a repo, verify all other response fields (name, description, visibility, topics, stars, etc.) are unchanged.
15. **Maximum-length repository name archive**: Create a repo with a 255-character name, archive it. Assert 200 success.
16. **Repository name with special characters**: Create a repo with hyphens, underscores, and dots in the name. Archive it. Assert 200 success.
17. **Archived repo metadata update blocked**: Archive a repo, then PATCH description. Assert 422 or 403 rejection.
18. **Archived repo topic update blocked**: Archive a repo, then PATCH topics. Assert 422 or 403 rejection.
19. **Archived repo default bookmark update blocked**: Archive a repo, then PATCH default bookmark. Assert 422 or 403 rejection.
20. **Unarchive restores metadata editability**: Archive a repo, unarchive it, then PATCH description. Assert 200 success.
21. **Repository response always includes is_archived**: GET any repo (archived or not). Assert `is_archived` field is always present and is a boolean.
22. **archived_at absent for active repos**: GET a non-archived repo. Assert `archived_at` field is not present in the response body.
23. **archived_at format validation**: Archive a repo. Assert `archived_at` matches ISO 8601 format (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/`).
24. **Rapid archive/unarchive toggle**: Archive and unarchive the same repo 10 times in sequence. Assert final state matches last operation and no errors occur.

### SSH Transport Tests

25. **SSH push rejected on archived repo**: Archive a repo, attempt `git push` over SSH. Assert rejection with "repository is archived" message.
26. **SSH clone allowed on archived repo**: Archive a repo, attempt `git clone` over SSH. Assert success.
27. **SSH fetch allowed on archived repo**: Archive a repo, attempt `git fetch` over SSH. Assert success.
28. **SSH push works after unarchive**: Archive a repo, unarchive it, attempt `git push` over SSH. Assert success.

### CLI E2E Tests

29. **CLI archive command**: Run `codeplane repo archive owner/repo --json`. Assert exit code 0, output contains `{ "status": "archived" }`.
30. **CLI unarchive command**: Run `codeplane repo unarchive owner/repo --json`. Assert exit code 0, output contains `{ "status": "unarchived" }`.
31. **CLI archive then view**: Run `codeplane repo archive`, then `codeplane repo view --json`. Assert `is_archived: true` in view output.
32. **CLI unarchive then view**: Run `codeplane repo unarchive`, then `codeplane repo view --json`. Assert `is_archived: false` in view output.
33. **CLI archive text output**: Run `codeplane repo archive owner/repo` (no `--json`). Assert output contains "Archived repository owner/repo".
34. **CLI unarchive text output**: Run `codeplane repo unarchive owner/repo` (no `--json`). Assert output contains "Unarchived repository owner/repo".
35. **CLI archive non-existent repo**: Run `codeplane repo archive nonexistent/repo`. Assert non-zero exit code and error message.
36. **CLI archive without auth**: Run `codeplane repo archive owner/repo` without a valid auth token. Assert non-zero exit code and auth error.

### Web UI E2E Tests (Playwright)

37. **Archive from settings page**: Navigate to repo settings → danger zone. Click "Archive this repository". Confirm dialog. Assert page reloads with "Archived" badge visible in repository header.
38. **Unarchive from settings page**: Navigate to archived repo settings → danger zone. Click "Unarchive this repository". Confirm dialog. Assert "Archived" badge is removed.
39. **Archive confirmation dialog cancel**: Navigate to repo settings → danger zone. Click "Archive this repository". Click "Cancel" in dialog. Assert repository is not archived.
40. **Archived badge in repository header**: Archive a repo. Navigate to repo overview. Assert "Archived" badge is visible.
41. **Archived banner message**: Archive a repo. Navigate to repo overview. Assert banner text contains "archived" and "read-only".
42. **Archived repo settings fields read-only**: Archive a repo. Navigate to repo settings general tab. Assert description, topics, and default bookmark fields are disabled/read-only.
43. **Archived repo in repository list**: Archive a repo. Navigate to user's repository list. Assert the repo appears with an "Archived" indicator.
44. **Repository list archive filter**: Archive one repo, keep another active. Use the archive filter to show "archived only". Assert only the archived repo appears. Switch to "active only". Assert only the active repo appears.
45. **New landing request button disabled on archived repo**: Archive a repo. Navigate to repo landing requests page. Assert "New landing request" button is disabled with appropriate tooltip.
46. **Workflow dispatch button disabled on archived repo**: Archive a repo. Navigate to repo workflows page. Assert "Run workflow" button is disabled with appropriate tooltip.

### Fork and Social Tests

47. **Fork an archived repo**: Archive a repo. Fork it as another user. Assert fork is created successfully and the fork is NOT archived.
48. **Star an archived repo**: Archive a repo. Star it as another user. Assert star is recorded.
49. **Watch an archived repo**: Archive a repo. Watch it as another user. Assert watch is recorded.

### Landing Request and Workflow Tests

50. **Landing request creation blocked on archived repo**: Archive a repo. Attempt to create a landing request via API. Assert 422 or 403 rejection.
51. **Workflow dispatch blocked on archived repo**: Archive a repo. Attempt to dispatch a workflow via API. Assert 422 or 403 rejection.
52. **Existing landing requests remain viewable**: Create a landing request, then archive the repo. Assert the landing request is still viewable via API and UI.
53. **Existing workflow runs remain viewable**: Trigger a workflow run, then archive the repo. Assert the run and its logs are still viewable.
