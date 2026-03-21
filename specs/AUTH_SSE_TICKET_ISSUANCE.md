# AUTH_SSE_TICKET_ISSUANCE

Specification for AUTH_SSE_TICKET_ISSUANCE.

## High-Level User POV

When a user is interacting with Codeplane's real-time features — watching workflow logs stream in, receiving live notifications, monitoring workspace status, or following an agent session — the application needs to open a persistent Server-Sent Events (SSE) connection to the server. Under the hood, the browser's native `EventSource` API cannot attach custom `Authorization` headers, which means the application would either need to fall back to a third-party polyfill library or find another way to securely authenticate these streaming connections.

SSE ticket issuance solves this transparently. When the user navigates to any real-time surface — workflow logs, notification inbox, workspace terminal, agent chat — the application silently exchanges the user's existing session or API token for a short-lived, single-use SSE ticket. This ticket is appended as a query parameter on the SSE connection URL. The server validates and consumes the ticket on connection, authenticating the stream without ever exposing the user's long-lived credentials in a URL.

From the user's perspective, none of this is visible. Real-time features simply work. There is no extra login step, no token prompt, no visible delay. If the user's session has expired or their token has been revoked, the real-time connection gracefully fails and the application guides them to re-authenticate. If the ticket itself expires before the SSE connection is established (for example, due to extreme network latency), the application silently requests a new one and retries.

For API consumers using personal access tokens — CLI tools, TUI clients, editor extensions, and third-party integrations — the ticket endpoint provides the same capability programmatically. A client exchanges its bearer token for a short-lived SSE ticket, then uses that ticket to open an `EventSource` connection without embedding the long-lived token in a URL where it could be logged by proxies, CDNs, or browser history.

This capability is the secure bridge between Codeplane's authenticated API world and its real-time streaming world. It ensures that every SSE connection is authenticated, every ticket is consumed exactly once, and no long-lived credentials are ever exposed in query strings, access logs, or intermediary infrastructure.

## Acceptance Criteria

### Definition of Done

The feature is complete when:

- An authenticated user or API client can exchange their existing credentials (session cookie or bearer token) for a short-lived, single-use SSE ticket.
- The SSE ticket can be used exactly once to authenticate an SSE connection by passing it as a query parameter.
- SSE endpoints accept the `ticket` query parameter as an alternative authentication method alongside existing bearer token and session cookie auth.
- Expired and consumed tickets are automatically cleaned up by the background scheduler.
- The web UI, CLI, TUI, desktop, and editor clients can use SSE tickets to establish authenticated event streams without requiring polyfill libraries for custom headers.
- The endpoint is protected by rate limiting to prevent ticket-farming abuse.
- All SSE ticket operations function identically in server mode, daemon mode, and desktop-embedded daemon mode.

### Functional Constraints

- [ ] `POST /api/auth/sse-ticket` MUST require authentication — only users with a valid session cookie or bearer token can request an SSE ticket.
- [ ] The endpoint MUST accept an empty JSON body or no body at all — no request parameters are required.
- [ ] Each request MUST return a unique, cryptographically random ticket value.
- [ ] The ticket MUST be a cryptographically secure random hex string of exactly 64 characters (32 bytes encoded as hex).
- [ ] The ticket MUST be stored server-side as a SHA-256 hash — the raw ticket value is never persisted.
- [ ] The ticket MUST be associated with the authenticated user's ID.
- [ ] The ticket MUST be persisted with an expiration timestamp set to exactly 30 seconds from creation.
- [ ] The response MUST be a JSON object with a single `ticket` field containing the raw ticket string.
- [ ] The HTTP status code MUST be `200` on successful ticket issuance.
- [ ] A ticket MUST NOT be consumable after its expiration timestamp has passed.
- [ ] A ticket MUST NOT be consumable more than once (single-use enforcement via atomic `UPDATE ... WHERE used_at IS NULL`).
- [ ] When an SSE endpoint receives a `ticket` query parameter, it MUST consume the ticket, resolve the associated user, and authenticate the SSE connection as that user.
- [ ] If ticket consumption fails (expired, already used, or invalid), the SSE endpoint MUST return `401 Unauthorized` and close the connection.
- [ ] Expired tickets MUST be automatically deleted by the background cleanup scheduler.
- [ ] Session-cookie-authenticated requests MUST be able to request SSE tickets (not only bearer-token-authenticated requests).
- [ ] The response MUST include `Cache-Control: no-store` to prevent ticket caching by proxies or browsers.

### Edge Cases

