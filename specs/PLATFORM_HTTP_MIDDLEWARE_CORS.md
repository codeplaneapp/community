# PLATFORM_HTTP_MIDDLEWARE_CORS

Specification for PLATFORM_HTTP_MIDDLEWARE_CORS.

## High-Level User POV

Every HTTP interaction between a Codeplane client and the Codeplane API server is governed by a cross-origin resource sharing (CORS) policy. This policy determines which browser-based applications — the Codeplane web UI, third-party browser extensions, custom dashboards, or external integrations — are permitted to make requests to the Codeplane API from a different origin than the one hosting the server.

For self-hosted Codeplane administrators, the CORS middleware ensures that the web UI can communicate with the API server even when the frontend and backend are served from different domains, ports, or protocols. When a user opens the Codeplane web application in their browser, the browser enforces CORS checks before allowing JavaScript to read API responses. The CORS middleware handles these checks transparently: it responds to preflight requests automatically, attaches the necessary access-control headers to all API responses, and ensures that authentication credentials such as session cookies and bearer tokens can be transmitted across origins when configured.

For developers building integrations, the CORS policy communicates exactly which origins are trusted, which HTTP methods and headers are allowed, and whether credentialed requests are supported. If a developer's browser-based application is not on the allowed origin list, the browser will block the response — not the server — providing a clear signal about origin trust boundaries.

Non-browser clients — the CLI, TUI, desktop app, editor extensions, and server-to-server integrations — are not subject to CORS enforcement. CORS is purely a browser-mediated security mechanism. These clients communicate with the API using bearer tokens or direct HTTP calls without origin restrictions.

The CORS middleware runs early in the middleware stack (position 3 of 6), ensuring that preflight OPTIONS requests are answered quickly without requiring authentication, rate limit accounting, or content-type validation. This ordering is critical: if authentication ran before CORS, legitimate browser-initiated preflight requests would be rejected with 401 errors before the browser could even attempt the real request.

## Acceptance Criteria

### Core CORS Behavior

- [ ] The CORS middleware MUST be applied unconditionally to every HTTP route mounted on the Codeplane API server, including health, auth, feature flags, and all resource endpoints.
- [ ] The middleware MUST respond to preflight `OPTIONS` requests with a `204 No Content` status code and the appropriate CORS headers, without forwarding the request to downstream route handlers.
- [ ] The `Access-Control-Allow-Origin` header MUST be present on every API response (both preflight and actual requests).
- [ ] When the server is configured with a wildcard origin (`*`), the `Access-Control-Allow-Origin` header value MUST be `*`.
- [ ] When the server is configured with specific origins, the `Access-Control-Allow-Origin` header MUST echo the request's `Origin` header value if it matches an allowed origin, and MUST NOT include the header (or return `null`) if the origin is not allowed.
- [ ] When specific origins are configured (not wildcard), the `Vary: Origin` header MUST be included on all responses to ensure intermediary caches differentiate responses by origin.

### Allowed Methods

- [ ] The CORS middleware MUST advertise the following HTTP methods in the `Access-Control-Allow-Methods` header during preflight responses: `GET`, `HEAD`, `PUT`, `POST`, `DELETE`, `PATCH`.
- [ ] The `OPTIONS` method itself MUST be handled by the middleware and does not need to be listed in `Access-Control-Allow-Methods`.
- [ ] No additional methods beyond the six listed above should be advertised unless explicitly configured.

### Allowed Headers

- [ ] When no explicit `allowHeaders` are configured, the middleware MUST reflect the browser's `Access-Control-Request-Headers` value back in the `Access-Control-Allow-Headers` response header during preflight requests.
- [ ] When explicit `allowHeaders` are configured, only those headers MUST be advertised in the `Access-Control-Allow-Headers` response.
- [ ] The `Vary: Access-Control-Request-Headers` header MUST be appended to preflight responses when allow-headers are being reflected or explicitly set.

### Exposed Headers

- [ ] The CORS middleware MUST expose the following headers to browser JavaScript via `Access-Control-Expose-Headers`: `X-Request-Id`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.
- [ ] Without `Access-Control-Expose-Headers`, browsers restrict JavaScript access to only the CORS-safelisted response headers. Codeplane's rate-limit and request-tracing headers MUST be readable by browser clients.

### Credentials Support

