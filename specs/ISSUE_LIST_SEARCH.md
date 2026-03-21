# ISSUE_LIST_SEARCH

Specification for ISSUE_LIST_SEARCH.

## High-Level User POV

As a developer using Codeplane, I want to search and filter my issue list so I can quickly find relevant issues by title, label, assignee, milestone, or status without manually scanning through all issues.

## Acceptance Criteria

1. Users can search issues by title/body text via a query parameter.
2. Users can filter issues by state (open/closed/all).
3. Users can filter issues by label name(s).
4. Users can filter issues by assignee username.
5. Users can filter issues by milestone.
6. Search results are paginated using the existing page/per-page pattern.
7. Results are sorted by relevance when a search query is provided, and by creation date otherwise.
8. The API returns consistent JSON response shape with total count for pagination.
9. CLI `issue list` supports `--search`, `--label`, `--assignee`, `--milestone`, and `--state` flags.
10. Web UI issue list provides a search input and filter controls that call the API.
11. TUI issue list screen supports search and filter inputs.
12. Empty results return an empty array with total count of 0, not an error.

## Design

The issue list search is implemented as query parameters on the existing `GET /api/v1/repos/:owner/:repo/issues` endpoint. The server route handler passes search/filter params to the issue service's `list` method, which constructs the appropriate SQL query with WHERE clauses and optional full-text search. The issue service in `packages/sdk/src/services/issue.ts` handles query building, ensuring search terms are sanitized and combined with filter predicates using AND logic. Label filtering supports multiple labels (AND semantics). The web UI uses a controlled search input with debounced API calls and filter dropdowns that update URL search params for shareable filtered views. The CLI uses flag-based filtering that maps directly to API query parameters. The TUI uses an input field and filter selector components from Ink.

## Permissions & Security

Issue list search respects existing repository visibility and access controls. Public repositories allow unauthenticated search. Private repositories require authenticated access with at least read permission. No new permission scopes are introduced — the search/filter capability inherits from the existing issue list endpoint's authorization checks.

## Telemetry & Product Analytics

Track search query usage frequency and filter combination patterns to understand which filters are most used. Log search latency percentiles (p50, p95, p99) to detect slow queries. Track empty result rates to identify potential UX improvements. All telemetry is anonymous and aggregated — search query text is not logged in telemetry, only filter types used and result counts.

## Observability

Add structured log fields for issue search requests: `search_query_present` (boolean), `filters_applied` (array of filter types), `result_count` (integer), `query_duration_ms` (number). Emit metrics for `issue_search_requests_total` (counter with filter type labels), `issue_search_duration_seconds` (histogram), and `issue_search_results_count` (histogram). Alert if p99 search latency exceeds 500ms or if error rate exceeds 1% over a 5-minute window.

## Verification

1. Unit tests for issue service search/filter query building with various parameter combinations.
2. Unit tests for SQL injection prevention in search terms.
3. Integration tests for the API endpoint with search, each filter type, and combined filters.
4. Integration test for pagination with active filters.
5. Integration test confirming permission enforcement on private repo issue search.
6. E2E test: CLI `issue list --search 'bug' --label critical --state open` returns filtered results.
7. E2E test: Web UI search input triggers filtered API call and displays results.
8. E2E test: Empty search results display appropriate empty state.
9. Performance test: Search across 10k issues completes within 200ms.
10. Verify that all three clients (web, CLI, TUI) produce identical filtered results for the same parameters.
