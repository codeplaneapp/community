# REPO_WEBHOOK_TEST_DELIVERY

Specification for REPO_WEBHOOK_TEST_DELIVERY.

## High-Level User POV

When a repository administrator has configured a webhook to send event notifications to an external service, one of the most critical moments in the setup lifecycle is verifying that the integration actually works. The test delivery feature gives administrators a direct, immediate way to confirm that their webhook is correctly configured and that the receiving endpoint is reachable, properly authenticated, and responding as expected — without having to trigger a real repository event.

The administrator navigates to a webhook's detail view (or uses the CLI or API) and triggers a test delivery. Codeplane creates a special "ping" event and sends it to the webhook's configured URL using the exact same mechanism as any real event delivery: the payload is signed with the webhook's HMAC-SHA256 secret (if configured), the standard Codeplane delivery headers are attached, and the HTTP POST is made to the destination URL. The administrator can then immediately check the delivery history to see whether the test delivery succeeded (a 2xx response from the remote), failed (a non-2xx or a network error), or is still pending processing.

This feature is the primary debugging and validation tool for webhook integrations. It allows administrators to verify a webhook immediately after creation, after updating the URL or secret, or when investigating why an external service seems to have stopped receiving events. Because the test delivery flows through the same background delivery pipeline as real event deliveries — including retry logic, response capture, and HMAC signing — it exercises the full delivery path end-to-end. The administrator can inspect the response status code and truncated response body in the delivery history, giving them the diagnostic information they need without leaving Codeplane.

The test delivery is available through the Web UI (as a "Test delivery" button on the webhook detail page), through the CLI via `codeplane webhook test <id>`, and through the HTTP API via `POST /api/repos/:owner/:repo/hooks/:id/tests`. All three surfaces enforce the same access controls: only repository administrators can trigger test deliveries.

## Acceptance Criteria

- A repository administrator can trigger a test delivery for any active or inactive webhook belonging to a repository they have admin access to.
- Triggering a test delivery creates a new delivery record with `event_type: "ping"` and `payload: {"event":"ping"}` in the `pending` status.
- The test delivery is processed asynchronously by the background webhook worker, not synchronously in the API request.
- The API returns HTTP 204 (No Content) immediately upon successfully creating the pending delivery record, without waiting for the actual HTTP delivery to complete.
- The delivery is sent as an HTTP POST to the webhook's configured URL with the standard Codeplane delivery headers: `Content-Type: application/json`, `User-Agent: Codeplane-Hookshot/1.0`, `X-Codeplane-Event: ping`, `X-Codeplane-Delivery: <delivery_id>`, and `X-Codeplane-Signature-256: <hmac>` (if a secret is configured).
- The webhook's HMAC-SHA256 secret (if configured) is used to sign the ping payload identically to how real event payloads are signed.
- The delivery follows the standard retry schedule on failure: attempts at 1 minute, 5 minutes, 30 minutes, and 2 hours (maximum 5 total attempts).
- The delivery result (response status code, response body truncated to 10 KB, number of attempts, delivered timestamp) is recorded in the delivery history and visible through the delivery list endpoint, the CLI `webhook view` and `webhook deliveries` commands, and the Web UI delivery history section.
- The webhook ID must be a valid positive integer. Providing a non-numeric, zero, or negative ID returns HTTP 400 with message `"invalid webhook id"`.
- If the webhook ID does not correspond to any webhook in the specified repository, the server returns HTTP 404 with message `"webhook not found"`.
- If the repository does not exist, the server returns HTTP 404 with message `"repository not found"`.
- If the owner does not exist, the server returns HTTP 404 with message `"repository not found"`.
- Unauthenticated requests are rejected with HTTP 401 and message `"authentication required"`.
- Authenticated users who are not repository administrators are rejected with HTTP 403 and message `"permission denied"`.
- Triggering a test delivery on an inactive (disabled) webhook still creates the delivery record. The worker will mark it as failed with response body `"webhook disabled"` without making an HTTP request.
- Multiple test deliveries can be triggered in rapid succession. Each creates a separate delivery record.
- The test delivery does not alter the webhook's `updated_at` timestamp or any other webhook configuration field.
- The test delivery does update the webhook's `last_delivery_at` timestamp once the delivery is processed by the worker (regardless of success or failure).
- If the database fails to create the delivery record, the server returns HTTP 500 with message `"failed to create ping delivery"`.
- The ping payload `{"event":"ping"}` is fixed and cannot be customized by the caller.
- The feature works identically through the API, CLI, and Web UI.
- The CLI command `codeplane webhook test <id>` accepts an optional `--repo OWNER/REPO` flag, falling back to repository auto-detection from the current directory's jj/git context.
- The Web UI "Test delivery" button on the webhook detail page shows a success toast notification on successful trigger and the new ping delivery appears in the delivery history when the section is refreshed or re-fetched.
- Maximum webhook URL length for delivery is the same as configured at webhook creation time (up to 2048 characters).
- The test delivery endpoint has no request body. Any request body is ignored.

