# REPO_SUBSCRIPTION_GET

Specification for REPO_SUBSCRIPTION_GET.

## High-Level User POV

When you're on a repository page in Codeplane and you want to know whether you're currently watching that repository — and if so, how — you can check your subscription status instantly. This is the "am I watching this?" question, and Codeplane answers it clearly from every client surface.

On the web, when you visit a repository you're watching, the watch button in the repository header reflects your current subscription state. It tells you whether you're set to "Watching" (receiving all notifications), "Participating" (only receiving notifications for conversations you're directly involved in), or "Ignored" (you've explicitly muted that repository). If you haven't subscribed at all, the button shows a neutral "Watch" state, inviting you to subscribe. This visual feedback is immediate and persistent — you don't have to dig through settings or notification preferences to know your current relationship with a repository.

From the CLI, you can check your subscription status for any repository with a quick command. The response tells you your current watch mode or lets you know that you aren't subscribed. This is useful for scripting and automation — for example, confirming your subscription state before adjusting it, or auditing your notification configuration across multiple repositories.

From the TUI, your subscription status appears as part of the repository detail view, so it's always visible alongside other repository metadata like star count, bookmark list, and description.

The subscription status is inherently personal — it reflects your own notification preferences for that repository. You cannot see another user's subscription status. When you're not authenticated, subscription status is simply not available, and the watch button shows a prompt to sign in.

This feature is the foundational "read" operation that powers the watch button state across all Codeplane clients. Without it, the watch, unwatch, and subscription management workflows cannot display current state to the user.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users can retrieve their subscription status for a specific repository via `GET /api/repos/:owner/:repo/subscription`.
- [ ] The response includes the watch mode (`watching`, `participating`, or `ignored`), subscription creation timestamp, and last-updated timestamp.
- [ ] If the user has no subscription for the repository, the response returns a 200 with `{ "subscribed": false }`.
- [ ] If the user has an active subscription, the response returns a 200 with `{ "subscribed": true, "subscription": { "mode": "...", "created_at": "...", "updated_at": "..." } }`.
- [ ] Unauthenticated requests return 401.
- [ ] Requests for a non-existent repository return 404.
- [ ] Requests for a private repository the user does not have read access to return 404 (not 403, to avoid leaking existence).
- [ ] Requests for a private repository the user has read access to and is watching return the subscription with correct mode.
- [ ] The CLI `codeplane repo watch-status <owner/repo>` command displays the current subscription status.
- [ ] The web UI watch button on the repository header reflects the current subscription state.
- [ ] The TUI repository detail view displays subscription status.
- [ ] All timestamps in responses are ISO 8601 formatted.

### Edge Cases

- [ ] A user who has never interacted with a repository's subscription receives `{ "subscribed": false }` — not a 404 on the subscription itself.
- [ ] If a user watches a repository, then the repository is made private and the user loses read access, the endpoint returns 404 for the repo (subscription is irrelevant if the user cannot see the repo).
- [ ] If a user watches a repository and the repository is deleted, the endpoint returns 404.
- [ ] If a user watches a repository, then unwatches, the endpoint returns `{ "subscribed": false }`.
- [ ] Concurrent GET requests for the same user/repo pair always return consistent results (no partial state).
- [ ] If the `watches` row has a `NULL` `updated_at` (defensive edge case), the response still succeeds and `updated_at` falls back to `created_at`.
- [ ] If the repository owner renames, the new owner path returns the same subscription status.
- [ ] If the repository name changes, the new name path returns the same subscription status (subscriptions are tied to repository ID, not name).
- [ ] Archived repositories still return subscription status (archiving does not affect watch state).
- [ ] Forked repositories have independent subscription state — watching the parent does not imply watching the fork.
- [ ] The `owner` parameter is case-insensitive (matching existing Codeplane repo resolution behavior).
- [ ] The `repo` parameter is case-insensitive (matching existing Codeplane repo resolution behavior).

### Boundary Constraints

