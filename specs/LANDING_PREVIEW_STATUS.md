# LANDING_PREVIEW_STATUS

Specification for LANDING_PREVIEW_STATUS.

## High-Level User POV

When you open a landing request in Codeplane, you want to know immediately whether a live preview environment is available for the changes under review. The **Landing Preview Status** feature gives you real-time visibility into the state of a preview environment that is scoped to a specific landing request.

As soon as a preview environment is created for your landing request — either manually or as part of your repository's preview configuration — a status indicator appears directly on the landing request detail page. This indicator tells you whether the preview is starting up, running and accessible, suspended due to inactivity, stopped, or in a failed state. When the preview is running, a clickable link takes you straight to the live preview URL so you can interact with the deployed changes before they land.

The status updates in real time. You do not need to refresh the page or poll for changes. If a reviewer suspends the preview by letting it go idle, you see the status change to "suspended" automatically. If someone visits the preview URL and it wakes back up, the indicator transitions back to "running" without any manual action.

This feature works across all Codeplane surfaces. The web UI shows a rich status badge with a live link. The CLI lets you query the preview status for any landing request and optionally stream status updates as they happen. The TUI displays the preview status in the landing request detail view with the same real-time streaming. Editor integrations surface the preview URL when available.

The value is simple: reviewers and authors can see at a glance whether a preview is live, broken, or sleeping — and jump straight to it when it is ready. This eliminates the back-and-forth of asking "is the preview up?" and reduces the time between opening a landing request and getting meaningful review feedback on live behavior.

## Acceptance Criteria

### Definition of Done

The feature is complete when every Codeplane client (web, CLI, TUI, editor integrations) can display the current preview status for a landing request, receive real-time status updates via SSE, and provide a direct link to the preview URL when the preview is in a running state.

### Core Requirements

- [ ] The landing request detail view in the web UI displays a preview status badge showing one of: `starting`, `running`, `suspended`, `stopped`, `failed`, or `none` (no preview exists).
- [ ] When the preview status is `running`, the badge includes a clickable link to the preview URL.
- [ ] Preview status updates are delivered in real time via SSE. The user does not need to refresh the page.
- [ ] The SSE stream sends an initial event with the current status on connection, then live updates as the status changes.
- [ ] The SSE stream supports `Last-Event-ID` reconnection so that clients that briefly disconnect do not miss status transitions.
- [ ] The CLI command `codeplane land view <number>` includes the preview status and URL in its output.
- [ ] The CLI command `codeplane land preview-status <number>` returns the current preview status as structured output.
- [ ] The CLI command `codeplane land preview-status <number> --stream` streams preview status updates until the user cancels or the preview reaches a terminal state (`stopped` or `failed`).
- [ ] The TUI landing detail view displays the preview status in the metadata section with real-time updates.
- [ ] The TUI displays the preview URL as a selectable/copyable field when the preview is running.
- [ ] VS Code and Neovim integrations surface the preview URL in the landing request detail view when available.

### Edge Cases and Boundary Constraints

- [ ] When no preview environment exists for a landing request, the status indicator shows `none` or is hidden entirely — it must not show a stale or misleading status.
- [ ] When the preview transitions from `running` to `suspended`, the URL is still displayed but visually marked as "suspended — will wake on access."
- [ ] When the preview transitions to `failed`, the status badge shows a failure indicator. No preview URL link is displayed.
- [ ] When the preview transitions to `stopped`, the badge shows "stopped" and the URL is removed.
- [ ] If the SSE connection drops, the client must reconnect automatically using the last received event ID and replay any missed events.
- [ ] If the landing request is closed or merged, the preview status must reflect the terminal state (`stopped`) and must not continue streaming updates.
- [ ] If the preview is deleted externally (via DELETE API) while a client is streaming, the stream must emit a terminal `preview.deleted` event and then close.
- [ ] The preview status response payload must include a `status` field (string, one of the five valid statuses), a `url` field (string or null), a `landing_number` field (integer), a `repository_id` field (string), a `created_at` field (ISO 8601 timestamp), and a `last_accessed_at` field (ISO 8601 timestamp or null).
- [ ] The preview URL must be a valid URL (either `https://{lr}-{repo}.{preview-domain}` for cloud mode or `http://localhost:{port}` for CE mode). URLs must not exceed 2083 characters.
- [ ] SSE event IDs must be monotonically increasing integers. The `data` field must be valid JSON. The `type` field must be `preview.status` or `preview.deleted`.
- [ ] The SSE keep-alive interval must be 15 seconds, consistent with existing SSE streams in the product.
- [ ] If the container sandbox runtime is unavailable, the GET preview status endpoint must return 404 with a clear error message indicating previews are not available, not a 500.
- [ ] Rate limiting on the SSE endpoint must allow at most 5 concurrent SSE connections per user per landing request.
- [ ] Rate limiting on the REST GET endpoint must allow at most 60 requests per minute per user.

