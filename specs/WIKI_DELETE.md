# WIKI_DELETE

Specification for WIKI_DELETE.

## High-Level User POV

Wiki page deletion is a permanent, irreversible operation available across all Codeplane client surfaces (API, CLI, TUI, Web UI). When a user with write access to a repository deletes a wiki page, the page and all its content are permanently removed — there is no soft-delete or trash/recycle bin. The operation is scoped to a single page identified by its slug. In the Web UI, users click a delete button on the wiki page detail view and confirm via a modal dialog. In the CLI, users run `codeplane wiki delete <slug>` with a `--yes` flag to skip confirmation or respond to an interactive prompt. In the TUI, users select a page and press a delete keybinding with a confirmation step. The API accepts `DELETE /api/repos/:owner/:repo/wiki/:slug` and returns 204 No Content on success. Slugs are normalized (trimmed, lowercased, whitespace-collapsed to hyphens) before lookup. If the page does not exist, a 404 is returned. If the user lacks write access, a 403 is returned. After deletion, the wiki page list updates immediately across all connected clients via cache invalidation. The wiki sidebar page tree reflects the removal without requiring a full page reload.

## Acceptance Criteria

Definition of Done:
- [ ] `DELETE /api/repos/:owner/:repo/wiki/:slug` returns 204 on successful deletion
- [ ] Deleted page is no longer returned by wiki list or wiki get endpoints
- [ ] Deletion is permanent with no soft-delete or undo capability
- [ ] CLI `codeplane wiki delete <slug>` works with interactive confirmation and `--yes` flag
- [ ] TUI wiki screen supports delete action with confirmation
- [ ] Web UI wiki page detail view has delete button with confirmation modal
- [ ] Wiki search results no longer include deleted pages after deletion
- [ ] Webhook `wiki.deleted` event fires on successful deletion
- [ ] Notification is created for repository watchers on page deletion
- [ ] Audit log entry is created for the deletion

Input Validation:
- [ ] Slug is trimmed of leading/trailing whitespace before lookup
- [ ] Slug is normalized to lowercase
- [ ] Internal whitespace in slug is collapsed to single hyphens
- [ ] Empty or whitespace-only slug returns 400 Bad Request
- [ ] Slug containing only special characters returns 400 or 404
- [ ] Slugs up to 255 characters are accepted
- [ ] Slugs exceeding 255 characters return 400
- [ ] Slug lookup is case-insensitive (deleting 'My-Page' also matches 'my-page')

Boundary Constraints:
- [ ] Maximum slug length: 255 characters
- [ ] Slug must contain at least one alphanumeric character after normalization
- [ ] Only repository-scoped — no cross-repo side effects

Edge Cases:
- [ ] Double-delete of same slug returns 404 on second attempt
- [ ] Concurrent deletion of same page by two users — one succeeds (204), one gets 404
- [ ] Deleting the last wiki page in a repository succeeds and leaves wiki empty
- [ ] Deleting a page with unicode slug works correctly after normalization
- [ ] Deleting a page while another user is editing it — delete wins, edit save returns 404
- [ ] Cross-repo isolation: deleting `my-page` in repo A does not affect `my-page` in repo B
- [ ] Deleting a page that was just created (within same second) succeeds
- [ ] Deleting a page with maximum-length content succeeds
- [ ] Deleting a page referenced by other pages (wiki internal links) succeeds — dangling links are caller's responsibility
- [ ] Repository transfer after deletion — deleted pages do not reappear
- [ ] Forked repository wiki deletion is independent of upstream
- [ ] Rate limit: 61st deletion in an hour by same user returns 429
- [ ] Deleting wiki page on archived repository returns 403

## Design

API Shape:
- Endpoint: `DELETE /api/repos/:owner/:repo/wiki/:slug`
- Auth: session cookie, PAT, or OAuth2 token
- Path params: `owner` (string, repo owner), `repo` (string, repo name), `slug` (string, wiki page slug)
- Request body: none
- Success response: 204 No Content (empty body)
- Error responses: 400 (invalid slug), 401 (unauthenticated), 403 (insufficient permissions or archived repo), 404 (page not found), 429 (rate limited)

