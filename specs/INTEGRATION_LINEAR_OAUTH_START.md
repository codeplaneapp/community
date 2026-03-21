# INTEGRATION_LINEAR_OAUTH_START

Specification for INTEGRATION_LINEAR_OAUTH_START.

## High-Level User POV

When a Codeplane user wants to connect their Linear workspace to a Codeplane repository, they begin by initiating the Linear OAuth authorization flow. This is the first step in a multi-step integration setup process.

From the user's perspective, they navigate to the Integrations page in the Codeplane web UI and click a "Connect Linear" button. Codeplane securely redirects them to Linear's authorization screen, where Linear asks them to grant Codeplane permission to access their Linear workspace. The user reviews the requested permissions and either approves or denies the connection. If approved, they are seamlessly redirected back to Codeplane to continue the setup process — choosing which Linear team to sync and which Codeplane repository to bind it to.

This feature provides value by eliminating the need for users to manually copy API tokens or configure webhooks. The OAuth flow ensures that credentials are handled securely and that the user explicitly consents to the access being granted. It also ensures the user's Linear identity is known to Codeplane, so that sync operations can be attributed correctly and loop-guard protections can prevent infinite update cycles between the two systems.

If the user is not authenticated to Codeplane, they are prompted to sign in before the OAuth flow can begin. If anything goes wrong during the redirect — such as a network error or a configuration problem on the server — the user sees a clear error message explaining what happened and how to retry.

## Acceptance Criteria

- **Authentication required**: The user must be authenticated with a valid Codeplane session before the OAuth start flow can be initiated. Unauthenticated requests must receive a `401 Unauthorized` response.
- **CSRF state protection**: A cryptographically random state verifier (exactly 32 hex characters / 16 bytes of entropy) must be generated for every OAuth start request.
- **State cookie**: The state verifier must be stored in an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie named `codeplane_linear_oauth_state` with a maximum age of 600 seconds (10 minutes).
- **Redirect to Linear**: The endpoint must respond with a `302 Found` redirect to Linear's OAuth authorization URL, including the correct `client_id`, `redirect_uri`, `response_type=code`, `scope`, and `state` parameters.
- **Idempotent re-initiation**: If the user starts the OAuth flow multiple times before completing it, each start must generate a new independent state verifier and cookie, overwriting the previous one. No stale state from prior incomplete attempts should interfere.
- **Feature flag gating**: The endpoint must only be active when the `INTEGRATION_LINEAR_OAUTH_START` feature flag is enabled. When disabled, the endpoint must return `404 Not Found` or not be mounted.
- **Linear OAuth application configuration**: The server must have a valid Linear OAuth `client_id` and `redirect_uri` configured. If these are missing or malformed, the endpoint must return a `500 Internal Server Error` with a structured error payload (never exposing raw credentials in the response).
- **Redirect URI validation**: The `redirect_uri` sent to Linear must exactly match the URI registered in the Linear OAuth application configuration. Mismatches will cause Linear to reject the callback.
- **No sensitive data in redirect URL**: The redirect URL sent to the browser must not contain access tokens, client secrets, or any sensitive server-side credential material.
- **Cleanup of expired setups**: Expired OAuth setup records (older than 10 minutes) must be automatically cleaned up by the periodic cleanup scheduler.
- **Cookie attributes**: `HttpOnly` (not readable by JS), `SameSite=Lax`, `Secure` (in production over HTTPS), `Max-Age=600`.
- **Error handling**: If the service layer throws when constructing the Linear authorization URL, the endpoint must return a structured JSON error with an appropriate HTTP status code (500).
- **No side effects on GET**: The endpoint must not create any persistent database records. The only side effect is setting the state cookie.

### Definition of Done
- The `GET /api/integrations/linear/oauth/start` endpoint is implemented and mounted.
- The endpoint is gated behind the `INTEGRATION_LINEAR_OAUTH_START` feature flag.
- The endpoint generates a cryptographically random state verifier and stores it in a properly configured cookie.
- The endpoint redirects to Linear's OAuth authorization URL with all required parameters.
- All error cases return structured JSON error responses.
- The cleanup scheduler removes expired `linear_oauth_setups` records on schedule.
- Integration and E2E tests pass with near-100% confidence.
- Documentation for the Linear integration setup flow is published.

## Design

### API Shape

**Endpoint**: `GET /api/integrations/linear/oauth/start`

