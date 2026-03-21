# TUI_LANDING_CHANGE_STACK

Specification for TUI_LANDING_CHANGE_STACK.

## High-Level User POV

The Change Stack is a dedicated section within the Landing Request detail screen that visualizes the ordered sequence of jj changes bundled in a landing request. Landing requests in Codeplane are jj-native — unlike traditional pull requests that represent a single branch diff, a landing request packages a stack of one or more changes (each with a stable Change ID) that are proposed for landing into a target bookmark. The Change Stack section makes this stack visible and navigable.

When the user opens a landing request detail view (via `Enter` from the landing list or direct navigation), the Change Stack appears as one of the tabbed sections alongside Reviews, Comments, Checks, and Conflicts. The user reaches the Change Stack tab by pressing `Tab`/`Shift+Tab` to cycle between sections or by pressing `s` (the section shortcut) when viewing landing detail. The tab is labeled "Changes (N)" where N is the `stack_size` from the landing request.

The Change Stack renders as a vertically scrollable list of change rows, ordered by `position_in_stack` from the root change (position 0, the oldest/base change) at the top to the tip change (highest position, the most recent change) at the bottom. Each row shows: a position indicator (①②③… or numeric fallback for stacks larger than 20), the short Change ID (first 8 characters in `primary` accent color), conflict status (`⚠` in warning color if `has_conflict` is true), empty status (`∅` in muted color if `is_empty` is true), the first line of the change description, the author name, and a relative timestamp. A visual connector line (`│`) runs down the left margin between changes to convey the stack's sequential nature — the changes flow from base to tip, forming a linear chain.

The focused change row is highlighted with reverse-video styling. The user navigates with `j`/`k` to move between changes in the stack. Pressing `Enter` on a focused change pushes the change detail screen showing the full description, metadata, parent change IDs, and navigation to the diff. Pressing `d` on a focused change opens the diff viewer directly for that specific change — a shortcut for the most common action of reviewing what a particular change modifies. This means the user can walk the stack one change at a time, reviewing each diff individually, which mirrors the natural jj workflow of building up a series of incremental, reviewable changes.

The stack also serves as a navigational aid for the diff viewer. When the user is viewing diffs for the landing request, the Change Stack provides the context of which change they are looking at within the broader stack. A "View full diff" action (`D`) opens the combined diff across all changes in the landing, while `Enter`/`d` on individual changes shows per-change diffs.

At the top of the Change Stack section, a summary line shows: the total number of changes, the target bookmark (e.g., "→ main"), and an aggregate conflict indicator. If any change in the stack has conflicts, the summary shows "⚠ N conflicts" in warning color. If all changes are clean, the summary shows "✓ Clean" in success color.

The Change Stack supports pagination for extremely large stacks (though stacks of 100+ changes are unusual, the UI handles them gracefully). When the stack exceeds the page size of 50, scrolling to 80% triggers loading the next page. A "Loading more…" indicator appears at the bottom during the fetch.

If the API request for changes fails, the section shows an inline error with "Press `R` to retry." If the landing request has zero changes (an edge case from a malformed creation), the section shows "No changes in this landing request." in muted text.

## Acceptance Criteria

