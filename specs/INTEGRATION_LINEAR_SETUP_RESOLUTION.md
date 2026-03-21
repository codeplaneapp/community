# INTEGRATION_LINEAR_SETUP_RESOLUTION

Specification for INTEGRATION_LINEAR_SETUP_RESOLUTION.

## High-Level User POV

After a Codeplane user authorizes Codeplane to access their Linear workspace via OAuth, they are redirected back to the Codeplane integrations page. At this point, the user's browser holds an opaque setup key in the URL — but they have not yet seen any information about their Linear account or chosen which Linear team to connect. The setup resolution step is the moment where Codeplane retrieves and displays the user's Linear identity and their available Linear teams, so the user can proceed with configuring the integration.

From the user's perspective, this step feels nearly invisible. They return from Linear's authorization screen, and within moments, the Codeplane integration page shows a confirmation of who they are on Linear — their name and email — along with a list of Linear teams they belong to. The user did not need to copy any tokens, paste any keys, or provide any credentials. Everything was handled securely behind the scenes, and the user is now looking at a clean form where they can pick a Linear team and a Codeplane repository to connect.

The setup resolution step is the critical bridge between "I authorized on Linear" and "I can now configure my integration." If this step fails — because the setup expired (the user waited too long), was already used (a duplicate tab or replay), or belongs to a different user (a security boundary) — the user sees a clear, actionable error message telling them exactly what happened and offering a prominent "Try Again" button to restart the OAuth flow. The user should never see a cryptic error, a blank page, or a raw JSON error payload.

This feature protects the user's security by ensuring that Linear credentials never touch the browser. The only thing the browser ever sees is the opaque setup key. The actual Linear tokens remain encrypted server-side, and the setup resolution endpoint returns only the minimum information needed for the user to make their configuration choice: their Linear identity and their team list. The setup key is time-limited (10 minutes) and single-use, so even if someone intercepts the URL, they cannot replay it or use it from another account.

## Acceptance Criteria

### Definition of Done

The `INTEGRATION_LINEAR_SETUP_RESOLUTION` feature is done when:

- A user who has completed the Linear OAuth callback successfully can load the integration configuration page and see their Linear identity (name and email) and available Linear teams displayed within the setup form.
- The frontend fetches setup data from the API using the opaque setup key from the URL, and the API returns the correct viewer and team information.
- Expired, consumed, non-existent, and user-mismatched setup keys are all rejected with a consistent 404 error that does not leak information about why the key was rejected.
- The setup resolution response contains only the minimum data needed for UI display — no tokens, no secrets, no internal IDs beyond what is required.
- The feature is gated behind the `integrations` feature flag.
- All edge cases around timing, concurrency, and security are handled gracefully with user-friendly errors.

### Functional Constraints

- [ ] The endpoint `GET /api/integrations/linear/oauth/setup/:setupKey` MUST require an authenticated Codeplane session (session cookie or PAT-based authorization).
- [ ] Unauthenticated requests MUST receive HTTP 401 with `{ "error": "authentication required" }`.
- [ ] The `setupKey` path parameter MUST be validated as non-empty after trimming. Empty or whitespace-only keys MUST receive HTTP 400 with `{ "error": "setup key is required" }`.
- [ ] The endpoint MUST look up the setup record by the combination of `setupKey` AND the authenticated user's `user_id`.
- [ ] If no matching record is found — whether because the key does not exist, has expired, has been consumed, or belongs to a different user — the endpoint MUST return HTTP 404 with `{ "error": "OAuth setup not found or expired" }`.
- [ ] The error message for all 404 cases MUST be identical to prevent information leakage.
- [ ] The endpoint MUST NOT consume (delete or mark as used) the setup record. Setup resolution is a read-only operation; consumption happens during `INTEGRATION_LINEAR_CREATE`.
- [ ] The endpoint MUST decrypt the `payload_encrypted` column from the database using AES-256-GCM with the server's `CODEPLANE_SECRET_KEY`.
- [ ] The response MUST return exactly the following shape: `{ "viewer": { "id": "string", "name": "string", "email": "string" }, "teams": [{ "id": "string", "name": "string", "key": "string" }] }`.
- [ ] The response MUST NOT include access tokens, refresh tokens, token expiration times, or any other credential material.
- [ ] The `teams` array MUST contain all teams the user has access to in Linear. If the user belongs to zero teams, the array MUST be empty (`[]`), not null.
- [ ] The endpoint MUST be idempotent — calling it multiple times with the same valid setup key MUST return the same data.
- [ ] The setup record MUST expire 10 minutes after creation. Requests with an expired setup key MUST receive HTTP 404.
- [ ] If decryption fails, the endpoint MUST return HTTP 500 with a generic error, never exposing decryption failure details to the client.

