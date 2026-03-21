# ORG_MEMBER_LIST

Specification for ORG_MEMBER_LIST.

## High-Level User POV

When you belong to an organization on Codeplane, you can view the complete roster of members in that organization. This member list is accessible from the web UI's organization settings, the CLI, or the TUI, and it serves as the definitive directory of everyone who belongs to the organization.

Each member entry shows their username, display name, avatar, and their role within the organization — either "owner" or "member." The list is paginated so that organizations with many members remain easy to browse without overwhelming the screen. Whether you are an organization owner managing who has access or a regular member checking who else is in your organization, the experience is the same: a clear, scannable directory of every person in the organization.

From the CLI, running `codeplane org member list <org>` gives you the same member data as structured JSON, making it straightforward to script membership audits, pipe member lists into other tools, or quickly check the team composition from the terminal. The TUI provides a browsable member list within the organization detail screen.

This feature is scoped to authenticated organization members. You must be a member of the organization to see its member list. If you are not part of the organization, the member list is not visible to you. The list does not expose sensitive user details like email addresses, admin status, or login timestamps. It shows only the public-facing identity of each member alongside their organizational role.

The organization member list is a companion to the organization settings and profile views. From it, organization owners can add or remove members and understand the ownership structure. Regular members use it to discover who else is in the organization, which is the starting point for team assignment, collaboration, and understanding who has what level of access within the organization.

## Acceptance Criteria

### Definition of Done

The feature is complete when any authenticated organization member can retrieve a paginated list of all members belonging to that organization, receiving consistent results across API, CLI, TUI, and web UI. Each member entry includes their user identity and organization role. Pagination, empty states, error handling, and response shape are consistent across all surfaces. Unauthenticated requests are rejected with 401. Non-members of the organization are rejected with 403. Nonexistent organizations return 404.

### Functional Constraints

- [ ] The endpoint requires authentication. Unauthenticated requests return `401` with `"authentication required"`.
- [ ] The viewer must be a member of the specified organization (role `"owner"` or `"member"`). Non-members receive `403` with `"insufficient organization permissions"`.
- [ ] The organization name is resolved case-insensitively.
- [ ] If the organization does not exist, the endpoint returns `404` with `"organization not found"`.
- [ ] Each item in the response includes exactly these fields: `id`, `username`, `display_name`, `avatar_url`, `role`.
- [ ] The `role` field is one of `"owner"` or `"member"`.
- [ ] The response never includes internal user fields such as `email`, `lower_email`, `lower_username`, `bio`, `wallet_address`, `user_type`, `is_active`, `is_admin`, `prohibit_login`, `email_notifications_enabled`, `last_login_at`, `created_at`, `updated_at`, `search_vector`.
- [ ] Members are ordered by `id` ascending (deterministic, creation-order pagination).
- [ ] Default page size is 30 items.
- [ ] Maximum page size is 100 items. Requests for `per_page` exceeding 100 return `400 Bad Request` with `"per_page must not exceed 100"`. Requests for `limit` exceeding 100 are silently clamped to 100.
- [ ] The response includes an `X-Total-Count` header containing the total number of members in the organization.
- [ ] The response includes standard `Link` pagination headers (`rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"`) when applicable.
- [ ] If the organization has zero members (edge case — the creator/owner should always be present), the endpoint returns `200` with an empty array `[]` and `X-Total-Count: 0`.
- [ ] Pagination beyond the last page returns `200` with an empty array (not 404).
- [ ] Both legacy pagination (`?page=N&per_page=M`) and cursor-based pagination (`?cursor=N&limit=M`) work.
- [ ] The endpoint supports PAT-based authentication in addition to session cookies.
- [ ] The `display_name` field defaults to an empty string `""` if the user has not set a display name.
- [ ] The `avatar_url` field defaults to an empty string `""` if the user has no avatar.

### Boundary Constraints

- [ ] **`id` in response:** Positive integer.
- [ ] **`username` in response:** 1–39 characters, `[a-zA-Z0-9-]`. May not start or end with a hyphen. May not contain consecutive hyphens.
- [ ] **`display_name` in response:** 0–255 characters. May contain Unicode. Empty string if not set.
- [ ] **`avatar_url` in response:** 0–2048 characters. Valid URL or empty string.
- [ ] **`role` in response:** Exactly `"owner"` or `"member"`.
- [ ] **`page` parameter:** Positive integer >= 1. Values <= 0 return `400 Bad Request` with `"invalid page value"`.
- [ ] **`per_page` parameter:** Integer 1–100. Values > 100 return `400 Bad Request`. Values <= 0 return `400 Bad Request` with `"invalid per_page value"`.
- [ ] **`limit` parameter:** Integer 1–100. Values > 100 are clamped to 100. Values <= 0 return `400 Bad Request` with `"invalid limit value"`.
- [ ] **`cursor` parameter:** String-encoded non-negative integer offset. Negative values or non-numeric values are treated as offset 0.
- [ ] **Organization name in URL:** 1–255 characters. Case-insensitive resolution. Empty or whitespace-only returns `400` with `"organization name is required"`.

### Edge Cases

