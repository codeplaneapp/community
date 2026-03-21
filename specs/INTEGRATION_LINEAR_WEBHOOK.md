# INTEGRATION_LINEAR_WEBHOOK

Specification for INTEGRATION_LINEAR_WEBHOOK.

## High-Level User POV

When a Codeplane user connects a Linear team to a Codeplane repository, they expect changes made in Linear — new issues filed, status updates, comments added, labels changed, assignees moved — to flow into their Codeplane repository automatically and in near-real-time. The Linear webhook feature is the backbone of this two-way sync, listening for events from Linear and translating them into corresponding Codeplane issue operations.

From the user's perspective, this feature is invisible when working well. A teammate creates an issue in Linear, and within seconds it appears as a Codeplane issue in the connected repository. A product manager changes an issue's priority or status in Linear, and the corresponding Codeplane issue updates without anyone touching Codeplane directly. A designer adds a comment in Linear, and that comment shows up on the Codeplane issue thread, attributed to the integration. The user's experience is that Linear and Codeplane stay in sync without manual intervention.

The feature also protects against the most common pitfall in bidirectional sync: infinite loops. When Codeplane syncs a change to Linear, the resulting Linear webhook event is recognized as originating from the integration itself and silently dropped. Users never see duplicated or echoed changes bouncing back and forth between the two systems.

When something goes wrong — a webhook payload is malformed, the integration's OAuth token has expired, or a Codeplane repository has been archived — the system handles the failure gracefully. The webhook endpoint always acknowledges receipt to Linear so Linear does not disable the webhook, the failure is logged and recorded in the sync audit trail, and the user can inspect failed sync operations from the integration management UI or CLI. If the integration is deactivated by the user, incoming webhooks for that integration are silently acknowledged and discarded.

For administrators and platform engineers, the webhook endpoint is a single, global route that serves all Linear integrations. It uses cryptographic signature verification to ensure that only authentic Linear payloads are processed, and it routes each event to the correct integration by matching the Linear team ID in the payload against configured integrations.

## Acceptance Criteria

- **Endpoint availability**: A `POST /webhooks/linear` endpoint must be mounted and accessible without authentication (Linear sends webhooks without Codeplane session tokens). The endpoint must accept `application/json` payloads.
- **Signature verification**: Every incoming request must be verified using HMAC-SHA256 with the integration's `webhook_secret`. The signature is provided in the `Linear-Signature` header. Requests with missing, malformed, or invalid signatures must be rejected with `400 Bad Request` and must not trigger any sync operations.
- **Timing-safe comparison**: Signature verification must use constant-time comparison to prevent timing attacks that could leak the webhook secret.
- **Payload size limit**: Requests with a body exceeding 1 MB (1,048,576 bytes) must be rejected with `400 Bad Request` before the full body is read into memory.
- **Supported event types**: The webhook handler must process: `Issue.create`, `Issue.update`, `Issue.remove`, `Comment.create`, `Comment.update`, `Comment.remove`, `IssueLabel.create`, `IssueLabel.remove`.
- **Unsupported event types**: Events not listed above must be acknowledged with `200 OK` and silently discarded without errors.
- **Team-based routing**: The webhook handler must extract the `teamId` from the payload and look up the matching `linear_integrations` record. If no active integration exists for the team, the webhook must be acknowledged with `200 OK` and discarded.
- **Loop guard**: Events where the actor ID matches the integration's `linear_actor_id` must be silently dropped to prevent infinite sync loops.
- **Recency-based deduplication**: If a `linear_sync_ops` record exists for the same entity and direction within the last 5 seconds, the event must be skipped.
- **Issue mapping enforcement**: For update/remove events, the handler must look up the Codeplane entity via `linear_issue_map` or `linear_comment_map`. If no mapping exists, the event must be logged and discarded.
- **Inactive integration handling**: If the matched integration has `is_active = false`, the webhook must be acknowledged with `200 OK` and no sync operations performed.
- **Audit trail**: Every processed webhook event must create a `linear_sync_ops` record with integration_id, source, target, entity_type, action, status, and error_message.
- **Token refresh on expiry**: If the OAuth access token has expired, the handler must attempt a token refresh. If refresh fails, the sync operation must be marked failed.
- **Idempotency for issue creation**: If a `linear_issue_map` entry already exists for an `Issue.create` event, it must be treated as a no-op.
- **Label name normalization**: Linear label names must be normalized (max 50 chars, lowercase, trimmed). Collisions reuse existing labels.
- **Always return 200 to Linear after signature verification passes**: To prevent Linear from disabling the webhook. Exceptions: missing/invalid signature → 400, oversized payload → 400.
- **Graceful handling of partial payloads**: Missing required fields must result in `200 OK` with the event discarded and logged.
- **Repository archived guard**: Sync operations must be skipped for archived repositories.
- **Maximum title length**: Synced issue titles truncated to 255 characters with `…` suffix.
- **Maximum description length**: Synced issue descriptions truncated to 65,535 characters.
- **Maximum comment length**: Synced comments truncated to 65,535 characters.
- **Markdown compatibility**: Content stored as-is (both systems use Markdown).
- **Response latency**: Endpoint must respond within 10 seconds. Long-running operations dispatched to background queue.
- **Concurrent webhook safety**: Simultaneous webhooks must not create duplicates or corrupt mapping state.

