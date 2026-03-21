# PLATFORM_FEATURE_FLAG_LOADING

Specification for PLATFORM_FEATURE_FLAG_LOADING.

## High-Level User POV

When a Codeplane instance starts up, the platform automatically loads a set of feature flags that control which product areas are available to users. This system exists so that administrators can selectively enable or disable entire product surfaces — such as workspaces, agents, the landing queue, the web editor, or session replay — without redeploying code.

From a user's perspective, feature flags are invisible when everything is enabled. In Community Edition, all features are on by default, and the experience is seamless. When an administrator disables a feature, users simply do not see the corresponding UI routes, navigation items, or controls. Attempting to access a disabled feature's API endpoints returns a clear rejection rather than broken behavior or cryptic errors.

Clients — the web application, CLI, TUI, desktop app, and editor integrations — can query a public endpoint at startup to learn which features the server has enabled. This lets each client tailor its navigation and command availability to match the server's current configuration, providing a consistent experience regardless of which client surface a user is working in.

For administrators operating a self-hosted Codeplane instance, feature flag configuration is done through environment variables on the server. There is no runtime admin UI for toggling flags; this is an intentional simplicity choice for the Community Edition. The administrator sets environment variables, restarts the server, and the new flag state takes effect immediately and is visible to all connected clients.

The feature flag system also supports forward-looking plan-based and beta-user gating hooks, so that a Cloud or enterprise deployment can restrict certain features to specific subscription tiers or beta cohorts. In the Community Edition, these hooks exist but do not restrict anything — every user gets every enabled feature.

## Acceptance Criteria

### Definition of Done

- [ ] Feature flags are loaded from the configured provider during server bootstrap, after database and service registry initialization but before SSH server startup and route mounting.
- [ ] All 16 predefined flag names are supported: `workspaces`, `agents`, `preview`, `sync`, `billing`, `readout_dashboard`, `landing_queue`, `tool_skills`, `tool_policies`, `repo_snapshots`, `integrations`, `session_replay`, `secrets_manager`, `web_editor`, `client_error_reporting`, `client_metrics`.
- [ ] In Community Edition, all flags default to `enabled: true`.
- [ ] Each flag can be overridden via environment variable `CODEPLANE_FEATURE_FLAGS_<FLAG_NAME_UPPERCASED>`, where the value `"false"` or `"0"` disables the flag and any other value (including absence) leaves it enabled.
- [ ] The public endpoint `GET /api/feature-flags` returns a JSON object `{ "flags": Record<string, boolean> }` containing all current flag values.
- [ ] The public endpoint requires no authentication.
- [ ] The `requireFeature(flagName)` middleware returns HTTP 403 with `{ "message": "feature not available on your plan" }` when a flag is disabled for the requesting user.
- [ ] Flag evaluation supports three-tier precedence: (1) beta user ID override, (2) plan-tier gating, (3) static enabled value.
- [ ] A synchronous evaluation path (`isEnabledSync`) is available for hot paths that cannot tolerate async.
- [ ] The feature flag service is available as a global singleton from `@codeplane/sdk`.
- [ ] The raw flag configuration (including `plans` and `betaUserIds` metadata) is available via a separate accessor for admin/debug endpoints.
- [ ] Flag loading is resilient: if the provider fails, the server still starts with CE_DEFAULTS applied.

### Edge Cases

- [ ] An environment variable set to an empty string (e.g., `CODEPLANE_FEATURE_FLAGS_AGENTS=""`) must be treated as enabled (only `"false"` and `"0"` disable).
- [ ] An environment variable for an unknown flag name (e.g., `CODEPLANE_FEATURE_FLAGS_NONEXISTENT=false`) must be silently ignored and must not cause a startup error.
- [ ] Querying `isEnabled` for an undefined/unknown flag name must return `false`.
- [ ] Querying `isEnabledSync` for an undefined/unknown flag name must return `false`.
- [ ] If a provider's `getUserPlan` method is not implemented but a flag has plan-gating configured, evaluation must fall through to the static `enabled` value rather than throwing.
- [ ] `getAllFlags()` must return only the static `enabled` value (not per-user computed values), since it is used for the public endpoint.
- [ ] Calling `loadFeatureFlags()` multiple times must fully replace the previous flag state (not merge).
- [ ] Creating a new service via `createFeatureFlagService()` must replace the global singleton, not create a second parallel instance.

