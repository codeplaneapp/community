# ORG_UPDATE

Specification for ORG_UPDATE.

## High-Level User POV

When an organization owner needs to change their organization's profile — whether renaming it after a rebrand, updating its description to reflect a new mission, adjusting its visibility level as the organization matures from private to public, adding a website link, or correcting a location — they use the organization update feature.

Organizations on Codeplane are living entities. They change names as companies rebrand. Descriptions go stale as teams pivot. A bootstrapping team might start with a private organization and later open it to the public once their projects are ready to share. A website might be added after the organization publishes its documentation portal. A location might be corrected after a headquarters move. The organization update feature makes all of these adjustments straightforward and non-destructive, without requiring the organization to be deleted and recreated — which would destroy all repository associations, team structures, member lists, and collaboration history.

An organization owner navigates to the organization they want to update — from the CLI via `codeplane org edit <name>`, from the API via a PATCH request, or from the web UI's organization settings page — and edits one or more of the organization's properties: its name, description, visibility, website, or location. The update is partial by design: the owner only needs to supply the fields they want to change. Unchanged fields retain their existing values. The updated organization is returned immediately, reflecting the new state.

This feature is valuable because it enables organizational agility at the identity level. Renaming, re-describing, adjusting visibility, and updating contact information are common administrative actions that should be fast, low-risk, and non-destructive. By supporting partial updates, Codeplane avoids forcing the owner to re-supply all organization properties just to change one, which reduces the risk of accidental overwrites and makes scripted administration and agent-driven management simpler.

## Acceptance Criteria

### Functional Constraints

- **Authentication required**: The endpoint must reject unauthenticated requests with a 401 Unauthorized response.
- **Organization owner required**: Only users who hold the `owner` role in the organization may update it. Non-owners (including regular `member` role users) must receive a 403 Forbidden response.
- **Organization must exist**: If the organization name does not resolve to a valid organization, the endpoint must return a 404 Not Found response with message `"organization not found"`.
- **Case-insensitive org lookup**: The organization name in the URL path must be resolved case-insensitively (via `lower_name`).
- **Partial update semantics**: Each of the five updatable fields (`name`, `description`, `visibility`, `website`, `location`) is optional. If a field is omitted or sent as an empty string, the existing value is preserved.
- **Name validation — maximum length**: The `name` field must not exceed 255 characters after trimming. If it does, the endpoint must return a 422 response with `{ "message": "validation failed", "resource": "Organization", "field": "name", "code": "invalid" }`.
- **Name validation — trimming**: The `name` field must be trimmed of leading and trailing whitespace before validation and storage.
- **Name uniqueness**: If the updated name matches another existing organization's `lower_name`, the endpoint must return a 409 Conflict response with message `"organization name already exists"`.
- **Name unchanged is safe**: Submitting the same name the organization already has must succeed without triggering a conflict.
- **Visibility validation**: The `visibility` field must be one of `"public"`, `"limited"`, or `"private"`. Any other non-empty value must return a 422 response with `{ "message": "validation failed", "resource": "Organization", "field": "visibility", "code": "invalid" }`.
- **Visibility trimming**: The `visibility` field must be trimmed of leading and trailing whitespace before validation.
- **Description preservation**: An empty-string description preserves the existing description. A non-empty description replaces it.
- **Website preservation**: An empty-string website preserves the existing website. A non-empty website replaces it.
- **Location preservation**: An empty-string location preserves the existing location. A non-empty location replaces it.
- **Response shape**: The response must be a 200 OK containing the full updated organization object with fields: `id`, `name`, `lower_name`, `description`, `visibility`, `website`, `location`, `created_at`, `updated_at`.
- **updated_at advancement**: The `updated_at` timestamp must advance to the current time on every successful update, even if no field values actually changed.
- **lower_name derivation**: The `lower_name` field must always be the lowercase form of the `name` field after update.
- **Timestamps in ISO 8601**: `created_at` and `updated_at` must be ISO 8601 formatted strings in UTC.
- **created_at immutability**: The `created_at` timestamp must not change on update.
- **Empty request body**: A request with `{}` (no fields) must succeed and return the organization unchanged (with an advanced `updated_at`).
- **No data leakage**: The response must not include any fields beyond the defined organization shape (no member lists, no repository lists, no team lists, no internal metadata).
- **CLI consistency**: The CLI `org edit` command must send a PATCH request and output the same JSON object returned by the API.
- **Empty org path parameter**: A request with an empty or whitespace-only `:org` path parameter must return 400 Bad Request with message `"organization name is required"`.
- **JSON content-type enforcement**: Non-JSON request bodies on this mutation endpoint must be rejected by the platform middleware.

### Boundary Constraints

- Organization names have a maximum length of 255 characters after trimming.
- Organization names containing only whitespace after trimming must be treated as empty (preserve existing name).
- Organization descriptions have no explicit maximum length in the current implementation, but extremely large descriptions (>100,000 characters) should be validated or rejected at the application layer.
- Organization website and location fields have no explicit maximum length, but values exceeding 2,048 characters should be considered unreasonable.
- Organization names must contain only alphanumeric characters, hyphens, and underscores.
- Visibility values are case-sensitive: `"Public"` is invalid, only `"public"` is accepted.

