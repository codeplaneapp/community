# USER_ACTIVITY_FEED_OR_HEATMAP_VIEW

Specification for USER_ACTIVITY_FEED_OR_HEATMAP_VIEW.

## High-Level User POV

When you visit any user's profile page on Codeplane, you see a living picture of what that person has been working on. At the top of the profile — right below the user's avatar, display name, and bio — sits a contribution heatmap: a year-long calendar grid of colored squares that shows how active the user has been across all of their public repositories. Darker squares mean more activity on that day; empty squares mean no recorded public activity. You can hover over any square to see the exact count and date. The heatmap immediately conveys whether someone is an active contributor, what their work cadence looks like, and when their busiest periods are.

Below the heatmap, a chronological activity feed shows what the user has actually been doing. Each entry in the feed is a human-readable sentence — "created repository acme/widgets", "forked repository org/tool", "archived repository old-project" — with a timestamp showing when it happened. The feed scrolls infinitely or paginates so you can go as far back as the user's history allows. You can filter the feed by activity type — repository creation, forks, archives, transfers, and more — so you can zero in on the kind of work you care about.

If you are viewing your own profile, you see the same heatmap and feed that everyone else sees: it reflects your public activity. Private repository actions never appear in anyone's activity feed or heatmap. This ensures that the feature is safe to display on public profiles without leaking information about non-public work.

The activity feed and heatmap are also accessible from the CLI, where you can query a user's recent activity as a structured list, and from the TUI, where a dedicated screen shows the same feed in a terminal-friendly format. The heatmap visual is web-only, but the underlying activity data is available everywhere.

This feature helps jj-native developers showcase their work, helps teams evaluate contributors, and helps administrators understand usage patterns — all without leaving Codeplane.

## Acceptance Criteria

- **Activity feed displays public-only events**: The activity feed and heatmap must only include actions performed on public repositories. Actions on private repositories must never appear in the feed, the heatmap counts, or the API response — regardless of who is viewing the profile.
- **Heatmap covers a rolling 12-month window**: The heatmap must display exactly 365 days of activity (366 in leap years), ending on the current date, starting from the same date one year prior.
- **Heatmap squares are date-bucketed**: Each square represents one calendar day in UTC. The count for each square is the number of distinct public activity events on that day.
- **Heatmap color scale has 5 levels**: No activity (empty/level 0), low (level 1, 1–3 events), moderate (level 2, 4–7 events), high (level 3, 8–14 events), very high (level 4, 15+ events). Thresholds must be configurable per-instance via server configuration, but these are the defaults.
- **Hover tooltip shows date and count**: Hovering over a heatmap cell must display a tooltip reading "{count} contributions on {date}" using the format "N contributions on Mon DD, YYYY" (e.g., "5 contributions on Jan 15, 2026").
- **Heatmap handles zero-activity users gracefully**: If a user has no public activity in the past year, the heatmap must still render with all cells at level 0. No error state or empty placeholder should replace it.
- **Activity feed supports pagination**: The feed must support page/per_page pagination (default page=1, default per_page=30, max per_page=100). Requests for per_page > 100 must be capped to 100 (not rejected).
- **Activity feed supports cursor-based pagination**: The feed must also support cursor/limit pagination as an alternative to page/per_page, consistent with other Codeplane list endpoints.
- **Activity feed supports type filtering**: An optional `type` query parameter must allow filtering to a single event type (e.g., `repo.create`, `repo.fork`). Invalid type values must return an empty list, not an error.
- **Activity feed entries have stable IDs**: Each activity entry must have a stable numeric `id` field that does not change across requests.
- **Activity feed entries include human-readable summaries**: Each entry must include a `summary` field containing a human-readable English sentence describing the action (e.g., "created repository acme/widgets").
- **Activity feed entries include structured fields**: Each entry must include `id`, `event_type`, `action`, `actor_username`, `target_type`, `target_name`, `summary`, and `created_at` (ISO 8601).
- **Activity heatmap data endpoint returns day-bucketed counts**: A dedicated heatmap data endpoint must return an array of `{date, count, level}` objects for the trailing 12-month window.
- **The heatmap endpoint accepts an optional `from` parameter**: Callers may pass `from` (ISO 8601 date string) to shift the heatmap window start. If omitted, defaults to 12 months before today.
- **404 for nonexistent users**: Both the activity feed and heatmap endpoints must return 404 with `{"message": "user not found"}` when the username does not exist.
- **Empty username returns 400**: A blank or whitespace-only username must return 400 with `{"message": "username is required"}`.
- **Username matching is case-insensitive**: `GET /api/users/Alice/activity` and `GET /api/users/alice/activity` must return the same results.
- **Maximum supported history depth is 3 years**: The `from` parameter for the heatmap must not accept dates more than 3 years in the past. Requests older than 3 years must clamp to 3 years ago.
- **Total contribution count is returned**: Both the heatmap and activity feed responses must include a `total_count` field reflecting the total number of matching activities (not just the current page).
- **No PII leakage**: IP addresses, email addresses, and private metadata from the audit log must never be exposed in the activity feed or heatmap API responses.

