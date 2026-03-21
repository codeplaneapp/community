# RELEASES_UI_LIST

Specification for RELEASES_UI_LIST.

## High-Level User POV

When a developer, contributor, or consumer navigates to a repository in Codeplane, they expect a dedicated "Releases" tab that provides a clear, browseable feed of every published version of the project. This is where users go to find the latest stable build, download platform-specific binaries, read changelogs, and understand the project's release cadence.

From the web UI, a user clicks the "Releases" tab in the repository navigation bar and immediately sees a chronological feed of release cards — newest first. Each card prominently displays the release tag (for example `v2.1.0`), the release title, the author who published it, and when it was published. Release notes are previewed inline so users can scan what changed without drilling into each release. Draft releases are visible only to maintainers and collaborators with write access, and they are clearly badged in yellow so there's no confusion about what's public. Pre-release versions get their own distinct orange badge, making it easy for users to distinguish stable releases from beta or release-candidate builds.

A filter bar sits above the feed, giving users checkboxes to include or exclude drafts and pre-releases. Page-based pagination keeps the feed responsive for projects with dozens or hundreds of releases. When the page is empty — either because the project has no releases yet or because filters have excluded all entries — the user sees a helpful message rather than a blank screen. A "New release" button in the page header gives maintainers a clear path to create a release without leaving the context.

From the TUI, the releases screen within the repository view offers the same browsing experience via keyboard navigation. Users can scroll through releases, toggle filters with single-key shortcuts, and drill through to release details. From the CLI, `codeplane release list` prints the same data in a terminal-friendly table or JSON format for scripting.

The release list is essential for open-source distribution, internal deployment tracking, agent-driven version discovery, and any workflow that needs to find the latest published artifact for a project.

## Acceptance Criteria

### Definition of Done

- [ ] The web UI renders a releases list page at `/:owner/:repo/releases` accessible from the repository navigation tab bar.
- [ ] The TUI renders a releases screen accessible from the repository detail navigation.
- [ ] Both surfaces consume the existing `GET /api/repos/:owner/:repo/releases` endpoint with no API changes required.
- [ ] Release cards display: tag name badge, release title, author avatar and login, relative publication timestamp (absolute on hover), draft badge (yellow, conditional), pre-release badge (orange, conditional), truncated release notes preview, asset count, and total download count across assets.
- [ ] The list is ordered by `COALESCE(published_at, created_at) DESC, id DESC` — matching the API's sort contract.
- [ ] Draft releases are hidden from users without write access. The "Include drafts" filter checkbox is only visible to users with write access.
- [ ] The "Include pre-releases" filter checkbox is visible to all users.
- [ ] Changing a filter immediately fetches fresh data, resets pagination to page 1, and updates the URL query string.
- [ ] Pagination controls display "Showing X–Y of Z releases" and provide Previous/Next navigation.
- [ ] The "New release" button is visible only to users with write access or higher.
- [ ] Clicking a release card navigates to the release detail page at `/:owner/:repo/releases/:id`.
- [ ] All three empty states render correctly: no releases exist, filters exclude all results, and API error with retry action.
- [ ] Skeleton loading cards display while the API request is in flight.
- [ ] The page is fully usable at viewport widths from 320px (mobile) to 2560px (ultrawide).
- [ ] All interactive elements are keyboard-navigable with appropriate ARIA attributes.
- [ ] The browser page title follows the pattern "Releases · owner/repo · Codeplane".

### Functional Requirements

- [ ] Filter state is URL-driven: `?drafts=true`, `?prereleases=false`, `?page=2` are all bookmarkable.
- [ ] Invalid or unknown filter query parameters are silently discarded, falling back to defaults.
- [ ] Browser history is correctly updated on filter and pagination changes so back/forward navigation works.
- [ ] Filter changes are debounced client-side at 150ms to prevent excessive API calls during rapid toggling.
- [ ] Pagination page numbers beyond the last page render an empty list with the correct total count rather than an error.
- [ ] Page 1 disables the "Previous" button; the last page disables the "Next" button.
- [ ] Clicking pagination scrolls the viewport to the top of the release list.

### Edge Cases

