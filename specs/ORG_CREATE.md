# ORG_CREATE

Specification for ORG_CREATE.

## High-Level User POV

When you are ready to bring your team together on Codeplane, creating an organization is the first step. From the CLI, you run a single command with the name you want for your org, and Codeplane sets it up instantly. You become the owner of the new organization and can immediately start inviting members, creating teams, and adding repositories.

An organization is your team's home on Codeplane. It groups repositories, members, and teams under a shared identity. You choose a name that identifies your team — it becomes part of every URL and reference associated with the org. You can add an optional description to explain the org's purpose and set a visibility level to control who can discover it: public organizations are visible to everyone, limited organizations are visible only to authenticated users, and private organizations are visible only to their members.

Creating an organization is lightweight and immediate. There is no approval queue or provisioning delay. As soon as the org is created, you are its owner and can begin configuring it. If you try to use a name that is already taken, Codeplane tells you right away so you can pick a different one. Organization names are unique across the entire instance, regardless of capitalization — "AcmeCorp" and "acmecorp" are treated as the same name.

From the TUI, creating an organization follows the same workflow through an interactive form. The web UI will provide a dedicated creation page accessible from the organizations section. In every client, the experience is the same: choose a name, optionally add a description and visibility level, and you are done.

## Acceptance Criteria

### Definition of Done

The feature is complete when any authenticated user can create a new organization with a unique name, receive back the created organization object, and be automatically registered as the owner of that organization. The creation flow is consistent across API, CLI, and TUI. Validation errors, duplicate name conflicts, and unauthenticated requests are handled with clear, specific error responses. The created organization is immediately visible in the user's organization list and accessible via the organization detail endpoint.

### Functional Constraints

- [ ] The endpoint requires authentication. Unauthenticated requests return `401` with `"authentication required"`.
- [ ] A valid `name` field is required in the request body. An empty or whitespace-only name returns `422` with a `"missing_field"` validation error.
- [ ] The `name` field is trimmed of leading and trailing whitespace before validation and storage.
- [ ] Organization names longer than 255 characters return `422` with an `"invalid"` validation error on the `name` field.
- [ ] Organization names must be between 1 and 39 characters after trimming, consist of `[a-zA-Z0-9-]`, must not start or end with a hyphen, and must not contain consecutive hyphens. Names violating these rules return `422` with an `"invalid"` validation error.
- [ ] Organization names are case-insensitive for uniqueness. A `lower_name` (lowercased copy) is stored and used for collision checks. Attempting to create `"AcmeCorp"` when `"acmecorp"` already exists returns `409`.
- [ ] Duplicate organization names return `409 Conflict` with `"organization name already exists"`.
- [ ] The `description` field is optional. If omitted or empty, it defaults to `""`.
- [ ] The `description` field supports Unicode characters including emoji, CJK, and accented characters.
- [ ] The `description` field has a maximum length of 2048 characters. Descriptions exceeding this return `422` with an `"invalid"` validation error on the `description` field.
- [ ] The `visibility` field is optional. If omitted or empty, it defaults to `"public"`.
- [ ] The `visibility` field must be one of `"public"`, `"limited"`, or `"private"`. Any other value returns `422` with an `"invalid"` validation error on the `visibility` field.
- [ ] On success, the endpoint returns `201 Created` with the full organization object.
- [ ] The response object contains exactly these fields: `id`, `name`, `lower_name`, `description`, `visibility`, `website`, `location`, `created_at`, `updated_at`.
- [ ] The `website` and `location` fields are empty strings `""` on a newly created organization.
- [ ] The `id` field is a positive integer.
- [ ] The `created_at` and `updated_at` fields are ISO 8601 formatted datetime strings.
- [ ] The authenticated user is automatically added as an `"owner"` member of the newly created organization.
- [ ] The newly created organization immediately appears in the creator's `GET /api/user/orgs` list.
- [ ] The newly created organization is immediately accessible via `GET /api/orgs/:org`.
- [ ] The endpoint accepts both session cookie and PAT-based authentication.

### Boundary Constraints

- [ ] **`name`:** 1–39 characters, `[a-zA-Z0-9-]`. May not start or end with a hyphen. May not contain consecutive hyphens.
- [ ] **`name` (absolute maximum):** 255 characters. Values exceeding 255 are rejected even if the stricter 39-character rule is not yet enforced.
- [ ] **`description`:** 0–2048 characters. May contain Unicode.
- [ ] **`visibility`:** Exactly one of `"public"`, `"limited"`, or `"private"`.
- [ ] **`id` in response:** Positive integer (auto-generated).
- [ ] **`website` in response:** Always `""` for newly created organizations.
- [ ] **`location` in response:** Always `""` for newly created organizations.
- [ ] **`created_at` in response:** Valid ISO 8601 datetime, set to current server time.
- [ ] **`updated_at` in response:** Valid ISO 8601 datetime, equal to `created_at` at creation time.

