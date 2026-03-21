# REPO_WEBHOOK_DELIVERIES_LIST

Specification for REPO_WEBHOOK_DELIVERIES_LIST.

## High-Level User POV

When you configure a webhook for your repository, you need confidence that it is working correctly. The webhook delivery history gives you exactly that. From your repository's webhook settings, you can view a chronological list of every delivery attempt Codeplane has made for a specific webhook — whether it succeeded, failed, or is still pending retry.

Each delivery in the list shows you the event that triggered it (such as a push, issue creation, or landing request activity), the current delivery status, the HTTP response code your server returned, the number of delivery attempts Codeplane has made, and when the delivery occurred. This lets you quickly identify patterns — for example, if your endpoint started returning 500 errors at a certain time, or if a particular event type is consistently failing.

The delivery history is available everywhere you manage webhooks: from the API for integration tooling, from the CLI for quick inspection during debugging, and from the `webhook view` command which shows both the webhook configuration and its recent deliveries side by side. This makes it straightforward to diagnose webhook connectivity issues, verify that your integration is receiving the events you expect, and confirm that payloads are being delivered after you've made configuration changes.

Deliveries are listed newest-first, so the most recent activity is always at the top. The list is paginated so that repositories with heavy webhook traffic can still browse their history efficiently. If a webhook has been auto-disabled after too many consecutive failures, the delivery history provides the evidence trail explaining why — you can see the sequence of failures that triggered the auto-disable.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user with admin access to a repository can list webhook deliveries for any webhook belonging to that repository.
- [ ] Deliveries are returned ordered by most recent first (descending by delivery ID).
- [ ] Each delivery record includes: delivery ID, webhook ID, event type, payload, status, HTTP response status code, response body, attempt count, delivered-at timestamp, next-retry-at timestamp, created-at timestamp, and updated-at timestamp.
- [ ] The list is paginated with a maximum page size of 30 deliveries per request.
- [ ] The CLI `webhook deliveries <id>` command returns the delivery list for a given webhook.
- [ ] The CLI `webhook view <id>` command includes recent deliveries alongside webhook configuration details.
- [ ] The API returns an empty array (not an error) when a webhook has zero deliveries.
- [ ] The API returns 400 for an invalid (non-numeric or ≤ 0) webhook ID.
- [ ] The API returns 404 when the webhook ID does not exist or does not belong to the specified repository.
- [ ] The API returns 401 when no authentication is provided.
- [ ] The API returns 403 when the authenticated user lacks admin access to the repository.
- [ ] The API correctly resolves repository ownership for both user-owned and organization-owned repositories (case-insensitive owner and repo name matching).
- [ ] The response body field for each delivery is capped at 10 KB of stored content.
- [ ] Deliveries in all three statuses (`pending`, `success`, `failed`) appear in the list.
- [ ] Pagination with `limit=0` or negative values defaults to a sensible page size (30).
- [ ] Pagination with `limit` exceeding 30 is clamped to 30.
- [ ] The `cursor` query parameter is accepted and correctly maps to page-based offset (cursor value divided by limit, ceiling to nearest page).
- [ ] An empty or omitted `cursor` defaults to the first page.
- [ ] A non-numeric `cursor` value does not crash the server; it defaults gracefully to page 1.

### Edge Cases

- [ ] Webhook exists but has never fired (zero deliveries) → returns `[]`.
- [ ] Webhook was auto-disabled after 10 consecutive failures → deliveries still list normally; the webhook's `is_active: false` state is separate from delivery history access.
- [ ] Delivery payload contains special characters, Unicode, or deeply nested JSON → returned faithfully.
- [ ] Delivery with `null` response status (never received a response, e.g., network timeout) → `response_status` is `null`, `response_body` is empty string.
- [ ] Delivery with `null` delivered-at (still pending first attempt) → `delivered_at` is `null`.
- [ ] Repository transferred to a new owner → deliveries remain accessible under the new owner path.
- [ ] Concurrent delivery creation during list request → pagination remains consistent (newest-first ordering by ID is stable).
- [ ] Webhook deleted after deliveries exist → delivery list endpoint returns 404 (webhook not found), not orphaned delivery data.

## Design

### API Shape

