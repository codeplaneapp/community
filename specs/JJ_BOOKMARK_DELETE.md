# JJ_BOOKMARK_DELETE

Specification for JJ_BOOKMARK_DELETE.

## High-Level User POV

When a developer no longer needs a bookmark in their Codeplane repository, they should be able to remove it cleanly from any surface they work in — the web UI, the CLI, the TUI, or an editor. Deleting a bookmark is one of the most common housekeeping operations in a jj-native workflow. As features land, experiments conclude, or naming conventions change, stale bookmarks accumulate and clutter the bookmark list, making it harder to navigate the repository and harder for teammates to find the work that matters.

Codeplane's bookmark delete feature gives every user with write access a fast, safe way to remove a bookmark from a repository. The experience is deliberately cautious: the user is always asked to confirm the deletion before it happens, and certain bookmarks — the repository's default bookmark and bookmarks matching a protected pattern — are shielded from accidental removal. Deleting a bookmark does not destroy any changes or history. It only removes the named pointer. The underlying changes, commits, and operation log remain intact, preserving jj's append-only history model.

From the web UI, the user finds a delete action on the bookmark list or bookmark detail view and confirms through a dialog. From the CLI, the user runs `codeplane bookmark delete <name>` and sees immediate confirmation or a clear error explaining why the deletion was blocked. From the TUI, the user presses `x` on a focused bookmark and confirms with `y`. In every client, the interaction follows the same contract: authenticate, verify permissions, check that the bookmark is neither default nor protected, remove it, and confirm.

The feature also supports remote (API-backed) deletion when a `--repo OWNER/REPO` flag is provided in the CLI, as well as local-only deletion when operating against a local jj repository without a remote. This dual mode ensures that bookmark management works both in the server-hosted collaborative model and in the local-first daemon-backed model.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `DELETE /api/repos/:owner/:repo/bookmarks/:name` removes the specified bookmark and returns `204 No Content`
- [ ] The bookmark is removed from both the jj repository on disk (via `jj bookmark delete`) and the database record (via `deleteBookmarkByName`)
- [ ] The CLI command `codeplane bookmark delete <name>` works locally (via `jj bookmark delete`) and remotely (via the API when `--repo` is provided)
- [ ] The TUI supports deletion via `x` key with `y` confirmation on the bookmarks tab
- [ ] The web UI supports deletion via a row-level action menu with a confirmation modal
- [ ] The default bookmark cannot be deleted by any user at any permission level
- [ ] Protected bookmarks (matching patterns in the `protected_bookmarks` table) can only be deleted by Admin or Owner roles
- [ ] Non-protected, non-default bookmarks can be deleted by any user with Write (Member), Admin, or Owner access
- [ ] All clients agree on the same error semantics: 400 for bad input, 401 for unauthenticated, 403 for insufficient permissions, 404 for not found, 422 for protected/default bookmark deletion attempts
- [ ] Deleting a bookmark that has already been deleted returns 404 (idempotent-safe, not 500)
- [ ] The `bookmark.deleted` telemetry event fires on every successful deletion
- [ ] Structured logs capture every deletion at `info` level with repository and bookmark context

### Boundary Constraints

- Bookmark name: must match the character set `/^[a-zA-Z0-9._\/-]+$/`
- Bookmark name maximum length: 200 characters
- Bookmark name must not be empty, consist solely of whitespace, or be URL-encoded whitespace after trimming
- Bookmark name must not start or end with a slash, dot, or hyphen
- Bookmark name must not contain consecutive slashes (`//`) or consecutive dots (`..`)
- The `:name` path parameter is URL-decoded before validation (e.g., `feature%2Fauth` becomes `feature/auth`)
- Owner parameter: 1–39 characters, alphanumeric and hyphens, must not start or end with a hyphen
- Repo parameter: 1–100 characters, alphanumeric, hyphens, underscores, and dots
- Attempting to delete the repository's default bookmark always returns 422 regardless of the caller's role
- Attempting to delete a protected bookmark without Admin/Owner role returns 403
- Deleting a bookmark does not cascade to any other entities — changes, landing requests, and operation log entries remain intact
- If a landing request references the deleted bookmark as `source_bookmark`, the landing request retains the bookmark name as a historical string; it is not invalidated

### Edge Cases

