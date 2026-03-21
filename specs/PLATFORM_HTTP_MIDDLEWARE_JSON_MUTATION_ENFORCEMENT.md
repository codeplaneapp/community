# PLATFORM_HTTP_MIDDLEWARE_JSON_MUTATION_ENFORCEMENT

Specification for PLATFORM_HTTP_MIDDLEWARE_JSON_MUTATION_ENFORCEMENT.

## High-Level User POV

When a user or automated system sends a request to the Codeplane API that modifies data — creating an issue, editing a landing request, deleting a webhook, or any other write operation — Codeplane enforces that the request body is formatted as JSON. This protection is transparent during normal use: the web UI, CLI, TUI, desktop app, and editor extensions all send JSON automatically, so users never encounter it. But it serves as a critical guardrail that prevents accidental or malicious submission of non-JSON payloads (such as form-encoded data, XML, raw text, or binary blobs) from being accepted by the API and causing unpredictable behavior downstream.

If a client makes a mistake and sends a POST, PUT, PATCH, or DELETE request with a `Content-Type` that is not `application/json`, the API immediately rejects the request with a clear, actionable error: HTTP 415 Unsupported Media Type. The error message tells the client exactly what is expected. This fast rejection happens before any authentication check, business logic, or database interaction takes place, meaning the system never wastes work on a malformed request and never risks partial state corruption from a payload it cannot safely parse.

Read-only operations like browsing repositories, viewing issues, or checking server health are completely unaffected by this enforcement. GET, HEAD, and OPTIONS requests never carry meaningful request bodies, and Codeplane does not require them to declare a content type. Similarly, write operations that intentionally carry no body (such as a DELETE with no payload) are allowed through without a content-type requirement, because there is nothing to parse.

There is one important exception that advanced API consumers should be aware of: the OAuth2 token exchange and token revocation endpoints accept both `application/json` and `application/x-www-form-urlencoded` payloads in compliance with RFC 6749 and RFC 7009. These endpoints handle their own content-type negotiation internally after passing through the middleware. This dual-format support exists because OAuth2 clients in the wild universally expect form-encoded token requests to work, and breaking that expectation would make Codeplane's OAuth2 implementation non-compliant with the standard.

For integration builders writing custom scripts, CI pipelines, or agent runtimes that talk to Codeplane's API, this enforcement means one simple rule: always send `Content-Type: application/json` when your request has a body. If you forget, you will get an immediate, understandable error rather than silent data corruption.

## Acceptance Criteria

### Core Behavior
- [ ] All HTTP requests using mutation methods (POST, PUT, PATCH, DELETE) that carry a request body MUST include a `Content-Type` header containing `application/json`.
- [ ] Requests whose `Content-Type` header does not contain the substring `application/json` MUST be rejected with HTTP 415 Unsupported Media Type.
- [ ] The rejection response body MUST be a structured JSON error: `{"message": "Content-Type must be application/json"}`.
- [ ] The rejection MUST occur before authentication context loading, meaning no user lookups or token validations are performed for rejected requests.
- [ ] The rejection MUST occur before any route handler logic or service-layer code executes.

### Read-Only Method Exemptions
- [ ] GET requests MUST be exempt from content-type enforcement regardless of whether they include a `Content-Type` header.
- [ ] HEAD requests MUST be exempt from content-type enforcement.
- [ ] OPTIONS requests MUST be exempt from content-type enforcement (required for CORS preflight).

### Body-less Mutation Exemptions
- [ ] A mutation request with `Content-Length: 0` MUST be exempt from content-type enforcement (empty-body operations such as state toggles or bodyless DELETEs).
- [ ] A mutation request with neither a `Content-Type` header nor a `Content-Length` header MUST be exempt from content-type enforcement (treated as a no-body request).
- [ ] A mutation request that has a `Content-Length` header with a value greater than 0 but no `Content-Type` header MUST be rejected with HTTP 415.

