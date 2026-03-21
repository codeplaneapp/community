# TUI_LANDING_REVIEWS_VIEW

Specification for TUI_LANDING_REVIEWS_VIEW.

## High-Level User POV

The Landing Reviews View is a section within the landing request detail screen that displays all reviews submitted on a landing request. Landing requests in Codeplane are the jj-native equivalent of pull requests — they represent stacked changes proposed for landing into a target bookmark. Reviews are how collaborators provide feedback: approving the changes, requesting modifications, or leaving review comments. The reviews view surfaces these review decisions in a dense, scannable, keyboard-navigable layout optimized for terminal developers.

The reviews view appears as a dedicated panel within the landing detail screen, accessible by switching to the "Reviews" tab (keyboard `2` or `Tab` cycling). It is not a standalone screen — it is part of the landing detail view's tab system alongside the change stack, comments, checks, and conflict status panels. When the user navigates to a landing detail (via `Enter` from the landing list, `:landing 42`, or `codeplane tui --screen landings --repo owner/repo --landing 42`), the reviews tab is one of the available content sections.

The reviews view renders as a vertically scrollable list of review entries. Each review entry shows: a review type icon (✓ green for approve, ✗ red for request_changes, ● blue for comment, ○ gray for pending), the reviewer's username as `@username`, a relative timestamp, the review state (submitted or dismissed — dismissed reviews are visually struck through in muted color), and the review body rendered as markdown. Reviews are ordered chronologically (oldest first), matching the flow of the review conversation.

At the top of the reviews panel, a summary bar provides a quick read of the review status: "N reviews · M approved · P changes requested". This summary is derived from the loaded reviews, counting only submitted (non-dismissed) reviews by their latest type per unique reviewer. Below the summary, a horizontal separator introduces the review list.

Navigation within the reviews list uses `j`/`k` to move focus between review entries. Pressing `n` jumps to the next review and `p` to the previous one. When a review is focused, its body is visible and scrollable. Pressing `r` opens the review submission form (TUI_LANDING_REVIEW_FORM) for the current user to submit a new review. Pressing `d` on a focused review dismisses it (if the user has write access), showing a confirmation prompt. Pressing `q` or `Esc` pops back to the landing list or closes any open overlay.

At the minimum 80×24 terminal size, the reviews view collapses to show review type icon, reviewer username, and timestamp — the review body is only visible when the review is focused (expand on focus). At 120×40, the first 3 lines of each review body are visible inline. At 200×60, full review bodies render inline with generous spacing, and the summary bar includes additional detail such as the list of approving reviewers.

The reviews view supports page-based pagination (page size 20, memory cap 200 reviews). Additional pages load as the user scrolls past 80% of loaded content. For landing requests with protected bookmarks, the summary bar shows the required approval count alongside the current approval count: "2 of 3 required approvals".

## Acceptance Criteria

### Definition of Done
- [ ] The reviews view renders as a tab panel within the landing detail screen, activated by pressing `2` or cycling via `Tab`/`Shift+Tab`
- [ ] The breadcrumb reads "Dashboard > owner/repo > Landings > #N" (unchanged from landing detail — reviews is a tab, not a sub-screen)
- [ ] Reviews are fetched via `useLandingReviews(owner, repo, number)` from `@codeplane/ui-core`, calling `GET /api/repos/:owner/:repo/landings/:number/reviews?page=N&per_page=20`
- [ ] Reviews are displayed chronologically (oldest first) by `created_at`
- [ ] Each review entry displays: type icon, reviewer `@username`, relative `created_at` timestamp, review state (submitted/dismissed), and body (as markdown)
- [ ] The summary bar renders above the review list showing "N reviews · M approved · P changes requested"
- [ ] The summary bar counts only submitted (non-dismissed) reviews, using the latest review per unique reviewer
- [ ] Dismissed reviews render with strikethrough text styling and muted color
- [ ] The reviews tab shows a badge count of submitted reviews in the tab label: "Reviews (N)"
- [ ] An empty reviews state shows "No reviews yet. Press `r` to submit a review."
- [ ] Pressing `r` opens the review submission form (pushes TUI_LANDING_REVIEW_FORM)
- [ ] Pressing `d` on a focused review dismisses it (PATCH with dismiss) after confirmation
- [ ] The dismiss action is optimistic — the review state changes to "dismissed" immediately and reverts on server error

