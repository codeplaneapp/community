# REPO_WEBHOOK_CREATE

Specification for REPO_WEBHOOK_CREATE.

## High-Level User POV

When a repository administrator needs to connect their Codeplane repository to an external service — such as a CI pipeline, deployment platform, issue tracker, or monitoring system — they create a webhook. A webhook listens for specific events that happen in the repository (like code pushes, issue creation, landing request activity, or releases) and automatically sends a real-time HTTP notification to an external URL whenever one of those events occurs.

The administrator navigates to the repository's settings, opens the Webhooks section, and fills out a simple form: the destination URL where payloads should be delivered, an optional shared secret for verifying that deliveries truly came from Codeplane, and which repository events should trigger a notification. They can also choose whether the webhook should start active immediately or be created in an inactive state for later activation.

Once created, the webhook begins listening. Every time a subscribed event fires, Codeplane constructs a JSON payload describing what happened and sends it to the configured URL. If a secret was provided, Codeplane signs each delivery with HMAC-SHA256 so the receiving server can cryptographically verify authenticity. The administrator can confirm everything is working by checking the delivery history, which shows success or failure status for each attempt.

This feature is the foundational building block for all outbound repository integrations. Without webhook creation, no external system can be notified of repository activity in real time. It is available through the Web UI settings page, the CLI, and the HTTP API, giving administrators flexibility to set up integrations through whichever interface best fits their workflow.

## Acceptance Criteria

- A repository administrator can create a new webhook for any repository they have admin access to.
- The webhook URL is required and must be a valid HTTPS URL (URLs that do not start with `https://` are rejected).
- The webhook URL is trimmed of leading and trailing whitespace before validation.
- An empty or whitespace-only URL is rejected with a validation error specifying `{ resource: "Webhook", field: "url", code: "missing_field" }`.
- A non-HTTPS URL is rejected with a validation error specifying `{ resource: "Webhook", field: "url", code: "invalid" }`.
- The webhook secret is optional. When provided, it is encrypted before storage and is never returned in plaintext in any API response — it is always redacted as `"********"`.
- The events array is optional. When omitted or empty, the webhook subscribes to all events (wildcard behavior).
- Each event in the events array must be one of the recognized event types: `push`, `create`, `delete`, `landing_request`, `issues`, `issue_comment`, `status`, `workflow_run`, `release`. Additionally, `["*"]` subscribes to all events.
- The `is_active` / `active` boolean is required. It determines whether the webhook begins receiving deliveries immediately.
- A maximum of 20 webhooks may exist per repository. Attempting to create a 21st webhook is rejected with a validation error specifying `{ resource: "Webhook", field: "repository_id", code: "invalid" }`.
- On successful creation, the server returns HTTP 201 with the full webhook object (id, repository_id, url, secret [redacted], events, is_active, last_delivery_at, created_at, updated_at).
- The returned webhook ID is a unique numeric identifier that can be used for subsequent view, update, delete, and test-delivery operations.
- Unauthenticated requests are rejected with HTTP 401 and message "authentication required".
- Authenticated users who are not repository administrators are rejected with HTTP 403 and message "permission denied".
- Requests with malformed JSON bodies are rejected with HTTP 400 and message "invalid request body".
- The feature works identically through the API, CLI, and Web UI.
- Creating a webhook does not trigger any deliveries — the webhook begins listening for future events only.
- The CLI `webhook create` command supports `--url`, `--events` (repeatable or comma-separated), `--secret-stdin`, `--content-type`, `--active`, and `--repo` flags.
- The CLI reads the secret from stdin when `--secret-stdin` is specified, supporting piped input and allowing empty secrets.
- The API response uses `snake_case` field names regardless of internal naming conventions.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/hooks`

**Authentication:** Required. Session cookie, PAT (`Authorization: token <pat>`), or OAuth2 bearer token.

**Request Headers:**
- `Content-Type: application/json` (enforced by middleware)
- `Authorization: token <pat>` or session cookie

**Request Body:**
```json
{
  "url": "https://example.com/webhook",
  "secret": "my-shared-secret",
  "events": ["push", "landing_request"],
  "is_active": true
}
```

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `url` | string | Yes | — | Must start with `https://`. Trimmed before validation. Cannot be empty. |
| `secret` | string | No | `""` | Arbitrary string. Encrypted before storage. |
| `events` | string[] | No | `[]` (all events) | Each element must be a recognized event type or `"*"`. |
| `is_active` | boolean | Yes | — | `true` to start receiving deliveries immediately. |

