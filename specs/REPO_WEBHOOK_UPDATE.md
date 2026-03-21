# REPO_WEBHOOK_UPDATE

Specification for REPO_WEBHOOK_UPDATE.

## High-Level User POV

When a repository administrator needs to modify an existing webhook — perhaps to change the delivery URL after migrating an integration endpoint, rotate the shared secret for security hygiene, adjust which repository events trigger notifications, or temporarily deactivate the webhook during maintenance — they update the webhook through Codeplane's API, CLI, or Web UI.

The administrator selects the webhook they want to modify and changes only the fields that need updating. Codeplane applies a partial-update model: any field left out of the update request remains unchanged. This means an administrator can rotate a secret without needing to re-specify the URL and events, or toggle a webhook on and off without touching any other configuration.

The same validation rules that govern webhook creation apply during updates. URLs must still use HTTPS, secrets are still encrypted before storage and redacted in responses, and the updated webhook continues to function exactly as before for any unchanged fields. The `updated_at` timestamp is refreshed to reflect the modification time, giving administrators a clear audit trail of when configuration last changed.

This feature is essential for the ongoing lifecycle management of webhook integrations. Without it, administrators would have to delete and re-create webhooks whenever a configuration change was needed — losing delivery history and requiring external systems to be re-pointed at a new webhook ID. Updating in place preserves continuity and history.

## Acceptance Criteria

- A repository administrator can update any existing webhook on a repository they have admin access to.
- The update uses HTTP `PATCH` semantics: only fields included in the request body are changed; omitted fields retain their current values.
- The webhook URL, if provided, must be a valid HTTPS URL (URLs that do not start with `https://` are rejected).
- The webhook URL, if provided, is trimmed of leading and trailing whitespace before validation.
- An empty or whitespace-only URL in an update request is rejected with a validation error specifying `{ resource: "Webhook", field: "url", code: "missing_field" }`.
- A non-HTTPS URL in an update request is rejected with a validation error specifying `{ resource: "Webhook", field: "url", code: "invalid" }`.
- The webhook secret, if provided, is encrypted before storage and is never returned in plaintext in any API response — it is always redacted as `"********"`.
- Providing an empty string as the secret effectively clears the secret (disables HMAC signing for future deliveries).
- The events array, if provided, replaces the current events list entirely (it is not merged or appended).
- The `is_active` boolean, if provided, updates the webhook's active state. Setting `is_active: false` pauses all future deliveries; setting `is_active: true` resumes them.
- Sending an empty JSON body `{}` (no fields) is accepted and returns the current webhook state unchanged (no-op update).
- On successful update, the server returns HTTP 200 with the full updated webhook object (id, repository_id, url, secret [redacted], events, is_active, last_delivery_at, created_at, updated_at).
- The `updated_at` timestamp is refreshed to the current time on every successful update, even if no values actually changed.
- Unauthenticated requests are rejected with HTTP 401 and message `"authentication required"`.
- Authenticated users who are not repository administrators are rejected with HTTP 403 and message `"permission denied"`.
- Requests with malformed JSON bodies are rejected with HTTP 400 and message `"invalid request body"`.
- Requests with a non-numeric or non-positive webhook ID in the URL path are rejected with HTTP 400 and message `"invalid webhook id"`.
- Requests targeting a webhook ID that does not exist or does not belong to the specified repository are rejected with HTTP 404 and message `"webhook not found"`.
- Requests targeting a repository that does not exist are rejected with HTTP 404 and message `"repository not found"`.
- The feature works identically through the API and CLI. Web UI is not yet implemented for webhook management.
- Updating a webhook does not trigger any deliveries and does not affect in-flight deliveries.
- The API response uses `snake_case` field names regardless of internal naming conventions.
- The URL maximum length constraint is 2048 characters.
- The secret maximum length constraint is 255 characters.
- The events array may contain at most 20 entries.
- Each event in the events array must be one of the recognized event types: `push`, `create`, `delete`, `landing_request`, `issues`, `issue_comment`, `status`, `workflow_run`, `release`, or the wildcard `"*"`.

## Design

### API Shape

**Endpoint:** `PATCH /api/repos/:owner/:repo/hooks/:id`

**Authentication:** Required. Session cookie, PAT (`Authorization: token <pat>`), or OAuth2 bearer token.