- [ ] An organization with exactly one member (the owner) returns an array of length 1.
- [ ] An organization with 101 members returns exactly 30 on the first page (default) and appropriate pagination headers.
- [ ] Requesting `?page=2&per_page=100` when there are 50 total members returns an empty array with `X-Total-Count: 50`.
- [ ] Requesting `?per_page=200` returns `400 Bad Request` with `"per_page must not exceed 100"`.
- [ ] Requesting `?limit=200` clamps to 100 (not rejected).
- [ ] A member with an empty display name returns `display_name: ""`.
- [ ] A member with no avatar returns `avatar_url: ""`.
- [ ] A member whose display name contains emoji, CJK, or accented characters returns with correct encoding.
- [ ] Two rapid consecutive identical requests return identical results (idempotency).
- [ ] An expired or revoked PAT returns `401` (not `200` with an empty list).
- [ ] A user who was removed from the organization no longer appears in the list on the next request.
- [ ] A user who is added to the organization appears in the list on the next request.
- [ ] Requesting members for an organization whose name differs only by case returns the same result (e.g., `Acme` vs `acme`).
- [ ] The same user cannot appear more than once in the response (no duplicate entries).
- [ ] Both owners and regular members appear in the list, distinguished by their `role` field.
- [ ] The organization creator/owner always appears in the list with role `"owner"`.

## Design

### API Shape

#### `GET /api/orgs/:org/members`

**Description:** Retrieve a paginated list of all members belonging to an organization, including their roles.

**Authentication:** Required. Session cookie or PAT `Authorization` header.

**Path parameters:**

| Parameter | Type   | Description                           |
|-----------|--------|---------------------------------------|
| `org`     | string | Organization name (case-insensitive)  |

**Query parameters (legacy pagination):**

| Parameter  | Type    | Default | Description                        |
|------------|---------|---------|------------------------------------|n| `page`     | integer | 1       | Page number (1-indexed)            |
| `per_page` | integer | 30      | Items per page (max 100)           |

**Query parameters (cursor pagination):**

| Parameter | Type    | Default | Description                        |
|-----------|---------|---------|------------------------------------|n| `cursor`  | string  | `"0"`   | String-encoded offset              |
| `limit`   | integer | 30      | Items per page (max 100)           |

**Success response — `200 OK`:**

```json
[
  {
    "id": 1,
    "username": "alice",
    "display_name": "Alice Chen",
    "avatar_url": "https://codeplane.example.com/avatars/alice.png",
    "role": "owner"
  },
  {
    "id": 42,
    "username": "bob",
    "display_name": "",
    "avatar_url": "",
    "role": "member"
  }
]
```

**Response headers:**

| Header          | Description                                                                                       |
|-----------------|---------------------------------------------------------------------------------------------------|
| `Content-Type`  | `application/json`                                                                                |
| `X-Total-Count` | Total number of members in the organization                                                       |
| `Link`          | Standard pagination `Link` header with `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"` as applicable |

**Error responses:**

| Status                 | Condition                                        | Body                                                    |
|------------------------|--------------------------------------------------|---------------------------------------------------------|
| `400 Bad Request`      | Organization name empty or whitespace-only       | `{ "message": "organization name is required" }`        |
| `400 Bad Request`      | Invalid page parameter                           | `{ "message": "invalid page value" }`                   |
| `400 Bad Request`      | Invalid per_page parameter                       | `{ "message": "invalid per_page value" }`               |
| `400 Bad Request`      | per_page exceeds 100                             | `{ "message": "per_page must not exceed 100" }`         |
| `400 Bad Request`      | Invalid limit parameter                          | `{ "message": "invalid limit value" }`                  |
| `401 Unauthorized`     | No valid session or token                        | `{ "message": "authentication required" }`              |
| `403 Forbidden`        | Authenticated user is not an org member          | `{ "message": "insufficient organization permissions" }`|
| `404 Not Found`        | Organization does not exist                      | `{ "message": "organization not found" }`               |
| `429 Too Many Requests`| Rate limit exceeded                              | `{ "message": "rate limit exceeded" }` with `Retry-After` header |

### SDK Shape

The SDK `OrgService` exposes:

```typescript
listOrgMembers(
  viewer: User | null,
  orgName: string,
  page: number,
  perPage: number,
): Promise<Result<{ items: ListOrgMembersRow[]; total: number }, APIError>>
```

Where the returned `ListOrgMembersRow[]` is mapped in the route layer to:

```typescript
interface OrgMemberResponse {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  role: string;
}
```

The method:
1. Validates `viewer` is non-null (returns `unauthorized` otherwise).
2. Resolves the organization by name case-insensitively (returns `404` if not found).
3. Validates the viewer has `"owner"` or `"member"` role in the organization (returns `403` if not).
4. Normalizes pagination parameters: clamp page >= 1, clamp perPage to 1–100, default 30.
5. Queries `listOrgMembers` with `ORDER BY u.id ASC` and LIMIT/OFFSET.
6. Counts total org members via `countOrgMembers`.
7. Maps each database row to `{ id, username, display_name, avatar_url, role }`.
8. Returns `{ items, total }`.

### CLI Command

#### `codeplane org member list`

**Description:** List members in an organization.

**Authentication:** Required. Uses the stored CLI session token.

**Arguments:**

