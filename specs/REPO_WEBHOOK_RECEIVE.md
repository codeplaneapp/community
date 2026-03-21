# REPO_WEBHOOK_RECEIVE

Specification for REPO_WEBHOOK_RECEIVE.

## High-Level User POV

When you connect external services to your Codeplane repository — CI systems, deployment pipelines, monitoring tools, chat integrations, or other forges — those services often need to push events back *into* Codeplane. The webhook receive feature gives every repository a secure, authenticated inbound endpoint that external systems can POST payloads to. This is the counterpart to Codeplane's outbound webhook delivery: where outbound webhooks let Codeplane *notify* external systems, inbound webhook receive lets external systems *notify* Codeplane.

A repository administrator configures a webhook with a shared secret. When an external system sends a payload to that webhook's receive URL, Codeplane validates the HMAC-SHA256 signature against the shared secret. If the signature is valid, the payload is accepted and acknowledged. If it is invalid, missing, or malformed, the request is rejected immediately. The external system receives a clear HTTP status code in every case so it can distinguish success from authentication failure, missing webhook, or payload errors.

This feature is the foundational building block for integration patterns such as: receiving push notifications from a git mirror host, accepting status callbacks from external CI providers, processing deployment completion events from infrastructure systems, and enabling bidirectional sync with third-party issue trackers. Once a payload is accepted, Codeplane can route the event internally — triggering workflow runs, updating commit statuses, posting notifications, or executing any other server-side automation tied to the repository.

The experience should be completely transparent. The administrator sets up the webhook once, shares the receive URL and secret with the external system, and from then on payloads flow in securely without any additional human intervention. If something goes wrong — a signature mismatch, a deactivated webhook, a payload that exceeds size limits — both the external sender and the Codeplane administrator should have clear signals about what happened and why.

## Acceptance Criteria

- **Endpoint availability**: Every repository webhook that has been created via the CRUD API **must** have a corresponding receive URL at `POST /api/repos/:owner/:repo/hooks/:id/receive` that is publicly reachable without session authentication (the HMAC signature *is* the authentication).
- **Signature required**: Every inbound request **must** include an `X-Codeplane-Signature-256` header. Requests missing this header **must** be rejected with HTTP 401.
- **Signature validation**: The signature **must** be validated using HMAC-SHA256 with the webhook's stored secret, using a timing-safe comparison. Invalid signatures **must** be rejected with HTTP 401.
- **Signature format**: The signature header value **must** match the format `sha256=<64 hex characters>`. Any other format **must** be rejected as invalid.
- **Payload size limit**: Payloads exceeding 10 MB (10,485,760 bytes) **must** be rejected with HTTP 400. Payloads up to and including exactly 10 MB **must** be accepted.
- **Empty payload**: A zero-byte payload with a valid signature for an empty body **must** be accepted (HTTP 204).
- **Webhook existence**: If the webhook ID does not exist or does not belong to the specified repository, the endpoint **must** return HTTP 404.
- **Repository existence**: If the `:owner/:repo` path does not resolve to a valid repository, the endpoint **must** return HTTP 404.
- **Webhook ID format**: Non-numeric or non-positive webhook IDs **must** be rejected with HTTP 400.
- **Inactive webhook handling**: If the webhook exists but is currently deactivated (is_active = false), the receive endpoint **must** still validate the signature and return 204. The webhook secret remains valid regardless of active status; deactivation controls outbound delivery, not inbound receive.
- **Binary safety**: The endpoint **must** accept arbitrary binary payloads (not just JSON). The signature is computed over raw bytes regardless of Content-Type.
- **Idempotency**: Receiving the same payload multiple times with valid signatures **must** succeed each time (HTTP 204). The endpoint is stateless with respect to duplicate detection.
- **No authentication context leak**: The receive endpoint **must NOT** require or use session cookies, PATs, or OAuth tokens. It authenticates solely via HMAC signature.
- **Secret never exposed**: At no point in the flow — API responses, logs, error messages, or delivery records — should the webhook secret be exposed in plaintext.
- **Event routing after acceptance**: After a payload is accepted (204), the server **should** parse the payload as JSON (if valid) and route the event to internal handlers (e.g., dispatching workflow triggers, updating commit statuses). If the payload is not valid JSON, the server **must** still return 204 but skip internal routing.
- **Concurrency safety**: Multiple concurrent inbound requests to the same webhook **must** be processed independently without race conditions or data corruption.
- **Response body**: Successful receive **must** return HTTP 204 with no response body. Error responses **must** return structured JSON error payloads consistent with the rest of the Codeplane API.

