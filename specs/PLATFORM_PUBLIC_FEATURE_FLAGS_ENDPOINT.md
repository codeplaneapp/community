# PLATFORM_PUBLIC_FEATURE_FLAGS_ENDPOINT

Specification for PLATFORM_PUBLIC_FEATURE_FLAGS_ENDPOINT.

## High-Level User POV

When any Codeplane client — the web application, CLI, TUI, desktop app, or editor plugin — starts up, it needs to know which product features the server currently has enabled. The public feature flags endpoint provides exactly this: a single, unauthenticated API call that returns a simple map of feature names to on/off states.

From the user's perspective, this endpoint is invisible. Users never call it directly under normal circumstances. Instead, clients use it behind the scenes to tailor their experience: hiding navigation items, disabling commands, and omitting screens for features the server administrator has turned off. The result is that a user working with a self-hosted Codeplane instance sees a clean, consistent interface that only surfaces features that are actually available — regardless of whether they are using the web UI, CLI, TUI, desktop app, or an editor integration.

Because the endpoint requires no authentication, clients can query it before a user has logged in. This means the login screen itself, public repository views, and first-time setup flows can all accurately reflect which features are available. There is no awkward intermediate state where a client shows features that will later disappear once the user authenticates and the server rejects access.

For administrators, the endpoint also serves as a quick diagnostic tool. A simple `curl` to the endpoint shows exactly which flags are on and which are off, confirming that environment variable changes took effect after a server restart.

The endpoint returns only boolean values — it never exposes internal configuration details like which plan tiers gate a feature or which users are in a beta cohort. This keeps the public surface simple and safe.

## Acceptance Criteria

### Definition of Done

- [ ] The server exposes a `GET /api/feature-flags` endpoint.
- [ ] The endpoint returns HTTP 200 with a JSON body of shape `{ "flags": Record<string, boolean> }`.
- [ ] The response includes exactly 16 flags: `workspaces`, `agents`, `preview`, `sync`, `billing`, `readout_dashboard`, `landing_queue`, `tool_skills`, `tool_policies`, `repo_snapshots`, `integrations`, `session_replay`, `secrets_manager`, `web_editor`, `client_error_reporting`, `client_metrics`.
- [ ] Every value in the `flags` object is a JSON boolean (`true` or `false`); no other types are present.
- [ ] The endpoint requires no authentication — unauthenticated requests receive the same response as authenticated ones.
- [ ] The endpoint is available as soon as the server has completed startup (flags are loaded during bootstrap, before routes are mounted).
- [ ] In Community Edition with no environment variable overrides, all 16 flags default to `true`.
- [ ] Each flag can be overridden by setting the environment variable `CODEPLANE_FEATURE_FLAGS_<FLAG_NAME_UPPERCASED>` to `"false"` or `"0"` to disable it. Any other value (including empty string, `"true"`, `"1"`, `"yes"`, or absence) leaves the flag enabled.
- [ ] The endpoint reflects the server's current static flag state, not per-user computed values. Beta user IDs and plan tier metadata are never included in the response.
- [ ] The response is stable for the lifetime of the server process — it does not change unless the server is restarted with different environment variables.
- [ ] The endpoint is subject to the global rate limiter (120 requests per minute per identity, with anonymous callers grouped by IP).
- [ ] The response body is valid JSON and uses the `application/json` content type.
- [ ] The response includes appropriate CORS headers so that browser-based clients from different origins can call it.

### Edge Cases

- [ ] An authenticated request (with session cookie or PAT) returns the same flag values as an unauthenticated request.
- [ ] If the feature flag provider fails during server startup, the server still starts and the endpoint returns CE defaults (all flags `true`).
- [ ] If the server is accessed before flag loading completes (race condition during bootstrap), the endpoint returns CE defaults rather than an empty or error response, because flags are initialized to CE defaults in the service constructor.
- [ ] Concurrent requests to the endpoint do not interfere with each other or produce inconsistent snapshots.
- [ ] The response does not include any flags beyond the 16 predefined ones, even if environment variables for unknown flag names are set.
- [ ] A `POST`, `PUT`, `DELETE`, or `PATCH` to `/api/feature-flags` returns 404 or 405 (only `GET` is supported).
- [ ] A request with an `Accept: text/html` header still receives JSON (the endpoint does not content-negotiate).

