# INTEGRATION_GUIDE_NOTION_SYNC

Specification for INTEGRATION_GUIDE_NOTION_SYNC.

## High-Level User POV

When you open the Integrations page in Codeplane, alongside active integration cards like Linear and placeholder cards like MCP Servers, you see an informational guide card for **Notion Sync**. This card is not a configurable integration with an OAuth flow or server-side sync engine — it is a built-in guide surface that explains how to connect Codeplane content (wiki pages, issues, landing request summaries) with your team's Notion workspace using Notion's public API and Codeplane webhooks.

Clicking the Notion Sync guide card opens a dedicated guide page within the Integrations area. The guide walks you through the entire setup process in plain language: creating a Notion integration in the Notion developer portal, obtaining an API key, sharing the target Notion database with your integration, configuring a Codeplane repository webhook to fire events to a lightweight relay or automation tool (such as a custom script, Zapier, Make, or n8n), and mapping Codeplane event payloads to Notion database properties. The guide includes copyable code snippets, environment variable references, webhook event recommendations, and a Notion database template schema that matches Codeplane's issue and wiki structures.

The value of this guide surface is that users do not have to leave Codeplane or search external documentation to understand how Notion sync works. The guide is contextual — it lives right where users manage all their integrations — and it covers both the "what" (what Notion sync gives you) and the "how" (step-by-step configuration). Users who prefer CLI-driven workflows can also access a condensed version of the guide via `codeplane extension notion guide`, which prints the setup instructions and key references to the terminal.

The guide is a read-only informational surface. It does not store credentials, create database records, or establish any server-to-Notion connection. It is designed so that a user can go from zero knowledge of Notion integration to a working webhook-to-Notion pipeline by following the guide end to end, using Codeplane's existing webhook infrastructure as the event source.

## Acceptance Criteria

## Acceptance Criteria

### Integrations Overview Page (`/integrations`)

- The Integrations overview page renders a **Notion Sync** card in the card grid.
- The Notion Sync card displays: a Notion logo/icon, the name "Notion Sync", a short description "Sync issues, wiki pages, and landing request updates to a Notion database via webhooks.", and a "View Guide" action button.
- The Notion Sync card appears in the "informational guides" section — visually after active/configured integration types (e.g., Linear) and after discovery stubs (e.g., MCP Servers, Agent Skills), consistent with the placement rule defined in the MCP discovery stub spec.
- The Notion Sync card does **not** display an "Installed" or "Connected" status badge. It displays a "Guide" badge or no status badge.
- Clicking the "View Guide" button navigates to `/integrations/notion-sync`.

### Notion Sync Guide Page (`/integrations/notion-sync`)

- The `/integrations/notion-sync` page is accessible to authenticated users only. Unauthenticated visitors are redirected to the login page.
- The page displays a back link "← Integrations" that navigates to `/integrations`.
- The page title is "Notion Sync Guide".
- The browser tab title is "Notion Sync Guide — Codeplane".
- The page renders the guide content as structured, readable documentation sections.
- The guide includes these sections in order:
  1. **Overview** — what Notion Sync provides (issue sync, wiki sync, landing request status updates) and that it uses Codeplane webhooks as the event source.
  2. **Prerequisites** — what the user needs before starting (a Notion workspace, a Codeplane repository with webhook permissions, a relay service or automation platform).
  3. **Step 1: Create a Notion Integration** — instructions to visit the Notion developer portal, create an internal integration, and copy the API key.
  4. **Step 2: Set Up the Target Notion Database** — instructions to create a Notion database with the recommended schema, and share the database with the integration.
  5. **Step 3: Configure the Relay Service** — instructions to deploy or configure a relay that receives Codeplane webhook events and translates them into Notion API calls. Includes a copyable example script.
  6. **Step 4: Configure a Codeplane Webhook** — instructions to create a repository webhook in Codeplane pointing to the relay, with the recommended event types.
  7. **Step 5: Test the Integration** — how to verify end-to-end sync by creating a test issue.
  8. **Recommended Notion Database Schema** — a table showing the recommended database property names, types, and descriptions for issues, wiki pages, and landing requests.
  9. **Recommended Webhook Events** — a table of Codeplane webhook event types to subscribe to.
  10. **Troubleshooting** — common problems and resolutions.

### Guide Content Constraints