### Edge Cases

- Updating an organization's name causes the old name to become immediately unavailable for lookup. There is no redirect or alias period.
- Renaming an organization to a name that differs only in casing from the current name must succeed (it should resolve to the same `lower_name`).
- Updating visibility from `"public"` to `"private"` immediately restricts access — non-members who could previously view the org will receive 404 on subsequent requests.
- A PATCH request with `null` values for fields (as opposed to empty strings or absent fields) should be handled gracefully — `null` should be treated as absent/empty.
- Concurrent update requests to the same organization should not produce data corruption; the last write wins.
- Updating a field with its exact current value must succeed without error.
- Special characters in description, website, and location fields (HTML entities, unicode, newlines, quotes, emoji) must be stored and returned verbatim without escaping or sanitization.
- An organization name that matches a reserved route word (e.g., `api`, `admin`, `login`) should be handled correctly by the routing layer.

### Definition of Done

- The `PATCH /api/orgs/:org` route correctly updates organizations with partial semantics.
- Authorization is restricted to organization owners.
- Field validation for name length, name uniqueness, and visibility values is enforced.
- CLI `org edit` command works end-to-end and supports all five updatable fields (`--description`, `--visibility`, `--new-name`, `--website`, `--location`).
- Web UI organization settings page allows owners to edit all five fields.
- TUI organization settings screen allows owners to edit fields.
- All verification tests pass.
- Observability instrumentation is in place (logging, metrics, telemetry events).
- Documentation is updated for the API reference, CLI reference, and organization management guide.

## Design

### API Shape

**Endpoint**: `PATCH /api/orgs/:org`

**Path Parameters**:
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `org`     | string | Yes      | Organization name (case-insensitive, resolved via `lower_name`) |

**Request Headers**: `Cookie: session=<session_cookie>` or `Authorization: token <pat>`, `Content-Type: application/json`

**Request Body** (all fields optional):
```json
{
  "name": "new-org-name",
  "description": "Updated description of the organization",
  "visibility": "public",
  "website": "https://example.com",
  "location": "San Francisco, CA"
}
```

| Field | Type | Required | Constraints | Default Behavior |
|-------|------|----------|-------------|------------------|
| `name` | string | No | Max 255 chars after trimming; must be globally unique (case-insensitive) | Existing name preserved if omitted or empty |
| `description` | string | No | No explicit length limit | Existing description preserved if empty string |
| `visibility` | string | No | Must be `"public"`, `"limited"`, or `"private"` | Existing visibility preserved if omitted or empty |
| `website` | string | No | No explicit length limit | Existing website preserved if empty string |
| `location` | string | No | No explicit length limit | Existing location preserved if empty string |

**Response** (200 OK):
```json
{
  "id": 42,
  "name": "new-org-name",
  "lower_name": "new-org-name",
  "description": "Updated description of the organization",
  "visibility": "public",
  "website": "https://example.com",
  "location": "San Francisco, CA",
  "created_at": "2026-01-10T08:00:00.000Z",
  "updated_at": "2026-03-21T14:30:00.000Z"
}
```

**Response Headers**: `Content-Type: application/json`

**Error Responses**:
| Status | Condition | Error Message |
|--------|----------|---------------|
| 400    | Empty or whitespace-only `:org` path parameter | `"organization name is required"` |
| 401    | Unauthenticated request | `"authentication required"` |
| 403    | Authenticated user is not an org owner | `"owner role required"` |
| 404    | Organization does not exist | `"organization not found"` |
| 409    | Updated name conflicts with an existing organization | `"organization name already exists"` |
| 422    | Name exceeds 255 characters | `{ "message": "validation failed", "resource": "Organization", "field": "name", "code": "invalid" }` |
| 422    | Invalid visibility value | `{ "message": "validation failed", "resource": "Organization", "field": "visibility", "code": "invalid" }` |

### SDK Shape

The `OrgService` in `@codeplane/sdk` exposes:

```typescript
async updateOrg(
  actor: User,
  orgName: string,
  req: UpdateOrgRequest,
): Promise<Result<Organization, APIError>>
```

Where `UpdateOrgRequest` is:

```typescript
interface UpdateOrgRequest {
  name: string;       // empty string → preserve existing
  description: string; // empty string → preserve existing
  visibility: string;  // empty string → preserve existing
  website: string;     // empty string → preserve existing
  location: string;    // empty string → preserve existing
}
```

The service: (1) validates authentication (returns 401 if no actor), (2) resolves the org case-insensitively via `resolveOrg` (returns 400 if name is empty, 404 if not found), (3) checks that the actor holds the `owner` role in the organization (returns 403 if not), (4) trims and validates the `name` field (max 255 chars, falls back to existing name if empty), (5) trims and validates the `visibility` field (must be `public`, `limited`, or `private`, falls back to existing if empty), (6) preserves existing values for empty `description`, `website`, and `location` fields, (7) calls `updateOrganization()` with the resolved values, (8) handles unique violation errors (returns 409 for name conflicts), (9) maps the database row to the `Organization` shape via `mapOrganization`, (10) returns `Result.ok(org)`.

### CLI Command