| Argument | Type   | Required | Description          |
|----------|--------|----------|----------------------|
| `org`    | string | Yes      | Organization name    |

**Output (JSON, default):**

```json
[
  {
    "id": 1,
    "username": "alice",
    "display_name": "Alice Chen",
    "avatar_url": "https://codeplane.example.com/avatars/alice.png",
    "role": "owner"
  },
  {
    "id": 42,
    "username": "bob",
    "display_name": "",
    "avatar_url": "",
    "role": "member"
  }
]
```

**Output (human-readable, with table formatting):**

```
Username    Display Name    Role      Avatar
alice       Alice Chen      owner     https://codeplane.example.com/avatars/alice.png
bob                         member
```

**Empty state:** When the organization has no members (unlikely, as the creator is always an owner), JSON output returns `[]`.

**Error behavior:**
- Running without authentication -> non-zero exit code, stderr: `Error: authentication required`
- Running with a nonexistent org -> non-zero exit code, stderr: `Error: organization not found`
- Running as a non-member of the org -> non-zero exit code, stderr: `Error: insufficient organization permissions`

### TUI UI

The TUI should include an organization members view accessible from the organization detail screen:

```
+-- Organization Members: acme-corp ----------------------------------+
|                                                                      |
|  [crown] alice       Alice Chen                          owner       |
|  [user]  bob         Bob Smith                           member      |
|  [user]  charlie     Charlie Garcia                      member      |
|                                                                      |
|  3 members total  Page 1 of 1                                        |
+----------------------------------------------------------------------+
```

- Each member row shows: role icon (crown for owner, user for member), username (bold), display name (dimmed), role badge.
- Pressing Enter on a member navigates to the user's profile view.
- Left/right arrow keys or `[` / `]` navigate pages when there are multiple pages.
- The total member count is shown at the bottom.
- Empty state: `"This organization has no members yet."`

### Web UI Design

**Location:** Organization Settings -> Members tab (`/:org/-/settings/members`)

**Layout:**

- **Section heading:** "Members" with a count badge showing the total number of members (e.g., "Members (12)").
- **Add member button:** Visible only to organization owners. A "Add member" action in the section header. Opens a search/autocomplete dropdown for adding new users to the organization.
- **Role filter:** Optional dropdown filter to show "All", "Owners", or "Members" only.
- **Member list:** Each member is displayed as a row/card with:
  - **Avatar:** User's avatar image (circular, 32px), with a default placeholder if no avatar is set.
  - **Username** (bold, primary text): Clickable link to the user's profile at `/:username`.
  - **Display name** (secondary text, dimmed): Shown beside or below the username. Omitted if empty.
  - **Role badge:** A styled badge showing "Owner" or "Member". Owners get a distinct color (e.g., amber/gold).
  - **Actions dropdown (owner-only):** Visible only to organization owners. Contains "Change role" and "Remove member" actions. "Remove member" is a destructive action with confirmation.
- **Pagination controls:** Below the list with page numbers and prev/next buttons. Hidden when there is only one page.
- **Empty state:** When the organization has no members beyond the viewer, show a centered message: "No other members yet." with an "Invite member" call-to-action button (visible only to owners).
- **Loading state:** A skeleton loader matching the row layout while the API call is in flight.
- **Error state:** If the API call fails, show an inline error banner: "Failed to load organization members. Please try again." with a retry button.

**Interactions:**

- The list refreshes automatically after a member is added or removed (no manual page reload required).
- Clicking the "Remove member" action opens a confirmation modal: "Remove '[username]' from organization '[org name]'? They will lose access to all organization repositories and teams." with "Cancel" and "Remove" buttons.
- The confirmation modal warns if the user being removed is an owner.
- Avatars that fail to load fall back to a default silhouette placeholder.
- Cannot remove the last owner — the remove action is disabled with tooltip: "Cannot remove the last organization owner."

### Documentation

The following end-user documentation should be written:

1. **API Reference — List Organization Members:** Document `GET /api/orgs/:org/members` with request/response examples, pagination headers, error codes, and field descriptions. Include notes on both legacy and cursor pagination styles. Note the authentication and authorization requirements (must be an org member). Include the `role` field semantics.

2. **CLI Reference — `codeplane org member list`:** Document the command with output examples in both JSON and human-readable formats. Document the `org` argument. Document error behavior for unauthenticated sessions, nonexistent orgs, and unauthorized access.

3. **User Guide — Managing Organization Members:** A section within the organization management guide explaining how to view organization members from the web UI, CLI, and TUI. Include guidance on pagination for large organizations, understanding owner vs. member roles, and links to the member add/remove documentation.

## Permissions & Security

### Authorization Model

| Role                              | Can list org members?                                                                 |
|-----------------------------------|---------------------------------------------------------------------------------------|
| Anonymous (unauthenticated)       | No — returns 401                                                                      |
| Authenticated non-org-member      | No — returns 403 with `"insufficient organization permissions"`                       |
| Org member (role: `member`)       | Yes — can see all members and their roles within the org                               |
| Org owner (role: `owner`)         | Yes — can see all members and their roles within the org                               |
| PAT-authenticated org member      | Yes — same access as session-authenticated org member                                  |
| Instance admin (not org member)   | No — org membership is required; instance admin alone does not grant org-scoped access  |

