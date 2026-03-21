# INTEGRATION_LINEAR_OAUTH_CALLBACK

Specification for INTEGRATION_LINEAR_OAUTH_CALLBACK.

## High-Level User POV

When a Codeplane user wants to connect their Linear workspace to a Codeplane repository, they begin by clicking a "Connect Linear" button on the integrations page. This redirects them to Linear's authorization screen, where they grant Codeplane permission to access their Linear workspace. After granting access, Linear redirects the user back to Codeplane.

The OAuth callback is the moment the user returns from Linear to Codeplane. The user should experience this as a seamless, near-instant transition. When the callback succeeds, the user lands on the Linear integration configuration page with their Linear identity confirmed and their available Linear teams listed. They can then select which Linear team to connect and which Codeplane repository to map it to. When the callback fails — because they denied access, their session expired, or something went wrong — they land on the same page with a clear, actionable error message explaining what happened and how to try again.

This callback step is the critical trust-building moment in the integration flow. The user has just handed over access to their Linear workspace. Codeplane must handle this handoff securely (tokens never appear in URLs or browser storage), reliably (the flow recovers gracefully from every failure mode), and quickly (the redirect and setup resolution should feel instantaneous). The user's sensitive Linear credentials are encrypted and stored server-side only; the browser receives nothing more than a short-lived, opaque setup key.

The value of this feature is that it unlocks bidirectional sync between Linear and Codeplane — issues, comments, and status changes flow between both systems. But before any of that can happen, the OAuth callback must work flawlessly.

## Acceptance Criteria

### Definition of Done

The `INTEGRATION_LINEAR_OAUTH_CALLBACK` feature is done when:

- A user who completes the Linear OAuth authorization flow is redirected back to Codeplane and lands on the Linear integration configuration page with their identity and available teams displayed.
- A user who encounters any error during the OAuth flow is redirected back to Codeplane with a user-friendly error message and a clear path to retry.
- All tokens and sensitive data are encrypted at rest and never exposed to the browser.
- The flow is protected against CSRF attacks via state verification.
- Expired or consumed OAuth setups are rejected and cleaned up automatically.

### Functional Constraints

- [ ] The callback endpoint MUST accept `code` and `state` query parameters from Linear's OAuth redirect.
- [ ] The callback endpoint MUST return HTTP 400 if either `code` or `state` is missing from the query string.
- [ ] The callback endpoint MUST validate the `state` parameter against the `codeplane_linear_oauth_state` cookie value to prevent CSRF attacks.
- [ ] The `codeplane_linear_oauth_state` cookie MUST be cleared (Max-Age=-1) immediately after extraction, regardless of whether validation succeeds or fails.
- [ ] On successful token exchange, the callback MUST create a server-side OAuth setup record with encrypted payload and redirect to `/integrations/linear?setup=<setupKey>`.
- [ ] On any failure, the callback MUST redirect to `/integrations/linear?error=<urlEncodedMessage>` instead of returning a raw error response.
- [ ] The `setupKey` MUST be an opaque, cryptographically random identifier that does not leak token data.
- [ ] The OAuth setup record MUST expire after 10 minutes from creation.
- [ ] The OAuth setup record MUST be single-use — once consumed during integration configuration, it cannot be retrieved again.
- [ ] Expired OAuth setup records MUST be cleaned up by the background cleanup scheduler.
- [ ] The callback MUST require an authenticated Codeplane session (valid session cookie).
- [ ] Unauthenticated requests to the callback endpoint MUST be rejected with HTTP 401.

### Edge Cases

- [ ] If the user's Codeplane session expired while they were on Linear's authorization page, the callback MUST redirect to the login page or return a 401, not crash or show a blank page.
- [ ] If the `codeplane_linear_oauth_state` cookie is missing (e.g., cookies were cleared, different browser tab, or cookie expired after 10 minutes), the callback MUST redirect with an error message such as "OAuth session expired. Please try again."
- [ ] If the `state` parameter does not match the cookie value (CSRF attack or stale state), the callback MUST redirect with an error message such as "OAuth state mismatch. Please try again."
- [ ] If Linear returns an `error` parameter instead of `code` (user denied access), the callback MUST capture the error and redirect with a user-friendly message such as "Linear authorization was denied."
- [ ] If the token exchange with Linear's API fails (network error, invalid code, rate limit), the callback MUST redirect with an appropriate error message.
- [ ] If Linear's token response is missing expected fields (access_token, viewer info), the callback MUST redirect with an error rather than storing incomplete data.
- [ ] If the user initiates multiple OAuth flows concurrently (multiple tabs), only the most recent state cookie should be valid; earlier flows MUST fail gracefully with a "session expired" error.
- [ ] If the same `setupKey` is used more than once (replay attack or accidental double-submit), the second attempt MUST be rejected.
- [ ] If the `code` parameter contains characters outside the expected OAuth code format, the callback MUST not crash — it should pass the value to Linear's token endpoint and handle any resulting error gracefully.

