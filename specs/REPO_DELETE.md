# REPO_DELETE

Specification for REPO_DELETE.

## High-Level User POV

As a repository owner or organization admin, I need to permanently delete a repository so that I can clean up unused projects, remove accidentally created repos, or decommission old codebases. Deletion must be irreversible and must cascade to all dependent resources (issues, landing requests, workflows, workspaces, webhooks, secrets, wiki, releases, LFS objects, deploy keys, stars, watches, notifications, agent sessions, preview environments, and labels/milestones associations). The operation should require explicit confirmation (typing the repo name) in the web UI and a --confirm flag or interactive prompt in CLI/TUI to prevent accidental data loss.

## Acceptance Criteria

1. DELETE /api/v1/repos/:owner/:repo returns 204 on success, 403 if not owner/admin, 404 if repo not found.
2. Deletion cascades to: issues, comments, reactions, labels associations, milestone associations, landing requests, reviews, landing comments, workflow definitions, workflow runs, run logs, run artifacts, run caches, webhooks, webhook deliveries, secrets, variables, wiki pages, releases, release assets, LFS objects, deploy keys, stars, watches, notifications, agent sessions, agent messages, preview environments, repository topics, commit statuses, and forks (forks become standalone repos, not deleted).
3. On-disk repository storage (bare repo directory) is removed after DB cascade completes.
4. Any active workspaces tied to the repo are terminated and cleaned up.
5. Any active preview environments are destroyed.
6. Any running workflow runs are cancelled before deletion.
7. Web UI requires typing the full 'owner/repo' name to enable the delete button.
8. CLI 'repo delete' requires --yes flag or interactive confirmation prompt.
9. TUI shows a confirmation dialog before proceeding.
10. A 'repo.deleted' webhook event is fired to all org-level webhook subscribers before the repo webhooks themselves are removed.
11. Search index entries for the repo are purged.
12. SSE channels for the repo's workflows, workspaces, and notifications are closed.
13. Audit log entry is created recording who deleted which repo and when.
14. Operation completes within 30 seconds for repos with up to 10,000 issues and 1,000 workflow runs.
15. If any cascade step fails, the entire operation rolls back and returns 500 with a descriptive error.

## Design

### Server Layer
- **Route**: `DELETE /api/v1/repos/:owner/:repo` in `apps/server/src/routes/repos.ts`
- **Auth middleware**: requires authenticated user who is repo owner OR org admin
- **Handler flow**:
  1. Resolve repo by owner/name, return 404 if not found
  2. Check permissions (owner or org admin role)
  3. Cancel all active workflow runs via WorkflowService.cancelActiveRuns(repoId)
  4. Terminate active workspaces via WorkspaceService.terminateByRepo(repoId)
  5. Destroy preview environments via PreviewService.destroyByRepo(repoId)
  6. Fire 'repo.deleted' event to org-level webhooks via WebhookService.deliver()
  7. Close SSE channels for repo via SSEManager.closeRepoChannels(repoId)
  8. Execute cascading DB deletion in a single transaction via RepoService.delete(repoId)
  9. Remove on-disk bare repository via RepoHostService.removeRepository(repoPath)
  10. Purge search index via SearchService.purgeRepo(repoId)
  11. Write audit log entry via AdminService.auditLog()
  12. Return 204

### Service Layer (packages/sdk)
- **RepoService.delete(repoId)**: Wraps all DB cascades in a single transaction. Deletion order respects FK constraints: reactions → comments → issues; review comments → reviews → landing requests; run logs → run artifacts → workflow runs → workflow definitions; webhook deliveries → webhooks; release assets → releases; etc. Forks have their fork_of_id set to NULL rather than being deleted.
- **RepoHostService.removeRepository(repoPath)**: Removes the bare .git directory from disk. Must run AFTER successful DB transaction commit.

### Client Surfaces
- **Web UI** (`apps/ui`): Repo Settings → Danger Zone → Delete Repository button. Modal requires typing `owner/repo` to confirm. Calls DELETE endpoint, redirects to owner profile on success.
- **CLI** (`apps/cli`): `codeplane repo delete [owner/repo] [--yes]`. Without --yes, prompts 'Type the repository name to confirm deletion:'. On success prints confirmation message.
- **TUI** (`apps/tui`): Delete action in repo detail screen, confirmation dialog with text input.
- **Desktop/Editor**: Delegated through web UI or CLI; no special desktop-specific delete flow needed.

### Data Model Impact
- No schema changes required; deletion uses existing FK cascade or explicit ordered deletes within transaction.
- Blob store cleanup (release assets, LFS objects) can be deferred to the existing cleanup scheduler if immediate deletion is too slow for large repos.