- [ ] A repository with exactly zero releases shows the onboarding empty state, not an empty card list.
- [ ] A repository at the maximum release limit (1,000) loads the first page of 30 results without performance degradation.
- [ ] A release with zero assets shows "0 assets" (not a missing label or error).
- [ ] A release with `published_at: null` (draft) displays its `created_at` timestamp instead.
- [ ] A release with a 255-character tag name renders correctly with truncation if needed.
- [ ] A release with a 255-character title truncates with ellipsis and shows the full title on hover.
- [ ] Release note preview handles markdown, unicode, emoji, HTML entities, and angle brackets safely without XSS or layout breakage.
- [ ] Release note preview is limited to the first 3 lines or 200 characters, whichever comes first.
- [ ] A release card with assets whose status is `pending` (upload not yet confirmed) still includes those assets in the asset count.
- [ ] When a write-access user toggles "Include drafts" and navigates away and back, the filter state is preserved via URL.
- [ ] When a read-only user loads a URL containing `?drafts=true`, the filter parameter is silently ignored (the API will enforce exclusion server-side).

### Boundary Constraints

- [ ] Maximum items per page: 50 (server-enforced; the UI sends `per_page` values up to 50).
- [ ] Default items per page: 30.
- [ ] Maximum releases per repository: 1,000.
- [ ] Maximum assets per release: 50.
- [ ] Tag name maximum length: 255 characters.
- [ ] Release title maximum length: 255 characters.
- [ ] Asset name maximum length: 255 characters.
- [ ] Release notes preview maximum display length: 200 characters or 3 lines.

## Design

### Web UI Design

#### Route

`/:owner/:repo/releases` — mounted under the repository layout shell, appearing as a top-level tab in the repository navigation bar alongside Code, Issues, Landings, Workflows, Wiki, and Settings.

#### Page Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ Repository Header (breadcrumb: owner / repo)                        │
├──────────────────────────────────────────────────────────────────────┤
│ Repository Tab Bar (Code | Issues | Landings | Workflows |          │
│                      Releases* | Wiki | Settings)                   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Releases                                              [+ New release]│
│                                                                      │
│  ☐ Include drafts (write-access only)  ☐ Include pre-releases        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │ [v2.1.0]  Version 2.1.0                            alice · 3d ago││
│  │           ## What's Changed                                      ││
│  │           - Feature A, Bug fix B...                              ││
│  │           3 assets · 1,204 downloads                             ││
│  ├──────────────────────────────────────────────────────────────────┤│
│  │ [v2.1.0-rc.1]  Version 2.1.0 RC 1      [prerelease] alice · 5d ago│
│  │           Release candidate for 2.1.0...                         ││
│  │           1 asset · 42 downloads                                 ││
│  ├──────────────────────────────────────────────────────────────────┤│
│  │ [v2.0.0]  Version 2.0.0                            bob · 2w ago  ││
│  │           Major version with breaking changes...                 ││
│  │           5 assets · 8,903 downloads                             ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│                 Showing 1–3 of 3 releases                            │
│                 ← Previous  Page 1 of 1  Next →                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### Release Card Anatomy

Each release card is a clickable, hover-highlighted container with the following elements:

| Element | Position | Behavior |
|---------|----------|----------|
| Tag badge | Top-left, prominent | Monospace font, styled as a code-like chip (e.g., `v1.2.0`). Links to release detail. |
| Title | Immediately right of tag | Heading weight text. Truncates with ellipsis at column width; full title on hover/tooltip. |
| Draft badge | Inline after title | Yellow badge, text "Draft". Only rendered when `draft: true`. |
| Pre-release badge | Inline after title | Orange badge, text "Pre-release". Only rendered when `prerelease: true`. |
| Author | Right-aligned or below title | Avatar (16px circle) + login text. |
| Timestamp | Right-aligned | Relative format (e.g., "3 days ago"). Full ISO date on hover via `title` attribute. Published releases use `published_at`; drafts use `created_at`. |
| Release notes preview | Below title row | First 3 lines or 200 characters of `body`, rendered as plain text (markdown stripped for preview). Faded trailing edge if truncated. |
| Asset count | Bottom-left of card | Icon + "N assets" (e.g., "3 assets"). Shows "0 assets" if none. |
| Download count | Adjacent to asset count | Icon + formatted count across all assets (e.g., "1,204 downloads"). Summed from `asset.download_count`. Shows "0 downloads" if none. |

#### Filter Bar

- Position: Below the page title, above the release card list.
- "Include drafts" checkbox: Only rendered for users with write access to the repository. Default: unchecked (drafts excluded). When checked, sends `exclude_drafts=false` to the API. When unchecked, sends `exclude_drafts=true`. Updates URL: `?drafts=true`.
- "Include pre-releases" checkbox: Always visible. Default: checked (pre-releases included). When unchecked, sends `exclude_prereleases=true` to the API. Updates URL: `?prereleases=false`.
- Filter changes immediately trigger a new API request, reset pagination to page 1, and update the URL.

#### Pagination Controls