### Definition of Done

- The `POST /api/repos/:owner/:repo/hooks/:id/tests` endpoint creates a pending ping delivery and returns 204.
- The webhook worker picks up and delivers the ping payload with correct headers and HMAC signature.
- The delivery result appears in the delivery history accessible via API, CLI, and Web UI.
- The CLI `webhook test` command is implemented and documented.
- The Web UI "Test delivery" button is wired to the endpoint and shows user feedback.
- All acceptance criteria above are covered by automated integration and E2E tests.
- API reference, CLI reference, and user guide documentation are updated.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/hooks/:id/tests`

**Authentication:** Required. Session cookie, PAT (`Authorization: token <pat>`), or OAuth2 bearer token.

**Request Headers:**
- `Authorization: token <pat>` or session cookie (required)
- No `Content-Type` required (no request body)

**Path Parameters:**

| Parameter | Type | Required | Constraints |
|-----------|------|----------|-------------|
| `owner` | string | Yes | Username or organization name. Case-insensitive lookup. |
| `repo` | string | Yes | Repository name. Case-insensitive lookup. |
| `id` | integer | Yes | Webhook numeric ID. Must be a positive integer. |

**Request Body:** None. Any body content is ignored.

**Success Response:** `204 No Content`

No response body. The 204 status confirms that a pending ping delivery has been created and will be processed asynchronously by the webhook worker.

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Non-numeric, zero, or negative webhook ID | `{ "message": "invalid webhook id" }` |
| 401 | No authentication provided | `{ "message": "authentication required" }` |
| 403 | Authenticated user is not a repository admin | `{ "message": "permission denied" }` |
| 404 | Repository not found (invalid owner or repo) | `{ "message": "repository not found" }` |
| 404 | Webhook ID not found in the specified repository | `{ "message": "webhook not found" }` |
| 500 | Database failed to create the delivery record | `{ "message": "failed to create ping delivery" }` |

**Delivery Record Created:**

The endpoint creates a single delivery record with:
- `webhook_id`: The target webhook's ID
- `event_type`: `"ping"`
- `payload`: `{"event":"ping"}` (JSON string)
- `status`: `"pending"`
- `response_status`: `null` (populated after delivery attempt)
- `response_body`: `""` (populated after delivery attempt)
- `attempts`: `0` (incremented by the worker on each attempt)
- `delivered_at`: `null` (populated after delivery attempt)
- `next_retry_at`: `null` (populated if retry is scheduled)

**Delivery Headers (sent by worker):**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `User-Agent` | `Codeplane-Hookshot/1.0` |
| `X-Codeplane-Event` | `ping` |
| `X-Codeplane-Delivery` | `<delivery_id>` |
| `X-Codeplane-Signature-256` | `sha256=<hex>` (only if webhook has a secret) |

### SDK Shape

The `WebhookService.testWebhook` method in `@codeplane/sdk` is the authoritative domain entry point:

```typescript
testWebhook(
  actor: AuthUser | undefined,
  owner: string,
  repo: string,
  webhookId: number
): Promise<void>
```

The method:
1. Validates the actor is authenticated. If not, throws `unauthorized("authentication required")`.
2. Validates the `webhookId` is a positive integer. If not, throws `badRequest("invalid webhook id")`.
3. Resolves the repository by owner (case-insensitive) and lower-cased repository name. If not found, throws `notFound("repository not found")`.
4. Verifies the actor has admin permission on the repository via `requireAdminAccess`. If not admin, throws `forbidden("permission denied")`.
5. Fetches the webhook by ID, scoped to the resolved repository via the owner/repo pair. If not found, throws `notFound("webhook not found")`.
6. Creates a delivery record with `eventType: "ping"`, `payload: '{"event":"ping"}'`, `status: "pending"`. If creation fails, throws `internal("failed to create ping delivery")`.
7. Returns void (delivery is processed asynchronously).

### CLI Command

```
codeplane webhook test <id> [options]
```

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | number | Yes | Webhook ID to test |

**Options:**

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--repo` | string | No | auto-detect | Repository in `OWNER/REPO` format |