**Synopsis**:
```
codeplane org edit <name> [options]
```

| Argument | Type   | Required | Description |
|----------|--------|----------|-------------|
| `name`   | string | Yes      | Current organization name |

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `--description` | string | No | New organization description |
| `--visibility` | enum (`public`, `limited`, `private`) | No | New visibility level |
| `--new-name` | string | No | New organization name |
| `--website` | string | No | New website URL |
| `--location` | string | No | New location |

**Output**: JSON object representing the updated organization, identical to the API response body. Supports `--json` field filtering.

**Exit codes**: 0 = success, non-zero = API error (prints error message to stderr).

**Current CLI limitation**: The existing CLI implementation only supports `--description` and `--visibility`. The specification requires that `--new-name`, `--website`, and `--location` be added for full feature parity with the API.

**Example**:
```
$ codeplane org edit acme-corp --description "New mission statement" --visibility public
{
  "id": 42,
  "name": "acme-corp",
  "lower_name": "acme-corp",
  "description": "New mission statement",
  "visibility": "public",
  "website": "https://acme.example.com",
  "location": "San Francisco, CA",
  "created_at": "2026-01-10T08:00:00.000Z",
  "updated_at": "2026-03-21T14:30:00.000Z"
}
```

### Web UI Design

**Status**: `Gated` — referenced in feature inventory as `ORG_SETTINGS_UI`.

**Route**: `/:org/settings`

When implemented, the organization settings page should include:

**1. Page Header**:
- Title: "Organization Settings" with the org name displayed
- Breadcrumb: `Home > {org_name} > Settings`
- Access restricted to org owners — non-owners are redirected to the org overview with an access-denied toast notification

**2. General Settings Form**:
- **Organization Name**: Text input pre-filled with current name. Inline validation showing character count and max (255). Warning callout below: "Renaming your organization will change its URL. Existing links to the old name will stop working immediately."
- **Description**: Multiline textarea pre-filled with current description. Placeholder text: "Describe your organization…"
- **Visibility**: Radio button group with three options:
  - `Public` — "Anyone can see this organization"
  - `Limited` — "Authenticated Codeplane users who are members can see this organization"
  - `Private` — "Only organization members can see this organization"
  - When changing from public to private/limited: a confirmation dialog: "Changing visibility to {level} will immediately restrict access. Non-members will no longer be able to view this organization. Continue?"
- **Website**: Text input pre-filled with current website. Placeholder: "https://example.com"
- **Location**: Text input pre-filled with current location. Placeholder: "City, Country"

**3. Save Action**:
- "Save changes" button, disabled until at least one field differs from the loaded state
- On save: display loading spinner on the button, disable form inputs
- On success: show success toast "Organization updated successfully", update all displayed values, reset dirty state
- On conflict (409): show error toast "An organization with that name already exists"
- On validation error (422): show inline field-level error message under the offending field
- On auth error (403): show error toast "You don't have permission to update this organization"
- On network error: show error toast "Failed to update organization. Please try again."

**4. Danger Zone Section** (below general settings, visually separated):
- This section is for the separate ORG_DELETE feature but should be referenced here as part of the settings page layout

### TUI UI

**Status**: `Partial` — no org settings screen exists in the TUI today.

When implemented:

**Screen: Organization Settings**

Accessible from the organization overview screen by pressing `s` (if the viewer is an org owner).

**Layout**:
- **Header bar**: `Settings: {org_name}`
- **Form fields** (navigable with Tab/Shift+Tab or arrow keys):
  - Name: `[text input]` — current name, editable
  - Description: `[text input]` — current description, editable
  - Visibility: `[select: public | limited | private]` — current value, selectable
  - Website: `[text input]` — current website, editable
  - Location: `[text input]` — current location, editable
- **Actions bar**:
  - `[Save]` — Submit changes (Enter on focused Save button or Ctrl+S)
  - `[Cancel]` — Discard changes and return to org overview (Esc)

**Key bindings**:
| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Move between form fields |
| `Enter` (on Save) | Submit form |
| `Ctrl+S` | Submit form from any field |
| `Esc` | Cancel and return to org overview |
| `?` | Show keyboard help |

**Feedback**:
- On success: flash "✓ Organization updated" and return to org overview with refreshed data
- On error: display error message inline at the bottom of the form

### Documentation

- **API reference**: `PATCH /api/orgs/:org` — path parameters, request body schema, response shape, all error codes with messages, authentication requirements, partial update semantics explanation, example curl commands for updating each field individually and multiple fields together.
- **CLI reference**: `codeplane org edit` — arguments, all options with descriptions and value constraints, example output, exit codes, `--json` field filtering example, examples of updating individual fields and multiple fields.
- **Guide**: "Managing organizations on Codeplane" — section on updating organization settings, explaining partial update semantics, visibility level implications (especially the immediate effect of changing from public to private), name change consequences (old name immediately becomes unavailable), and best practices for organization administration.
- **Concept page**: Update the "Organization visibility levels" concept page to explain what happens when visibility changes — specifically that access is immediately restricted or expanded.

## Permissions & Security

### Authorization Roles

