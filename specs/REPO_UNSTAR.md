# REPO_UNSTAR

Specification for REPO_UNSTAR.

## High-Level User POV

When a user has previously starred a repository on Codeplane, the unstar action lets them reverse that decision. Unstarring removes the repository from the user's personal starred list and decrements the repository's public star count by one. This is the natural complement to the star action — together they give users full control over which repositories they've bookmarked as interesting or valuable.

A developer might unstar a repository because they no longer follow the project, because they starred it by accident, or because they're cleaning up their starred list to keep it focused. The action is simple and immediate: click the star button again in the web UI, run `codeplane repo unstar` in the CLI, or invoke the API directly. After unstarring, the repository disappears from the user's "Starred" tab and the user no longer appears in that repository's stargazers list.

Unstarring is a private, low-friction action. There is no confirmation dialog, no notification sent to the repository owner, and no public record of the removal. The star count updates instantly and the user can re-star the repository at any time. The operation is idempotent — unstarring a repository that the user hasn't starred simply succeeds silently rather than producing an error. This ensures that clients don't need to track local star state perfectly to avoid spurious failures.

The unstar action is available across every Codeplane surface: the web application's repository header, the CLI, the TUI, and the raw API. All surfaces converge on the same API endpoint and produce the same outcome.

## Acceptance Criteria

### Definition of Done

- [ ] The `DELETE /api/user/starred/:owner/:repo` endpoint removes the authenticated user's star from the specified repository.
- [ ] The endpoint returns `204 No Content` on success with an empty body.
- [ ] The operation is **idempotent**: unstarring a repository the user has not starred returns `204` without error.
- [ ] On successful unstar (where the star previously existed), the repository's `num_stars` counter is decremented by exactly 1.
- [ ] The `num_stars` counter **never goes below 0** — the decrement uses `GREATEST(num_stars - 1, 0)`.
- [ ] After unstarring, the user no longer appears in the repository's stargazers list (`GET /api/repos/:owner/:repo/stargazers`).
- [ ] After unstarring, the repository no longer appears in the user's starred repositories list (`GET /api/user/starred`).
- [ ] The web UI star button toggles back to its unstarred visual state after the user unstars a repository.
- [ ] The CLI command `codeplane repo unstar <owner/repo>` successfully unstars the repository.
- [ ] The CLI outputs `"Unstarred owner/repo"` in text mode or `{ "status": "unstarred", "repo": "owner/repo" }` in JSON mode.
- [ ] The TUI provides an unstar action on repository detail views.
- [ ] No notification is sent to the repository owner or any other user when a repository is unstarred.
- [ ] The feature is documented in the OpenAPI specification.

### Edge Cases

- [ ] Unstarring a repository the user has never starred returns `204` (idempotent, no error).
- [ ] Unstarring the same repository twice in quick succession (race condition) both return `204` and the star count decrements by exactly 1 total, not 2.
- [ ] Unstarring a repository that has been deleted returns `404`.
- [ ] Unstarring a repository that has been transferred to a new owner returns `404` when using the old owner path (caller must use new owner).
- [ ] Unstarring a private repository the user has read access to succeeds normally.
- [ ] Unstarring a private repository the user does NOT have read access to returns `404` (not `403`, to avoid leaking existence).
- [ ] Unstarring a repository the user previously starred and then the repository was made private (but user still has access) succeeds.
- [ ] Unstarring while unauthenticated returns `401`.
- [ ] An empty or missing `owner` path parameter returns `400` with `"owner is required"`.
- [ ] An empty or missing `repo` path parameter returns `400` with `"repository name is required"`.
- [ ] Repository names containing hyphens, underscores, and dots are handled correctly.
- [ ] Owner resolution is case-insensitive (e.g., `Alice/my-repo` resolves the same as `alice/my-repo`).
- [ ] After unstarring, re-starring the same repository works correctly and increments the star count back up.

### Boundary Constraints

- [ ] `owner`: non-empty string, 1–39 characters, must match an existing user or organization.
- [ ] `repo`: non-empty string, 1–100 characters, must match an existing repository under the given owner.
- [ ] The `owner` path segment must not be an empty string. Whitespace-only values are trimmed and treated as empty.
- [ ] The `repo` path segment must not be an empty string. Whitespace-only values are trimmed and treated as empty.
- [ ] No request body is required or expected. Any body sent is ignored.
- [ ] The response body is empty (204 No Content).