### Boundary Constraints

- [ ] The `state` parameter MUST be exactly 32 hexadecimal characters (16 random bytes).
- [ ] The `code` parameter MUST NOT exceed 2048 characters. Values exceeding this limit MUST be rejected with HTTP 400.
- [ ] The `error` query parameter (when present in the redirect to UI) MUST be URL-encoded and MUST NOT exceed 500 characters.
- [ ] The `setupKey` MUST be a cryptographically random string, minimum 32 characters.
- [ ] The state cookie MUST have `HttpOnly`, `SameSite=Lax`, `Secure` (in production), and `Max-Age=600` attributes.
- [ ] The OAuth setup payload stored in the database MUST be encrypted using AES-256-GCM.
- [ ] The encrypted payload MUST include: Linear viewer info (id, name, email), available teams (id, name, key), access token, optional refresh token, and optional token expiration.

## Design

### API Shape

#### `GET /api/integrations/linear/oauth/callback`

**Purpose:** Receive the OAuth authorization redirect from Linear, exchange the authorization code for tokens, store encrypted setup data server-side, and redirect the user to the integration configuration page.

**Query Parameters (from Linear):**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `code`    | string | Yes      | OAuth authorization code from Linear |
| `state`   | string | Yes      | CSRF state parameter echoed back by Linear |

Linear may also return `error` and `error_description` parameters if the user denied access or an error occurred on Linear's side.

**Request Cookies:**

| Cookie | Required | Description |
|--------|----------|-------------|
| `codeplane_linear_oauth_state` | Yes | HttpOnly cookie containing the CSRF state verifier set during OAuth start |
| Session cookie | Yes | Authenticated Codeplane session |

**Success Response:** HTTP 302 redirect

```
Location: /integrations/linear?setup=<setupKey>
Set-Cookie: codeplane_linear_oauth_state=; Max-Age=-1; Path=/; HttpOnly; SameSite=Lax
```

**Error Response:** HTTP 302 redirect

```
Location: /integrations/linear?error=<urlEncodedMessage>
Set-Cookie: codeplane_linear_oauth_state=; Max-Age=-1; Path=/; HttpOnly; SameSite=Lax
```

**Error Conditions:**

| Condition | Redirect Error Message |
|-----------|----------------------|
| Missing `code` or `state` | "Authorization code and state are required" |
| Missing state cookie | "OAuth session expired. Please try connecting again." |
| State mismatch | "OAuth state verification failed. Please try connecting again." |
| Linear returned `error` param | "Linear authorization was denied: {error_description}" |
| Token exchange failure | "Failed to complete Linear authorization. Please try again." |
| Unauthenticated | No redirect — returns 401 JSON response |

#### `GET /api/integrations/linear/oauth/setup/:setupKey`

**Purpose:** After the callback redirect, the frontend calls this endpoint to retrieve the OAuth result (viewer info and available teams) for display in the configuration UI.

**Path Parameters:**

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `setupKey` | string | Yes | Opaque key from the callback redirect |

**Success Response:** HTTP 200

```json
{
  "viewer": {
    "id": "string",
    "name": "string",
    "email": "string"
  },
  "teams": [
    {
      "id": "string",
      "name": "string",
      "key": "string"
    }
  ]
}
```

**Error Conditions:**

| Condition | Status | Response |
|-----------|--------|----------|
| Invalid or expired setupKey | 404 | `{ "error": "OAuth setup not found or expired" }` |
| Already consumed setupKey | 404 | `{ "error": "OAuth setup not found or expired" }` |
| setupKey belongs to different user | 404 | `{ "error": "OAuth setup not found or expired" }` |
| Unauthenticated | 401 | `{ "error": "Unauthorized" }` |