- [ ] When the server is configured with specific (non-wildcard) origins, the CORS middleware MUST set `Access-Control-Allow-Credentials: true` so that browsers send session cookies and `Authorization` headers on cross-origin requests.
- [ ] When the origin is configured as wildcard (`*`), the `Access-Control-Allow-Credentials` header MUST NOT be set, because the CORS specification forbids `credentials: true` with a wildcard origin.
- [ ] When credentials are enabled and specific origins are configured, the `Access-Control-Allow-Origin` header MUST echo the specific origin (not `*`), per the CORS specification.

### Preflight Cache

- [ ] The CORS middleware SHOULD set the `Access-Control-Max-Age` header on preflight responses to reduce redundant preflight requests. A value of `600` (10 minutes) is recommended.
- [ ] The `Access-Control-Max-Age` header MUST only be present on preflight (`OPTIONS`) responses, not on regular responses.

### Middleware Ordering

- [ ] The CORS middleware MUST execute at position 3 in the middleware stack: after request ID and logger, but before rate limiting, JSON content-type enforcement, and auth context loading.
- [ ] Preflight `OPTIONS` requests handled by the CORS middleware MUST NOT increment rate-limit counters.
- [ ] Preflight `OPTIONS` requests handled by the CORS middleware MUST NOT trigger auth context loading.
- [ ] Preflight `OPTIONS` requests handled by the CORS middleware MUST NOT trigger JSON content-type enforcement.
- [ ] Preflight `OPTIONS` requests MUST still receive the `X-Request-Id` header.
- [ ] Preflight `OPTIONS` requests MUST still be logged by the structured logger.

### Configuration

- [ ] The CORS middleware MUST be configurable via the `CODEPLANE_CORS_ORIGIN` environment variable.
- [ ] When `CODEPLANE_CORS_ORIGIN` is unset or empty, the default origin MUST be `*` (wildcard).
- [ ] When `CODEPLANE_CORS_ORIGIN` is set to a single origin, only that origin MUST be allowed.
- [ ] When `CODEPLANE_CORS_ORIGIN` is set to a comma-separated list, each origin in the list MUST be allowed.
- [ ] Origins MUST include the scheme (`http://` or `https://`) — origins without a scheme MUST be rejected at startup.
- [ ] Origins MUST NOT include trailing slashes — trailing slashes MUST be normalized.
- [ ] The CORS middleware MUST NOT support regex-based origin matching.

### Edge Cases

- [ ] A request with no `Origin` header MUST be passed through without blocking.
- [ ] A request with a non-matching `Origin` header MUST NOT receive the `Access-Control-Allow-Origin` header.
- [ ] An `OPTIONS` request to a non-existent route MUST still receive CORS headers.
- [ ] SSE streaming responses MUST include CORS headers.
- [ ] On preflight responses, `Content-Type` and `Content-Length` MUST be removed.
- [ ] The `null` origin MUST NOT be allowed as a valid origin.

### Definition of Done

- [ ] The CORS middleware is applied globally and handles preflight and actual requests correctly.
- [ ] Configuration via `CODEPLANE_CORS_ORIGIN` works for wildcard, single-origin, and multi-origin modes.
- [ ] Credentials and exposed headers are properly set based on origin mode.
- [ ] All middleware ordering constraints are satisfied.
- [ ] All tests in the verification section pass.
- [ ] Documentation is updated to describe CORS configuration for self-hosted administrators.

## Design

### API Shape

The CORS middleware does not expose any dedicated API endpoint. It is a cross-cutting concern that modifies response headers on every API response.

**Preflight Response (OPTIONS request from browser):**

```
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://codeplane.example.com
Access-Control-Allow-Methods: GET,HEAD,PUT,POST,DELETE,PATCH
Access-Control-Allow-Headers: Authorization,Content-Type,X-Request-Id
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 600
Access-Control-Expose-Headers: X-Request-Id,X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset,Retry-After
Vary: Origin, Access-Control-Request-Headers
X-Request-Id: m1abc-1
```

**Actual Response (non-OPTIONS request):**

```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://codeplane.example.com
Access-Control-Allow-Credentials: true
Access-Control-Expose-Headers: X-Request-Id,X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset,Retry-After
Vary: Origin
Content-Type: application/json
X-Request-Id: m1abc-2
```

**Wildcard Mode Response:**

