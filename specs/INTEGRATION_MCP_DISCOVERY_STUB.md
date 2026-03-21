# INTEGRATION_MCP_DISCOVERY_STUB

Specification for INTEGRATION_MCP_DISCOVERY_STUB.

## High-Level User POV

When a Codeplane user works with AI agents — whether through Codeplane's built-in agent sessions, workflow-driven agent tasks, or editor-based AI assistants — those agents often need access to external tools and data sources. The Model Context Protocol (MCP) is the open standard that allows AI agents to discover and invoke tools, resources, and prompts exposed by external servers. Codeplane's MCP discovery feature gives users a single place to see which MCP servers are available for their agents to use.

Today, when a user navigates to the Integrations area of Codeplane or queries integrations from the CLI, they can see their Linear connections and other configured integrations. MCP discovery extends this model: the user can request a list of all MCP server integrations that have been registered or discovered within their Codeplane instance. In the current Community Edition, this list is intentionally empty — no MCP servers are pre-configured out of the box. The endpoint exists as a stable, well-defined contract so that future MCP server registration, CLI tooling, web UI surfaces, and agent runtime wiring all have a single discovery primitive to build on.

From the user's perspective, the value is clarity and forward-compatibility. A user who calls the MCP discovery endpoint today receives a clean, empty response — not an error, not a missing route, not an undocumented 404. This tells the user (and any automation they build) that MCP integration is a recognized product concept, that the API shape is stable, and that when MCP servers are registered in the future, the same endpoint will return them. Users building agent workflows, custom integrations, or extensions can code against this contract today and have it "light up" as MCP support matures.

For self-hosting administrators, the stub provides a clear signal: the MCP integration surface area is defined and gated, and it will not return unexpected data or introduce new dependencies until the administrator opts in. The endpoint is authenticated, so unauthenticated callers cannot probe for integration state.

## Acceptance Criteria

- **Authentication required**: The endpoint must require a valid Codeplane session (cookie) or personal access token (PAT). Unauthenticated requests must receive a `401 Unauthorized` response with body `{ "error": "authentication required" }`.
- **Stub returns empty array**: The endpoint must return an HTTP `200` response with body `[]` (empty JSON array). It must not return `null`, `{}`, `""`, `404`, or any other shape.
- **Content-Type is JSON**: The `Content-Type` response header must be `application/json` or `application/json; charset=utf-8`.
- **GET method only**: The endpoint must respond to `GET` requests. Other HTTP methods (`POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS` beyond CORS preflight) must return `405 Method Not Allowed` or the framework's default method-not-allowed behavior.
- **No request body required**: The endpoint must not require or parse a request body. Any body sent with the `GET` request must be ignored.
- **No query parameters required**: The endpoint must not require any query parameters. Unknown query parameters must be silently ignored.
- **Feature flag gating**: The endpoint must be active when the `integrations` feature flag is enabled (default in CE). When the `integrations` flag is disabled, the endpoint must return `403 Forbidden` with body `{ "error": "feature not available on your plan" }` or not be mounted (returning `404`).
- **Idempotent and side-effect-free**: The endpoint must be safe and idempotent. Calling it any number of times must produce the same result with no writes, state changes, or side effects.
- **Response body must be a valid JSON array**: The body must parse as `[]` — not a JSON object, not a JSON string, not an integer. Even in error states unrelated to the stub (e.g., 500), the error body must be a structured JSON object, never a bare string or HTML.
- **No sensitive data leakage**: The stub must not reveal any information about the server's internal configuration, feature flag state (beyond the 403 gating), or future integration plans in its response body or headers.
- **Standard error response format**: All error responses must use the same `{ "error": "<message>" }` JSON shape used across the Codeplane API.
- **Consistent with skills discovery stub**: The MCP discovery endpoint and the skills discovery endpoint (`GET /api/integrations/skills`) must behave identically in terms of authentication, response shape, error handling, and feature flag gating.
- **Empty array must have correct JSON encoding**: The response body must be exactly `[]` (2 bytes) or `[ ]` with optional whitespace. It must not be `[null]`, `[""]`, or `[{}]`.
- **Request ID correlation**: The response must include the `X-Request-Id` header so clients and logs can correlate requests.
- **Maximum response time**: The stub should respond in under 50ms at p99 under normal conditions, since it performs no I/O beyond auth context loading.

