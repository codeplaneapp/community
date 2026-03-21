# REPO_STAR

Specification for REPO_STAR.

## High-Level User POV

When you find a repository on Codeplane that you want to remember, endorse, or signal interest in, starring it is the simplest action you can take. Clicking the star button (or running a star command) immediately bookmarks that repository to your personal starred-repos collection and increments the repository's public star count by one. Unstarring reverses both effects just as quickly.

Starring a repository serves several purposes at once. It acts as a personal bookmark — your starred repositories are collected into a browsable list on your profile and accessible from the dashboard, making it easy to return to projects you care about. It also provides social proof to the repository's maintainers and visitors: a higher star count signals that a repository is valued by the community. And because starring is tied to your identity, it creates a lightweight form of social discovery — other users can see what you've starred, and repository maintainers can see who values their work.

The star and unstar actions are available everywhere you interact with repositories in Codeplane: the web UI, CLI, and TUI. On the web, a star button appears prominently on every repository's overview page, showing the current count alongside a toggle action. The CLI provides `codeplane repo star` and `codeplane repo unstar` commands for quick terminal-based workflows. In the TUI, pressing a key while focused on a repository toggles the star state with optimistic feedback.

Starring is intentionally lightweight and low-friction. There is no confirmation dialog — you click or press once, and the action takes effect immediately. If you star a repository you've already starred, nothing breaks; the system silently acknowledges the action. Similarly, unstarring a repository you haven't starred is harmless. The star count on the repository and the presence of the repository in your starred list stay perfectly consistent with your actions.

You must be signed in to star or unstar a repository, and you can only star repositories you have read access to. You cannot star a private repository you've never been granted access to, and you cannot discover the existence of a private repository by attempting to star it — the system returns the same "not found" response as for a nonexistent repository.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users can star a repository via `PUT /api/user/starred/:owner/:repo`, which returns `204 No Content` on success.
- [ ] Authenticated users can unstar a repository via `DELETE /api/user/starred/:owner/:repo`, which returns `204 No Content` on success.
- [ ] Starring a repository increments the repository's `num_stars` counter by exactly 1.
- [ ] Unstarring a repository decrements the repository's `num_stars` counter by exactly 1.
- [ ] The `num_stars` counter never goes below 0 (protected by `GREATEST(num_stars - 1, 0)`).
- [ ] The user can check whether they have starred a repository (the `is_starred` state is deterministic and queryable).
- [ ] Starred repositories appear in the user's starred repository list (`GET /api/user/starred`).
- [ ] Unstarred repositories no longer appear in the user's starred repository list.
- [ ] The repository's stargazers list (`GET /api/repos/:owner/:repo/stargazers`) includes the user after starring and excludes them after unstarring.
- [ ] The star/unstar actions are accessible from the web UI, CLI (`codeplane repo star`, `codeplane repo unstar`), and TUI.
- [ ] The web UI displays a star button with the current star count on every repository overview page.
- [ ] The web UI star button provides optimistic feedback (count and visual state change immediately on click, before server confirmation).
- [ ] The CLI commands produce structured JSON output when `--json` is passed.
- [ ] The TUI allows starring/unstarring from the repository list screen via a keyboard shortcut.

### Edge Cases

- [ ] Starring a repository that is already starred is idempotent: the API returns `204`, the star count does not change, and no duplicate record is created.
- [ ] Unstarring a repository that is not currently starred is idempotent: the API returns `204`, the star count does not change.
- [ ] Starring a repository during a concurrent star by another user does not corrupt the star count (each star atomically increments).
- [ ] Unstarring a repository during a concurrent unstar by the same user (race condition) does not double-decrement the counter.
- [ ] If a unique constraint violation occurs on the stars table (concurrent insert race), the operation succeeds silently rather than returning an error.
- [ ] Starring a nonexistent repository returns `404`.
- [ ] Starring a private repository the user does not have read access to returns `404` (not `403`, to avoid leaking repo existence).
- [ ] Starring a repository owned by a nonexistent user returns `404`.
- [ ] An unauthenticated request to star or unstar returns `401` with `{ "message": "authentication required" }`.
- [ ] Repository names containing hyphens, underscores, and dots are handled correctly in the `:owner/:repo` path parameters.
- [ ] Owner names are resolved case-insensitively.
- [ ] The `owner` path parameter cannot be empty (returns `400` with `"owner is required"`).
- [ ] The `repo` path parameter cannot be empty (returns `400` with `"repository name is required"`).
- [ ] After a repository is deleted, its stars are cleaned up and do not appear in users' starred lists.
- [ ] After a repository transitions from public to private, existing stars remain valid but are only visible to users who retain read access.

