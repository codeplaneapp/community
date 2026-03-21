# TUI_LANDING_CHECKS_VIEW

Specification for TUI_LANDING_CHECKS_VIEW.

## High-Level User POV

The Landing Checks View is a dedicated tab within the landing detail screen that displays all CI/CD check statuses associated with a landing request's changes. It is the terminal user's primary surface for understanding whether a landing request's changes have passed required status checks — build, test, lint, security scans, and any other automated validations configured for the repository — without leaving the keyboard-driven TUI.

The Checks tab is accessed from the landing detail view by pressing `6` or cycling with `Tab`/`Shift+Tab` to reach it. The tab bar in the landing detail screen extends to six tabs: **Overview** (1), **Changes** (2), **Reviews** (3), **Comments** (4), **Diff** (5), and **Checks** (6). When the Checks tab is active, the tab label `6:Checks` appears with reverse-video + underline styling, consistent with the other landing detail tabs.

The Checks tab presents an aggregated view of commit statuses across all changes in the landing request's change stack. At the top of the tab content is a summary bar showing the overall check health: a combined status indicator that reflects the worst-case status across all checks. The summary reads, for example, "✓ All 5 checks passed" in green, "⏳ 3 of 5 checks pending" in yellow, "✗ 1 of 5 checks failed" in red, or "⚠ 1 of 5 checks errored" in red. If the landing's target bookmark has required status checks configured (via protected bookmark settings), the summary also shows "N required checks" and whether all required contexts are satisfied.

Below the summary is a scrollable list of individual check statuses. Each check row occupies a single line and shows: a status icon (✓ green for success, ✗ red for failure, ⚠ red for error, ⏳ yellow for pending), the context string (e.g., "ci/build", "ci/test", "security/scan"), a description (truncated to available width), the associated change ID (first 12 characters, in muted color), and a relative timestamp. If a check has a `target_url`, the URL is displayed in muted color below the description when the check row is focused.

The checks are grouped by change in the stack. Each change group is headed by its change ID (first 12 characters) and position in the stack (e.g., "Change 1 · kpqrstuvwxyz"). Within each group, checks are sorted alphabetically by context. If a change has no checks, the group shows "No checks for this change" in muted text.

Navigation within the Checks tab uses vim-style `j`/`k` to move between check rows, `n`/`p` to jump between change groups, `Enter` on a focused check to view its full detail (context, description, target URL, change ID, timestamps) in an inline expanded section, and `G`/`g g` to jump to bottom/top.

Checks data loads lazily — only when the Checks tab is first activated, not on landing detail mount. The data is fetched by iterating over each change ID in the landing's change stack and querying `GET /api/repos/:owner/:repo/commits/:changeId/statuses` for each. Results are aggregated client-side.

If the repository has `require_status_checks` enabled on the target bookmark's protected bookmark settings, the Checks tab highlights required check contexts with a `[required]` badge next to the context name. Missing required checks (contexts that have no corresponding status) are shown as explicit "missing" rows with a `○` hollow circle icon in warning color, making it immediately clear which required checks have not yet reported.

The Checks tab supports manual refresh with `R` to re-fetch all check statuses. A "Last refreshed: Xs ago" indicator in the summary bar shows when the data was last fetched.

At minimum 80×24 terminal size, the Checks tab shows only the status icon, context, and status text (truncated). At 120×40, the full layout renders with description, change ID, and timestamp columns. At 200×60+, target URLs are shown inline for all rows.

## Acceptance Criteria

### Definition of Done
- [ ] The Checks tab renders as the 6th tab in the landing detail view's tab bar
- [ ] The tab label is `6:Checks` and follows the same styling as tabs 1–5 (reverse-video + underline when active, muted when inactive)
- [ ] Pressing `6` from the landing detail view switches to the Checks tab
- [ ] `Tab`/`Shift+Tab` includes the Checks tab in the cycle (wrapping from 6→1 and 1→6)
- [ ] `h`/`l` tab navigation includes the Checks tab
- [ ] Check data loads lazily on first Checks tab activation, not on landing detail mount
- [ ] Checks are fetched via `GET /api/repos/:owner/:repo/commits/:changeId/statuses` for each change ID in the landing's change stack
- [ ] All change-level status fetches fire concurrently (not sequentially)
- [ ] A summary bar at the top aggregates statuses across all changes
- [ ] The summary bar shows an overall combined status icon and text reflecting the worst-case: pending > error > failure > success (in priority order)
- [ ] The summary bar shows the total check count and broken-down counts per status
- [ ] If the target bookmark has required status checks configured, the summary shows required check status
- [ ] Individual check rows are grouped by change, with change group headers
- [ ] Within each change group, checks are sorted alphabetically by context
- [ ] Each check row shows: status icon, context, description (truncated), change ID, and timestamp
- [ ] Focused check row shows target_url below the description (if present)
- [ ] Required check contexts show a `[required]` badge
- [ ] Missing required checks show a `○` hollow circle row with "missing" text in warning color
- [ ] A "Last refreshed" indicator appears in the summary bar
- [ ] `R` triggers a full re-fetch of all check statuses
- [ ] The status bar shows `j/k:navigate n/p:group Enter:detail R:refresh q:back` when the Checks tab is active
- [ ] The Checks tab preserves scroll position when switching away and back (per-tab scroll state)