**Request Headers:**
- `Content-Type: application/json` (enforced by middleware)
- `Authorization: token <pat>` or session cookie

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | string | Repository owner (username or organization name). Case-insensitive. |
| `repo` | string | Repository name. Case-insensitive. |
| `id` | integer | Webhook ID. Must be a positive integer. |

**Request Body:**
```json
{
  "url": "https://new-endpoint.example.com/webhook",
  "secret": "new-rotated-secret",
  "events": ["push", "issues"],
  "is_active": false
}
```

All fields are optional. Only included fields are changed.

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `url` | string | No | Must start with `https://`. Trimmed before validation. Cannot be empty if provided. Max 2048 characters. |
| `secret` | string | No | Arbitrary string. Encrypted before storage. Empty string clears the secret. Max 255 characters. |
| `events` | string[] | No | Replaces current events list. Each element must be a recognized event type or `"*"`. Max 20 entries. |
| `is_active` | boolean | No | `true` to resume deliveries, `false` to pause them. |

**Success Response:** `200 OK`
```json
{
  "id": 42,
  "repository_id": "uuid-string",
  "url": "https://new-endpoint.example.com/webhook",
  "secret": "********",
  "events": ["push", "issues"],
  "is_active": false,
  "last_delivery_at": "2026-03-20T08:15:00.000Z",
  "created_at": "2026-03-18T12:00:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Malformed JSON body | `{ "message": "invalid request body" }` |
| 400 | Non-numeric or non-positive webhook ID | `{ "message": "invalid webhook id" }` |
| 401 | No authentication | `{ "message": "authentication required" }` |
| 403 | Not a repository admin | `{ "message": "permission denied" }` |
| 404 | Repository not found | `{ "message": "repository not found" }` |
| 404 | Webhook not found or does not belong to repo | `{ "message": "webhook not found" }` |
| 422 | Empty URL provided | `{ "message": "Validation Failed", "errors": [{ "resource": "Webhook", "field": "url", "code": "missing_field" }] }` |
| 422 | Non-HTTPS URL provided | `{ "message": "Validation Failed", "errors": [{ "resource": "Webhook", "field": "url", "code": "invalid" }] }` |

### SDK Shape

The `WebhookService.updateWebhook` method in `@codeplane/sdk` is the authoritative domain entry point:

```typescript
updateWebhook(
  actor: AuthUser | undefined,
  owner: string,
  repo: string,
  webhookId: number,
  input: UpdateWebhookInput
): Promise<UpdateRepoWebhookByOwnerAndRepoRow>
```

Where `UpdateWebhookInput` is:
```typescript
interface UpdateWebhookInput {
  url?: string;
  secret?: string;
  events?: string[];
  is_active?: boolean;
}
```

The method:
1. Validates the actor is authenticated. Returns 401 if not.
2. Validates the webhook ID is positive. Returns 400 if not.
3. Resolves the repository by owner and lower-cased name. Returns 404 if not found.
4. Verifies the actor has admin permission on the repository. Returns 403 if not.
5. Fetches the current webhook row. Returns 404 if not found.
6. For each provided field, applies validation (URL trimming, HTTPS check) and merges with the current value.
7. Encrypts the secret (if provided) via the configured `SecretCodec`.
8. Issues the SQL UPDATE with all final (merged) values.
9. Returns the updated row with the secret decrypted (the route layer re-redacts for API responses).

### CLI Command

```
codeplane webhook update <id> [options]
```

| Argument/Flag | Type | Required | Description |
|---------------|------|----------|-------------|
| `<id>` | integer | Yes | Webhook ID to update |
| `--url` | string | No | New webhook payload delivery URL |
| `--events` | string[] | No | New event types to subscribe to (replaces existing list) |
| `--secret-stdin` | boolean | No | Read the new webhook secret from stdin |
| `--active` | boolean | No | Set active state (`--active` / `--no-active`) |
| `--repo` | string | No | Repository in `OWNER/REPO` format (auto-detected if omitted) |

**Examples:**

```bash
# Change the URL
codeplane webhook update 42 --url https://new-endpoint.example.com/hook --repo alice/my-project

# Rotate the secret
echo "new-rotated-secret" | codeplane webhook update 42 --secret-stdin --repo alice/my-project

# Deactivate a webhook
codeplane webhook update 42 --no-active --repo alice/my-project

