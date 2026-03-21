# LANDING_LIST_UI

Specification for LANDING_LIST_UI.

## High-Level User POV

When a developer navigates to a repository in Codeplane, they need a clear, scannable view of all landing requests — the jj-native equivalent of pull requests. The landing request list is the primary surface for understanding what changes are proposed, what's being reviewed, what has conflicts, and what has already landed.

From the web UI, the user visits the "Landings" tab on any repository page. They immediately see a list of open landing requests, sorted newest-first, with each row showing the landing number, title, author, target bookmark, conflict status, stack size, and how recently it was updated. A set of filter tabs at the top — Open, Draft, Closed, Merged, and All — lets the user quickly switch between states. The active tab is visually highlighted and shows a count badge so the user always knows how many landing requests exist in each state. Changing a filter tab updates the URL and resets the view to page one, and the browser's back and forward buttons work naturally with filter changes.

From the TUI, the experience is keyboard-driven. The user presses a key to open the landings screen for the current repository and immediately sees a compact table. They can cycle through state filters, sort orders, reviewer filters, target bookmark filters, and conflict status filters — all via single-key shortcuts. A picker overlay appears when selecting from a list of reviewers or bookmarks. Scrolling, pagination, and drill-through to landing detail all work with standard vim-style navigation keys.

From the CLI, the user types `codeplane land list` and gets a formatted table of open landing requests. They can pass `--state`, `--page`, and `--limit` flags to control what's shown, or `--json` for machine-readable output.

Across all surfaces, the landing list provides consistent data, consistent filtering, and consistent drill-through navigation to the landing request detail view. It is the central hub for jj-native code review workflow.

## Acceptance Criteria

- **List display**: The landing list page must display landing requests as a scrollable, paginated table showing: state indicator, number, title, target bookmark, conflict status, stack size, author, and relative updated timestamp.
- **Default filter**: On initial load with no query parameters, the list must default to showing only `open` state landing requests.
- **State filter tabs**: The UI must render filter tabs for Open, Draft, Closed, Merged, and All. Each tab must display the count of landing requests in that state.
- **State filter behavior**: Clicking a state filter tab must: immediately fetch landing requests matching the new state from the API; reset pagination to page 1; update the URL query parameter `?state=<value>`; visually highlight the active tab.
- **URL-driven state**: Loading the page with `?state=closed` must display closed landing requests. An invalid `?state=xyz` must fall back to the default (`open`) and remove the invalid parameter from the URL.
- **Browser history**: Filter changes must be reflected in browser history so that back/forward navigation restores the previous filter state.
- **Pagination**: The list must support page-based pagination with a default page size of 30 and a maximum page size of 100. Pagination controls must show "Page X of N" and provide previous/next navigation. Page 1 must disable the "previous" control. The last page must disable the "next" control.
- **Empty states**: When a repository has zero landing requests of any state, the list must show a contextual empty state message with guidance on how to create one. When a filter has zero results but other states have results, the message must indicate no matches for the selected filter.
- **Loading state**: While the API request is in flight, the list must show a non-blocking loading indicator without clearing previous content.
- **Error state**: If the API request fails, the list must display an error message with a retry action.
- **Row drill-through**: Clicking a landing request row (number or title) must navigate to the landing request detail page at `/:owner/:repo/landings/:number`.
- **Conflict status display**: Each row must visually indicate conflict status: clean (✓ green), conflicted (✗ red), or unknown/pending (? neutral).
- **Stack size display**: Each row must show the number of changes in the landing request stack.
- **Author display**: Each row must show the author's login and, where space permits, their avatar.
- **Target bookmark display**: Each row must show the target bookmark name prefixed with →.
- **Timestamp display**: Each row must show the `updated_at` timestamp in relative format.
- **Responsive layout**: The list must be usable at viewport widths from 320px (mobile) to 2560px (ultrawide). On narrow viewports, secondary columns (author, target bookmark) may be hidden.
- **Keyboard accessibility**: All interactive elements must be keyboard-navigable and have appropriate ARIA attributes.
- **Title truncation**: Titles longer than the column width must truncate with ellipsis. Full title available via tooltip.
- **Maximum title length**: Titles up to 255 characters must render without error.
- **Special characters in titles**: HTML entities, unicode, emoji, angle brackets, and quotes must render safely without XSS or layout breakage.
- **No landing requests in repository**: If the repository has never had a landing request, show a single onboarding empty state rather than filter tabs with all-zero counts.
- **Private repository access**: Anonymous and unauthorized users must see a 404 page for private repositories.
- **Rate limiting**: Rapid filter switching must be debounced (150ms) client-side.