### Definition of Done

The feature is complete when:

1. The `POST /api/repos/:owner/:repo/hooks/:id/receive` endpoint is fully operational with all constraints above enforced.
2. All E2E and integration tests listed in the Verification section pass.
3. Prometheus metrics for inbound webhook receives are emitting.
4. Structured logging is in place for all accept and reject paths.
5. API documentation for the receive endpoint is published.
6. The `REPO_WEBHOOK_RECEIVE` feature flag in `specs/features.ts` is accurate.

## Design

### API Shape

#### `POST /api/repos/:owner/:repo/hooks/:id/receive`

**Purpose**: Accept an inbound webhook payload from an external system.

**Authentication**: HMAC-SHA256 signature via `X-Codeplane-Signature-256` header. No session, PAT, or OAuth authentication.

**Path parameters**:

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `owner` | string | 1–39 characters, alphanumeric and hyphens | Repository owner (user or org) |
| `repo` | string | 1–100 characters, alphanumeric, hyphens, underscores, dots | Repository name |
| `id` | integer | Positive integer (> 0) | Webhook ID |

**Request headers**:

| Header | Required | Format | Description |
|--------|----------|--------|-------------|
| `X-Codeplane-Signature-256` | Yes | `sha256=<64 hex chars>` | HMAC-SHA256 signature of the raw request body |
| `Content-Type` | No | Any | The server does not enforce content type; it reads raw bytes |

**Request body**: Raw bytes, 0 to 10,485,760 bytes (10 MB). Any content type. The HMAC is computed over the raw byte stream.

**Response codes**:

| Status | Condition |
|--------|----------|
| `204 No Content` | Signature valid, payload accepted |
| `400 Bad Request` | Webhook ID is non-numeric or non-positive, or payload exceeds 10 MB, or request body cannot be read |
| `401 Unauthorized` | `X-Codeplane-Signature-256` header is missing, malformed, or signature does not match |
| `404 Not Found` | Repository does not exist, or webhook does not exist / does not belong to this repository |

**Error response body** (for non-204 responses):
```json
{
  "error": "<error message>"
}
```

**Signature computation** (for external systems implementing the sender):
```
signature = "sha256=" + hex(HMAC-SHA256(webhook_secret, raw_request_body))
```

### SDK Shape

The `WebhookService` in `@codeplane/sdk` exposes:

```typescript
async verifyInboundWebhookSignature(
  owner: string,
  repo: string,
  webhookId: number,
  payload: Uint8Array,
  signature: string,
): Promise<void>
```

- Resolves the repository from `owner` and `repo`.
- Fetches and decrypts the webhook's stored secret.
- Calls `verifyPayloadSignature(secret, payload, signature)` for timing-safe HMAC comparison.
- Throws `unauthorized("invalid webhook signature")` on mismatch.
- Throws `notFound("webhook not found")` if the webhook or repo does not exist.
- Throws `badRequest("invalid webhook id")` for invalid IDs.

The standalone pure function is also exported:

```typescript
function verifyPayloadSignature(
  secret: string,
  payload: Uint8Array,
  signature: string,
): boolean
```

- Returns `false` if secret is empty, signature is empty, signature does not start with `sha256=`, hex portion is not exactly 64 characters, or HMAC does not match.
- Uses `crypto.timingSafeEqual` for comparison.

### CLI Command

No dedicated CLI command is needed for receiving webhooks. The receive endpoint is consumed by external systems, not human operators. However, the existing CLI commands support the surrounding workflow:

