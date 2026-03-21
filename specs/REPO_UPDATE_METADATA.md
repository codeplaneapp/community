# REPO_UPDATE_METADATA

Specification for REPO_UPDATE_METADATA.

## High-Level User POV

When you own or administer a Codeplane repository, you need to keep its metadata current as the project evolves. The repository's description, visibility, default bookmark, and topics are the public-facing identity of the project — they determine how the repository appears in search results, on your profile, in team dashboards, and across every Codeplane client surface.

Updating repository metadata is a quick, low-friction operation available everywhere you work in Codeplane. From the web UI's repository settings page, you edit fields inline and save with a single keystroke. From the CLI, a one-liner command lets you change the description, toggle visibility, or update the default bookmark without opening a browser. In the TUI, a dedicated settings tab provides a full form-based editing experience with keyboard navigation. Every change you make is reflected immediately across all clients — the web dashboard, CLI output, TUI views, editor sidebars, and search indexes all show the updated values.

Visibility control is one of the most consequential metadata changes. Flipping a repository from public to private immediately restricts who can see it, and the reverse makes it discoverable to everyone. Because of this, visibility changes require explicit confirmation. Topics let you categorize your repository with standardized tags, making it discoverable through Codeplane's search and improving organization for teams with many repositories. The default bookmark tells Codeplane which jj bookmark to treat as the primary entry point for browsing, diffs, and landing request targets.

All metadata updates are server-authoritative: the API validates every field, rejects invalid input with clear error messages, and returns the complete updated repository state. Clients display optimistic updates for responsiveness but revert cleanly if the server rejects the change.

## Acceptance Criteria

### Definition of Done

- [ ] Authenticated users with admin or owner permission on a repository can update its description, visibility, default bookmark, and topics via `PATCH /api/repos/:owner/:repo`
- [ ] The API accepts a partial update payload — only fields present in the request body are modified; omitted fields retain their current values
- [ ] The API returns the complete updated repository object (HTTP 200) after a successful update
- [ ] The `updated_at` timestamp is refreshed to the current server time on every successful update
- [ ] All clients (web UI, CLI, TUI) can trigger metadata updates and display the result
- [ ] Unauthenticated requests receive HTTP 401
- [ ] Authenticated users without admin permission receive HTTP 403
- [ ] Updates to non-existent repositories return HTTP 404
- [ ] Updates to archived repositories for description, default bookmark, and topics are rejected (archive must be lifted first)
- [ ] Empty payloads (`{}`) are accepted and return the current repository state unchanged (no-op update)

### Field Constraints

**Description:**
- Type: string (optional)
- Maximum length: 1024 characters
- Supports Unicode (emoji, CJK, accented characters, RTL text)
- May be set to an empty string `""` to clear the description
- Leading/trailing whitespace is preserved as-is (no trimming)

**Visibility (`private`):**
- Type: boolean (optional)
- `true` makes the repository private; `false` makes it public
- Changing visibility requires explicit confirmation in interactive clients (web UI, TUI)
- The inverse `is_public` field in the response always reflects the opposite of `private`

**Default Bookmark (`default_bookmark`):**
- Type: string (optional)
- Must not be empty or whitespace-only after trimming
- Leading/trailing whitespace is trimmed before storage
- Defaults to `"main"` if an empty string is submitted
- The bookmark does not need to exist in the repository — this is a metadata preference, not a ref validation

**Topics:**
- Type: array of strings (optional)
- Each topic: 1–35 characters, lowercase alphanumeric and hyphens only
- Each topic must match the pattern `^[a-z0-9][a-z0-9-]{0,34}$`
- Topics are normalized to lowercase and trimmed before validation
- Duplicate topics within the array are silently deduplicated
- An empty array `[]` clears all topics
- Maximum 20 topics per repository (client-enforced; server accepts the array as-is after normalization)

