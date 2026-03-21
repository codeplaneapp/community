# MILESTONE_DELETE

Specification for MILESTONE_DELETE.

## High-Level User POV

A repository owner or collaborator navigates to a milestone's detail page or uses the CLI/API and chooses to delete a milestone. The system asks for confirmation, then permanently removes the milestone. All issues previously associated with that milestone retain their other metadata but lose their milestone association. The milestone no longer appears in milestone lists, filters, or issue sidebar selectors. The user sees a success confirmation and is redirected to the milestones list view.

## Acceptance Criteria

1. DELETE /api/v1/repos/:owner/:repo/milestones/:id returns 204 on success.
2. Only users with repository write (maintainer/admin/owner) permission can delete a milestone.
3. Deleting a milestone disassociates all linked issues (sets milestone_id to NULL) without deleting the issues themselves.
4. After deletion, the milestone no longer appears in list, detail, or search results.
5. A 404 is returned if the milestone does not exist or the repository is inaccessible.
6. A 403 is returned if the authenticated user lacks sufficient permissions.
7. Web UI shows a confirmation dialog before dispatching the delete request.
8. CLI `codeplane milestone delete <id> --repo owner/repo` prompts for confirmation unless `--yes` is passed.
9. TUI milestone detail view supports a delete action with confirmation.
10. A webhook event `milestone.deleted` is emitted with the deleted milestone's metadata.
11. Notification is sent to repository watchers about the milestone deletion.
12. The operation is idempotent — deleting an already-deleted milestone returns 404, not 500.

## Design

### API Layer
- **Route**: `DELETE /api/v1/repos/:owner/:repo/milestones/:id`
- **Handler** (`apps/server/src/routes/milestones.ts`): Validates repo ownership, authenticates user, delegates to `milestoneService.delete(repoId, milestoneId)`.
- **Response**: 204 No Content on success. Error payloads: `{ error: string, code: string }` for 403/404.

### Service Layer
- **`packages/sdk/src/services/milestone.ts` — `delete(repoId, milestoneId)`**:
  1. Fetch milestone by ID scoped to repoId; throw 404 if not found.
  2. In a transaction: (a) UPDATE issues SET milestone_id = NULL WHERE milestone_id = :milestoneId; (b) DELETE FROM milestones WHERE id = :milestoneId AND repo_id = :repoId.
  3. Emit `milestone.deleted` event via the SSE manager / webhook service.
  4. Return void.

### Database
- No schema changes required. The milestones table already exists. Issue rows reference milestones via a nullable foreign key. The transaction ensures atomicity of disassociation + deletion.

### Web UI (`apps/ui`)
- Milestone detail page adds a "Delete milestone" button (destructive style, red).
- On click, a confirmation dialog appears: "Delete milestone '{title}'? {n} issues will be disassociated."
- On confirm, calls API, invalidates milestone list cache, navigates to `/:owner/:repo/milestones`.
- Toast: "Milestone deleted successfully."

### CLI (`apps/cli`)
- Command: `milestone delete <milestone-id> --repo <owner/repo> [--yes]`
- Without `--yes`, prompts: "Are you sure you want to delete milestone #{id}? (y/N)"
- On success: prints "Milestone #{id} deleted."
- Supports `--json` for structured output.

### TUI (`apps/tui`)
- Milestone detail screen adds a `d` keybinding for delete with inline confirmation.
- On success, navigates back to the milestones list screen.

### Webhook / Event
- Trigger type: `milestone` with action `deleted`.
- Payload includes: `{ action: 'deleted', milestone: { id, title, description, due_date, open_issues, closed_issues }, repository: { id, owner, name }, sender: { id, username } }`.

### Editor Integrations
- No specific milestone delete UI in VS Code or Neovim extensions currently. API-level access is available via the SDK.

## Permissions & Security

### Authorization Rules
- **Required role**: Repository Write permission (maintainer, admin, or owner).
- **Auth methods accepted**: Session cookie, PAT (`Authorization: token <pat>`), OAuth2 token.
- **Repository visibility**: Private repo milestones require authenticated access; public repo milestones still require write permission to delete.
- **Organization context**: If the repo belongs to an org, the user must have write access through org membership, team assignment, or direct collaborator grant.
- **Deploy keys**: Deploy keys with write access MAY delete milestones (consistent with other write operations); read-only deploy keys MUST NOT.

### Security Considerations
- Rate limiting applies (shared mutation rate limit tier).
- CSRF protection via SameSite cookie + origin checking for web UI requests.
- The confirmation dialog in web/CLI/TUI is a UX safeguard, not a security boundary — the API itself is the enforcement point.
- Audit log entry is created: `{ action: 'milestone.delete', actor_id, repo_id, milestone_id, timestamp }`.
- No sensitive data is leaked in error responses (404 for both 'not found' and 'no access to repo' to prevent enumeration).