### Keyboard Interactions
- [ ] `j` / `Down`: Move focus to next review entry
- [ ] `k` / `Up`: Move focus to previous review entry
- [ ] `n`: Jump to next review entry (alias for `j` within reviews tab)
- [ ] `p`: Jump to previous review entry (alias for `k` within reviews tab)
- [ ] `Enter`: Expand/collapse focused review body (at compact sizes where body is hidden)
- [ ] `G`: Jump to last loaded review
- [ ] `g g`: Jump to first review
- [ ] `Ctrl+D` / `Ctrl+U`: Page down / page up within reviews
- [ ] `r`: Open review submission form
- [ ] `d`: Dismiss focused review (with confirmation dialog)
- [ ] `R`: Retry failed API request (only in error state)
- [ ] `Tab` / `Shift+Tab`: Cycle to next/previous landing detail tab
- [ ] `1`–`9`: Jump to landing detail tab by number
- [ ] `q`: Pop landing detail view (when no overlay is open)
- [ ] `Esc`: Close overlay → pop screen (priority chain)
- [ ] `?`: Toggle help overlay
- [ ] `:`: Open command palette

### Responsive Behavior
- [ ] Below 80×24: "Terminal too small" handled by router
- [ ] 80×24 – 119×39: Summary bar (1 line), review rows show icon (2ch) + `@username` (12ch) + timestamp (4ch). Review body hidden by default, expand on `Enter`. Tab bar uses abbreviated labels
- [ ] 120×40 – 199×59: Summary bar (1 line), review rows show icon (2ch) + `@username` (15ch) + type label (16ch) + timestamp (8ch). First 3 lines of body visible inline. Full tab bar labels
- [ ] 200×60+: Summary bar (1 line) with approver names listed. Review rows show full icon + username (20ch) + type label + state badge + full timestamp. Full body visible inline with generous spacing

### Truncation & Boundary Constraints
- [ ] Reviewer username: truncated at 12ch (minimum) / 15ch (standard) / 20ch (large) with `…`
- [ ] Review body: rendered as `<markdown>`, truncated to 3 lines (standard) or full (large) inline; full body on expand
- [ ] Review body maximum rendering length: 50,000 characters; truncated beyond that with "Review body truncated. View full review on web."
- [ ] Summary bar text: truncated if total text exceeds available width; priority: review count > approved count > changes requested count
- [ ] Type label: "Approved" (8ch), "Changes requested" (17ch), "Comment" (7ch), "Pending" (7ch) — at minimum size, icon only
- [ ] Relative timestamps: max 8ch standard ("2h ago"), max 4ch minimum ("2h")
- [ ] Tab label: "Reviews (N)" — N abbreviated as "99+" above 99
- [ ] Memory cap: 200 reviews max loaded
- [ ] Total count: abbreviated above 9999 (e.g., "10K")

### Edge Cases
- [ ] Terminal resize while reviews are loaded: focus preserved, layout recalculates
- [ ] Rapid j/k: sequential, no debounce, one review per keypress
- [ ] Dismiss 403 (no permission): optimistic reverts, status bar error "Permission denied"
- [ ] Dismiss on already-dismissed review: no-op, status bar flash "Review already dismissed"
- [ ] Unicode in review body: truncation respects grapheme clusters; markdown renders correctly
- [ ] Null review body: renders as empty (no "null" text), icon + username + timestamp still visible
- [ ] Review with empty body and type "approve": renders as approval icon with no body section
- [ ] Single review in list: focus highlight and navigation still functional
- [ ] 200+ reviews: pagination cap, footer shows "Showing 200 of N reviews"
- [ ] Network disconnect mid-pagination: error state for that page, previously loaded reviews retained
- [ ] All reviews dismissed: summary bar shows "N reviews · 0 approved · 0 changes requested"; dismissed reviews still visible in list
- [ ] Mixed review types from same reviewer: summary counts only the latest submitted review per reviewer
- [ ] Landing request not found (404): full error screen with "Landing request #N not found"
- [ ] Review submitted by deleted user: `@username` renders normally (server resolves username at creation time)
- [ ] Protected bookmark with required approvals: summary bar shows "M of K required approvals"
- [ ] Tab switch while reviews are loading: loading state preserved, no double-fetch
- [ ] Rapid `d` presses on same review: idempotent, first dismiss wins, subsequent no-op

## Design

### Layout Structure

