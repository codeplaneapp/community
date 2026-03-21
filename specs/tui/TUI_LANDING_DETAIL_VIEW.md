# TUI_LANDING_DETAIL_VIEW

Specification for TUI_LANDING_DETAIL_VIEW.

## High-Level User POV

The landing detail view is the screen a developer sees after selecting a landing request from the landing list or navigating directly via the command palette (`:landing 12`) or deep link (`codeplane tui --screen landings --repo owner/repo --landing 12`). It is a vertically scrollable, tabbed detail screen that surfaces everything about a landing request — its title, state, change stack, reviews, comments, checks, conflict status, and diff — all rendered in a dense, keyboard-navigable layout designed for reviewing and acting on jj-native stacked changes without leaving the terminal.

Landing requests are Codeplane's jj-native alternative to pull requests. Unlike traditional PRs that compare branches, a landing request represents a stack of jj changes (identified by stable change IDs) proposed for landing into a target bookmark. The detail view is the primary surface for understanding, reviewing, and merging these stacked changes.

The screen opens with the landing title prominently displayed at the top in bold text, followed by a state badge — a colored pill showing the current state: `[open]` in green, `[draft]` in gray, `[closed]` in red, `[merged]` in magenta, `[queued]` in yellow, or `[landing]` in yellow. Immediately below the title, a metadata row shows the author's username, creation timestamp, target bookmark (e.g., `→ main`), conflict status indicator (✓ clean / ✗ conflicted / ? unknown), and the change stack size (e.g., "3 changes"). If the landing has been merged, the `merged_at` timestamp appears. If queued, the queue position is shown.

Below the metadata, a tab bar provides navigation across five sections: **Overview** (1), **Changes** (2), **Reviews** (3), **Comments** (4), and **Diff** (5). Tab navigation uses `Tab`/`Shift+Tab` to cycle, number keys `1`–`5` to jump directly, or `h`/`l` to move between adjacent tabs. The active tab is highlighted with reverse video and underline.

The **Overview** tab displays the landing body rendered as markdown, followed by the conflict status section. If conflicts exist, each conflicted file is listed per-change with the change ID and file path. Below conflicts, a summary of the review state shows the number of approvals, requested changes, and pending reviews.

The **Changes** tab displays the change stack as an ordered list. Each change is shown with its position number, stable change ID (truncated to 12 characters), and a conflict indicator. The stack is ordered by position (topmost change first). Pressing `Enter` on a change navigates to the diff for that specific change.

The **Reviews** tab lists all reviews chronologically. Each review shows the reviewer's username, the review type badge (`[approved]` in green, `[changes requested]` in red, `[commented]` in muted, `[pending]` in yellow), the review body rendered as markdown, and a timestamp. The user can submit a new review with `r` (opens review form) and dismiss a review with `d` (when the user has admin permission).

The **Comments** tab lists inline diff comments. Each comment shows the file path and line number, the author's username, the comment body, and a timestamp. Comments are grouped by file path. The user can add a new comment with `c` (opens comment form specifying path, line, side, and body).

The **Diff** tab renders the full diff for all changes in the landing request using the `<diff>` component. The diff supports unified and split modes (toggled with `t`), whitespace visibility toggle (`w`), expand/collapse hunks (`x`/`z`), and file navigation (`]`/`[`). A file tree sidebar on the left shows all changed files; it can be toggled with `Ctrl+B`. Line numbers are always visible.

The primary actions on the landing detail are: `m` to queue the landing for merge (available when state is open and conflicts are clean), `x` to close or reopen the landing (optimistic toggle), `e` to edit the title and body, and `r` to submit a review. When queued for merge, the state transitions optimistically to `[merged]` and a status bar confirmation shows "Landing #N queued for merge (position: M)."

At the minimum 80×24 terminal size, the tab labels are abbreviated (1:Ovrvw, 2:Chng, 3:Rvw, 4:Cmnt, 5:Diff), the metadata row collapses to show only state and author, and the file tree sidebar in the diff tab is hidden. At 120×40, the full layout is visible with all metadata and full tab labels. At 200×60, wider diffs render with more context lines, the file tree sidebar shows longer paths, and timestamps use full format.

