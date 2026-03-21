# PLATFORM_HTTP_MIDDLEWARE_RATE_LIMITING

Specification for PLATFORM_HTTP_MIDDLEWARE_RATE_LIMITING.

## High-Level User POV

When users interact with the Codeplane API — whether from the web UI, CLI, TUI, desktop app, editor integrations, or third-party scripts — every request is subject to rate limiting that protects the platform from abuse, ensures fair resource sharing across all users, and maintains consistent response times.

Authenticated users enjoy a generous request budget. When signed in with a personal access token, OAuth session, or SSH key-linked session, the platform tracks usage by user identity, meaning a user can work from multiple devices and IP addresses while sharing a single, high-ceiling rate limit. Unauthenticated users are tracked by IP address and receive a substantially lower budget, encouraging token-based authentication.

Users always know where they stand. Every API response includes standard rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) that tell them how many requests they have left and when their budget renews. When a user exhausts their budget, the API returns a clear `429 Too Many Requests` response with a `Retry-After` header so the client knows exactly when to resume. The CLI, TUI, and SDK clients automatically surface this information and implement respectful backoff behavior.

Search endpoints carry an additional, stricter rate limit to prevent expensive query operations from degrading the platform. This separate search budget is tracked independently, so heavy search usage does not eat into a user's general API budget.

Self-hosting administrators can tune rate limit thresholds via environment variables to match their deployment capacity without modifying source code. The platform logs rate limit enforcement transparently and exposes Prometheus metrics so operators can monitor consumption patterns, identify abusive clients, and adjust limits proactively.

## Acceptance Criteria

### Definition of Done

The rate limiting middleware is complete when:

- All API endpoints enforce tiered rate limits (authenticated, unauthenticated, and search-specific) as documented.
- Rate limit headers are present on every HTTP response.
- Exceeding any rate limit produces a well-formed 429 response with a `Retry-After` header.
- Rate limits are configurable via environment variables without code changes.
- Conditional requests (304 Not Modified) do not consume rate limit tokens.
- The CLI, TUI, SDK, and web UI clients handle 429 responses gracefully.
- Search endpoints enforce an additional, independent rate limit using the database-backed token bucket.
- Comprehensive E2E tests validate all tiers, header correctness, 429 behavior, and edge cases.
- Public API documentation accurately reflects enforced behavior.
- Prometheus metrics and structured logs are emitted for all rate limit events.

### Functional Constraints

- [ ] **Tiered limits must be enforced as documented:**
  - Authenticated: 5,000 requests per hour per user identity
  - Unauthenticated: 60 requests per hour per IP address
  - Search (`/api/search/*`): 30 requests per minute per user/IP (applied in addition to the general limit)
- [ ] **Identity resolution:** Authenticated requests MUST be keyed by user ID (not IP). Unauthenticated requests MUST be keyed by IP address, resolved via `X-Real-Ip`, then `X-Forwarded-For`, then socket remote address.
- [ ] **Header contract:** Every API response (including 429, 4xx, and 5xx) MUST include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
- [ ] **`X-RateLimit-Reset` value:** MUST be a UTC epoch timestamp in seconds (integer), not milliseconds.
- [ ] **`X-RateLimit-Remaining` value:** MUST never be negative. Minimum value is `0`.
- [ ] **429 response body:** MUST be `{ "message": "API rate limit exceeded. Please wait before making more requests." }` with content type `application/json`.
- [ ] **`Retry-After` header on 429:** MUST be present and contain the number of seconds until the window resets (integer, rounded up).
- [ ] **Conditional requests:** Responses with status `304 Not Modified` MUST NOT decrement the rate limit counter.
- [ ] **SSE streams:** The initial SSE connection request counts as one request. Subsequent streamed events on an established connection MUST NOT consume rate limit tokens.
- [ ] **Health endpoint exemption:** `GET /api/health` and `GET /api/feature-flags` MUST be exempt from rate limiting.
- [ ] **Search double-limiting:** Search requests MUST consume from both the general tier AND the search-specific tier. A 429 from either tier rejects the request.
- [ ] **Window behavior:** When a window expires, the counter resets fully. Partial carry-over is NOT required.
- [ ] **In-memory store cleanup:** Stale entries MUST be cleaned up periodically (at least every 60 seconds) to prevent unbounded memory growth.
- [ ] **Database-backed search limits:** Search rate limits MUST be persisted in the `search_rate_limits` table using the token bucket algorithm so they survive server restarts.