### Definition of Done
- The `POST /webhooks/linear` endpoint processes all supported event types with real sync logic (not a stub).
- Signature verification using `webhook_secret` is fully implemented with timing-safe comparison.
- Loop guard logic using `linear_actor_id` prevents infinite sync loops.
- Recency-based deduplication via `linear_sync_ops` is operational.
- Issue, comment, and label sync operations create or update the correct Codeplane entities.
- `linear_issue_map` and `linear_comment_map` tables are populated correctly.
- Every processed event creates a `linear_sync_ops` audit record.
- Integration management UI and CLI surface sync operation history.
- All error cases return structured responses and create appropriate log entries.
- Integration, E2E, and API tests pass with near-100% confidence.
- Documentation for webhook setup and troubleshooting is published.

## Design

### API Shape

**Endpoint**: `POST /webhooks/linear`

**Request**:
- Method: `POST`
- Authentication: None (authenticity verified via `Linear-Signature` HMAC)
- Content-Type: `application/json`
- Headers:
  - `Linear-Signature` (required): HMAC-SHA256 signature of the request body, hex-encoded
  - `Linear-Delivery` (optional): Unique delivery ID from Linear for deduplication
  - `User-Agent` (informational): Linear webhook user agent string
- Body: Linear webhook event payload

**Linear Issue Webhook Payload**:
```json
{
  "action": "create",
  "type": "Issue",
  "createdAt": "2026-03-22T10:00:00.000Z",
  "data": {
    "id": "issue-uuid-123",
    "title": "Add dark mode support",
    "description": "We need to implement dark mode...",
    "priority": 2,
    "state": {
      "id": "state-uuid",
      "name": "In Progress",
      "type": "started"
    },
    "team": {
      "id": "team-uuid-abc",
      "key": "ENG",
      "name": "Engineering"
    },
    "labels": [
      { "id": "label-uuid", "name": "Feature", "color": "#0066FF" }
    ],
    "assignee": {
      "id": "user-uuid",
      "name": "Jane Doe",
      "email": "jane@example.com"
    }
  },
  "url": "https://linear.app/acme/issue/ENG-123",
  "organizationId": "org-uuid",
  "webhookTimestamp": 1711094400000,
  "webhookId": "webhook-uuid"
}
```

**Comment Webhook Payload**:
```json
{
  "action": "create",
  "type": "Comment",
  "createdAt": "2026-03-22T10:05:00.000Z",
  "data": {
    "id": "comment-uuid-456",
    "body": "I've started working on this...",
    "issueId": "issue-uuid-123",
    "userId": "user-uuid",
    "issue": {
      "id": "issue-uuid-123",
      "title": "Add dark mode support",
      "team": { "id": "team-uuid-abc" }
    }
  },
  "url": "https://linear.app/acme/issue/ENG-123#comment-456",
  "organizationId": "org-uuid"
}
```

