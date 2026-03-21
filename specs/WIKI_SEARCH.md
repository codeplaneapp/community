# WIKI_SEARCH

Specification for WIKI_SEARCH.

## High-Level User POV

When a repository's wiki grows from a handful of pages to dozens or hundreds, browsing a chronologically-ordered list stops being practical. Wiki search gives every Codeplane user — from a developer hunting for an architecture decision record to an agent indexing repository documentation — the ability to type a few words and instantly find the wiki pages they need.

The search is available everywhere Codeplane exposes the wiki: on the web, in the API, through the CLI, and inside the TUI. A user opens the wiki section of a repository, activates the search bar (or passes a query flag in the CLI), and types their query. As they type, the results narrow to pages where the title, slug, or body content matches. The most relevant results appear first — an exact slug or title match beats a prefix match, which beats a body-content hit buried in a paragraph. The experience is fast and fluid: the system debounces keystrokes in interactive clients so that only the final query triggers a server round-trip, and results arrive paginated so the response stays snappy even for large wikis.

Search is a read-only operation that inherits the repository's existing visibility rules. Anyone who can see the wiki can search it. No separate permission, subscription, or configuration is needed. For teams using automation or agents, the search is a standard query parameter on the wiki list API — no separate endpoint to learn — so any integration that already lists wiki pages gains search for free by adding `?q=your-query`.

When a search produces no results, the interface communicates this clearly and offers a way to reset to the full page list. When a search produces many results, pagination keeps the payload size bounded. When a search query contains special characters, SQL wildcards, or Unicode, the system handles escaping and encoding transparently so that users never see unexpected matches or errors.

Wiki search transforms the wiki from a static knowledge base that rewards people who already know where things are into a dynamic resource that helps anyone on the team — human or machine — find the right page in seconds.

## Acceptance Criteria

### Definition of Done

The WIKI_SEARCH feature is complete when a user can submit a free-text query against a repository's wiki pages and receive relevance-ranked, paginated results that match against page titles, slugs, and body content — consistently across the API, CLI, TUI, and Web UI surfaces.

### Core Behavior

- [ ] When the `q` query parameter is provided and non-empty (after trimming), the wiki list response is filtered to only pages matching the query
- [ ] Search matches against wiki page `title`, `slug`, and `body` content using case-insensitive substring matching (ILIKE)
- [ ] Search results are ranked by relevance:
  - Rank 0 (highest): Exact slug match (case-insensitive)
  - Rank 1: Exact title match (case-insensitive)
  - Rank 2: Title starts with the query (case-insensitive prefix)
  - Rank 3: Slug starts with the query (case-insensitive prefix)
  - Rank 4 (lowest): Body or partial match
- [ ] Within the same relevance rank, results are sorted by `updated_at` descending, then `id` descending as a tiebreaker
- [ ] An empty or whitespace-only query (after trimming) returns the full unfiltered wiki page list — no search is performed
- [ ] A search with no matching pages returns an empty array with `X-Total-Count: 0`
- [ ] Search results use the same response schema as the unfiltered wiki list — `id`, `slug`, `title`, `author` (with `id` and `login`), `created_at`, `updated_at` — with no `body` field in list responses
- [ ] The `X-Total-Count` response header reflects the total number of matching pages (not the page size)
- [ ] Search results are paginated identically to the unfiltered list: `page`/`per_page` model, default page 1, default per_page 30, max per_page 50

### Boundary Constraints