- Position: Below the release card list.
- Display: "Showing X–Y of Z releases" summary line.
- Controls: `← Previous` | `Page X of N` | `Next →`.
- Total pages = `ceil(X-Total-Count / per_page)`.
- Previous disabled on page 1. Next disabled on last page.
- Page changes update URL `?page=N`, fetch new data, and scroll to top of list.

#### Empty States

1. **No releases exist**: Centered layout with an icon/illustration. Primary text: "No releases yet". Secondary text: "Create your first release to distribute software to your users." "New release" button (write-access only).
2. **Filters exclude all results**: Centered text: "No releases match the current filters." Subtext: "Try adjusting the filters above." No action button.
3. **Network/API error**: Error icon. Primary text: "Failed to load releases." "Retry" button that re-issues the API request.

#### Loading State

- Skeleton cards matching the release card layout during initial load (3 skeleton cards).
- Subsequent page loads overlay a non-blocking loading indicator without clearing the current list content.

#### Responsive Breakpoints

| Viewport Width | Behavior |
|----------------|----------|
| 320–639px (mobile) | Cards stack vertically. Tag and title on separate lines. Author hidden. Timestamp below title. Asset/download counts on separate line. |
| 640–1023px (tablet) | Cards show tag and title inline. Author displayed. Timestamp right-aligned. |
| 1024px+ (desktop) | Full card layout as diagrammed above. All elements visible. |

#### "New Release" Button

- Position: Right-aligned in the page header, same row as the "Releases" title.
- Label: "+ New release" (desktop), "+ New" (mobile).
- Visibility: Only rendered for users with write access or higher.
- Action: Navigates to `/:owner/:repo/releases/new`.

### TUI UI Design

#### Screen Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Releases (18)                                    owner/repo      │
│ Drafts: hidden │ Pre-releases: shown                             │
├──────┬──────────────────────────────┬───────────┬────────────────┤
│ Tag  │ Title                        │ Status    │ Published      │
├──────┼──────────────────────────────┼───────────┼────────────────┤
│►v2.1 │ Version 2.1.0                │           │ 3 days ago     │
│ v2.1…│ Version 2.1.0 RC 1           │ prerelease│ 5 days ago     │
│ v2.0 │ Version 2.0.0                │           │ 2 weeks ago    │
├──────┴──────────────────────────────┴───────────┴────────────────┤
│ Page 1/1  d:drafts p:prereleases Enter:detail q:back             │
└─────────────────────────────────────────────────────────────────┘
```

#### Keyboard Bindings

| Key | Action |
|-----|--------|
| `j` / `↓` | Move selection down |
| `k` / `↑` | Move selection up |
| `Enter` | Open selected release detail |
| `d` | Toggle draft inclusion (only for users with write access) |
| `p` | Toggle pre-release inclusion |
| `Ctrl+D` / `Ctrl+U` | Page down / page up |
| `R` | Retry on error |
| `q` / `Esc` | Return to previous screen |

#### Empty State

- Centered text: "No releases found."
- If filters are active: "No releases match the current filters. Press d/p to adjust."

#### Responsive Terminal Breakpoints

| Size | Behavior |
|------|----------|
| 80×24 | Tag truncated to 8 chars, title truncated, status hidden |
| 120×40 | Full tag, full title, status visible |
| 200×60+ | Extra padding, full display |

### CLI Command

`codeplane release list [OPTIONS]` — already implemented.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--page` | number | `1` | Page number |
| `--limit` | number | `30` | Results per page (max 50) |
| `--drafts` | boolean | `false` | Include draft releases |
| `--prereleases` | boolean | `true` | Include pre-releases |
| `--repo` / `-R` | string | auto-detect | Repository in `OWNER/REPO` format |
| `--json` | boolean | `false` | Output raw JSON array |

Default output: Table with columns TAG, NAME, STATUS, DATE. Drafts labeled `[draft]`, pre-releases labeled `[prerelease]`.

JSON output: Raw API response array suitable for piping to `jq`.

Empty output: "No releases found."

### API Shape

The UI consumes the existing endpoint. No API changes are required.

**Endpoint:** `GET /api/repos/:owner/:repo/releases`

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | 1-indexed page number |
| `per_page` | integer | `30` | Items per page (max 50) |
| `exclude_drafts` | boolean | `false` | When `true`, omit draft releases |
| `exclude_prereleases` | boolean | `false` | When `true`, omit pre-release releases |

**Response:** `200 OK` with `X-Total-Count` header and JSON array of `ReleaseResponse` objects.

### SDK / ui-core Shape