At standard (120×40) terminal size, within the landing detail tab content area:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Landings > #37                                                                     │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [Stack] [Reviews (3)] [Comments] [Checks] [Conflicts]                                                               │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3 reviews · 2 approved · 1 changes requested                                                                        │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ✓ @alice   Approved                                                                              2h ago             │
│                                                                                                                      │
│ ✗ @bob     Changes requested                                                                     1d ago             │
│   The error handling in the SSE reconnection path needs a                                                            │
│   `close()` call before re-creating the EventSource.                                                                 │
│   Please also add a test for the cleanup behavior.                                                                   │
│                                                                                                                      │
│ ✓ @carol   Approved                                                                              3h ago             │
│   LGTM — the fix looks correct and the test coverage is                                                              │
│   good.                                                                                                              │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ j/k:navigate  r:review  d:dismiss  n/p:jump  Tab:tab  q:back                                                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

At minimum (80×24):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Header: …/repo > Landings > #37                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│ [Stk] [Rev(3)] [Cmt] [Chk] [Con]                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ 3 reviews · 2 approved · 1 chg req                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ ✓ @alice       2h                                                           │
│ ✗ @bob         1d                                                           │
│ ✓ @carol       3h                                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ j/k:nav r:review d:dismiss q:back                                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Components Used
- `<box>` — Vertical/horizontal flexbox containers for layout, summary bar, review rows, tab bar
- `<scrollbox>` — Scrollable review list with scroll-to-end pagination detection at 80%
- `<text>` — Reviewer usernames, timestamps, type labels, summary counts, state badges
- `<markdown>` — Review body rendering with full markdown support

### ReviewEntry

Review type icon and color mapping:
- Approve: ✓ green (ANSI 34)
- Request changes: ✗ red (ANSI 196)
- Comment: ● blue (ANSI 33)
- Pending: ○ gray (ANSI 245)

Review state visual treatment:
- Submitted: normal text rendering
- Dismissed: type label and body in muted color (ANSI 245) with strikethrough attribute; icon color dimmed to gray

Focused review row uses reverse video with primary accent (ANSI 33).

### Summary Bar

Single-line bar above review list. At minimum: "N reviews · M approved · P chg req". At standard: "N reviews · M approved · P changes requested". At large: includes reviewer names and required approvals. Required approvals shown as "M of K required approvals ✓" (green when met) or "M of K required approvals …" (yellow when unmet).

### Dismiss Confirmation Dialog

Centered modal overlay: "Dismiss review by @username?" with description of action. `Enter` confirms, `Esc` cancels. Focus trapped within dialog.

### Keybindings

| Key | Action | Condition |
|-----|--------|----------|
| `j`/`Down` | Next review | Reviews tab active, list focused |
| `k`/`Up` | Previous review | Reviews tab active, list focused |
| `n` | Next review | Reviews tab active, list focused |
| `p` | Previous review | Reviews tab active, list focused |
| `Enter` | Expand/collapse body | Minimum size, review focused |
| `G` | Last review | List focused |
| `g g` | First review | List focused |
| `Ctrl+D`/`Ctrl+U` | Page down/up | List focused |
| `r` | Open review form | Reviews tab active |
| `d` | Dismiss review | Review focused, write access |
| `R` | Retry | Error state |
| `Tab`/`Shift+Tab` | Cycle tabs | Landing detail |
| `1`–`9` | Jump to tab | Landing detail |
| `q` | Pop screen | No overlay |
| `Esc` | Close overlay → pop | Priority chain |
| `?` | Help overlay | Any |
| `:` | Command palette | Any |

### Data Hooks
- `useLandingReviews(owner, repo, number)` from `@codeplane/ui-core` → `GET /api/repos/:owner/:repo/landings/:number/reviews?page=N&per_page=20`
- `useDismissLandingReview(owner, repo, number, reviewId)` from `@codeplane/ui-core` → `PATCH /api/repos/:owner/:repo/landings/:number/reviews/:review_id`
- `useLanding(owner, repo, number)` from `@codeplane/ui-core` → landing detail data for required approvals context
- `useTerminalDimensions()`, `useOnResize()`, `useKeyboard()` from `@opentui/react`
- `useNavigation()`, `useStatusBarHints()`, `useRepoContext()` from local TUI

### Pagination

Page-based pagination using `page` and `per_page` query parameters. `X-Total-Count` provides total. Page size 20. Memory cap 200. Scroll-to-end at 80% triggers next page.

### Optimistic UI
- Dismiss: review state → "dismissed" immediately; reverts on server error with status bar toast
- Submit (via form): new review appends immediately; replaced with server response on success; removed on failure

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Write | Admin |
|--------|-----------|-----------|-------|-------|
| View reviews (public repo) | ✅ | ✅ | ✅ | ✅ |
| View reviews (private repo) | ❌ | ✅ | ✅ | ✅ |
| Submit review | ❌ | ❌ | ✅ | ✅ |
| Dismiss review | ❌ | ❌ | ✅ | ✅ |