The breadcrumb in the header bar shows the full navigation path: `Dashboard > owner/repo > Landings > #12`. The status bar shows context-sensitive keybinding hints that change based on the active tab.

## Acceptance Criteria

### Screen lifecycle
- [ ] The landing detail view is pushed onto the navigation stack when the user presses `Enter` on a landing in the landing list
- [ ] The landing detail view is pushed via the command palette (`:landing N` or `:landing owner/repo#N`)
- [ ] The landing detail view is pushed via deep link (`codeplane tui --screen landings --repo owner/repo --landing N`)
- [ ] Pressing `q` pops the landing detail view and returns to the previous screen
- [ ] The breadcrumb displays `… > Landings > #N` where N is the landing number
- [ ] The screen title in the navigation stack entry is `Landing #N: <truncated title>` (title truncated to 40 characters)

### Landing header
- [ ] The landing title renders in bold text, full width, wrapping to multiple lines if necessary
- [ ] The landing title is never truncated on the detail screen — it wraps within the available width
- [ ] The state badge renders immediately after or below the title: `[open]` in `success` color (ANSI 34), `[draft]` in `muted` (ANSI 245), `[closed]` in `error` (ANSI 196), `[merged]` in magenta (ANSI 135), `[queued]` in `warning` (ANSI 178), `[landing]` in `warning` (ANSI 178)
- [ ] The state badge uses square brackets and text, not background color, for accessibility on 16-color terminals

### Metadata row
- [ ] The author's username renders as `@username` in `primary` color (ANSI 33)
- [ ] The creation timestamp renders as a relative time in `muted` color (ANSI 245)
- [ ] The target bookmark renders as `→ bookmark-name` in cyan (ANSI 37)
- [ ] The conflict status renders as a colored icon: ✓ (clean, green ANSI 34), ✗ (conflicted, red ANSI 196), ? (unknown, yellow ANSI 178)
- [ ] The stack size renders as "N changes" in `muted` color (or "1 change" singular)
- [ ] When state is `merged`, the `merged_at` timestamp is displayed in `muted` color
- [ ] When state is `queued`, the queue position renders as "Queue position: N" in `warning` color
- [ ] The `updated_at` timestamp renders when different from `created_at`, as "updated Xh ago" in `muted` color

### Tab bar
- [ ] Five tabs render below the metadata: Overview (1), Changes (2), Reviews (3), Comments (4), Diff (5)
- [ ] Active tab has reverse-video + underline styling; inactive tabs in `muted` color
- [ ] Each tab includes a numeric prefix (`1:Overview`, `2:Changes`, etc.)
- [ ] `Tab` / `Shift+Tab` cycle tabs forward/backward (with wrapping)
- [ ] `1`–`5` jump directly to the corresponding tab
- [ ] `h`/`l` navigate to adjacent tabs (no wrap)
- [ ] Tab change preserves scroll position per-tab (returning to a tab restores its scroll)
- [ ] Tab change does not trigger a full-screen loading spinner — each tab manages its own loading state

### Overview tab
- [ ] The landing body is rendered using `<markdown>` with full markdown support
- [ ] An empty or null body renders "No description provided." in `muted` italic text
- [ ] Below the body, a conflict status section shows: clean (✓ No conflicts, green), conflicted (✗ Conflicts detected, red, with file list), unknown (? Conflict status unknown, yellow)
- [ ] Below conflicts, a review summary shows: "N approved, N changes requested, N pending" with appropriate colors
- [ ] Body rendering caps at 100,000 characters with truncation notice

### Changes tab
- [ ] Displays the change stack as an ordered list, numbered by `position_in_stack`
- [ ] Each row shows: position number (1-based), change ID (first 12 characters), and a conflict indicator per-change
- [ ] The focused change row uses reverse-video highlighting
- [ ] `j`/`k` navigates between changes; `Enter` navigates to diff for that change
- [ ] Empty change stack shows "No changes in this landing request." in `muted` text

### Reviews tab
- [ ] Reviews listed chronologically with type badges: [approved] green, [changes requested] red, [commented] muted, [pending] yellow
- [ ] Dismissed reviews show [dismissed] badge in muted with strikethrough
- [ ] `r` opens review creation form; `d` dismisses focused review (admin only)
- [ ] Empty state: "No reviews yet. Press r to add one."
- [ ] Paginated: page size 30, loads more on scroll past 80%