# Change subscribed events
codeplane webhook update 42 --events push --events issues --repo alice/my-project
```

**Output (JSON mode):**
```json
{
  "id": 42,
  "repository_id": "uuid-string",
  "url": "https://new.example.com/hook",
  "secret": "********",
  "events": ["push", "landing_request"],
  "is_active": true,
  "last_delivery_at": "2026-03-20T08:15:00.000Z",
  "created_at": "2026-03-18T12:00:00.000Z",
  "updated_at": "2026-03-22T14:30:00.000Z"
}
```

The CLI resolves the repository from `--repo` or the current directory's jj/git context via `resolveRepoRef`. When `--secret-stdin` is specified, the CLI reads from stdin and passes the value as the new secret (empty input clears the secret).

**Known CLI body-format mismatch:** The current CLI implementation wraps `url` and `secret` inside a `config` object (`body.config = { url, secret }`) before sending to the API, but the server-side `PATCH` handler expects `url` and `secret` as top-level fields. This mismatch should be corrected so the CLI sends the flat `PatchWebhookRequest` shape.

### Web UI Design

**Status:** Not yet implemented. Webhook management is currently API-first and CLI-first.

**Planned location:** `/:owner/:repo/settings/webhooks/:id/edit` — accessible from the webhook detail view within repository settings.

**Planned update flow:**

1. The user navigates to the webhook detail view and clicks an "Edit" or "Settings" button.
2. An edit form is displayed pre-populated with the webhook's current configuration:
   - **Payload URL** — text input pre-filled with the current URL.
   - **Secret** — password-style text input. Shows placeholder text ("Leave blank to keep current secret" or "Enter new secret to rotate"). A "Clear secret" option should be available.
   - **Events** — radio group showing the current selection:
     - "Just the push event"
     - "Send me everything"
     - "Let me select individual events" → checkbox grid pre-checked with current events
   - **Active** — checkbox reflecting current active state.
3. The user modifies desired fields and clicks "Update webhook".
4. On success, the user is redirected back to the webhook detail view with a success notification.
5. On validation error, inline error messages appear next to the offending field.

### Documentation

The following end-user documentation should exist:

1. **API Reference — Webhooks > Update a Webhook**: Document the `PATCH /api/repos/{owner}/{repo}/hooks/{id}` endpoint with request/response schemas, all field constraints, partial-update semantics, error codes, and `curl` examples for common operations (URL change, secret rotation, event update, deactivation).

2. **CLI Reference — `codeplane webhook update`**: Document the `<id>` argument, all flags, stdin secret reading, examples for each update scenario, and the partial-update behavior (only specified fields change).

3. **User Guide — Managing Webhooks**: Extend the existing webhook setup guide with a section on updating webhooks, covering URL migration, secret rotation best practices, temporarily deactivating webhooks, and adjusting event subscriptions.

## Permissions & Security

### Authorization Roles

| Role | Can Update Webhook? |
|------|-------------------|
| Repository Owner | Yes |
| Organization Owner (for org repos) | Yes |
| Team member with `admin` permission on the repository | Yes |
| Collaborator with `admin` permission | Yes |
| Collaborator with `write` permission | No (403) |
| Collaborator with `read` permission | No (403) |
| Authenticated user with no repository relationship | No (403) |
| Unauthenticated / anonymous | No (401) |

### Permission Resolution Order

1. Check if the actor is authenticated. If not, return 401.
2. Check if the actor is the repository's direct owner. If yes, grant admin.
3. If the repository belongs to an organization, check if the actor is an org owner. If yes, grant admin.
4. Check the actor's highest team permission for the repository. If `admin`, grant admin.
5. Check the actor's direct collaborator permission. If `admin`, grant admin.
6. If none of the above, return 403.

### Rate Limiting

- The global API rate limiter applies to webhook update requests.
- Webhook updates should be subject to a per-webhook rate limit of **30 updates per minute** to prevent runaway automation or configuration churn.
- This is more permissive than creation (which has a per-repo limit) because updates are a maintenance operation on an existing resource.
- Failed validation attempts (422) count toward rate limits.

### Data Privacy and Security

- **Secret handling**: Webhook secrets are encrypted before database storage using the configured `SecretCodec`. They are never logged, never included in error messages, and never returned in API responses (always redacted as `"********"`). During updates, the old secret is overwritten in place — it is not recoverable.
- **URL privacy**: Webhook URLs may contain tokens or path-based authentication. They should be treated as sensitive. Only admin-access endpoints return URL values.
- **No PII in payloads**: Webhook updates do not transmit PII beyond the actor's identity for authorization.
- **HTTPS enforcement**: Requiring HTTPS ensures payload data remains encrypted in transit when delivered.
- **Secret rotation**: The update endpoint is the primary mechanism for secret rotation. When a new secret is provided, it replaces the previous one immediately. There is no grace period where both old and new secrets are accepted. External systems must be updated before or simultaneously with the secret rotation.
- **Encryption at rest**: The `SecretCodec` interface ensures secrets are encrypted at rest. In CE with `NoopSecretCodec`, operators should be aware that secrets are stored in plaintext.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WebhookUpdated` | Webhook successfully updated | `webhook_id`, `repository_id`, `owner`, `repo`, `fields_changed` (array of field names that were provided: `["url", "secret", "events", "is_active"]`), `events_count` (new events count, if events changed), `has_secret_change` (boolean), `is_active` (new value, if changed), `source` (`api` \| `cli` \| `web`), `actor_id` |
| `WebhookUpdateFailed` | Webhook update rejected | `webhook_id` (if parsed), `repository_id` (if resolved), `owner`, `repo`, `failure_reason` (`auth`, `permission`, `not_found`, `validation_url`, `internal`), `source`, `actor_id` (if authenticated) |
| `WebhookDeactivated` | Webhook changed from active to inactive | `webhook_id`, `repository_id`, `owner`, `repo`, `actor_id`, `source` |
| `WebhookReactivated` | Webhook changed from inactive to active | `webhook_id`, `repository_id`, `owner`, `repo`, `actor_id`, `source` |
| `WebhookSecretRotated` | Webhook secret was changed (non-empty to non-empty) | `webhook_id`, `repository_id`, `owner`, `repo`, `actor_id`, `source` |