**Name:**
- Type: string (optional)
- Name changes are currently **rejected** by the service layer — submitting a name that differs from the current name returns a validation error
- If the same name is submitted, the request proceeds normally (no-op for the name field)
- Name validation rules (for forward compatibility): 1–100 characters, must match `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`, cannot end with `.git`, cannot be a reserved name (`agent`, `bookmarks`, `changes`, `commits`, `contributors`, `issues`, `labels`, `landings`, `milestones`, `operations`, `pulls`, `settings`, `stargazers`, `watchers`, `workflows`)

### Edge Cases

- Submitting `{ "name": "<current_name>" }` succeeds (no-op)
- Submitting `{ "name": "different-name" }` returns HTTP 422 with validation error
- Submitting `{ "topics": ["RUST", "jj"] }` normalizes to `["rust", "jj"]`
- Submitting `{ "topics": ["rust", "rust", "jj"] }` deduplicates to `["rust", "jj"]`
- Submitting `{ "topics": ["invalid topic!"] }` returns HTTP 422 validation error
- Submitting `{ "default_bookmark": "   " }` returns HTTP 422 (empty after trimming)
- Submitting `{ "default_bookmark": "" }` causes default bookmark to become `"main"` (normalized)
- Submitting `{ "private": true }` on an already-private repo succeeds (idempotent)
- Submitting a description of exactly 1024 characters succeeds
- Submitting a description of 1025 characters is rejected
- Concurrent updates: last-write-wins semantics; `updated_at` always reflects the latest write
- Repository name collision on unique constraint (theoretical, since name changes are blocked): returns HTTP 409

## Design

### API Shape

**Endpoint:** `PATCH /api/repos/:owner/:repo`

**Authentication:** Required (session cookie, PAT, or OAuth2 token)

**Request Headers:**
- `Content-Type: application/json` (enforced by middleware)
- `Authorization: token <PAT>` (alternative to cookie)

**Request Body:**
```json
{
  "name": "string (optional, must match current name)",
  "description": "string (optional)",
  "private": "boolean (optional)",
  "default_bookmark": "string (optional)",
  "topics": ["string (optional array)"]
}
```

**Success Response (HTTP 200):**
```json
{
  "id": 42,
  "owner": "alice",
  "name": "my-repo",
  "full_name": "alice/my-repo",
  "description": "Updated description",
  "private": false,
  "is_public": true,
  "default_bookmark": "main",
  "topics": ["jj", "forge"],
  "is_archived": false,
  "is_fork": false,
  "num_stars": 12,
  "num_forks": 3,
  "num_watches": 5,
  "num_issues": 7,
  "clone_url": "git@codeplane.io:alice/my-repo.git",
  "created_at": "2025-01-15T10:30:00.000Z",
  "updated_at": "2026-03-21T14:22:00.000Z"
}
```

**Error Responses:**
- `401 Unauthorized`: `{ "message": "authentication required" }`
- `403 Forbidden`: `{ "message": "permission denied" }`
- `404 Not Found`: Repository does not exist or is private and requester lacks access
- `409 Conflict`: `{ "message": "repository name already exists" }` (unique constraint violation)
- `422 Unprocessable Entity`: `{ "message": "Validation Failed", "errors": [{ "resource": "Repository", "field": "name|topics|default_bookmark", "code": "invalid|missing_field" }] }`
- `429 Too Many Requests`: Rate limit exceeded

### SDK Shape

The `RepoService.updateRepo()` method in `@codeplane/sdk` accepts:
- `actor: RepoActor | null` — the authenticated user context
- `owner: string` — the repository owner username or org name
- `repo: string` — the repository name
- `req: UpdateRepoRequest` — the partial update payload

It returns `Result<RepoRow, APIError>` — either the full updated repository row or a typed API error.

The `UpdateRepoRequest` interface:
```typescript
interface UpdateRepoRequest {
  name?: string;
  description?: string;
  private?: boolean;
  default_bookmark?: string;
  topics?: string[];
}
```

### CLI Command