### Comments tab
- [ ] Inline diff comments grouped by file path
- [ ] `c` opens comment creation form with path, line, side, body fields
- [ ] Empty state: "No inline comments. Press c to add one."
- [ ] Paginated: page size 30, loads more on scroll past 80%

### Diff tab
- [ ] Renders full diff using `<diff>` component; supports unified (default) and split modes
- [ ] File tree sidebar (25% width) visible at 120×40+; toggleable with `Ctrl+B`
- [ ] `]`/`[` navigates files; `t` toggles mode; `w` toggles whitespace; `x`/`z` expand/collapse hunks
- [ ] Split mode unavailable at 80×24 with status bar flash
- [ ] Empty diff shows "No file changes in this landing request."

### Actions
- [ ] `m` queues for merge (open + clean conflicts only); shows error for conflicted/non-open states
- [ ] `x` close/reopen (optimistic toggle); no-op on merged/queued/landing states
- [ ] `e` opens edit form (title + body); requires write access
- [ ] All write actions disabled while another mutation is in-flight

### Data loading
- [ ] 5 concurrent requests on mount (landing, reviews, comments, changes, conflicts); diff loads lazily
- [ ] Full-screen spinner during initial fetch; tab-specific errors for tab data failures
- [ ] 404 shows "Landing #N not found"; network error shows "Failed to load landing" with retry
- [ ] Cached for 30 seconds on re-navigation

### Boundary constraints
- [ ] Landing body: 100,000 char cap; Review/comment body: 50,000 char cap
- [ ] Change ID display: first 12 characters; Username: 39 char cap; Bookmark name: 30 char cap in metadata
- [ ] 500 items memory cap per tab; relative timestamps switch to absolute after 30 days
- [ ] Virtualized rendering for 100+ items per tab

### Responsive behavior
- [ ] 80×24: compact metadata, abbreviated tabs, unified diff only, no file tree
- [ ] 120×40: full metadata, full tabs, file tree visible
- [ ] 200×60: expanded padding, more diff context, full timestamps
- [ ] Below 80×24: "Terminal too small" message

### Edge cases
- [ ] Unicode/emoji: no terminal corruption
- [ ] Null body: "No description provided." (not "null")
- [ ] Unknown review types: [unknown] badge
- [ ] Rapid tab switching: cancels pending lazy loads
- [ ] Merge race conditions: graceful handling
- [ ] Landing in queued/landing state: write actions disabled
- [ ] No color support: ASCII fallback for icons

## Design

### Layout structure

At standard terminal size (120×40), after subtracting header (1 row) and status bar (1 row), the content area is 38 rows × 120 columns:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Add stacked auth token refresh and retry logic                                                             [open]   │
│ @alice · opened 2h ago · updated 30m ago · → main · ✓ clean · 3 changes                                            │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  1:Overview    2:Changes    3:Reviews    4:Comments    5:Diff                                                        │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [Overview body with markdown, conflicts section, review summary]                                                     │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

At minimum (80×24): Title wraps, metadata collapses to state+author, tab labels abbreviated (1:Ovrvw, 2:Chng, 3:Rvw, 4:Cmnt, 5:Diff), diff in unified only, file tree hidden.