- [ ] Concurrent requests from the same user MUST each receive a distinct ticket — no two requests may return the same value.
- [ ] If the database is unreachable during ticket creation, the endpoint MUST return `500` with a structured error payload rather than hanging.
- [ ] If the random number generator fails, the endpoint MUST return `500`.
- [ ] If a ticket is consumed between the time it was issued and the time the SSE connection is established, the SSE endpoint MUST return `401`.
- [ ] If a user's account is deactivated between ticket issuance and ticket consumption, the SSE connection MUST be rejected with `401`.
- [ ] Extremely rapid sequential ticket requests (e.g., hundreds per second from one user) MUST be subject to rate limiting and return `429`.
- [ ] A `GET` request to `/api/auth/sse-ticket` MUST return `405 Method Not Allowed`.
- [ ] A ticket that has been issued but never consumed MUST expire and be cleaned up without manual intervention.
- [ ] The endpoint MUST function identically in server mode, daemon mode, and desktop-embedded daemon mode.
- [ ] If the user sends a request body with unexpected fields, those fields MUST be silently ignored — the endpoint always issues a ticket regardless of request body content.
- [ ] Network replay of a consumed ticket MUST fail — ticket consumption is atomic and idempotent.

### Boundary Constraints

- [ ] Ticket value: exactly 64 hexadecimal characters (`[0-9a-f]{64}`), representing 32 bytes of cryptographic randomness.
- [ ] Ticket hash (stored): exactly 64 hexadecimal characters (SHA-256 output).
- [ ] Ticket TTL: exactly 30 seconds. This is intentionally short — the ticket's only purpose is to bridge the gap between issuance and SSE connection establishment.
- [ ] Maximum outstanding tickets per user: 50. If a user has 50 unconsumed, unexpired tickets, subsequent issuance requests MUST still succeed (old tickets are not revoked, but the system must tolerate this volume).
- [ ] Maximum outstanding tickets globally: the system must tolerate at least 100,000 outstanding tickets without degradation (cleanup prevents unbounded growth).
- [ ] Response payload size: the JSON response `{"ticket":"<64chars>"}` is under 80 bytes — no pagination or streaming needed.

## Design

### API Shape

#### `POST /api/auth/sse-ticket`

**Purpose:** Exchange a valid session or API token for a short-lived, single-use SSE connection ticket.

**Authentication:** Required. Accepts session cookie (`codeplane_session`) or bearer token (`Authorization: Bearer codeplane_xxx`).

**Request:** No request body is required. If a body is provided, it is ignored.

**Success Response:**

```
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{
  "ticket": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| `401` | No valid session or token | `{"error": "authentication required"}` |
| `429` | Rate limit exceeded | `{"message": "rate limit exceeded"}` |
| `500` | Internal server error (DB failure, RNG failure) | `{"error": "failed to create sse ticket"}` |
| `405` | Wrong HTTP method (GET, PUT, DELETE) | `{"error": "method not allowed"}` |

**Headers:**
- `X-Request-Id` — present on all responses.
- `Cache-Control: no-store` — prevents ticket caching.
- Standard CORS headers applied by middleware.
- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` — rate limit status.

#### SSE Endpoint Ticket Consumption

All SSE endpoints accept an optional `ticket` query parameter:

```
GET /api/notifications?ticket=a1b2c3d4...
GET /api/repos/:owner/:repo/runs/:id/logs?ticket=a1b2c3d4...
GET /api/repos/:owner/:repo/workflows/runs/:id/events?ticket=a1b2c3d4...
GET /api/repos/:owner/:repo/workspaces/:id/stream?ticket=a1b2c3d4...
GET /api/repos/:owner/:repo/workspace/sessions/:id/stream?ticket=a1b2c3d4...
GET /api/repos/:owner/:repo/agent/sessions/:id/stream?ticket=a1b2c3d4...
GET /api/events/stream?ticket=a1b2c3d4...
```

**Consumption behavior:**
1. If a `ticket` query parameter is present, the server SHA-256 hashes it and attempts atomic consumption (`UPDATE ... SET used_at = NOW() WHERE ticket_hash = $1 AND used_at IS NULL AND expires_at > NOW()`).
2. If consumption succeeds, the resolved `user_id` is used to authenticate the SSE connection.
3. If consumption fails (invalid hash, already consumed, or expired), the server returns `401 Unauthorized` and closes the connection.
4. If both a `ticket` and an `Authorization` header are present, the ticket takes precedence.
5. If no `ticket` is present, existing auth mechanisms (bearer token, session cookie) are used as before.

### SDK Shape

The `AuthService` interface exposes SSE ticket management through:

```typescript
interface AuthService {
  createSSETicket(userId: number): Promise<string>;
  consumeSSETicket(rawTicket: string): Promise<{ userId: number } | null>;
}
```