**Success Response** (200): Empty body

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Payload exceeds 1 MB | `{ "error": "failed to read request body" }` |
| 400 | Missing or invalid `Linear-Signature` header | `{ "error": "invalid webhook signature" }` |
| 400 | Request body is not valid JSON | `{ "error": "failed to read request body" }` |
| 500 | Unrecoverable internal error | `{ "error": "internal server error" }` |

### SDK Shape

The `syncService.handleLinearWebhook(payload, signature)` method must:

1. **Parse the payload**: Decode `Uint8Array` to UTF-8 string, parse as JSON. Reject if parsing fails.
2. **Extract routing fields**: Read `data.team.id` (or `data.issue.team.id` for comment events) for integration lookup. Read `type` and `action` for event routing.
3. **Look up integration**: Query `linear_integrations` by `linear_team_id`. If no record or `is_active = false`, return early.
4. **Verify signature**: HMAC-SHA256 of raw payload bytes using decrypted `webhook_secret`. Timing-safe compare against `Linear-Signature`. Reject on mismatch.
5. **Check loop guard**: Compare actor ID against `linear_actor_id`. Skip if match.
6. **Check recency deduplication**: Query `linear_sync_ops` for matching entity within 5 seconds. Skip if found.
7. **Dispatch to handler**: Route to appropriate handler based on `type` + `action`.
8. **Record sync op**: Write a `linear_sync_ops` row with the outcome.

### Web UI Design

**Integration Detail / Sync Activity Panel** (on `/integrations/linear`):
- Each integration card shows a "Recent Sync Activity" section or expandable panel.
- Displays the last 10 sync operations showing: timestamp, entity type (issue/comment), action (create/update/remove), status (success/skipped/failed), and error message if failed.
- A red badge appears if there are failed sync operations in the last 24 hours.
- A "View All Sync Activity" link opens a full sync log view with pagination and filtering by status.

**Issue Detail View** (on `/:owner/:repo/issues/:id`):
- Issues created via Linear sync display a "Synced from Linear" badge with the Linear issue identifier (e.g., "ENG-123").
- Comments created via Linear sync display a "via Linear" attribution line beneath the comment author.
- A small Linear icon links to the original Linear issue/comment URL.

**Notification on Sync Failure**:
- When a webhook event fails with a non-transient error (e.g., token expired, repository archived), a notification is sent to the integration owner.
- The notification links to the integration detail page.

### CLI Command

**Command**: `codeplane extension linear sync-log [--integration-id <id>] [--status <success|failed|skipped>] [--limit <n>]`

**Behavior**:
- Fetches recent sync operations from the server.
- Default output: Table with columns: `TIME`, `INTEGRATION`, `TYPE`, `ACTION`, `STATUS`, `ERROR`.
- With `--json`: Raw JSON array.
- With `--status failed`: Filters to only failed operations.
- Default `--limit`: 25.

**Example Output**:
```
TIME               INTEGRATION        TYPE      ACTION   STATUS    ERROR
2 min ago          ENG → acme/app     issue     create   success   —
5 min ago          ENG → acme/app     comment   create   success   —
12 min ago         DES → acme/design  issue     update   failed    token_refresh_failed
```

### TUI UI

The TUI does not require a dedicated webhook management screen. The existing sync status screen should be extended to display recent Linear sync operations alongside daemon sync activity.

### Documentation

1. **Linear Webhook Setup Guide** — Explains that webhook configuration is automatic during integration creation. Describes what events are synced and how to verify the webhook is working.
2. **Linear Sync Troubleshooting** — Covers common failure modes: expired tokens, archived repositories, signature verification failures, and deduplication. Includes CLI commands for inspecting sync logs.
3. **CLI Reference: `codeplane extension linear sync-log`** — Command reference with usage, filtering options, JSON output examples.
4. **Linear Integration Event Reference** — Table documenting each supported Linear event type, the Codeplane operation it triggers, and special behaviors (label creation, title truncation, etc.).

## Permissions & Security