SDK Method:
```typescript
// packages/sdk/src/services/wiki.ts
async deleteWikiPage(repoId: string, slug: string): Promise<void>
```
Behavior: normalizes slug, looks up page by normalized slug + repoId, deletes row from wiki_pages table, emits `wiki.deleted` webhook event, creates notification for watchers, writes audit log entry. Throws `NotFoundError` if page doesn't exist, `ForbiddenError` if repo is archived.

Server Route Handler:
```typescript
// apps/server/src/routes/wiki.ts
app.delete('/:owner/:repo/wiki/:slug', requireAuth, requireRepoWrite, async (c) => {
  const { owner, repo, slug } = c.req.param()
  const repoEntity = await resolveRepo(c, owner, repo)
  await wikiService.deleteWikiPage(repoEntity.id, slug)
  return c.body(null, 204)
})
```

CLI Command:
```typescript
// apps/cli/src/commands/wiki/delete.ts
// Usage: codeplane wiki delete <slug> [-R owner/repo] [--yes]
// Resolves repo from -R flag or cwd jj/git context
// Prompts for confirmation unless --yes is passed
// On success: prints 'Wiki page <slug> deleted' to stderr
// On 404: prints 'Wiki page not found: <slug>' and exits 1
```

TUI Integration:
- Wiki list screen shows delete action via keybinding (d or Delete key)
- Confirmation dialog appears before executing deletion
- On success, page is removed from the list and focus moves to adjacent item
- On error, inline error message is displayed

Web UI Integration:
- Wiki page detail view includes a 'Delete' button (red, positioned in page actions area)
- Clicking triggers a confirmation modal: 'Are you sure you want to permanently delete "<title>"? This cannot be undone.'
- Modal has 'Cancel' and 'Delete' buttons, with Delete requiring explicit click
- On success: navigates to wiki index, shows toast notification
- On error: shows error toast with message from API

Database Operations:
- Single DELETE FROM wiki_pages WHERE repo_id = $1 AND normalized_slug = $2
- No cascade needed (wiki pages are leaf entities)
- No soft-delete column — row is physically removed

Cache Invalidation:
- Wiki page list cache for the repository is invalidated
- Wiki page detail cache for the specific slug is invalidated
- Wiki search index entry is removed

## Permissions & Security

Authorization Matrix:
| Role | Can Delete Wiki Page | HTTP Status if Denied |
|------|---------------------|----------------------|
| Repository Owner | ✅ Yes | — |
| Organization Admin | ✅ Yes | — |
| Write collaborator | ✅ Yes | — |
| Read collaborator | ❌ No | 403 Forbidden |
| Anonymous / unauthenticated | ❌ No | 401 Unauthorized |
| Blocked user | ❌ No | 403 Forbidden |

Permission Resolution Order:
1. Check authentication — return 401 if no valid session/token
2. Check user is not blocked from repository — return 403 if blocked
3. Resolve repository — return 404 if repo not found (do not leak existence)
4. Check repository is not archived — return 403 with message 'Cannot modify archived repository'
5. Check user has write access (owner, org admin, or write collaborator) — return 403 if insufficient
6. Proceed with deletion

Deploy Keys: Deploy keys with write access CAN delete wiki pages via API.
OAuth2 Apps: OAuth2 tokens with `repo:write` scope CAN delete wiki pages.
PATs: PATs with `repo` or `repo:write` scope CAN delete wiki pages.

Rate Limiting:
- Per-user: 60 wiki deletions per hour per user
- Per-repo: 200 wiki deletions per hour per repository
- Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Exceeded: 429 Too Many Requests with `Retry-After` header

Data Privacy:
- Deleted wiki content is permanently removed from the database
- No tombstone records are kept for the content itself
- Audit log retains metadata (who deleted, when, which slug) but not page content
- Webhook payload includes page slug and metadata but not full page content

## Telemetry & Product Analytics

Business Events:

1. `WikiPageDeleted`
   - Fired: on successful 204 response
   - Properties: `repoId`, `repoOwner`, `repoName`, `slug`, `userId`, `deletedAt` (ISO 8601), `pageAgeSeconds` (time since page creation), `clientType` (api|cli|tui|web), `pageContentLengthBytes` (content size at deletion)

2. `WikiPageDeleteFailed`
   - Fired: on any non-2xx response
   - Properties: `repoId`, `repoOwner`, `repoName`, `slug`, `userId`, `errorCode` (400|401|403|404|429|500), `errorMessage`, `clientType`