**Behavior:**

The `test` command makes a single API request: `POST /api/repos/:owner/:repo/hooks/:id/tests`.

On success (204), outputs:
```json
{ "status": "ok", "message": "Test delivery queued for webhook <id>" }
```

On error, prints the error message and exits with a non-zero exit code.

**Example:**
```bash
codeplane webhook test 42 --repo alice/my-project
codeplane webhook deliveries 42 --repo alice/my-project
```

### Web UI Design

**Location:** The "Test delivery" action is on the webhook detail page at `/:owner/:repo/settings/webhooks/:id`.

**Test Delivery Button:**

1. **Placement:** In the action buttons section alongside "Edit" and "Delete".
2. **Label:** "Test delivery" with an optional send/ping icon.
3. **State management:**
   - Default: enabled, clickable.
   - While POST in flight: disabled with spinner and label "Sending…".
   - On success: re-enabled. Toast notification: "Test delivery queued. Check the delivery history below for results." Delivery history auto-refreshes after 2-second delay.
   - On error: re-enabled. Error toast with the error message.
4. **No confirmation dialog:** Test delivery is non-destructive and idempotent.
5. **Button disabled during in-flight request** to prevent double-clicks.

**Inactive Webhook Behavior:**

If the webhook is inactive, the button remains enabled with a note: "Note: This webhook is currently inactive. The test delivery will be created but the worker will mark it as failed without attempting HTTP delivery."

### Documentation

1. **API Reference — Webhooks > Test a Webhook**: Document `POST /api/repos/{owner}/{repo}/hooks/{id}/tests` with path parameters, 204 response, all error codes, and `curl` example.

2. **CLI Reference — `codeplane webhook test`**: Document `<id>` argument, `--repo` flag, output format, and examples including follow-up delivery check.

3. **User Guide — Managing Webhooks > Testing a Webhook**: Explain when to use test deliveries, the ping event payload, how to interpret delivery results, HMAC verification for ping events, and behavior with inactive webhooks.

## Permissions & Security

### Authorization Roles

| Role | Can Trigger Test Delivery? |
|------|---------------------------|
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

- The global API rate limiter applies to test delivery requests.
- Test delivery is a write operation that creates a database record and triggers an asynchronous HTTP call to an external service. It should be subject to a per-webhook rate limit of **5 test deliveries per minute per webhook** to prevent abuse.
- The per-webhook rate limit should return HTTP 429 with a `Retry-After` header indicating when the next test delivery can be triggered.
- Failed attempts (4xx errors) still count toward the rate limit to prevent enumeration attacks.

### Data Privacy and Security

