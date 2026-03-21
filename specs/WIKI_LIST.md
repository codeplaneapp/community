# WIKI_LIST

Specification for WIKI_LIST.

## High-Level User POV

When working on a Codeplane repository, users need a way to discover and browse through all wiki pages associated with that repository. The wiki serves as the repository's knowledge base — a place for documentation, guides, architecture notes, runbooks, and any long-form content the team needs to share.

The wiki list is the front door to this knowledge base. A user navigates to a repository's wiki section and sees a chronologically-ordered table of all wiki pages, showing each page's title, its URL-friendly slug, who last edited it, and when it was last updated. The most recently updated pages appear first, making it easy to find what the team is actively working on.

When the wiki grows large, users can search across page titles, slugs, and body content to quickly find what they need. The search is intelligent — it ranks exact matches and prefix matches above partial body matches, so the most relevant results appear first. Results are paginated so the experience stays fast regardless of how many pages exist.

The wiki list is accessible everywhere Codeplane is: from the API for automation and integrations, from the CLI for terminal-oriented workflows, and from the TUI for an immersive terminal dashboard experience. In every surface, the same data, the same search behavior, and the same pagination model apply consistently.

For teams that use agents or automation, the wiki list API provides a structured, machine-readable inventory of all wiki pages, enabling bots to index documentation, verify completeness, or trigger workflows based on wiki state.

## Acceptance Criteria

## Definition of Done

The WIKI_LIST feature is complete when a user can list all wiki pages for a repository with pagination and optional full-text search, and receive consistent results across API, CLI, and TUI surfaces.

## Core Behavior

- [ ] Listing wiki pages returns an array of wiki page summaries for the specified repository
- [ ] Each summary includes: `id`, `slug`, `title`, `author` (with `id` and `login`), `created_at`, and `updated_at`
- [ ] The `body` field is NOT included in list responses (only in detail views) to keep payload sizes small
- [ ] Results are sorted by `updated_at` descending, with `id` descending as a tiebreaker
- [ ] An empty repository wiki returns an empty array with total count 0
- [ ] The total count of matching pages is communicated via the `X-Total-Count` response header

## Pagination

- [ ] Pagination uses a page/per_page model (not cursor-based)
- [ ] Default page is 1; default per_page is 30
- [ ] Maximum per_page is 50; values above 50 are silently capped to 50
- [ ] A page value ≤ 0 is normalized to 1
- [ ] A per_page value ≤ 0 is normalized to the default of 30
- [ ] Requesting a page beyond the total number of pages returns an empty array (not an error)
- [ ] The `X-Total-Count` header is always present regardless of whether results exist

## Search

- [ ] When a `q` query parameter is provided and non-empty (after trimming), the list is filtered to pages matching the query
- [ ] Search matches against page title, slug, and body content using case-insensitive substring matching (ILIKE)
- [ ] Search results are ranked by relevance: exact slug match (highest) → exact title match → title prefix → slug prefix → body/other match (lowest)
- [ ] Within the same relevance tier, results are sorted by `updated_at` descending, then `id` descending
- [ ] An empty search query (after trimming) returns the unfiltered, full list
- [ ] Search with no matches returns an empty array with total count 0
- [ ] Search queries containing SQL wildcards (`%`, `_`) are treated as literal characters by the ILIKE pattern

## Edge Cases

- [ ] Listing on a nonexistent repository returns 404
- [ ] Listing on a nonexistent owner returns 404
- [ ] Empty owner or empty repo name in the URL returns 400
- [ ] Unicode characters in the search query are handled correctly
- [ ] Very long search queries (up to 1000 characters) do not cause server errors
- [ ] Concurrent wiki page creation/deletion during listing does not crash the endpoint
- [ ] Repositories with thousands of wiki pages return within acceptable latency (< 2s for the list query)

## Boundary Constraints