### Keyboard Interactions
- [ ] `j` / `Down`: Move focus to the next check row (skips group headers)
- [ ] `k` / `Up`: Move focus to the previous check row (skips group headers)
- [ ] `Enter`: Expand/collapse inline detail for the focused check (toggle)
- [ ] `n`: Jump to the first check of the next change group
- [ ] `p`: Jump to the first check of the previous change group
- [ ] `G`: Jump to the last check row
- [ ] `g g`: Jump to the first check row
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up within the checks list
- [ ] `R`: Refresh all check statuses (re-fetch from API)
- [ ] `Tab` / `Shift+Tab`: Cycle to next/previous tab
- [ ] `1`–`6`: Jump to tab by number
- [ ] `h` / `l`: Adjacent tab navigation
- [ ] `q`: Pop screen (back to landing list)
- [ ] `Esc`: Close expanded detail if open; otherwise pop screen
- [ ] `?`: Show help overlay
- [ ] `:`: Open command palette

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by the router
- [ ] 80×24 – 119×39 (minimum): Status icon (2ch), context (remaining, truncated), status text (7ch). Group headers show change ID only. Description, change ID column, and timestamp hidden. Target URL never shown inline. Summary bar on a single line, abbreviated
- [ ] 120×40 – 199×59 (standard): Status icon (2ch), context (25ch), description (remaining, truncated), change ID (14ch), timestamp (6ch). Full summary bar. Group headers show position + change ID. Target URL shown on focus
- [ ] 200×60+ (large): Status icon (2ch), context (30ch), description (40ch), target URL (30ch), change ID (14ch), timestamp (10ch). All columns visible. Target URL shown inline for all rows

### Truncation & Boundary Constraints
- [ ] Context string: max 25ch (standard) / 30ch (large); truncated with `…`
- [ ] Description: max remaining width (standard) / 40ch (large); truncated with `…`
- [ ] Target URL: max 30ch (large); truncated with `…`; full URL shown in expanded detail
- [ ] Change ID: always 12 characters (first 12 of the stable change ID)
- [ ] Timestamps: max 6ch (standard: "3m", "1h", "2d", "1w") / 10ch (large: "3 min ago")
- [ ] Summary text: truncated at terminal width minus 4ch with `…`
- [ ] Maximum 100 checks per change (API pagination; cap at first page for display)
- [ ] Maximum 500 total check rows across all changes (memory cap)
- [ ] Group header text: "Change N · <changeId12>" max 30ch; truncated with `…` for long position numbers
- [ ] `[required]` badge: always 10ch, rendered in warning color (ANSI 178)
- [ ] Missing check context: "○ <context> — missing" with context truncated to column width