**Request**:
- Method: `GET`
- Authentication: Session cookie or PAT-based `Authorization` header (required)
- No request body or query parameters

**Success Response** (302):
- Status: `302 Found`
- Headers:
  - `Location`: Linear OAuth authorization URL (e.g., `https://linear.app/oauth/authorize?client_id=...&redirect_uri=...&response_type=code&scope=read,write&state=<state_verifier>&prompt=consent`)
  - `Set-Cookie`: `codeplane_linear_oauth_state=<state_verifier>; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
- No response body (browsers follow the redirect automatically)

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 401 | User not authenticated | `{ "error": "authentication required" }` |
| 404 | Feature flag disabled | Not found / not mounted |
| 500 | Linear OAuth not configured or service error | `{ "error": "internal server error" }` |

**Linear Authorization URL Parameters**:

| Parameter | Value |
|-----------|-------|
| `client_id` | Server-configured Linear OAuth application client ID |
| `redirect_uri` | Server-configured callback URL (matches `GET /api/integrations/linear/oauth/callback`) |
| `response_type` | `code` |
| `scope` | `read,write` |
| `state` | 32-character hex state verifier |
| `prompt` | `consent` |

### Web UI Design

The "Connect Linear" button is displayed on the Integrations page (`/integrations/linear`). The button:

- Is styled as a primary action button with the Linear logo/icon.
- When clicked, navigates the browser to `GET /api/integrations/linear/oauth/start` (which immediately redirects to Linear).
- Is disabled and shows a tooltip "Sign in to connect Linear" when the user is not authenticated.
- Is disabled and shows "Linear integration is not available" when the feature flag is disabled.
- Shows a loading/spinner state between click and redirect.
- If the user already has active Linear integrations, the button label reads "Connect another Linear team".
- The UI must not construct the Linear OAuth URL client-side. All URL construction happens server-side.

### CLI Command

The CLI does not directly invoke the OAuth start flow (OAuth requires a browser). The CLI's `codeplane extension linear install` command provides an alternative path for users who have already obtained credentials. No CLI changes are required for this feature.

### TUI UI

The TUI does not initiate OAuth flows directly. It may display a message directing users to the web UI or CLI for Linear integration setup. No TUI changes are required.

### Documentation

1. **Integration Setup Guide: Linear** — Overview of what the integration does, step-by-step walkthrough (Navigate to Integrations → Click "Connect Linear" → Authorize on Linear → Select team and repository → Complete setup), screenshots, explanation of permissions, troubleshooting section.
2. **CLI Alternative Setup** — Instructions for `codeplane extension linear install --credentials-stdin` as an alternative, including example JSON format.

## Permissions & Security

### Authorization Roles

| Role | Can initiate OAuth start? |
|------|---------------------------|
| Owner | Yes |
| Admin | Yes |
| Member | Yes |
| Read-Only | Yes (OAuth start only grants access to user's own Linear account; repository binding is authorized separately during the create step) |
| Anonymous / Unauthenticated | No — returns 401 |

**Note**: The OAuth start step itself only establishes the user's Linear identity. The more sensitive permission check (admin access to the target Codeplane repository) happens during the `INTEGRATION_LINEAR_CREATE` step when the integration is finalized.

### Rate Limiting

- **Per-user rate limit**: Maximum 10 OAuth start requests per user per 5-minute window.
- **Global rate limit**: Maximum 100 OAuth start requests across all users per minute.
- **Rate limit response**: `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy & PII

- **State verifier**: Contains no PII — random hex string only.
- **Cookie**: Contains the state verifier only. No user identifiers, emails, or tokens.
- **Redirect URL**: Only `client_id`, `state`, `redirect_uri`, `response_type`, `scope`, and `prompt` are sent to Linear. No Codeplane user PII.
- **Server logs**: State verifier must not be logged at INFO level. User ID initiating the flow should be logged at INFO level.
- **Client secret**: Never included in the redirect URL, never exposed to the client.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `LinearOAuthStartInitiated` | User hits the OAuth start endpoint and redirect is issued | `user_id`, `timestamp`, `feature_flag_status` |
| `LinearOAuthStartFailed` | Service layer throws during URL construction | `user_id`, `error_type`, `timestamp` |
| `LinearOAuthStartRateLimited` | User is rate-limited on the OAuth start endpoint | `user_id`, `timestamp`, `retry_after_seconds` |
| `LinearOAuthStartUnauthenticated` | Unauthenticated request hits the endpoint | `timestamp`, `request_ip` (hashed) |

