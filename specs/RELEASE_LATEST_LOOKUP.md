# RELEASE_LATEST_LOOKUP

Specification for RELEASE_LATEST_LOOKUP.

## High-Level User POV

When working with a repository that publishes releases, users often need to quickly answer one question: "What is the most recent stable release of this project?" Rather than scrolling through a list of releases — which may include drafts, pre-releases, and historical versions — Codeplane provides a dedicated "latest release" lookup that instantly resolves the single most recent, fully published, non-draft, non-prerelease release for any repository.

This is valuable in several contexts. A developer visiting a repository's release page wants to see the current stable version front and center. A CI/CD pipeline or automation script needs a stable API endpoint that always resolves to the newest production-ready release without parsing a paginated list. A CLI user wants to quickly inspect the current release of a project with a single command rather than listing releases and manually identifying the right one. And downstream consumers — whether human or agent — need a canonical, predictable way to find the latest stable artifacts and release notes for a repository.

The latest release lookup is intentionally opinionated: it excludes drafts (which are incomplete and not yet published) and pre-releases (which are explicitly marked as not production-ready). If a repository has no qualifying published release, the system clearly communicates that no latest release exists. This keeps the semantics clean and predictable across all clients — API, CLI, web UI, and TUI.

## Acceptance Criteria

### Definition of Done

- [ ] The API endpoint `GET /api/repos/:owner/:repo/releases/latest` returns the single most recent non-draft, non-prerelease release for the specified repository.
- [ ] The response shape is identical to the standard release detail response (same fields, same types, same asset inclusion).
- [ ] The CLI supports `codeplane release view latest` as a special selector that resolves via the `/releases/latest` endpoint.
- [ ] The web UI displays a "Latest Release" badge or callout on the repository overview page when a latest release exists.
- [ ] The TUI displays the latest release prominently in the repository detail view.
- [ ] Documentation describes the latest release lookup across all clients.

### Functional Constraints

- [ ] The "latest" release is defined as the most recently published release where `draft = false` AND `prerelease = false`.
- [ ] Ordering is by `published_at` timestamp (falling back to `created_at` if `published_at` is null), then by release ID descending as a tiebreaker.
- [ ] Only one release is ever returned — the single latest.
- [ ] If no qualifying release exists for the repository, the API returns HTTP 404 with an error payload `{ "message": "release not found" }`.
- [ ] The response includes the full asset list for the latest release (only confirmed/ready assets for anonymous viewers; pending assets visible to users with write access).
- [ ] Draft releases are never returned, even if they are the most recently created.
- [ ] Pre-releases are never returned, even if they are more recent than the latest stable release.
- [ ] A release that is both draft and prerelease is never returned.
- [ ] If a release is updated from `prerelease: true` to `prerelease: false` (promoted to stable), it becomes eligible for latest lookup immediately.
- [ ] If the only non-draft, non-prerelease release is deleted, subsequent latest lookups return 404.

### Edge Cases

- [ ] Repository with zero releases: returns 404.
- [ ] Repository with only draft releases: returns 404.
- [ ] Repository with only pre-releases: returns 404.
- [ ] Repository with one stable release and many drafts/pre-releases: returns the one stable release.
- [ ] Repository with multiple stable releases published at the exact same second: returns the one with the highest release ID.
- [ ] A release whose `published_at` is null but `created_at` is set: uses `created_at` for ordering.
- [ ] Two releases where one has an older `published_at` but a newer `created_at`: the one with the more recent `published_at` wins.
- [ ] A tag-only release (`is_tag = true`) that is non-draft and non-prerelease: is eligible to be latest.
- [ ] Owner/repo name resolution is case-insensitive (matching existing repository resolution behavior).
- [ ] The `:owner` or `:repo` path segment contains URL-encoded characters: handled correctly.

### Boundary Constraints

- [ ] The `owner` path parameter: max 39 characters (matching username constraints), alphanumeric plus hyphens.
- [ ] The `repo` path parameter: max 100 characters (matching repo name constraints), alphanumeric plus hyphens, dots, underscores.
- [ ] Invalid owner or repo returns 404 (repository not found), not a different error.
- [ ] The endpoint accepts no request body (GET request).
- [ ] The endpoint accepts no query parameters (all filtering is predetermined by the "latest" definition).

## Design

### API Shape

**Endpoint:** `GET /api/repos/:owner/:repo/releases/latest`

