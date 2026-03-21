# NOTIFICATION_INBOX_UI

Specification for NOTIFICATION_INBOX_UI.

## High-Level User POV

When you open Codeplane and click the bell icon in the global header — or navigate directly to `/inbox` — you land in your notification inbox: a single, focused surface that shows everything Codeplane wants to tell you about. Issue assignments, comments on your landing requests, workflow completions, workspace failures, review activity — it all arrives here, sorted newest-first, with unread items visually distinct from ones you've already seen.

The inbox is designed to be the place you check when you want to catch up. Unread notifications are rendered with bold text and a colored indicator so your eye is immediately drawn to what's new. You can filter the view to show only unread items when you want to focus, or show everything when you want context. Each notification row tells you what happened (the subject), gives you a preview of additional detail (the body), shows a source type icon so you can visually parse issue activity from workflow events at a glance, and tells you when it happened with a relative timestamp.

Clicking any notification takes you directly to the thing it's about — the issue, the landing request, the workflow run, the workspace — and automatically marks it as read behind the scenes. If you don't want to navigate but just want to clear it, you can mark it read right from the inbox with a single click on the mark-read control. And if you've been away and your inbox has piled up, a "Mark all as read" button lets you clear the slate in one action.

The inbox also updates in real time. When a new notification arrives — because someone just commented on your landing request, or a workflow you kicked off just finished — it appears at the top of your list without you needing to refresh. The unread badge in the header updates instantly, so you always know whether there's something new waiting for you, no matter what page you're on.

Pagination keeps the experience fast even if you've accumulated thousands of notifications over months of active use. You see 30 items per page, with clear navigation to move between pages and always know where you are in the total. The inbox works well on wide monitors and narrow mobile viewports alike — on smaller screens, the body preview hides and the layout tightens, but the essential information remains fully accessible.

This inbox is the single source of truth for your Codeplane attention stream. It complements the CLI's `notification list` and `notification read` commands, the TUI's notification screen, and the editor integrations' status indicators — all backed by the same API and the same real-time SSE delivery pipeline. Changes you make in any surface are reflected everywhere else.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user can navigate to `/inbox` and see a paginated list of their notifications, sorted newest-first
- [ ] The global header bell icon navigates to the inbox and displays the current unread count as a badge
- [ ] Unread notifications are visually distinct from read notifications (bold text, colored unread indicator)
- [ ] Clicking a notification row navigates to the source resource (issue, landing request, workflow run, workspace) and marks the notification as read
- [ ] A per-row mark-read control allows marking individual notifications as read without navigating away
- [ ] A "Mark all as read" button marks all notifications as read in one action
- [ ] The "All" / "Unread" filter toggle filters the displayed notification list
- [ ] Pagination controls (Previous / Next) navigate between pages, and the current page and total page count are displayed
- [ ] Real-time notification delivery via SSE prepends new notifications to the list and updates the unread badge without page reload
- [ ] Empty state displays a clear "No notifications yet" message with contextual guidance
- [ ] Loading state displays skeleton rows matching notification row height
- [ ] Error state displays an inline error banner with a retry action
- [ ] The inbox is fully keyboard-accessible and screen-reader compatible
- [ ] All mark-read operations use optimistic UI updates with pessimistic rollback on failure
- [ ] All surfaces (web, CLI, TUI, desktop) reflect consistent notification state for the same user

### Functional Constraints

- [ ] The bell icon badge shows the total unread notification count, abbreviated as "99+" when the count exceeds 99
- [ ] The bell icon badge is hidden when the unread count is zero
- [ ] The unread indicator on notification rows is a colored dot (blue), not dependent solely on color — it uses shape as well for accessibility
- [ ] Notification subject text maximum display length is 255 characters (matches the database constraint); subjects are not truncated client-side but allowed to wrap
- [ ] Notification body preview is truncated to 120 characters with an ellipsis in the list view
- [ ] Relative timestamps follow the format: "just now", "Nm ago", "Nh ago", "Nd ago", "Nw ago", then ISO date for items older than 4 weeks
- [ ] Source type icons are distinct per source type: issue (🔔), issue_comment (💬), landing_request (🚀), lr_review (✅), lr_comment (💬), workspace (🖥), workflow_run (⚙️)
- [ ] Default page size is 30 items; maximum is 50 per page
- [ ] Requesting a page beyond the last page returns an empty list and the pagination controls reflect this (Next disabled)
- [ ] The filter toggle is a two-segment pill: "All" (default) and "Unread"
- [ ] Switching filters resets to page 1
- [ ] The "Mark all as read" button is disabled when there are zero unread notifications
- [ ] The "Mark all as read" button shows a loading spinner during the PUT request and is disabled until the request completes
- [ ] On successful mark-all-read, all visible notification rows transition to read styling and the badge resets to zero
- [ ] On failed mark-all-read, a toast error appears and no visual state changes
- [ ] Clicking a notification to navigate sets the mark-read API call in motion concurrently with the navigation — the user does not wait for the mark-read to complete
- [ ] Auto-mark-read on navigate fires only for unread notifications; clicking an already-read notification does not make an API call
- [ ] SSE reconnection uses `Last-Event-ID` to replay missed notifications (up to 1,000 events)
- [ ] SSE reconnection uses exponential backoff: 1s, 2s, 4s, 8s, capped at 30s, max 20 attempts
- [ ] SSE keep-alive comment lines every 15 seconds; 45-second timeout with no data triggers reconnection
- [ ] New SSE-delivered notifications are prepended to the list with a brief highlight animation (1-cycle subtle background highlight)
- [ ] Client-side deduplication by notification ID prevents duplicate rows on SSE replay
- [ ] When the Unread filter is active and a notification is marked read (explicitly or via navigate), the row fades out and is removed from the list

### Edge Cases