### Edge Cases
- [ ] Landing with zero changes: Checks tab shows "No changes in this landing request" in muted text
- [ ] Change with zero checks: Group header renders, body shows "No checks for this change" in muted text
- [ ] All checks passing: Summary bar in green with ✓
- [ ] Mix of statuses across changes: Summary reflects worst-case per priority
- [ ] All checks pending: Summary bar in yellow with ⏳
- [ ] Required checks with no reported statuses at all: All shown as missing
- [ ] Target bookmark has no protected bookmark settings: `[required]` badges and missing rows not shown
- [ ] API returns 501 Not Implemented (current state): Error banner with "Checks API not yet available. Press R to retry."
- [ ] Network error during one change's fetch while others succeed: Partial results shown, error banner for failed change
- [ ] Rapid `j`/`k`: Sequential, one row per keypress, no debounce
- [ ] Rapid `R` presses: Debounced to one refresh per 2 seconds
- [ ] Terminal resize while Checks tab is active: Layout recalculates, focus and scroll preserved
- [ ] Terminal resize while detail is expanded: Detail section re-wraps; expanded state preserved
- [ ] Very long context string (100+ chars): Truncated to column width
- [ ] Unicode in context or description: Truncation respects grapheme clusters
- [ ] Null description field: Renders empty (no "null" text)
- [ ] Null target_url: No URL line shown in expanded detail; "No URL" in muted text
- [ ] 50+ changes in stack: All groups render, virtualized scrolling for performance
- [ ] Protected bookmark fetch fails: `[required]` badges omitted gracefully; no error shown
- [ ] SSE disconnect: No impact (Checks tab does not use SSE)
- [ ] Auth token expiry during refresh: 401 → auth error screen
- [ ] Concurrent landing detail data refresh and checks refresh: Independent fetches; no race condition

## Design

### Layout Structure

At standard terminal size (120×40), the Checks tab content renders below the shared landing header and tab bar:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Add stacked auth token refresh and retry logic                                                             [open]   │
│ @alice · opened 2h ago · → main · ✓ clean · 3 changes                                                              │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  1:Overview    2:Changes    3:Reviews    4:Comments    5:Diff    6:Checks                                            │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ✓ All 8 checks passed · 3 required satisfied · Last refreshed: 12s ago                                              │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ── Change 1 · kpqrstuvwxyz ──────────────────────────────────────────────────────────────────────────────────────── │
│  ✓  ci/build              Build succeeded             kpqrstuvwxyz   3m                                             │
│  ✓  ci/lint               Lint passed                 kpqrstuvwxyz   3m                                             │
│  ✓  ci/test               All 142 tests passed        kpqrstuvwxyz   4m                                             │
│  ✓  security/scan  [req]  No vulnerabilities found    kpqrstuvwxyz   5m                                             │
│                                                                                                                      │
│ ── Change 2 · abcdef012345 ──────────────────────────────────────────────────────────────────────────────────────── │
│  ✓  ci/build              Build succeeded             abcdef012345   2m                                             │
│  ✓  ci/test               All 142 tests passed        abcdef012345   3m                                             │
│  ✓  security/scan  [req]  No vulnerabilities found    abcdef012345   4m                                             │
│                                                                                                                      │
│ ── Change 3 · mnopqr678901 ──────────────────────────────────────────────────────────────────────────────────────── │
│  ⏳  ci/build              Pending                     mnopqr678901   1m                                             │
│                                                                                                                      │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ j/k:navigate  n/p:group  Enter:detail  R:refresh  6:checks  q:back                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

With a failing required check and expanded detail view:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ✗ 1 of 5 checks failed · 1 required failing · Last refreshed: 5s ago                                                │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ── Change 1 · kpqrstuvwxyz ──────────────────────────────────────────────────────────────────────────────────────── │
│  ✓  ci/build              Build succeeded             kpqrstuvwxyz   3m                                             │
│  ✗  ci/test        [req]  2 tests failed              kpqrstuvwxyz   4m                                             │
│     ┌─ Detail ─────────────────────────────────────────────────────────────────┐                                     │
│     │ Context:     ci/test                                                     │                                     │
│     │ Status:      failure                                                     │                                     │
│     │ Description: 2 tests failed: auth.test.ts, retry.test.ts                 │                                     │
│     │ URL:         https://ci.example.com/runs/12345                           │                                     │
│     │ Change:      kpqrstuvwxyz                                                │                                     │
│     │ Created:     2025-03-21 14:32:10                                         │                                     │
│     │ Updated:     2025-03-21 14:35:42                                         │                                     │
│     └──────────────────────────────────────────────────────────────────────────┘                                     │
│  ✓  ci/lint               Lint passed                 kpqrstuvwxyz   3m                                             │
│  ○  security/scan  [req]  — missing                                                                                 │
│                                                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

At minimum size (80×24):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Add stacked auth token refresh…                                    [open]   │
│ @alice · 2h ago · → main                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│  1:Ovrvw  2:Chng  3:Rvw  4:Cmnt  5:Diff  6:Chck                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ ✗ 1/5 failed · 1 req failing · 5s ago                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ ── kpqrstuvwxyz ─────────────────────────────────────────────────────────── │
│  ✓  ci/build                                                  success       │
│  ✗  ci/test [req]                                             failure       │
│  ✓  ci/lint                                                   success       │
│  ○  security/scan [req]                                       missing       │
│ ── abcdef012345 ─────────────────────────────────────────────────────────── │
│  ✓  ci/build                                                  success       │
├──────────────────────────────────────────────────────────────────────────────┤
│ j/k:nav n/p:grp Enter:dtl R:refresh q:back                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Components Used