## Telemetry & Product Analytics

### Product Analytics Events
1. **`milestone.deleted`** — Fired on successful deletion.
   - Properties: `repo_id`, `milestone_id`, `disassociated_issue_count`, `client` (web|cli|tui|api), `time_since_milestone_created_days`.
2. **`milestone.delete_confirmed`** — Fired when user confirms the deletion dialog (web/TUI only).
   - Properties: `repo_id`, `milestone_id`, `client`.
3. **`milestone.delete_cancelled`** — Fired when user cancels the confirmation dialog.
   - Properties: `repo_id`, `milestone_id`, `client`.

### Key Metrics
- Milestone deletion rate per repo (should be low; high rate may indicate UX confusion).
- Ratio of delete_confirmed to delete_cancelled (measures confirmation dialog effectiveness).
- Average number of issues disassociated per deletion (measures blast radius awareness).
- Client distribution of deletions (web vs CLI vs TUI vs direct API).

## Observability

### Logging
- **INFO** on successful deletion: `{ msg: 'milestone_deleted', repo_id, milestone_id, actor_id, disassociated_issues: <count> }`.
- **WARN** on 403 attempt: `{ msg: 'milestone_delete_forbidden', repo_id, milestone_id, actor_id }`.
- **ERROR** on unexpected failure: `{ msg: 'milestone_delete_failed', repo_id, milestone_id, error }`.

### Metrics (Prometheus-style)
- `codeplane_milestone_deletes_total` (counter) — labels: `repo_id`, `status` (success|forbidden|not_found|error).
- `codeplane_milestone_delete_duration_seconds` (histogram) — measures end-to-end handler latency.
- `codeplane_milestone_issues_disassociated_total` (counter) — tracks total issues disassociated across all deletions.

### Alerts
- **High error rate**: If `milestone_delete_failed` errors exceed 5 in a 5-minute window, fire a warning alert.
- **Anomalous deletion volume**: If deletions per hour exceed 3x the 7-day rolling average, fire an informational alert (possible scripted misuse or accidental bulk operation).

### Tracing
- Span: `milestone.delete` with attributes `repo_id`, `milestone_id`, child spans for `db.transaction`, `webhook.emit`, `notification.send`.

## Verification

### Unit Tests (`packages/sdk`)
1. `milestoneService.delete()` removes the milestone and returns void.
2. `milestoneService.delete()` disassociates all linked issues (milestone_id set to NULL).
3. `milestoneService.delete()` throws 404 for non-existent milestone.
4. `milestoneService.delete()` throws 404 for milestone belonging to a different repo.
5. `milestoneService.delete()` emits `milestone.deleted` webhook event.
6. Deletion is atomic — if webhook emission fails, the milestone is still deleted (webhook is best-effort).

### API Integration Tests (`apps/server`)
7. `DELETE /milestones/:id` returns 204 for authorized user.
8. `DELETE /milestones/:id` returns 403 for read-only collaborator.
9. `DELETE /milestones/:id` returns 401 for unauthenticated request.
10. `DELETE /milestones/:id` returns 404 for non-existent milestone.
11. `DELETE /milestones/:id` returns 404 for milestone in inaccessible repo (no enumeration leak).
12. After deletion, `GET /milestones/:id` returns 404.
13. After deletion, previously associated issues have `milestone_id: null`.
14. After deletion, milestone does not appear in `GET /milestones` list.

### CLI Tests (`apps/cli`)
15. `milestone delete <id> --repo owner/repo --yes` succeeds and prints confirmation.
16. `milestone delete <id> --repo owner/repo` without `--yes` prompts for confirmation.
17. `milestone delete <id> --repo owner/repo --json` returns structured JSON output.
18. `milestone delete` with invalid milestone ID returns appropriate error.

### E2E Tests
19. Web UI: Create milestone → delete via UI → verify removal from list and issue disassociation.
20. CLI: Create milestone, associate issues, delete milestone, verify issues retain data minus milestone.
21. Webhook: Delete milestone → verify webhook delivery payload matches schema.

### Manual Verification Checklist
- [ ] Delete a milestone with 0 associated issues — clean success.
- [ ] Delete a milestone with 10+ associated issues — all disassociated, none deleted.
- [ ] Attempt delete as read-only user — blocked with 403.
- [ ] Cancel confirmation dialog — no deletion occurs.
- [ ] Delete milestone, then refresh milestones list — milestone gone.
- [ ] Check audit log entry after deletion.