- [ ] User with zero notifications sees the empty state, not a blank page
- [ ] User who has never visited the inbox before sees an empty state with the message "No notifications yet. When activity happens in repositories you watch, you'll see it here."
- [ ] Notification with `source_id: null` (deleted source) renders normally but clicking it shows a toast: "The original item is no longer available" and does not navigate
- [ ] Notification with all seven source types renders correctly with the appropriate icon
- [ ] Notification with a 255-character subject renders without overflow or layout breakage
- [ ] Notification with an empty body renders with no body preview row (no blank space)
- [ ] User with 100,000+ notifications can load page 1 within 500ms
- [ ] Concurrent mark-read and mark-all-read from two tabs do not produce inconsistent badge counts after both complete
- [ ] SSE disconnect and reconnect replays missed notifications and deduplicates them
- [ ] Browser tab regaining focus after sleep/hibernation reconnects SSE gracefully
- [ ] Network failure during page fetch shows an inline error with retry, not a blank page
- [ ] Rate-limited requests show a toast: "Too many requests. Please wait a moment and try again."
- [ ] Non-ASCII characters in subjects and bodies (emoji, CJK, RTL text) render correctly
- [ ] Very long body text (5000+ characters) is truncated to 120 characters in the preview without performance issues
- [ ] Marking a notification as read on page 2 while page 1 has new unread items does not cause the user to jump to page 1

### Boundary Constraints

- [ ] `page` query parameter: integer, minimum 1, no maximum (over-last-page returns empty)
- [ ] `per_page` query parameter: integer, minimum 1, maximum 50, default 30
- [ ] Notification `id`: positive integer, range 1 to 2^63-1 (PostgreSQL bigint)
- [ ] Notification `subject`: non-empty string, maximum 255 characters, UTF-8
- [ ] Notification `body`: string (may be empty), no maximum length for storage, truncated to 120 characters for display
- [ ] Notification `source_type`: one of `issue`, `issue_comment`, `landing_request`, `lr_review`, `lr_comment`, `workspace`, `workflow_run`
- [ ] Notification `status`: one of `read`, `unread`
- [ ] Unread badge: displays "99+" for counts exceeding 99

## Design

### Web UI Design

**Route:** `/inbox` — accessible from the global header bell icon or directly by URL.

**URL Structure:** `/inbox?page=N&filter=all|unread` — query parameters control pagination and filter state and are reflected in the URL for shareability and browser history.

**Global Header Bell Icon:**
- Located in the global top-bar/strip, to the right of the search input and to the left of the user avatar/menu.
- Icon: bell (outline when no unread; filled when unread > 0).
- Badge: a small circular badge overlaid on the top-right corner of the bell icon showing the unread count. Hidden when count is 0. Shows "99+" when count > 99.
- Badge color: primary accent (blue).
- Click behavior: navigates to `/inbox`.
- The badge count updates in real-time via the SSE notification stream.

**Page Layout:**

1. **Page Header Row**
   - Left: Page title "Notifications" in `h1` heading.
   - Left: Unread count displayed as a muted badge next to the title: "(N unread)".
   - Right: "Mark all as read" button. Disabled (muted, non-clickable) when unread count is 0. Shows spinner and is disabled during the API request.

2. **Filter Toolbar Row** (below header)
   - Two-segment pill toggle: "All" (default selected) and "Unread".
   - Selecting "Unread" re-fetches the list with server-side or client-side filtering and resets to page 1.
   - Active segment has filled background; inactive segment has outline/transparent background.

3. **Notification List**
   - Each notification is rendered as a clickable row/card with the following columns:
     - **Unread indicator**: Blue dot (●) on the left edge for unread notifications; invisible/absent for read notifications.
     - **Source type icon**: Visual icon per source type (issue 🔔, issue_comment 💬, landing_request 🚀, lr_review ✅, lr_comment 💬, workspace 🖥, workflow_run ⚙️).
     - **Content block**:
       - **Subject line**: Bold for unread, normal weight for read. Truncated with ellipsis if exceeding available width.
       - **Body preview**: Muted/secondary text color. Truncated to 120 characters with "…". Hidden if body is empty.
     - **Timestamp**: Relative timestamp (right-aligned). Muted text. Tooltip shows full ISO 8601 datetime on hover.
   - Hover state: subtle background highlight on the row.
   - Click behavior: navigates to the source resource and fires `PATCH /api/notifications/:id` concurrently.
   - Mark-read control: a small "mark as read" icon button on the right side of each unread notification row (e.g., a check-circle icon). Hidden on already-read notifications. Clicking it fires `PATCH /api/notifications/:id` and updates the row optimistically.

4. **Pagination Footer** (below the list)
   - "Previous" and "Next" buttons.
   - "Page X of Y" indicator, where Y = `ceil(X-Total-Count / per_page)`.
   - "Previous" is disabled on page 1. "Next" is disabled on the last page.
   - Clicking Previous/Next updates the `page` query parameter and fetches new data.

5. **Empty State** (when no notifications match the current filter)
   - Centered illustration (bell icon with a subtle decorative element).
   - Heading: "No notifications yet" (when All filter is active and total is 0) or "No unread notifications" (when Unread filter is active and all are read).
   - Subtext: "When activity happens in repositories you watch, you'll see it here."

6. **Loading State**
   - Skeleton rows matching the notification row height and layout (indicator, icon, text block, timestamp).
   - 5 skeleton rows shown during initial load.
   - Subsequent page loads show a subtle loading indicator on the pagination controls rather than replacing the list with skeletons.

7. **Error State**
   - Inline banner at the top of the list area: "Failed to load notifications."
   - "Try again" button in the banner that retries the `GET /api/notifications/list` request.
   - If the error occurs during a page navigation, the current page remains visible and the error banner appears above.

