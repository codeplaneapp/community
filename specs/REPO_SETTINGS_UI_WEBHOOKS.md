# REPO_SETTINGS_UI_WEBHOOKS

Specification for REPO_SETTINGS_UI_WEBHOOKS.

## High-Level User POV

When you administer a Codeplane repository, webhooks are how your repository communicates with the outside world in real time. The webhooks settings page is where you go to see, create, configure, test, and remove all outbound HTTP integrations for your repository.

You reach the webhooks settings page by navigating to your repository, clicking the "Settings" tab in the repository tab bar — visible only if you have admin or owner permission — and then selecting "Webhooks" from the settings sidebar navigation. The URL is `/:owner/:repo/settings/webhooks`. It sits alongside other settings categories like General, Labels, Milestones, Secrets, Variables, and Deploy Keys.

The page is organized into two parts: a prominent "Add webhook" button at the top and the full list of existing webhooks below it.

Clicking **Add webhook** takes you to a dedicated creation form where you configure a new integration: the HTTPS URL that should receive payloads, an optional shared secret for HMAC-SHA256 signature verification, which repository events should trigger deliveries, and whether the webhook should start active immediately. Event selection offers three intuitive options — subscribe to just push events, subscribe to everything, or pick individual events from a clearly labeled checkbox grid. Once you save, the new webhook appears in the list and begins listening for the events you selected.

The **webhook list** shows every webhook configured for the repository — up to the platform maximum of 20. Each row displays the webhook's payload URL, the events it subscribes to as colored badge pills, whether it is currently active or inactive, and when it last successfully delivered a payload. Webhooks that have been automatically disabled after 10 consecutive delivery failures are visually flagged with a warning indicator so you can spot broken integrations at a glance.

Clicking any webhook in the list takes you to its **detail page** at `/:owner/:repo/settings/webhooks/:id`. Here you see the full configuration summary — URL, secret status (always masked), subscribed events, active state, and timestamps — alongside action buttons to edit, send a test delivery, or delete the webhook. Below the configuration summary, the **Recent Deliveries** section provides a chronological log of every delivery attempt for this webhook, newest first. Each delivery shows its event type, HTTP response status, success/failure/pending indicator, attempt count, and timestamp. You can expand any delivery to inspect the full JSON payload that was sent and the response body your server returned. This delivery history is the primary debugging tool when an external integration stops working — it immediately tells you whether the problem is on Codeplane's side or the receiving endpoint's side.

From the detail page, the **Edit** button takes you to an edit form at `/:owner/:repo/settings/webhooks/:id/edit`, pre-populated with the webhook's current configuration. You can change the URL, rotate the secret, adjust event subscriptions, or toggle the active state — and only the fields you actually modify are sent to the server. The **Test delivery** button sends a ping event to the webhook's URL so you can confirm connectivity without waiting for a real repository event. The **Delete** button removes the webhook permanently after you confirm through a dialog.

If the repository has reached the maximum of 20 webhooks, the "Add webhook" button is disabled with an explanation. If the repository is archived, the page displays your webhooks in read-only mode with a notice that the repository must be unarchived before webhooks can be modified.

Every change you make on the webhooks settings pages takes effect immediately. There is no draft or staging concept. The page works in concert with the CLI (`codeplane webhook` commands), the TUI, and the API — all four surfaces manage the same underlying webhook resources.

## Acceptance Criteria

## Definition of Done

- [ ] Authenticated users with admin or owner permission on a repository can access the webhooks settings page at `/:owner/:repo/settings/webhooks`.
- [ ] The webhooks settings page is accessible from the settings sidebar under "Webhooks."
- [ ] The page contains an "Add webhook" button and a list of existing webhooks.
- [ ] Webhook creation, viewing, editing, test delivery, and deletion are fully functional from this page.
- [ ] All webhook operations call the existing Webhook API endpoints (`POST`, `GET`, `PATCH`, `DELETE` under `/api/repos/:owner/:repo/hooks` and sub-paths).
- [ ] Non-admin authenticated users who navigate to `/:owner/:repo/settings/webhooks` are redirected to the repository overview (`/:owner/:repo`) with an access-denied toast notification.
- [ ] Unauthenticated users who navigate to `/:owner/:repo/settings/webhooks` for a private repo see a 404 page (consistent with the privacy model that avoids leaking repository existence).
- [ ] Unauthenticated users who navigate to `/:owner/:repo/settings/webhooks` for a public repo are redirected to the login page.
- [ ] The "Settings" tab in the repository tab bar is only visible to users with admin or owner permission.
- [ ] All client-side validation matches the API constraints exactly — no mismatch between what the client allows and what the server accepts.
- [ ] The page is fully navigable via keyboard (Tab/Shift+Tab between fields, Enter to submit, Escape to dismiss dialogs).
- [ ] The page renders correctly on viewports from 320px to 2560px wide.
- [ ] All verification tests pass.
- [ ] Observability instrumentation is in place.

## Webhook List Constraints

- [ ] The webhook list displays all webhooks for the repository (max 20; no server-side pagination since the cap is small).
- [ ] The list header shows the total webhook count: "Webhooks (N)."
- [ ] Each webhook row displays: truncated payload URL, event badges, active/inactive status indicator, last delivery timestamp (relative with ISO tooltip), and action area.
- [ ] Active webhooks show a green status pill; inactive webhooks show a red/gray status pill.
- [ ] Webhooks auto-disabled after 10 consecutive failures show an amber warning icon with tooltip "Auto-disabled due to consecutive delivery failures."
- [ ] When the repository has no webhooks, the list shows an empty state message: "No webhooks configured. Add a webhook to start receiving event notifications."
- [ ] Clicking a webhook row navigates to the webhook detail page at `/:owner/:repo/settings/webhooks/:id`.
- [ ] The "Add webhook" button is disabled with a tooltip "Maximum of 20 webhooks reached" when 20 webhooks exist.

## Webhook Creation Form Constraints