**Command:** `codeplane repo edit <OWNER/REPO> [options]`

**Options:**
- `--description <string>` — Set repository description
- `--private` / `--no-private` — Set repository visibility (boolean flag)
- `--name <string>` — Set repository name (currently rejected if different from current)
- `--default-bookmark <string>` — Set default bookmark (to be added)
- `--topic <string>` (repeatable) or `--topics <comma-separated>` — Set topics (to be added)

**Output (default):** `Updated repository alice/my-repo`

**Output (--json):** Full `RepoResponse` JSON object

**Examples:**
```bash
# Update description
codeplane repo edit alice/my-repo --description "A jj-native forge"

# Toggle to private
codeplane repo edit alice/my-repo --private

# Toggle to public
codeplane repo edit alice/my-repo --no-private

# Update default bookmark
codeplane repo edit alice/my-repo --default-bookmark develop

# Structured output
codeplane repo edit alice/my-repo --description "New desc" --json
```

### TUI UI

The TUI settings tab (tab `6`) within the repository detail screen provides the metadata editing surface.

**General Section:**
- `Name` — displayed but editing triggers the API call (which rejects name changes with a clear inline error)
- `Description` — inline textarea edit, up to 1024 characters, `Ctrl+S` to save
- `Default Bookmark` — inline text input, trimmed, saved on `Ctrl+S` or `Enter`
- `Topics` — comma-separated multi-value editor, validated client-side (1–35 chars, lowercase alphanumeric/hyphens, max 20 topics)

**Visibility Section:**
- Shows current state ("Public" or "Private") with a toggle action
- Requires `y/n` confirmation before sending the PATCH request

**Interaction Model:**
- `j`/`k` or arrow keys to navigate between fields
- `Enter` to activate inline edit mode on a field
- `Ctrl+S` or `Enter` to save
- `Esc` to cancel without saving
- `R` to refresh from API
- Optimistic updates with revert on error

**Read-Only Mode:**
- Non-admin users see all values but cannot edit
- Attempting to edit shows "Admin access required" in the status bar

### Web UI Design

The web UI provides repository metadata editing through a Settings tab in the repository view at `/:owner/:repo/settings`. The general settings section presents an editable form with:

- **Repository name** — displayed but read-only (name changes are not supported)
- **Description** — text area with character counter showing remaining characters (1024 max)
- **Default bookmark** — text input field
- **Topics** — tag-style input where users type topics and press Enter/comma to add; click × to remove; shows validation errors inline per-topic
- **Visibility** — radio or toggle with a confirmation modal when changing

The form has a "Save changes" button that submits only changed fields via PATCH. Success shows a toast notification. Validation errors are shown inline next to the offending field.

### Documentation

End-user documentation should include:

- **Repository Settings Guide** — how to access and edit repository metadata from web, CLI, and TUI
- **CLI Reference: `repo edit`** — full command reference with all options and examples
- **Topics Guide** — what topics are, naming rules, how they affect search discoverability
- **Visibility Guide** — what public vs. private means, who can see what, implications of changing visibility
- **API Reference: PATCH /api/repos/:owner/:repo** — request/response schema, error codes, examples

## Permissions & Security

### Authorization Roles

| Role | Can Update Metadata | Notes |
|------|-------------------|-------|
| **Owner** | ✅ Yes | Full access to all metadata fields |
| **Admin** (org team role) | ✅ Yes | Same capabilities as owner for metadata updates |
| **Write** (collaborator) | ❌ No | Cannot update metadata; receives HTTP 403 |
| **Read** (collaborator) | ❌ No | Cannot update metadata; receives HTTP 403 |
| **Anonymous** | ❌ No | Receives HTTP 401 |

### Rate Limiting

- **Standard rate limit:** applies to all authenticated API requests as configured by the global rate limiter middleware
- **Recommended burst limit for PATCH repo:** 30 requests per minute per user per repository (metadata updates should be infrequent)
- **Visibility toggle:** no additional rate limiting beyond standard, but confirmation UX in interactive clients naturally throttles rapid toggling

