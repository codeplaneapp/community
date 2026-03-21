# REPO_DEPLOY_KEY_LIST

Specification for REPO_DEPLOY_KEY_LIST.

## High-Level User POV

When you navigate to the Deploy Keys section of your repository settings, you see a clear, scannable list of every deploy key that has been registered for that repository. Each deploy key entry shows the human-readable title given when the key was added, the key's SHA256 fingerprint for cross-referencing with your local systems, whether the key has read-only or read-write access, and the date the key was created. The list is sorted with the most recently added key at the top.

Deploy keys are repository-scoped SSH credentials. Unlike personal SSH keys (which are tied to a user account and grant access to all repositories that user can reach), a deploy key grants a specific machine — such as a CI server, a deployment pipeline, or an automation agent — SSH access to exactly one repository. This makes deploy keys the preferred credential for machine-to-machine access where you want to limit the blast radius of a compromised key.

The deploy key list gives repository administrators confidence that the right machines have access and that no unexpected keys are present. When you see a key for a decommissioned CI server, you can delete it directly from this list. When you need to grant a new automation system access, you initiate the add-key flow from this same page.

This view is private to repository administrators and owners. Contributors, external collaborators, and anonymous visitors cannot see which deploy keys are registered. The data is consistent across all clients: if you add a deploy key through the CLI and then open the web settings page, the key appears immediately.

Deploy keys are distinct from personal SSH keys (which live in your user account settings) and from personal access tokens (which authenticate HTTP API calls). The deploy key list is purely about repository-scoped SSH credentials for machines.

## Acceptance Criteria

### Definition of Done

The feature is complete when a repository administrator or owner can retrieve a list of all deploy keys registered to a specific repository across all supported clients (API, CLI, web UI, TUI), with consistent data shape, ordering, and access control, and the endpoint is mounted and accessible in the server route tree.

### Functional Constraints

- An authenticated user with admin or owner permission on a repository calling `GET /api/repos/:owner/:repo/deploy-keys` receives a JSON array of all deploy keys registered to that repository.
- Each key object in the response includes exactly: `id` (integer), `title` (string), `fingerprint` (string), `read_only` (boolean), `created_at` (ISO 8601 string).
- The response does **not** include the raw `public_key` material in the list endpoint. Only `fingerprint` is exposed for identification.
- Keys are ordered by `created_at` descending (most recently added first).
- If the repository has no registered deploy keys, the endpoint returns an empty JSON array `[]`, not `null` or an error.
- The endpoint requires authentication. Unauthenticated requests receive a `401 Unauthorized` response.
- The endpoint requires admin or owner permission on the repository. Authenticated users without sufficient permission receive a `403 Forbidden` response.
- The endpoint supports both session cookie authentication and PAT-based `Authorization: token <pat>` authentication.
- Read-only PATs are sufficient to call this endpoint (it is a read operation).
- The endpoint returns only keys belonging to the specified repository — no cross-repository key leakage is possible.
- The `fingerprint` field uses the `SHA256:<base64-no-padding>` format, matching OpenSSH's `ssh-keygen -lf` output.
- The `title` field reflects the title provided at key creation time, trimmed of leading/trailing whitespace, with a maximum length of 255 characters.
- The `id` field is a stable, monotonically increasing integer suitable for use in subsequent `DELETE /api/repos/:owner/:repo/deploy-keys/:id` calls.
- The `read_only` field is a boolean: `true` if the key can only pull, `false` if the key can also push.
- The `:owner` parameter resolves to both user-owned and organization-owned repositories.
- If the repository does not exist or the user does not have permission to see it, the endpoint returns `404 Not Found` (not `403`, to avoid leaking repository existence).

### Edge Cases

- A repository with zero deploy keys receives `200 OK` with body `[]`.
- A repository with 100+ deploy keys receives all keys in a single response (no pagination is required for this endpoint given expected deploy key counts per repository).
- If a key's `title` contains special characters (unicode, emoji, HTML entities, quotation marks), they are returned verbatim in JSON encoding — no sanitization or escaping beyond standard JSON string encoding.
- If the same user makes concurrent requests to the list endpoint, both return the same consistent snapshot.
- If a deploy key is deleted between the user listing keys and acting on the list, subsequent delete attempts for the already-deleted key return `404 Not Found`.
- If the repository is archived, deploy keys can still be listed (the list is a read operation).
- If the authenticated user is a member of an organization that owns the repository but does not have admin permission on the repo itself, they receive `403 Forbidden`.
- A personal access token scoped to read-only is sufficient to call this endpoint (it is a read operation).
- If the owner or repo name contains URL-encoded characters, they are decoded correctly before resolution.