### Boundary Constraints

- [ ] The response body is at most ~500 bytes (16 flags × ~30 chars each plus JSON structure). Clients should not expect responses larger than 2KB.
- [ ] Flag names in the response are lowercase ASCII with underscores only.
- [ ] The endpoint path is exactly `/api/feature-flags` — no trailing slash variant is required.
- [ ] The endpoint does not accept query parameters. Any query parameters are silently ignored.

## Design

### API Shape

#### `GET /api/feature-flags`

**Authentication**: None required. This is a public endpoint.

**Method**: `GET` only.

**Request headers**: No special headers required. Standard `Accept: application/json` is recommended but not enforced.

**Request body**: None. Any request body is ignored.

**Query parameters**: None. Any query parameters are silently ignored.

**Response** (`200 OK`):

```
Content-Type: application/json
```

```json
{
  "flags": {
    "workspaces": true,
    "agents": true,
    "preview": true,
    "sync": true,
    "billing": true,
    "readout_dashboard": true,
    "landing_queue": true,
    "tool_skills": true,
    "tool_policies": true,
    "repo_snapshots": true,
    "integrations": true,
    "session_replay": true,
    "secrets_manager": true,
    "web_editor": true,
    "client_error_reporting": true,
    "client_metrics": true
  }
}
```

The response always contains all 16 flags. Values are JSON booleans. The flag names are stable string keys. The ordering of keys in the `flags` object is not guaranteed.

**Error responses**:

| Status | Condition | Body |
|--------|-----------|------|
| `429 Too Many Requests` | Rate limit exceeded | Rate limiter default response body |
| `500 Internal Server Error` | Unexpected server error | `{ "message": "internal server error" }` |

The endpoint does not return 401, 403, or 404 under normal operation.

### Web UI Design

The web application calls `GET /api/feature-flags` during initial application load, before route rendering begins. The returned flags are stored in a client-side feature flag store that is read-only and immutable for the session.

- Routes protected by a `FlaggedRoute` guard check the local flag store. If the corresponding flag is `false`, the guard redirects the user to the dashboard or displays a "feature not available" placeholder.
- Sidebar navigation items, command palette entries, dock panels, and any other UI controls for disabled features are hidden entirely — they do not render in the DOM.
- The flag store is not user-modifiable. There is no client-side override mechanism.
- On page reload, the web app re-fetches flags from the server, picking up any changes from a server restart.

### CLI Design

The CLI does not pre-fetch feature flags on startup. When a user invokes a command for a feature that is disabled server-side, the server's `requireFeature` middleware returns 403, and the CLI displays the error message: `Error: feature not available on your plan`.

The CLI may optionally fetch and cache flag state from `/api/feature-flags` for command completion hints or help text filtering, but this is not required for correctness.

### TUI Design

The TUI fetches `GET /api/feature-flags` once during initialization. Screens and navigation entries for disabled flags are omitted from the screen list and command palette. The TUI does not poll for flag changes — a restart of the TUI picks up new flag state.

### Desktop App Design

The desktop app embeds the daemon server and loads the web UI from the local daemon URL. The web UI's standard feature flag fetch naturally queries the embedded server's `/api/feature-flags` endpoint. No additional desktop-specific logic is needed.

### Editor Integration Design

VS Code and Neovim integrations query the daemon's `/api/feature-flags` endpoint during activation. Tree view providers, commands, and status bar items for disabled features are not registered or are hidden based on the flag state.

### SDK Shape

The SDK exports the following from `@codeplane/sdk`:

