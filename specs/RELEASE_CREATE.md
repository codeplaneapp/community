# RELEASE_CREATE

Specification for RELEASE_CREATE.

## High-Level User POV

When a Codeplane user is ready to distribute a version of their software, they create a release. A release captures a specific point in the repository's history — tied to a tag name like `v1.0.0` — and pairs it with human-readable release notes, an optional title, and downloadable assets such as compiled binaries, archives, or documentation bundles.

From the user's perspective, creating a release is the moment they formally publish a snapshot of their work for consumers, collaborators, or downstream automation. The user chooses a tag name (typically a semantic version), optionally names a target bookmark or commit to anchor the release against, writes release notes describing what changed, and decides whether the release should be published immediately, held as a draft for further editing, or flagged as a prerelease to signal that it is not production-ready.

Draft releases are invisible to anyone without write access to the repository. This lets maintainers prepare release notes, attach binary assets, and finalize details before the release becomes publicly visible. Prereleases are visible but clearly marked, allowing early adopters to opt in while signaling that the version is not the recommended stable channel.

The release creation experience is available across all Codeplane clients. A maintainer can create a release from the CLI while packaging a build, from the web UI while composing detailed markdown release notes, or programmatically via the API as part of a CI/CD workflow. All clients converge on the same set of fields and validation rules, ensuring that a release created anywhere looks and behaves identically everywhere.

Once a release is created, it appears in the repository's release timeline, can trigger downstream workflows (such as deployment pipelines or notification dispatches), and serves as a permanent record of the version. Tags are unique per repository — no two releases can share the same tag — providing a reliable identifier for linking, referencing, and automating around specific versions.

## Acceptance Criteria

- **Tag name is required.** A release cannot be created without a `tag_name` field.
- **Tag name must be between 1 and 255 characters** (after trimming whitespace).
- **Tag name must not contain control characters** (Unicode code points `U+0000`–`U+001F` and `U+007F`–`U+009F`).
- **Tag name must be unique within the repository.** Attempting to create a release with a duplicate tag returns a `409 Conflict` error.
- **Release title (name) is optional.** When omitted, the release may display the tag name as a fallback in UI clients.
- **Release title must not exceed 255 characters** (after trimming whitespace).
- **Release body (notes) is optional.** Defaults to an empty string when omitted.
- **Release body has no explicit length limit** in the service layer, but is stored as `TEXT` in the database.
- **Target commitish is optional.** When omitted, it defaults to the repository's default bookmark (e.g., `main`).
- **Draft flag defaults to `false`.** When set to `true`, the release is not visible to users without write access and has no `published_at` timestamp.
- **Prerelease flag defaults to `false`.** When set to `true`, the release is marked as a prerelease in all client surfaces.
- **A draft prerelease is valid.** Both flags can be `true` simultaneously.
- **A repository may have at most 1,000 releases.** Attempting to create a release beyond this limit returns a `400 Bad Request` error.
- **Authentication is mandatory.** Unauthenticated requests return `401 Unauthorized`.
- **Write access to the repository is mandatory.** Users with only read access receive a `403 Forbidden` error.
- **The response must include the full release object** with `id`, `tag_name`, `target_commitish`, `name`, `body`, `draft`, `prerelease`, `is_tag`, `author` (id + login), `assets` (empty array initially), `created_at`, `updated_at`, and `published_at` (null for drafts).
- **The response status code must be `201 Created`.**
- **An SSE notification must be emitted** when a non-draft release is created (event type: `published`). Draft releases do not emit an SSE notification.
- **Invalid JSON in the request body must return `400 Bad Request`.**
- **The `author` field must reflect the authenticated user** who created the release, not any other user.

### Definition of Done

The feature is complete when:
1. All acceptance criteria above pass in automated tests.
2. The API endpoint, CLI command, and (when built) Web UI and TUI surfaces all create releases with identical semantics.
3. Feature flags `RELEASE_CREATE` and `CLI_RELEASE_CREATE` gate the respective surfaces.
4. Telemetry events fire correctly for successful and failed creation attempts.
5. Observability metrics, logs, and alerts are instrumented per the observability plan.
6. Documentation is published for API, CLI, and UI usage.

## Design

### API Shape

**Endpoint:** `POST /api/repos/:owner/:repo/releases`

**Authentication:** Required (session cookie, PAT, or OAuth2 token)

