# BILLING_ACCOUNT_BALANCE_VIEW

Specification for BILLING_ACCOUNT_BALANCE_VIEW.

## High-Level User POV

When a Codeplane user navigates to their billing settings, they should be able to see their current credit balance displayed prominently and clearly. This is the primary financial touchpoint between the user and the Codeplane platform — it answers the most fundamental billing question: "How much credit do I have?"

The balance view shows the user their available credits in a human-readable dollar-and-cents format, along with contextual information about when credits were last granted. For most Community Edition users who receive a monthly $10.00 credit grant, this view provides reassurance that their account is active and funded. For users who have purchased additional credits, received admin adjustments, or incurred deductions from workspace compute, CI minutes, LLM token usage, or other metered resources, the balance view serves as the single source of truth for their current standing.

The balance view is accessible from the user's account settings area in the web UI. It can also be retrieved programmatically through the CLI, and it is surfaced in the TUI dashboard. Organization owners and admins can also view the balance of their organization's billing account through the corresponding organization settings. In all cases, the view is read-only — the user cannot modify their balance directly. Credits are added through monthly grants, admin actions, or future purchase flows, and deducted through metered resource consumption.

The value this feature provides is transparency and trust. Users should never wonder whether they have sufficient credits to create a workspace, run a workflow, or start an agent session. The balance view, combined with the related quota check system, gives them confidence about their account's operational health before they take actions that consume credits.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users can view their own credit balance via Web UI, CLI, and TUI
- [ ] The balance is displayed in human-readable dollar format (e.g., "$10.00") derived from the `balance_cents` integer
- [ ] The last grant timestamp is displayed in a localized, human-readable format
- [ ] Organization owners/admins can view their organization's credit balance
- [ ] Unauthenticated requests receive a 401 response
- [ ] Users without a billing account see a zero-balance state rather than an error
- [ ] The feature is gated behind the `BILLING_ACCOUNT_BALANCE_VIEW` feature flag
- [ ] All clients (Web, CLI, TUI) consume the same API endpoint

### Functional Constraints

- [ ] Balance is always expressed in integer cents internally; display conversion to dollars happens at the presentation layer
- [ ] Balance can be negative (indicating overdraft from usage-before-enforcement scenarios); negative balances must be clearly indicated in the UI with a warning treatment
- [ ] The `billing_account_id` field returned by the API is an opaque string; clients must not parse or derive meaning from it
- [ ] The `last_grant_at` field may be `null` if no grant has ever been issued; the UI must handle this gracefully (e.g., "No grants received yet")
- [ ] The `updated_at` timestamp reflects the last time the balance row was modified, not the last time the user viewed it
- [ ] When billing is disabled in CE mode, the balance endpoint still returns data (the billing account and balance exist), but quota enforcement is not active — the UI should indicate this clearly

### Edge Cases

- [ ] New user with no billing account yet: the API returns `balance_cents: 0` and `last_grant_at: null` — the UI displays "$0.00" with a contextual message
- [ ] User whose balance has been fully depleted: displays "$0.00" with a low-balance warning
- [ ] User with a negative balance: displays the negative amount (e.g., "-$3.50") with a distinct visual warning
- [ ] Organization that has never had credits granted: displays "$0.00" gracefully
- [ ] Concurrent credit operations (grant + deduction happening simultaneously): the API returns the balance as of the read; no stale-read guarantee is required beyond normal database consistency
- [ ] User who is a member of an organization but is not an owner or admin: cannot view the org balance (receives 403 or the route is not accessible to them)
- [ ] Feature flag `BILLING_ACCOUNT_BALANCE_VIEW` is disabled: the balance route returns normally but the UI does not render the billing section in navigation or settings

### Boundary Constraints

- [ ] `balance_cents` is an integer; maximum representable value is bounded by the database column type (bigint — up to ±9,223,372,036,854,775,807)
- [ ] `billing_account_id` is a UUID string (36 characters including hyphens)
- [ ] `last_grant_at` and `updated_at` are ISO 8601 timestamps in UTC
- [ ] Pagination parameters for related views (ledger) are clamped: `page >= 1`, `per_page` clamped to `[1, 100]`
- [ ] The balance endpoint takes no request body or query parameters — it is a simple authenticated GET
- [ ] The org balance endpoint requires the `org` path parameter, which is a string identifier (organization slug or ID)

## Design

### Web UI Design

The billing balance view is a section within the user's settings area, accessible at a route like `/settings/billing` (or within the existing settings layout).

**Layout:**

