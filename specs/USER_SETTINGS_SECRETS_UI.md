# USER_SETTINGS_SECRETS_UI

Specification for USER_SETTINGS_SECRETS_UI.

## High-Level User POV

When you navigate to your Codeplane settings, you find a "Secrets" page alongside your other account management surfaces — Profile, Emails, SSH Keys, Tokens, and so on. User-scoped secrets are personal, encrypted credentials that follow you across all your repositories, workspaces, and workflows. Unlike repository secrets, which belong to a single repository and are only available within that repository's context, user secrets are tied to your account and are automatically available in any workspace you create, any workflow you dispatch where your identity is the actor, and any agent session running under your credentials.

The user secrets page shows you a list of your currently configured secrets — their names, when they were created, and when they were last updated — but never the actual values. You can add a new secret by providing a name and a value, update an existing secret by setting it again with the same name, or delete secrets you no longer need. The interface makes it clear that secret values are write-only: once saved, Codeplane encrypts the value at rest and you can never retrieve it through any surface. If you need to change a secret, you replace it with a new value.

This feature matters because many developers have personal credentials — their own API keys for external services, signing keys, personal deploy tokens — that they need in multiple repositories and workspaces. Without user-scoped secrets, they would need to duplicate the same secret into every repository, manage rotation across dozens of settings pages, and risk inconsistency. With user secrets, you set a credential once in your account settings and it is available everywhere Codeplane can inject secrets on your behalf.

From the CLI, `codeplane secret list --scope user` and `codeplane secret set --scope user` manage these same user-level secrets. The TUI settings screen includes a Secrets tab with the same list and management capabilities. The user secrets page in the web UI, the CLI, and the TUI all enforce the same validation rules and security boundaries because they all delegate to the same API and service layer.

User secrets are private to you. No other user, organization admin, or repository collaborator can see or access your user-level secrets. They are strictly personal credentials under your sole control.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users can navigate to `/settings/secrets` and see a list of their user-scoped secrets.
- [ ] The settings sidebar includes a "Secrets" navigation item between "Connected Accounts" and "Notifications".
- [ ] Users can create a new user secret by providing a valid name and value.
- [ ] Users can update an existing user secret by setting it again with the same name (upsert semantics).
- [ ] Users can delete a user secret.
- [ ] Secret values are never displayed in the UI, CLI output, TUI, or API response after creation.
- [ ] Secret values are encrypted at rest using AES-256-GCM with the server-managed `CODEPLANE_SECRET_KEY`.
- [ ] The user settings home page (`/settings`) includes a "Secrets" summary card showing the user's secret count.
- [ ] The CLI supports `codeplane secret list --scope user`, `codeplane secret set --scope user`, and `codeplane secret delete --scope user`.
- [ ] The TUI settings screen includes a Secrets tab.
- [ ] All acceptance criteria pass verification via automated E2E tests.
- [ ] Observability instrumentation (logging, metrics) is in place.

### Name Validation

- [ ] Name must not be empty or whitespace-only.
- [ ] Name must match the pattern `^[a-zA-Z_][a-zA-Z0-9_]*$` (starts with letter or underscore, followed by alphanumeric characters or underscores).
- [ ] Name maximum length is 255 characters.
- [ ] Name is stored with leading/trailing whitespace trimmed.
- [ ] Names are case-sensitive: `API_KEY` and `api_key` are distinct secrets.
- [ ] Names containing hyphens (`MY-SECRET`), dots (`my.secret`), spaces, or starting with a digit (`1_SECRET`) are rejected with a validation error.

### Value Validation

- [ ] Value must not be empty (zero-length string).
- [ ] Value maximum size is 64 KiB (65,536 bytes).
- [ ] Value may contain any bytes — it is treated as an opaque string up to the size limit.
- [ ] A value consisting only of whitespace is accepted (it is non-empty).

### Upsert Behavior

- [ ] Creating a secret with a name that does not exist yields a new record. HTTP response is `201 Created`.
- [ ] Creating a secret with a name that already exists replaces the encrypted value and updates `updated_at`. HTTP response is `201 Created`.
- [ ] The `created_at` timestamp is preserved on update.
- [ ] Concurrent upserts for the same (user, name) pair must not result in data corruption.

### List Behavior

