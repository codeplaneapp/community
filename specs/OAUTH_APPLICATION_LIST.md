# OAUTH_APPLICATION_LIST

Specification for OAUTH_APPLICATION_LIST.

## High-Level User POV

When a developer has registered one or more OAuth2 applications with Codeplane, they need a single place to see everything they've built. The OAuth2 application list is that place—it lives in the user's settings area and shows every application the user has registered, giving them an at-a-glance inventory of their third-party integrations.

The list presents each application with its human-readable name, its client ID (so the developer can confirm which credentials are deployed where), its client type (confidential or public), the scopes it was registered with, and when it was created. The list is ordered from newest to oldest, so recently created applications are always immediately visible. Critically, client secrets are never shown on this screen—they were displayed once at creation time and cannot be retrieved again.

From this list, the developer can navigate to a specific application to view its full details, update its settings, regenerate a compromised client secret, or delete it entirely. The list also serves as the launching point for creating a new application. When no applications exist yet, the screen guides the user toward creating their first one, providing a clear call-to-action and a link to the OAuth2 documentation.

The application list is available through every major Codeplane client surface: the web UI settings page, the CLI, and the API. This consistency means developers can manage their integrations from whichever tool fits their workflow—whether they're checking their application inventory in a browser, scripting a deployment pipeline, or working from a terminal. The list always reflects the exact same data and ordering regardless of which client is used.

This feature is essential for operational awareness. A developer who has built multiple integrations—a CI bot, a mobile app, and an internal dashboard—needs to be able to quickly see all of them, verify their configurations, and spot any applications that may no longer be needed. Without a list, the developer would have no way to audit their registered applications, identify stale credentials, or locate the right client ID for troubleshooting OAuth2 flows.

## Acceptance Criteria

- **Returns all applications owned by the authenticated user**: The list must include every OAuth2 application registered by the current user, with no omissions and no applications belonging to other users.
- **Ordering**: Results are ordered by `created_at` descending (newest first). This ordering is stable and deterministic.
- **Response shape for each application**:
  - Must include: `id`, `client_id`, `name`, `redirect_uris`, `scopes`, `confidential`, `created_at`, `updated_at`.
  - Must NOT include: `client_secret`, `client_secret_hash`, `owner_id`, or any internal-only field.
- **Empty list case**: When the user has no applications, the API returns an empty JSON array `[]` with HTTP 200. The Web UI shows an empty state with a prompt to create the first application.
- **Authentication required**: Unauthenticated requests receive HTTP 401.
- **No pagination currently required**: The list returns all applications for the user in a single response. Given the expected cardinality (< 100 applications per user), pagination is not a current requirement. If a user has zero applications, an empty array is returned.
- **No filtering or search parameters**: The list endpoint accepts no query parameters for filtering, sorting, or searching. The full list is always returned.
- **client_secret is never exposed**: Under no circumstances may any response from the list endpoint contain a `client_secret` or `client_secret_hash` field.
- **Consistent data across surfaces**: The API, CLI, and Web UI must all display the same application data with the same field names and ordering.
- **Newly created applications appear immediately**: An application created via `POST /api/oauth2/applications` must appear in the subsequent list response without delay or eventual-consistency lag.
- **Deleted applications disappear immediately**: An application deleted via `DELETE /api/oauth2/applications/:id` must no longer appear in the list response.
- **Field data integrity**:
  - `id` is a positive integer.
  - `client_id` is a string of at least 16 characters matching `/^[a-zA-Z0-9_-]+$/`.
  - `name` is a non-empty string, max 255 characters.
  - `redirect_uris` is a non-empty array of valid URL strings.
  - `scopes` is an array of strings (may be empty).
  - `confidential` is a boolean.
  - `created_at` and `updated_at` are valid ISO 8601 datetime strings.
- **Error cases**:
  - No authentication → 401 Unauthorized.
  - Internal server error → 500 with `{ "message": "..." }`.
  - Rate limit exceeded → 429 Too Many Requests.
