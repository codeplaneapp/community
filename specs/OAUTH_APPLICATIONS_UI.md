# OAUTH_APPLICATIONS_UI

Specification for OAUTH_APPLICATIONS_UI.

## High-Level User POV

When you navigate to your user settings in Codeplane, the OAuth Applications page is your central workspace for managing every third-party integration you've built on top of the Codeplane platform. This is where you register, inspect, and remove the OAuth2 applications that allow your web apps, mobile clients, CI bots, and internal dashboards to access Codeplane on behalf of your users.

The page lives under **Settings → OAuth Applications** and presents your registered applications as a clear, scannable table. Each row shows the application's name, its client ID (the identifier you embed in your integration code), whether it's a confidential or public client, the scopes it's allowed to request, and when it was created. From any row, you can view full details or delete the application entirely. If you haven't registered any applications yet, the page greets you with a friendly empty state that explains what OAuth applications are and gives you a one-click path to creating your first one.

Creating a new application is a straightforward form flow. You name your application, provide one or more redirect URIs where Codeplane will send users after they approve or deny access, choose whether it's a confidential client (server-side) or public client (SPA, mobile, CLI), and optionally select the maximum scopes it can request. After you submit, Codeplane generates a unique client ID and — for confidential clients — a client secret. The client secret is shown exactly once in a modal dialog with copy buttons and a clear warning. You must acknowledge that you've stored the secret before you can dismiss the modal. If you lose the secret, your only option is to delete the application and create a new one.

The application detail view lets you verify a redirect URI before debugging a flow, copy the client ID for embedding in code, confirm which scopes are configured, or delete the application. Deletion is permanent and immediate — it revokes every token the application ever issued, invalidates its client ID and secret, and removes it from your list. A confirmation dialog that requires you to type the application name protects against accidental deletion.

Every action available in the web UI is also available from the CLI (`codeplane auth oauth2 create`, `list`, `view <id>`, `delete <id>`), the raw API, and — for browsing and inspection — the TUI. The same data, the same ordering, the same security boundaries. Whether you're managing integrations in a browser, scripting a deployment pipeline, or working from a terminal, the experience is consistent.

This feature is essential for any developer or team building integrations with Codeplane. Without it, there is no way to register applications for OAuth2 authorization code flows, no way to audit existing integrations, and no way to clean up stale credentials. The OAuth Applications UI is the governance layer for the third-party developer ecosystem.

## Acceptance Criteria

## Definition of Done

The feature is complete when an authenticated user can manage the full lifecycle of OAuth2 applications — create, list, view, and delete — through the Web UI, CLI, and TUI, with consistent data, consistent security boundaries, and all edge cases below handled correctly.

## Functional Criteria — Web UI

### Settings Navigation
- [ ] The settings sidebar contains an "OAuth Applications" menu item with an appropriate icon.
- [ ] Clicking "OAuth Applications" navigates to `/settings/oauth-applications`.
- [ ] The sidebar item is visually highlighted when the user is on any `/settings/oauth-applications*` route.
- [ ] The settings sidebar renders consistently on every `/settings/*` page.

### Application List Page (`/settings/oauth-applications`)
- [ ] The page title is "OAuth2 Applications" with subtitle text explaining the feature.
- [ ] A "New Application" primary button is prominently placed in the header area.
- [ ] Applications are displayed in a table with columns: Name (clickable link), Client ID (monospace, with copy-to-clipboard button), Type ("Confidential" or "Public" badge), Scopes (comma-separated, collapsed with "+N more" when >3), Created (relative timestamp with full date tooltip).
- [ ] Applications are ordered newest-first (by `created_at` descending).
- [ ] Each row has a context menu or inline actions: "View details" and "Delete".
- [ ] The `client_secret` is never displayed anywhere on the list page.
- [ ] Newly created applications appear immediately in the list without requiring a page refresh.
- [ ] Deleted applications disappear immediately from the list.

### Empty State
- [ ] When the user has zero applications, the page shows an empty state with an icon/illustration, heading "No OAuth2 applications yet", body text explaining OAuth2 applications, a primary CTA "Register your first application", and a secondary documentation link.
- [ ] The "Register your first application" CTA navigates to the creation form.

### Loading State
- [ ] While the API request is in flight, the page shows a skeleton loader with 3 placeholder rows.
- [ ] Skeleton rows match the approximate dimensions of real data rows (no layout flash on load).

### Error State
- [ ] If the API returns a server error, the page shows an error banner: "Failed to load your applications. Please try again." with a "Retry" button.
- [ ] Clicking "Retry" re-fetches the data and replaces the error state with results or skeleton.

### Responsive Behavior
- [ ] On narrow viewports (<768px), the Scopes and Created columns are hidden.
- [ ] The Client ID column truncates to the first 12 characters with an ellipsis; full value available in tooltip.
- [ ] The list remains fully functional on mobile with a stacked card layout.

### Create Application Form
- [ ] Clicking "New Application" or the empty-state CTA opens the creation form.
- [ ] The form contains: Application name (text input, required), Redirect URIs (repeatable input with "Add URI" button, at least one required), Client type (radio group: "Confidential (server-side)" and "Public (SPA, mobile, desktop, CLI)", required), Scopes (checkbox group organized by domain, optional).
- [ ] The name input shows a character count indicator approaching 255 characters.
- [ ] Each redirect URI input validates on blur that the URI has a scheme and host.
- [ ] The "Create application" submit button is disabled until name and at least one valid redirect URI are provided.
- [ ] Inline validation errors appear next to the relevant field for invalid inputs.
- [ ] Server-side validation errors (422) are mapped to inline field errors.
- [ ] Server errors (500) appear as toast notifications.

### Post-Creation Secret Modal
- [ ] After successful creation, a modal displays the client ID and client secret with copy-to-clipboard buttons.
- [ ] A warning banner states: "Store the client secret now — it will not be shown again."
- [ ] A confirmation checkbox "I have stored the client secret" must be checked before the modal can be dismissed.
- [ ] After dismissing the modal, the application list updates with the new application (no secret visible).

### Application Detail Page (`/settings/oauth-applications/:id`)
- [ ] The page shows: Application name as heading with a "Confidential" or "Public" badge, Client ID (full, with copy button), Redirect URIs (full list, each as a clickable link), Scopes (as badges), Created timestamp (relative with tooltip), Last updated timestamp (relative with tooltip).
- [ ] Breadcrumb navigation: Settings > OAuth Applications > {App Name}.
- [ ] A security notice states: "The client secret was shown once at creation time and cannot be retrieved."
- [ ] A "Delete application" danger button is available.
- [ ] A "Back to applications" link navigates to `/settings/oauth-applications`.
- [ ] If the application is not found (404), the page shows "Application not found" with a back link.
- [ ] If unauthenticated, the user is redirected to the login page.

### Delete Confirmation
- [ ] Clicking "Delete" opens a confirmation dialog with the application name, a warning about permanent token revocation, and a text input where the user must type the application name exactly to enable the delete button.
- [ ] The delete button is red/destructive-styled, disabled until the typed name matches.
- [ ] Cancelling or pressing Escape dismisses the dialog with no effect.
- [ ] After successful deletion, the dialog closes, a success toast appears, and the application is removed from the list.
- [ ] If the server returns 500, the dialog stays open with an error message and the delete button re-enables.
- [ ] If the server returns 404 (concurrent deletion), the dialog closes with a warning toast and the table refreshes.