### Boundary Constraints

- [ ] Flag names must be lowercase ASCII with underscores only (validated by the TypeScript union type at compile time).
- [ ] The `betaUserIds` array, if present, must contain only positive integers (user IDs).
- [ ] The `plans` array, if present, must contain only valid `PlanTier` values: `"free"`, `"pro"`, `"enterprise"`.
- [ ] The environment variable prefix `CODEPLANE_FEATURE_FLAGS_` is case-sensitive; flag names are uppercased in the variable name.

## Design

### API Shape

#### `GET /api/feature-flags`

**Authentication**: None required (public endpoint).

**Rate limiting**: Subject to the global rate limiter (120 req/min per identity, anonymous identity grouped by IP).

**Response** (`200 OK`):

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

The response always includes all 16 flags. Values reflect the static `enabled` state (environment variable overrides applied), not per-user plan/beta evaluation.

#### Route-level gating (middleware)

Any API route protected by `requireFeature(flagName)` returns:

**Response when disabled** (`403 Forbidden`):

```json
{
  "message": "feature not available on your plan"
}
```

This middleware evaluates per-request, including user-specific beta and plan checks when a user is authenticated.

### SDK Shape

The SDK exports the following from `@codeplane/sdk`:

| Export | Type | Purpose |
|--------|------|---------|
| `FeatureFlagService` | Class | Core service with `loadFeatureFlags()`, `isEnabled()`, `isEnabledSync()`, `getAllFlags()`, `getFlagConfig()` |
| `getFeatureFlagService(provider?)` | Function | Get or create global singleton |
| `createFeatureFlagService(provider?)` | Function | Replace the global singleton (for tests/provider swap) |
| `DefaultFeatureFlagProvider` | Class | CE default provider reading from env vars |
| `FeatureFlagName` | Type | Union of 16 valid flag name strings |
| `PlanTier` | Type | `"free" | "pro" | "enterprise"` |
| `FlagDefinition` | Interface | `{ enabled: boolean; plans?: PlanTier[]; betaUserIds?: number[] }` |
| `FlagConfig` | Type | `Record<FeatureFlagName, FlagDefinition>` |
| `FeatureFlagProvider` | Interface | `{ loadFeatureFlags(): Promise<FlagConfig>; getUserPlan?(userId): Promise<PlanTier> }` |

### Web UI Design

The web application fetches `GET /api/feature-flags` on initial load (before establishing a user session). The returned flag map is stored in a client-side feature flag store.

- Routes gated behind a disabled flag use a `FlaggedRoute` guard that redirects the user away (e.g., to the dashboard or a "feature not available" page) rather than rendering a broken view.
- Navigation sidebar items, command palette entries, and dock panels for disabled features are hidden entirely — users never see menu items for features that are turned off.
- The flag store is read-only on the client; there is no client-side mechanism to override server flags.

### CLI Design

The CLI does not pre-fetch feature flags at startup. Instead, it relies on server-side enforcement: if a user invokes a command for a disabled feature, the server's `requireFeature` middleware returns a 403, and the CLI displays the error message to the user.

This design avoids adding a network round-trip to every CLI invocation. The CLI may optionally cache flag state from the health or feature-flags endpoint for command completion hints, but this is not required for correctness.

### TUI Design

The TUI fetches the feature flags endpoint once during its initialization screen rendering. Screens and navigation entries corresponding to disabled flags are omitted from the screen list and command palette.

### Desktop App Design

The desktop app inherits flag behavior from the embedded daemon server. Since it loads the web UI from the local daemon URL, the web UI's feature flag fetch naturally queries the embedded server's `/api/feature-flags` endpoint.

### Editor Integration Design

VS Code and Neovim integrations query the daemon's feature flags endpoint when activating. Tree view providers, commands, and status bar items for disabled features are not registered or are hidden.

### Documentation

The following end-user documentation must be provided:

