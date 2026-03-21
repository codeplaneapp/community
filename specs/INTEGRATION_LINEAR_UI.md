# INTEGRATION_LINEAR_UI

Specification for INTEGRATION_LINEAR_UI.

## High-Level User POV

When you open Codeplane and navigate to the **Integrations** page, you see a dashboard of available integrations — GitHub, Slack, Linear, Discord, PostgreSQL, Jira — presented as cards with icons, short descriptions, and action buttons. The Linear card describes bidirectional issue synchronization between a Linear team and a Codeplane repository, with a "Configure" button that takes you into the Linear-specific integration surface.

The Linear integration page (`/integrations/linear`) is the single place where you manage your entire Linear connection lifecycle. If you have never connected Linear, you see a clean empty state with a headline, a short explanation of what the integration does, and a prominent "Connect Linear" button. Clicking that button starts the OAuth flow — you are redirected to Linear's consent screen, authorize Codeplane, and are sent back to the same page where a guided setup form appears. The form already knows your Linear identity (name and email are displayed for confirmation), lets you choose which of your Linear teams to connect, and lets you pick which Codeplane repository to bind it to from a searchable dropdown. You click "Complete Setup" and the integration is created. A success toast confirms the connection, and your new integration appears as a card in the list.

If you already have one or more Linear integrations, the page shows them as a list of cards. Each card displays the Linear team name and short key, the connected Codeplane repository as a clickable link, a colored status indicator (green for active, gray for inactive), and the last sync timestamp rendered as relative time ("2 hours ago") with the exact UTC timestamp in a tooltip. Each card has a kebab menu offering actions: "Trigger Sync" to manually kick off synchronization, and "Remove" to permanently disconnect the integration.

Clicking "Remove" opens a confirmation dialog that names the specific team and repository being disconnected, explains that sync will stop and credentials will be deleted, and requires you to explicitly confirm. Cancelling dismisses the dialog with no effect. Confirming shows a loading state, then closes the dialog, removes the card from the list, and shows a success toast. If the integration was the last one, the page transitions back to the empty state with the "Connect Linear" CTA.

Clicking "Trigger Sync" fires an asynchronous sync request and shows a toast confirming the sync was started. The sync itself runs in the background — the page does not block or poll for completion.

If anything goes wrong at any point — an expired OAuth session, a network error, a permission problem — the UI shows clear, contextual error messages with recovery actions. Errors never leave you on a dead-end screen. Expired OAuth sessions offer a "Reconnect" action. Permission errors suggest choosing a different repository. Network errors offer a "Retry" button.

The entire flow is designed so that a user can go from zero to a working, syncing Linear integration in under sixty seconds, and can audit, manage, and remove all their integrations from one page without ever touching the CLI or API directly.

## Acceptance Criteria