- All code snippets in the guide are displayed in monospace font with a "Copy" button.
- The copy button copies the snippet to the clipboard and shows a brief "Copied!" confirmation.
- Code snippets must use environment variable placeholders (e.g., `NOTION_API_KEY`, `CODEPLANE_WEBHOOK_SECRET`) — never hardcoded credentials.
- The example relay script must be a complete, runnable TypeScript/Bun script under 150 lines.
- The recommended Notion database schema table must include at least these properties for issues: Title (title), Status (select), Labels (multi-select), Assignee (rich text), Codeplane URL (URL), Change ID (rich text), Created At (date), Updated At (date).
- The recommended webhook events list must include at minimum: `issues` (open, close, reopen, edit), `issue_comment` (create), `wiki` (create, edit, delete), `landing_request` (open, close, merge).
- All external URLs (Notion developer portal, Notion API docs) must open in a new tab.
- The guide must not include any Codeplane-internal implementation details (no SQL, no service layer references, no internal route handlers).
- The guide content must be renderable from a static markdown/MDX source — it does not require server-side dynamic data.

### No Server-Side State

- The guide page does **not** make any POST, PUT, PATCH, or DELETE requests.
- The guide page does **not** create, read, update, or delete any database records.
- The guide page does **not** store any credentials, tokens, or configuration.
- The guide page does **not** establish any connection to Notion's API.
- The only HTTP request the page may make is an authenticated GET to load the guide content (if served via API) or it may render statically from a bundled MDX source.

### Feature Flag

- The Notion Sync guide card and page are gated behind the `INTEGRATION_GUIDE_NOTION_SYNC` feature flag.
- When the feature flag is disabled, the card does not appear on the overview page, and navigating directly to `/integrations/notion-sync` returns a 404 or redirects to `/integrations`.

### Boundary Constraints

- Guide page title: maximum 100 characters.
- Section headings: maximum 200 characters each.
- Code snippet content: maximum 10,000 characters per snippet.
- The total guide page content must render without horizontal scrolling on viewports ≥ 320px wide.
- All text content is static (no user-generated input), so XSS concerns are limited to external URL rendering — all URLs must be validated and rendered via `<a>` tags with `rel="noopener noreferrer"` and `target="_blank"`.
- The guide must render correctly when the Integrations overview page contains zero configured integrations, one or more Linear integrations, and/or a mix of stubs and guides.

### Definition of Done

- The `/integrations` overview page renders the Notion Sync guide card with correct icon, name, description, and "View Guide" action.
- The `/integrations/notion-sync` page renders the complete guide with all 10 sections.
- All code snippets have working copy-to-clipboard buttons.
- The page is gated behind authentication.
- The page is gated behind the `INTEGRATION_GUIDE_NOTION_SYNC` feature flag.
- The CLI `codeplane extension notion guide` command prints the guide content to stdout.
- The guide content exists as an MDX document in `docs/guides/notion-sync.mdx`.
- All integration and E2E tests pass.
- No server-side state is created or modified by the guide surface.

## Design

## Web UI Design

### Integration Overview Card

The Notion Sync card on `/integrations` follows the existing card grid pattern:

- **Icon**: Notion logo mark on a dark/charcoal background (matching Notion's brand)
- **Name**: "Notion Sync" (bold)
- **Description**: "Sync issues, wiki pages, and landing request updates to a Notion database via webhooks."
- **Badge**: "Guide" in a neutral/blue color, distinguishing it from "Installed" (green) or "Coming Soon" (gray) badges
- **Action button**: "View Guide" → navigates to `/integrations/notion-sync`
- **Placement**: After all active integration types and discovery stubs, alongside the GitHub Mirror guide card. Guide cards are grouped together at the bottom of the grid.

### Guide Page Layout (`/integrations/notion-sync`)

The page uses a documentation-style layout:

- **Back link**: "← Integrations" (top-left, navigates to `/integrations`)
- **Page header**: Notion icon + "Notion Sync Guide" heading + subtitle "Connect Codeplane events to a Notion database using webhooks and a lightweight relay."
- **Table of contents**: A sticky right sidebar (desktop) or collapsible top section (mobile) listing all guide sections as anchor links.
- **Content area**: Rendered markdown/MDX content with styled headings (h2 for sections, h3 for subsections), code blocks, tables, info callouts, and warning callouts.
- **Max content width**: 720px centered, with the TOC sidebar taking an additional 240px on desktop.

### Code Snippet Component

- Monospace font (`font-mono`), dark background (`bg-gray-900`), light text
- Language label in top-left corner (e.g., "bash", "typescript", "json")
- Copy button in top-right corner with clipboard icon
- On click: copy text content, button changes to checkmark + "Copied!" for 2 seconds
- Horizontal scrolling for lines exceeding the container width
- Syntax highlighting for TypeScript, JSON, and bash

### Notion Database Schema Table

Rendered as a responsive table with columns: Property Name, Property Type, Description, Mapped From.

| Property Name | Property Type | Description | Mapped From |
|---|---|---|---|
| Title | Title | Issue title or wiki page title | `issue.title` / `wiki.title` |
| Status | Select | Open, Closed, Merged | `issue.state` / `landing.state` |
| Labels | Multi-select | Issue labels | `issue.labels[].name` |
| Assignee | Rich text | Assigned user's display name | `issue.assignees[].username` |
| Codeplane URL | URL | Direct link to the issue/wiki/landing in Codeplane | Constructed from event payload |
| Change ID | Rich text | jj change ID (for landing requests) | `landing.change_id` |
| Repository | Rich text | `owner/repo` | `repository.full_name` |
| Created At | Date | When the item was created in Codeplane | `issue.created_at` |
| Updated At | Date | When the item was last modified | `issue.updated_at` |
| Event Type | Select | The webhook event that created/updated the row | Derived from webhook event name |

### Webhook Events Table

| Webhook Event | Trigger | Recommended Action |
|---|---|---|
| `issues` (opened) | New issue created | Create Notion page |
| `issues` (closed) | Issue closed | Update Status to "Closed" |
| `issues` (reopened) | Issue reopened | Update Status to "Open" |
| `issues` (edited) | Issue title/body changed | Update Title and body |
| `issue_comment` (created) | New comment on issue | Append comment block to Notion page |
| `wiki` (created) | New wiki page | Create Notion page |
| `wiki` (edited) | Wiki page updated | Update Notion page content |
| `wiki` (deleted) | Wiki page removed | Archive Notion page |
| `landing_request` (opened) | New landing request | Create Notion page |
| `landing_request` (closed) | Landing request closed | Update Status to "Closed" |
| `landing_request` (merged) | Landing request merged | Update Status to "Merged" |

### Responsive Behavior

- **≥1280px**: Content area + sticky TOC sidebar
- **768px–1279px**: Content area full-width, TOC as collapsible top accordion
- **320px–767px**: Single column, TOC as collapsible accordion, tables scroll horizontally, code blocks scroll horizontally

### Accessibility

- All section headings use proper heading hierarchy (h2/h3)
- TOC links use `aria-label` for screen readers
- Code blocks are wrapped in `<pre><code>` with `role="code"`
- Copy button has `aria-label="Copy code snippet"`
- External links announce they open in a new tab via `aria-label` suffix
- Focus indicators on all interactive elements (links, buttons, TOC items)

## API Shape

This feature is a read-only guide surface. Two approaches are supported:

**Option A — Static MDX rendering (preferred)**: The guide content is bundled as an MDX file (`docs/guides/notion-sync.mdx`) and rendered client-side by the SolidJS app's MDX pipeline. No new API endpoint is needed.

**Option B — API-served guide content**: If the guide content needs to be dynamically loaded:

| Endpoint | Method | Purpose |
|---|---|---|
| `GET /api/integrations/guides/notion-sync` | GET | Return the guide content as structured JSON |

**Response (200)**:
```json
{
  "id": "notion-sync",
  "title": "Notion Sync Guide",
  "description": "Connect Codeplane events to a Notion database using webhooks and a lightweight relay.",
  "sections": [
    {
      "id": "overview",
      "title": "Overview",
      "content": "<markdown content>"
    }
  ],
  "updated_at": "2026-03-22T00:00:00Z"
}
```

Authentication is required (session cookie or PAT). Returns 401 for unauthenticated users.

## CLI Command

### `codeplane extension notion guide`

Prints the Notion Sync setup guide to stdout in a terminal-friendly format.

```bash
codeplane extension notion guide
```

**Output**: The full guide content rendered as styled terminal text with:
- Section headers in bold
- Code blocks indented and syntax-highlighted (if terminal supports color)
- URLs printed as clickable terminal hyperlinks where supported
- Tables formatted with box-drawing characters

**Flags**:
- `--section <id>`: Print only a specific section (e.g., `--section prerequisites`, `--section schema`)
- `--json`: Output the guide content as JSON instead of formatted text
- `--no-color`: Disable color output

**Exit codes**:
- `0`: Success
- `1`: Authentication failure or feature not available

**Examples**:
```bash
# Print the full guide
codeplane extension notion guide

# Print only the prerequisites section
codeplane extension notion guide --section prerequisites

# Print the recommended schema as JSON
codeplane extension notion guide --section schema --json
```

## TUI UI

No dedicated TUI screen for the Notion Sync guide. When a user navigates to integrations in the TUI, the Notion Sync guide is listed as an item with a note: "Open the Notion Sync guide in the web UI at /integrations/notion-sync, or run `codeplane extension notion guide` in the terminal."

## Documentation

### `docs/guides/notion-sync.mdx`

The primary guide document, which serves as both the web UI content source and the published documentation page. Must include:

1. **Frontmatter**: title, description, and metadata
2. **Overview section**: Value proposition and architecture diagram (text-based) showing Codeplane → Webhook → Relay → Notion API
3. **Prerequisites section**: Checklist format
4. **Steps 1–5**: Numbered, detailed instructions with screenshots/diagrams where helpful
5. **Schema reference table**: The recommended Notion database properties
6. **Webhook events reference table**: Event types and recommended Notion actions
7. **Example relay script**: Complete, runnable TypeScript/Bun script
8. **Troubleshooting section**: At least 5 common failure scenarios with resolutions

### Integrations Overview Documentation Update

Update `docs/guides/ui.mdx` to include a paragraph about Notion Sync:
> Notion Sync is available as a guide-based integration. Open **Notion Sync** in the Integrations view to access step-by-step instructions for connecting Codeplane webhooks to a Notion database. See the [Notion Sync guide](/guides/notion-sync) for the full setup flow.

### CLI Reference Update

Add `codeplane extension notion guide` to the CLI command reference documentation with usage examples and flag descriptions.

## Permissions & Security

## Authorization Roles

| Role | View `/integrations` with Notion card | View `/integrations/notion-sync` guide | Use CLI `extension notion guide` |
|---|---|---|---|
| Owner | Yes | Yes | Yes |
| Admin | Yes | Yes | Yes |
| Member | Yes | Yes | Yes |
| Read-Only | Yes | Yes | Yes |
| Anonymous / Unauthenticated | No (redirect to login) | No (redirect to login) | No (exit code 1, auth error) |

The Notion Sync guide is a read-only informational surface. Any authenticated user can view it regardless of their role, because it does not expose repository-specific data or modify any state. No repository-level permissions are required.

All operations are user-scoped. The guide content is identical for all users.

## Rate Limiting

| Surface | Rate Limit | Behavior on 429 |
|---|---|---|
| Guide page load (web) | 60/user/min (standard page load rate) | Error banner: "Too many requests. Please wait." |
| Guide API endpoint (if Option B) | 60/user/min | JSON error: `{ "error": "rate limit exceeded" }` |
| CLI `extension notion guide` | 30/user/min | stderr: "Rate limit exceeded. Try again shortly." |

These are generous limits appropriate for a read-only surface. The guide performs no writes and minimal I/O.

## Data Privacy

- The guide surface does **not** collect, store, or transmit any user data beyond the authentication check.
- No PII is displayed on the guide page beyond the user's own session (standard nav/header elements).
- The guide page does **not** contain tracking pixels, third-party scripts, or external asset loads (all content is self-hosted).
- Code snippet placeholders use environment variable names (`NOTION_API_KEY`) — never real or example credentials.
- The guide does not reveal any server-internal configuration, feature flag state, or other users' integration status.
- No localStorage or sessionStorage writes are made by the guide page (the copy-to-clipboard function uses the Clipboard API only).

## Telemetry & Product Analytics

## Business Events

| Event Name | When Fired | Properties |
|---|---|---|
| `IntegrationGuideCardViewed` | Notion Sync card is rendered on the `/integrations` page | `user_id`, `guide_id` (`notion-sync`), `timestamp`, `total_guide_cards_visible`, `total_active_integrations` |
| `IntegrationGuideCardClicked` | User clicks "View Guide" on the Notion Sync card | `user_id`, `guide_id` (`notion-sync`), `timestamp` |
| `IntegrationGuidePageViewed` | User navigates to `/integrations/notion-sync` | `user_id`, `guide_id` (`notion-sync`), `referrer` (`integrations_page`, `direct`, `cli`, `docs`), `timestamp` |
| `IntegrationGuideSectionViewed` | User scrolls a guide section into view (Intersection Observer) | `user_id`, `guide_id` (`notion-sync`), `section_id` (e.g., `overview`, `step-1`, `schema`), `timestamp` |
| `IntegrationGuideCodeCopied` | User clicks a "Copy" button on a code snippet | `user_id`, `guide_id` (`notion-sync`), `snippet_id` (e.g., `relay-script`, `webhook-config`, `env-vars`), `timestamp` |
| `IntegrationGuideExternalLinkClicked` | User clicks an external link (e.g., Notion developer portal) | `user_id`, `guide_id` (`notion-sync`), `link_url` (domain only, no path for privacy), `link_label`, `timestamp` |
| `IntegrationGuideBackClicked` | User clicks "← Integrations" back link | `user_id`, `guide_id` (`notion-sync`), `time_on_page_seconds`, `sections_viewed_count`, `timestamp` |
| `IntegrationGuideCLIViewed` | User runs `codeplane extension notion guide` | `user_id`, `guide_id` (`notion-sync`), `section_filter` (if `--section` used, else `null`), `output_format` (`text`, `json`), `timestamp` |

## Funnel Metrics

1. `IntegrationsOverviewViewed` → `IntegrationGuideCardViewed` (card impression rate)
2. `IntegrationGuideCardViewed` → `IntegrationGuideCardClicked` (card click-through rate)
3. `IntegrationGuidePageViewed` → `IntegrationGuideCodeCopied` (engagement rate — did they copy code?)
4. `IntegrationGuidePageViewed` → `IntegrationGuideSectionViewed{section=step-4}` (how many users reach the webhook config step?)
5. `IntegrationGuidePageViewed` → `IntegrationGuideSectionViewed{section=troubleshooting}` (how many users need troubleshooting help?)

## Success Indicators

- **Card click-through rate**: `IntegrationGuideCardClicked / IntegrationGuideCardViewed`. Target: >15% (users who see the card choose to read the guide).
- **Guide completion rate**: Users who view both the `overview` and `step-5` (test) sections / total `IntegrationGuidePageViewed`. Target: >30%.
- **Code copy engagement**: `IntegrationGuideCodeCopied / IntegrationGuidePageViewed`. Target: >20% (users are actively using the guide, not just browsing).
- **Median time on page**: Derived from `time_on_page_seconds` in `IntegrationGuideBackClicked`. Target: >90 seconds (indicating real reading) and <600 seconds (not stuck).
- **Webhook creation correlation**: After viewing the guide, if the same user creates a repository webhook within 24 hours. This is a derived metric combining guide view events with `REPO_WEBHOOK_CREATE` events. Target: >10% of guide viewers.
- **CLI guide usage**: Weekly unique `user_id` count in `IntegrationGuideCLIViewed`. Track growth as a signal of CLI-first user engagement with guides.

## Observability

## Logging Requirements

| Log Event | Level | Structured Fields | When |
|---|---|---|---|
| Notion guide page loaded | `DEBUG` | `user_id`, `request_id`, `guide_id` (`notion-sync`) | Page mount (web) or CLI invocation |
| Notion guide content served | `DEBUG` | `user_id`, `request_id`, `guide_id`, `content_length_bytes`, `duration_ms` | API response sent (if Option B) |
| Notion guide unauthenticated access | `WARN` | `request_id`, `remote_addr` | 401 returned |
| Notion guide feature gated | `INFO` | `user_id`, `request_id`, `flag_name` (`INTEGRATION_GUIDE_NOTION_SYNC`) | 404/403 returned because feature flag is disabled |
| Notion guide rate limited | `WARN` | `user_id`, `request_id`, `retry_after` | 429 returned |
| Notion guide unexpected error | `ERROR` | `user_id`, `request_id`, `error_message`, `error_type`, `stack_trace` | 500 returned (should not happen for static content) |
| CLI notion guide printed | `DEBUG` | `user_id`, `section_filter`, `output_format`, `duration_ms` | CLI command completes |
| CLI notion guide auth failure | `WARN` | `error_message` | CLI auth check fails |

**Log rules**:
- Always include `request_id` for correlation.
- Log at `DEBUG` for the success path (read-only static content — INFO would be noise).
- Never log authentication credentials.
- Never log full response bodies.
- Suppress `DEBUG` in production unless diagnostic mode is enabled.

## Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_integration_guide_views_total` | Counter | `guide_id`, `status` (`success`, `unauthorized`, `feature_gated`, `rate_limited`, `error`), `client` (`web`, `cli`) | Total guide page views by outcome |
| `codeplane_integration_guide_view_duration_seconds` | Histogram | `guide_id`, `client` | End-to-end request duration for guide content |
| `codeplane_integration_guide_code_copies_total` | Counter | `guide_id`, `snippet_id` | Total code snippet copies (client-side, reported via analytics) |
| `codeplane_integration_guide_section_views_total` | Counter | `guide_id`, `section_id` | Total section scroll-into-view events (client-side, reported via analytics) |

## Alerts

### Alert: `IntegrationGuideUnexpectedErrors`
- **Condition**: `increase(codeplane_integration_guide_views_total{guide_id="notion-sync", status="error"}[1h]) > 0`
- **Severity**: Warning
- **Runbook**:
  1. The Notion Sync guide is a read-only static content surface. It performs no I/O beyond auth context loading. Any 500 error indicates a framework-level or rendering regression.
  2. Check server logs for `Notion guide unexpected error` entries. Inspect `error_type` and `stack_trace`.
  3. Check recent deployments for changes to the integrations routes, guide rendering pipeline, MDX processing, or auth middleware.
  4. Verify the guide route is still mounted by running `curl -H "Authorization: Bearer <valid-pat>" https://<host>/integrations/notion-sync`.
  5. If the error is in auth middleware, investigate the auth context loader (shared with all routes).
  6. If caused by MDX rendering failure, check the guide source file for syntax errors.
  7. If the issue is isolated to a single user or browser, check for client-side JS errors in error tracking.

### Alert: `IntegrationGuideHighUnauthenticatedRate`
- **Condition**: `rate(codeplane_integration_guide_views_total{guide_id="notion-sync", status="unauthorized"}[5m]) > 20`
- **Severity**: Info
- **Runbook**:
  1. A high rate of unauthenticated requests to the guide page may indicate automated scanning, a misconfigured crawler, or a broken link shared publicly.
  2. Check server logs for `Notion guide unauthenticated access` entries filtered by `remote_addr`.
  3. If all requests come from the same IP, consider IP-level rate limiting at the load balancer.
  4. If requests come from a known search engine crawler, verify robots.txt is correctly configured.
  5. No immediate action required — this is informational.

### Alert: `IntegrationGuideFeatureFlagMisconfiguration`
- **Condition**: `increase(codeplane_integration_guide_views_total{guide_id="notion-sync", status="feature_gated"}[1h]) > 10` when the flag is expected to be enabled
- **Severity**: Warning
- **Runbook**:
  1. Users are reaching the guide URL but being blocked by the feature flag. This could mean the flag was accidentally disabled or the flag loading is broken.
  2. Check the feature flag configuration: verify `INTEGRATION_GUIDE_NOTION_SYNC` is enabled.
  3. Check the feature flag loading service logs for errors.
  4. If the flag is enabled but requests are still gated, check for a caching issue in the flag loading layer.
  5. Re-enable the flag if it was accidentally toggled off.

## Error Cases & Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Internal Log Level | Likelihood |
|---|---|---|---|---|
| User not authenticated | 401 | Redirect to login | WARN | Normal |
| Feature flag disabled | 404 | Page not found / redirect to /integrations | INFO | Rare in CE (flag on by default) |
| Rate limit exceeded | 429 | "Too many requests. Please wait." | WARN | Very rare for read-only content |
| MDX rendering error | 500 | Error boundary: "Unable to load guide. Please try again." | ERROR | Extremely rare |
| Guide source file missing | 500 | Error boundary fallback | ERROR | Deployment error |
| Network offline (client-side) | N/A | Browser shows offline indicator | N/A | User environment issue |
| JS error in copy-to-clipboard | N/A | Copy button shows "Failed" briefly, no crash | WARN (client) | Rare (clipboard API unavailable) |
| Clipboard API denied by browser | N/A | Tooltip: "Copy not available. Select and copy manually." | DEBUG (client) | Depends on browser/permissions |

## Verification

## API Integration Tests

### Guide Content Serving (if Option B — API endpoint)

1. **Authenticated user receives 200 with guide content**: Send `GET /api/integrations/guides/notion-sync` with a valid session cookie. Assert status `200`. Assert response body contains `id: "notion-sync"`, `title`, `description`, and a non-empty `sections` array.

2. **Authenticated user with PAT receives 200**: Send `GET /api/integrations/guides/notion-sync` with a valid PAT. Assert status `200`. Assert identical response shape to cookie auth.

3. **Response Content-Type is application/json**: Assert the `Content-Type` header starts with `application/json`.

4. **Response includes X-Request-Id header**: Assert the `X-Request-Id` header is present and is a non-empty string.

5. **Unauthenticated request receives 401**: Send `GET /api/integrations/guides/notion-sync` without any session or PAT. Assert status `401`. Assert body contains `{ "error": "authentication required" }`.

6. **Expired PAT receives 401**: Send the request with an expired PAT. Assert status `401`.

7. **Feature flag disabled returns 404 or 403**: Disable `INTEGRATION_GUIDE_NOTION_SYNC`. Send authenticated request. Assert status is `404` or `403`.

8. **Feature flag re-enabled restores 200**: Re-enable the flag. Assert status `200` with valid content.

9. **Idempotent — repeated calls return identical results**: Send 5 identical authenticated requests. Assert all 5 return `200` with identical response bodies.

10. **No side effects — endpoint is read-only**: Record database row counts before and after 3 calls. Assert no rows were created, modified, or deleted in any table.

11. **POST method not allowed**: Send `POST /api/integrations/guides/notion-sync`. Assert status `404` or `405`.

12. **Unknown query parameters are ignored**: Send `GET /api/integrations/guides/notion-sync?foo=bar`. Assert status `200` with valid content.

13. **Guide response includes all required sections**: Parse the response `sections` array. Assert it contains entries with IDs: `overview`, `prerequisites`, `step-1`, `step-2`, `step-3`, `step-4`, `step-5`, `schema`, `webhook-events`, `troubleshooting`. Assert each section has non-empty `title` and `content` fields.

14. **Guide content does not contain hardcoded credentials**: Scan the full response body text. Assert it does not contain strings matching patterns: `ntn_`, `secret_`, `Bearer <actual-token>`, `ghp_`, `codeplane_pat_`. Assert all credential references use placeholder patterns like `NOTION_API_KEY` or `YOUR_...`.

15. **Guide content maximum size**: Assert the total response body size is under 100KB (reasonable for a static guide).

16. **Different users get identical guide content**: Authenticate as User A and User B. Assert both responses have identical `sections` content.

17. **Rate limiting enforced**: Send 61 requests within 1 minute as the same user. Assert requests beyond the limit return `429` with `Retry-After` header.

18. **Rate limiting does not cross users**: Send 60 requests as User A. Send 1 request as User B. Assert User B receives `200`.

19. **CORS preflight succeeds**: Send `OPTIONS /api/integrations/guides/notion-sync` with standard CORS headers. Assert appropriate `Access-Control-Allow-*` headers.

## E2E Tests (Playwright)

### Integrations Overview Page

20. **Notion Sync card is visible on integrations page**: Navigate to `/integrations`. Assert a card with text "Notion Sync" is visible. Assert the description text "Sync issues, wiki pages, and landing request updates to a Notion database via webhooks." is visible. Assert a "View Guide" button is visible.

21. **Notion Sync card has correct visual treatment**: Assert the Notion Sync card displays a "Guide" badge (not "Installed" or "Connected"). Assert the card has a Notion-branded icon.

22. **Notion Sync card placement is correct**: Assert the Notion Sync card appears after any active integration cards (e.g., Linear if configured) and after discovery stubs (MCP, Skills). Assert it appears in the same group as the GitHub Mirror guide card (if present).

23. **Clicking "View Guide" navigates to guide page**: Click "View Guide" on the Notion Sync card. Assert URL changes to `/integrations/notion-sync`.

### Guide Page Content

24. **Guide page loads with correct title**: Navigate to `/integrations/notion-sync`. Assert page heading is "Notion Sync Guide". Assert browser tab title contains "Notion Sync Guide — Codeplane".

25. **Back link navigates to integrations**: Click "← Integrations". Assert URL changes to `/integrations`.

26. **All guide sections are rendered**: Assert all 10 sections are visible: Overview, Prerequisites, Step 1 through Step 5, Recommended Notion Database Schema, Recommended Webhook Events, Troubleshooting.

27. **Table of contents is rendered**: Assert the TOC contains anchor links for all 10 sections. Click each TOC link and assert the corresponding section scrolls into view.

28. **Code snippets have copy buttons**: Find all code blocks on the page. Assert each has a "Copy" button.

29. **Copy button copies to clipboard**: Click a copy button on a code snippet. Assert the button text/icon changes to a checkmark or "Copied!" indication. Assert the clipboard contains the code snippet text (use Playwright's `page.evaluate` with Clipboard API).

30. **Copy button reverts after delay**: Click a copy button. Wait 3 seconds. Assert the button has reverted to its original state.

31. **Notion database schema table is rendered**: Assert a table with headers "Property Name", "Property Type", "Description" (or similar) is visible. Assert the table contains at least 8 rows (the minimum defined properties).

32. **Webhook events table is rendered**: Assert a table with webhook event information is visible. Assert it lists at least 11 event entries (issues × 4 states + issue_comment + wiki × 3 + landing_request × 3).

33. **Example relay script is complete and renderable**: Locate the relay script code block. Assert it contains recognizable TypeScript (e.g., `import`, `async`, `Bun.serve` or `fetch`). Assert the code block has a "typescript" or "ts" language label. Assert the code block content is at least 20 lines and at most 150 lines.

34. **External links open in new tab**: Find all `<a>` tags with `target="_blank"`. Assert they also have `rel` containing `noopener`. Click an external link (e.g., Notion developer portal). Assert a new tab/window is opened (or `window.open` is called).

35. **No hardcoded credentials in rendered content**: Scan all visible text content on the page. Assert no strings matching real API key patterns (e.g., `ntn_*`, `secret_*`, `ghp_*`). Assert placeholder patterns like `NOTION_API_KEY` and `YOUR_WEBHOOK_SECRET` are present.

### Feature Gating

36. **Guide page requires authentication**: Clear session. Navigate to `/integrations/notion-sync`. Assert redirect to login page.

37. **Guide card hidden when feature flag disabled**: Disable `INTEGRATION_GUIDE_NOTION_SYNC`. Navigate to `/integrations`. Assert no Notion Sync card is visible.

38. **Guide page 404 when feature flag disabled**: Disable the flag. Navigate directly to `/integrations/notion-sync`. Assert 404 page or redirect to `/integrations`.

### Responsive & Accessibility

39. **320px viewport — no horizontal overflow**: Set viewport to 320px width. Navigate to `/integrations/notion-sync`. Assert no horizontal scrollbar on the main content area (tables and code blocks may scroll internally).

40. **2560px viewport — content is constrained**: Set viewport to 2560px width. Assert content area does not stretch to full width. Assert max-width constraint is applied.

41. **Keyboard navigation through TOC**: Tab into the TOC. Assert each TOC item is focusable. Press Enter on a TOC item. Assert the page scrolls to the corresponding section.

42. **Keyboard navigation for copy buttons**: Tab to a copy button. Press Enter. Assert the copy action fires and the confirmation state appears.

43. **Screen reader announces section headings**: Assert all section headings use semantic `<h2>` or `<h3>` tags. Assert code blocks are wrapped in `<pre><code>`.

### Edge Cases

44. **Guide page with zero other integrations**: Ensure the user has no Linear integrations. Navigate to `/integrations`. Assert the Notion Sync guide card still renders correctly alongside an empty integrations state.

45. **Guide page with many integrations**: Create 10 Linear integrations. Navigate to `/integrations`. Assert the Notion Sync guide card still renders in the correct position.

46. **Direct URL navigation with hash anchor**: Navigate to `/integrations/notion-sync#step-3`. Assert the page loads and scrolls to the Step 3 section.

47. **Direct URL navigation with unknown hash**: Navigate to `/integrations/notion-sync#nonexistent`. Assert the page loads normally at the top (no error).

48. **Browser back/forward navigation**: Navigate integrations → guide → back → forward. Assert correct page content at each navigation state.

49. **Concurrent page loads**: Open `/integrations/notion-sync` in 3 tabs simultaneously. Assert all 3 render correctly without errors.

50. **Guide content loads in under 3 seconds**: Measure navigation to first meaningful paint. Assert < 3000ms.

## CLI Tests

51. **`codeplane extension notion guide` prints full guide**: Run the command with valid auth. Assert exit code `0`. Assert stdout contains the text "Notion Sync Guide". Assert stdout contains section headers for all 10 sections. Assert stdout contains the relay script example.

52. **`codeplane extension notion guide --section prerequisites` prints only prerequisites**: Run with `--section prerequisites`. Assert exit code `0`. Assert stdout contains "Prerequisites" header. Assert stdout does NOT contain "Troubleshooting" header.

53. **`codeplane extension notion guide --section schema` prints the schema table**: Run with `--section schema`. Assert exit code `0`. Assert stdout contains table-formatted content with property names.

54. **`codeplane extension notion guide --json` outputs valid JSON**: Run with `--json`. Assert exit code `0`. Parse stdout as JSON. Assert valid JSON with `id`, `title`, and `sections` fields.

55. **`codeplane extension notion guide --section schema --json` outputs section as JSON**: Run with both flags. Assert valid JSON output containing only the schema section.

56. **`codeplane extension notion guide` without auth fails**: Run without a valid token. Assert exit code `1`. Assert stderr contains an authentication error message.

57. **`codeplane extension notion guide --section invalid` handles unknown section**: Run with `--section nonexistent`. Assert exit code `1`. Assert stderr contains an error message listing available section IDs.

58. **`codeplane extension notion guide --no-color` outputs plain text**: Run with `--no-color`. Assert exit code `0`. Assert stdout does not contain ANSI escape codes.

59. **CLI guide content matches web guide content**: Run `codeplane extension notion guide --json`. Compare section IDs and titles with the web API response (or known fixture). Assert they match.

60. **CLI guide output does not contain hardcoded credentials**: Run the command. Scan stdout for real API key patterns. Assert none found. Assert placeholder patterns are present.