- [ ] List response includes metadata (id, name, timestamps) but never the encrypted or plaintext secret value.
- [ ] Secrets are returned sorted by name in ascending lexicographic order (case-sensitive ASCII).
- [ ] User-scoped: list returns only secrets belonging to the authenticated user.
- [ ] All secrets returned in a single response — no pagination.
- [ ] Empty list returns `[]`, not an error.

### Delete Behavior

- [ ] Deleting by name removes permanently. Idempotent — deleting non-existent name returns 204.
- [ ] After deletion, the secret no longer appears in list responses.

### Edge Cases

- [ ] Zero secrets shows empty state with call-to-action.
- [ ] 200 secrets all appear in the list.
- [ ] Secret name at exactly 255 characters accepted.
- [ ] Secret name at 256 characters rejected (422).
- [ ] Secret value at exactly 64 KiB accepted.
- [ ] Secret value at 65,537 bytes rejected (422).
- [ ] Empty JSON body returns 400.
- [ ] JSON body with `name` but missing `value` returns 422.
- [ ] JSON body with `value` but missing `name` returns 422.
- [ ] Same-name secret (including case) performs update, not duplicate.
- [ ] Name differing only in case creates separate secret.
- [ ] Show/hide toggle works during entry but value is never retrievable after save.
- [ ] Session expiry redirects to login.
- [ ] Network failures preserve form state for retry.
- [ ] Trailing slash `/settings/secrets/` treated same as `/settings/secrets`.

### Boundary Constraints

- [ ] Secret name: min 1 character, max 255 characters, pattern `^[a-zA-Z_][a-zA-Z0-9_]*$`.
- [ ] Secret value: min 1 byte, max 65,536 bytes.
- [ ] No hard cap on secret count per user.
- [ ] Timestamps in ISO 8601 format.
- [ ] Response objects contain exactly: `id` (number), `user_id` (number), `name` (string), `created_at` (string), `updated_at` (string).

## Design

### Web UI Design

**Route**: `/settings/secrets`

**Sidebar Addition**: A new "Secrets" item is added to the settings sidebar navigation with a lock icon (🔐), positioned after "Connected Accounts" and before "Notifications".

**Settings Home Summary Card**: A new card on `/settings` showing "{count} secret(s)" or "No secrets", with "Last updated: {relative_date}" if count > 0, empty CTA if count is 0, and "Manage secrets →" link.

**Secrets Page Layout**: Two-column layout (sidebar ~240px fixed, content fluid). Page title "Secrets" (h1), subtitle explaining that secrets are encrypted and cannot be retrieved after saving.

**Add Secret Form** (top of content area):
- Name input: single-line, placeholder `SECRET_NAME`, client-side validation `^[a-zA-Z_][a-zA-Z0-9_]*$`, max 255 chars, counter at 230+
- Value input: textarea, masked (password-type) by default, show/hide toggle, placeholder "Enter secret value", max 64 KiB
- Save button: disabled until valid, shows "Saving…" during API call
- Inline validation errors below fields in red

**Secrets Table**: Columns — Name, Created, Last Updated, Actions (delete). Sorted alphabetically. No reveal/copy for values. Delete button triggers confirmation dialog.

**Delete Confirmation Dialog**: Warns that workspaces and workflows using the secret will lose access. Red destructive "Delete" button plus "Cancel".

**Empty State**: Icon, "No secrets configured" heading, explanatory text, and pointer to the add form.

**Feedback**: Green success banners (3s), red error banners with preserved form state, skeleton loading for table.

**Responsive**: < 768px collapses sidebar, condenses table columns. ≥ 1024px shows full layout.

### API Shape

**List**: `GET /api/user/secrets` → 200 with `UserSecretSummary[]` (id, user_id, name, created_at, updated_at). Errors: 401, 500.

**Create/Update**: `POST /api/user/secrets` with `{ name, value }` → 201 with `UserSecretDetail`. Errors: 400 (bad JSON), 401, 422 (validation), 500.

**Delete**: `DELETE /api/user/secrets/:name` → 204 No Content. Errors: 400, 401, 500.

### SDK Shape

Extend `SecretService` with: `listUserSecrets(userId)`, `setUserSecret(userId, name, value)`, `deleteUserSecret(userId, name)`, `getUserSecretEnvironment(userId)`. Types: `UserSecretSummary { id, user_id, name, created_at, updated_at }`, `UserSecretDetail { id, user_id, name, created_at, updated_at }`. Same AES-256-GCM encryption and `redactSecretValues` coverage.

### CLI Command

