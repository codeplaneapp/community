# PLATFORM_HTTP_MIDDLEWARE_REQUEST_ID

Specification for PLATFORM_HTTP_MIDDLEWARE_REQUEST_ID.

## High-Level User POV

Every HTTP interaction with Codeplane — whether from the web UI, CLI, TUI, desktop app, editor extension, or any third-party integration — is tagged with a unique request identifier. This identifier appears as the `X-Request-Id` response header on every API response, including errors.

When something goes wrong, users can reference this request ID when reporting a problem to their Codeplane administrator. Support conversations become dramatically faster because the administrator can search server logs using that single identifier to locate the exact request, its timing, the authenticated identity involved, and the full chain of internal processing that occurred.

For advanced users and integration builders, the request ID system is bidirectional: if a client sends an `X-Request-Id` header on its outgoing request, Codeplane preserves that value and echoes it back. This enables distributed tracing scenarios where an external system (such as a CI runner, workflow executor, or agent runtime) can inject its own correlation ID and follow that ID end-to-end through Codeplane's request lifecycle. If no inbound request ID is provided, Codeplane generates one automatically so that every response is always traceable.

The request ID is not something most users think about during normal day-to-day usage. It works silently in the background. But the moment a user encounters a 500 error, a timeout, or an unexpected behavior, the request ID becomes the single most important debugging artifact. The Codeplane CLI and web UI surface this ID in error messages so that users never need to manually inspect HTTP headers to find it.

## Acceptance Criteria

### Core Behavior
- [ ] Every HTTP response from the Codeplane API server MUST include an `X-Request-Id` response header, regardless of status code (2xx, 3xx, 4xx, 5xx).
- [ ] If the client sends an `X-Request-Id` request header, the server MUST echo the exact same value back in the response header.
- [ ] If the client does not send an `X-Request-Id` header, the server MUST generate a unique identifier and include it in the response header.
- [ ] Generated request IDs MUST be unique within the lifetime of a single server process (no two requests may share the same generated ID).
- [ ] The request ID MUST be available to all downstream middleware and route handlers in the Hono context under the key `"requestId"`.

### ID Format
- [ ] Server-generated request IDs MUST follow the format `{timestamp_base36}-{counter_base36}` (e.g., `m1abc2d-1a`).
- [ ] The timestamp component MUST be `Date.now()` encoded in base-36.
- [ ] The counter component MUST be a monotonically increasing integer encoded in base-36, starting from 1 after server boot.
- [ ] Server-generated IDs MUST be compact (no longer than 20 characters under normal operation for the foreseeable future).

### Client-Provided ID Constraints
- [ ] Client-provided request IDs MUST be accepted as-is if they consist of printable ASCII characters (0x20–0x7E).
- [ ] Client-provided request IDs exceeding 256 characters MUST be rejected with a 400 Bad Request response.
- [ ] Client-provided request IDs containing non-printable characters, newlines, or null bytes MUST be rejected with a 400 Bad Request response.
- [ ] An empty `X-Request-Id` header value (zero-length string) MUST be treated as if the header were absent (i.e., the server generates an ID).

### Middleware Ordering
- [ ] The request ID middleware MUST execute before all other middleware in the stack (logger, CORS, rate limiter, content-type enforcement, auth loader).
- [ ] The request ID MUST be available in context before the structured logger middleware runs so that all log entries for a request can include the request ID.

### Error Response Integration
- [ ] Error responses (JSON bodies from `writeError` / `writeRouteError`) MUST include the `X-Request-Id` response header.
- [ ] Error response JSON bodies SHOULD include a `request_id` field alongside the `message` field so that users see the ID even in non-header-aware contexts.

### Streaming Responses
- [ ] SSE streaming responses (notification stream, workflow log stream, workspace status stream) MUST include the `X-Request-Id` header in the initial HTTP response that establishes the stream.