### Definition of Done

- The activity feed API endpoint returns real data (not a 501 stub).
- The heatmap data API endpoint exists and returns day-bucketed counts.
- The web UI renders the heatmap on the user profile page.
- The web UI renders the paginated activity feed below the heatmap.
- The CLI `codeplane user activity <username>` command prints the feed.
- The TUI includes an activity tab or screen on the user profile view.
- All acceptance criteria pass via automated integration and E2E tests.
- Private repository events are verified to be excluded in tests.

## Design

### Web UI Design

#### Heatmap Component

The contribution heatmap is positioned directly below the user profile header (avatar, display name, bio, member-since date) and above the activity feed. It spans the full width of the profile content area.

**Layout**: The heatmap renders as a grid of 53 columns (weeks) × 7 rows (days, Monday at top, Sunday at bottom). Each cell is a small rounded square (approximately 11×11 pixels with 2px gap). Columns are ordered left-to-right from oldest to newest week. Month labels ("Jan", "Feb", etc.) appear above the first week of each month. Day-of-week labels ("Mon", "Wed", "Fri") appear on the left axis.

**Color scale**: The heatmap uses 5 discrete color levels:
- Level 0 (no activity): `#161b22` (dark theme) / `#ebedf0` (light theme)
- Level 1 (1–3): `#0e4429` / `#9be9a8`
- Level 2 (4–7): `#006d32` / `#40c463`
- Level 3 (8–14): `#26a641` / `#30a14e`
- Level 4 (15+): `#39d353` / `#216e39`

**Tooltip**: On hover, a tooltip displays: "{count} contributions on {Mon DD, YYYY}". On mobile/touch, tap-to-reveal replaces hover.

**Summary line**: Below the heatmap: "{N} contributions in the last year".

**Responsive behavior**: On viewports narrower than 768px, the heatmap scrolls horizontally. On viewports narrower than 480px, the heatmap may be collapsed behind a "Show contribution activity" toggle.

#### Activity Feed Component

Below the heatmap, the activity feed renders as a vertical timeline.

**Entry layout**: Each entry shows an icon for the event type, the human-readable summary text, a relative timestamp ("2 hours ago") with full ISO on hover, and the target repository name as a clickable link.

**Filtering**: Above the feed, a dropdown allows filtering by event type. Options: "All activity", "Repositories created", "Repositories forked", "Repositories archived", "Repositories transferred", "Other". The active filter is reflected in the URL as `?type=repo.create` for deep-linking.

**Pagination**: "Load more" button at the bottom appends next page results. Hidden when all entries loaded.

**Empty state**: "No public activity to show." with a muted icon.

#### Profile Page Integration

The heatmap and feed live on the `/:owner` profile page under an "Overview" tab. Tab bar: "Overview" | "Repositories" | "Starred". Overview is selected by default.

### API Shape

#### `GET /api/users/:username/activity`

**Query parameters**: `page` (int, default 1), `per_page` (int, default 30, max 100), `cursor` (string, alt to page), `limit` (int, with cursor, default 30, max 100), `type` (string, optional event type filter).

**Response (200)**:
```json
{
  "items": [
    {
      "id": 42,
      "event_type": "repo.create",
      "action": "create",
      "actor_username": "alice",
      "target_type": "repository",
      "target_name": "alice/my-project",
      "summary": "created repository alice/my-project",
      "created_at": "2026-03-20T14:30:00Z"
    }
  ],
  "total_count": 128,
  "page": 1,
  "per_page": 30
}
```

**Errors**: 400 (blank username, invalid pagination), 404 (user not found).

#### `GET /api/users/:username/heatmap`

**Query parameters**: `from` (ISO 8601 date, optional, default 12 months ago, max 3 years ago).

**Response (200)**:
```json
{
  "contributions": [
    { "date": "2025-03-21", "count": 5, "level": 2 }
  ],
  "total_count": 847,
  "start_date": "2025-03-21",
  "end_date": "2026-03-21"
}
```

Contributions array has one entry per day (ascending order), including zero-activity days.

**Errors**: 400 (blank username, invalid date), 404 (user not found).

### SDK Shape