- `codeplane webhook create` — Sets up the webhook that has a receive URL.
- `codeplane webhook view <id>` — Shows webhook details including the receive URL pattern.
- `codeplane webhook deliveries <id>` — Shows delivery history.

**Enhancement**: `codeplane webhook view` output **should** include a `receive_url` field that displays the fully-qualified inbound URL for the webhook.

### Web UI Design

The webhook settings page at `/:owner/:repo/settings/webhooks` **should** include:

1. **Receive URL display**: A read-only field showing the full receive URL with a copy-to-clipboard button.
2. **Integration instructions**: A collapsible section showing how to configure an external system to send payloads, including the receive URL, required headers, example cURL command, and code snippets for generating the signature in JavaScript, Python, Go, and Ruby.
3. **Recent inbound activity indicator**: If the receive endpoint has been hit recently, show a status badge or timestamp.

### Documentation

1. **API Reference — Webhooks** (`docs/api-reference/webhooks.mdx`): Add a dedicated "Receiving Webhooks (Inbound)" section with full endpoint spec, signature algorithm, code examples, error codes, and payload size limits.
2. **Integration Guide** (`docs/guides/webhook-receive.mdx`): Step-by-step guide for creating a webhook, configuring the external system, verifying connectivity, and troubleshooting.
3. **CLI Reference** (`docs/cli-reference/commands.mdx`): Update `webhook view` documentation to mention the receive URL output.

## Permissions & Security

### Authorization Roles

| Action | Owner | Admin | Member | Read-Only | Anonymous / External |
|--------|-------|-------|--------|-----------|---------------------|
| Receive inbound payload (POST .../receive) | N/A | N/A | N/A | N/A | **Allowed** (HMAC-authenticated) |
| Create webhook (which enables receive) | ✅ | ✅ | ❌ | ❌ | ❌ |
| View webhook (see receive URL) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Update webhook secret | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete webhook | ✅ | ✅ | ❌ | ❌ | ❌ |

The receive endpoint deliberately bypasses Codeplane's standard session/PAT auth middleware. The HMAC-SHA256 signature serves as the sole authentication mechanism, because external systems cannot hold Codeplane session cookies.

### Rate Limiting

- **Per-webhook rate limit**: Maximum **60 requests per minute** per webhook ID. Beyond this, return HTTP 429 with a `Retry-After` header.
- **Per-repository rate limit**: Maximum **300 requests per minute** across all webhooks in a single repository.
- **Global receive rate limit**: Maximum **10,000 requests per minute** across all receive endpoints server-wide.
- **Payload size enforcement**: The 10 MB limit prevents memory exhaustion from large payloads.
- **Failed signature penalty**: After **100 consecutive failed signature validations** for a single webhook within a 1-hour window, temporarily block that webhook's receive endpoint for 15 minutes and log an alert.

### Data Privacy