- **Definition of Done**:
  - The `GET /api/oauth2/applications` endpoint returns the complete list of the authenticated user's OAuth2 applications.
  - The response excludes all secret material.
  - The Web UI renders the application list in the user settings area.
  - The CLI can retrieve and display the list.
  - All E2E tests for happy path, empty state, cross-user isolation, secret exclusion, ordering, and error conditions pass.
  - Documentation covers the list endpoint with examples.

## Design

### API Shape

**Endpoint**: `GET /api/oauth2/applications`

**Authentication**: Required. Session cookie or PAT-based `Authorization` header.

**Request**: No body. No query parameters.

**Success response** (`200 OK`):

```json
[
  {
    "id": 42,
    "client_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    "name": "My CI Bot",
    "redirect_uris": ["https://ci.example.com/callback"],
    "scopes": ["read:repository", "write:repository"],
    "confidential": true,
    "created_at": "2026-03-21T10:00:00.000Z",
    "updated_at": "2026-03-21T10:00:00.000Z"
  },
  {
    "id": 41,
    "client_id": "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5",
    "name": "My Mobile App",
    "redirect_uris": ["myapp://callback"],
    "scopes": ["read:user"],
    "confidential": false,
    "created_at": "2026-03-20T08:30:00.000Z",
    "updated_at": "2026-03-20T08:30:00.000Z"
  }
]
```

**Empty state response** (`200 OK`):

```json
[]
```

**Error responses**:

| Status | Condition | Body shape |
|--------|-----------|------------|
| 401 | No auth | `{ "message": "authentication required" }` |
| 429 | Rate limited | Standard rate limit response |
| 500 | Internal failure | `{ "message": "failed to list oauth2 applications" }` |

### SDK Shape

The `OAuth2Service.listApplications(ownerID: number)` method in `@codeplane/sdk`:

- Accepts the authenticated user's ID.
- Queries `oauth2_applications` filtered by `owner_id`, ordered by `created_at DESC`.
- Maps each database row through `toOAuth2ApplicationResponse()`, which strips `client_secret_hash` and `owner_id` from the output.
- Returns `Promise<OAuth2ApplicationResponse[]>`.

The `OAuth2ApplicationResponse` type:

```typescript
interface OAuth2ApplicationResponse {
  id: number;
  client_id: string;
  name: string;
  redirect_uris: string[];
  scopes: string[];
  confidential: boolean;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}
```

### CLI Command

**Planned dedicated command**:

```bash
codeplane auth oauth2 list
```

Output (default table mode):

```
ID   CLIENT ID                                  NAME             TYPE           SCOPES                              CREATED
42   a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2   My CI Bot        Confidential   read:repository, write:repository   2026-03-21T10:00:00Z
41   f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5   My Mobile App    Public         read:user                           2026-03-20T08:30:00Z
```

When `--json` is passed, the full JSON array is emitted.

When the user has no applications, the table mode prints "No OAuth2 applications found." and JSON mode emits `[]`.

**Current workaround via `codeplane api`**:

```bash
codeplane api /api/oauth2/applications
```

### Web UI Design

**Location**: User Settings → OAuth2 Applications.

**Navigation**: Accessible from the sidebar under settings. The menu item reads "OAuth2 Applications".

**List table**:

| Column | Content | Notes |
|--------|---------|-------|
| Name | Application name, clickable link to detail view | Primary column |
| Client ID | Displayed in monospace with a copy-to-clipboard button | Truncated to first 12 chars with `...` suffix on narrow viewports; full value in tooltip |
| Type | "Confidential" or "Public" badge | Color-differentiated badge |
| Scopes | Comma-separated scope names | Collapsed with "+N more" when more than 3 scopes |
| Created | Relative timestamp (e.g., "3 days ago") | Full ISO 8601 datetime in tooltip |

**Header area**:

- Page title: "OAuth2 Applications"
- Subtitle: "Manage third-party applications you've registered to access Codeplane on behalf of users."
- "New Application" primary button (top-right) that navigates to the creation form.