### Configuration Constraints

- [ ] **Environment variables must be supported:**
  - `CODEPLANE_RATE_LIMIT_AUTHENTICATED` — max requests per hour for authenticated users (default: `5000`)
  - `CODEPLANE_RATE_LIMIT_UNAUTHENTICATED` — max requests per hour for unauthenticated users (default: `60`)
  - `CODEPLANE_RATE_LIMIT_SEARCH` — max search requests per minute (default: `30`)
  - `CODEPLANE_RATE_LIMIT_ENABLED` — boolean to disable rate limiting entirely (default: `true`)
- [ ] **All env var values must be validated at startup.** Non-numeric or negative values MUST cause a startup warning with fallback to defaults.

### Edge Cases

- [ ] **Multiple IPs behind NAT:** All share the same unauthenticated budget. This is by design and must be documented.
- [ ] **Missing IP headers:** If no IP can be resolved, the key MUST fall back to a constant `"ip:unknown"`. This effectively creates a shared pool for unidentifiable clients.
- [ ] **Token with invalid/expired credentials:** Treated as unauthenticated and limited by IP.
- [ ] **User authenticated mid-window:** Requests before authentication are tracked under IP; requests after are tracked under user ID. The two budgets are independent.
- [ ] **Concurrent requests at exactly the limit boundary:** The `count > maxRequests` check means the user gets exactly `maxRequests` successful responses, and the `maxRequests + 1`th request is the first 429.
- [ ] **Empty or malformed `Authorization` header:** Treated as unauthenticated.
- [ ] **HEAD requests:** Count against the rate limit identically to GET requests.
- [ ] **OPTIONS (preflight) requests:** MUST be exempt from rate limiting (handled by CORS middleware before rate limit middleware).
- [ ] **Server restart:** In-memory general rate limits reset on restart. Database-backed search limits persist across restarts.

## Design

### API Shape

#### Response Headers (all endpoints)

Every API response includes:

```
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 4987
X-RateLimit-Reset: 1709741200
```

When the general tier is exceeded:

```
HTTP/2 429 Too Many Requests
Content-Type: application/json
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1709741200
Retry-After: 1847

{"message": "API rate limit exceeded. Please wait before making more requests."}
```

When the search tier is exceeded (on `/api/search/*`):

```
HTTP/2 429 Too Many Requests
Content-Type: application/json
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1709741260
Retry-After: 42

{"message": "Search rate limit exceeded. Please wait before making more requests."}
```

Search 429 responses use the search-specific limit values in headers, not the general tier values.

#### Dedicated Rate Limit Status Endpoint

`GET /api/rate-limit` — Returns current rate limit status without consuming a rate limit token.

Response:

```json
{
  "rate": {
    "limit": 5000,
    "remaining": 4987,
    "reset": 1709741200
  },
  "resources": {
    "search": {
      "limit": 30,
      "remaining": 28,
      "reset": 1709741260
    }
  }
}
```

This endpoint is exempt from rate limiting itself.

### SDK Shape

The `@codeplane/sdk` API client must:

- Parse `X-RateLimit-*` headers from every response and expose them on the response object.
- On 429 responses, automatically wait for the `Retry-After` duration and retry the request (up to 1 retry).
- Expose a `getRateLimitStatus()` method that calls `GET /api/rate-limit`.
- Emit a `rateLimitWarning` event when `X-RateLimit-Remaining` drops below 10% of `X-RateLimit-Limit`.