| Export | Type | Purpose |
|--------|------|---------|
| `FeatureFlagService` | Class | Core service with `loadFeatureFlags()`, `isEnabled()`, `isEnabledSync()`, `getAllFlags()`, `getFlagConfig()` |
| `getFeatureFlagService(provider?)` | Function | Get or create global singleton |
| `createFeatureFlagService(provider?)` | Function | Replace the global singleton (for tests/provider swap) |
| `DefaultFeatureFlagProvider` | Class | CE default provider reading from env vars |
| `FeatureFlagName` | Type | Union of 16 valid flag name strings |
| `PlanTier` | Type | `"free" \| "pro" \| "enterprise"` |
| `FlagDefinition` | Interface | `{ enabled: boolean; plans?: PlanTier[]; betaUserIds?: number[] }` |
| `FlagConfig` | Type | `Record<FeatureFlagName, FlagDefinition>` |
| `FeatureFlagProvider` | Interface | `{ loadFeatureFlags(): Promise<FlagConfig>; getUserPlan?(userId): Promise<PlanTier> }` |

The `getAllFlags()` method returns the flat `Record<string, boolean>` used by the endpoint. It reflects only the static `enabled` value — no per-user evaluation.

### Documentation

The following end-user documentation must be provided:

1. **Administration Guide — Feature Flags section**: Document all 16 flags with human-readable descriptions, the environment variable naming convention (`CODEPLANE_FEATURE_FLAGS_<FLAG_NAME_UPPERCASED>`), how to enable/disable flags, and the requirement to restart the server after changes.

2. **API Reference — `GET /api/feature-flags`**: Document the endpoint URL, method, authentication (none), request/response shape, rate limiting, and example `curl` command with sample response.

3. **Self-hosting Guide**: Include a section on feature flag configuration as part of initial server setup, with example `.env` entries for common configurations (e.g., disabling billing or workspaces).

4. **Troubleshooting Guide**: Document what happens when a feature is disabled — 403 from protected API routes, hidden UI elements, CLI error messages — and how to verify current flag state by querying the endpoint directly.

## Permissions & Security

### Authorization

| Actor | `GET /api/feature-flags` | Notes |
|-------|--------------------------|-------|
| Anonymous (no auth) | ✅ Allowed | Primary use case — clients query before login |
| Authenticated user (any role) | ✅ Allowed | Returns identical response to anonymous |
| Admin | ✅ Allowed | Returns identical response; admin-specific flag config is available via separate admin endpoints, not this one |

There is no write API for feature flags. Flag configuration is controlled exclusively through server environment variables by the server operator. No API, CLI, or UI surface allows modifying flag state at runtime.

### Rate Limiting

- The endpoint is subject to the global rate limiter: **120 requests per minute per identity**.
- Anonymous callers are grouped by IP address.
- Authenticated callers are grouped by user identity.
- This limit is generous for the expected use case (one fetch per client session startup). The rate limiter protects against abusive polling or scraping attempts.
- When rate-limited, the endpoint returns `429 Too Many Requests`.

### Data Privacy

- The endpoint exposes **zero PII**. The response contains only flag names (static strings) and boolean values.
- Internal configuration metadata — `betaUserIds`, `plans`, plan tier assignments — is **never** included in the public response. These fields are only accessible via `getFlagConfig()`, which must only be exposed on authenticated admin endpoints.
- The endpoint does not log or store the identity of callers beyond what the global rate limiter and structured request logging require.
- No cookies are set or read by this endpoint beyond the standard auth context loader (which is a no-op for unauthenticated requests).
- The flag names themselves do not constitute sensitive information — they describe product feature areas, not internal system details.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `FeatureFlagsQueried` | `GET /api/feature-flags` is called | `callerIpHash: string` (SHA-256 truncated), `userAgent: string`, `authenticated: boolean`, `userId: number \| null`, `responseFlags: Record<string, boolean>` |
| `FeatureFlagsLoaded` | Server completes flag loading during bootstrap | `flagCount: number`, `disabledFlags: string[]`, `enabledFlags: string[]`, `providerType: string`, `loadDurationMs: number` |

### Funnel Metrics & Success Indicators