- `<box>` — Vertical/horizontal flexbox containers for layout, summary bar, group headers, check rows, and detail panel
- `<scrollbox>` — Scrollable checks list with change groups and individual check rows
- `<text>` — Status icons, context strings, descriptions, change IDs, timestamps, badges, URLs, summary text

### Summary Bar

A `<box>` rendered above the scrollable check list. Contains:
- Combined status icon (✓/✗/⚠/⏳) with semantic color
- Summary text: "All N checks passed" / "X of N checks pending" / "X of N checks failed" / "X of N checks errored"
- Required checks summary (if applicable): "N required satisfied" (green) or "N required failing" (red) or "N required missing" (yellow)
- "Last refreshed: Xs ago" right-aligned in muted color (ANSI 245)

Combined status priority (highest wins): pending > error > failure > success.

Summary bar color mapping:
- All success: green (ANSI 34)
- Any pending (no failures/errors): yellow (ANSI 178)
- Any failure or error: red (ANSI 196)

### Change Group Header

A `<text>` row spanning full width with box-drawing separator: `── Change N · <changeId12> ──…`. Rendered in muted color (ANSI 245) with the change position in bold. Not focusable — `j`/`k` skips these rows.

### Check Row

A single-line `<box flexDirection="row">` containing:

| Element | Width | Color | Notes |
|---------|-------|-------|-------|
| Status icon | 2ch | Semantic | ✓ green, ✗ red, ⚠ red, ⏳ yellow, ○ yellow |
| Context | 25ch (std) | Default | Truncated with `…` |
| `[req]` badge | 6ch | Warning (ANSI 178) | Only for required contexts |
| Description | flex | Muted (ANSI 245) | Truncated with `…` |
| Change ID | 14ch | Muted (ANSI 245) | First 12 chars |
| Timestamp | 6ch | Muted (ANSI 245) | Relative format |

Focused check row uses reverse-video with primary color (ANSI 33), consistent with other landing detail tabs.

Status icon color mapping:
- Success: ✓ green (ANSI 34)
- Failure: ✗ red (ANSI 196)
- Error: ⚠ red (ANSI 196)
- Pending: ⏳ yellow (ANSI 178)
- Missing: ○ yellow (ANSI 178)

### Expanded Detail Panel

When `Enter` is pressed on a focused check, an inline detail panel expands below the check row. The panel is a bordered `<box>` with single-line border in muted color. Shows Context, Status (colored), Description (full, wrapped), URL (full), Change ID, Created (absolute), Updated (absolute). Only one detail panel can be open at a time; opening a new one closes the previous. `Esc` closes the detail panel without moving focus.

### Missing Required Check Row

When a required check context has no corresponding status for a given change: `○  security/scan  [req]  — missing`. Focusable like a normal check row. `Enter` shows "This required check has not reported a status for this change."

### Keybindings

| Key | Context | Action |
|-----|---------|--------|
| `j` / `Down` | Checks tab | Move to next check row |
| `k` / `Up` | Checks tab | Move to previous check row |
| `Enter` | Check focused | Toggle expanded detail panel |
| `n` | Checks tab | Jump to first check of next change group |
| `p` | Checks tab | Jump to first check of previous change group |
| `G` | Checks tab | Jump to last check row |
| `g g` | Checks tab | Jump to first check row |
| `Ctrl+D` / `Ctrl+U` | Checks tab | Page down / page up |
| `R` | Checks tab | Refresh all check statuses |
| `Tab` / `Shift+Tab` | Any tab | Cycle tabs (1–6) |
| `1`–`6` | Any tab | Jump to tab by number |
| `h` / `l` | Any tab | Adjacent tab navigation |
| `Esc` | Detail open | Close detail panel |
| `Esc` | No overlay | Pop screen |
| `q` | Checks tab | Pop back to landing list |
| `?` | Any | Help overlay |
| `:` | Any | Command palette |

### Responsive Sizing