### Authorization Roles

| Role | Can receive Linear webhooks? | Notes |
|------|-------------------------------|-------|
| N/A (Linear server) | Yes | Webhooks are server-to-server. No Codeplane user session is required. Authenticity is verified via HMAC signature. |

The webhook endpoint is unauthenticated by design — Linear cannot present a Codeplane session cookie or PAT. The integration's `webhook_secret` serves as the shared authentication credential, verified via HMAC-SHA256 signature on every request.

**Downstream authorization**: When the webhook handler creates or updates Codeplane issues, it does so using the integration's service-level authority, not a specific user session. The integration was authorized at creation time by a user with repository admin access.

### Rate Limiting

- **Per-integration rate limit**: Maximum 120 webhook events per integration per minute. Accommodates bulk Linear operations while preventing runaway loops.
- **Global webhook rate limit**: Maximum 1,000 webhook events per minute across all integrations.
- **Burst allowance**: Up to 30 events in a 1-second window per integration.
- **Rate limit response**: `200 OK` (to prevent Linear from disabling the webhook). Event discarded and logged. Sync op created with `status: "skipped"` and `error_message: "rate_limited"`.
- **Sustained overload protection**: If an integration exceeds rate limits for 5 consecutive minutes, the integration is temporarily paused (`is_active = false`) and a notification is sent to the integration owner.

### Data Privacy & PII

- **Linear user information**: Webhook payloads may contain Linear user names and email addresses. Used for attribution display only, not stored in Codeplane's user table.
- **Webhook secrets**: Encrypted at rest (AES-256-GCM), never logged, decrypted only in memory during signature verification.
- **Access tokens**: Encrypted at rest, never logged, decrypted only when making API calls to Linear.
- **Payload logging**: Raw payload body never logged at INFO or below. At DEBUG, only `type`, `action`, and `data.id` may be logged. Full payload requires TRACE level.
- **IP allowlisting**: Endpoint should validate requests originate from Linear's published IP ranges when available (defense-in-depth alongside HMAC).
- **Audit trail PII**: `linear_sync_ops` records reference entity IDs (UUIDs) rather than names or email addresses.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `LinearWebhookReceived` | Valid webhook payload received and parsed | `integration_id`, `linear_team_id`, `event_type`, `timestamp` |
| `LinearWebhookSignatureInvalid` | Signature verification failed | `timestamp`, `request_ip` (hashed), `linear_team_id` (if extractable) |
| `LinearWebhookEventProcessed` | Sync operation completed successfully | `integration_id`, `event_type`, `entity_type`, `action`, `codeplane_entity_id`, `duration_ms`, `timestamp` |
| `LinearWebhookEventSkipped` | Event skipped (loop guard, dedup, inactive, etc.) | `integration_id`, `event_type`, `skip_reason` (`loop_guard`, `dedup`, `inactive`, `no_mapping`, `archived_repo`, `rate_limited`), `timestamp` |
| `LinearWebhookEventFailed` | Sync operation failed | `integration_id`, `event_type`, `error_type` (`token_refresh_failed`, `db_error`, `validation_error`, `timeout`), `timestamp` |
| `LinearWebhookIssueSynced` | Codeplane issue created or updated from Linear | `integration_id`, `linear_issue_id`, `codeplane_issue_id`, `action`, `timestamp` |
| `LinearWebhookCommentSynced` | Codeplane comment created or updated from Linear | `integration_id`, `linear_comment_id`, `codeplane_comment_id`, `action`, `timestamp` |
| `LinearWebhookLabelSynced` | Label added/removed on Codeplane issue from Linear | `integration_id`, `codeplane_issue_id`, `label_name`, `action`, `label_created` (boolean), `timestamp` |
| `LinearWebhookTokenRefreshed` | OAuth token refreshed during webhook processing | `integration_id`, `timestamp` |
| `LinearWebhookIntegrationPaused` | Integration auto-paused due to sustained rate limiting | `integration_id`, `timestamp` |

### Funnel Metrics & Success Indicators