`UserService` exposes:
- `listUserActivityByUsername(username, page, perPage, type?)` — wired up from the existing stub.
- `getUserHeatmapByUsername(username, from?)` — new method returning `HeatmapResult`.

New types: `HeatmapDay { date: string; count: number; level: number; }`, `HeatmapResult { contributions: HeatmapDay[]; total_count: number; start_date: string; end_date: string; }`.

### CLI Command

`codeplane user activity <username>` with flags: `--type`, `--page`, `--per-page`, `--json`.

`codeplane user heatmap <username>` with flags: `--from`, `--json`. Text output uses Unicode block characters for a per-month bar chart.

### TUI UI

Activity screen accessible from user/dashboard navigation. Shows summary line, scrollable activity list with `[event_type] summary — relative_time` format, type filter dropdown, and pagination keybindings. Monthly bar chart replaces pixel-level heatmap.

### Neovim Plugin API

`:Codeplane user activity [username]` opens a floating window with the activity feed. Entries use syntax highlighting for event types.

### Documentation

- **User Guide: "Your Profile and Contribution Activity"** — what the heatmap shows, how levels are calculated, public-only scope.
- **CLI Reference: `user activity`** — command, flags, output format, examples.
- **CLI Reference: `user heatmap`** — command, flags, output format, examples.
- **API Reference: `GET /api/users/:username/activity`** — request/response shapes, pagination, errors.
- **API Reference: `GET /api/users/:username/heatmap`** — request/response shapes, parameters, errors.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Member | Admin | Owner |
|--------|-----------|-----------|--------|-------|-------|
| View any user's activity feed | Yes | Yes | Yes | Yes | Yes |
| View any user's heatmap | Yes | Yes | Yes | Yes | Yes |

The activity feed and heatmap are public-facing features. They only surface actions taken on public repositories, so there is no access control beyond the public/private repository boundary already enforced in the underlying audit log query (`r.is_public = TRUE`).

### Rate Limiting

- **Anonymous callers**: 60 requests per minute per IP to activity/heatmap endpoints.
- **Authenticated callers**: 300 requests per minute per user to activity/heatmap endpoints.
- **Heatmap endpoint specifically**: Additional per-user cooldown of 1 request per 10 seconds when `from` spans more than 13 months.
- Rate limit responses return `429 Too Many Requests` with `Retry-After` header.

### Data Privacy

- **IP addresses**: Stored in audit log but NEVER exposed in API responses.
- **Metadata**: Stored in audit log but NOT included in API responses.
- **Email addresses**: Never part of the activity feed; only `actor_username` is exposed.
- **Private repository actions**: Filtered by `r.is_public = TRUE` and `al.target_type = 'repository'` and `al.event_type LIKE 'repo.%'`. Must be validated by integration tests.
- **Actor ID**: Numeric `actor_id` from audit log must not be exposed; only `actor_username` is returned.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|------------|-----------|------------|
| `UserActivityFeedViewed` | User views the activity feed (web, TUI) | `viewer_user_id` (nullable for anon), `profile_username`, `filter_type` (nullable), `page`, `entry_count`, `client` ("web", "tui", "cli") |
| `UserHeatmapViewed` | User views the heatmap (web) | `viewer_user_id` (nullable), `profile_username`, `total_contributions`, `window_days`, `client` |
| `UserActivityFeedFiltered` | User applies a type filter | `viewer_user_id`, `profile_username`, `filter_type`, `result_count` |
| `UserActivityFeedPaginated` | User loads next page | `viewer_user_id`, `profile_username`, `page`, `entry_count` |
| `UserHeatmapDayInspected` | User hovers/taps a heatmap cell | `viewer_user_id`, `profile_username`, `inspected_date`, `contribution_count` |
| `UserActivityAPIRequested` | Any API call to activity/heatmap | `caller_user_id` (nullable), `target_username`, `endpoint`, `status_code`, `response_time_ms` |

### Funnel Metrics & Success Indicators