- Bookmark name is empty after URL decoding and trimming: returns 400
- Bookmark name is exactly 200 characters: accepted
- Bookmark name is 201 characters: returns 400
- Bookmark name contains only allowed special characters (e.g., `feature/v1.2-beta_3`): accepted
- Bookmark name contains Unicode characters outside the allowed set: returns 400
- Bookmark name with URL-encoded slashes (`%2F`): decoded and processed normally
- Bookmark name is `main` and `main` is the default bookmark: returns 422 ("cannot delete the default bookmark")
- Bookmark name matches a protected pattern but caller is Admin: allowed (204)
- Bookmark name matches a protected pattern but caller is Write (Member): returns 403
- Bookmark does not exist in the repository: returns 404
- Repository does not exist: returns 404
- Private repository accessed by unauthenticated user: returns 404 (not 403, to avoid leaking existence)
- Private repository accessed by authenticated non-collaborator: returns 404
- Bookmark is deleted concurrently by two clients: first succeeds (204), second returns 404
- Bookmark is the target of an open landing request: deletion succeeds; the landing request retains the bookmark name as metadata
- Bookmark is tracking a remote: deletion succeeds; remote tracking state is removed along with the bookmark
- Repository is archived: returns 403 ("repository is archived")
- Request with a request body on DELETE: body is ignored (no 400 for unexpected body)
- Rapid sequential deletions of different bookmarks: each succeeds independently
- CLI `--yes` flag bypasses interactive confirmation prompt
- CLI without `--yes` in non-interactive terminal (piped stdin): returns error prompting for `--yes`

## Design

### API Shape

**Delete Bookmark**

```
DELETE /api/repos/:owner/:repo/bookmarks/:name
```

Path parameters:
- `owner` (string, required): repository owner username or organization name
- `repo` (string, required): repository name
- `name` (string, required): bookmark name (URL-encoded if it contains slashes)

Headers:
- `Authorization: Bearer codeplane_<token>` or session cookie (required)

Response `204 No Content`:
- Empty body
- Indicates the bookmark was successfully deleted

Error responses:

| Status | Condition | Body Shape |
|--------|-----------|------------|
| `400 Bad Request` | Missing or invalid owner, repo, or bookmark name | `{ "error": "bookmark name is required" }` |
| `401 Unauthorized` | No auth credentials provided | `{ "error": "authentication required" }` |
| `403 Forbidden` | Caller lacks write access, or bookmark is protected and caller is not Admin/Owner, or repo is archived | `{ "error": "insufficient permissions" }` or `{ "error": "bookmark is protected; admin access required" }` or `{ "error": "repository is archived" }` |
| `404 Not Found` | Repository does not exist, caller lacks access to private repo, or bookmark does not exist | `{ "error": "not found" }` |
| `422 Unprocessable Entity` | Attempt to delete the default bookmark | `{ "error": "cannot delete the default bookmark" }` |
| `429 Too Many Requests` | Rate limited | `{ "error": "rate limit exceeded" }`, includes `Retry-After` header |
| `500 Internal Server Error` | Unexpected failure | `{ "error": "internal server error" }` |

### SDK Shape

The `RepoHostService` in `@codeplane/sdk` provides:

```typescript
/**
 * Delete a bookmark by name.
 * Shells out to `jj bookmark delete <name>` and removes the DB record.
 */
deleteBookmark(
  owner: string,
  repo: string,
  name: string
): Promise<Result<void, APIError>>
```

The database layer provides:

```typescript
deleteBookmarkByName(sql: Sql, args: { repositoryId: string; name: string }): Promise<void>
```

The route handler orchestration is:

1. Authenticate the caller
2. Resolve the repository (owner + repo name → repository record)
3. Check that the repository is not archived
4. Check that the bookmark exists (list bookmarks filtered by name, or direct DB lookup)
5. Check that the bookmark is not the default bookmark
6. Check whether the bookmark matches any protected bookmark pattern for this repository
7. If protected, verify the caller has Admin or Owner role
8. If not protected, verify the caller has at least Write (Member) role
9. Call `repoHostService.deleteBookmark(owner, repo, name)` to remove from jj on disk
10. Call `deleteBookmarkByName(sql, { repositoryId, name })` to remove the DB record
11. Return 204

### CLI Command

```
codeplane bookmark delete <name> [--repo OWNER/REPO] [--yes] [--json]
```

Arguments:
- `name` (string, required): the bookmark name to delete