- [ ] The creation form is presented at the route `/:owner/:repo/settings/webhooks/new`.
- [ ] The **Payload URL** field is a single-line text input with placeholder `https://example.com/webhook`. Required.
- [ ] The URL is trimmed of leading/trailing whitespace before submission.
- [ ] The URL must start with `https://`. An `http://` or other scheme shows an inline validation error: "Webhook URL must use HTTPS."
- [ ] An empty or whitespace-only URL shows an inline validation error: "Payload URL is required."
- [ ] The URL field has a maximum length of 2048 characters. A live counter appears only when the user is within 100 characters of the limit.
- [ ] The **Content type** dropdown defaults to `application/json` with `application/x-www-form-urlencoded` as an alternative.
- [ ] The **Secret** field is a password-style masked text input. Optional. Accompanied by helper text: "Used to create an HMAC-SHA256 signature of each delivery payload."
- [ ] The secret field has a maximum length of 255 characters.
- [ ] The **Events** selection offers a radio group with three options:
  - "Just the push event" (default) — sets events to `["push"]`.
  - "Send me everything" — sets events to `["*"]`.
  - "Let me select individual events" — expands a checkbox grid of event types: `push`, `create`, `delete`, `landing_request`, `issues`, `issue_comment`, `status`, `workflow_run`, `release`. Each checkbox has a descriptive label.
- [ ] When "Let me select individual events" is chosen, at least one event must be selected. Otherwise the "Add webhook" button is disabled with tooltip "Select at least one event."
- [ ] The **Active** checkbox is checked by default. Label: "We will deliver event details when this hook is triggered."
- [ ] The "Add webhook" submit button is disabled until the URL passes validation and at least one event is selected.
- [ ] While submitting, the button shows a spinner and all form inputs are disabled.
- [ ] On success (201): redirect to the newly created webhook's detail page at `/:owner/:repo/settings/webhooks/:id` with a toast "Webhook created."
- [ ] On validation error (422): inline error messages appear on the offending fields. Form state is preserved.
- [ ] On limit error (422, field `repository_id`): toast "Maximum of 20 webhooks reached."
- [ ] On permission error (403): toast "Permission denied."
- [ ] On network or server error (500): toast "Something went wrong. Please try again." Form state is preserved.

## Webhook Detail Page Constraints

- [ ] The detail page is presented at `/:owner/:repo/settings/webhooks/:id`.
- [ ] Breadcrumb navigation shows: `Settings > Webhooks > Webhook #<id>`.
- [ ] The **Configuration Summary** section displays: Payload URL (full text, monospace), Secret status ("Configured" with mask indicator or "Not configured"), Events (as badge pills), Active status (green/red pill), Created timestamp (relative + ISO tooltip), Last delivery timestamp (relative + ISO tooltip, or "Never").
- [ ] Three action buttons are displayed: "Edit" (navigates to edit form), "Test delivery" (sends ping), "Delete" (opens confirmation dialog).
- [ ] If the webhook is auto-disabled, an alert banner is displayed: "This webhook has been automatically disabled after 10 consecutive delivery failures. Re-enable it from the edit form once the receiving endpoint is fixed."
- [ ] The **Recent Deliveries** section shows deliveries ordered newest-first.
- [ ] Each delivery row shows: status icon (green check for success, red X for failed, yellow clock for pending), event type badge, HTTP response status code (or "—" if pending), attempt count, and timestamp.
- [ ] Clicking/expanding a delivery row reveals: full JSON payload viewer, response body (truncated at 10 KB), delivered-at ISO timestamp, and next-retry-at timestamp (if pending retry).
- [ ] Delivery list is paginated at 30 items per page with a "Load more" button.
- [ ] Empty delivery state shows: "No deliveries yet. Trigger a repository event or click 'Test delivery' to send a ping."
- [ ] "Test delivery" button sends a test/ping delivery. On success: toast "Ping delivery sent." Delivery list refreshes to show the new ping delivery.
- [ ] "Delete" button opens a confirmation dialog displaying the webhook URL: "Are you sure you want to delete this webhook? The endpoint at `<url>` will no longer receive deliveries. This action cannot be undone." Confirm (destructive red) and Cancel buttons. On success: redirect to webhook list with toast "Webhook deleted."

## Webhook Edit Form Constraints

- [ ] The edit form is presented at `/:owner/:repo/settings/webhooks/:id/edit`.
- [ ] All fields are pre-populated with the webhook's current configuration.
- [ ] The **Payload URL** field follows the same validation rules as creation (HTTPS required, trimmed, max 2048 chars).
- [ ] The **Secret** field shows placeholder text "Leave blank to keep current secret" when a secret exists. A "Clear secret" option is available to remove the existing secret. Entering a new value replaces the secret entirely.
- [ ] The **Events** radio/checkbox selection reflects the current subscription.
- [ ] The **Active** checkbox reflects the current active state.
- [ ] The "Update webhook" button is disabled until at least one field differs from the loaded state.
- [ ] Only changed fields are submitted via PATCH.
- [ ] While submitting, the button shows a spinner and inputs are disabled.
- [ ] On success (200): redirect to the webhook detail page with toast "Webhook updated."
- [ ] On validation error (422): inline errors on offending fields. Form state preserved.
- [ ] On not found (404): toast "Webhook not found." Redirect to webhook list.
- [ ] On permission error (403): toast "Permission denied."
- [ ] On network/server error (500): toast "Something went wrong." Form state preserved.

## Archived Repository Behavior

- [ ] Yellow banner: "This repository is archived. Unarchive it to manage webhooks."
- [ ] "Add webhook" button is hidden or disabled.
- [ ] Webhook list is still visible for reference.
- [ ] Detail pages are still accessible for viewing configuration and delivery history.
- [ ] Edit, Test delivery, and Delete buttons are hidden or disabled on detail pages.
- [ ] After unarchiving, full functionality is restored.

## Edge Cases

- [ ] Non-existent repository → 404 page.
- [ ] Private repo without access → 404 page (not 403).
- [ ] Non-existent webhook ID → 404 page.
- [ ] URL of exactly 2048 characters → creation succeeds.
- [ ] URL of 2049 characters → prevented by client validation.
- [ ] Secret of exactly 255 characters → creation succeeds.
- [ ] Secret of 256 characters → prevented by client validation.
- [ ] Two webhooks with identical URLs → both succeed (duplicate URLs are permitted).
- [ ] Creating webhook #20 → succeeds. Creating webhook #21 → client shows limit error.
- [ ] Concurrent deletion of webhook being viewed → next interaction shows 404 toast and redirects to list.
- [ ] Browser back/forward preserves page and form state.
- [ ] Deep-linking directly to `/:owner/:repo/settings/webhooks` works.
- [ ] Deep-linking directly to `/:owner/:repo/settings/webhooks/:id` works.
- [ ] Deep-linking directly to `/:owner/:repo/settings/webhooks/new` works.
- [ ] Deep-linking directly to `/:owner/:repo/settings/webhooks/:id/edit` works.
- [ ] Webhook URL containing query parameters and fragments → preserved exactly.
- [ ] Event type "*" correctly renders as "All events" in the UI, not a literal asterisk.

## Design

## Web UI Design

### Route Structure