- **Client flag-fetch coverage**: Percentage of web UI sessions that successfully fetch flags before first route render. Target: >99%. A low value indicates the endpoint is slow, unreachable, or the client is not correctly calling it.
- **Flag-fetch latency (p50/p95)**: `GET /api/feature-flags` response time. Target: p50 <5ms, p95 <20ms. This endpoint returns in-memory data, so high latency indicates server-level issues, not flag-specific problems.
- **403 rate from feature gating (downstream)**: Rate of `requireFeature` middleware 403 responses. If this rate is high relative to the number of disabled flags, it indicates clients are not correctly consuming the flags endpoint to hide disabled features.
- **Flag customization rate**: Percentage of self-hosted instances (via optional anonymous telemetry) that have at least one flag overridden from default. Indicates adoption of the feature flag system.
- **Unique callers per interval**: Number of distinct IPs/users fetching flags per hour. Useful for capacity planning and detecting polling abuse.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|-------------------|
| Feature flags endpoint called | `debug` | `{ event: "feature_flags_endpoint_called", method: "GET", path: "/api/feature-flags", callerIp: string, authenticated: boolean, userId: number \| null }` |
| Feature flags loaded during bootstrap | `info` | `{ event: "feature_flags_loaded", flagCount: number, disabledFlags: string[], providerType: string, durationMs: number }` |
| Feature flags load failed, falling back to CE defaults | `warn` | `{ event: "feature_flags_load_failed", error: string, providerType: string, fallbackApplied: true }` |
| Rate limit exceeded on flags endpoint | `info` | `{ event: "rate_limit_exceeded", path: "/api/feature-flags", callerIp: string }` |

The endpoint itself does not log at `info` level on every request (it is too high-traffic for per-request info logging). The `debug` level log is available for troubleshooting but suppressed in production by default.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_feature_flags_endpoint_requests_total` | Counter | `status: "200" \| "429" \| "500"` | Total HTTP requests to `GET /api/feature-flags` |
| `codeplane_feature_flags_endpoint_duration_seconds` | Histogram | (none) | Response latency of the flags endpoint |
| `codeplane_feature_flags_enabled` | Gauge | `flag: string` | Current state of each flag (1 = enabled, 0 = disabled). Set once at startup. 16 time series. |
| `codeplane_feature_flags_load_total` | Counter | `status: "success" \| "fallback"` | Total flag load operations (bootstrap + any reloads) |
| `codeplane_feature_flags_load_duration_seconds` | Histogram | `provider: string` | Duration of flag loading from provider |

### Alerts

#### Alert: `FeatureFlagEndpointDown`

**Condition**: `up{job="codeplane"} == 1` AND `rate(codeplane_feature_flags_endpoint_requests_total{status="200"}[5m]) == 0` AND `rate(codeplane_feature_flags_endpoint_requests_total{status!="200"}[5m]) > 0` for 5 minutes.

**Severity**: Critical

**Runbook**:
1. The server is up but the flags endpoint is returning errors. Check `codeplane_feature_flags_endpoint_requests_total` by status label to determine the error status code.
2. If status is `500`: Check server logs for unhandled exceptions in `handleGetFeatureFlags`. The most likely cause is the feature flag singleton being in a corrupted state. Restart the server.
3. If status is `429` for all callers: The global rate limiter may be misconfigured or a DDoS is overwhelming the limiter. Check rate limiter configuration and incoming request volume.
4. Verify the endpoint is reachable by running `curl -v http://<server>/api/feature-flags` from within the server's network.
5. If the endpoint is unreachable, check Hono route mounting — the `/api/feature-flags` route may have been accidentally removed or shadowed by another route.

#### Alert: `FeatureFlagEndpointLatencyHigh`

**Condition**: `histogram_quantile(0.95, rate(codeplane_feature_flags_endpoint_duration_seconds_bucket[5m])) > 0.1` for 5 minutes.

**Severity**: Warning

**Runbook**:
1. The flags endpoint is a pure in-memory read and should respond in <5ms at p95. Latency >100ms indicates a systemic server issue, not a flag-specific problem.
2. Check overall server CPU and memory utilization. The flag endpoint shares the middleware stack (request ID, logging, CORS, rate limiting, auth context), so middleware bottlenecks affect it.
3. Check the global rate limiter — if the rate limiter's backing store is slow, all endpoints including flags will be affected.
4. If the server is under heavy load, scale horizontally or investigate the root cause of resource pressure.
5. Verify no expensive middleware has been accidentally added before the flags route.

#### Alert: `FeatureFlagLoadFailure`

**Condition**: `increase(codeplane_feature_flags_load_total{status="fallback"}[5m]) > 0`.

**Severity**: Warning

