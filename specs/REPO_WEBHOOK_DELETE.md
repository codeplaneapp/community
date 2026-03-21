# REPO_WEBHOOK_DELETE

Specification for REPO_WEBHOOK_DELETE.

## High-Level User POV

When a repository administrator no longer needs a webhook — whether because the receiving service has been decommissioned, the integration has been replaced, or the webhook was created in error — they need a fast, safe way to permanently remove it. Deleting a webhook should be a deliberate action that immediately and irreversibly stops all future deliveries to that endpoint, removing the webhook configuration and its association with the repository.

From the user's perspective, webhook deletion is available wherever webhooks can be managed: the repository settings area of the web UI, the CLI, and the TUI. The user selects or identifies the webhook they want to remove, confirms the action, and the webhook is gone. No further deliveries will be attempted for that webhook, including any pending retries. The webhook disappears from all listing views immediately. Historical delivery records for that webhook are no longer accessible through the webhook's delivery history endpoint since the parent resource no longer exists.

This action is restricted to users who have administrative access to the repository. Read-only collaborators, regular members, and unauthenticated visitors cannot delete webhooks. The system does not offer an "undo" or "soft delete" — once deleted, the webhook must be recreated from scratch if needed again.

## Acceptance Criteria

### Definition of Done

- A webhook can be permanently deleted by an authorized user via API, CLI, Web UI, and TUI.
- The webhook is immediately and irrecoverably removed from the database.
- All future deliveries for the deleted webhook cease, including any pending retries in the delivery queue.
- The webhook no longer appears in any listing endpoint or UI surface after deletion.
- Appropriate HTTP status codes, CLI exit codes, and error messages are returned for all success and failure paths.
- Telemetry events are emitted on successful deletion.
- Structured logs are written at the appropriate level for success and failure.

### Functional Constraints

- [ ] Only authenticated users with admin-level access to the repository may delete a webhook.
- [ ] The webhook ID must be a positive integer; IDs ≤ 0, non-numeric strings, floats, and empty values must be rejected with a `400 Bad Request`.
- [ ] The repository must exist; a request targeting a non-existent `owner/repo` must return `404 Not Found`.
- [ ] The webhook must exist and belong to the specified repository; deleting a non-existent webhook must return `404 Not Found`.
- [ ] A webhook belonging to a different repository than the one in the URL path must not be deletable (the SQL query enforces repository scoping).
- [ ] Deletion is idempotent from the user's perspective: a second delete of the same webhook ID returns `404`, not a server error.
- [ ] On success, the API returns `204 No Content` with an empty body.
- [ ] The CLI returns exit code `0` and a JSON object `{ "status": "deleted", "id": <number> }` on success.
- [ ] Deleting a webhook does not affect other webhooks on the same repository.
- [ ] Deleting the last webhook on a repository is permitted and leaves the repository with zero webhooks.
- [ ] The maximum valid webhook ID is constrained by the database integer type (PostgreSQL `bigint`, max `9223372036854775807`). IDs exceeding this should be handled gracefully.
- [ ] Webhook IDs containing special characters (e.g., `abc`, `12.5`, `1;DROP TABLE`, `<script>`) must be rejected at the route parsing layer before reaching the service.

### Edge Cases

- [ ] Deleting a webhook that is currently mid-delivery: the in-flight delivery attempt may complete, but no new deliveries will be enqueued.
- [ ] Deleting a webhook that has pending retry deliveries: pending deliveries referencing a deleted webhook should fail gracefully when the worker attempts to process them (webhook lookup returns null).
- [ ] Deleting a webhook that was auto-disabled (10 consecutive failures): deletion should succeed regardless of the webhook's active/disabled state.
- [ ] Concurrent deletion of the same webhook by two requests: the first succeeds with `204`, the second returns `404`.
- [ ] Deleting a webhook on an archived repository: follows the same admin-access rules; if admin access is still granted, deletion proceeds.
- [ ] Deleting a webhook via config sync (`configsync.ts`): uses the internal `deleteWebhookByID` path, not the owner/repo-scoped path; both paths must result in a clean removal.

## Design

### API Shape

**Endpoint**: `DELETE /api/repos/:owner/:repo/hooks/:id`

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|--------|----------|----------------------------------------|
| `owner` | string | yes | Repository owner username or org name |
| `repo` | string | yes | Repository name |
| `id` | integer | yes | Webhook ID to delete |

**Request Headers**:
| Header | Required | Description |
|----------------|----------|---------------------------------------|
| `Cookie` | conditional | Session cookie for browser-based auth |
| `Authorization` | conditional | `token <PAT>` for API/CLI-based auth |

