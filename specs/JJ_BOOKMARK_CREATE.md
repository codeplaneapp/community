# JJ_BOOKMARK_CREATE

Specification for JJ_BOOKMARK_CREATE.

## High-Level User POV

When a developer is working in a Codeplane repository, they frequently need to create bookmarks—jj's native equivalent of git branches—to mark specific changes as named reference points. Whether they're starting a new feature, tagging a release candidate, or preparing a stack of changes for a landing request, creating a bookmark is one of the most fundamental operations in jj-native collaboration.

From the user's perspective, creating a bookmark should feel instant and natural across every Codeplane surface. In the web UI, a user navigates to the repository's bookmarks page, clicks "New bookmark," types a name, selects which change to target, and confirms. In the CLI, the user runs a single command like `codeplane bookmark create feature/auth --change ksxypqvmruwn`. In the TUI, the user presses `n` on the bookmarks tab, fills in a compact inline form, and hits submit. In editors, the user invokes a command palette action or picker to name a bookmark at the current change.

After creation, the new bookmark immediately appears in the bookmark list across all clients. The user sees the bookmark name, the change ID and commit ID it points to, and whether it tracks a remote. If the user made a mistake—like choosing a name that already exists, using invalid characters, or targeting a change that doesn't exist—they receive a clear, actionable error message that tells them exactly what went wrong and how to fix it.

Bookmark creation is also the entry point for automated workflows. Agents creating landing requests, the `workspace issue` automation flow, and the ticket pipeline all rely on creating bookmarks programmatically. These automation paths need the same guarantees: clear success/failure responses, predictable validation, and immediate visibility of the created bookmark.

The value of this feature is that it closes the loop on jj-native repository manipulation within Codeplane. Without bookmark creation, users would have to drop down to a raw `jj` CLI outside of Codeplane to create bookmarks, breaking their flow. With it, the full lifecycle—create a bookmark, push changes, create a landing request, run workflows—can happen entirely within Codeplane's integrated experience.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `POST /api/repos/:owner/:repo/bookmarks` creates a bookmark in the specified repository and returns the created bookmark object
- [ ] The response shape is `{ name: string, target_change_id: string, target_commit_id: string, is_tracking_remote: boolean }`
- [ ] The CLI command `codeplane bookmark create <name> [--change <id>] [--repo OWNER/REPO]` creates a bookmark and reports success in both human-readable and JSON formats
- [ ] The TUI bookmark creation form (triggered by `n` on the Bookmarks tab) validates input inline and submits to the API
- [ ] The web UI "New bookmark" dialog creates a bookmark via the API with proper validation and optimistic UI feedback
- [ ] All clients agree on the same bookmark response shape and semantic meaning of fields
- [ ] Authentication is required for all bookmark creation operations regardless of repository visibility
- [ ] Write access (Member role or above) is required to create a bookmark
- [ ] The created bookmark immediately appears in subsequent bookmark list responses
- [ ] Protected bookmark patterns are evaluated but do not block creation—they only restrict deletion and direct-push operations
- [ ] The `is_tracking_remote` field on a newly created bookmark is always `false` (newly created bookmarks are local until pushed)

### Boundary Constraints

- **Bookmark name**:
  - Required: must not be empty or consist solely of whitespace
  - Maximum length: 200 characters
  - Character set: alphanumeric (`a-zA-Z0-9`), hyphens (`-`), underscores (`_`), slashes (`/`), and dots (`.`). Regex: `/^[a-zA-Z0-9._\/-]+$/`
  - Must not start or end with a slash (`/`), dot (`.`), or hyphen (`-`)
  - Must not contain consecutive slashes (`//`) or consecutive dots (`..`)
  - Single-character names (e.g., `a`, `1`) are valid
  - Names at exactly 200 characters are accepted
  - Names at 201 characters are rejected with 400
  - Names are case-sensitive: `Feature` and `feature` are distinct bookmarks
- **Target change ID**:
  - Required: must not be empty or consist solely of whitespace
  - Must be a valid jj change ID (hexadecimal string) that exists in the repository
  - If omitted in the CLI local path (no `--change` flag), defaults to the working copy (`@`)
  - In the API path, `target_change_id` is always required and never defaults
- **Request body**: must be valid JSON with `Content-Type: application/json`
- **Repository path parameters**: `owner` and `repo` must be non-empty after trimming
- **Duplicate names**: Bookmark names are unique per repository. Creating a bookmark with a name that already exists returns 409 Conflict

