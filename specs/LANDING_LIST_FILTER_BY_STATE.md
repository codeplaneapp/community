# LANDING_LIST_FILTER_BY_STATE

Specification for LANDING_LIST_FILTER_BY_STATE.

## High-Level User POV

When a developer navigates to the landing requests list for a repository — whether through the web UI, CLI, TUI, or an editor integration — they need to quickly narrow the list to the subset of landings that matter right now. Landing requests in Codeplane exist in one of four states: **open** (actively proposed for landing), **draft** (work-in-progress, not yet ready for review), **closed** (abandoned or rejected), and **merged** (successfully landed into the target bookmark). By default, the list shows only open landing requests, since these are the ones that need attention.

The state filter lets users switch between viewing open, draft, closed, merged, or all landing requests. In the web UI and TUI, the filter appears as a persistent toolbar element that can be toggled with a single keypress or click. In the CLI, the filter is a `--state` flag on the `land list` command. In all cases, changing the state filter immediately refreshes the list with landing requests matching the selected state, resets pagination to the first page, and updates the total count displayed to reflect the filtered set.

This filtering is essential because repositories accumulate landing requests over time. A mature repository may have hundreds of merged or closed landings but only a handful of open ones. Without state filtering, the list would be unusable. The filter also supports an "all" option for users who need a comprehensive view — for example, when searching for a specific landing request whose current state is unknown, or when auditing the overall landing history of a repository.

The state filter composes with other navigation aids. In the TUI, it works alongside client-side text search, allowing a user to filter to "draft" landings and then search within that subset by title or author. In the CLI, it pairs with pagination flags. The filter state is preserved during a session so that navigating into a landing's detail view and returning to the list does not reset the filter.

## Acceptance Criteria

### Definition of Done

- [ ] The landing request list API endpoint (`GET /api/repos/:owner/:repo/landings`) accepts a `state` query parameter that filters results server-side
- [ ] Valid state filter values are: `open`, `draft`, `closed`, `merged`, and empty string (meaning "all" / no filter)
- [ ] The default behavior when no `state` parameter is provided is to return all landing requests (no filter applied)
- [ ] Each client surface (Web UI, CLI, TUI) defaults to showing `open` landing requests on initial load
- [ ] The `X-Total-Count` response header reflects the count for the filtered state, not the total across all states
- [ ] Pagination resets to page 1 when the state filter changes
- [ ] The CLI `land list --state` flag accepts `open`, `closed`, `merged`, `landed` (alias for `merged`), and `all`
- [ ] The TUI state filter cycles through Open → Draft → Closed → Merged → All via the `f` keybinding
- [ ] The Web UI state filter provides clickable/selectable filter chips or tabs for each state
- [ ] An invalid state value in the API returns a `422 Unprocessable Entity` with a structured validation error: `{ resource: "LandingRequest", field: "state", code: "invalid" }`

### State Value Constraints

- [ ] State values are case-insensitive at the API layer (e.g., `Open`, `OPEN`, `open` all resolve to `open`)
- [ ] Leading and trailing whitespace in the state parameter is trimmed before validation
- [ ] The empty string `""` is treated as "all" (no state filter applied)
- [ ] Unsupported state values (e.g., `pending`, `queued`, `review`, `123`, or arbitrary strings) return 422
- [ ] State parameter values longer than 20 characters are rejected with 422
- [ ] Multiple `state` query parameters in the same request use only the last value (no multi-state OR filtering)

### Pagination Interaction

- [ ] Changing the state filter resets the page to 1 (or cursor to the beginning)
- [ ] The `per_page` parameter is independent of the state filter (range: 1–100, default: 30)
- [ ] `X-Total-Count` reflects the total number of landing requests matching the current state filter
- [ ] `Link` pagination headers contain the state parameter so that following `next`/`prev` links preserves the filter

### Edge Cases

