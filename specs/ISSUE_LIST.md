# ISSUE_LIST

Specification for ISSUE_LIST.

## High-Level User POV

As a Codeplane user, I need to view a list of issues for a repository so I can track work, triage bugs, and manage feature requests. The issue list should support filtering by state (open/closed), label, milestone, and assignee, sorting by created/updated date, and pagination. It must be accessible from the web UI, CLI, TUI, and editor integrations, all consuming the same API contract.

## Acceptance Criteria

1. GET /repos/:owner/:repo/issues returns paginated issue list with title, number, state, author, labels, milestone, assignees, comment count, created/updated timestamps.
2. Supports query params: state (open|closed|all, default open), labels (comma-separated), milestone, assignee, sort (created|updated), direction (asc|desc), page, per_page.
3. Web UI renders issue list with filter controls, label chips, assignee avatars, and pagination; supports URL-driven filter state.
4. CLI `issue list` command supports --state, --label, --milestone, --assignee, --sort, --limit, --json flags and outputs formatted table or JSON.
5. TUI issue list screen shows issues with keyboard navigation, filter toggles, and detail drill-down.
6. VS Code and Neovim issue views display repository issues with refresh capability.
7. Empty states are handled gracefully across all clients.
8. Response time for issue list under 500ms for repositories with up to 10,000 issues.
9. Closed issues are visually distinguished from open issues in all visual clients.

## Design

The issue list is served by the issues route family mounted at /api/v1/repos/:owner/:repo/issues. The route handler delegates to the IssueService in packages/sdk/src/services which executes paginated queries via generated SQL wrappers. Response shape includes issue metadata, embedded label objects, milestone reference, and assignee references. The web UI uses a SolidJS resource loader with URL search params driving filter state. The CLI uses the shared SDK API client from packages/ui-core. The TUI consumes the same API client through React hooks. Pagination follows the page/per_page pattern with Link header for cursor hints. Label filtering uses intersection semantics (all specified labels must match). The issue list endpoint also powers the global search issue results when scoped to a repository.

## Permissions & Security

1. Public repositories: issue list is readable by unauthenticated users.
2. Private repositories: issue list requires authenticated user with at least read access to the repository.
3. Organization-owned private repos respect team-level repository access grants.
4. Deploy keys do not grant issue list access (SSH transport only).
5. PATs require repo scope for private repository issue access.
6. OAuth2 applications require read:issues scope.

## Telemetry & Product Analytics

1. Track issue_list_viewed event with properties: repo_id, filter_state, filter_labels_count, filter_milestone, filter_assignee, sort, client_type (web|cli|tui|vscode|neovim), result_count, page_number.
2. Track issue_list_filtered event when user changes filter parameters in web UI.
3. Track issue_list_paginated event on page navigation.
4. Measure and report p50/p95/p99 latency for issue list API endpoint.
5. Count API calls by client type for capacity planning.

## Observability

1. Structured log entry on each issue list request with repo_owner, repo_name, filter_params, result_count, response_time_ms, authenticated (bool), client_type.
2. Error logging with full context on database query failures or service exceptions.
3. Rate limit hit logging with user/IP identification.
4. Slow query detection: log warning when issue list query exceeds 200ms.
5. Health check integration: issue list query failure contributes to service degradation signal.
6. Metrics: issue_list_requests_total counter, issue_list_duration_seconds histogram, issue_list_results_total histogram.

## Verification

1. Unit tests for IssueService.list() covering: default filters, state filtering, label filtering, milestone filtering, assignee filtering, sort ordering, pagination boundaries, empty results.
2. Integration tests for GET /repos/:owner/:repo/issues verifying: response schema, pagination headers, filter query params, auth enforcement on private repos, public repo unauthenticated access.
3. E2E tests: web UI issue list renders with test data, filter controls update URL and results, pagination navigates correctly, empty state displays.
4. CLI integration test: `issue list` returns expected output format, --json flag produces valid JSON, filters reduce result set.
5. Performance test: issue list query against 10,000-issue repo completes under 500ms.
6. Edge cases: repo with zero issues, filter combination yielding no results, invalid filter values return 422, milestone/label that doesn't exist returns empty list (not error).