### Data Privacy

- Repository descriptions, topics, and names are public metadata for public repositories — they are visible to all users including unauthenticated visitors
- For private repositories, metadata is only visible to users with at least read access
- No PII is expected in standard repository metadata fields, but descriptions may contain arbitrary user-provided text
- The `updated_at` timestamp reveals when the last modification occurred, which is acceptable public metadata
- Visibility changes (public → private) take effect immediately; there is no grace period during which previously-public data remains cached for unauthorized users

## Telemetry & Product Analytics

### Business Events

**`repo.metadata.updated`**
Fired on every successful metadata update.

Properties:
- `repo_id: number` — the repository ID
- `owner: string` — the repository owner
- `repo_name: string` — the repository name
- `actor_id: number` — the user who made the change
- `fields_changed: string[]` — list of field names that were actually modified (e.g., `["description", "topics"]`)
- `visibility_changed: boolean` — whether the private/public flag was toggled
- `visibility_direction: "public_to_private" | "private_to_public" | null` — direction of visibility change, or null if not changed
- `topics_count: number` — number of topics after the update
- `client: "web" | "cli" | "tui" | "api" | "desktop" | "vscode" | "neovim"` — which client surface initiated the change

**`repo.metadata.update_failed`**
Fired on every failed metadata update attempt (validation errors, permission errors).

Properties:
- `repo_id: number | null` — the repository ID (null if repo not found)
- `owner: string` — the requested owner
- `repo_name: string` — the requested repo name
- `actor_id: number | null` — the user who made the attempt
- `error_code: string` — the error classification (`"unauthorized"`, `"forbidden"`, `"validation_failed"`, `"not_found"`, `"conflict"`, `"internal"`)
- `failed_field: string | null` — the specific field that failed validation, if applicable

### Funnel Metrics & Success Indicators

- **Update frequency:** average number of metadata updates per repository per week — indicates feature adoption
- **Field popularity:** breakdown of which fields are most frequently updated — guides UI prioritization
- **Visibility toggle rate:** percentage of repos that change visibility at least once — indicates awareness of the feature
- **Topics adoption:** percentage of repositories with at least one topic — indicates categorization health
- **Error rate:** percentage of update attempts that fail — should be below 5% for validation and below 0.1% for server errors
- **Client distribution:** which clients are used for metadata updates — informs investment priority
- **Time-to-first-edit:** time from repository creation to first metadata update — indicates onboarding flow quality

## Observability

### Logging Requirements

**INFO level:**
- `repo.metadata.updated` — log every successful update with `{ repo_id, owner, repo, actor_id, fields_changed }` structured context
- `repo.metadata.visibility_changed` — log separately when visibility changes, with `{ repo_id, owner, repo, actor_id, from, to }` for audit trail

**WARN level:**
- `repo.metadata.name_change_rejected` — log when a user attempts to change the repository name, with `{ repo_id, owner, repo, actor_id, attempted_name }`
- `repo.metadata.validation_failed` — log validation failures with `{ owner, repo, actor_id, field, code, value_length }`
- `repo.metadata.permission_denied` — log permission failures with `{ owner, repo, actor_id }`

**ERROR level:**
- `repo.metadata.update_db_error` — log database errors during update with `{ repo_id, owner, repo, error_message }` (no raw SQL or sensitive data)
- `repo.metadata.unique_violation` — log unique constraint violations with `{ repo_id, owner, repo, attempted_name }`

### Prometheus Metrics

**Counters:**
- `codeplane_repo_metadata_updates_total{owner, status, field}` — total metadata update operations, labeled by status (`success`, `validation_error`, `permission_error`, `server_error`) and field
- `codeplane_repo_visibility_changes_total{direction}` — visibility toggle count, labeled by direction (`public_to_private`, `private_to_public`)