- **Adoption**: % of profile page views that include a heatmap render (target: >90%).
- **Engagement depth**: Average activity feed pages viewed per profile visit (target: >1.3).
- **Filter usage rate**: % of feed views that include a type filter.
- **Heatmap interaction rate**: % of heatmap views with at least one cell hovered/tapped (target: >25%).
- **API error rate**: % of activity/heatmap requests returning 4xx/5xx (target: <1% excluding 404s).
- **Latency P95**: 95th percentile heatmap endpoint response time (target: <500ms).

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|-------------------|
| Activity feed request received | `DEBUG` | `username`, `page`, `per_page`, `type_filter`, `request_id` |
| Activity feed response sent | `INFO` | `username`, `item_count`, `total_count`, `response_time_ms`, `request_id` |
| Heatmap request received | `DEBUG` | `username`, `from_date`, `request_id` |
| Heatmap response sent | `INFO` | `username`, `day_count`, `total_contributions`, `response_time_ms`, `request_id` |
| User not found for activity/heatmap | `WARN` | `username`, `endpoint`, `request_id` |
| Heatmap query slow (>1s) | `WARN` | `username`, `from_date`, `query_time_ms`, `request_id` |
| Heatmap query failed | `ERROR` | `username`, `from_date`, `error_message`, `request_id` |
| Activity feed query failed | `ERROR` | `username`, `page`, `error_message`, `request_id` |
| Rate limit exceeded | `WARN` | `caller_ip`, `caller_user_id`, `endpoint`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_user_activity_requests_total` | Counter | `endpoint`, `status` | Total requests to activity endpoints |
| `codeplane_user_activity_request_duration_seconds` | Histogram | `endpoint` | Request latency (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_user_activity_items_returned` | Histogram | `endpoint` | Items per response (buckets: 0, 1, 5, 10, 25, 50, 100) |
| `codeplane_user_heatmap_query_duration_seconds` | Histogram | — | Heatmap aggregation query latency |
| `codeplane_user_heatmap_total_contributions` | Histogram | — | Total contributions per response (buckets: 0, 10, 50, 100, 500, 1000, 5000) |
| `codeplane_user_activity_rate_limited_total` | Counter | `endpoint` | Rate-limited request count |
| `codeplane_user_activity_errors_total` | Counter | `endpoint`, `error_type` | Errors by type |

### Alerts

#### Alert: `UserActivityHeatmapHighLatency`
- **Condition**: `codeplane_user_heatmap_query_duration_seconds` P95 > 2.0s for 5 minutes.
- **Severity**: Warning
- **Runbook**: (1) Check database load and active connections. (2) Inspect slow query log for `listPublicAuditLogsByActor` pattern. (3) Verify `audit_log(actor_id, created_at)` index exists. (4) Check if a user has >100k entries; consider materialized cache. (5) Verify `deleteAuditLogsOlderThan` cleanup is running.

#### Alert: `UserActivityEndpointErrorRate`
- **Condition**: Error rate > 5% for 5 minutes.
- **Severity**: Critical
- **Runbook**: (1) Check `error_type` breakdown. (2) For `db_error`: check DB connectivity and `audit_log` table health. (3) For `timeout`: check DB load, inspect `pg_stat_activity`. (4) For `validation`: review recent deploys for parsing regressions. (5) Consider rollback if correlated with deploy.

#### Alert: `UserActivityRateLimitSpike`
- **Condition**: Rate-limited requests > 50/5min.
- **Severity**: Warning
- **Runbook**: (1) Identify top source IPs/users. (2) Determine legitimate vs abusive traffic. (3) Allowlist legitimate callers or blocklist abusive IPs.

#### Alert: `UserActivityFeedStaleData`
- **Condition**: No new `audit_log` entries for any actor in 1 hour during business hours.
- **Severity**: Warning
- **Runbook**: (1) Verify audit log insertion by creating a test repo. (2) Check service registry for audit logger. (3) Review recent deploys. (4) Verify cleanup job cutoff date.

### Error Cases

| Error Case | Behavior | Recovery |
|------------|----------|----------|
| DB connection failure | 500 generic error | Auto-reconnect via pool |
| Audit log table missing | 500 with logged error | Manual DB investigation |
| User >1M audit entries | Slow response | Materialized cache |
| Invalid `from` format | 400 descriptive error | Client fix |
| `from` in future | Clamp to today | Automatic |
| `from` >3 years ago | Clamp to 3 years | Automatic |
| High concurrent requests | Rate limiting | Automatic |

## Verification

### API Integration Tests

#### Activity Feed Endpoint

