# LANDING_LIST

Specification for LANDING_LIST.

## High-Level User POV

Landing requests are Codeplane's jj-native alternative to pull requests. Where traditional forges model collaboration around branches and diffs, Codeplane models collaboration around **stacked changes** — one or more jj change IDs proposed for landing (merging) into a target bookmark. The Landing List is the primary surface where users discover, triage, and manage landing requests for a given repository.

When a user navigates to a repository's landings section — whether through the web UI sidebar, the CLI, the TUI, or an editor integration — they see a paginated, filterable list of all landing requests in that repository. By default, the list shows only **open** landing requests, sorted newest-first by landing number. Each row in the list communicates the essential state of a landing request at a glance: its status (open, draft, closed, or merged), its number, its title, who authored it, which bookmark it targets, whether it has jj-native conflicts, and how many changes are in the stack.

Users can filter the list by state — switching between open, draft, closed, merged, or all — to focus on the work that matters to them right now. The list paginates smoothly so that repositories with hundreds of landing requests remain navigable without overwhelming the interface.

The Landing List is the starting point for the entire landing request workflow. From it, users drill into individual landing request details to review code, inspect diffs, check for conflicts, leave comments, approve changes, or queue a landing for merge. It is designed to be fast, scannable, and responsive — whether rendered in a browser, a terminal, or an editor panel.

For teams using agents alongside human developers, the Landing List provides equal visibility into agent-authored and human-authored landing requests. The author field and change stack metadata let teams quickly distinguish automated contributions from manual ones and understand the scope of each proposed change.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/landings` returns a paginated JSON array of landing requests for the specified repository
- [ ] The Web UI displays a landing request list page at `/:owner/:repo/landings` with state filtering, pagination, and drill-through navigation
- [ ] The CLI command `codeplane land list` (alias `lr list`) returns landing requests with human-readable table or structured JSON output
- [ ] The TUI landing list screen renders a full-screen, keyboard-navigable list of landing requests
- [ ] Editor integrations (VS Code, Neovim) surface landing request lists within their respective UIs
- [ ] All clients consume the same API endpoint with identical query parameters and response shape

### Functional Constraints

- [ ] Default state filter is `open` — the list shows only open landing requests unless a different filter is explicitly selected
- [ ] Landing requests are sorted by `number` descending (newest first) — no custom sort parameter is exposed at the API level
- [ ] Default page size is 30 items per page
- [ ] Maximum page size is 100 items per page; requests exceeding 100 are rejected (legacy pagination) or silently clamped (cursor pagination)
- [ ] Page number must be a positive integer ≥ 1; invalid values produce a `400 Bad Request`
- [ ] The `state` filter accepts exactly these values: `open`, `closed`, `draft`, `merged`, or empty string (meaning all states); any other value produces a validation error
- [ ] State filter values are case-insensitive — `Open`, `OPEN`, and `open` all resolve to `open`
- [ ] The CLI accepts an additional alias `landed` for the `merged` state, transparently converting it before the API call
- [ ] The response includes `X-Total-Count` header with the total number of matching landing requests (not just the current page)
- [ ] The response includes a `Link` header with RFC 5988 pagination relations (`first`, `last`, `prev`, `next`) when applicable
- [ ] Each landing request item in the response includes: `number`, `title`, `body`, `state`, `author` (object with `id` and `login`), `change_ids` (array of strings), `target_bookmark`, `conflict_status`, `stack_size`, `created_at`, and `updated_at`
- [ ] All timestamps are returned as ISO 8601 strings
- [ ] An empty repository (zero landing requests) returns an empty JSON array `[]` with `X-Total-Count: 0`
- [ ] Author resolution never fails the list — if an author user record is missing, the response still returns (with graceful degradation)

### Edge Cases

- [ ] Requesting a non-existent repository returns `404 Not Found`
- [ ] Requesting a private repository without authentication returns `404 Not Found` (not `401` — prevents repo enumeration)
- [ ] Requesting a private repository as an authenticated user without read access returns `404 Not Found`
- [ ] `page=0` returns `400 Bad Request` with message "invalid page value"
- [ ] `per_page=0` returns `400 Bad Request` with message "invalid per_page value"
- [ ] `per_page=101` returns `400 Bad Request` with message "per_page must not exceed 100"
- [ ] `per_page=-1` returns `400 Bad Request`
- [ ] `page=abc` returns `400 Bad Request` with message "invalid page value"
- [ ] `state=invalid` returns a validation error
- [ ] Requesting a page beyond the total returns an empty array with the correct `X-Total-Count`
- [ ] Both `page`/`per_page` and `cursor`/`limit` pagination modes are supported; when both are provided, legacy `page`/`per_page` takes precedence
- [ ] `cursor=-1` is silently clamped to `0`
- [ ] `limit=200` is silently clamped to `100` (cursor mode)
- [ ] Landing requests with zero change IDs return `change_ids: []` and `stack_size: 0`
- [ ] Landing request titles containing Unicode, emoji, or special characters are returned verbatim without sanitization
- [ ] The maximum observable landing number is bounded by safe integer size — landing number `#99999+` is supported

