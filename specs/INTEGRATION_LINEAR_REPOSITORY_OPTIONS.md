# INTEGRATION_LINEAR_REPOSITORY_OPTIONS

Specification for INTEGRATION_LINEAR_REPOSITORY_OPTIONS.

## High-Level User POV

When a Codeplane user is setting up a Linear integration — after they have authorized Codeplane to access their Linear workspace via OAuth — they need to choose which Codeplane repository the integration should be bound to. This feature provides the repository selection experience that powers that choice.

From the user's perspective, after successfully authorizing with Linear and being redirected back to Codeplane's integration setup page, they see a dropdown or picker populated with the repositories they have access to. This list includes all repositories they own or are a member of, making it easy to find the right target. The user selects a repository, pairs it with the Linear team they want to sync, and completes the integration setup.

This feature provides value by ensuring users never have to remember or manually type repository identifiers during the integration setup flow. Instead, they get a curated, permission-aware list of repositories that they are actually allowed to configure integrations for. Repositories that are archived are excluded to prevent accidental binding to inactive projects. The list is sorted for easy scanning, and each entry includes enough context — owner, name, and visibility — for the user to quickly identify the correct target, even when they have access to many repositories across different owners and organizations.

If the user has no repositories, or if all their repositories are archived, the list is empty and the UI communicates clearly that they need to create a repository before they can complete the integration setup. If the user is not authenticated, they are redirected to sign in before the repository list can be fetched.

## Acceptance Criteria

- **Authentication required**: The user must be authenticated with a valid Codeplane session or PAT before the repository options list can be fetched. Unauthenticated requests must receive a `401 Unauthorized` response with `{ "error": "authentication required" }`.
- **Feature flag gating**: The endpoint must only be active when the `INTEGRATION_LINEAR_REPOSITORY_OPTIONS` feature flag is enabled. When disabled, the endpoint must return `404 Not Found` or not be mounted.
- **Returns user-accessible repositories**: The response must include all repositories the authenticated user owns or has been granted membership to (via direct repo membership, org membership, or team assignment).
- **Excludes archived repositories**: Archived repositories must not appear in the response array.
- **Response shape**: Each repository option in the response array must include: `id` (number), `owner` (string), `full_name` (string, in `owner/name` format), `name` (string), `description` (string), `is_public` (boolean).
- **Sorted order**: Results must be sorted alphabetically by `full_name` (case-insensitive) to provide a predictable, scannable list.
- **No pagination**: The endpoint returns all eligible repositories in a single response (no page/per_page parameters). The expected cardinality is low enough (hundreds, not tens of thousands) that pagination is unnecessary for this use case.
- **Empty array for no repositories**: If the user has no accessible non-archived repositories, the endpoint must return `200 OK` with an empty array `[]`, not an error.
- **No side effects on GET**: The endpoint must not create, modify, or delete any database records. It is a pure read operation.
- **Structured error handling**: If the service layer throws an unexpected error, the endpoint must return a structured JSON error payload via `writeRouteError`, never raw exception messages or stack traces.
- **Maximum response size**: The response array is bounded by the number of repositories the user has access to. For users with more than 1,000 accessible repositories, the endpoint must still respond successfully within the latency budget.
- **No sensitive data in response**: The response must not include repository secrets, variables, webhook URLs, SSH keys, or any internal-only identifiers. Only the fields listed in the response shape are permitted.
- **Repository name constraints**: Repository names in the response reflect the existing repository name rules (1–100 characters, alphanumeric plus hyphens and underscores, no leading/trailing hyphens).
- **Owner resolution**: For user-owned repositories, the `owner` field must be the user's username. For organization-owned repositories, the `owner` field must be the organization's name.
- **Performance**: The endpoint must respond within 500ms p99 for users with up to 500 repositories and within 2 seconds p99 for users with up to 2,000 repositories.