| Breakpoint | Summary Bar | Check Row Columns | Group Headers | Detail Panel |
|------------|-------------|-------------------|---------------|--------------|
| 80×24 | Single line, abbreviated counts | Icon + context + status text | Change ID only | 90% width |
| 120×40 | Full text + required + timestamp | Icon + context + `[req]` + description + change ID + time | Position + change ID | 70% width |
| 200×60+ | Full text + required + timestamp + counts per status | Icon + context + `[req]` + description + URL + change ID + time | Position + change ID + per-group summary | 60% width |

Resize triggers synchronous re-layout. Scroll position and focus preserved. Expanded detail panel re-wraps text on resize.

### Data Hooks

- `useLanding(owner, repo, number)` — Landing request data (change stack, target bookmark) from parent landing detail screen (shared, not re-fetched)
- `useLandingChanges(owner, repo, number)` — Change stack with change IDs (shared from parent)
- `useCommitStatuses(owner, repo, ref)` — `GET /api/repos/:owner/:repo/commits/:ref/statuses` — fetched per change ID
- `useProtectedBookmark(owner, repo, bookmark)` — Protected bookmark settings to determine required checks — `GET /api/repos/:owner/:repo/protected-bookmarks/:bookmark`
- `useTerminalDimensions()` — Current terminal size for responsive layout
- `useOnResize(callback)` — Trigger re-layout on resize
- `useKeyboard(handler)` — Navigation and action key registration

### Pagination

Check statuses for each change ID use cursor-based pagination (`next_cursor` from API response). Default page size is 50. Memory cap: 100 checks per change, 500 total across all changes. The scrollbox does not trigger auto-pagination — all checks load on first activation (or refresh). If the cap is reached, a footer message shows "Showing first 100 checks for this change."

### Navigation

Tab activation (`6`, `Tab`, `h`/`l`) triggers lazy data load on first visit. Subsequent tab switches show cached data instantly. `R` invalidates cache and re-fetches. `q` pops the landing detail screen. `Enter` toggles inline detail (does not push a new screen).

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View checks (public repo) | ✅ | ✅ | ✅ | ✅ |
| View checks (private repo) | ❌ | ✅ | ✅ | ✅ |
| Refresh checks | ✅ (public) | ✅ | ✅ | ✅ |
| View required check config | ❌ | ✅ | ✅ | ✅ |

- The Checks tab inherits access from the landing detail view — if the user can view the landing, they can view its checks
- Check statuses are read-only in the TUI; creating/updating checks is done via API by CI systems
- Protected bookmark settings (required checks) require repository read access
- No write operations exposed in the Checks tab UI

### Token-based Auth

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen
- Check target URLs displayed as-is (may contain external CI URLs) — not clickable in terminal

### Rate Limiting

- `GET /api/repos/:owner/:repo/commits/:ref/statuses` subject to 300 req/min rate limit
- Since checks are fetched per-change, a landing with N changes makes N API calls on load/refresh
- Rate limit is checked per-user across all concurrent requests
- 429 responses show inline "Rate limited. Retry in {Retry-After}s."
- Refresh debounce (2s) prevents accidental rate limit exhaustion
- No auto-retry; user presses `R` after waiting
- For landings with 10+ changes, requests are batched in groups of 5 with 100ms delay between batches to avoid rate limit spikes

### Input Sanitization

- All data in the Checks tab is read-only API response data rendered as plain `<text>`
- Context strings, descriptions, and URLs are treated as plain text (no injection vector in terminal)
- Target URLs are displayed but never executed — no URL opening from TUI
- Change IDs are server-provided values; no user input reaches the API from this tab

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.landing.checks.viewed` | Checks tab activated (first time per landing) | `repo`, `landing_number`, `total_changes`, `total_checks`, `checks_by_status`, `has_required_checks`, `required_checks_satisfied`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms` |
| `tui.landing.checks.refreshed` | R pressed, data re-fetched | `repo`, `landing_number`, `total_checks`, `checks_changed_count`, `load_time_ms`, `time_since_last_refresh_ms` |
| `tui.landing.checks.detail_expanded` | Enter on check row | `repo`, `landing_number`, `check_context`, `check_status`, `has_target_url`, `change_position`, `position_in_list` |
| `tui.landing.checks.group_navigated` | n/p group jump | `repo`, `landing_number`, `from_change_position`, `to_change_position`, `direction` |
| `tui.landing.checks.error` | API failure during check fetch | `repo`, `landing_number`, `error_type`, `http_status`, `change_id`, `request_type` |
| `tui.landing.checks.partial_load` | Some changes loaded, some failed | `repo`, `landing_number`, `loaded_changes`, `failed_changes`, `total_changes` |
| `tui.landing.checks.empty` | No checks exist for any change | `repo`, `landing_number`, `total_changes` |
| `tui.landing.checks.all_passing` | All checks are in success state | `repo`, `landing_number`, `total_checks`, `required_checks_count` |
| `tui.landing.checks.blocking` | Required checks failing or missing | `repo`, `landing_number`, `blocking_count`, `missing_count`, `failing_count` |