- **No new PII exposure:** The test delivery creates a fixed payload `{"event":"ping"}` that contains no user-specific or repository-specific data.
- **Secret handling:** The webhook's HMAC secret is decrypted server-side by the webhook worker to sign the delivery. It is never exposed to the caller or included in any response.
- **URL sensitivity:** The test delivery sends an HTTP request to the webhook's configured URL, which may contain authentication tokens. The URL is never logged in full — only the domain portion should appear in structured logs.
- **Abuse vector:** An attacker with admin access could use test deliveries to send traffic to an arbitrary HTTPS URL. The per-webhook rate limit mitigates this. HTTPS-only enforcement ensures traffic is encrypted.
- **No PII leakage in error messages:** Error responses (401, 403, 404) do not reveal whether a webhook exists if the user lacks permission — 403 is returned before webhook existence is checked.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WebhookTestDeliverySent` | Test delivery successfully queued (204 returned) | `webhook_id`, `repository_id`, `owner`, `repo`, `webhook_is_active` (boolean), `source` (`api` \| `cli` \| `web`), `actor_id` |
| `WebhookTestDeliveryFailed` | Test delivery request rejected (non-204) | `webhook_id` (if parseable), `repository_id` (if resolved), `owner`, `repo`, `failure_reason` (`auth`, `permission`, `not_found`, `invalid_id`, `internal`), `source`, `actor_id` (if authenticated) |
| `WebhookTestDeliveryCompleted` | Worker finishes processing a ping delivery | `webhook_id`, `delivery_id`, `repository_id`, `status` (`success` \| `failed`), `response_status_code`, `attempts`, `duration_ms` (time from creation to final status) |

### Funnel Metrics

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| **Test delivery usage rate** | % of webhooks that have at least one `WebhookTestDeliverySent` event within 10 minutes of creation | High rate (>50%) indicates the test delivery feature is discoverable and part of the setup workflow |
| **Test delivery success rate** | % of `WebhookTestDeliveryCompleted` with `status: "success"` | >80% indicates webhooks are generally well-configured; <50% may indicate documentation gaps |
| **Test-to-fix conversion** | % of failed test deliveries followed by a `WebhookUpdated` event within 30 minutes | Indicates users use test delivery as a debugging tool and successfully resolve issues |
| **Repeat test rate** | Average number of test deliveries per webhook per session (within 30 minutes) | 1-2 is healthy; >5 suggests users are struggling to get the integration working |
| **Source distribution** | Breakdown of `source` property across `WebhookTestDeliverySent` events | Informs which client surfaces are most used for webhook validation |

## Observability

### Structured Logging

| Log Point | Level | Context Fields | Description |
|-----------|-------|---------------|-------------|
| Test delivery initiated | `info` | `actor_id`, `owner`, `repo`, `webhook_id` | Logged when the route handler is entered |
| Test delivery permission denied | `warn` | `actor_id`, `owner`, `repo`, `webhook_id` | Logged when a non-admin attempts to trigger |
| Test delivery webhook not found | `info` | `actor_id`, `owner`, `repo`, `webhook_id` | Logged when the webhook ID does not exist |
| Test delivery repository not found | `info` | `actor_id`, `owner`, `repo` | Logged when the owner/repo pair does not resolve |
| Test delivery invalid ID | `info` | `actor_id`, `owner`, `repo`, `raw_id` | Logged when a non-numeric or invalid ID is provided |
| Test delivery record created | `info` | `actor_id`, `owner`, `repo`, `webhook_id`, `delivery_id` | Logged on successful delivery record creation |
| Test delivery record creation failed | `error` | `actor_id`, `owner`, `repo`, `webhook_id` | Logged when the database insert fails |
| Worker: ping delivery attempted | `info` | `delivery_id`, `webhook_id`, `url_domain`, `response_status` | Logged by the worker after attempting HTTP delivery |
| Worker: ping delivery succeeded | `info` | `delivery_id`, `webhook_id`, `response_status`, `attempt_number` | Logged on successful delivery (2xx) |
| Worker: ping delivery failed | `warn` | `delivery_id`, `webhook_id`, `response_status`, `attempt_number`, `will_retry` | Logged on failed delivery |
| Worker: ping delivery — terminal failure | `warn` | `delivery_id`, `webhook_id`, `total_attempts` | Logged when all retry attempts exhausted |

**Critical rule:** Never log the webhook URL in full (may contain auth tokens). Log only the domain. Never log the decrypted secret.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_webhook_test_deliveries_total` | Counter | `status` (`success`, `not_found`, `permission_denied`, `auth_error`, `invalid_id`, `internal_error`), `source` (`api`, `cli`, `web`) | Total test delivery trigger attempts |
| `codeplane_webhook_test_delivery_duration_seconds` | Histogram | `status` | Latency of the test delivery trigger operation (request to 204, not async delivery) |
| `codeplane_webhook_ping_deliveries_completed_total` | Counter | `result` (`success`, `failed`, `disabled`), `webhook_id` | Total ping deliveries processed by worker |
| `codeplane_webhook_ping_delivery_latency_seconds` | Histogram | `result` | Time from delivery creation to final status |
| `codeplane_webhook_ping_delivery_attempts` | Histogram | — | Distribution of attempt counts for ping deliveries |