**Request Body**: None. Any body sent with the request is ignored.

**Response Codes**:
| Code | Condition |
|------|------------------------------------------|
| `204 No Content` | Webhook successfully deleted |
| `400 Bad Request` | Webhook ID is not a valid positive integer |
| `401 Unauthorized` | No valid authentication credentials provided |
| `403 Forbidden` | Authenticated user lacks admin access to the repository |
| `404 Not Found` | Repository does not exist, or webhook does not exist within the specified repository |
| `429 Too Many Requests` | Rate limit exceeded |

**Success Response**: Empty body, status `204`.

**Error Response Shape** (for 400/401/403/404):
```json
{
  "message": "<human-readable error description>"
}
```

### SDK Shape

**Service**: `WebhookService`

**Method**: `deleteWebhook(actor: AuthUser | undefined, owner: string, repo: string, webhookId: number): Promise<void>`

**Behavior**:
1. Validates `actor` is authenticated → throws `unauthorized` if not.
2. Validates `webhookId > 0` → throws `badRequest` if invalid.
3. Resolves repository by `owner` + `repo` (case-insensitive) → throws `notFound` if repository doesn't exist.
4. Verifies `actor` has admin access to the repository → throws `forbidden` if not.
5. Executes the scoped DELETE query matching both webhook ID and repository ownership.
6. If `rowsAffected === 0`, throws `notFound` (webhook doesn't exist or doesn't belong to this repo).
7. Returns `void` on success.

### CLI Command

**Command**: `codeplane webhook delete <id> [options]`

**Arguments**:
| Argument | Type | Required | Description |
|----------|--------|----------|------------------------------|
| `id` | number | yes | The webhook ID to delete |

**Options**:
| Option | Type | Default | Description |
|----------|--------|---------|--------------------------------------|
| `--repo` | string | auto-detected | Repository reference (`OWNER/REPO`) |
| `--yes` | boolean | false | Skip confirmation prompt |

**Output (JSON mode)**:
```json
{
  "status": "deleted",
  "id": 42
}
```

**Output (human mode)**: `Webhook 42 deleted.`

**Exit codes**:
| Code | Meaning |
|------|-------------------------------------------|
| `0` | Webhook deleted successfully |
| `1` | Error (auth failure, not found, permission denied, network error) |

**Repo resolution**: If `--repo` is not provided, the CLI resolves the repository from the current working directory's jj/git remote configuration via `resolveRepoRef()`.

### Web UI Design

**Location**: Repository Settings → Webhooks section

**Entry point**: The webhook list view shows each webhook as a row with its URL, event subscriptions, active status, last delivery timestamp, and an actions area. Each row includes a **Delete** button (destructive styling — red or danger variant).

**Deletion flow**:
1. User clicks the **Delete** button on a webhook row.
2. A confirmation dialog appears: _"Are you sure you want to delete this webhook? This action cannot be undone. The endpoint at `https://example.com/hook` will no longer receive deliveries."_
3. The dialog includes the webhook URL prominently so the user can verify they are deleting the correct webhook.
4. User clicks **Delete webhook** (destructive button) or **Cancel**.
5. On confirmation, the UI sends `DELETE /api/repos/:owner/:repo/hooks/:id`.
6. On `204`, the webhook row is removed from the list with no page reload. A toast notification confirms: _"Webhook deleted."_
7. On error (`401`, `403`, `404`), an error toast is shown with the server-provided message.

**States**:
- While the delete request is in-flight, the **Delete webhook** button in the dialog shows a loading spinner and is disabled to prevent double-submission.
- If the webhook list becomes empty after deletion, the UI shows the empty-state view for webhooks.

### TUI Design

**Interaction**:
1. User navigates to the webhook in the list.
2. User presses the delete keybinding (e.g., `d` or `Delete`).
3. A confirmation prompt appears inline: _"Delete webhook https://example.com/hook? (y/N)"_
4. On `y`, the TUI sends the DELETE request and removes the row from the list.
5. On `N` or `Esc`, the action is cancelled.

### Documentation

- **Webhooks management guide**: A section titled "Deleting a webhook" explaining that deletion is permanent, stops all future deliveries including pending retries, and requires admin access. Should mention that delivery history for the webhook is also no longer retrievable.
- **CLI reference**: The `codeplane webhook delete` command documented with usage, arguments, options, example invocations, and expected output.
- **API reference**: The `DELETE /api/repos/:owner/:repo/hooks/:id` endpoint documented with path parameters, authentication requirements, response codes, and example `curl` invocations.

## Permissions & Security

### Authorization Requirements