- [ ] The `owner` path parameter must be a valid Codeplane username or organization name (1–39 characters, alphanumeric and hyphens, no leading/trailing hyphens).
- [ ] The `repo` path parameter must be a valid Codeplane repository name (1–100 characters, alphanumeric, hyphens, underscores, and dots, not a reserved name).
- [ ] The `mode` field in the response is always one of: `watching`, `participating`, `ignored`.
- [ ] No request body is accepted on this GET endpoint. Any body is ignored.
- [ ] No query parameters are accepted. Unknown query parameters are ignored (no error).

## Design

### Web UI Design

**Location**: Repository header action bar, alongside the Star button.

**Watch button states**:

1. **Not subscribed (default)**: Button shows an eye icon with label "Watch". Clicking it opens a dropdown to select a watch mode. The button has a neutral/outline style.

2. **Watching**: Button shows a filled eye icon with label "Watching" and a green dot indicator. A dropdown arrow allows changing the mode or unwatching. The button has an active/filled style.

3. **Participating**: Button shows a semi-filled eye icon with label "Participating" and a blue dot indicator. Dropdown arrow for mode change or unwatch.

4. **Ignored**: Button shows a crossed-out eye icon with label "Ignored" and a gray dot indicator. Dropdown arrow for mode change or unwatch.

5. **Unauthenticated**: Button shows an eye icon with label "Watch" but clicking it redirects to the login page with a return URL.

6. **Loading**: Button shows a skeleton/spinner state while the subscription status is being fetched. The button is not interactive during loading.

**Watch count**: The button also displays the repository's total watcher count (from `num_watches` on the repo response), formatted with SI suffixes for large numbers (e.g., "1.2k").

**Dropdown menu** (when subscribed): The dropdown shows all three modes with a checkmark next to the current one, plus a divider and "Unwatch" option at the bottom.

**Error handling**: If the subscription status fetch fails, the button defaults to the "not subscribed" visual state and logs the error. A retry occurs on the next navigation to the repository.

### API Shape

#### Get Subscription Status for a Repository

```
GET /api/repos/:owner/:repo/subscription
```

**Authentication**: Required. Uses session cookie or PAT.

**Path Parameters**:
| Parameter | Type   | Description                    |
|-----------|--------|--------------------------------|
| `owner`   | string | Repository owner (user or org) |
| `repo`    | string | Repository name                |

**Success Response — Subscribed** (`200 OK`):
```json
{
  "subscribed": true,
  "subscription": {
    "mode": "watching",
    "created_at": "2026-01-10T08:00:00.000Z",
    "updated_at": "2026-03-18T12:00:00.000Z"
  }
}
```

**Success Response — Not Subscribed** (`200 OK`):
```json
{
  "subscribed": false
}
```

**Error Responses**:
| Status | Condition                                        | Body                                               |
|--------|--------------------------------------------------|-----------------------------------------------------|
| 401    | Not authenticated                                | `{ "message": "authentication required" }`          |
| 404    | Repository does not exist or user lacks read access | `{ "message": "repository not found" }`            |

### SDK Shape

The `RepoService` class in `@codeplane/sdk` exposes:

- `getSubscription(userId: string, repositoryId: string): Promise<Result<SubscriptionStatus, APIError>>` — returns the current subscription state for the given user and repository.

The `SubscriptionStatus` type:
```typescript
interface SubscriptionStatus {
  subscribed: boolean;
  subscription?: {
    mode: "watching" | "participating" | "ignored";
    created_at: string;
    updated_at: string;
  };
}
```

The route handler is responsible for:
1. Resolving `owner` and `repo` path parameters to a repository ID (using existing repo resolution logic).
2. Checking that the authenticated user has at least read access to the repository (returning 404 if not).
3. Calling `getWatchStatus(sql, { userId, repositoryId })` from `social_sql.ts`.
4. If the result is `null`, returning `{ subscribed: false }`.
5. If the result exists, mapping it to `{ subscribed: true, subscription: { mode, created_at, updated_at } }`.

### CLI Command

#### Check subscription status for a repository

```
codeplane repo watch-status <owner/repo> [--json]
```

