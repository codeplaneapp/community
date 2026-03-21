# INTEGRATION_SKILLS_DISCOVERY_STUB

Specification for INTEGRATION_SKILLS_DISCOVERY_STUB.

## High-Level User POV

When a Codeplane user navigates to the integrations area of the product or queries for available skills via the API, they encounter a dedicated "Skills" section. Skills are external capabilities — authored by the user, their organization, or third-party providers — that can be attached to agent sessions, workflow executions, and workspace environments to extend what Codeplane can do on the user's behalf. Think of a skill as a packaged chunk of context and instructions that teaches an agent how to interact with a specific system, follow a particular coding convention, or execute a domain-specific task.

Today, the skills discovery surface serves as an explicitly empty discovery endpoint. When a user or client queries for available skills integrations, Codeplane returns an empty list, clearly communicating that no skills integrations have been configured yet. This is an intentional, honest placeholder rather than an error or a missing page — it tells the user "this is where skills will live" and provides the structural foundation for the product to grow into a full skills marketplace and configuration surface.

The value of shipping this stub now is threefold. First, it reserves a stable API contract that CLI tools, editor extensions, and the web UI can program against today, so that when skills integrations land, all clients are already wired up. Second, it establishes the feature flag and authorization boundary so that the product team can gate, beta-test, or plan-restrict skills discovery before it is feature-complete. Third, it prevents clients from hitting a 404 when they speculatively check for skills, which would be a worse user experience than receiving a well-formed empty response.

From the user's perspective, the workflow is simple: they authenticate, they ask "what skills integrations are available?", and they receive an empty collection. There is no configuration to perform, no setup wizard, and no error to troubleshoot. The surface simply exists, is protected behind authentication, respects the `tool_skills` feature flag, and returns a predictable shape that all downstream clients can rely on.

## Acceptance Criteria

### Definition of Done