| Role | Can delete webhooks? |
|------|---------------------|
| Repository owner (user-owned repo) | ✅ Yes |
| Organization owner (org-owned repo) | ✅ Yes |
| Team member with `admin` permission on repo | ✅ Yes |
| Collaborator with `admin` permission | ✅ Yes |
| Team member with `write` permission | ❌ No (403) |
| Collaborator with `write` permission | ❌ No (403) |
| Collaborator with `read` permission | ❌ No (403) |
| Authenticated user with no repo relationship | ❌ No (403) |
| Unauthenticated user | ❌ No (401) |

### Rate Limiting

- The `DELETE /api/repos/:owner/:repo/hooks/:id` endpoint is covered by the global rate limiter applied via middleware.
- Recommended rate limit: **30 requests per minute per authenticated user** for webhook mutation endpoints. This prevents scripted abuse while being generous enough for legitimate batch cleanup.
- Rate-limited requests return `429 Too Many Requests` with a `Retry-After` header.

### Data Privacy & Security Constraints

- The webhook ID is a numeric database identifier. It does not leak PII.
- The delete operation does not return the webhook's URL or secret in the response body (empty `204`).
- Server-side logs must not include the webhook secret. The webhook URL may be logged for auditability.
- The SQL delete query is parameterized, preventing SQL injection via the `:id` path parameter.
- The route handler parses `:id` as an integer before passing it to the service layer, rejecting non-numeric input at the HTTP boundary.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WebhookDeleted` | A webhook is successfully deleted | `repository_id`, `webhook_id`, `actor_id`, `actor_username`, `owner`, `repo`, `webhook_url` (URL of the deleted webhook), `webhook_event_count` (number of event types the webhook was subscribed to), `webhook_was_active` (boolean), `webhook_age_seconds` (time since creation), `deletion_source` (`api`, `cli`, `web`, `tui`, `configsync`) |

### Funnel Metrics & Success Indicators

| Metric | Description | Healthy Signal |
|--------|-------------|----------------|
| `webhook_delete_success_rate` | Percentage of delete attempts that succeed (204) vs. error | > 95% (remaining 5% are expected 404s from already-deleted or non-existent hooks) |
| `webhook_delete_by_source` | Breakdown of deletions by source (API, CLI, Web, TUI, configsync) | Indicates which surfaces users prefer for webhook management |
| `webhook_lifetime_before_delete` | Distribution of time between webhook creation and deletion | Very short lifetimes (< 5 min) may indicate UX confusion or accidental creation |
| `webhooks_per_repo_after_delete` | Count of remaining webhooks after a deletion | Tracks whether users are cleaning up vs. replacing webhooks |
| `webhook_delete_error_distribution` | Breakdown of error responses (401, 403, 404) | High 403 rate may indicate permission model confusion |

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | When |
|-----------|-------|--------------------|------|
| Webhook delete request received | `info` | `{ owner, repo, webhook_id, actor_id, request_id }` | On every DELETE request that passes auth |
| Webhook deleted successfully | `info` | `{ owner, repo, webhook_id, actor_id, request_id, rows_affected }` | After successful SQL execution |
| Webhook delete failed — not found | `warn` | `{ owner, repo, webhook_id, actor_id, request_id }` | When `rowsAffected === 0` |
| Webhook delete failed — unauthorized | `warn` | `{ owner, repo, webhook_id, request_id }` | When no auth credentials provided |
| Webhook delete failed — forbidden | `warn` | `{ owner, repo, webhook_id, actor_id, request_id }` | When actor lacks admin access |
| Webhook delete failed — bad request | `warn` | `{ owner, repo, raw_id, request_id }` | When webhook ID fails integer parsing |
| Webhook delete failed — repository not found | `warn` | `{ owner, repo, webhook_id, actor_id, request_id }` | When owner/repo combination doesn't resolve |
| Webhook delete failed — internal error | `error` | `{ owner, repo, webhook_id, actor_id, request_id, error }` | On unexpected database or service errors |

**Log rules**:
- Never log webhook secrets.
- Webhook URLs may be logged for audit trail purposes.
- All log entries must include the `request_id` from the middleware for correlation.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_webhook_deletes_total` | Counter | `status` (`success`, `not_found`, `unauthorized`, `forbidden`, `bad_request`, `error`) | Total webhook delete attempts by outcome |
| `codeplane_webhook_delete_duration_seconds` | Histogram | `status` | Latency of the delete operation (from request receipt to response) |
| `codeplane_webhooks_active_total` | Gauge | `repository_id` | Current number of active webhooks per repository (decremented on delete) |

### Alerts

#### Alert: `WebhookDeleteErrorRateHigh`