**Histograms:**
- `codeplane_repo_metadata_update_duration_seconds` — latency of the PATCH endpoint, bucketed at 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5s
- `codeplane_repo_description_length_chars` — distribution of description lengths on update

**Gauges:**
- `codeplane_repo_topics_count{repo_id}` — current topic count per repository (sampled on update)

### Alerts

**Alert: `RepoMetadataUpdateErrorRateHigh`**
- **Condition:** `rate(codeplane_repo_metadata_updates_total{status="server_error"}[5m]) / rate(codeplane_repo_metadata_updates_total[5m]) > 0.05`
- **Severity:** Warning
- **Runbook:**
  1. Check the `repo.metadata.update_db_error` logs in the structured log stream for the last 10 minutes
  2. Verify database connectivity: run `SELECT 1` against the primary database
  3. Check for active database locks: query `pg_stat_activity` for long-running transactions on the `repositories` table
  4. Check disk space on the database volume
  5. If the error is a unique constraint violation spike, investigate whether a migration or bulk operation is causing name conflicts
  6. If database is healthy but errors persist, check if the repo service is receiving malformed `RepoRow` objects from the database layer (schema drift)
  7. Escalate to the database on-call if the issue is infrastructure-related

**Alert: `RepoMetadataUpdateLatencyHigh`**
- **Condition:** `histogram_quantile(0.99, rate(codeplane_repo_metadata_update_duration_seconds_bucket[5m])) > 2.0`
- **Severity:** Warning
- **Runbook:**
  1. Check database query latency for the `UPDATE repositories` query
  2. Look for table bloat on `repositories` — run `VACUUM ANALYZE repositories` if needed
  3. Check for lock contention: are there concurrent long-running transactions?
  4. Verify index health on `repositories(lower_name, user_id)` and `repositories(lower_name, org_id)`
  5. Check if the Hono middleware stack is adding unexpected latency (request ID, auth, rate limit)
  6. If latency is isolated to specific repos, check if those repos have unusually large topic arrays or long descriptions

**Alert: `RepoVisibilityChangeSpike`**
- **Condition:** `rate(codeplane_repo_visibility_changes_total[5m]) > 10`
- **Severity:** Info
- **Runbook:**
  1. Check if a single user or bot is rapidly toggling visibility (potential abuse or automation bug)
  2. Review the `repo.metadata.visibility_changed` logs to identify the actor
  3. If it's a single actor, check if they are using automation/scripts and whether rate limiting is working correctly
  4. If it's distributed across many users, check for a UI bug that might be sending duplicate requests
  5. No immediate action needed unless combined with customer complaints

### Error Cases and Failure Modes

| Error | HTTP Status | Cause | Recovery |
|-------|-------------|-------|----------|
| Authentication missing | 401 | No session cookie or PAT | User must log in or provide valid credentials |
| Permission denied | 403 | User lacks admin role on the repository | User must request admin access from the repository owner |
| Repository not found | 404 | Repo doesn't exist, or private repo and user lacks access | Verify owner/repo spelling; request access if private |
| Name change rejected | 422 | Attempted to change the repository name to a different value | Remove the `name` field from the request, or submit the current name |
| Invalid topic format | 422 | Topic contains uppercase, spaces, special characters, or exceeds 35 chars | Fix topic to match `^[a-z0-9][a-z0-9-]{0,34}$` |
| Empty default bookmark | 422 | `default_bookmark` was empty or whitespace-only | Provide a non-empty bookmark name |
| Invalid repo name format | 422 | Name doesn't match `^[a-zA-Z0-9][a-zA-Z0-9._-]*$` | Fix name to match pattern |
| Unique constraint violation | 409 | Name collision (theoretical, since name changes are blocked) | Choose a different name |
| Internal server error | 500 | Database failure, unexpected exception | Retry after a short delay; if persistent, check server logs |

## Verification

### API Integration Tests