| Route | Purpose |
|---|---|
| `/:owner/:repo/settings/webhooks` | Webhook list (default webhooks landing) |
| `/:owner/:repo/settings/webhooks/new` | Webhook creation form |
| `/:owner/:repo/settings/webhooks/:id` | Webhook detail page |
| `/:owner/:repo/settings/webhooks/:id/edit` | Webhook edit form |

All routes live inside the existing repository layout, below the repository header and tab bar, within the settings area. The settings sidebar navigation shows "Webhooks" below "Milestones" and is highlighted when any webhook sub-route is active with a left border accent (4px, primary color), bold text, and subtle background.

### Webhook List Page

```
┌─────────────────────────────────────────────────────────────┐
│  Webhooks (3)                               [Add webhook]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 🟢  https://ci.example.com/webhooks/codeplane          ││
│  │     [push] [landing_request]           2 hours ago      ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 🟢  https://deploy.example.com/hooks/prod              ││
│  │     [push] [release]                   5 minutes ago    ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 🔴 ⚠ https://old-service.example.com/notify            ││
│  │     [*] All events                     3 days ago       ││
│  │     Auto-disabled: consecutive delivery failures        ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Row details:**
- Status indicator: green circle for active, red circle for inactive.
- Amber warning icon (⚠) appended when auto-disabled.
- URL displayed as monospace text, truncated with ellipsis at container width. Full URL in tooltip on hover.
- Event badges as colored pills. Wildcard `["*"]` renders as "All events" pill.
- Last delivery timestamp as relative time with ISO tooltip. "Never" if null.
- Entire row is clickable and navigates to detail page.

**Empty state:**
- Centered illustration/icon.
- Heading: "No webhooks configured."
- Body: "Webhooks allow external services to be notified when certain events happen in this repository."
- Primary button: "Add webhook."

### Webhook Creation Form

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to webhooks                                         │
│                                                             │
│  Add webhook                                                │
│                                                             │
│  Payload URL *                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ https://                                                ││
│  └─────────────────────────────────────────────────────────┘│
│  URL must use HTTPS.                                        │
│                                                             │
│  Content type                                               │
│  ┌──────────────────────┐                                   │
│  │ application/json  ▾  │                                   │
│  └──────────────────────┘                                   │
│                                                             │
│  Secret                                                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ••••••••                                                ││
│  └─────────────────────────────────────────────────────────┘│
│  Used to create an HMAC-SHA256 signature of each payload.   │
│                                                             │
│  Which events would you like to trigger this webhook?       │
│  ○ Just the push event                                      │
│  ○ Send me everything                                       │
│  ● Let me select individual events                          │
│    ┌───────────────────────────────────────────────────────┐│
│    │ ☑ Push                  ☐ Issue comment               ││
│    │ ☐ Create                ☑ Status                      ││
│    │ ☐ Delete                ☐ Workflow run                 ││
│    │ ☑ Landing request       ☐ Release                     ││
│    │ ☐ Issues                                              ││
│    └───────────────────────────────────────────────────────┘│
│                                                             │
│  ☑ Active                                                   │
│  We will deliver event details when this hook is triggered.  │
│                                                             │
│  ┌──────────────┐                                           │
│  │ Add webhook  │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

**Event checkbox labels:**

| Event Type | Display Label | Description |
|---|---|---|
| `push` | Push | Any push to a repository |
| `create` | Create | Branch or tag created |
| `delete` | Delete | Branch or tag deleted |
| `landing_request` | Landing request | Landing request opened, updated, or landed |
| `issues` | Issues | Issue opened, edited, or closed |
| `issue_comment` | Issue comment | Comment created on an issue |
| `status` | Status | Commit status updated |
| `workflow_run` | Workflow run | Workflow run created, completed, or failed |
| `release` | Release | Release published or edited |

### Webhook Detail Page

```
┌─────────────────────────────────────────────────────────────┐
│  Settings > Webhooks > Webhook #42                          │
│                                                             │
│  https://ci.example.com/webhooks/codeplane       🟢 Active  │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Payload URL     https://ci.example.com/webhooks/...   ││
│  │  Secret          ●●●●●●●●  (Configured)                ││
│  │  Events          [push] [landing_request]               ││
│  │  Created         Mar 20, 2026 (2 days ago)              ││
│  │  Last delivery   Mar 22, 2026 (5 minutes ago)           ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  [Edit]   [🔔 Test delivery]   [🗑 Delete]                  │
│                                                             │
│  ─── Recent Deliveries ─────────────────────────────────── │
│                                                             │
│  ✅  push    200    1 attempt    5 minutes ago     ▶       │
│  ✅  push    200    1 attempt    2 hours ago       ▶       │
│  ❌  push    500    3 attempts   1 day ago         ▶       │
│  🕐  push     —     0 attempts   just now          ▶       │
│                                                             │
│  [Load more]                                                │
└─────────────────────────────────────────────────────────────┘
```

**Expanded delivery row:**

```
│  ✅  push    200    1 attempt    5 minutes ago     ▼       │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Request Payload                                        ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │ {                                                   │││
│  │  │   "action": "pushed",                               │││
│  │  │   "ref": "main",                                    │││
│  │  │   "..."                                             │││
│  │  │ }                                                   │││
│  │  └─────────────────────────────────────────────────────┘││
│  │                                                        ││
│  │  Response (200 OK)                                      ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │ OK                                                  │││
│  │  └─────────────────────────────────────────────────────┘││
│  │                                                        ││
│  │  Delivered at: 2026-03-22T14:30:00.000Z                 ││
│  │  Attempts: 1                                            ││
│  └─────────────────────────────────────────────────────────┘│
```

### Webhook Edit Form

Same layout as the creation form, with the following differences:
- Heading reads "Edit webhook" instead of "Add webhook."
- All fields pre-populated with current values.
- Secret field shows placeholder "Leave blank to keep current secret" and has a "Clear secret" link that sets the secret to empty string.
- Submit button reads "Update webhook."
- "Cancel" link returns to the detail page.

### Responsive Behavior

- **< 768px**: Settings sidebar collapses to dropdown. Webhook rows stack vertically (URL on first line, events + status on second line). Forms stack fields vertically. Event checkbox grid becomes single-column.
- **768px – 1024px**: Sidebar 200px. Webhook rows horizontal. Forms in single column. Event checkbox grid in two columns.
- **> 1024px**: Sidebar 240px. Content area max-width 720px. Event checkbox grid in three columns.

### Loading and Error States

- **List initial load**: Skeleton loader for webhook rows (3 placeholder rows).
- **Detail page load**: Skeleton loader for configuration summary and delivery list.
- **Form submission in progress**: Spinner on button, all inputs disabled.
- **Network error during load**: Inline error card with "Failed to load webhooks" and "Retry" button.
- **Network error during mutation**: Toast notification. Form state preserved.
- **404 during detail/edit load**: Full-page 404 with "Webhook not found" and link back to webhook list.

## API Shape

No new API endpoints required. The webhooks settings UI consumes the existing webhook endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/repos/:owner/:repo/hooks` | GET | List all webhooks |
| `/api/repos/:owner/:repo/hooks` | POST | Create webhook |
| `/api/repos/:owner/:repo/hooks/:id` | GET | View webhook detail |
| `/api/repos/:owner/:repo/hooks/:id` | PATCH | Update webhook |
| `/api/repos/:owner/:repo/hooks/:id` | DELETE | Delete webhook |
| `/api/repos/:owner/:repo/hooks/:id/tests` | POST | Send test delivery |
| `/api/repos/:owner/:repo/hooks/:id/deliveries` | GET | List delivery history |