3. `WikiPageDeleteCancelled`
   - Fired: when user cancels confirmation dialog (web/TUI) or declines CLI prompt
   - Properties: `repoId`, `repoOwner`, `repoName`, `slug`, `userId`, `clientType`, `cancelSource` (modal|prompt|keybinding)

Funnel Metrics:
- `wiki.delete.initiated` — user clicked delete / ran command (before confirmation)
- `wiki.delete.confirmed` — user confirmed deletion
- `wiki.delete.cancelled` — user cancelled at confirmation step
- `wiki.delete.succeeded` — API returned 204
- `wiki.delete.failed` — API returned non-2xx
- `wiki.delete_to_create_ratio` — ratio of deletions to creations per repo per week
- `wiki.page_age_at_deletion_p50` — median page age at deletion (seconds)
- `wiki.page_age_at_deletion_p99` — 99th percentile page age at deletion
- `wiki.pages_remaining_after_delete` — count of remaining wiki pages in repo after deletion

## Observability

Structured Log Points:

1. `wiki.delete.request_received` (level: INFO) — slug, repoId, userId, clientIP
2. `wiki.delete.slug_normalized` (level: DEBUG) — originalSlug, normalizedSlug
3. `wiki.delete.permission_checked` (level: DEBUG) — userId, repoId, accessLevel, allowed
4. `wiki.delete.page_found` (level: DEBUG) — pageId, slug, repoId
5. `wiki.delete.page_not_found` (level: WARN) — slug, repoId, userId
6. `wiki.delete.completed` (level: INFO) — pageId, slug, repoId, userId, durationMs
7. `wiki.delete.error` (level: ERROR) — slug, repoId, userId, errorCode, errorMessage, stack

Prometheus Metrics:

1. `codeplane_wiki_delete_total` (counter) — labels: `repo_id`, `status` (success|not_found|forbidden|error)
2. `codeplane_wiki_delete_duration_seconds` (histogram) — labels: `repo_id` — buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0
3. `codeplane_wiki_delete_errors_total` (counter) — labels: `repo_id`, `error_code` (400|403|404|429|500)
4. `codeplane_wiki_pages_total` (gauge) — labels: `repo_id` — decremented on delete, tracks current page count

Alerts:

1. **WikiDeleteHighErrorRate**
   - Condition: `rate(codeplane_wiki_delete_errors_total{error_code=~"5.."}[5m]) / rate(codeplane_wiki_delete_total[5m]) > 0.05`
   - Severity: warning
   - Runbook: Check database connectivity and wiki_pages table health. Verify no schema migration is running. Check disk space on database volume. Review recent deployments for regressions in wiki service.

2. **WikiDeleteLatencySpike**
   - Condition: `histogram_quantile(0.99, rate(codeplane_wiki_delete_duration_seconds_bucket[5m])) > 2.0`
   - Severity: warning
   - Runbook: Check database query latency. Look for table lock contention on wiki_pages. Verify index on (repo_id, normalized_slug) exists and is not bloated. Check for long-running transactions blocking deletes.

3. **WikiBulkDeleteSpike**
   - Condition: `rate(codeplane_wiki_delete_total{status="success"}[5m]) > 10`
   - Severity: info
   - Runbook: May indicate automated cleanup or abuse. Check which userId is responsible. Review rate limit effectiveness. Consider if a bulk-delete API should be offered instead.

4. **WikiDeleteHigh404Rate**
   - Condition: `rate(codeplane_wiki_delete_errors_total{error_code="404"}[10m]) / rate(codeplane_wiki_delete_total[10m]) > 0.5`
   - Severity: info
   - Runbook: High 404 rate may indicate stale UI state, race conditions in concurrent editing, or a client bug sending incorrect slugs. Check client versions and review slug normalization logic.

Error Cases & Failure Modes:
1. Database connection failure → 500, logged at ERROR, retryable by client
2. Database timeout → 500, logged at ERROR with duration, check connection pool
3. Slug normalization produces empty string → 400 returned before DB hit
4. Row not found after authorization passed → 404 (race with concurrent delete)
5. Transaction deadlock → retry internally once, then 500 if still failing
6. Webhook delivery failure after successful delete → logged at WARN, does not rollback deletion
7. Notification creation failure after successful delete → logged at WARN, does not rollback deletion
8. Audit log write failure after successful delete → logged at ERROR, does not rollback deletion
9. Rate limit exceeded → 429 with Retry-After header, logged at INFO
10. Repository resolution failure (owner/repo not found) → 404, logged at DEBUG