### Common Properties (all events)

- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Checks tab activation rate | >20% of landing detail views |
| Data load completion | >95% (accounting for 501 during early implementation) |
| Refresh usage | >15% of checks views |
| Detail expansion rate | >30% of checks views |
| Group navigation (n/p) usage | >10% of checks views |
| Error rate | <5% (excluding expected 501s) |
| Load time (all checks) | <3s for landings with ≤10 changes |
| Time to interactive | <2s |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Tab activated | `Landing.Checks: activated [repo={r}] [landing={n}] [changes={c}]` |
| `debug` | Fetch started per change | `Landing.Checks: fetch start [repo={r}] [changeId={id}]` |
| `debug` | Fetch completed per change | `Landing.Checks: fetch done [repo={r}] [changeId={id}] [count={n}] [duration={ms}ms]` |
| `info` | All checks loaded | `Landing.Checks: loaded [repo={r}] [landing={n}] [total_checks={n}] [total_ms={ms}]` |
| `info` | Refresh triggered | `Landing.Checks: refresh [repo={r}] [landing={n}]` |
| `info` | Check detail expanded | `Landing.Checks: detail expanded [repo={r}] [context={ctx}] [status={s}]` |
| `warn` | Fetch failed for change | `Landing.Checks: fetch failed [repo={r}] [changeId={id}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `Landing.Checks: rate limited [repo={r}] [retry_after={s}]` |
| `warn` | Partial load (some changes failed) | `Landing.Checks: partial load [repo={r}] [loaded={n}] [failed={n}]` |
| `warn` | API returns 501 | `Landing.Checks: not implemented [repo={r}] [changeId={id}]` |
| `warn` | Slow load (>5s) | `Landing.Checks: slow load [repo={r}] [duration={ms}ms] [changes={n}]` |
| `warn` | Memory cap reached | `Landing.Checks: cap reached [repo={r}] [total={n}] [cap=500]` |
| `error` | Auth error | `Landing.Checks: auth error [repo={r}] [status=401]` |
| `error` | Render error | `Landing.Checks: render error [repo={r}] [error={msg}]` |
| `error` | Protected bookmark fetch failed | `Landing.Checks: protected bookmark error [repo={r}] [bookmark={b}] [status={code}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| API returns 501 Not Implemented | Error banner: "Checks API not yet available" | Press `R` to retry; feature becomes available when server implements endpoint |
| Network error during change fetch | Partial results shown; error banner for failed changes | Press `R` to retry all failed changes |
| All change fetches fail | Full error state: "Failed to load checks" in red | Press `R` to retry |
| 401 Unauthorized | Auth error screen propagated from API client | Re-auth via `codeplane auth login` |
| 429 Rate Limited | "Rate limited. Retry in {Retry-After}s." inline message | Wait and press `R` |
| Protected bookmark API fails | `[required]` badges silently omitted; checks still shown | No action needed; degraded gracefully |
| Resize during loading | Layout re-renders; fetches continue independently | Independent |
| Resize with detail expanded | Detail panel re-wraps text; border redraws | Synchronous |
| Tab switch during loading | Loading continues in background; results cached | Switch back to see results |
| SSE disconnect | No impact (Checks tab does not use SSE) | SSE provider handles reconnection independently |
| Landing with 50+ changes | Requests batched in groups of 5; slower total load time | Loading indicator shows progress "Loading checks (15/50 changes)…" |
| Concurrent refresh + tab switch | Refresh completes in background; cache updated | Data available when tab re-activated |
| No color support | Text icons replace Unicode: [OK]/[FAIL]/[ERR]/[PEND]/[MISS] | Theme detection at app level |

### Failure Modes

- Component crash → global error boundary → "Press r to restart"
- All API fails → error state with retry; tab navigation still works
- Partial API fails → partial data shown; error banner for failed portions
- Slow network → "Loading checks…" spinner; user can switch tabs while waiting
- Rate limit → inline message; R retries after cooldown
- 501 → expected during early implementation; error message explains feature availability

## Verification

### Test File: `e2e/tui/landings.test.ts`

### Terminal Snapshot Tests (24 tests)

- SNAP-CHECK-001: Checks tab at 120×40 with all checks passing — full layout, summary bar green, check rows with columns
- SNAP-CHECK-002: Checks tab at 80×24 minimum — abbreviated summary, icon+context+status only, no description/timestamp columns
- SNAP-CHECK-003: Checks tab at 200×60 large — all columns including inline URLs, full timestamps
- SNAP-CHECK-004: Summary bar with all checks passing — "✓ All N checks passed" in green
- SNAP-CHECK-005: Summary bar with pending checks — "⏳ X of N checks pending" in yellow
- SNAP-CHECK-006: Summary bar with failed checks — "✗ X of N checks failed" in red
- SNAP-CHECK-007: Summary bar with errored checks — "⚠ X of N checks errored" in red
- SNAP-CHECK-008: Summary bar with mixed statuses — worst-case status reflected
- SNAP-CHECK-009: Summary bar with required checks satisfied — "N required satisfied" in green
- SNAP-CHECK-010: Summary bar with required checks failing — "N required failing" in red
- SNAP-CHECK-011: Summary bar with required checks missing — "N required missing" in yellow
- SNAP-CHECK-012: Change group header rendering — "── Change 1 · kpqrstuvwxyz ──…"
- SNAP-CHECK-013: Check row with success status — ✓ icon in green
- SNAP-CHECK-014: Check row with failure status — ✗ icon in red
- SNAP-CHECK-015: Check row with error status — ⚠ icon in red
- SNAP-CHECK-016: Check row with pending status — ⏳ icon in yellow
- SNAP-CHECK-017: Missing required check row — ○ icon in yellow with "— missing"
- SNAP-CHECK-018: `[req]` badge rendering — warning color next to context
- SNAP-CHECK-019: Focused check row highlight — primary accent reverse-video
- SNAP-CHECK-020: Expanded detail panel — bordered box with all check fields
- SNAP-CHECK-021: Empty state (no changes) — "No changes in this landing request"
- SNAP-CHECK-022: Empty state (no checks for change) — "No checks for this change"
- SNAP-CHECK-023: Loading state — "Loading checks…" with spinner
- SNAP-CHECK-024: Error state — red error with "Press R to retry"

### Keyboard Interaction Tests (32 tests)

- KEY-CHECK-001: `6` switches to Checks tab from any other tab
- KEY-CHECK-002: `Tab` cycles through all 6 tabs including Checks
- KEY-CHECK-003: `Shift+Tab` cycles backward through all 6 tabs
- KEY-CHECK-004: `h`/`l` navigates to adjacent tabs including Checks
- KEY-CHECK-005: `j`/`Down` moves focus to next check row
- KEY-CHECK-006: `k`/`Up` moves focus to previous check row
- KEY-CHECK-007: `j`/`k` skips group headers (focuses only check rows)
- KEY-CHECK-008: `j` at last check row is no-op (does not wrap)
- KEY-CHECK-009: `k` at first check row is no-op (does not wrap)
- KEY-CHECK-010: `Enter` expands detail panel for focused check
- KEY-CHECK-011: `Enter` on already-expanded check collapses detail
- KEY-CHECK-012: `Enter` on a different check closes previous detail, opens new
- KEY-CHECK-013: `Enter` on missing required check shows informational detail
- KEY-CHECK-014: `Esc` with detail open closes detail panel
- KEY-CHECK-015: `Esc` without detail open pops screen
- KEY-CHECK-016: `n` jumps to first check of next change group
- KEY-CHECK-017: `p` jumps to first check of previous change group
- KEY-CHECK-018: `n` at last group is no-op
- KEY-CHECK-019: `p` at first group is no-op
- KEY-CHECK-020: `G` jumps to last check row
- KEY-CHECK-021: `g g` jumps to first check row
- KEY-CHECK-022: `Ctrl+D` pages down within checks list
- KEY-CHECK-023: `Ctrl+U` pages up within checks list
- KEY-CHECK-024: `R` triggers check data refresh
- KEY-CHECK-025: `R` during loading is debounced (no duplicate fetch)
- KEY-CHECK-026: Rapid `R` presses (3×) result in single refresh
- KEY-CHECK-027: `q` pops landing detail screen
- KEY-CHECK-028: `?` shows help overlay with Checks-specific bindings
- KEY-CHECK-029: `:` opens command palette from Checks tab
- KEY-CHECK-030: Rapid `j` presses (15×) navigate sequentially
- KEY-CHECK-031: `Enter` during loading state is no-op
- KEY-CHECK-032: Tab switch away and back preserves scroll position and focus

### Responsive Tests (12 tests)

- RESP-CHECK-001: 80×24 layout — icon+context+status only, abbreviated summary
- RESP-CHECK-002: 80×24 group headers — change ID only, no position
- RESP-CHECK-003: 80×24 expanded detail — 90% width panel
- RESP-CHECK-004: 120×40 layout — full columns visible (icon, context, req badge, description, change ID, time)
- RESP-CHECK-005: 120×40 expanded detail — 70% width panel
- RESP-CHECK-006: 200×60 layout — all columns including inline URLs
- RESP-CHECK-007: 200×60 expanded detail — 60% width panel
- RESP-CHECK-008: Resize from 120×40 to 80×24 — columns collapse, focus preserved
- RESP-CHECK-009: Resize from 80×24 to 200×60 — columns expand, focus preserved
- RESP-CHECK-010: Resize with detail panel open — panel re-wraps, border redraws
- RESP-CHECK-011: Resize during loading state — spinner repositions
- RESP-CHECK-012: Tab label abbreviation at 80×24 — "6:Chck" vs "6:Checks" at 120×40

### Integration Tests (18 tests)

- INT-CHECK-001: Lazy load — Checks tab data not fetched until tab activated
- INT-CHECK-002: Concurrent fetch — all change status requests fire in parallel (up to batch size)
- INT-CHECK-003: Batch throttling — landings with 10+ changes batch requests in groups of 5
- INT-CHECK-004: Refresh — R invalidates cache and re-fetches all statuses
- INT-CHECK-005: Refresh shows updated data — checks that changed status reflect new state
- INT-CHECK-006: Partial failure — some changes load, some fail; partial results shown with error
- INT-CHECK-007: All changes fail — full error state with retry
- INT-CHECK-008: 501 Not Implemented — shows "Checks API not yet available" message
- INT-CHECK-009: 401 Auth error — propagates to auth error screen
- INT-CHECK-010: 429 Rate limit — inline message with retry-after countdown
- INT-CHECK-011: Required checks — protected bookmark settings fetched and `[req]` badges shown
- INT-CHECK-012: Missing required checks — contexts without statuses shown as "missing" rows
- INT-CHECK-013: Protected bookmark fetch fails — `[req]` badges omitted gracefully
- INT-CHECK-014: Tab switch during loading — loading continues, results cached
- INT-CHECK-015: Memory cap — 500 total checks cap with footer message
- INT-CHECK-016: Navigation round-trip — Checks tab → other tab → Checks tab preserves state
- INT-CHECK-017: Landing with zero changes — shows "No changes" message
- INT-CHECK-018: Cache invalidation — parent landing refresh also invalidates checks cache

### Edge Case Tests (14 tests)

- EDGE-CHECK-001: No auth token → auth error screen
- EDGE-CHECK-002: Long context string (100+ chars) — truncated correctly
- EDGE-CHECK-003: Unicode in description — grapheme cluster-safe truncation
- EDGE-CHECK-004: Null description — empty (no "null" text)
- EDGE-CHECK-005: Null target_url — "No URL" in detail view
- EDGE-CHECK-006: Single check across single change — renders correctly
- EDGE-CHECK-007: 50+ changes — all groups render with virtualized scrolling
- EDGE-CHECK-008: Same context reported multiple times for one change — all shown (sorted by created_at)
- EDGE-CHECK-009: Concurrent resize + detail panel open — panel and list re-render correctly
- EDGE-CHECK-010: Rapid n/p group jumps — sequential, one jump per keypress
- EDGE-CHECK-011: Landing with changes but all checks pending — summary shows pending
- EDGE-CHECK-012: Checks update between tab switches (stale cache) — R refreshes to current state
- EDGE-CHECK-013: Change ID that 404s on status fetch — shows "Change not found" for that group
- EDGE-CHECK-014: All checks for all changes are success + all required satisfied — green summary, no warnings

All 100 tests left failing if backend is unimplemented — never skipped or commented out.
