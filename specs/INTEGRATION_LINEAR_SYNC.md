# INTEGRATION_LINEAR_SYNC

Specification for INTEGRATION_LINEAR_SYNC.

## High-Level User POV

When a Codeplane user has connected a Linear team to a Codeplane repository, they expect issues and comments to stay in sync between the two systems without manual effort. The Linear sync feature is the engine that makes this promise real. It operates in two modes: a manual trigger that the user can invoke at any time, and an automatic webhook-driven flow that keeps the two systems synchronized in near-real-time as changes happen on either side.

From the user's perspective, the sync journey begins immediately after they finish connecting a Linear team to a Codeplane repository. At that moment, an initial sync runs in the background, pulling all open issues from the selected Linear team and creating corresponding Codeplane issues in the bound repository. Each synced issue preserves its Linear identifier (e.g., `ENG-42`) as a cross-reference, so users can always trace an issue back to its Linear origin. Comments on issues are also synchronized — when a teammate adds a comment on a Linear issue, it appears on the corresponding Codeplane issue, and vice versa.

Once the initial sync completes, ongoing synchronization is handled by webhooks. When a Linear issue is created, updated, or deleted, Linear sends a webhook notification to Codeplane, which processes the change and reflects it on the corresponding Codeplane issue. In the other direction, when a Codeplane issue is created, updated, or has a comment added, the sync engine pushes the change to Linear. This bidirectional flow means teams can work in whichever tool they prefer without worrying about information falling out of sync.

Users can also trigger a manual sync at any time. From the web UI's integration detail card, they click "Sync now" and see a confirmation that synchronization has started. From the CLI, they run `codeplane extension linear sync <id>`. This is useful when a user suspects data might be out of sync, when they want to force a reconciliation after re-enabling an integration that was paused, or when webhook delivery may have been disrupted.

The sync is designed to be safe and idempotent. If the same issue already exists on both sides, the sync engine updates it rather than creating a duplicate. A loop guard prevents infinite echo effects — when Codeplane creates or updates an issue on Linear, it records the operation so that the resulting webhook from Linear is recognized as an echo and skipped rather than processed again. Users never see duplicate issues or duplicate comments from the sync engine.

If a sync operation fails — for example, because Linear's API is temporarily unavailable or the OAuth token has expired — the failure is logged and surfaced to the user. The integration card on the web UI shows a warning indicator and the last sync timestamp stops advancing. Users can inspect recent sync operations to understand what failed and retry. Token refresh happens transparently when possible; the user is only prompted to re-authorize if the refresh token itself has expired.

The sync covers the following data: issues (title, description/body, state mapping) and comments (body text, authorship attribution, creation/deletion). The sync does not cover Linear-specific concepts that have no Codeplane equivalent (e.g., Linear projects, cycles, estimates, or priority fields), nor does it sync Codeplane-specific concepts back to Linear (e.g., labels, milestones, or assignees beyond what Linear supports). This boundary is intentional — the sync focuses on the shared information model rather than trying to force one system's semantics onto the other.

## Acceptance Criteria

### Trigger & Lifecycle

- **Manual sync trigger**: An authenticated user who owns the integration must be able to trigger a sync via `POST /api/integrations/linear/:id/sync`. The endpoint must return `202 Accepted` with `{ "status": "sync_started" }` and execute the sync in the background.
- **Initial sync on integration creation**: When a new Linear integration is created via `POST /api/integrations/linear`, an initial sync must be triggered automatically in the background immediately after the integration record is persisted.
- **Webhook-driven sync**: When Linear delivers a webhook to `POST /webhooks/linear`, the server must validate the signature, identify the relevant integration, and process the payload to sync the change to Codeplane.
- **Codeplane-to-Linear push**: When a Codeplane issue or comment is created, updated, or deleted on a repository that has an active Linear integration, the change must be pushed to Linear.
- **Integration must be active**: Sync operations must only execute for integrations where `is_active` is `true`. Manual sync requests for inactive integrations must return `409 Conflict` with `{ "error": "integration is not active" }`.
- **Integration ownership enforcement**: Only the user who created the integration may trigger a manual sync. Requests from other users must return `404 Not Found` (to avoid leaking existence).

### Issue Sync

- **Linear → Codeplane issue creation**: When a new issue is created in the bound Linear team, a corresponding Codeplane issue must be created in the bound repository with: title mapped from Linear title, body mapped from Linear description (markdown), and state set to open.
- **Linear → Codeplane issue update**: When a Linear issue's title, description, or state changes, the corresponding Codeplane issue must be updated to reflect the change.
- **Linear → Codeplane issue close/reopen**: When a Linear issue transitions to a "completed" or "cancelled" state, the Codeplane issue must be closed. When it transitions back to an active state, the Codeplane issue must be reopened.
- **Codeplane → Linear issue creation**: When a new issue is created on a Codeplane repository with an active Linear integration, a corresponding Linear issue must be created in the bound team.
- **Codeplane → Linear issue update**: When a Codeplane issue's title or body is edited, the Linear issue must be updated.
- **Codeplane → Linear issue close/reopen**: When a Codeplane issue is closed, the Linear issue must be moved to a completed state. When reopened, the Linear issue must be moved back to an active state.
- **Cross-reference preservation**: Every synced issue pair must have a mapping record in `linear_issue_map` linking `codeplane_issue_id` / `codeplane_issue_number` to `linear_issue_id` / `linear_identifier`.
- **Linear identifier in Codeplane issue body**: The Codeplane issue body should include a reference link to the Linear issue (e.g., `<!-- linear:ENG-42 -->`).
- **Codeplane issue number in Linear description**: The Linear issue description should include a link back to the Codeplane issue.

