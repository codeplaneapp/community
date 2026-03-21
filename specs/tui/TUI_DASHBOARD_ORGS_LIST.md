# TUI_DASHBOARD_ORGS_LIST

Specification for TUI_DASHBOARD_ORGS_LIST.

## High-Level User POV

The dashboard organizations list is one of the primary sections on the Codeplane TUI Dashboard screen. It sits alongside the Repositories, Starred Repos, Activity Feed, and Quick Actions sections, and is reachable by pressing `Tab` from the Repositories section. It answers the question: "which organizations do I belong to?"

The list shows every organization the authenticated user is a member of, ordered by creation order (ID ascending). Each row displays the organization's name, a visibility badge (`public`, `limited`, or `private`), and a single-line truncated description. The focused row is highlighted with the `primary` accent color, and the user moves through the list with `j`/`k` (or arrow keys). Pressing `Enter` on a focused organization pushes the organization overview screen onto the navigation stack, updating the breadcrumb to "Dashboard > org-name".

At the top of the organizations section is a section header reading "Organizations" with the total membership count in parentheses — for example, "Organizations (5)". Below the header, a search/filter input can be activated by pressing `/`, which narrows the visible list to organizations whose name or description matches the typed query (case-insensitive, client-side). Pressing `Esc` clears the filter and returns focus to the list.

The list uses a scrollbox for vertical scrolling. When the user scrolls past 80% of the loaded items, the next page of organizations is fetched automatically via cursor-based pagination. A "Loading more…" indicator appears at the bottom of the list during the fetch. If there are no more pages, no indicator is shown.

If the user belongs to no organizations, the list area shows a centered, muted-color message: "No organizations yet. Create one with `codeplane org create`." This empty state is shown immediately — not after a loading spinner — when the API returns an empty result set.

When the terminal is at minimum size (80×24), the description column is hidden, and only the organization name and visibility badge are shown. At standard size (120×40), the full layout is rendered with all columns including the description and location. At large sizes (200×60+), the description column is wider, the website is displayed as an additional column, and more metadata becomes visible.

If the API request fails — due to a network error, auth expiry, or rate limiting — an inline error message replaces the list content with the error description and a hint: "Press `R` to retry." The header and status bars remain stable during error states. The organizations section loads independently of other dashboard sections; a failure in the orgs list does not affect the repos list or activity feed.

## Acceptance Criteria

### Definition of Done

- The Dashboard screen renders an "Organizations" section showing the authenticated user's organization memberships
- Organizations are fetched via `useOrgs()` from `@codeplane/ui-core`, which calls `GET /api/user/orgs`
- The list is sorted by `id` ascending (creation order), matching the API default sort
- Each row displays: name, visibility badge (public/limited/private), and description (truncated)
- `j`/`k` (and `Down`/`Up` arrow keys) move the focus cursor through the list
- `Enter` on a focused row pushes the organization overview screen onto the navigation stack with the org's `name` as context
- `/` activates an inline filter input that narrows the list client-side by name or description substring match (case-insensitive)
- `Esc` while the filter input is focused clears the filter text, returns focus to the list
- The section header shows "Organizations (N)" where N is the `X-Total-Count` from the API response
- Cursor-based pagination loads the next page when the scrollbox scroll position reaches 80% of content height
- "Loading more…" is shown at the bottom of the scrollbox while the next page is being fetched
- When all pages are loaded, no pagination indicator is shown
- The empty state message "No organizations yet. Create one with `codeplane org create`." is shown when the user has zero organizations
- A loading spinner with "Loading…" is shown in the orgs section while the initial data fetch is in progress
- API errors display an inline error message with "Press `R` to retry" hint
- Auth errors (401) propagate to the app-shell-level auth error screen
- Rate limit errors (429) display the retry-after period inline
- The orgs section is the second dashboard section in tab order (after Repositories)
- The section loads independently of other dashboard sections — its loading, error, and data states are self-contained

### Keyboard Interactions