**SolidJS Resource (Web UI):**
```typescript
function createReleasesResource(params: () => {
  owner: string;
  repo: string;
  page?: number;
  perPage?: number;
  excludeDrafts?: boolean;
  excludePrereleases?: boolean;
}): [Resource<ReleaseResponse[]>, { total: Accessor<number>; refetch: () => void }]
```

**React Hook (TUI):**
```typescript
function useReleases(params: {
  owner: string;
  repo: string;
  page?: number;
  perPage?: number;
  excludeDrafts?: boolean;
  excludePrereleases?: boolean;
}): {
  data: ReleaseResponse[];
  total: number;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

### Documentation

The following end-user documentation should be written:

1. **Guides > Releases** (`docs/guides/releases.mdx`): Add a "Browsing Releases" section covering web UI navigation to the releases tab, understanding the release card layout, using draft and pre-release filters, and pagination.
2. **CLI Reference > release list** (`docs/cli/release-list.mdx`): Document all flags, examples, and output formats including `codeplane release list --json | jq '.[0].tag_name'`.
3. **TUI Reference > Releases Screen** (`docs/tui/releases.mdx`): Document keyboard shortcuts, filter toggles, and navigation.
4. **API Reference > List Releases** (`docs/api/releases-list.mdx`): Full REST API reference with query parameters, response schema, pagination headers, error codes, and draft visibility rules.
5. **Concepts > Release Visibility** (`docs/concepts/release-visibility.mdx`): Explain how draft visibility is enforced based on authentication and permission level, and how pre-release badging works.

## Permissions & Security

### Authorization Matrix

| Role | View releases tab | See published releases | See drafts | See pre-releases | "New release" button | Filter controls |
|------|-------------------|----------------------|------------|------------------|---------------------|------------------|
| Anonymous (public repo) | ✅ | ✅ | ❌ | ✅ | ❌ | Pre-releases only |
| Anonymous (private repo) | ❌ (404) | ❌ | ❌ | ❌ | ❌ | N/A |
| Authenticated, no repo access (public) | ✅ | ✅ | ❌ | ✅ | ❌ | Pre-releases only |
| Authenticated, no repo access (private) | ❌ (404) | ❌ | ❌ | ❌ | ❌ | N/A |
| Read permission | ✅ | ✅ | ❌ | ✅ | ❌ | Pre-releases only |
| Write permission | ✅ | ✅ | ✅ | ✅ | ✅ | Drafts + Pre-releases |
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | Drafts + Pre-releases |
| Repository owner | ✅ | ✅ | ✅ | ✅ | ✅ | Drafts + Pre-releases |
| Organization owner | ✅ | ✅ | ✅ | ✅ | ✅ | Drafts + Pre-releases |

### Access Denied Behavior

- Private repositories must return HTTP 404 (not 401 or 403) to anonymous or unauthorized users, preventing repository existence enumeration.
- The web UI must show a generic 404 page, not a "you don't have access" message, for private repositories the user cannot access.

### Rate Limiting

- **Authenticated users:** 60 requests per minute per user for the release list endpoint.
- **Unauthenticated users:** 30 requests per minute per IP address.
- **Client-side debounce:** Rapid filter toggling in the web UI and TUI must be debounced at 150ms to avoid hitting server-side rate limits during normal use.
- **HTTP 429** response must include `Retry-After` header. Clients must surface a rate-limit message and disable controls until the reset window.

### Data Privacy

- Private repository releases are not visible to unauthorized viewers. The API returns 404 (not 403) to avoid leaking the existence of private repositories.
- Release bodies may contain user-authored content including links and markdown. All rendered HTML must be sanitized to prevent XSS.
- Author information (id and login) is public profile data, not PII.
- No email addresses, API tokens, or other sensitive data should ever appear in release response payloads.
- Release note content is not indexed by search engines for private repositories (no public caching headers).

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `release_list.viewed` | User loads the release list page (any client) | `repository_id`, `owner`, `repo`, `viewer_id` (nullable), `client` (web / tui / cli / api), `page`, `per_page`, `exclude_drafts`, `exclude_prereleases`, `result_count`, `total_count`, `is_empty` |
| `release_list.filtered` | User changes a filter checkbox in web UI or toggles a filter in TUI | `repository_id`, `owner`, `repo`, `filter_type` (drafts / prereleases), `filter_value` (true / false), `client`, `viewer_id` |
| `release_list.paginated` | User navigates to a non-first page | `repository_id`, `owner`, `repo`, `page`, `total_pages`, `client`, `viewer_id` |
| `release_list.item_clicked` | User clicks a release card to navigate to detail | `repository_id`, `owner`, `repo`, `release_id`, `release_tag`, `is_draft`, `is_prerelease`, `position_in_list`, `client` |
| `release_list.empty_state_seen` | User sees an empty state | `repository_id`, `owner`, `repo`, `empty_type` (no_items / no_matches / error), `client` |
| `release_list.create_clicked` | User clicks the "New release" button | `repository_id`, `owner`, `repo`, `client` |
| `release_list.error` | API call fails | `repository_id`, `owner`, `repo`, `error_type`, `http_status`, `client` |
| `release_list.retry` | User clicks retry after error | `repository_id`, `owner`, `repo`, `client` |

### Funnel Metrics & Success Indicators

1. **Discovery rate**: Percentage of repository visitors who navigate to the releases list. Target: track baseline, improve quarter-over-quarter.
2. **Drill-through rate**: Percentage of `release_list.viewed` sessions that produce at least one `release_list.item_clicked`. Target: >40%.
3. **Download conversion**: Percentage of release list views that eventually lead to an asset download within the same session.
4. **Create conversion**: Percentage of `release_list.viewed` by write-access users that result in `release_list.create_clicked`. Benchmark, no target.
5. **Filter engagement rate**: Percentage of `release_list.viewed` sessions with at least one `release_list.filtered`. Target: >10%.
6. **Error rate**: Ratio of `release_list.error` to `release_list.viewed`. Target: <0.5%.
7. **Client distribution**: Breakdown of `release_list.viewed` by `client` property. Tracks adoption across web, TUI, CLI, and API surfaces.
8. **Load time p95**: Release list load time p95 should be < 200ms.
9. **Pagination depth**: Average maximum page reached. If most users never paginate, the default page size is adequate.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context | Condition |
|-----------|-------|-------------------|------------|
| Release list request received | `debug` | `owner`, `repo`, `page`, `per_page`, `exclude_drafts`, `exclude_prereleases`, `viewer_id`, `request_id` | Every request |
| Release list response served | `info` | `owner`, `repo`, `result_count`, `total_count`, `duration_ms`, `status_code`, `request_id` | Every successful response |
| Draft filter override (forced for non-write user) | `debug` | `owner`, `repo`, `viewer_id`, `original_exclude_drafts`, `effective_exclude_drafts`, `request_id` | When service overrides the caller's draft preference |
| Release list query error | `error` | `owner`, `repo`, `error_message`, `error_code`, `stack_trace`, `request_id` | Database or service-level failure |
| Repository not found during release list | `warn` | `owner`, `repo`, `viewer_id`, `request_id` | 404 returned for missing or access-denied repo |
| Invalid query parameter | `warn` | `owner`, `repo`, `parameter_name`, `parameter_value`, `request_id` | Bad boolean value, non-parseable page, etc. |
| Rate limit exceeded | `warn` | `owner`, `repo`, `viewer_id`, `ip_address`, `request_id` | 429 returned |
| Slow release list query | `warn` | `owner`, `repo`, `duration_ms`, `result_count`, `request_id` | Query exceeds 200ms |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_release_list_requests_total` | Counter | `owner`, `repo`, `status_code` | Total release list API requests |
| `codeplane_release_list_duration_seconds` | Histogram | `owner`, `repo` | Request duration (buckets: 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5) |
| `codeplane_release_list_results_total` | Histogram | `owner`, `repo` | Number of results returned per request (buckets: 0, 1, 5, 10, 20, 30, 50) |
| `codeplane_release_list_errors_total` | Counter | `owner`, `repo`, `error_type` | Errors by type: `not_found`, `bad_request`, `internal`, `rate_limited` |
| `codeplane_release_list_empty_responses_total` | Counter | `owner`, `repo` | Requests returning zero results |
| `codeplane_release_list_ui_loads_total` | Counter | `client` | Client-side page loads by surface (web, tui) |
| `codeplane_release_list_filter_toggles_total` | Counter | `client`, `filter_type` | Filter toggle events by surface and filter |