- **Balance Card**: A prominent card at the top of the billing settings page displaying:
  - **Current Balance**: Large, bold text showing the formatted dollar amount (e.g., "$10.00")
  - **Balance Status Indicator**:
    - Green/healthy when balance > $5.00
    - Yellow/warning when balance is between $0.01 and $5.00
    - Red/danger when balance is $0.00 or negative
  - **Last Grant Date**: Smaller subtitle text showing "Last credited: March 1, 2026" or "No credits received yet" if null
  - **Last Updated**: Subtle timestamp showing when the balance was last modified
  - **Billing Mode Indicator**: When billing enforcement is disabled (CE mode), a subtle badge or note reading "Community Edition — billing enforcement inactive"

- **Negative Balance Treatment**: If `balance_cents < 0`, the balance text is displayed in red with a minus sign and an explanatory tooltip: "Your account has a negative balance. Some operations may be restricted until credits are added."

- **Loading State**: While the balance is being fetched, a skeleton/shimmer placeholder fills the balance card area. No stale cached value is shown.

- **Error State**: If the balance API returns an error, the card displays an error message with a retry button: "Unable to load balance. Try again."

- **Feature Flag Gating**: When `BILLING_ACCOUNT_BALANCE_VIEW` is disabled, the billing section does not appear in the settings navigation sidebar. Direct URL access to `/settings/billing` redirects to `/settings` or shows a "Coming Soon" placeholder.

**Organization Balance:**

The organization billing balance is accessible at `/orgs/:org/settings/billing` for organization owners and admins. The layout mirrors the user balance card but includes the organization name in the card header.

### API Shape

**User Balance Endpoint:**

```
GET /api/billing/balance
Authorization: Bearer <token> | Cookie session

Response 200:
{
  "billing_account_id": "uuid-string",
  "balance_cents": 1000,
  "last_grant_at": "2026-03-01T00:00:00.000Z",
  "updated_at": "2026-03-15T14:30:00.000Z"
}

Response 200 (no balance row):
{
  "billing_account_id": "uuid-string",
  "balance_cents": 0,
  "last_grant_at": null,
  "updated_at": "2026-03-22T00:00:00.000Z"
}

Response 401:
{
  "message": "authentication required"
}
```

**Organization Balance Endpoint:**

```
GET /api/orgs/:org/billing/balance
Authorization: Bearer <token> | Cookie session

Response 200:
{
  "billing_account_id": "uuid-string",
  "balance_cents": 5000,
  "last_grant_at": "2026-03-01T00:00:00.000Z",
  "updated_at": "2026-03-20T10:00:00.000Z"
}

Response 401: { "message": "authentication required" }
Response 404: { "message": "billing account not found" }
```

### SDK Shape

The `BillingService.getBalance(ownerType, ownerId)` method is the authoritative service call. It returns a `CreditBalanceResponse`:

```typescript
interface CreditBalanceResponse {
  billing_account_id: string;
  balance_cents: number;
  last_grant_at: Date | null;
  updated_at: Date;
}
```

The UI-core shared package should expose hooks for the balance:

```typescript
function useBillingBalance(): Resource<CreditBalanceResponse>
function useOrgBillingBalance(org: string): Resource<CreditBalanceResponse>
```

### CLI Command

```
codeplane billing balance
```

**Output (default):**
```
Credit Balance: $10.00
Last Credited:  March 1, 2026
Updated:        March 15, 2026 at 2:30 PM UTC
```

**Output (--json):**
```json
{
  "billing_account_id": "uuid-string",
  "balance_cents": 1000,
  "last_grant_at": "2026-03-01T00:00:00.000Z",
  "updated_at": "2026-03-15T14:30:00.000Z"
}
```

**Organization variant:**
```
codeplane billing balance --org my-org
```

**Error cases:**
- Not authenticated: `Error: authentication required. Run 'codeplane auth login' first.`
- No billing account: Shows `$0.00` balance with a note

### TUI UI

The TUI should display the billing balance in two locations:

1. **Dashboard screen**: A balance summary widget showing the current dollar amount and a color-coded status indicator (green/yellow/red)
2. **Dedicated billing screen**: Full balance card with last grant date and updated timestamp, rendered in Ink components

The TUI balance display should use the same `ui-core` data hooks as the web UI, adapted for the React/Ink rendering layer.

### Documentation