- `j` / `Down`: Move focus to next organization row
- `k` / `Up`: Move focus to previous organization row
- `Enter`: Open the focused organization (push org overview screen)
- `/`: Focus the filter input
- `Esc`: Clear filter input and return focus to list (if filter is focused)
- `G`: Jump to the last visible/loaded organization row
- `g g`: Jump to the first organization row
- `Ctrl+D`: Page down within the scrollbox
- `Ctrl+U`: Page up within the scrollbox
- `R`: Retry the last failed API request (only active in error state)
- `Tab` / `Shift+Tab`: Move focus to the next/previous dashboard section

### Responsive Behavior

- Below 80×24: "Terminal too small" handled by router
- 80×24 – 119×39 (minimum): Description and location columns hidden. Each row shows: name (up to 50 chars, truncated with `…`) │ visibility badge
- 120×40 – 199×59 (standard): Full layout with name (30ch) + description (40ch) + visibility badge + location (20ch)
- 200×60+ (large): Expanded name (40ch), description (60ch), visibility badge, location (30ch), website (30ch)

### Truncation and Boundary Constraints

- Organization `name`: truncated with trailing `…` when exceeding column width (50/30/40 chars at min/standard/large). Max 39 characters from API (so truncation only applies at minimum size for long names)
- Organization `description`: truncated with trailing `…`. Max display: 40 chars (standard), 60 chars (large). Hidden at minimum. Max from API: 2048 characters
- Organization `location`: truncated with trailing `…`. Max display: 20 chars (standard), 30 chars (large). Hidden at minimum. Max from API: 255 characters
- Organization `website`: truncated with trailing `…`. Max display: 30 chars (large only). Hidden at standard and minimum. Max from API: 255 characters
- Visibility badge: exactly one of `public`, `limited`, `private` — never exceeds 7 characters. Rendered with semantic color: `success` for public, `warning` for limited, `error` for private
- Filter input: max 100 characters
- Maximum loaded orgs in memory: 500 items (pagination cap)

### Edge Cases

- Terminal resize while scrolled: scroll position preserved relative to focused item
- Rapid `j` presses: processed sequentially, no debouncing
- Filter during pagination: client-side filter applied to all loaded items; new pages filtered as they arrive
- SSE disconnect: orgs list unaffected (uses REST)
- Unicode in descriptions and locations: truncation respects grapheme clusters
- Organization with empty description: row shows name and visibility only, no empty gap
- Organization with empty location: location column blank, no placeholder
- User removed from org between page loads: stale count tolerated, item simply absent from subsequent page
- Single organization membership: list renders with one row, no pagination controls

## Design

### Layout Structure

The organizations list is a section within the Dashboard screen content area using vertical flexbox:

```
<box flexDirection="column" width="100%" height="100%">
  <box flexDirection="column" flexGrow={1} minHeight={6}>
    {/* Section header */}
    <box flexDirection="row" height={1}>
      <text bold color="primary">Organizations</text>
      <text color="muted"> ({totalCount})</text>
      <box flexGrow={1} />
      <text color="muted">/ filter</text>
    </box>

    {/* Filter input — shown only when active */}
    {filterActive && (
      <box height={1}>
        <input value={filterText} onChange={setFilterText} placeholder="Filter organizations…" />
      </box>
    )}

    {/* Organization list */}
    <scrollbox flexGrow={1}>
      <box flexDirection="column">
        {filteredOrgs.map(org => (
          <box key={org.id} flexDirection="row" height={1}
               backgroundColor={org.id === focusedId ? "primary" : undefined}>
            <box width={nameColumnWidth}>
              <text bold={org.id === focusedId}>{truncate(org.name, nameColumnWidth)}</text>
            </box>
            <box width={visibilityWidth}>
              <text color={visibilityColor(org.visibility)}>{org.visibility}</text>
            </box>
            {showDescription && (
              <box width={descColumnWidth}>
                <text color="muted">{truncate(org.description, descColumnWidth)}</text>
              </box>
            )}
            {showLocation && (
              <box width={locationColumnWidth}>
                <text color="muted">{truncate(org.location, locationColumnWidth)}</text>
              </box>
            )}
            {showWebsite && (
              <box width={websiteColumnWidth}>
                <text color="muted">{truncate(org.website, websiteColumnWidth)}</text>
              </box>
            )}
          </box>
        ))}
        {loadingMore && <box height={1}><text color="muted">Loading more…</text></box>}
      </box>
    </scrollbox>
  </box>
</box>
```

