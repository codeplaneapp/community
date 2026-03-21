# REPO_CREATE_UI

Specification for REPO_CREATE_UI.

## High-Level User POV

When you want to start a new project on Codeplane, the "New Repository" page is the fastest way to get there from the web. You can reach it in three ways: clicking the "+" or "New" button that sits in the global navigation header, typing "Create Repository" into the command palette (Cmd+K / Ctrl+K), or going directly to `/new` in your browser. All three take you to the same clean, single-column form.

The form asks for just enough to get started. You pick an owner — yourself or one of your organizations — enter a name, optionally add a description, choose whether the repository is public or private, and optionally specify a default bookmark (Codeplane's jj-native equivalent of a default branch). Everything except the name has a sensible default: the owner defaults to you, visibility defaults to public, the description starts empty, and the default bookmark is "main." If you belong to organizations where you have owner-level permissions, those organizations appear in the owner selector alongside your personal account.

As you type a repository name, the form gives you immediate feedback. It validates the name format, length, reserved names, and the `.git` suffix restriction in real time. A character counter shows how many of the 100 allowed characters you have used. If the name is valid, the form shows a green checkmark. If something is wrong — an invalid character, a reserved name, a name that is too long — you see the specific problem right below the field before you ever hit submit. The "Create Repository" button stays disabled until the name is valid, so you cannot accidentally submit a bad form.

When you click "Create Repository," Codeplane creates the repo immediately and redirects you to its overview page. If the name you chose turns out to already exist under that owner, you see an inline error telling you the name is taken — the form stays filled in so you can pick a different name without re-entering everything else. If something unexpected goes wrong on the server side, a toast notification tells you to try again.

The entire experience takes under five seconds from clicking "New" to landing on your new repository. There is no wizard, no multi-step flow, and nothing you cannot change later from the repository settings page. The form is simple by design — getting code into Codeplane is what matters, and this page gets out of the way.

## Acceptance Criteria

## Definition of Done

The feature is complete when an authenticated user can create a repository — under their personal namespace or under an organization where they are an owner — using the web UI's `/new` page, with real-time client-side validation, proper error handling for all server-side failure modes, and a seamless redirect to the newly created repository on success. The page must be reachable from the global navigation header, command palette, and direct URL. All edge cases around name validation, owner selection, duplicate detection, and error display are verified by Playwright end-to-end tests.

## Functional Constraints

- [ ] The `/new` route requires authentication. Unauthenticated visitors are redirected to `/login` with a `redirect=/new` query parameter.
- [ ] The form pre-selects the authenticated user as the default owner.
- [ ] The owner selector lists the authenticated user's personal account and all organizations where the user has the `owner` role.
- [ ] Organizations where the user is a non-owner member do not appear in the owner selector.
- [ ] Organizations are fetched from `GET /api/user/orgs` and filtered client-side to those with `role: "owner"`.
- [ ] When the selected owner is the authenticated user, the form submits to `POST /api/user/repos`.
- [ ] When the selected owner is an organization, the form submits to `POST /api/orgs/:org/repos`.
- [ ] The repository name field is required. The "Create Repository" button is disabled when the name field is empty or invalid.
- [ ] The repository name is trimmed of leading and trailing whitespace before validation and submission.
- [ ] Client-side name validation enforces: 1–100 characters, must start with `[a-zA-Z0-9]`, may contain only `[a-zA-Z0-9._-]`, must not end with `.git` (case-insensitive), must not be a reserved name (case-insensitive).
- [ ] Reserved names are: `agent`, `bookmarks`, `changes`, `commits`, `contributors`, `issues`, `labels`, `landings`, `milestones`, `operations`, `pulls`, `settings`, `stargazers`, `watchers`, `workflows`.
- [ ] The name field shows a live character counter in the format `{current}/100`.
- [ ] Client-side validation is debounced at 300ms after the user stops typing.
- [ ] A valid name displays a green checkmark indicator next to the field.
- [ ] An invalid name displays a red error message below the field with a specific reason (e.g., "Name must start with a letter or number", "Name cannot end with .git", "'settings' is a reserved name", "Name must be 100 characters or fewer").
- [ ] The description field is optional. It submits as an empty string when left blank.
- [ ] The description field is a multi-line textarea.
- [ ] Visibility defaults to "Public" and is presented as a radio button group with two options: "Public" (subtext: "Anyone can see this repository") and "Private" (subtext: "Only you and collaborators can see this repository").
- [ ] The default bookmark field is optional with a placeholder of "main". An empty value submits as an empty string and the server normalizes it to "main".
- [ ] Clicking "Create Repository" when the form is valid sends the request with a loading/spinner state on the button and disables the button to prevent double submission.
- [ ] On successful creation (201), the user is redirected to `/:owner/:repo`.
- [ ] On 409 Conflict, an inline error appears below the name field: "A repository with this name already exists." The form is not cleared.
- [ ] On 422 Validation Error, an inline error appears below the name field with the server-provided error message. The form is not cleared.
- [ ] On 401 Unauthorized (session expired mid-form), the user is redirected to `/login`.
- [ ] On 403 Forbidden (org owner check failed), a toast error displays: "You do not have permission to create repositories in this organization."
- [ ] On 500 Internal Server Error, a toast error displays: "Something went wrong. Please try again."
- [ ] On network failure, a toast error displays: "Unable to reach Codeplane. Check your connection and try again."
- [ ] The form does not clear on any error, allowing the user to correct and retry.
- [ ] The page has a document title of "New Repository · Codeplane".
- [ ] The page is gated behind the `REPO_CREATE_UI` feature flag. When disabled, the `/new` route returns a 404 page and navigation entry points are hidden.
- [ ] Browser back/forward navigation works correctly (the form is not re-submitted on back).
- [ ] The form submits on Enter key when the name field is focused and the form is valid, unless focus is inside the description textarea.

## Name Validation Constraints

- [ ] Empty name (after trim) → error: "Repository name is required."
- [ ] Name exceeding 100 characters → error: "Name must be 100 characters or fewer."
- [ ] Name starting with `.` → error: "Name must start with a letter or number."
- [ ] Name starting with `-` → error: "Name must start with a letter or number."
- [ ] Name starting with `_` → error: "Name must start with a letter or number."
- [ ] Name containing spaces → error: "Name can only contain letters, numbers, dots, underscores, and hyphens."
- [ ] Name containing `@`, `#`, `$`, `%`, `!`, `&`, `*`, `/`, `\`, or other special characters → error: "Name can only contain letters, numbers, dots, underscores, and hyphens."
- [ ] Name ending with `.git` (case-insensitive) → error: "Name cannot end with .git."
- [ ] Name matching a reserved name (case-insensitive) → error: "'{name}' is a reserved name."
- [ ] Exactly 1-character alphanumeric name (`a`, `Z`, `5`) → accepted.
- [ ] Exactly 100-character valid name → accepted.
- [ ] Name `a.b_c-d` → accepted.
- [ ] Name `myrepo.GIT` → rejected.
- [ ] Name `SETTINGS` → rejected (case-insensitive reserved check).

## Edge Cases

- [ ] User with no organizations sees only their personal account in the owner selector.
- [ ] User who is a member (but not owner) of an organization does not see that organization in the owner selector.
- [ ] Switching the owner selector from personal to an organization and back preserves the name and other field values.
- [ ] Rapidly clicking "Create Repository" only sends one API request (button is disabled during submission).
- [ ] Pasting a name with leading/trailing whitespace trims it before validation.
- [ ] Pasting a 200-character string shows the validation error and character counter exceeds 100.
- [ ] Navigating away from the form mid-edit and returning via browser back restores the URL but presents a fresh form (no stale state).
- [ ] If the user's session expires while filling out the form, the submission attempt redirects to `/login`.
- [ ] Unicode characters in the name field (e.g., emoji, CJK) are correctly rejected by client-side validation.
- [ ] The form works correctly with browser autofill disabled (name fields should use `autocomplete="off"`).
- [ ] Screen readers announce validation errors when they appear.
- [ ] The form is navigable entirely by keyboard (Tab/Shift+Tab between fields, Space/Enter to select radio buttons, Enter to submit).

## Design

## Web UI Design

### Page URL and Title

- **Route:** `/new`
- **Document title:** `New Repository · Codeplane`
- **Feature flag:** `REPO_CREATE_UI`

### Entry Points

1. **Global navigation header:** A "+" or "New" button in the top navigation bar. Clicking it opens a dropdown menu with "New Repository" as the first item. Clicking "New Repository" navigates to `/new`.
2. **Command palette:** `Cmd+K` (macOS) / `Ctrl+K` (Windows/Linux) → type "Create Repository" or "New Repository" → select the command → navigates to `/new`.
3. **Direct URL:** Navigating to `/new` directly.
4. **Empty state CTA:** When the user has zero repositories, the personal repository list page displays an empty state with a "Create your first repository" button linking to `/new`.

### Layout

The page uses a single-column, vertically stacked layout centered within the main content area. Maximum width: 600px. The form is visually clean with generous spacing between fields.

#### Page Header

- **Heading:** "Create a new repository" (h1)
- **Subtext:** "A repository contains all project files, including the revision history. Already have a project? Push it to Codeplane via SSH."

#### Form Fields (top to bottom)

**1. Owner Selector**

- **Label:** "Owner"
- **Widget:** Dropdown / select component
- **Default value:** The authenticated user's username
- **Options:** The user's personal account (shown as username with user avatar), followed by any organizations where the user is an owner (shown as org name with org avatar/identicon)
- **Visual:** Each option shows a 24×24 avatar and the name
- **Separator:** A visual divider between the personal account and organizations (if any orgs exist)
- **Loading state:** Shows a skeleton placeholder while `GET /api/user/orgs` loads
- **Error state:** If the org list fails to load, show only the personal account and a subtle retry link

**2. Repository Name**

- **Label:** "Repository name" with a required indicator (*)
- **Widget:** Single-line text input
- **Placeholder:** `my-awesome-project`
- **Attributes:** `autocomplete="off"`, `spellcheck="false"`, `maxlength="100"`
- **Live character counter:** Right-aligned below the input, `{current}/100`. Normal text color when under 80 chars, warning color (amber) at 80–99, error color (red) at 100.
- **Validation indicator:** Inline to the right of the input — green checkmark (✓) when valid, red (✗) when invalid. Hidden when the field is empty and untouched.
- **Error text:** Below the input, red text, specific error message per validation rule. Appears 300ms after the user stops typing (debounced).
- **Focus behavior:** Auto-focused when the page loads (unless navigated to via command palette, in which case focus follows the navigation completion).

**3. Description**

- **Label:** "Description" with "(optional)" suffix
- **Widget:** Multi-line textarea, 3 rows default, resizable vertically
- **Placeholder:** "A short description of your repository"
- **Max length:** No client-side max enforced. The textarea grows as the user types.

**4. Visibility**

- **Label:** "Visibility"
- **Widget:** Radio button group with two vertically stacked options
- **Option 1:** Radio + icon (globe/public icon) + "Public" (bold) + subtext "Anyone can see this repository. You choose who can commit."
- **Option 2:** Radio + icon (lock/private icon) + "Private" (bold) + subtext "Only you and collaborators you explicitly add can see and commit to this repository."
- **Default selected:** Public
- **Each option is a full-width clickable card** (clicking anywhere in the card selects the radio)

**5. Default Bookmark**

- **Label:** "Default bookmark" with "(optional)" suffix
- **Widget:** Single-line text input
- **Placeholder:** `main`
- **Help text:** Below the input, muted text: "The default jj bookmark for this repository. Leave empty to use 'main'."

**6. Divider**

- A horizontal rule separating the form fields from the action button.

**7. Action Bar**

- **Primary button:** "Create Repository" — right-aligned
  - **Enabled state:** Solid primary color, normal cursor
  - **Disabled state:** Muted/grey, `cursor: not-allowed`. Disabled when name is empty, invalid, or a submission is in progress.
  - **Loading state:** Button text changes to "Creating…" with a spinner icon. Button remains disabled.
- **Cancel link:** "Cancel" — left of the primary button (or left-aligned). Navigates back to the previous page (or `/` if no history).

### Error Display

- **Client-side validation errors:** Inline below the name field. Red text. Specific message per validation rule. Appears after 300ms debounce.
- **Server 409 Conflict:** Inline below the name field. Red text. "A repository with this name already exists under {owner}." Form not cleared.
- **Server 422 Validation:** Inline below the name field. Red text. Server-provided message. Form not cleared.
- **Server 403 Forbidden:** Toast notification (top-right, auto-dismiss after 5 seconds). "You do not have permission to create repositories in this organization."
- **Server 500 Error:** Toast notification. "Something went wrong. Please try again."
- **Network failure:** Toast notification. "Unable to reach Codeplane. Check your connection and try again."

### Success Behavior

- On 201 response, immediately redirect to `/:owner/:repo` (the new repository's overview page).
- No success toast is needed — the redirect itself is the confirmation. The repository overview page implicitly confirms the creation.

### Responsive Behavior

- On screens narrower than 600px, the form takes full width with horizontal padding.
- The owner selector and action bar stack vertically on narrow screens.
- Touch targets for radio buttons and the submit button are at least 44×44px.

### Accessibility

- All form fields have associated `<label>` elements or `aria-label` attributes.
- Validation errors are associated with their fields via `aria-describedby`.
- Validation errors are announced by screen readers using `role="alert"` or `aria-live="assertive"`.
- The form is fully navigable by keyboard (Tab/Shift+Tab for fields, Space for radio buttons, Enter for submit).
- Focus is moved to the first error field when submission fails.
- Color is not the only indicator of state — icons (checkmark/cross) accompany color for validation states.
- The submit button's disabled state is communicated via `aria-disabled` in addition to the `disabled` attribute.

### URL Preview

Below the name field (when valid and the owner is selected), show a preview of the resulting repository URL:

```
Your repository will be created at: codeplane.app/{owner}/{name}
```

This updates in real time as the owner or name changes. Hidden when the name is empty or invalid.

## API Shape

The web UI consumes two existing API endpoints. No new API endpoints are needed.

**User-owned repository creation:**
- `POST /api/user/repos`
- Body: `{ "name": string, "description"?: string, "private"?: boolean, "default_bookmark"?: string }`
- Response: `201 Created` with `RepoResponse` object

**Organization-owned repository creation:**
- `POST /api/orgs/:org/repos`
- Body: Same as above
- Response: `201 Created` with `RepoResponse` object

**Organization list (for owner selector):**
- `GET /api/user/orgs`
- Response: Array of organization objects with `name`, `role` fields

See `REPO_CREATE_USER_OWNED` and `REPO_CREATE_ORG_OWNED` specs for full API contract details.

## Command Palette Integration

The command palette should register a "Create Repository" command:

- **Label:** "Create Repository"
- **Aliases:** "New Repository", "New Repo"
- **Category:** "Navigation"
- **Icon:** Repository/plus icon
- **Action:** Navigate to `/new`
- **Availability:** Always available when authenticated. Hidden when `REPO_CREATE_UI` feature flag is disabled.

## Feature Flag Behavior

When `REPO_CREATE_UI` is disabled:

- The `/new` route renders a 404 page.
- The "New Repository" item is hidden from the global navigation header dropdown.
- The "Create Repository" command is removed from the command palette.
- The empty-state CTA on the repository list page is hidden.
- Direct URL navigation to `/new` shows the standard 404 page.

## Documentation

The following end-user documentation should be written or updated:

1. **"Creating a repository" guide** — Add a "Web UI" subsection covering:
   - How to navigate to the new repository form (three entry points)
   - Walkthrough of each form field with screenshots
   - Explanation of the owner selector for users with organization memberships
   - What happens when you click "Create Repository"
   - Common validation errors and how to resolve them

2. **Web UI overview documentation** — Update to mention the `/new` page as a core navigation target.

3. **Command palette documentation** — Add "Create Repository" to the list of available commands.

## Permissions & Security

## Authorization

| Role | Can Access `/new`? | Can Create User-Owned Repo? | Can Create Org-Owned Repo? |
|---|---|---|---|
| Authenticated user | ✅ Yes | ✅ Yes — repos created under their personal namespace | ✅ Only for organizations where they are an owner |
| Authenticated user (org member, non-owner) | ✅ Yes | ✅ Yes (personal repos) | ❌ No — org does not appear in owner selector; direct API call returns 403 |
| Unauthenticated / Anonymous | ❌ Redirected to `/login?redirect=/new` | ❌ N/A | ❌ N/A |
| Admin | ✅ Yes | ✅ Yes — admins are authenticated users | ✅ Same org-owner rule applies; admin status alone does not grant org repo creation |

## Rate Limiting

The web UI relies on the API's existing rate limits:

| Limit | Value | Scope | Rationale |
|---|---|---|---|
| Repository create requests | 30 per hour | Per authenticated user | Prevents automated mass repository creation via the UI |
| Burst limit | 5 per minute | Per authenticated user | Prevents rapid-fire creation via scripting or accidental repeated clicks |
| Org list fetch | Standard API rate limit (120 req/min) | Per authenticated user | Owner selector loads org list; this is a read operation |

Rate limit responses from the API (`429 Too Many Requests`) should be displayed as a toast notification: "You've created too many repositories recently. Please wait a few minutes and try again." The `Retry-After` header value should be parsed and shown to the user if available: "Try again in {N} seconds."

## Client-Side Rate Limit Protection

- The submit button is disabled during API submission and for 1 second after a successful creation to prevent accidental double-clicks.
- After a 429 response, the submit button remains disabled for the duration of the `Retry-After` period.

## Data Privacy

- The owner selector exposes the user's organization memberships to the user themselves only. The org list API (`GET /api/user/orgs`) is scoped to the authenticated user.
- Repository names and descriptions are user-supplied content. No PII is inherently required or collected beyond what the user voluntarily enters.
- The owner username is displayed in the URL preview and is a public identifier.
- The form does not store any data in local storage, session storage, or cookies. Form state is ephemeral — leaving the page discards it.
- Private repository existence is never exposed to unauthenticated users or users without access.

## Input Sanitization

- The `name` field is validated against a strict allowlist regex client-side. No HTML, SQL, or shell metacharacters can pass validation.
- The `description` field is free text. It must be HTML-escaped on display to prevent XSS. The web UI framework (SolidJS) escapes by default in JSX; manual `innerHTML` must never be used for this field.
- The `default_bookmark` field is free text and must receive the same display-time escaping treatment.
- The owner selector only allows selection from a server-provided list — no free-text entry.

## Telemetry & Product Analytics

## Business Events

| Event | Trigger | Properties |
|---|---|---|
| `RepositoryCreatePageViewed` | User navigates to `/new` | `user_id`, `username`, `referrer` (header, command_palette, direct_url, empty_state_cta), `has_orgs` (boolean — whether the user has any orgs available in the selector), `timestamp` |
| `RepositoryCreateFormSubmitted` | User clicks "Create Repository" (form passes client-side validation) | `user_id`, `username`, `owner_type` (personal, org), `owner_name`, `is_private`, `has_description` (boolean), `has_custom_bookmark` (boolean), `name_length`, `timestamp` |
| `RepositoryCreatedFromUI` | Successful 201 response received | `user_id`, `username`, `repo_id`, `repo_name`, `full_name`, `owner_type` (personal, org), `owner_name`, `is_public`, `default_bookmark`, `has_description`, `source` (always "web"), `time_on_page_ms`, `created_at` |
| `RepositoryCreateUIFailed` | Any non-2xx response from the API | `user_id`, `username`, `owner_type`, `owner_name`, `error_code` (400, 401, 403, 409, 422, 429, 500), `error_reason` (conflict, validation, forbidden, rate_limited, server_error, network_error), `attempted_name_length`, `timestamp` |
| `RepositoryCreateValidationError` | Client-side validation rejects the name (fired once per debounce cycle, not on every keystroke) | `user_id`, `username`, `validation_rule` (empty, too_long, invalid_start, invalid_chars, reserved_name, git_suffix), `attempted_name_length`, `timestamp` |
| `RepositoryCreateOwnerChanged` | User changes the owner selector from the default | `user_id`, `username`, `from_owner`, `to_owner`, `to_owner_type` (personal, org), `timestamp` |

## Funnel Metrics

| Metric | Description | Success Indicator |
|---|---|---|
| **Page view → form submission rate** | `RepositoryCreateFormSubmitted / RepositoryCreatePageViewed` | > 70% — users who open the page intend to create. Low rates indicate friction or confusion. |
| **Form submission → success rate** | `RepositoryCreatedFromUI / RepositoryCreateFormSubmitted` | > 90% — client-side validation should prevent most server-side errors. |
| **Time on page (successful creation)** | Median `time_on_page_ms` for successful creations | < 15 seconds — the form should be completable in under 15 seconds for experienced users. |
| **Client validation error rate** | `RepositoryCreateValidationError / RepositoryCreatePageViewed` | Trending down — indicates users learn the naming rules or the UX guides them effectively. |
| **409 conflict rate** | Count of `RepositoryCreateUIFailed{error_reason=conflict}` | Low and stable. A spike may indicate users struggling with naming in a shared namespace. |
| **Entry point distribution** | Breakdown of `referrer` field on `RepositoryCreatePageViewed` | Healthy distribution across header, command palette, and direct URL indicates multiple discovery paths work. |
| **Owner type distribution** | Breakdown of `owner_type` on `RepositoryCreatedFromUI` | Shows whether users create personal vs. org repos, informs prioritization of org-specific UX. |
| **Client distribution (cross-surface)** | Compare `RepositoryCreatedFromUI` (web) vs. `RepositoryCreated{source=cli}` vs. `RepositoryCreated{source=tui}` | Healthy multi-surface adoption. If web dominates heavily, CLI/TUI may need discoverability improvements. |

## Activation Signal

A user's first `RepositoryCreatedFromUI` event (where `source="web"`) is a web-specific activation milestone. Combined with the first `RepositoryCreated` event from any source, it contributes to the user lifecycle activation funnel.

## Observability

## Logging

All logging for this feature occurs in two layers: the client-side web application and the server-side API route handlers. Server-side logging is already specified in `REPO_CREATE_USER_OWNED` — the requirements below cover the web-client-specific observability.

### Client-Side Logging (Structured Browser Console / Telemetry)

| Log Event | Level | Structured Context | When |
|---|---|---|---|
| Page mounted | `debug` | `route: "/new"`, `user_id`, `has_orgs` | Component mounts |
| Org list fetch failed | `warn` | `user_id`, `error_status`, `error_message` | `GET /api/user/orgs` returns non-2xx |
| Form submitted | `info` | `user_id`, `owner_type`, `owner_name`, `name_length`, `is_private` | User clicks "Create Repository" and client validation passes |
| API request failed | `error` | `user_id`, `owner_type`, `owner_name`, `status_code`, `error_body`, `duration_ms` | API returns non-2xx |
| Network error | `error` | `user_id`, `owner_type`, `owner_name`, `error_message` | Fetch throws (no response) |
| Redirect to new repo | `info` | `user_id`, `repo_id`, `full_name`, `duration_ms` | Successful creation, before redirect |

### Server-Side Logging

Server-side logging is inherited from the `REPO_CREATE_USER_OWNED` and `REPO_CREATE_ORG_OWNED` feature specs. Key log events:

| Log Event | Level | Structured Context | When |
|---|---|---|---|
| Repository creation attempt | `info` | `user_id`, `username`, `repo_name`, `is_public`, `owner_type`, `request_id` | Before calling service method |
| Repository created successfully | `info` | `user_id`, `username`, `repo_id`, `repo_name`, `full_name`, `duration_ms`, `request_id` | After successful creation |
| Repository creation validation failed | `warn` | `user_id`, `username`, `repo_name`, `validation_error`, `field`, `code`, `request_id` | When name validation fails |
| Repository creation conflict | `warn` | `user_id`, `username`, `repo_name`, `request_id` | When duplicate name detected |
| Repository creation internal error | `error` | `user_id`, `username`, `repo_name`, `error_message`, `stack_trace`, `request_id` | When unexpected error occurs |

All log entries must include `request_id` from the middleware-injected request ID.

## Prometheus Metrics

Server-side metrics are inherited from `REPO_CREATE_USER_OWNED`. The following UI-specific client metrics should be tracked if a client-side metrics pipeline is available:

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_ui_repo_create_page_load_total` | Counter | — | Total page loads of `/new` |
| `codeplane_ui_repo_create_submission_total` | Counter | `status` (success, client_error, server_error, network_error) | Total form submissions and their outcomes |
| `codeplane_ui_repo_create_time_to_submit_seconds` | Histogram | `status` | Time from page load to form submission (buckets: 2, 5, 10, 15, 30, 60) |
| `codeplane_ui_repo_create_validation_error_total` | Counter | `rule` (empty, too_long, invalid_start, invalid_chars, reserved_name, git_suffix) | Client-side validation errors by type |
| `codeplane_ui_repo_create_org_list_load_duration_seconds` | Histogram | `status` (success, error) | Time to load the org list for the owner selector (buckets: 0.05, 0.1, 0.25, 0.5, 1.0, 2.0) |

Server-side metrics (inherited from REPO_CREATE_USER_OWNED):

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_repo_create_total` | Counter | `status` (success, validation_error, conflict, auth_error, internal_error), `owner_type` (user, org) | Total repository creation attempts |
| `codeplane_repo_create_duration_seconds` | Histogram | `status`, `owner_type` | Latency of the creation operation |
| `codeplane_repos_total` | Gauge | `visibility` (public, private) | Total number of repositories |

## Alerts

### Alert: High UI Repository Creation Failure Rate

**Condition:** `rate(codeplane_ui_repo_create_submission_total{status=~"server_error|network_error"}[5m]) / rate(codeplane_ui_repo_create_submission_total[5m]) > 0.2`

**Severity:** `warning`

**Runbook:**
1. Check server-side logs for `error`-level entries with `repo_create` context in the last 15 minutes.
2. Check `codeplane_repo_create_total{status="internal_error"}` to determine if the server is returning 500s.
3. Check database connectivity and health. Run `SELECT 1` against the primary database.
4. Check network connectivity between the UI and API server (CDN/proxy health, DNS resolution).
5. If server-side 500s are confirmed, follow the `REPO_CREATE_USER_OWNED` server error runbook.
6. If network errors dominate, check load balancer health, SSL certificate validity, and CDN configuration.
7. Check for recent deployments that may have introduced a regression.
8. Escalate if the issue persists after 15 minutes.

### Alert: Abnormal Org List Fetch Failures

**Condition:** `rate(codeplane_ui_repo_create_org_list_load_duration_seconds_count{status="error"}[5m]) > 0.5`

**Severity:** `warning`

**Runbook:**
1. Check the server logs for errors on the `GET /api/user/orgs` endpoint.
2. Verify the endpoint returns 200 with a valid JSON array by manually calling it with a test token.
3. Check if the `organizations` or `org_members` tables are experiencing lock contention or slow queries.
4. If the endpoint is healthy but clients are failing, check for CORS issues or CDN caching returning stale error responses.
5. If isolated to specific users, check their org membership count — extremely large org lists may cause timeouts.

### Alert: Sustained Zero Successful Creations from Web UI

**Condition:** `sum(rate(codeplane_ui_repo_create_submission_total{status="success"}[15m])) == 0 AND sum(rate(codeplane_ui_repo_create_page_load_total[15m])) > 1`

**Severity:** `critical`

**Runbook:**
1. Users are loading the page but no creations succeed. This is a complete feature outage.
2. Check server-side `codeplane_repo_create_total` — if API-level creates are also zero, the issue is server-side.
3. If API creates work (via CLI/API) but UI creates fail, the issue is UI-specific: check for JavaScript errors in client telemetry, check if a deploy broke the form submission logic.
4. Verify the `/new` page renders correctly by loading it in a browser.
5. Check the browser console for fetch errors, CORS blocks, or JavaScript exceptions.
6. Roll back the most recent UI deployment if a regression is suspected.

## Error Cases and Failure Modes

| Failure Mode | Detection | User Impact | Mitigation |
|---|---|---|---|
| Org list endpoint unavailable | Org selector shows only personal account | Users cannot create org repos from UI | Graceful degradation — personal creation still works. Subtle retry link shown. |
| API server unavailable | All submissions return network errors | Complete creation outage | Toast notification with retry guidance. Server health alerts trigger. |
| Database unavailable | 500 errors on all submissions | Complete creation outage | Server-side DB health alerts. Toast "try again later." |
| JavaScript bundle fails to load | Page renders blank or missing form | Cannot create repos from UI | Client-side error monitoring. CDN health check. CLI and API remain available. |
| Session cookie expired | 401 on submission | Redirect to login, form data lost | Pre-flight auth check on page load (fetch `/api/auth/status`). Consider saving form state to URL params. |
| Feature flag disabled mid-session | Page may render but submit fails with 404 | Confusing 404 error | Feature flag check on page load. If disabled, redirect to home with message. |
| Rate limit exceeded | 429 on submission | User cannot create repos temporarily | Parse `Retry-After`, show countdown, disable button for duration. |

## Verification

## Playwright (Web UI) E2E Tests

### Page Access and Navigation

| # | Test Case | Steps | Expected |
|---|---|---|---|
| 1 | Navigate to `/new` when authenticated | Login, go to `/new` | Page renders with "Create a new repository" heading, form is visible |
| 2 | Navigate to `/new` when unauthenticated | Logout, go to `/new` | Redirected to `/login?redirect=%2Fnew` |
| 3 | Navigate via global "+" button | Click "+" in header → "New Repository" | Navigated to `/new` |
| 4 | Navigate via command palette | `Cmd+K` → type "Create Repository" → select | Navigated to `/new` |
| 5 | Navigate via command palette alias | `Cmd+K` → type "New Repo" → select | Navigated to `/new` |
| 6 | Page title is correct | Navigate to `/new` | `document.title` is "New Repository · Codeplane" |
| 7 | Feature flag disabled hides `/new` | Disable `REPO_CREATE_UI` flag, navigate to `/new` | 404 page rendered |
| 8 | Feature flag disabled hides header button | Disable `REPO_CREATE_UI` flag | "+" dropdown does not contain "New Repository" |
| 9 | Feature flag disabled hides command palette entry | Disable `REPO_CREATE_UI` flag, open command palette | "Create Repository" command not present |

### Owner Selector

| # | Test Case | Steps | Expected |
|---|---|---|---|
| 10 | Default owner is authenticated user | Navigate to `/new` | Owner selector shows current user's username |
| 11 | User with no orgs sees only personal account | User with no orgs navigates to `/new` | Owner selector has one option: the user's username |
| 12 | User with owner-role orgs sees orgs in selector | User who owns "acme-corp" navigates to `/new` | Selector shows username + "acme-corp" |
| 13 | User with member-only org does not see org | User is member (not owner) of "other-org" | "other-org" not in selector options |
| 14 | Switching owner preserves form fields | Fill name and description, switch owner | Name and description values unchanged |
| 15 | Org list fetch failure degrades gracefully | Mock org list to return 500 | Selector shows only personal account, subtle error indicator visible |

### Name Field Validation

| # | Test Case | Steps | Expected |
|---|---|---|---|
| 16 | Valid name shows green checkmark | Type "my-repo" | Green checkmark visible, no error text, submit button enabled |
| 17 | Empty name keeps submit disabled | Clear name field | Submit button is disabled, no error shown (field untouched) |
| 18 | Empty name after typing shows error | Type "a", then delete it | Error text: "Repository name is required." Submit disabled. |
| 19 | Name too long (101 chars) shows error | Type 101-character string | Error text: "Name must be 100 characters or fewer." Character counter shows `101/100` in red. |
| 20 | Name exactly 100 chars accepted | Type exactly 100-character valid name | Green checkmark. Character counter shows `100/100` in amber/warning. Submit enabled. |
| 21 | Name with 1 character accepted | Type "a" | Green checkmark. Submit enabled. |
| 22 | Name starting with dot rejected | Type ".hidden" | Error: "Name must start with a letter or number." |
| 23 | Name starting with hyphen rejected | Type "-invalid" | Error: "Name must start with a letter or number." |
| 24 | Name starting with underscore rejected | Type "_invalid" | Error: "Name must start with a letter or number." |
| 25 | Name with spaces rejected | Type "my repo" | Error: "Name can only contain letters, numbers, dots, underscores, and hyphens." |
| 26 | Name with special characters rejected | Type "my@repo" | Error about invalid characters |
| 27 | Name ending with `.git` rejected | Type "myrepo.git" | Error: "Name cannot end with .git." |
| 28 | Name ending with `.GIT` rejected (case-insensitive) | Type "myrepo.GIT" | Error: "Name cannot end with .git." |
| 29 | Reserved name `settings` rejected | Type "settings" | Error: "'settings' is a reserved name." |
| 30 | Reserved name `issues` rejected | Type "issues" | Error: "'issues' is a reserved name." |
| 31 | Reserved name case-insensitive (`SETTINGS`) | Type "SETTINGS" | Error: "'SETTINGS' is a reserved name." |
| 32 | All 15 reserved names rejected | For each reserved name, type it | Each shows the reserved name error |
| 33 | Name with dots, underscores, hyphens accepted | Type "my.repo_name-here" | Green checkmark, submit enabled |
| 34 | Character counter shows current count | Type "hello" | Counter shows `5/100` |
| 35 | Character counter warning at 80 chars | Type 80-character name | Counter shows `80/100` in amber |
| 36 | Leading/trailing whitespace trimmed | Type "  my-repo  " | Validation runs against "my-repo", accepted |
| 37 | Validation debounces (300ms) | Type rapidly | Error does not flash on intermediate invalid states; only shows after typing stops |
| 38 | Unicode/emoji rejected | Type "my-repo-🚀" | Error about invalid characters |

### URL Preview

| # | Test Case | Steps | Expected |
|---|---|---|---|
| 39 | URL preview shows when name is valid | Type valid name "test-repo" | Preview text: "Your repository will be created at: codeplane.app/{user}/test-repo" |
| 40 | URL preview updates with owner change | Change owner to org "acme" | Preview: "codeplane.app/acme/test-repo" |
| 41 | URL preview hidden when name is empty | Clear name field | Preview not visible |
| 42 | URL preview hidden when name is invalid | Type ".invalid" | Preview not visible |

### Form Submission — Success

| # | Test Case | Steps | Expected |
|---|---|---|---|
| 43 | Create repo with minimal fields (name only) | Type name "pw-test-minimal", click Create | Redirected to `/{user}/pw-test-minimal`. Repo overview page loads. |
| 44 | Create repo with all fields filled | Name, description, private, custom bookmark | Redirected to `/{user}/{name}`. All fields persisted. |
| 45 | Create private repo | Select "Private" visibility, create | Repo created with `private: true` |
| 46 | Create repo with custom bookmark | Enter "develop" as default bookmark | Repo created with `default_bookmark: "develop"` |
| 47 | Create repo with description | Enter "My cool project" | Repo created with description |
| 48 | Create org-owned repo | Select org in owner selector, create | Redirected to `/{org}/{name}`. Repo is under org. |
| 49 | Submit button shows loading state during creation | Click Create, observe button | Button shows "Creating…" with spinner, is disabled |
| 50 | Double-click prevention | Click Create twice rapidly | Only one API request sent (verify via network intercept) |

### Form Submission — Error Handling

| # | Test Case | Steps | Expected |
|---|---|---|---|
| 51 | Duplicate name (409 Conflict) | Create "dup-test", go back to `/new`, create "dup-test" again | Inline error: "A repository with this name already exists." Form not cleared. |
| 52 | Duplicate name case-insensitive | Create "MyRepo", try "myrepo" | 409, inline error shown |
| 53 | Server validation error (422) | (Trigger via API mock or edge case) | Inline error below name field with server message |
| 54 | Org permission denied (403) | (Trigger via mock: user removed from org mid-session) | Toast: "You do not have permission to create repositories in this organization." |
| 55 | Server error (500) | (Mock API to return 500) | Toast: "Something went wrong. Please try again." Form not cleared. |
| 56 | Network failure | (Mock network disconnect) | Toast: "Unable to reach Codeplane. Check your connection and try again." Form not cleared. |
| 57 | Rate limit (429) | (Mock 429 with Retry-After: 30) | Toast with retry message. Submit button disabled for 30 seconds. |
| 58 | Session expired (401) on submit | (Expire session cookie before submit) | Redirected to `/login` |
| 59 | Form preserved after error | Trigger 409, verify name/description/visibility preserved | All fields retain their values |

### Visibility and Defaults

| # | Test Case | Steps | Expected |
|---|---|---|---|
| 60 | Default visibility is Public | Open form | "Public" radio is selected |
| 61 | Default bookmark placeholder is "main" | Open form | Bookmark field shows "main" as placeholder |
| 62 | Empty bookmark field submits correctly | Leave bookmark empty, create | Repo created with `default_bookmark: "main"` |
| 63 | Cancel navigates away | Click "Cancel" | Navigated to previous page or home |

### Keyboard Navigation and Accessibility

| # | Test Case | Steps | Expected |
|---|---|---|---|
| 64 | Tab navigates through all fields | Press Tab repeatedly | Focus moves: Owner → Name → Description → Public → Private → Bookmark → Cancel → Create |
| 65 | Enter submits when name focused and valid | Focus name field, press Enter | Form submits (if name is valid) |
| 66 | Enter does NOT submit from description textarea | Focus description, press Enter | Newline inserted in textarea, form not submitted |
| 67 | Space toggles radio buttons | Focus Private radio, press Space | Private selected |
| 68 | Screen reader announces validation error | Type invalid name, wait 300ms | `aria-live` region announces the error |
| 69 | Name field auto-focused on page load | Navigate to `/new` | Name field has focus |

### Responsive Design

| # | Test Case | Steps | Expected |
|---|---|---|---|
| 70 | Form renders correctly at 1280px width | Set viewport to 1280px | Form centered, max 600px wide |
| 71 | Form renders correctly at 375px width (mobile) | Set viewport to 375px | Form takes full width with padding, all fields stack vertically |
| 72 | Touch targets are at least 44px | On mobile viewport | Radio buttons and submit button meet minimum tap target size |

## API Integration Tests (supporting the UI)

| # | Test Case | Method | Expected |
|---|---|---|---|
| 73 | User repo creation via API | `POST /api/user/repos { "name": "api-ui-test" }` | 201 with correct response shape |
| 74 | Org repo creation via API | `POST /api/orgs/:org/repos { "name": "org-api-test" }` | 201 with correct response shape |
| 75 | Duplicate name returns 409 | Create same name twice | Second returns 409 |
| 76 | Invalid name returns 422 | `POST { "name": ".bad" }` | 422 with field error |
| 77 | Unauthenticated returns 401 | `POST` without auth | 401 |
| 78 | Non-owner org member returns 403 | `POST /api/orgs/:org/repos` as non-owner | 403 |
| 79 | Name with exactly 100 chars accepted | `POST { "name": "a" + "b".repeat(99) }` | 201 |
| 80 | Name with 101 chars rejected | `POST { "name": "a" + "b".repeat(100) }` | 422 |
| 81 | Reserved name rejected | `POST { "name": "settings" }` | 422 |
| 82 | Name ending `.git` rejected | `POST { "name": "test.git" }` | 422 |
| 83 | Empty default_bookmark normalizes to "main" | `POST { "name": "bm-test", "default_bookmark": "" }` | 201, `default_bookmark: "main"` |
| 84 | Whitespace-only bookmark normalizes to "main" | `POST { "name": "ws-bm-test", "default_bookmark": "   " }` | 201, `default_bookmark: "main"` |
| 85 | Created repo retrievable via GET | Create then `GET /api/repos/:owner/:name` | 200 with matching data |
| 86 | Created repo in user list | Create then `GET /api/user/repos` | List includes new repo |

## CLI E2E Tests (cross-client consistency)

| # | Test Case | Command | Expected |
|---|---|---|---|
| 87 | Repo created via web is visible in CLI | Create via Playwright, then `codeplane repo view -R {user}/{name} --json` | CLI returns matching repo data |
| 88 | Repo created via CLI is visible in web | Create via CLI, then navigate to `/{user}/{name}` in Playwright | Repo overview page loads |

## Cleanup

All test repositories created during E2E tests must be deleted in `afterEach` or `afterAll` hooks to prevent test pollution. Use `DELETE /api/repos/:owner/:repo` with admin credentials for cleanup.