### Definition of Done
- The `GET /api/integrations/mcp` endpoint is mounted and returns `200` with `[]` for authenticated requests.
- The endpoint returns `401` for unauthenticated requests.
- The endpoint is gated behind the `integrations` feature flag.
- The endpoint is covered by integration tests validating the authenticated success path, unauthenticated rejection, and feature-flag-off behavior.
- The CLI `codeplane extension` surface documents MCP as a recognized integration type.
- The web UI Integrations page acknowledges MCP as a future integration category.
- All error cases return structured JSON error responses.
- The endpoint behavior is documented in user-facing integration docs.
- The stub is explicitly marked as `Partial` / stub in the feature inventory and spec artifacts.

## Design

### API Shape

**Endpoint**: `GET /api/integrations/mcp`

**Request**:
- Method: `GET`
- Authentication: Session cookie or PAT-based `Authorization` header (required)
- No request body
- No query parameters

**Success Response** (200):
```json
[]
```

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 401 | User not authenticated | `{ "error": "authentication required" }` |
| 403 | `integrations` feature flag disabled | `{ "error": "feature not available on your plan" }` |
| 405 | Non-GET HTTP method | Framework default method-not-allowed |
| 429 | Rate limit exceeded | `{ "error": "rate limit exceeded" }` |
| 500 | Unexpected server error | `{ "error": "internal server error" }` |

**Response Headers**:

| Header | Value | Notes |
|--------|-------|-------|
| `Content-Type` | `application/json` | Always present on 200 and error JSON responses |
| `X-Request-Id` | UUID string | Correlation ID from middleware |
| `Cache-Control` | `no-store` | Stub should not be cached; response will change when MCP servers are registered |

#### Future Response Shape Contract

When MCP servers are eventually registered, the endpoint will return an array of objects. The following shape is the forward-compatible contract that clients may code against today:

```json
[
  {
    "id": "string",
    "name": "string",
    "description": "string",
    "server_url": "string",
    "transport": "stdio | sse | streamable-http",
    "status": "available | unavailable | degraded",
    "capabilities": {
      "tools": true,
      "resources": true,
      "prompts": false
    },
    "scope": "user | organization | repository",
    "scope_id": "string | null",
    "created_at": "ISO-8601 string",
    "updated_at": "ISO-8601 string"
  }
]
```

This shape is documented as **advisory / forward-looking** — it is not enforced by the stub and may evolve before full implementation.

### Web UI Design

The Integrations page should include a section or card for MCP that communicates the stub status:

- **MCP Integration Card**: A card or row in the integrations list with the MCP logo/icon, the title "MCP Servers", and a subtitle "Coming soon — Model Context Protocol server discovery and management."
- **Disabled state**: The card should not be clickable or actionable. It should use a muted/disabled visual treatment (reduced opacity, gray text, no hover effect).
- **No empty state needed**: Since the user cannot configure MCP servers yet, there is no "empty list" state. The card itself communicates the stub status.
- **Feature flag gating**: When the `integrations` feature flag is disabled, the MCP card should not appear at all.
- **Placement**: The MCP card should appear after active/configured integration types (e.g., Linear) and before informational guides (e.g., GitHub Mirroring, Notion Sync).

### CLI Command

**Current state**: No dedicated `codeplane extension mcp` subcommand is required for the stub. The endpoint is accessible via the generic API command:

```bash
codeplane api get /api/integrations/mcp
```

This should return `[]` for authenticated users.

**Future CLI surface**: When MCP registration is implemented, the following command tree should be added:
- `codeplane extension mcp list` — List registered MCP servers
- `codeplane extension mcp add` — Register an MCP server
- `codeplane extension mcp remove` — Unregister an MCP server
- `codeplane extension mcp test` — Test connectivity to an MCP server

For the stub phase, no CLI subcommands beyond `codeplane api` are required.

### TUI UI

No TUI changes are required for the stub. The TUI does not currently have an integrations screen.

### SDK Shape

The current stub requires no service-layer implementation beyond the inline route handler. When MCP is fully implemented, the following service interface should be introduced in `packages/sdk`:

```typescript
interface McpDiscoveryService {
  listMcpServers(userId: number): Promise<McpServerEntry[]>;
}
```

