# WIKI_CREATE

Specification for WIKI_CREATE.

## High-Level User POV

When a repository collaborator needs to document architecture decisions, onboarding guides, runbooks, or any knowledge associated with a repository, they create wiki pages directly within Codeplane. The wiki is a first-class repository surface—every repository gets its own wiki namespace, and creating a page is available from the CLI, the web UI, the TUI, and the API.

To create a wiki page, the user provides a title and optionally a body written in Markdown. Codeplane automatically generates a URL-friendly slug from the title (for example, "Getting Started Guide" becomes `getting-started-guide`), though the user may override this with a custom slug if they prefer a different URL path. Once created, the page is immediately visible to anyone who can read the repository, and it appears in the wiki list sorted by most-recently-updated.

The experience is intentionally lightweight. There is no approval flow, no draft state, and no versioning pipeline—wiki pages are living documents meant to be created quickly and iterated on. The creating user is recorded as the page author, and timestamps track when the page was created and last modified.

If a user tries to create a page whose slug would collide with an existing page in the same repository, they receive a clear conflict error and are prompted to choose a different title or slug. This prevents accidental overwrites and keeps the wiki namespace clean.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user with write access to a repository can create a wiki page via the API, CLI, TUI, and web UI.
- [ ] The created page is immediately retrievable by its slug.
- [ ] The created page appears in the wiki list endpoint ordered by `updated_at DESC`.
- [ ] The creating user is recorded as the page author.
- [ ] The response includes the page `id`, `slug`, `title`, `body`, `author` (with `id` and `login`), `created_at`, and `updated_at`.
- [ ] The HTTP response status is `201 Created`.

### Input Validation

- [ ] `title` is required. An empty string, whitespace-only string, or missing `title` field must return a `422 Validation Failed` error with `resource: "WikiPage"`, `field: "title"`, `code: "missing_field"`.
- [ ] `body` is required in the request payload. An empty string (`""`) is permitted and represents a blank page.
- [ ] `slug` is optional. When omitted, the slug is auto-generated from the title using the slugification algorithm.
- [ ] A user-provided `slug` is normalized: lowercased, non-alphanumeric characters replaced with hyphens, consecutive hyphens collapsed, leading/trailing hyphens stripped. If the result is empty after normalization, a `422` error is returned with `field: "slug"`, `code: "invalid"`.
- [ ] The `title` field is trimmed of leading and trailing whitespace before storage.

### Slug Generation Algorithm

- [ ] The title is trimmed and lowercased.
- [ ] Characters outside `a-z` and `0-9` are replaced with a single hyphen (no consecutive hyphens).
- [ ] Leading and trailing hyphens are stripped.
- [ ] Example: `"  My First Page!  "` → `"my-first-page"`.
- [ ] Example: `"---test---"` → `"test"`.
- [ ] Example: `"Hello   World"` → `"hello-world"`.

### Boundary Constraints

- [ ] Title maximum length: 255 characters (after trim). Titles exceeding this limit must be rejected with a `422` error.
- [ ] Slug maximum length: 255 characters (after normalization). Slugs exceeding this limit must be rejected with a `422` error.
- [ ] Body maximum length: 1,000,000 characters (1 MB of text). Bodies exceeding this limit must be rejected with a `400` error.
- [ ] Minimum title length: 1 character (after trim).
- [ ] Minimum slug length: 1 character (after normalization).

### Conflict Handling

- [ ] If a wiki page with the same slug already exists in the target repository, the server must return a `409 Conflict` error with the message `"wiki page already exists"`.
- [ ] Slug uniqueness is scoped to the repository. Two different repositories may have pages with identical slugs.
- [ ] Conflict detection is case-insensitive (slugs are always stored lowercased).

### Edge Cases