### Definition of Done

1. The web UI landing list page renders at `/:owner/:repo/landings` with all columns, filters, pagination, and empty/error/loading states.
2. The TUI landing list screen is implemented with keyboard-driven filtering, sorting, and navigation.
3. All acceptance criteria pass automated verification.
4. The feature works consistently across all client surfaces (Web, TUI, CLI) using the same API contract.
5. Telemetry events fire correctly on all key user interactions.
6. Observability metrics and alerts are wired and verified.

## Design

### Web UI Design

#### Route

`/:owner/:repo/landings` — mounted under the repository layout shell.

#### Page Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ Repository Header (breadcrumb: owner / repo)                        │
├──────────────────────────────────────────────────────────────────────┤
│ Repository Tab Bar (Code | Issues | Landings* | Workflows | ...)     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Landing Requests                                         [+ New]    │
│                                                                      │
│  ┌─────────┬─────────┬──────────┬──────────┬─────────┐              │
│  │ Open(12)│Draft(3) │Closed(5) │Merged(42)│ All(62) │              │
│  └─────────┴─────────┴──────────┴──────────┴─────────┘              │
│                                                                      │
│  ┌────┬─────┬──────────────────────┬────────┬──────┬─────┬────┬────┐│
│  │ St │  #  │ Title                │ Target │ Conf │Stack│Auth│ Age ││
│  ├────┼─────┼──────────────────────┼────────┼──────┼─────┼────┼────┤│
│  │ 🟢 │ #62 │ Add OAuth2 PKCE flow │ → main │  ✓   │  3  │ wc │ 1h ││
│  │ 🟢 │ #61 │ Refactor workspace.. │ → main │  ✗   │  5  │ jd │ 3h ││
│  │ 🟢 │ #58 │ Fix notification st..│ → dev  │  ✓   │  1  │ ab │ 1d ││
│  └────┴─────┴──────────────────────┴────────┴──────┴─────┴────┴────┘│
│                                                                      │
│                    ← Previous  Page 1 of 3  Next →                   │
└──────────────────────────────────────────────────────────────────────┘
```

#### Column Specifications

| Column | Label | Width | Behavior | Responsive |
|--------|-------|-------|----------|------------|
| State indicator | (icon only) | 24px fixed | Colored dot: green=open, yellow=draft, gray=closed, purple=merged | Always visible |
| Number | `#` | 64px fixed | Clickable link to detail page, prefixed with `#` | Always visible |
| Title | `Title` | Fluid (fills remaining) | Clickable link to detail, ellipsis truncation, tooltip on hover | Always visible |
| Target bookmark | `Target` | 100px min | Prefixed with `→`, monospace font | Hidden below 768px |
| Conflict status | `Conflicts` | 48px fixed | ✓ (green), ✗ (red), ? (gray) | Hidden below 640px |
| Stack size | `Stack` | 48px fixed | Integer with "changes" suffix on hover | Hidden below 640px |
| Author | `Author` | 80px min | Avatar (16px) + login text | Hidden below 1024px |
| Updated | `Updated` | 96px min | Relative timestamp, absolute on hover | Always visible |

#### State Filter Tabs

- Rendered as a segmented control / tab bar above the table.
- Each tab shows the label and a count badge: `Open (12)`.
- Counts are fetched from the API's `X-Total-Count` header for the active state. Counts for inactive tabs populated by lightweight count requests or cached from previous navigations.
- Active tab has bottom border highlight and bold text.
- Tab order: Open, Draft, Closed, Merged, All.

#### Pagination Controls

- Below the table: `← Previous` | `Page X of N` | `Next →`.
- Total pages = ceil(`X-Total-Count` / `per_page`).
- Previous disabled on page 1. Next disabled on last page.
- Clicking pagination fetches new page and scrolls to top of list.

