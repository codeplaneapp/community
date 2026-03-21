# TOOL_SKILLS_GATED_UI

Specification for TOOL_SKILLS_GATED_UI.

## High-Level User POV

When a Codeplane user navigates to the repository settings area or the global integrations page, they find a "Tool Skills" section that represents the future home for managing reusable skill packages — structured instructions and capabilities that extend what AI agents, workflows, and workspace environments can do within Codeplane.

A tool skill is a packaged bundle of context, instructions, and domain knowledge that teaches an agent how to interact with a specific system, follow a particular coding convention, or execute a domain-specific task. For example, a skill might teach an agent how to work with a team's database migration patterns, how to author landing request descriptions in a particular format, or how to operate a third-party deployment tool. Skills are the building blocks that let organizations scale AI-assisted development beyond one-off prompts and into repeatable, shareable, auditable capabilities.

Today, the Tool Skills surface exists as a feature-flagged gated UI — an intentional placeholder that signals to users "this is where skill management will live." When a user visits the Tool Skills area, they see a well-designed empty state that explains the concept, communicates that the feature is coming, and avoids any impression that something is broken. There are no configuration forms, no skill upload flows, and no management controls yet. The empty state is honest, informative, and visually consistent with the rest of Codeplane's design language.

The value of shipping this gated UI now is strategic. It establishes the product surface in the navigation model so users become aware of the capability category before it is feature-complete. It reserves the feature flag boundary (`tool_skills`) so the team can gradually roll out skill management to beta users or specific plan tiers. It ensures that all clients — web UI, CLI, TUI, and editors — have a consistent expectation about where skills will appear. And it connects to the already-shipped `GET /api/integrations/skills` stub endpoint, which returns an empty list, so the UI is backed by a real API contract from day one.

For users who discover the surface through browsing, the experience is seamless: they see a "Tool Skills" entry in the appropriate navigation, they click through, they understand what skills will be, and they move on. For users who arrive from documentation or roadmap references, the surface confirms that the feature is structurally present and gated — not missing or abandoned.

## Acceptance Criteria

### Definition of Done

- A "Tool Skills" page is accessible at `/integrations/skills` in the web UI when the `tool_skills` feature flag is enabled.
- The page renders a well-designed empty state that explains the skill concept, communicates that the feature is coming, and does not display any error indicators.
- The navigation entry for "Tool Skills" is visible in the integrations sidebar/menu only when the `tool_skills` feature flag is enabled.
- When the `tool_skills` feature flag is disabled, the navigation entry is hidden from the sidebar/menu.
- When the `tool_skills` feature flag is disabled, direct navigation to `/integrations/skills` redirects to `/integrations` with no error displayed.
- The page fetches `GET /api/integrations/skills` to back the empty state with real API data, handling the `[]` response gracefully.
- The page correctly handles authentication — unauthenticated users are redirected to the login page.
- The page design follows Codeplane's standard empty-state illustration and typography patterns.
- No configuration controls, forms, action buttons (e.g., "Add Skill", "Upload", "Create"), or management affordances are displayed.
- The empty state includes a brief explanatory paragraph and, optionally, a link to documentation.
- The CLI command `codeplane api get /api/integrations/skills` returns `[]` without error when authenticated.
- The TUI does not expose a dedicated "Tool Skills" screen but does not error when the `tool_skills` feature flag is toggled.

### Edge Cases

- Feature flag toggled during active session: If the `tool_skills` flag is disabled while a user is viewing the Tool Skills page, the next navigation or data refresh should redirect the user away gracefully.
- Deep link with flag disabled: A user following a bookmarked or shared URL to `/integrations/skills` when the flag is off sees a redirect to `/integrations`, not a 404 or blank screen.
- Unauthenticated deep link: An unauthenticated user navigating directly to `/integrations/skills` is redirected to login, and after login, is redirected back appropriately based on flag state.
- API returns non-empty array in the future: The gated UI page should gracefully handle both `[]` and a populated array without crashing. During gated phase, the empty state displays regardless.
- API returns 401: Expired session triggers redirect to login.
- API returns 404 or 403 (flag disabled server-side): Page displays a generic "Feature not available" message rather than a raw error.
- API network failure: Page shows a retry-friendly error state ("Could not load skills. Try again.") rather than crashing.
- Concurrent navigation: Rapidly toggling between Tool Skills and other pages does not produce stale renders or hydration errors.
- Browser back/forward: Route restoration works correctly.
- Screen reader accessibility: Empty state message is announced correctly. Page title is set appropriately for assistive technology.