## Design

### API Shape

**Endpoint:** `DELETE /api/user/starred/:owner/:repo`

**Method:** DELETE

**Authentication:** Required (session cookie or PAT)

**Path Parameters:**

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `owner` | string | yes | 1–39 chars, non-empty after trim | Repository owner username or organization name |
| `repo` | string | yes | 1–100 chars, non-empty after trim | Repository name |

**Request Body:** None. Any body is ignored.

**Response: `204 No Content`**
- Empty body.
- No headers beyond standard CORS and request-id headers.

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | `owner` path parameter is empty or whitespace-only | `{ "error": "owner is required" }` |
| 400 | `repo` path parameter is empty or whitespace-only | `{ "error": "repository name is required" }` |
| 401 | No valid authentication provided | `{ "error": "authentication required" }` |
| 404 | Repository does not exist, or private repo the user cannot access | `{ "error": "not found" }` |
| 500 | Unexpected server error | `{ "error": "internal server error" }` |

**Idempotency:** Calling this endpoint when the user has not starred the repository returns `204` without error. The star count is not decremented in this case.

### SDK Shape

The `RepoService` class exposes:

```typescript
unstarRepo(
  actor: RepoActor | null,
  owner: string,
  repo: string
): Promise<Result<void, APIError>>
```

- Returns `unauthorized` error if `actor` is null.
- Resolves the repository via `resolveReadableRepo(actor, owner, repo)`, which enforces visibility and access checks.
- Checks whether a star record exists for the user via `isRepoStarred()`.
- If no star record exists, returns `Result.ok(undefined)` immediately (idempotent).
- If a star record exists, deletes it via `unstarRepo()` and decrements the counter via `decrementRepoStars()`.
- The decrement uses `GREATEST(num_stars - 1, 0)` to prevent negative counts.

### CLI Command

**Command:** `codeplane repo unstar <repo>`

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `repo` | string | yes | Repository in `OWNER/REPO` format |

**Behavior:**
- Resolves the `OWNER/REPO` argument via `resolveRepoRef()`.
- Sends `DELETE /api/user/starred/:owner/:repo`.
- In text mode, prints: `Unstarred owner/repo`
- In JSON mode (`--json`), returns: `{ "status": "unstarred", "repo": "owner/repo" }`
- On API error (e.g., 404), displays an error message and exits with code 1.

**Example usage:**
```bash
# Text output
$ codeplane repo unstar alice/my-project
Unstarred alice/my-project

# JSON output
$ codeplane repo unstar alice/my-project --json
{"status": "unstarred", "repo": "alice/my-project"}

# Error case
$ codeplane repo unstar nonexistent/repo
Error: repository not found
```

### Web UI Design

**Star Button Toggle:**

The repository header/overview area contains a star button. When the current user has already starred the repository, the button appears in its "starred" visual state (filled star icon, highlighted styling). Clicking the button in this state unstars the repository:

1. The star icon transitions from filled to outlined immediately (optimistic update).
2. The star count displayed next to the button decrements by 1 immediately.
3. A `DELETE /api/user/starred/:owner/:repo` request fires in the background.
4. If the request fails, the UI reverts to the starred state and shows a brief error toast (e.g., "Failed to unstar repository").
5. No confirmation dialog is shown — the action is instant and reversible.

**Starred Repositories List:**

On the user's profile page (`/:owner?tab=starred`), the unstarred repository disappears from the list after refresh or is removed with a smooth exit animation if the page is live.

### TUI UI

**Repository Detail View:**

When viewing a repository detail screen in the TUI, a star/unstar action is available via a keyboard shortcut (e.g., `s` to toggle star). If the repository is currently starred:

1. Pressing `s` sends the unstar API call.
2. The star indicator changes from `★` (filled) to `☆` (empty).
3. The star count decrements.
4. A brief status message appears: `"Unstarred owner/repo"`.

**Dashboard Starred Repos Panel:**