- [ ] Creating a page with a title that slugifies to the same value as an existing page's slug returns `409`.
- [ ] Creating a page with a title consisting entirely of special characters (e.g., `"!!!"`) produces an empty slug after normalization and returns `422`.
- [ ] Creating a page with Unicode characters in the title: non-ASCII letters are stripped during slugification; if this results in an empty slug, `422` is returned.
- [ ] Creating a page on a non-existent repository returns `404`.
- [ ] Creating a page on a repository the user cannot write to returns `403`.
- [ ] Creating a page without authentication returns `401`.
- [ ] Submitting a malformed JSON body returns `400 Bad Request` with `"invalid request body"`.
- [ ] Submitting a request with `Content-Type` other than `application/json` for mutation routes is rejected.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/wiki`

**Authentication:** Required. Session cookie, PAT `Authorization` header, or OAuth2 token.

**Request Body:**
```json
{
  "title": "Getting Started",
  "slug": "getting-started",
  "body": "# Getting Started\n\nWelcome to the project wiki."
}
```

| Field   | Type     | Required | Default                          | Description                                |
|---------|----------|----------|----------------------------------|--------------------------------------------||
| `title` | `string` | Yes      | —                                | Human-readable page title                  |
| `slug`  | `string` | No       | Auto-generated from `title`      | URL-safe identifier for the page           |
| `body`  | `string` | Yes      | —                                | Markdown content of the page (may be `""`) |

**Success Response:** `201 Created`
```json
{
  "id": "01234567-89ab-cdef-0123-456789abcdef",
  "slug": "getting-started",
  "title": "Getting Started",
  "body": "# Getting Started\n\nWelcome to the project wiki.",
  "author": {
    "id": "98765432-10ab-cdef-0123-456789abcdef",
    "login": "alice"
  },
  "created_at": "2026-03-22T10:00:00.000Z",
  "updated_at": "2026-03-22T10:00:00.000Z"
}
```

**Error Responses:**

| Status | Condition                                  | Body shape                                                                 |
|--------|--------------------------------------------|----------------------------------------------------------------------------|
| `400`  | Malformed JSON body                        | `{ "message": "invalid request body" }`                                    |
| `401`  | No authentication provided                 | `{ "message": "authentication required" }`                                 |
| `403`  | User lacks write permission                | `{ "message": "permission denied" }`                                       |
| `404`  | Repository not found                       | `{ "message": "repository not found" }`                                    |
| `409`  | Slug already exists in this repository     | `{ "message": "wiki page already exists" }`                                |
| `422`  | Title empty or slug invalid after normalize| `{ "message": "Validation Failed", "errors": [{...}] }` |

### SDK Shape

The `WikiService` class in `@codeplane/sdk` exposes:

```typescript
async createWikiPage(
  actor: AuthUser | undefined,
  owner: string,
  repo: string,
  input: CreateWikiPageInput,
): Promise<WikiPageResponse>
```

Where:
```typescript
interface CreateWikiPageInput {
  title: string;
  slug?: string;
  body: string;
}