**Empty state**:

When the user has zero applications:

- Icon or illustration indicating no applications exist.
- Heading: "No OAuth2 applications yet"
- Body text: "Register an application to let third-party software access Codeplane on behalf of users."
- Primary CTA button: "Register your first application"
- Secondary link: "Learn about OAuth2 applications" → links to documentation guide.

**Row actions**:

- Each row has a context menu (three-dot icon) or inline action buttons:
  - "View details" → navigates to `OAUTH_APPLICATION_VIEW`
  - "Delete" → triggers `OAUTH_APPLICATION_DELETE` confirmation flow

**Loading state**:

- Skeleton loader showing 3 placeholder rows while the API request is in flight.

**Error state**:

- If the API returns a server error, display an error banner: "Failed to load your applications. Please try again." with a "Retry" button.

**Responsive behavior**:

- On narrow viewports, the Scopes and Created columns are hidden. The Client ID column is truncated.
- The list remains fully functional on mobile with a stacked card layout.

### Documentation

1. **OAuth2 Applications Guide** (`docs/guides/oauth2-applications.mdx`): The existing "Managing Applications > List Your Applications" section already covers the list endpoint with a curl example and response shape. It should be verified to match the current API contract exactly, including:
   - Correct endpoint path: `GET /api/oauth2/applications`
   - Complete response field set
   - Explicit note that `client_secret` is never included in list responses

2. **API Reference** (`docs/api-reference/` or `docs/openapi.yaml`): Formal OpenAPI entry for `GET /api/oauth2/applications` documenting:
   - Authentication requirement
   - Response schema (array of `OAuth2ApplicationResponse`)
   - All error status codes
   - Example curl command and example response

3. **CLI Reference** (`docs/cli-reference/commands.mdx`): Document `codeplane auth oauth2 list` with:
   - Description of the command
   - Output format (table and `--json`)
   - Empty state behavior
   - Example output

## Permissions & Security

### Authorization Roles

| Role | Can List Own OAuth2 Applications |
|------|----------------------------------|
| Authenticated user | Yes — sees only their own applications |
| Unauthenticated / Anonymous | No (401 Unauthorized) |
| Admin | Yes — sees only their own applications (same as any user; admin does not gain cross-user visibility through this endpoint) |

This is a user-scoped read operation. The query is always filtered by the authenticated user's `owner_id`. There is no mechanism to list another user's applications.

### Cross-User Isolation

- The database query includes a `WHERE owner_id = $1` clause that is always populated from the authenticated user's session.
- The owner ID is never sourced from query parameters, path parameters, or request body.
- No admin override exists for listing another user's applications through this endpoint.

### Rate Limiting

- **List rate limit**: Standard API rate limiting applies (same as other read endpoints). The global rate limiter covers this endpoint.
- **No elevated per-endpoint rate limit required**: The list endpoint is a lightweight read operation with no external side effects.
- **Abuse prevention**: If automated tooling polls the list endpoint excessively, the global rate limiter returns 429.

### Data Privacy & PII

- **Client secret exclusion**: The `toOAuth2ApplicationResponse()` mapper explicitly omits `client_secret_hash` from the response. This is the critical security boundary.
- **Application names may contain PII**: Application names are user-supplied and may include personal or organizational identifiers. They are only visible to the owning user through this endpoint.
- **No cross-user data leakage**: The endpoint cannot return applications belonging to other users, regardless of application IDs provided.
- **Audit logging**: Read-only list requests should be logged at `debug` level (not `info`), as they do not mutate state and would generate excessive noise.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `oauth2_applications_listed` | Successful list response returned | `user_id`, `application_count` (number of applications returned), `source` (`web`, `cli`, `api`), `timestamp` |
| `oauth2_applications_list_failed` | List request failed | `user_id`, `error_code` (`unauthorized`, `rate_limited`, `internal_error`), `source`, `timestamp` |
| `oauth2_applications_empty_state_viewed` | User views the list and has zero applications | `user_id`, `source`, `timestamp` |
| `oauth2_applications_empty_state_cta_clicked` | User clicks the "Register your first application" CTA from the empty state | `user_id`, `timestamp` |