| Role | Can update org? | Notes |
|------|----------------|-------|
| Anonymous (unauthenticated) | ❌ No (401) | Must be authenticated |
| Authenticated (non-member) | ❌ No (403) | Must be an org member with owner role |
| Organization Member (`member` role) | ❌ No (403) | `member` role is insufficient |
| Organization Owner (`owner` role) | ✅ Yes | Full update access |
| Platform Admin (`is_admin`) | ✅ Yes | Superuser access (via admin routes if needed) |

### Security Rules

1. **Owner-only mutation**: Organization updates are restricted to owners. This prevents members from escalating organizational access by changing visibility or renaming the organization.
2. **No privilege escalation via visibility**: Changing visibility from private/limited to public does not grant new users access to organization repositories, teams, or members — those resources have independent access controls. However, the organization profile itself becomes publicly discoverable.
3. **Name change immediate effect**: Renaming an organization immediately changes its URL path. All existing links, bookmarks, CLI scripts, and integrations referencing the old name will break. This is by design to prevent squatting and ambiguity.
4. **Unique name enforcement**: Organization names are globally unique (case-insensitive). The unique constraint prevents one org from hijacking another org's identity through a rename.
5. **PAT scope**: Personal access tokens must be valid and the token's owner must hold the `owner` role.
6. **Deploy key exclusion**: Deploy keys are repository-scoped and cannot be used to update organization details.
7. **No sensitive data in response**: The update response contains only organization-level metadata, never user PII, secrets, or internal identifiers.

### Rate Limiting

| Context | Rate Limit | Window |
|---------|-----------|--------|
| Authenticated mutation requests | 30 requests | per minute |
| Per-IP burst | 10 requests | per minute |

Rate limiting is enforced by the platform middleware layer. Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) must be included in all responses. Organization update is a mutation and should have tighter rate limits than read operations to prevent abuse.

### Data Privacy

- **No PII in the response**: The organization update response contains only organization-level metadata set by the owner.
- **Audit trail**: Organization updates (especially name changes and visibility changes) should be logged for audit purposes with the actor's identity.
- **Name change history**: After a rename, the old name is not stored or exposed. This prevents stale name enumeration.
- **Visibility downgrade sensitivity**: When visibility is downgraded from public to private/limited, any previously cached public data (search engine indexes, API caches) may still contain stale references. This is a known limitation, not a bug.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `OrgUpdated` | A successful 200 response is returned for an org update request | `org_id`, `org_name`, `org_name_previous` (if changed, else null), `actor_user_id`, `actor_username`, `fields_changed` (array of field names that actually changed, e.g. `["name", "visibility"]`), `visibility_previous` (if changed), `visibility_new` (if changed), `client` (`"api"`, `"cli"`, `"web"`, `"tui"`), `response_time_ms` |
| `OrgRenamed` | A successful update where the `name` field changed | `org_id`, `org_name_previous`, `org_name_new`, `actor_user_id`, `client` |
| `OrgVisibilityChanged` | A successful update where the `visibility` field changed | `org_id`, `org_name`, `visibility_previous`, `visibility_new`, `actor_user_id`, `client` |
| `OrgUpdateFailed` | A 4xx or 5xx response is returned | `org_name_attempted`, `actor_user_id` (if authenticated), `status_code`, `error_reason`, `fields_attempted` (array of field names in request), `client` |

### Funnel Metrics

- **Org update adoption rate**: Percentage of organizations that have at least one update within 30 days of creation. Indicates whether owners are customizing their organizations after initial creation.
- **Org update frequency**: Average number of updates per organization per month. Very high frequency on a single org may indicate scripted abuse; very low frequency is normal.
- **Fields updated distribution**: Breakdown of which fields are updated most frequently (`name`, `description`, `visibility`, `website`, `location`). Guides UI prioritization.
- **Visibility change direction**: Ratio of public→private vs private→public changes. Indicates whether organizations tend to open up or lock down over time.
- **Org rename rate**: Percentage of updates that include a name change. High rename rates may indicate that the name selection UX during creation needs improvement.
- **Client distribution**: Breakdown of org update requests by client surface (API, CLI, web, TUI). Indicates which surfaces are used for administration.
- **Error rate by type**: Breakdown of failed updates by error type (409 name conflict, 422 validation, 403 permission). High 409 rates indicate namespace pressure; high 403 rates indicate permission confusion.
- **Settings page visit → save conversion**: Percentage of web UI settings page visits that result in a successful save. Low conversion may indicate UX friction.

### Success Indicators