### Comment Sync

- **Linear → Codeplane comment sync**: When a comment is added to a synced Linear issue, a corresponding comment must be created on the Codeplane issue. The comment body must include attribution (e.g., "via Linear — [Author Name]").
- **Codeplane → Linear comment sync**: When a comment is added to a synced Codeplane issue, a corresponding comment must be created on the Linear issue. The comment body must include attribution (e.g., "via Codeplane — [Author Name]").
- **Comment deletion sync**: When a comment is deleted from either system, the corresponding comment in the other system must also be deleted. The comment map record must be cleaned up.
- **Comment map tracking**: Every synced comment pair must have a mapping record in `linear_comment_map`.

### Loop Guard & Deduplication

- **5-second echo window**: When the sync engine creates or updates an entity, it must log the operation in `linear_sync_ops`. If a webhook or event arrives for the same entity+action within 5 seconds, the sync engine must skip it (treat it as an echo). The `recentLinearSyncOpExists` query enforces this.
- **Actor ID attribution**: Sync operations toward Linear must use the `linear_actor_id` stored on the integration so that Linear can attribute changes to the Codeplane integration rather than to a human user.
- **No duplicate issues**: If a sync attempts to create an issue that already has a mapping record, it must update the existing issue instead.
- **No duplicate comments**: If a sync attempts to create a comment that already has a mapping record, it must skip or update rather than duplicate.

### Token Management

- **Automatic token refresh**: If the Linear access token has expired but a refresh token is available and valid, the sync engine must refresh the token transparently before executing the sync. The refreshed tokens must be persisted back to `linear_integrations`.
- **Expired refresh token handling**: If both the access token and refresh token are expired, the sync must fail gracefully. The integration's `is_active` must be set to `false`, and the user must see a clear indicator in the UI that re-authorization is required.
- **Token refresh race safety**: If multiple concurrent sync operations attempt to refresh the same integration's tokens simultaneously, only one should perform the refresh. Others should retry with the new tokens.

### Webhook Validation

- **HMAC-SHA256 signature validation**: Every incoming Linear webhook must be validated by computing HMAC-SHA256 over the raw request body using the integration's `webhook_secret` and comparing against the `Linear-Signature` header.
- **Invalid signature rejection**: Webhooks with missing, empty, or non-matching signatures must be rejected with `200 OK` (to prevent retries from Linear) but must not process the payload. The rejection must be logged.
- **Payload size limit**: Webhook payloads larger than 1 MB must be rejected with `400 Bad Request`.
- **Unknown team ID handling**: If the webhook references a `linear_team_id` that does not match any active integration, the webhook must be silently discarded (logged at debug level, return `200`).

### Sync Operations Log

- **All sync operations logged**: Every sync attempt (issue create, issue update, comment create, comment delete) must be recorded in `linear_sync_ops` with: `integration_id`, `source` (codeplane|linear), `target` (codeplane|linear), `entity` (issue|comment), `entity_id`, `action` (create|update|delete), `status` (success|error), `error_message` (empty string on success).
- **last_sync_at update on success**: After a successful sync operation, the integration's `last_sync_at` must be updated.

### Boundary Constraints

- **Issue title maximum length**: 255 characters. Titles exceeding this from Linear must be truncated with `…` appended.
- **Issue body maximum length**: 100,000 characters. Bodies exceeding this must be truncated with a "… [truncated]" note.
- **Comment body maximum length**: 50,000 characters. Comments exceeding this must be truncated.
- **Linear identifier format**: Must match `^[A-Z]{1,10}-\d+$` (e.g., `ENG-42`). Identifiers not matching this pattern must be stored as-is but logged as unexpected.
- **Maximum issues per initial sync**: The initial sync must process up to 5,000 open issues per team. If the team has more than 5,000 open issues, the sync must process the first 5,000 (most recently updated) and log a warning.
- **Sync concurrency per integration**: At most one sync operation may run per integration at any time. Concurrent manual sync requests must return `429 Too Many Requests` with `{ "error": "sync already in progress" }`.

### Error Handling

- **Linear API rate limiting**: If Linear's API returns a rate limit response (HTTP 429), the sync engine must respect the `Retry-After` header and retry after the specified delay, up to 3 retries per operation.
- **Linear API errors**: If Linear's API returns 5xx errors, the sync must retry up to 3 times with exponential backoff (1s, 2s, 4s). After exhausting retries, the error must be logged in `linear_sync_ops` and the sync must continue with remaining entities.
- **Partial sync failure**: If individual issue or comment sync operations fail, the sync must continue with remaining entities rather than aborting the entire batch. A summary of failures must be logged.
- **Network timeout**: Requests to Linear's API must have a 30-second timeout. Timeouts must be treated as retryable errors.

### Definition of Done