```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Access-Control-Expose-Headers: X-Request-Id,X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset,Retry-After
Content-Type: application/json
X-Request-Id: m1abc-3
```

In wildcard mode, `Access-Control-Allow-Credentials` is absent, `Vary: Origin` is absent, and the origin value is always `*`.

**Disallowed Origin Response:**

When a browser sends an `Origin` header that does not match any configured origin, the response does not include `Access-Control-Allow-Origin`. The server still processes the request — CORS is a browser-enforced mechanism — but the browser will prevent JavaScript from reading the response.

### SDK Shape

The CORS middleware is configured and mounted by the server application. No SDK-level abstraction is necessary because CORS is purely an HTTP transport concern. The `@codeplane/sdk` package does not need to export CORS-related types or functions. The CORS policy is defined and applied exclusively in `apps/server/src/index.ts` using Hono's built-in `cors()` middleware factory.

### Web UI Design

**Transparent Operation:** When CORS is correctly configured, the web UI operates without any visible CORS-related artifacts. API calls succeed, session cookies are sent, and all response headers — including rate-limit counters and request IDs — are readable by the UI's JavaScript.

**Error State — CORS Misconfiguration:** When the Codeplane API is served from a different origin than the web UI and CORS is misconfigured (e.g., the UI origin is not in the allowed list):
- All API calls fail silently from the browser's perspective (the browser blocks the response).
- The browser console shows a CORS error message.
- The web UI SHOULD display a connection-error state that hints at CORS misconfiguration when API calls fail with network errors and no response body is available.

**SSE Streaming:** The notification stream, workflow log stream, workflow event stream, workspace status stream, and workspace session status stream all use `EventSource` or `fetch`-based streaming from the browser. These connections are subject to CORS. The `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials` headers MUST be present on SSE responses for cross-origin streaming to work.

### CLI Command

The CLI is not subject to CORS enforcement and does not need any CORS-specific commands or flags. When the CLI is used in `--debug` or `--verbose` mode, it MAY log the `Access-Control-Allow-Origin` header value as part of response header debugging output.

### Admin Configuration UI

The admin panel SHOULD include a read-only display of the current CORS configuration under the server settings or health section showing:
- **Allowed Origins:** The current value of `CODEPLANE_CORS_ORIGIN` (or "All origins (wildcard)" if unset).
- **Credentials Allowed:** Yes/No based on whether the origin mode supports credentials.
- **Preflight Cache Duration:** The `Access-Control-Max-Age` value.

This is informational only — CORS configuration changes require restarting the server with updated environment variables.

### Documentation

The following documentation MUST be written for end users:

**Self-Hosting Guide — CORS Configuration Section:**

1. **When CORS configuration is needed:** Explain that CORS configuration is only necessary when the Codeplane web UI and API server are served from different origins (different domains, ports, or protocols).
2. **Setting allowed origins:** Document the `CODEPLANE_CORS_ORIGIN` environment variable with examples for single origin, multiple origins, and wildcard (default).
3. **Security recommendation:** Strongly recommend that production deployments set explicit origins rather than using the wildcard, especially when session-cookie authentication is used.
4. **Troubleshooting guide:** How to diagnose CORS errors including checking browser developer console, verifying headers with `curl -I`, and common misconfiguration patterns (trailing slashes, missing scheme, wrong port).
5. **Integration guide:** Non-browser clients (CLI, TUI, desktop, editors, server-to-server) are not affected by CORS and do not need any special configuration.

## Permissions & Security

### Authorization Roles

The CORS middleware operates at the transport layer, before authentication. It does not check or enforce authorization roles. All roles — Owner, Admin, Member, Read-Only, Anonymous, and unauthenticated — receive CORS headers on every response.

- **Anonymous / Unauthenticated:** CORS preflight requests are always unauthenticated (browsers do not send credentials on preflight). The middleware MUST allow these requests unconditionally.
- **All authenticated roles:** CORS headers are applied identically regardless of the user's role.
- **Admin (CORS configuration):** Only server administrators with access to the deployment environment can change the CORS configuration via `CODEPLANE_CORS_ORIGIN`. This is not an API-level permission — it requires environment-variable access.

### Rate Limiting

- Preflight `OPTIONS` requests MUST NOT count against the rate limit. Because the CORS middleware returns `204` before the rate-limit middleware runs, this is satisfied by the middleware ordering.
- The actual requests that follow preflights ARE subject to normal rate limiting (120 requests/minute per identity).
- There is no separate rate limit for CORS specifically.