### Boundary Constraints

- [ ] `per_page` range: 1–100 (integer)
- [ ] `page` range: 1–∞ (positive integer)
- [ ] `cursor` range: 0–∞ (non-negative integer)
- [ ] `limit` range: 1–100 (integer, clamped)
- [ ] `state` values: `""`, `"open"`, `"closed"`, `"draft"`, `"merged"` (case-insensitive)
- [ ] `change_ids` array: ordered by `position_in_stack` ascending
- [ ] `conflict_status` values: `"clean"`, `"conflicted"`, `"unknown"`
- [ ] `X-Total-Count` header: non-negative integer as string

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/landings`

**Path parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | Yes | Repository owner (user or organization login) |
| `repo` | string | Yes | Repository name |

**Query parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `state` | string | `""` (all) | Filter by state: `open`, `closed`, `draft`, `merged`, or empty for all |
| `page` | integer | 1 | Page number (legacy pagination) |
| `per_page` | integer | 30 | Items per page (legacy pagination, max 100) |
| `cursor` | integer | 0 | Offset (cursor-based pagination) |
| `limit` | integer | 30 | Items per request (cursor-based pagination, max 100) |

**Response:** `200 OK`
```json
[
  {
    "number": 37,
    "title": "Implement auth token refresh",
    "body": "Adds automatic token refresh on 401 responses.",
    "state": "open",
    "author": {
      "id": 42,
      "login": "alice"
    },
    "change_ids": ["abc123", "def456"],
    "target_bookmark": "main",
    "conflict_status": "clean",
    "stack_size": 2,
    "created_at": "2026-03-20T14:30:00.000Z",
    "updated_at": "2026-03-21T09:15:00.000Z"
  }
]
```

**Response headers:**
| Header | Description |
|--------|-------------|
| `X-Total-Count` | Total number of landing requests matching the filter |
| `Link` | RFC 5988 pagination links: `first`, `last`, `prev`, `next` |

**Error responses:**
| Status | Condition |
|--------|----------|
| `400 Bad Request` | Invalid pagination parameters or state filter |
| `404 Not Found` | Repository does not exist or is not accessible to the viewer |
| `429 Too Many Requests` | Rate limit exceeded |
| `500 Internal Server Error` | Unexpected server failure |

### Web UI Design

The Web UI landing list page is rendered at the route `/:owner/:repo/landings` within the repository workbench layout.

**Page header:** Displays "Landing Requests" as the page title with the total count badge (e.g., "37 open"). A state filter dropdown (Open / Draft / Closed / Merged / All) sits inline with the title. The current active filter is visually highlighted. Changing the filter updates the list and URL query parameters.

**Landing request table:** Each row shows:
- **State indicator:** Colored icon or label — green for open, gray for draft, red for closed, purple for merged
- **Number:** `#37` — links to the landing detail view
- **Title:** Clickable, links to landing detail. Truncated with ellipsis if longer than the available column width
- **Target bookmark:** Displayed as `→ main` with a subtle style
- **Conflict status:** Icon indicator — checkmark (clean), cross (conflicted), question mark (unknown)
- **Stack size:** Number of changes, e.g., "2 changes"
- **Author:** Avatar and login, linking to user profile
- **Updated timestamp:** Relative time (e.g., "2 hours ago")

**Pagination:** Page-based navigation controls at the bottom of the table showing "Page 1 of N" with previous/next buttons. Page size is 30.