**Runbook**:
1. Check server logs for `feature_flags_load_failed` entries to identify the provider error.
2. If using the default CE provider: Check that `CODEPLANE_FEATURE_FLAGS_*` environment variables are syntactically valid. The CE provider should not fail — if it does, it indicates an environment access issue.
3. If using a custom provider (Cloud): Verify the provider's backing store (database, LaunchDarkly, etc.) is reachable from the server.
4. The server is running with CE defaults (all flags `true`), so no features are broken for users, but intended gating policies are not applied.
5. Resolve the provider issue and restart the server to trigger a fresh flag load.

#### Alert: `AllFlagsDisabled`

**Condition**: `sum(codeplane_feature_flags_enabled) == 0` for 2 minutes.

**Severity**: Critical

**Runbook**:
1. All 16 feature flags are disabled. This is almost certainly a misconfiguration, not intentional.
2. Check environment variables: `env | grep CODEPLANE_FEATURE_FLAGS_`. If all are set to `"false"` or `"0"`, this was likely an error in configuration management (e.g., a template expansion failure that set all flags to the same value).
3. Correct the environment variables and restart the server.
4. If this is intentional (e.g., a maintenance window), acknowledge the alert.

### Error Cases and Failure Modes

| Failure Mode | Impact | Behavior |
|--------------|--------|----------|
| Feature flag provider throws during `loadFeatureFlags()` | Flag config not loaded from provider | Endpoint returns CE defaults (all `true`). Warning logged. |
| Singleton accessed before `loadFeatureFlags()` is called | Stale state | Endpoint returns CE defaults (constructor initializes with defaults). |
| Server under extreme load | High latency | Endpoint responds slowly but correctly. Rate limiter may shed excess requests with 429. |
| Flag service singleton corrupted (code bug) | Endpoint 500s | Server restart required. Alert `FeatureFlagEndpointDown` fires. |
| Network partition between client and server | Client cannot reach endpoint | Client should fall back to assuming all features enabled (CE behavior) or display a connection error. |
| CORS misconfiguration | Browser clients blocked | Browser shows CORS error. Fix CORS middleware configuration. |

## Verification

### API Integration Tests

- [ ] `GET /api/feature-flags` returns HTTP 200.
- [ ] `GET /api/feature-flags` response body has shape `{ flags: Record<string, boolean> }`.
- [ ] `GET /api/feature-flags` response contains exactly 16 flag keys.
- [ ] `GET /api/feature-flags` response contains all expected flag names: `workspaces`, `agents`, `preview`, `sync`, `billing`, `readout_dashboard`, `landing_queue`, `tool_skills`, `tool_policies`, `repo_snapshots`, `integrations`, `session_replay`, `secrets_manager`, `web_editor`, `client_error_reporting`, `client_metrics`.
- [ ] Every value in `response.flags` is a JSON boolean (not a string, number, null, array, or object).
- [ ] With no environment variable overrides, all 16 flags are `true` (CE defaults).
- [ ] `GET /api/feature-flags` with no authentication (no cookie, no PAT, no Authorization header) returns 200 with full flag data.
- [ ] `GET /api/feature-flags` with a valid session cookie returns 200 with the same flag values as the unauthenticated call.
- [ ] `GET /api/feature-flags` with a valid PAT returns 200 with the same flag values as the unauthenticated call.
- [ ] Response `Content-Type` header is `application/json` (or `application/json; charset=utf-8`).
- [ ] Response body is valid JSON (parseable without error).
- [ ] Response does not include `betaUserIds`, `plans`, or any non-boolean values.
- [ ] `POST /api/feature-flags` returns 404 or 405.
- [ ] `PUT /api/feature-flags` returns 404 or 405.
- [ ] `DELETE /api/feature-flags` returns 404 or 405.
- [ ] `PATCH /api/feature-flags` returns 404 or 405.

### Environment Variable Override Tests