### Funnel Metrics

The Linear OAuth start is the first step in a multi-step funnel:

1. **OAuth Start** → `LinearOAuthStartInitiated`
2. **OAuth Callback** → `LinearOAuthCallbackCompleted` (separate feature)
3. **Setup Resolution** → `LinearOAuthSetupResolved` (separate feature)
4. **Integration Created** → `LinearIntegrationCreated` (separate feature)

**Key success indicators**:

- **Start-to-callback conversion rate**: Percentage of `LinearOAuthStartInitiated` events that result in a corresponding `LinearOAuthCallbackCompleted` within 10 minutes. Target: >80%.
- **Error rate**: Percentage of `LinearOAuthStartFailed` events relative to total start attempts. Target: <1%.
- **Repeat start rate**: Number of users who initiate OAuth start more than once within a 24-hour period. A high rate may indicate UX confusion or callback failures.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| OAuth start initiated | `INFO` | `user_id`, `request_id`, `redirect_domain` | Redirect issued successfully |
| OAuth start failed | `ERROR` | `user_id`, `request_id`, `error_message`, `error_type` | Service layer throws |
| OAuth start unauthorized | `WARN` | `request_id`, `remote_addr` | Unauthenticated request |
| OAuth start rate limited | `WARN` | `user_id`, `request_id`, `rate_limit_key`, `retry_after` | Rate limit hit |
| State verifier generated | `DEBUG` | `user_id`, `request_id`, `state_length` | State generated (do NOT log the actual value at INFO+) |
| Feature flag check | `DEBUG` | `flag_name`, `flag_value`, `user_id` | Feature flag evaluated |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_linear_oauth_start_total` | Counter | `status` (`success`, `error`, `unauthorized`, `rate_limited`) | Total OAuth start requests |
| `codeplane_linear_oauth_start_duration_seconds` | Histogram | — | Time from request receipt to redirect response |
| `codeplane_linear_oauth_state_cookie_set_total` | Counter | — | Number of state cookies successfully set |

### Alerts

#### Alert: `LinearOAuthStartErrorRateHigh`
- **Condition**: `rate(codeplane_linear_oauth_start_total{status="error"}[5m]) / rate(codeplane_linear_oauth_start_total[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `oauth start failed` entries filtered by the alert window.
  2. Verify the Linear OAuth `client_id` and `redirect_uri` are correctly configured in server environment variables.
  3. Check if Linear's OAuth service is experiencing an outage (https://linearstatus.com).
  4. If configuration is correct and Linear is healthy, inspect the `linearService.startLinearOAuth` implementation for bugs.
  5. If transient, monitor for auto-recovery. If persistent, escalate to the integrations team.

#### Alert: `LinearOAuthStartLatencyHigh`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_linear_oauth_start_duration_seconds_bucket[5m])) > 2`
- **Severity**: Warning
- **Runbook**:
  1. OAuth start should be <100ms (generates a random value and constructs a URL). High latency suggests a systemic issue.
  2. Check server resource utilization (CPU, memory, event loop lag).
  3. Check if `crypto.getRandomValues` is blocking.
  4. Check middleware stack performance.
  5. If isolated, check `linearService.startLinearOAuth` for unexpected async operations.

#### Alert: `LinearOAuthStartRateLimitSpiking`
- **Condition**: `rate(codeplane_linear_oauth_start_total{status="rate_limited"}[5m]) > 20`
- **Severity**: Info
- **Runbook**:
  1. Identify user(s) triggering rate limits from structured logs.
  2. Determine if legitimate retry behavior or abuse.
  3. If abuse, consider temporary IP-based blocks or account suspension.
  4. If legitimate, investigate why users are retrying (check callback error rates).

### Error Cases & Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Internal Log |
|-------------|-------------|---------------------|---------------|
| User not authenticated | 401 | "authentication required" | WARN with remote_addr |
| Feature flag disabled | 404 | Not found | — |
| Linear OAuth client_id not configured | 500 | "internal server error" | ERROR: "Linear OAuth client_id is not configured" |
| Linear OAuth redirect_uri not configured | 500 | "internal server error" | ERROR: "Linear OAuth redirect_uri is not configured" |
| crypto.getRandomValues failure | 500 | "internal server error" | ERROR: "Failed to generate state verifier" |
| Service-layer exception | 500 | "internal server error" | ERROR with full exception context |
| Rate limit exceeded | 429 | "rate limit exceeded" | WARN with rate limit key |

## Verification

### API Integration Tests

1. **Authenticated user receives 302 redirect to Linear**: Send `GET /api/integrations/linear/oauth/start` with a valid session cookie. Assert response status is `302`. Assert `Location` header starts with `https://linear.app/oauth/authorize`. Assert `Location` contains `client_id`, `redirect_uri`, `response_type=code`, `scope`, and `state` parameters. Assert `Set-Cookie` header contains `codeplane_linear_oauth_state`.

2. **State verifier in cookie matches state in redirect URL**: Parse the `state` query parameter from `Location` header and the cookie value from `Set-Cookie`. Assert they are identical.

3. **State verifier is exactly 32 hex characters**: Extract state verifier from the cookie. Assert it matches regex `^[0-9a-f]{32}$`.

4. **Cookie attributes are correctly set**: Parse full `Set-Cookie` header. Assert it contains `HttpOnly`, `SameSite=Lax`, `Max-Age=600`, `Path=/`.

5. **Unauthenticated user receives 401**: Send request without session or authorization. Assert `401`. Assert body contains `"authentication required"`. Assert no `Set-Cookie` or `Location` header.

6. **Each request generates a unique state verifier**: Send two requests with same session. Assert state verifiers are different.

7. **Subsequent start overwrites previous state cookie**: Send two requests. Assert second response sets a new cookie value (same name, different value).

8. **Redirect URL contains correct client_id**: Parse `Location` URL. Assert `client_id` matches expected configured value.

9. **Redirect URL contains correct redirect_uri**: Parse `Location` URL. Assert `redirect_uri` matches `<server_base_url>/api/integrations/linear/oauth/callback`.

10. **Server error when Linear OAuth is not configured**: With `client_id` unset. Assert `500`. Assert structured error payload. Assert no cookie or redirect.

11. **Rate limiting enforced per user**: Send 11 requests rapidly with same session. Assert first 10 return `302`, 11th returns `429` with `Retry-After`.

12. **Rate limiting does not cross users**: Send 10 requests with user A. Send 1 with user B. Assert user B gets `302`.

13. **PAT-based authentication works**: Send request with valid PAT in `Authorization` header. Assert `302`.

14. **Expired PAT receives 401**: Send request with expired/revoked PAT. Assert `401`.

15. **Feature flag disabled returns 404**: Disable `INTEGRATION_LINEAR_OAUTH_START` flag. Assert `404`.

16. **No persistent database records created on GET**: Count `linear_oauth_setups` rows before and after request. Assert unchanged.

17. **Response does not contain client_secret**: Inspect full `Location` URL and any response body. Assert `client_secret` is not present.

18. **Maximum valid state verifier length (32 chars) round-trips correctly**: Verify the 32-character state from the start endpoint is correctly matched in the callback flow.

19. **Malformed state verifier exceeding 32 chars is rejected at callback boundary**: Set a 33+ character `codeplane_linear_oauth_state` cookie manually. Send callback request with matching state. Assert rejection (state mismatch or validation error).

### E2E Tests (Playwright)

20. **Full browser OAuth start flow**: Sign in, navigate to `/integrations/linear`, click "Connect Linear". Assert browser redirects to `https://linear.app/oauth/authorize`. Assert redirect URL contains `state` parameter. Assert `codeplane_linear_oauth_state` cookie is set.

21. **Connect Linear button hidden/disabled when not authenticated**: Navigate to `/integrations/linear` without signing in. Assert button is not visible or disabled.

22. **Connect Linear button hidden/disabled when feature flag is off**: Disable flag, sign in, navigate. Assert button is not visible or shows unavailability message.

23. **Error recovery: user cancels on Linear**: Initiate OAuth flow. Simulate Linear redirecting back without `code`. Assert user lands on `/integrations/linear` with an error message.

24. **Multiple sequential OAuth starts do not leave stale UI state**: Click "Connect Linear", navigate back, click again. Assert second flow works correctly.

### CLI Tests

25. **CLI `extension linear install` still works independently of OAuth start**: Run `echo '{"access_token":"test_token"}' | codeplane extension linear install --team-id T1 --repo-owner owner --repo-name repo --repo-id 1 --credentials-stdin`. Assert the CLI sends a `POST /api/integrations/linear` request.