## SDK Shape

Shared hooks from `@codeplane/ui-core`:

- `useWebhooks(owner, repo)` — fetches and caches the webhook list for the repository.
- `useWebhook(owner, repo, id)` — fetches and caches a single webhook detail.
- `useCreateWebhook()` — mutation hook wrapping `POST /api/repos/:owner/:repo/hooks`.
- `useUpdateWebhook()` — mutation hook wrapping `PATCH /api/repos/:owner/:repo/hooks/:id`.
- `useDeleteWebhook()` — mutation hook wrapping `DELETE /api/repos/:owner/:repo/hooks/:id`.
- `useTestWebhookDelivery()` — mutation hook wrapping `POST /api/repos/:owner/:repo/hooks/:id/tests`.
- `useWebhookDeliveries(owner, repo, id, cursor?, limit?)` — paginated delivery list with cursor-based navigation.
- `useRepo(owner, repo)` — existing hook for archive status and permissions.
- `useUser()` — existing hook for auth context.

## CLI Command

No new CLI commands required. The CLI already supports equivalent functionality through `codeplane webhook create`, `codeplane webhook list`, `codeplane webhook view`, `codeplane webhook update`, `codeplane webhook delete`, and `codeplane webhook deliveries`.

## TUI UI

No new TUI screens required. The TUI already has webhook management support.

## Documentation

1. **Managing Webhooks Guide** — End-to-end walkthrough of the webhooks settings page: how to access it, how to create a webhook step by step, how to interpret the webhook list and status indicators, how to inspect delivery history, how to edit and rotate secrets, how to test a webhook, and how to delete a webhook. Annotated screenshots for each step. Cross-references to CLI equivalents for each action.

2. **Webhook Events Reference** — A reference page listing every event type (`push`, `create`, `delete`, `landing_request`, `issues`, `issue_comment`, `status`, `workflow_run`, `release`) with a description of when each event fires and an example JSON payload.

3. **Webhook Security Guide** — Focused guide on configuring secrets, how HMAC-SHA256 signing works, code examples in JavaScript, Python, Go, and Ruby for verifying the `X-Codeplane-Signature-256` header with timing-safe comparison.

4. **Quick Reference Card** — Compact reference: Web (`/:owner/:repo/settings/webhooks`), CLI (`webhook create/list/view/update/delete/deliveries`), API (`POST/GET/PATCH/DELETE /api/repos/:owner/:repo/hooks`).

## Permissions & Security

## Authorization Roles

| Role | View Webhooks Page | Create Webhook | View Webhook Detail | Edit Webhook | Test Delivery | Delete Webhook |
|------|-------------------|----------------|--------------------|--------------|--------------|-----------------|
| **Owner** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Admin** (org team / admin collaborator) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Write** (collaborator) | ❌ (redirect) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Read** (collaborator) | ❌ (redirect) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Anonymous (public repo)** | ❌ (login redirect) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Anonymous (private repo)** | ❌ (404) | ❌ | ❌ | ❌ | ❌ | ❌ |

Note: The settings pages require admin or owner permission to access. Write collaborators cannot access the settings area, even though some webhook API endpoints enforce their own permission checks independently. This is consistent with `REPO_SETTINGS_UI_GENERAL` and `REPO_SETTINGS_UI_LABELS`.

## Permission Resolution Order

1. Check if the actor is authenticated. If not, return 401.
2. Check if the actor is the repository's direct owner. If yes, grant admin.
3. If the repository belongs to an organization, check if the actor is an org owner. If yes, grant admin.
4. Check the actor's highest team permission for the repository. If `admin`, grant admin.
5. Check the actor's direct collaborator permission. If `admin`, grant admin.
6. If none of the above, return 403.

## Client-Side Permission Enforcement

- The "Settings" tab in the repository tab bar is only rendered if the current user has admin or owner permission.
- The route guard for `/:owner/:repo/settings/webhooks` checks permission on mount. If the user lacks admin permission, they are redirected to `/:owner/:repo` with a toast: "You don't have permission to access repository settings."
- All mutation buttons (Add, Edit, Test, Delete) are conditionally rendered based on admin access.
- On archived repositories, mutation buttons are disabled/hidden even for admin users.

## Rate Limiting

- Standard global rate limiting applies to all API calls from the webhooks settings pages (inherits global per-user rate limit).
- Webhook creation: 10 creates per minute per user per repository (prevents scripted flooding).
- Webhook updates: 30 updates per minute per user per webhook.
- Webhook deletion: 30 deletes per minute per user per repository.
- Test delivery: 10 tests per minute per user per webhook (prevents test spam).
- Webhook list and detail reads: standard read rate limit.
- Delivery history reads: standard read rate limit.

## Data Privacy and Security

- **Secret handling**: Webhook secrets are encrypted before database storage using the configured `SecretCodec`. They are never logged, never included in error messages, and never returned in API responses (always redacted as `"********"`). The secret value never appears in the browser DOM, network responses, or client-side state in plaintext.
- **URL sensitivity**: Webhook URLs may contain tokens or path-based authentication. URLs are only visible to authenticated admin users. URLs must not be logged in full in server logs — only the domain portion should appear in structured logs.
- **Delivery payload exposure**: Delivery payloads may contain repository metadata (commit messages, issue titles, user names). This data is already repository-scoped and only visible to repository admins, so no additional privacy masking is required.
- **Response body exposure**: Response bodies from external endpoints (up to 10 KB) may contain third-party error messages. These are acceptable since only admins can view them.
- **No PII leakage in error messages**: Error responses (401, 403, 404) must not reveal whether a webhook exists if the user lacks permission. The permission check happens before the webhook existence check.
- **Private repository settings pages return 404 to unauthorized users, not 403**, to avoid leaking repository existence.
- **HTTPS enforcement**: Requiring HTTPS for webhook URLs ensures payload data is encrypted in transit when delivered.
- **XSS protection**: Delivery response bodies are rendered in a read-only code viewer, not injected as HTML. Webhook URLs are rendered as text, not as clickable links with user-controlled href attributes.

