# WIKI_VIEW

Specification for WIKI_VIEW.

## High-Level User POV

When a user finds a wiki page in a repository's wiki list, through search, or via a direct link, they need to read its full content. The wiki view is the reading experience — the screen where a developer lands to consume documentation, architecture decisions, runbooks, onboarding guides, or any knowledge that has been captured in a repository's wiki.

The user arrives at the wiki view by clicking or selecting a page from the wiki list, navigating directly to its URL (in the web UI or via a CLI command), or following a deep link from the TUI or command palette. The view opens with the page's title prominently displayed, followed by the author who last edited it, the timestamps showing when it was created and last updated, and the full Markdown-rendered body of the page. The reading experience is optimized for scanning and comprehension — headings, code blocks with syntax highlighting, tables, lists, links, and other Markdown structures are rendered faithfully so the content is easy to navigate.

The wiki view is available everywhere Codeplane is: in the web UI as a dedicated page route, in the CLI as `codeplane wiki view <slug>`, in the TUI as a scrollable detail screen, and through the API for programmatic access. Across all surfaces, the same page data is returned — the same title, the same slug, the same body, the same author, and the same timestamps.

For public repositories, anyone can view a wiki page without authentication. For private repositories, only users with at least read access can see the content. The wiki view is strictly read-only; editing and deleting are separate actions triggered from within the view but governed by their own permission requirements.

The wiki view also serves as a launching point for related actions. From the view, users with write access can edit or delete the page. In the TUI, users can browse sequentially through pages without returning to the list. In the CLI, users can pipe the structured JSON output into downstream tools. The wiki view is the heart of the wiki reading experience — everything else in the wiki flows through it or leads to it.

## Acceptance Criteria

### Definition of Done

The WIKI_VIEW feature is complete when a user can retrieve and read a single wiki page by its slug, with the full body content rendered, across API, CLI, TUI, and web UI surfaces, with consistent data and behavior.

### Core Behavior

- [ ] Viewing a wiki page returns the full page object: `id`, `slug`, `title`, `body`, `author` (with `id` and `login`), `created_at`, and `updated_at`
- [ ] The `body` field is included in the view response (unlike the list endpoint, which omits it)
- [ ] The page is identified by its slug in the URL path
- [ ] The slug in the request is normalized before lookup: lowercased, non-alphanumeric characters replaced with hyphens, consecutive hyphens collapsed, leading/trailing hyphens stripped
- [ ] Viewing a page that does not exist returns a `404 Not Found` error with the message `"wiki page not found"`
- [ ] Viewing a page on a repository that does not exist returns `404`
- [ ] The response HTTP status is `200 OK` on success
- [ ] Timestamps in the response are ISO 8601 format

### Slug Resolution

- [ ] The slug is normalized before database lookup using the same `normalizeWikiSlug` algorithm used across all wiki operations
- [ ] A slug containing uppercase letters is lowered before lookup (e.g., `Getting-Started` resolves to the page with slug `getting-started`)
- [ ] A slug containing special characters is normalized (e.g., `my page!` is normalized to `my-page`)
- [ ] An empty or whitespace-only slug returns `400 Bad Request` with `"wiki slug is required"`
- [ ] A slug that normalizes to an empty string (e.g., `!!!`) returns `422 Validation Failed` with `field: "slug"`, `code: "invalid"`

### Edge Cases

- [ ] Viewing a page on a nonexistent repository returns `404`
- [ ] Viewing a page on a nonexistent owner returns `404`
- [ ] An empty owner or empty repo name in the URL returns `400`
- [ ] A page with an empty body (`""`) returns successfully with `body: ""`
- [ ] A page with a very large body (up to 1,000,000 characters) returns the full body content without truncation at the API level
- [ ] Unicode characters in the slug are handled: non-ASCII characters are stripped during normalization; if the result is empty, `422` is returned
- [ ] The `author` field shows the login of the user who last edited the page, not necessarily the original creator
- [ ] If the author user account has been deleted, the `author.login` field reflects the last known username (or the API handles gracefully)
- [ ] Concurrent page edits/deletions during a view request do not cause server crashes
- [ ] SQL injection attempts in the slug parameter are safely handled (slug is parameterized, not interpolated)