1. **Administration Guide — Feature Flags section**: Document all 16 flags with human-readable descriptions, the environment variable naming convention, how to enable/disable flags, and the requirement to restart the server after changes.
2. **API Reference — `GET /api/feature-flags`**: Document the public endpoint, its response shape, and the fact that it requires no authentication.
3. **Self-hosting Guide**: Include a section on feature flag configuration as part of initial server setup, with example `.env` entries.
4. **Troubleshooting Guide**: Document what happens when a feature is disabled (403 from API, hidden UI routes, CLI error messages) and how to verify current flag state via the API endpoint.

## Permissions & Security

### Authorization

| Actor | Access to `GET /api/feature-flags` | Feature-gated route access |
|-------|-----------------------------------|---------------------------|
| Anonymous | ✅ Full read | ❌ 403 if flag disabled |
| Authenticated user (any role) | ✅ Full read | ✅ if flag enabled for their plan/beta status |
| Admin | ✅ Full read | ✅ Always (no additional admin bypass currently) |

**Flag configuration** (environment variables) is only accessible to the server process operator — it is not exposed through any API. There is no runtime write API for feature flags.

### Rate Limiting

- The `/api/feature-flags` endpoint is subject to the global rate limiter: **120 requests per minute per identity** (IP-based for anonymous callers).
- This is sufficient because clients should fetch flags once at startup, not poll continuously.
- If a specific client misbehaves, the global rate limiter blocks all their requests, not just flag requests.

### Data Privacy

- The feature flags endpoint exposes **no PII**. It returns only flag names and boolean values.
- The `betaUserIds` field in flag configuration is server-internal and is **never** included in the public `getAllFlags()` response.
- The `getFlagConfig()` method (which includes `betaUserIds` and `plans`) must only be exposed on authenticated admin endpoints, never publicly.
- Plan tier information for a specific user is never included in the public flags response; per-user evaluation happens only server-side during `requireFeature` middleware execution.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `FeatureFlagsLoaded` | Server bootstrap completes flag loading | `flagCount: number`, `disabledFlags: string[]`, `providerType: string`, `loadDurationMs: number` |
| `FeatureFlagChecked` | `requireFeature` middleware evaluates a flag | `flagName: string`, `enabled: boolean`, `userId: number | null`, `method: "sync" | "async"` |
| `FeatureFlagDenied` | `requireFeature` middleware rejects a request | `flagName: string`, `userId: number | null`, `route: string`, `statusCode: 403` |
| `FeatureFlagsQueried` | `GET /api/feature-flags` is called | `callerIp: string` (hashed), `userAgent: string`, `responseFlags: Record<string, boolean>` |

### Funnel Metrics & Success Indicators

