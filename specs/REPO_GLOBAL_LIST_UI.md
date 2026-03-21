# REPO_GLOBAL_LIST_UI

Specification for REPO_GLOBAL_LIST_UI.

## High-Level User POV

When you open Codeplane's Explore page, you see every public repository on the instance — a browsable directory of all open-source work hosted by every user and organization. This is the front door for discovery. Whether you have just signed up and want to see what people are building, or you are an anonymous visitor evaluating Codeplane for the first time, the global repository list is where you start.

The list shows each repository's owner, name, description, star count, default bookmark, and when it was last updated. Repositories are sorted by most recently updated by default, so the most active projects rise to the top. You can also sort by most stars, most recently created, or name alphabetically — whatever helps you find what you are looking for. If you know you want a specific kind of project, you can filter by topic to narrow the list down.

This is different from searching. Search requires you to already have a query in mind. The global repository list is for browsing — scrolling through what exists, spotting interesting projects, and getting a sense of the community's work. When you find something interesting, clicking the repository name takes you straight into its overview page.

From the CLI, `codeplane repo explore` gives you the same browsable list in your terminal with sort, filter, and pagination flags. The TUI provides a dedicated Explore screen accessible via keybinding or the command palette. Whether you are in the browser, the terminal, or the desktop app, the experience is the same: one command or one click to see everything public on this Codeplane instance.

Pagination keeps things fast even on instances with thousands of repositories. The first page loads immediately, and you can page forward through the full list. The total count is always visible so you know how much there is to explore.

Private repositories never appear in this list. Only repositories marked as public by their owners are shown. This is a safe, intentional surface — repository owners control what is visible, and the global list respects that completely.

## Acceptance Criteria

### Definition of Done

The feature is complete when any visitor — anonymous or authenticated — can browse a paginated, sortable, filterable list of all public repositories on the Codeplane instance, with consistent results across API, web UI, CLI, and TUI. Private repositories are never included. Archived repositories are included but clearly marked. Pagination, sorting, filtering, empty states, and error handling are consistent across all surfaces. The feature is gated behind the `REPO_GLOBAL_LIST_UI` feature flag.

### Functional Constraints