### Loading State

Braille spinner cycling through `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms intervals with "Loading organizations…" text in muted color, centered in the section.

### Empty State

Centered muted text: "No organizations yet. Create one with `codeplane org create`."

### Error State

Error message in `error` color with "Press R to retry" hint in `muted` color, centered in the section.

### Visibility Badge Colors

| Visibility | Color Token | ANSI |
|------------|-------------|------|
| `public` | `success` | Green (34) |
| `limited` | `warning` | Yellow (178) |
| `private` | `error` | Red (196) |

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Move focus down | List focused, not in filter input |
| `k` / `Up` | Move focus up | List focused, not in filter input |
| `Enter` | Open focused org | Org row focused |
| `/` | Activate filter input | List focused |
| `Esc` | Clear filter / return to list | Filter input focused |
| `G` | Jump to last loaded row | List focused |
| `g g` | Jump to first row | List focused |
| `Ctrl+D` | Page down | List focused |
| `Ctrl+U` | Page up | List focused |
| `R` | Retry failed fetch | Error state displayed |
| `Tab` | Next dashboard section | Any section focused |
| `Shift+Tab` | Previous dashboard section | Any section focused |

### Responsive Column Layout

**80×24 (minimum)**: `│ name (50ch) │ public │` — 2 columns visible

**120×40 (standard)**: `│ name (30ch) │ public │ description (40ch) │ location (20ch) │` — 4 columns visible

**200×60 (large)**: `│ name (40ch) │ public │ description (60ch) │ location (30ch) │ website (30ch) │` — 5 columns visible

### Data Hooks

- `useOrgs()` from `@codeplane/ui-core` — returns `{ items: OrgSummary[], totalCount: number, isLoading: boolean, error: Error | null, loadMore: () => void, hasMore: boolean, retry: () => void }`. Calls `GET /api/user/orgs` with cursor-based pagination, default page size 30
- `useTerminalDimensions()` — for responsive column layout breakpoints
- `useOnResize()` — trigger synchronous re-layout
- `useKeyboard()` — keybinding registration

The `OrgSummary` type: `{ id: number; name: string; description: string; visibility: "public" | "limited" | "private"; website: string; location: string; }`

### Navigation Context

When `Enter` is pressed, calls `push("org-overview", { org: focusedOrg.name })` to push the organization overview screen. Breadcrumb updates to "Dashboard > org-name".

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated | Admin |
|--------|-----------|---------------|-------|
| View own orgs list on dashboard | ❌ | ✅ | ✅ |

- The dashboard orgs list is only accessible to authenticated users. The TUI requires authentication at bootstrap; unauthenticated sessions never reach this screen
- `GET /api/user/orgs` returns only organizations where the authenticated user holds an active membership
- No elevated role (admin, org owner) is required
- Private organizations are included — the user is a member, so visibility is granted
- The endpoint is strictly scoped to the authenticated user's own memberships; one user cannot see another user's organization list via this screen

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to `@codeplane/ui-core` API client as Bearer token
- Token is never displayed in the TUI, never logged, never included in error messages
- 401 responses propagate to the app-shell auth error screen

### Rate Limiting

- Authenticated users: 300 requests per minute to `GET /api/user/orgs`
- If 429 is returned, the orgs section displays "Rate limited. Retry in {Retry-After}s." inline
- No auto-retry on rate limit. User presses `R` after the retry-after period

### Input Sanitization

- Filter input is client-side only — never sent to the API
- Organization names, descriptions, locations, and websites rendered as plain text via `<text>` components (no injection risk)
- Deep-link flags validated at the router level

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.dashboard.orgs.view` | Dashboard orgs section becomes visible (initial load completes) | `total_count`, `terminal_width`, `terminal_height`, `breakpoint` (minimum/standard/large), `load_time_ms` |
| `tui.dashboard.orgs.open` | User presses Enter on an org row | `org_name`, `org_visibility`, `position_in_list` (0-indexed), `was_filtered`, `filter_text_length` |
| `tui.dashboard.orgs.filter` | User activates filter (presses `/`) | `total_loaded_count` |
| `tui.dashboard.orgs.filter_submit` | User types in filter and matches narrow the list | `filter_text_length`, `matched_count`, `total_loaded_count` |
| `tui.dashboard.orgs.paginate` | Next page of orgs is loaded | `page_number`, `items_loaded_total`, `total_count` |
| `tui.dashboard.orgs.error` | API request fails | `error_type` (network/auth/rate_limit/server), `http_status` |
| `tui.dashboard.orgs.retry` | User presses R to retry after error | `error_type`, `retry_success` |
| `tui.dashboard.orgs.empty` | Empty state rendered (zero orgs) | — |