### Boundary Constraints

- [ ] Slug maximum length: 255 characters (after normalization). Slugs exceeding this are normalized and looked up; if no match, `404`
- [ ] The response payload for a single wiki page with a 1,000,000-character body must remain under 2 MB
- [ ] Timestamps are ISO 8601 strings
- [ ] The `id` field is a UUID string
- [ ] The `author.id` is a UUID string
- [ ] The `author.login` is a string (username, not email)

## Design

### API Shape

#### Endpoint

```
GET /api/repos/:owner/:repo/wiki/:slug
```

#### Path Parameters

| Parameter | Type   | Description                            |
|-----------|--------|----------------------------------------|
| `owner`   | string | Repository owner login                 |
| `repo`    | string | Repository name                        |
| `slug`    | string | Wiki page slug (normalized on server)  |

#### Authentication

Optional. Required only for private repositories.

#### Response

**Status:** `200 OK`

**Body:**

```json
{
  "id": "01234567-89ab-cdef-0123-456789abcdef",
  "slug": "getting-started",
  "title": "Getting Started",
  "body": "# Getting Started\n\nWelcome to the project wiki.\n\n## Prerequisites\n\n- Install jj\n- Install the Codeplane CLI",
  "author": {
    "id": "98765432-10ab-cdef-0123-456789abcdef",
    "login": "alice"
  },
  "created_at": "2026-03-20T10:00:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

#### Error Responses

| Status | Condition                                    | Body                                                                                    |
|--------|----------------------------------------------|-----------------------------------------------------------------------------------------|
| `400`  | Empty slug (whitespace-only `:slug` param)   | `{ "message": "wiki slug is required" }`                                                |
| `400`  | Empty owner or repo name                     | `{ "message": "owner is required" }` or `{ "message": "repository name is required" }` |
| `403`  | Private repo and viewer lacks read access    | `{ "message": "permission denied" }`                                                    |
| `404`  | Repository not found                         | `{ "message": "repository not found" }`                                                 |
| `404`  | Wiki page with the given slug not found      | `{ "message": "wiki page not found" }`                                                  |
| `422`  | Slug invalid after normalization             | `{ "message": "Validation Failed", "errors": [{ "resource": "WikiPage", "field": "slug", "code": "invalid" }] }` |
| `500`  | Internal server error                        | `{ "message": "internal server error" }`                                                |

---

### SDK Shape

#### WikiService.getWikiPage

```typescript
async getWikiPage(
  viewer: AuthUser | undefined,
  owner: string,
  repo: string,
  slug: string,
): Promise<WikiPageResponse>
```

**WikiPageResponse (view variant — includes body):**

```typescript
{
  id: string;
  slug: string;
  title: string;
  body?: string;
  author: { id: string; login: string };
  created_at: Date;
  updated_at: Date;
}
```

The service resolves the repository from `owner` + `repo`, enforces read access, normalizes the slug, fetches the page from the database by `(repository_id, slug)`, and returns the full page object including the body. If the page is not found, it throws a `404` error.

---

### CLI Command

#### `codeplane wiki view`

```
codeplane wiki view <slug> [OPTIONS]
```

**Arguments:**

| Argument | Type   | Required | Description         |
|----------|--------|----------|---------------------|
| `slug`   | string | Yes      | Wiki page slug      |

**Options:**

| Flag     | Type   | Default            | Description                                     |
|----------|--------|--------------------|-------------------------------------------------|
| `--repo` | string | Inferred from cwd  | Repository in `OWNER/REPO` format               |

**Human-readable output (default):**

```
Getting Started
Slug: getting-started
Author: alice
Updated: 2026-03-22T14:30:00.000Z

# Getting Started

Welcome to the project wiki.

## Prerequisites