#### Empty States

1. **No landing requests exist**: Centered illustration with "No landing requests yet" and "Create landing request" button.
2. **No results for active filter**: Centered "No {state} landing requests" with "Try a different filter" subtext.
3. **Error loading**: Error icon with "Failed to load landing requests" and "Retry" button.

#### New Landing Request Button

- Right-aligned in page header. Only visible to users with write access or higher.
- Label: `+ New landing request` (or `+ New` on narrow viewports).

#### Interaction Details

- Rows highlight on hover. Entire row clickable. Keyboard tab stops on each interactive element.
- URL sync: `?state=open` (default can be omitted), `?page=2` for pagination.

### TUI UI Design

#### Screen Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Landings (18)                              owner/repo           │
│ State: Open │ Conflict: All │ Sort: Recently created            │
├──────┬──────────────────────────────┬──────┬──────┬─────────────┤
│  #   │ Title                        │Stack │ Conf │ Updated     │
├──────┼──────────────────────────────┼──────┼──────┼─────────────┤
│ ►#18 │ Add OAuth2 PKCE flow         │   3  │  ✓   │ 1 day ago   │
│  #17 │ Refactor workspace API       │   5  │  ✗   │ 3 days ago  │
│  #16 │ Fix notification stream      │   1  │  ✓   │ 5 days ago  │
├──────┴──────────────────────────────┴──────┴──────┴─────────────┤
│ Page 1/1  f:filter o:sort r:reviewer b:bookmark c:conflict q:back│
└─────────────────────────────────────────────────────────────────┘
```

#### Keyboard Bindings

| Key | Action |
|-----|--------|
| `j`/`↓` | Move selection down |
| `k`/`↑` | Move selection up |
| `Enter` | Open selected landing detail |
| `f` | Cycle state: Open → Draft → Merged → Closed → All → Open |
| `o` | Cycle sort: Recently created → Recently updated → Oldest → Largest stack → Smallest stack |
| `r` | Open reviewer picker overlay |
| `b` | Open target bookmark picker overlay |
| `c` | Cycle conflict: All → Clean → Conflicted |
| `x` | Clear all filters |
| `/` | Client-side fuzzy search on title |
| `Ctrl+D`/`Ctrl+U` | Page down/up |
| `R` | Retry on error |
| `q`/`Esc` | Return to previous screen |

#### Responsive Breakpoints

| Size | Behavior |
|------|----------|
| 80×24 | State filter only, compact columns |
| 120×40 | All filters visible, full columns |
| 200×60+ | Extra padding, full title display |

### CLI Command Design

#### Command

`codeplane land list [OPTIONS]` (aliases: `codeplane lr list`, `codeplane landing list`)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--state` | `open\|closed\|merged\|landed\|draft\|all` | `open` | Filter by state. `landed` aliases `merged`. |
| `--page` | integer | `1` | Page number |
| `--limit` | integer | `30` | Items per page (max 100) |
| `--repo`/`-R` | string | auto-detected | Repository in `OWNER/REPO` format |
| `--json` | boolean | `false` | Output raw JSON array |

#### Output Formats

Table:
```
Number  State    Title                              Target    Conflicts  Stack  Author   Updated
------  -------  ---------------------------------  --------  ---------  -----  -------  --------
#62     open     Add OAuth2 PKCE flow               main      clean      3      wc       1 hour ago
```

JSON: raw API response array.
Empty: `No landing requests found.`

### API Shape

#### `GET /api/repos/:owner/:repo/landings`

**Query Parameters:**
- `state` (string, default `"open"`): `open|closed|draft|merged|""`. Case-insensitive.
- `page` (integer, default 1): ≥1
- `per_page` (integer, default 30): 1–100
- `cursor` (integer, optional): cursor offset
- `limit` (integer, optional, max 100): cursor pagination limit

**Response (200):**
Headers: `X-Total-Count`, `Link` (RFC 5988)
Body: `LandingRequestResponse[]`

