# WIKI_EDIT

Specification for WIKI_EDIT.

## High-Level User POV

When a repository collaborator has created a wiki page and later needs to correct information, expand documentation, fix a typo, restructure content, or simply change the page's URL-friendly slug, the Wiki Edit feature lets them update any combination of a wiki page's title, slug, and body in a single operation. The edit is a partial update — users supply only the fields they want to change, and everything else remains untouched.

From the web UI, a user navigates to a wiki page's detail view and clicks an "Edit" button to enter an editing mode. The title becomes an editable input, the body switches to a Markdown editor with preview capabilities, and an advanced section allows overriding the slug. The user makes their changes and clicks "Save" — or presses a keyboard shortcut — and the page updates immediately. If the user tries to leave the page or cancel with unsaved changes, they are prompted to confirm they want to discard their work.

From the CLI, a user runs `codeplane wiki edit <slug>` with flags like `--title`, `--slug`, or `--body` to make precise edits without leaving the terminal. The CLI returns either a human-friendly confirmation or structured JSON output, making it suitable for both interactive use and scripting.

From the TUI, a user presses `e` on a wiki page (from either the wiki list or the wiki detail view) to open a full-screen edit form. The form is pre-populated with the page's current values and supports keyboard-driven navigation between fields, a multi-line Markdown body editor, and `Ctrl+S` to save.

The value of Wiki Edit is that wiki pages are living documents. Teams use them for architecture decisions, runbooks, onboarding guides, and project-specific knowledge that evolves over time. Making edits fast, available from every client surface, and conflict-aware (via slug uniqueness enforcement) means knowledge stays current without requiring page deletion and recreation. The last editor is always recorded as the page author, and the `updated_at` timestamp tracks when the page was last modified, giving collaborators visibility into how fresh the documentation is.

## Acceptance Criteria

### Definition of Done

- [ ] An authenticated user with write access to a repository can update a wiki page's title, slug, and/or body via `PATCH /api/repos/:owner/:repo/wiki/:slug`
- [ ] The CLI `codeplane wiki edit <slug>` command successfully updates wiki page fields and returns the updated record
- [ ] The TUI wiki edit form opens pre-populated with current values, submits only modified fields, and returns to the previous screen on success
- [ ] The web UI provides an edit affordance on the wiki page detail view that allows editing of title, body, and slug
- [ ] The API returns the full updated `WikiPageResponse` on success (200 OK)
- [ ] The `updated_at` timestamp is set to the current time on every successful edit
- [ ] The `author_id` is updated to the editing user on every successful edit (records the last editor)

### Field Validation

- [ ] **Title**: If provided, must not be empty or whitespace-only after trimming. Maximum 255 characters after trim. Whitespace-only titles are rejected with `422`
- [ ] **Slug**: If provided, is normalized through the slugification algorithm (lowercased, non-alphanumeric characters replaced with hyphens, consecutive hyphens collapsed, leading/trailing hyphens stripped). If the result is empty after normalization, `422` is returned. Maximum 255 characters after normalization
- [ ] **Body**: If provided, any string is accepted including empty string (to clear the body). Maximum 1,000,000 characters (1 MB of text)
- [ ] At least one field (`title`, `slug`, or `body`) must be provided. A request with none of these fields must return `400` with `"at least one field must be provided"`

### Boundary Constraints

- [ ] Title maximum length: 255 characters (after trim). Titles exceeding this limit must be rejected with `422`
- [ ] Title minimum length: 1 character (after trim)
- [ ] Slug maximum length: 255 characters (after normalization). Slugs exceeding this limit must be rejected with `422`
- [ ] Slug minimum length: 1 character (after normalization)
- [ ] Body maximum length: 1,000,000 characters. Bodies exceeding this limit must be rejected with `400`
- [ ] Body may be empty string `""` (to clear content)

### Slug Change Behavior

- [ ] The slug can be changed in an edit operation. This effectively changes the page's URL
- [ ] If the new slug collides with an existing page's slug in the same repository, the server must return `409 Conflict` with `"wiki page already exists"`
- [ ] Slug uniqueness is scoped to the repository. Two different repositories may have pages with identical slugs
- [ ] Slug collision detection is case-insensitive (slugs are always lowercased)
- [ ] After a successful slug change, the page is accessible at the new slug URL and no longer accessible at the old slug URL
- [ ] A user-provided slug is normalized before storage: lowercased, non-alphanumeric characters replaced with hyphens, consecutive hyphens collapsed, leading/trailing hyphens stripped

### Edge Cases

