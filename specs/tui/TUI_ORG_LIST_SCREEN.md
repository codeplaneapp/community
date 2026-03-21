# TUI_ORG_LIST_SCREEN

Specification for TUI_ORG_LIST_SCREEN.

## High-Level User POV

The Organization List screen is the dedicated, full-screen organization browser in the Codeplane TUI. It is reached via the `g o` go-to keybinding from any screen, by selecting "Organizations" in the command palette, or by launching the TUI with `codeplane tui --screen orgs`. It occupies the entire content area between the header bar and status bar, giving organizations the full vertical and horizontal space of the terminal — unlike the Dashboard's organizations section, which shares space with repositories, starred repos, and the activity feed.

This screen serves as the comprehensive organization exploration surface. It displays every organization the authenticated user is a member of — public, limited, and private — with rich metadata columns and client-side filtering. The screen is designed for the user who wants to find, browse, and navigate into any organization they belong to, not just the compact "recent orgs" view on the Dashboard.

The screen opens with a header row showing the title "Organizations" in bold primary color, followed by the total organization count in parentheses (e.g., "Organizations (12)"). Below the title is a persistent filter toolbar that shows the current sort order and provides access to filtering by visibility and text search. The filter toolbar is always visible — unlike the Dashboard orgs section where the filter input only appears when the user presses `/`. On this screen, pressing `/` focuses the search input within the toolbar for immediate typing.

The main content is a scrollable list of organization rows. Each row is a single line showing: the organization name, a visibility badge (`public`, `limited`, or `private`) color-coded with semantic colors, a truncated description, and a location string. The focused row is highlighted with the `primary` accent color using reverse video. Navigation uses the standard vim-style `j`/`k` keys (and arrow keys) to move through the list. Pressing `Enter` on a focused organization pushes the organization overview screen onto the navigation stack.

A sort selector is accessible via `o` (order), which cycles through: "Created (oldest)" (default, matching API `id` ascending order), "Created (newest)", "Name A–Z", "Name Z–A". The current sort is displayed in the toolbar and takes effect immediately, re-sorting the locally loaded items.

Visibility filtering is accessible via `v`, which cycles through: "All" (default), "Public only", "Limited only", "Private only". The filter composes with the text search — a user can view "Private orgs matching 'acme', sorted by name."

The list supports cursor-based pagination. When the user scrolls past 80% of the loaded items, the next page is fetched automatically. A "Loading more…" indicator appears at the bottom of the scrollbox during fetch. If all pages have been loaded, no indicator appears. The maximum number of organizations held in memory is 500.

If the user belongs to no organizations at all, the screen shows a centered empty state: "No organizations yet. Create one with `codeplane org create`." in muted color. If the user has organizations but the active filter produces zero matches, a different message is shown: "No organizations match the current filters." with a hint "Press `Esc` to clear filters."

When the terminal is at minimum size (80×24), only the essential columns are shown: organization name and visibility badge. At standard size (120×40), description and location columns appear. At large size (200×60+), the full column set is rendered with website. The layout recalculates immediately on terminal resize, preserving the focused row.

The breadcrumb in the header bar reads "Dashboard > Organizations" since the org list is one level deep in the navigation stack. Pressing `q` returns to the previous screen. The screen's status bar hints show: `j/k:nav  Enter:open  /:filter  o:sort  v:visibility  c:create  q:back`.

## Acceptance Criteria

### Definition of Done

- [ ] The Organization List screen renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The screen is reachable via `g o` go-to navigation, `:orgs` command palette entry, and `--screen orgs` deep-link
- [ ] The breadcrumb reads "Dashboard > Organizations"
- [ ] Pressing `q` pops the screen and returns to the previous screen in the stack
- [ ] Organizations are fetched via `useOrgs()` from `@codeplane/ui-core`, calling `GET /api/user/orgs` with cursor-based pagination (default page size 30)
- [ ] The list is sorted by `id` ascending by default (creation order), matching the API default sort
- [ ] Each row displays: `name`, visibility badge (color-coded), `description` (truncated), and `location` (truncated)
- [ ] The header shows "Organizations (N)" where N is the `X-Total-Count` from the API response
- [ ] The filter toolbar is always visible below the header
- [ ] Visibility badges use semantic colors: `success` (green) for public, `warning` (yellow) for limited, `error` (red) for private