For the stub phase, the route handler directly returns `[]` without calling a service method.

### Documentation

1. **Integrations Overview** — A documentation page listing all Codeplane integration types. MCP should appear with a description: "Model Context Protocol (MCP) server discovery. Allows Codeplane agents to discover and invoke tools, resources, and prompts from external MCP-compatible servers. Status: coming soon."
2. **API Reference: `GET /api/integrations/mcp`** — Standard API reference entry documenting the endpoint, authentication requirement, response shape (empty array), and the advisory future response shape.
3. **MCP Integration Roadmap Note** — A brief section in the integrations docs explaining that MCP support is planned, the stub endpoint is stable, and clients can safely code against it.

## Permissions & Security

### Authorization Roles

| Role | Can call `GET /api/integrations/mcp`? | Notes |
|------|---------------------------------------|-------|
| Owner | Yes | Returns `[]` in stub |
| Admin | Yes | Returns `[]` in stub |
| Member | Yes | Returns `[]` in stub |
| Read-Only | Yes | Read-only endpoint; any authenticated user can call it |
| Anonymous / Unauthenticated | No | Returns `401` |

**Important**: The stub does not return user-specific data (it returns `[]` for all users), so there are no cross-user isolation concerns in the current implementation. When MCP servers are registered with user or organization scope, the service layer must enforce user-scoped or org-scoped visibility rules.

### Rate Limiting

- **Per-user rate limit**: Maximum 60 requests per user per minute. The stub performs no I/O, but the rate limit prevents automated probing.
- **Global rate limit**: Maximum 600 requests per minute across all users.
- **Rate limit response**: `429 Too Many Requests` with a `Retry-After` header and body `{ "error": "rate limit exceeded" }`.
- **Burst allowance**: Up to 10 requests in a 1-second window per user.

### Data Privacy & PII

- The stub returns no data, so no PII is exposed.
- The endpoint must not reveal whether MCP servers are configured for other users, organizations, or the instance as a whole.
- Server logs must not include response bodies (even though the body is `[]`).
- The `user_id` of the caller may be logged for audit purposes at `DEBUG` level.
- When MCP is fully implemented, any `server_url` or credential fields must be treated as sensitive and stripped from public responses where appropriate.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `McpDiscoveryListViewed` | User successfully calls `GET /api/integrations/mcp` | `user_id`, `result_count` (always `0` in stub), `timestamp`, `client` (`web`, `cli`, `tui`, `api`, `editor`) |
| `McpDiscoveryListUnauthenticated` | Unauthenticated request hits the endpoint | `timestamp`, `request_ip` (hashed) |
| `McpDiscoveryListRateLimited` | User is rate-limited on the endpoint | `user_id`, `timestamp`, `retry_after_seconds` |
| `McpDiscoveryListFeatureGated` | Request is blocked by feature flag | `user_id`, `timestamp`, `flag_name` (`integrations`) |

### Funnel Metrics & Success Indicators

The MCP discovery stub sits at the very beginning of the future MCP integration funnel:

1. **MCP Discovery Viewed** → `McpDiscoveryListViewed` ← this feature (stub)
2. _(future)_ MCP Server Registered → `McpServerRegistered`
3. _(future)_ MCP Tool Invoked by Agent → `McpToolInvoked`
4. _(future)_ MCP Server Removed → `McpServerRemoved`

**Key success indicators for the stub phase**:

- **Discovery call frequency**: Total `McpDiscoveryListViewed` events per week. Non-zero counts indicate that users, agents, or automation are actively probing the MCP surface. Target: growing week-over-week as the integration-first community forms.
- **Client distribution**: Breakdown of `client` property. If most calls come from `api` or `editor`, it indicates programmatic/agent usage. If from `web`, it indicates user curiosity about the integrations page.
- **Zero-error rate**: The stub should have a 0% error rate (it does no I/O). Any `500` errors indicate a regression in auth middleware or framework wiring. Target: 0.00%.
- **Demand signal for MCP**: The total unique `user_id` values in `McpDiscoveryListViewed` events serves as a demand signal for prioritizing full MCP implementation. Target: track and report monthly.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| MCP discovery list returned | `DEBUG` | `user_id`, `request_id`, `result_count` (always `0`) | Successful 200 response |
| MCP discovery unauthenticated | `WARN` | `request_id`, `remote_addr` | 401 returned |
| MCP discovery feature gated | `INFO` | `user_id`, `request_id`, `flag_name` | 403 returned due to feature flag |
| MCP discovery rate limited | `WARN` | `user_id`, `request_id`, `retry_after` | 429 returned |
| MCP discovery unexpected error | `ERROR` | `user_id`, `request_id`, `error_message`, `error_type`, `stack_trace` | 500 returned (should never happen for stub) |