## Design

### Web UI Design

#### Preview Status Badge Placement

The preview status badge is displayed in the **landing request detail page metadata section**, below the state badge and conflict status, and above the tab bar. It sits alongside the existing metadata items (author, target bookmark, stack size, timestamps).

#### Badge Variants

| Status | Badge Text | Color | Icon | URL Visible |
|--------|-----------|-------|------|-------------|
| `starting` | "Preview starting…" | Yellow | Spinning loader | No |
| `running` | "Preview live" | Green | External link icon | Yes, clickable |
| `suspended` | "Preview suspended" | Amber/Muted | Pause icon | Yes, with "(wakes on access)" hint |
| `stopped` | "Preview stopped" | Gray | Stop icon | No |
| `failed` | "Preview failed" | Red | Error/X icon | No |
| No preview | (hidden) | — | — | — |

#### Real-Time Behavior

- On page load, the web UI opens an SSE connection to `GET /api/repos/:owner/:repo/landings/:number/preview/stream`.
- The initial event provides the current status; subsequent events update the badge in place with a subtle transition animation (fade).
- When the user navigates away from the landing request detail page, the SSE connection is closed.
- On SSE reconnection after a network interruption, the client sends `Last-Event-ID` and replays missed events.

#### Preview URL Link

- When the preview is `running`, clicking the badge or the URL opens the preview in a new tab.
- When the preview is `suspended`, clicking the URL opens the preview in a new tab (which triggers auto-resume via the proxy).
- A small "copy URL" button is displayed next to the link for clipboard access.

#### Preview Section in Overview Tab

In addition to the metadata badge, the **Overview tab** of the landing request detail page includes a "Preview Environment" section that shows:
- Current status with human-readable description.
- Preview URL (when available).
- Time since last access (e.g., "Last accessed 12 minutes ago").
- Time since creation (e.g., "Created 2 hours ago").

### API Shape

#### REST Endpoint: Get Preview Status

```
GET /api/repos/:owner/:repo/landings/:number/preview
```

**Response (200 OK):**
```json
{
  "id": "repo123:42",
  "repository_id": "repo123",
  "lr_number": 42,
  "status": "running",
  "url": "https://42-my-app.preview.codeplane.app",
  "container_id": "abc123",
  "container_port": 3000,
  "host_port": 49152,
  "created_at": "2026-03-22T10:00:00Z",
  "last_accessed_at": "2026-03-22T10:45:00Z"
}
```

**Response (404 Not Found):**
```json
{
  "error": "no_preview",
  "message": "No preview environment exists for this landing request."
}
```

#### SSE Endpoint: Stream Preview Status

```
GET /api/repos/:owner/:repo/landings/:number/preview/stream
Accept: text/event-stream
```

**Initial event:**
```
id: 1
event: preview.status
data: {"lr_number":42,"status":"running","url":"https://42-my-app.preview.codeplane.app","created_at":"2026-03-22T10:00:00Z","last_accessed_at":"2026-03-22T10:45:00Z"}
```