**Empty states:**
- No landing requests exist: "No landing requests yet. Create one to start collaborating on changes."
- No matches for current filter: "No landing requests match the selected filter."

### CLI Command

**Command:** `codeplane land list` (alias: `lr list`)

**Options:**
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--state` | enum | `open` | Filter: `open`, `closed`, `merged`, `landed`, `all` |
| `--page` | number | 1 | Page number |
| `--limit` | number | 30 | Results per page |
| `--repo` | string | (auto-detected) | Repository in `OWNER/REPO` format |
| `--json` | flag | false | Output structured JSON |

**Human-readable output:**
```
Number  State   Title                          change_ids
------  ------  -----------------------------  ----------
#37     open    Implement auth token refresh    abc123,def456
#35     open    Add workspace suspend/resume    ghi789
#34     open    Fix diff view scroll sync       jkl012,mno345
```

**Empty output:** `No landing requests found`

**Structured JSON output (`--json`):** Returns the raw API response array.

**State alias:** `--state landed` is transparently converted to `merged` before calling the API.

**Repo resolution:** If `--repo` is not provided, the CLI resolves the repository from the current working directory's jj/git remote configuration.

### TUI UI

The TUI landing list screen is a full-screen, keyboard-driven view reachable via `g l` go-to keybinding, `:landings` in the command palette, or `codeplane tui --screen landings --repo owner/repo` deep link.

**Layout:** Title row "Landings (N)" → filter toolbar → column headers (at ≥120 width) → scrollable list → status bar hints.

**Row columns:** State icon (▲ colored), number (#N), title, target bookmark (→ name), conflict status (✓/✗/?), stack size (N chg), author login, relative timestamp.

**State icon colors:** Open = ▲ green (ANSI 34), Draft = ▲ gray (ANSI 245), Closed = ▲ red (ANSI 196), Merged = ▲ magenta (ANSI 135).

**Conflict status icons:** Clean = ✓ green, Conflicted = ✗ red, Unknown = ? yellow.

**Responsive breakpoints:**
- 80×24: Icon, number, title, timestamp only
- 120×40: Adds target bookmark, conflict status, author, column headers
- 200×60+: Adds stack size, full-width columns

**Keyboard bindings:** `j`/`k` navigate, `Enter` opens detail, `f` cycles state filter (Open → Draft → Closed → Merged → All → Open), `/` searches client-side, `c` creates, `x` closes/reopens (optimistic), `m` queues for merge, `q` goes back, `G` jumps to end, `gg` jumps to start, `Ctrl+D`/`Ctrl+U` page down/up, `R` retries on error, `Space` toggles selection.

**Pagination:** Page size 30, infinite scroll with scroll-to-80% trigger, 500-item memory cap.

**Empty states:** "No landing requests yet. Press `c` to create one." / "No landing requests match the current filters." / Error state with "Press `R` to retry."

### VS Code Extension

The VS Code extension provides a tree view showing landing requests for the active repository. The tree view lists landing requests with their number, title, state icon, and author. Clicking a landing request opens the landing detail webview. The tree can be refreshed and filtered by state from the view toolbar.

### Neovim Plugin

The Neovim plugin exposes landing request listing via `:CodeplaneLandings` command, which opens a Telescope picker showing landing requests for the current repository. Each entry shows number, title, state, and author. Selecting an entry opens the landing detail. The command accepts an optional `state=` argument.

### Documentation

The following end-user documentation should be written:
- **Web UI guide:** "Browsing Landing Requests" — how to navigate to the landing list, use state filters, understand the table columns, and drill into details
- **CLI reference:** `codeplane land list` — full option reference with examples for each state filter, JSON output mode, and repository resolution
- **TUI reference:** "Landing List Screen" — keybindings, filter behavior, responsive layout, pagination behavior
- **API reference:** `GET /api/repos/:owner/:repo/landings` — full parameter documentation, response schema, pagination headers, error codes
- **Concepts guide:** "Landing Requests vs Pull Requests" — explains jj-native change stacks, target bookmarks, and conflict status

## Permissions & Security

### Authorization Matrix

| Action | Anonymous | Read-Only | Write | Admin | Owner |
|--------|-----------|-----------|-------|-------|-------|
| List landings (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| List landings (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |

**Access control details:**
- Public repositories: Any viewer (including unauthenticated requests) can list landing requests
- Private repositories: Requires authentication AND read access. Read access is granted through: direct repository ownership, organization ownership, team membership with read/write/admin role, or explicit collaborator assignment
- When a private repository is not accessible, the API returns `404 Not Found` — not `401 Unauthorized` — to prevent repository enumeration attacks
- Authentication is via session cookie, `Authorization: Bearer <PAT>` header, or OAuth2 token

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `GET /api/repos/:owner/:repo/landings` | 300 requests | per minute |

- Rate limiting is applied per authenticated user (or per IP for unauthenticated requests)
- `429 Too Many Requests` response includes `Retry-After` header
- Rate limit state is tracked by the server middleware

### Data Privacy

- Landing request titles, bodies, and author logins are visible to anyone with read access to the repository
- Author `id` fields are internal numeric IDs — not PII, but should not be confused with external identity
- No email addresses, tokens, or credentials are included in the landing list response
- The `body` field may contain user-authored markdown including mentions (`@username`) — these are returned as-is without redaction
- Search text in the TUI is client-side only and never transmitted to the API

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `landing_list.viewed` | User views the landing list (any client) | `repo_owner`, `repo_name`, `client` (web/cli/tui/vscode/nvim), `state_filter`, `page`, `per_page`, `total_count`, `result_count`, `load_time_ms` |
| `landing_list.filtered` | User changes the state filter | `repo_owner`, `repo_name`, `client`, `previous_state`, `new_state`, `result_count` |
| `landing_list.paginated` | User navigates to a different page | `repo_owner`, `repo_name`, `client`, `page_number`, `total_count`, `state_filter` |
| `landing_list.item_opened` | User clicks/selects a landing request from the list | `repo_owner`, `repo_name`, `client`, `landing_number`, `landing_state`, `conflict_status`, `position_in_list`, `state_filter` |
| `landing_list.empty_state` | User sees an empty landing list | `repo_owner`, `repo_name`, `client`, `state_filter`, `is_filtered` |
| `landing_list.error` | API call fails | `repo_owner`, `repo_name`, `client`, `error_type`, `http_status` |

### Common Event Properties (all events)

- `session_id`: Unique session identifier
- `user_id`: Authenticated user ID (null for anonymous)
- `timestamp`: ISO 8601 event timestamp
- `client_version`: Client version string

### Funnel Metrics & Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| List → Detail drill-through rate | > 60% | Users viewing the list should open at least one landing request |
| Filter usage rate | > 25% | At least 25% of list views should involve a state filter change |
| Error rate | < 2% | Less than 2% of list load attempts should result in errors |
| P50 load time | < 500ms | Median time to first meaningful paint / data return |
| P95 load time | < 2000ms | 95th percentile load time |
| Pagination depth | Average < 3 pages | Most users should find what they need within the first 3 pages |
| Empty state rate | < 40% | Less than 40% of list views should show empty states |
| CLI adoption | > 15% of list views | CLI should represent a meaningful share of landing list access |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|-----------------|
| `debug` | Pagination parameters parsed | `page`, `per_page`, `cursor`, `limit`, `resolved_page`, `resolved_per_page` |
| `debug` | State filter normalized | `raw_state`, `normalized_state` |
| `info` | Landing list request served | `owner`, `repo`, `state_filter`, `page`, `per_page`, `result_count`, `total_count`, `duration_ms`, `user_id` |
| `warn` | Invalid pagination parameter | `parameter`, `raw_value`, `error_message` |
| `warn` | Invalid state filter value | `raw_state`, `error_message` |
| `warn` | Slow query (>1000ms) | `owner`, `repo`, `state_filter`, `page`, `per_page`, `duration_ms`, `total_count` |
| `warn` | Rate limit triggered | `user_id`, `ip`, `endpoint`, `limit`, `retry_after` |
| `error` | Repository resolution failure | `owner`, `repo`, `error_type` |
| `error` | Database query failure | `owner`, `repo`, `error_message`, `query_name` |
| `error` | Author resolution failure | `author_id`, `landing_number`, `error_message` |
| `error` | Unhandled exception in route handler | `owner`, `repo`, `error_message`, `stack_trace` |

All logs use structured JSON format with `request_id` for correlation.

### Prometheus Metrics

**Counters:**
| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_landing_list_requests_total` | `status`, `state_filter` | Total landing list API requests |
| `codeplane_landing_list_errors_total` | `error_type` (`validation`, `not_found`, `auth`, `internal`) | Total errors by type |
| `codeplane_landing_list_rate_limited_total` | — | Total rate-limited requests |

