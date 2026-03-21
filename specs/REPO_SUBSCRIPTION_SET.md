# REPO_SUBSCRIPTION_SET

Specification for REPO_SUBSCRIPTION_SET.

## High-Level User POV

When you find a repository on Codeplane that you want to stay informed about, watching it lets you control exactly what kinds of notifications you receive. From any repository's overview page, the CLI, or the TUI, you can set your watch mode to one of three levels — and change it at any time.

**Watching** means you receive notifications for all activity on the repository: new issues, landing request updates, workflow runs, comments, releases, and every other event the repository produces. This is the right choice for repositories you own or actively maintain, where you need to know about everything.

**Participating** means you only receive notifications for conversations and threads where you are directly involved — for example, issues you created or were assigned to, landing requests you authored or reviewed, and threads where you were explicitly mentioned. This is the right choice for repositories where you contribute occasionally but don't need to see every activity stream entry.

**Ignored** means you have explicitly silenced the repository. Even if you're mentioned or assigned, Codeplane suppresses notifications from this repository. This is the right choice for noisy repositories that you have access to but don't want cluttering your inbox. You can always undo this by switching back to watching or participating.

Setting your subscription is a single action — click a watch dropdown on the web, run `codeplane repo watch` in the terminal, or press a key in the TUI. If you've already set a subscription, changing the mode replaces your previous choice seamlessly. There's no need to "unwatch first, then re-watch differently" — you simply select the new mode, and the system updates your preference in place.

Your subscription choice is private. Other users can see that a repository has watchers (via the watcher count displayed on the repository overview), but they cannot see which specific mode you've chosen. Your notification preferences are yours alone.

Watching a repository is closely tied to your notification experience. The mode you choose here directly governs which events flow into your Codeplane inbox and, if you've enabled email notifications in your global settings, which events trigger emails. The subscription acts as a per-repository filter on top of your global notification preferences. If you've disabled notifications globally, no watch mode will generate notifications — but your subscriptions are preserved so that they take effect immediately when you re-enable notifications.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users can set their watch subscription on a repository via `PUT /api/repos/:owner/:repo/subscription`, which returns `200 OK` with the created/updated subscription object.
- [ ] The request body must include a `mode` field with one of the values: `watching`, `participating`, or `ignored`.
- [ ] Setting a subscription on a repository the user has not previously watched creates a new subscription record.
- [ ] Setting a subscription on a repository the user has already watched updates the existing record's mode in place (upsert semantics).
- [ ] Setting a subscription increments the repository's `num_watches` counter by 1 when the user was not previously watching (new subscription).
- [ ] Setting a subscription does NOT change the `num_watches` counter when the user already had an active subscription (mode change only).
- [ ] The response includes the full subscription object: `mode`, `created_at`, and `updated_at`.
- [ ] The subscription is immediately reflected in the user's subscription list (`GET /api/user/subscriptions`).
- [ ] The subscription is immediately reflected when queried via `GET /api/repos/:owner/:repo/subscription`.
- [ ] The watch action is accessible from the web UI (watch dropdown on repository overview), CLI (`codeplane repo watch`), and TUI (keyboard shortcut on repository detail/list).
- [ ] The web UI watch dropdown provides optimistic feedback (mode badge and count update immediately on selection, before server confirmation).
- [ ] The CLI command `codeplane repo watch <OWNER/REPO> --mode <MODE>` produces human-readable output by default and structured JSON with `--json`.
- [ ] The TUI allows setting watch mode from the repository detail screen via a keyboard shortcut that cycles through modes or opens a mode picker.

### Edge Cases

- [ ] Setting the same mode that is already active is idempotent: the API returns `200` with the current subscription, `updated_at` is refreshed, and `num_watches` does not change.
- [ ] Setting a subscription on a nonexistent repository returns `404`.
- [ ] Setting a subscription on a private repository the user does not have read access to returns `404` (not `403`, to avoid leaking repository existence).
- [ ] Setting a subscription on a repository owned by a nonexistent user returns `404`.
- [ ] An unauthenticated request returns `401` with `{ "message": "authentication required" }`.
- [ ] A request with an empty body returns `400` with a validation error indicating `mode` is required.
- [ ] A request with `mode` set to an invalid value (e.g., `"all"`, `"muted"`, `""`, `123`, `null`) returns `400` with `{ "message": "invalid mode: must be one of watching, participating, ignored" }`.
- [ ] A request with extra unknown fields in the body (e.g., `{ "mode": "watching", "extra": true }`) succeeds — unknown fields are silently ignored.
- [ ] If a unique constraint violation occurs on the watches table (concurrent upsert race), the operation resolves gracefully via `ON CONFLICT` and returns `200`.
- [ ] Two different users setting subscriptions on the same repository concurrently does not corrupt the `num_watches` counter.
- [ ] The same user setting different modes in rapid succession (race condition) results in the last-write winning; the subscription reflects the mode from the most recently processed request.
- [ ] Repository names containing hyphens, underscores, and dots are handled correctly in the `:owner/:repo` path parameters.
- [ ] Owner names are resolved case-insensitively.
- [ ] The `owner` path parameter cannot be empty (returns `400` with `"owner is required"`).
- [ ] The `repo` path parameter cannot be empty (returns `400` with `"repository name is required"`).
- [ ] After a repository is deleted, any watch records for that repository are cleaned up and do not appear in users' subscription lists.
- [ ] After a repository transitions from public to private, existing subscriptions remain valid but are only visible to the subscribing user.
- [ ] Setting a subscription on an archived repository is permitted.