### Edge Cases

- Bookmark name at exactly 200 characters: accepted, created successfully
- Bookmark name at 201 characters: rejected with 400 ("bookmark name must not exceed 200 characters")
- Bookmark name with Unicode characters outside the allowed set (e.g., `feature/日本語`): rejected with 400
- Bookmark name `feature/v1.2-beta_3`: accepted (all characters are in the allowed set)
- Bookmark name starting with `/`: rejected with 400
- Bookmark name ending with `.`: rejected with 400
- Bookmark name containing `..`: rejected with 400 ("bookmark name must not contain consecutive dots")
- Bookmark name containing `//`: rejected with 400 ("bookmark name must not contain consecutive slashes")
- Bookmark name that is a single valid character (`a`): accepted
- Bookmark name that is entirely dots (`...`): rejected with 400
- Empty JSON body `{}`: rejected with 400 ("bookmark name is required")
- Missing `target_change_id` field: rejected with 400 ("target_change_id is required")
- `target_change_id` that does not exist in the repository: rejected with 422
- Duplicate bookmark name: rejected with 409 ("bookmark already exists")
- Unauthenticated request: rejected with 401
- Read-only user: rejected with 403
- Non-existent repository: rejected with 404
- Private repository accessed by non-collaborator: rejected with 404 (not 403, to avoid leaking existence)
- Request body is not valid JSON: rejected with 400 ("invalid request body")
- Extremely long `target_change_id` (>1000 chars): rejected before passing to jj subprocess
- Concurrent creation of the same bookmark name: one succeeds, the other receives 409
- Repository disk is full: jj subprocess fails, server returns 500
- jj binary unavailable: server returns 500 with structured error

## Design

### API Shape

**Create Bookmark**

```
POST /api/repos/:owner/:repo/bookmarks
```

Request headers:
- `Content-Type: application/json` (required)
- `Authorization: Bearer <token>` or session cookie (required)

Request body:
```json
{
  "name": "feature/auth",
  "target_change_id": "ksxypqvmruwn"
}
```

Response `201 Created`:
```json
{
  "name": "feature/auth",
  "target_change_id": "ksxypqvmruwn",
  "target_commit_id": "abc12345def067890123456789abcdef01234567",
  "is_tracking_remote": false
}
```

Error responses:
- `400 Bad Request`: invalid or missing parameters (empty name, invalid characters, name too long, missing target_change_id, invalid JSON)
- `401 Unauthorized`: authentication required
- `403 Forbidden`: user lacks write access to the repository
- `404 Not Found`: repository does not exist, or private repository and caller is not a collaborator
- `409 Conflict`: bookmark with that name already exists in this repository
- `422 Unprocessable Entity`: target_change_id does not exist in the repository
- `429 Too Many Requests`: rate limited, includes `Retry-After` header
- `500 Internal Server Error`: jj subprocess failure, disk error, or unexpected server error

### SDK Shape

The `RepoHostService` in `@codeplane/sdk` provides:

```typescript
interface CreateBookmarkRequest {
  name: string;
  target_change_id: string;
}

interface Bookmark {
  name: string;
  target_change_id: string;
  target_commit_id: string;
  is_tracking_remote: boolean;
}

createBookmark(
  owner: string,
  repo: string,
  req: CreateBookmarkRequest,
): Promise<Result<Bookmark, APIError>>
```

The implementation:
1. Resolves and validates the repository path via `ensureRepo(owner, repo)`
2. Executes `jj bookmark create <name> -r <target_change_id>` via subprocess
3. Fetches the created bookmark's details (commit ID, change ID) via `jj log`
4. Returns the bookmark object with `is_tracking_remote: false`

The database layer provides `upsertBookmark()` to persist bookmark metadata for indexed querying.

### CLI Command

```
codeplane bookmark create <name> [--change <id>] [--repo OWNER/REPO] [--json]
```

Arguments:
- `name` (required, positional): the bookmark name to create

Options:
- `--change <id>` (optional): the target change ID. When omitted and operating locally, defaults to the working copy (`@`)
- `--repo OWNER/REPO` (optional): when provided, creates the bookmark via the Codeplane API instead of the local jj repository
- `--json` (flag): output the result as structured JSON