**Histograms:**
| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `codeplane_landing_list_duration_seconds` | `state_filter` | 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5 | Request duration |
| `codeplane_landing_list_result_count` | `state_filter` | 0, 1, 5, 10, 20, 30, 50, 100 | Items returned per request |

**Gauges:**
| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_landing_list_total_count` | `repo` (sampled) | Total landing requests per repo |

### Alerts

#### Alert: `LandingListHighErrorRate`
- **Condition:** `rate(codeplane_landing_list_errors_total[5m]) / rate(codeplane_landing_list_requests_total[5m]) > 0.05` for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_landing_list_errors_total` by `error_type` label to identify the dominant error class
  2. If `internal` errors dominate: check application logs filtered by `request_id` for stack traces. Likely causes: database connection pool exhaustion, query timeout, or service crash loop
  3. If `not_found` errors dominate: check for possible routing misconfiguration or a bulk client hitting deleted repos
  4. If `auth` errors dominate: check for expired tokens or a recent auth infrastructure change
  5. Verify database connectivity: `SELECT 1` against the primary database
  6. Check recent deployments — consider rollback if error spike correlates with a deploy

#### Alert: `LandingListHighLatency`
- **Condition:** `histogram_quantile(0.95, rate(codeplane_landing_list_duration_seconds_bucket[5m])) > 2` for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check database query performance: look for slow query logs on `listLandingRequestsWithChangeIDsByRepoFiltered` and `countLandingRequestsByRepoFiltered`
  2. Check if a specific repository is causing the slowdown (very high landing count without index)
  3. Verify database connection pool utilization — connection starvation causes queuing
  4. Check system resources: CPU, memory, and I/O on the database host
  5. If a single repo is the cause, consider adding a composite index on `(repository_id, state, number)`
  6. Temporary mitigation: reduce `MAX_PER_PAGE` to reduce per-query cost