### Boundary Constraints

- [ ] `owner` path parameter: non-empty string, 1–39 characters, alphanumeric and hyphens, must not start or end with a hyphen.
- [ ] `repo` path parameter: non-empty string, 1–100 characters, must not be a reserved name (e.g., `"stargazers"`, `"watchers"`).
- [ ] `mode` field in request body: must be exactly one of `"watching"`, `"participating"`, or `"ignored"`. Case-sensitive. Maximum length: 13 characters.
- [ ] Request body size: maximum 1 KB. Larger payloads return `413 Payload Too Large`.
- [ ] Response body: `200 OK` with JSON subscription object. Never empty on success.
- [ ] A single user can subscribe to an unlimited number of repositories (no artificial per-user cap).
- [ ] A single repository can accumulate an unlimited number of watchers (no artificial per-repo cap).
- [ ] The `subscribed` and `ignored` fields in the request body (sent by the existing CLI implementation) are accepted as legacy aliases but `mode` takes precedence if present.

## Design

### Web UI Design

**Location:** Watch dropdown on the repository overview page at `/:owner/:repo`.

**Watch Dropdown Component:**
- Positioned in the repository header/action bar, alongside the star button and fork button.
- Displays an eye icon and the current watcher count, plus a small dropdown caret.
- The eye icon has four visual states:
  - **Not watching** (no subscription): outline eye icon, label reads "Watch".
  - **Watching**: solid eye icon, label reads "Watching".
  - **Participating**: half-filled eye icon, label reads "Participating".
  - **Ignored**: eye icon with strikethrough, label reads "Ignored".
- Clicking the dropdown opens a popover menu with three radio-style options:
  - **Watching** — "Get notified of all activity on this repository."
  - **Participating** — "Only get notified when you're participating or @mentioned."
  - **Ignored** — "Never get notified. Mute all activity."
- The currently active mode is indicated with a checkmark next to the selected option.
- If the user is not currently subscribed, no option is checked and a fourth descriptive option is shown: "Not watching — You'll only receive notifications if you're @mentioned."
- Selecting a mode immediately sends `PUT /api/repos/:owner/:repo/subscription` with the chosen mode.
- **Optimistic UI**: The dropdown label, icon, and watcher count update immediately on selection. On failure: revert and show error toast.
- The watcher count uses K-abbreviation for counts >= 1,000 with exact count in tooltip.
- When not authenticated, clicking the dropdown redirects to login.

**Initial State Loading:**
- Repository overview response includes `num_watches` for the count.
- `GET /api/repos/:owner/:repo/subscription` determines the current user's watch mode (returns `404` if not subscribed).

### API Shape

#### Set Repository Subscription

```
PUT /api/repos/:owner/:repo/subscription
```

**Authentication:** Required (session cookie or PAT).

**Path Parameters:**
| Parameter | Type   | Required | Description                                    |
|-----------|--------|----------|------------------------------------------------|
| `owner`   | string | yes      | Repository owner username or organization name |
| `repo`    | string | yes      | Repository name                                |

**Request Body:**
```json
{
  "mode": "watching"
}
```

| Field       | Type   | Required | Description                                              |
|-------------|--------|----------|----------------------------------------------------------|
| `mode`      | string | yes*     | One of: `watching`, `participating`, `ignored`           |
| `subscribed`| boolean| no       | Legacy alias. Only used if `mode` is absent.             |
| `ignored`   | boolean| no       | Legacy alias. `true` = ignored. Only used if `mode` is absent. |
| `reason`    | string | no       | Legacy alias for mode. Only used if `mode` is absent.    |

*`mode` is preferred. If absent, mode is derived from legacy fields for backward compatibility.

**Success Response:** `200 OK`

```json
{
  "mode": "watching",
  "created_at": "2026-03-21T10:00:00.000Z",
  "updated_at": "2026-03-21T10:00:00.000Z",
  "repository": {
    "id": 42,
    "full_name": "janedoe/my-project",
    "num_watches": 15
  }
}
```

**Error Responses:**
| Status | Condition                                                        |
|--------|------------------------------------------------------------------|
| 400    | Missing or empty `owner` or `repo` path parameter               |
| 400    | Missing `mode` field and no valid legacy fields                  |
| 400    | Invalid `mode` value                                             |
| 401    | Not authenticated                                                |
| 404    | Repository not found, or private repo without read access        |
| 413    | Request body exceeds 1 KB                                        |
| 429    | Rate limit exceeded                                              |
| 500    | Internal server error                                            |

