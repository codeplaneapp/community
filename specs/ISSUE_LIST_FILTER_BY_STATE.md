# ISSUE_LIST_FILTER_BY_STATE

Specification for ISSUE_LIST_FILTER_BY_STATE.

## High-Level User POV

When a user navigates to an issue list — whether on the web, in the CLI, in the TUI, or within an editor integration — they need to quickly narrow down issues to those that are actionable right now versus those that have already been resolved. Filtering by state is the single most important triage mechanism on an issue list. Without it, every issue list becomes an undifferentiated wall of tickets that mixes stale closed work with live open work.

Codeplane's issue state filter lets users toggle between three views: **Open** issues only, **Closed** issues only, or **All** issues regardless of state. The default view across every client surface is **Open**, because the overwhelming majority of issue-list visits are motivated by "what still needs doing." Users can switch states with a single interaction — a tab click, a keyboard shortcut, or a CLI flag — and the list updates immediately, preserving pagination position at page one of the new result set.

This filter is the foundation on which more advanced filtering (by label, assignee, milestone, or search query) is layered. It must feel instantaneous, be consistent across every client, and always produce a count of matching issues so users know the size of the work ahead of them.

## Acceptance Criteria

- **Default state filter is `open`**. Every client surface that renders an issue list MUST default to showing only open issues on first load.
- **Three filter values are supported**: `open`, `closed`, and `all`. No other values are accepted.
- **State values are case-insensitive**. `Open`, `OPEN`, and `open` MUST all resolve to the normalized value `open`.
- **The `all` filter omits the state query parameter** (or passes an empty string), causing the server to return issues in every state.
- **Changing the state filter resets pagination** to the first page/cursor. The user MUST NOT land on a stale page offset after switching filters.
- **Total count reflects the filtered state**. The `X-Total-Count` response header (and any UI count badge) MUST reflect the number of issues matching the current state filter, not the total number of issues in the repository.
- **Invalid state values produce a clear validation error**. If the API receives a state value other than `open`, `closed`, or empty string, it MUST respond with a `422 Unprocessable Entity` containing `{ resource: "Issue", field: "state", code: "invalid" }`.
- **Empty repositories return an empty array**, not an error, regardless of the state filter value.
- **Whitespace-only state values are treated as empty** (i.e., equivalent to `all`). Leading and trailing whitespace MUST be trimmed before validation.
- **Filter is purely server-side**. The server filters at the database query level; clients MUST NOT fetch all issues and filter locally for state.
- **Pagination limits are enforced regardless of state filter**: default 30 items per page, maximum 100 items per page.
- **Results are ordered by issue number descending** (most recently created first) regardless of which state filter is active.
- **State filter works identically for public and private repositories**, subject to the user's repository access permissions.
- **Definition of Done**: The feature is complete when all clients (API, Web UI, CLI, TUI) can filter issues by state, the server validates and applies the filter at the database level, the total count header is accurate for the filtered state, invalid values are rejected with a clear error, and comprehensive e2e tests pass across API and CLI surfaces.

## Design

### API Shape

**Endpoint**: `GET /api/repos/:owner/:repo/issues`

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `state` | `string` | No | `""` (all) | Filter by issue state. Accepts `open`, `closed`, or empty string / omitted for all issues. Case-insensitive, trimmed. |
| `page` | `integer` | No | `1` | Page number (1-based). Mutually exclusive with `cursor`. |
| `per_page` | `integer` | No | `30` | Items per page. Min 1, max 100. |
| `cursor` | `string` | No | `""` | Opaque pagination cursor. Mutually exclusive with `page`. |
| `limit` | `integer` | No | `30` | Items per cursor page. Min 1, max 100. |

**Successful Response** (`200 OK`):

```
Headers:
  X-Total-Count: <number>    # Total issues matching the state filter

Body: IssueResponse[]
```

Each `IssueResponse`:

```json
{
  "id": 42,
  "number": 7,
  "title": "Fix dark mode flicker",
  "body": "When toggling dark mode...",
  "state": "open",
  "author": { "id": 1, "login": "alice" },
  "assignees": [{ "id": 2, "login": "bob" }],
  "labels": [{ "id": 1, "name": "bug", "color": "#d73a4a", "description": "Something isn't working" }],
  "milestone_id": 3,
  "comment_count": 2,
  "closed_at": null,
  "created_at": "2026-03-20T12:00:00Z",
  "updated_at": "2026-03-21T08:30:00Z"
}
```

**Error Response** (`422 Unprocessable Entity`) for invalid state:

```json
{
  "errors": [
    { "resource": "Issue", "field": "state", "code": "invalid" }
  ]
}
```

### Web UI Design

The issue list page at `/:owner/:repo/issues` includes a state filter rendered as a segmented tab bar above the issue list.

**Tab bar**:
- Three tabs: **Open** (default, highlighted), **Closed**, **All**.
- Each tab displays a count badge showing the number of issues in that state. The count for the currently active tab comes from `X-Total-Count`. Counts for inactive tabs SHOULD be fetched on initial page load or cached from prior navigation.
- Clicking a tab immediately triggers a new API request with the selected state, resets pagination to page 1, and updates the URL query string (e.g., `?state=closed`).
- The active tab is visually distinguished with a highlighted background and underline.

**URL integration**:
- The `state` query parameter is reflected in the browser URL. Navigating directly to `/:owner/:repo/issues?state=closed` loads the closed issues view.
- If the URL contains an invalid state value, the UI falls back to `open` and removes the invalid parameter from the URL.

**Empty state**:
- When no issues match the current filter, display a centered empty-state message: "No open issues" / "No closed issues" / "No issues" with contextual guidance (e.g., "Create a new issue" link for the open tab).

**Loading state**:
- While the API request for a new state is in flight, the existing issue list remains visible with a subtle loading indicator (e.g., progress bar or skeleton overlay). The tab bar remains interactive.

### CLI Command

**Command**: `codeplane issue list`

**Flags**:

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--state` | `open \| closed \| all` | `open` | Filter issues by state |
| `--page` | `integer` | `1` | Page number |
| `--limit` | `integer` | `30` | Items per page (max 100) |
| `--repo` / `-R` | `string` | Auto-detected | Repository slug (`owner/repo`) |
| `--json` | `boolean` | `false` | Output raw JSON |

**Behavior**:
- When `--state all`, the CLI omits the `state` query parameter from the API request.
- When `--state open` or `--state closed`, the CLI passes `state=<value>` as a query parameter.
- Default output is a formatted table with columns: `#Number`, `State`, `Title`, `Author`.
- With `--json`, the raw API response array is printed to stdout.
- Exit code 0 on success, 1 on error.

**Example usage**:
```bash
# List open issues (default)
codeplane issue list

# List closed issues
codeplane issue list --state closed

# List all issues as JSON
codeplane issue list --state all --json

# List with pagination
codeplane issue list --state open --page 2 --limit 50
```

### TUI UI

The TUI issue list screen renders a scrollable list of issues with a filter toolbar.

**Filter toolbar**:
- Displayed below the title bar, always visible.
- Shows the current state filter as a chip: `[State: Open]`, `[State: Closed]`, or `[State: All]`.
- Pressing `f` cycles the state filter: Open → Closed → All → Open.
- Changing the state filter triggers a fresh API request and resets the cursor to the first page.

**Keyboard shortcuts**:
- `f` — Cycle state filter
- `j` / `↓` — Move selection down
- `k` / `↑` — Move selection up
- `Enter` — Open issue detail
- `n` — Create new issue
- `q` / `Esc` — Go back

**Empty state**:
- Displays centered message: "No issues match the current filter."

### VS Code Extension

The VS Code issue tree view provider includes a state filter context menu and toolbar button.

- **Default view**: Open issues.
- **Filter toggle**: A toolbar icon in the Issues view header cycles through Open / Closed / All.
- **Status text**: The view title updates to reflect the active filter: "Issues (Open)", "Issues (Closed)", "Issues (All)".
- **Refresh**: Changing the filter triggers a tree view refresh with the new state parameter.