Behavior:
- **Local mode** (no `--repo`): executes `jj bookmark create <name> [-r <changeId>]` in the current working directory's jj repository, then fetches and displays the created bookmark's details
- **API mode** (with `--repo`): sends `POST /api/repos/:owner/:repo/bookmarks` with the name and change ID
- Human-readable output: `Created bookmark feature/auth at ksxypqvmruwn`
- JSON output: `{ "name": "feature/auth", "target_change_id": "ksxypqvmruwn", "target_commit_id": "abc123..." }`
- Exit code 0 on success, non-zero on any error
- Errors are printed to stderr with a clear message (e.g., "Error: bookmark 'feature/auth' already exists")

### TUI UI

Bookmark creation in the TUI is triggered by pressing `n` on the Bookmarks tab (requires write access).

**Creation form layout:**
```
┌─ Create Bookmark ────────────────────────┐
│ Name:      [________________________________] │
│ Change ID: [________________________________] │
│                                              │
│           [Ctrl+S Create]  [Esc Cancel]     │
└──────────────────────────────────────────────┘
```

**Interactions:**
- `n`: opens the creation form as an inline overlay at the bottom of the bookmark list
- `Tab` / `Shift+Tab`: move between form fields
- `Ctrl+S`: submit the form
- `Esc`: cancel and close the form
- Form validates inline: shows red error text below each field on validation failure
- On successful creation: form closes, new bookmark appears in the list (optimistic update), status bar shows "Bookmark 'name' created"
- On server error: form stays open, error message shown inline below the submit button
- On validation error (400): form stays open, specific field highlighted with error message

**Permission gating:**
- If the user has read-only access, pressing `n` shows a brief status message: "Insufficient permissions to create bookmarks"
- The `n` keybinding hint is hidden from the help bar for read-only users

### Web UI Design

The web UI bookmark creation flow lives within the `/:owner/:repo/bookmarks` page.

**Entry point:**
- A "New bookmark" button in the page header, visible only to users with write access
- The button is hidden (not disabled) for read-only and anonymous users

**Creation dialog:**
- Modal dialog with two fields:
  - **Name** (text input): placeholder "e.g., feature/auth", character counter showing `{current}/{200}`, inline validation on blur
  - **Target Change ID** (text input or picker): placeholder "e.g., ksxypqvmruwn", with optional change picker/autocomplete from recent changes
- Submit button: "Create Bookmark" (disabled until both fields are non-empty and valid)
- Cancel button: closes the dialog without action
- Loading state: submit button shows spinner, fields become read-only during submission
- Success: dialog closes, bookmark list refreshes, toast notification "Bookmark 'name' created"
- Error: dialog stays open, error message shown above the submit button
- Pressing `Escape` or clicking the backdrop closes the dialog

**Validation feedback:**
- Name too long: "Name must be 200 characters or fewer" (character count turns red)
- Invalid characters: "Name may only contain letters, numbers, hyphens, underscores, slashes, and dots"
- Starts/ends with invalid character: "Name must not start or end with a slash, dot, or hyphen"
- Consecutive slashes or dots: "Name must not contain consecutive slashes or dots"
- Empty name: "Bookmark name is required" (shown on blur or submit)
- Empty change ID: "Target change ID is required" (shown on blur or submit)

### VS Code Extension

The VS Code extension supports bookmark creation through:

- **Command palette**: `Codeplane: Create Bookmark` command
  - Prompts for bookmark name via input box with validation
  - Prompts for target change ID via quick pick (recent changes) or manual input
  - Shows progress notification during creation
  - Shows success/error notification on completion
- **Bookmarks tree view**: context menu "Create Bookmark" or inline button that opens the same input flow
- **After creation**: the bookmarks tree view refreshes automatically

### Neovim Plugin

The Neovim plugin supports bookmark creation through:

- `:Codeplane bookmark-create` command
  - Opens an input prompt for bookmark name
  - Opens a Telescope picker for target change (from recent changes) or accepts manual input
  - Shows success/error in the command line / notification area
- Lua API: `require('codeplane').bookmark_create({ name = "...", change_id = "..." })`
- After creation: any open bookmark list buffer refreshes

### Documentation

The following end-user documentation should be written:

- **CLI reference**: `codeplane bookmark create` — usage, arguments, options (`--change`, `--repo`, `--json`), examples of local and API-mode creation, error messages, exit codes
- **API reference**: `POST /api/repos/:owner/:repo/bookmarks` — full request/response documentation with headers, body schema, response schema, all error codes, and examples for success, duplicate, invalid name, and missing change ID
- **TUI guide**: Creating bookmarks section — form keyboard shortcuts, validation messages, permission requirements
- **Web UI guide**: Creating bookmarks section — dialog workflow, validation messages, permission requirements
- **Concepts guide**: Addition to "What are jj bookmarks" covering bookmark creation semantics, relationship to `jj bookmark create`, name constraints, and how created bookmarks relate to landing requests and workflows

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write (Member) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| Create bookmark (public repo) | ❌ (401) | ❌ (403) | ✅ | ✅ | ✅ |
| Create bookmark (private repo) | ❌ (404) | ❌ (403) | ✅ | ✅ | ✅ |

Notes:
- Anonymous users always receive 401 (or 404 for private repos to avoid existence leakage)
- Read-only collaborators receive 403 with a clear message ("write access required to create bookmarks")
- Write-access members, admins, and owners can create bookmarks
- Protected bookmark patterns do **not** block bookmark creation — they only apply to deletion, direct push, and landing enforcement
- Organization-level team permissions that grant write access also enable bookmark creation

### Rate Limiting

- Authenticated users: 5,000 requests per hour (shared budget across all API endpoints)
- Bookmark creation specifically: subject to a tighter burst limit of **30 creates per minute per user** to prevent bookmark spam
- Unauthenticated users: cannot create bookmarks (401 before rate limit applies)
- 429 responses include `Retry-After` header with seconds until retry is allowed
- No automatic retry on 429 in any client; user must manually retry or wait
- Rate limit counters are per-user, not per-repository

### Data Privacy

- Bookmark names, change IDs, and commit IDs are not PII
- Creation requests and responses do not contain PII
- Auth tokens are never logged, displayed in error messages, or included in telemetry events
- Bookmark creation requests for private repos must verify repository access before any operation
- The `target_change_id` is passed to a jj subprocess; it must be sanitized to prevent command injection (validated as hexadecimal alphanumeric characters only, max length enforced)
- jj subprocess stderr output may contain filesystem paths; these must be sanitized or truncated before including in API error responses

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `bookmark.created` | Bookmark successfully created | `repo_full_name`, `bookmark_name_length`, `has_explicit_change_id`, `client` (api/cli/tui/web/vscode/nvim), `latency_ms` |
| `bookmark.create.failed` | Bookmark creation failed | `repo_full_name`, `error_type` (validation, conflict, auth, permission, not_found, server_error), `http_status`, `client` |
| `bookmark.create.validation_error` | Client-side validation prevented submission | `repo_full_name`, `validation_field` (name/change_id), `validation_rule` (empty/too_long/invalid_chars/consecutive_dots/etc.), `client` |
| `bookmark.create.form_opened` | User opened the create bookmark form/dialog | `repo_full_name`, `client` |
| `bookmark.create.form_cancelled` | User cancelled the create bookmark form/dialog | `repo_full_name`, `time_in_form_ms`, `had_input`, `client` |
| `bookmark.create.duplicate_attempted` | User attempted to create a bookmark with an existing name | `repo_full_name`, `client` |
| `bookmark.create.permission_denied` | User attempted creation without write access | `repo_full_name`, `user_role`, `client` |

### Funnel Metrics and Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Create success rate | >95% | Percentage of create attempts (form submitted / command run) that result in a successful 201 |
| Form-to-submit rate | >70% | Percentage of users who open the create form and actually submit it |
| Client-side validation catch rate | Track | Percentage of invalid inputs caught before server round-trip |
| Time-to-create (p50) | <1s | End-to-end latency from submit to success response |
| Duplicate name error rate | <5% | Percentage of creates that fail due to existing name |
| Cross-client create distribution | Track | Distribution of bookmark creates across API, CLI, TUI, Web, VS Code, Neovim |
| Programmatic vs. interactive create ratio | Track | Percentage of creates from automation (agent/workflow) vs. human-driven clients |
| Post-create navigation rate | >60% | Percentage of users who view the created bookmark's change detail within 5 minutes |

## Observability

### Logging