- [ ] Filtering by a state that has zero results returns an empty array `[]` with `X-Total-Count: 0`, HTTP 200
- [ ] Filtering on a repository with no landing requests at all returns `[]` with `X-Total-Count: 0`, HTTP 200
- [ ] Filtering on a non-existent repository returns 404
- [ ] Filtering on a private repository without read access returns 404 (not 403, to avoid information leakage)
- [ ] Concurrent filter changes (rapid state switching in UI) cancel in-flight requests; only the most recent filter state is displayed
- [ ] The state filter works correctly alongside any future query parameters (e.g., `author`, `target_bookmark`) without interference
- [ ] URL encoding of the state parameter is handled correctly (e.g., `state=open` and `state=open%20` after trim both work)

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/landings`

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `state` | string | `""` (all) | Filter by landing request state. Valid values: `open`, `draft`, `closed`, `merged`, or empty. Case-insensitive. |
| `page` | integer | `1` | Page number (1-indexed) |
| `per_page` | integer | `30` | Results per page (1–100) |

**Response Headers:**

| Header | Description |
|--------|-------------|
| `X-Total-Count` | Total landing requests matching the state filter |
| `Link` | Pagination links (next/prev) including the `state` parameter |

**Success Response:** `200 OK`
```json
[
  {
    "number": 37,
    "title": "Implement auth token refresh",
    "body": "Adds automatic token refresh...",
    "state": "open",
    "author": { "id": 1, "login": "alice" },
    "change_ids": ["abc123", "def456"],
    "target_bookmark": "main",
    "conflict_status": "clean",
    "stack_size": 2,
    "created_at": "2026-03-20T10:30:00Z",
    "updated_at": "2026-03-21T14:15:00Z"
  }
]
```

**Error Response for invalid state:** `422 Unprocessable Entity`
```json
{
  "message": "Validation Failed",
  "errors": [
    { "resource": "LandingRequest", "field": "state", "code": "invalid" }
  ]
}
```

### Web UI Design

The landing list page includes a state filter toolbar positioned below the page title and above the landing request table.

**Filter Toolbar Layout:**
- A row of state filter tabs/chips: **Open** (default, highlighted), **Draft**, **Closed**, **Merged**, **All**
- Each tab shows the count for that state in parentheses, e.g., "Open (12)", "Merged (45)"
- The active tab is visually distinguished with primary accent color background
- Clicking a tab immediately fetches the filtered list and updates the URL query string (enabling shareable filtered URLs)

**State Count Badges:**
- State counts are fetched alongside the list request using the `X-Total-Count` header for the active filter
- Counts for non-active tabs may be fetched in the background or on hover (progressive enhancement)
- If count fetching fails, the tab still works — it just omits the parenthetical count

**URL Integration:**
- The current state filter is reflected in the URL query string: `/:owner/:repo/landings?state=open`
- Navigating directly to a URL with a `state` parameter pre-selects that filter
- The "All" filter is represented as the absence of a `state` parameter or `?state=` (empty)
- Browser back/forward navigation respects filter changes

**Empty States:**
- "No open landing requests" (with suggestion to view other states or create a new landing)
- "No draft landing requests"
- "No closed landing requests"
- "No merged landing requests"
- "No landing requests" (when "All" is selected and repository has zero landings)

**Visual State Indicators:**
- Open: green circle/icon
- Draft: gray circle/icon
- Closed: red circle/icon
- Merged: purple/magenta circle/icon

### CLI Command

**Command:** `codeplane land list`

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--state` | enum | `open` | Filter by state: `open`, `closed`, `merged`, `landed`, `all` |
| `--page` | number | `1` | Page number |
| `--limit` | number | `30` | Results per page |
| `--repo` | string | (auto-detected) | Repository in OWNER/REPO format |

**Behavior:**
- `--state all` omits the `state` query parameter entirely, fetching all states
- `--state landed` is an alias for `--state merged` (common user mental model: "landed" = "merged")
- Default is `--state open` so bare `codeplane land list` shows actionable landing requests
- Output in table format includes a `State` column showing the state of each landing request
- JSON output (`--json`) includes the `state` field as returned by the API

**Example Usage:**
```
$ codeplane land list --state open
$ codeplane land list --state closed --repo acme/frontend
$ codeplane land list --state all --limit 50
$ codeplane land list --state landed   # alias for merged
```

### TUI UI