**Condition**: `rate(codeplane_webhook_deletes_total{status="error"}[5m]) > 0.1`

**Severity**: Warning

**Runbook**:
1. Check structured logs for `webhook delete failed — internal error` entries in the last 5 minutes.
2. Look for the `request_id` and correlate with database connectivity issues.
3. Check PostgreSQL connection pool health: `SELECT count(*) FROM pg_stat_activity WHERE state = 'active'`.
4. Check if there are recent schema migrations that may have altered the `webhooks` table.
5. If the database is healthy, inspect the specific error messages in the logs for unexpected conditions (e.g., constraint violations from orphaned foreign keys).
6. If the issue is transient, monitor for auto-recovery. If persistent, escalate to the database on-call.

#### Alert: `WebhookDeleteLatencyHigh`

**Condition**: `histogram_quantile(0.95, rate(codeplane_webhook_delete_duration_seconds_bucket[5m])) > 2.0`

**Severity**: Warning

**Runbook**:
1. Check database query latency: run `EXPLAIN ANALYZE` on the delete query with sample parameters.
2. Verify that the `webhooks` table has the expected indexes on `id` and `repository_id`.
3. Check for table bloat or long-running transactions holding locks: `SELECT * FROM pg_locks WHERE NOT granted`.
4. Check for high database CPU or I/O wait on the database host.
5. If indexes are missing, add them. If lock contention is the cause, identify the blocking transaction.
6. Consider running `VACUUM ANALYZE webhooks` if table bloat is detected.

#### Alert: `WebhookDelete403Spike`

**Condition**: `rate(codeplane_webhook_deletes_total{status="forbidden"}[15m]) > 0.5`

**Severity**: Info

**Runbook**:
1. This alert may indicate a permission model change, a misconfigured automation, or a user confused about their access level.
2. Check structured logs for the `actor_id` values generating 403s.
3. If a single actor is responsible, check their repository permissions and advise.
4. If multiple actors are affected, check whether a recent org/team permission change revoked admin access unexpectedly.
5. No immediate action required unless correlated with user-reported issues.

### Error Cases & Failure Modes

| Error Case | HTTP Status | Detection | User-Facing Message |
|------------|-------------|-----------|---------------------|
| Invalid webhook ID format | 400 | Route handler `parseInt` fails | "invalid webhook id" |
| Webhook ID ≤ 0 | 400 | Service layer validation | "invalid webhook id" |
| No authentication | 401 | Auth middleware / service check | "authentication required" |
| Insufficient permissions | 403 | `requireAdminAccess` check | "permission denied" |
| Repository not found | 404 | `resolveRepoByOwnerAndName` returns null | "repository not found" |
| Webhook not found | 404 | `rowsAffected === 0` after DELETE | "webhook not found" |
| Database connection failure | 500 | SQL query throws | "internal server error" |
| Database timeout | 500 | SQL query times out | "internal server error" |

## Verification