Diff tab with sidebar at 120×40:
```
┌──────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Files (3)    │ [Diff content with syntax highlighting, line numbers, green/red coloring]                            │
│ ▸ src/auth/  │                                                                                                      │
│   service.ts │                                                                                                      │
│ ▸ src/api/   │                                                                                                      │
│   client.ts  │                                                                                                      │
└──────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Components Used
- `<box>` — Flexbox containers for layout, rows, tab bar, header sections
- `<scrollbox>` — Scrollable tab content with scroll-to-end pagination at 80%
- `<text>` — Titles, badges, metadata, change IDs, timestamps, usernames
- `<markdown>` — Landing body, review bodies, comment bodies
- `<code>` — Code blocks within markdown content
- `<diff>` — Diff tab content (unified/split modes, syntax highlighting, line numbers)
- `<input>` — Form fields for edit, comment path/line
- `<select>` — Review type selector in review form

### Keybindings

| Key | Context | Action |
|-----|---------|--------|
| `j`/`Down` | Any tab | Scroll down / move focus down |
| `k`/`Up` | Any tab | Scroll up / move focus up |
| `G` | Any tab | Jump to bottom |
| `g g` | Any tab | Jump to top |
| `Ctrl+D`/`Ctrl+U` | Any tab | Page down/up |
| `Tab`/`Shift+Tab` | Any | Cycle tabs (wrapping) |
| `1`–`5` | Any | Jump to tab |
| `h`/`l` | Tab bar | Adjacent tab (no wrap) |
| `n`/`p` | Reviews/Comments | Next/previous item |
| `r` | Any | Open review form |
| `c` | Comments tab | Open comment form |
| `d` | Reviews tab | Dismiss review (admin) |
| `e` | Any (write) | Open edit form |
| `m` | Any (write) | Queue for merge |
| `x` | Any (write) / Diff | Close/reopen (non-Diff) or expand hunks (Diff) |
| `t`/`w` | Diff | Toggle mode / whitespace |
| `]`/`[` | Diff | Next/prev file |
| `Ctrl+B` | Diff | Toggle file tree |
| `z` | Diff | Collapse all hunks |
| `R` | Error | Retry fetch |
| `q` | Any | Pop screen |
| `Esc` | Form/overlay | Close |
| `Ctrl+S` | Form | Submit |
| `?` | Any | Help overlay |
| `:` | Any | Command palette |

### Status bar hints (per-tab)
- Overview: `j/k:scroll  Tab:tabs  r:review  m:merge  x:close  e:edit  q:back`
- Changes: `j/k:navigate  Enter:diff  Tab:tabs  r:review  m:merge  q:back`
- Reviews: `j/k:navigate  n/p:review  r:review  d:dismiss  Tab:tabs  q:back`
- Comments: `j/k:navigate  n/p:comment  c:comment  Tab:tabs  q:back`
- Diff: `j/k:scroll  ]/[:file  t:mode  w:ws  x:expand  z:collapse  Ctrl+B:tree  q:back`

### Responsive behavior
| Width × Height | Metadata | Tab Labels | Diff Mode | File Tree |
|----------------|----------|------------|-----------|----------|
| 80×24 – 119×39 | State + author | Abbreviated | Unified only | Hidden |
| 120×40 – 199×59 | Full row | Full | Unified + split | Visible (25%) |
| 200×60+ | Full + padding | Full + spacing | Split default | Visible (25%) |

### Data hooks consumed
- `useLanding(owner, repo, number)` → `GET /api/repos/:owner/:repo/landings/:number`
- `useLandingReviews(owner, repo, number)` → `GET .../reviews?page=N&per_page=30`
- `useLandingComments(owner, repo, number)` → `GET .../comments?page=N&per_page=30`
- `useLandingChanges(owner, repo, number)` → `GET .../changes?page=N&per_page=30`
- `useLandingConflicts(owner, repo, number)` → `GET .../conflicts`
- `useLandingDiff(owner, repo, number, opts)` → `GET .../diff?ignore_whitespace=false` (lazy)
- `useUpdateLanding()` → `PATCH .../landings/:number`
- `useLandLanding()` → `PUT .../landings/:number/land`
- `useCreateLandingReview()` → `POST .../reviews`
- `useDismissLandingReview()` → `PATCH .../reviews/:review_id`
- `useCreateLandingComment()` → `POST .../comments`
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()`, `useRepoContext()` from local TUI

### Optimistic UI
- Close/reopen: state badge changes immediately; reverts on error
- Queue for merge: state transitions to [merged]; reverts on error
- Review/comment submission: appends immediately; removed on failure
- Edit: title/body update immediately; revert on error
- Dismiss review: badge changes immediately; reverts on failure

### Pagination
- Reviews/Comments: page-based (size 30), scroll-to-end at 80%, 500-item memory cap
- Changes: single fetch (pagination for stacks > 30)
- Diff: single fetch (lazy on tab activation)

## Permissions & Security

### Authorization

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View landing detail (public repo) | ✅ | ✅ | ✅ | ✅ |
| View landing detail (private repo) | ❌ | ✅ | ✅ | ✅ |
| View diff | Same as view | ✅ | ✅ | ✅ |
| Submit review | ❌ | ❌ | ✅ | ✅ |
| Dismiss review | ❌ | ❌ | ❌ | ✅ |
| Add inline comment | ❌ | ❌ | ✅ | ✅ |
| Edit landing (title/body) | ❌ | ❌ | ✅ (author or write) | ✅ |
| Close/reopen landing | ❌ | ❌ | ✅ | ✅ |
| Queue for merge | ❌ | ❌ | ✅ | ✅ |

- The landing detail screen requires an active repository context
- `GET /api/repos/:owner/:repo/landings/:number` respects repository visibility: public repos accessible to all authenticated users; private repos require read access
- Write action keybinding hints (`r`, `e`, `m`, `x`, `d`) are hidden from status bar for read-only users
- If a write action is attempted without permission, the server returns 403 and the TUI shows "Permission denied" in `error` color as a status bar flash that auto-dismisses after 3 seconds
- Queue for merge respects protected bookmark approval requirements — if required approvals are not met, the server returns 409 and the TUI shows "Required approvals not met"
- Review dismissal is restricted to repository admins; the `d` key is a no-op for non-admin users

### Token-based auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses propagate to auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."
- The TUI does not retry 401s; the user must re-authenticate via CLI

### Rate limiting
- 5 concurrent GET requests on mount (within standard rate limits)
- Diff loads lazily (1 additional request on tab activation)
- Write actions debounced: action key disabled while mutation is in-flight
- 300 req/min for GET endpoints; 60 req/min for mutation endpoints
- 429 responses show inline "Rate limited. Retry in {Retry-After}s."
- No auto-retry; user presses `R` after waiting

### Input sanitization
- Review body and comment body sent to API as-is; no client-side sanitization needed
- Landing titles and bodies rendered via `<markdown>`/`<text>` — no injection vector in terminal
- Change IDs and file paths rendered as plain text
- Form inputs have no character restrictions beyond API limits

## Telemetry & Product Analytics

### Key business events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.landing_detail.viewed` | Screen renders with data | `owner`, `repo`, `landing_number`, `landing_state`, `conflict_status`, `stack_size`, `review_count`, `comment_count`, `tab`, `terminal_width`, `terminal_height`, `entry_method` |
| `tui.landing_detail.tab_changed` | Tab switch | `owner`, `repo`, `landing_number`, `from_tab`, `to_tab`, `method` |
| `tui.landing_detail.review_submitted` | Review submitted | `owner`, `repo`, `landing_number`, `review_type`, `body_length`, `time_to_submit_ms` |
| `tui.landing_detail.review_dismissed` | Review dismissed | `owner`, `repo`, `landing_number`, `review_id`, `review_type` |
| `tui.landing_detail.comment_created` | Comment submitted | `owner`, `repo`, `landing_number`, `file_path`, `line`, `side`, `body_length`, `time_to_submit_ms` |
| `tui.landing_detail.state_toggled` | Close/reopen | `owner`, `repo`, `landing_number`, `from_state`, `to_state`, `success` |
| `tui.landing_detail.merge_queued` | Merge action | `owner`, `repo`, `landing_number`, `conflict_status`, `stack_size`, `approval_count`, `success`, `queue_position` |
| `tui.landing_detail.edit_submitted` | Edit submitted | `owner`, `repo`, `landing_number`, `fields_changed`, `time_to_submit_ms` |
| `tui.landing_detail.change_navigated` | Enter on change | `owner`, `repo`, `landing_number`, `change_id`, `position_in_stack` |
| `tui.landing_detail.diff_viewed` | Diff tab activated | `owner`, `repo`, `landing_number`, `file_count`, `diff_load_time_ms` |
| `tui.landing_detail.diff_mode_toggled` | Toggle unified/split | `owner`, `repo`, `landing_number`, `new_mode` |
| `tui.landing_detail.scrolled` | Scroll to bottom 20% | `tab`, `scroll_depth_percent`, `total_items_loaded` |
| `tui.landing_detail.pagination` | Next page loaded | `tab`, `page_number`, `items_loaded_total`, `load_duration_ms` |
| `tui.landing_detail.data_load_time` | All initial loads complete | `landing_ms`, `reviews_ms`, `comments_ms`, `changes_ms`, `conflicts_ms`, `total_ms` |
| `tui.landing_detail.retry` | Press R | `error_type`, `retry_count`, `tab` |
| `tui.landing_detail.error` | API failure | `endpoint`, `error_type`, `http_status`, `tab` |

### Common properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode` ("truecolor"/"256"/"16"), `layout` ("compact"/"standard"/"expanded")

### Success indicators

| Metric | Target |
|--------|--------|
| Screen load completion | >98% |
| Data load success rate | >98% |
| Mean time to interactive | <1.5s |
| Tab usage rate (2+ tabs per view) | >60% |
| Review submission rate | >20% of views |
| Comment creation rate | >10% of views |
| Merge action rate (on open landings) | >15% |
| Diff tab activation rate | >40% |
| Edit rate | >5% |
| Error rate | <2% |
| Retry success rate | >80% |
| Tab switch time (p95) | <50ms |

## Observability

### Logging requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `LandingDetail: mounted [owner={o}] [repo={r}] [number={n}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Landing loaded | `LandingDetail: landing loaded [number={n}] [state={s}] [stack_size={sz}] [duration={ms}ms]` |
| `debug` | Reviews loaded | `LandingDetail: reviews loaded [number={n}] [page={p}] [count={c}] [duration={ms}ms]` |
| `debug` | Comments loaded | `LandingDetail: comments loaded [number={n}] [page={p}] [count={c}] [duration={ms}ms]` |
| `debug` | Changes loaded | `LandingDetail: changes loaded [number={n}] [count={c}] [duration={ms}ms]` |
| `debug` | Conflicts loaded | `LandingDetail: conflicts loaded [number={n}] [status={s}] [duration={ms}ms]` |
| `debug` | Diff loaded | `LandingDetail: diff loaded [number={n}] [files={f}] [duration={ms}ms]` |
| `debug` | Tab switched | `LandingDetail: tab switch [number={n}] [from={old}] [to={new}]` |
| `info` | Fully loaded | `LandingDetail: ready [number={n}] [total_ms={ms}]` |
| `info` | Review submitted | `LandingDetail: review submitted [number={n}] [type={t}] [review_id={id}]` |
| `info` | Review dismissed | `LandingDetail: review dismissed [number={n}] [review_id={id}]` |
| `info` | Comment created | `LandingDetail: comment created [number={n}] [comment_id={id}] [path={p}] [line={l}]` |
| `info` | State changed | `LandingDetail: state changed [number={n}] [from={old}] [to={new}]` |
| `info` | Merge queued | `LandingDetail: merge queued [number={n}] [queue_position={pos}] [task_id={id}]` |
| `info` | Landing edited | `LandingDetail: edited [number={n}] [fields={list}]` |
| `warn` | Slow load | `LandingDetail: slow load [endpoint={ep}] [duration={ms}ms]` (>3000ms) |
| `warn` | Body truncated | `LandingDetail: body truncated [number={n}] [original_length={len}]` |
| `warn` | Items capped | `LandingDetail: items capped [tab={t}] [total={n}] [cap=500]` |
| `warn` | Rate limited | `LandingDetail: rate limited [endpoint={ep}] [retry_after={s}]` |
| `warn` | Action failed | `LandingDetail: action failed [number={n}] [action={a}] [status={code}]` |
| `error` | Not found | `LandingDetail: 404 [owner={o}] [repo={r}] [number={n}]` |
| `error` | Auth error | `LandingDetail: auth error [status=401]` |
| `error` | Permission denied | `LandingDetail: permission denied [action={a}] [status=403]` |
| `error` | Fetch failed | `LandingDetail: fetch failed [endpoint={ep}] [status={code}] [error={msg}]` |
| `error` | Render error | `LandingDetail: render error [component={name}] [error={msg}]` |
| `error` | Optimistic revert | `LandingDetail: optimistic revert [action={a}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-specific error cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during data load | Layout re-renders; data populates into new layout | Independent |
| Resize collapses metadata | Metadata reduces to state+author; tabs abbreviate | Synchronous re-layout |
| SSE disconnect | Status bar shows disconnected; detail is REST-based, unaffected | SSE provider reconnects |
| Auth expiry | Next API call fails 401; inline error shown | Re-auth via CLI |
| Network timeout (30s) | Full-screen error with retry hint | User presses R |
| Tab data timeout | Inline error within tab | User presses R within tab |
| Landing deleted while viewing | 404 on next interaction; "Landing no longer exists" | User presses q |
| Rapid tab switching | Cancels pending lazy loads via AbortController | Cancel semantics |
| Merge 409 (conflicts) | Status bar flash | User resolves conflicts |
| Merge 409 (approvals) | Status bar flash | User obtains reviews |
| Close/reopen 403 | Optimistic revert + status bar flash | Informational |
| Review dismiss 403 | Status bar flash "Only admins can dismiss" | Informational |
| Split diff at 80×24 | Status bar flash "requires wider terminal" | User widens or stays unified |
| No color support | ASCII fallback [ok]/[!!]/[?] for icons | Theme detection |
| Large diff | Virtualized rendering | Scroll-driven lazy rendering |

### Failure modes
- Component crash → global error boundary → "Press r to restart"
- Tab crash → per-tab error boundary → "Tab rendering error — press R to retry"; other tabs functional
- Markdown crash → falls back to plain text
- Diff crash → "Diff rendering error — press R to retry"
- All API fail → full-screen error; go-to and palette still available
- Slow network → spinner; user navigates away via q/go-to/palette

## Verification

### Test File: `e2e/tui/landings.test.ts`

### Terminal Snapshot Tests (35 tests)

- SNAP-LDET-001: Landing detail at 120×40 with Overview tab — full layout, header, metadata, tabs, body, conflicts, review summary
- SNAP-LDET-002: Landing detail at 80×24 compact — abbreviated tabs, wrapped title, compact metadata
- SNAP-LDET-003: Landing detail at 200×60 expanded — full timestamps, generous padding
- SNAP-LDET-004: Open state badge — [open] green (ANSI 34)
- SNAP-LDET-005: Draft state badge — [draft] gray (ANSI 245)
- SNAP-LDET-006: Closed state badge — [closed] red (ANSI 196)
- SNAP-LDET-007: Merged state badge — [merged] magenta (ANSI 135) + merged_at timestamp
- SNAP-LDET-008: Queued state badge — [queued] yellow (ANSI 178) + queue position
- SNAP-LDET-009: Landing state badge — [landing] yellow (ANSI 178)
- SNAP-LDET-010: Target bookmark metadata — "→ main" cyan
- SNAP-LDET-011: Conflict clean — ✓ green
- SNAP-LDET-012: Conflict conflicted — ✗ red + file list
- SNAP-LDET-013: Conflict unknown — ? yellow
- SNAP-LDET-014: Tab bar with Overview active (default)
- SNAP-LDET-015: Tab bar with Changes tab active
- SNAP-LDET-016: Abbreviated tab labels at 80×24
- SNAP-LDET-017: Overview markdown body rendering
- SNAP-LDET-018: Overview empty body
- SNAP-LDET-019: Overview review summary section
- SNAP-LDET-020: Changes tab — ordered stack list
- SNAP-LDET-021: Changes tab — empty stack
- SNAP-LDET-022: Reviews tab — type badges (approved/changes_requested/commented)
- SNAP-LDET-023: Reviews tab — dismissed review
- SNAP-LDET-024: Reviews tab — empty state
- SNAP-LDET-025: Comments tab — grouped by file path
- SNAP-LDET-026: Comments tab — empty state
- SNAP-LDET-027: Diff tab — unified with file tree at 120×40
- SNAP-LDET-028: Diff tab — split mode at 120×40
- SNAP-LDET-029: Diff tab — no sidebar at 80×24
- SNAP-LDET-030: Loading state spinner
- SNAP-LDET-031: 404 error state
- SNAP-LDET-032: Network error state
- SNAP-LDET-033: Breadcrumb display
- SNAP-LDET-034: Status bar hints for Overview tab
- SNAP-LDET-035: Long title wrapping

### Keyboard Interaction Tests (48 tests)

- KEY-LDET-001–004: j/k scroll, G bottom, g g top, Ctrl+D/U page
- KEY-LDET-005–008: Tab/Shift+Tab cycling with wrap
- KEY-LDET-009: Number keys 1-5 jump to tabs
- KEY-LDET-010–012: h/l adjacent tab navigation, boundary no-ops
- KEY-LDET-013–014: j/k in Changes tab, Enter on change
- KEY-LDET-015–018: n/p in Reviews and Comments tabs, boundary behavior
- KEY-LDET-019–022: r review form (open, submit, cancel empty, cancel non-empty)
- KEY-LDET-023–024: c comment form (open, submit)
- KEY-LDET-025–026: d dismiss review (admin success, non-admin no-op)
- KEY-LDET-027–028: e edit form (open, submit)
- KEY-LDET-029–032: m merge (success, conflicts, closed, merged)
- KEY-LDET-033–036: x close/reopen (open→closed, closed→open, merged no-op, queued no-op)
- KEY-LDET-037–041: Diff tab keys (t toggle, t at 80×24, w whitespace, ]/[ files, Ctrl+B sidebar)
- KEY-LDET-042–045: R retry, q pop, ? help, : palette
- KEY-LDET-046: Tab preserves per-tab scroll position
- KEY-LDET-047: State toggle optimistic rollback on 500
- KEY-LDET-048: Merge optimistic rollback on 409

### Responsive Resize Tests (14 tests)

- RESIZE-LDET-001–003: Breakpoint transitions (120→80, 80→120, 120→200)
- RESIZE-LDET-004–005: Scroll position preserved (active tab, all tabs)
- RESIZE-LDET-006: Title rewrap on resize
- RESIZE-LDET-007: Rapid resize without artifacts
- RESIZE-LDET-008–009: Diff sidebar hide/show on breakpoint change
- RESIZE-LDET-010: Split diff falls back to unified at 80×24
- RESIZE-LDET-011: Form adapts to width
- RESIZE-LDET-012: Below minimum shows too-small message
- RESIZE-LDET-013: Restore from below-minimum
- RESIZE-LDET-014: Concurrent resize + tab switch

### Data Loading & Integration Tests (20 tests)

- DATA-LDET-001: 5 concurrent requests on mount
- DATA-LDET-002: Diff loads lazily on tab activation
- DATA-LDET-003–004: Review and comment pagination on scroll
- DATA-LDET-005: Pagination stops at 500 cap
- DATA-LDET-006: Cached data on re-navigation
- DATA-LDET-007–008: 404 and 401 handling
- DATA-LDET-009–013: Independent tab fetch failures (reviews, comments, changes, conflicts, diff)
- DATA-LDET-014–016: Optimistic persistence on success (state, review, comment)
- DATA-LDET-017: Merge 202 with queue position
- DATA-LDET-018: Rate limit (429) handling
- DATA-LDET-019: Server 500 on review submission (optimistic rollback)
- DATA-LDET-020: Tab-specific retry only retries affected endpoint

### Edge Case Tests (22 tests)

- EDGE-LDET-001: No auth token
- EDGE-LDET-002–003: Long title (500+), unicode/emoji
- EDGE-LDET-004–005: Body 100k+ truncation, review 50k+ truncation
- EDGE-LDET-006: Empty change_ids
- EDGE-LDET-007: All conflict statuses
- EDGE-LDET-008–009: Unknown review type, dismissed with empty body
- EDGE-LDET-010: Null body
- EDGE-LDET-011: Single change in stack
- EDGE-LDET-012: Rapid tab switching
- EDGE-LDET-013: Merge race condition
- EDGE-LDET-014–016: Long file paths, binary files, empty diff
- EDGE-LDET-017–018: Queued/landing state disables write actions
- EDGE-LDET-019: Rapid j/k (20×)
- EDGE-LDET-020: Read-only user write action no-ops
- EDGE-LDET-021: Landing number boundaries (1, 99999)
- EDGE-LDET-022: Concurrent web edit picked up on refresh

All 139 tests left failing if backend is unimplemented — never skipped or commented out.