**State Filter Toolbar:**
- Persistent toolbar below the title row showing the current state as a labeled chip: `State: Open`
- `f` key cycles through: Open → Draft → Closed → Merged → All → Open
- Active non-default states (anything other than Open) display with a highlighted background to indicate non-default filtering
- Each state change triggers a fresh API request with the new `state` query parameter
- The title row count updates: "Landings (N)" reflects the filtered total

**Filter State Preservation:**
- Navigating from the list to a landing detail view and back preserves the active state filter
- The filter resets to "Open" when the screen is freshly mounted from outside (e.g., `g l` navigation)

**Keyboard Interaction:**
- `f` while the list is focused cycles the state filter forward
- State changes cancel any in-flight API request for the previous state
- Pagination resets to page 1 on state change

### SDK Shape

The `@codeplane/ui-core` package exposes a `useLandings()` hook (or equivalent data-fetching primitive) that accepts a state filter parameter:

```typescript
useLandings({
  owner: string;
  repo: string;
  state?: "open" | "draft" | "closed" | "merged" | "";
  page?: number;
  perPage?: number;
}) → { items: LandingRequestResponse[]; total: number; loading: boolean; error: Error | null }
```

- The hook triggers a refetch when the `state` parameter changes
- It resets `page` to 1 when `state` changes
- It exposes the `total` from the `X-Total-Count` header

### Documentation

The following end-user documentation should be written or updated:

- **Landing Requests Guide** (`docs/guides/landing-requests.mdx`): Add a section titled "Filtering by State" explaining the four states (open, draft, closed, merged), what each means, and how to filter in the web UI, CLI, and TUI. Include examples for each client.
- **CLI Reference** (`docs/cli/land.mdx`): Document the `--state` flag on `land list`, including the `landed` alias and `all` option.
- **API Reference** (`docs/api/landings.mdx`): Document the `state` query parameter on `GET /api/repos/:owner/:repo/landings`, valid values, case-insensitivity, and error behavior for invalid values.

## Permissions & Security

### Authorization Roles

| Action | Anonymous (public repo) | Anonymous (private repo) | Read-Only | Write | Admin |
|--------|------------------------|--------------------------|-----------|-------|-------|
| List landings with state filter | ✅ | ❌ (404) | ✅ | ✅ | ✅ |
| View filtered counts | ✅ | ❌ (404) | ✅ | ✅ | ✅ |

- The state filter does not introduce any new permission requirements. It filters an existing read endpoint.
- Private repository access returns 404 (not 403) to avoid confirming repository existence to unauthorized users.
- The state filter parameter value is never used in authorization decisions — it is purely a data filter.

### Rate Limiting

- `GET /api/repos/:owner/:repo/landings`: 300 requests/minute per authenticated user, 60 requests/minute per anonymous IP
- Rapid state filter cycling in the UI should be debounced or use request cancellation on the client side to avoid exhausting the rate limit
- 429 responses include `Retry-After` header

### Data Privacy

- No PII exposure risk beyond what the landing list endpoint already exposes (author login, which is public)
- The state filter does not expose any additional data — it only narrows the existing result set
- The state parameter value is not logged at levels higher than `debug` to avoid log noise, but it poses no PII risk as it is an enum value

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `landings.list.viewed` | Landing list loaded with results | `repo`, `state_filter`, `total_count`, `page`, `per_page`, `client` (web/cli/tui), `load_time_ms` |
| `landings.list.state_filter_changed` | User changes the state filter | `repo`, `previous_state`, `new_state`, `total_count_for_new_state`, `client` |
| `landings.list.empty` | Landing list returns zero results | `repo`, `state_filter`, `client` |
| `landings.list.filter_error` | Invalid state value submitted | `repo`, `attempted_state`, `client`, `http_status` |

### Properties Attached to All Events

- `session_id`: unique session identifier
- `timestamp`: ISO 8601 timestamp
- `user_id`: authenticated user ID (null for anonymous)
- `repo`: owner/repo slug
- `client`: `web` | `cli` | `tui` | `vscode` | `nvim` | `api`

### Success Indicators