### Edge Cases

- [ ] If the user's Codeplane session expired between the OAuth callback and the setup resolution fetch, the user MUST receive HTTP 401.
- [ ] If the user opens the integration page in two browser tabs after OAuth callback and both tabs fetch setup resolution simultaneously, both MUST succeed (read-only, not consumed).
- [ ] If the user completes OAuth, navigates away, and returns within 10 minutes, setup resolution MUST still succeed.
- [ ] If the user waits longer than 10 minutes, setup resolution MUST fail with HTTP 404.
- [ ] If the user starts a new OAuth flow, the old setup key MUST still be valid until it expires or is consumed.
- [ ] If the setup key contains URL-encoded characters, the framework MUST handle them correctly.
- [ ] If the database is unavailable, the endpoint MUST return HTTP 500 with a generic error.
- [ ] If the encrypted payload is corrupted, decryption MUST fail gracefully and return HTTP 500.

### Boundary Constraints

- [ ] The `setupKey` MUST be at least 32 characters long. Keys shorter than 32 characters MUST be rejected with HTTP 400.
- [ ] The `setupKey` MUST NOT exceed 256 characters. Keys exceeding this length MUST be rejected with HTTP 400.
- [ ] The `viewer.name` MAY be an empty string but MUST NOT be null.
- [ ] The `viewer.email` MAY be an empty string but MUST NOT be null.
- [ ] The `teams` array MAY contain zero elements but MUST NOT be null.
- [ ] The `team.name` has no maximum length enforced by Codeplane (Linear controls this).

## Design

### API Shape

#### `GET /api/integrations/linear/oauth/setup/:setupKey`

**Purpose:** After the OAuth callback redirect, the frontend calls this endpoint to retrieve the authenticated user's Linear identity and available teams from the encrypted server-side setup record.

**Path Parameters:**

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `setupKey` | string | Yes | 32–256 characters, non-empty | Opaque key from the OAuth callback redirect URL |

**Authentication:** Session cookie or PAT-based `Authorization` header (required).

**Success Response:** HTTP 200

```json
{
  "viewer": {
    "id": "usr_abc123",
    "name": "Alice Chen",
    "email": "alice@example.com"
  },
  "teams": [
    { "id": "team_def456", "name": "Engineering", "key": "ENG" },
    { "id": "team_ghi789", "name": "Platform", "key": "PLAT" }
  ]
}
```

**Error Responses:**

| Condition | Status | Response Body |
|-----------|--------|---------------|
| Unauthenticated | 401 | `{ "error": "authentication required" }` |
| Empty or whitespace-only setupKey | 400 | `{ "error": "setup key is required" }` |
| setupKey < 32 or > 256 characters | 400 | `{ "error": "invalid setup key" }` |
| Not found / expired / consumed / wrong user | 404 | `{ "error": "OAuth setup not found or expired" }` |
| Decryption failure / server error | 500 | `{ "error": "internal server error" }` |
| Feature flag disabled | 404 | Not mounted |
| Rate limited | 429 | `{ "error": "rate limit exceeded" }` |

### Web UI Design

#### Setup Resolution Loading State

When the user arrives at `/integrations/linear?setup=<setupKey>` after the OAuth callback:

1. **Loading state**: The page detects the `setup` query parameter and shows a loading indicator: "Completing Linear connection..." or a skeleton loader in the form area.
2. **API call**: Frontend issues `GET /api/integrations/linear/oauth/setup/<setupKey>`.
3. **Success transition**: On HTTP 200:
   - Confirmation banner: "Connected as **{viewer.name}** ({viewer.email})" with Linear logo.
   - If `viewer.name` is empty: "Connected as **{viewer.email}**".
   - Team selector: radio group or dropdown with each team as "TeamName (KEY)".
   - If teams array is empty: warning "No Linear teams found" with disabled "Complete Setup" button.
   - Repository selector: searchable dropdown from `GET /api/integrations/linear/repositories`.
   - "Complete Setup" primary button and "Cancel" secondary button.