**Request Headers:**
- `Content-Type: application/json` (enforced by middleware)
- `Authorization: Bearer <token>` or session cookie

**Path Parameters:**
| Parameter | Type   | Description                    |
|-----------|--------|--------------------------------|
| `owner`   | string | Repository owner (user or org) |
| `repo`    | string | Repository name                |

**Request Body:**
```json
{
  "tag_name": "v1.0.0",
  "target_commitish": "main",
  "name": "Version 1.0.0",
  "body": "## What's Changed\n\n- Initial release",
  "draft": false,
  "prerelease": false
}
```

| Field              | Type    | Required | Default                  | Constraints                                     |
|--------------------|---------|----------|--------------------------|------------------------------------------------|
| `tag_name`         | string  | Yes      | —                        | 1–255 chars, no control chars, unique per repo  |
| `target_commitish` | string  | No       | Repository default bookmark | Any valid bookmark, change, or commit reference |
| `name`             | string  | No       | `""`                     | 0–255 chars                                     |
| `body`             | string  | No       | `""`                     | Unlimited (TEXT column)                         |
| `draft`            | boolean | No       | `false`                  | —                                               |
| `prerelease`       | boolean | No       | `false`                  | —                                               |

**Success Response:** `201 Created`
```json
{
  "id": 42,
  "tag_name": "v1.0.0",
  "target_commitish": "main",
  "name": "Version 1.0.0",
  "body": "## What's Changed\n\n- Initial release",
  "draft": false,
  "prerelease": false,
  "is_tag": false,
  "author": {
    "id": 1,
    "login": "alice"
  },
  "assets": [],
  "created_at": "2026-03-22T12:00:00.000Z",
  "updated_at": "2026-03-22T12:00:00.000Z",
  "published_at": "2026-03-22T12:00:00.000Z"
}
```

**Error Responses:**

| Status | Condition                          | Body                                                                                       |
|--------|------------------------------------|---------------------------------------------------------------------------------------------||
| 400    | Invalid JSON body                  | `{ "message": "invalid request body" }`                                                    |
| 400    | Max releases reached               | `{ "message": "repository has reached the maximum number of releases" }`                   |
| 401    | Not authenticated                  | `{ "message": "authentication required" }`                                                 |
| 403    | No write access                    | `{ "message": "forbidden" }`                                                               |
| 404    | Repository not found               | `{ "message": "repository not found" }`                                                    |
| 409    | Tag already exists                 | `{ "message": "release tag already exists" }`                                              |
| 422    | Tag empty                          | `{ "errors": [{ "resource": "Release", "field": "tag_name", "code": "missing_field" }] }` |
| 422    | Tag too long                       | `{ "errors": [{ "resource": "Release", "field": "tag_name", "code": "too_long" }] }`      |
| 422    | Tag contains control chars         | `{ "errors": [{ "resource": "Release", "field": "tag_name", "code": "invalid" }] }`       |
| 422    | Title too long                     | `{ "errors": [{ "resource": "Release", "field": "name", "code": "too_long" }] }`          |

### SDK Shape

The `ReleaseService.createRelease` method in `@codeplane/sdk` is the authoritative domain logic layer:

```typescript
interface CreateReleaseInput {
  tagName: string;
  target?: string;
  title?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
}

// Returns ReleaseResponse on success, throws APIError on failure.
service.createRelease(actor: AuthUser, owner: string, repo: string, input: CreateReleaseInput): Promise<ReleaseResponse>
```

Constants exported/enforced by the SDK:
- `MAX_RELEASE_TAG_LENGTH` = 255
- `MAX_RELEASE_TITLE_LENGTH` = 255
- `MAX_RELEASES_PER_REPO` = 1000

### CLI Command

**Command:** `codeplane release create <tag> [options]`

**Positional Arguments:**
| Argument | Type   | Required | Description      |
|----------|--------|----------|------------------|
| `tag`    | string | Yes      | Release tag name |

**Options:**
| Option         | Type    | Default | Description                              |
|----------------|---------|---------|------------------------------------------|
| `--name`       | string  | —       | Release title                            |
| `--body`       | string  | `""`    | Release notes/body text                  |
| `--target`     | string  | —       | Target bookmark, change, or commit       |
| `--draft`      | boolean | `false` | Create as a draft release                |
| `--prerelease` | boolean | `false` | Mark as a prerelease                     |
| `--repo`       | string  | —       | Repository in `OWNER/REPO` format        |