- The reviews view is a tab within the landing detail, which requires read access to the repository. Repository visibility is server-enforced.
- `GET /api/repos/:owner/:repo/landings/:number/reviews` respects repository visibility: public repos accessible to all authenticated users; private repos require read access.
- Submit review (`POST`) requires write access. Read-only users see the `r` keybinding hint but receive "Permission denied" on action.
- Dismiss review (`PATCH`) requires write access. The TUI does not show the `d` keybinding hint for read-only users.
- A user cannot dismiss their own review — server-enforced. TUI shows "Cannot dismiss your own review" if attempted.

### Token-based Auth
- Token loaded from CLI keychain or `CODEPLANE_TOKEN` env var at bootstrap
- Passed as `Bearer` token in `Authorization` header via `@codeplane/ui-core` API client
- Never displayed, logged, or included in error messages
- 401 responses propagate to auth error screen

### Rate Limiting
- 300 req/min for GET reviews
- 60 req/min for PATCH (dismiss)
- 429 responses show inline "Rate limited. Retry in {Retry-After}s."
- No auto-retry; user presses `R` after waiting

### Input Sanitization
- Review bodies rendered as markdown via `<markdown>` — no injection vector in terminal
- Reviewer usernames rendered as plain `<text>`
- Dismiss dialog uses fixed text; only review ID reaches API
- All state/type values from API response enum

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.landing_reviews.viewed` | Reviews tab activated with data loaded | `repo`, `landing_number`, `total_reviews`, `approved_count`, `changes_requested_count`, `comment_count`, `pending_count`, `dismissed_count`, `required_approvals`, `terminal_width`, `terminal_height`, `breakpoint`, `load_time_ms` |
| `tui.landing_reviews.review_focused` | Focus moves to a review entry | `repo`, `landing_number`, `review_id`, `review_type`, `reviewer_login`, `position_in_list` |
| `tui.landing_reviews.review_expanded` | Enter pressed to expand body (compact) | `repo`, `landing_number`, `review_id`, `review_body_length` |
| `tui.landing_reviews.submit_initiated` | Press r to open form | `repo`, `landing_number`, `current_review_count` |
| `tui.landing_reviews.dismiss_initiated` | Press d on focused review | `repo`, `landing_number`, `review_id`, `review_type`, `reviewer_login` |
| `tui.landing_reviews.dismiss_confirmed` | Confirm dismiss | `repo`, `landing_number`, `review_id`, `success` |
| `tui.landing_reviews.dismiss_cancelled` | Cancel dismiss | `repo`, `landing_number`, `review_id` |
| `tui.landing_reviews.paginate` | Next page loaded | `repo`, `landing_number`, `page_number`, `items_loaded_total`, `total_count` |
| `tui.landing_reviews.error` | API failure | `repo`, `landing_number`, `error_type`, `http_status`, `request_type` |
| `tui.landing_reviews.retry` | Press R | `repo`, `landing_number`, `error_type`, `retry_success` |
| `tui.landing_reviews.empty` | Empty state shown | `repo`, `landing_number` |
| `tui.landing_reviews.data_load_time` | Reviews loaded | `repo`, `landing_number`, `reviews_ms`, `total_ms` |
| `tui.landing_reviews.tab_switched` | Tab change | `repo`, `landing_number`, `from_tab`, `to_tab` |

### Common Properties (all events)
- `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `breakpoint`

### Success Indicators