| Log Level | Event | Structured Context |
|-----------|-------|-------------------|
| `info` | Bookmark created successfully | `repo_owner`, `repo_name`, `bookmark_name`, `target_change_id`, `latency_ms`, `actor_id` |
| `warn` | Bookmark creation failed — validation error | `repo_owner`, `repo_name`, `error_message`, `field`, `value_length`, `actor_id` |
| `warn` | Bookmark creation failed — duplicate name | `repo_owner`, `repo_name`, `bookmark_name`, `actor_id` |
| `warn` | Bookmark creation failed — permission denied | `repo_owner`, `repo_name`, `actor_id`, `actor_role` |
| `warn` | Bookmark creation rate limited | `repo_owner`, `repo_name`, `actor_id`, `retry_after_seconds` |
| `warn` | jj subprocess failed during bookmark create | `repo_owner`, `repo_name`, `exit_code`, `stderr` (truncated to 500 chars), `duration_ms` |
| `error` | Unexpected error in bookmark create handler | `repo_owner`, `repo_name`, `error_type`, `stack_trace` |
| `debug` | Bookmark create request received | `repo_owner`, `repo_name`, `bookmark_name_length`, `has_change_id` |
| `debug` | jj CLI command executed for bookmark create | `repo_path` (hashed), `args` (sanitized—no tokens), `exit_code`, `duration_ms` |
| `debug` | Bookmark details fetched after creation | `repo_owner`, `repo_name`, `commit_id`, `change_id`, `fetch_duration_ms` |

All logs must use structured JSON format. Sensitive data (tokens, full file paths with user directories, raw request bodies) must never appear in log output.

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `codeplane_bookmark_create_requests_total` | Counter | `owner`, `repo`, `status_code` | Total bookmark create requests |
| `codeplane_bookmark_create_duration_seconds` | Histogram | `owner`, `repo` | End-to-end request duration (buckets: 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) |
| `codeplane_bookmark_create_errors_total` | Counter | `owner`, `repo`, `error_type` | Bookmark create errors by type (validation, conflict, auth, permission, jj_failure, internal) |
| `codeplane_bookmark_create_validation_failures_total` | Counter | `field`, `rule` | Client-reported validation failures by field and rule |
| `codeplane_jj_subprocess_duration_seconds` | Histogram | `command` | jj CLI subprocess execution time (bookmark_create specifically) |
| `codeplane_jj_subprocess_failures_total` | Counter | `command`, `exit_code` | jj CLI subprocess failures |
| `codeplane_bookmark_create_duplicate_total` | Counter | `owner`, `repo` | Duplicate bookmark name attempts |

### Alerts

**Alert: BookmarkCreateHighErrorRate**
- Condition: `rate(codeplane_bookmark_create_errors_total{error_type!~"validation|conflict|auth|permission"}[5m]) / rate(codeplane_bookmark_create_requests_total[5m]) > 0.1`
- Severity: Warning
- Runbook:
  1. Check `codeplane_bookmark_create_errors_total` by `error_type` to identify the dominant failure mode
  2. If `error_type=jj_failure`: verify `jj` binary is installed and accessible (`which jj`); check repository paths exist under `CODEPLANE_DATA_DIR/repos/`; check disk space with `df -h`; inspect jj stderr in structured logs for specific errors
  3. If `error_type=internal`: check application logs for stack traces; look for OOM, connection pool exhaustion, or unhandled promise rejections
  4. Verify that recent deployments did not break jj subprocess invocation paths
  5. Check if a specific repository is causing all failures (single corrupt repo) vs. systemic failure
  6. Escalate if error rate exceeds 20% or persists beyond 15 minutes

**Alert: BookmarkCreateHighLatency**
- Condition: `histogram_quantile(0.95, rate(codeplane_bookmark_create_duration_seconds_bucket[5m])) > 5`
- Severity: Warning
- Runbook:
  1. Check `codeplane_jj_subprocess_duration_seconds{command="bookmark_create"}` — if jj subprocess is slow, the bottleneck is repository I/O
  2. Check disk I/O metrics (`iowait`, `await`) on the server — high values indicate storage saturation
  3. Check if a specific large repository is causing outlier latency
  4. Verify no repository lock contention (jj operations should be lock-free, but verify if concurrent operations are queuing)
  5. Consider repository maintenance if operation counts are very high
  6. Escalate if p95 exceeds 10 seconds