**Success Response:** `201 Created`
```json
{
  "id": 42,
  "repository_id": "uuid-string",
  "url": "https://example.com/webhook",
  "secret": "********",
  "events": ["push", "landing_request"],
  "is_active": true,
  "last_delivery_at": null,
  "created_at": "2026-03-22T12:00:00.000Z",
  "updated_at": "2026-03-22T12:00:00.000Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Malformed JSON body | `{ "message": "invalid request body" }` |
| 401 | No authentication | `{ "message": "authentication required" }` |
| 403 | Not a repository admin | `{ "message": "permission denied" }` |
| 404 | Repository not found | `{ "message": "repository not found" }` |
| 422 | Empty URL | `{ "message": "Validation Failed", "errors": [{ "resource": "Webhook", "field": "url", "code": "missing_field" }] }` |
| 422 | Non-HTTPS URL | `{ "message": "Validation Failed", "errors": [{ "resource": "Webhook", "field": "url", "code": "invalid" }] }` |
| 422 | Max webhooks reached (20) | `{ "message": "Validation Failed", "errors": [{ "resource": "Webhook", "field": "repository_id", "code": "invalid" }] }` |

### SDK Shape

The `WebhookService.createWebhook` method in `@codeplane/sdk` is the authoritative domain entry point:

```typescript
createWebhook(
  actor: AuthUser | undefined,
  owner: string,
  repo: string,
  input: CreateWebhookInput
): Promise<CreateWebhookRow>
```

Where `CreateWebhookInput` is:
```typescript
interface CreateWebhookInput {
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
}
```

The method:
1. Validates the actor is authenticated.
2. Trims and validates the URL (non-empty, HTTPS).
3. Resolves the repository by owner and lower-cased name.
4. Verifies the actor has admin permission on the repository.
5. Counts existing webhooks and rejects if >= 20.
6. Encrypts the secret via the configured `SecretCodec`.
7. Inserts the webhook row.
8. Returns the created row with the secret decrypted (the route layer re-redacts for API responses).

### CLI Command

```
codeplane webhook create [options]
```

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--url` | string | Yes | — | Webhook payload delivery URL |
| `--events` | string[] | No | `["push"]` | Event types to subscribe to (repeatable) |
| `--secret-stdin` | boolean | No | `false` | Read the webhook secret from stdin |
| `--content-type` | `"json"` \| `"form"` | No | `"json"` | Payload content type |
| `--active` | boolean | No | `true` | Whether the webhook is active |
| `--repo` | string | No | auto-detect | Repository in `OWNER/REPO` format |

**Example:**
```bash
echo "my-secret" | codeplane webhook create \
  --url https://example.com/hook \
  --events push \
  --events landing_request \
  --secret-stdin \
  --repo alice/my-project
```

**Output (JSON mode):**
```json
{
  "id": 42,
  "url": "https://example.com/hook",
  "events": ["push", "landing_request"],
  "is_active": true,
  "secret": "********",
  "created_at": "2026-03-22T12:00:00.000Z",
  "updated_at": "2026-03-22T12:00:00.000Z"
}
```

The CLI resolves the repository from `--repo` or the current directory's jj/git context via `resolveRepoRef`. When `--secret-stdin` is specified, the CLI reads from stdin and passes the value as the secret (empty input is allowed, resulting in no secret).

### Web UI Design

**Location:** `/:owner/:repo/settings/webhooks` — accessible from the repository settings sidebar under "Webhooks".

**Webhook Creation Flow:**