- **Flag adoption rate**: Percentage of self-hosted instances that have customized at least one flag (measured via optional anonymous telemetry).
- **403 rate from feature gating**: If the rate of `FeatureFlagDenied` events is high, it indicates users are encountering disabled features they expect to use — a signal that UI hiding is not working correctly.
- **Client flag-fetch latency**: p50/p95 latency of `GET /api/feature-flags` — should remain under 5ms since it's a simple in-memory read.
- **Flag load failure rate**: Number of `FeatureFlagsLoaded` events with fallback to CE_DEFAULTS vs. successful provider loads.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|-------------------|
| Feature flags loaded successfully | `info` | `{ event: "feature_flags_loaded", flagCount: number, disabledFlags: string[], providerType: string, durationMs: number }` |
| Feature flags load failed, falling back to defaults | `warn` | `{ event: "feature_flags_load_failed", error: string, providerType: string, fallbackApplied: true }` |
| Feature flag denied request | `info` | `{ event: "feature_flag_denied", flagName: string, userId: number | null, route: string, method: string }` |
| Feature flag provider replaced (singleton swap) | `info` | `{ event: "feature_flag_provider_replaced", previousProviderType: string, newProviderType: string }` |
| Unknown flag name queried | `debug` | `{ event: "feature_flag_unknown", flagName: string }` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_feature_flags_load_total` | Counter | `status: "success" | "fallback"` | Total feature flag load operations |
| `codeplane_feature_flags_load_duration_seconds` | Histogram | `provider: string` | Duration of flag loading from provider |
| `codeplane_feature_flag_check_total` | Counter | `flag: string, result: "enabled" | "disabled"` | Total flag evaluations |
| `codeplane_feature_flag_denied_total` | Counter | `flag: string, route: string` | Total 403 responses from feature gating |
| `codeplane_feature_flags_endpoint_requests_total` | Counter | `status: "200"` | Total requests to the public flags endpoint |
| `codeplane_feature_flags_enabled` | Gauge | `flag: string` | Current state of each flag (1 = enabled, 0 = disabled) |

### Alerts

#### Alert: `FeatureFlagLoadFailure`

**Condition**: `codeplane_feature_flags_load_total{status="fallback"} > 0` within the last 5 minutes.

**Severity**: Warning

**Runbook**:
1. Check server logs for `feature_flags_load_failed` entries to identify the error.
2. If using a custom provider (Cloud), verify the provider's backing store (database, LaunchDarkly, etc.) is reachable.
3. If using the default CE provider, check that environment variables are syntactically valid (no special characters in values).
4. Verify the server has read access to its environment. On containerized deployments, ensure env vars are properly injected.
5. The server will be operating with CE_DEFAULTS (all enabled), so no features are broken — but gating policies are not applied. Resolve the provider issue and trigger a flag reload or server restart.

#### Alert: `HighFeatureFlagDenialRate`

**Condition**: `rate(codeplane_feature_flag_denied_total[5m]) > 10` sustained for 10 minutes.

**Severity**: Warning

**Runbook**:
1. Check which `flag` label is producing the most denials.
2. If a flag was recently disabled, this is expected during the transition period while client caches expire. Wait 5 minutes and re-evaluate.
3. If the flag is supposed to be enabled, check `CODEPLANE_FEATURE_FLAGS_<FLAG>` env var — it may be set to `"false"` or `"0"` unintentionally.
4. If denials are coming from a specific user, check whether they are on a plan tier that excludes the feature (Cloud only).
5. Verify that the web UI and CLI are correctly hiding disabled feature entry points — high denial rates may indicate a client is showing buttons/commands for features that are disabled server-side.

#### Alert: `FeatureFlagEndpointLatencyHigh`

**Condition**: `histogram_quantile(0.95, codeplane_feature_flags_endpoint_requests_duration_seconds) > 0.1` for 5 minutes.

**Severity**: Warning

**Runbook**:
1. The flags endpoint is a pure in-memory read and should respond in <5ms. High latency suggests middleware bottlenecks, not flag logic.
2. Check the global rate limiter — the caller may be throttled.
3. Check overall server load (`codeplane_http_request_duration_seconds` histogram) for systemic slowness.
4. If the server is overloaded, scale horizontally or investigate the root cause of CPU/memory pressure.

### Error Cases and Failure Modes

| Failure Mode | Impact | Behavior |
|--------------|--------|----------|
| Custom provider throws during `loadFeatureFlags()` | Flag config not loaded | Service falls back to CE_DEFAULTS; all features enabled. Warning logged. |
| Custom provider's `getUserPlan()` throws | Per-user evaluation fails | Evaluation falls through to static `enabled` value. Error logged per request. |
| Singleton accessed before `loadFeatureFlags()` called | Stale state | Service initializes with CE_DEFAULTS in the constructor, so flags are usable but reflect defaults, not provider state. |
| Environment variable contains unexpected value (e.g., `"yes"`, `"TRUE"`) | Ambiguous | Flag is treated as enabled (only `"false"` and `"0"` disable). This is documented and intentional. |
| Server restarts with changed env vars | Flag state changes | New flag state takes effect immediately after restart. Connected clients must re-fetch `/api/feature-flags` to reflect changes. |

## Verification

### API Integration Tests

- [ ] **`GET /api/feature-flags` returns all 16 flags with default CE values (all true)**. Assert response is `200`, body is `{ flags: { workspaces: true, agents: true, ... } }`, and all 16 keys are present.
- [ ] **`GET /api/feature-flags` returns correct values when env vars override defaults**. Set `CODEPLANE_FEATURE_FLAGS_LANDING_QUEUE=false` and `CODEPLANE_FEATURE_FLAGS_WEB_EDITOR=0`, reload flags, and assert those two flags are `false` while all others remain `true`.
- [ ] **`GET /api/feature-flags` is accessible without authentication**. Call with no session cookie, no PAT, no auth header. Assert `200`.
- [ ] **`GET /api/feature-flags` is accessible with authentication**. Call with a valid PAT. Assert `200` with the same flag values as the unauthenticated call.
- [ ] **`GET /api/feature-flags` response contains exactly 16 flags**. Assert `Object.keys(body.flags).length === 16`.
- [ ] **`GET /api/feature-flags` response contains only boolean values**. Assert every value in `body.flags` is `typeof boolean`.
- [ ] **`GET /api/feature-flags` does not leak `betaUserIds` or `plans` metadata**. Assert no value in the response is an array or object.
- [ ] **`GET /api/feature-flags` subject to rate limiting**. Send 121 requests within 60 seconds from the same IP and assert the 121st returns `429`.

### Feature Flag Service Integration Tests

- [ ] **`loadFeatureFlags()` with default provider returns CE_DEFAULTS**. Create service with no custom provider, load, assert all 16 flags enabled.
- [ ] **`loadFeatureFlags()` reads env var overrides**. Set `CODEPLANE_FEATURE_FLAGS_AGENTS=false`, load, assert `agents` is disabled, all others enabled.
- [ ] **`loadFeatureFlags()` treats `"0"` as disabled**. Set `CODEPLANE_FEATURE_FLAGS_SYNC=0`, load, assert `sync` is disabled.
- [ ] **`loadFeatureFlags()` treats empty string as enabled**. Set `CODEPLANE_FEATURE_FLAGS_BILLING=""`, load, assert `billing` is enabled.
- [ ] **`loadFeatureFlags()` treats `"true"` as enabled**. Set `CODEPLANE_FEATURE_FLAGS_PREVIEW=true`, load, assert `preview` is enabled.
- [ ] **`loadFeatureFlags()` treats `"1"` as enabled**. Set `CODEPLANE_FEATURE_FLAGS_PREVIEW=1`, load, assert `preview` is enabled.
- [ ] **`loadFeatureFlags()` treats `"yes"` as enabled**. Set `CODEPLANE_FEATURE_FLAGS_PREVIEW=yes`, load, assert `preview` is enabled.
- [ ] **`loadFeatureFlags()` ignores unknown env vars**. Set `CODEPLANE_FEATURE_FLAGS_NONEXISTENT=false`, load, assert no error thrown and all 16 standard flags are present.
- [ ] **`loadFeatureFlags()` replaces previous state entirely**. Load once with `AGENTS=false`, then clear env var and reload. Assert `agents` is now enabled.
- [ ] **`isEnabled()` returns `false` for unknown flag name**. Call `isEnabled("totally_fake" as any)` and assert `false`.
- [ ] **`isEnabledSync()` returns `false` for unknown flag name**. Call `isEnabledSync("totally_fake" as any)` and assert `false`.
- [ ] **`isEnabled()` with beta user override returns `true` even when flag is disabled**. Configure a flag with `enabled: false, betaUserIds: [42]`. Assert `isEnabled(flagName, 42)` returns `true`.
- [ ] **`isEnabled()` with beta user override returns `false` for non-beta user**. Same config as above. Assert `isEnabled(flagName, 99)` returns `false`.
- [ ] **`isEnabled()` with plan gating returns `true` for matching plan**. Configure flag with `enabled: false, plans: ["pro"]`. Provide a provider that returns `"pro"` for user 1. Assert `isEnabled(flagName, 1)` returns `true`.
- [ ] **`isEnabled()` with plan gating returns `false` for non-matching plan**. Same config. Provider returns `"free"` for user 2. Assert `isEnabled(flagName, 2)` returns `false`.
- [ ] **`isEnabled()` falls through to static value when no `getUserPlan` on provider**. Configure flag with `plans: ["pro"]`, use a provider with no `getUserPlan`. Assert result equals the static `enabled` value.
- [ ] **`getAllFlags()` returns flat boolean map**. Load with one flag disabled. Assert result is `Record<string, boolean>` with 16 entries.
- [ ] **`getFlagConfig()` returns full config including plans and betaUserIds**. Configure a flag with `plans` and `betaUserIds`. Assert `getFlagConfig()` includes those arrays.
- [ ] **`getFeatureFlagService()` returns the same singleton**. Call twice, assert `===` identity.
- [ ] **`createFeatureFlagService()` replaces the singleton**. Create, then call `getFeatureFlagService()`, assert it returns the new instance.

### Middleware Integration Tests

- [ ] **`requireFeature` allows request when flag is enabled**. Mount middleware with flag `workspaces` (default enabled). Assert handler is called and returns 200.
- [ ] **`requireFeature` blocks request when flag is disabled**. Disable `workspaces` via env var, reload. Assert middleware returns 403 with `{ "message": "feature not available on your plan" }`.
- [ ] **`requireFeature` evaluates per-user beta access**. Configure `workspaces` with `betaUserIds: [42]`, disable the flag. Assert user 42 gets 200, user 99 gets 403.
- [ ] **`requireFeature` works for anonymous requests**. Disable a flag. Send unauthenticated request. Assert 403.

### Server Bootstrap Integration Tests

- [ ] **Server starts successfully with all default flags**. Boot server, call health endpoint, assert 200.
- [ ] **Server starts successfully with some flags disabled via env**. Set `CODEPLANE_FEATURE_FLAGS_AGENTS=false`, boot, call `/api/feature-flags`, assert `agents` is `false`.
- [ ] **Server starts successfully even if custom provider throws**. Inject a provider that throws on `loadFeatureFlags()`. Assert server still boots and `/api/feature-flags` returns CE_DEFAULTS.
- [ ] **Flag loading occurs after DB and service initialization**. Assert that during server boot, the feature flag service is initialized after the DB connection is established and service registry is populated.

### End-to-End Tests (Playwright / Web UI)

- [ ] **Web UI hides navigation for disabled features**. Disable `workspaces` flag, load web app. Assert workspaces navigation item is not visible in the sidebar.
- [ ] **Web UI shows navigation for enabled features**. Enable all flags (default), load web app. Assert all navigation items are visible.
- [ ] **Web UI `FlaggedRoute` redirects for disabled feature**. Disable `landing_queue`, navigate directly to the landing queue URL. Assert user is redirected away (e.g., to dashboard or a "not available" page).
- [ ] **Web UI fetches flags on initial load**. Monitor network requests during app load. Assert `GET /api/feature-flags` is called before route rendering.
- [ ] **Web UI reflects flag changes after page reload**. Disable a flag server-side. Reload the web page. Assert the corresponding UI surface is now hidden.

### CLI End-to-End Tests

- [ ] **CLI command for disabled feature returns clear error**. Disable `workspaces`. Run `codeplane workspace list`. Assert output includes "feature not available" or similar message and exit code is non-zero.
- [ ] **CLI command for enabled feature succeeds normally**. Enable `workspaces` (default). Run `codeplane workspace list`. Assert command completes without feature-gating error.

### TUI End-to-End Tests

- [ ] **TUI omits screens for disabled features**. Disable `agents`. Launch TUI. Assert agent chat/session screens are not present in navigation.
- [ ] **TUI shows all screens when all features enabled**. Launch TUI with default flags. Assert all screens are present.

### Maximum Input / Boundary Tests

- [ ] **All 16 flags can be individually disabled via env vars simultaneously**. Set all 16 `CODEPLANE_FEATURE_FLAGS_*=false`, reload. Assert all 16 flags return `false` from `getAllFlags()`.
- [ ] **All 16 flags can be individually enabled via env vars simultaneously**. Set all 16 `CODEPLANE_FEATURE_FLAGS_*=true`, reload. Assert all 16 flags return `true`.
- [ ] **`betaUserIds` with 10,000 entries still evaluates correctly**. Configure a flag with 10,000 beta user IDs. Assert `isEnabled` for the last user ID returns `true` within acceptable latency (<10ms).
- [ ] **`betaUserIds` with 0 entries does not grant beta access**. Configure `betaUserIds: []`. Assert `isEnabled(flagName, 42)` does not get beta override.
- [ ] **Environment variable value longer than 1000 characters is handled gracefully**. Set `CODEPLANE_FEATURE_FLAGS_AGENTS` to a 1001-char string. Assert it's treated as enabled (not `"false"` or `"0"`) and no error is thrown.