### CLI Command

The CLI must:

- Display rate limit information when running `codeplane api rate-limit` or `codeplane status --rate-limit`.
- On 429 responses, print a warning message to stderr: `Rate limit exceeded. Retrying in <N> seconds...` and automatically retry once after the `Retry-After` period.
- Support `--no-retry` flag to disable automatic retry on 429.

Example CLI output:

```
$ codeplane api rate-limit
Rate Limit Status
  General:  4987 / 5000 remaining  (resets in 31m)
  Search:   28 / 30 remaining      (resets in 42s)
```

### TUI UI

The TUI must:

- Display current rate limit status in the status bar when available.
- Show a warning banner when rate limit remaining drops below 10%.
- On 429 responses, show an inline notification with countdown to reset.

### Web UI Design

The web UI must:

- Display rate limit headers in the browser developer tools (no special UI surface needed).
- On 429 responses from API calls, show a toast notification: "API rate limit reached. Retrying in X seconds..." with a countdown.
- Never retry automatically more than once per 429 event.

### Documentation

The following documentation must exist and accurately reflect enforced behavior:

1. **`docs/api-reference/rate-limiting.mdx`** — Already exists. Must be updated to reflect:
   - The three tiers (authenticated/unauthenticated/search) with correct limits.
   - The `GET /api/rate-limit` status endpoint.
   - Conditional request exemption (304 does not consume tokens).
   - Health and feature-flag endpoint exemptions.
   - Environment variable configuration for self-hosted deployments.
2. **`docs/self-hosting/configuration.mdx`** — Must document all `CODEPLANE_RATE_LIMIT_*` environment variables with defaults and validation behavior.
3. **SDK inline documentation** — JSDoc on all rate-limit-related SDK methods and types.

## Permissions & Security

### Authorization Roles and Rate Limiting

Rate limiting is not role-gated — it applies to all users regardless of role. However, identity resolution affects which tier applies:

| Identity State | Rate Limit Tier | Key |
|---|---|---|
| Anonymous / no credentials | Unauthenticated (60/hr) | Client IP address |
| Valid PAT / session / OAuth | Authenticated (5,000/hr) | User ID |
| Expired or invalid token | Unauthenticated (60/hr) | Client IP address |
| Deploy key (SSH) | Authenticated (5,000/hr) | Deploy key fingerprint |
| Service account / bot | Authenticated (5,000/hr) | User/bot ID |

### Admin Capabilities

- **Admin users** are subject to the same rate limits as regular authenticated users. No bypass.
- **Admin API endpoints** (`/api/admin/*`) are rate-limited identically to other endpoints.
- Administrators can adjust limits via environment variables on the deployment.
- Future consideration: admin UI to view per-user rate limit consumption (not in scope for this spec).

### Rate Limiting as Security Control

- Rate limiting is the primary defense against brute-force attacks on authentication endpoints (`/api/auth/*`). The 60/hr unauthenticated limit bounds credential guessing to at most 60 attempts per hour per IP.
- Rate limiting on search endpoints prevents denial-of-service through expensive full-text queries.
- The middleware executes before auth loading, so rate limits cannot be bypassed by sending malformed auth headers that cause auth middleware to error.

### Data Privacy

- Rate limit keys for authenticated users use opaque user IDs, not email addresses or usernames.
- Rate limit keys for unauthenticated users use IP addresses, which are PII. These MUST NOT be logged at INFO level. IP-keyed rate limit events may be logged at DEBUG level only.
- The `search_rate_limits` database table stores `principal_key` values. For unauthenticated users, these contain IP addresses and must be cleaned up by the expiry job within 24 hours of last activity.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|---|---|---|
| `RateLimitExceeded` | A request is rejected with 429 | `tier` (general/search), `identity_type` (authenticated/unauthenticated), `endpoint_path`, `remaining_seconds`, `user_id` (if authenticated, else null) |
| `RateLimitWarning` | A response is served with remaining < 10% of limit | `tier`, `identity_type`, `remaining`, `limit`, `user_id` |
| `RateLimitConfigChanged` | Server starts with non-default rate limit env vars | `authenticated_limit`, `unauthenticated_limit`, `search_limit` |