1. The user clicks an "Add webhook" button on the webhooks settings page.
2. A creation form is displayed with the following fields:
   - **Payload URL** — text input with `https://` placeholder. Validated client-side to require HTTPS.
   - **Content type** — dropdown defaulting to `application/json`.
   - **Secret** — password-style text input (masked). Optional. Accompanied by helper text explaining HMAC-SHA256 signing.
   - **Events** — radio group offering:
     - "Just the push event" (default)
     - "Send me everything"
     - "Let me select individual events" → expands a checkbox grid of event types with descriptive labels
   - **Active** — checkbox, checked by default. Label: "We will deliver event details when this hook is triggered."
3. The user clicks "Add webhook" to submit.
4. On success, the user is redirected to the webhook detail view showing the newly created webhook and its empty delivery history.
5. On validation error, inline error messages appear next to the offending field (e.g., "URL must use HTTPS" below the URL input).
6. If the per-repository limit of 20 is reached, the "Add webhook" button is disabled with a tooltip explaining the limit.

### Documentation

The following end-user documentation should exist:

1. **API Reference — Webhooks > Create a Webhook**: Document the `POST /api/repos/{owner}/{repo}/hooks` endpoint with request/response schemas, all field constraints, error codes, and a `curl` example. This exists at `docs/api-reference/webhooks.mdx` and should remain the canonical API reference.

2. **CLI Reference — `codeplane webhook create`**: Document all flags, defaults, stdin secret reading, and example invocations including piped secrets and multi-event subscriptions.

3. **User Guide — Setting Up Webhooks**: A conceptual guide explaining what webhooks are, when to use them, the supported event types with descriptions of what triggers each event, how HMAC-SHA256 signing works, and a step-by-step walkthrough of creating a webhook through the Web UI.

4. **User Guide — Webhook Security**: A focused guide on configuring and verifying webhook secrets, with code examples in JavaScript, Python, Go, and Ruby for signature verification using timing-safe comparison.

## Permissions & Security

### Authorization Roles

| Role | Can Create Webhook? |
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

- The global API rate limiter applies to webhook creation requests.
- Webhook creation should be subject to a stricter per-repository rate limit of **10 creates per minute** to prevent abuse (e.g., automated scripts flooding the creation endpoint).
- Failed validation attempts (422) count toward rate limits but at a lower weight.

### Data Privacy and Security

- **Secret handling**: Webhook secrets are encrypted before database storage using the configured `SecretCodec`. They are never logged, never included in error messages, and never returned in API responses (always redacted as `"********"`).
- **URL privacy**: Webhook URLs may contain tokens or path-based authentication. They should be treated as sensitive and excluded from public API responses (webhook list/detail endpoints already require admin access).
- **No PII in payloads**: Webhook creation itself does not transmit PII beyond the actor's identity for authorization. The URL and secret are user-provided configuration, not personal data.
- **HTTPS enforcement**: Requiring HTTPS for webhook URLs ensures payload data is encrypted in transit when delivered.
- **Encryption at rest**: The `SecretCodec` interface ensures secrets are encrypted at rest. In CE with `NoopSecretCodec`, operators should be aware that secrets are stored in plaintext and should apply database-level encryption.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WebhookCreated` | Webhook successfully created | `webhook_id`, `repository_id`, `owner`, `repo`, `events_count`, `events_list`, `has_secret` (boolean), `is_active` (boolean), `source` (`api` | `cli` | `web`), `actor_id` |
| `WebhookCreateFailed` | Webhook creation rejected | `repository_id` (if resolved), `owner`, `repo`, `failure_reason` (`auth`, `permission`, `validation_url`, `validation_limit`, `internal`), `source`, `actor_id` (if authenticated) |

### Funnel Metrics

| Metric | Definition | Success Indicator |
|--------|-----------|-------------------|
| **Webhook adoption rate** | % of repositories with >=1 webhook | Growing over time indicates platform integration value |
| **Create success rate** | `WebhookCreated / (WebhookCreated + WebhookCreateFailed)` | Should be >90%. Low rate indicates UX or documentation issues |
| **Time to first delivery** | Time from `WebhookCreated` to first successful delivery for that webhook | <5 minutes indicates the setup-to-value loop is tight |
| **Multi-event subscription rate** | % of created webhooks with >1 event type | Indicates users are leveraging the event system deeply |
| **Secret adoption rate** | % of created webhooks with `has_secret: true` | Should be high — low rate indicates security education gap |
| **CLI vs Web vs API distribution** | Breakdown of `source` property across creates | Informs where to invest UX improvements |

## Observability

### Structured Logging

| Log Point | Level | Context Fields | Description |
|-----------|-------|---------------|-------------|
| Webhook creation initiated | `info` | `actor_id`, `owner`, `repo`, `url_domain` (domain only, not full URL) | Logged when the service method is entered |
| Webhook validation failed | `warn` | `actor_id`, `owner`, `repo`, `field`, `code` | Logged on 422 validation rejections |
| Webhook permission denied | `warn` | `actor_id`, `owner`, `repo` | Logged when a non-admin attempts creation |
| Webhook limit exceeded | `warn` | `actor_id`, `owner`, `repo`, `current_count` | Logged when the 20-webhook cap is hit |
| Secret encryption failed | `error` | `owner`, `repo` (no secret material) | Logged when `SecretCodec.encryptString` throws |
| Webhook created successfully | `info` | `actor_id`, `owner`, `repo`, `webhook_id`, `events_count`, `is_active` | Logged on successful insertion |
| Database insertion failed | `error` | `owner`, `repo`, `error_message` | Logged when the SQL insert returns null/throws |

**Critical rule:** Never log the webhook URL in full (may contain auth tokens), never log the secret value, and never log request body contents at info level or below.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_webhook_creates_total` | Counter | `status` (`success`, `validation_error`, `permission_denied`, `auth_error`, `internal_error`), `source` (`api`, `cli`, `web`) | Total webhook creation attempts |
| `codeplane_webhook_create_duration_seconds` | Histogram | `status` | End-to-end latency of the create operation |
| `codeplane_webhooks_per_repo` | Histogram | — | Distribution of webhook counts per repository (sampled on creation) |
| `codeplane_webhook_secret_encryption_errors_total` | Counter | — | Secret encryption failures |
| `codeplane_webhooks_active_total` | Gauge | — | Total number of active webhooks across all repositories |