**Alert: JjSubprocessCreateFailureSpike**
- Condition: `rate(codeplane_jj_subprocess_failures_total{command="bookmark_create"}[5m]) > 2`
- Severity: Critical
- Runbook:
  1. Immediately verify `jj` binary is accessible: `which jj` on the server
  2. Check jj version: `jj --version` — ensure compatibility with expected version
  3. Check disk space: `df -h CODEPLANE_DATA_DIR`
  4. Check repository integrity: look for jj stderr messages in structured logs (e.g., "concurrent operation", "repository corrupted")
  5. If jj stderr mentions "name already exists" or similar, this may be a race condition in concurrent creates — investigate request patterns
  6. If jj binary is missing or corrupt, redeploy or reinstall
  7. If repositories are corrupt, attempt `jj debug reindex` or restore from backup
  8. Escalate immediately if more than 5 repos are affected

**Alert: BookmarkDuplicateNameSpike**
- Condition: `rate(codeplane_bookmark_create_duplicate_total[5m]) > 10`
- Severity: Info
- Runbook:
  1. Check if a single user or automation is repeatedly attempting the same bookmark name (may indicate a buggy script or agent loop)
  2. Review request logs to identify the pattern — is it the same bookmark name or many different duplicates?
  3. If a single user: check if their client is not handling 409 responses correctly (missing error handling → retry loop)
  4. If widespread: check if there's a UI bug causing double-submit
  5. No immediate action required unless accompanied by elevated error rates

### Error Cases and Failure Modes

| Error Case | Detection | Expected Behavior |
|------------|-----------|-------------------|
| Invalid bookmark name (empty, too long, bad chars) | Server-side validation | Return 400 with specific validation message, log at warn |
| Duplicate bookmark name | jj subprocess error or pre-check | Return 409, log at warn |
| Target change ID not found | jj subprocess error | Return 422, log at warn |
| Repository not found | Repo lookup failure | Return 404, log at debug |
| User lacks write access | Permission check | Return 403, log at warn |
| jj binary not installed | Subprocess spawn error | Return 500, log at error, alert fires |
| jj subprocess timeout (>30s) | Process timeout | Kill subprocess, return 500, log at error |
| jj subprocess returns unexpected output | Parse failure | Return 500 with generic message, log at error with raw output (truncated) |
| Disk full during jj operation | jj stderr | Return 500, log at error |
| Repository path missing on disk | `access()` check fails | Return 500, log at error |
| Concurrent creation of same name | Race condition | One succeeds (201), other fails (409) |
| Request body too large (>1MB) | Middleware body size limit | Return 413, log at warn |
| Malformed JSON body | JSON parse error | Return 400 ("invalid request body") |
| Network timeout between client and server | Client-side timeout | Client shows error, user retries |

## Verification

### API Integration Tests (`e2e/api/bookmark-create.test.ts`)