**`createSSETicket` behavior:**
- Generates a 32-byte cryptographically random value and hex-encodes it to produce a 64-character string.
- SHA-256 hashes the raw ticket to produce the storage hash.
- Inserts the hash, user ID, and expiration (now + 30 seconds) into the `sse_tickets` table.
- Returns the raw ticket string on success.
- Throws an internal error if the insert fails.

**`consumeSSETicket` behavior:**
- SHA-256 hashes the provided raw ticket.
- Atomically updates the matching row (`used_at IS NULL AND expires_at > NOW()`).
- Returns the associated user ID on success, or `null` if the ticket is invalid, expired, or already consumed.

### Web UI Design

SSE ticket acquisition is **invisible to the user**. When the web application needs to open an SSE connection (navigating to workflow logs, notification inbox, workspace status, agent chat, or any real-time view):

1. The application calls `POST /api/auth/sse-ticket` using the user's existing session cookie.
2. On success, the application constructs the SSE URL with `?ticket=<value>` appended (or `&ticket=<value>` if other query parameters exist).
3. The application opens a native `EventSource` connection to the constructed URL.
4. If the ticket request fails, the UI displays a non-intrusive toast notification: "Unable to connect to live updates. Retrying…" and retries with exponential backoff (max 3 attempts).
5. If all retries fail, the UI falls back to polling behavior and displays: "Live updates unavailable. Updates will refresh periodically."
6. On SSE reconnection (e.g., after connection drop), the application requests a fresh ticket before reconnecting, since the previous ticket has already been consumed.

No ticket value, error detail, or internal state is ever displayed to the user.

### CLI Design

The CLI uses SSE tickets when streaming long-running operations:

- `codeplane run logs <id>` — streams workflow run logs
- `codeplane notification stream` — streams notifications
- `codeplane workspace status <id> --follow` — streams workspace state

For each streaming command:
1. The CLI exchanges its configured bearer token for an SSE ticket via `POST /api/auth/sse-ticket`.
2. The CLI opens an HTTP connection to the SSE endpoint with `?ticket=<value>`.
3. On reconnection, the CLI requests a fresh ticket and includes `Last-Event-ID`.

No new CLI command is exposed for SSE ticket management — ticket acquisition is an internal implementation detail of streaming commands.

### TUI Design

The TUI uses the same ticket acquisition pattern as the CLI for its streaming screens:

- Notification screen
- Workflow run detail / log viewer
- Workspace status
- Agent chat

The TUI library abstracts ticket acquisition into a shared streaming hook that handles ticket lifecycle, retry, and reconnection.

### Editor Integration Design

VS Code and Neovim extensions use SSE tickets when connecting to the daemon's SSE endpoints for:

- Notification streams
- Sync status updates
- Workspace status monitoring

The `editor-core` package provides a shared `createAuthenticatedEventSource` helper that handles ticket acquisition and SSE URL construction.

### Documentation

The following end-user documentation should exist:

- **SSE Authentication Guide:** Update `docs/api-reference/sse.mdx` to document the `ticket` query parameter as a first-class authentication method for SSE endpoints. Include examples showing both the ticket acquisition step (`POST /api/auth/sse-ticket`) and the subsequent SSE connection with `?ticket=...`. Note that the native browser `EventSource` API can now be used without polyfill libraries.
- **API Reference — `POST /api/auth/sse-ticket`:** Document the endpoint, authentication requirements, response shape, error codes, ticket TTL (30 seconds), and single-use constraint.
- **Migration Guide — EventSource:** A short section explaining that existing integrations using `@microsoft/fetch-event-source` or the `eventsource` npm package can optionally migrate to the native `EventSource` API by using SSE tickets. Existing bearer token auth continues to work for clients that support custom headers.
- **Security FAQ entry:** "Why does Codeplane use short-lived tickets for SSE connections?" — Explain that SSE tickets prevent long-lived tokens from appearing in URLs, proxy logs, and browser history. Note the 30-second TTL and single-use guarantee.

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| Anonymous / Unauthenticated | ❌ Denied — SSE tickets require an existing authenticated session |
| Authenticated User (any role) | ✅ Allowed — any authenticated user can request SSE tickets for their own streaming connections |
| Admin | ✅ Allowed |
| Read-Only | ✅ Allowed — read-only users still need live updates for notifications and workflow logs they can view |
| Service Account / PAT | ✅ Allowed — API consumers with valid tokens can exchange them for SSE tickets |
| OAuth2 Application Token | ✅ Allowed — OAuth2 clients can exchange tokens for SSE tickets, subject to scope requirements |

The SSE ticket inherits the identity of the requesting user but does NOT carry scope information. Scope enforcement happens at the SSE endpoint level based on the resolved user identity, not on the ticket itself.