- The sync service is fully implemented (not stubbed) and wired into the integration route handlers.
- Manual sync via `POST /api/integrations/linear/:id/sync` executes a real bidirectional sync.
- Initial sync runs automatically when a new integration is created.
- Webhook handler validates signatures and processes Linear issue/comment changes.
- Codeplane issue/comment changes are pushed to Linear for bound integrations.
- Loop guard prevents infinite echo cycles.
- Token refresh works transparently.
- Sync ops log captures all operations.
- `last_sync_at` is updated on successful sync.
- Web UI shows sync status, "Sync now" button, and error indicators.
- CLI `codeplane extension linear sync <id>` triggers a real sync.
- All integration, E2E, and CLI tests pass.
- Feature is gated behind the `INTEGRATION_LINEAR_SYNC` feature flag.

## Design

### API Shape

#### Manual Sync Trigger

**Endpoint**: `POST /api/integrations/linear/:id/sync`

**Request**:
- Method: `POST`
- Authentication: Session cookie or PAT-based `Authorization` header (required)
- Path parameter: `id` — the integration ID (numeric string)
- No request body

**Success Response** (202 Accepted):
```json
{
  "status": "sync_started",
  "integration_id": "42"
}
```

**Error Responses**:
- `400 Bad Request`: `{ "error": "invalid integration id" }` — when `:id` is not a valid integer
- `401 Unauthorized`: `{ "error": "authentication required" }` — when the user is not authenticated
- `404 Not Found`: `{ "error": "integration not found" }` — when the integration does not exist or does not belong to the requesting user
- `409 Conflict`: `{ "error": "integration is not active" }` — when the integration is inactive
- `429 Too Many Requests`: `{ "error": "sync already in progress" }` — when a sync is already running for this integration

#### Webhook Receiver

**Endpoint**: `POST /webhooks/linear`

**Request**:
- Method: `POST`
- No authentication cookie required (uses signature validation)
- Headers: `Linear-Signature` (HMAC-SHA256 hex digest)
- Body: Raw JSON webhook payload from Linear (max 1 MB)

**Success Response** (200 OK):
- Empty body

**Error Responses**:
- `400 Bad Request`: `{ "error": "failed to read request body" }` — payload exceeds 1 MB or is malformed

#### Sync Status (read via integration list)

The sync status is conveyed through the existing `GET /api/integrations/linear` endpoint. Each integration object includes:
- `last_sync_at` — timestamp of last successful sync
- `is_active` — whether the integration is active (becomes `false` if token refresh fails permanently)

No separate sync-status endpoint is required for the initial implementation.

### Web UI Design

#### Integration Card — Sync Indicators

Each integration card on the `/integrations/linear` page must display:

1. **Last sync timestamp**: Shown as a relative time (e.g., "synced 3 minutes ago") with a tooltip showing the full ISO-8601 timestamp. If `last_sync_at` is `null`, display "Never synced".

2. **Sync button**: A "Sync now" button with a refresh icon. On click:
   - The button enters a loading state (spinner replaces icon, text changes to "Syncing…", button becomes disabled)
   - A `POST /api/integrations/linear/:id/sync` request fires
   - On `202`: the loading state persists for 3 seconds, then resets and refreshes the integration list to show updated `last_sync_at`
   - On `429`: a toast notification appears: "A sync is already in progress. Please wait."
   - On `409`: a toast notification appears: "This integration is inactive. Re-enable it to sync."
   - On `404` / `401`: redirect to login or show a generic error toast

3. **Error indicator**: If the integration's `is_active` has been set to `false` due to a token expiry, the card must show a warning badge with text "Re-authorization required" and a "Reconnect" link that redirects to the OAuth start flow.

4. **Sync status badge**: A small colored indicator:
   - Green dot: `is_active: true` and `last_sync_at` within the last 24 hours
   - Yellow dot: `is_active: true` and `last_sync_at` is more than 24 hours ago or `null`
   - Red dot: `is_active: false`

#### Issue Cross-Reference Display

On the Codeplane issue detail page, if the issue is synced from Linear:
- A "Linear" badge appears next to the issue title, showing the Linear identifier (e.g., `ENG-42`)
- The badge links out to the Linear issue URL (e.g., `https://linear.app/team/issue/ENG-42`)
- The badge is read-only and informational

### CLI Command

**Command**: `codeplane extension linear sync <id>`

**Arguments**:
- `<id>` (required) — The integration ID to sync

**Behavior**:
- Calls `POST /api/integrations/linear/:id/sync`
- On success (202): prints `Sync started for integration <id>.`
- On 429: prints `Error: A sync is already running for this integration.` (exit code 1)
- On 409: prints `Error: Integration <id> is not active.` (exit code 1)
- On 404: prints `Error: Integration not found.` (exit code 1)
- On 401: prints `Error: Authentication required. Run 'codeplane auth login' first.` (exit code 1)

**`--json` output**:
```json
{
  "status": "sync_started",
  "integration_id": "42"
}
```

### TUI UI

The TUI does not provide a sync trigger directly. Users should be directed to the web UI or CLI to manage Linear sync operations. The TUI's integration-related screens (if implemented) may display `last_sync_at` and `is_active` status in a read-only fashion.

### SDK Shape

The `@codeplane/sdk` package must expose the following service interfaces:

**LinearSyncService**:
- `runInitialSync(integration: LinearIntegration): Promise<SyncResult>` — Fetches all open issues from Linear team, creates/updates mappings, pushes any unmapped Codeplane issues to Linear.
- `runIncrementalSync(integration: LinearIntegration): Promise<SyncResult>` — Compares current state between systems and reconciles differences.
- `handleLinearWebhook(rawBody: Uint8Array, signature: string): Promise<void>` — Validates signature, parses payload, routes to appropriate handler.
- `pushCodeplaneIssueToLinear(integration: LinearIntegration, issue: Issue, action: "create" | "update" | "close" | "reopen"): Promise<void>` — Pushes a Codeplane issue change to Linear.
- `pushCodeplaneCommentToLinear(integration: LinearIntegration, issueMap: IssueMap, comment: Comment, action: "create" | "delete"): Promise<void>` — Pushes a Codeplane comment change to Linear.

**SyncResult**:
```typescript
interface SyncResult {
  issues_created: number;
  issues_updated: number;
  comments_created: number;
  comments_deleted: number;
  errors: Array<{ entity: string; entity_id: string; error: string }>;
}
```

### Documentation

The following end-user documentation must be written:

1. **"Syncing issues with Linear"** guide:
   - Explains what data is synced (issues, comments) and what is not (projects, cycles, estimates)
   - Describes the initial sync behavior
   - Describes webhook-driven real-time sync
   - Explains how to trigger a manual sync
   - Covers the cross-reference links between systems

2. **"Troubleshooting Linear sync"** guide:
   - How to check sync status (last sync time, active indicator)
   - What to do when sync stops working (token expired, re-authorize)
   - How to identify failed sync operations
   - What the loop guard is and why duplicate operations are skipped

3. **CLI reference update**:
   - Document `codeplane extension linear sync <id>` with examples and error codes

## Permissions & Security

### Authorization Roles

- **Manual sync trigger (`POST /api/integrations/linear/:id/sync`)**: Requires authenticated user. The user must be the owner of the integration (`user_id` match). No role-based access — integration ownership is the sole gate.
- **Webhook receiver (`POST /webhooks/linear`)**: No user authentication required. Authorization is handled entirely by HMAC-SHA256 signature validation using the per-integration `webhook_secret`. The webhook endpoint must be publicly accessible.
- **Codeplane-to-Linear push (internal)**: Triggered by internal event handlers. The push uses the encrypted `access_token` stored on the integration record. No user session is required at push time.

### Rate Limiting

- **Manual sync trigger**: Rate limited to 5 requests per integration per 10-minute window. Excess requests return `429 Too Many Requests` with `Retry-After` header.
- **Webhook receiver**: Rate limited to 100 requests per IP per minute. This is set high because Linear may batch multiple webhook deliveries. Excess requests return `429`.
- **Overall sync execution**: At most 1 concurrent sync per integration (enforced by the sync engine, not HTTP rate limiting). At most 50 concurrent syncs across all integrations system-wide.

### Data Privacy & PII

- **OAuth tokens**: Access tokens and refresh tokens are stored AES-256-GCM encrypted at rest. They must never appear in API responses, logs, error messages, or telemetry events.
- **Webhook secrets**: Stored as plaintext in the database (used for HMAC computation) but must never appear in API responses or logs.
- **Linear user identity**: The `linear_actor_id` and viewer name/email from the OAuth setup are stored. These are PII and must not be logged at info level. Debug-level logging may include `linear_actor_id` but never email.
- **Issue/comment content**: Issue titles, descriptions, and comment bodies may contain sensitive information. These must not be logged at any level during sync operations. Only entity IDs and sync status should be logged.
- **Webhook payloads**: Must not be logged in their entirety. Structured logging should extract only `type`, `action`, `team.id`, and entity IDs from the webhook payload.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `LinearSyncTriggered` | User triggers manual sync | `integration_id`, `user_id`, `repo_id`, `linear_team_id`, `trigger_source` (web\|cli\|api) |
| `LinearSyncCompleted` | Sync finishes (success or partial) | `integration_id`, `repo_id`, `linear_team_id`, `duration_ms`, `issues_created`, `issues_updated`, `comments_created`, `comments_deleted`, `error_count`, `sync_type` (initial\|manual\|webhook) |
| `LinearSyncFailed` | Sync fails entirely | `integration_id`, `repo_id`, `linear_team_id`, `error_category` (token_expired\|api_error\|network_timeout\|rate_limited), `error_message` |
| `LinearWebhookReceived` | Webhook arrives from Linear | `linear_team_id`, `webhook_type` (Issue\|Comment), `webhook_action` (create\|update\|remove), `signature_valid` (boolean) |
| `LinearWebhookRejected` | Webhook signature invalid or team unknown | `linear_team_id`, `rejection_reason` (invalid_signature\|unknown_team\|payload_too_large) |
| `LinearTokenRefreshed` | Token refresh succeeds | `integration_id`, `token_age_hours` |
| `LinearTokenRefreshFailed` | Token refresh fails | `integration_id`, `error_category` |
| `LinearIntegrationDeactivated` | Integration auto-deactivated due to auth failure | `integration_id`, `repo_id`, `linear_team_id`, `reason` |
| `LinearSyncLoopGuardTriggered` | Echo skipped by loop guard | `integration_id`, `entity` (issue\|comment), `entity_id`, `action` |

### Funnel Metrics & Success Indicators