**Log rules**:
- Always include `request_id` for correlation.
- Log at `DEBUG` for the success path since the stub does no real work — `INFO` would be too noisy.
- Never log authentication credentials (cookies, PATs, bearer tokens).
- Never log response bodies.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_mcp_discovery_list_total` | Counter | `status` (`success`, `unauthorized`, `feature_gated`, `rate_limited`, `error`) | Total MCP discovery requests by outcome |
| `codeplane_mcp_discovery_list_duration_seconds` | Histogram | — | End-to-end request duration (should be extremely fast for the stub) |

### Alerts

#### Alert: `McpDiscoveryUnexpectedErrors`
- **Condition**: `increase(codeplane_mcp_discovery_list_total{status="error"}[1h]) > 0`
- **Severity**: Warning
- **Runbook**:
  1. The MCP discovery stub performs no I/O and should never return 500. Any error indicates a framework-level regression.
  2. Check server logs for `MCP discovery unexpected error` entries. Look at `error_type` and `stack_trace`.
  3. Check recent deployments for changes to the integrations route file, auth middleware, or Hono framework version.
  4. Verify the route is still mounted correctly by running `curl -H "Authorization: Bearer <valid-pat>" https://<host>/api/integrations/mcp`.
  5. If the error is in auth middleware (e.g., `getUser` throws), investigate the auth context loader.
  6. If caused by a framework upgrade, consider rolling back.

