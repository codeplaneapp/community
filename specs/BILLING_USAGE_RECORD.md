# BILLING_USAGE_RECORD

Specification for BILLING_USAGE_RECORD.

## High-Level User POV

When a user or an automated system within Codeplane performs a metered action — starting a workspace, running a workflow, consuming LLM tokens, executing a sync operation, or using storage — that consumption needs to be tracked. The **usage record** feature is the mechanism by which resource consumption is reported and persisted against the user's billing account for the current billing period.

From the user's perspective, usage recording is largely invisible during normal product operation. When they spin up a workspace, the platform automatically records how many compute minutes were consumed. When a workflow runs, the CI minutes accumulate. When an agent session processes tokens, those LLM tokens are metered. The user doesn't need to think about this — the platform handles it in the background as a natural consequence of using metered resources.

However, the usage record capability is also exposed as an explicit API endpoint. This allows internal services, workflow steps, custom integrations, and advanced users to report consumption events directly. For example, a custom workflow step that provisions external compute could report its resource usage back to Codeplane so that the user's billing account accurately reflects total consumption. Similarly, platform operators running self-hosted Codeplane can build their own metering integrations that feed into the same usage tracking system.

The value of usage recording is accuracy and fairness. Users trust that their billing reflects actual resource consumption. The system tracks five metered resource types — workspace compute minutes, CI minutes, LLM tokens, sync operations, and storage (in GB-hours) — and maintains per-metric counters scoped to monthly billing periods. Some metrics include free-tier allowances (such as 2,000 CI minutes per month) that are tracked separately from overage consumption. The usage record feature is the write path that feeds into the usage view, quota enforcement, and ultimately credit deductions.

In Community Edition mode, usage recording still functions for transparency and operational insight, even though quota enforcement is not active. Users can track their consumption patterns without being blocked. In Cloud mode, recorded usage directly informs quota checks that may restrict operations when credits are depleted.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users can record usage events against their own billing account via the API
- [ ] The API accepts a `metric_key` and `quantity` in the request body
- [ ] Only the five recognized metric keys are accepted: `workspace_compute_minutes`, `llm_tokens`, `ci_minutes`, `sync_operations`, `storage_gb_hours`
- [ ] The `quantity` must be a positive number (greater than zero)
- [ ] Usage is accumulated into a per-owner, per-metric, per-period counter for the current calendar month (UTC boundaries)
- [ ] The response returns the updated `UsageResponse` including the cumulative consumed quantity for the period
- [ ] CI minutes usage counters include `included_quantity` of 2000 (the free tier allowance)
- [ ] All other metric keys initialize `included_quantity` to 0
- [ ] Recording usage for a metric that has no existing counter for the current period creates a new counter automatically (upsert behavior)
- [ ] Recording usage for a metric that already has a counter for the current period increments the existing counter
- [ ] The endpoint requires authentication; unauthenticated requests receive a 401 response
- [ ] Invalid or missing request body returns a 400 response with an actionable error message
- [ ] The feature is gated behind the `BILLING_USAGE_RECORD` feature flag
- [ ] All clients (API, CLI, internal services) use the same underlying service method

### Functional Constraints

- [ ] `quantity` is expressed as an integer or number; fractional quantities are acceptable for metrics like `storage_gb_hours`
- [ ] `quantity` must be strictly greater than zero; zero and negative values are rejected with a 400 error
- [ ] `metric_key` must be one of the five recognized values; unrecognized metric keys result in a 400 error
- [ ] Usage counters are scoped to calendar-month periods in UTC; the period boundaries are `[1st of month 00:00:00 UTC, 1st of next month 00:00:00 UTC)`
- [ ] Multiple sequential `recordUsage` calls for the same metric in the same period are additive — the counter increments, it does not reset
- [ ] The `overage_quantity` field in the response reflects consumption beyond the `included_quantity` (overage = max(0, consumed - included))
- [ ] Usage recording does not directly deduct credits; credit deduction is a separate operation that may be triggered by other billing flows
- [ ] Usage recording does not perform quota enforcement; quota checks are a separate read-path operation
- [ ] If no billing account exists for the user, the service creates one automatically (via `requireBillingAccount`)
- [ ] The `period_start` and `period_end` in the response are ISO 8601 timestamps in UTC

### Edge Cases

