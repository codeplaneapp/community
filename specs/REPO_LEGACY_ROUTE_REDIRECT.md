# REPO_LEGACY_ROUTE_REDIRECT

Specification for REPO_LEGACY_ROUTE_REDIRECT.

## High-Level User POV

Codeplane's web application uses an owner-scoped URL structure for all repository pages: every repository lives at `/:owner/:repo` followed by whatever sub-page you need (issues, landings, settings, code, and so on). This is the canonical way to address a repository, and it reflects the fact that the same repository name can exist under different users or organizations.

However, older versions of Codeplane, older bookmarks, external documentation, third-party tools, and some internal link patterns may still reference repositories using a legacy URL format: `/repo/:repo/...`. These URLs omit the owner entirely — they reference only the repository name and whatever sub-path follows.

When you visit a legacy `/repo/:repo/...` URL in your browser, Codeplane does not show you a 404 page or an error. Instead, it silently and instantly redirects you to the equivalent canonical URL under the correct owner. You see the same page you expected — issues, code, settings — at the right address, and your browser's URL bar updates to the modern `/:owner/:repo/...` format. If you had a bookmark to `/repo/my-project/issues`, you now see `alice/my-project/issues` (or whichever user or org owns that repository) without having to know or type the owner yourself.

The "fallback owner" is the key concept that makes this work. Codeplane resolves the owner for a legacy path by looking up who owns the referenced repository. In a single-user or self-hosted instance where the authenticated user owns the repository, this resolution is straightforward. The redirect is a one-time navigation cost: once your browser arrives at the canonical URL, subsequent navigation stays on the modern paths.

This feature is invisible to most users — it quietly prevents broken links and stale bookmarks from becoming dead ends. It matters most when you are migrating from an older Codeplane setup, when a colleague sends you a link from an older integration, or when external tooling generates URLs in the old format. The redirect ensures continuity and eliminates confusion without requiring you to manually update every reference.

## Acceptance Criteria

## Definition of Done

The feature is complete when any request to a legacy `/repo/:repo` or `/repo/:repo/*` URL in the web application is seamlessly redirected to the canonical `/:owner/:repo` or `/:owner/:repo/*` URL, preserving the full sub-path and query string. The fallback owner is resolved correctly for all valid repository names. All edge cases — nonexistent repositories, ambiguous names, unauthenticated visitors, deeply nested sub-paths, and query parameters — are handled gracefully. The feature is covered by end-to-end Playwright tests and API-level integration tests.

## Functional Constraints

- [ ] Any navigation to `/repo/:repo` redirects to `/:owner/:repo` where `:owner` is the resolved fallback owner for that repository.
- [ ] Any navigation to `/repo/:repo/*` (with any sub-path, e.g., `/repo/my-project/issues/42`) redirects to `/:owner/:repo/*` preserving the full sub-path.
- [ ] Query strings on legacy URLs are preserved through the redirect (e.g., `/repo/my-project/issues?state=closed&page=2` → `/:owner/my-project/issues?state=closed&page=2`).
- [ ] Hash fragments on legacy URLs are preserved through the redirect (e.g., `/repo/my-project/wiki/page#section` → `/:owner/my-project/wiki/page#section`).
- [ ] The redirect uses an HTTP 301 (Moved Permanently) status code to instruct browsers and search engines to update their references.
- [ ] If the repository name in the legacy URL does not match any existing repository, the redirect does not occur and the user sees the standard 404 page.
- [ ] If the repository name matches a repository the current user does not have permission to view (private repo, non-member), the user sees a 404 page — not a 403 — to avoid leaking the existence of private repositories.
- [ ] The fallback owner resolution works for both user-owned and organization-owned repositories.
- [ ] If the repository name is ambiguous (exists under multiple owners), the resolution must use a deterministic strategy: prefer the authenticated user's own repository first, then fall back to the first match by repository creation date (oldest first).
- [ ] Unauthenticated users visiting a legacy URL for a public repository are redirected to the canonical URL without being forced to log in.
- [ ] Unauthenticated users visiting a legacy URL for a private repository see the login page with a `redirect` query parameter set to the resolved canonical URL (not the legacy URL).
- [ ] The repository name segment in the legacy URL is matched case-insensitively. `/repo/My-Project` and `/repo/my-project` both resolve correctly.
- [ ] Repository names containing valid special characters (`.`, `-`, `_`) are handled correctly in the legacy path.
- [ ] Repository names up to 100 characters (the maximum allowed length) are handled correctly.
- [ ] Legacy URLs with trailing slashes are normalized (e.g., `/repo/my-project/` → `/:owner/my-project`).
- [ ] The redirect does not apply to paths that are not under the `/repo/` prefix — for example, `/repos/...` or `/repository/...` do not trigger legacy redirect behavior.
- [ ] The redirect does not apply to API routes — only to web application navigation routes.
- [ ] The redirect does not create infinite redirect loops under any circumstance.
- [ ] The redirect response includes a `Cache-Control: public, max-age=3600` header for successful redirects, so browsers cache the resolution and avoid repeated lookups.
- [ ] Encoded characters in the legacy URL path are decoded correctly before resolution (e.g., `/repo/my%2Dproject` resolves the same as `/repo/my-project`).