#### Alert: `McpDiscoveryHighUnauthenticatedRate`
- **Condition**: `rate(codeplane_mcp_discovery_list_total{status="unauthorized"}[5m]) > 20`
- **Severity**: Info
- **Runbook**:
  1. A high rate of unauthenticated requests to the MCP endpoint may indicate automated scanning or a misconfigured client.
  2. Check server logs for `MCP discovery unauthenticated` entries filtered by `remote_addr`.
  3. If all requests come from the same IP or IP range, consider IP-based rate limiting or blocking at the load balancer.
  4. If requests come from internal infrastructure (e.g., a health check that shouldn't be hitting this endpoint), fix the configuration.
  5. No immediate action is needed; this is informational.

### Error Cases & Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Internal Log Level | Likelihood |
|-------------|-------------|---------------------|--------------------|------------|
| User not authenticated | 401 | `"authentication required"` | WARN | Normal |
| Feature flag disabled | 403 | `"feature not available on your plan"` | INFO | Rare in CE |
| Rate limit exceeded | 429 | `"rate limit exceeded"` | WARN | Rare |
| Auth middleware crash | 500 | `"internal server error"` | ERROR | Extremely rare |
| Hono framework error | 500 | `"internal server error"` | ERROR | Extremely rare |

## Verification

### API Integration Tests

1. **Authenticated user receives 200 with empty array**: Send `GET /api/integrations/mcp` with a valid session cookie. Assert status `200`. Assert body is `[]`.

2. **Authenticated user with PAT receives 200 with empty array**: Send `GET /api/integrations/mcp` with a valid PAT in `Authorization: Bearer <token>` header. Assert status `200`. Assert body is `[]`.

3. **Response body is exactly an empty JSON array**: Parse the response body. Assert `Array.isArray(body)` is `true`. Assert `body.length` is `0`.

4. **Response Content-Type is application/json**: Assert the `Content-Type` header starts with `application/json`.

5. **Response includes X-Request-Id header**: Assert the `X-Request-Id` header is present and is a non-empty string.

6. **Unauthenticated request receives 401**: Send `GET /api/integrations/mcp` without any session cookie or authorization header. Assert status `401`. Assert body is `{ "error": "authentication required" }`.

7. **Expired PAT receives 401**: Send `GET /api/integrations/mcp` with an expired or revoked PAT. Assert status `401`.

8. **Invalid PAT format receives 401**: Send `GET /api/integrations/mcp` with `Authorization: Bearer not-a-real-token`. Assert status `401`.

9. **Feature flag disabled returns 403 or 404**: Disable the `integrations` feature flag (via `CODEPLANE_FEATURE_FLAGS_INTEGRATIONS=false`). Send authenticated `GET /api/integrations/mcp`. Assert status is `403` (with feature-gated error) or `404` (if route is unmounted).

10. **Feature flag re-enabled restores 200**: Re-enable the `integrations` feature flag. Send authenticated `GET /api/integrations/mcp`. Assert status `200` with body `[]`.

11. **Idempotent — repeated calls return identical results**: Send `GET /api/integrations/mcp` 5 times with the same session. Assert all 5 responses have status `200` and body `[]`.

12. **No side effects — endpoint is read-only**: Record database state (row counts in any integration-related tables) before and after 3 calls to the endpoint. Assert no rows were created, modified, or deleted.

13. **Consistent with skills discovery stub**: Send `GET /api/integrations/mcp` and `GET /api/integrations/skills` with the same session. Assert both return `200` with `[]`. Assert both have the same `Content-Type`.

14. **Different users get identical stub response**: Authenticate as User A, call the endpoint, record response. Authenticate as User B, call the endpoint, record response. Assert both responses have status `200` and body `[]`.

15. **POST method not allowed**: Send `POST /api/integrations/mcp` with a valid session and empty body. Assert status is `404` or `405` (not `200`).

16. **PUT method not allowed**: Send `PUT /api/integrations/mcp` with a valid session and empty body. Assert status is `404` or `405`.

17. **DELETE method not allowed**: Send `DELETE /api/integrations/mcp` with a valid session. Assert status is `404` or `405`.

18. **Unknown query parameters are ignored**: Send `GET /api/integrations/mcp?foo=bar&baz=123` with a valid session. Assert status `200` and body `[]`.

19. **Request body on GET is ignored**: Send `GET /api/integrations/mcp` with a JSON body `{"test": true}` and a valid session. Assert status `200` and body `[]`.

20. **Rate limiting enforced**: Send 61 requests within 1 minute with the same user session. Assert that requests beyond the rate limit return `429` with a `Retry-After` header.

21. **Rate limiting does not cross users**: Send 60 requests as User A within 1 minute. Send 1 request as User B in the same window. Assert User B receives `200`.

22. **Response latency is under 100ms**: Send `GET /api/integrations/mcp` and measure the end-to-end round-trip time. Assert it completes in under 100ms.

23. **Concurrent requests are safe**: Send 10 simultaneous `GET /api/integrations/mcp` requests from the same user. Assert all 10 return `200` with `[]` and none return errors.

24. **CORS preflight succeeds**: Send an `OPTIONS /api/integrations/mcp` request with standard CORS headers. Assert the response includes appropriate `Access-Control-Allow-*` headers per the middleware configuration.

25. **Response does not include sensitive headers**: Assert the response does not include headers that leak server internals (e.g., `X-Powered-By`, server version strings).

### E2E Tests (Playwright)

26. **Integrations page shows MCP section**: Sign in. Navigate to the Integrations page. Assert that an MCP-related card, row, or section is visible with text indicating "coming soon" or "MCP Servers".

27. **MCP section is not actionable**: Assert the MCP card/row does not have an active "Connect" or "Configure" button. Assert clicking on it does not navigate or open a dialog.

28. **MCP section hidden when feature flag disabled**: Disable the `integrations` feature flag. Navigate to the Integrations page. Assert the MCP section is not rendered.

29. **Integrations page requires authentication**: Navigate to the Integrations page without signing in. Assert redirect to login page or auth-required state.

### CLI Tests

30. **`codeplane api get /api/integrations/mcp` returns empty array**: Run the generic API command with a valid auth token. Assert stdout contains `[]`. Assert exit code is `0`.

31. **`codeplane api get /api/integrations/mcp` without auth fails**: Run the command without a valid token. Assert stderr contains an authentication error. Assert exit code is non-zero.

32. **Endpoint is reachable through the CLI client abstraction**: Confirm that `api("GET", "/api/integrations/mcp")` from the CLI client library returns an empty array without throwing.