### Web UI Design

#### OAuth Callback Landing State

When the user arrives at `/integrations/linear` after the OAuth callback:

**Success path (`?setup=<setupKey>`):**
1. The page detects the `setup` query parameter.
2. A loading indicator is shown ("Completing Linear connection...") while the frontend fetches `GET /api/integrations/linear/oauth/setup/:setupKey`.
3. On success, the loading state transitions to the **team and repository selection form**:
   - A confirmation banner shows the connected Linear identity: "Connected as {viewer.name} ({viewer.email})".
   - A dropdown or radio group lists available Linear teams.
   - A dropdown or searchable select lists the user's Codeplane repositories (fetched from `GET /api/integrations/linear/repositories`).
   - A "Complete Setup" button submits the configuration.
4. On submission success, a success toast or banner confirms "Linear integration created" and the page navigates to the integrations list showing the new integration.

**Error path (`?error=<message>`):**
1. The page detects the `error` query parameter.
2. An error banner is displayed with the decoded error message.
3. A "Try Again" button is prominently displayed, which initiates the OAuth flow again via `GET /api/integrations/linear/oauth/start`.
4. The error query parameter is cleared from the URL after display (via `history.replaceState`) to prevent stale error display on refresh.

**No query parameters (direct navigation):**
1. If the user has existing integrations, list them.
2. If no integrations exist, show the "Connect Linear" call-to-action.

#### Loading and Transition States

- **During redirect to Linear:** The browser navigates away; no special loading state needed on the Codeplane side.
- **During callback processing:** The server processes and immediately redirects (302); the user sees a brief browser navigation indicator.
- **During setup resolution:** A skeleton or spinner is shown while fetching setup data (typically <500ms).
- **During configuration submission:** The "Complete Setup" button shows a loading spinner and is disabled to prevent double-submission.

### CLI Command

The CLI supports a headless equivalent for CI/automation environments where browser-based OAuth is impractical:

```bash
# Install integration with pre-obtained credentials (via stdin)
echo '{"access_token":"lin_api_...","refresh_token":"..."}' | \
  codeplane extension linear install \
    --team-id=TEAM_ID \
    --repo-owner=OWNER \
    --repo-name=NAME \
    --repo-id=ID \
    --credentials-stdin
```

The CLI does not directly invoke the OAuth callback. Instead, it accepts pre-obtained tokens and calls the integration configuration endpoint directly.

### Documentation

The following end-user documentation should be written:

1. **"Connecting Linear to Codeplane" guide** — Step-by-step walkthrough of the OAuth connection flow, with screenshots of each step (Linear authorization screen, team selection, repository mapping, confirmation).
2. **"Troubleshooting Linear Integration"** — A page covering common error scenarios: "OAuth session expired" (cookie expiry, retry instructions), "Authorization was denied" (user clicked Deny on Linear), "State verification failed" (browser tab/cookie issues), "Failed to complete authorization" (transient network issues).
3. **"Managing Linear Integrations"** — How to view, sync, and disconnect existing integrations.
4. **"CLI: Headless Linear Setup"** — How to configure Linear integration via CLI for CI/automation use cases.

## Permissions & Security

### Authorization Requirements

| Action | Required Role |
|--------|--------------|
| Initiate Linear OAuth flow | Authenticated user (any role) |
| Receive OAuth callback | Authenticated user (session cookie required) |
| Retrieve OAuth setup data | Authenticated user who initiated the flow (user_id match) |
| Configure integration (map to repo) | Repository Admin or Owner |
| List own integrations | Authenticated user |
| Delete own integration | Authenticated user who owns the integration |
| Trigger sync | Authenticated user who owns the integration |

### CSRF Protection

- The OAuth state parameter is generated server-side using `crypto.getRandomValues()` (16 bytes = 32 hex characters).
- The state verifier is stored in an `HttpOnly`, `SameSite=Lax`, `Secure` cookie with a 10-minute TTL.
- The callback validates that the state parameter from Linear matches the cookie value.
- The cookie is cleared immediately after extraction to prevent reuse.

### Token Security