### Boundary Constraints

- Deploy key `title` length: 1–255 characters (enforced at creation, displayed as-is in list).
- `fingerprint` string length: always `SHA256:` prefix + 43 characters of base64 (without trailing `=` padding), totaling exactly 50 characters.
- `created_at` is always a valid ISO 8601 UTC timestamp string.
- `read_only` is always a strict boolean (`true` or `false`), never `null`.
- Maximum number of deploy keys per repository: no explicit hard limit in the list endpoint, but the creation endpoint should enforce a per-repository limit of 100 deploy keys. The list endpoint must handle up to this maximum gracefully.
- `:owner` path parameter: 1–39 characters, matching `^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$`.
- `:repo` path parameter: 1–100 characters, matching `^[a-zA-Z0-9._-]+$`.

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/deploy-keys`

**Authentication:** Required. Session cookie or `Authorization: token <pat>` header.

**Authorization:** Admin or Owner on the target repository.

**Request:** No query parameters. No request body.

**Response (200 OK):**

```json
[
  {
    "id": 17,
    "title": "CI Server (GitHub Actions)",
    "fingerprint": "SHA256:abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
    "read_only": true,
    "created_at": "2026-03-15T09:30:00.000Z"
  },
  {
    "id": 12,
    "title": "Staging Deploy Pipeline",
    "fingerprint": "SHA256:zyxwvutsrqponmlkjihgfedcba9876543210ZYXWVU",
    "read_only": false,
    "created_at": "2026-03-10T14:22:00.000Z"
  }
]
```

**Response (401 Unauthorized):**

```json
{
  "message": "authentication required"
}
```

**Response (403 Forbidden):**

```json
{
  "message": "admin access required"
}
```

**Response (404 Not Found):**

```json
{
  "message": "repository not found"
}
```

**Response shape contract:** The response is always a JSON array. Each element is an object with exactly the five fields above. No additional fields are included. No `public_key` field is present in the list response.

### SDK Shape

A new `DeployKeyService` (or method group on `RepoService`) exposes `listDeployKeys`:

```typescript
type DeployKeySummary = {
  id: number;
  title: string;
  fingerprint: string;
  read_only: boolean;
  created_at: string; // ISO 8601
};