### Alerts & Runbooks

#### Alert: Release List Error Rate Spike
- **Condition:** `rate(codeplane_release_list_errors_total{error_type="internal"}[5m]) > 0.1`
- **Severity:** Warning
- **Runbook:**
  1. Check structured error logs for `release list query error` entries filtered by the last 10 minutes.
  2. Identify if errors are database-related (connection timeouts, query failures) or application-level.
  3. If database-related: check PG connection pool status, run `SELECT pg_stat_activity` to look for blocking queries, and check disk I/O on the database host.
  4. If application-related: check recent deployments, review error stack traces, and roll back if a regression is identified.
  5. Verify the `releases` table is not corrupted by running `SELECT count(*) FROM releases` and comparing to `X-Total-Count` from recent responses.
  6. Check if the issue is isolated to a specific repository (check `owner`/`repo` labels).

#### Alert: Release List Latency Degradation
- **Condition:** `histogram_quantile(0.95, rate(codeplane_release_list_duration_seconds_bucket[5m])) > 0.5`
- **Severity:** Warning
- **Runbook:**
  1. Check if the latency spike correlates with increased traffic (check `codeplane_release_list_requests_total` rate).
  2. Run `EXPLAIN ANALYZE` on the release list query with typical parameters to check for missing indexes or sequential scans.
  3. Verify the composite index on `releases(repository_id, COALESCE(published_at, created_at) DESC, id DESC)` exists and is being used.
  4. Check if a specific repository has an unusually high number of releases (approaching the 1,000 limit) causing slower queries.
  5. If traffic-driven: check for automated scraping or abuse and consider IP-level rate limiting.
  6. Review the `codeplane_release_list_results_total` histogram for unusually large result sets.