### Success Indicators

- **Dashboard orgs load completion rate**: percentage of TUI sessions where the orgs list successfully loads (target: >98%)
- **Org open rate**: percentage of dashboard views where the user opens at least one organization (target: >30%)
- **Filter adoption**: percentage of dashboard views where the user activates the filter (target: >10% for users with >5 orgs)
- **Pagination depth**: average number of pages loaded
- **Error rate**: percentage of orgs section loads that result in error state (target: <2%)
- **Retry success rate**: percentage of retry attempts that succeed (target: >80%)
- **Time to first interaction**: time from orgs section render to first j/k/Enter keypress
- **Section engagement rate**: percentage of dashboard sessions where user tabs to the orgs section (target: >20%)

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|---------|
| `info` | Orgs section loaded | `total_count`, `items_in_first_page`, `load_time_ms` |
| `info` | Org opened from dashboard | `org_name`, `position_in_list` |
| `info` | Pagination page loaded | `page_number`, `items_count`, `total_loaded` |
| `warn` | API error on orgs fetch | `http_status`, `error_message` (no token) |
| `warn` | Rate limited on orgs fetch | `retry_after_seconds` |
| `warn` | Filter returned zero results | `filter_text`, `total_loaded_count` |
| `debug` | Filter activated | `filter_text_length` |
| `debug` | Filter cleared | — |
| `debug` | Scroll position updated | `scroll_percent`, `focused_index`, `total_loaded` |
| `debug` | Pagination trigger reached | `scroll_percent`, `items_loaded`, `has_more` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on initial fetch | Data hook timeout (30s) | Loading spinner replaced with error + "Press R to retry" |
| Network timeout on pagination | Data hook timeout (30s) | "Loading more…" replaced with inline error. Existing items remain visible. R retries |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen |
| Rate limited (429) | API returns 429 with Retry-After | Inline error: "Rate limited. Retry in Ns." R retries after waiting |
| Server error (500) | API returns 5xx | Inline error with generic message. R retries |
| Terminal resize during initial load | `useOnResize` fires during fetch | Fetch continues. Renders at new size when data arrives |
| Terminal resize during scrolled list | `useOnResize` fires | Column widths recalculate. Focused row stays visible |
| SSE disconnect | Status bar shows disconnected | Orgs list unaffected (uses REST, not SSE) |
| Empty response with non-zero total_count | items.length === 0 && totalCount > 0 | Treated as end-of-pagination |
| Malformed API response | JSON parse error | Error state rendered with generic error message |
| React error boundary triggered | Error boundary catches | Error screen per app-shell error boundary |
| Concurrent membership removal | Org disappears from paginated results | Stale count tolerated; next refresh corrects |

### Failure Modes

- **Total fetch failure**: Error state shown in orgs section. Other dashboard sections may still load independently
- **Partial pagination failure**: Existing loaded items remain visible. Only "Loading more…" area shows error
- **Memory pressure**: 500-item pagination cap prevents unbounded memory growth. Virtual scrolling limits render tree