### Edge Cases

- [ ] Submitting an empty JSON body `{}` returns `422` with a `"missing_field"` validation error on `name`.
- [ ] Submitting `{ "name": "" }` returns `422` with `"missing_field"`.
- [ ] Submitting `{ "name": "   " }` (whitespace-only) returns `422` with `"missing_field"` after trimming.
- [ ] Submitting a name with leading/trailing whitespace like `"  acme  "` is trimmed to `"acme"` and accepted.
- [ ] Submitting a name that is exactly 39 characters succeeds.
- [ ] Submitting a name that is exactly 40 characters returns `422`.
- [ ] Submitting a name that is exactly 255 characters is rejected (exceeds 39-character rule).
- [ ] Submitting a name that is 256 characters returns `422` with `"invalid"` on `name`.
- [ ] Submitting `{ "name": "valid", "visibility": "internal" }` returns `422` with `"invalid"` on `visibility`.
- [ ] Submitting `{ "name": "valid", "visibility": "" }` defaults visibility to `"public"`.
- [ ] Submitting a name containing special characters like `"acme_corp"` or `"acme.corp"` or `"acme corp"` returns `422`.
- [ ] Submitting `{ "name": "-acme" }` (starts with hyphen) returns `422`.
- [ ] Submitting `{ "name": "acme-" }` (ends with hyphen) returns `422`.
- [ ] Submitting `{ "name": "ac--me" }` (consecutive hyphens) returns `422`.
- [ ] Creating an organization with the same name as an existing one but different casing (e.g., `"ACME"` when `"acme"` exists) returns `409`.
- [ ] Creating two organizations with completely different names in rapid succession both succeed.
- [ ] A description containing emoji `"🚀 Our team"` is stored and returned with correct encoding.
- [ ] A description of exactly 2048 characters succeeds.
- [ ] A description of 2049 characters returns `422`.
- [ ] An organization with `visibility: "private"` is successfully created and the creator can view it.
- [ ] Creating an org with only the `name` field (no `description`, no `visibility`) succeeds with defaults applied.
- [ ] The `Content-Type` header on the request must be `application/json`. Non-JSON content types are rejected.

## Design

### API Shape

#### `POST /api/orgs`

**Description:** Create a new organization. The authenticated user becomes the owner.

**Authentication:** Required. Session cookie or PAT `Authorization` header.

**Request body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | — | Organization name. 1–39 characters, `[a-zA-Z0-9-]`, no leading/trailing/consecutive hyphens. |
| `description` | string | No | `""` | Organization description. Max 2048 characters. Unicode allowed. |
| `visibility` | string | No | `"public"` | One of `"public"`, `"limited"`, `"private"`. |

**Example request:**

```json
{
  "name": "acme-corp",
  "description": "Acme Corporation engineering team",
  "visibility": "public"
}
```

**Success response — `201 Created`:**

```json
{
  "id": 42,
  "name": "acme-corp",
  "lower_name": "acme-corp",
  "description": "Acme Corporation engineering team",
  "visibility": "public",
  "website": "",
  "location": "",
  "created_at": "2026-03-21T12:00:00.000Z",
  "updated_at": "2026-03-21T12:00:00.000Z"
}
```

**Response headers:**

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |

**Error responses:**

| Status | Condition | Body |
|--------|-----------|------|
| `401 Unauthorized` | No valid session or token | `{ "message": "authentication required" }` |
| `409 Conflict` | Organization name already taken (case-insensitive) | `{ "message": "organization name already exists" }` |
| `422 Unprocessable Entity` | Name missing or empty | `{ "message": "validation failed", "errors": [{ "resource": "Organization", "field": "name", "code": "missing_field" }] }` |
| `422 Unprocessable Entity` | Name exceeds max length or contains invalid characters | `{ "message": "validation failed", "errors": [{ "resource": "Organization", "field": "name", "code": "invalid" }] }` |
| `422 Unprocessable Entity` | Visibility is not a valid enum value | `{ "message": "validation failed", "errors": [{ "resource": "Organization", "field": "visibility", "code": "invalid" }] }` |
| `422 Unprocessable Entity` | Description exceeds 2048 characters | `{ "message": "validation failed", "errors": [{ "resource": "Organization", "field": "description", "code": "invalid" }] }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "message": "rate limit exceeded" }` with `Retry-After` header |

### SDK Shape

The SDK `OrgService` exposes:

```typescript
createOrg(
  actor: User,
  req: CreateOrgRequest
): Promise<Result<Organization, APIError>>
```

Where:

```typescript
interface CreateOrgRequest {
  name: string;
  description: string;
  visibility: string;
}

interface Organization {
  id: number;
  name: string;
  lower_name: string;
  description: string;
  visibility: string;
  website: string;
  location: string;
  created_at: string;
  updated_at: string;
}
```

The method:
1. Validates that `actor` is non-null (returns 401 otherwise).
2. Trims and validates the `name` field: non-empty, at most 39 characters, matches `[a-zA-Z0-9-]` pattern, no leading/trailing/consecutive hyphens.
3. Defaults `visibility` to `"public"` if empty. Validates it is one of the three allowed values.
4. Defaults `description` to `""` if empty. Validates length ≤ 2048 characters.
5. Inserts the organization into the database with `lower_name` = `name.toLowerCase()`.
6. If insert fails with a unique violation, returns `409` conflict error.
7. Adds the `actor` as an `"owner"` member of the organization.
8. Returns the mapped `Organization` object.

### CLI Command

#### `codeplane org create <name>`

**Description:** Create a new organization.

**Authentication:** Required. Uses the stored CLI session token.

**Arguments:**

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Organization name |

**Options:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--description` | string | `""` | Organization description |
| `--visibility` | enum | `"public"` | One of `public`, `limited`, `private` |

**Example usage:**

```bash
codeplane org create acme-corp --description "Acme Corporation" --visibility public
```

**Output (human-readable, default):**

```
Organization "acme-corp" created successfully.

Name:        acme-corp
Visibility:  public
Description: Acme Corporation
```

**Output (JSON, with `--json`):**

```json
{
  "id": 42,
  "name": "acme-corp",
  "lower_name": "acme-corp",
  "description": "Acme Corporation",
  "visibility": "public",
  "website": "",
  "location": "",
  "created_at": "2026-03-21T12:00:00.000Z",
  "updated_at": "2026-03-21T12:00:00.000Z"
}
```

**Error behavior:**
- Running `codeplane org create` without a name → non-zero exit code, stderr: `Error: missing required argument "name"`
- Running without authentication → non-zero exit code, stderr: `Error: authentication required`
- Duplicate name → non-zero exit code, stderr: `Error: organization name already exists`

**Known bug (to be fixed):** The CLI currently sends `username: c.args.name` instead of `name: c.args.name` in the POST body, causing the API to receive an empty `name` field and return a validation error. This must be corrected to `name: c.args.name`.

### TUI UI

The TUI should support organization creation through an interactive form:

```
┌── Create Organization ──────────────────────────────────────┐
│                                                              │
│  Name:         [________________________]                    │
│                                                              │
│  Description:  [________________________]                    │
│                                                              │
│  Visibility:   ( • ) Public                                  │
│                (   ) Limited                                 │
│                (   ) Private                                 │
│                                                              │
│  [ Create ]  [ Cancel ]                                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- The `Name` field is required. The form does not submit if it is empty.
- Inline validation shows an error message below the name field if the name is invalid (empty, too long, contains invalid characters).
- `Description` is optional. The field accepts multi-line input or wraps long text.
- `Visibility` defaults to "Public" with a radio-button selector.
- On success, the TUI navigates to the newly created organization's detail screen.
- On conflict (duplicate name), the TUI shows an inline error: `"Organization name already taken"`.
- On auth failure, the TUI displays `"Authentication required"` and navigates to login.
- Press Escape or select Cancel to return to the previous screen without creating.

### Web UI Design

The web UI should provide an organization creation page accessible from the user's organizations list (settings sidebar → Organizations → "New organization" button):

**"New Organization" page:**
- A form with three fields:
  - **Name** — single-line text input with live validation. Shows character count. Highlights errors inline (e.g., "Name is required", "Name already taken", "Only letters, numbers, and hyphens allowed").
  - **Description** — multi-line textarea, optional. Shows character count approaching 2048.
  - **Visibility** — radio group with three options: Public (default, with helper text "Visible to everyone"), Limited ("Visible to authenticated users"), Private ("Visible to members only").
- A "Create organization" primary button that is disabled until the name field is valid.
- On success, redirect to the new organization's page at `/:orgname`.
- On 409 conflict, show an inline error below the name field: "This organization name is already taken."
- On 422 validation error, show the relevant field error inline.
- On network error, show a toast notification: "Failed to create organization. Please try again."

### Documentation

The following end-user documentation should be written:

1. **API Reference — Create Organization:** Document `POST /api/orgs` with request/response examples, all error codes, field constraints, and authentication requirements. Include notes on name uniqueness being case-insensitive and the automatic owner membership assignment.
2. **CLI Reference — `codeplane org create`:** Document the command with usage examples, flag descriptions, output examples in both human-readable and JSON formats, and error behavior for missing names, auth failures, and duplicate names.
3. **User Guide — Creating and Managing Organizations:** A getting-started guide explaining how to create an organization, what the visibility levels mean, how membership works (creator becomes owner), and next steps after creation (inviting members, creating teams, adding repos). Include screenshots or CLI output examples for each client.

## Permissions & Security

### Authorization Model

| Role | Can create an organization? |
|------|---------------------------|
| Anonymous (unauthenticated) | ❌ No — returns 401 |
| Authenticated user | ✅ Yes — any authenticated user can create organizations |
| PAT-authenticated caller | ✅ Yes — if the token is valid and not expired/revoked |
| Admin | ✅ Yes — admins can create organizations (same as any authenticated user) |

Organization creation is a user-level action. It does not require any pre-existing organizational role because the user is creating a new entity. The creator is automatically assigned the `"owner"` role in the new organization.

There is no limit on the number of organizations a single user can create (beyond rate limiting). If a limit is needed in the future, it should be enforced as a quota in the billing/plan system.

### Rate Limiting

- **Authenticated callers:** 10 requests per minute per user for organization creation. This is deliberately lower than read endpoints because org creation is a write operation and abuse (mass org name squatting) must be prevented.
- **Rate limit response:** `429 Too Many Requests` with `Retry-After` header indicating seconds until reset.
- **Rate limiting is enforced after authentication.** Unauthenticated requests receive `401` before any rate limit check.

### Data Privacy Constraints

- **No PII in request:** The request body contains `name`, `description`, and `visibility` — no personal data fields.
- **No cross-user impact:** Creating an organization does not expose any information about other users. The response contains only the created organization's own data.
- **Name squatting risk:** Organization names are a shared namespace. Rate limiting and potentially reserved-name lists mitigate name squatting.
- **Visibility enforcement:** A `"private"` organization created via this endpoint is only visible to its members (the creator initially) through the `GET /api/orgs/:org` endpoint. The visibility constraint is enforced at read time, not just at creation.
- **Audit trail:** Organization creation events should be logged with the actor's user ID for accountability.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `OrgCreated` | On successful `201` response from `POST /api/orgs` | `user_id`, `org_id`, `org_name`, `visibility`, `has_description`, `client`, `response_time_ms` |
| `OrgCreateFailed` | On `422` or `409` error response from `POST /api/orgs` | `user_id`, `client`, `error_code` (`missing_field`, `invalid`, `conflict`), `error_field`, `response_time_ms` |
| `OrgCreateUnauthorized` | On `401` response | `client`, `client_ip` (hashed), `auth_method_attempted` |

### Event Properties

- `user_id` (number): The authenticated user's ID.
- `org_id` (number): The ID of the newly created organization (only on success).
- `org_name` (string): The organization name (only on success).
- `visibility` (string enum): One of `"public"`, `"limited"`, `"private"`.
- `has_description` (boolean): Whether a non-empty description was provided.
- `client` (string enum): One of `"web"`, `"cli"`, `"tui"`, `"api"`, `"desktop"`, `"vscode"`, `"neovim"`.
- `response_time_ms` (number): Server-side response latency in milliseconds.
- `error_code` (string): The validation error code or `"conflict"`.
- `error_field` (string): The field that failed validation (e.g., `"name"`, `"visibility"`).
- `client_ip` (string): Hashed IP address for unauthorized attempt analysis (never stored as raw IP).
- `auth_method_attempted` (string enum): One of `"cookie"`, `"pat"`, `"none"`.

### Funnel Metrics and Success Indicators