**Subsequent update event:**
```
id: 2
event: preview.status
data: {"lr_number":42,"status":"suspended","url":"https://42-my-app.preview.codeplane.app","created_at":"2026-03-22T10:00:00Z","last_accessed_at":"2026-03-22T10:45:00Z"}
```

**Terminal deletion event:**
```
id: 3
event: preview.deleted
data: {"lr_number":42,"reason":"landing_request_closed"}
```

**Keep-alive (every 15s):**
```
: keep-alive
```

**Reconnection:** If `Last-Event-ID` header is sent, the server replays all events after that ID before joining the live stream.

### SDK Shape

#### ui-core Hooks

```typescript
// Hook: usePreviewStatus
function usePreviewStatus(owner: string, repo: string, lrNumber: number): {
  status: PreviewStatus | null;
  url: string | null;
  createdAt: string | null;
  lastAccessedAt: string | null;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
}

// Hook: usePreviewStatusStream
function usePreviewStatusStream(
  owner: string,
  repo: string,
  lrNumber: number,
  options?: { enabled?: boolean }
): {
  events: PreviewStatusEvent[];
  latestStatus: PreviewStatus | null;
  isStreaming: boolean;
  reconnect: () => void;
}
```

#### SDK Client Method

```typescript
getPreviewStatus(owner: string, repo: string, lrNumber: number): Promise<PreviewResponse | null>
streamPreviewStatus(owner: string, repo: string, lrNumber: number): AsyncIterable<PreviewStatusEvent>
```

### CLI Command

#### `codeplane land preview-status <number>`

**Output (default):**
```
Preview Status for Landing Request #42
  Status:        running
  URL:           https://42-my-app.preview.codeplane.app
  Created:       2 hours ago (2026-03-22T10:00:00Z)
  Last accessed: 12 minutes ago (2026-03-22T10:45:00Z)
```

**Output (no preview):**
```
No preview environment exists for Landing Request #42.
```

**Output (`--json`):**
```json
{
  "lr_number": 42,
  "status": "running",
  "url": "https://42-my-app.preview.codeplane.app",
  "created_at": "2026-03-22T10:00:00Z",
  "last_accessed_at": "2026-03-22T10:45:00Z"
}
```

**Output (`--stream`):**
```
[10:45:00] preview.status → running (https://42-my-app.preview.codeplane.app)
[11:00:00] preview.status → suspended (https://42-my-app.preview.codeplane.app)
[11:02:30] preview.status → running (https://42-my-app.preview.codeplane.app)
^C
```

#### Integration with `codeplane land view`

The existing `codeplane land view <number>` output includes a "Preview" line when a preview exists:

```
Landing Request #42 — "Add dark mode support"
  State:         open
  Author:        alice
  Target:        main
  Conflict:      clean
  Stack:         3 changes
  Preview:       running — https://42-my-app.preview.codeplane.app
  Created:       2 hours ago
  Updated:       12 minutes ago
```

If no preview exists, the "Preview" line is omitted.

### TUI UI

#### Landing Detail Metadata Section

The TUI landing detail view displays preview status in the metadata block:

```
┌─ Landing Request #42 ──────────────────────┐
│ State: [Open]  Author: alice               │
│ Target: main   Conflicts: ✓ clean          │
│ Stack: 3 changes                            │
│ Preview: ● running  https://42-my-app...    │
│ Created: 2h ago  Updated: 12m ago           │
└─────────────────────────────────────────────┘
```

**Status indicators:**
- `● running` (green dot)
- `◐ starting…` (yellow half-circle, animated)
- `⏸ suspended` (amber pause icon)
- `■ stopped` (gray square)
- `✗ failed` (red X)

When status is `running` or `suspended`, pressing `p` opens the preview URL in the default browser. Pressing `y` on the preview line copies the URL to the clipboard.

#### Real-Time Updates

The TUI subscribes to the same SSE endpoint. Status changes update the metadata section in place without screen flicker.

### Neovim Plugin API