- [ ] Search query has no enforced maximum length at the API level, but clients should limit input to 120 characters for UX
- [ ] Very long search queries (up to 1000 characters) must not cause server errors
- [ ] Queries exceeding 1000 characters may be rejected with a 400 error
- [ ] Search query containing SQL wildcard characters (`%`, `_`, `\`) must be treated as literal characters — no unintended pattern matching
- [ ] Unicode characters in the search query are fully supported, including CJK, emoji, and combining marks
- [ ] Slug values in results are always lowercase, alphanumeric with hyphens only
- [ ] Timestamps in results are ISO 8601 format
- [ ] The response payload for a full page of search results (50 items) must remain under 500 KB

### Edge Cases

- [ ] Searching on a nonexistent repository returns 404
- [ ] Searching on a nonexistent owner returns 404
- [ ] Empty owner or empty repo name in the URL returns 400
- [ ] Concurrent wiki page creation or deletion during an active search does not crash the endpoint
- [ ] A query consisting entirely of whitespace (spaces, tabs, newlines) is treated as empty — returns unfiltered list
- [ ] A query with leading and trailing whitespace is trimmed before matching
- [ ] A single-character query is valid and returns matching results
- [ ] Repositories with thousands of wiki pages return search results within acceptable latency (< 2 seconds for P95)
- [ ] Rapid sequential search requests (e.g., from debounced typing) are handled without race conditions or stale result delivery
- [ ] A query that matches only in the `body` field (not title or slug) still returns the page in results at rank 4

## Design

### API Shape

#### Endpoint

```
GET /api/repos/:owner/:repo/wiki
```

Wiki search is not a separate endpoint — it is the same wiki list endpoint with the `q` query parameter. This is intentional: any client that already lists wiki pages gains search by adding a query parameter.

#### Query Parameters

| Parameter  | Type    | Default | Max | Description                                       |
|------------|---------|---------|-----|---------------------------------------------------|
| `page`     | integer | 1       | —   | Page number (1-indexed). Values ≤ 0 become 1.     |
| `per_page` | integer | 30      | 50  | Results per page. Capped at 50 silently.           |
| `q`        | string  | (empty) | —   | Full-text search across title, slug, and body.     |

#### Response

**Status:** `200 OK`

**Headers:**
- `X-Total-Count`: Total number of matching wiki pages (string-encoded integer)
- `Content-Type`: `application/json`

**Body:** JSON array of wiki page summaries:

```json
[
  {
    "id": "uuid-string",
    "slug": "getting-started",
    "title": "Getting Started",
    "author": {
      "id": "uuid-string",
      "login": "username"
    },
    "created_at": "2026-03-20T10:00:00.000Z",
    "updated_at": "2026-03-22T14:30:00.000Z"
  }
]
```

The `body` field is intentionally omitted from list/search responses to keep payloads compact.

#### Sort Order (With Search)

1. Relevance rank:
   - 0: Exact slug match (case-insensitive)
   - 1: Exact title match (case-insensitive)
   - 2: Title starts with query (case-insensitive)
   - 3: Slug starts with query (case-insensitive)
   - 4: Body or partial match
2. `updated_at` DESC (within same rank)
3. `id` DESC (final tiebreaker)

#### Error Responses

| Status | Condition                                     |
|--------|-----------------------------------------------|
| 400    | Empty owner or repo name in URL               |
| 400    | Query exceeds 1000 characters (optional guard) |
| 403    | Private repo and viewer lacks read access     |
| 404    | Repository not found                          |
| 429    | Rate limit exceeded                           |
| 500    | Internal server error                         |

---

### SDK Shape

#### WikiService.listWikiPages

```typescript
async listWikiPages(
  viewer: AuthUser | undefined,
  owner: string,
  repo: string,
  input: ListWikiPagesInput
): Promise<{ items: WikiPageResponse[]; total: number }>
```

**ListWikiPagesInput:**
```typescript
{
  query: string;   // Search term (empty string = no filter)
  page: number;    // Page number
  perPage: number; // Results per page
}
```

When `query` is non-empty after trimming, the service dispatches to `searchWikiPagesByRepo` (ILIKE + relevance ranking). When empty, it dispatches to the unfiltered `listWikiPagesByRepo` query. Pagination normalization (page ≤ 0 → 1, perPage clamped to [1, 50]) is performed by the service before query dispatch.

---

### CLI Command

#### `codeplane wiki list --query`

```
codeplane wiki list [OPTIONS]
```

| Flag       | Type   | Default | Description                                    |
|------------|--------|---------|------------------------------------------------|
| `--page`   | number | 1       | Page number                                    |
| `--limit`  | number | 30      | Results per page (max 50)                      |
| `--query`  | string | —       | Search titles, slugs, and body content         |
| `--repo`   | string | —       | Repository (OWNER/REPO). Auto-detected if omitted. |
| `--json`   | flag   | —       | Output as JSON array                           |

**Example usage:**

```bash
# Search wiki pages
codeplane wiki list --query "deployment" --repo alice/my-project

# Search with JSON output for scripting
codeplane wiki list --query "API" --json | jq '.[].title'

# Search with pagination
codeplane wiki list --query "guide" --page 2 --limit 10
```

**Human-readable output:**

```
Title              Slug               Author     Updated
Deployment Guide   deployment-guide   alice      2026-03-22T14:30:00.000Z
API Deployment     api-deployment     bob        2026-03-21T09:00:00.000Z
```

When the search returns no results: "No wiki pages found matching 'deployment'".

**Structured output (`--json`):** Returns the raw JSON array from the API, suitable for piping to `jq` or other tools.

---

### Web UI Design

The wiki search is presented as an inline search input at the top of the wiki list page.

**Layout:**

- The wiki list page (`/:owner/:repo/wiki`) has a search input above the page table
- The search input has a magnifying glass icon and placeholder text "Search wiki pages…"
- Typing in the search input debounces at 300ms and dispatches to the API with the `q` parameter
- Results replace the page table below with matching pages, preserving the same column layout
- A result count displays near the search input: "N results" or "No results"
- Clearing the input (or clicking a clear button) restores the unfiltered list
- Matching text segments in page titles are visually highlighted
- Pagination controls update to reflect the filtered result set
- The search query is reflected in the browser URL as a query parameter (`?q=...`) so that searches are shareable and bookmarkable

**Empty search results state:**

- The table area shows "No wiki pages match '[query]'" with a button/link to clear the search

**Keyboard shortcuts:**

- `/` focuses the search input from anywhere on the wiki list page
- `Escape` clears the search and restores focus to the page table
- `Enter` from the search input moves focus to the first result

---

### TUI UI

The TUI wiki search is embedded in the wiki list screen as an inline search toolbar.

**Activation:** Press `/` from the wiki list screen to focus the search input.

**Search toolbar layout:**

```
│ / getting█                                     3 results   │
```

- `/ ` prefix indicator in muted color (ANSI 245)
- Cursor visible in the input area
- Match count badge right-aligned: "N results" / "1 result" / "No results" (warning color for zero)

**Search behavior:**

- 300ms debounce before API dispatch
- Server-side search via `GET /api/repos/:owner/:repo/wiki?q={query}&page=1&per_page=30`
- "Searching…" indicator while request is in flight
- First matching result auto-focused when results arrive
- Match text highlighted in primary color (ANSI 33) in titles and slugs

**Keyboard bindings:**

| Key | Context | Action |
|-----|---------|--------|
| `/` | List focused | Activate search input |
| `/` | Input focused | Type literal `/` |
| Printable chars | Input focused | Append to query |
| `Backspace` | Input focused | Delete last character |
| `Ctrl+U` | Input focused | Clear entire query |
| `Ctrl+W` | Input focused | Delete last word |
| `Enter` | Input focused | Submit, close input, focus results |
| `Esc` (query non-empty) | Input focused | Clear query, restore full list |
| `Esc` (query empty, search active) | Input focused | Clear active search |
| `Esc` (query empty, no search) | Input focused | Pop screen |
| `j`/`k`/`↓`/`↑` | Result list | Navigate rows |
| `Enter` | Result list | Open wiki page detail |

**State preservation:** Navigating to a page detail and returning via `q` preserves search results, query, and cursor position. Leaving the wiki screen entirely clears search state.

**Responsive breakpoints:**

| Terminal Size | Search Input Width | Result Columns |
|---------------|--------------------|----------------|
| 80×24 | Full width - 2 | Title + Timestamp |
| 120×40 | 70% | Title + Slug + Author + Timestamp (all highlighted) |
| 200×60+ | 60% | Same columns, wider |

**Constraints:**

- Search input maximum: 120 characters (additional input silently ignored)
- Results per page: 30 items
- Memory cap: 500 items loaded
- Debounce delay: 300ms

---

### Documentation

The following end-user documentation should be written:

1. **Wiki Search Guide**: Explain how to search wiki pages across all surfaces (Web, CLI, TUI, API). Include examples of search queries and how relevance ranking works.
2. **API Reference — Wiki Search**: Document the `q` query parameter on `GET /api/repos/:owner/:repo/wiki`, relevance ranking behavior, and search-specific edge cases.
3. **CLI Reference — `wiki list --query`**: Document the `--query` flag, example invocations, JSON output for scripting, and behavior when no results are found.
4. **TUI Guide — Wiki Search**: Document the `/` keybinding, search input behavior, highlight semantics, and keyboard shortcuts during search.

## Permissions & Security

### Authorization Roles

Wiki search is a read-only operation that inherits the same access rules as the wiki list.

| Repository Visibility | Role                              | Access         |
|-----------------------|-----------------------------------|----------------|
| Public                | Anonymous (unauthenticated)       | ✅ Allowed      |
| Public                | Any authenticated user            | ✅ Allowed      |
| Private               | Anonymous (unauthenticated)       | ❌ 403 Forbidden |
| Private               | Repository Owner                  | ✅ Allowed      |
| Private               | Organization Owner (if org-owned) | ✅ Allowed      |
| Private               | Team Member (read/write/admin)    | ✅ Allowed      |
| Private               | Collaborator (read/write/admin)   | ✅ Allowed      |
| Private               | Authenticated, no explicit perm   | ❌ 403 Forbidden |

### Permission Resolution Order

1. Check if viewer is the repository owner → full access
2. If org-owned, check if viewer is the organization owner → full access
3. Resolve highest team permission for viewer across all teams linked to the repo
4. Resolve direct collaborator permission
5. Take the highest of team permission and collaborator permission
6. If highest is `read`, `write`, or `admin` → allowed
7. Otherwise → denied

### Rate Limiting

- **Authenticated users:** 300 requests per minute per user to the wiki list/search endpoint
- **Unauthenticated users (public repos):** 60 requests per minute per IP address
- **Rationale for shared limits:** Wiki search uses the same endpoint as wiki list. ILIKE queries are more expensive than unfiltered list queries, but the 300ms debounce in interactive clients naturally limits request volume from a single user session.
- **Pagination abuse:** The `per_page` cap of 50 prevents excessive row fetching per request

### Data Privacy

- Wiki pages on private repositories are only visible to authorized users. The search endpoint must never leak titles, slugs, or author information to unauthorized viewers.
- The `author` field exposes only `id` and `login` (username). No email or private profile information is included.
- Search queries are not persisted or logged at the application level. They appear only in standard HTTP request logs as query parameters. The full query string is not logged — only its length is recorded in structured logs.
- The `body` field is excluded from search results, reducing the risk of exposing large amounts of content in bulk API calls. Users must fetch individual pages to see body content.
- Search queries may contain PII (e.g., a user searching for a person's name). Query content is truncated to 120 characters in telemetry events and never logged in full in production log levels.

## Telemetry & Product Analytics

### Key Business Events

#### `WikiSearchPerformed`

Fired every time a non-empty search query is dispatched to the wiki list endpoint.

| Property             | Type    | Description                                               |
|----------------------|---------|-----------------------------------------------------------|
| `repository_id`      | string  | UUID of the repository                                    |
| `owner`              | string  | Repository owner login                                    |
| `repo`               | string  | Repository name                                           |
| `viewer_id`          | string? | UUID of the authenticated user (null if anonymous)        |
| `query_length`       | number  | Character length of the search query                      |
| `query`              | string  | The search query (truncated to 120 chars for privacy)     |
| `result_count`       | number  | Number of items returned on this page                     |
| `total_count`        | number  | Total matching items across all pages                     |
| `page`               | number  | Requested page number (after normalization)               |
| `per_page`           | number  | Requested per_page (after normalization)                  |
| `latency_ms`         | number  | Server-side processing time in milliseconds               |
| `client`             | string  | Client surface: `api`, `cli`, `tui`, `web`                |
| `has_results`        | boolean | Whether total_count > 0                                   |

#### `WikiSearchResultOpened`

Fired when a user opens a wiki page detail view from search results (applicable to Web, TUI).

| Property             | Type   | Description                                                |
|----------------------|--------|------------------------------------------------------------|
| `repository_id`      | string | UUID of the repository                                     |
| `viewer_id`          | string | UUID of the authenticated user                             |
| `wiki_slug`          | string | Slug of the opened wiki page                               |
| `query_length`       | number | Character length of the active search query                |
| `position_in_results`| number | 0-indexed position of the opened result in the list        |
| `total_results`      | number | Total matching results at time of open                     |
| `client`             | string | Client surface: `tui`, `web`                               |

#### `WikiSearchCleared`

Fired when a user explicitly clears an active search (Esc in TUI, clear button in Web).

| Property             | Type   | Description                                                |
|----------------------|--------|------------------------------------------------------------|
| `repository_id`      | string | UUID of the repository                                     |
| `viewer_id`          | string | UUID of the authenticated user                             |
| `query_length`       | number | Character length of the query that was cleared             |
| `total_results`      | number | Number of results that were showing                        |
| `time_searching_ms`  | number | Duration from search activation to clear                   |
| `client`             | string | Client surface                                             |

### Funnel Metrics & Success Indicators

| Metric                              | Definition                                                        | Success Target                     |
|-------------------------------------|-------------------------------------------------------------------|------------------------------------||
| Wiki search usage rate              | % of wiki list views that include a non-empty `q` parameter       | > 10% (indicates feature discovery)|
| Wiki search success rate            | % of search queries that return ≥ 1 result                       | > 70%                              |
| Wiki search → page open rate        | % of searches where user opens at least one result                | > 50%                              |
| Wiki search zero-result rate        | % of searches that return 0 results                               | < 30% (indicates content coverage) |
| P95 wiki search latency             | 95th percentile server-side response time for search queries      | < 500ms                            |
| Mean query length                   | Average character count of search queries                         | 3–20 characters (healthy range)    |
| Multi-page search rate              | % of searches where user requests page > 1                       | Track for UX insight               |
| Client surface distribution         | Distribution of search requests by client (api/cli/tui/web)      | Track for roadmap input            |
| Search refinement rate              | % of sessions with > 1 distinct search query                     | Track (indicates UX friction)      |

## Observability

### Logging Requirements

#### Request-Level Logging

Every wiki search request must emit a structured log entry at `INFO` level upon completion:

```json
{
  "level": "info",
  "msg": "wiki.search",
  "request_id": "uuid",
  "owner": "alice",
  "repo": "my-project",
  "viewer_id": "uuid-or-null",
  "page": 1,
  "per_page": 30,
  "query_length": 15,
  "result_count": 12,
  "total_count": 42,
  "duration_ms": 23,
  "status": 200
}
```

**Important:** The full query string is NOT logged at `INFO` level to avoid PII in logs. Only `query_length` is recorded.

#### Error Logging

- `WARN` level for 400/403/404 responses (client errors), including the error type and request_id
- `ERROR` level for 500 responses (server errors), including the full error stack trace and request_id
- `ERROR` level if `countSearchWikiPagesByRepo` returns null (indicates unexpected DB state)
- `WARN` level for 429 rate limit responses

#### Sensitive Data Policy

- Search query content (`q`) is logged only as its character length, never as the full string
- Viewer ID is logged but never email, session tokens, or cookies

### Prometheus Metrics

#### Counters

| Metric                                    | Labels                         | Description                                              |
|-------------------------------------------|--------------------------------|----------------------------------------------------------|
| `codeplane_wiki_search_requests_total`    | `status`, `owner`, `repo`      | Total wiki search requests by HTTP status                |
| `codeplane_wiki_search_errors_total`      | `error_type` (400/403/404/500) | Total wiki search errors by type                         |
| `codeplane_wiki_search_zero_results_total`| —                              | Total search requests returning zero results             |

#### Histograms

| Metric                                    | Labels | Buckets (seconds)                      | Description                              |
|-------------------------------------------|--------|----------------------------------------|------------------------------------------|
| `codeplane_wiki_search_duration_seconds`  | —      | 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5 | Request duration for wiki search   |
| `codeplane_wiki_search_result_count`      | —      | 0, 1, 5, 10, 20, 30, 50               | Number of items returned per search      |
| `codeplane_wiki_search_query_length`      | —      | 1, 3, 5, 10, 20, 50, 100, 120         | Distribution of search query lengths     |

#### Gauges

| Metric                                    | Labels          | Description                                              |
|-------------------------------------------|-----------------|----------------------------------------------------------|
| `codeplane_wiki_pages_total`              | `repository_id` | Total wiki pages per repository (updated on search)      |

### Alerts

#### Alert: WikiSearchHighErrorRate

**Condition:** `rate(codeplane_wiki_search_errors_total{error_type="500"}[5m]) / rate(codeplane_wiki_search_requests_total[5m]) > 0.05`

**Severity:** Critical

**Runbook:**
1. Check `codeplane_wiki_search_errors_total` dashboard to determine if errors are isolated to specific repositories or global.
2. Query application logs: `level=error msg=wiki.search` in the affected time window for stack traces.
3. Check PostgreSQL connection pool health: `SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%wiki_pages%'`.
4. If connection pool exhaustion: restart the server process. Investigate for connection leaks by checking long-running queries.
5. If specific query failures: check for schema migrations in progress or table locks with `SELECT * FROM pg_locks WHERE relation = 'wiki_pages'::regclass`.
6. If `countSearchWikiPagesByRepo` returns null: verify the wiki_pages table exists with `\dt wiki_pages` and check that the expected indexes are present.
7. Escalate to the database on-call if the problem persists after server restart and no migration is in progress.

#### Alert: WikiSearchHighLatency

**Condition:** `histogram_quantile(0.95, rate(codeplane_wiki_search_duration_seconds_bucket[5m])) > 2`

**Severity:** Warning

**Runbook:**
1. Check if latency spike correlates with a specific repository by examining the `owner`/`repo` labels on recent requests.
2. Check whether the issue is search-specific or affecting all wiki list requests.
3. Run `EXPLAIN ANALYZE` on the `searchWikiPagesByRepo` query for the affected repository to check for sequential scans on large tables.
4. If sequential scan detected: verify that `idx_wiki_pages_repository_id` index exists. Consider adding a trigram GIN index (`pg_trgm`) for ILIKE performance on large wikis.
5. Check overall DB load: `SELECT * FROM pg_stat_user_tables WHERE relname = 'wiki_pages'` for sequential scan counts vs. index scan counts.
6. If isolated to one repository with thousands of pages: consider full-text search index migration (moving from ILIKE to `tsvector`/`tsquery`).
7. If global: check for connection pool saturation or competing heavy queries.

#### Alert: WikiSearchZeroResultSpike

**Condition:** `rate(codeplane_wiki_search_zero_results_total[10m]) / rate(codeplane_wiki_search_requests_total[10m]) > 0.5`

**Severity:** Warning

**Runbook:**
1. This alert indicates that more than half of search queries are returning zero results, which is a product-health signal rather than a system-health signal.
2. Check if a recent content deletion (e.g., bulk wiki page cleanup) reduced the searchable content.
3. Review telemetry for the most common query lengths — very short queries (1 char) or very long queries may indicate UX confusion.
4. Check if the issue is isolated to specific repositories (sparse wikis) or global.
5. No immediate engineering action required unless accompanied by error rate or latency alerts. Route to the product team for content strategy review.

#### Alert: WikiSearchRateLimitSpike

**Condition:** `rate(codeplane_wiki_search_errors_total{error_type="429"}[5m]) > 50`

**Severity:** Warning

**Runbook:**
1. Identify the source of excessive requests by checking rate-limit logs for user IDs or IP addresses.
2. If a single user/IP: check for automated scripts or misconfigured clients. Consider temporary IP block if abusive.
3. If widespread: check whether the 300ms debounce in interactive clients is functioning correctly (may indicate a client regression).
4. If caused by legitimate usage (e.g., agent-heavy workflow): evaluate whether the 300 req/min limit should be adjusted.

### Error Cases and Failure Modes

| Error Case                                      | HTTP Status | Behavior                                                  |
|-------------------------------------------------|-------------|-----------------------------------------------------------|
| Repository not found                            | 404         | `{"error": "repository not found"}`                       |
| Empty owner in URL                              | 400         | `{"error": "owner is required"}`                          |
| Empty repo name in URL                          | 400         | `{"error": "repository name is required"}`                |
| Private repo, no auth                           | 403         | `{"error": "permission denied"}`                          |
| Private repo, insufficient permission           | 403         | `{"error": "permission denied"}`                          |
| DB search query returns null count              | 500         | `{"error": "failed to count wiki pages"}`                 |
| DB connection failure                           | 500         | Generic internal error                                    |
| Non-integer page/per_page params                | 200         | Silently defaults to 1/30 (NaN from parseInt → default)   |
| Rate limit exceeded                             | 429         | Standard rate-limit response with `Retry-After` header    |
| Query contains SQL wildcards (`%`, `_`)         | 200         | Treated as literal characters — no unexpected matching     |
| Query contains Unicode                          | 200         | Correct matching — ILIKE handles Unicode in PostgreSQL     |

## Verification

### API Integration Tests

#### Happy Path — Search

- [ ] **Search by title**: Create pages "Alpha Guide" and "Beta Reference". Search `q=Alpha` returns only "Alpha Guide".
- [ ] **Search by slug**: Create page with slug `api-reference`. Search `q=api-reference` returns it.
- [ ] **Search by body content**: Create page with body containing "deployment pipeline". Search `q=deployment` returns it.
- [ ] **Search is case-insensitive**: Create page titled "Architecture". Search `q=architecture` (lowercase) returns it.
- [ ] **Search is case-insensitive (uppercase query)**: Create page titled "setup". Search `q=SETUP` returns it.
- [ ] **Search matches partial strings**: Create page titled "Getting Started with Codeplane". Search `q=Started` returns it.
- [ ] **Search across multiple fields**: Create page with title "Config" and body "database configuration". Search `q=config` returns it (matches both title and body).
- [ ] **Search with no results**: Search `q=nonexistent-gibberish-xyz-12345`. Returns `[]` with `X-Total-Count: 0`.
- [ ] **Search with empty query returns unfiltered list**: `q=` or `q=   ` returns full page list.
- [ ] **Search with whitespace-only query returns unfiltered list**: `q=%20%20%20` returns full page list.

#### Relevance Ranking

- [ ] **Exact slug match ranks highest**: Create three pages — one with slug `setup`, one with title "Setup Guide" (slug `setup-guide`), one with body "setup instructions" (slug `instructions`). Search `q=setup`. First result has slug `setup`.
- [ ] **Exact title match ranks above prefix**: Create pages titled "Auth" and "Authentication". Search `q=Auth`. "Auth" appears before "Authentication".
- [ ] **Title prefix ranks above slug prefix**: Create page A (title "Deploy Guide", slug "deploy-guide") and page B (title "Other", slug "deploy-notes"). Search `q=deploy`. Page A (title prefix) appears before page B (slug prefix).
- [ ] **Slug prefix ranks above body match**: Create page A (slug "api-reference") and page B (slug "docs", body containing "api reference"). Search `q=api`. Page A (slug prefix) appears before page B (body match).
- [ ] **Within same rank, updated_at DESC is tiebreaker**: Create two pages with titles "Test A" and "Test B", both matching at rank 4. Update "Test B" more recently. Search `q=test`. "Test B" appears first.

#### Search with Pagination

- [ ] **Search pagination page 1**: Create 40 pages all containing "docs". Search `q=docs&per_page=10`. Returns exactly 10 items. `X-Total-Count: 40`.
- [ ] **Search pagination page 2**: Request `q=docs&per_page=10&page=2`. Returns items 11-20.
- [ ] **Search X-Total-Count reflects filtered total**: 50 total pages, 12 match query. `X-Total-Count` is `12`.
- [ ] **Search pagination beyond last page**: 5 matching pages, request `page=100&per_page=30`. Returns `[]` but `X-Total-Count: 5`.
- [ ] **Search with per_page=50 (max)**: 60 matching pages, `per_page=50`. Returns exactly 50 items.
- [ ] **Search with per_page exceeding max**: `per_page=100` silently capped to 50.

#### Boundary and Special Characters

- [ ] **Unicode search query**: Search with `q=日本語ドキュメント`. No error; returns pages matching the Unicode content.
- [ ] **Emoji in search query**: Create page titled "🚀 Launch Guide". Search `q=🚀`. Returns the page.
- [ ] **SQL wildcard `%` treated as literal**: Create pages "100% Complete" and "Progress". Search `q=100%25` (URL-encoded `%`). Returns only "100% Complete", not all pages.
- [ ] **SQL wildcard `_` treated as literal**: Create pages "file_name" and "filename". Search `q=file_name`. Returns only the page matching the literal underscore.
- [ ] **Backslash in query**: Search `q=path\\to\\file`. No error; treated as literal backslash matching.
- [ ] **Long search query (1000 chars)**: Send a 1000-character `q` value. Server responds with 200 (not 500).
- [ ] **Search query longer than 1000 chars**: Send a 1001-character `q` value. Predictable response (either 200 with results or 400 with validation error).
- [ ] **Single character query**: Search `q=a`. Returns all pages where title, slug, or body contains "a".
- [ ] **Search query with special regex chars**: Search `q=(test)`. No regex interpretation; treated as literal.
- [ ] **Search query with HTML entities**: Search `q=<script>`. Treated as literal text, no injection.

#### Permission Tests

- [ ] **Public repo, unauthenticated search**: Search succeeds with 200.
- [ ] **Public repo, authenticated search**: Search succeeds with 200.
- [ ] **Private repo, unauthenticated search**: Returns 403.
- [ ] **Private repo, repo owner search**: Search succeeds.
- [ ] **Private repo, org owner search**: Search succeeds.
- [ ] **Private repo, read collaborator search**: Search succeeds.
- [ ] **Private repo, write collaborator search**: Search succeeds.
- [ ] **Private repo, admin collaborator search**: Search succeeds.
- [ ] **Private repo, no-permission user search**: Returns 403.
- [ ] **Private repo, team member with read search**: Search succeeds.

#### Error Cases

- [ ] **Search on nonexistent repository**: Returns 404.
- [ ] **Search on nonexistent owner**: Returns 404.
- [ ] **Search with non-integer page**: `page=abc&q=test`. Defaults gracefully (no 500).
- [ ] **Search with non-integer per_page**: `per_page=xyz&q=test`. Defaults gracefully (no 500).

### CLI E2E Tests

- [ ] **`codeplane wiki list --query` filters results**: Create pages "Alpha Guide" and "Beta Reference". `--query Alpha` shows only "Alpha Guide".
- [ ] **`codeplane wiki list --query` no results**: `--query nonexistent-xyz`. Shows "No wiki pages found matching 'nonexistent-xyz'".
- [ ] **`codeplane wiki list --query --json` returns filtered JSON**: Output is valid JSON array with only matching pages.
- [ ] **`codeplane wiki list --query --limit 5`**: Returns at most 5 matching items.
- [ ] **`codeplane wiki list --query --page 2`**: With enough matching pages, returns second page of search results.
- [ ] **`codeplane wiki list --query` table output format**: Table has columns: Title, Slug, Author, Updated. Only matching rows shown.
- [ ] **`codeplane wiki list --query` case-insensitive**: `--query "alpha"` finds page titled "Alpha Guide".
- [ ] **`codeplane wiki list --query` body match**: Create page with title "Config" and body containing "database settings". `--query "database"` returns it.
- [ ] **`codeplane wiki list --query` with special characters**: `--query "100%"` does not cause errors.
- [ ] **`codeplane wiki list --query` with Unicode**: `--query "日本語"` does not cause errors.
- [ ] **`codeplane wiki list --query` relevance order**: Exact title match appears before body-only match in output.

### TUI E2E Tests

- [ ] **Search activation**: Press `/` on wiki list screen. Search toolbar appears with cursor.
- [ ] **Search dispatches to API**: Type "guide" and wait 300ms. API called with `q=guide`.
- [ ] **Search results replace list**: After typing and debounce, only matching pages shown in list.
- [ ] **Match count badge**: After search, badge shows correct count (e.g., "3 results").
- [ ] **Zero results state**: Search `q=nonexistent`. Shows "No wiki pages match 'nonexistent'" and "Press Esc to clear search".
- [ ] **Title highlighting**: Matching text in titles rendered in primary color.
- [ ] **Enter locks results**: Press Enter while in search input. Input closes, results stay, focus moves to list.
- [ ] **Esc clears search**: Press Esc with active query. Restores unfiltered list.
- [ ] **State preserved on detail return**: Open a result, press `q` to return. Search results and cursor position preserved.
- [ ] **Debounce prevents excessive requests**: Rapid typing of 10 characters fires only 1-2 API requests (not 10).
- [ ] **`/` re-opens with previous query**: After locking results with Enter, press `/`. Input opens with previous query pre-filled.
- [ ] **Pagination within search results**: With > 30 matching pages, scroll to bottom triggers next page load.
- [ ] **Keyboard navigation keys type in input**: `j`, `k`, `q`, `c`, `d` while search input is focused add characters to query (not interpreted as actions).

### Playwright (Web UI) E2E Tests

- [ ] **Search input visible on wiki page**: Navigate to `/:owner/:repo/wiki`. Search input with placeholder "Search wiki pages…" is visible.
- [ ] **Typing filters results**: Type "guide" in search input. Results update to show only matching pages.
- [ ] **Search is debounced**: Type rapidly. Network tab shows delayed API call, not one per keystroke.
- [ ] **Result count shown**: After search, result count badge shows correct number.
- [ ] **Zero results state**: Search for "nonexistent-xyz". Empty state shown with clear option.
- [ ] **Clear search restores full list**: Click clear button or clear input. Full page list returns.
- [ ] **Click result navigates to detail**: Click a matching page title. Detail view opens.
- [ ] **URL reflects search query**: After searching for "guide", browser URL contains `?q=guide`.
- [ ] **Bookmarked search URL loads results**: Navigate directly to `/:owner/:repo/wiki?q=guide`. Page loads with search pre-filled and results showing.
- [ ] **`/` keyboard shortcut focuses search**: Press `/`. Search input receives focus.
- [ ] **Escape clears search**: Press Escape with active search. Full list restored.
- [ ] **Pagination updates for search**: With many matching pages, pagination controls reflect filtered count.
- [ ] **Case-insensitive search**: Type "GUIDE" (uppercase). Finds pages with "guide" in lowercase.
- [ ] **Title highlighting**: Matching segments in page titles are visually distinct (bold, colored, or highlighted).
- [ ] **Private repo requires auth**: Unauthenticated user on private repo sees 403 or redirect.