### Funnel Metrics

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| **Update success rate** | `WebhookUpdated / (WebhookUpdated + WebhookUpdateFailed)` | Should be >95%. Low rate indicates UX confusion about partial-update semantics |
| **Secret rotation frequency** | Count of `WebhookSecretRotated` events per week | Regular rotation indicates good security hygiene |
| **Deactivation rate** | `WebhookDeactivated / WebhookUpdated` | If >30%, may indicate webhook reliability issues causing users to turn off integrations |
| **Fields-per-update distribution** | Distribution of `fields_changed` array lengths | Single-field updates dominate = users understand partial update. Full-field updates dominate = users may be confused |
| **Reactivation turnaround** | Time between `WebhookDeactivated` and subsequent `WebhookReactivated` for the same webhook | Short turnaround = maintenance pauses. Long turnaround or no reactivation = abandoned integration |
| **CLI vs API distribution** | Breakdown of `source` property across updates | Informs where to invest UX improvements |

## Observability

### Structured Logging

| Log Point | Level | Context Fields | Description |
|-----------|-------|---------------|-------------|
| Webhook update initiated | `info` | `actor_id`, `owner`, `repo`, `webhook_id`, `fields_provided` (list of non-undefined fields) | Logged when the service method is entered |
| Webhook URL validation failed | `warn` | `actor_id`, `owner`, `repo`, `webhook_id`, `field: "url"`, `code` | Logged on 422 URL validation rejections |
| Webhook permission denied | `warn` | `actor_id`, `owner`, `repo`, `webhook_id` | Logged when a non-admin attempts update |
| Webhook not found | `info` | `actor_id`, `owner`, `repo`, `webhook_id` | Logged when the target webhook does not exist |
| Secret encryption failed | `error` | `owner`, `repo`, `webhook_id` (no secret material) | Logged when `SecretCodec.encryptString` throws |
| Webhook updated successfully | `info` | `actor_id`, `owner`, `repo`, `webhook_id`, `fields_changed`, `is_active` | Logged on successful update |
| Database update returned null | `error` | `owner`, `repo`, `webhook_id` | Logged when the SQL UPDATE returns no rows (race condition or data integrity issue) |