The Neovim plugin adds:
- `:CodeplanePreviewStatus` command that prints the current preview status for the landing request associated with the current buffer's repository context.
- Preview URL is shown in the landing request detail floating window.
- If the preview is `running`, a keymap (`<leader>cp`) opens the preview URL in the default browser.

### VS Code Extension

The VS Code extension adds:
- A "Preview" field in the Landing Request detail tree view item.
- When the preview is running, a clickable link opens the preview URL in the default browser.
- The status bar shows a preview indicator icon when viewing a landing request with an active preview.
- A command `Codeplane: Open Landing Preview` is available in the command palette when a landing request is in focus.

### Documentation

1. **Guide: "Preview Environments for Landing Requests"** — A full walkthrough covering: what preview environments are, how to configure `.codeplane/preview.ts`, how to view preview status in web/CLI/TUI, understanding the five status states, auto-suspend and auto-resume behavior, and troubleshooting failed previews.

2. **Reference: Preview Status API** — REST and SSE endpoint documentation with request/response examples, status codes, and SSE event formats.

3. **CLI Reference update** — Add `land preview-status` to the CLI reference page with all flags documented.

4. **FAQ entry: "Why is my preview suspended?"** — Explain the 15-minute idle timeout and auto-resume on access behavior.

## Permissions & Security

### Authorization Roles

| Action | Owner | Admin | Write | Read | Anonymous |
|--------|-------|-------|-------|------|-----------|
| View preview status (REST GET) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Stream preview status (SSE) | ✅ | ✅ | ✅ | ✅ | ❌ |
| View preview URL | ✅ | ✅ | ✅ | ✅ | ❌ |

- **Read access or higher** to the repository is required to view preview status. This matches the permission model for viewing landing request details.
- **Anonymous users** cannot view preview status. Previews may contain pre-release code or sensitive behavior.
- The preview URL itself, when accessed via the reverse proxy, does **not** require Codeplane authentication (it is a direct HTTP connection to the preview container). However, the preview URL is only discoverable through authenticated Codeplane API endpoints.

### Rate Limiting

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `GET .../preview` (REST) | 60 requests | 1 minute | Per user |
| `GET .../preview/stream` (SSE) | 5 concurrent connections | — | Per user per landing request |

- SSE connections are counted as long-lived connections. If a user exceeds 5 concurrent SSE connections to the same landing request's preview stream, the oldest connection is closed with a `429` status and a `Retry-After: 5` header.
- REST rate limiting follows the global API rate limiter configuration.

### Data Privacy

- The preview status response does not contain PII. It contains infrastructure metadata (container IDs, ports, URLs).
- Container IDs and host ports are considered internal operational data. They should be included in API responses for debugging but should **not** be logged at INFO level — only at DEBUG.
- Preview URLs in cloud mode contain the repository name and landing request number, which are considered semi-public within the context of authenticated access.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `PreviewStatusViewed` | User views preview status via REST GET | `repository_id`, `lr_number`, `status_at_view_time`, `client` (web/cli/tui/vscode/nvim), `user_id` |
| `PreviewStatusStreamOpened` | User opens SSE stream | `repository_id`, `lr_number`, `client`, `user_id` |
| `PreviewStatusStreamClosed` | SSE stream closes (user navigates away or disconnects) | `repository_id`, `lr_number`, `client`, `user_id`, `duration_seconds`, `events_received` |
| `PreviewURLClicked` | User clicks the preview URL from any Codeplane surface | `repository_id`, `lr_number`, `client`, `user_id`, `preview_status_at_click` |
| `PreviewStatusTransition` | Preview transitions between states | `repository_id`, `lr_number`, `from_status`, `to_status`, `trigger` (idle_timeout/wake_on_access/creation/deletion/failure) |

### Funnel Metrics

