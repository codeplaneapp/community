# MILESTONE_VIEW

Specification for MILESTONE_VIEW.

## High-Level User POV

As a project manager or developer, I need to view milestone details including progress, associated issues, and timeline so I can track project progress and plan work effectively. The milestone view should show: milestone title, description (rendered markdown), due date with relative time, completion percentage with progress bar, open vs closed issue counts, and a filterable/sortable list of all issues assigned to the milestone. Users access this view from the milestones list page, from issue detail pages (clicking the milestone badge), or via direct URL (/:owner/:repo/milestones/:id). The view must work consistently across web UI, CLI (`codeplane milestone view <id>`), and TUI milestone detail screen.

## Acceptance Criteria

1. Web UI renders milestone detail page at /:owner/:repo/milestones/:id showing title, description (markdown), due date, progress bar, open/closed issue counts
2. Issue list within milestone view supports filtering by state (open/closed/all) and sorting by created/updated/priority
3. CLI `milestone view <id>` displays milestone details with issue summary in both human-readable and --json formats
4. TUI milestone detail screen shows milestone info and scrollable issue list
5. Progress bar accurately reflects (closed issues / total issues) * 100
6. Due date shows both absolute date and relative time (e.g., 'Due in 3 days' or 'Overdue by 2 days')
7. Milestone description renders full markdown including headings, lists, code blocks, and links
8. Empty state handled gracefully when milestone has zero issues
9. 404 returned with appropriate message when milestone ID does not exist
10. Edit and delete actions available to users with write permission on the repository
11. Pagination of issue list works correctly for milestones with >50 issues
12. Page title and breadcrumbs reflect milestone name and repository context

## Design

## API Layer
- GET /api/v1/repos/:owner/:repo/milestones/:id — returns milestone object with fields: id, title, description, state (open/closed), due_date, open_issues, closed_issues, created_at, updated_at, creator
- GET /api/v1/repos/:owner/:repo/milestones/:id/issues — returns paginated issue list with query params: state (open/closed/all), sort (created/updated/priority), direction (asc/desc), page, per_page
- Response shape for milestone: { id, title, description, state, due_date, open_issues, closed_issues, total_issues, progress_percent, creator: { username, avatar_url }, created_at, updated_at }

## Web UI (SolidJS)
- Route: /:owner/:repo/milestones/:id mapped in apps/ui route config
- Components: MilestoneHeader (title, state badge, edit/delete actions), MilestoneProgress (progress bar + counts), MilestoneDescription (markdown renderer), MilestoneIssueList (filterable, sortable, paginated issue table)
- Uses repoContext for owner/repo resolution and auth for permission-gated actions
- Loader prefetches milestone detail and first page of issues in parallel

## CLI
- Command: `codeplane milestone view <milestone-id> --repo <owner/repo> [--json]`
- Output: formatted milestone summary followed by issue table (or JSON blob)
- Uses shared SDK API client from packages/sdk

## TUI (React/Ink)
- Screen: MilestoneDetail with milestone info panel and scrollable issue list
- Navigation: enter from milestones list screen, back returns to list
- Uses shared hooks from packages/ui-core

## Shared packages
- packages/sdk: milestone service already implements getMilestone and list operations; extend with getMilestoneIssues if not present
- packages/ui-core: add useMilestoneDetail and useMilestoneIssues hooks consumed by both web UI and TUI

## Permissions & Security

- **Read access**: Any user with read access to the repository can view milestone details and associated issues. Public repo milestones are visible to unauthenticated users.
- **Write access**: Users with write access to the repository can edit milestone title, description, due date, and state (open/close).
- **Admin access**: Users with admin access can delete milestones. Deleting a milestone does NOT delete associated issues; it only removes the milestone association.
- **API tokens**: PAT-based access respects the same permission model as session-based access.
- **Deploy keys**: Deploy keys with read access can read milestones via API; write-access deploy keys can modify milestones.
- **Organization teams**: Team-level repository permissions (read/write/admin) apply transitively to milestone operations.

## Telemetry & Product Analytics

- Track `milestone.viewed` event with properties: { repo_id, milestone_id, view_source (web/cli/tui), user_id }
- Track `milestone.issues_filtered` event with properties: { repo_id, milestone_id, filter_state, sort_field, sort_direction }
- Track `milestone.edited` and `milestone.deleted` events for write operations
- Track `milestone.issue_list_paginated` when user navigates beyond first page
- All telemetry events include standard context: timestamp, session_id, client_type, client_version

## Observability

- **Structured logging**: Log milestone detail fetch with repo_id, milestone_id, response_time_ms at info level
- **Error logging**: Log 404s at warn level, 500s at error level with full stack trace
- **Metrics**: Emit histogram for milestone detail API latency (p50, p95, p99); counter for milestone views by source (web/cli/tui); counter for milestone 404 errors
- **Health**: Milestone detail endpoint covered by existing health check infrastructure; no additional health probes needed
- **Alerting**: Alert if milestone detail API p99 latency exceeds 2s or error rate exceeds 5% over 5-minute window

## Verification

## Unit Tests
- Milestone service: getMilestone returns correct shape, handles not-found, respects permissions
- Milestone service: getMilestoneIssues returns paginated results with correct filtering and sorting
- Progress calculation: edge cases for 0 issues, all closed, all open, mixed states
- Due date formatting: overdue, due today, due in future, no due date

## Integration Tests
- API endpoint GET /milestones/:id returns 200 with valid milestone data
- API endpoint GET /milestones/:id returns 404 for non-existent milestone
- API endpoint GET /milestones/:id/issues returns filtered and sorted issue list
- Permission enforcement: unauthenticated user cannot edit/delete milestone on private repo
- Pagination: requesting page 2 with per_page=10 returns correct issue subset

## E2E Tests
- Web UI: Navigate to milestone from milestones list, verify all sections render (title, progress, description, issues)
- Web UI: Filter issues by state, verify list updates correctly
- Web UI: Edit milestone (with write access), verify changes persist
- CLI: `milestone view` outputs correct milestone details in both text and JSON formats
- TUI: Navigate to milestone detail screen, verify info panel and issue list render

## Manual Verification Checklist
- [ ] Milestone with 0 issues shows empty state gracefully
- [ ] Milestone with 100+ issues paginates correctly
- [ ] Overdue milestone shows visual warning indicator
- [ ] Markdown description with complex formatting renders correctly
- [ ] Mobile/responsive web view is usable
- [ ] Screen reader can navigate milestone detail page