interface WikiPageResponse {
  id: string;
  slug: string;
  title: string;
  body?: string;
  author: { id: string; login: string };
  created_at: Date;
  updated_at: Date;
}
```

The service performs: repository resolution → write access check → title normalization → slug generation/normalization → database insert → conflict detection → response mapping.

### CLI Command

**Command:** `codeplane wiki create`

**Synopsis:**
```
codeplane wiki create --title <TITLE> [--slug <SLUG>] [--body <BODY>] [--repo <OWNER/REPO>]
```

**Options:**

| Flag       | Type     | Required | Default               | Description                              |
|------------|----------|----------|-----------------------|------------------------------------------|
| `--title`  | `string` | Yes      | —                     | Page title                               |
| `--slug`   | `string` | No       | Auto-generated        | Custom slug override                     |
| `--body`   | `string` | No       | `""`                  | Markdown content                         |
| `--repo`   | `string` | No       | Inferred from cwd/jj  | Repository in `OWNER/REPO` format        |

**Output (human-readable):**
```
Created wiki page Getting Started (getting-started)
```

**Output (structured with `--json`):**
```json
{
  "id": "...",
  "slug": "getting-started",
  "title": "Getting Started",
  "body": "...",
  "author": { "id": "...", "login": "alice" },
  "created_at": "...",
  "updated_at": "..."
}
```

**Error Output:** On failure, the CLI writes the error detail to stderr and exits with a non-zero code.

### TUI UI

The TUI wiki create flow is triggered by pressing `c` from the Wiki List screen.

**Create Form Screen:**

| Field    | Widget         | Validation                          |
|----------|----------------|-------------------------------------|
| Title    | Single-line    | Required, non-empty                 |
| Slug     | Single-line    | Optional, auto-populated from title |
| Body     | Multi-line     | Optional, Markdown                  |

**Keyboard Controls:**
- `Tab` / `Shift+Tab` — navigate between fields
- `Ctrl+S` — submit the form
- `Esc` — cancel (with dirty-check confirmation if content has been entered)
- Inline validation error shown beneath the title field if empty on submit

**Success Behavior:** On successful creation, the TUI navigates to the wiki detail view for the newly created page with a brief success toast/flash message.

**Error Behavior:** On conflict (409), an inline error appears: "A wiki page with this slug already exists." On permission errors, a modal alert is shown.

### Web UI Design

The web wiki create flow is accessible from:
1. A "New Page" button on the wiki list view (`/:owner/:repo/wiki`).
2. The command palette via `wiki:create` action.

**Create Page Form (`/:owner/:repo/wiki/new`):**

- **Title field:** Text input at the top, placeholder "Page title", autofocus on mount. Live slug preview shown beneath as muted text: `"Slug: getting-started"`. The preview updates on keystroke.
- **Body field:** Full-width Markdown editor area below the title. Supports tab indentation and basic Markdown toolbar (bold, italic, heading, link, code block, list).
- **Advanced section (collapsed by default):** Custom slug override input. When the user types a custom slug, the auto-generated slug preview is replaced.
- **Submit button:** "Create Page" button at the bottom right. Disabled when title is empty.
- **Cancel link:** "Cancel" link that navigates back to the wiki list.

**Validation UX:**
- Client-side: title field shows inline error "Title is required" if user focuses away while empty.
- Server-side: on `409`, the form shows "A page with the slug 'getting-started' already exists. Choose a different title or provide a custom slug." without clearing the form.
- Server-side: on `403`, redirect to the repo wiki list with a flash notification "You do not have permission to create wiki pages in this repository."

**After Create:** Navigate to `/:owner/:repo/wiki/:slug` to view the newly created page.

### Documentation

The following end-user documentation should be written:

1. **Wiki overview page** — explains what the wiki is, that it is repository-scoped, and how to navigate to it.
2. **Creating a wiki page** — step-by-step instructions for web UI, CLI, and TUI. Covers title requirements, slug auto-generation, Markdown body, and the custom slug option.
3. **CLI reference: `codeplane wiki create`** — full flag reference, examples, and exit codes.
4. **API reference: `POST /api/repos/:owner/:repo/wiki`** — request/response schema, authentication, error codes, and cURL example.

## Permissions & Security

### Authorization Matrix

| Role                              | Can Create Wiki Page? |
|-----------------------------------|-----------------------|
| Repository Owner                  | ✅ Yes                |
| Organization Owner (on org repos) | ✅ Yes                |
| Team Member with `admin` perm     | ✅ Yes                |
| Team Member with `write` perm     | ✅ Yes                |
| Team Member with `read` perm      | ❌ No (403)           |
| Collaborator with `admin` perm    | ✅ Yes                |
| Collaborator with `write` perm    | ✅ Yes                |
| Collaborator with `read` perm     | ❌ No (403)           |
| Authenticated, no relationship    | ❌ No (403)           |
| Unauthenticated                   | ❌ No (401)           |

### Rate Limiting

- **Per-user rate limit:** 30 wiki page creations per hour per user across all repositories.
- **Per-repository rate limit:** 100 wiki page creations per hour per repository (aggregate across all users).
- **Global payload size limit:** Request bodies exceeding 2 MB are rejected at the middleware layer before reaching the wiki route.
- Rate limit responses use `429 Too Many Requests` with `Retry-After` header.

### Data Privacy

- Wiki page content may contain sensitive information. The repository visibility model (public vs. private) governs read access. Private repository wiki pages are only accessible to authenticated users with at least read permission.
- The `author.id` and `author.login` fields are exposed in the response. These are considered public profile information, not PII.
- Wiki page bodies should be scanned for accidental secret patterns (e.g., API keys) only if a secret-scanning feature is enabled at the repository or organization level. This is out of scope for the core WIKI_CREATE feature but is noted as a future integration point.
- No user IP addresses, session tokens, or device fingerprints are stored in the wiki page record.

## Telemetry & Product Analytics

### Business Events

| Event Name        | Trigger                                  | Properties                                                                                                                   |
|-------------------|------------------------------------------|------------------------------------------------------------------------------------------------------------------------------|
| `WikiPageCreated` | Successful `201` response from create    | `repository_id`, `repository_owner`, `repository_name`, `wiki_page_id`, `wiki_page_slug`, `author_id`, `slug_was_custom` (bool), `body_length` (int), `client` (`api`/`cli`/`tui`/`web`), `timestamp` |
| `WikiPageCreateFailed` | Any error response from create      | `repository_owner`, `repository_name`, `error_code` (401/403/404/409/422), `client`, `timestamp`                             |

### Funnel Metrics

- **Creation rate:** number of `WikiPageCreated` events per day/week, segmented by `client`.
- **Adoption breadth:** number of distinct repositories with at least one `WikiPageCreated` event in the trailing 30 days.
- **Conflict rate:** ratio of `WikiPageCreateFailed` with `error_code: 409` to total create attempts. A high rate indicates users are struggling with slug collisions and may benefit from better slug suggestion UX.
- **Empty body rate:** percentage of `WikiPageCreated` events where `body_length == 0`. A high rate may indicate users are creating placeholder pages and not returning to fill them in.
- **Custom slug rate:** percentage of `WikiPageCreated` events where `slug_was_custom == true`. Informs whether the auto-slugification algorithm is meeting user expectations.

## Observability

### Logging

| Log Point                          | Level  | Structured Context                                                                 |
|------------------------------------|--------|------------------------------------------------------------------------------------|
| Wiki page created successfully     | `info` | `event: "wiki_page_created"`, `repository_id`, `wiki_page_id`, `slug`, `author_id` |
| Wiki page create conflict          | `warn` | `event: "wiki_page_conflict"`, `repository_id`, `slug`, `author_id`                |
| Wiki page create validation failed | `warn` | `event: "wiki_page_validation_failed"`, `repository_id`, `field`, `code`, `author_id` |
| Wiki page create permission denied | `warn` | `event: "wiki_page_permission_denied"`, `repository_id`, `user_id`                 |
| Wiki page create unauthenticated   | `info` | `event: "wiki_page_unauthenticated_attempt"`, `repository_owner`, `repository_name` |
| Wiki page create internal error    | `error`| `event: "wiki_page_create_internal_error"`, `repository_id`, `error_message`, `stack_trace` |
| Malformed JSON body                | `warn` | `event: "wiki_page_bad_request"`, `repository_owner`, `repository_name`             |

### Prometheus Metrics

| Metric                                         | Type      | Labels                                    | Description                                      |
|-------------------------------------------------|-----------|-------------------------------------------|--------------------------------------------------|
| `codeplane_wiki_pages_created_total`            | Counter   | `owner`, `repo`                           | Total wiki pages created                         |
| `codeplane_wiki_page_create_errors_total`       | Counter   | `error_code` (401/403/404/409/422/500)    | Total wiki create errors by type                 |
| `codeplane_wiki_page_create_duration_seconds`   | Histogram | `owner`, `repo`                           | Latency of wiki page create operations           |
| `codeplane_wiki_page_body_size_bytes`           | Histogram | —                                         | Distribution of wiki page body sizes at creation |
| `codeplane_wiki_pages_per_repo`                 | Gauge     | `owner`, `repo`                           | Current number of wiki pages per repository      |

### Alerts

#### Alert: High Wiki Create Error Rate
- **Condition:** `rate(codeplane_wiki_page_create_errors_total{error_code="500"}[5m]) > 0.5`
- **Severity:** Critical
- **Runbook:**
  1. Check server logs for `event: "wiki_page_create_internal_error"` entries in the last 15 minutes.
  2. Identify if the errors correlate to a specific repository or are global.
  3. Check database connectivity: run `SELECT 1` against the primary database.
  4. Check if the `wiki_pages` table is experiencing lock contention or if a migration is running.
  5. If the issue is database-related, check disk space and connection pool saturation.
  6. If a single repository is affected, check whether it has an unusually large number of wiki pages causing unique constraint scan slowdowns.
  7. Escalate to the database on-call if not resolved within 15 minutes.

#### Alert: Wiki Create Latency Spike
- **Condition:** `histogram_quantile(0.95, rate(codeplane_wiki_page_create_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning
- **Runbook:**
  1. Check if overall API latency is elevated (cross-reference with global latency metrics).
  2. Check database query latency for `INSERT INTO wiki_pages` and the repository lookup queries.
  3. Review active database connections and slow query logs.
  4. Check if a bulk import or migration is running.
  5. If isolated to wiki creates, check for table bloat on `wiki_pages` and consider running `VACUUM ANALYZE`.

#### Alert: Elevated Conflict Rate
- **Condition:** `rate(codeplane_wiki_page_create_errors_total{error_code="409"}[1h]) / rate(codeplane_wiki_pages_created_total[1h]) > 0.25`
- **Severity:** Warning
- **Runbook:**
  1. This is likely a product UX issue, not an infrastructure issue.
  2. Check if a single user or automation is repeatedly attempting to create pages with conflicting slugs.
  3. Review if the slugification algorithm is producing unexpected collisions (e.g., stripping too many characters).
  4. File a product issue if the conflict rate persists, recommending improved slug suggestion or deduplication UX.

### Error Cases and Failure Modes

| Error Case                       | Expected Behavior                                                    | Recovery                              |
|----------------------------------|----------------------------------------------------------------------|---------------------------------------|
| Database connection lost         | `500 Internal Server Error` returned; logged as `error`              | Automatic reconnection via pool       |
| Unique constraint violation      | `409 Conflict` returned; logged as `warn`                            | User chooses different slug           |
| Author user record deleted       | Should not occur (FK constraint); if orphaned, `500` error           | Investigate data integrity            |
| Repository deleted mid-request   | `404` from repo resolution; race condition is benign                 | User retries on existing repo         |
| Payload exceeds size limit       | `400`/`413` from middleware before reaching wiki route               | User reduces body size                |
| Rate limit exceeded              | `429 Too Many Requests` with `Retry-After`                           | User waits and retries                |
| Invalid UTF-8 in body           | JSON parse failure → `400 Bad Request`                               | User fixes input encoding             |

## Verification

### API Integration Tests

1. **Create a wiki page with title and body** — POST with valid title/body, assert `201`, assert response includes `id`, `slug`, `title`, `body`, `author`, `created_at`, `updated_at`.
2. **Create a wiki page with custom slug** — POST with `title`, `slug`, `body`; assert response `slug` matches the provided (normalized) slug.
3. **Create a wiki page with empty body** — POST with `title` and `body: ""`; assert `201`, assert `body` is `""`.
4. **Auto-generated slug matches slugification rules** — POST with title `"My First Page!"`; assert `slug` is `"my-first-page"`.
5. **Auto-generated slug with consecutive spaces** — POST with title `"Hello   World"`; assert `slug` is `"hello-world"`.
6. **Auto-generated slug with leading/trailing special chars** — POST with title `"---Test---"`; assert `slug` is `"test"`.
7. **Auto-generated slug with Unicode title** — POST with title `"日本語ページ"` (all stripped); assert `422` because slug is empty.
8. **Auto-generated slug with mixed ASCII and Unicode** — POST with title `"Page α1"`, assert slug is `"page-1"`.
9. **Duplicate slug returns 409** — Create page with slug `"home"`, then create another with the same slug; assert `409` on the second.
10. **Duplicate slug from auto-generation returns 409** — Create page titled `"Home"`, then create another titled `"Home"`; assert `409`.
11. **Duplicate slug across different repos is allowed** — Create page with slug `"home"` in repo A, then same slug in repo B; assert both return `201`.
12. **Missing title returns 422** — POST with `body` only; assert `422` with field `"title"`.
13. **Empty title (whitespace only) returns 422** — POST with `title: "   "`, `body: "x"`; assert `422`.
14. **Invalid slug (all special chars) returns 422** — POST with `title: "Test"`, `slug: "!!!"`, `body: "x"`; assert `422` with field `"slug"`.
15. **Malformed JSON body returns 400** — POST with body `"not json"`; assert `400`.
16. **Missing Content-Type header for POST** — Send POST without JSON content type; assert rejection.
17. **Unauthenticated request returns 401** — POST without auth; assert `401`.
18. **Read-only collaborator returns 403** — POST as a user with only read access; assert `403`.
19. **Non-collaborator on private repo returns 403** — POST as a user with no relationship to a private repo; assert `403`.
20. **Non-existent repository returns 404** — POST to `/:owner/nonexistent/wiki`; assert `404`.
21. **Non-existent owner returns 404** — POST to `/nonexistent/:repo/wiki`; assert `404`.
22. **Author field matches the creating user** — Create page, assert `author.login` matches the authenticated user's login.
23. **Timestamps are set** — Create page, assert `created_at` and `updated_at` are recent ISO timestamps and `created_at == updated_at`.
24. **Created page is retrievable via GET** — Create page, then GET `/:owner/:repo/wiki/:slug`; assert `200` and matching fields.
25. **Created page appears in list** — Create page, then GET list endpoint; assert the page appears in results.
26. **Title at maximum valid length (255 chars)** — POST with a 255-character title; assert `201`.
27. **Title exceeding maximum length (256 chars)** — POST with a 256-character title; assert `422` or `400`.
28. **Body at maximum valid length (1,000,000 chars)** — POST with a 1 MB body; assert `201`.
29. **Body exceeding maximum length (1,000,001 chars)** — POST with body exceeding 1 MB; assert `400`.
30. **Slug at maximum valid length (255 chars)** — POST with a 255-character alphanumeric slug; assert `201`.
31. **Slug exceeding maximum length (256 chars)** — POST with a 256-character slug; assert `422` or `400`.
32. **Body containing Markdown with special characters** — POST with body containing `# Heading\n\n` + code fences + tables; assert `201` and body stored verbatim.
33. **Title with HTML entities** — POST with title `"<script>alert('xss')</script>"`; assert `201`, slug is `"script-alert-xss-script"`, title stored as-is.
34. **Concurrent duplicate creation** — Two simultaneous POSTs with the same slug; exactly one should succeed (201), the other should fail (409).
35. **Write access via org ownership** — POST as an org owner on an org-owned repo; assert `201`.
36. **Write access via team write permission** — POST as a team member with write; assert `201`.
37. **Write access via collaborator admin** — POST as a collaborator with admin; assert `201`.

### CLI E2E Tests

38. **`codeplane wiki create --title "Home" --body "content" --repo OWNER/REPO`** — assert exit code 0, output contains `Created wiki page Home (home)`.
39. **`codeplane wiki create --title "Home" --repo OWNER/REPO --json`** — assert exit code 0, output is valid JSON with `title`, `slug`, `body`, `author`.
40. **`codeplane wiki create --title "Custom" --slug "my-slug" --repo OWNER/REPO`** — assert slug in output is `my-slug`.
41. **`codeplane wiki create` without `--title`** — assert non-zero exit code and error message about missing title.
42. **`codeplane wiki create --title "Home" --repo OWNER/REPO` twice** — first succeeds, second exits non-zero with conflict error.
43. **`codeplane wiki create --title "Home" --repo nonexistent/repo`** — assert non-zero exit code, error about repository not found.
44. **Create via CLI then verify via `wiki list`** — create page, run `wiki list --json`, assert page appears in list.
45. **Create via CLI then verify via `wiki view`** — create page, run `wiki view <slug> --json`, assert response matches.
46. **Create with empty body via CLI** — `--body ""`, assert success.
47. **Create with multi-line body via CLI** — `--body "line1\nline2"`, assert body stored with newlines.

### Playwright (Web UI) E2E Tests

48. **Navigate to wiki list, click "New Page", fill title, submit** — assert navigation to detail page with new page content.
49. **Slug preview updates as user types title** — type title, assert slug preview text updates in real time.
50. **Submit with empty title shows validation error** — clear title, click submit, assert inline error visible.
51. **Submit with conflicting slug shows conflict error** — create page, navigate back, create another with same title, assert conflict error message visible.
52. **Cancel button navigates back to wiki list** — click cancel, assert URL is wiki list.
53. **Custom slug override** — expand advanced section, enter custom slug, submit, assert created page uses custom slug.
54. **Markdown body is submitted correctly** — enter Markdown in body, submit, navigate to detail, assert rendered content.
55. **Unauthorized user does not see "New Page" button** — visit wiki list as read-only user, assert "New Page" button is not visible or disabled.
56. **Keyboard submission** — fill form, press `Ctrl+Enter` or equivalent, assert page is created.

### TUI E2E Tests

57. **Press `c` from wiki list screen opens create form** — assert form screen is rendered with title, slug, body fields.
58. **Submit form with valid title creates page** — fill title, press `Ctrl+S`, assert navigation to detail view.
59. **Submit form with empty title shows error** — press `Ctrl+S` without filling title, assert error message visible.
60. **Cancel form with `Esc` returns to wiki list** — press `Esc`, assert return to wiki list.
61. **Cancel with dirty content shows confirmation** — type title, press `Esc`, assert confirmation prompt.
62. **Created page appears in wiki list** — create page, navigate back to list, assert page is in the list.