This endpoint is scoped to the organization. It never returns members of other organizations. An org member can see the full roster of the organization they belong to, including all owners and members.

### Rate Limiting

- **Authenticated callers:** 300 requests per minute per token/session.
- **Rate limit response:** `429 Too Many Requests` with `Retry-After` header indicating seconds until reset.
- Rate limiting is enforced at the middleware layer, shared with other organization-scoped endpoints.
- Since this endpoint requires authentication, anonymous rate limits do not apply.

### Data Privacy Constraints

- **Membership-scoped:** The SQL query joins `org_members` to `users` filtered by organization ID. Only users assigned to the specified organization are returned.
- **No internal fields exposed:** The `OrgMemberResponse` mapping explicitly selects only five fields: `id`, `username`, `display_name`, `avatar_url`, `role`. Internal user fields such as `email`, `lower_email`, `bio`, `wallet_address`, `is_active`, `is_admin`, `prohibit_login`, `email_notifications_enabled`, `last_login_at`, `created_at`, `updated_at`, and `search_vector` are never included in the response.
- **No cross-org visibility:** The endpoint resolves the org and validates membership before querying members. A user in one org cannot see members of another org.
- **No PII exposure:** The response contains only public-facing user identity (username, display name, avatar URL) and organizational role. No email addresses, IP addresses, login history, or administrative flags are included.
- **Avatar URL safety:** Avatar URLs are user-controlled and may point to external resources. Clients should treat them as untrusted content.
- **Role visibility:** The `role` field (`"owner"` or `"member"`) is visible to all org members. This is intentional — understanding the ownership structure is part of organizational transparency.

## Telemetry & Product Analytics

### Key Business Events

| Event Name                   | When Fired                                                              | Properties                                                                                               |
|------------------------------|-------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| `OrgMemberListViewed`        | On successful 200 response from `GET /api/orgs/:org/members`           | `user_id`, `org_name`, `client` (web/cli/tui/api/desktop/vscode/neovim), `response_time_ms`, `result_count`, `total_count`, `page`, `per_page` |
| `OrgMemberListEmpty`         | On successful 200 response with zero results and page 1                 | `user_id`, `org_name`, `client`                                                                          |
| `OrgMemberListPaginated`     | On successful 200 response with page > 1                                | `user_id`, `org_name`, `client`, `page`, `per_page`, `total_count`                                      |
| `OrgMemberListUnauthorized`  | On 401 response                                                         | `client`, `client_ip` (hashed), `auth_method_attempted` (cookie/pat/none)                                |
| `OrgMemberListForbidden`     | On 403 response                                                         | `user_id`, `org_name`, `client`                                                                          |
| `OrgMemberListNotFound`      | On 404 response                                                         | `user_id`, `org_name`, `client`                                                                          |

### Event Properties

- `user_id` (number): The authenticated user's ID.
- `org_name` (string): The organization name from the request path.
- `client` (string enum): One of `"web"`, `"cli"`, `"tui"`, `"api"`, `"desktop"`, `"vscode"`, `"neovim"`.
- `response_time_ms` (number): Server-side response latency in milliseconds.
- `result_count` (number): Number of items returned in this page.
- `total_count` (number): Total number of members in the organization.
- `page` (number): Current page number.
- `per_page` (number): Page size used.
- `client_ip` (string): Hashed IP address for 401 analysis (never stored as raw IP).
- `auth_method_attempted` (string enum): One of `"cookie"`, `"pat"`, `"none"`.

### Funnel Metrics and Success Indicators

- **Org member list view volume:** Total `OrgMemberListViewed` events per day, segmented by client. Indicates whether users actively review organization composition.
- **Empty org rate:** Ratio of `OrgMemberListEmpty` to total `OrgMemberListViewed` on page 1. Should be near zero since org creation always adds the creator as owner.
- **Pagination depth:** Distribution of `page` values from `OrgMemberListPaginated` events. A heavy tail indicates large organizations.
- **Org member list -> member profile click-through rate (web only):** Percentage of `OrgMemberListViewed` events followed by a user profile view event within the same session.
- **Org member list -> add/remove action rate (web only):** Percentage of `OrgMemberListViewed` events by org owners that lead to an add or remove action within the same session. Indicates the list is used for management, not just browsing.
- **CLI vs web split:** Client distribution of `OrgMemberListViewed`. Tracks CLI adoption for org administration.
- **Forbidden attempt rate:** Volume of `OrgMemberListForbidden` events. Sustained spikes may indicate users trying to access orgs they are not members of — potential UX issue with navigation or permissions messaging.
- **Not found rate:** Volume of `OrgMemberListNotFound` events. High rates may indicate broken links, stale bookmarks, or recently deleted organizations.
- **Owner-to-member ratio:** Average ratio of owners to total members per org from `OrgMemberListViewed` events. Useful for understanding org governance patterns.

## Observability

### Logging Requirements