### Alerts

#### Alert: `WebhookTestDeliveryErrorRateHigh`
**Condition:** `rate(codeplane_webhook_test_deliveries_total{status="internal_error"}[5m]) > 0.1`
**Severity:** Critical
**Runbook:**
1. Check server logs for `error`-level messages containing "failed to create ping delivery" with the affected `webhook_id` and `owner/repo`.
2. If database insert errors dominate: check database connectivity via `pg_stat_activity`. Verify the `webhook_deliveries` table is accessible and not full. Check disk space.
3. Check for recent deployments that may have altered the `webhook_deliveries` schema.
4. Verify the service registry is initializing `WebhookService` with the correct `Sql` instance.
5. If isolated to specific webhooks, check for corrupted data.

#### Alert: `WebhookPingDeliverySuccessRateLow`
**Condition:** `rate(codeplane_webhook_ping_deliveries_completed_total{result="failed"}[1h]) / rate(codeplane_webhook_ping_deliveries_completed_total[1h]) > 0.5`
**Severity:** Warning
**Runbook:**
1. More than 50% of ping deliveries failing. Check worker logs for common failure response status codes.
2. If most failures show `response_status: 0` (network errors): check outbound network connectivity, DNS resolution, firewall/proxy blocking.
3. If most failures show non-2xx codes: likely user misconfiguration, not a system issue. Check for URL patterns.
4. If failures show "webhook disabled": expected behavior for inactive webhooks.
5. Verify worker is running. Check worker logs for poll errors.

#### Alert: `WebhookPingDeliveryLatencyHigh`
**Condition:** `histogram_quantile(0.95, rate(codeplane_webhook_ping_delivery_latency_seconds_bucket[15m])) > 300`
**Severity:** Warning
**Runbook:**
1. p95 above 5 minutes means deliveries sitting in queue too long.
2. Check webhook worker poll interval and verify worker is running.
3. Check `claimDueWebhookDeliveries` query performance.
4. Check if queue is backed up with real event deliveries.
5. Check outbound HTTP connection latency (10-second timeout per attempt).
6. Consider increasing `claimLimit` or running multiple workers.

### Error Cases and Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Internal Action |
|-------------|-------------|---------------------|------------------|
| Non-numeric webhook ID | 400 | "invalid webhook id" | Log at `info` level |
| Zero or negative webhook ID | 400 | "invalid webhook id" | Log at `info` level |
| Unauthenticated request | 401 | "authentication required" | Log at `warn` level |
| Non-admin user | 403 | "permission denied" | Log at `warn` level |
| Repository not found | 404 | "repository not found" | Log at `info` level |
| Webhook not found | 404 | "webhook not found" | Log at `info` level |
| Delivery record creation failed | 500 | "failed to create ping delivery" | Log at `error`, fire alert |
| Database connection failure | 500 | Internal server error | Log at `error`, fire alert |
| Worker: network error | — | (visible in delivery history) | Log at `warn`, schedule retry |
| Worker: non-2xx response | — | (visible in delivery history) | Log at `warn`, schedule retry |
| Worker: secret decryption failure | — | (delivery marked failed, no retry) | Log at `error` |
| Worker: webhook disabled | — | (delivery marked failed, "webhook disabled") | Log at `info`, no retry |
| Worker: all retries exhausted | — | (delivery marked as final failed) | Log at `warn`, auto-disable check |

## Verification