### Rate Limiting

- **Per-user rate limit:** Maximum 60 ticket requests per minute per authenticated user. This accommodates multiple concurrent real-time views (each needing its own ticket) and reconnection scenarios, while blocking automated ticket farming.
- **Per-IP rate limit (fallback):** Maximum 120 ticket requests per minute per source IP. This provides a secondary abuse boundary for scenarios where many users share an IP (e.g., corporate NAT).
- **Global rate limit:** Maximum 3,000 ticket issuances per minute across all users. This prevents a distributed attack from overwhelming ticket storage.
- **429 response:** When rate limits are exceeded, return `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy

- The raw ticket value is not PII — it is a cryptographically random hex string with no user-identifying information.
- The `sse_tickets` table stores the ticket hash (not the raw value), the user ID, and timestamps. The user ID association is necessary for authentication but is protected by database access controls.
- Raw ticket values MUST NOT appear in server access logs at any level. The ticket hash prefix (first 8 characters) may appear at `DEBUG` level for incident correlation.
- Tickets appearing in SSE endpoint URLs will be visible in HTTP access logs. Server access log configuration SHOULD strip or redact the `ticket` query parameter from logged URLs to prevent credential leakage. If stripping is not feasible, the 30-second TTL and single-use constraint limit the exposure window.
- Expired tickets are hard-deleted (not soft-deleted) by the cleanup scheduler, ensuring no long-term data retention.
- Ticket values MUST be transmitted only over HTTPS in production. The `Cache-Control: no-store` response header prevents intermediate caching.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `SSETicketIssued` | Ticket successfully created and returned | `user_id`, `timestamp`, `client_type` (web/cli/tui/desktop/editor, derived from User-Agent), `auth_method` (session/pat/oauth2) |
| `SSETicketConsumed` | Ticket successfully consumed to authenticate an SSE connection | `user_id`, `ticket_age_ms` (time between issuance and consumption), `sse_endpoint` (normalized endpoint path), `timestamp` |
| `SSETicketExpired` | Ticket expired without being consumed (detected at cleanup time) | `user_id`, `timestamp`, `ticket_age_at_expiry_ms` |
| `SSETicketIssuanceFailed` | Ticket creation failed (500 error) | `error_category` (db_error, rng_error, unknown), `timestamp`, `user_id` |
| `SSETicketConsumptionFailed` | Ticket consumption rejected (invalid, expired, or already used) | `failure_reason` (invalid, expired, already_consumed), `sse_endpoint`, `timestamp` |
| `SSETicketRateLimited` | Request was rejected by rate limiter | `user_id`, `timestamp`, `rate_limit_type` (per_user, per_ip, global) |

### Funnel Metrics

| Metric | Definition | Healthy Signal |
|--------|------------|----------------|
| Ticket-to-Consumption Conversion Rate | % of issued tickets that are subsequently consumed by an SSE connection | > 85% (most tickets should be used immediately) |
| Ticket Expiration Rate | % of issued tickets that expire without being consumed | < 15% (low abandonment indicates healthy client flows) |
| Mean Time to Consumption | Average elapsed time between ticket issuance and consumption | < 2 seconds (tickets should be consumed almost instantly) |
| P99 Time to Consumption | 99th percentile time between issuance and consumption | < 10 seconds (even slow connections should succeed) |
| Native EventSource Adoption | % of SSE connections using ticket auth vs. polyfill-based bearer auth | Trending upward as clients migrate to ticket-based auth |
| SSE Connection Success Rate | % of SSE connection attempts (with ticket) that result in a successful stream | > 99% |

### Success Indicators

- SSE connection reliability improves (fewer auth-related connection failures).
- Third-party integration authors report easier SSE integration using native `EventSource`.
- Ticket expiration rate remains below 15%, indicating clients are efficiently consuming tickets.
- Zero instances of ticket reuse (single-use enforcement holds) in production.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| SSE ticket issued | `DEBUG` | `request_id`, `user_id`, `ticket_hash_prefix` (first 8 chars of hash), `expires_at`, `auth_method` | Every successful ticket creation |
| SSE ticket consumed | `DEBUG` | `request_id`, `user_id`, `ticket_hash_prefix`, `ticket_age_ms`, `sse_endpoint` | Every successful ticket consumption |
| SSE ticket consumption failed | `WARN` | `request_id`, `ticket_hash_prefix`, `failure_reason` (invalid/expired/already_consumed), `sse_endpoint` | Every failed consumption attempt |
| SSE ticket creation failed | `ERROR` | `request_id`, `user_id`, `error_message`, `error_type` | DB insert failure or RNG failure |
| Rate limit triggered on ticket endpoint | `WARN` | `request_id`, `user_id`, `limit_type`, `retry_after_seconds` | Rate limit hit |
| Expired SSE tickets cleaned up | `INFO` | `deleted_count`, `sweep_duration_ms` | Each cleanup sweep that deletes tickets |
| Cleanup sweep for SSE tickets failed | `ERROR` | `error_message`, `job_name` ("sse tickets") | Cleanup job error |

**Rules:**
- NEVER log the raw ticket value at any log level.
- Log the ticket hash prefix (first 8 characters of the SHA-256 hash) at `DEBUG` level only, for correlation during incident investigation.
- Use structured JSON logging with consistent field names.
- The `ticket` query parameter in SSE endpoint URLs SHOULD be redacted in HTTP access logs.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_sse_ticket_issued_total` | Counter | `status` (success, error), `auth_method` (session, pat, oauth2) | Total SSE ticket issuance attempts |
| `codeplane_sse_ticket_issuance_duration_seconds` | Histogram | — | Time to generate and persist a ticket (buckets: 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5) |
| `codeplane_sse_ticket_consumed_total` | Counter | `status` (success, invalid, expired, already_consumed), `endpoint` | Total SSE ticket consumption attempts |
| `codeplane_sse_ticket_consumption_duration_seconds` | Histogram | — | Time to consume a ticket (buckets: 0.001, 0.005, 0.01, 0.025, 0.05, 0.1) |
| `codeplane_sse_ticket_time_to_consumption_seconds` | Histogram | — | Elapsed time between issuance and consumption (buckets: 0.1, 0.5, 1, 2, 5, 10, 15, 25, 30) |
| `codeplane_sse_ticket_rate_limited_total` | Counter | `limit_type` (per_user, per_ip, global) | Total rate-limited ticket requests |
| `codeplane_sse_tickets_outstanding` | Gauge | — | Current count of unconsumed, unexpired SSE tickets |
| `codeplane_sse_ticket_cleanup_deleted_total` | Counter | — | Total tickets deleted by cleanup sweeps |
| `codeplane_sse_ticket_cleanup_errors_total` | Counter | — | Total cleanup sweep failures |