- **Org creation volume:** Total `OrgCreated` events per day, segmented by client. Primary adoption metric for the organizations feature.
- **Org creation success rate:** Ratio of `OrgCreated` to (`OrgCreated` + `OrgCreateFailed`). Should be > 90%. A lower rate suggests UX issues with validation feedback or name availability.
- **Client distribution:** Breakdown of `client` values across `OrgCreated` events. Indicates which surfaces are most used for org creation.
- **Visibility distribution:** Percentage of orgs created with each visibility level. Indicates whether users understand and use the visibility model.
- **Description adoption:** Percentage of `OrgCreated` events where `has_description` is `true`. Low adoption may suggest the field is not prominent enough in the UI.
- **Conflict rate:** Ratio of `OrgCreateFailed` events with `error_code: "conflict"` to total creation attempts. A high rate (> 20%) indicates name contention and may justify adding name availability checking.
- **Time from signup to first org creation:** Measured by joining `UserCreated` and first `OrgCreated` events per user. Key onboarding funnel metric.
- **Org → first repo creation:** Percentage of `OrgCreated` events followed by a repo creation event in the same org within 24 hours. Indicates whether org creation leads to productive usage.

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Condition |
|-----------|-------|-------------------|----------|
| Org creation request received | `DEBUG` | `user_id`, `request_id`, `org_name` (masked if > 20 chars) | Every authenticated request |
| Org created successfully | `INFO` | `user_id`, `request_id`, `org_id`, `org_name`, `visibility`, `duration_ms` | 201 response |
| Org creation validation failed | `WARN` | `user_id`, `request_id`, `error_field`, `error_code` | 422 response |
| Org creation conflict | `WARN` | `user_id`, `request_id`, `org_name` | 409 response |
| Org creation unauthorized | `WARN` | `request_id`, `client_ip`, `auth_method_attempted` | 401 response |
| Org creation internal error | `ERROR` | `user_id`, `request_id`, `error_message`, `stack_trace` | 500 response |
| Rate limit exceeded on org create | `WARN` | `user_id`, `request_id`, `rate_limit_bucket` | 429 response |
| Owner membership added | `DEBUG` | `user_id`, `request_id`, `org_id` | After successful org insert |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_org_create_requests_total` | Counter | `status` (201, 401, 409, 422, 429, 500), `client` | Total org creation requests |
| `codeplane_org_create_request_duration_seconds` | Histogram | `status` | Response latency distribution (buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_org_create_validation_errors_total` | Counter | `field` (name, description, visibility), `code` (missing_field, invalid) | Validation error breakdown |
| `codeplane_org_create_conflicts_total` | Counter | — | Total duplicate-name conflict errors |
| `codeplane_orgs_created_total` | Counter | `visibility` | Total organizations successfully created (cumulative) |

### Alerts

#### Alert: Org Create Endpoint Elevated Latency

**Condition:** `histogram_quantile(0.99, rate(codeplane_org_create_request_duration_seconds_bucket[5m])) > 2.0` sustained for 5 minutes.

**Severity:** Warning

**Runbook:**
1. Check database connection pool health via `SELECT count(*) FROM pg_stat_activity;`.
2. Check if the `organizations` table has excessive bloat or missing indexes on `lower_name`.
3. Run `EXPLAIN ANALYZE` on the `INSERT INTO organizations` statement with a test name to check for lock contention.
4. Check if the `addOrgMember` step is slow: verify the `org_members` table has indexes on `(organization_id, user_id)`.
5. Check if the server is under memory pressure or CPU contention from concurrent requests.
6. Check for lock contention: run `SELECT * FROM pg_locks WHERE NOT granted;` to see if organization inserts are blocked.

#### Alert: Org Create Endpoint 5xx Spike

**Condition:** `rate(codeplane_org_create_requests_total{status="500"}[5m]) > 0.05` sustained for 5 minutes.

**Severity:** Critical

**Runbook:**
1. Check server error logs for stack traces on the org creation route (`POST /api/orgs`).
2. Common causes: database connection failure, `organizations` table schema mismatch, `org_members` foreign key constraint failure, `mapOrganization` mapping error.
3. Verify database connectivity: attempt a direct `SELECT 1` query.
4. Check if the `addOrgMember` insert is failing after org creation succeeds. This would leave an orphaned org without an owner — check for orgs with zero members: `SELECT o.id, o.name FROM organizations o LEFT JOIN org_members m ON o.id = m.organization_id WHERE m.id IS NULL;`.
5. Check for recent deployments. If the 5xx spike correlates with a deploy, consider rolling back.
6. Verify that the `organizations` table schema matches the expected columns returned by the `RETURNING` clause.

#### Alert: Elevated Org Name Conflict Rate

**Condition:** `rate(codeplane_org_create_conflicts_total[15m]) / rate(codeplane_org_create_requests_total{status=~"201|409"}[15m]) > 0.3` sustained for 15 minutes.

**Severity:** Warning

**Runbook:**
1. Check if a single user or IP is attempting to squat organization names in bulk. Query recent `OrgCreateFailed` events with `error_code: "conflict"` to see the user distribution.
2. If a single user is responsible: review whether rate limiting is working. Tighten the org creation rate limit if needed.
3. If the conflicts are spread across many users: the namespace may be getting crowded. Consider adding a name availability check endpoint to reduce failed creation attempts.
4. Check for bot activity by correlating with auth logs and request patterns.

#### Alert: Org Create Unauthorized Spike

**Condition:** `rate(codeplane_org_create_requests_total{status="401"}[5m]) > 5` sustained for 10 minutes.

**Severity:** Warning