### Definition of Done
- The `GET /api/integrations/linear/repositories` endpoint is implemented with a real service backing (not a stub returning `[]`).
- The endpoint is gated behind the `INTEGRATION_LINEAR_REPOSITORY_OPTIONS` feature flag.
- The endpoint returns all non-archived repositories the user owns or has membership access to.
- Each item in the response includes `id`, `owner`, `full_name`, `name`, `description`, and `is_public`.
- Results are sorted alphabetically by `full_name`.
- Archived repositories are excluded.
- All error cases return structured JSON error responses.
- The web UI integration setup flow uses this endpoint to populate the repository picker.
- Integration and E2E tests pass with near-100% confidence.
- Documentation for the repository selection step is published as part of the Linear integration setup guide.

## Design

### API Shape

**Endpoint**: `GET /api/integrations/linear/repositories`

**Request**:
- Method: `GET`
- Authentication: Session cookie or PAT-based `Authorization` header (required)
- No request body or query parameters

**Success Response** (200):
- Status: `200 OK`
- Content-Type: `application/json`
- Body:

```json
[
  {
    "id": 42,
    "owner": "acme-corp",
    "full_name": "acme-corp/backend-api",
    "name": "backend-api",
    "description": "Core backend API service",
    "is_public": false
  },
  {
    "id": 17,
    "owner": "jane",
    "full_name": "jane/personal-site",
    "name": "personal-site",
    "description": "My personal website",
    "is_public": true
  }
]
```

**Empty Success Response** (200):
- Body: `[]`

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 401 | User not authenticated | `{ "error": "authentication required" }` |
| 404 | Feature flag disabled | Not found / not mounted |
| 429 | Rate limit exceeded | `{ "error": "rate limit exceeded" }` with `Retry-After` header |
| 500 | Service layer error | `{ "error": "internal server error" }` |

**Response Item Schema**:

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `id` | `number` | Unique repository identifier | Positive integer |
| `owner` | `string` | Username or organization name that owns the repository | 1–39 characters |
| `full_name` | `string` | Qualified name in `owner/name` format | 3–140 characters |
| `name` | `string` | Repository name | 1–100 characters, `[a-zA-Z0-9_-]` |
| `description` | `string` | Repository description | 0–512 characters, may be empty string |
| `is_public` | `boolean` | Whether the repository is publicly visible | — |

### SDK Shape

The `repositoryService` in the SDK must implement:

```typescript
listRepositoryOptions(userId: number): Promise<RepositoryOption[]>
```

Where `RepositoryOption` is:

```typescript
interface RepositoryOption {
  id: number;
  owner: string;
  full_name: string;
  name: string;
  description: string;
  is_public: boolean;
}
```

This method must:
1. Query all repositories the user owns.
2. Query all repositories the user has membership access to (via org or team).
3. Exclude archived repositories.
4. Resolve the owner name for each repository (username for user-owned, org name for org-owned).
5. Deduplicate (a user may own a repo and also be a member of its org).
6. Sort alphabetically by `full_name` (case-insensitive).
7. Return the combined, deduplicated, sorted list.

### Web UI Design

The repository picker is displayed as part of the Linear integration setup flow on `/integrations/linear` after the user has completed OAuth authorization and selected a Linear team.

**Repository Selector Component**:
- Renders as a searchable dropdown/combobox.
- Fetches data from `GET /api/integrations/linear/repositories` on mount.
- Shows a loading spinner while the request is in flight.
- Each option displays `full_name` as the primary text, with a lock/globe icon indicating `is_public` status.
- The description is shown as secondary text below the name, truncated to one line.
- A search/filter input at the top of the dropdown filters options by matching against `full_name` or `description` (client-side filter).
- When the list is empty, displays: "No repositories available. Create a repository first to set up a Linear integration."
- The selected repository populates `repo_id`, `repo_owner`, and `repo_name` fields in the integration creation request.
- The dropdown is disabled and shows "Loading repositories…" while the API call is pending.
- If the API call fails, the dropdown is disabled and shows "Failed to load repositories. Try again." with a retry button.
- The selector must be keyboard-accessible (arrow keys to navigate, Enter to select, Escape to close).