**Idempotency:** Setting the same mode returns `200` with the current subscription. `updated_at` is refreshed.

### SDK Shape

The `RepoService` class in `@codeplane/sdk` exposes:

```typescript
watchRepo(
  actor: RepoActor | null,
  owner: string,
  repo: string,
  mode: "watching" | "participating" | "ignored"
): Promise<Result<WatchSubscription, APIError>>
```

- Requires a non-null `actor` (returns `unauthorized` error otherwise).
- Validates `mode` is one of the three allowed values.
- Resolves the repository via `resolveReadableRepo`.
- Checks `getWatchStatus` before upserting to determine if new subscription (for counter management).
- Calls `watchRepo` SQL (INSERT ... ON CONFLICT DO UPDATE) to create or update.
- If new subscription, increments `num_watches`.
- Returns subscription object with `mode`, `created_at`, `updated_at`, and repository summary.

```typescript
interface WatchSubscription {
  mode: "watching" | "participating" | "ignored";
  created_at: string;
  updated_at: string;
  repository: {
    id: number;
    full_name: string;
    num_watches: number;
  };
}
```

### CLI Command

#### Watch a Repository

```
codeplane repo watch <OWNER/REPO> [--mode MODE]
```

**Arguments:**
| Argument     | Type   | Required | Description                                  |
|--------------|--------|----------|----------------------------------------------|
| `OWNER/REPO` | string | yes      | Repository reference in `owner/repo` format  |

**Options:**
| Option   | Type   | Default    | Description                                         |
|----------|--------|------------|-----------------------------------------------------|
| `--mode` | enum   | `watching` | Watch mode: `watching`, `participating`, or `ignored` |
| `--json` | flag   | false      | Output response as structured JSON                  |

**Behavior:**
- Sends `PUT /api/repos/:owner/:repo/subscription` with `{ "mode": "<mode>" }`.
- On success (human-readable): outputs `Updated watch settings for owner/repo`.
- On success (JSON): outputs the full subscription response object.
- On error: prints error to stderr and exits with code 1.
- Requires authentication.
- The `--mode` flag defaults to `watching` if omitted.
- Invalid mode values produce a CLI validation error without making an API call.

**Examples:**
```bash
codeplane repo watch janedoe/my-project
codeplane repo watch janedoe/my-project --mode participating
codeplane repo watch janedoe/my-project --mode ignored
codeplane repo watch janedoe/my-project --mode watching --json
```

### TUI UI

**Repository Detail Screen:**
- A watch mode indicator in the repository header area, next to the star indicator.
- Pressing `w` opens a watch mode picker overlay with three options. Current mode highlighted.
- Selecting a mode with Enter sends the API request and updates the indicator optimistically.

**Repository List Screen:**
- Each repository row shows a small watch mode indicator if subscribed: green `[W]`, blue `[P]`, or gray `[I]`.
- Pressing `w` while focused opens the same mode picker overlay.

**Status Bar Feedback:**
- After setting a subscription: brief message like `👁 Watching janedoe/my-project`.

### Neovim Plugin API

`:CodeplaneRepoWatch [mode]` — sets subscription on the repository resolved from the current working directory. Mode defaults to `watching`.

### VS Code Extension

- "Watch Repository" command in command palette (`Codeplane: Watch Repository`).
- Mode picker quick-pick with three options.
- Status bar shows current watch mode for the active repository context.

### Documentation

- **API Reference — Repositories**: Document `PUT /api/repos/:owner/:repo/subscription` with full request/response schema, legacy field compatibility, authentication requirements, response codes, and idempotency behavior.
- **CLI Reference — `repo watch`**: Document the command with usage examples for all three modes, human-readable and JSON output, and error scenarios.
- **Web Guide — Repository Overview**: Describe the watch dropdown, its three modes, optimistic UI behavior, and relationship to notifications.
- **Concepts Guide — Watching vs Starring**: Explain the distinction between watching (notification subscription with modes) and starring (bookmarking/social signal).
- **Concepts Guide — Notification Modes**: Explain what each watch mode means in terms of which notification events are delivered, with concrete examples.

## Permissions & Security

### Authorization

| Role                                     | Set Subscription |
|------------------------------------------|------------------|
| Anonymous (unauthenticated)              | ❌                |
| Authenticated user (any)                 | ✅ (if repo is readable) |
| Repository member (any role)             | ✅                |
| Organization member (with repo access)   | ✅                |
| Site admin                               | ✅                |

**Key rules:**
- Authentication is strictly required. Unauthenticated requests return `401`.
- The user must have read access to the repository. The system uses `resolveReadableRepo`, which checks repository existence, visibility, and the user's access level.
- Private repositories that the user cannot read return `404` (not `403`) to prevent leaking repository existence.
- No elevated permissions (admin, owner) are required beyond basic read access. Any authenticated user who can see a repository can set their watch mode.
- A user can watch their own repositories.
- There is no concept of "watching on behalf of another user" — the subscription is always attributed to the authenticated actor.
- The `ignored` mode is not restricted — any user can mute any repository they can read.