**Runbook:**
1. Check if a deployment broke session or PAT validation middleware.
2. Query recent `OrgCreateUnauthorized` events to understand `auth_method_attempted` distribution.
3. If all are `"cookie"`: check session storage health and cookie domain configuration.
4. If all are `"pat"`: check PAT validation logic and token expiry handling.
5. If from a single IP block: investigate for automated abuse attempts. Consider IP-level rate limiting.
6. Verify that auth middleware is correctly loaded and running before the org creation route handler.

### Error Cases and Failure Modes

| Failure Mode | Expected Behavior | User-Visible Error |
|---|---|---|
| No auth cookie or PAT provided | 401 Unauthorized | `"authentication required"` |
| Expired or revoked PAT | 401 Unauthorized | `"authentication required"` |
| Empty or whitespace-only name | 422 Unprocessable Entity | `"validation failed"` with `missing_field` on `name` |
| Name exceeds 39 characters | 422 Unprocessable Entity | `"validation failed"` with `invalid` on `name` |
| Name exceeds 255 characters | 422 Unprocessable Entity | `"validation failed"` with `invalid` on `name` |
| Name contains invalid characters | 422 Unprocessable Entity | `"validation failed"` with `invalid` on `name` |
| Name starts/ends with hyphen | 422 Unprocessable Entity | `"validation failed"` with `invalid` on `name` |
| Name contains consecutive hyphens | 422 Unprocessable Entity | `"validation failed"` with `invalid` on `name` |
| Duplicate name (case-insensitive) | 409 Conflict | `"organization name already exists"` |
| Invalid visibility value | 422 Unprocessable Entity | `"validation failed"` with `invalid` on `visibility` |
| Description exceeds 2048 characters | 422 Unprocessable Entity | `"validation failed"` with `invalid` on `description` |
| Database connection lost | 500 Internal Server Error | `"failed to create organization"` |
| `addOrgMember` fails after org insert | 500 Internal Server Error | `"failed to create organization"` (orphaned org possible) |
| Non-JSON Content-Type on request | 400 Bad Request | `"content-type must be application/json"` |
| Malformed JSON body | 400 Bad Request | `"invalid JSON"` |
| Rate limit exceeded | 429 Too Many Requests | `"rate limit exceeded"` with `Retry-After` header |
| Concurrent requests for same name | One succeeds (201), the other gets 409 | Second request: `"organization name already exists"` |

## Verification

