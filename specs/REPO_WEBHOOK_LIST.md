# REPO_WEBHOOK_LIST

Specification for REPO_WEBHOOK_LIST.

## High-Level User POV

When a repository administrator needs to understand what external integrations are connected to their repository, they visit the webhooks section of the repository settings. Here they see a clear, organized list of every webhook configured for the repository. Each webhook entry shows its target URL, which events it subscribes to, whether it is currently active or disabled, and when it last successfully delivered a payload.

This list is the primary orientation surface for webhook management. It answers the questions: "What external systems is my repository talking to?", "Are all my integrations healthy?", and "Has anything been auto-disabled because of failures?" From this list, administrators can quickly scan for problems—such as webhooks that haven't delivered recently or that have been automatically deactivated after consecutive delivery failures.

The webhook list is accessible from the API (GET /api/repos/:owner/:repo/hooks), the CLI (webhook list --repo owner/repo), and the web UI repository settings. Secrets are never exposed in the list response—they are always redacted to "********" to prevent accidental leakage in logs, screenshots, or browser history.

## Acceptance Criteria

1. The API endpoint GET /api/repos/:owner/:repo/hooks returns a JSON array of all webhooks for the specified repository.
2. Each webhook object in the response includes: id, url, events (array of subscribed event types), is_active (boolean), content_type, last_delivery_at (nullable ISO timestamp), created_at, and updated_at.
3. The secret field is always redacted to "********" in the response, never returned in plaintext.
4. Only users with repository admin access (repo owner, org owner, team admin, or admin collaborator) can list webhooks. Unauthorized users receive a 403 or appropriate error.
5. If the repository does not exist, a 404 is returned.
6. The list returns all webhooks (up to the per-repository maximum of 20) without server-side pagination, since the cap is small.
7. The CLI command `webhook list` outputs all webhooks in a formatted table (or JSON with --json) showing URL, events, active status, and last delivery timestamp.
8. Webhooks that were auto-disabled due to 10 consecutive delivery failures show is_active as false.
9. The response uses snake_case field names consistent with the API convention (mapWebhookResponse converts from camelCase DB rows).
10. The endpoint is idempotent—repeated GET requests return the same result without side effects.

## Design

### API Layer

The webhook list endpoint is GET /api/repos/:owner/:repo/hooks, mounted in the webhooks route family (apps/server/src/routes/webhooks.ts). The route handler extracts the authenticated user from request context, reads :owner and :repo path parameters, and delegates to WebhookService.listWebhooks(actor, owner, repo).

The response is mapped through mapWebhookResponse() which converts camelCase database column names to snake_case API field names. The secret field is redacted by the service layer before reaching the route handler.

### Service Layer

WebhookService.listWebhooks (packages/sdk/src/services/webhook.ts) performs:
1. Permission check: verifies the actor has admin access to the repository.
2. Database query: calls listRepoWebhooksByOwnerAndRepo() which joins the repositories table with users/orgs tables to resolve the owner by username or org name.
3. Secret redaction: replaces all secret values with "********" before returning.
4. Returns the array of webhook objects.

### Database Layer

The query listRepoWebhooksByOwnerAndRepo (packages/sdk/src/db/webhooks_sql.ts) joins repo_webhooks with repositories and the owner resolution tables. It filters by owner name and repo name, returning all matching webhook rows ordered by created_at.

### CLI Layer

The `webhook list` command (apps/cli/src/commands/webhook.ts) resolves the target repository from --repo flag or current directory context, calls the API endpoint, and formats output as either a human-readable table or JSON.

### Data Model

WebhookRow: { id: string, repositoryId: string, url: string, secret: string (redacted), events: string[], isActive: boolean, contentType: string, lastDeliveryAt: string | null, createdAt: string, updatedAt: string }

### Constraints
- Maximum 20 webhooks per repository (enforced at creation, not listing)
- URLs must be https:// (enforced at creation, visible in list)
- No pagination needed since max is 20 items

## Permissions & Security

### Required Permission

Repository admin access is required to list webhooks. This is enforced in the WebhookService layer before any data is returned.

### Who Has Admin Access

- Repository owner (the user who created the repo)
- Organization owner (if the repo belongs to an org)
- Team admin (if the user is an admin of a team that has access to the repo)
- Admin collaborator (explicitly granted admin role on the repo)

### Unauthorized Access Behavior

- Authenticated user without admin access: receives a 403 Forbidden response
- Unauthenticated request: receives a 401 Unauthorized response
- Nonexistent repository: receives a 404 Not Found response (does not leak repository existence to unauthorized users)