- Requires authentication.
- Calls `GET /api/repos/:owner/:repo/subscription`.
- Human-readable output for subscribed state:
  ```
  Watching janedoe/my-project (mode: watching, since 2026-01-10)
  ```
- Human-readable output for not-subscribed state:
  ```
  Not watching janedoe/my-project
  ```
- `--json`: outputs the raw JSON response.
- If the repository does not exist, outputs "Repository not found." to stderr and exits with code 1.
- If not authenticated, outputs the standard authentication error and exits with code 1.

### TUI UI

The TUI repository detail view shows the subscription status alongside other repository metadata:

- **Subscribed**: Shows `[W] Watching`, `[P] Participating`, or `[I] Ignored` with appropriate color coding (green, blue, gray respectively) in the repository metadata section.
- **Not subscribed**: Shows `[ ] Not watching` in dim/muted text.
- The status refreshes when entering the repository detail screen.

### Documentation

- **API Reference — Repositories**: Document `GET /api/repos/:owner/:repo/subscription` with full path parameters, response schemas for both subscribed and not-subscribed states, and error codes.
- **CLI Reference — `repo watch-status`**: Document usage with examples for subscribed, not-subscribed, and error scenarios.
- **Web Guide — Repository Overview — Watch Button**: Document the watch button states and explain what each mode means for notification delivery.
- **Concepts Guide — Watching vs Starring**: Cross-reference with the existing distinction documentation, linking to this endpoint as the read-side query.

## Permissions & Security

### Authorization Roles

| Action                                                      | Anonymous | Authenticated (no repo access) | Read | Write | Admin | Owner |
|------------------------------------------------------------|-----------|-------------------------------|------|-------|-------|-------|
| Get own subscription for public repo                       | ❌         | ✅                             | ✅    | ✅     | ✅     | ✅     |
| Get own subscription for private repo (with read access)   | ❌         | ❌                             | ✅    | ✅     | ✅     | ✅     |
| Get own subscription for private repo (without read access)| ❌         | ❌ (404)                       | N/A  | N/A   | N/A   | N/A   |

- This endpoint only returns the calling user's own subscription. There is no mechanism to query another user's subscription status.
- Admin users cannot view other users' subscription statuses through this endpoint.
- Private repository existence is not leaked — users without read access receive 404, indistinguishable from a non-existent repo.
- Deploy keys and PATs with repo read scope are sufficient to query subscription status.

### Rate Limiting

- **Authenticated callers**: 600 requests per minute per user to `GET /api/repos/:owner/:repo/subscription`. This is set higher than the subscription list endpoint because this endpoint is called on every repository page load and may be called for multiple repositories in quick succession.
- Rate limit responses use `429 Too Many Requests` with `Retry-After` header.
- No anonymous access is permitted, so no anonymous rate limiting is needed.

### Data Privacy & PII

- The response contains only the subscription mode and timestamps. No user PII is included.
- The subscription itself is private user configuration — it is never exposed in repository public metadata, activity feeds, or other users' views.
- The `num_watches` count on the repository response is an aggregate count and does not reveal individual watchers' identities or modes.
- Audit logs should not record subscription reads (they are high-volume, low-sensitivity reads).

## Telemetry & Product Analytics

### Key Business Events

| Event Name                         | Trigger                                                           | Properties                                                                                          |
|------------------------------------|-------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| `RepoSubscriptionChecked`          | `GET /api/repos/:owner/:repo/subscription` returns 200           | `user_id`, `repo_id`, `repo_full_name`, `is_subscribed`, `mode` (nullable), `client` (web/cli/tui/api) |
| `RepoSubscriptionCheckFailed`      | `GET /api/repos/:owner/:repo/subscription` returns 404 or error  | `user_id`, `repo_full_name`, `status_code`, `client`                                                 |

### Funnel Metrics & Success Indicators