## Edge Cases

- [ ] A legacy URL where the repo name is an empty string (`/repo/` or `/repo`) returns a 404, not a redirect.
- [ ] A legacy URL with only whitespace as the repo name (`/repo/%20`) returns a 404.
- [ ] A legacy URL where the repo name exceeds 100 characters returns a 404 without attempting a database lookup.
- [ ] A legacy URL where the repo name matches a reserved word (e.g., `/repo/settings`, `/repo/issues`) returns a 404 since these cannot be valid repository names.
- [ ] A legacy URL that would produce a canonical URL colliding with a global route (e.g., if owner resolution returned `admin` and repo was `settings`) still redirects correctly because the `/:owner/:repo` pattern is only matched after global routes.
- [ ] A legacy URL for a repository that has been transferred to a new owner redirects to the repository's current owner, not the former owner.
- [ ] A legacy URL for a repository that has been renamed redirects to the current name under the correct owner.
- [ ] A legacy URL for a forked repository resolves to the fork's owner, not the upstream repository's owner.
- [ ] A legacy URL for an archived repository still redirects correctly — archived repos are viewable, just not writable.

## Design

## Web UI Design

The legacy route redirect is implemented as a route-level catch-all in the SolidJS web application's router configuration. The `/repo/:repo` and `/repo/:repo/*` route patterns are registered in the router alongside the canonical routes, but instead of rendering a view component, they trigger a redirect component that:

1. Extracts the `:repo` segment and any trailing sub-path from the URL.
2. Calls the fallback-owner resolution API to determine the canonical owner for this repository.
3. Constructs the canonical URL by combining `/:owner/:repo` with the preserved sub-path, query string, and hash fragment.
4. Performs a client-side `navigate()` (for SPA navigations) or renders a server-side 301 redirect (for full page loads).

**Visual behavior**: The user should never see a blank page or a loading spinner during the redirect. For the typical case where resolution is fast (under 100ms), the redirect appears instantaneous. If resolution takes longer, a minimal full-page loading indicator (the standard Codeplane app skeleton) is shown until the redirect completes.

**Browser URL bar**: After the redirect, the URL bar shows the canonical `/:owner/:repo/...` path. The legacy URL does not appear in the browser history — it is replaced, not pushed.

## API Shape

A lightweight fallback-owner resolution endpoint supports the web application's redirect behavior:

**`GET /api/repos/resolve?name=:repoName`**

- **Purpose**: Resolve the canonical owner for a repository given only its name.
- **Query Parameters**:
  - `name` (required, string): The repository name to resolve.
- **Response (200)**:
  ```json
  {
    "owner": "alice",
    "repo": "my-project",
    "full_name": "alice/my-project"
  }
  ```
- **Response (404)**: Repository does not exist or the caller does not have access.
  ```json
  {
    "error": "not_found",
    "message": "repository not found"
  }
  ```
- **Authentication**: Optional. If the caller is authenticated, the resolution considers their own repositories first and includes private repos they can access. If unauthenticated, only public repositories are resolved.
- **Ambiguity resolution order**: (1) authenticated user's own repo, (2) oldest public repo by creation date.

## Documentation

The following documentation should be written for end users:

- **Migration Guide — URL Format Update**: A short page explaining that Codeplane now uses `/:owner/:repo` URLs and that old `/repo/:repo` links continue to work via automatic redirect. This should appear in the release notes for the version that introduces owner-scoped URLs and in the self-hosting administration guide.
- **FAQ Entry — "My old bookmarks still work"**: A single-paragraph FAQ entry confirming that legacy bookmarks and links are automatically redirected, and recommending that users update their bookmarks to the new format for fastest access.
- **Integration Guide Note**: A callout in the webhooks and integrations documentation noting that payload URLs use the canonical `/:owner/:repo` format, and any tool generating legacy-format URLs should be updated.

## Permissions & Security