- [ ] The endpoint returns only repositories where `is_public = TRUE`.
- [ ] Private repositories are never returned regardless of the caller's identity or role.
- [ ] The endpoint works for both anonymous and authenticated callers.
- [ ] Authenticated callers do not see additional repositories beyond what anonymous callers see (no private repos leak via this endpoint).
- [ ] Default sort order is `updated_at` descending, with `id` descending as a deterministic tiebreaker.
- [ ] Supported sort options: `updated` (default), `stars`, `created`, `name_asc`, `name_desc`.
- [ ] Optional topic filter narrows results to repositories whose `topics` array contains the specified topic.
- [ ] Optional text query filter (`q`) performs a case-insensitive substring match against repository `name` and `description` (not full-text search — that is the search endpoint's job).
- [ ] Each item in the response includes exactly these fields: `id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `is_archived`, `is_fork`, `topics`, `created_at`, `updated_at`.
- [ ] The `is_public` field is always `true` for every item returned.
- [ ] The `owner` field uses the canonical casing of the owner's username or organization name.
- [ ] The response never includes internal fields such as `shard_id`, `search_vector`, `workspace_dependencies`, `workspace_idle_timeout_secs`, `workspace_persistence`, `landing_queue_mode`, `landing_queue_required_checks`, `next_issue_number`, `next_landing_number`, `lower_name`, `user_id`, or `org_id`.
- [ ] Default page size is 30 items.
- [ ] Maximum page size is 100 items. Requests for a page size exceeding 100 are clamped to 100 (not rejected).
- [ ] The response includes an `X-Total-Count` header containing the total number of matching public repositories.
- [ ] The response includes standard `Link` pagination headers (`rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"`) when applicable.
- [ ] If no public repositories exist (or none match filters), the endpoint returns 200 with an empty array `[]` and `X-Total-Count: 0`.
- [ ] Pagination beyond the last page returns 200 with an empty array (not 404).
- [ ] Both legacy pagination (`?page=N&per_page=M`) and cursor-based pagination (`?cursor=N&limit=M`) work.
- [ ] The feature is gated behind the `REPO_GLOBAL_LIST_UI` feature flag. When disabled, the API returns 404 and UI routes are not rendered.

### Boundary Constraints

- [ ] **Repository name in response:** 1–100 characters, `[a-zA-Z0-9._-]`.
- [ ] **Repository description in response:** 0–2048 characters. May contain Unicode.
- [ ] **`full_name`:** Always formatted as `{owner}/{name}`, using the canonical owner casing.
- [ ] **`is_public`:** Always `true` in this endpoint's response.
- [ ] **`num_stars`:** Non-negative integer. May be 0. Must be a number, not a string.
- [ ] **`default_bookmark`:** Non-empty string (typically `"main"`).
- [ ] **`topics`:** Array of strings. May be empty `[]`. Each topic is 1–50 characters, lowercase, `[a-z0-9-]`.
- [ ] **`is_archived`:** Boolean.
- [ ] **`is_fork`:** Boolean.
- [ ] **Timestamps:** ISO 8601 strings in UTC.
- [ ] **`page` parameter:** Positive integer ≥ 1. Values ≤ 0 are normalized to 1.
- [ ] **`per_page` / `limit` parameter:** Integer 1–100. Values > 100 are clamped to 100. Values ≤ 0 default to 30.
- [ ] **`cursor` parameter:** String-encoded non-negative integer offset. Non-numeric cursor values return 400 or are treated as offset 0.
- [ ] **`sort` parameter:** One of `"updated"`, `"stars"`, `"created"`, `"name_asc"`, `"name_desc"`. Invalid values default to `"updated"`.
- [ ] **`topic` filter parameter:** 1–50 characters, `[a-z0-9-]`. Invalid topic values return 400 with `"invalid topic filter"`.
- [ ] **`q` filter parameter:** 0–256 characters. Longer values are truncated to 256 characters (not rejected).

### Edge Cases

- [ ] An instance with zero public repositories returns an empty array with `X-Total-Count: 0`.
- [ ] An instance with exactly one public repository returns an array of length 1.
- [ ] A user has only private repositories — none appear in the global list.
- [ ] A repository is changed from public to private — it no longer appears in the global list.
- [ ] A repository is changed from private to public — it appears in the global list immediately.
- [ ] An archived public repository still appears in the list with `is_archived: true`.
- [ ] A forked public repository still appears in the list with `is_fork: true`.
- [ ] Requesting `?page=2&per_page=100` when there are 50 total public repos returns an empty array with `X-Total-Count: 50`.
- [ ] Requesting `?per_page=0` uses the default (30).
- [ ] Requesting `?per_page=-1` uses the default (30).
- [ ] Requesting `?per_page=200` clamps to 100.
- [ ] Requesting `?page=0` normalizes to page 1.
- [ ] Requesting `?sort=invalid_value` defaults to `"updated"`.
- [ ] Filtering by `?topic=rust` returns only repositories with `"rust"` in their topics array.
- [ ] Filtering by a topic that matches no repositories returns an empty array with `X-Total-Count: 0`.
- [ ] Filtering by `?q=codeplane` returns repositories whose name or description contains `"codeplane"` (case-insensitive).
- [ ] Combining `?q=tool&topic=rust&sort=stars` applies all filters and the sort correctly.
- [ ] A repository with a description containing emoji, CJK, or accented characters returns with correct encoding.
- [ ] A repository with `num_stars: 0` returns the integer 0 (not the string `"0"`).
- [ ] Two rapid consecutive identical requests return identical results (idempotency).
- [ ] A newly created public repository appears in the list immediately (within the same request cycle).
- [ ] A recently deleted repository does not appear in the list.
- [ ] Repos owned by users and repos owned by organizations both appear, interleaved by the active sort order.
- [ ] The `q` parameter with only whitespace returns the full unfiltered list (treated as no query).
- [ ] A URL-encoded `q` parameter with null bytes (e.g., `%00`) does not cause a 500 error.

## Design

### API Shape

#### `GET /api/repos`

**Description:** Retrieve a paginated, sortable, filterable list of all public repositories on this Codeplane instance.

**Authentication:** None required. Works for anonymous and authenticated callers identically.

**Feature flag:** `REPO_GLOBAL_LIST_UI`. Returns 404 with `{ "message": "not found" }` when the flag is disabled.

**Query parameters (legacy pagination):**

| Parameter | Type | Default | Description |
|-----------|--------|---------|--------------------------------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `per_page` | integer | 30 | Items per page (max 100) |

**Query parameters (cursor pagination):**

| Parameter | Type | Default | Description |
|-----------|--------|---------|--------------------------------------|
| `cursor` | string | `"0"` | String-encoded offset |
| `limit` | integer | 30 | Items per page (max 100) |

**Query parameters (filtering and sorting):**

| Parameter | Type | Default | Description |
|-----------|--------|---------|--------------------------------------|
| `sort` | string | `"updated"` | Sort order: `updated`, `stars`, `created`, `name_asc`, `name_desc` |
| `topic` | string | _(none)_ | Filter to repos with this topic in their `topics` array |
| `q` | string | _(none)_ | Case-insensitive substring filter on `name` and `description` |

**Success response — `200 OK`:**

```json
[
  {
    "id": 42,
    "owner": "acme-org",
    "full_name": "acme-org/widget-server",
    "name": "widget-server",
    "description": "High-performance widget API",
    "is_public": true,
    "num_stars": 128,
    "default_bookmark": "main",
    "is_archived": false,
    "is_fork": false,
    "topics": ["typescript", "api"],
    "created_at": "2025-06-15T09:00:00.000Z",
    "updated_at": "2026-03-21T12:00:00.000Z"
  }
]
```

**Response headers:**

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Total-Count` | Total number of matching public repositories |
| `Link` | Standard pagination `Link` header with `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"` as applicable |

**Error responses:**

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | Invalid pagination or topic filter | `{ "message": "invalid pagination parameters" }` or `{ "message": "invalid topic filter" }` |
| `404 Not Found` | Feature flag disabled | `{ "message": "not found" }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` with `Retry-After` header |

### SDK Shape

The SDK `RepoService` exposes a new method:

```typescript
listPublicRepos(
  options: {
    page: number;
    perPage: number;
    sort: "updated" | "stars" | "created" | "name_asc" | "name_desc";
    topic?: string;
    query?: string;
  }
): Promise<Result<RepoListResult, APIError>>
```

Where:

```typescript
interface ExploreRepoSummary {
  id: number;
  owner: string;
  full_name: string;
  name: string;
  description: string;
  is_public: true;
  num_stars: number;
  default_bookmark: string;
  is_archived: boolean;
  is_fork: boolean;
  topics: string[];
  created_at: string;
  updated_at: string;
}

interface RepoListResult {
  items: ExploreRepoSummary[];
  total_count: number;
  page: number;
  per_page: number;
}
```

The method:
1. Normalizes pagination parameters (clamp page ≥ 1, clamp perPage to 1–100, default 30).
2. Validates the `sort` value against allowed options, defaulting to `"updated"`.
3. Validates the `topic` filter if present (1–50 chars, `[a-z0-9-]`).
4. Truncates `query` to 256 characters if provided.
5. Counts total matching public repos via `countPublicRepos`.
6. Lists matching public repos via `listPublicRepos` with the sort, filter, LIMIT, and OFFSET parameters.
7. Maps each database row to `ExploreRepoSummary` via `mapExploreRepoSummary`, resolving the `owner` field from the user or org that owns the repo.
8. Returns `RepoListResult` with `items`, `total_count`, `page`, and `per_page`.

### Web UI Design

The web UI exposes the global repository list under a dedicated Explore route.

**Route:** `/explore` (primary), with `/explore/repos` as an alias.

**Layout:**
- The page sits within the main app shell (sidebar, global strip, command palette available).
- A page header reads "Explore" with a subtitle "Discover public repositories".
- Below the header: a filter/sort toolbar.
- Below the toolbar: the paginated repository list.
- Below the list: pagination controls.

**Filter/Sort Toolbar:**
- **Search input**: A text field with placeholder "Filter repositories..." allowing free-text search across name and description. Debounced at 300ms.
- **Topic dropdown/tag input**: A dropdown or tag input that lets the user select a topic to filter by. Shows topics that exist across public repos.
- **Sort dropdown**: Options labeled "Recently updated" (default), "Most stars", "Recently created", "Name A–Z", "Name Z–A". Maps to the `sort` API parameter.
- **Clear filters link**: Visible when any filter or non-default sort is active. Resets to defaults.

**Repository Card:**
Each repository card in the list displays:
- **Owner/repo name** as a link to `/:owner/:repo` (e.g., "acme-org/widget-server"), using the full_name, with the owner dimmed and the repo name bold and colored.
- **Visibility badge**: "public" tag (always public in this context, but shown for consistency with other repo list surfaces).
- **Description**: One or two lines, truncated with ellipsis if longer. Omitted entirely if empty.
- **Topic tags**: Rendered as small pill badges below the description. Only shown if `topics` is non-empty.
- **Star count** with a star icon (★).
- **Default bookmark** shown as a small tag/badge.
- **Last updated** as a relative time (e.g., "Updated 3 hours ago").
- **Archived indicator**: An "archived" badge if `is_archived` is true, shown alongside the visibility badge.
- **Fork indicator**: A fork icon and "forked from" note if `is_fork` is true.

**Pagination:**
- Below the repository list, a pagination control shows page numbers and prev/next buttons.
- First load fetches page 1 with 30 items.
- URL updates to `?page=2` (and `&sort=stars`, `&topic=rust`, `&q=api` as applicable) on navigation, preserving shareability. No full page reload.
- Total count displayed: "Showing 1–30 of 1,247 repositories".

**Empty states:**
- **No public repositories on instance**: "No public repositories yet" with a muted icon. If the viewer is authenticated, a secondary call-to-action: "Create a repository".
- **No results matching filters**: "No repositories match your filters" with a "Clear filters" link.

**Responsive behavior:**
- On narrow viewports (< 640px): topic tags and star count collapse into a second line. Sort dropdown moves below the search input.
- Tab bar and toolbar remain sticky below the page header.

**Loading state:**
- A skeleton loader shows 5 placeholder repo cards while the first page is fetching.
- Subsequent page navigations show a lighter loading indicator (e.g., opacity fade on the list).

**Feature flag gating:**
- When `REPO_GLOBAL_LIST_UI` is disabled, the `/explore` route is not rendered in the router and the sidebar does not show an "Explore" navigation item.

**Sidebar integration:**
- A new "Explore" item appears in the sidebar navigation (icon: compass or globe), placed below the home/dashboard item and above the workspaces item.

### CLI Command

#### `codeplane repo explore`

**Description:** Browse all public repositories on the Codeplane instance.

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--limit` | number | 30 | Number of results per page (max 100) |
| `--page` | number | 1 | Page number |
| `--sort` | string | `"updated"` | Sort: `updated`, `stars`, `created`, `name_asc`, `name_desc` |
| `--topic` | string | _(none)_ | Filter by topic |
| `--query` / `-q` | string | _(none)_ | Filter by name/description substring |
| `--json` | flag | _(off)_ | Output as JSON array |

**Output (human-readable, default):**

```
Public Repositories (1,247 total)

Name                          Stars  Default  Updated
acme-org/widget-server        128    main     2026-03-21T12:00:00.000Z
alice/my-project               42    main     2026-03-20T14:30:00.000Z
bob/dotfiles                    5    main     2026-02-10T09:15:00.000Z

Page 1 of 42
```

**Output (JSON, with `--json`):**

```json
[
  {
    "id": 42,
    "owner": "acme-org",
    "full_name": "acme-org/widget-server",
    "name": "widget-server",
    "description": "High-performance widget API",
    "is_public": true,
    "num_stars": 128,
    "default_bookmark": "main",
    "is_archived": false,
    "is_fork": false,
    "topics": ["typescript", "api"],
    "created_at": "2025-06-15T09:00:00.000Z",
    "updated_at": "2026-03-21T12:00:00.000Z"
  }
]
```

**Empty state:** When no repositories match: `"No public repositories found"`.

**Error behavior:**
- Feature flag disabled: non-zero exit code, stderr: `Error: not found`
- Invalid topic: non-zero exit code, stderr: `Error: invalid topic filter`

**Notes:**
- This command does NOT require authentication. It works without being signed in.
- The `--json` flag supports the standard `--json <field>` filtering syntax.

### TUI UI

A new Explore screen is added to the TUI.

**Reachable via:** `g e` keybinding, `:explore` in the command palette, `--screen explore` startup flag.

**Layout:**

```
┌── Explore ── Public Repositories ─────────────────────────────┐
│  Filter: [____________]  Sort: [Recently updated ▼]           │
│  Topic: [all ▼]                                               │
│                                                                │
│  ★ 128  acme-org/widget-server                                │
│           High-performance widget API                          │
│           typescript, api · main · Updated Mar 21, 2026        │
│                                                                │
│  ★  42  alice/my-project                                      │
│           A jj-native tool for project scaffolding             │
│           jj, scaffolding · main · Updated Mar 20, 2026        │
│                                                                │
│  ★   5  bob/dotfiles                  [archived]               │
│           main · Updated Feb 10, 2026                          │
│                                                                │
│  1,247 repos · Page 1 of 42  ← →                              │
└────────────────────────────────────────────────────────────────┘
```

- Star count shown for all repos (since all are public).
- Each card shows: star count, full_name (bold), description (dimmed, single-line truncated), topics (comma-separated, dimmed), default bookmark, and relative update time.
- Archived repos show an `[archived]` tag.
- Pressing Enter on a repository navigates to repository detail.
- Left/right arrow keys or `[` / `]` navigate pages.
- `/` focuses the filter input.
- `s` cycles the sort order.
- Tab moves between filter, sort, and topic controls.
- Empty state: `"No public repositories found"`.
- Empty filter result: `"No repositories match your filters. Press Esc to clear."`.

### Documentation

The following end-user documentation should be written:

1. **API Reference — List Public Repositories:** Document `GET /api/repos` with request/response examples, all query parameters (pagination, sort, topic, q), pagination headers, error codes, field descriptions, and the fact that authentication is optional. Include examples of filtering by topic and sorting by stars.

2. **CLI Reference — `codeplane repo explore`:** Document the command with all flags (`--limit`, `--page`, `--sort`, `--topic`, `--query`, `--json`), human-readable and JSON output examples, empty-state behavior, and note that no authentication is required.

3. **User Guide — Discovering Repositories:** A short guide explaining how to browse all public repositories on your Codeplane instance from the web UI (Explore page), CLI, TUI, and desktop. Include tips on using topic filters, sorting by stars to find popular projects, and the difference between Explore (browsing) and Search (querying).

## Permissions & Security

### Authorization Model

| Role | Can access `GET /api/repos`? | Notes |
|------|------------------------------|-------|
| Anonymous (unauthenticated) | ✅ Yes — sees all public repos | No private repos exposed |
| Authenticated user | ✅ Yes — sees all public repos | Same view as anonymous; no private repos |
| PAT-authenticated user | ✅ Yes — sees all public repos | Same view as anonymous |
| OAuth2 token holder | ✅ Yes — sees all public repos | No scope required |
| Admin | ✅ Yes — sees all public repos only | Admin sees the same list; admin repo list is a separate endpoint (`/api/admin/repos`) |

**Critical security constraint:** This endpoint must NEVER return repositories where `is_public = FALSE`. The visibility filter must be applied at the database query level, not as a post-fetch filter, to prevent data leaks from pagination edge cases.

### Rate Limiting

- **Authenticated callers:** 300 requests per minute per token/session.
- **Anonymous callers:** 60 requests per minute per IP address.
- **Rate limit response:** `429 Too Many Requests` with `Retry-After` header indicating seconds until reset.
- Rate limiting is enforced at the middleware layer.

### Data Privacy Constraints

- **Public data only:** The endpoint exclusively returns repositories that the owner has intentionally made public. No private repository metadata is ever exposed.
- **No internal fields exposed:** The `mapExploreRepoSummary` function explicitly selects only safe fields. Internal fields such as `shard_id`, `search_vector`, `workspace_dependencies`, `landing_queue_mode`, `landing_queue_required_checks`, `next_issue_number`, `next_landing_number`, `user_id`, and `org_id` are never included.
- **No PII exposure:** The response contains `owner` (a public username) and repository metadata. No email addresses, login history, IP addresses, or other PII is included.
- **No user-scoped enrichment:** Authenticated callers do not receive additional fields or repositories compared to anonymous callers. The response is identical regardless of auth status.
- **Owner resolution:** The `owner` field must be resolved from the user or organization's canonical username/orgname. The raw `user_id` or `org_id` is never returned.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `GlobalRepoListViewed` | On successful 200 response from `GET /api/repos` | `viewer_id` (nullable), `client`, `response_time_ms`, `result_count`, `total_count`, `page`, `per_page`, `sort`, `has_topic_filter`, `has_query_filter`, `is_anonymous` |
| `GlobalRepoListEmpty` | On successful 200 response with zero results and page 1 | `viewer_id` (nullable), `client`, `is_anonymous`, `has_topic_filter`, `has_query_filter`, `sort` |
| `GlobalRepoListPaginated` | On successful 200 response with page > 1 | `viewer_id` (nullable), `client`, `page`, `per_page`, `total_count` |
| `GlobalRepoListFiltered` | On any request with `topic` or `q` parameters set | `viewer_id` (nullable), `client`, `topic` (nullable), `query_length`, `sort`, `result_count`, `total_count` |
| `GlobalRepoListRepoClicked` | On click-through from explore to a repository (web/TUI) | `viewer_id` (nullable), `client`, `repo_id`, `repo_full_name`, `position_in_list`, `page` |

### Event Properties

- `viewer_id` (number | null): The authenticated viewer's ID, or null for anonymous callers.
- `client` (string enum): One of `"web"`, `"cli"`, `"tui"`, `"desktop"`, `"api"`.
- `response_time_ms` (number): Server-side response latency in milliseconds.
- `result_count` (number): Number of items returned in this page.
- `total_count` (number): Total number of matching public repositories.
- `page` (number): Current page number.
- `per_page` (number): Page size used.
- `sort` (string): Sort parameter used.
- `has_topic_filter` (boolean): Whether a topic filter was applied.
- `has_query_filter` (boolean): Whether a text query filter was applied.
- `is_anonymous` (boolean): Whether the caller is unauthenticated.
- `topic` (string | null): Topic filter value if applied.
- `query_length` (number): Length of the `q` parameter value (not the value itself, for privacy).
- `repo_id` (number): ID of the clicked repository.
- `repo_full_name` (string): Full name (owner/repo) of the clicked repository.
- `position_in_list` (number): 0-indexed position of the clicked repo in the rendered list.

### Funnel Metrics and Success Indicators

- **Global repo list view volume:** Total `GlobalRepoListViewed` events per day, segmented by client and `is_anonymous`. Primary adoption metric for the Explore surface.
- **Anonymous vs. authenticated split:** Percentage of views from anonymous callers. High anonymous traffic indicates the Explore page is functioning as a public discovery surface.
- **Filter adoption rate:** Percentage of `GlobalRepoListViewed` events where `has_topic_filter = true` or `has_query_filter = true`. Rising adoption means filters are useful and discoverable.
- **Click-through rate:** Ratio of `GlobalRepoListRepoClicked` to `GlobalRepoListViewed` events per session. Target: > 30% of explore views result in at least one repo click. Low click-through suggests the list is not surfacing interesting projects.
- **Pagination depth:** Distribution of `page` values. Users paging beyond page 3 regularly suggests the sort/filter options may need improvement.
- **Sort distribution:** Which `sort` values are most used. Informs whether default sort is appropriate.
- **Empty list rate:** Ratio of `GlobalRepoListEmpty` to total page-1 views. On a healthy instance this should be < 5%. On a new instance this is expected to be high.
- **Explore → Star conversion:** Percentage of `GlobalRepoListRepoClicked` events followed by a star action within the same session. Measures whether Explore drives engagement.

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Condition |
|-----------|-------|-------------------|----------|
| Global repo list request received | `DEBUG` | `request_id`, `viewer_id` (nullable), `page`, `per_page`, `sort`, `topic`, `q`, `client_ip` | Every request |
| Global repo list succeeded | `INFO` | `request_id`, `viewer_id`, `duration_ms`, `result_count`, `total_count`, `sort`, `topic`, `q` | 200 response |
| Global repo list bad request | `WARN` | `request_id`, `reason`, `raw_params` | 400 response |
| Global repo list feature flag disabled | `DEBUG` | `request_id` | 404 due to feature flag |
| Global repo list internal error | `ERROR` | `request_id`, `error_message`, `stack_trace`, `viewer_id` | 500 response |
| Rate limit exceeded on global repo list | `WARN` | `request_id`, `client_ip`, `viewer_id`, `rate_limit_bucket` | 429 response |
| Pagination clamped | `DEBUG` | `request_id`, `requested_per_page`, `clamped_per_page` | When per_page > 100 is clamped |
| Sort parameter defaulted | `DEBUG` | `request_id`, `requested_sort`, `used_sort` | When invalid sort value is normalized |
| Query parameter truncated | `DEBUG` | `request_id`, `original_length`, `truncated_length` | When `q` exceeds 256 characters |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_global_repo_list_requests_total` | Counter | `status` (200, 400, 404, 429, 500), `auth` (authenticated, anonymous) | Total global repo list requests |
| `codeplane_global_repo_list_request_duration_seconds` | Histogram | `status`, `auth` | Response latency distribution (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0) |
| `codeplane_global_repo_list_result_count` | Histogram | `auth` | Distribution of result counts per page (buckets: 0, 1, 5, 10, 20, 30, 50, 100) |
| `codeplane_global_repo_list_total_count` | Gauge | — | Most recent total public repo count returned (for capacity monitoring) |
| `codeplane_global_repo_list_filtered_requests_total` | Counter | `filter_type` (topic, query, both, none) | Requests segmented by filter usage |

### Alerts

#### Alert: Global Repo List Endpoint Elevated Latency

**Condition:** `histogram_quantile(0.99, rate(codeplane_global_repo_list_request_duration_seconds_bucket[5m])) > 2.0` sustained for 5 minutes.

**Severity:** Warning

**Runbook:**
1. Check database connection pool health via `SELECT count(*) FROM pg_stat_activity;`.
2. Check for slow queries via `pg_stat_statements` for `listPublicRepos` and `countPublicRepos` queries.
3. Verify the `is_public` column on the `repositories` table has an index. Run `EXPLAIN ANALYZE` on the listing query with `WHERE is_public = TRUE`.
4. Check if the `topic` filter is causing an unindexed array scan. Consider a GIN index on `topics` if topic filtering is slow.
5. Check if deep pagination (large OFFSET) is the cause. Users requesting page 100+ will experience degraded performance. Consider keyset pagination as a mitigation.
6. Check if concurrent anonymous traffic is overwhelming the connection pool. Consider caching the first page of the default sort.

#### Alert: Global Repo List Endpoint 5xx Spike

**Condition:** `rate(codeplane_global_repo_list_requests_total{status="500"}[5m]) > 0.1` sustained for 5 minutes.

**Severity:** Critical

**Runbook:**
1. Check server error logs for stack traces associated with the global repo list route (`GET /api/repos`).
2. Common causes: database connection failure, `mapExploreRepoSummary` mapping error (e.g., unexpected null on a joined owner field), pagination arithmetic overflow.
3. Verify database connectivity: attempt a direct SQL query against `repositories WHERE is_public = TRUE`.
4. Check if the owner resolution join (user or org lookup) is failing for orphaned repos. A repo whose `user_id` references a deleted user would cause a mapping error.
5. Check for recent deployments. If the 5xx spike correlates with a deploy, consider rolling back.
6. If the error is in topic filtering: check if the `topics` column has unexpected data formats (null vs empty array).

#### Alert: Global Repo List Elevated Anonymous Rate Limiting

**Condition:** `rate(codeplane_global_repo_list_requests_total{status="429", auth="anonymous"}[5m]) > 5` sustained for 10 minutes.

**Severity:** Warning

**Runbook:**
1. Check if a scraper or bot is hitting the explore endpoint aggressively. Look for concentrated `client_ip` values in the rate limit logs.
2. If a single IP is responsible: consider IP-level blocking via firewall or reverse proxy rules.
3. If distributed across many IPs: this may be legitimate traffic from a popular link. Consider temporarily raising the anonymous rate limit or adding a caching layer (e.g., CDN or in-memory cache for the first page of the default sort).
4. Verify the rate limit bucket configuration is correct (60 req/min/IP for anonymous).

#### Alert: Abnormally Low Public Repo Count

**Condition:** `codeplane_global_repo_list_total_count < 1` sustained for 30 minutes (on an instance that previously had public repos).

**Severity:** Warning

**Runbook:**
1. Verify the `repositories` table has data. Run `SELECT COUNT(*) FROM repositories WHERE is_public = TRUE;`.
2. Check if a migration or bulk operation accidentally set all repos to `is_public = FALSE`.
3. Check if the `listPublicRepos` query has a regression in its WHERE clause.
4. If data was deleted: restore from backup. If a query bug: investigate the SQL and deploy a fix.

### Error Cases and Failure Modes

| Failure Mode | Expected Behavior | User-Visible Error |
|---|---|---|
| Database connection lost | 500 Internal Server Error | `"internal server error"` |
| `mapExploreRepoSummary` receives null owner | 500 (data inconsistency) | `"internal server error"` |
| Feature flag disabled | 404 Not Found | `"not found"` |
| `per_page` set to extremely large value | Clamped to 100, 200 response | Normal paginated response |
| Negative page number | Normalized to page 1, 200 response | Normal first-page response |
| Non-numeric cursor value | 400 Bad Request | `"invalid pagination parameters"` |
| Invalid topic format | 400 Bad Request | `"invalid topic filter"` |
| Rate limit exceeded (anonymous) | 429 | `"rate limit exceeded"` with `Retry-After` header |
| Rate limit exceeded (authenticated) | 429 | `"rate limit exceeded"` with `Retry-After` header |
| OFFSET exceeds total rows | Empty array returned, 200 | Empty result set |
| Concurrent repo creation during listing | May or may not include new repo; eventually consistent | Normal response |
| Concurrent repo deletion during listing | Stale count possible; item may be missing from page | Normal response |
| Concurrent public→private toggle during listing | May briefly include a newly-private repo; eventually consistent | Normal response |
| `q` parameter with SQL injection attempt | Query is parameterized; no injection possible | Normal (possibly empty) response |
| Extremely long `q` parameter | Truncated to 256 characters | Normal response with truncated filter |

## Verification

### API Integration Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `GET /api/repos returns 200 with correct shape` | Create public repos, request the global list, assert 200 and each item has exactly the 13 required fields (`id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `is_archived`, `is_fork`, `topics`, `created_at`, `updated_at`). |
| 2 | `GET /api/repos returns only public repos` | Create 2 public repos and 1 private repo. Request global list. Assert response contains exactly 2 items and none have `is_public: false`. |
| 3 | `GET /api/repos works without authentication` | Request with no auth header or cookie. Assert 200 with public repos. |
| 4 | `GET /api/repos authenticated sees same repos as anonymous` | Make the same request authenticated and unauthenticated. Assert identical response bodies. |
| 5 | `GET /api/repos default sort is updated_at desc` | Create 3 public repos, update them in known order. Assert items are sorted by `updated_at` descending. |
| 6 | `GET /api/repos sort=stars sorts by num_stars desc` | Create public repos with different star counts. Request with `?sort=stars`. Assert items sorted by `num_stars` descending. |
| 7 | `GET /api/repos sort=created sorts by created_at desc` | Create public repos at different times. Request with `?sort=created`. Assert items sorted by `created_at` descending. |
| 8 | `GET /api/repos sort=name_asc sorts alphabetically` | Create public repos. Request with `?sort=name_asc`. Assert items sorted by `full_name` ascending. |
| 9 | `GET /api/repos sort=name_desc sorts reverse-alphabetically` | Request with `?sort=name_desc`. Assert items sorted by `full_name` descending. |
| 10 | `GET /api/repos sort=invalid defaults to updated` | Request with `?sort=bogus`. Assert items sorted by `updated_at` descending (same as default). |
| 11 | `GET /api/repos topic filter works` | Create repos with topics `["rust"]` and `["go"]`. Request with `?topic=rust`. Assert only rust-tagged repos appear. |
| 12 | `GET /api/repos topic filter with no matches returns empty` | Request with `?topic=nonexistent`. Assert 200, empty array, `X-Total-Count: 0`. |
| 13 | `GET /api/repos q filter matches name` | Create a repo named `"widget-server"`. Request with `?q=widget`. Assert the repo appears. |
| 14 | `GET /api/repos q filter matches description` | Create a repo with description `"High-performance API"`. Request with `?q=performance`. Assert the repo appears. |
| 15 | `GET /api/repos q filter is case-insensitive` | Create repo named `"MyProject"`. Request with `?q=myproject`. Assert the repo appears. |
| 16 | `GET /api/repos combined filters work` | Create repos with various topics and names. Request with `?q=api&topic=typescript&sort=stars`. Assert correct filtering, sorting, and count. |
| 17 | `GET /api/repos q with only whitespace returns full list` | Request with `?q=%20%20`. Assert same results as no `q` parameter. |
| 18 | `GET /api/repos excludes internal fields` | Assert response items do NOT contain `shard_id`, `search_vector`, `workspace_dependencies`, `workspace_idle_timeout_secs`, `workspace_persistence`, `landing_queue_mode`, `landing_queue_required_checks`, `next_issue_number`, `next_landing_number`, `lower_name`, `user_id`, `org_id`. |
| 19 | `GET /api/repos empty instance returns empty array` | On an instance with no public repos. Assert 200, `[]`, `X-Total-Count: 0`. |
| 20 | `GET /api/repos default pagination is 30` | Create 35 public repos. Request without pagination params. Assert response has exactly 30 items and `X-Total-Count: 35`. |
| 21 | `GET /api/repos respects per_page` | Request with `?per_page=5`. Assert response has exactly 5 items. |
| 22 | `GET /api/repos clamps per_page to 100` | Create 120 public repos. Request with `?per_page=200`. Assert response has exactly 100 items. |
| 23 | `GET /api/repos page 2 returns next set` | Create 35 public repos. Request `?page=1&per_page=20` and `?page=2&per_page=20`. Assert page 1 has 20 items, page 2 has 15 items, no overlap in IDs. |
| 24 | `GET /api/repos page beyond last returns empty` | Create 5 public repos. Request `?page=2&per_page=30`. Assert 200 with empty array. |
| 25 | `GET /api/repos cursor pagination works` | Request with `?cursor=0&limit=10`, then `?cursor=10&limit=10`. Assert no overlap and correct offset behavior. |
| 26 | `GET /api/repos X-Total-Count header is correct` | Create 7 public repos. Assert `X-Total-Count` header equals `7`. |
| 27 | `GET /api/repos X-Total-Count reflects filter` | Create 3 repos with topic `rust` and 4 without. Request `?topic=rust`. Assert `X-Total-Count: 3`. |
| 28 | `GET /api/repos Link header contains pagination links` | Create 50 public repos. Request `?page=2&per_page=10`. Assert `Link` header contains `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"`. |
| 29 | `GET /api/repos full_name format is correct` | Assert every item's `full_name` equals `{owner}/{name}`. |
| 30 | `GET /api/repos num_stars is a number not a string` | Assert `typeof item.num_stars === "number"` for each item. |
| 31 | `GET /api/repos timestamps are valid ISO 8601` | Assert `created_at` and `updated_at` parse as valid Date objects and match ISO 8601 format. |
| 32 | `GET /api/repos includes archived public repos` | Create a public repo and archive it. Assert it appears in the list with `is_archived: true`. |
| 33 | `GET /api/repos includes forked public repos` | Fork a public repo. Assert the fork appears in the list with `is_fork: true`. |
| 34 | `GET /api/repos includes both user-owned and org-owned public repos` | Create a user-owned and an org-owned public repo. Assert both appear. |
| 35 | `GET /api/repos per_page=0 defaults to 30` | Request with `?per_page=0`. Assert response has up to 30 items. |
| 36 | `GET /api/repos page=0 normalizes to page 1` | Request with `?page=0`. Assert response is the same as `?page=1`. |
| 37 | `GET /api/repos idempotency` | Make the same request twice rapidly. Assert both return identical 200 responses. |
| 38 | `GET /api/repos description with Unicode` | Create repo with description `"📦 测试 éàü"`. Assert round-trip fidelity. |
| 39 | `GET /api/repos with max per_page=100 and exactly 100 public repos` | Create exactly 100 public repos. Request with `?per_page=100`. Assert response has exactly 100 items. |
| 40 | `GET /api/repos with per_page=101 clamps and returns max 100` | Create 105 public repos. Request `?per_page=101`. Assert response has exactly 100 items. |
| 41 | `GET /api/repos response Content-Type is application/json` | Assert `Content-Type` header is `application/json`. |
| 42 | `GET /api/repos owner uses canonical casing` | Create user `TestUser`, create a public repo. Assert `owner` field is `"TestUser"` (not `"testuser"`). |
| 43 | `GET /api/repos newly public repo appears immediately` | Create a repo, make it public, then list. Assert it appears. |
| 44 | `GET /api/repos deleted repo does not appear` | Create a public repo, delete it, then list. Assert absent. |
| 45 | `GET /api/repos repo toggled to private disappears` | Create a public repo, make it private, then list. Assert it is absent. |
| 46 | `GET /api/repos topics field is array of strings` | Create repo with topics `["rust", "cli"]`. Assert `topics` is `["rust", "cli"]` in response. |
| 47 | `GET /api/repos topics field is empty array when no topics` | Create repo without topics. Assert `topics` is `[]`. |
| 48 | `GET /api/repos q parameter truncated at 256 chars` | Send `?q=` with a 300-character string. Assert 200 (no error) and results based on the first 256 characters. |
| 49 | `GET /api/repos q with null bytes does not crash` | Send `?q=%00test`. Assert 200 or 400 (not 500). |
| 50 | `GET /api/repos invalid topic format returns 400` | Send `?topic=INVALID_TOPIC!`. Assert 400 with `"invalid topic filter"`. |
| 51 | `GET /api/repos returns 404 when feature flag disabled` | Disable `REPO_GLOBAL_LIST_UI` flag. Request `GET /api/repos`. Assert 404 with `{ "message": "not found" }`. |
| 52 | `GET /api/repos is_public is always true` | Assert every item in the response has `is_public: true`. |

### CLI E2E Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 53 | `codeplane repo explore returns public repos` | Run `codeplane repo explore --json`. Assert exit code 0, array contains at least one item. |
| 54 | `codeplane repo explore --json output has correct fields` | Parse stdout as JSON array. Assert each item has `id`, `owner`, `full_name`, `name`, `description`, `is_public`, `num_stars`, `default_bookmark`, `is_archived`, `is_fork`, `topics`, `created_at`, `updated_at`. |
| 55 | `codeplane repo explore does not include private repos` | Create a private repo. Run `codeplane repo explore --json`. Assert no item has `is_public: false`. |
| 56 | `codeplane repo explore human-readable shows table` | Run without `--json`. Assert stdout contains `Name`, `Stars`, `Default`, `Updated` headers and a total count line. |
| 57 | `codeplane repo explore with no public repos shows empty message` | On an empty instance, run `codeplane repo explore`. Assert exit code 0, output contains `"No public repositories found"`. |
| 58 | `codeplane repo explore --limit 5 respects limit` | Run with `--limit 5 --json`. Assert array length ≤ 5. |
| 59 | `codeplane repo explore --page 2 respects pagination` | On instance with > 30 public repos. Run with `--page 2 --json`. Assert array is non-empty and different from page 1. |
| 60 | `codeplane repo explore --sort stars sorts by stars` | Run with `--sort stars --json`. Assert items sorted by `num_stars` descending. |
| 61 | `codeplane repo explore --topic rust filters by topic` | Create repos with topic `rust`. Run with `--topic rust --json`. Assert all items have `"rust"` in topics. |
| 62 | `codeplane repo explore -q widget filters by name` | Run with `-q widget --json`. Assert all items contain `"widget"` in name or description. |
| 63 | `codeplane repo explore works without authentication` | Run without auth config. Assert exit code 0 and valid output. |
| 64 | `codeplane repo explore --topic INVALID returns error` | Run with `--topic "BAD TOPIC!"`. Assert non-zero exit code and stderr contains `"invalid topic filter"`. |

### Web UI E2E Tests (Playwright)

| # | Test Name | Description |
|---|-----------|-------------|
| 65 | `Explore page loads and shows public repos` | Navigate to `/explore`. Assert the page title contains "Explore" and repository cards are visible. |
| 66 | `Explore page is accessible without authentication` | Open `/explore` in an unauthenticated browser. Assert public repos load (no redirect to login). |
| 67 | `Explore page repo card displays all expected fields` | Assert at least one card shows: owner/repo name, description, star count, default bookmark, and updated time. |
| 68 | `Explore page repo card links to repo page` | Click a repo name. Assert navigation to `/:owner/:repo`. |
| 69 | `Explore page shows empty state on empty instance` | On instance with no public repos, assert "No public repositories yet" is visible. |
| 70 | `Explore page sort dropdown changes order` | Select "Most stars" from sort dropdown. Assert first visible repo has the highest star count. |
| 71 | `Explore page topic filter narrows results` | Select a topic from the filter. Assert all visible repos have that topic tag. |
| 72 | `Explore page text filter narrows results` | Type a search term in the filter input. Assert visible repos match the term in name or description. |
| 73 | `Explore page clear filters resets to default` | Apply filters, then click "Clear filters". Assert the full unfiltered list loads. |
| 74 | `Explore page pagination shows correct total` | Assert total count text is displayed (e.g., "Showing 1–30 of 1,247 repositories"). |
| 75 | `Explore page pagination navigates between pages` | Click "Next". Assert new repos load. Click "Previous". Assert original repos reappear. |
| 76 | `Explore page URL updates with filters and page` | Apply sort=stars, topic=rust, page=2. Assert URL contains `?sort=stars&topic=rust&page=2`. |
| 77 | `Explore page loads correct state from URL params` | Navigate directly to `/explore?sort=stars&topic=rust`. Assert sort dropdown shows "Most stars" and topic filter shows "rust". |
| 78 | `Explore page archived repo shows archived badge` | Create and archive a public repo. Assert the repo card shows an "archived" badge on the Explore page. |
| 79 | `Explore page does not show private repos` | Create a private repo. Navigate to Explore. Assert the private repo is not visible. |
| 80 | `Explore sidebar navigation item is visible` | Assert the sidebar contains an "Explore" link. Click it. Assert navigation to `/explore`. |
| 81 | `Explore page is hidden when feature flag disabled` | Disable `REPO_GLOBAL_LIST_UI` flag. Assert `/explore` shows 404 or redirect, and sidebar has no "Explore" item. |
| 82 | `Explore page skeleton loader appears while fetching` | Intercept the API call with a delay. Assert skeleton placeholders are visible before data loads. |
| 83 | `Explore page handles empty filter results` | Type a query that matches nothing. Assert "No repositories match your filters" is visible with a "Clear filters" link. |

### TUI Integration Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 84 | `TUI explore screen renders public repos` | Launch TUI, navigate to explore screen (`:explore`). Assert screen contains repo names and star counts. |
| 85 | `TUI explore screen shows empty state` | On empty instance, navigate to explore. Assert empty state message. |
| 86 | `TUI explore screen pagination works` | On instance with > 30 public repos, assert pagination indicators and navigation keys (`[`, `]`) work. |
| 87 | `TUI explore screen sort cycles correctly` | Press `s` to cycle sort. Assert list reorders. |
| 88 | `TUI explore screen filter input works` | Press `/` to focus filter, type a term. Assert list narrows. |
| 89 | `TUI explore screen Enter navigates to repo detail` | Highlight a repo and press Enter. Assert navigation to repo detail screen. |

### Rate Limiting Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 90 | `Anonymous rate limit returns 429 after 60 requests/min` | Send 61 anonymous requests in rapid succession. Assert 429 on the 61st request. |
| 91 | `Anonymous rate limit returns Retry-After header` | Assert `Retry-After` header is present and contains a positive integer on 429. |
| 92 | `Authenticated rate limit returns 429 after 300 requests/min` | Send 301 authenticated requests in rapid succession. Assert 429 on the 301st request. |

### Feature Flag Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 93 | `API returns 404 when REPO_GLOBAL_LIST_UI flag is disabled` | Disable the flag. Assert `GET /api/repos` returns 404. |
| 94 | `API returns 200 when REPO_GLOBAL_LIST_UI flag is enabled` | Enable the flag. Assert `GET /api/repos` returns 200. |
| 95 | `CLI returns error when feature flag is disabled` | Disable the flag. Run `codeplane repo explore`. Assert non-zero exit code. |
