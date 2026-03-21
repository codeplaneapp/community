# RELEASE_UPDATE

Specification for RELEASE_UPDATE.

## High-Level User POV

When a release has already been created, maintainers frequently need to revise it — fix a typo in the release notes, rename the release, change the tag, update the target bookmark, promote a draft to a published release, or reclassify a stable release as a pre-release. Codeplane provides a release update capability that lets users modify any aspect of an existing release without deleting and recreating it.

From the web UI, a user with write access navigates to a release detail page and clicks an "Edit" button to open an editing view. The editing view presents the same form fields as release creation — tag name, title, release notes, target commitish, draft status, and pre-release status — pre-populated with the release's current values. The user changes only the fields they care about and saves. The update takes effect immediately, and collaborators watching the repository receive a real-time notification that the release was updated.

One of the most common workflows is promoting a draft release. A maintainer prepares a draft release with notes and assets, reviews it, then unchecks the "Draft" toggle and saves. Codeplane automatically sets the publication timestamp at that moment, making the release visible to all users and eligible for "latest release" resolution. The reverse is also supported: a published release can be pulled back to draft status, removing its publication timestamp and hiding it from users without write access.

From the CLI, a `release edit` command allows the same modifications using flags. A user can update just the body, or just the tag, or flip the draft/prerelease status — all from a single command invocation. This is particularly valuable in CI/CD pipelines where a release is created as a draft during build, assets are uploaded, and then the release is promoted to published as a final step.

Asset renaming is also supported as a separate action. If an uploaded file was given the wrong name, a user can rename the asset without re-uploading the entire file.

The update feature preserves the release's identity (its numeric ID), its creation timestamp, its author, and its existing assets. Only the explicitly changed fields are modified.

## Acceptance Criteria

### Definition of Done

- [ ] Users with write access to a repository can update any combination of: tag name, title, release notes body, target commitish, draft status, and prerelease status on an existing release.
- [ ] All fields in the update request are optional; omitting a field preserves its current value (partial update semantics).
- [ ] The API returns the full updated release object in the response, including assets, author, and timestamps.
- [ ] When a release transitions from draft to published (`draft: true` → `draft: false`), the `published_at` timestamp is automatically set to the current time if not already set.
- [ ] When a release transitions from published to draft (`draft: false` → `draft: true`), the `published_at` timestamp is cleared (set to null).
- [ ] When a release remains published (was already `draft: false` and update does not change `draft`), the existing `published_at` is preserved.
- [ ] The `updated_at` timestamp is always refreshed to the current time on every successful update.
- [ ] A real-time SSE notification is emitted for non-draft releases when updated, with action `"updated"`.
- [ ] No SSE notification is emitted when updating a release that remains a draft.
- [ ] The release's `id`, `created_at`, `author`, and `is_tag` fields are never modified by an update.
- [ ] The CLI exposes a `release edit` command with flags for each updatable field.
- [ ] The web UI provides an edit form accessible from the release detail page for users with write access.
- [ ] The TUI provides a release edit flow accessible from the release detail screen.
- [ ] Asset renaming is supported via a separate endpoint/command, updating only the asset's `name` field.
- [ ] Documentation covers the update feature across API, CLI, web UI, and TUI.

### Edge Cases