**Critical rule:** Never log the webhook URL in full (may contain auth tokens), never log the secret value (old or new), and never log the full request body.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_webhook_updates_total` | Counter | `status` (`success`, `validation_error`, `permission_denied`, `auth_error`, `not_found`, `internal_error`), `source` (`api`, `cli`, `web`) | Total webhook update attempts |
| `codeplane_webhook_update_duration_seconds` | Histogram | `status` | End-to-end latency of the update operation |
| `codeplane_webhook_secret_rotations_total` | Counter | — | Number of successful secret rotations |
| `codeplane_webhook_deactivations_total` | Counter | — | Number of webhooks deactivated via update |
| `codeplane_webhook_reactivations_total` | Counter | — | Number of webhooks reactivated via update |
| `codeplane_webhook_update_fields_count` | Histogram | — | Distribution of how many fields are changed per update |
| `codeplane_webhook_secret_encryption_errors_total` | Counter | — | Secret encryption failures during update |

### Alerts

#### Alert: `WebhookUpdateErrorRateHigh`
**Condition:** `rate(codeplane_webhook_updates_total{status="internal_error"}[5m]) > 0.1`
**Severity:** Critical
**Runbook:**
1. Check server logs for `error`-level messages containing "failed to encrypt webhook secret" or null database update results for the time period.
2. If encryption errors dominate, verify the `SecretCodec` configuration: is the encryption key available? Has it been rotated without updating the application? Check environment variables and secrets manager connectivity.
3. If database update-returning-null errors dominate, check for potential data integrity issues: does the webhook still exist? Has the repository been deleted or transferred mid-request? Run `SELECT * FROM webhooks WHERE id = <webhook_id>` to verify state.
4. Check database connectivity, connection pool saturation via `pg_stat_activity`, and recent schema migrations.
5. Verify the service registry is initializing `WebhookService` with the correct `Sql` instance.
6. If the issue is transient, check for lock contention on the `webhooks` table.

#### Alert: `WebhookUpdateLatencyHigh`
**Condition:** `histogram_quantile(0.95, rate(codeplane_webhook_update_duration_seconds_bucket[5m])) > 3`
**Severity:** Warning
**Runbook:**
1. Check database query latency — the update flow issues multiple queries (repo lookup, permission checks, current webhook fetch, update). Run `EXPLAIN ANALYZE` on the `updateRepoWebhookByOwnerAndRepo` query.
2. Check if the `SecretCodec` encryption step is slow (e.g., KMS call latency if using cloud-based encryption).
3. Check for database connection pool exhaustion via `pg_stat_activity`.
4. Check for lock contention — the update reads the current row then writes, which may conflict under concurrent updates to the same webhook.
5. Review recent traffic patterns: is a particular webhook being updated at very high frequency (possible automation loop)?

#### Alert: `WebhookMassDeactivationSpike`
**Condition:** `rate(codeplane_webhook_deactivations_total[15m]) > 5`
**Severity:** Warning
**Runbook:**
1. Check if a platform-wide issue (e.g., delivery failures, certificate problems) is causing administrators to mass-deactivate webhooks.
2. Review the `shouldDisableWebhook` auto-disable logic — if the system is auto-disabling webhooks due to consecutive failures, investigate the root cause of delivery failures.
3. Check external endpoint health: are multiple webhook target URLs returning errors simultaneously?
4. If a single actor is deactivating many webhooks, verify it's legitimate maintenance rather than a compromised account.

### Error Cases and Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Internal Action |
|-------------|-------------|---------------------|------------------|
| Unauthenticated request | 401 | "authentication required" | Log at `warn` level |
| Non-admin user | 403 | "permission denied" | Log at `warn` level |
| Repository not found | 404 | "repository not found" | Log at `info` level |
| Webhook not found (initial lookup) | 404 | "webhook not found" | Log at `info` level |
| Webhook not found (post-update, race condition) | 404 | "webhook not found" | Log at `error` level |
| Non-numeric webhook ID | 400 | "invalid webhook id" | Log at `info` level |
| Non-positive webhook ID (≤ 0) | 400 | "invalid webhook id" | Log at `info` level |
| Empty URL provided | 422 | Validation Failed (missing_field) | Log at `warn` level |
| Non-HTTPS URL provided | 422 | Validation Failed (invalid) | Log at `warn` level |
| Malformed JSON body | 400 | "invalid request body" | Log at `info` level |
| Secret encryption failure | 500 | "failed to encrypt webhook secret" | Log at `error`, fire alert |
| Database update failure | 500 | Internal server error | Log at `error`, fire alert |
| Database connection failure | 500 | Internal server error | Log at `error`, fire alert |

## Verification

### API Integration Tests

1. **Happy path: update URL only** — Create a webhook, then PATCH with `{ "url": "https://new.example.com/hook" }`. Assert 200, `url` is updated, `events`, `is_active`, and `secret` are unchanged from creation.

2. **Happy path: update secret only** — Create a webhook with a secret, then PATCH with `{ "secret": "new-secret" }`. Assert 200, `secret` is `"********"`, all other fields unchanged.

3. **Happy path: update events only** — Create a webhook with `events: ["push"]`, then PATCH with `{ "events": ["push", "issues", "release"] }`. Assert 200, `events` is `["push", "issues", "release"]`.

4. **Happy path: update is_active to false** — Create an active webhook, then PATCH with `{ "is_active": false }`. Assert 200, `is_active` is `false`.

5. **Happy path: update is_active to true** — Create an inactive webhook, then PATCH with `{ "is_active": true }`. Assert 200, `is_active` is `true`.

6. **Happy path: update all fields simultaneously** — Create a webhook, then PATCH with all four fields changed. Assert 200, all fields reflect the new values.

7. **Happy path: empty body is a no-op** — Create a webhook, note its state, then PATCH with `{}`. Assert 200, all fields are unchanged except `updated_at` which is refreshed.

8. **Happy path: updated_at is refreshed** — Create a webhook, note `updated_at`. Wait briefly, then PATCH with `{ "is_active": false }`. Assert 200, `updated_at` is later than the original.

9. **Happy path: created_at is NOT changed** — Create a webhook, note `created_at`. PATCH with any change. Assert `created_at` is identical.

10. **Happy path: last_delivery_at is preserved** — Create a webhook and trigger a test delivery (if delivery infrastructure is available). PATCH with a URL change. Assert `last_delivery_at` is unchanged.

11. **Happy path: events replace rather than merge** — Create a webhook with `events: ["push", "issues"]`, then PATCH with `{ "events": ["release"] }`. Assert `events` is exactly `["release"]`, not `["push", "issues", "release"]`.

12. **Happy path: URL with trailing whitespace is trimmed** — PATCH with `{ "url": "  https://example.com/hook  " }`. Assert 200 with `url` trimmed to `"https://example.com/hook"`.

13. **Happy path: clear events by setting empty array** — PATCH with `{ "events": [] }`. Assert 200, `events` is `[]` (wildcard behavior).

14. **Happy path: set wildcard event** — PATCH with `{ "events": ["*"] }`. Assert 200, `events` is `["*"]`.

15. **Happy path: URL at maximum length (2048 chars)** — PATCH with a valid HTTPS URL exactly 2048 characters long. Assert 200.

16. **Validation: reject empty URL** — PATCH with `{ "url": "" }`. Assert 422 with `field: "url"`, `code: "missing_field"`.

17. **Validation: reject whitespace-only URL** — PATCH with `{ "url": "   " }`. Assert 422 with `field: "url"`, `code: "missing_field"`.

18. **Validation: reject HTTP URL** — PATCH with `{ "url": "http://example.com/hook" }`. Assert 422 with `field: "url"`, `code: "invalid"`.

19. **Validation: reject non-URL string** — PATCH with `{ "url": "not-a-url" }`. Assert 422 with `field: "url"`, `code: "invalid"`.

20. **Validation: reject FTP URL** — PATCH with `{ "url": "ftp://example.com/hook" }`. Assert 422 with `field: "url"`, `code: "invalid"`.

21. **Auth: reject unauthenticated request** — PATCH without any auth credentials. Assert 401 with message "authentication required".

22. **Auth: reject non-admin collaborator** — Authenticate as a user with `write` (but not `admin`) permission on the repository. PATCH with any valid body. Assert 403 with message "permission denied".

23. **Auth: reject read-only collaborator** — Authenticate as a user with `read` permission. Assert 403.

24. **Auth: accept repo owner** — Authenticate as the repository owner. Assert 200.

25. **Auth: accept org owner on org repository** — Authenticate as an org owner for an org-owned repository. Assert 200.

26. **Auth: accept team admin on org repository** — Authenticate as a team member with `admin` permission on the repository. Assert 200.

27. **Not found: non-existent webhook ID** — PATCH with a webhook ID that does not exist. Assert 404 with message "webhook not found".

28. **Not found: webhook ID belongs to different repository** — Create a webhook on repo A, then PATCH it using repo B's path. Assert 404.

29. **Not found: non-existent repository** — PATCH to a repository path that does not exist. Assert 404 with message "repository not found".

30. **Not found: non-existent owner** — PATCH with a non-existent owner. Assert 404.

31. **Bad request: non-numeric webhook ID** — PATCH with `hooks/abc`. Assert 400 with message "invalid webhook id".

32. **Bad request: negative webhook ID** — PATCH with `hooks/-1`. Assert 400 with message "invalid webhook id".

33. **Bad request: zero webhook ID** — PATCH with `hooks/0`. Assert 400 (the service rejects ID ≤ 0).

34. **Bad request: malformed JSON body** — PATCH with invalid JSON (`{invalid`). Assert 400 with message "invalid request body".

35. **Secret: secret is never returned in plaintext after update** — Create a webhook, PATCH with `{ "secret": "my-new-secret" }`. Assert the response `secret` field is exactly `"********"`.

36. **Secret: clear secret by sending empty string** — Create a webhook with a secret, PATCH with `{ "secret": "" }`. Assert 200. (Secret effectively cleared.)

37. **Response format: all fields use snake_case** — PATCH a webhook and assert the response contains `repository_id`, `is_active`, `last_delivery_at`, `created_at`, `updated_at` (not camelCase).

38. **Concurrency: two updates to the same webhook** — Issue two PATCH requests concurrently to the same webhook with different URLs. Assert both return 200 and the final state reflects one of the two URLs (last-write-wins).

39. **Idempotency: updating to same value succeeds** — PATCH with the same URL the webhook already has. Assert 200 (no-op on value but `updated_at` refreshed).

40. **URL with query parameters** — PATCH with `{ "url": "https://example.com/hook?token=abc&repo=xyz" }`. Assert 200 with URL preserved exactly.

### CLI Integration Tests

41. **CLI happy path: update URL** — Run `codeplane webhook update 42 --url https://new.example.com/hook --repo OWNER/REPO`. Assert exit code 0, JSON output shows updated URL.

42. **CLI: rotate secret from stdin** — Pipe secret via stdin: `echo "new-secret" | codeplane webhook update 42 --secret-stdin --repo OWNER/REPO`. Assert exit code 0, `secret` is `"********"`.

43. **CLI: deactivate webhook** — Run `codeplane webhook update 42 --no-active --repo OWNER/REPO`. Assert exit code 0, `is_active` is `false`.

44. **CLI: reactivate webhook** — Run `codeplane webhook update 42 --active --repo OWNER/REPO`. Assert exit code 0, `is_active` is `true`.

45. **CLI: update events** — Run `codeplane webhook update 42 --events push --events issues --repo OWNER/REPO`. Assert exit code 0, events array is `["push", "issues"]`.

46. **CLI: update URL and secret together** — Run `echo "s" | codeplane webhook update 42 --url https://new.example.com --secret-stdin --repo OWNER/REPO`. Assert exit code 0, URL is updated.

47. **CLI: view after update shows changes** — Update a webhook URL via CLI, then run `codeplane webhook view 42 --repo OWNER/REPO`. Assert the view output shows the new URL.

48. **CLI: missing webhook ID argument** — Run `codeplane webhook update --url https://example.com`. Assert non-zero exit code with a usage error.

49. **CLI: repo resolution from current directory** — From a directory with a jj/git repo linked to Codeplane, run `codeplane webhook update 42 --url https://example.com`. Assert the webhook is updated on the correct repository without `--repo`.

### Cross-Client Consistency Tests

50. **API→CLI roundtrip: update via API, view via CLI** — Update a webhook via direct API PATCH, then view it via `codeplane webhook view`. Assert the webhook details match the API update.

51. **CLI→API roundtrip: update via CLI, view via API** — Update a webhook via CLI, then GET the webhook via direct API call. Assert the webhook reflects the CLI update.

52. **Functional continuity: webhook delivers after URL update** — Create a webhook subscribed to `push` with URL A. Update to URL B. Trigger a push event. Assert the delivery targets URL B (visible in delivery history).

53. **Functional continuity: inactive webhook does not deliver** — Create an active webhook. Update `is_active` to `false`. Trigger a push event. Assert no new delivery is created for that webhook.

54. **Functional continuity: reactivated webhook delivers** — Deactivate a webhook, then reactivate it. Trigger a push event. Assert a delivery is created.