### Keyboard Interactions

- [ ] `j` / `Down`: Move focus to next organization row
- [ ] `k` / `Up`: Move focus to previous organization row
- [ ] `Enter`: Open the focused organization (push org overview screen)
- [ ] `/`: Focus the search input in the filter toolbar
- [ ] `Esc`: Clear filter text and return focus to list. If no filter is active, behave as `q` (pop screen)
- [ ] `G`: Jump to the last loaded organization row
- [ ] `g g`: Jump to the first organization row
- [ ] `Ctrl+D`: Page down within the scrollbox (half visible height)
- [ ] `Ctrl+U`: Page up within the scrollbox (half visible height)
- [ ] `R`: Retry the last failed API request (only active in error state)
- [ ] `o`: Cycle sort order (Created oldest → Created newest → Name A–Z → Name Z–A)
- [ ] `v`: Cycle visibility filter (All → Public only → Limited only → Private only)
- [ ] `c`: Push the create organization form screen
- [ ] `Space`: Toggle row selection (for future batch actions; selected state shown with `✓` prefix)

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the router
- [ ] 80×24 – 119×39 (minimum): Only name (50ch, truncated with `…`) and visibility badge (7ch) shown. Filter toolbar collapses to search input only (sort/visibility labels hidden). Column headers hidden. Description, location, and website columns hidden
- [ ] 120×40 – 199×59 (standard): Full toolbar with sort and visibility labels. Columns: name (30ch), visibility badge (7ch), description (40ch), location (20ch). Column headers visible
- [ ] 200×60+ (large): Expanded layout. Columns: name (40ch), visibility badge (7ch), description (60ch), location (30ch), website (30ch). Column headers visible

### Truncation and Boundary Constraints

- [ ] Organization `name`: truncated with trailing `…` when exceeding column width (50/30/40 chars at min/standard/large). Max 39 characters from API, so truncation only applies at minimum size for long names
- [ ] Organization `description`: truncated with trailing `…`. Max display: 40 chars (standard), 60 chars (large). Hidden at minimum. Max from API: 2048 characters
- [ ] Organization `location`: truncated with trailing `…`. Max display: 20 chars (standard), 30 chars (large). Hidden at minimum. Max from API: 255 characters
- [ ] Organization `website`: truncated with trailing `…`. Max display: 30 chars (large only). Hidden at standard and minimum. Max from API: 255 characters
- [ ] Visibility badge: exactly one of `public`, `limited`, `private` — never exceeds 7 characters
- [ ] Filter/search input: max 120 characters
- [ ] Maximum loaded orgs in memory: 500 items (pagination cap)
- [ ] Total count display: abbreviated above 9999 (e.g., "10k+")

### Edge Cases

- [ ] Terminal resize while scrolled: scroll position preserved relative to focused item; column layout recalculates immediately
- [ ] Rapid `j`/`k` presses: processed sequentially without debouncing, cursor moves one row per keypress
- [ ] Filter during pagination: client-side filter applied to all loaded items; new pages are filtered as they arrive
- [ ] Sort change during pagination: locally loaded items re-sorted immediately
- [ ] Visibility filter change: applies to loaded items immediately; client-side filter (no API re-fetch)
- [ ] SSE disconnect: org list is unaffected (uses REST, not SSE)
- [ ] Unicode in organization names/descriptions/locations: truncation respects grapheme clusters, never splits a multi-byte character
- [ ] API returns orgs with missing fields (empty description, empty location, empty website): rendered as blank in those columns, no empty gap
- [ ] User has access to 500+ orgs: pagination cap reached, footer shows "Showing first 500 of N" in muted text
- [ ] Concurrent navigation: if user presses `Enter` before initial load completes, the keypress is queued and processed after data arrives (or no-op if error)
- [ ] Organization with all three visibility types in the same list: each badge rendered with its correct semantic color
- [ ] User removed from org between page loads: stale count tolerated, item simply absent from subsequent page
- [ ] Single organization membership: list renders with one row, no pagination controls
- [ ] Org name containing hyphens (e.g., `my-open-source-org`): rendered correctly, hyphens never treated as word-break points for truncation