## Functional Criteria — CLI

- [ ] `codeplane auth oauth2 create --name "..." --redirect-uri "..." [--scopes "..."] [--confidential|--public]` creates an application and prints the client ID and one-time client secret with a warning.
- [ ] `codeplane auth oauth2 list` displays a tabular list of all applications (ID, Client ID, Name, Type, Scopes, Created). No client secret shown.
- [ ] `codeplane auth oauth2 view <id>` displays application details. No client secret shown.
- [ ] `codeplane auth oauth2 delete <id>` prompts for confirmation (type app name), then deletes. `--yes` skips the prompt.
- [ ] All CLI commands support `--json` for structured output.
- [ ] All CLI commands work via session cookie or PAT authentication.
- [ ] Unauthenticated CLI usage prints an error and exits with code 1.
- [ ] All commands are also accessible via `codeplane api /api/oauth2/applications [--method ...]`.

## Functional Criteria — TUI

- [ ] The TUI settings area includes an "OAuth Applications" screen reachable from navigation.
- [ ] The screen lists applications in a vertical layout with name, client ID, type, and created date.
- [ ] Selecting an application shows its detail view.
- [ ] No client secret is ever displayed in the TUI.
- [ ] Keyboard navigation supports scrolling, selection, and action triggering.

## Cross-Surface Consistency

- [ ] The API, Web UI, CLI, and TUI all display the same application data with the same field names and ordering.
- [ ] Applications created in any surface are immediately visible in all other surfaces.
- [ ] Applications deleted in any surface immediately disappear from all other surfaces.
- [ ] The `client_secret` is never exposed in any surface after the initial creation response.

## Edge Cases

- [ ] **Empty name**: Rejected with 422, inline error on name field.
- [ ] **Whitespace-only name**: Treated as empty after trimming, rejected.
- [ ] **Name at exactly 255 characters**: Accepted, displayed without truncation.
- [ ] **Name at 256 characters**: Rejected with 422.
- [ ] **Single-character name**: Accepted.
- [ ] **Unicode/emoji in name**: Accepted, rendered correctly across all surfaces.
- [ ] **Duplicate application names**: Allowed; each gets a unique client ID.
- [ ] **Empty redirect_uris array**: Rejected.
- [ ] **Redirect URI without scheme**: Rejected with indexed field error.
- [ ] **Redirect URI without host**: Rejected.
- [ ] **Custom scheme redirect URI (e.g., `myapp://callback`)**: Accepted.
- [ ] **Localhost redirect URI**: Accepted.
- [ ] **One valid + one invalid redirect URI**: Rejected (no partial creation).
- [ ] **Missing `confidential` field**: Rejected.
- [ ] **Scopes omitted**: Defaults to empty array.
- [ ] **Empty JSON body**: Rejected.
- [ ] **Non-JSON body**: Rejected with 400.
- [ ] **Non-integer application ID in URL**: Returns 400.
- [ ] **Application ID belonging to another user**: Returns 404 (not 403).
- [ ] **Concurrent deletion while viewing**: Detail page shows "not found" state.
- [ ] **Session expiry during interaction**: Subsequent actions redirect to login.
- [ ] **50 applications created**: All appear in the list without pagination cutoff.

## Boundary Constraints

- [ ] Application name: 1–255 characters after trimming. Unicode allowed.
- [ ] Redirect URIs: At least 1 required. Each must be a parseable URL with non-empty scheme and host. No maximum count enforced.
- [ ] `confidential`: Required boolean. No default value.
- [ ] `scopes`: Optional string array. Defaults to `[]`.
- [ ] `client_id`: 40 lowercase hexadecimal characters, system-generated.
- [ ] `client_secret`: `codeplane_oas_` prefix + 64 lowercase hexadecimal characters (74 total), system-generated, shown once.
- [ ] All timestamps: ISO 8601 UTC strings.
- [ ] Application list ordering: `created_at` descending (newest first).
- [ ] No pagination: full list returned in single response (expected cardinality <100 per user).

## Design

## Web UI Design

### Settings Navigation Integration

The OAuth Applications section integrates into the existing user settings sidebar as the last navigation item:

| Sidebar Item | Route | Icon |
|---|---|---|
| Settings Home | `/settings` | Gear |
| Profile | `/settings/profile` | User |
| Emails | `/settings/emails` | Mail |
| SSH Keys | `/settings/ssh-keys` | Key |
| Tokens | `/settings/tokens` | Token |
| Sessions | `/settings/sessions` | Shield |
| Connected Accounts | `/settings/connected-accounts` | Link |
| Notifications | `/settings/notifications` | Bell |
| **OAuth Applications** | `/settings/oauth-applications` | App/Grid |

The page uses the standard two-column settings layout: a fixed ~240px sidebar on the left, and a fluid content area on the right.

### Application List Page

**Route**: `/settings/oauth-applications`

**Header Area**:
- Page title: "OAuth2 Applications" (h1)
- Subtitle: "Manage third-party applications you've registered to access Codeplane on behalf of users."
- "New Application" primary button (top-right, accent color)

**Table Layout**:

| Column | Content | Behavior |
|--------|---------|----------|
| Name | Application name | Clickable link to detail view (`/settings/oauth-applications/:id`) |
| Client ID | 40-char hex string in monospace font | Copy-to-clipboard icon button. On narrow viewports, truncated to first 12 chars with `…`; full value in tooltip. |
| Type | "Confidential" or "Public" | Color-differentiated badge/pill (e.g., blue for confidential, green for public) |
| Scopes | Comma-separated scope names | Collapsed with "+N more" tooltip when more than 3 scopes. Empty scopes shown as "—" (em-dash). |
| Created | Relative timestamp (e.g., "3 days ago") | Full ISO 8601 datetime shown in tooltip on hover |
| Actions | Three-dot context menu | Menu items: "View details", "Delete" (destructive-styled) |

**Empty State**:
- Centered vertically in the content area
- Illustration or icon representing integrations/applications
- Heading: "No OAuth2 applications yet"
- Body: "Register an application to let third-party software access Codeplane on behalf of users."
- Primary CTA button: "Register your first application" (navigates to create form)
- Secondary link: "Learn about OAuth2 applications →" (opens documentation)

**Loading State**: 3 skeleton table rows with animated shimmer, matching real row height

**Error State**: Full-width error banner above where the table would render. "Failed to load your applications. Please try again." with "Retry" button.

### Create Application Form

**Route**: `/settings/oauth-applications/new` (or inline panel on the list page)

**Form Fields**:

1. **Application name** (text input)
   - Label: "Application name"
   - Placeholder: "e.g., My Dashboard App"
   - Required. Character count shown near the limit (e.g., "248/255")
   - Validation: 1–255 characters after trimming

2. **Redirect URIs** (repeatable input group)
   - Label: "Redirect URIs"
   - Helper text: "URLs where Codeplane redirects users after authorization. Must include a protocol (e.g., https://)."
   - Initial state: one empty URI input
   - "+ Add another URI" link below the last input
   - Each input has a remove button (except when only one remains)
   - Inline validation on blur: URI must have a non-empty scheme and host
   - Error message: "Invalid URL. Must include a protocol (e.g., https://) and host."

3. **Client type** (radio group)
   - Label: "Client type"
   - Option 1: "Confidential" — helper: "For server-side applications that can securely store a client secret."
   - Option 2: "Public" — helper: "For single-page apps, mobile apps, desktop apps, and CLI tools. Must use PKCE."
   - Required. No default selection.