## Authorization

- **Anonymous users**: Can trigger the redirect for public repositories. For private repositories, they are redirected to the login page.
- **Authenticated users (any role — Owner, Admin, Member, Read-Only)**: Can trigger the redirect for any repository they have at least read access to.
- **No elevated permissions required**: The redirect is a read-only navigation operation. It does not modify any data.

## Rate Limiting

- The `/api/repos/resolve` endpoint (if used) is subject to the same rate limiting as other read-only API endpoints.
- A stricter per-IP rate limit of **60 requests per minute** should be applied specifically to legacy redirect resolution to prevent enumeration attacks where an unauthenticated actor probes repository names to discover which ones exist.
- Requests that result in a 404 (repository not found) should count toward the rate limit but should not leak timing information about whether the repository exists — the response time for "not found" and "exists but no access" must be indistinguishable.

## Data Privacy

- The redirect response for private repositories must not reveal the repository's owner in any HTTP header, response body, or redirect `Location` header to unauthenticated users. Instead, unauthenticated users are sent to the login page.
- The resolve endpoint must treat "does not exist" and "exists but you don't have access" identically to prevent repository name enumeration.
- No PII is exposed in the redirect response itself — only public repository ownership information that is already visible on the user's profile page.

## Telemetry & Product Analytics

## Business Events

- **`LegacyRouteRedirectTriggered`**: Fired each time a legacy `/repo/:repo/...` URL triggers a redirect.
  - Properties:
    - `repo_name` (string): The repository name from the legacy URL.
    - `resolved_owner` (string | null): The owner the redirect resolved to, or null if it resulted in a 404.
    - `sub_path` (string): The trailing sub-path after the repo name (e.g., `/issues/42`).
    - `had_query_string` (boolean): Whether the original URL included query parameters.
    - `is_authenticated` (boolean): Whether the visitor was logged in.
    - `referrer_domain` (string | null): The referring domain, if present (to understand where legacy links originate).
    - `resolution_ms` (number): Time in milliseconds to resolve the owner.
    - `outcome` (`"redirected"` | `"not_found"` | `"login_required"`): The final result.

## Funnel Metrics

- **Legacy redirect volume over time**: A declining trend indicates that external tools and bookmarks are being updated. A flat or increasing trend indicates ongoing dependence on legacy URLs.
- **Redirect-to-page-view conversion rate**: The percentage of legacy redirects where the user proceeds to interact with the resolved page (versus bouncing). This validates that the redirects are landing users on the right content.
- **404 rate on legacy routes**: The percentage of legacy URL visits that resolve to "not found." A high rate may indicate that users have bookmarks to deleted or renamed repositories.
- **Time-to-deprecation readiness**: The overall daily volume of legacy redirect events. When this drops below a configured threshold (e.g., <10/day for a self-hosted instance), the team can consider removing legacy route support in a future major version.

## Observability

## Logging

- **INFO** — Log each successful redirect with structured fields: `event=legacy_redirect_resolved`, `repo_name`, `resolved_owner`, `resolved_full_path`, `sub_path`, `resolution_ms`, `request_id`, `user_id` (if authenticated, else `anonymous`).
- **WARN** — Log each failed resolution (404 outcome) with structured fields: `event=legacy_redirect_not_found`, `repo_name`, `request_id`, `user_id`, `client_ip` (hashed). This is WARN because a small number of 404s is expected, but a sustained spike may indicate link rot or an enumeration attempt.
- **ERROR** — Log any unexpected failure in the resolution path (e.g., database timeout, service unavailability) with: `event=legacy_redirect_error`, `repo_name`, `error_message`, `error_code`, `request_id`.
- **DEBUG** — Log the full resolution decision path: which candidate owners were considered, why a specific owner was chosen, whether ambiguity resolution was needed.

## Prometheus Metrics

- **`codeplane_legacy_redirect_total`** (counter): Total number of legacy route redirect attempts, labeled by `outcome` (`redirected`, `not_found`, `login_required`, `error`).
- **`codeplane_legacy_redirect_resolution_duration_seconds`** (histogram): Time to resolve the fallback owner, with buckets at 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0 seconds.
- **`codeplane_legacy_redirect_ambiguous_total`** (counter): Number of redirects where the repository name was ambiguous (existed under multiple owners) and required disambiguation.
- **`codeplane_legacy_redirect_rate_limited_total`** (counter): Number of requests rejected by the legacy-route-specific rate limiter.

## Alerts