Options:
- `--repo OWNER/REPO` (string, optional): target a remote repository via the API. When omitted, operates on the local jj repository in the current working directory.
- `--yes` / `-y` (boolean, optional): skip interactive confirmation prompt
- `--json` (boolean, optional): output result as JSON

Behavior:
- **Local mode** (no `--repo`): checks bookmark existence via `hasLocalBookmark()`, prompts for confirmation (unless `--yes`), calls `deleteLocalBookmark()`, prints human-readable message
- **Remote mode** (`--repo` provided): calls `DELETE /api/repos/:owner/:repo/bookmarks/:name`, prints human-readable message or JSON result
- Human-readable output on success: `Deleted bookmark {name}`
- JSON output on success: `{ "status": "deleted", "name": "{name}" }`
- JSON output is `undefined` (empty) when `--json` is used without `--format explicit`
- Human-readable output on error: `Error: Bookmark {name} was not found` (exit code 1)
- Non-interactive terminal without `--yes`: `Error: Use --yes to confirm deletion in non-interactive mode` (exit code 1)

### Web UI Design

The delete action is available from the bookmark list page (`/:owner/:repo/bookmarks`) within the repository workbench:

- Each bookmark row has a kebab menu (`⋮`) on the right side
- The menu contains a "Delete bookmark" action, styled in destructive red text
- The action is hidden for users without write access (Read-only and Anonymous) and for the default bookmark row (replaced with disabled tooltip: "Default bookmark cannot be deleted")
- Clicking "Delete bookmark" opens a confirmation modal

**Confirmation modal:**
- Title: "Delete bookmark"
- Body: `Are you sure you want to delete the bookmark "{name}"? This will not delete any changes or history.`
- If the bookmark is protected, an additional warning: `This bookmark is protected. You must have admin access to delete it.`
- Two buttons: "Cancel" (secondary) and "Delete" (destructive red)
- Pressing Enter submits the modal; pressing Escape dismisses it
- While the request is in flight, the "Delete" button shows a spinner and is disabled
- On success: modal closes, bookmark list refreshes, toast notification: `Bookmark "{name}" deleted`
- On 403 error: inline error in modal: `You do not have permission to delete this bookmark.`
- On 404 error: inline error: `Bookmark not found. It may have been deleted by another user.` and list refreshes
- On 422 error: inline error: `Cannot delete the default bookmark.`
- On network/500 error: inline error: `Something went wrong. Please try again.`

### TUI UI

On the Bookmarks tab (tab `1`) within the repository detail screen:

- `x` key on a focused bookmark opens a confirmation prompt at the bottom: `Delete bookmark "{name}"? (y/N)`
- `y` confirms and triggers the deletion; `N`, `n`, `Esc`, or any other key cancels
- `x` is blocked on the default bookmark (shows "Cannot delete the default bookmark.") and for read-only users (shows "Insufficient permissions")
- On success: bookmark removed from list, focus moves to next row (or previous if last), status message for 3 seconds
- On error: inline error message replaces the confirmation prompt for 3 seconds

### VS Code Extension

- Each non-default bookmark tree item has a context menu action: "Delete Bookmark"
- Default bookmark tree item does not show the delete action
- Clicking triggers a VS Code confirmation dialog; on confirmation, the API is called
- On success: tree view refreshes, notification appears
- On error: VS Code error notification with error message

### Neovim Plugin

- `:Codeplane bookmark delete <name>` command to delete a bookmark
- In Telescope picker, `<C-x>` triggers deletion with `[y/N]` confirmation
- On success: echo message; on error: echoerr with message

### Documentation

- **CLI reference**: `codeplane bookmark delete` — usage, arguments, flags, examples, local vs. remote behavior
- **API reference**: `DELETE /api/repos/:owner/:repo/bookmarks/:name` — path parameters, auth, response codes, error shapes, protected/default restrictions
- **TUI guide**: Bookmark deletion — `x` key workflow, confirmation, permissions, status messages
- **Web UI guide**: Bookmark deletion — kebab menu, confirmation modal, protected warnings, toasts
- **Concepts guide update**: Bookmark lifecycle section — creating, deleting, and relationship to change/commit preservation

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write (Member) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| Delete non-protected, non-default bookmark | ❌ (401) | ❌ (403) | ✅ | ✅ | ✅ |
| Delete protected bookmark | ❌ (401) | ❌ (403) | ❌ (403) | ✅ | ✅ |
| Delete default bookmark | ❌ (401) | ❌ (403) | ❌ (422) | ❌ (422) | ❌ (422) |
| Delete bookmark on archived repo | ❌ (401) | ❌ (403) | ❌ (403) | ❌ (403) | ❌ (403) |