- **Sync success rate**: Percentage of sync operations that complete without errors. Target: >99% for webhook-driven syncs, >95% for initial syncs.
- **Sync latency (webhook)**: P50, P95, P99 time from webhook receipt to Codeplane entity update. Target P95: <5 seconds.
- **Initial sync completion rate**: Percentage of newly created integrations that complete their initial sync within 5 minutes. Target: >98%.
- **Active integration health**: Percentage of active integrations with `last_sync_at` within the last 24 hours. Target: >95%.
- **Token refresh success rate**: Percentage of automatic token refreshes that succeed. Target: >99%.
- **Re-authorization rate**: Percentage of integrations that require user re-authorization per month. Target: <2%.
- **Loop guard trigger rate**: Number of loop guard skips per 1,000 sync operations. Target: 400-600 (close to 50% indicates healthy bidirectional sync with no duplicates).

## Observability

### Logging Requirements

All logs must be structured JSON with the following base fields: `timestamp`, `level`, `service`, `request_id` (where applicable).

| Log Event | Level | Required Context Fields |
|---|---|---|
| Sync started | `info` | `integration_id`, `sync_type`, `linear_team_id`, `repo_id` |
| Sync completed | `info` | `integration_id`, `sync_type`, `duration_ms`, `issues_created`, `issues_updated`, `comments_created`, `comments_deleted`, `error_count` |
| Sync failed (entire sync) | `error` | `integration_id`, `sync_type`, `error_category`, `error_message` |
| Individual entity sync failure | `warn` | `integration_id`, `entity`, `entity_id`, `action`, `error_message` |
| Webhook received | `info` | `linear_team_id`, `webhook_type`, `webhook_action` |
| Webhook signature invalid | `warn` | `linear_team_id`, `remote_ip` |
| Webhook payload too large | `warn` | `payload_size_bytes`, `remote_ip` |
| Webhook team not found | `debug` | `linear_team_id` |
| Loop guard triggered (echo skipped) | `debug` | `integration_id`, `entity`, `entity_id`, `action` |
| Token refresh attempted | `info` | `integration_id` |
| Token refresh succeeded | `info` | `integration_id`, `new_expiry` |
| Token refresh failed | `error` | `integration_id`, `error_message` |
| Integration auto-deactivated | `warn` | `integration_id`, `reason` |
| Linear API rate limited | `warn` | `integration_id`, `retry_after_seconds` |
| Linear API error (5xx) | `warn` | `integration_id`, `http_status`, `retry_attempt` |
| Sync concurrency rejected | `info` | `integration_id` |
| Issue mapping created | `debug` | `integration_id`, `codeplane_issue_id`, `linear_issue_id`, `linear_identifier` |
| Comment mapping created | `debug` | `integration_id`, `codeplane_comment_id`, `linear_comment_id` |

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|---|---|---|---|
| `codeplane_linear_sync_total` | Counter | `sync_type` (initial\|manual\|webhook), `status` (success\|error\|partial) | Total sync operations |
| `codeplane_linear_sync_duration_seconds` | Histogram | `sync_type` | Sync duration (buckets: 0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300) |
| `codeplane_linear_sync_entities_total` | Counter | `entity` (issue\|comment), `action` (create\|update\|delete), `direction` (to_codeplane\|to_linear), `status` (success\|error) | Individual entity sync operations |
| `codeplane_linear_webhook_total` | Counter | `webhook_type`, `status` (processed\|rejected_signature\|rejected_unknown_team\|rejected_payload) | Webhook processing |
| `codeplane_linear_webhook_processing_seconds` | Histogram | `webhook_type` | Webhook processing duration (buckets: 0.01, 0.05, 0.1, 0.5, 1, 5, 10) |
| `codeplane_linear_token_refresh_total` | Counter | `status` (success\|error) | Token refresh attempts |
| `codeplane_linear_loop_guard_triggered_total` | Counter | `entity`, `action` | Echo skips from loop guard |
| `codeplane_linear_active_integrations` | Gauge | — | Current count of active integrations |
| `codeplane_linear_sync_in_progress` | Gauge | — | Current count of syncs running |
| `codeplane_linear_api_requests_total` | Counter | `method`, `status_code` | Requests made to Linear's API |
| `codeplane_linear_api_request_duration_seconds` | Histogram | `method` | Duration of requests to Linear's API |

### Alerts

#### Alert: LinearSyncHighFailureRate
- **Condition**: `rate(codeplane_linear_sync_total{status="error"}[15m]) / rate(codeplane_linear_sync_total[15m]) > 0.1` (>10% failure rate over 15 minutes)
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_linear_api_requests_total` for elevated 4xx/5xx from Linear's API. If yes, check Linear's status page for outages.
  2. Check `codeplane_linear_token_refresh_total{status="error"}` for token refresh failures. If spiking, verify `CODEPLANE_SECRET_KEY` hasn't rotated (would break decryption of stored tokens).
  3. Check server error logs for `linear_sync` service errors. Look for database connectivity issues.
  4. If isolated to a single integration, check that integration's `linear_team_id` is still valid in Linear.
  5. If widespread, check if the Linear OAuth application credentials are valid.

#### Alert: LinearWebhookSignatureFailureSpike
- **Condition**: `rate(codeplane_linear_webhook_total{status="rejected_signature"}[5m]) > 10` (>10 rejected signatures in 5 minutes)
- **Severity**: Warning
- **Runbook**:
  1. This may indicate a webhook secret mismatch or a replay attack attempt.
  2. Check the source IPs in the warn-level logs. Verify they match Linear's known webhook egress IPs.
  3. If from Linear's IPs, the webhook secret on one or more integrations may be stale. Check recently created/recreated integrations.
  4. If from unknown IPs, this is a potential attack. Consider temporarily rate-limiting the source IP at the edge.
  5. Check if any integrations were recently deleted and recreated (which would regenerate webhook secrets).

#### Alert: LinearSyncLatencyHigh
- **Condition**: `histogram_quantile(0.95, rate(codeplane_linear_webhook_processing_seconds_bucket[5m])) > 10` (P95 webhook processing >10s)
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_linear_api_request_duration_seconds` for slow Linear API calls. Linear API slowness is the most common cause.
  2. Check server CPU/memory metrics. High utilization may cause processing delays.
  3. Check `codeplane_linear_sync_in_progress` gauge. If many syncs are running concurrently, the system may be overloaded. Verify the 50-integration concurrency cap is being respected.
  4. Check database query latency for `linear_issue_map` and `linear_sync_ops` queries.
  5. If the issue is database-related, check for missing indexes on `linear_issue_map(integration_id, linear_issue_id)` and `linear_sync_ops(integration_id, entity, entity_id, action, created_at)`.