**Responsive Behavior:**
- **< 640px (mobile)**: Hide body preview. Source icon + Subject + Timestamp in a single condensed row. Mark-read control moves into a swipe-to-reveal gesture or a row action menu.
- **640px–1024px (tablet)**: Show subject and truncated body preview. Timestamp below the content block.
- **> 1024px (desktop)**: Full layout with icon, subject, body preview, and timestamp in a single row.

**Real-Time Updates (SSE Integration):**
- On page mount, the web client connects to `GET /api/notifications` SSE endpoint using the authenticated session.
- SSE authentication: ticket-based via `POST /api/auth/sse-ticket` (30-second TTL), with fallback to bearer token in the `Authorization` header.
- When a new notification event arrives:
  - If the user is on page 1 with the "All" filter active: the new notification is prepended to the list with a brief highlight animation (0.3s background color flash). If the page already has 30 items, the last item is removed from the visible list (but remains on the next page).
  - If the user is on page > 1 or has the "Unread" filter active: the new notification is added to the client-side cache but not displayed (it will appear when the user navigates to page 1 or refreshes).
  - The unread badge in the header always increments immediately regardless of current page/filter.
- Reconnection: exponential backoff with `Last-Event-ID` replay. A subtle connection status indicator appears in the page header when disconnected: "Reconnecting…" in muted text. Hidden once reconnected.
- Keep-alive: SSE comment lines every 15s; 45s timeout triggers reconnect.

**Navigation from Notification to Source:**
- `issue` → `/:owner/:repo/issues/:number`
- `issue_comment` → `/:owner/:repo/issues/:number` (scrolls to comment section)
- `landing_request` → `/:owner/:repo/landings/:number`
- `lr_review` → `/:owner/:repo/landings/:number` (scrolls to reviews)
- `lr_comment` → `/:owner/:repo/landings/:number` (scrolls to comments)
- `workspace` → `/workspaces/:id`
- `workflow_run` → `/:owner/:repo/workflows/runs/:id`
- Navigation requires enriched fields on the notification (`repo_owner`, `repo_name`, `resource_number`). If these are missing (legacy notifications), the notification is rendered with the mark-read control but without a clickable link — hovering shows a tooltip: "Navigation details not available for this notification."

**Keyboard Accessibility:**
- Tab cycles through: filter toggle → notification rows → mark-read controls → pagination buttons.
- Enter/Space on a notification row triggers navigation + mark-read.
- Enter/Space on a mark-read control triggers mark-read only.
- Focus ring is visible on all interactive elements.
- Screen reader: each notification row announces as `"[Unread] [Source type]: [Subject], [Timestamp]"`. Mark-read button announces as `"Mark as read"`. After marking, announces `"Notification marked as read"`.

### API Shape

This feature consumes the existing notification API endpoints. No new endpoints are introduced.

**Consumed Endpoints:**

| Endpoint | Method | Purpose | Consumed By |
|----------|--------|---------|-------------|
| `GET /api/notifications/list?page=N&per_page=N` | GET | Fetch paginated notification list | Page load, pagination, filter |
| `GET /api/notifications` | GET (SSE) | Real-time notification stream | SSE connection on mount |
| `PATCH /api/notifications/:id` | PATCH | Mark single notification as read | Row click, mark-read button |
| `PUT /api/notifications/mark-read` | PUT | Mark all notifications as read | "Mark all as read" button |
| `POST /api/auth/sse-ticket` | POST | Obtain short-lived SSE auth ticket | SSE connection setup |

**Notification Response Shape (per item):**
```json
{
  "id": 42,
  "user_id": 1,
  "source_type": "issue",
  "source_id": 97,
  "subject": "Issue #97 assigned to you",
  "body": "alice assigned issue #97 'Fix login timeout' to you",
  "status": "unread",
  "read_at": null,
  "created_at": "2026-03-21T10:30:00Z",
  "updated_at": "2026-03-21T10:30:00Z",
  "repo_owner": "acme",
  "repo_name": "backend",
  "resource_number": 97
}
```

### SDK Shape

The `ui-core` package must expose the following hooks and utilities for the SolidJS web application:

```typescript
// Notification list data hook
function useNotifications(options: {
  page: Accessor<number>;
  perPage?: number;
  filter?: Accessor<"all" | "unread">;
}): {
  notifications: Accessor<NotificationResponse[]>;
  total: Accessor<number>;
  isLoading: Accessor<boolean>;
  error: Accessor<Error | null>;
  refetch: () => void;
}

// Single notification mark-read
function useMarkRead(): {
  markRead: (id: number) => Promise<void>;
  isPending: Accessor<boolean>;
}

// Mark all as read
function useMarkAllRead(): {
  markAllRead: () => Promise<void>;
  isPending: Accessor<boolean>;
}

// Unread count (global, SSE-backed)
function useUnreadCount(): Accessor<number>

// SSE notification stream (singleton)
function useNotificationStream(): {
  isConnected: Accessor<boolean>;
  latestNotification: Accessor<NotificationResponse | null>;
}
```

### CLI Command

No new CLI commands. The existing `codeplane notification list` and `codeplane notification read` commands serve the same backend. The inbox UI is a web-specific presentation of the same data.

### TUI UI

No new TUI screens. The existing TUI notification list screen spec (`TUI_NOTIFICATION_LIST_SCREEN`) covers the terminal equivalent. The inbox UI is the web counterpart.

### Documentation

The following end-user documentation must be written:

1. **User Guide: "Your Notification Inbox"** — A walkthrough covering:
   - How to access the inbox (bell icon, `/inbox` URL, keyboard shortcut from command palette)
   - Understanding the notification list (what each column means, source type icons)
   - Marking notifications as read (individual, bulk, automatic on navigation)
   - Filtering between All and Unread views
   - Pagination behavior
   - Real-time updates and what to expect when new notifications arrive
   - Relationship to CLI `notification list` / `notification read` commands
   - Relationship to TUI notification screen
   - Troubleshooting: "I'm not receiving notifications" → link to notification preferences at `/settings/notifications`