```typescript
interface LandingRequestResponse {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed" | "draft" | "merged";
  author: { id: number; login: string };
  change_ids: string[];
  target_bookmark: string;
  conflict_status: "clean" | "conflict" | "unknown";
  stack_size: number;
  created_at: string;
  updated_at: string;
}
```

**Errors:** 400 (invalid pagination), 404 (not found/no access), 422 (invalid state), 429 (rate limit).

### SDK / ui-core Shape

**React Hook (TUI):**
```typescript
function useLandings(params: {
  owner: string; repo: string;
  state?: "open" | "draft" | "closed" | "merged" | "";
  page?: number; perPage?: number;
}): { data: LandingRequestResponse[]; total: number; loading: boolean; error: Error | null; refetch: () => void; }
```

**SolidJS Resource (Web UI):**
```typescript
function createLandingsResource(params: () => {
  owner: string; repo: string; state?: string; page?: number; perPage?: number;
}): [Resource<LandingRequestResponse[]>, { total: Accessor<number>; refetch: () => void }]
```

### Documentation

1. **Guides > Landing Requests** (`docs/guides/landing-requests.mdx`): Add "Browsing Landing Requests" section covering web UI navigation, filtering, pagination, and drill-through.
2. **CLI Reference > land list**: Document all flags, examples, and output formats.
3. **TUI Reference > Landings Screen**: Document keyboard shortcuts and filter capabilities.

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| **Anonymous** | Can view landing list for **public** repositories only. |
| **Read** | Can view landing list for repositories where they have read access (public or private). |
| **Write** | Same as Read, plus the "New landing request" button is visible. |
| **Admin** | Same as Write. |
| **Owner** | Same as Admin. |

### Access Denied Behavior

- Private repositories must return HTTP 404 (not 401 or 403) to anonymous or unauthorized users, preventing repository existence enumeration.
- The web UI must show a generic 404 page, not a "you don't have access" message, for private repositories the user cannot access.

### Rate Limiting

- Standard rate limits: **60 requests per minute** for anonymous users, **300 requests per minute** for authenticated users.
- Rapid filter switching in the web UI and TUI must be debounced client-side at **150ms** to avoid hitting rate limits during normal use.
- The `429 Too Many Requests` response must include a `Retry-After` header.

### Data Privacy

- No PII is exposed beyond what is already public on user profiles (login, avatar).
- Landing request bodies may contain sensitive content; they are only returned to users with at least read access.
- The `author.id` field is an internal numeric ID and does not constitute PII exposure beyond existing user profile visibility.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `landing_list.viewed` | Landing list page loads successfully | `owner`, `repo`, `state_filter`, `result_count`, `page`, `per_page`, `client` (web/tui/cli), `is_empty` |
| `landing_list.filtered` | User changes state filter | `owner`, `repo`, `previous_state`, `new_state`, `result_count`, `client` |
| `landing_list.paginated` | User navigates to a different page | `owner`, `repo`, `page_number`, `total_pages`, `state_filter`, `client` |
| `landing_list.item_clicked` | User clicks through to a landing request detail | `owner`, `repo`, `landing_number`, `landing_state`, `position_in_list`, `client` |
| `landing_list.empty_state_seen` | User sees an empty state | `owner`, `repo`, `state_filter`, `empty_type` (no_items / no_matches), `client` |
| `landing_list.create_clicked` | User clicks "New landing request" button | `owner`, `repo`, `current_state_filter`, `client` |
| `landing_list.error` | API call fails | `owner`, `repo`, `error_type`, `http_status`, `client` |
| `landing_list.retry` | User clicks retry after error | `owner`, `repo`, `client` |

### Funnel Metrics & Success Indicators