- Linear access tokens and refresh tokens are NEVER sent to the browser.
- Tokens are encrypted using AES-256-GCM before database storage.
- The encryption key is derived from `CODEPLANE_SECRET_KEY` via SHA-256.
- The encrypted format is: 12-byte nonce || ciphertext || 16-byte GCM authentication tag.
- The browser receives only an opaque `setupKey` that references the encrypted server-side record.
- Setup records expire after 10 minutes and are single-use (atomic consume-on-read).

### Rate Limiting

- The global rate limit of 120 requests per minute per user/IP applies to the callback endpoint.
- No elevated per-route rate limit is required because the callback is a single redirect per OAuth flow.
- The OAuth start endpoint should be monitored for abuse — a user initiating more than 10 OAuth flows per minute is likely automated abuse.
- The setup resolution endpoint should not require additional rate limiting beyond the global limit, as setupKeys are opaque and time-limited.

### Data Privacy

- Linear viewer information (id, name, email) is stored encrypted in the OAuth setup record and in the integration record.
- The `email` field from Linear should be treated as PII and must not appear in application logs.
- Setup records containing PII are automatically cleaned up after 10 minutes.
- Integration records persist for the lifetime of the integration but are scoped to the owning user.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `LinearOAuthCallbackReceived` | Callback endpoint is hit | `user_id`, `has_code`, `has_state`, `has_error`, `timestamp` |
| `LinearOAuthCallbackSucceeded` | Token exchange and setup creation succeed | `user_id`, `team_count` (number of available teams), `setup_key_id` (hashed), `duration_ms` |
| `LinearOAuthCallbackFailed` | Any error during callback processing | `user_id`, `error_type` (enum: `missing_params`, `csrf_mismatch`, `cookie_expired`, `token_exchange_failed`, `user_denied`, `internal_error`), `timestamp` |
| `LinearOAuthSetupResolved` | Frontend successfully fetches setup data | `user_id`, `setup_key_id` (hashed), `team_count`, `duration_ms` |
| `LinearOAuthSetupExpired` | Setup resolution fails due to expiry | `user_id`, `setup_key_id` (hashed) |
| `LinearIntegrationConfigured` | User completes team+repo selection | `user_id`, `linear_team_id`, `repo_id`, `time_since_callback_ms` |

### Funnel Metrics

The Linear integration connection funnel should be tracked end-to-end:

1. **OAuth Start** — User clicks "Connect Linear" → `LinearOAuthStarted`
2. **OAuth Callback** — User returns from Linear → `LinearOAuthCallbackReceived`
3. **Callback Success** — Tokens exchanged successfully → `LinearOAuthCallbackSucceeded`
4. **Setup Resolved** — Frontend loads setup data → `LinearOAuthSetupResolved`
5. **Integration Configured** — User completes configuration → `LinearIntegrationConfigured`

### Key Metrics

- **Callback success rate**: `LinearOAuthCallbackSucceeded / LinearOAuthCallbackReceived` — Target: >95%
- **Setup resolution rate**: `LinearOAuthSetupResolved / LinearOAuthCallbackSucceeded` — Target: >98%
- **Configuration completion rate**: `LinearIntegrationConfigured / LinearOAuthSetupResolved` — Target: >80%
- **End-to-end conversion**: `LinearIntegrationConfigured / LinearOAuthStarted` — Target: >70%
- **Callback error breakdown**: Distribution of `error_type` in `LinearOAuthCallbackFailed` events
- **Time to configure**: p50/p90/p99 of `time_since_callback_ms` in `LinearIntegrationConfigured`
- **Setup expiry rate**: `LinearOAuthSetupExpired / LinearOAuthCallbackSucceeded` — Target: <2%

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Callback received | `info` | `user_id`, `has_code`, `has_state`, `request_id` | Entry log for every callback request |
| State cookie missing | `warn` | `user_id`, `request_id` | Indicates expired session or cookie issue |
| State mismatch | `warn` | `user_id`, `request_id` | Potential CSRF attack or stale flow |
| Linear returned error | `info` | `user_id`, `error`, `error_description`, `request_id` | User denied or Linear-side issue |
| Token exchange started | `debug` | `user_id`, `request_id` | Before calling Linear API |
| Token exchange succeeded | `info` | `user_id`, `team_count`, `duration_ms`, `request_id` | After successful token exchange |
| Token exchange failed | `error` | `user_id`, `error_message`, `duration_ms`, `request_id` | Linear API error. MUST NOT log the authorization code. |
| Setup record created | `info` | `user_id`, `setup_key_hash`, `expires_at`, `request_id` | Setup stored successfully |
| Setup record consumed | `info` | `user_id`, `setup_key_hash`, `request_id` | Setup used during configuration |
| Setup record expired cleanup | `debug` | `count_deleted` | Background cleanup job |
| Redirect issued | `info` | `user_id`, `redirect_target` (path only, no query), `request_id` | Final redirect |