- **Subscription check → Watch action conversion**: Percentage of subscription check requests for unsubscribed users that are followed by a `PUT /api/repos/:owner/:repo/subscription` within the same session. Target: >5% on web. Indicates the watch button is discoverable and compelling.
- **Watch button render success rate**: Percentage of repository page loads where the subscription status is successfully fetched and rendered. Target: >99.5%.
- **Subscription status cache hit rate**: (If client-side caching is implemented) Percentage of subscription checks served from cache vs. network. A high rate indicates efficient UX without unnecessary API calls.
- **Subscribed users as percentage of repo visitors**: For each repository, what fraction of unique authenticated visitors are subscribed. Useful for understanding engagement depth.
- **Mode distribution among subscribed users**: Breakdown of `watching` vs `participating` vs `ignored` across all subscription checks. Indicates whether users are fine-tuning their notification preferences or defaulting to full watching.

## Observability

### Logging Requirements

| Log Event                                          | Level | Structured Context                                                                                |
|----------------------------------------------------|-------|---------------------------------------------------------------------------------------------------|
| Subscription status retrieved successfully         | DEBUG | `user_id`, `repo_id`, `repo_full_name`, `is_subscribed`, `mode`, `request_id`, `response_time_ms` |
| Subscription status — repo not found               | INFO  | `user_id`, `owner_param`, `repo_param`, `request_id`                                              |
| Subscription status — unauthenticated              | WARN  | `request_id`, `client_ip`                                                                          |
| Rate limit triggered                               | WARN  | `user_id`, `endpoint`, `request_id`, `client_ip`                                                   |
| Unexpected service error                           | ERROR | `user_id`, `repo_id`, `request_id`, `error_message`, `stack_trace`                                 |
| Slow query (>200ms)                                | WARN  | `user_id`, `repo_id`, `request_id`, `response_time_ms`                                             |

Note: Successful subscription checks are logged at DEBUG level (not INFO) because this endpoint is called on every repository page load and would produce excessive log volume at INFO.

### Prometheus Metrics