// DeployKeyService.listDeployKeys(actor, owner, repo)
// Returns Result<DeployKeySummary[], APIError>
```

The method:
- Resolves the repository from `owner` and `repo` name.
- Checks that the actor has admin or owner permission on the repository.
- Returns `notFound` if the repository does not exist or the actor cannot see it.
- Returns `forbidden` if the actor can see the repository but is not an admin/owner.
- Queries the database for all deploy keys on that repository.
- Maps database rows to the summary type, excluding `public_key`.
- Returns the result sorted by `created_at` descending.

### CLI Command

**Command:** `codeplane deploy-key list --repo <owner/repo>`

**Options:**

| Flag | Short | Required | Description |
|------|-------|----------|-------------|
| `--repo` | `-R` | Yes (or inferred from cwd) | Repository in `owner/repo` format. If omitted, inferred from the current working directory's remote. |
| `--json` | | No | Output raw JSON (default behavior). |

**Output:** JSON array of deploy key objects printed to stdout. Each object contains `id`, `title`, `fingerprint`, `read_only`, and `created_at`.

**Exit code:** `0` on success, non-zero on authentication failure, permission denied, or network error.

**Authentication:** Uses the token stored in CLI config (set via `codeplane auth login`). Fails with a clear error message if no token is configured.

**Behavior on empty list:** Prints `[]` and exits with code `0`.

**Example:**

```
$ codeplane deploy-key list --repo acme/webapp
[
  {
    "id": 17,
    "title": "CI Server (GitHub Actions)",
    "fingerprint": "SHA256:abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
    "read_only": true,
    "created_at": "2026-03-15T09:30:00.000Z"
  }
]
```

### Web UI Design

**Location:** Repository Settings → Deploy Keys (`/:owner/:repo/settings/deploy-keys`)

**Settings Sidebar:** "Deploy Keys" appears as a navigation item in the repository settings sidebar, below "Variables" and above any future sections.

**Layout:**

- **Page heading:** "Deploy Keys" with a subtitle: "Deploy keys grant SSH access to this repository for machines and automation systems."
- **Add deploy key button:** A prominent "Add Deploy Key" action button in the top-right of the section header, linking to the add-deploy-key flow.
- **Deploy key list:** Each registered deploy key is displayed as a card/row with:
  - **Title** (bold, primary text): The key's `title` field.
  - **Permission badge:** A small badge indicating "Read-only" (muted/default color) or "Read & Write" (amber/warning color) based on the `read_only` field.
  - **Fingerprint:** Displayed in monospace font, showing the full `SHA256:...` string. Selectable and copyable.
  - **Added date:** Relative time (e.g., "Added 3 days ago") with an exact ISO timestamp shown on hover via title attribute.
  - **Delete button:** A destructive action (red text or trash icon) positioned at the far right of the row. Clicking opens a confirmation dialog.
- **Empty state:** When no deploy keys are registered, show a centered icon (key icon) with the message: "No deploy keys yet. Deploy keys grant machines SSH access to this repository." with a call-to-action button to add a deploy key.
- **Loading state:** A skeleton loader matching the card/row layout while the API call is in flight.
- **Error state:** If the API call fails, show an inline error banner: "Failed to load deploy keys. Please try again." with a retry button.

**Interactions:**

- The list refreshes automatically after a deploy key is added or deleted (no manual page reload required).
- Clicking the delete button opens a confirmation modal: "Delete deploy key '[key title]'? This will immediately revoke SSH access for any machine using this key. This action cannot be undone." with "Cancel" and "Delete" buttons.
- The fingerprint is selectable/copyable for cross-referencing with the public key on the machine that uses it.
- The permission badge uses visual distinction (color, icon) to make it immediately clear which keys are read-only versus read-write, as read-write keys carry higher security risk.

**Responsive behavior:**

- < 768px: Settings sidebar collapses to dropdown. Key rows stack title/fingerprint vertically. Permission badge and delete button share a row below.
- ≥ 768px: Standard horizontal row layout with all elements on a single line.

### TUI UI

**Location:** Repository detail → Settings tab → Deploy Keys section

**Screen model:**

- Deploy keys appear as a list within the repository settings screen.
- Each list item shows: title, permission (R/O or R/W badge), truncated fingerprint, and relative date.
- `j`/`k` (or arrow keys) navigate between keys.
- `d` prompts for delete confirmation.
- `a` opens the add-deploy-key flow.
- `Enter` on a key shows full detail (full fingerprint, exact timestamp).

**Empty state:** "No deploy keys. Press `a` to add one."

### Documentation

The following end-user documentation should be written or updated:

1. **Deploy Keys guide** (`docs/guides/deploy-keys.mdx`):
   - Explain what deploy keys are and how they differ from personal SSH keys and PATs.
   - Explain when to use read-only vs. read-write deploy keys.
   - Walk through viewing your deploy keys in the web UI.
   - Show the CLI command with example output.
   - Provide the API reference (`GET /api/repos/:owner/:repo/deploy-keys`) with request/response examples.
   - Include a "Troubleshooting" section: how to cross-reference a fingerprint with `ssh-keygen -lf`.
   - Note that a single SSH key can only be registered as a deploy key on one repository (uniqueness constraint).

2. **Repository Settings reference** (if it exists): Add "Deploy Keys" to the list of settings sections with a link to the deploy keys guide.

3. **CLI reference** (`docs/cli/deploy-key.mdx`): Document all `deploy-key` subcommands including `list`.

## Permissions & Security

### Authorization

| Role | Access |
|------|--------|
| Repository Owner | Can list deploy keys. Full access. |
| Repository Admin | Can list deploy keys. Full access. |
| Repository Member (Write) | **Denied.** Returns `403 Forbidden`. Deploy key management is an admin-only operation. |
| Repository Member (Read) | **Denied.** Returns `403 Forbidden`. |
| Organization Owner (of org that owns the repo) | Can list deploy keys. Organization ownership implies admin-level access to all organization repositories. |
| Organization Member (without repo admin) | **Denied.** Returns `403 Forbidden`. |
| Unauthenticated | **Denied.** Returns `401 Unauthorized`. |
| Anonymous (with public repo visibility) | **Denied.** Returns `401 Unauthorized`. Deploy keys are not public information regardless of repository visibility. |
| Read-only PAT | **Permitted.** Listing deploy keys is a read operation. The PAT holder must still have admin/owner permission on the repository. |
| Full-scope PAT | **Permitted**, subject to the same admin/owner check. |
| Session cookie | **Permitted**, subject to the same admin/owner check. |

### Rate Limiting

- The `GET /api/repos/:owner/:repo/deploy-keys` endpoint is subject to the platform-wide rate limiting middleware.
- No additional per-endpoint rate limiting is required, as this is a low-cost read operation returning a small payload.
- Standard rate limit: follows the global per-user rate limit configured in the platform middleware (typically 60 requests/minute for authenticated users).

### Data Privacy

- The list endpoint does **not** return the raw `public_key` content. Only `fingerprint` is returned, which is sufficient for key identification but insufficient for impersonation or deriving the private key.
- Deploy key fingerprints are derived data (SHA256 of the public key bytes) and are not considered PII, but they are still scoped to authorized repository administrators only.
- The `title` field is user-provided and could contain identifying information (e.g., machine name, IP address, team name). It is only visible to repository admins/owners.
- No deploy key data (list contents, fingerprints, or titles) is ever exposed in server logs at INFO level. Structured log context may include `repo_id` and `key_count` but never fingerprint or title values.
- The `repository_id` is never exposed in the API response. The API returns the key's own `id` but not the internal repository identifier.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `deploy_keys_listed` | User successfully retrieves the deploy key list for a repository | `user_id`, `repo_id`, `repo_owner`, `repo_name`, `key_count`, `client` (`web`, `cli`, `tui`, `api`), `timestamp` |

### Funnel Metrics

- **Deploy key adoption rate:** Percentage of active repositories that have ≥1 deploy key registered. Indicates how widely machine access is used.
- **Deploy key list view frequency:** How often users view their deploy key list per repository per week. Indicates engagement with credential management.
- **List-to-action conversion:** Percentage of deploy key list views that lead to an add or delete action within the same session. Indicates the list is actionable.
- **Deploy key permission distribution:** Ratio of read-only to read-write deploy keys across all repositories. Indicates whether the principle of least privilege is being followed.

### Success Indicators

- Repositories that have deploy keys listed and then observe successful SSH clone/pull operations using those keys within 24 hours — indicates the list helps verify or troubleshoot SSH configuration.
- Low error rate on list endpoint (< 0.1% of requests returning 5xx).
- Deploy key list load time p95 < 200ms.
- Zero instances of cross-repository key leakage (verifiable via E2E tests).

## Observability

### Logging

| Log Point | Level | Structured Context | Condition |
|-----------|-------|-------------------|----------|
| Deploy key list requested | `DEBUG` | `user_id`, `repo_owner`, `repo_name` | Every request |
| Deploy key list returned | `INFO` | `user_id`, `repo_id`, `key_count` | Every successful 200 response |
| Deploy key list auth failure | `WARN` | `request_id`, `ip`, `path` | 401 response |
| Deploy key list permission denied | `WARN` | `user_id`, `request_id`, `repo_owner`, `repo_name` | 403 response |
| Deploy key list repo not found | `DEBUG` | `request_id`, `repo_owner`, `repo_name` | 404 response |
| Deploy key list internal error | `ERROR` | `user_id`, `request_id`, `repo_id`, `error_message`, `stack_trace` | 500 response |

**Rules:**
- Never log `fingerprint`, `title`, or `public_key` values at any log level.
- Always include `request_id` for correlation.
- `key_count` is safe to log as it reveals no key details.
- `repo_owner` and `repo_name` are safe to log (they are public URL components).

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_deploy_key_list_requests_total` | Counter | `status` (200, 401, 403, 404, 500) | Total deploy key list requests |
| `codeplane_deploy_key_list_duration_seconds` | Histogram | — | Request duration for deploy key list endpoint |
| `codeplane_deploy_keys_per_repo` | Histogram | — | Distribution of deploy key counts per repository (sampled on list) |