### Alert: High Legacy Redirect Error Rate
- **Condition**: `rate(codeplane_legacy_redirect_total{outcome="error"}[5m]) > 0.1` (more than ~6 errors per minute sustained over 5 minutes).
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `event=legacy_redirect_error` entries in the past 15 minutes to identify the error pattern.
  2. Verify database connectivity — the most likely cause is the repository lookup query timing out or the database being unavailable.
  3. Check if the repo service is healthy: `GET /api/health` should return 200.
  4. If the database is healthy, check for recent deployments that may have changed the resolution query or route registration.
  5. If the issue is transient (e.g., a brief DB connection pool exhaustion), monitor for recovery. If sustained, escalate to the database on-call.

### Alert: Legacy Redirect Resolution Latency Spike
- **Condition**: `histogram_quantile(0.95, rate(codeplane_legacy_redirect_resolution_duration_seconds_bucket[5m])) > 0.5` (p95 resolution time exceeds 500ms).
- **Severity**: Warning
- **Runbook**:
  1. Check if the database is under load — run `SELECT count(*) FROM pg_stat_activity WHERE state = 'active'` or equivalent PGLite diagnostics.
  2. Check if the repository name resolution query is missing an index. The query should be hitting an index on `repositories.name` (case-insensitive).
  3. Check if there is an unusually high volume of legacy redirect requests (possible enumeration attack). Cross-reference with the rate limiter counter.
  4. If latency is caused by a missing index, add the index and monitor recovery. If caused by load, consider caching resolved names in memory with a short TTL (60s).

### Alert: Suspected Repository Name Enumeration
- **Condition**: `rate(codeplane_legacy_redirect_total{outcome="not_found"}[5m]) > 1` (more than ~60 not-found resolutions per minute) OR `rate(codeplane_legacy_redirect_rate_limited_total[5m]) > 0.5`.
- **Severity**: Warning
- **Runbook**:
  1. Check the rate-limited request logs for the source IP(s).
  2. Verify that the rate limiter is functioning correctly and returning 429 responses.
  3. If the traffic is from a single IP or small IP range, consider adding a temporary IP block via the infrastructure firewall.
  4. If the traffic pattern is distributed, ensure that the timing-safe 404 responses are in place (no information leakage about repository existence).
  5. Document the incident for the security team.

## Error Cases and Failure Modes

| Error Case | Behavior | Log Level |
|---|---|---|
| Repository name is empty | Return 404 immediately, no DB lookup | DEBUG |
| Repository name exceeds 100 chars | Return 404 immediately, no DB lookup | DEBUG |
| Repository name is a reserved word | Return 404 immediately, no DB lookup | DEBUG |
| Repository not found in database | Return 404 page | WARN |
| Repository exists but user has no access | Return 404 page (same as not found) | WARN |
| Database query timeout | Return 502 error page with retry prompt | ERROR |
| Database connection unavailable | Return 503 error page with retry prompt | ERROR |
| Rate limit exceeded | Return 429 with `Retry-After` header | WARN |
| Redirect would create a loop (defensive check) | Return 404 page, log the anomaly | ERROR |

## Verification

## API Integration Tests

- [ ] `GET /api/repos/resolve?name=existing-repo` returns 200 with the correct owner when a single matching public repository exists.
- [ ] `GET /api/repos/resolve?name=existing-repo` returns 200 with the authenticated user's repository when the name exists under multiple owners and one belongs to the authenticated user.
- [ ] `GET /api/repos/resolve?name=existing-repo` returns 200 with the oldest repository by creation date when the name exists under multiple owners and none belongs to the authenticated user.
- [ ] `GET /api/repos/resolve?name=nonexistent-repo` returns 404.
- [ ] `GET /api/repos/resolve?name=private-repo` returns 404 when the caller is unauthenticated.
- [ ] `GET /api/repos/resolve?name=private-repo` returns 200 when the caller is authenticated and has access.
- [ ] `GET /api/repos/resolve?name=private-repo` returns 404 when the caller is authenticated but does not have access (no information leak).
- [ ] `GET /api/repos/resolve?name=` (empty name) returns 404.
- [ ] `GET /api/repos/resolve?name=a` (1-character name, minimum valid) returns the correct result if a repo with that name exists.
- [ ] `GET /api/repos/resolve?name=<100-char-name>` (maximum valid length) returns the correct result if a matching repo exists.
- [ ] `GET /api/repos/resolve?name=<101-char-name>` (exceeds max length) returns 404 without a database query.
- [ ] `GET /api/repos/resolve?name=My-Project` (mixed case) resolves the same as `GET /api/repos/resolve?name=my-project` (case-insensitive matching).
- [ ] `GET /api/repos/resolve?name=repo.with.dots` correctly resolves a repository name containing periods.
- [ ] `GET /api/repos/resolve?name=repo-with-dashes` correctly resolves a repository name containing hyphens.
- [ ] `GET /api/repos/resolve?name=repo_with_underscores` correctly resolves a repository name containing underscores.
- [ ] `GET /api/repos/resolve?name=settings` returns 404 because `settings` is a reserved repository name.
- [ ] `GET /api/repos/resolve?name=issues` returns 404 because `issues` is a reserved repository name.
- [ ] The resolve endpoint returns consistent timing for "not found" vs "exists but no access" (timing-safe, within ±50ms).
- [ ] The resolve endpoint respects rate limiting: sending 61+ requests in 60 seconds from the same IP returns 429 on subsequent requests.
- [ ] `GET /api/repos/resolve?name=transferred-repo` returns the new owner after a repository transfer.
- [ ] `GET /api/repos/resolve?name=archived-repo` returns the owner correctly (archived repos are still resolvable).
- [ ] `GET /api/repos/resolve?name=forked-repo` returns the fork owner, not the upstream owner.