#### Alert: Release List Availability Drop
- **Condition:** `sum(rate(codeplane_release_list_requests_total{status_code=~"5.."}[5m])) / sum(rate(codeplane_release_list_requests_total[5m])) > 0.05`
- **Severity:** Critical
- **Runbook:**
  1. Immediately check server health endpoint (`/health`) and database connectivity.
  2. Check for OOM kills or process restarts via system logs.
  3. Verify the release service is properly initialized in the service registry (check server startup logs for initialization errors).
  4. If the issue is isolated to release list: check for database migration issues that may have altered the `releases` table schema.
  5. Test manually with `curl` against the API endpoint: `curl -v https://<host>/api/repos/<owner>/<repo>/releases`.
  6. Escalate to on-call database admin if the issue is persistent and database-related.

#### Alert: Release List Elevated Rate Limiting
- **Condition:** `rate(codeplane_release_list_errors_total{error_type="rate_limited"}[10m]) > 50`
- **Severity:** Warning
- **Runbook:**
  1. Identify top IPs and user IDs being rate-limited from structured logs.
  2. Determine if traffic is from a misbehaving client (missing debounce), an automation script, or an attack.
  3. If legitimate client bug: file issue, notify client team, consider temporary limit increase.
  4. If attack/scraping: consider IP-level blocking at load balancer.
  5. Review client-side debounce implementation in web UI and TUI.

#### Alert: Release List Zero Traffic
- **Condition:** `rate(codeplane_release_list_requests_total[30m]) == 0` (during business hours)
- **Severity:** Warning
- **Runbook:**
  1. Verify server health via health check endpoints.
  2. Check if the releases route is still mounted in server route tree.
  3. Verify DNS and load balancer health.
  4. Check if a recent deployment broke route registration.
  5. Test manually with `curl` against the API endpoint.

### Error Cases & Failure Modes

| Failure Mode | HTTP Status | User-Facing Behavior | Detection |
|--------------|-------------|---------------------|------------|
| Repository not found | 404 | Web: 404 page. TUI: "Repository not found" error. | Access denied log at `warn` level |
| Private repo, no auth | 404 | Web: 404 page. TUI: Same. | Access denied log |
| Invalid boolean parameter | 400 | Web: falls back to default filter value. API: error response. | Invalid parameter log at `warn` level |
| Database connection failure | 500 | Web: error state with retry button. TUI: "R" to retry. | `errors_total{error_type="internal"}` |
| Query timeout | 500 | Same as above | Duration histogram p99 spike |
| Rate limit exceeded | 429 | Web: "Rate limit exceeded, try again shortly." TUI: wait message. | `errors_total{error_type="rate_limited"}` |
| Malformed page number (NaN) | 200 | Page coerced to 1; results returned normally | No error; graceful degradation |
| SSE/network disconnection during load | Client error | Web: loading state persists, then error. Retry button. | Client-side error event |

## Verification

### Web UI E2E Tests (Playwright)