### Data Privacy and PII Exposure

- The `Access-Control-Allow-Origin` header echoes back the request's `Origin` header. This is not PII.
- The CORS middleware MUST NOT log the `Origin` header at a level higher than `DEBUG`.
- The CORS middleware MUST NOT expose the server's internal allowed-origin configuration in error messages or response bodies.
- The `Access-Control-Expose-Headers` list MUST NOT include sensitive headers such as `Set-Cookie`.

### Security Considerations

- **Wildcard with credentials is forbidden:** The middleware MUST NOT set both `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Credentials: true`.
- **Origin validation must be exact-match:** The middleware MUST NOT use substring matching, regex, or prefix matching. Only exact scheme+host+port matches are allowed.
- **Null origin must not be allowed:** The middleware MUST NOT allow `Origin: null` as a valid origin.
- **CORS does not replace authentication:** All API endpoints MUST continue to enforce authentication and authorization independently of CORS.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `cors.preflight_handled` | An `OPTIONS` request is handled by the CORS middleware | `origin`, `requested_method`, `requested_headers`, `allowed` (boolean), `response_time_ms` |
| `cors.origin_rejected` | A request arrives with an `Origin` header that does not match any allowed origin | `origin`, `method`, `path`, `user_agent` |
| `cors.config_loaded` | CORS configuration is read at server startup | `mode` (`wildcard` | `single` | `multi`), `origin_count`, `credentials_enabled`, `max_age` |

### Properties on All Events

- `server_instance_id` — unique ID for the server process
- `timestamp` — ISO-8601 event timestamp

### Funnel Metrics and Success Indicators

- **Preflight-to-actual request ratio:** Ratio of `OPTIONS` requests to non-`OPTIONS` requests from browser user agents. A ratio significantly greater than 1:1 may indicate misconfigured `Access-Control-Max-Age` (preflight cache not working) or a web client making many unique header combinations.
- **Origin rejection rate:** Percentage of `cors.origin_rejected` events relative to total browser-origin requests. A sudden spike indicates either a deployment misconfiguration or an unauthorized integration attempt.
- **Zero-rejection steady state:** In a correctly configured deployment, the `cors.origin_rejected` event count should be near zero. Any non-zero count warrants investigation.
- **Preflight response latency (p99):** Should remain under 5ms since preflight requests do not hit the database or application logic. If p99 exceeds 10ms, investigate middleware overhead.

## Observability

### Logging Requirements

| Log Entry | Level | Structured Context | When |
|---|---|---|---|
| CORS configuration loaded | `INFO` | `mode`, `origin_count`, `credentials_enabled`, `max_age` | Server startup |
| CORS origin rejected | `WARN` | `origin`, `method`, `path`, `user_agent`, `request_id` | Request arrives with a non-matching `Origin` header and specific origins are configured |
| CORS preflight handled | `DEBUG` | `origin`, `requested_method`, `requested_headers`, `request_id` | An `OPTIONS` preflight request is handled |
| CORS config validation error | `ERROR` | `raw_value`, `error_message` | `CODEPLANE_CORS_ORIGIN` contains an invalid value at startup |