- Org update API latency p50 < 30ms, p99 < 300ms.
- Error rate < 0.5% of requests (excluding expected 400/401/403/404/409/422 responses).
- At least 40% of organizations receive at least one profile update within 90 days of creation.
- Org rename conflict rate (409s / total name change attempts) < 5%.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Org update request received | `debug` | `org_name`, `actor_user_id`, `fields_in_request` (array), `request_id` |
| Organization resolved successfully | `debug` | `org_id`, `org_name`, `org_visibility`, `request_id` |
| Organization not found | `info` | `org_name`, `actor_user_id`, `request_id` |
| Owner role verified | `debug` | `org_id`, `actor_user_id`, `request_id` |
| Permission denied (not owner) | `info` | `org_name`, `actor_user_id`, `actor_role`, `request_id` |
| Authentication required (401) | `info` | `request_id` |
| Name validation failed (too long) | `info` | `org_name`, `name_length`, `actor_user_id`, `request_id` |
| Visibility validation failed | `info` | `org_name`, `attempted_visibility`, `actor_user_id`, `request_id` |
| Organization name conflict (409) | `info` | `org_name`, `attempted_name`, `actor_user_id`, `request_id` |
| Organization updated successfully | `info` | `org_id`, `org_name`, `fields_changed` (array), `name_changed` (boolean), `visibility_changed` (boolean), `actor_user_id`, `request_id` |
| Organization renamed | `warn` | `org_id`, `old_name`, `new_name`, `actor_user_id`, `request_id` |
| Organization visibility changed | `warn` | `org_id`, `org_name`, `old_visibility`, `new_visibility`, `actor_user_id`, `request_id` |
| Unexpected error in org update | `error` | `org_name`, `actor_user_id`, `error_message`, `error_stack`, `request_id` |
| Empty org name parameter (400) | `info` | `actor_user_id`, `request_id` |

All log lines must include the `request_id` from the middleware for correlation. Name changes and visibility changes are logged at `warn` level because they have operational impact (URL changes, access control changes).

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_update_requests_total` | counter | `status_code` | Total org update requests |
| `codeplane_org_update_duration_seconds` | histogram | — | Request duration (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_org_update_errors_total` | counter | `error_type` (`auth`, `forbidden`, `not_found`, `conflict`, `validation`, `internal`) | Error breakdown |
| `codeplane_org_update_fields_changed_total` | counter | `field` (`name`, `description`, `visibility`, `website`, `location`) | Count of individual field changes |
| `codeplane_org_rename_total` | counter | — | Total organization renames (subset of updates where name changed) |
| `codeplane_org_visibility_change_total` | counter | `from`, `to` | Visibility transitions (e.g., `from="public"`, `to="private"`) |
| `codeplane_org_update_in_flight` | gauge | — | Number of currently in-flight org update requests |

### Alerts