## Design

### Layout Structure

The Organization List screen uses a vertical flexbox layout filling the entire content area:

```
┌─────────────────────────────────────────────────┐
│ Header: Dashboard > Organizations               │
├─────────────────────────────────────────────────┤
│ Organizations (12)                    / filter   │
│ Sort: Created (oldest) │ Showing: All            │
├─────────────────────────────────────────────────┤
│ Name              │ Vis.    │ Description  │ Loc │
├─────────────────────────────────────────────────┤
│ ► acme-corp        public   Acme eng team   SF   │
│   open-src-guild   limited                       │
│   secret-lab       private  Stealth R&D     NYC  │
│   …                                              │
│                   Loading more…                   │
├─────────────────────────────────────────────────┤
│ Status: j/k:nav Enter:open /:filter o:sort q:back│
└─────────────────────────────────────────────────┘
```

The screen is composed of: (1) a title row with "Organizations (N)" header and filter hint, (2) a persistent filter toolbar with search input, sort label, and visibility label, (3) a column header row with bold muted labels on a `surface` background (hidden at 80×24), (4) a `<scrollbox>` containing organization rows with pagination indicator, and (5) conditional empty/error states that replace the scrollbox content.

### OpenTUI Component Structure

The screen uses `<box>` with vertical flexbox for the outer layout. The title row uses `<box flexDirection="row">` containing `<text bold color="primary">Organizations</text>` and `<text color="muted"> ({totalCount})</text>`. The filter toolbar uses `<box flexDirection="row" height={1} backgroundColor="surface">` containing either an `<input>` when filter is active or sort/visibility `<text>` labels. Column headers use `<box flexDirection="row" height={1} backgroundColor="surface">` with `<text bold color="muted">` for each header. The list uses `<scrollbox flexGrow={1}>` wrapping `<box flexDirection="column">` with one `<box flexDirection="row" height={1}>` per organization row. Each row contains `<text>` elements for name, visibility badge (with `color={visibilityColor(org.visibility)}`), description (`color="muted"`), and location (`color="muted"`). The focused row uses `backgroundColor="primary"` and `bold={true}` on the name.

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|-----------|  
| `j` / `Down` | Move focus to next row | List focused, not in search input |
| `k` / `Up` | Move focus to previous row | List focused, not in search input |
| `Enter` | Open focused organization | Organization row focused |
| `/` | Focus search input in toolbar | List focused |
| `Esc` | Clear filter and return focus to list; if no filter active, pop screen | Search input focused or list focused |
| `G` | Jump to last loaded row | List focused |
| `g g` | Jump to first row | List focused |
| `Ctrl+D` | Page down (half visible height) | List focused |
| `Ctrl+U` | Page up (half visible height) | List focused |
| `R` | Retry failed API request | Error state displayed |
| `o` | Cycle sort order | List focused, not in search input |
| `v` | Cycle visibility filter | List focused, not in search input |
| `c` | Push create organization form | List focused, not in search input |
| `Space` | Toggle row selection | Organization row focused |
| `q` | Pop screen (back to previous) | Not in search input |

### Responsive Column Layout

**80×24 (minimum)**: `│ name (50ch) │ public │` — Toolbar shows search input only. Column headers hidden.

**120×40 (standard)**: `│ name (30ch) │ public (7ch) │ description (40ch) │ location (20ch) │` — Full toolbar. Column headers visible.

**200×60 (large)**: `│ name (40ch) │ public (7ch) │ description (60ch) │ location (30ch) │ website (30ch) │` — All columns visible. Column headers visible.

### Resize Behavior

- `useTerminalDimensions()` provides current `{ width, height }` for breakpoint calculation
- `useOnResize()` triggers synchronous re-layout when the terminal is resized
- Column widths recalculate based on the new breakpoint category
- The focused row remains focused and visible after resize
- Scroll position adjusts to keep the focused row in view
- No animation or transition during resize — single-frame re-render

### Data Hooks