**Endpoint:** `GET /api/repos/{owner}/{repo}/hooks/{id}/deliveries`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner (username or organization name, case-insensitive) |
| `repo` | string | Repository name (case-insensitive) |
| `id` | integer | Webhook ID |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cursor` | string | `""` | Pagination cursor. Interpreted as an offset hint; divided by `limit` and ceiled to derive page number. |
| `limit` | integer | `30` | Maximum deliveries per page. Clamped to range [1, 30]. |

**Success Response:** `200 OK`

```json
[
  {
    "id": "42",
    "webhookId": "7",
    "eventType": "push",
    "payload": { "action": "pushed", "ref": "main" },
    "status": "success",
    "responseStatus": 200,
    "responseBody": "OK",
    "attempts": 1,
    "deliveredAt": "2026-03-22T10:15:30.000Z",
    "nextRetryAt": null,
    "createdAt": "2026-03-22T10:15:28.000Z",
    "updatedAt": "2026-03-22T10:15:30.000Z"
  }
]
```

**Error Responses:**

| Status | Condition |
|--------|----------|
| `400 Bad Request` | Invalid webhook ID (non-numeric or ≤ 0) |
| `401 Unauthorized` | No authentication provided |
| `403 Forbidden` | User lacks admin access to the repository |
| `404 Not Found` | Webhook not found or does not belong to the specified repository |

### SDK Shape

**Service method:** `WebhookService.listWebhookDeliveries(actor, owner, repo, webhookId, page, perPage)`

- `actor`: `AuthUser | undefined` — the authenticated user context
- `owner`: `string` — repository owner
- `repo`: `string` — repository name
- `webhookId`: `number` — webhook ID (must be > 0)
- `page`: `number` — 1-indexed page number
- `perPage`: `number` — page size (clamped to 1–30)
- **Returns:** `Promise<ListWebhookDeliveriesForRepoRow[]>`

The service method: (1) Validates webhookId > 0, (2) Resolves the repository by owner and name, (3) Requires admin access on the resolved repository, (4) Confirms the webhook belongs to this repository (404 if not), (5) Normalizes pagination parameters, (6) Queries deliveries ordered by ID descending with LIMIT/OFFSET.

**Return type fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique delivery ID |
| `webhookId` | string | Parent webhook ID |
| `eventType` | string | Event type (e.g., `push`, `issues`, `issue_comment`, `landing_request`) |
| `payload` | any (JSON) | Full event payload sent to the webhook URL |
| `status` | string | One of: `pending`, `success`, `failed` |
| `responseStatus` | number \| null | HTTP status code from the endpoint, or null |
| `responseBody` | string | Response body (truncated to 10 KB) |
| `attempts` | number | Number of delivery attempts |
| `deliveredAt` | Date \| null | Most recent delivery attempt timestamp |
| `nextRetryAt` | Date \| null | Scheduled retry time, or null |
| `createdAt` | Date | Record creation timestamp |
| `updatedAt` | Date | Record last-updated timestamp |

### CLI Command

**List deliveries:**

```
codeplane webhook deliveries <id> [--repo OWNER/REPO]
```

- `<id>` (required, positional): Webhook ID (coerced to number).
- `--repo` (optional): Repository in `OWNER/REPO` format. If omitted, resolved from the current working directory.
- Output: JSON array of delivery objects matching the API response shape.
- Exit code 0 on success; non-zero on auth failure, not-found, or bad request.

**View webhook with deliveries:**

```
codeplane webhook view <id> [--repo OWNER/REPO]
```

- Fetches webhook details and delivery history in parallel.
- Output: JSON object `{ hook: {...}, deliveries: [...] }`.

**Replay delivery (partial — not yet implemented server-side):**

```
codeplane webhook deliveries <id> --replay <delivery-id> [--repo OWNER/REPO]
```

- CLI sends POST to replay path. Will error until the replay route is implemented.

### Documentation

1. **API Reference — Webhooks page** (`docs/api-reference/webhooks.mdx`): Must include the `GET /api/repos/{owner}/{repo}/hooks/{id}/deliveries` endpoint in the endpoint table with description "List delivery history". Must document query parameters (`cursor`, `limit`), response shape, status codes, and a `curl` example.

2. **CLI Reference — webhook deliveries**: Must document the `webhook deliveries <id>` subcommand including arguments, options, example output, and expected error behavior.

3. **Webhook Guide — Delivery History section**: A section explaining how to use the delivery history to debug webhook failures; what the three delivery statuses mean; how the retry schedule works; how auto-disable works after 10 consecutive failures; and that the delivery list is newest-first with a maximum page size of 30.

## Permissions & Security

### Authorization Requirements

| Role | Access |
|------|--------|
| **Repository Owner** | ✅ Full access to list deliveries |
| **Repository Admin** (collaborator with admin permission) | ✅ Full access to list deliveries |
| **Organization Owner** (for org-owned repos) | ✅ Full access to list deliveries |
| **Team Member with Admin permission** | ✅ Full access to list deliveries |
| **Write Collaborator** | ❌ Denied (403 Forbidden) |
| **Read Collaborator** | ❌ Denied (403 Forbidden) |
| **Authenticated user with no repo access** | ❌ Denied (403 Forbidden) |
| **Unauthenticated** | ❌ Denied (401 Unauthorized) |

### Rate Limiting

- The deliveries list endpoint inherits the server's global rate limiting middleware.
- No additional per-endpoint rate limit is required beyond the global rate limiter, since this is a read-only paginated endpoint with small response payloads.
- If abuse is detected (e.g., automated scraping of delivery payloads), the global rate limiter will throttle the caller.

### Data Privacy Constraints

- **Webhook secrets are never exposed** in delivery records. The delivery payload contains the event data sent *to* the webhook URL, not the signing secret.
- **Response bodies may contain sensitive data** from the external endpoint. The 10 KB cap limits exposure, but admins should be aware that response bodies are stored and returned as-is.
- **Event payloads may contain repository content** (e.g., commit messages, issue bodies, user identifiers). Access is gated by admin permission, which is appropriate since webhook configuration itself requires admin access.
- **No PII leakage across repositories**: the query enforces that the webhook belongs to the specified repository via a JOIN, preventing cross-repo delivery enumeration even if delivery IDs are guessable.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WebhookDeliveriesListed` | User successfully lists deliveries for a webhook | `repository_id`, `webhook_id`, `actor_id`, `delivery_count` (number returned), `page`, `limit`, `client` (api / cli / web / tui) |