- **Webhook success rate**: `LinearWebhookEventProcessed` / `LinearWebhookReceived`. Target: >98%.
- **Skip rate breakdown**: Distribution of `LinearWebhookEventSkipped` by `skip_reason`. Loop guard + dedup should be >90% of all skips.
- **Failure rate**: `LinearWebhookEventFailed` / `LinearWebhookReceived`. Target: <1%.
- **Processing latency (p50/p95/p99)**: `duration_ms` on `LinearWebhookEventProcessed`. Target: p50 <100ms, p95 <500ms, p99 <2s.
- **Token refresh frequency**: `LinearWebhookTokenRefreshed` per day per integration. >10/day suggests token TTL issues.
- **Issue sync volume**: `LinearWebhookIssueSynced` per integration per day. Baseline and anomaly detection.
- **Integration pause rate**: `LinearWebhookIntegrationPaused` per week. Target: 0.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Webhook received | `INFO` | `request_id`, `event_type`, `action`, `linear_team_id`, `linear_delivery_id`, `payload_size_bytes` | Every incoming webhook |
| Signature verification succeeded | `DEBUG` | `request_id`, `integration_id` | After successful HMAC |
| Signature verification failed | `WARN` | `request_id`, `remote_addr`, `linear_team_id` | Signature mismatch |
| No matching integration | `DEBUG` | `request_id`, `linear_team_id` | No active integration for team |
| Integration inactive | `DEBUG` | `request_id`, `integration_id` | `is_active = false` |
| Loop guard triggered | `DEBUG` | `request_id`, `integration_id`, `actor_id` | Actor matches `linear_actor_id` |
| Deduplication triggered | `DEBUG` | `request_id`, `integration_id`, `entity_id` | Recent matching sync op found |
| Issue created via sync | `INFO` | `request_id`, `integration_id`, `linear_issue_id`, `codeplane_issue_id`, `duration_ms` | New issue created |
| Issue updated via sync | `INFO` | `request_id`, `integration_id`, `linear_issue_id`, `codeplane_issue_id`, `changed_fields`, `duration_ms` | Issue updated |
| Comment created/updated/deleted | `INFO` | `request_id`, `integration_id`, `linear_comment_id`, `codeplane_comment_id`, `duration_ms` | Comment operation |
| Label synced | `INFO` | `request_id`, `integration_id`, `label_name`, `action`, `label_created` | Label add/remove |
| Unsupported event type | `DEBUG` | `request_id`, `event_type`, `action` | Unhandled event |
| Issue/comment mapping not found | `WARN` | `request_id`, `integration_id`, `entity_id` | Update/remove for unmapped entity |
| Token refresh attempted/succeeded | `INFO` | `request_id`, `integration_id` | Token lifecycle |
| Token refresh failed | `ERROR` | `request_id`, `integration_id`, `error_message` | Refresh failure |
| Repository archived | `WARN` | `request_id`, `integration_id`, `codeplane_repo_id` | Target repo archived |
| Sync operation failed | `ERROR` | `request_id`, `integration_id`, `event_type`, `error_message`, `stack_trace` | Processing error |
| Rate limit exceeded | `WARN` | `request_id`, `integration_id`, `current_rate`, `limit` | Rate limit hit |
| Integration auto-paused | `ERROR` | `integration_id`, `sustained_minutes`, `owner_user_id` | Auto-pause |
| Payload parse failed | `WARN` | `request_id`, `error_message`, `payload_size_bytes` | JSON parse failure |
| Title truncated | `DEBUG` | `request_id`, `integration_id`, `original_length` | Title exceeded 255 chars |