### Secret Handling

Even for authorized admin users, webhook secrets are never returned in plaintext. The service layer redacts secrets to "********" in all list and detail responses. This prevents accidental exposure through API responses, CLI output, browser dev tools, or logging.

## Telemetry & Product Analytics

### Structured Logging

- Log each webhook list request with: actor_id, owner, repo, result_count, response_time_ms
- Log permission denied attempts with: actor_id, owner, repo, reason

### Metrics

- Counter: webhook_list_requests_total (labels: status=success|forbidden|not_found)
- Histogram: webhook_list_duration_seconds
- Gauge: webhooks_per_repo (updated on list, useful for capacity monitoring)

### Events

- No webhook events are fired for list operations (read-only, no side effects)
- No SSE emissions for list operations

## Observability

### Health Indicators

- The webhook list endpoint participates in the standard health check surface. If the database is unreachable, the list endpoint returns a 500.
- The webhook worker's delivery success/failure rates are observable through webhook delivery records and the auto-disable mechanism (10 consecutive failures disables a webhook).

### Alerting Signals

- High rate of 403 responses on webhook list may indicate permission misconfiguration or unauthorized access attempts.
- High rate of 500 responses indicates database connectivity or query issues.
- A repository with all webhooks auto-disabled (is_active=false) suggests persistent delivery failures that an admin should investigate.

### Debugging

- Request ID middleware attaches a unique ID to every request, enabling tracing through logs.
- The structured logging middleware captures request method, path, status, and duration for all webhook endpoints.
- Webhook delivery history (accessible via the deliveries sub-endpoint) provides detailed per-delivery debugging including response status, response body (truncated to 10KB), and retry history.

## Verification

### Unit Tests

- **Service returns all webhooks for a repository**: Create 3 webhooks via the service. Call listWebhooks. Assert all 3 are returned with correct fields.
- **Service redacts secrets**: Create a webhook with a known secret. Call listWebhooks. Assert the secret field is "********", not the original value.
- **Service enforces admin permission**: Call listWebhooks as a non-admin user. Assert the call throws a permission error.
- **Service returns empty array for repo with no webhooks**: Call listWebhooks on a repo with no webhooks. Assert an empty array is returned.
- **mapWebhookResponse converts field names**: Pass a camelCase WebhookRow to mapWebhookResponse. Assert output uses snake_case keys (is_active, last_delivery_at, created_at, updated_at).

### API Integration Tests

- **GET /api/repos/:owner/:repo/hooks returns 200 with webhook array**: Create webhooks, GET the list endpoint, verify 200 status and correct JSON structure.
- **GET /api/repos/:owner/:repo/hooks returns 403 for non-admin**: Authenticate as a read-only collaborator. GET the list endpoint. Verify 403.
- **GET /api/repos/:owner/:repo/hooks returns 404 for nonexistent repo**: GET webhooks for a nonexistent repo. Verify 404.
- **GET /api/repos/:owner/:repo/hooks never leaks secrets**: Create a webhook with a secret. GET the list. Assert no response field contains the original secret string.
- **Auto-disabled webhooks show is_active false**: Simulate 10 consecutive delivery failures. GET the list. Assert the webhook's is_active is false.

### CLI E2E Tests

- **webhook list shows created webhooks**: Run `webhook create` then `webhook list`. Verify the created webhook appears in CLI output with correct URL and events.
- **webhook list shows empty state**: Run `webhook list` on a repo with no webhooks. Verify clean output with no error.
- **webhook list with --json outputs valid JSON**: Run `webhook list --json`. Parse output as JSON. Verify it is a valid array of webhook objects.
- **webhook list fails gracefully for nonexistent repo**: Run `webhook list --repo nonexistent/repo`. Verify non-zero exit code and meaningful error message.

### Playwright (Web UI) Tests

- **Webhook list page shows all webhooks**: Navigate to repo settings → Webhooks. Verify all configured webhooks display with URLs, event badges, and status indicators.
- **Webhook list page shows empty state**: Navigate to settings for a repo with no webhooks. Verify the empty state message is displayed.
- **Webhook list page does not show plaintext secrets**: Create a webhook with a secret. Navigate to the webhook list. Verify the secret is not visible in the DOM.
- **Webhook list page shows active/inactive status correctly**: Create one active and one inactive webhook. Verify status badges are correct.
- **Webhook list page is not accessible to non-admin users**: Authenticate as read-only user. Navigate to webhook settings. Verify permission error or redirect.
- **Webhook list page entry navigates to detail view**: Click a webhook entry. Verify navigation to the webhook detail page.