- [ ] `page` must be a valid integer; non-integer values default to 1
- [ ] `per_page` must be a valid integer; non-integer values default to 30
- [ ] `q` search query has no enforced maximum length at the API level, but clients should limit to 120 characters for UX
- [ ] The response payload for a full page (50 items) must remain under 500KB
- [ ] Slug values in response are always lowercase, alphanumeric with hyphens only
- [ ] Timestamps in responses are ISO 8601 format

## Design

## API Shape

### Endpoint

```
GET /api/repos/:owner/:repo/wiki
```

### Query Parameters

| Parameter  | Type    | Default | Max | Description                                    |
|------------|---------|---------|-----|------------------------------------------------|
| `page`     | integer | 1       | —   | Page number (1-indexed). Values ≤ 0 become 1.  |
| `per_page` | integer | 30      | 50  | Results per page. Capped at 50 silently.        |
| `q`        | string  | (empty) | —   | Full-text search across title, slug, and body.  |

### Response

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

Note: The `body` field is intentionally omitted from list responses to keep payloads compact.

### Error Responses

| Status | Condition                                    |
|--------|----------------------------------------------|
| 400    | Empty owner or repo name                     |
| 403    | Private repo and viewer lacks read access    |
| 404    | Repository not found                         |
| 500    | Internal server error (e.g., count query fails) |

### Sort Order

**Without search (`q` empty):**
1. `updated_at` DESC
2. `id` DESC (tiebreaker)

**With search (`q` non-empty):**
1. Relevance rank:
   - 0: Exact slug match (case-insensitive)
   - 1: Exact title match (case-insensitive)
   - 2: Title starts with query (case-insensitive)
   - 3: Slug starts with query (case-insensitive)
   - 4: Body or partial match
2. `updated_at` DESC (within same rank)
3. `id` DESC (final tiebreaker)

---

## SDK Shape

### WikiService.listWikiPages

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

**WikiPageResponse (list variant — no body):**
```typescript
{
  id: string;
  slug: string;
  title: string;
  author: { id: string; login: string };
  created_at: Date;
  updated_at: Date;
}
```

The service resolves the repository from owner+name, enforces read access permissions, normalizes pagination parameters, and dispatches to either the unfiltered list query or the search query depending on whether `query` is empty.

---

## CLI Command

### `codeplane wiki list`

```
codeplane wiki list [OPTIONS]
```

**Options:**

| Flag       | Type   | Default | Description                              |
|------------|--------|---------|------------------------------------------|
| `--page`   | number | 1       | Page number                              |
| `--limit`  | number | 30      | Results per page (max 50)                |
| `--query`  | string | —       | Search titles, slugs, and body content   |
| `--repo`   | string | —       | Repository (OWNER/REPO). Auto-detected from cwd if omitted. |

**Human-readable output (default):**

A table with columns: Title, Slug, Author, Updated. When no pages exist, prints "No wiki pages found".

```
Title              Slug               Author     Updated
Getting Started    getting-started    alice      2026-03-22T14:30:00.000Z
API Reference      api-reference      bob        2026-03-21T09:00:00.000Z
```

**Structured output (`--json`):**

Returns the raw JSON array from the API, suitable for piping to `jq` or other tools.

---

## TUI UI

### Wiki List Screen

The TUI wiki list screen is a full-screen view within the terminal UI that displays all wiki pages for a repository in a navigable, keyboard-driven table.

**Access Points:**
- `g k` keyboard shortcut (go-to wiki)
- `:wiki` command palette command
- `--screen wiki --repo owner/repo` deep link flag

**Layout:**
- Header: "Wiki — owner/repo" with page count badge
- Search toolbar (activated by `/`, 300ms debounce)
- Scrollable table with columns: Title, Slug, Author, Updated
- Footer with keyboard hint bar

**Keyboard Navigation:**