2. **Feature Changelog Entry** — A brief changelog entry announcing the inbox UI: "The notification inbox is now available at `/inbox`. View, filter, and manage your notifications with real-time updates."

## Permissions & Security

### Authorization

| Role | Access | Notes |
|------|--------|-------|
| Authenticated user | ✅ Full access to own inbox | Can view, mark-read, mark-all-read, filter, paginate |
| Anonymous / unauthenticated | ❌ Redirect to login | `/inbox` redirects to `/login?redirect=/inbox` |
| Admin | ✅ Own inbox only | Admin role does not grant access to other users' notifications via this UI |
| PAT-authenticated (API) | ✅ | Can consume all notification endpoints |
| Deploy key | ❌ | Deploy keys do not carry user identity |
| OAuth2 application | ✅ | If OAuth scope includes notification access |

- The user ID is always derived from the authenticated session. There is no URL parameter or query parameter that accepts a user ID — IDOR is impossible by design.
- The SSE endpoint is user-scoped to `user_notifications_{userId}` — no cross-user event leakage.
- The SSE ticket is single-use and expires after 30 seconds, minimizing credential exposure on long-lived connections.

### Rate Limiting

| Endpoint | Per-User Limit | Window | Burst | On Exceed |
|----------|---------------|--------|-------|-----------|
| `GET /api/notifications/list` | 120 requests | 1 minute | 10/sec | `429` + `Retry-After` |
| `PATCH /api/notifications/:id` | 60 requests | 1 minute | 10/sec burst | `429` + `Retry-After` |
| `PUT /api/notifications/mark-read` | 10 requests | 1 minute | — | `429` + `Retry-After` |
| `GET /api/notifications` (SSE) | 5 connections | concurrent | — | Oldest connection closed |
| `POST /api/auth/sse-ticket` | 30 requests | 1 minute | — | `429` + `Retry-After` |

- The list endpoint rate limit of 120/min accommodates aggressive foreground polling while the SSE stream is not connected (e.g., during reconnection windows).
- The mark-all-read limit of 10/min is intentionally low because it is a bulk operation.

### Data Privacy

- Notification subjects and bodies may contain usernames, repository names, issue titles, and comment excerpts. These are user-generated content the authenticated user already has access to.
- No PII beyond what the user already sees in the source resources is exposed.
- Notification IDs are sequential integers; the user-scoped database query prevents cross-user enumeration.
- The `X-Total-Count` header reveals only the authenticated user's own count.
- SSE payloads are scoped to the user's personal channel — no broadcast leakage.
- `Cache-Control: no-store` on all notification API responses to prevent proxy caching of potentially sensitive notification content.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `NotificationInboxOpened` | User navigates to `/inbox` | `user_id`, `client` ("web"), `referrer_path`, `unread_count_at_open`, `total_count_at_open`, `timestamp` |
| `NotificationInboxFiltered` | User toggles the All/Unread filter | `user_id`, `filter` ("all" or "unread"), `result_count`, `timestamp` |
| `NotificationInboxPageNavigated` | User clicks Previous or Next | `user_id`, `from_page`, `to_page`, `total_pages`, `timestamp` |
| `NotificationClicked` | User clicks a notification row to navigate to source | `user_id`, `notification_id`, `source_type`, `was_unread`, `time_to_click_ms` (time since page load), `page`, `row_position`, `timestamp` |
| `NotificationMarkedReadFromInbox` | User clicks the per-row mark-read control | `user_id`, `notification_id`, `source_type`, `trigger` ("explicit"), `timestamp` |
| `NotificationMarkedReadViaNavigate` | Notification auto-marked read on click-to-navigate | `user_id`, `notification_id`, `source_type`, `trigger` ("navigate"), `timestamp` |
| `NotificationMarkAllReadFromInbox` | User clicks "Mark all as read" | `user_id`, `unread_count_before`, `timestamp` |
| `NotificationSSEConnected` | SSE stream successfully connects | `user_id`, `is_reconnection`, `replay_count` (events replayed), `timestamp` |
| `NotificationSSEDisconnected` | SSE stream drops | `user_id`, `connection_duration_seconds`, `reason` ("timeout", "error", "page_unload"), `timestamp` |
| `NotificationSSENewArrival` | New notification received via SSE while inbox is open | `user_id`, `notification_id`, `source_type`, `user_on_page` (current page number), `timestamp` |

### Event Properties

All notification inbox telemetry events must include:
- `user_id` — Anonymized or hashed user identifier.
- `client` — Always `"web"` for the inbox UI.
- `timestamp` — ISO 8601 event timestamp.
- `session_id` — Browser session identifier for funnel analysis.