1. **`api-bookmark-create-success`** — Create a bookmark with valid name and change ID, verify 201 response with correct shape (`name`, `target_change_id`, `target_commit_id`, `is_tracking_remote: false`)
2. **`api-bookmark-create-response-shape`** — Validate every field type: `name` is string, `target_change_id` is string, `target_commit_id` is 40-char hex string, `is_tracking_remote` is boolean
3. **`api-bookmark-create-appears-in-list`** — Create a bookmark, then `GET /bookmarks`, verify the new bookmark appears in the list
4. **`api-bookmark-create-with-slash-in-name`** — Create bookmark `feature/auth`, verify 201 success
5. **`api-bookmark-create-with-dots-in-name`** — Create bookmark `release.v1.2`, verify 201 success
6. **`api-bookmark-create-with-hyphens-underscores`** — Create bookmark `fix_auth-bug`, verify 201 success
7. **`api-bookmark-create-complex-valid-name`** — Create bookmark `feature/v1.2-beta_3`, verify 201 success
8. **`api-bookmark-create-single-char-name`** — Create bookmark `a`, verify 201 success
9. **`api-bookmark-create-max-length-name`** — Create bookmark with exactly 200-character name, verify 201 success
10. **`api-bookmark-create-exceeds-max-length`** — Create bookmark with 201-character name, verify 400 response with appropriate message
11. **`api-bookmark-create-empty-name`** — Send `{ "name": "", "target_change_id": "..." }`, verify 400 ("bookmark name is required")
12. **`api-bookmark-create-whitespace-only-name`** — Send `{ "name": "   ", "target_change_id": "..." }`, verify 400
13. **`api-bookmark-create-missing-name-field`** — Send `{ "target_change_id": "..." }`, verify 400
14. **`api-bookmark-create-empty-change-id`** — Send `{ "name": "test", "target_change_id": "" }`, verify 400 ("target_change_id is required")
15. **`api-bookmark-create-missing-change-id-field`** — Send `{ "name": "test" }`, verify 400
16. **`api-bookmark-create-invalid-characters-unicode`** — Name containing Unicode (`feature/日本語`), verify 400
17. **`api-bookmark-create-invalid-characters-spaces`** — Name containing spaces (`my bookmark`), verify 400
18. **`api-bookmark-create-name-starts-with-slash`** — Name `/feature`, verify 400
19. **`api-bookmark-create-name-ends-with-dot`** — Name `feature.`, verify 400
20. **`api-bookmark-create-name-starts-with-hyphen`** — Name `-feature`, verify 400
21. **`api-bookmark-create-name-ends-with-hyphen`** — Name `feature-`, verify 400
22. **`api-bookmark-create-name-ends-with-slash`** — Name `feature/`, verify 400
23. **`api-bookmark-create-consecutive-slashes`** — Name `feature//auth`, verify 400
24. **`api-bookmark-create-consecutive-dots`** — Name `feature..auth`, verify 400
25. **`api-bookmark-create-duplicate-name`** — Create bookmark, then attempt to create another with same name, verify 409
26. **`api-bookmark-create-nonexistent-change-id`** — Provide a change ID that doesn't exist in the repo, verify 422
27. **`api-bookmark-create-unauthenticated`** — No auth header, verify 401
28. **`api-bookmark-create-readonly-user`** — Authenticate as read-only collaborator, verify 403
29. **`api-bookmark-create-write-user`** — Authenticate as write-access member, verify 201
30. **`api-bookmark-create-admin-user`** — Authenticate as admin, verify 201
31. **`api-bookmark-create-owner-user`** — Authenticate as owner, verify 201
32. **`api-bookmark-create-nonexistent-repo`** — `POST /api/repos/owner/nonexistent/bookmarks`, verify 404
33. **`api-bookmark-create-private-repo-non-collaborator`** — Private repo, auth as non-collaborator, verify 404
34. **`api-bookmark-create-missing-owner`** — Empty owner parameter, verify 400
35. **`api-bookmark-create-missing-repo`** — Empty repo parameter, verify 400
36. **`api-bookmark-create-invalid-json-body`** — Send malformed JSON, verify 400 ("invalid request body")
37. **`api-bookmark-create-empty-json-body`** — Send `{}`, verify 400
38. **`api-bookmark-create-is-tracking-remote-false`** — Newly created bookmark always has `is_tracking_remote: false`
39. **`api-bookmark-create-case-sensitive`** — Create `Feature`, then create `feature`, both succeed (distinct bookmarks)
40. **`api-bookmark-create-rate-limit`** — Exceed burst limit (30 creates per minute), verify 429 with `Retry-After` header
41. **`api-bookmark-create-concurrent-same-name`** — Fire 5 concurrent creates with the same name, verify exactly 1 succeeds (201) and others fail (409)
42. **`api-bookmark-create-concurrent-different-names`** — Fire 5 concurrent creates with different names, all succeed (201)

### CLI Integration Tests (`e2e/cli/bookmark-create.test.ts`)

43. **`cli-bookmark-create-local-success`** — `codeplane bookmark create test-branch` in a local jj repo, verify exit code 0 and success message
44. **`cli-bookmark-create-local-with-change`** — `codeplane bookmark create test-branch --change <id>`, verify bookmark points to specified change
45. **`cli-bookmark-create-local-default-to-working-copy`** — `codeplane bookmark create test-branch` (no `--change`), verify bookmark points to current working copy
46. **`cli-bookmark-create-json-output`** — `codeplane bookmark create test-branch --json`, verify valid JSON with `name`, `target_change_id`, `target_commit_id`
47. **`cli-bookmark-create-human-output`** — `codeplane bookmark create test-branch`, verify output matches "Created bookmark test-branch at ..."
48. **`cli-bookmark-create-appears-in-list`** — Create bookmark, then `codeplane bookmark list`, verify new bookmark appears
49. **`cli-bookmark-create-duplicate-fails`** — Create bookmark, attempt same name again, verify non-zero exit code and error message
50. **`cli-bookmark-create-empty-name-fails`** — `codeplane bookmark create ""`, verify non-zero exit code
51. **`cli-bookmark-create-api-mode`** — `codeplane bookmark create test --repo OWNER/REPO --change <id>`, verify creates via API
52. **`cli-bookmark-create-api-empty-name-fails`** — `codeplane api /api/repos/OWNER/REPO/bookmarks --method POST -f name= -f target_change_id=xxx`, verify non-zero exit code
53. **`cli-bookmark-create-api-empty-change-id-fails`** — `codeplane api /api/repos/OWNER/REPO/bookmarks --method POST -f name=test -f target_change_id=`, verify non-zero exit code