- **"Understanding Your Credit Balance"**: Help article explaining what credits are, how they are granted (monthly $10 grant), how they are consumed (workspace compute, CI minutes, LLM tokens, sync operations, storage), and what happens when balance reaches zero
- **"Viewing Your Balance"**: Step-by-step instructions for checking balance via web UI, CLI, and TUI with examples
- **"Organization Billing"**: How org billing accounts work, who can view the balance, and how org credits differ from user credits
- **"Billing in Community Edition"**: Explanation that CE users receive monthly grants and billing enforcement is optional in self-hosted deployments

## Permissions & Security

### Authorization Roles

| Action | Owner | Admin | Member | Read-Only | Anonymous |
|--------|-------|-------|--------|-----------|-----------|
| View own user balance | ✅ | ✅ | ✅ | ✅ | ❌ |
| View org balance | ✅ | ✅ | ❌ | ❌ | ❌ |

- **User balance**: Any authenticated user can view their own balance. The endpoint is scoped to the authenticated user's identity — there is no way to view another user's balance through this endpoint.
- **Organization balance**: Only organization owners and admins can view the organization's billing balance. Regular members and read-only members should not have access. The server must verify org membership and role before returning the balance.
- **Admin access**: Platform admins can view any account's balance through the admin dashboard (separate feature scope).

### Rate Limiting

- **User balance endpoint**: Standard rate limit tier (60 requests per minute per authenticated user). Lightweight read-only endpoint; standard throttling is sufficient.
- **Org balance endpoint**: Same standard rate limit tier, scoped per authenticated user.
- **No elevated rate limit needed**: The balance endpoint is not computationally expensive.

### Data Privacy Constraints

- **PII Exposure**: The balance response does not contain PII. The `billing_account_id` is an opaque UUID. `balance_cents` is financial data accessible only to the account owner.
- **No cross-user access**: The user balance endpoint is strictly scoped to the authenticated user's ID. No parameter allows querying another user's balance.
- **Org balance isolation**: Organization balance is only accessible to authenticated users with owner/admin roles on that specific organization.
- **Logging**: Balance amounts should not be logged at INFO level in access logs. Debug-level logging may include them for troubleshooting only.
- **Token scoping**: If PAT scopes are implemented in the future, billing balance should require a `billing:read` scope.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `BillingBalanceViewed` | User loads the balance view (web, CLI, TUI) | `owner_type`, `client` (web/cli/tui), `balance_cents`, `balance_status` (healthy/warning/danger/negative), `billing_enabled` |
| `BillingBalanceApiCalled` | API endpoint is called | `owner_type`, `response_status`, `latency_ms` |
| `BillingBalanceZeroEncountered` | Balance returned as exactly $0.00 | `owner_type`, `last_grant_at`, `billing_enabled` |
| `BillingBalanceNegativeEncountered` | Balance returned as negative | `owner_type`, `balance_cents`, `billing_enabled` |

### Event Properties Schema

```typescript
interface BillingBalanceViewedEvent {
  owner_type: "user" | "org";
  client: "web" | "cli" | "tui" | "api";
  balance_cents: number;
  balance_status: "healthy" | "warning" | "danger" | "negative";
  billing_enabled: boolean;
  org_id?: string;
  timestamp: string;
}
```

### Funnel Metrics & Success Indicators

- **Adoption rate**: Percentage of active users who view their balance at least once per billing period (target: >40% of users with billing accounts)
- **Repeat views**: Average number of balance views per user per month (indicates utility vs anxiety)
- **Zero-balance encounter rate**: Percentage of balance views where balance is $0 or negative (operational health metric)
- **Client distribution**: Breakdown of balance views by client type (web vs CLI vs TUI)
- **Error rate**: Percentage of balance API calls returning non-200 responses (target: <0.1%)
- **Latency p99**: 99th percentile latency of the balance API endpoint (target: <200ms)

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | When |
|-----------|-------|-------------------|------|
| Balance fetched successfully | DEBUG | `{ owner_type, owner_id, billing_account_id, latency_ms }` | Every successful balance retrieval |
| Billing account not found | WARN | `{ owner_type, owner_id }` | `requireBillingAccount` throws 404 |
| Balance fetch failed | ERROR | `{ owner_type, owner_id, error_message, stack_trace }` | Unhandled error in `getBalance` |
| Zero balance returned | INFO | `{ owner_type, owner_id, billing_account_id, last_grant_at }` | When `balance_cents` is exactly 0 |
| Negative balance returned | WARN | `{ owner_type, owner_id, billing_account_id, balance_cents }` | When `balance_cents < 0` |
| Unauthenticated balance request | INFO | `{ request_id, ip_address }` | 401 returned |