- [ ] Recording usage on the first day of a new billing period when no counter exists yet for that period: a new counter is created with the submitted quantity as `consumed_quantity`
- [ ] Recording usage at exactly midnight UTC on the 1st of the month: uses the new month's period (current month), not the previous month
- [ ] Submitting an empty JSON body: returns 400 with "invalid request body"
- [ ] Submitting `{}` (empty object): returns 400 with "metric_key is required"
- [ ] Submitting `{ "metric_key": "workspace_compute_minutes" }` without quantity: returns 400 with "quantity must be a positive number"
- [ ] Submitting `{ "metric_key": "workspace_compute_minutes", "quantity": 0 }`: returns 400 with "quantity must be a positive number"
- [ ] Submitting `{ "metric_key": "workspace_compute_minutes", "quantity": -5 }`: returns 400 with "quantity must be a positive number"
- [ ] Submitting `{ "metric_key": "not_a_real_metric", "quantity": 10 }`: returns 400 with unrecognized metric key error
- [ ] Submitting a non-JSON content type: returns 400 with "invalid request body"
- [ ] Submitting quantity as a string (e.g., `"quantity": "10"`): the service should either coerce to number or reject with a 400
- [ ] Submitting very large quantity values (e.g., `Number.MAX_SAFE_INTEGER`): should be handled without overflow
- [ ] Concurrent usage records for the same metric from the same user: both should be applied (database-level atomic increment)
- [ ] User with no prior billing account: account is created on demand, then usage is recorded
- [ ] Recording usage when billing is disabled (CE mode): usage is still recorded for transparency; no error is returned

### Boundary Constraints

- [ ] `metric_key` must be a non-empty string with a maximum length of 64 characters (all current keys are under 30 characters)
- [ ] `quantity` must be a positive number; maximum practical value is bounded by the database column type (`bigint` — integer values up to ±9,223,372,036,854,775,807)
- [ ] The request body must be valid JSON and within 1 KB in size (no large payloads needed for this endpoint)
- [ ] `period_start` and `period_end` are always UTC ISO 8601 timestamps
- [ ] The response body contains exactly these fields: `metric_key`, `included_quantity`, `consumed_quantity`, `overage_quantity`, `period_start`, `period_end`

## Design

### API Shape

**Record Usage Endpoint:**

```
POST /api/billing/usage
Authorization: Bearer <token> | Cookie session
Content-Type: application/json

Request Body:
{
  "metric_key": "workspace_compute_minutes",
  "quantity": 15
}

Response 200:
{
  "metric_key": "workspace_compute_minutes",
  "included_quantity": 0,
  "consumed_quantity": 15,
  "overage_quantity": 15,
  "period_start": "2026-03-01T00:00:00.000Z",
  "period_end": "2026-04-01T00:00:00.000Z"
}
```

**CI Minutes Example (with free tier):**

```
POST /api/billing/usage
{
  "metric_key": "ci_minutes",
  "quantity": 100
}

Response 200:
{
  "metric_key": "ci_minutes",
  "included_quantity": 2000,
  "consumed_quantity": 100,
  "overage_quantity": 0,
  "period_start": "2026-03-01T00:00:00.000Z",
  "period_end": "2026-04-01T00:00:00.000Z"
}
```

**Error Responses:**

```
401 Unauthorized:
{
  "message": "authentication required"
}

400 Bad Request (missing metric_key):
{
  "message": "metric_key is required"
}

400 Bad Request (invalid quantity):
{
  "message": "quantity must be a positive number"
}

400 Bad Request (invalid body):
{
  "message": "invalid request body"
}
```

### SDK Shape

The `BillingService.recordUsage()` method is the authoritative service call:

```typescript
async recordUsage(
  ownerType: OwnerType,        // "user" | "org"
  ownerId: string,
  metricKey: MetricKey,         // one of MetricKeys values
  quantity: number,             // must be > 0
): Promise<UsageResponse>
```

Return type:

```typescript
interface UsageResponse {
  metric_key: string;
  included_quantity: number;
  consumed_quantity: number;
  overage_quantity: number;
  period_start: Date;
  period_end: Date;
}
```

The UI-core shared package should expose a mutation hook:

```typescript
function useRecordUsage(): {
  record: (metricKey: MetricKey, quantity: number) => Promise<UsageResponse>;
  loading: boolean;
  error: Error | null;
}
```