### Definition of Done
- [ ] Request ID middleware is mounted as the first middleware in the Hono app.
- [ ] All API responses include `X-Request-Id`.
- [ ] Client-provided IDs are echoed; absent IDs are generated.
- [ ] Input validation rejects oversized or malformed client IDs.
- [ ] Structured logging includes request ID in every log line for a given request.
- [ ] Error response bodies include the `request_id` field.
- [ ] Integration and E2E tests cover all acceptance criteria.
- [ ] Documentation describes how to use request IDs for troubleshooting.

## Design

### API Shape

#### Request Header

| Header | Required | Description |
|---|---|---|
| `X-Request-Id` | No | Optional client-provided correlation identifier. If provided and valid, echoed back verbatim. If absent or empty, the server generates one. |

#### Response Header

| Header | Always Present | Description |
|---|---|---|
| `X-Request-Id` | Yes | The request identifier for this HTTP exchange. Either the validated client-provided value or a server-generated value. |

#### Error Response Body Enhancement

Current error response shape:
```json
{
  "message": "not found"
}
```

Enhanced error response shape:
```json
{
  "message": "not found",
  "request_id": "m1abc2d-1a"
}
```

The `request_id` field is added to all error response bodies (4xx and 5xx). Success responses (2xx) do not include `request_id` in the body — only in the header — to avoid polluting domain payloads.

#### Validation Error Response (malformed client ID)

```
HTTP/1.1 400 Bad Request
X-Request-Id: <server-generated-fallback-id>

{
  "message": "invalid X-Request-Id header",
  "request_id": "<server-generated-fallback-id>",
  "errors": [
    {
      "resource": "Request",
      "field": "X-Request-Id",
      "code": "invalid"
    }
  ]
}
```

### SDK Shape

The `@codeplane/sdk` package should export:

- A `REQUEST_ID_KEY` constant (value `"requestId"`) for strongly-typed Hono context access, consistent with `AUTH_INFO_KEY` and `USER_KEY`.
- A `getRequestId(c: Context): string` helper function for type-safe retrieval from context.
- Updated `writeError` / `writeRouteError` functions that automatically read the request ID from context and inject it into the error response body.

### CLI Command

The CLI does not have a dedicated request-ID command. Instead:

- When the CLI receives an error response from the API, it MUST display the `request_id` from the error body in the formatted error output, e.g.:
  ```
  Error: repository not found (request-id: m1abc2d-1a)
  ```
- When `--verbose` or `--debug` flags are active, the CLI MUST print the `X-Request-Id` for every API call it makes.
- The CLI SHOULD generate and send its own `X-Request-Id` on every outgoing request using the format `cli-{random_hex_8}` to enable client-side correlation.

### Web UI Design

- When the web UI encounters an API error and displays an error message to the user, it SHOULD include the request ID in a small, copy-able format beneath or beside the error text:
  ```
  Something went wrong.
  Request ID: m1abc2d-1a  [Copy]
  ```
- The request ID should use a monospace font and be selectable/copyable via a click-to-copy button.
- No request ID should be shown for successful operations — it is a debugging-only affordance.

### TUI UI

- Error messages displayed in the TUI MUST include the request ID when available.
- Format: `Error: <message> (request-id: <id>)`

### Documentation

The following user-facing documentation should be written:

1. **Troubleshooting Guide — Using Request IDs**: A section in the troubleshooting docs explaining what a request ID is and where to find it (`X-Request-Id` header, error message bodies, CLI output), how to provide a request ID when reporting a problem to an administrator, and how administrators can search logs using request IDs.

2. **API Reference — Request Tracing**: A section in the API reference explaining that all responses include `X-Request-Id`, that clients can provide their own `X-Request-Id` for distributed tracing, constraints on client-provided values (256 char max, printable ASCII), and that error bodies include a `request_id` field.

3. **Integration Guide — Distributed Tracing**: A section explaining how to propagate request IDs from an external system through Codeplane and how to correlate logs across multiple systems using the request ID.

## Permissions & Security

### Authorization