1. **Preview Awareness Rate**: % of landing request detail views where a preview exists → measures whether teams are using preview environments.
2. **Preview Click-Through Rate**: % of `PreviewStatusViewed` events where `PreviewURLClicked` follows within 60 seconds → measures whether users are engaging with live previews.
3. **Stream Adoption Rate**: % of landing request detail views that open an SSE stream → measures real-time status adoption vs. one-shot polling.
4. **Time-to-First-Preview-Access**: Time between `PreviewStatusTransition` (to `running`) and first `PreviewURLClicked` → measures how quickly reviewers engage with previews.
5. **Preview Availability Rate**: % of time a preview spends in `running` state vs. total active time → measures reliability of preview infrastructure.
6. **Suspended-to-Wake Conversion**: % of `suspended` previews that are subsequently woken via URL access → measures whether auto-suspend/resume is working for users.

### Success Indicators

- ≥70% of landing requests in repositories with `.codeplane/preview.ts` have preview environments created.
- ≥50% of landing request reviewers click the preview URL at least once during review.
- Mean time from preview `running` to first reviewer click is under 5 minutes.
- SSE stream reconnection failures (events missed between disconnect and reconnect) are <0.1% of all stream sessions.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Preview status requested | INFO | `repository_id`, `lr_number`, `user_id`, `status` | Emitted on each REST GET |
| Preview stream opened | INFO | `repository_id`, `lr_number`, `user_id`, `client_ip` | Emitted when SSE connection established |
| Preview stream closed | INFO | `repository_id`, `lr_number`, `user_id`, `duration_ms`, `events_sent` | Emitted when SSE connection ends |
| Preview status transition | INFO | `repository_id`, `lr_number`, `from_status`, `to_status`, `trigger` | Emitted on every state change |
| Preview stream reconnection with replay | DEBUG | `repository_id`, `lr_number`, `last_event_id`, `events_replayed` | Emitted when client reconnects with Last-Event-ID |
| Preview status fetch error | WARN | `repository_id`, `lr_number`, `error_message`, `error_code` | Emitted when preview status lookup fails unexpectedly |
| SSE connection rate limited | WARN | `user_id`, `repository_id`, `lr_number`, `concurrent_count` | Emitted when user exceeds SSE connection limit |
| Container runtime unavailable | ERROR | `repository_id`, `lr_number` | Emitted when sandbox client is not available |
| PG NOTIFY delivery failure | ERROR | `channel`, `payload_size`, `error` | Emitted when pg_notify fails |

### Prometheus Metrics

#### Counters

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_preview_status_requests_total` | `repository_id`, `status_code` | Total REST GET requests for preview status |
| `codeplane_preview_stream_connections_total` | `repository_id` | Total SSE connections opened |
| `codeplane_preview_stream_disconnections_total` | `repository_id`, `reason` (client_close, error, rate_limit) | Total SSE disconnections |
| `codeplane_preview_status_transitions_total` | `repository_id`, `from_status`, `to_status` | Total state transitions |
| `codeplane_preview_url_clicks_total` | `repository_id`, `client` | Total preview URL click-throughs |
| `codeplane_preview_stream_events_sent_total` | `repository_id`, `event_type` | Total SSE events sent |
| `codeplane_preview_stream_reconnections_total` | `repository_id` | Total reconnections with Last-Event-ID |

#### Gauges

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_preview_active_streams` | `repository_id` | Current number of active SSE connections |
| `codeplane_preview_environments_by_status` | `status` | Current count of previews by status |

#### Histograms

| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `codeplane_preview_status_request_duration_seconds` | `repository_id` | 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1 | REST GET response time |
| `codeplane_preview_stream_duration_seconds` | `repository_id` | 1, 5, 15, 30, 60, 300, 900, 3600 | SSE connection lifetime |
| `codeplane_preview_transition_latency_seconds` | `from_status`, `to_status` | 0.01, 0.05, 0.1, 0.5, 1, 5, 10 | Time between state change and SSE event delivery |

### Alerts and Runbooks

#### Alert: `PreviewStatusStreamHighErrorRate`

**Condition:** `rate(codeplane_preview_stream_disconnections_total{reason="error"}[5m]) / rate(codeplane_preview_stream_connections_total[5m]) > 0.1`

**Severity:** Warning