### Boundary Constraints

| Constraint | Value | Notes |
|---|---|---|
| Feature flag name | `tool_skills` | Matches `FeatureFlagName` type |
| API endpoint | `GET /api/integrations/skills` | Returns `[]` during gated phase |
| Navigation label | "Tool Skills" (11 chars) | Max 20 characters |
| Empty state heading | "No tool skills configured" | Max 60 characters |
| Empty state description | Informational paragraph about skills | Max 300 characters |
| Documentation link URL | Standard URL | Max 2048 characters |
| Page title | "Tool Skills — Codeplane" | Browser tab title |
| Redirect target when flag disabled | `/integrations` | No error banner |

## Design

### Web UI Design

#### Route

`/integrations/skills` — a sub-page of the global integrations surface, consistent with the existing integrations architecture (Linear, MCP, and skills are all children of the integrations route family).

#### Feature Flag Gating

The route is wrapped in a feature-flag-aware route guard that checks the `tool_skills` flag from the public feature flags endpoint (`GET /api/feature-flags`).

**When `tool_skills` is enabled:**
- The "Tool Skills" entry appears in the integrations sidebar or settings navigation.
- Navigating to `/integrations/skills` renders the Tool Skills page.

**When `tool_skills` is disabled:**
- The "Tool Skills" entry is hidden from the integrations sidebar.
- Navigating directly to `/integrations/skills` redirects to `/integrations`.
- No error message is shown on redirect; the transition is silent.

#### Page Layout

**Page Header:**
- Title: "Tool Skills" in bold, heading-level typography.
- Subtitle: "Extend agent, workflow, and workspace capabilities with reusable skill packages." in muted body text.

**Empty State Container:**

Centered vertically and horizontally within the page content area. Contains:

1. **Illustration**: A muted, on-brand illustration consistent with other Codeplane empty states (puzzle-piece or toolbox motif).
2. **Heading**: "No tool skills configured"
3. **Description paragraph**: "Tool skills are packaged instructions and context that teach agents how to interact with specific systems, follow coding conventions, or execute domain-specific tasks. When tool skills are available, you'll manage them here."
4. **Optional documentation link**: A text link "Learn more about tool skills →" pointing to the documentation section for skills (if documentation exists). If no documentation page exists yet, this link is omitted.

**No action buttons, forms, toggles, or configuration controls are displayed.**

#### Sidebar / Navigation Entry

- **Label**: "Tool Skills"
- **Icon**: A puzzle-piece, sparkle, or wrench-with-gear icon consistent with extensibility.
- **Position**: Within the integrations navigation group, after the Linear integration entry and after the MCP entry (if visible).
- **Badge**: None.

#### Keyboard Shortcuts

No feature-specific keyboard shortcuts. Standard page navigation shortcuts (sidebar navigation, command palette) work normally.

#### Responsive Behavior

- On mobile viewports, the empty state paragraph wraps naturally. The illustration scales down proportionally.
- The sidebar collapses to a hamburger menu on narrow viewports, and "Tool Skills" appears in the collapsed menu.

### API Shape

Consumes the existing stub endpoint:

**Endpoint:** `GET /api/integrations/skills`

**Authentication:** Required (session cookie or `Authorization: Bearer <PAT>`).

**Feature Flag:** `tool_skills` must be enabled.

**Response (success, 200):**
```json
[]
```

**Response (unauthenticated, 401):**
```json
{"error": "authentication required"}
```

**Response (feature flag disabled, 404):**
```json
{"error": "not found"}
```

No new API endpoints are introduced by this gated UI feature.

### CLI Command

No new CLI command is introduced. `codeplane api get /api/integrations/skills` passthrough works correctly against the stub. When the full Tool Skills feature ships, a `codeplane skill` or `codeplane extension skill` command group will be introduced.

### TUI UI

No dedicated TUI screen is introduced. The TUI does not display a "Tool Skills" navigation entry during the gated phase.

### Neovim / VS Code

No editor-specific surfaces are introduced during the gated phase.