## Verification

### Test File: `e2e/tui/dashboard.test.ts`

### Terminal Snapshot Tests (13 tests)

- **dashboard-orgs-list-initial-load**: Launch TUI → Tab to orgs section → snapshot matches golden file showing "Organizations (N)" header, list rows with org names, visibility badges, and descriptions. Focused row highlighted
- **dashboard-orgs-list-empty-state**: Launch TUI for user with zero org memberships → Tab to orgs section → snapshot shows centered "No organizations yet. Create one with `codeplane org create`." in muted color
- **dashboard-orgs-list-loading-state**: Launch TUI with slow API → Tab to orgs section → snapshot shows "Loading…" centered in orgs section with braille spinner
- **dashboard-orgs-list-error-state**: Launch TUI with failing API → Tab to orgs section → snapshot shows error message in red with "Press R to retry"
- **dashboard-orgs-list-focused-row**: Launch TUI → Tab to orgs section → first org row highlighted with primary color
- **dashboard-orgs-list-visibility-badges**: Launch TUI with orgs of varying visibility → public orgs show green "public", limited orgs show yellow "limited", private orgs show red "private"
- **dashboard-orgs-list-filter-active**: Tab to orgs, press `/` → filter input appears with placeholder "Filter organizations…"
- **dashboard-orgs-list-filter-results**: Tab to orgs, press `/`, type "acme" → list shows only matching orgs
- **dashboard-orgs-list-filter-no-results**: Tab to orgs, press `/`, type "zzzznonexistent" → "No matching organizations" shown
- **dashboard-orgs-list-pagination-loading**: Scroll to bottom of orgs list → "Loading more…" visible
- **dashboard-orgs-list-header-total-count**: Tab to orgs section → header shows "Organizations (N)" with correct count
- **dashboard-orgs-list-description-shown-standard**: Launch at 120×40 → description column visible with correct truncation
- **dashboard-orgs-list-location-shown-standard**: Launch at 120×40 → location column visible for orgs with location set

### Keyboard Interaction Tests (25 tests)

- **dashboard-orgs-j-moves-down**: Tab to orgs, press `j` → focus moves from first to second org row
- **dashboard-orgs-k-moves-up**: Tab to orgs, press `j` then `k` → focus returns to first org row
- **dashboard-orgs-k-at-top-no-wrap**: Tab to orgs, press `k` on first row → focus stays (no wrap-around)
- **dashboard-orgs-j-at-bottom-no-wrap**: Navigate to last org row, press `j` → focus stays (triggers pagination if more)
- **dashboard-orgs-down-arrow-moves-down**: Tab to orgs, press Down → same as `j`
- **dashboard-orgs-up-arrow-moves-up**: Tab to orgs, press Down then Up → same as `k`
- **dashboard-orgs-enter-opens-org**: Tab to orgs, press Enter → org overview pushed, breadcrumb shows "Dashboard > org-name"
- **dashboard-orgs-enter-on-second-item**: Tab to orgs, press `j` then Enter → second org's overview pushed
- **dashboard-orgs-slash-activates-filter**: Tab to orgs, press `/` → filter input focused
- **dashboard-orgs-filter-narrows-list**: Tab to orgs, press `/`, type "acme" → only matching orgs shown
- **dashboard-orgs-filter-case-insensitive**: Tab to orgs, press `/`, type "ACME" → case-insensitive match
- **dashboard-orgs-esc-clears-filter**: Tab to orgs, press `/`, type "test", Esc → filter cleared, full list shown
- **dashboard-orgs-G-jumps-to-bottom**: Tab to orgs, press `G` → focus on last loaded row
- **dashboard-orgs-gg-jumps-to-top**: Tab to orgs, press `G` then `g g` → focus on first row
- **dashboard-orgs-ctrl-d-page-down**: Tab to orgs, press `Ctrl+D` → focus moves down by half visible height
- **dashboard-orgs-ctrl-u-page-up**: Tab to orgs, press `Ctrl+D` then `Ctrl+U` → focus returns
- **dashboard-orgs-R-retries-on-error**: Orgs error state, press `R` → fetch retried
- **dashboard-orgs-R-no-op-when-loaded**: Tab to orgs, press `R` when loaded → no effect
- **dashboard-orgs-tab-moves-to-next-section**: Tab from orgs → focus moves to next dashboard section (Starred Repos)
- **dashboard-orgs-shift-tab-returns-to-repos**: On orgs, press `Shift+Tab` → focus returns to repos section
- **dashboard-orgs-j-in-filter-input**: Tab to orgs, press `/` then `j` → 'j' typed in filter, NOT list navigation
- **dashboard-orgs-q-in-filter-input**: Tab to orgs, press `/` then `q` → 'q' typed in filter, NOT quit
- **dashboard-orgs-pagination-on-scroll**: Scroll to 80% of orgs list → next page loaded
- **dashboard-orgs-rapid-j-presses**: Tab to orgs, send `j` 10 times → focus moves 10 rows sequentially
- **dashboard-orgs-enter-during-loading**: Tab to orgs during initial load, press Enter → no-op