| Key           | Action                              |
|---------------|-------------------------------------|
| `j` / `↓`    | Move selection down                 |
| `k` / `↑`    | Move selection up                   |
| `Enter`       | Open selected page detail           |
| `/`           | Activate search toolbar             |
| `Escape`      | Clear search / exit search mode     |
| `c`           | Create new wiki page                |
| `d`           | Delete selected page (with y/n confirm) |
| `q`           | Go back to previous screen          |
| `n` / `p`     | Next / previous page of results     |

**Pagination:** Default 30 items per page, max 50. Next page loads automatically when scrolled to 80% of list. Memory cap of 500 items.

**Responsive Breakpoints:**
- 80×24 (minimum): Title + Updated columns only
- 120×40 (standard): All columns shown
- 200×60+ (wide): Wider columns with more padding

**Empty State:** Centered message "No wiki pages yet" with `c` to create hint.

**Search State:** When search is active, results show a match count badge ("N results") and matching segments in titles/slugs are highlighted.

---

## Documentation

The following end-user documentation should be written:

1. **Wiki Overview Guide**: Explain what the wiki is, how it fits into a repository, and how to access it from each surface.
2. **API Reference — List Wiki Pages**: Document the `GET /api/repos/:owner/:repo/wiki` endpoint with all parameters, response shape, headers, error codes, and examples.
3. **CLI Reference — `wiki list`**: Document the command, all flags, example invocations with and without search, and JSON output usage.
4. **TUI Guide — Wiki Screen**: Document keyboard shortcuts, search behavior, and navigation within the wiki list screen.

## Permissions & Security

## Authorization Roles

### Read Access (required for WIKI_LIST)

| Repository Visibility | Role            | Access |
|-----------------------|-----------------|--------|
| Public                | Anonymous       | ✅ Allowed |
| Public                | Any authenticated user | ✅ Allowed |
| Private               | Anonymous       | ❌ 403 Forbidden |
| Private               | Repo Owner      | ✅ Allowed |
| Private               | Org Owner (if org-owned) | ✅ Allowed |
| Private               | Team Member (read/write/admin) | ✅ Allowed |
| Private               | Collaborator (read/write/admin) | ✅ Allowed |
| Private               | Authenticated, no explicit permission | ❌ 403 Forbidden |

### Permission Resolution Order

1. Check if viewer is the repository owner → full access
2. If org-owned, check if viewer is the organization owner → full access
3. Resolve highest team permission for viewer across all teams linked to the repo
4. Resolve direct collaborator permission
5. Take the highest of team permission and collaborator permission
6. If highest is `read`, `write`, or `admin` → allowed
7. Otherwise → denied

### Important Notes

- WIKI_LIST is a **read-only** operation. No write/admin permission is needed.
- For public repositories, the endpoint works without any authentication at all.
- The `viewer` parameter can be `undefined` for unauthenticated requests on public repos.

## Rate Limiting

- **Authenticated users:** 300 requests per minute per user to the wiki list endpoint
- **Unauthenticated users (public repos):** 60 requests per minute per IP
- **Search queries:** Same limits as above; search does not have separate rate limits but the ILIKE queries are more expensive, so monitoring is important
- **Pagination abuse:** No special per-page rate limit, but the `per_page` cap of 50 prevents excessive row fetching per request

## Data Privacy

- Wiki pages on **private repositories** are only visible to authorized users. The list endpoint must never leak titles, slugs, or author information to unauthorized viewers.
- The `author` field exposes `id` and `login` (username). This is consistent with how author information is exposed across all Codeplane resource APIs. No email or private profile information is included.
- Search queries submitted by users are not persisted or logged at the application level (they appear in standard request logs only).
- The `body` field is intentionally excluded from list responses, reducing the risk of accidentally exposing large amounts of content in bulk API calls.

## Telemetry & Product Analytics

## Business Events

### `WikiPagesListed`

Fired every time the wiki list endpoint is successfully called.

**Properties:**