### Documentation

- A brief entry in the Integrations documentation acknowledging that the Tool Skills surface exists and is gated.
- Description: "Tool Skills is a planned capability for managing reusable skill packages that extend agent, workflow, and workspace behavior. The Tool Skills page is currently available as a preview surface. No configuration is required at this time."
- API reference documents `GET /api/integrations/skills` with its authentication requirement, empty-array response, and feature flag dependency.
- No tutorial, setup guide, or walkthrough until the full feature ships.

## Permissions & Security

### Authorization Roles

| Role | Web UI Access | API Access |
|---|---|---|
| **Owner** | Can view Tool Skills page (sees empty state) | `GET /api/integrations/skills` → `200 []` |
| **Admin** | Can view Tool Skills page (sees empty state) | `GET /api/integrations/skills` → `200 []` |
| **Member** | Can view Tool Skills page (sees empty state) | `GET /api/integrations/skills` → `200 []` |
| **Read-Only** | Can view Tool Skills page (sees empty state) | `GET /api/integrations/skills` → `200 []` |
| **Anonymous / Unauthenticated** | Redirected to login | `GET /api/integrations/skills` → `401` |

The gated UI is a read-only informational surface. All authenticated users with the `tool_skills` flag enabled can view it. There are no write operations, no mutation endpoints, and no privileged actions.

When the full feature ships, role-based write access (e.g., only Owners/Admins can add or configure skills) will be introduced.

### Rate Limiting

- The `GET /api/integrations/skills` endpoint is covered by the global rate limiting middleware.
- No additional per-endpoint rate limiting is required for the gated phase, since the endpoint performs no database queries, no external calls, and returns a constant response.
- If global rate limits are exceeded, the standard `429 Too Many Requests` response applies.
- The web UI does not retry on 429; it surfaces a "Rate limited, please try again later" message.

### Data Privacy

- The gated UI displays no user data, no PII, and no repository-specific information. It renders a static empty state.
- The API endpoint returns a hardcoded empty array containing no sensitive data.
- No request data is persisted or logged beyond standard structured request logging (request ID, user ID, method, path, status code).
- The authentication check does not leak whether a user exists — unauthenticated requests fail identically regardless of token contents.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `ToolSkillsPageViewed` | User navigates to the Tool Skills gated UI page | `user_id`, `timestamp`, `source` (`sidebar`, `direct_url`, `command_palette`), `feature_flag_enabled` |
| `ToolSkillsPageRedirected` | User navigates to Tool Skills but flag is disabled, triggering redirect | `user_id` (if authenticated), `timestamp`, `redirect_target`, `denial_reason` (`feature_flag_disabled`) |
| `ToolSkillsApiDiscoveryRequested` | Authenticated user calls `GET /api/integrations/skills` (from any client) | `user_id`, `timestamp`, `response_count` (always `0`), `client` (`web`, `cli`, `tui`, `editor`, `unknown`), `feature_flag_enabled` |
| `ToolSkillsApiDiscoveryDenied` | Unauthenticated or flag-disabled request to the endpoint | `timestamp`, `denial_reason` (`unauthenticated` or `feature_flag_disabled`) |

### Event Properties

- `user_id`: integer, the authenticated user's internal ID
- `timestamp`: ISO 8601 UTC string
- `source`: string enum, how the user reached the page (`sidebar`, `direct_url`, `command_palette`)
- `feature_flag_enabled`: boolean, whether `tool_skills` was enabled at request time
- `redirect_target`: string, the URL the user was redirected to
- `denial_reason`: string enum, why the request was denied (`unauthenticated`, `feature_flag_disabled`)
- `response_count`: integer, number of skills returned (always `0` during gated phase)
- `client`: string enum, which client originated the request (`web`, `cli`, `tui`, `editor`, `unknown`)

### Funnel Metrics & Success Indicators