### Responsive Tests (11 tests)

- **dashboard-orgs-80x24-layout**: Terminal 80×24 → name + visibility badge only. No description, location, or website
- **dashboard-orgs-80x24-truncation**: Terminal 80×24, long org name → truncated with `…`
- **dashboard-orgs-120x40-layout**: Terminal 120×40 → name + visibility + description + location all visible
- **dashboard-orgs-120x40-description-truncation**: Terminal 120×40, long description → truncated with `…`
- **dashboard-orgs-120x40-location-truncation**: Terminal 120×40, long location → truncated with `…`
- **dashboard-orgs-200x60-layout**: Terminal 200×60 → expanded columns plus website column visible
- **dashboard-orgs-resize-standard-to-min**: Resize 120×40 → 80×24 → description and location columns collapse immediately
- **dashboard-orgs-resize-min-to-standard**: Resize 80×24 → 120×40 → description and location columns appear
- **dashboard-orgs-resize-preserves-focus**: Resize at any breakpoint → focused row preserved
- **dashboard-orgs-resize-during-filter**: Resize with filter active → filter stays, results re-rendered at new layout
- **dashboard-orgs-filter-input-80x24**: Terminal 80×24, Tab to orgs, press `/` → filter renders at full width

### Integration Tests (14 tests)

- **dashboard-orgs-auth-expiry**: 401 on orgs fetch → app-shell auth error screen, not inline error
- **dashboard-orgs-rate-limit-429**: 429 with Retry-After: 30 → "Rate limited. Retry in 30s."
- **dashboard-orgs-network-error**: Network timeout → inline error with "Press R to retry"
- **dashboard-orgs-pagination-complete**: 45 orgs (page size 30) → both pages load, all 45 visible
- **dashboard-orgs-500-items-cap**: 600 orgs → only 500 loaded, "Showing first 500 of 600"
- **dashboard-orgs-enter-then-q-returns**: Enter on org, then q → dashboard with scroll/focus preserved in orgs section
- **dashboard-orgs-goto-g-o-navigates**: From dashboard, `g o` → full Organizations list screen (not dashboard orgs section)
- **dashboard-orgs-server-error-500**: 500 on fetch → inline error with "Press R to retry"
- **dashboard-orgs-concurrent-section-load**: Dashboard sections load independently; orgs section shows its own loading/error/data state while repos section loads separately
- **dashboard-orgs-private-org-visible**: User who is a member of a private org → private org appears with red "private" badge
- **dashboard-orgs-empty-description-no-gap**: Org with empty description → row renders without description gap
- **dashboard-orgs-unicode-description**: Org with Unicode description (emoji, CJK) → renders correctly, truncation respects grapheme clusters
- **dashboard-orgs-unicode-location**: Org with Unicode location (e.g., "東京, 日本") → renders correctly