1. **Navigate to releases tab**: Go to `/:owner/:repo`; click the "Releases" tab; verify the URL is `/:owner/:repo/releases` and the page loads.
2. **Releases tab is active**: Verify the "Releases" tab in the repository nav bar is visually highlighted when on the releases page.
3. **Release cards display correct data**: Create 3 releases via API; navigate to releases list; verify each card shows tag name, title, author login, and relative timestamp.
4. **Tag badge renders correctly**: Verify the tag name appears as a styled badge (e.g., `v1.2.0`) on each card.
5. **Draft badge visibility for write-access user**: Log in as repo admin; create a draft release; verify the card shows a yellow "Draft" badge.
6. **Draft releases hidden for read-only user**: Log in as read-only user; verify draft releases do not appear in the list.
7. **Pre-release badge displayed**: Create a pre-release; verify the card shows an orange "Pre-release" badge.
8. **Release notes preview rendered**: Create a release with a multi-paragraph body; verify only the first 3 lines or 200 characters are shown with a fade/truncation indicator.
9. **Asset count displayed**: Create a release with 3 confirmed assets; verify the card shows "3 assets".
10. **Download count displayed**: Create a release with assets having known download counts; verify the card shows the summed count (e.g., "342 downloads").
11. **Zero assets displays correctly**: Create a release with no assets; verify "0 assets" is shown (not missing or erroring).
12. **Zero downloads displays correctly**: Create a release with assets at 0 downloads; verify "0 downloads" is shown.
13. **Filter: "Include drafts" checkbox visible for write user**: Log in as write-access user; verify the "Include drafts" checkbox is present.
14. **Filter: "Include drafts" checkbox hidden for read-only user**: Log in as read-only user; verify the checkbox is not rendered.
15. **Filter: toggle drafts includes/excludes draft releases**: Log in as write user; toggle "Include drafts" on; verify drafts appear. Toggle off; verify drafts disappear.
16. **Filter: "Include pre-releases" checkbox visible to all users**: Verify checkbox is present for both read-only and write users.
17. **Filter: toggle pre-releases excludes pre-release entries**: Uncheck "Include pre-releases"; verify pre-release entries disappear from the list.
18. **Filter change resets to page 1**: Navigate to page 2; toggle a filter; verify the URL resets to `?page=1` (or page param is removed).
19. **Filter state persisted in URL**: Toggle "Include drafts"; verify URL contains `?drafts=true`. Reload the page; verify the checkbox is still checked and drafts are visible.
20. **URL-driven initial state**: Navigate directly to `?drafts=true&prereleases=false`; verify the filters are applied on initial load.
21. **Invalid filter params in URL silently ignored**: Navigate to `?drafts=banana`; verify the page loads with default filter values.
22. **Browser back restores filter state**: Change filter → back → verify previous filter state is active.
23. **Pagination renders with enough releases**: Create 35 releases; verify pagination controls appear showing "Showing 1–30 of 35 releases".
24. **Pagination next button**: Click Next; verify page 2 loads with different releases and URL updates to `?page=2`.
25. **Pagination previous button**: Go to page 2; click Previous; verify page 1 loads.
26. **Pagination previous disabled on page 1**: On page 1, verify Previous button is disabled.
27. **Pagination next disabled on last page**: On the last page, verify Next button is disabled.
28. **Pagination beyond last page via URL**: Navigate to `?page=999`; verify an empty list with the correct total count.
29. **Release card click navigates to detail**: Click a release card; verify navigation to `/:owner/:repo/releases/:id`.
30. **"New release" button visible for write user**: Log in as write-access user; verify the "New release" button is rendered.
31. **"New release" button hidden for read-only user**: Log in as read-only user; verify the button is not rendered.
32. **"New release" button hidden for anonymous user**: Verify the button is not rendered when unauthenticated.
33. **"New release" button navigates correctly**: Click the button; verify navigation to `/:owner/:repo/releases/new`.
34. **Empty state — no releases**: Navigate to releases for a repo with zero releases; verify the onboarding empty state message: "No releases yet."
35. **Empty state — filters exclude all**: Apply filters that exclude all releases; verify message: "No releases match the current filters."
36. **Loading state**: Intercept the API request with a delay; verify skeleton cards are displayed during loading.
37. **Error state**: Intercept the API request to return 500; verify error message "Failed to load releases" with a "Retry" button.
38. **Error state retry**: Click "Retry" after error; verify the API request is re-issued and the list loads on success.
39. **Responsive layout — mobile (375px)**: Set viewport to 375px wide; verify cards render correctly with stacked layout.
40. **Responsive layout — desktop (1280px)**: Set viewport to 1280px; verify full card layout with all elements.
41. **Title truncation with 255-character title**: Create a release with a 255-character title; verify it truncates with ellipsis and shows full title on hover.
42. **XSS prevention in title**: Create a release with `<script>alert('xss')</script>` in the title; verify it renders as text, not executable HTML.
43. **XSS prevention in body**: Create a release with a body containing `<img onerror=alert(1) src=x>`; verify safe rendering.
44. **Unicode and emoji in title**: Create a release with emoji and unicode characters in the title; verify correct rendering.
45. **Browser tab title**: Verify the page title is "Releases · owner/repo · Codeplane".
46. **Keyboard accessibility**: Tab through filter checkboxes and pagination controls; verify all are focusable and activatable with Enter/Space.
47. **Draft timestamp uses created_at**: Create a draft release with no `published_at`; verify the card displays the `created_at` timestamp.
48. **Published timestamp uses published_at**: Verify published releases use `published_at` for the displayed timestamp.
49. **Private repo — anonymous sees 404**: Navigate to releases for a private repo without auth; verify 404 page (not access denied).
50. **Release ordering**: Create releases with different timestamps; verify they appear in `COALESCE(published_at, created_at) DESC` order.