### Alerts

#### Alert: `WebhookCreateErrorRateHigh`
**Condition:** `rate(codeplane_webhook_creates_total{status="internal_error"}[5m]) > 0.1`
**Severity:** Critical
**Runbook:**
1. Check the server logs for `error`-level messages containing "failed to create webhook" or "failed to encrypt webhook secret".
2. If encryption errors dominate, verify the `SecretCodec` configuration: is the encryption key available? Has it been rotated? Check environment variables and secrets manager connectivity.
3. If database insertion errors dominate, check database connectivity, disk space, and whether the `webhooks` table has hit any storage or constraint limits.
4. Check recent deployments for schema migrations that might have altered the `webhooks` table.
5. Verify the service registry is initializing `WebhookService` with the correct `Sql` instance.

#### Alert: `WebhookCreateLatencyHigh`
**Condition:** `histogram_quantile(0.95, rate(codeplane_webhook_create_duration_seconds_bucket[5m])) > 2`
**Severity:** Warning
**Runbook:**
1. Check database query latency — the create flow issues multiple queries (repo lookup, permission checks, count, insert). Run `EXPLAIN ANALYZE` on each.
2. Check if the `SecretCodec` encryption step is slow (e.g., KMS call latency if using cloud-based encryption).
3. Check for database connection pool exhaustion via `pg_stat_activity`.
4. Review if the `countWebhooksByRepo` query is missing an index on `repository_id`.

#### Alert: `WebhookLimitExceededSpike`
**Condition:** `rate(codeplane_webhook_creates_total{status="validation_error"}[15m]) > 1` with label matching on limit-exceeded errors
**Severity:** Info
**Runbook:**
1. Identify which repositories are hitting the 20-webhook limit via logs.
2. Assess whether the limit should be raised or whether users need guidance on consolidating webhooks.
3. Check for potential abuse — a single actor repeatedly hitting the limit may be scripting against the API.