- **Secret storage**: Webhook secrets are encrypted at rest using `SecretCodec`. They are never logged, never included in API responses (always `"********"`), and never included in error messages.
- **Payload logging**: Inbound payloads **must NOT** be logged at info level. At debug level, only a truncated hash of the payload may be logged for correlation. Full payloads must never appear in logs.
- **Timing attack prevention**: Signature comparison uses `crypto.timingSafeEqual` to prevent timing-based secret extraction.
- **No payload persistence by default**: The receive endpoint does not persist the inbound payload to the database unless internal event routing creates downstream records.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WebhookReceiveAttempted` | Every inbound POST to the receive endpoint | `owner`, `repo`, `webhook_id`, `payload_size_bytes`, `has_signature`, `content_type` |
| `WebhookReceiveAccepted` | Signature validated successfully (204) | `owner`, `repo`, `webhook_id`, `payload_size_bytes`, `content_type`, `latency_ms` |
| `WebhookReceiveRejected` | Signature invalid, missing, or other error | `owner`, `repo`, `webhook_id`, `rejection_reason` (enum: `missing_signature`, `invalid_signature`, `webhook_not_found`, `repo_not_found`, `invalid_webhook_id`, `payload_too_large`, `rate_limited`), `response_status` |
| `WebhookReceiveEventRouted` | Accepted payload successfully routed to an internal handler | `owner`, `repo`, `webhook_id`, `routed_event_type`, `handler_name` |

### Funnel Metrics and Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| **Receive acceptance rate** | > 95% of attempts | Healthy integrations should have very high acceptance rates. Low rates indicate misconfigured secrets. |
| **Receive p99 latency** | < 200ms | Signature validation should be fast. High latency indicates DB or crypto bottlenecks. |
| **Active inbound webhooks** | Growing week-over-week | Count of webhooks that have received at least one valid payload in the last 7 days. |
| **Integration activation rate** | > 50% of created webhooks | Percentage of webhooks that receive at least one inbound payload within 7 days of creation. |
| **Rejection reason distribution** | `invalid_signature` < 10% of rejections | If most rejections are signature failures, documentation or UX for secret sharing needs improvement. |

## Observability

### Structured Logging

| Log Event | Level | Structured Context | Notes |
|-----------|-------|--------------------|-------|
| Inbound webhook receive started | `info` | `owner`, `repo`, `webhook_id`, `payload_size_bytes`, `request_id`, `remote_addr` | Log on every receive attempt. Never include payload contents. |
| Signature validation succeeded | `info` | `owner`, `repo`, `webhook_id`, `request_id`, `latency_ms` | |
| Signature validation failed | `warn` | `owner`, `repo`, `webhook_id`, `request_id`, `failure_reason` | Failure reason: `missing_header`, `malformed_format`, `hmac_mismatch` |
| Webhook not found | `warn` | `owner`, `repo`, `webhook_id`, `request_id` | |
| Repository not found | `warn` | `owner`, `repo`, `request_id` | |
| Payload size exceeded | `warn` | `owner`, `repo`, `webhook_id`, `payload_size_bytes`, `request_id` | |
| Rate limit exceeded | `warn` | `owner`, `repo`, `webhook_id`, `request_id`, `limit_type` | |
| Internal event routing succeeded | `info` | `owner`, `repo`, `webhook_id`, `routed_event_type`, `request_id` | |
| Internal event routing failed | `error` | `owner`, `repo`, `webhook_id`, `error`, `request_id` | |
| Consecutive signature failure threshold reached | `error` | `owner`, `repo`, `webhook_id`, `failure_count`, `block_duration_minutes` | |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_webhook_receive_total` | Counter | `owner`, `repo`, `status` (`accepted`, `rejected`, `error`) | Total inbound webhook receive attempts |
| `codeplane_webhook_receive_duration_seconds` | Histogram | `owner`, `repo`, `status` | End-to-end receive handler latency |
| `codeplane_webhook_receive_payload_bytes` | Histogram | `owner`, `repo` | Distribution of inbound payload sizes |
| `codeplane_webhook_receive_rejection_total` | Counter | `reason` (`missing_signature`, `invalid_signature`, `not_found`, `payload_too_large`, `rate_limited`, `invalid_id`) | Rejection breakdown |
| `codeplane_webhook_receive_signature_failures_streak` | Gauge | `owner`, `repo`, `webhook_id` | Current consecutive signature failure count per webhook |
| `codeplane_webhook_receive_rate_limited_total` | Counter | `limit_type` (`per_webhook`, `per_repo`, `global`) | Rate limit rejections by scope |
| `codeplane_webhook_receive_event_routed_total` | Counter | `owner`, `repo`, `event_type` | Events successfully routed to internal handlers |

### Alerts

#### Alert: `WebhookReceiveHighRejectionRate`
**Condition**: `rate(codeplane_webhook_receive_rejection_total[5m]) / rate(codeplane_webhook_receive_total[5m]) > 0.5` sustained for 10 minutes.
**Severity**: Warning
**Runbook**:
1. Check `codeplane_webhook_receive_rejection_total` by `reason` label to identify the dominant rejection reason.
2. If `invalid_signature` dominates: Check if a webhook secret was recently rotated. Contact the webhook owner to verify their sender is using the correct secret.
3. If `not_found` dominates: Check if webhooks were recently deleted. An external system may still be sending to a stale URL.
4. If `payload_too_large` dominates: Investigate which external system is sending oversized payloads.
5. If `rate_limited` dominates: Check if an external system is sending in bursts.