- The Integrations overview page (`/integrations`) renders a card grid including a Linear card with icon, description text "Sync issues, update statuses, and link commits to Linear tickets automatically.", and a "Configure" action button.
- Clicking the Linear card's "Configure" button navigates to `/integrations/linear`.
- The `/integrations/linear` page is only accessible to authenticated users. Unauthenticated visitors are redirected to the login page.
- When the user has zero Linear integrations, the page displays an empty state with: an illustration or icon, a heading "No Linear integrations", descriptive text explaining the integration's value, and a "Connect Linear" primary action button.
- The "Connect Linear" button navigates the browser to `GET /api/integrations/linear/oauth/start` (server-side redirect to Linear's OAuth consent screen).
- If the user already has one or more integrations, the "Connect Linear" button label changes to "Connect another Linear team" and remains visible in the page header.
- An integration count badge is displayed in the header area (e.g., "3 integrations").
- After a successful OAuth callback, the user is redirected to `/integrations/linear?setup=<setupKey>`.
- When a `?setup=` query parameter is present, the page enters setup mode: it calls `GET /api/integrations/linear/oauth/setup/:setupKey` and renders the configuration form.
- The configuration form displays a Connected Identity Banner showing "Connected as {name} ({email})" with a green checkmark icon.
- If the setup resolution API returns an error (e.g., expired setup), the form area displays an error banner with the message and a "Reconnect Linear" button that re-triggers the OAuth start flow.
- The configuration form includes a Linear Team selector: auto-select if one team, radio group/dropdown if multiple, error message if zero.
- The configuration form includes a Codeplane Repository selector: searchable dropdown from `GET /api/integrations/linear/repositories`, each option showing `owner/name` with description and visibility icon, loading state while fetching, and empty state if no repos available.
- The "Complete Setup" button is disabled until both a team and a repository are selected.
- Clicking "Complete Setup" shows a loading spinner on the button, disables the button to prevent double-click, and sends `POST /api/integrations/linear`.
- On successful creation (201), a success toast "Linear integration created" appears, the `?setup=` parameter is removed from the URL, and the new integration appears in the list.
- On error during creation, an inline error banner appears above the form with the error message. The button returns to enabled state for retry.
- Error recovery paths are implemented: setup expired → "Reconnect Linear"; no admin access → suggest different repo; repo not found → suggest different repo; team mismatch → "Reconnect Linear"; network error → "Retry".
- When a `?error=` query parameter is present, the page displays an error banner with the decoded error message and a "Try Again" button.
- Each integration card displays: team name and key badge, repository link, status indicator (green/gray dot with label), and last sync relative time with tooltip.
- The integration list is sorted by creation date, newest first.
- While the integration list API request is in flight, 3 skeleton loading card placeholders are displayed.
- If the list API returns an error, an error banner is displayed with a "Retry" button.
- Each card has a kebab menu with "Trigger Sync" and "Remove" (destructive styling) actions.
- The Remove confirmation dialog contains: title, body naming team and repo, warning about consequences, Cancel and Remove (red) buttons.
- Pressing Escape or clicking Cancel dismisses the dialog with no side effects.
- After successful removal: dialog closes, success toast appears, card disappears, empty state shows if last.
- If Remove returns 404: dialog closes, warning toast appears, list refreshes.
- If Remove returns 500: dialog stays open, inline error, Remove button re-enables.
- All timestamps are in user's local timezone with ISO-8601 tooltips.
- Browser tab title: "Linear Integrations — Codeplane".
- All interactive elements are keyboard-accessible.
- Page is responsive from 320px to 2560px viewport width.
- No sensitive data (tokens, secrets) ever rendered in DOM, localStorage, or console.

### Definition of Done
- The `/integrations` overview page renders Linear as a card with a Configure action.
- The `/integrations/linear` page implements the full lifecycle: empty state → OAuth start → setup form → create → list → sync trigger → remove with confirmation.
- All error states have user-facing messages and recovery actions.
- Loading states (skeleton cards, button spinners, dropdown spinners) are implemented.
- The page is gated behind authentication.
- All integration and E2E tests pass.
- Documentation for the UI-driven flow is published.
- The feature flag `INTEGRATION_LINEAR_UI` gates the Linear-specific page.

## Design

## Web UI Design

### Page Structure: `/integrations`

The Integrations overview page lives in the global sidebar under "Integrations". It renders:

- **Page header**: Title "Integrations & Skills", subtitle "Extend your workspace with integrations and skills.", and an optional "+ Add Custom" button.
- **Tab bar**: Two tabs — "MCP Integrations" and "Agent Skills".
- **Search bar**: Text input to filter visible integration cards by name.
- **Card grid**: Responsive grid (3 columns desktop, 2 tablet, 1 mobile). Each card contains: icon, integration name (bold), short description, status badge ("Installed" if active integrations exist), and action button ("Configure" or "Connected").

The **Linear card** shows:
- Icon: Linear's logo mark on a purple/indigo background
- Name: "Linear"
- Description: "Sync issues, update statuses, and link commits to Linear tickets automatically."
- Action button: "Configure" → navigates to `/integrations/linear`

### Page Structure: `/integrations/linear`

Three visual modes based on state:

**Mode 1: Empty State** (no integrations, no `?setup=` param)
- Back link: "← Integrations" → `/integrations`
- Page title: "Linear Integrations"
- Centered empty state: Linear logo icon (large, muted), heading "No Linear integrations", body text, "Connect Linear" primary button with Linear icon.

**Mode 2: Setup Form** (`?setup=<key>` in URL)
- Back link: "← Integrations"
- Page title: "Connect Linear"
- **Connected Identity Banner**: Green-bordered card, checkmark icon, "Connected as {name} ({email})"
- **Step 1 — Linear Team**: Label "Linear Team". One team → read-only display with checkmark. Multiple → radio group "{name} ({key})". Zero → error "No teams available" with "Reconnect" link.
- **Step 2 — Codeplane Repository**: Label "Codeplane Repository". Searchable dropdown: placeholder "Search repositories...", options show `owner/name` (primary), description (secondary, truncated 80 chars), visibility icon. Loading: spinner + "Loading repositories...". Empty: "No repositories found". Max height 300px with scroll.
- **Action area**: "Complete Setup" primary button (disabled until both selected). "Cancel" text button → `/integrations/linear`.
- **Error banner area**: above form, shows error message + recovery action.

**Mode 3: Integration List** (has integrations, no `?setup=`)
- Back link: "← Integrations"
- Header: title "Linear Integrations", count badge "{n} integration(s)", "Connect another Linear team" button.
- Card list (vertical stack): each card is a horizontal row with:
  - Left: Linear icon + team name + key badge
  - Center: repo link `owner/repo` (clickable → `/:owner/:repo`) + status dot (green/gray) + label ("Active"/"Inactive")
  - Right: "Last synced: {relative time}" or "Never synced" + kebab menu button
- Kebab menu: "Trigger Sync" (normal), divider, "Remove" (red)
- Loading: 3 skeleton cards with pulsing animation
- Error: banner + "Retry" button

### Confirmation Dialog: Remove Integration

- Overlay: dark backdrop, click-outside dismisses
- Dialog (max-width 480px, centered): title "Remove Linear integration?", body with team/repo names and warning, footer with Cancel (secondary) and Remove (red, shows spinner). Error area between body and footer.
- Keyboard: Escape dismisses, Tab cycles, Enter activates. Focus trap.

### Toast Notifications

- Position: bottom-right, stacked. Auto-dismiss 5 seconds.
- Success (green): "Linear integration created", "Linear integration removed.", "Sync started"
- Warning (amber): "Integration was already removed."
- Error (red): network failures

### URL State Management

- `/integrations/linear` — list or empty
- `/integrations/linear?setup=<key>` — setup form
- `/integrations/linear?error=<message>` — error from OAuth
- After creation, `?setup=` removed via `history.replaceState`
- After recovery, `?error=` removed

### Accessibility

- Visible focus indicators on all interactive elements
- Status dots paired with text labels
- Dialog: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- Kebab menu: `aria-haspopup="menu"`, `aria-expanded`
- Form inputs with `<label>` elements
- Toasts: `role="status"`, `aria-live="polite"`
- Screen reader announcements for key actions

## API Shape

This feature consumes existing endpoints (no new endpoints):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/integrations/linear/oauth/start` | GET | Initiate OAuth redirect |
| `/api/integrations/linear/oauth/setup/:setupKey` | GET | Resolve setup data |
| `/api/integrations/linear/repositories` | GET | List eligible repositories |
| `/api/integrations/linear` | GET | List integrations |
| `/api/integrations/linear` | POST | Create integration |
| `/api/integrations/linear/:id` | DELETE | Remove integration |
| `/api/integrations/linear/:id/sync` | POST | Trigger sync |

## TUI UI

No dedicated TUI screen. Message: "Linear integration management is available in the web UI. Visit /integrations/linear to configure." Users needing headless management use CLI (`codeplane extension linear install/list/remove/sync`).

## Documentation

1. **Linear Integration Setup Guide** (`/docs/guides/linear-integration`): Update "Configure Linear in the UI" with step-by-step walkthrough, numbered screenshots (empty state, OAuth consent, setup form, completed list), annotated card screenshot, troubleshooting section.
2. **Integrations Overview** (`/docs/guides/integrations`): Document overview page, navigation to specific integrations, search/filter.
3. **FAQ: Linear Integration**: entries for connecting second team, same team to multiple repos, removal consequences, expired setup recovery, missing repository in dropdown.

## Permissions & Security

## Authorization Roles

| Role | View `/integrations` | View `/integrations/linear` | Initiate OAuth | Create integration | View own integrations | Remove own integration | Trigger sync |
|------|-----|-----|-----|-----|-----|-----|-----|
| Owner | Yes | Yes | Yes | Yes (requires repo admin) | Yes | Yes | Yes |
| Admin | Yes | Yes | Yes | Yes (requires repo admin) | Yes | Yes | Yes |
| Member | Yes | Yes | Yes | Yes (requires repo admin) | Yes | Yes | Yes |
| Read-Only | Yes | Yes | Yes | No (lacks repo admin) | Yes | Yes | Yes |
| Anonymous | No (redirect to login) | No (redirect to login) | No (401) | No (401) | No (401) | No (401) | No (401) |

Integration creation requires repo-admin access to the selected repository, enforced server-side. The repository dropdown should only show admin-accessible repos, but the server enforces as a hard gate.

All operations are strictly user-scoped. Organization admins cannot view or manage another user's integrations.

## Rate Limiting

| Surface | Rate Limit | UI Behavior on 429 |
|---------|-----------|-------------------|
| OAuth Start | 10/user/10min | Inline error: "Too many connection attempts. Please wait." |
| Setup Resolution | 30/user/min | Inline error with retry |
| Repository Options | 60/user/min | Inline error with retry in dropdown |
| List Integrations | 60/user/min | Error banner + "Retry" |
| Create Integration | 10/user/min | Inline error with retry |
| Delete Integration | Standard mutation limit | Inline error in dialog |
| Trigger Sync | 10/integration/hour | Toast: "Sync was recently triggered." |

## Data Privacy

- UI never displays, stores, or logs OAuth tokens, refresh tokens, webhook secrets, or `user_id`.
- Setup key in URL (`?setup=<key>`) is opaque, time-limited (10 min), removed via `history.replaceState` after use.
- No integration credentials in localStorage or sessionStorage.
- No integration IDs, team names, or repo names logged to browser console in production.
- `?error=` parameter URL-decoded safely to prevent XSS — rendered as text content, never raw HTML.

## Telemetry & Product Analytics

## Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `LinearIntegrationPageViewed` | User navigates to `/integrations/linear` | `user_id`, `has_integrations`, `integration_count`, `has_setup_param`, `has_error_param`, `timestamp` |
| `LinearOAuthStartClicked` | User clicks "Connect Linear" | `user_id`, `source` (`empty_state`/`header_button`), `existing_integration_count`, `timestamp` |
| `LinearSetupFormViewed` | Setup form renders | `user_id`, `team_count`, `timestamp` |
| `LinearSetupTeamSelected` | User selects a team | `user_id`, `team_count`, `was_auto_selected`, `timestamp` |
| `LinearSetupRepoSelected` | User selects a repo | `user_id`, `search_query_length`, `result_count`, `timestamp` |
| `LinearSetupCompleted` | Creation succeeds (201) | `user_id`, `integration_id`, `team_key`, `repo_owner`, `repo_name`, `setup_duration_seconds`, `timestamp` |
| `LinearSetupFailed` | Creation fails | `user_id`, `error_code`, `error_message`, `timestamp` |
| `LinearSetupAbandoned` | User cancels or navigates away | `user_id`, `step_reached`, `setup_duration_seconds`, `timestamp` |
| `LinearIntegrationSyncTriggered` | "Trigger Sync" clicked | `user_id`, `integration_id`, `timestamp` |
| `LinearIntegrationRemoveClicked` | "Remove" clicked (dialog opens) | `user_id`, `integration_id`, `timestamp` |
| `LinearIntegrationRemoveConfirmed` | User confirms removal | `user_id`, `integration_id`, `timestamp` |
| `LinearIntegrationRemoveCancelled` | User cancels removal dialog | `user_id`, `integration_id`, `timestamp` |
| `LinearIntegrationRemoveCompleted` | Removal succeeds (204) | `user_id`, `integration_id`, `integration_age_days`, `timestamp` |
| `LinearIntegrationErrorRecoveryClicked` | Recovery action clicked | `user_id`, `error_type`, `recovery_action`, `timestamp` |
| `IntegrationsOverviewViewed` | User views `/integrations` | `user_id`, `timestamp` |
| `IntegrationsOverviewLinearClicked` | Linear card clicked | `user_id`, `timestamp` |

## Funnel Metrics

1. `IntegrationsOverviewViewed` → `IntegrationsOverviewLinearClicked` (card click-through)
2. `LinearIntegrationPageViewed` → `LinearOAuthStartClicked` (CTA engagement)
3. `LinearOAuthStartClicked` → `LinearSetupFormViewed` (OAuth completion)
4. `LinearSetupFormViewed` → `LinearSetupCompleted` (setup completion)
5. `LinearSetupCompleted` → `LinearIntegrationSyncTriggered` (post-setup engagement)

## Success Indicators

- **OAuth-to-completion rate**: `LinearSetupCompleted / LinearOAuthStartClicked` within 15 min. Target: >70%.
- **Setup form completion rate**: `LinearSetupCompleted / LinearSetupFormViewed`. Target: >85%.
- **Setup abandonment rate**: `LinearSetupAbandoned / LinearSetupFormViewed`. Target: <15%.
- **Median setup duration**: from `LinearSetupCompleted`. Target: <60 seconds.
- **Error recovery rate**: `LinearIntegrationErrorRecoveryClicked / LinearSetupFailed`. Target: >50%.
- **7-day retention**: integrations still active 7 days after creation. Target: >90%.
- **Remove confirmation rate**: `RemoveConfirmed / RemoveClicked`. Target: 40-70%.

## Observability

## Logging Requirements

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Linear page loaded | `DEBUG` | `user_id`, `page_mode` (`empty`/`setup`/`list`/`error`), `integration_count` | Page mount |
| OAuth start navigated | `INFO` | `user_id`, `request_id` | Browser navigates to OAuth start |
| Setup resolution fetched | `INFO` | `user_id`, `setup_key_present`, `team_count`, `duration_ms` | Setup data loaded |
| Setup resolution failed | `WARN` | `user_id`, `http_status`, `error_message`, `duration_ms` | Setup API error |
| Repository options loaded | `DEBUG` | `user_id`, `repo_count`, `duration_ms` | Dropdown data loaded |
| Integration created | `INFO` | `user_id`, `integration_id`, `team_key`, `duration_ms` | POST returned 201 |
| Integration creation failed | `WARN` | `user_id`, `http_status`, `error_message`, `duration_ms` | POST returned error |
| Integration list loaded | `DEBUG` | `user_id`, `integration_count`, `duration_ms` | GET list 200 |
| Integration list failed | `ERROR` | `user_id`, `http_status`, `error_message`, `duration_ms` | GET list error |
| Integration deleted | `INFO` | `user_id`, `integration_id`, `duration_ms` | DELETE 204 |
| Integration delete failed | `WARN` | `user_id`, `integration_id`, `http_status`, `error_message` | DELETE error |
| Sync triggered | `INFO` | `user_id`, `integration_id` | POST sync 202 |
| Rate limit hit | `WARN` | `user_id`, `endpoint`, `retry_after` | 429 received |

**Log rules**: Never log setup keys or tokens. Always include `user_id`. Suppress DEBUG in production unless diagnostic flag enabled.

## Prometheus Metrics

Server-side (contributed to by UI API calls):

| Metric | Type | Labels |
|--------|------|--------|
| `codeplane_linear_integration_list_total` | Counter | `status` |
| `codeplane_linear_integration_list_duration_seconds` | Histogram | — |
| `codeplane_linear_integration_create_total` | Counter | `status` |
| `codeplane_linear_integration_create_duration_seconds` | Histogram | — |
| `codeplane_linear_integration_delete_total` | Counter | `status` |
| `codeplane_linear_oauth_start_total` | Counter | `status` |
| `codeplane_linear_setup_resolution_total` | Counter | `status` |
| `codeplane_linear_repo_options_total` | Counter | `status` |
| `codeplane_http_client_errors_total` | Counter | `endpoint`, `status_code` |

Client-side:

| Metric | Type | Description |
|--------|------|-------------|
| `codeplane_linear_ui_page_load_seconds` | Histogram | Navigation to first meaningful paint |
| `codeplane_linear_ui_setup_flow_seconds` | Histogram | Setup form render to creation success |

## Alerts

### Alert: `LinearUISetupCompletionRateLow`
- **Condition**: 24h rolling `LinearSetupCompleted / LinearSetupFormViewed < 0.50`
- **Severity**: Warning
- **Runbook**: 1) Check `LinearSetupFailed` for dominant `error_code`. 2) If `setup_expired`: check median OAuth→setup time vs 10-min TTL. 3) If `forbidden`: verify repo options only returns admin repos. 4) If `LinearSetupAbandoned` high: review UI friction (slow dropdown?). 5) Check JS error tracking on `/integrations/linear`. 6) Check browser-specific issues.

### Alert: `LinearUIListLoadErrorRateHigh`
- **Condition**: `rate(list_total{status="error"}[5m]) / rate(list_total[5m]) > 0.10`
- **Severity**: Warning
- **Runbook**: 1) Check server logs for list failures. 2) Verify DB connectivity. 3) Check table lock contention. 4) Check recent deploys. 5) Monitor for auto-recovery. 6) Escalate if persistent.

### Alert: `LinearUIOAuthStartErrorSpike`
- **Condition**: `rate(oauth_start_total{status="error"}[5m]) > 5`
- **Severity**: Critical
- **Runbook**: 1) No user can begin Linear integration. 2) Check LINEAR_CLIENT_ID/REDIRECT_URI env vars. 3) Check Linear OAuth app config. 4) Check Linear status page. 5) Check server logs. 6) Fix env var and restart if misconfigured.

### Alert: `LinearUIHighClientErrorRate`
- **Condition**: `rate(http_client_errors{endpoint=~".*linear.*"}[5m]) > 20`
- **Severity**: Warning
- **Runbook**: 1) Break down by status_code. 2) 400s → client bugs, check recent UI deploy. 3) 500s → server bugs, follow server runbooks. 4) Check if single user generating most errors.

## Error Cases and Failure Modes

| Failure Mode | User Experience | Recovery |
|-------------|-----------------|----------|
| Network offline | "Unable to connect" banner | Auto-retry on reconnect, "Retry" button |
| API unreachable | "Codeplane is temporarily unavailable" | "Retry" button |
| Session expired during setup | Redirect to login | Re-login; setup key may expire |
| Setup key expired | "Your setup session has expired" | "Reconnect Linear" button |
| OAuth denied by user | `?error=access_denied` banner | "Try Again" button |
| Linear outage | Error banner or timeout | Manual retry |
| Empty repo dropdown | "No repositories available" | Link to create repo |
| Concurrent removal | 404 → warning toast | List auto-refreshes |
| Rate limited | "Please wait..." toast | Auto-retry after Retry-After |
| JS error | Error boundary fallback | "Reload page" button |

## Verification

## API Integration Tests

1. **Setup resolution returns viewer and teams after OAuth**: Complete OAuth. GET setup resolution. Assert 200 with viewer and teams.
2. **Expired setup key returns 404**: Wait >10min or expire record. GET setup resolution. Assert 404.
3. **Invalid setup key returns 404**: GET with random key. Assert 404.
4. **Another user's setup key returns 404**: User A completes OAuth. User B calls resolution with A's key. Assert 404.
5. **Repository options returns admin-accessible non-archived repos**: GET repos. Assert correct filtering and alphabetical sort.
6. **Repository options with no repos returns empty array**: User with no repos. Assert 200 with `[]`.
7. **Create integration with valid inputs returns 201**: POST create. Assert 201 with correct fields and no sensitive data.
8. **Create with expired setup returns 404**: Let setup expire. POST. Assert 404.
9. **Create with consumed setup key returns 404**: Create integration, then POST again with same key. Assert 404.
10. **Create with wrong team returns 400**: POST with team not in OAuth result. Assert 400.
11. **Create without repo admin returns 403**: POST for non-admin repo. Assert 403.
12. **Create for non-existent repo returns 404**: POST with invalid repo_id. Assert 404.
13. **List returns created integration immediately**: Create. GET list. Assert present.
14. **Delete returns 204 and removes from list**: DELETE. Assert 204. GET list. Assert absent.
15. **Sync returns 202**: POST sync for valid integration. Assert 202.
16. **Sync for deleted integration returns 404**: Delete then sync. Assert 404.

## E2E Tests (Playwright)

17. **Overview page loads with Linear card**: Navigate `/integrations`. Assert Linear card visible with correct text and "Configure" button.
18. **Linear card navigates to `/integrations/linear`**: Click "Configure". Assert URL change.
19. **Empty state when no integrations**: Assert heading, description, "Connect Linear" button.
20. **"Connect Linear" initiates OAuth redirect**: Click button. Assert navigation to OAuth start endpoint.
21. **Setup form renders after OAuth callback**: Navigate with `?setup=`. Mock API. Assert identity banner, team selector, repo dropdown.
22. **Single team auto-selected**: Mock one team. Assert confirmed selection display.
23. **Multiple teams render as selectable options**: Mock 3 teams. Assert radio/dropdown with 3 options, none pre-selected.
24. **Repo dropdown populates and is searchable**: Mock 5 repos. Assert 5 options. Type query. Assert filtered.
25. **Repo dropdown loading state**: Mock 2s delay. Assert spinner visible.
26. **Repo dropdown empty state**: Mock empty response. Assert "No repositories available".
27. **"Complete Setup" disabled until both selected**: Assert disabled → select team → still disabled → select repo → enabled.
28. **Successful creation shows toast and updates list**: Submit. Mock 201. Assert toast, URL cleanup, card in list.
29. **Double-click prevention**: Mock 2s delay. Click twice. Assert single request, spinner, disabled button.
30. **Error for expired setup**: Mock 404 on resolution. Assert error banner + "Reconnect" button.
31. **Error for permission denied**: Mock 403 on create. Assert inline error. Assert button re-enables.
32. **Error for team mismatch**: Mock 400. Assert error + "Reconnect".
33. **Error parameter from OAuth callback**: Navigate `?error=access_denied`. Assert error banner + "Try Again".
34. **Error parameter XSS safety**: Navigate `?error=<script>alert(1)</script>`. Assert rendered as text, no execution.
35. **List shows correct card data**: Create 2 integrations. Assert 2 cards with correct fields.
36. **Active status indicator**: Assert green dot + "Active".
37. **Inactive status indicator**: Assert gray dot + "Inactive".
38. **"Never synced" for null last_sync_at**: Assert text.
39. **Relative time with tooltip**: Assert relative text + ISO tooltip on hover.
40. **Repo link navigation**: Click link. Assert navigation to `/:owner/:repo`.
41. **Skeleton loading cards**: Mock 2s delay on list. Assert 3 skeletons visible.
42. **Error state on list failure**: Mock 500. Assert error banner + "Retry".
43. **Retry re-fetches successfully**: Mock 500 then 200. Click Retry. Assert success.
44. **Kebab menu actions**: Click kebab. Assert "Trigger Sync" and "Remove" visible.
45. **Trigger Sync toast**: Click sync. Mock 202. Assert toast.
46. **Remove dialog with correct details**: Click Remove. Assert dialog with team/repo names.
47. **Cancel dismisses dialog**: Click Cancel. Assert closed, integration still present.
48. **Escape dismisses dialog**: Press Escape. Assert closed.
49. **Successful removal updates list**: Confirm. Mock 204. Assert toast, card removed.
50. **Last integration removal shows empty state**: Remove only integration. Assert empty state.
51. **Remove dialog loading state**: Mock 2s delay. Assert spinner, both buttons disabled.
52. **Remove 500 error handling**: Mock 500. Assert dialog stays open, error shown, button re-enables.
53. **Remove 404 concurrent deletion**: Mock 404. Assert dialog closes, warning toast, list refresh.
54. **Header button label with existing integrations**: Assert "Connect another Linear team".
55. **Integration count badge**: 3 integrations → assert "3 integrations" badge.
56. **Auth redirect when unauthenticated**: No session. Navigate. Assert redirect to login.
57. **Rate limiting handled**: Mock 429. Assert rate limit message.
58. **Back link navigation**: Click "← Integrations". Assert `/integrations`.
59. **Cancel in setup form**: Click Cancel. Assert URL cleanup, no form.
60. **Full lifecycle E2E**: Empty → OAuth → setup → create → list → sync → remove → empty.
61. **500 repos in dropdown**: Mock 500 repos. Open dropdown. Assert renders without crash, search works.
62. **100-char repo name**: Mock long name. Assert renders without overflow.
63. **255-char team name**: Mock long team name. Assert renders correctly.
64. **Unicode/emoji team name**: Mock `"Ünïcödé Team 🚀 & <Friends>"`. Assert correct render, no XSS.
65. **Keyboard navigation in setup form**: Tab through form. Assert correct focus order.
66. **Keyboard navigation in list**: Tab to kebab, Enter to open, arrow keys, Enter to activate.
67. **Focus trap in dialog**: Tab cycles within dialog only.
68. **320px responsive**: Assert readable, no overflow.
69. **2560px responsive**: Assert content constrained, readable.