### API Integration Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 1 | `POST /api/orgs returns 201 with correct shape` | Authenticate as a user. Send `{ "name": "test-org", "description": "Test", "visibility": "public" }`. Assert 201 and response has all 9 fields: `id`, `name`, `lower_name`, `description`, `visibility`, `website`, `location`, `created_at`, `updated_at`. |
| 2 | `POST /api/orgs sets name correctly` | Create org with `name: "my-org"`. Assert `response.name === "my-org"` and `response.lower_name === "my-org"`. |
| 3 | `POST /api/orgs preserves original casing in name` | Create org with `name: "MyOrg"`. Assert `response.name === "MyOrg"` and `response.lower_name === "myorg"`. |
| 4 | `POST /api/orgs defaults description to empty string` | Create org with only `name`. Assert `response.description === ""`. |
| 5 | `POST /api/orgs defaults visibility to public` | Create org with only `name`. Assert `response.visibility === "public"`. |
| 6 | `POST /api/orgs accepts visibility limited` | Create org with `visibility: "limited"`. Assert `response.visibility === "limited"`. |
| 7 | `POST /api/orgs accepts visibility private` | Create org with `visibility: "private"`. Assert `response.visibility === "private"`. |
| 8 | `POST /api/orgs sets website and location to empty` | Create org. Assert `response.website === ""` and `response.location === ""`. |
| 9 | `POST /api/orgs sets created_at and updated_at` | Create org. Assert `created_at` and `updated_at` are valid ISO 8601 strings and are equal. |
| 10 | `POST /api/orgs id is a positive integer` | Create org. Assert `typeof response.id === "number"` and `response.id > 0`. |
| 11 | `POST /api/orgs creator becomes owner` | Create org. Call `GET /api/orgs/:org/members`. Assert the creator appears with `role: "owner"`. |
| 12 | `POST /api/orgs org appears in user org list` | Create org. Call `GET /api/user/orgs`. Assert the new org appears in the list. |
| 13 | `POST /api/orgs org is accessible via GET` | Create org named `"test-view"`. Call `GET /api/orgs/test-view`. Assert 200 and matching org data. |
| 14 | `POST /api/orgs without auth returns 401` | Send request with no auth. Assert 401 with `{ "message": "authentication required" }`. |
| 15 | `POST /api/orgs with expired PAT returns 401` | Create and revoke a PAT. Send request with revoked PAT. Assert 401. |
| 16 | `POST /api/orgs with valid PAT returns 201` | Create org using PAT authentication. Assert 201. |
| 17 | `POST /api/orgs empty body returns 422` | Send `{}`. Assert 422 with `errors[0].field === "name"` and `errors[0].code === "missing_field"`. |
| 18 | `POST /api/orgs empty name returns 422` | Send `{ "name": "" }`. Assert 422 with `missing_field` on `name`. |
| 19 | `POST /api/orgs whitespace-only name returns 422` | Send `{ "name": "   " }`. Assert 422 with `missing_field` on `name`. |
| 20 | `POST /api/orgs name with leading/trailing whitespace is trimmed` | Send `{ "name": "  acme  " }`. Assert 201 and `response.name === "acme"`. |
| 21 | `POST /api/orgs name at maximum valid length (39 chars) succeeds` | Send name of exactly 39 `[a-z0-9]` characters. Assert 201. |
| 22 | `POST /api/orgs name at 40 chars returns 422` | Send name of 40 characters. Assert 422 with `invalid` on `name`. |
| 23 | `POST /api/orgs name at 256 chars returns 422` | Send name of 256 characters. Assert 422 with `invalid` on `name`. |
| 24 | `POST /api/orgs name with underscore returns 422` | Send `{ "name": "acme_corp" }`. Assert 422. |
| 25 | `POST /api/orgs name with period returns 422` | Send `{ "name": "acme.corp" }`. Assert 422. |
| 26 | `POST /api/orgs name with space returns 422` | Send `{ "name": "acme corp" }`. Assert 422. |
| 27 | `POST /api/orgs name starting with hyphen returns 422` | Send `{ "name": "-acme" }`. Assert 422. |
| 28 | `POST /api/orgs name ending with hyphen returns 422` | Send `{ "name": "acme-" }`. Assert 422. |
| 29 | `POST /api/orgs name with consecutive hyphens returns 422` | Send `{ "name": "ac--me" }`. Assert 422. |
| 30 | `POST /api/orgs single character name succeeds` | Send `{ "name": "a" }`. Assert 201. |
| 31 | `POST /api/orgs numeric name succeeds` | Send `{ "name": "123" }`. Assert 201. |
| 32 | `POST /api/orgs name with valid hyphens succeeds` | Send `{ "name": "my-cool-org" }`. Assert 201. |
| 33 | `POST /api/orgs duplicate name returns 409` | Create org `"unique-org"`. Create org `"unique-org"` again. Assert second request returns 409 with `"organization name already exists"`. |
| 34 | `POST /api/orgs duplicate name different casing returns 409` | Create org `"CaseOrg"`. Create org `"caseorg"`. Assert second request returns 409. |
| 35 | `POST /api/orgs invalid visibility returns 422` | Send `{ "name": "v-org", "visibility": "internal" }`. Assert 422 with `invalid` on `visibility`. |
| 36 | `POST /api/orgs empty visibility defaults to public` | Send `{ "name": "v-org2", "visibility": "" }`. Assert 201 and `visibility === "public"`. |
| 37 | `POST /api/orgs description with Unicode emoji` | Send `{ "name": "emoji-org", "description": "🚀 Launch team" }`. Assert 201 and description round-trips correctly. |
| 38 | `POST /api/orgs description with CJK characters` | Send `{ "name": "cjk-org", "description": "日本語の説明" }`. Assert 201 and description round-trips correctly. |
| 39 | `POST /api/orgs description at max length (2048 chars) succeeds` | Send description of exactly 2048 characters. Assert 201. |
| 40 | `POST /api/orgs description exceeding max (2049 chars) returns 422` | Send description of 2049 characters. Assert 422 with `invalid` on `description`. |
| 41 | `POST /api/orgs response Content-Type is application/json` | Assert response `Content-Type` header is `application/json`. |
| 42 | `POST /api/orgs with non-JSON Content-Type returns error` | Send request with `Content-Type: text/plain`. Assert 400. |
| 43 | `POST /api/orgs with malformed JSON returns error` | Send `{ invalid json`. Assert 400. |
| 44 | `POST /api/orgs idempotency check` | Create org `"idem-org"`, note the response. Try creating `"idem-org"` again. Assert 409 (not a duplicate 201). |
| 45 | `POST /api/orgs concurrent requests for same name` | Send two simultaneous requests for `"race-org"`. Assert exactly one succeeds with 201 and the other returns 409. |
| 46 | `POST /api/orgs two different names in rapid succession both succeed` | Create `"rapid-a"` and `"rapid-b"` concurrently. Assert both return 201 with different IDs. |
| 47 | `POST /api/orgs private org is accessible by creator` | Create private org. Call `GET /api/orgs/:org` as creator. Assert 200. |
| 48 | `POST /api/orgs private org is not accessible by non-member` | Create private org as user A. Call `GET /api/orgs/:org` as user B (not a member). Assert 403. |