- `test: GET /api/users/:username/activity returns 200 with activity items for a user with public repo events`
- `test: GET /api/users/:username/activity returns empty items array for a user with no activity`
- `test: GET /api/users/:username/activity returns 404 for nonexistent username`
- `test: GET /api/users/:username/activity returns 400 for blank username`
- `test: GET /api/users/:username/activity is case-insensitive`
- `test: GET /api/users/:username/activity excludes private repo events`
- `test: GET /api/users/:username/activity respects page and per_page defaults`
- `test: GET /api/users/:username/activity paginates correctly with page=2 per_page=5`
- `test: GET /api/users/:username/activity caps per_page at 100`
- `test: GET /api/users/:username/activity with per_page=1 returns exactly 1 item`
- `test: GET /api/users/:username/activity with per_page=100 returns up to 100 items (maximum valid size)`
- `test: GET /api/users/:username/activity with per_page=101 is capped to 100 (over maximum)`
- `test: GET /api/users/:username/activity with type=repo.create filters correctly`
- `test: GET /api/users/:username/activity with type=repo.fork filters correctly`
- `test: GET /api/users/:username/activity with type=invalid.type returns empty items`
- `test: GET /api/users/:username/activity does not expose ip_address field`
- `test: GET /api/users/:username/activity does not expose metadata field`
- `test: GET /api/users/:username/activity does not expose actor_id field`
- `test: GET /api/users/:username/activity returns items in descending chronological order`
- `test: GET /api/users/:username/activity total_count reflects total matching events, not page size`
- `test: GET /api/users/:username/activity supports cursor-based pagination`
- `test: GET /api/users/:username/activity returns correct Link headers for cursor pagination`

#### Heatmap Endpoint

- `test: GET /api/users/:username/heatmap returns 200 with day-bucketed contributions`
- `test: GET /api/users/:username/heatmap returns 365 or 366 entries for default window`
- `test: GET /api/users/:username/heatmap contributions are in ascending date order`
- `test: GET /api/users/:username/heatmap includes days with zero activity at level 0`
- `test: GET /api/users/:username/heatmap level thresholds are correct (0→0, 1→1, 4→2, 8→3, 15→4)`
- `test: GET /api/users/:username/heatmap excludes private repo events`
- `test: GET /api/users/:username/heatmap returns 404 for nonexistent user`
- `test: GET /api/users/:username/heatmap returns 400 for blank username`
- `test: GET /api/users/:username/heatmap with from parameter shifts window`
- `test: GET /api/users/:username/heatmap clamps from to 3 years ago maximum`
- `test: GET /api/users/:username/heatmap with from in the future clamps to today`
- `test: GET /api/users/:username/heatmap with invalid from date returns 400`
- `test: GET /api/users/:username/heatmap total_count matches sum of all day counts`
- `test: GET /api/users/:username/heatmap for user with zero activity returns all-zero contributions`

#### Rate Limiting

- `test: activity endpoint rate limits anonymous callers at 60/min`
- `test: activity endpoint rate limits authenticated callers at 300/min`
- `test: 429 response includes Retry-After header`

### Playwright (Web UI) E2E Tests

- `test: heatmap renders on user profile overview tab`
- `test: heatmap shows correct number of cells (approximately 365)`
- `test: heatmap tooltip appears on cell hover`
- `test: heatmap summary line shows total contributions`
- `test: activity feed renders below heatmap`
- `test: activity feed entry shows event icon, summary, and relative timestamp`
- `test: activity feed entry links to target repository`
- `test: activity feed filter dropdown changes displayed events`
- `test: activity feed filter is reflected in URL query parameter`
- `test: activity feed "Load more" button loads next page`
- `test: activity feed "Load more" button disappears when all entries loaded`
- `test: activity feed shows empty state for user with no activity`
- `test: heatmap renders on mobile viewport with horizontal scroll`
- `test: profile page overview tab is selected by default`
- `test: switching to Repositories tab hides heatmap`
- `test: heatmap renders for user with no activity (all level-0 cells)`

### CLI E2E Tests

- `test: codeplane user activity <username> prints formatted activity list`
- `test: codeplane user activity <username> --json outputs valid JSON matching ActivityListResult schema`
- `test: codeplane user activity <username> --type repo.create filters events`
- `test: codeplane user activity <username> --page 2 --per-page 5 paginates`
- `test: codeplane user activity nonexistent-user prints error`
- `test: codeplane user heatmap <username> prints contribution summary`
- `test: codeplane user heatmap <username> --json outputs valid JSON matching HeatmapResult schema`
- `test: codeplane user heatmap <username> --from 2025-06-01 shifts window`

### TUI E2E Tests

- `test: TUI activity screen renders for valid user`
- `test: TUI activity screen shows "No activity" for zero-activity user`
- `test: TUI activity screen supports pagination via keybindings`
- `test: TUI activity screen supports type filtering`

### Data Integrity Tests

- `test: creating a private repo does NOT generate a public activity entry`
- `test: forking a public repo generates a public activity entry`
- `test: archiving a public repo generates a public activity entry`
- `test: transferring a public repo generates activity entries for both old and new owner`
- `test: changing a repo from public to private removes it from future activity queries`
- `test: activity feed remains consistent across page boundaries (no duplicates, no gaps)`
- `test: heatmap counts are consistent with activity feed totals`