### Definition of Done
- [ ] The Change Stack renders as a tabbed section within the Landing Detail screen, accessible via section tab navigation
- [ ] The section tab is labeled "Changes (N)" where N is the landing request's `stack_size`
- [ ] Change data is fetched via `useLandingChanges(owner, repo, number)` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/landings/:number/changes`
- [ ] Each change row also fetches metadata via `useChange(owner, repo, change_id)` or the changes are enriched via a batch endpoint, providing `description`, `author_name`, `timestamp`, `has_conflict`, `is_empty`, and `parent_change_ids`
- [ ] Changes are displayed in `position_in_stack` ascending order (base → tip)
- [ ] Each row displays: position indicator, short change_id (8 chars), conflict indicator (⚠), empty indicator (∅), first line of description, author name, and relative timestamp
- [ ] A visual connector line (│) connects changes vertically in the left margin
- [ ] The summary line at the top shows: change count, target bookmark, and aggregate conflict status
- [ ] The focused row is highlighted with reverse-video styling
- [ ] `Enter` on a focused change pushes the change detail screen with `{ repo, change_id }`
- [ ] `d` on a focused change pushes the diff screen with `{ repo, change_id }`
- [ ] `D` opens the combined diff for the full landing request
- [ ] The section supports cursor-based pagination (page size 50, 80% scroll-to-end trigger)
- [ ] Error states show inline "Press `R` to retry"
- [ ] 401 errors propagate to the app-shell auth error screen
- [ ] Empty stack shows "No changes in this landing request." in muted text
- [ ] The breadcrumb reads "Dashboard > owner/repo > Landings > #N > Changes"

### Keyboard Interactions
- [ ] `j` / `Down`: Move focus to next change row
- [ ] `k` / `Up`: Move focus to previous change row
- [ ] `Enter`: Open change detail screen for focused change
- [ ] `d`: Open diff viewer for focused change
- [ ] `D`: Open combined diff for the full landing request (all changes)
- [ ] `G`: Jump to last loaded change in stack
- [ ] `g g`: Jump to first change in stack (base)
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up within the change list
- [ ] `R`: Retry failed API request (only in error state)
- [ ] `?`: Show help overlay with Change Stack keybindings
- [ ] `Tab` / `Shift+Tab`: Move to next/previous section tab within landing detail
- [ ] `q`: Pop back to landing detail (or previous screen)
- [ ] `n`: Jump focus to next conflicted change in stack
- [ ] `p`: Jump focus to previous conflicted change in stack

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by app-shell router
- [ ] 80×24 – 119×39 (minimum): Position indicator (2ch), connector (1ch), change_id (8ch), status indicators (2ch), description (remaining, truncated), timestamp (4ch). Author hidden. Summary line shows count + conflict status only (no target bookmark)
- [ ] 120×40 – 199×59 (standard): Position indicator (2ch), connector (1ch), change_id (8ch), status indicators (2ch), description (remaining minus 32ch), author (14ch), timestamp (8ch). Full summary line
- [ ] 200×60+ (large): Position indicator (3ch), connector (1ch), change_id (12ch), status indicators (2ch), description (remaining minus 42ch), author (18ch), timestamp (14ch, full relative date). Full summary line with target bookmark

### Truncation & Boundary Constraints
- [ ] `change_id`: Fixed width — 8 characters at minimum/standard, 12 characters at large. Never truncated
- [ ] `description`: First line only. Truncated with `…` at column width. Empty descriptions shown as `(no description)` in muted text
- [ ] `author_name`: Hidden at minimum width. Truncated with `…` at 14ch (standard) / 18ch (large)
- [ ] Position indicator: Circled numbers ①–⑳ for positions 1–20. Numeric fallback "21." for positions > 20. Max display "99+"
- [ ] Timestamps: Short format at minimum (4ch: "3d", "1w"), medium at standard (8ch: "3 days"), full at large (14ch: "3 days ago")
- [ ] Stack size in tab label: "Changes (N)" — up to "Changes (999)". Above 999: "Changes (999+)"
- [ ] Conflict indicators: Single character each (⚠, ∅). Both can co-appear on a single row
- [ ] Connector line characters: │ (continuation), ┌ (first), └ (last), ─ (single change, no connector). Max 1ch width
- [ ] Memory cap: 500 changes max loaded. Pagination stops at cap with footer message
- [ ] Summary target bookmark: Truncated with `…` at 20 characters, prefixed with `→`
- [ ] Aggregate conflict text: "✓ Clean" or "⚠ N conflicts" — max 20ch

### Edge Cases
- [ ] Terminal resize while viewing change stack: Focus preserved, columns recalculate synchronously
- [ ] Rapid `j`/`k`: Sequential processing, one row per keypress, no debounce
- [ ] Stack with 1 change: No connector line. Position shows ①. Tab shows "Changes (1)"
- [ ] Stack with 0 changes: "No changes in this landing request." centered. Tab shows "Changes (0)". `j`/`k`/`Enter`/`d` are no-ops
- [ ] All changes conflicted: Summary shows "⚠ N conflicts" in warning color. All rows have ⚠ indicator
- [ ] All changes empty: All rows show ∅ indicator. Row text dimmed
- [ ] Change with very long description (>500 chars first line): Truncated to column width with `…`
- [ ] Change with null/empty description: "(no description)" in muted text
- [ ] Unicode in descriptions: Truncation respects grapheme clusters
- [ ] `has_conflict` + `is_empty` on same change: Both indicators displayed (⚠∅)
- [ ] Network failure fetching change metadata: Row shows change_id only, other fields show "—"
- [ ] Pagination fetch failure: "Failed to load more. Press `R` to retry." at list bottom. Previously loaded changes preserved
- [ ] SSE disconnect: Change Stack uses REST, not SSE. Unaffected by SSE state
- [ ] `n`/`p` navigation with no conflicted changes: No-op, status bar flash "No conflicted changes"
- [ ] Position gap in `position_in_stack` (e.g., 0, 1, 3): Render contiguously based on API order, not position value
- [ ] Landing request in merged state: Change stack is read-only (degrade gracefully)
- [ ] No color support: Position indicators use plain numbers "1.", "2.". Conflict/empty markers use text `[!]`/`[E]`

## Design

### Layout Structure

The Change Stack is a section within the landing detail view's tabbed content area:

```
┌──────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Landings > #37              │
├──────────────────────────────────────────────────────────────┤
│ #37 Implement auth token refresh               ▲ Open        │
│ Author: alice · Created: 3 days ago · Target: → main         │
├──────────────────────────────────────────────────────────────┤
│ Description │ [Changes (3)] │ Reviews │ Comments │ Checks     │
├──────────────────────────────────────────────────────────────┤
│ 3 changes → main                              ✓ Clean        │
├──────────────────────────────────────────────────────────────┤
│ ┌ ① wqnwkozp   Add base auth types         alice     3d     │
│ │ ② yzmlkxop   Implement token refresh      alice     3d     │
│ └ ③ rtpvksqn   Add integration tests        alice     2d     │
├──────────────────────────────────────────────────────────────┤
│ j/k:navigate  Enter:detail  d:diff  D:full diff  n:conflict  │
└──────────────────────────────────────────────────────────────┘
```

### Components Used
- `<box>` — Vertical/horizontal flexbox containers for layout, rows, summary, column headers
- `<scrollbox>` — Scrollable change list with scroll-to-end pagination detection at 80%
- `<text>` — Change IDs, descriptions, author names, timestamps, position indicators, connector glyphs, status indicators

### Connector Glyph Logic
- total === 1 → "─" (single change, no vertical line)
- index === 0 → "┌" (first/base change)
- index === total - 1 → "└" (last/tip change)
- else → "│" (middle change)

### Position Label Logic
- position < 20 → circled numbers ①②③…⑳
- position < 99 → numeric "21.", "22.", etc.
- else → "99+"

### Keybinding Reference

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Move focus to next change | List focused, not at end |
| `k` / `Up` | Move focus to previous change | List focused, not at start |
| `Enter` | Open change detail screen | Change focused |
| `d` | Open diff for focused change | Change focused |
| `D` | Open combined landing diff | Any change focused |
| `G` | Jump to last loaded change | List focused |
| `g g` | Jump to first change (base) | List focused |
| `Ctrl+D` | Page down | List focused |
| `Ctrl+U` | Page up | List focused |
| `R` | Retry failed fetch | Error state displayed |
| `n` | Next conflicted change | List focused |
| `p` | Previous conflicted change | List focused |
| `?` | Show help overlay | Always |
| `Tab` / `Shift+Tab` | Cycle section tabs | Always |
| `q` | Pop screen (go back) | Always |

### Responsive Column Layout

**80×24 (minimum):** Connector (1ch) + position (2ch) + change_id (8ch) + status (2ch) + description (remaining minus 17ch) + timestamp (4ch). No author column. No column headers. Summary shows count + conflict only.

**120×40 (standard):** Connector (1ch) + position (2ch) + change_id (8ch) + status (2ch) + description (remaining minus 35ch) + author (14ch) + timestamp (8ch). Column headers visible. Full summary with target bookmark.

**200×60 (large):** Connector (1ch) + position (3ch) + change_id (12ch) + status (2ch) + description (remaining minus 49ch) + author (18ch) + timestamp (14ch). Column headers visible. Full summary with target bookmark.

### Data Hooks
- `useLandingChanges(owner, repo, number, { page, perPage })` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/landings/:number/changes?page=N&per_page=50`
- `useChangeMetadata(owner, repo, changeIds[])` from `@codeplane/ui-core` → batch enrichment of change metadata (description, author, timestamp, has_conflict, is_empty) via `GET /api/repos/:owner/:repo/jj/changes/:change_id`
- `useLandingDetail(owner, repo, number)` from `@codeplane/ui-core` → provides `stack_size`, `target_bookmark`, `conflict_status`
- `useLandingDiff(owner, repo, number)` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/landings/:number/diff` for combined diff
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()` from local TUI — for `push()` to change detail and diff screens