**Authentication:** Optional. Anonymous access is allowed for public repositories. Private repositories require a valid session cookie, PAT, or OAuth token with repository read access.

**Request:** No body. No query parameters.

**Success Response (200):**

```json
{
  "id": 42,
  "tag_name": "v1.2.0",
  "target_commitish": "main",
  "name": "Version 1.2.0",
  "body": "## What's Changed\n- Feature A\n- Bug fix B",
  "draft": false,
  "prerelease": false,
  "is_tag": false,
  "author": {
    "id": 7,
    "login": "wcory"
  },
  "assets": [
    {
      "id": 101,
      "name": "codeplane-linux-amd64.tar.gz",
      "size": 52428800,
      "content_type": "application/gzip",
      "status": "ready",
      "download_count": 347,
      "confirmed_at": "2026-03-20T14:30:00Z",
      "created_at": "2026-03-20T14:25:00Z",
      "updated_at": "2026-03-20T14:30:00Z"
    }
  ],
  "created_at": "2026-03-20T14:20:00Z",
  "updated_at": "2026-03-20T14:30:00Z",
  "published_at": "2026-03-20T14:30:00Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|--------|-----------|------|
| 404 | Repository does not exist | `{ "message": "repository not found" }` |
| 404 | No qualifying latest release | `{ "message": "release not found" }` |
| 403 | Private repo, viewer lacks read access | `{ "message": "forbidden" }` |

**Response headers:** Standard Codeplane response headers. No pagination headers (single-item response).

### SDK Shape

The `ReleaseService` exposes:

```typescript
async getLatestRelease(
  viewer: AuthUser | undefined,
  owner: string,
  repo: string
): Promise<ReleaseResponse>
```

- Resolves the repository by owner and name.
- Requires read access (public repo = anyone; private repo = authenticated user with access).
- Executes the `GetLatestRelease` SQL query filtering `is_draft = FALSE AND is_prerelease = FALSE`, ordered by `COALESCE(published_at, created_at) DESC, id DESC`, limited to 1 row.
- Returns 404 if no row matches.
- Maps the result through `mapRelease` with full asset inclusion.
- Pending assets (status = "pending") are visible only to viewers with write access.

### CLI Command

The CLI `release view` command must accept the special selector `latest` in addition to numeric IDs and tag names.

**Usage:**

```
codeplane release view latest
codeplane release view latest --repo owner/repo
codeplane release view latest --json
codeplane release view latest --json .tag_name
```

**Behavior:**
- When the selector argument is the literal string `"latest"`, the CLI calls `GET /api/repos/:owner/:repo/releases/latest` directly instead of trying to parse it as an ID or resolve it as a tag name.
- For any other selector value, existing behavior is preserved (try numeric ID, then fall back to tag name).
- Output formatting follows existing `release view` conventions: structured table in default mode, JSON in `--json` mode, with field filtering via `--json .field`.
- If no latest release exists, the CLI prints an error message `"No latest release found for owner/repo"` and exits with a non-zero exit code.

### Web UI Design

**Repository Overview Page:**
- When a latest release exists, display a "Latest Release" card/badge in the repository sidebar or overview section.
- The card shows: release name (or tag name if no name), tag name, published date (relative, e.g., "3 days ago"), and asset count.
- Clicking the card navigates to the full release detail page.
- If no latest release exists, the card is not rendered (no empty state shown on the overview page).

**Releases List Page:**
- The latest non-draft, non-prerelease release should have a "Latest" badge next to its name in the release list, distinguishing it from older stable releases and pre-releases.
- This badge should be visually prominent (e.g., a green pill/tag) so users can instantly identify the current stable release.

**Release Detail Page:**
- When viewing the release that happens to be the latest, display the same "Latest" badge in the release detail header.

### TUI UI

**Repository Detail Screen:**
- Include a "Latest Release" line item showing the tag name and published date when a latest release exists.
- Pressing Enter or a designated key on this line item navigates to a release detail view.
- If no latest release exists, this line item is omitted.

### Documentation

The following end-user documentation should be written:

- **API Reference:** Document the `GET /api/repos/:owner/:repo/releases/latest` endpoint with request/response examples, authentication requirements, and error codes. Include a note explaining the "latest" definition (non-draft, non-prerelease, most recently published).
- **CLI Reference:** Document that `codeplane release view latest` is a supported shorthand. Include examples showing JSON output and field filtering.
- **Concepts Guide — Releases:** Add a paragraph explaining what "latest release" means semantically in Codeplane (excludes drafts and pre-releases, determined by publication date).
- **Automation/Scripting Guide:** Show how CI/CD scripts and agents can use the `/releases/latest` endpoint to always fetch the current stable version and its assets for download.

## Permissions & Security

### Authorization Matrix

| Role | Access |
|------|--------|
| Anonymous (public repo) | ✅ Can read latest release and confirmed assets |
| Anonymous (private repo) | ❌ 404 (repository not found — does not leak existence) |
| Authenticated, no repo access (private repo) | ❌ 403 Forbidden |
| Read-only collaborator | ✅ Can read latest release and confirmed assets |
| Member (org team member with read access) | ✅ Can read latest release and confirmed assets |
| Write collaborator | ✅ Can read latest release, confirmed AND pending assets |
| Admin | ✅ Can read latest release, confirmed AND pending assets |
| Owner | ✅ Can read latest release, confirmed AND pending assets |

### Rate Limiting

- Standard Codeplane API rate limits apply (inherited from the global middleware rate-limiting layer).
- No special elevated or reduced rate limit for this endpoint.
- This endpoint is read-only and cacheable; consider setting a short `Cache-Control` header (e.g., `max-age=60`) for public repositories to reduce repeat lookups by automation scripts.

### Data Privacy

- No PII is exposed beyond what is already visible on release detail views (author login and ID).
- Private repository existence is not leaked — requests for non-existent or inaccessible repos return the same 404 shape.
- Release bodies may contain user-authored markdown with embedded links or mentions; this is existing behavior, not introduced by this feature.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `ReleaseLatestViewed` | Latest release endpoint returns 200 | `repository_id`, `release_id`, `tag_name`, `viewer_id` (null if anonymous), `client` (api/cli/web/tui), `is_public_repo` |
| `ReleaseLatestNotFound` | Latest release endpoint returns 404 (no qualifying release) | `repository_id`, `viewer_id` (null if anonymous), `client`, `is_public_repo` |

### Funnel Metrics

- **Adoption rate:** Percentage of active repositories where `/releases/latest` is called at least once per week.
- **Client distribution:** Breakdown of latest release lookups by client type (API, CLI, web, TUI) — indicates which surfaces drive the most value.
- **Conversion to download:** Percentage of `ReleaseLatestViewed` events followed by an asset download within the same session — indicates whether users finding the latest release actually consume its artifacts.
- **404 rate:** Percentage of latest release lookups that return 404 — a high rate may indicate users expect releases that don't exist, suggesting a need for better onboarding around release creation.
- **Repeat lookup frequency:** How often the same repository's latest release is looked up within a short window — may indicate automation scripts or badge services, informing caching strategy.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|--------------------||
| Latest release lookup initiated | `DEBUG` | `owner`, `repo`, `viewer_id`, `request_id` |
| Latest release found | `INFO` | `owner`, `repo`, `release_id`, `tag_name`, `viewer_id`, `request_id`, `latency_ms` |
| Latest release not found (no qualifying release) | `INFO` | `owner`, `repo`, `viewer_id`, `request_id`, `latency_ms` |
| Repository not found during latest lookup | `WARN` | `owner`, `repo`, `viewer_id`, `request_id` |
| Access denied for latest release lookup | `WARN` | `owner`, `repo`, `viewer_id`, `request_id` |
| Unexpected error during latest release lookup | `ERROR` | `owner`, `repo`, `viewer_id`, `request_id`, `error_message`, `stack_trace` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_release_latest_lookup_total` | Counter | `status` (200, 403, 404, 500), `is_authenticated` (true/false) | Total latest release lookup requests |
| `codeplane_release_latest_lookup_duration_seconds` | Histogram | `status` | Latency distribution for latest release lookups |
| `codeplane_release_latest_not_found_total` | Counter | — | Count of lookups where no qualifying release exists (subset of 404s) |