#### Alert: `OrgUpdateHighErrorRate`
- **Condition**: `rate(codeplane_org_update_errors_total{error_type="internal"}[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries containing `org_update` context. Look for stack traces and error messages.
  2. Verify database connectivity — run `SELECT 1` on the primary database and check connection pool health (`codeplane_db_pool_active`, `codeplane_db_pool_idle`).
  3. Check if the `updateOrganization` SQL query is failing — look for constraint violations, lock timeouts, or schema mismatches.
  4. Check for recent deployments that may have introduced a regression in the org route handler or the `OrgService.updateOrg` method.
  5. Verify that the `organizations` table has the expected unique index on `lower_name` — a missing index could cause duplicate key errors to be misclassified.
  6. Check for database lock contention in `pg_locks` if queries are timing out.
  7. Escalate to the platform team if the issue persists beyond 15 minutes.

#### Alert: `OrgUpdateHighLatency`
- **Condition**: `histogram_quantile(0.99, rate(codeplane_org_update_duration_seconds_bucket[5m])) > 2.0`
- **Severity**: Warning
- **Runbook**:
  1. Run `EXPLAIN ANALYZE` on the update query pattern to verify indexes are being used.
  2. Check database connection pool utilization — pool exhaustion affects all endpoints.
  3. Check for lock contention in `pg_locks` — concurrent updates to the same org or organizations with many foreign key references may cause lock waits.
  4. Check if the latency is isolated to rename operations (which involve a unique constraint check) versus other field updates.
  5. Check system load (`node_cpu_seconds_total`, `node_memory_MemAvailable_bytes`) on application and database hosts.
  6. If latency is concentrated during peak hours, consider connection pool scaling.

#### Alert: `OrgRenameSpike`
- **Condition**: `rate(codeplane_org_rename_total[1h]) > 10`
- **Severity**: Info
- **Runbook**:
  1. Check if the renames are concentrated on a single actor — a single user renaming many orgs may indicate scripted abuse or namespace squatting.
  2. Verify that rate limiting is functioning correctly for mutation endpoints.
  3. Check if the renames are related to a planned organizational restructuring (expected behavior).
  4. If abuse is suspected, consider temporarily restricting the actor and reviewing their account.
  5. No immediate action required for organic rename activity, but monitor for downstream effects (broken links, webhook failures).

#### Alert: `OrgNameConflictSpike`
- **Condition**: `rate(codeplane_org_update_errors_total{error_type="conflict"}[15m]) > 20`
- **Severity**: Info
- **Runbook**:
  1. Check if the conflicts are from a single user attempting to claim a popular organization name — this may indicate namespace squatting attempts.
  2. Check if the conflicts correlate with a recently deleted organization whose name was freed up and is now being contested.
  3. Verify rate limiting is working to prevent rapid-fire rename attempts.
  4. No immediate action required unless the behavior is clearly abusive.

#### Alert: `OrgVisibilityDowngradeSpike`
- **Condition**: `rate(codeplane_org_visibility_change_total{from="public",to=~"private|limited"}[1h]) > 5`
- **Severity**: Info
- **Runbook**:
  1. Verify the visibility changes are intentional by checking the actor identities.
  2. A spike in public→private transitions may indicate a security incident (organizations locking down after a leak).
  3. Check if affected organizations have active webhook subscriptions or integrations that may be disrupted by the visibility change.
  4. No immediate action required for intentional administrative changes.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Database connection lost | 500 Internal Server Error | Automatic reconnection via pool; alert fires |
| Query timeout on org update | 500 Internal Server Error | Check for lock contention on `organizations` table |
| Unique constraint violation on name | 409 Conflict with `"organization name already exists"` | Expected behavior; user chooses a different name |
| Organizations table corrupted/missing | 500 Internal Server Error | Restore from backup; alert fires |
| Org_members table corrupted/missing | 500 Internal Server Error (on role check) | Restore from backup; alert fires |
| Concurrent rename of the same org | One succeeds, other gets 409 or succeeds with second name | Expected race condition; last write wins |
| Concurrent update and delete of same org | Update may return 404 or 500 depending on timing | Expected race condition; org is deleted |
| Malformed JSON body | 400 Bad Request (middleware) | Expected behavior; client fixes request |
| Non-JSON content type | 415 Unsupported Media Type (middleware) | Expected behavior; client fixes request |
| Extremely large request body (>1MB) | Rejected by framework body size limits | Expected behavior; no recovery needed |
| Name containing SQL injection attempt | Parameterized queries prevent injection; name stored as-is | Expected behavior; no risk |

## Verification

### API Integration Tests

#### Happy Path

- **`test: returns 200 with updated organization when updating description`** — Create org with description "v1". PATCH with `{ "description": "v2" }`. Assert 200. Assert `description === "v2"`. Assert `name`, `visibility`, `website`, `location` are unchanged.
- **`test: returns 200 with updated organization when updating visibility`** — Create org with visibility "public". PATCH with `{ "visibility": "private" }`. Assert 200. Assert `visibility === "private"`.
- **`test: returns 200 with updated organization when updating name`** — Create org "old-name". PATCH with `{ "name": "new-name" }`. Assert 200. Assert `name === "new-name"` and `lower_name === "new-name"`.
- **`test: returns 200 with updated organization when updating website`** — Create org with website "". PATCH with `{ "website": "https://example.com" }`. Assert 200. Assert `website === "https://example.com"`.
- **`test: returns 200 with updated organization when updating location`** — Create org with location "". PATCH with `{ "location": "Berlin, Germany" }`. Assert 200. Assert `location === "Berlin, Germany"`.
- **`test: returns 200 with updated organization when updating all fields at once`** — Create org. PATCH with all five fields changed. Assert 200 and all fields reflect new values.
- **`test: returns 200 with unchanged org when body is empty object`** — Create org. Note all field values. PATCH with `{}`. Assert 200. Assert all field values except `updated_at` are unchanged.
- **`test: updated_at advances on every successful update`** — Create org. Note `updated_at`. Wait 10ms. PATCH with `{}`. Assert new `updated_at` is strictly greater.
- **`test: created_at does not change on update`** — Create org. Note `created_at`. PATCH with description change. Assert `created_at` is identical.
- **`test: response has exactly the expected fields`** — PATCH org. Assert response object keys are exactly: `id`, `name`, `lower_name`, `description`, `visibility`, `website`, `location`, `created_at`, `updated_at`. Assert no additional keys.
- **`test: lower_name is derived from name after rename`** — Create org "OrgOne". PATCH with `{ "name": "NewOrg" }`. Assert `lower_name === "neworg"`.
- **`test: response Content-Type is application/json`** — PATCH org. Assert response header `Content-Type` contains `application/json`.
- **`test: org is accessible at new name after rename`** — Create org "alpha". PATCH with `{ "name": "beta" }`. GET `/api/orgs/beta`. Assert 200.
- **`test: org is NOT accessible at old name after rename`** — Create org "alpha". PATCH with `{ "name": "beta" }`. GET `/api/orgs/alpha`. Assert 404.

#### Partial Update Semantics

- **`test: omitting name field preserves existing name`** — Create org "my-org". PATCH with `{ "description": "new" }`. Assert `name === "my-org"`.
- **`test: sending empty string for name preserves existing name`** — Create org "my-org". PATCH with `{ "name": "" }`. Assert `name === "my-org"`.
- **`test: sending whitespace-only name preserves existing name`** — Create org "my-org". PATCH with `{ "name": "   " }`. Assert `name === "my-org"`.
- **`test: omitting visibility preserves existing visibility`** — Create org with visibility "public". PATCH with `{ "description": "new" }`. Assert `visibility === "public"`.
- **`test: sending empty string for visibility preserves existing visibility`** — Create org with visibility "public". PATCH with `{ "visibility": "" }`. Assert `visibility === "public"`.
- **`test: sending empty string for description preserves existing description`** — Create org with description "keep me". PATCH with `{ "description": "" }`. Assert `description === "keep me"`.
- **`test: sending empty string for website preserves existing website`** — Create org with website "https://keep.me". PATCH with `{ "website": "" }`. Assert `website === "https://keep.me"`.
- **`test: sending empty string for location preserves existing location`** — Create org with location "NYC". PATCH with `{ "location": "" }`. Assert `location === "NYC"`.

#### Auth & Permission Tests

- **`test: returns 401 for unauthenticated request`** — PATCH `/api/orgs/test-org` without auth. Assert 401 with message containing `"authentication required"`.
- **`test: returns 403 for org member who is not owner`** — Create org. Add user as `member`. Authenticate as member. PATCH. Assert 403.
- **`test: returns 403 for authenticated user who is not a member`** — Create org. Authenticate as a user who is not a member. PATCH. Assert 403.
- **`test: returns 404 for nonexistent organization`** — PATCH `/api/orgs/nonexistent-org-xyz` with valid auth. Assert 404 with message `"organization not found"`.
- **`test: returns 400 for empty org name parameter`** — PATCH `/api/orgs/%20`. Assert 400 with message containing `"organization name is required"`.
- **`test: org owner can update successfully`** — Create org. Authenticate as owner. PATCH with description change. Assert 200.

#### Name Validation Tests

- **`test: name at maximum valid length (255 chars) succeeds`** — Create org. PATCH with name of exactly 255 characters. Assert 200 and name matches.
- **`test: name exceeding 255 chars returns 422`** — Create org. PATCH with name of 256 characters. Assert 422 with validation failed message and `field === "name"`.
- **`test: name trimmed of whitespace before validation`** — Create org. PATCH with `{ "name": "  trimmed  " }`. Assert 200 and `name === "trimmed"`.
- **`test: renaming to same name (case-identical) succeeds`** — Create org "my-org". PATCH with `{ "name": "my-org" }`. Assert 200.
- **`test: renaming to same name (case-different) succeeds`** — Create org "my-org". PATCH with `{ "name": "My-Org" }`. Assert 200 and `name === "My-Org"` and `lower_name === "my-org"`.
- **`test: renaming to existing org name returns 409`** — Create org "alpha" and org "beta". Authenticate as alpha owner. PATCH alpha with `{ "name": "beta" }`. Assert 409 with message `"organization name already exists"`.
- **`test: renaming to existing org name (case-insensitive) returns 409`** — Create org "alpha" and org "beta". PATCH alpha with `{ "name": "BETA" }`. Assert 409.

#### Visibility Validation Tests

- **`test: visibility "public" is accepted`** — PATCH with `{ "visibility": "public" }`. Assert 200 and `visibility === "public"`.
- **`test: visibility "limited" is accepted`** — PATCH with `{ "visibility": "limited" }`. Assert 200 and `visibility === "limited"`.
- **`test: visibility "private" is accepted`** — PATCH with `{ "visibility": "private" }`. Assert 200 and `visibility === "private"`.
- **`test: visibility "Public" (wrong case) returns 422`** — PATCH with `{ "visibility": "Public" }`. Assert 422 with validation failed message and `field === "visibility"`.
- **`test: visibility "internal" (invalid value) returns 422`** — PATCH with `{ "visibility": "internal" }`. Assert 422.
- **`test: visibility "  public  " (with whitespace) is accepted after trimming`** — PATCH with `{ "visibility": "  public  " }`. Assert 200 and `visibility === "public"`.

#### Case-Insensitivity Tests

- **`test: org name in path is resolved case-insensitively (lowercase)`** — Create org "MyOrg". PATCH `/api/orgs/myorg` with description change. Assert 200.
- **`test: org name in path is resolved case-insensitively (uppercase)`** — Create org "MyOrg". PATCH `/api/orgs/MYORG` with description change. Assert 200.
- **`test: org name in path is resolved case-insensitively (mixed case)`** — Create org "MyOrg". PATCH `/api/orgs/mYoRg` with description change. Assert 200.

#### Special Characters & Unicode Tests

- **`test: description with HTML entities stored and returned verbatim`** — PATCH with `{ "description": "<script>alert('xss')</script>" }`. Assert `description` returned verbatim without escaping.
- **`test: description with unicode emoji stored and returned correctly`** — PATCH with `{ "description": "🚀 Launch ready" }`. Assert `description === "🚀 Launch ready"`.
- **`test: description with newlines stored and returned correctly`** — PATCH with `{ "description": "line1\nline2\nline3" }`. Assert `description` contains newlines.
- **`test: website with query parameters stored correctly`** — PATCH with `{ "website": "https://example.com/path?key=value&other=true" }`. Assert exact match.
- **`test: location with unicode stored correctly`** — PATCH with `{ "location": "東京都渋谷区" }`. Assert exact match.
- **`test: description with double quotes stored correctly`** — PATCH with `{ "description": "She said \"hello\"" }`. Assert exact match.

#### Boundary Tests

- **`test: org name at exactly 255 characters works`** — PATCH with name of exactly 255 "a" characters. Assert 200.
- **`test: org name at 256 characters fails`** — PATCH with name of 256 "a" characters. Assert 422.
- **`test: very long description (10000 chars) works`** — PATCH with 10000-char description. Assert 200 and full description returned.
- **`test: very long website (2048 chars) works`** — PATCH with 2048-char website. Assert 200 and full website returned.
- **`test: very long location (1000 chars) works`** — PATCH with 1000-char location. Assert 200.

#### Concurrency Tests

- **`test: concurrent updates to different fields both succeed`** — Send two PATCH requests in parallel: one updating description, one updating website. Assert both return 200 (last write wins for any field).
- **`test: concurrent rename attempts — one succeeds, one may conflict`** — Create org "alpha" and reserve name "beta". Send two concurrent renames to "beta" from different orgs. Assert at least one succeeds and at most one gets 409.
- **`test: update immediately after create returns consistent data`** — Create org. Immediately PATCH with description change. Assert 200 with updated description.
- **`test: view immediately after update reflects the update`** — PATCH org with new description. Immediately GET. Assert description matches PATCH response.

### CLI E2E Tests

- **`test: codeplane org edit updates description`** — Create org. Run `codeplane org edit <name> --description "updated"`. Parse JSON output. Assert `description === "updated"`.
- **`test: codeplane org edit updates visibility`** — Create org with visibility "public". Run `codeplane org edit <name> --visibility private`. Parse JSON output. Assert `visibility === "private"`.
- **`test: codeplane org edit output has all expected fields`** — Run `org edit`. Parse JSON. Assert keys include `id`, `name`, `lower_name`, `description`, `visibility`, `website`, `location`, `created_at`, `updated_at`.
- **`test: codeplane org edit output matches API response`** — Create org. Run CLI `org edit` and also send PATCH to API. Compare both JSON outputs. Assert structurally identical (field values match).
- **`test: codeplane org edit with nonexistent org exits with error`** — Run `codeplane org edit nonexistent-org --description "x"`. Assert non-zero exit code and stderr contains error message.
- **`test: codeplane org edit without options sends no changes but succeeds`** — Create org. Run `codeplane org edit <name>` with no options. Assert exit code 0 and JSON output matches current org state.
- **`test: codeplane org edit with invalid visibility errors`** — Run `codeplane org edit <name> --visibility invalid`. Assert non-zero exit code or validation error output.
- **`test: codeplane org edit without required name arg errors`** — Run `codeplane org edit`. Assert error output indicating required argument.
- **`test: codeplane org edit with --new-name renames org`** — (When implemented) Create org "alpha". Run `codeplane org edit alpha --new-name beta`. Assert output shows `name === "beta"`.
- **`test: codeplane org edit with --website updates website`** — (When implemented) Create org. Run `codeplane org edit <name> --website "https://new.site"`. Assert `website === "https://new.site"`.
- **`test: codeplane org edit with --location updates location`** — (When implemented) Create org. Run `codeplane org edit <name> --location "Tokyo"`. Assert `location === "Tokyo"`.

### Playwright Web UI E2E Tests (when ORG_SETTINGS_UI is fully implemented)

- **`test: org settings page is accessible to org owner`** — Authenticate as org owner. Navigate to `/:org/settings`. Assert the settings form is visible.
- **`test: org settings page is NOT accessible to org member`** — Authenticate as org member (not owner). Navigate to `/:org/settings`. Assert redirect to org overview or access denied state.
- **`test: org settings page is NOT accessible to unauthenticated user`** — Logout. Navigate to `/:org/settings`. Assert redirect to login or 404.
- **`test: org settings form is pre-filled with current org data`** — Create org with name, description, visibility, website, location. Navigate to settings. Assert all form fields contain current values.
- **`test: save button is disabled when no changes made`** — Navigate to settings. Assert "Save changes" button is disabled or visually inactive.
- **`test: save button enables when a field is changed`** — Navigate to settings. Change description. Assert "Save changes" button becomes active.
- **`test: updating description via web UI succeeds`** — Navigate to settings. Clear description field, type "new desc". Click Save. Assert success toast. Reload page. Assert description field shows "new desc".
- **`test: updating visibility via web UI shows confirmation for downgrade`** — Navigate to settings for a public org. Select "private" visibility. Assert confirmation dialog appears with warning text.
- **`test: confirming visibility downgrade succeeds`** — Navigate to settings for public org. Select "private". Confirm dialog. Assert success toast and visibility updated.
- **`test: canceling visibility downgrade does not change visibility`** — Navigate to settings for public org. Select "private". Cancel dialog. Assert visibility remains "public".
- **`test: renaming org via web UI shows warning about URL change`** — Navigate to settings. Change name. Assert warning text about URL change is visible before saving.
- **`test: name conflict shows inline error`** — Create two orgs. Navigate to first org's settings. Change name to second org's name. Click Save. Assert error message about name already existing.
- **`test: name too long shows inline validation error`** — Navigate to settings. Enter 256-character name. Click Save. Assert validation error for name field.
- **`test: updating website via web UI succeeds`** — Navigate to settings. Enter website URL. Click Save. Assert success toast and website updated.
- **`test: updating location via web UI succeeds`** — Navigate to settings. Enter location. Click Save. Assert success toast and location updated.
- **`test: network error shows error toast`** — Navigate to settings. Intercept PATCH request and force network error. Click Save. Assert error toast with retry message.
- **`test: org settings page has breadcrumb navigation`** — Navigate to `/:org/settings`. Assert breadcrumb shows `Home > {org_name} > Settings`. Click org name breadcrumb. Assert navigation to org overview.