Extend `codeplane secret` with `--scope user|repo` flag (default `repo` for backward compatibility):
- `codeplane secret list --scope user [--json]`
- `codeplane secret set <NAME> --scope user --body-stdin [--json]`
- `codeplane secret delete <NAME> --scope user`
When `--scope user`, `--repo`/`-R` is ignored. `--body-stdin` mandatory for set. Exit codes: 0 success, 1 error.

### TUI Design

New Secrets tab in settings screen. List view with `j`/`k` navigation, `a` to add (modal with name + masked value), `d` to delete (confirmation bar), `R` to refresh. Empty state: "No user secrets. Press a to add your first secret."

### Documentation

1. Concept page: "User Secrets" — what they are, how they differ from repo secrets, injection points
2. Settings guide: managing user secrets in the web UI
3. CLI reference: `secret list/set/delete --scope user`
4. API reference: `GET/POST /api/user/secrets`, `DELETE /api/user/secrets/:name`
5. Security note: AES-256-GCM encryption, no value retrieval, stdin for CLI, log redaction
6. Comparison table: user secrets vs. repository secrets

## Permissions & Security

### Authorization Roles

| Role | Can List? | Can Create/Update? | Can Delete? | Notes |
|------|-----------|---------------------|-------------|-------|
| Authenticated user (self) | ✅ | ✅ | ✅ | Only their own secrets |
| Authenticated user (other) | ❌ | ❌ | ❌ | Cannot access another user's secrets |
| Organization Admin | ❌ | ❌ | ❌ | User secrets are private, not org-scoped |
| Site Admin | ❌ | ❌ | ❌ | Admins cannot access user secrets (privacy boundary) |
| Anonymous / Unauthenticated | ❌ (401) | ❌ (401) | ❌ (401) | Must be authenticated |

User secrets are strictly personal. The API routes derive user identity from the authenticated session/token and only operate on that user's secrets. There is no path parameter for user ID. Site admins deliberately cannot access user secrets — this is a security design decision since user secrets may contain credentials for external systems.

### Rate Limiting

- Global server-wide rate limiter applies.
- Per-endpoint limits: List 60 req/min, Create/Update 30 req/min, Delete 30 req/min per authenticated user.
- `429 Too Many Requests` with `Retry-After` header.

### Data Privacy Constraints

- Secret values never returned in any API response.
- Secret values never logged. `redactSecretValues` utility covers user secrets.
- Values encrypted at rest with AES-256-GCM via `CODEPLANE_SECRET_KEY`.
- CLI reads values from stdin to avoid shell history exposure.
- Values must not appear in error messages.
- Database backups contain encrypted blobs only.
- No cross-user leakage: queries scoped by `user_id` from authenticated session.
- Secret names may be semi-sensitive but only visible to the owning user.

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `UserSecretListViewed` | Successful 200 from list endpoint | `actor_id`, `secret_count`, `client` (web/cli/tui/api), `timestamp` |
| `UserSecretSet` | Secret created or updated | `actor_id`, `secret_name`, `client`, `is_update` (boolean), `timestamp` |
| `UserSecretSetFailed` | Create/update failed | `actor_id`, `error_code`, `client`, `timestamp` |
| `UserSecretDeleted` | Secret deleted | `actor_id`, `secret_name`, `client`, `timestamp` |
| `UserSecretDeleteFailed` | Delete failed | `actor_id`, `error_code`, `client`, `timestamp` |

### Funnel Metrics & Success Indicators

- **User secret adoption rate**: % of active users with ≥1 user secret. Target: >15% of users with workspaces.
- **Time-to-first-user-secret**: Duration from account creation to first `UserSecretSet`.
- **CLI vs. Web vs. TUI distribution**: Breakdown of events by `client`.
- **Error rate**: `UserSecretSetFailed` / total set attempts. Target: <2%.
- **Secret freshness**: Distribution of `updated_at` age. Secrets >180 days may indicate stale credentials.
- **User vs. Repo secret ratio**: Users using user secrets vs. repo secrets vs. both.
- **Management flow completion**: Users who list → create → have secret injected in workspace/workflow.

## Observability

### Logging Requirements