## Permissions & Security

- **Repository owner**: Full delete permission on their own repos.
- **Organization admin**: Full delete permission on any repo within their org.
- **Organization member (non-admin)**: Denied (403).
- **Team maintainer**: Denied (403) — repo deletion is an org-admin-level operation, not a team-level one.
- **Unauthenticated user**: Denied (401).
- **PAT-scoped access**: Requires `repo:delete` scope on the token. If the PAT lacks this scope, return 403 with a message indicating insufficient token scope.
- **Deploy keys**: Cannot delete repositories (deploy keys are repo-scoped read/write for git operations only).
- **OAuth2 applications**: Requires `repo:delete` scope in the OAuth2 grant.
- **SSH transport**: Repo deletion is not available over SSH transport; it is an HTTP API operation only.

## Telemetry & Product Analytics

- **Event name**: `repo.deleted`
- **Properties**: repo_id, repo_name, owner_id, owner_name, org_id (nullable), deleted_by_user_id, deletion_method (web|cli|tui|api), cascade_stats (issue_count, landing_count, workflow_run_count, workspace_count, preview_count), duration_ms, timestamp
- **Volume expectation**: Low frequency (< 100/day even at scale); no sampling needed.
- **Retention**: Telemetry events retained for 90 days minimum for operational debugging.
- **Privacy**: No PII beyond user IDs and repo names which are already public-facing identifiers. No file contents or code snippets included in telemetry.

## Observability

- **Structured log entries**: Log at INFO level on successful deletion with repo_id, owner, deleted_by, duration_ms, and cascade counts. Log at ERROR level on any failure with full error context.
- **Metrics** (Prometheus-style):
  - `codeplane_repo_deletions_total` (counter, labels: status=success|failure, method=web|cli|tui|api)
  - `codeplane_repo_deletion_duration_seconds` (histogram, labels: method)
  - `codeplane_repo_deletion_cascade_items_total` (counter, labels: resource_type=issues|landings|workflows|workspaces|etc)
- **Alerts**:
  - WARN if deletion duration exceeds 30 seconds
  - ERROR if deletion failure rate exceeds 5% over a 5-minute window
  - ERROR if disk cleanup fails (bare repo directory still exists after successful DB deletion)
- **Audit log**: Immutable audit log entry in admin audit table: { action: 'repo.delete', actor_id, repo_id, repo_name, org_id, timestamp, metadata: { cascade_stats } }
- **Health check impact**: Repo deletion failures should not affect the /health endpoint, but persistent failures should surface in the admin dashboard health view.

## Verification

### Unit Tests (packages/sdk)
1. RepoService.delete() cascades all dependent resources in correct FK order within a single transaction
2. RepoService.delete() sets fork_of_id to NULL on forked repos instead of deleting them
3. RepoService.delete() rolls back entirely if any cascade step fails
4. RepoService.delete() throws NotFoundError for non-existent repo ID
5. Permission check rejects non-owner, non-org-admin users

### Integration Tests (apps/server)
6. DELETE /api/v1/repos/:owner/:repo returns 204 and removes all associated resources from DB
7. DELETE /api/v1/repos/:owner/:repo returns 403 for authenticated non-owner
8. DELETE /api/v1/repos/:owner/:repo returns 401 for unauthenticated request
9. DELETE /api/v1/repos/:owner/:repo returns 404 for non-existent repo
10. DELETE /api/v1/repos/:owner/:repo with PAT lacking repo:delete scope returns 403
11. Active workflow runs are cancelled before cascade deletion
12. Active workspaces are terminated before cascade deletion
13. Preview environments are destroyed before cascade deletion
14. SSE channels for the deleted repo are closed
15. Org-level webhook receives 'repo.deleted' event
16. On-disk bare repository directory is removed after successful deletion
17. Search index no longer returns results for deleted repo
18. Audit log entry is created with correct actor and repo metadata

### E2E Tests
19. Web UI: Navigate to repo settings → delete → type confirmation → repo is deleted → redirected to profile
20. Web UI: Delete button is disabled until full owner/repo name is typed correctly
21. CLI: `codeplane repo delete owner/repo --yes` succeeds and repo is no longer accessible
22. CLI: `codeplane repo delete owner/repo` without --yes prompts for confirmation
23. TUI: Delete flow with confirmation dialog removes repo successfully

### Failure Mode Tests
24. Simulate disk removal failure → DB transaction still committed, cleanup scheduler retries disk removal
25. Simulate DB transaction failure mid-cascade → all changes rolled back, repo still accessible
26. Concurrent deletion requests for same repo → first succeeds, second returns 404