### Alerts

#### Alert: `DeployKeyListErrorRateHigh`

**Condition:** `rate(codeplane_deploy_key_list_requests_total{status="500"}[5m]) / rate(codeplane_deploy_key_list_requests_total[5m]) > 0.05`

**Severity:** Warning

**Runbook:**
1. Check server logs filtered by `path=~/api/repos/.*/deploy-keys$` and `status=500` for the alerting time window.
2. Look for database connection errors or query timeouts in the structured log `error_message` field.
3. Verify database health: check connection pool saturation, replication lag, and query latency dashboards.
4. If the database is healthy, check for recent deployments that may have introduced a regression in the deploy key service method or the `ListDeployKeysByRepo` SQL query.
5. If the issue is database load, consider temporarily increasing connection pool size or adding a read replica.
6. Verify the `deploy_keys.repository_id` index exists and is being used — run `EXPLAIN ANALYZE` on the list query for a sample repository ID.
7. Escalate to the platform team if the root cause is infrastructure-level.

#### Alert: `DeployKeyListLatencyHigh`

**Condition:** `histogram_quantile(0.95, rate(codeplane_deploy_key_list_duration_seconds_bucket[5m])) > 2`

**Severity:** Warning

**Runbook:**
1. Check if the issue is isolated to the deploy key list endpoint or affecting all repository settings routes.
2. Inspect database query performance: run `EXPLAIN ANALYZE` on the `ListDeployKeysByRepo` query for a sample repository ID to check for missing indexes or sequential scans.
3. Verify that the `deploy_keys.repository_id` index exists and is being used.
4. Check for lock contention on the `deploy_keys` table (concurrent bulk inserts, schema migrations, or vacuum operations).
5. If latency is widespread, check Bun runtime metrics for event loop lag or memory pressure.
6. Check if the repository resolution step (resolving `owner/repo` to `repository_id`) is the bottleneck rather than the deploy key query itself.
7. Consider adding a response cache if this endpoint is being called at unexpectedly high frequency.