### API Integration Tests

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|------------------|
| 1 | `DELETE webhook — success` | Create a webhook, then delete it by ID | `204 No Content`, empty body |
| 2 | `DELETE webhook — verify removal from list` | After successful deletion, `GET /api/repos/:owner/:repo/hooks` should not include the deleted webhook | Webhook absent from list |
| 3 | `DELETE webhook — verify GET returns 404` | After deletion, `GET /api/repos/:owner/:repo/hooks/:id` returns 404 | `404 Not Found` |
| 4 | `DELETE webhook — double delete returns 404` | Delete the same webhook twice; second attempt returns 404 | First: `204`, Second: `404` |
| 5 | `DELETE webhook — non-existent webhook ID` | Delete with an ID that was never created (e.g., `999999`) | `404 Not Found` |
| 6 | `DELETE webhook — invalid ID (string)` | `DELETE /api/repos/owner/repo/hooks/abc` | `400 Bad Request`, message "invalid webhook id" |
| 7 | `DELETE webhook — invalid ID (negative)` | `DELETE /api/repos/owner/repo/hooks/-1` | `400 Bad Request`, message "invalid webhook id" |
| 8 | `DELETE webhook — invalid ID (zero)` | `DELETE /api/repos/owner/repo/hooks/0` | `400 Bad Request`, message "invalid webhook id" |
| 9 | `DELETE webhook — invalid ID (float)` | `DELETE /api/repos/owner/repo/hooks/1.5` | `400 Bad Request` (parseInt yields `1`, so this may succeed — test documents actual behavior) |
| 10 | `DELETE webhook — unauthenticated` | Send DELETE without auth credentials | `401 Unauthorized` |
| 11 | `DELETE webhook — non-admin user` | Authenticate as a user with read-only access and attempt delete | `403 Forbidden` |
| 12 | `DELETE webhook — non-existent repository` | `DELETE /api/repos/nouser/norepo/hooks/1` | `404 Not Found` |
| 13 | `DELETE webhook — webhook belongs to different repo` | Create webhook on repo A, attempt to delete it via repo B's URL | `404 Not Found` (SQL scoping prevents cross-repo delete) |
| 14 | `DELETE webhook — org-owned repo, org owner` | Create webhook on an org-owned repo, delete as org owner | `204 No Content` |
| 15 | `DELETE webhook — org-owned repo, team admin` | Create webhook on an org-owned repo, delete as team member with admin permission | `204 No Content` |
| 16 | `DELETE webhook — org-owned repo, team writer` | Attempt delete as team member with write (not admin) permission | `403 Forbidden` |
| 17 | `DELETE webhook — case-insensitive owner/repo` | Delete webhook using differently-cased owner/repo in the URL | `204 No Content` (owner and repo resolution is case-insensitive) |
| 18 | `DELETE webhook — does not affect other webhooks` | Create two webhooks, delete one, verify the other still exists | Second webhook still present in list |
| 19 | `DELETE webhook — last webhook on repo` | Create one webhook, delete it, verify list returns empty array | `200 OK`, `[]` |
| 20 | `DELETE webhook — maximum valid ID` | `DELETE /api/repos/owner/repo/hooks/9223372036854775807` | `404 Not Found` (valid parse, webhook doesn't exist) |
| 21 | `DELETE webhook — ID exceeding max integer` | `DELETE /api/repos/owner/repo/hooks/99999999999999999999` | `400 Bad Request` or graceful handling |
| 22 | `DELETE webhook — request with body` | Send DELETE with a JSON body; body should be ignored | `204 No Content` (body ignored) |
| 23 | `DELETE webhook — verify delivery history inaccessible` | After deletion, `GET /api/repos/:owner/:repo/hooks/:id/deliveries` returns 404 | `404 Not Found` |
| 24 | `DELETE webhook — SQL injection attempt in ID` | `DELETE /api/repos/owner/repo/hooks/1;DROP%20TABLE%20webhooks` | `400 Bad Request` |

### CLI E2E Tests

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|------------------|
| 25 | `cli webhook delete — success` | `codeplane webhook delete <id> --repo owner/repo --yes` | Exit code `0`, JSON output `{ "status": "deleted", "id": <id> }` |
| 26 | `cli webhook delete — verify removed from list` | After delete, `codeplane webhook list --repo owner/repo` should not include the deleted webhook | Webhook absent |
| 27 | `cli webhook delete — non-existent ID` | `codeplane webhook delete 999999 --repo owner/repo --yes` | Exit code `1`, error message |
| 28 | `cli webhook delete — invalid ID (string)` | `codeplane webhook delete abc --repo owner/repo` | Exit code `1`, validation error from Zod coerce |
| 29 | `cli webhook delete — no repo flag, no jj remote` | Run `codeplane webhook delete 1` without `--repo` and outside a jj repo | Exit code `1`, error about missing repository |
| 30 | `cli webhook delete — repo auto-detection` | Run `codeplane webhook delete <id>` from within a jj repo directory | Exit code `0`, uses detected repo |

### Web UI E2E Tests (Playwright)

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|------------------|
| 31 | `web webhook delete — confirmation dialog` | Click Delete on a webhook row, verify confirmation dialog appears with webhook URL | Dialog visible, URL displayed |
| 32 | `web webhook delete — cancel` | Open confirmation dialog, click Cancel | Dialog closes, webhook still present |
| 33 | `web webhook delete — confirm` | Open confirmation dialog, click Delete webhook | Webhook row removed, toast "Webhook deleted." shown |
| 34 | `web webhook delete — loading state` | Click Delete webhook and verify button shows loading state | Button disabled with spinner during request |
| 35 | `web webhook delete — error toast` | Delete a webhook that was already deleted (simulate race) | Error toast with appropriate message |
| 36 | `web webhook delete — empty state after last delete` | Delete the only webhook, verify empty-state UI appears | Empty state message visible |
| 37 | `web webhook delete — non-admin cannot see delete button` | Log in as read-only user, navigate to webhook settings | Delete button not rendered or settings page not accessible |

### Config Sync Tests

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|------------------|
| 38 | `configsync removes webhook not in config` | Push `.codeplane/webhooks.yml` that omits a previously-configured webhook | Webhook deleted via `deleteWebhookByID` |
| 39 | `configsync handles already-deleted webhook` | Manually delete a webhook, then push config that also omits it | No error, idempotent reconciliation |