**Log rules**: Never log raw payloads at INFO or below. Never log tokens/secrets. Always include `request_id`.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_linear_webhook_received_total` | Counter | `event_type`, `action` | Total webhooks received |
| `codeplane_linear_webhook_outcome_total` | Counter | `outcome` | Webhooks by processing outcome |
| `codeplane_linear_webhook_processing_duration_seconds` | Histogram | `event_type`, `action` | Processing duration |
| `codeplane_linear_webhook_signature_verification_duration_seconds` | Histogram | — | Signature verification time |
| `codeplane_linear_webhook_db_duration_seconds` | Histogram | `operation` | Database operation durations |
| `codeplane_linear_webhook_payload_size_bytes` | Histogram | — | Payload size distribution |
| `codeplane_linear_webhook_active_integrations` | Gauge | — | Active integration count |
| `codeplane_linear_webhook_token_refresh_total` | Counter | `status` | Token refresh attempts |
| `codeplane_linear_webhook_integration_paused_total` | Counter | — | Integrations auto-paused |
| `codeplane_linear_webhook_inflight` | Gauge | — | Currently processing webhooks |

### Alerts

#### `LinearWebhookSignatureFailureRateHigh`
- **Condition**: `rate(codeplane_linear_webhook_outcome_total{outcome="signature_invalid"}[5m]) > 5`
- **Severity**: Warning
- **Runbook**: Check logs for `Signature verification failed`. Identify source IPs. If from known integration's team, webhook secret may have been rotated on Linear's side — contact integration owner to re-authenticate. If unknown IPs, verify against Linear's IP ranges. Check for bugs in verification code.

#### `LinearWebhookProcessingFailureRateHigh`
- **Condition**: `rate(codeplane_linear_webhook_outcome_total{outcome="failed"}[5m]) / rate(codeplane_linear_webhook_received_total[5m]) > 0.05`
- **Severity**: Critical
- **Runbook**: Check logs grouped by `error_message`. If `token_refresh_failed`: check Linear OAuth service status. If DB errors: check connectivity, pool exhaustion, disk space. If `validation_error`: check for Linear API payload schema changes. If isolated to one integration, pause it and notify owner.

#### `LinearWebhookProcessingLatencyHigh`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_linear_webhook_processing_duration_seconds_bucket[5m])) > 5`
- **Severity**: Warning
- **Runbook**: Check `db_duration_seconds` for slow DB operations. Check `inflight` gauge for saturation. Review query plans for `linear_issue_map` lookups. Check server resource utilization.

#### `LinearWebhookTokenRefreshFailureRateHigh`
- **Condition**: `rate(codeplane_linear_webhook_token_refresh_total{status="failed"}[1h]) > 3`
- **Severity**: Warning
- **Runbook**: Check `error_message` in logs. If `invalid_grant`: refresh token revoked, owner must re-auth. If network timeout: check connectivity to `api.linear.app`. If `rate_limited` from Linear: back off. Notify affected integration owners.

#### `LinearWebhookIntegrationAutoPaused`
- **Condition**: `increase(codeplane_linear_webhook_integration_paused_total[1h]) > 0`
- **Severity**: Warning
- **Runbook**: Identify paused integration from logs. Check webhook volume — if legitimate bulk operation, temporarily increase limits. If sync loop, check `linear_actor_id` config. Notify integration owner.

#### `LinearWebhookEndpointDown`
- **Condition**: `absent(codeplane_linear_webhook_received_total) for 30m` when active integrations exist
- **Severity**: Critical
- **Runbook**: Verify server is running and route mounted. Check recent deployments. Test connectivity with curl. Check firewall/LB/CDN rules. Check Linear's delivery logs. Restart server if needed.

### Error Cases & Failure Modes

| Failure Mode | HTTP Status | Processing Outcome | Log Level |
|-------------|-------------|--------------------|-----------|
| Payload exceeds 1 MB | 400 | Rejected | WARN |
| Missing/invalid signature | 400 | Rejected | WARN |
| JSON parse failure | 200 | Discarded | WARN |
| Missing required fields | 200 | Discarded | WARN |
| No matching integration | 200 | Discarded | DEBUG |
| Integration inactive | 200 | Discarded | DEBUG |
| Loop guard triggered | 200 | Discarded | DEBUG |
| Deduplication triggered | 200 | Discarded | DEBUG |
| Unsupported event type | 200 | Discarded | DEBUG |
| Unmapped issue/comment | 200 | Skipped sync op | WARN |
| Repository archived | 200 | Skipped sync op | WARN |
| Token refresh succeeds | 200 | Processing continues | INFO |
| Token refresh fails | 200 | Failed sync op | ERROR |
| Database error | 200 | Failed sync op | ERROR |
| Unique constraint violation | 200 | Idempotent no-op | WARN |
| Rate limit exceeded | 200 | Skipped sync op | WARN |
| Integration auto-paused | 200 | Integration deactivated | ERROR |