#### Alert: `WebhookReceiveSignatureFailureStreak`
**Condition**: `codeplane_webhook_receive_signature_failures_streak > 50` for any single webhook.
**Severity**: Warning
**Runbook**:
1. Identify the affected webhook via `owner`, `repo`, `webhook_id` labels.
2. Check recent logs for `signature validation failed` events.
3. Determine if this is a brute-force attack (random IPs, rapid fire) or a misconfigured integration (consistent sender).
4. If attack: Block source IP at the load balancer. The automatic 15-minute block after 100 failures should already be active.
5. If misconfiguration: Contact the repository admin to re-share the webhook secret.

#### Alert: `WebhookReceiveLatencyHigh`
**Condition**: `histogram_quantile(0.99, rate(codeplane_webhook_receive_duration_seconds_bucket[5m])) > 1.0` sustained for 5 minutes.
**Severity**: Warning
**Runbook**:
1. Check database connection pool metrics.
2. Check if the `SecretCodec` encryption/decryption is a bottleneck.
3. Review recent deployment changes.
4. Check for lock contention in webhook lookup queries.

#### Alert: `WebhookReceiveRateLimitExhausted`
**Condition**: `rate(codeplane_webhook_receive_rate_limited_total{limit_type="global"}[5m]) > 100` sustained for 5 minutes.
**Severity**: Critical
**Runbook**:
1. Identify the top repositories by `codeplane_webhook_receive_total`.
2. Determine if this is legitimate traffic or abuse.
3. If abuse: Block source IPs at the load balancer.
4. If legitimate: Increase the global rate limit or implement per-source-IP limiting.
5. Monitor downstream internal event processing for backlog.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Log Level | Recovery |
|------------|-------------|-----------|----------|
| Missing `X-Codeplane-Signature-256` header | 401 | warn | External system must add the header |
| Signature format invalid | 401 | warn | External system must fix signature computation |
| HMAC mismatch | 401 | warn | External system using wrong secret; admin must re-share |
| Webhook ID non-numeric | 400 | warn | Client bug; fix URL construction |
| Webhook ID <= 0 | 400 | warn | Client bug; fix URL construction |
| Payload > 10 MB | 400 | warn | External system must reduce payload size |
| Request body unreadable | 400 | warn | Network issue or malformed chunked encoding |
| Webhook not found | 404 | warn | Webhook was deleted; update external config |
| Repository not found | 404 | warn | Repository was deleted or transferred |
| Secret decryption failure | 500 | error | Encryption key rotation issue; check SecretCodec |
| Database unavailable | 500 | error | Standard DB outage recovery procedures |

## Verification

### API Integration Tests

1. **Happy path: valid signature returns 204** — Create a webhook with a known secret. Compute HMAC-SHA256 of a JSON payload using that secret. POST to the receive endpoint with the correct `X-Codeplane-Signature-256` header. Assert HTTP 204 with empty body.

2. **Valid signature with maximum payload size (10 MB) returns 204** — Generate a 10,485,760-byte payload. Compute correct signature. POST and assert HTTP 204.

3. **Payload exceeding maximum size (10 MB + 1 byte) returns 400** — Generate a 10,485,761-byte payload. POST and assert HTTP 400.

4. **Empty payload (0 bytes) with valid signature returns 204** — Compute HMAC of empty buffer. POST empty body with correct signature. Assert HTTP 204.

5. **Missing signature header returns 401** — POST a valid payload without the `X-Codeplane-Signature-256` header. Assert HTTP 401.

6. **Empty signature header returns 401** — POST with `X-Codeplane-Signature-256: ""`. Assert HTTP 401.

7. **Whitespace-only signature header returns 401** — POST with `X-Codeplane-Signature-256: "   "`. Assert HTTP 401.

8. **Malformed signature (no sha256= prefix) returns 401** — POST with `X-Codeplane-Signature-256: "abc123..."`. Assert HTTP 401.