- **Awareness signal**: Track unique users who view the Tool Skills page per week. A rising trend indicates users are discovering and exploring the gated surface.
- **Discovery pattern**: Track which navigation source (sidebar, direct URL, command palette) users use to reach the page. This informs whether the sidebar placement is effective.
- **API adoption**: Track unique users and unique client types calling `GET /api/integrations/skills`. Goal: all major clients should be calling it before the full feature ships.
- **Redirect rate**: Track how often users hit the page with the flag disabled (redirects). A high redirect rate may indicate documentation or external links referencing the page before the flag is rolled out.
- **Error baseline**: Establish a near-zero error rate during the gated phase so that when the full feature ships, any increase in errors is immediately detectable.
- **Engagement depth**: Track whether users who view the Tool Skills page also visit the documentation link (if present). This indicates interest in the upcoming feature.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|---|---|---|
| Tool Skills page rendered (client-side) | `debug` | `user_id`, `page`, `feature_flag_enabled`, `api_response_status` |
| Tool Skills API response (server-side) | `debug` | `request_id`, `user_id`, `method`, `path`, `status_code` (200), `response_count` (0) |
| Tool Skills auth failure (server-side) | `info` | `request_id`, `method`, `path`, `status_code` (401), `auth_method` (`cookie`/`pat`/`none`) |
| Tool Skills feature flag check (server-side) | `debug` | `request_id`, `user_id`, `flag_name` (`tool_skills`), `flag_enabled` |
| Tool Skills page redirect due to flag (client-side) | `info` | `user_id`, `source_path`, `redirect_target`, `reason` (`feature_flag_disabled`) |
| Tool Skills API network error (client-side) | `warn` | `user_id`, `error_message`, `http_status` (if available) |
| Unexpected server error in skills endpoint | `error` | `request_id`, `user_id`, `method`, `path`, `error_message`, `stack_trace` |

All server-side log entries use the structured logging format established by the global logging middleware.

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|---|---|---|---|
| `codeplane_tool_skills_page_views_total` | Counter | `source` (`sidebar`, `direct_url`, `command_palette`) | Total page views of the Tool Skills gated UI |
| `codeplane_integration_skills_discovery_requests_total` | Counter | `status` (200, 401, 404, 429, 500), `client` (web, cli, tui, editor) | Total requests to the skills discovery endpoint |
| `codeplane_integration_skills_discovery_duration_seconds` | Histogram | `status` | Request duration for skills discovery (sub-millisecond expected for stub) |
| `codeplane_integration_skills_discovery_auth_failures_total` | Counter | `reason` (`unauthenticated`, `invalid_token`, `expired_token`) | Auth failures on skills discovery endpoint |
| `codeplane_tool_skills_feature_flag_checks_total` | Counter | `result` (`enabled`, `disabled`) | Feature flag evaluations for `tool_skills` |

### Alerts

#### Alert: Skills Discovery 500 Error Rate Spike

- **Condition**: `rate(codeplane_integration_skills_discovery_requests_total{status="500"}[5m]) > 0.01`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries containing `path=/api/integrations/skills`.
  2. The stub endpoint has no external dependencies, so a 500 indicates a middleware failure (auth context loading, rate limiter, JSON serialization) or framework-level issue.
  3. Verify the Hono middleware stack is healthy by checking other endpoint error rates using `rate(codeplane_http_requests_total{status="500"}[5m])`.
  4. If isolated to this endpoint, review recent deployments for changes to `apps/server/src/routes/integrations.ts`.
  5. If in the auth middleware, check `codeplane_auth_context_errors_total` and escalate to auth/identity on-call.
  6. If no code changes, check for Bun runtime issues (memory, event loop) using process metrics.

#### Alert: Skills Discovery Latency Anomaly

- **Condition**: `histogram_quantile(0.99, rate(codeplane_integration_skills_discovery_duration_seconds_bucket[5m])) > 0.5`
- **Severity**: Warning
- **Runbook**:
  1. The stub returns a constant value; p99 latency above 500ms indicates a systemic issue.
  2. Check global API latency dashboard. If all endpoints are slow, escalate to infrastructure on-call.
  3. If only this endpoint is slow, check for recently added middleware or feature flag evaluation regression.
  4. Examine Bun process CPU and memory metrics.
  5. Profile with `bun --inspect` if needed.

#### Alert: Unexpected 404 Spike on Skills Discovery