### Boundary Constraints

- [ ] `owner` path parameter: non-empty string, 1–39 characters, alphanumeric and hyphens, must not start or end with a hyphen.
- [ ] `repo` path parameter: non-empty string, 1–100 characters, must not be a reserved name (e.g., `"stargazers"`).
- [ ] Request body: star and unstar endpoints accept no request body. Any body is ignored.
- [ ] Response body: star returns `204 No Content` (empty body). Unstar returns `204 No Content` (empty body).
- [ ] A single user can star an unlimited number of repositories (no artificial per-user cap).
- [ ] A single repository can accumulate an unlimited number of stars (no artificial per-repo cap).

## Design

### Web UI Design

**Location:** Star button on the repository overview page at `/:owner/:repo`.

**Star Button Component:**
- Positioned in the repository header/action bar, alongside other engagement actions (watch, fork).
- Displays a star icon (☆ when unstarred, ★ when starred) and the current star count.
- Clicking the button toggles the star state:
  - If unstarred → stars the repository (sends `PUT /api/user/starred/:owner/:repo`).
  - If starred → unstars the repository (sends `DELETE /api/user/starred/:owner/:repo`).
- The button uses **optimistic UI**: the icon and count update immediately on click, before the server response arrives.
  - On success: no further UI change needed.
  - On failure: revert the icon and count to the previous state, and display a brief inline error toast.
- The star count is displayed with K-abbreviation for counts ≥ 1,000 (e.g., `1.2k`, `15.3k`). The exact count is shown in a tooltip on hover.
- The star count text is a clickable link that navigates to `/:owner/:repo/stargazers`.
- When the user is **not authenticated**, clicking the star button redirects to the login page (or shows a login prompt). The button is visually styled as unstarred with no toggle affordance.

**Initial State Loading:**
- When the repository overview loads, the API response includes `num_stars` for the count.
- A separate lightweight check determines whether the current user has starred this repository, to set the initial toggle state. This can be derived from the repository detail response if an `is_starred` field is included, or via a dedicated API call.

### API Shape

#### Star a Repository

```
PUT /api/user/starred/:owner/:repo
```

**Authentication:** Required (session cookie or PAT).

**Path Parameters:**
| Parameter | Type   | Required | Description                                    |
|-----------|--------|----------|------------------------------------------------|
| `owner`   | string | yes      | Repository owner username or organization name |
| `repo`    | string | yes      | Repository name                                |

**Request Body:** None. Any body is ignored.

**Success Response:** `204 No Content` — empty body.

**Error Responses:**
| Status | Condition                                                        |
|--------|------------------------------------------------------------------|
| 400    | Missing or empty `owner` or `repo` path parameter               |
| 401    | Not authenticated                                                |
| 404    | Repository not found, or private repo without read access        |
| 500    | Internal server error (database failure)                         |

**Idempotency:** Starring an already-starred repository returns `204` without side effects.

#### Unstar a Repository

```
DELETE /api/user/starred/:owner/:repo
```

**Authentication:** Required (session cookie or PAT).

**Path Parameters:** Same as star.

**Request Body:** None.

**Success Response:** `204 No Content` — empty body.

**Error Responses:** Same as star.

**Idempotency:** Unstarring a repository that is not starred returns `204` without side effects.

#### Check Star Status (recommended addition)

```
GET /api/user/starred/:owner/:repo
```

**Authentication:** Required.

**Success Response (if starred):** `204 No Content`.

**Success Response (if not starred):** `404 Not Found`.

This endpoint allows the web UI and other clients to check whether the authenticated user has starred a given repository without loading the full stargazers list.