| Metric Name                                                       | Type      | Labels                                     | Description                                        |
|-------------------------------------------------------------------|-----------|--------------------------------------------|----------------------------------------------------||
| `codeplane_repo_subscription_get_requests_total`                  | Counter   | `status` (200/401/404/429/500), `client`   | Total subscription get requests                    |
| `codeplane_repo_subscription_get_request_duration_seconds`        | Histogram | `status`                                   | Latency (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_repo_subscription_get_subscribed_total`                | Counter   | `mode` (watching/participating/ignored)    | Count of checks that returned a subscribed result   |
| `codeplane_repo_subscription_get_unsubscribed_total`              | Counter   | (none)                                     | Count of checks that returned not-subscribed        |
| `codeplane_repo_subscription_get_rate_limited_total`              | Counter   | (none)                                     | Total rate-limited subscription get requests        |

### Alerts

#### Alert: Elevated Repo Subscription Get Latency
- **Condition**: `histogram_quantile(0.95, rate(codeplane_repo_subscription_get_request_duration_seconds_bucket[5m])) > 0.5` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. This endpoint is on the critical path for every repository page load. Latency here directly impacts perceived page load time.
  2. Check database connection pool health via admin health endpoint or PG metrics (`pg_stat_activity`).
  3. Run `EXPLAIN ANALYZE` on the `GetWatchStatus` query — verify the `watches(user_id, repository_id)` unique index is being used for the lookup.
  4. Check if repo resolution (owner + name → repo ID) is the bottleneck — the `getRepoByOwnerAndLowerName` query may be slow if the `repositories` index is degraded.
  5. Check if a concurrent migration, vacuum, or heavy write operation is holding locks on the `watches` table.
  6. Verify overall server CPU, memory, and I/O via system monitoring dashboard.
  7. If latency correlates with specific repos, check if those repos have unusual data patterns (though this is unlikely for a single-row lookup).

#### Alert: Repo Subscription Get Error Spike
- **Condition**: `rate(codeplane_repo_subscription_get_requests_total{status="500"}[5m]) > 1` sustained for 3 minutes.
- **Severity**: Critical
- **Runbook**:
  1. Check server ERROR logs filtered by `repo_subscription_get` or related context tags.
  2. Verify database connectivity — run a health check query.
  3. Check if the `watches` table exists and the `getWatchStatus` query is syntactically valid (possible after a failed migration).
  4. Verify the repo service was correctly initialized in the service registry (check boot logs).
  5. If errors started after a deploy, roll back and investigate.
  6. If errors correlate with specific user IDs or repo IDs, check for data corruption (e.g., invalid mode values in the `watches` table).

#### Alert: Abnormal 404 Rate on Subscription Get
- **Condition**: `rate(codeplane_repo_subscription_get_requests_total{status="404"}[5m]) / rate(codeplane_repo_subscription_get_requests_total[5m]) > 0.3` sustained for 10 minutes.
- **Severity**: Warning
- **Runbook**:
  1. A 30%+ 404 rate is unusual — most subscription checks should be for repos the user can see.
  2. Check if a client-side bug is generating requests for non-existent repos (e.g., stale cached repo names, renamed repos not updating references).
  3. Check if a bulk repository deletion or migration caused many repos to disappear.
  4. Check access logs for the requesting user IDs — if concentrated on a few users/IPs, it may indicate scanning or enumeration.
  5. If caused by repo renames, verify that the web UI and CLI are using updated repo paths.

#### Alert: Rate Limiting Spike on Subscription Get
- **Condition**: `rate(codeplane_repo_subscription_get_rate_limited_total[5m]) > 20` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Identify top source user IDs from access logs.
  2. Determine if the traffic is from a legitimate integration polling subscription state for many repos, or a misbehaving client.
  3. For legitimate integrations, advise using the subscription list endpoint (`GET /api/user/subscriptions`) instead of per-repo checks.
  4. For misbehaving clients, apply targeted rate limits via admin controls.
  5. Consider whether the 600/min rate limit is set appropriately for the user's workflow.

### Error Cases and Failure Modes

| Failure Mode                                       | Expected Behavior                                              | Detection                                       |
|---------------------------------------------------|----------------------------------------------------------------|--------------------------------------------------|
| Database unavailable                              | Return 500 with `{ "message": "internal error" }`. Log ERROR. | `status=500` counter spike                      |
| `watches` table index missing or corrupted        | Query falls back to sequential scan. Latency increases.        | Latency histogram p95 alert fires               |
| Repo resolution fails (owner/name → ID)           | Return 404. No error logged (INFO level).                      | 404 counter (normal for missing repos)           |
| Watch record has invalid mode value                | Return the raw value. Log WARN for data integrity.             | WARN log grep                                    |
| Watch record has NULL timestamps                   | Return `created_at` as fallback for `updated_at`. Log WARN.   | WARN log grep                                    |
| Auth token expired mid-request                    | Return 401. Never 500.                                         | 401 counter                                      |
| Concurrent write during read (mode change in flight) | Read returns either old or new value. Both are valid.        | No alert — eventual consistency                  |

## Verification

### API Integration Tests

| #  | Test Description | Method / Setup | Expected |
|----|-----------------|----------------|----------|
| 1  | Get subscription for a repo the user is watching | Setup: user watches repo with mode `watching`. `GET /api/repos/:owner/:repo/subscription` | 200, `{ "subscribed": true, "subscription": { "mode": "watching", "created_at": "...", "updated_at": "..." } }` |
| 2  | Get subscription for a repo the user is participating in | Setup: user watches repo with mode `participating`. `GET /api/repos/:owner/:repo/subscription` | 200, `subscribed: true`, `subscription.mode === "participating"` |
| 3  | Get subscription for a repo the user has ignored | Setup: user watches repo with mode `ignored`. `GET /api/repos/:owner/:repo/subscription` | 200, `subscribed: true`, `subscription.mode === "ignored"` |
| 4  | Get subscription for a repo the user is NOT watching | Setup: user has no watch on repo. `GET /api/repos/:owner/:repo/subscription` | 200, `{ "subscribed": false }` — no `subscription` key present |
| 5  | Subscription response includes valid ISO 8601 timestamps | Setup: user watches repo. `GET /api/repos/:owner/:repo/subscription` | `subscription.created_at` and `subscription.updated_at` parse as valid Date objects |
| 6  | `created_at` is not later than `updated_at` | Setup: user watches repo. `GET /api/repos/:owner/:repo/subscription` | `new Date(subscription.created_at) <= new Date(subscription.updated_at)` |
| 7  | Unauthenticated request returns 401 | `GET /api/repos/:owner/:repo/subscription` (no auth) | 401, `{ "message": "authentication required" }` |
| 8  | Non-existent repo returns 404 | `GET /api/repos/nonexistent/nonexistent/subscription` (authenticated) | 404, `{ "message": "repository not found" }` |
| 9  | Private repo without read access returns 404 | Setup: private repo owned by another user. `GET /api/repos/:owner/:repo/subscription` | 404 |
| 10 | Private repo with read access returns subscription status | Setup: user is collaborator on private repo and is watching it. `GET /api/repos/:owner/:repo/subscription` | 200, `subscribed: true` |
| 11 | Private repo with read access — not subscribed | Setup: user is collaborator on private repo but not watching. `GET /api/repos/:owner/:repo/subscription` | 200, `{ "subscribed": false }` |
| 12 | Watch then immediately check status — consistency | `PUT /api/repos/:owner/:repo/subscription` (mode=watching), then `GET /api/repos/:owner/:repo/subscription` | 200, `subscribed: true`, `mode === "watching"` |
| 13 | Change mode then check status — reflects new mode | `PUT` with mode `watching`, then `PUT` with mode `participating`, then `GET` | `mode === "participating"` |
| 14 | Unwatch then check status — shows not subscribed | `PUT` then `DELETE`, then `GET` | `{ "subscribed": false }` |
| 15 | Archived repo returns subscription status normally | Setup: user watches repo, then repo is archived. `GET /api/repos/:owner/:repo/subscription` | 200, `subscribed: true` with correct mode |
| 16 | Forked repo has independent subscription | Setup: user watches parent, forks it. `GET /api/repos/:owner/:fork/subscription` | 200, `{ "subscribed": false }` (fork is independent) |
| 17 | Owner name is case-insensitive | Setup: repo is `JaneDoe/my-project`. `GET /api/repos/janedoe/my-project/subscription` | 200 (same result as with exact casing) |
| 18 | Repo name is case-insensitive | Setup: repo is `janedoe/My-Project`. `GET /api/repos/janedoe/my-project/subscription` | 200 (same result as with exact casing) |
| 19 | Response content-type is `application/json` | `GET /api/repos/:owner/:repo/subscription` | Content-Type header is `application/json` |
| 20 | No request body needed — body is ignored | `GET /api/repos/:owner/:repo/subscription` with random body `{"foo": "bar"}` | 200, normal response |
| 21 | Unknown query parameters are ignored | `GET /api/repos/:owner/:repo/subscription?foo=bar` | 200, normal response |
| 22 | Owner path param at maximum valid length (39 chars) | Setup: user with 39-char username owns repo. `GET /api/repos/:owner/:repo/subscription` | 200 |
| 23 | Repo path param at maximum valid length (100 chars) | Setup: repo with 100-char name. `GET /api/repos/:owner/:repo/subscription` | 200 |
| 24 | Owner path param with invalid characters returns 404 | `GET /api/repos/invalid%00owner/repo/subscription` | 404 |
| 25 | PAT authentication works for subscription check | `GET /api/repos/:owner/:repo/subscription` with PAT in Authorization header | 200 |
| 26 | Session cookie authentication works for subscription check | `GET /api/repos/:owner/:repo/subscription` with session cookie | 200 |
| 27 | Concurrent GET requests return consistent results | Send 10 concurrent `GET` requests for the same user/repo | All return identical response |
| 28 | Subscription status after repo transfer reflects new owner path | Setup: user watches repo, repo is transferred. `GET /api/repos/:new_owner/:repo/subscription` | 200, subscription intact under new owner |
| 29 | `subscribed: false` response does not include `subscription` key | `GET /api/repos/:owner/:repo/subscription` (not watching) | Response body keys are exactly `["subscribed"]` |
| 30 | `subscribed: true` response always includes `subscription` object | `GET /api/repos/:owner/:repo/subscription` (watching) | Response body has `subscribed` and `subscription` keys |

### CLI E2E Tests

| #  | Test Description | Command | Expected |
|----|-----------------|---------|----------|
| 31 | Check subscription status — watching (JSON) | `codeplane repo watch-status owner/repo --json` | Exit 0, `{ "subscribed": true, "subscription": { "mode": "watching", ... } }` |
| 32 | Check subscription status — not watching (JSON) | `codeplane repo watch-status owner/repo --json` (not subscribed) | Exit 0, `{ "subscribed": false }` |
| 33 | Check subscription status — human-readable (watching) | `codeplane repo watch-status owner/repo` | Exit 0, stdout contains "Watching owner/repo" and mode info |
| 34 | Check subscription status — human-readable (not watching) | `codeplane repo watch-status owner/repo` (not subscribed) | Exit 0, stdout contains "Not watching owner/repo" |
| 35 | Check subscription for nonexistent repo | `codeplane repo watch-status nonexistent/nonexistent` | Exit 1, stderr contains "not found" |
| 36 | Check subscription unauthenticated | `codeplane repo watch-status owner/repo` (no auth) | Exit 1, stderr contains authentication error |
| 37 | Watch then check status — confirms subscription | `codeplane repo watch owner/repo` then `codeplane repo watch-status owner/repo --json` | `subscribed: true, mode: "watching"` |
| 38 | Unwatch then check status — confirms removal | `codeplane repo unwatch owner/repo` then `codeplane repo watch-status owner/repo --json` | `subscribed: false` |
| 39 | Watch with mode=participating then check status | `codeplane repo watch owner/repo --mode participating` then `codeplane repo watch-status owner/repo --json` | `mode: "participating"` |

### Web UI E2E Tests (Playwright)

| #  | Test Description | Expected |
|----|-----------------|----------|
| 40 | Repository page shows watch button | Navigate to `/:owner/:repo`. Watch button is visible in header. |
| 41 | Watch button shows "Watch" for unsubscribed user | Navigate to repo not being watched. Button label is "Watch". |
| 42 | Watch button shows "Watching" after subscribing | Click Watch → select "Watching" → button label changes to "Watching" with green indicator. |
| 43 | Watch button shows "Participating" for participating mode | Set mode to participating → button label shows "Participating" with blue indicator. |
| 44 | Watch button shows "Ignored" for ignored mode | Set mode to ignored → button label shows "Ignored" with gray indicator. |
| 45 | Watch button displays watcher count | Navigate to any repo. Watch button area shows numeric watcher count. |
| 46 | Watch button persists state across page reloads | Subscribe to repo → reload page → button still shows "Watching". |
| 47 | Watch button prompts login for unauthenticated user | Open repo page unauthenticated → click Watch → redirected to login. |
| 48 | Watch button loading state | Navigate to repo → watch button shows skeleton/spinner before settling on state. |
| 49 | Watch button dropdown shows current mode with checkmark | Click dropdown on a watched repo → current mode has a checkmark indicator. |
| 50 | Watch button dropdown shows Unwatch option | Click dropdown on a watched repo → "Unwatch" option visible below modes. |

### Load & Boundary Tests

| #  | Test Description | Expected |
|----|-----------------|----------|
| 51 | Subscription get responds within 50ms at p95 | Single-row lookup should be fast. Latency check passes. |
| 52 | 200 concurrent subscription get requests succeed | All return 200 with consistent data. |
| 53 | Rate limiting engages after threshold (600/min authenticated) | 601st request within 1 minute returns 429 with `Retry-After` header. |
| 54 | Owner param at max valid length (39 chars) works | 200 response |
| 55 | Repo param at max valid length (100 chars) works | 200 response |
| 56 | Owner param exceeding max length returns 404 | 404 response (no matching owner) |