**Repo Resolution:** When `--repo` is omitted, the CLI resolves the repository from the current working directory's remote configuration.

**Output (default):** Human-readable summary of the created release.

**Output (`--json`):** Full JSON `ReleaseResponse` object.

**Examples:**
```bash
# Create a published release
codeplane release create v1.0.0 --name "First Release" --body "Initial release notes"

# Create a draft prerelease on a specific repo
codeplane release create v2.0.0-rc.1 --draft --prerelease --repo myorg/myrepo

# Create a release targeting a specific bookmark
codeplane release create v1.1.0 --target feature-branch --name "Feature release"
```

**Note on CLI aliases:** The E2E tests currently reference `--title` and `--notes` flags. The canonical implementation uses `--name` and `--body`. If aliases exist, they should be documented. If they do not exist, the tests should be updated to match the canonical flags.

### Web UI Design

**Route:** `/:owner/:repo/releases/new`

**Page Structure:**
1. **Page Title:** "New Release" with breadcrumb back to the releases list.
2. **Tag Name Input:** Required text field with validation feedback for length, uniqueness, and invalid characters. Placeholder: `v1.0.0`.
3. **Target Selector:** Dropdown/combobox that lists available bookmarks and allows freeform entry for commit references. Defaults to the repository's default bookmark.
4. **Release Title Input:** Optional text field. Placeholder: `Release title (optional)`.
5. **Release Notes Editor:** Markdown-capable textarea with preview toggle. Supports the repository's standard markdown rendering.
6. **Options Row:**
   - Draft checkbox: "This is a draft (not visible to the public)"
   - Prerelease checkbox: "Mark as pre-release"
7. **Action Buttons:**
   - Primary: "Publish release" (or "Save draft" when draft is checked)
   - Secondary: "Cancel" (navigates back to releases list)
8. **Validation Feedback:** Inline error messages beneath fields when validation fails. Toast notification for server-side errors (409 conflict, 400 limit reached).

**Post-Creation Navigation:** On success, redirect to `/:owner/:repo/releases/:id` (the release detail page).

### TUI UI

**Access:** From the repository context, navigate to a "Releases" section, then select "Create Release."

**Form Fields:** Sequential focused inputs for:
1. Tag name (required, validated inline)
2. Target (optional, defaults shown)
3. Title (optional)
4. Body (multiline text input)
5. Draft toggle (yes/no)
6. Prerelease toggle (yes/no)

**Confirmation:** Summary screen before submission. On success, display the created release details. On error, display the error message and allow retry.

### Documentation

The following end-user documentation must be written:

1. **API Reference — Create Release:** Full endpoint documentation with request/response schemas, all error codes, authentication requirements, and curl examples.
2. **CLI Reference — `release create`:** Command synopsis, all flags, examples for published/draft/prerelease releases, repo resolution behavior, and JSON output format.
3. **User Guide — Managing Releases:** Narrative guide explaining the release lifecycle (create → draft → publish → prerelease → assets → delete), with cross-references to API and CLI docs.
4. **Workflow Integration Guide:** How to trigger workflows on release creation events, with example workflow definitions.

## Permissions & Security

### Authorization Matrix

| Role               | Can Create Release? | Notes                                                   |
|--------------------|--------------------|---------------------------------------------------------|
| Repository Owner   | ✅ Yes             | Full access                                             |
| Organization Admin | ✅ Yes             | Via org-level admin permission                          |
| Team (Write)       | ✅ Yes             | Via team-to-repo assignment with write permission       |
| Collaborator (Write)| ✅ Yes            | Via direct collaborator invitation with write permission|
| Team (Read)        | ❌ No              | 403 Forbidden                                           |
| Collaborator (Read)| ❌ No              | 403 Forbidden                                           |
| Anonymous          | ❌ No              | 401 Unauthorized                                        |

### Permission Resolution

The service resolves the highest permission from three sources (in priority order):
1. Repository ownership (owner always has admin)
2. Organization ownership / admin status
3. Team permission for the repo
4. Direct collaborator permission

If the highest resolved permission is `write` or `admin`, the request proceeds. Otherwise it is rejected.

### Rate Limiting

- **API rate limit:** Standard authenticated rate limit applies (inherited from middleware). Recommended: 60 requests per minute per user for mutating endpoints.
- **Per-repository cap:** The 1,000-release limit serves as a natural abuse brake.
- **Body size limit:** The JSON content-type middleware and server framework impose a maximum request body size. The `body` field should be practically limited by the server's max JSON payload size (recommended: 1 MB).