### SDK Shape

The `RepoService` class in `@codeplane/sdk` exposes:

```typescript
starRepo(
  actor: RepoActor | null,
  owner: string,
  repo: string
): Promise<Result<void, APIError>>
```

- Requires a non-null `actor` (returns `unauthorized` error otherwise).
- Resolves the repository via `resolveReadableRepo` (enforces existence and read access).
- Checks `isRepoStarred` before inserting to avoid duplicate work.
- Handles unique-constraint violations gracefully (concurrent insert race).
- Increments `num_stars` on the repository record after successful insert.

```typescript
unstarRepo(
  actor: RepoActor | null,
  owner: string,
  repo: string
): Promise<Result<void, APIError>>
```

- Same auth and repo resolution as `starRepo`.
- Checks `isRepoStarred` before deleting to avoid unnecessary decrement.
- Decrements `num_stars` on the repository record after successful delete.

### CLI Command

#### Star a Repository

```
codeplane repo star <OWNER/REPO>
```

**Arguments:**
| Argument       | Type   | Required | Description                              |
|----------------|--------|----------|------------------------------------------|
| `OWNER/REPO`   | string | yes      | Repository reference in `owner/repo` format |

**Behavior:**
- Sends `PUT /api/user/starred/:owner/:repo`.
- On success, outputs: `Starred owner/repo` (human-readable) or `{ "status": "starred", "repo": "owner/repo" }` (with `--json`).
- On error (repo not found, not authenticated), prints error to stderr and exits with code 1.
- Requires authentication.

#### Unstar a Repository

```
codeplane repo unstar <OWNER/REPO>
```

**Arguments:** Same as `repo star`.

**Behavior:**
- Sends `DELETE /api/user/starred/:owner/:repo`.
- On success, outputs: `Unstarred owner/repo` (human-readable) or `{ "status": "unstarred", "repo": "owner/repo" }` (with `--json`).
- On error, prints error to stderr and exits with code 1.
- Requires authentication.

### TUI UI

**Repository List Screen:**
- Pressing `s` while a repository is focused toggles the star state (star if unstarred, unstar if starred).
- The toggle uses **optimistic update**: the star icon and count in the row update immediately.
- Star count is displayed per-row with K-abbreviation for counts ≥ 1,000.
- A brief status message (e.g., `★ Starred owner/repo`) appears in the status bar after toggling.

**Dashboard Starred Repos Panel:**
- The dashboard's "Starred Repos" panel (bottom-left quadrant) shows the user's starred repositories sorted by starring time (most recent first).
- Each row shows: `full_name`, truncated description, visibility badge (◆ public / ◇ private), and `num_stars`.
- Cursor-based pagination triggers at 80% scroll depth.
- Empty state: "No starred repositories".

### Documentation

- **API Reference — Repositories**: Document `PUT /api/user/starred/:owner/:repo` and `DELETE /api/user/starred/:owner/:repo` with full path parameters, authentication requirements, response codes, and idempotency behavior.
- **CLI Reference — `repo star`**: Document the command with usage examples for both human-readable and JSON output modes.
- **CLI Reference — `repo unstar`**: Document the command with usage examples.
- **Web Guide — Repository Overview**: Describe the star button, its toggle behavior, and the star count display.
- **Concepts — Social Features**: Explain what starring means, how it relates to the stargazers list and starred-repos collection, and the distinction between star (action) and stargazers (discovery).

## Permissions & Security

### Authorization

| Role                              | Star | Unstar |
|-----------------------------------|------|--------|
| Anonymous (unauthenticated)       | ❌   | ❌     |
| Authenticated user (any)          | ✅ (if repo is readable) | ✅ (if repo is readable) |
| Repository member (any role)      | ✅   | ✅     |
| Organization member (with repo access) | ✅   | ✅     |
| Site admin                        | ✅   | ✅     |

**Key rules:**
- Authentication is strictly required. Unauthenticated requests return `401`.
- The user must have read access to the repository. The system uses `resolveReadableRepo`, which checks repository existence, visibility, and the user's access level.
- Private repositories that the user cannot read return `404` (not `403`) to prevent leaking repo existence.
- No elevated permissions (admin, owner) are required beyond basic read access. Any authenticated user who can see a repository can star or unstar it.
- A user can star their own repositories.
- There is no concept of "starring on behalf of another user" — the star is always attributed to the authenticated actor.