| Property           | Type    | Description                                      |
|--------------------|---------|--------------------------------------------------|
| `repository_id`    | string  | UUID of the repository                           |
| `owner`            | string  | Repository owner login                           |
| `repo`             | string  | Repository name                                  |
| `viewer_id`        | string? | UUID of the authenticated user (null if anon)    |
| `has_search_query` | boolean | Whether a `q` parameter was provided             |
| `search_query_length` | number | Character length of the search query (0 if none) |
| `page`             | number  | Requested page number (after normalization)      |
| `per_page`         | number  | Requested per_page (after normalization)          |
| `result_count`     | number  | Number of items returned in this page             |
| `total_count`      | number  | Total matching items across all pages             |
| `latency_ms`       | number  | Server-side processing time in milliseconds       |
| `client`           | string  | Client surface: `api`, `cli`, `tui`, `web`        |

### `WikiSearchPerformed`

Fired only when a non-empty search query is used. Subset of `WikiPagesListed` but specifically tracks search adoption.

**Properties:**

| Property           | Type   | Description                                       |
|--------------------|--------|---------------------------------------------------|
| `repository_id`    | string | UUID of the repository                            |
| `viewer_id`        | string?| UUID of the authenticated user                    |
| `query`            | string | The search query (truncated to 120 chars for privacy) |
| `result_count`     | number | Number of matching results                        |
| `total_count`      | number | Total matching results                            |
| `latency_ms`       | number | Server-side processing time                       |

## Funnel Metrics & Success Indicators

| Metric                              | Definition                                                   | Success Target             |
|-------------------------------------|--------------------------------------------------------------|----------------------------|
| Wiki list → page view rate          | % of wiki list views that lead to a wiki page detail view    | > 40%                      |
| Wiki search usage rate              | % of wiki list requests that include a search query          | > 10% (indicates discoverability need) |
| Wiki search success rate            | % of search queries that return ≥ 1 result                  | > 70%                      |
| Wiki list empty rate                | % of wiki list views that return 0 pages                     | Track (indicates adoption) |
| Multi-page browsing rate            | % of wiki list views where user requests page > 1            | Track                      |
| P95 wiki list latency               | 95th percentile response time                                | < 500ms                    |
| CLI vs API vs TUI split             | Distribution of wiki list requests by client surface          | Track for roadmap input    |

## Observability

## Logging Requirements

### Request-Level Logging

Every wiki list request must emit a structured log entry at `INFO` level upon completion:

```json
{
  "level": "info",
  "msg": "wiki.list",
  "request_id": "uuid",
  "owner": "alice",
  "repo": "my-project",
  "viewer_id": "uuid-or-null",
  "page": 1,
  "per_page": 30,
  "has_query": true,
  "query_length": 15,
  "result_count": 12,
  "total_count": 42,
  "duration_ms": 23,
  "status": 200
}
```

### Error Logging

- `WARN` level for 400/403/404 responses (client errors)
- `ERROR` level for 500 responses (server errors), including full error stack trace
- `ERROR` level if `countWikiPagesByRepo` or `countSearchWikiPagesByRepo` returns null (indicates unexpected DB state)

### Sensitive Data

- Search query content (`q`) should be logged only as length, not as the full string, to avoid PII in logs
- Viewer ID should be logged but never email or session tokens

## Prometheus Metrics

### Counters

| Metric                                    | Labels                              | Description                                        |
|-------------------------------------------|-------------------------------------|----------------------------------------------------|
| `codeplane_wiki_list_requests_total`      | `status`, `has_query`               | Total wiki list requests by HTTP status and search use |
| `codeplane_wiki_list_errors_total`        | `error_type` (400/403/404/500)      | Total wiki list errors by type                      |

### Histograms

| Metric                                    | Labels          | Buckets (ms)                        | Description                            |
|-------------------------------------------|-----------------|-------------------------------------|----------------------------------------|
| `codeplane_wiki_list_duration_seconds`    | `has_query`     | 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5 | Request duration for wiki list         |
| `codeplane_wiki_list_result_count`        | `has_query`     | 0, 1, 5, 10, 20, 30, 50            | Number of items returned per request   |