4. **Scopes** (checkbox group)
   - Label: "Maximum scopes" (optional section)
   - Helper text: "Define the maximum permissions this application can request. Leave empty for unrestricted."
   - Grouped by domain: Repository, User, Organization, Issue, Notification
   - Each scope shows read/write variants as individual checkboxes
   - "Select all" checkbox at the top

**Submit Button**: "Create application" — disabled until name and at least one valid redirect URI are provided and a client type is selected. Shows loading spinner during submission.

**Cancel Button**: "Cancel" — returns to the application list.

### Post-Creation Secret Modal

**Triggered by**: Successful `201 Created` response from the API.

**Modal Content**:
- Title: "Application created successfully"
- Application name displayed prominently
- **Client ID** field: monospace, full value, with "Copy" button
- **Client Secret** field: monospace, full value, with "Copy" button
- Warning banner (amber/yellow): "⚠ Store the client secret now — it will not be shown again. If you lose it, you must delete this application and create a new one."
- Confirmation checkbox: "I have securely stored the client secret"
- "Done" button: disabled until the checkbox is checked
- The modal cannot be dismissed by clicking outside or pressing Escape until the checkbox is checked

### Application Detail Page

**Route**: `/settings/oauth-applications/:id`

**Breadcrumb**: Settings > OAuth Applications > {Application Name}

**Page Heading**: Application name as `<h1>` with a "Confidential" or "Public" badge adjacent.

**Detail Card** (labeled key-value layout):

| Label | Content | Notes |
|-------|---------|-------|
| Client ID | Full 40-char hex string, monospace | Copy-to-clipboard button |
| Client Type | "Confidential" or "Public" | Badge/pill styling |
| Redirect URIs | One URI per line | Each URI rendered as a clickable link (opens in new tab) |
| Scopes | Badges/pills for each scope | Grouped by domain if >6 scopes |
| Created | Relative timestamp | Full ISO 8601 in tooltip |
| Last Updated | Relative timestamp | Full ISO 8601 in tooltip |

**Security Notice**: Subtle callout below the detail card: "The client secret was shown once at creation time and cannot be retrieved. If you've lost it, delete this application and create a new one."

**Actions**:
- "Delete application" danger/destructive button → opens delete confirmation dialog
- "← Back to applications" link → navigates to `/settings/oauth-applications`

**Not-Found State**: Centered message "Application not found" with a "Back to OAuth Applications" link.

**Loading State**: Skeleton layout matching the detail card fields.

**Error State**: Error banner with "Retry" button.

### Delete Confirmation Dialog

**Trigger**: "Delete" action from list row context menu or detail page button.

**Dialog Content**:
1. Title: "Delete OAuth2 application?"
2. Body: "You are about to permanently delete **{application name}**. This will immediately revoke all access tokens and refresh tokens issued through this application. The client ID and client secret will stop working. This action cannot be undone."
3. Name confirmation input: Label: "Type the application name to confirm". Placeholder: application name.
4. Cancel button: dismisses the dialog.
5. Delete button: red/destructive styling, disabled until the typed text exactly matches the application name. Shows loading spinner during the API call.

**Post-Deletion**: Dialog closes, success toast "OAuth2 application \"{name}\" deleted.", table re-fetches to reflect removal.

**Keyboard Accessibility**: Dialog is focus-trapped. Tab cycles through input, cancel, and delete. Escape dismisses. Enter submits if the delete button is enabled.

---

## API Shape

### Application CRUD

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/oauth2/applications` | Session/PAT | Create application |
| `GET` | `/api/oauth2/applications` | Session/PAT | List user's applications |
| `GET` | `/api/oauth2/applications/:id` | Session/PAT | Get application details |
| `DELETE` | `/api/oauth2/applications/:id` | Session/PAT | Delete application |

**Create Request Body** (JSON):
```json
{
  "name": "My Integration",
  "redirect_uris": ["https://myapp.example.com/callback"],
  "scopes": ["read:repository", "read:user"],
  "confidential": true
}
```

**Create Response** (`201 Created`):
```json
{
  "id": 42,
  "client_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "client_secret": "codeplane_oas_64hexchars...",
  "name": "My Integration",
  "redirect_uris": ["https://myapp.example.com/callback"],
  "scopes": ["read:repository", "read:user"],
  "confidential": true,
  "created_at": "2026-03-21T10:00:00.000Z",
  "updated_at": "2026-03-21T10:00:00.000Z"
}
```

**List Response** (`200 OK`): Array of `OAuth2ApplicationResponse` objects (no `client_secret`, no `owner_id`), ordered by `created_at` DESC.

**Get Response** (`200 OK`): Single `OAuth2ApplicationResponse` object (no `client_secret`, no `owner_id`).

**Delete Response**: `204 No Content` with empty body.

**Standard Error Shapes**:

| Status | Shape |
|--------|-------|
| `400` | `{ "message": "invalid application id" }` or `{ "message": "invalid request body" }` |
| `401` | `{ "message": "authentication required" }` |
| `404` | `{ "message": "oauth2 application not found" }` |
| `422` | `{ "message": "Validation Failed", "errors": [{ "resource": "OAuth2Application", "field": "<field>", "code": "<code>" }] }` |
| `429` | Standard rate limit response |
| `500` | `{ "message": "..." }` |

---

## SDK Shape

The `OAuth2Service` class in `@codeplane/sdk` provides:

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

interface CreateOAuth2ApplicationResult extends OAuth2ApplicationResponse {
  client_secret: string; // One-time only
}

class OAuth2Service {
  createApplication(ownerID: number, req: CreateOAuth2ApplicationRequest): Promise<CreateOAuth2ApplicationResult>
  listApplications(ownerID: number): Promise<OAuth2ApplicationResponse[]>
  getApplication(appID: number, ownerID: number): Promise<OAuth2ApplicationResponse>
  deleteApplication(appID: number, ownerID: number): Promise<void>
}
```

The `toOAuth2ApplicationResponse()` mapper strips `client_secret_hash` and `owner_id` from database rows before returning to the route layer.

---

## CLI Commands

### `codeplane auth oauth2 create`

| Flag | Short | Required | Description |
|------|-------|----------|-------------|
| `--name` | `-n` | Yes | Application name |
| `--redirect-uri` | `-r` | Yes (repeatable) | Redirect URI |
| `--scopes` | `-s` | No | Comma-separated scope list |
| `--confidential` | | No | Confidential client |
| `--public` | | No | Public client |

**Output (standard)**:
```
Created OAuth2 application "My Integration"
Client ID:     a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2
Client Secret: codeplane_oas_64hexcharshere...

⚠ Store the client secret now — it will not be shown again.
```

**Output (JSON)**: Full creation response including `client_secret`.

### `codeplane auth oauth2 list`

**Output (table)**:
```
ID   CLIENT ID                                  NAME            TYPE           SCOPES                            CREATED
42   a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2   My CI Bot       Confidential   read:repository, write:repository  2026-03-21
41   f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5   My Mobile App   Public         read:user                          2026-03-20
```

**Empty state**: "No OAuth2 applications found."
**JSON mode**: Emits the full JSON array.

### `codeplane auth oauth2 view <id>`

**Aliases**: `get`