### Alerts

**Alert 1: High Error Rate on Latest Release Lookup**

- **Condition:** `rate(codeplane_release_latest_lookup_total{status="500"}[5m]) / rate(codeplane_release_latest_lookup_total[5m]) > 0.05` for 5 minutes.
- **Severity:** Warning
- **Runbook:**
  1. Check server logs for `ERROR`-level entries with context `release_latest_lookup`.
  2. Look for database connectivity issues — the query depends on the `releases` table being accessible.
  3. Check if a recent deployment introduced a regression in `ReleaseService.getLatestRelease()` or the `mapRelease` method (e.g., publisher lookup failures).
  4. Verify the `releases` table has not been corrupted or had its schema altered unexpectedly.
  5. If the issue is transient (e.g., brief DB unavailability), monitor for self-resolution. If persistent, roll back the last deployment.

**Alert 2: Elevated Latency on Latest Release Lookup**

- **Condition:** `histogram_quantile(0.95, rate(codeplane_release_latest_lookup_duration_seconds_bucket[5m])) > 2` for 10 minutes.
- **Severity:** Warning
- **Runbook:**
  1. Check database query performance — run `EXPLAIN ANALYZE` on the `GetLatestRelease` query for a high-traffic repository.
  2. Verify the `releases` table has appropriate indexes on `(repository_id, is_draft, is_prerelease, published_at, created_at, id)`.
  3. Check if the `mapRelease` step (which loads publisher info and asset lists) is the bottleneck — look at individual query latencies.
  4. If a specific repository with many releases or assets is causing the spike, consider whether asset list loading needs pagination or caching.
  5. Check overall database load and connection pool saturation.