### CLI E2E Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 49 | `codeplane org create creates org with correct name` | Run `codeplane org create test-cli-org --json`. Assert exit code 0. Parse JSON output. Assert `name === "test-cli-org"`. |
| 50 | `codeplane org create with description` | Run `codeplane org create desc-org --description "My org" --json`. Assert `description === "My org"`. |
| 51 | `codeplane org create with visibility` | Run `codeplane org create vis-org --visibility private --json`. Assert `visibility === "private"`. |
| 52 | `codeplane org create defaults visibility to public` | Run `codeplane org create def-org --json`. Assert `visibility === "public"`. |
| 53 | `codeplane org create defaults description to empty` | Run `codeplane org create nodef-org --json`. Assert `description === ""`. |
| 54 | `codeplane org create JSON output has all fields` | Run `codeplane org create fields-org --json`. Assert output contains `id`, `name`, `lower_name`, `description`, `visibility`, `website`, `location`, `created_at`, `updated_at`. |
| 55 | `codeplane org create without name errors` | Run `codeplane org create` (no name arg). Assert non-zero exit code. |
| 56 | `codeplane org create without auth errors` | Run `codeplane org create noauth-org` without authentication. Assert non-zero exit code and stderr contains `"authentication required"`. |
| 57 | `codeplane org create duplicate name errors` | Run `codeplane org create dup-org` twice. Assert second run has non-zero exit code and stderr contains `"already exists"`. |
| 58 | `codeplane org create with invalid visibility errors` | Run `codeplane org create bad-vis-org --visibility internal`. Assert non-zero exit code. |
| 59 | `codeplane org create new org appears in org list` | Run `codeplane org create list-test-org`. Run `codeplane org list --json`. Assert `list-test-org` appears in the list. |
| 60 | `codeplane org create name sends correctly to API` | Run `codeplane org create api-name-org --json`. Assert response `name === "api-name-org"` (verifies the CLI sends `name` not `username` in the POST body). |

### Web UI E2E Tests (Playwright)

| # | Test Name | Description |
|---|-----------|-------------|
| 61 | `New organization page loads` | Navigate to the new organization page while authenticated. Assert the form renders with name, description, and visibility fields. |
| 62 | `Create organization with valid name` | Fill in name `"pw-test-org"`, submit. Assert redirect to `/:orgname` and the org page loads. |
| 63 | `Create organization with all fields` | Fill in name, description, set visibility to private, submit. Assert success and redirect. |
| 64 | `Create button disabled with empty name` | Load the form. Assert the Create button is disabled before entering a name. |
| 65 | `Inline validation shows error for empty name on blur` | Focus and blur the name field without typing. Assert an inline error message appears. |
| 66 | `Inline validation shows error for invalid characters` | Type `"bad_name"` in the name field. Assert inline error about allowed characters. |
| 67 | `Duplicate name shows inline error` | Create org `"dup-pw-org"` via API. In the form, type `"dup-pw-org"` and submit. Assert inline error `"already taken"`. |
| 68 | `Visibility defaults to public` | Load the form. Assert the "Public" radio is selected by default. |
| 69 | `New organization page requires authentication` | Navigate to the new org page while unauthenticated. Assert redirect to login. |

### TUI Integration Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 70 | `TUI org create form renders` | Navigate to org creation in TUI. Assert form shows name, description, and visibility fields. |
| 71 | `TUI org create with valid input succeeds` | Fill in name and submit. Assert navigation to org detail screen. |
| 72 | `TUI org create with empty name shows error` | Submit form without entering a name. Assert inline error message. |
| 73 | `TUI org create with duplicate name shows error` | Create org via API. Try creating same name in TUI. Assert conflict error message. |
| 74 | `TUI org create cancel returns to previous screen` | Press Escape on creation form. Assert return to organizations list. |

### Rate Limiting Tests

| # | Test Name | Description |
|---|-----------|-------------|
| 75 | `Org create returns 429 after rate limit exceeded` | Send 11 org creation requests in rapid succession. Assert at least one returns 429. |
| 76 | `Org create returns Retry-After header on 429` | Trigger rate limit. Assert `Retry-After` header is present and contains a positive integer. |
| 77 | `Org create rejects unauthenticated before rate limiting` | Send unauthenticated request. Assert 401 (not 429). |