**Runbook:**
1. Check server logs for `preview_stream_closed` entries with error reasons.
2. Verify SSE manager health: `curl -s http://localhost:PORT/api/health | jq '.sse'`.
3. Check PostgreSQL LISTEN/NOTIFY connectivity: verify the PG connection pool is not exhausted.
4. Check for network interruptions between load balancer and server (if applicable).
5. If PG NOTIFY is failing, check `codeplane_preview_stream_events_sent_total` — if it's flat, the issue is on the publish side. Restart the database connection pool.
6. If events are being sent but clients disconnect, check load balancer idle timeout settings (must be >15s to accommodate keep-alive).

#### Alert: `PreviewStatusTransitionLatencyHigh`

**Condition:** `histogram_quantile(0.95, rate(codeplane_preview_transition_latency_seconds_bucket[5m])) > 5`

**Severity:** Warning

**Runbook:**
1. Check the PG NOTIFY channel backlog: `SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%LISTEN%'`.
2. Verify the SSE manager's internal subscription map is not leaking subscribers. Check `codeplane_preview_active_streams` gauge for abnormal growth.
3. If latency is isolated to specific repositories, check if those repos have an unusually high number of concurrent SSE listeners.
4. Profile the event serialization path — ensure JSON.stringify of the payload is not blocking.
5. If latency correlates with high database load, check slow query logs and connection pool utilization.

#### Alert: `PreviewStatusEndpointDown`

**Condition:** `up{job="codeplane-server"} == 1 AND increase(codeplane_preview_status_requests_total[5m]) == 0 AND increase(codeplane_preview_stream_connections_total[5m]) == 0`

**Severity:** Critical (if previews are expected to be active)

**Runbook:**
1. Verify the preview routes are mounted: `curl http://localhost:PORT/api/repos/test/test/landings/1/preview` should return 404, not 405 or connection refused.
2. Check server startup logs for preview route registration.
3. Verify the `LANDING_PREVIEW_STATUS` feature flag is enabled.
4. Check if the preview service initialized correctly in the service registry.
5. If the endpoint is unreachable, check Hono route mounting order — preview routes must be registered after auth middleware.

#### Alert: `PreviewSSEConnectionLeak`

**Condition:** `codeplane_preview_active_streams > 500`

**Severity:** Warning

**Runbook:**
1. Check which repositories have the most active streams: query `codeplane_preview_active_streams` by `repository_id`.
2. Verify that client-side SSE disconnection is working (web UI should close connections on navigation away).
3. Check for zombie connections from automated clients or agents that don't close streams.
4. If connections are accumulating on a single LR, check if there's a client-side reconnection loop (rapid connect/disconnect cycles).
5. If necessary, restart the SSE manager to clear stale connections, or apply the per-user connection limit more aggressively.

### Error Cases and Failure Modes

| Failure | HTTP Status | User Impact | Recovery |
|---------|-------------|-------------|----------|
| Preview not found | 404 | Status shows "none" | Expected state — no action needed |
| Container runtime unavailable | 404 with `sandbox_unavailable` error code | Previews not available on this instance | Admin must install Docker/Podman |
| Landing request not found | 404 | Cannot view status | Verify LR number and repository |
| Database connection failure | 500 | Status fetch fails | Client retries; server reconnects to DB |
| SSE channel subscription failure | 500 (stream fails to open) | No real-time updates | Client falls back to polling REST endpoint |
| PG NOTIFY payload too large (>8KB) | Partial event loss | Missed status update | Keep payloads small; log and alert on oversized payloads |
| Rate limit exceeded (REST) | 429 | Temporary block | Client backs off per Retry-After header |
| Rate limit exceeded (SSE) | 429 | Oldest connection closed | Client reconnects after Retry-After |
| User lacks repository read access | 403 | Cannot view preview | Expected — user needs access |
| Unauthenticated request | 401 | Cannot view preview | User must authenticate |

## Verification

### API Integration Tests

#### REST Endpoint Tests