### Error Cases and Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Internal Action |
|-------------|-------------|---------------------|------------------|
| Unauthenticated request | 401 | "authentication required" | Log at `warn` level |
| Non-admin user | 403 | "permission denied" | Log at `warn` level |
| Repository not found | 404 | "repository not found" | Log at `info` level |
| Empty URL | 422 | Validation Failed (missing_field) | Log at `warn` level |
| Non-HTTPS URL | 422 | Validation Failed (invalid) | Log at `warn` level |
| Webhook limit reached | 422 | Validation Failed (invalid on repository_id) | Log at `warn` level with current count |
| Malformed JSON | 400 | "invalid request body" | Log at `info` level |
| Secret encryption failure | 500 | "failed to encrypt webhook secret" | Log at `error`, fire alert |
| Database insert failure | 500 | "failed to create webhook" | Log at `error`, fire alert |
| Database connection failure | 500 | Internal server error | Log at `error`, fire alert |

## Verification

### API Integration Tests

1. **Happy path: create a webhook with all fields** — POST with valid HTTPS URL, secret, events `["push", "landing_request"]`, `is_active: true`. Assert 201, returned object has numeric `id`, `url` matches input, `secret` is `"********"`, `events` matches input, `is_active` is `true`, `last_delivery_at` is `null`, `created_at` and `updated_at` are valid ISO timestamps.

2. **Happy path: create a webhook with minimal fields** — POST with only `url` (HTTPS) and `is_active: true`, omitting secret and events. Assert 201, `events` defaults to `[]`, `secret` is `"********"` (or empty-redacted).

3. **Happy path: create a webhook with empty events array** — POST with `events: []`. Assert 201, `events` is `[]` (wildcard behavior).

4. **Happy path: create a webhook with all event types** — POST with `events: ["push", "create", "delete", "landing_request", "issues", "issue_comment", "status", "workflow_run", "release"]`. Assert 201, all events are stored correctly.

5. **Happy path: create a webhook with wildcard event** — POST with `events: ["*"]`. Assert 201.

6. **Happy path: create a webhook in inactive state** — POST with `is_active: false`. Assert 201, `is_active` is `false`.

7. **Happy path: create webhook and verify it appears in list** — Create a webhook, then GET the webhooks list. Assert the new webhook ID appears in the list.

8. **Validation: reject empty URL** — POST with `url: ""`. Assert 422 with `field: "url"`, `code: "missing_field"`.

9. **Validation: reject whitespace-only URL** — POST with `url: "   "`. Assert 422 with `field: "url"`, `code: "missing_field"`.

10. **Validation: reject HTTP URL** — POST with `url: "http://example.com/hook"`. Assert 422 with `field: "url"`, `code: "invalid"`.

11. **Validation: reject non-URL string** — POST with `url: "not-a-url"`. Assert 422 with `field: "url"`, `code: "invalid"`.

12. **Validation: reject FTP URL** — POST with `url: "ftp://example.com/hook"`. Assert 422.

13. **Validation: accept URL with trailing whitespace** — POST with `url: "  https://example.com/hook  "`. Assert 201 with `url` trimmed to `"https://example.com/hook"`.

14. **Limit: create 20 webhooks successfully** — Create 20 webhooks in sequence. Assert each returns 201.

15. **Limit: reject 21st webhook** — After creating 20 webhooks, attempt to create a 21st. Assert 422 with `field: "repository_id"`, `code: "invalid"`.

16. **Auth: reject unauthenticated request** — POST without any auth credentials. Assert 401 with message "authentication required".

17. **Auth: reject non-admin collaborator** — Authenticate as a user with `write` (but not `admin`) permission on the repository. Assert 403 with message "permission denied".

18. **Auth: reject read-only collaborator** — Authenticate as a user with `read` permission. Assert 403.

19. **Auth: accept org owner on org repository** — Authenticate as an org owner. Assert 201.

20. **Auth: accept team admin on org repository** — Authenticate as a team member with `admin` permission on the repository. Assert 201.

21. **Repo: reject non-existent repository** — POST to a repository path that does not exist. Assert 404 with message "repository not found".

22. **Repo: reject non-existent owner** — POST with a non-existent owner. Assert 404.

23. **Body: reject malformed JSON** — POST with invalid JSON body (`{invalid`). Assert 400 with message "invalid request body".

24. **Body: reject non-JSON content type** — POST with `Content-Type: text/plain`. Assert 400 (enforced by middleware).