#### Alert: `LandingListRateLimitSpike`
- **Condition:** `rate(codeplane_landing_list_rate_limited_total[5m]) > 10` for 3 minutes
- **Severity:** Info
- **Runbook:**
  1. Identify the user/IP triggering rate limits from access logs
  2. Determine if this is a legitimate automated client (CI, agent) or abuse
  3. If legitimate: consider issuing a higher rate-limit tier token or adjusting the rate limit configuration
  4. If abuse: consider IP-level blocking or token revocation
  5. Monitor for escalation — rate limit spikes can indicate a scraping attempt

### Error Cases and Failure Modes

| Error Case | HTTP Status | Recovery |
|------------|-------------|----------|
| Invalid `page` parameter | 400 | Client fixes parameter |
| Invalid `per_page` parameter | 400 | Client fixes parameter |
| Invalid `state` filter | 400 | Client uses valid enum value |
| Repository not found or not accessible | 404 | Client verifies repository exists and credentials are valid |
| Authentication required for private repo | 404 | Client authenticates |
| Rate limit exceeded | 429 | Client waits for `Retry-After` duration |
| Database connection failure | 500 | Automatic retry; alert fires if sustained |
| Author resolution failure | 500 (partial) | Degraded response; author field may be missing |
| Query timeout | 500 | Check query performance; may need index optimization |

## Verification

### API Integration Tests