- Install jj
- Install the Codeplane CLI
```

The output shows the title on the first line, followed by slug, author, and last-updated timestamp as metadata lines. An empty line separates the metadata from the body content, which is printed as raw Markdown text. When the body is empty, only the metadata lines are printed.

**Structured output (`--json`):**

Returns the raw JSON object from the API with fields: `id`, `slug`, `title`, `body`, `author`, `created_at`, `updated_at`.

**Error output:** On failure, the CLI writes the error detail to stderr and exits with a non-zero exit code.

---

### TUI UI

The TUI wiki detail view is a full-screen, vertically scrollable screen for reading a wiki page.

**Access Points:**
- `Enter` on a selected page in the Wiki List screen
- `:wiki <slug>` via the command palette
- `codeplane tui --screen wiki --repo owner/repo --slug <slug>` deep link

**Layout (standard 120×40):**

```
┌───────────────────────────────────────────────────────────────────────┐
│ Getting Started with Codeplane                     /getting-started  │
│ @alice · created 3d ago · updated 2h ago                             │
├───────────────────────────────────────────────────────────────────────┤
│ # Welcome to Codeplane                                               │
│ This guide will walk you through...                                  │
│ ## Prerequisites                                                     │
│ - Install jj                                                         │
└───────────────────────────────────────────────────────────────────────┘
```

**Header:** Title in bold (wrapping, never truncated). Slug in muted color (hidden at 80×24).

**Metadata row:** `@username` in primary color · created timestamp · updated timestamp (relative, switching to absolute >30d).

**Body:** Markdown rendered with full support. Empty body shows "This page has no content." in muted italic. Truncated at 100,000 characters with notice.

**Keyboard Navigation:**

| Key | Action |
|-----|--------|
| `j`/`↓` | Scroll down |
| `k`/`↑` | Scroll up |
| `G` | Jump to bottom |
| `g g` | Jump to top |
| `Ctrl+D`/`Ctrl+U` | Page down/up |
| `]`/`[` | Next/previous wiki page |
| `e` | Open edit form (write access) |
| `d` | Prompt deletion (write access) |
| `R` | Retry failed fetch |
| `q` | Back to previous screen |
| `?` | Show help |
| `:` | Command palette |

**Status bar:** `j/k:scroll  [/]:prev/next  e:edit  d:delete  q:back` (write actions omitted for read-only).

**Responsive:** 80×24 compact (author + short timestamp, slug hidden), 120×40 standard (full), 200×60+ expanded. Below 80×24: "Terminal too small".

**Loading/Error states:** Spinner during fetch. 404 → "Wiki page not found" + q to go back. Network error → "Failed to load wiki page" + R to retry. 30s cache.

---

### Web UI Design

The web wiki view is accessible at `/:owner/:repo/wiki/:slug`.

**Page Structure:**
- Breadcrumb: `Repository > Wiki > Page Title`
- Title displayed as a large heading
- Metadata line: author avatar + username, created date, last updated date
- Slug displayed as muted text beneath the title
- Full Markdown-rendered body with syntax highlighting, tables, links, images
- Action bar (write access): "Edit" button and "Delete" button with confirmation modal
- Related pages sidebar or footer for navigation

**Empty body:** Centered "This page has no content yet." with Edit CTA for write-access users.

**Error states:** 404 → "Wiki page not found" with link back to wiki list. 403 → redirect to login or permission error.

**Responsive:** Full-width desktop to single-column mobile layout.

---

### Documentation

1. **Viewing wiki pages** — How to access a wiki page from the list, by URL, and via direct link across web, CLI, and TUI.
2. **CLI reference: `codeplane wiki view`** — Slug argument, `--repo` flag, human and JSON output, examples.
3. **API reference: `GET /api/repos/:owner/:repo/wiki/:slug`** — Path parameters, auth, response schema, error codes, cURL examples.
4. **TUI guide: Wiki Detail View** — Keyboard shortcuts, scroll controls, page navigation, edit/delete from view.

## Permissions & Security

### Authorization Roles

| Repository Visibility | Role                                     | Can View Wiki Page? |
|-----------------------|------------------------------------------|---------------------|
| Public                | Anonymous (unauthenticated)              | ✅ Allowed           |
| Public                | Any authenticated user                   | ✅ Allowed           |
| Private               | Anonymous (unauthenticated)              | ❌ 403 Forbidden     |
| Private               | Repo Owner                               | ✅ Allowed           |
| Private               | Org Owner (if org-owned)                 | ✅ Allowed           |
| Private               | Team Member with `admin` permission      | ✅ Allowed           |
| Private               | Team Member with `write` permission      | ✅ Allowed           |
| Private               | Team Member with `read` permission       | ✅ Allowed           |
| Private               | Collaborator with `admin` permission     | ✅ Allowed           |
| Private               | Collaborator with `write` permission     | ✅ Allowed           |
| Private               | Collaborator with `read` permission      | ✅ Allowed           |
| Private               | Authenticated, no explicit permission    | ❌ 403 Forbidden     |

### Permission Resolution Order

1. Check if viewer is the repository owner → full access
2. If org-owned, check if viewer is the organization owner → full access
3. Resolve highest team permission for viewer across all teams linked to the repo
4. Resolve direct collaborator permission
5. Take the highest of team permission and collaborator permission
6. If highest is `read`, `write`, or `admin` → allowed
7. Otherwise → denied

### Important Notes

- WIKI_VIEW is a **read-only** operation. No write or admin permission is needed.
- For public repositories, the endpoint works without any authentication at all.
- The `viewer` parameter can be `undefined` for unauthenticated requests on public repos.
- Write actions (edit/delete) visible in TUI and Web UI are gated by their own write-permission checks, not by the view endpoint.

### Rate Limiting

- **Authenticated users:** 300 requests per minute per user to the wiki view endpoint
- **Unauthenticated users (public repos):** 60 requests per minute per IP
- **No separate rate limit for individual pages** — the per-user/IP limit applies globally across all wiki view requests
- Rate limit responses use `429 Too Many Requests` with `Retry-After` header

### Data Privacy

- Wiki pages on **private repositories** are only visible to authorized users. The view endpoint must never return title, slug, body, or author information to unauthorized viewers — it returns `403`, not a redacted response.
- The `author` field exposes `id` and `login` (username). No email or private profile information is included.
- The full `body` content is returned. Callers should be aware that wiki bodies may contain sensitive internal documentation on private repos.
- Request slugs are logged only as length (not content) to avoid PII leakage in logs.

## Telemetry & Product Analytics

### Business Events

#### `WikiPageViewed`

Fired every time the wiki view endpoint returns a `200` response.

**Properties:**

| Property           | Type    | Description                                      |
|--------------------|---------|--------------------------------------------------|
| `repository_id`    | string  | UUID of the repository                           |
| `owner`            | string  | Repository owner login                           |
| `repo`             | string  | Repository name                                  |
| `wiki_page_id`     | string  | UUID of the viewed wiki page                     |
| `wiki_page_slug`   | string  | Slug of the viewed page                          |
| `viewer_id`        | string? | UUID of the authenticated user (null if anon)    |
| `body_length`      | number  | Character length of the page body                |
| `latency_ms`       | number  | Server-side processing time in milliseconds      |
| `client`           | string  | Client surface: `api`, `cli`, `tui`, `web`       |
| `timestamp`        | string  | ISO 8601 event timestamp                         |

#### `WikiPageViewFailed`

Fired when the wiki view endpoint returns an error.

**Properties:**

| Property           | Type    | Description                                      |
|--------------------|---------|--------------------------------------------------|
| `repository_owner` | string  | Owner from the URL                               |
| `repository_name`  | string  | Repo from the URL                                |
| `slug`             | string  | Requested slug                                   |
| `error_code`       | number  | HTTP status code (400/403/404/422/500)           |
| `viewer_id`        | string? | UUID of the authenticated user (null if anon)    |
| `client`           | string  | Client surface: `api`, `cli`, `tui`, `web`       |
| `timestamp`        | string  | ISO 8601 event timestamp                         |

### Funnel Metrics & Success Indicators

| Metric                              | Definition                                                   | Success Target             |
|-------------------------------------|--------------------------------------------------------------|----------------------------|
| Wiki list → page view rate          | % of wiki list views that lead to a wiki page detail view    | > 40%                      |
| Wiki view → edit rate               | % of wiki page views that lead to a wiki page edit           | > 10%                      |
| Repeated wiki view rate             | % of pages viewed more than once by the same user in 7 days  | Track (indicates reference value) |
| Wiki view 404 rate                  | % of wiki view requests that return 404                      | < 5% (indicates stale links) |
| P95 wiki view latency               | 95th percentile response time                                | < 300ms                    |
| CLI vs API vs TUI vs Web split      | Distribution of wiki view requests by client surface          | Track for roadmap input    |
| Unique pages viewed per user/week   | Average distinct wiki pages viewed per active user per week   | Track (indicates engagement) |

## Observability

### Logging Requirements

#### Request-Level Logging

Every wiki view request must emit a structured log entry at `INFO` level upon completion:

```json
{
  "level": "info",
  "msg": "wiki.view",
  "request_id": "uuid",
  "owner": "alice",
  "repo": "my-project",
  "slug_length": 15,
  "viewer_id": "uuid-or-null",
  "body_length": 4523,
  "duration_ms": 12,
  "status": 200
}
```

#### Error Logging

- `WARN` level for `400`/`403`/`404`/`422` responses (client errors), including `request_id`, `owner`, `repo`, `slug_length`, `status`
- `ERROR` level for `500` responses (server errors), including full error stack trace, `request_id`, `owner`, `repo`
- `ERROR` level if `getWikiPageBySlug` throws an unexpected database error (not a null result)

#### Sensitive Data

- The slug value should be logged only as its character length (`slug_length`), not as the full string, to avoid PII in logs
- The body content must never appear in logs
- Viewer ID should be logged but never email, session tokens, or IP addresses at the application log level

### Prometheus Metrics

#### Counters

| Metric                                     | Labels                         | Description                                         |
|--------------------------------------------|--------------------------------|-----------------------------------------------------|
| `codeplane_wiki_view_requests_total`       | `status`                       | Total wiki view requests by HTTP status              |
| `codeplane_wiki_view_errors_total`         | `error_type` (400/403/404/422/500) | Total wiki view errors by type                   |

#### Histograms

| Metric                                     | Labels    | Buckets (ms)                              | Description                              |
|--------------------------------------------|-----------|-------------------------------------------|------------------------------------------|
| `codeplane_wiki_view_duration_seconds`     | —         | 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2 | Request duration for wiki view    |
| `codeplane_wiki_view_body_size_bytes`      | —         | 100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000 | Body size of returned wiki pages |

#### Gauges

No wiki-view-specific gauges are required (the `codeplane_wiki_pages_total` gauge from WIKI_LIST covers page inventory).

### Alerts

#### Alert: WikiViewHighErrorRate

**Condition:** `rate(codeplane_wiki_view_errors_total{error_type="500"}[5m]) / rate(codeplane_wiki_view_requests_total[5m]) > 0.05`

**Severity:** Critical

**Runbook:**
1. Check `codeplane_wiki_view_errors_total` dashboard to determine if errors are isolated to specific repositories or global.
2. Query application logs for `level=error msg=wiki.view` in the affected time window.
3. Check PostgreSQL connection pool health: `SELECT count(*) FROM pg_stat_activity WHERE state = 'active'`.
4. Check for query errors on `getWikiPageBySlug`: look for deadlocks, table locks, or schema migration in progress.
5. If DB connection pool exhaustion: restart the server process and investigate connection leak.
6. If specific slug or repository causes the error: check the `wiki_pages` table for data corruption on that row.
7. Escalate to database on-call if not resolved within 15 minutes.

#### Alert: WikiViewHighLatency

**Condition:** `histogram_quantile(0.95, rate(codeplane_wiki_view_duration_seconds_bucket[5m])) > 1`

**Severity:** Warning

**Runbook:**
1. Check if the latency spike correlates with pages that have very large bodies (>500KB) by examining `codeplane_wiki_view_body_size_bytes`.
2. Run `EXPLAIN ANALYZE` on the `getWikiPageBySlug` query for a representative repository to confirm index usage.
3. Verify that the `(repository_id, slug)` composite index exists on the `wiki_pages` table.
4. Check overall database load: `SELECT * FROM pg_stat_user_tables WHERE relname = 'wiki_pages'` for sequential scan counts.
5. If large body serialization is the bottleneck, consider response streaming or pagination of body content in a future iteration.
6. Check network layer: if the response payload is large, verify no proxy or middleware is buffering/re-encoding.

#### Alert: WikiViewSpikeIn404s

**Condition:** `rate(codeplane_wiki_view_errors_total{error_type="404"}[5m]) > 20`

**Severity:** Warning

**Runbook:**
1. Check logs for the specific slugs returning 404 to determine if they are stale links or automated scan traffic.
2. Determine if a popular wiki page was recently deleted or had its slug changed.
3. If caused by a slug rename: consider adding redirect support for old slugs (product enhancement request).
4. If caused by bots or crawlers: consider rate-limiting by IP or adding `robots.txt` exclusion for wiki paths.
5. If caused by legitimate traffic with stale bookmarks: no immediate action needed, but track the pattern.

### Error Cases and Failure Modes

| Error Case                                | HTTP Status | Behavior                                           | Recovery                              |
|-------------------------------------------|-------------|----------------------------------------------------|---------------------------------------|
| Wiki page not found (slug doesn't exist)  | 404         | Returns `"wiki page not found"`                    | User checks slug or navigates via list |
| Repository not found                      | 404         | Returns `"repository not found"`                   | User verifies owner/repo path         |
| Empty owner in URL                        | 400         | Returns `"owner is required"`                      | User provides correct URL             |
| Empty repo name in URL                    | 400         | Returns `"repository name is required"`            | User provides correct URL             |
| Empty/whitespace slug                     | 400         | Returns `"wiki slug is required"`                  | User provides a valid slug            |
| Slug normalizes to empty string           | 422         | Returns validation error for slug field            | User provides alphanumeric slug       |
| Private repo, no auth                     | 403         | Returns `"permission denied"`                      | User authenticates                    |
| Private repo, insufficient permission     | 403         | Returns `"permission denied"`                      | User requests access from admin       |
| DB connection failure                     | 500         | Returns generic internal error; logged as ERROR    | Automatic reconnection via pool       |
| DB query timeout                          | 500         | Returns generic internal error; logged as ERROR    | Retry; check DB health                |
| Extremely large body response (>1MB)      | 200         | Full body returned (may be slow for the client)    | Client handles truncation/streaming   |

## Verification

### API Integration Tests

#### Happy Path

- [ ] **View an existing wiki page**: Create a wiki page, then `GET /api/repos/:owner/:repo/wiki/:slug`. Assert `200`, response includes `id`, `slug`, `title`, `body`, `author.id`, `author.login`, `created_at`, `updated_at`.
- [ ] **View returns full body**: Create a wiki page with a multi-paragraph Markdown body. View it. Assert `body` field contains the full original content verbatim.
- [ ] **View includes author info**: Create a page as user X. View it. Assert `author.login` matches user X's login and `author.id` matches their UUID.
- [ ] **Timestamps are ISO 8601**: View a page. Assert `created_at` and `updated_at` are valid ISO 8601 strings.
- [ ] **View a recently updated page**: Create page, then edit it. View it. Assert `updated_at` is later than `created_at` and `author.login` is the editor's login.
- [ ] **View with empty body**: Create a page with `body: ""`. View it. Assert `200` and `body` is `""` (empty string, not null or missing).
- [ ] **View with Markdown body containing special characters**: Create page with body containing code fences, backticks, pipes (tables), HTML entities, and emoji. View it. Assert body is stored and returned verbatim.
- [ ] **Slug normalization on view**: Create page with slug `getting-started`. View with slug `Getting-Started`. Assert `200` and returns the correct page (case-insensitive lookup).
- [ ] **Slug with trailing/leading hyphens normalized**: Create page with slug `test`. View with slug `--test--`. Assert `200` and returns the page.
- [ ] **View page on public repo without auth**: Create a page on a public repo. View it without authentication. Assert `200`.

#### Error Cases

- [ ] **View nonexistent slug**: `GET /api/repos/:owner/:repo/wiki/nonexistent-slug-xyz`. Assert `404` with message `"wiki page not found"`.
- [ ] **View on nonexistent repository**: `GET /api/repos/:owner/nonexistent-repo/wiki/home`. Assert `404`.
- [ ] **View on nonexistent owner**: `GET /api/repos/nonexistent-owner/:repo/wiki/home`. Assert `404`.
- [ ] **Empty slug parameter**: `GET /api/repos/:owner/:repo/wiki/` (empty slug). Assert `400` with `"wiki slug is required"` or route mismatch.
- [ ] **Whitespace-only slug**: `GET /api/repos/:owner/:repo/wiki/%20%20`. Assert `400` with `"wiki slug is required"`.
- [ ] **Slug that normalizes to empty (all special chars)**: `GET /api/repos/:owner/:repo/wiki/!!!`. Assert `422` with validation error on `slug` field.

#### Permission Tests

- [ ] **Public repo, unauthenticated viewer**: View succeeds with `200`.
- [ ] **Public repo, authenticated viewer**: View succeeds with `200`.
- [ ] **Private repo, unauthenticated**: Returns `403`.
- [ ] **Private repo, repo owner**: View succeeds.
- [ ] **Private repo, org owner (if org-owned repo)**: View succeeds.
- [ ] **Private repo, collaborator with read access**: View succeeds.
- [ ] **Private repo, collaborator with write access**: View succeeds.
- [ ] **Private repo, collaborator with admin access**: View succeeds.
- [ ] **Private repo, team member with read permission**: View succeeds.
- [ ] **Private repo, authenticated user with no relationship**: Returns `403`.

#### Boundary / Size Tests

- [ ] **View page with maximum valid body (1,000,000 characters)**: Create a page with a 1,000,000-character body. View it. Assert `200` and the full body is returned without truncation.
- [ ] **View page with body just under the limit (999,999 characters)**: Assert `200`.
- [ ] **View page with very long title (255 characters)**: Create, then view. Assert title returned in full.
- [ ] **View page with very long slug (255 characters)**: Create page with 255-char alphanumeric slug. View it. Assert `200`.
- [ ] **Long slug normalization**: View with a 300-character slug parameter. Assert it normalizes and either returns the page or 404 (not 500).
- [ ] **Unicode slug parameter**: `GET /api/repos/:owner/:repo/wiki/日本語`. Assert `422` (normalizes to empty after stripping non-ASCII).
- [ ] **SQL metacharacters in slug**: `GET /api/repos/:owner/:repo/wiki/'OR%201=1--`. Assert `404` or `422`, not `500`.
- [ ] **Response payload under 2MB**: View a page with 1,000,000-character body. Assert the response size in bytes is under 2MB.

### CLI E2E Tests

- [ ] **`codeplane wiki view <slug>` returns page content**: After creating a page, `wiki view getting-started --repo OWNER/REPO` prints title, slug, author, timestamp, and body.
- [ ] **`codeplane wiki view <slug> --json` returns JSON**: Output is valid JSON with `id`, `slug`, `title`, `body`, `author`, `created_at`, `updated_at`.
- [ ] **`codeplane wiki view` for nonexistent slug**: Assert non-zero exit code and error message "wiki page not found" on stderr.
- [ ] **`codeplane wiki view` for nonexistent repo**: Assert non-zero exit code and error message about repository not found.
- [ ] **`codeplane wiki view` human output shows metadata**: Output contains "Slug:", "Author:", and "Updated:" lines.
- [ ] **`codeplane wiki view` human output shows body**: Output contains the page body below the metadata.
- [ ] **`codeplane wiki view` with empty body page**: Output shows metadata lines but no body section.
- [ ] **`codeplane wiki view` after edit**: Edit a page, then view it. Assert updated content is shown.
- [ ] **`codeplane wiki view` case-insensitive slug**: Create page `home`, view with `Home`. Assert success.
- [ ] **`codeplane wiki view --json` field integrity**: Assert JSON includes `body` field (unlike list which omits it).

### TUI E2E Tests

- [ ] **Wiki detail screen renders**: Navigate to a wiki page from the list via `Enter`. Assert the detail screen shows title, metadata, and body.
- [ ] **Title displays in bold**: Assert title text renders with bold attribute.
- [ ] **Slug displays at standard size**: At 120×40, assert `/slug` visible in muted color.
- [ ] **Slug hidden at compact size**: At 80×24, assert slug is not visible.
- [ ] **Author displays as @username**: Assert `@alice` style rendering in primary color.
- [ ] **Timestamps display correctly**: Assert relative timestamps visible (e.g., "3d ago").
- [ ] **Body renders markdown**: Assert heading text, code blocks, and lists are rendered.
- [ ] **Empty body shows placeholder**: View a page with empty body. Assert "This page has no content." message.
- [ ] **`j`/`k` scrolls content**: Navigate to a page with long body. Press `j` multiple times. Assert content scrolls down. Press `k`. Assert scrolls up.
- [ ] **`G` jumps to bottom**: Assert scroll position at bottom of content.
- [ ] **`g g` jumps to top**: Scroll down, then `g g`. Assert scroll at top.
- [ ] **`]` navigates to next page**: Press `]`. Assert different page content shown.
- [ ] **`[` navigates to previous page**: Press `]` then `[`. Assert original page content.
- [ ] **`]` at last page shows indicator**: Navigate to last page. Press `]`. Assert "Last page" in status bar.
- [ ] **`[` at first page shows indicator**: Navigate to first page. Press `[`. Assert "First page" in status bar.
- [ ] **`q` returns to wiki list**: Press `q`. Assert wiki list screen is current.
- [ ] **Loading state shows spinner**: Mock slow API response. Assert "Loading wiki page…" spinner visible.
- [ ] **404 error state renders**: Navigate to nonexistent slug. Assert "Wiki page not found" with "Press q to go back".
- [ ] **Network error state with retry**: Mock API failure. Assert "Failed to load wiki page" with "Press R to retry". Press `R`. Assert retry occurs.
- [ ] **Status bar shows correct hints**: Assert `j/k:scroll  [/]:prev/next  e:edit  d:delete  q:back` for write-access user.
- [ ] **Status bar omits write hints for read-only user**: Assert `j/k:scroll  [/]:prev/next  q:back` only.
- [ ] **Body truncation at 100k characters**: View page with >100,000 chars. Assert truncation notice visible.
- [ ] **Breadcrumb display**: Assert breadcrumb shows `… > Wiki > Page Title`.

### Playwright (Web UI) E2E Tests

Note: Web UI for wiki view does not currently exist. When implemented, the following tests should be added:

- [ ] **Wiki page loads at URL**: Navigate to `/:owner/:repo/wiki/:slug`. Assert page renders with title, author, timestamps, and body.
- [ ] **Markdown body renders correctly**: Create page with headings, code blocks, and lists. Assert they render as HTML elements (h1, pre/code, ul/li).
- [ ] **Title and metadata displayed**: Assert title is visible as a heading, author as a link, and timestamps displayed.
- [ ] **Slug displayed**: Assert the page slug is visible as contextual information.
- [ ] **Empty body shows placeholder**: Navigate to a page with empty body. Assert placeholder text visible.
- [ ] **Edit button visible for write users**: Visit as a write-access user. Assert "Edit" button is present.
- [ ] **Edit button hidden for read-only users**: Visit as a read-only user. Assert "Edit" button is not visible.
- [ ] **Delete button visible for write users**: Visit as a write-access user. Assert "Delete" button is present.
- [ ] **Click edit navigates to edit page**: Click "Edit" button. Assert navigation to edit form.
- [ ] **Click delete shows confirmation modal**: Click "Delete". Assert confirmation dialog appears.
- [ ] **404 page renders for nonexistent slug**: Navigate to `/:owner/:repo/wiki/nonexistent`. Assert 404 page with link back to wiki list.
- [ ] **Permission-gated**: Unauthenticated user on private repo sees 403 or redirect.
- [ ] **Breadcrumb navigates back to list**: Click wiki link in breadcrumb. Assert navigation to wiki list.
- [ ] **Body with syntax-highlighted code blocks**: Assert code blocks render with syntax highlighting.
- [ ] **Back navigation preserves list state**: Navigate from list to view, then back. Assert list search/pagination state preserved.