- [ ] Sending an empty JSON body `{}` (no fields specified) succeeds and returns the release unchanged except for `updated_at`.
- [ ] Updating the tag name to a tag that already exists on another release in the same repository returns HTTP 409 Conflict with the message `"release tag already exists"`.
- [ ] Updating the tag name to the release's own current tag name succeeds (no-op for that field).
- [ ] Updating `tag_name` to an empty string `""` or whitespace-only `"   "` returns a validation error (`missing_field`).
- [ ] Updating `tag_name` to a string containing control characters (U+0000–U+001F, U+007F–U+009F) returns a validation error (`invalid`).
- [ ] Updating `name` (title) to an empty string `""` is allowed (releases may have empty titles).
- [ ] Updating `body` to an empty string `""` is allowed.
- [ ] Updating `body` to a very large string (e.g., 100,000 characters) succeeds if within database column limits.
- [ ] Setting both `draft: true` and `prerelease: true` simultaneously is allowed.
- [ ] Setting `draft: false` on a release that was already `draft: false` preserves the original `published_at`.
- [ ] Updating a release that was deleted concurrently returns HTTP 404.
- [ ] Updating a release that does not exist returns HTTP 404.
- [ ] Updating with an invalid release ID (non-numeric, negative, zero) returns HTTP 400.
- [ ] Updating target to an empty string causes the target to be normalized to the repository's default bookmark.
- [ ] Tag name values are trimmed of leading/trailing whitespace before storage.
- [ ] Title values are trimmed of leading/trailing whitespace before storage.
- [ ] Body values are trimmed of leading/trailing whitespace before storage.
- [ ] Renaming an asset to a name that already exists on the same release returns HTTP 409 Conflict.
- [ ] Renaming an asset to an empty string returns a validation error.
- [ ] Renaming an asset to a name containing `/` or `\` returns a validation error.
- [ ] Renaming an asset to `.` or `..` returns a validation error.
- [ ] Renaming an asset to a name containing control characters returns a validation error.
- [ ] Renaming an asset that does not exist returns HTTP 404.

### Boundary Constraints

- [ ] `tag_name` maximum length: 255 characters.
- [ ] `name` (title) maximum length: 255 characters.
- [ ] `body` (release notes): no explicit server-side character limit beyond database column capacity, but extremely large bodies (e.g., > 1 MB) may be rejected by request body size middleware.
- [ ] Asset `name` maximum length: 255 characters.
- [ ] Asset name must not contain `/` or `\` characters.
- [ ] Asset name must not be `.` or `..`.
- [ ] Tag name, title, and asset name must not contain control characters (U+0000–U+001F, U+007F–U+009F).
- [ ] Boolean fields (`draft`, `prerelease`) must be JSON booleans, not strings.
- [ ] Non-JSON or unparseable request bodies return HTTP 400.

## Design

### API Shape

#### Update Release

**Endpoint:** `PATCH /api/repos/:owner/:repo/releases/:id`

**Authentication:** Required. Must have write access to the repository.

**Path Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `owner` | string | Repository owner (user or organization) |
| `repo` | string | Repository name |
| `id` | integer | Release numeric ID |

**Request Body:** JSON object with all fields optional:

```json
{
  "tag_name": "v1.3.0",
  "target_commitish": "main",
  "name": "Version 1.3.0",
  "body": "## What's Changed\n- Updated release notes",
  "draft": false,
  "prerelease": false
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `tag_name` | string | No | New tag name (max 255 chars, no control characters) |
| `target_commitish` | string | No | Target bookmark or commitish (empty defaults to repo default bookmark) |
| `name` | string | No | Release display title (max 255 chars) |
| `body` | string | No | Release notes (markdown) |
| `draft` | boolean | No | Whether this is a draft release |
| `prerelease` | boolean | No | Whether this is a pre-release |

**Success Response:** `200 OK`

```json
{
  "id": 42,
  "tag_name": "v1.3.0",
  "target_commitish": "main",
  "name": "Version 1.3.0",
  "body": "## What's Changed\n- Updated release notes",
  "draft": false,
  "prerelease": false,
  "is_tag": false,
  "author": {
    "id": 7,
    "login": "alice"
  },
  "assets": [],
  "created_at": "2026-03-20T10:25:00Z",
  "updated_at": "2026-03-22T14:00:00Z",
  "published_at": "2026-03-22T14:00:00Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|---|---|---|
| `400` | Invalid release ID (non-numeric) | `{ "message": "invalid release id" }` |
| `400` | Unparseable request body | `{ "message": "invalid request body" }` |
| `401` | No authentication provided | `{ "message": "authentication required" }` |
| `403` | Authenticated but lacks write access | `{ "message": "permission denied" }` |
| `404` | Release or repository not found | `{ "message": "release not found" }` or `{ "message": "repository not found" }` |
| `409` | Tag name already used by another release | `{ "message": "release tag already exists" }` |
| `422` | Validation failure (tag too long, control chars, etc.) | `{ "message": "Validation Failed", "errors": [...] }` |
| `500` | Internal server error | `{ "message": "failed to update release" }` |

#### Update Release Asset

**Endpoint:** `PATCH /api/repos/:owner/:repo/releases/:id/assets/:asset_id`

**Authentication:** Required. Must have write access to the repository.

**Request Body:**

```json
{
  "name": "new-asset-name.tar.gz"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | New asset name (max 255 chars, no `/`, `\`, `.`, `..`, or control characters) |

**Success Response:** `200 OK` with the updated `ReleaseAssetResponse`.

**Error Responses:**

| Status | Condition |
|---|---|
| `400` | Invalid release ID or asset ID |
| `400` | Unparseable request body |
| `401` | Not authenticated |
| `403` | Lacks write access |
| `404` | Release or asset not found |
| `409` | Asset name already exists on this release |
| `422` | Asset name validation failure |

### SDK Shape

The `ReleaseService` exposes:

```typescript
async updateRelease(
  actor: AuthUser | undefined,
  owner: string,
  repo: string,
  releaseID: number,
  input: UpdateReleaseInput
): Promise<ReleaseResponse>
```

Where `UpdateReleaseInput` is:

```typescript
interface UpdateReleaseInput {
  tagName?: string;
  target?: string;
  title?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
}
```

And for assets:

```typescript
async updateReleaseAsset(
  actor: AuthUser | undefined,
  owner: string,
  repo: string,
  releaseID: number,
  assetID: number,
  input: UpdateReleaseAssetInput
): Promise<ReleaseAssetResponse>
```

Where `UpdateReleaseAssetInput` is:

```typescript
interface UpdateReleaseAssetInput {
  name: string;
}
```

Behavior notes:
- The service resolves the repository and requires write access via `resolveWritableRelease`.
- Each field is validated independently only if provided; omitted fields preserve the current value.
- `published_at` is computed automatically based on draft state transitions.
- Unique constraint violations on `tag_name` are caught and re-thrown as 409 Conflict.
- SSE notifications are sent for non-draft releases with action `"updated"`.

### CLI Command

**Command:** `codeplane release edit <release>`

The `<release>` positional argument accepts a numeric release ID or a tag name (matching the resolution logic used by `release view` and `release delete`).

**Flags:**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--tag` | string | (unchanged) | New tag name |
| `--name` | string | (unchanged) | New release title |
| `--body` | string | (unchanged) | New release notes |
| `--target` | string | (unchanged) | New target commitish or bookmark |
| `--draft` | boolean | (unchanged) | Set draft status |
| `--prerelease` | boolean | (unchanged) | Set prerelease status |
| `--repo` | string | (auto-detect) | Repository in `OWNER/REPO` format |

**Usage examples:**

```bash
# Update only the release notes
codeplane release edit v1.2.0 --body "Updated release notes"

# Promote a draft to published
codeplane release edit v1.2.0 --draft=false

# Change the tag name
codeplane release edit 42 --tag v1.2.1

# Multiple field update
codeplane release edit v1.2.0 --name "Stable Release 1.2.0" --prerelease=false

# JSON output
codeplane release edit v1.2.0 --draft=false --json
```

**Behavior notes:**
- The CLI first resolves the release (by ID, then by tag name fallback) to obtain the numeric ID.
- Only flags that are explicitly provided are sent to the API. Omitted flags are not included in the PATCH body.
- Default output (text mode): prints the updated release summary (tag name, title, status, published date).
- JSON output (`--json`): returns the full API response object.
- If no flags are specified (only the positional argument), the CLI should either warn the user that nothing will change or send an empty update (which succeeds and refreshes `updated_at`).
- If `--repo` is not specified, the CLI infers the repository from the current working directory's jj/git remote.

**Asset rename command:** `codeplane release edit-asset <release> <asset-id> --name <new-name>`

Alternatively, this can be a subcommand: `codeplane release asset rename <release> <asset-id> --name <new-name>`.

### Web UI Design

**Entry point:**
- On the release detail page (`/:owner/:repo/releases/:id`), an "Edit release" button appears in the page header for users with write access.
- The button is hidden for users without write access.

**Edit view:**
- Route: `/:owner/:repo/releases/:id/edit` (or modal overlay on the detail page).
- Pre-populated form fields:
  - **Tag name** — text input, pre-filled with current `tag_name`. Required field with a validation indicator.
  - **Target commitish** — text input or bookmark selector, pre-filled with current `target_commitish`. Optional; empty defaults to repo default bookmark.
  - **Release title** — text input, pre-filled with current `name`. Optional.
  - **Release notes** — textarea with markdown preview toggle, pre-filled with current `body`. Optional.
  - **Draft** — checkbox/toggle. When checked, the release is not visible to non-write-access users.
  - **Pre-release** — checkbox/toggle. When checked, the release is visually distinguished as not production-ready.
- A prominent callout appears when transitioning from draft to published: "Publishing this release will make it visible to all users and set the publication date."
- A warning appears when transitioning from published to draft: "Returning this release to draft will hide it from users without write access."

**Save behavior:**
- "Save changes" button submits the PATCH request.
- On success: redirect to the release detail page with a success toast ("Release updated").
- On validation error: inline field-level error messages (e.g., "Tag name is too long", "Tag name already exists").
- On 409 conflict: inline error on the tag name field ("A release with this tag already exists").
- On network error: inline banner with retry action.

**Cancel behavior:**
- "Cancel" button or Escape key returns to the release detail page without saving.
- If the user has unsaved changes, a confirmation dialog asks "Discard unsaved changes?"

**Loading state:**
- While the form is loading (fetching current release data), show a skeleton matching the form layout.
- While saving, disable the "Save changes" button and show a spinner.

### TUI UI

**Entry point:**
- On the release detail screen, an `e` key binding opens the release edit mode.
- Only available when the authenticated user has write access.

**Edit flow:**
- Sequential field editing: the TUI presents each editable field in a form-like layout with vim-style navigation.
- Fields: tag name, title, body (opens a multi-line editor), target, draft toggle, prerelease toggle.
- `Enter` on each field allows editing.
- `Tab` or `j`/`k` moves between fields.
- Submit with a "Save" action at the bottom of the form.
- `q` or `Escape` cancels and returns to release detail.

**Feedback:**
- Success: brief status message ("Release updated") and return to detail screen.
- Error: inline error message below the relevant field.

### Documentation

The following end-user documentation should be written:

- **Editing a release (Web):** Step-by-step guide for editing a release from the web UI, including screenshots of the edit form, field descriptions, draft/publish workflow, and error handling.
- **Editing a release (CLI):** Reference for `codeplane release edit` including all flags, output modes, usage examples for common workflows (promote draft, change tag, update notes), and JSON output.
- **Editing a release (API):** REST API reference for `PATCH /api/repos/:owner/:repo/releases/:id` with request/response schema, field-by-field documentation, error codes, and authentication requirements.
- **Renaming a release asset (API):** REST API reference for `PATCH /api/repos/:owner/:repo/releases/:id/assets/:asset_id`.
- **Release lifecycle guide:** Conceptual guide explaining the draft → published workflow, how `published_at` is managed automatically, how promoting a pre-release to stable works, and the interaction with the "latest release" resolution.
- **Release update in CI/CD:** Cookbook showing how to use the CLI to create a draft release, upload assets, then promote it in an automation pipeline.

## Permissions & Security

### Authorization Matrix

| Role | Can update release | Can rename asset | Can see edit controls |
|---|---|---|---|
| Anonymous | ❌ 401 | ❌ 401 | ❌ Hidden |
| Authenticated, no repo access | ❌ 403 | ❌ 403 | ❌ Hidden |
| Read-only collaborator | ❌ 403 | ❌ 403 | ❌ Hidden |
| Write collaborator | ✅ | ✅ | ✅ Visible |
| Admin collaborator | ✅ | ✅ | ✅ Visible |
| Repository owner | ✅ | ✅ | ✅ Visible |
| Organization owner (for org repos) | ✅ | ✅ | ✅ Visible |
| Team member with write permission | ✅ | ✅ | ✅ Visible |
| Team member with read permission | ❌ 403 | ❌ 403 | ❌ Hidden |

### Rate Limiting

- **Authenticated users:** 30 requests per minute per user for the release update endpoint. This is a mutation endpoint and should be rate-limited more conservatively than read endpoints.
- **Rate limit headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` should be included in all responses.
- **HTTP 429** with `Retry-After` header when limits are exceeded.
- **Asset rename:** Same 30 req/min rate limit applies.

### Data Privacy

- Release bodies are user-authored content. Clients must sanitize rendered HTML/markdown to prevent XSS when displaying updated release notes.
- The `author` field in the response is the original publisher, not the editor. There is no audit trail of who performed the edit exposed in the API response. (The audit trail exists in system logs.)
- Private repository release updates are not observable to unauthorized viewers. The API returns 404 (not 403) for the repository-not-found case to avoid leaking repository existence.
- No PII beyond public profile data (user ID and login) is included in the response.
- Secrets, tokens, or credentials should never appear in release bodies. No server-side scrubbing is performed; this is a user responsibility.

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|---|---|---|
| `ReleaseUpdated` | Release successfully updated via any client | `repository_id`, `release_id`, `tag_name`, `actor_id`, `client` (api/cli/web/tui), `fields_changed` (array of field names that were modified, e.g. `["tag_name", "draft"]`), `draft_before`, `draft_after`, `prerelease_before`, `prerelease_after`, `was_promoted` (boolean: true if draft→published), `was_demoted` (boolean: true if published→draft) |
| `ReleaseUpdateFailed` | Release update returns a 4xx or 5xx error | `repository_id`, `release_id`, `actor_id`, `client`, `error_type` (validation, conflict, not_found, permission, internal), `error_message` |
| `ReleaseAssetRenamed` | Release asset successfully renamed | `repository_id`, `release_id`, `asset_id`, `actor_id`, `client`, `old_name`, `new_name` |
| `ReleaseAssetRenameFailed` | Asset rename returns a 4xx or 5xx error | `repository_id`, `release_id`, `asset_id`, `actor_id`, `client`, `error_type`, `error_message` |

### Funnel Metrics

- **Edit initiation rate:** Percentage of release detail page views (by write-access users) that lead to clicking the Edit button.
- **Edit completion rate:** Percentage of edit form opens that result in a successful save (vs. cancel or error).
- **Draft promotion rate:** Percentage of `ReleaseUpdated` events where `was_promoted = true`. A high rate indicates healthy draft-first workflows.
- **Field change distribution:** Which fields are most commonly modified (tag_name, body, draft, prerelease, etc.) — informs which fields deserve the most prominent UI placement.
- **Tag conflict rate:** Percentage of update attempts that fail with 409 Conflict — a high rate may indicate UX issues around tag naming.

### Success Indicators

- Release update p95 latency < 300ms.
- Tag conflict rate < 2% of all update attempts.
- Edit completion rate > 85% (most users who open the edit form successfully save).
- Draft promotion is used by > 30% of repositories that publish releases (indicates the draft workflow is understood and adopted).
- CLI `release edit` usage grows month-over-month alongside release creation.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|---|---|---|
| Release update request received | `DEBUG` | `owner`, `repo`, `release_id`, `actor_id`, `fields_present` (list of fields in the request body), `request_id` |
| Release update succeeded | `INFO` | `owner`, `repo`, `release_id`, `actor_id`, `fields_changed`, `draft_transition` (none/promoted/demoted), `duration_ms`, `request_id` |
| Release update validation failed | `WARN` | `owner`, `repo`, `release_id`, `actor_id`, `field`, `validation_code` (missing_field/too_long/invalid), `request_id` |
| Release update tag conflict | `WARN` | `owner`, `repo`, `release_id`, `actor_id`, `attempted_tag`, `request_id` |
| Release update permission denied | `WARN` | `owner`, `repo`, `release_id`, `actor_id`, `request_id` |
| Release update release not found | `WARN` | `owner`, `repo`, `release_id`, `actor_id`, `request_id` |
| Release update internal error | `ERROR` | `owner`, `repo`, `release_id`, `actor_id`, `error_message`, `stack_trace`, `request_id` |
| Release update invalid request body | `WARN` | `owner`, `repo`, `release_id`, `actor_id`, `parse_error`, `request_id` |
| Release SSE notification emitted | `DEBUG` | `owner`, `repo`, `release_id`, `action` ("updated"), `request_id` |
| Asset rename request received | `DEBUG` | `owner`, `repo`, `release_id`, `asset_id`, `actor_id`, `new_name`, `request_id` |
| Asset rename succeeded | `INFO` | `owner`, `repo`, `release_id`, `asset_id`, `actor_id`, `old_name`, `new_name`, `duration_ms`, `request_id` |
| Asset rename validation failed | `WARN` | `owner`, `repo`, `release_id`, `asset_id`, `actor_id`, `field`, `validation_code`, `request_id` |
| Asset rename conflict | `WARN` | `owner`, `repo`, `release_id`, `asset_id`, `actor_id`, `attempted_name`, `request_id` |
| Asset rename internal error | `ERROR` | `owner`, `repo`, `release_id`, `asset_id`, `actor_id`, `error_message`, `stack_trace`, `request_id` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `codeplane_release_update_requests_total` | Counter | `status_code`, `draft_transition` (none/promoted/demoted) | Total release update requests |
| `codeplane_release_update_duration_seconds` | Histogram | `status_code` | Request latency (buckets: 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_release_update_fields_changed_total` | Counter | `field` (tag_name, name, body, target_commitish, draft, prerelease) | Count of individual field changes across all updates |
| `codeplane_release_update_errors_total` | Counter | `error_type` (validation, conflict, not_found, permission, internal) | Error breakdown |
| `codeplane_release_update_draft_promotions_total` | Counter | — | Count of draft → published transitions |
| `codeplane_release_asset_rename_requests_total` | Counter | `status_code` | Total asset rename requests |
| `codeplane_release_asset_rename_duration_seconds` | Histogram | `status_code` | Asset rename latency |
| `codeplane_release_asset_rename_errors_total` | Counter | `error_type` | Asset rename error breakdown |

### Alerts

**Alert 1: Release Update Error Rate Spike**
- **Condition:** `rate(codeplane_release_update_errors_total{error_type="internal"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check structured logs for `release update internal error` entries in the last 10 minutes.
  2. Identify if errors are database-related (connection timeouts, deadlocks, unique constraint violations not caught) or application-level.
  3. If database-related: check PG connection pool health, look for blocking queries via `pg_stat_activity`, check disk I/O.
  4. If application-related: review recent deployments for regressions in the `updateRelease` service method or the `updateRelease` SQL wrapper.
  5. Check if the error is isolated to a specific repository (a corrupted release row) by examining the `release_id` field in error logs.
  6. If persistent after 15 minutes, roll back the most recent deployment.

**Alert 2: Release Update Latency Degradation**
- **Condition:** `histogram_quantile(0.95, rate(codeplane_release_update_duration_seconds_bucket[5m])) > 1.0`
- **Severity:** Warning
- **Runbook:**
  1. Check if the latency correlates with increased traffic (`codeplane_release_update_requests_total` rate).
  2. Run `EXPLAIN ANALYZE` on the release update SQL query with typical parameters.
  3. Verify database indexes on `releases(repository_id, id)` and `releases(repository_id, tag_name)` are intact.
  4. Check if the `mapRelease` step (loading publisher user and asset list) is the bottleneck.
  5. Examine the SSE notification path — if the SSE manager is slow or backed up, it could add latency.
  6. Check overall database load and connection pool saturation.

**Alert 3: Elevated Tag Conflict Rate**
- **Condition:** `rate(codeplane_release_update_errors_total{error_type="conflict"}[1h]) / rate(codeplane_release_update_requests_total[1h]) > 0.10`
- **Severity:** Info
- **Runbook:**
  1. This indicates > 10% of update attempts are hitting tag conflicts. This is likely a UX or user-education issue rather than a system issue.
  2. Check logs to see if a specific repository or user is generating most of the conflicts.
  3. Consider whether the web UI should pre-validate tag uniqueness before submission (client-side check).
  4. If caused by automation (CI/CD scripts), the scripts may need to be fixed to avoid tag collisions.

**Alert 4: Release Update Availability Drop**
- **Condition:** `sum(rate(codeplane_release_update_requests_total{status_code=~"5.."}[5m])) / sum(rate(codeplane_release_update_requests_total[5m])) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Immediately check server health endpoint (`/health`) and database connectivity.
  2. Check for OOM kills or process restarts via system logs.
  3. Verify the release service is initialized in the service registry.
  4. If isolated to release updates (other routes healthy): check for database migration issues affecting the `releases` table.
  5. Escalate to on-call database admin if persistent and database-related.

### Error Cases and Failure Modes

| Error Case | HTTP Status | User-Facing Message | Recovery |
|---|---|---|---|
| Not authenticated | 401 | "authentication required" | User must log in or provide PAT/token |
| Lacks write access | 403 | "permission denied" | User must request write access from repo owner |
| Release not found | 404 | "release not found" | User should verify release ID/tag |
| Repository not found | 404 | "repository not found" | User should verify owner/repo spelling |
| Invalid release ID | 400 | "invalid release id" | User should provide a valid numeric ID |
| Invalid request body | 400 | "invalid request body" | User should send valid JSON |
| Tag too long | 422 | Validation failed: tag_name too_long | User should shorten the tag name to ≤255 chars |
| Tag empty | 422 | Validation failed: tag_name missing_field | User should provide a non-empty tag name |
| Tag has control chars | 422 | Validation failed: tag_name invalid | User should remove control characters from tag |
| Title too long | 422 | Validation failed: name too_long | User should shorten the title to ≤255 chars |
| Tag already exists | 409 | "release tag already exists" | User should choose a different tag name |
| Database connection failure | 500 | "failed to update release" | Automatic retry; alert fires |
| Query timeout | 500 | "failed to update release" | Alert fires; DBA investigates |
| Asset name empty | 422 | Validation failed: name missing_field | User should provide a non-empty name |
| Asset name too long | 422 | Validation failed: name too_long | User should shorten asset name to ≤255 chars |
| Asset name has slash | 422 | Validation failed: name invalid | User should remove `/` or `\` from name |
| Asset name is `.` or `..` | 422 | Validation failed: name invalid | User should use a real filename |
| Asset name conflict | 409 | "release asset already exists" | User should choose a different asset name |
| Asset not found | 404 | "release asset not found" | User should verify asset ID |

## Verification

### API Integration Tests — Release Update

- [ ] **Update release tag name:** Create a release with tag `v1.0.0`. PATCH with `{"tag_name": "v1.0.1"}`. Verify 200, response has `tag_name: "v1.0.1"`, all other fields unchanged.
- [ ] **Update release title:** PATCH with `{"name": "New Title"}`. Verify 200, `name` field updated.
- [ ] **Update release body:** PATCH with `{"body": "Updated notes"}`. Verify 200, `body` field updated.
- [ ] **Update release target:** PATCH with `{"target_commitish": "develop"}`. Verify 200, `target_commitish` updated.
- [ ] **Update draft status (promote to published):** Create a draft release. PATCH with `{"draft": false}`. Verify 200, `draft: false`, `published_at` is set to a recent timestamp.
- [ ] **Update draft status (demote to draft):** Create a published release with a known `published_at`. PATCH with `{"draft": true}`. Verify 200, `draft: true`, `published_at` is null.
- [ ] **Update prerelease status:** Create a prerelease. PATCH with `{"prerelease": false}`. Verify 200, `prerelease: false`.
- [ ] **Multiple fields at once:** PATCH with `{"tag_name": "v2.0.0", "name": "Major Release", "body": "Breaking changes", "prerelease": false}`. Verify all four fields updated.
- [ ] **Empty body (no fields):** PATCH with `{}`. Verify 200, release unchanged except `updated_at` is refreshed.
- [ ] **Partial update preserves unmentioned fields:** Create a release with all fields set. PATCH with only `{"body": "New body"}`. Verify tag_name, name, target, draft, prerelease are all unchanged.
- [ ] **updated_at always changes:** Record original `updated_at`. PATCH with `{}`. Verify `updated_at` has changed.
- [ ] **created_at never changes:** Record original `created_at`. PATCH with several fields. Verify `created_at` is unchanged.
- [ ] **author never changes:** Record original `author`. PATCH as a different write-access user. Verify `author` still reflects the original publisher.
- [ ] **is_tag never changes:** Create a tag-only release (`is_tag: true`). PATCH with `{"name": "New Name"}`. Verify `is_tag` remains `true`.
- [ ] **Promote draft preserves existing published_at if already set:** Manually create a scenario where a release has `published_at` set and `draft: false`. PATCH with `{"draft": false}` again. Verify `published_at` is the original timestamp, not a new one.
- [ ] **Tag name conflict (409):** Create two releases with tags `v1.0` and `v2.0`. PATCH release `v1.0` with `{"tag_name": "v2.0"}`. Verify 409 with message "release tag already exists".
- [ ] **Self-referential tag rename succeeds:** PATCH release with `{"tag_name": "<its-own-current-tag>"}`. Verify 200 (no conflict).
- [ ] **Tag name max length (255 chars):** PATCH with a 255-character tag name. Verify 200.
- [ ] **Tag name over max length (256 chars):** PATCH with a 256-character tag name. Verify 422 validation error with code `too_long`.
- [ ] **Tag name empty string:** PATCH with `{"tag_name": ""}`. Verify 422 with code `missing_field`.
- [ ] **Tag name whitespace only:** PATCH with `{"tag_name": "   "}`. Verify 422 with code `missing_field` (trimmed to empty).
- [ ] **Tag name with leading/trailing whitespace:** PATCH with `{"tag_name": "  v1.0.0  "}`. Verify 200, stored tag is `"v1.0.0"` (trimmed).
- [ ] **Tag name with control characters:** PATCH with `{"tag_name": "v1.0\u0000"}`. Verify 422 with code `invalid`.
- [ ] **Tag name with U+007F (DEL):** PATCH with a tag containing U+007F. Verify 422.
- [ ] **Tag name with U+009F:** PATCH with a tag containing U+009F. Verify 422.
- [ ] **Title max length (255 chars):** PATCH with a 255-character name. Verify 200.
- [ ] **Title over max length (256 chars):** PATCH with a 256-character name. Verify 422.
- [ ] **Title empty string allowed:** PATCH with `{"name": ""}`. Verify 200 (empty title is valid).
- [ ] **Body trimmed:** PATCH with `{"body": "  content  "}`. Verify body is stored as `"content"`.
- [ ] **Body empty string allowed:** PATCH with `{"body": ""}`. Verify 200.
- [ ] **Body very large (100KB):** PATCH with a 100,000-character body. Verify 200.
- [ ] **Target empty string defaults to repo default bookmark:** PATCH with `{"target_commitish": ""}`. Verify `target_commitish` is set to the repo's default bookmark.
- [ ] **Draft and prerelease both true:** PATCH with `{"draft": true, "prerelease": true}`. Verify 200, both flags are true.
- [ ] **Draft and prerelease both false:** PATCH with `{"draft": false, "prerelease": false}`. Verify 200.
- [ ] **Release not found (404):** PATCH a non-existent release ID. Verify 404.
- [ ] **Invalid release ID (non-numeric):** PATCH `/releases/abc`. Verify 400 with message "invalid release id".
- [ ] **Invalid release ID (zero):** PATCH `/releases/0`. Verify 404 (valid parse but no release found).
- [ ] **Invalid release ID (negative):** PATCH `/releases/-1`. Verify 404.
- [ ] **Repository not found:** PATCH on a non-existent owner/repo. Verify 404.
- [ ] **Private repo without auth:** PATCH on a private repo without authentication. Verify 401.
- [ ] **Private repo without write access:** Authenticate as a read-only user. PATCH. Verify 403.
- [ ] **Unauthenticated request:** PATCH without any auth. Verify 401.
- [ ] **Read-only user:** Authenticate as a user with read-only repo access. PATCH. Verify 403.
- [ ] **Write-access user:** Authenticate as a collaborator with write permission. PATCH. Verify 200.
- [ ] **Admin user:** Authenticate as a collaborator with admin permission. PATCH. Verify 200.
- [ ] **Repo owner:** Authenticate as the repository owner. PATCH. Verify 200.
- [ ] **Org owner for org repo:** Authenticate as the org owner. PATCH on an org repo. Verify 200.
- [ ] **Invalid JSON body:** Send non-JSON body. Verify 400 with message "invalid request body".
- [ ] **SSE notification emitted for published release update:** Update a non-draft release. Verify an SSE event with action `"updated"` is emitted on the release channel.
- [ ] **No SSE notification for draft release update:** Update a draft release (keeping it as draft). Verify no SSE event is emitted.
- [ ] **SSE notification on promotion:** Promote a draft to published. Verify SSE event with action `"updated"` is emitted.
- [ ] **Response schema validation:** Verify the response matches the `ReleaseResponse` schema: id (number), tag_name (string), target_commitish (string), name (string), body (string), draft (boolean), prerelease (boolean), is_tag (boolean), author (object with id and login), assets (array), created_at (ISO8601), updated_at (ISO8601), published_at (ISO8601 or null).
- [ ] **Assets preserved after update:** Create a release with 3 assets. Update the release body. Verify all 3 assets are still in the response.

### API Integration Tests — Asset Rename

- [ ] **Rename asset:** Create a release with an asset named `old.tar.gz`. PATCH asset with `{"name": "new.tar.gz"}`. Verify 200, asset name is `"new.tar.gz"`.
- [ ] **Asset rename preserves other fields:** Verify size, content_type, download_count, status, created_at are unchanged after rename.
- [ ] **Asset rename updates updated_at:** Verify `updated_at` changes after rename.
- [ ] **Asset name max length (255 chars):** PATCH with a 255-character name. Verify 200.
- [ ] **Asset name over max length (256 chars):** PATCH with a 256-character name. Verify 422.
- [ ] **Asset name empty string:** PATCH with `{"name": ""}`. Verify 422.
- [ ] **Asset name with slash:** PATCH with `{"name": "path/file.tar.gz"}`. Verify 422.
- [ ] **Asset name with backslash:** PATCH with `{"name": "path\\file.tar.gz"}`. Verify 422.
- [ ] **Asset name is dot:** PATCH with `{"name": "."}`. Verify 422.
- [ ] **Asset name is dot-dot:** PATCH with `{"name": ".."}`. Verify 422.
- [ ] **Asset name with control characters:** PATCH with a name containing U+0000. Verify 422.
- [ ] **Asset name conflict (409):** Create two assets `a.tar.gz` and `b.tar.gz`. Rename `a.tar.gz` to `b.tar.gz`. Verify 409.
- [ ] **Self-referential asset rename:** Rename `a.tar.gz` to `a.tar.gz`. Verify 200 (no conflict).
- [ ] **Asset not found (404):** PATCH a non-existent asset ID. Verify 404.
- [ ] **Invalid asset ID (non-numeric):** PATCH `/assets/abc`. Verify 400.
- [ ] **Release not found (404):** PATCH asset on a non-existent release. Verify 404.
- [ ] **Unauthenticated:** PATCH asset without auth. Verify 401.
- [ ] **Read-only user:** PATCH asset as read-only user. Verify 403.
- [ ] **SSE notification for non-draft release asset rename:** Rename asset on a published release. Verify SSE event.
- [ ] **No SSE for draft release asset rename:** Rename asset on a draft release. Verify no SSE event.

### CLI Integration Tests

- [ ] **`release edit` basic update:** Create a release. Run `codeplane release edit <tag> --name "New Name" --repo OWNER/REPO`. Verify output shows updated release.
- [ ] **`release edit` by numeric ID:** Run `codeplane release edit 42 --body "New body" --repo OWNER/REPO`. Verify success.
- [ ] **`release edit --tag`:** Run `codeplane release edit v1.0.0 --tag v1.0.1 --repo OWNER/REPO`. Verify tag is changed.
- [ ] **`release edit --draft=false`:** Create a draft. Run `codeplane release edit <tag> --draft=false --repo OWNER/REPO`. Verify release is now published.
- [ ] **`release edit --prerelease=false`:** Run with `--prerelease=false`. Verify prerelease flag is cleared.
- [ ] **`release edit --json`:** Run with `--json`. Verify output is valid JSON matching `ReleaseResponse` schema.
- [ ] **`release edit` with auto-detected repo:** Run in a directory with a configured jj/git remote without `--repo`. Verify repo is resolved.
- [ ] **`release edit` nonexistent release:** Run against a non-existent tag. Verify clear error message and non-zero exit code.
- [ ] **`release edit` no flags:** Run with only the positional argument and no flags. Verify the command either warns or succeeds with a no-op update.
- [ ] **`release edit` for repo without write access:** Verify clear permission error.
- [ ] **`release edit` tag conflict:** Attempt to change tag to one that already exists. Verify clear conflict error.

### Web UI E2E Tests (Playwright)

- [ ] **Edit button visible for write-access user:** Log in as repo admin. Navigate to release detail. Verify "Edit release" button is visible.
- [ ] **Edit button hidden for read-only user:** Log in as read-only user. Navigate to release detail. Verify no edit button.
- [ ] **Edit button hidden for anonymous user:** Navigate without login. Verify no edit button.
- [ ] **Edit form loads with current values:** Click Edit. Verify all form fields are pre-populated with the release's current values.
- [ ] **Update tag name via UI:** Change the tag name in the form. Click Save. Verify the release detail page shows the new tag.
- [ ] **Update title via UI:** Change the title. Save. Verify updated title.
- [ ] **Update body via UI:** Change the release notes. Save. Verify updated body with correct markdown rendering.
- [ ] **Toggle draft status via UI:** Uncheck draft toggle. Save. Verify the draft badge is removed.
- [ ] **Toggle prerelease status via UI:** Check prerelease toggle. Save. Verify prerelease badge appears.
- [ ] **Validation error on tag name too long:** Enter a tag > 255 chars. Attempt save. Verify inline error on the tag field.
- [ ] **Conflict error on duplicate tag:** Enter a tag that already exists. Attempt save. Verify inline error.
- [ ] **Cancel discards changes:** Make changes in the form. Click Cancel. Verify return to detail page with original values.
- [ ] **Unsaved changes confirmation:** Make changes. Attempt to navigate away. Verify confirmation dialog appears.
- [ ] **Loading state during save:** Intercept PATCH request to delay it. Verify save button is disabled with spinner.
- [ ] **Success toast on save:** Save changes. Verify a "Release updated" toast appears.
- [ ] **Draft-to-publish callout:** Uncheck draft toggle. Verify a callout/banner about publication visibility appears.
- [ ] **Publish-to-draft warning:** Check draft toggle on a published release. Verify a warning about hiding the release appears.
- [ ] **Network error handling:** Intercept PATCH to return 500. Verify error banner with retry option.

### TUI Tests

- [ ] **Edit mode accessible from release detail:** Open release detail. Press `e`. Verify edit form/mode opens.
- [ ] **Edit mode not accessible without write access:** Log in as read-only. Open release detail. Press `e`. Verify no edit form opens (or disabled indicator).
- [ ] **Fields pre-populated:** Verify tag, title, body, target, draft, prerelease fields show current values.
- [ ] **Save updates release:** Modify a field. Submit. Verify success message and updated detail view.
- [ ] **Cancel returns to detail:** Press Escape or `q` during edit. Verify return to release detail without changes.
- [ ] **Validation error display:** Enter an invalid tag. Submit. Verify inline error message.