### Content-Type Matching Rules
- [ ] `Content-Type: application/json` MUST be accepted.
- [ ] `Content-Type: application/json; charset=utf-8` MUST be accepted (the check uses substring matching on `application/json`).
- [ ] `Content-Type: application/json; charset=UTF-8` MUST be accepted (case in charset parameter does not affect matching).
- [ ] `Content-Type: text/plain` MUST be rejected.
- [ ] `Content-Type: application/xml` MUST be rejected.
- [ ] `Content-Type: application/x-www-form-urlencoded` MUST be rejected by the middleware.
- [ ] `Content-Type: multipart/form-data` MUST be rejected.
- [ ] `Content-Type: text/json` MUST be rejected (it does not contain the exact substring `application/json`).
- [ ] An empty `Content-Type` header value (zero-length string) with a non-zero `Content-Length` MUST be rejected.

### OAuth2 Compatibility
- [ ] The OAuth2 token endpoint (`POST /api/oauth2/token`) MUST accept `application/x-www-form-urlencoded` payloads per RFC 6749.
- [ ] The OAuth2 revoke endpoint (`POST /api/oauth2/revoke`) MUST accept `application/x-www-form-urlencoded` payloads per RFC 7009.
- [ ] Both OAuth2 endpoints MUST also accept `application/json` payloads.

### Middleware Stack Position
- [ ] JSON mutation enforcement MUST execute after rate limiting (position 5 in the middleware stack).
- [ ] JSON mutation enforcement MUST execute before authentication context loading (position 5, before auth loader at position 6).
- [ ] The middleware stack order MUST be: request ID → logger → CORS → rate limiting → JSON content-type enforcement → auth context loading.
- [ ] The middleware MUST be applied unconditionally to all routes via the `"*"` path pattern.
- [ ] The middleware ordering MUST NOT be configurable or alterable by plugins, extensions, or feature flags.