- **Condition**: `rate(codeplane_integration_skills_discovery_requests_total{status="404"}[5m]) > 0.1` AND `tool_skills` flag is expected globally enabled
- **Severity**: Info
- **Runbook**:
  1. Verify `tool_skills` feature flag state via `GET /api/feature-flags` or check `CODEPLANE_FEATURE_FLAGS_TOOL_SKILLS` env var.
  2. If unintentionally disabled, re-enable it.
  3. If enabled but 404s persist, verify integrations route module is mounted in `apps/server/src/index.ts`.
  4. Check if reverse proxy or CDN is caching a 404 response; clear cache if so.

#### Alert: Tool Skills Page View Drop

- **Condition**: `sum(rate(codeplane_tool_skills_page_views_total[24h])) == 0` for 7 consecutive days (after baseline established)
- **Severity**: Info
- **Runbook**:
  1. Verify the feature flag is still enabled in production.
  2. Check if a UI deployment removed the navigation entry or route.
  3. Review recent UI changes to the integrations layout or sidebar.
  4. If intentional (flag disabled for rollback), close the alert.

### Error Cases and Predictable Failure Modes

| Error | Surface | HTTP Status | Cause | User-Facing Behavior | Resolution |
|---|---|---|---|---|---|
| Unauthenticated API request | API | 401 | No session cookie or PAT | Web: redirect to login. CLI: auth error. | User authenticates. |
| Invalid/expired PAT | API | 401 | PAT revoked/expired/malformed | Web: redirect to login. CLI: "token expired". | User re-authenticates. |
| Feature flag disabled (server) | API | 404 | `tool_skills` is `false` | Web: redirect to parent. CLI: "not found". | Admin enables the flag. |
| Feature flag disabled (client) | Web | N/A | Client-side flag check fails | Nav entry hidden; direct URL redirects. | Admin enables the flag. |
| Rate limit exceeded | API | 429 | Too many requests | Web: rate limit message. CLI: retry-after. | Client backs off. |
| Network failure | Web | N/A | Connection dropped | "Could not load skills. Try again." with retry. | User retries. |
| Server error | API | 500 | Middleware crash | Web: generic error. CLI: error output. | Investigate logs. |
| Route not mounted | API | 404 | Deployment issue | Same as flag disabled. | Verify deployment. |

## Verification

### API Integration Tests

1. **Authenticated GET returns 200 with empty array**: Send `GET /api/integrations/skills` with valid session cookie. Assert status `200`, body `[]`, `Content-Type` contains `application/json`.

2. **Authenticated GET with PAT returns 200 with empty array**: Send `GET /api/integrations/skills` with valid `Authorization: Bearer <PAT>`. Assert status `200`, body `[]`.

3. **Unauthenticated GET returns 401**: Send `GET /api/integrations/skills` with no auth. Assert status `401`, body contains `"authentication required"`.

4. **Expired session returns 401**: Send `GET /api/integrations/skills` with expired session cookie. Assert status `401`.

5. **Revoked PAT returns 401**: Create PAT, revoke it, then send `GET /api/integrations/skills` with revoked PAT. Assert status `401`.

6. **Malformed Authorization header returns 401**: Send `GET /api/integrations/skills` with `Authorization: Bearer INVALID_GARBAGE_TOKEN_12345`. Assert status `401`.

7. **Feature flag disabled returns 404 or 403**: Set `CODEPLANE_FEATURE_FLAGS_TOOL_SKILLS=false`. Send authenticated `GET /api/integrations/skills`. Assert status is `404` or `403`.

8. **Feature flag re-enabled returns 200**: Re-enable `tool_skills`. Send authenticated `GET /api/integrations/skills`. Assert status `200`, body `[]`.

9. **Response is exactly an empty JSON array**: Send authenticated `GET /api/integrations/skills`. Parse body. Assert it is an array with length `0`. Assert it is not `null`, `{}`, `""`, or `"null"`.

10. **Response Content-Type is application/json**: Send authenticated `GET /api/integrations/skills`. Assert `Content-Type` starts with `application/json`.

11. **Unknown query parameters are silently ignored**: Send `GET /api/integrations/skills?foo=bar&page=1&limit=50&category=custom` with valid auth. Assert status `200`, body `[]`.

12. **POST method returns 404 or 405**: Send `POST /api/integrations/skills` with valid auth and body `{"name": "test"}`. Assert status is `404` or `405`.

13. **PUT method returns 404 or 405**: Send `PUT /api/integrations/skills` with valid auth. Assert status is `404` or `405`.