### Rate Limiting

- **Star/unstar endpoints**: Standard authenticated mutation rate limit. Recommended: 30 requests per minute per user. This prevents automated star-farming scripts.
- Rate-limited responses use `429 Too Many Requests` with `Retry-After` header.
- Because star/unstar are write operations that modify counters, they should be rate-limited more tightly than read-only list endpoints.
- Additional abuse detection: if a single user stars more than 100 repositories in a 1-hour window, log a warning for potential automation abuse (do not block, but flag for review).

### Data Privacy

- The star action creates a record associating the user's ID with a repository ID. This association is inherently a public social signal — it appears in the stargazers list and the user's starred repos list.
- The star/unstar endpoints do not accept or return any user PII.
- The response is `204 No Content` — no data is returned that could be leaked.
- The user's email, wallet address, admin status, and other sensitive fields are never involved in the star flow.
- Starring a private repository does create a record, but that record is only visible to users who have read access to the repository (via the stargazers list) or to the starring user themselves (via their own starred list, which includes private repos).

## Telemetry & Product Analytics

### Business Events

| Event Name       | Trigger                                                      | Properties                                                                                                       |
|------------------|--------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| `RepoStarred`    | `PUT /api/user/starred/:owner/:repo` returns `204`           | `user_id`, `repo_id`, `repo_owner`, `repo_name`, `repo_full_name`, `repo_is_public`, `client` (web/cli/tui/api) |
| `RepoUnstarred`  | `DELETE /api/user/starred/:owner/:repo` returns `204`        | `user_id`, `repo_id`, `repo_owner`, `repo_name`, `repo_full_name`, `repo_is_public`, `client` (web/cli/tui/api) |
| `RepoStarFailed` | Star or unstar request returns 4xx/5xx                       | `user_id` (nullable), `repo_owner`, `repo_name`, `error_status`, `error_message`, `client`                      |

### Key Event Properties

- `user_id`: The authenticated user's numeric ID.
- `repo_id`: The numeric repository ID.
- `repo_owner`: The owner username or organization name.
- `repo_name`: The repository name.
- `repo_full_name`: The full `owner/name` string.
- `repo_is_public`: Boolean indicating whether the repository is public.
- `client`: The surface that triggered the action — one of `web`, `cli`, `tui`, `api`, `vscode`, `neovim`.
- `error_status`: HTTP status code on failure.
- `error_message`: Human-readable error reason.

### Funnel Metrics & Success Indicators

- **Star adoption rate**: Percentage of active authenticated users who have starred at least one repository in a given month. A healthy target is ≥ 30% of monthly active users.
- **Stars per user (distribution)**: Median and p90 of starred repositories per active user. If median is 0, the feature is underused; if p90 is very high (>500), investigate potential automation.
- **Star/unstar ratio**: Ratio of star events to unstar events. A healthy ratio is ≥ 5:1 (users star much more than they unstar). A ratio approaching 1:1 may indicate churn or accidental starring.
- **Idempotent star rate**: Percentage of star requests where the user had already starred the repo. A very high idempotent rate (>20%) may indicate UI confusion or redundant client calls.
- **Client distribution**: Breakdown of star actions by client (web, CLI, TUI). Helps prioritize client-specific UX improvements.
- **Time from first repo view to first star**: Measures the "time to value" of the star feature. Shorter is better.
- **Cross-feature correlation**: Track whether starring correlates with downstream engagement (cloning, forking, issue creation, landing requests). Stars that lead to contributions are the strongest signal of product value.

## Observability

### Logging Requirements