### CLI Command

```
codeplane billing usage record --metric <metric_key> --quantity <number>
```

**Output (default):**
```
Usage recorded successfully.
Metric:           workspace_compute_minutes
Consumed (period): 45
Included (period): 0
Overage (period):  45
Period:            March 2026
```

**Output (--json):**
```json
{
  "metric_key": "workspace_compute_minutes",
  "included_quantity": 0,
  "consumed_quantity": 45,
  "overage_quantity": 45,
  "period_start": "2026-03-01T00:00:00.000Z",
  "period_end": "2026-04-01T00:00:00.000Z"
}
```

**Error cases:**
- Not authenticated: `Error: authentication required. Run 'codeplane auth login' first.`
- Missing `--metric`: `Error: --metric is required. Valid values: workspace_compute_minutes, llm_tokens, ci_minutes, sync_operations, storage_gb_hours`
- Missing `--quantity`: `Error: --quantity is required and must be a positive number`
- Invalid metric: `Error: unrecognized metric key "foo". Valid values: workspace_compute_minutes, llm_tokens, ci_minutes, sync_operations, storage_gb_hours`
- Invalid quantity: `Error: quantity must be a positive number`

### Documentation

- **"Understanding Usage Metering"**: Help article explaining what metered resources exist (workspace compute minutes, CI minutes, LLM tokens, sync operations, storage GB-hours), how usage is tracked per billing period (calendar month UTC), what free-tier allowances apply (2,000 CI minutes/month), and how usage relates to credit balance and quota enforcement.
- **"Recording Usage Events"**: Technical guide for platform integrators and advanced users explaining how to record usage via the API endpoint, including request/response examples for each metric type, error handling, and idempotency considerations.
- **"CLI Billing Commands"**: Reference documentation for `codeplane billing usage record` including all flags, output formats, and error messages.
- **"Billing in Community Edition"**: Section covering how usage recording works when billing enforcement is disabled — usage is tracked for visibility but does not restrict operations.

## Permissions & Security

### Authorization Roles

| Action | Owner | Admin | Member | Read-Only | Anonymous |
|--------|-------|-------|--------|-----------|----------|
| Record usage for own user account | ✅ | ✅ | ✅ | ✅ | ❌ |
| Record usage via internal service (workspace/workflow) | ✅ (system) | ✅ (system) | ✅ (system) | ✅ (system) | ❌ |

- **User usage recording**: Any authenticated user can record usage against their own billing account. The endpoint is scoped to the authenticated user's identity — there is no way to record usage against another user's account through this endpoint.
- **Internal service usage recording**: Platform services (workspace provisioner, workflow runner, agent runtime) call `BillingService.recordUsage()` directly using the owner identity of the resource being consumed. These are server-side calls that do not go through the HTTP route.
- **Organization usage recording**: Organization-scoped usage recording is not currently exposed as a user-facing HTTP endpoint. Org usage is recorded by internal services when org-owned resources are consumed.
- **No anonymous access**: Unauthenticated requests are rejected with 401.
- **No cross-user recording**: The authenticated user can only record usage against their own account.

### Rate Limiting

- **User usage record endpoint**: Elevated rate limit tier (120 requests per minute per authenticated user). This endpoint may be called frequently by automated integrations but each call is lightweight.
- **Burst protection**: Maximum 20 requests per second per user to prevent accidental flooding from tight loops.
- **Internal service calls**: Server-side `BillingService.recordUsage()` calls bypass HTTP rate limiting but should use batching where possible to avoid excessive database writes.

### Data Privacy Constraints