| Test ID | Description |
|---------|-------------|
| API-LAND-LIST-001 | `GET /api/repos/:owner/:repo/landings` returns `200` with empty array when repo has no landing requests |
| API-LAND-LIST-002 | `GET /api/repos/:owner/:repo/landings` returns landing requests sorted by number descending |
| API-LAND-LIST-003 | Response includes `X-Total-Count` header matching actual total |
| API-LAND-LIST-004 | Response includes `Link` header with `first`, `last`, `next` relations on page 1 of multi-page result |
| API-LAND-LIST-005 | Response includes `Link` header with `prev` relation on page 2+ |
| API-LAND-LIST-006 | Default state filter returns only open landing requests |
| API-LAND-LIST-007 | `?state=open` returns only open landing requests |
| API-LAND-LIST-008 | `?state=closed` returns only closed landing requests |
| API-LAND-LIST-009 | `?state=draft` returns only draft landing requests |
| API-LAND-LIST-010 | `?state=merged` returns only merged landing requests |
| API-LAND-LIST-011 | `?state=` (empty) returns landing requests in all states |
| API-LAND-LIST-012 | State filter is case-insensitive (`?state=Open` works) |
| API-LAND-LIST-013 | `?state=invalid` returns validation error |
| API-LAND-LIST-014 | Default page size is 30 |
| API-LAND-LIST-015 | `?per_page=10` returns exactly 10 items when more exist |
| API-LAND-LIST-016 | `?per_page=100` returns up to 100 items (maximum valid size) |
| API-LAND-LIST-017 | `?per_page=101` returns `400 Bad Request` |
| API-LAND-LIST-018 | `?per_page=0` returns `400 Bad Request` |
| API-LAND-LIST-019 | `?per_page=-1` returns `400 Bad Request` |
| API-LAND-LIST-020 | `?page=0` returns `400 Bad Request` |
| API-LAND-LIST-021 | `?page=-1` returns `400 Bad Request` |
| API-LAND-LIST-022 | `?page=abc` returns `400 Bad Request` |
| API-LAND-LIST-023 | `?page=999` (beyond total) returns empty array with correct `X-Total-Count` |
| API-LAND-LIST-024 | Cursor-based pagination: `?cursor=0&limit=10` returns first 10 items |
| API-LAND-LIST-025 | Cursor-based pagination: `?cursor=10&limit=10` returns items 11-20 |
| API-LAND-LIST-026 | Cursor-based pagination: `?limit=200` is clamped to 100 |
| API-LAND-LIST-027 | Cursor-based pagination: `?cursor=-5` is clamped to 0 |
| API-LAND-LIST-028 | When both `page` and `cursor` are present, `page`/`per_page` takes precedence |
| API-LAND-LIST-029 | Each item in response has all required fields: `number`, `title`, `body`, `state`, `author`, `change_ids`, `target_bookmark`, `conflict_status`, `stack_size`, `created_at`, `updated_at` |
| API-LAND-LIST-030 | `author` field is an object with `id` (number) and `login` (string) |
| API-LAND-LIST-031 | `change_ids` is an array of strings ordered by position in stack |
| API-LAND-LIST-032 | `created_at` and `updated_at` are valid ISO 8601 timestamps |
| API-LAND-LIST-033 | Landing request with zero change IDs returns `change_ids: []` and `stack_size: 0` |
| API-LAND-LIST-034 | Landing request with Unicode characters in title returns them correctly |
| API-LAND-LIST-035 | Unauthenticated request to public repo returns landing requests |
| API-LAND-LIST-036 | Unauthenticated request to private repo returns `404` |
| API-LAND-LIST-037 | Authenticated user without read access to private repo returns `404` |
| API-LAND-LIST-038 | Authenticated user with read access to private repo returns landing requests |
| API-LAND-LIST-039 | Non-existent repository returns `404` |
| API-LAND-LIST-040 | Non-existent owner returns `404` |
| API-LAND-LIST-041 | Pagination of exactly `per_page` items on last page returns correct items |
| API-LAND-LIST-042 | Creating a new landing request then listing shows it at position 0 (newest first) |
| API-LAND-LIST-043 | Closing a landing request then filtering by `state=closed` includes it |
| API-LAND-LIST-044 | Response time for a repository with 100 landing requests is under 2 seconds |

### CLI E2E Tests