### Event Properties

All rate limit events must include:

- `timestamp` — ISO 8601
- `request_id` — from `X-Request-Id` header
- `tier` — `"general"` or `"search"`
- `identity_type` — `"authenticated"` or `"unauthenticated"`
- `limit` — the applicable limit value
- `remaining` — tokens remaining after this request
- `window_reset` — epoch seconds when window resets

### Funnel Metrics and Success Indicators

- **429 rate as % of total requests** — Target: < 0.1% of total API requests should be 429s. Higher indicates limits are too low or a client is misbehaving.
- **Unique users hitting 429 per day** — Target: < 1% of active users. If significantly higher, limits may need raising.
- **Median `X-RateLimit-Remaining` at time of 429** — Should be `0`. If not, indicates a bug.
- **Search 429 rate vs. general 429 rate** — If search 429s are disproportionately high, the search limit may need tuning.
- **Authentication conversion from rate-limited unauthenticated users** — Track whether users who hit the 60/hr unauthenticated limit subsequently authenticate (indicating the tiered model is working as intended).

## Observability

### Structured Logging

| Log Event | Level | Structured Fields | When |
|---|---|---|---|
| Rate limit enforced | DEBUG | `key`, `count`, `limit`, `remaining`, `resetAt` | Every request (too verbose for INFO) |
| Rate limit exceeded | WARN | `key` (redacted IP), `limit`, `tier`, `endpoint`, `request_id` | 429 returned |
| Rate limit store cleanup | DEBUG | `entries_removed`, `entries_remaining` | Every cleanup cycle |
| Rate limit config loaded | INFO | `authenticated_limit`, `unauthenticated_limit`, `search_limit`, `enabled` | Server startup |
| Rate limit disabled | WARN | — | Server starts with `CODEPLANE_RATE_LIMIT_ENABLED=false` |
| Search rate limit token consumed | DEBUG | `scope`, `principal_key` (redacted), `remaining_tokens`, `allowed` | Every search request |
| Invalid rate limit env var | WARN | `variable_name`, `raw_value`, `default_used` | Server startup with invalid config |