9. **Malformed signature (wrong hex length) returns 401** — POST with `X-Codeplane-Signature-256: "sha256=abc"`. Assert HTTP 401.

10. **Malformed signature (non-hex characters) returns 401** — POST with `X-Codeplane-Signature-256: "sha256=zzzz..."` (64 non-hex chars). Assert HTTP 401.

11. **Wrong secret produces invalid signature, returns 401** — Create webhook with secret "correct-secret". Compute signature using "wrong-secret". POST and assert HTTP 401.

12. **Non-existent webhook ID returns 404** — POST to `/api/repos/:owner/:repo/hooks/999999/receive` with any payload. Assert HTTP 404.

13. **Non-numeric webhook ID returns 400** — POST to `/api/repos/:owner/:repo/hooks/abc/receive`. Assert HTTP 400.

14. **Negative webhook ID returns 400** — POST to `/api/repos/:owner/:repo/hooks/-1/receive`. Assert HTTP 400.

15. **Zero webhook ID returns 400** — POST to `/api/repos/:owner/:repo/hooks/0/receive`. Assert HTTP 400.

16. **Non-existent repository returns 404** — POST to `/api/repos/nonexistent/nonexistent/hooks/1/receive`. Assert HTTP 404.

17. **Webhook belonging to a different repo returns 404** — Create webhook on repo A. POST to repo B's receive URL with repo A's webhook ID. Assert HTTP 404.

18. **Binary (non-JSON) payload with valid signature returns 204** — Send raw binary bytes with correct HMAC. Assert HTTP 204.

19. **Inactive webhook still accepts valid signature** — Create webhook, deactivate via PATCH, then POST to receive with valid signature. Assert HTTP 204.

20. **Concurrent receive requests succeed independently** — Send 10 concurrent POST requests with unique payloads and correct signatures. Assert all return HTTP 204.

21. **Signature hex case sensitivity** — Compute a signature and convert hex to uppercase. POST and verify acceptance or rejection behavior is consistent and documented.

22. **Content-Type header does not affect acceptance** — POST with `application/xml`, `text/plain`, and no `Content-Type`, each with valid signature. Assert all return HTTP 204.

### CLI E2E Tests

23. **`codeplane webhook view` displays receive URL** — Create a webhook. Run `codeplane webhook view <id>`. Assert the output includes the receive URL path.

24. **End-to-end: create webhook, POST to receive, verify via CLI** — Create a webhook via CLI. POST a valid signed payload to the receive URL. Run `codeplane webhook view <id>` and verify the webhook is still active.

### Playwright (Web UI) E2E Tests

25. **Webhook settings page shows receive URL** — Navigate to `/:owner/:repo/settings/webhooks`. Click on a webhook. Assert the receive URL is displayed.

26. **Copy-to-clipboard button works for receive URL** — Click the copy button next to the receive URL. Assert the clipboard contains the correct URL.

27. **Integration instructions section is visible** — Expand the integration instructions section. Assert it contains cURL example, signature generation code snippets, and required headers.

### Security-Focused Tests

28. **Timing-safe comparison: invalid signature does not leak timing information** — Measure response time for correct vs. incorrect signatures. Assert response times are within reasonable tolerance.

29. **Secret is never exposed in error responses** — Send an invalid signature. Parse error response. Assert secret is not present.

30. **No session/PAT auth fallback on receive endpoint** — POST with a valid PAT but no signature header. Assert HTTP 401.

### Edge Case Tests

31. **Extremely long webhook ID (overflow) returns 400** — POST with ID `99999999999999999999`. Assert HTTP 400.

32. **URL-encoded owner/repo names resolve correctly** — Create a repo with allowed special characters. POST to receive using URL-encoded path. Assert correct resolution.

33. **Deleted webhook returns 404** — Create webhook, delete it, POST to old receive URL. Assert HTTP 404.

34. **Secret rotation: old secret fails, new secret succeeds** — Create webhook with secret A. Update to secret B. POST with secret A signature — assert 401. POST with secret B signature — assert 204.