- [ ] An empty JSON body `{}` (no recognized fields) must return `400` with `"at least one field must be provided"`
- [ ] Editing a page with a title that slugifies to the same value as an existing page's slug returns `409`
- [ ] Editing a page's slug to the same value it already has (no-op slug change) must succeed (200 OK)
- [ ] Editing a page on a non-existent repository returns `404`
- [ ] Editing a page with a slug that does not exist returns `404`
- [ ] Editing a page without authentication returns `401`
- [ ] Editing a page the user cannot write to returns `403`
- [ ] Submitting a malformed JSON body returns `400` with `"invalid request body"`
- [ ] Submitting a request with `Content-Type` other than `application/json` for the PATCH route is rejected
- [ ] A slug consisting entirely of special characters after normalization produces an empty slug and returns `422`
- [ ] Unicode characters in title are accepted and preserved; Unicode in slug is stripped during normalization
- [ ] Concurrent edits to the same page: both succeed independently; last write wins
- [ ] Concurrent edits that both change the slug to the same new value: exactly one succeeds, the other returns `409`
- [ ] Title with HTML entities (e.g., `<script>alert('xss')</script>`) is stored as-is (no server-side sanitization; clients handle escaping)
- [ ] Body containing Markdown with code fences, tables, images, and raw HTML is stored and returned verbatim
- [ ] Providing unknown fields in the JSON body are silently ignored
- [ ] The `id`, `created_at`, `author` fields are read-only and cannot be set through the edit endpoint (ignored if provided)

## Design

### API Shape

**Endpoint:** `PATCH /api/repos/:owner/:repo/wiki/:slug`

**Authentication:** Required. Session cookie, PAT `Authorization` header, or OAuth2 token.

**Path Parameters:**
- `owner` — Repository owner username or organization name
- `repo` — Repository name
- `slug` — Current URL-safe slug of the wiki page to edit

**Request Body (all fields optional, but at least one required):**
```json
{
  "title": "Updated Page Title",
  "slug": "updated-page-title",
  "body": "# Updated Content\n\nThis page has been revised."
}
```

| Field   | Type     | Required | Description                                                           |
|---------|----------|----------|-----------------------------------------------------------------------|
| `title` | `string` | No       | New page title. Trimmed before storage                                |
| `slug`  | `string` | No       | New URL-safe slug. Normalized through slugification algorithm         |
| `body`  | `string` | No       | New Markdown content. May be empty string to clear                    |