### Data Privacy

- **No PII in release metadata:** Release tag names, titles, and bodies are user-authored content and may incidentally contain PII, but the system does not solicit or require PII.
- **Author attribution:** The `author` field exposes `id` and `login` of the creating user. This is intentional public attribution for published releases. Draft releases restrict visibility to write-access users, limiting author exposure.
- **Secret leakage risk:** Release notes are freeform text. The system should not scan for secrets, but documentation should advise users not to include credentials in release notes.

## Telemetry & Product Analytics

### Business Events

| Event Name         | Trigger                                      | Properties                                                                                                                                      |
|--------------------|----------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| `ReleaseCreated`   | Successful release creation                  | `release_id`, `repository_id`, `owner`, `repo`, `tag_name`, `is_draft`, `is_prerelease`, `has_title`, `has_body`, `body_length`, `client` (api/cli/web/tui), `actor_id` |
| `ReleaseCreateFailed` | Failed release creation attempt           | `repository_id`, `owner`, `repo`, `error_code` (400/401/403/409/422), `error_reason`, `client`, `actor_id` (if authenticated)                  |

### Funnel Metrics

| Metric                              | Description                                                       | Success Indicator                                    |
|--------------------------------------|-------------------------------------------------------------------|------------------------------------------------------|
| Release creation success rate        | `ReleaseCreated` / (`ReleaseCreated` + `ReleaseCreateFailed`)     | > 95% (failures should be user errors, not system)   |
| Draft-to-publish conversion rate     | Releases that start as draft and are later published              | Healthy range: 60–90% (drafts are useful, not orphaned) |
| Releases per active repository       | Average releases per repo that has ≥1 release                    | Trending upward indicates feature adoption           |
| Client distribution                  | Breakdown of `client` property across events                      | Validates multi-client value proposition             |
| Time from repo creation to first release | Elapsed time between repo creation and first `ReleaseCreated`  | Shorter is better; indicates feature discoverability |
| Prerelease usage rate                | Percentage of releases with `is_prerelease: true`                 | Non-zero indicates healthy staged release workflows  |

## Observability

### Logging

| Log Point                         | Level   | Structured Context                                                         |
|-----------------------------------|---------|----------------------------------------------------------------------------|
| Release creation request received | `info`  | `owner`, `repo`, `tag_name`, `is_draft`, `is_prerelease`, `actor_id`      |
| Release created successfully      | `info`  | `release_id`, `repository_id`, `tag_name`, `is_draft`, `actor_id`, `duration_ms` |
| Validation failure                | `warn`  | `owner`, `repo`, `field`, `code`, `actor_id`                              |
| Duplicate tag conflict            | `warn`  | `owner`, `repo`, `tag_name`, `actor_id`                                   |
| Max releases limit reached        | `warn`  | `owner`, `repo`, `current_count`, `actor_id`                              |
| Permission denied                 | `warn`  | `owner`, `repo`, `actor_id`, `resolved_permission`                        |
| Internal/database error           | `error` | `owner`, `repo`, `tag_name`, `actor_id`, `error_message`, `stack_trace`   |
| SSE notification emitted          | `debug` | `repository_id`, `release_id`, `event_type`                               |
| SSE notification failed           | `error` | `repository_id`, `release_id`, `error_message`                            |

### Prometheus Metrics

| Metric Name                                      | Type      | Labels                                              | Description                                          |
|--------------------------------------------------|-----------|------------------------------------------------------|------------------------------------------------------|
| `codeplane_release_create_total`                 | Counter   | `status` (success/error), `error_code`               | Total release creation attempts                      |
| `codeplane_release_create_duration_seconds`      | Histogram | `status`                                             | Latency of release creation (buckets: 0.01–10s)      |
| `codeplane_releases_per_repo`                    | Gauge     | `repository_id`                                      | Current release count per repository                 |
| `codeplane_release_create_validation_errors_total`| Counter  | `field` (tag_name/name), `code` (missing/too_long/invalid) | Validation error breakdown                    |
| `codeplane_release_create_conflicts_total`       | Counter   | —                                                    | Duplicate tag conflicts                              |
| `codeplane_release_sse_notifications_total`      | Counter   | `event_type` (published), `status` (success/error)   | SSE notification attempts                            |