### Alerts

#### Alert: `SSETicketIssuanceErrorRateHigh`

**Condition:** `rate(codeplane_sse_ticket_issued_total{status="error"}[5m]) / rate(codeplane_sse_ticket_issued_total[5m]) > 0.05` for 5 minutes.

**Severity:** Critical

**Runbook:**
1. Check server logs for `SSE ticket creation failed` entries — examine the `error_type` field.
2. If `error_type` is `db_error`: verify database connectivity using health endpoint (`GET /api/health`). Check for table locks on `sse_tickets`. Check disk space on the database server. Verify the `sse_tickets` table exists and has the correct schema.
3. If `error_type` is `rng_error`: this indicates a system-level entropy issue. Check `/dev/urandom` availability. Restart the server process to reinitialize the crypto subsystem.
4. Check if the error rate correlates with a recent deployment — rollback if necessary.
5. Verify the cleanup scheduler is running (stale tickets could cause storage pressure).
6. **Escalation:** If the issue persists after 15 minutes, page the on-call database engineer.

#### Alert: `SSETicketConsumptionFailureRateHigh`

**Condition:** `rate(codeplane_sse_ticket_consumed_total{status!="success"}[5m]) / rate(codeplane_sse_ticket_consumed_total[5m]) > 0.20` for 5 minutes.

**Severity:** Warning

**Runbook:**
1. Check the `status` label distribution — determine whether failures are primarily `expired`, `invalid`, or `already_consumed`.
2. If mostly `expired`: investigate network latency between clients and the server. Check if the 30-second TTL is sufficient — if P99 client latency exceeds 10 seconds, consider increasing the TTL.
3. If mostly `already_consumed`: investigate whether clients are incorrectly reusing tickets across reconnections. Check for client-side bugs in the ticket acquisition flow.
4. If mostly `invalid`: investigate whether tickets are being corrupted in transit (encoding issues, URL truncation by proxies). Check for MITM or replay attack patterns.
5. Check `codeplane_sse_ticket_time_to_consumption_seconds` histogram — if tickets are being consumed near the 30-second boundary, the TTL may need adjustment.

#### Alert: `SSETicketIssuanceLatencyHigh`

**Condition:** `histogram_quantile(0.99, rate(codeplane_sse_ticket_issuance_duration_seconds_bucket[5m])) > 0.25` for 5 minutes.

**Severity:** Warning