| Log Point                                  | Level   | Structured Fields                                                                  | Description                                                       |
|--------------------------------------------|---------|------------------------------------------------------------------------------------|-------------------------------------------------------------------|
| Star request received                      | `DEBUG` | `owner`, `repo`, `user_id`, `request_id`                                          | Entry point for star mutation                                     |
| Star request completed (new star)          | `INFO`  | `owner`, `repo`, `user_id`, `repo_id`, `request_id`, `duration_ms`                | A new star was created and counter incremented                    |
| Star request completed (already starred)   | `INFO`  | `owner`, `repo`, `user_id`, `repo_id`, `request_id`, `duration_ms`, `idempotent: true` | Star was already present — no-op                             |
| Star unique-constraint race handled        | `WARN`  | `owner`, `repo`, `user_id`, `repo_id`, `request_id`                               | Concurrent insert race resolved via unique violation catch        |
| Unstar request received                    | `DEBUG` | `owner`, `repo`, `user_id`, `request_id`                                          | Entry point for unstar mutation                                   |
| Unstar request completed (removed star)    | `INFO`  | `owner`, `repo`, `user_id`, `repo_id`, `request_id`, `duration_ms`                | Star was deleted and counter decremented                          |
| Unstar request completed (not starred)     | `INFO`  | `owner`, `repo`, `user_id`, `repo_id`, `request_id`, `duration_ms`, `idempotent: true` | No star existed — no-op                                      |
| Star/unstar auth failure                   | `WARN`  | `request_id`, `client_ip`                                                          | Unauthenticated request attempted                                 |
| Star/unstar repo not found                 | `WARN`  | `owner`, `repo`, `user_id`, `request_id`                                           | Repository does not exist or user lacks read access               |
| Star/unstar internal error                 | `ERROR` | `owner`, `repo`, `user_id`, `request_id`, `error_message`, `stack_trace`           | Unexpected failure in service or database layer                   |
| Star counter increment completed           | `DEBUG` | `repo_id`, `new_count` (if available), `request_id`                                | Counter was incremented after star insert                         |
| Star counter decrement completed           | `DEBUG` | `repo_id`, `new_count` (if available), `request_id`                                | Counter was decremented after star delete                         |

### Prometheus Metrics