## Verification

### API Integration Tests

1. **Valid Issue.create webhook creates a Codeplane issue**: Configure a Linear integration. Send `POST /webhooks/linear` with valid `Issue.create` payload and correct HMAC signature. Assert `200 OK`. Assert a new issue exists in the bound repository.

2. **Valid Issue.update webhook updates a Codeplane issue**: Create a mapped issue. Send `Issue.update` with changed title. Assert `200`. Assert title updated.

3. **Issue.update with status "completed" closes Codeplane issue**: Send `Issue.update` with `state.type: "completed"`. Assert issue is closed.

4. **Issue.update with status "started" reopens closed issue**: Close a mapped issue. Send `Issue.update` with `state.type: "started"`. Assert issue reopened.

5. **Issue.remove closes the mapped Codeplane issue**: Send `Issue.remove`. Assert issue is closed.

6. **Comment.create creates a Codeplane comment**: Send `Comment.create` with mapped `issueId`. Assert new comment on the Codeplane issue.

7. **Comment.update updates a Codeplane comment**: Create mapped comment. Send `Comment.update`. Assert body updated.

8. **Comment.remove deletes a Codeplane comment**: Create mapped comment. Send `Comment.remove`. Assert comment deleted.

9. **IssueLabel.create adds label to issue**: Create mapped issue. Send `IssueLabel.create`. Assert label added.

10. **IssueLabel.create creates new Codeplane label if needed**: Send `IssueLabel.create` with nonexistent label. Assert label created and assigned.

11. **IssueLabel.remove removes label from issue**: Assign label to mapped issue. Send `IssueLabel.remove`. Assert label removed.

12. **Missing Linear-Signature returns 400**: Send without header. Assert `400`. Assert no sync ops.

13. **Invalid signature returns 400**: Send with wrong signature. Assert `400`. Assert no sync ops.

14. **Empty signature returns 400**: Send with `Linear-Signature: ""`. Assert `400`.

15. **Payload exceeding 1 MB returns 400**: Send 1,048,577-byte body. Assert `400`.

16. **Payload at exactly 1 MB is accepted**: Send valid 1,048,576-byte payload. Assert `200`.

17. **Malformed JSON returns 200, discarded**: Send `{invalid json` with valid signature. Assert `200`. Assert no sync ops.

18. **Missing teamId returns 200, discarded**: Send without `data.team.id`. Assert `200`.

19. **Missing type field returns 200, discarded**: Send without `type`. Assert `200`.

20. **Missing action field returns 200, discarded**: Send without `action`. Assert `200`.

21. **Unknown event type returns 200, discarded**: Send `type: "Project"`. Assert `200`. Assert no entities modified.

22. **No matching integration returns 200**: Send with unmatched `teamId`. Assert `200`. Assert no sync ops.

23. **Inactive integration returns 200, discarded**: Set `is_active = false`. Send webhook. Assert `200`. Assert no sync ops.

24. **Loop guard prevents self-echo**: Send with actor matching `linear_actor_id`. Assert `200`. Assert event skipped.

25. **Recency deduplication prevents duplicates**: Send same `Issue.create` twice within 1 second. Assert only 1 issue created.

26. **Issue.create idempotency — duplicate is no-op**: Create `linear_issue_map` entry. Send `Issue.create` for same ID. Assert no new issue.

27. **Issue.update for unmapped issue is skipped**: Send `Issue.update` for unmapped Linear issue. Assert `200`. Assert skipped sync op.

28. **Comment.create for unmapped issue is skipped**: Send `Comment.create` where `issueId` has no mapping. Assert `200`.

29. **Archived repository — sync is skipped**: Archive repo. Send webhook. Assert `200`. Assert skipped sync op.