**Note**: Never log `balance_cents` at INFO or higher in production access logs unless it is a diagnostic condition (zero or negative). Debug-level logging may include it.

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_billing_balance_requests_total` | Counter | `owner_type`, `status_code` | Total balance API requests |
| `codeplane_billing_balance_request_duration_seconds` | Histogram | `owner_type` | Latency distribution of balance requests |
| `codeplane_billing_balance_cents` | Gauge | `owner_type` | Current balance sampled on each request |
| `codeplane_billing_balance_zero_total` | Counter | `owner_type` | Count of zero-balance responses |
| `codeplane_billing_balance_negative_total` | Counter | `owner_type` | Count of negative-balance responses |
| `codeplane_billing_balance_errors_total` | Counter | `owner_type`, `error_type` | Count of errors during balance retrieval |

### Alerts

#### Alert: `BillingBalanceHighErrorRate`
- **Condition**: `rate(codeplane_billing_balance_errors_total[5m]) > 0.05` (>5% failure rate)
- **Severity**: P2 (high)
- **Runbook**:
  1. Check server logs for `billing.balance.error` entries to identify error type
  2. Verify database connectivity: `SELECT 1 FROM billing_accounts LIMIT 1`
  3. Check if billing service is initialized in service registry (`getServices().billing`)
  4. If database unreachable, check PGLite (daemon mode) or PostgreSQL (server mode) status
  5. If billing service is null, check server startup logs for initialization failures
  6. Restart server process if service registry is corrupted
  7. Escalate to billing team if error is in `BillingService.getBalance` logic itself

#### Alert: `BillingBalanceHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_billing_balance_request_duration_seconds_bucket[5m])) > 2.0` (p99 > 2s)
- **Severity**: P3 (medium)
- **Runbook**:
  1. Check database query performance: run `EXPLAIN ANALYZE` on `getCreditBalance` and `getBillingAccountByOwner` queries
  2. Check for table bloat or missing indexes on `billing_accounts(owner_type, owner_id)` and `billing_credit_balances(billing_account_id)`
  3. Check server resource utilization (CPU, memory, connection pool exhaustion)
  4. If database under load, check for concurrent heavy operations (monthly grant batch, ledger queries)
  5. Consider adding connection pool limit or query timeout if issue is contention

#### Alert: `BillingBalanceNegativeSpike`
- **Condition**: `rate(codeplane_billing_balance_negative_total[1h]) > 10` (>10 negative-balance responses/hour)
- **Severity**: P3 (medium)
- **Runbook**:
  1. Determine if expected (e.g., monthly grant hasn't run yet, beginning of month)
  2. Check if monthly grant cron ran: query `billing_credit_ledger` for `category = 'monthly_grant'` this month
  3. If grants missing, manually trigger via `POST /api/admin/billing/grant-monthly`
  4. If grants ran but balances still negative, check for unexpectedly high deductions in ledger
  5. Review recent usage patterns for affected accounts

### Error Cases and Failure Modes

| Error Case | HTTP Status | Error Response | Recovery |
|------------|-------------|----------------|----------|
| Unauthenticated request | 401 | `{ "message": "authentication required" }` | User must authenticate |
| Billing account not found | 200 | Returns zero-balance response (graceful) | Account auto-created on signup |
| Database connection failure | 500 | `{ "message": "internal server error" }` | Retry; check DB connectivity |
| Service registry not initialized | 500 | `{ "message": "internal server error" }` | Server restart required |
| Malformed org slug | 404 | `{ "message": "billing account not found" }` | User should verify org name |
| Rate limit exceeded | 429 | Standard rate limit response | Client should backoff and retry |

## Verification

### API Integration Tests

#### Authentication & Authorization
- [ ] `GET /api/billing/balance` with valid session cookie returns 200 and a `CreditBalanceResponse`
- [ ] `GET /api/billing/balance` with valid PAT returns 200 and a `CreditBalanceResponse`
- [ ] `GET /api/billing/balance` with no authentication returns 401
- [ ] `GET /api/billing/balance` with an expired session returns 401
- [ ] `GET /api/billing/balance` with a revoked PAT returns 401
- [ ] `GET /api/orgs/:org/billing/balance` with org owner auth returns 200
- [ ] `GET /api/orgs/:org/billing/balance` with org admin auth returns 200
- [ ] `GET /api/orgs/:org/billing/balance` with org member (non-admin) auth returns 403 or appropriate access denied response
- [ ] `GET /api/orgs/:org/billing/balance` with a non-existent org slug returns 404
- [ ] `GET /api/orgs/:org/billing/balance` with no auth returns 401

#### Response Shape Validation
- [ ] Response body contains exactly the fields: `billing_account_id`, `balance_cents`, `last_grant_at`, `updated_at`
- [ ] `billing_account_id` is a valid UUID string
- [ ] `balance_cents` is an integer (not a float, not a string)
- [ ] `last_grant_at` is either a valid ISO 8601 timestamp string or `null`
- [ ] `updated_at` is a valid ISO 8601 timestamp string
- [ ] Response content-type is `application/json`

#### Balance State Tests
- [ ] Newly created user with initial $10 grant: `balance_cents` is 1000 and `last_grant_at` is non-null
- [ ] User after a credit deduction of 300 cents: `balance_cents` is 700
- [ ] User after balance is fully depleted: `balance_cents` is 0
- [ ] User with a negative balance (deductions exceed credits): `balance_cents` is negative (e.g., -350)
- [ ] User after receiving a monthly grant: `balance_cents` increases by 1000 and `last_grant_at` is updated
- [ ] User after multiple grants and deductions: `balance_cents` reflects the correct cumulative total
- [ ] User who has never had a billing account created: service handles gracefully (returns zero balance or creates on demand)

#### Concurrency & Idempotency
- [ ] Two simultaneous `GET /api/billing/balance` requests return consistent (identical) results
- [ ] Balance reflects a recently completed credit addition (eventual consistency within 1 second)
- [ ] Balance reflects a recently completed deduction (eventual consistency within 1 second)

#### Maximum Value Tests
- [ ] Balance of `9223372036854775807` cents (max bigint) is returned correctly without overflow
- [ ] Balance of `-9223372036854775807` cents (min bigint) is returned correctly
- [ ] Verify JSON serialization does not lose precision on large integers (values beyond `Number.MAX_SAFE_INTEGER` = `9007199254740991`)

#### Rate Limiting
- [ ] Sending 61 requests in 1 minute to `GET /api/billing/balance` returns 429 for excess requests (assuming 60/min limit)
- [ ] After rate limit cooldown, requests succeed again

### CLI Integration Tests

- [ ] `codeplane billing balance` when authenticated prints balance in human-readable format (e.g., "Credit Balance: $10.00")
- [ ] `codeplane billing balance --json` prints valid JSON matching `CreditBalanceResponse` shape
- [ ] `codeplane billing balance` when not authenticated prints authentication error and exits non-zero
- [ ] `codeplane billing balance --org my-org` prints the organization balance
- [ ] `codeplane billing balance --org nonexistent-org` prints an appropriate error
- [ ] `codeplane billing balance` with `$0.00` balance displays correctly
- [ ] `codeplane billing balance` with negative balance displays correctly (e.g., "-$3.50")
- [ ] `codeplane billing balance --json` output can be piped to `jq .balance_cents` successfully

### Web UI E2E Tests (Playwright)

- [ ] Authenticated user navigates to `/settings/billing` and sees the balance card with a dollar amount
- [ ] Balance card displays the correct amount matching the API response
- [ ] Balance card shows "Last credited:" with a date when `last_grant_at` is non-null
- [ ] Balance card shows "No credits received yet" when `last_grant_at` is null
- [ ] Balance card shows green status indicator when balance > $5.00
- [ ] Balance card shows yellow/warning indicator when balance between $0.01 and $5.00
- [ ] Balance card shows red/danger indicator when balance is $0.00 or negative
- [ ] Negative balance is displayed with minus sign and red text
- [ ] Loading state shows skeleton placeholder before API responds
- [ ] Error state shows error message and retry button when API fails
- [ ] Clicking retry button re-fetches the balance
- [ ] Unauthenticated user navigating to `/settings/billing` is redirected to login
- [ ] When `BILLING_ACCOUNT_BALANCE_VIEW` feature flag is disabled, billing link absent from settings navigation
- [ ] When feature flag disabled, direct navigation to `/settings/billing` shows "Coming Soon" or redirects
- [ ] Org owner navigates to `/orgs/:org/settings/billing` and sees org balance card
- [ ] Org balance card header includes the organization name
- [ ] Non-admin org member navigating to `/orgs/:org/settings/billing` sees access denied or is redirected

### TUI Integration Tests

- [ ] TUI dashboard displays billing balance widget with a dollar amount
- [ ] Balance widget uses color coding consistent with web UI (green/yellow/red)
- [ ] Navigating to billing screen shows full balance detail (amount, last grant date, updated timestamp)
- [ ] TUI gracefully handles API errors when fetching balance (shows error message, does not crash)