**MUST NOT log:** Authorization codes, access tokens, refresh tokens, Linear viewer email addresses, full redirect URLs with setup keys.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_linear_oauth_callback_total` | Counter | `status` (`success`, `error`), `error_type` | Total callback requests by outcome |
| `codeplane_linear_oauth_callback_duration_seconds` | Histogram | `status` | End-to-end callback processing time (including token exchange) |
| `codeplane_linear_token_exchange_duration_seconds` | Histogram | `status` (`success`, `error`) | Time spent exchanging code for tokens with Linear API |
| `codeplane_linear_oauth_setup_created_total` | Counter | — | Total setup records created |
| `codeplane_linear_oauth_setup_consumed_total` | Counter | — | Total setup records consumed |
| `codeplane_linear_oauth_setup_expired_total` | Counter | — | Total setup records expired (cleaned up) |
| `codeplane_linear_oauth_csrf_failures_total` | Counter | `reason` (`missing_cookie`, `mismatch`) | CSRF validation failures |
| `codeplane_linear_oauth_active_setups` | Gauge | — | Current number of unexpired, unconsumed setup records |

### Alerts

#### Alert: `LinearOAuthCallbackErrorRateHigh`
- **Condition:** `rate(codeplane_linear_oauth_callback_total{status="error"}[5m]) / rate(codeplane_linear_oauth_callback_total[5m]) > 0.3` for 10 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_linear_oauth_callback_total` by `error_type` label to identify the dominant failure mode.
  2. If `error_type=token_exchange_failed`: Check Linear's status page (https://linearstatus.com). Verify `CODEPLANE_LINEAR_CLIENT_ID` and `CODEPLANE_LINEAR_CLIENT_SECRET` are correct. Check network connectivity to `api.linear.app` from the server.
  3. If `error_type=csrf_mismatch` or `cookie_expired`: Check if cookie domain/path settings are correct for the deployment. Verify `SameSite` policy is compatible with the deployment's reverse proxy configuration. Check if a load balancer is stripping cookies.
  4. If `error_type=user_denied`: This is expected user behavior; suppress alert if rate is <50%.
  5. Check server logs filtered by `request_id` for detailed error context.

#### Alert: `LinearTokenExchangeLatencyHigh`
- **Condition:** `histogram_quantile(0.95, codeplane_linear_token_exchange_duration_seconds) > 5` for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check Linear API status page.
  2. Check network latency from the server to `api.linear.app` (e.g., `curl -o /dev/null -w '%{time_total}' https://api.linear.app`).
  3. Check if the server is under resource pressure (CPU, memory, file descriptors).
  4. If latency is consistently >10s, users will see browser timeouts. Consider adding a timeout to the token exchange HTTP call with a user-friendly error.

#### Alert: `LinearOAuthCSRFFailuresSpike`
- **Condition:** `rate(codeplane_linear_oauth_csrf_failures_total[5m]) > 5` for 5 minutes
- **Severity:** Critical
- **Runbook:**
  1. This could indicate a CSRF attack or infrastructure misconfiguration.
  2. Check if the `codeplane_linear_oauth_state` cookie is being set and returned correctly (inspect Set-Cookie headers in server logs).
  3. Verify the reverse proxy / CDN is not stripping or modifying cookies.
  4. Check if the cookie domain matches the deployment domain.
  5. If attacks are suspected, check source IPs in access logs and consider temporary IP blocking.
  6. Verify that the deployment hasn't recently changed domains or cookie settings.