**Alert 3: Sudden Spike in 404s for Latest Release**

- **Condition:** `rate(codeplane_release_latest_not_found_total[5m]) > 50` and `rate(codeplane_release_latest_not_found_total[5m]) > 3 * rate(codeplane_release_latest_not_found_total[1h] offset 1h)` for 10 minutes.
- **Severity:** Info
- **Runbook:**
  1. This may indicate a mass deletion of releases or a change in release publishing patterns — check recent admin actions and release deletion logs.
  2. Verify that release creation and publishing are still working correctly (i.e., new releases aren't being marked as drafts or pre-releases unintentionally).
  3. If caused by an external badge service or CI pipeline hitting a repository that deleted its releases, this is expected behavior and can be acknowledged.

### Error Cases and Failure Modes

| Error Case | HTTP Status | Behavior |
|------------|-------------|----------|
| Database connection failure | 500 | Log error, return generic internal error to client |
| Repository does not exist | 404 | Return `"repository not found"` |
| Repository exists but viewer lacks read access | 403 (private) or 404 (to avoid leaking existence) | Return appropriate error |
| No non-draft, non-prerelease releases exist | 404 | Return `"release not found"` |
| Publisher user record missing for the latest release | 500 | Log error — indicates data integrity issue |
| Asset blob storage unavailable during asset URL signing | 500 | Log error, consider graceful degradation (return release without asset download URLs) |

## Verification

### API Integration Tests

1. **Latest release from repo with one published release:** Create a repo, create a non-draft, non-prerelease release. `GET /releases/latest` returns 200 with the correct release.
2. **Latest release with multiple published releases:** Create 3 published releases with distinct `published_at` timestamps. Verify `/releases/latest` returns the one with the most recent `published_at`.
3. **Latest release excludes drafts:** Create a repo with one draft release and one published release. Verify `/releases/latest` returns the published one.
4. **Latest release excludes pre-releases:** Create a repo with one prerelease and one published release. Verify `/releases/latest` returns the published one.
5. **Latest release excludes draft+prerelease:** Create a repo with a release that is both draft and prerelease, plus a published release. Verify `/releases/latest` returns the published one.
6. **404 when only drafts exist:** Create a repo with only draft releases. `GET /releases/latest` returns 404.
7. **404 when only pre-releases exist:** Create a repo with only prerelease releases. `GET /releases/latest` returns 404.
8. **404 when repo has zero releases:** Create a repo with no releases. `GET /releases/latest` returns 404.
9. **404 when repo does not exist:** `GET /releases/latest` for a non-existent `owner/repo` returns 404.
10. **403 for private repo without access:** Create a private repo. Authenticate as a user without access. `GET /releases/latest` returns 403 or 404 (per existing access-denied behavior).
11. **Anonymous access to public repo:** Create a public repo with a published release. Call `/releases/latest` without authentication. Verify 200 with correct release data.
12. **Anonymous access to private repo:** Create a private repo with a published release. Call `/releases/latest` without authentication. Verify 404 (existence not leaked).
13. **Response includes assets:** Create a release with two confirmed assets. Verify `/releases/latest` response includes both assets with correct metadata.
14. **Pending assets hidden from anonymous viewer:** Create a release with one confirmed and one pending asset. Call without auth. Verify only the confirmed asset appears.
15. **Pending assets visible to write-access viewer:** Same setup as above but authenticate as a collaborator with write access. Verify both assets appear.
16. **Response shape matches release detail:** Compare the response body from `/releases/latest` with `/releases/:id` for the same release. Verify they are identical.
17. **Newly promoted release becomes latest:** Create a prerelease, then update it to `prerelease: false`. Verify `/releases/latest` now returns this release.
18. **Deleted latest release yields next latest:** Create two published releases. Delete the newer one. Verify `/releases/latest` now returns the older one.
19. **Deleted only release yields 404:** Create one published release. Delete it. Verify `/releases/latest` returns 404.
20. **Tiebreaker on same timestamp:** Create two releases with the same `published_at` (if possible via direct DB insertion in tests). Verify the one with the higher ID is returned.
21. **Release with null `published_at` uses `created_at`:** Create a release where `published_at` is null. Verify it's eligible for latest and ordering uses `created_at`.
22. **Tag-only release is eligible:** Create a release with `is_tag: true` that is non-draft, non-prerelease. Verify it can be returned as latest.
23. **Owner/repo path parameters with mixed case:** Call with `OWNER/REPO` instead of `owner/repo`. Verify case-insensitive resolution works.
24. **URL-encoded owner/repo:** Call with URL-encoded characters in the path. Verify correct resolution.
25. **Response contains correct author data:** Verify `author.id` and `author.login` match the release publisher.
26. **Response contains correct timestamps:** Verify `created_at`, `updated_at`, and `published_at` are valid ISO 8601 strings.
27. **Maximum repo name length (100 chars):** Create a repo with a 100-character name, add a release, verify `/releases/latest` works.
28. **Maximum tag name length (255 chars):** Create a release with a 255-character tag name. Verify it is correctly returned by `/releases/latest`.
29. **Release body with maximum content:** Create a release with a large body (e.g., 65,535 characters). Verify `/releases/latest` returns the full body.
30. **Release body larger than maximum:** Attempt to create a release with a body exceeding the maximum allowed size. Verify the creation fails with a validation error (so it can never become "latest").

### CLI Integration Tests

31. **`codeplane release view latest` returns the latest release:** Set up a repo with releases. Run `codeplane release view latest --repo owner/repo`. Verify the output matches the expected latest release.
32. **`codeplane release view latest --json` returns valid JSON:** Run with `--json`. Verify the output is parseable JSON with the correct structure.
33. **`codeplane release view latest --json .tag_name` filters output:** Run with field filter. Verify only the tag name is output.
34. **`codeplane release view latest` when no latest exists:** Verify the CLI prints an appropriate error message and exits with a non-zero exit code.
35. **`codeplane release view latest` is not confused with a tag named "latest":** Create a release tagged `"latest"` that is a prerelease, and another release tagged `"v1.0.0"` that is a stable release. Verify `codeplane release view latest` returns `v1.0.0` (the actual latest), not the tag literally named "latest".
36. **`codeplane release view` with a numeric ID still works:** Verify that adding `"latest"` support does not regress numeric-ID-based lookups.
37. **`codeplane release view` with a tag name still works:** Verify that adding `"latest"` support does not regress tag-name-based lookups.

### Web UI E2E Tests (Playwright)

38. **Latest release badge on repo overview:** Navigate to a repo with a published release. Verify the "Latest Release" card/badge is visible on the overview page.
39. **No latest release badge when only drafts exist:** Navigate to a repo with only draft releases. Verify no "Latest Release" card is shown.
40. **Latest release badge navigates to detail:** Click the latest release card. Verify navigation to the release detail page.
41. **"Latest" badge in release list:** Navigate to the releases list page. Verify the latest stable release has a "Latest" badge.
42. **"Latest" badge not shown on pre-releases in list:** Verify pre-releases in the list do not have the "Latest" badge.
43. **"Latest" badge on release detail page:** Navigate directly to the release detail page for the latest release. Verify the badge is present.
44. **Latest release card updates after new release:** Create a new stable release via the API. Refresh the repo overview. Verify the card now shows the new release.

### TUI Integration Tests

45. **Latest release line in repo detail:** Open repo detail in TUI. Verify "Latest Release" line shows the correct tag name and date.
46. **No latest release line when none exists:** Open repo detail for a repo with no releases. Verify the line is absent.
47. **Navigation from latest release line:** Select the latest release line and press Enter. Verify navigation to the release detail screen.