### Funnel Metrics & Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| **Inbox visit rate** | > 60% of WAU | Percentage of weekly active users who open the inbox at least once per week |
| **Notification click-through rate** | > 30% | Percentage of viewed notifications that are clicked to navigate to source |
| **Mark-read rate (individual)** | > 40% | Percentage of notifications individually marked read (not via mark-all) |
| **Mark-all-read usage** | Tracked | How often mark-all-read is used — very high usage may indicate overwhelming volume |
| **Unread-filter usage** | Tracked | Percentage of inbox visits that use the Unread filter |
| **SSE uptime** | > 95% | Percentage of inbox session time with an active SSE connection |
| **Time to first interaction** | < 5s | P50 time from inbox page load to first click/action |
| **Inbox bounce rate** | < 20% | Percentage of inbox visits with no interaction (no click, no mark-read, no filter, no paginate) |
| **P50 list load time** | < 100ms | Median API response time for paginated list |
| **P99 list load time** | < 500ms | Tail latency |
| **Error rate** | < 0.1% | Percentage of list/mark-read requests returning 5xx |

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| `notification.inbox.page_load` | `INFO` | `user_id`, `page`, `per_page`, `filter`, `request_id` | On every inbox page fetch |
| `notification.inbox.page_load.response` | `INFO` | `user_id`, `page`, `per_page`, `result_count`, `total_count`, `latency_ms`, `request_id` | On successful response |
| `notification.inbox.page_load.error` | `ERROR` | `user_id`, `page`, `per_page`, `error_message`, `error_code`, `request_id` | On error response |
| `notification.inbox.page_load.slow` | `WARN` | `user_id`, `page`, `per_page`, `total_count`, `latency_ms`, `request_id` | When latency exceeds 500ms |
| `notification.inbox.mark_read` | `INFO` | `user_id`, `notification_id`, `trigger` ("explicit"/"navigate"), `request_id` | On mark-read request |
| `notification.inbox.mark_all_read` | `INFO` | `user_id`, `request_id` | On mark-all-read request |
| `notification.sse.connect` | `INFO` | `user_id`, `channel`, `has_last_event_id`, `replay_count`, `request_id` | On SSE stream open |
| `notification.sse.disconnect` | `INFO` | `user_id`, `channel`, `duration_seconds`, `request_id` | On SSE stream close |
| `notification.sse.replay` | `DEBUG` | `user_id`, `last_event_id`, `replay_count`, `request_id` | On Last-Event-ID replay |
| `notification.sse.keepalive_timeout` | `WARN` | `user_id`, `channel`, `last_keepalive_seconds_ago`, `request_id` | When client-side keep-alive timeout triggers reconnect |
| `notification.inbox.auth_fail` | `WARN` | `ip`, `user_agent`, `request_id` | On 401 responses |
| `notification.inbox.rate_limit` | `WARN` | `user_id`, `ip`, `endpoint`, `request_id` | On 429 responses |

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_notification_inbox_requests_total` | Counter | `endpoint` (list, mark_read, mark_all_read), `status` (2xx, 4xx, 5xx) | Total inbox-related requests by endpoint and status |
| `codeplane_notification_inbox_list_duration_seconds` | Histogram | `page_bucket` (1, 2-5, 6+) | List endpoint latency distribution. Buckets: 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5 |
| `codeplane_notification_inbox_list_result_count` | Histogram | — | Number of notifications returned per list response. Buckets: 0, 1, 5, 10, 20, 30, 50 |
| `codeplane_notification_inbox_total_count` | Histogram | — | Distribution of total notification counts per user. Buckets: 0, 10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000 |
| `codeplane_notification_sse_active_connections` | Gauge | — | Number of currently active SSE notification connections |
| `codeplane_notification_sse_connection_duration_seconds` | Histogram | — | Duration of SSE connections. Buckets: 10, 30, 60, 300, 600, 1800, 3600 |
| `codeplane_notification_sse_replay_count` | Histogram | — | Number of events replayed per reconnection. Buckets: 0, 1, 5, 10, 50, 100, 500, 1000 |
| `codeplane_notification_mark_read_total` | Counter | `trigger` (explicit, navigate, mark_all), `status` (success, error) | Mark-read operations by trigger and outcome |
| `codeplane_notification_unread_badge_count` | Histogram | — | Distribution of unread badge counts at inbox open. Buckets: 0, 1, 5, 10, 25, 50, 100, 500 |

### Alerts and Runbooks

#### Alert: `NotificationInboxHighErrorRate`
**Condition:** `rate(codeplane_notification_inbox_requests_total{status="5xx"}[5m]) / rate(codeplane_notification_inbox_requests_total[5m]) > 0.05`
**Severity:** Critical
**Summary:** More than 5% of inbox requests are failing with server errors.
**Runbook:**
1. Check `notification.inbox.page_load.error` logs for the last 10 minutes: `grep "notification.inbox.page_load.error" | jq '.error_message, .error_code'`.
2. Verify database connectivity: `SELECT 1 FROM notifications LIMIT 1`. If this times out, the database is unreachable — check PG connection pool health, active connection count (`pg_stat_activity`), and network connectivity.
3. Check for index presence: `SELECT * FROM pg_indexes WHERE tablename = 'notifications'`. Verify the `(user_id, created_at DESC)` index exists.
4. Check for table bloat: `SELECT reltuples, relpages, n_dead_tup FROM pg_stat_user_tables WHERE relname = 'notifications'`. If `n_dead_tup` is significantly high, run `VACUUM ANALYZE notifications`.
5. Check recent deployments for regressions in the notification service or route handler.
6. If concentrated on specific users, check if their notification count is abnormally large (>100K) and consider whether a background archival job is needed.
7. If issue persists after 15 minutes, escalate to the database team.

#### Alert: `NotificationInboxHighLatency`
**Condition:** `histogram_quantile(0.99, rate(codeplane_notification_inbox_list_duration_seconds_bucket[5m])) > 1.0`
**Severity:** Warning
**Summary:** P99 inbox list latency exceeds 1 second.
**Runbook:**
1. Check `notification.inbox.page_load.slow` log entries for the affected time window.
2. Identify whether latency is concentrated on specific users (high `total_count`) or systemic.
3. Run `EXPLAIN ANALYZE` for the `listNotificationsByUser` query with the affected user's ID to check for sequential scans.
4. Check database load metrics: CPU, I/O wait, connection pool utilization.
5. Check if autovacuum is keeping up: `SELECT last_autovacuum, n_dead_tup FROM pg_stat_user_tables WHERE relname = 'notifications'`.
6. If systemic, check for concurrent heavy operations (backup, migration, large fan-out events).
7. If isolated to high-volume users (>100K notifications), consider notification archival or partitioning by user_id.

#### Alert: `NotificationSSEConnectionPoolExhausted`
**Condition:** `codeplane_notification_sse_active_connections > 10000`
**Severity:** Warning
**Summary:** SSE connection count exceeds 10,000 — approaching resource limits.
**Runbook:**
1. Check for connection leaks: compare `codeplane_notification_sse_active_connections` with unique active user count. If connections >> users, there may be a client-side reconnection bug creating duplicate connections.
2. Check PostgreSQL `pg_stat_activity` for LISTEN channel subscriptions — the SSE manager deduplicates per channel, but verify.
3. Check server memory usage — each SSE connection holds a ReadableStream.
4. If connections are legitimate (many concurrent users), consider horizontal scaling or connection pooling at the load balancer level.
5. If a client bug is suspected, check browser DevTools network tab for multiple SSE connections from a single page.

#### Alert: `NotificationMarkAllReadLatency`
**Condition:** `histogram_quantile(0.95, rate(codeplane_notification_inbox_list_duration_seconds_bucket{endpoint="mark_all_read"}[5m])) > 2.0`
**Severity:** Warning
**Summary:** Mark-all-read operations are taking more than 2 seconds at p95.
**Runbook:**
1. Check the `markAllNotificationsRead` SQL execution time. This is an `UPDATE ... WHERE user_id = $1 AND status = 'unread'` — it can be slow if a user has many unread notifications.
2. Check for lock contention: `SELECT * FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%notifications%'`.
3. Identify the users triggering slow mark-all-read operations and check their unread count.
4. Consider batching the update if users routinely have >10,000 unread notifications.
5. Verify the `(user_id, status)` index is present for efficient UPDATE filtering.

