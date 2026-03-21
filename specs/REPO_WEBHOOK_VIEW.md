# REPO_WEBHOOK_VIEW

Specification for REPO_WEBHOOK_VIEW.

## High-Level User POV

When a repository administrator has created one or more webhooks for their repository, they need the ability to inspect any individual webhook in detail — to confirm it is configured correctly, to understand its current state, and to investigate whether deliveries are succeeding or failing. The webhook view is the primary inspection surface for a single webhook.

The administrator navigates to the repository's webhook settings, clicks on an existing webhook from the list, and is presented with its complete detail view. This view shows the webhook's configuration: the destination URL, which events it subscribes to, whether it is currently active, and when it was created and last updated. If a secret was configured, it is displayed in a redacted form to confirm its existence without exposing the actual value. The view also surfaces the most recent delivery history for this webhook, giving the administrator immediate visibility into whether payloads are being sent successfully, which events triggered deliveries, what HTTP status codes the receiving server returned, and how many delivery attempts have been made.

This feature is critical for debugging integration issues. When an external service stops receiving webhook payloads, the administrator's first action is to view the webhook detail and check its delivery history. If deliveries are failing, the response status codes and response bodies provide the diagnostic information needed to determine whether the problem is on the receiving end (e.g., 500 errors) or a configuration issue (e.g., the webhook was deactivated or the URL is wrong). If the webhook has been auto-disabled due to consecutive failures, this state is visible immediately in the detail view.

The webhook view is accessible through the Web UI settings page, the CLI via `codeplane webhook view <id>`, and the HTTP API via `GET /api/repos/:owner/:repo/hooks/:id`. All three interfaces return the same information and enforce the same access controls: only repository administrators can view webhook configurations and delivery histories.

## Acceptance Criteria