### Gauges

| Metric                                    | Labels          | Description                                        |
|-------------------------------------------|-----------------|----------------------------------------------------|
| `codeplane_wiki_pages_total`              | `repository_id` | Total wiki pages per repository (updated on list)  |

## Alerts

### Alert: WikiListHighErrorRate

**Condition:** `rate(codeplane_wiki_list_errors_total{error_type="500"}[5m]) / rate(codeplane_wiki_list_requests_total[5m]) > 0.05`

**Severity:** Critical

**Runbook:**
1. Check `codeplane_wiki_list_errors_total` dashboard to determine if errors are isolated to specific repositories or global
2. Query application logs for `level=error msg=wiki.list` in the affected time window
3. Check PostgreSQL connection pool health and query latency: `SELECT * FROM pg_stat_activity WHERE query LIKE '%wiki_pages%'`
4. If DB connection pool exhaustion: restart the server process and investigate connection leak
5. If specific query failures: check for schema migrations in progress or table locks
6. If `countWikiPagesByRepo` returns null: verify the wiki_pages table exists and has the expected schema

### Alert: WikiListHighLatency

**Condition:** `histogram_quantile(0.95, rate(codeplane_wiki_list_duration_seconds_bucket[5m])) > 2`

**Severity:** Warning

**Runbook:**
1. Check if latency spike correlates with search queries (`has_query=true`) — ILIKE queries on large body columns are expensive
2. Run `EXPLAIN ANALYZE` on the `searchWikiPagesByRepo` query for a large repository to check for sequential scans
3. If sequential scan detected: verify that `idx_wiki_pages_repository_id` index exists; consider adding a trigram index for ILIKE performance
4. Check DB load: `SELECT * FROM pg_stat_user_tables WHERE relname = 'wiki_pages'` for sequential scan counts
5. If isolated to one repo with thousands of pages: consider pagination query optimization or full-text search index migration

### Alert: WikiListSpikeIn404s

**Condition:** `rate(codeplane_wiki_list_errors_total{error_type="404"}[5m]) > 10`

**Severity:** Warning

**Runbook:**
1. Check logs for the specific owner/repo combinations returning 404
2. Determine if a popular repository was recently deleted or renamed
3. If caused by bots or crawlers hitting stale URLs: consider adding cache headers or redirect rules
4. If caused by legitimate traffic: check if repository transfer or rename left stale references

## Error Cases and Failure Modes

| Error Case                                    | HTTP Status | Behavior                                                |
|-----------------------------------------------|-------------|--------------------------------------------------------|
| Repository not found                          | 404         | Returns `{"error": "repository not found"}`            |
| Empty owner in URL                            | 400         | Returns `{"error": "owner is required"}`               |
| Empty repo name in URL                        | 400         | Returns `{"error": "repository name is required"}`     |
| Private repo, no auth                         | 403         | Returns `{"error": "permission denied"}`               |
| Private repo, insufficient permission         | 403         | Returns `{"error": "permission denied"}`               |
| DB count query returns null                   | 500         | Returns `{"error": "failed to count wiki pages"}`      |
| DB connection failure                         | 500         | Returns generic internal error                          |
| Non-integer page/per_page query params        | 200         | Silently defaults to 1/30 (NaN from parseInt → default) |

## Verification

## API Integration Tests

### Happy Path