#### Alert: `NotificationInboxAuthFailureSpike`
**Condition:** `rate(codeplane_notification_inbox_requests_total{status="4xx"}[5m]) > 100`
**Severity:** Info
**Summary:** Elevated 4xx errors on inbox endpoints — possible credential expiry wave or abuse.
**Runbook:**
1. Check `notification.inbox.auth_fail` log entries for source IPs and user agents.
2. If concentrated on a single IP: likely bot or credential-stuffing attempt. Verify rate limiting is engaging.
3. If distributed across many IPs with similar user agents: likely a client deployment that broke authentication (expired tokens, cookie format change). Escalate to the client team.
4. Cross-reference with auth service logs for session/token validation failures.
5. If correlated with a recent deployment, consider rollback.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Client Behavior | Recovery |
|------------|-------------|-----------------|----------|
| Unauthenticated request | 401 | Redirect to login page | Re-authenticate |
| Invalid pagination parameters | 400 | Show current page with error toast | Fix query parameters |
| Rate limit exceeded | 429 | Toast: "Too many requests. Please wait." | Wait for `Retry-After` duration |
| Database connection failure | 500 | Inline error banner with retry button | Automatic retry; alert fires |
| Database query timeout | 500 | Inline error banner with retry button | Retry; investigate bloat/indexes |
| SSE connection failure | — (client) | Reconnect with exponential backoff; show "Reconnecting…" indicator | Automatic |
| SSE auth ticket expired | 401 (on SSE) | Request new ticket, reconnect | Automatic |
| Source resource deleted (null source_id) | — (client) | Toast: "The original item is no longer available" | No recovery needed |
| Mark-read API failure | 500 | Revert optimistic update; show error toast | Retry |
| Mark-all-read API failure | 500 | No visual state change; show error toast | Retry |
| Notification with missing enriched fields | — (client) | Row displayed without clickable link; tooltip explains | No recovery needed |
| Network offline | — (client) | SSE disconnects; page fetches fail with error banner; retry on network restore | Automatic on reconnect |

## Verification

### API Integration Tests