### TUI Integration Tests

51. **Screen renders**: Open releases screen from repository navigation; verify it renders with title bar and list.
52. **Release list shows entries**: Verify release tag names, titles, and timestamps appear in the list.
53. **`j`/`k` keyboard navigation**: Press j and k; verify the selection indicator moves up and down.
54. **Arrow key navigation**: Verify ↓ and ↑ also move selection.
55. **`Enter` navigates to detail**: Select a release and press Enter; verify navigation to release detail screen.
56. **`d` toggles draft filter**: Press `d`; verify draft releases toggle in/out of the list (for write-access user).
57. **`d` ignored for read-only user**: As a read-only user, press `d`; verify no change.
58. **`p` toggles pre-release filter**: Press `p`; verify pre-release entries toggle in/out.
59. **Empty state**: Open releases for a repo with no releases; verify centered "No releases found." message.
60. **Empty state with filters**: Toggle filters to exclude all; verify filter-specific empty message.
61. **Pagination**: Create enough releases to span multiple pages; verify `Ctrl+D`/`Ctrl+U` navigates pages.
62. **`q` goes back**: Press `q`; verify return to previous screen.
63. **`R` retries on error**: Simulate API error; press `R`; verify retry.
64. **Compact terminal (80×24)**: Verify layout adapts — tag truncated, status hidden.

### API Integration Tests (release list backend, exercised through UI feature)

65. **List releases for public repo (unauthenticated)**: GET without auth; verify 200, correct items, no drafts.
66. **Pagination page 1**: Create 5 releases; GET `per_page=2&page=1`; verify 2 items, `X-Total-Count=5`.
67. **Pagination page 2**: GET `per_page=2&page=2`; verify 2 different items.
68. **Pagination beyond last page**: GET `per_page=2&page=10`; verify empty array, `X-Total-Count=5`.
69. **per_page clamped to 50**: Create 51 releases; GET `per_page=100`; verify at most 50 returned.
70. **Draft exclusion for unauthenticated**: Create published + draft; GET without auth; verify only published returned.
71. **Draft inclusion for write user**: GET as write user without `exclude_drafts`; verify draft included.
72. **Draft exclusion for read-only user**: GET as read user; verify drafts excluded.
73. **Explicit exclude_drafts=true for write user**: GET as write user with `exclude_drafts=true`; verify drafts excluded.
74. **exclude_prereleases=true**: Create stable + prerelease; GET with `exclude_prereleases=true`; verify only stable returned.
75. **Both filters combined**: Create published, draft, prerelease, draft+prerelease; GET with both exclusions; verify only published returned.
76. **Invalid exclude_drafts value**: GET `exclude_drafts=yes`; verify 400.
77. **Invalid exclude_prereleases value**: GET `exclude_prereleases=maybe`; verify 400.
78. **Boolean values as 1/0**: GET `exclude_drafts=1&exclude_prereleases=0`; verify correct filtering.
79. **X-Total-Count reflects filters**: Create 3 published + 2 draft; GET without auth; verify `X-Total-Count=3`.
80. **Empty repository**: GET for repo with no releases; verify 200, empty array, `X-Total-Count=0`.
81. **Repository not found**: GET with nonexistent owner/repo; verify 404.
82. **Private repo without auth**: GET without auth for private repo; verify 404.
83. **Response schema validation**: Verify every field matches expected types.
84. **Assets included in list items**: Create release with 2 confirmed assets; verify list includes both with correct fields.
85. **Maximum per_page boundary (50)**: Create 51 releases; GET `per_page=50`; verify exactly 50 returned.
86. **Repository at maximum release limit (1,000)**: Create 1,000 releases; GET default pagination; verify first page returns 30 with `X-Total-Count=1000`.
87. **Release ordering verified**: Create releases with known timestamps; verify descending `COALESCE(published_at, created_at)` order.
88. **255-character tag name**: Create release with 255-char tag; verify it appears correctly in list response.
89. **255-character title**: Create release with 255-char title; verify full title in response.
90. **Special characters in title and body**: Unicode, emoji, HTML entities, angle brackets — all returned as valid JSON.