1. **`GET /preview` returns 200 with correct status when preview exists** — Create a landing request, create a preview for it, then GET the preview status. Assert response shape matches `PreviewResponse`, status is `starting` or `running`, URL is present.

2. **`GET /preview` returns 404 when no preview exists** — Create a landing request without a preview, then GET the preview status. Assert 404 with `error: "no_preview"`.

3. **`GET /preview` returns 404 when landing request does not exist** — GET preview status for a non-existent landing request number (e.g., 999999). Assert 404.

4. **`GET /preview` returns 403 for user without repository read access** — Authenticate as a user with no access to the repository. Assert 403.

5. **`GET /preview` returns 401 for unauthenticated request** — Make the request without auth headers or cookies. Assert 401.

6. **`GET /preview` reflects correct status after state transition (starting → running)** — Create a preview, wait for it to reach `running`, then GET. Assert `status: "running"` and URL is present.

7. **`GET /preview` reflects `suspended` status after idle timeout** — Create a preview, let it idle past the timeout, then GET. Assert `status: "suspended"`.

8. **`GET /preview` reflects `failed` status when container fails** — Create a preview with an invalid start command. GET after failure. Assert `status: "failed"` and URL is null.

9. **`GET /preview` returns 404 after preview is deleted** — Create a preview, delete it, then GET. Assert 404.

10. **`GET /preview` rate limiting enforced at 60 requests/minute** — Make 61 requests in rapid succession. Assert the 61st returns 429 with `Retry-After` header.

11. **`GET /preview` returns preview with localhost URL in CE mode** — With no `CODEPLANE_PREVIEW_DOMAIN` set, create a preview and GET. Assert URL format is `http://localhost:{port}`.

12. **`GET /preview` returns preview with domain-based URL in cloud mode** — With `CODEPLANE_PREVIEW_DOMAIN` set, create a preview and GET. Assert URL format is `https://{lr}-{repo}.{domain}`.

#### SSE Endpoint Tests

13. **`GET /preview/stream` returns SSE with initial status event** — Open an SSE connection. Assert the first event has `event: preview.status` and contains the current status.

14. **`GET /preview/stream` sends initial event with `status: null` when no preview exists** — Open an SSE connection for a landing request with no preview. Assert the initial event has `status: null` or the stream returns a meaningful "no_preview" initial event.

15. **`GET /preview/stream` delivers real-time status transitions** — Open an SSE connection, then create a preview. Assert events are received for `starting` and `running` transitions.

16. **`GET /preview/stream` delivers `preview.deleted` event when preview is deleted** — Open an SSE connection for an existing preview, then delete the preview. Assert a `preview.deleted` event is received and the stream closes.

17. **`GET /preview/stream` supports Last-Event-ID reconnection** — Open a connection, receive event ID 1, disconnect, reconnect with `Last-Event-ID: 1`. Assert events after ID 1 are replayed.

18. **`GET /preview/stream` sends keep-alive comments every 15 seconds** — Open a connection and wait 20 seconds with no status changes. Assert at least one `: keep-alive` comment is received.

19. **`GET /preview/stream` enforces 5 concurrent connection limit per user per LR** — Open 5 SSE connections from the same user to the same LR. Open a 6th. Assert the oldest connection is terminated with 429 or the 6th connection is rejected.

20. **`GET /preview/stream` returns 403 for user without repository read access** — Authenticate as a user without access. Assert 403.

21. **`GET /preview/stream` returns 401 for unauthenticated request** — Make the request without auth. Assert 401.

22. **`GET /preview/stream` properly closes when landing request is merged** — Open a stream, then merge the landing request. Assert the preview is cleaned up and a terminal event is sent.

### CLI Integration Tests

23. **`codeplane land view` includes preview status when preview exists** — Create a landing request and a preview. Run `codeplane land view <number>`. Assert output contains a "Preview" line with status and URL.

24. **`codeplane land view` omits preview line when no preview exists** — Create a landing request without a preview. Run `codeplane land view <number>`. Assert output does not contain a "Preview" line.