1. **Landing list → Detail drill-through rate**: Percentage of `landing_list.viewed` sessions that produce at least one `landing_list.item_clicked`. Target: >40%.
2. **Filter engagement rate**: Percentage of `landing_list.viewed` sessions that produce at least one `landing_list.filtered`. Target: >15%.
3. **Create conversion**: Percentage of `landing_list.viewed` sessions that produce a `landing_list.create_clicked`. Benchmark, no target.
4. **Error rate**: Ratio of `landing_list.error` to `landing_list.viewed`. Target: <0.5%.
5. **Pagination depth**: Average maximum page reached per session. Indicator of whether the default page size is adequate.
6. **Client distribution**: Breakdown of `landing_list.viewed` by `client` property. Tracks adoption across surfaces.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | Condition |
|-----------|-------|-------------------|-----------|
| Landing list request received | `debug` | `owner`, `repo`, `state`, `page`, `per_page`, `user_id`, `request_id` | Every request |
| Landing list response sent | `info` | `owner`, `repo`, `state`, `result_count`, `total_count`, `duration_ms`, `request_id` | Every successful response |
| Landing list state validation failed | `warn` | `owner`, `repo`, `invalid_state_value`, `request_id` | Invalid state parameter |
| Landing list pagination out of range | `warn` | `owner`, `repo`, `page`, `total_pages`, `request_id` | Page exceeds available pages |
| Landing list access denied | `info` | `owner`, `repo`, `user_id`, `request_id` | 404 returned for access control |
| Landing list database error | `error` | `owner`, `repo`, `error_message`, `error_code`, `duration_ms`, `request_id` | Database query failure |
| Landing list rate limited | `warn` | `owner`, `repo`, `user_id`, `ip_address`, `request_id` | 429 returned |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_landing_list_requests_total` | Counter | `owner`, `repo`, `state`, `status_code` | Total landing list API requests |
| `codeplane_landing_list_duration_seconds` | Histogram | `owner`, `repo`, `state` | Request duration (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_landing_list_results_total` | Histogram | `state` | Results returned per request (buckets: 0, 1, 5, 10, 25, 50, 100) |
| `codeplane_landing_list_errors_total` | Counter | `error_type` (db_error, validation, rate_limit, auth) | Total errors by type |
| `codeplane_landing_list_empty_responses_total` | Counter | `state` | Requests returning zero results |

### Alerts & Runbooks

#### Alert: Landing List High Error Rate
- **Condition**: `rate(codeplane_landing_list_errors_total{error_type="db_error"}[5m]) / rate(codeplane_landing_list_requests_total[5m]) > 0.05`
- **Severity**: Critical
- **Runbook**:
  1. Check `codeplane_landing_list_duration_seconds` histogram for latency spikes — database may be overloaded.
  2. Query application logs for `landing list database error` entries filtered by the alerting time window.
  3. Check database connection pool metrics and query plan for `listLandingRequestsWithChangeIDsByRepoFiltered`.
  4. Verify `landing_requests` table has appropriate indexes on `(repository_id, state, number)`.
  5. If connection pool exhaustion, check for leaked connections and consider pool size increase.
  6. If query plan regression, run `EXPLAIN ANALYZE` and compare against baseline.
  7. Escalate to database on-call if not resolvable within 15 minutes.