#### Alert: LinearTokenRefreshFailureSpike
- **Condition**: `rate(codeplane_linear_token_refresh_total{status="error"}[30m]) > 5` (>5 refresh failures in 30 minutes)
- **Severity**: Critical
- **Runbook**:
  1. Check if the Codeplane OAuth application in Linear has been revoked or had its client secret rotated. This would cause all token refreshes to fail.
  2. Verify `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET` environment variables are correctly set.
  3. Check if `CODEPLANE_SECRET_KEY` has changed (would prevent decryption of stored refresh tokens).
  4. Check Linear's API status for authentication service outages.
  5. If the OAuth app is revoked, all affected integrations will need user re-authorization. Communicate to affected users proactively.

#### Alert: LinearSyncStale
- **Condition**: Count of active integrations with `last_sync_at` > 24 hours ago exceeds 10% of total active integrations (checked every 6 hours).
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_linear_webhook_total` for recent activity. If no webhooks are being received, verify the webhook URL is accessible from Linear's infrastructure.
  2. Check DNS resolution and TLS certificate validity for the webhook endpoint.
  3. Check if the server has been restarted or redeployed recently — webhook registrations survive but the endpoint must be reachable.
  4. Try triggering a manual sync on one of the stale integrations to verify the sync engine itself works.
  5. Check Linear's webhook delivery logs (if accessible via their API) for failed delivery attempts.

#### Alert: LinearSyncConcurrencyExhausted
- **Condition**: `codeplane_linear_sync_in_progress >= 45` (approaching the 50 concurrent sync cap)
- **Severity**: Warning
- **Runbook**:
  1. This indicates unusually high sync volume. Check if a large number of manual syncs were triggered simultaneously.
  2. Check if a bulk webhook delivery from Linear is causing a burst of sync operations.
  3. Review whether the concurrency cap (50) needs to be increased based on server resources.
  4. Check for stuck syncs — look for sync operations that have been running for more than 10 minutes.
  5. If syncs are stuck, check for database deadlocks or Linear API timeouts.

### Error Cases & Failure Modes

| Error Case | Expected Behavior |
|---|---|
| Linear API returns 401 on sync | Attempt token refresh. If refresh fails, deactivate integration, log error. |
| Linear API returns 403 | Log error, do not retry (permissions issue). Record in sync ops. |
| Linear API returns 404 (issue deleted on Linear) | Remove the issue mapping. Do not error the entire sync. |
| Linear API returns 429 | Respect `Retry-After`, retry up to 3 times, then fail gracefully. |
| Linear API returns 5xx | Retry up to 3 times with exponential backoff, then fail gracefully. |
| Linear API network timeout (30s) | Retry up to 3 times, then fail gracefully. |
| Database unavailable during sync | Fail the sync entirely, log critical error. |
| Webhook body parsing failure | Return 200 (prevent Linear retries), log warning. |
| Codeplane issue creation fails during sync | Log error for this entity, continue with remaining entities. |
| Integration deleted mid-sync | Sync should detect the integration is gone and terminate gracefully. |
| Duplicate webhook delivery from Linear | Loop guard or idempotency should prevent duplicate processing. |
| Concurrent manual sync for same integration | Second request gets 429. First sync runs to completion. |

## Verification

### API Integration Tests

1. **Authenticated manual sync trigger**: Send `POST /api/integrations/linear/:id/sync` with valid session/PAT for an active integration owned by the user. Assert `202` with `{ "status": "sync_started" }`.
2. **Unauthenticated sync trigger**: Send `POST /api/integrations/linear/:id/sync` without auth. Assert `401`.
3. **Sync trigger for non-existent integration**: Send with a valid user but a non-existent integration ID. Assert `404`.
4. **Sync trigger for other user's integration**: Create integration as user A, attempt sync as user B. Assert `404`.
5. **Sync trigger for inactive integration**: Deactivate an integration, then attempt sync. Assert `409` with `{ "error": "integration is not active" }`.
6. **Sync trigger with non-numeric ID**: Send `POST /api/integrations/linear/abc/sync`. Assert `400`.
7. **Sync trigger with negative ID**: Send `POST /api/integrations/linear/-1/sync`. Assert `400` or `404`.
8. **Sync trigger with zero ID**: Send `POST /api/integrations/linear/0/sync`. Assert `404`.
9. **Sync trigger with very large ID**: Send with `999999999999`. Assert `404`.
10. **Concurrent sync trigger (same integration)**: Fire two `POST` requests to `/sync` for the same integration simultaneously. Assert one returns `202` and the other returns `429`.
11. **Webhook with valid signature**: Send `POST /webhooks/linear` with valid HMAC-SHA256 signature for a known integration. Assert `200`.
12. **Webhook with invalid signature**: Send with an incorrect `Linear-Signature` header. Assert `200` (no retry) but verify no sync operation was triggered.
13. **Webhook with missing signature header**: Send without `Linear-Signature`. Assert `200`, verify no sync.
14. **Webhook with empty signature header**: Send with `Linear-Signature: ""`. Assert `200`, verify no sync.
15. **Webhook with unknown team ID**: Send a valid-format webhook for a `team.id` not matching any integration. Assert `200`, verify no sync.
16. **Webhook payload exceeding 1 MB**: Send a payload larger than 1,048,576 bytes. Assert `400`.
17. **Webhook payload exactly 1 MB**: Send a payload exactly 1,048,576 bytes. Assert `200` (should be accepted at the boundary).
18. **Webhook with empty body**: Send an empty body. Assert `200` or `400`, verify no crash.
19. **Webhook with malformed JSON**: Send `{invalid json`. Assert `200`, verify no sync, verify warning logged.
20. **Rate limit on manual sync**: Trigger sync 6 times in 10 minutes for the same integration. Assert the 6th request returns `429` with `Retry-After` header.

### Sync Engine Integration Tests (Initial Sync)

21. **Initial sync creates Codeplane issues for all open Linear issues**: Set up an integration with a mock Linear API returning 10 open issues. Trigger sync. Assert 10 Codeplane issues created, 10 issue map records exist.
22. **Initial sync maps Linear identifiers correctly**: After sync, verify each issue map has the correct `linear_identifier` (e.g., `ENG-1`, `ENG-2`).
23. **Initial sync skips already-mapped issues**: Create an issue map for one Linear issue, then run initial sync. Assert that issue is updated (not duplicated).
24. **Initial sync with empty Linear team**: Mock Linear API returning 0 issues. Assert sync completes successfully with `issues_created: 0`.
25. **Initial sync with maximum issues (5,000)**: Mock 5,000 issues. Assert all are synced and `last_sync_at` is updated.
26. **Initial sync with >5,000 issues**: Mock 5,001 issues. Assert exactly 5,000 are synced and a warning is logged.
27. **Initial sync updates last_sync_at**: After successful sync, verify `last_sync_at` is set to approximately now.
28. **Initial sync with partial failures**: Mock 10 issues where 2 fail to create in Codeplane. Assert 8 issues created, 2 errors in sync ops log, sync marked as partial success.
29. **Initial sync logs all operations**: After syncing 5 issues, verify 5 `linear_sync_ops` records with `status: "success"`.

### Sync Engine Integration Tests (Webhook-Driven)

30. **Webhook issue creation**: Simulate Linear webhook for new issue creation. Assert Codeplane issue created, issue map created, sync op logged.
31. **Webhook issue title update**: Simulate Linear webhook for issue title change. Assert Codeplane issue title updated.
32. **Webhook issue description update**: Simulate webhook for description change. Assert Codeplane issue body updated.
33. **Webhook issue state change to completed**: Simulate webhook with state change to completed. Assert Codeplane issue closed.
34. **Webhook issue state change back to active**: Simulate webhook with state change back to active. Assert Codeplane issue reopened.
35. **Webhook issue deletion**: Simulate Linear webhook for issue removal. Assert Codeplane issue handling (close or mark as deleted).
36. **Webhook comment creation**: Simulate webhook for new comment on a synced issue. Assert Codeplane comment created with attribution, comment map created.
37. **Webhook comment deletion**: Simulate webhook for comment removal. Assert Codeplane comment deleted, comment map cleaned up.
38. **Webhook for unmapped issue**: Simulate webhook for an issue that has no mapping. Assert a new mapping is created (issue synced on-demand).

### Sync Engine Integration Tests (Codeplane → Linear)

39. **Codeplane issue creation pushes to Linear**: Create a Codeplane issue on a repo with an active integration. Assert Linear API called to create issue, issue map created.
40. **Codeplane issue title edit pushes to Linear**: Edit the title of a synced Codeplane issue. Assert Linear API called to update title.
41. **Codeplane issue body edit pushes to Linear**: Edit the body. Assert Linear API called to update description.
42. **Codeplane issue close pushes to Linear**: Close a synced Codeplane issue. Assert Linear API called to update state to completed.
43. **Codeplane issue reopen pushes to Linear**: Reopen a synced Codeplane issue. Assert Linear API called to update state to active.
44. **Codeplane comment creation pushes to Linear**: Add a comment to a synced Codeplane issue. Assert Linear API called to create comment, comment map created.
45. **Codeplane comment deletion pushes to Linear**: Delete a comment. Assert Linear API called to delete comment, comment map cleaned up.

### Loop Guard Tests

46. **Echo from Codeplane→Linear→webhook is skipped**: Create a Codeplane issue (which pushes to Linear), then simulate the resulting Linear webhook arriving within 5 seconds. Assert the webhook processing is skipped (loop guard triggered).
47. **Non-echo webhook after 5-second window is processed**: Same as above but simulate the webhook arriving after 6 seconds. Assert the webhook is processed normally.
48. **Echo guard scoped to correct entity**: Create Codeplane issue A and issue B simultaneously. Simulate webhook for issue A within 5 seconds and issue B after 6 seconds. Assert A is skipped and B is processed.
49. **Echo guard scoped to correct action**: Create a Codeplane issue (action=create), then simulate a webhook for an update to the same issue within 5 seconds. Assert the update webhook is processed (different action).

### Token Management Tests

50. **Automatic token refresh on expired token**: Set an integration's `token_expires_at` to 1 hour ago. Trigger sync. Assert token refresh is attempted, succeeds, new tokens persisted, sync completes.
51. **Token refresh with expired refresh token**: Set both tokens as expired, mock refresh endpoint to return 401. Assert sync fails, integration deactivated (`is_active: false`), user-facing error logged.
52. **Token refresh race condition**: Trigger two syncs for the same integration with expired token simultaneously. Assert only one token refresh occurs (no conflicts).
53. **Sync succeeds with non-expired token**: Set `token_expires_at` to 1 hour in the future. Trigger sync. Assert no refresh attempt, sync proceeds directly.

### Boundary Constraint Tests

54. **Issue title at max length (255 chars)**: Sync a Linear issue with exactly 255-character title. Assert Codeplane issue created with full title preserved.
55. **Issue title exceeding max length**: Sync a Linear issue with 300-character title. Assert Codeplane issue created with title truncated to 255 chars with `…`.
56. **Issue body at max length (100,000 chars)**: Sync a Linear issue with exactly 100,000-character description. Assert full body preserved.
57. **Issue body exceeding max length**: Sync a Linear issue with 100,001-character description. Assert body truncated with "… [truncated]".
58. **Comment at max length (50,000 chars)**: Sync a 50,000-character comment. Assert full comment preserved.
59. **Comment exceeding max length**: Sync a 50,001-character comment. Assert truncated.
60. **Empty issue title from Linear**: Sync an issue with empty title. Assert Codeplane issue created with a placeholder title (e.g., "Untitled").
61. **Empty issue body from Linear**: Sync an issue with null/empty description. Assert Codeplane issue created with empty body.
62. **Issue with special characters in title**: Sync issue with title containing Unicode, emoji, `<script>` tags, newlines, and null bytes. Assert safe storage and rendering.
63. **Linear identifier format validation**: Sync issues with identifiers `ENG-42`, `X-1`, `LONGTEAMKEY-99999`. Assert all stored correctly.

### End-to-End Tests (Playwright — Web UI)

64. **E2E: Sync button click triggers sync**: Navigate to `/integrations/linear`, click "Sync now" on an integration card. Assert loading spinner appears, toast confirms sync started, and after refresh `last_sync_at` updates.
65. **E2E: Sync button disabled during loading**: Click "Sync now", verify button becomes disabled with "Syncing…" text.
66. **E2E: Error toast on sync of inactive integration**: Deactivate an integration, attempt sync via UI. Assert error toast appears.
67. **E2E: Green/yellow/red status badge rendering**: Create integrations with varying `last_sync_at` values. Assert correct badge colors.
68. **E2E: Re-authorization warning display**: Deactivate an integration (simulating token expiry). Assert "Re-authorization required" warning appears on the card.
69. **E2E: Linear badge on synced issue detail**: Navigate to a Codeplane issue that was synced from Linear. Assert Linear identifier badge appears with correct link.
70. **E2E: Empty state with no integrations**: Navigate to `/integrations/linear` with no integrations. Assert empty state with "Connect Linear" CTA.

### End-to-End Tests (CLI)

71. **E2E CLI: `codeplane extension linear sync <id>` success**: Run sync command for a valid active integration. Assert output contains "Sync started".
72. **E2E CLI: sync with `--json` flag**: Run sync command with `--json`. Assert valid JSON output with `status` and `integration_id`.
73. **E2E CLI: sync for non-existent integration**: Run sync with invalid ID. Assert error message and exit code 1.
74. **E2E CLI: sync for inactive integration**: Deactivate integration, run sync. Assert error about inactive integration.
75. **E2E CLI: sync without authentication**: Run sync without prior `codeplane auth login`. Assert auth error message.

### End-to-End Tests (Full Round-Trip)

76. **E2E round-trip: Create Linear issue → appears in Codeplane**: Create an issue in Linear (via API mock/stub), verify webhook fires, assert issue appears in Codeplane with correct title/body/identifier.
77. **E2E round-trip: Create Codeplane issue → appears in Linear**: Create a Codeplane issue via API on a bound repo. Assert Linear API was called to create the issue.
78. **E2E round-trip: Close issue in Linear → closed in Codeplane**: Update Linear issue state to completed. Verify Codeplane issue is closed.
79. **E2E round-trip: Comment on Codeplane issue → appears in Linear**: Add a comment to a synced Codeplane issue. Assert Linear API called to create comment with attribution.
80. **E2E round-trip: Bidirectional sync without duplication**: Create issue in Linear, verify it syncs to Codeplane. Edit the Codeplane issue, verify update syncs to Linear. Verify no duplicate issues or comments at any point. Verify loop guard prevents echo processing.