### Alerts

#### Alert: High Release Creation Error Rate
- **Condition:** `rate(codeplane_release_create_total{status="error"}[5m]) / rate(codeplane_release_create_total[5m]) > 0.2` sustained for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_release_create_validation_errors_total` — if validation errors dominate, this is user error, not a system issue. Investigate if a client is sending malformed payloads.
  2. Check `codeplane_release_create_total{error_code="500"}` — if 500s are elevated, check database connectivity and query logs.
  3. Check database connection pool stats and slow query logs.
  4. Review recent deployments for regressions in release route or service logic.
  5. If SSE failures are correlated, check the SSE/pg_notify pathway independently.

#### Alert: Release Creation Latency Spike
- **Condition:** `histogram_quantile(0.95, rate(codeplane_release_create_duration_seconds_bucket[5m])) > 5` sustained for 5 minutes
- **Severity:** Warning
- **Runbook:**
  1. Check database latency metrics — the `countReleasesByRepo` and `createRelease` queries are the main DB operations.
  2. Look for lock contention on the releases table (unique constraint enforcement).
  3. Check if a single repository with ~1,000 releases is causing count queries to slow down.
  4. Review connection pool saturation.
  5. If only SSE notification is slow, the fire-and-forget pattern should prevent user-facing impact — verify SSE manager health.

#### Alert: Repository Approaching Release Limit
- **Condition:** `codeplane_releases_per_repo > 900`
- **Severity:** Info
- **Runbook:**
  1. Identify the repository approaching the 1,000 limit.
  2. Contact the repository owner to discuss cleanup of old releases or increasing the limit if justified.
  3. No immediate system risk — the limit is enforced gracefully with a 400 error.

### Error Cases and Failure Modes

| Error Case                         | Expected Behavior                                    | Recovery                                    |
|------------------------------------|------------------------------------------------------|---------------------------------------------|
| Database unreachable               | 500 Internal Server Error                            | Retry after DB recovery                     |
| Database unique violation (race)   | 409 Conflict                                         | User retries with different tag             |
| SSE notification failure           | Swallowed (fire-and-forget); release still created   | SSE manager auto-reconnects                |
| Request body exceeds size limit    | 400/413 from framework middleware                    | User reduces body size                      |
| Repository deleted mid-request     | 404 Not Found from repo resolution                   | No recovery needed                          |
| Actor session expired mid-request  | 401 Unauthorized                                     | User re-authenticates                       |

## Verification

### API Integration Tests

1. **Create a release with all fields provided.** Verify 201 response, all fields in response match input, `published_at` is set, `assets` is empty array.
2. **Create a release with only `tag_name`.** Verify 201 response, `name` defaults to empty, `body` defaults to empty, `draft` is `false`, `prerelease` is `false`, `target_commitish` defaults to the repository's default bookmark.
3. **Create a draft release.** Verify `draft: true`, `published_at` is `null`.
4. **Create a prerelease.** Verify `prerelease: true`, `published_at` is set (non-draft).
5. **Create a draft prerelease.** Verify `draft: true`, `prerelease: true`, `published_at` is `null`.
6. **Create a release with maximum-length tag name (255 chars).** Verify 201 success.
7. **Attempt to create a release with tag name of 256 chars.** Verify 422 with `code: "too_long"`.
8. **Create a release with maximum-length title (255 chars).** Verify 201 success.
9. **Attempt to create a release with title of 256 chars.** Verify 422 with `code: "too_long"`.
10. **Attempt to create a release with empty tag name (`""`).**  Verify 422 with `code: "missing_field"`.
11. **Attempt to create a release with whitespace-only tag name.** Verify 422 with `code: "missing_field"` (trimmed to empty).
12. **Attempt to create a release with tag containing control character (`\x00`).** Verify 422 with `code: "invalid"`.
13. **Attempt to create a release with tag containing `\x7f` (DEL).** Verify 422 with `code: "invalid"`.
14. **Attempt to create a release with tag containing `\x9f`.** Verify 422 with `code: "invalid"`.
15. **Create a release with tag containing unicode, emoji, hyphens, dots, slashes.** Verify 201 success for all valid characters.
16. **Attempt to create a release with a duplicate tag name.** Verify 409 Conflict with message "release tag already exists".
17. **Attempt to create a release without authentication.** Verify 401 Unauthorized.
18. **Attempt to create a release with read-only access.** Verify 403 Forbidden.
19. **Create a release with write collaborator access.** Verify 201 success.
20. **Create a release with admin access.** Verify 201 success.
21. **Create a release as an organization admin.** Verify 201 success.
22. **Attempt to create a release on a non-existent repository.** Verify 404 Not Found.
23. **Attempt to create a release with invalid JSON body.** Verify 400 Bad Request with message "invalid request body".
24. **Attempt to create a release with empty JSON object `{}`.** Verify 422 validation error (tag_name missing).
25. **Attempt to create a release when the repository has 1,000 existing releases.** Verify 400 with message "repository has reached the maximum number of releases".
26. **Create the 999th release (just under limit).** Verify 201 success.
27. **Verify the `author` field matches the authenticated user's id and login.**
28. **Verify `created_at` and `updated_at` are valid ISO 8601 timestamps.**
29. **Verify `is_tag` is `false` for newly created releases** (CE does not create actual git tags).
30. **Create a release with a very large body (e.g., 500 KB of markdown).** Verify 201 success (within server payload limits).
31. **Verify that creating a non-draft release emits an SSE notification** (subscribe to SSE before creating, assert event received).
32. **Verify that creating a draft release does NOT emit an SSE notification.**
33. **Create a release with `target_commitish` set to an explicit bookmark name.** Verify the response's `target_commitish` matches.
34. **Verify pagination header `X-Total-Count` increments after release creation** (list releases before and after).

### CLI E2E Tests

35. **`codeplane release create v1.0.0 --name "Release" --body "Notes" --repo owner/repo`** — Verify JSON output contains correct `tag_name`, `name`, `body`, `draft: false`, `prerelease: false`.
36. **`codeplane release create v2.0.0-beta --draft --prerelease --repo owner/repo`** — Verify `draft: true`, `prerelease: true`.
37. **`codeplane release create v1.0.0` (without `--repo`, from a repo directory)** — Verify repo resolution from working directory succeeds.
38. **`codeplane release create v1.0.0 --target some-bookmark --repo owner/repo`** — Verify `target_commitish` is `some-bookmark`.
39. **`codeplane release create v1.0.0 --repo owner/repo` (minimal flags)** — Verify defaults are applied (`body: ""`, `draft: false`, `prerelease: false`).
40. **Attempt to create a release with a duplicate tag via CLI.** Verify the CLI surfaces the 409 conflict error message clearly.
41. **Attempt to create a release on a repo the user cannot write to.** Verify the CLI surfaces the 403 error.
42. **Verify CLI human-readable output (non-JSON mode)** contains the tag name and release ID.
43. **Verify `--json` output is valid JSON** that can be piped to `jq` or other tools.

### Web UI E2E Tests (Playwright)

44. **Navigate to `/:owner/:repo/releases/new`.** Verify the form renders with all fields (tag, target, title, body, draft checkbox, prerelease checkbox).
45. **Fill in all fields and click "Publish release."** Verify redirect to release detail page, verify release data matches input.
46. **Submit with only tag name filled.** Verify release is created with defaults.
47. **Check the draft checkbox and submit.** Verify the button label changes to "Save draft" and the release is created as a draft.
48. **Submit with an empty tag name.** Verify inline validation error appears, form is not submitted.
49. **Submit with a duplicate tag name.** Verify toast/inline error displays "release tag already exists".
50. **Verify the markdown preview toggle works** for the release notes editor.
51. **Click "Cancel."** Verify navigation back to the releases list without creating a release.
52. **Verify the target dropdown lists available bookmarks.**
53. **Access `/:owner/:repo/releases/new` as a read-only user.** Verify access is denied or the form is not shown.
54. **Access `/:owner/:repo/releases/new` while unauthenticated.** Verify redirect to login.

### TUI E2E Tests

55. **Navigate to Releases > Create Release.** Verify all input fields render in sequence.
56. **Complete the form with valid inputs.** Verify success message and release details displayed.
57. **Enter an invalid (empty) tag name.** Verify inline error before submission.

### Cross-Client Consistency Tests

58. **Create a release via CLI, retrieve it via API.** Verify all fields match.
59. **Create a release via API, view it via CLI `release view`.** Verify all fields match.
60. **Create a draft release via CLI, verify it is NOT listed for anonymous API requests** (with `exclude_drafts` default behavior).
61. **Create a draft release via CLI, verify it IS listed for authenticated write-access API requests.**