**IP Redaction:** When logging rate limit events involving IP-keyed principals, the last octet of IPv4 addresses must be replaced with `xxx` (e.g., `192.168.1.xxx`). IPv6 addresses must be truncated to the first 4 groups.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_http_rate_limit_requests_total` | Counter | `tier`, `identity_type`, `result` (allowed/rejected) | Total requests processed by rate limiter |
| `codeplane_http_rate_limit_rejections_total` | Counter | `tier`, `identity_type`, `endpoint` | Total 429 responses |
| `codeplane_http_rate_limit_remaining_ratio` | Histogram | `tier`, `identity_type` | Distribution of `remaining/limit` at time of request (buckets: 0, 0.1, 0.25, 0.5, 0.75, 1.0) |
| `codeplane_http_rate_limit_store_size` | Gauge | — | Current number of entries in the in-memory rate limit store |
| `codeplane_search_rate_limit_tokens_remaining` | Histogram | `scope` | Distribution of remaining search tokens after consumption |
| `codeplane_http_rate_limit_cleanup_duration_seconds` | Histogram | — | Duration of periodic cleanup operations |

### Alerts

#### Alert: High Rate Limit Rejection Rate

**Condition:** `rate(codeplane_http_rate_limit_rejections_total[5m]) / rate(codeplane_http_rate_limit_requests_total[5m]) > 0.05` sustained for 10 minutes.

**Severity:** Warning

**Runbook:**
1. Check `codeplane_http_rate_limit_rejections_total` by `identity_type` label to determine if rejections are primarily authenticated or unauthenticated.
2. If unauthenticated: check for bot/crawler traffic. Look at WARN logs for rate limit exceeded events and identify the top offending IPs using `codeplane_http_rate_limit_rejections_total` broken down by key patterns in logs.
3. If authenticated: identify the specific user(s) via user ID in structured logs. Contact the user or consider whether the limit needs raising for their use case.
4. If rejections are spread across many users, the configured limit may be too low for the current user base. Consider raising `CODEPLANE_RATE_LIMIT_AUTHENTICATED` or `CODEPLANE_RATE_LIMIT_UNAUTHENTICATED`.
5. Verify no recent deployment changed the limits unintentionally by checking `codeplane_http_rate_limit_requests_total` baseline.

#### Alert: Rate Limit Store Memory Growth

**Condition:** `codeplane_http_rate_limit_store_size > 100000` sustained for 5 minutes.

**Severity:** Warning

**Runbook:**
1. This indicates the in-memory rate limit store has grown to over 100K entries, suggesting either a DDoS attack (many unique IPs) or a cleanup failure.
2. Check `codeplane_http_rate_limit_cleanup_duration_seconds` for anomalies — if cleanup is taking longer than expected, the store may be too large.
3. Check logs for the cleanup cycle (`entries_removed`, `entries_remaining`) to verify cleanup is executing.
4. If under DDoS: enable upstream rate limiting (e.g., reverse proxy / CDN level) to reduce the number of unique IPs reaching the application.
5. If cleanup has stopped: restart the server process. File a bug — the cleanup interval timer may have been garbage collected.

#### Alert: Search Rate Limit DB Latency

**Condition:** `histogram_quantile(0.95, codeplane_search_rate_limit_tokens_remaining) < 0` (indicating many search limit exhaustions) AND `rate(codeplane_http_rate_limit_rejections_total{tier="search"}[5m]) > 1` sustained for 5 minutes.

**Severity:** Info

**Runbook:**
1. Search rate limits are being hit frequently. This may indicate a specific user or integration is performing excessive searches.
2. Query logs for `Search rate limit token consumed` events with `allowed=false` to identify the principal.
3. If a specific user: reach out and suggest they use webhooks or SSE for real-time updates instead of polling search.
4. If widespread: consider raising `CODEPLANE_RATE_LIMIT_SEARCH` or optimizing search query performance to reduce the need for repeated queries.

#### Alert: Rate Limiting Disabled in Production

**Condition:** `absent(codeplane_http_rate_limit_requests_total)` for 5 minutes in production environment.

**Severity:** Critical

**Runbook:**
1. Rate limiting metrics are not being emitted, which likely means rate limiting has been disabled via `CODEPLANE_RATE_LIMIT_ENABLED=false`.
2. Verify the environment variable configuration on the running deployment.
3. If intentionally disabled (e.g., during a load test), ensure a time-boxed plan exists to re-enable.
4. If unintentionally disabled: re-enable immediately by setting `CODEPLANE_RATE_LIMIT_ENABLED=true` and restarting.
5. Rate limiting should NEVER be disabled in production outside of controlled testing windows.

### Error Cases and Failure Modes

| Failure | Impact | Behavior |
|---|---|---|
| In-memory store becomes very large (100K+ entries) | Increased memory usage, slower cleanup | Cleanup interval continues operating; alert fires |
| Database unavailable for search rate limit check | Search requests cannot verify rate limit | Fail-open: allow the search request but log an ERROR |
| Clock skew on server | Window boundaries may drift | Rate limit windows use monotonic `Date.now()`; minor skew is tolerable |
| Multiple server instances (no shared state) | Each instance maintains independent in-memory counters | Users effectively get `N × limit` across `N` instances. Document as a known behavior for multi-instance deployments. |
| Reverse proxy strips IP headers | All unauthenticated users share `ip:unknown` key | Document required proxy configuration (`X-Real-Ip` or `X-Forwarded-For`) |

## Verification

### API Integration Tests

#### General Rate Limit Enforcement (Authenticated)

- [ ] **Authenticated user can make up to 5,000 requests in one hour without being rate-limited.** Send 100 requests with a valid PAT and verify all return 200 with correct `X-RateLimit-Remaining` decrementing.
- [ ] **Authenticated user receives 429 after exceeding 5,000 requests.** Configure a test-scoped limit (e.g., 10 requests) and send 11 requests; verify the 11th returns 429.
- [ ] **429 response includes `Retry-After` header.** After triggering a 429, verify the header is present and contains a positive integer.
- [ ] **429 response includes correct body.** Verify `{ "message": "API rate limit exceeded. Please wait before making more requests." }`.
- [ ] **Rate limit resets after window expires.** Trigger a 429, wait for the window to expire (use a short test window), then verify the next request succeeds.
- [ ] **`X-RateLimit-Limit` header is present on every 200 response.** Verify the value matches the configured limit.
- [ ] **`X-RateLimit-Remaining` header is present on every 200 response.** Verify it decrements by 1 with each request.
- [ ] **`X-RateLimit-Reset` header is present on every response.** Verify it is a valid UTC epoch timestamp in seconds.
- [ ] **`X-RateLimit-Remaining` never goes below 0.** After exceeding the limit, verify subsequent 429 responses still show `X-RateLimit-Remaining: 0`.
- [ ] **Rate limit is tracked per user, not per token.** Two different PATs for the same user share the same rate limit budget.

#### General Rate Limit Enforcement (Unauthenticated)

- [ ] **Unauthenticated requests are limited to 60 per hour.** Configure a test-scoped limit (e.g., 5 requests) and verify the 6th request from the same IP returns 429.
- [ ] **Unauthenticated rate limit is tracked by IP.** Send requests with different `X-Real-Ip` headers and verify each IP gets an independent budget.
- [ ] **Missing IP headers fall back to `ip:unknown`.** Send requests without any IP headers; verify rate limiting still applies under the shared unknown key.
- [ ] **`X-Forwarded-For` is used when `X-Real-Ip` is absent.** Verify correct IP extraction from `X-Forwarded-For`.

#### Search-Specific Rate Limiting

- [ ] **Search endpoints enforce the search-specific limit (30/min).** Send 31 requests to `/api/search/repositories` and verify the 31st returns 429 with search-specific messaging.
- [ ] **Search rate limit is independent of general rate limit.** Exhaust the search limit and verify non-search endpoints still work.
- [ ] **Search requests consume from both general and search tiers.** After exhausting the general limit, search requests should also return 429 even if search-specific budget remains.
- [ ] **Search rate limits persist across server restarts.** Consume some search tokens, restart the test server, and verify the remaining count is preserved (database-backed).
- [ ] **Expired search rate limit entries are cleaned up.** Insert expired entries and trigger cleanup; verify they are deleted.

#### Exempt Endpoints

- [ ] **`GET /api/health` is not rate-limited.** Send requests beyond any limit and verify they always succeed.
- [ ] **`GET /api/feature-flags` is not rate-limited.** Same as above.
- [ ] **`GET /api/rate-limit` is not rate-limited.** Same as above.
- [ ] **OPTIONS (preflight) requests are not rate-limited.** Send OPTIONS requests beyond any limit and verify they succeed (handled by CORS middleware).

#### Conditional Requests

- [ ] **304 Not Modified responses do not consume rate limit tokens.** Send a request, capture the ETag, send a conditional request with `If-None-Match`, and verify `X-RateLimit-Remaining` does not decrement.

#### Rate Limit Status Endpoint

- [ ] **`GET /api/rate-limit` returns current status for authenticated user.** Verify response shape includes `rate` and `resources.search` objects with correct values.
- [ ] **`GET /api/rate-limit` returns current status for unauthenticated user.** Verify the response reflects the unauthenticated tier limits.
- [ ] **Values in `/api/rate-limit` response match values in response headers.** Make a regular API request, then call `/api/rate-limit`, and verify consistency.

#### Edge Cases

- [ ] **Expired token is treated as unauthenticated.** Send a request with an expired PAT and verify it is rate-limited under the IP-based unauthenticated tier.
- [ ] **Malformed `Authorization` header is treated as unauthenticated.** Send `Authorization: garbage` and verify IP-based limiting applies.
- [ ] **HEAD requests are rate-limited identically to GET.** Send HEAD requests and verify `X-RateLimit-Remaining` decrements.
- [ ] **Concurrent requests at the limit boundary.** Send `limit + 5` requests concurrently; verify exactly `limit` succeed and the rest return 429.
- [ ] **Very long `X-Forwarded-For` header (>1000 chars).** Verify the server does not crash and extracts the first IP correctly.
- [ ] **Rate limit with maximum configured value (e.g., 1,000,000/hr).** Verify the middleware accepts and enforces this limit without integer overflow.
- [ ] **Rate limit with minimum configured value (1/hr).** Verify exactly 1 request succeeds per window.

#### Environment Variable Configuration

- [ ] **Custom `CODEPLANE_RATE_LIMIT_AUTHENTICATED` is respected.** Start server with `CODEPLANE_RATE_LIMIT_AUTHENTICATED=10` and verify the limit is 10.
- [ ] **Custom `CODEPLANE_RATE_LIMIT_UNAUTHENTICATED` is respected.** Same pattern.
- [ ] **Custom `CODEPLANE_RATE_LIMIT_SEARCH` is respected.** Same pattern.
- [ ] **`CODEPLANE_RATE_LIMIT_ENABLED=false` disables all rate limiting.** Verify no 429s are returned and no rate limit headers are present.
- [ ] **Invalid env var value falls back to default.** Set `CODEPLANE_RATE_LIMIT_AUTHENTICATED=notanumber` and verify server starts with default (5000) and logs a warning.
- [ ] **Negative env var value falls back to default.** Set `CODEPLANE_RATE_LIMIT_AUTHENTICATED=-5` and verify default is used.

### CLI Integration Tests

- [ ] **`codeplane api rate-limit` displays current rate limit status.** Verify output includes general and search tier information.
- [ ] **CLI retries automatically on 429.** Trigger a rate limit, issue a CLI command, and verify it waits and retries successfully.
- [ ] **`--no-retry` flag prevents automatic retry.** Trigger a rate limit, issue a CLI command with `--no-retry`, and verify it fails immediately with an error message.
- [ ] **CLI displays rate limit warning on stderr.** Verify the warning message format matches spec.

### Playwright (Web UI) E2E Tests

- [ ] **Toast notification appears on 429 response.** Use Playwright to trigger a rate limit and verify the toast message appears with a countdown.
- [ ] **Toast notification disappears after retry succeeds.** Verify the toast clears once the retried request succeeds.
- [ ] **Web UI does not enter an infinite retry loop.** Verify that at most 1 automatic retry happens per 429 event.

### SSE / Streaming Tests

- [ ] **SSE connection establishment counts as 1 request.** Establish an SSE connection and verify `X-RateLimit-Remaining` decrements by 1.
- [ ] **Subsequent SSE events do not consume rate limit tokens.** After connection, receive multiple events and verify the rate limit counter does not decrement further.

### Multi-Instance / Scaling Tests

- [ ] **Two server instances give effectively 2x the limit.** (Documented known behavior.) Start two instances, exhaust the limit on one, and verify the other still allows requests. Document this as expected for in-memory stores.