### Edge Cases
- [ ] A mutation request with a body containing only whitespace but valid `Content-Type: application/json` MUST be passed through the middleware (body validity is the route handler's responsibility).
- [ ] A mutation request with a very large `Content-Length` and valid `Content-Type: application/json` MUST be passed through the middleware (body size limits are handled by other mechanisms).
- [ ] A DELETE request with no body and no headers MUST pass through (exempt as a body-less mutation).

### Definition of Done
- [ ] JSON content-type enforcement middleware is mounted at position 5 in the middleware stack.
- [ ] All mutation requests with bodies are validated for `application/json` content type.
- [ ] Read-only methods (GET, HEAD, OPTIONS) are unconditionally exempt.
- [ ] Body-less mutations (Content-Length: 0, or no Content-Type + no Content-Length) are exempt.
- [ ] HTTP 415 responses are returned with structured JSON error bodies.
- [ ] OAuth2 token and revoke endpoints remain functional with both JSON and form-encoded payloads.
- [ ] Integration and E2E tests cover all acceptance criteria.
- [ ] Documentation describes the content-type requirement for API consumers.

## Design

### API Shape

#### Error Response on Content-Type Violation

```
HTTP/1.1 415 Unsupported Media Type
Content-Type: application/json
X-Request-Id: <request-id>

{
  "message": "Content-Type must be application/json"
}
```

The 415 response is returned for any mutation request (POST, PUT, PATCH, DELETE) that carries a body but does not declare `application/json` as the content type.

#### Accepted Content-Type Header Values

| Content-Type Value | Accepted | Reason |
|---|---|---|
| `application/json` | ✅ | Exact match |
| `application/json; charset=utf-8` | ✅ | Contains `application/json` substring |
| `application/json; charset=UTF-8` | ✅ | Contains `application/json` substring |
| `application/json-patch+json` | ✅ | Contains `application/json` substring (incidental) |
| `text/plain` | ❌ | Does not contain `application/json` |
| `application/xml` | ❌ | Does not contain `application/json` |
| `application/x-www-form-urlencoded` | ❌ | Does not contain `application/json` |
| `multipart/form-data` | ❌ | Does not contain `application/json` |
| `text/json` | ❌ | Does not contain `application/json` |
| *(empty string)* | ❌ | Does not contain `application/json` |

#### Request Method Behavior Matrix

| HTTP Method | Has Body | Content-Type Present | Enforcement |
|---|---|---|---|
| GET | N/A | N/A | Exempt — always passes |
| HEAD | N/A | N/A | Exempt — always passes |
| OPTIONS | N/A | N/A | Exempt — always passes |
| POST | Yes | `application/json` | Passes |
| POST | Yes | `text/plain` | Rejected — 415 |
| POST | No (Content-Length: 0) | Any or absent | Passes (body-less exemption) |
| POST | No (neither header) | Absent | Passes (body-less exemption) |
| PUT | Yes | `application/json` | Passes |
| PUT | Yes | Missing | Rejected — 415 |
| PATCH | Yes | `application/json` | Passes |
| DELETE | No body | Absent | Passes (body-less exemption) |
| DELETE | Yes | `application/json` | Passes |
| DELETE | Yes | `text/plain` | Rejected — 415 |

### SDK Shape

The `@codeplane/sdk` package exports:

- `unsupportedMediaType(msg: string): APIError` — factory function creating an `APIError` with HTTP status 415.
- `writeError(c: Context, err: APIError): Response` — writes the structured JSON error response.

The `jsonContentType` middleware is exported from `apps/server/src/lib/middleware.ts` and imported by the server bootstrap.

### CLI Command

The CLI does not have a dedicated command for content-type enforcement. Instead:

- The CLI's internal HTTP client MUST always send `Content-Type: application/json` on all mutation requests.
- When the CLI receives a 415 error, it MUST display: `Error: server rejected request — Content-Type must be application/json (HTTP 415)`.
- This error in normal CLI operation indicates a client bug. The message should include: `This is likely a bug in the Codeplane CLI. Please report it.`

### Web UI Design

No visible UI surface. The SolidJS API client always sends JSON. Generic error handling displays the 415 message if somehow received.

### TUI UI

No TUI-specific surface. The `@codeplane/ui-core` API client always sends JSON. Standard error display shows the message if a 415 is received.

### Documentation

1. **API Reference — Request Body Format**: A section explaining that all mutation requests must include `Content-Type: application/json`. Include curl examples showing correct and incorrect usage.

2. **API Reference — OAuth2 Exception**: A note explaining that `/api/oauth2/token` and `/api/oauth2/revoke` accept both `application/json` and `application/x-www-form-urlencoded` per OAuth2 RFCs.

3. **Integration Guide — Common Errors**: Include 415 Unsupported Media Type in the common API errors list with cause and fix.

## Permissions & Security

### Authorization

- **No authorization is required.** The JSON content-type enforcement middleware runs before the authentication context loader. This is by design: content-type validation is a protocol-level concern that applies equally to authenticated users, anonymous users, and unauthenticated requests. Rejecting a malformed request before auth prevents wasted authentication lookups.
- All roles (Owner, Admin, Member, Read-Only, Anonymous) are subject to the same enforcement. There are no role-based exemptions.

### Rate Limiting

- The JSON content-type enforcement middleware itself does not perform rate limiting.
- The existing rate limiter (120 requests/minute per identity) executes **before** this middleware in the stack, meaning rate limiting is applied even to requests that will subsequently be rejected for content-type violations. This prevents an attacker from using malformed requests to bypass rate limits.
- A client repeatedly sending requests with incorrect content types will consume their rate limit quota, providing natural back-pressure against probing or accidental request floods.

### Data Privacy

- **No PII exposure risk.** The 415 error response contains only a static message string (`"Content-Type must be application/json"`). It does not echo back the request body, the invalid content-type value, the client's IP address, authentication state, or any user-identifying information.
- The rejected request's body content is never read, parsed, or logged by the middleware. This means sensitive data accidentally sent with an incorrect content type is not captured in server logs.

### Security Considerations

- **Prevents content-type confusion attacks.** By enforcing JSON, the middleware prevents attacks where a malicious client sends a payload in a different format (e.g., XML External Entity injection via XML, or CSRF via form-encoded POST).
- **Prevents CSRF via form submissions.** Browser-based CSRF attacks typically submit `application/x-www-form-urlencoded` or `multipart/form-data` payloads. The middleware rejects both, providing defense-in-depth alongside CORS and session cookie protections.
- **Does not prevent all malformed JSON.** The middleware only checks the Content-Type header. Body parsing and validation remain the responsibility of individual route handlers.

## Telemetry & Product Analytics

### Business Events

This middleware is infrastructure. It does not generate feature-level business events. However, its behavior feeds into platform-level health signals.

| Event | Properties | When Fired |
|---|---|---|
| `ApiContentTypeRejected` | `method`, `path`, `content_type_provided`, `request_id`, `client_ip_hash` (one-way hash, not raw IP) | When a request is rejected with HTTP 415 |

### Funnel Metrics / Success Indicators

| Metric | Description | Target |
|---|---|---|
| `content_type_rejection_rate` | Percentage of mutation requests rejected by this middleware | < 0.1% — should be near-zero. Sustained non-zero rates indicate a misconfigured client or integration. |
| `content_type_rejection_by_client` | Breakdown of 415 rejections by client type (CLI version, SDK version, browser, unknown) | Informational — helps identify which client is sending bad requests |
| `oauth2_form_encoded_rate` | Percentage of OAuth2 token/revoke requests using form encoding vs. JSON | Informational — tracks adoption of JSON vs. legacy form encoding in OAuth2 flows |

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Description |
|---|---|---|---|
| Content-type rejection | WARN | `request_id`, `method`, `path`, `content_type` (the value that was rejected), `content_length`, `client_ip` | Emitted when a mutation request is rejected for missing or incorrect Content-Type. Logged at WARN because it indicates a client-side error that may need operator attention if repeated. |
| Body-less mutation pass-through | DEBUG | `request_id`, `method`, `path`, `reason` (`content_length_zero` or `no_body_headers`) | Emitted when a mutation request is allowed through due to the body-less exemption. |
| Read-only method pass-through | TRACE | `request_id`, `method`, `path` | Emitted when a read-only method bypasses enforcement. Only for deep debugging. |

**Critical rule:** The `content_type` field in rejection logs MUST be the raw header value, truncated to 256 characters to prevent log injection via excessively long Content-Type headers.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_http_content_type_enforced_total` | Counter | `method`, `result` (`passed`, `rejected`, `exempt_readonly`, `exempt_nobody`) | Total requests evaluated by the middleware |
| `codeplane_http_content_type_rejected_total` | Counter | `method`, `path_template` | Count of requests rejected with HTTP 415 |
| `codeplane_http_content_type_rejected_by_type_total` | Counter | `content_type_category` (`text_plain`, `form_urlencoded`, `multipart`, `xml`, `empty`, `other`) | Breakdown of rejections by invalid Content-Type category |

### Alerts

#### Alert: `ContentTypeRejectionSpike`
- **Condition:** `rate(codeplane_http_content_type_rejected_total[5m]) > 50`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_http_content_type_rejected_total` by `path_template` label to determine which endpoints are being hit.
  2. Check server logs for WARN entries with `content_type` and `client_ip` fields to identify the source.
  3. If rejections are concentrated on a single path (e.g., `/api/oauth2/token`), check if a new OAuth2 client is misconfigured.
  4. If rejections are from a known CLI or SDK version, check if a client update introduced a regression. Notify the client team.
  5. If rejections are from unknown sources with diverse paths, this may indicate a scanning or fuzzing attack. Monitor the rate limiter metrics. Consider temporary IP-level blocking if the volume is extreme.

#### Alert: `ContentTypeRejectionFromKnownClient`
- **Condition:** Any 415 response where the `User-Agent` matches a known Codeplane client pattern (CLI, web, TUI, desktop, VS Code, Neovim).
- **Severity:** Critical
- **Runbook:**
  1. This should never happen. Codeplane's own clients always send `application/json`. A 415 from a known client indicates a regression.
  2. Identify the client version from the `User-Agent` header in the rejection logs.
  3. Reproduce the failing request using the identified client version and command.
  4. File a P0 bug against the affected client.
  5. Fix the client; do not add a server-side workaround.

#### Alert: `MiddlewareStackOrderViolation`
- **Condition:** An integration test or canary probe detects that a 415 response does not include the `X-Request-Id` header.
- **Severity:** Critical
- **Runbook:**
  1. Check `apps/server/src/index.ts` to verify middleware ordering has not been changed.
  2. If the ordering was changed in a recent deployment, roll back immediately.
  3. If the ordering appears correct, check for middleware registration bugs in the Hono framework version.

### Error Cases and Failure Modes

| Error Case | Behavior | HTTP Status | Log Level |
|---|---|---|---|
| POST with `Content-Type: text/plain` and a body | Rejected with structured JSON error | 415 | WARN |
| PUT with `Content-Type: application/xml` and a body | Rejected with structured JSON error | 415 | WARN |
| PATCH with no `Content-Type` but `Content-Length: 500` | Rejected with structured JSON error | 415 | WARN |
| DELETE with no `Content-Type` and no `Content-Length` | Allowed through (body-less exemption) | Route handler decides | DEBUG |
| POST with `Content-Length: 0` and no `Content-Type` | Allowed through (body-less exemption) | Route handler decides | DEBUG |
| POST with `Content-Type: application/json` and malformed JSON body | Allowed through middleware | Route handler decides (typically 400) | — |
| GET with `Content-Type: text/plain` | Allowed through (GET is exempt) | Route handler decides | TRACE |

## Verification

### API Integration Tests — Core Enforcement

- [ ] **JSON content type accepted on POST:** Send `POST /api/repos/test-owner/test-repo/issues` with `Content-Type: application/json` and a valid JSON body. Verify the request is not rejected with 415.
- [ ] **JSON content type with charset accepted:** Send `POST /api/repos/test-owner/test-repo/issues` with `Content-Type: application/json; charset=utf-8` and a valid JSON body. Verify not 415.
- [ ] **JSON content type with uppercase charset accepted:** Send `POST /api/repos/test-owner/test-repo/issues` with `Content-Type: application/json; charset=UTF-8`. Verify not 415.
- [ ] **Plain text rejected on POST:** Send `POST /api/repos/test-owner/test-repo/issues` with `Content-Type: text/plain` and `Content-Length: 20`. Verify HTTP 415 with body `{"message": "Content-Type must be application/json"}`.
- [ ] **XML rejected on POST:** Send `POST /api/repos/test-owner/test-repo/issues` with `Content-Type: application/xml` and `Content-Length: 50`. Verify HTTP 415.
- [ ] **Form-urlencoded rejected on POST:** Send `POST /api/repos/test-owner/test-repo/issues` with `Content-Type: application/x-www-form-urlencoded` and `Content-Length: 30`. Verify HTTP 415.
- [ ] **Multipart form-data rejected on POST:** Send `POST /api/repos/test-owner/test-repo/issues` with `Content-Type: multipart/form-data; boundary=----` and `Content-Length: 100`. Verify HTTP 415.
- [ ] **text/json rejected on POST:** Send `POST /api/repos/test-owner/test-repo/issues` with `Content-Type: text/json` and `Content-Length: 20`. Verify HTTP 415.
- [ ] **Empty Content-Type with body rejected:** Send `POST /api/repos/test-owner/test-repo/issues` with `Content-Type:` (empty) and `Content-Length: 50`. Verify HTTP 415.

### API Integration Tests — Method Exemptions

- [ ] **GET exempt:** Send `GET /health` without any `Content-Type` header. Verify the request succeeds (200) and is not 415.
- [ ] **GET exempt even with wrong Content-Type:** Send `GET /health` with `Content-Type: text/plain`. Verify not 415.
- [ ] **HEAD exempt:** Send `HEAD /health` without any `Content-Type` header. Verify not 415.
- [ ] **OPTIONS exempt:** Send `OPTIONS /api/repos/test-owner/test-repo/issues` without any `Content-Type` header. Verify not 415.
- [ ] **OPTIONS exempt even with Content-Type:** Send `OPTIONS /api/repos/test-owner/test-repo/issues` with `Content-Type: text/plain`. Verify not 415.

### API Integration Tests — Body-less Mutation Exemptions

- [ ] **POST with Content-Length 0 exempt:** Send `POST /api/repos/test-owner/test-repo/issues` with `Content-Length: 0` and no `Content-Type`. Verify not 415.
- [ ] **DELETE with no body headers exempt:** Send `DELETE /api/repos/test-owner/test-repo/issues/1` with neither `Content-Type` nor `Content-Length`. Verify not 415.
- [ ] **PUT with Content-Length 0 exempt:** Send `PUT /api/repos/test-owner/test-repo/issues/1` with `Content-Length: 0` and no `Content-Type`. Verify not 415.
- [ ] **PATCH with Content-Length 0 exempt:** Send `PATCH /api/repos/test-owner/test-repo/issues/1` with `Content-Length: 0` and no `Content-Type`. Verify not 415.

### API Integration Tests — All Mutation Methods

- [ ] **PUT with wrong Content-Type rejected:** Send `PUT` with `Content-Type: text/plain` and `Content-Length: 20`. Verify HTTP 415.
- [ ] **PATCH with wrong Content-Type rejected:** Send `PATCH` with `Content-Type: text/plain` and `Content-Length: 20`. Verify HTTP 415.
- [ ] **DELETE with wrong Content-Type and body rejected:** Send `DELETE` with `Content-Type: text/plain` and `Content-Length: 20`. Verify HTTP 415.

### API Integration Tests — Error Response Shape

- [ ] **415 response is JSON:** Send a mutation with wrong Content-Type. Verify the 415 response has `Content-Type: application/json`.
- [ ] **415 response has correct message:** Verify body is exactly `{"message": "Content-Type must be application/json"}`.
- [ ] **415 response includes X-Request-Id:** Verify the 415 response has `X-Request-Id` header.
- [ ] **415 response includes rate limit headers:** Verify `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` are present.

### API Integration Tests — OAuth2 Compatibility

- [ ] **OAuth2 token with JSON works:** Send `POST /api/oauth2/token` with `Content-Type: application/json`. Verify not 415.
- [ ] **OAuth2 revoke with JSON works:** Send `POST /api/oauth2/revoke` with `Content-Type: application/json`. Verify not 415.
- [ ] **OAuth2 token with form-encoded — verify behavior:** Send `POST /api/oauth2/token` with `Content-Type: application/x-www-form-urlencoded`. Document whether 415 or pass-through.
- [ ] **OAuth2 revoke with form-encoded — verify behavior:** Same for `/api/oauth2/revoke`.

### API Integration Tests — Middleware Stack Order

- [ ] **Rejection happens before auth:** Send mutation with `Content-Type: text/plain`, `Content-Length: 20`, no auth. Verify HTTP 415 (not 401).
- [ ] **Rejection happens before auth with invalid token:** Send mutation with wrong Content-Type and `Authorization: token codeplane_invalid`. Verify HTTP 415 (not 401).
- [ ] **Rate limit applies before content-type enforcement:** Exceed rate limit, then send mutation with wrong Content-Type. Verify HTTP 429 (not 415).
- [ ] **Request ID present on 415:** Verify `X-Request-Id` header is present on 415 responses.

### API Integration Tests — Edge Cases

- [ ] **Maximum valid Content-Type header (256 chars):** Send POST with 256-char Content-Type starting with `application/json`. Verify not 415.
- [ ] **Very long invalid Content-Type header (4096 chars):** Send POST with 4096-char Content-Type not containing `application/json` and `Content-Length: 10`. Verify HTTP 415 without crash.
- [ ] **Case sensitivity:** Send `Content-Type: Application/JSON` with `Content-Length: 20`. Verify HTTP 415 (check is case-sensitive).
- [ ] **Concurrent rejection handling:** Send 50 concurrent mutations with wrong Content-Type. Verify all 50 receive HTTP 415 with correct bodies.
- [ ] **Whitespace in Content-Type:** Send `Content-Type:  application/json ` with `Content-Length: 20`. Document observed behavior.
- [ ] **Multiple Content-Type headers:** Send duplicate Content-Type headers (one valid, one invalid). Document observed behavior.

### CLI E2E Tests

- [ ] **CLI always sends correct Content-Type:** Run a CLI mutation command with `--debug`. Verify outgoing request shows `Content-Type: application/json`.
- [ ] **CLI handles 415 gracefully:** Force a 415 response. Verify the CLI displays a clear error message mentioning HTTP 415.

### Playwright (Web UI) E2E Tests

- [ ] **Web UI sends correct Content-Type on issue creation:** Intercept network in Playwright, create an issue, verify POST has `Content-Type: application/json`.
- [ ] **Web UI sends correct Content-Type on all mutations:** Monitor all XHR/fetch mutations during a session. Verify all carry `Content-Type: application/json`.

### Regression Tests

- [ ] **Middleware not accidentally removed:** Canary test sends POST with `Content-Type: text/plain` and `Content-Length: 10`. Verify HTTP 415. Run on every deployment.
- [ ] **Middleware stack order not changed:** Verify 415 responses include `X-Request-Id` and rate limit headers, confirming middleware ran in correct order.