The TUI dashboard's starred repositories panel reflects the unstar. After unstarring a repo from any surface, the next time the panel refreshes, the repository is no longer listed.

### Documentation

- **OpenAPI specification:** The `DELETE /api/user/starred/:owner/:repo` endpoint must be fully documented with path parameters, authentication requirements, response codes (204, 400, 401, 404), and idempotency behavior.
- **CLI help text:** `codeplane repo unstar --help` must describe the command, its `OWNER/REPO` argument, and the `--json` flag.
- **User guide:** A section in the repository interaction documentation explaining:
  - How to unstar a repository from the web UI, CLI, and TUI.
  - That the action is idempotent (unstarring a non-starred repo is harmless).
  - That no notification is sent when unstarring.
  - That the star count updates immediately.
  - That the user can re-star at any time.

## Permissions & Security

### Authorization

| Role | Can Unstar? | Notes |
|------|-------------|-------|
| Anonymous (unauthenticated) | No | Returns 401 "authentication required" |
| Authenticated user (any role) | Yes, for public repos | Can unstar any public repository |
| Authenticated user with read access | Yes, for private repos | Can unstar a private repo they have read access to |
| Authenticated user without access | No, for private repos | Returns 404 (not 403) to avoid leaking repo existence |
| Repository Owner | Yes | Can unstar their own repository |
| Organization member with repo access | Yes | Can unstar org repos they can read |
| Site Admin | Yes | Can unstar any repository |

**Key security invariants:**

- The unstar action only affects the authenticated user's own star. A user cannot unstar a repository on behalf of another user.
- Private repository access denial returns `404` (not `403`) to avoid leaking the existence of private repositories.
- The endpoint does not accept a user ID parameter — the starred user is always derived from the authenticated session/token.

### Rate Limiting

- **Standard authenticated rate limit:** 5,000 requests/hour per user. The unstar endpoint shares the global authenticated rate limit bucket.
- **No special rate limit** is needed beyond the standard limit. The endpoint is a simple delete operation with no amplification risk.
- **Abuse scenario — rapid star/unstar cycling:** If a user repeatedly stars and unstars the same repository in a tight loop, the standard rate limit (5,000/hour) is sufficient to prevent abuse. The operation is idempotent and the counter uses `GREATEST(..., 0)`, so even under race conditions the count cannot go negative.

### Data Privacy

- The unstar endpoint returns `204 No Content` — no user data or repository data is leaked in the response.
- No PII is exposed through this endpoint.
- The removal of a star is not broadcast to other users. No webhook, notification, or activity feed entry is created for an unstar event.
- The star/unstar history (timestamps of when stars were added/removed) is not retained after deletion — the star record is hard-deleted, not soft-deleted.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `RepoUnstarred` | A user successfully removes their star from a repository (only fires when a star record actually existed and was deleted — not on idempotent no-ops) | `repo_id`, `repo_owner`, `repo_name`, `user_id`, `client`, `new_star_count`, `time_since_starred_ms` |

### Event Properties

| Property | Type | Description |
|----------|------|-------------|
| `repo_id` | number | Numeric repository ID |
| `repo_owner` | string | Owner username or organization name |
| `repo_name` | string | Repository name |
| `user_id` | number | Authenticated user's numeric ID |
| `client` | string | Surface that triggered the unstar: `web`, `cli`, `tui`, `api`, `vscode`, `neovim` |
| `new_star_count` | number | The repository's star count after the decrement |
| `time_since_starred_ms` | number \| null | Milliseconds between the original star creation time and the unstar time. Null if the original star timestamp is unavailable. |

### Success Indicators