## Telemetry & Product Analytics

## Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `repo.settings.webhooks.page_viewed` | User navigates to webhooks list page | `repo_id`, `owner`, `repo_name`, `actor_id`, `referrer` (sidebar, direct_url, settings_nav), `webhooks_count`, `is_archived` |
| `repo.settings.webhooks.create_form_viewed` | User navigates to webhook creation form | `repo_id`, `owner`, `repo_name`, `actor_id`, `current_webhook_count` |
| `repo.settings.webhooks.webhook_created` | Webhook created from settings UI | `repo_id`, `owner`, `repo_name`, `actor_id`, `webhook_id`, `events_count`, `events_list`, `has_secret`, `is_active`, `event_selection_mode` (push_only, everything, individual) |
| `repo.settings.webhooks.webhook_create_failed` | Creation failed from settings UI | `repo_id`, `owner`, `repo_name`, `actor_id`, `error_code` (422, 403, 500), `error_field` |
| `repo.settings.webhooks.detail_viewed` | User navigates to webhook detail page | `repo_id`, `owner`, `repo_name`, `actor_id`, `webhook_id`, `is_active`, `has_deliveries`, `delivery_count_shown` |
| `repo.settings.webhooks.delivery_expanded` | User expands a delivery row to see payload | `repo_id`, `actor_id`, `webhook_id`, `delivery_id`, `delivery_status` |
| `repo.settings.webhooks.edit_form_viewed` | User navigates to webhook edit form | `repo_id`, `actor_id`, `webhook_id` |
| `repo.settings.webhooks.webhook_updated` | Webhook updated from settings UI | `repo_id`, `actor_id`, `webhook_id`, `fields_changed` (array), `has_secret_change`, `is_active` (new value if changed) |
| `repo.settings.webhooks.webhook_update_failed` | Update failed from settings UI | `repo_id`, `actor_id`, `webhook_id`, `error_code`, `error_field` |
| `repo.settings.webhooks.edit_cancelled` | User navigated away from edit form without saving | `repo_id`, `actor_id`, `webhook_id`, `had_unsaved_changes` |
| `repo.settings.webhooks.test_delivery_sent` | Test delivery triggered from detail page | `repo_id`, `actor_id`, `webhook_id` |
| `repo.settings.webhooks.test_delivery_failed` | Test delivery request failed | `repo_id`, `actor_id`, `webhook_id`, `error_code` |
| `repo.settings.webhooks.delete_initiated` | Delete dialog opened | `repo_id`, `actor_id`, `webhook_id`, `webhook_url_domain` |
| `repo.settings.webhooks.webhook_deleted` | Webhook deleted from settings UI | `repo_id`, `actor_id`, `webhook_id`, `webhook_age_days`, `was_active` |
| `repo.settings.webhooks.delete_cancelled` | Delete dialog cancelled | `repo_id`, `actor_id`, `webhook_id` |
| `repo.settings.webhooks.deliveries_load_more` | User clicked "Load more" on delivery list | `repo_id`, `actor_id`, `webhook_id`, `page_number` |

## Funnel Metrics and Success Indicators

- **Webhooks page visit rate**: Percentage of repositories where webhooks settings is visited at least once per month — indicates discoverability of the integration surface.
- **Create success rate**: `webhook_created / (webhook_created + webhook_create_failed)` — should be > 90%. Low rate indicates validation UX gaps or documentation issues.
- **Time to first delivery after creation**: Median time from `webhook_created` to the first successful delivery for that webhook — < 5 minutes indicates the setup-to-value loop is tight.
- **Event selection mode distribution**: Breakdown of `event_selection_mode` (push_only, everything, individual) — informs default selection and UI design.
- **Secret adoption rate**: Percentage of created webhooks with `has_secret: true` — should be high (> 70%). Low rate indicates security education gap in the creation form.
- **Detail page → edit conversion**: Percentage of `detail_viewed` followed by `edit_form_viewed` within 10 minutes — indicates users actively managing webhook config.
- **Detail page → test delivery conversion**: Percentage of `detail_viewed` followed by `test_delivery_sent` within 5 minutes — indicates users validating connectivity.
- **Delete confirmation rate**: `webhook_deleted / delete_initiated` — measures friction appropriateness. Should be 60–80% (too high = unnecessary friction; too low = users are confused).
- **Delivery expansion rate**: `delivery_expanded / detail_viewed` — indicates how often users need to debug payloads.
- **Web UI vs CLI vs API distribution**: Compare `webhook_created` (web) vs `WebhookCreated` (source=cli) vs `WebhookCreated` (source=api) — informs investment priority.

## Observability

## Logging Requirements

| Log Event | Level | Structured Context | When |
|---|---|---|---|
| `repo.settings.webhooks.page_loaded` | DEBUG | `{ repo_id, owner, repo, actor_id, webhooks_count, load_duration_ms }` | Webhooks list page completes initial data load |
| `repo.settings.webhooks.detail_loaded` | DEBUG | `{ repo_id, owner, repo, actor_id, webhook_id, delivery_count, load_duration_ms }` | Detail page completes loading |
| `repo.settings.webhooks.webhook_created` | INFO | `{ repo_id, owner, repo, actor_id, webhook_id, url_domain, events_count, is_active, duration_ms }` | Webhook created from settings |
| `repo.settings.webhooks.webhook_updated` | INFO | `{ repo_id, owner, repo, actor_id, webhook_id, fields_changed, duration_ms }` | Webhook updated from settings |
| `repo.settings.webhooks.webhook_deleted` | INFO | `{ repo_id, owner, repo, actor_id, webhook_id, url_domain, duration_ms }` | Webhook deleted from settings |
| `repo.settings.webhooks.test_delivery_sent` | INFO | `{ repo_id, owner, repo, actor_id, webhook_id, duration_ms }` | Test delivery triggered |
| `repo.settings.webhooks.permission_denied` | WARN | `{ owner, repo, actor_id, required_role, attempted_action }` | Unauthorized access attempt |
| `repo.settings.webhooks.create_validation_error` | WARN | `{ repo_id, actor_id, field, error_code, value_length }` | Create validation failure |
| `repo.settings.webhooks.update_validation_error` | WARN | `{ repo_id, actor_id, webhook_id, field, error_code }` | Update validation failure |
| `repo.settings.webhooks.limit_reached` | WARN | `{ repo_id, actor_id, current_count: 20 }` | User attempted to exceed 20 webhook limit |
| `repo.settings.webhooks.db_error` | ERROR | `{ repo_id, owner, repo, operation, error_message }` | Database error during any webhook operation |
| `repo.settings.webhooks.load_error` | ERROR | `{ owner, repo, actor_id, error_message, status_code }` | Page load failure |
| `repo.settings.webhooks.secret_encryption_error` | ERROR | `{ repo_id, owner, repo, webhook_id }` | Secret encryption/decryption failure (never log secret material) |