- A repository administrator can view the full detail of any webhook belonging to a repository they have admin access to.
- The webhook detail response includes: `id`, `repository_id`, `url`, `secret` (always redacted as `"********"` if a secret was configured, or `""` if no secret), `events`, `is_active`, `last_delivery_at`, `created_at`, and `updated_at`.
- The `id` field is the webhook's unique numeric identifier.
- The `repository_id` field is the UUID of the owning repository.
- The `url` field is the full HTTPS destination URL as originally configured (with whitespace trimmed).
- The `secret` field is **never** returned in plaintext — it is always `"********"` when a secret was set, or an empty string if no secret was configured.
- The `events` field is an array of event type strings. An empty array indicates wildcard (all events) subscription.
- The `is_active` field is a boolean reflecting whether the webhook is currently enabled to receive deliveries.
- The `last_delivery_at` field is an ISO 8601 timestamp of the most recent delivery attempt, or `null` if no deliveries have been made.
- The `created_at` and `updated_at` fields are ISO 8601 timestamps.
- All response field names use `snake_case`.
- The webhook ID must be a valid positive integer. Providing a non-numeric or zero/negative ID returns HTTP 400 with message `"invalid webhook id"`.
- If the webhook ID does not correspond to any webhook in the specified repository, the server returns HTTP 404 with message `"webhook not found"`.
- If the repository does not exist, the server returns HTTP 404 with message `"repository not found"`.
- If the owner does not exist, the server returns HTTP 404 with message `"repository not found"`.
- Unauthenticated requests are rejected with HTTP 401 and message `"authentication required"`.
- Authenticated users who are not repository administrators are rejected with HTTP 403 and message `"permission denied"`.
- A webhook belonging to a different repository than the one specified in the URL path returns HTTP 404 (the lookup is scoped to the owner/repo pair).
- The feature works identically through the API, CLI, and Web UI.
- The CLI `webhook view <id>` command returns both the webhook detail and its recent delivery history as a combined JSON object with `hook` and `deliveries` keys.
- The CLI accepts an optional `--repo OWNER/REPO` flag, falling back to repository auto-detection from the current directory's jj/git context.
- The Web UI webhook detail page is accessible at `/:owner/:repo/settings/webhooks/:id` within the repository settings area.
- The Web UI webhook detail page displays the webhook configuration in a summary section and the delivery history in a scrollable or paginated list below it.
- When a webhook has been auto-disabled (due to 10 consecutive delivery failures), the detail view clearly indicates the disabled state.
- Viewing a webhook does not trigger any side effects (no deliveries, no state changes).
- The delivery history shown alongside the webhook view is the same data available through the `REPO_WEBHOOK_DELIVERIES_LIST` endpoint (paginated, cursor-based, max 30 per page).

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/hooks/:id`

**Authentication:** Required. Session cookie, PAT (`Authorization: token <pat>`), or OAuth2 bearer token.

**Path Parameters:**

| Parameter | Type | Required | Constraints |
|-----------|------|----------|-------------|
| `owner` | string | Yes | Username or organization name. Case-insensitive lookup. |
| `repo` | string | Yes | Repository name. Case-insensitive lookup. |
| `id` | integer | Yes | Webhook numeric ID. Must be a positive integer. |

**Success Response:** `200 OK`
```json
{
  "id": 42,
  "repository_id": "550e8400-e29b-41d4-a716-446655440000",
  "url": "https://example.com/webhook",
  "secret": "********",
  "events": ["push", "landing_request"],
  "is_active": true,
  "last_delivery_at": "2026-03-22T14:30:00.000Z",
  "created_at": "2026-03-20T10:00:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Non-numeric, zero, or negative webhook ID | `{ "message": "invalid webhook id" }` |
| 401 | No authentication provided | `{ "message": "authentication required" }` |
| 403 | Authenticated user is not a repository admin | `{ "message": "permission denied" }` |
| 404 | Repository not found (invalid owner or repo) | `{ "message": "repository not found" }` |
| 404 | Webhook ID not found in the specified repository | `{ "message": "webhook not found" }` |
| 500 | Internal decryption failure of the webhook secret | `{ "message": "failed to decrypt webhook secret" }` |

**Response field mapping:** The server route layer maps internal camelCase fields from the service layer to `snake_case` for the API response. The `secret` field is redacted by the service layer before return (if non-empty, replaced with `"********"`).

### SDK Shape

The `WebhookService.getWebhook` method in `@codeplane/sdk` is the authoritative domain entry point:

```typescript
getWebhook(
  actor: AuthUser | undefined,
  owner: string,
  repo: string,
  webhookId: number
): Promise<GetRepoWebhookByOwnerAndRepoRow>
```

The method:
1. Validates the `webhookId` is a positive integer. If not, throws `badRequest("invalid webhook id")`.
2. Resolves the repository by owner (case-insensitive) and lower-cased repository name. If not found, throws `notFound("repository not found")`.
3. Verifies the actor has admin permission on the repository. If not authenticated, throws `unauthorized("authentication required")`. If not admin, throws `forbidden("permission denied")`.
4. Fetches the webhook by ID, scoped to the resolved repository via the owner/repo pair. If not found, throws `notFound("webhook not found")`.
5. Decrypts the webhook secret via the configured `SecretCodec`. If decryption fails, throws `internal("failed to decrypt webhook secret")`.
6. Returns the webhook row. The route layer re-redacts the secret for the API response via `mapWebhookResponse`.

**Return type `GetRepoWebhookByOwnerAndRepoRow`:**
```typescript
interface GetRepoWebhookByOwnerAndRepoRow {
  id: string;
  repositoryId: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  lastDeliveryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### CLI Command

```
codeplane webhook view <id> [options]
```

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | number | Yes | Webhook ID to view |

**Options:**

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--repo` | string | No | auto-detect | Repository in `OWNER/REPO` format |

**Behavior:**

The `view` command makes two parallel API requests:
1. `GET /api/repos/:owner/:repo/hooks/:id` — retrieves the webhook detail
2. `GET /api/repos/:owner/:repo/hooks/:id/deliveries` — retrieves recent delivery history

The combined output is returned as a JSON object with two keys:
```json
{
  "hook": {
    "id": 42,
    "repository_id": "...",
    "url": "https://example.com/webhook",
    "secret": "********",
    "events": ["push", "landing_request"],
    "is_active": true,
    "last_delivery_at": "2026-03-22T14:30:00.000Z",
    "created_at": "2026-03-20T10:00:00.000Z",
    "updated_at": "2026-03-22T14:30:00.000Z"
  },
  "deliveries": [
    {
      "id": "101",
      "webhook_id": "42",
      "event_type": "push",
      "payload": { "..." },
      "status": "success",
      "response_status": 200,
      "response_body": "",
      "attempts": 1,
      "delivered_at": "2026-03-22T14:30:00.000Z",
      "next_retry_at": null,
      "created_at": "2026-03-22T14:30:00.000Z",
      "updated_at": "2026-03-22T14:30:00.000Z"
    }
  ]
}
```

**Example:**
```bash
codeplane webhook view 42 --repo alice/my-project
```

### Web UI Design

**Location:** `/:owner/:repo/settings/webhooks/:id` — accessible by clicking a webhook in the list at `/:owner/:repo/settings/webhooks`.

**Webhook Detail Page Layout:**

1. **Header Section**
   - Breadcrumb: `Repository Settings > Webhooks > Webhook #<id>`
   - Webhook URL displayed prominently as the page heading (truncated with tooltip if very long).
   - Active/inactive status badge: green "Active" pill or red "Inactive" pill.
   - If auto-disabled, an alert banner: "This webhook has been automatically disabled after 10 consecutive delivery failures. Re-enable it in the settings below once the receiving endpoint is fixed."

2. **Configuration Summary**
   - **Payload URL:** Displayed as a read-only text field or styled text. Full URL shown.
   - **Secret:** Shows `"********"` if configured, or "No secret configured" in muted text.
   - **Events:** List of subscribed event types shown as tag pills (e.g., `push`, `landing_request`). If subscribed to all events, display "All events" or `*`.
   - **Active:** Toggle switch or status indicator showing the current active state.
   - **Created:** Human-readable relative timestamp with ISO tooltip (e.g., "2 days ago").
   - **Last delivery:** Human-readable relative timestamp with ISO tooltip, or "Never" if `last_delivery_at` is null.

3. **Action Buttons**
   - "Edit" button — navigates to the webhook edit form (REPO_WEBHOOK_UPDATE).
   - "Test delivery" button — triggers a ping test delivery (REPO_WEBHOOK_TEST_DELIVERY). Shows a toast confirmation on success.
   - "Delete" button — opens a confirmation dialog, then deletes the webhook (REPO_WEBHOOK_DELETE). Redirects to the webhook list on success.

4. **Recent Deliveries Section**
   - Section heading: "Recent Deliveries"
   - Table or card list showing recent deliveries, ordered newest-first:
     - **Status icon:** Green check for success, red X for failed, yellow clock for pending.
     - **Event type:** Badge showing the event type (e.g., `push`, `issues`).
     - **Delivery ID:** Shown as a monospace identifier.
     - **HTTP Response Status:** The response status code (e.g., `200`, `500`), or "—" if pending.
     - **Attempts:** Number of delivery attempts.
     - **Timestamp:** Relative time of the delivery (e.g., "3 minutes ago").
   - Each delivery row is clickable/expandable, revealing:
     - **Request payload:** JSON viewer showing the full event payload.
     - **Response body:** Truncated response body from the receiving server (up to 10 KB).
     - **Delivered at:** Full ISO timestamp.
     - **Next retry at:** If the delivery is pending retry, show the scheduled retry time.
   - Pagination at the bottom: "Load more" button or cursor-based infinite scroll (max 30 deliveries per page).
   - Empty state: "No deliveries yet. Trigger a repository event or use the 'Test delivery' button to send a ping."

5. **Permission Gate**
   - If the current user is not a repository admin, the page shows a "You do not have permission to view this webhook" message or redirects to the repository settings root.

### Documentation

The following end-user documentation should exist:

1. **API Reference — Webhooks > View a Webhook**: Document the `GET /api/repos/{owner}/{repo}/hooks/{id}` endpoint with path parameter descriptions, response schema, all possible error codes (400, 401, 403, 404, 500), and a `curl` example. This should be part of the existing `docs/api-reference/webhooks.mdx` reference.

2. **CLI Reference — `codeplane webhook view`**: Document the `<id>` positional argument, the `--repo` flag, the combined output format (webhook detail + delivery history), and example invocations.

3. **User Guide — Managing Webhooks > Viewing Webhook Details**: A section within the webhooks user guide explaining how to access the webhook detail view from the Web UI, what each field means, how to interpret delivery statuses (success, failed, pending), how to identify auto-disabled webhooks, and what to do when deliveries are failing.

## Permissions & Security

### Authorization Roles

| Role | Can View Webhook? |
|------|------------------|
| Repository Owner | Yes |
| Organization Owner (for org repos) | Yes |
| Team member with `admin` permission on the repository | Yes |
| Collaborator with `admin` permission | Yes |
| Collaborator with `write` permission | No (403) |
| Collaborator with `read` permission | No (403) |
| Authenticated user with no repository relationship | No (403) |
| Unauthenticated / anonymous | No (401) |

### Permission Resolution Order

1. Check if the actor is authenticated. If not, return 401.
2. Check if the actor is the repository's direct owner. If yes, grant admin.
3. If the repository belongs to an organization, check if the actor is an org owner. If yes, grant admin.
4. Check the actor's highest team permission for the repository. If `admin`, grant admin.
5. Check the actor's direct collaborator permission. If `admin`, grant admin.
6. If none of the above, return 403.

### Rate Limiting

- The global API rate limiter applies to webhook view requests.
- Webhook view is a read-only operation and does not require special per-resource rate limiting beyond the global policy.
- Repeated rapid polling of the webhook detail endpoint should be bounded by the global rate limiter (standard API rate limit applies).

### Data Privacy and Security

- **Secret redaction**: The webhook secret is decrypted internally for operational purposes but is always re-redacted as `"********"` before being returned in the API response. The plaintext secret never appears in any client-visible response.
- **URL sensitivity**: Webhook URLs may contain authentication tokens or API keys embedded in query parameters or path segments. The URL is only visible to authenticated admin users. It must not be logged in full in server logs — only the domain portion should appear in structured logs.
- **Delivery payload exposure**: Delivery payloads may contain repository metadata (commit messages, issue titles, user names). This data is already repository-scoped and only visible to repository admins, so no additional privacy masking is required.
- **Response body exposure**: The response body from the receiving endpoint (up to 10 KB) may contain error messages from third-party services. This is acceptable since only admins can view it, but it should not be indexed or searchable.
- **No PII leakage in error messages**: Error responses (401, 403, 404) must not reveal whether a webhook exists if the user lacks permission — 403 should be returned before webhook existence is checked (the current implementation checks admin permission before looking up the webhook, which is correct).

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WebhookViewed` | Webhook detail successfully retrieved | `webhook_id`, `repository_id`, `owner`, `repo`, `is_active`, `events_count`, `has_deliveries` (boolean), `source` (`api` \| `cli` \| `web`), `actor_id` |
| `WebhookViewFailed` | Webhook view request rejected | `webhook_id` (if parseable), `repository_id` (if resolved), `owner`, `repo`, `failure_reason` (`auth`, `permission`, `not_found`, `invalid_id`, `internal`), `source`, `actor_id` (if authenticated) |

### Funnel Metrics

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| **View-to-edit conversion** | % of `WebhookViewed` events followed by a `WebhookUpdated` event for the same webhook within 10 minutes | Indicates users are actively managing webhooks, not just passively checking |
| **View-to-test-delivery conversion** | % of `WebhookViewed` events followed by a `WebhookTestDeliverySent` event within 5 minutes | Indicates users are actively validating webhook configuration |
| **View frequency per webhook** | Average number of `WebhookViewed` events per webhook per week | High repeat views for the same webhook may indicate delivery problems prompting repeated inspection |
| **View source distribution** | Breakdown of `source` property across views | Informs where users prefer to inspect webhooks |
| **Failed webhook inspection rate** | % of `WebhookViewed` where `is_active: false` | High rate indicates many auto-disabled or manually disabled webhooks — a signal of integration quality issues |

## Observability

### Structured Logging

| Log Point | Level | Context Fields | Description |
|-----------|-------|---------------|-------------|
| Webhook view initiated | `info` | `actor_id`, `owner`, `repo`, `webhook_id` | Logged when the route handler is entered |
| Webhook permission denied | `warn` | `actor_id`, `owner`, `repo`, `webhook_id` | Logged when a non-admin attempts to view |
| Webhook not found | `info` | `actor_id`, `owner`, `repo`, `webhook_id` | Logged when the webhook ID does not exist for the repository |
| Repository not found | `info` | `actor_id`, `owner`, `repo` | Logged when the owner/repo pair does not resolve |
| Invalid webhook ID | `info` | `actor_id`, `owner`, `repo`, `raw_id` | Logged when a non-numeric or invalid ID is provided |
| Secret decryption failed | `error` | `owner`, `repo`, `webhook_id` (no secret material) | Logged when `SecretCodec.decryptString` throws |
| Webhook view successful | `info` | `actor_id`, `owner`, `repo`, `webhook_id`, `is_active` | Logged on successful retrieval |

**Critical rule:** Never log the webhook URL in full (may contain auth tokens in path or query parameters). Never log the decrypted secret. Never log request/response bodies at info level or below.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_webhook_views_total` | Counter | `status` (`success`, `not_found`, `permission_denied`, `auth_error`, `invalid_id`, `internal_error`), `source` (`api`, `cli`, `web`) | Total webhook view attempts |
| `codeplane_webhook_view_duration_seconds` | Histogram | `status` | End-to-end latency of the view operation (includes repo resolution, permission check, webhook fetch, secret decryption) |
| `codeplane_webhook_secret_decryption_errors_total` | Counter | — | Secret decryption failures on view (shared with other operations) |

### Alerts

#### Alert: `WebhookViewErrorRateHigh`
**Condition:** `rate(codeplane_webhook_views_total{status="internal_error"}[5m]) > 0.1`
**Severity:** Critical
**Runbook:**
1. Check server logs for `error`-level messages containing "failed to decrypt webhook secret" with the affected `webhook_id` and `owner/repo`.
2. If decryption errors dominate: verify the `SecretCodec` configuration. Check whether the encryption key has been rotated or is unavailable. Verify environment variables and secrets manager connectivity.
3. If database query errors: check database connectivity via `pg_stat_activity`. Verify the `webhooks` table is accessible and the owner/repo join queries are executing correctly.
4. Check for recent deployments that may have altered the `webhooks` schema or changed the `SecretCodec` provider.
5. If the issue is isolated to specific webhooks, attempt to view a different webhook to determine if the problem is data-specific (corrupted encrypted secret) or systemic.

#### Alert: `WebhookViewLatencyHigh`
**Condition:** `histogram_quantile(0.95, rate(codeplane_webhook_view_duration_seconds_bucket[5m])) > 1`
**Severity:** Warning
**Runbook:**
1. Check database query latency — the view flow issues multiple queries (repo lookup by owner/lower_name join, permission checks across user/org/team/collaborator tables, webhook fetch by owner/repo/id join). Run `EXPLAIN ANALYZE` on the `GetRepoWebhookByOwnerAndRepo` query.
2. Check if the `SecretCodec` decryption step is slow (e.g., KMS call latency if using cloud-based key management).
3. Check for database connection pool exhaustion via `pg_stat_activity`.
4. Review the join complexity in `getRepoWebhookByOwnerAndRepo` — ensure proper indexes exist on `webhooks.id`, `repositories.lower_name`, `users.username`, and `organizations.name`.
5. Check if concurrent bulk-view traffic from CLI scripts or CI is overwhelming the database.

#### Alert: `WebhookViewNotFoundSpike`
**Condition:** `rate(codeplane_webhook_views_total{status="not_found"}[15m]) > 5`
**Severity:** Info
**Runbook:**
1. Check logs to identify which webhook IDs are being requested. This may indicate stale bookmarks, cached URLs, or scripts using deleted webhook IDs.
2. Check if a recent bulk-delete operation removed webhooks that external systems are still referencing.
3. No action required unless the rate is extremely high, which may indicate a crawling/enumeration attempt. In that case, check for patterns in the source IPs and consider blocking.

### Error Cases and Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Internal Action |
|-------------|-------------|---------------------|------------------|
| Non-numeric webhook ID | 400 | "invalid webhook id" | Log at `info` level with raw ID value |
| Zero or negative webhook ID | 400 | "invalid webhook id" | Log at `info` level |
| Unauthenticated request | 401 | "authentication required" | Log at `warn` level |
| Non-admin user | 403 | "permission denied" | Log at `warn` level |
| Repository not found | 404 | "repository not found" | Log at `info` level |
| Webhook not found | 404 | "webhook not found" | Log at `info` level |
| Secret decryption failure | 500 | "failed to decrypt webhook secret" | Log at `error`, fire alert |
| Database connection failure | 500 | Internal server error | Log at `error`, fire alert |

## Verification

### API Integration Tests

1. **Happy path: view an existing webhook with all fields** — Create a webhook with HTTPS URL, secret, events `["push", "landing_request"]`, `is_active: true`. GET the webhook by ID. Assert 200, response contains `id` matching the created ID, `url` matches, `secret` is `"********"`, `events` matches, `is_active` is `true`, `last_delivery_at` is `null`, `created_at` and `updated_at` are valid ISO 8601 timestamps.

2. **Happy path: view a webhook with no secret** — Create a webhook without a secret (or `secret: ""`). GET the webhook by ID. Assert 200, `secret` field is `""` (empty string, not redacted).

3. **Happy path: view a webhook with empty events (wildcard)** — Create a webhook with `events: []`. GET by ID. Assert 200, `events` is `[]`.

4. **Happy path: view a webhook with all event types** — Create a webhook with all 9 event types (`push`, `create`, `delete`, `landing_request`, `issues`, `issue_comment`, `status`, `workflow_run`, `release`). GET by ID. Assert 200, `events` contains exactly all 9 event types.

5. **Happy path: view a webhook in inactive state** — Create a webhook with `is_active: false`. GET by ID. Assert 200, `is_active` is `false`.

6. **Happy path: view a webhook after a delivery has been made** — Create a webhook, trigger a test delivery, wait briefly for the worker to process. GET the webhook by ID. Assert `last_delivery_at` is a non-null ISO timestamp.

7. **Secret redaction: secret never returned in plaintext** — Create a webhook with `secret: "super-secret-value"`. GET the webhook by ID. Assert the response `secret` field is exactly `"********"` and does not contain `"super-secret-value"`.

8. **Response format: all fields use snake_case** — GET a webhook and assert the response contains `repository_id`, `is_active`, `last_delivery_at`, `created_at`, `updated_at` (not camelCase variants).

9. **Response format: timestamps are ISO 8601** — GET a webhook and parse `created_at` and `updated_at` as ISO dates. Assert they are valid and recent.

10. **Error: non-numeric webhook ID** — GET `/api/repos/:owner/:repo/hooks/abc`. Assert 400 with message `"invalid webhook id"`.

11. **Error: zero webhook ID** — GET `/api/repos/:owner/:repo/hooks/0`. Assert 400 with message `"invalid webhook id"`.

12. **Error: negative webhook ID** — GET `/api/repos/:owner/:repo/hooks/-1`. Assert 400 with message `"invalid webhook id"`.

13. **Error: floating-point webhook ID** — GET `/api/repos/:owner/:repo/hooks/4.5`. Assert 400 (parsed as NaN by `parseInt` with remaining `.5`).

14. **Error: very large webhook ID (non-existent)** — GET `/api/repos/:owner/:repo/hooks/999999999`. Assert 404 with message `"webhook not found"`.

15. **Error: webhook belonging to a different repository** — Create two repositories. Create a webhook on repo A. GET the webhook using repo B's path. Assert 404 with message `"webhook not found"`.

16. **Auth: reject unauthenticated request** — GET without any auth credentials. Assert 401 with message `"authentication required"`.

17. **Auth: reject non-admin collaborator with write permission** — Authenticate as a user with `write` permission. Assert 403 with message `"permission denied"`.

18. **Auth: reject read-only collaborator** — Authenticate as a user with `read` permission. Assert 403.

19. **Auth: accept repository owner** — Authenticate as the repository owner. Assert 200.

20. **Auth: accept org owner on org repository** — Authenticate as an org owner for an org-owned repo. Assert 200.

21. **Auth: accept team admin on org repository** — Authenticate as a team member with `admin` permission. Assert 200.

22. **Error: non-existent repository** — GET with a non-existent repo name. Assert 404 with message `"repository not found"`.

23. **Error: non-existent owner** — GET with a non-existent owner name. Assert 404 with message `"repository not found"`.

24. **Case insensitivity: owner lookup** — Create a repo as `Alice/MyRepo`. GET webhook using `alice/myrepo`. Assert 200 (case-insensitive lookup).

25. **Idempotency: multiple GETs return the same result** — GET the same webhook ID twice. Assert both responses are identical.

26. **View does not modify state** — GET a webhook, note `updated_at`. Wait 1 second. GET again. Assert `updated_at` has not changed.

27. **URL with maximum reasonable length** — Create a webhook with a 2048-character HTTPS URL. GET by ID. Assert 200 with the full URL returned exactly.

### CLI Integration Tests

28. **CLI happy path: view webhook by ID** — Create a webhook via CLI, capture its ID. Run `codeplane webhook view <id> --repo OWNER/REPO`. Assert exit code 0, JSON output contains `hook.id` matching the created ID, `hook.url` matching, `hook.secret` is `"********"`, and `deliveries` is an array.

29. **CLI: view returns both hook and deliveries** — Create a webhook, trigger an event dispatch. Run `codeplane webhook view <id>`. Assert the output has both `hook` and `deliveries` keys, and `deliveries` contains at least one entry.

30. **CLI: view non-existent webhook** — Run `codeplane webhook view 999999 --repo OWNER/REPO`. Assert non-zero exit code and error output containing "webhook not found" or "not found".

31. **CLI: view with invalid ID** — Run `codeplane webhook view abc --repo OWNER/REPO`. Assert non-zero exit code with a parsing or validation error.

32. **CLI: view without --repo in non-repo directory** — Run `codeplane webhook view 1` from a directory without jj/git context. Assert non-zero exit code with a repository resolution error.

33. **CLI: view requires authentication** — Run `codeplane webhook view <id> --repo OWNER/REPO` without authentication (empty token). Assert non-zero exit code.

34. **CLI: repo resolution from current directory** — From a directory with jj/git repo linked to Codeplane, run `codeplane webhook view <id>` without `--repo`. Assert exit code 0 and the webhook is retrieved from the correct repository.

### End-to-End (Playwright) UI Tests

35. **UI: navigate to webhook detail from list** — Navigate to `/:owner/:repo/settings/webhooks`. Click on a webhook in the list. Assert navigation to `/:owner/:repo/settings/webhooks/:id` and the detail page loads with the webhook URL visible.

36. **UI: webhook detail shows configuration summary** — On the detail page, assert visible elements: URL text, events badges/tags, active status badge, creation timestamp, and secret redacted indicator.

37. **UI: webhook detail shows delivery history section** — On the detail page, assert the "Recent Deliveries" section is visible. If deliveries exist, assert at least one row showing event type, status icon, and timestamp.

38. **UI: empty delivery state** — Create a fresh webhook (no deliveries). Navigate to its detail page. Assert an empty state message like "No deliveries yet" is displayed.

39. **UI: delivery row expansion** — On a webhook with deliveries, click a delivery row. Assert the expanded view shows the request payload (JSON), response body, response status code, attempts count, and delivery timestamp.

40. **UI: active/inactive badge** — Create an active webhook. Assert green "Active" badge. Create an inactive webhook. Assert red "Inactive" badge on its detail page.

41. **UI: auto-disabled webhook banner** — If possible, set up a webhook that has been auto-disabled (10 consecutive failures). Navigate to its detail page. Assert an alert banner is visible indicating auto-disable.

42. **UI: edit button navigates to edit form** — On the detail page, click "Edit". Assert navigation to the webhook edit form.

43. **UI: delete button removes webhook** — On the detail page, click "Delete". Confirm the dialog. Assert redirect to the webhooks list and the deleted webhook no longer appears.

44. **UI: test delivery button triggers ping** — On the detail page, click "Test delivery". Assert a success toast appears. Refresh or wait for the delivery list to update. Assert a new delivery with event type "ping" appears.

45. **UI: permission gate — non-admin sees error** — Log in as a non-admin collaborator. Navigate to `/:owner/:repo/settings/webhooks/:id`. Assert a permission error is displayed or the user is redirected.

46. **UI: breadcrumb navigation** — On the detail page, click the "Webhooks" breadcrumb. Assert navigation back to the webhook list.

47. **UI: delivery pagination** — On a webhook with >30 deliveries, navigate to the detail page. Assert only 30 deliveries are shown initially. Click "Load more" or scroll to trigger pagination. Assert additional deliveries load.

### Cross-Client Consistency Tests

48. **API-CLI roundtrip: create via API, view via CLI** — Create a webhook via direct API POST. View it via `codeplane webhook view <id>`. Assert the webhook details match across both interfaces.

49. **CLI-API roundtrip: create via CLI, view via API** — Create a webhook via CLI. View it via direct API GET. Assert the webhook detail matches.

50. **Multi-view consistency: API and CLI return same data** — View the same webhook via both API GET and CLI `webhook view`. Assert `hook.id`, `hook.url`, `hook.events`, `hook.is_active`, `hook.secret`, `hook.created_at`, and `hook.updated_at` are identical across both responses.

51. **View after update reflects changes** — Create a webhook, view it (note URL and events). Update the webhook's URL and events. View again. Assert the updated values are reflected.

52. **View after test delivery shows new delivery** — Create a webhook, view it (note delivery count). Trigger a test delivery. View again. Assert the delivery history now includes a `ping` delivery.