#### Alert: `DeployKeyList403Spike`

**Condition:** `rate(codeplane_deploy_key_list_requests_total{status="403"}[5m]) > 50`

**Severity:** Info

**Runbook:**
1. Check if the spike correlates with a UI change that may have exposed the deploy keys settings link to non-admin users.
2. Review request source patterns — if many different users are hitting 403, the navigation likely exposes the link without proper role gating.
3. If the spike is from a single user or narrow range, it may be manual probing. Verify rate limiting is functioning correctly.
4. If the spike is from legitimate client traffic, check if role/permission definitions changed recently (e.g., a migration that altered admin status).
5. No immediate action required unless the rate exceeds 500/min, in which case escalate as a potential abuse vector.

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Resolution |
|-------|-------------|-------|------------|
| Authentication required | 401 | Missing or invalid session/token | User must re-authenticate |
| Permission denied | 403 | User is authenticated but not admin/owner on the repository | User must request admin access or contact repository owner |
| Repository not found | 404 | Repository does not exist, or user has no visibility permission | User should verify the owner/repo name |
| Database unavailable | 500 | Connection pool exhausted or database down | Retry with backoff; platform team investigates |
| Database query timeout | 500 | Slow query due to missing index or table lock | DBA investigates query plan and indexing |
| Repository resolution failure | 500 | Internal error resolving owner/repo to repository ID | Check repository table integrity and owner lookup service |
| Auth middleware misconfiguration | 401 | Return 401 for all requests | Mass 401 alert; restart server, check middleware |
| Service registry not initialized | 500 | Null reference on service | Restart server, check startup logs |

## Verification

### API Integration Tests

- **List deploy keys returns 200 with empty array for a repository with no deploy keys.** Create a repository. Authenticate as the repository owner. Call `GET /api/repos/:owner/:repo/deploy-keys`. Assert status 200 and body `[]`.

- **List deploy keys returns all registered keys for a repository.** Create a repository. Add 3 deploy keys via `POST /api/repos/:owner/:repo/deploy-keys`. Call `GET /api/repos/:owner/:repo/deploy-keys`. Assert status 200, array length 3, and each element has `id`, `title`, `fingerprint`, `read_only`, `created_at` fields.

- **List deploy keys returns keys in descending created_at order.** Add 3 deploy keys with known titles in sequence (small delay between adds). Call the list endpoint. Assert the first element's `created_at` is the most recent.

- **List deploy keys does not include raw public_key material.** Add a deploy key. Call the list endpoint. Assert no element in the response array has a `public_key` field.

- **List deploy keys does not include repository_id in response.** Add a deploy key. Call the list endpoint. Assert no element in the response array has a `repository_id` field.

- **List deploy keys returns correct field types.** Add a deploy key. List keys. Assert: `id` is a positive integer, `title` is a non-empty string, `fingerprint` starts with `SHA256:`, `read_only` is a boolean, `created_at` is a valid ISO 8601 string.