## Verification

API Integration Tests (34 tests):

Happy Path:
- DELETE /api/repos/:owner/:repo/wiki/:slug returns 204 for existing page with write access
- Deleted page is not returned by GET /api/repos/:owner/:repo/wiki/:slug (404)
- Deleted page is not included in GET /api/repos/:owner/:repo/wiki list
- Deleted page is not included in wiki search results
- Webhook `wiki.deleted` event is fired with correct payload
- Notification is created for repository watchers
- Audit log entry is created with correct metadata

Slug Normalization:
- DELETE with uppercase slug deletes the matching lowercase page (case-insensitive)
- DELETE with trailing/leading whitespace in slug finds the correct page
- DELETE with internal spaces normalized to hyphens finds the correct page
- DELETE with slug 'my--page' normalizes and finds 'my-page' if that's the stored form
- DELETE with URL-encoded slug characters works correctly

Error Cases:
- DELETE without authentication returns 401
- DELETE with read-only access returns 403
- DELETE on non-existent page returns 404
- DELETE on non-existent repository returns 404
- DELETE with empty slug returns 400
- DELETE with whitespace-only slug returns 400
- DELETE on archived repository returns 403
- DELETE when rate limited returns 429 with Retry-After header
- Double DELETE of same slug — first returns 204, second returns 404

Concurrency:
- Two concurrent DELETE requests for same slug — one gets 204, other gets 404
- DELETE concurrent with GET — GET before delete returns 200, GET after returns 404
- DELETE concurrent with PUT (edit) — delete wins, subsequent edit returns 404

Boundary Tests:
- DELETE with 255-character slug succeeds
- DELETE with 256-character slug returns 400
- DELETE with unicode slug succeeds after normalization
- DELETE with slug containing only hyphens returns 400
- DELETE with slug containing path traversal characters (../) is rejected or normalized safely

Cross-Repo Isolation:
- Deleting page 'test' in repo A does not affect page 'test' in repo B
- Deleting page as org admin works across org repos
- Deploy key with write access can delete wiki page
- OAuth2 token with repo:write scope can delete wiki page
- PAT with repo scope can delete wiki page

CLI E2E Tests (8 tests):
- `codeplane wiki delete my-page --yes -R owner/repo` succeeds with exit 0 and prints confirmation
- `codeplane wiki delete my-page -R owner/repo` prompts for confirmation, answering 'y' deletes
- `codeplane wiki delete my-page -R owner/repo` prompts for confirmation, answering 'n' cancels with exit 0
- `codeplane wiki delete nonexistent --yes -R owner/repo` exits 1 with 'not found' message
- `codeplane wiki delete my-page --yes` resolves repo from cwd jj context
- `codeplane wiki delete my-page --yes -R owner/repo --json` outputs JSON result
- `codeplane wiki delete '' --yes -R owner/repo` exits 1 with validation error
- `codeplane wiki delete my-page --yes -R owner/repo` without auth exits 1 with auth error

Playwright Web UI E2E Tests (10 tests):
- Navigate to wiki page detail → click Delete → confirm modal → page is deleted and user is redirected to wiki index
- Navigate to wiki page detail → click Delete → cancel modal → page is not deleted
- Delete button is not visible for users with read-only access
- Delete button is not visible for unauthenticated users
- After deletion, wiki sidebar no longer shows the deleted page
- After deletion, toast notification confirms deletion
- Deleting last wiki page shows empty state on wiki index
- Delete modal shows correct page title in confirmation message
- Network error during delete shows error toast and page remains
- Delete with slow network shows loading state on confirm button

TUI E2E Tests (13 tests):
- Wiki list screen → select page → press delete key → confirm → page removed from list
- Wiki list screen → select page → press delete key → cancel → page remains
- After deletion, focus moves to next page in list (or previous if last)
- After deleting last page, empty state is shown
- Error on delete shows inline error message
- 404 error (already deleted) shows 'page not found' message
- 403 error shows 'permission denied' message
- Wiki list screen refreshes correctly after deletion
- Delete confirmation dialog shows page title
- Delete action is not available in read-only mode
- Keyboard shortcut for delete works from wiki list
- Keyboard shortcut for delete works from wiki detail
- Multiple rapid delete attempts on same page — first succeeds, subsequent show error