4. **Error transition**: On HTTP 404:
   - Error banner: "Your Linear authorization has expired or was already used. Please connect again."
   - "Connect Linear" button to restart OAuth flow.
   - `?setup=` parameter removed from URL via `history.replaceState`.
5. **Network error**: On HTTP 500 or network failure:
   - Error banner: "Something went wrong while loading your Linear connection. Please try again."
   - "Retry" button (re-calls setup resolution) and "Start Over" button (new OAuth flow).

#### Accessibility

- Loading indicator with `aria-live="polite"` region.
- Team selector is keyboard-navigable.
- Error banners use `role="alert"`.
- "Connected as..." banner is an `aria-live` region.

### SDK Shape

The `@codeplane/sdk` service layer exposes:

```typescript
interface LinearSetupResult {
  viewer: { id: string; name: string; email: string };
  teams: Array<{ id: string; name: string; key: string }>;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

interface LinearService {
  getOAuthSetup(userId: number, setupKey: string): Promise<LinearSetupResult>;
}
```

The route handler strips credential fields (accessToken, refreshToken, expiresAt) from the response before sending to the client.

### CLI Command

No CLI changes required. The CLI bypasses OAuth via `codeplane extension linear install --credentials-stdin`.

### TUI UI

No TUI changes required. The TUI should direct users to the web UI for Linear integration setup.

### Documentation

1. **"Connecting Linear to Codeplane" guide** — Include a step explaining: "After authorizing on Linear, you will be returned to Codeplane. Your Linear identity and teams will be displayed. If you see an error about an expired session, click 'Connect Linear' to start again — the link is valid for 10 minutes."
2. **"Troubleshooting Linear Integration" page** — Cover: "OAuth setup not found or expired" (waited too long; retry), "No Linear teams found" (ask workspace admin to add you to a team), and blank page / loading issues (check connection; try new tab).

## Permissions & Security

### Authorization Requirements

| Action | Required Role | Notes |
|--------|---------------|-------|
| Call setup resolution endpoint | Authenticated user (any role) | User must be the same user who initiated the OAuth flow |
| View setup resolution data | Authenticated user (any role) | Only the user's own Linear identity and teams are returned |

The setup resolution step does not require any specific repository or organization role. Any authenticated Codeplane user who initiated the OAuth flow can retrieve their own setup data. The repository admin check happens during `INTEGRATION_LINEAR_CREATE`.

### User-scoping Invariant

The endpoint MUST only return data for setup records matching the authenticated user's `user_id` (enforced at the database query level: `WHERE user_id = $2`). A valid setup key belonging to User A MUST return 404 when requested by User B. The 404 message MUST be identical to all other 404 cases to prevent user enumeration.

### Rate Limiting

- Global rate limit of 120 requests per minute per user/IP applies.
- No elevated per-route rate limit required — setup keys are opaque, time-limited, and user-scoped, making brute-force impractical.
- If >50 setup resolution requests per minute are detected from a single IP, log at WARN level as a potential enumeration attempt.

### Data Privacy & PII