#### Alert: `LinearOAuthSetupLeakHigh`
- **Condition:** `codeplane_linear_oauth_active_setups > 100`
- **Severity:** Warning
- **Runbook:**
  1. Check if the cleanup scheduler is running (`deleteExpiredLinearOAuthSetups`).
  2. Check if the cleanup job is erroring (search logs for cleanup-related errors).
  3. A high number of active setups may indicate users are starting OAuth flows but not completing them. Check the funnel metrics to identify drop-off points.
  4. Manually trigger cleanup if needed: verify expired records are being deleted.

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|-------------|-----------|--------|------------|
| Linear API down | Token exchange timeout/error | Users cannot complete OAuth | Show clear error message with retry; alert on elevated error rate |
| Database unavailable | Setup creation fails | Callback fails after token exchange (tokens lost) | Return error redirect; user must restart flow |
| Encryption key misconfigured | Decryption failures on setup resolution | Setup data unreadable | Alert on decryption errors; verify `CODEPLANE_SECRET_KEY` |
| Cookie domain mismatch | All CSRF validations fail | No users can complete OAuth | Alert on CSRF spike; verify cookie settings |
| Clock skew | Setup records expire prematurely | Users see "expired" errors unexpectedly | Use NTP; add tolerance to expiry checks |
| Concurrent OAuth flows | Earlier flows fail with state mismatch | Minor UX friction | Expected behavior; error message guides retry |
| Linear API credential rotation | All token exchanges fail | Integration setup completely broken | Alert on sustained 100% failure rate; update credentials |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CB-API-001` | `GET /api/integrations/linear/oauth/callback` with valid `code`, `state`, and matching state cookie | HTTP 302 redirect to `/integrations/linear?setup=<setupKey>`; state cookie cleared |
| `CB-API-002` | `GET /api/integrations/linear/oauth/callback` without `code` parameter | HTTP 302 redirect to `/integrations/linear?error=<message>` |
| `CB-API-003` | `GET /api/integrations/linear/oauth/callback` without `state` parameter | HTTP 302 redirect to `/integrations/linear?error=<message>` |
| `CB-API-004` | `GET /api/integrations/linear/oauth/callback` with neither `code` nor `state` | HTTP 302 redirect to `/integrations/linear?error=<message>` |
| `CB-API-005` | `GET /api/integrations/linear/oauth/callback` with valid params but no state cookie | HTTP 302 redirect to `/integrations/linear?error=...expired...` |
| `CB-API-006` | `GET /api/integrations/linear/oauth/callback` with valid params but mismatched state | HTTP 302 redirect to `/integrations/linear?error=...mismatch...` |
| `CB-API-007` | `GET /api/integrations/linear/oauth/callback` without authenticated session | HTTP 401 |
| `CB-API-008` | `GET /api/integrations/linear/oauth/callback` with `code` at exactly 2048 characters and valid state | Accepted and processed normally |
| `CB-API-009` | `GET /api/integrations/linear/oauth/callback` with `code` at 2049 characters | HTTP 400 or error redirect |
| `CB-API-010` | `GET /api/integrations/linear/oauth/callback` where token exchange with Linear fails (mock Linear API returning 401) | HTTP 302 redirect to `/integrations/linear?error=<message>` |
| `CB-API-011` | `GET /api/integrations/linear/oauth/callback` where token exchange with Linear returns incomplete data (missing access_token) | HTTP 302 redirect with error |
| `CB-API-012` | Verify state cookie is cleared (Max-Age=-1) even when callback fails | `Set-Cookie` header present with `Max-Age=-1` in error redirect response |
| `CB-API-013` | Verify the `setupKey` in the redirect URL is opaque (not a raw token or predictable value) | setupKey is ≥32 characters, alphanumeric/hex |
| `CB-API-014` | `GET /api/integrations/linear/oauth/setup/:setupKey` with valid, unexpired, unconsumed setup key belonging to the authenticated user | HTTP 200 with viewer info and teams array |
| `CB-API-015` | `GET /api/integrations/linear/oauth/setup/:setupKey` with expired setup key | HTTP 404 |
| `CB-API-016` | `GET /api/integrations/linear/oauth/setup/:setupKey` with already-consumed setup key | HTTP 404 |
| `CB-API-017` | `GET /api/integrations/linear/oauth/setup/:setupKey` with setup key belonging to a different user | HTTP 404 |
| `CB-API-018` | `GET /api/integrations/linear/oauth/setup/:setupKey` with non-existent setup key | HTTP 404 |
| `CB-API-019` | `GET /api/integrations/linear/oauth/setup/:setupKey` without authentication | HTTP 401 |
| `CB-API-020` | Verify setup record is encrypted in the database (raw DB read of `payload_encrypted` column is not readable plaintext) | Binary/encrypted data in column |
| `CB-API-021` | Verify setup record cleanup: create a setup, wait for expiry (or manually set `expires_at` to past), trigger cleanup, verify record is deleted | Record no longer exists |
| `CB-API-022` | Full OAuth flow end-to-end: start → callback → setup resolution → configuration → verify integration exists | Integration created with correct team and repo mapping |

### CSRF Security Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CB-SEC-001` | Replay a valid callback URL after the state cookie has been cleared | Error redirect (cookie missing) |
| `CB-SEC-002` | Use a state value from one user's OAuth flow in another user's callback | Error redirect (state mismatch) |
| `CB-SEC-003` | Tamper with the state cookie value before hitting the callback | Error redirect (state mismatch) |
| `CB-SEC-004` | Hit the callback endpoint from a different origin (CORS check) | Request blocked or error redirect |
| `CB-SEC-005` | Verify state cookie attributes: HttpOnly=true, SameSite=Lax, Max-Age=600 | Cookie attributes match specification |