- **List deploy keys returns correct read_only values.** Add one read-only deploy key and one read-write deploy key. List keys. Assert one entry has `read_only: true` and one has `read_only: false`.

- **List deploy keys requires authentication (no token).** Call `GET /api/repos/:owner/:repo/deploy-keys` with no auth header and no session cookie. Assert status 401.

- **List deploy keys requires authentication (invalid token).** Call with `Authorization: token invalid_garbage`. Assert status 401.

- **List deploy keys requires admin permission (write member gets 403).** Create a repository. Add a user as a write-permission member (not admin). Authenticate as that user. Call the list endpoint. Assert status 403.

- **List deploy keys requires admin permission (read member gets 403).** Create a repository. Add a user as a read-permission member. Authenticate as that user. Call the list endpoint. Assert status 403.

- **List deploy keys works for repository owner.** Create a repository as User A. Authenticate as User A. Call the list endpoint. Assert status 200.

- **List deploy keys works for repository admin.** Create a repository. Add a user as an admin. Authenticate as the admin user. Call the list endpoint. Assert status 200.

- **List deploy keys works for organization owner on org repo.** Create an organization. Create a repository under the org. Authenticate as the org owner. Call the list endpoint. Assert status 200.

- **List deploy keys returns 404 for non-existent repository.** Call `GET /api/repos/nonexistent/nonexistent/deploy-keys` authenticated as any user. Assert status 404.

- **List deploy keys returns 404 (not 403) for private repo the user cannot see.** Create a private repository as User A. Authenticate as User B who has no access. Call the list endpoint. Assert status 404 (not 403, to avoid leaking repo existence).

- **List deploy keys works with read-only PAT.** Create a read-only PAT for a repo admin. Call the list endpoint with that PAT. Assert status 200.

- **List deploy keys works with full-scope PAT.** Create a full-scope PAT for a repo admin. Call the list endpoint. Assert status 200.

- **List deploy keys works with session cookie authentication.** Authenticate via OAuth flow, obtain session cookie. Call the list endpoint with the cookie (as repo admin). Assert status 200.

- **List deploy keys returns only the target repository's keys (no cross-repo leakage).** Create Repo A and Repo B. Add 2 deploy keys to Repo A and 1 deploy key to Repo B. List keys for Repo A. Assert array length 2. List keys for Repo B. Assert array length 1. Assert no key IDs overlap.

- **List deploy keys reflects a just-added key immediately.** List keys (expect N). Add a deploy key. List keys again. Assert array length is N+1 and the new key appears first.

- **List deploy keys reflects a just-deleted key immediately.** Add a deploy key. List keys (note ID). Delete the key. List keys again. Assert the deleted key's ID is not in the response.

- **List deploy keys handles a repository with 50 deploy keys.** Add 50 deploy keys for a single repository. Call the list endpoint. Assert status 200 and array length 50.

- **List deploy keys handles maximum valid deploy key count (100 keys).** Add 100 deploy keys for a single repository. Call the list endpoint. Assert status 200 and array length 100.

- **List deploy keys returns correct fingerprint format.** Generate an ed25519 key locally. Compute the expected SHA256 fingerprint. Add the key as a deploy key. List keys. Assert the returned fingerprint matches the locally computed fingerprint.

- **List deploy keys title field preserves unicode characters.** Add a deploy key with title `"CI サーバー 🔑 tëst"`. List keys. Assert the title field in the response matches exactly.

- **List deploy keys title field preserves maximum-length title (255 characters).** Add a deploy key with a title of exactly 255 characters. List keys. Assert the title field has length 255.

- **List deploy keys on archived repository still works.** Create a repository, archive it. Call the list endpoint as an admin. Assert status 200 (archiving does not prevent listing).

- **List deploy keys returns consistent response under concurrent requests.** Issue 5 concurrent `GET` requests to the list endpoint. Assert all return 200 with identical response bodies.

### CLI E2E Tests

- **`codeplane deploy-key list --repo owner/repo` returns a JSON array.** Run `codeplane deploy-key list --repo <test-repo>`. Assert exit code 0. Parse stdout as JSON. Assert it is an array.

- **`codeplane deploy-key list` shows keys added via CLI.** Run `codeplane deploy-key create --repo <test-repo> --title "test" --key "<valid_key>" --read-only`. Run `codeplane deploy-key list --repo <test-repo>`. Assert the list includes a key with title "test" and `read_only: true`.