**Happy Path:**
- [ ] `PATCH /api/repos/:owner/:repo` with `{ "description": "new desc" }` returns 200 with updated description
- [ ] `PATCH /api/repos/:owner/:repo` with `{ "private": true }` returns 200 with `private: true` and `is_public: false`
- [ ] `PATCH /api/repos/:owner/:repo` with `{ "private": false }` returns 200 with `private: false` and `is_public: true`
- [ ] `PATCH /api/repos/:owner/:repo` with `{ "default_bookmark": "develop" }` returns 200 with updated default_bookmark
- [ ] `PATCH /api/repos/:owner/:repo` with `{ "topics": ["rust", "jj"] }` returns 200 with topics array
- [ ] `PATCH /api/repos/:owner/:repo` with `{}` (empty body) returns 200 with current state unchanged
- [ ] `PATCH /api/repos/:owner/:repo` with all fields set simultaneously returns 200 with all fields updated
- [ ] `updated_at` changes on every successful update
- [ ] Subsequent `GET /api/repos/:owner/:repo` returns the updated values

**Description Field:**
- [ ] Set description to an empty string `""` — succeeds, clears description
- [ ] Set description to a string of exactly 1024 characters — succeeds
- [ ] Set description to a string of 1025 characters — returns 422
- [ ] Set description containing emoji (e.g., `"🚀 My repo"`) — succeeds and preserves emoji
- [ ] Set description containing Unicode (CJK, accented characters, RTL) — succeeds and preserves content
- [ ] Set description containing newlines — succeeds and preserves newlines
- [ ] Set description containing HTML tags — succeeds (stored as-is; rendering is client responsibility)

**Visibility:**
- [ ] Toggle private repo to public — succeeds, repo becomes visible to unauthenticated users
- [ ] Toggle public repo to private — succeeds, repo becomes invisible to unauthenticated users
- [ ] Set `private: true` on already-private repo — succeeds (idempotent, no error)
- [ ] Set `private: false` on already-public repo — succeeds (idempotent, no error)
- [ ] After toggling to private, unauthenticated `GET /api/repos/:owner/:repo` returns 404

**Default Bookmark:**
- [ ] Set default_bookmark to `"develop"` — succeeds
- [ ] Set default_bookmark to `"main"` — succeeds
- [ ] Set default_bookmark to `""` (empty) — results in default_bookmark being `"main"` (normalized)
- [ ] Set default_bookmark to `"   "` (whitespace only) — returns 422 validation error
- [ ] Set default_bookmark to `"  develop  "` (with whitespace) — succeeds, trimmed to `"develop"`
- [ ] Set default_bookmark to a bookmark that does not exist in the repository — succeeds (metadata only, no ref validation)

**Topics:**
- [ ] Set topics to `["rust", "jj", "forge"]` — succeeds
- [ ] Set topics to `[]` (empty array) — succeeds, clears all topics
- [ ] Set topics with a topic of exactly 1 character (e.g., `["a"]`) — succeeds
- [ ] Set topics with a topic of exactly 35 characters — succeeds
- [ ] Set topics with a topic of 36 characters — returns 422
- [ ] Set topics with uppercase letters (e.g., `["RUST"]`) — succeeds, normalized to `["rust"]`
- [ ] Set topics with duplicates (e.g., `["rust", "rust"]`) — succeeds, deduplicated to `["rust"]`
- [ ] Set topics with mixed case duplicates (e.g., `["Rust", "rust"]`) — succeeds, deduplicated to `["rust"]`
- [ ] Set topics with spaces in a topic (e.g., `["my topic"]`) — returns 422
- [ ] Set topics with special characters (e.g., `["rust!"]`) — returns 422
- [ ] Set topics with a topic starting with a hyphen (e.g., `["-rust"]`) — returns 422
- [ ] Set topics with a topic starting with a number (e.g., `["3d-models"]`) — succeeds
- [ ] Set topics with 20 unique topics — succeeds
- [ ] Set topics containing leading/trailing whitespace (e.g., `[" rust "]`) — succeeds after trimming