- **Unstar-to-star ratio:** Track `RepoUnstarred` events relative to `RepoStarred` events over time. A healthy ratio is below 15% (most stars stick). A ratio above 30% may indicate users are starring accidentally or that starred repos are not surfaced well enough to justify keeping.
- **Time-to-unstar distribution:** The `time_since_starred_ms` property reveals how long stars last. Stars removed within seconds likely indicate accidental starring or UI confusion. Stars removed after days/weeks indicate natural interest decay.
- **Unstar churn rate per repository:** Repositories with high unstar rates relative to their star rate may have discoverability or quality issues.
- **Client distribution:** Which surfaces users unstar from. If a disproportionate number of unstars come from the starred repos list page (cleanup behavior), that's healthy. If they come from the repo overview immediately after starring, the star button UX may need improvement.
- **Re-star rate:** Percentage of unstarred repositories that are re-starred within 24 hours. A high re-star rate indicates accidental unstarring or UI confusion.

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Description |
|-----------|-------|-------------------|-------------|
| Unstar request received | `DEBUG` | `owner`, `repo`, `user_id`, `request_id` | Entry point logging |
| Unstar successful (star existed and was removed) | `INFO` | `owner`, `repo`, `user_id`, `repo_id`, `new_star_count`, `duration_ms`, `request_id` | Actual star removal |
| Unstar no-op (user had not starred) | `DEBUG` | `owner`, `repo`, `user_id`, `repo_id`, `request_id` | Idempotent success — no change made |
| Unstar failed — unauthenticated | `WARN` | `owner`, `repo`, `request_id`, `ip_address` | 401 response |
| Unstar failed — repository not found | `WARN` | `owner`, `repo`, `user_id`, `request_id` | 404 response — repo doesn't exist or access denied |
| Unstar failed — bad request (missing params) | `WARN` | `raw_owner`, `raw_repo`, `request_id` | 400 response — empty owner or repo |
| Unstar failed — internal error | `ERROR` | `owner`, `repo`, `user_id`, `error_message`, `stack_trace`, `request_id` | 500 response — unexpected failure |
| Star count decrement executed | `DEBUG` | `repo_id`, `previous_count`, `new_count`, `request_id` | Counter update confirmation |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_repo_unstar_requests_total` | Counter | `status` (204, 400, 401, 404, 500) | Total unstar requests by response status |
| `codeplane_repo_unstar_duration_seconds` | Histogram | `status` | Request latency distribution (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5) |
| `codeplane_repo_unstar_actual_removals_total` | Counter | — | Count of actual star removals (excludes idempotent no-ops). Compare with `requests_total{status="204"}` to see the idempotent no-op ratio. |
| `codeplane_repo_stars_total` | Gauge | `owner`, `repo` | Current star count per repository (shared gauge, updated on both star and unstar operations) |

### Alerts

#### Alert: `UnstarHighErrorRate`
- **Condition:** `rate(codeplane_repo_unstar_requests_total{status="500"}[5m]) / rate(codeplane_repo_unstar_requests_total[5m]) > 0.05`
- **Severity:** Warning
- **Summary:** More than 5% of unstar requests are returning 500 errors over the last 5 minutes.
- **Runbook:**
  1. Check server logs for `ERROR`-level entries containing `unstar` context in the last 15 minutes.
  2. Look for database connection errors — the unstar operation requires 3 queries (check star exists, delete star, decrement counter).
  3. Check if the `stars` table is experiencing lock contention from concurrent star/unstar operations on popular repositories.
  4. Verify the `stars` table has a composite index on `(user_id, repository_id)` — missing index could cause slow deletes.
  5. Check for deadlocks: the unstar path touches both `stars` and `repositories` tables. Look for PostgreSQL deadlock log entries.
  6. If the database is healthy, check for application-level bugs by reviewing recent deployments.
  7. If the issue is connection pool exhaustion, restart the server process and investigate pool sizing.

#### Alert: `UnstarHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_repo_unstar_duration_seconds_bucket[5m])) > 1`
- **Severity:** Warning
- **Summary:** 95th percentile latency for unstar requests exceeds 1 second.
- **Runbook:**
  1. Check structured logs for `duration_ms` values above 500 on unstar operations.
  2. Run `EXPLAIN ANALYZE` on the `DELETE FROM stars WHERE user_id = $1 AND repository_id = $2` query to check for missing index or sequential scan.
  3. Check if the `GREATEST(num_stars - 1, 0)` update on `repositories` is waiting on row-level locks (popular repos being starred/unstarred concurrently).
  4. Check overall database CPU, I/O, and connection utilization.
  5. If the problem is isolated to specific repositories, check whether those repos have abnormally high write contention.

#### Alert: `UnstarSpikeAnomaly`
- **Condition:** `rate(codeplane_repo_unstar_actual_removals_total[5m]) > 10 * avg_over_time(rate(codeplane_repo_unstar_actual_removals_total[1h])[24h:1h])`
- **Severity:** Info
- **Summary:** Unstar rate is 10x above the 24-hour average — may indicate a mass-unstar campaign, bot activity, or a UI bug causing accidental unstars.
- **Runbook:**
  1. Check whether the spike is isolated to a single repository or spread across many repos.
  2. If a single repo, check whether it was involved in a controversial event or if a bot is cycling stars.
  3. If spread across many repos, check for a UI deployment that may have introduced a star-button bug (e.g., star/unstar swapped).
  4. Check rate-limiting logs for any users hitting the limit — this may indicate automated behavior.
  5. If the spike is legitimate user behavior (e.g., a user cleaning up their starred list), no action is needed.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | HTTP Status | Recovery |
|------------|-------------------|-------------|----------|
| Unauthenticated request | Return "authentication required" | 401 | User must authenticate |
| Empty owner path parameter | Return "owner is required" | 400 | Client must provide owner |
| Empty repo path parameter | Return "repository name is required" | 400 | Client must provide repo name |
| Repository does not exist | Return "not found" | 404 | None — repo is gone |
| Private repo, user has no access | Return "not found" (no info leak) | 404 | User must gain access |
| User has not starred the repo | Return success (idempotent) | 204 | None — desired state achieved |
| Database connection failure during star check | Return internal error | 500 | Retry; check DB health |
| Database failure during star delete | Return internal error, star may remain | 500 | Retry; verify star state |
| Database failure during counter decrement | Star is deleted but count not decremented (inconsistency) | 500 | Counter self-heals via GREATEST; can reconcile with COUNT query |
| Concurrent unstar race condition | Only one decrement occurs; second call sees no star and skips | 204 | None — idempotency handles this |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `API-US-001` | `DELETE /api/user/starred/:owner/:repo` for a previously starred public repo | 204 No Content, empty body |
| `API-US-002` | Verify the repository's `num_stars` decrements by exactly 1 after unstarring | `GET /api/repos/:owner/:repo` returns `num_stars` one less than before |
| `API-US-003` | Verify the user no longer appears in the stargazers list after unstarring | `GET /api/repos/:owner/:repo/stargazers` does not include the user |
| `API-US-004` | Verify the repo no longer appears in the user's starred list after unstarring | `GET /api/user/starred` does not include the repo |
| `API-US-005` | Unstar a repo the user has NOT starred (idempotent) | 204 No Content, star count unchanged |
| `API-US-006` | Unstar the same repo twice in sequence | Both return 204; star count decremented by exactly 1 total |
| `API-US-007` | Unstar while unauthenticated (no session or token) | 401, `{ "error": "authentication required" }` |
| `API-US-008` | Unstar with an expired or invalid PAT | 401 |
| `API-US-009` | Unstar with empty `owner` path parameter | 400, `{ "error": "owner is required" }` |
| `API-US-010` | Unstar with empty `repo` path parameter | 400, `{ "error": "repository name is required" }` |
| `API-US-011` | Unstar with whitespace-only `owner` (e.g., `%20%20`) | 400, `{ "error": "owner is required" }` |
| `API-US-012` | Unstar with whitespace-only `repo` (e.g., `%20%20`) | 400, `{ "error": "repository name is required" }` |
| `API-US-013` | Unstar a nonexistent repository | 404 |
| `API-US-014` | Unstar a repo under a nonexistent owner | 404 |
| `API-US-015` | Unstar a private repo the user has read access to and has starred | 204, star removed successfully |
| `API-US-016` | Unstar a private repo the user does NOT have access to | 404 (not 403) |
| `API-US-017` | Unstar a private repo while unauthenticated | 401 |
| `API-US-018` | Verify star count never goes below 0: star a repo (count=1), unstar (count=0), unstar again (count stays 0) | `num_stars` is 0 after both unstars |
| `API-US-019` | Star, unstar, then re-star the same repo | All three succeed; final `num_stars` incremented by 1 from the pre-test baseline; user appears in stargazers list |
| `API-US-020` | Unstar a repo with a hyphenated name (e.g., `my-cool-repo`) | 204 |
| `API-US-021` | Unstar a repo with underscores in the name (e.g., `my_repo`) | 204 |
| `API-US-022` | Unstar a repo with dots in the name (e.g., `my.repo`) | 204 |
| `API-US-023` | Unstar with case-insensitive owner (e.g., `Alice/repo` vs `alice/repo`) | 204 — both resolve correctly |
| `API-US-024` | Unstar a repo owned by an organization | 204 |
| `API-US-025` | Unstar a repo the user owns (self-unstar) | 204 |
| `API-US-026` | Verify no request body is required — send DELETE with empty body | 204 |
| `API-US-027` | Verify sending a request body does not cause an error — send DELETE with arbitrary JSON body | 204 (body ignored) |
| `API-US-028` | Verify the `num_stars` counter after starring with 3 different users and then one unstars | Counter goes from 3 to 2 |
| `API-US-029` | Unstar a repo with the maximum valid repo name length (100 characters) | 204 |
| `API-US-030` | Attempt to unstar a repo with a name exceeding 100 characters | 404 (no such repo exists) or 400 depending on validation |
| `API-US-031` | Unstar a repo with the maximum valid owner name length (39 characters) | 204 |
| `API-US-032` | Attempt to unstar with an owner name exceeding 39 characters | 404 (no such owner exists) or 400 depending on validation |

### CLI E2E Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `CLI-US-001` | `codeplane repo unstar owner/repo` for a previously starred repo | Exit code 0, output contains `Unstarred owner/repo` |
| `CLI-US-002` | `codeplane repo unstar owner/repo --json` for a previously starred repo | Exit code 0, JSON output `{ "status": "unstarred", "repo": "owner/repo" }` |
| `CLI-US-003` | `codeplane repo unstar owner/repo` for a repo the user has NOT starred | Exit code 0 (idempotent success) |
| `CLI-US-004` | `codeplane repo unstar nonexistent/repo` | Exit code 1, error message |
| `CLI-US-005` | `codeplane repo unstar` (missing repo argument) | Exit code 1, usage error |
| `CLI-US-006` | Star then unstar via CLI, then verify via `codeplane repo stargazers` | Stargazers list does not include the user |
| `CLI-US-007` | Unstar via CLI, then re-star via CLI | Both commands succeed, final state is starred |
| `CLI-US-008` | `codeplane repo unstar owner/repo --json` output is valid parseable JSON | JSON.parse succeeds, has `status` and `repo` keys |

### Web UI Playwright E2E Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `UI-US-001` | On a repo overview page where user has starred the repo, click the star button | Star button transitions to unstarred state, star count decrements by 1 |
| `UI-US-002` | After unstarring via the star button, refresh the page | Star button remains in unstarred state, star count is correct |
| `UI-US-003` | After unstarring, navigate to `/:owner/:repo/stargazers` | Current user does NOT appear in the stargazers list |
| `UI-US-004` | After unstarring, navigate to user's starred repos (`/:owner?tab=starred`) | The unstarred repo is no longer listed |
| `UI-US-005` | Unstar a repo, then click the star button again to re-star | Star button toggles back to starred state, count increments |
| `UI-US-006` | Verify no confirmation dialog appears when clicking the star button to unstar | Button action is immediate |
| `UI-US-007` | Simulate a network failure during unstar (e.g., intercept API call and return 500) | Star button reverts to starred state, error toast is displayed |
| `UI-US-008` | Click unstar on a repo, then quickly navigate to another page before the API responds | No crash or inconsistent state — page navigates cleanly |

### TUI Integration Tests

| Test ID | Test Description | Expected Result |
|---------|-----------------|------------------|
| `TUI-US-001` | On repository detail view, toggle star on a starred repo using keyboard shortcut | Star indicator changes from filled to empty, status message confirms unstar |
| `TUI-US-002` | After unstarring in TUI, starred repos panel no longer lists the repo on refresh | Repository removed from dashboard panel |
| `TUI-US-003` | Unstar a repo that is not currently starred via TUI | No error, no-op, appropriate feedback |