### Funnel Metrics

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| **Delivery list adoption** | Percentage of webhooks that have had their delivery history viewed at least once in the past 30 days | > 40% of active webhooks |
| **Debugging funnel** | Sequence: webhook created → delivery failure occurs → delivery history viewed → webhook updated | > 50% of users who experience a failed delivery view the delivery history within 24 hours |
| **CLI vs API usage** | Ratio of delivery list requests originating from CLI vs direct API | Tracked for UX prioritization; no target threshold |
| **Pagination depth** | Average number of pages fetched per delivery list session | If > 3, consider increasing default page size or adding filtering |

### Properties on Every Event

- `timestamp` (ISO 8601)
- `actor_id` (user ID)
- `repository_id`
- `repository_owner`
- `repository_name`
- `webhook_id`
- `client_type` (`api` | `cli` | `web` | `tui`)

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Description |
|-----------|-------|--------------------|-------------|
| Delivery list request received | `info` | `webhook_id`, `owner`, `repo`, `page`, `limit`, `actor_id` | Emitted when the route handler begins processing |
| Delivery list returned successfully | `info` | `webhook_id`, `delivery_count`, `page`, `duration_ms` | Emitted on successful response |
| Webhook not found during delivery list | `warn` | `webhook_id`, `owner`, `repo`, `actor_id` | The specified webhook does not exist or doesn't belong to this repo |
| Authorization denied for delivery list | `warn` | `webhook_id`, `owner`, `repo`, `actor_id`, `reason` | User lacks required admin permission |
| Invalid webhook ID in delivery list request | `warn` | `raw_id`, `owner`, `repo` | Non-numeric or negative webhook ID |
| Database error during delivery list | `error` | `webhook_id`, `owner`, `repo`, `error_message`, `stack` | Unexpected database failure |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_webhook_deliveries_list_total` | Counter | `status` (success, error, unauthorized, forbidden, not_found, bad_request) | Total delivery list requests |
| `codeplane_webhook_deliveries_list_duration_seconds` | Histogram | `status` | Latency of delivery list requests |
| `codeplane_webhook_deliveries_list_count` | Histogram | — | Number of deliveries returned per request |

### Alerts

#### Alert: `WebhookDeliveriesListHighErrorRate`

- **Condition:** `rate(codeplane_webhook_deliveries_list_total{status="error"}[5m]) / rate(codeplane_webhook_deliveries_list_total[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check the server logs for `error`-level entries with context `webhook_deliveries_list`.
  2. Identify the error message — most likely a database connectivity issue or query timeout.
  3. Verify the database is healthy: check connection pool metrics, query latency, and disk I/O.
  4. If the `webhook_deliveries` table has grown very large, check if the `ORDER BY id DESC LIMIT/OFFSET` query plan is degraded — verify the index on `(webhook_id, id DESC)` exists.
  5. If a specific webhook ID is causing all errors, check if its delivery count is abnormally large and consider archiving old deliveries.
  6. Escalate to the database team if connection pool exhaustion or replication lag is the root cause.

#### Alert: `WebhookDeliveriesListHighLatency`

- **Condition:** `histogram_quantile(0.95, rate(codeplane_webhook_deliveries_list_duration_seconds_bucket[5m])) > 2`
- **Severity:** Warning
- **Runbook:**
  1. Check the p95 and p99 latency trend on the Grafana dashboard.
  2. Look at the `EXPLAIN ANALYZE` output for the `listWebhookDeliveriesForRepo` query against the production database.
  3. Check if a specific repository or webhook has an unusually large number of deliveries causing slow OFFSET-based pagination at high page numbers.
  4. Verify database connection pool health — elevated latency often correlates with pool saturation.
  5. If the issue is OFFSET-based pagination at large depths, consider introducing keyset pagination (WHERE id < cursor) as a performance improvement.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | HTTP Status |
|------------|-------------------|-------------|
| Invalid webhook ID (non-numeric) | Return `{"error": "invalid webhook id"}` | 400 |
| Webhook ID ≤ 0 | Return `{"error": "invalid webhook id"}` | 400 |
| No auth token/session | Return `{"error": "authentication required"}` | 401 |
| User lacks admin access | Return `{"error": "forbidden"}` | 403 |
| Webhook not found or wrong repo | Return `{"error": "webhook not found"}` | 404 |
| Repository not found | Return `{"error": "repository not found"}` | 404 |
| Database connection failure | Return `{"error": "internal server error"}` | 500 |
| Malformed cursor parameter | Gracefully default to page 1 | 200 |
| Limit parameter = 0 or negative | Clamp to default of 30 | 200 |

## Verification

### API Integration Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `GET deliveries returns empty array for webhook with no deliveries` | Create a webhook, immediately list deliveries, assert response is `[]` with status 200. |
| 2 | `GET deliveries returns deliveries after event dispatch` | Create a webhook subscribed to `issues` events, create an issue, list deliveries, assert at least one delivery with `eventType: "issues"`. |
| 3 | `GET deliveries returns deliveries in newest-first order` | Trigger multiple events, list deliveries, assert the first delivery in the array has the highest ID and most recent `createdAt`. |
| 4 | `GET deliveries returns all expected fields` | Trigger a delivery, list it, assert every field is present: `id`, `webhookId`, `eventType`, `payload`, `status`, `responseStatus`, `responseBody`, `attempts`, `deliveredAt`, `nextRetryAt`, `createdAt`, `updatedAt`. |
| 5 | `GET deliveries with limit=1 returns exactly one delivery` | Trigger two events, list with `limit=1`, assert array length is 1. |
| 6 | `GET deliveries with limit=30 is the maximum page size` | Assert that `limit=30` is accepted and `limit=50` is clamped to 30 results maximum. |
| 7 | `GET deliveries with limit exceeding 30 is clamped` | List with `limit=100`, trigger >30 deliveries, assert no more than 30 returned. |
| 8 | `GET deliveries with cursor paginates correctly` | Trigger 35 deliveries. Fetch page 1 (cursor empty, limit=30), assert 30 results. Fetch page 2 (cursor=30, limit=30), assert remaining 5 results. Assert no overlap between pages. |
| 9 | `GET deliveries with empty cursor defaults to first page` | List with `cursor=""`, assert results start from the newest delivery. |
| 10 | `GET deliveries with non-numeric cursor defaults to page 1` | List with `cursor=abc`, assert 200 response with first page of results. |
| 11 | `GET deliveries with limit=0 uses default page size` | List with `limit=0`, assert response is 200 and returns results. |
| 12 | `GET deliveries with negative limit uses default page size` | List with `limit=-5`, assert 200 response. |
| 13 | `GET deliveries returns 400 for non-numeric webhook ID` | `GET /api/repos/owner/repo/hooks/abc/deliveries`, assert 400. |
| 14 | `GET deliveries returns 400 for webhook ID ≤ 0` | `GET /api/repos/owner/repo/hooks/0/deliveries`, assert 400. |
| 15 | `GET deliveries returns 401 without authentication` | Request without auth token, assert 401. |
| 16 | `GET deliveries returns 403 for non-admin user` | Create a second user with read-only access, request deliveries, assert 403. |
| 17 | `GET deliveries returns 404 for non-existent webhook ID` | Request deliveries for webhook ID 999999, assert 404. |
| 18 | `GET deliveries returns 404 for webhook belonging to different repo` | Create webhook on repo A, request deliveries for it using repo B's path, assert 404. |
| 19 | `GET deliveries returns 404 for non-existent repository` | Request deliveries for `nonexistent/repo`, assert 404. |
| 20 | `GET deliveries works for org-owned repositories` | Create org repo, create webhook, trigger event, list deliveries, assert 200 with deliveries. |
| 21 | `GET deliveries with case-insensitive owner/repo` | Create webhook on `Alice/MyRepo`, request as `alice/myrepo`, assert 200. |
| 22 | `GET deliveries includes pending, success, and failed statuses` | Trigger deliveries that result in different statuses, list all, assert all three statuses appear. |
| 23 | `GET deliveries payload field preserves JSON structure` | Trigger an event with a known payload shape, list deliveries, assert `payload` field matches expected JSON structure. |
| 24 | `GET deliveries responseStatus is null for undelivered pending delivery` | Create a delivery that hasn't been attempted yet, assert `responseStatus` is null. |
| 25 | `GET deliveries after webhook deletion returns 404` | Create webhook, trigger event, delete webhook, list deliveries for deleted webhook ID, assert 404. |

### CLI E2E Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 26 | `codeplane webhook deliveries <id> returns delivery list` | Create webhook, trigger event, run `webhook deliveries <id>`, assert JSON output contains delivery array. |
| 27 | `codeplane webhook deliveries <id> requires authentication` | Run `webhook deliveries <id>` with empty token, assert non-zero exit code. |
| 28 | `codeplane webhook deliveries <id> with --repo flag` | Run with explicit `--repo OWNER/REPO`, assert delivery list returned correctly. |
| 29 | `codeplane webhook view <id> includes deliveries` | Run `webhook view <id>`, parse JSON output, assert `hook` and `deliveries` keys exist. |
| 30 | `codeplane webhook view <id> fetches hook and deliveries in parallel` | Run `webhook view <id>`, assert both `hook.id` matches and `deliveries` is an array. |
| 31 | `codeplane webhook deliveries for non-existent webhook returns error` | Run `webhook deliveries 999999`, assert non-zero exit code and error message. |
| 32 | `codeplane webhook deliveries output contains event_type field` | Trigger `issues` event, list deliveries via CLI, assert at least one delivery has `event_type: "issues"`. |

### Playwright (Web UI) E2E Tests

> **Note:** Web UI tests are documented for completeness but the web UI webhook management surface is not yet implemented. These tests should be added when the web UI ships.

| # | Test Name | Description |
|---|-----------|-------------|
| 33 | `Webhook settings page shows delivery history section` | Navigate to repo → settings → webhooks → specific webhook, assert delivery history section is visible. |
| 34 | `Delivery list displays status badges` | Assert each delivery shows a visual status indicator (success/pending/failed). |
| 35 | `Delivery list shows event type for each entry` | Assert event type column/label is present and not empty. |
| 36 | `Delivery list paginates when >30 deliveries exist` | Assert pagination controls appear when delivery count exceeds 30. |
| 37 | `Empty delivery list shows informative empty state` | Navigate to a webhook with no deliveries, assert an empty state message is shown. |

### Load and Boundary Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 38 | `Listing deliveries for webhook with 1000+ deliveries performs within 2 seconds` | Seed 1000 deliveries, request first page, assert response time < 2000ms. |
| 39 | `Pagination at deep offset (page 100) still returns correct results` | Seed sufficient deliveries, request with high cursor value, assert valid results returned. |
| 40 | `Maximum valid limit (30) returns exactly 30 when 30+ deliveries exist` | Seed 50 deliveries, request with `limit=30`, assert exactly 30 returned. |
| 41 | `Limit of 31 (one over maximum) is clamped to 30` | Request with `limit=31`, assert no more than 30 results returned. |