- **No authorization is required.** The request ID middleware runs before authentication. Every request — authenticated or anonymous — receives a request ID. This is by design: the request ID is an infrastructure concern, not a user-privilege concern.
- Anonymous requests, health checks, and public endpoints all receive request IDs.

### Rate Limiting

- The request ID middleware itself does not perform rate limiting.
- A malicious client sending extremely long `X-Request-Id` headers (attempting a header-based denial-of-service) is mitigated by the 256-character limit with a 400 rejection.
- The existing rate limiter (120 req/min per identity) applies after the request ID middleware and bounds overall request volume.

### Data Privacy

- **Server-generated request IDs do not contain PII.** They contain only a timestamp and monotonic counter — no IP addresses, user IDs, session tokens, or personally identifiable information.
- **Client-provided request IDs could contain arbitrary values.** The server MUST NOT log client-provided request IDs at a level higher than INFO, and operators should be aware that client-controlled values appear in logs.
- Request IDs MUST NOT be used as authentication tokens, session identifiers, or authorization proof.
- The `X-Request-Id` response header is safe to expose through CORS (it should be included in `Access-Control-Expose-Headers`).

### Security Considerations

- The monotonic counter reveals approximate request volume to an observer who sees multiple request IDs. This is acceptable for a self-hosted product but should be documented.
- The timestamp component reveals the server's wall-clock time. This is similarly acceptable for self-hosted use.

## Telemetry & Product Analytics

### Business Events

This middleware is infrastructure. It does not generate business-level product events. However, it provides the correlation key that all other business events should include.

### Properties on All Events

Every product analytics event fired during request processing SHOULD include:
- `request_id` (string) — the request ID for the HTTP request that triggered the event.

This ensures that product analytics events can be joined to server-side operational logs.

### Funnel Metrics / Success Indicators

| Metric | Description | Target |
|---|---|---|
| `request_id_coverage` | Percentage of API responses that include an `X-Request-Id` header | 100% |
| `client_provided_id_rate` | Percentage of requests that arrive with a client-provided `X-Request-Id` | Informational (indicates integration maturity) |
| `client_id_rejection_rate` | Percentage of requests rejected due to invalid client-provided IDs | < 0.01% (should be near-zero; spikes indicate misconfigured clients) |
| `support_ticket_resolution_time` | Time to resolve user-reported issues when request ID is provided vs. not | Request-ID-provided tickets should resolve 50%+ faster |

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Description |
|---|---|---|---|
| Request start | DEBUG | `request_id`, `method`, `path`, `client_provided_id: boolean` | Emitted when request ID is assigned |
| Request complete | INFO | `request_id`, `method`, `path`, `status`, `duration_ms`, `user_id` (if authenticated) | Emitted by the logger middleware after response |
| Client ID rejected | WARN | `request_id` (server-generated fallback), `reason`, `client_ip`, `raw_length` | Emitted when a client-provided ID is rejected for being too long or containing invalid characters |

**Critical rule:** Every log line emitted during request processing MUST include the `request_id` field. This is the foundational structured logging contract.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_http_requests_total` | Counter | `method`, `path_template`, `status` | Total HTTP requests processed |
| `codeplane_http_request_duration_seconds` | Histogram | `method`, `path_template`, `status` | Request duration in seconds (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_request_id_generated_total` | Counter | — | Count of server-generated request IDs |
| `codeplane_request_id_client_provided_total` | Counter | — | Count of client-provided request IDs accepted |
| `codeplane_request_id_client_rejected_total` | Counter | `reason` (`too_long`, `invalid_chars`) | Count of client-provided request IDs rejected |

### Alerts

#### Alert: `RequestIdMissing`
- **Condition:** Any HTTP response is observed (via integration test or external probe) without an `X-Request-Id` header.
- **Severity:** Critical
- **Runbook:**
  1. Check if the Codeplane server process is running and healthy (`GET /health`).
  2. Check if the middleware stack was modified in a recent deployment. Review `apps/server/src/index.ts` to verify `requestId` is still the first middleware.
  3. Check if a reverse proxy or load balancer is stripping the header. Inspect proxy configuration (e.g., nginx `proxy_pass_header`, Cloudflare transform rules).
  4. If the middleware is present and the header is being stripped externally, configure the proxy to pass through `X-Request-Id`.
  5. If the middleware is missing from the stack, roll back the deployment.