| # | Test Name | Description | Expected |
|---|-----------|-------------|----------|
| 1 | `GET /api/notifications/list returns 401 when unauthenticated` | No session/token | 401 |
| 2 | `GET /api/notifications/list returns empty array for new user` | Auth'd user, zero notifications | `[]`, `X-Total-Count: 0` |
| 3 | `GET /api/notifications/list returns notifications newest-first` | Seed 5 at staggered times | Descending `created_at` |
| 4 | `GET /api/notifications/list respects default pagination (30)` | Seed 35 | 30 items, `X-Total-Count: 35` |
| 5 | `GET /api/notifications/list respects per_page=10` | Seed 35, `per_page=10` | 10 items |
| 6 | `GET /api/notifications/list respects page=2` | Seed 35, `page=2&per_page=30` | 5 items |
| 7 | `GET /api/notifications/list caps per_page at 50` | `per_page=100`, seed 60 | 50 items |
| 8 | `GET /api/notifications/list normalizes page=0 to page=1` | `page=0` | Same as `page=1` |
| 9 | `GET /api/notifications/list returns empty for page beyond last` | Seed 10, `page=2&per_page=30` | `[]`, `X-Total-Count: 10` |
| 10 | `GET /api/notifications/list includes X-Total-Count header` | Any valid request | Header present, valid integer |
| 11 | `GET /api/notifications/list returns correct notification shape` | Seed 1 | All fields present and correctly typed |
| 12 | `GET /api/notifications/list scopes to authenticated user` | Seed for users A and B | A sees only A's |
| 13 | `GET /api/notifications/list handles null source_id` | Seed with `source_id: null` | Serializes as `null` |
| 14 | `GET /api/notifications/list reflects read/unread status` | Seed mix | Correct `status` and `read_at` |
| 15 | `GET /api/notifications/list per_page=50 returns 50 items` | Seed 60, `per_page=50` | 50 items |
| 16 | `GET /api/notifications/list per_page=1 (minimum)` | Seed 5, `per_page=1` | 1 item |
| 17 | `GET /api/notifications/list rejects non-integer per_page` | `per_page=abc` | 400 or normalized |
| 18 | `GET /api/notifications/list rejects non-integer page` | `page=xyz` | 400 or normalized |
| 19 | `GET /api/notifications/list works with PAT auth` | Bearer token | 200 |
| 20 | `GET /api/notifications/list returns 429 on rate limit` | Exceed limit | 429 + `Retry-After` |
| 21 | `GET /api/notifications/list handles 10,000 notifications` | Seed 10K | Page 1 in <500ms, correct count |
| 22 | `GET /api/notifications/list boundary: exactly per_page items` | Seed 30, `per_page=30` | 30 items; page 2 returns `[]` |
| 23 | `GET /api/notifications/list all source_types represented` | Seed 1 per type | All 7 types returned |
| 24 | `GET /api/notifications/list subject at max length 255` | 255-char subject | Returns without truncation |
| 25 | `PATCH /api/notifications/:id marks unread as read` | Unread notification | 204; subsequent list shows `status: "read"` |
| 26 | `PATCH /api/notifications/:id is idempotent on already-read` | Read notification | 204; `read_at` unchanged |
| 27 | `PATCH /api/notifications/:id with invalid ID returns 400` | `id=0` | 400 |
| 28 | `PATCH /api/notifications/:id with non-existent ID returns 204` | `id=99999999` | 204 (silent no-op) |
| 29 | `PATCH /api/notifications/:id for another user's notification returns 204` | Cross-user | 204, not modified |
| 30 | `PATCH /api/notifications/:id without auth returns 401` | No token | 401 |
| 31 | `PUT /api/notifications/mark-read marks all unread as read` | Seed 5 unread | 204; all now read |
| 32 | `PUT /api/notifications/mark-read is idempotent when all already read` | All read | 204 |
| 33 | `PUT /api/notifications/mark-read without auth returns 401` | No token | 401 |
| 34 | `SSE /api/notifications streams new notifications` | Connect SSE, create notification | Receives event with correct data |
| 35 | `SSE /api/notifications replays via Last-Event-ID` | Seed 5, connect with Last-Event-ID=2 | Receives events 3-5 |
| 36 | `SSE /api/notifications without auth returns 401` | No token | 401 |
| 37 | `SSE /api/notifications sends keep-alive comments` | Connect and wait 20s | Receives `:` comment line |
| 38 | `PATCH /api/notifications/:id with max bigint (9223372036854775807) returns 204` | Max valid bigint | 204 (no crash) |
| 39 | `PATCH /api/notifications/:id with bigint+1 (9223372036854775808) returns 400` | Exceeds bigint | 400 |
| 40 | `PATCH /api/notifications/1.5 returns 400` | Float ID | 400 |
| 41 | `GET /api/notifications/list with negative per_page normalizes to default` | `per_page=-1` | Returns 30 items (default) |
| 42 | `Concurrent PATCH on same notification (10 parallel) all return 204` | 10 parallel requests | All 204, no 5xx |

### CLI E2E Tests

| # | Test Name | Description | Expected |
|---|-----------|-------------|----------|
| 43 | `codeplane notification list requires auth` | No token | Exit ≠ 0 |
| 44 | `codeplane notification list shows notifications` | Auth'd with seeded data | Exit 0, formatted output |
| 45 | `codeplane notification list --page 2 paginates` | Seed > 30 | Correct page 2 items |
| 46 | `codeplane notification list --limit 5 respects limit` | Seed > 5 | Exactly 5 rows |
| 47 | `codeplane notification list --limit 100 caps at 50` | Seed > 50 | ≤ 50 items |
| 48 | `codeplane notification list --unread filters` | Mix read/unread | Only unread shown |
| 49 | `codeplane notification list --json outputs valid JSON` | Auth'd | Parseable JSON array |
| 50 | `codeplane notification list shows empty state` | No notifications | "No notifications." message |
| 51 | `codeplane notification read <id> marks as read` | Valid unread ID | Exit 0 |
| 52 | `codeplane notification read 0 rejects zero ID` | ID = 0 | Exit ≠ 0 |
| 53 | `codeplane notification read requires auth` | No token | Exit ≠ 0 |
| 54 | `codeplane notification read --all marks all as read` | Auth'd | Exit 0 |
| 55 | `codeplane notification read without ID or --all errors` | No args | Exit ≠ 0, guidance message |

### Playwright (Web UI) E2E Tests