### Playwright E2E Tests (Web UI)

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CB-E2E-001` | Full happy-path flow: click "Connect Linear" → authorize on Linear (mocked) → return to callback → see team selection → select team and repo → see confirmation | Integration appears in integrations list |
| `CB-E2E-002` | OAuth callback with `?error=access_denied`: verify error banner is displayed with "Try Again" button | Error message visible, "Try Again" button present and functional |
| `CB-E2E-003` | OAuth callback with `?setup=<invalidKey>`: verify error state when setup resolution fails | Error message displayed, setup form not shown |
| `CB-E2E-004` | Direct navigation to `/integrations/linear` with no query params: verify correct default state | Shows existing integrations or "Connect Linear" CTA |
| `CB-E2E-005` | After error display, verify the `?error=` param is removed from URL bar | URL shows `/integrations/linear` without error param |
| `CB-E2E-006` | During setup resolution, verify loading indicator is displayed | Spinner/skeleton visible before data loads |
| `CB-E2E-007` | Verify "Complete Setup" button is disabled during submission and re-enabled on error | Button shows loading state, prevents double-click |
| `CB-E2E-008` | After successful integration creation, verify toast/banner confirmation and navigation to integrations list | Success message visible, new integration in list |

### CLI Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CB-CLI-001` | `codeplane extension linear install` with valid credentials via stdin | Integration created successfully |
| `CB-CLI-002` | `codeplane extension linear install` with empty stdin | Error: credentials required |
| `CB-CLI-003` | `codeplane extension linear install` with malformed JSON on stdin | Error: invalid credentials format |
| `CB-CLI-004` | `codeplane extension linear install` with missing `access_token` field | Error: access_token required |
| `CB-CLI-005` | `codeplane extension linear install` with `access_token` at maximum length (4096 chars) | Accepted and processed |
| `CB-CLI-006` | `codeplane extension linear install` with non-existent repo ID | Error: repository not found |
| `CB-CLI-007` | `codeplane extension linear install` when user lacks admin access to target repo | Error: permission denied |
| `CB-CLI-008` | `codeplane extension linear list` after successful install | Shows the created integration |
| `CB-CLI-009` | `codeplane extension linear remove <id>` for an existing integration | Integration removed, confirmed by subsequent list |

### Token Security Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CB-TOK-001` | After successful callback, verify no token appears in the redirect URL | URL contains only `?setup=<opaqueKey>`, no access_token or refresh_token |
| `CB-TOK-002` | After successful callback, verify no token appears in browser `document.cookie` | No Linear token in any accessible cookie |
| `CB-TOK-003` | Inspect the `linear_oauth_setups` table `payload_encrypted` column directly | Column contains binary data, not readable JSON |
| `CB-TOK-004` | Verify that decrypting the payload with the correct key yields valid JSON with expected fields | Decrypted payload matches expected schema |
| `CB-TOK-005` | Verify that decrypting the payload with a wrong key fails (authentication tag mismatch) | Decryption error thrown |

### Rate Limiting Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `CB-RL-001` | Send 120 requests to the callback endpoint within 1 minute | First 120 succeed (302), subsequent requests return 429 |
| `CB-RL-002` | Verify rate limit headers are present on callback response | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers present |