**Critical logging rules:**
- Never log the webhook URL in full (may contain auth tokens in path or query parameters). Log only the domain portion as `url_domain`.
- Never log the webhook secret value.
- Never log delivery payload contents at info level or below.
- All log entries must include the `request_id` from middleware for correlation.

## Prometheus Metrics

**Counters:**
- `codeplane_repo_settings_webhooks_page_views_total` — page views of the webhook list page
- `codeplane_repo_settings_webhooks_detail_views_total` — detail page views
- `codeplane_repo_settings_webhooks_creates_total{status}` — creation attempts by status (success, validation_error, limit_reached, forbidden, internal)
- `codeplane_repo_settings_webhooks_updates_total{status}` — update attempts by status (success, validation_error, not_found, forbidden, internal)
- `codeplane_repo_settings_webhooks_deletes_total{status}` — deletion attempts by status (success, not_found, forbidden, internal)
- `codeplane_repo_settings_webhooks_test_deliveries_total{status}` — test delivery attempts by status (success, not_found, forbidden, internal)
- `codeplane_repo_settings_webhooks_permission_denied_total` — access denials
- `codeplane_repo_settings_webhooks_delivery_expansions_total` — delivery row expansions

**Histograms:**
- `codeplane_repo_settings_webhooks_page_load_duration_seconds` — list page load time (buckets: 0.1, 0.25, 0.5, 1.0, 2.0, 5.0s)
- `codeplane_repo_settings_webhooks_detail_load_duration_seconds` — detail page load time (buckets: 0.1, 0.25, 0.5, 1.0, 2.0, 5.0s)
- `codeplane_repo_settings_webhooks_create_duration_seconds` — create round-trip time (buckets: 0.05, 0.1, 0.25, 0.5, 1.0, 2.5s)
- `codeplane_repo_settings_webhooks_update_duration_seconds` — update round-trip time (buckets: 0.05, 0.1, 0.25, 0.5, 1.0, 2.5s)
- `codeplane_repo_settings_webhooks_delete_duration_seconds` — delete round-trip time (buckets: 0.05, 0.1, 0.25, 0.5, 1.0, 2.5s)
- `codeplane_repo_settings_webhooks_deliveries_load_duration_seconds` — delivery list load time (buckets: 0.1, 0.25, 0.5, 1.0, 2.0, 5.0s)

**Gauges:**
- `codeplane_repo_settings_webhooks_active_sessions` — currently open webhook settings pages

## Alerts

### Alert: `RepoSettingsWebhooksCreateErrorRateHigh`
- **Condition**: `rate(codeplane_repo_settings_webhooks_creates_total{status="internal"}[5m]) / rate(codeplane_repo_settings_webhooks_creates_total[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check `repo.settings.webhooks.db_error` logs (filter by `operation: "create"`) for the last 10 minutes.
  2. Check `repo.settings.webhooks.secret_encryption_error` logs — encryption failures are a common root cause.
  3. Verify `SecretCodec` configuration: is the encryption key available? Has it been rotated? Check environment variables and secrets manager connectivity.
  4. Verify database connectivity via health check query.
  5. Check for lock contention on the `webhooks` table via `pg_stat_activity`.
  6. Check disk space on database volume.
  7. If isolated to one repository, check data integrity on that repo's webhook rows.
  8. If database is healthy and encryption is working, check Hono middleware stack for unexpected failures.
  9. Escalate to database on-call if infrastructure-related.

### Alert: `RepoSettingsWebhooksPageLoadSlow`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_repo_settings_webhooks_page_load_duration_seconds_bucket[5m])) > 3.0`
- **Severity**: Warning
- **Runbook**:
  1. Check `GET /api/repos/:owner/:repo/hooks` endpoint latency.
  2. Examine slow query logs for `listRepoWebhooksByOwnerAndRepo`.
  3. Verify indexes on `webhooks.repository_id`.
  4. Check for unusually large repos with many webhooks approaching the 20 limit.
  5. Review network/CDN conditions.
  6. Profile client-side rendering for excessive re-renders (e.g., webhook list diffing).

### Alert: `RepoSettingsWebhooksDetailLoadSlow`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_repo_settings_webhooks_detail_load_duration_seconds_bucket[5m])) > 3.0`
- **Severity**: Warning
- **Runbook**:
  1. The detail page makes two parallel requests: webhook detail GET and deliveries list GET. Check latency for both.
  2. If delivery list is slow, check `EXPLAIN ANALYZE` on `listWebhookDeliveriesForRepo` query — verify index on `(webhook_id, id DESC)` exists.
  3. Check for webhooks with very large delivery counts causing slow OFFSET pagination.
  4. Check `SecretCodec` decryption latency (affects webhook detail load).
  5. Check database connection pool utilization.

### Alert: `RepoSettingsWebhooksDeleteErrorRateHigh`
- **Condition**: `rate(codeplane_repo_settings_webhooks_deletes_total{status="internal"}[5m]) > 0.1`
- **Severity**: Warning
- **Runbook**:
  1. Check `repo.settings.webhooks.db_error` logs (filter by `operation: "delete"`).
  2. Check for lock contention on the `webhooks` table — deletes may conflict with delivery worker writes.
  3. Verify foreign key cascades are configured correctly for `webhook_deliveries` → `webhooks`.
  4. Check for orphaned delivery records causing constraint violations.
  5. If transient, monitor for auto-recovery. If persistent, check recent schema migrations.

### Alert: `RepoSettingsWebhooksPermissionDeniedSpike`
- **Condition**: `rate(codeplane_repo_settings_webhooks_permission_denied_total[15m]) > 20`
- **Severity**: Info
- **Runbook**:
  1. Check `repo.settings.webhooks.permission_denied` logs to identify actor IDs.
  2. Determine if single user repeatedly hitting the URL (broken bookmark or automation).
  3. If many users affected, check if a UI change made the Settings tab or Webhooks sidebar visible to non-admin users.
  4. Verify route guard permission check is functioning.
  5. No immediate action unless combined with customer complaints.