- Private repositories: unauthenticated and unauthorized callers receive 404 (not 403) to avoid leaking repository existence
- The default bookmark restriction is enforced at the application level regardless of role — no one can delete it via the API

### Rate Limiting

- Authenticated users: 5,000 requests per hour (shared across all API endpoints)
- Unauthenticated users: 60 requests per hour per IP (will be rejected at 401 for this endpoint anyway)
- Mutative endpoints (DELETE): subject to burst limit of 30 deletions per minute per user to prevent bulk automation abuse
- 429 responses include `Retry-After` header with seconds until retry is allowed
- No automatic retry on 429 in any client; user must manually retry or wait

### Data Privacy & PII

- Bookmark names are not PII, but they may reveal feature intent or internal naming conventions — private repository bookmarks must never be exposed to unauthorized callers
- Auth tokens, session cookies, and API keys are never logged, displayed in error messages, or included in telemetry events
- The deleted bookmark name appears in structured logs and telemetry events, which is acceptable as it is not PII
- Client IP addresses in rate-limit logs must be hashed before storage
- No request body is involved in DELETE requests, eliminating payload-based PII exposure risks

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `bookmark.deleted` | Bookmark successfully deleted | `repo_full_name`, `bookmark_name`, `bookmark_was_tracking`, `was_protected`, `actor_role`, `client` (api/cli/tui/web/vscode/nvim), `deletion_time_ms` |
| `bookmark.delete_failed` | Bookmark deletion attempt failed | `repo_full_name`, `bookmark_name`, `error_type` (not_found/protected/default/permission/archived/server_error), `http_status`, `actor_role`, `client` |
| `bookmark.delete_confirmed` | User confirmed deletion in UI prompt | `repo_full_name`, `bookmark_name`, `client` (tui/web/vscode/nvim), `time_to_confirm_ms` |
| `bookmark.delete_cancelled` | User cancelled deletion in UI prompt | `repo_full_name`, `bookmark_name`, `client` (tui/web/vscode/nvim) |
| `bookmark.default_delete_blocked` | User attempted to delete default bookmark | `repo_full_name`, `bookmark_name`, `actor_role`, `client` |
| `bookmark.protected_delete_blocked` | Non-admin attempted to delete protected bookmark | `repo_full_name`, `bookmark_name`, `protected_pattern`, `actor_role`, `client` |

### Funnel Metrics and Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Delete success rate | >95% | Percentage of deletion attempts that succeed (excluding expected 422/403 for default/protected) |
| Delete confirmation rate | >80% | Percentage of users who confirm after seeing the confirmation prompt (low rate may indicate accidental trigger) |
| Time from confirmation to completion (p50) | <500ms | End-to-end latency from user confirming to bookmark removed |
| Default bookmark delete attempt rate | <5% | Percentage of delete attempts targeting the default bookmark (high rate may indicate unclear UI) |
| Protected bookmark block rate | Track | How often non-admins attempt to delete protected bookmarks (informs UX improvement) |
| CLI `--yes` adoption | Track | Percentage of CLI deletes using `--yes` flag (indicates automation/scripting usage) |
| Cross-client distribution | Track | Distribution of deletions across API, CLI, TUI, Web, VS Code, Neovim |
| Post-delete bookmark list refresh rate | >95% | Percentage of UI deletions followed by a successful list refresh (ensures consistency) |

## Observability

### Logging