Displays application name, client ID, client type, scopes, redirect URIs, and timestamps. Never shows `client_secret`.

### `codeplane auth oauth2 delete <id>`

**Aliases**: `rm`, `remove`

Prompts for confirmation (type app name) unless `--yes` is passed. Prints success message or error.

All commands support `--json` output and are also accessible via `codeplane api /api/oauth2/applications [--method ...]`.

---

## TUI UI

The TUI includes an "OAuth Applications" screen in the settings area:

- **List view**: Vertical list of applications showing name, client ID (truncated), type, and created date.
- **Detail view**: Selected application expands to show full details in a key-value layout.
- **Navigation**: Arrow keys to scroll, Enter to select/view, `d` to trigger delete, `n` to create (delegates to CLI in a sub-shell).
- **No client secret displayed**: Security invariant maintained.
- **Empty state**: "No OAuth2 applications. Press 'n' to create one."

---

## Documentation

The following end-user documentation should be created or updated:

1. **OAuth2 Applications Guide** (`docs/guides/oauth2-applications.mdx`):
   - "Getting Started with OAuth2 Applications" — overview of what OAuth2 apps are and why to register one.
   - "Registering an Application" — step-by-step with screenshots for Web UI, CLI examples, and API curl examples.
   - "Viewing Your Applications" — how to find and inspect registered apps.
   - "Deleting an Application" — warnings about cascading token revocation, how to confirm.
   - "Confidential vs Public Clients" — when to choose each, PKCE requirement for public clients.
   - "Client Secret Security" — why the secret is shown once, what to do if lost.
   - "Scopes Reference" — table of available scopes and what each grants.

2. **CLI Reference** (`docs/cli/auth-oauth2.mdx`):
   - Full documentation for `create`, `list`, `view`, `delete` subcommands with all flags, examples, and exit codes.

3. **API Reference** (`docs/api/oauth2-applications.mdx`):
   - OpenAPI-style documentation for all four endpoints with request/response schemas, error codes, and curl examples.

4. **Settings Home Card**: The settings home page summary card for OAuth Applications should display the count of registered applications and link to the management page.

## Permissions & Security

## Authorization Roles