### Neovim Plugin

The Neovim integration exposes state filtering through command arguments.

- `:Codeplane issues` — Lists open issues (default).
- `:Codeplane issues --state=closed` — Lists closed issues.
- `:Codeplane issues --state=all` — Lists all issues.
- Telescope picker includes a state filter prompt before loading results.

### Documentation

The following end-user documentation should be written:

- **Issue Listing Guide**: A page explaining how to view issues across all surfaces (web, CLI, TUI, editors), with emphasis on how to filter by state. Include screenshots of the web UI tab bar, CLI output examples, and TUI filter toolbar.
- **CLI Reference: `issue list`**: Document all flags including `--state` with examples for each value.
- **API Reference: List Issues**: Document the `state` query parameter, valid values, default behavior, error responses, and pagination interaction.
- **Keyboard Shortcuts Reference (TUI)**: Document the `f` key for state filter cycling within the issue list screen.

## Permissions & Security

### Authorization

| Role | Can filter and view issues? |
|------|---------------------------|
| **Repository Owner** | Yes |
| **Repository Admin** | Yes |
| **Repository Member (Write)** | Yes |
| **Repository Member (Read)** | Yes |
| **Anonymous (public repo)** | Yes |
| **Anonymous (private repo)** | No — returns `404 Not Found` (repo not found) |
| **Authenticated, no repo access** | No — returns `404 Not Found` |

The state filter does not introduce any new authorization surface. Filtering is applied at the database query level within the existing repository-access-gated issue list endpoint. Users who cannot see issues in a repository cannot filter them either.

### Rate Limiting

- The issue list endpoint is subject to the standard API rate limit (shared across all read endpoints).
- No additional per-filter-value rate limiting is required. Switching state filters does not impose a higher load profile than any other paginated list request.
- Clients SHOULD debounce rapid filter toggling in the UI to avoid unnecessary API calls. A 150ms debounce on tab clicks / keyboard shortcuts is recommended.

### Data Privacy

- The state filter does not expose any new PII. Issue state (`open` / `closed`) is a non-sensitive operational attribute.
- The `state` query parameter value MUST NOT be logged with user-identifying information beyond what is already captured in standard request logs.
- No additional data privacy constraints apply beyond existing issue-list access controls.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `IssueListViewed` | User loads the issue list (any client) | `state_filter`: `open \| closed \| all`, `result_count`: number, `client`: `web \| cli \| tui \| vscode \| nvim`, `repo_id`: string, `page`: number, `per_page`: number |
| `IssueStateFilterChanged` | User changes the state filter from one value to another | `previous_state`: `open \| closed \| all`, `new_state`: `open \| closed \| all`, `client`: `web \| cli \| tui \| vscode \| nvim`, `repo_id`: string |

### Funnel Metrics

- **Filter engagement rate**: Percentage of `IssueListViewed` events where `state_filter` is something other than `open` (the default). Target: >15% of issue list views should involve a non-default filter, indicating users find the filter useful.
- **Filter-to-action conversion**: Percentage of sessions where `IssueStateFilterChanged` is followed by an `IssueDetailViewed` event within the same session. This measures whether filtering helps users find what they are looking for.
- **Error rate**: Percentage of issue list requests that return a `422` due to invalid state values. Target: <0.1% — if higher, clients are sending bad values and need fixes.

### Success Indicators