### Navigation Context
Receives `{ repo, number }` from landing detail parent. `Enter` → `push("change-detail", { repo, change_id })`. `d` → `push("diff", { repo, change_id })`. `D` → `push("diff", { repo, landing_number: number })`.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View change stack (public repo) | ✅ | ✅ | ✅ | ✅ |
| View change stack (private repo) | ❌ | ✅ | ✅ | ✅ |
| Open change detail | Same as view | ✅ | ✅ | ✅ |
| View change diff | Same as view | ✅ | ✅ | ✅ |
| View combined landing diff | Same as view | ✅ | ✅ | ✅ |

- The Change Stack section inherits permissions from the Landing Detail view
- `GET /api/repos/:owner/:repo/landings/:number/changes` respects repository visibility
- `GET /api/repos/:owner/:repo/jj/changes/:change_id` respects repository visibility
- `GET /api/repos/:owner/:repo/landings/:number/diff` respects repository visibility
- No write operations are performed from the Change Stack view (diffs and details are read-only navigations)

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses propagate to app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."

### Rate Limiting
- 300 req/min for `GET /api/repos/:owner/:repo/landings/:number/changes`
- 300 req/min for `GET /api/repos/:owner/:repo/jj/changes/:change_id` (individual change metadata)
- 300 req/min for `GET /api/repos/:owner/:repo/landings/:number/diff`
- 429 responses show inline "Rate limited. Retry in {Retry-After}s."
- No auto-retry; user presses `R` after waiting
- Change metadata requests are batched and cached to minimize API calls; stale-while-revalidate with 60s TTL