### API Integration Tests

1. **Happy path: trigger test delivery for an active webhook** — Create a webhook with a valid HTTPS URL, `is_active: true`, and a secret. POST to `/api/repos/:owner/:repo/hooks/:id/tests`. Assert HTTP 204 with empty body. Query the delivery list endpoint. Assert at least one delivery with `event_type: "ping"` and `status: "pending"` (or `"success"`/`"failed"` if worker processed).

2. **Happy path: trigger test delivery for a webhook without a secret** — Create a webhook with no secret. POST to the test endpoint. Assert 204. Verify delivery record created with `event_type: "ping"`.

3. **Happy path: trigger test delivery for an inactive webhook** — Create a webhook, set `is_active: false`. POST to test endpoint. Assert 204. Delivery record created (worker marks as failed without HTTP delivery).

4. **Happy path: multiple test deliveries create separate records** — POST to test endpoint three times. Assert 204 each time. Query delivery list. Assert at least three deliveries with `event_type: "ping"`, each with distinct delivery ID.

5. **Happy path: test delivery for org-owned repository** — Create org-owned repo with webhook. Authenticate as org owner. POST to test endpoint. Assert 204.

6. **Happy path: test delivery as team admin** — Authenticate as team member with `admin` permission. POST to test endpoint. Assert 204.

7. **Delivery payload correctness** — Trigger test delivery. Fetch delivery from list endpoint. Assert `event_type` is `"ping"` and `payload` is `{"event":"ping"}`.

8. **Delivery status lifecycle** — Trigger test delivery. Immediately check status — assert `"pending"`. Wait for worker (poll with timeout). Assert status transitions to `"success"` or `"failed"` with non-null `response_status`.

9. **Error: non-numeric webhook ID** — POST to `/api/repos/:owner/:repo/hooks/abc/tests`. Assert 400, message `"invalid webhook id"`.

10. **Error: zero webhook ID** — POST to `/api/repos/:owner/:repo/hooks/0/tests`. Assert 400, message `"invalid webhook id"`.

11. **Error: negative webhook ID** — POST to `/api/repos/:owner/:repo/hooks/-1/tests`. Assert 400, message `"invalid webhook id"`.

12. **Error: floating-point webhook ID** — POST to `/api/repos/:owner/:repo/hooks/4.5/tests`. Assert 400, message `"invalid webhook id"`.

13. **Error: very large non-existent webhook ID** — POST to `/api/repos/:owner/:repo/hooks/999999999/tests`. Assert 404, message `"webhook not found"`.

14. **Error: webhook belonging to different repository** — Create two repos, webhook on repo A. POST test using repo B's path. Assert 404, message `"webhook not found"`.

15. **Auth: reject unauthenticated request** — POST without auth. Assert 401, message `"authentication required"`.

16. **Auth: reject non-admin with write permission** — Authenticate with `write` permission. Assert 403, message `"permission denied"`.

17. **Auth: reject read-only collaborator** — Authenticate with `read` permission. Assert 403.

18. **Auth: reject user with no repository relationship** — Authenticate as unrelated user. Assert 403.

19. **Auth: accept repository owner** — Authenticate as owner. Assert 204.

20. **Error: non-existent repository** — POST with non-existent repo. Assert 404, message `"repository not found"`.

21. **Error: non-existent owner** — POST with non-existent owner. Assert 404, message `"repository not found"`.

22. **Case insensitivity: owner/repo lookup** — Create repo as `Alice/MyRepo`. POST test using `alice/myrepo`. Assert 204.

23. **Request body is ignored** — POST with JSON body `{"custom":"data"}`. Assert 204, delivery payload is always `{"event":"ping"}`.

24. **No side effects on webhook configuration** — Note `updated_at` before test. POST to test endpoint. GET webhook. Assert `updated_at` unchanged.

25. **Empty response body on success** — POST to test endpoint. Assert response body is empty.

### CLI Integration Tests

26. **CLI happy path: trigger test delivery** — Create webhook via CLI, capture ID. Run `codeplane webhook test <id> --repo OWNER/REPO`. Assert exit code 0, output contains success message.