30. **Title truncation at 255 characters**: Send 300-char title. Assert stored title is 255 chars ending with `…`.

31. **Title at exactly 255 characters is not truncated**: Send exactly 255-char title. Assert stored without modification.

32. **Description truncation at 65,535 characters**: Send 70,000-char description. Assert truncated to 65,535.

33. **Comment body truncation at 65,535 characters**: Send 70,000-char comment. Assert truncated to 65,535.

34. **Audit trail — sync op for every processed event**: Send 5 valid webhooks. Assert 5 `linear_sync_ops` records.

35. **Audit trail — failed sync op records error**: Simulate DB error during issue creation. Assert `linear_sync_ops` with `status: "failed"`.

36. **Audit trail — skipped sync op records reason**: Trigger loop guard. Assert `linear_sync_ops` with `status: "skipped"`.

37. **Expired token triggers refresh**: Set `token_expires_at` to past. Send webhook. Assert refresh attempted. If success, assert sync completes and `token_expires_at` updated.

38. **Failed token refresh records failure**: Expire token, invalidate refresh token. Send webhook. Assert `status: "failed"`, `error_message: "token_refresh_failed"`.

39. **Concurrent webhooks for same issue — no duplicates**: Send 5 `Issue.create` for same issue simultaneously. Assert exactly 1 Codeplane issue.

40. **Concurrent webhooks for different issues — all created**: Send 5 `Issue.create` for 5 different issues simultaneously. Assert 5 issues created.

41. **Rate limit — exceeding per-integration limit**: Send 121 webhooks rapidly within 1 minute. Assert first 120 processed. Assert 121st creates skipped sync op with `rate_limited`.

42. **Rate limit does not cross integrations**: Send 120 for Integration A, 1 for Integration B. Assert B's is processed.

43. **Label name normalization**: Send `IssueLabel.create` with `"  My Feature Label  "`. Assert label created as `"my feature label"`.

44. **Label name collision reuses existing**: Create `"bug"` label. Send `IssueLabel.create` with `"Bug"`. Assert no new label, existing reused.

45. **Empty issue title uses fallback**: Send `Issue.create` with `title: ""`. Assert fallback title or event skipped.

46. **Unicode preserved**: Send `Issue.create` with CJK, emoji, RTL text. Assert stored and retrieved correctly.

47. **Markdown preserved in descriptions/comments**: Send `Comment.create` with Markdown. Assert stored verbatim.

48. **Response time under 10 seconds**: Send webhook and measure response time. Assert <10s.

### E2E Tests (Playwright)

49. **Synced issue appears in repository issue list**: Trigger `Issue.create` webhook. Navigate to `/:owner/:repo/issues`. Assert synced issue visible with "Synced from Linear" badge.

50. **Synced issue detail shows Linear badge and link**: Navigate to synced issue detail. Assert badge and link to Linear issue.

51. **Synced comment shows "via Linear" attribution**: Trigger `Comment.create`. Refresh issue page. Assert "via Linear" attribution.

52. **Issue update reflected on refresh**: Change title via webhook. Refresh issue detail. Assert new title.

53. **Sync activity panel shows recent operations**: Navigate to `/integrations/linear`. Assert sync activity panel with recent operations.

54. **Failed sync shows error indicator on integration card**: Trigger failing webhook. Navigate to integrations. Assert red badge/indicator.

55. **Sync log page supports filtering**: Navigate to sync log view. Filter by "failed". Assert only failed operations shown.

### CLI Tests

56. **`codeplane extension linear sync-log` shows operations**: Trigger webhooks. Run command. Assert table with correct columns.

57. **`--status failed` filters correctly**: Trigger failing webhook. Run with filter. Assert only failed operations.

58. **`--integration-id <id>` filters by integration**: Run with specific ID. Assert only that integration's operations.

59. **`--json` returns valid JSON**: Run with `--json`. Assert valid JSON array.

60. **`--limit 5` limits output**: Trigger 10 ops. Run with `--limit 5`. Assert exactly 5 entries.

61. **Without auth shows error**: Run without authentication. Assert auth error and non-zero exit code.