### Input Sanitization
- No user input is sent to the API from this view (read-only navigation)
- Change descriptions, author names, and bookmark names rendered as plain `<text>` (no injection vector)
- Change IDs are fixed-format hex strings — validated client-side before API call

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.landing.change_stack.view` | Section tab activated, data loaded | `repo`, `landing_number`, `landing_state`, `stack_size`, `conflict_count`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms` |
| `tui.landing.change_stack.navigate` | `j`/`k` focus movement | `repo`, `landing_number`, `focused_position`, `focused_change_id`, `direction` |
| `tui.landing.change_stack.open_detail` | `Enter` on focused change | `repo`, `landing_number`, `change_id`, `position_in_stack`, `has_conflict` |
| `tui.landing.change_stack.open_diff` | `d` on focused change | `repo`, `landing_number`, `change_id`, `position_in_stack`, `has_conflict` |
| `tui.landing.change_stack.open_full_diff` | `D` pressed | `repo`, `landing_number`, `stack_size` |
| `tui.landing.change_stack.jump_conflict` | `n`/`p` pressed | `repo`, `landing_number`, `direction`, `target_change_id`, `target_position`, `no_conflicts` |
| `tui.landing.change_stack.paginate` | Next page loaded | `repo`, `landing_number`, `page_number`, `items_loaded_total`, `total_count` |
| `tui.landing.change_stack.error` | API failure | `repo`, `landing_number`, `error_type`, `http_status`, `request_type` |
| `tui.landing.change_stack.retry` | `R` pressed | `repo`, `landing_number`, `error_type`, `retry_success` |
| `tui.landing.change_stack.empty` | Empty state shown | `repo`, `landing_number` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Section load completion | >98% |
| Change detail open rate | >40% of views |
| Change diff open rate | >55% of views |
| Full diff open rate | >25% of views |
| Conflict jump usage | >15% of views with conflicts |
| Error rate | <2% |
| Retry success | >80% |
| Time to interactive | <1.0s |
| Pagination needed rate | <5% (most stacks are < 50) |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Section mounted | `ChangeStack: mounted [repo={r}] [landing={n}] [width={w}] [height={h}]` |
| `debug` | Changes loaded | `ChangeStack: loaded [repo={r}] [landing={n}] [count={c}] [total={t}] [duration={ms}ms]` |
| `debug` | Metadata enriched | `ChangeStack: metadata [repo={r}] [landing={n}] [enriched={c}] [cached={h}] [duration={ms}ms]` |
| `debug` | Focus changed | `ChangeStack: focus [repo={r}] [landing={n}] [position={p}] [change_id={id}]` |
| `debug` | Pagination triggered | `ChangeStack: pagination [repo={r}] [landing={n}] [page={p}]` |
| `info` | Fully loaded | `ChangeStack: ready [repo={r}] [landing={n}] [changes={c}] [conflicts={n}] [total_ms={ms}]` |
| `info` | Change navigated | `ChangeStack: navigated [repo={r}] [landing={n}] [change_id={id}] [target=detail|diff]` |
| `info` | Full diff opened | `ChangeStack: full diff [repo={r}] [landing={n}]` |
| `warn` | Fetch failed | `ChangeStack: fetch failed [repo={r}] [landing={n}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `ChangeStack: rate limited [repo={r}] [landing={n}] [retry_after={s}]` |
| `warn` | Metadata fetch failed | `ChangeStack: metadata failed [repo={r}] [change_id={id}] [status={code}]` |
| `warn` | Slow load (>3s) | `ChangeStack: slow load [repo={r}] [landing={n}] [duration={ms}ms]` |
| `warn` | Pagination cap | `ChangeStack: pagination cap [repo={r}] [landing={n}] [total={n}] [cap=500]` |
| `error` | Auth error | `ChangeStack: auth error [repo={r}] [status=401]` |
| `error` | Render error | `ChangeStack: render error [repo={r}] [landing={n}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during load | Layout re-renders; fetch continues | Independent |
| Resize while scrolled | Focus preserved; columns recalculate | Synchronous |
| SSE disconnect | Change Stack is REST-only; unaffected | SSE provider reconnects independently |
| Auth expiry | Next API call → 401 → auth error screen | Re-auth via CLI |
| Network timeout (30s) | Loading → error + "Press R" | User retries |
| Metadata fetch partial failure | Rows with failed metadata show change_id + "—" placeholders | Individual retry on re-focus |
| Change metadata 404 | Change row shows change_id, "(metadata unavailable)" in muted text | Informational only |
| Rate limit on batch metadata | Staggered retry with backoff; loaded rows render immediately | Progressive enrichment |
| Landing request 404 | Parent landing detail screen handles this; Change Stack never renders | Navigate back |
| Rapid `j`/`k` crossing pagination boundary | Next page fetched; focus waits for load complete | Loading indicator at focus position |
| No color support | Position numbers use "1.", "2." format. Conflict/empty markers use `[!]`/`[E]` text | Theme detection |

### Failure Modes
- Component crash → global error boundary → "Press `r` to restart"
- Change list fetch fails → inline error state; `Tab`/`q` still work for navigation
- All metadata fetches fail → rows show change_id only with "—" placeholders
- Slow network → spinner shown; user can switch sections via Tab
- Combined diff fetch fails → status bar error flash, stays on change stack

## Verification

### Test File: `e2e/tui/landings.test.ts`

### Terminal Snapshot Tests (24 tests)

- SNAP-STACK-001: Change stack at 120×40 with 3 changes — full layout, connector lines, column headers, summary line
- SNAP-STACK-002: Change stack at 80×24 minimum — compact layout, no author, no column headers
- SNAP-STACK-003: Change stack at 200×60 large — expanded change_id, full timestamps, wider columns
- SNAP-STACK-004: Empty state (0 changes) — "No changes in this landing request."
- SNAP-STACK-005: Loading state — spinner with "Loading changes…"
- SNAP-STACK-006: Error state — red error with "Press R to retry"
- SNAP-STACK-007: Focused row highlight — reverse video with primary accent
- SNAP-STACK-008: Single change stack — no connector lines, position ①
- SNAP-STACK-009: Large stack (20 changes) — circled numbers ① through ⑳
- SNAP-STACK-010: Stack with position > 20 — numeric fallback "21."
- SNAP-STACK-011: Conflict change row — ⚠ indicator in warning color, row background tinted
- SNAP-STACK-012: Empty change row — ∅ indicator in muted color, row dimmed
- SNAP-STACK-013: Conflict + empty change — both ⚠∅ indicators shown
- SNAP-STACK-014: No description change — "(no description)" in muted text
- SNAP-STACK-015: Summary line — "3 changes → main" with "✓ Clean"
- SNAP-STACK-016: Summary with conflicts — "⚠ 2 conflicts" in warning
- SNAP-STACK-017: Connector glyphs — ┌ for first, │ for middle, └ for last
- SNAP-STACK-018: Section tab label — "Changes (3)" with active styling
- SNAP-STACK-019: Pagination loading indicator — "Loading more…" at bottom
- SNAP-STACK-020: Pagination cap — "Showing 500 of N changes"
- SNAP-STACK-021: Change stack breadcrumb — "Dashboard > owner/repo > Landings > #37 > Changes"
- SNAP-STACK-022: Status bar hints — "j/k:navigate Enter:detail d:diff D:full diff n:conflict q:back"
- SNAP-STACK-023: Metadata unavailable row — change_id with "—" placeholders
- SNAP-STACK-024: No color mode — plain numbers "1.", "2." and text markers [!]/[E]

### Keyboard Interaction Tests (36 tests)

- KEY-STACK-001–004: `j`/`k`/`Down`/`Up` navigation (single step, boundary at top, boundary at bottom, wrap prevention)
- KEY-STACK-005–006: `Enter` opens change detail screen (verify pushed screen and params)
- KEY-STACK-007–008: `d` opens diff for focused change (verify pushed screen and params)
- KEY-STACK-009: `D` opens combined landing diff (verify pushed screen with landing_number)
- KEY-STACK-010–011: `G` jumps to last change, `g g` jumps to first change
- KEY-STACK-012–013: `Ctrl+D` page down, `Ctrl+U` page up
- KEY-STACK-014–015: `R` retry (retries failed fetch; no-op when not in error state)
- KEY-STACK-016–018: `n` jumps to next conflicted change (forward wrap, no-op when no conflicts, status bar flash)
- KEY-STACK-019–021: `p` jumps to previous conflicted change (backward wrap, no-op when no conflicts, status bar flash)
- KEY-STACK-022–023: `Tab`/`Shift+Tab` cycles to next/previous section tab
- KEY-STACK-024: `q` pops back to landing detail or previous screen
- KEY-STACK-025: `?` shows help overlay with Change Stack keybindings
- KEY-STACK-026: `Enter` on empty stack (0 changes) — no-op
- KEY-STACK-027: `d` on empty stack — no-op
- KEY-STACK-028: `D` on empty stack — no-op
- KEY-STACK-029: Rapid `j` presses (10× sequential) — focus advances 10 rows
- KEY-STACK-030: `Enter` during loading state — no-op
- KEY-STACK-031: `j` at pagination boundary triggers next page load
- KEY-STACK-032: `G` beyond loaded items waits for pagination
- KEY-STACK-033: `n` with single conflicted change — focus jumps to that change, stays there on repeated press
- KEY-STACK-034: `d` on change with failed metadata — still opens diff (change_id is sufficient)
- KEY-STACK-035: Global keybindings still active (`:` opens command palette, `g r` navigates to repos)
- KEY-STACK-036: Keys do not leak when section tab is not active

### Responsive Tests (12 tests)

- RESP-STACK-001–003: 80×24 layout (connector+position+id+status+description+time, no author, no headers)
- RESP-STACK-004–006: 120×40 layout (adds author column, column headers visible, full summary)
- RESP-STACK-007–008: 200×60 layout (extended change_id 12ch, full timestamps, wider author)
- RESP-STACK-009: Resize from 120×40 to 80×24 — author column collapses, headers disappear
- RESP-STACK-010: Resize from 80×24 to 120×40 — author column appears, headers appear
- RESP-STACK-011: Focus preserved through resize
- RESP-STACK-012: Resize during loading state — layout adjusts, loading continues

### Integration Tests (16 tests)

- INT-STACK-001: Full navigation flow: landing list → landing detail → change stack tab → select change → change detail → back → back
- INT-STACK-002: Full diff flow: landing list → landing detail → change stack → `d` on change → diff viewer → back
- INT-STACK-003: Combined diff flow: change stack → `D` → diff viewer with all changes → back
- INT-STACK-004: Auth expiry during change metadata fetch → 401 → auth error screen
- INT-STACK-005: Rate limit on change list → 429 → inline message
- INT-STACK-006: Network timeout → error state with retry
- INT-STACK-007: Server 500 → error state with retry
- INT-STACK-008: `R` retry after error → successful reload
- INT-STACK-009: Pagination: scroll through 60-change stack (2 pages of 50)
- INT-STACK-010: Pagination cap at 500 changes
- INT-STACK-011: Section tab switch: Changes → Reviews → Changes (data preserved, focus reset)
- INT-STACK-012: Deep link to landing detail with change stack as active section
- INT-STACK-013: Landing with all changes conflicted — summary shows correct count, all rows tinted
- INT-STACK-014: Landing with mixed conflict states — some rows tinted, `n`/`p` navigation works
- INT-STACK-015: Change metadata cache hit — previously viewed changes load instantly
- INT-STACK-016: Partial metadata failure — rows degrade gracefully with "—" placeholders

### Edge Case Tests (12 tests)

- EDGE-STACK-001: Stack with exactly 1 change — no connector, position ①, tab shows "Changes (1)"
- EDGE-STACK-002: Stack with 0 changes — empty state message, all navigation no-ops
- EDGE-STACK-003: Stack with 100 changes — pagination, circled+numeric indicators, scrolling works
- EDGE-STACK-004: Change with 500+ char first-line description — truncated properly
- EDGE-STACK-005: Unicode/emoji in change descriptions — grapheme-aware truncation
- EDGE-STACK-006: Concurrent resize + `j`/`k` navigation — no crash, layout consistent
- EDGE-STACK-007: `has_conflict` and `is_empty` both true on same change — both indicators shown
- EDGE-STACK-008: Change with null description and null author — both show placeholder text
- EDGE-STACK-009: Rapid `d` presses on same change — single navigation, idempotent
- EDGE-STACK-010: Position gaps in `position_in_stack` (0, 1, 5) — rendered contiguously
- EDGE-STACK-011: Network disconnect during pagination — partial list preserved, error at bottom
- EDGE-STACK-012: No auth token present — auth error screen before change stack renders

All 100 tests left failing if backend is unimplemented — never skipped or commented out.