All log entries MUST include the `request_id` field (available from the request ID middleware which runs before CORS).

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_cors_preflight_total` | Counter | `origin`, `allowed` | Total number of CORS preflight requests handled, partitioned by whether the origin was allowed |
| `codeplane_cors_preflight_duration_seconds` | Histogram | — | Duration of preflight request handling (buckets: 0.001, 0.005, 0.01, 0.05, 0.1) |
| `codeplane_cors_origin_rejected_total` | Counter | `origin` | Total number of requests where the origin was not in the allowed list |
| `codeplane_cors_requests_total` | Counter | `origin_mode` (`wildcard` | `specific`) | Total requests processed by CORS middleware, partitioned by configuration mode |

### Alerts

**Alert: High CORS Origin Rejection Rate**

- **Condition:** `rate(codeplane_cors_origin_rejected_total[5m]) > 10`
- **Severity:** Warning
- **Runbook:**
  1. Check the `origin` label on the counter to identify which origins are being rejected.
  2. If the rejected origin is the Codeplane web UI origin, the `CODEPLANE_CORS_ORIGIN` environment variable is misconfigured. Verify the value matches the web UI's actual origin (including scheme, host, and port).
  3. If the rejected origin is a known third-party integration, add it to the `CODEPLANE_CORS_ORIGIN` comma-separated list and restart the server.
  4. If the rejected origin is unknown, this may be an unauthorized integration attempt. Log the origin and user-agent for security review. No action is needed — the browser is already blocking the response.
  5. Check recent deployments or infrastructure changes that may have altered the server's environment variables.

**Alert: CORS Preflight Latency Spike**

- **Condition:** `histogram_quantile(0.99, rate(codeplane_cors_preflight_duration_seconds_bucket[5m])) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. CORS preflight handling should be near-instant (<5ms) as it does not involve database calls, authentication, or application logic.
  2. Check overall server CPU and memory utilization — elevated preflight latency usually indicates general server saturation.
  3. Check if the event loop is blocked by examining Bun runtime metrics and structured logs for slow middleware.
  4. If the spike correlates with a deployment, check if the middleware ordering was accidentally changed (e.g., auth or rate-limit running before CORS).
  5. Verify that no route handler is accidentally matching `OPTIONS` requests and doing expensive work.

**Alert: Zero CORS Preflights Detected (Canary)**

- **Condition:** `rate(codeplane_cors_preflight_total[30m]) == 0` AND the web UI is expected to be in active use
- **Severity:** Info
- **Runbook:**
  1. This alert fires when no preflight requests have been seen in 30 minutes while the web UI is expected to be active.
  2. Verify the web UI is reachable.
  3. If the web UI and API are on the same origin, this alert is expected and can be silenced.
  4. If the web UI is on a different origin, check browser developer tools for cached preflights or connection errors.

### Error Cases and Failure Modes

| Error Case | Symptom | Impact | Mitigation |
|---|---|---|---|
| `CODEPLANE_CORS_ORIGIN` contains an origin without a scheme | Server fails to start | No API service | Server logs `ERROR` with the malformed origin value. Fix the environment variable. |
| `CODEPLANE_CORS_ORIGIN` has trailing whitespace | Origins don't match correctly | Browser-side CORS errors | Trim whitespace during parsing. Log `WARN` if whitespace was stripped. |
| `CODEPLANE_CORS_ORIGIN` set to `*` with credentials expected | Credentials not sent by browser | Session-cookie auth fails | Log `WARN` at startup if wildcard mode is detected and session-cookie auth is configured. |
| Middleware ordering changed accidentally | Preflight requests receive 401 or 429 | Web UI completely broken for cross-origin deployments | Integration tests verify middleware ordering. |
| Reverse proxy strips or overwrites CORS headers | Browser sees incorrect CORS headers | Web UI broken | Document that reverse proxies must not add their own CORS headers if Codeplane handles CORS. |

## Verification

### API Integration Tests — Preflight Handling

- [ ] **Basic preflight returns 204:** Send `OPTIONS /api/health` with `Origin: https://example.com` and `Access-Control-Request-Method: GET`. Assert response status is `204` and response body is empty.
- [ ] **Preflight includes Allow-Methods:** Send `OPTIONS /api/repos` with `Origin: https://example.com` and `Access-Control-Request-Method: POST`. Assert `Access-Control-Allow-Methods` header contains `GET,HEAD,PUT,POST,DELETE,PATCH`.
- [ ] **Preflight reflects requested headers:** Send `OPTIONS /api/repos` with `Access-Control-Request-Headers: Authorization,Content-Type,X-Custom-Header`. Assert `Access-Control-Allow-Headers` includes all three headers.
- [ ] **Preflight has no Content-Type:** Send `OPTIONS /api/repos`. Assert the response does not include `Content-Type` or `Content-Length` headers.
- [ ] **Preflight includes X-Request-Id:** Send `OPTIONS /api/repos`. Assert the response includes `X-Request-Id` header.
- [ ] **Preflight does not trigger rate limiting:** Send 200 `OPTIONS` requests within 60 seconds. Assert none return `429`. Then send a non-OPTIONS request and assert `X-RateLimit-Remaining` is near the maximum.
- [ ] **Preflight does not trigger auth loading:** Send `OPTIONS /api/repos` without any `Authorization` header or session cookie. Assert `204` response (not `401`).
- [ ] **Preflight does not trigger content-type enforcement:** Send `OPTIONS /api/repos` without `Content-Type: application/json`. Assert `204` response (not `415`).
- [ ] **Preflight to non-existent route:** Send `OPTIONS /api/nonexistent/route/that/does/not/exist`. Assert response is `204` with CORS headers.
- [ ] **Preflight with Max-Age:** Send `OPTIONS /api/repos`. Assert `Access-Control-Max-Age` header is present with a numeric value (e.g., `600`).