**Success Response (200 OK):**
```json
{
  "id": "01234567-89ab-cdef-0123-456789abcdef",
  "slug": "updated-page-title",
  "title": "Updated Page Title",
  "body": "# Updated Content\n\nThis page has been revised.",
  "author": {
    "id": "98765432-10ab-cdef-0123-456789abcdef",
    "login": "alice"
  },
  "created_at": "2026-03-20T10:00:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses:**

| Status | Condition                                         | Body shape                                                                       |
|--------|--------------------------------------------------|---------------------------------------------------------------------------------|
| `400`  | Malformed JSON body                               | `{ "message": "invalid request body" }`                                          |
| `400`  | No update fields provided                         | `{ "message": "at least one field must be provided" }`                           |
| `401`  | No authentication provided                        | `{ "message": "authentication required" }`                                       |
| `403`  | User lacks write permission                       | `{ "message": "permission denied" }`                                             |
| `404`  | Repository not found                              | `{ "message": "repository not found" }`                                          |
| `404`  | Wiki page not found                               | `{ "message": "wiki page not found" }`                                           |
| `409`  | New slug conflicts with existing page             | `{ "message": "wiki page already exists" }`                                      |
| `422`  | Title empty after trim or slug invalid            | `{ "message": "Validation Failed", "errors": [{"resource":"WikiPage","field":"title","code":"missing_field"}] }` |
| `429`  | Rate limit exceeded                               | Standard rate limit response with `Retry-After` header                           |

### SDK Shape

The `WikiService` class in `@codeplane/sdk` exposes:

```typescript
async updateWikiPage(
  actor: AuthUser | undefined,
  owner: string,
  repo: string,
  slug: string,
  input: UpdateWikiPageInput,
): Promise<WikiPageResponse>
```

Where:
```typescript
interface UpdateWikiPageInput {
  title?: string;
  slug?: string;
  body?: string;
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

The service performs: authentication check → repository resolution → write access check → page existence check → at-least-one-field validation → title normalization (if provided) → slug normalization (if provided) → database update → conflict detection on slug uniqueness → response mapping.

Data hooks for UI/TUI consumers:
- `useWikiPage(owner, repo, slug)` — Fetches current page for pre-population
- `useUpdateWikiPage()` — Returns `{ mutate, loading, error }` for submitting edits

### CLI Command

**Command:** `codeplane wiki edit <slug>`

**Arguments:**
- `<slug>` (required) — Current slug of the wiki page to edit

**Options:**

| Flag      | Type     | Required | Default              | Description                       |
|-----------|----------|----------|----------------------|-----------------------------------|
| `--title` | `string` | No       | —                    | New page title                    |
| `--slug`  | `string` | No       | —                    | New custom slug                   |
| `--body`  | `string` | No       | —                    | New Markdown content              |
| `--repo`  | `string` | No       | Inferred from cwd/jj | Repository in `OWNER/REPO` format |

**Output (human-readable):**
```
Updated wiki page Updated Page Title (updated-page-title)
```

**Output (structured with `--json`):**
```json
{
  "id": "...",
  "slug": "updated-page-title",
  "title": "Updated Page Title",
  "body": "...",
  "author": { "id": "...", "login": "alice" },
  "created_at": "...",
  "updated_at": "..."
}
```

**Error Output:** On failure, the CLI writes the error detail to stderr and exits with a non-zero code. Examples:
```
Error: wiki page not found
Error: at least one field must be provided
Error: wiki page already exists
Error: permission denied
```

**Notable behavior:**
- At least one of `--title`, `--slug`, or `--body` must be provided. The CLI exits with an error if none are specified
- Supports `--json` field filtering (e.g., `--json title,slug`)
- Repository resolution follows the standard CLI chain: `--repo` flag → git remote detection → config default

### TUI UI

The TUI wiki edit form is triggered by pressing `e` from the Wiki Detail screen.

**Entry points:**
- Press `e` from the wiki detail view
- Press `e` from the wiki list screen (on the focused row)
- Type `:edit wiki` in the command palette

**Edit Form Screen (full-screen overlay):**

```
┌─ Edit Wiki Page ───────────────────────────────┐
│ Title:  [Getting Started Guide            ]    │
│                                                 │
│ Slug:   [getting-started-guide            ]    │
│                                                 │
│ Body:                                           │
│ ┌─────────────────────────────────────────────┐ │
│ │ # Getting Started                           │ │
│ │                                             │ │
│ │ Welcome to the project wiki. This guide...  │ │
│ │                                             │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│          [ Save (Ctrl+S) ]  [ Cancel (Esc) ]    │
└─────────────────────────────────────────────────┘
```

| Field | Widget      | Validation                                    |
|-------|-------------|-----------------------------------------------|
| Title | Single-line | Required, non-empty after trim                |
| Slug  | Single-line | Optional (auto-updated from title if empty), alphanumeric + hyphens |
| Body  | Multi-line  | Optional, Markdown                            |

**Keyboard Controls:**
- `Tab` / `Shift+Tab` — navigate between fields
- `Ctrl+S` — submit the form
- `Esc` — cancel (with dirty-check confirmation if content has been modified)
- Inline validation error shown beneath the title field if empty on submit

**Success Behavior:** On successful update, the TUI navigates back to the wiki detail view for the page (at its potentially new slug) with a brief success toast/flash message.

**Error Behavior:** On conflict (409), an inline error appears: "A wiki page with this slug already exists." On permission or not-found errors, a modal alert is shown. On network errors, a red banner appears at the top of the form with a retry option (`R` key).

**Only modified fields sent:** The PATCH payload includes only fields the user actually changed from their original pre-populated values.

**Responsive breakpoints:**
- Small (80×24): Compact layout, smaller body editor area
- Medium (120×40): Full field labels, comfortable spacing
- Large (200×60+): Wide body editor, expanded vertical space

### Web UI Design

The web wiki page detail view at `/:owner/:repo/wiki/:slug` provides the following editing surfaces:

**Edit button:** An "Edit" button is visible to users with write access, hidden for read-only users and anonymous visitors. Clicking it transitions the page from view mode to edit mode.

**Edit mode (`/:owner/:repo/wiki/:slug/edit` or inline):**

- **Title field:** The title becomes an editable text input, pre-populated with the current title. Autofocus on entering edit mode. A live slug preview is shown beneath if the slug would change.
- **Body field:** The rendered Markdown body is replaced by a Markdown editor area with a preview toggle. The editor supports tab indentation and a basic Markdown toolbar (bold, italic, heading, link, code block, list).
- **Advanced section (collapsed by default):** Custom slug override input. When expanded, shows the current slug in an editable text input. Changing this field overrides the auto-generated slug preview.
- **Save button:** "Save Changes" button at the bottom right. Disabled while the title is empty.
- **Cancel link:** "Cancel" link that returns to the wiki page detail view. If unsaved changes exist, a confirmation dialog is shown.

**Validation UX:**
- Client-side: title field shows inline error "Title is required" if the user clears it.
- Server-side: on `409`, the form shows "A page with the slug 'some-slug' already exists. Choose a different title or provide a custom slug." without clearing the form.
- Server-side: on `403`, redirect to the wiki detail view with a flash notification "You do not have permission to edit wiki pages in this repository."
- Server-side: on `404`, redirect to the wiki list with a flash notification "Wiki page not found."

**After Save:** Navigate to `/:owner/:repo/wiki/:new-slug` (which may differ from the original slug if the slug was changed) to view the updated page.

**Optimistic updates:** Title and body update optimistically in the view mode and revert on error with an inline toast.

### Documentation

The following end-user documentation should be written:

1. **Editing a wiki page** — step-by-step instructions for web UI, CLI, and TUI. Covers title editing, body editing, slug changes, and the behavior when a slug conflict is encountered.
2. **CLI reference: `codeplane wiki edit`** — full flag reference, examples, and exit codes. Include examples for editing title only, body only, slug only, and multiple fields simultaneously.
3. **TUI keyboard shortcuts** — reference table for the wiki edit form (Tab, Shift+Tab, Ctrl+S, Esc, R for retry).
4. **API reference: `PATCH /api/repos/:owner/:repo/wiki/:slug`** — request/response schema, authentication, field semantics, slug normalization rules, error codes, and cURL examples.
5. **Wiki slug behavior** — explanation of the slugification algorithm, how slug changes affect page URLs, and conflict handling.

## Permissions & Security

### Authorization Matrix

| Role                              | Can Edit Wiki Page? | Notes                                    |
|-----------------------------------|---------------------|------------------------------------------|
| Repository Owner                  | ✅ Yes              | Full edit access                         |
| Organization Owner (on org repos) | ✅ Yes              | Full edit access to all org repos        |
| Team Member with `admin` perm     | ✅ Yes              |                                          |
| Team Member with `write` perm     | ✅ Yes              |                                          |
| Team Member with `read` perm      | ❌ No (403)         |                                          |
| Collaborator with `admin` perm    | ✅ Yes              |                                          |
| Collaborator with `write` perm    | ✅ Yes              |                                          |
| Collaborator with `read` perm     | ❌ No (403)         |                                          |
| Authenticated, no relationship    | ❌ No (403)         |                                          |
| Unauthenticated                   | ❌ No (401)         |                                          |

There is no page-author-only restriction — any user with write access can edit any wiki page in the repository.

### Rate Limiting

- **Per-user rate limit:** 60 wiki page edit requests per minute per user per repository.
- **Per-repository rate limit:** 200 wiki page edits per hour per repository (aggregate across all users).
- **Global payload size limit:** Request bodies exceeding 2 MB are rejected at the middleware layer before reaching the wiki route.
- Rate limit responses use `429 Too Many Requests` with `Retry-After` header.

### Data Privacy

- Wiki page content may contain sensitive information. The repository visibility model (public vs. private) governs read access. Private repository wiki pages are only accessible to authenticated users with at least read permission.
- The `author.id` and `author.login` fields are exposed in the response. These are considered public profile information, not PII.
- The API must never log full request bodies at INFO level — only at DEBUG, and only in non-production environments. Titles and body content may contain sensitive project information.
- Webhook payloads (when implemented) for wiki edits must respect repository visibility — private repository webhook events must only be delivered to configured webhook URLs.
- No user IP addresses, session tokens, or device fingerprints are stored in the wiki page record.

### Input Safety

- Title is trimmed of leading/trailing whitespace before storage. Body and slug are stored after normalization. The server does not perform HTML sanitization because clients handle escaping.
- Slugs are strictly normalized (lowercased, alphanumeric + hyphens only), which inherently prevents path traversal or injection via slug values.

## Telemetry & Product Analytics

### Business Events

| Event Name            | Trigger                                    | Properties                                                                                                                                         |
|-----------------------|--------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| `WikiPageEdited`      | Successful `200` response from edit        | `repository_id`, `repository_owner`, `repository_name`, `wiki_page_id`, `wiki_page_slug`, `actor_id`, `title_changed` (bool), `slug_changed` (bool), `body_changed` (bool), `old_slug` (if changed), `new_slug` (if changed), `body_length` (int), `client` (`api`/`cli`/`tui`/`web`), `timestamp` |
| `WikiPageEditFailed`  | Any error response from edit               | `repository_owner`, `repository_name`, `wiki_page_slug`, `error_code` (400/401/403/404/409/422), `client`, `timestamp`                            |
| `WikiPageEditFormOpened` | User opens the edit form (web/TUI)      | `repository_id`, `wiki_page_slug`, `actor_id`, `entry_point` (detail_view, list_row, command_palette), `client`                                   |
| `WikiPageEditFormAbandoned` | User cancels edit with unsaved changes | `repository_id`, `wiki_page_slug`, `actor_id`, `dirty_fields[]`, `client`                                                                        |

### Funnel Metrics

- **Edit rate:** Number of `WikiPageEdited` events per day/week, segmented by `client`.
- **Edit adoption:** Ratio of wiki pages that are ever edited vs. total created (indicates whether wiki pages are living documents or write-once artifacts).
- **Slug change rate:** Percentage of `WikiPageEdited` events where `slug_changed == true`. A high rate may indicate the auto-slugification algorithm is not meeting user expectations at creation time.
- **Conflict rate:** Ratio of `WikiPageEditFailed` with `error_code: 409` to total edit attempts. A high rate indicates users are struggling with slug collisions.
- **Edit completion rate:** Percentage of `WikiPageEditFormOpened` events that result in a successful `WikiPageEdited` event (measures form usability).
- **Edit abandonment rate:** Percentage of `WikiPageEditFormOpened` events that result in `WikiPageEditFormAbandoned` (measures friction).
- **Fields-per-edit distribution:** Histogram of how many fields are changed per edit (1, 2, 3). Indicates whether users batch changes or make incremental updates.
- **Client distribution:** Breakdown of edits by client surface (web, CLI, TUI, API) — measures adoption of each surface.

### Success Indicators

- Edit completion rate > 85% (form is not causing abandonment).
- p95 edit latency < 500ms (server-side).
- Conflict rate < 5% of edit attempts (slug collisions are rare and manageable).
- CLI and TUI account for > 15% of edits (multi-surface adoption).

## Observability

### Logging Requirements

| Log Point                             | Level   | Structured Context                                                                                          | Notes                                                |
|---------------------------------------|---------|-------------------------------------------------------------------------------------------------------------|------------------------------------------------------|
| Wiki page edit request received       | `debug` | `event: "wiki_page_edit_request"`, `owner`, `repo`, `slug`, `actor_id`, `fields_present[]`, `request_id`    | Never log body/title content at INFO+                |
| Wiki page edit succeeded              | `info`  | `event: "wiki_page_edited"`, `owner`, `repo`, `slug`, `new_slug` (if changed), `actor_id`, `fields_changed[]`, `duration_ms`, `request_id` | Core operational log                |
| Wiki page edit slug conflict          | `warn`  | `event: "wiki_page_slug_conflict"`, `owner`, `repo`, `old_slug`, `new_slug`, `actor_id`, `request_id`       | Indicates slug collision                             |
| Wiki page edit validation failed      | `warn`  | `event: "wiki_page_edit_validation_failed"`, `owner`, `repo`, `slug`, `field`, `code`, `actor_id`, `request_id` | Client bug or user error                        |
| Wiki page edit permission denied      | `warn`  | `event: "wiki_page_edit_permission_denied"`, `owner`, `repo`, `slug`, `user_id`, `request_id`               | Insufficient permissions                             |
| Wiki page edit unauthenticated        | `info`  | `event: "wiki_page_edit_unauthenticated"`, `owner`, `repo`, `slug`, `request_id`                            | Unauthenticated attempt                              |
| Wiki page edit not found              | `info`  | `event: "wiki_page_edit_not_found"`, `owner`, `repo`, `slug`, `request_id`                                  | Page does not exist                                  |
| Wiki page edit no fields provided     | `warn`  | `event: "wiki_page_edit_no_fields"`, `owner`, `repo`, `slug`, `actor_id`, `request_id`                      | Client sending empty edit                            |
| Wiki page edit internal error         | `error` | `event: "wiki_page_edit_internal_error"`, `owner`, `repo`, `slug`, `error_message`, `stack_trace`, `request_id` | DB failures, unexpected exceptions              |
| Malformed JSON body                   | `warn`  | `event: "wiki_page_edit_bad_request"`, `owner`, `repo`, `request_id`                                        | Invalid JSON                                         |

### Prometheus Metrics

| Metric                                            | Type      | Labels                                      | Description                                          |
|---------------------------------------------------|-----------|---------------------------------------------|------------------------------------------------------|
| `codeplane_wiki_page_edit_total`                  | Counter   | `owner`, `repo`, `status` (success, validation_error, auth_error, not_found, conflict, internal_error) | Total wiki page edit attempts           |
| `codeplane_wiki_page_edit_duration_seconds`       | Histogram | `owner`, `repo`                             | Latency of wiki page edit operations (buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5) |
| `codeplane_wiki_page_edit_fields_changed`         | Histogram | `owner`, `repo`                             | Number of fields changed per edit (buckets: 1, 2, 3) |
| `codeplane_wiki_page_slug_changes_total`          | Counter   | `owner`, `repo`                             | Total slug changes via wiki edit                     |
| `codeplane_wiki_page_edit_body_size_bytes`        | Histogram | —                                           | Distribution of wiki page body sizes at edit time    |
| `codeplane_wiki_page_edit_conflicts_total`        | Counter   | `owner`, `repo`                             | Total slug conflict errors during edit               |

### Alerts

#### Alert: High Wiki Edit Error Rate
- **Condition:** `rate(codeplane_wiki_page_edit_total{status="internal_error"}[5m]) > 0.5`
- **Severity:** Critical
- **Runbook:**
  1. Check server logs for `event: "wiki_page_edit_internal_error"` entries in the last 15 minutes.
  2. Identify if the errors correlate to a specific repository or are global (check `owner`, `repo` labels).
  3. Check database connectivity: run `SELECT 1` against the primary database. If the DB is down, escalate to database on-call.
  4. Check if the `wiki_pages` table is experiencing lock contention or if a migration is running.
  5. If the issue is database-related, check disk space and connection pool saturation.
  6. If a single repository is affected, check whether it has an unusually large number of wiki pages causing unique constraint scan slowdowns.
  7. Check recent deployments for regressions. If a deploy happened in the last 30 minutes, consider rolling back.
  8. Escalate to the database on-call if not resolved within 15 minutes.

#### Alert: Wiki Edit Latency Spike
- **Condition:** `histogram_quantile(0.95, rate(codeplane_wiki_page_edit_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning
- **Runbook:**
  1. Check if overall API latency is elevated (cross-reference with global latency metrics).
  2. Check database query latency for `UPDATE wiki_pages` and the repository lookup queries.
  3. Review active database connections and slow query logs.
  4. Check if a bulk import, migration, or `VACUUM` is running.
  5. If isolated to wiki edits, check for table bloat on `wiki_pages` and consider running `VACUUM ANALYZE`.
  6. If global, check server resource utilization (CPU, memory, event loop lag).

#### Alert: Elevated Slug Conflict Rate
- **Condition:** `rate(codeplane_wiki_page_edit_conflicts_total[1h]) / rate(codeplane_wiki_page_edit_total{status="success"}[1h]) > 0.15`
- **Severity:** Warning
- **Runbook:**
  1. This is likely a product UX issue, not an infrastructure issue.
  2. Check if a single user or automation is repeatedly attempting slug changes that conflict.
  3. Review if the slugification algorithm is producing unexpected collisions (e.g., stripping too many characters from different titles to the same slug).
  4. Check if users are trying to swap slugs between two pages (which requires a three-step rename).
  5. File a product issue if the conflict rate persists, recommending improved slug suggestion or deduplication UX.

#### Alert: Unusual Validation Error Spike
- **Condition:** `rate(codeplane_wiki_page_edit_total{status="validation_error"}[15m]) > 10 * avg_over_time(rate(codeplane_wiki_page_edit_total{status="validation_error"}[15m])[1d:])`
- **Severity:** Warning
- **Runbook:**
  1. Check if a specific client version or user agent is responsible (may indicate a broken client release).
  2. Query logs for the specific validation `field` — is it title, slug, or body?
  3. If it's slug validation, check if users are providing slugs with only special characters.
  4. If correlated with a client release, file a bug against the relevant client (web/CLI/TUI).
  5. If a single user, consider whether it's an automation or bot misconfiguration.

### Error Cases and Failure Modes

| Error Case                        | HTTP Status | Expected Behavior                                          | Recovery                                  |
|-----------------------------------|-------------|------------------------------------------------------------|-------------------------------------------|
| Malformed JSON body               | 400         | Request rejected with `"invalid request body"`             | Fix request payload                       |
| No update fields provided         | 400         | `"at least one field must be provided"`                    | Include at least one of title/slug/body   |
| Missing authentication            | 401         | `"authentication required"`                                | Re-authenticate                           |
| Expired token                     | 401         | Auth middleware rejects                                    | Re-authenticate                           |
| Insufficient permissions          | 403         | `"permission denied"`                                      | Request collaborator write access         |
| Repository not found              | 404         | `"repository not found"`                                   | Verify owner/repo spelling                |
| Wiki page not found               | 404         | `"wiki page not found"`                                    | Verify slug is correct                    |
| Slug conflict with existing page  | 409         | `"wiki page already exists"`                               | Choose a different slug                   |
| Empty title after trim            | 422         | Validation error on `title` field                          | Provide non-empty title                   |
| Empty slug after normalization    | 422         | Validation error on `slug` field                           | Provide slug with alphanumeric characters |
| Title exceeds 255 chars           | 422         | Validation error on `title` field                          | Shorten title                             |
| Slug exceeds 255 chars            | 422         | Validation error on `slug` field                           | Shorten slug                              |
| Body exceeds 1,000,000 chars      | 400         | Body size validation error                                 | Reduce body content                       |
| Payload exceeds 2 MB              | 400/413     | Rejected at middleware                                     | Reduce payload size                       |
| Rate limit exceeded               | 429         | `Retry-After` header included                              | Wait and retry                            |
| Database connection lost          | 500         | Internal error returned; logged as `error`                 | Automatic reconnection via pool           |
| Database unique constraint error  | 409         | Mapped to `"wiki page already exists"`                     | Choose different slug                     |
| Author user record deleted        | 500         | Should not occur (FK constraint); if orphaned, 500 error   | Investigate data integrity                |
| Repository deleted mid-request    | 404         | Race condition is benign                                   | User retries on existing repo             |
| Invalid UTF-8 in body             | 400         | JSON parse failure                                         | Fix input encoding                        |

## Verification

### API Integration Tests

1. **Edit title only** — PATCH with `{ "title": "New Title" }` → 200, title changed, slug and body unchanged.
2. **Edit body only** — PATCH with `{ "body": "New body content" }` → 200, body changed, title and slug unchanged.
3. **Edit slug only** — PATCH with `{ "slug": "new-slug" }` → 200, slug changed, title and body unchanged.
4. **Edit title and body** — PATCH with `{ "title": "X", "body": "Y" }` → 200, both updated.
5. **Edit title and slug** — PATCH with `{ "title": "X", "slug": "x" }` → 200, both updated.
6. **Edit all three fields** — PATCH with `{ "title": "X", "slug": "x", "body": "Y" }` → 200, all updated.
7. **Empty body clears content** — PATCH with `{ "body": "" }` → 200, body is empty string.
8. **Slug change updates URL** — PATCH to change slug from `"old"` to `"new"`, then GET `/:owner/:repo/wiki/new` returns 200 and GET `/:owner/:repo/wiki/old` returns 404.
9. **No-op slug change** — PATCH with `{ "slug": "<current-slug>" }` → 200, no conflict.
10. **Duplicate slug returns 409** — Create page A with slug `"home"`, create page B with slug `"about"`, PATCH page B with `{ "slug": "home" }` → 409.
11. **Duplicate slug from title normalization returns 409** — Create page A with slug `"home"`, PATCH page B with title that slugifies to `"home"` → 409 (when slug is auto-derived from title, if applicable).
12. **Slug uniqueness scoped to repo** — Create page with slug `"home"` in repo A, edit a page in repo B to slug `"home"` → 200 (no conflict).
13. **Empty JSON body returns 400** — PATCH with `{}` → 400 with `"at least one field must be provided"`.
14. **Missing title (not provided) leaves title unchanged** — PATCH with `{ "body": "new" }` → 200, original title preserved.
15. **Empty title returns 422** — PATCH with `{ "title": "" }` → 422 validation error.
16. **Whitespace-only title returns 422** — PATCH with `{ "title": "   " }` → 422 validation error.
17. **Title at maximum valid length (255 chars)** — PATCH with a 255-character title → 200, title saved correctly.
18. **Title exceeding maximum length (256 chars)** — PATCH with a 256-character title → 422 validation error.
19. **Slug at maximum valid length (255 chars)** — PATCH with a 255-character alphanumeric slug → 200.
20. **Slug exceeding maximum length (256 chars)** — PATCH with a 256-character slug → 422.
21. **Body at maximum valid length (1,000,000 chars)** — PATCH with a 1,000,000-character body → 200, body saved correctly.
22. **Body exceeding maximum length (1,000,001 chars)** — PATCH with body exceeding 1,000,000 chars → 400.
23. **Invalid slug (all special chars) returns 422** — PATCH with `{ "slug": "!!!" }` → 422 (empty after normalization).
24. **Slug with Unicode characters** — PATCH with `{ "slug": "日本語" }` → 422 (all stripped, empty result).
25. **Slug normalization applied** — PATCH with `{ "slug": "My New Slug!!" }` → 200, slug stored as `"my-new-slug"`.
26. **Title with Unicode/emoji** — PATCH with `{ "title": "🔧 Fix für Büg" }` → 200, title preserved exactly.
27. **Body with markdown code fences** — PATCH with body containing triple backtick code blocks → 200, body preserved verbatim.
28. **Body with HTML content** — PATCH with body containing `<script>`, `<div>`, `<img>` tags → 200, body stored as-is.
29. **Title with HTML entities** — PATCH with `{ "title": "<script>alert('xss')</script>" }` → 200, title stored as-is.
30. **Author updated to editing user** — User A creates page, user B edits page → `author.login` is user B.
31. **updated_at refreshed** — Record original `updated_at`, edit page, assert new `updated_at` is strictly newer.
32. **created_at unchanged** — Edit page, assert `created_at` remains the same as before edit.
33. **Edited page appears in list** — Edit a page's title, GET list → page appears with new title.
34. **Concurrent edits to different fields** — Two simultaneous PATCHes (one title, one body) → both succeed, final state has both changes (last write wins if overlapping).
35. **Concurrent slug change to same value** — Two simultaneous PATCHes both changing slug to `"same-slug"` → exactly one succeeds (200), the other fails (409).
36. **Idempotent re-edit** — PATCH same title twice → both return 200, title unchanged after second.
37. **Unknown fields ignored** — PATCH with `{ "title": "X", "unknown_field": "Y" }` → 200, unknown field ignored.
38. **Read-only fields ignored** — PATCH with `{ "id": "fake-id", "created_at": "2000-01-01", "title": "X" }` → 200, `id` and `created_at` unchanged.
39. **Response shape validation** — Verify response contains: `id`, `slug`, `title`, `body`, `author` (with `id` and `login`), `created_at`, `updated_at`.
40. **Malformed JSON body** — PATCH with `"not json"` → 400.
41. **Missing Content-Type** — Send PATCH without JSON content type → rejection.

### API Authorization Tests

42. **Unauthenticated request returns 401** — PATCH without auth → 401.
43. **Invalid token returns 401** — PATCH with invalid PAT → 401.
44. **Read-only collaborator returns 403** — PATCH from a read-only collaborator → 403.
45. **Non-collaborator on private repo returns 403** — PATCH from a user with no relationship → 403.
46. **Write collaborator returns 200** — PATCH from a write collaborator → 200.
47. **Admin collaborator returns 200** — PATCH from an admin collaborator → 200.
48. **Repository owner returns 200** — PATCH from the repo owner → 200.
49. **Organization owner returns 200** — PATCH from an org owner on an org-owned repo → 200.
50. **Team member with write perm returns 200** — PATCH from a team member with write permission → 200.
51. **Team member with read perm returns 403** — PATCH from a team member with read-only permission → 403.
52. **Non-existent repository returns 404** — PATCH to `nonexistent-owner/nonexistent-repo/wiki/slug` → 404.
53. **Non-existent wiki page returns 404** — PATCH to a valid repo with a slug that does not exist → 404.
54. **Non-existent owner returns 404** — PATCH to `nonexistent/repo/wiki/slug` → 404.

### CLI E2E Tests

55. **CLI edit title** — `codeplane wiki edit <slug> --title "New Title" --repo OWNER/REPO` → exit code 0, output contains `Updated wiki page New Title`.
56. **CLI edit title JSON** — `codeplane wiki edit <slug> --title "New Title" --repo OWNER/REPO --json` → exit code 0, valid JSON with updated title.
57. **CLI edit body** — `codeplane wiki edit <slug> --body "New body" --repo OWNER/REPO --json` → JSON output with updated body.
58. **CLI edit slug** — `codeplane wiki edit <slug> --slug "new-slug" --repo OWNER/REPO --json` → JSON output with `slug: "new-slug"`.
59. **CLI edit multiple flags** — `codeplane wiki edit <slug> --title "X" --body "Y" --repo OWNER/REPO --json` → both fields updated.
60. **CLI edit no flags** — `codeplane wiki edit <slug> --repo OWNER/REPO` with no field flags → non-zero exit code, error message about requiring at least one field.
61. **CLI edit nonexistent page** — `codeplane wiki edit nonexistent-slug --title "X" --repo OWNER/REPO` → non-zero exit code, error about page not found.
62. **CLI edit nonexistent repo** — `codeplane wiki edit <slug> --title "X" --repo nonexistent/repo` → non-zero exit code, error about repository not found.
63. **CLI edit without auth** — Run without valid credentials → auth error message, non-zero exit code.
64. **CLI edit then verify via view** — Edit title, then `codeplane wiki view <slug> --json` → response shows new title.
65. **CLI edit slug then verify via view** — Edit slug to `"new-slug"`, then `codeplane wiki view new-slug --json` → 200; `codeplane wiki view <old-slug>` → error.
66. **CLI edit with empty body** — `codeplane wiki edit <slug> --body "" --repo OWNER/REPO --json` → success, body is empty.
67. **CLI edit conflict** — Create two pages, edit one to use the other's slug → non-zero exit code, conflict error.
68. **CLI edit with maximum title length (255 chars)** — `--title` with 255-character string → success.
69. **CLI human-friendly output** — `codeplane wiki edit <slug> --title "X" --repo OWNER/REPO` (no `--json`) → output contains "Updated" and the page title.

### Playwright (Web UI) E2E Tests

70. **Edit button visible for write-access user** — Navigate to wiki detail as write user → "Edit" button visible.
71. **Edit button hidden for read-only user** — Navigate as read-only user → no "Edit" button.
72. **Edit button hidden for anonymous** — Navigate unauthenticated → no "Edit" button.
73. **Click Edit enters edit mode** — Click "Edit" → title becomes editable input, body becomes textarea/editor, Save/Cancel buttons appear.
74. **Edit title and save** — Modify title, click Save → page reloads with new title.
75. **Edit body and save** — Modify body, click Save → page shows updated Markdown content.
76. **Edit slug via advanced section** — Expand advanced, change slug, save → URL redirects to new slug.
77. **Cancel without changes** — Click Edit, then Cancel → returns to view mode, no confirmation dialog.
78. **Cancel with unsaved changes** — Click Edit, modify title, click Cancel → confirmation dialog appears.
79. **Confirm discard** — In confirmation dialog, click Discard → returns to view mode with original content.
80. **Abort discard** — In confirmation dialog, click Cancel → returns to edit mode with changes preserved.
81. **Empty title shows validation error** — Clear title field, click Save → inline error "Title is required" shown, save blocked.
82. **Slug conflict shows error** — Edit slug to one that exists → form shows conflict error message, form not cleared.
83. **Permission error redirects** — Simulate 403 response → user redirected with flash notification.
84. **Keyboard save** — Press `Ctrl+Enter` (or equivalent keyboard shortcut) in edit mode → page saved.
85. **Markdown toolbar works** — Use bold/italic/heading buttons → Markdown formatting inserted in body.
86. **Slug preview updates** — In advanced section, type in slug field → preview shows normalized slug.

### TUI E2E Tests

87. **TUI edit form opens from detail** — Navigate to wiki detail, press `e` → edit form opens with pre-populated fields.
88. **TUI edit form opens from list** — Focus page in wiki list, press `e` → edit form opens with pre-populated fields.
89. **TUI edit title and save** — Modify title, press `Ctrl+S` → form closes, detail view shows new title.
90. **TUI edit body and save** — Modify body, press `Ctrl+S` → form closes, detail view shows new body.
91. **TUI edit slug and save** — Modify slug field, press `Ctrl+S` → form closes, navigates to detail at new slug.
92. **TUI edit cancel without changes** — Open form, press `Esc` immediately → form closes, no confirmation.
93. **TUI edit cancel with changes** — Modify title, press `Esc` → confirmation dialog appears.
94. **TUI confirm discard** — In confirmation dialog, press `y` → form closes without saving.
95. **TUI abort discard** — In confirmation dialog, press `n` → returns to form with changes preserved.
96. **TUI edit shows loading state** — Submit edit → "Saving…" appears on save button.
97. **TUI edit shows error inline** — Trigger validation error (empty title) → red banner appears at top of form.
98. **TUI edit shows conflict error** — Change slug to conflicting value → inline error about existing page.
99. **TUI edit field navigation** — Tab moves focus: Title → Slug → Body → Save. Shift+Tab reverses.
100. **TUI only sends modified fields** — Modify title only, save → PATCH payload contains only `title` field.
101. **TUI edit retry on network error** — Simulate network failure on save → error banner shown, press `R` → retry attempt.