### TUI Interaction Tests (`e2e/tui/bookmark-create.test.ts`)

54. **`tui-bookmark-create-n-opens-form`** — On Bookmarks tab with write access, press `n`, creation form appears
55. **`tui-bookmark-create-form-layout`** — Form shows Name field, Change ID field, Ctrl+S and Esc hints
56. **`tui-bookmark-create-submit-success`** — Fill valid name and change ID, press Ctrl+S, form closes, bookmark appears in list, status shows "Bookmark created"
57. **`tui-bookmark-create-submit-empty-name`** — Leave name empty, press Ctrl+S, inline error "Bookmark name is required"
58. **`tui-bookmark-create-submit-empty-change-id`** — Leave change ID empty, press Ctrl+S, inline error "Change ID is required"
59. **`tui-bookmark-create-esc-cancels`** — Open form, type in name, press Esc, form closes, no bookmark created
60. **`tui-bookmark-create-duplicate-error`** — Submit name that already exists, form stays open, error "Bookmark already exists"
61. **`tui-bookmark-create-n-blocked-readonly`** — Read-only user, press `n`, status shows "Insufficient permissions"
62. **`tui-bookmark-create-tab-between-fields`** — Press Tab, focus moves from Name to Change ID; Shift+Tab moves back
63. **`tui-bookmark-create-server-error-keeps-form`** — Server returns 500, form stays open, error message displayed
64. **`tui-bookmark-create-optimistic-update`** — On success, bookmark appears in list before next full refresh

### Web UI Playwright Tests (`e2e/web/bookmark-create.test.ts`)

65. **`web-bookmark-create-button-visible-write`** — Navigate to bookmarks page as write-access user, "New bookmark" button is visible
66. **`web-bookmark-create-button-hidden-readonly`** — Navigate as read-only user, "New bookmark" button is not in the DOM
67. **`web-bookmark-create-button-hidden-anonymous`** — Navigate as unauthenticated user to public repo, "New bookmark" button is not visible
68. **`web-bookmark-create-dialog-opens`** — Click "New bookmark", dialog appears with Name and Change ID fields
69. **`web-bookmark-create-dialog-submit-success`** — Fill valid name and change ID, click "Create Bookmark", dialog closes, bookmark appears in list, toast notification shown
70. **`web-bookmark-create-dialog-name-validation-empty`** — Clear name field, blur or submit, "Bookmark name is required" error shown
71. **`web-bookmark-create-dialog-name-validation-too-long`** — Type 201-char name, character counter turns red, submit button remains disabled
72. **`web-bookmark-create-dialog-name-validation-invalid-chars`** — Type name with spaces, inline error "Name may only contain letters, numbers, hyphens, underscores, slashes, and dots"
73. **`web-bookmark-create-dialog-change-id-validation-empty`** — Clear change ID, blur or submit, "Target change ID is required" error shown
74. **`web-bookmark-create-dialog-duplicate-name-error`** — Submit existing bookmark name, dialog stays open, error "A bookmark named '...' already exists"
75. **`web-bookmark-create-dialog-cancel`** — Click Cancel or press Escape, dialog closes, no bookmark created
76. **`web-bookmark-create-dialog-loading-state`** — During submission, submit button shows spinner, fields are read-only
77. **`web-bookmark-create-dialog-server-error`** — Server returns 500, dialog stays open, generic error message shown
78. **`web-bookmark-create-character-counter`** — Type in name field, character counter updates in real-time and shows `{n}/200`
79. **`web-bookmark-create-submit-disabled-until-valid`** — Submit button is disabled when either field is empty, enabled when both have valid content
80. **`web-bookmark-create-keyboard-escape-closes`** — Press Escape, dialog closes
81. **`web-bookmark-create-backdrop-click-closes`** — Click outside the dialog, it closes