**Runbook:**
1. Check database query performance — look at the `INSERT INTO sse_tickets` query latency.
2. Check for table bloat on `sse_tickets` — run `pg_stat_user_tables` to check dead tuple count.
3. Verify the cleanup scheduler is running — if expired tickets are not being deleted, the table may be growing unbounded.
4. Check overall database load — ticket issuance contention may be a symptom of broader database pressure.
5. Check if an index exists on `ticket_hash` — consumption queries require fast hash lookups.

#### Alert: `SSETicketOutstandingCountHigh`

**Condition:** `codeplane_sse_tickets_outstanding > 50000` for 15 minutes.

**Severity:** Warning

**Runbook:**
1. Check if the cleanup scheduler is running — look for recent cleanup log entries for "sse tickets".
2. If cleanup is not running, check server bootstrap logs for scheduler initialization errors.
3. If cleanup is running but tickets are accumulating, verify that `expires_at` values are correct (should be ~30 seconds from creation, not accidentally set to far-future dates).
4. Check `codeplane_sse_ticket_rate_limited_total` to see if rate limiting is engaged — high outstanding counts may indicate a ticket-farming attack.
5. As a remediation, manually delete expired tickets: `DELETE FROM sse_tickets WHERE expires_at < NOW()`.

#### Alert: `SSETicketCleanupFailing`

**Condition:** `increase(codeplane_sse_ticket_cleanup_errors_total[1h]) > 3`.

**Severity:** Warning

**Runbook:**
1. Check server logs for cleanup sweep errors with `job_name: "sse tickets"`.
2. Verify database connectivity and permissions — the cleanup job needs DELETE access on `sse_tickets`.
3. Check for long-running transactions that may be blocking the `DELETE` query.
4. If the cleanup job is consistently failing, restart the server process to reinitialize the cleanup scheduler.
5. Manually run the cleanup query to prevent table growth while investigating.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|------------|-------------|----------|----------|
| Unauthenticated request | 401 | Returns `{"error": "authentication required"}` | Client re-authenticates |
| Database unreachable during creation | 500 | Returns `{"error": "failed to create sse ticket"}` | Automatic retry by client; DB reconnection by pool |
| RNG failure | 500 | Returns `{"error": "failed to create sse ticket"}` | Server restart to reinitialize crypto subsystem |
| Per-user rate limit | 429 | Returns rate limit error with `Retry-After` header | Client waits and retries |
| Per-IP rate limit | 429 | Returns rate limit error with `Retry-After` header | Client waits and retries |
| Global rate limit | 429 | Returns rate limit error with `Retry-After` header | Client waits; operator investigates potential abuse |
| Table does not exist | 500 | Returns `{"error": "failed to create sse ticket"}` | Run database migrations |
| Unique constraint violation on hash | 500 (extremely unlikely with 32 bytes of randomness) | Returns error | Automatic retry generates a new random value |
| Ticket expired before consumption | 401 on SSE endpoint | SSE connection rejected | Client requests a new ticket |
| Ticket already consumed | 401 on SSE endpoint | SSE connection rejected | Client requests a new ticket |
| Invalid ticket value (not in DB) | 401 on SSE endpoint | SSE connection rejected | Client re-authenticates and requests a new ticket |
| User account deactivated after ticket issued | 401 on SSE endpoint | SSE connection rejected after user lookup fails | Client sees auth failure |

## Verification

### API Integration Tests — Ticket Issuance