| Log Point | Level | Fields | When |
|-----------|-------|--------|------|
| User secret list requested | `info` | `actor_id`, `request_id` | Every list request |
| User secret list success | `info` | `actor_id`, `secret_count`, `latency_ms`, `request_id` | Successful 200 |
| User secret set success | `info` | `event: "user_secret_set"`, `actor_id`, `secret_name`, `is_update`, `request_id` | Successful 201 |
| User secret deleted | `info` | `event: "user_secret_deleted"`, `actor_id`, `secret_name`, `request_id` | Successful 204 |
| Validation failed | `warn` | `event: "user_secret_validation_failed"`, `actor_id`, `field`, `code`, `request_id` | 422 response |
| Encryption failed | `error` | `event: "user_secret_encrypt_failed"`, `actor_id`, `secret_name`, `error_class`, `request_id` | Encryption error |
| Unauthorized | `warn` | `event: "user_secret_unauthorized"`, `actor_id`, `status`, `request_id` | 401 response |
| Bad request | `warn` | `event: "user_secret_bad_request"`, `actor_id`, `error`, `request_id` | 400 response |
| Unexpected exception | `error` | `actor_id`, `error_stack`, `request_id` | Catch block |

All logs include `request_id` for tracing.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_user_secret_list_total` | Counter | `status`, `error_type` | List request count |
| `codeplane_user_secret_list_duration_ms` | Histogram | `status` | List latency (buckets: 5,10,25,50,100,250,500,1000ms) |
| `codeplane_user_secret_set_total` | Counter | `status`, `is_update` | Create/update count |
| `codeplane_user_secret_set_errors_total` | Counter | `error_code` | Set failures by HTTP code |
| `codeplane_user_secret_set_duration_ms` | Histogram | — | Set latency including encryption |
| `codeplane_user_secret_delete_total` | Counter | `status` | Delete count |
| `codeplane_user_secret_count` | Gauge | `user_id` | Secrets per user |

### Alerts & Runbooks

**Alert 1: High User Secret Set 500 Error Rate**
- Condition: `rate(codeplane_user_secret_set_errors_total{error_code="500"}[5m]) > 0.1`
- Severity: Critical
- Runbook: (1) Check logs for `user_secret_encrypt_failed`. (2) Verify `CODEPLANE_SECRET_KEY` is set on all instances. (3) Check for key rotation mismatch. (4) Verify `crypto.subtle` API. (5) Check DB connectivity and `user_secrets` table. (6) Escalate to security team if key compromised.

**Alert 2: High User Secret List Error Rate**
- Condition: `rate(codeplane_user_secret_list_total{status="error"}[5m]) / rate(codeplane_user_secret_list_total[5m]) > 0.05`
- Severity: Warning
- Runbook: (1) Check logs by `request_id`. (2) If 500s: check DB. (3) If 401s: check auth middleware/session store. (4) Escalate if unresolved in 15min.

**Alert 3: User Secret Set p95 Latency Spike**
- Condition: `histogram_quantile(0.95, rate(codeplane_user_secret_set_duration_ms_bucket[5m])) > 2000`
- Severity: Warning
- Runbook: (1) Check encryption latency. (2) If encryption slow: check CPU. (3) If DB slow: check connection pool, disk I/O, locks. (4) Check for large values near 64 KiB. (5) Verify index health.

**Alert 4: Elevated 422 Validation Rate**
- Condition: `rate(codeplane_user_secret_set_errors_total{error_code="422"}[15m]) / rate(codeplane_user_secret_set_total[15m]) > 0.5`
- Severity: Warning
- Runbook: (1) Check logs for validation failures by field/code. (2) If name invalid: check for outdated clients. (3) If value too large: identify actor. (4) Reach out to concentrated actors.

### Failure Modes

| Mode | Detection | Impact | Mitigation |
|------|-----------|--------|------------|
| `CODEPLANE_SECRET_KEY` missing | Startup warning; 500 on encrypt | Secrets fail or stored plaintext | Health check at startup |
| Key rotated | Old secrets fail decrypt | Injection fails | Re-encrypt migration; coordinated rollout |
| DB connection failure | Error propagation | All ops return 500 | Retry with backoff; DB alerting |
| Concurrent upsert | `ON CONFLICT` handles | Last write wins | Expected behavior |
| 64 KiB value | Validation accepts | Higher latency | Monitor p95 |
| Table missing | SQL error | All ops fail 500 | Migration verification |
| User deleted | FK cascade | Secrets cleaned up | `ON DELETE CASCADE` constraint |

## Verification

### API E2E Tests

1. **List empty**: New user, `GET /api/user/secrets` → 200, `[]`.
2. **Create secret**: POST `{name:"API_KEY",value:"secret123"}` → 201, response has `id`, `user_id`, `name`, `created_at`, `updated_at`, no `value`.
3. **List after create**: Create, then list → secret appears.
4. **Values never in list**: Create with known value, list, assert value string absent from all fields, no `value`/`value_encrypted` field.
5. **Alphabetical order**: Create `ZULU`, `MIKE`, `ALPHA` → list order `["ALPHA","MIKE","ZULU"]`.
6. **Upsert updates**: Create `MY_KEY` v1, then v2 → both 201, `created_at` unchanged, `updated_at` newer.
7. **Upsert preserves created_at**: Create, wait, update → `created_at` matches original.
8. **Delete**: Create `TEMP_KEY`, DELETE → 204, list → absent.
9. **Delete idempotent**: DELETE nonexistent → 204.
10. **Min valid name**: Name `A` → 201.
11. **Underscore start**: Name `_MY_SECRET` → 201.
12. **Max valid name (255 chars)**: 255-char valid name → 201.
13. **256-char name rejected**: → 422, `{field:"name",code:"invalid"}`.
14. **Digit-start rejected**: `1SECRET` → 422.
15. **Hyphen rejected**: `MY-SECRET` → 422.
16. **Dot rejected**: `MY.SECRET` → 422.
17. **Space rejected**: `MY SECRET` → 422.
18. **Empty name rejected**: `""` → 422, `missing_field`.
19. **Whitespace name rejected**: `"   "` → 422, `missing_field`.
20. **Empty value rejected**: `""` → 422, `missing_field`.
21. **Value at 64 KiB**: 65,536-byte value → 201.
22. **Value at 64 KiB + 1 rejected**: 65,537 bytes → 422, `{field:"value",code:"invalid"}`.
23. **Whitespace value accepted**: `"   "` → 201.
24. **Unicode/null value**: `"line1\nline2\u0000日本語"` → 201.
25. **Unauth list**: No auth → 401.
26. **Unauth create**: No auth → 401.
27. **Unauth delete**: No auth → 401.
28. **Malformed JSON**: → 400, `"invalid request body"`.
29. **Missing name**: `{value:"val"}` → 422.
30. **Missing value**: `{name:"KEY"}` → 422.
31. **Case sensitivity**: `API_KEY` and `api_key` both exist as separate entries.
32. **User isolation**: User A secret not in User B list.
33. **PAT auth list**: Valid PAT → 200.
34. **PAT auth set**: Valid PAT → 201.
35. **Invalid PAT**: → 401.
36. **Content-Type enforcement**: `text/plain` POST → rejected.
37. **Response shape**: Each object has exactly `id`, `user_id`, `name`, `created_at`, `updated_at`.
38. **Valid ISO 8601 timestamps**: All parseable as Date.
39. **100 secrets**: Create 100, list → all 100 returned, ordered.
40. **All valid char types**: `_aB1_xY9_Z` → 201.

### CLI E2E Tests

41. `secret list --scope user --json` → valid JSON array.
42. Set then list → name appears.
43. `echo "val" | secret set MY_KEY --scope user --body-stdin` → exit 0.
44. `secret set MY_KEY --scope user` (no stdin) → non-zero exit, error.
45. List after set → value not in stdout/stderr.
46. `secret delete MY_KEY --scope user` → exit 0, absent from list.
47. Invalid name → non-zero exit, clear error.
48. No auth → auth error, non-zero exit.
49. Empty list → exit 0.
50. `--scope user` ignores `--repo` → returns user secrets.

### Web UI E2E Tests (Playwright)

51. Navigate to `/settings/secrets` → page loads, sidebar highlights Secrets.
52. Empty state for new user.
53. Add secret → appears in table.
54. Value not displayed after save.
55. Add second secret → both in table, alphabetical.
56. Update existing secret → updated timestamp.
57. Delete secret → disappears.
58. Delete cancel → remains.
59. Invalid name (digit start) → inline error, save disabled.
60. Invalid name (hyphen) → inline error.
61. Empty value → save disabled.
62. Value input masked by default.
63. Show/hide toggle works.
64. Sidebar contains Secrets link on all settings pages.
65. Settings home has Secrets summary card.
66. Network error preserves form state.
67. Session expiry redirects to login.
68. Trailing slash renders same page.

### Security Tests

69. List response never contains plaintext value.
70. User isolation at DB level.
71. `getUserSecretEnvironment` returns correct decrypted value.
72. `redactSecretValues` covers user secrets.
73. PAT auth can create user secret.