- **`codeplane deploy-key list` shows keys added via API.** Add a deploy key via direct `POST /api/repos/:owner/:repo/deploy-keys` call. Run `codeplane deploy-key list --repo <test-repo>`. Assert the list includes the added key.

- **`codeplane deploy-key list` fails without authentication.** Run `codeplane deploy-key list --repo <test-repo>` with no configured token (or cleared token). Assert non-zero exit code and stderr contains an authentication error.

- **`codeplane deploy-key list` fails without admin permission.** Configure a token for a non-admin user. Run `codeplane deploy-key list --repo <test-repo>`. Assert non-zero exit code and stderr contains a permission error.

- **`codeplane deploy-key list` returns empty array when no keys exist.** Ensure repository has no deploy keys. Run `codeplane deploy-key list --repo <test-repo>`. Assert exit code 0 and output is `[]`.

- **`codeplane deploy-key list` round-trip: add, list, delete, list.** Add a deploy key via CLI. List (assert present). Delete the deploy key via CLI. List again (assert absent).

- **`codeplane deploy-key list` infers repo from cwd when --repo is omitted.** Navigate into a cloned repository directory. Run `codeplane deploy-key list` (no `--repo` flag). Assert exit code 0 and the correct repository's deploy keys are listed.

### Web UI E2E Tests (Playwright)

- **Deploy Keys settings page loads and shows the key list.** Log in as a repo admin. Navigate to `/:owner/:repo/settings/deploy-keys`. Assert the page heading "Deploy Keys" is visible.

- **Deploy Keys appears in the settings sidebar navigation.** Log in as a repo admin. Navigate to `/:owner/:repo/settings`. Assert "Deploy Keys" is visible in the settings sidebar and clickable.

- **Empty state is shown when no deploy keys exist.** Log in as admin of a repository with no deploy keys. Navigate to `/:owner/:repo/settings/deploy-keys`. Assert the empty state message is visible and the "Add Deploy Key" call-to-action is present.

- **Deploy key list renders all key attributes.** Pre-add 2 deploy keys via API (one read-only, one read-write). Navigate to `/:owner/:repo/settings/deploy-keys`. Assert 2 key entries are visible. For each entry, assert title, fingerprint (monospace), permission badge, and date are visible.

- **Permission badge distinguishes read-only from read-write.** Pre-add one read-only and one read-write deploy key. Navigate to the deploy keys settings. Assert one entry shows "Read-only" badge and the other shows "Read & Write" badge.

- **Add deploy key button is present and navigable.** Navigate to `/:owner/:repo/settings/deploy-keys`. Assert the "Add Deploy Key" button is visible and clickable.

- **Delete key shows confirmation dialog.** Pre-add a deploy key. Navigate to deploy keys settings. Click the delete button on the key. Assert a confirmation dialog appears with the key title and a warning about revoking SSH access.

- **Delete key confirmation removes the key from the list.** Pre-add a deploy key. Navigate to deploy keys settings. Click delete → confirm. Assert the key is no longer visible in the list without page reload.

- **Delete key cancellation keeps the key in the list.** Pre-add a deploy key. Navigate to deploy keys settings. Click delete → cancel. Assert the key remains visible.

- **Fingerprint text is displayed in monospace and is selectable.** Pre-add a deploy key. Navigate to deploy keys settings. Assert the fingerprint element uses a monospace font family and the text content starts with `SHA256:`.

- **Page shows loading state while fetching.** Navigate to `/:owner/:repo/settings/deploy-keys` with network throttling enabled. Assert a skeleton or loading indicator is visible before the deploy key list renders.

- **Page shows error state on API failure.** Intercept the `GET /api/repos/:owner/:repo/deploy-keys` request and force a 500 response. Navigate to deploy keys settings. Assert an error message is visible with a retry option.

- **Retry button on error state re-fetches the deploy key list.** Force a 500 on first load, then allow the second request to succeed. Click retry. Assert the deploy key list loads correctly.

- **Non-admin user cannot see the Deploy Keys settings section.** Log in as a non-admin repository member. Navigate to `/:owner/:repo/settings`. Assert "Deploy Keys" is NOT visible in the settings sidebar. Directly navigating to `/:owner/:repo/settings/deploy-keys` should show a permission error or redirect.