**Name Field (Currently Immutable):**
- [ ] Set name to the current repository name — succeeds (no-op)
- [ ] Set name to a different valid name — returns 422 validation error
- [ ] Set name to an empty string — returns 422 with `missing_field` code
- [ ] Set name to a string of 101 characters — returns 422
- [ ] Set name to a reserved name (e.g., `"settings"`) — returns 422
- [ ] Set name ending in `.git` — returns 422
- [ ] Set name starting with a dot — returns 422
- [ ] Set name with spaces — returns 422

**Authentication & Authorization:**
- [ ] Unauthenticated request — returns 401
- [ ] Authenticated user without any permission on the repo — returns 403
- [ ] Authenticated user with read permission — returns 403
- [ ] Authenticated user with write permission — returns 403
- [ ] Authenticated user with admin permission — returns 200
- [ ] Repository owner — returns 200
- [ ] Site admin (isAdmin: true) — returns 200
- [ ] PAT-based authentication — returns 200 for authorized user

**Error Handling:**
- [ ] PATCH to non-existent owner — returns 404
- [ ] PATCH to non-existent repo — returns 404
- [ ] PATCH to private repo without access — returns 404 (not 403, to avoid leaking repo existence)
- [ ] Invalid JSON body — returns 400
- [ ] Non-JSON content type — returns 400 (middleware enforcement)
- [ ] Extremely large request body (> 1MB) — returns 413 or appropriate error

### CLI E2E Tests

- [ ] `codeplane repo edit OWNER/REPO --description "new desc"` — exits 0, outputs updated repo
- [ ] `codeplane repo edit OWNER/REPO --description "new desc" --json` — exits 0, outputs valid JSON with updated description
- [ ] `codeplane repo edit OWNER/REPO --private` — exits 0, output shows `private: true`
- [ ] `codeplane repo edit OWNER/REPO --no-private` — exits 0, output shows `private: false`
- [ ] `codeplane repo edit OWNER/REPO --name <same-name>` — exits 0 (no-op)
- [ ] `codeplane repo edit OWNER/REPO --name <different-name>` — exits non-zero with error message
- [ ] `codeplane repo view` after edit — confirms the updated values are persisted
- [ ] `codeplane repo edit` without any options — exits 0, returns current state (empty patch)
- [ ] `codeplane repo edit NONEXISTENT/REPO --description "test"` — exits non-zero with 404 error

### Web UI Playwright Tests

- [ ] Navigate to `/:owner/:repo/settings` — settings page renders with current metadata
- [ ] Edit description field → save → description updates in the UI and persists on page reload
- [ ] Edit description to empty → save → description clears, placeholder shown
- [ ] Toggle visibility from public to private → confirmation dialog appears → confirm → visibility badge updates
- [ ] Toggle visibility → cancel confirmation → no change made
- [ ] Edit default bookmark → save → updated value persists on reload
- [ ] Add a topic → save → topic chip appears
- [ ] Remove a topic → save → topic chip removed
- [ ] Add topic with invalid characters → inline validation error shown before save
- [ ] Add more than 20 topics → UI prevents adding additional topics
- [ ] Non-admin user visits settings page → all fields are read-only, save button disabled or hidden
- [ ] Unauthenticated user visits settings page → redirected to login

### TUI Tests

- [ ] Navigate to repository settings tab (tab 6) — settings view renders with current metadata
- [ ] Focus description field → press Enter → edit mode activates → type new value → Ctrl+S saves → value updates
- [ ] Focus description field → press Enter → type new value → Esc cancels → original value restored
- [ ] Focus visibility toggle → press Enter → confirmation prompt appears → press y → visibility changes
- [ ] Focus visibility toggle → press Enter → confirmation prompt appears → press n → no change
- [ ] Non-admin user — fields are read-only, Enter does not activate edit, status bar shows "Admin access required"
- [ ] Press R — repository metadata refreshes from API
- [ ] API error during save — field reverts, inline error shown