- [ ] **List empty wiki**: Create a repository with no wiki pages. `GET /api/repos/:owner/:repo/wiki` returns `[]` with `X-Total-Count: 0`.
- [ ] **List single page**: Create one wiki page, then list. Returns array of length 1 with correct title, slug, author, timestamps.
- [ ] **List multiple pages**: Create 5 wiki pages with different titles. List returns all 5 in `updated_at` DESC order.
- [ ] **List omits body**: Create a page with a large body. List response items must NOT contain a `body` field.
- [ ] **List default pagination**: Create 35 pages. Default list (no page/per_page params) returns exactly 30 items.
- [ ] **List page 2**: Create 35 pages. Request `page=2&per_page=30` returns 5 items.
- [ ] **List with per_page=50 (max)**: Create 60 pages. Request `per_page=50` returns exactly 50 items.
- [ ] **List with per_page exceeding max**: Request `per_page=100`. Returns at most 50 items (silently capped).
- [ ] **List with per_page=1**: Returns exactly 1 item. `X-Total-Count` reflects total.
- [ ] **X-Total-Count header present**: Every successful list response includes `X-Total-Count` header as a numeric string.
- [ ] **X-Total-Count reflects total, not page size**: With 35 pages and `per_page=10`, `X-Total-Count` is `35`.
- [ ] **Sort order is updated_at DESC**: Create page A, then page B, then update page A. List returns A first (most recently updated).
- [ ] **Author fields are correct**: Create a page as user X. List shows `author.id` and `author.login` matching user X.
- [ ] **Timestamps are ISO 8601**: Verify `created_at` and `updated_at` are valid ISO 8601 strings.

### Search

- [ ] **Search by title**: Create pages "Alpha Guide" and "Beta Reference". Search `q=Alpha` returns only "Alpha Guide".
- [ ] **Search by slug**: Create page with slug `api-reference`. Search `q=api-reference` returns it.
- [ ] **Search by body content**: Create page with body containing "deployment pipeline". Search `q=deployment` returns it.
- [ ] **Search is case-insensitive**: Create page titled "Architecture". Search `q=architecture` (lowercase) returns it.
- [ ] **Search relevance: exact slug match ranks highest**: Create pages with slug `setup`, title `Setup Guide`, and another page with body containing `setup`. Search `q=setup`. First result has slug `setup`.
- [ ] **Search relevance: exact title match ranks above prefix**: Create pages titled "Auth" and "Authentication". Search `q=Auth`. "Auth" appears before "Authentication".
- [ ] **Search with no results**: Search `q=nonexistent-gibberish-xyz`. Returns `[]` with `X-Total-Count: 0`.
- [ ] **Search with empty query**: `q=` or `q=   ` (whitespace only) returns full unfiltered list.
- [ ] **Search with pagination**: Create 40 pages all containing the word "docs". Search `q=docs&per_page=10&page=2` returns items 11-20.
- [ ] **Search X-Total-Count reflects filtered total**: 40 total pages, 12 match query. `X-Total-Count` is `12`.

### Pagination Edge Cases

- [ ] **Page 0 normalizes to page 1**: Request `page=0` returns same results as `page=1`.
- [ ] **Negative page normalizes to page 1**: Request `page=-5` returns same results as `page=1`.
- [ ] **per_page=0 normalizes to default 30**: Request `per_page=0` returns up to 30 items.
- [ ] **Negative per_page normalizes to default 30**: Request `per_page=-10` returns up to 30 items.
- [ ] **Page beyond last page returns empty array**: 5 total pages, request `page=100&per_page=30`. Returns `[]` but `X-Total-Count: 5`.
- [ ] **Non-numeric page parameter defaults gracefully**: `page=abc` should not cause 500 (parseInt yields NaN, normalized to 1).
- [ ] **Non-numeric per_page parameter defaults gracefully**: `per_page=xyz` should not cause 500.

### Permission Tests

- [ ] **Public repo, unauthenticated**: List succeeds with 200.
- [ ] **Public repo, authenticated**: List succeeds with 200.
- [ ] **Private repo, unauthenticated**: Returns 403.
- [ ] **Private repo, repo owner**: List succeeds.
- [ ] **Private repo, org owner (if org-owned)**: List succeeds.
- [ ] **Private repo, read collaborator**: List succeeds.
- [ ] **Private repo, write collaborator**: List succeeds.
- [ ] **Private repo, admin collaborator**: List succeeds.
- [ ] **Private repo, authenticated user with no permission**: Returns 403.
- [ ] **Private repo, team member with read permission**: List succeeds.