| Metric | Target | Rationale |
|--------|--------|-----------||
| State filter usage rate | >35% of landing list views use a non-default filter | Indicates users find value in filtering beyond the default "open" view |
| Filter-to-action conversion | >50% of filtered views result in opening a landing detail | Users who filter are finding what they need |
| "All" state usage | <20% of filter changes | "All" is a fallback; frequent use suggests the specific state filters aren't sufficient |
| Draft filter adoption | >10% of filter changes select "draft" | Validates that draft state is a meaningful workflow concept |
| Invalid state error rate | <0.1% of list requests | Validates that clients are sending correct values |
| Time-to-first-result after filter change | P95 < 500ms | Filter changes should feel instant |

## Observability

### Logging Requirements

| Level | Context | Log Message Template |
|-------|---------|---------------------|
| `debug` | API route handler | `landings.list: request [repo={owner}/{repo}] [state={state}] [page={page}] [per_page={per_page}]` |
| `debug` | Service layer | `landings.list: query [repo_id={id}] [normalized_state={state}] [offset={offset}] [limit={limit}]` |
| `debug` | Service layer | `landings.list: result [repo_id={id}] [state={state}] [count={items.length}] [total={total}] [duration_ms={ms}]` |
| `info` | API route handler | `landings.list: served [repo={owner}/{repo}] [state={state}] [total={total}] [duration_ms={ms}]` |
| `warn` | Service layer | `landings.list: validation_failed [state={raw_state}] [error=invalid]` |
| `warn` | API route handler | `landings.list: slow_query [repo={owner}/{repo}] [state={state}] [duration_ms={ms}]` (when >1000ms) |
| `error` | Service layer | `landings.list: db_error [repo_id={id}] [state={state}] [error={message}]` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_landings_list_requests_total` | Counter | `state`, `status_code` | Total landing list requests by state filter and response code |
| `codeplane_landings_list_duration_seconds` | Histogram | `state` | Request duration for landing list endpoint, bucketed by state filter |
| `codeplane_landings_list_results_total` | Histogram | `state` | Number of results returned per request, bucketed by state filter |
| `codeplane_landings_list_validation_errors_total` | Counter | `error_code` | Count of validation errors (invalid state values) |

### Alerts

**Alert: LandingListHighErrorRate**
- **Condition:** `rate(codeplane_landings_list_requests_total{status_code=~"5.."}[5m]) / rate(codeplane_landings_list_requests_total[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_landings_list_requests_total` by `status_code` to identify which 5xx codes are firing
  2. Search logs for `landings.list: db_error` to identify database connection or query issues
  3. Check database connection pool metrics and query latency
  4. If query latency is high, check for missing indexes on `landing_requests(repository_id, state)`
  5. If database is healthy, check for service-layer panics in the landing service
  6. Escalate to database on-call if connection pool exhaustion is suspected

**Alert: LandingListHighLatency**
- **Condition:** `histogram_quantile(0.95, rate(codeplane_landings_list_duration_seconds_bucket[5m])) > 2`
- **Severity:** Warning
- **Runbook:**
  1. Check which `state` filter label has the highest latency via `codeplane_landings_list_duration_seconds` breakdown
  2. If "all" (empty state) is slowest, verify that the unfiltered query plan uses the correct index
  3. Check `codeplane_landings_list_results_total` — high result counts indicate repositories with many landings
  4. Check database slow query log for `landing_requests` table scans
  5. Consider adding pagination limits or query optimization for high-cardinality repositories
  6. Verify the author cache in the service layer is working (N+1 query issues)

**Alert: LandingListHighValidationErrorRate**
- **Condition:** `rate(codeplane_landings_list_validation_errors_total[5m]) > 10`
- **Severity:** Info
- **Runbook:**
  1. Check logs for `landings.list: validation_failed` to identify the invalid state values being submitted
  2. If a specific value appears frequently, check whether a client is sending an outdated or incorrect state string
  3. If values look like fuzzing/scanning, verify rate limiting is active
  4. No action required if rate is low; this is informational

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior | Recovery |
|------------|-------------|----------|----------|
| Invalid state value | 422 | Structured validation error | Client shows error, user selects valid state |
| Repository not found | 404 | Standard not-found error | Client shows 404 page |
| Private repo, no access | 404 | Same as not found (information hiding) | User authenticates or requests access |
| Database query failure | 500 | Internal server error | Alert fires; on-call investigates DB health |
| Database timeout | 504 | Gateway timeout | Client retries; on-call checks DB load |
| Rate limited | 429 | Rate limit error with Retry-After | Client waits and retries |
| Auth token expired | 401 | Unauthorized | Client redirects to auth flow |

## Verification

### API Integration Tests — `e2e/api/landing-list-filter.test.ts`

**Setup:**
- Create a test repository
- Create landing requests in each state: 3 open, 2 draft, 2 closed, 2 merged (total: 9)

**State Filter Tests:**

- `API-FILTER-001`: `GET /landings?state=open` returns exactly 3 items, all with `state: "open"`, `X-Total-Count: 3`
- `API-FILTER-002`: `GET /landings?state=draft` returns exactly 2 items, all with `state: "draft"`, `X-Total-Count: 2`
- `API-FILTER-003`: `GET /landings?state=closed` returns exactly 2 items, all with `state: "closed"`, `X-Total-Count: 2`
- `API-FILTER-004`: `GET /landings?state=merged` returns exactly 2 items, all with `state: "merged"`, `X-Total-Count: 2`
- `API-FILTER-005`: `GET /landings` (no state param) returns all 9 items, `X-Total-Count: 9`
- `API-FILTER-006`: `GET /landings?state=` (empty string) returns all 9 items, `X-Total-Count: 9`

**Case Insensitivity Tests:**

- `API-FILTER-007`: `GET /landings?state=Open` returns same results as `state=open`
- `API-FILTER-008`: `GET /landings?state=MERGED` returns same results as `state=merged`
- `API-FILTER-009`: `GET /landings?state=DrAfT` returns same results as `state=draft`

**Whitespace Handling Tests:**

- `API-FILTER-010`: `GET /landings?state=%20open%20` (spaces around "open") returns same as `state=open`
- `API-FILTER-011`: `GET /landings?state=%20` (only whitespace) returns all items

**Invalid State Tests:**

- `API-FILTER-012`: `GET /landings?state=pending` returns 422 with `{ errors: [{ resource: "LandingRequest", field: "state", code: "invalid" }] }`
- `API-FILTER-013`: `GET /landings?state=queued` returns 422
- `API-FILTER-014`: `GET /landings?state=review` returns 422
- `API-FILTER-015`: `GET /landings?state=123` returns 422
- `API-FILTER-016`: `GET /landings?state=open;closed` (attempt at multi-value) returns 422
- `API-FILTER-017`: `GET /landings?state=` + 21-character string returns 422

**Maximum Valid Input Test:**

- `API-FILTER-018`: `GET /landings?state=merged` (6 chars, longest valid state) returns 200 with correct results

**Pagination Interaction Tests:**

- `API-FILTER-019`: `GET /landings?state=open&page=1&per_page=2` returns 2 items, `X-Total-Count: 3`, `Link` header includes `state=open`
- `API-FILTER-020`: `GET /landings?state=open&page=2&per_page=2` returns 1 item, `X-Total-Count: 3`
- `API-FILTER-021`: `GET /landings?state=open&page=99` returns empty array `[]`, `X-Total-Count: 3`
- `API-FILTER-022`: `GET /landings?state=closed&per_page=1` returns 1 item, `X-Total-Count: 2`, `Link` header has next page

**Empty Result Tests:**

- `API-FILTER-023`: Filter by a state with zero landing requests returns `[]`, `X-Total-Count: 0`, HTTP 200
- `API-FILTER-024`: Repository with zero landing requests, `GET /landings?state=open` returns `[]`, `X-Total-Count: 0`, HTTP 200

**Authorization Tests:**

- `API-FILTER-025`: Anonymous user on public repo can filter by state — returns 200
- `API-FILTER-026`: Anonymous user on private repo gets 404 regardless of state filter
- `API-FILTER-027`: Read-only collaborator on private repo can filter by state — returns 200
- `API-FILTER-028`: Unauthenticated request to private repo returns 404 (not 403)

**Response Shape Tests:**

- `API-FILTER-029`: Each item in the filtered response includes all required fields: `number`, `title`, `body`, `state`, `author`, `change_ids`, `target_bookmark`, `conflict_status`, `stack_size`, `created_at`, `updated_at`
- `API-FILTER-030`: The `state` field in each returned item matches the requested filter value

### CLI Integration Tests — `e2e/cli/landing-list-filter.test.ts`

**Setup:**
- Create a test repository with landing requests in various states

- `CLI-FILTER-001`: `codeplane land list` (default) shows only open landing requests
- `CLI-FILTER-002`: `codeplane land list --state open` shows only open landing requests
- `CLI-FILTER-003`: `codeplane land list --state closed` shows only closed landing requests
- `CLI-FILTER-004`: `codeplane land list --state merged` shows only merged landing requests
- `CLI-FILTER-005`: `codeplane land list --state landed` (alias) shows same results as `--state merged`
- `CLI-FILTER-006`: `codeplane land list --state all` shows all landing requests regardless of state
- `CLI-FILTER-007`: `codeplane land list --state open --json` returns JSON array where every item has `state: "open"`
- `CLI-FILTER-008`: `codeplane land list --state all --json` returns JSON array with items in mixed states
- `CLI-FILTER-009`: `codeplane land list --state open --limit 1` returns exactly 1 open landing request
- `CLI-FILTER-010`: `codeplane land list --state closed` on a repo with no closed landings outputs empty table/message
- `CLI-FILTER-011`: `codeplane land list --state invalid_value` exits with non-zero status and error message

### Web UI E2E Tests (Playwright) — `e2e/ui/landing-list-filter.test.ts`

- `UI-FILTER-001`: Landing list page loads with "Open" filter tab active by default
- `UI-FILTER-002`: Clicking "Closed" tab fetches and displays only closed landing requests
- `UI-FILTER-003`: Clicking "Merged" tab fetches and displays only merged landing requests
- `UI-FILTER-004`: Clicking "Draft" tab fetches and displays only draft landing requests
- `UI-FILTER-005`: Clicking "All" tab fetches and displays all landing requests
- `UI-FILTER-006`: Active tab is visually distinguished (has active/highlighted styling)
- `UI-FILTER-007`: Total count in the header updates when switching state filters
- `UI-FILTER-008`: URL query string updates to reflect the active state filter (e.g., `?state=closed`)
- `UI-FILTER-009`: Navigating directly to `/:owner/:repo/landings?state=merged` pre-selects the "Merged" tab
- `UI-FILTER-010`: Navigating to landing detail and pressing back preserves the active state filter
- `UI-FILTER-011`: Empty state message displays when filtering to a state with no landing requests
- `UI-FILTER-012`: State icons in the list match the filtered state (e.g., all green circles when filtering "open")
- `UI-FILTER-013`: Switching filters resets pagination to page 1
- `UI-FILTER-014`: Rapid filter switching (clicking tabs quickly) does not result in stale data display
- `UI-FILTER-015`: Landing list page is accessible — filter tabs have proper aria labels and keyboard navigation

### TUI Integration Tests — `e2e/tui/landing-list-filter.test.ts`

- `TUI-FILTER-001`: Landing list opens with state filter showing "Open" by default
- `TUI-FILTER-002`: Pressing `f` cycles filter from Open to Draft — list refreshes with draft landings
- `TUI-FILTER-003`: Pressing `f` five times returns to "Open" (full cycle: Open→Draft→Closed→Merged→All→Open)
- `TUI-FILTER-004`: State filter change triggers API request with correct `state` query parameter (verified via request interception)
- `TUI-FILTER-005`: Title count "Landings (N)" updates to reflect filtered total
- `TUI-FILTER-006`: Filter change during pagination resets to page 1
- `TUI-FILTER-007`: Filter toolbar displays highlighted background for non-default state
- `TUI-FILTER-008`: Empty filter result shows "No landing requests match the current filters."
- `TUI-FILTER-009`: Navigating to landing detail and back preserves the state filter
- `TUI-FILTER-010`: Rapid `f` presses cancel in-flight requests (no stale data displayed)