| Test ID | Description |
|---------|-------------|
| CLI-LAND-LIST-001 | `lr list` returns landing requests as formatted table |
| CLI-LAND-LIST-002 | `lr list --json` returns valid JSON array |
| CLI-LAND-LIST-003 | `lr list --state open` shows only open landing requests |
| CLI-LAND-LIST-004 | `lr list --state closed` shows only closed landing requests |
| CLI-LAND-LIST-005 | `lr list --state merged` shows only merged landing requests |
| CLI-LAND-LIST-006 | `lr list --state landed` is transparently converted to `merged` |
| CLI-LAND-LIST-007 | `lr list --state all` shows landing requests in all states |
| CLI-LAND-LIST-008 | `lr list --limit 5` returns at most 5 results |
| CLI-LAND-LIST-009 | `lr list --page 2 --limit 5` returns page 2 |
| CLI-LAND-LIST-010 | `lr list` with no landing requests outputs "No landing requests found" |
| CLI-LAND-LIST-011 | `lr list --repo owner/repo` uses the specified repo |
| CLI-LAND-LIST-012 | `lr list --json` output includes `number`, `title`, `state`, `change_ids` for each item |
| CLI-LAND-LIST-013 | `land list` (non-aliased form) works identically to `lr list` |
| CLI-LAND-LIST-014 | `lr list` against non-existent repo produces error message |
| CLI-LAND-LIST-015 | Table output columns are: Number, State, Title, change_ids |
| CLI-LAND-LIST-016 | `lr list --limit 100` returns up to 100 results (max valid) |
| CLI-LAND-LIST-017 | Creating a landing request then running `lr list --json` includes it in the result |

### Web UI E2E Tests (Playwright)

| Test ID | Description |
|---------|-------------|
| WEB-LAND-LIST-001 | Navigating to `/:owner/:repo/landings` renders the landing list page |
| WEB-LAND-LIST-002 | Landing list shows landing requests with number, title, state, author |
| WEB-LAND-LIST-003 | Default filter is "Open" — only open landing requests are visible |
| WEB-LAND-LIST-004 | Changing state filter to "Closed" updates the list to show only closed landing requests |
| WEB-LAND-LIST-005 | Changing state filter to "All" shows all landing requests |
| WEB-LAND-LIST-006 | Clicking a landing request number/title navigates to the detail page |
| WEB-LAND-LIST-007 | Empty state message is displayed when no landing requests match the filter |
| WEB-LAND-LIST-008 | Pagination controls appear when total count exceeds page size |
| WEB-LAND-LIST-009 | Clicking "Next" loads the next page of results |
| WEB-LAND-LIST-010 | State filter icon colors match: green (open), gray (draft), red (closed), purple (merged) |
| WEB-LAND-LIST-011 | Conflict status indicators are visible: ✓ (clean), ✗ (conflicted), ? (unknown) |
| WEB-LAND-LIST-012 | Target bookmark is displayed for each landing request |
| WEB-LAND-LIST-013 | Author avatar and login are displayed |
| WEB-LAND-LIST-014 | Relative timestamp (e.g., "2 hours ago") is displayed |
| WEB-LAND-LIST-015 | Total count badge shows correct count |
| WEB-LAND-LIST-016 | Page loads within 3 seconds for a repository with 50 landing requests |

### TUI E2E Tests

| Test ID | Description |
|---------|-------------|
| TUI-LAND-LIST-001 | Landing list screen renders at 120×40 with populated landings |
| TUI-LAND-LIST-002 | Landing list screen renders at 80×24 minimum with reduced columns |
| TUI-LAND-LIST-003 | Empty state shows "No landing requests yet" message |
| TUI-LAND-LIST-004 | `j`/`k` navigation moves focus between rows |
| TUI-LAND-LIST-005 | `Enter` on focused landing pushes detail view |
| TUI-LAND-LIST-006 | `f` cycles state filter and triggers API refresh |
| TUI-LAND-LIST-007 | `/` focuses search input; typing narrows visible results client-side |
| TUI-LAND-LIST-008 | `q` pops the screen and returns to previous view |
| TUI-LAND-LIST-009 | State icons render with correct colors for each state |
| TUI-LAND-LIST-010 | Conflict status icons render correctly |
| TUI-LAND-LIST-011 | Pagination triggers when scrolling to 80% of loaded items |
| TUI-LAND-LIST-012 | Memory cap of 500 items is respected with footer message |
| TUI-LAND-LIST-013 | Error state shows retry message; `R` retries the request |
| TUI-LAND-LIST-014 | `g l` navigation reaches the landing list from another screen |
| TUI-LAND-LIST-015 | Resize preserves focus and recalculates layout |
| TUI-LAND-LIST-016 | Landing with Unicode title renders without corruption |
| TUI-LAND-LIST-017 | Null author field renders as "—" |
| TUI-LAND-LIST-018 | Search + state filter compose correctly |