- The `GET /api/integrations/skills` endpoint is mounted, reachable, and returns a well-formed JSON response.
- The endpoint requires authentication; unauthenticated requests receive a `401 Unauthorized` error.
- When authenticated, the endpoint returns HTTP `200` with a JSON body of `[]` (empty array).
- The response `Content-Type` header is `application/json`.
- The endpoint is gated behind the `tool_skills` feature flag. When the flag is disabled, the endpoint returns `404 Not Found` or `403 Forbidden` rather than the empty-array stub.
- The endpoint handles all standard HTTP method mismatches gracefully (e.g., `POST /api/integrations/skills` returns `405 Method Not Allowed` or the framework's default behavior).

### Edge Cases

- **Expired or revoked session token**: Returns `401 Unauthorized`, not `200` with empty data.
- **Expired or revoked PAT**: Returns `401 Unauthorized`.
- **Malformed `Authorization` header**: Returns `401 Unauthorized`.
- **Request with unexpected query parameters** (e.g., `?page=1&limit=50`): The endpoint ignores unknown query parameters and still returns `200` with `[]`. No error is produced.
- **Request with unexpected request body** (e.g., a JSON body on a GET): The endpoint ignores the body entirely. No error is produced.
- **Concurrent requests from the same user**: All return `200 []` independently; there is no state to contend over.
- **CORS preflight**: The endpoint respects the global CORS middleware configuration. `OPTIONS` requests return appropriate CORS headers.
- **HEAD request**: Returns `200` with no body and correct `Content-Length` (matching what the GET body would be).

### Boundary Constraints

- No request body is expected or processed; any body is silently ignored.
- No pagination parameters are required. The response is always `[]`.
- No minimum or maximum query string length enforcement beyond what the HTTP middleware already enforces globally.
- The response payload is always the exact JSON value `[]` — no wrapping object, no metadata fields, no `total_count` key.

## Design

### API Shape

**Endpoint**: `GET /api/integrations/skills`

**Authentication**: Required. Supports session cookie or `Authorization: Bearer <PAT>` header.

**Feature Flag**: `tool_skills` must be enabled for the requesting user.

**Request**:
- Method: `GET`
- Headers: Standard auth headers (cookie or Authorization)
- Query Parameters: None defined. Any provided are ignored.
- Body: None.

**Response (success)**:
```
HTTP/1.1 200 OK
Content-Type: application/json

[]
```

**Response (unauthenticated)**:
```
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "authentication required"
}
```

**Response (feature flag disabled)**:
```
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "not found"
}
```

**Future contract note**: When skills discovery is fully implemented, the response shape is expected to become an array of skill objects. The empty array today is intentionally forward-compatible — clients should already handle both empty and populated arrays. The eventual skill object shape is not specified by this stub and will be defined by the full `INTEGRATION_SKILLS_DISCOVERY` feature spec.

### SDK Shape

No dedicated `SkillsService` class exists in `@codeplane/sdk` for this stub. The server route handler calls `getUser(c)` for auth and returns the hardcoded `[]` response directly. When the full feature lands, a `SkillsService` should be introduced following the same pattern as `linearService` and other integration services.

### CLI Command

No dedicated CLI command is required for the stub. The existing `codeplane extension` command tree does not need a `skills` subcommand until skills discovery returns real data. However:

- The `codeplane api get /api/integrations/skills` passthrough command should work correctly against the stub endpoint and return `[]`.
- No error or "not implemented" message should be surfaced — the stub is a valid, functioning endpoint.

### TUI UI

No TUI screen is required for the stub. The TUI should not display a "Skills" entry in navigation until the feature is fully implemented.

### Web UI Design

The web UI's integrations area may show a "Skills" section as a gated placeholder. When the `tool_skills` feature flag is enabled:

- The section title "Skills" is visible in the integrations navigation or page.
- The section body displays an empty state message such as: "No skills integrations configured. Skills will allow you to extend agent and workflow capabilities with external tools and knowledge."
- No configuration controls, forms, or action buttons are shown.
- The empty state should feel intentional, not broken — use the standard Codeplane empty-state illustration pattern.

When the `tool_skills` feature flag is disabled:

- The "Skills" section is not rendered in the integrations navigation.
- Direct URL navigation to the skills page shows the standard 404 page or redirects to the integrations root.

### Documentation

- A brief entry in the Integrations documentation page acknowledging that Skills integration discovery exists as a stable API endpoint.
- A note that the endpoint currently returns an empty list and is reserved for future skills integration capabilities.
- The API reference should document `GET /api/integrations/skills` with its authentication requirement, empty-array response, and feature flag dependency.
- No tutorial, setup guide, or configuration walkthrough is needed until the full feature ships.

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| **Owner** | Can call `GET /api/integrations/skills` — returns `[]` |
| **Admin** | Can call `GET /api/integrations/skills` — returns `[]` |
| **Member** | Can call `GET /api/integrations/skills` — returns `[]` |
| **Read-Only** | Can call `GET /api/integrations/skills` — returns `[]` |
| **Anonymous / Unauthenticated** | `401 Unauthorized` |

The stub endpoint is user-scoped, not repository-scoped or organization-scoped. Any authenticated user can call it. When the full feature ships, finer-grained authorization (e.g., organization-level skill management) will be introduced.

### Rate Limiting

- The endpoint is covered by the global rate limiting middleware applied to all API routes.
- No additional per-endpoint rate limiting is required for the stub, since it performs no database queries, no external calls, and returns a constant response.
- If global rate limits are exceeded, the standard `429 Too Many Requests` response applies.

### Data Privacy

- The stub endpoint returns no user data, no PII, and no repository data. It returns a hardcoded empty array.
- No request data is persisted or logged beyond the standard request-level structured logging (request ID, user ID, method, path, status code).
- The authentication check itself does not leak whether a user exists — unauthenticated requests fail identically regardless of token contents.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `IntegrationSkillsDiscoveryRequested` | Authenticated user calls `GET /api/integrations/skills` | `user_id`, `timestamp`, `response_count` (always `0` for stub), `feature_flag_enabled` (boolean) |
| `IntegrationSkillsDiscoveryDenied` | Unauthenticated request to the endpoint | `timestamp`, `denial_reason` (`"unauthenticated"` or `"feature_flag_disabled"`) |

### Event Properties

- `user_id`: integer, the authenticated user's internal ID
- `timestamp`: ISO 8601 UTC string
- `response_count`: integer, number of skills returned (always `0` during stub phase)
- `feature_flag_enabled`: boolean, whether `tool_skills` was enabled at request time
- `denial_reason`: string enum, reason the request was denied

### Funnel Metrics & Success Indicators

- **Adoption signal**: Track how many unique users call the skills discovery endpoint per week. A rising trend indicates clients are integrating against the endpoint in anticipation of the full feature.
- **Client coverage**: Track which clients (web, CLI, TUI, editor) are calling the endpoint. Goal: all major clients should be calling it before the full feature ships.
- **Error rate baseline**: The stub should have a near-zero error rate (only auth failures). Establish this baseline so that when the full feature ships, any increase in error rate is immediately detectable.
- **Feature flag adoption**: Track what percentage of requests come from users with `tool_skills` enabled vs. disabled. This informs rollout planning.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|---|---|---|
| Successful skills discovery response | `debug` | `request_id`, `user_id`, `method`, `path`, `status_code` (200), `response_count` (0) |
| Authentication failure on skills endpoint | `info` | `request_id`, `method`, `path`, `status_code` (401), `auth_method` (cookie/pat/none) |
| Feature flag check result | `debug` | `request_id`, `user_id`, `flag_name` (`tool_skills`), `flag_enabled` (boolean) |
| Unexpected error in skills endpoint | `error` | `request_id`, `user_id`, `method`, `path`, `error_message`, `stack_trace` |

All log entries should use the structured logging format established by the global logging middleware.

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|---|---|---|---|
| `codeplane_integration_skills_discovery_requests_total` | Counter | `status` (200, 401, 404, 429, 500) | Total requests to the skills discovery endpoint |
| `codeplane_integration_skills_discovery_duration_seconds` | Histogram | `status` | Request duration for skills discovery (should be sub-millisecond for the stub) |
| `codeplane_integration_skills_discovery_auth_failures_total` | Counter | `reason` (unauthenticated, invalid_token, expired_token) | Authentication failures specifically on this endpoint |

### Alerts

#### Alert: Skills Discovery Error Rate Spike

- **Condition**: `rate(codeplane_integration_skills_discovery_requests_total{status="500"}[5m]) > 0.01`
- **Severity**: Warning
- **Runbook**:
  1. Check the server logs for `error`-level entries containing `path=/api/integrations/skills`.
  2. The stub endpoint has no external dependencies, so a 500 indicates either a middleware failure (auth context loading, rate limiter) or a framework-level issue.
  3. Verify the Hono middleware stack is healthy by checking other endpoint error rates.
  4. If isolated to this endpoint, check recent deployments for changes to `apps/server/src/routes/integrations.ts`.
  5. If the error is in auth middleware, escalate to the auth/identity on-call.

#### Alert: Skills Discovery Latency Anomaly

- **Condition**: `histogram_quantile(0.99, codeplane_integration_skills_discovery_duration_seconds) > 0.5`
- **Severity**: Warning
- **Runbook**:
  1. The stub returns a constant value; p99 latency above 500ms indicates a systemic issue (event loop saturation, middleware bottleneck, GC pauses).
  2. Check the global API latency dashboard. If all endpoints are slow, this is not skills-specific — escalate to platform on-call.
  3. If only this endpoint is slow, check for recent middleware additions or feature flag evaluation performance.
  4. Profile the Bun process if needed using `bun --inspect`.

#### Alert: Unexpected 404 Rate on Skills Discovery

- **Condition**: `rate(codeplane_integration_skills_discovery_requests_total{status="404"}[5m]) > 0.1` AND `tool_skills` flag is expected to be enabled
- **Severity**: Info
- **Runbook**:
  1. Verify the `tool_skills` feature flag state via `GET /api/feature-flags`.
  2. If the flag was unintentionally disabled (e.g., environment variable `CODEPLANE_FEATURE_FLAGS_TOOL_SKILLS=false`), re-enable it.
  3. If the flag is enabled but 404s persist, check that the integrations route module is still mounted correctly in `apps/server/src/index.ts`.

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Resolution |
|---|---|---|---|
| Unauthenticated request | 401 | No session cookie or PAT provided | User must authenticate |
| Invalid/expired PAT | 401 | PAT revoked, expired, or malformed | User must re-authenticate or create a new PAT |
| Feature flag disabled | 404 | `tool_skills` flag is `false` for this user | Admin enables the flag or user waits for beta access |
| Rate limited | 429 | Global rate limit exceeded | Client backs off and retries per standard rate limit headers |
| Server error | 500 | Middleware crash or framework error | Investigate server logs; should be extremely rare for a stub |

## Verification

### API Integration Tests

1. **Authenticated request returns 200 with empty array**: Send `GET /api/integrations/skills` with valid session cookie. Assert status `200`, body `[]`, `Content-Type` contains `application/json`.

2. **Authenticated request with PAT returns 200 with empty array**: Send `GET /api/integrations/skills` with valid `Authorization: Bearer <PAT>` header. Assert status `200`, body `[]`.

3. **Unauthenticated request returns 401**: Send `GET /api/integrations/skills` with no auth headers. Assert status `401`. Assert response body contains `"authentication required"` error message.

4. **Expired session cookie returns 401**: Send `GET /api/integrations/skills` with an expired session cookie. Assert status `401`.

5. **Revoked PAT returns 401**: Create a PAT, revoke it, then send `GET /api/integrations/skills` with the revoked PAT. Assert status `401`.

6. **Malformed Authorization header returns 401**: Send `GET /api/integrations/skills` with `Authorization: Bearer <garbage>`. Assert status `401`.

7. **Feature flag disabled returns 404 or 403**: Disable the `tool_skills` feature flag via `CODEPLANE_FEATURE_FLAGS_TOOL_SKILLS=false`. Send authenticated `GET /api/integrations/skills`. Assert status is `404` or `403`. (If the current stub does not check the flag, this test documents the desired behavior and may initially fail as a known gap.)

8. **Feature flag re-enabled returns 200**: Re-enable `tool_skills`. Send authenticated `GET /api/integrations/skills`. Assert status `200`, body `[]`.

9. **Response is exactly an empty JSON array**: Send authenticated `GET /api/integrations/skills`. Parse the response body. Assert it is an array. Assert its length is `0`. Assert it is not `null`, not `{}`, not `""`.

10. **Response Content-Type is application/json**: Send authenticated `GET /api/integrations/skills`. Assert the `Content-Type` response header starts with `application/json`.

11. **Unknown query parameters are ignored**: Send `GET /api/integrations/skills?foo=bar&page=1&limit=50` with valid auth. Assert status `200`, body `[]`.

12. **POST method returns 404 or 405**: Send `POST /api/integrations/skills` with valid auth. Assert status is `404` or `405`.

13. **PUT method returns 404 or 405**: Send `PUT /api/integrations/skills` with valid auth. Assert status is `404` or `405`.

14. **DELETE method returns 404 or 405**: Send `DELETE /api/integrations/skills` with valid auth. Assert status is `404` or `405`.

15. **PATCH method returns 404 or 405**: Send `PATCH /api/integrations/skills` with valid auth. Assert status is `404` or `405`.

16. **CORS preflight succeeds**: Send `OPTIONS /api/integrations/skills` with appropriate `Origin` and `Access-Control-Request-Method` headers. Assert a `200` or `204` response with valid CORS headers.

17. **Concurrent requests from the same user**: Send 10 concurrent `GET /api/integrations/skills` requests with the same auth. Assert all return `200 []`.

18. **Request with body on GET is ignored**: Send `GET /api/integrations/skills` with a JSON body `{"unexpected": true}` and valid auth. Assert status `200`, body `[]`.

19. **Large query string is handled gracefully**: Send `GET /api/integrations/skills?x=<2000 character string>` with valid auth. Assert either `200 []` (param ignored) or `414 URI Too Long` from the framework. Neither should produce a `500`.

20. **Response body size is correct**: Send `GET /api/integrations/skills` with valid auth. Assert the response body byte length equals `2` (the byte length of `[]`).

### CLI Integration Tests

21. **CLI `api get` passthrough works**: Run `codeplane api get /api/integrations/skills`. Assert output contains `[]` or is an empty JSON array.

22. **CLI `api get` unauthenticated fails**: Run `codeplane api get /api/integrations/skills` without being logged in. Assert an authentication error is surfaced.

### E2E / Playwright Tests

23. **Integrations page shows Skills section when flag enabled**: Navigate to the integrations page as an authenticated user with `tool_skills` enabled. Assert a "Skills" section or heading is visible. Assert an empty-state message is displayed.

24. **Integrations page hides Skills section when flag disabled**: Navigate to the integrations page as an authenticated user with `tool_skills` disabled. Assert no "Skills" section or heading is visible.

25. **Skills empty state is not an error state**: Navigate to the integrations/skills area. Assert the displayed message is an informational empty state (e.g., contains text about "no skills" or "not configured"), not an error banner or red error message.

26. **No action buttons in Skills stub**: Navigate to the integrations/skills area. Assert there are no "Add", "Configure", "Create", or "Install" buttons related to skills.