| Metric | Target |
|--------|--------|
| Reviews tab render rate | >98% of landing detail views |
| Review focus navigation | >50% of views with 2+ reviews |
| Review submit initiation | >15% of views by write-access users |
| Dismiss action rate | >5% of views by write-access users |
| Body expand usage (compact) | >40% of compact views with review bodies |
| Error rate | <2% |
| Retry success | >80% |
| Time to interactive | <1.5s |
| Pagination usage | >20% of views with 20+ reviews |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Tab activated | `LandingReviews: mounted [repo={r}] [landing={n}] [width={w}] [height={h}] [breakpoint={bp}]` |
| `debug` | Reviews loaded | `LandingReviews: loaded [repo={r}] [landing={n}] [count={c}] [total={t}] [duration={ms}ms]` |
| `debug` | Focus moved | `LandingReviews: focus [repo={r}] [landing={n}] [review_id={id}] [position={i}]` |
| `debug` | Body expanded | `LandingReviews: expanded [repo={r}] [landing={n}] [review_id={id}]` |
| `debug` | Pagination triggered | `LandingReviews: pagination [repo={r}] [landing={n}] [page={p}]` |
| `info` | Reviews fully loaded | `LandingReviews: ready [repo={r}] [landing={n}] [reviews={n}] [total_ms={ms}]` |
| `info` | Dismiss confirmed | `LandingReviews: dismissed [repo={r}] [landing={n}] [review_id={id}] [success={bool}]` |
| `info` | Review form opened | `LandingReviews: review form opened [repo={r}] [landing={n}]` |
| `warn` | Fetch failed | `LandingReviews: fetch failed [repo={r}] [landing={n}] [status={code}] [error={msg}]` |
| `warn` | Rate limited | `LandingReviews: rate limited [repo={r}] [landing={n}] [retry_after={s}]` |
| `warn` | Dismiss failed | `LandingReviews: dismiss failed [repo={r}] [landing={n}] [review_id={id}] [status={code}]` |
| `warn` | Slow load (>3s) | `LandingReviews: slow load [repo={r}] [landing={n}] [duration={ms}ms]` |
| `warn` | Pagination cap | `LandingReviews: pagination cap [repo={r}] [landing={n}] [total={n}] [cap=200]` |
| `error` | Auth error | `LandingReviews: auth error [repo={r}] [landing={n}] [status=401]` |
| `error` | Permission denied | `LandingReviews: permission denied [repo={r}] [landing={n}] [action={a}]` |
| `error` | Render error | `LandingReviews: render error [repo={r}] [landing={n}] [error={msg}]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### TUI-Specific Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Resize during reviews load | Layout re-renders; fetch continues | Independent |
| Resize collapses review bodies | Bodies hidden, expand via Enter | User presses Enter |
| SSE disconnect while on reviews | Status bar indicator; reviews are REST-based, unaffected | SSE provider reconnects |
| Auth expiry while viewing | Next API call → 401 → auth error screen | Re-auth via CLI |
| Network timeout (30s) | Loading → error + "Press R" | User retries |
| Dismiss 403 | Optimistic reverts; status bar "Permission denied" | Informational |
| Dismiss 404 | Optimistic reverts; status bar "Review not found" | User refreshes |
| Dismiss on own review | Status bar "Cannot dismiss your own review" | Informational |
| Tab switch during loading | Loading preserved; returns to state on tab-back | No action |
| Rapid d presses | First dismiss wins; dialog prevents double-action | Dialog enforces single action |
| Landing 404 | Full error screen | User navigates away |
| No color support | Text markers [A]/[X]/[C]/[P] replace icons | Theme detection |
| Memory cap (200) | Stop pagination; show cap message | Client-side cap |
| Malformed markdown | Best-effort render; falls back to plain text | No action |
| Very long body (50k+) | Truncated with notice | View on web |

### Failure Modes
- Component crash → global error boundary → "Press r to restart"
- Reviews fetch fails → error state within reviews tab; other tabs still work
- Dismiss API fails → optimistic revert + status bar error flash
- Slow network → "Loading reviews…" shown; user can switch tabs or navigate away
- All API fails → error state; tab switching and go-to/palette still work

## Verification

### Test File: `e2e/tui/landings.test.ts`

### Terminal Snapshot Tests (25 tests)

- SNAP-LREV-001: Reviews tab at 120×40 with 3 reviews (approve, request_changes, approve) — full layout, summary bar, icons, type labels, 3-line body previews
- SNAP-LREV-002: Reviews tab at 80×24 minimum — icon + username + timestamp only, bodies hidden
- SNAP-LREV-003: Reviews tab at 200×60 large — full bodies inline, approver names in summary
- SNAP-LREV-004: Empty reviews state — "No reviews yet. Press r to submit a review."
- SNAP-LREV-005: Loading state — "Loading reviews…" with spinner
- SNAP-LREV-006: Error state — red error with "Press R to retry."
- SNAP-LREV-007: Focused review highlight — reverse video primary accent (ANSI 33)
- SNAP-LREV-008: Approve review icon — ✓ green (ANSI 34)
- SNAP-LREV-009: Request changes icon — ✗ red (ANSI 196)
- SNAP-LREV-010: Comment review icon — ● blue (ANSI 33)
- SNAP-LREV-011: Pending review icon — ○ gray (ANSI 245)
- SNAP-LREV-012: Dismissed review styling — strikethrough, muted, dimmed icon
- SNAP-LREV-013: Summary bar with counts — "3 reviews · 2 approved · 1 changes requested"
- SNAP-LREV-014: Summary bar required approvals met — "2 of 2 required approvals ✓" green
- SNAP-LREV-015: Summary bar required approvals unmet — "1 of 3 required approvals …" yellow
- SNAP-LREV-016: Summary bar minimum size abbreviated — "3 reviews · 2 approved · 1 chg req"
- SNAP-LREV-017: Summary bar large with names — "2 approved (alice, carol) · 1 changes requested (bob)"
- SNAP-LREV-018: Review body markdown rendering
- SNAP-LREV-019: Approve with no body — icon + username + type + timestamp only
- SNAP-LREV-020: Tab bar with review count badge — "Reviews (5)"
- SNAP-LREV-021: Dismiss confirmation dialog — centered modal
- SNAP-LREV-022: Breadcrumb unchanged from landing detail
- SNAP-LREV-023: Status bar hints — "j/k:navigate r:review d:dismiss n/p:jump Tab:tab q:back"
- SNAP-LREV-024: Expanded body at compact size (80×24)
- SNAP-LREV-025: Pagination loading indicator

### Keyboard Interaction Tests (35 tests)

- KEY-LREV-001–005: j/k/Down/Up navigation, boundary behavior
- KEY-LREV-006–007: n/p jump aliases
- KEY-LREV-008–009: G (last), g g (first)
- KEY-LREV-010–011: Ctrl+D page down, Ctrl+U page up
- KEY-LREV-012–014: Enter expand/collapse at compact, no-op at standard+
- KEY-LREV-015: r opens review form
- KEY-LREV-016–022: d dismiss flow (dialog, confirm, cancel, no access, already dismissed, 403 revert, 500 revert)
- KEY-LREV-023–024: R retry (error state, no-op when loaded)
- KEY-LREV-025–027: Tab/Shift+Tab cycling, number key tab jump
- KEY-LREV-028: q pops screen
- KEY-LREV-029–031: Esc closes dialog, ? help, : palette
- KEY-LREV-032: Rapid j presses (10× sequential)
- KEY-LREV-033: Pagination on scroll to 80%
- KEY-LREV-034: Tab switch while loading
- KEY-LREV-035: Rapid d presses (idempotent)

### Responsive Tests (12 tests)

- RESP-LREV-001–003: Layout at 80×24, 120×40, 200×60
- RESP-LREV-004–006: Resize between breakpoints (collapse/expand bodies, summary names)
- RESP-LREV-007: Focus preserved through resize
- RESP-LREV-008: Summary bar adapts to width
- RESP-LREV-009: Tab bar abbreviation at minimum
- RESP-LREV-010: Expanded body survives resize
- RESP-LREV-011: Resize during loading
- RESP-LREV-012: Below minimum shows too-small

### Integration Tests (16 tests)

- INT-LREV-001–003: Auth expiry, rate limit, network error
- INT-LREV-004–005: Pagination complete, pagination cap (200)
- INT-LREV-006: Navigation round-trip preserves tab state
- INT-LREV-007: Server 500 → retry
- INT-LREV-008–009: Dismiss optimistic persist on 200, revert on failure
- INT-LREV-010: Review submission returns and list refreshes
- INT-LREV-011–012: Protected bookmark required approvals (unmet/met)
- INT-LREV-013: Landing 404
- INT-LREV-014: Concurrent loading with landing detail
- INT-LREV-015: Deep link to landing with reviews
- INT-LREV-016: Concurrent tab switches

### Edge Case Tests (14 tests)

- EDGE-LREV-001: No auth token
- EDGE-LREV-002: Long username (39 chars)
- EDGE-LREV-003: Unicode/emoji in body
- EDGE-LREV-004: Single review
- EDGE-LREV-005: Body 50k+ chars truncation
- EDGE-LREV-006: All pending reviews
- EDGE-LREV-007: Same reviewer multiple reviews (latest type counted)
- EDGE-LREV-008: Username with special characters
- EDGE-LREV-009: Concurrent resize + navigation
- EDGE-LREV-010: Mixed dismissed and submitted
- EDGE-LREV-011: Dismiss dialog during resize
- EDGE-LREV-012: Network disconnect mid-pagination
- EDGE-LREV-013: Null body approve
- EDGE-LREV-014: Tab badge 100+ reviews shows "99+"

All 102 tests left failing if backend is unimplemented — never skipped or commented out.