| Role | Create | List | View | Delete |
|------|--------|------|------|--------|
| Authenticated user (session cookie) — owns the application | ✅ | ✅ (own only) | ✅ (own only) | ✅ (own only) |
| Authenticated user (PAT) — owns the application | ✅ | ✅ (own only) | ✅ (own only) | ✅ (own only) |
| Authenticated user — does NOT own the application | ✅ (creates own) | ❌ (cannot see others') | ❌ (returns 404) | ❌ (returns 404) |
| OAuth2 access token (third-party) | ❌ | ❌ | ❌ | ❌ |
| Admin (for another user's applications) | ❌ | ❌ | ❌ | ❌ |
| Unauthenticated / Anonymous | ❌ (401) | ❌ (401) | ❌ (401) | ❌ (401) |

**Key security rules**:
- OAuth2 tokens carry third-party trust level and cannot create, view, or manage OAuth2 applications. Only first-party authentication (session cookie or PAT) is accepted.
- Admin role does NOT grant cross-user visibility or management of OAuth2 applications through these endpoints.
- Attempting to view or delete another user's application returns `404 Not Found` (never `403 Forbidden`) to prevent application ID enumeration.
- The `owner_id` is always sourced from the authenticated session, never from request parameters.

## Rate Limiting

| Endpoint | Limit | Category |
|----------|-------|----------|
| `POST /api/oauth2/applications` | Standard mutation rate limit (e.g., 30 req/min/user) | Write |
| `GET /api/oauth2/applications` | Standard read rate limit (e.g., 60 req/min/user) | Read |
| `GET /api/oauth2/applications/:id` | Standard read rate limit (e.g., 60 req/min/user) | Read |
| `DELETE /api/oauth2/applications/:id` | Standard mutation rate limit (e.g., 30 req/min/user) | Write |

**Burst protection**: The global rate limiter prevents any single user from flooding any endpoint.

**Per-user application count soft limit**: A ceiling of 100 applications per user should be enforced. Exceeding the limit returns `422` with a descriptive message: "Maximum number of OAuth2 applications reached."

**Enumeration protection**: Consistent `404` responses for both non-existent and non-owned applications, combined with rate limiting, prevent ID scanning attacks.

## Data Privacy & PII Constraints

- **Client secrets**: The raw `client_secret` is generated in memory, returned once in the creation response, and immediately discarded. Only the SHA-256 hash (`client_secret_hash`) is persisted. The raw secret MUST NEVER appear in logs, error messages, database query results, or any response after creation.
- **Client IDs**: Not secret but sensitive. Safe to display to the owning user. Never displayed to other users.
- **Application names**: User-supplied, may contain personal or organizational identifiers. Visible only to the owning user through management endpoints, and to authorizing users on the OAuth2 consent screen.
- **Redirect URIs**: May contain internal infrastructure URLs (staging environments, internal hostnames). Visible only to the owning user.
- **`owner_id`**: Never returned in any API response. Ownership is enforced server-side but not exposed.
- **Token data**: Access tokens, refresh tokens, and authorization codes are stored only as SHA-256 hashes. Raw values exist only in memory during issuance.
- **Audit logs**: Must include `application_id`, `client_id`, and `owner_id`, but MUST NEVER include raw client secrets, token values, or token hashes.

## Telemetry & Product Analytics

## Business Events

| Event | Properties | When Fired |
|-------|-----------|------------|
| `OAuth2ApplicationCreated` | `application_id`, `client_id`, `owner_id`, `confidential`, `scope_count`, `redirect_uri_count`, `surface` (`web`/`cli`/`api`), `timestamp` | On successful `201 Created` response |
| `OAuth2ApplicationCreateFailed` | `owner_id`, `error_code` (`validation`/`auth`/`system`), `error_field`, `surface`, `timestamp` | On validation or system error during creation |
| `OAuth2ApplicationsListed` | `user_id`, `application_count`, `surface`, `timestamp` | On successful list response |
| `OAuth2ApplicationViewed` | `application_id`, `client_id`, `owner_id`, `surface`, `confidential`, `timestamp` | On successful `200 OK` detail response |
| `OAuth2ApplicationViewNotFound` | `requested_id`, `user_id`, `surface`, `timestamp` | On `404` detail response |
| `OAuth2ApplicationDeleted` | `application_id`, `client_id`, `owner_id`, `confidential`, `application_age_days`, `access_tokens_revoked`, `refresh_tokens_revoked`, `surface`, `timestamp` | On successful `204 No Content` response |
| `OAuth2ApplicationDeleteFailed` | `owner_id`, `attempted_application_id`, `error_code`, `surface`, `timestamp` | On error during deletion |
| `OAuth2ApplicationDeleteConfirmationAborted` | `owner_id`, `application_id`, `surface` (`web`/`cli`), `timestamp` | User cancels confirmation dialog or CLI prompt |
| `OAuth2ApplicationEmptyStateViewed` | `user_id`, `surface`, `timestamp` | User views the list and has zero applications |
| `OAuth2ApplicationEmptyStateCTAClicked` | `user_id`, `surface`, `timestamp` | User clicks the empty-state CTA |
| `OAuth2ApplicationClientIdCopied` | `application_id`, `user_id`, `surface`, `page` (`list`/`detail`/`modal`), `timestamp` | User clicks copy button for client ID |
| `OAuth2ApplicationClientSecretCopied` | `application_id`, `user_id`, `timestamp` | User clicks copy button for client secret in creation modal |
| `OAuth2ApplicationSecretModalDismissed` | `application_id`, `user_id`, `time_open_seconds`, `secret_copied`, `timestamp` | User dismisses the post-creation secret modal |

## Funnel Metrics

1. **Empty-to-first-app conversion**: Users who see the empty state → users who create their first application within 7 days.
2. **Application-to-authorization conversion**: Applications created → applications whose `client_id` is used in at least one authorization code flow within 7 days. Target: >50%.
3. **Time to first authorization**: Median time between `OAuth2ApplicationCreated` and first successful authorization code exchange using that `client_id`.
4. **Creation form completion rate**: Users who open the creation form → users who successfully create an application. Target: >70%.
5. **List-to-detail navigation rate**: List views (with count > 0) → detail views. Indicates active application management.
6. **Delete-to-recreate rate**: Users who delete → users who create a new application within 24 hours. Indicates credential rotation behavior.
7. **Confirmation abort rate**: Delete confirmation aborts / total deletion attempts. Healthy range: 10–40%.
8. **Secret modal dwell time**: Median time the secret modal is open. Too short (<5 seconds) may indicate users are dismissing without storing.
9. **Confidential vs public split**: Ratio of confidential to public applications created — indicates developer ecosystem composition.
10. **Active developer count**: Unique users who invoke any OAuth application management endpoint at least once per month.

## Success Indicators

- Increasing number of unique users creating OAuth2 applications month-over-month.
- Application-to-authorization conversion rate >50% within 7 days.
- Creation form completion rate >70%.
- `OAuth2ApplicationCreateFailed` rate <5% of total creation attempts.
- `OAuth2ApplicationDeleteFailed` (system errors) <1% of total deletion attempts.
- Growing number of active OAuth2 tokens in circulation.
- Secret modal `secret_copied` rate >80% — indicates users are actually copying the secret.
- Low `OAuth2ApplicationViewNotFound` rate (<10%) — indicates users navigate via the list, not guessing IDs.

## Observability

## Logging Requirements

### Log Events

| Log Event | Level | Structured Context |
|-----------|-------|-------------------|
| OAuth2 application creation attempt | `info` | `owner_id`, `app_name` (truncated to 50 chars), `confidential`, `redirect_uri_count`, `scope_count` |
| OAuth2 application created successfully | `info` | `owner_id`, `application_id`, `client_id`, `confidential`, `duration_ms` |
| OAuth2 application creation validation failure | `warn` | `owner_id`, `field`, `error_code`, `request_id` |
| OAuth2 application creation system error | `error` | `owner_id`, `error_message`, `stack_trace`, `duration_ms` |
| OAuth2 applications listed successfully | `debug` | `user_id`, `application_count`, `request_id`, `duration_ms` |
| OAuth2 application viewed successfully | `info` | `user_id`, `application_id`, `client_id`, `duration_ms` |
| OAuth2 application view — not found | `info` | `user_id`, `requested_id`, `duration_ms` |
| OAuth2 application view — not owner | `warn` | `user_id`, `requested_id`, `actual_owner_id`, `duration_ms` |
| OAuth2 application view — invalid ID | `warn` | `user_id`, `raw_id_param`, `request_id` |
| OAuth2 application deletion attempt | `info` | `owner_id`, `application_id` |
| OAuth2 application deleted successfully | `info` | `owner_id`, `application_id`, `client_id`, `access_tokens_revoked`, `refresh_tokens_revoked`, `authorization_codes_invalidated`, `duration_ms` |
| OAuth2 application deletion — not found | `warn` | `owner_id`, `attempted_application_id`, `request_ip` |
| OAuth2 application deletion — system error | `error` | `owner_id`, `application_id`, `error_message`, `stack_trace`, `duration_ms` |
| OAuth2 application deletion — token cascade failure | `error` | `owner_id`, `application_id`, `cascade_step`, `error_message`, `stack_trace` |
| Unauthenticated OAuth2 management attempt | `warn` | `request_ip`, `user_agent`, `endpoint`, `method` |

### Critical Logging Rules

- The raw `client_secret` MUST NEVER appear in any log at any level.
- The `client_secret_hash` MUST NEVER appear in any log at any level.
- Token values and token hashes MUST NEVER appear in logs. Log token counts only.
- Application `name` should be truncated to 50 characters in logs to prevent log injection.
- `redirect_uris` should be logged at `debug` level only, as they may contain internal infrastructure URLs.
- All log entries must include `request_id` for correlation.
- The list endpoint logs at `debug` level (not `info`) to prevent log flooding from high-frequency read operations.

## Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_oauth2_applications_created_total` | Counter | `confidential` (`true`/`false`) | Total applications created, by client type |
| `codeplane_oauth2_application_create_errors_total` | Counter | `error_type` (`validation`, `auth`, `system`) | Total creation failures by error category |
| `codeplane_oauth2_application_create_duration_seconds` | Histogram | — | Latency of creation endpoint |
| `codeplane_oauth2_applications_list_total` | Counter | `status` (`success`, `error`) | Total list endpoint invocations |
| `codeplane_oauth2_applications_list_duration_seconds` | Histogram | — | Latency of list endpoint |
| `codeplane_oauth2_applications_list_result_count` | Histogram | — | Distribution of application counts returned per list call (buckets: 0, 1, 5, 10, 25, 50, 100) |
| `codeplane_oauth2_application_view_total` | Counter | `status` (`success`, `not_found`, `invalid_id`, `unauthorized`, `error`) | Total view requests by outcome |
| `codeplane_oauth2_application_view_duration_seconds` | Histogram | `status` | View endpoint latency |
| `codeplane_oauth2_applications_deleted_total` | Counter | `status` (`success`, `not_found`, `unauthorized`, `invalid_id`, `system_error`) | Total delete requests by outcome |
| `codeplane_oauth2_application_delete_duration_seconds` | Histogram | `status` | Delete endpoint latency |
| `codeplane_oauth2_application_delete_tokens_revoked_total` | Counter | `token_type` (`access`, `refresh`, `authorization_code`) | Total tokens revoked as cascade side effect |
| `codeplane_oauth2_applications_active_total` | Gauge | — | Current total active OAuth2 applications across all users |

## Alerts

### Alert: `OAuth2ApplicationCreateErrorRateHigh`

**Condition**: `rate(codeplane_oauth2_application_create_errors_total{error_type="system"}[5m]) > 0.1`

**Severity**: Warning

**Runbook**:
1. Check server logs for `error`-level entries with `oauth2` context in the last 15 minutes.
2. Look for database connection errors or constraint violations — the most common system-level cause is a database availability issue.
3. Verify the database is healthy: check connection pool utilization, replication lag, and disk space.
4. If the database is healthy, check for code regressions in the `OAuth2Service.createApplication` path — a recent deployment may have introduced a bug.
5. If the error is a unique constraint violation on `client_id`, this indicates a collision in the random hex generator, which is statistically near-impossible. Investigate whether the crypto RNG is functioning correctly.
6. Escalate to the platform team if the root cause is infrastructure-related.

### Alert: `OAuth2ApplicationCreateLatencyHigh`

**Condition**: `histogram_quantile(0.95, rate(codeplane_oauth2_application_create_duration_seconds_bucket[5m])) > 2`

**Severity**: Warning

**Runbook**:
1. Check database query latency — the creation endpoint performs a single INSERT. If the insert is slow, investigate table bloat, missing indexes, or lock contention on the `oauth2_applications` table.
2. Check for elevated server CPU or memory usage.
3. Check rate limiter middleware for unusual patterns — a spike in traffic could cause queuing.
4. If latency is isolated to a single instance, consider restarting it.

### Alert: `OAuth2ApplicationListInternalErrorRate`

**Condition**: `rate(codeplane_oauth2_applications_list_total{status="error"}[5m]) > 0.5`

**Severity**: Critical

**Runbook**:
1. Check server logs for `error`-level entries matching "OAuth2 applications list" in the last 15 minutes. Extract `error_message` and `stack_trace`.
2. Verify database connectivity: execute `SELECT 1` against the primary database.
3. Check if the `oauth2_applications` table exists and has the expected schema.
4. Check database connection pool utilization. If exhausted, investigate connection leaks or increase pool size.
5. If the error originates from the `toOAuth2ApplicationResponse` mapper (e.g., unexpected null values), investigate recent data migrations.
6. Restart the server process if all infrastructure checks pass and the error persists.

### Alert: `OAuth2ApplicationListLatencySpike`

**Condition**: `histogram_quantile(0.99, rate(codeplane_oauth2_applications_list_duration_seconds_bucket[5m])) > 1.0`

**Severity**: Warning

**Runbook**:
1. Check database query latency for slow queries involving `oauth2_applications` with `WHERE owner_id`.
2. Verify the index on `oauth2_applications(owner_id)` exists and is not bloated.
3. Check connection pool utilization and active connections.
4. If the issue correlates with a specific user having an unusually large number of applications (>100), consider adding pagination.
5. Check system CPU and memory utilization.

### Alert: `OAuth2ApplicationViewHighErrorRate`

**Condition**: `rate(codeplane_oauth2_application_view_total{status="error"}[5m]) / rate(codeplane_oauth2_application_view_total[5m]) > 0.05`

**Severity**: Warning

**Runbook**:
1. Check structured logs for the most recent error messages and stack traces.
2. Verify database connectivity with a health check query.
3. Check if the `oauth2_applications` table exists and the primary key index is intact.
4. Check for recent deployments that may have introduced a schema mismatch.
5. If the database is healthy, check for OOM conditions or connection pool exhaustion.
6. If the error rate is climbing with high request volume, check whether a single user is triggering rapid requests.
7. Escalate to the platform team if database issues are confirmed.

### Alert: `OAuth2ApplicationDeleteErrorRateHigh`

**Condition**: `rate(codeplane_oauth2_applications_deleted_total{status="system_error"}[5m]) > 0.1`

**Severity**: Warning

**Runbook**:
1. Check server logs for `error`-level entries with `oauth2` and `delete` context.
2. Determine if errors are in the app delete step or token cascade step via the `cascade_step` field.
3. Check for foreign key constraint issues on token tables.
4. Verify database health: connection pool, replication lag, disk space.
5. If transaction deadlock, monitor for 10 minutes (may self-resolve).
6. If database is healthy and no deadlocks, check for code regressions in `OAuth2Service.deleteApplication`.
7. Escalate to platform team if infrastructure-related.

### Alert: `OAuth2ApplicationDeleteLatencyHigh`

**Condition**: `histogram_quantile(0.95, rate(codeplane_oauth2_application_delete_duration_seconds_bucket[5m])) > 5`

**Severity**: Warning

**Runbook**:
1. Check token cascade volume via `codeplane_oauth2_application_delete_tokens_revoked_total`.
2. Run `EXPLAIN ANALYZE` on cascade delete queries; verify `app_id` indexes exist on token tables.
3. Check for table bloat or vacuum backlog on token tables.
4. Check for lock contention from concurrent token operations.
5. If isolated to one application with many tokens, this is expected; consider batched cascade in future.

### Alert: `OAuth2ApplicationEnumerationAttempt`

**Condition**: `sum(rate(codeplane_oauth2_application_view_total{status="not_found"}[5m])) by (user_id) > 10`

**Severity**: Info

**Runbook**:
1. Review `not_found` and `not_owner` logs for the user(s) triggering the spike.
2. Determine if the pattern is legitimate (stale bookmark, broken link) or enumeration (sequential ID scanning).
3. If enumeration is suspected, review source IPs and user agents.
4. If a single user is scanning aggressively, consider temporarily disabling their account.
5. Confirm the rate limiter is functioning.
6. No action needed if the spike is transient and self-resolving.

### Alert: `OAuth2ApplicationCreateAuthFailuresSpike`

**Condition**: `rate(codeplane_oauth2_application_create_errors_total{error_type="auth"}[5m]) > 1`

**Severity**: Info

**Runbook**:
1. Review request logs for unauthenticated creation attempts.
2. Check source IPs. If concentrated from a single IP/range, consider temporary IP-level blocking.
3. Confirm the rate limiter is functioning.
4. No action needed if transient and self-resolving.

## Error Cases and Failure Modes

| Error Case | Endpoint | HTTP Status | Recovery |
|------------|----------|-------------|----------|
| Non-JSON request body | POST | 400 | Fix Content-Type and body |
| Empty/missing name | POST | 422 | Provide a non-empty name |
| Name too long (>255) | POST | 422 | Shorten to ≤255 chars |
| Missing redirect_uris | POST | 422 | Provide at least one URI |
| Invalid redirect URI | POST | 422 | Fix URI at indexed position |
| Missing confidential | POST | 422 | Provide boolean value |
| Non-integer ID | GET/DELETE | 400 | Use valid integer ID |
| App not found | GET/DELETE | 404 | Verify ID and ownership |
| App belongs to another user | GET/DELETE | 404 | Users can only access own apps |
| Unauthenticated | ALL | 401 | Authenticate first |
| Rate limit exceeded | ALL | 429 | Wait for rate limit reset |
| Database failure | ALL | 500 | Retry; escalate if persistent |
| Transaction deadlock on delete | DELETE | 500 | Retry after short delay |
| Token cascade failure | DELETE | 500 | Check DB health, retry |

## Verification

## API Integration Tests

### Create Application

- [ ] **Happy path — confidential client**: `POST /api/oauth2/applications` with valid `name`, `redirect_uris`, `confidential: true` → `201` with complete response including `client_secret`.
- [ ] **Happy path — public client**: Same with `confidential: false` → `201`.
- [ ] **Response shape validation**: Verify all fields: `id` (number), `client_id` (string, 40 hex), `client_secret` (string, `codeplane_oas_` + 64 hex), `name`, `redirect_uris` (array), `scopes` (array), `confidential` (boolean), `created_at` (ISO 8601), `updated_at` (ISO 8601).
- [ ] **Client ID format**: Verify `client_id` matches `/^[0-9a-f]{40}$/`.
- [ ] **Client secret format**: Verify `client_secret` matches `/^codeplane_oas_[0-9a-f]{64}$/`.
- [ ] **Client secret uniqueness**: Create two apps with identical params → `client_id` and `client_secret` differ.
- [ ] **Secret not in list**: Create app, GET list → no `client_secret` on any entry.
- [ ] **Secret not in get**: Create app, GET by id → no `client_secret`.
- [ ] **App appears in list**: Create, list → created app present with correct fields.
- [ ] **Name trimming**: `name: "  Padded Name  "` → response has `name: "Padded Name"`.
- [ ] **Maximum name length (255)**: `name: "a".repeat(255)` → `201`.
- [ ] **Name exceeds maximum (256)**: `name: "a".repeat(256)` → `422` with field `name`, code `invalid`.
- [ ] **Empty name**: `name: ""` → `422` with field `name`, code `missing_field`.
- [ ] **Whitespace-only name**: `name: "   "` → `422`.
- [ ] **Unicode name**: `name: "🚀 Rocket App 中文"` → `201` with unicode preserved.
- [ ] **Single character name**: `name: "X"` → `201`.
- [ ] **Empty redirect_uris**: `redirect_uris: []` → `422`.
- [ ] **Missing redirect_uris**: Omit field → `422`.
- [ ] **Single valid redirect URI**: → `201`.
- [ ] **Multiple valid redirect URIs**: 2 URIs → `201`, both preserved.
- [ ] **Invalid redirect URI (no scheme)**: → `422` with field `redirect_uris[0]`.
- [ ] **Invalid redirect URI (no host)**: → `422`.
- [ ] **Mixed valid/invalid redirect URIs**: → `422` with correct indexed field.
- [ ] **Custom scheme URI (`myapp://callback`)**: → `201`.
- [ ] **Localhost URI**: → `201`.
- [ ] **Missing confidential**: → `422` with field `confidential`.
- [ ] **Null confidential**: → `422`.
- [ ] **Scopes provided**: → `201` with scopes preserved.
- [ ] **Scopes omitted**: → `201` with `scopes: []`.
- [ ] **Empty scopes array**: → `201` with `scopes: []`.
- [ ] **Empty JSON body**: → `422`.
- [ ] **Non-JSON body**: → `400`.
- [ ] **Unauthenticated**: → `401`.
- [ ] **Duplicate names allowed**: Two apps, same name → both succeed with different IDs.
- [ ] **Rapid sequential creations**: 10 apps → all succeed with unique IDs and secrets.
- [ ] **Concurrent creations**: 5 parallel POSTs → all succeed, no collisions.
- [ ] **Created app is functional**: Create app, use `client_id` in authorization flow → flow succeeds.

### List Applications

- [ ] **Happy path with existing apps**: Create 2 apps, GET list → array length ≥ 2, both present.
- [ ] **Empty list**: Fresh user → `200` with `[]`.
- [ ] **Ordering newest first**: Create A then B → B appears before A.
- [ ] **client_secret excluded**: Every entry → no `client_secret` or `client_secret_hash`.
- [ ] **All required fields present**: Each entry has `id`, `client_id`, `name`, `redirect_uris`, `scopes`, `confidential`, `created_at`, `updated_at`.
- [ ] **owner_id excluded**: Each entry → no `owner_id`.
- [ ] **Cross-user isolation**: User A's apps not visible in User B's list.
- [ ] **Newly created app appears immediately**: Create → list → present.
- [ ] **Deleted app disappears immediately**: Create → delete → list → absent.
- [ ] **ISO 8601 timestamps**: Both parse correctly as `Date`.
- [ ] **Unauthenticated returns 401**.
- [ ] **Response is always an array**: Even with 1 app.
- [ ] **redirect_uris preserved exactly**: Including query parameters.
- [ ] **Scopes preserved and normalized**: Array matches exactly.
- [ ] **Empty scopes preserved**: `scopes: []` not `null`.
- [ ] **Multiple redirect URIs preserved**: 5 URIs in correct order.
- [ ] **255-char name intact**: Not truncated.
- [ ] **Special characters in name preserved**: Emoji, CJK, diacritics.
- [ ] **Confidential and public coexist**: Both appear with correct `confidential` values.
- [ ] **50 applications**: All 50 returned, no timeout or cutoff.

### View Application

- [ ] **Happy path**: Create → GET by ID → `200` with complete response.
- [ ] **Client secret never present**: `client_secret` and `client_secret_hash` absent.
- [ ] **owner_id never present**.
- [ ] **Client ID format**: `/^[0-9a-f]{40}$/`.
- [ ] **Confidential app**: `confidential: true` returned correctly.
- [ ] **Public app**: `confidential: false` returned correctly.
- [ ] **App with scopes**: Scopes array matches creation input.
- [ ] **App with empty scopes**: `scopes: []`.
- [ ] **App with multiple redirect URIs**: All returned in order.
- [ ] **Max name length (255)**: Full name returned.
- [ ] **Unicode name**: Preserved without encoding artifacts.
- [ ] **Non-integer ID (`abc`)**: → `400`.
- [ ] **Negative ID (`-1`)**: → `404`.
- [ ] **Zero ID (`0`)**: → `404`.
- [ ] **Very large ID (`999999999999`)**: → `404`.
- [ ] **Non-existent valid ID**: → `404`.
- [ ] **Other user's app**: → `404` (same error as non-existent).
- [ ] **Unauthenticated**: → `401`.
- [ ] **View after deletion**: → `404`.
- [ ] **View immediately after creation**: → `200` with matching data.
- [ ] **Data consistency**: Creation response (minus `client_secret`) matches view response.
- [ ] **Data consistency**: View response matches list entry.

### Delete Application

- [ ] **Happy path**: Create → DELETE → `204 No Content`, empty body.
- [ ] **Deleted app not in list**: Create → delete → list → absent.
- [ ] **Deleted app returns 404 on get**: Create → delete → GET → `404`.
- [ ] **Double delete**: Delete → delete again → `404`.
- [ ] **Non-existent app**: DELETE `/999999` → `404`.
- [ ] **Non-numeric ID**: DELETE `/abc` → `400`.
- [ ] **Negative ID**: → `404`.
- [ ] **Zero ID**: → `404`.
- [ ] **Very large ID**: → `404`.
- [ ] **Unauthenticated**: → `401`.
- [ ] **Cross-user isolation**: User A creates, User B deletes → `404`.
- [ ] **Does not affect other apps**: Create A, B, C. Delete B. List → A and C present.
- [ ] **Delete the only app**: Create one, delete, list → `[]`.
- [ ] **Cascade — access tokens revoked**: Verify token → `401` after delete.
- [ ] **Cascade — refresh tokens revoked**: Refresh fails after delete.
- [ ] **Cascade — auth codes invalidated**: Exchange fails after delete.
- [ ] **Delete app with zero tokens**: → `204`, no errors.
- [ ] **Response body empty on 204**.
- [ ] **Concurrent deletes**: Two simultaneous DELETEs → one `204`, one `404`, no `500`.
- [ ] **Delete then create new**: New app gets new ID and client_id.

## CLI Integration Tests

- [ ] **CLI create via `api`**: `codeplane api /api/oauth2/applications --method POST -f ...` → exit 0, JSON with `client_id` and `client_secret`.
- [ ] **CLI create then list**: Created app in list, no `client_secret`.
- [ ] **CLI create then delete then verify**: Create, delete, verify absent.
- [ ] **CLI error on empty name**: Error response, non-zero exit.
- [ ] **CLI list via `api`**: `codeplane api /api/oauth2/applications` → exit 0, JSON array.
- [ ] **CLI list contains created app**: App present in output.
- [ ] **CLI list excludes client_secret**: Parse JSON, no `client_secret`.
- [ ] **CLI list after deletion**: Deleted app absent.
- [ ] **CLI list empty state**: `[]` for user with no apps.
- [ ] **CLI view via `api`**: `codeplane api /api/oauth2/applications/<id>` → exit 0, valid JSON.
- [ ] **CLI view — no client_secret**: Parse JSON, `client_secret` absent.
- [ ] **CLI view — not found**: Non-zero exit or error response.
- [ ] **CLI delete via `api`**: `--method DELETE` → exit 0.
- [ ] **CLI delete then verify**: Absent in subsequent list.
- [ ] **CLI delete non-existent**: Error response.
- [ ] **CLI delete unauthenticated**: Exit code 1, auth error.
- [ ] **CLI `auth oauth2 create`**: With `--name`, `--redirect-uri`, `--confidential` → success output with secret warning.
- [ ] **CLI `auth oauth2 list`**: Tabular output, then `--json` output.
- [ ] **CLI `auth oauth2 view <id>`**: Human-readable output, then `--json`.
- [ ] **CLI `auth oauth2 view <id>` — not found**: Exit code 1.
- [ ] **CLI `auth oauth2 delete <id> --yes`**: Skips confirmation, deletes.
- [ ] **CLI `auth oauth2 delete <id>` — reject prompt**: App still exists.
- [ ] **CLI `auth oauth2 delete <id> --json`**: JSON output `{ "deleted": true, "id": <id> }`.

## E2E / Playwright Web UI Tests

### Navigation and List Page

- [ ] **Navigate to OAuth Applications settings**: Authenticated user → Settings → sidebar "OAuth Applications" → `/settings/oauth-applications` loads with correct title and "New Application" button.
- [ ] **Settings sidebar highlights current item**: "OAuth Applications" item is visually highlighted.
- [ ] **Empty state rendering**: User with no apps → "No OAuth2 applications yet" heading, CTA button, documentation link visible.
- [ ] **Empty state CTA navigates to creation form**: Click "Register your first application" → creation form displayed.
- [ ] **Application list renders after creation**: Create via API, navigate → name, truncated client ID, type badge, timestamp visible.
- [ ] **Multiple applications in correct order**: Create A then B → B above A.
- [ ] **Client ID copy button**: Click copy → clipboard contains full 40-char client ID.
- [ ] **Client secret not visible on list page**: No element contains secret value or label.
- [ ] **Row action: View details**: Click → navigates to `/settings/oauth-applications/:id`.
- [ ] **Row action: Delete**: Click → confirmation dialog appears.
- [ ] **Loading state**: Skeleton placeholder rows visible during API call.
- [ ] **Error state**: Mock 500 → error banner with "Retry" button visible.
- [ ] **Retry after error**: Click "Retry" → data loads successfully.
- [ ] **Type badges**: Confidential app shows "Confidential" badge, public shows "Public".
- [ ] **Scopes collapsed**: App with 5 scopes shows 3 + "+2 more".
- [ ] **Responsive: narrow viewport**: Scopes and Created columns hidden; Client ID truncated.

### Create Application Flow

- [ ] **Form renders**: Click "New Application" → name input, redirect URI input, client type radio, scope checkboxes visible.
- [ ] **Submit disabled initially**: Button disabled until required fields filled.
- [ ] **Submit enabled with valid input**: Name + URI + client type → button enabled.
- [ ] **Inline validation on invalid URI**: Type "not-a-url", tab → error message.
- [ ] **Character count on name**: Type near 255 chars → counter visible.
- [ ] **Add multiple redirect URIs**: Click "Add" → additional input appears.
- [ ] **Remove redirect URI**: Click remove on second URI → removed (first cannot be removed).
- [ ] **Server validation error display**: Submit with 256-char name → inline error.
- [ ] **Successful creation → secret modal**: Submit valid form → modal with client ID, client secret, copy buttons, warning.
- [ ] **Secret modal checkbox enforcement**: "Done" button disabled until checkbox checked.
- [ ] **Secret modal cannot be dismissed early**: Click outside, press Escape → modal stays.
- [ ] **Secret modal copy buttons**: Copy client ID → clipboard correct. Copy secret → clipboard correct.
- [ ] **After dismissing modal, app in list**: New app visible in list, no secret.
- [ ] **Cancel returns to list**: Click "Cancel" on form → back to list, no app created.

### Application Detail Page

- [ ] **Navigate from list**: Click app name → detail page with correct content.
- [ ] **All fields displayed**: Name heading, client ID, type badge, redirect URIs, scopes, timestamps.
- [ ] **Client ID copy button**: Click → clipboard contains full ID.
- [ ] **Security notice visible**: Text about secret shown once at creation.
- [ ] **Breadcrumb navigation**: Settings > OAuth Applications > {Name} all clickable.
- [ ] **Back link**: Click "Back to applications" → list page.
- [ ] **Not-found state**: Navigate to `/settings/oauth-applications/99999` → "Application not found" message.
- [ ] **Loading skeleton**: Delay API → skeleton layout visible.
- [ ] **Error state with retry**: Mock 500 → error banner, click Retry → success.
- [ ] **Unauthenticated redirect**: Visit without auth → login page.
- [ ] **Confidential badge**: Confidential app → "Confidential" badge.
- [ ] **Public badge**: Public app → "Public" badge.
- [ ] **Multiple redirect URIs**: 4 URIs → all 4 visible.
- [ ] **Multiple scopes**: 6 scopes → all 6 as badges.
- [ ] **Relative timestamp with tooltip**: "Created" shows relative time, hover shows full ISO date.
- [ ] **Long name (255 chars)**: Full name displayed as heading.
- [ ] **Unicode name**: Emoji/CJK renders correctly.

### Delete Flow

- [ ] **Delete from list row**: Click Delete action → confirmation dialog.
- [ ] **Delete from detail page**: Click "Delete application" → confirmation dialog.
- [ ] **Confirmation dialog content**: App name, warning text, name input, disabled delete button.
- [ ] **Delete button disabled until name matches**: Wrong text → disabled. Exact match → enabled.
- [ ] **Cancel dismisses without deleting**: Click Cancel → dialog closes, app still present.
- [ ] **Escape dismisses without deleting**: Press Escape → same.
- [ ] **Successful deletion**: Confirm → dialog closes, toast "OAuth2 application \"name\" deleted.", app removed from list.
- [ ] **Loading state during deletion**: Spinner on button, both buttons disabled.
- [ ] **Error state in dialog**: Mock 500 → error message, button re-enables.
- [ ] **404 during delete (concurrent)**: Mock 404 → warning toast, table refreshes.
- [ ] **Empty state after deleting last app**: Delete only app → empty state.
- [ ] **Delete one of many**: 3 apps, delete middle → 2 remaining.
- [ ] **Keyboard accessibility**: Tab cycles through dialog elements, Enter submits, Escape dismisses.
- [ ] **Delete then navigate**: After delete from detail page → redirected to list, app absent.

### Security Tests

- [ ] **Cross-user isolation via API**: User A creates apps. User B lists → User A's apps absent.
- [ ] **Unauthenticated UI access**: Navigate to `/settings/oauth-applications` without auth → redirect to login.
- [ ] **Response does not leak secret hashes**: Inspect raw HTTP response → no `client_secret_hash` or `client_secret`.
- [ ] **owner_id not in any response**: Inspect all responses → no `owner_id` field.
- [ ] **404 indistinguishable**: Compare 404 for non-existent ID vs other user's ID → identical error message and response shape.