### Rate Limiting

- **Set subscription endpoint**: 30 requests per minute per user. This prevents automated watch-farming or mode-cycling scripts.
- Rate-limited responses use `429 Too Many Requests` with `Retry-After` header.
- Additional abuse detection: if a single user sets subscriptions on more than 200 repositories in a 1-hour window, log a warning for potential automation abuse (do not block, but flag for review).

### Data Privacy

- The subscription record associates the user's ID with a repository ID and a mode string. The mode itself is private to the user.
- The watcher count on a repository is a public aggregate — it reveals how many users are watching, but not who they are or what modes they've chosen.
- The `PUT` request and response do not contain or return any user PII.
- Watching a private repository creates a record, but that record is only visible to the subscribing user (via their own subscription list and the per-repo subscription check).
- The watch mode is not included in any public-facing watcher list. The watcher list (if exposed) would show usernames only, not modes.

## Telemetry & Product Analytics

### Business Events

| Event Name                   | Trigger                                                                   | Properties                                                                                                                                    |
|------------------------------|---------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `RepoSubscriptionSet`        | `PUT /api/repos/:owner/:repo/subscription` returns `200`                   | `user_id`, `repo_id`, `repo_owner`, `repo_name`, `repo_full_name`, `repo_is_public`, `mode`, `previous_mode` (nullable), `is_new_subscription` (boolean), `client` (web/cli/tui/api/vscode/neovim) |
| `RepoSubscriptionSetFailed`  | `PUT /api/repos/:owner/:repo/subscription` returns 4xx/5xx                | `user_id` (nullable), `repo_owner`, `repo_name`, `error_status`, `error_message`, `requested_mode` (nullable), `client`                        |

### Key Event Properties

- `user_id`: The authenticated user's ID.
- `repo_id`: The repository ID.
- `repo_owner`: The owner username or organization name.
- `repo_name`: The repository name.
- `repo_full_name`: The full `owner/name` string.
- `repo_is_public`: Boolean indicating whether the repository is public.
- `mode`: The watch mode that was set (`watching`, `participating`, or `ignored`).
- `previous_mode`: The user's previous watch mode, or `null` if this is a new subscription.
- `is_new_subscription`: `true` if the user was not previously subscribed, `false` if updating an existing subscription.
- `client`: The surface that triggered the action — one of `web`, `cli`, `tui`, `api`, `vscode`, `neovim`.
- `error_status`: HTTP status code on failure.
- `error_message`: Human-readable error reason.
- `requested_mode`: The mode the user attempted to set (if parseable from the request body).

### Funnel Metrics & Success Indicators

- **Subscription adoption rate**: Percentage of active authenticated users who have at least one active subscription. Target: >= 40% of monthly active users.
- **Mode distribution**: Breakdown of active subscriptions by mode. Healthy: `watching` > 50%, `participating` > 20%, `ignored` < 15%. High `ignored` indicates notification fatigue.
- **Mode change rate**: Percentage of `RepoSubscriptionSet` events where `is_new_subscription` is `false`. A healthy mix suggests users are fine-tuning preferences.
- **New subscription to first notification delivered**: Time from `RepoSubscriptionSet` (mode=watching) to first notification. Shorter is better.
- **Subscription to unsubscription ratio**: Ratio of set to clear events. Healthy: >= 3:1.
- **Client distribution**: Breakdown by client (web, CLI, TUI, etc.) to prioritize UX investment.
- **Watching to Ignored transition rate**: Percentage of users going from `watching` directly to `ignored`. High rate may indicate overwhelming notification volume.
- **Time from repo creation to first watcher**: Measures discoverability of new repositories.

## Observability

### Logging Requirements