#### Alert: `ClientIdRejectionSpike`
- **Condition:** `rate(codeplane_request_id_client_rejected_total[5m]) > 10`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_request_id_client_rejected_total` by `reason` label to determine if rejections are `too_long` or `invalid_chars`.
  2. Check server logs for WARN entries with `client_ip` to identify the source.
  3. If the source is a known integration or client, coordinate with the client team to fix their ID generation.
  4. If the source is unknown or abusive, consider IP-level rate limiting or blocking.

#### Alert: `RequestCounterOverflow`
- **Condition:** The request counter value exceeds `Number.MAX_SAFE_INTEGER` (theoretical; would require ~9 quadrillion requests on a single process).
- **Severity:** Warning (proactive)
- **Runbook:**
  1. This alert exists as a theoretical safeguard. In practice, servers are restarted long before this threshold.
  2. If triggered, restart the server process. The counter resets to 0 on boot.
  3. Consider migrating to UUID-based generation if sustained request volumes ever approach this scale.

### Error Cases and Failure Modes

| Error Case | Behavior | HTTP Status | Log Level |
|---|---|---|---|
| Client sends `X-Request-Id` > 256 chars | Reject request with validation error; generate fallback ID for the error response | 400 | WARN |
| Client sends `X-Request-Id` with non-printable characters | Reject request with validation error; generate fallback ID for the error response | 400 | WARN |
| Client sends empty `X-Request-Id` header | Treat as absent; server generates an ID | Normal processing | DEBUG |
| `Date.now()` returns unexpected value (clock skew) | ID is still generated (just with an unusual timestamp); no functional impact | Normal processing | — |
| Server process runs long enough for counter to overflow `Number.MAX_SAFE_INTEGER` | Generated IDs may lose uniqueness due to floating-point precision loss | Normal processing (degraded uniqueness) | WARN |

## Verification

### API Integration Tests

- [ ] **Generated ID on simple request:** Send `GET /health` without an `X-Request-Id` header. Verify the response includes an `X-Request-Id` header with a non-empty value matching the pattern `^[0-9a-z]+-[0-9a-z]+$`.
- [ ] **Generated ID uniqueness:** Send 100 sequential requests to `GET /health` without `X-Request-Id`. Collect all response `X-Request-Id` values. Verify all 100 values are distinct.
- [ ] **Generated ID uniqueness under concurrency:** Send 50 concurrent requests to `GET /health` without `X-Request-Id`. Collect all response `X-Request-Id` values. Verify all 50 values are distinct.
- [ ] **Client-provided ID echo (simple):** Send `GET /health` with header `X-Request-Id: my-custom-id-123`. Verify the response `X-Request-Id` header is exactly `my-custom-id-123`.
- [ ] **Client-provided ID echo (UUID format):** Send a request with `X-Request-Id: 550e8400-e29b-41d4-a716-446655440000`. Verify the response echoes the exact UUID.
- [ ] **Client-provided ID echo (maximum valid length):** Send a request with `X-Request-Id` set to a 256-character printable ASCII string. Verify the response echoes the exact 256-character value.
- [ ] **Client-provided ID rejection (too long):** Send a request with `X-Request-Id` set to a 257-character string. Verify the response is HTTP 400 with an appropriate error message. Verify the response still includes an `X-Request-Id` header (server-generated fallback).
- [ ] **Client-provided ID rejection (null byte):** Send a request with `X-Request-Id` containing a null byte (`\x00`). Verify the response is HTTP 400.
- [ ] **Client-provided ID rejection (newline):** Send a request with `X-Request-Id` containing `\n`. Verify the response is HTTP 400.
- [ ] **Client-provided ID rejection (non-printable):** Send a request with `X-Request-Id` containing control character `\x01`. Verify the response is HTTP 400.
- [ ] **Empty header treated as absent:** Send a request with `X-Request-Id:` (empty value). Verify the response includes a server-generated `X-Request-Id` (not empty).
- [ ] **ID present on 404 response:** Send `GET /api/nonexistent-path`. Verify the 404 response includes `X-Request-Id`.
- [ ] **ID present on 401 response:** Send `GET /api/v1/user` without authentication. Verify the 401 response includes `X-Request-Id`.
- [ ] **ID present on 422 response:** Send a `POST` to a creation endpoint with an invalid body. Verify the 422 response includes `X-Request-Id`.
- [ ] **ID present on 500 response:** Trigger a 500 error (if a test harness endpoint exists). Verify the 500 response includes `X-Request-Id`.
- [ ] **ID present on rate-limited response:** Exceed the rate limit and verify the 429 response includes `X-Request-Id`.
- [ ] **ID present in error response body:** Send a request that results in a 4xx error. Verify the JSON error body includes a `request_id` field matching the `X-Request-Id` response header.
- [ ] **ID NOT in success response body:** Send a request that results in a 200 success. Verify the JSON response body does NOT include a `request_id` field.
- [ ] **ID present on SSE streaming endpoint:** Connect to a streaming endpoint (e.g., notification stream). Verify the initial HTTP response includes `X-Request-Id` in the headers.
- [ ] **CORS exposes request ID header:** Send a CORS preflight (`OPTIONS`) request. Verify `Access-Control-Expose-Headers` includes `X-Request-Id`.

### CLI E2E Tests

- [ ] **CLI displays request ID on error:** Run a CLI command that triggers an API error (e.g., `codeplane repo view nonexistent`). Verify the CLI error output includes the request ID.
- [ ] **CLI sends request ID:** Run a CLI command with `--debug` or `--verbose`. Verify the debug output shows an outgoing `X-Request-Id` header.
- [ ] **CLI echoes server request ID:** Run a CLI command with `--verbose`. Verify the debug output shows the `X-Request-Id` from the server's response.

### Playwright (Web UI) E2E Tests

- [ ] **Error dialog shows request ID:** Navigate to a page that triggers an API error (e.g., a non-existent repository). Verify the error UI includes a request ID and a copy button.
- [ ] **Copy request ID button works:** Click the copy button next to a displayed request ID. Verify the clipboard contains the request ID value.

### Middleware Ordering Tests

- [ ] **Request ID available before logger:** Verify (via structured log output inspection or a test harness) that log entries for a request include the `request_id` field, confirming the request ID was set before the logger ran.
- [ ] **Request ID available before auth:** Send an authenticated request. Verify that the request ID is present in the response regardless of whether auth succeeds or fails.
- [ ] **Request ID present even when rate limiter rejects:** Exceed the rate limit. Verify the 429 response has an `X-Request-Id`, confirming the request ID middleware ran before the rate limiter.

### Regression / Edge Case Tests

- [ ] **Multiple concurrent client-provided IDs remain isolated:** Send 10 concurrent requests, each with a different `X-Request-Id`. Verify each response echoes back its own respective ID (no cross-contamination between concurrent requests).
- [ ] **Request ID survives middleware error:** If a downstream middleware throws an error, verify the response still includes the `X-Request-Id` header (since it was set before `next()` was called).
- [ ] **Request ID consistent across redirect:** If a request triggers a 301/302 redirect, verify both the redirect response and the final response include `X-Request-Id` headers.
- [ ] **Special characters in client ID:** Send `X-Request-Id: a!@#$%^&*()_+-=[]{}|;:',.<>?/~` (all printable ASCII special chars). Verify the ID is echoed exactly.
- [ ] **Whitespace-only client ID:** Send `X-Request-Id:    ` (spaces only). Verify the server either trims and treats as empty (generating its own) or rejects. Document the chosen behavior.