| Metric                                          | Type      | Labels                              | Description                                                          |
|-------------------------------------------------|-----------|-------------------------------------|----------------------------------------------------------------------|
| `codeplane_repo_star_requests_total`            | Counter   | `action` (star/unstar), `status` (204/400/401/404/500) | Total star and unstar requests                          |
| `codeplane_repo_star_duration_seconds`          | Histogram | `action` (star/unstar), `status`    | Request latency distribution (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_repo_star_idempotent_total`          | Counter   | `action` (star/unstar)              | Count of idempotent (no-op) star/unstar operations                   |
| `codeplane_repo_star_race_conditions_total`     | Counter   | —                                   | Count of unique-constraint violations caught during concurrent stars |
| `codeplane_repo_stars_total`                    | Gauge     | `owner`, `repo`                     | Current star count per repository (updated on star/unstar)           |
| `codeplane_user_stars_given_total`              | Gauge     | —                                   | Total stars given across all users (global engagement metric)        |

### Alerts

#### Alert: `RepoStarHighErrorRate`
- **Condition:** `rate(codeplane_repo_star_requests_total{status="500"}[5m]) / rate(codeplane_repo_star_requests_total[5m]) > 0.05`
- **Severity:** Warning
- **Summary:** More than 5% of star/unstar requests are returning 500 errors.
- **Runbook:**
  1. Check server logs for `ERROR`-level entries with `star` or `unstar` context in the last 15 minutes.
  2. Verify database connectivity: run a health check query against the `stars` table.
  3. Check if the `stars` table has locking contention (e.g., from a concurrent migration or vacuum).
  4. Verify the `repositories` table's `num_stars` column is accessible and not locked by a long-running transaction.
  5. Check if the `IncrementRepoStars` / `DecrementRepoStars` queries are timing out.
  6. If errors started after a deploy, verify the SQL queries in `social_sql.ts` and `repos_sql.ts` match the current schema.
  7. Restart the server process if connection pool exhaustion is suspected.

#### Alert: `RepoStarHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_repo_star_duration_seconds_bucket[5m])) > 1.0`
- **Severity:** Warning
- **Summary:** 95th percentile latency for star/unstar requests exceeds 1 second.
- **Runbook:**
  1. Check database query latencies for `IsRepoStarred`, `StarRepo`, `UnstarRepo`, `IncrementRepoStars`, `DecrementRepoStars`.
  2. Run `EXPLAIN ANALYZE` on the `IsRepoStarred` query — verify the `(user_id, repository_id)` index is being used.
  3. Check if the `repositories` table `UPDATE` for counter increment is blocked by row-level locks.
  4. Check overall database CPU and I/O utilization.
  5. If a specific repository is consistently slow, check if it has an unusual number of concurrent star operations (viral repo scenario).
  6. Consider batching or async counter updates if a single repository receives extremely high star throughput.

#### Alert: `RepoStarRaceConditionSpike`
- **Condition:** `rate(codeplane_repo_star_race_conditions_total[5m]) > 5`
- **Severity:** Info
- **Summary:** Elevated rate of concurrent-insert race conditions on the stars table.
- **Runbook:**
  1. This is not necessarily a problem — the race condition is handled gracefully.
  2. Check if a single repository or user is generating most of the races (may indicate scripted automation).
  3. Verify the unique constraint on `stars(user_id, repository_id)` is intact.
  4. If the rate is sustained and high (>50/min), investigate whether a client is retrying star requests aggressively.

#### Alert: `RepoStarAbuseDetection`
- **Condition:** A single `user_id` generates more than 100 `RepoStarred` events in a 1-hour window (application-level check, not Prometheus).
- **Severity:** Warning
- **Summary:** A user is starring repositories at an unusually high rate, potentially automated.
- **Runbook:**
  1. Query the analytics events for the `user_id` to see the pattern (what repos were starred, how quickly).
  2. Check if the user is a legitimate power user or an automation script.
  3. If automated, consider rate-limiting or flagging the account for review.
  4. If legitimate, no action required — update the threshold if needed.

### Error Cases and Failure Modes

| Error Case                                       | Expected Behavior                                              | HTTP Status |
|--------------------------------------------------|----------------------------------------------------------------|-------------|
| Unauthenticated user attempts to star            | Return `{ "message": "authentication required" }`              | 401         |
| Repository does not exist                        | Return not-found error                                         | 404         |
| Private repo, user lacks read access             | Return not-found error (same as nonexistent)                   | 404         |
| Missing `owner` path parameter                   | Return `"owner is required"`                                   | 400         |
| Missing `repo` path parameter                    | Return `"repository name is required"`                         | 400         |
| Database connection failure during star insert   | Return internal error, log ERROR                               | 500         |
| Database connection failure during counter update | Star record may exist but counter not incremented — eventual consistency risk. Log ERROR. | 500 |
| Unique constraint violation (concurrent star)    | Silently succeed, return 204, do not increment counter again   | 204         |
| Star record deleted but counter decrement fails  | Counter may be off by 1 — eventual consistency risk. Log ERROR. | 500        |
| Repository deleted after star check but before insert | Star insert may succeed for a deleted repo — cleanup job handles orphaned stars. | 204 or 404 |

## Verification

### API Integration Tests

| Test ID       | Test Description                                                                 | Expected Result                                                                |
|---------------|----------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| `API-STAR-001` | Star a public repo as authenticated user                                         | `204 No Content`, empty body                                                   |
| `API-STAR-002` | Unstar a public repo as authenticated user                                       | `204 No Content`, empty body                                                   |
| `API-STAR-003` | Star a repo, then check `num_stars` increased by 1                               | Repository's `num_stars` incremented                                           |
| `API-STAR-004` | Unstar a repo, then check `num_stars` decreased by 1                             | Repository's `num_stars` decremented                                           |
| `API-STAR-005` | Star a repo, then verify user appears in stargazers list                          | `GET /api/repos/:owner/:repo/stargazers` includes the user                     |
| `API-STAR-006` | Star then unstar a repo, then verify user does NOT appear in stargazers list      | User absent from stargazers                                                    |
| `API-STAR-007` | Star a repo, then verify repo appears in authenticated user's starred list        | `GET /api/user/starred` includes the repo                                      |
| `API-STAR-008` | Star then unstar a repo, then verify repo does NOT appear in starred list         | Repo absent from `GET /api/user/starred`                                       |
| `API-STAR-009` | Star a repo that is already starred (idempotent)                                  | `204`, `num_stars` unchanged (no double-count)                                 |
| `API-STAR-010` | Unstar a repo that is not starred (idempotent)                                    | `204`, `num_stars` unchanged (no negative decrement)                           |
| `API-STAR-011` | Star a nonexistent repo                                                          | `404`                                                                          |
| `API-STAR-012` | Star a repo with a nonexistent owner                                             | `404`                                                                          |
| `API-STAR-013` | Star a private repo the user does NOT have access to                              | `404` (not `403`)                                                              |
| `API-STAR-014` | Star a private repo the user DOES have read access to                             | `204`                                                                          |
| `API-STAR-015` | Star without authentication                                                      | `401` with `{ "message": "authentication required" }`                          |
| `API-STAR-016` | Unstar without authentication                                                    | `401` with `{ "message": "authentication required" }`                          |
| `API-STAR-017` | Star with empty `owner` parameter                                                | `400` with `"owner is required"`                                               |
| `API-STAR-018` | Star with empty `repo` parameter                                                 | `400` with `"repository name is required"`                                     |
| `API-STAR-019` | Star a repo with hyphenated name (e.g., `my-cool-repo`)                          | `204`                                                                          |
| `API-STAR-020` | Star a repo with underscored name (e.g., `my_repo`)                              | `204`                                                                          |
| `API-STAR-021` | Star a repo with dotted name (e.g., `my.repo`)                                   | `204`                                                                          |
| `API-STAR-022` | Star a repo owned by an organization                                             | `204`                                                                          |
| `API-STAR-023` | Owner name is resolved case-insensitively                                         | `PUT /api/user/starred/OWNER/repo` succeeds and is equivalent to lowercase     |
| `API-STAR-024` | Star a repo, then star it again from a different session (same user)              | Second star returns `204`, `num_stars` still +1 from original                  |
| `API-STAR-025` | Two different users star the same repo                                            | `num_stars` incremented by 2, both appear in stargazers list                   |
| `API-STAR-026` | Star endpoint ignores request body                                               | `PUT` with `{ "extra": "data" }` body still returns `204`                      |
| `API-STAR-027` | `num_stars` never goes below 0 after unstarring a repo with 0 stars              | `num_stars` remains 0                                                          |
| `API-STAR-028` | Star a repo, delete the repo, verify star does not appear in user's starred list  | Deleted repo absent from starred list                                          |
| `API-STAR-029` | Verify response content-type is empty or not set (204 No Content)                 | No content-type header or empty body                                           |
| `API-STAR-030` | Star and unstar in rapid succession (10 cycles)                                   | Final state matches last action; `num_stars` is consistent                     |

### CLI E2E Tests

| Test ID       | Test Description                                                                 | Expected Result                                                                |
|---------------|----------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| `CLI-STAR-001` | `codeplane repo star owner/repo`                                                 | Exit code 0, stdout contains "Starred owner/repo"                              |
| `CLI-STAR-002` | `codeplane repo star owner/repo --json`                                          | Exit code 0, stdout is valid JSON `{ "status": "starred", "repo": "owner/repo" }` |
| `CLI-STAR-003` | `codeplane repo unstar owner/repo`                                               | Exit code 0, stdout contains "Unstarred owner/repo"                            |
| `CLI-STAR-004` | `codeplane repo unstar owner/repo --json`                                        | Exit code 0, stdout is valid JSON `{ "status": "unstarred", "repo": "owner/repo" }` |
| `CLI-STAR-005` | `codeplane repo star nonexistent/repo`                                           | Exit code 1, stderr contains error message                                     |
| `CLI-STAR-006` | `codeplane repo unstar nonexistent/repo`                                         | Exit code 1, stderr contains error message                                     |
| `CLI-STAR-007` | `codeplane repo star` (missing repo argument)                                    | Exit code 1, usage error displayed                                             |
| `CLI-STAR-008` | `codeplane repo unstar` (missing repo argument)                                  | Exit code 1, usage error displayed                                             |
| `CLI-STAR-009` | Star a repo via CLI, then verify via API it appears in starred list               | Cross-client consistency confirmed                                             |
| `CLI-STAR-010` | Star a repo already starred via CLI (idempotent)                                 | Exit code 0, `{ "status": "starred" }`                                         |
| `CLI-STAR-011` | Unstar a repo not currently starred via CLI (idempotent)                          | Exit code 0, `{ "status": "unstarred" }`                                       |

### Web UI Playwright E2E Tests

| Test ID       | Test Description                                                                 | Expected Result                                                                |
|---------------|----------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| `UI-STAR-001` | Star button is visible on a public repository overview page                       | Star button with count is rendered                                             |
| `UI-STAR-002` | Click star button on an unstarred repo                                           | Button transitions to starred state, count increments by 1                     |
| `UI-STAR-003` | Click star button on a starred repo (unstar)                                     | Button transitions to unstarred state, count decrements by 1                   |
| `UI-STAR-004` | Star button shows correct initial state for a repo the user has starred           | Button renders as starred (filled star icon)                                   |
| `UI-STAR-005` | Star button shows correct initial state for a repo the user has NOT starred       | Button renders as unstarred (outline star icon)                                |
| `UI-STAR-006` | Star count link navigates to stargazers page                                     | Clicking count navigates to `/:owner/:repo/stargazers`                         |
| `UI-STAR-007` | Star button when not logged in redirects to login                                | Clicking star button navigates to login page or shows login prompt             |
| `UI-STAR-008` | Star count displays K-abbreviation for counts ≥ 1,000                            | Count shows `1.2k` etc. with exact count in tooltip                            |
| `UI-STAR-009` | Optimistic update reverts on API failure                                          | Simulate network error; count and state revert after brief delay               |
| `UI-STAR-010` | Star a repo, navigate away and back                                              | Star state persists (button still shows starred)                               |

### TUI Integration Tests

| Test ID       | Test Description                                                                 | Expected Result                                                                |
|---------------|----------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| `TUI-STAR-001` | Press `s` on a focused repo in the repo list (unstarred)                         | Repo shows starred state, count increments                                     |
| `TUI-STAR-002` | Press `s` on a focused repo in the repo list (starred)                           | Repo shows unstarred state, count decrements                                   |
| `TUI-STAR-003` | Star a repo in TUI, verify it appears in dashboard starred repos panel           | Repo appears in the starred panel                                              |
| `TUI-STAR-004` | Unstar a repo in TUI, verify it disappears from dashboard starred repos panel    | Repo absent from the starred panel                                             |
| `TUI-STAR-005` | Status bar shows confirmation after starring                                     | Brief message like `★ Starred owner/repo` appears                              |

### Cross-Client Consistency Tests

| Test ID       | Test Description                                                                 | Expected Result                                                                |
|---------------|----------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| `XSTAR-001`   | Star via CLI, verify starred via API                                             | `GET /api/user/starred` includes the repo                                      |
| `XSTAR-002`   | Star via API, verify via CLI `repo star --json` returns idempotent success        | `{ "status": "starred" }`                                                      |
| `XSTAR-003`   | Star via CLI, unstar via API, verify CLI shows unstarred                          | Consistent state across clients                                                |
| `XSTAR-004`   | Star via API, check stargazers list via API                                       | User appears in stargazers                                                     |
| `XSTAR-005`   | Star via API, check user's public starred repos list via API                      | Repo appears in `GET /api/users/:username/starred`                             |

### Concurrency and Load Tests

| Test ID       | Test Description                                                                 | Expected Result                                                                |
|---------------|----------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| `LOAD-STAR-001` | 50 different users star the same repo concurrently                              | `num_stars` = 50, 50 entries in stargazers list                                |
| `LOAD-STAR-002` | Same user stars and unstars same repo 20 times rapidly                          | Final state is consistent with last action, `num_stars` is correct             |
| `LOAD-STAR-003` | 100 concurrent star requests from the same user (same repo)                     | All return 204, `num_stars` incremented by exactly 1, no duplicates            |
| `LOAD-STAR-004` | Star endpoint responds within 200ms at p95 under normal load                    | Latency check passes                                                           |