### API Integration Tests — Wildcard Origin Mode

- [ ] **Wildcard origin on GET:** Send `GET /api/health` with `Origin: https://any-origin.example.com`. Assert `Access-Control-Allow-Origin: *`.
- [ ] **Wildcard origin on POST:** Send `POST /api/repos` with `Origin: https://any-origin.example.com` and `Content-Type: application/json`. Assert `Access-Control-Allow-Origin: *`.
- [ ] **Wildcard mode has no credentials header:** Send `GET /api/health` with `Origin: https://example.com`. Assert `Access-Control-Allow-Credentials` header is NOT present.
- [ ] **Wildcard mode has no Vary: Origin:** Send `GET /api/health` with `Origin: https://example.com`. Assert `Vary` header does NOT include `Origin`.
- [ ] **No Origin header — no blocking:** Send `GET /api/health` without an `Origin` header. Assert request succeeds (200).

### API Integration Tests — Specific Origin Mode

- [ ] **Single allowed origin matches:** Configure `CODEPLANE_CORS_ORIGIN=https://codeplane.example.com`. Send `GET /api/health` with `Origin: https://codeplane.example.com`. Assert `Access-Control-Allow-Origin: https://codeplane.example.com`.
- [ ] **Single allowed origin — non-matching origin rejected:** Configure `CODEPLANE_CORS_ORIGIN=https://codeplane.example.com`. Send `GET /api/health` with `Origin: https://evil.example.com`. Assert `Access-Control-Allow-Origin` header is NOT present.
- [ ] **Multiple allowed origins — first matches:** Configure `CODEPLANE_CORS_ORIGIN=https://a.example.com,https://b.example.com`. Send `GET /api/health` with `Origin: https://a.example.com`. Assert `Access-Control-Allow-Origin: https://a.example.com`.
- [ ] **Multiple allowed origins — second matches:** Configure `CODEPLANE_CORS_ORIGIN=https://a.example.com,https://b.example.com`. Send `GET /api/health` with `Origin: https://b.example.com`. Assert `Access-Control-Allow-Origin: https://b.example.com`.
- [ ] **Multiple allowed origins — non-matching rejected:** Configure `CODEPLANE_CORS_ORIGIN=https://a.example.com,https://b.example.com`. Send `GET /api/health` with `Origin: https://c.example.com`. Assert `Access-Control-Allow-Origin` header is NOT present.
- [ ] **Specific origin mode includes Vary: Origin:** Configure a specific origin. Send `GET /api/health` with a matching `Origin`. Assert `Vary` header includes `Origin`.
- [ ] **Specific origin mode includes credentials:** Configure a specific origin. Send `GET /api/health` with a matching `Origin`. Assert `Access-Control-Allow-Credentials: true`.
- [ ] **Substring origin does not match:** Configure `CODEPLANE_CORS_ORIGIN=https://codeplane.example.com`. Send `GET /api/health` with `Origin: https://codeplane.example.com.evil.com`. Assert `Access-Control-Allow-Origin` header is NOT present.
- [ ] **Origin with different port does not match:** Configure `CODEPLANE_CORS_ORIGIN=https://codeplane.example.com`. Send `GET /api/health` with `Origin: https://codeplane.example.com:8080`. Assert `Access-Control-Allow-Origin` header is NOT present.
- [ ] **Origin with different scheme does not match:** Configure `CODEPLANE_CORS_ORIGIN=https://codeplane.example.com`. Send `GET /api/health` with `Origin: http://codeplane.example.com`. Assert `Access-Control-Allow-Origin` header is NOT present.

### API Integration Tests — Exposed Headers