- `useOrgs()` from `@codeplane/ui-core` — returns `{ items: OrgSummary[], totalCount: number, isLoading: boolean, error: Error | null, loadMore: () => void, hasMore: boolean, retry: () => void }`. Calls `GET /api/user/orgs` with cursor-based pagination, default page size 30
- `useTerminalDimensions()` — provides terminal size for responsive breakpoint calculation
- `useOnResize()` — triggers synchronous re-layout on terminal resize
- `useKeyboard()` — registers keybinding handlers for the screen's keybinding map
- `useNavigation()` — provides `push()` for navigating to org overview and `pop()` for back navigation
- `useUser()` — provides current user for context

The `OrgSummary` type: `{ id: number; name: string; description: string; visibility: "public" | "limited" | "private"; website: string; location: string; }`

### Navigation Context

When `Enter` is pressed on a focused organization, calls `push("org-overview", { org: focusedOrg.name })`. Breadcrumb updates to "Dashboard > Organizations > org-name". When `c` is pressed, calls `push("org-create")`. When `q` is pressed, calls `pop()` to return to the previous screen.

### Sort and Filter State

Sort and filter state is local to the screen component and is not persisted across navigation. Sort options cycle: "Created (oldest)" → "Created (newest)" → "Name A–Z" → "Name Z–A". Visibility options cycle: "All" → "Public only" → "Limited only" → "Private only". Text search is client-side substring matching on `name` and `description`, case-insensitive. All sort and visibility filtering is applied client-side to locally loaded items.

### Loading States

- **Initial load**: Full-height centered spinner with "Loading organizations…" text. Header and toolbar rendered immediately; only the list area shows the spinner. Braille spinner cycling through `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms intervals in primary color
- **Pagination loading**: "⠋ Loading more…" text at bottom of scrollbox. Existing rows remain visible and navigable
- **Sort/filter change**: No spinner. Locally loaded items re-sort/filter immediately
- **Timeout**: Initial load times out at 30 seconds → error state with retry

### Visibility Badge Colors

| Visibility | Color Token | ANSI |
|------------|-------------|------|
| `public` | `success` | Green (34) |
| `limited` | `warning` | Yellow (178) |
| `private` | `error` | Red (196) |

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Authenticated | Admin |
|--------|-----------|---------------|-------|
| View organization list screen | ❌ | ✅ | ✅ |
| Open an organization | ❌ | ✅ | ✅ |
| Create an organization | ❌ | ✅ | ✅ |

- The Organization List screen requires authentication. The TUI enforces authentication at bootstrap; unauthenticated sessions never reach this screen
- `GET /api/user/orgs` returns only organizations where the authenticated user holds an active membership
- No elevated role (admin, org owner) is required to view the list
- Users see only organizations they are a member of — the API enforces membership scoping
- Private organizations are included because the user is a member
- The endpoint is strictly scoped to the authenticated user's own memberships; one user cannot see another user's organization list via this screen
- Admin role does not grant cross-user visibility on this endpoint

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token passed to the `@codeplane/ui-core` API client as a `Bearer` token in the `Authorization` header
- Token is never displayed in the TUI, never written to logs, never included in error messages
- 401 responses propagate to the app-shell-level auth error screen with message "Session expired. Run `codeplane auth login` to re-authenticate."

### Rate Limiting

- Authenticated users: 300 requests per minute to `GET /api/user/orgs`
- If 429 is returned, the org list screen displays "Rate limited. Retry in {Retry-After}s." inline
- No auto-retry on rate limit. User presses `R` after the retry-after period has elapsed

### Input Sanitization

- Search/filter input is client-side only — the text is never sent to the API
- Sort and visibility filter values are from a fixed enum — no user-controlled strings reach the API beyond the token
- Organization names, descriptions, locations, and websites are rendered as plain `<text>` components (no injection vector)
- Deep-link flag `--screen orgs` is validated against the router's allowlist

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.orgs.view` | Organization List screen mounted and initial data loaded | `total_count`, `terminal_width`, `terminal_height`, `breakpoint` (minimum/standard/large), `load_time_ms`, `entry_method` (goto/palette/deeplink) |
| `tui.orgs.open` | User presses Enter on an organization row | `org_name`, `org_visibility`, `position_in_list` (0-indexed), `was_filtered`, `filter_text_length`, `sort_order`, `visibility_filter` |
| `tui.orgs.filter` | User focuses the search input (presses `/`) | `total_loaded_count`, `sort_order`, `visibility_filter` |
| `tui.orgs.filter_apply` | Filter text changes and results narrow | `filter_text_length`, `matched_count`, `total_loaded_count` |
| `tui.orgs.sort_change` | User cycles sort order (presses `o`) | `new_sort_order`, `previous_sort_order`, `total_loaded_count` |
| `tui.orgs.visibility_change` | User cycles visibility filter (presses `v`) | `new_visibility`, `previous_visibility`, `matched_count` |
| `tui.orgs.paginate` | Next page of orgs loaded | `page_number`, `items_loaded_total`, `total_count`, `sort_order` |
| `tui.orgs.create` | User presses `c` to navigate to create form | — |
| `tui.orgs.error` | API request fails | `error_type` (network/auth/rate_limit/server), `http_status`, `request_type` (list) |
| `tui.orgs.retry` | User presses `R` to retry after error | `error_type`, `retry_success` |
| `tui.orgs.empty` | Empty state rendered (zero orgs) | `has_filters_active` |