- Issue list page load times remain under 200ms at p95 regardless of state filter value.
- Users who use the state filter have higher session engagement (more issue detail views, more comments) than users who only see the default open list.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|--------------------||
| Issue list request received | `DEBUG` | `owner`, `repo`, `state_filter`, `page`, `per_page`, `request_id` |
| State filter normalized | `DEBUG` | `raw_state`, `normalized_state`, `request_id` |
| Invalid state filter rejected | `WARN` | `raw_state`, `owner`, `repo`, `request_id`, `user_id` (if authenticated) |
| Issue list query executed | `DEBUG` | `state_filter`, `result_count`, `total_count`, `query_duration_ms`, `request_id` |
| Issue list response sent | `INFO` | `status_code`, `result_count`, `total_count`, `state_filter`, `response_time_ms`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_issue_list_requests_total` | Counter | `state_filter`, `status_code` | Total issue list requests by state filter and response status |
| `codeplane_issue_list_duration_seconds` | Histogram | `state_filter` | Request duration for issue list endpoint, bucketed by state filter. Buckets: 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0 |
| `codeplane_issue_list_result_count` | Histogram | `state_filter` | Number of issues returned per request. Buckets: 0, 1, 5, 10, 20, 30, 50, 100 |
| `codeplane_issue_list_validation_errors_total` | Counter | — | Total invalid state filter rejections |

### Alerts

**Alert 1: High issue list error rate**
- **Condition**: `rate(codeplane_issue_list_requests_total{status_code=~"5.."}[5m]) / rate(codeplane_issue_list_requests_total[5m]) > 0.05`
- **Severity**: Critical
- **Runbook**:
  1. Check server logs for the `request_id` values on 5xx responses to identify the error class (database timeout, connection failure, OOM).
  2. Query `codeplane_issue_list_duration_seconds` to determine if latency has spiked — a latency spike preceding errors suggests database saturation.
  3. Check database connection pool metrics and active query counts.
  4. If the database is under load, identify the heaviest repositories by checking `owner` and `repo` fields in error logs. A single large repository may need query optimization or index attention.
  5. If the issue is transient, monitor for recovery. If persistent, restart the server process and escalate to the database team.

**Alert 2: High validation error rate**
- **Condition**: `rate(codeplane_issue_list_validation_errors_total[5m]) > 10`
- **Severity**: Warning
- **Runbook**:
  1. Check WARN-level logs for `raw_state` values being sent. Identify whether a single client or integration is sending malformed state values.
  2. If a specific client version is the source, open a bug against that client.
  3. If the values look like an attack pattern (e.g., SQL injection attempts), check the originating IPs and consider rate-limiting or blocking.
  4. No server-side fix is needed — the validation is working correctly by rejecting invalid inputs.

**Alert 3: Slow issue list queries**
- **Condition**: `histogram_quantile(0.95, rate(codeplane_issue_list_duration_seconds_bucket[5m])) > 2`
- **Severity**: Warning
- **Runbook**:
  1. Check which `state_filter` label value has the highest p95 latency. If `all` is significantly slower than `open` or `closed`, the query may be scanning too many rows.
  2. Identify repositories with the highest issue counts from recent logs.
  3. Run an `EXPLAIN ANALYZE` on the issue list query for the affected repository to check for missing indexes or sequential scans.
  4. Verify that the `(repository_id, state)` composite index exists. If not, create it.
  5. If the index exists and the repository simply has a very large issue count, consider adding result-set capping or improving pagination efficiency.

### Error Cases and Failure Modes

| Error Case | Response | Behavior |
|------------|----------|----------|
| Invalid state value (e.g., `pending`) | `422` with validation error | Request rejected before database query |
| Repository not found | `404 Not Found` | Same behavior as unauthenticated access to private repo |
| Database connection failure | `500 Internal Server Error` | Logged at ERROR level, counted in error rate metric |
| Database query timeout | `500` or `504` | Logged at ERROR level, latency histogram captures the timeout duration |
| Pagination exceeds total (e.g., page 999) | `200` with empty array | Valid response — no issues on that page, `X-Total-Count` still reflects total matching count |
| `per_page` > 100 | Clamped to 100 | Server silently caps at maximum, no error |
| `per_page` < 1 or non-integer | Defaults to 30 | Server uses default pagination |

## Verification

### API Integration Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `GET /issues with no state param returns all issues` | Create 3 open and 2 closed issues. Request without `state` param. Verify response contains all 5 issues and `X-Total-Count` is 5. |
| 2 | `GET /issues with state=open returns only open issues` | Create 3 open and 2 closed issues. Request with `state=open`. Verify response contains exactly 3 issues, all with `state: "open"`. Verify `X-Total-Count` is 3. |
| 3 | `GET /issues with state=closed returns only closed issues` | Create 3 open and 2 closed issues. Request with `state=closed`. Verify response contains exactly 2 issues, all with `state: "closed"`. Verify `X-Total-Count` is 2. |
| 4 | `GET /issues with state=OPEN (uppercase) is case-insensitive` | Request with `state=OPEN`. Verify it returns only open issues (same result as `state=open`). |
| 5 | `GET /issues with state=Closed (mixed case) is case-insensitive` | Request with `state=Closed`. Verify it returns only closed issues. |
| 6 | `GET /issues with state=  open  (whitespace-padded) is trimmed` | Request with `state=  open  `. Verify it returns only open issues. |
| 7 | `GET /issues with state=invalid returns 422` | Request with `state=pending`. Verify response is `422` with error body `{ resource: "Issue", field: "state", code: "invalid" }`. |
| 8 | `GET /issues with state= (empty string) returns all issues` | Request with `state=`. Verify it returns all issues, same as omitting the parameter. |
| 9 | `GET /issues with state=   (whitespace-only) returns all issues` | Request with `state=   `. Verify it is treated as empty string and returns all issues. |
| 10 | `GET /issues on empty repo returns empty array for any state` | Create a repo with no issues. Request with `state=open`, `state=closed`, and no state. Verify each returns `[]` with `X-Total-Count: 0`. |
| 11 | `GET /issues state filter works with page pagination` | Create 35 open and 10 closed issues. Request `state=open&page=1&per_page=30`. Verify 30 results, all open, `X-Total-Count: 35`. Request `page=2`. Verify 5 results, all open. |
| 12 | `GET /issues state filter works with cursor pagination` | Create 35 open issues. Request `state=open&limit=30`. Verify 30 results. Use returned cursor for second request. Verify 5 results. |
| 13 | `GET /issues changing state resets to correct total count` | Request `state=open`, note `X-Total-Count`. Request `state=closed`, verify `X-Total-Count` is different and correct. |
| 14 | `GET /issues with per_page=100 and state=open returns max 100` | Create 110 open issues. Request `state=open&per_page=100`. Verify exactly 100 results. Verify `X-Total-Count: 110`. |
| 15 | `GET /issues with per_page=101 is clamped to 100` | Create 110 open issues. Request `state=open&per_page=101`. Verify no more than 100 results returned. |
| 16 | `GET /issues with per_page=1 returns single issue` | Create 5 open issues. Request `state=open&per_page=1`. Verify exactly 1 result returned and `X-Total-Count: 5`. |
| 17 | `GET /issues results are ordered by issue number descending` | Create 5 open issues. Request `state=open`. Verify the `number` field is in strictly descending order. |
| 18 | `GET /issues state filter reflects real-time state changes` | Create an open issue. Request `state=open`, verify it appears. Close the issue. Request `state=open`, verify it no longer appears. Request `state=closed`, verify it now appears. |
| 19 | `GET /issues anonymous user can filter public repo` | Without auth, request `state=open` on a public repo. Verify 200 response with correct filtered results. |
| 20 | `GET /issues anonymous user gets 404 on private repo` | Without auth, request `state=open` on a private repo. Verify 404 response. |
| 21 | `GET /issues authenticated user without repo access gets 404` | With auth for a user who does not have access to a private repo, request `state=open`. Verify 404 response. |
| 22 | `GET /issues with state=all is treated as invalid` | Request with `state=all`. Verify the server returns `422`. The CLI converts `all` to empty string before sending; the API itself only accepts `open`, `closed`, or empty. |

### CLI E2E Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 23 | `issue list defaults to open state` | Run `codeplane issue list`. Verify all returned issues have `state: "open"`. |
| 24 | `issue list --state open shows only open issues` | Run `codeplane issue list --state open --json`. Parse JSON, verify every issue has `state: "open"`. |
| 25 | `issue list --state closed shows only closed issues` | Create issues, close some. Run `codeplane issue list --state closed --json`. Verify every issue has `state: "closed"`. |
| 26 | `issue list --state all shows all issues` | Run `codeplane issue list --state all --json`. Verify both open and closed issues are present. |
| 27 | `issue list --state invalid exits with error` | Run `codeplane issue list --state pending`. Verify exit code 1 and error message. |
| 28 | `issue list --state closed with no closed issues returns empty` | On a repo with only open issues, run `codeplane issue list --state closed --json`. Verify empty array. |
| 29 | `issue list --state open --limit 5 respects pagination` | Create 10 open issues. Run with `--state open --limit 5 --json`. Verify exactly 5 results. |
| 30 | `issue list --state open --page 2 --limit 5 returns second page` | Create 10 open issues. Run with `--state open --page 2 --limit 5 --json`. Verify 5 results. Verify no overlap with page 1 results. |
| 31 | `issue list formatted output shows State column` | Run `codeplane issue list --state open`. Verify the table output includes a "State" column and all rows show "open". |
| 32 | `issue list reflects state changes after close` | Create an issue. Verify it appears in `--state open`. Close the issue. Verify it no longer appears in `--state open`. Verify it appears in `--state closed`. |
| 33 | `issue list --state open with maximum per_page (100) works` | Create 100 open issues. Run `codeplane issue list --state open --limit 100 --json`. Verify all 100 are returned. |

### TUI E2E Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 34 | `Issue list screen defaults to Open state filter` | Navigate to issue list screen. Verify the filter toolbar displays `[State: Open]`. Verify only open issues are shown. |
| 35 | `Pressing f cycles to Closed state` | On issue list screen, press `f`. Verify filter toolbar updates to `[State: Closed]`. Verify only closed issues are displayed. |
| 36 | `Pressing f twice cycles to All state` | Press `f` twice from default. Verify filter toolbar displays `[State: All]`. Verify both open and closed issues are shown. |
| 37 | `Pressing f three times returns to Open state` | Press `f` three times. Verify filter returns to `[State: Open]`. |
| 38 | `State filter change triggers API request` | Press `f` to change state. Verify a new API call was made (mock/intercept verification). Verify the list content updates to match the new filter. |
| 39 | `Empty state displays message when no issues match filter` | On a repo with only open issues, press `f` to filter to Closed. Verify the empty state message is displayed. |

### Web UI / Playwright E2E Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 40 | `Issue list page shows Open tab active by default` | Navigate to `/:owner/:repo/issues`. Verify the "Open" tab is visually active. Verify only open issues are displayed. |
| 41 | `Clicking Closed tab shows only closed issues` | Click the "Closed" tab. Verify the tab becomes active. Verify all displayed issues have state "closed". Verify `X-Total-Count` in the tab badge is correct. |
| 42 | `Clicking All tab shows all issues` | Click the "All" tab. Verify both open and closed issues are present. |
| 43 | `Tab click updates URL query parameter` | Click "Closed" tab. Verify the URL contains `?state=closed`. Click "Open" tab. Verify the URL contains `?state=open` or the parameter is removed (default). |
| 44 | `Direct URL navigation with state=closed loads closed issues` | Navigate directly to `/:owner/:repo/issues?state=closed`. Verify "Closed" tab is active. Verify only closed issues are shown. |
| 45 | `Invalid state in URL falls back to open` | Navigate to `/:owner/:repo/issues?state=invalid`. Verify "Open" tab is active. Verify the URL parameter is corrected. |
| 46 | `Empty issue list shows appropriate empty state message` | On a repo with no open issues, verify the empty state message "No open issues" is displayed. Switch to "Closed" tab. Verify "No closed issues" message. |
| 47 | `Switching tabs resets pagination to page 1` | Navigate to page 2 of open issues. Click "Closed" tab. Verify the list shows page 1 of closed issues. |
| 48 | `Count badges on tabs reflect correct totals` | Create 5 open and 3 closed issues. Verify "Open" tab badge shows 5. Verify "Closed" tab badge shows 3. Verify "All" tab badge shows 8. |
| 49 | `Issue state change is reflected after navigation` | Close an open issue from the detail page. Navigate back to the issue list. Verify the "Open" count has decreased by 1 and the "Closed" count has increased by 1. |