| Log Level | Event | Structured Context |
|-----------|-------|-------------------|
| `info` | Bookmark deleted successfully | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id`, `actor_role`, `was_protected`, `deletion_time_ms` |
| `warn` | Bookmark deletion failed — not found | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id` |
| `warn` | Bookmark deletion blocked — default bookmark | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id`, `actor_role` |
| `warn` | Bookmark deletion blocked — protected, insufficient role | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id`, `actor_role`, `protected_pattern` |
| `warn` | Bookmark deletion blocked — insufficient permissions | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id`, `actor_role` |
| `warn` | Bookmark deletion blocked — repository archived | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id` |
| `warn` | Rate limited on bookmark delete endpoint | `repo_owner`, `repo_name`, `actor_id`, `retry_after_seconds`, `client_ip` (hashed) |
| `warn` | jj subprocess failed during bookmark delete | `repo_owner`, `repo_name`, `bookmark_name`, `exit_code`, `stderr` (truncated to 500 chars) |
| `error` | Unexpected error in bookmark delete handler | `repo_owner`, `repo_name`, `bookmark_name`, `error_type`, `stack_trace` |
| `error` | Database delete failed after jj delete succeeded | `repo_owner`, `repo_name`, `bookmark_name`, `db_error` (indicates inconsistency) |
| `debug` | Bookmark delete request received | `repo_owner`, `repo_name`, `bookmark_name_raw` (before trim), `actor_id` |
| `debug` | Protected bookmark check performed | `repo_owner`, `repo_name`, `bookmark_name`, `matching_patterns`, `is_protected` |
| `debug` | jj CLI command executed for bookmark delete | `repo_path`, `args` (sanitized), `exit_code`, `duration_ms` |