| Log Point                                     | Level   | Structured Fields                                                       | Condition                               |
|-----------------------------------------------|---------|-------------------------------------------------------------------------|------------------------------------------|
| Org member list request received              | `DEBUG` | `user_id`, `request_id`, `org_name`, `page`, `per_page`                | Every authenticated request              |
| Org member list succeeded                     | `INFO`  | `user_id`, `request_id`, `org_name`, `duration_ms`, `result_count`, `total_count` | 200 response                  |
| Org member list unauthorized                  | `WARN`  | `request_id`, `client_ip`, `auth_method_attempted`                      | 401 response                             |
| Org member list forbidden                     | `WARN`  | `user_id`, `request_id`, `org_name`                                     | 403 response                             |
| Org member list not found                     | `INFO`  | `user_id`, `request_id`, `org_name`                                     | 404 (org not found)                      |
| Org member list bad request                   | `WARN`  | `request_id`, `user_id`, `reason`                                       | 400 response                             |
| Org member list internal error                | `ERROR` | `user_id`, `request_id`, `error_message`, `stack_trace`                 | 500 response                             |
| Rate limit exceeded on org member list        | `WARN`  | `user_id`, `request_id`, `rate_limit_bucket`                            | 429 response                             |
| Pagination per_page clamped                   | `DEBUG` | `user_id`, `request_id`, `requested_limit`, `clamped_limit`             | When limit > 100 is clamped              |
| Pagination page normalized                    | `DEBUG` | `user_id`, `request_id`, `requested_page`, `normalized_page`            | When page <= 0 is normalized to 1        |

### Prometheus Metrics