- [ ] **Happy path — authenticated user gets a ticket:** Send `POST /api/auth/sse-ticket` with a valid bearer token. Assert: status `200`, response body has a `ticket` field, ticket is a 64-character lowercase hex string matching `^[0-9a-f]{64}$`.
- [ ] **Happy path — session-cookie-authenticated user gets a ticket:** Send `POST /api/auth/sse-ticket` with a valid `codeplane_session` cookie (no Authorization header). Assert: status `200`, valid ticket returned.
- [ ] **Happy path — OAuth2 token user gets a ticket:** Send `POST /api/auth/sse-ticket` with a valid `codeplane_oat_` prefixed token. Assert: status `200`, valid ticket returned.
- [ ] **Unauthenticated request returns 401:** Send `POST /api/auth/sse-ticket` with no Authorization header and no session cookie. Assert status `401`.
- [ ] **Invalid token returns 401:** Send `POST /api/auth/sse-ticket` with `Authorization: Bearer invalid_token`. Assert status `401`.
- [ ] **Expired session cookie returns 401:** Send `POST /api/auth/sse-ticket` with an expired session cookie. Assert status `401`.
- [ ] **Revoked token returns 401:** Revoke a PAT, then send `POST /api/auth/sse-ticket` with the revoked token. Assert status `401`.
- [ ] **Ticket uniqueness — two sequential requests return different tickets:** Issue two `POST /api/auth/sse-ticket` requests with the same token. Assert the returned ticket values are not equal.
- [ ] **Ticket uniqueness — 50 concurrent requests all return distinct tickets:** Issue 50 parallel `POST /api/auth/sse-ticket` requests. Collect all ticket values and assert the set has exactly 50 unique entries.
- [ ] **Response content type is JSON:** Assert the `Content-Type` header is `application/json` or `application/json; charset=utf-8`.
- [ ] **Response includes request ID:** Assert the `X-Request-Id` header is present and non-empty.
- [ ] **Response includes Cache-Control no-store:** Assert the `Cache-Control` header contains `no-store`.
- [ ] **GET method returns 405:** Send `GET /api/auth/sse-ticket` and assert status `405`.
- [ ] **PUT method returns 405:** Send `PUT /api/auth/sse-ticket` and assert status `405`.
- [ ] **DELETE method returns 405:** Send `DELETE /api/auth/sse-ticket` and assert status `405`.
- [ ] **Response body has exactly one field:** Parse the response JSON and assert it has exactly one key: `ticket`.
- [ ] **Ticket value length is exactly 64:** Assert `response.ticket.length === 64`.
- [ ] **Ticket value contains only valid hex characters:** Assert `response.ticket` matches `^[0-9a-f]+$`.
- [ ] **CORS headers are present:** Assert `Access-Control-Allow-Origin` is present on the response.
- [ ] **Empty body is accepted:** Send `POST /api/auth/sse-ticket` with `Content-Length: 0` and no body. Assert `200`.
- [ ] **Unexpected body fields are ignored:** Send `POST /api/auth/sse-ticket` with body `{"foo": "bar"}`. Assert `200` with a valid ticket.
- [ ] **Rate limiting — exceeding per-user limit returns 429:** Send more than 60 requests per minute with the same token. Assert that subsequent requests receive `429`.
- [ ] **Rate limiting — 429 response includes Retry-After header:** When `429` is returned, assert the `Retry-After` header is present and contains a positive integer.
- [ ] **Rate limit headers are present on success:** Assert `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers are present on `200` responses.

### Ticket Consumption Integration Tests

- [ ] **Valid ticket authenticates SSE connection:** Request a ticket, then connect to `GET /api/notifications?ticket=<value>`. Assert the SSE connection is established (receives keep-alive or events).
- [ ] **Consumed ticket cannot be reused:** Request a ticket, consume it by connecting to an SSE endpoint, disconnect, then attempt to connect to the same SSE endpoint with the same ticket. Assert `401`.
- [ ] **Expired ticket is rejected:** Request a ticket, wait 31 seconds (or manipulate `expires_at` in a test fixture), then attempt to connect with it. Assert `401`.
- [ ] **Invalid ticket value is rejected:** Connect to `GET /api/notifications?ticket=0000000000000000000000000000000000000000000000000000000000000000`. Assert `401`.
- [ ] **Malformed ticket value is rejected:** Connect to `GET /api/notifications?ticket=not-a-hex-string`. Assert `401`.
- [ ] **Empty ticket parameter is rejected:** Connect to `GET /api/notifications?ticket=`. Assert `401`.
- [ ] **Ticket works on workflow log SSE endpoint:** Request a ticket, connect to `GET /api/repos/:owner/:repo/runs/:id/logs?ticket=<value>`. Assert SSE connection established.
- [ ] **Ticket works on workspace status SSE endpoint:** Request a ticket, connect to `GET /api/repos/:owner/:repo/workspaces/:id/stream?ticket=<value>`. Assert SSE connection established.
- [ ] **Ticket works on workflow events SSE endpoint:** Request a ticket, connect to `GET /api/repos/:owner/:repo/workflows/runs/:id/events?ticket=<value>`. Assert SSE connection established.
- [ ] **Ticket works on unified event stream:** Request a ticket, connect to `GET /api/events/stream?ticket=<value>`. Assert SSE connection established.
- [ ] **Ticket auth resolves correct user identity:** Request a ticket as user A, consume it on a notification SSE endpoint, and verify that user A's notifications (not user B's) are streamed.
- [ ] **Ticket plus Authorization header — ticket wins:** Request a ticket as user A. Connect to an SSE endpoint with both `?ticket=<userA_ticket>` and `Authorization: Bearer <userB_token>`. Assert the stream is authenticated as user A.
- [ ] **Ticket from one server instance works on another (shared DB):** In a multi-instance test setup, request a ticket from instance A and consume it on instance B. Assert success.
- [ ] **Maximum valid ticket size (64 hex chars) works:** Request a ticket (which should be exactly 64 chars), use it to connect. Assert success.
- [ ] **Ticket value of 65 characters is rejected:** Send a ticket that is 65 hex characters. Assert `401`.
- [ ] **Ticket value of 63 characters is rejected:** Send a ticket that is 63 hex characters. Assert `401`.

### Cleanup Integration Tests

- [ ] **Expired tickets are deleted by cleanup sweep:** Create a ticket with a past `expires_at`, trigger the cleanup sweep, and assert the ticket row has been deleted from the database.
- [ ] **Non-expired tickets survive cleanup sweep:** Create a ticket with a future `expires_at`, trigger the cleanup sweep, and assert the ticket row still exists.
- [ ] **Consumed but non-expired tickets survive cleanup:** Create and consume a ticket, trigger cleanup before expiry, and assert the row still exists (cleanup is based on `expires_at`, not `used_at`).
- [ ] **Bulk cleanup handles thousands of expired tickets:** Create 5,000 tickets with past expiration, trigger cleanup, and assert all are deleted within a reasonable time (< 5 seconds).

### End-to-End Tests (Playwright)

- [ ] **Web notification stream uses ticket auth:** Navigate to the notification inbox while authenticated. Intercept network requests and assert: (1) a `POST /api/auth/sse-ticket` request was made with status `200`, (2) a subsequent SSE connection was opened with `?ticket=...` in the URL.
- [ ] **Web workflow log view uses ticket auth:** Navigate to a workflow run's log page. Intercept network requests and assert ticket acquisition and SSE connection with ticket parameter.
- [ ] **Web workspace status view uses ticket auth:** Navigate to a workspace detail page. Intercept network and assert ticket-authenticated SSE connection.
- [ ] **Failed ticket issuance shows graceful error:** Mock `POST /api/auth/sse-ticket` to return `500`. Navigate to a real-time view and assert a user-friendly fallback message is displayed (e.g., "Live updates unavailable").
- [ ] **Ticket-based SSE reconnection acquires fresh ticket:** Open a real-time view, disconnect the SSE stream (mock server close), and assert the client acquires a new ticket before reconnecting.
- [ ] **Unauthenticated user navigating to real-time view is redirected to login:** Sign out, navigate directly to a workflow log URL, and assert redirect to login page (no ticket request should be made).

### CLI End-to-End Tests

- [ ] **`codeplane run logs` streams via ticket auth:** Run `codeplane run logs <id>` with a valid config. Assert: (1) the CLI acquires a ticket before opening the SSE stream, (2) log output is streamed to stdout.
- [ ] **`codeplane run logs` with expired/revoked token fails gracefully:** Revoke the configured token, run `codeplane run logs <id>`, and assert a clear error message about authentication failure (exit code non-zero).
- [ ] **`codeplane notification stream` uses ticket auth:** Run `codeplane notification stream` and assert ticket acquisition and SSE streaming.

### API Tests — SSE Endpoint Auth Fallback

- [ ] **SSE endpoint without ticket uses bearer token:** Connect to `GET /api/notifications` with `Authorization: Bearer <valid_token>` and no ticket parameter. Assert SSE connection succeeds (backward compatibility).
- [ ] **SSE endpoint without ticket uses session cookie:** Connect to `GET /api/notifications` with a valid `codeplane_session` cookie and no ticket parameter. Assert SSE connection succeeds (backward compatibility).
- [ ] **SSE endpoint with no auth at all returns 401:** Connect to `GET /api/notifications` with no ticket, no bearer token, and no session cookie. Assert `401`.

### Load and Boundary Tests

- [ ] **100 concurrent ticket issuance requests complete within 2 seconds:** Issue 100 parallel `POST /api/auth/sse-ticket` requests. Assert all complete within 2 seconds with status `200`.
- [ ] **100 concurrent ticket consumptions (distinct tickets) all succeed:** Issue 100 tickets, then attempt to consume all 100 concurrently on SSE endpoints. Assert all connections are established.
- [ ] **1000 sequential ticket requests do not cause data corruption:** Issue 1000 sequential requests and verify all returned tickets are valid 64-char hex strings and all are unique.
- [ ] **Ticket endpoint with oversized headers rejects gracefully:** Send a request with a 64KB custom header. Assert `431` or `400` rather than server crash.
- [ ] **Ticket endpoint with unexpected query parameters still succeeds:** Send `POST /api/auth/sse-ticket?foo=bar`. Assert `200`.
- [ ] **Full lifecycle under load — issue and consume 500 tickets concurrently:** Issue 500 tickets in parallel, then immediately consume each on an SSE endpoint. Assert > 95% success rate (some may expire under extreme load, but the vast majority should succeed).