- [ ] Setting `CODEPLANE_FEATURE_FLAGS_LANDING_QUEUE=false` causes `landing_queue` to be `false` in the response while all other flags remain `true`.
- [ ] Setting `CODEPLANE_FEATURE_FLAGS_WEB_EDITOR=0` causes `web_editor` to be `false`.
- [ ] Setting `CODEPLANE_FEATURE_FLAGS_AGENTS=""` (empty string) keeps `agents` as `true`.
- [ ] Setting `CODEPLANE_FEATURE_FLAGS_PREVIEW=true` keeps `preview` as `true`.
- [ ] Setting `CODEPLANE_FEATURE_FLAGS_PREVIEW=1` keeps `preview` as `true`.
- [ ] Setting `CODEPLANE_FEATURE_FLAGS_PREVIEW=yes` keeps `preview` as `true`.
- [ ] Setting `CODEPLANE_FEATURE_FLAGS_PREVIEW=TRUE` keeps `preview` as `true`.
- [ ] Setting `CODEPLANE_FEATURE_FLAGS_NONEXISTENT=false` does not add a `nonexistent` key to the response and does not cause an error.
- [ ] Setting all 16 flags to `false` via environment variables results in all 16 flags being `false` in the response.
- [ ] Setting all 16 flags to `true` via environment variables results in all 16 flags being `true` in the response.
- [ ] After disabling a flag, restarting the server, then removing the env var and restarting again, the flag returns to `true`.

### Rate Limiting Tests

- [ ] Sending 120 requests within 60 seconds from the same anonymous IP all return 200.
- [ ] The 121st request within the same 60-second window returns 429.
- [ ] After the rate limit window expires, subsequent requests return 200 again.

### CORS Tests

- [ ] A preflight `OPTIONS` request to `/api/feature-flags` with `Origin` header returns appropriate CORS headers.
- [ ] A `GET` request with `Origin` header receives `Access-Control-Allow-Origin` in the response.

### Provider Failure Resilience Tests

- [ ] If the feature flag provider throws during `loadFeatureFlags()`, the server still starts successfully.
- [ ] If the provider fails, the endpoint returns CE defaults (all 16 flags `true`).
- [ ] The server logs a warning when the provider fails and fallback is applied.

### Response Stability Tests

- [ ] Two consecutive calls to `GET /api/feature-flags` (without server restart) return identical response bodies.
- [ ] The response body byte length is under 2KB.
- [ ] The response is returned in under 50ms (in-memory read should be fast).

### Maximum Input / Boundary Tests

- [ ] An environment variable value of 1001 characters for a flag (e.g., `CODEPLANE_FEATURE_FLAGS_AGENTS=<1001 chars>`) is treated as enabled (not `"false"` or `"0"`) and does not cause a server error.
- [ ] A request with a 10KB request body (unusual for GET but possible) is handled without error; the body is ignored.
- [ ] A request with 50 query parameters is handled without error; query parameters are ignored.
- [ ] A request with an `Accept` header of `text/html` still returns JSON.

### End-to-End Tests (Playwright / Web UI)

- [ ] On initial web app load, the browser makes a `GET /api/feature-flags` network request before any route rendering.
- [ ] With all flags enabled (default), all sidebar navigation items are visible (workspaces, agents, integrations, etc.).
- [ ] With `workspaces` flag disabled server-side, the workspaces navigation item is not visible in the sidebar after page load.
- [ ] With `landing_queue` flag disabled, navigating directly to the landing queue URL redirects the user away.
- [ ] With `agents` flag disabled, agent dock and agent-related navigation are hidden.
- [ ] After disabling a flag server-side and reloading the web page, the corresponding UI surface is hidden.
- [ ] With a flag disabled, the corresponding `FlaggedRoute` guard does not render the gated component.

### CLI End-to-End Tests

- [ ] `codeplane workspace list` against a server with `workspaces` flag disabled prints an error containing "feature not available" and exits with a non-zero exit code.
- [ ] `codeplane workspace list` against a server with `workspaces` flag enabled completes without a feature-gating error.
- [ ] `codeplane agent` subcommands against a server with `agents` flag disabled return a feature-gating error.

### TUI End-to-End Tests

- [ ] TUI launched against a server with all flags enabled shows all screens in navigation.
- [ ] TUI launched against a server with `agents` disabled omits agent chat and agent session screens from navigation.
- [ ] TUI launched against a server with `workspaces` disabled omits workspace screens from navigation.