| Metric                                                   | Type      | Labels                                          | Description                                                      |
|----------------------------------------------------------|-----------|-------------------------------------------------|------------------------------------------------------------------|
| `codeplane_org_member_list_requests_total`               | Counter   | `status` (200, 400, 401, 403, 404, 429, 500), `client` | Total org member list requests                          |
| `codeplane_org_member_list_request_duration_seconds`     | Histogram | `status`                                        | Response latency distribution (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_org_member_list_result_count`                 | Histogram | —                                               | Distribution of result counts per page (buckets: 0, 1, 5, 10, 20, 30, 50, 100) |
| `codeplane_org_member_list_total_count`                  | Histogram | —                                               | Distribution of total org member counts per query (buckets: 0, 1, 2, 5, 10, 25, 50, 100, 500, 1000) |
| `codeplane_org_member_list_unauthorized_total`           | Counter   | `auth_method_attempted`                         | Total 401s on org member list requests                           |
| `codeplane_org_member_list_forbidden_total`              | Counter   | —                                               | Total 403s (non-org-member access attempts)                      |
| `codeplane_org_member_list_not_found_total`              | Counter   | —                                               | Total 404s on org member list requests                           |

### Alerts

#### Alert: Org Member List Endpoint Elevated Latency

**Condition:** `histogram_quantile(0.99, rate(codeplane_org_member_list_request_duration_seconds_bucket[5m])) > 1.0` sustained for 5 minutes.

**Severity:** Warning

**Runbook:**
1. Check database connection pool health via `SELECT count(*) FROM pg_stat_activity;`.
2. Check if slow queries exist via `pg_stat_statements` for `listOrgMembers` and `countOrgMembers` queries.
3. Verify the `org_members.organization_id` column has an index. Run `EXPLAIN ANALYZE` on the listing query with a known organization_id.
4. Check if an organization with an unusually large number of members is being queried repeatedly, causing large OFFSET scans. Inspect the `codeplane_org_member_list_total_count` histogram for outliers.
5. Check if the server is under memory pressure or CPU contention from concurrent requests.
6. Verify the `JOIN users u ON u.id = om.user_id` path is using an index on `users.id` (primary key).
7. If the problem is OFFSET-based pagination degradation for deep pages: consider adding keyset pagination using `(u.id)` as the cursor key.

#### Alert: Org Member List Endpoint 5xx Spike

**Condition:** `rate(codeplane_org_member_list_requests_total{status="500"}[5m]) > 0.1` sustained for 5 minutes.

**Severity:** Critical

**Runbook:**
1. Check server error logs for stack traces associated with the org member list route (`GET /api/orgs/:org/members`).
2. Common causes: database connection failure, `mapOrgMembersResponse` mapping error (e.g., unexpected null on `display_name`, `avatar_url`, or `role` when the mapping fails), pagination arithmetic overflow.
3. Verify database connectivity: attempt a direct SQL query against `org_members JOIN users`.
4. Check for recent deployments. If the 5xx spike correlates with a deploy, consider rolling back.
5. If the error is in the mapping function: check if a database migration changed the `users` or `org_members` row shape without updating the TypeScript mapper.
6. Verify the `org_members` join is still valid — check for schema changes to the `org_members` or `users` table.

#### Alert: Elevated Unauthorized Rate on Org Member List

**Condition:** `rate(codeplane_org_member_list_unauthorized_total[5m]) > 5` sustained for 10 minutes.

**Severity:** Warning

**Runbook:**
1. Check if a deployment broke session or PAT validation middleware.
2. Query recent `OrgMemberListUnauthorized` events to understand the distribution of `auth_method_attempted`. If all are `"cookie"`, check session storage health. If all are `"pat"`, check PAT validation logic.
3. Check if an external integration or CI system is making unauthenticated calls to this endpoint by mistake.
4. If from a single IP block: check for credential stuffing or brute-force patterns. Consider escalating rate limiting.
5. Verify that auth middleware is correctly loaded and running before the org member list route handler.

#### Alert: Elevated Forbidden Rate on Org Member List

**Condition:** `rate(codeplane_org_member_list_forbidden_total[5m]) > 10` sustained for 10 minutes.

**Severity:** Warning

**Runbook:**
1. Check if a recent UI change exposed org member list links to non-org-members (e.g., public org pages linking to member lists without checking org membership).
2. Query recent `OrgMemberListForbidden` events. If concentrated on a few orgs, check if those orgs recently changed membership policies or visibility.
3. If the 403s are from API/CLI clients, check if a third-party integration is attempting to enumerate members across multiple orgs.
4. Verify the `requireOrgRole` check in the service layer is functioning correctly.
5. No immediate action required unless combined with other suspicious access patterns.

#### Alert: Abnormal Empty Org Member List Rate

**Condition:** `rate(codeplane_org_member_list_result_count_bucket{le="0"}[15m]) / rate(codeplane_org_member_list_requests_total{status="200"}[15m]) > 0.5` sustained for 15 minutes.

**Severity:** Warning

**Runbook:**
1. Verify the `org_members` table has data. Run `SELECT COUNT(*) FROM org_members;`.
2. Check if a migration or bulk operation accidentally deleted org membership rows.
3. Verify the `countOrgMembers` and `listOrgMembers` queries are functioning: test manually with a known organization_id that should have members.
4. Since every org should have at least one owner (the creator), a high empty rate is almost certainly a bug. Check the org creation flow to ensure owner membership is being inserted.
5. If this is a data issue: restore from backup or investigate the deletion. If this is a query bug: check the SQL or organization_id resolution logic.

### Error Cases and Failure Modes

| Failure Mode                                   | Expected Behavior                  | User-Visible Error                                        |
|------------------------------------------------|------------------------------------|------------------------------------------------------------|n| No auth cookie or PAT provided                 | 401 Unauthorized                   | `"authentication required"`                               |
| Expired or revoked PAT                         | 401 Unauthorized                   | `"authentication required"`                               |
| User is not a member of the organization       | 403 Forbidden                      | `"insufficient organization permissions"`                 |
| Organization does not exist                    | 404 Not Found                      | `"organization not found"`                                |
| Organization name is empty/whitespace          | 400 Bad Request                    | `"organization name is required"`                         |
| Invalid page parameter (non-numeric, <= 0)     | 400 Bad Request                    | `"invalid page value"`                                    |
| Invalid per_page parameter (non-numeric, <= 0) | 400 Bad Request                    | `"invalid per_page value"`                                |
| per_page > 100 (legacy pagination)             | 400 Bad Request                    | `"per_page must not exceed 100"`                          |
| limit > 100 (cursor pagination)                | Clamped to 100, 200 response       | Normal paginated response                                  |
| Database connection lost                       | 500 Internal Server Error          | `"internal server error"`                                  |
| `mapOrgMembersResponse` receives null field    | 500 (should not happen if DB schema is correct) | `"internal server error"`                     |
| Concurrent member removal during request       | Stale count possible; member may be missing from page | Normal response (eventually consistent)    |
| Concurrent member addition during request      | May not appear until next request   | Normal response (eventually consistent)                    |
| Rate limit exceeded                            | 429                                | `"rate limit exceeded"` with `Retry-After` header          |
| OFFSET exceeds total rows                      | Empty array returned, 200          | Empty result set                                           |
| Org was deleted between resolution steps       | 404 Not Found                      | `"organization not found"`                                 |

## Verification

### API Integration Tests

| #  | Test Name                                                                      | Description |
|----|--------------------------------------------------------------------------------|-------------|
| 1  | `GET org members returns 200 with correct shape`                               | Authenticate as an org member. Request member list for an org with at least one member. Assert 200 and each item has exactly the 5 required fields (`id`, `username`, `display_name`, `avatar_url`, `role`). |
| 2  | `GET org members returns only org members`                                     | Create user A as org member and user B as non-member. Request member list. Assert response contains user A and does not contain user B. |
| 3  | `GET org members returns members ordered by id ascending`                      | Add 3 users to an org. Request member list. Assert items are sorted by `id` ascending. |
| 4  | `GET org members excludes internal user fields`                                | Assert response items do NOT contain `email`, `lower_email`, `lower_username`, `bio`, `wallet_address`, `user_type`, `is_active`, `is_admin`, `prohibit_login`, `email_notifications_enabled`, `last_login_at`, `created_at`, `updated_at`, `search_vector`, or any field beyond the 5 specified. |
| 5  | `GET org members role field is owner or member`                                | Request member list. Assert every item's `role` field is exactly `"owner"` or `"member"`. |
| 6  | `GET org members without authentication returns 401`                           | Request org member list with no auth header or cookie. Assert 401 with body containing `"authentication required"`. |
| 7  | `GET org members with expired PAT returns 401`                                 | Create a PAT, revoke it, request org member list. Assert 401. |
| 8  | `GET org members as non-org-member returns 403`                                | Authenticate as a user who is NOT a member of the organization. Request member list. Assert 403 with body containing `"insufficient organization permissions"`. |
| 9  | `GET org members for nonexistent org returns 404`                              | Request members for an org name that does not exist. Assert 404 with `"organization not found"`. |
| 10 | `GET org members for empty org name returns 400`                               | Request `GET /api/orgs/%20/members` (whitespace org name). Assert 400 with `"organization name is required"`. |
| 11 | `GET org members returns creator as owner`                                     | Create a new org. Request member list without adding anyone else. Assert response has exactly 1 item with role `"owner"` matching the creator. |
| 12 | `GET org members default pagination is 30`                                     | Create an org with 35 members. Request without pagination params. Assert response has exactly 30 items and `X-Total-Count: 35`. |
| 13 | `GET org members respects per_page`                                            | Request with `?per_page=5`. Assert response has exactly 5 items (assuming org has >= 5 members). |
| 14 | `GET org members rejects per_page > 100 on legacy pagination`                  | Request with `?per_page=200`. Assert 400 with `"per_page must not exceed 100"`. |
| 15 | `GET org members clamps limit to 100 on cursor pagination`                     | Create an org with 105 members. Request with `?cursor=0&limit=200`. Assert response has exactly 100 items (clamped, not rejected). |
| 16 | `GET org members page 2 returns next set`                                      | Create org with 35 members. Request `?page=1&per_page=20` and `?page=2&per_page=20`. Assert page 1 has 20 items, page 2 has 15 items, no overlap in IDs. |
| 17 | `GET org members page beyond last returns empty`                               | Create org with 5 members. Request `?page=2&per_page=30`. Assert 200 with empty array and `X-Total-Count: 5`. |
| 18 | `GET org members cursor pagination works`                                      | Request with `?cursor=0&limit=10`, then `?cursor=10&limit=10`. Assert no overlap and correct offset behavior. |
| 19 | `GET org members X-Total-Count header is correct`                              | Create org with 7 members. Assert `X-Total-Count` header equals `7`. |
| 20 | `GET org members Link header contains pagination links`                        | Create org with 50 members. Request `?page=2&per_page=10`. Assert `Link` header contains `rel="first"`, `rel="prev"`, `rel="next"`, `rel="last"`. |
| 21 | `GET org members Link header first page has no prev`                           | Request `?page=1&per_page=10` for an org with 5 members. Assert `Link` header contains `rel="first"` and `rel="last"` but does NOT contain `rel="prev"` or `rel="next"`. |
| 22 | `GET org members Link header last page has no next`                            | Request the last page for an org with 50 members. Assert `Link` header does NOT contain `rel="next"`. |
| 23 | `GET org members works with PAT authentication`                                | Request org member list with a valid PAT from an org member. Assert 200 and same content as session-authenticated request. |
| 24 | `GET org members id is a number not a string`                                  | Assert `typeof item.id === "number"` for each item. |
| 25 | `GET org members per_page=0 returns 400`                                       | Request with `?per_page=0`. Assert 400 with `"invalid per_page value"`. |
| 26 | `GET org members page=0 returns 400`                                           | Request with `?page=0`. Assert 400 with `"invalid page value"`. |
| 27 | `GET org members per_page=-1 returns 400`                                      | Request with `?per_page=-1`. Assert 400 with `"invalid per_page value"`. |
| 28 | `GET org members display_name with Unicode`                                    | Add a user with display_name `"Nono Nihon"` (with CJK/accented characters). Request member list. Assert round-trip fidelity of `display_name`. |
| 29 | `GET org members with empty display_name`                                      | Add a user with no display name set. Request member list. Assert `display_name: ""` for that user. |
| 30 | `GET org members with empty avatar_url`                                        | Add a user with no avatar set. Request member list. Assert `avatar_url: ""` for that user. |
| 31 | `GET org members with max per_page=100 and exactly 100 members`                | Create org with exactly 100 members. Request with `?per_page=100`. Assert response has exactly 100 items. |
| 32 | `GET org members with per_page=101 returns 400`                                | Request with `?per_page=101`. Assert 400 with `"per_page must not exceed 100"`. |
| 33 | `GET org members response Content-Type is application/json`                    | Assert `Content-Type` header includes `application/json`. |
| 34 | `GET org members idempotency`                                                  | Make the same request twice rapidly. Assert both return identical 200 responses. |
| 35 | `GET org members org name is case-insensitive`                                 | Create org `AcmeCorp`. Request members using `acmecorp`, `ACMECORP`, and `AcmeCorp`. Assert all return the same 200 response. |
| 36 | `GET org members reflects add membership`                                      | List members (note count). Add a new member. List again. Assert count increased by 1 and new member is present. |
| 37 | `GET org members reflects remove membership`                                   | List members (note a member). Remove the member. List again. Assert the removed member no longer appears and count decreased by 1. |
| 38 | `GET org members no duplicates`                                                | List members. Assert no two items share the same `id`. Attempt to add an existing member again (expect conflict). List members again. Assert no duplicates. |
| 39 | `GET org members both owners and members visible`                              | Create org, add one owner and one member. Request member list. Assert both roles are present in the response. |
| 40 | `GET org members limit=0 returns 400`                                          | Request with `?cursor=0&limit=0`. Assert 400 with `"invalid limit value"`. |
| 41 | `GET org members negative cursor treated as 0`                                 | Request with `?cursor=-5&limit=10`. Assert response equivalent to `?cursor=0&limit=10`. |
| 42 | `GET org members non-numeric cursor treated as 0`                              | Request with `?cursor=abc&limit=10`. Assert response equivalent to `?cursor=0&limit=10`. |

### CLI E2E Tests

| #  | Test Name                                                                      | Description |
|----|--------------------------------------------------------------------------------|-------------|
| 43 | `codeplane org member list returns org members`                                | Run `codeplane org member list <org>`. Assert exit code 0, assert output contains at least the org owner. |
| 44 | `codeplane org member list output has correct fields`                          | Parse stdout as JSON array. Assert each item has `id`, `username`, `display_name`, `avatar_url`, `role` and no extra fields. |
| 45 | `codeplane org member list without auth returns error`                         | Run `codeplane org member list <org>` without a stored session. Assert non-zero exit code and stderr contains `"authentication required"`. |
| 46 | `codeplane org member list for nonexistent org returns error`                  | Run with a nonexistent org name. Assert non-zero exit code and stderr contains `"not found"`. |
| 47 | `codeplane org member list with no additional members shows only owner`        | Create a new org. Run list. Assert output contains exactly 1 member with role `"owner"`. |
| 48 | `codeplane org member list reflects member add`                                | Add a member to the org via CLI. Run list. Assert the new member appears in the response. |
| 49 | `codeplane org member list reflects member remove`                             | Remove a member from the org via CLI. Run list. Assert the removed member no longer appears. |
| 50 | `codeplane org member list round-trip: add, list, remove, list`                | Add a member. List (assert present). Remove the member. List again (assert absent). |

### Web UI E2E Tests (Playwright)

| #  | Test Name                                                                      | Description |
|----|--------------------------------------------------------------------------------|-------------|
| 51 | `Org members page renders for org member`                                      | Navigate to `/:org/-/settings/members` while authenticated as an org member. Assert the page loads and shows member rows. |
| 52 | `Org members page shows correct member count`                                  | Authenticate as an org member. Navigate to the org members page for an org with known members. Assert the visible items and count badge match expectations. |
| 53 | `Org members row displays username, display_name, avatar, and role`            | Assert at least one member row contains username (linked), display name, avatar image/placeholder, and role badge. |
| 54 | `Org members username links to user profile`                                   | Click on a member's username. Assert navigation to `/:username`. |
| 55 | `Org members page shows role badges`                                           | Navigate to members page for an org with both owners and members. Assert role badges are visible and correctly labeled. |
| 56 | `Org members page shows add button for org owners`                             | Authenticate as an org owner. Navigate to org members. Assert "Add member" button is visible. |
| 57 | `Org members page hides add button for non-owner org members`                  | Authenticate as an org member (non-owner). Navigate to org members. Assert "Add member" button is NOT visible. |
| 58 | `Org members page shows remove action for org owners`                          | Authenticate as an org owner. Navigate to org members. Assert remove/action buttons are visible on member rows. |
| 59 | `Org members page hides remove action for non-owner org members`               | Authenticate as an org member (non-owner). Navigate to org members. Assert remove actions are NOT visible. |
| 60 | `Org members page pagination works`                                            | Authenticate for an org with > 30 members. Assert pagination controls are visible. Click "Next". Assert new members load. |
| 61 | `Org members page requires authentication`                                     | Navigate to the org members page while unauthenticated. Assert redirect to login or 401 error. |
| 62 | `Org members page loading state shows skeleton`                                | Navigate to org members with network throttling. Assert a skeleton or loading indicator is visible before the member list renders. |
| 63 | `Org members page shows error state on API failure`                            | Intercept the `GET /api/orgs/:org/members` request and force a 500 response. Navigate to org members page. Assert an error message is visible with a retry option. |
| 64 | `Org members page retry button on error state re-fetches`                      | Force a 500 on first load, then allow the second request to succeed. Click retry. Assert the member list loads correctly. |

### TUI Integration Tests

| #  | Test Name                                                                      | Description |
|----|--------------------------------------------------------------------------------|-------------|
| 65 | `TUI org member list screen renders for authenticated org member`               | Navigate to org members screen in TUI. Assert screen contains member usernames and roles. |
| 66 | `TUI org member list screen shows owner role indicator`                         | Navigate to org members screen. Assert at least one member shows the owner role indicator. |
| 67 | `TUI org member list screen pagination`                                        | Navigate to org members for an org with many members. Assert pagination indicators and navigation work. |
| 68 | `TUI org member list Enter navigates to user profile`                          | Navigate to org member list, press Enter on a member. Assert navigation to user profile screen. |

### Rate Limiting Tests

| #  | Test Name                                                                      | Description |
|----|--------------------------------------------------------------------------------|-------------|
| 69 | `Org member list endpoint returns 429 after rate limit exceeded`                | Send 301 authenticated requests in rapid succession from same session. Assert 429 on the 301st request. |
| 70 | `Org member list endpoint returns Retry-After header on 429`                    | Assert `Retry-After` header is present and contains a positive integer. |
| 71 | `Org member list endpoint rejects unauthenticated requests before rate limiting` | Send unauthenticated request. Assert 401 (not 429), confirming auth check precedes rate limit check. |