#### Alert: Landing List High Latency
- **Condition**: `histogram_quantile(0.95, rate(codeplane_landing_list_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Check if latency is isolated to specific repositories (large repos with many landings).
  2. Review `codeplane_landing_list_results_total` for large result sets indicating missing pagination.
  3. Check database slow query logs.
  4. Verify `landing_request_changes` subquery is not causing N+1 patterns.
  5. For large repos (>1000 landings), consider index optimization.
  6. Monitor if issue self-resolves (transient) or persists.

#### Alert: Landing List Elevated Rate Limiting
- **Condition**: `rate(codeplane_landing_list_errors_total{error_type="rate_limit"}[10m]) > 50`
- **Severity**: Warning
- **Runbook**:
  1. Identify top IPs and user IDs being rate-limited from structured logs.
  2. Determine if traffic is from a misbehaving client (missing debounce), script, or attack.
  3. If legitimate client bug: file issue, notify client team, consider temporary limit increase.
  4. If attack/scraping: consider IP-level blocking at load balancer.
  5. Review client-side debounce implementation.

#### Alert: Landing List Zero Traffic
- **Condition**: `rate(codeplane_landing_list_requests_total[30m]) == 0` (during business hours)
- **Severity**: Warning
- **Runbook**:
  1. Verify server health via health check endpoints.
  2. Check if route is still mounted in server route tree.
  3. Verify DNS and load balancer health.
  4. Check if recent deployment broke route registration.
  5. Test manually with `curl` against the API endpoint.

### Error Cases & Failure Modes

| Failure Mode | Behavior | Detection |
|--------------|----------|-----------|
| Database connection failure | 500 returned; client shows error with retry | `errors_total{error_type="db_error"}` |
| Invalid state parameter | 422 with structured error body | `errors_total{error_type="validation"}` |
| Repository not found | 404 (same as access denied) | Access denied log at `info` level |
| Rate limit exceeded | 429 with `Retry-After` header | `errors_total{error_type="rate_limit"}` |
| Query timeout (>30s) | 504 Gateway Timeout | Duration histogram p99 spike |
| Malformed pagination | 400 with error details | Validation warning log |
| Author resolution failure | Fallback author data returned; error logged | Error-level log |

## Verification

### API Integration Tests

1. **List open landing requests (default)**: `GET /api/repos/:owner/:repo/landings` returns 200 with only `open` state landing requests, sorted by number descending.
2. **List with explicit state=open**: `GET ...?state=open` returns same result as default.
3. **List closed landing requests**: `GET ...?state=closed` returns only closed landing requests.
4. **List draft landing requests**: `GET ...?state=draft` returns only draft landing requests.
5. **List merged landing requests**: `GET ...?state=merged` returns only merged landing requests.
6. **List all states**: `GET ...?state=` (empty string) returns landing requests in all states.
7. **State filter case-insensitivity**: `?state=OPEN`, `?state=Open`, `?state=oPeN` all return same results as `?state=open`.
8. **State filter with whitespace**: `?state=%20open%20` (trimmed) returns open landing requests.
9. **Invalid state filter**: `?state=invalid` returns 422 with `{ resource: "LandingRequest", field: "state", code: "invalid" }`.
10. **Pagination defaults**: Request without pagination params returns at most 30 items.
11. **Pagination page 2**: `?page=2&per_page=10` returns items 11–20 when >10 exist.
12. **Pagination per_page=1**: Returns exactly 1 item per page.
13. **Pagination per_page=100 (maximum valid)**: Returns up to 100 items.
14. **Pagination per_page=101 (exceeds max)**: Returns 400 or silently clamps to 100.
15. **Pagination page=0**: Returns 400.
16. **Pagination page=-1**: Returns 400.
17. **Pagination page=abc (non-integer)**: Returns 400.
18. **Pagination per_page=0**: Returns 400.
19. **Pagination beyond last page**: Returns 200 with empty array and correct `X-Total-Count`.
20. **X-Total-Count header**: Matches total items for the active filter.
21. **Link header present**: RFC 5988 with `first`, `last`, `next`, `prev` relations.
22. **Link header omits prev on page 1**: `prev` absent on first page.
23. **Link header omits next on last page**: `next` absent on last page.
24. **Response shape validation**: Each item has `number`, `title`, `body`, `state`, `author`, `change_ids`, `target_bookmark`, `conflict_status`, `stack_size`, `created_at`, `updated_at`.
25. **Change IDs ordered by stack position**: `change_ids` ordered by `position_in_stack` ascending.
26. **Empty repository (no landings)**: 200 with empty array and `X-Total-Count: 0`.
27. **Single landing request**: Array with exactly one item.
28. **Large page (100 items)**: Returns exactly 100 items with `per_page=100`.
29. **Maximum title length (255 chars)**: Renders correctly.
30. **Special characters in title**: Unicode, emoji, angle brackets, quotes returned as valid JSON.
31. **Empty body**: `body` is empty string, not null.
32. **Zero change_ids**: `change_ids` is `[]`.
33. **Public repo, anonymous user**: Returns 200.
34. **Private repo, anonymous user**: Returns 404.
35. **Private repo, authenticated with read access**: Returns 200.
36. **Private repo, authenticated without access**: Returns 404.
37. **Non-existent repository**: Returns 404.
38. **Non-existent owner**: Returns 404.
39. **Rate limiting enforcement**: >60 requests/minute as anonymous returns 429.
40. **Cursor pagination**: `?cursor=0&limit=10` returns first 10 items.
41. **Cursor + legacy pagination**: When both provided, `page`/`per_page` takes precedence.
42. **Sort order consistency**: Always sorted by `number` descending.

### CLI Integration Tests

43. **`land list` default**: Returns table with open landing requests.
44. **`land list --state closed`**: Only closed landings.
45. **`land list --state all`**: All states.
46. **`land list --state landed`**: Alias for merged.
47. **`land list --json`**: Valid JSON array.
48. **`land list --json --state merged`**: JSON respects filter.
49. **`land list --limit 5`**: At most 5 items.
50. **`land list --page 2 --limit 5`**: Correct page 2.
51. **`land list -R owner/repo`**: Explicit repo works.
52. **`land list` in jj working copy**: Auto-detects repository.
53. **`land list` no results**: Outputs "No landing requests found."
54. **`land list --state invalid`**: Error message, non-zero exit code.

### Web UI E2E Tests (Playwright)

55. **Navigate to landing list**: Click Landings tab → page at `/:owner/:repo/landings`.
56. **Default state shows open**: Open tab active, only open landings visible.
57. **Filter tab - Closed**: Click Closed → URL `?state=closed`, only closed landings.
58. **Filter tab - Draft**: Only draft landings shown.
59. **Filter tab - Merged**: Only merged landings shown.
60. **Filter tab - All**: All states shown.
61. **Count badges**: Each tab shows correct count.
62. **URL-driven initial state**: Navigate to `?state=closed` directly → Closed tab active.
63. **Invalid URL state fallback**: `?state=xyz` → falls back to Open, param removed.
64. **Browser back restores filter**: Closed → Back → Open active.
65. **Pagination renders**: >30 items → pagination controls visible.
66. **Pagination next**: Next → page 2 with different items.
67. **Pagination previous**: Page 2 → Previous → page 1.
68. **Pagination disabled states**: Previous disabled on page 1, Next on last page.
69. **Row click → detail**: Click row → `/:owner/:repo/landings/:number`.
70. **Number link works**: `#N` link navigates to detail.
71. **Title link works**: Title navigates to detail.
72. **Conflict status icons**: ✓ for clean, ✗ for conflicted, ? for unknown.
73. **Stack size displayed**: Each row shows stack count.
74. **Author displayed**: Login text visible.
75. **Target bookmark displayed**: "→ main" or similar.
76. **Relative timestamp**: "2 hours ago" format.
77. **Title truncation (255 chars)**: Truncates with ellipsis.
78. **Empty state - no landings**: Onboarding empty state with create button.
79. **Empty state - no filter matches**: "No merged landing requests" message.
80. **Loading state**: Loading indicator visible during network delay.
81. **Error state + retry**: API failure → error shown → Retry → re-request.
82. **New button visibility**: Write user sees it, read-only does not.
83. **Responsive 375px**: Reduced columns (state, number, title, updated).
84. **Responsive 768px**: Target bookmark column appears.
85. **Responsive 1280px**: All columns visible.
86. **Keyboard navigation**: Tab through filters and pagination, Enter activates.
87. **XSS prevention**: `<script>` in title renders as text.
88. **Filter change resets page**: Page 2 → change filter → page 1.
89. **Browser tab title**: "Landings · owner/repo · Codeplane".

### TUI Integration Tests

90. **Screen renders**: Landing list shows title, toolbar, table.
91. **Default state Open**: "State: Open" in toolbar.
92. **`f` cycles state**: Open → Draft → Merged → Closed → All → Open.
93. **`j`/`k` navigation**: Selection indicator moves.
94. **`Enter` opens detail**: Navigates to landing detail screen.
95. **`o` cycles sort**: All 5 sort options cycle and re-sort list.
96. **`c` cycles conflict filter**: All → Clean → Conflicted.
97. **`r` opens reviewer picker**: Overlay appears.
98. **`b` opens bookmark picker**: Overlay appears.
99. **`x` clears filters**: All reset to defaults.
100. **`/` opens search**: Text input for fuzzy search.
101. **`q` goes back**: Returns to previous screen.
102. **`R` retries on error**: Re-fetches data.
103. **Empty state**: Appropriate message when no landings.
104. **Picker dismiss**: Esc in picker → no filter change.
105. **Compact 80×24**: Essential columns only, condensed toolbar.