25. **Secret: secret is never returned in plaintext** — Create a webhook with `secret: "my-secret-value"`. Assert the response `secret` field is exactly `"********"`, not `"my-secret-value"`.

26. **Secret: empty secret is accepted** — Create a webhook with `secret: ""`. Assert 201.

27. **Idempotency: creating two webhooks with the same URL is allowed** — Create two webhooks with identical URLs. Assert both return 201 with distinct `id` values.

28. **Response format: all fields use snake_case** — Create a webhook and assert the response contains `repository_id`, `is_active`, `last_delivery_at`, `created_at`, `updated_at` (not camelCase).

29. **URL with long path** — POST with a valid HTTPS URL of 2048 characters. Assert 201 (URL within reasonable bounds).

30. **URL with query parameters** — POST with `url: "https://example.com/hook?token=abc&repo=xyz"`. Assert 201 with URL preserved exactly.

### CLI Integration Tests

31. **CLI happy path: create via CLI** — Run `codeplane webhook create --url https://example.com/hook --events push --active --repo OWNER/REPO`. Assert exit code 0, JSON output contains `id`, `url`, `events`, `is_active`.

32. **CLI: secret from stdin** — Pipe secret via stdin: `echo "my-secret" | codeplane webhook create --url https://example.com/hook --secret-stdin --repo OWNER/REPO`. Assert exit code 0, `secret` is `"********"`.

33. **CLI: empty secret from stdin** — Pipe empty input: `echo -n "" | codeplane webhook create --url https://example.com/hook --secret-stdin --repo OWNER/REPO`. Assert exit code 0.

34. **CLI: multiple events** — Run with `--events push --events issues --events release`. Assert the created webhook's `events` array contains all three.

35. **CLI: default events is push** — Run without `--events`. Assert `events` defaults to `["push"]`.

36. **CLI: default active is true** — Run without `--active`. Assert `is_active` is `true`.

37. **CLI: repo resolution from current directory** — Run from a directory with a jj/git repo linked to Codeplane. Assert the webhook is created on the correct repository without `--repo`.

38. **CLI: missing required --url flag** — Run without `--url`. Assert non-zero exit code with a usage error.

39. **CLI: create then list shows webhook** — Create a webhook, then run `codeplane webhook list`. Assert the created webhook appears in the list output.

### End-to-End (Playwright) UI Tests

40. **UI: navigate to webhook settings** — Navigate to `/:owner/:repo/settings/webhooks`. Assert the webhooks page loads with an "Add webhook" button visible.

41. **UI: create webhook via form** — Fill in URL, select events, provide a secret, leave active checked, submit. Assert redirect to the webhook detail view, success toast/notification, and the webhook appears in the list.

42. **UI: inline validation for empty URL** — Submit the form with an empty URL field. Assert an inline error message appears without a page reload.

43. **UI: inline validation for HTTP URL** — Enter an `http://` URL and submit. Assert an inline error message about HTTPS requirement.

44. **UI: event selection — individual events** — Select "Let me select individual events", check `push` and `issues`, submit. Assert the created webhook has exactly those two events.

45. **UI: event selection — all events** — Select "Send me everything", submit. Assert the created webhook has wildcard event subscription.

46. **UI: add webhook button disabled at limit** — In a repository with 20 webhooks, assert the "Add webhook" button is disabled and a tooltip or message explains the limit.

47. **UI: permission gate — non-admin cannot see webhook settings** — Log in as a non-admin collaborator and navigate to repository settings. Assert the Webhooks nav item is either hidden or the page shows a permission error.

### Cross-Client Consistency Tests

48. **API-CLI roundtrip: create via API, view via CLI** — Create a webhook via direct API call, then view it via `codeplane webhook view`. Assert the webhook details match.

49. **CLI-API roundtrip: create via CLI, list via API** — Create a webhook via CLI, then list webhooks via direct API GET. Assert the webhook appears.

50. **Webhook is functional after creation: push event dispatches delivery** — Create a webhook subscribed to `push`, trigger a push event (via internal push-events endpoint), then check delivery history. Assert at least one delivery with `event_type: "push"` exists.