25. **`codeplane land preview-status` returns structured output** — Create a landing request with a preview. Run `codeplane land preview-status <number> --json`. Assert JSON output matches expected schema.

26. **`codeplane land preview-status` returns human-readable output** — Create a landing request with a preview. Run `codeplane land preview-status <number>`. Assert output contains status, URL, created timestamp, and last accessed timestamp.

27. **`codeplane land preview-status` returns error message when no preview exists** — Run against a landing request with no preview. Assert output says "No preview environment exists."

28. **`codeplane land preview-status --stream` streams status updates** — Open a stream, trigger a status change (e.g., suspend), verify the new status appears in stream output. Terminate with Ctrl+C.

29. **`codeplane land preview-status` returns error for non-existent landing request** — Run against a non-existent LR number. Assert error message.

30. **`codeplane land preview-status` returns error when not authenticated** — Run without auth configured. Assert authentication error.

### Playwright (Web UI) E2E Tests

31. **Preview badge appears on landing request detail page when preview is running** — Navigate to a landing request with a running preview. Assert the preview badge is visible with "Preview live" text and green color.

32. **Preview badge shows "starting" state with spinner** — Navigate to a landing request with a starting preview. Assert the badge shows "Preview starting…" with a loading indicator.

33. **Preview badge shows "suspended" state** — Navigate to a landing request with a suspended preview. Assert the badge shows "Preview suspended" with hint text.

34. **Preview badge shows "failed" state** — Navigate to a landing request with a failed preview. Assert the badge shows "Preview failed" with red color.

35. **Preview badge is hidden when no preview exists** — Navigate to a landing request without a preview. Assert no preview badge is visible.

36. **Clicking preview URL opens new tab** — Navigate to a landing request with a running preview. Click the preview URL. Assert a new tab/window is opened with the preview URL.

37. **Copy URL button copies to clipboard** — Navigate to a landing request with a running preview. Click the copy URL button. Assert the clipboard contains the preview URL.

38. **Preview status updates in real time via SSE** — Navigate to a landing request detail page. Trigger a preview status change (e.g., from running to suspended via API). Assert the badge updates without page refresh within 5 seconds.

39. **Preview section in Overview tab shows full details** — Navigate to a landing request with a preview, go to Overview tab. Assert the "Preview Environment" section shows status, URL, creation time, and last access time.

40. **SSE reconnects after simulated network interruption** — Navigate to the landing request detail page. Simulate a brief network interruption (e.g., via service worker or proxy). Assert the SSE connection re-establishes and the preview status is current.

### TUI Integration Tests

41. **TUI landing detail view shows preview status in metadata** — Open the TUI, navigate to a landing request with a running preview. Assert the metadata section contains the preview status indicator.

42. **TUI preview status updates in real time** — Open the TUI on a landing request detail view. Trigger a status change. Assert the display updates.

43. **TUI `p` keybinding opens preview URL in browser** — Focus on the preview status line in the TUI. Press `p`. Assert the system browser is invoked with the preview URL.

### Boundary and Stress Tests

44. **Preview status for landing request at maximum valid number (2,147,483,647)** — Create a landing request (or mock one) at the maximum integer value. GET preview status. Assert correct 404 (no preview) rather than a parse error.

45. **Preview status for landing request number 0** — GET preview status for LR number 0. Assert 404 or 400 (invalid number).

46. **Preview status for negative landing request number** — GET preview status for LR number -1. Assert 400 (bad request).

47. **Preview status for non-numeric landing request number** — GET preview status for LR "abc". Assert 400 (bad request).

48. **SSE stream with 100 rapid status transitions** — Trigger 100 rapid status transitions on a preview. Assert all 100 events are received by the SSE client in order with monotonically increasing IDs.

49. **Multiple concurrent SSE clients receive the same events** — Open 3 SSE connections from different users. Trigger a status change. Assert all 3 clients receive the event.

50. **Preview status after server restart** — Create a preview, restart the server, GET preview status. Assert the in-memory state is reconstructed or a clean 404 is returned (depending on persistence model).