| Log Point                                           | Level   | Structured Fields                                                                                              | Description                                                             |
|-----------------------------------------------------|---------|----------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| Subscription set request received                   | `DEBUG` | `owner`, `repo`, `user_id`, `requested_mode`, `request_id`                                                    | Entry point for subscription mutation                                   |
| Subscription set completed (new subscription)       | `INFO`  | `owner`, `repo`, `user_id`, `repo_id`, `mode`, `request_id`, `duration_ms`                                    | New subscription created and counter incremented                        |
| Subscription set completed (mode changed)           | `INFO`  | `owner`, `repo`, `user_id`, `repo_id`, `mode`, `previous_mode`, `request_id`, `duration_ms`                   | Existing subscription's mode updated                                    |
| Subscription set completed (same mode, idempotent)  | `INFO`  | `owner`, `repo`, `user_id`, `repo_id`, `mode`, `request_id`, `duration_ms`, `idempotent: true`                | Mode unchanged — timestamp refreshed only                               |
| Subscription upsert race handled                    | `WARN`  | `owner`, `repo`, `user_id`, `repo_id`, `request_id`                                                           | Concurrent upsert race resolved via ON CONFLICT                         |
| Subscription set auth failure                       | `WARN`  | `request_id`, `client_ip`                                                                                      | Unauthenticated request attempted                                       |
| Subscription set repo not found                     | `WARN`  | `owner`, `repo`, `user_id`, `request_id`                                                                       | Repository does not exist or user lacks read access                     |
| Subscription set invalid mode                       | `WARN`  | `owner`, `repo`, `user_id`, `request_id`, `invalid_mode`                                                       | Request body contained invalid mode value                               |
| Subscription set missing body                       | `WARN`  | `owner`, `repo`, `user_id`, `request_id`                                                                       | Request body was empty or missing mode                                  |
| Subscription set internal error                     | `ERROR` | `owner`, `repo`, `user_id`, `request_id`, `error_message`, `stack_trace`                                       | Unexpected failure in service or database layer                         |
| Watch counter increment completed                   | `DEBUG` | `repo_id`, `new_count`, `request_id`                                                                           | Counter incremented after new subscription insert                       |
| Legacy field fallback used                          | `INFO`  | `owner`, `repo`, `user_id`, `request_id`, `derived_mode`, `had_subscribed`, `had_ignored`, `had_reason`        | Request used legacy fields instead of `mode`                            |

### Prometheus Metrics