- **PII Exposure**: The usage response does not contain PII. `metric_key` and quantities are operational data, not personal information.
- **No cross-user access**: Usage can only be recorded and viewed for the authenticated user's own account.
- **Audit trail**: Every usage increment is reflected in the `billing_usage_counters` table. Individual record events are not logged as separate ledger entries (usage recording is counter-based, not event-based).
- **Logging**: `quantity` values may be logged at DEBUG level for troubleshooting. Aggregate counters may be logged at INFO level for operational monitoring.
- **Token scoping**: If PAT scopes are implemented in the future, usage recording should require a `billing:write` scope.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `BillingUsageRecorded` | A usage event is successfully recorded | `owner_type`, `metric_key`, `quantity`, `consumed_quantity_after`, `included_quantity`, `overage_quantity_after`, `client` (api/cli/internal), `billing_enabled`, `period_start` |
| `BillingUsageRecordFailed` | A usage record request fails (validation or server error) | `owner_type`, `metric_key`, `quantity`, `error_type` (validation/server), `error_message`, `client` |
| `BillingUsageOverageEntered` | A usage record causes `consumed_quantity` to exceed `included_quantity` for the first time in this period | `owner_type`, `metric_key`, `consumed_quantity`, `included_quantity`, `overage_quantity`, `billing_enabled` |
| `BillingUsageRecordRejected` | A usage record request is rejected due to invalid input | `owner_type`, `metric_key`, `rejection_reason` (missing_metric/invalid_quantity/unrecognized_metric) |

### Event Properties Schema

```typescript
interface BillingUsageRecordedEvent {
  owner_type: "user" | "org";
  metric_key: string;
  quantity: number;
  consumed_quantity_after: number;
  included_quantity: number;
  overage_quantity_after: number;
  client: "api" | "cli" | "internal";
  billing_enabled: boolean;
  period_start: string;
  timestamp: string;
}
```

### Funnel Metrics & Success Indicators

- **Recording volume**: Total usage record events per hour, broken down by metric key (operational throughput indicator)
- **Metric distribution**: Breakdown of usage records by metric key (tells which resource types are most consumed)
- **Overage entry rate**: Percentage of usage records that cause a metric to cross from included into overage territory (indicates free tier sufficiency)
- **Error rate**: Percentage of usage record API calls returning non-200 responses (target: <0.5%)
- **Latency p99**: 99th percentile latency of the usage record endpoint (target: <300ms, as it involves a database write)
- **Internal vs external recording ratio**: Percentage of usage recorded via internal service calls vs. the public API endpoint (measures product-driven vs. user-driven metering)
- **Unique users recording per period**: Count of distinct users with at least one usage record per billing period (adoption metric)

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | When |
|-----------|-------|-------------------|------|
| Usage recorded successfully | DEBUG | `{ owner_type, owner_id, metric_key, quantity, consumed_quantity_after, period_start, latency_ms }` | Every successful usage record |
| Usage counter created (new period) | INFO | `{ owner_type, owner_id, metric_key, period_start, period_end, included_quantity }` | First usage record for a metric in a new period |
| Usage record request validation failed | WARN | `{ owner_type, owner_id, metric_key, quantity, error_message, request_id }` | Validation error (missing key, invalid quantity, etc.) |
| Usage record request body parse failed | WARN | `{ request_id, content_type, error_message }` | Non-JSON or malformed body |
| Usage record database error | ERROR | `{ owner_type, owner_id, metric_key, quantity, error_message, stack_trace }` | Unhandled error in `recordUsage` or `incrementUsageCounter` |
| Usage overage threshold crossed | INFO | `{ owner_type, owner_id, metric_key, consumed_quantity, included_quantity, overage_quantity }` | When consumed_quantity exceeds included_quantity for the first time in a period |
| Unauthenticated usage record request | INFO | `{ request_id, ip_address }` | 401 returned |
| Billing account auto-created for usage | INFO | `{ owner_type, owner_id, billing_account_id }` | Billing account created on demand |