## Error Cases and Failure Modes

| Error Case | User Experience | Recovery |
|---|---|---|
| List page load fails (network) | Inline error + Retry button | Click Retry or refresh |
| List page load fails (404) | Full-page 404 component | Repo may be deleted; navigate elsewhere |
| List page load fails (403) | Redirect to repo overview with toast | Request admin access |
| Detail page load fails (404 webhook) | 404 page with link to webhook list | Webhook may be deleted |
| Detail page load fails (500) | Error card with Retry | Retry; check observability |
| Create fails (422 URL validation) | Inline error on URL field; form preserved | Fix URL and retry |
| Create fails (422 limit) | Toast "Maximum of 20 webhooks reached" | Delete unused webhooks first |
| Create fails (403) | Toast "Permission denied" | Permissions revoked mid-session |
| Create fails (500) | Toast "Something went wrong"; form preserved | Retry |
| Update fails (422) | Inline errors on fields; form preserved | Fix and retry |
| Update fails (404) | Toast + redirect to list | Webhook deleted externally |
| Update fails (500) | Toast; form preserved | Retry |
| Delete fails (404) | Toast; redirect to list | Already deleted |
| Delete fails (500) | Toast; webhook stays in list | Retry |
| Test delivery fails (500) | Toast "Failed to send test delivery" | Check webhook URL accessibility |
| Delivery list load fails | Inline error in delivery section; config still visible | Retry |
| Secret encryption failure | Toast "Failed to save webhook"; form preserved | Operator must check SecretCodec config |
| Concurrent modification | Last-write-wins; stale data until refresh | Refresh page |

## Verification

## API Integration Tests (Webhook Settings UI Backing APIs)

1. **GET `/api/repos/:owner/:repo/hooks` returns all webhooks** — Create 3 webhooks. GET list. Assert all 3 returned with correct fields: `id`, `url`, `secret` (redacted), `events`, `is_active`, `last_delivery_at`, `created_at`, `updated_at`.
2. **GET `/api/repos/:owner/:repo/hooks` returns empty array for repo with no webhooks** — GET list on clean repo. Assert `[]` with 200.
3. **GET `/api/repos/:owner/:repo/hooks` never returns plaintext secrets** — Create webhook with `secret: "super-secret"`. GET list. Assert no response field contains `"super-secret"`.
4. **POST create webhook with all fields** — POST with valid HTTPS URL, secret, events `["push", "landing_request"]`, `is_active: true`. Assert 201 with all fields correctly set, `secret: "********"`.
5. **POST create webhook with minimal fields** — POST with only URL and `is_active: true`. Assert 201, events defaults.
6. **POST create webhook with wildcard event** — POST with `events: ["*"]`. Assert 201.
7. **POST create webhook with all 9 event types** — Assert 201 with all events stored.
8. **POST create webhook in inactive state** — `is_active: false`. Assert 201, `is_active` is false.
9. **POST create — reject empty URL** — Assert 422, field `url`, code `missing_field`.
10. **POST create — reject whitespace-only URL** — Assert 422, field `url`, code `missing_field`.
11. **POST create — reject HTTP URL** — Assert 422, field `url`, code `invalid`.
12. **POST create — reject non-URL string** — Assert 422.
13. **POST create — accept URL with trailing whitespace** — URL trimmed in response.
14. **POST create — URL at max length (2048 chars)** — Assert 201.
15. **POST create — URL exceeding max length (2049 chars)** — Assert 422.
16. **POST create — secret at max length (255 chars)** — Assert 201.
17. **POST create — secret exceeding max length (256 chars)** — Assert 422.
18. **POST create — 20 webhooks succeed, 21st rejected** — Create 20. Assert each 201. Attempt 21st. Assert 422 with `field: "repository_id"`.
19. **POST create — duplicate URLs allowed** — Create two webhooks with identical URLs. Both return 201 with distinct IDs.
20. **POST create — reject unauthenticated** — Assert 401.
21. **POST create — reject non-admin** — Assert 403.
22. **POST create — reject nonexistent repo** — Assert 404.
23. **GET webhook detail by ID** — Create webhook. GET by ID. Assert 200 with all fields.
24. **GET webhook detail — secret redacted** — Create with secret. GET. Assert `"********"`.
25. **GET webhook detail — invalid ID (string)** — Assert 400.
26. **GET webhook detail — invalid ID (zero)** — Assert 400.
27. **GET webhook detail — invalid ID (negative)** — Assert 400.
28. **GET webhook detail — nonexistent ID** — Assert 404.
29. **GET webhook detail — webhook from different repo** — Assert 404.
30. **PATCH update URL only** — Assert 200 with URL changed, other fields preserved.
31. **PATCH update secret** — Assert 200 with `"********"`.
32. **PATCH update events (replaces, not merges)** — Change `["push"]` to `["release"]`. Assert exactly `["release"]`.
33. **PATCH update is_active to false** — Assert 200.
34. **PATCH update is_active to true** — Assert 200.
35. **PATCH empty body is no-op** — Assert 200, `updated_at` refreshed, all other fields unchanged.
36. **PATCH reject empty URL** — Assert 422.
37. **PATCH reject HTTP URL** — Assert 422.
38. **PATCH URL at max length (2048)** — Assert 200.
39. **PATCH reject nonexistent webhook** — Assert 404.
40. **DELETE webhook — success** — Assert 204 empty body.
41. **DELETE webhook — verify removed from list** — GET list. Assert webhook absent.
42. **DELETE webhook — double delete** — First 204, second 404.
43. **DELETE webhook — invalid ID** — Assert 400.
44. **DELETE webhook — nonexistent ID** — Assert 404.
45. **DELETE webhook — cross-repo scoping** — Assert 404.
46. **DELETE webhook — does not affect other webhooks** — Delete one of two. Assert other remains.
47. **POST test delivery** — Assert 200/201. Check delivery list includes a ping delivery.
48. **POST test delivery — nonexistent webhook** — Assert 404.
49. **GET deliveries — empty for fresh webhook** — Assert `[]` with 200.
50. **GET deliveries — returns newest-first** — Trigger events. Assert descending ID order.
51. **GET deliveries — pagination with limit=1** — Assert single result.
52. **GET deliveries — limit clamped to 30** — `limit=100`. Assert at most 30.
53. **GET deliveries — cursor pagination** — Trigger >30 deliveries. Assert page 1 and page 2 have no overlap.
54. **GET deliveries — non-numeric cursor defaults to page 1** — `cursor=abc`. Assert 200.
55. **GET deliveries — returns all status types** — Assert `pending`, `success`, `failed` can all appear.