| Metric                                                       | Type      | Labels                                                   | Description                                                                  |
|--------------------------------------------------------------|-----------|----------------------------------------------------------|------------------------------------------------------------------------------|
| `codeplane_repo_subscription_set_requests_total`             | Counter   | `status` (200/400/401/404/413/429/500), `mode`           | Total subscription-set requests                                              |
| `codeplane_repo_subscription_set_duration_seconds`           | Histogram | `status`, `is_new` (true/false)                          | Request latency (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_repo_subscription_set_idempotent_total`           | Counter   | `mode`                                                   | Count of idempotent (same-mode) operations                                   |
| `codeplane_repo_subscription_set_mode_changes_total`         | Counter   | `from_mode`, `to_mode`                                   | Count of subscription mode transitions                                       |
| `codeplane_repo_subscription_set_new_total`                  | Counter   | `mode`                                                   | Count of new subscriptions created                                           |
| `codeplane_repo_subscription_upsert_races_total`             | Counter   | —                                                        | Count of concurrent upsert race conditions handled                           |
| `codeplane_repo_watchers_total`                              | Gauge     | `owner`, `repo`                                          | Current watcher count per repository                                         |

### Alerts

#### Alert: `RepoSubscriptionSetHighErrorRate`
- **Condition:** `rate(codeplane_repo_subscription_set_requests_total{status="500"}[5m]) / rate(codeplane_repo_subscription_set_requests_total[5m]) > 0.05`
- **Severity:** Warning
- **Summary:** More than 5% of subscription-set requests are returning 500 errors.
- **Runbook:**
  1. Check server logs for ERROR-level entries with `subscription` or `watch` context in the last 15 minutes.
  2. Verify database connectivity: run a health check query against the `watches` table.
  3. Check if the `watches` table has locking contention (e.g., from a concurrent migration or vacuum).
  4. Verify the `repositories` table's `num_watches` column is accessible and not locked by a long-running transaction.
  5. Check if the `watchRepo` upsert query or counter increment query is timing out.
  6. If errors started after a deploy, verify the SQL queries in `social_sql.ts` match the current schema.
  7. Restart the server process if connection pool exhaustion is suspected.

#### Alert: `RepoSubscriptionSetHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_repo_subscription_set_duration_seconds_bucket[5m])) > 1.0`
- **Severity:** Warning
- **Summary:** 95th percentile latency for subscription-set requests exceeds 1 second.
- **Runbook:**
  1. Check database query latencies for `GetWatchStatus`, `WatchRepo` (upsert), and counter increment queries.
  2. Run `EXPLAIN ANALYZE` on the `WatchRepo` upsert query — verify the `(user_id, repository_id)` unique index is being used.
  3. Check if the `repositories` table UPDATE for counter increment is blocked by row-level locks.
  4. Check overall database CPU and I/O utilization.
  5. If a specific repository is consistently slow, check concurrent subscription operations.
  6. Consider batching or async counter updates for extremely high throughput.

#### Alert: `RepoSubscriptionSetRaceConditionSpike`
- **Condition:** `rate(codeplane_repo_subscription_upsert_races_total[5m]) > 10`
- **Severity:** Info
- **Summary:** Elevated rate of concurrent-upsert race conditions on the watches table.
- **Runbook:**
  1. This is handled gracefully via ON CONFLICT DO UPDATE — not necessarily a problem.
  2. Check if a single user or repository is generating most races (may indicate misbehaving client).
  3. Verify the unique constraint on `watches(user_id, repository_id)` is intact.
  4. If sustained and high (>50/min), investigate client-side retry logic.

#### Alert: `RepoSubscriptionAbuseDetection`
- **Condition:** A single `user_id` generates more than 200 `RepoSubscriptionSet` events in a 1-hour window (application-level check).
- **Severity:** Warning
- **Summary:** A user is setting subscriptions at an unusually high rate, potentially automated.
- **Runbook:**
  1. Query analytics events for the user_id to see the pattern.
  2. Check if the user is legitimate (team lead onboarding) or an automation script.
  3. If abusive, rate-limit or flag the account.
  4. If legitimate, update the threshold.

### Error Cases and Failure Modes

| Error Case                                                   | Expected Behavior                                                          | HTTP Status |
|--------------------------------------------------------------|----------------------------------------------------------------------------|-------------|
| Unauthenticated user attempts to set subscription            | Return `{ "message": "authentication required" }`                          | 401         |
| Repository does not exist                                    | Return not-found error                                                     | 404         |
| Private repo, user lacks read access                         | Return not-found error (same as nonexistent)                               | 404         |
| Missing `owner` path parameter                               | Return `"owner is required"`                                               | 400         |
| Missing `repo` path parameter                                | Return `"repository name is required"`                                     | 400         |
| Missing `mode` field and no valid legacy fields              | Return `"mode is required"`                                                | 400         |
| Invalid `mode` value                                         | Return `"invalid mode: must be one of watching, participating, ignored"`   | 400         |
| Empty request body                                           | Return `"mode is required"`                                                | 400         |
| Request body exceeds 1 KB                                    | Return `"request body too large"`                                          | 413         |
| Database connection failure during upsert                    | Return internal error, log ERROR                                           | 500         |
| Database connection failure during counter increment         | Watch record may exist but counter not incremented. Log ERROR.             | 500         |
| Concurrent upsert race (ON CONFLICT)                         | Resolved gracefully by database. Returns 200.                              | 200         |
| Repository deleted after access check but before upsert      | Upsert may fail on FK constraint. Return 404.                              | 404         |

## Verification

### API Integration Tests

| Test ID        | Test Description                                                                        | Expected Result                                                                        |
|----------------|-----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| `API-SUB-001`  | Set subscription to `watching` on a public repo as authenticated user                   | `200 OK`, response has `mode: "watching"`, `created_at`, `updated_at`                  |
| `API-SUB-002`  | Set subscription to `participating` on a public repo                                    | `200 OK`, response has `mode: "participating"`                                         |
| `API-SUB-003`  | Set subscription to `ignored` on a public repo                                          | `200 OK`, response has `mode: "ignored"`                                               |
| `API-SUB-004`  | Set subscription, then verify `num_watches` increased by 1                              | Repository's `num_watches` incremented                                                 |
| `API-SUB-005`  | Set subscription, then change mode, verify `num_watches` did NOT change                 | `num_watches` stays the same after mode change                                         |
| `API-SUB-006`  | Set subscription, then verify via `GET /api/repos/:owner/:repo/subscription`            | `200 OK`, response has matching mode                                                   |
| `API-SUB-007`  | Set subscription, then verify repo appears in `GET /api/user/subscriptions`             | Repo present in subscription list with correct mode                                    |
| `API-SUB-008`  | Set same mode twice (idempotent)                                                        | `200 OK`, `num_watches` unchanged, `updated_at` is refreshed                           |
| `API-SUB-009`  | Change mode from `watching` to `participating`                                          | `200 OK`, mode is `participating`, `num_watches` unchanged                             |
| `API-SUB-010`  | Change mode from `participating` to `ignored`                                           | `200 OK`, mode is `ignored`, `num_watches` unchanged                                   |
| `API-SUB-011`  | Change mode from `ignored` to `watching`                                                | `200 OK`, mode is `watching`, `num_watches` unchanged                                  |
| `API-SUB-012`  | Set subscription on nonexistent repository                                              | `404`                                                                                  |
| `API-SUB-013`  | Set subscription with nonexistent owner                                                 | `404`                                                                                  |
| `API-SUB-014`  | Set subscription on private repo user does NOT have access to                           | `404` (not `403`)                                                                      |
| `API-SUB-015`  | Set subscription on private repo user DOES have read access to                          | `200 OK`                                                                               |
| `API-SUB-016`  | Set subscription without authentication                                                 | `401` with `{ "message": "authentication required" }`                                  |
| `API-SUB-017`  | Set subscription with empty body                                                        | `400` with mode-required error                                                         |
| `API-SUB-018`  | Set subscription with invalid mode `"all"`                                              | `400` with `"invalid mode: must be one of watching, participating, ignored"`           |
| `API-SUB-019`  | Set subscription with invalid mode `""`                                                 | `400`                                                                                  |
| `API-SUB-020`  | Set subscription with invalid mode `123` (numeric)                                      | `400`                                                                                  |
| `API-SUB-021`  | Set subscription with invalid mode `null`                                               | `400`                                                                                  |
| `API-SUB-022`  | Set subscription with mode `"WATCHING"` (wrong case)                                    | `400` (mode is case-sensitive)                                                         |
| `API-SUB-023`  | Set subscription with extra unknown fields in body                                      | `200 OK`, extra fields ignored                                                         |
| `API-SUB-024`  | Set subscription with empty `owner` parameter                                           | `400` with `"owner is required"`                                                       |
| `API-SUB-025`  | Set subscription with empty `repo` parameter                                            | `400` with `"repository name is required"`                                             |
| `API-SUB-026`  | Set subscription on repo with hyphenated name                                           | `200 OK`                                                                               |
| `API-SUB-027`  | Set subscription on repo with underscored name                                          | `200 OK`                                                                               |
| `API-SUB-028`  | Set subscription on repo with dotted name                                               | `200 OK`                                                                               |
| `API-SUB-029`  | Set subscription on org-owned repo                                                      | `200 OK`                                                                               |
| `API-SUB-030`  | Owner name resolved case-insensitively                                                  | `PUT /api/repos/OWNER/repo/subscription` equivalent to lowercase                       |
| `API-SUB-031`  | Two different users set subscription on same repo                                       | `num_watches` incremented by 2, both subscriptions active                              |
| `API-SUB-032`  | Response includes `repository.full_name` and `repository.num_watches`                   | Response contains nested repository info                                               |
| `API-SUB-033`  | All timestamps in response are valid ISO 8601                                           | `created_at` and `updated_at` parse as Date objects                                    |
| `API-SUB-034`  | Response content-type is `application/json`                                             | Content-Type header is `application/json`                                              |
| `API-SUB-035`  | Set subscription on archived repository                                                | `200 OK`                                                                               |
| `API-SUB-036`  | Legacy body `{ "subscribed": true, "reason": "watching" }` sets mode to `watching`     | `200 OK`, mode is `watching`                                                           |
| `API-SUB-037`  | Legacy body `{ "ignored": true }` sets mode to `ignored`                                | `200 OK`, mode is `ignored`                                                            |
| `API-SUB-038`  | Legacy body `{ "subscribed": true, "reason": "participating" }`                        | `200 OK`, mode is `participating`                                                      |
| `API-SUB-039`  | Body with both `mode` and legacy fields — `mode` takes precedence                       | `200 OK`, mode matches the `mode` field                                                |
| `API-SUB-040`  | Set and change mode in rapid succession (10 cycles across 3 modes)                      | Final state matches last action; `num_watches` is 1                                    |
| `API-SUB-041`  | Request body of exactly 1 KB succeeds                                                   | `200 OK` (boundary valid)                                                              |
| `API-SUB-042`  | Request body of 1025 bytes returns 413                                                  | `413 Payload Too Large`                                                                |

### CLI E2E Tests

| Test ID        | Test Description                                                                        | Expected Result                                                                        |
|----------------|-----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| `CLI-SUB-001`  | `codeplane repo watch owner/repo`                                                       | Exit code 0, stdout contains "Updated watch settings for owner/repo"                   |
| `CLI-SUB-002`  | `codeplane repo watch owner/repo --json`                                                | Exit code 0, valid JSON with `mode: "watching"`                                        |
| `CLI-SUB-003`  | `codeplane repo watch owner/repo --mode participating`                                  | Exit code 0, stdout contains "Updated watch settings"                                  |
| `CLI-SUB-004`  | `codeplane repo watch owner/repo --mode participating --json`                           | Exit code 0, valid JSON with `mode: "participating"`                                   |
| `CLI-SUB-005`  | `codeplane repo watch owner/repo --mode ignored`                                        | Exit code 0, stdout contains "Updated watch settings"                                  |
| `CLI-SUB-006`  | `codeplane repo watch owner/repo --mode ignored --json`                                 | Exit code 0, valid JSON with `mode: "ignored"`                                         |
| `CLI-SUB-007`  | `codeplane repo watch nonexistent/repo`                                                 | Exit code 1, stderr contains error                                                     |
| `CLI-SUB-008`  | `codeplane repo watch` (missing repo argument)                                          | Exit code 1, usage error                                                               |
| `CLI-SUB-009`  | `codeplane repo watch owner/repo --mode invalid`                                        | Exit code 1, stderr contains validation error                                          |
| `CLI-SUB-010`  | Watch via CLI, verify via API subscription exists                                       | `GET /api/repos/:owner/:repo/subscription` returns 200 with correct mode               |
| `CLI-SUB-011`  | Watch via CLI, verify via `codeplane repo list --watched`                                | Repo appears in watched list                                                           |
| `CLI-SUB-012`  | Watch with default mode, then change mode via CLI                                       | Second command succeeds, mode updated                                                  |
| `CLI-SUB-013`  | Watch a repo already watched via CLI (idempotent)                                       | Exit code 0, no error                                                                  |
| `CLI-SUB-014`  | Unauthenticated `codeplane repo watch owner/repo`                                       | Exit code 1, stderr contains authentication error                                      |

### Web UI Playwright E2E Tests

| Test ID        | Test Description                                                                        | Expected Result                                                                        |
|----------------|-----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| `UI-SUB-001`   | Watch dropdown is visible on repository overview page                                   | Watch dropdown with count is rendered                                                  |
| `UI-SUB-002`   | Click watch dropdown and select "Watching"                                              | Dropdown label changes to "Watching", count increments by 1                            |
| `UI-SUB-003`   | Click watch dropdown and select "Participating"                                         | Dropdown label changes to "Participating"                                              |
| `UI-SUB-004`   | Click watch dropdown and select "Ignored"                                               | Dropdown label changes to "Ignored"                                                    |
| `UI-SUB-005`   | Watch dropdown shows correct initial state for a watched repo                           | Dropdown renders with correct mode pre-selected                                        |
| `UI-SUB-006`   | Watch dropdown shows "Watch" for unsubscribed repo                                     | Dropdown renders with outline eye icon and "Watch" label                               |
| `UI-SUB-007`   | Change mode from "Watching" to "Participating"                                          | Dropdown label updates, count unchanged                                                |
| `UI-SUB-008`   | Change mode from "Participating" to "Ignored"                                           | Dropdown label updates, count unchanged                                                |
| `UI-SUB-009`   | Watch dropdown when not logged in redirects to login                                    | Clicking dropdown navigates to login page                                              |
| `UI-SUB-010`   | Watch count displays K-abbreviation for counts >= 1,000                                 | Count shows abbreviated format with tooltip                                            |
| `UI-SUB-011`   | Optimistic update reverts on API failure                                                | Simulate error; label and count revert, error toast appears                            |
| `UI-SUB-012`   | Watch a repo, navigate away and back                                                    | Watch state persists                                                                   |
| `UI-SUB-013`   | Watch popover shows descriptions for each mode                                          | Each mode option has descriptive subtext                                                |
| `UI-SUB-014`   | Currently active mode has checkmark in popover                                          | Selected mode has visible checkmark                                                    |

### TUI Integration Tests

| Test ID        | Test Description                                                                        | Expected Result                                                                        |
|----------------|-----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| `TUI-SUB-001`  | Press `w` on focused repo to open mode picker                                           | Mode picker overlay appears with three options                                         |
| `TUI-SUB-002`  | Select "Watching" from mode picker                                                      | Repo shows `[W]` indicator, status bar shows confirmation                              |
| `TUI-SUB-003`  | Select "Participating" from mode picker                                                 | Repo shows `[P]` indicator                                                             |
| `TUI-SUB-004`  | Select "Ignored" from mode picker                                                       | Repo shows `[I]` indicator                                                             |
| `TUI-SUB-005`  | Status bar shows confirmation after setting subscription                                | Brief message appears                                                                  |
| `TUI-SUB-006`  | Change mode in TUI, verify on Watching screen                                           | Repo appears with updated mode indicator                                               |
| `TUI-SUB-007`  | Escape key dismisses mode picker without changes                                        | Mode picker closes, no API call, mode unchanged                                        |

### Cross-Client Consistency Tests

| Test ID        | Test Description                                                                        | Expected Result                                                                        |
|----------------|-----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| `XSUB-001`     | Watch via CLI, verify subscription via API                                              | `GET /api/repos/:owner/:repo/subscription` returns 200 with matching mode              |
| `XSUB-002`     | Watch via API, verify via CLI `repo list --watched --json`                              | Repo present in CLI output with correct mode                                           |
| `XSUB-003`     | Watch via CLI, change mode via API, verify CLI reflects new mode                        | CLI shows updated mode                                                                 |
| `XSUB-004`     | Watch via API, verify subscription list via API includes repo                           | `GET /api/user/subscriptions` includes the repo                                        |
| `XSUB-005`     | Watch via CLI, unwatch via API, verify CLI shows no subscription                        | Consistent state across clients                                                        |
| `XSUB-006`     | Watch via API, verify `num_watches` on repo detail matches                              | `GET /api/repos/:owner/:repo` has incremented `num_watches`                            |

### Concurrency and Load Tests

| Test ID          | Test Description                                                                      | Expected Result                                                                        |
|------------------|---------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| `LOAD-SUB-001`   | 50 different users set subscription on the same repo concurrently                    | `num_watches` = 50, all subscriptions active                                           |
| `LOAD-SUB-002`   | Same user sets different modes on same repo 20 times rapidly                         | Final mode matches last request, `num_watches` is 1                                    |
| `LOAD-SUB-003`   | 100 concurrent requests from same user (same repo, same mode)                        | All return 200, `num_watches` is exactly 1, no duplicates                              |
| `LOAD-SUB-004`   | Subscription-set endpoint responds within 200ms at p95 under normal load             | Latency check passes                                                                   |
| `LOAD-SUB-005`   | 50 concurrent users alternating watch and unwatch on the same repo                   | Final `num_watches` equals count of users with active subscriptions                    |