## Playwright End-to-End Tests (Web UI)

- [ ] Navigating to `/repo/my-project` redirects to `/alice/my-project` (where `alice` is the owner) with a 301 status.
- [ ] Navigating to `/repo/my-project/issues` redirects to `/alice/my-project/issues`, preserving the sub-path.
- [ ] Navigating to `/repo/my-project/issues/42` redirects to `/alice/my-project/issues/42`, preserving a deeply nested sub-path.
- [ ] Navigating to `/repo/my-project/issues?state=closed&page=2` redirects to `/alice/my-project/issues?state=closed&page=2`, preserving the query string.
- [ ] Navigating to `/repo/my-project/wiki/page#section` redirects to `/alice/my-project/wiki/page#section`, preserving the hash fragment.
- [ ] Navigating to `/repo/my-project/` (trailing slash) redirects to `/alice/my-project` (normalized, no trailing slash).
- [ ] After redirect, the browser URL bar shows the canonical `/:owner/:repo/...` URL.
- [ ] After redirect, the browser history does not contain the legacy URL (replacement, not push).
- [ ] Navigating to `/repo/nonexistent-repo` shows the 404 page.
- [ ] Navigating to `/repo/` (no repo name) shows the 404 page.
- [ ] Navigating to `/repo/private-repo` when unauthenticated redirects to `/login?redirect=/:owner/private-repo` (or the resolved canonical path).
- [ ] Navigating to `/repo/private-repo` when authenticated with access redirects to `/:owner/private-repo`.
- [ ] Navigating to `/repo/private-repo` when authenticated without access shows the 404 page.
- [ ] The redirect is visually seamless — no visible flash of a blank page or loading state for resolutions under 200ms.
- [ ] Navigating to `/repo/My-Project` (mixed case) redirects correctly (case-insensitive resolution).
- [ ] Navigating to `/repos/my-project` (note the `s` — not a legacy path) does NOT trigger the legacy redirect.
- [ ] Navigating to `/repository/my-project` does NOT trigger the legacy redirect.
- [ ] The redirect works correctly for a repository that was recently transferred to a new owner.
- [ ] The redirect works correctly for a repository owned by an organization.
- [ ] Navigating to `/repo/my-project/settings` redirects to `/:owner/my-project/settings` (the sub-path `settings` is preserved as a repo sub-route, not confused with the reserved word check on repo names).
- [ ] Multiple sequential legacy URL navigations within the same session all resolve correctly (no stale caching).
- [ ] Clicking a legacy URL link from an external page (full page load, not SPA navigation) triggers the redirect correctly.

## CLI Tests

- [ ] The CLI does not use legacy `/repo/:repo` URLs in any generated output or help text — all references use `/:owner/:repo` format.
- [ ] If the CLI encounters a legacy-format URL in a remote or config, the `detectRepoFromRemotes()` fallback logic resolves the owner correctly.

## Load and Security Tests

- [ ] Sending 100 concurrent legacy redirect requests for the same repository completes without errors and all receive 301 responses.
- [ ] Sending 100 concurrent legacy redirect requests for nonexistent repositories all receive 404 responses without leaking timing information.
- [ ] Sending requests exceeding the rate limit (61+ in 60 seconds) returns 429 responses with a valid `Retry-After` header.
- [ ] The resolution endpoint completes in under 50ms for p95 under normal load (single repository, no ambiguity).