- [ ] **Exposed headers on GET response:** Send `GET /api/health`. Assert `Access-Control-Expose-Headers` includes `X-Request-Id`.
- [ ] **Rate-limit headers exposed:** Send an authenticated `GET /api/repos`. Assert `Access-Control-Expose-Headers` includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- [ ] **Retry-After header exposed:** Exceed the rate limit and verify `Access-Control-Expose-Headers` includes `Retry-After`.
- [ ] **Exposed headers on error response:** Send a request that produces a `404`. Assert `Access-Control-Expose-Headers` is still present.
- [ ] **Exposed headers on preflight:** Send an `OPTIONS` request. Assert `Access-Control-Expose-Headers` is present.

### API Integration Tests — SSE / Streaming

- [ ] **SSE notification stream has CORS headers:** Connect to the notification SSE endpoint with an `Origin` header. Assert the response includes `Access-Control-Allow-Origin`.
- [ ] **SSE workflow log stream has CORS headers:** Connect to a workflow run log SSE endpoint with an `Origin` header. Assert the response includes `Access-Control-Allow-Origin`.
- [ ] **SSE preflight succeeds:** Send `OPTIONS` to an SSE endpoint with `Access-Control-Request-Headers: Accept,Authorization`. Assert `204` response with appropriate CORS headers.

### API Integration Tests — Configuration Validation

- [ ] **Invalid origin without scheme rejected at startup:** Set `CODEPLANE_CORS_ORIGIN=codeplane.example.com` (no scheme). Assert the server fails to start with a clear error message.
- [ ] **Origin with trailing slash normalized:** Set `CODEPLANE_CORS_ORIGIN=https://codeplane.example.com/`. Start the server. Send request with `Origin: https://codeplane.example.com`. Assert `Access-Control-Allow-Origin: https://codeplane.example.com`.
- [ ] **Whitespace in origin list trimmed:** Set `CODEPLANE_CORS_ORIGIN= https://a.example.com , https://b.example.com `. Assert both origins match correctly after trimming.
- [ ] **Empty CODEPLANE_CORS_ORIGIN defaults to wildcard:** Set `CODEPLANE_CORS_ORIGIN=`. Assert `Access-Control-Allow-Origin: *` on responses.
- [ ] **Null origin is not allowed:** Configure `CODEPLANE_CORS_ORIGIN=null`. Assert that a request with `Origin: null` does NOT receive `Access-Control-Allow-Origin`.
- [ ] **Maximum origin count (50 origins):** Set `CODEPLANE_CORS_ORIGIN` to a comma-separated list of 50 valid origins. Assert the 50th origin matches correctly.
- [ ] **Maximum single origin length (2048 characters):** Set `CODEPLANE_CORS_ORIGIN` to a valid origin URL that is 2048 characters long. Assert it is accepted and matches.
- [ ] **Origin exceeding 2048 characters rejected:** Set `CODEPLANE_CORS_ORIGIN` to an origin URL exceeding 2048 characters. Assert the server logs a warning or rejects the value at startup.

### API Integration Tests — Middleware Ordering

- [ ] **CORS before auth — unauthenticated preflight succeeds:** Send `OPTIONS /api/repos` (an endpoint that requires auth for actual requests). Assert `204` response.
- [ ] **CORS before rate limit — preflight doesn't count:** Send 120 `OPTIONS` requests, then send a `GET` request. Assert the `GET` request is NOT rate-limited.
- [ ] **CORS before content-type — preflight without JSON content type succeeds:** Send `OPTIONS` with `Access-Control-Request-Method: POST` but no `Content-Type`. Assert `204`.

### Playwright E2E Tests (Web UI)

- [ ] **Web UI loads cross-origin:** In a test configuration where the web UI and API are on different ports, verify the web UI successfully loads and renders the login page.
- [ ] **Authenticated web UI operations cross-origin:** Log in via the web UI when served from a different origin than the API. Navigate to the repository list. Verify repositories load.
- [ ] **SSE notifications work cross-origin:** In a cross-origin configuration, log in and verify the notification stream connects.
- [ ] **CORS error produces user-visible feedback:** In a deliberately misconfigured CORS setup, attempt to load the web UI. Verify the UI shows a connection error state.

### CLI E2E Tests

- [ ] **CLI ignores CORS headers:** Run `codeplane health` against the server. Verify the command succeeds regardless of CORS configuration.
- [ ] **CLI works in specific-origin mode:** Configure `CODEPLANE_CORS_ORIGIN=https://codeplane.example.com`. Run `codeplane repo list`. Verify the command succeeds.