- `viewer.email` is PII and MUST NOT appear in server application logs at any level.
- `viewer.name` is PII and MUST NOT appear in server application logs at any level.
- `viewer.id` (Linear's internal user ID) is not PII and may appear in logs.
- `setupKey` MUST NOT be logged at INFO or above. A SHA-256 hash (`setup_key_hash`) may be logged for correlation.
- Response MUST NOT include tokens, refresh tokens, or credential material.
- Setup records containing encrypted PII are cleaned up after 10 minutes by the background cleanup scheduler.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `LinearOAuthSetupResolved` | Setup resolution endpoint returns HTTP 200 | `user_id`, `setup_key_hash` (SHA-256), `team_count`, `viewer_linear_id`, `duration_ms`, `timestamp` |
| `LinearOAuthSetupExpired` | Setup resolution fails with HTTP 404 | `user_id`, `setup_key_hash` (SHA-256), `reason` (internally: `not_found` / `expired` / `consumed` / `user_mismatch` — all surfaced as `not_found` in the API), `timestamp` |
| `LinearOAuthSetupError` | Setup resolution fails with HTTP 400 or 500 | `user_id`, `error_type` (enum: `empty_key`, `invalid_key_length`, `decryption_failed`, `internal_error`), `timestamp` |

### Funnel Metrics

Setup resolution is step 4 in the Linear integration connection funnel:

1. OAuth Start → `LinearOAuthStartInitiated`
2. OAuth Callback Received → `LinearOAuthCallbackReceived`
3. OAuth Callback Succeeded → `LinearOAuthCallbackSucceeded`
4. **Setup Resolved → `LinearOAuthSetupResolved`** ← this feature
5. Integration Configured → `LinearIntegrationConfigured`

### Key Success Indicators

- **Setup resolution rate**: `LinearOAuthSetupResolved / LinearOAuthCallbackSucceeded` — Target: >98%.
- **Setup resolution latency**: p50 of `duration_ms` — Target: <200ms.
- **Setup expiry rate**: `LinearOAuthSetupExpired / LinearOAuthCallbackSucceeded` — Target: <2%.
- **Funnel drop-off at setup**: `1 - (LinearOAuthSetupResolved / LinearOAuthCallbackSucceeded)` — Any sustained drop-off >5% requires investigation.
- **Setup-to-configuration rate**: `LinearIntegrationConfigured / LinearOAuthSetupResolved` — Target: >80%.

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Notes |
|-----------|-------|-------------------|-------|
| Setup resolution requested | `INFO` | `user_id`, `request_id`, `setup_key_hash` | Entry log for every request |
| Setup key validation failed | `WARN` | `user_id`, `request_id`, `reason` (`empty`, `too_short`, `too_long`) | Client sent invalid key |
| Setup record found | `DEBUG` | `user_id`, `request_id`, `setup_key_hash`, `created_at`, `expires_at` | Before decryption |
| Setup record not found | `INFO` | `user_id`, `request_id`, `setup_key_hash` | No matching record |
| Payload decryption succeeded | `DEBUG` | `user_id`, `request_id`, `team_count` | Successful decryption |
| Payload decryption failed | `ERROR` | `user_id`, `request_id`, `setup_key_hash`, `error_message` | MUST NOT log payload or key |
| Setup resolution succeeded | `INFO` | `user_id`, `request_id`, `setup_key_hash`, `team_count`, `duration_ms` | Completed successfully |
| Setup resolution failed | `WARN` | `user_id`, `request_id`, `setup_key_hash`, `status_code`, `error_message` | Any failure |
| Unauthenticated request | `WARN` | `request_id`, `remote_addr` | No valid session |
| Database query error | `ERROR` | `user_id`, `request_id`, `error_message` | DB unavailable or query failure |

**MUST NOT log:** Setup key values in plaintext, Linear viewer email, Linear viewer name, encrypted payloads, decryption keys.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_linear_setup_resolution_total` | Counter | `status` (`success`, `not_found`, `error`, `unauthorized`, `bad_request`) | Total requests by outcome |
| `codeplane_linear_setup_resolution_duration_seconds` | Histogram | `status` | End-to-end request duration |
| `codeplane_linear_setup_decryption_duration_seconds` | Histogram | `status` (`success`, `error`) | Decryption time |
| `codeplane_linear_setup_decryption_errors_total` | Counter | — | Decryption failure count |
| `codeplane_linear_oauth_active_setups` | Gauge | — | Unexpired, unconsumed setup records |
| `codeplane_linear_setup_resolution_teams_returned` | Histogram | — | Team count distribution |

### Alerts

#### Alert: `LinearSetupResolutionErrorRateHigh`
- **Condition:** `rate(codeplane_linear_setup_resolution_total{status="error"}[5m]) / rate(codeplane_linear_setup_resolution_total[5m]) > 0.1` for 10 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_linear_setup_resolution_total` by `status` label for dominant failure mode.
  2. If `status="error"`: Check `codeplane_linear_setup_decryption_errors_total`. If rising, verify `CODEPLANE_SECRET_KEY` has not been rotated. Key rotation while old-key setup records exist causes all pending setups to fail. Users must restart OAuth.
  3. Check server logs by `request_id` for database connectivity errors.
  4. If database errors: Check PostgreSQL health, connection pool, recent migrations.
  5. If transient, monitor 5 minutes for auto-recovery.

#### Alert: `LinearSetupDecryptionFailures`
- **Condition:** `rate(codeplane_linear_setup_decryption_errors_total[5m]) > 0` for 5 minutes
- **Severity:** Critical
- **Runbook:**
  1. Any decryption failure is unusual — likely a configuration issue.
  2. Verify `CODEPLANE_SECRET_KEY` is set and unchanged since setup records were created.
  3. If key was rotated: Expected. Records auto-expire in ≤10 min. Users restart flow.
  4. If key was NOT rotated: Check for data corruption in `linear_oauth_setups.payload_encrypted`. Inspect for truncated/malformed data.
  5. Check for recent migrations affecting the table schema.
  6. If corruption confirmed, escalate to database team.

#### Alert: `LinearSetupNotFoundRateHigh`
- **Condition:** `rate(codeplane_linear_setup_resolution_total{status="not_found"}[10m]) / rate(codeplane_linear_setup_resolution_total[10m]) > 0.5` for 15 minutes
- **Severity:** Warning
- **Runbook:**
  1. High not-found rate suggests stale/invalid setup keys arriving.
  2. Verify OAuth callback is creating setup records (`codeplane_linear_oauth_setup_created_total` incrementing).
  3. Check if cleanup scheduler is too aggressive (unlikely with 10-min TTL).
  4. Check if users are bookmarking/sharing `?setup=` URLs.
  5. Check browser telemetry for page refreshes after setup consumption.
  6. If caused by slow networks (10-min window elapsing), consider extending TTL.

#### Alert: `LinearSetupResolutionLatencyHigh`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_linear_setup_resolution_duration_seconds_bucket[5m])) > 2` for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Should be <200ms (one DB read + AES-256-GCM decrypt).
  2. Check `codeplane_linear_setup_decryption_duration_seconds` to isolate slow component.
  3. If decryption slow: Check CPU utilization and hardware AES acceleration.
  4. If DB slow: Check PostgreSQL query latency, connection pool, table size.
  5. Check overall server resource pressure.

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|-------------|-----------|--------|------------|
| Setup record expired | DB query returns null | User sees error, must restart OAuth | UI shows clear error with retry button |
| Setup record consumed | DB query returns null | User sees error | Idempotent error; user restarts flow |
| Setup key from different user | DB query returns null | Attacker sees generic 404 | Same message as all 404 cases |
| Decryption key rotated | GCM auth tag mismatch | All pending setups unreadable | Alert fires; records auto-expire ≤10 min |
| Encrypted payload corrupted | Decryption throws | Individual setup unreadable | Return 500; log error; user restarts |
| Database unavailable | Query throws | All resolutions fail | Return 500; monitor DB health |
| Malformed decrypted JSON | JSON.parse throws | Individual setup unreadable | Return 500; investigate data integrity |
| CODEPLANE_SECRET_KEY missing | Decryption cannot proceed | All resolutions fail | Alert fires; admin sets env var |
| Brute-force enumeration | High 404 volume from single IP | Wasted resources | Global rate limit; WARN logging |

## Verification

### API Integration Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `SR-API-001` | `GET /api/integrations/linear/oauth/setup/:setupKey` with valid, unexpired, unconsumed setup key belonging to authenticated user | HTTP 200 with `viewer` object and `teams` array |
| `SR-API-002` | Verify response contains `viewer.id`, `viewer.name`, `viewer.email` as strings | All three fields present and are strings |
| `SR-API-003` | Verify response contains `teams` as array of objects with `id`, `name`, `key` string fields | Array structure matches schema |
| `SR-API-004` | Verify response does NOT contain `accessToken`, `refreshToken`, `expiresAt`, or any credential fields | None present in response JSON |
| `SR-API-005` | `GET /api/integrations/linear/oauth/setup/:setupKey` without authentication | HTTP 401 `{ "error": "authentication required" }` |
| `SR-API-006` | Setup resolution with expired setup key (created >10 minutes ago) | HTTP 404 `{ "error": "OAuth setup not found or expired" }` |
| `SR-API-007` | Setup resolution with already-consumed setup key | HTTP 404 `{ "error": "OAuth setup not found or expired" }` |
| `SR-API-008` | Setup resolution with setup key belonging to a different user | HTTP 404 `{ "error": "OAuth setup not found or expired" }` |
| `SR-API-009` | Setup resolution with a nonexistent setup key | HTTP 404 `{ "error": "OAuth setup not found or expired" }` |
| `SR-API-010` | Verify all 404 error messages are identical across SR-API-006 through SR-API-009 | Exact same string in all cases |
| `SR-API-011` | Setup resolution with empty path parameter (trailing slash) | HTTP 400 or 404 (route not matched) |
| `SR-API-012` | Setup resolution with whitespace-only setup key | HTTP 400 `{ "error": "setup key is required" }` |
| `SR-API-013` | Setup resolution with setupKey of exactly 32 characters (minimum valid) | HTTP 200 if record exists, 404 if not |
| `SR-API-014` | Setup resolution with setupKey of exactly 256 characters (maximum valid) | HTTP 200 if record exists, 404 if not |
| `SR-API-015` | Setup resolution with setupKey of 257 characters (over maximum) | HTTP 400 `{ "error": "invalid setup key" }` |
| `SR-API-016` | Setup resolution with setupKey of 31 characters (under minimum) | HTTP 400 `{ "error": "invalid setup key" }` |
| `SR-API-017` | Call setup resolution twice with same valid key (idempotency) | Both return HTTP 200 with identical data |
| `SR-API-018` | Resolve setup, then consume via POST, then resolve again | First 200, POST succeeds, second 404 |
| `SR-API-019` | Verify `teams` is `[]` (not null) when user has no teams | Response contains `"teams": []` |
| `SR-API-020` | Verify `viewer.name` is `""` when Linear user has empty display name | `viewer.name` is empty string, not null |
| `SR-API-021` | Setup resolution with payload containing 50 teams | HTTP 200 with all 50 teams |
| `SR-API-022` | Setup resolution with payload containing 1 team | HTTP 200 with 1 team |
| `SR-API-023` | Setup resolution with PAT-based auth | HTTP 200 (same as session-based) |
| `SR-API-024` | Setup resolution with expired PAT | HTTP 401 |
| `SR-API-025` | Setup resolution with revoked PAT | HTTP 401 |

### Security Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `SR-SEC-001` | Access User A's setup key while authenticated as User B | HTTP 404 (not 403) |
| `SR-SEC-002` | Enumerate setup keys with 1000 random 32-char hex strings | All 404; rate limit at 120/min |
| `SR-SEC-003` | Verify response body never contains "lin_api_" (token prefix) | Substring not found |
| `SR-SEC-004` | Verify response body never contains "lin_ref_" (refresh token prefix) | Substring not found |
| `SR-SEC-005` | Verify server logs for successful resolution do not contain viewer email | Email not in any log line |
| `SR-SEC-006` | Verify server logs do not contain raw setup key | Only `setup_key_hash` appears |
| `SR-SEC-007` | Verify `payload_encrypted` DB column is not readable as plaintext JSON | Raw bytes are not valid JSON |

### Playwright E2E Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `SR-E2E-001` | Happy path: after OAuth callback, page shows user's Linear identity and teams | "Connected as..." banner; teams in selector |
| `SR-E2E-002` | Navigate with `?setup=<expiredKey>`: error state displayed | Error banner with retry button |
| `SR-E2E-003` | Navigate with `?setup=<invalidKey>`: error state when 404 | Error banner; form not shown |
| `SR-E2E-004` | Loading indicator visible during setup resolution | Spinner/skeleton before data |
| `SR-E2E-005` | After error, `?setup=` param removed from URL | URL is `/integrations/linear` |
| `SR-E2E-006` | Error state "Connect Linear" button initiates new OAuth | Navigates to OAuth start |
| `SR-E2E-007` | Team selector lists all teams with name and key | "TeamName (KEY)" format |
| `SR-E2E-008` | Single team is pre-selected | Team auto-selected in dropdown |
| `SR-E2E-009` | Empty teams shows warning and disables Complete Setup | Warning visible; button disabled |
| `SR-E2E-010` | Cancel button navigates away without consuming setup | Navigation; key not consumed |
| `SR-E2E-011` | Screen reader announces "Connected as..." via aria-live | `aria-live` region triggers |
| `SR-E2E-012` | Direct navigation without params shows Connect CTA | CTA displayed; no errors |
| `SR-E2E-013` | Full E2E: start → callback → resolution → configure → verify listed | Integration in list |

### Rate Limiting Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `SR-RL-001` | 120 requests/min to setup resolution with valid session | First 120 succeed; then 429 |
| `SR-RL-002` | Verify rate limit headers present | `X-RateLimit-*` headers present |
| `SR-RL-003` | Rate limits are per-user: User A limited, User B succeeds | User B unaffected |

### Cleanup and Lifecycle Tests

| Test ID | Test Description | Expected Outcome |
|---------|-----------------|------------------|
| `SR-LC-001` | Create setup, set `expires_at` to past, run cleanup, verify deleted | Record gone |
| `SR-LC-002` | Consume setup via POST, then attempt resolution | Returns 404 |
| `SR-LC-003` | Two setups for same user; resolve first; second still valid | Second returns 200 |
| `SR-LC-004` | Cleanup scheduler does not delete unexpired records | Record persists |