### Error Cases

- [ ] **Nonexistent repository**: Returns 404 with `"repository not found"` message.
- [ ] **Nonexistent owner**: Returns 404.
- [ ] **Empty owner segment**: Returns 400 with `"owner is required"` message.
- [ ] **Empty repo segment**: Returns 400 with `"repository name is required"` message.

### Boundary / Load Tests

- [ ] **Maximum valid per_page (50) returns correct results**: Create 50+ pages, request `per_page=50`, verify exactly 50 returned.
- [ ] **per_page=51 is capped to 50**: Create 51 pages, request `per_page=51`, verify exactly 50 returned.
- [ ] **Repository with 500 pages**: Create 500 wiki pages. List with default pagination returns 30. Verify all 500 are reachable across pages. `X-Total-Count: 500`.
- [ ] **Long search query (1000 chars)**: Send a 1000-character `q` value. Server responds without 500 error.
- [ ] **Unicode search query**: Search with `q=日本語ドキュメント`. No crash; returns appropriate results.
- [ ] **Search query with SQL metacharacters**: Search with `q=%_\` does not cause SQL injection or unexpected behavior.

## CLI E2E Tests

- [ ] **`codeplane wiki list` returns pages**: After creating pages, `wiki list --repo OWNER/REPO` displays a formatted table.
- [ ] **`codeplane wiki list --json` returns JSON array**: Output is valid JSON array with expected fields.
- [ ] **`codeplane wiki list` empty repo**: Shows "No wiki pages found" message.
- [ ] **`codeplane wiki list --query` filters results**: Create pages "Alpha" and "Beta". `--query Alpha` shows only Alpha.
- [ ] **`codeplane wiki list --limit 5`**: Returns at most 5 items.
- [ ] **`codeplane wiki list --page 2`**: Returns second page of results.
- [ ] **`codeplane wiki list` table columns**: Output table has headers: Title, Slug, Author, Updated.
- [ ] **`codeplane wiki list --json` field names**: JSON items include `id`, `slug`, `title`, `author`, `created_at`, `updated_at`.
- [ ] **`codeplane wiki list` after delete**: Delete a page, then list. Deleted page no longer appears.
- [ ] **`codeplane wiki list` sort order**: Most recently updated page appears first in output.

## TUI E2E Tests

- [ ] **Wiki list screen renders**: Navigate to wiki screen via `g k`. Screen shows header, table, and footer.
- [ ] **Wiki list shows pages**: After creating pages via API, wiki list screen displays them.
- [ ] **Keyboard navigation**: Press `j`/`k` to move selection up and down. Selection highlight moves.
- [ ] **Enter opens detail**: Select a page and press Enter. Detail view opens with correct page.
- [ ] **Search activation**: Press `/`. Search toolbar appears. Type query. Results filter after 300ms debounce.
- [ ] **Search clear**: Press Escape in search mode. Returns to full unfiltered list.
- [ ] **Empty state**: Repository with no wiki pages shows "No wiki pages yet" message.
- [ ] **Pagination navigation**: With >30 pages, scroll to bottom triggers next page load.

## Playwright (Web UI) E2E Tests

Note: Web UI for wiki does not currently exist. When implemented, the following tests should be added:

- [ ] **Wiki list page loads**: Navigate to `/:owner/:repo/wiki`. Page renders with a list of wiki pages.
- [ ] **Wiki list shows correct columns**: Title, author, and last updated are visible for each page.
- [ ] **Search input filters results**: Type in search box. Results update to show matching pages.
- [ ] **Pagination controls work**: Click next/previous page. Different set of pages shown.
- [ ] **Click page navigates to detail**: Click a wiki page title. Detail view opens.
- [ ] **Empty state renders**: Repository with no wiki pages shows empty state with create CTA.
- [ ] **Permission-gated**: Unauthenticated user on private repo sees 403 or redirect.