All logs must use structured JSON format. Auth tokens, full file system paths containing user home directories, and session identifiers must never appear in log output.

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_bookmark_delete_requests_total` | Counter | `owner`, `repo`, `status_code` | Total bookmark delete requests |
| `codeplane_bookmark_delete_duration_seconds` | Histogram | `owner`, `repo` | End-to-end request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5) |
| `codeplane_bookmark_delete_errors_total` | Counter | `owner`, `repo`, `error_type` | Bookmark delete errors by type (not_found, protected, default, permission, archived, jj_failure, db_failure, internal) |
| `codeplane_bookmark_delete_blocked_total` | Counter | `owner`, `repo`, `reason` | Blocked deletion attempts (default, protected, permission, archived) |
| `codeplane_jj_subprocess_duration_seconds` | Histogram | `command` | jj CLI subprocess execution time (`bookmark_delete` label) |
| `codeplane_jj_subprocess_failures_total` | Counter | `command`, `exit_code` | jj CLI subprocess failures |
| `codeplane_bookmark_delete_db_inconsistency_total` | Counter | `owner`, `repo` | Cases where jj delete succeeded but DB delete failed |

### Alerts

**Alert: BookmarkDeleteHighErrorRate**
- Condition: `rate(codeplane_bookmark_delete_errors_total{error_type=~"jj_failure|db_failure|internal"}[5m]) / rate(codeplane_bookmark_delete_requests_total[5m]) > 0.10`
- Severity: Warning
- Runbook:
  1. Check `codeplane_bookmark_delete_errors_total` by `error_type` to identify the dominant failure mode
  2. If `error_type=jj_failure`: verify `jj` binary is installed and accessible; check disk space under `CODEPLANE_DATA_DIR/repos/`; inspect jj stderr in structured logs for corruption or lock contention
  3. If `error_type=db_failure`: check database connectivity; look for connection pool exhaustion or migration issues; verify the `bookmarks` table exists and has the expected schema
  4. If `error_type=internal`: check application logs for stack traces; look for OOM or unhandled promise rejections
  5. If the DB-after-jj inconsistency counter is rising, consider running a bookmark reconciliation job
  6. Escalate if error rate exceeds 20% or persists beyond 15 minutes

**Alert: BookmarkDeleteDBInconsistency**
- Condition: `increase(codeplane_bookmark_delete_db_inconsistency_total[1h]) > 0`
- Severity: Critical
- Runbook:
  1. This alert means `jj bookmark delete` succeeded on disk but the corresponding DB record failed to delete — the system is now inconsistent
  2. Identify the affected repositories from the `owner` and `repo` labels
  3. Check database logs for the specific error (connection timeout, constraint violation, etc.)
  4. Manually verify the bookmark state: run `jj bookmark list` on the repo path and compare against the `bookmarks` DB table
  5. If the bookmark is gone from jj but present in DB, manually delete the DB record: `DELETE FROM bookmarks WHERE repository_id = ? AND name = ?`
  6. Investigate root cause — likely database connectivity issues or transaction isolation problems
  7. Escalate immediately as this affects data consistency

**Alert: BookmarkDeleteHighLatency**
- Condition: `histogram_quantile(0.95, rate(codeplane_bookmark_delete_duration_seconds_bucket[5m])) > 3`
- Severity: Warning
- Runbook:
  1. Check `codeplane_jj_subprocess_duration_seconds{command="bookmark_delete"}` — if jj subprocess is slow, the bottleneck is repository I/O or lock contention
  2. Check disk I/O metrics; high iowait indicates storage saturation
  3. Check for lock contention: multiple concurrent deletes on the same repository may serialize through jj's working copy lock
  4. Verify no repository corruption by running `jj debug` against slow repos
  5. Escalate if p95 exceeds 10 seconds

**Alert: BookmarkDeleteBurstAbuse**
- Condition: `rate(codeplane_bookmark_delete_requests_total[1m]) > 50`
- Severity: Warning
- Runbook:
  1. Identify the source user/IP from structured logs
  2. Verify whether the traffic is legitimate automation (CI script, bulk cleanup) or abuse
  3. If abuse: temporarily block the source via rate limiter override
  4. If legitimate: consider whether the burst limit needs adjustment for scripted workflows
  5. Review whether the caller is using a PAT or session — PAT-based bulk operations may need a higher tier

### Error Cases and Failure Modes

| Error Case | Detection | Expected Behavior |
|------------|-----------|-------------------|
| Bookmark not found | 404 from service/DB lookup | Return 404, log at `warn` level |
| Default bookmark targeted | `is_default` check on bookmark record | Return 422, log at `warn` level |
| Protected bookmark, insufficient role | Pattern match + role check | Return 403, log at `warn` level |
| Insufficient write access | Role check | Return 403, log at `warn` level |
| Archived repository | `archived_at` check on repo record | Return 403, log at `warn` level |
| jj binary not installed | Subprocess spawn error | Return 500, log at `error` level, alert fires |
| jj subprocess timeout (>30s) | Process timeout | Kill subprocess, return 500, log at `error` level |
| jj reports bookmark doesn't exist | jj stderr contains "No such bookmark" | Return 404, log at `warn` level |
| jj repository lock contention | jj subprocess blocks >5s | Subprocess may timeout; return 500 or slow 204, log at `warn` level |
| Database delete fails after jj succeeds | DB query error | Return 500, log at `error` level with inconsistency flag, alert fires |
| Repository path missing on disk | `access()` check fails | Return 500, log at `error` level |
| Concurrent deletion by two clients | Second jj delete fails | First returns 204, second returns 404 |
| Disk full | jj stderr | Return 500, log at `error` level |
| Invalid UTF-8 in bookmark name | Request parsing | Return 400, log at `debug` level |

## Verification

### API Integration Tests (`e2e/api/bookmark-delete.test.ts`)

1. **`api-bookmark-delete-success`** — Create a repo with bookmarks, `DELETE /api/repos/:owner/:repo/bookmarks/feature-branch`, verify 204 response with empty body
2. **`api-bookmark-delete-removes-from-list`** — Delete a bookmark, then `GET /bookmarks`, verify the deleted bookmark is absent from the list
3. **`api-bookmark-delete-nonexistent-bookmark`** — `DELETE /api/repos/:owner/:repo/bookmarks/does-not-exist`, verify 404 response
4. **`api-bookmark-delete-already-deleted`** — Delete the same bookmark twice, verify first returns 204 and second returns 404 (idempotent-safe)
5. **`api-bookmark-delete-default-bookmark`** — Attempt to delete the default bookmark (`main`), verify 422 response with error message "cannot delete the default bookmark"
6. **`api-bookmark-delete-protected-bookmark-as-member`** — Create a protected bookmark pattern, attempt to delete a matching bookmark with Write (Member) role, verify 403 response
7. **`api-bookmark-delete-protected-bookmark-as-admin`** — Create a protected bookmark pattern, delete a matching bookmark with Admin role, verify 204 response
8. **`api-bookmark-delete-protected-bookmark-as-owner`** — Create a protected bookmark pattern, delete a matching bookmark with Owner role, verify 204 response
9. **`api-bookmark-delete-unauthenticated`** — `DELETE /api/repos/:owner/:repo/bookmarks/:name` without auth header, verify 401 response
10. **`api-bookmark-delete-read-only-user`** — Authenticated user with Read-only access, verify 403 response
11. **`api-bookmark-delete-private-repo-no-auth`** — Private repo, no auth, verify 404 (not 403)
12. **`api-bookmark-delete-private-repo-non-collaborator`** — Private repo, authenticated non-collaborator, verify 404
13. **`api-bookmark-delete-nonexistent-repo`** — `DELETE /api/repos/owner/nonexistent/bookmarks/main`, verify 404
14. **`api-bookmark-delete-missing-owner`** — Request with empty/missing owner parameter, verify 400
15. **`api-bookmark-delete-missing-repo`** — Request with empty/missing repo parameter, verify 400
16. **`api-bookmark-delete-empty-bookmark-name`** — `DELETE /api/repos/:owner/:repo/bookmarks/%20`, verify 400 ("bookmark name is required")
17. **`api-bookmark-delete-bookmark-with-slashes`** — Create bookmark `feature/auth/v2`, `DELETE /api/repos/:owner/:repo/bookmarks/feature%2Fauth%2Fv2`, verify 204
18. **`api-bookmark-delete-bookmark-with-dots`** — Create bookmark `release.1.0`, delete it, verify 204
19. **`api-bookmark-delete-bookmark-name-max-length`** — Create bookmark with exactly 200-character name, delete it, verify 204
20. **`api-bookmark-delete-bookmark-name-over-max-length`** — Attempt to delete a bookmark with 201-character name, verify 400
21. **`api-bookmark-delete-bookmark-with-invalid-chars`** — `DELETE /api/repos/:owner/:repo/bookmarks/bad%20name%21`, verify 400
22. **`api-bookmark-delete-archived-repo`** — Archive a repo, attempt to delete a bookmark, verify 403 with "repository is archived"
23. **`api-bookmark-delete-rate-limit`** — Exhaust the burst rate limit with rapid deletions, verify 429 response with `Retry-After` header
24. **`api-bookmark-delete-concurrent-same-bookmark`** — Two concurrent DELETE requests for the same bookmark, verify one returns 204 and the other returns 404
25. **`api-bookmark-delete-concurrent-different-bookmarks`** — Two concurrent DELETE requests for different bookmarks on the same repo, verify both return 204
26. **`api-bookmark-delete-response-has-no-body`** — On 204 success, verify `Content-Length` is 0 or absent and response body is empty
27. **`api-bookmark-delete-with-request-body`** — Send a DELETE with `{ "extra": "data" }` body, verify it is ignored and the delete succeeds (204)
28. **`api-bookmark-delete-tracking-bookmark`** — Delete a bookmark with `is_tracking_remote: true`, verify 204 and it's removed from the list
29. **`api-bookmark-delete-landing-request-reference`** — Create a landing request referencing `source_bookmark`, delete the bookmark, verify the landing request still exists and retains the bookmark name
30. **`api-bookmark-delete-preserves-changes`** — Delete a bookmark, verify the change it pointed to is still accessible via `GET /changes/:change_id`

### CLI Integration Tests (`e2e/cli/bookmark-delete.test.ts`)

31. **`cli-bookmark-delete-local-success`** — Create a local bookmark, run `codeplane bookmark delete <name>`, verify exit code 0 and "Deleted bookmark {name}" output
32. **`cli-bookmark-delete-local-nonexistent`** — Run `codeplane bookmark delete nonexistent` locally, verify exit code 1 and error message "Bookmark nonexistent was not found"
33. **`cli-bookmark-delete-local-json-output`** — Run with `--format explicit`, verify JSON output `{ "status": "deleted", "name": "{name}" }`
34. **`cli-bookmark-delete-local-json-undefined`** — Run with `--json`, verify empty/no output (undefined result)
35. **`cli-bookmark-delete-remote-success`** — Run `codeplane bookmark delete <name> --repo OWNER/REPO`, verify success against the API
36. **`cli-bookmark-delete-remote-nonexistent`** — Run `codeplane bookmark delete nonexistent --repo OWNER/REPO`, verify error message and exit code 1
37. **`cli-bookmark-delete-after-list-shows-absence`** — Delete a bookmark, run `codeplane bookmark list`, verify the deleted bookmark is absent
38. **`cli-bookmark-delete-special-chars`** — Delete a bookmark named `feature/v1.2-beta_3`, verify success
39. **`cli-bookmark-delete-max-length-name`** — Create and delete a bookmark with exactly 200-character name, verify success
40. **`cli-bookmark-delete-yes-flag`** — Run with `--yes` flag, verify no interactive prompt and immediate deletion

### TUI Integration Tests (`e2e/tui/bookmark-delete.test.ts`)

41. **`tui-bookmark-delete-x-shows-confirmation`** — Focus a non-default bookmark, press `x`, verify confirmation prompt "Delete bookmark '{name}'? (y/N)" appears
42. **`tui-bookmark-delete-y-confirms`** — At confirmation prompt, press `y`, verify bookmark is removed from the list and success message appears
43. **`tui-bookmark-delete-n-cancels`** — At confirmation prompt, press `n`, verify prompt dismissed and bookmark remains
44. **`tui-bookmark-delete-esc-cancels`** — At confirmation prompt, press `Esc`, verify prompt dismissed and bookmark remains
45. **`tui-bookmark-delete-default-blocked`** — Focus the default bookmark, press `x`, verify "Cannot delete the default bookmark." message
46. **`tui-bookmark-delete-readonly-blocked`** — Read-only user, press `x`, verify "Insufficient permissions" message
47. **`tui-bookmark-delete-focus-moves-after-delete`** — Delete a bookmark that is not the last in the list, verify focus moves to the next row
48. **`tui-bookmark-delete-focus-moves-up-if-last`** — Delete the last bookmark in the list, verify focus moves to the previous row
49. **`tui-bookmark-delete-success-message-timeout`** — After deletion, verify success message disappears after approximately 3 seconds
50. **`tui-bookmark-delete-error-displayed`** — API returns 500, verify error message is shown inline

### Web UI Playwright Tests (`e2e/web/bookmark-delete.test.ts`)

51. **`web-bookmark-delete-kebab-menu-visible`** — Navigate to bookmarks page as write-access user, verify kebab menu visible on non-default bookmarks
52. **`web-bookmark-delete-kebab-menu-hidden-readonly`** — Navigate as read-only user, verify delete action is not in the kebab menu
53. **`web-bookmark-delete-default-bookmark-no-delete`** — Verify the default bookmark row does not show "Delete bookmark" in its menu
54. **`web-bookmark-delete-confirmation-modal`** — Click "Delete bookmark" in kebab menu, verify confirmation modal appears with bookmark name and warning text
55. **`web-bookmark-delete-cancel-modal`** — Click "Cancel" in confirmation modal, verify modal closes and bookmark remains
56. **`web-bookmark-delete-escape-dismisses-modal`** — Press Escape while modal is open, verify modal closes
57. **`web-bookmark-delete-confirm-success`** — Click "Delete" in confirmation modal, verify modal closes, toast appears, and bookmark is removed from the list
58. **`web-bookmark-delete-spinner-during-request`** — Slow down the API, verify spinner appears on "Delete" button while request is in flight
59. **`web-bookmark-delete-permission-error-in-modal`** — Mock 403 response, verify inline error appears in modal
60. **`web-bookmark-delete-not-found-error-in-modal`** — Mock 404 response, verify inline error "Bookmark not found" appears and list refreshes
61. **`web-bookmark-delete-server-error-in-modal`** — Mock 500 response, verify inline error "Something went wrong" appears
62. **`web-bookmark-delete-protected-bookmark-warning`** — Protected bookmark shows additional warning in the confirmation modal
63. **`web-bookmark-delete-list-refreshes-after-delete`** — After successful deletion, the bookmark list reflects the deletion without a manual refresh
64. **`web-bookmark-delete-keyboard-enter-submits-modal`** — Press Enter in the confirmation modal, verify deletion is triggered
65. **`web-bookmark-delete-toast-notification`** — After successful deletion, verify toast notification with correct message appears and auto-dismisses

### VS Code Extension Tests (`e2e/vscode/bookmark-delete.test.ts`)

66. **`vscode-bookmark-delete-context-menu`** — Verify "Delete Bookmark" appears in context menu for non-default bookmarks
67. **`vscode-bookmark-delete-default-no-action`** — Verify default bookmark tree item does not show "Delete Bookmark" action
68. **`vscode-bookmark-delete-confirmation-dialog`** — Click "Delete Bookmark", verify VS Code dialog appears
69. **`vscode-bookmark-delete-success-notification`** — Confirm deletion, verify success notification and tree refresh
70. **`vscode-bookmark-delete-error-notification`** — Mock API error, verify error notification appears