| # | Test Name | Description | Expected |
|---|-----------|-------------|----------|
| 56 | `Inbox page loads at /inbox for authenticated user` | Navigate to `/inbox` | "Notifications" heading visible, notification rows render |
| 57 | `Inbox page redirects unauthenticated user to login` | Navigate to `/inbox` without auth | Redirects to `/login` |
| 58 | `Inbox page shows empty state for new user` | User with zero notifications | "No notifications yet" message visible |
| 59 | `Inbox page shows unread count in header badge` | Seed 5 unread | Badge shows "5" |
| 60 | `Inbox page header badge hidden when zero unread` | All read | No badge visible |
| 61 | `Inbox page header badge shows "99+" for >99 unread` | Seed 100 unread | Badge text is "99+" |
| 62 | `Inbox page renders unread notifications with blue dot and bold text` | Seed unread | Blue dot visible, subject is bold |
| 63 | `Inbox page renders read notifications without dot and normal weight` | Seed read | No dot, normal weight |
| 64 | `Inbox page displays correct source type icon per type` | Seed 1 per type | Each has correct icon |
| 65 | `Inbox page shows body preview truncated to 120 chars` | Seed with long body | Ellipsis after ~120 chars |
| 66 | `Inbox page hides body preview when body is empty` | Seed with empty body | No blank space |
| 67 | `Inbox page shows relative timestamps` | Seed 1h ago | "1h ago" text |
| 68 | `Inbox page shows full timestamp on hover` | Hover timestamp | Tooltip with ISO datetime |
| 69 | `Inbox page pagination: default 30 items` | Seed 35 | 30 items on page 1 |
| 70 | `Inbox page pagination: Next button loads page 2` | Seed 35, click Next | 5 items on page 2 |
| 71 | `Inbox page pagination: Previous returns to page 1` | Go to page 2, click Previous | 30 items on page 1 |
| 72 | `Inbox page pagination: shows "Page X of Y"` | Seed 35 | "Page 1 of 2" |
| 73 | `Inbox page pagination: Next disabled on last page` | Navigate to last page | Next button disabled |
| 74 | `Inbox page pagination: Previous disabled on page 1` | Page 1 | Previous button disabled |
| 75 | `Inbox page filter: Unread toggle shows only unread` | Seed mix, click Unread | Only unread rows visible |
| 76 | `Inbox page filter: switching to Unread resets to page 1` | On page 2, click Unread | Back to page 1 |
| 77 | `Inbox page filter: All toggle shows all notifications` | Click All after Unread | All rows visible |
| 78 | `Inbox page filter: empty state when no unread` | All read, click Unread | "No unread notifications" message |
| 79 | `Clicking notification navigates to source (issue)` | Seed issue notification, click | Navigates to issue page |
| 80 | `Clicking notification navigates to source (landing request)` | Seed LR notification, click | Navigates to LR page |
| 81 | `Clicking notification navigates to source (workflow run)` | Seed workflow_run, click | Navigates to workflow run page |
| 82 | `Clicking notification navigates to source (workspace)` | Seed workspace, click | Navigates to workspace page |
| 83 | `Clicking notification auto-marks it as read` | Click unread notification, return to inbox | Notification now read |
| 84 | `Clicking already-read notification does not fire mark-read API` | Intercept network, click read notification | No PATCH request |
| 85 | `Notification with null source_id shows toast on click` | Seed with source_id: null, click | Toast: "The original item is no longer available" |
| 86 | `Mark-read control on unread notification updates row styling` | Click mark-read icon | Dot disappears, bold removed |
| 87 | `Mark-read control updates header badge count` | Click mark-read on 1 of 5 unread | Badge shows "4" |
| 88 | `Mark-read control: optimistic revert on API failure` | Intercept PATCH to return 500, click mark-read | Dot returns, error toast |
| 89 | `Mark-read control hidden on already-read notifications` | Read notification row | No mark-read control visible |
| 90 | `Mark all as read button clears all unread indicators` | Seed 5 unread, click "Mark all as read" | All dots gone, badge 0 |
| 91 | `Mark all as read button disabled when zero unread` | All read | Button disabled |
| 92 | `Mark all as read button shows spinner during request` | Click, observe during request | Spinner visible, button disabled |
| 93 | `Mark all as read: error shows toast, no state change` | Intercept PUT to return 500 | Toast error, dots remain |
| 94 | `Loading skeleton shown during initial fetch` | Intercept API with delay | Skeleton rows visible |
| 95 | `Error state shows retry button on fetch failure` | Intercept API to return 500 | "Failed to load" banner + retry button |
| 96 | `Retry button successfully loads notifications` | Fail first, succeed second | Notifications appear after retry |
| 97 | `Responsive: body preview hidden at <640px` | Set viewport 375px | Body preview not visible |
| 98 | `Responsive: full layout at >1024px` | Set viewport 1280px | All columns visible |
| 99 | `Keyboard: Tab navigates to notification rows` | Tab through page | Focus ring visible on rows |
| 100 | `Keyboard: Enter on notification row navigates` | Tab to row, press Enter | Navigation occurs |
| 101 | `Keyboard: Enter on mark-read control marks read` | Tab to mark-read, press Enter | Notification marked read |
| 102 | `Bell icon in header navigates to /inbox on click` | Click bell icon | `/inbox` page loads |
| 103 | `Subject with 255 chars renders without overflow` | Seed 255-char subject | No layout breakage |
| 104 | `Non-ASCII characters in subject/body render correctly` | Seed with emoji + CJK | Renders correctly |
| 105 | `SSE: new notification appears on page 1 in real time` | Open inbox, trigger fan-out event | New row prepends with highlight |
| 106 | `SSE: unread badge updates when notification arrives on non-inbox page` | On different page, trigger event | Badge increments |
| 107 | `SSE: reconnection indicator shown on disconnect` | Kill SSE connection | "Reconnecting…" text visible |
| 108 | `SSE: deduplication prevents duplicate rows on replay` | Connect with Last-Event-ID, verify no duplicates | Unique IDs only |
| 109 | `Inbox URL reflects page and filter state` | Navigate to page 2, filter Unread | URL contains `?page=2&filter=unread` |
| 110 | `Direct URL /inbox?page=2 loads correct page` | Navigate directly | Page 2 content |

### Cross-Client Consistency Tests

| # | Test Name | Description | Expected |
|---|-----------|-------------|----------|
| 111 | `Mark read via CLI → web inbox reflects change` | CLI `notification read <id>`, then check web | Read styling in web |
| 112 | `Mark read via web → CLI list reflects change` | Web mark-read, then CLI list | `status: "read"` in CLI output |
| 113 | `Mark all read via web → CLI shows all read` | Web mark-all, then CLI `list --unread` | Empty list |
| 114 | `New notification via API → appears in web inbox via SSE` | Create notification directly, observe web | Row appears in real time |

### Load & Boundary Tests

| # | Test Name | Description | Expected |
|---|-----------|-------------|----------|
| 115 | `User with 10,000 notifications: page 1 loads in <500ms` | Seed 10K, time page 1 | Latency < 500ms |
| 116 | `User with 100,000 notifications: page 1 loads in <500ms` | Seed 100K, time page 1 | Latency < 500ms |
| 117 | `per_page=50 with 60 notifications returns exactly 50` | Seed 60, `per_page=50` | 50 items |
| 118 | `Rate limit: 121st list request in 1 minute returns 429` | Fire 121 requests | 429 on 121st |
| 119 | `Rate limit: 61st mark-read in 1 minute returns 429` | Fire 61 PATCH requests | 429 on 61st |
| 120 | `Concurrent mark-read and mark-all-read produce consistent state` | Fire PATCH and PUT simultaneously | All notifications read, no errors |