14. **DELETE method returns 404 or 405**: Send `DELETE /api/integrations/skills` with valid auth. Assert status is `404` or `405`.

15. **PATCH method returns 404 or 405**: Send `PATCH /api/integrations/skills` with valid auth. Assert status is `404` or `405`.

16. **CORS preflight succeeds**: Send `OPTIONS /api/integrations/skills` with `Origin` and `Access-Control-Request-Method: GET` headers. Assert `200` or `204` with valid CORS headers.

17. **Concurrent requests from same user**: Send 10 concurrent `GET /api/integrations/skills` with same valid auth. Assert all return `200 []`.

18. **GET with unexpected request body is ignored**: Send `GET /api/integrations/skills` with JSON body `{"unexpected": true}` and valid auth. Assert `200 []`.

19. **Large query string handled gracefully**: Send `GET /api/integrations/skills?x=<2000 char string>` with valid auth. Assert either `200 []` or `414`. Must not produce `500`.

20. **Response body byte length is correct**: Send `GET /api/integrations/skills` with valid auth. Assert response body byte length equals `2` (byte length of `[]`).

21. **Feature flags endpoint includes tool_skills**: Send `GET /api/feature-flags`. Assert response contains `tool_skills` key of type boolean.

### CLI Integration Tests

22. **CLI api passthrough works**: Run `codeplane api get /api/integrations/skills` while authenticated. Assert output contains `[]`.

23. **CLI api passthrough unauthenticated fails**: Run `codeplane api get /api/integrations/skills` without login. Assert non-zero exit code and auth error in output.

24. **CLI api passthrough with JSON filter**: Run `codeplane api get /api/integrations/skills --json .` while authenticated. Assert output is valid JSON empty array.

### E2E / Playwright Tests (Web UI)

25. **Tool Skills page renders when flag enabled**: Navigate to `/integrations/skills` as authenticated user with `tool_skills` enabled. Assert page loads without errors. Assert heading containing "Tool Skills" is visible.

26. **Empty state message is displayed**: Navigate to `/integrations/skills`. Assert informational empty state message is displayed containing text about skills (e.g., "No tool skills configured" or "skill packages").

27. **Empty state is not an error state**: Navigate to `/integrations/skills`. Assert no error banners, red text, or error icons. Assert the empty state uses the standard informational pattern.

28. **No action buttons in gated UI**: Navigate to `/integrations/skills`. Assert no buttons with labels "Add", "Create", "Upload", "Install", "Configure", or "Enable".

29. **Navigation entry visible when flag enabled**: Navigate to integrations area. Assert sidebar/nav link labeled "Tool Skills" is visible and clickable.

30. **Navigation entry hidden when flag disabled**: With `tool_skills` disabled, navigate to integrations area. Assert no "Tool Skills" nav link visible.

31. **Direct URL redirects when flag disabled**: With `tool_skills` disabled, navigate to `/integrations/skills`. Assert redirect to `/integrations`. Assert no error message.

32. **Unauthenticated access redirects to login**: In unauthenticated session, navigate to `/integrations/skills`. Assert redirect to login page.

33. **Page title is set correctly**: Navigate to `/integrations/skills`. Assert document title contains "Tool Skills".

34. **Page is keyboard-navigable**: Navigate to `/integrations/skills`. Assert page content is Tab-reachable. Assert focus indicators are visible.

35. **Mobile viewport renders correctly**: Set viewport to 375px width. Navigate to `/integrations/skills`. Assert text wraps without overflow. Assert no content clipped.

36. **Browser back/forward works**: Navigate `/integrations` → `/integrations/skills` → Back → Forward. Assert correct content at each step.

37. **Documentation link works (if present)**: Navigate to `/integrations/skills`. If "Learn more" link is present, click it. Assert it navigates to a valid URL (not 404).

38. **Rapid navigation does not break rendering**: Navigate rapidly between `/integrations` and `/integrations/skills` 5 times. Assert final page renders correctly without stale content or console errors.

39. **Screen reader accessibility**: Navigate to `/integrations/skills`. Assert appropriate ARIA landmarks. Assert heading has correct role. Assert page passes axe-core accessibility checks.

40. **Console has no errors on page load**: Navigate to `/integrations/skills`. Assert browser console contains no JavaScript errors during load and render.