### Common Properties (all events)

- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Screen load completion rate | >98% |
| Org open rate (per screen view) | >50% |
| Filter adoption | >15% for users with >5 orgs |
| Sort usage | >8% |
| Visibility filter usage | >5% |
| Pagination depth (avg pages) | 1.2 |
| Error rate | <2% |
| Retry success rate | >80% |
| Time to first interaction | median <2s |
| Create action rate | >3% |

## Observability

### Logging

| Log Level | Event | Details |
|-----------|-------|--------|
| `info` | Organization list screen loaded | `total_count`, `items_in_first_page`, `load_time_ms`, `entry_method` |
| `info` | Organization opened from list | `org_name`, `position_in_list` |
| `info` | Organization create form pushed | — |
| `info` | Pagination page loaded | `page_number`, `items_count`, `total_loaded`, `sort_order` |
| `warn` | API error on orgs fetch | `http_status`, `error_message` (token redacted) |
| `warn` | Rate limited on orgs fetch | `retry_after_seconds` |
| `warn` | Filter returned zero results | `filter_text`, `visibility_filter`, `total_loaded_count` |
| `warn` | Pagination cap reached | `total_count`, `cap` (500) |
| `debug` | Filter activated | `filter_text_length` |
| `debug` | Filter cleared | — |
| `debug` | Sort order changed | `new_sort_order`, `previous_sort_order` |
| `debug` | Visibility filter changed | `new_visibility`, `previous_visibility` |
| `debug` | Scroll position updated | `scroll_percent`, `focused_index`, `total_loaded` |
| `debug` | Pagination trigger reached | `scroll_percent`, `items_loaded`, `has_more` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` environment variable (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout on initial fetch | Data hook timeout (30s) | Loading spinner replaced with error message + "Press R to retry" |
| Network timeout on pagination | Data hook timeout (30s) | "Loading more…" replaced with inline error. Existing items remain visible and navigable. `R` retries |
| Auth token expired (401) | API returns 401 | Propagated to app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate." |
| Rate limited (429) | API returns 429 with Retry-After header | Inline error: "Rate limited. Retry in Ns." User presses `R` after waiting |
| Server error (500+) | API returns 5xx | Inline error with generic message: "Server error. Press R to retry." |
| Terminal resize during initial load | `useOnResize` fires during fetch | Fetch continues uninterrupted. Renders at new size when data arrives |
| Terminal resize while scrolled | `useOnResize` fires | Column widths recalculate. Focused row stays visible. Scroll position adjusted |
| SSE disconnect | Status bar shows disconnected indicator | Org list unaffected (uses REST, not SSE) |
| Empty response with non-zero total_count | `items.length === 0 && totalCount > 0` | Treated as end-of-pagination. No further fetches |
| Malformed API response | JSON parse error | Error state rendered with generic error message |
| React error boundary triggered | Unhandled exception in component tree | App-shell error boundary renders error screen with restart/quit options |
| Sort change during active pagination | User presses `o` during "Loading more…" | Current fetch completes; loaded items re-sorted locally |
| Concurrent Enter + initial load | `Enter` pressed before data arrives | Keypress queued; processed after data renders, or no-op on error |

### Failure Modes

- **Total fetch failure**: Error state shown in content area. Header bar and status bar remain stable. User can press `R` to retry or `q` to go back
- **Partial pagination failure**: Existing loaded items remain visible and navigable. Only the "Loading more…" area shows the error. `R` retries the failed page
- **Memory pressure**: 500-item pagination cap prevents unbounded memory growth
- **Sort parameter mismatch**: All sorting is client-side for this screen, so no API sort mismatch is possible. Deduplication by `org.id` prevents visual duplicates from overlapping pages

## Verification

### Test File: `e2e/tui/organizations.test.ts`

### Terminal Snapshot Tests (24 tests)

- **org-list-screen-initial-load**: Navigate to org list screen (`g o`) at 120×40 → snapshot matches golden file showing "Organizations (N)" header, filter toolbar with sort/visibility labels, column headers, list rows with org names, visibility badges, descriptions, and locations. First row highlighted with primary color
- **org-list-screen-empty-state**: Navigate to org list for user with zero org memberships → snapshot shows centered "No organizations yet. Create one with `codeplane org create`." in muted color
- **org-list-screen-loading-state**: Navigate to org list with slow API response → snapshot shows "Loading organizations…" centered in content area with toolbar already visible
- **org-list-screen-error-state**: Navigate to org list with failing API → snapshot shows error message in red with "Press R to retry" below
- **org-list-screen-focused-row**: Navigate to org list → first org row highlighted with primary accent color, remaining rows in default colors
- **org-list-screen-visibility-badges**: Navigate to org list with orgs of varying visibility → public orgs show green "public", limited orgs show yellow "limited", private orgs show red "private"
- **org-list-screen-filter-active**: Press `/` → search input in toolbar gains focus, cursor visible in input
- **org-list-screen-filter-results**: Press `/`, type "acme" → list shows only orgs matching "acme" in name or description
- **org-list-screen-filter-no-results**: Press `/`, type "zzzznonexistent" → "No organizations match the current filters." with "Press Esc to clear filters." hint shown
- **org-list-screen-pagination-loading**: Scroll to bottom of list → "Loading more…" visible at bottom of scrollbox
- **org-list-screen-header-total-count**: Navigate to org list → header shows "Organizations (N)" with correct total count
- **org-list-screen-sort-label**: At 120×40, default view → toolbar shows "Sort: Created (oldest)"
- **org-list-screen-sort-cycle**: Press `o` → toolbar updates to "Sort: Created (newest)"; press `o` again → "Sort: Name A–Z"
- **org-list-screen-visibility-label**: Press `v` → toolbar updates to "Showing: Public only"
- **org-list-screen-visibility-cycle-limited**: Press `v` twice → toolbar updates to "Showing: Limited only"
- **org-list-screen-visibility-cycle-private**: Press `v` three times → toolbar updates to "Showing: Private only"
- **org-list-screen-column-headers**: At 120×40 → column header row visible with "Name", "Vis.", "Description", "Location"
- **org-list-screen-pagination-cap**: User with 600 org memberships, scroll to load all → "Showing first 500 of 600" visible at bottom
- **org-list-screen-breadcrumb**: Navigate via `g o` → header bar breadcrumb reads "Dashboard > Organizations"
- **org-list-screen-description-shown-standard**: At 120×40 → description column visible for orgs with descriptions
- **org-list-screen-location-shown-standard**: At 120×40 → location column visible for orgs with location set
- **org-list-screen-website-shown-large**: At 200×60 → website column visible for orgs with website set
- **org-list-screen-empty-description-no-gap**: Org with empty description at 120×40 → description column blank, no visual gap
- **org-list-screen-selected-row**: Press `Space` on a row → "✓" prefix appears on that row

### Keyboard Interaction Tests (38 tests)

- **org-list-j-moves-down**: Press `j` → focus moves from first to second org row
- **org-list-k-moves-up**: Press `j` then `k` → focus returns to first org row
- **org-list-k-at-top-no-wrap**: Press `k` on first row → focus stays on first row (no wrap-around)
- **org-list-j-at-bottom-no-wrap**: Navigate to last loaded row, press `j` → focus stays (triggers pagination if more pages exist)
- **org-list-down-arrow-moves-down**: Press Down arrow → same behavior as `j`
- **org-list-up-arrow-moves-up**: Press Up arrow → same behavior as `k`
- **org-list-enter-opens-org**: Press Enter on focused row → org overview screen pushed, breadcrumb updates to "Dashboard > Organizations > org-name"
- **org-list-enter-on-second-item**: Press `j` then Enter → second org's overview screen pushed
- **org-list-slash-focuses-search**: Press `/` → search input in toolbar gains focus
- **org-list-filter-narrows-list**: Press `/`, type "acme" → only matching orgs shown in list
- **org-list-filter-case-insensitive**: Press `/`, type "ACME" → matches orgs with "acme" in name (case-insensitive)
- **org-list-filter-matches-description**: Press `/`, type "engineering" → matches orgs with "engineering" in description
- **org-list-esc-clears-filter**: Press `/`, type "test", press Esc → filter cleared, full list restored, focus returns to list
- **org-list-esc-pops-when-no-filter**: Without any active filter, press Esc → screen pops, returns to previous screen
- **org-list-G-jumps-to-bottom**: Press `G` → focus moves to last loaded row
- **org-list-gg-jumps-to-top**: Press `G` then `g g` → focus returns to first row
- **org-list-ctrl-d-page-down**: Press `Ctrl+D` → focus moves down by half the visible list height
- **org-list-ctrl-u-page-up**: Press `Ctrl+D` then `Ctrl+U` → focus returns to original position
- **org-list-R-retries-on-error**: API fails, error state shown, press `R` → fetch retried
- **org-list-R-no-op-when-loaded**: Data loaded successfully, press `R` → no effect
- **org-list-o-cycles-sort**: Press `o` → sort changes to "Created (newest)", list re-sorted. Press `o` again → "Name A–Z"
- **org-list-o-cycles-sort-full**: Press `o` four times → sort cycles through all four options and returns to "Created (oldest)"
- **org-list-v-cycles-visibility**: Press `v` → visibility changes to "Public only", non-public orgs hidden. Press `v` → "Limited only"
- **org-list-v-cycles-visibility-full**: Press `v` four times → visibility cycles through all four options and returns to "All"
- **org-list-c-opens-create-form**: Press `c` → create organization form screen pushed
- **org-list-space-selects-row**: Press `Space` → focused row shows "✓" prefix. Press `Space` again → "✓" removed
- **org-list-q-pops-screen**: Press `q` → returns to previous screen
- **org-list-j-in-search-input**: Press `/` then `j` → 'j' typed in search input, NOT list navigation
- **org-list-o-in-search-input**: Press `/` then `o` → 'o' typed in search input, NOT sort cycle
- **org-list-v-in-search-input**: Press `/` then `v` → 'v' typed in search input, NOT visibility cycle
- **org-list-q-in-search-input**: Press `/` then `q` → 'q' typed in search input, NOT screen pop
- **org-list-c-in-search-input**: Press `/` then `c` → 'c' typed in search input, NOT create form
- **org-list-pagination-on-scroll**: Scroll to 80% of loaded content → next page fetch triggered
- **org-list-rapid-j-presses**: Send `j` 15 times in rapid succession → focus moves 15 rows sequentially, no dropped keypresses
- **org-list-enter-during-loading**: Press Enter during initial loading state → no-op (no crash, no navigation)
- **org-list-sort-then-filter**: Press `o` to sort by name, then `/` to filter → filtered results sorted alphabetically
- **org-list-filter-then-sort**: Press `/` type "acme", Esc, then `o` → matching orgs re-sorted by new order
- **org-list-visibility-then-filter**: Press `v` to show public only, then `/` to filter → filter applied within public orgs

### Responsive Tests (18 tests)

- **org-list-80x24-layout**: Terminal 80×24 → only name + visibility badge columns visible. No description, location, or website. Toolbar shows search input only
- **org-list-80x24-truncation**: Terminal 80×24, org with long name (40+ chars) → name truncated with `…` at 50 chars (but max API name is 39 chars so no truncation expected for valid names)
- **org-list-80x24-no-column-headers**: Terminal 80×24 → column header row hidden
- **org-list-80x24-toolbar-collapsed**: Terminal 80×24 → sort and visibility labels hidden from toolbar
- **org-list-120x40-layout**: Terminal 120×40 → name, visibility badge, description, and location columns visible. Full toolbar with sort and visibility labels
- **org-list-120x40-description-truncation**: Terminal 120×40, long description (80+ chars) → truncated with `…` at 40 chars
- **org-list-120x40-location-truncation**: Terminal 120×40, long location (30+ chars) → truncated with `…` at 20 chars
- **org-list-120x40-column-headers**: Terminal 120×40 → column header row visible with "Name", "Vis.", "Description", "Location"
- **org-list-200x60-layout**: Terminal 200×60 → all columns visible including website
- **org-list-200x60-full-toolbar**: Terminal 200×60 → toolbar shows search, sort, and visibility labels
- **org-list-200x60-website-column**: Terminal 200×60, org with website set → website column shows truncated URL
- **org-list-resize-standard-to-min**: Resize from 120×40 → 80×24 → description and location columns collapse immediately
- **org-list-resize-min-to-standard**: Resize from 80×24 → 120×40 → description and location columns appear
- **org-list-resize-standard-to-large**: Resize from 120×40 → 200×60 → website column appears
- **org-list-resize-preserves-focus**: Resize at any breakpoint → focused row remains focused and visible
- **org-list-resize-during-filter**: Resize with filter active → filter text preserved, results re-rendered at new column layout
- **org-list-resize-during-loading**: Resize while initial load spinner is showing → spinner re-centers, no crash
- **org-list-search-input-80x24**: Terminal 80×24, press `/` → search input renders at full toolbar width

### Integration Tests (17 tests)

- **org-list-auth-expiry**: 401 on initial fetch → app-shell auth error screen rendered, not inline error
- **org-list-rate-limit-429**: 429 with `Retry-After: 30` → inline error shows "Rate limited. Retry in 30s."
- **org-list-network-error**: Network timeout on initial fetch → inline error with "Press R to retry"
- **org-list-pagination-complete**: 45 orgs total (page size 30) → both pages load, all 45 visible in list
- **org-list-500-items-cap**: 600 orgs → only 500 loaded, "Showing first 500 of 600" footer visible
- **org-list-enter-then-q-returns**: Enter on org, then `q` → org list restored with same scroll position and focus
- **org-list-goto-from-org-and-back**: Open org from list, then `g o` → org list screen rendered fresh (no stale state)
- **org-list-server-error-500**: 500 on fetch → inline error with "Press R to retry"
- **org-list-deep-link-entry**: Launch `codeplane tui --screen orgs` → org list screen rendered, breadcrumb shows "Dashboard > Organizations"
- **org-list-command-palette-entry**: Press `:`, type "orgs", press Enter → org list screen rendered
- **org-list-concurrent-navigation**: Rapidly press `g o`, `g d`, `g o` → final state is org list screen with no intermediate screen artifacts
- **org-list-create-and-return**: Press `c`, complete form, return → org list refreshes with newly created org
- **org-list-private-org-visible**: User who is a member of a private org → private org appears with red "private" badge
- **org-list-limited-org-visible**: User who is a member of a limited org → limited org appears with yellow "limited" badge
- **org-list-unicode-description**: Org with Unicode description (emoji, CJK) → renders correctly, truncation respects grapheme clusters
- **org-list-unicode-location**: Org with Unicode location (e.g., "東京, 日本") → renders correctly, no mojibake
- **org-list-empty-fields**: Org with empty description, website, and location → columns render blank, no placeholder text

All 97 tests left failing if backend is unimplemented — never skipped or commented out.