**Integration Setup Form Flow**:
1. User completes OAuth → redirected back with `?setup=<key>`
2. UI resolves the setup key → displays Linear teams and viewer info
3. User selects a Linear team from the team dropdown
4. User selects a Codeplane repository from the repository dropdown (this feature)
5. User clicks "Complete Setup" → `POST /api/integrations/linear` with `linear_team_id`, `setup_key`, `repo_owner`, `repo_name`, `repo_id`

### CLI Command

The CLI does not directly call the repository options endpoint. The `codeplane extension linear install` command requires explicit `--repo-owner`, `--repo-name`, and `--repo-id` flags, which bypasses the picker entirely. No CLI changes are required for this feature.

### TUI UI

The TUI does not directly participate in the Linear integration setup flow. It may display a message directing users to the web UI for Linear integration configuration. No TUI changes are required for this feature.

### Documentation

1. **Linear Integration Setup Guide — Step 4: Select Repository**: Update the existing Linear integration setup guide to document the repository selection step. Include a screenshot of the repository picker, explanation that only non-archived repositories appear, and a note that the user must have admin access to the selected repository for the integration to be created (enforced at the `INTEGRATION_LINEAR_CREATE` step).
2. **API Reference — `GET /api/integrations/linear/repositories`**: Document the endpoint in the API reference with request/response examples, authentication requirements, and error codes.

## Permissions & Security

### Authorization Roles

| Role | Can fetch repository options? |
|------|-------------------------------|
| Owner | Yes |
| Admin | Yes |
| Member | Yes |
| Read-Only | Yes — the endpoint lists repositories the user can access; the more sensitive admin-access check happens at integration creation time (`INTEGRATION_LINEAR_CREATE`) |
| Anonymous / Unauthenticated | No — returns 401 |

**Note**: This endpoint only reads repository metadata that the user already has access to. It does not grant any new permissions. The actual integration binding requires admin access to the selected repository, which is enforced by the `POST /api/integrations/linear` endpoint.

### Rate Limiting

- **Per-user rate limit**: Maximum 30 requests per user per 5-minute window. This is higher than the OAuth start limit because the repository list may be re-fetched during form interaction (e.g., after an error or page reload).
- **Global rate limit**: Maximum 200 requests across all users per minute.
- **Rate limit response**: `429 Too Many Requests` with a `Retry-After` header and structured JSON error body.

### Data Privacy & PII

- **Response data**: Contains repository names, owner names, and descriptions. These are not PII in the traditional sense, but they may reveal private repository names. The endpoint only returns repositories the authenticated user already has access to, so no information disclosure beyond the user's own access scope occurs.
- **No cross-user leakage**: The endpoint must never return repositories belonging to other users or organizations that the authenticated user does not have access to.
- **Server logs**: User ID should be logged at INFO level. Repository counts should be logged at INFO level. Individual repository names or IDs must not be logged at INFO level (only at DEBUG).
- **No credentials in response**: The response must not include repository secrets, deploy keys, webhook URLs, or any credential material.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `LinearRepositoryOptionsFetched` | User successfully fetches the repository options list | `user_id`, `timestamp`, `repository_count`, `feature_flag_status` |
| `LinearRepositoryOptionsFailed` | Service layer throws during repository options fetch | `user_id`, `error_type`, `timestamp` |
| `LinearRepositoryOptionsEmpty` | User fetches repository options but the list is empty | `user_id`, `timestamp` |
| `LinearRepositoryOptionsRateLimited` | User is rate-limited on the repository options endpoint | `user_id`, `timestamp`, `retry_after_seconds` |
| `LinearRepositoryOptionsUnauthenticated` | Unauthenticated request hits the endpoint | `timestamp`, `request_ip` (hashed) |

### Funnel Metrics

The repository options fetch is the fourth step in the Linear integration setup funnel:

1. **OAuth Start** → `LinearOAuthStartInitiated`
2. **OAuth Callback** → `LinearOAuthCallbackCompleted` (separate feature)
3. **Setup Resolution** → `LinearOAuthSetupResolved` (separate feature)
4. **Repository Options Fetched** → `LinearRepositoryOptionsFetched` (this feature)
5. **Integration Created** → `LinearIntegrationCreated` (separate feature)

**Key success indicators**:

- **Options-fetched-to-integration-created conversion rate**: Percentage of `LinearRepositoryOptionsFetched` events that result in a corresponding `LinearIntegrationCreated` within 30 minutes. Target: >70%.
- **Empty options rate**: Percentage of `LinearRepositoryOptionsEmpty` events relative to total fetch attempts. A high rate may indicate users are attempting setup before creating repositories. Target: <10%.
- **Error rate**: Percentage of `LinearRepositoryOptionsFailed` events relative to total fetch attempts. Target: <0.5%.
- **Repeat fetch rate**: Number of users who fetch repository options more than 3 times within a 5-minute window. A high rate may indicate UI confusion, slow loading, or an error loop.
- **Time-to-select**: Median time from `LinearRepositoryOptionsFetched` to `LinearIntegrationCreated`. Lower is better — indicates the user found their repository quickly.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Repository options fetched | `INFO` | `user_id`, `request_id`, `repository_count`, `duration_ms` | Successful response returned |
| Repository options failed | `ERROR` | `user_id`, `request_id`, `error_message`, `error_type` | Service layer throws |
| Repository options unauthorized | `WARN` | `request_id`, `remote_addr` | Unauthenticated request |
| Repository options rate limited | `WARN` | `user_id`, `request_id`, `rate_limit_key`, `retry_after` | Rate limit hit |
| Repository options empty | `INFO` | `user_id`, `request_id` | Successful response with zero results |
| Feature flag check | `DEBUG` | `flag_name`, `flag_value`, `user_id` | Feature flag evaluated |
| Individual repository resolved | `DEBUG` | `user_id`, `repo_id`, `repo_full_name` | Each repository added to results (do NOT log at INFO+) |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_linear_repository_options_total` | Counter | `status` (`success`, `error`, `unauthorized`, `rate_limited`, `empty`) | Total repository options requests |
| `codeplane_linear_repository_options_duration_seconds` | Histogram | — | Time from request receipt to response, buckets: 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0 |
| `codeplane_linear_repository_options_result_count` | Histogram | — | Number of repositories returned per request, buckets: 0, 1, 5, 10, 25, 50, 100, 250, 500, 1000 |

### Alerts

#### Alert: `LinearRepositoryOptionsErrorRateHigh`
- **Condition**: `rate(codeplane_linear_repository_options_total{status="error"}[5m]) / rate(codeplane_linear_repository_options_total[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `repository options failed` entries filtered by the alert window.
  2. Inspect the `repositoryService.listRepositoryOptions` implementation for database query errors.
  3. Verify the database connection pool is healthy and not exhausted.
  4. Check if the `repos` or `users` tables have schema issues or migration failures.
  5. If the error is `org_not_found` or `user_not_found`, check if a data consistency issue exists between user/org and repo ownership records.
  6. If transient, monitor for auto-recovery. If persistent, escalate to the platform team.

#### Alert: `LinearRepositoryOptionsLatencyHigh`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_linear_repository_options_duration_seconds_bucket[5m])) > 2`
- **Severity**: Warning
- **Runbook**:
  1. Repository options should respond in <500ms for most users. High latency suggests a database or resolution performance issue.
  2. Check the `codeplane_linear_repository_options_result_count` histogram for unusually high repository counts — a user with thousands of repos may cause slow queries.
  3. Check database query execution plans for the repository list and org/user resolution queries.
  4. Check server resource utilization (CPU, memory, event loop lag).
  5. If a specific user has an extremely large number of repositories, consider implementing server-side pagination for this endpoint in a follow-up.
  6. If isolated, monitor. If affecting multiple users, escalate.

#### Alert: `LinearRepositoryOptionsRateLimitSpiking`
- **Condition**: `rate(codeplane_linear_repository_options_total{status="rate_limited"}[5m]) > 30`
- **Severity**: Info
- **Runbook**:
  1. Identify user(s) triggering rate limits from structured logs.
  2. Determine if legitimate retry behavior (e.g., UI polling loop bug) or abuse.
  3. If a UI bug is causing rapid re-fetches, fix the client-side code to debounce or cache.
  4. If abuse, consider temporary IP-based blocks or account suspension.
  5. If legitimate high-frequency usage, consider raising the per-user limit.

### Error Cases & Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Internal Log |
|-------------|-------------|---------------------|---------------|
| User not authenticated | 401 | "authentication required" | WARN with remote_addr |
| Feature flag disabled | 404 | Not found | — |
| Database query failure | 500 | "internal server error" | ERROR: full exception context, query name, user_id |
| Owner resolution failure (user not found) | 500 | "internal server error" | ERROR: "failed to resolve owner for repo", repo_id, user_id |
| Owner resolution failure (org not found) | 500 | "internal server error" | ERROR: "failed to resolve org owner for repo", repo_id, org_id |
| Rate limit exceeded | 429 | "rate limit exceeded" | WARN with rate limit key and retry_after |
| Request timeout (database slow) | 500 | "internal server error" | ERROR: "repository options query timed out", user_id, duration_ms |

## Verification

### API Integration Tests

1. **Authenticated user receives 200 with repository array**: Send `GET /api/integrations/linear/repositories` with a valid session cookie for a user who owns at least one repository. Assert response status is `200`. Assert body is a JSON array. Assert each item contains `id`, `owner`, `full_name`, `name`, `description`, `is_public`.

2. **Response includes user-owned repositories**: Create a user with 3 repositories. Fetch repository options. Assert all 3 repositories appear in the response with the user's username as `owner`.

3. **Response includes org-membership repositories**: Create a user, an org, and a repo owned by the org. Add the user as an org member. Fetch repository options. Assert the org repo appears with the org name as `owner`.

4. **Response includes team-accessible repositories**: Create a user, an org, a team in the org, and a repo assigned to the team. Add the user to the team. Fetch repository options. Assert the team-accessible repo appears.

5. **Response excludes archived repositories**: Create a user with 2 repos, archive one. Fetch repository options. Assert only the non-archived repo appears.

6. **Empty array when user has no repositories**: Create a user with no repos. Fetch repository options. Assert response is `200` with body `[]`.

7. **Empty array when all repositories are archived**: Create a user with 2 repos, archive both. Fetch repository options. Assert response is `200` with body `[]`.

8. **Results are sorted alphabetically by full_name**: Create a user with repos named `zeta`, `alpha`, `middle`. Fetch repository options. Assert the order is `alpha`, `middle`, `zeta` (by `full_name`).

9. **Case-insensitive sort**: Create repos under owners `Alpha-Corp/repo` and `alpha-user/repo`. Fetch repository options. Assert consistent case-insensitive ordering.

10. **Deduplication across ownership and membership**: Create a user, an org, and a repo owned by the org where the user is both the org owner and a direct member. Fetch repository options. Assert the repo appears exactly once.

11. **full_name matches owner/name format**: For every item in the response, assert `full_name === owner + "/" + name`.

12. **id field is a positive integer**: For every item in the response, assert `typeof id === "number"` and `id > 0`.

13. **is_public field is a boolean**: For every item, assert `typeof is_public === "boolean"`.

14. **description field is a string (may be empty)**: For every item, assert `typeof description === "string"`.

15. **Unauthenticated user receives 401**: Send request without session or authorization. Assert `401`. Assert body contains `"authentication required"`. Assert body is not an array.

16. **Expired PAT receives 401**: Send request with expired/revoked PAT. Assert `401`.

17. **Valid PAT-based authentication works**: Send request with valid PAT in `Authorization` header. Assert `200`.

18. **Feature flag disabled returns 404**: Disable `INTEGRATION_LINEAR_REPOSITORY_OPTIONS` flag. Assert `404`.

19. **No database mutation on GET**: Count repository-related rows before and after request. Assert unchanged.

20. **Rate limiting enforced per user**: Send 31 requests rapidly with same session. Assert first 30 return `200`, 31st returns `429` with `Retry-After` header.

21. **Rate limiting does not cross users**: Send 30 requests with user A. Send 1 with user B. Assert user B gets `200`.

22. **Response does not include archived repository fields**: Create a user with an archived repo. Fetch options. Inspect full response body. Assert no item has the archived repo's `id`.

23. **Response does not leak sensitive fields**: Inspect response body for any of: `secrets`, `variables`, `webhook_url`, `deploy_key`, `ssh_key`, `access_token`. Assert none present.

24. **Large repository count (maximum valid size)**: Create a user with 500 repositories. Fetch repository options. Assert response is `200` with exactly 500 items. Assert response time is under 2 seconds.

25. **Very large repository count (stress boundary)**: Create a user with 2,000 repositories. Fetch repository options. Assert response is `200` with exactly 2,000 items. Assert response time is under 5 seconds.

26. **Mixed ownership repositories appear correctly**: Create a user who owns 2 repos personally and has access to 3 repos via org membership. Fetch repository options. Assert 5 total items, each with the correct `owner`.

27. **Private repos are included with is_public=false**: Create a user with a private repo. Fetch options. Assert the repo appears with `is_public: false`.

28. **Public repos are included with is_public=true**: Create a user with a public repo. Fetch options. Assert the repo appears with `is_public: true`.

### E2E Tests (Playwright)

29. **Repository picker populates during Linear integration setup**: Sign in, complete Linear OAuth flow (or mock it), land on `/integrations/linear?setup=<key>`. Select a Linear team. Assert the repository dropdown populates with at least one option. Assert each option displays `owner/name` format.

30. **Repository picker shows loading state**: Sign in, navigate to setup flow. Assert the repository dropdown shows a loading indicator before the API response arrives.

31. **Repository picker handles empty list**: Sign in as a user with no repositories. Complete OAuth setup. Assert the repository dropdown shows an empty-state message: "No repositories available."

32. **Repository picker is searchable**: Sign in as a user with 5+ repositories. Complete OAuth setup. Type a partial repository name in the picker's search input. Assert the dropdown filters to show only matching repositories.

33. **Repository selection populates form fields**: Sign in, open the picker, select a repository. Assert the form's hidden fields for `repo_id`, `repo_owner`, and `repo_name` are populated correctly. Click "Complete Setup". Assert the `POST /api/integrations/linear` request includes the correct repository fields.

34. **Repository picker handles API error gracefully**: Mock the `GET /api/integrations/linear/repositories` endpoint to return `500`. Assert the picker shows an error message and a retry button. Click retry. Assert the API is called again.

35. **Repository picker is keyboard accessible**: Open the dropdown with Enter key. Navigate options with arrow keys. Select with Enter. Close with Escape. Assert correct behavior at each step.

36. **End-to-end integration creation with repository selection**: Sign in, complete OAuth, resolve setup, select team, select repository from picker, click "Complete Setup". Assert the integration is created successfully and appears in the integration list.

### CLI Tests

37. **CLI `extension linear install` works independently of repository options endpoint**: Run `echo '{"access_token":"test_token"}' | codeplane extension linear install --team-id T1 --repo-owner owner --repo-name repo --repo-id 1 --credentials-stdin`. Assert the CLI sends a `POST /api/integrations/linear` request with the correct `repo_id`, `repo_owner`, and `repo_name` without ever calling `GET /api/integrations/linear/repositories`.