27. **CLI: test delivery appears in delivery history** — Trigger test via CLI. Run `codeplane webhook deliveries <id>`. Assert delivery with `event_type: "ping"` appears.

28. **CLI: test delivery appears in webhook view** — Trigger test via CLI. Run `codeplane webhook view <id>`. Assert `deliveries` contains `event_type: "ping"` entry.

29. **CLI: test non-existent webhook** — Run `codeplane webhook test 999999 --repo OWNER/REPO`. Assert non-zero exit code, error contains "not found".

30. **CLI: test with invalid ID** — Run `codeplane webhook test abc --repo OWNER/REPO`. Assert non-zero exit code with validation error.

31. **CLI: test without --repo in non-repo directory** — Run `codeplane webhook test 1` from non-repo dir. Assert non-zero exit code with repo resolution error.

32. **CLI: test requires authentication** — Run without auth (empty token). Assert non-zero exit code.

33. **CLI: repo resolution from current directory** — From jj/git repo dir, run `codeplane webhook test <id>` without `--repo`. Assert exit code 0.

### End-to-End (Playwright) UI Tests

34. **UI: test delivery button visible** — Navigate to `/:owner/:repo/settings/webhooks/:id`. Assert "Test delivery" button visible.

35. **UI: clicking test delivery shows success toast** — Click "Test delivery". Assert success toast appears.

36. **UI: ping entry appears in delivery history** — Click "Test delivery". Wait for refresh. Assert ping delivery row appears.

37. **UI: button disabled while loading** — Click "Test delivery", assert button disabled during request, re-enabled after.

38. **UI: test delivery on inactive webhook shows note** — Navigate to inactive webhook. Assert note about inactive state. Click "Test delivery". Assert success.

39. **UI: test delivery error shows error toast** — Simulate error (deleted webhook). Click "Test delivery". Assert error toast.

40. **UI: multiple rapid test deliveries** — Click three times (waiting each). Assert three ping deliveries in history.

41. **UI: ping delivery details on expansion** — Trigger, wait for worker. Click ping row. Assert payload `{"event":"ping"}`, response status, attempts shown.

42. **UI: non-admin cannot trigger** — Log in as non-admin. Navigate to webhook. Assert button not visible or permission error.

### Cross-Client Consistency Tests

43. **API-CLI roundtrip: trigger via API, verify via CLI** — POST test via API. Run `codeplane webhook deliveries` via CLI. Assert ping delivery appears.

44. **CLI-API roundtrip: trigger via CLI, verify via API** — Run `webhook test` via CLI. GET deliveries via API. Assert ping appears.

45. **Web-CLI roundtrip: trigger via Web UI, verify via CLI** — Click "Test delivery" in Playwright. Run `webhook deliveries` via CLI. Assert ping appears.

46. **Multiple sources: all appear in history** — Trigger from API, CLI, and Web UI. GET delivery list. Assert at least three ping deliveries.

### Worker Processing Tests

47. **Worker picks up and delivers ping** — Create webhook to test server. Trigger test. Wait for worker. Assert delivery `"success"`, `response_status: 200`. Assert test server received POST with `X-Codeplane-Event: ping` and `{"event":"ping"}` body.

48. **Worker signs delivery with HMAC** — Create webhook with known secret to test server. Trigger test. Assert test server received `X-Codeplane-Signature-256` header. Verify HMAC-SHA256 signature.

49. **Worker skips signature without secret** — Create webhook without secret. Trigger test. Assert test server did NOT receive `X-Codeplane-Signature-256` header.

50. **Worker retries failed ping** — Create webhook to server returning 500 initially. Trigger test. Assert `attempts >= 2` and `next_retry_at` was set.

51. **Worker marks failed after max retries** — Create webhook to permanently failing endpoint. Wait for all retries. Assert final `status: "failed"`, `attempts: 5`.

52. **Worker handles inactive webhook** — Set webhook inactive. Trigger test. Wait for worker. Assert `status: "failed"`, `response_body` contains `"webhook disabled"`, `attempts: 1`.