### Funnel Metrics

1. **Empty-to-first-app conversion**: Users who see the empty state → users who create their first application within 7 days. Indicates whether the empty state UX effectively guides users to registration.
2. **List-to-detail navigation rate**: `oauth2_applications_listed` (with count > 0) → `oauth2_application_viewed`. Indicates whether users are actively managing their applications after listing them.
3. **Application inventory growth**: Average `application_count` per `oauth2_applications_listed` event over time. Tracks ecosystem growth.
4. **List endpoint error rate**: `oauth2_applications_list_failed` / total list attempts. Should stay below 0.1%.
5. **Active developers**: Unique users who invoke the list endpoint at least once per month. Proxy for the size of the third-party developer community.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------|  
| OAuth2 applications listed successfully | `debug` | `user_id`, `application_count`, `request_id`, `duration_ms` |
| OAuth2 applications list — unauthenticated attempt | `warn` | `request_id`, `source_ip` |
| OAuth2 applications list — internal error | `error` | `user_id`, `request_id`, `error_message`, `stack_trace` |
| OAuth2 applications list — rate limited | `warn` | `user_id`, `request_id` |

**Critical logging rules**:
- The list endpoint should NOT log at `info` level on success. It is a high-frequency read operation and `debug` level prevents log flooding.
- No application `client_id` values should appear in logs at `info` or higher level. They may appear at `debug` level for debugging purposes only.
- All log entries must include the `request_id` for correlation.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_oauth2_applications_list_total` | Counter | `status` (`success`, `error`) | Total list endpoint invocations |
| `codeplane_oauth2_applications_list_duration_seconds` | Histogram | — | Latency of the list endpoint (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0) |
| `codeplane_oauth2_applications_list_result_count` | Histogram | — | Distribution of application counts returned per list call (buckets: 0, 1, 5, 10, 25, 50, 100) |
| `codeplane_oauth2_applications_list_errors_total` | Counter | `error_type` (`unauthorized`, `rate_limit`, `internal`) | Total failed list attempts by error type |

### Alerts

#### Alert: OAuth2 Application List Internal Error Rate

**Condition**: `rate(codeplane_oauth2_applications_list_errors_total{error_type="internal"}[5m]) > 0.5`

**Severity**: Critical

**Runbook**:
1. Check server logs for `error`-level entries matching "OAuth2 applications list — internal error" in the last 15 minutes. Extract the `error_message` and `stack_trace`.
2. Verify database connectivity: execute `SELECT 1` against the primary database. If the database is unreachable, follow the database recovery runbook.
3. Check if the `oauth2_applications` table exists and has the expected schema: `\d oauth2_applications`. Look for missing columns or index corruption.
4. Check database connection pool utilization. If exhausted, investigate connection leaks or increase pool size.
5. If the error originates from the `toOAuth2ApplicationResponse` mapper (e.g., unexpected null values), investigate recent data migrations or inserts that may have violated column constraints.
6. Restart the server process if all infrastructure checks pass and the error persists. Monitor for recurrence over the next 15 minutes.

#### Alert: OAuth2 Application List Latency Spike

**Condition**: `histogram_quantile(0.99, rate(codeplane_oauth2_applications_list_duration_seconds_bucket[5m])) > 1.0`

**Severity**: Warning

**Runbook**:
1. Check database query latency: look for slow queries in the PostgreSQL slow query log involving `oauth2_applications` with `WHERE owner_id`.
2. Verify the index on `oauth2_applications(owner_id)` exists and is not bloated: `SELECT pg_size_pretty(pg_relation_size('idx_oauth2_applications_owner_id'))`.
3. Check connection pool utilization and active connections.
4. If the issue correlates with a specific user having an unusually large number of applications (> 100), consider adding pagination as a follow-up.
5. Check system CPU and memory utilization on the server host.

#### Alert: Elevated Unauthenticated Access Attempts

**Condition**: `rate(codeplane_oauth2_applications_list_errors_total{error_type="unauthorized"}[15m]) > 5.0`

**Severity**: Warning

**Runbook**:
1. Check server logs for source IPs generating unauthenticated requests to the list endpoint.
2. Determine if this is a misconfigured client (e.g., expired PAT in a CI pipeline) or a credential scanning/probing attack.
3. If a single IP is responsible, consider temporary IP-level rate limiting or blocking via the network layer.
4. If the pattern is distributed, verify the global rate limiter is functioning correctly and is catching these requests.
5. No user data is at risk (401 responses reveal no application data), but sustained probing should be monitored.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Recovery | User-Facing Message |
|------------|-------------|----------|---------------------|
| Not authenticated | 401 | Authenticate first | "authentication required" |
| Rate limit exceeded | 429 | Wait and retry | Standard rate limit response |
| Database query failure | 500 | Automatic retry; escalate if persistent | "failed to list oauth2 applications" |
| Response serialization failure | 500 | Investigate data integrity | "failed to list oauth2 applications" |
| Database connection timeout | 500 | Retry; check pool health | "failed to list oauth2 applications" |

## Verification

### API Integration Tests

1. **Happy path: list applications with existing apps** — Create 2 applications via POST, then GET `/api/oauth2/applications`. Assert HTTP 200, response is an array of length ≥ 2, and both created applications appear with matching `id`, `client_id`, `name`, `redirect_uris`, `scopes`, `confidential`, `created_at`, `updated_at`.

2. **Empty list** — Create a fresh user with no applications. GET `/api/oauth2/applications`. Assert HTTP 200, response is `[]`.

3. **Ordering: newest first** — Create application A, wait 1 second, create application B. GET the list. Assert application B appears before application A (index 0 before index 1). Assert `created_at` of the first element is greater than or equal to `created_at` of the second.

4. **client_secret is excluded** — Create an application. GET the list. For every entry in the array, assert that `client_secret` is `undefined` and `client_secret_hash` is `undefined`.

5. **All required fields present** — GET the list. For each entry, assert presence and correct type of: `id` (number), `client_id` (string), `name` (string), `redirect_uris` (array of strings), `scopes` (array of strings), `confidential` (boolean), `created_at` (string), `updated_at` (string).

6. **owner_id is excluded** — GET the list. For each entry, assert that `owner_id` is not present in the response object.

7. **Cross-user isolation** — User A creates 2 applications. User B creates 1 application. User A lists their applications: assert only User A's 2 applications appear. User B lists their applications: assert only User B's 1 application appears.

8. **Newly created application appears immediately** — Create an application, immediately GET the list, assert the new application is present with the correct `id`.

9. **Deleted application disappears immediately** — Create an application, delete it, GET the list, assert the deleted application's `id` does not appear.

10. **created_at and updated_at are valid ISO 8601** — GET the list. For each entry, parse `created_at` and `updated_at` as `Date` objects. Assert both parse without error and produce valid timestamps.

11. **Unauthenticated request returns 401** — GET `/api/oauth2/applications` without any auth cookie or token. Assert HTTP 401 with `{ "message": "authentication required" }`.

12. **Response is always an array** — GET the list. Assert `Array.isArray(body)` is `true`, even when only one application exists.

13. **redirect_uris preserved exactly** — Create an application with `redirect_uris: ["https://app.example.com/callback?source=codeplane&env=prod"]`. GET the list. Assert the redirect URI appears exactly as submitted, including query parameters.

14. **Scopes preserved and normalized** — Create an application with scopes `["read:repository", "write:user"]`. GET the list. Assert the scopes array matches exactly.

15. **Empty scopes array preserved** — Create an application with `scopes: []`. GET the list. Assert the application's `scopes` field is `[]`.

16. **Multiple redirect URIs preserved** — Create an application with 5 redirect URIs. GET the list. Assert all 5 URIs appear in the correct order.

17. **Application with maximum name length (255 chars)** — Create with a 255-character name. GET the list. Assert the application appears with the full 255-character name intact.

18. **Name with special characters** — Create with `name: "My App (v2) — «Beta» & 日本語"`. GET the list. Assert the name is preserved exactly.

19. **Confidential and public applications coexist** — Create one confidential and one public application. GET the list. Assert both appear with correct `confidential` values (`true` and `false`).

20. **Large number of applications** — Create 50 applications. GET the list. Assert the response contains all 50 and has HTTP 200 (not a timeout or pagination cutoff).

### CLI Integration Tests

21. **CLI list via `codeplane api` wrapper** — Execute `codeplane api /api/oauth2/applications`. Assert exit code 0 and stdout parses as a JSON array.

22. **CLI list contains created application** — Create an application via the API, then list via CLI. Assert the created application appears in the output.

23. **CLI list excludes client_secret** — List via CLI, parse the JSON output, and assert no entry contains a `client_secret` field.

24. **CLI list after deletion** — Create, delete, then list. Assert the deleted application does not appear.

25. **CLI list empty state** — For a user with no applications, execute the list command. Assert exit code 0, output is `[]` (or appropriate empty message in table mode).

### E2E / Playwright UI Tests

26. **Navigate to OAuth2 Applications settings** — Sign in, navigate to User Settings → OAuth2 Applications. Assert the page title "OAuth2 Applications" is visible and the "New Application" button is present.

27. **Empty state rendering** — For a user with no applications, assert the empty state message "No OAuth2 applications yet" is visible, the "Register your first application" CTA button is visible, and the documentation link is present.

28. **Empty state CTA navigates to creation form** — Click the "Register your first application" button. Assert the creation form or creation page is displayed.

29. **Application list renders after creation** — Create an application (via API or UI), navigate to the list page. Assert the application name, truncated client ID, type badge, and relative timestamp are all visible.

30. **Client ID copy button works** — Click the copy-to-clipboard button next to a client ID. Assert the clipboard contains the full client ID value.

31. **Multiple applications render in correct order** — Create application A, then B. Navigate to the list. Assert B appears above A in the list.

32. **Client secret not visible on list page** — With at least one application, inspect the rendered page. Assert no element contains a client secret value or a "client_secret" label.

33. **Row action: View details** — Click "View details" from a row's context menu. Assert navigation to the application detail view for that application.

34. **Row action: Delete** — Click "Delete" from a row's context menu. Assert a confirmation dialog appears. Cancel and verify the application remains. Confirm and verify the application disappears from the list.

35. **Error state rendering** — Simulate a server error (e.g., via network interception). Assert the error banner "Failed to load your applications. Please try again." is visible with a "Retry" button.

36. **Retry after error** — After the error state is displayed, restore the network, click "Retry". Assert the application list loads successfully.

37. **Loading state rendering** — Navigate to the list page and assert skeleton loader placeholders are visible before the data loads.

38. **Type badge correctness** — Create one confidential and one public application. Navigate to the list. Assert one row shows a "Confidential" badge and the other shows a "Public" badge.

### Security Tests

39. **Cross-user isolation via API** — User A creates applications. Log in as User B. GET `/api/oauth2/applications`. Assert User A's applications do not appear.

40. **Unauthenticated UI access** — Navigate to the OAuth2 Applications settings page without being logged in. Assert redirect to login page (not a 200 with empty content).

41. **Response does not leak secret hashes** — GET the list, inspect the raw HTTP response body. Assert neither `client_secret_hash` nor `client_secret` appear anywhere in the response text.

42. **SQL injection in owner_id is impossible** — The owner ID is sourced from the authenticated session, not from user input. Verify via the test that the query parameterization is correct and no user-supplied value can influence the owner filter.