## Web UI Playwright E2E Tests

### Page Access and Permissions
56. Navigate to `/:owner/:repo/settings/webhooks` as admin → page renders with webhook list.
57. Navigate as non-admin → redirected to overview with toast.
58. Navigate unauthenticated (public repo) → login redirect.
59. Navigate unauthenticated (private repo) → 404 page.
60. Navigate for nonexistent repo → 404 page.
61. Settings sidebar shows "Webhooks" item.
62. Click "Webhooks" in sidebar → correct URL, item highlighted.

### Webhook List
63. List renders all configured webhooks.
64. Each row shows URL, event badges, status indicator, last delivery time.
65. Active webhook shows green status indicator.
66. Inactive webhook shows red/gray status indicator.
67. Auto-disabled webhook shows warning indicator.
68. Empty state renders correctly with "Add webhook" CTA.
69. Webhook count header shows correct total.
70. Clicking a webhook row navigates to detail page.

### Webhook Creation
71. "Add webhook" button navigates to `/:owner/:repo/settings/webhooks/new`.
72. Form renders all fields: URL, content type, secret, events, active.
73. Submit disabled with empty URL.
74. Submit disabled with HTTP URL — inline error.
75. Submit disabled with whitespace-only URL — inline error.
76. Select "Just the push event" → events sent as `["push"]`.
77. Select "Send me everything" → events sent as `["*"]`.
78. Select "Let me select individual events" → checkbox grid expands.
79. Individual events: check 3, submit → created with those 3 events.
80. Individual events: uncheck all → submit disabled with tooltip.
81. Secret field is masked (password type).
82. Active checkbox checked by default.
83. Happy path: fill all fields, submit → redirect to detail page, toast "Webhook created."
84. Created webhook appears in list on back navigation.
85. Form clears/resets on successful creation.
86. Validation error (422) → inline errors on fields, form preserved.
87. Limit reached toast when 20 webhooks exist.
88. "Add webhook" button disabled at limit with tooltip.
89. URL with 2048 characters → creation succeeds.
90. URL with 2049 characters → client validation prevents submission.
91. Secret with 255 characters → creation succeeds.
92. Secret with 256 characters → client validation prevents submission.
93. URL with query parameters → preserved exactly.

### Webhook Detail Page
94. Navigate to detail page → configuration summary renders correctly.
95. URL displayed in monospace.
96. Secret shows "Configured" mask when set.
97. Secret shows "Not configured" when empty.
98. Events displayed as badge pills.
99. Wildcard events render as "All events".
100. Timestamps shown as relative time with ISO tooltip.
101. "Never" shown for null `last_delivery_at`.
102. Breadcrumb navigation shows correct path.
103. Click breadcrumb "Webhooks" → navigates to list.

### Webhook Detail — Actions
104. "Edit" button navigates to edit form.
105. "Test delivery" button sends ping → toast "Ping delivery sent."
106. "Test delivery" → new delivery appears in list after refresh.
107. "Delete" button opens confirmation dialog.
108. Delete dialog shows webhook URL.
109. Delete cancel → dialog closes, no API call.
110. Delete confirm → webhook removed, redirect to list, toast "Webhook deleted."
111. Delete loading state on confirm button.

### Webhook Detail — Delivery History
112. Delivery list shows deliveries newest-first.
113. Success delivery shows green check icon.
114. Failed delivery shows red X icon.
115. Pending delivery shows yellow clock icon.
116. Each row shows event type, response status, attempt count, timestamp.
117. Expanding delivery shows JSON payload viewer.
118. Expanding delivery shows response body.
119. Empty delivery state shows informative message.
120. "Load more" button appears when >30 deliveries.
121. "Load more" loads additional page of deliveries.

### Webhook Edit Form
122. Edit form pre-populates URL from current webhook.
123. Edit form pre-populates events from current webhook.
124. Edit form pre-populates active state.
125. Secret field shows "Leave blank to keep current" placeholder.
126. "Clear secret" option available.
127. "Update webhook" disabled until a field changes.
128. Change URL only → update succeeds, only URL sent.
129. Change events only → update succeeds, events replaced.
130. Toggle active state → update succeeds.
131. Validation error → inline errors, form preserved.
132. Cancel navigates back to detail page.
133. After update, detail page reflects new values.
134. Not-found during edit (webhook deleted) → toast + redirect to list.

### Archived Repository
135. Archived repo shows yellow banner.
136. "Add webhook" button hidden/disabled.
137. Webhook list still visible.
138. Detail page viewable (config and delivery history).
139. Edit, Test, Delete buttons hidden/disabled.
140. After unarchive, full functionality restored.

### Loading and Error States
141. Skeleton loader shown while webhook list loads.
142. Skeleton loader shown while detail page loads.
143. Network error during list load → error card + Retry.
144. Retry reloads webhooks.
145. Network error during creation → toast, form preserved.
146. Server error during creation → toast, form preserved.
147. Network error during update → toast, form preserved.
148. 404 during detail load → 404 page with link to list.

### Responsive Design
149. List page renders correctly at 320px width.
150. List page renders correctly at 768px width.
151. List page renders correctly at 1440px width.
152. Sidebar collapses on mobile.
153. Creation form stacks vertically on mobile.
154. Event checkbox grid adapts to viewport width.

### Accessibility
155. All form fields have associated labels.
156. Tab navigates through all interactive elements in logical order.
157. Enter on submit triggers form submission.
158. Escape in delete dialog closes dialog.
159. Delete dialog traps focus.
160. Errors announced to screen readers (aria-live or role=alert).
161. Color contrast meets WCAG 2.1 AA.
162. Status indicators (active/inactive) have text labels, not just color.

### Keyboard Navigation
163. Tab through webhook list rows — Enter to navigate.
164. Tab through form fields — Enter on button submits.
165. Escape in edit form navigates back (if no dirty state) or prompts (if dirty).
166. Shift+Tab navigates backwards through all elements.

### Cross-Client Consistency Tests
167. Create webhook via UI → appears in CLI `webhook list`.
168. Create webhook via CLI → appears in UI webhook list.
169. Update webhook via UI → reflected in CLI `webhook view`.
170. Delete webhook via CLI → gone from UI webhook list.
171. Test delivery via UI → delivery appears in CLI `webhook view` deliveries.