**Note**: Individual `quantity` values may be logged at DEBUG level. Aggregate counter values (consumed, overage) may be logged at INFO when crossing thresholds.

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_billing_usage_records_total` | Counter | `owner_type`, `metric_key`, `status_code` | Total usage record API requests |
| `codeplane_billing_usage_record_duration_seconds` | Histogram | `owner_type`, `metric_key` | Latency distribution of usage record requests |
| `codeplane_billing_usage_quantity_total` | Counter | `owner_type`, `metric_key` | Total quantity recorded (cumulative across all users) |
| `codeplane_billing_usage_consumed_gauge` | Gauge | `owner_type`, `metric_key` | Current consumed quantity (sampled per record) |
| `codeplane_billing_usage_overage_gauge` | Gauge | `owner_type`, `metric_key` | Current overage quantity (sampled per record) |
| `codeplane_billing_usage_record_errors_total` | Counter | `owner_type`, `metric_key`, `error_type` | Count of errors during usage recording |
| `codeplane_billing_usage_new_counters_total` | Counter | `owner_type`, `metric_key` | Count of new usage counters created (new periods) |
| `codeplane_billing_usage_overage_entries_total` | Counter | `owner_type`, `metric_key` | Count of times a metric crossed into overage |

### Alerts

#### Alert: `BillingUsageRecordHighErrorRate`
- **Condition**: `rate(codeplane_billing_usage_record_errors_total[5m]) / rate(codeplane_billing_usage_records_total[5m]) > 0.05` (>5% failure rate)
- **Severity**: P2 (high)
- **Runbook**:
  1. Check server logs for `billing.usage.error` entries to identify error type and frequency
  2. Verify database connectivity: `SELECT 1 FROM billing_usage_counters LIMIT 1`
  3. Check if `incrementUsageCounter` SQL function is failing — review error messages for constraint violations, lock timeouts, or connection pool exhaustion
  4. If database unreachable, check PGLite (daemon mode) or PostgreSQL (server mode) status
  5. If errors are concentrated on a single metric key, check for corrupted counter rows for that metric
  6. If errors are distributed, check for service registry initialization issues (`getServices().billing`)
  7. Restart server process if service state is corrupted
  8. Escalate to billing team if error is in `BillingService.recordUsage` logic itself

#### Alert: `BillingUsageRecordHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_billing_usage_record_duration_seconds_bucket[5m])) > 2.0` (p99 > 2s)
- **Severity**: P3 (medium)
- **Runbook**:
  1. Check database query performance: run `EXPLAIN ANALYZE` on the `incrementUsageCounter` upsert query
  2. Check for table bloat or missing indexes on `billing_usage_counters(owner_type, owner_id, metric_key, period_start, period_end)`
  3. Check for lock contention: concurrent usage records for the same user/metric may cause row-level lock waits
  4. Check server resource utilization (CPU, memory, connection pool exhaustion)
  5. If latency is concentrated on specific users, check if those users have an unusual number of counter rows
  6. Consider adding connection pool limit or query timeout if issue is contention

#### Alert: `BillingUsageRecordSpikeDetected`
- **Condition**: `rate(codeplane_billing_usage_records_total[5m]) > 10 * avg_over_time(rate(codeplane_billing_usage_records_total[5m])[1h:5m])` (10x normal rate)
- **Severity**: P3 (medium)
- **Runbook**:
  1. Identify which users/services are generating the spike: check structured logs for `owner_id` and `metric_key` distribution
  2. If spike is from a single user/integration, check if they have a runaway automation loop
  3. If spike is from internal services, check if a workspace or workflow service is over-reporting (e.g., reporting every second instead of every minute)
  4. Verify rate limiting is functioning: check if 429 responses are being returned for excessive callers
  5. If legitimate load increase, verify database can handle sustained write throughput
  6. Contact the user/integration owner if the spike appears accidental

#### Alert: `BillingUsageCounterStale`
- **Condition**: `time() - max(codeplane_billing_usage_records_total) > 3600` (no usage records for 1 hour during business hours)
- **Severity**: P4 (low)
- **Runbook**:
  1. Verify that metered services (workspaces, workflows, agents) are operational and actively serving users
  2. Check if the billing service is initialized and responding to health checks
  3. Check if usage-generating features (workspaces, workflows) have had any activity in the same window
  4. If no activity is expected (e.g., low-traffic period), this alert can be silenced
  5. If services are active but not recording usage, check the integration points where `recordUsage` is called

### Error Cases and Failure Modes

| Error Case | HTTP Status | Error Response | Recovery |
|------------|-------------|----------------|----------|
| Unauthenticated request | 401 | `{ "message": "authentication required" }` | User must authenticate |
| Invalid/missing request body | 400 | `{ "message": "invalid request body" }` | Client must send valid JSON |
| Missing `metric_key` | 400 | `{ "message": "metric_key is required" }` | Client must provide metric_key |
| Invalid `quantity` (zero/negative/missing) | 400 | `{ "message": "quantity must be a positive number" }` | Client must provide positive quantity |
| Unrecognized `metric_key` | 400 | `{ "message": "metric_key is required" }` | Client must use a recognized metric key |
| Billing account not found | 500 (internal) | `{ "message": "internal server error" }` | Account auto-creation should handle this; if it fails, check DB |
| Database write failure | 500 | `{ "message": "internal server error" }` | Retry; check DB connectivity |
| `incrementUsageCounter` returns null | 500 | `{ "message": "internal server error" }` | Check upsert query and DB state |
| Rate limit exceeded | 429 | Standard rate limit response | Client should backoff and retry |

## Verification

### API Integration Tests

#### Authentication & Authorization
- [ ] `POST /api/billing/usage` with valid session cookie and valid body returns 200 and a `UsageResponse`
- [ ] `POST /api/billing/usage` with valid PAT and valid body returns 200 and a `UsageResponse`
- [ ] `POST /api/billing/usage` with no authentication returns 401 with `{ "message": "authentication required" }`
- [ ] `POST /api/billing/usage` with an expired session returns 401
- [ ] `POST /api/billing/usage` with a revoked PAT returns 401

#### Request Validation — metric_key
- [ ] `POST /api/billing/usage` with `metric_key: "workspace_compute_minutes"` and valid quantity returns 200
- [ ] `POST /api/billing/usage` with `metric_key: "llm_tokens"` and valid quantity returns 200
- [ ] `POST /api/billing/usage` with `metric_key: "ci_minutes"` and valid quantity returns 200
- [ ] `POST /api/billing/usage` with `metric_key: "sync_operations"` and valid quantity returns 200
- [ ] `POST /api/billing/usage` with `metric_key: "storage_gb_hours"` and valid quantity returns 200
- [ ] `POST /api/billing/usage` with `metric_key: ""` (empty string) returns 400 with "metric_key is required"
- [ ] `POST /api/billing/usage` with `metric_key` omitted returns 400 with "metric_key is required"
- [ ] `POST /api/billing/usage` with `metric_key: "not_a_real_metric"` returns 400 (unrecognized metric)
- [ ] `POST /api/billing/usage` with `metric_key: null` returns 400

#### Request Validation — quantity
- [ ] `POST /api/billing/usage` with `quantity: 1` (minimum valid) returns 200
- [ ] `POST /api/billing/usage` with `quantity: 0` returns 400 with "quantity must be a positive number"
- [ ] `POST /api/billing/usage` with `quantity: -1` returns 400 with "quantity must be a positive number"
- [ ] `POST /api/billing/usage` with `quantity: -100` returns 400 with "quantity must be a positive number"
- [ ] `POST /api/billing/usage` with `quantity` omitted returns 400 with "quantity must be a positive number"
- [ ] `POST /api/billing/usage` with `quantity: null` returns 400
- [ ] `POST /api/billing/usage` with `quantity: "string_value"` returns 400

#### Request Validation — body
- [ ] `POST /api/billing/usage` with no request body returns 400 with "invalid request body"
- [ ] `POST /api/billing/usage` with empty JSON `{}` returns 400 with "metric_key is required"
- [ ] `POST /api/billing/usage` with non-JSON content type (text/plain) returns 400 with "invalid request body"
- [ ] `POST /api/billing/usage` with malformed JSON (syntax error) returns 400 with "invalid request body"

#### Response Shape Validation
- [ ] Response body contains exactly the fields: `metric_key`, `included_quantity`, `consumed_quantity`, `overage_quantity`, `period_start`, `period_end`
- [ ] `metric_key` in response matches the `metric_key` in the request
- [ ] `included_quantity` is an integer (0 for most metrics, 2000 for `ci_minutes`)
- [ ] `consumed_quantity` is an integer greater than or equal to the submitted `quantity`
- [ ] `overage_quantity` is an integer (max(0, consumed - included))
- [ ] `period_start` is a valid ISO 8601 timestamp representing the first of the current month UTC
- [ ] `period_end` is a valid ISO 8601 timestamp representing the first of the next month UTC
- [ ] Response content-type is `application/json`

#### Counter Accumulation Behavior
- [ ] First usage record for `workspace_compute_minutes` with `quantity: 10` returns `consumed_quantity: 10`
- [ ] Second usage record for `workspace_compute_minutes` with `quantity: 5` returns `consumed_quantity: 15` (cumulative)
- [ ] Third usage record for `workspace_compute_minutes` with `quantity: 20` returns `consumed_quantity: 35` (cumulative)
- [ ] Recording `ci_minutes` with `quantity: 100` returns `included_quantity: 2000`, `consumed_quantity: 100`, `overage_quantity: 0`
- [ ] Recording `ci_minutes` with cumulative total reaching 2001 returns `overage_quantity: 1`
- [ ] Recording `ci_minutes` with cumulative total of exactly 2000 returns `overage_quantity: 0`
- [ ] Recording usage for a different metric key from the same user creates a separate counter
- [ ] Recording usage for the same metric key from a different user creates a separate counter

#### Period Boundary Behavior
- [ ] Usage recorded in March period returns `period_start` as `2026-03-01T00:00:00.000Z` and `period_end` as `2026-04-01T00:00:00.000Z`
- [ ] Usage counters from a previous month do not carry over — a new period starts with `consumed_quantity: 0`

#### Billing Account Auto-Creation
- [ ] Recording usage for a user who has never had a billing account: account is created and usage is recorded (returns 200)
- [ ] After auto-creation, subsequent usage records succeed without error

#### Maximum Value Tests
- [ ] Recording `quantity: 9007199254740991` (Number.MAX_SAFE_INTEGER) returns successfully without overflow in the response
- [ ] Recording `quantity: 9007199254740992` (beyond MAX_SAFE_INTEGER): behavior is documented (either accepted with potential precision loss or rejected)
- [ ] Two sequential records of `quantity: 4503599627370496` each result in a `consumed_quantity` that is the correct sum

#### Concurrency Tests
- [ ] Two simultaneous `POST /api/billing/usage` requests for the same user and metric both succeed and the final `consumed_quantity` reflects both quantities
- [ ] Five parallel usage record requests for the same metric return consistent cumulative totals

#### CE Mode Behavior
- [ ] Usage recording succeeds when `CODEPLANE_BILLING_ENABLED=false` (CE mode)
- [ ] The response shape is identical in CE and Cloud modes
- [ ] Quota checks remain permissive in CE mode even after significant usage recording

#### Rate Limiting
- [ ] Sending more than the rate limit threshold of requests in the window returns 429 for excess requests
- [ ] After rate limit cooldown, requests succeed again

### CLI Integration Tests

- [ ] `codeplane billing usage record --metric workspace_compute_minutes --quantity 10` when authenticated prints success message with updated consumed quantity
- [ ] `codeplane billing usage record --metric workspace_compute_minutes --quantity 10 --json` prints valid JSON matching `UsageResponse` shape
- [ ] `codeplane billing usage record` without `--metric` prints error listing valid metric keys and exits non-zero
- [ ] `codeplane billing usage record --metric workspace_compute_minutes` without `--quantity` prints error and exits non-zero
- [ ] `codeplane billing usage record --metric invalid_key --quantity 10` prints error about unrecognized metric key
- [ ] `codeplane billing usage record --metric workspace_compute_minutes --quantity 0` prints error about positive quantity
- [ ] `codeplane billing usage record --metric workspace_compute_minutes --quantity -5` prints error about positive quantity
- [ ] `codeplane billing usage record` when not authenticated prints authentication error and exits non-zero
- [ ] `codeplane billing usage record --metric ci_minutes --quantity 100 --json` output can be piped to `jq .consumed_quantity` successfully
- [ ] Repeated `codeplane billing usage record` calls show accumulating `consumed_quantity` values

### Web UI E2E Tests (Playwright)

- [ ] If a web UI surface exposes a manual usage recording form (admin or developer tools), submitting valid data shows success feedback with updated counter
- [ ] If the billing settings page displays current usage alongside the balance, recording usage via API and refreshing the page shows the updated consumed quantity
- [ ] When `BILLING_USAGE_RECORD` feature flag is disabled, any usage recording UI surface is not rendered
- [ ] Error feedback is displayed when attempting to record invalid usage (if a UI form is provided)

### E2E Workflow Integration Tests

- [ ] Creating and running a workspace increments `workspace_compute_minutes` usage counter (verified via `GET /api/billing/usage/workspace_compute_minutes`)
- [ ] Running a workflow increments `ci_minutes` usage counter (verified via `GET /api/billing/usage/ci_minutes`)
- [ ] Usage recorded by internal services is visible through the user-facing `GET /api/billing/usage` endpoint
- [ ] Usage recording via API, followed by `GET /api/billing/usage/:metric`, returns consistent data
- [ ] Full flow: record usage → view usage → check quota → verify quota correctly reflects consumed resources
